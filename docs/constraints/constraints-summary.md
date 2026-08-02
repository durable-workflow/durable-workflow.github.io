---
sidebar_position: 4
---

# Constraints Summary

| Workflows | Activities |
| ------------- | ------------- |
| ❌ IO | ✔️ IO |
| ❌ mutable global variables | ✔️ mutable global variables |
| ❌ non-deterministic functions | ✔️ non-deterministic functions |
| ❌ `Carbon::now()` | ✔️ `Carbon::now()` |
| ❌ `sleep()` | ✔️ `sleep()` |
| ❌ non-idempotent | ❌ non-idempotent |

Workflow code must be deterministic because the engine rebuilds a workflow's state by replaying its history of durable steps — it re-invokes the workflow body, not activities. If the body produces different decisions on replay, the engine cannot reconstruct the workflow's state and continue execution correctly.

Activities must be idempotent because activity execution is at-least-once. Retries, lease expiry, and redelivery can cause the same attempt to be observed more than once, and that is first-class behavior rather than an error. Making the activity body or its external target safe to repeat — with an idempotency key, a deterministic target resource, or a naturally idempotent operation — is what keeps duplicate execution from producing duplicate side effects.

See [Idempotent vs. Deterministic Workflows](./idempotent-vs-deterministic.md)
for a direct comparison and examples that separate the two properties.

See [Execution Guarantees and Idempotency](./execution-guarantees.md) for the
public v2 contract behind those terms.
