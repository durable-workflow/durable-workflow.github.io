---
sidebar_position: 3
---

# Installation

This guide covers installing the Durable Workflow PHP package for Laravel applications.

If you are deciding between package embedding and the standalone server, start
with [Deployment Modes](/docs/2.0/polyglot/deployment-modes). This page covers
the embedded Laravel path.

> **Prefer to start from a working app?** The
> [Sample App](/docs/2.0/sample-app) is a runnable Laravel 13 project on
> Durable Workflow 2.0 with one workflow per pattern surface, a Codespaces
> flow, and a `docker compose` flow. Clone it, run `php artisan app:init`,
> and you have the same install applied for you. Come back here when you
> are ready to add Durable Workflow to your own Laravel application.

## Requirements

- PHP 8.1 or later
- Laravel 9 or later

Durable Workflow can be used with any queue driver that Laravel supports (except the `sync` driver), including:

- Amazon SQS
- Beanstalkd
- Database
- Redis

Each queue driver has its own [prerequisites](https://laravel.com/docs/12.x/queues#driver-prerequisites).

Durable Workflow also requires a cache driver that supports [locks](https://laravel.com/docs/12.x/cache#atomic-locks).

## Installing Durable Workflow

Durable Workflow is installable via Composer. During the 2.0 pre-stable ramp,
use the current public artifact pin so Composer receives the matching
prerelease stability suffix:

```bash
composer require %%artifact.workflowComposerPackage%%
```

Switch to a normal stable constraint such as `durable-workflow/workflow:^2.0`
only after `2.0.0` is tagged stable on Packagist and the documented 2.0
cutover is authorized. See the [compatibility and release-authority
contract](/docs/2.0/compatibility) for the platform-wide stability rules; the
prerelease suffix on the Composer pin applies only to package install
resolution and does not change the stability of any other published surface.

The package auto-loads its migrations, so a normal migrate run is enough after install:

```bash
php artisan migrate
```

## Running Workers

Durable Workflow uses queues to run workflows and activities in the background. You will need to either run the `queue:work` [command](https://laravel.com/docs/12.x/queues#the-queue-work-command) or use [Horizon](https://laravel.com/docs/12.x/horizon) to run your queue workers. Without a queue worker, workflows and activities will not be processed. To run workflows and activities in parallel, you will need more than one queue worker.
