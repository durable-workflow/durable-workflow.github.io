---
sidebar_position: 5
---

# Structural Limits

Structural limits cap the resource consumption of a single workflow run. When an operation would exceed a configured limit, the engine records a typed failure with a machine-readable `structural_limit` failure category and the specific limit kind, then fails the run. This protects the system from unbounded fan-out, oversized payloads, and metadata bloat.

## Limit kinds

| Limit kind | Default | What it caps |
|---|---|---|
| `pending_activity_count` | 2,000 | Non-terminal activity executions open simultaneously |
| `pending_child_count` | 1,000 | Non-terminal child workflows open simultaneously |
| `pending_timer_count` | 2,000 | Pending timers open simultaneously |
| `pending_signal_count` | 5,000 | Unprocessed signals pending simultaneously |
| `pending_update_count` | 500 | Unresolved updates pending simultaneously |
| `command_batch_size` | 1,000 | Items in a single parallel fan-out (`all()`) |
| `payload_size_bytes` | 2 MiB | Serialized size of a single argument payload |
| `memo_size_bytes` | 64 KiB | Serialized size of non-indexed memo metadata |
| `search_attribute_size_bytes` | 40 KiB | Serialized size of indexed search-attribute metadata |
| `history_transaction_size` | 5,000 | History events produced by a single workflow task execution |

All limits are enforced at the point of scheduling, recording, or command intake. A value of `0` disables the check for that limit kind.

## Soft-limit warnings

Before a hard limit terminates a run or rejects a command, the engine can warn you that a resource is approaching its ceiling. When a count-based resource (pending activities, children, timers, signals, updates, command batch size, or history transaction events) crosses a configurable percentage of the hard limit, the engine logs a structured warning.

The default warning threshold is **80%**. For example, with the default `pending_activity_count` limit of 2,000, a warning is logged when a run reaches 1,600 pending activities. The run continues executing normally — the warning gives operators time to react (scale workers, trigger continue-as-new, raise the limit) before the hard guard fails the run.

Configure the threshold via `workflows.v2.structural_limits.warning_threshold_percent`:

```env
DW_V2_LIMIT_WARNING_THRESHOLD_PERCENT=80
```

Set to `0` to disable soft-limit warnings entirely.

Warning log entries include structured context:

```
[Durable Workflow] Run 42 approaching structural limit [pending_activity_count]: 1620 / 2000 (81% utilization, warning at 80%).
```

The structured log context includes `workflow_run_id`, `workflow_type`, `limit_kind`, `current`, `limit`, and `utilization_percent` for integration with log aggregation and alerting tools.

## Configuration

Override any limit through `workflows.v2.structural_limits` in your config or via environment variables:

```php
// config/workflows.php
'v2' => [
    'structural_limits' => [
        'pending_activity_count' => (int) env('DW_V2_LIMIT_PENDING_ACTIVITIES', 2000),
        'pending_child_count' => (int) env('DW_V2_LIMIT_PENDING_CHILDREN', 1000),
        'pending_timer_count' => (int) env('DW_V2_LIMIT_PENDING_TIMERS', 2000),
        'pending_signal_count' => (int) env('DW_V2_LIMIT_PENDING_SIGNALS', 5000),
        'pending_update_count' => (int) env('DW_V2_LIMIT_PENDING_UPDATES', 500),
        'command_batch_size' => (int) env('DW_V2_LIMIT_COMMAND_BATCH_SIZE', 1000),
        'payload_size_bytes' => (int) env('DW_V2_LIMIT_PAYLOAD_SIZE_BYTES', 2097152),
        'memo_size_bytes' => (int) env('DW_V2_LIMIT_MEMO_SIZE_BYTES', 65536),
        'search_attribute_size_bytes' => (int) env('DW_V2_LIMIT_SEARCH_ATTRIBUTE_SIZE_BYTES', 40960),
        'history_transaction_size' => (int) env('DW_V2_LIMIT_HISTORY_TRANSACTION_SIZE', 5000),
        'warning_threshold_percent' => (int) env('DW_V2_LIMIT_WARNING_THRESHOLD_PERCENT', 80),
    ],
],
```

## Enforcement points

### Pending count limits (executor-side)

Before the executor schedules an activity, child workflow, or timer, it counts the currently non-terminal items of that type on the run. If the count is already at or above the configured limit, the run fails immediately with a `StructuralLimitExceededException`.

