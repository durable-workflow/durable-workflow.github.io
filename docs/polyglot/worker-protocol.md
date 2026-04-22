---
sidebar_position: 5
title: Worker Protocol
description: Implement the versioned worker-plane protocol for polling, leasing, history replay, heartbeats, completion, and external task results.
tags:
  - worker-protocol
  - external-workers
  - polyglot
keywords:
  - worker protocol
  - external worker polling
  - workflow task bridge
---

# Worker Protocol

Durable Workflow exposes a versioned worker protocol through two bridge contracts. These contracts define the complete set of verbs that external workers — including the standalone Durable Workflow server — use to poll, claim, execute, and complete workflow and activity tasks.

## Protocol Version

The current protocol version is **1.0**. The protocol follows semver-style numbering:

- **Major** bumps when a change is backwards-incompatible (new required fields, removed verbs, changed pagination semantics).
- **Minor** bumps for additive changes (new optional fields, new non-terminal command types).

You can retrieve the full protocol description programmatically:

```php
use Workflow\V2\Support\WorkerProtocolVersion;

$summary = WorkerProtocolVersion::describe();
// Returns version, verb lists, command types, and pagination defaults.
```

## Capability Discovery

The standalone server publishes worker-protocol capabilities under
`worker_protocol.server_capabilities` in `GET /api/cluster/info`. The same
object is echoed as `server_capabilities` on worker-plane responses, including
poll, heartbeat, complete, and fail responses.

Read these fields before sending optional command fields:

- `supported_workflow_task_commands`: command types accepted by workflow-task completion.
- `activity_retry_policy` and `activity_timeouts`: activity command retry and timeout options.
- `child_workflow_retry_policy` and `child_workflow_timeouts`: child workflow retry and timeout options.
- `parent_close_policy`: child workflow parent-close policy support.
- `query_tasks`: server-routed workflow query tasks for external runtimes.
- `non_retryable_failures`: workflow and activity failure metadata support.

## Workflow Task Bridge

The `WorkflowTaskBridge` contract defines how an external worker interacts with durable workflow tasks:

| Verb | Description |
|------|-------------|
| `poll` | Find ready workflow tasks matching queue and compatibility criteria |
| `claim` / `claimStatus` | Claim a specific task, acquiring a 5-minute lease |
| `historyPayload` | Retrieve the full replay history for a claimed task |
| `historyPayloadPaginated` | Retrieve history in pages for large workflows |
| `execute` | Claim and execute a task in-process using the package executor |
| `complete` | Submit commands from an external worker to complete a task |
| `fail` | Record a task failure from an external worker |
| `heartbeat` | Extend the lease on a claimed task |

### Paginated History

For workflows with large histories, use `historyPayloadPaginated` to retrieve events in pages:

```php
use Workflow\V2\Contracts\WorkflowTaskBridge;

$bridge = app(WorkflowTaskBridge::class);

$afterSequence = 0;
$allEvents = [];

do {
    $page = $bridge->historyPayloadPaginated($taskId, $afterSequence, 500);
    $allEvents = array_merge($allEvents, $page['history_events']);
    $afterSequence = $page['next_after_sequence'] ?? $afterSequence;
} while ($page['has_more']);
```

The default page size is 500 events (matching `WorkerProtocolVersion::DEFAULT_HISTORY_PAGE_SIZE` and the `default_history_page_size` value the server publishes in its worker-protocol capabilities); the maximum is 1000. Servers can advertise a different effective default through the worker-protocol manifest, so prefer reading the published capability over hard-coding either number. The response includes `has_more` and `next_after_sequence` for cursor-based pagination.

### History Compression

For workflows with very large histories, the bridge or server can compress the history events payload to reduce transfer size. Compression is opt-in: the caller must request it via an `Accept-Encoding`-style parameter.

When the event count in a response exceeds the compression threshold (50 events), the bridge may return:

- `history_events`: `[]` (empty array, signalling events are in the compressed key)
- `history_events_compressed`: base64-encoded compressed payload
- `history_events_encoding`: the algorithm used (`gzip` or `deflate`)

The caller decompresses by decoding base64, inflating with the indicated algorithm, and JSON-decoding the result to recover the original `history_events` array.

