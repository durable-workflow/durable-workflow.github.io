---
sidebar_position: 2
---

import QuerySimulator from '@site/src/components/QuerySimulator';

# Queries

Queries allow you to retrieve information about the current state of a workflow without affecting its execution. This is useful for monitoring and debugging purposes.

## Replay-Safe Query Methods

Queries replay committed history for the current selected run and then invoke the annotated method on the hydrated workflow object. They do not apply accepted-but-not-yet-applied signal or update commands implicitly.

```php
use Workflow\QueryMethod;
use Workflow\V2\Workflow;
use function Workflow\V2\await;

final class ApprovalWorkflow extends Workflow
{
    private string $stage = 'booting';

    public function handle(): void
    {
        $this->stage = 'waiting-for-approval';

        await('approved-by');

        $this->stage = 'approved';
    }

    #[QueryMethod('current-stage')]
    public function currentStage(): string
    {
        return $this->stage;
    }

    #[QueryMethod('starts-with')]
    public function startsWith(string $prefix): bool
    {
        return str_starts_with($this->stage, $prefix);
    }
}
```

Address the current run through the public instance id:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$workflow->currentStage(); // "waiting-for-approval"
$workflow->query('starts-with', 'waiting'); // true
$workflow->queryWithArguments('starts-with', ['prefix' => 'waiting']); // true
```

When you want to pin one historical or selected run explicitly, query through `loadRun($runId)` instead:

```php
$selectedRun = WorkflowStub::loadRun($runId);

$selectedRun->currentStage();
```

Query behavior:

- Queries are replay-safe: they observe committed history only and do not mutate workflow state.
- Arguments are forwarded to the annotated method. Declare a stable public name with `#[QueryMethod('public-name')]` so the callable survives PHP method renames.
- `load($instanceId)` queries the newest durable run for that instance; `loadRun($runId)` targets one specific run (useful for pre–continue-as-new queries).
- Accepted-but-not-yet-applied signals and updates are visible in command history but do not count as applied state until the worker records `SignalApplied` / `UpdateApplied`.

To define a query method on a workflow, use the `QueryMethod` annotation. The optional string argument lets you freeze a public durable query name that survives PHP method renames:

```php
use Workflow\QueryMethod;
use Workflow\V2\Workflow;

final class MyWorkflow extends Workflow
{
    private bool $ready = false;

    #[QueryMethod('is-ready')]
    public function getReady(): bool
    {
        return $this->ready;
    }
}
```

To query a workflow, call the method on the workflow instance. The query method will return the data from the workflow.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$ready = $workflow->getReady();
$sameReady = $workflow->query('is-ready');
```

Use `queryWithArguments()` when your caller already has one positional list or a named parameter map:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$workflow->queryWithArguments('starts-with', [
    'prefix' => 'wait',
]);
```

Waterline uses the selected-run query contract surface. The dashboard exposes `declared_query_targets[*]` alongside signals and updates, but only shows query execution when `can_query = true`. The selected-run or current-run query operator posts JSON `arguments` to `/waterline/api/instances/{instanceId}/queries/{query}` or `/waterline/api/instances/{instanceId}/runs/{runId}/queries/{query}`. Query execution still requires a loadable workflow definition because the selected run must be replayed before the query method can run; when durable query targets exist but that definition is unavailable, selected-run detail reports `can_query = false` with `query_blocked_reason = workflow_definition_unavailable`, and query POSTs return HTTP `409 Conflict` with `blocked_reason = workflow_definition_unavailable`. If the run only has an incomplete snapshot and the current build can no longer finish backfilling it, detail reports `declared_contract_source = unavailable`; surviving query targets remain visible as diagnostic metadata, but named query arguments still reject with `422` until a compatible build persists the missing contract.

The public webhook bridge exposes that same replay-safe query surface outside Waterline:

```text
POST /webhooks/instances/{instanceId}/queries/{query}
POST /webhooks/instances/{instanceId}/runs/{runId}/queries/{query}
```

Those webhook routes accept the same JSON `arguments` field as Waterline, return a typed JSON `result` on success, and use the same error shape for invalid arguments (`422` with `validation_errors`) and replay blocks (`409` with `blocked_reason`). When the current workflow definition is still loadable, callers may address the query by either its durable `#[QueryMethod('public-name')]` target or the underlying PHP method name; successful HTTP responses normalize `query_name` back to the durable public target so external callers do not harden on method-renaming details.

<QuerySimulator />

**Important:** Querying a workflow does not advance its execution, unlike signals.
