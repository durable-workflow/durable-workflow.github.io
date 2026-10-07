---
sidebar_position: 4
title: Інтеграція Laravel та перехід між runtime
description: Перехід Laravel workflow fleet із v1 до embedded або service mode Durable Workflow 2.0 зі збереженням інтеграції фреймворку та чіткої відповідальності runtime.
tags:
  - laravel
  - migration
  - service-mode
  - embedded
keywords:
  - міграція Laravel Durable Workflow
  - Laravel service mode
  - міграція з v1 до v2
  - embedded to service mode
---

# Інтеграція Laravel та перехід між runtime {#laravel-adoption-and-runtime-transition}

Laravel-застосунки мають два офіційні режими Durable Workflow 2.0.
Embedded mode зберігає durable-виконання всередині застосунку.
Service mode зберігає Laravel як фреймворк застосунку та workers,
а Cloud або самостійно розгорнутий Server відповідає за durable-стан.

Ця сторінка допомагає вибрати та виконати один із трьох переходів:

1. Стабільний Laravel v1 до embedded 2.0.
2. Стабільний Laravel v1 до PHP SDK 2.0 у service mode.
3. Laravel embedded 2.0 до PHP SDK 2.0 у service mode.

Якщо безпосередня мета — оновлення пакета v1, тримайте поруч докладну
[настанову міграції 2.0](/docs/migration/).
Якщо ви вже вибрали власний service runtime, після вибору політики
переходу тут продовжіть із
[процедурою embedded-to-Server](/docs/polyglot/embedded-to-server/).

## Вибір кінцевого режиму {#pick-the-destination}

| Початковий режим | Кінцевий режим | Коли вибрати | Перша межа переходу |
| --- | --- | --- | --- |
| Стабільний Laravel v1 | Embedded 2.0 | Laravel-застосунок має й далі відповідати за зберігання workflow, черги, виконання та embedded Waterline. | Оновіть підтримуваний пакет `durable-workflow/workflow` до лінії 2.0. Наявні runs v1 завершуються через шлях сумісності v1 пакета, нові запуски використовують v2. |
| Стабільний Laravel v1 | PHP SDK service mode | Laravel має зберігати dependency injection, конфігурацію, Artisan, логування, events і test fakes, а Cloud чи Server — відповідати за durable-стан. | Установіть `durable-workflow/sdk` як окрему межу service client/worker. Історія v1 та durable Laravel queue jobs залишаються на runtime v1 до термінального стану. |
| Laravel embedded 2.0 | PHP SDK service mode | Застосунок має передати orchestration runtime або потребує спільної/polyglot межі runtime. | Спрямовуйте нові запуски до service runtime після готовності його workers. Завершіть embedded runs там, де вони почалися, або використайте явний import допустимих embedded-v2 runs для власного Server. |

PHP SDK bridge та embedded-пакет підтримують Laravel 9–13
на сумісних версіях PHP. Тому підтримуваний застосунок v1 може
вибрати будь-який кінцевий режим без окремого оновлення Laravel.

## Порівняння відповідальності {#compare-the-ownership-boundary}

