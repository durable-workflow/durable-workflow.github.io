---
sidebar_position: 5
title: Worker-протокол
description: Реалізація версійованого протоколу worker plane для polling, leases, replay історії, heartbeats, completion і результатів external tasks.
tags:
  - worker-protocol
  - external-workers
  - polyglot
keywords:
  - worker-протокол
  - polling зовнішнього worker
  - workflow task bridge
---

# Worker-протокол {#worker-protocol}

Durable Workflow надає версійований worker-протокол через два bridge contracts.
Вони визначають повний набір операцій, якими зовнішні workers,
включно з окремим Durable Workflow Server, виконують poll, claim,
execute та complete workflow й activity tasks.

## Версія протоколу {#protocol-version}

Поточна версія протоколу, оголошена Server, — **1.20**.
Протокол використовує нумерацію за принципами semver:

- **Major** підвищується за несумісної зміни: нові обов'язкові поля,
  видалені операції, змінена семантика пагінації.
- **Minor** підвищується за додаткових змін: нові необов'язкові поля,
  нові нетермінальні типи команд.

Workers можуть використовувати старіший minor того самого major.
Server з `1.N` приймає `X-Durable-Workflow-Protocol-Version: 1.M`
за `M <= N` і повертає оголошений `1.N` у відповіді.
Стандартний Server `1.20` приймає версії запиту від `1.0` до `1.20`.
Перед розгортанням визначте потрібний minor та необов'язковий профіль
capabilities кожного SDK. Відсутні чи некоректні заголовки,
інші majors та worker minors вище Server відхиляються.

Повний опис протоколу можна отримати програмно:

```php
use Workflow\V2\Support\WorkerProtocolVersion;

$summary = WorkerProtocolVersion::describe();
// Returns version, verb lists, command types, and pagination defaults.
```

## Discovery capabilities {#capability-discovery}

Окремий Server публікує capabilities worker-протоколу під
`worker_protocol.server_capabilities` у `GET /api/cluster/info`.
Той самий об'єкт повертається як `server_capabilities` у відповідях
worker plane, включно з poll, heartbeat, complete та fail.

Прочитайте ці поля перед надсиланням необов'язкових полів команд:

- `supported_workflow_task_commands`: типи команд, прийняті completion workflow task.
- `poll_status`: poll-відповіді містять машиночитаний статус навіть без lease task,
  розрізняючи `leased`, `empty`, `throttled` та `unavailable`
  без виведення стану черги з `task: null`.
- `activity_retry_policy` і `activity_timeouts`: retry та timeout options activity.
- `worker_session_verbs` і `worker_sessions`: операції життєвого циклу
  worker session, поля команд activity, поновлення, виявлення відмов
  і термінальні статуси. Runtime-форму worker sessions визначає
  [`worker-sessions-runtime.schema.json`](/platform-protocol-specs/worker-sessions-runtime.schema.json).
- `child_workflow_retry_policy` і `child_workflow_timeouts`: retry та timeout options child workflow.
- `parent_close_policy`: підтримка політики закриття parent для child workflow.
- `query_tasks`: спрямовані Server query tasks workflow зовнішніх runtimes.
- `non_retryable_failures`: підтримка metadata помилок workflow та activity.

Перед polling кожен worker має зареєструвати namespace, task queue,
runtime, підтримувані ключі типів та локальну місткість через
`POST /api/worker/register`.
[Namespace, автентифікація та реєстрація worker](/docs/polyglot/namespace-auth-workers)
закріплює цей payload і контракт auth ролей.
Ширший контракт пошуку готових tasks та призначення leases описано в
[matching та dispatch tasks](/docs/polyglot/task-matching-dispatch).
Affinity activity між кількома durable-кроками описано в
[worker sessions](/docs/features/worker-sessions).

## Семантика виконання {#execution-semantics}

Транспорт worker є розподіленою координацією at-least-once,
а не доставкою exactly-once:

- replay workflow task відновлює стан із зафіксованої історії
  та не є retry цілого workflow
- сплив lease activity task може спричинити повторну доставку іншому worker
- пізні reports completion чи failure можуть відхилятися як застарілі,
  бо інша спроба вже перемогла durable race

Використовуйте `activity_execution_id` як стандартний ключ віддаленої
ідемпотентності під час звернення worker чи carrier до іншої системи.
Використовуйте `activity_attempt_id` лише якщо downstream-система
має розрізняти окремі спроби того самого логічного виконання activity.

