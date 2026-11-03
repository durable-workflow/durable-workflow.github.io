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

## アクティビティの再試行コンテキストと所属する実行 {#activity-retry-context}

PHP SDK **3.6.1 以降**では、サービスモードのアクティビティで `$context->retryInfo`、`$context->workflowId`、`$context->runId` を参照できます。回数制限のあるポリシーの最後の設定済み試行は、`$context->retryInfo->isLastConfiguredAttempt() === true` で判定します。`attemptNumber` は、受信した元の試行番号を保持します。

再試行スナップショットは、次の 3 つを区別します。`policyProvided === false` はクレームにポリシーが含まれていない状態、ルート値として渡された `null` は不明な旧形式のポリシー、明示的な `max_attempts: null` を含むオブジェクトは無制限の試行を意味します。`maxAttempts()` が `null` を返すだけでは、無制限とは判断できません。SDK はデフォルトの試行回数を補いません。キャンセル、再試行不能な失敗、ワークフローの終了、期限切れにより、回数を使い切る前に実行が終了することがあります。

ワークフロー ID と実行 ID は、元の所属先の実行を識別します。旧形式で欠落している ID は `null` のままです。ローカルアクティビティは既知の親 ID を保持しますが、リモート用の再試行ポリシーは引き継ぎません。所属先のワークフローにシグナルを送る際は両方の ID を必須とし、`runId` を指定して対象を固定し、再試行間で同じ業務イベントの安定したリクエスト ID を再利用してください。

業務イベントに対するシグナル処理は冪等にしてください。安定したリクエスト ID だけでは、シグナルが一度だけ受け付けられる保証にはなりません。

PHP SDK ガイドの[最終試行の判定と自身の実行へのシグナル送信の完全な例](https://php.durable-workflow.com/build/workflows-activities/)を参照してください。

## アクティビティのハートビート {#activity-heartbeats}

リモートアクティビティでは、上限を設けた処理の途中で、設定されたハートビートのタイムアウトより十分前に `ActivityContext::heartbeat($details)` を呼び出します。最初の期間はランタイムのタスク取得から始まり、PHP がタスクを受信した時点からではありません。リクエストの遅延、中断、通信の再試行も期間を消費します。[送信間隔の指針](../features/heartbeats.md#heartbeat-cadence-and-receipts)に従ってください。

このメソッドは `void` を返します。直接ハンドラーの経路では、停止を求める応答は `ActivityCancelled` を発生させます。`Client::heartbeatActivityTask()` の HTTP や通信の障害は `ServerException` として現れます。協調的な監督下の Worker は、ハートビートや所有権の確認に失敗すると、アクティビティコードに通常の応答を渡さずにコールバックを停止または放棄する場合があります。後始末が必ず実行されると考えたり、権限喪失のエラーを抑制したり、権限を失ってから成功を送信したりしないでください。

呼び出しから戻っても外部処理をコミットしたり、再開可能なチェックポイントを取得したりするわけではありません。外部作用は冪等にし、通信の再試行を新しいハートビート期間として扱わないでください。

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

## エントリの互換性と復旧 {#entry-compatibility-and-recovery}

**公開済みのサポートです。** PHP SDK 2.5.4 で以下のエントリ保護が導入され、Server 2.9.9 でルーティングと復旧がサポートされました。これらは機能の最小対応バージョンです。セキュリティ修正を含む最新の安定版をインストールしてください。

管理対象 Worker は、ハンドラーの Fiber に入る前に記録済みの位置引数を確認します。必須引数の不足や宣言された PHP 型との不整合は `DurableWorkflow\Exception\WorkflowEntryArgumentsMismatch` を発生させ、タスク理由 `workflow_entry_arguments_mismatch` を報告します。省略可能な引数の既定値は入力が省略された場合だけ適用され、互換性のない記録済み値を置き換えません。進入に成功した後の `TypeError` は引き続きアプリケーションの失敗です。

Worker は `workflow_entry_arguments_validation` を自動的に通知します。対応する Server 機能があれば、拒否されたタスクはリプレイがブロックされ、元の実行は非終端のままです。古いランタイムは失敗したタスクを再試行する場合があるため、SDK のアップグレードだけでは復旧契約全体は成立しません。

`Client::describeWorkflow($workflowId, $runId)` と実行指定のデバッグエンドポイントで元の実行を調べます。互換コードに戻してから `Client::repairWorkflow($workflowId, $runId)` を呼び、入力、履歴、ルーティング識別情報、期限を変えずに同じ実行が再開することを確認してください。この失敗をワークフロー本体で捕捉したり、互換性のないコードに対して修復を繰り返したりしてはいけません。[サービスモードの復旧手順](../failures-and-recovery.md#service-entry-recovery)と[定義ルーティング](./worker-compatibility-routing.md#definition-fingerprint-evolution)を参照してください。

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

## ワークフロー一覧と履歴のページ {#workflow-list-and-history-pages}

公開されている次の呼び出しは、自動的な全件取得ではなく**1ページ**を返します：`Client::listWorkflows(...)` / `Client::workflowHistory(...)`。返された不透明な token で続け、namespace、フィルター、選択した workflow/run を維持してください。最後の null/空 token で終了し、ページのエラーを明示的に処理します。部分的なページは replay bundle ではありません。オフライン replay には SDK の履歴エクスポート API を使います。[公開 PHP 3.2.0 クライアントのソース](https://github.com/durable-workflow/sdk-php/blob/3.2.0/src/Client.php)が現在の引数を定義しており、新たな自動イテレーターの提供を意味しません。

## 障害レポートのサイズ制限 {#bounded-failure-reports}

PHP SDK **3.5.0** から、送信する障害レポートにサイズ制限が加わりました。既定値は、**メッセージが UTF-8 で 62 KiB**、**スタックが 128 KiB**、**シリアライズ後の任意の詳細と診断情報が合計 64 KiB**、**JSON でエンコードした本文全体が 1 MiB** です。本文の上限には、マーカー、JSON エスケープ、リースの識別情報、バッチ内のほかのコマンドも含まれます。設定またはトランスポートが宣言した上限がより小さい場合は、その値が優先されます。障害の型、クラス、コード、リトライポリシー、リースの識別情報は保持されます。

`withFailureReportLimit()` は、リクエスト全体の上限を 1〜1,048,576 バイトの範囲で引き下げた新しいクライアントを返します。返されたインスタンスを使用してください。トランスポートがより小さい上限を宣言している場合は、その値も適用されます。

```php
<?php

use DurableWorkflow\Client;

$client = (new Client(
    baseUri: 'https://workflow.example.com',
    controlToken: 'operator-token',
    workerToken: 'worker-token',
))->withFailureReportLimit(512 * 1024);
```

短縮されたフィールドには、見える切り詰めマーカーと元のバイト数が付けられます。Avro の詳細は全体を保持するか、全体を省略します。必須のエンベロープを表現できない場合は、HTTP 送信前に `DurableWorkflow\Exception\FailureReportRefused` が発生します。ローカル障害はワークフローコードが参照する前に正規化されるため、初回実行とコールドリプレイは保存された同じメッセージを参照します。一度参照したローカルメッセージは、最終的なバッチサイズ調整でも変更されません。
