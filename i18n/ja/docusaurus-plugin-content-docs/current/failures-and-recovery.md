---
sidebar_position: 11
title: 障害と復旧
description: アクティビティの失敗、再試行不可の例外、実行タイムアウト、キャンセル時のクリーンアップと復旧方法を調べます。
tags:
  - failures
  - recovery
  - operations
keywords:
  - ワークフローの失敗
  - 再試行不可の例外
  - 障害復旧
---

# 障害と復旧 {#failures-and-recovery}

障害を調べる前に、実行の基本契約を確認してください。

- ワークフロータスクは、コミット済み履歴をリプレイして復旧します。
- アクティビティは少なくとも 1 回実行され、同じ処理が複数回観測される場合があります。
- リースの期限切れと再配信は通常の復旧経路です。前の Worker が外部の副作用を実行しなかったことの証明にはなりません。

再試行、再配信、永続的な結果の正確な意味が必要な場合は、まず[実行保証と冪等性](./constraints/execution-guarantees.md) を参照してください。

## 例外の処理 {#handling-exceptions}

アクティビティが例外を投げても、再試行が残っている間は、ワークフローにその例外がすぐには通知されません。システムは再試行ポリシーに従ってアクティビティを再試行し、`$tries` の回数を使い切るまで待ちます。失敗直後に例外をワークフローへ渡したい場合は、`$tries` を 1 にします。

```php
use Exception;
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public int $tries = 1;

    public function handle(): void
    {
        throw new Exception();
    }
}
```

```php
use Exception;
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(): void
    {
        try {
            $result = activity(MyActivity::class);
        } catch (Exception) {
            // handle the exception here
        }
    }
}
```

## 再試行不可の例外 {#non-retryable-exceptions}

再試行すべきでない例外は、再試行不可の例外として扱えます。アクティビティがこの例外を投げると、アクティビティは直ちに失敗となり、再試行を停止します。

```php
use Workflow\V2\Activity;
use Workflow\Exceptions\NonRetryableException;

class MyNonRetryableActivity extends Activity
{
    public function handle(): void
    {
        throw new NonRetryableException('This is a non-retryable error');
    }
}
```

## 復旧手順 {#recovery-process}

失敗するアクティビティを修正する一般的な手順は次のとおりです。

1. 失敗したアクティビティのログを確認し、エラーや例外を調べます。
2. 原因を特定し、コードを修正します。
3. キューを処理している Server に修正をデプロイします。
4. 対象の Worker を再起動または順次入れ替え、新しいコードを読み込ませ、仕事を安全に再取得できるようにします。
5. アクティビティの再試行、または修復と再配信によって、正常な Worker に永続タスクが渡るのを待ちます。
6. Worker のログ 1 行を確定結果と見なさず、Waterline、履歴エクスポート、Server API で永続的な結果を確認します。
7. アクティビティがまだ失敗する場合は、解消するまでこの手順を繰り返します。

再試行が残っている間は、アクティビティが失敗していてもワークフローを実行中に保てます。修正後にアクティビティが成功すれば、ワークフローは完了できます。アクティビティの `$tries` を使い切り、例外をワークフローが処理しなかった場合、ワークフローは失敗状態になります。

## ワークフローのタイムアウト {#workflow-timeout-enforcement}

`StartOptions::withExecutionTimeout()` または `StartOptions::withRunTimeout()` を設定すると、エンジンはワークフロー実行に期限を記録します。execution timeout は continue-as-new の実行を含む論理ワークフロー全体に適用され、run timeout は新しい実行ごとに設定し直されます。

ワークフロータスクを開始した時点で期限を過ぎていると、実行は直ちに終了します。

- 開いているすべてのアクティビティ実行、タイマー、未完了タスクをキャンセルし、型付き履歴イベント `ActivityCancelled`、`TimerCancelled` を記録します。
- `failure_category = timeout`、`propagation_kind = timeout` の `WorkflowFailure` 行を記録します。
- `timeout_kind` が `execution_timeout` または `run_timeout` の `WorkflowTimedOut` 履歴イベントを記録します。
- 実行状態は `failed`、`closed_reason = timed_out` になります。
- タイムアウトした子を待っている親ワークフローに通知します。

