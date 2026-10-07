---
sidebar_position: 3
title: Довідник API Server
description: HTTP довідник endpoint площини керування, worker, namespace, сховища, schedule і системних операцій Durable Workflow Server.
tags:
  - server
  - API
  - reference
  - control-plane
keywords:
  - API Durable Workflow Server
  - заголовок версії control-plane
  - endpoint протоколу worker
  - API зовнішнього сховища payload
---

# Довідник API Server {#server-api-reference}

Самостійний Server надає версіонований HTTP+JSON API. Використовуйте цей довідник
для SDK, скриптів, адаптерів bridge та операторських інструкцій, які звертаються
безпосередньо до Server. Розгортання й конфігурацію описано в
[посібнику Server](/docs/polyglot/server), а виклики `dw` в оболонці в
[довіднику команд CLI](/docs/polyglot/cli-reference).

## Заголовки й версіонування {#headers-and-versioning}

Усі автентифіковані запити використовують bearer token, якщо Server
не налаштований на інший драйвер автентифікації:

```http
Authorization: Bearer <token>
X-Namespace: default
Content-Type: application/json
Accept: application/json
```

Маршрути площини керування вимагають:

```http
X-Durable-Workflow-Control-Plane-Version: 2
```

Маршрути площини worker вимагають:

```http
X-Durable-Workflow-Protocol-Version: 1.0
```

Server публікує підтримувані версії та машиночитані контракти через
`GET /api/cluster/info`. Клієнти мають визначати версії там перед запуском
тривалої автоматизації. Відсутня чи непідтримувана версія control-plane
відхиляється з іменованою причиною, наприклад `missing_control_plane_version`
чи `unsupported_control_plane_version`.

Для перевірки, генерації коду й контролю відхилень використовуйте нормативний
каталог [специфікацій протоколів платформи](/docs/platform-protocol-specs).
Він посилається на OpenAPI площини керування, OpenAPI й AsyncAPI протоколу
worker, JSON Schema `cluster_info` та суміжні схеми MCP, історії, Waterline
і repair/actionability.

## Виявлення й здоров'я {#discovery-and-health}

Ці маршрути використовують балансувальники, початкове налаштування SDK
та перевірки сумісності.

| Метод | Шлях | Автентифікація | Призначення |
| --- | --- | --- | --- |
| `GET` | `/api/health` | ні | Перевірка життя та машиночитане зведення топології вузла. |
| `GET` | `/api/ready` | ні | Перевірка готовності з тим самим зведенням топології й перевірками bootstrap безпечного розгортання. |
| `GET` | `/api/cluster/info` | так | Ідентичність Server, діапазони SDK, топологія ролей, стан координації, контракти control-plane і worker, кодеки payload та можливості функцій. |

Приклад:

<!-- docs-example id="server.cluster-info.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/cluster/info" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" | jq '.control_plane.version, .worker_protocol.version'
```

`/api/cluster/info` навмисно не вимагає заголовка версії control-plane,
адже саме цей endpoint оголошує підтримувані версії. Відповідь також містить
`coordination_health`: зведення розгортання й готовності всіх namespace,
що відображає перевірки готовності Server.

### Публічне зведення топології {#public-topology-summary}

`GET /api/health` і `GET /api/ready` повертають об'єкт верхнього рівня
`topology` за контрактом зведення здоров'я. Він визначає вузол, який відповів
на probe, до успішної автентифікації control-plane, визначення namespace
чи повного виявлення `/api/cluster/info`.

Публічне зведення завжди містить:

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
matching. `poll_batch_cap` задає максимальну кількість готових рядків на poll,
`availability_ceiling_seconds` є допуском `available_at` між бекендами для
нових готових завдань за розбіжності часових позначок менш ніж секунду,
`wake_signal_ttl_seconds` є типовим TTL сигналу `CacheLongPollWakeStore`,
а `workflow_task_lease_seconds` і `activity_task_lease_seconds` є типовими
тривалостями lease завдань workflow і activity. Зменшення цих значень є зміною
протоколу, адже worker і сторонні інструменти читають їх як авторитетний
контракт matching. Перейменування поля також порушує протокол.

`/api/ready` повертає той самий `topology`, навіть якщо загальний `status`
дорівнює `not_ready`. Probe можуть розрізняти відповіді `server_http_node`,
`scheduler_node`, `matching_node`, `execution_node` за активних перешкод bootstrap.

Приклад:

<!-- docs-example id="server.health.topology.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/health" | jq '{
  status,
  topology: {
    schema: .topology.schema,
    version: .topology.version,
    current_shape: .topology.current_shape,
    current_process_class: .topology.current_process_class,
    current_roles: .topology.current_roles,
    execution_mode: .topology.execution_mode,
    matching_role: .topology.matching_role
  }
}'
```

