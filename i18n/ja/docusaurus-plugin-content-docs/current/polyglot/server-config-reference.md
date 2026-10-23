---
sidebar_position: 3
title: Server 設定リファレンス
description: Durable Workflow Server の環境変数、既定値、従来の別名、実行基盤の設定リファレンス。
tags:
  - server
  - config
  - reference
  - operations
keywords:
  - Durable Workflow Server 設定
  - DW 環境変数
  - Server 環境監査
  - ワークフロー Server 環境
---

# Server 設定リファレンス {#server-config-reference}

このページは Durable Workflow Server イメージの運用者向け `DW_*` 環境変数の契約を説明します。デプロイ用テンプレートの作成、本番設定の確認、従来の `WORKFLOW_*` / `ACTIVITY_*` 名から v2 Server の契約への移行に使用してください。

Server は `DB_*`、`REDIS_*`、`QUEUE_CONNECTION`、`CACHE_STORE` など、通常の Laravel 実行時設定も使用します。これらは Durable Workflow API の設定ではなくデプロイ基盤の設定なので、別の表に記載しています。

## 変更が反映されるタイミング {#how-changes-take-effect}

公開済みの PHP Server イメージは、エントリーポイントで `php artisan config:cache` を実行します。環境変数はその起動時に解決され、Laravel の設定キャッシュに書き込まれます。環境ファイル、オーケストレーターの環境変数定義、マウントされた設定ファイルを変更しても、実行中のデプロイには自動反映されません。

新しい設定で、対象の HTTP API レプリカ、ローカル Laravel キューワーカー、スケジューラープロセスをすべて再起動または置換してください。SDK Worker 自身のクライアント設定や Worker 設定を変更する場合は、常駐 SDK Worker も別途再起動します。API の再起動だけでは、実行中のキューワーカーやスケジューラーは更新されません。データベースとキャッシュを共有する各ロールで、意図した設定を揃えてください。

ローリング変更中は、各ノードが自身の読み込んだ制限を適用します。受付カウンターを共有していても、異なる設定のノードで制限が一致するわけではありません。同じリクエストが、ある API レプリカでは受け付けられ、別のレプリカでは拒否される場合があります。制限を一貫して切り替える必要がある場合は、次の手順を使用します。

