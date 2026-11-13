---
sidebar_position: 5
---

# Структурні обмеження {#structural-limits}

Структурні обмеження встановлюють межі споживання ресурсів одним запуском
workflow. Якщо операція перевищила б налаштовану межу, рушій записує типізовану
помилку з машинозчитуваною категорією `structural_limit` та конкретним видом
обмеження, а потім завершує запуск із помилкою. Це захищає систему від
необмеженого розгалуження, завеликих даних та розростання метаданих.

## Види обмежень {#limit-kinds}

| Вид обмеження | Типове значення | Що обмежує |
|---|---|---|
| `pending_activity_count` | 2,000 | Одночасно відкриті виконання activity без кінцевого стану |
| `pending_child_count` | 1,000 | Одночасно відкриті дочірні workflow без кінцевого стану |
| `pending_timer_count` | 2,000 | Одночасно відкриті timer в очікуванні |
| `pending_signal_count` | 5,000 | Одночасно очікувані необроблені signal |
| `pending_update_count` | 500 | Одночасно очікувані нерозв’язані update |
| `command_batch_size` | 1,000 | Елементи одного паралельного розгалуження (`all()`) |
| `payload_size_bytes` | 2 MiB | Серіалізований розмір одного набору аргументів |
| `memo_size_bytes` | 64 KiB | Серіалізований розмір неіндексованих метаданих memo |
| `search_attribute_size_bytes` | 40 KiB | Серіалізований розмір індексованих метаданих атрибутів пошуку |
| `history_transaction_size` | 5,000 | Події історії за одне виконання завдання workflow |

Усі обмеження застосовуються під час планування, запису чи прийому команди.
Значення `0` вимикає перевірку відповідного виду обмеження.

## Попередження про наближення до межі {#soft-limit-warnings}

Перш ніж жорстка межа завершить запуск чи відхилить команду, рушій може
попередити, що ресурс наближається до максимуму. Коли кількісний ресурс
(очікувані activity, дочірні workflow, timer, signal, update, розмір пакета команд
чи події транзакції історії) перевищує налаштований відсоток жорсткої межі,
рушій записує структуроване попередження.

Типовий поріг попередження — **80%**. Наприклад, за типового обмеження
`pending_activity_count` у 2,000 попередження записується, коли запуск досягає
1,600 очікуваних activity. Запуск продовжується звичайним чином. Попередження
дає операторам час відреагувати: масштабувати worker, запустити continue-as-new
чи підвищити межу до того, як жорсткий захист завершить запуск із помилкою.

Налаштовуйте поріг через `workflows.v2.structural_limits.warning_threshold_percent`:

```env
DW_V2_LIMIT_WARNING_THRESHOLD_PERCENT=80
```

Задайте `0`, щоб повністю вимкнути попередження про наближення до межі.

Записи попереджень містять структурований контекст:

```
[Durable Workflow] Run 42 approaching structural limit [pending_activity_count]: 1620 / 2000 (81% utilization, warning at 80%).
```

Структурований контекст журналу містить `workflow_run_id`, `workflow_type`,
`limit_kind`, `current`, `limit` та `utilization_percent` для інтеграції із засобами
збирання журналів і сповіщень.

## Налаштування {#configuration}

Перевизначайте будь-яку межу через `workflows.v2.structural_limits` у
налаштуваннях або через змінні середовища:

```php
// config/workflows.php
'v2' => [
    'structural_limits' => [
        'pending_activity_count' => (int) env('DW_V2_LIMIT_PENDING_ACTIVITIES', 2000),
        'pending_child_count' => (int) env('DW_V2_LIMIT_PENDING_CHILDREN', 1000),
        'pending_timer_count' => (int) env('DW_V2_LIMIT_PENDING_TIMERS', 2000),
        'pending_signal_count' => (int) env('DW_V2_LIMIT_PENDING_SIGNALS', 5000),
        'pending_update_count' => (int) env('DW_V2_LIMIT_PENDING_UPDATES', 500),
        'command_batch_size' => (int) env('DW_V2_LIMIT_COMMAND_BATCH_SIZE', 1000),
        'payload_size_bytes' => (int) env('DW_V2_LIMIT_PAYLOAD_SIZE_BYTES', 2097152),
        'memo_size_bytes' => (int) env('DW_V2_LIMIT_MEMO_SIZE_BYTES', 65536),
        'search_attribute_size_bytes' => (int) env('DW_V2_LIMIT_SEARCH_ATTRIBUTE_SIZE_BYTES', 40960),
        'history_transaction_size' => (int) env('DW_V2_LIMIT_HISTORY_TRANSACTION_SIZE', 5000),
        'warning_threshold_percent' => (int) env('DW_V2_LIMIT_WARNING_THRESHOLD_PERCENT', 80),
    ],
],
```

