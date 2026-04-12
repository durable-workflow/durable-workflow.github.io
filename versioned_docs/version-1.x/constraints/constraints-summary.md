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

Workflows should be deterministic because the workflow engine relies on being able to recreate the state of the workflow from its past activities in order to continue execution. If it is not deterministic, it will be impossible for the workflow engine to accurately recreate the state of the workflow and continue execution. This could lead to unexpected behavior or errors.

Activities should be idempotent because activities may be retried multiple times in the event of a failure. If an activity is not idempotent, it may produce unintended side effects or produce different results each time it is run, which could cause issues with the workflow. Making the activity idempotent ensures that it can be safely retried without any issues.
