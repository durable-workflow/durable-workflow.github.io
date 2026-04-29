---
title: Server Role Topology
description: Interpret the /api/cluster/info topology manifest for Durable Workflow server roles, scaling boundaries, failure domains, and migration steps.
tags:
  - server
  - topology
  - deployment
  - control-plane
  - workers
keywords:
  - Durable Workflow role topology
  - cluster info topology
  - server scaling boundaries
  - split control execution
---

# Server Role Topology

## Why This Manifest Exists

`GET /api/cluster/info` publishes the server's `topology` manifest under the
schema `durable-workflow.v2.role-topology`. Treat that manifest as the public
contract for role names, supported deployment shapes, durable-write authority,
failure-domain expectations, scaling boundaries, and the ordered migration path
from today's standalone distribution toward a split control/execution topology.

Use this page when you need to reason about server shape from scripts,
dashboards, runbooks, or rollout automation. Use the
[Server API Reference](/docs/2.0/polyglot/server-api-reference) for the raw
HTTP surface and the [Server Guide](/docs/2.0/polyglot/server) for deployment
setup.

## Reading The Topology Manifest

The `topology` object answers these contract questions:

| Field family | Question it answers |
| --- | --- |
| `schema`, `version` | Which topology contract revision are you reading? |
| `supported_shapes` | Which product deployment shapes are legal? |
| `role_vocabulary` | Which role names are valid on this contract? |
| `current_shape`, `current_process_class`, `current_roles`, `execution_mode` | What is the responding node doing right now? |
| `matching_role.*` | Who owns broad ready-task wake, which routing axes are frozen, and which dispatch/backpressure posture is active? |
| `role_catalog`, `authority_surfaces` | Which interfaces and durable mutation surfaces belong to each role? |
| `shape_assignments` | Which process classes are allowed for each supported shape? |
| `authority_boundaries`, `failure_domains`, `scaling_boundaries` | Which role is allowed to write what, how each role fails, and what load axis each role scales on? |
| `supported_topologies`, `migration_path` | What deployment families are product-supported, and what is the ordered path from the standalone shape toward more isolated roles? |

`current_shape`, `current_process_class`, and `current_roles` describe the node
that answered the HTTP request, not the full fleet. Use
`current_process_class` as the node's declared identity, then compare
`current_roles` against the process-class bundles in `shape_assignments` when
you need to verify that declaration.

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/cluster/info" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  | jq '{
    current_shape: .topology.current_shape,
    current_process_class: .topology.current_process_class,
    current_roles: .topology.current_roles,
    execution_mode: .topology.execution_mode,
    matching_role: .topology.matching_role,
    scaling_boundaries: .topology.scaling_boundaries,
    migration_path: .topology.migration_path
  }'
