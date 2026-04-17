---
slug: saga-pattern-and-laravel-workflow
title: "Saga Pattern and Workflow"
authors:
  name: Richard
  title: Core Team
  url: https://github.com/rmcdaniel
  image_url: https://github.com/rmcdaniel.png
tags: [sagas, microservices]
---

import ThemedImage from '@site/src/components/ThemedImage';

Suppose we are working on a Laravel application that offers trip booking. A typical trip booking involves several steps such as:

1.  Booking a flight.
2.  Booking a hotel.
3.  Booking a rental car.

Our customers expect an all-or-nothing transaction — it doesn’t make sense to book a hotel without a flight. Now imagine each of these booking steps being represented by a distinct API.

Together, these steps form a distributed transaction spanning multiple services and databases. For a successful booking, all three APIs must accomplish their individual local transactions. If any step fails, the preceding successful transactions need to be reversed in an orderly fashion. With money and bookings at stake, we can’t merely erase prior transactions — we need an immutable record of attempts and failures. Thus, we should compile a list of compensatory actions for execution in the event of a failure.

Prerequisites
=============

To follow this tutorial, you should:

1.  Set up a local development environment for Workflow applications in PHP or use the sample app in a GitHub [codespace](https://github.com/durable-workflow/sample-app).
2.  Familiarize yourself with the basics of starting a Workflow project by reviewing the [documentation](https://durable-workflow.com/docs/installation).
3.  Review the [Saga architecture pattern](https://microservices.io/patterns/data/saga.html).

Sagas are an established design pattern for managing complex, long-running operations:

1.  A Saga manages transactions using a sequence of local transactions.
2.  A local transaction is a work unit performed by a saga participant (a microservice).
3.  Each operation in the Saga can be reversed by a compensatory transaction.
4.  The Saga pattern assures that all operations are either completed successfully or the corresponding compensation transactions are run to reverse any completed work.

Workflow (the Laravel-native durable workflow package) provides inherent support for the Saga pattern, simplifying the process of handling rollbacks and executing compensatory transactions.

Booking Saga Flow
=================

We will visualize the Saga pattern for our trip booking scenario with a diagram.

<ThemedImage
  lightSrc="https://mermaid.ink/img/pako:eNptkstuwjAQRX_FmrVBYEgwqdSKhNei7QJWLWFhJZMQ1djIcdRHxL83JA2kVb3y1Zw545FcQqRjBA8Sqd-jgzCWPG5CRaoz221tlfek17snfrmUWXqwZFtEEeZ5UsiHc6ga0q8Q8oJ5TQblWluUf8Ar9qxrar2bSUl8rd8yleYkECpCKTHet86g65yXG1RWyIoz_4iDjni1a1ykee_VN-_6Fr-n34z7DvwjXLbCeq2rb9lMa8Kq2amtRVLkOfFpQOckxijLM63uuqUZXdAlXdE1EZG9FIFCarIYPGsKpHBEcxSXCOWlLQR7wCOG4FXXGBNRSBtCqM5V20moV62PbafRRXoALxEyr1JxioXFeSZSI24IqhhNoAtlwXNqA3glfIA3dJ2-O-HOZMiZM5jygUvhEzzG3b47dlw-HbMBd5gzOlP4qocO-s54NGV8yoaMMZe7nALGmdXmqflW9e86fwOyNLgF?type=png"
  darkSrc="https://mermaid.ink/img/pako:eNptkktvgzAMgP9K5HNatSnQwKRNBfo4bDu0p630EEEKqCGpQtAeiP8-CmvHpuUUx58_x5JriFXCwYOjUG9xxrRBj9tIovYs9jvTxgc0Gt0jv16JPM0M2lVxzMvyWImHJpI96bcIeuFlRwb1Rhku_oA37Fl11Ga_EAL5Sp1ymZYoYDLmQvDkcHUGQ2dYb7k0TLSc_kccDMTrfe9C_X9vvnDoW_7u_mM8DOBv4eoq7Ma6-VZ9tz5Y9zNdc7FgZYl8HOAQJTzOy1zJu2FqgZd4hdd4g1hsLknAkOo8Ac_oimMouC7YJYT6UhaByXjBI_Daa8L0KYJINm3NmclXpYprmVZVmoF3ZKJso-qcMMPDnKWaFbdXzWXCdaAqacCz7M4BXg3v4E0de-zMqT2fUmJPXDpxMHyAR6gzdizboa5FJtQm9qzB8Nm1nYxta-YS6pIpIcShDsXAk9wo_dRvVbdczRe1TrdB?type=png"
  lightLink="https://mermaid.live/edit#pako:eNptkstuwjAQRX_FmrVBYEgwqdSKhNei7QJWLWFhJZMQ1djIcdRHxL83JA2kVb3y1Zw545FcQqRjBA8Sqd-jgzCWPG5CRaoz221tlfek17snfrmUWXqwZFtEEeZ5UsiHc6ga0q8Q8oJ5TQblWluUf8Ar9qxrar2bSUl8rd8yleYkECpCKTHet86g65yXG1RWyIoz_4iDjni1a1ykee_VN-_6Fr-n34z7DvwjXLbCeq2rb9lMa8Kq2amtRVLkOfFpQOckxijLM63uuqUZXdAlXdE1EZG9FIFCarIYPGsKpHBEcxSXCOWlLQR7wCOG4FXXGBNRSBtCqM5V20moV62PbafRRXoALxEyr1JxioXFeSZSI24IqhhNoAtlwXNqA3glfIA3dJ2-O-HOZMiZM5jygUvhEzzG3b47dlw-HbMBd5gzOlP4qocO-s54NGV8yoaMMZe7nALGmdXmqflW9e86fwOyNLgF"
  darkLink="https://mermaid.live/edit#pako:eNptkktvgzAMgP9K5HNatSnQwKRNBfo4bDu0p630EEEKqCGpQtAeiP8-CmvHpuUUx58_x5JriFXCwYOjUG9xxrRBj9tIovYs9jvTxgc0Gt0jv16JPM0M2lVxzMvyWImHJpI96bcIeuFlRwb1Rhku_oA37Fl11Ga_EAL5Sp1ymZYoYDLmQvDkcHUGQ2dYb7k0TLSc_kccDMTrfe9C_X9vvnDoW_7u_mM8DOBv4eoq7Ma6-VZ9tz5Y9zNdc7FgZYl8HOAQJTzOy1zJu2FqgZd4hdd4g1hsLknAkOo8Ac_oimMouC7YJYT6UhaByXjBI_Daa8L0KYJINm3NmclXpYprmVZVmoF3ZKJso-qcMMPDnKWaFbdXzWXCdaAqacCz7M4BXg3v4E0de-zMqT2fUmJPXDpxMHyAR6gzdizboa5FJtQm9qzB8Nm1nYxta-YS6pIpIcShDsXAk9wo_dRvVbdczRe1TrdB"
  alt="Saga Pattern Flow Diagram"
/>

Workflow Implementation
-----------------------

We’ll begin by creating a high-level flow of our trip booking process, which we’ll name `BookingSagaWorkflow`.

```php
class BookingSagaWorkflow extends Workflow  
{  
    public function execute()  
    {  
    }  
}
```

Next, we’ll imbue our saga with logic, by adding booking steps:

```php
use function Workflow\activity;
use Workflow\Workflow;

class BookingSagaWorkflow extends Workflow  
{  
    public function execute()  
    {  
        try {  
            $flightId = yield activity(BookFlightActivity::class);  
            $hotelId = yield activity(BookHotelActivity::class);  
            $carId = yield activity(BookRentalCarActivity::class);  
        } catch (Throwable $th) {  
        }  
    }  
}
```

Everything inside the `try` block is our "happy path". If any steps within this distributed transaction fail, we move into the `catch` block and execute compensations.

Adding Compensations
--------------------

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
        }  
    }  
}
```

In the above code, we sequentially book a flight, a hotel, and a car. We use the `$this->addCompensation()` method to add a compensation, providing a callable to reverse a distributed transaction.

Executing the Compensation Strategy
-----------------------------------

With the above setup, we can finalize our saga and populate the `catch` block:

```php
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

