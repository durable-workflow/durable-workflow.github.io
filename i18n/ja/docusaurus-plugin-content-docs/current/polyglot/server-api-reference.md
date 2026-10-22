---
sidebar_position: 3
title: Server API リファレンス
description: Durable Workflow Server のコントロールプレーン、Worker プレーン、名前空間、ストレージ、スケジュール、システム各エンドポイントの HTTP リファレンス。
tags:
  - server
  - API
  - reference
  - control-plane
keywords:
  - Durable Workflow Server API
  - コントロールプレーンバージョンヘッダー
  - Worker プロトコルエンドポイント
  - 外部ペイロードストレージ API
---

# Server API リファレンス {#server-api-reference}

スタンドアロン Server はバージョン付き HTTP+JSON API を公開します。Server を直接呼ぶ SDK、スクリプト、ブリッジアダプター、運用手順書を作るときに、このページを使います。デプロイと設定は [Server ガイド](/docs/polyglot/server)、`dw` を呼ぶ場合は [CLI コマンドリファレンス](/docs/polyglot/cli-reference)を使ってください。

## ヘッダーとバージョニング {#headers-and-versioning}

Server に別の認証ドライバーが設定されていない限り、認証するすべてのリクエストは Bearer トークンを使います。

```http
Authorization: Bearer <token>
X-Namespace: default
Content-Type: application/json
Accept: application/json
```

コントロールプレーンルートには次が必要です。

```http
X-Durable-Workflow-Control-Plane-Version: 2
```

Worker プレーンルートには次が必要です。

```http
X-Durable-Workflow-Protocol-Version: 1.0
```

Server は `GET /api/cluster/info` から対応バージョンと機械可読契約を公開します。長時間動く自動化の開始前にそこでバージョンを検出するべきです。欠落または未対応のコントロールプレーンバージョンは、`missing_control_plane_version`、`unsupported_control_plane_version` など名前付き理由で安全側に失敗します。

検証、コード生成、ずれの検査には、この文章リファレンスではなく規範的な[プラットフォームプロトコル仕様](/docs/platform-protocol-specs)カタログを使います。コントロールプレーン OpenAPI、Worker プロトコルの OpenAPI と AsyncAPI、`cluster_info` JSON Schema、関連する MCP、履歴、Waterline、修復・対処可能性のスキーマへリンクしています。

## ディスカバリーとヘルス {#discovery-and-health}

ロードバランサー、SDK ブートストラップ、互換性検査は次のルートを使います。

| メソッド | パス | 認証 | 用途 |
| --- | --- | --- | --- |
| `GET` | `/api/health` | 不要 | 生存確認と応答ノードの機械可読トポロジー概要。 |
| `GET` | `/api/ready` | 不要 | 準備状態の確認、同じトポロジー概要、ロールアウト安全性のブートストラップ検査。 |
| `GET` | `/api/cluster/info` | 必要 | Server ID、対応 SDK 範囲、ロールトポロジー、調整ヘルス概要、コントロールプレーン・Worker プロトコル契約、ペイロードコーデック、機能。 |

例:

<!-- docs-example id="server.cluster-info.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/cluster/info" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" | jq '.control_plane.version, .worker_protocol.version'
```

`/api/cluster/info` は対応バージョンを広告するエンドポイントなので、意図的にコントロールプレーンバージョンヘッダーを要求しません。同じレスポンスは `coordination_health` も含み、Server の準備状態に使われる検査を反映する、全名前空間のロールアウトと準備状態の概要を返します。

### 公開トポロジー概要 {#public-topology-summary}

`GET /api/health` と `GET /api/ready` は両方とも、実装済みのヘルス概要契約による最上位の `topology` オブジェクトを返します。コントロールプレーン認証、名前空間解決、広範な `/api/cluster/info` ディスカバリーが成功する前に、どのノードがプローブに答えたかを特定する場合に使います。

公開概要は必ず次を含みます。

- `topology.schema`
- `topology.version`
- `topology.current_shape`
- `topology.current_process_class`
- `topology.current_roles`
- `topology.execution_mode`
- `topology.matching_role.queue_wake_enabled`
- `topology.matching_role.shape`
- `topology.matching_role.wake_owner`
- `topology.matching_role.task_dispatch_mode`
- `topology.matching_role.partition_primitives`
- `topology.matching_role.backpressure_model`
- `topology.matching_role.discovery_limits.poll_batch_cap`
- `topology.matching_role.discovery_limits.availability_ceiling_seconds`
- `topology.matching_role.discovery_limits.wake_signal_ttl_seconds`
- `topology.matching_role.discovery_limits.workflow_task_lease_seconds`
- `topology.matching_role.discovery_limits.activity_task_lease_seconds`

`topology.matching_role.discovery_limits` は固定されたマッチングロールの数値契約です。`poll_batch_cap` はポーリング1回で返す実行可能タスク行の最大バッチ、`availability_ceiling_seconds` は利用可能になったばかりのタスクが1秒未満の時刻ずれを許容できるよう `available_at` に適用するバックエンド間の許容幅、`wake_signal_ttl_seconds` は既定の `CacheLongPollWakeStore` シグナル TTL、`workflow_task_lease_seconds` / `activity_task_lease_seconds` はワークフロー・アクティビティの既定タスクリース期間です。Worker と下流ツールはこれらをマッチングロールの正本契約として読むため、値を厳しくすることはプロトコルレベルの変更で、フィールド名の変更も破壊的変更です。

最上位の準備状態 `status` が `not_ready` でも `/api/ready` は同じ `topology` を返すため、ブートストラップの阻害要因がある間も `server_http_node`、`scheduler_node`、`matching_node`、`execution_node` の応答を区別できます。

例:

<!-- docs-example id="server.health.topology.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/health" | jq '{
  status,
  topology: {
    schema: .topology.schema,
    version: .topology.version,
    current_shape: .topology.current_shape,
    current_process_class: .topology.current_process_class,
    current_roles: .topology.current_roles,
    execution_mode: .topology.execution_mode,
    matching_role: .topology.matching_role
  }
}'
```

### 準備状態の阻害要因 {#readiness-blockers}

