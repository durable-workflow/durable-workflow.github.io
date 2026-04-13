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

### Payload size limits

Payload size checks apply to serialized argument data. When a serialized payload exceeds the configured `payload_size_bytes`, the engine rejects the operation.

### Metadata size limits

Memo and search-attribute metadata are checked against `memo_size_bytes` and `search_attribute_size_bytes` respectively when upserting metadata.

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
    "search_attribute_size_bytes": 40960
  }
}
```

## Waterline

Waterline surfaces structural-limit failures in the exceptions table with the `structural_limit` failure category. The timeline failure details include the limit kind, current value, and configured ceiling.
