---
sidebar_position: 16
---

# Cancel і Terminate {#cancel-and-terminate}

Цей посібник описує вбудований Laravel API `Workflow\V2\WorkflowStub`.
Для клієнтів і worker у сервісному режимі використовуйте
[посібник PHP SDK](https://php.durable-workflow.com/),
[довідник скасування Python](https://python.durable-workflow.com/reference/errors/#durable_workflow.errors.ActivityCancelled) або
[API життєвого циклу Rust](https://rust.durable-workflow.com/durable_workflow/struct.Client.html#method.cancel_workflow).

Cancel і terminate — це повноцінні стійкі команди, які закривають активний workflow. Обидві записуються в історію команд, створюють типізовані події історії та відображаються у Waterline.

У поточному вбудованому API обидві команди закривають запуск негайно.
**Cancel** записує результат `cancelled`, а **terminate** — `terminated`.
Жодна не планує очищення всередині закритого workflow. Вбудований Laravel
також надає `requestCancellation()` для кооперативного очищення з обмеженим
часом. Server і SDK для PHP, Python та Rust підтримують окремий кооперативний
запит із worker, які явно його вмикають. Контракт можливостей, кінцевих
термінів, очищення й відновлення наведено в розділі
[Кооперативне скасування](/docs/polyglot/cancellation).

## Cancel {#cancel}

Cancel негайно переводить запуск у стан `cancelled` і записує стійку історію.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$result = $workflow->cancel();

$result->accepted();   // true
$result->outcome();    // "cancelled"
$result->commandId();  // Durable command id
$result->reason();     // null (no reason provided)
```

### Cancel із причиною {#cancel-with-reason}

Можна надати структуровану причину, щоб розрізняти скасування користувачем, політикою та оператором у журналі аудиту, історії команд і Waterline.

```php
$result = $workflow->cancel('Customer requested cancellation');

$result->reason(); // "Customer requested cancellation"
```

Причина зберігається в стійкому записі команди та типізованих подіях історії `CancelRequested` і `WorkflowCancelled`, тому залишається доступною під час replay, експорту та автономного аналізу.

### Дія cancel {#what-cancel-does}

Коли команду cancel прийнято, рушій закриває всі відкриті виконання activity й очікувані timer, переводить запуск у стан `cancelled` та відновлює батьківський workflow, який очікує на скасований дочірній, щоб той міг отримати результат.

### Коли cancel відхиляється {#cancel-is-rejected-when}

- Екземпляр ще не розпочався: `rejection_reason = instance_not_started`
- Поточний запуск уже закрито: `rejection_reason = run_not_active`
- Cancel для вибраного запуску адресує історичний, а не поточний запуск: `rejection_reason = selected_run_not_current`

## Terminate {#terminate}

Terminate негайно закриває активний workflow без планування подальшого коду workflow. Як і cancel, він не надає часового вікна очищення. Використовуйте його, коли потрібен окремий результат `terminated`.

```php
$result = $workflow->terminate();

$result->accepted();   // true
$result->outcome();    // "terminated"
```

### Terminate із причиною {#terminate-with-reason}

```php
$result = $workflow->terminate('Operator emergency shutdown');

$result->reason(); // "Operator emergency shutdown"
```

### Дія terminate {#what-terminate-does}

Terminate виконує ті самі транзакційні кроки, що й cancel, але:

- Натомість записує події історії `TerminateRequested` та `WorkflowTerminated`.
- Створює запис `WorkflowFailure` із `failure_category = terminated` та `propagation_kind = terminated`.
- Задає `closed_reason = terminated` для запуску.
- Не планує подальше виконання коду workflow.

### Коли terminate відхиляється {#terminate-is-rejected-when}

Діють ті самі умови відхилення, що й для cancel.

## Команди для вибраного запуску {#run-targeted-commands}

Cancel і terminate можуть адресувати конкретний запуск замість поточного запуску екземпляра.

```php
$selectedRun = WorkflowStub::loadRun($runId);
$result = $selectedRun->attemptCancel('Draining old run');

$result->targetScope(); // "run"
```

Команди для вибраного запуску відхиляються з `selected_run_not_current`, якщо адресований запуск уже не є поточним запуском екземпляра. Відповідь містить `requested_run_id` (адресований запуск) та `resolved_run_id` (поточний запуск, який слід використовувати далі).

## API без винятків {#non-throwing-api}

Використовуйте `attemptCancel()` та `attemptTerminate()` для обробки відхилення без винятків:

```php
$result = $workflow->attemptCancel('Duplicate order');

if ($result->rejected()) {
    $result->rejectionReason(); // e.g. "run_not_active"
}
```

`cancel()` та `terminate()` спричиняють `LogicException` у разі відхилення.

## Webhook {#webhooks}

Cancel і terminate доступні через маршрути webhook:

```text
POST /webhooks/instances/{workflowId}/cancel
POST /webhooks/instances/{workflowId}/terminate
POST /webhooks/instances/{workflowId}/runs/{runId}/cancel
POST /webhooks/instances/{workflowId}/runs/{runId}/terminate
```

Передайте причину в тілі запиту:

```json
{
  "reason": "Operator: duplicate order"
}
```

Відповідь містить результат команди, публічний ID екземпляра та причину:

```json
{
  "outcome": "cancelled",
  "workflow_id": "order-123",
  "run_id": "01J10000000000000000000021",
  "reason": "Operator: duplicate order",
  "command_id": "01J40000000000000000000021",
  "command_status": "accepted"
}
```

## Скасування не є помилкою для випадкового перехоплення {#cancellation-is-not-an-error-you-catch-by-accident}

Скасування — це явний результат життєвого циклу, а не неочікувана помилка
застосунку. У вбудованому пакеті
`Workflow\V2\Exceptions\WorkflowCancelledException` успадковує `\Error`,
а не `\Exception`. Блок `catch (\Exception $e)` його не перехопить,
а `catch (\Throwable $t)` — перехопить.

Під час читання результату скасованого workflow перехоплюйте виняток за
назвою, якщо потрібно відрізнити скасування від інших помилок. Перехоплення
винятку результату не відкриває скасований запуск знову й не планує очищення
всередині нього.

## Waterline {#waterline}

Waterline надає cancel і terminate як дії оператора в детальному перегляді вибраного запуску. Дані деталей містять прапорці `can_cancel` та `can_terminate`, визначені стійким станом.

Перегляд історії команд показує кожну команду cancel або terminate з причиною, ідентичністю ініціатора та результатом. Поле `commands[*].reason` містить причину, надану оператором або кодом виклику, якщо її було задано.

## Відповідність станів {#status-mapping}

Запуски `cancelled` та `terminated` потрапляють до категорії стану `failed` для маршрутизації списків. Поля `status` та `closed_reason` розрізняють їх:

| Стан | Категорія стану | Причина закриття |
| --- | --- | --- |
| `cancelled` | `failed` | `cancelled` |
| `terminated` | `failed` | `terminated` |

## Типізована історія {#typed-history}

Скасований запуск створює таку послідовність історії:

```
StartAccepted
WorkflowStarted
... (workflow progress) ...
CancelRequested       <- reason field present when supplied
TimerCancelled        <- for each open timer
ActivityCancelled     <- for each open activity
WorkflowCancelled     <- failure_id, failure_category, reason when supplied
```

Примусово завершений запуск створює:

```
StartAccepted
WorkflowStarted
... (workflow progress) ...
TerminateRequested    <- reason field present when supplied
TimerCancelled        <- for each open timer
ActivityCancelled     <- for each open activity
WorkflowTerminated    <- failure_id, failure_category, reason when supplied
```

## Порівняння cancel і terminate {#cancel-vs-terminate}

| | Cancel | Terminate |
| --- | --- | --- |
| Планується подальший код workflow | Ні | Ні |
| Відкриті activity скасовуються | Так | Так |
| Відкриті timer скасовуються | Так | Так |
| Метадані причини | Так | Так |
| Стійка історія команд | Так | Так |
| Батьківський workflow отримує дочірній результат | Так | Так |
| Записується помилка | Так (`cancelled`) | Так (`terminated`) |
| Категорія стану | `failed` | `failed` |
| Причина закриття | `cancelled` | `terminated` |