バックグラウンドのタスク watchdog も、期限切れで、まだ終了しておらず、開いているワークフロータスクがない実行を探します。たとえば、期限を過ぎた時点でアクティビティやタイマーを待っている実行が該当します。見つかった場合はワークフロータスクを作り、次の処理で executor がタイムアウトを検出し、適用できるようにします。

Waterline は、例外テーブルの **Category** 列とタイムラインの失敗詳細に `failure_category` を表示します。履歴エクスポートの `failures[*]` 配列にも含まれます。正式版 v2 は失敗を記録するときに分類を書き込みます。インポートした v1 の行で分類できないものも、未分類の診断情報として表示されます。

## アクティビティの再試行 {#activity-retries}

`Workflow\V2\Activity` の既定値は `$tries = 1` です。アクティビティで再試行を有効にしない限り、失敗はすぐにワークフローへ返されます。

```php
use RuntimeException;
use Workflow\V2\Activity;

class ChargeCard extends Activity
{
    public int $tries = 3;

    public function backoff(): array
    {
        return [5, 30];
    }

    public function handle(): string
    {
        throw new RuntimeException('temporary gateway failure');
    }
}
```

再試行可能なアクティビティが `$tries` を使い切る前に例外を投げると、エンジンは現在の `activity_attempts` 行をランタイム状態として閉じ、`activity_executions` 行を `pending` に戻します。失敗した試行に対して型付き履歴イベント `ActivityRetryScheduled` を記録し、`backoff()` ポリシーから `available_at` を設定した新しい永続アクティビティタスクを作ります。ワークフローは同じアクティビティ実行を待ち続け、最後の再試行可能な試行が失敗するまで、例外を受け取って再開しません。

再試行タスクのペイロードには `retry_of_task_id`、`retry_after_attempt_id`、`retry_after_attempt`、`retry_backoff_seconds` が記録されます。Waterline はこれを使って、タスクが予定された理由を説明できます。選択した実行の詳細は、まず型付きアクティビティ履歴から失敗した試行を `activities[*].attempts` に再構築します。タイムラインに `ActivityRetryScheduled` を表示し、`operator_metrics.activities.retrying`、`operator_metrics.activities.failed_attempts`、`operator_metrics.backlog.retrying_activities` で再試行関連の件数を報告します。

`Workflow\Exceptions\NonRetryableExceptionContract` は再試行ポリシーより優先されます。再試行不可の例外を投げると、アクティビティ実行はすぐに失敗し、ワークフローはその例外を受け取って再開します。

### アクティビティ実行の識別子と冪等性 {#activity-execution-identity-and-idempotency}

同じ論理アクティビティが複数回観測される原因は、再試行だけではありません。リースの期限切れ、Worker の停止、完了報告の遅延、再配信でも、同じ永続アクティビティ実行に対して別の試行や古い完了報告が発生します。

- `activity_execution_id` は、再試行と再配信を通じて同じ論理アクティビティを識別します。リモートの副作用に対する既定の冪等性キーとして使います。
- `activity_attempt_id` は、その論理アクティビティの 1 回の試行を識別します。外部システムが個々の試行を区別する必要がある場合にだけ使います。
- 置き換えられた試行から遅れて届く完了や失敗の報告は、古い試行の通常の挙動です。エンジンが同じ試行を二重にコミットしたことの証明にはなりません。

リースの期限切れ後に届いた完了報告を調べる場合は、次を守ってください。

- どの試行の結果が永続状態に採用されたかは、Waterline、履歴エクスポート、Server API で確認します。
- 遅れた完了報告が拒否されても、外部の副作用が実行されなかったとは考えないでください。
- 手動再試行や修復を強制する前に、冪等性キーで外部システムを確認します。

安全な既定方針は、リモートの副作用を `activity_execution_id` に対して冪等にすることです。その試行の報告をエンジンが受け付けたかは、永続的な結果から判断します。