### Перешкоди готовності {#readiness-blockers}

`GET /api/ready` повертає `status` і машиночитані `checks`.
Дві перевірки визначають безпечність оцінювання розгортання Server:

- `checks.migrations` є перевіркою bootstrap і міграцій. Вона публікує
  `repository_exists`, `pending_migrations`, `adoptable_migrations`,
  `blocking_migrations`, `missing_tables`, `operator_surface`, `readiness_contract`.
- `adoptable_migrations` означає, що наявним таблицям workflow потрібне лише
  прийняття історії міграцій. Server залишається готовим зі `status: "warning"`,
  щоб оператор запланував прийняття до наступного проходу міграцій.
- `blocking_migrations` означає, що записи міграцій безпечного розгортання ще
  потрібні. Server відхиляє роботу зі `status: "pending"` і `remediation`,
  замість удавати актуальність парку.
- `operator_surface.available` і `operator_surface.required_tables` показують,
  чи операторська поверхня v2 має потрібні надійні таблиці після запуску.
- `readiness_contract.version` фіксує ревізію контракту інсталяції й прийняття,
  яку мають очікувати скрипти під час читання готовності.
- `checks.workflow_v2` відображає висновок для всіх namespace. За відсутніх
  передумов готовності повертає `status: "blocked"`, `blocked_by`, `message`
  і `remediation`, замість повідомляти про здоровий парк.

Приклад:

<!-- docs-example id="server.ready.blockers.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/ready" | jq '{
  status,
  migrations: {
    status: .checks.migrations.status,
    adoptable_migrations: .checks.migrations.adoptable_migrations,
    blocking_migrations: (.checks.migrations.blocking_migrations | map(.migration)),
    missing_tables: .checks.migrations.missing_tables,
    operator_surface: .checks.migrations.operator_surface,
    readiness_contract: .checks.migrations.readiness_contract
  },
  workflow_v2: {
    status: .checks.workflow_v2.status,
    blocked_by: .checks.workflow_v2.blocked_by,
    remediation: .checks.workflow_v2.remediation
  }
}'
```

### Маніфест топології кластера {#cluster-topology-manifest}

`/api/cluster/info` також повертає маніфест `topology` вузла зі схемою
`durable-workflow.v2.role-topology`. Це підтримуваний спосіб визначити
поточну форму `standalone_server`, `embedded` чи `split_control_execution`,
ролі вузла та очікування Server від `matching_role`, `shape_assignments`,
`authority_boundaries`, `failure_domains`, `scaling_boundaries`, `migration_path`.
Відповідь також публікує поточний стан безпечності розгортання цього вузла.

Читайте маніфест так:

- `topology.current_shape`, `topology.current_process_class`,
  `topology.current_roles`, `topology.execution_mode` визначають фактичну
  форму ролей вузла. Це опис вузла, що відповідає, а не всього парку.
- `topology.role_vocabulary` є фіксованим переліком допустимих ролей v2.
- `topology.matching_role.queue_wake_enabled`, `topology.matching_role.shape`,
  `topology.matching_role.wake_owner`, `topology.matching_role.task_dispatch_mode`,
  `topology.matching_role.partition_primitives`, `topology.matching_role.backpressure_model`
  показують, чи широкий пошук готових завдань працює у worker або окремим
  проходом matching, хто ним володіє, сталі осі маршрутизації та поточну межу допуску v2.
- `topology.matching_role.discovery_limits` публікує числовий контракт:
  `poll_batch_cap`, `availability_ceiling_seconds`, `wake_signal_ttl_seconds`,
  `workflow_task_lease_seconds`, `activity_task_lease_seconds`. Перевіряйте
  відповідність розгортання цим значенням. Пакет надає ті самі ідентифікатори
  в `dw server:info`, знімку метрик оператора й здоров'ї namespace.
- `topology.role_catalog` і `topology.authority_surfaces` зіставляють ролі
  з інтерфейсами, надійними записами й шляхами читання для автоматизації вузла.
- `topology.shape_assignments` є машиночитаним переліком класів процесів
  кожної форми. Порівнюйте поточний набір ролей із ним для визначення класу вузла.
- `topology.supported_topologies` узагальнює підтримувані сімейства розгортання
  та потрібні їм класи вузлів.
- `coordination_health` узагальнює ризик розгортання й сумісності всього парку.
  Окрім `status` і `http_status`, може містити `blocked_by`, `message`,
  `remediation`, якщо оцінювання заблоковане міграціями чи доступністю бази.
- `coordination_health.checks[]` завжди містить зафіксований `activity_path`
  поруч із `worker_compatibility`, `task_transport`, `routing_health`,
  `durable_resume_paths` і перевірками проєкцій/планувальника. Це відповідник
  `task_transport` для activity: він показує минулі дедлайни schedule-to-start,
  start-to-close, schedule-to-close чи heartbeat без застосування тайм-ауту
  (`timeout_overdue`, `oldest_timeout_overdue_at`, `max_timeout_overdue_age_ms`)
  та тривалий backlog retry (`retrying`, `oldest_retrying_started_at`,
  `max_retrying_age_ms`). Перейменування перевірки є зміною протоколу.
- `coordination_health.routing_drains` узагальнює draining групи build-id
  namespace і черг. `queues_with_drains` і записи `build_ids` показують,
  де трафік навмисно не направляється до draining worker.
- `execution_mode` розрізняє вбудоване `local_queue_worker` і виконання
  через протокол `remote_worker_protocol`.
- `split_control_execution` є підтримуваною топологією продукту, а не окремим
  серверним продуктом чи іншим API.

Приклад:

<!-- docs-example id="server.cluster-info.topology.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/cluster/info" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  | jq '{
    current_shape: .topology.current_shape,
    current_roles: .topology.current_roles,
    execution_mode: .topology.execution_mode,
    matching_role: .topology.matching_role,
    coordination_health: {
      status: .coordination_health.status,
      http_status: .coordination_health.http_status,
      blocked_by: .coordination_health.blocked_by,
      queues_with_drains: .coordination_health.routing_drains.queues_with_drains
    }
  }'
```

