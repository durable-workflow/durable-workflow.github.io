---
sidebar_position: 12
title: Compensation Scopes
description: Retain compensation obligations beyond the workflow run that created them, and recover them after the run closes, in embedded Laravel workflows.
---

# Compensation Scopes

This guide covers retained compensation in embedded Laravel workflows using
`Workflow\V2\Workflow`. A [saga](sagas.md) compensates inside the run that
registered it. A compensation scope keeps each obligation in a durable ledger,
so the obligation can still be compensated after that run has completed,
failed, or been cancelled.

Use a scope when cancellation can arrive late, for example after a shipment
workflow completed and its order is cancelled days later, or when a forward
operation can take effect without returning a recorded result.

## Availability and stability

| Part | Status |
| --- | --- |
| `DurableScope`, `RegisteredObligation`, `Obligation`, `ScopeIdentity` | Stable from 2.31.0 |
| `ScopedOperation`, `OperationContext`, `ForwardResult`, `Resolution`, `HandlerRegistry` | Stable from 2.31.0 |
| `ScopeAuthorization`, `ScopeRecovery::request()`, `ScopeRecovery::describe()`, `ScopeRetention::release()` | Stable from 2.31.0 |
| `DurableScope::reserveChild()` and root admission (`RootReservationStore`) | Experimental |
| Classes marked `@internal` (activities, persistence, recovery engine) | Not public API |

The scope APIs first shipped as experimental in 2.29.0. Automatic recovery after
the originating run closes, the recovery retry schedule, and `describe()` arrive in
2.31.0. Before 2.31.0 the whole API is experimental and may change in a minor
release. From 2.31.0 the stable parts follow the
[2.x compatibility policy](../compatibility.md). Initial support is limited to
embedded Laravel and sequential compensation.

## How it works

A scope is identified by `(application, namespace, key, generation)`. Its forward
work belongs to one originating run, so choose a generation that is unique to that
run. Each obligation is registered, together with its compensation, before its
forward effect is dispatched. The ledger records:

- a closed handler type and version, never a PHP closure;
- a stable operation ID, which the handler uses to reconcile the provider;
- portable input (at most 16 KiB, 512 values and depth 8);
- forward and compensation outcomes, with evidence references.

While the originating run is open, cancelling it runs the native saga, which
compensates in reverse registration order. After the run closes, a canonical
recovery workflow compensates the same obligations from the ledger. It never
reopens the original run or changes that run's history.

## Set up the host

Bind a scope authorization policy and a closed handler registry in a service
provider. The policy returns its policy version, or throws to refuse.

```php
use App\Compensation\OrderScopeAuthorization;
use App\Compensation\StockReservation;
use Workflow\V2\Compensation\Execution\HandlerRegistry;
use Workflow\V2\Compensation\Security\ScopeAuthorization;

$this->app->singleton(ScopeAuthorization::class, OrderScopeAuthorization::class);
$this->app->singleton(HandlerRegistry::class, static fn (): HandlerRegistry => new HandlerRegistry([
    'stock.reserve' => ['1' => new StockReservation()],
]));
```

`ScopeAuthorization::assertAllowed($scope, $principal, $operation)` is called with
`register`, `forward`, `compensate`, `participate`, `request`, `release` or
`inspect`. Derive the principal from trusted application policy, never from a
request payload. Run the package migrations; they create the ledger tables on the
workflow storage connection.

## Register obligations in a workflow

```php
use Workflow\V2\Attributes\Type;
use Workflow\V2\Compensation\Definition\Obligation;
use Workflow\V2\Compensation\Definition\ScopeIdentity;
use Workflow\V2\Compensation\DurableScope;
use Workflow\V2\Exceptions\WorkflowCancellationRequestedException;
use Workflow\V2\Workflow;

#[Type('order')]
final class OrderWorkflow extends Workflow
{
    public function handle(array $identity, array $shipment): array
    {
        $scope = new DurableScope($this, ScopeIdentity::fromArray($identity), 'order-service');
        try {
            $scope->execute(new Obligation('reserve-stock', 'stock.reserve', '1', ['sku' => 'sku-1']));
            $scope->participate('shipment', ScopeIdentity::fromArray($shipment));
            // ... start the shipment workflow, wait for business events ...

            return ['status' => 'completed'];
        } catch (WorkflowCancellationRequestedException $cancelled) {
            self::cancellationShield(fn () => $this->compensate());

            return self::cancellationShield(static fn () => $scope->verifyCompensation());
        }
    }
}
```

- `execute()` registers the obligation and then runs its forward operation.
- `register()` only registers and returns a `RegisteredObligation`. Call its
  `execute()` later in the same workflow when compensation order must differ from
  dispatch order.
- `participate()` registers a child scope. Sequential compensation waits for that
  child's verified ledger before compensating earlier parent obligations. A
  missing or unverified child stops earlier parent work.

