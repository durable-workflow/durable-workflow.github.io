---
sidebar_position: 2
title: Server
description: Durable Workflow 独立 Server のデプロイと設定。
tags:
  - server
  - control-plane
  - operations
  - polyglot
keywords:
  - Durable Workflow Server
  - 独立 Server
  - コントロールプレーン API
  - 複数言語のワークフロー
---

# Server {#server}

公開済みの Durable Workflow Server は、PHP で実装された独立型のワークフローオーケストレーションサービスです。組み込み PHP パッケージと同じ永続エンジンを、言語に依存しない HTTP+JSON のコントロールプレーンと Worker プロトコルとして提供します。PHP は Server の実装言語であり、アプリケーション側の使用言語の条件ではありません。

## PHP チーム専用ですか？ {#is-this-only-for-php-teams}

専用ではありません。PHP、Python、Rust はいずれも公式 SDK です。Python や Rust だけを使うチームでも、公開 Server を基盤としてデプロイし、各言語の SDK でワークフローとアクティビティを実装して公開プロトコルで通信できます。アプリケーションに Laravel を組み込んだり、Laravel アプリケーションへ変更したりする必要はありません。

導入方法はそれぞれ異なります。

- **独立 Server**：運用者は公開イメージとデータベース、キュー・キャッシュ、スケジューラー、API をデプロイします。アプリケーションはその接続先に PHP、Python、Rust Worker を接続します。オーケストレーション状態と公開コントロールプレーン・Worker 境界は Server が管理します。
- **組み込み**：Laravel アプリケーションが PHP Workflow パッケージを導入し、自身のキュー、データベース、設定、デプロイでエンジンを管理します。これは Laravel 固有の利点であり、独立 Server の前提ではありません。
- **マネージド Cloud**：Durable Workflow Cloud が runtime、永続化、配置、復旧を管理します。アプリケーションは払い出された Cloud Namespace に SDK クライアントと Worker を接続します。Cloud 用にこの Server をデプロイしたり、自社 Server を接続したりはしません。[Cloud マネージド runtime](/docs/polyglot/cloud-control-plane/)を参照してください。

三つの方法は同じ永続実行の概念を使います。独立 Server と Cloud の外部 Worker は、安定した文字列のワークフロー・アクティビティ型名と共通のコーデックエンベロープを使います。そのため、言語間の子ワークフローやアクティビティでも PHP のシリアライズを公開せずにペイロードの型を維持できます。

独立 Server とパッケージ組み込みを選ぶ場合は、[デプロイモード](/docs/polyglot/deployment-modes)から始めてください。このページは service モードの配布物を説明します。

次が必要な場合に独立 Server を使用します。
- **複数言語のワークフロー**：PHP、Python、Rust のワークフローとアクティビティ Worker で一つの永続 runtime を共有
- **マイクロサービスの調整**：異なる言語のサービスをオーケストレーション
- **集中管理 runtime**：複数アプリケーションで同じエンジンを共有
- **Laravel 以外の環境**：Laravel 外でも Durable Workflow を利用

Laravel 内で v2 を使っている場合は、[組み込みから Server への移行](/docs/polyglot/embedded-to-server)で型キーを準備し、組み込み実行と並行して Server を配置し、Worker を接続して新規開始だけを Server へ送ります。切替中も [デプロイモード](/docs/polyglot/deployment-modes)を参照し、ID、コマンド結果、タスクの意味、runtime の所有権を明確にしてください。

Worker のビルド群を更新・ドレインする場合や、ロールバック中も長期実行を互換実行環境に固定したい場合は、[Worker の互換性とルーティング](/docs/polyglot/worker-compatibility-routing)を使ってください。

`GET /api/cluster/info` が公開するロール名、プロセスクラス、権限境界、障害ドメイン、移行経路は、[Server のロールトポロジー](/docs/polyglot/server-role-topology)を参照してください。

## クイックスタート {#quick-start}

### 公開イメージと SQLite {#published-image--sqlite}

ソースなしで最も簡単に動かす方法は公開 Docker イメージです。この例はコンテナ内の SQLite、データベースキュー、ファイルキャッシュを使います。初期化と API が同じ SQLite ファイルを使うように、`/app/database` をマウントします。

```bash
server_image=%%artifact.serverDockerHubImage%%
export DW_AUTH_TOKEN=dev-token

docker volume create durable-workflow-server-quickstart

docker run --rm \
  -v durable-workflow-server-quickstart:/app/database \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$server_image" server-bootstrap

docker rm -f durable-workflow-server durable-workflow-server-queue-worker >/dev/null 2>&1 || true
docker run -d --name durable-workflow-server \
  -p 127.0.0.1:8080:8080 \
  -v durable-workflow-server-quickstart:/app/database \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$server_image"

docker run -d --name durable-workflow-server-queue-worker \
  --health-cmd="server-process-healthcheck worker" \
  -v durable-workflow-server-quickstart:/app/database \
  -e DW_SERVER_PROCESS_CLASS=worker_node \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$server_image" php artisan queue:work database --queue=default --sleep=1 --tries=3

until curl -sf http://localhost:8080/api/ready >/dev/null; do sleep 1; done
curl http://localhost:8080/api/health
curl -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  http://localhost:8080/api/cluster/info \
  | jq '.topology | {current_shape, current_roles, execution_mode}'
```

これで既定 Namespace、API、基盤用キューワーカーが起動します。Laravel キューの `default` は、SDK の名前付きタスクキューとは別です。SDK Worker が停止中も、このワーカーが永続タイマーを進めます。スケジュール評価と本番の保守には、下記公開 Compose の追加ロールが必要です。

API はループバックにのみ公開され、`dev-token` はこのローカル演習用です。リモートアクセスには独自認証情報、TLS、ネットワーク制御を設定した Compose を使用してください。本番リハーサルでは MySQL と共有 Redis を使います。

演習が終わったら、コンテナとデータベースを削除します。

```bash
docker rm -f durable-workflow-server durable-workflow-server-queue-worker
docker volume rm durable-workflow-server-quickstart
```

### 公開イメージと Compose {#published-image--compose}

ソースなしで MySQL と Redis を使う複数コンテナ構成には、公開 Compose アーティファクトを使用します。

