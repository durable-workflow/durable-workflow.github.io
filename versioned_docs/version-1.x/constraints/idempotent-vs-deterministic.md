---
sidebar_position: 1.5
title: Idempotency vs. Determinism
sidebar_label: Idempotent vs. deterministic
description: Determinism makes workflow replay predictable; idempotency makes repeated activity side effects safe. Learn why Durable Workflow requires both.
slug: /constraints/idempotent-vs-deterministic
image: /img/idempotent-vs-deterministic.png
tags:
  - constraints
  - determinism
  - idempotency
  - replay
keywords:
  - idempotent vs deterministic
  - idempotency vs determinism
  - deterministic vs idempotent
  - deterministic workflow
  - idempotent activity
---

# Idempotent vs. Deterministic Workflows: What's the Difference?

**Deterministic behavior makes the same decisions when it is given the same inputs and history. Idempotent behavior has the same intended effect whether an operation runs once or several times.** Determinism makes one execution predictable; idempotency makes repeated executions safe. Neither property implies the other.

| Question | Deterministic | Idempotent |
| --- | --- | --- |
| What stays the same? | The decisions made from the same inputs and history | The intended external effect after one or many calls |
| Why does Durable Workflow need it? | Replay must reconstruct the same workflow path | Retries must not duplicate side effects |
| Where does it belong? | Workflow and orchestration code | Activities and the systems they call |
| Does it prohibit IO or randomness? | Yes, inside replayed workflow code unless the result is recorded | No; an activity may use IO, time, or randomness and still make its effect safe to repeat |

## The Properties Are Independent

### Deterministic but not idempotent

Consider an operation that increments a counter:

```text
increment(counter):
    counter.value = counter.value + 1
```

Given the same starting counter value, this operation always makes the same calculation, so it is deterministic. It is not idempotent: calling it twice increments the counter twice, while calling it once increments it once.

### Idempotent but not deterministic

Now consider an activity that sets an order to a known state but uses randomized backoff while contacting the service:

```text
archive(order_id):
    wait(random_backoff())
    PUT /orders/{order_id}/status {"status": "archived"}
```

The timing and number of internal attempts can differ, so this implementation is not deterministic. The operation can still be idempotent: after one successful call or several, the order is archived. The response, latency, and internal path do not have to be identical; the intended external effect does.

## Why Workflow Code Must Be Deterministic

Durable Workflow rebuilds orchestration state by replaying committed history. With the same workflow input and the same history, workflow code must schedule the same activities, timers, and waits in the same order. A wall-clock read, random value, live database query, or network response inside the workflow body can choose a different branch during replay and make the new decisions disagree with history.

Move those operations into activities, or use a workflow helper that records the value in history. Replay then returns the recorded activity or side-effect result instead of performing the external operation again. Determinism does not require every activity invocation to produce a universal, timeless answer; it requires replayed orchestration to make decisions that agree with its recorded history.

The workflow body does not need to be idempotent. Replay may invoke it again, but the engine matches its durable decisions to recorded history instead of asking the body to deduplicate an external effect.

See [Workflow Constraints](./workflow-constraints.md) for the authoring rules and [How It Works](../how-it-works.md) for the replay model.

## Why Activities and Side Effects Must Be Idempotent

Activities cross the durable boundary into databases, payment APIs, email providers, object storage, and other systems. They can run again after a failure or retry. The external change may even finish before a lost response causes the next attempt.

Design the activity's intended effect so another attempt is safe:

- send a stable idempotency key to the remote API
- upsert by a durable business or execution identifier
- write to a deterministic object or resource name
- use a naturally idempotent operation such as setting a value or deleting a known resource

An idempotency key does not make activity code deterministic, and it does not prevent another attempt from starting. It lets the external system recognize that repeated attempts represent the same logical operation.

See [Activity Constraints](./activity-constraints.md), [Defining Activities](../defining-workflows/activities.md), and [Failures and Recovery](../failures-and-recovery.md) for stable 1.x guidance. The stable 2.0 documentation provides the deeper [Activity Execution Model](/docs/features/activity-execution-model/) and [Execution Guarantees and Idempotency](/docs/constraints/execution-guarantees/) contracts.

## One Boundary, Versioned SDK Guidance

The determinism-versus-idempotency boundary is language-neutral. This stable 1.x documentation line covers the Laravel/PHP package and its in-application workflow and activity model. PHP, Python, and Rust service-mode SDK guidance is part of the stable [2.0 line](/docs/introduction/), with separate guides for the [PHP SDK](/docs/polyglot/php/), [Python SDK](/docs/polyglot/python/), and [Rust SDK](/docs/polyglot/rust/).

In any documented runtime, apply the same design:

1. Keep orchestration replay-safe: given the same input and history, issue the same durable commands.
2. Put network calls, clocks, randomness, and mutable external state behind an activity boundary.
3. Give each side-effecting activity a stable identity that the target system can deduplicate.

The language syntax changes. The durable boundary does not.
