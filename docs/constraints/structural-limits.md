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
| `command_batch_size` | 1,000 | Items in a single parallel fan-out (`all()` / `parallel()`) |
| `payload_size_bytes` | 2 MiB | Serialized size of a single argument payload |
| `memo_size_bytes` | 256 KiB | Serialized size of non-indexed memo metadata |
| `search_attribute_size_bytes` | 40 KiB | Serialized size of indexed search-attribute metadata |
| `history_transaction_size` | 5,000 | History events produced by a single workflow task execution |

All limits are enforced at the point of scheduling or recording. A value of `0` disables the check for that limit kind.

## Configuration

Override any limit through `workflows.v2.structural_limits` in your config or via environment variables:

```php
// config/workflows.php
'v2' => [
    'structural_limits' => [
        'pending_activity_count' => (int) env('WORKFLOW_V2_LIMIT_PENDING_ACTIVITIES', 2000),
        'pending_child_count' => (int) env('WORKFLOW_V2_LIMIT_PENDING_CHILDREN', 1000),
        'pending_timer_count' => (int) env('WORKFLOW_V2_LIMIT_PENDING_TIMERS', 2000),
        'pending_signal_count' => (int) env('WORKFLOW_V2_LIMIT_PENDING_SIGNALS', 5000),
        'pending_update_count' => (int) env('WORKFLOW_V2_LIMIT_PENDING_UPDATES', 500),
        'command_batch_size' => (int) env('WORKFLOW_V2_LIMIT_COMMAND_BATCH_SIZE', 1000),
        'payload_size_bytes' => (int) env('WORKFLOW_V2_LIMIT_PAYLOAD_SIZE_BYTES', 2097152),
        'memo_size_bytes' => (int) env('WORKFLOW_V2_LIMIT_MEMO_SIZE_BYTES', 262144),
        'search_attribute_size_bytes' => (int) env('WORKFLOW_V2_LIMIT_SEARCH_ATTRIBUTE_SIZE_BYTES', 40960),
        'history_transaction_size' => (int) env('WORKFLOW_V2_LIMIT_HISTORY_TRANSACTION_SIZE', 5000),
    ],
],
```

## Enforcement points

### Pending count limits

Before the executor schedules an activity, child workflow, or timer, it counts the currently non-terminal items of that type on the run. If the count is already at or above the configured limit, the run fails immediately with a `StructuralLimitExceededException`.

This protects against patterns like unbounded parallel fan-out loops that accumulate thousands of pending operations:

```php
// This will fail if $items exceeds the pending_activity_count limit
$calls = [];
foreach ($items as $item) {
    $calls[] = startActivity(ProcessItemActivity::class, $item);
}
return all($calls); // Also checked against command_batch_size
```

To handle large batches within the limits, process items in bounded chunks:

```php
foreach (array_chunk($items, 500) as $chunk) {
    $calls = [];
    foreach ($chunk as $item) {
        $calls[] = startActivity(ProcessItemActivity::class, $item);
    }
    all($calls);
}
```

### Command batch size

The `all()` and `parallel()` functions check the total number of leaf operations in a single fan-out group against `command_batch_size`. This is checked before any individual activities or children are scheduled, so the run fails cleanly rather than partially scheduling a batch.

### Payload size

When the executor schedules an activity or child workflow, it serializes the argument payload and checks the byte length against `payload_size_bytes`. If the serialized payload exceeds the limit, the run fails before any database rows are created for the operation.

This applies to:

- **Activity arguments** — checked at the point `scheduleActivity` serializes the `ActivityCall` arguments.
- **Child workflow arguments** — checked at the point `scheduleChildWorkflow` serializes the child's start arguments, before creating the child instance or run rows.

```php
// A 3 MiB payload will fail with the default 2 MiB limit
activity(ProcessDocumentActivity::class, $threeMegabyteBlob);
```

To work within the limit, store large data externally and pass a reference:

```php
$ref = Storage::put('docs/incoming.pdf', $blob);
activity(ProcessDocumentActivity::class, $ref);
```

### Memo size

When a workflow upserts memo entries via `upsertMemo()`, the executor merges the new entries into the existing memo map, then JSON-encodes the merged result and checks the byte length against `memo_size_bytes`. If the merged memo exceeds the limit, the run fails before the memo is persisted.

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
        $calls[] = startActivity(ProcessItemActivity::class, $item);
    }
    all($calls);  // Each chunk is a separate task execution
}
```

The check runs at the top of each iteration of the executor's main loop. Events created during replay (reading existing history) do not count toward the limit — only new events written during the current task contribute.

### Search attribute size

When a workflow upserts search attributes via `upsertSearchAttributes()`, the executor merges the new attributes into the existing set, then JSON-encodes the merged result and checks the byte length against `search_attribute_size_bytes`. If the merged attributes exceed the limit, the run fails before the attributes are persisted.

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
    "memo_size_bytes": 262144,
    "search_attribute_size_bytes": 40960,
    "history_transaction_size": 5000
  }
}
```

## Waterline

Waterline surfaces structural-limit failures in the exceptions table with the `structural_limit` failure category. The timeline failure details include the limit kind, current value, and configured ceiling.
