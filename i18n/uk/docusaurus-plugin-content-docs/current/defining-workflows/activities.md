---
sidebar_position: 2
title: Activity
description: Визначайте класи activity для недетермінованих побічних ефектів, повторних спроб, маршрутизації та параметрів окремих викликів.
tags:
  - authoring
  - activities
  - retries
keywords:
  - durable workflow activity class
  - activity options
  - non deterministic side effects
---

# Activity {#activities}

Activity — це одиниця роботи, яка виконує конкретне завдання чи операцію
(наприклад, API-запит, обробку даних або надсилання електронного листа) та може
виконуватися з workflow.

:::note Контракт стійкого виконання
Звичайні activity v2 виконуються як стійкі завдання в черзі. Локальні activity —
явний примітив для короткої роботи в тому самому процесі, який усе одно записує
стійку історію activity. Сесії worker доступні, коли кілька стійких кроків activity
потребують однієї оренди worker. Закріплене виконання є підтримуваною
оптимізацією відтворення, а не контрактом коректності. Точні контракти наведено в
[моделі виконання activity](/docs/features/activity-execution-model),
[локальних activity](/docs/features/local-activities),
[сесіях worker](/docs/features/worker-sessions) та
[закріпленому виконанні](/docs/features/sticky-execution).
:::

Для створення нової activity можна використати команду Artisan `make:activity`:

```php
php artisan make:activity MyActivity
```

Вона визначається успадкуванням класу `Activity` та реалізацією методу `handle()`.

```php
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public function handle()
    {
        // Perform some work...
        return $result;
    }
}
```

## Контракт виконання {#execution-contract}

Кожен виклик `activity(...)` записує команду activity в історію workflow та
створює стійке завдання в черзі, яке може отримати worker. Звичайні activity
може отримати будь-який сумісний worker, а
[сесії worker](/docs/features/worker-sessions) дозволяють закріпити послідовність
спроб activity за однією орендою сесії worker, коли workflow явно обирає цей
контракт.

Якщо вам потрібне значення, безпечне для відтворення, без планування роботи в
черзі, використовуйте [`sideEffect(...)`](/docs/features/side-effects). Якщо
потрібна коротка activity в тому самому процесі з повторними спробами, тайм-аутом,
heartbeat та історією activity, використовуйте
[локальні activity](/docs/features/local-activities).
Повну модель розміщення наведено в
[моделі виконання activity](/docs/features/activity-execution-model), а поведінку
закріпленого кешу відтворення — у
[закріпленому виконанні](/docs/features/sticky-execution).

## Ідемпотентність та стійка ідентичність {#idempotency-and-durable-identity}

Activity виконується щонайменше один раз. Повторні спроби, завершення оренди й
повторна доставка можуть призвести до повторного спостереження тієї самої
логічної activity, тому побічний ефект або віддалений отримувач має допускати
безпечне повторення.

Усередині activity використовуйте стійкі ідентифікатори середовища виконання,
якщо потрібні кореляція чи віддалене усунення дублікатів:

- `activityId()` визначає одне логічне виконання activity між повторними
  спробами та є типовим ключем віддаленої ідемпотентності.
- `attemptId()` визначає одну конкретну спробу цього виконання.
- `attemptCount()` повідомляє, яка спроба зараз виконується.

Віддавайте перевагу `activityId()`, якщо віддалена система має трактувати повторні
спроби як той самий логічний запит. Використовуйте `attemptId()` лише тоді, коли
віддаленій системі справді потрібно розрізняти окремі спроби. Якщо worker
завершить віддалену роботу, втратить оренду та повідомить результат із
запізненням, рушій може відхилити таке завершення, бо інший worker уже виграв
стійку гонку. Проте віддалений побічний ефект уже міг відбутися.

Дивіться [гарантії виконання та ідемпотентність](/docs/constraints/execution-guarantees),
[heartbeat](/docs/features/heartbeats) та
[збої й відновлення](/docs/failures-and-recovery), щоб зрозуміти операційну модель
цих ідентифікаторів.

## Перевизначення для окремого виклику {#per-call-overrides}

Маршрутизація та повторні спроби за замовчуванням використовують властивості
`$connection`, `$queue`, `$tries` і `backoff()` класу activity. Якщо окремому виклику
потрібно їх перевизначити, наприклад спрямувати його до черги з вищим пріоритетом
або збільшити кількість спроб, передайте екземпляр `ActivityOptions`:

```php
use function Workflow\V2\activity;
use Workflow\V2\Support\ActivityOptions;

$result = activity(
    MyActivity::class,
    new ActivityOptions(queue: 'high-priority', maxAttempts: 5),
    'Taylor',
);
```

Повний перелік полів, зокрема тайм-аути та heartbeat, наведено в
[параметрах activity](/docs/configuration/options#activityoptions).

## Виклики локальних activity {#local-activity-calls}

Використовуйте `localActivity(...)`, якщо короткий ідемпотентний побічний ефект
має виконуватися всередині поточного процесу worker workflow, але потребує
семантики повторних спроб, тайм-ауту, heartbeat, скасування та історії activity:

```php
use Workflow\V2\Support\LocalActivityOptions;
use function Workflow\V2\localActivity;

$receipt = localActivity(
    SendReceiptActivity::class,
    new LocalActivityOptions(maxAttempts: 3, startToCloseTimeout: 10),
    $orderId,
);
```

Локальні activity відхиляють `connection`, `queue`, маршрутизацію сесії worker
та параметри schedule-to-start, оскільки не створюють звичайних завдань activity.
Повний контракт наведено в [локальних activity](/docs/features/local-activities).
