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
назв `WORKFLOW_*` / `ACTIVITY_*` до контракту Server v2.

Server також використовує звичайні налаштування Laravel runtime,
зокрема `DB_*`, `REDIS_*`, `QUEUE_CONNECTION` та `CACHE_STORE`.
Ці інфраструктурні змінні перелічено окремо як налаштування розгортання,
що не є керуванням Durable Workflow API.

## Застосування контракту {#how-the-contract-is-enforced}

Канонічний контракт зберігається в `config/dw-contract.php`
репозиторію Server. Під час старту контейнера `php artisan env:audit`
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
| `DW_AUTH_PROVIDER` | не задано | Клас, який може створити Laravel і який реалізує `App\Contracts\AuthProvider`. | `WORKFLOW_SERVER_AUTH_PROVIDER` |
| `DW_AUTH_DRIVER` | `token` | Driver автентифікації: `none`, `token` або `signature`. | `WORKFLOW_SERVER_AUTH_DRIVER` |
| `DW_AUTH_TOKEN` | не задано | Один спільний bearer token, якщо токени окремих ролей не налаштовані. | `WORKFLOW_SERVER_AUTH_TOKEN` |
| `DW_SIGNATURE_KEY` | не задано | Спільний ключ HMAC-підпису, якщо ключі окремих ролей не налаштовані. | `WORKFLOW_SERVER_SIGNATURE_KEY` |
| `DW_WORKER_TOKEN` | не задано | Bearer token для реєстрації worker, polling, heartbeats і завершення tasks. | `WORKFLOW_SERVER_WORKER_TOKEN` |
| `DW_OPERATOR_TOKEN` | не задано | Bearer token для читання та операторських дій площини керування. | `WORKFLOW_SERVER_OPERATOR_TOKEN` |
| `DW_ADMIN_TOKEN` | не задано | Bearer token для змін namespaces, retention та інших адміністративних дій. | `WORKFLOW_SERVER_ADMIN_TOKEN` |
| `DW_PRINCIPAL_TOKENS` | не задано | JSON map токенів іменованих principals. Кожен запис надає `token`, `subject`, `roles`, необов'язкові `tenant`, `label` і несекретні `claims`. | `WORKFLOW_SERVER_PRINCIPAL_TOKENS` |
| `DW_WORKER_SIGNATURE_KEY` | не задано | Ключ HMAC для запитів ролі worker за автентифікації підписами. | `WORKFLOW_SERVER_WORKER_SIGNATURE_KEY` |
| `DW_OPERATOR_SIGNATURE_KEY` | не задано | Ключ HMAC для запитів ролі operator за автентифікації підписами. | `WORKFLOW_SERVER_OPERATOR_SIGNATURE_KEY` |
| `DW_ADMIN_SIGNATURE_KEY` | не задано | Ключ HMAC для запитів ролі admin за автентифікації підписами. | `WORKFLOW_SERVER_ADMIN_SIGNATURE_KEY` |
| `DW_AUTH_BACKWARD_COMPATIBLE` | `true` | Використання спільних `DW_AUTH_TOKEN` / `DW_SIGNATURE_KEY` як fallback, якщо немає облікових даних окремої ролі. | `WORKFLOW_SERVER_AUTH_BACKWARD_COMPATIBLE` |

