---
sidebar_position: 2
title: Server
description: Розгортання й налаштування самостійного Durable Workflow Server.
tags:
  - server
  - control-plane
  - operations
  - polyglot
keywords:
  - Durable Workflow Server
  - самостійний Server
  - API площини керування
  - міжмовні workflow
---

# Server {#server}

Опублікований Durable Workflow Server є самостійним сервісом оркестрації
workflow, реалізованим на PHP. Він надає той самий надійний рушій, що й
вбудований пакет PHP, через незалежні від мови HTTP+JSON площину керування
та протокол worker. PHP тут є деталлю реалізації, а не вимогою до мови застосунку.

## Це лише для команд PHP? {#is-this-only-for-php-teams}

Ні. PHP, Python і Rust мають офіційні SDK. Команда застосунку лише на Python
чи Rust може розгорнути опублікований Server як інфраструктуру, писати
workflow й activity своїм SDK та спілкуватися публічним протоколом.
Її застосунок не вбудовує Laravel і не стає застосунком Laravel.

Шляхи впровадження відокремлені:

- **Самостійний Server:** оператор розгортає опублікований образ, базу,
  чергу/кеш, планувальник і ролі API. Команда запускає worker PHP, Python чи
  Rust проти цього endpoint. Server володіє станом оркестрації та публічною
  межею control-plane/worker.
- **Вбудований режим:** Laravel застосунок встановлює PHP пакет workflow
  і володіє рушієм через власні черги, базу, конфігурацію й розгортання.
  Це перевага інтеграції Laravel, а не передумова самостійного Server.
- **Керований Cloud:** Durable Workflow Cloud експлуатує runtime оркестрації,
  сховище, розміщення й відновлення. Команда запускає клієнти SDK і worker
  проти наданого namespace Cloud. Вона не розгортає цей Server для Cloud і
  не підключає до нього власний Server. Див. [керований runtime Cloud](/docs/polyglot/cloud-control-plane/).

Усі три варіанти використовують ті самі поняття надійного виконання.
Зовнішні worker самостійного Server і Cloud використовують сталі рядкові
назви типів workflow/activity та спільну обгортку кодека. Тому дочірній
workflow чи activity між мовами зберігає форму payload без серіалізації PHP.

Для вибору між самостійним Server і вбудованим пакетом почніть із
[режимів розгортання](/docs/polyglot/deployment-modes).
Ця сторінка описує дистрибутив сервісного режиму.

Використовуйте самостійний Server, якщо потрібні:
- **Міжмовні workflow:** worker workflow й activity PHP, Python і Rust зі спільним runtime
- **Оркестрація мікросервісів:** сервіси різними мовами
- **Централізований runtime workflow:** кілька застосунків на одному рушії
- **Середовища без Laravel:** Durable Workflow поза Laravel

Якщо ви вже використовуєте вбудовану v2 у Laravel, скористайтеся
[посібником переходу до Server](/docs/polyglot/embedded-to-server): підготуйте
ключі типів, розгорніть Server поруч, підключіть worker і направляйте лише
нові запуски до Server. Під час переходу тримайте поруч
[режими розгортання](/docs/polyglot/deployment-modes), щоб ID, результати
команд, семантика завдань і володіння runtime залишалися явними.

[Сумісність і маршрутизація worker](/docs/polyglot/worker-compatibility-routing)
допомагають розгортати групи збірок, виконувати drain старих груп і
зберігати прив'язку тривалих виконань до сумісних виконавців під час відкату.

[Топологія ролей Server](/docs/polyglot/server-role-topology) визначає
словник ролей, класи процесів, повноваження, області відмов і шлях міграції,
які публікує `GET /api/cluster/info`.

## Швидкий початок {#quick-start}

### Опублікований образ і SQLite {#published-image--sqlite}

Найшвидший спосіб запуску без вихідного коду: опублікований образ Docker.
Цей quickstart використовує SQLite, черги бази даних і файловий кеш
усередині контейнера. Змонтуйте `/app/database`, щоб bootstrap і API
використовували той самий файл SQLite:

```bash
server_image=%%artifact.serverDockerHubImage%%
export DW_AUTH_TOKEN=dev-token

docker volume create durable-workflow-server-quickstart

docker run --rm \
  -v durable-workflow-server-quickstart:/app/database \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$server_image" server-bootstrap

docker rm -f durable-workflow-server >/dev/null 2>&1 || true
docker run -d --name durable-workflow-server \
  -p 8080:8080 \
  -v durable-workflow-server-quickstart:/app/database \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$server_image"

until curl -sf http://localhost:8080/api/ready >/dev/null; do sleep 1; done
curl http://localhost:8080/api/health
curl -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  http://localhost:8080/api/cluster/info \
  | jq '.topology | {current_shape, current_roles, execution_mode}'
```

Це запускає один контейнер API й створює типовий namespace. Достатньо для
локальних worker Python SDK і перевірок CLI. Опублікований Compose нижче
дає MySQL, Redis, окремі контейнери worker і планувальника та ближче
до production середовище для тренування.

### Опублікований образ і Compose {#published-image--compose}

Використовуйте опублікований Compose для багатоконтейнерного стека
з MySQL і Redis без вихідного коду:

```bash
curl -fsSLO https://raw.githubusercontent.com/durable-workflow/server/main/docker-compose.published.yml

server_image=%%artifact.serverDockerHubImage%%
export DW_AUTH_TOKEN=dev-token

env DW_SERVER_IMAGE="$server_image" docker compose \
  -f docker-compose.published.yml up -d --wait
curl -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  http://localhost:8080/api/cluster/info \
  | jq '.topology | {current_shape, current_roles, execution_mode}'
```

### Порти {#ports}

| Сервіс | Порт | Призначення |
|---------|------|---------|
| Server API | 8080 | Endpoint площини керування й протоколу worker |
| MySQL | 3306 | База даних, порт відкритий для зручності розробки |
| Redis | 6379 | Кеш і черга, порт відкритий для зручності розробки |