```

## Role Vocabulary

The public role names are fixed by `topology.role_vocabulary`:

| Role | Responsibility |
| --- | --- |
| `api_ingress` | Accept external HTTP traffic, including discovery and control-plane entrypoints. |
| `control_plane` | Start, signal, update, cancel, terminate, and otherwise mutate workflow lifecycle state. |
| `matching` | Discover ready work, own task leases, and coordinate dispatch pressure. |
| `history_projection` | Persist durable history and maintain derived run summaries and exports. |
| `scheduler` | Fire schedules and persist schedule-run state. |
| `execution_plane` | Run workflow and activity task work. |

Automation should treat these exact identifiers as the stable vocabulary.

## Supported Deployment Shapes

`topology.supported_shapes` names the legal product deployment shapes:

| Shape | Process classes published in `shape_assignments` | Contract meaning |
| --- | --- | --- |
| `embedded` | `application_process` | One application process owns control-plane, matching, history projection, scheduler, and execution. |
| `standalone_server` | `server_http_node`, `scheduler_node`, `worker_node` | The current standalone server distribution: HTTP ingress/control-plane on the server node, scheduler isolated as its own process class, and execution on worker nodes. |
| `split_control_execution` | `ingress_node`, `control_plane_node`, `scheduler_node`, `matching_node`, `execution_node` | The same product contract split into narrower role-specific process classes so scaling and failure boundaries can move by subsystem. |

`split_control_execution` is a supported topology, not a second engine or a
different API. The same discovery surface describes both the standalone and the
split-role shapes.

## Current Node Identity

Use `current_shape`, `current_process_class`, `current_roles`, and
`execution_mode` together:

- `current_shape` identifies the responding node's shape contract.
- `current_process_class` identifies the declared process class for that node.
- `current_roles` identifies the active role bundle on that node.
- `execution_mode` distinguishes `remote_worker_protocol` from
  `local_queue_worker`.

For the standalone server distribution, `current_shape` remains
`standalone_server` even when `DW_MODE=embedded` switches execution to local
queue workers. In that case, `execution_mode` changes to `local_queue_worker`
while the HTTP node keeps the standalone-server role contract.

## Matching Role Contract

`topology.matching_role` freezes the live matching and wake posture for the
responding node:

| Field | Meaning |
| --- | --- |
| `queue_wake_enabled` | Whether short-lived queue wake signals are currently enabled. |
| `shape` | Which matching deployment shape this node advertises: `in_worker` or `dedicated`. |
| `wake_owner` | Which implementation currently owns the broad wake sweep: `worker_loop` or `dedicated_repair_pass`. |
| `task_dispatch_mode` | Whether dispatch is happening through `poll`-driven remote workers or `queue`-driven local execution. |
| `partition_primitives` | The frozen routing axes the matching role reasons about, in order: `connection`, `queue`, `compatibility`, `namespace`. |
| `backpressure_model` | The durable admission boundary the matching role enforces. Current v2 reports `lease_ownership`. |

This lets operators and automation distinguish "matching exists but wake is
degraded" from "this node is intentionally running a different dispatch mode,"
and it gives the same routing and backpressure vocabulary the server itself
publishes in operator metrics.

## Authority Boundaries

`topology.authority_boundaries` names the durable write surfaces each role is
supposed to mutate:

| Role | Published writes |
| --- | --- |
| `api_ingress` | `worker_registrations` |
| `control_plane` | `workflow_instances`, `workflow_runs.status`, `workflow_tasks.lifecycle` |
| `matching` | `workflow_tasks.leases`, `activity_tasks.leases` |
| `history_projection` | `history_events`, `workflow_run_summaries`, `workflow_history_exports` |
| `scheduler` | `workflow_schedules.fire_state`, `workflow_starts.scheduled` |
| `execution_plane` | `workflow_tasks.outcomes`, `activity_attempts`, `worker_compatibility_heartbeats` |

Use this contract to catch cross-role drift before you split processes or add
new topology-specific automation.

## Failure And Scaling Boundaries

### Failure Domains

`topology.failure_domains` names the first degraded behavior and the first
operator-visible signal for each role outage:

| Failure domain | `effect` | `operator_signal` |
| --- | --- | --- |
| `control_plane_down` | `workers_continue_claimed_tasks_only_until_lease_expiry` | `operator_commands_fail_fast` |
| `execution_plane_down` | `ready_tasks_accumulate_without_loss` | `operators_see_ready_depth_growth` |
| `matching_down` | `claim_falls_back_to_direct_ready_task_discovery` | `ready_depth_rises_while_claim_rate_falls` |
| `history_projection_down` | `projection_reads_may_stale_while_durable_writes_continue` | `projection_lag_seconds_may_increase` |
| `scheduler_down` | `scheduled_workflows_stop_firing_and_record_missed_runs` | `operators_see_missed_schedule_state` |
| `api_ingress_down` | `external_http_traffic_stops_at_the_edge` | `embedded_in_process_calls_may_continue` |

These are product-facing expectations, not internal implementation trivia. Use
them to describe what should happen when a role is degraded before reading logs.

### Scaling Boundaries

`topology.scaling_boundaries` tells you which load axis each role primarily
scales on in the split-role model:

| Role | Scaling boundary |
| --- | --- |
| `api_ingress` | `incoming_http_request_rate` |
| `control_plane` | `operator_commands_and_run_lifecycle_transitions` |
| `matching` | `ready_task_rate_and_poller_count` |
| `history_projection` | `durable_event_rate` |
| `scheduler` | `active_schedule_count` |
| `execution_plane` | `workflow_and_activity_task_rate` |

This is the explicit answer to "what do we scale independently?" for the
split-role topology.

## Migration Path

`topology.migration_path` is ordered. Each step preserves one durable kernel
while isolating responsibilities more clearly:

1. `audit_role_boundaries`
   Result: tooling flags cross-role writes before runtime shape changes.
2. `expose_role_bindings`
   Result: container seams allow out-of-process adapters without patching the package.
3. `introduce_dedicated_matching_shape`
   Result: matching can run as its own process class without changing the claim contract.
4. `split_history_projection`
   Result: history and projections can move out of process without introducing a second writer.
5. `split_scheduler`
   Result: schedule firing can move behind leader election while single-replica deployments stay legal.
6. `optional_execution_partitioning`
   Result: workers can partition by namespace, connection, queue, and compatibility.

Read this list as the supported topology transition order, not as a separate
product roadmap detached from the current engine.

## Coordination Health

`/api/cluster/info` also publishes `coordination_health` beside `topology`.
Keep the distinction clear:

- `topology` tells you what the node is allowed to do and how the product shape
  is supposed to behave.
- `coordination_health` tells you whether rollout-safety and coordination checks
  are currently healthy across namespaces.
- `coordination_health.blocked_by`, `coordination_health.message`, and
  `coordination_health.remediation` appear when the server cannot evaluate
  rollout-safety health because readiness prerequisites such as migrations or
  database connectivity are missing.
- `coordination_health.routing_drains` summarizes draining build-id cohorts
  across queues and namespaces. `queues_with_drains` tells you whether rollout
  automation is intentionally holding traffic away from any cohort right now.
- `coordination_health.warning_checks`, `coordination_health.error_checks`, and
  `coordination_health.checks` remain the normalized check inventory once
  rollout-safety evaluation is running.

Use both surfaces together when deciding whether a topology change is both
supported and currently safe.

## Related References

- [Server API Reference](/docs/2.0/polyglot/server-api-reference) for the
  authenticated `/api/cluster/info` HTTP contract.
- [Server Guide](/docs/2.0/polyglot/server) for deployment setup and the
  broader standalone server operating model.
- [Deployment Modes](/docs/2.0/polyglot/deployment-modes) for when to choose
  embedded, standalone server, or broader support-led topologies.