Для production використовуйте облікові дані з окремими ролями.
`DW_AUTH_DRIVER=none` призначений лише для локальних smoke-перевірок:
з ним кожен endpoint доступний без bearer token чи підпису.

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
| `DW_WORKER_POLL_TIMEOUT` | `30` | Кількість секунд, протягом яких Server тримає poll відкритим в очікуванні task. | `WORKFLOW_SERVER_WORKER_POLL_TIMEOUT` |
| `DW_WORKER_POLL_INTERVAL_MS` | `1000` | Мілісекунди між внутрішніми скануваннями під час відкритого poll. | `WORKFLOW_SERVER_WORKER_POLL_INTERVAL_MS` |
| `DW_WORKER_POLL_SIGNAL_CHECK_INTERVAL_MS` | `100` | Мілісекунди між перевірками wake signals під час відкритого poll. | `WORKFLOW_SERVER_WORKER_POLL_SIGNAL_CHECK_INTERVAL_MS` |
| `DW_POLLING_CACHE_PATH` | `storage/framework/cache/server-polling/<APP_ENV>` | Каталог стану координації polling worker за файлового polling cache. | `WORKFLOW_SERVER_POLLING_CACHE_PATH` |
| `DW_WAKE_SIGNAL_TTL_SECONDS` | `max(DW_WORKER_POLL_TIMEOUT + 5, 60)` | TTL wake signals кожної черги, які достроково завершують очікування poll. | `WORKFLOW_SERVER_WAKE_SIGNAL_TTL_SECONDS` |
| `DW_WORKER_LONG_POLL_MAX_CONCURRENT` | не задано; визначається для `PHP_CLI_SERVER_WORKERS` | Необов'язкове обмеження одночасних відкритих long-poll очікувань workflow/activity workers на цьому вузлі Server. Polls query tasks мають окремий budget. | `WORKFLOW_SERVER_WORKER_LONG_POLL_MAX_CONCURRENT` |
| `DW_WORKER_LONG_POLL_RESERVED_HTTP_WORKERS` | `2` | PHP CLI server workers, зарезервовані для health і площини керування під час визначення обмеження long-poll очікування workflow/activity. | `WORKFLOW_SERVER_WORKER_LONG_POLL_RESERVED_HTTP_WORKERS` |
| `DW_MAX_TASKS_PER_POLL` | `1` | Максимальна кількість tasks у відповіді на poll worker. | `WORKFLOW_SERVER_MAX_TASKS_PER_POLL` |
| `DW_SQLITE_CLAIM_LOCK_TTL_SECONDS` | `10` | Секунди утримання кешованої claim-блокади polling worker у SQLite quickstart backend до спливу lock. | `WORKFLOW_SERVER_SQLITE_CLAIM_LOCK_TTL_SECONDS` |
| `DW_SQLITE_CLAIM_LOCK_WAIT_SECONDS` | `5` | Секунди очікування SQLite claims polling worker на кешовану claim-блокаду до повернення тиску блокувань backend. | `WORKFLOW_SERVER_SQLITE_CLAIM_LOCK_WAIT_SECONDS` |
| `DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` | не задано | Обмеження активних leases workflow tasks на namespace/task queue. | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` |
| `DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` | не задано | Обмеження активних leases workflow tasks у всіх чергах namespace. | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` |
| `DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE` | не задано | Обмеження dispatch workflow tasks за хвилину на namespace/task queue. | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE` |
| `DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` | не задано | Обмеження dispatch workflow tasks за хвилину в namespace. | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` |
| `DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` | не задано | Обмеження активних leases activity tasks на namespace/task queue. | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` |
| `DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` | не задано | Обмеження активних leases activity tasks у всіх чергах namespace. | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` |
| `DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE` | не задано | Обмеження dispatch activity tasks за хвилину на namespace/task queue. | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE` |
| `DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` | не задано | Обмеження dispatch activity tasks за хвилину в namespace. | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` |
| `DW_TASK_QUEUE_ADMISSION_OVERRIDES` | `{}` | JSON-перевизначення за ключами `namespace:task_queue`, `namespace:*`, `task_queue` чи `*` для активних leases, швидкості dispatch, обмежень namespace і budget-груп downstream. | `WORKFLOW_SERVER_TASK_QUEUE_ADMISSION_OVERRIDES` |
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
| `DW_QUERY_TASK_MAX_PENDING_PER_QUEUE` | `1024` | Максимальна кількість незавершених query tasks у cache на namespace/task queue перед відхиленням нових queries. | `WORKFLOW_SERVER_QUERY_TASK_MAX_PENDING_PER_QUEUE` |
| `DW_QUERY_TASK_POLL_TIMEOUT` | `5` | Максимальні секунди очікування кожного idle poll query task worker перед повторною перевіркою тиску workflow tasks та доступності площини керування. | `WORKFLOW_SERVER_QUERY_TASK_POLL_TIMEOUT` |
| `DW_QUERY_TASK_POLL_MAX_CONCURRENT` | не задано; визначається для `PHP_CLI_SERVER_WORKERS` | Необов'язкове обмеження одночасних idle long-poll очікувань query task workers на цьому вузлі Server. Незавершені query tasks можна отримати негайно перед idle-очікуванням poll. | `WORKFLOW_SERVER_QUERY_TASK_POLL_MAX_CONCURRENT` |
| `DW_WORKFLOW_TASK_TIMEOUT` | `60` | Стандартний timeout lease workflow task у секундах. | `WORKFLOW_TASK_TIMEOUT` |
| `DW_ACTIVITY_TASK_TIMEOUT` | `300` | Стандартний timeout lease activity task у секундах. | `ACTIVITY_TASK_TIMEOUT` |
| `DW_WORKER_STALE_AFTER_SECONDS` | `max(DW_WORKER_POLL_TIMEOUT * 2, 60)` | Секунди після heartbeat worker, коли реєстрація worker стає застарілою. | `WORKFLOW_SERVER_WORKER_STALE_AFTER_SECONDS` |
| `DW_WORKER_HEARTBEAT_INTERVAL_SECONDS` | `60` | Інтервал у секундах, оголошений SDK у підтвердженнях реєстрації та heartbeat worker. | `WORKFLOW_SERVER_WORKER_HEARTBEAT_INTERVAL_SECONDS` |

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
| `DW_MAX_HISTORY_EVENTS` | `50000` | Максимальна кількість подій історії на run workflow перед примусовим continue-as-new. | `WORKFLOW_MAX_HISTORY_EVENTS` |
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
| `DW_V2_PIN_TO_RECORDED_FINGERPRINT` | `true` | Вибір незавершених runs за fingerprint workflow, записаним у `WorkflowStarted`. | `WORKFLOW_V2_PIN_TO_RECORDED_FINGERPRINT` |
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

