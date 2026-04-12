---
sidebar_position: 1
---

# Workflows

Workflows and activities are defined as classes that extend the base `Workflow` and `Activity` classes provided by the framework. A workflow is a class that defines a sequence of activities that run in parallel, series or a mixture of both.

## Scaffolding

You may use the `make:workflow` artisan command to generate a new workflow:

```php
php artisan make:workflow MyWorkflow
```

The generated workflow extends `Workflow\V2\Workflow` and uses straight-line helper calls inside an ordinary `handle()` method:

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

`handle()` is the canonical workflow entry method. Existing workflows that still implement `execute()` continue to load through a compatibility path so older code can still replay, but new code should use `handle()` only.

Do not mix `handle()` and `execute()` across a workflow inheritance chain. The runtime rejects mixed hierarchies before a start, webhook dispatch, child launch, or replay path can create durable work with an ambiguous entry method.
