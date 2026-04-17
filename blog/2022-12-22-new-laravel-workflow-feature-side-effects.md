---
slug: new-laravel-workflow-feature-side-effects
title: "New Workflow Feature: Side Effects"
authors:
  name: Richard
  title: Core Team
  url: https://github.com/rmcdaniel
  image_url: https://github.com/rmcdaniel.png
tags: [side-effects, random, determinism]
---

Workflows provide a more organized and structured approach to managing distributed processes, making it easier for developers to understand and work with complex logic.

Workflow is a powerful package for the Laravel web framework that provides tools for defining and managing workflows.

One of the key features of any workflow engine is the ability to track the history of a workflow as it is executed which allows a workflow to be retried if it fails or encounters an error. However, this also means that your workflow code must be deterministic and any non-deterministic code has to be carefully managed.

Recently, the Workflow package added support for [side effects](https://durable-workflow.com/docs/features/side-effects), which are closures containing non-deterministic code that is only executed once and the result saved. Side effects are a useful way to introduce non-deterministic behavior into a workflow, such as generating a random number or UUID.

Here is an example workflow that demonstrates side effects.

```php
use Workflow\Workflow;
use function Workflow\{activity, sideEffect};

class SideEffectWorkflow extends Workflow  
{  
    public function execute()  
    {  
        $sideEffect = yield sideEffect(  
          fn () => random_int(PHP_INT_MIN, PHP_INT_MAX)  
        );  
  
        $badSideEffect = random_int(PHP_INT_MIN, PHP_INT_MAX);  
  
        $result1 = yield activity(SimpleActivity::class, $sideEffect);  
  
        $result2 = yield activity(SimpleActivity::class, $badSideEffect);  
  
        if ($sideEffect !== $result1) {  
            throw new Exception(  
                'These side effects should match because it was properly wrapped in sideEffect().'  
            );  
        }  
  
        if ($badSideEffect === $result2) {  
            throw new Exception(  
                'These side effects should not match because it was not wrapped in sideEffect().'  
            );  
        }  
    }  
}
```

The activity doesn’t actually do anything. It just takes the input and passes it back out unmodified, so that we can compare the result to what we generated inside of the workflow.

```php
class SimpleActivity extends Activity  
{  
    public function execute($input)  
    {  
        return $input;  
    }  
}
```

In this example, the workflow generates two random integers: one using a side effect and the other using a local variable. The values of these integers are then passed to two different activities.

The first activity receives the value of the side effect, which has been saved. As a result, the value of the side effect should remain constant throughout the execution of the workflow.

The second activity receives the value of the local variable, which is not saved and will be regenerated. This means that the value of the local variable will change between executions of the workflow.

As a result, it is not expected that the value of the local variable will match the value returned from the second activity. The odds of two random integers generated using `random_int(PHP_INT_MIN, PHP_INT_MAX)` being equal are extremely low, since there are a very large number of possible integers in this range.

It’s important to use side effects appropriately in your workflow to ensure that your workflow is reliable and can recover from failures. Only use side effects for short pieces of code that cannot fail, and make sure to use activities to perform long-running work that may fail and need to be retried, such as API requests or external processes.

Overall, side effects are a powerful tool for introducing non-deterministic behavior into your workflows. When used correctly, they can help you to add more flexibility and complexity to your application’s logic.

Workflow is a powerful tool for managing workflows in your Laravel applications, and the addition of support for side effects makes it even more powerful!
