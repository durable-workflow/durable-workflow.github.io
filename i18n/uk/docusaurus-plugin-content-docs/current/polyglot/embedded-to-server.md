---
sidebar_position: 1
title: Міграція з embedded до Server
description: Перехід Laravel embedded v2 на окремий Durable Workflow Server.
---

# Міграція з embedded до Server {#embedded-to-server-migration}

Ця настанова призначена для команд, які вже запускають Durable Workflow v2
всередині Laravel-застосунку й переводять нові workflows на окремий Server.
Якщо застосунок ще використовує v1, почніть із
[міграції на 2.0](/docs/migration) та залиште наявні runs v1
на рушії v1 до завершення.

Спочатку прочитайте [інтеграцію Laravel та перехід між runtime](/docs/laravel-adoption/),
якщо кінцевий режим ще не вибрано або інтеграція з Laravel є частиною рішення.
Ця сторінка описує самостійно розгорнутий Server після цього вибору,
а не міграцію до Cloud.

Міграція є шляхом інтеграції, а не переміщенням бази даних на місці.
Окремий Server відповідає за нові запуски площини керування, durable-історію,
schedules, реєстрацію workers і доставку tasks через HTTP.
Workers вашого застосунку й далі відповідають за код workflow та activity.

<div
  data-public-payload-codec-contract="avro-only"
  data-payload-codec="avro"
  data-authority-manifest="https://durable-workflow.github.io/sdk-neutrality-contract.json"
  data-legacy-v1-import-drain="internal">
  Durable Workflow 2.0 має один публічний codec payload: <code data-payload-codec-field="codec">avro</code>.
  JSON є транспортом HTTP-документа, а не codec durable payload. PHP-only readers v1
  залишаються внутрішньою частиною import/drain і не можуть використовуватися
  для нових runs v2. Дивіться <a href="/docs/polyglot/avro-value-protocol/">протокол Avro Value</a>.
</div>

Ця настанова описує самостійно розгорнуту міграцію. Вона не перетворює
embedded-розгортання на Cloud namespace, а отриманий Server не підключений
до Durable Workflow Cloud. Окремий вибір керованого сервісу описано в
[керованому Cloud runtime](/docs/polyglot/cloud-control-plane).

## Поточні межі {#current-boundary}

Зараз підтримується:

- Запуск нових workflows через API площини керування Server або CLI.
- Реєстрація PHP, Python, Rust чи власних HTTP workers на Server.
- Polling та завершення workflow й activity tasks через worker-протокол.
- Імпорт допустимих exports історії embedded v2 у Server як стан workflow,
  керований Server.
- Експорт історії закритих runs embedded v2 або Server v2 для аудиту,
  налагодження та передачі до архіву.
