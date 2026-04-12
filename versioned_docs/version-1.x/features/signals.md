---
sidebar_position: 1
---

import SignalSimulator from '@site/src/components/SignalSimulator';

# Signals

Signals allow you to trigger events in a workflow from outside the workflow. This can be useful for reacting to external events, enabling *human-in-the-loop* interventions, or for signaling the completion of an external task.

To define a signal method on your workflow, use the `SignalMethod` annotation. The method will be called with any arguments provided when the signal is triggered:

```php
use Workflow\SignalMethod;
use Workflow\Workflow;

class MyWorkflow extends Workflow
{
    private $ready = false;

    #[SignalMethod]
    public function setReady($ready)
    {
        $this->ready = $ready;
    }
}
```

To trigger a signal on a workflow, call the method on the workflow instance. The signal method accepts optional arguments that will also be passed to it.

```php
use Workflow\WorkflowStub;

$workflow = WorkflowStub::load($workflowId);

$workflow->setReady(true);
```

The `await()` function can be used in a workflow to pause execution until a specified condition is met. For example, to pause the workflow until a signal is received, the following code can be used:

```php
use function Workflow\await;
use Workflow\SignalMethod;
use Workflow\Workflow;

class MyWorkflow extends Workflow
{
    private $ready = false;

    #[SignalMethod]
    public function setReady($ready)
    {
        $this->ready = $ready;
    }

    public function execute()
    {
        yield await(fn () => $this->ready);
    }
}
```

<SignalSimulator />

**Important:** The `await()` function should only be used in a workflow, not an activity.

## Inbox

Workflows often need to handle multiple incoming signals over time. To solve this, workflows include a built-in replay-safe `$this->inbox`.

The inbox collects incoming signal values and lets you consume them exactly once, even if the workflow is replayed or resumed multiple times.

```php
use function Workflow\await;
use Workflow\SignalMethod;
use Workflow\Workflow;

class MyWorkflow extends Workflow
{
    #[SignalMethod]
    public function send(string $message): void
    {
        $this->inbox->receive($message);
    }

    public function execute()
    {
        while (true) {
            yield await(fn () => $this->inbox->hasUnread());

            $message = $this->inbox->nextUnread();
        }
    }
}
```

Each received signal is stored in the inbox. The inbox tracks which messages have already been read. On replay, previously read messages remain read. Only unread messages are returned by `nextUnread()`. This makes the inbox safe to use in `await()` conditions and inside long-running loops.