```php
use Workflow\V2\Support\HistoryPayloadCompression;

// Compress a history payload for transfer (bridge/server side).
$compressed = HistoryPayloadCompression::compress($payload, 'gzip');

// Decompress on the worker side.
$original = HistoryPayloadCompression::decompress($compressed);
```

If the caller does not request compression, or the event count is below the threshold, the response contains the standard uncompressed `history_events` array.

### Long-Poll Semantics

Both `poll` verbs support an optional long-poll mode. When the caller includes a `timeout_seconds` parameter, the bridge or server holds the connection open for up to that duration waiting for a matching task to become ready, instead of returning an empty result immediately.

| Parameter | Default | Min | Max |
|-----------|---------|-----|-----|
| `timeout_seconds` | 30 | 1 | 60 |

Behavior:

- If a task becomes ready during the wait, it is returned immediately.
- If the timeout expires with no task, the response is an empty list.
- The client should retry immediately on an empty long-poll response unless shutting down.
- HTTP-level timeouts on the transport should be set above 60 seconds to avoid premature disconnects.

```php
use Workflow\V2\Support\WorkerProtocolVersion;

$semantics = WorkerProtocolVersion::longPollSemantics();
// ['default_timeout_seconds' => 30, 'min_timeout_seconds' => 1, 'max_timeout_seconds' => 60]

// Clamp a caller-supplied timeout to the valid range.
$clamped = WorkerProtocolVersion::clampLongPollTimeout($userTimeout);
```

### Command Types

When completing a workflow task, the external worker submits a list of typed commands. At most one terminal command is allowed per completion.

**Non-terminal commands** (zero or more, processed in order):

| Type | Required Fields | Description |
|------|----------------|-------------|
| `schedule_activity` | `activity_type` | Schedule an activity task for execution |
| `start_timer` | `delay_seconds` | Schedule a durable timer |
| `start_child_workflow` | `workflow_type` | Start a child workflow instance |
| `complete_update` | `update_id` | Mark an accepted update as applied and completed |
| `fail_update` | `update_id`, `message` | Mark an accepted update as failed |
| `record_side_effect` | `result` | Record a deterministic side-effect result |
| `record_version_marker` | `change_id`, `version`, `min_supported`, `max_supported` | Record a versioning decision |
| `upsert_search_attributes` | `attributes` | Upsert indexed metadata on the workflow run |

`schedule_activity` accepts optional `retry_policy`, `start_to_close_timeout`,
`schedule_to_start_timeout`, `schedule_to_close_timeout`, and
`heartbeat_timeout` fields. `retry_policy` uses `max_attempts`,
`backoff_seconds`, and `non_retryable_error_types`.

`start_child_workflow` accepts optional `parent_close_policy`, `retry_policy`,
`execution_timeout_seconds`, and `run_timeout_seconds` fields.
`parent_close_policy` is one of `abandon`, `request_cancel`, or `terminate`.
Child retry policy uses the same `max_attempts`, `backoff_seconds`, and
`non_retryable_error_types` object shape as activities. Retry backoff applies
after a child run fails; invalid child start commands are protocol errors and
do not consume child retry attempts.

`complete_update` closes the accepted update named by `update_id` after the
worker applies the update handler. It accepts an optional `result` payload
using the same `{codec, blob}` envelope as workflow completion results.
`fail_update` closes the accepted update as failed and accepts optional
`exception_class`, `exception_type`, and `non_retryable` fields in addition to
the required `message`.

**Terminal commands** (at most one):

| Type | Required Fields | Description |
|------|----------------|-------------|
| `complete_workflow` | — | Mark the run as completed (optional `result`) |
| `fail_workflow` | `message` | Mark the run as failed |
| `continue_as_new` | — | Close the run and start a new one (optional `arguments`, `workflow_type`) |

If a cancel or terminate command closes the run while a workflow task is
leased, workflow-task `history`, `heartbeat`, `complete`, and `fail` calls keep
the worker-protocol envelope but reject with `reason: "run_closed"`. The
response also includes `can_continue: false`, `cancel_requested: true`, and a
concrete `stop_reason` such as `run_cancelled` or `run_terminated`, so workers
can distinguish cancellation observation from a generic lease error. The same
response includes `run_closed_reason` and `run_closed_at` from the durable run
record so workers can log the exact closure state that stopped the leased task.

