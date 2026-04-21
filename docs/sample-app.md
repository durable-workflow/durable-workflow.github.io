---
sidebar_position: 8
---

# Sample App

https://github.com/durable-workflow/sample-app

This is a sample Laravel 13 application built on Durable Workflow 2.0 (alpha) with example workflows that you can run inside a GitHub codespace.

> Looking for the Laravel 12 / Durable Workflow 1.x version? It's preserved on the [`Laravel-12` branch](https://github.com/durable-workflow/sample-app/tree/Laravel-12). Older blog posts and tutorials that reference v1 patterns (e.g. `Workflow\Workflow`, `yield activity(...)`, `Workflow\Activity`) target that branch.

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

The sample app's `php artisan migrate` path picks up the workflow and Waterline package migrations directly, so all tables and Waterline saved views are ready after the normal install.

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

The export includes a SHA-256 integrity checksum. Set `DW_V2_HISTORY_EXPORT_SIGNING_KEY` and `DW_V2_HISTORY_EXPORT_SIGNING_KEY_ID` in the app environment when another system needs to verify the exported bundle with an HMAC signature.

The exported `selected_run` block includes `waits_projection_source`, `timeline_projection_source`, `timers_projection_source`, and `lineage_projection_source`. The exported `links` block also includes `projection_source`, and the `links.parents` / `links.children` sections come from the selected run's typed lineage history first, so child-workflow and continue-as-new relationships remain visible in the bundle even if mutable link rows have drifted during a local experiment. When a lineage row is surviving only through older mutable compatibility data, the bundle now marks that entry with `history_authority = mutable_open_fallback` and `diagnostic_only = true` instead of silently rehydrating extra link metadata during export.

**Step 10**

Run the workflow and activity tests.

```bash
vendor/bin/phpunit
```

That's it! You can now create and test workflows.

## AI Client MCP Server

The sample app also exposes a Laravel MCP server at `/mcp/workflows`. This is the reference AI-client surface for Durable Workflow v2: it gives agents structured workflow discovery, start, status, output, recent typed history, and failure facts without requiring them to scrape Waterline.

The MCP server is registered from `routes/ai.php` by the Laravel MCP package. The exposed workflow keys live in `config/workflow_mcp.php`; each entry can include the workflow class plus discovery metadata such as a description, credential requirements, and expected arguments.

Default tools:

| Tool | Purpose |
| --- | --- |
| `list_workflows` | Lists configured workflow keys, credential requirements, v2 status values, and optionally recent runs. |
| `start_workflow` | Starts a configured v2 workflow and returns `workflow_id`, `run_id`, status, business key, and command outcome. |
| `get_workflow_result` | Polls the current or selected run and returns status, output, visibility metadata, and latest failure summary. |
| `get_workflow_history` | Returns a bounded tail of typed v2 history events and latest durable failures for debugging. |

A typical agent loop is:

```json
{"tool": "list_workflows", "arguments": {"show_recent": true, "limit": 5}}
{"tool": "start_workflow", "arguments": {"workflow": "simple", "business_key": "demo-001"}}
{"tool": "get_workflow_result", "arguments": {"workflow_id": "<workflow_id>"}}
{"tool": "get_workflow_history", "arguments": {"run_id": "<run_id>", "limit": 25}}
```

Use `simple` or `elapsed` for no-credential smoke tests. The `prism` workflow is intentionally exposed as an AI example, but it requires `OPENAI_API_KEY` before a worker can complete it.