Авторитетний контракт replay, retry, lease expiry, повторної доставки
та exactly-once durable-історії описано в
[гарантіях виконання та ідемпотентності](/docs/constraints/execution-guarantees).

## Workflow Task Bridge {#workflow-task-bridge}

Контракт `WorkflowTaskBridge` визначає взаємодію зовнішнього worker
з durable workflow tasks:

| Операція | Опис |
|------|-------------|
| `poll` | Пошук готових workflow tasks за чергою та критеріями сумісності |
| `claim` / `claimStatus` | Claim конкретного task з отриманням lease на 5 хвилин |
| `historyPayload` | Отримання повної історії replay leased task |
| `historyPayloadPaginated` | Отримання історії сторінками для великих workflows |
| `execute` | Claim та виконання task у процесі через executor пакета |
| `complete` | Подання команд зовнішнього worker для завершення task |
| `fail` | Запис помилки task зовнішнім worker |
| `heartbeat` | Подовження lease отриманого task |

### Історія зі сторінками {#paginated-history}

Для workflows з великою історією отримуйте події сторінками
через `historyPayloadPaginated`:

```php
use Workflow\V2\Contracts\WorkflowTaskBridge;

$bridge = app(WorkflowTaskBridge::class);

$afterSequence = 0;
$allEvents = [];

do {
    $page = $bridge->historyPayloadPaginated($taskId, $afterSequence, 500);
    $allEvents = array_merge($allEvents, $page['history_events']);
    $afterSequence = $page['next_after_sequence'] ?? $afterSequence;
} while ($page['has_more']);
```

Стандартний розмір сторінки — 500 подій, що відповідає
`WorkerProtocolVersion::DEFAULT_HISTORY_PAGE_SIZE` і
`default_history_page_size` capabilities worker-протоколу Server.
Максимум — 1000. Server може оголосити інше дієве стандартне значення
в worker-protocol manifest, тому читайте capability замість жорсткого
задання числа. Відповідь містить `has_more` та `next_after_sequence`
для cursor pagination.

### Стиснення історії {#history-compression}

Для workflows з дуже великою історією bridge чи Server може стиснути
payload подій для зменшення передачі. Стиснення явно вмикається
ініціатором через параметр на зразок `Accept-Encoding`.

Коли кількість подій відповіді перевищує поріг стиснення 50,
bridge може повернути:

- `history_events`: `[]`, порожній масив, що вказує на події у стисненому полі
- `history_events_compressed`: стиснений payload у base64
- `history_events_encoding`: алгоритм `gzip` або `deflate`

Ініціатор декодує base64, розпаковує вказаним алгоритмом і декодує JSON
для відновлення початкового масиву `history_events`.

```php
use Workflow\V2\Support\HistoryPayloadCompression;

// Compress a history payload for transfer (bridge/server side).
$compressed = HistoryPayloadCompression::compress($payload, 'gzip');

// Decompress on the worker side.
$original = HistoryPayloadCompression::decompress($compressed);
```

Якщо ініціатор не запитує стиснення або кількість подій нижча за поріг,
відповідь містить стандартний нестиснений масив `history_events`.

### Семантика long poll {#long-poll-semantics}

Обидві операції `poll` підтримують необов'язковий long-poll mode.
За параметра `timeout_seconds` bridge чи Server утримує підключення
до вказаного часу в очікуванні готового відповідного task
замість негайного порожнього результату.

| Параметр | Стандартне значення | Мінімум | Максимум |
|-----------|---------|-----|-----|
| `timeout_seconds` | 30 | 1 | 60 |

Поведінка:

- Якщо task стає готовим під час очікування, він повертається негайно.
- Якщо timeout спливає без task, відповідь зберігає звичайну poll-оболонку
  та повертає `task: null` із `poll_status: "empty"`.
- Після порожньої long-poll відповіді клієнт має повторити запит негайно,
  якщо не завершує роботу.
- HTTP timeouts транспорту мають перевищувати 60 секунд
  для запобігання передчасному disconnect.

Кожна poll-відповідь worker містить `poll_status`:

| Значення | Значення статусу |
|------|---------|
| `leased` | Server надав task у lease цьому worker. |
| `empty` | Відповідний task не став готовим до завершення short poll чи timeout long poll. |
| `throttled` | Обмеження приймання не дозволили Server видати lease, хоча черга може мати готові tasks. |
| `unavailable` | Черга чи matching тимчасово недоступні. Worker має трактувати poll як тимчасову інфраструктурну невдачу. |

