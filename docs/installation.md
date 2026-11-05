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

The published Workflow 2.20.x line requires:

- PHP `^8.1`
- Laravel 10–13 at the declared minimum versions in the
  [package manifest](https://github.com/durable-workflow/workflow/blob/2.20.4/composer.json)

Laravel 11 and 12 require PHP 8.2 or newer. Laravel 13 requires PHP 8.3 or
newer. See [Version Compatibility](/docs/compatibility/#embedded-php-and-laravel-support)
for the exact framework constraints and the separate PHP SDK boundary.

### Preparing for Workflow 2.21 {#preparing-for-workflow-2-21}

:::info Unreleased support change

Workflow 2.21 source requires PHP `^8.2` and Laravel `^12.69.0|^13.30.0`.
It is not published or Release-Verified yet. The install command below still
selects a published artifact. Source integration does not change that authority.

:::

Upgrade PHP 8.1 applications and Laravel 10/11 applications to a supported
platform before taking 2.21. Laravel 13 still needs PHP 8.3 or newer. Apply the
platform update to web, CLI and worker processes, retaining the existing 2.20.x
application lock while preparing and testing the upgrade. An explicit 2.21
requirement must refuse an unsupported platform. Keep Composer platform checks
and advisory blocking enabled. Retaining 2.20.x does not extend upstream
security support for the old platform.

This support change introduces no schema, history or protocol migration.
Existing v1 runs keep their v1 owner. The [migration procedure](/docs/migration/)
still governs draining or coexistence.

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

Use `durable-workflow/workflow:^2.0` when you want Composer to accept compatible
2.x updates automatically. See [Version Compatibility](/docs/compatibility)
for runtime and package compatibility rules.

The package auto-loads its migrations, so a normal migrate run is enough after install:

```bash
php artisan migrate
```

## Running Workers

Durable Workflow uses queues to run workflows and activities in the background. You will need to either run the `queue:work` [command](https://laravel.com/docs/12.x/queues#the-queue-work-command) or use [Horizon](https://laravel.com/docs/12.x/horizon) to run your queue workers. Without a queue worker, workflows and activities will not be processed. To run workflows and activities in parallel, you will need more than one queue worker.
