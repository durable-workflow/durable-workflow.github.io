---
title: Server ロールのトポロジー
description: Durable Workflow の Server ロール、拡張境界、障害ドメイン、移行手順について /api/cluster/info のトポロジーマニフェストを読み解きます。
tags:
  - server
  - topology
  - deployment
  - control-plane
  - workers
keywords:
  - Durable Workflow ロールトポロジー
  - cluster info トポロジー
  - Server 拡張境界
  - 制御と実行の分離
---

# Server ロールのトポロジー {#server-role-topology}

## このマニフェストの目的 {#why-this-manifest-exists}

`GET /api/cluster/info` は、スキーマ `durable-workflow.v2.role-topology` の下に Server の `topology` マニフェストを公開します。ロール名、対応するデプロイ構成、永続書き込み権限、障害ドメインの想定、拡張境界、現在のスタンドアロン配布から制御・実行を分離するトポロジーへの順序付き移行経路について、このマニフェストを公開契約として扱ってください。

スクリプト、ダッシュボード、運用手順書、ロールアウト自動化から Server の構成を判断する際にこのページを使います。生の HTTP サーフェスは [Server API リファレンス](/docs/polyglot/server-api-reference)、デプロイのセットアップは [Server ガイド](/docs/polyglot/server)を参照してください。

## トポロジーマニフェストの読み方 {#reading-the-topology-manifest}

`topology` オブジェクトは次の契約上の質問に答えます。

| フィールド群 | 回答する質問 |
| --- | --- |
| `schema`, `version` | 読んでいるトポロジー契約のリビジョンは何か。 |
| `supported_shapes` | 許可される製品のデプロイ構成は何か。 |
| `role_vocabulary` | この契約で有効なロール名は何か。 |
| `current_shape`, `current_process_class`, `current_roles`, `execution_mode` | 応答ノードは現在何をしているか。 |
| `matching_role.*` | 広範な実行可能タスクの起床を誰が管理し、どのルーティング軸が固定され、どのディスパッチ・バックプレッシャー方針が有効か。 |
| `role_catalog`, `authority_surfaces` | 各ロールに属するインターフェースと永続変更サーフェスは何か。 |
| `shape_assignments` | 各対応構成で許可されるプロセスクラスは何か。 |
| `authority_boundaries`, `failure_domains`, `scaling_boundaries` | 各ロールが何を書けるか、どのように失敗するか、どの負荷軸で拡張するか。 |
| `supported_topologies`, `migration_path` | 製品が対応するデプロイの系統と、スタンドアロン構成からより分離したロールへの順序付き経路は何か。 |
| `kernel_invariants` | 現在の稼働構成に関係なく、ロール分離が維持すべき永続カーネルの保証は何か。 |

`current_shape`、`current_process_class`、`current_roles` は、HTTP リクエストに応答したノードを説明し、Worker 群全体を説明するものではありません。`current_process_class` をノードが宣言した ID として使い、その宣言を検証する必要がある場合は、`current_roles` を `shape_assignments` のプロセスクラスの組と比較します。

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/cluster/info" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  | jq '{
    current_shape: .topology.current_shape,
    current_process_class: .topology.current_process_class,
    current_roles: .topology.current_roles,
    execution_mode: .topology.execution_mode,
    matching_role: .topology.matching_role,
    scaling_boundaries: .topology.scaling_boundaries,
    migration_path: .topology.migration_path
  }'
