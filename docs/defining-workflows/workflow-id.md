---
sidebar_position: 6
---

# Workflow ID

## Instance IDs and Run IDs

When starting a workflow, `id()` is the public workflow instance id and `runId()` is the currently selected run.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class);

$instanceId = $workflow->id();

$workflow->start();

$runId = $workflow->runId();
```

Use the instance id when you want the stable public handle for the workflow. Use the run id when you need to inspect one concrete execution.

`WorkflowStub::load($instanceId)` is instance-centric. When you want to pin one concrete execution explicitly, you can either load it by run id or by the instance-plus-selected-run pair:

```php
use Workflow\V2\WorkflowStub;

$current = WorkflowStub::loadSelection($instanceId);
$current->runId(); // Current selected run for the instance

$selectedRun = WorkflowStub::loadSelection($instanceId, $runId);
$selectedRun->runId(); // Selected run id
$selectedRun->currentRunId(); // Current run id for the instance
$selectedRun->currentRunIsSelected(); // true when the selected run is still current

$sameSelectedRun = WorkflowStub::loadRun($runId);
```

That instance-scoped selector is useful when another system already stored the public instance id and later wants to pin a historical run without changing the outer workflow address.

Instance-scoped current-run selection no longer trusts only the mutable `workflow_instances.current_run_id` pointer. `load($instanceId)`, `currentRunId()`, Waterline instance routes, and other instance-targeted current-run actions resolve the newest durable run in the instance chain, so continue-as-new navigation still lands on the right run even if that pointer is temporarily stale or null.

That same distinction applies to query methods:

```php
$current = WorkflowStub::load($instanceId);
$current->currentStage(); // Queries the current run for that instance

$historical = WorkflowStub::loadSelection($instanceId, $runId);
$historical->currentStage(); // Queries the selected run explicitly
```

## Webhook Routes

The webhook surface supports both instance-targeted and run-targeted command routes:

```text
POST /webhooks/instances/{workflowId}/signals/{signal}
POST /webhooks/instances/{workflowId}/updates/{update}
POST /webhooks/instances/{workflowId}/cancel
POST /webhooks/instances/{workflowId}/terminate
POST /webhooks/instances/{workflowId}/runs/{runId}/signals/{signal}
POST /webhooks/instances/{workflowId}/runs/{runId}/updates/{update}
POST /webhooks/instances/{workflowId}/runs/{runId}/cancel
POST /webhooks/instances/{workflowId}/runs/{runId}/terminate
```

## Waterline Routes

Waterline's canonical detail route is instance-scoped with an explicit selected run:

```text
/waterline/flows/instances/{instanceId}/runs/{runId}
```

The matching API routes are:

```text
GET /waterline/api/instances/{instanceId}
GET /waterline/api/instances/{instanceId}/history-export
GET /waterline/api/instances/{instanceId}/runs/{runId}
POST /waterline/api/instances/{instanceId}/cancel
POST /waterline/api/instances/{instanceId}/repair
POST /waterline/api/instances/{instanceId}/terminate
POST /waterline/api/instances/{instanceId}/runs/{runId}/cancel
POST /waterline/api/instances/{instanceId}/runs/{runId}/repair
POST /waterline/api/instances/{instanceId}/runs/{runId}/terminate
```

Legacy Waterline bucket preview routes such as `/waterline/running/{flowId}` still work as compatibility aliases, but they now hydrate through the same selected-run payload and redirect onto the canonical instance/run detail route.

`GET /waterline/api/instances/{instanceId}/history-export` follows the same current-run selection contract as `GET /waterline/api/instances/{instanceId}`. If continue-as-new lineage proves the current run, the history export follows that lineage; if there is no lineage evidence, it falls back to durable run ordering. Historical exports remain explicitly run-scoped under `/waterline/api/instances/{instanceId}/runs/{runId}/history-export`.

## Persisting IDs

Persist the instance id when another system needs to address the workflow again later. Persist the run id when you need to pin one specific execution, such as a Waterline detail view or a command-history entry.

Run-targeted command responses return both identities:

```json
{
  "workflow_id": "order-123",
  "run_id": "01J10000000000000000000021",
  "requested_run_id": "01J10000000000000000000021",
  "resolved_run_id": "01J10000000000000000000021",
  "command_id": "01J40000000000000000000021",
  "target_scope": "run",
  "command_status": "accepted",
  "rejection_reason": null
}
```

That contract is what Waterline uses for canonical selected-run actions, so an operator action can always be tied back to both the stable public instance id and the concrete run id that accepted or rejected the command. When a historical selected run rejects as `rejected_not_current`, `requested_run_id` keeps the run the caller addressed and `resolved_run_id` points at the current run that should be used next.

## Durable Type Stability

Keep the public instance id stable independently from the workflow's PHP class name. Class renames are survivable only when the durable `workflow_type` stays stable and the new class is still registered under that durable key through `#[Type(...)]` and/or `workflows.v2.types.workflows`. Once that mapping is in place, new starts and `continueAsNew()` generations rewrite the stored `workflow_class` for the next run to the resolved class instead of keeping the stale missing FQCN alive indefinitely.

Run-targeted commands reject with `target_scope = run`, `outcome = rejected_not_current`, and `rejection_reason = selected_run_not_current` when the selected run is no longer the instance's current run. The run-targeted webhook routes and Waterline's canonical selected-run operator routes both use that same durable rejection payload, with `requested_run_id` preserving the rejected historical selection and `resolved_run_id` naming the current run that won the race.

## Waterline Detail Controls

Waterline only shows mutable controls when the selected run is still current and still open. If you navigate to a historical run by run id, or if the current selected run is already closed, the detail payload stays read-only and points at the current active run when one exists. The detail payload exposes per-action mutability fields such as `can_cancel`, `cancel_blocked_reason`, `can_terminate`, `terminate_blocked_reason`, `can_signal`, `signal_blocked_reason`, `can_update`, `update_blocked_reason`, `can_repair`, `repair_blocked_reason`, the durable/searchable `repair_attention` bridge, and the companion `repair_blocked` metadata object, with `can_issue_terminal_commands` retained only as the coarse compatibility bridge for existing clients. The detail payload also includes `run_navigation`, so the UI can show the instance's ordered run chain without inferring it from legacy bucket routes or one-hop lineage links.

## Accessing IDs Inside Activities and Workflows

Inside an activity:

```php
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public function handle(): void
    {
        $instanceId = $this->workflowId();
        $runId = $this->runId();
    }
}
```

Inside a workflow, `$this->workflowId()` returns the instance id and `$this->runId()` returns the selected run id for the currently executing run.
