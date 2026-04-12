---
sidebar_position: 1
---

# Overview

The determinism and idempotency constraints for workflows and activities are important for ensuring the reliability and correctness of the overall system.

- Determinism means that given the same inputs, a workflow or activity will always produce the same outputs. This is important because it allows the system to avoid running the same workflow or activity multiple times, which can be both inefficient and error-prone.

- Idempotency means that running a workflow or activity multiple times has the same effect as running it once. This is important because it allows the system to retry failed workflows or activities without causing unintended side-effects.

- Event sourcing is a way to persist the state of a system by storing a sequence of events rather than the current state directly. In the context of a workflow, this means that each activity is represented as an event in the event stream. When the workflow is started, the engine reads the event stream and replays the events in order to rebuild the current state of the workflow.

The determinism and idempotency constraints are necessary because the workflow engine may need to replay the same event multiple times. If the code that is executed during the replay is not deterministic, it may produce different results each time it is run. This would cause the workflow engine to lose track of the current state of the workflow, leading to incorrect results.

Additionally, since the events may be replayed multiple times, it is important that the code within an activity is idempotent. This means that running the code multiple times with the same input should produce the same result as simply running it once. If the code is not idempotent, it may produce unintended side effects when it is replayed.

Overall, the determinism and idempotency constraints help ensure that the workflow engine is able to accurately rebuild the current state of the workflow from the event stream and produce the correct results. They also make it easier to debug and troubleshoot problems, as the system always behaves in a predictable and repeatable way.
