---
sidebar_position: 4
title: 名前空間、認証、Worker 登録
description: Server の名前空間解決、ロール別認証、Worker 登録契約のリファレンス。
tags:
  - server
  - namespaces
  - authentication
  - worker-protocol
keywords:
  - Durable Workflow 名前空間認証
  - ロール別 Server トークン
  - Worker 登録契約
  - X-Namespace
---

# 名前空間、認証、Worker 登録 {#namespace-auth-and-worker-registration}

スタンドアロン Server のプロビジョニング、自動化用認証情報の発行、Worker ランタイムの実装に、このリファレンスを使います。Server には3つの独立した契約があり、処理を流す前に一致させる必要があります。

- リクエストは `X-Namespace`、`?namespace=`、または Server の既定の名前空間で対象を指定する
- 認証情報はルート群が要求するロールを持つ
- Worker は、ワークフロー開始とタスクのポーリングで使うものと同じ名前空間、タスクキュー、ランタイム、型キー、容量を登録する

## リクエストの権限情報 {#request-authority}

Durable Workflow は、名前空間、認証ロール、プロトコルバージョンをリクエストの権限情報として扱います。ワークフロー ID、タスク ID、表示ラベルから推測しないでください。

| リクエスト群 | 必要な認証情報のロール | 必要なバージョンヘッダー | 名前空間の取得元 |
| --- | --- | --- | --- |
| ディスカバリー `GET /api/cluster/info` | `worker`、`operator`、`admin` のいずれか | なし | コンテキスト用の任意の `X-Namespace` |
| 名前空間の一覧・説明 | `operator` または `admin` | `X-Durable-Workflow-Control-Plane-Version: 2` | ルートの対象またはリクエストコンテキスト |
| 名前空間の作成・更新・ストレージポリシー | `admin` | `X-Durable-Workflow-Control-Plane-Version: 2` | ルートの対象またはリクエスト本文 |
| ワークフロー、スケジュール、タスクキュー、ブリッジアダプター、Worker の可視性 | `operator` または `admin` | `X-Durable-Workflow-Control-Plane-Version: 2` | `X-Namespace`、`?namespace=`、既定値の順 |
| システムのヘルス、メトリクス、パス、ストレージテスト | `admin` | `X-Durable-Workflow-Control-Plane-Version: 2` | `X-Namespace`、`?namespace=`、既定値の順 |
| Worker の登録、ポーリング、ハートビート、完了 | `worker` | `X-Durable-Workflow-Protocol-Version: 1.0` | `X-Namespace`、`?namespace=`、既定値の順 |

ロール制限のあるエンドポイントでは、Server は名前空間の存在より先にルートのロールを検査します。誤ったロールのトークンには、名前空間の存在を示さず認証失敗を返します。ロールとバージョンの検査を通過した後、名前空間スコープのルートは未知の名前空間を `reason: "namespace_not_found"` で拒否します。

## 認証ロール {#auth-roles}

トークン認証は本番環境の既定経路です。

```bash
DW_AUTH_DRIVER=token
DW_WORKER_TOKEN=worker-secret
DW_OPERATOR_TOKEN=operator-secret
DW_ADMIN_TOKEN=admin-secret
```

デプロイが単一の共有 `DW_AUTH_TOKEN` を使う場合、そのトークンは実質的にすべてのルート権限を持ちます。Worker プロセスが名前空間を変更したりシステム保守パスを実行したりできないよう、本番環境ではロール別トークンを推奨します。

署名認証にも同じロールの分離があります。

```bash
DW_AUTH_DRIVER=signature
DW_WORKER_SIGNATURE_KEY=worker-signature-secret
DW_OPERATOR_SIGNATURE_KEY=operator-signature-secret
DW_ADMIN_SIGNATURE_KEY=admin-signature-secret
```

`DW_AUTH_DRIVER=none` はローカル開発専用です。すべてのルートから認証境界を取り除くため、信頼できるローカルネットワークの外に公開してはいけません。

## シグナルの認可と帰属 {#signal-authorization-and-attribution}

シグナルを受け入れる前に、Server はリクエストを認証し、設定されたロールと名前空間ポリシーを強制します。ワークフローのシグナルルートには `operator` または `admin` の認証情報が必要です。このルート権限は、アプリケーションの注文承認ポリシーを実装するものではありません。シグナルを転送する前に信頼できるアプリケーションゲートウェイ、または対応するカスタム認証プロバイダーで、その業務上の判断を強制してください。エンドユーザーが直接シグナルを送ってはいけない場合、特権 Server 認証情報はその信頼境界内に保管します。

Server は認証した認証情報からコマンドの `principal` を導出します。`approvedBy` のようなシグナル引数は、アクターの subject と同じつづりでもアプリケーションデータのままです。1つのサービストークンを使うゲートウェイは、そのサービスの principal を記録し、必ずしも背後の要求者である人間を記録しません。人間の承認フィールドはクライアントから受け入れず、ゲートウェイの認証済みユーザーと認可判断から導出してください。