### 再試行不可の失敗マーカー {#non-retryable-failure-markers}

アクティビティまたはワークフローが `Workflow\Exceptions\NonRetryableExceptionContract` を実装する例外を投げると、エンジンは `WorkflowFailure` 行と型付き履歴イベントのペイロード（`ActivityFailed`、`WorkflowFailed`、`UpdateCompleted`）に `non_retryable = true` を記録します。この永続マーカーは、同じ操作を再試行しても成功しない恒久的な失敗であることを、運用者、外部 Worker、ツールに伝えます。

マーカーは、次の表示と API に反映されます。

- **失敗の行:** `workflow_failures.non_retryable` の boolean 列。
- **履歴イベント:** 型付きイベントのペイロード内の `non_retryable`。
- **失敗のスナップショット:** `FailureSnapshots::forRun()` に含まれる `non_retryable`。
- **実行の詳細画面:** 例外配列内の `non_retryable`。
- **タイムライン:** 失敗詳細のメタデータ内の `non_retryable`。
- **履歴エクスポート:** `failures[*]` 配列内の `non_retryable`。
- **Waterline:** 例外テーブルとタイムラインで、失敗分類の横に表示される「non-retryable」バッジ。
- **外部 Worker ブリッジ:** `complete()` コマンドのペイロードで `non_retryable` を受け付けます。ホストプロセスが例外クラスを解決できなくても、外部ワークフロー Worker は再試行不可の失敗を報告できます。

この契約を実装しない失敗では、`non_retryable` の既定値は `false` です。正式版 v2 は失敗時にマーカーを永続記録するため、運用者や SDK が恒久的な失敗を区別する必要がある場合は、失敗を書き込む前に契約を宣言してください。

```php
use Workflow\Exceptions\NonRetryableExceptionContract;

class PaymentDeclinedException extends \RuntimeException implements NonRetryableExceptionContract
{
    // This failure will be marked as non-retryable in the durable record.
}
```

## ワークフロー全体の再試行 {#workflow-level-retry}

Durable Workflow v2 は、**ワークフロー全体の自動再試行には対応しません。** 未処理の例外、構造上の制限、タイムアウトでワークフロー実行が失敗すると、その実行は終端状態になります。エンジンが同じワークフローインスタンスの新しい実行を自動で開始することはありません。

この設計には、次の理由があります。

- **アクティビティには再試行機能があります。** `$tries`、`backoff()`、再試行不可の例外で、一時的な失敗を適切な単位で処理します。
- **ワークフローの復旧はリプレイで行います。** ワークフロータスクがデータベースエラーや Worker の停止など、一時的なインフラ障害に遭遇すると、永続タスクシステムがタスクを再配信します。コミット済み履歴からリプレイで再開するため、新しい実行は不要です。
- **長期間動くワークフローには continue-as-new を使います。** 新しい状態や履歴の圧縮が必要な場合は、`continueAsNew()` で明示的に新しい実行へ移ります。
- **停止した実行には修復を使います。** `repair()` コマンドと Worker ループの自動修復は、永続タスクの配信が失われた実行を復旧します。

アプリケーションでワークフロー全体の再試行が必要なら、その動作を明示的にモデル化してください。

```php
use function Workflow\V2\activity;
use Throwable;
use Workflow\V2\Workflow;

class RetryableWorkflow extends Workflow
{
    public function handle(string $orderId): void
    {
        try {
            activity(ProcessOrderActivity::class, $orderId);
        } catch (Throwable $e) {
            // Record the failure, then start a new workflow
            // for retry-at-workflow-level scenarios.
            activity(NotifyFailureActivity::class, $orderId, $e->getMessage());
        }
    }
}
```

## 関連ガイド {#related-guides}

- [実行保証と冪等性](./constraints/execution-guarantees.md) は、このページのすべての復旧経路に関わる、リプレイ、再試行、リース期限切れ、再配信の契約を説明します。
- [監視](./monitoring.md) は、Waterline、履歴エクスポート、Worker ログ、ランタイムのテレメトリーで、ここに記載した障害情報をどこから確認できるかを説明します。
