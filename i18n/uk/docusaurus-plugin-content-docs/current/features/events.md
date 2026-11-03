---
sidebar_position: 12
---

# Події {#events}

Події життєвого циклу надсилаються на ключових етапах виконання workflow й activity, щоб повідомляти застосунок про поступ, завершення чи збої. Це стандартні події Laravel. Реєструйте слухачі в `EventServiceProvider` або через `Event::listen()`.

`WorkflowCancelled` і `WorkflowTerminated` очікують фіксації транзакції на з’єднанні, у якому зберігається запуск. Відхилені команди та відкочені записи до сховища не спричиняють жодної з цих подій. Інші прогалини транзакцій рушія та порядку подій життєвого циклу відстежуються у [workflow#893](https://github.com/durable-workflow/workflow/issues/893). Транзакція в окремій базі даних застосунку не робить записи до сховища workflow атомарними.

## Ідентичність подій {#event-identity}

Кожна подія V2 містить поля стійкої ідентичності:

| Поле | Опис |
|---|---|
| `instanceId` | ID екземпляра workflow, стабільний між continue-as-new. |
| `runId` | ID конкретного запуску виконання. |
| `workflowType` | Стійкий ключ типу, зареєстрований через `#[Type('...')]`. |
| `workflowClass` | Назва PHP-класу workflow. |
| `committedAt` | Часова позначка реального годинника у форматі ISO 8601, зафіксована під час підготовки сповіщення життєвого циклу. |

Події activity додатково містять:

| Поле | Опис |
|---|---|
| `activityExecutionId` | Стійкий ID виконання activity. |
| `activityType` | Стійкий ключ типу activity. |
| `activityClass` | Назва PHP-класу activity. |
| `sequence` | Позиція activity у виконанні workflow. |
| `attemptNumber` | Номер спроби, починається з 1. |

## Події workflow {#workflow-events}

### WorkflowStarted {#workflowstarted}

Надсилається після стійкої фіксації запуску workflow: перший запуск створено та подію історії `WorkflowStarted` записано.

```php
use Workflow\V2\Events\WorkflowStarted;

Event::listen(WorkflowStarted::class, function (WorkflowStarted $event) {
    Log::info('Workflow started', [
        'instance_id' => $event->instanceId,
        'run_id' => $event->runId,
        'type' => $event->workflowType,
    ]);
});
```

Ця подія також спрацьовує, коли новий запуск починається через continue-as-new.

### WorkflowCompleted {#workflowcompleted}

Надсилається після успішного завершення запуску workflow.

```php
use Workflow\V2\Events\WorkflowCompleted;

Event::listen(WorkflowCompleted::class, function (WorkflowCompleted $event) {
    Log::info('Workflow completed', [
        'instance_id' => $event->instanceId,
        'run_id' => $event->runId,
    ]);
});
```

### WorkflowFailed {#workflowfailed}

Надсилається, коли запуск workflow остаточно завершується з помилкою.

Перевищення часу виконання запуску також спричиняє `WorkflowFailed`. Натомість сплив строку очищення під час кооперативного скасування спричиняє `WorkflowCancelled`.

Додаткові поля:
- `exceptionClass`: назва PHP-класу винятку.
- `message`: повідомлення винятку.

```php
use Workflow\V2\Events\WorkflowFailed;

Event::listen(WorkflowFailed::class, function (WorkflowFailed $event) {
    Log::error('Workflow failed', [
        'instance_id' => $event->instanceId,
        'exception' => $event->exceptionClass,
        'message' => $event->message,
    ]);
});
```

### WorkflowCancelled {#workflowcancelled}

Надсилається, коли негайне скасування закриває запуск або коли кооперативне скасування закриває його після завершення очищення чи спливу його строку. Сам запит на скасування не спричиняє цю подію.

Окрім спільних полів ідентичності:

| Поле | Опис |
|---|---|
| `reason` | Початкова причина з команди скасування або `null`. Повідомлення про завершення очищення та сплив його строку не замінюють її. |
| `closedAt` | Збережений час закриття запуску як рядок ISO 8601 у UTC. |

```php
use Workflow\V2\Events\WorkflowCancelled;

Event::listen(WorkflowCancelled::class, function (WorkflowCancelled $event) {
    Log::info('Workflow cancelled', [
        'instance_id' => $event->instanceId,
        'run_id' => $event->runId,
        'reason' => $event->reason,
        'closed_at' => $event->closedAt,
    ]);
});
```

### WorkflowTerminated {#workflowterminated}

Надсилається, коли примусове завершення закриває запуск. Містить ті самі поля ідентичності, `reason` і `closedAt`; причину взято з команди примусового завершення. Код очищення workflow при цьому не виконується.

```php
use Workflow\V2\Events\WorkflowTerminated;

Event::listen(WorkflowTerminated::class, function (WorkflowTerminated $event) {
    Log::info('Workflow terminated', [
        'instance_id' => $event->instanceId,
        'run_id' => $event->runId,
        'reason' => $event->reason,
        'closed_at' => $event->closedAt,
    ]);
});
```

Це сповіщення Laravel у межах процесу. Помилка слухача не може скасувати зафіксоване закриття. Події не надають права відновлювати закритий запуск і не гарантують стійкої доставки до зовнішньої системи.

## Події activity {#activity-events}

### ActivityStarted {#activitystarted}

Надсилається, коли завдання activity отримано та виконання починається.

```php
use Workflow\V2\Events\ActivityStarted;

Event::listen(ActivityStarted::class, function (ActivityStarted $event) {
    Log::info('Activity started', [
        'activity' => $event->activityType,
        'sequence' => $event->sequence,
        'attempt' => $event->attemptNumber,
    ]);
});
```

### ActivityCompleted {#activitycompleted}

Надсилається після успішного завершення activity.

```php
use Workflow\V2\Events\ActivityCompleted;

Event::listen(ActivityCompleted::class, function (ActivityCompleted $event) {
    Log::info('Activity completed', [
        'activity' => $event->activityType,
        'execution_id' => $event->activityExecutionId,
    ]);
});
```

### ActivityFailed {#activityfailed}

Надсилається після остаточної помилки activity: усі повторні спроби вичерпано або виняток не допускає повторення. Помилки, після яких буде повторна спроба, **не** спричиняють цю подію.

Додаткові поля:
- `exceptionClass`: назва PHP-класу винятку.
- `message`: повідомлення винятку.

```php
use Workflow\V2\Events\ActivityFailed;

Event::listen(ActivityFailed::class, function (ActivityFailed $event) {
    Log::error('Activity failed', [
        'activity' => $event->activityType,
        'exception' => $event->exceptionClass,
        'message' => $event->message,
    ]);
});
```

## Події помилок {#failure-events}

### FailureRecorded {#failurerecorded}

Надсилається щоразу під час фіксації стійкого запису помилки, як для остаточних помилок workflow, так і activity. Це єдина точка інтеграції для повідомлень про помилки, наприклад Sentry чи Bugsnag.

| Поле | Опис |
|---|---|
| `failureId` | ID стійкого запису помилки. |
| `sourceKind` | `"workflow_run"` або `"activity_execution"`. |
| `sourceId` | ID джерела: ID запуску чи виконання activity. |
| `exceptionClass` | Назва PHP-класу винятку. |
| `message` | Повідомлення винятку. |

```php
use Workflow\V2\Events\FailureRecorded;

Event::listen(FailureRecorded::class, function (FailureRecorded $event) {
    // Report to Sentry, Bugsnag, etc.
    report(new \RuntimeException(
        "[{$event->sourceKind}] {$event->exceptionClass}: {$event->message}"
    ));
});
```

## Семантика часових позначок {#timestamp-semantics}

Рушій фіксує `committedAt` під час підготовки сповіщення життєвого циклу. Це позначка реального годинника, яка відрізняється від:

- **Віртуального часу workflow**: логічного часу всередині виконання workflow, який використовують timer.
- **Часу спроби**: коли конкретна спроба activity почалася чи завершилася.
- **Затримки відновлення**: скільки часу минуло після запланованого спрацювання timer до фактичного продовження workflow.

Для скасування та примусового завершення `closedAt` — це збережена часова позначка закриття запуску в UTC. Зовнішня транзакція сховища може зафіксуватися пізніше, ніж було знято значення полів події. Вимірюючи затримку доставки, окремо записуйте час отримання події слухачем.

## Життєвий цикл {#lifecycle}

Типовий життєвий цикл успішного workflow:

```
Workflow\V2\Events\WorkflowStarted
Workflow\V2\Events\ActivityStarted
Workflow\V2\Events\ActivityCompleted
Workflow\V2\Events\WorkflowCompleted
```

Життєвий цикл workflow з остаточною помилкою activity:

```
Workflow\V2\Events\WorkflowStarted
Workflow\V2\Events\ActivityStarted
Workflow\V2\Events\ActivityFailed
Workflow\V2\Events\FailureRecorded    (source: activity_execution)
Workflow\V2\Events\WorkflowFailed
Workflow\V2\Events\FailureRecorded    (source: workflow_run)
```

Скасований запуск закінчується так:

```
Workflow\V2\Events\WorkflowStarted
Workflow\V2\Events\WorkflowCancelled
```

Між цими двома сповіщеннями кооперативне очищення може спричиняти події activity.

Примусово завершений запуск закінчується так:

```
Workflow\V2\Events\WorkflowStarted
Workflow\V2\Events\WorkflowTerminated
```

## Простір імен подій {#event-namespace}

Події V2 розміщено в просторі імен `Workflow\V2\Events`. Якщо оновлюєте наявний застосунок, дивіться [міграцію](../migration.md) для зіставлення сумісних подій V1.