Використовуйте `DW_V2_GUARDRAILS_BOOT` у CI та deployment manifests.
Стару назву `WORKFLOW_V2_GUARDRAILS_BOOT` залишено лише для того,
щоб `env:audit` повідомляв операторам alpha-версій про перейменування.
Пакет workflow більше не читає її як runtime fallback.

Використовуйте [matching та dispatch tasks](/docs/polyglot/task-matching-dispatch)
під час налаштування `DW_V2_MATCHING_ROLE_QUEUE_WAKE` або окремого daemon
`workflow:v2:repair-pass --loop`. Ці налаштування змінюють місце пошуку
готових tasks, зберігаючи той самий контракт worker-протоколу.

## Змінні інфраструктури runtime {#runtime-infrastructure-variables}

Інфраструктурні змінні runtime керують фреймворком та залежностями.
Аудит Server розпізнає їх і не попереджає, але вони не є сталими
налаштуваннями Durable Workflow API.

| Група | Змінні | Використання |
| --- | --- | --- |
| Застосунок | `APP_NAME`, `APP_ENV`, `APP_KEY`, `APP_DEBUG`, `APP_URL`, `APP_VERSION`, locale, timezone, налаштування maintenance і cipher | Ідентичність runtime Laravel-застосунку та поведінка старту. |
| Логування | `LOG_CHANNEL`, `LOG_LEVEL`, налаштування stack, daily, Slack та Papertrail | Напрямки логування Laravel та retention. |
| База даних | `DB_CONNECTION`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, `DB_SOCKET`, `DB_URL`, налаштування charset, collation та foreign keys | SQL-сховище стану таблиць workflow, namespace, worker і projections. |
| Redis/cache/queue | `REDIS_*`, `QUEUE_CONNECTION`, `QUEUE_FAILED_DRIVER`, `CACHE_STORE`, `CACHE_PREFIX`, `SESSION_*` | Queue workers, cache locks, long-poll signals і підтримка web/session runtime. |
| Файлові системи/пошта/broadcasting | `FILESYSTEM_DISK`, `MAIL_*`, `BROADCAST_*`, `PUSHER_*`, `AWS_*` | Інтеграції фреймворку для особливостей конкретного розгортання. |
| Build/runtime | `MYSQL_VERSION`, `REDIS_VERSION`, `PHP_CLI_SERVER_WORKERS`, `VITE_APP_NAME`, `BCRYPT_ROUNDS` | Docker Compose images та поведінка runtime фреймворку. |

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
