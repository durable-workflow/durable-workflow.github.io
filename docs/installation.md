---
sidebar_position: 2
---

# Installation

This guide covers installing the Durable Workflow PHP package for Laravel applications.

**Alternative**: For polyglot environments, Python workers, or non-Laravel deployments, see [Server Setup](/docs/2.0/server-setup) to run the standalone server.

## Requirements

Durable Workflow requires the following to run:

- PHP 8.1 or later
- Laravel 9 or later

Durable Workflow can be used with any queue driver that Laravel supports (except the `sync` driver), including:

- Amazon SQS
- Beanstalkd
- Database
- Redis

Each queue driver has its own [prerequisites](https://laravel.com/docs/12.x/queues#driver-prerequisites).

Durable Workflow also requires a cache driver that supports [locks](https://laravel.com/docs/12.x/cache#atomic-locks).

> ✨ SQS Support: `timer()` and `awaitWithTimeout()` work with any duration, even when using the SQS queue driver. Durable Workflow automatically handles SQS's delay limitation transparently.

You can inspect the backend capability contract directly from the app:

```bash
php artisan workflow:v2:doctor --strict
```

The command checks the configured database, queue, and cache stores. `--strict` exits with a failure when a required capability is missing, such as using the `sync` queue driver. Use `--json` when you want the same capability snapshot in CI, health checks, or deployment automation.

The engine also checks backend capability at durable task publication time and again before a worker claim leases the task. If a task is routed to an unsupported queue connection, such as `sync`, the engine leaves the task in durable storage, records `last_dispatch_attempt_at` / `last_dispatch_error` for publication failures or `last_claim_failed_at` / `last_claim_error` for worker-claim failures, and lets Waterline show the run as transport-unhealthy instead of running workflow code inline.

## Installing Durable Workflow

Durable Workflow is installable via Composer. To install it, run the following command in your Laravel project:

```bash
composer require durable-workflow/workflow:^2.0
```

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
