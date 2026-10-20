---
sidebar_position: 9
title: PHP SDK
description: フレームワークに依存しない PHP アプリケーションとリモート Worker を、セルフホストの Server または Cloud 管理ランタイムに接続します。
tags:
  - php
  - sdk
  - workers
  - polyglot
keywords:
  - sample-app-playground
  - Durable Workflow PHP SDK
  - PHP リモート Worker
  - PHP スタンドアロン Server クライアント
---

import ProductPromotion from '@site/src/components/ProductPromotion';

# PHP SDK {#php-sdk}

PHP アプリケーションやリモート Worker を、スタンドアロンの Durable Workflow Server または Durable Workflow Cloud 名前空間ランタイム URL に接続する場合は、`durable-workflow/sdk` を使います。このファーストパーティ SDK はフレームワークに依存しません。Laravel や組み込みエンジンのパッケージを必要とせず、コントロールプレーンクライアント、認証、トランスポート、公開ペイロードコーデック、リプレイハンドラー、管理されたリモート Worker ライフサイクルを提供します。

## ローカルの Sample App プレイグラウンドを試す {#try-the-local-sample-app-playground}

Cloud を使わず最短で記述を試すには、現在の [Sample App の `main` ブランチを GitHub Codespaces で開き](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main)、次を実行します。

<!-- docs-example id="sdk.php.sample-app-playground" -->
```bash
scripts/playground php
```

ローカルプレイグラウンドは呼び出し元が所有するワークフローとアクティビティのソースを生成し、現在の安定版成果物を選択し、公開された Server と Waterline を起動します。ID、ワークフロー型、アクティビティ型、タスクキューが生成した契約と一致する Worker 登録を待ってから、ワークフローを開始します。成功には期待した完了結果と履歴が必要です。その後、ターミナルは正確なローカル Waterline 実行リンクと構造化 JSON 証跡のパスを表示します。

Sample App を使わず既存プロジェクトへ SDK を追加したい利用者には、以下のパッケージ所有のクイックスタートと API リファレンスが直接の経路です。

<ProductPromotion source="docs-v2-php-sdk">
別々のロール別認証情報を使い、Cloud 管理の名前空間に対して PHP クライアントと Worker を実行します。
</ProductPromotion>

