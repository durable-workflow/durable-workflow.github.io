---
sidebar_position: 11
---

# Sagas

This guide covers compensation in embedded Laravel workflows using
`Workflow\V2\Workflow`. For service-mode workers, use the
[PHP SDK guide](https://php.durable-workflow.com/build/workflows-activities/),
[Python SDK guide](https://python.durable-workflow.com/sdk-reference/#saga-compensation), or
[Rust SDK reference](https://rust.durable-workflow.com/durable_workflow/struct.Saga.html).

Sagas are an established design pattern for managing complex, long-running operations:

- A saga manages distributed transactions using a sequence of local transactions.
- A local transaction is a work unit performed by a saga participant (an activity).
- Each operation in the saga can be reversed by a compensatory activity.
- Workflow code decides when to invoke compensation. Compensation can fail and must have time and working workers to complete.

```php
use function Workflow\V2\activity;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

#[Type('booking-saga')]
class BookingSagaWorkflow extends Workflow
{
    public function handle(): array
    {
        try {
            $flightId = activity(BookFlightActivity::class);
            $this->addCompensation(fn () => activity(CancelFlightActivity::class, $flightId));

            $hotelId = activity(BookHotelActivity::class);
            $this->addCompensation(fn () => activity(CancelHotelActivity::class, $hotelId));

            $carId = activity(BookRentalCarActivity::class);
            $this->addCompensation(fn () => activity(CancelRentalCarActivity::class, $carId));

            return compact('flightId', 'hotelId', 'carId');
        } catch (\Throwable $e) {
            $this->compensate();

            throw $e;
        }
    }
}
```

When the workflow catches an exception, `$this->compensate()` runs every registered compensation in **reverse order**. In the example above, if `BookRentalCarActivity` fails, the engine cancels the hotel first and then the flight — unwinding the saga from the most recent step backward.

Register each compensation after its forward activity succeeds. Replay
reconstructs that registration order and reuses recorded activity results,
including completed compensations.

## Deadline-driven compensation

An engine [workflow timeout](./timeouts.md#timeout-outcome-and-cleanup) closes
the run before workflow code can run compensation. A `catch` or `finally` block
does not change that behavior. Immediate `cancel()` and `terminate()` commands
also provide no cleanup window.

Use an earlier application deadline when timeout should undo completed work.
This embedded workflow reserves a resource, then waits up to 30 seconds for a
confirmation signal. Expiry resumes workflow code, which releases the
reservation before returning an `expired` business result:

```php
use function Workflow\V2\{activity, await};
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Support\ActivityOptions;
use Workflow\V2\Workflow;

#[Type('reservation-deadline')]
#[Signal('confirm')]
final class ReservationDeadlineWorkflow extends Workflow
{
    public function handle(string $orderId): array
    {
        $reservationId = activity(
            ReserveResourceActivity::class,
            new ActivityOptions(scheduleToCloseTimeout: 30),
            $orderId,
        );
        $this->addCompensation(fn () => activity(
            ReleaseResourceActivity::class,
            new ActivityOptions(scheduleToCloseTimeout: 30),
            $reservationId,
        ));

        if (await('confirm', timeout: 30) === null) {
            $this->compensate();

            return ['status' => 'expired'];
        }

        return ['status' => 'confirmed'];
    }
}
```

`ReserveResourceActivity` and `ReleaseResourceActivity` are your application's
activities. Make both idempotent, with a stable business key for the reservation.
The wait starts after the reservation succeeds. Send `confirm` without
arguments so its successful result is `true`; `null` means the wait expired.

Start it with a larger engine limit as a backstop:

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(ReservationDeadlineWorkflow::class, 'order-123');
$workflow->start(
    'order-123',
    StartOptions::rejectDuplicate()->withRunTimeout(300),
);

// From an authenticated application action, before the wait expires:
WorkflowStub::load('order-123')->signal('confirm');
```

An expired wait with successful compensation completes normally with
`status: expired` in its output. It is not an engine-timed-out run. If the release
activity fails, `compensate()` propagates that failure. If the engine deadline
arrives first, the run closes and remaining compensation cannot execute.
Allow enough time for scheduling and retries, and account for an earlier
execution deadline if one is configured.

The separate cooperative `requestCancellation()` operation is available for
caller-requested cleanup while a run is active. Use its bounded cancellation
shield for durable cleanup under a cancellation request. It is not triggered
automatically by a workflow timeout. See
[Cooperative Cancellation](../polyglot/cancellation.md).

## Compensation ordering

By default, compensations execute **sequentially in reverse registration order**. This is the safest default because later steps may depend on earlier ones.

By default, `compensate()` stops at the first compensation failure and
propagates it to the caller.

## Parallel compensation

To run compensations in parallel, use `setParallelCompensation(true)`. When parallel compensation is enabled, each compensation closure should return a started (but not awaited) activity call so the engine can execute them concurrently:

```php
use function Workflow\V2\activity;

use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

#[Type('parallel-saga')]
class ParallelSagaWorkflow extends Workflow
{
    public function handle(): void
    {
        $this->setParallelCompensation(true);

        try {
            $flightId = activity(BookFlightActivity::class);
            $this->addCompensation(fn () => activity(CancelFlightActivity::class, $flightId));

            $hotelId = activity(BookHotelActivity::class);
            $this->addCompensation(fn () => activity(CancelHotelActivity::class, $hotelId));

            activity(ChargePaymentActivity::class);
        } catch (\Throwable $e) {
            $this->compensate();

            throw $e;
        }
    }
}
```

When parallel compensation is enabled, compensation closures return activity calls that the engine collects and runs through `all()`.

## Continue with error

By default, if a compensation activity throws an exception, the remaining compensations are skipped and the error propagates. To run all compensations regardless of individual failures, use `setContinueWithError(true)`:

```php
$this->setContinueWithError(true);
```

When enabled, the engine catches and discards exceptions from each compensation closure and continues to the next one. This is useful when compensations are independent and you want a best-effort cleanup even if some steps fail.

### Combining both flags

`setParallelCompensation(true)` and `setContinueWithError(true)` can be used together. When both are enabled, all compensations run concurrently through `all()`, and if any compensation throws, the error is caught so the remaining compensations still complete. Without `setContinueWithError(true)`, a parallel compensation failure propagates immediately and the workflow fails.

```php
$this->setParallelCompensation(true);
$this->setContinueWithError(true);
```

## How it works

- `addCompensation()` registers a callable that will be invoked during `compensate()`
- `compensate()` iterates the registered compensations in reverse order
- each compensation closure is a normal V2 workflow step — the activities it calls produce durable history events just like any other activity
- compensation activities are visible in Waterline's timeline and history export
- if the workflow succeeds, compensation closures are never invoked and produce no history

## Run this pattern

The signal-driven travel-agent saga in the
[Sample App](/docs/sample-app) is the runnable reference for this
page. Clone the sample app, set `OPENAI_API_KEY`, and run:

```bash
php artisan app:ai
```

`App\Workflows\Ai\AiWorkflow` registers compensations on every booking
activity, so a flight failure after a successful hotel booking unwinds
the hotel through the compensation list — the same pattern this page
describes, with the events visible in Waterline's run timeline.
