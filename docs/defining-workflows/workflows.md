---
sidebar_position: 1
title: Workflows
description: Define Durable Workflow v2 workflow classes and keep orchestration code deterministic.
tags:
  - authoring
  - workflows
  - determinism
keywords:
  - durable workflow workflow class
  - v2 workflow authoring
  - deterministic workflow code
---

# Workflows

Workflows and activities are defined as classes that extend the base `Workflow` and `Activity` classes provided by the framework. A workflow is a class that defines a sequence of activities that run in parallel, series or a mixture of both.

You may use the `make:workflow` artisan command to create a new workflow:

```php
php artisan make:workflow MyWorkflow
```

It is defined by extending the `Workflow` class and implementing the `handle()` method.

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle()
    {
        return activity(MyActivity::class);
    }
}
```
