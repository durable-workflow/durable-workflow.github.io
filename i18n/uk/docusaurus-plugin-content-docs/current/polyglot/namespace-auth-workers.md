---
sidebar_position: 4
title: Namespace, автентифікація та реєстрація worker
description: Довідник контрактів вибору namespace, автентифікації за ролями та реєстрації worker у Server.
tags:
  - server
  - namespaces
  - authentication
  - worker-protocol
keywords:
  - Durable Workflow namespace auth
  - токени Server для окремих ролей
  - контракт реєстрації worker
  - X-Namespace
---

# Namespace, автентифікація та реєстрація worker {#namespace-auth-and-worker-registration}

Використовуйте цей довідник під час підготовки окремого Server, видачі
облікових даних автоматизації або реалізації worker runtime.
Для виконання роботи потрібно узгодити три окремі контракти Server:

- запит визначає namespace через `X-Namespace`, `?namespace=` або
  стандартний namespace Server
- облікові дані мають роль, потрібну для цієї групи маршрутів
- workers реєструють ті самі namespace, task queue, runtime, ключі типів
  та місткість, які використовують запуск workflow і polling tasks

## Повноваження запиту {#request-authority}

Durable Workflow визначає повноваження запиту через namespace, роль
автентифікації та версію протоколу. Не виводьте їх з ідентифікаторів
workflow, tasks чи назв для відображення.

| Група запитів | Потрібна роль облікових даних | Потрібний заголовок версії | Джерело namespace |
| --- | --- | --- | --- |
| Discovery `GET /api/cluster/info` | `worker`, `operator` або `admin` | немає | необов'язковий `X-Namespace` для контексту |
| Список та опис namespaces | `operator` або `admin` | `X-Durable-Workflow-Control-Plane-Version: 2` | ціль маршруту або контекст запиту |
| Створення, зміна та політика зберігання namespace | `admin` | `X-Durable-Workflow-Control-Plane-Version: 2` | ціль маршруту або тіло запиту |
| Огляд workflows, schedules, task queues, bridge adapters та workers | `operator` або `admin` | `X-Durable-Workflow-Control-Plane-Version: 2` | `X-Namespace`, `?namespace=`, потім стандартний namespace |
| Стан системи, метрики, проходи обслуговування та тести сховища | `admin` | `X-Durable-Workflow-Control-Plane-Version: 2` | `X-Namespace`, `?namespace=`, потім стандартний namespace |
| Реєстрація worker, polling, heartbeats і завершення tasks | `worker` | `X-Durable-Workflow-Protocol-Version: 1.0` | `X-Namespace`, `?namespace=`, потім стандартний namespace |

На маршрутах із перевіркою ролі Server перевіряє роль перед існуванням
namespace. Токен із неправильною роллю отримує помилку автентифікації,
а не інформацію про існування namespace. Після успішної перевірки ролі
та версії маршрути в межах namespace відхиляють невідомі namespaces
з `reason: "namespace_not_found"`.

## Ролі автентифікації {#auth-roles}

Автентифікація токенами є стандартним production-варіантом:

```bash
DW_AUTH_DRIVER=token
DW_WORKER_TOKEN=worker-secret
DW_OPERATOR_TOKEN=operator-secret
DW_ADMIN_TOKEN=admin-secret
```

Якщо розгортання використовує один спільний `DW_AUTH_TOKEN`, цей токен
фактично має дозволи на всі маршрути. Для production віддавайте перевагу
токенам з окремими ролями, щоб процес worker не міг змінювати namespaces
чи запускати системне обслуговування.

Такий самий поділ ролей діє для автентифікації підписами:

```bash
DW_AUTH_DRIVER=signature
DW_WORKER_SIGNATURE_KEY=worker-signature-secret
DW_OPERATOR_SIGNATURE_KEY=operator-signature-secret
DW_ADMIN_SIGNATURE_KEY=admin-signature-secret
```

`DW_AUTH_DRIVER=none` призначений лише для локальної розробки.
Він прибирає межу автентифікації з усіх маршрутів. Такий Server
ніколи не слід відкривати за межами довіреної локальної мережі.

## Контракт namespace {#namespace-contract}

Bootstrap створює стандартний namespace. Установіть `DW_DEFAULT_NAMESPACE`,
якщо запити без заголовка namespace мають використовувати інший
namespace замість `default`:

```bash
DW_DEFAULT_NAMESPACE=default
```

Створюйте namespace кожного tenant або середовища перед підключенням
до нього клієнтів чи workers:

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/namespaces" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "orders-prod",
    "description": "production order workflows",
    "retention_days": 90
  }'
```

Назви namespace переводяться в нижній регістр і можуть містити літери,
цифри, крапку, підкреслення та дефіс. Після нормалізації вони мають бути
унікальними. Наприклад, створення `Production`, а потім `production`
спричиняє конфлікт із `reason: "namespace_already_exists"`.

Звичайний запуск workflow визначає namespace через `X-Namespace`:

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/workflows" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_type": "orders.fulfillment",
    "workflow_id": "order-1001",
    "task_queue": "orders",
    "input": ["order-1001"]
  }'
```

Читання площини керування, команди workflow, операції schedule,
операції search attributes, огляд task queues і workers використовують
той самий контекст namespace. Винятком є самі маршрути адміністрування
namespace: вони визначають namespace у маршруті або тілі запиту
й не вимагають, щоб він уже існував перед create чи describe.

## Контракт реєстрації worker {#worker-registration-contract}

Кожен процес worker має зареєструватися перед polling. Реєстрація прив'язана
до namespace, тому пара `(namespace, worker_id)` ідентифікує запис worker.
Зареєстрована `task_queue` має відповідати подальшим poll-запитам цього worker.

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/worker/register" \
  -H "Authorization: Bearer $DW_WORKER_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Protocol-Version: 1.0" \
  -H "Content-Type: application/json" \
  -d '{
    "worker_id": "py-orders-1",
    "task_queue": "orders",
    "runtime": "python",
    "sdk_version": "<installed-sdk-version>",
    "build_id": "orders-worker-2026-04-22",
    "supported_workflow_types": ["orders.fulfillment"],
    "workflow_definition_fingerprints": {
      "orders.fulfillment": "sha256:definition-fingerprint"
    },
    "supported_activity_types": ["payments.capture"],
    "max_concurrent_workflow_tasks": 10,
    "max_concurrent_activity_tasks": 50
  }'
```

| Поле | Обов'язкове | Контракт |
| --- | --- | --- |
| `worker_id` | ні | Стала ідентичність процесу. Server генерує її, якщо поле відсутнє, але довготривалим runtimes варто задавати його для логів і діагностики task queue. |
| `task_queue` | так | Черга, яку опитує worker. Poll-запит до іншої черги завершується з `reason: "task_queue_mismatch"`. |
| `runtime` | так | Одне зі значень `php`, `python`, `rust`, `typescript`, `go`, `java` або `external`. Прийняття ідентифікатора runtime не означає наявності офіційного SDK. |
| `sdk_version` | ні | Версія SDK runtime, видима в огляді workers і діагностиці. |
| `build_id` | ні | Ідентифікатор розгортання чи збірки для огляду build ID task queue та rollout-груп. Він має залишатися сталим для однієї групи workers із сумісним replay. |
| `supported_workflow_types` | ні | Ключі типів workflow, які worker може replay. Порожній список означає відсутність фільтра типів workflow. |
| `workflow_definition_fingerprints` | ні | Детерміновані fingerprints визначень кожного workflow. Повторну реєстрацію активного worker зі зміненим fingerprint відхиляють. |
| `supported_activity_types` | ні | Ключі типів activity, які worker може виконувати. Порожній список означає відсутність фільтра типів activity. |
| `max_concurrent_workflow_tasks` | ні | Оголошена кількість локальних слотів workflow tasks. Стандартне значення `100`, мінімальне `1`. |
| `max_concurrent_activity_tasks` | ні | Оголошена кількість локальних слотів activity tasks. Стандартне значення `100`, мінімальне `1`. |

Повторна реєстрація активного worker з тим самим ідентифікатором дозволена,
якщо оголошені fingerprints визначень не змінилися. Якщо активний worker
змінює код уже оголошеного типу workflow, він має перезапуститися з новим
`worker_id`. Інакше реєстрація завершується
з `reason: "workflow_definition_changed"`.

`build_id` є ідентифікатором групи, який оператор використовує
в rollout API task queue. Зберігайте один `build_id` для workers,
які можуть безпечно replay ту саму незавершену роботу, і змінюйте його,
коли rollout створює нову групу сумісності.
Контракт закріплення та rollback описано в
[сумісності workers і маршрутизації](/docs/polyglot/worker-compatibility-routing),
а процедуру drain/resume — у
[rollout за build ID worker](/docs/polyglot/worker-build-id-rollout).

## Polling та огляд стану {#polling-and-visibility}

Poll-запити worker мають використовувати ті самі namespace,
worker ID і task queue, що й реєстрація:

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/worker/workflow-tasks/poll" \
  -H "Authorization: Bearer $DW_WORKER_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Protocol-Version: 1.0" \
  -H "Content-Type: application/json" \
  -d '{
    "worker_id": "py-orders-1",
    "task_queue": "orders",
    "timeout_seconds": 30
  }'
```

