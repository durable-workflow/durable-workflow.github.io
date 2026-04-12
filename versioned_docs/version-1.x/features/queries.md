---
sidebar_position: 2
---

import QuerySimulator from '@site/src/components/QuerySimulator';

# Queries

Queries allow you to retrieve information about the current state of a workflow without affecting its execution. This is useful for monitoring and debugging purposes.

To define a query method on a workflow, use the `QueryMethod` annotation:

```php
use Workflow\QueryMethod;
use Workflow\Workflow;

class MyWorkflow extends Workflow
{
    private bool $ready = false;

    #[QueryMethod]
    public function getReady(): bool
    {
        return $this->ready;
    }
}
```

To query a workflow, call the method on the workflow instance. The query method will return the data from the workflow.

```php
use Workflow\WorkflowStub;

$workflow = WorkflowStub::load($workflowId);

$ready = $workflow->getReady();
```

<QuerySimulator />

**Important:** Querying a workflow does not advance its execution, unlike signals.

# Updates

Updates allow you to retrieve information about the current state of a workflow and mutate the workflow state at the same time. They are essentially both a query and a signal combined into one.

To define an update method on a workflow, use the `UpdateMethod` annotation:

```php
use Workflow\UpdateMethod;
use Workflow\Workflow;

class MyWorkflow extends Workflow
{
    private bool $ready = false;

    #[UpdateMethod]
    public function updateReady($ready): bool
    {
        $this->ready = $ready;

        return $this->ready;
    }
}
```

## Outbox

The outbox collects outgoing query messages and lets you produce them exactly once, even if the workflow is replayed or resumed multiple times.

```php
use Workflow\UpdateMethod;
use Workflow\Workflow;

class MyWorkflow extends Workflow
{
    #[UpdateMethod]
    public function receive()
    {
        return $this->outbox->nextUnsent();
    }

    public function execute()
    {
        $count = 0;
        while (true) {
            $count++;

            $this->outbox->send("Message {$count}");
        }
    }
}
```

Each sent signal is stored in the outbox. The outbox tracks which messages have already been sent. On replay, previously read messages remain sent. Only unsent messages are returned by `nextUnsent()`. This makes the outbox safe to send multiple messages inside long-running loops.
