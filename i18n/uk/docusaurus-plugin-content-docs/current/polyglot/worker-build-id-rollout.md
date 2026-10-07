---
sidebar_position: 7
title: Оновлення build ID worker
description: Оновлення, canary, drain і відкат збірок worker без покинутих виконань через стан build ID окремого Server.
tags:
  - worker-protocol
  - operations
  - rollouts
  - build-ids
  - task-queues
keywords:
  - оновлення build id worker
  - drain збірки worker
  - відкат збірки worker
  - canary worker
  - перехід до версійованих worker
---

# Оновлення build ID worker {#worker-build-id-rollout}

Використовуйте цей довідник для переходу від worker без версії до
worker із позначкою збірки, canary нової збірки в черзі завдань,
drain старої збірки перед виведенням або відкату невдалої. Server
записує намір оператора поруч із живими рядками worker, тому наступне
опитування, опис CLI чи `list_task_queue_build_ids` правдиво показує
стан оновлення, навіть якщо старі worker зникли до завершення backlog.

Цей посібник описує керування групами. Повний контракт маршрутизації
наведено в [сумісності й маршрутизації worker](/docs/polyglot/worker-compatibility-routing):
незавершена робота має залишатися закріпленою за сумісними виконавцями,
а відсутність доступного сумісного worker є явним станом оператора.

Durable Workflow Server представляє оновлення однієї черги як набір
**груп build ID**. Група об’єднує всі реєстрації worker з однаковим
`build_id` у `POST /api/worker/register`. Worker без `build_id` утворюють
**групу без версії**, типову до оновлення, від якої відбувається
перший перехід.

## Стан оновлення, який записує Server {#rollout-state-the-server-records}

Кожна група `(namespace, task_queue, build_id)` має сукупний стан
worker — кількості active, draining, stale та загальну — і намір оператора:

| Поле | Призначення |
| --- | --- |
| `build_id` | Зареєстрована ідентичність збірки. `null` визначає групу без версії. |
| `rollout_status` | Сукупний стан прийняття нових завдань: `active`, `active_with_draining`, `draining`, `stale_only` або `no_workers`. |
| `drain_intent` | Намір оператора для групи: `active` або `draining`. |
| `drained_at` | Час першої позначки draining. Відсутній для активної групи. Повторні виклики drain не змінюють час. |
| `active_worker_count` | Живі worker, що зараз приймають нові завдання. |
| `draining_worker_count` | Живі worker, які ще мають незавершені завдання, але більше не забирають нову роботу. |
| `stale_worker_count` | Worker з останнім heartbeat раніше за межу застарілості. |
| `total_worker_count` | Сума трьох кількостей worker групи. |
| `runtimes`, `sdk_versions` | Унікальні рядки runtime та версій SDK, спостережені в групі. |
| `last_heartbeat_at`, `first_seen_at` | Вікно heartbeat групи для підтвердження неактивності перед видаленням. |

`drain_intent` стійкий: перезапуск worker, зупинка всіх worker або
застарівання групи не повертає його приховано до `active`. Лише явний
`POST .../build-ids/resume` очищає `drain_intent` і `drained_at`.
Це зберігає правдивий `rollout_status` навіть без живих worker групи.

## Перегляд оновлення {#inspect-the-rollout}

Перед drain чи видаленням збірки підтвердьте ще доступні групи черги:

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/task-queues/orders-critical/build-ids" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

Той самий знімок доступний у CLI оператора та Python SDK:

```bash
dw task-queue:build-ids orders-critical --json
```

```python
from durable_workflow import Client

async with Client("https://durable-workflow.example", token=operator_token) as client:
    rollout = await client.list_task_queue_build_ids("orders-critical")
    for cohort in rollout.build_ids:
        print(cohort.build_id, cohort.rollout_status, cohort.total_worker_count)
```

## Перший перехід: від worker без версії до версійованих {#first-cutover-unversioned-to-versioned}

Черга, яку завжди обслуговували worker без версії, повідомляє одну
групу `build_id: null` із `rollout_status: "active"`. Перший перехід
додає нову групу з позначкою збірки поруч із нею.

1. Розгорніть новий набір worker зі стабільним `build_id`, наприклад
   `orders-worker-2026-04-22`, через `POST /api/worker/register`.
2. Підтвердьте активність обох груп:

   ```bash
   dw task-queue:build-ids orders-critical --json
   ```

   Ви маєте побачити `null` і новий `build_id` із
   `rollout_status: "active"` та ненульовим `active_worker_count` кожного.
3. Почніть drain групи без версії після початку обробки роботи новими worker:

   ```bash
   dw task-queue:drain orders-critical --unversioned
   ```

   `drain_intent` групи без версії стає `draining`. Запущені worker
   обробляють поточні завдання, але припиняють забирати нові.
   Майбутні реєстрації чи heartbeat без `build_id` також потрапляють
   до draining.
4. Дочекайтеся нуля `active_worker_count` і `draining_worker_count`
   групи без версії. Вона залишається в списку з
   `drain_intent: "draining"` для підтвердження постійності переходу.