Поняття цих полів, словник ролей і шлях міграції описані в
[топології ролей Server](/docs/polyglot/server-role-topology).

### Відмова неправильному вузлу топології {#wrong-node-topology-rejections}

Автентифіковані маршрути відхиляють запит, якщо вузол не має HTTP поверхні
керування цього endpoint. Перевірка працює після перевірки ролі й версії
протоколу, але до визначення namespace, тому не розкриває його існування.

У такому разі Server повертає `503` із `reason: "topology_role_unavailable"` та:

- `current_shape`: оголошена форма топології вузла.
- `current_process_class`: оголошений клас, наприклад `scheduler_node` чи `execution_node`.
- `current_roles`: фактично наявні ролі вузла.
- `required_roles`: потрібні endpoint ролі маршруту.
- `missing_roles`: відсутня на вузлі підмножина `required_roles`.

Маршрути control-plane повертають цей payload в обгортці площини керування.
Маршрути worker повертають ті самі поля в обгортці протоколу worker і
зберігають звичайний заголовок версії worker.

Приклад відповіді `GET /api/workflows` від вузла лише з планувальником:

```json
{
  "reason": "topology_role_unavailable",
  "message": "This node does not host the topology roles required for this endpoint.",
  "current_shape": "standalone_server",
  "current_process_class": "scheduler_node",
  "current_roles": ["scheduler"],
  "required_roles": ["api_ingress", "control_plane"],
  "missing_roles": ["api_ingress", "control_plane"]
}
```

`GET /api/health`, `GET /api/ready` та автентифікований `GET /api/cluster/info`
залишаються доступними для перевірки життя й виявлення навіть без поточної
HTTP поверхні керування на вузлі.

### Перевірка bootstrap workflow {#workflow-bootstrap-gate}

Автентифіковані маршрути зміни чи обслуговування трафіку workflow v2 також
відхиляють запити за `checks.workflow_v2.status = blocked` на вузлі.
Перевірка працює після ролі й версії протоколу, але до namespace, тому запит
під час заблокованого розгортання не дізнається про існування namespace.

У такому разі Server повертає `503` із `reason: "workflow_v2_blocked"` та:

- `blocked_by`: впорядкований перелік попередніх перешкод готовності,
  наприклад `migrations`, що заважають безпечному обслуговуванню v2.
- `remediation`: коротка інструкція усунення перешкод для оператора,
  відображена з `/api/ready` поля `checks.workflow_v2.remediation`.

Сімейства маршрутів із перевіркою bootstrap:

- **Запуск і зміна workflow:** усі маршрути `/api/workflows` груп запуску,
  опису, команд і команд вибраного виконання, наприклад `POST /api/workflows`,
  `POST /api/workflows/{workflowId}/signal/{signalName}`,
  `POST /api/workflows/{workflowId}/runs/{runId}/cancel`.
- **Зміна schedule:** `POST /api/schedules`, `PUT /api/schedules/{scheduleId}`,
  `DELETE /api/schedules/{scheduleId}`, `POST /api/schedules/{scheduleId}/pause`,
  `POST /api/schedules/{scheduleId}/resume`, `POST /api/schedules/{scheduleId}/trigger`,
  `POST /api/schedules/{scheduleId}/backfill`.
- **Адаптери bridge:** `POST /api/bridge-adapters/webhook/{adapter}`.
- **Протокол worker:** усі маршрути `/api/worker` і `/api/worker/*`, включно
  з register, heartbeat і poll/complete/fail/heartbeat завдань workflow, query й activity.

