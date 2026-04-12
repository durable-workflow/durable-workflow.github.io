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
use function Workflow\activity;
use Workflow\Workflow;

class BookingSagaWorkflow extends Workflow
{
    public function execute()
    {
        try {
            $flightId = yield activity(BookFlightActivity::class);
            $this->addCompensation(fn () => activity(CancelFlightActivity::class, $flightId));

            $hotelId = yield activity(BookHotelActivity::class);
            $this->addCompensation(fn () => activity(CancelHotelActivity::class, $hotelId));

            $carId = yield activity(BookRentalCarActivity::class);
            $this->addCompensation(fn () => activity(CancelRentalCarActivity::class, $carId));
        } catch (Throwable $th) {
            yield from $this->compensate();
            throw $th;
        }
    }
}
```

By default, compensations execute sequentially in the reverse order they were added. To run them in parallel, use `$this->setParallelCompensation(true)`. To ignore exceptions that occur inside compensation activities while still running them sequentially, use `$this->setContinueWithError(true)` instead.
