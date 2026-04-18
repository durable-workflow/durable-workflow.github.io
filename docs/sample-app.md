---
sidebar_position: 9
---

# Sample App

https://github.com/durable-workflow/sample-app

This is a sample Laravel 12 application with example workflows that you can run inside a GitHub codespace.

**Step 1**

Create a codespace from the main branch of this repo.

![image](https://user-images.githubusercontent.com/1130888/233664377-f300ad50-5436-4bb8-b172-c52e12047264.png)

**Step 2**

Once the codespace has been created, wait for the codespace to build. This should take between 5 to 10 minutes.

**Step 3**

Once it is done. You will see the editor and the terminal at the bottom.

![image](https://user-images.githubusercontent.com/1130888/233665550-1a4f2098-2919-4108-ac9f-bef1a9f2f47c.png)

**Step 4**

Run composer install.

```bash
composer install
```

**Step 5**

Run the init command to setup the app, install extra dependencies and run the migrations.

```bash
php artisan app:init
```

The sample app's normal `php artisan migrate` path now picks up the workflow and Waterline package migrations directly, so you do not need a separate workflow migration publish step before the examples, Waterline's tables, or Waterline saved views are available.

Waterline defaults `engine_source` to `auto`, so published `config/waterline.php` snapshots switch onto the operator bridge automatically once the workflow package's full operator surface is installed. That means `/waterline/api/instances/...`, selected-run history export, dashboard `operator_metrics`, saved views, and `/waterline/api/stats` are available by default in the checked-out sample app after the normal install and migrate path. The stats payload also includes an `engine_source` object that reports the configured mode, resolved mode, surfaced readiness issues, required-table inspection results, and the versioned `readiness_contract` that explains the boot/install, dispatch, claim, stats, and health gates Waterline is applying.

Current v2 installs write command contracts, signal/update lifecycle rows, and typed failure metadata as part of the normal runtime path. `WorkflowStarted` history is the source of truth for declared query, signal, update, and entrypoint metadata; Waterline reports `declared_contract_source = durable_history` when that final snapshot is present and `declared_contract_source = unavailable` when an imported run is missing it. Rebuild projections when list, wait, timeline, timer, or lineage rows drift from durable runtime state:

```bash
php artisan workflow:v2:rebuild-projections --needs-rebuild --prune-stale
```

If selected-run wait, history, timer, or lineage detail reports a `*_projection_source` ending in `_rebuilt`, or the dashboard reports non-zero `operator_metrics.projections.run_waits.needs_rebuild`, `operator_metrics.projections.run_timeline_entries.needs_rebuild`, `operator_metrics.projections.run_timer_entries.needs_rebuild`, or `operator_metrics.projections.run_lineage_entries.needs_rebuild`, rebuild the projections once so Waterline reads `workflow_run_waits`, `workflow_run_timeline_entries`, `workflow_run_timer_entries`, and `workflow_run_lineage_entries` rows for the sample data. Timer detail and history export also expose `timers_projection_rebuild_reasons`, so a rebuilt timer projection can tell you whether the read repaired `missing_projection`, `stale_projection`, or `schema_version_mismatch` rows before you decide whether one targeted rebuild pass is enough. `--needs-rebuild` covers stale selected-run wait, timeline, timer, and lineage payloads as well as missing or orphaned rows, including timer projection rows whose stored schema version does not match the current contract. The operator dashboard breaks that timer drift back out as `operator_metrics.projections.run_timer_entries.schema_version_mismatch_runs` and `schema_version_mismatch_rows`, so you can confirm whether the targeted rebuild is still needed:

```bash
php artisan workflow:v2:rebuild-projections --needs-rebuild
```

**Step 6**

Start the queue worker. This will enable the processing of workflows and activities.

```bash
php artisan queue:work
```

When you want to prove the repair loop itself without waiting for a busy queue worker to hit another `Looping` cycle, run one explicit recovery sweep from a second terminal:

```bash
php artisan workflow:v2:repair-pass
```

That command uses the same scan and backoff policy as the worker loop. It is useful after fixing a local queue/backend issue, while validating a lost-task scenario in the sample app, or when a low-traffic codespace would otherwise take a while to hit another loop pass. Add `--run-id=...` to limit the sweep to one or more selected runs during an experiment, or `--instance-id=...` when the whole instance should stay in scope.

**Step 7**

Create a new terminal window.

![image](https://user-images.githubusercontent.com/1130888/233666917-029247c7-9e6c-46de-b304-27473fd34517.png)

**Step 8**

Start the example workflow inside the new terminal window.

```bash
php artisan app:workflow
```

**Step 9**

You can view the waterline dashboard at https://[your-codespace-name]-80.preview.app.github.dev/waterline/dashboard.

![image](https://user-images.githubusercontent.com/1130888/233669600-3340ada6-5f73-4602-8d82-a81a9d43f883.png)

Waterline's detail screen includes an "Export History" action for the selected run. When the detail screen is showing the instance's current run, that button uses the instance-scoped current-run export route; historical run detail keeps using the explicit `/runs/{runId}/history-export` path. You can also export the same replay/debug bundle from the sample app terminal:

```bash
php artisan workflow:v2:history-export {workflow-instance-id} --run-id={workflow-run-id} --output=storage/app/workflow-history/example.json --pretty
```

The export includes a SHA-256 integrity checksum. Set `WORKFLOW_V2_HISTORY_EXPORT_SIGNING_KEY` and `WORKFLOW_V2_HISTORY_EXPORT_SIGNING_KEY_ID` in the app environment when another system needs to verify the exported bundle with an HMAC signature.

The exported `selected_run` block includes `waits_projection_source`, `timeline_projection_source`, `timers_projection_source`, and `lineage_projection_source`. The exported `links` block also includes `projection_source`, and the `links.parents` / `links.children` sections come from the selected run's typed lineage history first, so child-workflow and continue-as-new relationships remain visible in the bundle even if mutable link rows have drifted during a local experiment. When a lineage row is surviving only through older mutable compatibility data, the bundle now marks that entry with `history_authority = mutable_open_fallback` and `diagnostic_only = true` instead of silently rehydrating extra link metadata during export.

**Step 10**

Run the workflow and activity tests.

```bash
php artisan test
```

That's it! You can now create and test workflows.
