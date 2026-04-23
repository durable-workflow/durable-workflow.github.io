---
sidebar_position: 4
title: Invocable HTTP Carrier
description: Configure the activity-only invocable_http carrier so the server can POST a leased activity task to an HTTPS handler endpoint and reconcile the structured result.
tags:
  - external-execution
  - invocable-carrier
  - worker-protocol
keywords:
  - invocable carrier
  - invocable_http
  - external executor config
  - activity HTTP handler
  - external-task input envelope
  - external-task result envelope
---

# Invocable HTTP Carrier

The invocable HTTP carrier is the first concrete carrier defined under the
[external execution surface](./external-execution.md). It is published from
`GET /api/cluster/info` at
`worker_protocol.invocable_carrier_contract` with
`schema: durable-workflow.v2.invocable-carrier.contract`, `version: 1`, and
`carrier_type: invocable_http`.

When a configured handler mapping resolves to an `invocable_http` carrier, the
server invokes the configured endpoint with the carrier-neutral
[external task input envelope](./external-execution.md#published-contract-seams)
and reconciles the response against the
[external task result envelope](./external-execution.md#published-contract-seams).
Workflow tasks, signal/update ordering, replay, and history mutation stay
inside the server. The carrier only moves declared input and result envelopes
across an HTTPS boundary.

## What It Is

The invocable HTTP carrier exists for activity-grade work that an operator
team would rather host as an HTTPS handler than as a long-poll worker:

- operator maintenance activities and platform automation hosted in an internal
  HTTP service
- bounded integration handoffs that already terminate at an HTTPS endpoint
- serverless or container-based activity handlers that expose a single POST
  route per activity type

Activity execution is delegated to the configured endpoint. Durable workflow
state, history, and the activity-completion contract remain server-owned.

## Activity-Only Scope

The published manifest fixes the carrier scope to `task_kinds: [activity_task]`
and names explicit non-goals so the boundary cannot drift through configuration:

- `workflow_task_execution` — workflow tasks remain on real workflow runtimes
- `workflow_replay` — the carrier never replays workflow history
- `history_mutation` — handlers may not edit event history directly
- `generic_webhook_ingress` — generic ingress goes through a bridge adapter,
  not through this carrier

A handler mapping with a non-activity `kind`, or a carrier mapping with a
non-`activity_task` capability, fails configuration validation with
`invalid_invocable_carrier_scope` before it can appear on the activity poll
response.

## HTTPS Target And Method

Carrier `target_fields` are validated by the server before a mapping is
exposed:

| Field | Required | Allowed | Notes |
| --- | --- | --- | --- |
| `url` | yes | absolute HTTPS URL, or HTTP for loopback dev (`localhost`, `127.0.0.0/8`, `::1`) | URL credentials (`scheme://user:pass@host`) are forbidden. |
| `method` | no | `POST` | Defaults to `POST`. No other HTTP method is accepted. |
| `timeout_seconds` | no | integer 1–900 | Transport deadline for one handler attempt. The task deadline is enforced separately by the server/runtime. |
| `retry_policy` | no | object (see below) | Carrier-owned transport retry budget. |

Invalid targets fail closed with `invalid_carrier_target` and never appear in
discovery output.

## Auth Model

Non-loopback `invocable_http` mappings must resolve an `auth_ref` from the
external executor configuration. Unauthenticated invocable HTTP is allowed
only against loopback HTTP targets so a developer can iterate locally.

- `auth_refs` are declared once at the top of the config and referenced from
  defaults or per-mapping. Supported types include `profile`, `env`,
  `token_file`, `mtls`, and `signed_headers`.
- A mapping that resolves to a non-loopback target without an effective
  `auth_ref` fails configuration validation with `missing_invocable_auth_ref`.
- Tokens, secrets, signatures, and authorization headers are never echoed in
  cluster diagnostics, in `dw server:info` output, or on the activity poll
  response. The mapping diagnostics report which `auth_ref` resolved and the
  redacted summary, never the credential value.

The intent is that an operator can read the redacted runtime diagnostics and
confirm which auth secret will be used, without the server ever exposing the
secret itself.

## Transport Retry Versus Durable Activity Retry

The optional `retry_policy` on an invocable carrier is **transport-only**. It
governs the carrier's HTTP delivery before the handler reports a result:

| `retry_policy` field | Allowed | Default | Meaning |
| --- | --- | --- | --- |
| `max_attempts` | integer 1–5 | `1` | Maximum HTTP delivery attempts the carrier will make for one task lease. |
| `backoff_seconds` | array of integers, each 0–300, up to 5 entries | `[]` | Per-attempt backoff before the next HTTP try. |
| `retryable_status_codes` | subset of `[408, 425, 429, "5xx"]` | `[408, 429, "5xx"]` | Response codes that count as transport-retryable. |

Transport retries never become history events. The server only learns about
the carrier's final attempt — either the structured success/failure envelope
the handler returned, or a transport timeout that maps to
`failure.kind=timeout, classification=deadline_exceeded`, or one of the
malformed-output paths.

Once the handler reports a result, the **durable activity retry policy
remains the server/runtime authority**. Task-level retry, scheduling, and
backoff continue to follow the activity retry policy declared on the
workflow side. The carrier's `retry_policy` does not extend, override, or
substitute for it.

## Request And Response Envelope

The server sends the carrier-neutral input envelope and expects the
carrier-neutral result envelope back:

| Direction | Content type | Schema |
| --- | --- | --- |
| Request | `application/vnd.durable-workflow.external-task-input+json` | `external_task_input_contract` |
| Response | `application/vnd.durable-workflow.external-task-result+json` | `external_task_result_contract` |

The handler must preserve `task.id`, `task.attempt`, and
`task.idempotency_key` from the input envelope, and must respond with the
declared success or failure envelope (or fail-closed by emitting a
malformed-output mapping).

The carrier maps transport facts to result facts deterministically:

- transport timeout → `failure.kind=timeout`,
  `classification=deadline_exceeded`
- non-2xx response without a valid result envelope → `malformed_output`
- invalid JSON or schema mismatch on the response → `malformed_output`
- result envelope referencing an unsupported payload reference →
  `unsupported_payload`

Handlers must be idempotent. The same `task.id` and
`task.idempotency_key` may arrive more than once if the carrier retries
transport delivery or the runtime redelivers an unfinished lease.

## Configuration Example

The server reads handler mappings from
`DW_EXTERNAL_EXECUTOR_CONFIG_PATH`, optionally selecting an overlay with
`DW_EXTERNAL_EXECUTOR_CONFIG_OVERLAY`. See the
[Server Config Reference](./server-config-reference.md) for the full list of
environment variables.

Below is a minimal `durable-workflow.external-executor.config` document that
registers one `invocable_http` carrier and one activity mapping:

```json
{
  "schema": "durable-workflow.external-executor.config",
  "version": 1,
  "defaults": {
    "profile": "prod",
    "namespace": "operations",
    "task_queue": "operator-tasks",
    "auth_ref": "handler-token"
  },
  "auth_refs": {
    "handler-token": {
      "type": "env",
      "env": "DURABLE_WORKFLOW_HANDLER_TOKEN"
    }
  },
  "carriers": {
    "ops-invocable": {
      "type": "invocable_http",
      "url": "https://handlers.example.com/durable/activity",
      "method": "POST",
      "timeout_seconds": 60,
      "capabilities": ["activity_task"],
      "retry_policy": {
        "max_attempts": 3,
        "backoff_seconds": [2, 5],
        "retryable_status_codes": [408, 429, "5xx"]
      }
    }
  },
  "mappings": [
    {
      "name": "billing.reconcile-ledger",
      "kind": "activity",
      "task_queue": "operator-tasks",
      "activity_type": "billing.reconcile-ledger",
      "carrier": "ops-invocable",
      "handler": "billing.reconcile-ledger",
      "timeout_seconds": 60
    }
  ]
}
```

A loopback dev variant uses `"url": "http://127.0.0.1:8080/durable/activity"`
and may omit `auth_ref` because loopback HTTP is the one allowed
unauthenticated path.

## Inspection And Diagnostics

Two CLI commands surface the published invocable carrier contract from a
running server:

- `dw server:info` renders the schema name, contract version, carrier type,
  task kinds, allowed request/response content types, and the redacted
  external executor mapping diagnostics. Use it to confirm the server has
  loaded the expected mappings.
- `dw doctor` runs the cluster-info diagnostic, prints the
  `invocable_carrier_contract` block, and surfaces any
  `invalid_carrier_target`, `missing_invocable_auth_ref`,
  `invalid_invocable_carrier_scope`, `unknown_carrier`, `unknown_auth_ref`,
  or `unknown_handler` errors that blocked a mapping from being advertised.

The activity poll response itself reports the resolved mapping, the carrier
target (with auth redacted), and the effective `retry_policy`. Workers and
operator tooling read these fields as the source of truth instead of caching
their own copy of the configuration file.

## Coexistence And Rollout

The invocable carrier rollout boundary is published in the same manifest:

- A poll-based carrier and an `invocable_http` carrier may share a queue only
  when the mappings are activity-type specific. Two mappings cannot claim the
  same `(task_queue, activity_type)` pair.
- Operators must remove or overlay-disable invocable mappings before deleting
  the credentials they reference. Pulling credentials before the mapping is
  drained will move every new attempt to `failure.kind=auth`, not silently
  succeed.
- Carrier `retry_policy` is purely transport. The durable activity retry
  policy remains the only authority over how many task attempts the workflow
  observes.

## Related Surfaces

- [External Execution Surface](./external-execution.md) — the carrier-neutral
  product boundary that this carrier implements.
- [PHP Invocable Activity Handler](./invocable-php-handler.md) — the PHP
  helper an external process uses to parse input envelopes, dispatch
  activity callables, and emit the structured result envelopes this carrier
  expects.
- [Server Config Reference](./server-config-reference.md) — environment
  variables for `DW_EXTERNAL_EXECUTOR_CONFIG_PATH` and
  `DW_EXTERNAL_EXECUTOR_CONFIG_OVERLAY`.
- [External Payload Storage](../features/external-payload-storage.md) — how
  oversized request or result payloads are offloaded to a configured driver
  and represented as a verifiable reference envelope inside the same input
  and result schemas the invocable carrier uses.
- [Worker Protocol](./worker-protocol.md) — the broader worker-plane contract
  that publishes this carrier alongside poll-based handler shapes.
