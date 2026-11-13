---
sidebar_position: 3
title: Довідник конфігурації Server
description: Довідник змінних середовища Durable Workflow Server, стандартних значень, застарілих aliases і налаштувань інфраструктури runtime.
tags:
  - server
  - config
  - reference
  - operations
keywords:
  - конфігурація Durable Workflow Server
  - змінні середовища DW
  - перевірка середовища Server
  - середовище workflow Server
---

# Довідник конфігурації Server {#server-config-reference}

Ця сторінка описує операторський контракт змінних середовища `DW_*`
для образу Durable Workflow Server. Використовуйте її для шаблонів
розгортання, перевірки production-конфігурації або переходу від старих
назв `WORKFLOW_*` / `ACTIVITY_*` до контракту Server v2. Поточний Server —
нативний Server 3.x; у розділі [Нативний Server 3.x](#native-server-3x)
перелічено, які налаштування він враховує, ігнорує чи відхиляє. PHP Server 2.x
зафіксовано на версії 2.11.8.

PHP Server 2.x також використовує звичайні налаштування Laravel runtime,
зокрема `DB_*`, `REDIS_*`, `QUEUE_CONNECTION` та `CACHE_STORE`.
Ці інфраструктурні змінні перелічено окремо як налаштування розгортання,
що не є керуванням Durable Workflow API.

## Нативний Server 3.x {#native-server-3x}

Таблиці змінних на цій сторінці фіксують контракт `DW_*`, опублікований
PHP Server 2.11.0, а їхні описи призначення стосуються PHP 2.x. Нативний
Server 3.x читає ті самі назви з тими самими застарілими aliases через аудит
під час старту, який присвоює кожному налаштуванню контракту одну з таких дій:

- **Враховується:** нативний Server читає налаштування й застосовує його
  значення з PHP. Налаштування, не перелічені нижче, враховуються.
- **Ігнорується:** нативний Server приймає налаштування, але воно не змінює
  нічого, що бачать клієнти чи оператори.
- **Відхиляється, якщо не стандартне:** нативний Server відмовляється
  стартувати, якщо налаштування задано й воно не зберігає стандартне значення
  PHP. Помилка старту називає налаштування, прийнятне значення та причину.

Нативний Server читає середовище один раз під час старту процесу й не має
кешу конфігурації. Щоб змінити налаштування, перезапустіть або замініть процес
Server. Як і `env:audit` у PHP, нативний аудит попереджає про невідомі назви
`DW_*` та застарілі назви, а `DW_ENV_AUDIT_STRICT=1` перетворює ці
попередження на відмову старту.

Нативний Server відхиляє ці налаштування, якщо вони не зберігають наведене
значення:

| Причина | Налаштування та прийнятні значення |
| --- | --- |
| Нативний Server завжди прив'язує runs до записаного визначення workflow | `DW_V2_PIN_TO_RECORDED_FINGERPRINT`: не задано або `true` |
| Нативний Server не може застосувати змінений ліміт операцій Nexus | `DW_MAX_NEXUS_OPERATIONS_PER_CALLER`: не задано або `200`<br />`DW_MAX_OPERATION_NAME_LENGTH`: не задано або `256` |
| Нативний Server не може застосувати змінений ліміт серій метрик | `DW_METRICS_PROMETHEUS_ACTIVITY_SERIES_LIMIT`: не задано або `100`<br />`DW_METRICS_PROMETHEUS_TASK_QUEUE_SERIES_LIMIT`: не задано або `100`<br />`DW_METRICS_PROMETHEUS_WORKFLOW_SERIES_LIMIT`: не задано або `100`<br />`DW_METRICS_WORKFLOW_TASK_FAILURE_TYPE_LIMIT`: не задано або `20` |
| Нативний Server не може застосувати змінену межу query tasks в очікуванні | `DW_QUERY_TASK_MAX_PENDING_PER_QUEUE`: не задано або `1024` |
| Нативний Server не може застосувати змінений структурний ліміт | `DW_V2_LIMIT_COMMAND_BATCH_SIZE`: не задано або `1000` |
| Нативний Server не може застосувати змінені інтервали відновлення tasks | `DW_V2_TASK_REPAIR_FAILURE_BACKOFF_MAX_SECONDS`: не задано або `60`<br />`DW_V2_TASK_REPAIR_REDISPATCH_AFTER_SECONDS`: не задано або `3`<br />`DW_V2_TASK_REPAIR_SCAN_LIMIT`: не задано або `25` |
| Нативний Server не публікує походження пакета | `DW_EXPOSE_PACKAGE_PROVENANCE`: не задано або `false` |
| Нативний Server не повідомляє оголошення багатовузловості | `DW_V2_MULTI_NODE`: не задано або `false` |
| Нативний Server не виконує workflows Workflow 1 | `DW_V1_ENABLED`: не задано або `false` |
| Нативний Server не перевіряє сумісність парку workers | `DW_V2_FLEET_VALIDATION_MODE`: не задано або не `fail` |
| Нативний Server передає tasks лише workers, що виконують polling | `DW_TASK_DISPATCH_MODE`: не задано або `poll` |
| Нативний Server не має конфігурації зовнішнього виконавця | `DW_EXTERNAL_EXECUTOR_CONFIG_OVERLAY`: не задано або порожнє<br />`DW_EXTERNAL_EXECUTOR_CONFIG_PATH`: не задано або порожнє |
| Нативний Server не має режиму відновлення міграції memo | `DW_WORKFLOW_MEMO_MIGRATION_RECOVERY`: не задано або порожнє |
| Нативний Server не має лімітів durable-стану namespace | `DW_NAMESPACE_DURABLE_HARD_LIMITS`: не задано або `{}`<br />`DW_NAMESPACE_DURABLE_LIMITS`: не задано або `{}`<br />`DW_NAMESPACE_DURABLE_OVERRIDES`: не задано або `{}` |
| Нативний Server не має лімітів admission запитів namespace | `DW_NAMESPACE_ADMISSION_OVERRIDES`: не задано або `{}`<br />`DW_NAMESPACE_HARD_MAX_CONCURRENT_REQUESTS`: не задано або порожнє<br />`DW_NAMESPACE_HARD_MAX_REQUESTS_PER_MINUTE`: не задано або порожнє<br />`DW_NAMESPACE_MAX_CONCURRENT_REQUESTS`: не задано або порожнє<br />`DW_NAMESPACE_MAX_REQUESTS_PER_MINUTE`: не задано або порожнє |
| Нативний Server не має політики меж сервісів | `DW_SERVICE_BOUNDARY_CROSS_NAMESPACE_DEFAULT`: не задано або `allow`<br />`DW_SERVICE_BOUNDARY_HARD_MAX_IN_FLIGHT`: не задано або порожнє<br />`DW_SERVICE_BOUNDARY_HARD_RATE_LIMIT_PER_MINUTE`: не задано або порожнє<br />`DW_SERVICE_BOUNDARY_MAX_IN_FLIGHT`: не задано або порожнє<br />`DW_SERVICE_BOUNDARY_NAMESPACE_MAX_IN_FLIGHT`: не задано або порожнє<br />`DW_SERVICE_BOUNDARY_NAMESPACE_OVERRIDES`: не задано або `{}`<br />`DW_SERVICE_BOUNDARY_NAMESPACE_RATE_LIMIT_PER_MINUTE`: не задано або порожнє<br />`DW_SERVICE_BOUNDARY_RATE_LIMIT_PER_MINUTE`: не задано або порожнє |
| Нативний Server не має файлу admission сховища | `DW_STORAGE_ADMISSION_FILE`: не задано або порожнє<br />`DW_STORAGE_ADMISSION_SOURCE`: не задано або порожнє |
| Нативний Server не має лімітів admission tasks | `DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE`: не задано, порожнє або не додатне число<br />`DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE`: не задано, порожнє або не додатне число<br />`DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE`: не задано, порожнє або не додатне число<br />`DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE`: не задано, порожнє або не додатне число<br />`DW_TASK_QUEUE_ADMISSION_OVERRIDES`: не задано або `{}`<br />`DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE`: не задано, порожнє або не додатне число<br />`DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE`: не задано, порожнє або не додатне число<br />`DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE`: не задано, порожнє або не додатне число<br />`DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE`: не задано, порожнє або не додатне число |
| Нативний Server реалізує одну версію worker-протоколу | `DW_WORKER_PROTOCOL_VERSION`: не задано або `1.20` |
| Нативний Server ніколи не довіряє пересланим заголовкам атрибуції | `DW_TRUST_FORWARDED_ATTRIBUTION_HEADERS`: не задано або `false` |
| Нативний Server прив'язує runs лише до зареєстрованих build id workers; він не має загальносерверних маркерів сумісності | `DW_V2_COMPATIBILITY_HEARTBEAT_TTL`: не задано або `30`<br />`DW_V2_COMPATIBILITY_NAMESPACE`: не задано або порожнє<br />`DW_V2_CURRENT_COMPATIBILITY`: не задано або порожнє<br />`DW_V2_NAMESPACE`: не задано або порожнє<br />`DW_V2_SUPPORTED_COMPATIBILITIES`: не задано або порожнє |
| Нативний Server не повідомляє про проблеми кодека payload | `DW_SERIALIZER`: не задано, порожнє або `avro` |
| Нативний Server працює лише як окремий процес HTTP-сервера | `DW_MODE`: не задано або `service`<br />`DW_SERVER_PROCESS_CLASS`: не задано або не одне з `scheduler_node`, `worker_node`<br />`DW_SERVER_TOPOLOGY_SHAPE`: не задано або не одне з `embedded`, `split_control_execution` |
| Нативний Server обслуговує `default` для запитів, що не називають namespace | `DW_DEFAULT_NAMESPACE`: не задано або `default` |
| Нативний Server зберігає external payloads лише на своєму локальному диску | `DW_EXTERNAL_PAYLOAD_S3_BUCKET`: не задано або порожнє |
| Нативний Server підтримує лише власну автентифікацію за токеном | `DW_AUTH_BACKWARD_COMPATIBLE`: не задано або `true`<br />`DW_AUTH_PROVIDER`: не задано або порожнє<br />`DW_PRINCIPAL_TOKENS`: не задано або порожнє |

Нативний Server приймає, але ігнорує: `DW_ADMIN_SIGNATURE_KEY`, `DW_AUTH_METHOD_HEADER`, `DW_AUTH_STATUS_HEADER`, `DW_BOOTSTRAP_DELAY_SECONDS`, `DW_BOOTSTRAP_RETRIES`, `DW_CALLER_LABEL_HEADER`, `DW_CALLER_TYPE_HEADER`, `DW_COMPRESSION_ENABLED`, `DW_DUE_TIMER_RECOVERY_SCAN_LIMIT`, `DW_EXPIRED_WORKFLOW_TASK_RECOVERY_TTL_SECONDS`, `DW_EXTERNAL_PAYLOAD_S3_ACCESS_KEY_ID`, `DW_EXTERNAL_PAYLOAD_S3_ENDPOINT`, `DW_EXTERNAL_PAYLOAD_S3_REGION`, `DW_EXTERNAL_PAYLOAD_S3_SECRET_ACCESS_KEY`, `DW_EXTERNAL_PAYLOAD_S3_SESSION_TOKEN`, `DW_EXTERNAL_PAYLOAD_S3_USE_PATH_STYLE_ENDPOINT`, `DW_MAX_HISTORY_EVENTS`, `DW_MAX_TASKS_PER_POLL`, `DW_OBSERVABILITY_BAGGAGE_ALLOWLIST`, `DW_OBSERVABILITY_CONTEXT_ENABLED`, `DW_OPERATOR_SIGNATURE_KEY`, `DW_PACKAGE_PROVENANCE_PATH`, `DW_POLLING_CACHE_PATH`, `DW_QUERY_TASK_POLL_MAX_CONCURRENT`, `DW_QUERY_TASK_POLL_MAX_CONCURRENT_PER_NAMESPACE`, `DW_SIGNATURE_KEY`, `DW_SQLITE_CLAIM_LOCK_TTL_SECONDS`, `DW_SQLITE_CLAIM_LOCK_WAIT_SECONDS`, `DW_STORAGE_ADMISSION_MAX_AGE_SECONDS`, `DW_V2_CACHE_VALIDATION_MODE`, `DW_V2_GUARDRAILS_BOOT`, `DW_V2_LIMIT_SEARCH_ATTRIBUTE_SIZE_BYTES`, `DW_V2_LIMIT_WARNING_THRESHOLD_PERCENT`, `DW_V2_MATCHING_ROLE_QUEUE_WAKE`, `DW_V2_TASK_DISPATCH_MODE`, `DW_V2_TASK_REPAIR_LOOP_THROTTLE_SECONDS`, `DW_V2_TENANCY_ENVIRONMENT`, `DW_V2_TENANCY_ORGANIZATION`, `DW_V2_TENANCY_PROJECT`, `DW_V2_UPDATE_WAIT_POLL_INTERVAL_MS`, `DW_V2_VALIDATE_CACHE_BACKEND`, `DW_WAKE_SIGNAL_TTL_SECONDS`, `DW_WORKER_LONG_POLL_MAX_CONCURRENT`, `DW_WORKER_LONG_POLL_MAX_CONCURRENT_PER_NAMESPACE`, `DW_WORKER_LONG_POLL_RESERVED_HTTP_WORKERS`, `DW_WORKER_POLL_INTERVAL_MS`, `DW_WORKER_POLL_SIGNAL_CHECK_INTERVAL_MS`, `DW_WORKER_SIGNATURE_KEY`.

Нативний Server не має серверних обмежень leases чи dispatch для task queues,
budget-груп, admission запитів namespace, квот сталого стану namespace чи
обмежень утримуваних polls, і нативного еквівалента для них поки немає. Кожен
процес нативного Server відкриває щонайбільше чотири з'єднання з базою даних.
Для query tasks діє фіксована межа: 16 незавершених або орендованих tasks на
namespace; понад неї нові queries відхиляються з HTTP `429` і
`query_task_queue_full`, як і на PHP. Ця межа не налаштовується. Щоб обмежити
паралельність tasks на нативному Server, визначте кількість slots кожного SDK
worker і кількість workers. [Допуск черги завдань](/docs/polyglot/task-queue-admission)
описує засоби керування PHP 2.x.

Автентифікація нативного Server відрізняється від PHP 2.x так:

- `DW_AUTH_TOKEN` обов'язковий. Без нього нативний Server не стартує, а
  спільний токен приймається для кожної ролі поряд із будь-якими токенами
  окремих ролей.
- `DW_AUTH_DRIVER` приймає лише `token`. Нативний Server відхиляє
  `signature`, а образ випуску також відхиляє `none`. Налаштування ключів
  підпису ігноруються.

Нативний Server також читає налаштування поза контрактом PHP:

- `DW_BIND_ADDRESS`: адреса прослуховування. Бінарний файл типово використовує
  `127.0.0.1:8080`; опублікований образ задає `0.0.0.0:8080`.
- `DW_RUST_MAINTENANCE_LOOP`: `1` або `true` додає прохід відновлення
  (відновлення tasks і тайм-аути activity) до внутрішньопроцесного циклу
  таймерів і розкладів. Опублікований образ задає `1`, бо не має окремого
  scheduler.
- `DW_RUST_EXPERIMENTAL`: потрібне зі значенням `1` лише для development-збірок
  без версії випуску. Образам випуску воно не потрібне.
- `DW_UPGRADE_BACKUP_FINGERPRINT` і `DW_RUST_UPGRADE_QUEUE_*`: вхідні дані
  одностороннього [переходу бази PHP на нативний Server](%%artifact.serverTakeoverRunbookUrl%%);
  цей перехід кваліфіковано на опублікованому образі 3.0.4 у межах, зазначених
  у runbook.
- `DW_V2_LIMIT_HISTORY_TRANSACTION_ROWS` (застаріла назва
  `WORKFLOW_V2_LIMIT_HISTORY_TRANSACTION_ROWS`): враховується ще до її
  додавання до контракту PHP.

## Як застосовуються зміни {#how-changes-take-effect}

Нативний Server 3.x читає середовище лише під час старту процесу; щоб
застосувати зміну, перезапустіть або замініть процес Server. Решта цього
розділу описує PHP 2.x.

Опублікований образ PHP Server виконує `php artisan config:cache` у своєму
entrypoint. Значення середовища зчитуються під час цього старту й записуються
до кешу конфігурації Laravel. Редагування файлу середовища, зміна оголошення
середовища в оркестраторі або заміна змонтованого конфігураційного файлу не
оновлює запущене розгортання автоматично.

Перезапустіть або замініть кожен процес, якого стосується зміна: репліки HTTP
API, локальні workers черги Laravel та процеси scheduler. Довготривалі SDK
workers перезапускайте окремо, коли змінюєте їхню власну конфігурацію клієнта
чи worker. Успішний перезапуск API не оновлює worker черги або scheduler, що
продовжує працювати. Ролі зі спільною базою даних і кешем мають отримати
узгоджену конфігурацію.

Під час поступового оновлення кожен вузол застосовує власні завантажені
ліміти. Спільні лічильники admission не узгоджують різні налаштування вузлів,
тому одна репліка API може прийняти запит, а інша відхилити його. Якщо зміна
ліміту має застосуватися узгоджено:

1. Призупиніть нові запити клієнтів і вилучіть відповідні репліки API з ingress.
   Дочекайтеся завершення поточних запитів. Коректно зупиніть відповідні ролі
   черги та scheduler у межах їхніх бюджетів завершення.
2. Застосуйте однакову конфігурацію до всіх відповідних ролей і перезапустіть
   або замініть їх. Entrypoint кожного контейнера має перебудувати кеш
   конфігурації.
3. Перевірте журнали старту на помилки конфігурації, readiness і змінений
   ліміт перед відновленням ingress та нових запитів клієнтів. Дивіться
   [посібник із розгортання та readiness](/docs/deployment#readiness-contract).

Операторські налаштування, що зберігаються в базі даних, мають інший життєвий
цикл. Успішні зміни нижче доступні наступним операціям без перезапуску Server:

| Налаштування | Зміна без перезапуску | Область дії та обмеження |
| --- | --- | --- |
| Опис namespace і retention | [`PUT /api/namespaces/{namespace}`](/docs/polyglot/server-api-reference#namespace-and-storage) або [`dw namespace:update`](/docs/polyglot/cli-reference#namespace-and-search-attribute-commands) | Політика retention керує наступними проходами очищення. Її зміна не відновлює вже видалені дані. Дивіться [retention Server](/docs/polyglot/server#retention). |
| Політика external payload storage namespace | [`PUT /api/namespaces/{namespace}/external-storage`](/docs/features/external-payload-storage#configuring-a-namespace) | Змінює збережену політику namespace. Облікові дані провайдера, налаштовані filesystem disks та інші параметри процесу все одно потребують перезапуску за процедурою вище. Збережіть доступ до об'єктів, на які посилаються наявні runs. |
| Визначення search attributes namespace | [`POST` / `DELETE /api/search-attributes`](/docs/polyglot/server-api-reference#schedules-and-search-attributes) | Оновлює реєстрацію для наступних запитів. Не переписує історію workflow і не замінює ліміти розміру та кількості із середовища. |

Стандартні значення та обмеження `DW_*` у цьому довіднику залишаються
конфігурацією процесу, якщо документована операція control plane явно не
змінює збережений стан. Server не опитує конфігураційні файли на зміни.

## Застосування контракту {#how-the-contract-is-enforced}

Канонічний контракт зберігається в `config/dw-contract.php`
репозиторію Server. Нативний Server 3.x виконує еквівалентний аудит під
час старту, як описано в розділі [Нативний Server 3.x](#native-server-3x).
У PHP 2.x під час старту контейнера `php artisan env:audit`
попереджає про невідомі змінні `DW_*` та застарілі назви.
Установіть `DW_ENV_AUDIT_STRICT=1`, щоб entrypoint завершувався
з помилкою замість старту з попередженнями.

```bash
DW_ENV_AUDIT_STRICT=1
DW_AUTH_DRIVER=token
DW_ADMIN_TOKEN="${DW_ADMIN_TOKEN}"
DW_OPERATOR_TOKEN="${DW_OPERATOR_TOKEN}"
DW_WORKER_TOKEN="${DW_WORKER_TOKEN}"
```

Застарілі назви працюють лише як fallback. У кожному новому розгортанні
віддавайте перевагу `DW_*`. Попередження про стару назву означає
незавершену міграцію, навіть якщо Server ще використовує її значення.

## Ідентичність та режим Server {#server-identity-and-mode}

| Змінна | Стандартне значення | Призначення | Застарілий alias |
| --- | --- | --- | --- |
| `DW_MODE` | `service` | Режим Server: `service` передає polling зовнішнім workers, `embedded` виконує dispatch локально через чергу Laravel. | `WORKFLOW_SERVER_MODE` |
| `DW_SERVER_ID` | `gethostname()` | Унікальний ідентифікатор екземпляра Server для володіння leases та реєстрації workers. | `WORKFLOW_SERVER_ID` |
| `DW_SERVER_TOPOLOGY_SHAPE` | `standalone_server` | Форма топології для discovery кластера, наприклад `embedded`, `standalone_server` чи `split_control_execution`. | `WORKFLOW_SERVER_TOPOLOGY_SHAPE` |
| `DW_SERVER_PROCESS_CLASS` | `server_http_node` | Клас процесу цього вузла у вибраній формі топології, наприклад `server_http_node`, `worker_node` чи `scheduler_node`. | `WORKFLOW_SERVER_PROCESS_CLASS` |
| `DW_SERVER_KEY` | генерується під час старту контейнера | Необов'язковий внутрішній runtime key Server. Docker-образи автоматично генерують його, якщо він відсутній. | - |
| `DW_DEFAULT_NAMESPACE` | `default` | Namespace для запитів без заголовка namespace. | `WORKFLOW_SERVER_DEFAULT_NAMESPACE` |
| `DW_TASK_DISPATCH_MODE` | не задано | Перевизначає `workflows.v2.task_dispatch_mode`. У service mode Server стандартно використовує `poll`, якщо не вказано інше. | `WORKFLOW_V2_TASK_DISPATCH_MODE` |
| `DW_WORKFLOW_MEMO_MIGRATION_RECOVERY` | не задано | Одноразове підтвердження відновлення MySQL для незаписаного переписування memo: `raw-json` або `envelope-prefix:<last-converted-id>`. | `WORKFLOW_SERVER_WORKFLOW_MEMO_MIGRATION_RECOVERY` |
| `DW_EXTERNAL_EXECUTOR_CONFIG_PATH` | не задано | Шлях до JSON-файлу `durable-workflow.external-executor.config` зі зіставленнями обробників зовнішнього виконавця. | `WORKFLOW_SERVER_EXTERNAL_EXECUTOR_CONFIG_PATH` |
| `DW_EXTERNAL_EXECUTOR_CONFIG_OVERLAY` | не задано | Назва overlay конфігурації зовнішнього виконавця для застосування перед перевіркою та discovery Server. | `WORKFLOW_SERVER_EXTERNAL_EXECUTOR_CONFIG_OVERLAY` |

## Автентифікація {#authentication}

| Змінна | Стандартне значення | Призначення | Застарілий alias |
| --- | --- | --- | --- |
| `DW_AUTH_PROVIDER` | не задано | PHP 2.x: клас, який може створити Laravel і який реалізує `App\Contracts\AuthProvider`. Нативний Server 3.x відмовляється стартувати, якщо його задано. | `WORKFLOW_SERVER_AUTH_PROVIDER` |
| `DW_AUTH_DRIVER` | `token` | Driver автентифікації PHP 2.x: `none`, `token` або `signature`. Нативний Server 3.x приймає лише `token`. | `WORKFLOW_SERVER_AUTH_DRIVER` |
| `DW_AUTH_TOKEN` | не задано | PHP 2.x: один спільний bearer token, якщо токени окремих ролей не налаштовані. Нативний Server 3.x: обов'язковий і приймається для кожної ролі. | `WORKFLOW_SERVER_AUTH_TOKEN` |
| `DW_SIGNATURE_KEY` | не задано | PHP 2.x: спільний ключ HMAC-підпису, якщо ключі окремих ролей не налаштовані. Нативний Server 3.x ігнорує його, бо не має автентифікації підписами. | `WORKFLOW_SERVER_SIGNATURE_KEY` |
| `DW_WORKER_TOKEN` | не задано | Bearer token для реєстрації worker, polling, heartbeats і завершення tasks. | `WORKFLOW_SERVER_WORKER_TOKEN` |
| `DW_OPERATOR_TOKEN` | не задано | Bearer token для читання та операторських дій площини керування. | `WORKFLOW_SERVER_OPERATOR_TOKEN` |
| `DW_ADMIN_TOKEN` | не задано | Bearer token для змін namespaces, retention та інших адміністративних дій. | `WORKFLOW_SERVER_ADMIN_TOKEN` |
| `DW_PRINCIPAL_TOKENS` | не задано | PHP 2.x: JSON map токенів іменованих principals. Кожен запис надає `token`, `subject`, `roles`, необов'язкові `tenant`, `label` і несекретні `claims`. Нативний Server 3.x відмовляється стартувати, якщо його задано. | `WORKFLOW_SERVER_PRINCIPAL_TOKENS` |
| `DW_WORKER_SIGNATURE_KEY` | не задано | Ключ HMAC для запитів ролі worker за автентифікації підписами. | `WORKFLOW_SERVER_WORKER_SIGNATURE_KEY` |
| `DW_OPERATOR_SIGNATURE_KEY` | не задано | Ключ HMAC для запитів ролі operator за автентифікації підписами. | `WORKFLOW_SERVER_OPERATOR_SIGNATURE_KEY` |
| `DW_ADMIN_SIGNATURE_KEY` | не задано | Ключ HMAC для запитів ролі admin за автентифікації підписами. | `WORKFLOW_SERVER_ADMIN_SIGNATURE_KEY` |
| `DW_AUTH_BACKWARD_COMPATIBLE` | `true` | PHP 2.x: використання спільних `DW_AUTH_TOKEN` / `DW_SIGNATURE_KEY` як fallback, якщо немає облікових даних окремої ролі. Нативний Server 3.x завжди приймає спільний токен і відмовляється стартувати, якщо тут `false`. | `WORKFLOW_SERVER_AUTH_BACKWARD_COMPATIBLE` |

Для production використовуйте облікові дані з окремими ролями. У PHP 2.x
`DW_AUTH_DRIVER=none` призначений лише для локальних smoke-перевірок:
з ним кожен endpoint доступний без bearer token чи підпису; нативні образи
випуску його відхиляють.

Використовуйте `DW_PRINCIPAL_TOKENS`, коли журнал аудиту потребує сталих
ідентифікаторів виконавців замість назв ролей. Server визначає записаного
principal за відповідним записом токена. Клієнти не можуть змінити
його через payload чи заголовки запиту.

## Атрибуція команд {#command-attribution}

Ці налаштування дають довіреному gateway змогу зберегти metadata
ініціатора в durable-історії команд. Залишайте
`DW_TRUST_FORWARDED_ATTRIBUTION_HEADERS=false`, якщо Server не стоїть
за gateway, що прибирає недовірені заголовки від клієнтів.

| Змінна | Стандартне значення | Призначення | Застарілий alias |
| --- | --- | --- | --- |
| `DW_TRUST_FORWARDED_ATTRIBUTION_HEADERS` | `false` | Запис forwarded-заголовків ініціатора та автентифікації до історії команд workflow. | `WORKFLOW_SERVER_TRUST_FORWARDED_ATTRIBUTION_HEADERS` |
| `DW_CALLER_TYPE_HEADER` | `X-Workflow-Caller-Type` | Заголовок з переданим типом ініціатора. | `WORKFLOW_SERVER_CALLER_TYPE_HEADER` |
| `DW_CALLER_LABEL_HEADER` | `X-Workflow-Caller-Label` | Заголовок з переданою міткою ініціатора. | `WORKFLOW_SERVER_CALLER_LABEL_HEADER` |
| `DW_AUTH_STATUS_HEADER` | `X-Workflow-Auth-Status` | Заголовок з переданим станом автентифікації. | `WORKFLOW_SERVER_AUTH_STATUS_HEADER` |
| `DW_AUTH_METHOD_HEADER` | `X-Workflow-Auth-Method` | Заголовок з переданим методом автентифікації. | `WORKFLOW_SERVER_AUTH_METHOD_HEADER` |

## Polling worker та приймання роботи {#worker-polling-and-admission}

Ці значення керують часом long poll, координацією wake,
серверними обмеженнями приймання роботи та обмеженими budgets dispatch tasks.

| Змінна | Стандартне значення | Призначення | Застарілий alias |
| --- | --- | --- | --- |
| `DW_WORKER_POLL_TIMEOUT` | `30` | Типове очікування, якщо запит опитування не містить `timeout_seconds`. SDK перевизначає його; це не максимальне очікування. Дивіться [наскрізні бюджети таймаутів](../deployment.md#worker-long-poll-timeout-budgets). | `WORKFLOW_SERVER_WORKER_POLL_TIMEOUT` |
| `DW_WORKER_POLL_INTERVAL_MS` | `1000` | Мілісекунди між внутрішніми скануваннями під час відкритого poll. | `WORKFLOW_SERVER_WORKER_POLL_INTERVAL_MS` |
| `DW_WORKER_POLL_SIGNAL_CHECK_INTERVAL_MS` | `100` | Мілісекунди між перевірками wake signals під час відкритого poll. | `WORKFLOW_SERVER_WORKER_POLL_SIGNAL_CHECK_INTERVAL_MS` |
| `DW_POLLING_CACHE_PATH` | `storage/framework/cache/server-polling/<APP_ENV>` | Каталог стану координації polling worker за файлового polling cache. | `WORKFLOW_SERVER_POLLING_CACHE_PATH` |
| `DW_WAKE_SIGNAL_TTL_SECONDS` | `max(DW_WORKER_POLL_TIMEOUT + 5, 60)` | TTL wake signals кожної черги, які достроково завершують очікування poll. | `WORKFLOW_SERVER_WAKE_SIGNAL_TTL_SECONDS` |
| `DW_WORKER_LONG_POLL_MAX_CONCURRENT` | не задано; визначається для `PHP_CLI_SERVER_WORKERS` | Необов'язкове обмеження одночасних відкритих long-poll очікувань workflow/activity workers на цьому вузлі Server. Polls query tasks мають окремий budget. Нативний Server 3.x ігнорує його; див. [Нативний Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKER_LONG_POLL_MAX_CONCURRENT` |
| `DW_WORKER_LONG_POLL_RESERVED_HTTP_WORKERS` | `2` | PHP CLI server workers, зарезервовані для health і площини керування під час визначення обмеження long-poll очікування workflow/activity. Нативний Server 3.x ігнорує його; див. [Нативний Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKER_LONG_POLL_RESERVED_HTTP_WORKERS` |
| `DW_MAX_TASKS_PER_POLL` | `1` | Максимальна кількість tasks у відповіді на poll worker. | `WORKFLOW_SERVER_MAX_TASKS_PER_POLL` |
| `DW_SQLITE_CLAIM_LOCK_TTL_SECONDS` | `10` | Секунди утримання кешованої claim-блокади polling worker у SQLite quickstart backend до спливу lock. | `WORKFLOW_SERVER_SQLITE_CLAIM_LOCK_TTL_SECONDS` |
| `DW_SQLITE_CLAIM_LOCK_WAIT_SECONDS` | `5` | Секунди очікування SQLite claims polling worker на кешовану claim-блокаду до повернення тиску блокувань backend. | `WORKFLOW_SERVER_SQLITE_CLAIM_LOCK_WAIT_SECONDS` |
| `DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` | не задано | Обмеження активних leases workflow tasks на namespace/task queue. Нативний Server 3.x відмовляється стартувати, якщо значення є додатним числом; див. [Нативний Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` |
| `DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` | не задано | Обмеження активних leases workflow tasks у всіх чергах namespace. Нативний Server 3.x відмовляється стартувати, якщо значення є додатним числом; див. [Нативний Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` |
| `DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE` | не задано | Обмеження dispatch workflow tasks за хвилину на namespace/task queue. Нативний Server 3.x відмовляється стартувати, якщо значення є додатним числом; див. [Нативний Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE` |
| `DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` | не задано | Обмеження dispatch workflow tasks за хвилину в namespace. Нативний Server 3.x відмовляється стартувати, якщо значення є додатним числом; див. [Нативний Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` |
| `DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` | не задано | Обмеження активних leases activity tasks на namespace/task queue. Нативний Server 3.x відмовляється стартувати, якщо значення є додатним числом; див. [Нативний Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` |
| `DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` | не задано | Обмеження активних leases activity tasks у всіх чергах namespace. Нативний Server 3.x відмовляється стартувати, якщо значення є додатним числом; див. [Нативний Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` |
| `DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE` | не задано | Обмеження dispatch activity tasks за хвилину на namespace/task queue. Нативний Server 3.x відмовляється стартувати, якщо значення є додатним числом; див. [Нативний Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE` |
| `DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` | не задано | Обмеження dispatch activity tasks за хвилину в namespace. Нативний Server 3.x відмовляється стартувати, якщо значення є додатним числом; див. [Нативний Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` |
| `DW_TASK_QUEUE_ADMISSION_OVERRIDES` | `{}` | JSON-перевизначення за ключами `namespace:task_queue`, `namespace:*`, `task_queue` чи `*` для активних leases, швидкості dispatch, обмежень namespace і budget-груп downstream. Нативний Server 3.x відмовляється стартувати, якщо значення задано й воно не дорівнює `{}`; див. [Нативний Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_TASK_QUEUE_ADMISSION_OVERRIDES` |
| `DW_DUE_TIMER_RECOVERY_SCAN_LIMIT` | `5` | Максимальна кількість належних до виконання timer tasks service mode, відновлених за прохід polling worker. | `WORKFLOW_SERVER_DUE_TIMER_RECOVERY_SCAN_LIMIT` |
| `DW_EXPIRED_WORKFLOW_TASK_RECOVERY_SCAN_LIMIT` | `5` | Максимальна кількість спливлих workflow tasks, відновлених за прохід. | `WORKFLOW_SERVER_EXPIRED_WORKFLOW_TASK_RECOVERY_SCAN_LIMIT` |
| `DW_EXPIRED_WORKFLOW_TASK_RECOVERY_TTL_SECONDS` | `5` | Мінімальні секунди між проходами відновлення спливлих tasks на чергу. | `WORKFLOW_SERVER_EXPIRED_WORKFLOW_TASK_RECOVERY_TTL_SECONDS` |

Sticky execution не має окремих змінних середовища образу Server.
Життєвий цикл sticky cache, поля worker-протоколу, режими replay
та діагностику описано в
[sticky execution](/docs/features/sticky-execution).

Приклад перевизначення обмежень приймання роботи:

```json
{
  "production:billing": {
    "workflow_tasks": {
      "max_active_leases": 50,
      "max_dispatches_per_minute": 600
    },
    "activity_tasks": {
      "max_active_leases": 200
    }
  },
  "production:*": {
    "workflow_tasks": {
      "max_active_leases_per_namespace": 500
    }
  }
}
```

## Worker-протокол та транспорт query {#worker-protocol-and-query-transport}

| Змінна | Стандартне значення | Призначення | Застарілий alias |
| --- | --- | --- | --- |
| `DW_WORKER_PROTOCOL_VERSION` | `WorkerProtocolVersion::VERSION` | Версія worker-протоколу, оголошена у відповідях worker plane. | `WORKFLOW_SERVER_WORKER_PROTOCOL_VERSION` |
| `DW_HISTORY_PAGE_SIZE_DEFAULT` | `WorkerProtocolVersion::DEFAULT_HISTORY_PAGE_SIZE` | Стандартний розмір сторінки читання історії worker. | `WORKFLOW_SERVER_HISTORY_PAGE_SIZE_DEFAULT` |
| `DW_HISTORY_PAGE_SIZE_MAX` | `WorkerProtocolVersion::MAX_HISTORY_PAGE_SIZE` | Максимальний розмір сторінки читання історії worker. | `WORKFLOW_SERVER_HISTORY_PAGE_SIZE_MAX` |
| `DW_UPDATE_VALIDATION_TIMEOUT` | `10` | Секунди очікування площиною керування синхронного результату validator update до acceptance. | `WORKFLOW_SERVER_UPDATE_VALIDATION_TIMEOUT` |
| `DW_UPDATE_VALIDATION_LEASE_TIMEOUT` | `5` | Секунди володіння lease task перевірки update, після яких інший worker з підтримкою validator може повторити спробу. | `WORKFLOW_SERVER_UPDATE_VALIDATION_LEASE_TIMEOUT` |
| `DW_QUERY_TASK_TIMEOUT` | `DW_WORKER_POLL_TIMEOUT` | Секунди очікування площиною керування відповіді worker на query task. | `WORKFLOW_SERVER_QUERY_TASK_TIMEOUT` |
| `DW_QUERY_TASK_LEASE_TIMEOUT` | `DW_WORKFLOW_TASK_TIMEOUT` | Timeout lease тимчасових query tasks, переданих workers. | `WORKFLOW_SERVER_QUERY_TASK_LEASE_TIMEOUT` |
| `DW_QUERY_TASK_TTL_SECONDS` | `180` | Час зберігання Server рядків результатів query tasks перед видаленням. | `WORKFLOW_SERVER_QUERY_TASK_TTL_SECONDS` |
| `DW_QUERY_TASK_MAX_PENDING_PER_QUEUE` | `1024` | Максимальна кількість незавершених query tasks у cache на namespace/task queue перед відхиленням нових queries. Нативний Server 3.x відхиляє будь-яке значення, крім `1024`, і натомість застосовує власну фіксовану межу query tasks; див. [Нативний Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_QUERY_TASK_MAX_PENDING_PER_QUEUE` |
| `DW_QUERY_TASK_POLL_TIMEOUT` | `5` | Максимальні секунди очікування кожного idle poll query task worker перед повторною перевіркою тиску workflow tasks та доступності площини керування. | `WORKFLOW_SERVER_QUERY_TASK_POLL_TIMEOUT` |
| `DW_QUERY_TASK_POLL_MAX_CONCURRENT` | не задано; визначається для `PHP_CLI_SERVER_WORKERS` | Необов'язкове обмеження одночасних idle long-poll очікувань query task workers на цьому вузлі Server. Незавершені query tasks можна отримати негайно перед idle-очікуванням poll. Нативний Server 3.x ігнорує його; див. [Нативний Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_QUERY_TASK_POLL_MAX_CONCURRENT` |
| `DW_WORKFLOW_TASK_TIMEOUT` | `60` | Стандартний timeout lease workflow task у секундах. | `WORKFLOW_TASK_TIMEOUT` |
| `DW_ACTIVITY_TASK_TIMEOUT` | `300` | Стандартний timeout lease activity task у секундах. | `ACTIVITY_TASK_TIMEOUT` |
| `DW_WORKER_STALE_AFTER_SECONDS` | `max(DW_WORKER_HEARTBEAT_INTERVAL_SECONDS * 3, 30)` | Секунди після heartbeat worker, коли реєстрація worker стає застарілою. | `WORKFLOW_SERVER_WORKER_STALE_AFTER_SECONDS` |
| `DW_WORKER_HEARTBEAT_INTERVAL_SECONDS` | `10` | Інтервал у секундах, оголошений SDK у підтвердженнях реєстрації та heartbeat worker. | `WORKFLOW_SERVER_WORKER_HEARTBEAT_INTERVAL_SECONDS` |

## Обмеження, retention та метрики {#limits-retention-and-metrics}

Ці налаштування обмежують запити та зростання даних. Якщо застосунок
регулярно наближається до цих значень, віддавайте перевагу меншим payload,
зовнішньому сховищу payload або continue-as-new замість звичного
підвищення обмежень.

| Змінна | Стандартне значення | Призначення | Застарілий alias |
| --- | --- | --- | --- |
| `DW_METRICS_WORKFLOW_TASK_FAILURE_TYPE_LIMIT` | `20` | Максимальна кількість series `workflow_type` у `dw_workflow_task_consecutive_failures`. Решта типів підсумовується. | `WORKFLOW_SERVER_METRICS_WORKFLOW_TASK_FAILURE_TYPE_LIMIT` |
| `DW_METRICS_PROMETHEUS_WORKFLOW_SERIES_LIMIT` | `100` | Максимальна кількість workflow series у `/api/system/prometheus-metrics` перед підсумовуванням решти. | `WORKFLOW_SERVER_METRICS_PROMETHEUS_WORKFLOW_SERIES_LIMIT` |
| `DW_METRICS_PROMETHEUS_ACTIVITY_SERIES_LIMIT` | `100` | Максимальна кількість activity series у `/api/system/prometheus-metrics` перед підсумовуванням решти. | `WORKFLOW_SERVER_METRICS_PROMETHEUS_ACTIVITY_SERIES_LIMIT` |
| `DW_METRICS_PROMETHEUS_TASK_QUEUE_SERIES_LIMIT` | `100` | Максимальна кількість runtime series task queue у `/api/system/prometheus-metrics` перед підсумовуванням решти. | `WORKFLOW_SERVER_METRICS_PROMETHEUS_TASK_QUEUE_SERIES_LIMIT` |
| `DW_MAX_HISTORY_EVENTS` | `50000` | Не має жодного ефекту. Жоден випуск Server її не читає, і історія run не обмежується. Обмежуйте довгу історію за допомогою continue-as-new. | `WORKFLOW_MAX_HISTORY_EVENTS` |
| `DW_HISTORY_RETENTION_DAYS` | `30` | Стандартна кількість днів зберігання історії закритих runs, якщо namespace не перевизначає її. | `WORKFLOW_HISTORY_RETENTION_DAYS` |
| `DW_MAX_PAYLOAD_BYTES` | `2097152` | Максимальна кількість серіалізованих bytes одного payload. | `WORKFLOW_MAX_PAYLOAD_BYTES` |
| `DW_EXTERNAL_PAYLOAD_MAX_BYTES` | `67108864` | Максимальний закодований розмір у bytes (64 MiB), який приймає автентифікований транспорт завантаження та отримання зовнішнього payload. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_MAX_BYTES` |
| `DW_EXTERNAL_PAYLOAD_REQUEST_TIMEOUT` | `30` | Оголошений Server budget timeout запитів завантаження та отримання для клієнтів у секундах. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_REQUEST_TIMEOUT` |
| `DW_EXTERNAL_PAYLOAD_UPLOAD_EXPIRY` | `3600` | Секунди, протягом яких завантажений зовнішній payload може залишатися незатребуваним до спливу його непрозорого посилання. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_UPLOAD_EXPIRY` |
| `DW_MAX_MEMO_BYTES` | `262144` | Максимальна кількість серіалізованих bytes memo workflow. | `WORKFLOW_MAX_MEMO_BYTES` |
| `DW_MAX_SEARCH_ATTRIBUTES` | `100` | Максимальна кількість search attributes одного workflow. | `WORKFLOW_MAX_SEARCH_ATTRIBUTES` |
| `DW_MAX_SEARCH_ATTRIBUTE_KEY_LENGTH` | `128` | Максимальна довжина ключа search attribute у bytes. | `WORKFLOW_MAX_SEARCH_ATTRIBUTE_KEY_LENGTH` |
| `DW_MAX_SEARCH_ATTRIBUTE_VALUE_BYTES` | `2048` | Максимальний розмір одного рядкового значення search attribute у bytes. | `WORKFLOW_MAX_SEARCH_ATTRIBUTE_VALUE_BYTES` |
| `DW_MAX_OPERATION_NAME_LENGTH` | `256` | Максимальна довжина назви signal, update чи query у bytes. | `WORKFLOW_MAX_OPERATION_NAME_LENGTH` |
| `DW_MAX_PENDING_ACTIVITIES` | `2000` | Максимальна кількість незавершених activities на run workflow перед відхиленням пакета команд. | `WORKFLOW_MAX_PENDING_ACTIVITIES` |
| `DW_MAX_PENDING_CHILDREN` | `2000` | Максимальна кількість незавершених дочірніх workflows на run перед відхиленням пакета команд. | `WORKFLOW_MAX_PENDING_CHILDREN` |
| `DW_MAX_NEXUS_OPERATIONS_PER_CALLER` | `200` | Максимальна кількість Nexus operations на ініціатора в історії операцій перед обов'язковою пагінацією клієнта. | `WORKFLOW_MAX_NEXUS_OPERATIONS_PER_CALLER` |
| `DW_COMPRESSION_ENABLED` | `true` | Увімкнення стиснення JSON-відповіді після перевищення мінімального порогу розміру. | `WORKFLOW_SERVER_COMPRESSION_ENABLED` |

## Обмеження на межі запиту Server {#server-request-boundary-limits}

Під час використання окремого Server інший набір меж застосовується на межі
HTTP-запиту до того, як завдання workflow, signal, update чи query потрапляє
до площини керування. Ці межі одразу повертають `422 validation_failed` або
`413 payload_too_large` для перевірки всього тіла. Клієнти дізнаються причину
відхилення без запису сервером будь-якого рядка до бази даних.

| Обмеження | Типове значення | Ключ налаштування | Що обмежує |
|---|---|---|---|
| Розмір тіла | 2 MiB | `server.limits.max_payload_bytes` | Загальна кількість байтів тіла HTTP-запиту, крім завершення завдання workflow у нативному Server 3.6.0 або новішому (наступний рядок) |
| Розмір завершення завдання workflow | 32 MiB (16 × розмір тіла) | похідне від `server.limits.max_payload_bytes` | Нативний Server 3.6.0 або новіший: запит, що завершує завдання workflow з командами. Аргументи кожної команди й далі мають вкладатися в ліміт на один payload |
| Розмір memo | 256 KiB | `server.limits.max_memo_bytes` | Серіалізоване memo в `POST /workflows` та `POST /schedules` |
| Кількість атрибутів пошуку | 100 | `server.limits.max_search_attributes` | Зареєстровані власні атрибути пошуку на простір імен |
| Довжина ключа атрибута пошуку | 128 байтів | `server.limits.max_search_attribute_key_length` | Довжина одного ключа атрибута пошуку під час запуску |
| Розмір значення атрибута пошуку | 2 KiB | `server.limits.max_search_attribute_value_bytes` | Кожне рядкове значення та кожен елемент масиву під час запуску |
| Назва signal / update / query | 256 байтів | `server.limits.max_operation_name_length` | Сегмент шляху URL для назв signal/update/query |
| Довжина `workflow_id` | 128 символів | валідатор контролера | ID workflow в `POST /workflows` |
| `workflow_type` / `task_queue` / `business_key` | 255 символів | валідатор контролера | Рядкові поля в `POST /workflows` |
| `request_id` | 255 символів | валідатор контролера | Токен усунення дублікатів для signal/update/cancel/terminate |
| `reason` | 1,000 символів | валідатор контролера | Текст причини для cancel/terminate/archive |

Використовуйте задокументовані параметри `DW_*` для налаштовуваних обмежень
PHP Server 2.x. Межі перевірок контролера фіксовані. Native Server 3.x підтримує
параметри зі своїх [приміток щодо реалізації](#native-server-3x). У native 3.8.0
`DW_MAX_PAYLOAD_BYTES=0` задає нульову межу байтів для звичайних запитів і
завершень workflow task, тому непорожні тіла відхиляються. Межа назв операцій
фіксована й становить 256 байтів.

Нативний runtime 3.9.1 досі перевіряє `request_id` сигналів на межу 255 байтів UTF-8. Багатобайтовий ключ із 255 символів може повернути `422 invalid_request_id`. [Кваліфікація встановленої CLI](https://github.com/durable-workflow/server/issues/934#issuecomment-6853943056) відстежує це опубліковане обмеження; вона не доводить повної відповідності ключів спільному #216.

Поточні значення публікуються під `limits` у відповіді `GET /api/cluster/info`,
тому клієнти можуть дізнатися їх під час виконання:

```json
{
  "limits": {
    "max_payload_bytes": 2097152,
    "max_memo_bytes": 262144,
    "max_search_attributes": 100,
    "max_search_attribute_key_length": 128,
    "max_search_attribute_value_bytes": 2048,
    "max_operation_name_length": 256,
    "max_pending_activities": 2000,
    "max_pending_children": 2000
  }
}
```

Помилки валідації повертаються в стандартній оболонці помилок площини керування
з `reason: "validation_failed"` та мапою `validation_errors`, ключами якої є
проблемні поля (`signal_name`, `update_name`, `query_name`, `search_attributes`,
`memo` тощо). Відхилення через розмір даних використовують
`reason: "payload_too_large"` та код стану `413`.

### Імена та ID команд нативних воркерів {#native-worker-command-name-limits}

Таблиця показує межі зберігання в символах. Описані нижче перевірки байтів у
runtime також діють. Рядок ID workflow стосується окремого обмеження API запуску;
поля викликів дочірніх workflow мають суворіші межі, ніж інші команди.

| Поле | Максимум символів | Область застосування |
|---|---|---|
| `workflow_id` | 128 | `POST /api/workflows` |
| `activity_type` | 191 | Команди активностей |
| `signal_name` | 191 | `open_signal_wait` |
| `condition_key` / `condition_definition_fingerprint` | 191 | `open_condition_wait` |
| `connection` | 255 | Команди воркерів |
| `queue` | 255 | Команди воркерів, крім `start_child_workflow` |
| `workflow_type` | 255 | `continue_as_new` |
| `workflow_type` / `queue` | 191 | `start_child_workflow` |

Нативні runtime 3.8.0 та 3.9.1 також зберігають перевірки байтів UTF-8.
`activity_type`, `open_signal_wait.signal_name`, явно задана
`schedule_activity.queue` та `continue_as_new.workflow_type` / `queue`
мають межу парсера у 255 байтів (`422 invalid_request`). Поля `workflow_type`
і `queue` дочірнього workflow додатково мають перевірку 191 байта, що може
повернути `422 unsupported_child_options`. Наприклад, тип активності зі
128 повторень `é` займає 256 байтів і відхиляється, хоча має лише 128 символів.
Нові перевірки символів не скасовують цих перевірок байтів.

Нативний Server 3.9.1 містить [опубліковане виправлення](https://github.com/durable-workflow/server/releases/tag/3.9.1#other-changes): відмови `422 validation_failed` для конкретних полів, наприклад `commands.0.activity_type`, перед записом. Нативний runtime 3.8.0 не завжди перевіряв ці межі символів; SQLite міг непомітно зберігати задовгі імена, тоді як інші бекенди повертали помилки бази даних. Перед оновленням перевірте типи активностей та очікування сигналів з іменами понад 191 символ: нові команди з такими іменами тепер відхиляються. Перевірка решти ідентифікаторів триває в [Server #607](https://github.com/durable-workflow/server/issues/607). Зазначена вище HTTP-межа імен операцій у 256 байтів є окремою.

### Розмір завершення завдання workflow {#workflow-task-completion-size}

У нативному Server 3.6.0 і новіших запит, що завершує завдання workflow з командами (`POST /api/worker/workflow-tasks/{id}/complete` і `POST /api/worker/activity-tasks/{id}/continuation/complete`), може мати розмір до 16 × `max_payload_bytes`: 32 MiB за типового значення 2 MiB. Ліміт іде за `DW_MAX_PAYLOAD_BYTES` і не має власного параметра. Аргументи кожної команди всередині завершення й далі мають вкладатися в ліміт на один payload. PHP Server 2.x і попередні нативні випуски обмежують завершення одним лімітом payload, як і будь-який інший запит.

Нативний runtime 3.9.1 публікує фактичний бюджет як `limits.max_workflow_task_completion_bytes` у cluster info. Для обох маршрутів завершення він вимірює все закодоване JSON-тіло запиту разом з оболонками, метаданими й командами. Використовуйте це значення, а не множник, виведений з версії, чи суму декодованих аргументів. Межі окремих значень та звичайних маршрутів не змінюються. Поле не надає додаткових прав на завантаження зовнішніх payload або розміщення посилань.

Планувальники SDK мають дотримуватися позитивної опублікованої межі, навіть якщо вона нижча за звичайну. Відсутнє поле зберігає консервативний запасний варіант; явно некоректне, null, нульове, від’ємне або неціле значення відхиляє планування до завантаження. Звичайні маршрути ігнорують це невикористане поле завершення.

Більше завершення відхиляється з `413 payload_too_large` і `limit_kind: workflow_task_completion_bytes` ще до того, як щось буде записано. Повторне відтворення завдання дає ті самі команди, тож повторне надсилання завершення отримає ту саму відмову. Коли PHP SDK 3.17.0 або новіший отримує цю типізовану відмову, він не надсилає запит завершення повторно: worker один раз завершує запуск помилкою через команду `fail_workflow`, повідомлення якої починається з `Structural limit exceeded: workflow_task_completion_bytes:` і називає обидва розміри, а Server записує помилку з `failure_category = structural_limit`.

Python SDK 2.17 і Rust SDK 4.15 обробляють типізовану відмову. На Server 3.8.0 опублікований контроль Python отримав `httpx.ReadError` до HTTP 413 і залишив workflow в очікуванні. Нативний runtime 3.9.1 виправляє відповідь обмеженим відкиданням решти запиту: щонайбільше 64 MiB за щонайбільше дві секунди перед початковою відмовою та закриттям з’єднання. Завантаження поза будь-якою з цих меж і далі можуть мати транспортні помилки.

Опублікований Python SDK 2.17.1 із кваліфікованим нативним Server 3.9.1 (linux/amd64, SQLite) тепер проходить [контролі реально встановленого Worker](https://github.com/durable-workflow/.github/issues/228#issuecomment-6853834512): fan-out 300 × 10 KB у межах бюджету, одна типізована 413 і один структурний збій без часткових активностей для завеликого завершення, а потім успішне завдання на тому самому Worker. Це кваліфікує саме цю пару Python/Server. PHP потребує власної перевірки встановленого пакета; Rust4.16 кваліфіковано нижче. Спільне #228 залишається відкритим. Перевірка ключів запитів у спільному #216 є окремою.

Щоб завершення вкладалося в ліміт:

- Розділіть великий fan-out на менші пакети в кількох завданнях workflow.
- Перенесіть роботу в дочірні workflow або використайте continue-as-new.
- Використовуйте зовнішнє сховище лише для підтримуваних позицій payload. Аргументи команд продовження активності залишаються inline; дозвіл завантаження для активності чи результату не дозволяє посилань у цих аргументах.

#### Планування команд Rust {#rust-completion-planning}

Rust SDK 4.16 використовує явний позитивний бюджет завершення, оголошений producer. [Опубліковані контролі4.16/native3.9.1](https://github.com/durable-workflow/sdk-rust/pull/258#issuecomment-6854288671) (linux/amd64, SQLite) проходять inline fan-out 300 × 10 KB без зовнішнього сховища, завеликий пакет 60 × 450 KB зі структурним збоєм без часткових активностей і успішне наступне завдання на тому самому Worker. Без явного поля старіші producer зберігають консервативну звичайну межу. Більший бюджет не надає нових прав на завантаження чи розміщення посилань; аргументи команд продовження активності залишаються inline. Ці контролі не кваліфікують повтори з ключами зі спільного #216 або нативне очищення за тайм-аутом.

## Docker bootstrap та походження пакета {#docker-bootstrap-and-provenance}

| Змінна | Стандартне значення | Призначення | Застарілий alias |
| --- | --- | --- | --- |
| `DW_EXPOSE_PACKAGE_PROVENANCE` | `false` | Додавання `package_provenance` до `/api/cluster/info` для запитів admin. | `WORKFLOW_SERVER_EXPOSE_PACKAGE_PROVENANCE` |
| `DW_PACKAGE_PROVENANCE_PATH` | `<base_path>/.package-provenance` | Абсолютний шлях до файлу походження Docker build. | `WORKFLOW_SERVER_PACKAGE_PROVENANCE_PATH` |
| `DW_SERVICE_BOUNDARY_CROSS_NAMESPACE_DEFAULT` | `allow` | Стандартна дія межі service call для викликів між namespaces, якщо немає точнішого правила. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_CROSS_NAMESPACE_DEFAULT` |
| `DW_SERVICE_BOUNDARY_RATE_LIMIT_PER_MINUTE` | не задано | Необов'язкове обмеження швидкості service calls за хвилину. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_RATE_LIMIT_PER_MINUTE` |
| `DW_SERVICE_BOUNDARY_MAX_IN_FLIGHT` | не задано | Необов'язкове обмеження одночасних service calls. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_MAX_IN_FLIGHT` |

## Docker bootstrap {#docker-bootstrap}

| Змінна | Стандартне значення | Призначення | Застарілий alias |
| --- | --- | --- | --- |
| `DW_ENV_AUDIT_STRICT` | `0` | Помилка старту контейнера, якщо `env:audit` виявляє невідомі або застарілі змінні `DW_*`. | - |
| `DW_BOOTSTRAP_RETRIES` | `30` | Кількість спроб bootstrap перед відмовою entrypoint від migrations і створення стандартного namespace. | `WORKFLOW_SERVER_BOOTSTRAP_RETRIES` |
| `DW_BOOTSTRAP_DELAY_SECONDS` | `2` | Секунди між спробами bootstrap. | `WORKFLOW_SERVER_BOOTSTRAP_DELAY_SECONDS` |

## Налаштування пакета workflow {#workflow-package-controls}

Образ Server містить `durable-workflow/workflow`, тому також надає
налаштування пакета `DW_V2_*`. Вони мають відповідати розгортанням
workers, які виконують ті самі workflows.

| Змінна | Стандартне значення | Призначення | Застарілий alias |
| --- | --- | --- | --- |
| `DW_V2_NAMESPACE` | не задано | Обмеження екземплярів workflow певним namespace. | `WORKFLOW_V2_NAMESPACE` |
| `DW_V2_TENANCY_ORGANIZATION` | не задано | Необов'язковий сегмент organization ієрархії tenancy пакета workflow, видимий у readiness, discovery та операторських поверхнях. | `WORKFLOW_V2_TENANCY_ORGANIZATION` |
| `DW_V2_TENANCY_PROJECT` | не задано | Необов'язковий сегмент project ієрархії tenancy пакета workflow, видимий у readiness, discovery та операторських поверхнях. | `WORKFLOW_V2_TENANCY_PROJECT` |
| `DW_V2_TENANCY_ENVIRONMENT` | не задано | Необов'язковий сегмент environment ієрархії tenancy пакета workflow, видимий у readiness, discovery та операторських поверхнях. | `WORKFLOW_V2_TENANCY_ENVIRONMENT` |
| `DW_V2_CURRENT_COMPATIBILITY` | не задано | Маркер сумісності worker, який оголошує цей worker. | `WORKFLOW_V2_CURRENT_COMPATIBILITY` |
| `DW_V2_SUPPORTED_COMPATIBILITIES` | не задано | Маркери сумісності, які приймає worker, розділені комами, або `*`. | `WORKFLOW_V2_SUPPORTED_COMPATIBILITIES` |
| `DW_V2_COMPATIBILITY_NAMESPACE` | не задано | Namespace сумісності для спільних баз workflow з незалежними fleets. | `WORKFLOW_V2_COMPATIBILITY_NAMESPACE` |
| `DW_V2_COMPATIBILITY_HEARTBEAT_TTL` | `30` | Секунди чинності heartbeat сумісності worker. | `WORKFLOW_V2_COMPATIBILITY_HEARTBEAT_TTL` |
| `DW_V2_PIN_TO_RECORDED_FINGERPRINT` | `true` | Віддавати перевагу записаному визначенню workflow; див. нижче межі резервного маршруту для конкретного runtime. | `WORKFLOW_V2_PIN_TO_RECORDED_FINGERPRINT` |
| `DW_V2_CONTINUE_AS_NEW_EVENT_THRESHOLD` | `10000` | Кількість подій історії, за якої пакет рекомендує автору workflow continue-as-new. | `WORKFLOW_V2_CONTINUE_AS_NEW_EVENT_THRESHOLD` |
| `DW_V2_CONTINUE_AS_NEW_SIZE_BYTES_THRESHOLD` | `5242880` | Розмір серіалізованої історії у bytes, за якого пакет рекомендує continue-as-new. | `WORKFLOW_V2_CONTINUE_AS_NEW_SIZE_BYTES_THRESHOLD` |
| `DW_V2_HISTORY_EXPORT_SIGNING_KEY` | не задано | Необов'язковий ключ HMAC для автентифікації архівів експорту історії. | `WORKFLOW_V2_HISTORY_EXPORT_SIGNING_KEY` |
| `DW_V2_HISTORY_EXPORT_SIGNING_KEY_ID` | не задано | Ідентифікатор ключа, записаний поруч із підписаними exports історії. | `WORKFLOW_V2_HISTORY_EXPORT_SIGNING_KEY_ID` |
| `DW_V2_UPDATE_WAIT_COMPLETION_TIMEOUT_SECONDS` | `10` | Секунди очікування Server переходу update до термінальної стадії. | `WORKFLOW_V2_UPDATE_WAIT_COMPLETION_TIMEOUT_SECONDS` |
| `DW_V2_UPDATE_WAIT_POLL_INTERVAL_MS` | `50` | Мілісекунди між polls стадії update. | `WORKFLOW_V2_UPDATE_WAIT_POLL_INTERVAL_MS` |
| `DW_V2_GUARDRAILS_BOOT` | `warn` | Режим структурних обмежень під час старту: `warn`, `fail` або `silent`. | `WORKFLOW_V2_GUARDRAILS_BOOT` |
| `DW_V2_LIMIT_PENDING_ACTIVITIES` | `2000` | Обмеження незавершених activities на рівні пакета. | `WORKFLOW_V2_LIMIT_PENDING_ACTIVITIES` |
| `DW_V2_LIMIT_PENDING_CHILDREN` | `1000` | Обмеження незавершених дочірніх workflows на рівні пакета. | `WORKFLOW_V2_LIMIT_PENDING_CHILDREN` |
| `DW_V2_LIMIT_PENDING_TIMERS` | `2000` | Обмеження незавершених timers на рівні пакета. | `WORKFLOW_V2_LIMIT_PENDING_TIMERS` |
| `DW_V2_LIMIT_PENDING_SIGNALS` | `5000` | Обмеження незавершених signals на рівні пакета. | `WORKFLOW_V2_LIMIT_PENDING_SIGNALS` |
| `DW_V2_LIMIT_PENDING_UPDATES` | `500` | Обмеження незавершених updates на рівні пакета. | `WORKFLOW_V2_LIMIT_PENDING_UPDATES` |
| `DW_V2_LIMIT_COMMAND_BATCH_SIZE` | `1000` | Максимальна кількість команд в одному завершенні workflow task. | `WORKFLOW_V2_LIMIT_COMMAND_BATCH_SIZE` |
| `DW_V2_LIMIT_PAYLOAD_SIZE_BYTES` | `2097152` | Обмеження bytes одного payload на рівні пакета. | `WORKFLOW_V2_LIMIT_PAYLOAD_SIZE_BYTES` |
| `DW_V2_LIMIT_MEMO_SIZE_BYTES` | `262144` | Обмеження bytes memo workflow на рівні пакета. | `WORKFLOW_V2_LIMIT_MEMO_SIZE_BYTES` |
| `DW_V2_LIMIT_SEARCH_ATTRIBUTE_SIZE_BYTES` | `40960` | Обмеження bytes search attributes на рівні пакета. | `WORKFLOW_V2_LIMIT_SEARCH_ATTRIBUTE_SIZE_BYTES` |
| `DW_V2_LIMIT_HISTORY_TRANSACTION_SIZE` | `5000` | Обмеження кількості подій транзакції історії на рівні пакета. | `WORKFLOW_V2_LIMIT_HISTORY_TRANSACTION_SIZE` |
| `DW_V2_LIMIT_WARNING_THRESHOLD_PERCENT` | `80` | Відсоток структурного обмеження, за якого пакет виводить попередження. | `WORKFLOW_V2_LIMIT_WARNING_THRESHOLD_PERCENT` |
| `DW_V2_TASK_DISPATCH_MODE` | `queue` | Режим dispatch tasks на рівні пакета, зазвичай перевизначений `DW_TASK_DISPATCH_MODE` у режимі Server. | - |
| `DW_V2_MATCHING_ROLE_QUEUE_WAKE` | `true` | Чи виконують queue workers внутрішній wake ролі matching на кожній події Looping. Установіть `false`, щоб execution-only вузли не виконували broad-poll wake, коли прохід належить окремому daemon `php artisan workflow:v2:repair-pass --loop`. | `WORKFLOW_V2_MATCHING_ROLE_QUEUE_WAKE` |
| `DW_V2_TASK_REPAIR_REDISPATCH_AFTER_SECONDS` | `3` | Секунди до повторного dispatch осиротілого workflow task через repair. | `WORKFLOW_V2_TASK_REPAIR_REDISPATCH_AFTER_SECONDS` |
| `DW_V2_TASK_REPAIR_LOOP_THROTTLE_SECONDS` | `5` | Мінімальні секунди між проходами repair tasks на чергу. | `WORKFLOW_V2_TASK_REPAIR_LOOP_THROTTLE_SECONDS` |
| `DW_V2_TASK_REPAIR_SCAN_LIMIT` | `25` | Максимальна кількість tasks, розглянутих за прохід repair. | `WORKFLOW_V2_TASK_REPAIR_SCAN_LIMIT` |
| `DW_V2_TASK_REPAIR_FAILURE_BACKOFF_MAX_SECONDS` | `60` | Максимальний backoff помилки repair tasks у секундах. | `WORKFLOW_V2_TASK_REPAIR_FAILURE_BACKOFF_MAX_SECONDS` |
| `DW_V2_MULTI_NODE` | `false` | Оголошення багатовузлового розгортання для перевірки cache backends на координацію між вузлами. | `WORKFLOW_V2_MULTI_NODE` |
| `DW_V2_VALIDATE_CACHE_BACKEND` | `true` | Перевірка cache backend long poll під час старту. | `WORKFLOW_V2_VALIDATE_CACHE_BACKEND` |
| `DW_V2_CACHE_VALIDATION_MODE` | `warn` | Режим помилки перевірки cache backend: `fail`, `warn` або `silent`. | `WORKFLOW_V2_CACHE_VALIDATION_MODE` |
| `DW_V2_FLEET_VALIDATION_MODE` | `warn` | Режим перевірки сумісності fleet: `warn` записує лог, `fail` блокує dispatch і відхиляє роботу за відсутності сумісного worker. | `WORKFLOW_V2_FLEET_VALIDATION_MODE` |
| `DW_SERIALIZER` | `avro` | Діагностичний параметр codec payload. Остаточний v2 використовує Avro для payload нових runs. | `WORKFLOW_SERIALIZER` |

**Опублікована перевага fingerprint.** Server 2.9.9 робить перевагу fingerprint дієвою для сервісних worker. Коли прив’язку ввімкнено, змінене визначення може бути резервним лише за відсутності придатного worker із записаним визначенням і якщо заміна оголошує `workflow_entry_arguments_validation`. Коли прив’язку вимкнено, прибирається перевага вихідного коду; прив’язки build, ізоляція namespace/queue/type, ідентичність реєстрації та суворий replay залишаються. Відповідний захист входу доступний починаючи із SDK PHP 2.5.4, Python 2.6.2 і Rust 3.5.6. Це мінімальні версії для цих можливостей; установлюйте поточні стабільні випуски з виправленнями безпеки. Не припускайте такої поведінки на старішому runtime лише через наявність однакового ключа конфігурації. Див. [маршрутизацію визначень](./worker-compatibility-routing.md#definition-fingerprint-evolution).

Використовуйте `DW_V2_GUARDRAILS_BOOT` у CI та deployment manifests.
Стару назву `WORKFLOW_V2_GUARDRAILS_BOOT` залишено лише для того,
щоб `env:audit` повідомляв операторам alpha-версій про перейменування.
Пакет workflow більше не читає її як runtime fallback.

Використовуйте [matching та dispatch tasks](/docs/polyglot/task-matching-dispatch)
під час налаштування `DW_V2_MATCHING_ROLE_QUEUE_WAKE` або окремого daemon
`workflow:v2:repair-pass --loop`. Ці налаштування змінюють місце пошуку
готових tasks, зберігаючи той самий контракт worker-протоколу.

## Додаткові параметри опублікованого PHP Server {#additional-published-php-controls}

Цей довідник охоплює контракт опублікованого **PHP Server 2.11.0**, включно з наведеними нижче параметрами. Перевірте фактично запущений образ: незалежно вибрана версія встановлення може бути старішою. `unset` означає відсутність значення змінної; наслідок залежить від параметра. Типові значення й псевдоніми взято з [опублікованого контракту](https://github.com/durable-workflow/server/blob/36d16273604755f3dd0743cab331cc7c62e51d8e/config/dw-contract.php). Під час збірки документації версійний snapshot контракту перевіряється для кожної мови. Вибраний набір версій встановлення не змінюється.

### Допуск HTTP-запитів namespace {#namespace-request-controls}

| Змінна | Типове значення | Призначення | Застарілий псевдонім |
| --- | --- | --- | --- |
| `DW_NAMESPACE_MAX_REQUESTS_PER_MINUTE` | `unset` | Необов’язкова кількість запитів control plane за хвилину для namespace; без значення межі немає. Нативний Server 3.x відмовляється стартувати, якщо значення непорожнє; див. [Нативний Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_MAX_REQUESTS_PER_MINUTE` |
| `DW_NAMESPACE_MAX_CONCURRENT_REQUESTS` | `unset` | Необов’язкова кількість одночасних запитів control plane для namespace; без значення межі немає. Нативний Server 3.x відмовляється стартувати, якщо значення непорожнє; див. [Нативний Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_MAX_CONCURRENT_REQUESTS` |
| `DW_NAMESPACE_HARD_MAX_REQUESTS_PER_MINUTE` | `unset` | Непереборна верхня межа запитів за хвилину, зокрема для перевизначень namespace. Нативний Server 3.x відмовляється стартувати, якщо значення непорожнє; див. [Нативний Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_HARD_MAX_REQUESTS_PER_MINUTE` |
| `DW_NAMESPACE_HARD_MAX_CONCURRENT_REQUESTS` | `unset` | Непереборна верхня межа одночасних запитів, зокрема для перевизначень namespace. Нативний Server 3.x відмовляється стартувати, якщо значення непорожнє; див. [Нативний Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_HARD_MAX_CONCURRENT_REQUESTS` |
| `DW_NAMESPACE_ADMISSION_OVERRIDES` | `{}` | JSON-об’єкт за namespace із перевизначеннями частоти та одночасності запитів. Нативний Server 3.x відмовляється стартувати, якщо значення задано й воно не дорівнює `{}`; див. [Нативний Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_ADMISSION_OVERRIDES` |

[Допуск запитів namespace](./task-queue-admission.md#namespace-request-admission).

### Квоти сталого стану namespace {#namespace-durable-controls}

| Змінна | Типове значення | Призначення | Застарілий псевдонім |
| --- | --- | --- | --- |
| `DW_NAMESPACE_DURABLE_LIMITS` | `{}` | JSON типових квот сталих рядків namespace. Загальні та pending/open-квоти незалежні; pending tasks — готові рядки черги, активні leases обмежуються окремо. Порожній об’єкт не задає меж. Нативний Server 3.x відмовляється стартувати, якщо значення задано й воно не дорівнює `{}`; див. [Нативний Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_DURABLE_LIMITS` |
| `DW_NAMESPACE_DURABLE_HARD_LIMITS` | `{}` | JSON непереборних верхніх меж сталих рядків, зокрема для перевизначень namespace; порожній об’єкт не додає операторських обмежень. Нативний Server 3.x відмовляється стартувати, якщо значення задано й воно не дорівнює `{}`; див. [Нативний Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_DURABLE_HARD_LIMITS` |
| `DW_NAMESPACE_DURABLE_OVERRIDES` | `{}` | JSON перевизначень квот сталих рядків за namespace; жорсткі межі залишаються чинними. Нативний Server 3.x відмовляється стартувати, якщо значення задано й воно не дорівнює `{}`; див. [Нативний Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_DURABLE_OVERRIDES` |

[Квоти сталого стану namespace](./task-queue-admission.md#namespace-durable-state).

### Квоти зовнішніх payload і транспорт S3 {#external-payload-quotas-and-s3}

| Змінна | Типове значення | Призначення | Застарілий псевдонім |
| --- | --- | --- | --- |
| `DW_EXTERNAL_PAYLOAD_COMPLETION_MAX_BYTES` | `unset` | Окремі байти в незмінних upload slots одного leased completion; без значення використовується `DW_EXTERNAL_PAYLOAD_MAX_BYTES`. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_COMPLETION_MAX_BYTES` |
| `DW_EXTERNAL_PAYLOAD_MAX_BYTES_PER_NAMESPACE` | `unset` | Сумарні байти зовнішніх payload namespace. Враховуються готові й незавершені об’єкти; без значення межі немає. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_MAX_BYTES_PER_NAMESPACE` |
| `DW_EXTERNAL_PAYLOAD_MAX_OBJECTS_PER_NAMESPACE` | `unset` | Кількість зовнішніх payload-об’єктів namespace. Враховуються готові й незавершені об’єкти; без значення межі немає. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_MAX_OBJECTS_PER_NAMESPACE` |
| `DW_EXTERNAL_PAYLOAD_HARD_MAX_BYTES_PER_NAMESPACE` | `unset` | Непереборна верхня межа сумарних байтів зовнішніх payload namespace, включно з перевизначеннями. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_HARD_MAX_BYTES_PER_NAMESPACE` |
| `DW_EXTERNAL_PAYLOAD_HARD_MAX_OBJECTS_PER_NAMESPACE` | `unset` | Непереборна верхня межа кількості зовнішніх payload-об’єктів namespace, включно з перевизначеннями. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_HARD_MAX_OBJECTS_PER_NAMESPACE` |
| `DW_EXTERNAL_PAYLOAD_NAMESPACE_OVERRIDES` | `{}` | JSON за namespace із перевизначеннями квот `max_bytes` і `max_objects`. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_NAMESPACE_OVERRIDES` |
| `DW_EXTERNAL_PAYLOAD_S3_ACCESS_KEY_ID` | `unset` | Необов’язковий access-key ID керованого runtime S3-сумісного диска; може бути відсутній за workload identity. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_ACCESS_KEY_ID` |
| `DW_EXTERNAL_PAYLOAD_S3_SECRET_ACCESS_KEY` | `unset` | Необов’язковий секретний ключ керованого S3-сумісного диска; задається разом з access-key ID. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_SECRET_ACCESS_KEY` |
| `DW_EXTERNAL_PAYLOAD_S3_SESSION_TOKEN` | `unset` | Необов’язковий session token тимчасових облікових даних керованого S3-сумісного диска. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_SESSION_TOKEN` |
| `DW_EXTERNAL_PAYLOAD_S3_REGION` | `us-east-1` | Регіон керованого runtime S3-сумісного диска. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_REGION` |
| `DW_EXTERNAL_PAYLOAD_S3_BUCKET` | `unset` | Bucket керованого runtime S3-сумісного диска. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_BUCKET` |
| `DW_EXTERNAL_PAYLOAD_S3_ENDPOINT` | `unset` | Необов’язковий HTTPS endpoint S3-сумісного сховища зовнішніх payload. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_ENDPOINT` |
| `DW_EXTERNAL_PAYLOAD_S3_USE_PATH_STYLE_ENDPOINT` | `false` | Використовувати path-style адресацію bucket для керованого S3-сумісного сховища. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_USE_PATH_STYLE_ENDPOINT` |

### Межі сервісних викликів namespace викликача {#service-caller-namespace-controls}

| Змінна | Типове значення | Призначення | Застарілий псевдонім |
| --- | --- | --- | --- |
| `DW_SERVICE_BOUNDARY_NAMESPACE_RATE_LIMIT_PER_MINUTE` | `unset` | Спільна необов’язкова кількість сервісних викликів за хвилину в усіх межах namespace викликача. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_NAMESPACE_RATE_LIMIT_PER_MINUTE` |
| `DW_SERVICE_BOUNDARY_NAMESPACE_MAX_IN_FLIGHT` | `unset` | Спільна необов’язкова кількість одночасних сервісних викликів namespace викликача. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_NAMESPACE_MAX_IN_FLIGHT` |
| `DW_SERVICE_BOUNDARY_HARD_RATE_LIMIT_PER_MINUTE` | `unset` | Непереборна хвилинна межа політик сервісної межі й namespace викликача. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_HARD_RATE_LIMIT_PER_MINUTE` |
| `DW_SERVICE_BOUNDARY_HARD_MAX_IN_FLIGHT` | `unset` | Непереборна межа одночасних викликів політик сервісної межі й namespace викликача. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_HARD_MAX_IN_FLIGHT` |
| `DW_SERVICE_BOUNDARY_NAMESPACE_OVERRIDES` | `{}` | JSON перевизначень частоти й одночасності сервісних викликів за namespace викликача; жорсткі межі чинні. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_NAMESPACE_OVERRIDES` |

### Координація, сховище й runtime {#coordination-storage-and-runtime-controls}

| Змінна | Типове значення | Призначення | Застарілий псевдонім |
| --- | --- | --- | --- |
| `DW_OBSERVABILITY_CONTEXT_ENABLED` | `false` | Увімкнути необов’язкове обмежене збереження й передавання trace context та discovery після встановлення відповідних API і схеми. | - |
| `DW_OBSERVABILITY_BAGGAGE_ALLOWLIST` | `[]` | JSON-список дозволених baggage keys для джерел run; типовий список порожній. Links не несуть baggage. | - |
| `DW_STORAGE_ADMISSION_FILE` | `unset` | Необов’язковий локальний read-only файл спостереження тиску сховища; невалідні чи застарілі дані блокують записи. | - |
| `DW_STORAGE_ADMISSION_SOURCE` | `unset` | Очікувана ідентичність ресурсу сховища в спостереженні допуску. | - |
| `DW_STORAGE_ADMISSION_MAX_AGE_SECONDS` | `15` | Максимальний вік спостереження сховища в секундах, від 1 до 300. | - |
| `DW_RUNTIME_CREDENTIALS_ENABLED` | `false` | Увімкнути сталі namespace-bound runtime bearer credentials у базі даних, керовані через admin API. | `WORKFLOW_SERVER_RUNTIME_CREDENTIALS_ENABLED` |
| `DW_WORKER_LONG_POLL_MAX_CONCURRENT_PER_NAMESPACE` | `unset` | Межа утримуваних workflow/activity long polls одного namespace на цьому вузлі; не перевищує глобальну worker-межу. Недоступний спільний cache authority спричиняє відмову. Нативний Server 3.x ігнорує його; див. [Нативний Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKER_LONG_POLL_MAX_CONCURRENT_PER_NAMESPACE` |
| `DW_QUERY_TASK_POLL_MAX_CONCURRENT_PER_NAMESPACE` | `unset` | Межа утримуваних query-task long polls одного namespace на цьому вузлі; не перевищує глобальну query-межу. Недоступний спільний cache authority спричиняє відмову. Нативний Server 3.x ігнорує його; див. [Нативний Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_QUERY_TASK_POLL_MAX_CONCURRENT_PER_NAMESPACE` |
| `DW_V1_ENABLED` | `false` | Увімкнути міграцію та спорожнення черги embedded v1 лише для свідомого збереження v1-стану; standalone Server типово працює лише з v2. | `WORKFLOW_V1_ENABLED` |

## Змінні інфраструктури runtime {#runtime-infrastructure-variables}

Інфраструктурні змінні runtime керують фреймворком та залежностями.
Аудит Server розпізнає їх і не попереджає, але вони не є сталими
налаштуваннями Durable Workflow API. Нативний Server 3.x читає групу «База
даних», включно з наведеними нижче параметрами TLS. Він не має Redis, кешу чи
черги Laravel, пише журнали до стандартного потоку помилок і не читає
`LOG_CHANNEL` або `LOG_LEVEL`.

| Група | Змінні | Використання |
| --- | --- | --- |
| Застосунок | `APP_NAME`, `APP_ENV`, `APP_KEY`, `APP_DEBUG`, `APP_URL`, `APP_VERSION`, locale, timezone, налаштування maintenance і cipher | Ідентичність runtime Laravel-застосунку та поведінка старту. |
| Логування | `LOG_CHANNEL`, `LOG_LEVEL`, `LOG_STDERR_FORMATTER`, налаштування stack, daily, Slack та Papertrail | Напрямки, формат і термін зберігання журналів Laravel. |
| База даних | `DB_CONNECTION`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, `DB_SOCKET`, `DB_URL`, `DB_SSLMODE` (`DB_SSL_MODE`), `DB_SSLROOTCERT` (`DB_SSL_ROOT_CERT`), `MYSQL_ATTR_SSL_CA`, налаштування charset, collation та foreign keys | SQL-сховище стану таблиць workflow, namespace, worker і projections. Див. [TLS бази даних](#database-tls). |
| Redis/cache/queue | `REDIS_*`, `QUEUE_CONNECTION`, `QUEUE_FAILED_DRIVER`, `CACHE_STORE`, `CACHE_PREFIX`, `SESSION_*` | Queue workers, cache locks, long-poll signals і підтримка web/session runtime. |
| Файлові системи/пошта/broadcasting | `FILESYSTEM_DISK`, `MAIL_*`, `BROADCAST_*`, `PUSHER_*`, `AWS_*` | Інтеграції фреймворку для особливостей конкретного розгортання. |
| Build/runtime | `MYSQL_VERSION`, `REDIS_VERSION`, `PHP_CLI_SERVER_WORKERS`, `VITE_APP_NAME`, `BCRYPT_ROUNDS` | Docker Compose images та поведінка runtime фреймворку. |

## TLS бази даних {#database-tls}

Нативний Server 3.x обробляє ці параметри так само, як PHP 2.x: ті самі
вхідні дані, псевдоніми, назви режимів і відмови. У ньому потрібно налаштувати
один процес Server, а також будь-яку команду `schema-upgrade` або переходу на
нативний Server, що працює з тією самою базою даних. У PHP 2.x задайте
однакові параметри TLS для API-сервера, воркера черги, завдання
початкового налаштування/міграції та планувальника. PostgreSQL за замовчуванням
використовує `prefer`; MySQL/MariaDB без явного режиму зберігають стандартні
налаштування з'єднання. Жоден із цих варіантів не гарантує автентифіковане
зашифроване з'єднання.

| `DB_SSLMODE` | PostgreSQL | MySQL / MariaDB |
| --- | --- | --- |
| `disable` | Без TLS. | Без TLS; суперечливі параметри TLS відхиляються. |
| `allow`, `prefer` | Опортуністичний TLS без гарантії шифрування чи ідентичності. | Відхиляються. |
| `require` | Шифрування обов'язкове. | Шифрування з mysqlnd та OpenSSL обов'язкове. |
| `verify-ca` | Обов'язкові шифрування та довірений ланцюжок сертифікатів. | Відхиляється: PDO mysqlnd не перевіряє лише ланцюжок незалежно від імені хоста. |
| `verify-full` | Обов'язкові шифрування, довірений ланцюжок та відповідність імені хоста. | Обов'язкові шифрування, довірений ланцюжок та відповідність імені хоста. |

`DB_SSL_MODE` є псевдонімом `DB_SSLMODE`, а `DB_SSL_ROOT_CERT` —
`DB_SSLROOTCERT`. Для перевірки сертифікатів змонтуйте доступний для читання
CA-файл за налаштованим шляхом у **кожній ролі**, включно з міграціями.
`MYSQL_ATTR_SSL_CA` може задавати CA для явного `verify-full` у MySQL/MariaDB.
Суперечності між основними параметрами, псевдонімами або URL зупиняють запуск.
Обов'язковий TLS потребує явного TCP-імені хоста; Unix-сокети відхиляються.
Явні TLS-режими MySQL/MariaDB потребують PDO MySQL із mysqlnd та OpenSSL.

```dotenv
DB_CONNECTION=pgsql
DB_HOST=database.example.com
DB_SSLMODE=verify-full
DB_SSLROOTCERT=/run/database-ca/ca.pem
```

Використовуйте DNS-ім'я із сертифіката. У Helm налаштуйте
`externalDatabase.sslMode` та `externalDatabase.tls.existingSecret` / `caKey`.
Створіть Secret до встановлення чи оновлення; чарт монтує CA в усіх чотирьох
ролях, включно з хуком початкового налаштування. Після змін середовища перезапустіть
постійні ролі: конфігурація кешується під час запуску.

## Журнали контейнерів {#container-logs}

Нативний Server 3.x завжди пише журнали до стандартного потоку помилок. У
PHP 2.x задайте `LOG_CHANNEL=stderr` у контейнерах API, воркерів і планувальника, щоб
`docker logs` або `kubectl logs` збирали журнали застосунку. Для наявних випусків
задайте це явно. `LOG_LEVEL` визначає мінімальний рівень важливості. Для JSON
з одним записом у рядку також задайте:

```dotenv
LOG_STDERR_FORMATTER="Monolog\Formatter\JsonFormatter"
```

Після змін перезапустіть постійні процеси, оскільки конфігурація кешується під час
запуску. Явно вибраний файловий канал потребує власного сховища та збору журналів;
Kubernetes не збирає `storage/logs/laravel.log` автоматично.
`DW_LOG_FORMAT` не є підтримуваним налаштуванням.

## Примітки до міграції {#migration-notes}

Під час міграції старого розгортання спочатку змініть публічну назву
й залиште застарілу назву неналаштованою. Якщо присутні обидві,
оператор має орієнтуватися на значення `DW_*` та прибрати стару назву.

```bash
# Before
WORKFLOW_SERVER_AUTH_DRIVER=token
WORKFLOW_SERVER_OPERATOR_TOKEN=operator-secret

# After
DW_AUTH_DRIVER=token
DW_OPERATOR_TOKEN=operator-secret
```

Після міграції запускайте образ Server з `DW_ENV_AUDIT_STRICT=1`,
щоб виявити помилки в назвах змінних, старі aliases та налаштування,
скопійовані з попередніх runbooks.
