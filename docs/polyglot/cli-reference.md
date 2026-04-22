---
sidebar_position: 4
title: CLI Command Reference
description: Reference for Durable Workflow CLI commands, stable output modes, common options, and failure behavior.
tags:
  - CLI
  - reference
  - control-plane
  - automation
keywords:
  - dw command reference
  - CLI output
  - bridge webhook
  - workflow command
---

# CLI Command Reference

This page documents the v2 `dw` command surface as an operator and automation
contract. Use the [CLI guide](/docs/2.0/polyglot/cli) for installation and
profile setup; use this page when wiring scripts, CI jobs, runbooks, or AI
agents to exact command shapes.

All server-backed commands target the standalone server control-plane protocol
version `2`. The CLI validates the server-published protocol manifests before
trusting canonical request and response fields.

## Global Options

Server-backed commands accept these options unless noted otherwise.

| Option | Meaning |
| --- | --- |
| `--server`, `-s` | Server base URL. Overrides profiles and environment variables for this invocation. |
| `--namespace` | Target namespace. Overrides the profile namespace. |
| `--token` | Bearer token for this invocation. Prefer profiles with `--token-env` for stored automation. |
| `--env` | Named CLI environment profile. Unknown profile names fail instead of falling back. |
| `--output=table|json|jsonl` | Output contract. `table` is human-readable, `json` is one JSON document, and `jsonl` is one JSON object per line for list commands. |
| `--json` | Command-local alias for JSON output on commands that expose it. |

Commands that accept caller payloads use one shared input contract:

| Option | Meaning |
| --- | --- |
| `--input`, `-i` | Inline input document. |
| `--input-file` | Read input from a file, or `-` for stdin. Mutually exclusive with `--input`. |
| `--input-encoding=json|raw|base64` | Decode input as JSON, pass raw text as one argument, or decode base64 as one argument. Defaults to `json`. |

JSON input for workflow starts, signals, queries, updates, schedules, and
activity completions represents the v2 positional argument array. Raw and
base64 input become one positional argument so the server still receives the
canonical `input` array.

## Connection And Diagnostics

| Command | Purpose | Important options |
| --- | --- | --- |
| `dw --version` | Print CLI build identity. When `DW_ENV` or `DURABLE_WORKFLOW_SERVER_URL` selects a target, also performs a short compatibility probe. | `-V`, `--version` |
| `dw server:health` | Check server health and auth reachability. | global options, `--json` |
| `dw server:info` | Show server version, protocol manifests, request contract, worker protocol, and compatibility metadata. | global options, `--json` |
| `dw doctor` | Explain the resolved profile/server/token/TLS state, remote compatibility warnings, and next steps. | global options, `--json` |
| `dw debug workflow <workflow-id>` | Capture stuck-run diagnostics for one workflow: state, pending tasks, queue facts, failures, and compatibility metadata. | `--run-id`, global options, `--json` |
| `dw server:start-dev` | Start a local development server for smoke work. | `--port`, `--db=sqlite|mysql|pgsql` |
| `dw watch workflow <workflow-id>` | Poll a workflow until terminal or until a configured polling limit. | `--run-id`, `--interval`, `--max-polls`, global options |

Use `server:info` when validating contract shape, `doctor` when explaining why
a CLI cannot talk to a server, and `debug workflow` when support needs one
machine-readable run capture.

## Environment Profiles

Profiles live under `~/.config/dw/config.json`, or
`$XDG_CONFIG_HOME/dw/config.json` when set. Set `DW_CONFIG_HOME` to isolate a
test or CI profile directory.

| Command | Purpose | Important options |
| --- | --- | --- |
| `dw env:set <name>` | Create or update a named profile. | `--server`, `--namespace`, `--token-env`, `--token`, `--tls-verify=true|false`, `--profile-output=table|json|jsonl`, `--make-default`, `--json` |
| `dw env:list` | List profiles with literal tokens redacted by default. | `--show-token`, `--json`, `--output=jsonl` |
| `dw env:show [name]` | Show one profile, defaulting to the current profile. | `--show-token`, `--json` |
| `dw env:use <name>` | Set the default profile. Unknown names fail. | `--json` |
| `dw env:delete <name>` | Delete a profile. | `--json` |

Prefer `--token-env=NAME` for production profiles so secrets stay in the
runtime environment and not in the profile file.

## Workflow Commands

