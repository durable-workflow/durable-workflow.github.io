---
slug: durable-workflow-2-0
title: "Introducing Durable Workflow 2.0: Durable Execution for the Polyglot, Agentic Era"
authors: [richard]
tags: [durable-execution, polyglot, agents, php, python, rust]
---

Today we are announcing Durable Workflow 2.0, the evolution of the PHP-native
project formerly known as Laravel Workflow into a standalone, polyglot durable
execution platform.

Modern systems rarely live in one language or one process. PHP may own the
application, Python the data and AI workloads, and Rust the performance-critical
services. Durable Workflow 2.0 gives those systems one durable execution model,
one protocol, and one operational surface. It is built for software developed
and operated by people and, increasingly, by autonomous agents.

<!-- truncate -->

## One runtime, three first-party SDKs

Durable Workflow 2.0 launches with first-party SDKs for
[PHP](/docs/polyglot/php/), [Python](/docs/polyglot/python/), and
[Rust](/docs/polyglot/rust/). They all communicate with the same
language-neutral runtime.

A PHP workflow can schedule an activity implemented by a Rust worker. A Python
client can start it. An operator can inspect the same execution through the CLI
or Waterline. Workflow and activity types cross language boundaries by public
name, and values cross them through a shared typed Avro protocol instead of
framework-specific object serialization.

The protocol uses one recursive Avro value schema for primitives, bytes,
strings, lists, and string-keyed maps. Values are encoded directly as Avro
datums, so distinctions such as integer versus floating-point values survive
round trips across all three SDKs without requiring every application to
maintain a schema for each workflow type.

For a team with a mixed stack, the workflow engine no longer has to be chosen
around the implementation language of one service.

## Deploy it the way your system needs

The 2.0 runtime owns durable state, command and history recording, task
matching, timers, schedules, namespaces, and recovery. Application workers
connect to it and scale independently in PHP, Python, or Rust.

There are three supported ways to run it:

- **Durable Workflow Cloud** operates the runtime for you. Your clients and
  workers connect to a managed namespace; you do not run Durable Workflow
  Server.
- **Standalone Server** gives self-hosted teams the same language-neutral
  runtime boundary in a published container.
- **Embedded Laravel** keeps the original Laravel-native model for teams that
  want the workflow engine inside the application they already deploy.

Embedded Laravel remains a first-class product surface. It is now one option
within a broader platform rather than the limit of where Durable Workflow can
run.

## Built and hardened in public

Durable Workflow 2.0 is developed with coding agents that implement changes,
write tests, triage failures, and prepare releases. A human product owner sets
direction and retains stable-release authority. GitHub issues, pull requests,
commits, and Actions checks keep that work visible and approachable to other
contributors.

Release qualification exercises installable packages from Packagist, PyPI,
and crates.io together with published Docker images. That work has found
defects that ordinary happy-path tests missed:

- A [Python replay defect](https://github.com/durable-workflow/sdk-python/commit/071c1b6e0fee5fd6830f20babcf75b3d694da5c5)
  mistook a condition timeout timer for an activity during replay and left the
  workflow unable to complete.
- A [Python worker contract defect](https://github.com/durable-workflow/sdk-python/commit/7cbd354)
  omitted workflow update declarations, causing the live runtime to reject
  valid updates as unknown.
- A [server heartbeat race](https://github.com/durable-workflow/server/commit/4459eae0)
  allowed timeout enforcement to race with a newer accepted activity
  heartbeat.

Each defect was reproduced, fixed, covered by a regression test, and verified
against a new release candidate. Agentic development does not remove
engineering discipline. It shortens the loop between a concrete failure, a
reviewable fix, and public verification.

## Agent-operable by design

Durable Workflow 2.0 treats agent operability as a product contract. Human
operators and autonomous agents use the same machine-readable surfaces for
capability discovery, workflow commands, typed results, history, diagnostics,
and bounded repair operations.

Those contracts are available through the HTTP API, structured CLI output,
the SDK clients, published schemas, and MCP-enabled application surfaces. An
agent does not need to scrape a dashboard or infer success from log text. It
can discover what the runtime supports, make a scoped change, observe the
named result, diagnose a typed failure, apply an allowed repair, and verify the
new state.

The full [agent operating contract](/docs/ai-agent-workflow-engine/)
documents that Discover, Change, Run, Diagnose, Repair loop.

## Recovery evidence, with a defined boundary

Durable Workflow 2.0 has been exercised against API node loss, database
interruption, Redis interruption, worker loss and replacement, worker restart,
server restart while timers are pending, and scheduler restart. The measured
scenarios preserved durable state, recovered execution, reached one terminal
workflow outcome, and refused duplicate completion attempts where applicable.

Those are exact claims for the tested single-region topology. They are not a
promise of universal exactly-once external side effects, arbitrary
network-partition safety, clock-skew tolerance, multi-region failover, or an
unbounded throughput level. Applications still make external activity effects
idempotent, and operators qualify the topology they intend to run.

The [operator operating envelope](/docs/operator-operating-envelope/)
publishes what has been proven and what remains outside the 2.0 evidence
boundary. That specificity matters more than a blanket resilience claim.

## A familiar name, a broader platform

Durable Workflow 2.0 is for teams that build across languages, need long-running
work to survive process failure, and want operations to be equally legible to
people and software agents. It preserves the Laravel-native experience that
started the project while adding the standalone and managed runtime boundaries
needed by a polyglot system.

This is not an incremental Laravel package update. It is a durable execution
platform wearing a familiar name.

Start with the [Durable Workflow 2.0 quickstart](/docs/quickstart/), choose
[Cloud](/docs/polyglot/cloud-control-plane/),
[Standalone Server](/docs/polyglot/server/), or
[embedded Laravel](/docs/introduction/), and run your first durable workflow.
