---
title: Workflow Streams
description: Produce and consume run-scoped durable output streams with the PHP, Python, and Rust SDKs.
tags:
  - service-mode
  - workflow-streams
  - php
  - python
  - rust
---

# Workflow Streams

Workflow Streams are named, run-scoped output logs owned by Durable Workflow
Server. PHP, Python, and Rust expose typed list, describe, subscribe, append,
close, and error operations, so applications do not need to assemble HTTP
requests. The runtime advertises
`durable-workflow.v2.workflow-streams.contract@1`; the
[machine-readable SDK matrix](/workflow-stream-capabilities.json) records the
exact support in each SDK.

Each stream assigns monotonically increasing offsets beginning at 0. A page's
`next_offset` is the next inclusive offset to request. Delivery to consumers is
at least once: finish the page's idempotent effects, then durably checkpoint
`next_offset`. A crash before that checkpoint may redeliver items.

## Emit from workflow code

The three SDKs emit through the same deterministic command boundary:
`record_side_effect.workflow_stream`. Each SDK derives the item idempotency key
from the task's durable workflow command identity, the stream-command ordinal,
and the batch index. Server commits the stream mutation and recorded side
effect together. Replay consumes that side effect and cannot create another
durable item for the same logical append.

PHP:

```php
use DurableWorkflow\Model\WorkflowStreamAppendItem;

$context->appendWorkflowStream('progress', [
    new WorkflowStreamAppendItem(['percent' => 50]),
]);
$context->closeWorkflowStream('progress');
```

Python:

```python
from durable_workflow import WorkflowStreamAppendItem

yield ctx.append_workflow_stream("progress", [
    WorkflowStreamAppendItem(payload={"percent": 50}),
])
yield ctx.close_workflow_stream("progress")
```

Rust:

```rust
let item = WorkflowStreamAppendItem::new(serde_json::json!({"percent": 50}))?;
ctx.append_workflow_stream("progress", &[item], None)?;
ctx.close_workflow_stream("progress", None)?;
```

The workflow helpers are for deterministic authoring. Code outside a workflow
can use each client's typed `append` operation and supply its own stable
idempotency key.

## Subscribe and resume

Subscription reads a bounded page, optionally waiting for new items for up to
60 seconds. PHP accepts a cancellation callback between bounded polls. Python
accepts normal task cancellation or an `asyncio.Event` that cancels the
in-flight poll. Dropping Rust's subscription future cancels its request.

| SDK | Page operation | Resume value | Typed iteration |
| --- | --- | --- | --- |
| PHP | `subscribeWorkflowStream(...)` | `WorkflowStreamPage::$nextOffset` | `iterateWorkflowStream(...)` |
| Python | `await subscribe_workflow_stream(...)` | `WorkflowStreamPage.next_offset` | `iter_workflow_stream(...)` |
| Rust | `subscribe_workflow_stream(...).await` | `WorkflowStreamPage::next_offset` | Repeat the bounded page future until `terminal`. |

`open`, `closed`, and `errored` are the lifecycle states. The typed description
also exposes `last_offset`, `total_items`, `pending_items`, and `error_reason`.
An append to a terminal stream is rejected. When the configured pending bound
is reached, append returns `stream_full`; producers must slow down or wait for
consumers to drain the stream.

## External payload references

Inline values use the shared Avro Value envelope. External references follow
each SDK's existing storage contract rather than inventing another transport:

| SDK | External reference behavior |
| --- | --- |
| PHP | Appends and returns an opaque `payload_reference`; storage upload and fetch remain application-owned. |
| Python | Uses the configured external-storage driver to upload, integrity-check, cache, fetch, and decode an external Avro envelope. Without a driver, callers can append or inspect an opaque `payload_reference`. |
| Rust | Appends and returns an opaque reference and its metadata. The current Rust SDK does not claim an external-storage driver. |

## Workflow Streams and embedded MessageStream

The names align where behavior aligns, but the models are not interchangeable.

| Concept | Service-mode Workflow Stream | Embedded Laravel MessageStream |
| --- | --- | --- |
| Address | Workflow run + stream name | Workflow instance/run + stream key |
| Direction | Workflow output only | Workflow inbox and outbox |
| First offset | 0 | 1 |
| Delivery | At least once; consumer-owned checkpoint | At least once; engine-owned message cursor |
| Continue as new | No stream cursor transfer | Inbox cursor transfers to the continued run |
| Inbound workflow messaging | Not provided; use signals or updates | Provided by `inbox()->receive()` |

Waterline uses one normalized table for both modes and shows the mode,
lifecycle, head/cursor offsets, pending count, direction, and error. It does not
present service output streams as an inbound workflow inbox.

## Qualification

The public
[Workflow Stream scenario manifest](/platform-conformance/workflow-stream-runtime-scenarios.json)
requires published-artifact runs for PHP producer to Python and Rust consumers,
producer worker restart, consumer reconnect, lifecycle/backpressure/cancellation,
and external payload references. A release result must record every required
scenario; source-unit tests alone are not conformance evidence.
