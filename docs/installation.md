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