`GET /api/ready` は最上位の `status` と機械可読の `checks` を返します。2つの検査が、Server がロールアウト安全性ヘルスを安全に評価できるかを定義します。

- `checks.migrations` はブートストラップ・移行の制限。`repository_exists`、`pending_migrations`、`adoptable_migrations`、`blocking_migrations`、`missing_tables`、`operator_surface`、`readiness_contract` を公開する。
- `adoptable_migrations` は、既存のワークフローテーブルに移行履歴の取り込みだけが必要なことを意味する。Server は準備完了を保ち `status: "warning"` を返し、運用担当者は次の移行処理前に取り込みを予定できる。
- `blocking_migrations` はロールアウト安全性の移行レコードがまだ必要なことを意味する。Server は最新の状態を装わず、`status: "pending"` と `remediation` 文字列で安全側に失敗する。
- `operator_surface.available` と `operator_surface.required_tables` は、起動後にロールアウト安全性を説明するための永続テーブルを v2 運用サーフェスが持つかを示す。
- `readiness_contract.version` は、スクリプトがこれらを解析する際に想定するインストール・取り込み契約リビジョンを固定する。
- `checks.workflow_v2` は全名前空間のロールアウト安全性判定を反映する。準備の前提が欠ける場合、健全な Worker 群を装わず `status: "blocked"` と `blocked_by`、`message`、`remediation` を返す。

例:

<!-- docs-example id="server.ready.blockers.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/ready" | jq '{
  status,
  migrations: {
    status: .checks.migrations.status,
    adoptable_migrations: .checks.migrations.adoptable_migrations,
    blocking_migrations: (.checks.migrations.blocking_migrations | map(.migration)),
    missing_tables: .checks.migrations.missing_tables,
    operator_surface: .checks.migrations.operator_surface,
    readiness_contract: .checks.migrations.readiness_contract
  },
  workflow_v2: {
    status: .checks.workflow_v2.status,
    blocked_by: .checks.workflow_v2.blocked_by,
    remediation: .checks.workflow_v2.remediation
  }
}'
```

### クラスタートポロジーマニフェスト {#cluster-topology-manifest}

`/api/cluster/info` はスキーマ `durable-workflow.v2.role-topology` のノードの `topology` マニフェストも返します。ノードが現在 `standalone_server`、`embedded`、`split_control_execution` のどれとして動くか、所有するロール、Server が `matching_role`、`shape_assignments`、`authority_boundaries`、`failure_domains`、`scaling_boundaries`、`migration_path` に期待する内容を検出する、対応する方法です。同じレスポンスはそのノードのライブなロールアウト安全性状態も公開します。

次のように読みます。

- `topology.current_shape`、`topology.current_process_class`、`topology.current_roles`、`topology.execution_mode` は実際に提供しているロール構成を示す。全 Worker 群ではなく応答ノードを説明する。
- `topology.role_vocabulary` は有効な v2 ロール名の固定リスト。
- `topology.matching_role.queue_wake_enabled`、`topology.matching_role.shape`、`topology.matching_role.wake_owner`、`topology.matching_role.task_dispatch_mode`、`topology.matching_role.partition_primitives`、`topology.matching_role.backpressure_model` は、広範な実行可能タスク検出が Worker 内か専用マッチング走査か、走査の所有プロセス、固定ルーティング軸、現在の v2 が強制する永続受け入れ境界を示す。
- `topology.matching_role.discovery_limits` は固定数値契約 `poll_batch_cap`、`availability_ceiling_seconds`、`wake_signal_ttl_seconds`、`workflow_task_lease_seconds`、`activity_task_lease_seconds` を公開する。文書化された契約との一致を検証するために使う。パッケージは `dw server:info`、運用メトリクススナップショット、名前空間スコープのヘルスに同じ識別子を出力する。
- `topology.role_catalog` と `topology.authority_surfaces` は、応答ノードで自動化が期待するインターフェース、永続書き込みサーフェス、読み取り経路にロール名を対応付ける。
- `topology.shape_assignments` は各対応構成の機械可読プロセスクラス一覧。応答ノードを文書化されたプロセスクラスに対応付ける際、現在のロールの組をこの表と比較する。
- `topology.supported_topologies` は製品が対応するデプロイの系統と、各系統が期待するノードクラスを要約する。
- `coordination_health` は Worker 群全体のロールアウト・互換性リスクを1つの機械可読ブロックに要約する。`status`、`http_status` に加え、移行不足やデータベース到達性など上流準備問題で評価がブロックされた場合、`blocked_by`、`message`、`remediation` を公開できる。
- `coordination_health.checks[]` は、`worker_compatibility`、`task_transport`、`routing_health`、`durable_resume_paths`、プロジェクション・スケジューラー検査と並び、固定された `activity_path` を必ず含む。`activity_path` は `task_transport` のアクティビティ側で、強制されないまま schedule-to-start、start-to-close、schedule-to-close、ハートビート期限が過ぎた実行（`timeout_overdue`、`oldest_timeout_overdue_at`、`max_timeout_overdue_age_ms`）と、継続する再試行バックログ（`retrying`、`oldest_retrying_started_at`、`max_retrying_age_ms`）を示す。検査名の変更はプロトコルレベルの変更。
- `coordination_health.routing_drains` は名前空間とキューを横断してドレイン中 build-id コホートを要約する。`queues_with_drains` と各キューの `build_ids` で、どのドレイン中 Worker から意図的にトラフィックを遠ざけているか確認できる。
- `execution_mode` は `local_queue_worker` の組み込み実行と `remote_worker_protocol` の Worker プロトコル実行を区別する。
- `split_control_execution` は対応する製品トポロジーであり、2つ目の Server 製品や別 API ではない。

例:

<!-- docs-example id="server.cluster-info.topology.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/cluster/info" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  | jq '{
    current_shape: .topology.current_shape,
    current_roles: .topology.current_roles,
    execution_mode: .topology.execution_mode,
    matching_role: .topology.matching_role,
    coordination_health: {
      status: .coordination_health.status,
      http_status: .coordination_health.http_status,
      blocked_by: .coordination_health.blocked_by,
      queues_with_drains: .coordination_health.routing_drains.queues_with_drains
    }
  }'
```