This protects against patterns like unbounded parallel fan-out loops that accumulate thousands of pending operations:

```php
// This will fail if $items exceeds the pending_activity_count limit
$calls = [];
foreach ($items as $item) {
    $calls[] = fn () => activity(ProcessItemActivity::class, $item);
}
return all($calls); // Also checked against command_batch_size
```

To handle large batches within the limits, process items in bounded chunks:

```php
foreach (array_chunk($items, 500) as $chunk) {
    $calls = [];
    foreach ($chunk as $item) {
        $calls[] = fn () => activity(ProcessItemActivity::class, $item);
    }
    all($calls);
}
```

### Pending count limits (intake-side)

When a signal or update command arrives via the control plane, webhook, or `WorkflowStub`, the engine checks the count of unprocessed signals (`received` status) or unresolved updates (`accepted` status) on the target run before accepting the command.

If the count is at or above the configured limit, the command is **rejected** with reason `structural_limit_exceeded`. The rejection response includes machine-readable metadata (`structural_limit_kind`, `structural_limit_value`, `structural_limit_configured`) so callers can identify the root cause.

Unlike executor-side limits (which fail the run), intake-side limits reject the individual command without terminating the workflow. The run remains active, and the caller can retry once pending items have been processed.

For a Server update with `request_id`, the keyed rejection is retained. Reusing
that key returns the original rejection even after capacity or settings change.
After confirming the rejection and restoring capacity, use a new key for a new
admission attempt. An uncertain response is different: recover its original
receipt before deciding whether another admission is safe.

```php
// If 5,000 signals are already pending, this will be rejected:
$result = $workflow->attemptSignal('process-item', $data);
if ($result->rejected()) {
    // $result->rejectionReason() === 'structural_limit_exceeded'
    // back off and retry later
}
```

### Command batch size

The `all()` function checks the total number of leaf operations in a single fan-out group against `command_batch_size`. This is checked before any individual activities or children are scheduled, so the run fails cleanly rather than partially scheduling a batch.

### Payload size

When the executor schedules an activity or child workflow, it serializes the argument payload and checks the byte length against `payload_size_bytes`. If the serialized payload exceeds the limit, the run fails before any database rows are created for the operation.

This applies to:

- **Activity arguments** — checked at the point `scheduleActivity` serializes the `ActivityCall` arguments.
- **Child workflow arguments** — checked at the point `scheduleChildWorkflow` serializes the child's start arguments, before creating the child instance or run rows.

```php
// A 3 MiB payload will fail with the default 2 MiB limit
activity(ProcessDocumentActivity::class, $threeMegabyteBlob);
```

To work within the limit, either enable
[External Payload Storage](../features/external-payload-storage.md) on the
namespace so the runtime transparently offloads over-threshold payloads to a
configured object store, or store the bytes yourself and pass an
application-level reference:

```php
$ref = Storage::put('docs/incoming.pdf', $blob);
activity(ProcessDocumentActivity::class, $ref);
```

External payload storage preserves replay integrity by recording a hashed
`durable-workflow.v2.external-payload-reference.v1` envelope in history, so
the reference envelope becomes the payload the limit sees — not the bytes.

### Memo size

Memo has fixed caps: each value up to 10,240 bytes when encoded (`memo_value_bytes`), at most 100 keys (`memo_keys`) and 65,536 bytes in total (`memo_total_bytes`). `memo_size_bytes` checks the encoded size of the merged memo map and can tighten the total but not raise it: a larger setting acts as 65,536. Setting it to `0` turns this check off; the fixed caps stay.

Start, `upsertMemo()` and service-worker memo upserts all check the memo that the write would leave on the run before anything is written. Going over a limit raises `StructuralLimitExceededException` with a `limitName`. An upsert from workflow code fails the run, and its `WorkflowFailed` event records `structural_limit_name`.

These rules apply from Workflow 2.25.0. Earlier releases defaulted `memo_size_bytes` to 256 KiB, which the fixed total made unreachable, and raised `InvalidArgumentException` for the fixed caps.

### History transaction size

Each workflow task execution (a single "turn" of replay and forward progress) may produce new history events — activity scheduling, timer creation, side-effect recording, search-attribute upserts, and so on. The `history_transaction_size` limit caps the total number of new events a single task can produce.

This catches runaway loops that create unbounded events in a single task without yielding control:

```php
// If a workflow schedules thousands of operations in one task,
// the history transaction limit prevents the task from growing
// without bound. Process large batches in bounded chunks instead.
foreach (array_chunk($items, 500) as $chunk) {
    $calls = [];
    foreach ($chunk as $item) {
        $calls[] = fn () => activity(ProcessItemActivity::class, $item);
    }
    all($calls);  // Each chunk is a separate task execution
}
```

The check runs at the top of each iteration of the executor's main loop. Events created during replay (reading existing history) do not count toward the limit — only new events written during the current task contribute.

### Search attribute size

Search attributes have fixed caps: strings up to 2,048 characters (`search_attribute_string_characters`), keywords and keyword-list entries up to 255 characters (`search_attribute_keyword_characters`), at most 100 attributes (`search_attribute_count`) and 65,536 bytes in total (`search_attribute_total_bytes`). `search_attribute_size_bytes` checks the JSON size of the merged attribute map and can tighten the total but not raise it. Setting it to `0` turns this check off; the fixed caps stay.

Start, `upsertSearchAttributes()` and service-worker upserts apply the same limits before anything is written, and fail the same way as memo limits.

## Failure taxonomy

When a structural limit is exceeded, the engine records:

- A `WorkflowFailure` row with `failure_category = structural_limit`
- A `WorkflowFailed` history event with:
  - `failure_category = structural_limit`
  - `structural_limit_kind` — the specific limit that was exceeded (e.g. `pending_activity_count`, `command_batch_size`)
  - `structural_limit_value` — the current count or size that triggered the limit
  - `structural_limit_configured` — the configured ceiling

This metadata is machine-readable, so operators, Waterline, and external tooling can identify the root cause without parsing free-text messages.

## Health check

The current structural limits configuration is included in the v2 health check snapshot under `structural_limits`, making the active ceilings visible to operators:

```json
{
  "structural_limits": {
    "pending_activity_count": 2000,
    "pending_child_count": 1000,
    "pending_timer_count": 2000,
    "pending_signal_count": 5000,
    "pending_update_count": 500,
    "command_batch_size": 1000,
    "payload_size_bytes": 2097152,
    "memo_size_bytes": 65536,
    "search_attribute_size_bytes": 40960,
    "history_transaction_size": 5000,
    "warning_threshold_percent": 80
  }
}
```

## Backend-dependent limits

The backend capabilities snapshot publishes the full structural-limit contract adjusted for the current infrastructure. Most limits are backend-independent configuration values, but certain backends impose additional constraints:

- **SQS queue**: [Standard SQS message delays](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-message-timers.html) are capped at 900 seconds. Longer timer, activity-retry and workflow-task delays are chunked by the transport layer. The capability snapshot retains `max_single_timer_delay_seconds: 900` for compatibility.
- **SQLite database** — SQLite serializes writes, so the snapshot notes `concurrent_write_safety: limited`. High pending-count limits may cause lock contention under concurrent worker load.

An early SQS delivery schedules another capped message without leasing the
durable task, spending an execution attempt, writing execution history or running
user code. The original `available_at` stays unchanged. Once due, the task follows
normal execution and duplicate-delivery fencing. Overall workflow and activity
deadlines keep running during the wait, so choose a backoff that fits those
budgets. Queue drivers without a delay cap retain the exact requested delay.

The full contract is available in the `structural_limits` section of the backend capabilities response:

```json
{
  "structural_limits": {
    "configured": { "pending_activity_count": 2000, "..." : "..." },
    "backend_adjustments": { "max_single_timer_delay_seconds": 900 },
    "effective": { "pending_activity_count": 2000, "max_single_timer_delay_seconds": 900, "..." : "..." },
    "issues": [
      {
        "component": "structural_limits",
        "severity": "info",
        "code": "queue_max_delay_constraint",
        "message": "The [sqs] queue driver limits delayed dispatch to 900 seconds; longer task delays are chunked by the transport layer."
      }
    ]
  }
}
```

## Waterline

Waterline surfaces structural-limit failures in the exceptions table with the `structural_limit` failure category. The timeline failure details include the limit kind, current value, and configured ceiling.

## Server request-boundary limits

When using the standalone server, a separate set of caps is enforced at the HTTP request boundary before a workflow task, signal, update, or query ever reaches the control plane. These limits fail fast with a `422 validation_failed` (or `413 payload_too_large` for whole-body checks) response so clients learn the rejection reason without the server writing any row to the database.

