---
sidebar_position: 4
title: Server Role Topology
description: Read the Durable Workflow server role-topology manifest and map it to supported deployment shapes, failure domains, and rollout decisions.
tags:
  - server
  - topology
  - operations
  - control-plane
keywords:
  - Durable Workflow role topology
  - control plane execution plane split
  - matching role
  - split control execution
  - cluster info topology
---

# Server Role Topology

`GET /api/cluster/info` publishes the machine-readable role map for the node
that answered the request. Use that `topology` manifest when you need to know
which responsibilities the node owns, which durable write surfaces belong to
each role, and how the same product contract scales from one process to a split
control-plane and execution-plane deployment.

The manifest uses the schema `durable-workflow.v2.role-topology`. It is a
product contract, not an internal implementation detail. Operators, SDKs, CLI
automation, and rollout tooling should read it instead of inferring duties from
container names, hostnames, or process labels.

## Why This Manifest Exists

Durable Workflow keeps one durable engine across embedded mode, the standalone
server distribution, and more explicit split-role deployments. The topology
manifest makes that boundary explicit:

- it names the legal topology shapes as product terms
- it tells you which roles the current node owns
- it publishes the durable write boundary for each role
- it exposes the first failure signal and main scaling driver per role
- it preserves one migration path instead of implying a second engine

This is how you distinguish a supported topology change from a product fork.

## Role Vocabulary

The manifest vocabulary is fixed for v2:

| Role | What it owns |
| --- | --- |
| `api_ingress` | HTTP termination, request authentication, namespace resolution, and handing requests to the right plane. |
| `control_plane` | Durable workflow commands such as start, signal, update, cancel, terminate, reset, repair, and archive. |
| `matching` | Ready-task discovery, claim arbitration, dispatch publication, and wake ownership. |
| `history_projection` | Durable history recording, run summaries, and operator-facing projection surfaces. |
| `scheduler` | Schedule evaluation and turning schedule fire state into workflow starts. |
| `execution_plane` | Workflow-task replay, activity execution, task heartbeats, and task completion/failure outcomes. |

The role list is intentionally logical rather than process-shaped. One process
may host multiple roles, and one role may later move to its own process class
without changing the contract.

## Supported Deployment Shapes

The server publishes the supported shapes in `topology.supported_shapes`:

| Shape | Process classes | Typical use |
| --- | --- | --- |
| `embedded` | One `application_process` owns `control_plane`, `matching`, `history_projection`, `scheduler`, and `execution_plane`. | Laravel-app embedding with local queue workers. |
| `standalone_server` | `server_http_node`, `scheduler_node`, and `worker_node`. | Published server image, self-hosted Compose, and the narrow small-cluster contract. |
| `split_control_execution` | `ingress_node`, `control_plane_node`, `scheduler_node`, `matching_node`, and `execution_node`. | More explicit role isolation without introducing a second engine. |

Two details matter in practice:

- The published self-hosted server artifacts start in the
  `standalone_server` shape, even though the manifest also advertises
  `split_control_execution` as a supported product topology.
- `current_shape` and `current_roles` describe the node you queried right now,
  not the whole fleet. A standalone server API node reports
  `api_ingress`, `control_plane`, `matching`, and `history_projection`; the
  scheduler and workers are separate process classes in the same shape.

For rollout planning, keep the topology page paired with
[Self-Hosting Deployments](/docs/2.0/deployment) and
[Rolling Upgrades](/docs/2.0/rolling-upgrades). Those pages tell you which
shape is self-serve today; the manifest tells you which roles the node is
actually owning.

## Authority Boundaries

`topology.authority_boundaries` tells you which durable write surfaces belong
to each role. Treat it as the first guardrail before splitting a deployment:

| Role | Durable write boundary |
| --- | --- |
| `control_plane` | `workflow_instances`, `workflow_runs.status`, `workflow_tasks.lifecycle` |
| `execution_plane` | `workflow_tasks.outcomes`, `activity_attempts`, `worker_compatibility_heartbeats` |
| `matching` | `workflow_tasks.leases`, `activity_tasks.leases` |
| `history_projection` | `history_events`, `workflow_run_summaries`, `workflow_history_exports` |
| `scheduler` | `workflow_schedules.fire_state`, `workflow_starts.scheduled` |
| `api_ingress` | `worker_registrations` |

