---
sidebar_position: 1
title: Laravel Durable Workflow Engine for PHP
sidebar_label: Introduction
description: Build long-running, persistent PHP workflows in Laravel that wait for events, survive restarts, and coordinate queued activities with Durable Workflow.
canonical_path: /docs/introduction/
image: /img/docusaurus.png
tags:
  - concepts
  - getting-started
  - laravel
  - workflows
keywords:
  - durable workflow laravel
  - laravel workflow engine
  - long-running php workflows
  - laravel workflow orchestration
  - laravel queues vs workflows
---

# Durable Workflow for Laravel

Durable Workflow is an open-source, Laravel-native durable workflow engine for
long-running PHP processes. It stores orchestration state in your application's
database and schedules work through Laravel queues, so a workflow can pause for
a timer, webhook, or human decision and resume after a worker restart.

This introduction covers stable 1.x, the default public documentation line. It
runs inside your Laravel application. The separately versioned
[2.0 prerelease introduction](/docs/2.0/introduction/) covers Cloud,
self-hosted Server, and service-mode SDK deployments.

## When to use a durable workflow

Use a workflow when a process has multiple steps and may outlive any one web
request or queue worker. Common signs include:

- The process spans minutes, hours, or days
- You need to wait for a human approval step
- You need to wait for a webhook or other external event
- You need to pause and continue later without keeping a process running
- You need to be able to restart after a crash without causing bugs or duplicating work

For one independent background task, a Laravel queued job is usually enough. A
fixed sequence or group of known jobs may fit job chaining or batching. Durable
Workflow is for orchestration that must persist progress while it branches,
loops, waits, or changes its next step in response to an external event.

## How Durable Workflow fits Laravel

The stable `durable-workflow/workflow` Composer package embeds the workflow
runtime in a Laravel application. It uses Laravel's database layer to retain
workflow state and its queue system to run workflow and activity work. Your
workflow code can use familiar framework capabilities such as the service
container, events, and Eloquent models.

A workflow describes the durable sequence and decisions. Activities perform
the side-effecting work, such as calling an API, updating a database, or
processing a file. Persisting progress between those steps lets another worker
continue the orchestration instead of restarting the entire process after a
failure.

Start with [Installation](./installation.md) to add the package, publish its
migrations, and run queue workers. Read [How It Works](./how-it-works.md) for
the execution and replay model.

## What you can build

Durable Workflow can coordinate asynchronous application processes such as
approval flows, agentic AI loops, data pipelines, media processing, and
microservice operations. Activities can run in sequence or in parallel, while
the workflow retains the state needed to make the next decision.

Laravel teams keep their existing application conventions while gaining a
workflow-level view of progress and status. Queue workers can scale
horizontally, and the orchestration remains explicit in PHP instead of being
spread across callbacks and ad hoc status columns.
