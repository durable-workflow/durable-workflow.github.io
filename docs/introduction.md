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