## Canary нової збірки {#canary-a-new-build}

Canary — друга збірка, що отримує малу частку трафіку, поки основна
продовжує обслуговування. Використовуйте окремий `build_id` для
окремого перегляду стану кожної групи.

1. Розгорніть worker canary із `build_id: orders-worker-2026-04-22-canary`.
2. Перегляньте `list_task_queue_build_ids` і підтвердьте
   `rollout_status: "active"` обох груп із потрібними кількостями worker.
3. Підвищте нову збірку, додаючи worker нового `build_id` і зменшуючи
   основну групу, або виведіть canary через drain:

   ```bash
   dw task-queue:drain orders-critical --build-id orders-worker-2026-04-22-canary
   ```

Server не керує розподілом завдань між групами. Оператори визначають
розміри груп і покладаються на розподіл опитування для ваги трафіку.
Стан оновлення build ID дозволяє підтвердити групи, здатні забирати
роботу, і почати чисте передавання, коли група готова зупинитися.

## Drain старої збірки {#drain-an-older-build}

Drain залишає вже орендовані завдання на старій збірці, спрямовуючи
нові до інших активних груп черги:

```bash
dw task-queue:drain orders-critical --build-id orders-worker-2026-04-21-z9
```

Server записує `drain_intent: "draining"` групи й позначає кожен
worker цього `build_id` як draining на наступному heartbeat.
Виклик ідемпотентний: повторення не скидає `drained_at`, тому
автоматизація може безпечно його повторювати.

Після позначки рядка worker `draining` маршрути опитування завдань
workflow, activity та query припиняють надавати нові оренди.
Опитування відмовляють з HTTP `409`, `poll_status: "draining"`
і `reason: "worker_draining"` до відновлення групи.

`draining` є частиною загального контракту відповіді опитування.
Той самий `poll_status` показує звичайні `leased` і `empty`,
результат допуску `throttled` і типізовані помилки координації
`unavailable` інших шляхів опитування.

Спостерігайте drain через `list_task_queue_build_ids` і зменшення
`active_worker_count` та `draining_worker_count` до нуля. Тоді група
показує `rollout_status: "draining"` із нульовими кількостями worker:
живих worker немає, а намір оператора все ще записує drain. Це
безпечний момент зупинки процесів worker і видалення артефакту збірки.

## Відкат невдалої збірки {#roll-back-a-bad-build}

Відкат виконує зворотний шлях: відновлює раніше спорожнену групу,
повертає до неї новий трафік і переводить невдалу збірку в drain.

1. Відновіть відому робочу групу:

   ```bash
   dw task-queue:resume orders-critical --build-id orders-worker-2026-04-21-z9
   ```

   Server очищає `drain_intent`, видаляє `drained_at` і негайно
   повертає до `active` рядки worker цього `build_id`, які ще
   надсилають heartbeat, щоб endpoint читання припинив показувати draining.
2. Переведіть невдалу групу в drain:

   ```bash
   dw task-queue:drain orders-critical --build-id orders-worker-2026-04-22
   ```

3. Збільште відому робочу збірку або розгорніть її знову, якщо worker
   уже зупинені. Worker, що реєструються з її `build_id`, отримують
   очищений намір drain і стають `active`.

Resume також ідемпотентний. Повторення для вже активної групи
нічого не змінює, тому автоматизований відкат може безпечно його викликати.

## Довідник endpoint і команд {#endpoints-and-commands-reference}

| Намір | Endpoint HTTP | CLI | Метод Python SDK |
| --- | --- | --- | --- |
| Перегляд стану груп | `GET /api/task-queues/{taskQueue}/build-ids` | `dw task-queue:build-ids` | `Client.list_task_queue_build_ids` |
| Позначити групу draining | `POST /api/task-queues/{taskQueue}/build-ids/drain` | `dw task-queue:drain` | `Client.drain_task_queue_build_id` |
| Відновити раніше спорожнену групу | `POST /api/task-queues/{taskQueue}/build-ids/resume` | `dw task-queue:resume` | `Client.resume_task_queue_build_id` |

Drain і resume приймають тіло JSON `{"build_id": "..."}` або
`{"build_id": null}` для групи без версії. CLI позначає її через
`--unversioned`, а іншу збірку через `--build-id <value>`.
Поєднання обох одразу відхиляється.

## Пов’язані довідники {#related-references}

- [Простори імен, автентифікація та реєстрація worker](/docs/polyglot/namespace-auth-workers)
  для `POST /api/worker/register`, що записує `build_id` кожного worker.
- [Допуск черги завдань](/docs/polyglot/task-queue-admission) для
  бюджетів слотів worker і диспетчеризації, що діють разом зі станом оновлення.
- [Довідник Server API](/docs/polyglot/server-api-reference) для
  повного списку маршрутів площини керування, потрібних ролей і
  заголовків протоколів.
- [Довідник команд CLI](/docs/polyglot/cli-reference) для форми
  аргументів і параметрів кожної підкоманди `dw task-queue:*`.
