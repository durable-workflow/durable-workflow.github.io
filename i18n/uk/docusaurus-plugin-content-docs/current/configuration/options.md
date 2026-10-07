---
sidebar_position: 2
---

# Параметри {#options}

Під час визначення workflow й activity доступні різні параметри: кількість спроб до невдачі, з’єднання й черга та максимальна дозволена тривалість виконання в секундах.

```php
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public ?string $connection = 'default';
    public ?string $queue = 'default';

    public int $tries = 3;

    public function backoff(): array
    {
        return [1, 2, 5, 10, 15, 30, 60, 120];
    }
}
```

Властивості `$connection` та `$queue` у `Workflow\V2\Workflow` і `Workflow\V2\Activity` оголошені як `public ?string` і типово мають значення `null`. Перевизначення в підкласах мають зберігати тип із підтримкою null, щоб правила інваріантної типізації публічних властивостей PHP приймали повторне оголошення. Використовуйте `null` для успадкування типового з’єднання чи черги застосунку замість фіксованого значення.

Тайм-аути activity не налаштовуються властивістю класу. Використовуйте [`ActivityOptions`](#activityoptions) для окремого виклику, наприклад `startToCloseTimeout`, або знімок політики повторних спроб activity на момент планування. Налаштування часу циклу worker наведено також у [політиці ремонту завдань](/docs/polyglot/server-config-reference#workflow-package-controls).

## StartOptions {#startoptions}

`Workflow\V2\StartOptions` містить налаштування видимості, усунення дублікатів та тайм-ауту виконання на момент запуску workflow. Він не обирає чергу. Маршрутизацію визначають властивості `$connection` і `$queue` класів workflow та activity разом із `ActivityOptions` окремого виклику.

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;
use Workflow\V2\Enums\DuplicateStartPolicy;

$workflow = WorkflowStub::make(MyWorkflow::class);

$workflow->start(
    'arg1',
    new StartOptions(
        duplicateStartPolicy: DuplicateStartPolicy::ReturnExistingActive,
        businessKey: 'order-12345',
        labels: ['tenant' => 'acme'],
        executionTimeoutSeconds: 3600,
    ),
);
```

`StartOptions` обробляє рушій workflow. Вони не передаються як аргументи до методу `handle()` workflow. Вони зберігаються разом із workflow та використовуються для подальшого надсилання workflow/activity, зокрема під час відтворення та continue-as-new.

## ActivityOptions {#activityoptions}

`Workflow\V2\Support\ActivityOptions` надає перевизначення маршрутизації, повторних спроб та тайм-аутів для окремого виклику activity без зміни самого класу activity:

```php
use function Workflow\V2\activity;
use Workflow\V2\Support\ActivityOptions;

$result = activity(
    ChargeCard::class,
    new ActivityOptions(
        connection: 'redis',
        queue: 'critical',
        maxAttempts: 5,
        startToCloseTimeout: 30,
    ),
    $orderId,
);
```

## З’єднання {#connection}

Налаштування `$connection` задає з’єднання черги, до якого слід надіслати workflow чи activity. Типово `$connection` не задано, тому використовується типове з’єднання. Це можна перевизначити властивістю `$connection` класу workflow чи activity.

## Черга {#queue}

Налаштування `$queue` задає чергу, до якої слід додати workflow чи activity. Типово `$queue` не задано, тому використовується типова черга вказаного з’єднання. Це можна перевизначити властивістю `$queue` класу workflow чи activity.

## Повторні спроби {#retries}

Налаштування `$tries` керує загальною кількістю спроб activity до визнання її невдалою. Типово `$tries` дорівнює `1`: одна спроба без автоматичних повторень. Задайте `$tries` більше `1`, щоб дозволити повторні спроби, або `0` для нескінченних повторень. Для окремого виклику це можна перевизначити через `ActivityOptions::$maxAttempts`.

## Тайм-аут {#timeout}

Базовий клас `Activity` v2 не має властивості `$timeout`. Налаштовуйте тайм-аути activity для окремого виклику через [`ActivityOptions`](#activityoptions) за допомогою `startToCloseTimeout`, `scheduleToStartTimeout`, `scheduleToCloseTimeout` чи `heartbeatTimeout`. Під час планування середовище виконання зберігає знімок отриманої політики повторних спроб у виконанні activity. Тому тайм-аут уже запланованої спроби залишається стабільним, навіть якщо наступне розгортання змінить клас activity чи параметри. Час надсилання на рівні циклу worker контролює [політика ремонту завдань](/docs/polyglot/server-config-reference#workflow-package-controls).

## Затримка між спробами {#backoff}

Метод `backoff` повертає масив цілих чисел відповідно до поточної спроби. Типовий `backoff` задає експоненційну затримку до 2 хвилин. Це можна перевизначити реалізацією методу `backoff` у класі activity.

## Простір імен {#namespace}

Workflow можна обмежити простором імен для ізоляції кількох просторів. Налаштований простір імен застосовується як до API запуску площини керування, так і до `Workflow\V2\WorkflowStub::make()->start()`. Він зберігається в новому екземплярі, запуску, стійких завданнях та проєкції зведення запуску. Опитування завдань і фільтри видимості Waterline тоді можуть обмежити результати одним простором імен. Використовуйте Workflow 2.4.2 або новішу версію для узгодженого призначення простору імен через обидва PHP API запуску.

Назви просторів імен мають містити лише малі латинські літери, цифри, крапки, підкреслення та дефіси: відповідність `[a-z0-9._-]+`, максимум 128 символів.

Задайте типовий простір імен змінною середовища:

```env
DW_V2_NAMESPACE=production
```

Або в `config/workflows.php`:

```php
'v2' => [
    'namespace' => env('DW_V2_NAMESPACE'),
    // ...
],
```

Явний простір імен перевизначає налаштоване типове значення. Stub приймає його третім аргументом `make()`:

```php
$workflow = \Workflow\V2\WorkflowStub::make(
    OrderProcessingWorkflow::class,
    'order-12345',
    'staging',
);
$workflow->start();
```

Площина керування приймає його в параметрах `start()`:

```php
$controlPlane->start('order-processing', 'order-12345', [
    'namespace' => 'staging',
    // ...
]);
```

Коли простір імен не налаштований і не переданий явно, нові екземпляри зберігають простір імен `null`. Спостерігач, обмежений простором імен, не включає такі запуски. Зміна налаштувань не перепризначає наявні екземпляри. Запуск наявного екземпляра через інший простір імен відхиляється.

### Обмеження Waterline простором імен {#waterline-namespace-scoping}

Коли Waterline розгорнуто зі спільною базою даних для кількох просторів імен, задайте `WATERLINE_NAMESPACE`, щоб обмежити всі списки одним простором:

```env
WATERLINE_NAMESPACE=production
```

Це додає фільтр простору імен до кожного запиту видимості, тож Waterline показує лише workflow налаштованого простору. Також усі команди (cancel, signal, terminate, update, repair, archive та query) обмежуються цим простором. Команда для екземпляра чи запуску іншого простору поверне 404 замість виконання.

### Обмеження команд простором імен {#command-namespace-scoping}

`WorkflowStub::load()`, `loadSelection()` та `loadRun()` приймають необов’язковий параметр `namespace`:

```php
use Workflow\V2\WorkflowStub;

// Load only if the instance belongs to the given namespace
$stub = WorkflowStub::load('order-12345', namespace: 'production');

// Load a specific run, scoped to namespace
$stub = WorkflowStub::loadRun($runId, namespace: 'production');

// Load a specific selection, scoped to namespace
$stub = WorkflowStub::loadSelection('order-12345', $runId, namespace: 'production');
```

Коли `namespace` дорівнює `null` (типово), завантаження працює з усіма просторами імен без обмеження, зберігаючи зворотну сумісність. Коли простір імен задано, запит фільтрує його на рівні бази даних та викидає `ModelNotFoundException`, якщо workflow не існує в цьому просторі.

Методи команд площини керування (`signal`, `cancel`, `terminate`, `update`, `repair`, `archive`) також приймають `namespace` у масиві параметрів:

```php
$controlPlane->cancel('order-12345', [
    'namespace' => 'production',
]);
```

### Фільтрування простору імен у мостах завдань {#task-bridge-namespace-filtering}

Обидва мости завдань, workflow та activity, приймають необов’язковий параметр `namespace` у `poll()`:

```php
$tasks = $bridge->poll('redis', 'default', limit: 10, namespace: 'production');
```

Без цього параметра `poll()` повертає завдання з усіх просторів імен, зберігаючи сумісність з інсталяціями до появи просторів імен.

## Стійкі псевдоніми типів {#durable-type-aliases}

Стійкі ключі типів workflow й activity зберігаються під час реєстрації в `workflows.v2.types`. Дані помилок можуть використовувати той самий шаблон для класів винятків:

```php
'v2' => [
    'types' => [
        'workflows' => [
            'billing.invoice-sync' => App\Workflows\InvoiceSyncWorkflow::class,
        ],
        'activities' => [
            'payments.capture' => App\Activities\CapturePaymentActivity::class,
        ],
        'exceptions' => [
            'billing.invoice-declined' => App\Exceptions\InvoiceDeclined::class,
        ],
        'exception_class_aliases' => [
            App\Exceptions\LegacyInvoiceDeclined::class => App\Exceptions\InvoiceDeclined::class,
        ],
    ],
],
```

Коли помилка activity, update, дочірнього workflow чи workflow записується з псевдонімом винятку, рушій зберігає його в типізованій історії як `exception_type` та в даних помилки як `type`. Відтворення визначає псевдонім перед використанням записаного PHP-класу. Тому подальше переміщення класу може зберегти семантику `catch` workflow, доки псевдонім указує на поточний клас винятку.

Для імпортованих помилок v1, записаних до появи псевдонімів винятків, `workflows.v2.types.exception_class_aliases` може зіставити записану стару повну назву класу винятку з поточним класом. Стійкі псевдоніми типів `exceptions` усе одно мають пріоритет. Мапа псевдонімів класів — лише міст рефакторингу для вже записаних даних без стійкого `type`. Нові workflow мають використовувати стійкі псевдоніми типів винятків, щоб історія не залежала від назв PHP-класів.

Фінальна v2 записує стійкі псевдоніми винятків під час запису помилки. Тому налаштуйте стабільні псевдоніми до запису помилок, класи яких можуть згодом переміститися.

Якщо помилку під час відтворення не можна визначити через стійку мапу `exceptions`, мапу псевдонімів класів чи записаний клас, рушій не підміняє її загальним винятком виконання в коді workflow. Відтворення query викидає `UnresolvedWorkflowFailureException`, Waterline позначає помилку як `exception_replay_blocked = true`, а завдання worker з тією самою прогалиною залишається невдалим, поки запуск відкритий. Виправте зіставлення та відновіть запуск, замість покладання на загальні блоки `catch (RuntimeException)` для перейменованих історичних помилок.
