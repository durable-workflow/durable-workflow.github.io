---
sidebar_position: 11
---

# Sagas

Sagas are an established design pattern for managing complex, long-running operations:

- A saga manages distributed transactions using a sequence of local transactions.
- A local transaction is a work unit performed by a saga participant (an activity).
- Each operation in the saga can be reversed by a compensatory activity.
- The saga pattern assures that all operations are either completed successfully or the corresponding compensation activities are run to undo any completed work.

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

The service-mode Python and Rust SDKs expose the same default policy through
language-native helpers. They reuse ordinary activity commands and history;
there is no saga-specific wire command.

### Python

```python
def forward(saga):
    flight = yield ctx.schedule_activity("trip.reserve-flight", [])
    saga.add_compensation("trip.cancel-flight", [flight])

    hotel = yield ctx.schedule_activity("trip.reserve-hotel", [])
    saga.add_compensation("trip.cancel-hotel", [hotel])

    ctx.throw_if_cancellation_requested()
    yield ctx.schedule_activity("trip.charge", [])
    return {"status": "booked"}

return (yield from ctx.saga().run(forward))
```

### Rust

```rust
let mut saga = ctx.saga();
let outcome = async {
    let flight = ctx.activity("trip.reserve-flight", json!([])).await?;
    saga.add_compensation("trip.cancel-flight", json!([flight]))?;

    let hotel = ctx.activity("trip.reserve-hotel", json!([])).await?;
    saga.add_compensation("trip.cancel-hotel", json!([hotel]))?;

    ctx.throw_if_cancellation_requested()?;
    ctx.activity("trip.charge", json!([])).await?;
    Ok(json!({"status": "booked"}))
}.await;

saga.finish(outcome).await
```

Registering after forward success is part of the deterministic contract. A
restart replays the same registration order and resumes the next uncompensated
activity. Exact duplicate completion delivery does not run a compensation
twice. Cooperative cancellation is observed only where workflow code calls the
SDK cancellation check, so authors choose a safe point after registering any
cleanup that must run.

## Compensation ordering

By default, compensations execute **sequentially in reverse registration order**. This is the safest default because later steps may depend on earlier ones.

Python and Rust stop at the first compensation failure. Their
`SagaCompensationFailed` / `Error::SagaCompensationFailed` diagnostics preserve
both the initiating failure and compensation failure, plus the failed
compensation's activity type and registration order. PHP's default also stops
and propagates on the first compensation failure; its runtime records the
initiating and compensation diagnostics together.

## Parallel compensation

Parallel compensation and continue-on-error are PHP-specific opt-in policies
at the current SDK floors. Python and Rust intentionally expose only the shared
sequential, reverse-order, stop-first policy.

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