Перевіряйте `poll_status` перед висновком, що порожній poll означає
вільну місткість. `task: null` із `poll_status: "throttled"`
означає backpressure, а не відсутність роботи.

```php
use Workflow\V2\Support\WorkerProtocolVersion;

$semantics = WorkerProtocolVersion::longPollSemantics();
// ['default_timeout_seconds' => 30, 'min_timeout_seconds' => 1, 'max_timeout_seconds' => 60]

// Clamp a caller-supplied timeout to the valid range.
$clamped = WorkerProtocolVersion::clampLongPollTimeout($userTimeout);
```

### Статус poll-відповіді {#poll-response-status}

Server зберігає один контракт poll-відповіді для polling
workflow tasks, activity tasks і query tasks:

- `task`: payload leased task або `null`, якщо lease не видано.
- `poll_status`: машиночитаний результат спроби poll.
- `protocol_version` та `server_capabilities`: повернуті поля
  worker-protocol manifest.

Workers мають перевіряти `poll_status` перед припущеннями
щодо `task` для конкретного маршруту:

| `poll_status` | Типовий HTTP status | Значення |
| --- | --- | --- |
| `leased` | `200` | Server видав lease роботи, `task` містить payload. |
| `empty` | `200` | Відповідний task не став готовим до повернення poll. |
| `throttled` | `200` | Обмеження приймання черги не дозволили новий lease цієї спроби poll. |
| `unavailable` | `503` або `200` | Server не міг безпечно координувати чергу й повернув типізований unavailable. |
| `draining` | `409` | Група build ID worker у drain. Server відмовляє в новому lease і повертає `reason: "worker_draining"`. |

### Запити completion, heartbeat і fail {#completion-heartbeat-and-fail-requests}

Endpoints workflow-task `complete`, `heartbeat` та `fail` вимагають
повторення worker двох полів ідентичності lease з відповіді poll чи claim:

| Поле | Тип | Опис |
|------|------|-------------|
| `lease_owner` | string | Ідентичність worker-власника lease task. Має збігатися з `lease_owner` із `poll` чи `claim`. |
| `workflow_task_attempt` | integer ≥ 1 | Номер спроби leased task. Має збігатися з `workflow_task_attempt` із `poll` чи `claim`. |

Застарілі спроби чи неправильні власники lease відхиляються перед
застосуванням команд. Worker зі спливлим lease не може зафіксувати
команди replay для task, який уже отримав інший claim.

Endpoints і тіла запитів:

