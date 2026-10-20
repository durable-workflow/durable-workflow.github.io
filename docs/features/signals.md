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

## Acceptance and closure

`signal_received` confirms durable acceptance. It does not confirm that workflow
code processed the signal. Inspect the signal's retained status and history when
the business operation needs confirmation.

With Core 2.7.0 or a compatible Server, eligible signals accepted during a remote
workflow task get a delivery turn before successful closure. Received signals
addressed to the instance and declared by its command contract carry across [continue-as-new](./continue-as-new.md)
with their original identity, arguments and ordering. A signal addressed to a
specific run never moves to another run.

Runs without a durable signal declaration do not gain one from a worker's
later registration. If the runtime cannot establish delivery, the accepted
signal closes with the explicit rejected disposition below.

If a run closes without applying a signal, its status becomes `rejected` with
`run_closed_before_signal_applied`, a closed timestamp and a `SignalRejected`
history event. This includes an unused buffered signal at ordinary completion
and signals that cannot be applied before failure, cancellation or timeout.
The earlier acceptance receipt remains valid. Use an [update](./updates.md) when
the caller needs a retained processing result, rather than an acceptance alone.

Before upgrading a writer to Core 2.7.0, drain and upgrade every embedded or
direct-database reader, including Waterline when it reads the same database.
Older readers cannot decode `SignalRejected`; do not leave them running against
the new writer or roll back a reader after that event has been stored.

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

## Evolve a signal payload {#evolve-a-signal-payload}

Use one declared map argument for an application payload that needs compatible
additions. Keep its required fields and their meaning stable, give new optional
fields explicit defaults, and preserve readers for recorded older values.
This application contract is separate from the fixed Avro Value wire schema.

A run keeps the signal declarations and defaults recorded when it started.
Changing a current handler signature does not rewrite that contract or authorize
a different workflow definition to replay the run.

## After an uncertain response {#after-an-uncertain-response}

A timeout or lost response can happen after a signal has been durably admitted.
A later closed-run or not-found response describes that later request; it does
not establish whether the original signal was applied. A status check before
sending also leaves a gap in which the workflow can close or continue as new.

Keep the original namespace, workflow identity, signal name, arguments and
application operation key when investigating an uncertain delivery. Repeating
a signal must follow the target's actual duplicate-handling contract. Do not
start a replacement workflow merely because the retry was refused.

See [recovering an uncertain command](./updates.md#recover-after-an-uncertain-response)
for retained update inspection and application-owned reconciliation.

## Sender identity and authorization

`approvedBy` is application data. The string `Taylor` in the example is not
proof of an authenticated sender. A `#[Signal]` contract validates the signal
name and arguments; your Laravel application must authenticate the caller and
authorize the operation before admitting the signal.

For example, an approval endpoint can use the authenticated user and an order
policy. This application defines an `Order` model with stored
`workflow_instance_id` and `workflow_namespace` fields, and registers an
`approve` policy that checks the user's access to that order. The endpoint
does not take the actor or workflow routing values from the request body:

```php
use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Route;
use Workflow\V2\CommandContext;
use Workflow\V2\WorkflowStub;

Route::post('/orders/{order}/approve', function (Request $request, Order $order) {
    $user = $request->user();
    Gate::forUser($user)->authorize('approve', $order);

    $actorId = (string) $user->getAuthIdentifier();
    $context = CommandContext::phpApi()->withPrincipal('user', $actorId);

    $result = WorkflowStub::load(
        $order->workflow_instance_id,
        $order->workflow_namespace,
    )->withCommandContext($context)->attemptSignalWithArguments('approved-by', [
        'approvedBy' => $actorId,
    ]);

    return response()->json([
        'accepted' => $result->accepted(),
        'outcome' => $result->outcome(),
        'command_id' => $result->commandId(),
    ], $result->accepted() ? 202 : 409);
})->middleware('auth');
```

The policy check happens before loading or signaling the workflow. Every
approval entry point must enforce the same application policy, including any
webhook or administrative endpoint that can send this signal. Inside the
workflow, `await('approved-by')` receives the recorded argument; it does not
return an authenticated-sender object or perform another permission check.

The command's audit identity is separate from that argument.
`withCommandContext()` records the context on the `WorkflowCommand` identified
by `commandId()`. Its `context.principal` and `principalType()`, `principalId()`
and `principalLabel()` accessors support host-side audit inspection; linked
history and operator views can display the recorded command attribution.
Missing attribution does not establish a sender identity.

`CommandContext::withPrincipal()` records what trusted host code supplies. It
does not authenticate a user or authorize a signal. Keep that context outside
caller-controlled input, and do not use a live HTTP session or a database
lookup of current permissions inside deterministic workflow replay.

Service-mode SDK calls use the Server's HTTP authorization boundary instead
of this embedded route. See
[Signal authorization and attribution](/docs/polyglot/namespace-auth-workers#signal-authorization-and-attribution)
for credentials, trusted gateways and audit identity.

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