| Питання | Стабільний Laravel v1 | Laravel embedded 2.0 | PHP SDK 2.0 service mode |
| --- | --- | --- | --- |
| Власник runtime | Laravel-застосунок відповідає за orchestration та replay. | Laravel-застосунок відповідає за рушій v2, історію, matching, timers та replay. | Cloud оперує namespace runtime або ваша команда оперує власним Server. Laravel запускає клієнтів і віддалені workers, а не runtime. |
| Composer-пакет | `durable-workflow/workflow` стабільної лінії 1.x. | `durable-workflow/workflow` з джерела артефактів 2.0. | `durable-workflow/sdk` з незалежного джерела опублікованого PHP SDK. Він не залежить від embedded-рушія. |
| Потрібні процеси | Laravel web/CLI та Laravel queue workers або Horizon. | Laravel web/CLI та queue workers або Horizon. Ролі scheduler і repair визначає конфігурація embedded-розгортання. | Процеси Laravel-застосунку та один чи більше `php artisan durable-workflow:worker`. Cloud надає runtime. Власне розгортання також потребує Server та його сховища. |
| Черги та сховище | Рядки workflow та PHP-орієнтована історія зберігаються в налаштованих базах Laravel. Jobs workflow, activity, retry та timer — у backends черг Laravel. | Історія подій та projections зберігаються в налаштованій базі застосунку. Embedded tasks зазвичай використовують черги Laravel. | Durable-історія та стан tasks зберігаються у Cloud чи Server. `DURABLE_WORKFLOW_TASK_QUEUE` ідентифікує віддалену task queue, яку опитує SDK worker, а не підключення черги Laravel. |
| Ідентичність workflow/activity | PHP-класи workflow та activity є durable-ідентифікаторами. | Налаштуйте сталі aliases у `workflows.v2.types`. Класи залишаються локальними реалізаціями. | `#[Workflow('orders.fulfill')]` і `#[Activity('orders.reserve')]` публікують сталі рядкові ключі типів під час реєстрації worker. Не використовуйте PHP FQCNs як контракт між runtimes. |
| Облікові дані | Облікові дані Laravel-застосунку, бази, cache та черги. Початковий `APP_KEY` залишається частиною відновлення v1. | Облікові дані Laravel-застосунку, бази, cache, черги та embedded Waterline, чию автентифікацію визначає host-застосунок. | Процеси застосунку Cloud отримують лише control credential, а workers — лише worker credential. Власне розгортання може використовувати спільний токен або відповідні scoped credentials. Облікові дані передаються процесам і навмисно відсутні в кешованій конфігурації Laravel. |
| Операційні інструменти | Логи/events Laravel, інструменти черг, Horizon, Waterline v1 та `workflow:v1:list` за наявності. | Логи/events Laravel, інструменти черг, `workflow:v2:doctor`, команди історії/repair та embedded Waterline. | Діагностика SDK проходить через PSR logger Laravel та `WorkerDiagnosticEvent`. Cloud включає Managed Waterline. Власні оператори використовують API/CLI Server і можуть окремо розгорнути Waterline для namespace Server. |
| Відповідальність за cutover і rollback | Ваша команда зберігає базу v1, стан черг, конфігурацію та секрети як єдиний набір відновлення. | Ваша команда розділяє запуски v1 і v2, зберігає wake-шляхи v1 та вирішує, коли можна прибрати старі таблиці/черги. | Ваша команда спрямовує кожну команду до runtime її run. Cloud відповідає за runtime rollback керованого сервісу, власні оператори — за зберігання та rollback Server. Rollback застосунку має зберігати старі й нові маршрути runtime до термінального стану їхніх runs. |

Cloud та власний Server є альтернативами service mode.
Користувачі Cloud не встановлюють Server чи окремий Waterline service.
Власні оператори розгортають, захищають, резервують, масштабують
і оновлюють Server. Waterline є окремим необов'язковим розгортанням
для namespace, яким володіє Server.

## Один Laravel-сценарій у трьох режимах {#one-laravel-use-case-in-all-three-modes}

Приклади резервують inventory для `orders.fulfill`.
Явно зіставте стабільний клас v1 з ключами типів v2, потім зберігайте
ці ключі та налаштовану task queue сталими. Резервування inventory
та споживач бізнес-подій мають бути ідемпотентними, бо activity може
виконуватися повторно після retry чи втрати підтвердження completion.

Дія застосунку однакова в production і тестах:

| Режим | Точка входу production | Точка входу після ввімкнення fake |
| --- | --- | --- |
| Стабільний Laravel v1 | `app(StartOrderFulfillment::class)->start('1001')` | `app(StartOrderFulfillment::class)->start('1001')` |
| Laravel embedded 2.0 | `app(StartOrderFulfillment::class)->start('1001')` | `app(StartOrderFulfillment::class)->start('1001')` |
| PHP SDK service mode | `app(StartOrderFulfillment::class)->start('1001')` | `app(StartOrderFulfillment::class)->start('1001')` |

Constructor injection Laravel доступний на межі застосунку в кожному режимі.
Стабільний v1 передає залежності activity в `execute()`.
Embedded v2 і service mode використовують контейнер Laravel для створення
об'єктів workflow та activity, тому їхні залежності мають звичайні конструктори.
Усе, що читає workflow під час replay, має бути детермінованим
і визначеним конфігурацією. База даних, мережа, годинник та інші
side effects належать activities.

### Стабільний Laravel v1 {#stable-v1-laravel}

Зберігайте вимоги [стабільного встановлення v1](/docs/1.x/installation/)
та справжнього queue driver. Ця типова реалізація використовує application starter
з constructor injection та services activity з method injection:

<!-- docs-example id="laravel.adoption.v1.handlers" -->
```php
<?php

use App\Contracts\InventoryGateway;
use App\Contracts\OrderPolicy;
use App\Events\InventoryReserved;
use Illuminate\Contracts\Events\Dispatcher;
use Psr\Log\LoggerInterface;
use Workflow\Activity;
use Workflow\Workflow;
use Workflow\WorkflowOptions;
use Workflow\WorkflowStub;
use function Workflow\activity;

final class FulfillOrderWorkflow extends Workflow
{
    public function execute(string $orderId): \Generator
    {
        return yield activity(ReserveInventoryActivity::class, $orderId);
    }
}

final class ReserveInventoryActivity extends Activity
{
    public function execute(
        OrderPolicy $orders,
        InventoryGateway $inventory,
        LoggerInterface $logger,
        Dispatcher $events,
        string $orderId,
    ): array {
        $orders->assertFulfillable($orderId);
        $reservation = $inventory->reserve($orderId);
        $logger->info('Inventory reserved', ['order_id' => $orderId]);
        $events->dispatch(new InventoryReserved($orderId));

        return $reservation;
    }
}

final class StartOrderFulfillment
{
    public function __construct(private readonly LoggerInterface $logger)
    {
    }

    public function start(string $orderId): void
    {
        $workflow = WorkflowStub::make(FulfillOrderWorkflow::class);
        $workflow->start($orderId, new WorkflowOptions('redis', 'orders'));
        $this->logger->info('Order workflow started', ['order_id' => $orderId]);
    }
}
```

`config/queue.php` та середовище розгортання й далі вибирають справжнє
підключення черги Laravel. Запустіть worker налаштованої черги:

<!-- docs-example id="laravel.adoption.v1.worker" -->
```bash
php artisan queue:work redis --queue=orders
```

Стабільний fake виконує ту саму дію застосунку з injection,
яку використовує production:

<!-- docs-example id="laravel.adoption.v1.fake" -->
```php
<?php

use Workflow\WorkflowStub;

WorkflowStub::fake();
WorkflowStub::mock(ReserveInventoryActivity::class, ['status' => 'reserved']);

app(StartOrderFulfillment::class)->start('1001');

WorkflowStub::assertDispatched(
    ReserveInventoryActivity::class,
    fn (string $orderId): bool => $orderId === '1001',
);
```

Laravel event assertions залишаються доступними під час тестування справжньої
activity. Не замінюйте workers v1 лише через додавання SDK v2
в іншій частині застосунку.

### Laravel embedded 2.0 {#20-embedded-laravel}

Стабільне встановлення використовує той самий пакет Workflow,
що й embedded quickstart:

<!-- docs-example id="laravel.adoption.v2-embedded.install" -->
```bash
composer require %%artifact.workflowComposerPackage%%
```