| Command | Purpose | Important options |
| --- | --- | --- |
| `dw workflow:start` | Start a workflow through the control plane. | `--type`, `--workflow-id`, `--business-key`, `--task-queue`, `--duplicate-policy`, `--memo`, `--search-attr key=value`, `--execution-timeout`, `--run-timeout`, `--wait`, input options, `--json` |
| `dw workflow:list` | List workflow instances. | `--type`, `--status`, `--query`, `--limit`, global output options |
| `dw workflow:describe <workflow-id>` | Describe the current or selected run. | `--run-id`, `--follow`, `--json` |
| `dw workflow:list-runs <workflow-id>` | List runs for a workflow instance. | `--json` |
| `dw workflow:show-run <workflow-id> <run-id>` | Show one run. | `--follow`, `--json` |
| `dw workflow:history <workflow-id> <run-id>` | Read run history events. | `--follow`, `--page-size`, `--json` |
| `dw workflow:history-export <workflow-id> <run-id>` | Export the archival run-history payload. | `--output-file`, global options |
| `dw workflow:signal <workflow-id> <signal-name>` | Send a signal. | `--run-id`, input options, `--json` |
| `dw workflow:query <workflow-id> <query-name>` | Execute a read-only workflow query. | `--run-id`, input options, `--json` |
| `dw workflow:update <workflow-id> <update-name>` | Submit or execute a workflow update. | `--wait=accepted|completed`, `--run-id`, input options, `--json` |
| `dw workflow:cancel [workflow-id]` | Request cancellation for one workflow or a batch query. | `--reason`, `--run-id`, `--all-matching`, `--type`, `--status`, `--limit`, `--yes`, `--json` |
| `dw workflow:terminate <workflow-id>` | Force terminate a workflow. | `--reason`, `--run-id`, `--json` |
| `dw workflow:repair <workflow-id>` | Ask the server to repair a stuck or retryable run. | `--json` |
| `dw workflow:archive <workflow-id>` | Archive a closed run. | `--reason`, `--json` |

Examples:

```bash
dw workflow:start \
  --type=App\\Workflows\\ProcessOrder \
  --workflow-id=order-123 \
  --task-queue=payments \
  --input='["order-123"]' \
  --json

dw workflow:update order-123 approve --wait=completed --input='["manager"]'
dw workflow:cancel --all-matching='WorkflowType = "ImportJob"' --limit=25 --yes
```

`workflow:start`, `workflow:signal`, `workflow:query`, and `workflow:update`
validate canonical request fields against the server-published request
contract. Non-canonical legacy aliases are rejected before the request is sent.

## Bridge Adapter Commands

Bridge commands are bounded ingress and handoff tools for integration events.
They call the server bridge-adapter surface and return the
`durable-workflow.v2.bridge-adapter-outcome.contract` shape in JSON mode.
They do not execute workflow code or own workflow state transitions.

| Command | Purpose | Important options |
| --- | --- | --- |
| `dw bridge:webhook <adapter>` | Send one webhook bridge event that starts, signals, or updates a workflow through the control plane. | `--action=start_workflow|signal_workflow|update_workflow`, `--idempotency-key`, `--target`, input options, `--correlation`, `--json` |

Examples:

```bash
dw bridge:webhook stripe \
  --action=start_workflow \
  --idempotency-key=stripe-event-1001 \
  --target='{"workflow_type":"orders.fulfillment","task_queue":"external-workflows","business_key":"order-1001"}' \
  --input='{"order_id":"order-1001"}' \
  --json

dw bridge:webhook pagerduty \
  --action=signal_workflow \
  --idempotency-key=pd-event-3003 \
  --target='{"workflow_id":"wf-remediation-42","signal_name":"incident_escalated"}' \
  --input='{"severity":"critical"}'
```

Use the bridge outcome fields instead of inferring behavior from HTTP status
alone. `outcome`, `reason`, `control_plane_outcome`, `idempotency_key`, and
the redacted `target` summary are the automation contract for duplicates,
routing misses, malformed payloads, and accepted handoffs.

## Schedule Commands