- Спостереження за керованими Server workflows через API Server, CLI
  та SDK, які читають стан Server, або окремий
  [Waterline service mode](/docs/monitoring#waterline-service)
  з підключенням через PHP SDK. Пакет Waterline в початковому
  Laravel-застосунку продовжує читати лише стан того embedded runtime.

Зараз не підтримується як автоматична операція:

- Переміщення runs v1 до Server.
- Replay історії v1 workers, що не використовують PHP.

Плануйте cutover так, щоб runs v1 завершилися там, де почалися.
Runs embedded v2 можна завершити на місці або перемістити
через процедуру import нижче.

## Контракт режимів розгортання {#deployment-mode-contract}

Закріплене порівняння embedded і service наведено в
[режимах розгортання](/docs/polyglot/deployment-modes).
Ця настанова додає до спільного контракту чотири правила cutover:

- Наявні embedded runs продовжують виконання там, де почалися.
- Нові керовані Server runs використовують сталі ключі типів, назви
  namespaces, task queues і контракт payload Avro від першого cutover.
- Signals, queries, updates, repair, cancel, terminate та archive
  мають спрямовуватися до runtime, який володіє цільовим run.
- Кожне розгортання Waterline має залишатися підключеним до runtime
  та namespace, які спостерігає. Воно не об'єднує embedded і Server runs.

## Інваріанти cutover {#cutover-invariants}

Зберігайте ці правила протягом усієї міграції:

- Налаштуйте Server як явну віддалену залежність: задайте base URL,
  namespace, task queue та облікові дані прямо замість виведення
  їх із локальних налаштувань Laravel-застосунку.
- Зберігайте сталі workflow IDs, правила вибору run, ключі типів workflow/activity,
  тег codec payload (`avro`) та маркери сумісності в обох runtimes.
- Спрямовуйте signals, queries, updates, repair, cancel, terminate та archive
  до runtime, який володіє цільовим run.
- Перед імпортом embedded run призупиніть embedded workers на час експорту
  спокійного стану без leased workflow/activity tasks і активної спроби activity.
- Мовна незалежність є частиною контракту міграції: керовані Server workflows
  використовують сталі aliases і закріплену schema Avro Value замість
  PHP-only назв класів чи форматів payload.

## Етап A: підготовка embedded v2 {#phase-a-prepare-embedded-v2}

Перед розгортанням Server переведіть embedded-застосунок на мовно-незалежні
контракти. Це зменшує обсяг змін коду під час cutover.

1. Визначте сталі ключі типів workflow та activity.

   ```php
   // config/workflows.php
   'v2' => [
       'types' => [
           'workflows' => [
               'orders.process' => App\Workflows\ProcessOrderWorkflow::class,
           ],
           'activities' => [
               'orders.reserve-inventory' => App\Activities\ReserveInventory::class,
               'orders.capture-payment' => App\Activities\CapturePayment::class,
           ],
       ],
   ],
   ```

2. Використовуйте ці ключі на кожній зовнішній межі.

   Клієнти Server надсилають `workflow_type: "orders.process"`, а workers
   реєструють `supported_workflow_types` / `supported_activity_types`
   із тими самими рядками. Не робіть PHP FQCNs durable-публічним контрактом.

3. Використовуйте контракт payload Avro v2.

   ```php
   // config/workflows.php
   'serializer' => 'avro',
   ```

   Avro обов'язковий для нових embedded і керованих Server workflows v2.
   Старий PHP reader можна залишити лише всередині import/drain v1,
   поки завершуються старі runs v1.

4. Виберіть назви namespace і task queue.

   Виберіть назви, які залишатимуться сталими протягом переходу з embedded до Server:

   ```bash
   export DURABLE_WORKFLOW_NAMESPACE=production
   export DURABLE_WORKFLOW_TASK_QUEUE=orders
   ```

5. Вирішіть, чи потрібні маркери сумісності.

   Розгортання з одним fleet може не задавати сумісність.
   Стандартні механізми rollout v2: canary, drain, rollback і replay-debug,
   діють у межах одного сталого контракту v2. Окремого шляху інтеграції
   «mixed-fleet v2» немає. Якщо під час переходу embedded до Server
   з'являється вікно різних builds, установіть `DW_V2_CURRENT_COMPATIBILITY`
   і `DW_V2_SUPPORTED_COMPATIBILITIES` до cutover, щоб новий build
   не отримував runs несумісного build протягом цього вікна.

## Етап B: розгортання Server поруч із embedded {#phase-b-deploy-the-server-beside-embedded}

Запустіть окремий Server поруч із Laravel-застосунком,
поки застосунок продовжує обробляти наявні embedded runs.

```bash
git clone https://github.com/durable-workflow/server.git
cd server
cp .env.example .env
docker compose up -d
```

Для локальної розробки можна задати `DW_AUTH_DRIVER=none`.
У спільних середовищах використовуйте облікові дані з окремими ролями:

```bash
DW_AUTH_DRIVER=token
DW_WORKER_TOKEN=worker-secret
DW_OPERATOR_TOKEN=operator-secret
DW_ADMIN_TOKEN=admin-secret
```

Перевірте discovery і створіть namespace:

```bash
export SERVER=http://localhost:8080
export ADMIN_TOKEN=admin-secret
export OPERATOR_TOKEN=operator-secret

curl "$SERVER/api/health"

curl "$SERVER/api/cluster/info" \
  -H "Authorization: Bearer $OPERATOR_TOKEN"

curl -X POST "$SERVER/api/namespaces" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"name":"production","description":"Production workflows","retention_days":30}'
```

Server відхиляє запити площини керування без
`X-Durable-Workflow-Control-Plane-Version: 2`.
Workers використовують окремий заголовок
`X-Durable-Workflow-Protocol-Version: 1.0`.

## Етап C: підключення workers {#phase-c-connect-workers}

Workers мають зареєструватися перед polling.
Реєстрація оголошує runtime, task queue та ключі типів,
які worker може виконувати.

```bash
export WORKER_TOKEN=worker-secret

curl -X POST "$SERVER/api/worker/register" \
  -H "Authorization: Bearer $WORKER_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Protocol-Version: 1.0" \
  -H "Content-Type: application/json" \
  -d '{
    "worker_id": "orders-php-1",
    "task_queue": "orders",
    "runtime": "php",
    "sdk_version": "<installed-sdk-version>",
    "supported_workflow_types": ["orders.process"],
    "supported_activity_types": [
      "orders.reserve-inventory",
      "orders.capture-payment"
    ],
    "max_concurrent_workflow_tasks": 10,
    "max_concurrent_activity_tasks": 50
  }'
```

Потім запустіть workers у Server mode для тих самих namespace і task queue.
Python workers дотримуються того самого контракту реєстрації та poll
через Python SDK. Власні workers можуть безпосередньо використовувати
[worker-протокол](/docs/polyglot/worker-protocol).

Перевірте огляд стану перед cutover:

```bash
curl "$SERVER/api/workers" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"

curl "$SERVER/api/task-queues/orders" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

## Етап D: спрямування нових запусків до Server {#phase-d-route-new-starts-to-the-server}

Переводьте по одному сімейству workflow. Залишайте embedded-застосунок
і queue workers активними для старих runs до їхнього завершення.

Спочатку запустіть shadow workflow:

```bash
curl -X POST "$SERVER/api/workflows" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "orders-shadow-1001",
    "workflow_type": "orders.process",
    "task_queue": "orders",
    "input": [{"order_id":"1001","mode":"shadow"}]
  }'