## Точки застосування {#enforcement-points}

### Кількісні межі очікування на боці виконавця {#pending-count-limits-executor-side}

Перш ніж виконавець планує activity, дочірній workflow чи timer, він рахує
поточні елементи цього типу без кінцевого стану в запуску. Якщо кількість уже
досягла чи перевищила налаштовану межу, запуск одразу завершується з
`StructuralLimitExceededException`.

Це захищає від шаблонів на кшталт необмежених циклів паралельного розгалуження,
які накопичують тисячі очікуваних операцій:

```php
// This will fail if $items exceeds the pending_activity_count limit
$calls = [];
foreach ($items as $item) {
    $calls[] = fn () => activity(ProcessItemActivity::class, $item);
}
return all($calls); // Also checked against command_batch_size
```

Для обробки великих пакетів у межах обмежень обробляйте елементи частинами
обмеженого розміру:

```php
foreach (array_chunk($items, 500) as $chunk) {
    $calls = [];
    foreach ($chunk as $item) {
        $calls[] = fn () => activity(ProcessItemActivity::class, $item);
    }
    all($calls);
}
```

### Кількісні межі очікування на боці прийому {#pending-count-limits-intake-side}

Коли команда signal чи update надходить через площину керування, webhook або
`WorkflowStub`, рушій до прийняття команди перевіряє кількість необроблених
signal (стан `received`) чи нерозв’язаних update (стан `accepted`) цільового запуску.

Якщо кількість досягла чи перевищила налаштовану межу, команда **відхиляється**
з причиною `structural_limit_exceeded`. Відповідь містить машинозчитувані
метадані (`structural_limit_kind`, `structural_limit_value`,
`structural_limit_configured`), щоб викликачі могли визначити першопричину.

На відміну від меж виконавця, які завершують запуск із помилкою, межі прийому
відхиляють окрему команду без завершення workflow. Запуск залишається активним,
і викликач може повторити спробу після обробки очікуваних елементів.

Для update у Server з `request_id` відхилення зберігається за цим ключем.
Повторне використання ключа повертає початкове відхилення навіть після зміни
місткості чи налаштувань. Після підтвердженого відхилення й відновлення місткості
використайте новий ключ для нової спроби приймання. Якщо відповідь невизначена,
спочатку відновіть початкову квитанцію, перш ніж вирішувати, чи безпечне нове
приймання.

```php
// If 5,000 signals are already pending, this will be rejected:
$result = $workflow->attemptSignal('process-item', $data);
if ($result->rejected()) {
    // $result->rejectionReason() === 'structural_limit_exceeded'
    // back off and retry later
}
```

### Розмір пакета команд {#command-batch-size}

Функція `all()` перевіряє загальну кількість кінцевих операцій в одній групі
розгалуження щодо `command_batch_size`. Перевірка відбувається до планування
окремих activity чи дочірніх workflow, тож запуск завершується з помилкою
цілісно, без часткового планування пакета.

### Розмір даних {#payload-size}

Під час планування activity чи дочірнього workflow виконавець серіалізує
аргументи й перевіряє довжину в байтах щодо `payload_size_bytes`. Якщо
серіалізовані дані перевищують межу, запуск завершується з помилкою до створення
будь-яких рядків цієї операції в базі даних.

Це застосовується до:

- **Аргументів activity**: перевірка під час серіалізації аргументів
  `ActivityCall` у `scheduleActivity`.
