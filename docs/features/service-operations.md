---
title: Service operations
description: Call an operation in another namespace from an embedded PHP workflow.
---

# Service operations {#service-operations}

Use a service operation when a workflow needs a durable result from a service
owned by another namespace. The caller addresses a registered endpoint, service
and operation. The runtime records the call and its result so a replacement
worker can replay the same outcome.

Child workflows and signals stay in their original namespace. Changing a child
type name or a task queue does not cross that boundary. Use a service operation
for work published in another namespace of the same Durable Workflow cluster.

## Call from embedded PHP {#call-from-embedded-php}

Register the target catalog and its handler before starting the caller. The
[service-mode guide](../polyglot/service-operations.md) explains the shared
catalog, boundary policy and independently published SDK surfaces.

```php
use Workflow\V2\Support\ServiceOperationOptions;
use Workflow\V2\Workflow;

final class CreateInvoice extends Workflow
{
    public function handle(int $invoiceId): mixed
    {
        $call = self::serviceOperation(
            'billing',
            'invoices',
            'create',
            [$invoiceId],
            new ServiceOperationOptions(
                targetNamespace: 'billing',
                modeOverride: 'sync',
                waitFor: 'completed',
                waitTimeoutSeconds: 30,
            ),
        );

        return $call->responsePayload;
    }
}
```

`serviceOperation()` returns `ServiceOperationResult`, including the durable
`serviceCallId`, lifecycle status, outcome and response payload. A terminal
service failure or cancellation is restored as a typed workflow exception at
the original call. Keep the application failure mappings available for replay.

## Choose what the caller waits for {#choose-what-the-caller-waits-for}

Use `modeOverride: 'sync'` and `waitFor: 'completed'` when the next workflow
decision depends on the service result. The workflow suspends durably while
the call remains nonterminal.

Use `modeOverride: 'async'` or `waitFor: 'accepted'` when admission is enough.
The returned record identifies the original call. Acceptance is not completed
business work, and a later target result does not rewrite the result already
recorded for an admission-only caller. Choose completion waiting initially when
the workflow needs that terminal result.

## Preserve the recorded contract {#preserve-the-recorded-contract}

Keep target namespace, endpoint/service/operation, request and waiting options
stable for an open run. Use workflow version branches for incompatible authoring
changes. Replay reuses the recorded call identity and result, rather than
requesting another execution.

An explicit idempotency key is a durable business identity. Reuse it only for
the same intended operation and request. Do not change it just because a
response was lost or a wait expired. Inspect the original call before deciding
whether another business operation is safe.

The original call deadline still applies after worker replacement. A wait
budget is not a fresh sleep on every replay. Keep workflow and service budgets
consistent, and inspect the target after a timeout instead of assuming its
external effects did not happen.

## Related guides {#related-guides}

- [Cross-namespace service calls](../polyglot/service-operations.md)
- [Child workflows](./child-workflows.md)
- [Versioning](./versioning.md)
- [Failure and recovery](../failures-and-recovery.md)