## Конфігурація {#configuration}

Server налаштовується змінними середовища. Основні параметри наведені нижче,
а повний операторський контракт `DW_*` описано в
[довіднику конфігурації Server](/docs/polyglot/server-config-reference).

### База даних {#database}

```bash
DB_CONNECTION=mysql
DB_HOST=mysql
DB_PORT=3306
DB_DATABASE=workflow
DB_USERNAME=workflow
DB_PASSWORD=secret
```

Підтримуються MySQL 8.0+, PostgreSQL 13+, SQLite 3.35+.

### Кеш і черга {#cache-and-queue}

```bash
CACHE_STORE=redis
QUEUE_CONNECTION=redis

REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=null
REDIS_DB=0
```

Кеш має підтримувати [атомарні блокування](https://laravel.com/docs/12.x/cache#atomic-locks).
Драйвери черг: Redis, Amazon SQS, Beanstalkd, database.

Атомарні блокування кешу потрібні для серверних
[лімітів допуску черг](/docs/polyglot/task-queue-admission) і зворотного тиску
query. Використовуйте Redis у багатовузловому розгортанні, якщо допуск
workflow, activity чи query має діяти між усіма процесами Server.

### Автентифікація {#authentication}

Server підтримує три режими автентифікації:

**За token** (типово):

```bash
DW_AUTH_DRIVER=token
DW_AUTH_TOKEN=your-secret-token-here
```

Усі запити мають надсилати `Authorization: Bearer your-secret-token-here`.

Для мінімальних повноважень налаштуйте token окремих ролей замість одного спільного:

```bash
DW_AUTH_DRIVER=token
DW_WORKER_TOKEN=worker-secret
DW_OPERATOR_TOKEN=operator-secret
DW_ADMIN_TOKEN=admin-secret
```

Token worker дозволяє register, poll, heartbeat і завершення роботи.
Token operator дозволяє start, list, signal, query, update, repair, cancel,
terminate, archive і спостереження workflow. Token admin дозволяє
адміністративні endpoint, наприклад керування namespace і retention.

**Підпис HMAC**:

```bash
DW_AUTH_DRIVER=signature
DW_SIGNATURE_KEY=your-signature-secret
```

Запити мають містити `X-Signature`, обчислений як
`hash_hmac('sha256', request_body, DW_SIGNATURE_KEY)`.
Server також приймає ключі підпису окремих ролей:

```bash
DW_AUTH_DRIVER=signature
DW_WORKER_SIGNATURE_KEY=worker-signature-secret
DW_OPERATOR_SIGNATURE_KEY=operator-signature-secret
DW_ADMIN_SIGNATURE_KEY=admin-signature-secret
```

**Без автентифікації** (лише для розробки):

```bash
DW_AUTH_DRIVER=none
```

⚠️ **Не використовуйте `none` у production.** Усі endpoint стають публічно доступними.

### Пакет Workflow {#workflow-package}

Образ Docker встановлює `durable-workflow/workflow`. Вибір версії:

```bash
# Build-time arg (set in docker-compose.yml or pass to docker build)
WORKFLOW_PACKAGE_REF=v2        # branch, tag, or commit
WORKFLOW_PACKAGE_SOURCE=       # custom Git remote (optional)
```

### Retention {#retention}

Налаштуйте строк доступності завершених workflow для query:

```bash
DW_HISTORY_RETENTION_DAYS=30
```

Після завершення retention workflow видаляються. Налаштовуйте retention namespace через API.

### Namespace {#namespaces}

Команда `server-bootstrap` виконує міграції й створює namespace `default`.
`DW_DEFAULT_NAMESPACE` змінює namespace запитів без заголовка namespace:

```bash
DW_DEFAULT_NAMESPACE=default
```

Створюйте namespace через API:

```bash
curl -X POST http://localhost:8080/api/namespaces \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "production",
    "description": "Production workflows",
    "retention_days": 90
  }'
```

## Перевірки здоров'я {#health-checks}

### Здоров'я API {#api-health}

```bash
curl http://localhost:8080/api/health
```

Повертає `200 OK` із:

```json
{
  "status": "serving",
  "timestamp": "2026-04-15T12:00:00Z",
  "checks": {
    "database": "ok"
  },
  "topology": {
    "schema": "durable-workflow.v2.role-topology",
    "version": 4,
    "current_shape": "standalone_server",
    "current_process_class": "server_http_node",
    "current_roles": ["api_ingress", "control_plane", "matching", "history_projection"],
    "execution_mode": "remote_worker_protocol",
    "matching_role": {
      "queue_wake_enabled": true,
      "shape": "in_worker",
      "wake_owner": "worker_loop",
      "task_dispatch_mode": "poll",
      "partition_primitives": ["connection", "queue", "compatibility", "namespace"],
      "backpressure_model": "lease_ownership",
      "discovery_limits": {
        "poll_batch_cap": 100,
        "availability_ceiling_seconds": 1,
        "wake_signal_ttl_seconds": 60,
        "workflow_task_lease_seconds": 300,
        "activity_task_lease_seconds": 300
      }
    }
  }
}
```

### Публічне зведення топології {#public-topology-summary}

Неавтентифіковані `GET /api/health` і `GET /api/ready` публікують зведення
`topology` вузла. Цей блок менший за `/api/cluster/info`, але містить поля
для визначення вузлів розділених ролей до автентифікації control-plane чи namespace:

- `topology.schema`
- `topology.version`
- `topology.current_shape`
- `topology.current_process_class`
- `topology.current_roles`
- `topology.execution_mode`
- `topology.matching_role.queue_wake_enabled`
- `topology.matching_role.shape`
- `topology.matching_role.wake_owner`
- `topology.matching_role.task_dispatch_mode`
- `topology.matching_role.partition_primitives`
- `topology.matching_role.backpressure_model`
- `topology.matching_role.discovery_limits.poll_batch_cap`
- `topology.matching_role.discovery_limits.availability_ceiling_seconds`
- `topology.matching_role.discovery_limits.wake_signal_ttl_seconds`
- `topology.matching_role.discovery_limits.workflow_task_lease_seconds`
- `topology.matching_role.discovery_limits.activity_task_lease_seconds`

`topology.matching_role.discovery_limits` є зафіксованим числовим контрактом
matching пакета workflow. `poll_batch_cap` задає максимальну кількість готових
рядків на poll, `availability_ceiling_seconds` є допуском `available_at`
між бекендами для нових готових завдань за розбіжності часу менш ніж секунду,
`wake_signal_ttl_seconds` є типовим TTL `CacheLongPollWakeStore`,
`workflow_task_lease_seconds` і `activity_task_lease_seconds` є типовими
тривалостями lease workflow і activity. Зменшення значення є зміною протоколу,
адже worker та сторонні інструменти читають цей авторитетний контракт.

Те саме зведення є в `/api/ready` навіть за неготового розгортання.
Probe розрізняють відповіді `server_http_node`, `scheduler_node`,
`matching_node`, `execution_node` за активних перешкод bootstrap.

### Готовність {#readiness}

```bash
curl http://localhost:8080/api/ready
```

`/api/ready` є перевіркою розгортання. Повертає `200 OK` лише якщо
передумови bootstrap і здоров'я безпечного розгортання готові чи мають warning.

Тлумачте машиночитані поля так:

- `checks.migrations.repository_exists` і `checks.migrations.pending_migrations`
  показують наявність сховища міграцій і ще не застосовані записи.
- `checks.migrations.adoptable_migrations` перелічує міграції створення таблиць,
  яким потрібне лише прийняття в історію міграцій. Це `warning`, тож Server
  залишається готовим, поки оператор планує прийняття.
- `checks.migrations.blocking_migrations` перелічує записи безпечності
  розгортання, потрібні до допуску трафіку. Непорожній масив блокує готовність
  із `checks.migrations.status = "pending"`.
- `checks.migrations.missing_tables` показує відсутні надійні таблиці,
  `checks.migrations.operator_surface` показує доступність поверхні v2
  для пояснення безпечності після запуску Server.
- `checks.migrations.readiness_contract.version` фіксує ревізію контракту
  запуску й прийняття міграцій для скриптів.
- `checks.workflow_v2` відображає висновок всіх namespace. Якщо оцінювання
  ще неможливе, повертає `status: "blocked"`, `blocked_by`, `message`,
  `remediation`, щоб оператор виправив передумову замість симптомів черги.

### Перевірка bootstrap workflow {#workflow-bootstrap-gate}

`checks.workflow_v2.status: "blocked"` також блокує маршрути, а не лише
сигналізує готовність. Під час блокування bootstrap v2 Server відхиляє
start/mutation workflow, зміни schedule, bridge-adapter і worker з HTTP `503`
та `reason: "workflow_v2_blocked"`. Перевірка йде після ролі й версії
протоколу, але до namespace, тому не розкриває його існування.

Відповідь перевірки завжди містить:

- `reason: "workflow_v2_blocked"` для перевірки машинного імені замість тексту.
- `blocked_by`: впорядкований список передумов готовності, наприклад `migrations`.
- `remediation`: інструкція оператора для усунення перешкод із
  `/api/ready` поля `checks.workflow_v2.remediation`.

Сімейства маршрутів із перевіркою bootstrap:

- **Запуск і зміна workflow:** маршрути start, команд і команд вибраного
  виконання `/api/workflows`.
- **Зміна schedule:** `POST /api/schedules`, `PUT /api/schedules/{scheduleId}`,
  `DELETE /api/schedules/{scheduleId}`, `POST /api/schedules/{scheduleId}/pause`,
  `POST /api/schedules/{scheduleId}/resume`, `POST /api/schedules/{scheduleId}/trigger`,
  `POST /api/schedules/{scheduleId}/backfill`.
- **Адаптери bridge:** `POST /api/bridge-adapters/webhook/{adapter}`.
- **Протокол worker:** усі `/api/worker` і `/api/worker/*`, включно з register,
  heartbeat і діями workflow-task, query-task, activity-task. Payload
  повертається в обгортці worker зі збереженням заголовка
  `X-Durable-Workflow-Protocol-Version`, щоб SDK читав той самий
  `reason: "workflow_v2_blocked"`, що й у площині керування.

**Читання** schedule навмисно виключене для перевірки стану під час відновлення:
`GET /api/schedules`, `GET /api/schedules/{scheduleId}` і
`GET /api/schedules/{scheduleId}/history` працюють за блокування інших маршрутів.

### Можливості Server {#server-capabilities}

```bash
curl http://localhost:8080/api/cluster/info \
  -H "Authorization: Bearer $TOKEN"
```

Повертає версію збірки, підтримувані SDK, можливості рушія, політику
сумісності клієнтів та незалежно версіоновані маніфести control-plane і worker:

```json
{
  "server_id": "server-1",
  "version": "2.0.0",
  "default_namespace": "default",
  "supported_sdk_versions": {
    "php": ">=1.0",
    "python": ">=0.2,<1.0",
    "cli": ">=0.1,<1.0"
  },
  "client_compatibility": {
    "schema": "durable-workflow.v2.client-compatibility",
    "version": 1,
    "authority": "protocol_manifests",
    "top_level_version_role": "informational",
    "fail_closed": true
  },
  "capabilities": {
    "workflow_tasks": true,
    "activity_tasks": true,
    "signals": true,
    "queries": true,
    "updates": true,
    "schedules": true,
    "child_workflow_retry_policy": true,
    "child_workflow_timeouts": true,
    "payload_codecs": ["avro"],
    "response_compression": ["gzip", "deflate"]
  },
  "control_plane": {
    "version": "2",
    "header": "X-Durable-Workflow-Control-Plane-Version",
    "request_contract": { "schema": "durable-workflow.v2.control-plane-request.contract", "version": 1, "...": "..." },
    "response_contract": { "schema": "durable-workflow.v2.control-plane-response.contract", "version": 1, "...": "..." }
  },
  "worker_protocol": {
    "version": "1.0",
    "server_capabilities": {
      "long_poll_timeout": 30,
      "supported_workflow_task_commands": [
        "complete_workflow",
        "fail_workflow",
        "continue_as_new",
        "schedule_activity",
        "start_timer",
        "start_child_workflow"
      ],
      "workflow_task_poll_request_idempotency": true,
      "poll_status": true,
      "history_page_size_default": 500,
      "history_page_size_max": 1000,
      "activity_retry_policy": true,
      "activity_timeouts": true,
      "child_workflow_retry_policy": true,
      "child_workflow_timeouts": true,
      "parent_close_policy": true,
      "non_retryable_failures": true,
      "response_compression": ["gzip", "deflate"],
      "history_compression": {
        "supported_encodings": ["gzip"],
        "compression_threshold": 8192
      }
    }
  }
}
```

`client_compatibility.authority: "protocol_manifests"` є правилом перевірки
клієнтів. Верхній `version` є ідентичністю збірки. CLI та SDK мають відхиляти
роботу за відсутніх чи непідтримуваних `control_plane.version`,
`control_plane.request_contract` або `worker_protocol.version`.

### Топологія ролей і форма розгортання {#role-topology-and-deployment-shape}

Довідник кожного поля маніфесту міститься в
[топології ролей Server](/docs/polyglot/server-role-topology). Цей розділ
зберігає приклад `cluster/info`. Окрема сторінка збирає форми, повноваження,
області відмов, межі масштабування й контракт шляху міграції.

`GET /api/cluster/info` також публікує маніфест `topology`: машиночитану
мапу ролей вузла, що відповів. Оператор та автоматизація читають один
контракт замість виведення обов'язків із назв контейнерів чи інструкцій.

```json
{
  "topology": {
    "schema": "durable-workflow.v2.role-topology",
    "version": 2,
    "supported_shapes": [
      "embedded",
      "standalone_server",
      "split_control_execution"
    ],
    "role_vocabulary": [
      "api_ingress",
      "control_plane",
      "matching",
      "history_projection",
      "scheduler",
      "execution_plane"
    ],
    "current_shape": "standalone_server",
    "current_process_class": "server_http_node",
    "current_roles": [
      "api_ingress",
      "control_plane",
      "matching",
      "history_projection"
    ],
    "execution_mode": "remote_worker_protocol",
    "matching_role": {
      "queue_wake_enabled": true,
      "shape": "in_worker",
      "wake_owner": "worker_loop",
      "task_dispatch_mode": "poll",
      "partition_primitives": [
        "connection",
        "queue",
        "compatibility",
        "namespace"
      ],
      "backpressure_model": "lease_ownership",
      "discovery_limits": {
        "poll_batch_cap": 100,
        "availability_ceiling_seconds": 1,
        "wake_signal_ttl_seconds": 60,
        "workflow_task_lease_seconds": 300,
        "activity_task_lease_seconds": 300
      }
    },
    "shape_assignments": {
      "embedded": {
        "process_classes": [
          {
            "name": "application_process",
            "roles": [
              "control_plane",
              "matching",
              "history_projection",
              "scheduler",
              "execution_plane"
            ]
          }
        ]
      },
      "standalone_server": {
        "process_classes": [
          {
            "name": "server_http_node",
            "roles": [
              "api_ingress",
              "control_plane",
              "matching",
              "history_projection"
            ]
          },
          {
            "name": "scheduler_node",
            "roles": ["scheduler"]
          },
          {
            "name": "worker_node",
            "roles": ["execution_plane"]
          }
        ]
      },
      "split_control_execution": {
        "process_classes": [
          {
            "name": "ingress_node",
            "roles": ["api_ingress"]
          },
          {
            "name": "control_plane_node",
            "roles": ["control_plane", "history_projection"]
          },
          {
            "name": "scheduler_node",
            "roles": ["scheduler"]
          },
          {
            "name": "matching_node",
            "roles": ["matching"]
          },
          {
            "name": "execution_node",
            "roles": ["execution_plane"]
          }
        ]
      }
    },
    "authority_boundaries": {
      "control_plane": {
        "writes": [
          "workflow_instances",
          "workflow_runs.status",
          "workflow_tasks.lifecycle"
        ]
      },
      "execution_plane": {
        "writes": [
          "workflow_tasks.outcomes",
          "activity_attempts",
          "worker_compatibility_heartbeats"
        ]
      },
      "matching": {
        "writes": [
          "workflow_tasks.leases",
          "activity_tasks.leases"
        ]
      },
      "history_projection": {
        "writes": [
          "history_events",
          "workflow_run_summaries",
          "workflow_history_exports"
        ]
      },
      "scheduler": {
        "writes": [
          "workflow_schedules.fire_state",
          "workflow_starts.scheduled"
        ]
      },
      "api_ingress": {
        "writes": ["worker_registrations"]
      }
    },
   "failure_domains": {
      "control_plane_down": {
        "effect": "workers_continue_claimed_tasks_only_until_lease_expiry",
        "operator_signal": "operator_commands_fail_fast"
      },
      "execution_plane_down": {
        "effect": "ready_tasks_accumulate_without_loss",
        "operator_signal": "operators_see_ready_depth_growth"
      },
      "matching_down": {
        "effect": "claim_falls_back_to_direct_ready_task_discovery",
        "operator_signal": "ready_depth_rises_while_claim_rate_falls"
      },
      "history_projection_down": {
        "effect": "projection_reads_may_stale_while_durable_writes_continue",
        "operator_signal": "projection_lag_seconds_may_increase"
      },
      "scheduler_down": {
        "effect": "scheduled_workflows_stop_firing_and_record_missed_runs",
        "operator_signal": "operators_see_missed_schedule_state"
      },
      "api_ingress_down": {
        "effect": "external_http_traffic_stops_at_the_edge",
        "operator_signal": "embedded_in_process_calls_may_continue"
      }
    },
    "scaling_boundaries": {
      "api_ingress": "incoming_http_request_rate",
      "control_plane": "operator_commands_and_run_lifecycle_transitions",
      "matching": "ready_task_rate_and_poller_count",
      "history_projection": "durable_event_rate",
      "scheduler": "active_schedule_count",
      "execution_plane": "workflow_and_activity_task_rate"
    },
    "migration_path": [
      {
        "step": "audit_role_boundaries",
        "result": "tooling flags cross-role writes before runtime shape changes",
        "reversible": true
      },
      {
        "step": "expose_role_bindings",
        "result": "container seams allow out-of-process adapters without patching the package",
        "reversible": true
      },
      {
        "step": "introduce_dedicated_matching_shape",
        "result": "matching can run as its own process class without changing the claim contract",
        "reversible": true
      },
      {
        "step": "split_history_projection",
        "result": "history and projections can move out of process without introducing a second writer",
        "reversible": true
      },
      {
        "step": "split_scheduler",
        "result": "schedule firing can move behind leader election while single-replica deployments stay legal",
        "reversible": true
      },
      {
        "step": "optional_execution_partitioning",
        "result": "workers can partition by namespace, connection, queue, and compatibility",
        "reversible": true
      }
    ],
    "kernel_invariants": [
      {
        "id": "single_persistence_engine",
        "summary": "one workflow database backs every topology shape; role split does not introduce a second persistence engine",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "single_worker_protocol",
        "summary": "one HTTP worker protocol carries claim, complete, fail, and heartbeat traffic across every topology; role split does not fork the worker contract",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "single_history_writer",
        "summary": "history_events has exactly one durable writer per logical event regardless of where the history/projection role runs",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "single_control_authority_per_run",
        "summary": "every mutation of a given workflow run routes through one control-plane authority; per-run row locks serialise transitions across replicas",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "embedded_topology_remains_supported",
        "summary": "the embedded shape where one process fills every role MUST stay legal; existing embedded hosts are never forced to migrate",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "role_split_is_topology_only",
        "summary": "splitting roles is a topology change, not a product fork; collapsing the roles back onto a single process is always a legal topology",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      }
    ]
  },
  "coordination_health": {
    "schema": "durable-workflow.v2.coordination-health.contract",
    "version": 2,
    "namespace_scope": "all_namespaces",
    "status": "ok",
    "http_status": 200,
    "warning_checks": [],
    "error_checks": [],
    "categories": {
      "correctness": "ok"
    },
    "checks": [
      {
        "name": "worker_compatibility",
        "status": "ok",
        "category": "correctness",
        "message": null
      },
      {
        "name": "activity_path",
        "status": "ok",
        "category": "correctness",
        "message": null
      }
    ],
    "routing_drains": {
      "queues_with_drains": 0,
      "draining_build_id_count": 0,
      "active_worker_count": 0,
      "draining_worker_count": 0,
      "stale_worker_count": 0,
      "queues": []
    }
  }
}
```

`topology.version` є версією схеми ролей, а не верхньою версією збірки
Server. Перевіряйте її до використання полів новішої ревізії. Поточний
контракт містить `supported_shapes`, `role_vocabulary`, `current_shape`,
`current_process_class`, `current_roles`, `execution_mode`, `matching_role`,
`role_catalog`, `shape_assignments`, `authority_boundaries`,
`authority_surfaces`, `failure_domains`, `supported_topologies`,
`scaling_boundaries`, `migration_path`, `kernel_invariants`.

Читайте поля так:

- `supported_shapes` називає дозволені топології продукту.
- `role_vocabulary` є фіксованим словником ролей v2 для автоматизації й діагностики.
- `current_shape`, `current_process_class`, `current_roles` описують поточний
  вузол. Використовуйте `current_process_class` як його оголошену ідентичність
  і порівнюйте ролі з `shape_assignments` для її перевірки.
- `execution_mode` розрізняє вбудовану локальну чергу `local_queue_worker`
  та протокол worker самостійного Server `remote_worker_protocol`.
- `matching_role.queue_wake_enabled`, `matching_role.shape`,
  `matching_role.wake_owner`, `matching_role.task_dispatch_mode`,
  `matching_role.partition_primitives`, `matching_role.backpressure_model`
  визначають шлях пробудження у worker чи окремий цикл repair/matching,
  сталі осі маршрутизації та надійну межу допуску matching.
- `matching_role.discovery_limits` фіксує числові значення пакета:
  `poll_batch_cap` (максимальна кількість готових рядків на poll),
  `availability_ceiling_seconds` (допуск `available_at` між бекендами
  за розбіжності часу менш ніж секунду), `wake_signal_ttl_seconds`
  (типовий TTL пробудження long-poll), `workflow_task_lease_seconds`
  і `activity_task_lease_seconds` (типові lease). Оператор перевіряє
  відповідність розгортання контракту без пошуку в коді пакета.
  Зменшення значення є зміною протоколу.
- `role_catalog` і `authority_surfaces` визначають інтерфейси й надійні
  шляхи змін, якими володіє кожна роль ревізії маніфесту.
- `shape_assignments` зіставляє форми з допустимими класами процесів і ролями.
- `supported_topologies` узагальнює сімейства розгортання й потрібні класи вузлів.
- `authority_boundaries` називає поверхні запису кожної ролі для виявлення
  відхилень повноважень до розділення розгортання.
- `failure_domains` описує першу видиму оператору ознаку погіршення за втрати ролі.
- `scaling_boundaries` називає основний вимір навантаження кожної окремої ролі.
- Автентифіковані маршрути відхиляють вузол без потрібної HTTP поверхні:
  `503`, `reason: "topology_role_unavailable"`, `current_shape`,
  `current_process_class`, `current_roles`, `required_roles`, `missing_roles`.
  Клієнт може направити запит на вузол із потрібною поверхнею.
- `coordination_health` є зведенням безпечності розгортання всього парку
  зі scope `all_namespaces`, статусом і HTTP станом, нормалізованими назвами
  warning/error перевірок готовності та `blocked_by`, `message`, `remediation`
  за блокування оцінювання попередніми проблемами готовності.
- `coordination_health.checks[]` завжди містить зафіксований `activity_path`
  поруч із `worker_compatibility`, `task_transport`, `routing_health`,
  `durable_resume_paths` і проєкціями/планувальником. Це відповідник
  `task_transport` для activity: він показує минулі дедлайни schedule-to-start,
  start-to-close, schedule-to-close чи heartbeat без застосування тайм-ауту
  (`timeout_overdue`, `oldest_timeout_overdue_at`, `max_timeout_overdue_age_ms`)
  та тривалий backlog retry (`retrying`, `oldest_retrying_started_at`,
  `max_retrying_age_ms`). Перейменування перевірки є зміною протоколу.
- `coordination_health.routing_drains` узагальнює draining групи build-id
  черг і namespace. `queues_with_drains` понад нуль означає навмисне
  утримання трафіку від хоча б однієї draining групи.
- `migration_path` перелічує кроки переходу від самостійного дистрибутива
  до ізольованіших ролей зі збереженням одного рушія. `reversible: true`
  дозволяє повернення до менш ізольованої форми.
- `kernel_invariants` перелічує гарантії ядра для всіх форм:
  `single_persistence_engine`, `single_worker_protocol`, `single_history_writer`,
  `single_control_authority_per_run`, `embedded_topology_remains_supported`,
  `role_split_is_topology_only`. `applies_to` називає відповідні форми.
  Автоматизація МОЖЕ перевіряти збереження ядра до зміни топології.

Так розділення ролей залишається зміною топології зі спільними рушієм і
control-plane API. Під час переходу від вузького парку `standalone_server`
до явнішого `split_control_execution` оператор читає ту саму поверхню.
`current_shape`, `current_roles`, `execution_mode`, `matching_role`,
`shape_assignments`, `authority_boundaries`, `failure_domains`,
`scaling_boundaries`, `migration_path` версіонуються одним маніфестом,
щоб інструменти розгортання оцінювали ту саму топологію, яку надає Server.

Це обмеження також надається машиночитано через `topology.kernel_invariants`.
Автоматизація може до зміни перевірити відсутність другого рушія зберігання,
розгалуженого протоколу worker, другого записувача історії чи незворотної міграції.

Перевірка ролі маршруту стосується лише автентифікованих API й worker.
`GET /api/health`, `GET /api/ready`, автентифікований `GET /api/cluster/info`
працюють для виявлення, життя й топології навіть на `scheduler_node`,
`matching_node`, `execution_node` без поточної HTTP поверхні керування.

Для незалежних від носія зовнішніх обробників endpoint також публікує
`worker_protocol.external_execution_surface_contract`. Маніфест визначає
[зовнішнє виконання рівня activity](/docs/polyglot/external-execution),
посилається на обгортки вводу/результату та залишає replay, `ContinueAsNew`,
порядок signal/update/query й тлумачення історії справжнім runtime.

Примітки щодо полів для клієнтського коду:

- Версія застосунку: `version`, а не `server_version`.
- Команди завдань workflow містяться в
  `worker_protocol.server_capabilities.supported_workflow_task_commands`,
  а не на верхньому рівні `worker_protocol`. Той самий об'єкт повертається
  в кожній відповіді worker як `server_capabilities`.
- `worker_protocol.server_capabilities.poll_status` означає наявність
  `poll_status` навіть без lease. Worker розрізняє `empty`, `throttled`,
  `unavailable`, `draining` без розбору тексту помилок.
- Підтримка параметрів retry, тайм-аутів, parent-close та неповторюваних помилок
  також повертається в `server_capabilities` для узгодження без окремого cluster-info.
- Єдиний кодек v2 міститься в `capabilities.payload_codecs`: точно `['avro']`.
  PHP серіалізатори імпорту/завершення v1 є внутрішніми механізмами міграції
  та ніколи не відображаються в можливостях runtime.

## Підключення worker {#connecting-workers}

Worker опитують Server і виконують код workflow чи activity.
[Протокол worker](/docs/polyglot/worker-protocol) визначає повний API.
Матриця ролей маршрутів, правила namespace і точний payload реєстрації
наведені в [namespace, автентифікації та реєстрації worker](/docs/polyglot/namespace-auth-workers).

### Worker PHP {#php-workers}

PHP застосунки без фреймворку й віддалені worker використовують SDK Server.
Їм не потрібні Laravel чи вбудований пакет Workflow:

<!-- docs-example id="server.php-sdk.install" -->
```bash
composer require %%artifact.phpSdkComposerPackage%%
```

Створіть клієнт і зареєструйте функції workflow чи activity у worker:

```php
use DurableWorkflow\Client;
use DurableWorkflow\Worker;
use DurableWorkflow\Worker\WorkflowContext;

$client = new Client(
    'http://localhost:8080',
    token: getenv('DURABLE_WORKFLOW_AUTH_TOKEN') ?: null,
    namespace: 'default',
);

$worker = new Worker($client, taskQueue: 'polyglot-php');
$worker->registerWorkflow(
    'invoice',
    static function (WorkflowContext $context, string $invoiceId): array {
        $context->activity('charge-card', [$invoiceId]);

        return ['invoice_id' => $invoiceId, 'status' => 'paid'];
    },
);
$worker->run();
```

[Посібник PHP SDK](/docs/polyglot/php/) описує клієнт, автентифікацію, payload
і життєвий цикл worker. Окремий `durable-workflow/workflow` є вбудованим
runtime Laravel і рушієм усередині опублікованого Server. Вбудовані workflow
Laravel виконують завдання пакета через чергу застосунку без самостійного Server.

### Worker Python {#python-workers}

Worker Python використовують SDK `durable-workflow`:

```bash
pip install %%artifact.pythonPackagePin%%
```

Налаштування worker описано в [посібнику Python SDK](/docs/polyglot/python).

### Worker власною мовою {#custom-language-workers}

Будь-яка мова може реалізувати worker:
1. Реєстрація через `POST /api/worker/register`
2. Long-poll через `POST /api/worker/workflow-tasks/poll`, `POST /api/worker/activity-tasks/poll` чи `POST /api/worker/query-tasks/poll`
3. Завершення через `POST /api/worker/workflow-tasks/{id}/complete`, `POST /api/worker/activity-tasks/{id}/complete` чи `POST /api/worker/query-tasks/{id}/complete`

Усі запити вимагають:
- `Authorization: Bearer $TOKEN`
- `X-Namespace: your-namespace`
- `X-Durable-Workflow-Protocol-Version: 1.0`

Server перевіряє існування namespace. Зареєструйте його через
`POST /api/namespaces` до направлення worker чи клієнтів, інакше
Server поверне `404` із `reason: "namespace_not_found"`.

Приклад із curl є в [README Server](https://github.com/durable-workflow/server#getting-started-end-to-end-workflow).

[Допуск черг завдань](/docs/polyglot/task-queue-admission) описує слоти worker,
ліміти активних lease, хвилинні бюджети dispatch і зворотний тиск query.

## CLI {#cli}

[Durable Workflow CLI](/docs/polyglot/cli) надає інтерфейс оболонки до Server:

```bash
# Install — Linux and macOS
curl -fsSL https://durable-workflow.com/install.sh | sh

# Install — macOS (Homebrew alternative)
brew install durable-workflow/tap/dw

# Install — Windows (PowerShell)
# irm https://durable-workflow.com/install.ps1 | iex

# Configure
export DURABLE_WORKFLOW_SERVER_URL=http://localhost:8080
export DURABLE_WORKFLOW_AUTH_TOKEN=your-token
export DURABLE_WORKFLOW_NAMESPACE=default

# Use
dw server:health
dw workflow:list
dw workflow:start --type=my-workflow --input='["value"]'
dw workflow:start --type=my-workflow --input-file=input.json
```

[Встановлення CLI](/docs/polyglot/cli#install) містить інсталятор із
визначенням платформи й прямі завантаження бінарних файлів.

Команди черг містять стан допуску workflow, activity і query.
Вони розрізняють відсутніх worker, насичені слоти, ліміти активних lease
чи швидкості dispatch та переповнення query.

## Розгортання {#deployment}

Перед production виберіть підтримувану топологію в
[посібнику самостійного розгортання](/docs/deployment). Він розділяє локальну
розробку, один production вузол, невеликі кластери, Kubernetes і топології з підтримкою.

Контракт невеликого самостійного кластера вузький: 2–3 stateless API вузли за
балансувальником, спільна зовнішня MySQL чи PostgreSQL, спільний Redis,
незалежно масштабовані worker та рівно один планувальник чи процес обслуговування.
Для кожного релізу вибирайте повну зупинку чи
[поступове оновлення](/docs/rolling-upgrades) з гарантіями різниці версій,
схеми, drain, готовності й відкату. Кластери SQLite, багатовузлова робота
без Redis, дублікати планувальника, active/active між регіонами й failover
провайдера поза контрактом до окремої перевірки. Окремо версіонований шлях
Helm описано в [посібнику розгортання](/docs/deployment#helm-chart-for-kubernetes).
Матеріали [active/passive між регіонами](/docs/deployment#activepassive-multi-region)
є оцінюванням із підтримкою, а не доведеним самостійним контрактом 2.0.
Кожен регіон-кандидат має починати з описаної однорегіональної форми чи невеликого кластера.

Для самостійного Server починайте з опублікованих образів, а не збірок вихідного коду:

- Docker Hub: `%%artifact.serverDockerHubImage%%`
- GitHub Container Registry: `%%artifact.serverGhcrImage%%`
- Compose з опублікованим образом:
  [`docker-compose.published.yml`](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml)
- Маніфести Kubernetes:
  [`k8s/`](https://github.com/durable-workflow/server/tree/main/k8s)

Production має фіксувати тег чи digest образу, використовувати облікові дані
окремих ролей, виконувати bootstrap/міграції до трафіку й доводити готовність
через `/api/ready`, `/api/cluster/info` і реєстрацію worker.
Не направляйте production трафік лише за `/api/health`.

## Довідник API {#api-reference}

Повний довідник endpoint, заголовків, ролей, протоколу worker, зовнішнього
сховища payload та іменованих помилок є в
[довіднику API Server](/docs/polyglot/server-api-reference).

Server надає три поверхні API:

### Площина керування {#control-plane}

Запускайте, описуйте, надсилайте signal/query/update, скасовуйте й примусово
завершуйте workflow, керуйте namespace, чергами, schedule, атрибутами пошуку
та worker. Кожен запит control-plane вимагає
`X-Durable-Workflow-Control-Plane-Version: 2`. Без нього запит відхиляється
з `missing_control_plane_version`.

Основні endpoint:
- `POST /api/workflows`: запуск workflow
- `GET /api/workflows/{id}`: опис workflow
- `POST /api/workflows/{id}/signal/{name}`: signal
- `POST /api/workflows/{id}/query/{name}`: query
- `POST /api/workflows/{id}/update/{name}`: update
- `POST /api/workflows/{id}/cancel`: негайне закриття як скасованого
- `POST /api/workflows/{id}/terminate`: негайне примусове завершення
- `GET /api/workflows/{id}/runs/{runId}/history`: події історії
- `GET /api/workflows/{id}/runs/{runId}/history/export`: експорт набору replay
- `GET /api/namespaces`, `POST /api/namespaces`, `GET|PUT /api/namespaces/{namespace}`: керування namespace
- `GET /api/workers`, `GET|DELETE /api/workers/{id}`: керування парком worker
- `GET /api/task-queues`, `GET /api/task-queues/{taskQueue}`: backlog, poller, lease і допуск черг
- `GET|POST /api/schedules`, `GET|PUT|DELETE /api/schedules/{id}`, `POST /api/schedules/{id}/{pause|resume|trigger|backfill}`: керування schedule
- `GET|POST|DELETE /api/search-attributes`: керування атрибутами пошуку
- `GET|POST|PUT|DELETE /api/service-endpoints...`: admin endpoint каталогу сервісів, вкладені сервіси, прив'язки операцій і надійні знімки викликів
- `POST /api/system/repair/pass`, `POST /api/system/activity-timeouts/pass`, `POST /api/system/retention/pass`: операторські проходи

Відповіді workflow control-plane, включно зі списками історії, містять
вкладені метадані `control_plane` для ідентифікації операції й версії
контракту відповіді. Експорт історії навмисно повертає набір replay без
обгортки, щоб сума цілісності й необов'язковий підпис покривали точні
байти артефакту, отриманого клієнтом.

Помилки перевірки повертають HTTP 422 із `reason: validation_failed`,
`errors`, `validation_errors`. Маршрути workflow також відображають причину
й деталі в `control_plane.reason` і `control_plane.validation_errors`.
Команди вибраного виконання повертають URL `run_id` у відповіді й
`control_plane.run_id` для розрізнення команд екземпляра й вибраного виконання.

Видимість черги допомагає визначити, чи відставання спричинене ростом
надійного backlog, відсутністю слотів worker чи лімітами допуску Server.
`GET /api/task-queues` повертає зведення кожної черги, а
`GET /api/task-queues/{taskQueue}` додає `pollers` і `current_leases`.
Обидва надають `stats.approximate_backlog_count`,
`stats.approximate_backlog_age_seconds` і лічильники готовності/lease
`stats.workflow_tasks.*` та `stats.activity_tasks.*`. Детальний маршрут
містить `admission` для розрізнення місткості worker і обмежень Server.
Швидкості надходження й dispatch усього парку містяться в
`operator_metrics.backlog.tasks_added_last_minute` і
`operator_metrics.backlog.tasks_dispatched_last_minute`. Маршрути черг
також надають `stats.tasks_added_last_minute` і
`stats.tasks_dispatched_last_minute` для тієї самої оцінки окремої черги.

### Протокол worker {#worker-protocol}

Worker виконують register, poll, heartbeat і complete.
Потрібен `X-Durable-Workflow-Protocol-Version: 1.0`.

Основні endpoint:
- `POST /api/worker/register`: реєстрація worker
- `POST /api/worker/workflow-tasks/poll`: long-poll завдань workflow
- `POST /api/worker/workflow-tasks/{id}/complete`: завершення завдання workflow
- `POST /api/worker/query-tasks/poll`: long-poll маршрутизованих query workflow
- `POST /api/worker/query-tasks/{id}/complete`: завершення query
- `POST /api/worker/query-tasks/{id}/fail`: помилка чи відмова query
- `POST /api/worker/activity-tasks/poll`: long-poll activity
- `POST /api/worker/activity-tasks/{id}/complete`: завершення activity

Докладніше в [протоколі worker](/docs/polyglot/worker-protocol).

### Виявлення без версії {#discovery-unversioned}

Лише endpoint виявлення й здоров'я не вимагають
`X-Durable-Workflow-Control-Plane-Version`:

- `GET /api/health`: перевірка життя та публічне `topology` без автентифікації
- `GET /api/ready`: перевірка готовності й те саме `topology` без автентифікації
- `GET /api/cluster/info`: можливості Server, версії протоколів і єдиний
  кодек Avro. Клієнт має спочатку визначити тут версії control-plane й worker.

## Усунення проблем {#troubleshooting}

### Worker не отримують завдання {#workers-not-receiving-tasks}

**Перевірте:**
1. Worker зареєстровані? `curl http://localhost:8080/api/workers -H "Authorization: Bearer $TOKEN" -H "X-Durable-Workflow-Control-Plane-Version: 2" -H "X-Namespace: default"`
2. Worker опитують правильну чергу?
3. Workflow запущений із тією самою чергою?
4. Бекенд кешу спільний між Server?

### Long-poll одразу завершується тайм-аутом {#long-poll-connections-timing-out-immediately}

**Перевірте:**
1. Драйвер кешу підтримує атомарні блокування? Виконайте `php artisan workflow:v2:doctor --strict`
2. Redis доступний із Server?
3. Тайм-аут балансувальника вищий за тайм-аут long-poll (типово 60 с)?

### Помилки з'єднання з базою {#database-connection-errors}

**Перевірте:**
1. Хост і порт бази правильні?
2. Облікові дані чинні?
3. База існує?
4. Міграції виконані? `php artisan migrate:status`

### Помилки автентифікації {#auth-failures}

**Перевірте:**
1. `DW_AUTH_DRIVER` відповідає методу клієнта?
2. Token чи HMAC секрет однакові на Server і клієнті?
3. Є заголовки автентифікації `Authorization: Bearer $TOKEN` чи підпису HMAC?

## Докладніше {#learn-more}

- [Довідник протоколу worker](/docs/polyglot/worker-protocol): повний API worker
- [Перехід із вбудованого режиму до Server](/docs/polyglot/embedded-to-server): впровадження з Laravel v2
- [Python SDK](/docs/polyglot/python): створення worker Python
- [CLI](/docs/polyglot/cli): інтерфейс командного рядка
- [Репозиторій Server](https://github.com/durable-workflow/server): код, issues, релізи