- **Аргументів дочірнього workflow**: перевірка під час серіалізації аргументів
  запуску дочірнього workflow в `scheduleChildWorkflow`, до створення рядків
  дочірнього екземпляра чи запуску.

```php
// A 3 MiB payload will fail with the default 2 MiB limit
activity(ProcessDocumentActivity::class, $threeMegabyteBlob);
```

Щоб працювати в межах обмеження, увімкніть
[зовнішнє сховище даних](../features/external-payload-storage.md) для простору
імен, щоб середовище виконання автоматично виносило дані понад поріг до
налаштованого об’єктного сховища. Або зберігайте байти самостійно й передавайте
посилання на рівні застосунку:

```php
$ref = Storage::put('docs/incoming.pdf', $blob);
activity(ProcessDocumentActivity::class, $ref);
```

Зовнішнє сховище даних зберігає цілісність відтворення, записуючи в історію
оболонку `durable-workflow.v2.external-payload-reference.v1` із хешем. Тому
обмеження бачить оболонку посилання як дані, а не самі байти.

### Розмір memo {#memo-size}

Memo має фіксовані межі: кожне значення до 10 240 байтів у закодованому вигляді (`memo_value_bytes`), щонайбільше 100 ключів (`memo_keys`) і загалом 65 536 байтів (`memo_total_bytes`). `memo_size_bytes` перевіряє закодований розмір об’єднаної мапи memo і може зменшити загальне обмеження, але не збільшити його: більше значення діє як 65 536. Значення `0` вимикає цю перевірку; фіксовані межі лишаються.

Запуск, `upsertMemo()` і upsert memo від сервісних воркерів перевіряють memo, яке запис залишив би на запуску, до будь-якого запису. Перевищення обмеження викидає `StructuralLimitExceededException` з `limitName`. Upsert із коду workflow завершує запуск збоєм, а його подія `WorkflowFailed` записує `structural_limit_name`.

Ці правила діють з Workflow 2.25.0. Попередні версії типово задавали `memo_size_bytes` у 256 KiB, що було недосяжним через фіксоване загальне обмеження, і викидали `InvalidArgumentException` для фіксованих меж.

### Розмір транзакції історії {#history-transaction-size}

Кожне виконання завдання workflow (один крок відтворення та поступу вперед)
може створювати нові події історії: планування activity, створення timer, запис
побічного ефекту, оновлення атрибутів пошуку тощо. `history_transaction_size`
обмежує загальну кількість нових подій, які може створити одне завдання.

Це виявляє неконтрольовані цикли, які створюють необмежену кількість подій
в одному завданні без передавання керування:

```php
// If a workflow schedules thousands of operations in one task,
// the history transaction limit prevents the task from growing
// without bound. Process large batches in bounded chunks instead.
foreach (array_chunk($items, 500) as $chunk) {
    $calls = [];
    foreach ($chunk as $item) {
        $calls[] = fn () => activity(ProcessItemActivity::class, $item);
    }
    all($calls);  // Each chunk is a separate task execution
}
```

Перевірка виконується на початку кожної ітерації головного циклу виконавця.
Події під час відтворення (читання наявної історії) не зараховуються до межі.
Враховуються лише нові події, записані поточним завданням.

### Розмір атрибутів пошуку {#search-attribute-size}

Атрибути пошуку мають фіксовані межі: рядки до 2 048 символів (`search_attribute_string_characters`), keyword і елементи списків keyword до 255 символів (`search_attribute_keyword_characters`), щонайбільше 100 атрибутів (`search_attribute_count`) і загалом 65 536 байтів (`search_attribute_total_bytes`). `search_attribute_size_bytes` перевіряє JSON-розмір об’єднаної мапи атрибутів і може зменшити загальне обмеження, але не збільшити його. Значення `0` вимикає цю перевірку; фіксовані межі лишаються.

Запуск, `upsertSearchAttributes()` і upsert від сервісних воркерів застосовують ті самі обмеження до будь-якого запису й завершуються збоєм так само, як для обмежень memo.

## Класифікація помилок {#failure-taxonomy}