Workflow-task poll responses include stable resume context copied from the
durable task payload:

| Field | Meaning |
|------|---------|
| `workflow_wait_kind` | The wait being applied by this task: `update`, `signal`, `child`, `condition`, `timer`, or `null` for ordinary replay/start tasks |
| `open_wait_id` | Stable wait identity such as `update:{id}` or `signal-application:{id}` |
| `resume_source_kind` / `resume_source_id` | Durable source that woke the task, such as `workflow_update`, `workflow_signal`, `timer`, or `child_workflow_run` |
| `workflow_update_id` | Accepted update id when the task applies an update |
| `workflow_signal_id` | Accepted signal id when the task applies a signal |
| `signal_name` / `signal_wait_id` | Signal target and stable wait identity when the task applies a signal or a timer-backed signal wait |
| `workflow_command_id` | Control-plane command id that produced the task, when available |
| `activity_execution_id` / `activity_attempt_id` / `activity_type` | Activity identifiers when the task resumes after a completed or failed activity |
| `child_call_id` / `child_workflow_run_id` | Child wait identifiers when the task resolves a child workflow |
| `timer_id` / `condition_wait_id` | Pure timer and timer-backed condition identifiers when the task resumes after a timer |
| `condition_key` / `condition_definition_fingerprint` | Stable condition label and predicate fingerprint when a timer-backed condition wait recorded them |
| `workflow_sequence` / `workflow_event_type` | History sequence and event type for event-backed activity, child, and timer resolution tasks |

Fields that do not apply are `null`. SDK workers should prefer these fields
over scanning history when they need to correlate a leased task with an
accepted update, signal, activity result, child resolution, or timer-backed
wait. Pure timer resumes set `workflow_wait_kind: "timer"`,
`open_wait_id: "timer:{timer_id}"`, `resume_source_kind: "timer"`, and
`timer_id`. Signal-backed resumes set `workflow_wait_kind: "signal"` plus
`signal_name`; accepted-signal application tasks also set `workflow_signal_id`
and timer-backed signal waits set `signal_wait_id` with the firing `timer_id`.
Condition-timeout resumes set `workflow_wait_kind: "condition"`,
`condition_wait_id`, and, for keyed waits, `condition_key` plus
`condition_definition_fingerprint`.

## Query Tasks

When a control-plane query targets a workflow whose code is owned by an
external runtime, the standalone server cannot replay that workflow in the PHP
process. Instead, it creates an ephemeral query task and waits for an active
non-PHP worker on the workflow's task queue to execute it.

Query tasks are read-only. Workers replay the supplied history, invoke the
registered query handler, and then complete or fail the query task. They do not
write durable history events and they are not retried after the caller's
control-plane query times out.

| Endpoint | Description |
|----------|-------------|
| `POST /api/worker/query-tasks/poll` | Long-poll for a query task on a worker's registered task queue |
| `POST /api/worker/query-tasks/{query_task_id}/complete` | Submit the query result |
| `POST /api/worker/query-tasks/{query_task_id}/fail` | Reject or fail the query |

Poll request:

```json
{
  "worker_id": "py-worker-1",
  "task_queue": "orders"
}
```

Poll response:

```json
{
  "task": {
    "query_task_id": "01J...",
    "query_task_attempt": 1,
    "workflow_id": "order-123",
    "run_id": "01J...",
    "workflow_type": "order-processing",
    "query_name": "status",
    "payload_codec": "avro",
    "workflow_arguments": { "codec": "avro", "blob": "<base64-avro-bytes>" },
    "query_arguments": { "codec": "avro", "blob": "<base64-avro-bytes>" },
    "history_events": [],
    "task_queue": "orders",
    "lease_owner": "py-worker-1",
    "lease_expires_at": "2026-04-18T12:00:00.000000Z"
  },
  "protocol_version": "1.0",
  "server_capabilities": { "query_tasks": true }
}
```

`task` is `null` when the poll times out. The worker must echo
`lease_owner` and `query_task_attempt` on completion or failure; stale attempts
and wrong lease owners are rejected.

Complete request:

```json
{
  "lease_owner": "py-worker-1",
  "query_task_attempt": 1,
  "result": { "status": "ready" },
  "result_envelope": { "codec": "avro", "blob": "<base64-avro-bytes>" }
}
```

