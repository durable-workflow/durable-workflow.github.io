---
sidebar_position: 9
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

## Compensation ordering

By default, compensations execute **sequentially in reverse registration order**. This is the safest default because later steps may depend on earlier ones.

## Parallel compensation

To run compensations in parallel, use `setParallelCompensation(true)`. When parallel compensation is enabled, each compensation closure should return a started (but not awaited) activity call so the engine can execute them concurrently:

```php
use function Workflow\V2\activity;
use function Workflow\V2\startActivity;
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
            $this->addCompensation(fn () => startActivity(CancelFlightActivity::class, $flightId));

            $hotelId = activity(BookHotelActivity::class);
            $this->addCompensation(fn () => startActivity(CancelHotelActivity::class, $hotelId));

            activity(ChargePaymentActivity::class);
        } catch (\Throwable $e) {
            $this->compensate();

            throw $e;
        }
    }
}
```

Use `startActivity()` (not `activity()`) inside parallel compensation closures. `startActivity()` returns a pending call that the engine collects and runs through `all()`, while `activity()` would block inline and defeat the purpose of parallelism.

## Continue with error

By default, if a compensation activity throws an exception, the remaining compensations are skipped and the error propagates. To run all compensations regardless of individual failures, use `setContinueWithError(true)`:

```php
$this->setContinueWithError(true);
```

When enabled, the engine catches and discards exceptions from each compensation closure and continues to the next one. This is useful when compensations are independent and you want a best-effort cleanup even if some steps fail.

## How it works

- `addCompensation()` registers a callable that will be invoked during `compensate()`
- `compensate()` iterates the registered compensations in reverse order
- each compensation closure is a normal V2 workflow step — the activities it calls produce durable history events just like any other activity
- compensation activities are visible in Waterline's timeline and history export
- if the workflow succeeds, compensation closures are never invoked and produce no history