Коли структурне обмеження перевищено, рушій записує:

- Рядок `WorkflowFailure` із `failure_category = structural_limit`
- Подію історії `WorkflowFailed` із такими полями:
  - `failure_category = structural_limit`
  - `structural_limit_kind` — конкретне перевищене обмеження (наприклад,
    `pending_activity_count`, `command_batch_size`)
  - `structural_limit_value` — поточна кількість чи розмір, що спричинили перевищення
  - `structural_limit_configured` — налаштована верхня межа

Ці метадані машинозчитувані, тож оператори, Waterline та зовнішні інструменти
можуть визначати першопричину без розбору повідомлень довільним текстом.

## Перевірка стану {#health-check}

Поточні налаштування структурних обмежень містяться у знімку перевірки стану v2
під `structural_limits`, що показує операторам активні верхні межі:

```json
{
  "structural_limits": {
    "pending_activity_count": 2000,
    "pending_child_count": 1000,
    "pending_timer_count": 2000,
    "pending_signal_count": 5000,
    "pending_update_count": 500,
    "command_batch_size": 1000,
    "payload_size_bytes": 2097152,
    "memo_size_bytes": 65536,
    "search_attribute_size_bytes": 40960,
    "history_transaction_size": 5000,
    "warning_threshold_percent": 80
  }
}
```

## Обмеження залежно від бекенду {#backend-dependent-limits}

Знімок можливостей бекенду публікує повний контракт структурних обмежень з
урахуванням поточної інфраструктури. Більшість меж є значеннями налаштувань,
незалежними від бекенду, але деякі бекенди додають обмеження:

- **Черга SQS**: [окреме повідомлення Standard SQS](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-message-timers.html)
  можна відкласти щонайбільше на 900 секунд. Довші затримки таймерів, повторних
  спроб activity і workflow tasks транспортний рівень поділяє на частини.
  Для сумісності знімок зберігає `max_single_timer_delay_seconds: 900`.
- **База даних SQLite**: SQLite виконує записи послідовно, тож знімок містить
  `concurrent_write_safety: limited`. Високі кількісні межі очікування можуть
  спричинити конкуренцію за блокування під одночасним навантаженням worker.

Рання доставка SQS ставить у чергу наступне повідомлення з обмеженою затримкою,
не орендуючи стійке завдання, не витрачаючи спробу виконання, не записуючи
історію виконання й не запускаючи користувацький код. Початкове `available_at`
залишається незмінним. Після настання цього часу діють звичайні правила виконання
та захисту від повторної доставки. Загальні строки workflow й activity спливають
і під час очікування, тому backoff має вкладатися в ці бюджети. Драйвери черг без
межі затримки зберігають точну запитану затримку.

Повний контракт доступний у розділі `structural_limits` відповіді про можливості бекенду:

```json
{
  "structural_limits": {
    "configured": { "pending_activity_count": 2000, "..." : "..." },
    "backend_adjustments": { "max_single_timer_delay_seconds": 900 },
    "effective": { "pending_activity_count": 2000, "max_single_timer_delay_seconds": 900, "..." : "..." },
    "issues": [
      {
        "component": "structural_limits",
        "severity": "info",
        "code": "queue_max_delay_constraint",
        "message": "The [sqs] queue driver limits delayed dispatch to 900 seconds; longer task delays are chunked by the transport layer."
      }
    ]
  }
}
```

## Waterline

Waterline показує помилки структурних обмежень у таблиці винятків із категорією
`structural_limit`. Деталі помилки на часовій шкалі містять вид обмеження,
поточне значення та налаштовану верхню межу.

## Обмеження Service Mode {#server-request-boundary-limits}

HTTP-обмеження Server і Cloud відрізняються від цих вбудованих обмежень Laravel. Див. [довідник запитів Server](../polyglot/server-config-reference.md#server-request-boundary-limits).

### Розмір завершення завдання workflow {#workflow-task-completion-size}

Обмеження запитів завершення та обробка відмов SDK у Service Mode описані в [довіднику Server](../polyglot/server-config-reference.md#workflow-task-completion-size).
