---
sidebar_position: 12
---

# Події {#events}

Події життєвого циклу надсилаються на ключових етапах виконання workflow й activity, щоб повідомляти застосунок про поступ, завершення чи збої. Це стандартні події Laravel. Реєструйте слухачі в `EventServiceProvider` або через `Event::listen()`.

Усі події життєвого циклу V2 надсилаються **після фіксації стійкого стану** в базі даних. Слухачі бачать лише події, підтверджені зафіксованими фактами. Якщо транзакція відкочується, подія не надсилається.

## Ідентичність подій {#event-identity}

Кожна подія V2 містить поля стійкої ідентичності:

| Поле | Опис |
|---|---|
| `instanceId` | ID екземпляра workflow, стабільний між continue-as-new. |
| `runId` | ID конкретного запуску виконання. |
| `workflowType` | Стійкий ключ типу, зареєстрований через `#[Type('...')]`. |
| `workflowClass` | Назва PHP-класу workflow. |
| `committedAt` | Часова позначка ISO 8601 фіксації стійкого запису: реальний час фіксації. |

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

Поле `committedAt` усіх подій означає **час фіксації**: реальний час запису стійкого запису (події історії чи запису помилки) до бази даних. Він відрізняється від:

- **Віртуального часу workflow**: логічного часу всередині виконання workflow, який використовують timer.
- **Часу спроби**: коли конкретна спроба activity почалася чи завершилася.
- **Затримки відновлення**: скільки часу минуло після запланованого спрацювання timer до фактичного продовження workflow.

Час фіксації найкорисніший для зовнішніх інтеграцій, бо відображає момент, коли стан став стійким і доступним для спостереження.

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

## Простір імен подій {#event-namespace}

Події V2 розміщено в просторі імен `Workflow\V2\Events`. Якщо оновлюєте наявний застосунок, дивіться [міграцію](../migration.md) для зіставлення сумісних подій V1.
