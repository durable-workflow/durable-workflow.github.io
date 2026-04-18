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

## Installing Durable Workflow

Durable Workflow is installable via Composer. Use the `@alpha` stability flag while 2.0 is in pre-release:

```bash
composer require durable-workflow/workflow:^2.0@alpha
```

Drop the `@alpha` once 2.0.0 is tagged stable on Packagist.

The package auto-loads its migrations, so a normal migrate run is enough after install:

```bash
php artisan migrate
```

## Running Workers

Durable Workflow uses queues to run workflows and activities in the background. You will need to either run the `queue:work` [command](https://laravel.com/docs/12.x/queues#the-queue-work-command) or use [Horizon](https://laravel.com/docs/12.x/horizon) to run your queue workers. Without a queue worker, workflows and activities will not be processed. To run workflows and activities in parallel, you will need more than one queue worker.