- `POST /api/worker/workflow-tasks/{task_id}/complete` — потребує
  `lease_owner`, `workflow_task_attempt` та непорожнього масиву `commands`.
  Форми команд наведено в [типах команд](#command-types).
- `POST /api/worker/workflow-tasks/{task_id}/heartbeat` — потребує
  `lease_owner` та `workflow_task_attempt`. Повертає поновлений expiry lease
  та поточний статус run.
- `POST /api/worker/workflow-tasks/{task_id}/fail` — потребує
  `lease_owner`, `workflow_task_attempt` та об'єкта `failure`
  з обов'язковим `message` і необов'язковими `type` та `stack_trace`.

Приклад запиту complete:

```json
{
  "lease_owner": "py-worker-1",
  "workflow_task_attempt": 1,
  "commands": [
    { "type": "complete_workflow" }
  ]
}
```

Приклад запиту heartbeat:

```json
{
  "lease_owner": "py-worker-1",
  "workflow_task_attempt": 1
}
```

Приклад запиту fail:

```json
{
  "lease_owner": "py-worker-1",
  "workflow_task_attempt": 1,
  "failure": {
    "message": "Replay mismatch at event 7",
    "type": "DeterminismFailed"
  }
}
```

### Типи команд {#command-types}

Під час completion workflow task зовнішній worker подає список
типізованих команд. Один completion може мати не більше однієї
термінальної команди.

**Нетермінальні команди**, нуль чи більше, обробляються за порядком:

| Тип | Обов'язкові поля | Опис |
|------|----------------|-------------|
| `schedule_activity` | `activity_type` | Планування activity task для виконання |
| `start_timer` | `delay_seconds` | Планування durable timer |
| `start_child_workflow` | `workflow_type` | Запуск екземпляра child workflow |
| `complete_update` | `update_id` | Позначення прийнятого update застосованим і завершеним |
| `fail_update` | `update_id`, `message` | Позначення прийнятого update невдалим |
| `record_side_effect` | `result` | Запис детермінованого результату side effect |
| `record_version_marker` | `change_id`, `version`, `min_supported`, `max_supported` | Запис рішення версіювання |
| `upsert_search_attributes` | `attributes` | Upsert індексованих metadata run workflow |

`schedule_activity` приймає необов'язкові `retry_policy`,
`start_to_close_timeout`, `schedule_to_start_timeout`,
`schedule_to_close_timeout` та `heartbeat_timeout`.
`retry_policy` використовує `max_attempts`, `backoff_seconds`
і `non_retryable_error_types`.

`start_child_workflow` приймає необов'язкові `parent_close_policy`,
`retry_policy`, `execution_timeout_seconds` та `run_timeout_seconds`.
`parent_close_policy` є `abandon`, `request_cancel`,
`request_cancellation` або `terminate`. `request_cancel` закриває child
негайно. `request_cancellation` запитує кооперативне cleanup з початковими
ідентичністю cancellation та deadline. Дивіться
[кооперативне скасування](/docs/polyglot/cancellation).
Child retry policy використовує той самий об'єкт `max_attempts`,
`backoff_seconds` та `non_retryable_error_types`, що й activities.
Retry backoff діє після невдалого child run. Некоректні child start commands
є помилками протоколу та не витрачають child retry attempts.

`complete_update` закриває прийнятий update з `update_id` після застосування
update handler worker. Він приймає необов'язковий payload `result`
у тій самій оболонці `{codec, blob}`, що й результати completion workflow.
`fail_update` закриває прийнятий update як невдалий і приймає
необов'язкові `exception_class`, `exception_type` та `non_retryable`
разом з обов'язковим `message`.

**Термінальні команди**, не більше однієї:

| Тип | Обов'язкові поля | Опис |
|------|----------------|-------------|
| `complete_workflow` | — | Позначення run завершеним, необов'язковий `result` |
| `fail_workflow` | `message` | Позначення run невдалим |
| `continue_as_new` | — | Закриття run та початок нового, необов'язкові `arguments`, `workflow_type` |

Якщо cancel чи terminate закриває run під час lease workflow task,
виклики task `history`, `heartbeat`, `complete` і `fail` зберігають
оболонку worker-протоколу, але відхиляються з `reason: "run_closed"`.
Відповідь також містить `can_continue: false`, `cancel_requested: true`
та конкретний `stop_reason`, наприклад `run_cancelled` чи `run_terminated`.
Workers можуть відрізнити спостереження cancellation від загальної lease error.
`run_closed_reason` і `run_closed_at` із durable-запису run
дають workers змогу логувати точний стан закриття, який зупинив leased task.

Poll-відповіді workflow task містять сталий контекст resume,
скопійований із durable payload task:

| Поле | Значення |
|------|---------|
| `workflow_wait_kind` | Очікування цього task: `update`, `signal`, `child`, `condition`, `timer` чи `null` для звичайного replay/start |
| `open_wait_id` | Стала ідентичність очікування, наприклад `update:{id}` чи `signal-application:{id}` |
| `resume_source_kind` / `resume_source_id` | Durable-джерело wake task, наприклад `workflow_update`, `workflow_signal`, `timer` чи `child_workflow_run` |
| `workflow_update_id` | ID прийнятого update, який застосовує task |
| `workflow_signal_id` | ID прийнятого signal, який застосовує task |
| `signal_name` / `signal_wait_id` | Ціль signal та стала ідентичність очікування, коли task застосовує signal чи timer-backed очікування signal |
| `workflow_command_id` | ID команди площини керування, яка створила task, за наявності |
| `activity_execution_id` / `activity_attempt_id` / `activity_type` | Ідентифікатори activity після успішного чи невдалого completion activity |
| `child_call_id` / `child_workflow_run_id` | Ідентифікатори очікування child під час визначення результату child workflow |
| `timer_id` / `condition_wait_id` | Ідентифікатори чистого timer та timer-backed condition під час resume після timer |
| `condition_key` / `condition_definition_fingerprint` | Стала мітка condition та fingerprint predicate, записані timer-backed очікуванням condition |
| `workflow_sequence` / `workflow_event_type` | Sequence історії та тип події event-backed tasks результату activity, child чи timer |

Незастосовні поля дорівнюють `null`. SDK workers мають використовувати
ці поля замість сканування історії для зв'язку leased task із прийнятим
update, signal, результатом activity, результатом child чи timer-backed wait.
Pure timer resume задає `workflow_wait_kind: "timer"`,
`open_wait_id: "timer:{timer_id}"`, `resume_source_kind: "timer"` та `timer_id`.
Signal-backed resume задає `workflow_wait_kind: "signal"` і `signal_name`.
Tasks застосування прийнятого signal також задають `workflow_signal_id`,
а timer-backed signal waits — `signal_wait_id` та `timer_id`, що спрацював.
Condition-timeout resume задає `workflow_wait_kind: "condition"`,
`condition_wait_id` і для keyed waits — `condition_key`
та `condition_definition_fingerprint`.

## Query tasks {#query-tasks}

Коли query площини керування спрямований до workflow, чий код належить
зовнішньому runtime, окремий Server не може replay його в PHP-процесі.
Натомість він створює тимчасовий query task і чекає активного worker
з підтримкою query на task queue workflow. Це включає віддалені
PHP SDK workers, чий код workflow перебуває поза процесом Server.

Query tasks є read-only. Workers replay надану історію,
викликають зареєстрований query handler і complete чи fail query task.
Вони не записують durable-події історії та не повторюються
після timeout query площини керування в ініціатора.

| Endpoint | Опис |
|----------|-------------|
| `POST /api/worker/query-tasks/poll` | Long poll query task зареєстрованої task queue worker |
| `POST /api/worker/query-tasks/{query_task_id}/complete` | Подання результату query |
| `POST /api/worker/query-tasks/{query_task_id}/fail` | Відхилення чи помилка query |

Poll-запит:

```json
{
  "worker_id": "py-worker-1",
  "task_queue": "orders"
}
```

Poll-відповідь:

```json
{
  "poll_status": "leased",
  "task": {
    "query_task_id": "01J...",
    "query_task_attempt": 1,
    "workflow_id": "order-123",
    "run_id": "01J...",
    "workflow_type": "order-processing",
    "query_name": "status",
    "payload_codec": "avro",
    "workflow_arguments": { "codec": "avro", "blob": "<base64-avro-bytes>" },
    "query_arguments": { "codec": "avro", "blob": "<base64-avro-bytes>" },
    "history_events": [],
    "task_queue": "orders",
    "lease_owner": "py-worker-1",
    "lease_expires_at": "2026-04-18T12:00:00.000000Z"
  },
  "protocol_version": "1.13",
  "server_capabilities": { "query_tasks": true }
}
```

`task` дорівнює `null`, якщо poll не видав lease. Використовуйте
`poll_status`, щоб розрізняти звичайне порожнє очікування, throttling
та тимчасову недоступність черги. Worker має повторити `lease_owner`
і `query_task_attempt` під час completion чи failure.
Застарілі спроби та неправильні власники leases відхиляються.

Запит complete:

```json
{
  "lease_owner": "py-worker-1",
  "query_task_attempt": 1,
  "result": { "status": "ready" },
  "result_envelope": { "codec": "avro", "blob": "<base64-avro-bytes>" }
}
```

Запит fail:

```json
{
  "lease_owner": "py-worker-1",
  "query_task_attempt": 1,
  "failure": {
    "reason": "rejected_unknown_query",
    "message": "unknown query 'status'",
    "type": "QueryFailed"
  }
}
```

Використовуйте `reason: "rejected_unknown_query"`, якщо тип workflow
не має відповідного query handler. Ініціатор площини керування отримує `404`.
Інші query failures worker мають використовувати `reason: "query_rejected"`
і повертати `409`. За відсутності активного worker, який може прийняти query,
площина керування повертає `query_worker_unavailable`.
Без результату до налаштованого timeout вона повертає `query_worker_timeout`.

## Activity Task Bridge {#activity-task-bridge}

Контракт `ActivityTaskBridge` визначає взаємодію зовнішнього worker
з activity tasks:

| Операція | Опис |
|------|-------------|
| `poll` | Пошук готових activity tasks за чергою та критеріями сумісності |
| `claim` / `claimStatus` | Claim конкретного activity task з lease |
| `complete` | Запис completion activity з результатом |
| `fail` | Запис failure activity з необов'язковими `failure.details` із codec |
| `status` | Перевірка liveness та стану cancellation без поновлення lease |
| `heartbeat` | Подовження lease та повідомлення необов'язкового прогресу |

Відповіді heartbeat activity містять `can_continue` та `cancel_requested`,
щоб довготривалі activities могли реагувати на запити скасування.
Коли cancel чи terminate рівня run зупиняє leased activity,
відповіді heartbeat, complete та fail також містять
`run_closed_reason` і `run_closed_at`.

## Codecs payload {#payload-codecs}

Кожен рядок bytes payload через межу worker-протоколу позначений
**`payload_codec`**, що визначає формат blob. V2 використовує один
мовно-незалежний codec **`avro`**, щоб будь-який SDK (PHP, Python, Go,
TypeScript, Rust) міг кодувати та декодувати payload без спільного
runtime чи app key. Активний Server оголошує підтримку codecs у
**`capabilities.payload_codecs`** відповіді `GET /api/cluster/info`.

### Codec `avro` {#the-avro-codec}

`avro` є codec типізованих значень v2. Кожен payload використовує
закріплену рекурсивну schema `durable_workflow.protocol.Value`
та стандартне Avro single-object framing. Іменовані branches зберігають
booleans, signed 64-bit integers, скінченні doubles, bytes, UTF-8 strings,
lists та string-keyed maps без schemas окремих workflows чи registry.
Дивіться [протокол Avro Value](/docs/polyglot/avro-value-protocol/).

### Формат передачі: оболонка payload {#wire-format-payload-envelope}

Поля з bytes payload (`arguments`, `result`, `payload` тощо)
надають codec поруч із непрозорим рядком. Poll-відповіді мають вигляд:

```json
{
  "task_id": "...",
  "payload_codec": "avro",
  "arguments": {
    "codec": "avro",
    "blob": "<base64-avro-bytes>"
  },
  "history_events": [ ... ]
}
```

Worker читає `payload_codec` і підтверджує `avro` перед декодуванням.
Невідомий codec є помилкою. Worker не має визначати формат за вмістом чи вгадувати.

Completions activity надсилають `result` у тій самій оболонці `{codec, blob}`.
Failures activity можуть надсилати структуровані діагностичні payload
під `failure.details`. За наявності це також оболонка `{codec, blob}`.
Server зберігає details blob без змін і записує `details_payload_codec`
з durable payload помилки, щоб workers не на PHP могли передавати
діагностичні дані в обидва боки без PHP serialization.

Сталий міжмовний контракт помилки включає `activity_type`,
`failure_category`, `exception_type`, `message`, `code`, `non_retryable`
та `details` із codec. Runtime-поля, зокрема назви класів винятків,
шляхи source files, номери рядків і stack traces, є лише діагностикою.
SDK не мають надавати їх у стандартному `exception_payload`.
Вони можуть показувати їх лише якщо worker чи Server явно записав
оболонку `diagnostics` або `runtime_diagnostics`.

### Запуск workflow {#starting-a-workflow}

`POST /api/workflows` приймає `input` у двох формах:

1. **Звичайний JSON-масив** — Server перетворює кожне JSON-значення
   на закріплену Avro Value schema. JSON input не може виразити bytes branch.
   Клієнти, яким потрібні bytes, надсилають явну Avro envelope.

   ```json
   { "workflow_type": "MyWorkflow", "input": ["hello", 42] }
   ```

2. **Явна оболонка** — для клієнтів із уже закодованими bytes:

   ```json
   {
     "workflow_type": "MyWorkflow",
     "input": { "codec": "avro", "blob": "<base64-avro-bytes>" }
   }
   ```

Server зберігає blob без змін і позначає run codec `avro`.

Codec зберігається на `WorkflowRun` і **діє протягом життя run**:
аргументи activities, результати, аргументи signals/updates
та вхідні дані child workflows кодуються Avro.

Embedded/package starts, запущені з PHP через
`WorkflowStub::make(...)->start(...)` замість HTTP API,
також визначають стандартний codec нового run через остаточний
контракт Avro-only v2.

## Отримання bridges {#resolving-the-bridges}

Обидва bridges зареєстровані в контейнері Laravel
та доступні безпосередньо:

```php
use Workflow\V2\Contracts\WorkflowTaskBridge;
use Workflow\V2\Contracts\ActivityTaskBridge;

$workflowBridge = app(WorkflowTaskBridge::class);
$activityBridge = app(ActivityTaskBridge::class);
```

## Пов'язані настанови {#related-guides}

- [Server](./server.md) описує endpoints площини керування
  та форму розгортання, які надають цей протокол.
- [Зовнішнє виконання](./external-execution.md) пояснює контракти
  worker, bridge та handler рівня activity поверх worker-протоколу.