Within the `catch` block, we call the `compensate()` method, which triggers the compensation strategy and executes all previously registered compensation callbacks. Once done, we rethrow the exception for debugging.

By default, compensations execute sequentially. To run them in parallel, use `$this->setParallelCompensation(true)`. To ignore exceptions that occur inside compensation activities while keeping them sequential, use `$this->setContinueWithError(true)` instead.

Testing the Workflow
--------------------

Let’s run this workflow with simulated failures in each activity to fully understand the process.

First, we run the workflow normally to see the sequence of bookings: flight, then hotel, then rental car.

![booking saga with no errors](https://miro.medium.com/v2/1*3IgEjKzHK8Fpp-uumr4dIw.png)

Next, we simulate an error with the flight booking activity. Since no bookings were made, the workflow logs the exception and fails.

![booking saga error with flight](https://miro.medium.com/v2/1*ZuDAFa_q0l2-PT6PhRguaw.png)

Then, we simulate an error with the hotel booking activity. The flight is booked successfully, but when the hotel booking fails, the workflow cancels the flight.

![booking saga error with hotel](https://miro.medium.com/v2/1*_OwO5PUOLFqcLfd38gNpEQ.png)

Finally, we simulate an error with the rental car booking. The flight and hotel are booked successfully, but when the rental car booking fails, the workflow cancels the hotel first and then the flight.

![booking saga error with rental car](https://miro.medium.com/v2/1*3qR9GKQH-YtghwPK_x9wUQ.png)

Conclusion
----------

In this tutorial, we implemented the Saga architecture pattern for distributed transactions in a microservices-based application using Workflow. Writing Sagas can be complex, but Workflow takes care of the difficult parts such as handling errors and retries, and invoking compensatory transactions, allowing us to focus on the details of our application.
