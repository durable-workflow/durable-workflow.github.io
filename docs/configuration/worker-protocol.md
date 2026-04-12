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