```bash
curl -fsSLO https://raw.githubusercontent.com/durable-workflow/server/main/docker-compose.published.yml

server_image=%%artifact.serverDockerHubImage%%
export DW_AUTH_TOKEN=dev-token

env DW_SERVER_IMAGE="$server_image" docker compose \
  -f docker-compose.published.yml up -d --wait
curl -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  http://localhost:8080/api/cluster/info \
  | jq '.topology | {current_shape, current_roles, execution_mode}'
```

### ポート {#ports}

| サービス | ポート | 用途 |
|---------|------|---------|
| Server API | 8080 | コントロールプレーンと Worker プロトコル |
| MySQL | 3306 | データベース（開発の便宜のため公開） |
| Redis | 6379 | キャッシュとキュー（開発の便宜のため公開） |

## 設定 {#configuration}

Server は環境変数で設定します。主な値は下記のとおりです。運用者向け `DW_*` 契約の全体は [Server 設定リファレンス](/docs/polyglot/server-config-reference)を参照してください。

### データベース {#database}

```bash
DB_CONNECTION=mysql
DB_HOST=mysql
DB_PORT=3306
DB_DATABASE=workflow
DB_USERNAME=workflow
DB_PASSWORD=secret
```

対応：MySQL 8.0 以降、PostgreSQL 13 以降、SQLite 3.35 以降。

### キャッシュとキュー {#cache-and-queue}

```bash
CACHE_STORE=redis
QUEUE_CONNECTION=redis

REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=null
REDIS_DB=0
```