監査の検査では、コマンドレスポンスと関連するコマンド・履歴メタデータが記録済みの principal を公開します。永続化されたコマンドはこれを `context.principal` に保存します。これはシグナル引数や、ワークフローの名前付きシグナル待機が返す値とは別です。principal メタデータの欠落は、特定の送信者の証拠になりません。Laravel ポリシー検査とホスト側のコマンドコンテキストは[組み込みシグナルの例](/docs/features/signals#sender-identity-and-authorization)を参照してください。

監査証跡に安定したアクター subject が必要な場合は、[名前付き principal トークン](/docs/polyglot/server-config-reference#authentication)を使います。共有ロールトークンは個々のアプリケーションユーザーを識別せず、認証を無効化した開発モードは認証済みの人間 ID を提供しません。転送された呼び出し元・認証帰属ヘッダーは、設定した監査ラベルを追加できますが、Server が認証した principal を提供しません。[信頼できるゲートウェイの要件](/docs/polyglot/server-config-reference#command-attribution)を満たさない限り、帰属の転送を無効のままにしてください。

## 名前空間の契約 {#namespace-contract}

ブートストラップ処理は既定の名前空間を作成します。名前空間ヘッダー省略時に `default` 以外へ解決させるには、`DW_DEFAULT_NAMESPACE` を設定します。

```bash
DW_DEFAULT_NAMESPACE=default
```

クライアントや Worker を向ける前に、各テナントまたは環境の名前空間を作成します。

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/namespaces" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "orders-prod",
    "description": "production order workflows",
    "retention_days": 90
  }'
```

名前空間名は小文字に正規化され、英字、数字、ドット、アンダースコア、ダッシュを含められます。正規化後に一意です。たとえば `Production` を作成してから `production` を作ると、`reason: "namespace_already_exists"` の競合になります。

通常のワークフロー開始は `X-Namespace` で名前空間を指定します。

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/workflows" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_type": "orders.fulfillment",
    "workflow_id": "order-1001",
    "task_queue": "orders",
    "input": ["order-1001"]
  }'
```

コントロールプレーンの読み取り、ワークフローコマンド、スケジュール操作、検索属性操作、タスクキューと Worker の可視性は同じ名前空間コンテキストを使います。名前空間管理ルート自体は例外で、ルートまたはリクエスト本文の名前空間を対象にし、作成や説明の実行前にその名前空間が存在することを要求しません。

## Worker 登録の契約 {#worker-registration-contract}

すべての Worker プロセスはポーリング前に登録する必要があります。登録は名前空間に属し、組 `(namespace, worker_id)` が Worker レコードを識別します。登録した `task_queue` は、その Worker ID の後続ポーリングリクエストと一致する必要があります。

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/worker/register" \
  -H "Authorization: Bearer $DW_WORKER_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Protocol-Version: 1.0" \
  -H "Content-Type: application/json" \
  -d '{
    "worker_id": "py-orders-1",
    "task_queue": "orders",
    "runtime": "python",
    "sdk_version": "<installed-sdk-version>",
    "build_id": "orders-worker-2026-04-22",
    "supported_workflow_types": ["orders.fulfillment"],
    "workflow_definition_fingerprints": {
      "orders.fulfillment": "sha256:definition-fingerprint"
    },
    "supported_activity_types": ["payments.capture"],
    "max_concurrent_workflow_tasks": 10,
    "max_concurrent_activity_tasks": 50
  }'
```

| フィールド | 必須 | 契約 |
| --- | --- | --- |
| `worker_id` | いいえ | 安定したプロセス ID。省略時は Server が生成するが、長時間動くランタイムはログとタスクキュー診断のために設定するべき。 |
| `task_queue` | はい | この Worker がポーリングするキュー。別キューへのポーリングは `reason: "task_queue_mismatch"` で失敗する。 |
| `runtime` | はい | `php`、`python`、`rust`、`typescript`、`go`、`java`、`external` のいずれか。ランタイム識別子を受け入れることはファーストパーティ SDK の存在を意味しない。 |
| `sdk_version` | いいえ | Worker の可視性と診断に表示するランタイム SDK バージョン。 |
| `build_id` | いいえ | タスクキューの build-id 可視性とロールアウトコホートで使うデプロイ・ビルド ID。1つのリプレイ互換 Worker ファミリー内では安定させる。 |
| `supported_workflow_types` | いいえ | この Worker がリプレイできるワークフロー型キー。空はワークフロー型フィルターなしを意味する。 |
| `workflow_definition_fingerprints` | いいえ | ワークフローごとの決定的な定義フィンガープリント。変更されたフィンガープリントによる有効な Worker の再登録は拒否される。 |
| `supported_activity_types` | いいえ | この Worker が実行できるアクティビティ型キー。空はアクティビティ型フィルターなしを意味する。 |
| `max_concurrent_workflow_tasks` | いいえ | 広告するローカルのワークフロータスクスロット。既定 `100`、最小 `1`。 |
| `max_concurrent_activity_tasks` | いいえ | 広告するローカルのアクティビティタスクスロット。既定 `100`、最小 `1`。 |

広告する定義フィンガープリントが変わらない場合、同じ Worker ID の有効な Worker を再登録できます。稼働中 Worker が、すでに広告した型のワークフローコードを変更した場合、新しい `worker_id` で再起動する必要があります。そうしないと登録は `reason: "workflow_definition_changed"` で失敗します。

`build_id` は飾りのメタデータではありません。タスクキューのロールアウト API が使う、運用向けのコホート ID です。同じ進行中処理を安全にリプレイできる Worker は1つの `build_id` を維持し、ロールアウトで新しい互換性ファミリーを作る場合に変更します。固定とロールバックの契約は [Worker の互換性とルーティング](/docs/polyglot/worker-compatibility-routing)、ドレイン・再開の手順は [Worker Build-Id のロールアウト](/docs/polyglot/worker-build-id-rollout)を参照してください。

## ポーリングと可視性 {#polling-and-visibility}

Worker のポーリングリクエストは、登録時と同じ名前空間、Worker ID、タスクキューを使う必要があります。

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/worker/workflow-tasks/poll" \
  -H "Authorization: Bearer $DW_WORKER_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Protocol-Version: 1.0" \
  -H "Content-Type: application/json" \
  -d '{
    "worker_id": "py-orders-1",
    "task_queue": "orders",
    "timeout_seconds": 30
  }'
```