If a process needs a durable write surface outside the roles it claims, that is
topology drift and should be treated as a contract problem before you scale or
split the fleet further.

## Failure And Scaling Boundaries

The same manifest also publishes the first expected failure signal and the main
scaling driver for each role:

| Role or failure | What operators should expect |
| --- | --- |
| `control_plane_down` | Operator commands fail fast; already-claimed work continues only until lease expiry. |
| `execution_plane_down` | Ready tasks accumulate without loss; queue depth and schedule-to-start lag grow. |
| `matching_down` | Claim rate falls while ready depth rises; current implementations fall back to direct ready-task discovery. |
| `history_projection_down` | Durable writes continue, but projection reads may go stale and projection-lag health rises. |
| `scheduler_down` | Scheduled workflows stop firing and the missed-schedule state becomes visible. |
| `api_ingress_down` | External HTTP traffic stops at the edge even if embedded in-process calls still exist elsewhere. |

| Role | Main scaling driver |
| --- | --- |
| `api_ingress` | `incoming_http_request_rate` |
| `control_plane` | `operator_commands_and_run_lifecycle_transitions` |
| `matching` | `ready_task_rate_and_poller_count` |
| `history_projection` | `durable_event_rate` |
| `scheduler` | `active_schedule_count` |
| `execution_plane` | `workflow_and_activity_task_rate` |

This is the contract behind the public operator guidance. When the deployment
guide says the scheduler is singleton or when the rolling-upgrade guide says
workers and API nodes roll independently, it is relying on these boundaries.

## Migration Path

The manifest publishes one ordered `migration_path` so a deployment can evolve
without inventing a new engine:

1. `audit_role_boundaries` so tooling can detect cross-role writes before
   runtime shape changes.
2. `expose_role_bindings` so hosts can swap adapters or run a role out of
   process without patching the package.
3. `introduce_dedicated_matching_shape` so matching can move out of the worker
   loop without changing the claim contract.
4. `split_history_projection` so history/projection work can move without
   introducing a second writer.
5. `split_scheduler` so schedule firing can sit behind explicit ownership while
   single-replica deployments stay legal.
6. `optional_execution_partitioning` so workers can partition by namespace,
   connection, queue, and compatibility.

Read that sequence literally. `split_control_execution` is a topology that
keeps the same durable kernel and discovery surface; it is not a new control
plane, a second protocol, or a hosted-only feature fork.

## Reading The Topology Manifest

Use `/api/cluster/info` to read the node's current role assignment:

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/cluster/info" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  | jq '.topology | {schema, version, current_shape, current_roles, execution_mode, matching_role}'
```

Key fields to inspect:

- `schema` and `version` tell you which topology manifest schema you are
  parsing. Treat `topology.version` as the manifest version, not as the server
  build version.
- `current_shape` and `current_roles` tell you what the responding node owns
  right now.
- `execution_mode` distinguishes `local_queue_worker` embedded execution from
  `remote_worker_protocol` standalone-server execution.
- `matching_role` tells you whether the node still owns the in-worker wake path
  or expects a dedicated repair/matching loop to do that work.
- `shape_assignments`, `authority_boundaries`, `failure_domains`,
  `scaling_boundaries`, and `migration_path` are the fields operators should
  read before changing topology, rollout posture, or process ownership.

## Related References

- [Server](/docs/2.0/polyglot/server) for the general standalone-server guide
  and the inline cluster-info example.
- [Server API Reference](/docs/2.0/polyglot/server-api-reference) for the
  discovery endpoint, route matrix, and required headers.
- [Self-Hosting Deployments](/docs/2.0/deployment) for the supported
  self-serve shapes and their operational boundaries.
- [Rolling Upgrades](/docs/2.0/rolling-upgrades) for mixed-version rollout
  behavior across API nodes, workers, and the scheduler.
- [Task Matching and Dispatch](/docs/2.0/polyglot/task-matching-dispatch) for
  the matching-role contract that `topology.matching_role` points at.
- [Worker Compatibility Routing](/docs/2.0/polyglot/worker-compatibility-routing)
  for build-id and compatibility-marker routing semantics across worker fleets.
