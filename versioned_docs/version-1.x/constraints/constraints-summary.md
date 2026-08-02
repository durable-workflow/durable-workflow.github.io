---
sidebar_position: 4
---

# Constraints Summary

| Constraint | Workflow code | Activity code |
| --- | --- | --- |
| IO | Not allowed | Allowed |
| Mutable global variables | Not allowed | Allowed |
| Non-deterministic functions | Not allowed | Allowed |
| `Carbon::now()` | Not allowed | Allowed |
| `sleep()` | Not allowed | Allowed |
| External side effects | Move them into activities | Allowed only when safe to repeat |

Workflow code must be deterministic because the engine rebuilds orchestration state by replaying recorded history. Given the same workflow input and history, the workflow body must make the same durable decisions in the same order. The workflow body does not need to be idempotent; determinism is the replay requirement.

Activity side effects must be safe to repeat because an activity may be retried after a failure or lost response. Usually that means making the external effect idempotent with a stable key, deterministic target resource, or naturally idempotent operation.

See [Idempotent vs. Deterministic Workflows](./idempotent-vs-deterministic.md) for a direct comparison and examples that separate the two properties.