ロールの語彙と移行経路を含む概念上の契約は [Server ロールのトポロジー](/docs/polyglot/server-role-topology)を参照してください。

### 誤ったノードへのトポロジー拒否 {#wrong-node-topology-rejections}

認証されたホスト型ルートは、応答ノードがエンドポイントに必要な HTTP 制御サーフェスをホストしない場合、安全側に失敗します。この制限はロール・プロトコルバージョン検証後、名前空間解決の前に実行され、誤ったノードへの要求から名前空間の存在を漏らしません。

ブロック時、Server は `503`、`reason: "topology_role_unavailable"` と次を返します。

- `current_shape`: 応答ノードが広告したトポロジー構成。
- `current_process_class`: `scheduler_node`、`execution_node` など宣言されたプロセスクラス。
- `current_roles`: 実際にホストするロール。
- `required_roles`: エンドポイントに必要なホスト型ルートのロール。
- `missing_roles`: 応答ノードに欠けている `required_roles` の部分集合。

コントロールプレーンルートはこのペイロードをコントロールプレーンエンベロープで返します。Worker プロトコルルートは同じフィールドを Worker プロトコルエンベロープで返し、通常のバージョンヘッダーを保持します。

要求がスケジューラー専用ノードへ届いた場合の `GET /api/workflows` の誤ノード応答例:

```json
{
  "reason": "topology_role_unavailable",
  "message": "This node does not host the topology roles required for this endpoint.",
  "current_shape": "standalone_server",
  "current_process_class": "scheduler_node",
  "current_roles": ["scheduler"],
  "required_roles": ["api_ingress", "control_plane"],
  "missing_roles": ["api_ingress", "control_plane"]
}
```

現在の HTTP 制御サーフェスをホストしないノードでも、`GET /api/health`、`GET /api/ready`、認証付きの `GET /api/cluster/info` は生存確認とディスカバリーに利用できます。

### ワークフローブートストラップの制限 {#workflow-bootstrap-gate}

workflow v2 トラフィックを変更・提供する認証付きルートは、応答ノードの `checks.workflow_v2.status` が `blocked` の場合も安全側に失敗します。ロール・プロトコルバージョン検証後、名前空間解決前に実行され、ブロック中のロールアウトで送られた要求は名前空間の存在を観測しません。

制限にかかると、Server は `503`、`reason: "workflow_v2_blocked"` と次を返します。

- `blocked_by`: workflow v2 の安全な提供を妨げる、`migrations` などの上流準備阻害要因の順序付きリスト。
- `remediation`: 列挙した阻害要因を解消する短い運用向け手順。`/api/ready` の `checks.workflow_v2.remediation` と同じ内容。

ブートストラップ制限の対象ルート群:

- **ワークフローの開始と変更:** 開始、説明、コマンド、実行指定コマンドの全 `/api/workflows` ルート。たとえば `POST /api/workflows`、`POST /api/workflows/{workflowId}/signal/{signalName}`、`POST /api/workflows/{workflowId}/runs/{runId}/cancel`。
- **スケジュール変更:** `POST /api/schedules`、`PUT /api/schedules/{scheduleId}`、`DELETE /api/schedules/{scheduleId}`、`POST /api/schedules/{scheduleId}/pause`、`POST /api/schedules/{scheduleId}/resume`、`POST /api/schedules/{scheduleId}/trigger`、`POST /api/schedules/{scheduleId}/backfill`。
- **ブリッジアダプター:** `POST /api/bridge-adapters/webhook/{adapter}`。
- **Worker プロトコル:** 登録、ハートビート、ワークフロー・クエリ・アクティビティタスクの poll/complete/fail/heartbeat を含む、すべての `/api/worker` と `/api/worker/*` ルート。

スケジュールの**読み取り**は、復旧中に状態を検査できるよう意図的に除外します。`GET /api/schedules`、`GET /api/schedules/{scheduleId}`、`GET /api/schedules/{scheduleId}/history` は、他ルートがブロックされても提供し続けます。

コントロールプレーンルートは `X-Durable-Workflow-Control-Plane-Version` ヘッダーを含むコントロールプレーンエンベロープに制限ペイロードを返します。Worker プロトコルルートは同じ `reason`、`blocked_by`、`remediation` を Worker プロトコルエンベロープで返し、`X-Durable-Workflow-Protocol-Version` を保持します。Worker は単なる `503` からキュー状態を推測せず、機械可読の理由で分岐できます。

ロールアウト安全性の移行が不足する場合の `POST /api/workflows` 応答例:

```json
{
  "reason": "workflow_v2_blocked",
  "message": "This node is not ready to serve workflow v2 traffic until bootstrap blockers are cleared.",
  "blocked_by": ["migrations"],
  "remediation": "Restore database connectivity and migrate the workflow tables before relying on workflow v2 rollout-safety health."
}
```

`/api/worker/*` も同じペイロードを Worker プロトコルエンベロープで返すため、SDK は `reason` で分岐し、上流の阻害要因解消後に再試行できます。

### 名前空間スコープのシステムヘルス {#namespace-scoped-system-health}

`GET /api/system/health` は、1名前空間の認証付きロールアウト安全性・調整ヘルスサーフェスです。admin 認証と `X-Durable-Workflow-Control-Plane-Version: 2` が必要で、通常のコントロールプレーン要求規則で名前空間を解決し、評価した正確な名前空間と現在の `health` スナップショットを返します。