| Command | Purpose | Important options |
| --- | --- | --- |
| `dw schedule:create` | Create a schedule. | `--schedule-id`, `--workflow-type`, `--cron`, `--interval`, `--task-queue`, `--timezone`, `--execution-timeout`, `--run-timeout`, `--overlap-policy`, `--jitter`, `--max-runs`, `--paused`, `--note`, input options, `--json` |
| `dw schedule:list` | List schedules. | global output options |
| `dw schedule:describe <schedule-id>` | Describe one schedule. | `--json` |
| `dw schedule:update <schedule-id>` | Update schedule spec or workflow input. | schedule create options, input options, `--json` |
| `dw schedule:pause <schedule-id>` | Pause a schedule. | `--note`, `--json` |
| `dw schedule:resume <schedule-id>` | Resume a schedule. | `--note`, `--json` |
| `dw schedule:trigger <schedule-id>` | Trigger a schedule immediately. | `--overlap-policy`, `--json` |
| `dw schedule:backfill <schedule-id>` | Backfill a time window. | `--start-time`, `--end-time`, `--overlap-policy`, `--json` |
| `dw schedule:delete <schedule-id>` | Delete a schedule. | `--json` |

Use either `--cron` or `--interval` when creating interval-based schedules.
Use `--paused` for deploy-time registration that should not start work yet.

## Worker And Task Queue Commands

| Command | Purpose | Important options |
| --- | --- | --- |
| `dw worker:register [worker-id]` | Register a worker with capacity and compatibility metadata. | `--task-queue`, `--runtime`, `--sdk-version`, `--build-id`, `--workflow-type`, `--activity-type`, `--max-workflow-tasks`, `--max-activity-tasks`, `--json` |
| `dw worker:list` | List workers. | `--task-queue`, `--status`, global output options |
| `dw worker:describe <worker-id>` | Describe one worker. | `--json` |
| `dw worker:deregister <worker-id>` | Deregister one worker. | `--json` |
| `dw task-queue:list` | List active task queues and admission status. | global output options |
| `dw task-queue:describe <queue>` | Describe worker capacity, leases, dispatch budgets, and pending query-task capacity. | `--json` |

The task queue commands are the preferred operator view for throttling,
capacity, and no-worker diagnoses. See
[Task Queue Admission](/docs/2.0/polyglot/task-queue-admission) for the
server-side policy behind those fields.

## Worker Protocol Commands

These commands are low-level protocol tools for diagnostics, smoke tests, and
non-SDK worker experiments. Normal PHP and Python workers should use their SDK
worker loops.

| Command | Purpose | Important options |
| --- | --- | --- |
| `dw workflow-task:poll <worker-id>` | Poll one workflow task. | `--task-queue`, `--build-id`, `--poll-request-id`, `--history-page-size`, `--accept-history-encoding`, `--json` |
| `dw workflow-task:history <task-id> <page-token>` | Fetch the next history page for a leased workflow task. | `--lease-owner`, `--attempt`, `--json` |
| `dw workflow-task:complete <task-id> <attempt>` | Complete one workflow task with command payloads. | `--lease-owner`, `--complete-result`, `--command`, `--json` |
| `dw activity:complete <task-id> <attempt-id>` | Complete one leased activity attempt. | `--lease-owner`, input options, `--json` |
| `dw activity:fail <task-id> <attempt-id>` | Fail one leased activity attempt. | `--lease-owner`, `--message`, `--type`, `--non-retryable`, `--json` |

### Workflow Task History Pages

`workflow-task:history` is the CLI diagnostic wrapper around the worker-plane
history-page endpoint. Use it only after `workflow-task:poll` returns a leased
workflow task with `next_history_page_token`; normal workers should let their
SDK fetch extra history pages.

```bash
dw workflow-task:history workflow-task-01 history-page-2 \
  --lease-owner=python-worker-1 \
  --attempt=2 \
  --json
```

JSON output is the server response without field renaming:

```json
{
  "history_events": [
    {"event_id": 2, "event_type": "ActivityScheduled", "payload": {}}
  ],
  "total_history_events": 4,
  "next_history_page_token": "history-page-3"
}
```

Automation should read `history_events`, `total_history_events`, and
`next_history_page_token`. The worker-history endpoint does not use the
control-plane run-history fields `events` or `next_page_token`.

## Namespace And Search Attribute Commands

