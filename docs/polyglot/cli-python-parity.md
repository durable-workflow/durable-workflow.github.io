---
title: Client and Worker Capabilities
description: Compare CLI, PHP SDK, Python SDK, and Rust SDK client and worker capabilities.
---

# Client and Worker Capabilities

Choose a surface for what the process needs to do. The `dw` CLI and the
first-party PHP, Python, and Rust SDKs share the v2 control-plane and worker
contracts, but their operator, client, and worker roles are not identical.

This all-client guide remains at the original
`/docs/2.0/polyglot/cli-python-parity/` route so existing links keep working.

## Capability comparison

| Capability | `dw` CLI | PHP SDK | Python SDK | Rust SDK |
| --- | --- | --- | --- | --- |
| Workflow lifecycle | **Supported:** start, list, inspect, wait, cancel, terminate, and archive operator commands. [Commands](./cli-reference.md#workflow-commands) | **Supported:** start, describe, list, await results, cancel, and terminate through `Client` and `WorkflowHandle`. [Lifecycle evidence](./php.md#lifecycle-updates-schedules-and-visibility) | **Supported:** start, list/describe, await results, cancel, and terminate through the async client. [Workflow operations](./python.md#workflow-operations) | **Supported:** start, describe, await results, cancel, and terminate through `Client` and `WorkflowHandle`. [Terminal operations](./rust.md#cancel-terminate-and-handle-terminal-outcomes) |
| Signals | **Supported:** send by workflow ID or selected run. [Commands](./cli-reference.md#workflow-commands) | **Supported:** client and handle send methods plus worker signal history. [PHP API](./php.md#lifecycle-updates-schedules-and-visibility) | **Supported:** async client sends and workflow workers handle signals. [Messages](./python.md#signals-queries-and-updates) | **Supported:** client and handle sends plus worker signal handling. [Rust API](https://rust.durable-workflow.com/) |
| Queries | **Supported:** execute a named read-only query with structured output. [Commands](./cli-reference.md#workflow-commands) | **Supported:** client and handle queries plus registered worker query handlers. [PHP API](./php.md#lifecycle-updates-schedules-and-visibility) | **Supported:** async client queries plus replayed worker query handlers. [Messages](./python.md#signals-queries-and-updates) | **Supported:** client queries and replayed worker query handlers when runtime discovery advertises query-task support. [Rust API](https://rust.durable-workflow.com/) |
| Updates | **Supported:** submit and wait for accepted or completed outcomes. [Commands](./cli-reference.md#workflow-commands) | **Supported:** `updateWorkflow` and `registerUpdate`; the PHP SDK does not expose validator authoring and declares no validators. [PHP API](./php.md#lifecycle-updates-schedules-and-visibility) | **Supported:** clients, workflow handlers, and synchronous declared validators when discovery advertises the pre-accept contract. Validator-bearing workers refuse unsupported runtimes. [Messages](./python.md#signals-queries-and-updates) | **Supported:** client, handle, JSON/Avro, and registered worker update surfaces; the Rust SDK does not expose validator authoring and declares no validators. [Updates](./rust.md#workflow-updates) |
| Schedules | **Supported:** complete schedule lifecycle, backfill, and audit history. [Commands](./cli-reference.md#schedule-commands) | **Supported:** complete schedule lifecycle and listing through `Client`. [PHP API](./php.md#lifecycle-updates-schedules-and-visibility) | **Supported:** complete async schedule lifecycle and audit-history paging. [Schedules](./python.md#schedules) | **Not supported:** the current Rust SDK does not claim a schedule-management API. Use CLI, PHP, Python, or the server API. |
| Visibility | **Supported:** workflow/run search, workers, task queues, history, and diagnostic JSON. [Commands](./cli-reference.md#workflow-commands) | **Supported:** workflow filtering/pagination, history, namespaces, workers, and task queues. [Visibility evidence](./php.md#lifecycle-updates-schedules-and-visibility) | **Supported:** workflow, schedule, namespace, worker, queue, history, and search-attribute client surfaces. [Client API](./python.md#client-api-reference) | **Different:** selected-run describe/result is supported; fleet-wide list/search and namespace administration are not claimed. [Rust client](./rust.md#package-and-source) |
| Worker execution | **Intentionally different:** low-level worker-protocol commands support diagnostics and conformance; `dw` is not an application worker runtime. [Worker commands](./cli-reference.md#worker-protocol-commands) | **Supported:** remote workflow, activity, query, and update handlers through `durable-workflow/sdk`. [PHP worker](./php.md#run-a-remote-php-worker) | **Supported:** deterministic workflow and activity workers. [Python worker](./python.md#worker) | **Supported:** native workflow, activity, query, and update handlers. [Rust worker API](https://rust.durable-workflow.com/) |

**Supported** means the named current release surface exposes the capability.
**Different** identifies an intentional scope boundary. **Not supported** is
an explicit current gap, not a hidden promise. Runtime protocol discovery
remains authoritative when a capability depends on a negotiated worker
protocol.

## Evidence by product surface

### CLI

The [CLI overview](./cli.mdx) defines installation, profiles, structured
output, and exit behavior. The
[command reference](./cli-reference.md) is the complete operator surface,
including lifecycle, messages, schedules, visibility, and the low-level
worker-protocol commands that are intentionally not an SDK worker loop.

### PHP SDK

The pinned PHP SDK exposes framework-neutral client and remote-worker APIs.
Its current public surface includes workflow lifecycle and result handles,
signals, queries, updates, schedules, workflow filtering/history, namespace,
worker, and task-queue visibility, plus registered workflow, activity, query,
and update handlers. See the [PHP SDK guide](./php.md) and generated
[PHP API reference](https://php.durable-workflow.com/api/).

### Python SDK

The Python SDK combines an async control-plane client with deterministic
workflow and activity workers. Its guide publishes
[client operations](./python.md#client-api-reference),
[message handlers](./python.md#signals-queries-and-updates),
[worker execution](./python.md#worker), and
[schedule management](./python.md#schedules). The generated
[Python API reference](https://python.durable-workflow.com/) carries exact
signatures and result types.

### Rust SDK

The published Rust SDK exposes control-plane and selected-run lifecycle,
signals, replayed queries, updates, and native workflow/activity workers.
Update support includes `Client::update_workflow`,
`WorkflowHandle::update`, `Worker::register_update`, and their Avro-value
variants. Schedule management and fleet-wide list/search remain explicit gaps.
See the [Rust SDK guide](./rust.md) and generated
[Rust API reference](https://rust.durable-workflow.com/).

## Shared contract evidence

All four products target the same versioned HTTP+JSON control plane and public
payload envelope. Evidence is split by what it proves:

- the [Capability Index](/docs/2.0/capabilities/) records exact artifact floors
  and current breadth;
- the [Platform Conformance Suite](/docs/2.0/platform-conformance/) records
  cross-client and cross-worker runtime scenarios;
- CLI and Python repositories retain shared request fixtures for operations
  whose semantic request bodies are byte-for-byte compared today;
- PHP and Rust public API references and release tests establish the additional
  supported methods listed above.

The existence of a shared fixture in two repositories does not imply that
other SDKs lack the operation. Conversely, a common endpoint does not imply
that every product exposes the same operator or worker role.

## Adding or extending a client surface

When adding a new CLI or SDK operation:

1. Keep paths, methods, semantic fields, payload envelopes, and error outcomes
   language-neutral.
2. Add request and runtime evidence for every participating client or worker.
3. Document deliberately different syntax or role boundaries.
4. Mark unsupported products explicitly.
5. Treat language-specific serialization, file paths, class names, or error
   shapes as bugs in the public contract.