Fail request:

```json
{
  "lease_owner": "py-worker-1",
  "query_task_attempt": 1,
  "failure": {
    "reason": "rejected_unknown_query",
    "message": "unknown query 'status'",
    "type": "QueryFailed"
  }
}
```

Use `reason: "rejected_unknown_query"` when the workflow type has no matching
query handler; the control-plane caller receives `404`. Other worker-side
query failures should use `reason: "query_rejected"` and return `409`.
If no active worker can accept the query, the control plane returns
`query_worker_unavailable`; if no result arrives before the configured timeout,
it returns `query_worker_timeout`.

## Activity Task Bridge

The `ActivityTaskBridge` contract defines how an external worker interacts with activity tasks:

| Verb | Description |
|------|-------------|
| `poll` | Find ready activity tasks matching queue and compatibility criteria |
| `claim` / `claimStatus` | Claim a specific activity task with lease |
| `complete` | Record activity completion with a result |
| `fail` | Record activity failure, with optional codec-tagged `failure.details` |
| `status` | Check liveness and cancellation state without renewing the lease |
| `heartbeat` | Extend the lease and report optional progress |

Activity heartbeat responses include `can_continue` and `cancel_requested`
fields, allowing long-running activities to respond to cancellation requests.
When a run-level cancel or terminate command stops a leased activity, heartbeat,
complete, and fail responses also include `run_closed_reason` and
`run_closed_at`.

## Payload Codecs

Every payload byte string that crosses the worker-protocol boundary is tagged with a **`payload_codec`** naming the format of the accompanying blob. v2 uses one language-neutral codec: **`avro`** — so any SDK (PHP, Python, Go, TypeScript, Rust) can encode and decode payloads without sharing a runtime or an app key. The running server advertises its codec support on `GET /api/cluster/info` under **`capabilities.payload_codecs`**.

### The `avro` codec

`avro` is the v2 payload codec. It is a compact Apache Avro binary encoding. The blob field on the wire carries the raw Avro bytes (typically transported as a base64-encoded string in JSON envelopes) and round-trips any Avro-representable value.

### Wire Format: Payload Envelope

On fields that carry payload bytes (`arguments`, `result`, `payload`, etc.), the worker protocol surfaces the codec alongside the opaque string. Poll responses look like:

```json
{
  "task_id": "...",
  "payload_codec": "avro",
  "arguments": {
    "codec": "avro",
    "blob": "<base64-avro-bytes>"
  },
  "history_events": [ ... ]
}
```

The worker reads `payload_codec` and confirms it is `avro` before decoding. An unrecognised codec value is an error — the worker should not attempt to sniff or guess.

Activity completions send `result` as the same `{codec, blob}` envelope. Activity failures may send structured diagnostic payloads under `failure.details`; when present, `failure.details` is also a `{codec, blob}` envelope. The server stores the details blob verbatim and records `details_payload_codec` with the durable failure payload so non-PHP workers can round-trip diagnostic data without PHP serialization.

### Starting a Workflow

`POST /api/workflows` accepts `input` in two shapes:

1. **Plain JSON array** — the server encodes the values into the `avro` codec using the generic-wrapper schema.

   ```json
   { "workflow_type": "MyWorkflow", "input": ["hello", 42] }
   ```

2. **Explicit envelope** — for clients that already hold pre-encoded bytes:

   ```json
   {
     "workflow_type": "MyWorkflow",
     "input": { "codec": "avro", "blob": "<base64-avro-bytes>" }
   }
   ```

The server stores the blob verbatim and tags the run with the `avro` codec.

The codec is stored on the `WorkflowRun` and **propagates for the life of the run**: activity arguments, results, signal/update arguments, and child-workflow inputs are all Avro-encoded.

Embedded/package starts (workflows kicked off from PHP via `WorkflowStub::make(...)->start(...)` rather than the HTTP API) also resolve the new-run default through final v2's Avro-only codec contract.

## Resolving the Bridges

Both bridges are registered in the Laravel container and can be resolved directly:

```php
use Workflow\V2\Contracts\WorkflowTaskBridge;
use Workflow\V2\Contracts\ActivityTaskBridge;

$workflowBridge = app(WorkflowTaskBridge::class);
$activityBridge = app(ActivityTaskBridge::class);
```
