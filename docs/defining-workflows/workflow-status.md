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
