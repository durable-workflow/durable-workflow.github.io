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

## Keeping history beyond database retention {#keeping-history-beyond-database-retention}

Choose where the required history will live before enabling cleanup:

| Requirement | Option | Storage and cleanup consequence |
| --- | --- | --- |
| Keep recent history in Server | Bounded namespace retention, from 1 to 365 days | Eligible closed runs can be pruned after the cutoff. Export sooner if you need a longer record. |
| Keep all namespace history in Server | Namespace retention mode `forever` | History stays in the primary database until you explicitly return the namespace to bounded retention. |
| Preserve selected closed Server runs | Archive those runs | Automatic and explicit Server retention passes skip them. The published API has no unarchive operation, so do not use archive as a temporary export lock. |
| Keep a longer independent record | Export each closed run and preserve its external payload objects | Your application owns scheduling, verification, access control and eventual deletion of that copy. There is no built-in continuous history exporter. |

`forever` and archive retain database rows rather than moving them to cheaper
storage. Plan for accumulated history and payload bytes, indexes, backups and
restore time. Pruning retains the run and instance rows, including root payload
fields. It does not reduce their storage to zero. A history export supports
replay and investigation; it is not a complete database backup or a promise
that a run can be resumed from that file alone.

### Export before pruning {#export-before-pruning}

Use the same procedure for an embedded application's retention job and a Server
namespace. The selection and cleanup authority differ, as described below.

The examples were checked with published PHP Server **2.9.5**, its loaded
Workflow **2.6.2**, and normally installed Python SDK **2.6.1**. The
[published-artifact verification](https://github.com/durable-workflow/durable-workflow.github.io/issues/276#issuecomment-6285271861)
covered close-time pagination, individual run exports, checksums and structural
verification, archive/`forever` holds, and real `pruneRun()` cleanup. It did not
qualify a full application replay or restoration of external objects.

1. **Establish a safe window.** Run the exporter well inside the retention
   period, with time for retries, outages and a verification backlog. For
   example, a daily export with 30-day database retention leaves more recovery
   time than a job that first runs on day 30. Before a first export or policy
   reduction, temporarily protect the source: pause the embedded cleanup job,
   or use Server's `forever` policy. Record the previous policy and restore it
   only after verification. Cleanup may run as soon as a run becomes eligible.
2. **Inventory closed runs.** Record a fixed UTC upper boundary and select
   `closed_at` values earlier than it. Export every run, including failed,
   cancelled, terminated and continued-as-new predecessors. A workflow instance
   may have several runs. Keep namespace, instance id, run id and close time
   for every candidate, and follow all result pages.
3. **Export a specific run.** Use the run-scoped endpoint or command below,
   rather than exporting whichever run is current when the job happens to run.
   Keep candidate exports separate from previously verified copies.
4. **Verify the stored copy.** Read it back from the destination. Check its
   run identity against the namespace-scoped inventory, schema version, expected final history sequence,
   complete event range, redaction policy and integrity checksum. Verify any
   configured signature with a trusted key. Preserve the exact application
   build and codecs needed for a cold replay check. A checksum proves that
   bytes match, not that the history was complete when exported.
5. **Preserve external bytes.** Exports retain external reference envelopes,
   not an independent copy of every referenced object. Preserve those bytes
   for the export's lifetime and test retrieval without a warm runtime cache.
   Follow the [external payload lifecycle](../features/external-payload-storage.md#replay-retention-and-cleanup).
6. **Reconcile before cleanup.** Compare the closed-run inventory with verified
   destination records. Alert on missing run ids, failed verification and an
   export backlog approaching the cutoff. Advance the export checkpoint only
   after every candidate is accounted for. Re-scan overlapping close-time
   windows and deduplicate by namespace and run id. Do not overwrite a verified
   full bundle with a later incomplete export.

These are application-owned steps, not a supported self-contained archive
operation. [Server #520](https://github.com/durable-workflow/server/issues/520)
tracks the missing product workflow that copies, retains and cold-verifies all
required external bytes. A successful reference-only export or manual checksum
check does not complete that requirement.

:::warning Pruning is irreversible without a recovery copy

An export after pruning cannot reconstruct deleted events. The published export
implementation can still label a terminal pruned run `history_complete: true`,
and may reuse its earlier `dedupe_key`. This is tracked in
[Workflow #856](https://github.com/durable-workflow/workflow/issues/856).
Do not trust either field as proof that cleanup has not occurred. Embedded
export jobs must reject runs with `details_pruned_at` set. A Server list stops
showing a run after its summary is pruned, so an inventory started after cleanup
cannot establish that every older run was captured. Keep the pre-prune inventory
and investigate gaps from a recovery copy.

:::

### Selecting and exporting Server runs {#selecting-and-exporting-server-runs}

The workflow list supports `CloseTime` comparisons through its `query`
parameter. This example selects a fixed half-open UTC interval:

```bash
curl --fail-with-body --get "$DURABLE_WORKFLOW_SERVER_URL/api/workflows" \
  -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  --data-urlencode "query=CloseTime >= '2026-10-01T00:00:00Z' AND CloseTime < '2026-10-02T00:00:00Z'" \
  --data-urlencode "page_size=200"
```

Read each entry's `workflow_id`, `run_id` and `closed_at` from `workflows`.
Repeat the same request with `next_page_token` until the response returns
`next_page_token: null`. Do not filter only `status=completed`, which would
miss failed and other terminal outcomes. Keep the selected window unchanged
while paging, and prevent cleanup from deleting its summaries during capture.

For each selected pair, export and store its bundle:

```bash
curl --fail-with-body "$DURABLE_WORKFLOW_SERVER_URL/api/workflows/$WORKFLOW_ID/runs/$RUN_ID/history/export" \
  -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  --output "$RUN_ID.candidate.json"
```

The [Server retention policy](../polyglot/server.md#retention) determines when
automatic cleanup can act. Once all required copies are verified, restore the
intended bounded policy. Review capacity before using `forever` for an extended
export outage. Archived runs remain protected independently of that policy.

### Selecting and exporting embedded runs {#selecting-and-exporting-embedded-runs}

Use the configured run model to select unpruned, closed runs by `closed_at`.
The following query produces the candidate inventory, not an automatic exporter:

```php
use Workflow\V2\Models\WorkflowRun;
use Workflow\V2\Support\ConfiguredV2Models;

$runs = ConfiguredV2Models::query('run_model', WorkflowRun::class)
    ->whereNull('details_pruned_at')
    ->whereNotNull('closed_at')
    ->where('closed_at', '>=', $fromUtc)
    ->where('closed_at', '<', $untilUtc)
    ->orderBy('id')
    ->lazyById(100);

foreach ($runs as $run) {
    // Persist the candidate run id and close time in your export inventory.
}
```

Export each selected run with the application's normal bootstrap and storage
configuration:

```bash
php artisan workflow:v2:history-export "$WORKFLOW_ID" --run-id="$RUN_ID" --output="$RUN_ID.candidate.json" --pretty
php artisan workflow:v2:replay-verify "$RUN_ID.candidate.json" --skip-replay --json
```

`--skip-replay` checks integrity and structure without executing a replay. It
does not prove that external bytes remain available or that the artifact was
captured before pruning. Test a representative full replay separately with
the intended application build. Your cleanup job can call `pruneRun()` only
after its retention and export requirements are satisfied. A successful export
does not automatically authorize deletion.

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
