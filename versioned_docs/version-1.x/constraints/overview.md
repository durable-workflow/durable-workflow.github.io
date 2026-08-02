---
sidebar_position: 1
---

# Overview

Workflow code is replayed to reconstruct orchestration state, while activity code can be retried when work fails or its result is uncertain. Those two recovery paths require different properties:

- **Workflow code must be deterministic.** Given the same workflow input and recorded history, replay must make the same orchestration decisions in the same order.

- **Activity side effects should be idempotent.** Repeating the same logical operation must have the same intended external effect as performing it once.

Event sourcing persists the workflow's history. Replay reads the recorded events and returns saved activity results to the workflow; it does not require an activity to be deterministic. Activity idempotency protects the separate case where an external operation is attempted again.

Read [Idempotent vs. Deterministic Workflows](./idempotent-vs-deterministic.md) for the direct comparison and examples, then use [Workflow Constraints](./workflow-constraints.md) and [Activity Constraints](./activity-constraints.md) for the authoring rules.
