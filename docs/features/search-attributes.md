---
sidebar_position: 17
---

# Search Attributes

Search attributes are typed, indexed key-value pairs that a workflow can upsert at any point during execution. Unlike visibility labels (which are set once at start time), search attributes can be updated as the workflow progresses, making them ideal for tracking workflow status, customer identifiers, or any operator-visible metadata that changes over the lifetime of a run.

## Upserting Search Attributes

`upsertSearchAttributes()` is a durable straight-line helper. Each call records a typed `SearchAttributesUpserted` history event and merges the new attributes into the run's persisted search attributes.

```php
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, upsertSearchAttributes};

final class OrderWorkflow extends Workflow
{
    public function handle(string $orderId, string $customer): array
    {
        upsertSearchAttributes([
            'status' => 'processing',
            'customer' => $customer,
            'order_id' => $orderId,
        ]);

        $result = activity(ProcessOrderActivity::class, $orderId);

        upsertSearchAttributes([
            'status' => 'completed',
            'result' => $result->outcome,
        ]);

        return $result->toArray();
    }
}
```

## Setting Search Attributes at Start Time

Search attributes can also be set when starting a workflow via `StartOptions::withSearchAttributes()`. Start-time attributes are recorded on the run immediately and appear in the `StartAccepted` and `WorkflowStarted` history events. Any subsequent `upsertSearchAttributes()` calls merge on top of them.

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(OrderWorkflow::class, 'order-42');
$workflow->start(
    $orderId,
    $customer,
    StartOptions::rejectDuplicate()->withSearchAttributes([
        'env' => 'production',
        'region' => 'us-east',
        'priority' => 'high',
    ]),
);
```

You can chain `withSearchAttributes()` with other `StartOptions` builders:

```php
$options = StartOptions::rejectDuplicate()
    ->withBusinessKey('order-42')
    ->withLabels(['tenant' => 'acme'])
    ->withMemo(['note' => 'VIP order'])
    ->withSearchAttributes(['priority' => 'high']);

$workflow->start($orderId, $customer, $options);
```

Start-time search attributes follow the same validation rules as `upsertSearchAttributes()`: keys must be 1-64 URL-safe characters, values must be scalar or null, and null values are dropped (not persisted).

### Control plane

The control plane `start()` method also accepts search attributes:

```php
$controlPlane->start('orders.process-order', 'order-42', [
    'arguments' => $serializedArgs,
    'search_attributes' => ['env' => 'production', 'priority' => 'high'],
]);
```

## How It Works

The `upsertSearchAttributes()` function accepts an associative array of key-value pairs:

- **Keys** must be 1-64 characters, URL-safe (letters, digits, hyphens, underscores)
- **Values** must be scalar (string, int, float, bool) or null; string values are capped at 191 characters
- Passing `null` as a value removes that key from the search attributes

Each call:

1. Suspends the workflow fiber and yields an `UpsertSearchAttributesCall` command
2. The executor validates and normalizes the attributes (keys are sorted alphabetically)
3. A `SearchAttributesUpserted` history event is appended with the upserted `attributes` and the full `merged` result
4. The run's `search_attributes` column is updated with the merged map
5. The run summary projection is refreshed so Waterline reflects the change immediately

On replay, recorded search attribute events are reused without re-executing the upsert, preserving determinism.

## Merging Behavior

Search attributes merge across multiple upserts within the same run. Each upsert overlays new keys on top of existing ones:

```php
// First upsert
upsertSearchAttributes(['status' => 'processing', 'customer' => 'Taylor']);
// search_attributes = { customer: Taylor, status: processing }

// Second upsert
upsertSearchAttributes(['status' => 'completed', 'result' => 'success']);
// search_attributes = { customer: Taylor, result: success, status: completed }
```

To remove a key, set it to `null`:

```php
upsertSearchAttributes(['temporary_flag' => null]);
```

## Visibility and Filtering

Search attributes appear in:

- **Run detail view** — the merged search attributes map is displayed alongside labels and memo
- **Run summary projection** — search attributes are included in the denormalized summary for fast reads
- **Visibility filters** — operators can filter workflow runs by search attribute values in Waterline saved views
- **History timeline** — each `SearchAttributesUpserted` event appears as a typed entry in the run timeline
- **History export** — search attributes are included in JSON history exports

### Parent and child list filters {#parent-child-list-filters}

Children [inherit search attributes and memo at creation](./child-workflows.md#child-metadata-inheritance), then can upsert their own values independently. Filtering an inherited attribute does not implicitly exclude children. For a registered keyword attribute, the Server query `customer = 'customer-42'` can return the parent and every child still carrying that value. Memo remains unindexed metadata; it is not another search-attribute filter.

The qualified Server 2.11.0 list API has **no built-in roots-only or children-only predicate**. `ParentWorkflowId`, `RootWorkflowId` and `IsChildWorkflow` are not automatic relationship fields in its query language; the published checks reject those unregistered names. Registering a custom attribute with such a name does not populate parent/child identity. A workflow-type filter selects a type, not every root or child across types.

Inspect the run's lineage when you need its actual parent/child relationship. Broader shared visibility filtering remains [product work](https://github.com/durable-workflow/.github/issues/224); this limitation and a user-authored metadata convention do not deliver that capability. The [verification receipt](https://github.com/durable-workflow/durable-workflow.github.io/issues/368#issuecomment-6362355504) preserves the observed parent-and-child result and rejected predicates.

## Continue-as-New

When a workflow continues as new, the current search attributes are carried forward to the new run automatically. The new run starts with the full merged attribute map from the previous run and can continue upserting from there.

## Privacy and Limits

Search attributes are **plain-text operator metadata** — their values are visible to anyone with Waterline access and are stored unencrypted. Never store secrets, passwords, tokens, or personally identifiable information (PII) in search attributes.

Constraints:

- Key names: 1-64 characters, URL-safe (`[a-zA-Z0-9_-]`)
- Values: scalar types only (string, int, float, bool), with string values capped at 191 characters
- Setting a value to `null` removes that key

## Search Attributes vs. Memo vs. Visibility Labels

| | Search Attributes | Memo | Visibility Labels |
|---|---|---|---|
| **Set when** | Start time or any time during execution | Start time or any time during execution | Start time only |
| **Mutable** | Yes, via `upsertSearchAttributes()` | Yes, via `upsertMemo()` | No |
| **Value types** | Scalar only | Any JSON-serializable | Scalar only |
| **Indexed** | Yes | No | Yes |
| **Filterable** | Yes | No | Yes |
| **Use case** | Dynamic status, progress tracking | Rich metadata, notes, context | Static classification |
| **History events** | `SearchAttributesUpserted` per upsert | `MemoUpserted` per upsert | None (set on start) |

For rich, structured metadata that does not need to be filtered or sorted, use [memo](./memo.md) instead.
