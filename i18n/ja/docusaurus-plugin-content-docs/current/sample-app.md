---
sidebar_position: 8
tags:
  - sample-app
  - Laravel
  - message-streams
  - Waterline
keywords:
  - サンプルアプリ
  - Laravel 利用アプリ
  - AI ワークフローのサンプル
  - Waterline ダッシュボード
---

# サンプルアプリ {#sample-app}

https://github.com/durable-workflow/sample-app

これは組み込み Laravel のギャラリーです。安定版 Durable Workflow 2.0 リリース系列で構築した Laravel 13 サンプルアプリケーションで、GitHub Codespace で実行できるワークフローを備えています。デプロイモデルが**組み込み Laravel**で、Laravel のキュー実行と Waterline を一緒に調べたい場合の出発点です。

ランタイムに合った例を選んでください。

| デプロイモデル | 例への経路 |
| --- | --- |
| Durable Workflow Cloud | [Cloud マネージドランタイム](/docs/polyglot/cloud-control-plane/)から始め、プロビジョニングされた名前空間認証情報で PHP、Python、Rust SDK ガイドを選びます。Cloud ユーザーは Server を実行しません。 |
| セルフホストのサービスモード | ローカル Server に対する PHP、Python、Rust の公開成果物による完全な例には、[Durable Workflow 2.0 クイックスタート](/docs/quickstart/)を使います。 |
| 組み込み Laravel | このギャラリーと[組み込みのインストール](/docs/installation/)に進みます。 |

このギャラリーは Laravel 内で動くエンジンのエンドツーエンドの証拠であり、サービスモードや多言語デプロイの汎用スターターアプリではありません。組み込み機能が現実的な Laravel 検証を最初に受ける場所であり、このサイトが Laravel ネイティブのパターンを示す際に複製する情報源です。共有したい durable-workflow パターンがある場合は、[サンプルを貢献する](/docs/contribute-a-sample)ガイドが提出手順を説明しています。