**Читання** schedule навмисно виключене для перевірки стану під час відновлення.
`GET /api/schedules`, `GET /api/schedules/{scheduleId}` і
`GET /api/schedules/{scheduleId}/history` працюють за блокування інших маршрутів.

Control-plane повертає payload в обгортці площини керування із заголовком
`X-Durable-Workflow-Control-Plane-Version`. Worker повертає ті самі `reason`,
`blocked_by`, `remediation` в обгортці worker із заголовком
`X-Durable-Workflow-Protocol-Version`, щоб worker використовував машинну
причину замість висновків про чергу лише з `503`.

Приклад відповіді `POST /api/workflows` за відсутньої міграції безпечності розгортання:

```json
{
  "reason": "workflow_v2_blocked",
  "message": "This node is not ready to serve workflow v2 traffic until bootstrap blockers are cleared.",
  "blocked_by": ["migrations"],
  "remediation": "Restore database connectivity and migrate the workflow tables before relying on workflow v2 rollout-safety health."
}
```

Той самий payload повертається в обгортці worker для `/api/worker/*`.
SDK worker можуть перевіряти `reason` і повторювати спроби після усунення перешкоди.

### Системне здоров'я namespace {#namespace-scoped-system-health}

`GET /api/system/health` є автентифікованою поверхнею безпечності розгортання
й координації одного namespace. Вимагає admin і
`X-Durable-Workflow-Control-Plane-Version: 2`, визначає namespace за
звичайними правилами запиту control-plane й повертає точний оцінений
namespace та поточний знімок `health`:

<!-- docs-example id="server.system-health.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/system/health" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  | jq '{namespace, status: .health.status, healthy: .health.healthy}'
```

Тлумачте payload так:

- `namespace`: namespace, чий стан розгортання/координації оцінено.
- `health.status` і `health.healthy`: загальний машиночитаний висновок здоров'я namespace.
- `health.checks` і `health.categories`: готовність, сумісність, проєкції й координація поверхонь.
- `health.operator_metrics`: поточні метрики черг, worker і repair namespace в тому самому знімку.
- `health.structural_limits`: фактичні структурні межі й пов'язана діагностика namespace.

## Площина керування workflow {#workflow-control-plane}

Маршрути workflow належать операторам і площині керування. Вони вимагають
ролі operator чи admin та `X-Durable-Workflow-Control-Plane-Version: 2`.

| Метод | Шлях | Призначення |
| --- | --- | --- |
| `GET` | `/api/workflows` | Показати екземпляри workflow з фільтрами статусу, типу, тексту query й ліміту. |
| `POST` | `/api/workflows` | Запустити екземпляр workflow. |
| `GET` | `/api/workflows/{workflowId}` | Описати поточне виконання ID workflow. |
| `GET` | `/api/workflows/{workflowId}/debug` | Повернути обмежену діагностику застряглого виконання. |
| `GET` | `/api/workflows/{workflowId}/runs` | Показати виконання ID workflow. |
| `GET` | `/api/workflows/{workflowId}/runs/{runId}` | Описати конкретне виконання. |
| `GET` | `/api/workflows/{workflowId}/runs/{runId}/debug` | Повернути обмежену діагностику вибраного виконання. |
| `GET` | `/api/workflows/{workflowId}/runs/{runId}/history` | Прочитати події історії сторінками. |
| `GET` | `/api/workflows/{workflowId}/runs/{runId}/history/export` | Експортувати архівний набір replay виконання. |

Запити запуску використовують незалежну від мови форму control-plane:

<!-- docs-example id="server.workflow-start.curl" -->
```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/workflows" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_type": "orders.fulfillment",
    "workflow_id": "order-1001",
    "task_queue": "orders",
    "input": ["order-1001"],
    "memo": {"source": "api-reference"},
    "search_attributes": {"CustomerId": "cust-42"},
    "duplicate_policy": "reject"
  }'
