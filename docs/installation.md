---
sidebar_position: 3
---

# Installation

This guide covers installing the Durable Workflow PHP package for Laravel applications.

If you are deciding between package embedding and the standalone server, start
with [Deployment Modes](/docs/polyglot/deployment-modes). This page covers
the embedded Laravel path.

> **Prefer to start from a working app?** The
> [Sample App](/docs/sample-app) is a runnable Laravel 13 project on
> Durable Workflow 2.0 with one workflow per pattern surface, a Codespaces
> flow, and a `docker compose` flow. Clone it, run `php artisan app:init`,
> and you have the same install applied for you. Come back here when you
> are ready to add Durable Workflow to your own Laravel application.

## Requirements

- PHP 8.2 or later in the supported PHP 8.x line
- Laravel 12.72 or later in 12.x, or Laravel 13.41 or later in 13.x
- PHP 8.3 or later for Laravel 13

These requirements apply to the current embedded release. For an older
application, choose the appropriate [published support line](./compatibility.md#laravel-support)
before updating Composer. The bare service-mode PHP SDK has its own requirements.

Check [Database Compatibility](./polyglot/database-support.md) for the embedded
and Server declarations, exact tested configurations and qualification limits.

Durable Workflow can be used with any queue driver that Laravel supports (except the `sync` driver), including:

- Amazon SQS
- Beanstalkd
- Database
- Redis

Each queue driver has its own [prerequisites](https://laravel.com/docs/12.x/queues#driver-prerequisites).

Durable Workflow also requires a cache driver that supports [locks](https://laravel.com/docs/12.x/cache#atomic-locks).

## Installing Durable Workflow

Durable Workflow is installable via Composer:

```bash
composer require %%artifact.workflowComposerPackage%%
```

Composer pins the published embedded release above. Review the
[Laravel support and upgrade boundary](./compatibility.md#laravel-support)
before widening that constraint or upgrading an older Laravel application.

The package auto-loads its migrations, so a normal migrate run is enough after install:

```bash
php artisan migrate
```

## Running Workers

Durable Workflow uses queues to run workflows and activities in the background. You will need to either run the `queue:work` [command](https://laravel.com/docs/12.x/queues#the-queue-work-command) or use [Horizon](https://laravel.com/docs/12.x/horizon) to run your queue workers. Without a queue worker, workflows and activities will not be processed. To run workflows and activities in parallel, you will need more than one queue worker.

### Worker timeout {#worker-timeout}

When PHP has the `pcntl` extension, a queue worker kills any job that runs longer than its timeout: the worker's `--timeout`, 60 seconds by default, unless the job sets its own. A workflow task that is killed loses its lease and is rolled back. It is retried only after the lease expires (`workflows.v2.workflow_task_lease_seconds`, 300 seconds by default), and the retry repeats the same work. A workflow task that always needs longer than the timeout, such as one that schedules or finishes a wide `all()`, never completes.

Three settings must line up:

- The **workflow task timeout** must be below the **workflow task lease**. Work that runs past the lease cannot complete.
- The queue connection's **`retry_after`** must exceed the timeout of every job on it, as Laravel requires. Otherwise the queue hands a job that is still running to a second worker.
- **Activities** should keep a bounded timeout, so that a hung activity cannot hold a worker forever. Do not use `--timeout=0`.

Run workflow tasks on their own queue connection whose `retry_after` exceeds the lease, with workers whose `--timeout` is below the lease. Run activities on another queue with a timeout that suits them. Activities use their workflow's queue unless the activity class sets its own `$connection` or `$queue`.

```php
// config/queue.php: a connection for workflow tasks
'workflows' => [
    'driver' => 'redis',
    'connection' => 'default',
    'queue' => 'workflows',
    'retry_after' => 330, // above the 300-second workflow task lease
],
```

```bash
# DW_V2_CONNECTION=workflows DW_V2_QUEUE=workflows
php artisan queue:work workflows --queue=workflows --timeout=270
php artisan queue:work --queue=default --timeout=60
```

In Horizon, each supervisor's `timeout` option is the worker timeout. Newer Workflow releases give every workflow task job this timeout (the lease less 30 seconds, kept 10 seconds below `retry_after`), so a short worker timeout no longer kills workflow tasks. A worker on the workflow queue logs a warning at start when `retry_after` limits workflow tasks.
