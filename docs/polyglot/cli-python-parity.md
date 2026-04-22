---
sidebar_position: 5
title: CLI and Python Parity
description: Run the same Durable Workflow control-plane operation from dw and the Python SDK.
---

# CLI and Python Parity

The Durable Workflow CLI and Python SDK are two clients for the same v2
control-plane contract. Use whichever surface fits the job, but keep the
operation vocabulary the same: workflow type, workflow ID, task queue, payload,
memo, search attributes, timeout, run ID, and named signal, query, or update
handler.

The product tests enforce this with shared request fixtures in both client
repositories:

| Operation | Fixture |
| --- | --- |
| Start workflow | `tests/fixtures/control-plane/workflow-start-parity.json` |
| Signal workflow | `tests/fixtures/control-plane/workflow-signal-parity.json` |
| Query workflow | `tests/fixtures/control-plane/workflow-query-parity.json` |
| Update workflow | `tests/fixtures/control-plane/workflow-update-parity.json` |
| Cancel workflow | `tests/fixtures/control-plane/workflow-cancel-parity.json` |

The CLI sends JSON caller payloads directly. The Python SDK wraps the same
semantic payload in its Avro envelope. Both target the same endpoint and
control-plane meaning.

## Shared Setup

Both examples below assume the same local server and namespace:

```bash
export DURABLE_WORKFLOW_SERVER_URL=http://localhost:8080
export DURABLE_WORKFLOW_NAMESPACE=default
export DURABLE_WORKFLOW_AUTH_TOKEN=local-dev-token
```

```python
from durable_workflow import Client

client = Client(
    "http://localhost:8080",
    namespace="default",
    token="local-dev-token",
)
```

Use the same workflow identifiers in both clients while testing parity:

```text
workflow_type = orders.process
workflow_id = wf-polyglot-231
task_queue = orders
```

## Start A Workflow

CLI:

```bash
dw workflow:start \
  --type=orders.process \
  --workflow-id=wf-polyglot-231 \
  --task-queue=orders \
  --input='[{"order_id":42,"priority":"gold"}]' \
  --memo='{"source":"polyglot-fixture"}' \
  --search-attr=CustomerId=cust-42 \
  --search-attr=Tier=gold \
  --execution-timeout=300 \
  --run-timeout=120 \
  --duplicate-policy=use-existing \
  --json
```

Python:

```python
async with client:
    handle = await client.start_workflow(
        workflow_type="orders.process",
        workflow_id="wf-polyglot-231",
        task_queue="orders",
        input=[{"order_id": 42, "priority": "gold"}],
        memo={"source": "polyglot-fixture"},
        search_attributes={"CustomerId": "cust-42", "Tier": "gold"},
        execution_timeout_seconds=300,
        run_timeout_seconds=120,
        duplicate_policy="use-existing",
    )
```

Both calls mean `POST /workflows`. The Python request includes an Avro
`input` envelope, but the decoded input is the same list passed to
`--input`.

## Signal A Workflow

CLI:

```bash
dw workflow:signal wf-polyglot-231 shipment_received \
  --input='[{"carrier":"ups","tracking":"1Z999"}]' \
  --json
```

Python:

```python
async with client:
    await client.signal_workflow(
        "wf-polyglot-231",
        "shipment_received",
        args=[{"carrier": "ups", "tracking": "1Z999"}],
    )
```

Both calls mean `POST /workflows/{workflow_id}/signal/{signal_name}`. Signals
are durable, fire-and-forget messages; neither client waits for the workflow
to observe the signal.

## Query A Workflow

CLI:

```bash
dw workflow:query wf-polyglot-231 current_status \
  --input='[{"include_items":true}]' \
  --json
```

Python:

```python
async with client:
    status = await client.query_workflow(
        "wf-polyglot-231",
        "current_status",
        args=[{"include_items": True}],
    )
```

Both calls mean `POST /workflows/{workflow_id}/query/{query_name}`. Queries
are read-only and return the handler result.

## Update A Workflow

CLI:

```bash
dw workflow:update wf-polyglot-231 approve \
  --wait=completed \
  --input='[{"approved_by":"manager"}]' \
  --json
```

Python:

```python
async with client:
    result = await client.update_workflow(
        "wf-polyglot-231",
        "approve",
        args=[{"approved_by": "manager"}],
        wait_for="completed",
    )
```

Both calls mean `POST /workflows/{workflow_id}/update/{update_name}`. Use
`completed` when the caller needs the update result; use `accepted` when the
caller only needs the workflow validator to accept the update.

## Cancel A Workflow

CLI:

```bash
dw workflow:cancel wf-polyglot-231 \
  --reason="customer request" \
  --json
```

Python:

```python
async with client:
    await client.cancel_workflow(
        "wf-polyglot-231",
        reason="customer request",
    )
```

Both calls mean `POST /workflows/{workflow_id}/cancel`. Cancellation is
cooperative: workflow code can observe it and clean up. Use termination only
for the force-stop operator path.

## Parity Checklist

When adding a new CLI or SDK operation, keep the contract language-neutral:

1. Add or update one shared fixture under `tests/fixtures/control-plane/` in
   both repositories.
2. Assert the CLI command path, method, and semantic request body.
3. Assert the Python SDK path, method, semantic fields, and decoded payload
   envelope.
4. Document any deliberately different surface syntax, such as CLI flags versus
   Python keyword arguments.
5. Treat PHP-only serialization, file paths, class names, or error shapes as
   bugs in the public contract.

That checklist keeps `dw`, Python, and future clients aligned around the same
HTTP and JSON protocol instead of parallel language-specific APIs.