```

### Команди workflow {#workflow-commands}

Server також надає кооперативні маршрути `request-cancellation`.
[Кооперативне скасування](/docs/polyglot/cancellation/) описує контракт
обмеженого очищення й вимоги worker.

Команди екземпляра діють на поточне виконання ID workflow:

| Метод | Шлях | Призначення |
| --- | --- | --- |
| `POST` | `/api/workflows/{workflowId}/signal/{signalName}` | Надіслати signal. |
| `POST` | `/api/workflows/{workflowId}/query/{queryName}` | Виконати query лише для читання. |
| `POST` | `/api/workflows/{workflowId}/update/{updateName}` | Подати чи виконати update. |
| `POST` | `/api/workflows/{workflowId}/cancel` | Негайно закрити виконання як скасоване без продовження очищення workflow. |
| `POST` | `/api/workflows/{workflowId}/terminate` | Примусово завершити. |
| `POST` | `/api/workflows/{workflowId}/repair` | Попросити Server виправити застряглий стан, придатний до retry. |
| `POST` | `/api/workflows/{workflowId}/archive` | Архівувати закрите виконання workflow. |

Команди вибраного виконання явно відхиляють історичне чи неправильне виконання:

| Метод | Шлях | Призначення |
| --- | --- | --- |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/signal/{signalName}` | Надіслати signal лише для поточного вибраного виконання. |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/query/{queryName}` | Виконати query вибраного виконання. |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/update/{updateName}` | Подати чи виконати update лише для поточного вибраного виконання. |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/cancel` | Скасувати лише поточне вибране виконання. |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/terminate` | Примусово завершити лише поточне вибране виконання. |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/repair` | Виправити лише поточне вибране виконання. |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/archive` | Архівувати лише поточне й закрите вибране виконання. |

Команди з даними від викликача використовують масив `input`. SDK Python і
PHP кодують незалежні від мови обгортки payload. Прямі HTTP виклики мають
надсилати значення JSON, які цільовий workflow чи activity може декодувати.

## Namespace і сховище {#namespace-and-storage}

Маршрути namespace вимагають operator чи admin. Зміни namespace та
зовнішнього сховища вимагають admin.

| Метод | Шлях | Призначення |
| --- | --- | --- |
| `GET` | `/api/namespaces` | Показати namespace. |
| `POST` | `/api/namespaces` | Створити namespace. |
| `GET` | `/api/namespaces/{namespace}` | Описати retention, метадані й політику сховища namespace. |
| `PUT` | `/api/namespaces/{namespace}` | Оновити метадані чи retention namespace. |
| `PUT` | `/api/namespaces/{namespace}/external-storage` | Налаштувати політику зовнішнього сховища payload namespace. |
| `POST` | `/api/storage/test` | Перевірити запис і читання малого й великого payload через налаштований драйвер сховища. |

Політики зовнішнього сховища payload дозволяють великим обгорткам містити
сталі посилання замість байтів. Локальні політики використовують налаштований
шлях файлової системи. Об'єктні політики `s3`, `gcs`, `azure` використовують
явно налаштований диск і параметри bucket/prefix на сервері.

### Обгортка посилання на зовнішній payload {#external-payload-reference-envelope}

Посилання на зовнішній payload є стабільною мережевою обгорткою. SDK можуть
декодувати його у власні типи-помічники, але HTTP клієнти мають вважати
назви полів контрактом:

| Поле | Обов'язкове | Значення |
| --- | --- | --- |
| `schema` | так | Має бути `durable-workflow.v2.external-payload-reference.v1`. Невідомі схеми відхиляються. |
| `uri` | так | Розташування об'єкта драйвера, наприклад `file:///...`, `s3://bucket/prefix/object`, `gs://bucket/prefix/object`, `azure://container/prefix/object`. |
| `sha256` | так | SHA-256 збережених закодованих байтів шістнадцятковим нижнім регістром. SDK і Server перевіряють його перед декодуванням. |
| `size_bytes` | так | Довжина збереженого закодованого payload у байтах. Розбіжність є помилкою цілісності. |
| `codec` | так | Завжди `avro`: фіксована типізована схема Value з форматом Avro single-object. Зовнішній HTTP документ залишається JSON. |
| `expires_at` | ні | Підказка строку ISO-8601 для retention/GC. За відсутності очищення належить політиці retention namespace. |

Винесення payload залежить від порогу політики namespace. Вбудований payload
використовує звичайну обгортку, доки байти не перевищать `threshold_bytes`.
Потім драйвер записує байти, а історія зберігає обгортку посилання.
Replay і експорт історії мають явно завершуватися помилкою, якщо blob
відсутній, змінений, поза префіксом чи належить недоступному провайдеру.
Не можна мовчки заміняти відсутній об'єкт на `null`, `{}` чи порожні байти.

Повний контракт повноважень запиту, визначення namespace, облікові дані
ролей і поля реєстрації worker описані в
[namespace, автентифікації та реєстрації worker](/docs/polyglot/namespace-auth-workers).

## Адміністративні API каталогу сервісів {#service-catalog-admin-apis}

Маршрути каталогу сервісів є автентифікованими admin маршрутами control-plane.
Вони використовують ті самі визначення namespace, перевірку ролі топології й
вимогу `X-Durable-Workflow-Control-Plane-Version: 2`.

Реєструйте метадані endpoint, сервісів і операцій у namespace для каталогу
викликів між namespace. Ввід назв нечутливий до регістру, а відповіді й
пошук нормалізують назви до нижнього регістру.

