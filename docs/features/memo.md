---
sidebar_position: 18
---

# Memo

Memos are non-indexed key-value metadata that a workflow can read and update at any point during execution. Unlike [search attributes](./search-attributes.md) (which are indexed and filterable), memos are designed for richer, structured metadata that appears in detail views and history exports but is excluded from fleet-wide filtering and sorting by contract.

## Upserting Memos

`upsertMemo()` is a durable straight-line helper. Each call records a typed `MemoUpserted` history event and merges the new entries into the run's persisted memo.

```php
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, upsertMemo};

final class OrderWorkflow extends Workflow
{
    public function handle(string $orderId, string $customer): array
    {
        upsertMemo([
            'customer_name' => $customer,
            'order_id' => $orderId,
            'status' => 'processing',
            'line_items' => [
                ['sku' => 'WIDGET-1', 'qty' => 2],
                ['sku' => 'GADGET-3', 'qty' => 1],
            ],
        ]);

        $result = activity(ProcessOrderActivity::class, $orderId);

        upsertMemo([
            'status' => 'completed',
            'result_summary' => $result->outcome,
        ]);

        return $result->toArray();
    }
}
```

Memos can also be set at start time via `StartOptions`:

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(OrderWorkflow::class, 'order-123');
$workflow->start(
    'ORD-456',
    'Taylor',
    StartOptions::rejectDuplicate()->withMemo([
        'source' => 'api',
        'priority' => 'high',
    ]),
);
```

## How It Works

The `upsertMemo()` function accepts an associative array of key-value pairs:

- **Keys** must be non-empty strings up to 64 characters
- **Values** can be any JSON-serializable data: scalars, null, arrays, or nested objects
- Passing `null` as a value removes that key from the memo

Each call:

1. Suspends the workflow fiber and yields an `UpsertMemoCall` command
2. The executor validates and normalizes the entries (keys are sorted alphabetically)
3. A `MemoUpserted` history event is appended with the upserted `entries` and the full `merged` result
4. The run's `memo` column is updated with the merged map

On replay, recorded memo events are reused without re-executing the upsert, preserving determinism.

## Merging Behavior

Memos merge across multiple upserts within the same run. Each upsert overlays new keys on top of existing ones:

```php
// First upsert
upsertMemo(['status' => 'processing', 'customer' => 'Taylor']);
// memo = { customer: Taylor, status: processing }

// Second upsert
upsertMemo(['status' => 'completed', 'result' => 'success']);
// memo = { customer: Taylor, result: success, status: completed }
```

To remove a key, set it to `null`:

```php
upsertMemo(['temporary_note' => null]);
```

## Visibility

Memos appear in:

- **Run detail view** — the full merged memo is displayed in Waterline's workflow detail page
- **History timeline** — each `MemoUpserted` event appears as a typed entry in the run timeline
- **History export** — memos are included in JSON history exports
- **Describe** — the control plane `describe` response includes the current memo

Memos are **not** included in run summary projections and are **not** available for filtering, sorting, or saved views. Use [search attributes](./search-attributes.md) for indexed, filterable metadata.

## Continue-as-New

When a workflow continues as new, the current memo is carried forward to the new run automatically. The new run starts with the full merged memo from the previous run and can continue upserting from there.

## Nested Structures

Unlike search attributes (which are limited to scalar values), memos support nested JSON structures:

```php
upsertMemo([
    'order' => [
        'id' => 'ORD-456',
        'items' => [
            ['sku' => 'WIDGET-1', 'qty' => 2],
            ['sku' => 'GADGET-3', 'qty' => 1],
        ],
    ],
    'metadata' => [
        'source' => 'api',
        'version' => 2,
    ],
]);
```

Nested objects have the same key constraints (non-empty strings up to 64 characters per key at each level).

## Constraints

- Key names: non-empty strings up to 64 characters per nesting level
- Values: any JSON-serializable type (scalars, null, arrays, nested objects)
- Setting a value to `null` removes that key
- Memos are eventually consistent metadata, not replay authority — do not branch workflow logic based on memo values

## Memo vs. Search Attributes vs. Visibility Labels

| | Memo | Search Attributes | Visibility Labels |
|---|---|---|---|
| **Set when** | Start time or any time during execution | Any time during execution | Start time only |
| **Mutable** | Yes, via `upsertMemo()` | Yes, via `upsertSearchAttributes()` | No |
| **Value types** | Any JSON-serializable | Scalar only | Scalar only |
| **Indexed** | No | Yes | Yes |
| **Filterable** | No | Yes | Yes |
| **Use case** | Rich metadata, notes, context | Dynamic status, progress tracking | Static classification |
| **History events** | `MemoUpserted` per upsert | `SearchAttributesUpserted` per upsert | None (set on start) |
