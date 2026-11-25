---
sidebar_position: 3
---

# Updates

Updates allow you to retrieve information about the current state of a workflow and mutate the workflow state at the same time. They are essentially both a query and a signal combined into one.

## Explicit Update Commands

Each accepted update:

- Is a request/response call against a running workflow. `attemptUpdate*()` waits for the handler to finish; `submitUpdate*()` returns as soon as the command is durably accepted and exposes `inspectUpdate($updateId)` to poll later.
- Uses the declared durable update name in command history and webhook routing — `#[UpdateMethod('mark-approved')]` keeps the public callable name stable across PHP method renames.
- Rejects against historical or already-closed runs rather than silently mutating the current run.
- Rejects undeclared method names as `rejected_unknown_update` and contract-invalid arguments as `rejected_invalid_arguments` (with machine-readable `validation_errors`) before the handler runs.
- Rejects a request that your [update validator](#validate-updates-before-acceptance) refuses as `update_validator_rejected` before it is accepted.

Like queries, updates replay committed history first. Unlike queries, updates are allowed to mutate replay-safe workflow state and return a value.

To define an update method on a workflow, use the `UpdateMethod` annotation. The optional string argument lets you freeze a public durable name that survives PHP method renames:

```php
use Workflow\UpdateMethod;
use Workflow\V2\Workflow;

final class MyWorkflow extends Workflow
{
    private bool $ready = false;

    #[UpdateMethod('mark-ready')]
    public function updateReady(bool $ready): bool
    {
        $this->ready = $ready;

        return $this->ready;
    }
}
```

Call the update method directly when you want the raw return value:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$ready = $workflow->updateReady(true);
```

That direct PHP call still uses the method name. The durable command target remains `mark-ready`.

Use `attemptUpdate()` when you want the durable command outcome as well. Pass the durable update name there:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$result = $workflow->attemptUpdate('mark-ready', true);

$result->accepted();        // true
$result->completed();       // true when the update body ran successfully
$result->updateStatus();    // "accepted", "completed", "failed", or "rejected"
$result->updateId();        // Durable update lifecycle id
$result->result();          // Raw update return value when completed
$result->failureMessage();  // Failure message when the update body threw
```

`attemptUpdate()` records the accepted update first, then waits for the workflow worker to apply it and close the update lifecycle before returning. The wait is time-bounded by `workflows.v2.update_wait.completion_timeout_seconds`; if the worker has not closed the update when the budget expires, `attemptUpdate()` returns the accepted lifecycle with `waitTimedOut() === true` and `updateStatus() === 'accepted'`.

Use `withUpdateWaitTimeout()` when one call needs a different completion budget:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123')
    ->withUpdateWaitTimeout(5);

$result = $workflow->attemptUpdate('mark-ready', true);
```

Use `attemptUpdateWithArguments()` when the caller already has a positional list or named parameter map:

```php
$result = $workflow->attemptUpdateWithArguments('mark-ready', [
    'ready' => true,
]);
```

Named maps are validated against the durably snapped update contract and normalized into declaration order before acceptance.

Use `submitUpdate()` or `submitUpdateWithArguments()` when the caller only needs durable acceptance and is fine with the workflow worker applying the update later:

```php
$accepted = $workflow->submitUpdate('mark-ready', true);

$accepted->accepted();     // true
$accepted->completed();    // false
$accepted->updateStatus(); // "accepted"
$accepted->result();       // null until the worker records UpdateCompleted
```

Use `inspectUpdate()` when you already have an `update_id` and want to read the stored lifecycle later without waiting again:

```php
$latest = $workflow->inspectUpdate($accepted->updateId());

$latest->updateStatus(); // "accepted"
$latest->closedAt();     // null until the lifecycle closes
```

`inspectUpdate()` does not wait for workflow execution. It reloads the stored durable lifecycle and returns the current `UpdateResult`.

## Validate updates before acceptance {#validate-updates-before-acceptance}

Without a validator, an update that breaks a business rule is accepted and then fails. It is recorded as a failed update, and the caller can't tell a bad request from a failed operation. Declare a validator to refuse the request before it is accepted. Validators require Workflow 2.42.0 or later.

```php
use RuntimeException;
use Workflow\UpdateMethod;
use Workflow\UpdateValidator;
use Workflow\V2\Workflow;

final class CartWorkflow extends Workflow
{
    private array $items = [];

    #[UpdateMethod('add-item')]
    public function addItem(string $item): array
    {
        $this->items[] = $item;

        return $this->items;
    }

    #[UpdateValidator('add-item')]
    public function validateAddItem(string $item): void
    {
        if (count($this->items) >= 10) {
            throw new RuntimeException('The cart is full.');
        }
    }
}
```

`#[UpdateValidator]` names the update by its durable name, or by its method name when the update has no alias. The validator takes the same arguments as the update. Before the update is accepted, the engine rebuilds the run's state from its history and calls only the validator:

- Returning normally lets the update be accepted and applied as usual.
- Throwing, or returning `false`, rejects the update with the reason `update_validator_rejected` and the outcome `rejected_invalid_arguments`. `rejectedByValidator()` is true, `rejectionMessage()` returns the exception message, and `validationErrors()` returns the errors of a Laravel `ValidationException`. `update()` throws a `LogicException` that includes both.
- A rejected update is never accepted, its handler never runs and the workflow isn't woken. Like every other rejection, it is recorded only as an `UpdateRejected` audit event, which replay ignores.

Validators are read-only. They can read the replayed workflow state, but any durable call (an activity, timer, child workflow, signal, side effect, `await`, continue-as-new, or memo or search-attribute upsert) throws `UpdateValidatorCommandException` and rejects the update. Changes a validator makes to the replayed state are discarded. A generator validator is rejected, because its body never runs.

Validators aren't recorded in history and never run during replay, so they don't affect determinism. They see the state from committed history: an update that was accepted but not yet applied isn't visible to them. The replay and the validator run while the update's admission holds the run's locks, so keep validators fast.

If the state can't be replayed, or the validator hits a database error, `UpdateValidationFailedException` is thrown and nothing is recorded. Webhook update routes answer it with a retryable `503` and `update_validation_failed`. Retry with the same request ID.

A keyed retry of a rejected update returns the retained rejection without running the validator again.

## Recover after an uncertain response {#recover-after-an-uncertain-response}

Durable admission, handler completion and an external business effect are
separate facts. A caller timeout can leave an accepted update still running,
and a lost response can hide a result that was already committed. A later
refusal to submit a fresh update does not resolve the original outcome.

When your application saved an update ID, inspect that retained lifecycle
instead of submitting another update. Keep its original run ID so that a
continue-as-new transition does not redirect the investigation:

```php
use Workflow\V2\WorkflowStub;

$latest = WorkflowStub::loadRun($savedRunId, $savedNamespace)->inspectUpdate($savedUpdateId);

$latest->updateStatus();
$latest->result(); // Available when that retained update completed.
```

The saved IDs come from the original operation. Inspection reads the retained
record and can still work after that run closes or becomes historical. Missing
or pruned evidence leaves the outcome unresolved; it is not permission to
repeat a business effect. Preserve an application-owned operation record for
reconciliation when the original response and generated update ID were lost.

### Request IDs and retained receipts

Save the namespace, instance ID, original run ID, update ID, operation name and
intent in your application record. An accepted receipt proves durable admission.
A completed lifecycle supplies the handler's recorded outcome. Neither proves
that a separate payment, email or database write happened exactly once.

Embedded Laravel update webhooks take the caller key from `X-Request-Id`.
Preserve that header through proxies. Standalone Server HTTP updates instead
take the key only from the JSON body's `request_id`; their `X-Request-Id` header
is correlation context. Omitting the body key leaves an update unkeyed, even
when requests share that header.

A command key identifies one update on one workflow instance, across all of its
runs. With Workflow 2.18.0 or later, attach it with `withRequestId()`. After a
lost response, send the same update again with the same key:

```php
use Workflow\V2\WorkflowStub;

$result = WorkflowStub::load('order-123')
    ->withRequestId('mark-ready-order-123')
    ->attemptUpdate('mark-ready', true);

$result->retained();          // True when this call returned an earlier admission
$result->intentVerified();    // False only for a legacy receipt
$result->requestIdConflict(); // True when the key already names a different update
$result->updateId();          // The original update on every matching retry
```

- A retry with the same key, update name, typed arguments and explicit run
  target returns the original receipt, including its update ID, and records
  nothing. After closure or continue-as-new, the retry still returns the
  original update. It does not admit a new update in a successor run.
- The same key with a different update name, arguments or run target is
  refused as `rejected_request_id_conflict`. `conflict()` names the retained
  command and the parts that differ. Nothing is recorded, and the key keeps its
  original receipt.
- A receipt admitted before Workflow recorded command intent reads back with
  `retained()` true and `intentVerified()` false. That is the original
  admission, not proof that this retry's arguments match it.
- Keys are 1 to 255 Unicode characters and are compared exactly. An invalid key
  throws `InvalidCommandRequestIdException` before admission.

Use one key for one logical operation and never change its arguments. Use a new
key for a new operation, including after you confirm that a keyed update was
rejected. Releases before Workflow 2.18.0 and native Server 3.9.0 do not compare
intent: there, a key reused with different arguments or another update name
returns the first update's receipt.

Service-mode clients send the key as the body `request_id`. Native Server 3.9.2
and later apply the same rules and add a `request_id_ambiguous` refusal for
some legacy keys. See
[signal and update command keys](/docs/polyglot/server-api-reference#command-keys)
for the HTTP contract and the PHP, Python, Rust and CLI calls.

Receipt recovery depends on retained command, update and history records. When
retention prunes a run's details, its keys go with them, and a later request
under that key is admitted as a new command. There is no
application-independent deduplication lifetime promised here. Review
[history retention](../configuration/pruning-workflows.md) and keep your business ledger
for the lifetime required by your application. Missing evidence remains an
unknown outcome.

### Protect the business effect

For an operation such as charging an invoice:

1. Persist an application operation key, such as `tenant-1:charge:invoice-123`,
   and its immutable intent before sending the command. Reuse that key during
   recovery.
2. In the activity that applies the effect, use a unique database constraint on
   the tenant and operation key. Atomically check the stored intent, apply the
   local database effect and store its result in one transaction. Return the
   stored result for a duplicate with the same intent. Refuse a different intent.
3. For an external provider, use its supported idempotency contract or an outbox
   and reconciliation process. A transaction in your database cannot make a
   separate provider call atomic.
4. After an uncertain response, reconcile that operation record, the original
   update lifecycle and the provider's evidence. Record whether the effect is
   pending, committed, failed or still unknown before deciding another action.

A query followed by a command leaves a race. A duplicate signal can trigger
another activity even when the original was admitted. The application guard
must tolerate repeated delivery. The qualified example executes two activities
for the same key but commits one local database effect. It does not establish
exactly-once execution for arbitrary external systems.

Update rules:

- `load($instanceId)` updates the newest durable run for that instance (including after continue-as-new).
- Fresh updates through `loadRun($runId)` reject with `rejected_not_current` once that selected run is historical. Retained receipt inspection is separate.
- Fresh updates against closed runs reject with `rejected_not_active`. Replaying a retained keyed receipt is separate.
- An update accepted while the workflow task that completes the run is running gets one delivery turn before the run closes, as a signal does. Its handler runs and the caller receives its result. Updates still pending when a run fails, is cancelled or is terminated close with an explicit failure.
- Failed update bodies do not close the workflow run; they are recorded as update-scoped failures and leave the run open for the next replay task.
- Queries replay completed updates, but rejected or failed updates remain non-replayable command and history facts only.
