---
sidebar_position: 23
title: Локальні activity
description: Виконуйте короткі activity у поточному процесі worker workflow зі збереженням стійкої історії activity, повторних спроб, тайм-аутів і видимості.
tags:
  - activities
  - workers
  - execution
keywords:
  - локальні activity
  - localActivity
  - executeLocalActivity
  - activity у тому самому процесі
  - heartbeat завдання workflow
---

# Локальні activity {#local-activities}

Локальні activity — це примітив v2 для короткої роботи activity, яку слід
виконувати в процесі worker workflow, що зараз виконує завдання workflow.
Вони зберігають семантику повторних спроб, тайм-аутів, heartbeat, скасування,
історії та видимості для оператора, але оминають звичайну чергу завдань activity.

Використовуйте локальні activity для роботи з малою затримкою, яка є
ідемпотентною й підходить для самого worker workflow. Обирайте звичайні
activity у черзі, коли потрібні незалежне масштабування worker, маршрутизація
черг, тривале виконання або окрема оренда завдання activity.

## Стислий контракт {#contract-summary}

- `localActivity(...)` та `Workflow::localActivity(...)` виконують клас activity
  у тому самому процесі, що й поточне завдання workflow.
- Runtime створює запис `activity_executions` і звичайні події історії activity
  з позначками `execution_mode=local` та `local_activity=true`.
- Звичайне завдання `TaskType::Activity` не створюється, тому параметри
  маршрутизації `connection`, `queue`, worker-session і schedule-to-start відхиляються.
- Локальна спроба володіє орендою завдання workflow. `heartbeat()` activity
  поновлює цю оренду й записує `ActivityHeartbeatRecorded`.
- Повторні спроби — це стійкі завдання workflow із затримкою, а не приховані повторення в циклі.
- Холодний replay читає зафіксовану історію activity. Якщо після втрати worker
  розпочата локальна спроба не має термінальної події, наступна спроба записує
  `retry_reason=cold_replay`.
- Деталі запуску, експорт історії, хронологія та метрики оператора показують
  локальні спроби окремо від звичайних спроб із черги.

## API для написання коду {#authoring-api}

Використовуйте допоміжну функцію з простору імен:

```php
use Workflow\V2\Support\LocalActivityOptions;
use function Workflow\V2\localActivity;

$receipt = localActivity(
    SendReceiptActivity::class,
    new LocalActivityOptions(
        maxAttempts: 3,
        startToCloseTimeout: 10,
        scheduleToCloseTimeout: 30,
        heartbeatTimeout: 5,
    ),
    $orderId,
);
```

Або використовуйте статичний фасад workflow:

```php
use Workflow\V2\Workflow;

$receipt = Workflow::localActivity(SendReceiptActivity::class, $orderId);
$receipt = Workflow::executeLocalActivity(SendReceiptActivity::class, $orderId);
```

`LocalActivityOptions` приймає поля повторних спроб і тайм-аутів:

- `maxAttempts`
- `backoff`
- `startToCloseTimeout`
- `scheduleToCloseTimeout`
- `heartbeatTimeout`
- `nonRetryableErrorTypes`

Він відхиляє `connection`, `queue`, маршрутизацію worker-session та
`scheduleToStartTimeout`, оскільки локальна activity не проходить звичайний
підбір завдань.

## Виконання та історія {#execution-and-history}

Коли replay workflow доходить до локальної activity, поточне завдання workflow:

1. створює виконання activity з `activity_options.execution_mode=local`;
2. записує `ActivityScheduled` та `ActivityStarted` з локальною позначкою;
3. створює екземпляр класу activity й виконує його в процесі worker workflow;
4. записує `ActivityCompleted`, `ActivityFailed`, `ActivityTimedOut` або
   `ActivityCancelled`;
5. відновлює код workflow із записаної події activity.

Replay не виконує завершену локальну activity повторно. Replay query і холодний
replay читають ті самі події історії activity, що й звичайні activity.

## Heartbeat {#heartbeats}

