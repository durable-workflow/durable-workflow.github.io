---
sidebar_position: 5
---

# Workflow Status

You can monitor the status of the workflow by calling the `running()` method, which returns `true` if the workflow is still running and `false` if it has completed or failed.

```php
while ($workflow->running());
```

## Status Values

The `status()` method returns string statuses:

```text
reserved
pending
running
waiting
cancelled
terminated
completed
failed
```

- `reserved` means an instance id has been created but the first start command has not been accepted yet
- `pending` means the run exists and has work ready to be claimed
- `running` means a workflow task is actively leased to a worker
- `waiting` means the run is blocked on a durable resume source such as an activity, timer, or named signal
- `cancelled` means an accepted engine-level cancel command closed the current run
- `terminated` means an accepted engine-level terminate command force-closed the current run
- `completed`, `failed`, `cancelled`, and `terminated` are terminal run states

When a run uses `continueAsNew()`, the old run ends with `status = completed` and `closed_reason = continued`. Waterline keeps that run in the completed bucket while still surfacing the exact `closed_reason` so operators can see that the instance rolled forward into a newer run.

`running()` returns `true` for `pending`, `running`, and `waiting`.

## Signals, Updates, and Commands

Named signal waits, explicit update commands, and `attemptSignal()` / `signal()` external input are supported. Cancellation and termination are not modeled as ordinary user-defined signals. They remain explicit runtime commands on `Workflow\V2\WorkflowStub`, which means Waterline and command history can distinguish a run that failed from a run that was cancelled, terminated, or updated on purpose.

Those command outcomes are also exposed over webhook routes:

```text
POST /webhooks/instances/{workflowId}/updates/{update}
POST /webhooks/instances/{workflowId}/cancel
POST /webhooks/instances/{workflowId}/terminate
```

Accepted update commands leave the run open while mutating replay-safe workflow state. Accepted cancel and terminate commands move the run into `cancelled` or `terminated`. Rejected commands leave the run status unchanged and currently include run-state outcomes such as `rejected_not_started` and `rejected_not_active`, plus contract-validation outcomes such as `rejected_unknown_signal` and `rejected_unknown_update`.

Waterline keeps the actual run `status` as `cancelled` or `terminated`, keeps `status_bucket = failed` as the compatibility bridge for both states, and also exposes `is_terminal = true` on list/detail payloads. Current Waterline builds use that raw `status` to offer dedicated `failed`, `cancelled`, and `terminated` list views, so operator-driven closures no longer have to hide inside the generic failed screen even though older bucket-oriented consumers can still rely on the shared failed bucket.

## State Machine

This is the state machine for a workflow status.

import ThemedImage from '@site/src/components/ThemedImage';

<ThemedImage
  lightSrc="https://mermaid.ink/img/pako:eNqVkktPhDAUhf8KuUsDhFfp0IWbMe5MjC4mUVw0tjCN0JLS-iL8dztMdIIBM3bV23O-e3LTO8CzYhwI9IYafiVorWkbvCal9Nx5vHjyguDS2yn9UjXqbau5c7F757V9KY-mRXGG3XLJhKyXsZk4w66paE5h5zF3VsrVqJk4H0y1XcPNctpfmDRC2v9i64OtMzsqzOpgM_HMqHXm13eBD7UWDIjRlvvQct3SQwnDoWEJZs9bXgJxV8YrahtTQilHh3VUPijVfpNa2XoPpKJN7yrbsdPG_bxql831VllpgKTp1APIAO9AkgyFGEUZwnGO8jgrch8-gMQFDvNNmmO0KVK0yXEy-vA5xUZhGifOHOOoiHCBsyTzgTNhlL45bv20_OMXsXQLGg?type=png"
  darkSrc="https://mermaid.ink/img/pako:eNqVkstugzAQRX8FzbICxMs4eNFNqu4qVe0iUksXVu0QK2AjY_eF-Pc6RG1EBFXqlcf3nrkaeXp4VYwDgc5Qw28ErTRtgreklJ47z1cvXhBcexul99tava81dy726Ly2K-XRNCtOsHsumZDVPDYRJ9gtFfUp7DLmwUq5GDURp4Oppq25mU_7C5NGSPtfbHmwZWZDhVkcbCJeGLXMnH0X-FBpwYAYbbkPDdcNPZTQHxqWYHa84SUQd2VU70vo5eCYlsonpZofTCtb7YBsad25yrbstG6_r9oFc71WVhogKR57AOnhA0iSoRCjKEM4zlEeZ0XuwyeQuMBhvkpzjFZFilY5TgYfvsbYKEzjxJljHBURLnCWZD5wJozSd8eVHzd_-AZPCQnb?type=png"
  lightLink="https://mermaid.live/edit#pako:eNqVkktPhDAUhf8KuUsDhFfp0IWbMe5MjC4mUVw0tjCN0JLS-iL8dztMdIIBM3bV23O-e3LTO8CzYhwI9IYafiVorWkbvCal9Nx5vHjyguDS2yn9UjXqbau5c7F757V9KY-mRXGG3XLJhKyXsZk4w66paE5h5zF3VsrVqJk4H0y1XcPNctpfmDRC2v9i64OtMzsqzOpgM_HMqHXm13eBD7UWDIjRlvvQct3SQwnDoWEJZs9bXgJxV8YrahtTQilHh3VUPijVfpNa2XoPpKJN7yrbsdPG_bxql831VllpgGTx1APIAO9AkgyFGEUZwnGO8jgrch8-gMQFDvNNmmO0KVK0yXEy-vA5xUZhGifOHOOoiHCBsyTzgTNhlL45bv20_OMXsQ4LGQ"
  darkLink="https://mermaid.live/edit#pako:eNqVkstugzAQRX8FzbICxMs4eNFNqu4qVe0iUksXVu0QK2AjY_eF-Pc6RG1EBFXqlcf3nrkaeXp4VYwDgc5Qw28ErTRtgreklJ47z1cvXhBcexul99tava81dy726Ly2K-XRNCtOsHsumZDVPDYRJ9gtFfUp7DLmwUq5GDURp4Oppq25mU_7C5NGSPtfbHmwZWZDhVkcbCJeGLXMnH0X-FBpwYAYbbkPDdcNPZTQHxqWYHa84SUQd2VU70vo5eCYlconpZofTCtb7YBsad25yrbstG6_r9oFc71WVhogGRp7AOnhA0iSoRCjKEM4zlEeZ0XuwyeQuMBhvkpzjFZFilY5TgYfvsbYKEzjxJljHBURLnCWZD5wJozSd8eVHzd_-AZOowna"
  alt="Workflow Status State Machine"
/>
