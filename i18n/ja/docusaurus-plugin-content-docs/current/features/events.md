---
sidebar_position: 12
---

# イベント {#events}

ライフサイクルイベントは実行の重要な段階で発行され、進捗、完了、失敗をアプリに通知します。標準の Laravel イベントなので、`EventServiceProvider` または `Event::listen()` にリスナーを登録します。

`WorkflowCancelled` と `WorkflowTerminated` は、実行の保存先接続上のトランザクションがコミットされるまで待ちます。拒否されたコマンドやロールバックされた書き込みからは、どちらのイベントも発行されません。エンジンのトランザクションやライフサイクルイベントの順序に関するその他の問題は [workflow#893](https://github.com/durable-workflow/workflow/issues/893) で追跡しています。別のアプリケーション用データベース上のトランザクションは、ワークフローの保存先への書き込みをアトミックにはしません。

## イベントの識別情報 {#event-identity}

全 v2 イベントが次の永続識別フィールドを持ちます。

| フィールド | 説明 |
|---|---|
| `instanceId` | continue-as-new をまたいで安定したインスタンス ID。 |
| `runId` | 特定の実行 ID。 |
| `workflowType` | `#[Type('...')]` で登録した永続型キー。 |
| `workflowClass` | ワークフローの PHP クラス名。 |
| `committedAt` | ライフサイクル通知の準備時に記録した、実時計による ISO 8601 タイムスタンプ。 |

アクティビティイベントはさらに次を含みます。

| フィールド | 説明 |
|---|---|
| `activityExecutionId` | 永続アクティビティ実行 ID。 |
| `activityType` | アクティビティの永続型キー。 |
| `activityClass` | アクティビティの PHP クラス名。 |
| `sequence` | ワークフロー実行内のアクティビティの位置。 |
| `attemptNumber` | 1から始まる試行番号。 |

## ワークフローイベント {#workflow-events}

### WorkflowStarted {#workflowstarted}

開始を永続的にコミットしたとき、つまり最初の実行を作成し `WorkflowStarted` 履歴を記録したときに発行します。

```php
use Workflow\V2\Events\WorkflowStarted;

Event::listen(WorkflowStarted::class, function (WorkflowStarted $event) {
    Log::info('Workflow started', [
        'instance_id' => $event->instanceId,
        'run_id' => $event->runId,
        'type' => $event->workflowType,
    ]);
});
```

continue-as-new で新しい実行を開始するときも発行します。

### WorkflowCompleted {#workflowcompleted}

実行が正常完了したときに発行します。

```php
use Workflow\V2\Events\WorkflowCompleted;

Event::listen(WorkflowCompleted::class, function (WorkflowCompleted $event) {
    Log::info('Workflow completed', [
        'instance_id' => $event->instanceId,
        'run_id' => $event->runId,
    ]);
});
```

### WorkflowFailed {#workflowfailed}

実行が終端の失敗に至ったときに発行します。

実行のタイムアウトでも `WorkflowFailed` を発行します。一方、協調キャンセルのクリーンアップ期限が切れた場合は `WorkflowCancelled` を発行します。

追加フィールド:
- `exceptionClass`: PHP 例外クラス名。
- `message`: 例外メッセージ。

```php
use Workflow\V2\Events\WorkflowFailed;

Event::listen(WorkflowFailed::class, function (WorkflowFailed $event) {
    Log::error('Workflow failed', [
        'instance_id' => $event->instanceId,
        'exception' => $event->exceptionClass,
        'message' => $event->message,
    ]);
});
```

### WorkflowCancelled {#workflowcancelled}

即時キャンセルで実行を閉じたとき、または協調キャンセルでクリーンアップが完了するか期限が切れて実行を閉じたときに発行します。キャンセル要求だけではこのイベントを発行しません。

共通の識別フィールドに加えて、次を含みます。

| フィールド | 説明 |
|---|---|
| `reason` | キャンセルコマンドの元の理由、または `null`。クリーンアップ完了や期限切れのメッセージで置き換えません。 |
| `closedAt` | 永続化した実行の終了時刻を表す UTC の ISO 8601 文字列。 |

```php
use Workflow\V2\Events\WorkflowCancelled;

Event::listen(WorkflowCancelled::class, function (WorkflowCancelled $event) {
    Log::info('Workflow cancelled', [
        'instance_id' => $event->instanceId,
        'run_id' => $event->runId,
        'reason' => $event->reason,
        'closed_at' => $event->closedAt,
    ]);
});
```

### WorkflowTerminated {#workflowterminated}

強制終了で実行を閉じたときに発行します。同じ識別フィールドと `reason`、`closedAt` を持ち、理由には強制終了コマンドの値を使います。強制終了ではワークフローのクリーンアップコードを実行しません。

```php
use Workflow\V2\Events\WorkflowTerminated;

Event::listen(WorkflowTerminated::class, function (WorkflowTerminated $event) {
    Log::info('Workflow terminated', [
        'instance_id' => $event->instanceId,
        'run_id' => $event->runId,
        'reason' => $event->reason,
        'closed_at' => $event->closedAt,
    ]);
});
```

これらはプロセス内の Laravel 通知です。リスナーの失敗によって、コミット済みの終了を取り消すことはできません。イベントは閉じた実行を再開する権限を与えず、外部システムへの永続的な配信も保証しません。

## アクティビティイベント {#activity-events}

### ActivityStarted {#activitystarted}

タスクを取得して実行を開始したときに発行します。

```php
use Workflow\V2\Events\ActivityStarted;

Event::listen(ActivityStarted::class, function (ActivityStarted $event) {
    Log::info('Activity started', [
        'activity' => $event->activityType,
        'sequence' => $event->sequence,
        'attempt' => $event->attemptNumber,
    ]);
});
```

### ActivityCompleted {#activitycompleted}

アクティビティが正常完了したときに発行します。

```php
use Workflow\V2\Events\ActivityCompleted;

Event::listen(ActivityCompleted::class, function (ActivityCompleted $event) {
    Log::info('Activity completed', [
        'activity' => $event->activityType,
        'execution_id' => $event->activityExecutionId,
    ]);
});
```

### ActivityFailed {#activityfailed}

全リトライの消尽や再試行不可の例外で終端の失敗に至ったときに発行します。リトライ予定の失敗では発行**しません**。

追加フィールド:
- `exceptionClass`: PHP 例外クラス名。
- `message`: 例外メッセージ。

```php
use Workflow\V2\Events\ActivityFailed;

Event::listen(ActivityFailed::class, function (ActivityFailed $event) {
    Log::error('Activity failed', [
        'activity' => $event->activityType,
        'exception' => $event->exceptionClass,
        'message' => $event->message,
    ]);
});
```

## 失敗イベント {#failure-events}

### FailureRecorded {#failurerecorded}

ワークフローとアクティビティの終端失敗について、永続失敗記録をコミットするたびに発行します。Sentry や Bugsnag などのエラー報告統合用の単一フックです。

| フィールド | 説明 |
|---|---|
| `failureId` | 永続失敗記録 ID。 |
| `sourceKind` | `"workflow_run"` または `"activity_execution"`。 |
| `sourceId` | 発生元の ID（実行 ID またはアクティビティ実行 ID）。 |
| `exceptionClass` | PHP 例外クラス名。 |
| `message` | 例外メッセージ。 |

```php
use Workflow\V2\Events\FailureRecorded;

Event::listen(FailureRecorded::class, function (FailureRecorded $event) {
    // Report to Sentry, Bugsnag, etc.
    report(new \RuntimeException(
        "[{$event->sourceKind}] {$event->exceptionClass}: {$event->message}"
    ));
});
```

## タイムスタンプの意味 {#timestamp-semantics}

エンジンはライフサイクル通知の準備時に `committedAt` を記録します。これは実時計のタイムスタンプで、次とは異なります。

- **ワークフローの仮想時刻**: 実行内の論理時刻（タイマーで使用）。
- **試行時刻**: 特定の試行の開始・終了時刻。
- **再開レイテンシ**: タイマー期限から実際の再開までの時間。

キャンセルと強制終了では、`closedAt` は永続化した実行の終了時刻を UTC で表します。外側のストレージトランザクションは、イベントの各フィールドを記録した後にコミットされる場合があります。配信レイテンシを測る際は、リスナーの受信時刻を別途記録してください。

## ライフサイクル {#lifecycle}

一般的な成功時のライフサイクル:

```
Workflow\V2\Events\WorkflowStarted
Workflow\V2\Events\ActivityStarted
Workflow\V2\Events\ActivityCompleted
Workflow\V2\Events\WorkflowCompleted
```

アクティビティが終端失敗する場合のライフサイクル:

```
Workflow\V2\Events\WorkflowStarted
Workflow\V2\Events\ActivityStarted
Workflow\V2\Events\ActivityFailed
Workflow\V2\Events\FailureRecorded    (source: activity_execution)
Workflow\V2\Events\WorkflowFailed
Workflow\V2\Events\FailureRecorded    (source: workflow_run)
```

キャンセルされた実行は次のイベントで終わります。

```
Workflow\V2\Events\WorkflowStarted
Workflow\V2\Events\WorkflowCancelled
```

協調クリーンアップでは、この二つの通知の間にアクティビティイベントを発行する場合があります。

強制終了された実行は次のイベントで終わります。

```
Workflow\V2\Events\WorkflowStarted
Workflow\V2\Events\WorkflowTerminated
```

## イベントの名前空間 {#event-namespace}

v2 イベントは `Workflow\V2\Events` 名前空間にあります。既存アプリのアップグレードでは、v1 互換イベントの対応を[移行](../migration.md)で確認してください。