<!-- docs-example id="server.system-health.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/system/health" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  | jq '{namespace, status: .health.status, healthy: .health.healthy}'
```

ペイロードの解釈:

- `namespace`: ロールアウト・調整状態を評価した名前空間。
- `health.status` と `health.healthy`: その名前空間の最上位の機械可読ヘルス判定。
- `health.checks` と `health.categories`: 各サーフェスの準備、互換性、プロジェクション、調整の事実。
- `health.operator_metrics`: 同じスナップショットに含む現在の名前空間スコープのキュー、Worker、修復メトリクス。
- `health.structural_limits`: その名前空間に強制する有効な構造上限と関連診断。

## ワークフローのコントロールプレーン {#workflow-control-plane}

ワークフロールートはオペレーター・コントロールプレーンのルートです。operator または admin ロールと `X-Durable-Workflow-Control-Plane-Version: 2` が必要です。

| メソッド | パス | 用途 |
| --- | --- | --- |
| `GET` | `/api/workflows` | インスタンスを一覧。状態、型、クエリテキスト、件数などでフィルター可能。 |
| `POST` | `/api/workflows` | インスタンスを開始。 |
| `GET` | `/api/workflows/{workflowId}` | ワークフロー ID の現在の実行を説明。 |
| `GET` | `/api/workflows/{workflowId}/debug` | 停滞した実行調査のための範囲付き診断情報を返す。 |
| `GET` | `/api/workflows/{workflowId}/runs` | ワークフロー ID の実行を一覧。 |
| `GET` | `/api/workflows/{workflowId}/runs/{runId}` | 特定実行を説明。 |
| `GET` | `/api/workflows/{workflowId}/runs/{runId}/debug` | 選択実行の範囲付き診断情報を返す。 |
| `GET` | `/api/workflows/{workflowId}/runs/{runId}/history` | 履歴イベントをページ単位で読む。 |
| `GET` | `/api/workflows/{workflowId}/runs/{runId}/history/export` | 実行のアーカイブ用リプレイバンドルをエクスポート。 |

開始要求は言語中立のコントロールプレーン構造を使います。

<!-- docs-example id="server.workflow-start.curl" -->
```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/workflows" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_type": "orders.fulfillment",
    "workflow_id": "order-1001",
    "task_queue": "orders",
    "input": ["order-1001"],
    "memo": {"source": "api-reference"},
    "search_attributes": {"CustomerId": "cust-42"},
    "duplicate_policy": "fail"
  }'
```

`duplicate_policy` に指定できる値は `fail` と `use-existing` だけです。
省略するか `null` を送信すると `fail` が選択されます。どちらのポリシーも、
ワークフロー ID が未使用であれば新しい実行を作成します。

| ポリシー | アクティブな実行がすでに存在する場合 | 既存の実行が終了している場合 |
| --- | --- | --- |
| `fail`（デフォルト） | 重複した開始要求を拒否します。 | 重複した開始要求を拒否します。 |
| `use-existing` | 新たに開始せず、既存の pending、running、waiting 状態の実行を返します。 | 重複した開始要求を拒否します。 |

どちらのポリシーも終了した実行を再開しません。新しい実行には新しい
ワークフロー ID を使用してください。`reject` は無効な値で、HTTP 422 が返されます。

### ワークフローコマンド {#workflow-commands}

Server は協調的な `request-cancellation` ルートも提供します。時間を制限したクリーンアップ契約と Worker 要件は[協調キャンセル](/docs/polyglot/cancellation/)を参照してください。

インスタンス対象コマンドは、ワークフロー ID の現在の実行を操作します。

| メソッド | パス | 用途 |
| --- | --- | --- |
| `POST` | `/api/workflows/{workflowId}/signal/{signalName}` | シグナル送信。 |
| `POST` | `/api/workflows/{workflowId}/query/{queryName}` | 読み取り専用クエリ実行。 |
| `POST` | `/api/workflows/{workflowId}/update/{updateName}` | 更新の送信または実行。 |
| `POST` | `/api/workflows/{workflowId}/cancel` | 即時にキャンセルとして閉じる。クリーンアップを再開しない。 |
| `POST` | `/api/workflows/{workflowId}/terminate` | 強制終了。 |
| `POST` | `/api/workflows/{workflowId}/repair` | 再試行可能な停滞状態の修復を要求。 |
| `POST` | `/api/workflows/{workflowId}/archive` | 閉じた実行をアーカイブ。 |

実行対象コマンドは、過去または誤った実行対象を明示的に拒否します。

| メソッド | パス | 用途 |
| --- | --- | --- |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/signal/{signalName}` | 選択実行が現在の実行の場合だけシグナルを送信。 |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/query/{queryName}` | 選択実行に対してクエリを実行。 |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/update/{updateName}` | 選択実行が現在の場合だけ更新を送信・実行。 |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/cancel` | 選択実行が現在の場合だけキャンセル。 |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/terminate` | 選択実行が現在の場合だけ終了。 |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/repair` | 選択実行が現在の場合だけ修復。 |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/archive` | 選択実行が現在かつ閉じている場合だけアーカイブ。 |

コマンドは業務値を Avro ペイロードエンベロープで運びます。公式 SDK が自動でエンコードします。直接 HTTP クライアントは、公式 Avro エンコーダーの `{codec, blob}` エンベロープか、以下のランタイム外部参照を使ってください。外側の HTTP 文書は JSON ですが、生の業務 JSON は別のペイロードコーデックとして使えません。

## 名前空間とストレージ {#namespace-and-storage}

名前空間ルートは operator または admin ロールが必要です。名前空間と外部ストレージの変更には admin ロールが必要です。

| メソッド | パス | 用途 |
| --- | --- | --- |
| `GET` | `/api/namespaces` | 名前空間を一覧。 |
| `POST` | `/api/namespaces` | 名前空間を作成。 |
| `GET` | `/api/namespaces/{namespace}` | 保持、メタデータ、ストレージポリシーを説明。 |
| `PUT` | `/api/namespaces/{namespace}` | メタデータ・保持を更新。 |
| `PUT` | `/api/namespaces/{namespace}/external-storage` | 外部ペイロードストレージポリシーを設定。 |
| `POST` | `/api/storage/test` | 設定済みドライバーで小・大のペイロードを書いて読み戻す。 |

外部ペイロードストレージポリシーは、大きいペイロードエンベロープに生バイト列ではなく安定した参照を持たせます。ローカルポリシーは設定済みファイルシステムパスから解決します。`s3`、`gcs`、`azure` などのオブジェクトストレージポリシーは、Server 上で明示的に設定したファイルシステムディスクとバケット・プレフィックス設定を使います。

### 外部ペイロード参照エンベロープ {#external-payload-reference-envelope}

Server は**ランタイム参照**を受け付けます。組み込みストレージのヘルパーが使うプロバイダー URI 参照とは異なります。`external_storage` を含むリクエストは HTTP `422`、`external_payload_unsupported` で拒否されます。`file://`、`s3://`、`gs://`、`azure://` のプロバイダー参照を Server リクエストへコピーしないでください。