Опублікуйте або оновіть `config/workflows.php`, потім надайте
тому самому бізнес-контракту сталі aliases. Опублікований файл
містить додаткові обов'язкові налаштування v1 і v2.
Об'єднайте ці значення з наявними масивами замість заміни
всього файлу цим окремим фрагментом:

<!-- docs-example id="laravel.adoption.v2-embedded.config" -->
```php
<?php

return [
    'v2' => [
        'namespace' => env('DW_V2_NAMESPACE', 'production'),
        'types' => [
            'workflows' => [
                'orders.fulfill' => App\Workflows\FulfillOrderWorkflow::class,
            ],
            'activities' => [
                'orders.reserve' => App\Activities\ReserveInventoryActivity::class,
            ],
        ],
    ],
];
```

API написання workflow переходить на `handle()` та більше не yield
результати activity. Laravel створює обидва об'єкти.
Activity залишається належним місцем для логування та бізнес-подій,
які представляють side effects:

<!-- docs-example id="laravel.adoption.v2-embedded.handlers" -->
```php
<?php

use App\Contracts\InventoryGateway;
use App\Contracts\OrderPolicy;
use App\Events\InventoryReserved;
use Illuminate\Contracts\Events\Dispatcher;
use Psr\Log\LoggerInterface;
use Workflow\V2\Activity;
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;
use function Workflow\V2\activity;

final class FulfillOrderWorkflow extends Workflow
{
    public ?string $connection = 'redis';
    public ?string $queue = 'orders';

    public function __construct(private readonly OrderPolicy $orders)
    {
    }

    public function handle(string $orderId): array
    {
        $this->orders->assertFulfillable($orderId);

        return activity(ReserveInventoryActivity::class, $orderId);
    }
}

final class ReserveInventoryActivity extends Activity
{
    public ?string $connection = 'redis';
    public ?string $queue = 'orders';

    public function __construct(
        private readonly OrderPolicy $orders,
        private readonly InventoryGateway $inventory,
        private readonly LoggerInterface $logger,
        private readonly Dispatcher $events,
    ) {
    }

    public function handle(string $orderId): array
    {
        $this->orders->assertFulfillable($orderId);
        $reservation = $this->inventory->reserve($orderId);
        $this->logger->info('Inventory reserved', ['order_id' => $orderId]);
        $this->events->dispatch(new InventoryReserved($orderId));

        return $reservation;
    }
}

final class StartOrderFulfillment
{
    public function __construct(private readonly LoggerInterface $logger)
    {
    }

    public function start(string $orderId): void
    {
        WorkflowStub::make(FulfillOrderWorkflow::class, "order-{$orderId}")
            ->start($orderId);
        $this->logger->info('Order workflow started', ['order_id' => $orderId]);
    }
}
```

Запустіть Laravel queue worker так, як потребує embedded-розгортання:

<!-- docs-example id="laravel.adoption.v2-embedded.worker" -->
```bash
php artisan queue:work redis --queue=orders
```

Використовуйте embedded fake через ту саму дію застосунку.
Він inline виконує готові workflow tasks і записує dispatch activities:

<!-- docs-example id="laravel.adoption.v2-embedded.fake" -->
```php
<?php

use Workflow\V2\WorkflowStub;

WorkflowStub::fake();
WorkflowStub::mock(ReserveInventoryActivity::class, ['status' => 'reserved']);

app(StartOrderFulfillment::class)->start('1001');
while (WorkflowStub::runReadyTasks() > 0) {
}

WorkflowStub::assertDispatched(
    ReserveInventoryActivity::class,
    fn (string $orderId): bool => $orderId === '1001',
);
```

Цей fake перевіряє embedded durable-рядки та історію.
Він не є fake SDK-клієнта та не замінює service runtime.

### PHP SDK service mode у Laravel {#php-sdk-service-mode-in-laravel}

Установіть незалежно опублікований SDK-пакет.
Команда генерується з джерела артефактів опублікованого PHP SDK,
а не копіюється з окремого випуску:

<!-- docs-example id="laravel.adoption.service.install" -->
```bash
composer require %%artifact.publishedPhpSdkComposerPackage%%
```

Laravel 9–13 автоматично знаходять provider.
Опублікуйте конфігурацію пакета та перелічіть класи обробників з атрибутами:

<!-- docs-example id="laravel.adoption.service.config" -->
```php
<?php

return [
    'runtime_url' => env('DURABLE_WORKFLOW_RUNTIME_URL', 'http://localhost:8080'),
    'namespace' => env('DURABLE_WORKFLOW_NAMESPACE', 'production'),
    'task_queue' => env('DURABLE_WORKFLOW_TASK_QUEUE', 'orders'),
    'handlers' => [
        App\Workflows\FulfillOrderWorkflow::class,
        App\Activities\ReserveInventoryActivity::class,
    ],
    'poll_timeout_seconds' => 5,
];
```

Service workflow використовує ті самі публічні рядки, що й embedded v2.
Контейнер Laravel створює обидва service-класи з атрибутами:

<!-- docs-example id="laravel.adoption.service.handlers" -->
```php
<?php

use App\Contracts\InventoryGateway;
use App\Contracts\OrderPolicy;
use App\Events\InventoryReserved;
use DurableWorkflow\Attribute\Activity;
use DurableWorkflow\Attribute\Workflow;
use DurableWorkflow\Worker\ActivityContext;
use DurableWorkflow\Worker\WorkflowContext;
use Illuminate\Contracts\Events\Dispatcher;
use Psr\Log\LoggerInterface;

final class FulfillOrderWorkflow
{
    public function __construct(private readonly OrderPolicy $orders)
    {
    }

    #[Workflow('orders.fulfill')]
    public function run(WorkflowContext $context, string $orderId): array
    {
        $this->orders->assertFulfillable($orderId);

        return $context->activity('orders.reserve', [$orderId]);
    }
}

final class ReserveInventoryActivity
{
    public function __construct(
        private readonly OrderPolicy $orders,
        private readonly InventoryGateway $inventory,
        private readonly LoggerInterface $logger,
        private readonly Dispatcher $events,
    ) {
    }

    #[Activity('orders.reserve')]
    public function run(ActivityContext $context, string $orderId): array
    {
        $this->orders->assertFulfillable($orderId);
        $reservation = $this->inventory->reserve($orderId);
        $this->logger->info('Inventory reserved', ['order_id' => $orderId]);
        $this->events->dispatch(new InventoryReserved($orderId));

        return $reservation;
    }
}
```

Код застосунку отримує Laravel-native інтерфейс SDK через injection
замість доступу через facade або побудови транспортного клієнта.
Клас з атрибутом визначає тип workflow, а опублікована конфігурація —
стандартну task queue:

<!-- docs-example id="laravel.adoption.service.client" -->
```php
<?php

use DurableWorkflow\Bridge\Laravel\LaravelWorkflowClientInterface;
use DurableWorkflow\WorkflowHandleInterface;

final class StartOrderFulfillment
{
    public function __construct(
        private readonly LaravelWorkflowClientInterface $workflows,
    ) {
    }

    public function start(string $orderId): WorkflowHandleInterface
    {
        return $this->workflows->start(
            FulfillOrderWorkflow::class,
            [$orderId],
            workflowId: "order-{$orderId}",
        );
    }

    public function handle(string $orderId): WorkflowHandleInterface
    {
        return $this->workflows->handle(
            FulfillOrderWorkflow::class,
            "order-{$orderId}",
        );
    }
}
```

Після публікації конфігурації кешуйте лише несекретні налаштування.
Задайте `RUNTIME_URL` як повний підготовлений URI Cloud namespace runtime
або origin власного Server. Не додавайте `/api`.

Запустіть worker лише з обліковими даними ролі worker:

<!-- docs-example id="laravel.adoption.service.worker" -->
```bash
php artisan vendor:publish --tag=durable-workflow-config
env -u DURABLE_WORKFLOW_TOKEN \
  -u DURABLE_WORKFLOW_CLIENT_TOKEN \
  -u DURABLE_WORKFLOW_WORKER_TOKEN \
  DURABLE_WORKFLOW_RUNTIME_URL="$RUNTIME_URL" \
  DURABLE_WORKFLOW_NAMESPACE=production \
  DURABLE_WORKFLOW_TASK_QUEUE=orders \
  php artisan config:cache
env -u DURABLE_WORKFLOW_CLIENT_TOKEN \
  DURABLE_WORKFLOW_WORKER_TOKEN="$WORKER_SECRET" \
  php artisan durable-workflow:worker
```

Без перевизначення `--queue` Artisan worker опитує налаштовану task queue
`orders`. Перед звичайним polling діагностика registered-and-polling
називає runtime, namespace, чергу, типи workflow/activity з атрибутами
та роль облікових даних worker.

Процеси застосунку/web/queue отримують `DURABLE_WORKFLOW_CLIENT_TOKEN`,
а не токен worker. Власні оператори можуть використовувати
`DURABLE_WORKFLOW_TOKEN`, коли один credential навмисно дозволений
для обох ролей.

SDK worker записує діагностику життєвого циклу, retry, помилок handler
та shutdown через PSR logger Laravel і надсилає
`DurableWorkflow\Bridge\Event\WorkerDiagnosticEvent` через events Laravel.
Бізнес-activities можуть продовжувати використовувати logger
та event dispatcher через injection, як показано вище.

Facade fake пакета замінює той самий інтерфейс з injection,
який використовує код застосунку:

<!-- docs-example id="laravel.adoption.service.fake" -->
```php
<?php

use DurableWorkflow\Bridge\Laravel\Facades\DurableWorkflow;

$workflows = DurableWorkflow::fake()
    ->setWorkflowResult('order-1001', ['status' => 'fulfilled']);

app(StartOrderFulfillment::class)->start('1001');
$result = app(StartOrderFulfillment::class)->handle('1001')->result();

$this->assertSame(['status' => 'fulfilled'], $result);
$workflows->assertWorkflowStarted(
    FulfillOrderWorkflow::class,
    ['1001'],
    workflowId: 'order-1001',
);
$workflows->assertResultRequested('order-1001');
```

Цей fake перевіряє взаємодію Laravel-застосунку без Cloud чи Server.
Для тестів команд обробників workflow/activity використовуйте worker test harness
SDK. Fake клієнта не виконує код віддаленого worker.

## Drain, cutover та rollback {#drain-cut-over-and-roll-back}

Зміна Composer-вимоги не переміщує активний workflow, його історію,
відкладений timer, retry activity чи готовий/зарезервований queue job.
Розглядайте старий і новий runtimes як окремі durable-системи
протягом переходу.

### 1. Визначення точки відновлення {#1-establish-the-recovery-cut}

Перед зміною трафіку:

- Зберіть дані про підключення бази v1/embedded, кожну налаштовану чергу
  workflow та activity, account/region/prefix queue backend, cache locks
  і посилання secret manager на початковий `APP_KEY`.
- Заблокуйте нові запуски та вхідні повідомлення на час приведення джерела
  до спокійного стану. Зупиніть кожен worker після поточного job.
  Сам `queue:restart` не забезпечує спокійного стану, коли supervisor
  негайно замінює процес.
- Завершіть усі початкові runs або створіть application-consistent точку
  відновлення, що містить SQL та кожен готовий, відкладений і зарезервований
  queue job. Backup лише бази не відновлює queue-backed timers, retries чи activities.
- Запишіть runtime-власник кожного нетермінального workflow ID.
  Signals, queries, updates, cancellation, termination, repair і читання
  результатів мають продовжувати використовувати цей запис відповідальності.

