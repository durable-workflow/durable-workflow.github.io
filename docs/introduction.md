---
sidebar_position: 1
tags:
  - concepts
  - getting-started
  - workflows
keywords:
  - durable workflow
  - Laravel workflow engine
  - durable orchestration
  - v2 workflow concepts
---

# Introduction

Durable Workflow is a Laravel-native durable orchestration engine. You write your workflow as an ordinary PHP class; it runs on your queue worker, survives process restarts, and resumes exactly where it left off.

## First-time 2.0 prerelease path

If you are evaluating the 2.0 prerelease for the first time, start with the
[2.0 Prerelease Quickstart](/docs/2.0/quickstart/). It uses published
artifacts only and walks Laravel, Python, and operator paths to an observable
`status=completed` workflow state.

The quickstart pins the current prerelease artifacts directly:
`durable-workflow==0.4.83` for Python,
`durableworkflow/server:0.2.206` for the standalone server, and
`VERSION=0.1.70` for the CLI installer.

```bash
pip install durable-workflow==0.4.83
export DW_SERVER_IMAGE=durableworkflow/server:0.2.206
curl -fsSL https://durable-workflow.com/install.sh | VERSION=0.1.70 sh
```

The persona reference pages are also versioned 2.0 pages:
[Python SDK](/docs/2.0/polyglot/python/),
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
