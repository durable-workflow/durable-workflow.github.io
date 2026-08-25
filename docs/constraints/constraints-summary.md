---
sidebar_position: 4
description: What workflow and activity code may do.
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

Workflow code must be deterministic because the engine rebuilds a workflow's state by replaying its history of durable steps — it re-invokes the workflow body, not activities. If the body produces different decisions on replay, the engine cannot reconstruct the workflow's state and continue execution correctly. The workflow body does not need to be idempotent; determinism is the replay requirement.

Activities must be idempotent because activity execution is at-least-once. Retries, lease expiry, and redelivery can cause the same attempt to be observed more than once, and that is first-class behavior rather than an error. Making the activity body or its external target safe to repeat — with an idempotency key, a deterministic target resource, or a naturally idempotent operation — is what keeps duplicate execution from producing duplicate side effects.

See [Idempotent vs. Deterministic Workflows](/docs/constraints/idempotent-vs-deterministic/)
for a direct comparison and examples that separate the two properties.

See [Execution Guarantees and Idempotency](./execution-guarantees.md) for the
public v2 contract behind those terms.
