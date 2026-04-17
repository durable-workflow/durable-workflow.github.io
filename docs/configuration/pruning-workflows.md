---
sidebar_position: 6
---

# Pruning Workflows

Workflow v2 separates two distinct lifecycle operations:

1. **Archive** — marks a terminal run as archived so it is excluded from active fleet views. Archiving does **not** delete any rows.
2. **Prune** — removes stale projection or durable rows from the database. Pruning should only run against archived runs.

## Archiving terminal runs

Archive a completed, failed, cancelled, or terminated run through the control plane:

```php
use Workflow\V2\Contracts\WorkflowControlPlane;

$controlPlane = app(WorkflowControlPlane::class);

$result = $controlPlane->archive('order-12345', [
    'reason' => 'Retention period expired',
]);

if ($result['accepted']) {
    // Run's archived_at is now set; it disappears from active fleet views.
}
```

The same operation is available through the control-plane HTTP route. Only closed runs may be archived; archiving an already-archived run returns `accepted` with an `archive_not_needed` outcome.

### Automating archival

Archive terminal runs on a schedule by querying the durable run table for finished runs past your retention window and calling `archive()` for each. For a simple time-based rule, add something like this to `routes/console.php`:

```php
use Illuminate\Support\Facades\Schedule;
use Workflow\V2\Models\WorkflowRun;
use Workflow\V2\Contracts\WorkflowControlPlane;

Schedule::call(function (WorkflowControlPlane $controlPlane): void {
    WorkflowRun::query()
        ->whereIn('status', ['completed', 'failed', 'cancelled', 'terminated'])
        ->whereNull('archived_at')
        ->where('closed_at', '<=', now()->subMonth())
        ->with('instance:id')
        ->chunkById(100, function ($runs) use ($controlPlane): void {
            foreach ($runs as $run) {
                $controlPlane->archive($run->instance->id, [
                    'reason' => 'retention_policy',
                ]);
            }
        });
})->daily();
```

## Pruning projection rows

Run summary, wait, timeline, timer, and lineage projection rows can be rebuilt from durable history and commands. Use `workflow:v2:rebuild-projections --prune-stale` to delete projection rows whose durable run no longer exists:

```bash
# Preview what would be pruned
php artisan workflow:v2:rebuild-projections --prune-stale --dry-run

# Actually prune stale projection rows
php artisan workflow:v2:rebuild-projections --prune-stale
```

## Pruning durable rows

Durable rows (`workflow_instances`, `workflow_runs`, `workflow_history_events`, `workflow_tasks`, `activity_executions`, `activity_attempts`, `workflow_failures`, etc.) should only be deleted once the run has been archived and retention is definitely over. Because these rows are referenced by typed history and lineage, pruning must be done in dependency order. The package does not yet ship an end-to-end durable prune command — if you need to reclaim disk space, do it with a scoped cleanup job that:

1. Targets runs where `archived_at IS NOT NULL AND archived_at <= now()->subMonths(3)`.
2. Deletes dependent rows first (history events, tasks, activity attempts, activity executions, failures, timers, links, commands).
3. Deletes the `workflow_runs` row, then the `workflow_instances` row once all runs are removed.
4. Rebuilds projections with `workflow:v2:rebuild-projections --prune-stale` to clean up any orphaned projection rows.

Track the archival retention window and durable retention window separately. Archived-but-not-pruned runs are still available for history export and incident review.