キャッシュには[アトミックロック](https://laravel.com/docs/12.x/cache#atomic-locks)が必要です。キュードライバーは Redis、Amazon SQS、Beanstalkd、database に対応します。

Server 側の[タスクキュー受付上限](/docs/polyglot/task-queue-admission)とクエリタスクのバックプレッシャーには、キャッシュのアトミックロックが必要です。複数ノードで全 Server プロセスにわたるワークフロー・アクティビティ・クエリの制限を適用するには Redis を使用します。

### 認証 {#authentication}

Server は三つの認証モードに対応します。

**トークン認証**（既定）：

```bash
DW_AUTH_DRIVER=token
DW_AUTH_TOKEN=your-secret-token-here
```

すべてのリクエストに `Authorization: Bearer your-secret-token-here` が必要です。

最小権限の構成では、共有トークン一つではなくロール別トークンを設定します。

```bash
DW_AUTH_DRIVER=token
DW_WORKER_TOKEN=worker-secret
DW_OPERATOR_TOKEN=operator-secret
DW_ADMIN_TOKEN=admin-secret
```

Worker トークンは登録、ポーリング、ハートビート、完了を行えます。運用者トークンは開始、一覧、シグナル、クエリ、Update、修復、キャンセル、強制終了、アーカイブ、観測を行えます。管理者トークンは Namespace や保持管理などの管理エンドポイントを使用できます。

**HMAC 署名**：

```bash
DW_AUTH_DRIVER=signature
DW_SIGNATURE_KEY=your-signature-secret
```

リクエストには `hash_hmac('sha256', request_body, DW_SIGNATURE_KEY)` で計算した `X-Signature` を含めます。ロール別署名キーにも対応します。

```bash
DW_AUTH_DRIVER=signature
DW_WORKER_SIGNATURE_KEY=worker-signature-secret
DW_OPERATOR_SIGNATURE_KEY=operator-signature-secret
DW_ADMIN_SIGNATURE_KEY=admin-signature-secret
```

**認証なし**（開発専用）：

```bash
DW_AUTH_DRIVER=none
```

⚠️ **本番で `none` を使用しないでください。** 全エンドポイントが公開アクセス可能になります。

### Workflow パッケージ {#workflow-package}

Docker イメージは `durable-workflow/workflow` を導入します。バージョンは次で指定します。

```bash
# Build-time arg (set in docker-compose.yml or pass to docker build)
WORKFLOW_PACKAGE_REF=v2        # branch, tag, or commit
WORKFLOW_PACKAGE_SOURCE=       # custom Git remote (optional)
```

### 保持 {#retention}

PHP Server は Namespace の保持設定で、削除対象となる終了済み履歴を選びます。既定の有限保持期間は次で設定します。

```bash
DW_HISTORY_RETENTION_DAYS=30
```

各走査は Namespace の**現在の**設定を使います。期間の変更は、変更前に終了した履歴にも適用されます。更新日から各実行に新しい保持期間が始まるわけではありません。

| 設定変更 | 保持済みの終了実行への影響 |
| --- | --- |
| 有限保持の短縮 | 次の走査で古い実行が対象になります。 |
| 有限保持の延長 | 保持中の実行は対象から外れる場合があります。削除済み履歴は戻りません。 |
| `forever` へ変更 | 走査は何も選ばず、明示的な保持処理も除外します。 |
| `forever` から `bounded` へ | `retention_days` を指定し、既存の終了履歴もその期間で判定します。 |

例えば **10 月 19 日 12:00 UTC** に、**10 月 1 日 12:00 UTC** に終了した実行は 18 日経過しています。7 日の期間外で、90 日の期間内です。90 日から 7 日へ変えると直ちに対象になり、その後の処理で削除され得ます。選択条件は厳密な「より前」なので、境界時刻と完全に同じ終了時刻はその走査に含まれません。

#### 保持設定の変更を確認する {#review-a-retention-change}

保持期間を短縮する前に終了時刻を確認し、必要な履歴を保存します。重要な実行を[履歴エクスポート API](./server-api-reference.md#workflow-control-plane)で出力し、復旧可能なデータベースと外部ペイロードのバックアップを保持してください。Replay エクスポートには参照先オブジェクトも必要であり、データベースとストレージのバックアップの代わりにはなりません。

管理者の認証情報で Namespace を更新します。

```bash
curl -sS -X PUT "$DURABLE_WORKFLOW_SERVER_URL/api/namespaces/orders-prod" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"retention_mode":"bounded","retention_days":7}'
```

`forever` には `{"retention_mode":"forever","retention_days":null}` を送ります。有限保持へ戻す場合は、1～365 日の明示的な期間が必要です。

現在の Namespace 設定と、件数上限付きの削除対象一覧を確認します。

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/system/retention?limit=100" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

`cutoff` は今回の走査の境界です。`expired_run_count` は全滞留数ではなく、`scan_limit` までの応答 ID 数です。`scan_pressure: true` は上限到達を示します。この読み取りは履歴を削除しません。

更新は削除のプレビューでも猶予期間でもありません。通常の Worker ハートビートも、変更後に小規模で頻度制限された削除を起動できます。定期 `history:prune` や明示的なシステム処理も対象実行を扱います。ポリシー短縮**前に**バックアップと確認を行ってください。

#### 削除と保護 {#retention-cleanup-and-protections}

`run_ids` なしの `POST /api/system/retention/pass` は、現在の設定で期限切れの実行を上限まで選びます。`pruned`、`skipped`、`failed` と各実行の理由で、選択と削除完了を区別してください。

:::warning 実行 ID を指定すると経過日数の走査を迂回します

PHP Server に `run_ids` を指定すると、有限保持期間より新しいものも含め、指定した終了実行を直接対象にします。期限切れ一覧との積集合ではありません。対象ごとに破壊的操作として確認してください。通常の経過日数に基づく削除では `run_ids` を省略します。

:::

保持処理はアーカイブ済み実行と `forever` の Namespace を除外します。アーカイブは同じデータベースに履歴を保持するだけで、独立バックアップではありません。切り離したアクティビティの未完了など、他の保持条件でも削除が止まります。対象になっただけで削除済みと考えず、理由を確認してください。

1～365 日の有限保持を超える記録には、データベースに残すか、独立した検証済みエクスポートを管理するかを選びます。[長期履歴の手順](../configuration/pruning-workflows.md#keeping-history-beyond-database-retention)は `CloseTime`、ページング、外部バイト、削除前の照合を説明しています。公開 API にアーカイブ解除はないため、アーカイブ済み実行は後から Server の保持処理で削除できません。

削除は履歴、関連詳細、削除可能な外部ペイロードを取り除きます。後から期間を延長しても復元できません。[組み込みの削除ガイド](../configuration/pruning-workflows.md)はアプリケーション管理の別の処理で、その API は Server の Namespace 保持設定を適用しません。他の runtime には、PHP Server の手順を使う前に保持動作を確認してください。

### Namespace {#namespaces}

`server-bootstrap` はマイグレーションと `default` Namespace の初期化を行います。Namespace ヘッダーを省略したリクエストの既定値は、`DW_DEFAULT_NAMESPACE` で変更します。

```bash
DW_DEFAULT_NAMESPACE=default
```

API から Namespace を作成します。

```bash
curl -X POST http://localhost:8080/api/namespaces \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "production",
    "description": "Production workflows",
    "retention_days": 90
  }'
```

## ヘルスチェック {#health-checks}

### API の稼働確認 {#api-health}

```bash
curl http://localhost:8080/api/health
```

次の内容で `200 OK` を返します。

```json
{
  "status": "serving",
  "timestamp": "2026-04-15T12:00:00Z",
  "checks": {
    "database": "ok"
  },
  "topology": {
    "schema": "durable-workflow.v2.role-topology",
    "version": 4,
    "current_shape": "standalone_server",
    "current_process_class": "server_http_node",
    "current_roles": ["api_ingress", "control_plane", "matching", "history_projection"],
    "execution_mode": "remote_worker_protocol",
    "matching_role": {
      "queue_wake_enabled": true,
      "shape": "in_worker",
      "wake_owner": "worker_loop",
      "task_dispatch_mode": "poll",
      "partition_primitives": ["connection", "queue", "compatibility", "namespace"],
      "backpressure_model": "lease_ownership",
      "discovery_limits": {
        "poll_batch_cap": 100,
        "availability_ceiling_seconds": 1,
        "wake_signal_ttl_seconds": 60,
        "workflow_task_lease_seconds": 300,
        "activity_task_lease_seconds": 300
      }
    }
  }
}
```

### 公開トポロジーの概要 {#public-topology-summary}

認証なしの `GET /api/health` と `GET /api/ready` は、応答ノードの `topology` 概要を公開します。`/api/cluster/info` より意図的に小さな情報ですが、コントロールプレーンの認証や Namespace 解決前に、分割ロールのノードを識別するための次の情報を含みます。

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

`topology.matching_role.discovery_limits` は Workflow パッケージに組み込まれた固定の数値契約です。`poll_batch_cap` はポーリングで返す準備済み行数の上限、`availability_ceiling_seconds` は新しく実行可能になったタスクを秒未満の時刻差から保護する `available_at` の基盤間許容幅、`wake_signal_ttl_seconds` は `CacheLongPollWakeStore` 通知の既定 TTL、`workflow_task_lease_seconds` と `activity_task_lease_seconds` は既定のリース期間です。Worker や下流ツールが正式な契約として読むため、値を厳しくする変更はプロトコルの変更になります。

未準備のデプロイでも `/api/ready` に同じ概要があり、初期化の阻害要因がある間も、プローブは `server_http_node`、`scheduler_node`、`matching_node`、`execution_node` の応答を区別できます。

### 準備状態 {#readiness}

```bash
curl http://localhost:8080/api/ready
```

`/api/ready` はデプロイのゲートです。初期化の前提とロールアウトの安全性が準備済みまたは警告状態の場合だけ `200 OK` を返します。

機械可読フィールドは次のように扱います。

- `checks.migrations.repository_exists` と `checks.migrations.pending_migrations` は、マイグレーション管理表の有無と保留中の記録を示します。
- `checks.migrations.adoptable_migrations` は、履歴への採用だけが必要なテーブル作成マイグレーションです。`warning` であり閉鎖型障害ではないため、Server は稼働したまま採用を計画できます。
- `checks.migrations.blocking_migrations` は、トラフィック受付前に必要な安全上のマイグレーション記録です。空でなければ `checks.migrations.status = "pending"` として準備判定を拒否します。
- `checks.migrations.missing_tables` は存在しない永続テーブルを報告します。`checks.migrations.operator_surface` は、起動後に安全性を説明できる程度に v2 運用インターフェースが使えるかを示します。
- `checks.migrations.readiness_contract.version` は、スクリプトが解析すべき初期化・採用契約の改訂です。
- `checks.workflow_v2` は全 Namespace のロールアウト安全性を反映します。評価できない場合は `status: "blocked"` と `blocked_by`、`message`、`remediation` を返し、キューの症状ではなく上流の準備条件を修復できるようにします。

### ワークフロー初期化のゲート {#workflow-bootstrap-gate}

`checks.workflow_v2.status: "blocked"` は、準備状態だけでなくルートのゲートでもあります。v2 の初期化が阻害中は、開始・変更、スケジュール変更、ブリッジアダプター、Worker プロトコルを HTTP `503`、`reason: "workflow_v2_blocked"` で拒否します。ロールとプロトコル確認後、Namespace 解決前に動くため、拒否された要求から Namespace の存在は分かりません。

初期化ゲートの応答には常に次が含まれます。

- `reason: "workflow_v2_blocked"`：呼び出し元が説明文ではなく名前で分岐するための値
- `blocked_by`：`migrations` など、上流の阻害要因を順序付きで列挙
- `remediation`：解消するための運用指示。`/api/ready` の `checks.workflow_v2.remediation` と同じ内容

初期化ゲートが適用されるルート群：

- **ワークフロー開始と変更**：`/api/workflows` の開始、コマンド、実行指定コマンド
- **スケジュール変更**：`POST /api/schedules`、`PUT /api/schedules/{scheduleId}`、`DELETE /api/schedules/{scheduleId}`、`POST /api/schedules/{scheduleId}/pause`、`POST /api/schedules/{scheduleId}/resume`、`POST /api/schedules/{scheduleId}/trigger`、`POST /api/schedules/{scheduleId}/backfill`
- **ブリッジアダプター**：`POST /api/bridge-adapters/webhook/{adapter}`
- **Worker プロトコル**：登録、ハートビート、ワークフロー・クエリ・アクティビティタスクを含む全 `/api/worker` と `/api/worker/*`。Worker の応答形式と `X-Durable-Workflow-Protocol-Version` ヘッダーを維持し、SDK がコントロールプレーンと同じ `reason: "workflow_v2_blocked"` で分岐できるようにします。

スケジュールの**読み取り**は復旧調査のため除外します。`GET /api/schedules`、`GET /api/schedules/{scheduleId}`、`GET /api/schedules/{scheduleId}/history` は、他のルートが阻害中も使用できます。

### Server の能力 {#server-capabilities}

```bash
curl http://localhost:8080/api/cluster/info \
  -H "Authorization: Bearer $TOKEN"
```

Server のビルドバージョン、対応 SDK、エンジン能力、クライアント互換性方針、独立してバージョン管理するコントロールプレーンと Worker プロトコルのマニフェストを返します。

```json
{
  "server_id": "server-1",
  "version": "2.0.0",
  "default_namespace": "default",
  "supported_sdk_versions": {
    "php": ">=1.0",
    "python": ">=0.2,<1.0",
    "cli": ">=0.1,<1.0"
  },
  "client_compatibility": {
    "schema": "durable-workflow.v2.client-compatibility",
    "version": 1,
    "authority": "protocol_manifests",
    "top_level_version_role": "informational",
    "fail_closed": true
  },
  "capabilities": {
    "workflow_tasks": true,
    "activity_tasks": true,
    "signals": true,
    "queries": true,
    "updates": true,
    "schedules": true,
    "child_workflow_retry_policy": true,
    "child_workflow_timeouts": true,
    "payload_codecs": ["avro"],
    "response_compression": ["gzip", "deflate"]
  },
  "control_plane": {
    "version": "2",
    "header": "X-Durable-Workflow-Control-Plane-Version",
    "request_contract": { "schema": "durable-workflow.v2.control-plane-request.contract", "version": 1, "...": "..." },
    "response_contract": { "schema": "durable-workflow.v2.control-plane-response.contract", "version": 1, "...": "..." }
  },
  "worker_protocol": {
    "version": "1.0",
    "server_capabilities": {
      "long_poll_timeout": 30,
      "supported_workflow_task_commands": [
        "complete_workflow",
        "fail_workflow",
        "continue_as_new",
        "schedule_activity",
        "start_timer",
        "start_child_workflow"
      ],
      "workflow_task_poll_request_idempotency": true,
      "poll_status": true,
      "history_page_size_default": 500,
      "history_page_size_max": 1000,
      "activity_retry_policy": true,
      "activity_timeouts": true,
      "child_workflow_retry_policy": true,
      "child_workflow_timeouts": true,
      "parent_close_policy": true,
      "non_retryable_failures": true,
      "response_compression": ["gzip", "deflate"],
      "history_compression": {
        "supported_encodings": ["gzip"],
        "compression_threshold": 8192
      }
    }
  }
}
```

`client_compatibility.authority: "protocol_manifests"` をクライアント確認の基準にします。最上位の `version` はビルド識別です。CLI と SDK は `control_plane.version`、`control_plane.request_contract`、`worker_protocol.version` がないか未対応なら、安全に拒否してください。

### ロールのトポロジーとデプロイ形態 {#role-topology-and-deployment-shape}

各フィールドの詳細は [Server ロールトポロジー](/docs/polyglot/server-role-topology)にあります。この節は `cluster/info` の例として使い、対応形態、権限境界、障害、拡張、移行経路をまとめて確認する場合は専用ページを使ってください。

`GET /api/cluster/info` は `topology` マニフェストも公開します。応答ノードの機械可読ロールマップなので、コンテナ名や手順書から役割を推測せず、一つの契約を参照できます。

```json
{
  "topology": {
    "schema": "durable-workflow.v2.role-topology",
    "version": 2,
    "supported_shapes": [
      "embedded",
      "standalone_server",
      "split_control_execution"
    ],
    "role_vocabulary": [
      "api_ingress",
      "control_plane",
      "matching",
      "history_projection",
      "scheduler",
      "execution_plane"
    ],
    "current_shape": "standalone_server",
    "current_process_class": "server_http_node",
    "current_roles": [
      "api_ingress",
      "control_plane",
      "matching",
      "history_projection"
    ],
    "execution_mode": "remote_worker_protocol",
    "matching_role": {
      "queue_wake_enabled": true,
      "shape": "in_worker",
      "wake_owner": "worker_loop",
      "task_dispatch_mode": "poll",
      "partition_primitives": [
        "connection",
        "queue",
        "compatibility",
        "namespace"
      ],
      "backpressure_model": "lease_ownership",
      "discovery_limits": {
        "poll_batch_cap": 100,
        "availability_ceiling_seconds": 1,
        "wake_signal_ttl_seconds": 60,
        "workflow_task_lease_seconds": 300,
        "activity_task_lease_seconds": 300
      }
    },
    "shape_assignments": {
      "embedded": {
        "process_classes": [
          {
            "name": "application_process",
            "roles": [
              "control_plane",
              "matching",
              "history_projection",
              "scheduler",
              "execution_plane"
            ]
          }
        ]
      },
      "standalone_server": {
        "process_classes": [
          {
            "name": "server_http_node",
            "roles": [
              "api_ingress",
              "control_plane",
              "matching",
              "history_projection"
            ]
          },
          {
            "name": "scheduler_node",
            "roles": ["scheduler"]
          },
          {
            "name": "worker_node",
            "roles": ["execution_plane"]
          }
        ]
      },
      "split_control_execution": {
        "process_classes": [
          {
            "name": "ingress_node",
            "roles": ["api_ingress"]
          },
          {
            "name": "control_plane_node",
            "roles": ["control_plane", "history_projection"]
          },
          {
            "name": "scheduler_node",
            "roles": ["scheduler"]
          },
          {
            "name": "matching_node",
            "roles": ["matching"]
          },
          {
            "name": "execution_node",
            "roles": ["execution_plane"]
          }
        ]
      }
    },
    "authority_boundaries": {
      "control_plane": {
        "writes": [
          "workflow_instances",
          "workflow_runs.status",
          "workflow_tasks.lifecycle"
        ]
      },
      "execution_plane": {
        "writes": [
          "workflow_tasks.outcomes",
          "activity_attempts",
          "worker_compatibility_heartbeats"
        ]
      },
      "matching": {
        "writes": [
          "workflow_tasks.leases",
          "activity_tasks.leases"
        ]
      },
      "history_projection": {
        "writes": [
          "history_events",
          "workflow_run_summaries",
          "workflow_history_exports"
        ]
      },
      "scheduler": {
        "writes": [
          "workflow_schedules.fire_state",
          "workflow_starts.scheduled"
        ]
      },
      "api_ingress": {
        "writes": ["worker_registrations"]
      }
    },
   "failure_domains": {
      "control_plane_down": {
        "effect": "workers_continue_claimed_tasks_only_until_lease_expiry",
        "operator_signal": "operator_commands_fail_fast"
      },
      "execution_plane_down": {
        "effect": "ready_tasks_accumulate_without_loss",
        "operator_signal": "operators_see_ready_depth_growth"
      },
      "matching_down": {
        "effect": "claim_falls_back_to_direct_ready_task_discovery",
        "operator_signal": "ready_depth_rises_while_claim_rate_falls"
      },
      "history_projection_down": {
        "effect": "projection_reads_may_stale_while_durable_writes_continue",
        "operator_signal": "projection_lag_seconds_may_increase"
      },
      "scheduler_down": {
        "effect": "scheduled_workflows_stop_firing_and_record_missed_runs",
        "operator_signal": "operators_see_missed_schedule_state"
      },
      "api_ingress_down": {
        "effect": "external_http_traffic_stops_at_the_edge",
        "operator_signal": "embedded_in_process_calls_may_continue"
      }
    },
    "scaling_boundaries": {
      "api_ingress": "incoming_http_request_rate",
      "control_plane": "operator_commands_and_run_lifecycle_transitions",
      "matching": "ready_task_rate_and_poller_count",
      "history_projection": "durable_event_rate",
      "scheduler": "active_schedule_count",
      "execution_plane": "workflow_and_activity_task_rate"
    },
    "migration_path": [
      {
        "step": "audit_role_boundaries",
        "result": "tooling flags cross-role writes before runtime shape changes",
        "reversible": true
      },
      {
        "step": "expose_role_bindings",
        "result": "container seams allow out-of-process adapters without patching the package",
        "reversible": true
      },
      {
        "step": "introduce_dedicated_matching_shape",
        "result": "matching can run as its own process class without changing the claim contract",
        "reversible": true
      },
      {
        "step": "split_history_projection",
        "result": "history and projections can move out of process without introducing a second writer",
        "reversible": true
      },
      {
        "step": "split_scheduler",
        "result": "schedule firing can move behind leader election while single-replica deployments stay legal",
        "reversible": true
      },
      {
        "step": "optional_execution_partitioning",
        "result": "workers can partition by namespace, connection, queue, and compatibility",
        "reversible": true
      }
    ],
    "kernel_invariants": [
      {
        "id": "single_persistence_engine",
        "summary": "one workflow database backs every topology shape; role split does not introduce a second persistence engine",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "single_worker_protocol",
        "summary": "one HTTP worker protocol carries claim, complete, fail, and heartbeat traffic across every topology; role split does not fork the worker contract",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "single_history_writer",
        "summary": "history_events has exactly one durable writer per logical event regardless of where the history/projection role runs",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "single_control_authority_per_run",
        "summary": "every mutation of a given workflow run routes through one control-plane authority; per-run row locks serialise transitions across replicas",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "embedded_topology_remains_supported",
        "summary": "the embedded shape where one process fills every role MUST stay legal; existing embedded hosts are never forced to migrate",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "role_split_is_topology_only",
        "summary": "splitting roles is a topology change, not a product fork; collapsing the roles back onto a single process is always a legal topology",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      }
    ]
  },
  "coordination_health": {
    "schema": "durable-workflow.v2.coordination-health.contract",
    "version": 2,
    "namespace_scope": "all_namespaces",
    "status": "ok",
    "http_status": 200,
    "warning_checks": [],
    "error_checks": [],
    "categories": {
      "correctness": "ok"
    },
    "checks": [
      {
        "name": "worker_compatibility",
        "status": "ok",
        "category": "correctness",
        "message": null
      },
      {
        "name": "activity_path",
        "status": "ok",
        "category": "correctness",
        "message": null
      }
    ],
    "routing_drains": {
      "queues_with_drains": 0,
      "draining_build_id_count": 0,
      "active_worker_count": 0,
      "draining_worker_count": 0,
      "stale_worker_count": 0,
      "queues": []
    }
  }
}
```

`topology.version` はロールマニフェストのスキーマバージョンであり、Server のビルドバージョンではありません。自動化では、新しい改訂のフィールドを想定する前に確認します。現行契約は `supported_shapes`、`role_vocabulary`、`current_shape`、`current_process_class`、`current_roles`、`execution_mode`、`matching_role`、`role_catalog`、`shape_assignments`、`authority_boundaries`、`authority_surfaces`、`failure_domains`、`supported_topologies`、`scaling_boundaries`、`migration_path`、`kernel_invariants` を含みます。

各フィールドの意味は次のとおりです。

- `supported_shapes` は有効な製品トポロジーを示します。
- `role_vocabulary` は固定された v2 ロール名です。自動化と診断の正式語彙として扱います。
- `current_shape`、`current_process_class`、`current_roles` は問い合わせた現在のノードを説明します。宣言された識別子である `current_process_class` と、現在の形態に対する `shape_assignments` のロール群を照合して検証します。
- `execution_mode` は、組み込みのローカルキュー実行（`local_queue_worker`）と独立 Server の Worker プロトコル実行（`remote_worker_protocol`）を区別します。
- `matching_role.queue_wake_enabled`、`matching_role.shape`、`matching_role.wake_owner`、`matching_role.task_dispatch_mode`、`matching_role.partition_primitives`、`matching_role.backpressure_model` は、Worker 内起床処理か専用の修復・マッチングループか、安定したルーティング軸、適用中の永続受付境界を示します。
- `matching_role.discovery_limits` はパッケージに組み込まれた数値契約を固定します。`poll_batch_cap` はポーリングごとの準備済みタスク数、`availability_ceiling_seconds` は秒未満の時刻差を許容する `available_at` の幅、`wake_signal_ttl_seconds` は起床通知 TTL、`workflow_task_lease_seconds` と `activity_task_lease_seconds` は既定リースです。ソースを検索せずに契約との一致を確認でき、値の厳格化はプロトコル変更です。
- `role_catalog` と `authority_surfaces` は、各ロールのインターフェースと永続変更経路を示します。
- `shape_assignments` は、各形態で許可されたプロセスクラスとロール群を示します。
- `supported_topologies` は、対応するデプロイ群と必要ノードクラスの概要です。
- `authority_boundaries` は各ロールが変更する永続書き込み面で、分割前に権限のずれを検出できます。
- `failure_domains` は、ロール停止時に最初に現れる運用上の劣化を示します。
- `scaling_boundaries` は、ロール分割時の主な負荷軸です。
- 認証済みのホストルートは、ノードが必要な HTTP 制御面を提供していなければ拒否します。`503`、`reason: "topology_role_unavailable"`、`current_shape`、`current_process_class`、`current_roles`、`required_roles`、`missing_roles` を返し、正しいノードへ送り直せるようにします。
- `coordination_health` は同じ検出から返す全体のロールアウト安全性です。`all_namespaces` 範囲で状態と HTTP の姿勢、準備判定にも使う警告・エラー名を集約します。上流の準備問題で評価できなければ `blocked_by`、`message`、`remediation` を含めます。
- `coordination_health.checks[]` は固定名の `activity_path` を、`worker_compatibility`、`task_transport`、`routing_health`、`durable_resume_paths`、プロジェクション・スケジューラー確認と共に含みます。`activity_path` は `task_transport` のアクティビティ版です。開始待ち・試行・全体・ハートビートの未適用期限超過を `timeout_overdue`、`oldest_timeout_overdue_at`、`max_timeout_overdue_age_ms` で、継続再試行を `retrying`、`oldest_retrying_started_at`、`max_retrying_age_ms` で示します。名前変更はプロトコル変更です。
- `coordination_health.routing_drains` はキューと Namespace 全体でドレイン中のビルド群を集約します。`queues_with_drains` が正なら、少なくとも一群から意図的にトラフィックを遠ざけています。
- `migration_path` は、別エンジンを作らずに独立配布からロールを隔離する順序付き手順です。各 `reversible: true` は、隔離の少ない形態へ戻しても合法なトポロジーであることを示します。
- `kernel_invariants` は形態を問わず維持する `single_persistence_engine`、`single_worker_protocol`、`single_history_writer`、`single_control_authority_per_run`、`embedded_topology_remains_supported`、`role_split_is_topology_only` を列挙します。各 `applies_to` は対象形態です。自動化は変更前に、不変条件が維持されるかの確認へ使用できます。

ロール分割は別エンジンや別のコントロール API ではなく、トポロジーの変更です。`standalone_server` から明示的な `split_control_execution` へ進んでも、同じ検出面を使います。`current_shape`、`current_roles`、`execution_mode`、`matching_role`、`shape_assignments`、`authority_boundaries`、`failure_domains`、`scaling_boundaries`、`migration_path` は一つのマニフェストとしてバージョン管理し、Server と更新ツールが同じ契約を判断できます。

同じ制約を `topology.kernel_invariants` から機械可読で確認できます。自動化は変更前に、二つ目の永続エンジン、分岐した Worker プロトコル、二つ目の履歴書き込み元、元へ戻せない移行が導入されていないかを確認できます。

ホストルートのゲートは認証済み API と Worker エンドポイントだけに適用します。現在の HTTP 制御面を持たない `scheduler_node`、`matching_node`、`execution_node` でも、`GET /api/health`、`GET /api/ready`、認証付き `GET /api/cluster/info` は検出、稼働確認、トポロジー調査に使用できます。

搬送方式に依存しない外部ハンドラー向けには、同じ接続先が `worker_protocol.external_execution_surface_contract` を公開します。[アクティビティ相当の外部実行面](/docs/polyglot/external-execution)を定義し、入出力エンベロープへリンクします。Replay、`ContinueAsNew`、シグナル・Update・クエリ順序、イベント履歴解釈は実際の runtime 内に残します。

クライアントコード向けの主な注意点：

- アプリケーションのバージョンは `version` で、`server_version` ではありません。
- ワークフロータスクのコマンド能力は `worker_protocol` の直下ではなく、`worker_protocol.server_capabilities.supported_workflow_task_commands` にあります。同じオブジェクトを Worker の各応答の `server_capabilities` に含めます。
- `worker_protocol.server_capabilities.poll_status` は、取得タスクがなくても機械可読の `poll_status` を維持し、`empty`、`throttled`、`unavailable`、`draining` を説明文解析なしで区別できることを示します。
- 再試行、タイムアウト、親終了ポリシー、再試行不可の失敗などのコマンド設定能力も `server_capabilities` へ返すので、別途 cluster-info を取らずに交渉できます。
- v2 の唯一のペイロードコーデックは `capabilities.payload_codecs` の `['avro']` です。PHP 専用の v1 取り込み・排出用シリアライザーは内部移行用で、runtime 能力に現れません。

## Worker の接続 {#connecting-workers}

Worker が Server にポーリングして、ワークフローやアクティビティを実行します。API 全体は [Worker プロトコル](/docs/polyglot/worker-protocol)を、ルートのロール表、Namespace 解決、正確な登録ペイロードは [Namespace、認証、Worker 登録](/docs/polyglot/namespace-auth-workers)を参照してください。

### PHP Worker {#php-workers}

フレームワーク非依存の PHP アプリケーションやリモート Worker は、独立 Server 用 SDK を使います。Laravel や組み込み Workflow パッケージは導入しません。

<!-- docs-example id="server.php-sdk.install" -->
```bash
composer require %%artifact.phpSdkComposerPackage%%
```

クライアントを作り、Worker にワークフローやアクティビティの callable を登録します。

```php
use DurableWorkflow\Client;
use DurableWorkflow\Worker;
use DurableWorkflow\Worker\WorkflowContext;

$client = new Client(
    'http://localhost:8080',
    token: getenv('DURABLE_WORKFLOW_AUTH_TOKEN') ?: null,
    namespace: 'default',
);

$worker = new Worker($client, taskQueue: 'polyglot-php');
$worker->registerWorkflow(
    'invoice',
    static function (WorkflowContext $context, string $invoiceId): array {
        $context->activity('charge-card', [$invoiceId]);

        return ['invoice_id' => $invoiceId, 'status' => 'paid'];
    },
);
$worker->run();
```

クライアント、認証、ペイロード、Worker のライフサイクルは [PHP SDK ガイド](/docs/polyglot/php/)を参照してください。別の `durable-workflow/workflow` パッケージは Laravel 組み込み runtime で、公開 Server 内でもエンジンとして使われます。組み込みワークフローはアプリケーションのキューワーカーでローカルタスクを実行し、この独立 Server を必要としません。

### Python Worker {#python-workers}

Python Worker は `durable-workflow` SDK を使用します。

```bash
pip install %%artifact.pythonPackagePin%%
```

Worker の設定は [Python SDK](/docs/polyglot/python) ガイドを参照してください。

### その他の言語の Worker {#custom-language-workers}

どの言語でも、次の手順で Worker を実装できます。
1. `POST /api/worker/register` で登録
2. `POST /api/worker/workflow-tasks/poll`、`POST /api/worker/activity-tasks/poll`、`POST /api/worker/query-tasks/poll` でロングポーリング
3. `POST /api/worker/workflow-tasks/{id}/complete`、`POST /api/worker/activity-tasks/{id}/complete`、`POST /api/worker/query-tasks/{id}/complete` で完了

すべてのリクエストに次が必要です。
- `Authorization: Bearer $TOKEN`
- `X-Namespace: your-namespace`
- `X-Durable-Workflow-Protocol-Version: 1.0`

Server は Namespace の存在を検証します。Worker やクライアントを向ける前に `POST /api/namespaces` で登録してください。なければ `404`、`reason: "namespace_not_found"` を返します。

curl による手順は [Server README](https://github.com/durable-workflow/server#getting-started-end-to-end-workflow)を参照してください。

登録スロット、有効リース上限、毎分配信予算、クエリのバックプレッシャー調整は、[タスクキューの受付制限](/docs/polyglot/task-queue-admission)を参照してください。

## CLI {#cli}

[Durable Workflow CLI](/docs/polyglot/cli) は Server のシェルインターフェースです。

```bash
# Install — Linux and macOS
curl -fsSL https://durable-workflow.com/install.sh | sh

# Install — macOS (Homebrew alternative)
brew install durable-workflow/tap/dw

# Install — Windows (PowerShell)
# irm https://durable-workflow.com/install.ps1 | iex

# Configure
export DURABLE_WORKFLOW_SERVER_URL=http://localhost:8080
export DURABLE_WORKFLOW_AUTH_TOKEN=your-token
export DURABLE_WORKFLOW_NAMESPACE=default

# Use
dw server:health
dw workflow:list
dw workflow:start --type=my-workflow --input='["value"]'
dw workflow:start --type=my-workflow --input-file=input.json
```

プラットフォーム自動判定インストーラーとバイナリは [CLI のインストール](/docs/polyglot/cli#install)を参照してください。

タスクキューコマンドには、ワークフロー、アクティビティ、クエリの受付状態が含まれます。Worker 不在、スロット飽和、Server のリース・配信レート制限、クエリの溢れを区別できます。

## デプロイ {#deployment}

本番に送る前に、[セルフホストのデプロイガイド](/docs/deployment)で対応トポロジーを選びます。ローカル開発、単一ノード本番、小規模クラスタ、Kubernetes マニフェスト、サポート主導の構成を区別しています。

セルフサービスの小規模クラスタは、ロードバランサー下の 2～3 台のステートレス API、一つの外部 MySQL/PostgreSQL、共有 Redis、独立拡張の Worker、一つだけのスケジューラー・保守プロセスに限定します。リリースごとに全停止または [ローリング更新](/docs/rolling-upgrades)を選びます。ローリング契約のバージョン差、スキーマ、ドレイン、準備、ロールバック要件が必要です。SQLite クラスタ、Redis なし複数ノード、重複スケジューラー、active/active 複数リージョン、プロバイダー別フェイルオーバーは別途検証まで対象外です。独立バージョンの Helm は [デプロイガイド](/docs/deployment#helm-chart-for-kubernetes)にあります。[active/passive 複数リージョン](/docs/deployment#activepassive-multi-region)はサポート主導の評価資料であり、実証済みセルフサービス契約ではありません。各候補リージョンも単一リージョン・小規模クラスタから始める必要があります。

セルフホストでは、ソースビルドではなく公開イメージから始めます。

- Docker Hub：`%%artifact.serverDockerHubImage%%`
- GitHub Container Registry：`%%artifact.serverGhcrImage%%`
- 公開イメージ用 Compose：[ `docker-compose.published.yml`](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml)
- Kubernetes マニフェスト：[`k8s/`](https://github.com/durable-workflow/server/tree/main/k8s)

本番はバージョンタグやダイジェストに固定し、ロール別認証情報を使い、受付前に初期化・マイグレーションを実行してください。`/api/ready`、`/api/cluster/info`、Worker 登録で準備を実証します。`/api/health` だけでトラフィックを切り替えないでください。

## API リファレンス {#api-reference}

必須ヘッダー、ロール、Worker プロトコル、外部ペイロード保存、エラー理由を含む全エンドポイントの説明は [Server API リファレンス](/docs/polyglot/server-api-reference)を参照してください。

Server には三つの API 面があります。

### コントロールプレーン {#control-plane}

ワークフローの開始、詳細、シグナル、クエリ、Update、キャンセル、強制終了、および Namespace、キュー、スケジュール、検索属性、Worker を管理します。全要求に `X-Durable-Workflow-Control-Plane-Version: 2` が必要です。欠けると `missing_control_plane_version` で拒否します。

主なエンドポイント：

- `POST /api/workflows`：ワークフロー開始
- `GET /api/workflows/{id}`：詳細取得
- `POST /api/workflows/{id}/signal/{name}`：シグナル送信
- `POST /api/workflows/{id}/query/{name}`：クエリ実行
- `POST /api/workflows/{id}/update/{name}`：Update 実行
- `POST /api/workflows/{id}/cancel`：直ちにキャンセルとして終了
- `POST /api/workflows/{id}/terminate`：直ちに強制終了
- `GET /api/workflows/{id}/runs/{runId}/history`：履歴一覧
- `GET /api/workflows/{id}/runs/{runId}/history/export`：Replay バンドル出力
- `GET /api/namespaces`、`POST /api/namespaces`、`GET|PUT /api/namespaces/{namespace}`：Namespace 管理
- `GET /api/workers`、`GET|DELETE /api/workers/{id}`：Worker 群管理
- `GET /api/task-queues`、`GET /api/task-queues/{taskQueue}`：滞留、ポーラー、リース、受付状態
- `GET|POST /api/schedules`、`GET|PUT|DELETE /api/schedules/{id}`、`POST /api/schedules/{id}/{pause|resume|trigger|backfill}`：スケジュール管理
- `GET|POST|DELETE /api/search-attributes`：検索属性管理
- `GET|POST|PUT|DELETE /api/service-endpoints...`：管理者専用サービスカタログ、子サービス、操作バインディング、永続サービス呼び出しスナップショット
- `POST /api/system/repair/pass`、`POST /api/system/activity-timeouts/pass`、`POST /api/system/retention/pass`：運用処理

ワークフローのコントロール応答は、履歴一覧も含め、操作と応答契約のバージョンを識別する `control_plane` メタデータを含みます。履歴エクスポートだけはエンベロープで包まずにバンドルをそのまま返し、チェックサムと任意の署名が、クライアントが受け取る実体と一致するようにします。

検証失敗は HTTP 422 と `reason: validation_failed`、`errors`、`validation_errors` を返します。ワークフロー操作は `control_plane.reason` と `control_plane.validation_errors` にも反映します。現行の実行指定コマンドは URL の `run_id` を応答と `control_plane.run_id` に含め、インスタンス指定と実行指定を区別できます。

タスクキューの情報で、滞留増加、Worker の空き不足、Server の受付制限を区別します。`GET /api/task-queues` は各キューの概要、`GET /api/task-queues/{taskQueue}` は `pollers` と `current_leases` を含む詳細です。両方で `stats.approximate_backlog_count`、`stats.approximate_backlog_age_seconds`、種類別の `stats.workflow_tasks.*` と `stats.activity_tasks.*` が分かります。詳細の `admission` は Worker 容量不足とキュー・クエリ制限を区別します。全体の流入・配信レートは `operator_metrics.backlog.tasks_added_last_minute` と `operator_metrics.backlog.tasks_dispatched_last_minute`、同じキュー内の比較は `stats.tasks_added_last_minute` と `stats.tasks_dispatched_last_minute` を使います。

### Worker プロトコル {#worker-protocol}

Worker が登録、ポーリング、ハートビート、完了に使います。`X-Durable-Workflow-Protocol-Version: 1.0` が必要です。

主なエンドポイント：

- `POST /api/worker/register`：登録
- `POST /api/worker/workflow-tasks/poll`：ワークフロータスクのロングポーリング
- `POST /api/worker/workflow-tasks/{id}/complete`：ワークフロータスク完了
- `POST /api/worker/query-tasks/poll`：Server が送るクエリタスクのロングポーリング
- `POST /api/worker/query-tasks/{id}/complete`：クエリタスク完了
- `POST /api/worker/query-tasks/{id}/fail`：クエリタスク失敗・拒否
- `POST /api/worker/activity-tasks/poll`：アクティビティのロングポーリング
- `POST /api/worker/activity-tasks/{id}/complete`：アクティビティ完了

詳細は [Worker プロトコル](/docs/polyglot/worker-protocol)を参照してください。

### 検出（バージョン指定なし） {#discovery-unversioned}

`X-Durable-Workflow-Control-Plane-Version` が**不要**なのは、検出とヘルスのエンドポイントだけです。

- `GET /api/health`：稼働確認と公開 `topology` 概要（認証不要）
- `GET /api/ready`：準備確認と同じ `topology` 概要（認証不要）
- `GET /api/cluster/info`：Server 能力、プロトコルの版、唯一の Avro コーデック。クライアントは最初にこれで対応コントロールプレーンと Worker プロトコルを検出します。

## 問題の調査 {#troubleshooting}

### Worker がタスクを受け取らない {#workers-not-receiving-tasks}

**確認：**
1. Worker は登録済みですか？ `curl http://localhost:8080/api/workers -H "Authorization: Bearer $TOKEN" -H "X-Durable-Workflow-Control-Plane-Version: 2" -H "X-Namespace: default"`
2. 正しいタスクキューをポーリングしていますか？
3. 開始したワークフローのキューと一致しますか？
4. キャッシュは Server 間で共有されていますか？

### ロングポーリングが直ちにタイムアウトする {#long-poll-connections-timing-out-immediately}

**確認：**
1. キャッシュはアトミックロックに対応していますか？ `php artisan workflow:v2:doctor --strict` で確認します。
2. Server から Redis に到達できますか？
3. ロードバランサーのタイムアウトはロングポーリング（既定 60 秒）より長いですか？

### データベース接続エラー {#database-connection-errors}

**確認：**
1. データベースのホストとポートは正しいですか？
2. 認証情報は有効ですか？
3. データベースは存在しますか？
4. マイグレーションは実行済みですか？ `php artisan migrate:status`

### 認証の失敗 {#auth-failures}

**確認：**
1. `DW_AUTH_DRIVER` はクライアントの認証方式に一致しますか？
2. Server とクライアントのトークン・HMAC 秘密は一致しますか？
3. `Authorization: Bearer $TOKEN` または HMAC 署名ヘッダーがありますか？

## 関連情報 {#learn-more}

- [Worker プロトコル](/docs/polyglot/worker-protocol)：全 API 契約
- [組み込みから Server への移行](/docs/polyglot/embedded-to-server)：Laravel v2 アプリケーションからの導入
- [Python SDK](/docs/polyglot/python)：Python Worker の実装
- [CLI](/docs/polyglot/cli)：コマンドライン
- [Server リポジトリ](https://github.com/durable-workflow/server)：ソース、Issue、リリース
