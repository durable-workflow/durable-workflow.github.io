---
sidebar_position: 6
---

# Workflow ID

## Instance IDs and Run IDs

A durable workflow has two identifiers with different lifecycles:

- The **instance id** (`id()`, `workflowId()`) is the stable public handle for the workflow. It is generated when the workflow is first started — or supplied by the caller — and never changes for the lifetime of that workflow, including across continue-as-new chains.
- The **run id** (`runId()`) identifies one concrete execution generation of that workflow. It is newly allocated every time a new run is created, which happens on the first start and when the workflow continues as new.

Treat the instance id as the public, callable handle. Treat the run id as a pointer to a specific generation that is useful for inspection, debugging, or audit — not as something long-lived control-plane callers should track.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class);

$id = $workflow->id();

$workflow->start();

$runId = $workflow->runId();
```

Use the id when you want the stable public handle for the workflow. Use the run id when you need to inspect one concrete execution.

## Run ID Lifecycle

A run id is an execution-generation identifier. Every v2 workflow generation has its own run id, and a single instance id can span many generations over time:

- A fresh `start()` creates the first run and its first run id.
- `continueAsNew(...)` closes the current run as `completed` / `continued` and starts a new run with a fresh run id under the same instance id. See [Continue As New](/docs/2.0/features/continue-as-new).

Because a run id belongs to one generation, callers that want durable behavior across those transitions should resolve by instance id:

- Signals, queries, updates, and operator commands always resolve the newest durable run for an instance. Callers do not need to track run ids across continue-as-new boundaries.
- Drill-down tools that pin a specific generation — for example Waterline's run-detail view, a history export, or a replay debugger — accept an explicit run id so they can inspect one execution in isolation.

The run id surfaces as `runId()` inside workflow code and activities, and as the `workflow_run_id` / `run_id` field on history, projections, and exports. It is always the run id of the generation that owns the event or row. Do not expect a run id recorded on older history events to equal the current run id of the same instance.

## User-defined Instance IDs

When starting a workflow you may optionally specify the id. User-defined ids must be URL-safe strings up to 191 characters using only letters, numbers, `.`, `_`, `-`, and `:`.

```php
$workflow = WorkflowStub::make(MyWorkflow::class, 'order-123');
```

Later when you want to reference the workflow, you can load it with your custom id.

```php
$workflow = WorkflowStub::load('order-123');
```

## Accessing IDs Inside Activities and Workflows

Inside an activity:

```php
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public function handle(): void
    {
        $id = $this->workflowId();
        $runId = $this->runId();
    }
}
```

Inside a workflow, `$this->workflowId()` returns the instance id and `$this->runId()` returns the selected run id for the currently executing run.