段階的なオンボーディング、フレームワークごとの手順、テスト、デプロイ、トラブルシューティングには、執筆された [PHP 開発者ポータル](https://php.durable-workflow.com/)を使います。正確なコンストラクターシグネチャ、戻り値の型、例外クラスには、別の[生成 API リファレンス](https://php.durable-workflow.com/api/)を使います。ポータルの[機械可読契約](https://php.durable-workflow.com/quickstart-contract.json)は、パッケージ、ランタイム形式、ロール認証情報、同梱ソースファイル、期待結果、公開成果物のスモークテストを、1つのテスト済み経路として特定します。

Cloud の利用者は、プロビジョニングで返されたランタイム URL と名前空間を、別々のクライアントと Worker の認証情報で使います。この接続境界は [Cloud 管理ランタイム](/docs/polyglot/cloud-control-plane)を参照してください。以下の例は同じ SDK をローカルのセルフホスト値で使います。

別の組み込み Laravel 経路には `durable-workflow/workflow` を使います。アプリケーションが既存のデータベースにワークフロー状態を所有し、Laravel キューで処理を実行します。所有権の完全な比較は[デプロイモード](/docs/polyglot/deployment-modes/)を参照してください。

## 要件 {#requirements}

- PHP 8.1 以降
- 到達可能な[セルフホスト Server](/docs/polyglot/server/)、またはプロビジョニング済みの [Cloud 名前空間ランタイム](/docs/polyglot/cloud-control-plane)

## インストール {#install}

現在公開されている PHP SDK をインストールします。以下の正確な要件は、レジストリで更新された公開成果物の正本から生成し、Composer は解決したパッケージを `composer.lock` に記録します。

<!-- docs-example id="php.sdk.install" -->
```bash
composer require %%artifact.publishedPhpSdkComposerPackage%%
```

SDK は公開ペイロードエンベロープに公式の `apache/avro` Composer パッケージを使います。本番依存関係グラフに Laravel、Illuminate、`durable-workflow/workflow`、`durable-workflow/server` は含みません。

## ワークフローの開始と検査 {#start-and-inspect-a-workflow}

SDK 所有のクイックスタートは、空の Composer プロジェクトを作成し、属性付きのワークフローとアクティビティを1つずつ定義し、Worker を起動し、一意なワークフローを開始して結果を待ちます。同じ同梱 `bootstrap.php`、`worker.php`、`client.php` をパッケージからインストールし、保護された公開成果物のスモークテストで実行するため、このページは2つ目のコード一覧を管理しません。

ランタイムの接続値だけを選びます。

| ランタイム | `Client` へ渡す値 | SDK リクエストパスの動作 |
| --- | --- | --- |
| セルフホスト Server | `http://localhost:8080` などのオリジンのみ | `/api` を1つ追加する。呼び出し元は `/api` を付けない。 |
| Durable Workflow Cloud | `https://cloud.example/api/runtime/v1/namespaces/<runtime-id>` などの完全なプロビジョニング済み URI | 名前空間ランタイムパスを保持し、その後にエンドポイントの `/api` を追加する。 |

正確なコマンドと確認できるソースは[テスト済み PHP 手順](https://php.durable-workflow.com/)を開いてください。クライアント操作は `DURABLE_WORKFLOW_CLIENT_TOKEN` を読み、Worker のポーリングは `DURABLE_WORKFLOW_WORKER_TOKEN` を読みます。ガイドは両認証情報を別プロセスに保持し、値を表示もコミットもしません。

`Worker::register()` は同じソースファイル内の `#[Workflow]` と `#[Activity]` ハンドラーを検出します。callable を起点とするコード向けに、直接 `registerWorkflow()` / `registerActivity()` を使う代替経路も記載しています。同梱ファイルを独立したプロジェクト、SDK チェックアウト、インストール済みパッケージ、または Composer の `vendor/` の隣に置くプレイグラウンド・コンテナで実行するとき、ブートストラップがオートローダーパスの選択を利用者から取り除きます。

`WorkflowHandle` は continue-as-new 遷移後の現在の実行を追跡します。操作を特定の1実行に固定して保護する必要がある場合は、選択実行用メソッドを使います。

## ライフサイクル、更新、スケジュール、可視性 {#lifecycle-updates-schedules-and-visibility}

現在の公開クライアントは、選択した実行の結果処理より広い範囲を持ちます。

- `WorkflowHandle` は `describe`、`result`、`signal`、`query`、`cancel`、`terminate` と、実行固有の安全性のための選択実行版を公開します。
- `Client` は Server のフィルタリングとページングを持つ `listWorkflows`、`workflowHistory`、`updateWorkflow`、`cancelWorkflow`、`terminateWorkflow` を公開します。
- `requestCancellation()` は協調する Worker に時間を制限したクリーンアップを要求します。既存の `cancel()` と `cancelWorkflow()` は実行を即時に閉じます。記述と復旧の契約は[協調キャンセル](/docs/polyglot/cancellation)を参照してください。
- スケジュールメソッドは作成、説明、一覧、更新、一時停止、再開、トリガー、バックフィル、削除を網羅します。
- 運用上の可視性には `listNamespaces`、`listWorkers`、`listTaskQueues` と対応する説明メソッドを含みます。

リモート Worker は `registerWorkflow`、`registerActivity`、`registerQuery`、`registerUpdate` でワークフロー、アクティビティ、クエリ、更新のハンドラーを登録します。完全なパラメーターと戻り値の型は、生成された [PHP SDK API リファレンス](https://php.durable-workflow.com/api/)を使ってください。

## リモート PHP Worker の実行 {#run-a-remote-php-worker}

ワークフローハンドラーは、管理された Fiber 内で直線的なコードとして実行する通常の callable です。`WorkflowContext::activity()` などの操作を直接呼びます。SDK は永続的な判断で Fiber を中断し、リプレイでは外部アクティビティを繰り返さず記録済みの結果を返します。ワークフローを Generator として宣言したり、`WorkflowContext` コマンドを yield したりしないでください。Generator の結果は拒否されます。管理された Worker はワークフロー型名とアクティビティ型名を登録し、公開 Worker プロトコルをポーリングし、ハートビートし、タスクを完了または失敗させ、`pcntl` が利用可能なら正常終了を処理します。

### 最初の完了の選択 {#first-completion-selection}

`WorkflowContext::select()` を使うと、独立した遅延アクティビティ、子ワークフロー、タイマー、条件待機、ネストした通常のバリアを開始し、最初に永続コミットされた勝者から再開できます。返された `SelectionResult` には、安定したメンバーキーと ID、および各メンバーのハンドルが入ります。

```php
$selected = $ctx->select([
    'resolver' => fn () => $ctx->activity('resolve-request', [$requestId]),
    'input' => fn () => $ctx->waitCondition(
        fn (): bool => $this->resolution !== null,
        key: 'resolution-ready',
    ),
    'deadline' => fn () => $ctx->sleep(2),
]);

if ($selected->key === 'deadline') {
    $selected->handles['resolver']->cancel();
}
```

選択は非勝者をキャンセルしません。最終結果を消費するにはハンドルの `await()`、明示的なキャンセルを記録するには `cancel()` を呼びます。コールド Worker または完了済み履歴のリプレイは、重複や後続の入力・終了イベントが別の順で届いても、記録した勝者を消費します。`cancel()` は void を返し、終了結果を報告しません。キャンセルが勝ったことを証明するのは `SelectionOperationCancelled` 履歴だけです。リプレイは印のないキャンセル要求を越えて進み、操作が先に完了していた場合、`await()` は引き続きその結果を返します。

## フレームワークのサービスモードと組み込み Laravel {#framework-service-mode-and-embedded-laravel}

同じパッケージはファーストパーティの [Laravel サービスモード](https://github.com/durable-workflow/sdk-php#laravel-service-mode)と [Symfony サービスモード](https://github.com/durable-workflow/sdk-php#symfony-service-mode)のブリッジを同梱します。Cloud または Server に接続しながら、フレームワークの依存性注入、設定、ログ、コンソール Worker、テスト用 fake を維持します。

これらのブリッジは、`durable-workflow/workflow` によって Laravel アプリケーション自体が永続状態を所有し Laravel キューで実行する[組み込み Laravel ワークフロー](/docs/installation/)とは別です。ドレインとロールバックを含め、v1、v2 組み込み、同梱サービスモードブリッジで同じ代表的な Laravel ユースケースを比較するには、[Laravel の採用とランタイム移行](/docs/laravel-adoption/)を参照してください。より広いランタイム境界の比較には[デプロイモード](/docs/polyglot/deployment-modes/)を使います。

## プロトコルとリリースの境界 {#protocol-and-release-boundary}

SDK は、対応する Server 範囲、Worker プロトコルバージョン、コントロールプレーンバージョン、ペイロードコーデックを Composer メタデータで宣言します。Server も `GET /api/cluster/info` から受け入れるプロトコルとコーデックの集合を公開します。Server のパッチバージョンから互換性を推測せず、デプロイ時にランタイムディスカバリーを確認してください。

PHP SDK は Laravel パッケージとは独立にバージョン管理します。実行可能な例には正確な公開済みバージョン指定を維持し、SDK のアップグレード時はリリースノートを評価してください。互換性はパッケージのバージョン番号の一致ではなく、SDK の宣言した契約に従います。

## 関連リファレンス {#related-references}

- [スタンドアロン Server](/docs/polyglot/server/)
- [デプロイモード](/docs/polyglot/deployment-modes/)
- [Worker プロトコル](/docs/polyglot/worker-protocol/)
- [機能インデックス](/docs/capabilities/)
- [PHP 開発者ポータル](https://php.durable-workflow.com/)
- [PHP API リファレンス](https://php.durable-workflow.com/api/)
- [PHP 実行可能クイックスタート契約](https://php.durable-workflow.com/quickstart-contract.json)
- [PHP SDK ソース](https://github.com/durable-workflow/sdk-php)