ランタイムのエンベロープは `codec` と `external_payload` だけを持ちます。

```json
{
  "codec": "avro",
  "external_payload": {
    "schema": "durable-workflow.v2.runtime-external-payload-reference.v1",
    "reference_id": "ep_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "codec": "avro",
    "size_bytes": 1048576,
    "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  }
}
```

上の ID とハッシュは説明用です。実際のアップロードで返された参照を変更せず使ってください。入れ子の参照には次の5フィールドだけがあります。

| フィールド | 必須 | 意味 |
| --- | --- | --- |
| `schema` | はい | `durable-workflow.v2.runtime-external-payload-reference.v1`。 |
| `reference_id` | はい | 不透明な Server ID。`ep_` と26文字の大文字 ULID で構成されます。プロバイダー URI ではありません。 |
| `codec` | はい | 外側のエンベロープと同じ `avro`。 |
| `size_bytes` | はい | アップロードしたエンコード済みバイトの非負整数サイズ。 |
| `sha256` | はい | 同じバイトの SHA-256。小文字の16進数で返されます。 |

### ランタイム外部ペイロード転送 {#runtime-external-payload-transport}

`GET /api/cluster/info` から `namespace.external_payload_storage.transport` を検出します。スキーマは `durable-workflow.v2.runtime-external-payload-transport.v1`、バージョンは `1` です。名前空間ストレージの状態が `available` のときだけ、公開された経路と上限を使います。Server がプロバイダー認証情報を保持し、プロバイダー上の保存場所は返しません。

| メソッド | パス | 結果 |
| --- | --- | --- |
| `POST` | `/api/external-payloads/v1` | 上限内のエンコード済みバイトをアップロードします。`201` は `durable-workflow.v2.runtime-external-payload-upload.v1` スキーマ、`transport_version: 1`、`reference` を返します。 |
| `GET` | `/api/external-payloads/v1/{referenceId}` | 参照されたエンコード済みバイトを取得、検証します。`200` は `application/octet-stream` を返します。 |

両方の経路は `worker`、`operator`、`admin` ロールの通常のランタイム認証情報と `X-Namespace` を使います。いずれも `X-Durable-Workflow-Payload-Codec`、`X-Durable-Workflow-Payload-Size`、`X-Durable-Workflow-Payload-SHA256` が必要です。アップロードには `Content-Type: application/octet-stream` も必要です。別の名前空間を検索すると、そのオブジェクトの存在を明かさず見つからないと返します。ID の所持は、アクセス権やワークフロー完了権限を与えません。

アップロードするのは、**公式 Avro エンベロープの base64 `blob` 文字列の UTF-8 バイト**です。末尾に改行を追加しません。デコード済みバイナリ Avro や業務 JSON ではありません。長さと SHA-256 は、その正確なバイト列から求めてください。Python SDK をインストールした後の例です。

```bash
python - <<'PY'
from pathlib import Path
from durable_workflow.serializer import encode

Path("payload.avro.txt").write_bytes(
    encode([{"message": "large value", "optional": None}]).encode("utf-8")
)
PY

PAYLOAD_SIZE=$(wc -c < payload.avro.txt | tr -d ' ')
PAYLOAD_SHA256=$(sha256sum payload.avro.txt | cut -d ' ' -f 1)

curl --fail-with-body -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/external-payloads/v1" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: billing" \
  -H "Content-Type: application/octet-stream" \
  -H "X-Durable-Workflow-Payload-Codec: avro" \
  -H "X-Durable-Workflow-Payload-Size: $PAYLOAD_SIZE" \
  -H "X-Durable-Workflow-Payload-SHA256: $PAYLOAD_SHA256" \
  --data-binary @payload.avro.txt > upload.json

REFERENCE_ID=$(jq -r '.reference.reference_id' upload.json)
curl --fail-with-body -sS "$DURABLE_WORKFLOW_SERVER_URL/api/external-payloads/v1/$REFERENCE_ID" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: billing" \
  -H "X-Durable-Workflow-Payload-Codec: avro" \
  -H "X-Durable-Workflow-Payload-Size: $PAYLOAD_SIZE" \
  -H "X-Durable-Workflow-Payload-SHA256: $PAYLOAD_SHA256" \
  -o fetched.avro.txt
cmp payload.avro.txt fetched.avro.txt
```

アップロードは参照の記録前にバイトの整合性を検証します。ワークフローを実行したり、有効な業務ペイロードであることを証明したりはしません。検証済みの最初の状態を伴うリクエストが参照を確保します。ペイロード検証と、通常のリクエスト、名前空間、タスク試行、リースの検証は継続します。Worker の完了アップロードには、直接クライアントでリース許可を作り出さず、公式 SDK と検出された完了コンテキストを使ってください。

転送マニフェストから `limits.max_payload_bytes`、`request_timeout_seconds`、`abandoned_upload_expiry_seconds` を読み取ります。名前空間のバイト数・オブジェクト数クォータ、通常のリクエスト上限、完了アップロード上限も適用されます。しきい値による選択では、等しいサイズの値はインラインのままです。SDK はより大きい値を外部化し、リクエスト全体を収めるため追加の値を外部化する場合もあります。

| 結果 | HTTP ステータス | 対応 |
| --- | --- | --- |
| 参照がない、または期限切れ | `404` / `410` | 必要なオブジェクトを復元するか参照を修正します。欠落を `null` としてデコードしないでください。 |
| 権限なし | `401` / `403` | 認証情報、ロール、名前空間の許可を修正します。 |
| 未対応エンベロープ、整合性不一致 | `415` / `422` | コーデック、フィールド、サイズ、ハッシュ、エンコード済みバイトを修正します。 |
| ペイロードが大きすぎる | `413` | エンコード値を小さくするか、許可された大きいポリシーを使います。 |
| クォータまたはアップロード許容量を消費 | `429` | 容量を確認し、元の操作予算内だけで再試行します。 |
| ストレージ利用不可 | `503` | 可用性を回復してから、同じ予算内で再試行します。 |
| 古い完了、または競合した完了 | `409` | タスクの同一性を捏造したり新しいリースに変えたりして再試行しないでください。 |