| Command | Purpose | Important options |
| --- | --- | --- |
| `dw namespace:list` | List namespaces. | global output options |
| `dw namespace:create <name>` | Create a namespace. | `--description`, `--retention`, `--json` |
| `dw namespace:describe <name>` | Describe one namespace. | `--json` |
| `dw namespace:update <name>` | Update namespace metadata. | `--description`, `--retention`, `--json` |
| `dw namespace:set-storage-driver <name> <driver>` | Configure the namespace external payload storage policy used when encoded payloads exceed the offload threshold. | `--threshold-bytes`, `--uri`, `--bucket`, `--prefix`, `--region`, `--endpoint`, `--auth-profile`, `--disable`, `--json` |
| `dw storage:test` | Round-trip a small inline payload and a large offloaded payload through the selected namespace storage policy or driver override. | `--driver=local|s3|gcs|azure`, `--small-bytes`, `--large-bytes`, global options, `--json` |
| `dw search-attribute:list` | List search attributes. | global output options |
| `dw search-attribute:create <name> <type>` | Register a search attribute. | `--json` |
| `dw search-attribute:delete <name>` | Delete a search attribute. | `--json` |

Search attribute types are server-compatible values such as `keyword`, `text`,
`int`, `double`, `bool`, `datetime`, and `keyword_list`.

External payload storage commands call the server's namespace storage API. The
driver argument is one of `local`, `s3`, `gcs`, or `azure`; object-store drivers
use server-side filesystem configuration, so CLI flags describe the namespace
policy rather than carrying provider credentials. Use `--disable` to keep the
policy record while preventing new offloads.

Examples:

```bash
dw namespace:set-storage-driver billing s3 \
  --bucket=dw-payloads \
  --prefix=billing/ \
  --threshold-bytes=2097152 \
  --json

dw namespace:set-storage-driver dev local \
  --uri=file:///var/lib/durable-workflow/payloads

dw storage:test --namespace=billing --large-bytes=2097152 --json
dw storage:test --driver=s3 --small-bytes=128 --large-bytes=3145728 --json
```

In JSON mode, `namespace:set-storage-driver` returns the namespace payload with
its `external_payload_storage` policy. `storage:test` returns the diagnostic
status plus `small_payload` and `large_payload` result objects; automation
should branch on those fields instead of parsing the human table.

## System Commands

System commands expose server maintenance passes as explicit, scriptable
operations.

| Command | Purpose | Important options |
| --- | --- | --- |
| `dw system:repair-status` | Show workflow repair backlog/status. | `--json` |
| `dw system:repair-pass` | Run one repair pass. | `--run-id`, `--limit`, `--json` |
| `dw system:activity-timeout-status` | Show activity timeout backlog/status. | `--json` |
| `dw system:activity-timeout-pass` | Run one activity timeout pass. | `--task-id`, `--limit`, `--json` |
| `dw system:retention-status` | Show retention backlog/status. | `--json` |
| `dw system:retention-pass` | Run one retention cleanup pass. | `--run-id`, `--limit`, `--json` |

Prefer status commands before pass commands in runbooks so operators can see
the pending scope before mutating server state.

## Schema Commands

| Command | Purpose | Important options |
| --- | --- | --- |
| `dw schema:list` | List published machine-readable schemas. | no server connection required |
| `dw schema:show <command-name>` | Show the bundled JSON Schema for one command output. | no server connection required |
| `dw schema:manifest` | Show the schema manifest. | no server connection required |

Schema commands are useful when an AI client or CI job needs the current
control-plane, response, or output contract without scraping prose docs.

## Output And Exit Contract

Use `--output=json` when a command returns one object and `--output=jsonl` when
a list command feeds a stream processor. Human tables are allowed to improve
over time; JSON field names are the automation contract.

All commands use the stable exit-code policy documented in the
[CLI guide](/docs/2.0/polyglot/cli#exit-codes):

| Code | Meaning |
| --- | --- |
| `0` | Success. |
| `1` | Command ran but failed generically. |
| `2` | Invalid local usage or validation error. |
| `3` | Network or transport failure. |
| `4` | Authentication or authorization failure. |
| `5` | Resource not found. |
| `6` | Server-side `5xx` failure. |
| `7` | Timeout. |

For support bundles, collect `dw doctor --output=json`, `dw server:info
--output=json`, and `dw debug workflow <workflow-id> --output=json`.

## Related Guides

- [CLI](./cli.mdx) covers installation, profile setup, and exit-code behavior.
- [Server](./server.md) documents the HTTP control plane that server-backed
  commands call.
- [CLI and Python Parity](./cli-python-parity.md) compares shared request
  fixtures across CLI and SDK clients.