```

## ロールの語彙 {#role-vocabulary}

公開ロール名は `topology.role_vocabulary` によって固定されています。

| ロール | 責務 |
| --- | --- |
| `api_ingress` | ディスカバリーとコントロールプレーンの入口を含む外部 HTTP トラフィックを受け入れる。 |
| `control_plane` | 開始、シグナル、更新、修復、キャンセル、終了、アーカイブなど、ワークフローのライフサイクル状態を変更する。 |
| `matching` | 実行可能な処理を検出し、タスクリースを所有し、ディスパッチの負荷を調整する。 |
| `history_projection` | 永続履歴を保存し、派生する実行概要とエクスポートを維持する。 |
| `scheduler` | スケジュールを発火させ、スケジュール実行状態を保存する。 |
| `execution_plane` | ワークフロータスクとアクティビティタスクの処理を実行する。 |

自動化はこれらの正確な識別子を安定した語彙として扱うべきです。

## 対応するデプロイ構成 {#supported-deployment-shapes}

`topology.supported_shapes` は許可される製品デプロイ構成を示します。

| 構成 | `shape_assignments` で公開するプロセスクラス | 契約上の意味 |
| --- | --- | --- |
| `embedded` | `application_process` | 1つのアプリケーションプロセスがコントロールプレーン、マッチング、履歴プロジェクション、スケジューラー、実行を所有する。 |
| `standalone_server` | `server_http_node`, `scheduler_node`, `worker_node` | 現在のスタンドアロン Server 配布。Server ノードに HTTP 入口とコントロールプレーン、独立プロセスクラスにスケジューラー、Worker ノードに実行を置く。 |
| `split_control_execution` | `ingress_node`, `control_plane_node`, `scheduler_node`, `matching_node`, `execution_node` | 同じ製品契約をより狭いロール固有のプロセスクラスに分割し、サブシステム単位で拡張と障害の境界を動かせるようにする。 |

`split_control_execution` は対応トポロジーであり、2つ目のエンジンや別の API ではありません。同じディスカバリーサーフェスがスタンドアロンと分離ロールの両構成を説明します。

## 現在のノード ID {#current-node-identity}

`current_shape`、`current_process_class`、`current_roles`、`execution_mode` を併用します。

- `current_shape` は応答ノードの構成契約を示す。
- `current_process_class` はそのノードが宣言したプロセスクラスを示す。
- `current_roles` はそのノードで有効なロールの組を示す。
- `execution_mode` は `remote_worker_protocol` と `local_queue_worker` を区別する。

スタンドアロン Server 配布では、`DW_MODE=embedded` で実行をローカルキュー Worker に切り替えても `current_shape` は `standalone_server` のままです。その場合 `execution_mode` が `local_queue_worker` へ変わり、HTTP ノードはスタンドアロン Server のロール契約を維持します。

### ホスト型ルートの制限 {#hosted-route-gating}

同じトポロジー契約は、ノードがホスト型トラフィックを完全に拒否すべき場合も呼び出し元に伝えます。応答ノードが、現在そのルートに必要な HTTP 制御の組 `api_ingress` と `control_plane` を広告しない限り、認証されたホスト型ルートは安全側に失敗します。

誤ったノードからのレスポンスは `503`、`reason: "topology_role_unavailable"` と、ルーティングし直すためのトポロジー情報を返します。

- `current_shape`
- `current_process_class`
- `current_roles`
- `required_roles`
- `missing_roles`

この制限はホスト型ルートの名前空間解決より前に実行されます。そのため `scheduler_node`、`matching_node`、`execution_node` へ送った要求は、正しいノードクラスへ向け直される前に指定した名前空間の存在を知ることができません。`GET /api/health`、`GET /api/ready`、認証付きの `GET /api/cluster/info` は利用可能なままで、自動化は別の場所で再試行する前にノード構成を検出できます。

### ワークフローのブートストラップ制限 {#workflow-bootstrap-gate}

応答ノードに未解決の workflow v2 ブートストラップ阻害要因がある場合、2つ目のルート制限が安全側に失敗させます。`checks.workflow_v2.status` が `blocked` の間、認証されたワークフロー開始・変更、スケジュール変更、ブリッジアダプター、Worker プロトコルの各ルートは `503`、`reason: "workflow_v2_blocked"` と次を返します。

- `blocked_by`: `migrations` など、上流の準備状態の阻害要因を順に並べたリスト。
- `remediation`: 列挙された阻害要因を解消するための運用担当者向け手順。`/api/ready` の `checks.workflow_v2.remediation` と同じ内容。

ブートストラップ制限はホスト型ルートのトポロジー制限と同じ位置、つまりロールとプロトコルバージョンの検証後、名前空間解決の前にあります。したがってブロックされた要求が名前空間の存在を観測することはありません。

制限対象のルート群は、`/api/workflows` などのワークフロールート、`POST /api/schedules`、`PUT /api/schedules/{scheduleId}`、`DELETE /api/schedules/{scheduleId}`、`/pause`、`/resume`、`/trigger`、`/backfill` などのスケジュール変更、`/api/bridge-adapters/webhook/{adapter}` などのブリッジアダプタールート、`/api/worker` 配下の Worker プロトコルルートです。

スケジュールの**読み取り**（`GET /api/schedules`、`GET /api/schedules/{scheduleId}`、`GET /api/schedules/{scheduleId}/history`）は、復旧中に運用担当者が状態を検査できるよう意図的に除外します。Worker プロトコルルートは、Worker プロトコルエンベロープ内に同じブートストラップ制限ペイロードを返すため、Worker SDK はコントロールプレーンと同じ機械可読な `reason: "workflow_v2_blocked"` で分岐します。

## マッチングロールの契約 {#matching-role-contract}

`topology.matching_role` は、応答ノードで現在有効なマッチングと起床の方針を固定します。

| フィールド | 意味 |
| --- | --- |
| `queue_wake_enabled` | 短命なキュー起床シグナルが現在有効か。 |
| `shape` | このノードが広告するマッチングのデプロイ構成。`in_worker` または `dedicated`。 |
| `wake_owner` | 現在広範な起床走査を所有する実装。`worker_loop` または `dedicated_repair_pass`。 |
| `task_dispatch_mode` | `poll` 駆動のリモート Worker と `queue` 駆動のローカル実行のどちらでディスパッチするか。 |
| `partition_primitives` | マッチングロールが扱う固定のルーティング軸。順に `connection`、`queue`、`compatibility`、`namespace`。 |
| `backpressure_model` | マッチングロールが強制する永続的な受け入れ境界。現在の v2 は `lease_ownership` を報告する。 |
| `discovery_limits` | Workflow パッケージがコンパイル時に組み込む固定のマッチングロール数値契約。`poll_batch_cap`、`availability_ceiling_seconds`、`wake_signal_ttl_seconds`、`workflow_task_lease_seconds`、`activity_task_lease_seconds`。 |

これにより運用担当者と自動化は、「マッチングはあるが起床が劣化している」と「このノードは意図的に別のディスパッチモードで稼働している」を区別でき、Server 自身が運用メトリクスに公開するものと同じルーティングとバックプレッシャーの語彙を使えます。

`discovery_limits` はマッチングロールの数値契約です。`poll_batch_cap` はポーリング1回で返す実行可能タスク行の最大バッチを固定します。`availability_ceiling_seconds` は、利用可能になったばかりのタスクが1秒未満の時刻のずれを許容できるよう、`available_at` に適用するバックエンド間の許容幅を固定します。`wake_signal_ttl_seconds` は既定の `CacheLongPollWakeStore` シグナル TTL を固定し、`workflow_task_lease_seconds` / `activity_task_lease_seconds` はワークフローとアクティビティの既定タスクリース期間を固定します。運用担当者はパッケージソースを検索せず、これらの値でデプロイが文書化されたマッチングロール契約に一致するか検証できます。契約のほかの部分のディスパッチ、Worker、高速化のタイミングはこれらに依存するため、いずれかを厳しくすることはプロトコルレベルの変更です。フィールド名の変更もプロトコルレベルの破壊的変更になります。

## 権限の境界 {#authority-boundaries}

`topology.authority_boundaries` は、各ロールが変更するべき永続書き込みサーフェスを示します。

| ロール | 公開された書き込み先 |
| --- | --- |
| `api_ingress` | `worker_registrations` |
| `control_plane` | `workflow_instances`, `workflow_runs.status`, `workflow_tasks.lifecycle` |
| `matching` | `workflow_tasks.leases`, `activity_tasks.leases` |
| `history_projection` | `history_events`, `workflow_run_summaries`, `workflow_history_exports` |
| `scheduler` | `workflow_schedules.fire_state`, `workflow_starts.scheduled` |
| `execution_plane` | `workflow_tasks.outcomes`, `activity_attempts`, `worker_compatibility_heartbeats` |

プロセスを分割したり新たなトポロジー固有の自動化を加えたりする前に、この契約でロールを越えた逸脱を検出します。

## 障害と拡張の境界 {#failure-and-scaling-boundaries}

### 障害ドメイン {#failure-domains}

`topology.failure_domains` は各ロールの停止時に最初に劣化する動作と、運用担当者が最初に観測するシグナルを示します。

| 障害ドメイン | `effect` | `operator_signal` |
| --- | --- | --- |
| `control_plane_down` | `workers_continue_claimed_tasks_only_until_lease_expiry` | `operator_commands_fail_fast` |
| `execution_plane_down` | `ready_tasks_accumulate_without_loss` | `operators_see_ready_depth_growth` |
| `matching_down` | `claim_falls_back_to_direct_ready_task_discovery` | `ready_depth_rises_while_claim_rate_falls` |
| `history_projection_down` | `projection_reads_may_stale_while_durable_writes_continue` | `projection_lag_seconds_may_increase` |
| `scheduler_down` | `scheduled_workflows_stop_firing_and_record_missed_runs` | `operators_see_missed_schedule_state` |
| `api_ingress_down` | `external_http_traffic_stops_at_the_edge` | `embedded_in_process_calls_may_continue` |

これは製品としての期待動作であり、内部実装の細部ではありません。ログを読む前に、ロールの劣化時に起きるべきことを説明するために使ってください。

### 拡張の境界 {#scaling-boundaries}

`topology.scaling_boundaries` は、ロール分離モデルで各ロールが主にどの負荷軸に沿って拡張するかを示します。

| ロール | 拡張の境界 |
| --- | --- |
| `api_ingress` | `incoming_http_request_rate` |
| `control_plane` | `operator_commands_and_run_lifecycle_transitions` |
| `matching` | `ready_task_rate_and_poller_count` |
| `history_projection` | `durable_event_rate` |
| `scheduler` | `active_schedule_count` |
| `execution_plane` | `workflow_and_activity_task_rate` |

これは分離ロールのトポロジーにおける「何を独立して拡張するか」への明示的な回答です。

## 移行経路 {#migration-path}

`topology.migration_path` には順序があります。各ステップは単一の永続カーネルを維持しながら、責務をより明確に分離します。

1. `audit_role_boundaries`
   結果: ランタイム構成の変更前に、ツールがロールを越えた書き込みを検出する。
2. `expose_role_bindings`
   結果: コンテナの接点により、パッケージをパッチせずにプロセス外アダプターを使える。
3. `introduce_dedicated_matching_shape`
   結果: クレーム契約を変えずに、マッチングを独自のプロセスクラスとして実行できる。
4. `split_history_projection`
   結果: 2つ目の書き込み主体を導入せず、履歴とプロジェクションをプロセス外へ移せる。
5. `split_scheduler`
   結果: 単一レプリカのデプロイを有効なまま維持し、スケジュール発火をリーダー選出の背後へ移せる。
6. `optional_execution_partitioning`
   結果: Worker を名前空間、接続、キュー、互換性で分割できる。

このリストは、現在のエンジンから切り離した製品ロードマップではなく、対応するトポロジー遷移の順序として読んでください。

各 `topology.migration_path[]` エントリーは明示的な `reversible: true` フラグを持ちます。移行経路は双方向です。`split_history_projection` に達したデプロイは、履歴ロールをコントロールプレーンプロセスへ戻しても有効なトポロジー構成であり続けることができます（MAY）。ロールバックは契約の一部であり、モデル化されていない例外ではありません。

## 永続カーネルの不変条件 {#durable-kernel-invariants}

`topology.kernel_invariants` は、どの対応構成が稼働していてもロール分離が維持する保証を列挙します。候補のトポロジー変更がエンジンのフォークではなく製品として対応するものかを検証する際に使います。

| 不変条件 | 保証内容 |
| --- | --- |
| `single_persistence_engine` | すべてのトポロジー構成を1つのワークフローデータベースが支える。ロール分離で2つ目の永続化エンジンを導入しない。 |
| `single_worker_protocol` | すべてのトポロジーのクレーム、完了、失敗、ハートビート通信を1つの HTTP Worker プロトコルが担う。ロール分離で Worker 契約を分岐しない。 |
| `single_history_writer` | 履歴・プロジェクションロールの場所に関係なく、論理イベントごとに `history_events` の永続書き込み主体は正確に1つ。 |
| `single_control_authority_per_run` | 特定のワークフロー実行のすべての変更は1つのコントロールプレーン権限を通る。実行ごとの行ロックがレプリカ間の遷移を直列化する。 |
| `embedded_topology_remains_supported` | 1プロセスが全ロールを担う組み込み構成は有効であり続けなければならない（MUST）。既存の組み込みホストを移行へ強制しない。 |
| `role_split_is_topology_only` | ロール分離はトポロジー変更であり、製品フォークではない。ロールを単一プロセスへ戻すことは常に有効なトポロジー。 |

各エントリーの `applies_to` フィールドは、不変条件が対象とする構成を列挙します。対応するトポロジー群では、現在すべての不変条件が `embedded`、`standalone_server`、`split_control_execution` に適用されます。アップグレードで新しい構成を加える場合、`applies_to` にその構成を含まない不変条件は、その構成を製品対応とみなす前に必ずレビューしなければなりません（MUST）。

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/cluster/info" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  | jq '.topology.kernel_invariants[] | {id, applies_to}'
```