保持は Server が管理します。クライアント削除経路はありません。キャッシュの破棄で保存オブジェクトを削除してはいけません。未確保のアップロードは期限切れになる場合があります。保持中の所有者、共有オブジェクト、ストレージ障害、バックアップ保留がクリーンアップに影響します。参照入りの履歴エクスポートは、参照バイトを含む自己完結型バックアップではありません。

### モード別の外部ペイロード対応 {#external-payload-support-by-mode}

| クライアントまたは Worker | 保存経路 | プロバイダー認証情報 |
| --- | --- | --- |
| 組み込み Laravel ワークフローパッケージ | アプリケーションの名前空間ポリシーとプロバイダー URI 参照。 | 組み込みアプリケーション。 |
| PHP SDK | 自動検出したランタイムアップロード・取得と不透明参照。 | Server。 |
| Python SDK | 自動検出したランタイムアップロード・取得と不透明参照。 | Server。 |
| Rust SDK | 自動検出したランタイムアップロード・取得と不透明参照。 | Server。 |
| 直接 HTTP | 明示的なランタイムアップロード・取得と、対応ペイロード欄に渡す返却参照。 | Server。 |

すべての SDK 行には利用可能な互換ランタイム転送が必要です。プロバイダーヘルパーは、アプリケーションが所有する組み込み・直接ストレージ統合に使います。ヘルパーが存在しても、プロバイダーエンベロープが Server や Cloud の対応入力形式になるわけではありません。

名前空間の解決、ロール別認証情報、Worker 登録フィールドを含む完全な要求権限契約は、[名前空間、認証、Worker 登録](/docs/polyglot/namespace-auth-workers)を参照してください。

## サービスカタログ管理 API {#service-catalog-admin-apis}

サービスカタログルートは認証付き admin コントロールプレーンルートです。ほかのホスト型コントロールプレーンと同じ名前空間解決、トポロジーロール制限、`X-Durable-Workflow-Control-Plane-Version: 2` 要件を使います。

このルート群は、名前空間を横断するサービスカタログに、名前空間スコープのエンドポイント、サービス、操作メタデータを登録します。入力名は大文字小文字を区別せず、レスポンスと検索では小文字に正規化します。

| メソッド | パス | 用途 |
| --- | --- | --- |
| `GET` | `/api/service-endpoints` | 現在の名前空間のサービスエンドポイントを一覧。 |
| `POST` | `/api/service-endpoints` | サービスエンドポイントを作成。 |
| `GET` | `/api/service-endpoints/{endpointName}` | 1エンドポイントを説明。 |
| `PUT` | `/api/service-endpoints/{endpointName}` | 説明・メタデータを更新。 |
| `DELETE` | `/api/service-endpoints/{endpointName}` | 未使用エンドポイントを削除。 |
| `GET` | `/api/service-endpoints/{endpointName}/services` | エンドポイント配下の登録サービスを一覧。 |
| `POST` | `/api/service-endpoints/{endpointName}/services` | エンドポイント配下にサービスを作成。 |
| `GET` | `/api/service-endpoints/{endpointName}/services/{serviceName}` | 1サービスを説明。 |
| `PUT` | `/api/service-endpoints/{endpointName}/services/{serviceName}` | サービスの説明・メタデータを更新。 |
| `DELETE` | `/api/service-endpoints/{endpointName}/services/{serviceName}` | 未使用サービスを削除。 |
| `GET` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations` | サービス配下の登録操作を一覧。 |
| `POST` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations` | 操作バインディングを作成。 |
| `GET` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations/{operationName}` | 1操作を説明。 |
| `GET` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations/{operationName}/service-calls/{serviceCallId}` | 永続サービス呼び出しのスナップショットを1件説明。 |
| `PUT` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations/{operationName}` | 操作バインディングを更新。 |
| `DELETE` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations/{operationName}` | 未使用操作を削除。 |

レスポンスのコレクションは `service_endpoints`、`services`、`operations` 配列を使います。個別リソースは安定した小文字名、メタデータ、タイムスタンプを含みます。

- エンドポイントは `id`、`namespace`、`endpoint_name`、`description`、`metadata`、`created_at`、`updated_at` を返す。
- サービスは `endpoint_id` と `service_name` を加える。
- 操作は `service_id`、`operation_name`、`operation_mode`、`handler_binding_kind`、`handler_target_reference`、`handler_binding`、`deadline_policy`、`idempotency_policy`、`cancellation_policy`、`retry_policy`、`boundary_policy`、`metadata` を加える。
- サービス呼び出しスナップショットは `caller_namespace`、呼び出し元とリンク先のワークフロー ID、`status`、`resolved_binding_kind`、`resolved_target_reference`、ペイロード参照、ポリシースナップショット、`accepted_at`、`started_at`、`completed_at`、`failed_at`、`cancelled_at` などのライフサイクル時刻を加える。

操作の作成・更新要求はレスポンスと同じ JSON フィールド名を使います。`operation_mode` は `sync` または `async`。`handler_binding_kind` は `start_workflow`、`signal_workflow`、`update_workflow`、`query_workflow`、`activity_execution`、`invocable_http` のいずれかです。新しい操作には `handler_target_reference` または空でない `handler_binding` ペイロードが必要です。

ネストしたサービス呼び出し詳細は `service_call_attempts`、`retry_attempt_count`、元の `call_deadline_at`、型付き失敗メタデータ、保持された Avro `result_envelope` も公開します。受理済み・開始済み呼び出しは未終了です。完了を待つワークフロー呼び出し元は、元の呼び出し ID と期限を維持しつつ、リンク先ワークフローの実際の結果または終了失敗・キャンセルで解決します。