| Метод | Шлях | Призначення |
| --- | --- | --- |
| `GET` | `/api/service-endpoints` | Показати endpoint сервісів поточного namespace. |
| `POST` | `/api/service-endpoints` | Створити endpoint сервісу. |
| `GET` | `/api/service-endpoints/{endpointName}` | Описати endpoint. |
| `PUT` | `/api/service-endpoints/{endpointName}` | Оновити опис чи метадані endpoint. |
| `DELETE` | `/api/service-endpoints/{endpointName}` | Видалити невикористаний endpoint. |
| `GET` | `/api/service-endpoints/{endpointName}/services` | Показати сервіси одного endpoint. |
| `POST` | `/api/service-endpoints/{endpointName}/services` | Створити сервіс endpoint. |
| `GET` | `/api/service-endpoints/{endpointName}/services/{serviceName}` | Описати сервіс. |
| `PUT` | `/api/service-endpoints/{endpointName}/services/{serviceName}` | Оновити опис чи метадані сервісу. |
| `DELETE` | `/api/service-endpoints/{endpointName}/services/{serviceName}` | Видалити невикористаний сервіс. |
| `GET` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations` | Показати операції сервісу. |
| `POST` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations` | Створити прив'язку операції. |
| `GET` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations/{operationName}` | Описати операцію. |
| `GET` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations/{operationName}/service-calls/{serviceCallId}` | Описати надійний знімок виклику сервісу. |
| `PUT` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations/{operationName}` | Оновити прив'язку операції. |
| `DELETE` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations/{operationName}` | Видалити невикористану операцію. |

Колекції відповіді використовують масиви `service_endpoints`, `services` чи
`operations`. Окремі ресурси містять сталі назви нижнім регістром, метадані й час:

- Endpoint повертають `id`, `namespace`, `endpoint_name`, `description`,
  `metadata`, `created_at`, `updated_at`.
- Сервіси додають `endpoint_id` і `service_name`.
- Операції додають `service_id`, `operation_name`, `operation_mode`,
  `handler_binding_kind`, `handler_target_reference`, `handler_binding`,
  `deadline_policy`, `idempotency_policy`, `cancellation_policy`,
  `retry_policy`, `boundary_policy`, `metadata`.
- Знімки викликів сервісів додають `caller_namespace`, ID workflow викликача
  й пов'язаного workflow, `status`, `resolved_binding_kind`,
  `resolved_target_reference`, посилання payload, знімки політик і час
  життєвого циклу: `accepted_at`, `started_at`, `completed_at`, `failed_at`, `cancelled_at`.

Запити create/update операцій мають ті самі поля JSON, що й відповіді.
`operation_mode` має бути `sync` чи `async`. `handler_binding_kind`:
`start_workflow`, `signal_workflow`, `update_workflow`, `query_workflow`,
`activity_execution` чи `invocable_http`. Нова операція має містити
`handler_target_reference` або непорожній payload `handler_binding`.

Delete відхиляється з HTTP `409` та іменованою причиною за наявних залежностей:
`endpoint_has_services`, `service_has_operations`, `operation_has_service_calls`.

## Адаптери bridge {#bridge-adapters}

Адаптери bridge є обмеженими endpoint приймання даних. Вони передають події
до площини керування й повертають іменований результат без виконання коду workflow.

| Метод | Шлях | Призначення |
| --- | --- | --- |
| `POST` | `/api/bridge-adapters/webhook/{adapter}` | Запустити workflow, надіслати signal чи update з події формату webhook. |

Приклад:

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/bridge-adapters/webhook/stripe" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "start_workflow",
    "idempotency_key": "evt_1001",
    "target": {
      "workflow_type": "orders.fulfillment",
      "task_queue": "orders",
      "business_key": "order-1001"
    },
    "input": {"order_id": "order-1001"}
  }'