Оператори можуть оглянути той самий стан реєстрації через
площину керування:

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/task-queues/orders" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" | jq '.pollers, .admission'
```

Коли workers не отримують tasks, спочатку перевірте огляд task queue.
Він розрізняє відсутність workers, невідповідність черги, непідтримувані
фільтри типів workflow/activity, зайняті слоти worker, серверні обмеження
активних leases, обмеження швидкості dispatch і backpressure query tasks.

Самі poll-відповіді надають той самий машиночитаний результат через
`poll_status`, коли Server оголошує
`worker_protocol.server_capabilities.poll_status = true`
у `GET /api/cluster/info`. Маршрути polling workflow tasks,
activity tasks і query tasks зберігають це поле навіть за `task: null`,
тому runtimes workers можуть використовувати одну сталу поверхню:

- `leased`: task успішно отримано в lease.
- `empty`: до повернення poll-відповіді не було готових tasks.
- `throttled`: обмеження приймання черги не дозволили видати новий task.
- `unavailable`: Server не міг безпечно координувати чергу й повернув
  типізований результат unavailable замість удаваної порожньої черги.
- `draining`: група build ID worker перебуває в drain, тому poll
  завершується з HTTP `409` та `reason: "worker_draining"`
  до відновлення групи.

## Помилки {#error-surface}

Автоматизація має розгалужуватися за названими reasons, а не за текстом повідомлень.

| Reason | Де | Значення | Дія оператора |
| --- | --- | --- | --- |
| `missing_control_plane_version` | маршрут площини керування | Запит не містить `X-Durable-Workflow-Control-Plane-Version: 2`. | Додайте заголовок версії або оновіть профіль клієнта. |
| `missing_protocol_version` | маршрут worker | Запит не містить `X-Durable-Workflow-Protocol-Version: 1.0`. | Виправте клієнт worker або узгодження версії SDK. |
| `namespace_not_found` | маршрут у межах namespace | Namespace із `X-Namespace`, query string чи стандартної конфігурації Server не існує. | Створіть namespace або виправте namespace клієнта. |
| `namespace_already_exists` | `POST /api/namespaces` | Нормалізована назва namespace вже існує. | Використайте її або виберіть іншу назву. |
| `task_queue_mismatch` | poll-маршрут worker | Worker, зареєстрований для однієї черги, намагався опитувати іншу. | Перезапустіть його з новим worker ID або опитуйте зареєстровану чергу. |
| `worker_draining` | poll-маршрут worker | Група build ID worker перебуває в drain. Вона може завершити поточну роботу, але не отримувати нові tasks. | Відновіть групу для rollback або зупиніть worker після завершення його поточних leases. |
| `workflow_definition_changed` | `POST /api/worker/register` | Активний worker ID намагався оголосити змінені fingerprints workflow. | Перезапустіть змінений процес із новим worker ID. |
| `validation_failed` | будь-який JSON-маршрут | Поле відсутнє, некоректне, завелике або поза дозволеними межами. | Прочитайте `errors` чи `validation_errors` та виправте payload. |

## Дивіться також {#see-also}

- [Довідник Server API](/docs/polyglot/server-api-reference)
- [Worker-протокол](/docs/polyglot/worker-protocol)
- [Приймання роботи task queue](/docs/polyglot/task-queue-admission)
- [Довідник команд CLI](/docs/polyglot/cli-reference)