| Limit | Default | Config key | What it caps |
|---|---|---|---|
| Body size | 2 MiB | `server.limits.max_payload_bytes` | Total HTTP request body bytes, except a workflow-task completion on native Server 3.6.0 or later (next row) |
| Workflow-task completion size | 32 MiB (16 × body size) | derived from `server.limits.max_payload_bytes` | Native Server 3.6.0 or later: a request that completes a workflow task with commands. Each command's arguments still meet the per-payload limit |
| Memo size | 256 KiB | `server.limits.max_memo_bytes` | Serialized memo on `POST /workflows` and `POST /schedules` |
| Search-attribute count | 100 | `server.limits.max_search_attributes` | Registered custom search attributes per namespace |
| Search-attribute key length | 128 bytes | `server.limits.max_search_attribute_key_length` | Length of a single SA key on start |
| Search-attribute value size | 2 KiB | `server.limits.max_search_attribute_value_bytes` | Each string value (and each element of an array value) on start |
| Signal / update / query name | 256 bytes | `server.limits.max_operation_name_length` | URL path segment for signal/update/query names |
| `workflow_id` length | 128 chars | controller validator | Workflow ID on `POST /workflows` |
| `workflow_type` / `task_queue` / `business_key` | 255 chars | controller validator | String fields on `POST /workflows` |
| `request_id` | 255 chars | controller validator | Deduplication token on signals/updates/cancel/terminate |
| `reason` | 1,000 chars | controller validator | Reason text on cancel/terminate/archive |

Each limit is individually configurable via `DW_*` environment variables (see `config/dw-contract.php` for the full contract). Setting a value of `0` disables the check for that specific limit, but leaves the others in force.

The currently-configured values are published under `limits` on the `GET /api/cluster/info` response, so clients can discover them at runtime:

```json
{
  "limits": {
    "max_payload_bytes": 2097152,
    "max_memo_bytes": 262144,
    "max_search_attributes": 100,
    "max_search_attribute_key_length": 128,
    "max_search_attribute_value_bytes": 2048,
    "max_operation_name_length": 256,
    "max_pending_activities": 2000,
    "max_pending_children": 2000
  }
}
```

Validation errors are returned in the standard control-plane error envelope with `reason: "validation_failed"` and a `validation_errors` map keyed by the offending field (`signal_name`, `update_name`, `query_name`, `search_attributes`, `memo`, and so on). Payload-size rejections use `reason: "payload_too_large"` and the `413` status code.

### Workflow-task completion size {#workflow-task-completion-size}

On native Server 3.6.0 and later, a request that completes a workflow task
with commands (`POST /api/worker/workflow-tasks/{id}/complete` and
`POST /api/worker/activity-tasks/{id}/continuation/complete`) may be up to 16
times `max_payload_bytes`: 32 MiB with the default 2 MiB. It follows
`DW_MAX_PAYLOAD_BYTES` and has no setting of its own. Each command's arguments
still meet the per-payload limit inside the completion. PHP Server 2.x and
earlier native releases cap a completion at one payload limit, like any other
request.

A larger completion is refused with `413 payload_too_large` and
`limit_kind: workflow_task_completion_bytes` before anything is recorded.
Replaying the task produces the same commands, so sending the completion again
gets the same refusal. When PHP SDK 3.17.0 or later receives this typed refusal, it does not resend
the completion: the worker fails the run once with a `fail_workflow` command whose message starts
`Structural limit exceeded: workflow_task_completion_bytes:` and names both
sizes, and the Server records the failure with
`failure_category = structural_limit`.

Python SDK 2.17 and Rust SDK 4.15 include handling for the typed refusal.
On Server 3.8.0, an oversized completion can fail at the transport before the
worker receives HTTP 413. In the published Python test, `httpx.ReadError` left
the workflow pending instead of failing structurally. Published-Server
over-limit acceptance remains open under the
[Server response fix](https://github.com/durable-workflow/.github/issues/228#issuecomment-6848969678).
Reduce completion sizes until that path is qualified.

To keep a completion within the limit:

- Split a large fan-out into smaller batches across workflow tasks.
- Move work into child workflows, or continue as new.
- Store large arguments with external payload storage, so the completion
  carries references instead of the payloads.
