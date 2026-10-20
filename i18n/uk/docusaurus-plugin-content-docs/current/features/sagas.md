---
sidebar_position: 11
---

# Saga {#sagas}

Цей посібник описує компенсацію у вбудованих Laravel workflow з
`Workflow\V2\Workflow`. Для worker у сервісному режимі використовуйте
[посібник PHP SDK](https://php.durable-workflow.com/build/workflows-activities/),
[посібник Python SDK](https://python.durable-workflow.com/sdk-reference/#saga-compensation) або
[довідник Rust SDK](https://rust.durable-workflow.com/durable_workflow/struct.Saga.html).

Saga — це усталений шаблон проєктування для керування складними тривалими операціями:

- Saga керує розподіленими транзакціями через послідовність локальних транзакцій.
- Локальна транзакція — це одиниця роботи, яку виконує учасник saga, тобто activity.
- Кожну операцію saga можна скасувати компенсувальною activity.
- Код workflow визначає, коли викликати компенсацію. Компенсація може завершитися помилкою, а для її виконання потрібні час і працездатні worker.

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

Коли workflow перехоплює виняток, `$this->compensate()` виконує всі зареєстровані компенсації у **зворотному порядку**. У наведеному прикладі, якщо `BookRentalCarActivity` завершується помилкою, рушій спочатку скасовує готель, а потім переліт, розгортаючи saga назад від найновішого кроку.

Реєструйте кожну компенсацію після успіху її основної activity. Replay
відновлює цей порядок реєстрації й використовує записані результати activity,
зокрема завершених компенсацій.

## Компенсація за кінцевим терміном {#deadline-driven-compensation}

[Тайм-аут workflow](./timeouts.md#timeout-outcome-and-cleanup), який застосовує
рушій, закриває запуск до виконання компенсації кодом workflow. Блок `catch`
або `finally` цього не змінює. Негайні команди `cancel()` і `terminate()` також
не надають вікна для очищення.

Якщо сплив часу має скасувати вже виконану роботу, задайте раніший прикладний
термін. Цей вбудований workflow резервує ресурс і до 30 секунд чекає на signal
підтвердження. Після спливу терміну код workflow відновлюється, звільняє ресурс
і повертає прикладний результат `expired`:

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

`ReserveResourceActivity` та `ReleaseResourceActivity` — activity вашого
застосунку. Зробіть обидві ідемпотентними зі стабільним бізнес-ключем
резервування. Очікування починається після успішного резервування. Надсилайте
`confirm` без аргументів: успішний результат буде `true`, а `null` означає,
що термін очікування минув.

Запускайте workflow з більшим обмеженням рушія як останнім запобіжником:

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

Після спливу очікування та успішної компенсації workflow завершується нормально
з `status: expired` у результаті. Це не запуск, закритий тайм-аутом рушія.
Якщо activity звільнення ресурсу завершується помилкою, `compensate()` передає
цю помилку далі. Якщо раніше настає кінцевий термін рушія, запуск закривається
й решта компенсації не виконується. Залишайте достатньо часу для планування та
повторних спроб і враховуйте раніший кінцевий термін виконання, якщо його задано.

Окрема операція `requestCancellation()` дає змогу викликати очищення, поки запуск
активний. Для стійкого очищення під час такого запиту використовуйте обмежений
cancellation shield. Тайм-аут workflow не викликає цей запит автоматично.
Дивіться [Cooperative Cancellation](../polyglot/cancellation.md).

## Порядок компенсацій {#compensation-ordering}

Типово компенсації виконуються **послідовно у зворотному порядку реєстрації**. Це найбезпечніший типовий порядок, оскільки пізніші кроки можуть залежати від попередніх.

Типово `compensate()` зупиняється на першій помилці компенсації й передає її
коду, який викликав цей метод.

## Паралельна компенсація {#parallel-compensation}

Для паралельного виконання компенсацій використовуйте `setParallelCompensation(true)`. Коли паралельну компенсацію увімкнено, кожне замикання компенсації має повертати розпочатий виклик activity без очікування його результату, щоб рушій міг виконувати їх конкурентно:

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

Коли паралельну компенсацію увімкнено, замикання компенсацій повертають виклики activity, які рушій збирає й виконує через `all()`.

## Продовження після помилки {#continue-with-error}

Типово, якщо компенсувальна activity спричиняє виняток, решта компенсацій пропускаються, а помилка передається далі. Щоб виконати всі компенсації незалежно від окремих помилок, використовуйте `setContinueWithError(true)`:

```php
$this->setContinueWithError(true);
```

Коли цей режим увімкнено, рушій перехоплює й відкидає винятки кожного замикання компенсації та переходить до наступного. Це корисно для незалежних компенсацій, коли потрібно виконати очищення за принципом best-effort навіть у разі помилок окремих кроків.

### Поєднання обох прапорців {#combining-both-flags}

`setParallelCompensation(true)` та `setContinueWithError(true)` можна використовувати разом. Тоді всі компенсації виконуються конкурентно через `all()`, а помилка будь-якої компенсації перехоплюється, щоб решта все одно завершилися. Без `setContinueWithError(true)` помилка паралельної компенсації одразу передається далі, і workflow завершується помилкою.

```php
$this->setParallelCompensation(true);
$this->setContinueWithError(true);
```

## Як це працює {#how-it-works}

- `addCompensation()` реєструє функцію, яка буде викликана під час `compensate()`
- `compensate()` перебирає зареєстровані компенсації у зворотному порядку
- кожне замикання компенсації є звичайним кроком workflow V2. Викликані ним activity створюють стійкі події історії, як і будь-яка інша activity
- компенсувальні activity видно у хронології Waterline та експорті історії
- якщо workflow завершується успішно, замикання компенсацій не викликаються й не створюють історії

## Запуск цього прикладу {#run-this-pattern}

Saga туристичного агента, керована signal, у
[Sample App](/docs/sample-app) — це виконуваний приклад для цієї
сторінки. Клонуйте sample app, задайте `OPENAI_API_KEY` і виконайте:

```bash
php artisan app:ai
```

`App\Workflows\Ai\AiWorkflow` реєструє компенсації для кожної activity
бронювання. Тому помилка перельоту після успішного бронювання готелю
скасовує готель через список компенсацій. Це той самий шаблон, описаний
на цій сторінці, з подіями у хронології запуску Waterline.