## Write a handler

```php
use InvalidArgumentException;
use Workflow\V2\Compensation\Execution\ForwardResult;
use Workflow\V2\Compensation\Execution\OperationContext;
use Workflow\V2\Compensation\Execution\Resolution;
use Workflow\V2\Compensation\Execution\ScopedOperation;

final class StockReservation implements ScopedOperation
{
    public function assertInput(array $input): void
    {
        if (! is_string($input['sku'] ?? null)) {
            throw new InvalidArgumentException('A SKU is required.');
        }
    }

    public function execute(OperationContext $context): ForwardResult
    {
        // Idempotent by operation ID: a retry or a lost acknowledgement finds the same reservation.
        $reservation = Stock::reserve($context->operationId, $context->obligation->input['sku']);

        return ForwardResult::observed(['reservation' => $reservation->id], ['stock:' . $reservation->id]);
    }

    public function compensate(OperationContext $context): Resolution
    {
        if (! Stock::release($context->operationId)) {
            return Resolution::unknown('stock-release-pending');
        }

        return Resolution::verified(['stock-release:' . $context->operationId], true);
    }
}
```

Handlers can run more than once for the same operation, so make both methods
idempotent by `operationId`. Return `ForwardResult::unknown()` when the provider
outcome is uncertain. Return `Resolution::verified()` only with evidence that the
effect is undone; a callback return, a timeout or a closed run is not that
evidence. `Resolution::unknown()` keeps the obligation unresolved and lets native
retries run.

## Cancel and recover

Request compensation with a stable request key:

```php
use Workflow\V2\Compensation\Recovery\ScopeRecovery;

$result = app(ScopeRecovery::class)->request($scope, 'cancel-order-42', 'order-service', 'customer-cancelled');
```

- If the originating run is still open, the request asks it to cancel, and its
  saga compensates.
- If that run closes with the scope still unverified, the task watchdog routes
  the same request to canonical recovery on its next pass. It runs on queue
  worker loops and in `workflow:v2:repair-pass`, and re-authorizes the original
  principal first. Concurrent passes or a racing manual request start one
  recovery run.
- If the run is already closed, the request starts canonical recovery directly.

Recovery runs make up to six attempts per compensation. Between attempts they
wait 1, 2, 5 and 10 seconds, then one activity lease plus one task-repair pass, so
a crashed worker's attempt is reclaimed before the last attempt. A child's verification, or a new
authorized request, wakes a waiting retry immediately. A persistent failure still
fails the recovery run, with the obligation left unresolved.

Inspect the outcome with `describe()`. It is read-only and requires `inspect`
authorization:

```php
$view = app(ScopeRecovery::class)->describe($scope, 'order-service');
// scopeStatus, originStatus, recoveryStatus, automaticRecovery, refusal, nextAction, unresolved
```

`nextAction` is `submit_fresh_authorized_request` when automatic recovery was
refused (`automaticRecovery: recovery_authorization_failed`) or a recovery run
failed. Submit a new request key in that case. Repeating a request key returns its
original receipt and never starts another run.

The scope ledger settles compensation. A business decision such as marking the
order `cancelled` remains your application's step after `scopeStatus` is
`verified`. The recommended pattern is a listener that finalizes the business
cancellation when a recovery run completes, as the provider example in the engine
repository does.

## Retention, upgrade and rollback

- `ScopeRetention::release($scope, $principal)` removes retained inputs and forward
  results after verification. It keeps a tombstone, so an old generation or request
  key can never be accepted again. Nothing expires automatically, and run-history
  pruning never removes the ledger.
- A schema rollback refuses before any migration runs `down()` while the ledger
  holds any scope, including a released tombstone. To go back, restore a database
  backup taken before the upgrade.
- Downgrading only the package keeps the ledger. Recovery resumes after you upgrade
  again. Do not downgrade while a recovery run is open.

## Guarantees and limits

From 2.31.0, the stable APIs do not change incompatibly within 2.x. Recorded
compensation histories replay on every later 2.x release, and new behavior arrives
only behind a recorded version marker. Ledger migrations only add.

These limits are minimums that may rise but will not fall:

- 256 obligations per scope, 16 child scopes per parent, one nesting level;
- 128 requests per scope;
- 32 evidence references of at most 128 bytes per outcome.

Not guaranteed: watchdog timing, exact retry intervals (only that recovery outlasts
one lease repair), ledger row layout, and anything marked `@internal`.
Exactly-once external effects are never promised; provider reconciliation by
operation ID is your handler's responsibility.

The engine repository's
[compensation scope guide](https://github.com/durable-workflow/workflow/blob/main/docs/compensation-scopes.md)
documents the full contract, including the experimental child reservation and root
admission APIs.