1. 呼び出し元からの新規送信を一時停止し、対象 API レプリカを入口のルーティングから外します。処理中のリクエストは完了させます。対象のキューとスケジューラーロールを、それぞれの終了猶予に従って正常終了させます。
2. 対象のすべてのロールに同じ設定を適用し、再起動または置換します。各コンテナのエントリーポイントで設定キャッシュを再作成します。
3. 起動ログの設定エラー、準備状態、変更した制限の動作を確認してから、入口と呼び出し元の送信を再開します。[デプロイと準備状態のガイド](/docs/deployment#readiness-contract)を参照してください。

データベースに保存される運用設定は、別のライフサイクルに従います。以下の変更が成功すると、Server を再起動せずに、その後の操作で新しい値を使用できます。

| 設定 | 即時変更 | 範囲と制限 |
| --- | --- | --- |
| Namespace の説明と保持 | [`PUT /api/namespaces/{namespace}`](/docs/polyglot/server-api-reference#namespace-and-storage)、または [`dw namespace:update`](/docs/polyglot/cli-reference#namespace-and-search-attribute-commands) | 保持ポリシーはその後の保持処理に適用されます。変更しても削除済みのデータは戻りません。[Server の保持設定](/docs/polyglot/server#retention)を参照してください。 |
| Namespace の外部ペイロード保存ポリシー | [`PUT /api/namespaces/{namespace}/external-storage`](/docs/features/external-payload-storage#configuring-a-namespace) | 保存済みの Namespace ポリシーを変更します。プロバイダーの認証情報、設定済みファイルシステムのディスクなどのプロセス設定には、上記の再起動が必要です。既存実行が参照するオブジェクトへのアクセスを維持してください。 |
| Namespace の検索属性定義 | [`POST` / `DELETE /api/search-attributes`](/docs/polyglot/server-api-reference#schedules-and-search-attributes) | 後続リクエストが使用する登録情報を更新します。ワークフロー履歴を書き換えたり、環境変数によるサイズ・個数制限を置き換えたりはしません。 |

このリファレンスの `DW_*` の既定値と上限は、保存済み状態を変更する明示的なコントロールプレーン操作が文書化されている場合を除き、プロセス設定です。Server は設定ファイルの変更をポーリングしません。

## 契約の適用方法 {#how-the-contract-is-enforced}

Server リポジトリの `config/dw-contract.php` が正式な契約です。コンテナ起動時の `php artisan env:audit` は、未知の `DW_*` 変数や従来の名前を検出すると警告します。警告を出して起動する代わりにエントリーポイントを失敗させるには、`DW_ENV_AUDIT_STRICT=1` を設定します。

```bash
DW_ENV_AUDIT_STRICT=1
DW_AUTH_DRIVER=token
DW_ADMIN_TOKEN="${DW_ADMIN_TOKEN}"
DW_OPERATOR_TOKEN="${DW_OPERATOR_TOKEN}"
DW_WORKER_TOKEN="${DW_WORKER_TOKEN}"
```

従来の名前はフォールバック専用です。新しいデプロイでは常に `DW_*` 名を使ってください。Server が従来の値を引き続き使用できる場合でも、警告は解消すべき移行作業として扱います。

## Server の識別情報とモード {#server-identity-and-mode}

| 変数 | 既定値 | 用途 | 従来の別名 |
| --- | --- | --- | --- |
| `DW_MODE` | `service` | Server モード。`service` は外部 Worker にポーリングさせ、`embedded` は Laravel キューを通じてローカルに配信します。 | `WORKFLOW_SERVER_MODE` |
| `DW_SERVER_ID` | `gethostname()` | リース所有権と Worker 登録に使用する Server インスタンスの一意な識別子。 | `WORKFLOW_SERVER_ID` |
| `DW_SERVER_TOPOLOGY_SHAPE` | `standalone_server` | クラスタ検出で通知するトポロジー。例：`embedded`、`standalone_server`、`split_control_execution`。 | `WORKFLOW_SERVER_TOPOLOGY_SHAPE` |
| `DW_SERVER_PROCESS_CLASS` | `server_http_node` | 選択したトポロジー内でこのノードが通知するプロセスクラス。例：`server_http_node`、`worker_node`、`scheduler_node`。 | `WORKFLOW_SERVER_PROCESS_CLASS` |
| `DW_SERVER_KEY` | コンテナ起動時に生成 | 任意の Server 内部実行時キー。未設定の場合、Docker イメージが自動生成します。 | - |
| `DW_DEFAULT_NAMESPACE` | `default` | リクエストに Namespace ヘッダーがない場合に使用する Namespace。 | `WORKFLOW_SERVER_DEFAULT_NAMESPACE` |
| `DW_TASK_DISPATCH_MODE` | 未設定 | `workflows.v2.task_dispatch_mode` を上書きします。service モードでは、別の値を指定しなければ `poll` が既定値です。 | `WORKFLOW_V2_TASK_DISPATCH_MODE` |
| `DW_WORKFLOW_MEMO_MIGRATION_RECOVERY` | 未設定 | 記録されていないメモ書き換えに対する一度限りの MySQL 復旧証明。`raw-json` または `envelope-prefix:<last-converted-id>`。 | `WORKFLOW_SERVER_WORKFLOW_MEMO_MIGRATION_RECOVERY` |
| `DW_EXTERNAL_EXECUTOR_CONFIG_PATH` | 未設定 | 外部実行ハンドラーのマッピングを定義する `durable-workflow.external-executor.config` JSON ファイルのパス。 | `WORKFLOW_SERVER_EXTERNAL_EXECUTOR_CONFIG_PATH` |
| `DW_EXTERNAL_EXECUTOR_CONFIG_OVERLAY` | 未設定 | Server の検証と検出の前に適用する、外部実行設定ファイル内のオーバーレイ名。 | `WORKFLOW_SERVER_EXTERNAL_EXECUTOR_CONFIG_OVERLAY` |

## 認証 {#authentication}

| 変数 | 既定値 | 用途 | 従来の別名 |
| --- | --- | --- | --- |
| `DW_AUTH_PROVIDER` | 未設定 | `App\Contracts\AuthProvider` を実装し、Laravel で解決可能なクラス。 | `WORKFLOW_SERVER_AUTH_PROVIDER` |
| `DW_AUTH_DRIVER` | `token` | 認証ドライバー。`none`、`token`、`signature`。 | `WORKFLOW_SERVER_AUTH_DRIVER` |
| `DW_AUTH_TOKEN` | 未設定 | ロール別トークンが未設定の場合の、単一の共有 Bearer トークン。 | `WORKFLOW_SERVER_AUTH_TOKEN` |
| `DW_SIGNATURE_KEY` | 未設定 | ロール別署名キーが未設定の場合の共有 HMAC 署名キー。 | `WORKFLOW_SERVER_SIGNATURE_KEY` |
| `DW_WORKER_TOKEN` | 未設定 | Worker の登録、ポーリング、ハートビート、完了用 Bearer トークン。 | `WORKFLOW_SERVER_WORKER_TOKEN` |
| `DW_OPERATOR_TOKEN` | 未設定 | 読み取りおよび運用者向けコントロールプレーン操作用 Bearer トークン。 | `WORKFLOW_SERVER_OPERATOR_TOKEN` |
| `DW_ADMIN_TOKEN` | 未設定 | Namespace、保持設定などの管理変更用 Bearer トークン。 | `WORKFLOW_SERVER_ADMIN_TOKEN` |
| `DW_PRINCIPAL_TOKENS` | 未設定 | 名前付き主体の Bearer トークンを定義する JSON マップ。各項目には `token`、`subject`、`roles` と、任意の `tenant`、`label`、秘密ではない `claims` を指定します。 | `WORKFLOW_SERVER_PRINCIPAL_TOKENS` |
| `DW_WORKER_SIGNATURE_KEY` | 未設定 | 署名認証で Worker ロールのリクエストに使用する HMAC キー。 | `WORKFLOW_SERVER_WORKER_SIGNATURE_KEY` |
| `DW_OPERATOR_SIGNATURE_KEY` | 未設定 | 署名認証で運用者ロールのリクエストに使用する HMAC キー。 | `WORKFLOW_SERVER_OPERATOR_SIGNATURE_KEY` |
| `DW_ADMIN_SIGNATURE_KEY` | 未設定 | 署名認証で管理者ロールのリクエストに使用する HMAC キー。 | `WORKFLOW_SERVER_ADMIN_SIGNATURE_KEY` |
| `DW_AUTH_BACKWARD_COMPATIBLE` | `true` | ロール別の認証情報がない場合、共有 `DW_AUTH_TOKEN` / `DW_SIGNATURE_KEY` をフォールバックとして使用します。 | `WORKFLOW_SERVER_AUTH_BACKWARD_COMPATIBLE` |

本番ではロールごとの認証情報を使用してください。`DW_AUTH_DRIVER=none` では全エンドポイントに Bearer トークンや署名なしでアクセスできるため、ローカルの簡易動作確認にのみ使用します。

監査記録にロール名ではなく安定した実行主体が必要な場合は、`DW_PRINCIPAL_TOKENS` を使用します。Server は一致したトークン項目から記録する主体を決定します。クライアントはリクエストのペイロードやヘッダーでそれを上書きできません。

## コマンドの実行主体 {#command-attribution}

これらの設定により、信頼できるゲートウェイは呼び出し元のメタデータを永続コマンド履歴に残せます。信頼できないクライアントからのヘッダーを除去するゲートウェイの背後でない限り、`DW_TRUST_FORWARDED_ATTRIBUTION_HEADERS=false` のままにしてください。

| 変数 | 既定値 | 用途 | 従来の別名 |
| --- | --- | --- | --- |
| `DW_TRUST_FORWARDED_ATTRIBUTION_HEADERS` | `false` | 転送された呼び出し元・認証ヘッダーをワークフローのコマンド履歴に記録します。 | `WORKFLOW_SERVER_TRUST_FORWARDED_ATTRIBUTION_HEADERS` |
| `DW_CALLER_TYPE_HEADER` | `X-Workflow-Caller-Type` | 転送された呼び出し元の種別を示すヘッダー。 | `WORKFLOW_SERVER_CALLER_TYPE_HEADER` |
| `DW_CALLER_LABEL_HEADER` | `X-Workflow-Caller-Label` | 転送された呼び出し元のラベルを示すヘッダー。 | `WORKFLOW_SERVER_CALLER_LABEL_HEADER` |
| `DW_AUTH_STATUS_HEADER` | `X-Workflow-Auth-Status` | 転送された認証状態を示すヘッダー。 | `WORKFLOW_SERVER_AUTH_STATUS_HEADER` |
| `DW_AUTH_METHOD_HEADER` | `X-Workflow-Auth-Method` | 転送された認証方式を示すヘッダー。 | `WORKFLOW_SERVER_AUTH_METHOD_HEADER` |

## Worker のポーリングと受付制限 {#worker-polling-and-admission}

これらの値は、ロングポーリングの時間、起床通知の調整、Server 側の受付上限、タスク配信の上限付き予算を制御します。

| 変数 | 既定値 | 用途 | 従来の別名 |
| --- | --- | --- | --- |
| `DW_WORKER_POLL_TIMEOUT` | `30` | 要求が `timeout_seconds` を省略した場合の既定待機時間。SDK の指定が優先され、SDK の上限ではありません。[経路全体のタイムアウト予算](../deployment.md#worker-long-poll-timeout-budgets)を参照してください。 | `WORKFLOW_SERVER_WORKER_POLL_TIMEOUT` |
| `DW_WORKER_POLL_INTERVAL_MS` | `1000` | ポーリングを保持している間の、内部スキャンの間隔（ミリ秒）。 | `WORKFLOW_SERVER_WORKER_POLL_INTERVAL_MS` |
| `DW_WORKER_POLL_SIGNAL_CHECK_INTERVAL_MS` | `100` | ポーリングを保持している間の、起床通知の確認間隔（ミリ秒）。 | `WORKFLOW_SERVER_WORKER_POLL_SIGNAL_CHECK_INTERVAL_MS` |
| `DW_POLLING_CACHE_PATH` | `storage/framework/cache/server-polling/<APP_ENV>` | ファイルベースのポーリングキャッシュで、Worker ポーリングの調整状態を保存するディレクトリ。 | `WORKFLOW_SERVER_POLLING_CACHE_PATH` |
| `DW_WAKE_SIGNAL_TTL_SECONDS` | `max(DW_WORKER_POLL_TIMEOUT + 5, 60)` | 保留中のポーリングを早く返すための、キューごとの起床通知の TTL。 | `WORKFLOW_SERVER_WAKE_SIGNAL_TTL_SECONDS` |
| `DW_WORKER_LONG_POLL_MAX_CONCURRENT` | 未設定。`PHP_CLI_SERVER_WORKERS` から算出 | この Server ノードで保持するワークフロー・アクティビティのロングポーリング待機数の任意の上限。クエリタスクには別の待機予算があります。 | `WORKFLOW_SERVER_WORKER_LONG_POLL_MAX_CONCURRENT` |
| `DW_WORKER_LONG_POLL_RESERVED_HTTP_WORKERS` | `2` | ワークフロー・アクティビティのロングポーリング待機上限を計算する際、ヘルスとコントロールプレーン用に確保する PHP CLI Server Worker 数。 | `WORKFLOW_SERVER_WORKER_LONG_POLL_RESERVED_HTTP_WORKERS` |
| `DW_MAX_TASKS_PER_POLL` | `1` | Worker の一回のポーリングで返すタスクの最大数。 | `WORKFLOW_SERVER_MAX_TASKS_PER_POLL` |
| `DW_SQLITE_CLAIM_LOCK_TTL_SECONDS` | `10` | SQLite クイックスタートで、キャッシュによる Worker ポーリング取得ゲートをロックの期限まで保持する秒数。 | `WORKFLOW_SERVER_SQLITE_CLAIM_LOCK_TTL_SECONDS` |
| `DW_SQLITE_CLAIM_LOCK_WAIT_SECONDS` | `5` | SQLite の Worker ポーリング取得が、バックエンドのロック負荷を返すまでにキャッシュの取得ゲートを待つ秒数。 | `WORKFLOW_SERVER_SQLITE_CLAIM_LOCK_WAIT_SECONDS` |
| `DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` | 未設定 | Namespace とタスクキューごとの、ワークフロータスクの有効リース数の上限。 | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` |
| `DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` | 未設定 | Namespace 内の全キューにまたがる、ワークフロータスクの有効リース数の上限。 | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` |
| `DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE` | 未設定 | Namespace とタスクキューごとの、毎分のワークフロータスク配信上限。 | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE` |
| `DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` | 未設定 | Namespace 全体の、毎分のワークフロータスク配信上限。 | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` |
| `DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` | 未設定 | Namespace とタスクキューごとの、アクティビティタスクの有効リース数の上限。 | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` |
| `DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` | 未設定 | Namespace 内の全キューにまたがる、アクティビティタスクの有効リース数の上限。 | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` |
| `DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE` | 未設定 | Namespace とタスクキューごとの、毎分のアクティビティタスク配信上限。 | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE` |
| `DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` | 未設定 | Namespace 全体の、毎分のアクティビティタスク配信上限。 | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` |
| `DW_TASK_QUEUE_ADMISSION_OVERRIDES` | `{}` | 有効リース、配信レート、Namespace 上限、下流予算グループの JSON 上書き。キーは `namespace:task_queue`、`namespace:*`、`task_queue`、`*`。 | `WORKFLOW_SERVER_TASK_QUEUE_ADMISSION_OVERRIDES` |
| `DW_DUE_TIMER_RECOVERY_SCAN_LIMIT` | `5` | Worker の各ポーリング処理で回収する、期限に達した service モードのタイマータスク数の上限。 | `WORKFLOW_SERVER_DUE_TIMER_RECOVERY_SCAN_LIMIT` |
| `DW_EXPIRED_WORKFLOW_TASK_RECOVERY_SCAN_LIMIT` | `5` | 各処理で回収する、リース切れのワークフロータスク数の上限。 | `WORKFLOW_SERVER_EXPIRED_WORKFLOW_TASK_RECOVERY_SCAN_LIMIT` |
| `DW_EXPIRED_WORKFLOW_TASK_RECOVERY_TTL_SECONDS` | `5` | キューごとに期限切れタスクの回収を行う最小間隔（秒）。 | `WORKFLOW_SERVER_EXPIRED_WORKFLOW_TASK_RECOVERY_TTL_SECONDS` |

Sticky 実行には Server イメージ専用の環境変数はありません。Sticky キャッシュのライフサイクル、Worker プロトコルのフィールド、Replay モード、診断については、[Sticky 実行](/docs/features/sticky-execution)を参照してください。

受付制限の上書き例：

```json
{
  "production:billing": {
    "workflow_tasks": {
      "max_active_leases": 50,
      "max_dispatches_per_minute": 600
    },
    "activity_tasks": {
      "max_active_leases": 200
    }
  },
  "production:*": {
    "workflow_tasks": {
      "max_active_leases_per_namespace": 500
    }
  }
}
```

## Worker プロトコルとクエリ転送 {#worker-protocol-and-query-transport}

| 変数 | 既定値 | 用途 | 従来の別名 |
| --- | --- | --- | --- |
| `DW_WORKER_PROTOCOL_VERSION` | `WorkerProtocolVersion::VERSION` | Worker プレーンのレスポンスで通知する Worker プロトコルのバージョン。 | `WORKFLOW_SERVER_WORKER_PROTOCOL_VERSION` |
| `DW_HISTORY_PAGE_SIZE_DEFAULT` | `WorkerProtocolVersion::DEFAULT_HISTORY_PAGE_SIZE` | Worker による履歴読み取りの既定ページサイズ。 | `WORKFLOW_SERVER_HISTORY_PAGE_SIZE_DEFAULT` |
| `DW_HISTORY_PAGE_SIZE_MAX` | `WorkerProtocolVersion::MAX_HISTORY_PAGE_SIZE` | Worker による履歴読み取りで受け付けるページサイズの上限。 | `WORKFLOW_SERVER_HISTORY_PAGE_SIZE_MAX` |
| `DW_UPDATE_VALIDATION_TIMEOUT` | `10` | 受け付け前の同期 Update バリデーターの結果を、コントロールプレーンが待つ秒数。 | `WORKFLOW_SERVER_UPDATE_VALIDATION_TIMEOUT` |
| `DW_UPDATE_VALIDATION_LEASE_TIMEOUT` | `5` | Update 検証タスクのリースが維持され、代わりの検証対応 Worker が再試行できるようになるまでの秒数。 | `WORKFLOW_SERVER_UPDATE_VALIDATION_LEASE_TIMEOUT` |
| `DW_QUERY_TASK_TIMEOUT` | `DW_WORKER_POLL_TIMEOUT` | コントロールプレーンが Worker からのクエリタスク応答を待つ秒数。 | `WORKFLOW_SERVER_QUERY_TASK_TIMEOUT` |
| `DW_QUERY_TASK_LEASE_TIMEOUT` | `DW_WORKFLOW_TASK_TIMEOUT` | Worker に渡す一時クエリタスクのリースタイムアウト。 | `WORKFLOW_SERVER_QUERY_TASK_LEASE_TIMEOUT` |
| `DW_QUERY_TASK_TTL_SECONDS` | `180` | クエリタスクの結果行を削除前に保持する秒数。 | `WORKFLOW_SERVER_QUERY_TASK_TTL_SECONDS` |
| `DW_QUERY_TASK_MAX_PENDING_PER_QUEUE` | `1024` | 新規クエリを拒否する前に許可する、Namespace とタスクキューごとのキャッシュ内保留クエリタスク数の上限。 | `WORKFLOW_SERVER_QUERY_TASK_MAX_PENDING_PER_QUEUE` |
| `DW_QUERY_TASK_POLL_TIMEOUT` | `5` | アイドル状態のクエリタスクポーリングが、ワークフロータスク負荷とコントロールプレーンの可用性を再確認するまで待つ最大秒数。 | `WORKFLOW_SERVER_QUERY_TASK_POLL_TIMEOUT` |
| `DW_QUERY_TASK_POLL_MAX_CONCURRENT` | 未設定。`PHP_CLI_SERVER_WORKERS` から算出 | この Server ノードで保持するアイドル状態のクエリタスクのロングポーリング待機数の任意の上限。保留タスクは待機に入る前に即座に取得できます。 | `WORKFLOW_SERVER_QUERY_TASK_POLL_MAX_CONCURRENT` |
| `DW_WORKFLOW_TASK_TIMEOUT` | `60` | ワークフロータスクの既定リースタイムアウト（秒）。 | `WORKFLOW_TASK_TIMEOUT` |
| `DW_ACTIVITY_TASK_TIMEOUT` | `300` | アクティビティタスクの既定リースタイムアウト（秒）。 | `ACTIVITY_TASK_TIMEOUT` |
| `DW_WORKER_STALE_AFTER_SECONDS` | `max(DW_WORKER_HEARTBEAT_INTERVAL_SECONDS * 3, 30)` | Worker のハートビート後、その登録が古いと見なされるまでの秒数。 | `WORKFLOW_SERVER_WORKER_STALE_AFTER_SECONDS` |
| `DW_WORKER_HEARTBEAT_INTERVAL_SECONDS` | `10` | Worker 登録とハートビート応答で SDK に通知する間隔（秒）。 | `WORKFLOW_SERVER_WORKER_HEARTBEAT_INTERVAL_SECONDS` |

## 制限、保持、メトリクス {#limits-retention-and-metrics}

これらはリクエスト境界とデータ増加を制御する設定です。アプリケーションが頻繁に上限へ近づく場合は、すぐに上限を引き上げるのではなく、ペイロードの縮小、外部ペイロード保存、continue-as-new を優先してください。

| 変数 | 既定値 | 用途 | 従来の別名 |
| --- | --- | --- | --- |
| `DW_METRICS_WORKFLOW_TASK_FAILURE_TYPE_LIMIT` | `20` | `dw_workflow_task_consecutive_failures` が報告する `workflow_type` 系列の上限。超過分は集約します。 | `WORKFLOW_SERVER_METRICS_WORKFLOW_TASK_FAILURE_TYPE_LIMIT` |
| `DW_METRICS_PROMETHEUS_WORKFLOW_SERIES_LIMIT` | `100` | `/api/system/prometheus-metrics` が報告するワークフロー系列数の上限。超過分は集約します。 | `WORKFLOW_SERVER_METRICS_PROMETHEUS_WORKFLOW_SERIES_LIMIT` |
| `DW_METRICS_PROMETHEUS_ACTIVITY_SERIES_LIMIT` | `100` | `/api/system/prometheus-metrics` が報告するアクティビティ系列数の上限。超過分は集約します。 | `WORKFLOW_SERVER_METRICS_PROMETHEUS_ACTIVITY_SERIES_LIMIT` |
| `DW_METRICS_PROMETHEUS_TASK_QUEUE_SERIES_LIMIT` | `100` | `/api/system/prometheus-metrics` が報告するタスクキュー実行時系列数の上限。超過分は集約します。 | `WORKFLOW_SERVER_METRICS_PROMETHEUS_TASK_QUEUE_SERIES_LIMIT` |
| `DW_MAX_HISTORY_EVENTS` | `50000` | continue-as-new を適用するまでの、ワークフロー実行ごとの履歴イベント数の上限。 | `WORKFLOW_MAX_HISTORY_EVENTS` |
| `DW_HISTORY_RETENTION_DAYS` | `30` | Namespace に上書きがない場合、閉じた実行の履歴を保持する既定日数。 | `WORKFLOW_HISTORY_RETENTION_DAYS` |
| `DW_MAX_PAYLOAD_BYTES` | `2097152` | 一つのペイロードのシリアライズ済みバイト数の上限。 | `WORKFLOW_MAX_PAYLOAD_BYTES` |
| `DW_EXTERNAL_PAYLOAD_MAX_BYTES` | `67108864` | 認証付き外部ペイロードのアップロード・取得で受け付けるエンコード済みサイズの上限（64 MiB）。 | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_MAX_BYTES` |
| `DW_EXTERNAL_PAYLOAD_REQUEST_TIMEOUT` | `30` | Server がクライアントに通知するアップロード・取得リクエストのタイムアウト予算（秒）。 | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_REQUEST_TIMEOUT` |
| `DW_EXTERNAL_PAYLOAD_UPLOAD_EXPIRY` | `3600` | アップロードされた外部ペイロードを、取得先未確定のまま不透明な参照が期限切れになるまで保持できる秒数。 | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_UPLOAD_EXPIRY` |
| `DW_MAX_MEMO_BYTES` | `262144` | ワークフローメモのシリアライズ済みバイト数の上限。 | `WORKFLOW_MAX_MEMO_BYTES` |
| `DW_MAX_SEARCH_ATTRIBUTES` | `100` | 一つのワークフローの検索属性数の上限。 | `WORKFLOW_MAX_SEARCH_ATTRIBUTES` |
| `DW_MAX_SEARCH_ATTRIBUTE_KEY_LENGTH` | `128` | 検索属性キー一つのバイト長の上限。 | `WORKFLOW_MAX_SEARCH_ATTRIBUTE_KEY_LENGTH` |
| `DW_MAX_SEARCH_ATTRIBUTE_VALUE_BYTES` | `2048` | 検索属性の文字列値一つのバイト数の上限。 | `WORKFLOW_MAX_SEARCH_ATTRIBUTE_VALUE_BYTES` |
| `DW_MAX_OPERATION_NAME_LENGTH` | `256` | シグナル、Update、クエリ名のバイト長の上限。 | `WORKFLOW_MAX_OPERATION_NAME_LENGTH` |
| `DW_MAX_PENDING_ACTIVITIES` | `2000` | コマンドバッチを拒否する前に許可する、実行ごとの保留アクティビティ数の上限。 | `WORKFLOW_MAX_PENDING_ACTIVITIES` |
| `DW_MAX_PENDING_CHILDREN` | `2000` | コマンドバッチを拒否する前に許可する、実行ごとの保留子ワークフロー数の上限。 | `WORKFLOW_MAX_PENDING_CHILDREN` |
| `DW_MAX_NEXUS_OPERATIONS_PER_CALLER` | `200` | クライアントにページングが必要になる前に、操作履歴から呼び出し元ごとに返す Nexus 操作数の上限。 | `WORKFLOW_MAX_NEXUS_OPERATIONS_PER_CALLER` |
| `DW_COMPRESSION_ENABLED` | `true` | 最低サイズを超える JSON レスポンスの圧縮を有効にします。 | `WORKFLOW_SERVER_COMPRESSION_ENABLED` |

## Docker の初期化と出所情報 {#docker-bootstrap-and-provenance}

| 変数 | 既定値 | 用途 | 従来の別名 |
| --- | --- | --- | --- |
| `DW_EXPOSE_PACKAGE_PROVENANCE` | `false` | 管理者の `/api/cluster/info` リクエストに `package_provenance` を含めます。 | `WORKFLOW_SERVER_EXPOSE_PACKAGE_PROVENANCE` |
| `DW_PACKAGE_PROVENANCE_PATH` | `<base_path>/.package-provenance` | Docker ビルドの出所情報ファイルへの絶対パス。 | `WORKFLOW_SERVER_PACKAGE_PROVENANCE_PATH` |
| `DW_SERVICE_BOUNDARY_CROSS_NAMESPACE_DEFAULT` | `allow` | 具体的なルールに一致しない Namespace 間呼び出しに対する、サービス呼び出し境界の既定動作。 | `WORKFLOW_SERVER_SERVICE_BOUNDARY_CROSS_NAMESPACE_DEFAULT` |
| `DW_SERVICE_BOUNDARY_RATE_LIMIT_PER_MINUTE` | 未設定 | サービス呼び出し境界の、任意の毎分レート上限。 | `WORKFLOW_SERVER_SERVICE_BOUNDARY_RATE_LIMIT_PER_MINUTE` |
| `DW_SERVICE_BOUNDARY_MAX_IN_FLIGHT` | 未設定 | サービス呼び出し境界の、任意の同時処理数上限。 | `WORKFLOW_SERVER_SERVICE_BOUNDARY_MAX_IN_FLIGHT` |

## Docker の初期化 {#docker-bootstrap}

| 変数 | 既定値 | 用途 | 従来の別名 |
| --- | --- | --- | --- |
| `DW_ENV_AUDIT_STRICT` | `0` | `env:audit` が未知または従来の `DW_*` 変数を検出したら、コンテナ起動を失敗させます。 | - |
| `DW_BOOTSTRAP_RETRIES` | `30` | エントリーポイントが移行と既定 Namespace の初期化を諦めるまでの初期化試行数。 | `WORKFLOW_SERVER_BOOTSTRAP_RETRIES` |
| `DW_BOOTSTRAP_DELAY_SECONDS` | `2` | 初期化試行間の秒数。 | `WORKFLOW_SERVER_BOOTSTRAP_DELAY_SECONDS` |

## Workflow パッケージの設定 {#workflow-package-controls}

Server イメージには `durable-workflow/workflow` が同梱されるため、パッケージの `DW_V2_*` 設定も使用できます。同じワークフローを実行する Worker のデプロイと設定を一致させてください。

| 変数 | 既定値 | 用途 | 従来の別名 |
| --- | --- | --- | --- |
| `DW_V2_NAMESPACE` | 未設定 | ワークフローインスタンスを Namespace に限定します。 | `WORKFLOW_V2_NAMESPACE` |
| `DW_V2_TENANCY_ORGANIZATION` | 未設定 | 準備状態、検出、運用画面に公開する、パッケージのテナント階層の任意の組織セグメント。 | `WORKFLOW_V2_TENANCY_ORGANIZATION` |
| `DW_V2_TENANCY_PROJECT` | 未設定 | 準備状態、検出、運用画面に公開する、パッケージのテナント階層の任意のプロジェクトセグメント。 | `WORKFLOW_V2_TENANCY_PROJECT` |
| `DW_V2_TENANCY_ENVIRONMENT` | 未設定 | 準備状態、検出、運用画面に公開する、パッケージのテナント階層の任意の環境セグメント。 | `WORKFLOW_V2_TENANCY_ENVIRONMENT` |
| `DW_V2_CURRENT_COMPATIBILITY` | 未設定 | この Worker が通知する互換性マーカー。 | `WORKFLOW_V2_CURRENT_COMPATIBILITY` |
| `DW_V2_SUPPORTED_COMPATIBILITIES` | 未設定 | この Worker が受け付ける、コンマ区切りの互換性マーカー、または `*`。 | `WORKFLOW_V2_SUPPORTED_COMPATIBILITIES` |
| `DW_V2_COMPATIBILITY_NAMESPACE` | 未設定 | 独立した Worker 群がワークフローデータベースを共有する際の互換性 Namespace。 | `WORKFLOW_V2_COMPATIBILITY_NAMESPACE` |
| `DW_V2_COMPATIBILITY_HEARTBEAT_TTL` | `30` | Worker 互換性ハートビートの有効秒数。 | `WORKFLOW_V2_COMPATIBILITY_HEARTBEAT_TTL` |
| `DW_V2_PIN_TO_RECORDED_FINGERPRINT` | `true` | 記録済みワークフロー定義を優先します。ランタイムごとのフォールバック境界は後述します。 | `WORKFLOW_V2_PIN_TO_RECORDED_FINGERPRINT` |
| `DW_V2_CONTINUE_AS_NEW_EVENT_THRESHOLD` | `10000` | パッケージが作者に continue-as-new を促す履歴イベント数。 | `WORKFLOW_V2_CONTINUE_AS_NEW_EVENT_THRESHOLD` |
| `DW_V2_CONTINUE_AS_NEW_SIZE_BYTES_THRESHOLD` | `5242880` | パッケージが continue-as-new を促すシリアライズ済み履歴サイズ。 | `WORKFLOW_V2_CONTINUE_AS_NEW_SIZE_BYTES_THRESHOLD` |
| `DW_V2_HISTORY_EXPORT_SIGNING_KEY` | 未設定 | 履歴エクスポートの認証に使用する任意の HMAC キー。 | `WORKFLOW_V2_HISTORY_EXPORT_SIGNING_KEY` |
| `DW_V2_HISTORY_EXPORT_SIGNING_KEY_ID` | 未設定 | 署名付き履歴エクスポートと一緒に記録するキー識別子。 | `WORKFLOW_V2_HISTORY_EXPORT_SIGNING_KEY_ID` |
| `DW_V2_UPDATE_WAIT_COMPLETION_TIMEOUT_SECONDS` | `10` | Update が終端状態に達するまで Server が待つ秒数。 | `WORKFLOW_V2_UPDATE_WAIT_COMPLETION_TIMEOUT_SECONDS` |
| `DW_V2_UPDATE_WAIT_POLL_INTERVAL_MS` | `50` | Update ステージをポーリングする間隔（ミリ秒）。 | `WORKFLOW_V2_UPDATE_WAIT_POLL_INTERVAL_MS` |
| `DW_V2_GUARDRAILS_BOOT` | `warn` | 起動時の構造ガードレールのモード。`warn`、`fail`、`silent`。 | `WORKFLOW_V2_GUARDRAILS_BOOT` |
| `DW_V2_LIMIT_PENDING_ACTIVITIES` | `2000` | パッケージ単位の保留アクティビティ数の上限。 | `WORKFLOW_V2_LIMIT_PENDING_ACTIVITIES` |
| `DW_V2_LIMIT_PENDING_CHILDREN` | `1000` | パッケージ単位の保留子ワークフロー数の上限。 | `WORKFLOW_V2_LIMIT_PENDING_CHILDREN` |
| `DW_V2_LIMIT_PENDING_TIMERS` | `2000` | パッケージ単位の保留タイマー数の上限。 | `WORKFLOW_V2_LIMIT_PENDING_TIMERS` |
| `DW_V2_LIMIT_PENDING_SIGNALS` | `5000` | パッケージ単位の保留シグナル数の上限。 | `WORKFLOW_V2_LIMIT_PENDING_SIGNALS` |
| `DW_V2_LIMIT_PENDING_UPDATES` | `500` | パッケージ単位の保留 Update 数の上限。 | `WORKFLOW_V2_LIMIT_PENDING_UPDATES` |
| `DW_V2_LIMIT_COMMAND_BATCH_SIZE` | `1000` | 一回のワークフロータスク完了で受け付けるコマンド数の上限。 | `WORKFLOW_V2_LIMIT_COMMAND_BATCH_SIZE` |
| `DW_V2_LIMIT_PAYLOAD_SIZE_BYTES` | `2097152` | パッケージ単位の単一ペイロードのバイト数上限。 | `WORKFLOW_V2_LIMIT_PAYLOAD_SIZE_BYTES` |
| `DW_V2_LIMIT_MEMO_SIZE_BYTES` | `262144` | パッケージ単位のワークフローメモのバイト数上限。 | `WORKFLOW_V2_LIMIT_MEMO_SIZE_BYTES` |
| `DW_V2_LIMIT_SEARCH_ATTRIBUTE_SIZE_BYTES` | `40960` | パッケージ単位の検索属性のバイト数上限。 | `WORKFLOW_V2_LIMIT_SEARCH_ATTRIBUTE_SIZE_BYTES` |
| `DW_V2_LIMIT_HISTORY_TRANSACTION_SIZE` | `5000` | パッケージ単位の履歴トランザクションのイベント数上限。 | `WORKFLOW_V2_LIMIT_HISTORY_TRANSACTION_SIZE` |
| `DW_V2_LIMIT_WARNING_THRESHOLD_PERCENT` | `80` | 構造制限に対して警告を出す使用率（パーセント）。 | `WORKFLOW_V2_LIMIT_WARNING_THRESHOLD_PERCENT` |
| `DW_V2_TASK_DISPATCH_MODE` | `queue` | パッケージ単位のタスク配信モード。Server モードでは通常 `DW_TASK_DISPATCH_MODE` が上書きします。 | - |
| `DW_V2_MATCHING_ROLE_QUEUE_WAKE` | `true` | キューワーカーが各 Looping イベントでマッチングロールの起床処理を行うかどうか。専用 `php artisan workflow:v2:repair-pass --loop` デーモンが走査を担当する場合は `false` にし、実行専用ノードを広域ポーリングの起床処理から外します。 | `WORKFLOW_V2_MATCHING_ROLE_QUEUE_WAKE` |
| `DW_V2_TASK_REPAIR_REDISPATCH_AFTER_SECONDS` | `3` | 修復が孤立ワークフロータスクを再配信するまでの秒数。 | `WORKFLOW_V2_TASK_REPAIR_REDISPATCH_AFTER_SECONDS` |
| `DW_V2_TASK_REPAIR_LOOP_THROTTLE_SECONDS` | `5` | キューごとのタスク修復処理の最小間隔（秒）。 | `WORKFLOW_V2_TASK_REPAIR_LOOP_THROTTLE_SECONDS` |
| `DW_V2_TASK_REPAIR_SCAN_LIMIT` | `25` | タスク修復の一回の処理で検討するタスク数の上限。 | `WORKFLOW_V2_TASK_REPAIR_SCAN_LIMIT` |
| `DW_V2_TASK_REPAIR_FAILURE_BACKOFF_MAX_SECONDS` | `60` | タスク修復失敗時のバックオフ上限（秒）。 | `WORKFLOW_V2_TASK_REPAIR_FAILURE_BACKOFF_MAX_SECONDS` |
| `DW_V2_MULTI_NODE` | `false` | 複数ノードのデプロイを宣言し、キャッシュ基盤のノード間調整を検証します。 | `WORKFLOW_V2_MULTI_NODE` |
| `DW_V2_VALIDATE_CACHE_BACKEND` | `true` | 起動時にロングポーリングのキャッシュ基盤を検証します。 | `WORKFLOW_V2_VALIDATE_CACHE_BACKEND` |
| `DW_V2_CACHE_VALIDATION_MODE` | `warn` | キャッシュ基盤の検証失敗時の動作。`fail`、`warn`、`silent`。 | `WORKFLOW_V2_CACHE_VALIDATION_MODE` |
| `DW_V2_FLEET_VALIDATION_MODE` | `warn` | Worker 群の互換性検証モード。`warn` はログ記録、`fail` は互換 Worker がいなければ配信を止めて拒否します。 | `WORKFLOW_V2_FLEET_VALIDATION_MODE` |
| `DW_SERIALIZER` | `avro` | ペイロードのコーデック診断入力。正式な v2 は新規実行のペイロードに Avro を使用します。 | `WORKFLOW_SERIALIZER` |

**公開済みのフィンガープリント優先設定です。** Server 2.9.9 では、サービスモードの Worker にフィンガープリントの優先設定が適用されます。固定が有効な場合、記録済み定義を持つ適格な Worker が残っておらず、かつ置き換え Worker が `workflow_entry_arguments_validation` を通知している場合にだけ、変更後の定義へフォールバックできます。固定を無効にするとソースの優先は解除されますが、ビルド固定、名前空間・キュー・型の分離、登録識別情報、厳密なリプレイは維持されます。対応するエントリ保護は PHP SDK 2.5.4、Python SDK 2.6.2、Rust SDK 3.5.6 で導入されました。これらは機能の最小対応バージョンです。セキュリティ修正を含む最新の安定版をインストールしてください。古いランタイムの設定に同じキーがあるだけで、この動作を想定しないでください。[定義ルーティング](./worker-compatibility-routing.md#definition-fingerprint-evolution)を参照してください。

CI とデプロイ用マニフェストには `DW_V2_GUARDRAILS_BOOT` を使用します。旧名 `WORKFLOW_V2_GUARDRAILS_BOOT` が残っているのは、`env:audit` が alpha 時代の運用者に名前の変更を案内するためだけです。Workflow パッケージは、この旧名を実行時のフォールバックとして読み取りません。

`DW_V2_MATCHING_ROLE_QUEUE_WAKE` または専用の `workflow:v2:repair-pass --loop` デーモンを設定する場合は、[タスクのマッチングと配信](/docs/polyglot/task-matching-dispatch)を参照してください。これらの設定は実行可能タスクを検出する場所を変えるものであり、Worker プロトコルの契約自体を変えるものではありません。

## 公開済み PHP Server の追加設定 {#additional-published-php-controls}

このリファレンスは、以下の設定を含む公開済み **PHP Server 2.11.0** の契約を対象にします。実際に使うイメージを確認してください。独立に選ばれたインストール版は旧版の場合があります。`unset` は環境変数の値が未設定であることを示し、その効果は設定ごとに異なります。既定値と旧名は[公開済み契約](https://github.com/durable-workflow/server/blob/36d16273604755f3dd0743cab331cc7c62e51d8e/config/dw-contract.php)に基づきます。ドキュメントのビルドでは、このバージョン付き契約 snapshot を全言語で検査します。選択済みのインストール版の組み合わせは変わりません。

### namespace ごとの HTTP 受付制限 {#namespace-request-controls}

| 変数 | 既定値 | 目的 | 旧名 |
| --- | --- | --- | --- |
| `DW_NAMESPACE_MAX_REQUESTS_PER_MINUTE` | `unset` | namespace ごとの1分間の制御プレーン要求数の任意上限。未設定なら無制限です。 | `WORKFLOW_SERVER_NAMESPACE_MAX_REQUESTS_PER_MINUTE` |
| `DW_NAMESPACE_MAX_CONCURRENT_REQUESTS` | `unset` | namespace ごとの同時制御プレーン要求数の任意上限。未設定なら無制限です。 | `WORKFLOW_SERVER_NAMESPACE_MAX_CONCURRENT_REQUESTS` |
| `DW_NAMESPACE_HARD_MAX_REQUESTS_PER_MINUTE` | `unset` | namespace の上書きにも適用される、回避できない1分間の要求数上限。 | `WORKFLOW_SERVER_NAMESPACE_HARD_MAX_REQUESTS_PER_MINUTE` |
| `DW_NAMESPACE_HARD_MAX_CONCURRENT_REQUESTS` | `unset` | namespace の上書きにも適用される、回避できない同時要求数上限。 | `WORKFLOW_SERVER_NAMESPACE_HARD_MAX_CONCURRENT_REQUESTS` |
| `DW_NAMESPACE_ADMISSION_OVERRIDES` | `{}` | namespace をキーに、要求頻度と同時数を上書きする JSON オブジェクト。 | `WORKFLOW_SERVER_NAMESPACE_ADMISSION_OVERRIDES` |

[namespace ごとのリクエスト受付制限](./task-queue-admission.md#namespace-request-admission).

### namespace の永続状態クォータ {#namespace-durable-controls}

| 変数 | 既定値 | 目的 | 旧名 |
| --- | --- | --- | --- |
| `DW_NAMESPACE_DURABLE_LIMITS` | `{}` | namespace の永続行数の既定クォータを指定する JSON。総数と pending/open の制限は独立です。pending tasks はキューの ready 行を数え、active lease は別に制限します。空オブジェクトは無制限です。 | `WORKFLOW_SERVER_NAMESPACE_DURABLE_LIMITS` |
| `DW_NAMESPACE_DURABLE_HARD_LIMITS` | `{}` | 上書きにも適用される、回避できない永続行数の上限を指定する JSON。空オブジェクトは運用者の上限を追加しません。 | `WORKFLOW_SERVER_NAMESPACE_DURABLE_HARD_LIMITS` |
| `DW_NAMESPACE_DURABLE_OVERRIDES` | `{}` | namespace ごとの永続行数クォータの上書き JSON。hard limit は引き続き適用されます。 | `WORKFLOW_SERVER_NAMESPACE_DURABLE_OVERRIDES` |

[namespace の永続状態クォータ](./task-queue-admission.md#namespace-durable-state).

### 外部 payload のクォータと S3 転送 {#external-payload-quotas-and-s3}

| 変数 | 既定値 | 目的 | 旧名 |
| --- | --- | --- | --- |
| `DW_EXTERNAL_PAYLOAD_COMPLETION_MAX_BYTES` | `unset` | lease 付き completion の不変 upload slots 全体での異なるバイト数。未設定なら `DW_EXTERNAL_PAYLOAD_MAX_BYTES` を使います。 | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_COMPLETION_MAX_BYTES` |
| `DW_EXTERNAL_PAYLOAD_MAX_BYTES_PER_NAMESPACE` | `unset` | namespace の外部 payload の累積バイト上限。準備済みと処理中のオブジェクトを数え、未設定なら無制限です。 | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_MAX_BYTES_PER_NAMESPACE` |
| `DW_EXTERNAL_PAYLOAD_MAX_OBJECTS_PER_NAMESPACE` | `unset` | namespace の外部 payload のオブジェクト数上限。準備済みと処理中を数え、未設定なら無制限です。 | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_MAX_OBJECTS_PER_NAMESPACE` |
| `DW_EXTERNAL_PAYLOAD_HARD_MAX_BYTES_PER_NAMESPACE` | `unset` | namespace の上書きにも適用される、外部 payload の累積バイト数の hard limit。 | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_HARD_MAX_BYTES_PER_NAMESPACE` |
| `DW_EXTERNAL_PAYLOAD_HARD_MAX_OBJECTS_PER_NAMESPACE` | `unset` | namespace の上書きにも適用される、外部 payload のオブジェクト数の hard limit。 | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_HARD_MAX_OBJECTS_PER_NAMESPACE` |
| `DW_EXTERNAL_PAYLOAD_NAMESPACE_OVERRIDES` | `{}` | namespace をキーに `max_bytes` と `max_objects` のクォータを上書きする JSON。 | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_NAMESPACE_OVERRIDES` |
| `DW_EXTERNAL_PAYLOAD_S3_ACCESS_KEY_ID` | `unset` | runtime 管理の S3 互換ディスクの任意 access-key ID。workload identity が認証情報を提供する場合は省略できます。 | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_ACCESS_KEY_ID` |
| `DW_EXTERNAL_PAYLOAD_S3_SECRET_ACCESS_KEY` | `unset` | 管理対象 S3 互換ディスクの任意 secret access key。access-key ID と一緒に指定します。 | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_SECRET_ACCESS_KEY` |
| `DW_EXTERNAL_PAYLOAD_S3_SESSION_TOKEN` | `unset` | 管理対象 S3 互換ディスクの一時認証情報に使う任意 session token。 | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_SESSION_TOKEN` |
| `DW_EXTERNAL_PAYLOAD_S3_REGION` | `us-east-1` | runtime 管理の S3 互換ディスクのリージョン。 | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_REGION` |
| `DW_EXTERNAL_PAYLOAD_S3_BUCKET` | `unset` | runtime 管理の S3 互換ディスクの bucket。 | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_BUCKET` |
| `DW_EXTERNAL_PAYLOAD_S3_ENDPOINT` | `unset` | 外部 payload の S3 互換サービスに使う任意 HTTPS endpoint。 | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_ENDPOINT` |
| `DW_EXTERNAL_PAYLOAD_S3_USE_PATH_STYLE_ENDPOINT` | `false` | 管理対象 S3 互換サービスで bucket の path-style アドレスを使います。 | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_USE_PATH_STYLE_ENDPOINT` |

### 呼び出し元 namespace のサービス境界 {#service-caller-namespace-controls}

| 変数 | 既定値 | 目的 | 旧名 |
| --- | --- | --- | --- |
| `DW_SERVICE_BOUNDARY_NAMESPACE_RATE_LIMIT_PER_MINUTE` | `unset` | 呼び出し元 namespace 全体で集計する、1分間のサービス呼び出し数の任意共有上限。 | `WORKFLOW_SERVER_SERVICE_BOUNDARY_NAMESPACE_RATE_LIMIT_PER_MINUTE` |
| `DW_SERVICE_BOUNDARY_NAMESPACE_MAX_IN_FLIGHT` | `unset` | 呼び出し元 namespace 全体で集計する、実行中サービス呼び出し数の任意共有上限。 | `WORKFLOW_SERVER_SERVICE_BOUNDARY_NAMESPACE_MAX_IN_FLIGHT` |
| `DW_SERVICE_BOUNDARY_HARD_RATE_LIMIT_PER_MINUTE` | `unset` | サービス境界と呼び出し元 namespace のポリシーに適用する、回避できない1分間の上限。 | `WORKFLOW_SERVER_SERVICE_BOUNDARY_HARD_RATE_LIMIT_PER_MINUTE` |
| `DW_SERVICE_BOUNDARY_HARD_MAX_IN_FLIGHT` | `unset` | サービス境界と呼び出し元 namespace のポリシーに適用する、回避できない実行中呼び出し数の上限。 | `WORKFLOW_SERVER_SERVICE_BOUNDARY_HARD_MAX_IN_FLIGHT` |
| `DW_SERVICE_BOUNDARY_NAMESPACE_OVERRIDES` | `{}` | 呼び出し元 namespace ごとに頻度と実行中呼び出し数を上書きする JSON。hard limit は引き続き適用されます。 | `WORKFLOW_SERVER_SERVICE_BOUNDARY_NAMESPACE_OVERRIDES` |

### 連携、ストレージ、runtime {#coordination-storage-and-runtime-controls}

| 変数 | 既定値 | 目的 | 旧名 |
| --- | --- | --- | --- |
| `DW_OBSERVABILITY_CONTEXT_ENABLED` | `false` | 任意の API と schema がインストール済みの場合、制限付き trace context の永続化・配送・discovery を有効にします。 | - |
| `DW_OBSERVABILITY_BAGGAGE_ALLOWLIST` | `[]` | run の起点に許可する baggage key の JSON 配列。既定は空です。link に baggage は含めません。 | - |
| `DW_STORAGE_ADMISSION_FILE` | `unset` | ストレージ逼迫の観測を読む任意のローカル読み取り専用ファイル。無効または古い観測は書き込みを拒否します。 | - |
| `DW_STORAGE_ADMISSION_SOURCE` | `unset` | 受付判断用の観測に含まれるストレージリソースの想定識別子。 | - |
| `DW_STORAGE_ADMISSION_MAX_AGE_SECONDS` | `15` | ストレージ観測の最大経過秒数。1〜300秒です。 | - |
| `DW_RUNTIME_CREDENTIALS_ENABLED` | `false` | データベースに永続化され namespace に束縛された runtime bearer 認証情報を admin API で管理できるようにします。 | `WORKFLOW_SERVER_RUNTIME_CREDENTIALS_ENABLED` |
| `DW_WORKER_LONG_POLL_MAX_CONCURRENT_PER_NAMESPACE` | `unset` | 単一 namespace の workflow/activity long-poll 待機数のノード単位上限。全体の worker 上限以下で、共有 cache authority が使えない場合は拒否します。 | `WORKFLOW_SERVER_WORKER_LONG_POLL_MAX_CONCURRENT_PER_NAMESPACE` |
| `DW_QUERY_TASK_POLL_MAX_CONCURRENT_PER_NAMESPACE` | `unset` | 単一 namespace の query-task long-poll 待機数のノード単位上限。全体の query 上限以下で、共有 cache authority が使えない場合は拒否します。 | `WORKFLOW_SERVER_QUERY_TASK_POLL_MAX_CONCURRENT_PER_NAMESPACE` |
| `DW_V1_ENABLED` | `false` | v1 状態を意図的に維持する場合のみ embedded v1 の移行とキューの drain を有効にします。standalone Server は既定で v2 専用です。 | `WORKFLOW_V1_ENABLED` |

## 実行基盤の変数 {#runtime-infrastructure-variables}

実行基盤の変数は、フレームワークや依存ライブラリの設定です。Server の監査はこれらを認識して警告を抑えますが、安定した Durable Workflow API の設定項目ではありません。

| 分類 | 変数 | 用途 |
| --- | --- | --- |
| アプリケーション | `APP_NAME`、`APP_ENV`、`APP_KEY`、`APP_DEBUG`、`APP_URL`、`APP_VERSION`、ロケール、タイムゾーン、メンテナンス、暗号設定 | Laravel アプリケーションの実行時識別情報と起動動作。 |
| ログ | `LOG_CHANNEL`、`LOG_LEVEL`、`LOG_STDERR_FORMATTER`、スタック、日次、Slack、Papertrail の設定 | Laravel のログ出力先、形式、保持。 |
| データベース | `DB_CONNECTION`、`DB_HOST`、`DB_PORT`、`DB_DATABASE`、`DB_USERNAME`、`DB_PASSWORD`、`DB_SOCKET`、`DB_URL`、`DB_SSLMODE`（`DB_SSL_MODE`）、`DB_SSLROOTCERT`（`DB_SSL_ROOT_CERT`）、`MYSQL_ATTR_SSL_CA`、文字セット、照合順序、外部キーの設定 | ワークフロー、Namespace、Worker、プロジェクションを保存する SQL データベース。[データベース TLS](#database-tls) を参照。 |
| Redis・キャッシュ・キュー | `REDIS_*`、`QUEUE_CONNECTION`、`QUEUE_FAILED_DRIVER`、`CACHE_STORE`、`CACHE_PREFIX`、`SESSION_*` | キューワーカー、キャッシュロック、ロングポーリング通知、Web・セッションの実行時サポート。 |
| ファイルシステム・メール・配信 | `FILESYSTEM_DISK`、`MAIL_*`、`BROADCAST_*`、`PUSHER_*`、`AWS_*` | デプロイ固有の機能で使用するフレームワーク連携。 |
| ビルド・実行環境 | `MYSQL_VERSION`、`REDIS_VERSION`、`PHP_CLI_SERVER_WORKERS`、`VITE_APP_NAME`、`BCRYPT_ROUNDS` | Docker Compose のイメージとフレームワークの実行時動作。 |

## データベース TLS {#database-tls}

API サーバー、キューワーカー、初期化・マイグレーションジョブ、スケジューラーに
同じ TLS 設定を適用してください。PostgreSQL の既定値は `prefer` です。
MySQL/MariaDB はモード未指定時に従来の接続設定を使います。いずれの既定値も、
認証された暗号化接続を保証しません。

| `DB_SSLMODE` | PostgreSQL | MySQL / MariaDB |
| --- | --- | --- |
| `disable` | TLS なし。 | TLS なし。矛盾する TLS オプションは拒否。 |
| `allow`, `prefer` | 暗号化・接続先の識別を保証しない日和見的 TLS。 | 拒否。 |
| `require` | 暗号化必須。 | mysqlnd と OpenSSL による暗号化必須。 |
| `verify-ca` | 暗号化と信頼できる証明書チェーンが必須。 | 拒否。PDO mysqlnd はホスト名の検証と独立してチェーンだけを検証できない。 |
| `verify-full` | 暗号化、信頼できるチェーン、ホスト名の一致が必須。 | 暗号化、信頼できるチェーン、ホスト名の一致が必須。 |

`DB_SSL_MODE` は `DB_SSLMODE`、`DB_SSL_ROOT_CERT` は `DB_SSLROOTCERT` の
別名です。証明書を検証する場合、マイグレーションも含む **すべてのロール** に、
指定パスで読み取れる CA バンドルをマウントしてください。MySQL/MariaDB の明示的な
`verify-full` では `MYSQL_ATTR_SSL_CA` も CA を指定できます。正規名・別名・URL の
設定が矛盾すると起動を拒否します。必須 TLS は明示的な TCP ホスト名を必要とし、
Unix ソケットは拒否されます。MySQL/MariaDB の明示的 TLS モードには mysqlnd と
OpenSSL を備えた PDO MySQL が必要です。

```dotenv
DB_CONNECTION=pgsql
DB_HOST=database.example.com
DB_SSLMODE=verify-full
DB_SSLROOTCERT=/run/database-ca/ca.pem
```

証明書の DNS ホスト名を使ってください。Helm では `externalDatabase.sslMode` と
`externalDatabase.tls.existingSecret` / `caKey` を設定します。インストール・
アップグレード前に Secret を作成してください。チャートが初期化フックを含む
全 4 ロールに CA をマウントします。起動時に設定がキャッシュされるため、
環境設定を変更したら常駐ロールを再起動してください。

## コンテナのログ {#container-logs}

API、ワーカー、スケジューラーの各コンテナで `LOG_CHANNEL=stderr` を設定すると、
`docker logs` または `kubectl logs` でアプリケーションログを収集できます。
既存のリリースでは明示的に設定してください。`LOG_LEVEL` で最低重大度を選択します。
1 行に 1 レコードの JSON を出力するには、次も設定します。

```dotenv
LOG_STDERR_FORMATTER="Monolog\Formatter\JsonFormatter"
```

起動時に設定がキャッシュされるため、変更後は常駐プロセスを再起動してください。
ファイルチャネルを明示的に選ぶ場合は、保存先と収集方法を別途用意する必要があります。
Kubernetes は `storage/logs/laravel.log` を自動収集しません。
`DW_LOG_FORMAT` はサポートされる設定ではありません。

## 移行時の注意事項 {#migration-notes}

古いデプロイを移行する場合は、まず公開名へ変更し、旧名は未設定にします。両方が設定されている場合、運用時は `DW_*` の値を基準として考え、旧名を削除してください。

```bash
# Before
WORKFLOW_SERVER_AUTH_DRIVER=token
WORKFLOW_SERVER_OPERATOR_TOKEN=operator-secret

# After
DW_AUTH_DRIVER=token
DW_OPERATOR_TOKEN=operator-secret
```

移行後は `DW_ENV_AUDIT_STRICT=1` で Server イメージを起動し、変数の誤記、古いエイリアス、旧手順書からコピーされた設定を検出してください。