```

Спостерігайте за run:

```bash
curl "$SERVER/api/workflows/orders-shadow-1001" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

Після успішної перевірки shadow-сценарію переведіть production-ініціатора
з `WorkflowStub::start()` на клієнт Server, CLI або прямий HTTP API.
Залиште signals, queries, updates, cancel і terminate спрямованими
до runtime, який почав workflow. Embedded workflow має отримувати
embedded-команди, а workflow Server — команди площини керування Server.

## Етап E: імпорт допустимих runs embedded v2 {#phase-e-import-eligible-embedded-v2-runs}

Використовуйте export історії як формат імпорту.
Embedded runtime залишається джерелом істини для набору.
Server перевіряє його, записує durable-рядки в одній транзакції
та відновлює з них свої projections.

Допустимість:

- Schema набору має бути `durable-workflow.v2.history-export`
  із `schema_version: 1`.
- Початковий run має належати embedded v2, а export має містити
  `workflow.source_runtime: "embedded"`. Історія v1 не входить до області.
- Нетермінальний run має бути поточним embedded run.
- Термінальний run має містити `history_complete: true`.
- Набори з redaction відхиляються.
- Leased workflow tasks, leased activity tasks та активні спроби activity
  відхиляються. Призупиніть workers або дочекайтеся спливу leases
  й експортуйте знову.

Правила джерела істини import:

- `history_events` копіюються як авторитетний журнал replay та аудиту.
- Ідентичність workflow, payload, команди, signals, updates, tasks,
  виконання activities, timers, помилки й зв'язки lineage відновлюються з набору.
- Projections зведень, waits, timers, timeline та lineage Server відновлюються
  після import. Рядки projection не є джерелом повноважень import.
- Незавершені workflow tasks залишаються доступними для claim сумісним workers Server.
- Незавершені виконання activity та готові activity tasks залишаються
  доступними для claim сумісним activity workers Server.
- Незавершені timers зберігають timestamp `fire_at` і доступні
  для repair/recovery timers Server.

Помилки та rollback:

- Import повністю виконується або не виконується в одній транзакції бази.
- Якщо процес завершується або перевірка не проходить до commit,
  на Server не залишається часткового стану run.
- Повторний import того самого набору ідемпотентний за `run_id` та `dedupe_key`.
- Якщо інший run Server уже володіє тим самим `run_id`, import відхиляється.

Огляд та аудит:

- Імпортовані runs надають `engine_source: embedded_v2_import`
  у списках і деталях Server.
- Durable-рядок run записує `import_source=embedded_v2`, `import_id`,
  `import_dedupe_key`, `import_contract_version` та `imported_at`.

Процедура оператора:

Для runs embedded v2:

```bash
php artisan workflow:v2:history-export order-123 \
  --output=storage/workflow-history/order-123.json \
  --pretty
```

Виконайте dry run import на Server:

```bash
php artisan workflow:v2:history-import storage/workflow-history/order-123.json \
  --namespace=production \
  --dry-run \
  --json
```

Імпортуйте набір:

```bash
php artisan workflow:v2:history-import storage/workflow-history/order-123.json \
  --namespace=production \
  --import-id=orders-cutover-2026-05-05
```

Або викличте HTTP endpoint оператора:

```bash
curl -X POST "$SERVER/api/workflows/import/embedded-v2" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  --data-binary @order-123-import-request.json
```

де `order-123-import-request.json` містить:

```json
{
  "import_id": "orders-cutover-2026-05-05",
  "bundle": {
    "schema": "durable-workflow.v2.history-export",
    "schema_version": 1,
    "workflow": {
      "source_runtime": "embedded"
    }
  }
}
```

Об'єкт `bundle` вище скорочено. Передавайте повний JSON-документ
`workflow:v2:history-export`.

Для керованих Server runs, які потрібно лише зберегти або перевірити:

```bash
curl "$SERVER/api/workflows/order-123/runs/$RUN_ID/history/export" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  > order-123-history.json
```

Архівуйте термінальні runs Server після export, щоб
виключити їх з retention pruning:

```bash
curl -X POST "$SERVER/api/workflows/order-123/archive" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"reason":"history exported to archive storage"}'
```

## Етап F: додавання polyglot workers {#phase-f-add-polyglot-workers}

Коли сімейство workflow працює через Server, додайте Python, Rust
чи власні workers, зареєструвавши ті самі namespace, task queue та ключі типів.
Кожен публічний payload v2 використовує `avro`.
Зберігайте вхідні дані й результати activity мовно-незалежними:
масиви, об'єкти, рядки, числа, булеві значення та null.

Використовуйте [настанову Python SDK](/docs/polyglot/python)
або [настанову Rust SDK](/docs/polyglot/rust).
Для прямих HTTP-реалізацій використовуйте
[довідник worker-протоколу](/docs/polyglot/worker-protocol).

## Перевірка cutover {#cutover-checklist}

- [ ] Runs v1 завершені або навмисно залишені на рушії v1.
- [ ] Embedded v2 використовує сталі ключі типів, а не PHP FQCNs, на зовнішніх межах.
- [ ] Кожен новий workflow v2 використовує єдиний публічний codec `avro`.
- [ ] `/api/health` та `/api/cluster/info` Server доступні й успішні з мережі розгортання.
- [ ] Цільовий namespace існує на Server.
- [ ] Workers реєструють очікувану task queue та підтримувані ключі типів.
- [ ] Shadow workflow запускається, отримується worker і досягає очікуваного стану.
- [ ] Оператори можуть перелічити workflows, оглянути task queues і реєстрації workers.
- [ ] Старі embedded-ініціатори призупинені чи переведені, щоб однакові бізнес-ключі
  не починалися в обох runtimes.
- [ ] Вибрані для import runs embedded v2 експортовані зі спокійного embedded runtime
  та проходять `workflow:v2:history-import --dry-run`.
- [ ] Імпортовані runs показують `engine_source: embedded_v2_import`
  та очікуваний `import_id` у деталях і списках Server.
- [ ] Закриті старі runs, яким потрібне лише зберігання, експортовані до durable-сховища.

## Діагностика {#troubleshooting}

| Симптом | Імовірна причина | Виправлення |
| --- | --- | --- |
| `missing_control_plane_version` | Клієнт викликав маршрут площини керування без заголовка v2 | Надсилайте `X-Durable-Workflow-Control-Plane-Version: 2` |
| `missing_protocol_version` | Worker викликав маршрут worker без заголовка worker-протоколу | Надсилайте `X-Durable-Workflow-Protocol-Version: 1.0` |
| `namespace_not_found` | Namespace не створений на Server | Створіть його через `POST /api/namespaces` |
| Polls worker не повертають task | Task queue, ключ типу, namespace чи маркер сумісності не збігається | Порівняйте payload запуску workflow, реєстрацію worker та огляд task queue |
| Worker не на PHP не може декодувати payload v1 | Run містить PHP-native історію v1 | Залиште run на внутрішньому PHP import/drain v1. Не спрямовуйте його до worker v2 |
| Старий workflow не відповідає на signal/query/update Server | Run почався в embedded mode | Надсилайте команди через embedded-застосунок до завершення run |
| Import відхиляє `tasks.leased_task_present` | Embedded export містить leased task | Призупиніть embedded workers, дочекайтеся звільнення чи завершення leases та експортуйте знову |
| Import повертає `already_imported` | Ті самі `run_id` і `dedupe_key` уже присутні на Server | Вважайте повторення успішним і перевірте run Server |
| Імпортований run видимий, але не отримує claim | Ключ типу worker, task queue, namespace чи маркер сумісності не відповідає імпортованому рядку | Порівняйте звіт import, деталі run і реєстрацію worker |

## Пов'язані настанови {#related-guides}

- [Налаштування Server](/docs/polyglot/server)
- [Worker-протокол](/docs/polyglot/worker-protocol)
- [Python SDK](/docs/polyglot/python)
- [Міграція на 2.0](/docs/migration)
