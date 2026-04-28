---
sidebar_position: 3
---

# Activity Constraints

Activities are where workflow code crosses the durable boundary into IO and
side effects. They are not replayed like workflow code. They are **executed
at-least-once**, which means retries, lease expiry, and redelivery can all
cause the same logical work to be observed more than once.

That behavior is first-class, not an error path. If your activity creates a
charge, sends an email, writes to another system, or mutates an external
resource, the operation must be safe to repeat.

## What This Means In Practice

- The default idempotency surface for one logical activity execution is
  `activity_execution_id`.
- Each retry attempt also gets its own `activity_attempt_id`.
- A worker can finish external work, lose its lease, and then report late.
  The engine may reject that late report because another worker already won
  the durable race, but the remote side effect may still have happened.
- Activity code is allowed to use IO, wall-clock time, and mutable process
  state. Workflow code is not. Keep that boundary clear.

## Preferred Idempotency Patterns

Many external APIs support passing an `Idempotency-Key`. Use the workflow
runtime's logical activity identity when the remote service supports it.

- Prefer `activity_execution_id` when the remote system should treat retries
  as the same logical request.
- Use `activity_attempt_id` only when the remote system must distinguish
  separate tries of the same logical work.

Other good patterns:

- Write to a deterministic external resource name or natural key.
- Use upserts or dedupe tables keyed by a durable identifier.
- Make the operation naturally idempotent so the second call becomes a no-op.

Many operations are naturally idempotent. If you encode a video twice, you
still end up with the same video. If you delete the same file twice, the
second deletion does nothing.

Some operations are not inherently idempotent, but duplication may still be
the safer failure mode. If you are unsure whether an email actually left the
provider, a duplicate email may be preferable to silently dropping the
notification. Make that trade-off deliberately.

## What Not To Assume

- Do not assume one activity attempt only ever runs on one worker.
- Do not assume a retry means the previous external side effect failed.
- Do not assume late completion implies the activity never ran.
- Do not move side effects into workflow code to avoid retries; that only
  turns an idempotency problem into a determinism bug.

See [Execution Guarantees and Idempotency](./execution-guarantees.md) for the
full contract and [Failures and Recovery](../failures-and-recovery.md) for the
operator-facing recovery model.
