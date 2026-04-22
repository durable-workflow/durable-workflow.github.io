---
sidebar_position: 3
title: External Execution Surface
description: Use the carrier-neutral activity-grade external execution contract for bounded tasks, bridges, and AI-operable handlers.
tags:
  - external-execution
  - bridge-adapters
  - worker-protocol
  - AI
keywords:
  - external execution
  - bridge adapter
  - activity worker protocol
  - task result envelope
---

# External Execution Surface

Durable Workflow v2 treats external execution as a contract-first product
surface, not as a shell convention or a single worker transport. The standalone
server publishes the machine-readable umbrella at `GET /api/cluster/info` under
`worker_protocol.external_execution_surface_contract`.

That contract is named `activity_grade_external_execution`. It is for durable,
bounded work that can run outside a full workflow runtime:

- operator maintenance activities
- platform automation
- integration handoffs
- bridge adapters that start, signal, update, or hand off work
- script, daemon, HTTP, queue-backed, serverless, or agent-driven handlers

The primary wedge is operator, platform, and integration automation. AI agents
and scripts are important consumers because they need stable handles, but they
do not redefine the runtime boundary.

## Boundary

External handlers may:

- execute one leased workflow or activity task
- heartbeat lease progress through the worker protocol
- return a structured success or failure envelope
- use a bridge adapter to start, signal, update, or hand off bounded work

External handlers must not:

- interpret workflow replay semantics
- own `ContinueAsNew` behavior
- apply signal, update, or query ordering rules outside the runtime contract
- mutate event history directly
- act as an unbounded workflow runtime

Those rules stay inside the server and real SDK runtimes. A carrier should only
move declared input and result envelopes across a transport boundary.

## Published Contract Seams

Read `GET /api/cluster/info` before wiring a carrier. The relevant v2 paths are:

| Path | Purpose |
| --- | --- |
| `worker_protocol.external_execution_surface_contract` | Product boundary, runtime boundary, valid carrier classes, and seam status. |
| `worker_protocol.external_task_input_contract` | Carrier-neutral input envelope for one leased workflow or activity task. |
| `worker_protocol.external_task_result_contract` | Carrier-neutral success, failure, and malformed-output envelope. |
| `worker_protocol.server_capabilities.external_execution_surface` | Compact capability pointer for worker-plane negotiation. |

The external execution surface also names planned seams for deterministic
auth/profile/TLS composition, config-first handler mappings, bounded bridge
adapters, payload external storage, and admission/rollout safety. Treat those
as contract seams, not private implementation details.

## Carrier Requirements

A valid carrier can be a poll-based CLI or daemon, an HTTP handler invocation,
a queue-backed worker, or a serverless invocation. The transport can differ,
but these requirements do not:

- emit the declared input schema
- accept the declared result schema
- preserve `task.id`, `task.attempt`, and `task.idempotency_key`
- map transport failures to a structured failure or malformed-output outcome
- resolve auth, TLS, profile, and environment inputs deterministically

Exit codes, stderr, process crashes, HTTP failures, queue visibility timeouts,
and serverless platform errors are transport facts. They only become workflow
facts after the carrier maps them to the declared result envelope or to
`malformed_output`.

## Bridge Adapters

Bridge adapters are bounded ingress or handoff surfaces. They can start,
signal, update, or hand off work, but they are not workflow runtimes and should
not hide replay or event-history behavior.

Every bridge adapter needs explicit machine outcomes for:

- unknown target
- auth failure
- malformed payload
- duplicate start
- unsupported routing
- accepted handoff
- rejected handoff

Use the same operator clarity as the rest of the control plane: stable status
codes, named `reason` values, and enough context for `dw`, Waterline, SDKs, and
agents to explain what happened without scraping prose.

The CLI exposes the webhook bridge surface directly:

```bash
dw bridge:webhook stripe \
  --action=start_workflow \
  --idempotency-key=stripe-event-1001 \
  --target='{"workflow_type":"orders.fulfillment","task_queue":"external-workflows","business_key":"order-1001"}' \
  --input='{"order_id":"order-1001"}' \
  --json
```

The JSON response is the same bridge-adapter outcome contract published by
`/api/cluster/info`, including `outcome`, `reason`,
`control_plane_outcome`, `idempotency_key`, and the redacted `target` summary.

## Agent-Operable Shape

The external execution surface is part of the v2 AI-assisted development
posture. Humans learn the workflow/activity/replay invariant; tools operate
through stable contracts:

1. discover the external execution surface from `/api/cluster/info`
2. choose a carrier that satisfies the published requirements
3. emit an external task input envelope
4. preserve task identity and idempotency
5. return a success, failure, or malformed-output envelope
6. report bridge and transport failures with named outcomes

This keeps AI-assisted scaffolding and operator automation boring: the tool can
cite the protocol manifest, the task envelope, the result envelope, and the
bridge outcome instead of inferring behavior from one demo script.
