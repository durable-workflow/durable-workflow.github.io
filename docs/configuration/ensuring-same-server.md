---
sidebar_position: 3
title: Worker Placement and Affinity
description: Choose queue routing, local activities, or worker sessions without treating a queue name as physical-host affinity.
tags:
  - configuration
  - workers
  - affinity
keywords:
  - activity worker affinity
  - dedicated activity queue
  - same process activity
  - worker sessions
---

# Worker Placement and Affinity

A queue name is a routing boundary, not a physical-host affinity guarantee. Setting
the `$queue` property on a workflow or activity restricts which workers may claim
the task, but any compatible worker polling that queue can receive it. Do not pass
data between ordinary activities through a worker's local filesystem unless the
data is also stored in a durable shared location.

## Route Work to a Dedicated Worker Pool

Use a dedicated queue when a class of work needs a particular worker pool, such
as workers with a mounted shared volume or a GPU capability:

```php
use Workflow\V2\Activity;

final class RenderVideo extends Activity
{
    public ?string $queue = 'gpu-activities';
}
```

Start only the intended Laravel workers on that queue:

```bash
php artisan queue:work --queue=gpu-activities
```

Laravel Horizon can supervise the same queue. In either case, the guarantee is
"one of the workers assigned to this queue," not "the same process or host that
ran the previous step." Put handoff data in durable workflow payloads, external
payload storage, or another shared store available to every eligible worker.

## Choose the Affinity Contract You Need

- Use an [ordinary queued activity](/docs/2.0/defining-workflows/activities)
  when the work can run on any compatible worker in its queue.
- Use a [local activity](/docs/2.0/features/local-activities) when one short,
  retryable activity must execute inside the workflow worker process that is
  currently handling the workflow task.
- Use a [worker session](/docs/2.0/features/worker-sessions) when several durable
  activity steps must reuse one worker-session lease for process-local state,
  GPU memory, or a worker-local mounted filesystem.

Worker sessions still apply queue routing first. They add an explicit lease and
capability contract after routing, including expiry and optional reacquisition;
they do not make an individual machine immortal. If state must survive worker
loss or session reacquisition, keep it in durable shared storage.

See [Activity Execution Model](/docs/2.0/features/activity-execution-model) for
the placement comparison and [Options](/docs/2.0/configuration/options#queue)
for class-level and per-call queue configuration.