### 2. Застосування правила вибраного шляху {#2-apply-the-path-specific-rule}

| Перехід | Наявні нетермінальні runs | Нові runs після cutover | Межа rollback |
| --- | --- | --- | --- |
| v1 до embedded 2.0 | Завершуються через шлях сумісності v1. Зберігайте таблиці v1, вимоги PHP-декодування, споживачів Laravel queues і стан черг до термінального стану. | Починаються через `Workflow\V2\WorkflowStub` лише після успішного canary v2. | Відновіть узгоджену точку SQL/queue v1 і точну конфігурацію застосунку або виправляйте вперед. Не відновлюйте SQL поверх новішого стану черг. |
| v1 до Cloud чи власного service mode | Залишаються на v1. Історію v1 не можна імпортувати до service runtime або replay віддаленими workers. | Починаються через `LaravelWorkflowClientInterface` після реєстрації SDK worker з очікуваними ключами типів. | Повертайте нові запуски до v1 лише якщо runtime v1 здоровий. Runs, уже прийняті service mode, залишаються там. |
| Embedded v2 до Cloud | Завершуються на місці. Cloud onboarding не перетворює зміну пакета на import історії. | Починаються в підготовленому Cloud namespace після перевірок client/worker credentials і task queue. | За потреби поверніть нові запуски до embedded. Команди runs, прийнятих Cloud, залишайте спрямованими до Cloud. |
| Embedded v2 до власного Server | Завершуються на місці або окремо проходять підтримувані export, dry run та atomic import допустимого спокійного embedded-v2 run. Не визначайте допустимість за встановленням пакета. | Починаються через SDK після перевірок discovery Server, namespace, реєстрації worker і черги. | Невдалий import не записує часткового run. Після зафіксованого import Server володіє run. Не відновлюйте embedded-копію. |

Для власного Server використовуйте повну
[процедуру міграції embedded-to-Server](/docs/polyglot/embedded-to-server/#phase-e-import-eligible-embedded-v2-runs).
Вона відхиляє v1, історію з redaction, leased tasks, активні спроби activity
та інші небезпечні snapshots. Сам export історії надає дані аудиту/налагодження.
Лише явна перевірена операція import створює стан, яким володіє Server.

### 3. Перевірка кінцевого режиму перед зміною трафіку {#3-prove-the-destination-before-switching-traffic}

1. Налаштуйте один namespace, task queue та сталий набір типів workflow/activity.
2. Запустіть новий runtime та його SDK workers поруч зі старим runtime.
3. Перевірте discovery Server чи підготовку Cloud, credentials ролей,
   реєстрацію worker, оголошені ключі типів, огляд task queue та діагностику Laravel.
4. Надішліть shadow/canary order з унікальним ID та дочекайтеся термінального
   результату в операторській поверхні нового режиму.
5. Переводьте нові запуски по одному сімейству workflow.
   Не допускайте запуску того самого бізнес-ключа в обох runtimes.
6. Зберігайте початкові workers, стан черг, credentials, логи/events
   та стару операторську поверхню до термінального стану всіх початкових runs
   або завершення підтримуваного import власного Server.

Прибирання старого пакета, черги, таблиці, секрету чи розгортання Waterline
є останнім кроком, а не механізмом cutover.

## Продовжуйте вибраним шляхом {#continue-with-the-chosen-path}

- [Стабільне встановлення v1](/docs/1.x/installation/)
- [Планування міграції стабільного v1](/docs/migration/)
- [Встановлення embedded 2.0](/docs/installation/)
- [Докладна міграція пакета з v1 до v2](/docs/migration/)
- [PHP SDK service mode](/docs/polyglot/php/)
- [Керований Cloud runtime](/docs/polyglot/cloud-control-plane/)
- [Власний Server](/docs/polyglot/server/)
- [Embedded v2 до власного Server](/docs/polyglot/embedded-to-server/)
