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

`Workflow\V2\Activity` の既定値は `$tries = 1` です。実行は 1 回だけで、例外後の自動再試行はありません。最初のアクティビティ失敗がワークフローへ返されます。以下のようにワークフローのコードで例外を捕捉できます。処理しなければ、その実行は失敗し、終端状態になります。

再試行は明示的な設定が必要です。複数回の試行を許可するには `$tries` を `1` より大きくし、試行回数を無制限にするには `0` に設定して、`backoff()` ポリシーを選びます。再試行可能な失敗は、設定された試行回数または時間の予算を使い切った時点でワークフローのコードへ渡されます。再試行不可の失敗は、残りの試行を行わずに渡されます。

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

まず、選択した実行の永続的な状態と、アクティビティの再試行ポリシーを確認します。既定の 1 回の試行では、捕捉されないアクティビティ失敗によって、その実行はすでに終端状態になっています。修正のデプロイや `repair()` の呼び出しで、その失敗した実行が再開されることはありません。

元の実行が待機している間にコードを修正できるのは、アクティビティに有効な再試行が残っている場合だけです。アクティビティをスケジュールする前に、`$tries` を `1` より大きくするか、回数無制限なら `0` にし、`backoff()` を設定します。必要に応じて `ActivityOptions::$scheduleToCloseTimeout` で全試行を含むアクティビティの合計時間を制限できます。ワークフローの期限も引き続き適用されます。[再試行](./configuration/options.md#retries)、[再試行間隔](./configuration/options.md#backoff)、[ActivityOptions](./configuration/options.md#activityoptions) を参照してください。ポリシーはスケジュール時に保存されるため、後のデプロイで既存アクティビティの試行回数や時間の予算を延長することはできません。

再試行可能なアクティビティをまだ待っている実行では、次の手順を使います。

1. 失敗したアクティビティのログを確認し、エラーや例外を調べます。
2. 原因を特定し、コードを修正します。
3. キューの Worker が動作する環境に修正をデプロイします。
4. 対象の Worker を再起動または順次入れ替え、新しいコードを読み込ませ、仕事を安全に取得できるようにします。
5. 正常な Worker に次の有効な試行を実行させます。修復や再配信は失われたタスク輸送を復旧できますが、アクティビティや実行が閉じた後に業務処理の追加試行を与えるものではありません。
6. Worker のログ 1 行を確定結果と見なさず、Waterline、履歴エクスポート、Server API で永続的な結果を確認します。
7. アクティビティがまだ失敗する場合は、手順を繰り返す前に、残りの試行回数と時間の予算を確認します。

有効なアクティビティ再試行が残る実行は待機状態を保ち、元の予算が期限切れになる前に修正後のコードが成功すれば続行できます。ただし、すべての失敗を同じ実行内で修正できる保証はありません。最後のアクティビティ失敗が捕捉されない場合、ワークフローのコードが失敗した場合、構造上の制限やワークフローのタイムアウトに達した場合には、終端状態になります。

失敗して終端状態になった実行では、履歴を保持し、外部の副作用を照合してから、アプリケーションが新しいワークフローを開始すべきか判断します。業務処理の繰り返しにはアプリケーション側の冪等性を使ってください。捕捉されないアクティビティ失敗、ワークフローコードの失敗、または構造上の上限で実行が終了した場合は、修正をデプロイした後に [redrive](#redrive) できるか確認してください。redrive は、完了したステップを再利用する新しい実行で処理を続けます。ワークフローコードの失敗には、修正したコードと Workflow 2.19.0 以降が必要です。[修正したワークフローコードで redrive する](#redrive-corrected-definition) を参照してください。ワークフロー全体の自動再試行や終端実行の再開はありません。[ワークフローレベルの再試行](#workflow-level-retry) を参照してください。

## 失敗した実行を redrive する {#redrive}

redrive は、失敗した実行を同じワークフローインスタンスの新しい実行で続けます。新しい実行は、失敗より前に完了したステップの記録済み結果を再利用し、ワークフローの残りの部分を再び実行します。失敗の原因を修正した後に使うと、支払いやメール送信のような完了済みの処理が繰り返されません。

失敗した実行は閉じたまま変更されません。新しい実行は後継実行と呼ばれ、次の実行番号を受け取り、インスタンスの現在の実行になります。後継実行の `continued_from_run_id` は失敗した実行を指します。後継実行の `WorkflowStarted` イベントには `recovery_kind: redrive` と、実行を再開するステップを示す `resume_step_sequence` が記録されます。

この節では、Workflow 2.20.1 以降の redrive について説明します。それより前の Workflow リリースとネイティブ Server の redrive は、受け付ける実行がより少なくなります。[以前のリリースとネイティブ Server](#redrive-earlier-releases) を参照してください。

後継実行はワークフローコードを最初からリプレイします。

- 失敗した実行で完了したアクティビティ呼び出しは、それぞれ記録済みの結果を返します。そのアクティビティは再実行されません。
- 失敗したステップより前の副作用やバージョンマーカーは、ステップ順に再利用されます。副作用は再実行されず、バージョン確認は記録済みのバージョンを返します。
- 失敗したステップより前に発火した `timer()` は、後継実行に発火済みとして記録されます。後継実行がそのタイマーを再び待つことはありません。
- 失敗したステップより前にワークフローコードが upsert したメモや検索属性は、ステップ順に再利用され、後継実行は同じ値を保持します。
- シグナルを受信して適用したシグナル待機（`await('name')`）は、そのシグナルの値とともに再利用されます。シグナルが再び配信されることはありません。
- 失敗したステップより前に受け付けられ、適用され、完了した更新は、同じ位置に改めて記録されます。リプレイは記録された引数で更新ハンドラーを実行するので、ワークフローの状態は一致します。更新が再び配信されることはありません。拒否された更新と、実行前に失敗で閉じられた更新は除外されます。
- 再利用されるワークフローコード内の `outbox()->sendReference()` と `inbox()->receive()` は、失敗した実行が送信または消費したメッセージを返します。再び送信や消費をすることはありません。元の呼び出しで何も見つからなかった receive は、リプレイ時にストリームを読み直します。
- Workflow 2.20.2 以降では、失敗した実行でまだ保留中の受信ストリームメッセージは後継実行に移ります。Workflow 2.20.1 以前はそれらを失敗した実行に残していたため、後継実行はそれらを受信しませんでした（[workflow#1013](https://github.com/durable-workflow/workflow/issues/1013)）。
- アクティビティ失敗で実行が終了した場合、失敗したアクティビティ呼び出しは、ワークフローコードの再試行ポリシーを使って新しいアクティビティ実行としてスケジュールされます。試行回数は最初からやり直しです。
- ワークフローコード内または構造上の上限で実行が失敗した場合、後継実行は、ワークフローコードが到達しなかったステップから再開します。
- 失敗したステップ以降は、新しい実行と同じように実行されます。
- 実行開始時に設定されたメモと検索属性は、continue-as-new と同じように後継実行へ引き継がれます。
- 後継実行は、失敗した実行のワークフロー全体の実行期限を引き継ぎます。実行ごとのタイムアウトは redrive の時点から改めて始まります。
- 再利用された各ステップには、`reused_from_run_id` と `reused_recorded_at` が付きます。 再利用された更新イベントやシグナルイベントでは、この 2 つは必ず対になります。
- ステップを再利用した後継実行は、さらに redrive できます。再利用されたシグナルや更新のペイロードは、最初に記録した実行を `workflow_run_id` に保持し、`reused_from_run_id` は redrive 元の実行を指し、再利用された各ステップは最初に実行された時刻を保持します。そのため、redrive の連鎖でも各ステップは一度だけ再利用されます。
- 組み込みモードでは、後継実行の `Workflow::now()` は失敗した実行の開始時刻から始まります。リプレイは `reused_recorded_at` を使うので、再利用されたステップの後の `Workflow::now()` は失敗した実行での時刻と一致します。2 回目の redrive で再利用されたステップは、最初に実行された時刻を保持します。

### redrive を要求する {#request-a-redrive}

組み込みモードでは、Laravel コンテナから `Workflow\V2\Contracts\WorkflowControlPlane` コントラクトを解決し、ワークフローインスタンス ID と失敗した実行の ID を渡して `redrive()` を呼び出します。

```php
use Workflow\V2\Contracts\WorkflowControlPlane;

$result = app(WorkflowControlPlane::class)->redrive($instanceId, $failedRunId, [
    'request_id' => 'incident-42',
]);

if ($result['accepted']) {
    $successorRunId = $result['workflow_run_id'];
} else {
    $reason = $result['reason'];
}
```

サービスモードでは、`POST /api/workflows/{workflowId}/runs/{runId}/redrive` を送信します。本文には任意で `request_id` を指定できます。各クライアントは同じルートをラップしています。

| 利用面 | 呼び出し |
| --- | --- |
| CLI | `dw workflow:redrive <workflow-id> <run-id> --request-id <id>` |
| PHP SDK | `Client::redriveWorkflow($workflowId, $failedRunId, $requestId)` |
| Python SDK | `await client.redrive_workflow(workflow_id, failed_run_id, request_id=...)` または `await handle.redrive()` |
| Rust SDK | `client.redrive_workflow_run(workflow_id, failed_run_id, request_id)` または `handle.redrive(request_id)` |

受け付けられた redrive は、後継実行の実行 ID と `resume_step_sequence` を返します。拒否された redrive は `reason` を返し、何も変更しません。すでに redrive 済みの実行を redrive すると、新しい実行を作らずに既存の後継実行を返します。要求を安全に再送できるよう、`request_id` を渡してください。同じインスタンスの別の redrive で使用済みの `request_id` は、`request_id_already_used` で拒否されます。

サービスワーカーはワークフロー定義のフィンガープリントを報告します。redrive はそれを、実行開始時に記録されたフィンガープリントと比較します。Rust SDK では、redrive したいワークフローごとに `Worker::set_workflow_definition_sources()` を呼び出してください。ソース識別情報なしで登録したワークフローも実行はできますが、redrive は拒否されます。

### 修正したワークフローコードで redrive する {#redrive-corrected-definition}

ワークフローコードが例外を投げて実行が失敗した場合、同じコードは同じステップで再び例外を投げるため、redrive は `workflow_code_failure_requires_corrected_definition` でその実行を拒否します。修正をデプロイしてから、`allow_definition_change` を指定して redrive を要求してください。

```php
$result = app(WorkflowControlPlane::class)->redrive($instanceId, $failedRunId, [
    'request_id' => 'incident-42',
    'allow_definition_change' => true,
]);
```

redrive は何かを書き込む前に、完了したステップを新しいコードでメモリ上でリプレイします。新しいコードは同じステップを同じ順序でたどり、古いコードが失敗したステップに到達しなければなりません。到達できない場合、redrive は `definition_incompatible_with_prefix` で拒否し、`definition_mismatch` が最初に異なるステップ（`sequence`）と、`step_shape` や `version_range` などの `kind` を示します。完了した履歴が履歴の予算より大きい場合、redrive は `definition_check_over_budget` で拒否します。

定義の変更が受け付けられると、修正したコードが実行され、置き換えられた定義のフィンガープリントが後継実行の `WorkflowStarted` に `definition_changed_from` として記録されます。同じ定義に対する以降の redrive では何も記録されません。

`allow_definition_change` は組み込みモードの実行に適用されます。サービスワーカーが開始した実行の定義変更は、`definition_change_requires_replay_check` で拒否されます。`allow_definition_change` を指定しない場合、変更された定義は `workflow_definition_unavailable_or_changed` で拒否されます。

### 失敗した実行を redrive できる条件 {#redrive-eligibility}

redrive は、次の条件がすべて満たされるときに失敗した実行を受け付けます。

- その実行がインスタンスの現在の実行である。
- アクティビティ失敗がワークフローコードに届いて捕捉されなかったか、ワークフローコードが例外を投げたか、構造上の上限で停止したために、実行が失敗した。ワークフローのタイムアウトで失敗した実行は拒否されます。
- 失敗したステップより前のステップがすべて、完了したアクティビティ、副作用、バージョンマーカー、発火済みの `timer()`、メモまたは検索属性の upsert、シグナルを受信して適用したシグナル待機、同じ引数で受け付けられ、適用され、完了した更新のいずれかである。拒否された更新と、実行前に失敗で閉じられた更新は許可され、除外されます。アクティビティ、副作用、シグナル、更新のペイロードはインラインで保存されている必要があります。外部ペイロードストレージに保存されたペイロードは拒否されます。
- ワークフロー定義が、実行開始時に記録されたフィンガープリントと一致する。または、`allow_definition_change` を指定し、修正したコードが完了したステップをリプレイできる。同じ定義でのワークフローコードの失敗は拒否されます。
- 実行期限を過ぎていない。
- 実行に親ワークフロー、子ワークフロー、ローカルアクティビティがなく、入力がインラインで保存されている。
- サービスワーカーが実行を開始した場合、失敗より前のステップがアクティビティ、副作用、バージョンマーカー、発火済みタイマーだけである。メモと検索属性の upsert、シグナル待機、適用済みの更新は、サービスモードの実行では拒否されます。

拒否では、最初に満たされなかった規則が示されます。

| 理由 | 意味 |
| --- | --- |
| `run_not_failed` | 実行が `failed` 状態ではありません。 |
| `source_run_not_current` | インスタンスにより新しい実行があります。 |
| `unrecorded_failure_boundary` | 実行の失敗に記録されたステップがありません。2.19.0 より前のリリースが記録したワークフローコードの失敗などが該当します。 |
| `workflow_code_failure_requires_corrected_definition` | ワークフローコードが例外を投げ、定義が変更されていないため、同じコードが再び例外を投げます。 |
| `unsupported_history` | 失敗前の履歴に、子ワークフローやキャンセルされたタイマーなど、redrive が再利用できないステップが含まれています。 |
| `unsupported_local_activity` | 履歴にローカルアクティビティが含まれています。 |
| `unsupported_timer` | 履歴に、条件やシグナルのタイムアウト、キャンセル後のクリーンアップ用タイマー、またはキャンセルスコープや並列グループ内のタイマーが含まれています。 |
| `incomplete_timer_step` | タイマーのステップに、スケジュールのイベントと発火のイベントの両方がそろっていません。 |
| `unsupported_signal_wait` | シグナル待機にタイムアウトがあるか、シグナル待機がキャンセルスコープや並列グループ内にあります。 |
| `unsupported_pending_signal` | 実行が受信したシグナルを一度も適用していません。 |
| `incomplete_signal_step` | シグナル待機に受信と適用の両方がそろっていないか、適用に記録済みの値がありません。 |
| `mismatched_signal_receipt` | シグナルの受信記録が別の実行、インスタンス、コマンド、待機のいずれかを指している、1 つの受信記録が 2 つの待機に適用されている、または再利用されたシグナルイベントに `reused_from_run_id` と `reused_recorded_at` の片方しかないか、別の元を指しています。 |
| `unsupported_pending_update` | 実行が受け付けた更新を、適用も終了もしていません。 |
| `mismatched_update_history` | 更新のイベントが受け付け可能な形のいずれでもない、別の実行・更新・コマンド・ハンドラーを指している、受け付けから適用までの間に引数が変わっている、または `reused_from_run_id` と `reused_recorded_at` の対がそろっていません。 |
| `incomplete_update_step` | 適用された更新の完了に失敗が記録されているか、結果がありません。 |
| `invalid_step_sequence` | 再利用されるステップに有効なステップ番号がありません。 |
| `duplicate_step_sequence` | 再利用される 2 つのステップが同じステップ番号を持っています。 |
| `external_activity_result_not_supported` | 完了したアクティビティの結果が外部ペイロードストレージにあります。 |
| `external_side_effect_result_not_supported` | 副作用の結果が外部ペイロードストレージにあります。 |
| `external_signal_payload_not_supported` | シグナルの引数または適用された値が外部ペイロードストレージにあります。`external_storage` キーは null でも外部として扱われます。 |
| `external_update_payload_not_supported` | 更新の引数または結果が外部ペイロードストレージにあります。 |
| `unavailable_update_payload` | インラインで保存された更新の引数または結果をデコードできません。 |
| `missing_activity_result`, `unavailable_activity_result` | 完了したアクティビティの結果がないか、デコードできません。 |
| `unsupported_visibility_metadata` | 後継実行が再利用しないステップで、ワークフローコードがメモまたは検索属性を書き込みました。 |
| `unsupported_source_metadata` | 実行が別のワークフローの子として開始されました。 |
| `unsupported_source_link_or_payload` | 実行が別のワークフローの子としてリンクされているか、入力が外部ペイロードストレージにあります。 |
| `execution_deadline_elapsed` | 実行期限を過ぎています。 |
| `workflow_definition_unavailable_or_changed` | 定義のフィンガープリントがないか、開始時に記録されたものと異なり、`allow_definition_change` が指定されていません。 |
| `definition_incompatible_with_prefix` | 修正したコードが完了したステップをリプレイできません。`definition_mismatch` が最初に異なるステップを示します。 |
| `definition_check_over_budget` | 完了した履歴が、リプレイ確認で許される履歴の予算を超えています。 |
| `definition_change_requires_replay_check` | サービスワーカーが実行を開始したため、redrive は変更された定義を確認できません。 |
| `service_redrive_history_not_qualified` | サービスワーカーが実行を開始し、失敗より前のステップにメモの upsert、検索属性の upsert、シグナル待機、適用済みの更新のいずれかが含まれています。redrive は、SDK ランタイムごとにこれらのステップをリプレイできるかを確認できるようになるまで、サービスモードの実行でこれらのステップを拒否します。 |
| `request_id_already_used` | その `request_id` は、インスタンスの別の redrive ですでに使われています。 |
| `already_redriven` | すでに redrive された実行について、実行詳細と `describe()` が報告します。その実行への redrive リクエストは、代わりに既存の後継実行を返します。 |
| `invalid_request_id` | `request_id` が 191 文字を超えています。 |
| `run_not_found`, `instance_not_found` | 実行またはインスタンスがその名前空間に存在しません。 |

残りの理由は、履歴が想定した形になっていないことを示します。`invalid_history`、`events_after_failure`、`duplicate_start`、`missing_start`、`unexpected_start`、`missing_terminal_history`、`invalid_activity_sequence`、`activity_sequence_gap`、`missing_activity_type`、`activity_type_mismatch`、`duplicate_activity_completion`、`incomplete_activity_prefix`、`invalid_failed_step` です。復旧方法を決める前に、実行の履歴をエクスポートして確認してください。

redrive が実行を拒否した場合は、その履歴を保持し、外部の副作用を照合してから、アプリケーションが新しいワークフローを開始すべきか判断します。

### 実行を redrive できるか確認する {#redrive-check}

Workflow 2.18.0 以降では、実行詳細が `can_redrive` と `redrive_blocked_reason` を報告します。Waterline の選択実行詳細は、これらのフィールドを読みます。`WorkflowControlPlane::describe()` は同じフィールドを `actions` の下に報告します。これらは `redrive()` が適用するのと同じ判定から得られるので、要求する前に実行を redrive できるか、できない場合はその理由を確認できます。

失敗していない実行は `run_not_failed` を報告します。すでに redrive 済みの実行は `already_redriven` を報告します。サービスモードの実行では、報告はフィンガープリントが記録されていることだけを確認します。`redrive()` は引き続き、それをワーカーのフィンガープリントと比較します。この報告は修正したコードのリプレイ確認を実行しないため、`allow_definition_change` を指定して redrive を要求するまで、変更された定義は `workflow_definition_unavailable_or_changed` と表示されます。

Workflow 2.19.0 以降では、修正したコードを実行する後継実行は、置き換えられたフィンガープリントを、実行詳細では `workflow_definition_changed_from` として、`describe()` では `run.definition_changed_from` として報告します。

Workflow 2.20.0 以降では、実行詳細と `describe()` が redrive のリンクを型付きの系譜として報告します。後継実行の `parents` と失敗した実行の `continuedWorkflows` は、それを `link_type: redrive` と `history_authority: typed_history` で示し、ステップと時刻を後継実行の `WorkflowStarted` から取ります。履歴で確認できないリンクは、`history_authority: mutable_open_fallback` と `diagnostic_only: true` で 1 回だけ示されます。

### 以前のリリースとネイティブ Server {#redrive-earlier-releases}

Workflow 2.20.0 は、2.20.1 が受け付けるものを何も拒否しません。2.20.0 では、再利用されるワークフローコード内の `outbox()->sendReference()` が再び送信し、リプレイされた `inbox()->receive()` は別のメッセージを返すか、何も返さないか、より新しいメッセージを消費することがあります（[workflow#1010](https://github.com/durable-workflow/workflow/issues/1010)）。

Workflow 2.19.0 は、適用済みの更新を拒否します（`unsupported_history`）。また、更新（`unsupported_history`）またはシグナル待機（`mismatched_signal_receipt`）を再利用した後継実行の redrive も拒否します。実行詳細と `describe()` は、redrive のリンクを診断用のフォールバックとして示します。

Workflow 2.18.0 は、完了したアクティビティ、副作用、バージョンマーカー、発火済みタイマーを再利用します。ワークフローコードが upsert したメモや検索属性（`unsupported_history`）、シグナル待機（`unsupported_history`）、ワークフローコード内で失敗した実行（`unrecorded_failure_boundary`）、変更された定義（`workflow_definition_unavailable_or_changed`）は拒否します。

2.18.0 より前の Workflow リリースが受け付ける実行は、より限られています。失敗したアクティビティより前のステップは、すべて完了したアクティビティでなければなりません。その履歴にある副作用、バージョンマーカー、タイマーは `unsupported_history` で拒否され、メモや検索属性があれば `unsupported_visibility_metadata` で拒否されます。実行詳細と `describe()` は `can_redrive` も `redrive_blocked_reason` も報告しません。

2.19.0 より前のリリースは、再利用されたシグナル、メモ、検索属性のステップの `reused_recorded_at` を無視します。Workflow 2.19.0 以降の後継実行がこれらのステップを再利用した後は、2.19.0 以降のワーカーを使い続けるか、ロールバックの前にそのような履歴がリプレイされないことを確認してください。組み込みモードでは、Workflow 2.19.0 は、更新または連鎖したシグナル待機を再利用した 2.20.0 の後継実行を、2.20.0 と同じようにリプレイ、インポート、再開します（[検証記録](https://github.com/durable-workflow/workflow/issues/864#issuecomment-6617902412)）。

ネイティブ Server の redrive には、現在も 2.18.0 より前の規則が適用されます。ネイティブ Server での現在の規則への対応は [server#980](https://github.com/durable-workflow/server/issues/980) で追跡しています。

## サービスモードのエントリ拒否と復旧 {#service-entry-recovery}

**公開済みのサポートです。** Server 2.9.9 と PHP SDK 2.5.4、Python SDK 2.6.2、Rust SDK 3.5.6 で、以下のエントリ保護とルーティング・復旧動作が導入されました。これらは機能の最小対応バージョンです。セキュリティ修正を含む最新の安定版をインストールしてください。

エントリ不整合は、アプリケーションのワークフローコードが動く前のデプロイまたはリプレイの拒否です。アクティビティの再試行でも、終端となる業務上の失敗でもありません。Worker は `failure_reason = workflow_entry_arguments_mismatch` を報告し、Server は次の試行を自動作成せず、失敗したワークフロータスクを `replay_blocked = true` の状態で保持します。汎用の `replay_blocked_reason` は `worker_reported_replay_failure` です。実行は非終端のままで、記録済み入力、履歴、期限も維持されます。これは、ワークフロー本体への進入に成功した後に例外が投げられ、実行そのものが失敗する場合とは異なります。

実際の永続状態を確認してから復旧してください。

1. `GET /api/workflows/{workflowId}/runs/{runId}/debug` で対象の実行を調べます。`latest_workflow_task_failure.reason` が `workflow_entry_arguments_mismatch` で、元の実行がまだ開いていることを確認します。この手順で終端済みの実行を再開することはできません。
2. 記録済みの位置引数または型付き入力を受け入れるコードをデプロイします。元のワークフロー ID と実行 ID、名前空間、キュー、ビルド互換性、履歴、期限を維持してください。保存済み入力を編集したり、DTO の既定値で置き換えたりしてはいけません。
3. [定義ルーティング](./polyglot/worker-compatibility-routing.md#definition-fingerprint-evolution)で適格な Worker が利用可能であることを確認します。修復は Worker を作成せず、リプレイ互換性を証明するものでもありません。
4. 通常の認可済み運用者資格情報と名前空間を指定して、`POST /api/workflows/{workflowId}/runs/{runId}/repair` を使います。実行を指定するルートは、古い実行が対象なら拒否し、新しい実行を黙って修復することはありません。PHP には `Client::repairWorkflow($workflowId, $runId)` もあります。Python の `repair_workflow(workflow_id)` は現在のインスタンスを対象とし、Rust には同等の修復用便利メソッドがありません。
5. 同じ元の実行が記録済み入力と履歴プレフィックスで再開し、期待する結果を一度だけ記録することを確認します。元の期限がすでに過ぎていても、その期限は適用されます。置き換え後も互換性がなければ、修復を繰り返さず、新しい拒否理由を調べてください。

古い Server は SDK の具体的な理由を保存しても、リプレイのブロックとして分類しない場合があります。そのため、失敗の報告だけで自動再試行しない契約が成立するわけではありません。検証済みのランタイムと SDK の組み合わせを使ってください。言語ごとの境界は[バージョニング](./features/versioning.md#service-sdk-entry-safeguard)、認証付きの実行指定ルートは[ワークフローコマンド](./polyglot/server-api-reference.md#workflow-commands)を参照してください。

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

複数 workflow とキューで試行予算を共有するには、作成時の再試行上限を [Server admission とアプリのブレーカー](./polyglot/task-queue-admission.md#retry-load-and-downstream-budgets)に組み合わせます。初回と再試行の両方を数え、ローカル/組み込み実行の境界は異なります。

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

ワークフローのコードで、キュー待機と再試行間の待機を含むアクティビティの合計時間を制限します。

```php
use Workflow\V2\Support\ActivityOptions;
use function Workflow\V2\activity;

$result = activity(ChargeCard::class, new ActivityOptions(
    scheduleToCloseTimeout: 120,
));
```

これらの設定では、元の 120 秒の schedule-to-close 期限内で、5 秒と 30 秒の待機を挟んで最大 3 回まで試行できます。ワークフローの期限がそれより早い場合は、その期限も適用されます。安全に繰り返せる操作だけで再試行を有効にし、外部の副作用を冪等性チェックで保護してください。

再試行可能なアクティビティが `$tries` を使い切る前に例外を投げると、エンジンは現在の `activity_attempts` 行をランタイム状態として閉じ、`activity_executions` 行を `pending` に戻します。失敗した試行に対して型付き履歴イベント `ActivityRetryScheduled` を記録し、`backoff()` ポリシーから `available_at` を設定した新しい永続アクティビティタスクを作ります。ワークフローは同じアクティビティ実行を待ち続け、最後の再試行可能な試行が失敗するまで、例外を受け取って再開しません。

再試行タスクのペイロードには `retry_of_task_id`、`retry_after_attempt_id`、`retry_after_attempt`、`retry_backoff_seconds` が記録されます。Waterline はこれを使って、タスクが予定された理由を説明できます。選択した実行の詳細は、まず型付きアクティビティ履歴から失敗した試行を `activities[*].attempts` に再構築します。タイムラインに `ActivityRetryScheduled` を表示し、`operator_metrics.activities.retrying`、`operator_metrics.activities.failed_attempts`、`operator_metrics.backlog.retrying_activities` で再試行関連の件数を報告します。

`Workflow\Exceptions\NonRetryableExceptionContract` は再試行ポリシーより優先されます。再試行不可の例外を投げると、アクティビティ実行はすぐに失敗し、ワークフローはその例外を受け取って再開します。

### リトライ遅延の分解能 {#retry-delay-resolution}

アクティビティの `backoff()` の値は整数秒です。永続リトライ間隔の分解能は 1 秒です。
100 ms 後のリトライを要求するために `0.1` のような小数値を使わないでください。
小数値から間隔を生成する SDK API は、次の整数秒に切り上げます。受け付けるパラメーター型と
変換については、Python SDK と Rust SDK のリファレンスを参照してください。

遅延が経過すると次の試行を開始できるようになりますが、キューの遅延や Worker の負荷により
さらに遅れる場合があります。高速なテストには、
[制御した時刻または回数を制限したゼロ遅延のケース](./testing.md#keeping-delay-tests-fast)を使ってください。

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
- **redrive はオペレーターが明示的に行う操作です。** [redrive](#redrive) は、要求したときだけ失敗した実行を新しい実行で続け、完了したアクティビティの結果を再利用します。

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

## サービスモードの PHP 障害レポートの上限 {#php-failure-report-limits}

PHP SDK **3.5.0 以降**では、サービスモードで送信する障害レポートの上限は、UTF-8 メッセージが 62 KiB、スタックが 128 KiB、任意のメタデータの合計が 64 KiB、マーカーを含むエンコード済み本文全体が 1 MiB です。既知の転送上限がより小さい場合は、その値が適用されます。[PHP のレポートガイド](./polyglot/php.md#bounded-failure-reports)では、設定、省略の診断情報、維持されるリトライの意味、ローカルの初回実行とコールドリプレイの一致を説明しています。これは SDK のレポート上限です。組み込み実行での記録と Core の要約保存には、それぞれ別の契約があります。

## サービスモードの Python 障害レポートの上限 {#python-failure-report-limits}

Python SDK **2.11.0 以降**では、サービスモードで送信する障害レポートの上限は、UTF-8 メッセージが 62 KiB、スタックが 128 KiB、任意のメタデータの合計が 64 KiB、マーカーを含むエンコード済み本文全体が 1 MiB です。既知の転送上限がより小さい場合は、その値が適用されます。[Python のレポートガイド](./polyglot/python.md#bounded-failure-reports)では、設定、省略の診断情報、維持されるリトライの意味、ローカルの初回実行とコールドリプレイの一致を説明しています。これは SDK のレポート上限です。組み込み実行での記録と Core の要約保存には、それぞれ別の契約があります。

## サービスモード Rust の失敗レポート上限 {#rust-failure-report-limits}

実際に Rust SDK **4.10.1 以降**を動かすサービス worker では、送信 UTF-8 message はマーカー込み62 KiB、対応する stack は128 KiB、任意 metadata の合計シリアライズ結果は64 KiB、完全なエンコード済み body は1 MiBまたはそれより低い既知の輸送上限です。type、retry 判断、claim 識別情報を保ち、必須 envelope が入らなければ明示的に拒否します。[Rust ガイド](./polyglot/rust.md#bounded-failure-reports)に省略マーカー、完全な Avro details、ローカル結果の境界を説明しています。旧 SDK、embedded mode、別の Core summary 保存修正を検証したものではありません。

## 関連ガイド {#related-guides}

- [実行保証と冪等性](./constraints/execution-guarantees.md) は、このページのすべての復旧経路に関わる、リプレイ、再試行、リース期限切れ、再配信の契約を説明します。
- [監視](./monitoring.md) は、Waterline、履歴エクスポート、Worker ログ、ランタイムのテレメトリーで、ここに記載した障害情報をどこから確認できるかを説明します。
