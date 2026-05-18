---
sidebar_position: 1
title: Signals
description: Send typed external commands into running workflows and understand signal validation, routing, and waits.
tags:
  - commands
  - signals
  - human-in-the-loop
keywords:
  - workflow signals
  - signal command
  - human in the loop workflow
---

import SignalSimulator from '@site/src/components/SignalSimulator';

# Signals

Signals allow you to trigger events in a workflow from outside the workflow. This can be useful for reacting to external events, enabling *human-in-the-loop* interventions, or for signaling the completion of an external task. For repeated ordered inputs with durable cursor advancement, use [Message Streams](./message-streams.md).

## Named Signal Waits

A workflow calls `await('signal-name')` directly. The next accepted signal command with that name resumes the run and returns a deterministic value to the suspended workflow.

```php
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;
use function Workflow\V2\await;

#[Type('order-approval')]
#[Signal('approved-by', [
    ['name' => 'approvedBy', 'type' => 'string'],
])]
final class OrderApprovalWorkflow extends Workflow
{
    public function handle(): array
    {
        $approvedBy = await('approved-by');

        return [
            'approved_by' => $approvedBy,
            'workflow_id' => $this->workflowId(),
            'run_id' => $this->runId(),
        ];
    }
}
```

Trigger the signal from PHP by addressing the public instance id:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$result = $workflow->attemptSignalWithArguments('approved-by', [
    'approvedBy' => 'Taylor',
]);

$result->accepted();    // true
$result->outcome();     // "signal_received"
$result->commandId();   // Durable signal-command id
$result->instanceId();  // "order-123"
```

Signal behavior:

- Declare each external signal name up front with a repeatable `#[Signal('signal-name')]` class attribute. Optionally include an ordered parameter contract.
- Signal commands target the public workflow instance id — not a run id — so continue-as-new chains keep the same public signal route.
- With a parameter contract, intake rejects invalid payloads as `rejected_invalid_arguments` with machine-readable `validation_errors`.
- Without a contract, `await('name')` returns `true` when no arguments were sent, the single argument when one was sent, or the full argument array when several were sent.
- Unknown signal names reject as `rejected_unknown_signal`; signals against a closed or unstarted instance reject as `rejected_not_active` or `rejected_not_started`.

<SignalSimulator />

**Important:** The `await()` function should only be used in a workflow, not an activity.

For condition waits — waiting until a predicate over durable state becomes true — see [Condition Waits](./condition-waits.md). For a timeout-backed `await`, see [Signal + Timer](./signal+timer.md). For repeated inbox/outbox flows, see [Message Streams](./message-streams.md).

## Run this pattern

The webhook-started workflow in the
[Sample App](/docs/sample-app) is the runnable reference for the
named-signal-wait pattern on this page:

```bash
php artisan app:webhook
```

`App\Workflows\Webhooks\WebhookWorkflow` starts from an HTTP webhook
ingress and parks on `await('ready')` until the matching signal lands.
Open Waterline while it is parked and you will see the
`WorkflowExecutionSignaled` event materialize the moment the signal
is accepted.
