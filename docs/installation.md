---
sidebar_position: 2
---

# Installation

This guide covers installing the Durable Workflow PHP package for Laravel applications.

**Alternative**: For polyglot environments, Python workers, or non-Laravel deployments, see [Server Setup](/docs/2.0/polyglot/server) to run the standalone server.

## Requirements

Durable Workflow requires the following to run:

- PHP 8.1 or later
- Laravel 9 or later

Durable Workflow has two task dispatch modes, controlled by `workflows.v2.task_dispatch_mode`:

- **Queue mode** (default, `queue`): workflow and activity tasks are dispatched onto a Laravel queue and picked up by a `queue:work` worker in the same Laravel process. This is the standard embedded setup.
- **Poll mode** (`poll`): external workers claim tasks over HTTP. The standalone server defaults to this mode, and the Laravel queue is not used for task delivery.

Queue-driver requirements depend on the mode:

- In **queue mode**, Durable Workflow requires an asynchronous driver. The `sync` driver is not supported because it executes jobs inline on the request thread, which cannot provide the worker/lease boundary durable workflows rely on. Any other driver Laravel supports works: Amazon SQS, Beanstalkd, Database, Redis.
- In **poll mode**, the Laravel queue is unused for workflow and activity dispatch, so a `sync` driver or a missing queue connection is acceptable. Timer tasks still dispatch locally in embedded deployments, so set a real queue driver if you run timers on the same node.

Each queue driver has its own [prerequisites](https://laravel.com/docs/12.x/queues#driver-prerequisites).

Durable Workflow also requires a cache driver that supports [locks](https://laravel.com/docs/12.x/cache#atomic-locks).

> ✨ SQS Support: `timer()` and `await()` with `timeout:` work with any duration, even when using the SQS queue driver. Durable Workflow automatically handles SQS's delay limitation transparently.

You can inspect the backend capability contract directly from the app:

```bash
php artisan workflow:v2:doctor --strict
```

The command checks the configured database, queue, and cache stores. In queue mode, `--strict` exits with a failure when a required capability is missing, such as using the `sync` queue driver. In poll mode the same queue diagnostics are rendered as informational notes and `--strict` still succeeds, because the Laravel queue is not on the task-delivery path. Use `--json` when you want the same capability snapshot in CI, health checks, or deployment automation.

The engine also checks backend capability at durable task publication time and again before a worker claim leases the task. In queue mode, if a task is routed to an unsupported queue connection, such as `sync`, the engine leaves the task in durable storage, records `last_dispatch_attempt_at` / `last_dispatch_error` for publication failures or `last_claim_failed_at` / `last_claim_error` for worker-claim failures, and lets Waterline show the run as transport-unhealthy instead of running workflow code inline. Poll-mode deployments skip this publication check because tasks are delivered over HTTP instead.

## Installing Durable Workflow

Durable Workflow is installable via Composer. Until the first stable 2.0
is published, v2 is on Packagist as an alpha pre-release, so you need
the `@alpha` stability flag when installing:

```bash
composer require durable-workflow/workflow:^2.0@alpha
```

Composer's default `minimum-stability` is `stable`, which rejects
alpha pre-release versions. The `@alpha` flag asks for this one
package at the alpha stability level without changing your project's
global minimum stability. When 2.0.0 is tagged stable on Packagist,
drop the `@alpha` and `composer update` will upgrade cleanly.

The package auto-loads its migrations, so a normal migrate run is enough after install:

```bash
php artisan migrate
```

Publishing the migration files is optional. Only do it if you intentionally need local copies of the vendor migrations for inspection or one-off customization:

```bash
php artisan vendor:publish --provider="Workflow\Providers\WorkflowServiceProvider" --tag="migrations"
```

## Running Workers

Durable Workflow uses queues to run workflows and activities in the background. You will need to either run the `queue:work` [command](https://laravel.com/docs/12.x/queues#the-queue-work-command) or use [Horizon](https://laravel.com/docs/12.x/horizon) to run your queue workers. Without a queue worker, workflows and activities will not be processed. You cannot use the sync driver with queue workers. To run workflows and activities in parallel, you will need more than one queue worker.
