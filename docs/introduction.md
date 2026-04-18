---
sidebar_position: 1
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