```

Використовуйте `outcome`, `reason`, `idempotency_key`, `control_plane_outcome`
замість висновків про поведінку лише за HTTP статусом.

## Протокол worker {#worker-protocol}

Маршрути worker вимагають ролі worker та
`X-Durable-Workflow-Protocol-Version: 1.0`. SDK worker використовують їх
усередині, а власні worker інших мов можуть реалізувати той самий протокол.

| Метод | Шлях | Призначення |
| --- | --- | --- |
| `POST` | `/api/worker/register` | Зареєструвати ідентичність worker, черги, типи workflow/activity, місткість, runtime і метадані збірки. |
| `POST` | `/api/worker/heartbeat` | Оновити видимість парку worker і факти сумісності. |
| `POST` | `/api/worker/workflow-tasks/poll` | Довго опитувати завдання workflow. |
| `POST` | `/api/worker/workflow-tasks/{taskId}/history` | Отримати історію орендованого завдання workflow сторінками. |
| `POST` | `/api/worker/workflow-tasks/{taskId}/heartbeat` | Надіслати heartbeat орендованого завдання workflow. |
| `POST` | `/api/worker/workflow-tasks/{taskId}/complete` | Завершити завдання workflow командами. |
| `POST` | `/api/worker/workflow-tasks/{taskId}/fail` | Повідомити помилку завдання workflow. |
| `POST` | `/api/worker/query-tasks/poll` | Довго опитувати завдання query, маршрутизовані Server. |
| `POST` | `/api/worker/query-tasks/{queryTaskId}/complete` | Завершити завдання query. |
| `POST` | `/api/worker/query-tasks/{queryTaskId}/fail` | Повідомити помилку чи відхилити завдання query. |
| `POST` | `/api/worker/activity-tasks/poll` | Довго опитувати завдання activity. |
| `POST` | `/api/worker/activity-tasks/{taskId}/heartbeat` | Надіслати heartbeat орендованого завдання activity. |
| `POST` | `/api/worker/activity-tasks/{taskId}/complete` | Завершити завдання activity. |
| `POST` | `/api/worker/activity-tasks/{taskId}/fail` | Повідомити помилку завдання activity. |

Worker мають сприймати ID lease, спроб, завдань та endpoint heartbeat як
непрозорі значення, видані Server. Застарілий lease чи неправильний ID
повертає іменовану помилку протоколу worker замість мовчазного завершення роботи.

Якщо `worker_protocol.server_capabilities.poll_status = true`, кожна відповідь
poll завдань workflow, activity і query містить машиночитаний `poll_status`.
Перевіряйте його перед полями payload конкретного маршруту:

| `poll_status` | Типовий HTTP статус | Значення |
| --- | --- | --- |
| `leased` | `200` | Server орендував завдання, `task` містить його payload. |
| `empty` | `200` | До повернення poll не було готового відповідного завдання. |
| `throttled` | `200` | Черга видима, але ліміти допуску lease чи dispatch не дали нового завдання. |
| `unavailable` | `503` або `200` | Server не зміг безпечно скоординувати poll черги й повернув типізовану недоступність замість удавати порожню чергу. |
| `draining` | `409` | Зареєстрована група worker у drain. Server відхиляє новий lease з `reason: "worker_draining"`. |

## Видимість парку й черг завдань {#fleet-and-task-queue-visibility}

Ці маршрути надають операторську діагностику парку worker і допуску черг.
Вони належать площині керування.

| Метод | Шлях | Призначення |
| --- | --- | --- |
| `GET` | `/api/workers` | Показати зареєстровані worker. |
| `GET` | `/api/workers/{workerId}` | Описати worker. |
| `DELETE` | `/api/workers/{workerId}` | Скасувати реєстрацію worker. |
| `GET` | `/api/task-queues` | Показати черги завдань і стан допуску. |
| `GET` | `/api/task-queues/{taskQueue}` | Описати місткість workflow/activity/query черги. |
| `GET` | `/api/task-queues/{taskQueue}/build-ids` | Показати build ID черги. |
| `POST` | `/api/task-queues/{taskQueue}/build-ids/drain` | Позначити групу build-id як draining для припинення отримання нових завдань. |
| `POST` | `/api/task-queues/{taskQueue}/build-ids/resume` | Зняти попередній drain для відновлення отримання нових завдань. |

Відповіді черг розрізняють відсутність worker, насичені слоти, ліміти
активних lease, бюджети dispatch і зворотний тиск query. Drain і resume
приймають JSON `{"build_id": "..."}` (або `{"build_id": null}` для
неверсіонованої групи), є ідемпотентними та зберігають намір оператора,
навіть після вилучення worker. Коли heartbeat worker бачить
`drain_intent: "draining"`, poll повертає HTTP `409` із `poll_status: "draining"`
і `reason: "worker_draining"` без оренди нових завдань.
[Розгортання build-id worker](/docs/polyglot/worker-build-id-rollout) описує
повний перехід від неверсіонованих до версіонованих worker, canary, drain і відкат.

## Schedule й атрибути пошуку {#schedules-and-search-attributes}

Маршрути schedule належать площині керування.

| Метод | Шлях | Призначення |
| --- | --- | --- |
| `GET` | `/api/schedules` | Показати schedule. |
| `POST` | `/api/schedules` | Створити schedule. |
| `GET` | `/api/schedules/{scheduleId}` | Описати schedule. |
| `PUT` | `/api/schedules/{scheduleId}` | Оновити специфікацію, дію, примітку, memo чи атрибути пошуку schedule. |
| `DELETE` | `/api/schedules/{scheduleId}` | Видалити schedule. |
| `POST` | `/api/schedules/{scheduleId}/pause` | Призупинити майбутні запуски. |
| `POST` | `/api/schedules/{scheduleId}/resume` | Відновити призупинений schedule. |
| `POST` | `/api/schedules/{scheduleId}/trigger` | Негайно запустити schedule. |
| `POST` | `/api/schedules/{scheduleId}/backfill` | Виконати backfill часового вікна. |
| `GET` | `/api/search-attributes` | Показати зареєстровані атрибути пошуку. |
| `POST` | `/api/search-attributes` | Зареєструвати атрибут пошуку. |
| `DELETE` | `/api/search-attributes/{name}` | Видалити атрибут пошуку. |

Назви й типи атрибутів пошуку є контрактом namespace. Не використовуйте
атрибути з великою кількістю унікальних значень для панелей чи міток метрик.

## Системні операції {#system-operations}

Системні маршрути вимагають admin. Це явні операторські проходи.
В автоматизації спочатку використовуйте status, а потім pass.

| Метод | Шлях | Призначення |
| --- | --- | --- |
| `GET` | `/api/system/health` | Повернути знімок безпечності розгортання й координації namespace у `health`. |
| `GET` | `/api/system/metrics` | Повернути обмежені метрики JSON. |
| `GET` | `/api/system/operator-metrics` | Повернути метрики оператора namespace для виконань, завдань, backlog, repair, worker і структурних меж. |
| `GET` | `/api/system/repair` | Перевірити backlog repair workflow. |
| `POST` | `/api/system/repair/pass` | Виконати один прохід repair workflow. |
| `GET` | `/api/system/activity-timeouts` | Перевірити backlog тайм-аутів activity. |
| `POST` | `/api/system/activity-timeouts/pass` | Виконати один прохід застосування тайм-аутів activity. |
| `GET` | `/api/system/retention` | Перевірити backlog очищення retention. |
| `POST` | `/api/system/retention/pass` | Виконати один прохід очищення retention. |

`/api/system/health` найшвидше показує достатність здоров'я namespace для
подальшого трафіку. Повертає `{namespace, health}`, де `health` містить
категоризовані перевірки безпечності розгортання, вкладений знімок
`health.operator_metrics` і зведення структурних меж.

`/api/system/operator-metrics` доповнює `/api/cluster/info` для namespace,
якщо потрібні точні backlog, вік блокування сумісності, деталі парку worker
чи інші метрики за зведеною поверхнею здоров'я.

`/api/system/metrics` є операторською поверхнею JSON, а не endpoint збору
Prometheus. Назви й виміри метрик обмежені політикою обмеженого росту Server.

## Контракт помилок {#error-contract}

Відповіді помилок мають HTTP статус і машиночитану іменовану причину.
Клієнти мають перевіряти `reason` чи вкладені причини control-plane/worker,
а не текст повідомлення.

Поширені статуси:

| Статус | Значення |
| --- | --- |
| `400` | Відсутній чи непідтримуваний заголовок протоколу/версії, неправильний query чи непідтримуваний метод маршруту. |
| `401` | Відсутня чи неправильна автентифікація. |
| `403` | Автентифікований token не має потрібної ролі. |
| `404` | Namespace, workflow, виконання, schedule, worker чи атрибут пошуку не знайдено. |
| `409` | Дублікат чи конфлікт, наприклад уже запущений workflow або неправильне цільове виконання. |
| `422` | Перевірка не пройшла. Відповідь містить деталі полів. |
| `429` | Місткість допуску чи черги завдань вичерпана. |
| `503` | Запит потрапив на вузол без потрібних ролей топології. Повертає `reason: "topology_role_unavailable"` та `current_shape`, `current_process_class`, `current_roles`, `required_roles`, `missing_roles`. Той самий статус із `reason: "workflow_v2_blocked"`, `blocked_by`, `remediation` охоплює start/mutation workflow, зміни schedule, bridge-adapter і worker за блокування bootstrap v2. Читання schedule (`GET /api/schedules`, `GET /api/schedules/{scheduleId}`, `GET /api/schedules/{scheduleId}/history`) доступне для перевірки під час відновлення. |
| `500` | Помилка Server. Повторюйте лише ідемпотентну операцію чи операцію з ключем ідемпотентності. |

Відповіді перевірки містять `reason: "validation_failed"` і `errors` чи
`validation_errors`. Відповіді команд workflow також відображають деталі
перевірки й операції у вкладеному `control_plane`.

## Дивіться також {#see-also}

- [Посібник Server](/docs/polyglot/server)
- [Namespace, автентифікація та реєстрація worker](/docs/polyglot/namespace-auth-workers)
- [Протокол worker](/docs/polyglot/worker-protocol)
- [Допуск черг завдань](/docs/polyglot/task-queue-admission)
- [Зовнішнє виконання](/docs/polyglot/external-execution)
- [Довідник команд CLI](/docs/polyglot/cli-reference)
