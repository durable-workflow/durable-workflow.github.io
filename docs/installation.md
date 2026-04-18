---
sidebar_position: 3
---

# Installation

This guide covers installing the Durable Workflow PHP package for Laravel applications.

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

> ✨ SQS Support: `timer()` and `await()` with `timeout:` work with any duration, even when using the SQS queue driver. Durable Workflow automatically handles SQS's delay limitation transparently.

You can verify your environment with:

```bash
php artisan workflow:v2:doctor --strict
```

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

## Running Workers

Durable Workflow uses queues to run workflows and activities in the background. You will need to either run the `queue:work` [command](https://laravel.com/docs/12.x/queues#the-queue-work-command) or use [Horizon](https://laravel.com/docs/12.x/horizon) to run your queue workers. Without a queue worker, workflows and activities will not be processed. To run workflows and activities in parallel, you will need more than one queue worker.
