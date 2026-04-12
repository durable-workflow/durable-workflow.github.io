---
sidebar_position: 14
---

# Search Attributes

Workflow v2 can upsert indexed search attributes during execution. These attributes are durable operator metadata for filtering and saved views, not a place for secrets or replay-authority state.

```php
use Workflow\V2\Workflow;
use function Workflow\V2\upsertSearchAttributes;

final class OrderWorkflow extends Workflow
{
    public function handle(string $orderId): string
    {
        upsertSearchAttributes([
            'order_id' => $orderId,
            'status' => 'pending_review',
        ]);

        return 'ok';
    }
}
```

## Behavior

- Keys must be 1-64 characters using letters, numbers, `.`, `_`, `-`, and `:`.
- Values must be scalar or `null`.
- Empty strings are normalized to `null`.
- Setting a key to `null` removes it from the current search-attribute set.

## Waterline

Waterline shows the current search attributes on the workflow detail view, supports filtering by them in workflow lists, and records `SearchAttributesUpserted` entries in the workflow timeline.
