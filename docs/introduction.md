---
sidebar_position: 1
tags:
  - concepts
  - getting-started
  - workflows
keywords:
  - durable workflow
  - polyglot workflow engine
  - AI agent workflow engine
  - durable orchestration
  - v2 workflow concepts
---

# Introduction

Durable Workflow 2.0 is a polyglot durable-execution platform. PHP, Python,
and Rust applications author workflows and activities with first-party SDKs,
share one public protocol and durable execution model, and resume from recorded
history after workers or hosts restart.

## Agent-operable by contract

Human operators and autonomous agents use the same machine-readable contract.
The testable loop is **Discover -> Change -> Run -> Diagnose -> Repair**:
version and capability manifests, explicit workflow commands, structured
results, typed history and worker/queue diagnostics, safe mutations, and
post-change verification. MCP is one interface in that contract, alongside the
HTTP API, CLI JSON, SDK clients, Waterline exports, schemas, and protocol
catalog. See [Agent Operating Loop](/docs/2.0/agent-operating-loop/) and the
direct [AI-agent evaluator](/docs/2.0/ai-agent-workflow-engine/).

## Three deployment and control-plane choices

Choose the boundary that fits the application and operating model:

- **Standalone server:** deploy the published server as infrastructure and
  connect PHP, Python, or Rust application workers through the public protocol. Start with the
  [Standalone Server](/docs/2.0/polyglot/server/).
- **Embedded:** install the engine inside a Laravel application so its queues,
  configuration, database, and deployment own execution. See
  [Deployment Modes](/docs/2.0/polyglot/deployment-modes/).

## First-party SDKs

PHP, Python, and Rust are first-party SDK surfaces. They use stable string type
names, the same durable command and history model, and the same versioned
HTTP+JSON worker and control-plane protocols.

- **PHP** is the reference workflow-authoring SDK, embedded host, and server
  core.
- **Python** is both a deterministic workflow/activity SDK and an
  operational/control-plane surface.
- **Rust** authors deterministic workflows, activities, and worker services;
  it is a first-party workflow SDK, not merely a protocol-compatibility client.

Cross-language child workflows and activities retain their payload shape
through the shared public envelope and codec contract. The Avro path uses the
official `apache/avro` Composer package, official `avro` Python package, and
official `apache-avro` Rust crate. See the authoritative
[2.0 Capability Index](/docs/2.0/capabilities/) for the current installable
artifact floors and deliberate SDK differences.

## Laravel-native embedded mode

Laravel remains a differentiated first-party adoption path. A Laravel
application can embed the PHP engine and author workflows as ordinary PHP
classes while using its existing queue, database, configuration, and deployment
model. That advantage does not redefine the platform category: standalone and
Cloud-connected Python or Rust applications remain native 2.0 paths.

## First-time 2.0 prerelease path

If you are evaluating the 2.0 prerelease for the first time, start with the
[2.0 Prerelease Quickstart](/docs/2.0/quickstart/). It uses published
artifacts only and walks Laravel, Python, and operator paths to an observable
`status=completed` workflow state.

The quickstart pins the current prerelease artifacts directly:
`%%artifact.pythonPackagePin%%` for Python,
`%%artifact.serverDockerHubImage%%` for the standalone server, and
`%%artifact.cliInstallerEnv%%` for the CLI installer.

```bash
pip install %%artifact.pythonPackagePin%%
export DW_SERVER_IMAGE=%%artifact.serverDockerHubImage%%
curl -fsSL https://durable-workflow.com/install.sh | %%artifact.cliInstallerEnv%% sh
```

The persona reference pages are also versioned 2.0 pages:
[Python SDK](/docs/2.0/polyglot/python/),
[Rust SDK](/docs/2.0/polyglot/rust/),
[Standalone Server](/docs/2.0/polyglot/server/), and
[CLI](/docs/2.0/polyglot/cli/).

## Do you need a workflow?

You probably need a workflow if:

- The process spans minutes, hours, or days
- You need to wait for a human approval step
- You need to wait for a webhook or other external event
- You need to pause and continue later without keeping a process running
- You need to be able to restart after a crash without causing bugs or duplicating work

If your task is "run five queued jobs in order and bail on the first failure," Laravel's job chain is a better fit. Durable Workflow is for the cases where the next step depends on an external event, a wait, or a decision that can't be decided up front.

## Want to learn by example?

The fastest way to see Durable Workflow run end to end is the
[Sample App](/docs/2.0/sample-app). It is a runnable Laravel 13
application with one workflow per pattern surface (deterministic
chains, elapsed-time measurement, microservice coordination, browser
automation, webhook-started workflows, AI activity loops, and a
signal-driven travel-agent saga), each wired into both an artisan
command and the MCP server. Clone it, run one command, and watch the
run land in Waterline. When you are ready to write your own pattern,
the [Contribute a Sample](/docs/2.0/contribute-a-sample) guide walks
through the full submission flow.
