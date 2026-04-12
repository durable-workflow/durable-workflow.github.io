---
sidebar_position: 3
---

# Activity Constraints

Activities have none of the prior constraints. However, because activities are retryable they should still be idempotent. If your activity creates a charge for a customer then retrying it should not create a duplicate charge.

Many external APIs support passing an `Idempotency-Key`. See [Stripe](https://stripe.com/docs/api/idempotent_requests) for an example.

Many operations are naturally idempotent. If you encode a video twice, while it may be a waste of time, you still have the same video. If you delete the same file twice, the second deletion does nothing.

Some operations are not idempotent but duplication may be tolerable. If you are unsure if an email was actually sent, sending a duplicate email might be preferable to risking that no email was sent at all. However, it is important to carefully consider the implications of ignoring this constraint before doing so.
