---
sidebar_position: 1
---

# Workflows

Workflows and activities are defined as classes that extend the base `Workflow` and `Activity` classes provided by the framework. A workflow is a class that defines a sequence of activities that run in parallel, series or a mixture of both. 

You may use the `make:workflow` artisan command to generate a new workflow:

```php
php artisan make:workflow MyWorkflow
```

It is defined by extending the `Workflow` class and implementing the `execute()` method.

```php
use function Workflow\activity;
use Workflow\Workflow;

class MyWorkflow extends Workflow
{
    public function execute()
    {
        $result = yield activity(MyActivity::class);

        return $result;
    }
}
```

The `yield` keyword is used to pause the execution of the workflow and wait for the completion of an activity.