> Laravel 12 / Durable Workflow 1.x 版をお探しですか。[`Laravel-12` ブランチ](https://github.com/durable-workflow/sample-app/tree/Laravel-12)に保存されています。v1 パターン（`Workflow\Workflow`、`yield activity(...)`、`Workflow\Activity` など）を参照する古いブログ記事やチュートリアルは、そのブランチを対象とします。

## サンプルギャラリー {#sample-gallery}

各エントリは、サンプルが教えるパターン、実行するワークフロークラス、artisan コマンド、実行のコミットを証明する Waterline 画面を示します。ギャラリーは sample-app リポジトリの README「Sample Index」を複製します。サンプルの追加・移動時は、README とギャラリーをまとめて変更します。

| パターン | ワークフロークラス | コマンド | Waterline 画面 |
|---------|----------------|---------|------------------|
| 最小の決定的 v2 ワークフロー | `App\Workflows\Simple\SimpleWorkflow` | `php artisan app:workflow` | 実行一覧 → 二つのアクティビティイベントと `WorkflowCompleted` イベントがある実行詳細 |
| リプレイによるずれのない永続的な経過時間測定 | `App\Workflows\Elapsed\ElapsedTimeWorkflow` | `php artisan app:elapsed` | `TimerFired` イベントを挟む `sideEffect` の時刻読み取りに対応する、二つの `SideEffectRecorded` イベントを示す実行詳細 |
| Laravel アプリ境界をまたぐ連携 | `App\Workflows\Microservice\MicroserviceWorkflow` | `php artisan app:microservice` | アプリとマイクロサービスの Worker 間でタスクキュールーティングされたアクティビティイベントを示す実行詳細 |
| 成果物を記録するブラウザー自動化 | `App\Workflows\Playwright\CheckConsoleErrorsWorkflow` | `php artisan app:playwright` | Playwright、FFmpeg、クリーンアップのアクティビティを順に示す実行詳細 |
| シグナル待機を持つ Webhook 起動ワークフロー | `App\Workflows\Webhooks\WebhookWorkflow` | `php artisan app:webhook` | Webhook 入口からの `WorkflowStarted` と `ready` の `SignalReceived` イベントを示す実行詳細 |
| 永続リトライ・検証を備えた AI アクティビティループ | `App\Workflows\Prism\PrismWorkflow` | `php artisan app:prism` | 繰り返しのアクティビティ試行と、バリデーターを満たす `ActivityCompleted` を示す実行詳細 |
| Saga 補償を備えたシグナル駆動 AI エージェント | `App\Workflows\Ai\AiWorkflow` | `php artisan app:ai` | メッセージストリーム参照、更新履歴、Saga 失敗後に記録された補償アクティビティを示す実行詳細 |

Waterline 画面欄は、正常な実行で見えるはずのイベントを示します。ローカル実行で一つ欠けていれば、その差分が Worker 側または環境の問題を絞り込む最短経路です。

## パターンページとの相互リンク {#pattern-page-cross-links}

このサイトのパターンページは、各機能を実行するサンプルワークフローへ直接リンクします。この表でパターンページから対応する実行可能なワークフローへ進めます。

| パターンページ | サンプルワークフロー |
|--------------|-----------------|
| [Saga](/docs/features/sagas) | `App\Workflows\Ai\AiWorkflow`（`php artisan app:ai`） |
| [シグナル](/docs/features/signals) | `App\Workflows\Webhooks\WebhookWorkflow`（`php artisan app:webhook`） |
| [メッセージストリーム](/docs/features/message-streams) | `App\Workflows\Ai\AiWorkflow`（`php artisan app:ai`） |
| [子ワークフロー](/docs/features/child-workflows) | 専用ギャラリー項目はまだありません。子ワークフローガイドを使ってください。 |
| [副作用](/docs/features/side-effects) | `App\Workflows\Elapsed\ElapsedTimeWorkflow`（`php artisan app:elapsed`） |
| [Webhook](/docs/features/webhooks) | `App\Workflows\Webhooks\WebhookWorkflow`（`php artisan app:webhook`） |
| [MCP ワークフロー](/docs/mcp-workflows) | `config/workflow_mcp.php` から公開される全ギャラリー項目 |

**手順 1**

このリポジトリの main ブランチから Codespace を作成します。

![Codespace の作成](https://user-images.githubusercontent.com/1130888/233664377-f300ad50-5436-4bb8-b172-c52e12047264.png)

**手順 2**

作成後、Codespace のビルドを待ちます。5～10 分ほどかかります。

**手順 3**

完了すると、エディターと下部のターミナルが表示されます。

![エディターとターミナル](https://user-images.githubusercontent.com/1130888/233665550-1a4f2098-2919-4108-ac9f-bef1a9f2f47c.png)

**手順 4**

composer install を実行します。

```bash
composer install
```

**手順 5**

init コマンドでアプリを設定し、追加依存関係のインストールとマイグレーションを実行します。

```bash
php artisan app:init
```

サンプルアプリの `php artisan migrate` は Workflow と Waterline のパッケージマイグレーションを直接取り込むため、通常のインストール後にすべてのテーブルと Waterline 保存済みビューが使えます。

**手順 6**

キュー Worker を開始します。ワークフローとアクティビティを処理できるようになります。

```bash
php artisan queue:work
```

忙しいキュー Worker が次の `Looping` サイクルに達するのを待たず、修復ループ自体を検証したい場合は、別のターミナルから明示的な復旧スイープを一回実行します。

```bash
php artisan workflow:v2:repair-pass
```

このコマンドは Worker ループと同じスキャン・バックオフポリシーを使います。ローカルのキュー・バックエンドの問題を直した後、サンプルアプリでタスク喪失を検証するとき、トラフィックの少ない Codespace で次のループまで時間がかかる場合に役立ちます。実験中に一つ以上の選択実行へ限定するには `--run-id=...`、インスタンス全体を対象にするには `--instance-id=...` を追加してください。

**手順 7**

新しいターミナルウィンドウを作成します。

![新しいターミナル](https://user-images.githubusercontent.com/1130888/233666917-029247c7-9e6c-46de-b304-27473fd34517.png)

**手順 8**

新しいターミナルでサンプルワークフローを開始します。

```bash
php artisan app:workflow
```

**手順 9**

https://[your-codespace-name]-80.preview.app.github.dev/waterline/dashboard で Waterline ダッシュボードを開けます。

![Waterline ダッシュボード](https://user-images.githubusercontent.com/1130888/233669600-3340ada6-5f73-4602-8d82-a81a9d43f883.png)

Waterline は永続状態のビューです。ワークフローが開始したか、現在の実行はどれか、どの型付き履歴イベントがコミットされたか、どの待機が未完了か、どの運用操作が可能かに答えます。Worker 側のテレメトリは別です。ポーリング遅延、タスク時間、エクスポーター設定、カスタムアプリケーションメトリクス、Worker プロセスエラーは、PHP Worker ログまたは外部 Worker の SDK メトリクスエンドポイントから取得します。

| インターフェース | 分かること | サンプルの確認 |
| --- | --- | --- |
| Waterline と履歴エクスポート | 永続ワークフローのステータス、履歴、リトライ、待機、シグナル、更新、失敗、運用操作 | `/waterline/dashboard` を開き、選択実行の履歴をエクスポートする |
| Worker ログ | PHP キュー Worker のプロセスエラーとアプリケーションログ行 | `php artisan queue:work` の実行中に `storage/logs/laravel.log` を追跡する |
| SDK メトリクス | 外部 Worker・クライアントのリクエスト数、ポーリング遅延、タスク時間 | SDK Worker の Prometheus/OpenMetrics エンドポイントをスクレイプする |

Python Worker では Prometheus extra をインストールし、その Worker プロセスからメトリクスを公開します。

```bash
pip install 'durable-workflow[prometheus]'
```

```python
from prometheus_client import start_http_server

from durable_workflow import Client, PrometheusMetrics, Worker

metrics = PrometheusMetrics()
start_http_server(9102)

async with Client("http://localhost:8080", token="secret", metrics=metrics) as client:
    worker = Worker(
        client,
        task_queue="default",
        workflows=[GreeterWorkflow],
        activities=[greet],
        metrics=metrics,
    )
    await worker.run()
```

`GreeterWorkflow` と `greet` は、その Worker に登録するワークフロー・アクティビティハンドラーに置き換えてください。

`:9102/metrics` から `durable_workflow_worker_*` と `durable_workflow_client_*` 系列をスクレイプします。これらは Worker ランタイムの性能を説明します。コミット済みワークフロー履歴の正しい情報源は、引き続き Waterline です。

Waterline の詳細画面には、選択実行の「Export History」操作があります。インスタンスの現在の実行を表示している場合、このボタンはインスタンス単位の現在実行エクスポートルートを使います。過去の実行詳細は、明示的な `/runs/{runId}/history-export` パスを使い続けます。同じリプレイ・デバッグバンドルをサンプルアプリのターミナルからエクスポートすることもできます。

```bash
php artisan workflow:v2:history-export {workflow-instance-id} --run-id={workflow-run-id} --output=storage/app/workflow-history/example.json --pretty
```

エクスポートには SHA-256 整合性チェックサムが含まれます。別のシステムが HMAC 署名でバンドルを検証する必要がある場合は、アプリ環境に `DW_V2_HISTORY_EXPORT_SIGNING_KEY` と `DW_V2_HISTORY_EXPORT_SIGNING_KEY_ID` を設定してください。

エクスポートの `selected_run` ブロックは、`waits_projection_source`、`timeline_projection_source`、`timers_projection_source`、`lineage_projection_source` を含みます。`links` ブロックにも `projection_source` があり、`links.parents` / `links.children` は、まず選択実行の型付き系譜履歴から取得します。そのため、ローカル実験中に可変リンク行がずれても、子ワークフローと continue-as-new の関係がバンドル内で見えます。系譜行が古い可変の互換性データだけで残っている場合、エクスポート中に追加のリンクメタデータを黙って復元せず、`history_authority = mutable_open_fallback` と `diagnostic_only = true` を付けます。

## AI ワークフローのメッセージストリーム {#ai-workflow-message-streams}

繰り返し AI や人間の入力を受けるワークフローは、正式な v2 メッセージストリームファサードを記述パターンとして使うべきです。

```php
$reply = $this->inbox('ai.assistant')->receiveOne();

$this->outbox('ai.assistant')->sendReference(
    targetInstanceId: $this->workflowId(),
    payloadReference: $storedReplyReference,
    correlationId: $requestId,
);
```

大きなリクエスト・レスポンス本文はアプリ所有のペイロードストレージに保持し、保存済み参照をストリームで渡します。新しいサンプルワークフローに `workflow_messages`、`MessageStreamCursor`、`MessageService` の直接書き込みや呼び出しを教えないでください。安定した v2 inbox/outbox 契約は[メッセージストリーム](/docs/features/message-streams)を参照してください。

**手順 10**

ワークフローとアクティビティのテストを実行します。

```bash
vendor/bin/phpunit
```

これでワークフローを作成し、テストできます。

## AI クライアント用 MCP サーバー {#ai-client-mcp-server}

サンプルアプリは `/mcp/workflows` に Laravel MCP サーバーも公開します。これは Durable Workflow v2 の AI クライアントインターフェースのリファレンスです。エージェントは Waterline をスクレイピングせず、構造化されたワークフロー検出、開始、ステータス、出力、最近の型付き履歴、失敗の事実を取得できます。

詳しい MCP エンドポイントとツール契約は、[MCP ワークフローインターフェース](/docs/mcp-workflows)を参照してください。v2 LLM マニフェスト、CLI 終了コード、Waterline エクスポート、SDK リファレンスを含む、より広い AI 支援開発の契約は、[AI 支援による開発](/docs/ai-assisted-development)を参照してください。

MCP サーバーは Laravel MCP パッケージにより `routes/ai.php` から登録されます。公開ワークフローキーは `config/workflow_mcp.php` にあり、各エントリにはワークフロークラスに加え、説明、認証情報の要件、期待する引数などの検出メタデータを含められます。

既定のツール:

| ツール | 目的 |
| --- | --- |
| `list_workflows` | 設定済みワークフローキー、認証情報の要件、v2 ステータス値、任意で最近の実行を列挙します。 |
| `start_workflow` | 設定済み v2 ワークフローを開始し、`workflow_id`、`run_id`、ステータス、ビジネスキー、コマンド結果を返します。 |
| `get_workflow_result` | 現在または選択した実行をポーリングし、ステータス、出力、可視性メタデータ、最新の失敗概要を返します。 |
| `get_workflow_history` | デバッグ用に、型付き v2 履歴イベントの末尾と最新の永続化された失敗を、件数を制限して返します。 |
| `diagnose_workflow` | 構造化された事実、根本原因、修復方法、次の操作で、選択実行を分類します。 |
| `repair_workflow` | 組み込み v2 修復コマンドを要求し、受理、拒否、不要の構造化された変更結果を返します。 |

一般的なエージェントループ:

```json
{"tool": "list_workflows", "arguments": {"show_recent": true, "limit": 5}}
{"tool": "start_workflow", "arguments": {"workflow": "simple", "business_key": "demo-001"}}
{"tool": "get_workflow_result", "arguments": {"workflow_id": "<workflow_id>"}}
{"tool": "get_workflow_history", "arguments": {"run_id": "<run_id>", "limit": 25}}
```

認証情報不要のスモークテストには `simple` または `elapsed` を使います。`prism` ワークフローは意図的に AI 例として公開されていますが、Worker が完了するには `OPENAI_API_KEY` が必要です。