Локальна activity не володіє орендою завдання activity. Вона володіє орендою
завдання workflow, яке зараз виконує workflow. На початку спроби runtime
поновлює цю оренду. Коли код activity викликає `$this->heartbeat()`, runtime
записує прогрес, оновлює спробу activity й поновлює оренду завдання workflow.

Тривалі локальні activity мають надсилати heartbeat достатньо часто, щоб
не спливли ні тайм-аут heartbeat локальної activity, ні оренда завдання workflow:

```php
use Workflow\V2\Activity;

final class PollShortJobActivity extends Activity
{
    public function handle(string $jobId): array
    {
        $state = $this->fetch($jobId);

        $this->heartbeat([
            'message' => 'Polling remote job',
            'job_id' => $jobId,
            'state' => $state['status'],
        ]);

        return $state;
    }
}
```

## Тайм-аути й повторні спроби {#timeouts-and-retries}

`startToCloseTimeout` обмежує одну спробу. `scheduleToCloseTimeout` обмежує
все локальне виконання з повторними спробами. `heartbeatTimeout` обмежує
інтервал між записаними heartbeat локальної activity.

У разі помилки, яка допускає повторну спробу, або тайм-ауту runtime записує
`ActivityRetryScheduled` і створює завдання workflow, доступне після затримки
повторної спроби. Це завдання відтворює історію workflow, доходить до тієї самої
позиції локальної activity й починає наступну локальну спробу.

Кожна локальна спроба — це новий запис `activity_attempts`. Повторна спроба
записує в `retry_reason` значення `failure`, `timeout` або `cold_replay`.

## Скасування та втрата worker {#cancellation-and-worker-loss}

Скасування є кооперативним. Локальна activity виявляє скасування на межах
heartbeat, застосування тайм-ауту й завершення спроби. Скасована локальна
спроба записує `ActivityCancelled` із локальною позначкою.

Якщо worker завершується до фіксації термінальної події локальної activity,
оренда завдання workflow спливає, а звичайне відновлення завдань повторно
отримує це завдання. Холодний replay читає зафіксовану історію. Якщо історія
містить розпочату локальну спробу без термінальної події, runtime планує
повторну спробу з `retry_reason=cold_replay`.

## Видимість {#visibility}

Оператори можуть розрізняти локальні activity скрізь, де показано стан activity:

- дані історії містять `execution_mode=local` та `local_activity=true`;
- `activity_executions.activity_options.execution_mode` має значення `local`;
- деталі запуску й експорт історії містять `execution_mode` та `local_activity`;
- метрики оператора містять `activities.local`, `activities.local_open`,
  `activities.local_attempts` і лічильники activity у черзі та локальних activity.

Маніфест runtime публікується в
`worker_protocol.server_capabilities.local_activities` у відповіді
`GET /api/cluster/info`. Машиночитаний контракт — це
[`local-activity-runtime.schema.json`](/platform-protocol-specs/local-activity-runtime.schema.json),
включений до каталогу
[специфікації протоколів платформи](/docs/platform-protocol-specs#local-activity-runtime-notes).

Назви подій залишаються звичайними назвами подій activity, тому хронологія
та засоби replay зберігають порядок без окремої родини подій.

## Вибір відповідного примітива {#choosing-the-right-primitive}

Використовуйте локальну activity для коротких ідемпотентних побічних ефектів
із повторними спробами, які найкраще виконувати в процесі worker workflow
і які не потребують маршрутизації черг.

Використовуйте звичайну [activity](/docs/defining-workflows/activities) для
віддалених викликів, повільного вводу-виводу, інтенсивних обчислень, окремих
груп worker, контролю навантаження або роботи, яка має продовжуватися через
окремо орендоване завдання activity після втрати worker workflow.

Використовуйте [сесії worker](/docs/features/worker-sessions), коли кілька
кроків звичайних activity мають повторно використовувати локальні ресурси
worker, наприклад пам’ять GPU або змонтовану файлову систему.

Використовуйте [`sideEffect(...)`](/docs/features/side-effects) лише для
безпечних щодо replay знімків, яким не потрібна семантика повторних спроб,
тайм-аутів, heartbeat або скасування activity.
