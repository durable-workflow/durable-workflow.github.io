---
sidebar_position: 6
---

# Pruning Workflows

Workflow v2 separates two distinct lifecycle operations:

1. **Archive** — marks a terminal run as archived so it is excluded from active fleet views. Archiving does **not** delete any rows.
2. **Prune** — removes eligible retained details or orphaned projections. The embedded cleanup API requires a terminal, closed run and checks its retention holds. Your host chooses the retention policy; archiving is not an API prerequisite.

Server has a separate namespace retention policy: its automatic retention skips
archived runs. Archiving a Server run therefore protects it from that cleanup;
it is not a preparatory step for automatic deletion.

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

Embedded hosts can use the shipped cleanup API after enforcing their retention
policy and verifying any required export or recovery copy:

```php
use Workflow\V2\Support\WorkflowRunRetentionCleanup;

$report = WorkflowRunRetentionCleanup::pruneRun($runId);
```

`pruneRun()` locks the selected run and removes its detail rows in one storage
transaction. It refuses a nonterminal run, a missing close time or an open
detached activity (`detached_activity_still_open`). The host remains responsible
for selecting the correct authorized run and enforcing its retention window.
`retentionHoldReason($runId)` can inspect the detached-activity hold; the prune
operation checks it again before deletion.

Keep `workflow_runs` and `workflow_instances`. The run remains a terminal
tombstone with `details_pruned_at`; repeated cleanup preserves the first marker.
Root input/output fields remain in the run row, so account for their storage
separately. Do not recreate the deleted summaries or history with a projection
rebuild. An export taken after pruning cannot recover deleted history; the
export-completeness limitation is tracked in
[Workflow #856](https://github.com/durable-workflow/workflow/issues/856).

This API deletes database details. The host owns external-object retention and
cleanup, including references from retained roots, detached work and active
backup/recovery holds. Follow the
[external payload lifecycle](../features/external-payload-storage.md) before
removing objects. Verify the export and any required external bytes **before**
pruning. Archived runs with retained details remain available for incident review.
