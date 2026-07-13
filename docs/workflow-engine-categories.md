---
sidebar_position: 10
title: Workflow Engine Evaluation Categories
description: A neutral taxonomy for distinguishing replay-based durable execution from queues, DAGs, checkpoint libraries, agent frameworks, serverless orchestration, and hosted platforms.
tags:
  - evaluation
  - concepts
  - durable execution
keywords:
  - workflow engine comparison
  - durable execution vs job queue
  - durable execution vs DAG scheduler
  - agent framework vs workflow engine
---

# Workflow Engine Evaluation Categories

“Workflow” names several different product categories. Compare products only
after identifying the execution model, state authority, application boundary,
and operating responsibility required by the use case. A keyword match does not
make two products interchangeable.

| Category | Primary abstraction | State and recovery boundary | Best-fit questions |
| --- | --- | --- | --- |
| **Replay-based durable-execution engine** | Code-defined workflow whose decisions are recorded as history and replayed deterministically | The engine persists commands/events, reconstructs workflow state, schedules durable waits and activities, and detects incompatible replay | Must code survive restarts, wait for external events, coordinate retries/timers/children, and remain explainable from history? |
| **Job queue** | Independent or chained jobs delivered to workers | The queue owns delivery/acknowledgement; applications usually own multi-step state and compensation | Is the unit of work short and independently retryable, with limited long-lived orchestration? |
| **DAG scheduler** | Nodes and dependencies in a directed graph | The scheduler tracks node readiness and run state, commonly for batch/data pipelines | Is the process known as a graph up front and primarily driven by dependency completion or a schedule? |
| **Checkpoint/resume library** | Application code plus explicit or automatic checkpoints | The library restores saved local/application state; external event routing and fleet control may remain application-owned | Is resuming computation the main requirement, without a separate durable control plane and worker protocol? |
| **Agent framework** | Models, tools, memory, prompts, and agent loops | The framework coordinates AI behavior; durable execution guarantees depend on its storage/runtime or an integrated engine | Is the primary problem model/tool composition, or does the agent loop also need a replay-based durable substrate? These layers can be complementary. |
| **Serverless orchestration product** | Provider-defined state machine or function workflow | A cloud provider owns execution and operating substrate within documented service limits | Is a provider-managed runtime desirable, and are provider coupling, regional availability, limits, and service semantics acceptable? |
| **Hosted workflow platform** | Vendor-hosted control plane and often hosted execution/data plane | The vendor's exact contract determines runtime ownership, worker placement, tenancy, regions, networking, SLAs, and recovery | Which responsibilities are actually hosted, and which workers, runtime targets, storage, and network paths remain customer-operated? |

## Where Durable Workflow 2.0 fits

Durable Workflow 2.0 is a replay-based durable-execution platform. Its engine
records workflow history, replays deterministic workflow code, and coordinates
activities, timers, messages, children, retries, and lifecycle commands. See
[How It Works](/docs/2.0/how-it-works/) and
[Execution Guarantees](/docs/2.0/constraints/execution-guarantees/).

It offers three deployment/control-plane choices without changing that engine
category:

- a self-hosted [standalone server](/docs/2.0/polyglot/server/),
- a Laravel-native embedded runtime described by
  [deployment modes](/docs/2.0/polyglot/deployment-modes/), and
- the exact hosted [Cloud control-plane](/docs/2.0/polyglot/cloud-control-plane/)
  contract above runtime targets.

MCP and other agent interfaces do not make Durable Workflow an agent framework.
They make the durable-execution platform operable by agents through the
[Agent Tooling Contract](/docs/2.0/agent-tooling-contract/). Likewise, queue
drivers are an execution dependency, not a reclassification of the engine as a
job queue.

## A neutral evaluation sequence

1. **Name the durable state owner.** Decide whether the application, library,
   queue, provider, hosted platform, or replay engine owns multi-step progress.
2. **Name the recovery model.** Compare redelivery, graph-node retry,
   checkpoint restore, deterministic replay, and provider-managed resumption as
   distinct mechanisms.
3. **Name the interaction model.** Check timers, external messages, queries,
   updates, children, cancellation, and long-lived waits rather than relying on
   a generic “workflow” label.
4. **Name the machine boundary.** Require explicit schemas, discovery,
   compatibility, diagnostics, mutation, and verification surfaces when
   autonomous operation matters.
5. **Name operating ownership.** Separate embedded, self-hosted standalone,
   hosted control plane, and hosted runtime/data-plane responsibilities.
6. **Compare maturity within the category.** Stable status, production history,
   ecosystem, regions, support, and operating evidence are independent from a
   feature checklist.

For Durable Workflow's exact current answers, use the
[2.0 Capability Index](/docs/2.0/capabilities/) and
[AI-agent evaluator](/docs/2.0/ai-agent-workflow-engine/). Stable 1.x remains
the default public line, 2.0 is prerelease, and Temporal is substantially more mature operationally.
