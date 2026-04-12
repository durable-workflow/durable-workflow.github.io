---
sidebar_position: 6
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
    $page = $bridge->historyPayloadPaginated($taskId, $afterSequence, 200);
    $allEvents = array_merge($allEvents, $page['history_events']);
    $afterSequence = $page['next_after_sequence'] ?? $afterSequence;
} while ($page['has_more']);
```

The default page size is 200 events; the maximum is 1000. The response includes `has_more` and `next_after_sequence` for cursor-based pagination.

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
| `record_side_effect` | `result` | Record a deterministic side-effect result |
| `record_version_marker` | `change_id`, `version`, `min_supported`, `max_supported` | Record a versioning decision |
| `upsert_search_attributes` | `attributes` | Upsert indexed metadata on the workflow run |

**Terminal commands** (at most one):

| Type | Required Fields | Description |
|------|----------------|-------------|
| `complete_workflow` | — | Mark the run as completed (optional `result`) |
| `fail_workflow` | `message` | Mark the run as failed |
| `continue_as_new` | — | Close the run and start a new one (optional `arguments`, `workflow_type`) |

## Activity Task Bridge

The `ActivityTaskBridge` contract defines how an external worker interacts with activity tasks:

| Verb | Description |
|------|-------------|
| `poll` | Find ready activity tasks matching queue and compatibility criteria |
| `claim` / `claimStatus` | Claim a specific activity task with lease |
| `complete` | Record activity completion with a result |
| `fail` | Record activity failure |
| `status` | Check liveness and cancellation state without renewing the lease |
| `heartbeat` | Extend the lease and report optional progress |

Activity heartbeat responses include `can_continue` and `cancel_requested` fields, allowing long-running activities to respond to cancellation requests.

## Resolving the Bridges

Both bridges are registered in the Laravel container and can be resolved directly:

```php
use Workflow\V2\Contracts\WorkflowTaskBridge;
use Workflow\V2\Contracts\ActivityTaskBridge;

$workflowBridge = app(WorkflowTaskBridge::class);
$activityBridge = app(ActivityTaskBridge::class);
```