## 調整の健全性 {#coordination-health}

`/api/cluster/info` は `topology` の隣に `coordination_health` も公開します。違いを明確にしてください。

- `topology` はノードが実行できることと、製品構成がどう振る舞うべきかを示す。
- `coordination_health` は名前空間全体のロールアウト安全性と調整の検査が現在健全かを示す。
- `coordination_health.blocked_by`、`coordination_health.message`、`coordination_health.remediation` は、移行やデータベース接続などの準備前提が欠け、Server がロールアウト安全性を評価できない場合に現れる。
- `coordination_health.routing_drains` はキューと名前空間を横断してドレイン中の build-id コホートを集約する。`queues_with_drains` はロールアウト自動化が現在意図的にいずれかのコホートからトラフィックを遠ざけているかを示す。
- `coordination_health.warning_checks`、`coordination_health.error_checks`、`coordination_health.checks` は、ロールアウト安全性評価の稼働後も正規化された検査一覧であり続ける。
- `coordination_health.checks[]` は、`worker_compatibility`、`task_transport`、`routing_health`、`durable_resume_paths`、プロジェクション・スケジューラー検査と並び、固定された `activity_path` 検査を必ず含む。`activity_path` は `task_transport` のアクティビティ側に対応し、schedule-to-start、start-to-close、schedule-to-close、ハートビートの期限が強制されないまま過ぎたアクティビティ実行と、継続的なアクティビティ再試行バックログを示す。検査名の変更はプロトコルレベルの変更。

トポロジー変更が対応対象であり、かつ現在安全かを判断するとき、両サーフェスを併用してください。

## 関連リファレンス {#related-references}

- [Server API リファレンス](/docs/polyglot/server-api-reference): 認証付き `/api/cluster/info` の HTTP 契約。
- [Server ガイド](/docs/polyglot/server): デプロイ設定と、より広いスタンドアロン Server の運用モデル。
- [デプロイモード](/docs/polyglot/deployment-modes): 組み込み、スタンドアロン Server、より広いサポート主導のトポロジーを選ぶ場合。
