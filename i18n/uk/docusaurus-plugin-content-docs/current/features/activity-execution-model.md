---
sidebar_position: 22
title: Модель виконання activity
description: Як звичайні activity у черзі, локальні activity, сесії worker та sticky execution поєднуються в Durable Workflow v2.
tags:
  - activities
  - workers
  - execution
keywords:
  - модель виконання activity
  - локальні activity
  - сесії worker
  - sticky execution
  - стійка доставка завдань
  - activity у черзі
---

# Модель виконання activity {#activity-execution-model}

Підтримку worker сервісного режиму й узгодження можливостей із відмовою
за відсутності підтримки в PHP, Python та Rust наведено в матриці
[Portable Worker Affinity](/docs/polyglot/portable-worker-affinity).

Durable Workflow v2 надає явні примітиви для типових способів розміщення activity:

- звичайні activity у черзі для стійкої роботи з незалежною орендою;
- [локальні activity](/docs/features/local-activities) для короткої роботи
  в тому самому процесі зі збереженням історії activity;
- [сесії worker](/docs/features/worker-sessions) для стійкої прив’язки activity
  до worker на кількох кроках activity у черзі;
- [sticky execution](/docs/features/sticky-execution) для прив’язки до кешу
  replay workflow зі звичайним replay як запасним шляхом коректності.

## Звичайні activity у черзі {#ordinary-queued-activities}

`activity(...)` та `Workflow::activity(...)` — це звичайні activity у черзі.
Вони залишаються типовим примітивом activity.

1. Код workflow викликає `activity(MyActivity::class, ...)`.
2. Завдання workflow записує `ActivityScheduled` і створює стійке завдання
   activity на налаштованому підключенні та в налаштованій черзі.
3. Сумісний worker отримує завдання activity за орендою.
4. Worker виконує клас activity й повідомляє про завершення, помилку,
   скасування, heartbeat або тайм-аут.
5. Рушій записує результат activity в історію workflow та відновлює workflow
   зі стійкого стану.

Звичайні спроби activity можуть працювати на будь-якому сумісному worker.
Повторна спроба може потрапити до іншого процесу, хоста або збірки. Код activity
має бути ідемпотентним за повторної доставки, повторних спроб після спливу
оренди та гонок пізнього завершення. Використовуйте `activity_execution_id`
як типовий ключ ідемпотентності віддаленої роботи, а `activity_attempt_id` —
лише коли downstream-системі потрібна кореляція окремих спроб.

```php
use function Workflow\V2\activity;

$quote = activity(FetchQuoteActivity::class, $customerId);
$invoice = activity(CreateInvoiceActivity::class, $quote['id']);
```

## Локальні activity {#local-activities}

`localActivity(...)`, `Workflow::localActivity(...)` та
`Workflow::executeLocalActivity(...)` виконують клас activity в процесі worker
workflow, який зараз виконує завдання workflow. Вони не створюють звичайного
завдання activity.

Локальні activity також записують звичайну історію activity:

- `ActivityScheduled`
- `ActivityStarted`
- `ActivityHeartbeatRecorded`
- `ActivityRetryScheduled`
- `ActivityCompleted`
- `ActivityFailed`
- `ActivityCancelled`
- `ActivityTimedOut`

Кожна подія локальної activity містить `execution_mode=local` та
`local_activity=true`, а знімок виконання activity зберігає
`activity_options.execution_mode=local`. Heartbeat activity поновлюють оренду
завдання workflow, яке володіє локальною спробою, поки вона працює.

Використовуйте локальні activity для коротких ідемпотентних побічних ефектів,
яким потрібна семантика повторних спроб, тайм-аутів, heartbeat, скасування
й видимості activity, але не потрібні маршрутизація черг або незалежна група
worker activity. Контракт API, тайм-аутів, повторних спроб, зупинки, холодного
replay, маршрутизації та метрик наведено в розділі
[Локальні activity](/docs/features/local-activities).

```php
use Workflow\V2\Support\LocalActivityOptions;
use function Workflow\V2\localActivity;

$receipt = localActivity(
    SendReceiptActivity::class,
    new LocalActivityOptions(maxAttempts: 3, startToCloseTimeout: 10),
    $orderId,
);
```

## Сесії worker {#worker-sessions}

Сесії worker прив’язують послідовність звичайних спроб activity у черзі до
однієї оренди сесії worker. Використовуйте їх, коли кілька стійких кроків мають
повторно використовувати локальні ресурси worker: пам’ять GPU, змонтовану
файлову систему або завантажену модель.

Сесія worker не робить activity локальною. Кожна activity у сесії залишається
стійким завданням activity із власною орендою, heartbeat, тайм-аутом,
повторними спробами й термінальною історією. Сесія додає явну прив’язку та
правила допуску поверх звичайної маршрутизації черг.

API сесій, життєвий цикл оренди, маршрутизацію, обробку помилок, поведінку
під час зупинки й діагностику оператора наведено в розділі
[Сесії worker](/docs/features/worker-sessions).

## Sticky execution {#sticky-execution}

Sticky execution — це оптимізація replay завдань workflow. Worker може
зберігати прогрітий локальний кеш replay після завершення завдання workflow,
а підбір завдань може надавати йому перевагу для наступного завдання workflow
того самого запуску.

Sticky execution не робить прогрес workflow локальним для процесу. Коректність
завжди забезпечує звичайний холодний replay зі стійкої історії після промаху
кешу, перезапуску worker, drain, розгортання або витіснення. Код workflow не має
покладатися на стан у пам’яті поза історією.

Життєвий цикл sticky-кешу, ідентичність маршрутизації, правила запасного
шляху, засоби керування розгортанням і метрики наведено в розділі
[Sticky execution](/docs/features/sticky-execution).

## Вибір відповідного примітива {#choosing-the-right-primitive}

Використовуйте код workflow безпосередньо для детермінованого розгалуження й обчислень.

Використовуйте [`sideEffect(...)`](/docs/features/side-effects) для безпечного
щодо replay знімка недетермінованого значення, якому не потрібна семантика
повторних спроб, тайм-аутів, heartbeat або скасування activity.

Використовуйте [локальні activity](/docs/features/local-activities) для коротких
побічних ефектів із повторними спробами в тому самому процесі, які мають
відображатися як спроби activity, але не проходити звичайний підбір завдань.

Використовуйте звичайні [activity](/docs/defining-workflows/activities) для
віддалених викликів, повільного вводу-виводу, інтенсивних обчислень, контролю
навантаження черг, окремих груп worker або роботи, яка має продовжуватися
через окремо орендоване завдання activity.

Використовуйте [сесії worker](/docs/features/worker-sessions), коли кільком
крокам звичайних activity потрібна явна прив’язка до локального worker.