運用担当者は、コントロールプレーンの可視性を通じて同じ登録状態を検査できます。

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/task-queues/orders" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" | jq '.pollers, .admission'
```

Worker がタスクを受け取れないとき、最初にタスクキューの可視性を確認します。Worker 不在と、キュー不一致、未対応のワークフロー・アクティビティ型フィルター、Worker スロットの飽和、Server の有効リース上限、ディスパッチレート上限、クエリタスクのバックプレッシャーを区別します。

Server が `GET /api/cluster/info` で `worker_protocol.server_capabilities.poll_status = true` を広告する場合、ポーリングレスポンス自体も `poll_status` に同じ機械可読の結果を公開します。ワークフロータスク、アクティビティタスク、クエリタスクのポーリングルートは、`task` が `null` でもこのフィールドを保持するため、Worker ランタイムは安定した1つのサーフェスで分岐できます。

- `leased`: タスクのリースに成功した。
- `empty`: ポーリングが戻るまでに実行可能なタスクはなかった。
- `throttled`: キューの受け入れ制限により、このポーリングでは新しいタスクを渡さなかった。
- `unavailable`: Server がキューを安全に調整できず、空のキューを装う代わりに型付きの利用不能結果を返した。
- `draining`: Worker の build-id コホートがドレイン中のため、コホートを再開するまでポーリングは HTTP `409` と `reason: "worker_draining"` で失敗する。

## エラーサーフェス {#error-surface}

自動化は文章のメッセージではなく、名前付きの理由で分岐するべきです。

| 理由 | 場所 | 意味 | 運用上の対応 |
| --- | --- | --- | --- |
| `missing_control_plane_version` | コントロールプレーンルート | リクエストに `X-Durable-Workflow-Control-Plane-Version: 2` がない。 | バージョンヘッダーを追加するかクライアントプロファイルを更新する。 |
| `missing_protocol_version` | Worker ルート | リクエストに `X-Durable-Workflow-Protocol-Version: 1.0` がない。 | Worker クライアントまたは SDK のバージョンネゴシエーションを修正する。 |
| `namespace_not_found` | 名前空間スコープのルート | `X-Namespace`、クエリ文字列、Server 既定値による名前空間が存在しない。 | 名前空間を作るかクライアントの名前空間を修正する。 |
| `namespace_already_exists` | `POST /api/namespaces` | 正規化した名前空間名がすでに存在する。 | 再利用するか別名を選ぶ。 |
| `task_queue_mismatch` | Worker ポーリングルート | あるキューで登録した Worker ID が別キューをポーリングした。 | 新しい Worker ID で再起動するか、登録したキューをポーリングする。 |
| `worker_draining` | Worker ポーリングルート | Worker の build-id コホートはドレイン中で、進行中処理は完了できるが新しいタスクはクレームできない。 | ロールバックのためコホートを再開するか、現在のリースを処理し終えた後に Worker を停止する。 |
| `workflow_definition_changed` | `POST /api/worker/register` | 有効な Worker ID が変更したワークフローフィンガープリントを広告しようとした。 | 変更したプロセスを新しい Worker ID で再起動する。 |
| `validation_failed` | JSON ルート全般 | フィールドの欠落、不正、サイズ超過、許容範囲外。 | `errors` または `validation_errors` を読み、ペイロードを修正する。 |

## 関連項目 {#see-also}

- [Server API リファレンス](/docs/polyglot/server-api-reference)
- [Worker プロトコル](/docs/polyglot/worker-protocol)
- [タスクキューの受け入れ](/docs/polyglot/task-queue-admission)
- [CLI コマンドリファレンス](/docs/polyglot/cli-reference)