元の呼び出しの検査には [CLI サービス呼び出し検査](./cli-reference.md#service-call-inspection)、または Waterline のサービスカタログを使います。検査は別のサービス実行を要求しません。

依存先が残っている場合、削除は HTTP `409` と `endpoint_has_services`、`service_has_operations`、`operation_has_service_calls` など名前付き理由で安全側に失敗します。

## ブリッジアダプター {#bridge-adapters}

ブリッジアダプターは範囲を制限した入口エンドポイントです。ワークフローコードを実行せず、イベントをコントロールプレーンへ引き渡し、名前付き結果を返します。

| メソッド | パス | 用途 |
| --- | --- | --- |
| `POST` | `/api/bridge-adapters/webhook/{adapter}` | Webhook 形式イベントからワークフローを開始、シグナル、更新。 |

例:

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/bridge-adapters/webhook/stripe" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "start_workflow",
    "idempotency_key": "evt_1001",
    "target": {
      "workflow_type": "orders.fulfillment",
      "task_queue": "orders",
      "business_key": "order-1001"
    },
    "input": {"order_id": "order-1001"}
  }'
```

HTTP 状態だけから動作を推測せず、`outcome`、`reason`、`idempotency_key`、`control_plane_outcome` などレスポンスフィールドを使います。

## Worker プロトコル {#worker-protocol}

Worker ルートは worker ロールと `X-Durable-Workflow-Protocol-Version: 1.0` が必要です。SDK Worker は内部でこれらを使い、カスタム言語 Worker も同じプロトコルを実装できます。

| メソッド | パス | 用途 |
| --- | --- | --- |
| `POST` | `/api/worker/register` | Worker ID、タスクキュー、対応ワークフロー・アクティビティ型、容量、ランタイム、ビルドメタデータを登録。 |
| `POST` | `/api/worker/heartbeat` | Worker 群の可視性と互換性情報を更新。 |
| `POST` | `/api/worker/workflow-tasks/poll` | ワークフロータスクをロングポーリング。 |
| `POST` | `/api/worker/workflow-tasks/{taskId}/history` | リース済みワークフロータスクのページ分割履歴を取得。 |
| `POST` | `/api/worker/workflow-tasks/{taskId}/heartbeat` | リース済みワークフロータスクをハートビート。 |
| `POST` | `/api/worker/workflow-tasks/{taskId}/complete` | コマンドでワークフロータスクを完了。 |
| `POST` | `/api/worker/workflow-tasks/{taskId}/fail` | ワークフロータスクを失敗にする。 |
| `POST` | `/api/worker/query-tasks/poll` | Server がルーティングするクエリタスクをロングポーリング。 |
| `POST` | `/api/worker/query-tasks/{queryTaskId}/complete` | クエリタスクを完了。 |
| `POST` | `/api/worker/query-tasks/{queryTaskId}/fail` | クエリタスクを失敗または拒否。 |
| `POST` | `/api/worker/activity-tasks/poll` | アクティビティタスクをロングポーリング。 |
| `POST` | `/api/worker/activity-tasks/{taskId}/heartbeat` | リース済みアクティビティタスクをハートビート。 |
| `POST` | `/api/worker/activity-tasks/{taskId}/complete` | アクティビティタスクを完了。 |
| `POST` | `/api/worker/activity-tasks/{taskId}/fail` | アクティビティタスクを失敗にする。 |

Worker はリース ID、試行、タスク ID、ハートビートエンドポイントを、Server が発行した不透明な値として扱うべきです。古いリースや誤ったタスク ID は、黙って完了するのではなく名前付き Worker プロトコルエラーを返します。

`worker_protocol.server_capabilities.poll_status` が `true` の場合、すべてのワークフロー・アクティビティ・クエリタスクポーリングレスポンスは機械可読 `poll_status` を持ちます。ルート固有ペイロードを検査する前の最初の分岐点として使います。

| `poll_status` | 典型的 HTTP ステータス | 意味 |
| --- | --- | --- |
| `leased` | `200` | リースに成功し、`task` にタスクペイロードが入る。 |
| `empty` | `200` | ポーリング終了前に一致するタスクは実行可能にならなかった。 |
| `throttled` | `200` | キューは可視だが、リース・ディスパッチの受け入れ上限が新しいタスクを保留した。 |
| `unavailable` | `503` または `200` | Server はキューのポーリング経路を安全に調整できず、空を装わずに型付き利用不能結果を返した。 |
| `draining` | `409` | 登録済み Worker コホートがドレイン中で、新規リースを拒否し `reason: "worker_draining"` を返す。 |

## Worker 群とタスクキューの可視性 {#fleet-and-task-queue-visibility}

次のコントロールプレーンルートは Worker 群とキュー受け入れの運用診断を公開します。

| メソッド | パス | 用途 |
| --- | --- | --- |
| `GET` | `/api/workers` | 登録済み Worker を一覧。 |
| `GET` | `/api/workers/{workerId}` | 1 Worker を説明。 |
| `DELETE` | `/api/workers/{workerId}` | 1 Worker の登録解除。 |
| `GET` | `/api/task-queues` | タスクキューと受け入れ状態を一覧。 |
| `GET` | `/api/task-queues/{taskQueue}` | キューのワークフロー・アクティビティ・クエリ容量を説明。 |
| `GET` | `/api/task-queues/{taskQueue}/build-ids` | キューで観測したビルド ID を一覧。 |
| `POST` | `/api/task-queues/{taskQueue}/build-ids/drain` | コホートをドレイン中とし新規クレームを止める。 |
| `POST` | `/api/task-queues/{taskQueue}/build-ids/resume` | 以前のドレインを消去し新規クレームを再開する。 |

タスクキューレスポンスで、Worker 不在、Worker スロット飽和、有効リース上限、ディスパッチ上限、クエリタスクのバックプレッシャーを区別します。ドレインと再開は JSON 本文 `{"build_id": "..."}`（バージョンなしは `{"build_id": null}`）を受け入れ、冪等で、コホートに運用担当者の意図を永続化します。Worker 削除後もロールアウト状態を正確に保ちます。Worker ハートビートが `drain_intent: "draining"` を観測すると、ポーリングは新規リースを渡さず、HTTP `409`、`poll_status: "draining"`、`reason: "worker_draining"` を返します。バージョンなしからバージョン付きへの切り替え、カナリア、ドレイン、ロールバックの全手順は [Worker Build-Id のロールアウト](/docs/polyglot/worker-build-id-rollout)を参照してください。

## スケジュールと検索属性 {#schedules-and-search-attributes}

スケジュールルートはコントロールプレーンルートです。

| メソッド | パス | 用途 |
| --- | --- | --- |
| `GET` | `/api/schedules` | スケジュールを一覧。 |
| `POST` | `/api/schedules` | スケジュールを作成。 |
| `GET` | `/api/schedules/{scheduleId}` | 1スケジュールを説明。 |
| `PUT` | `/api/schedules/{scheduleId}` | 仕様、アクション、注記、メモ、検索属性を更新。 |
| `DELETE` | `/api/schedules/{scheduleId}` | スケジュールを削除。 |
| `POST` | `/api/schedules/{scheduleId}/pause` | 今後の発火を一時停止。 |
| `POST` | `/api/schedules/{scheduleId}/resume` | 一時停止から再開。 |
| `POST` | `/api/schedules/{scheduleId}/trigger` | 即時発火。 |
| `POST` | `/api/schedules/{scheduleId}/backfill` | 時間帯をバックフィル。 |
| `GET` | `/api/search-attributes` | 登録済み検索属性を一覧。 |
| `POST` | `/api/search-attributes` | 検索属性を登録。 |
| `DELETE` | `/api/search-attributes/{name}` | 検索属性を削除。 |

検索属性名と型は名前空間検索契約の一部です。運用ダッシュボードやメトリクスラベルに、値の種類が多い高カーディナリティ属性を使うのは避けてください。

## システム操作 {#system-operations}

システムルートには admin ロールが必要です。明示的な運用処理であり、自動化では pass の前に status ルートを使ってください。

| メソッド | パス | 用途 |
| --- | --- | --- |
| `GET` | `/api/system/health` | 名前空間のロールアウト安全性・調整ヘルスを `health` 内に返す。 |
| `GET` | `/api/system/metrics` | 範囲を制限した JSON メトリクスを返す。 |
| `GET` | `/api/system/operator-metrics` | 実行、タスク、バックログ、修復、Worker、構造上限の名前空間スコープ運用メトリクスを返す。 |
| `GET` | `/api/system/repair` | ワークフロー修復バックログを検査。 |
| `POST` | `/api/system/repair/pass` | 修復処理を1回実行。 |
| `GET` | `/api/system/activity-timeouts` | アクティビティタイムアウトのバックログを検査。 |
| `POST` | `/api/system/activity-timeouts/pass` | タイムアウト強制処理を1回実行。 |
| `GET` | `/api/system/retention` | 保持期限による清掃バックログを検査。 |
| `POST` | `/api/system/retention/pass` | 保持期限の削除処理を1回実行。 |

PHP Server の保持では status ルートが現在の名前空間ポリシーを読み、上限付きの適格実行リストを返します。ポリシー変更は既存の閉じた履歴にも影響します。無指定の pass は期限切れを選び、明示 `run_ids` は経過時間の制限フィルターなしで閉じた実行を直接対象にします。永久保持とアーカイブ済み実行の保護は引き続き適用されます。ポリシー変更や清掃前に[保持手順とバックアップ手順](./server.md#retention)を確認してください。

`/api/system/health` は、1名前空間がトラフィックを受け続けられるほど健全かを知る最短経路です。`{namespace, health}` を返し、`health` は分類したロールアウト安全性検査、ネストした `health.operator_metrics`、ヘルスサーフェスが使う構造上限概要を含みます。

`/api/system/operator-metrics` は、生のバックログ件数、互換性ブロックの経過時間、Worker 群の詳細、要約ヘルスの基となるその他の運用メトリクスが必要なときの、名前空間スコープの `/api/cluster/info` 対応サーフェスです。

`/api/system/metrics` は JSON 運用サーフェスであり、Prometheus スクレイプエンドポイントではありません。メトリクス名と次元は Server の増加制限ポリシーで制限します。

## エラー契約 {#error-contract}

エラーレスポンスは HTTP 状態コードと名前付きの機械可読理由を使います。クライアントは文章メッセージではなく、`reason` またはネストしたコントロールプレーン・Worker プロトコルの理由フィールドで分岐するべきです。

一般的な状態:

| 状態 | 意味 |
| --- | --- |
| `400` | プロトコル・バージョンヘッダーの欠落・未対応、不正クエリ、未対応のルートメソッド。 |
| `401` | 認証の欠落または不正。 |
| `403` | 認証済みトークンに必要ロールがない。 |
| `404` | 名前空間、ワークフロー、実行、スケジュール、Worker、検索属性が見つからない。 |
| `409` | 開始済みワークフローや不正な実行対象など、重複・競合。 |
| `422` | 検証失敗。フィールド単位の詳細を含む。 |
| `429` | 受け入れ容量またはタスクキュー容量が満杯。 |
| `503` | 必要なトポロジーロールをホストしないノードへ届いた。ホスト型ルートは `reason: "topology_role_unavailable"` と `current_shape`、`current_process_class`、`current_roles`、`required_roles`、`missing_roles` を返す。同じ状態で `reason: "workflow_v2_blocked"`、`blocked_by`、`remediation` がある場合、workflow v2 ブートストラップがブロック中のワークフロー開始・変更、スケジュール変更、ブリッジアダプター、Worker プロトコルを対象とする。復旧中の検査のため、スケジュール読み取り（`GET /api/schedules`、`GET /api/schedules/{scheduleId}`、`GET /api/schedules/{scheduleId}/history`）は利用可能。 |
| `500` | Server 失敗。操作が冪等または冪等性キーを持つ場合だけ再試行可能と扱う。 |

検証レスポンスは `reason: "validation_failed"` と `errors` または `validation_errors` を含みます。ワークフローコマンドレスポンスは、ネストした `control_plane` オブジェクトにも検証・操作詳細を射影します。

## 関連項目 {#see-also}

- [Server ガイド](/docs/polyglot/server)
- [名前空間、認証、Worker 登録](/docs/polyglot/namespace-auth-workers)
- [Worker プロトコル](/docs/polyglot/worker-protocol)
- [タスクキューの受け入れ](/docs/polyglot/task-queue-admission)
- [外部実行](/docs/polyglot/external-execution)
- [CLI コマンドリファレンス](/docs/polyglot/cli-reference)
