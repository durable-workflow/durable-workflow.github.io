---
sidebar_position: 6
title: Допуск черги завдань
description: Налаштування слотів worker, серверних бюджетів черг і зворотного тиску завдань query для окремого Server.
tags:
  - admission
  - operations
  - task-queues
  - bounded-growth
keywords:
  - допуск черги завдань
  - бюджет диспетчеризації
  - ліміти черги
  - обмежені черги worker
---

# Допуск черги завдань {#task-queue-admission}

Допуск черг не дозволяє одній черзі, орендарю або зовнішній залежності
вичерпати весь набір worker. Durable Workflow надає контроль трьох рівнів:

- реєстрації worker оголошують локальні слоти workflow та activity;
- Server може обмежувати активні оренди workflow та activity для
  простору імен і черги;
- Server може обмежувати диспетчеризацію workflow та activity за хвилину
  для простору імен і черги;
- Server може обмежувати диспетчеризацію за хвилину для іменованих
  бюджетних груп зовнішніх залежностей, спільних для кількох черг;
- завдання query мають обмежену чергу очікування, щоб синхронне читання
  швидко відмовляло замість необмеженого зростання.

Використовуйте ці засоби, коли черга залежить від служби з обмеженням
частоти, орендарі мають спільний Server або оператору потрібно
довести причину очікування workflow.

Допуск працює поверх контракту matching.
[Зіставлення й диспетчеризація завдань](/docs/polyglot/task-matching-dispatch)
описує виявлення й оренду готової роботи до рішення цих бюджетів
про допуск наступного завдання.

## Як застосовується бюджет {#how-the-budget-is-applied}

Опитування workflow та activity починається з worker, зареєстрованих
для простору імен і черги завдань. Кожен оголошує
`max_concurrent_workflow_tasks` і `max_concurrent_activity_tasks`.
Server підсумовує активні незастарілі worker для обчислення
зареєстрованої кількості слотів черги.

Серверні ліміти активних оренд і частоти диспетчеризації необов’язкові.
За їх налаштування Server перевіряє короткочасне блокування кешу перед
орендою наступного завдання workflow або activity. За вичерпаного
ліміту активних оренд опитування не повертає завдання замість
перевищення бюджету незавершеної роботи. За вичерпаного хвилинного
ліміту опитування не повертає завдання до появи місткості в наступній
хвилинній групі. Бюджетні групи залежностей застосовують ту саму
хвилинну поведінку до кожної черги простору імен зі спільною назвою
`dispatch_budget_group`.

Для query площина керування додає тимчасове завдання й очікує відповідь
worker. `DW_QUERY_TASK_MAX_PENDING_PER_QUEUE` обмежує кількість
незавершених query для кожного простору імен і черги. За повної черги
нові query повертають `query_task_queue_full` з HTTP `429`. Якщо сховище
кешу не надає блокування для зміни черги query, повертається
`query_task_queue_unavailable` з HTTP `503`.

## Навантаження повторів і бюджети downstream {#retry-load-and-downstream-budgets}

**Перші спроби й повтори враховуються однаково** в dispatch-лімітах queue, namespace і budget group. Ліміт охоплює успішно отримані спроби activity-task різних workflow, а не лише повтори. Заповнений ліміт залишає роботу чекати, сам по собі не провалюючи activity. Годинники schedule-to-start, schedule-to-close та строки workflow продовжують іти, тому очікування може вичерпати таймаут.

Dispatch-ліміт вимірює спроби за хвилину, а не частку успіхів чи здоров’я downstream. Він не відкриває circuit breaker. Одна спроба може зробити кілька HTTP-викликів через внутрішні повтори activity чи клієнта; обмежуйте їх окремо. Навіть швидко відхилена спроба витрачає claim без звернення до downstream.

Наприклад, у namespace `production` звичайні activity-черги `payments` і `refunds` ділять бюджет `payment-api` на 20 claim за хвилину. Задайте однаковий груповий ліміт усім чергам-учасникам; сторонні черги не входять до групи. Це межа хвилинного bucket, а не рівномірна швидкість чи зарезервована частка:

```bash
DW_TASK_QUEUE_ADMISSION_OVERRIDES='{
  "production:payments": {
    "activity_tasks": {
      "dispatch_budget_group": "payment-api",
      "max_dispatches_per_minute_per_budget_group": 20
    }
  },
  "production:refunds": {
    "activity_tasks": {
      "dispatch_budget_group": "payment-api",
      "max_dispatches_per_minute_per_budget_group": 20
    }
  }
}'
```

Поєднуйте Server-ліміт з обмеженими спробами й backoff activity. Приклад Python SDK 2.9.0 передбачає, що застосунок надає асинхронний спільний breaker і платіжний клієнт через `myapp.payments`; обмежте I/O й використовуйте стабільну ідемпотентність у клієнті. Зареєструйте `charge` на worker черги `payments` у `production`, а `PaymentWorkflow` — на його workflow worker:

```python
from durable_workflow import NonRetryableError, activity, workflow
from myapp.payments import breaker, payment_api

@activity.defn(name="payments.charge")
async def charge(order):
    if await breaker.is_open("payment-api"):
        raise NonRetryableError("payment-api breaker is open")
    return await payment_api.charge(order, idempotency_key=order["id"])

@workflow.defn(name="payments.order")
class PaymentWorkflow:
    def run(self, ctx, order):
        return (yield ctx.schedule_activity(
            "payments.charge", [order], queue="payments",
            retry_policy={"max_attempts": 3, "backoff_seconds": [2, 5]},
            start_to_close_timeout=10,
            schedule_to_start_timeout=30,
            schedule_to_close_timeout=90,
        ))
```

Відкритий breaker застосунку піднімає `NonRetryableError` до платежу; звичайні повторювані помилки можуть використати максимум три спроби із заданим backoff. Початкові таймаути можуть сплинути раніше. Workflow може перехопити остаточну помилку activity за бізнес-потреби; неперехоплена остаточна помилка може закрити workflow. Загальний строк workflow задавайте окремо.

Залишайте захищені downstream-виклики у **звичайних queued activity**. Inline local activity не створюють звичайного activity-task, тому queue/namespace/budget-group dispatch-ліміти activity їх не вимірюють. Prepared local claim перевіряє повноваження виконання, а не цей бюджет. Вбудований Laravel не має admission окремого Server; використовуйте власні засоби розгортання. Див. [local activity](../features/local-activities.md).

## Допуск запитів namespace {#namespace-request-admission}

Цей контракт стосується опублікованого **PHP Server 2.11.0**. Перевірте фактичний образ і [версійний довідник конфігурації](./server-config-reference.md#additional-published-php-controls). HTTP-бюджети namespace відокремлені від слотів worker, dispatch завдань, утримуваних worker polls і квот сталого стану. Бюджет належить namespace запиту, визначеному через `Durable-Workflow-Namespace` або `DW_DEFAULT_NAMESPACE`, навіть коли шлях адміністративного запиту називає інший namespace.

Автентифіковані запити, які дійшли до допуску namespace, враховуються для таких груп маршрутів control plane та керування, включно з вкладеними шляхами: `/api/namespaces`, `/api/storage`, `/api/workflows`, `/api/activities`, `/api/bridge-adapters`, `/api/workers`, `/api/worker-sessions`, `/api/task-queues`, `/api/deployments`, `/api/schedules`, `/api/search-attributes`, `/api/service-endpoints`, `/api/service-catalog`. Адміністративні маршрути у множині `/api/workers` враховуються.

Маршрути реєстрації, polling та результатів в однині `/api/worker/*` не використовують цей HTTP-бюджет. Health/readiness, `/api/cluster/info`, адміністративні `/api/system/*`, runtime credentials і транспорт зовнішніх payload також не проходять цей gate; їхні власні перевірки авторизації, місткості й сховища залишаються чинними. Відмови автентифікації, протоколу чи визначення namespace до цього middleware не збільшують лічильник.

Частота обмежується фіксованими хвилинними bucket за годинником Server, а не плавним чи рухомим вікном. Бюджет N може пропустити N запитів перед межею та ще N після неї. Подальші помилки запиту не скасовують облік; частота перевіряється перед одночасністю, тож відмова через одночасність може витратити хвилинний бюджет. Слот одночасності утримується до завершення запиту й cleanup; він не рахує запущені workflow.

Між API-репліками потрібні спільний Redis store/key prefix, синхронізований час і однакова завантажена конфігурація. Додавання реплік не множить спільний бюджет namespace. Локальний file cache координує лише процеси із сумісним доступом до запису файлів; це не базова конфігурація кількох вузлів. Обмеження утримуваних worker/query polls на вузол окремі. [Перезапускайте відповідні ролі після зміни середовища](./server-config-reference.md#how-changes-take-effect).

```dotenv
DW_NAMESPACE_MAX_REQUESTS_PER_MINUTE=100
DW_NAMESPACE_MAX_CONCURRENT_REQUESTS=8
DW_NAMESPACE_HARD_MAX_REQUESTS_PER_MINUTE=150
DW_NAMESPACE_HARD_MAX_CONCURRENT_REQUESTS=10
DW_NAMESPACE_ADMISSION_OVERRIDES='{"payments":{"max_requests_per_minute":200,"max_concurrent_requests":12},"reports":{"max_requests_per_minute":40,"max_concurrent_requests":3}}'
```

Для наявних namespace приклад дає `payments` 150 запитів/хвилину та 10 одночасних, `reports` — 40/3, іншим — 100/8. Перевизначення можуть підвищувати чи знижувати типові значення, але жорсткі межі 150/10 залишаються чинними. Конфігурація не створює namespace і не резервує пропускну здатність.

Для HTTP-параметрів відсутність значення не задає відповідної межі; жорстка межа сама по собі все одно може обмежувати. Перевизначення null повертає типове значення. Потрібні додатні цілі числа: нуль невалідний. Межі реалізації PHP — 10000000 запитів/хвилину та 1024 одночасних запити, незалежно від фактичної місткості HTTP-пулу. Опублікований PHP 2.11.0 мовчки трактує невалідний JSON `DW_NAMESPACE_ADMISSION_OVERRIDES` як порожні перевизначення й повертається до глобальних типових значень. Перевіряйте JSON до розгортання; якщо типові та жорсткі межі відсутні, задумана межа namespace зникає. Ця [підтверджена прогалина продукту](https://github.com/durable-workflow/durable-workflow.github.io/issues/335#issuecomment-6369150521) не закривається оновленням документації.

| Причина | HTTP | Підказка повтору, секунди |
| --- | --- | --- |
| `namespace_request_rate_exhausted` | `429` | До наступної хвилини, 1–60 |
| `namespace_request_concurrency_exhausted` | `429` | 1 |
| `namespace_request_admission_unavailable` | `503` | 1 |

JSON-поле `retry_after_seconds` узгоджене із заголовком `Retry-After`. Недоступність налаштованої координації чи невалідні числові межі дає закриту відмову 503. Адміністративні метрики namespace доступні й за вичерпаного бюджету звичайних запитів; `dw_namespace_request_admission_rejections` показує скінченний перелік причин. Використовуйте обмежені caller retry/backoff та ідемпотентність; невизначений транспортний результат не дозволяє автоматично повторювати запис. Див. [бюджети часу](../deployment.md#worker-long-poll-timeout-budgets).

## Квоти сталого стану namespace {#namespace-durable-state}

`DW_NAMESPACE_DURABLE_LIMITS` задає типові межі збережених рядків, `DW_NAMESPACE_DURABLE_OVERRIDES` змінює їх за namespace, а `DW_NAMESPACE_DURABLE_HARD_LIMITS` додає непереборні стелі. Порожні об’єкти не додають меж. Перевизначення можуть підвищувати чи знижувати типове значення; null повертає типове. На відміну від HTTP-допуску, нульова стала квота валідна та забороняє нові виділення. Тут наявний `payments` може мати 250 відкритих run, інші namespace — 100, за жорсткої межі 500.

```dotenv
DW_NAMESPACE_DURABLE_LIMITS='{"max_open_workflow_runs":100,"max_open_workflow_run_waits":200,"max_pending_workflow_timers":200}'
DW_NAMESPACE_DURABLE_HARD_LIMITS='{"max_open_workflow_runs":500}'
DW_NAMESPACE_DURABLE_OVERRIDES='{"payments":{"max_open_workflow_runs":250}}'
```

Використовуйте поля `max_<resource>` для наведених ресурсів. Рядки належать namespace-власнику або namespace пов’язаного workflow/run. Загальна кількість збережених рядків і відкриті/очікувані підмножини мають незалежні квоти. Перевірка читає авторитетні дані БД і серіалізує зміни блокуванням рядка namespace.

| Ресурс | Що враховується |
| --- | --- |
| `workflow_instances`, `workflow_runs` | Усі збережені рядки екземплярів/run workflow, включно з термінальними run. |
| `open_workflow_runs` | Run зі статусом `pending`, `running` або `waiting`. |
| `workflow_history_events`, `workflow_commands`, `workflow_tasks` | Збережені рядки історії, команд і завдань workflow. |
| `pending_workflow_tasks` | Готові рядки workflow tasks зі статусом `ready` у черзі; активні leases мають окремі обмеження. |
| `workflow_timers`, `pending_workflow_timers` | Усі збережені таймери та підмножина `pending` відповідно. |
| `workflow_run_waits`, `open_workflow_run_waits` | Усі збережені очікування run та підмножина `open` відповідно. |
| `schedules`, `schedule_history_events`, `worker_registrations` | Збережені schedules, їхня історія та реєстрації worker; застарілі реєстрації рахуються до видалення. |
| `workflow_streams`, `workflow_stream_items` | Рядки durable та inbound streams і рядки їхніх елементів. |

Батьківський workflow, що чекає child або service call, далі займає відкритий run у власному namespace. Child додає власний run; в одному namespace враховуйте обидва відкриті run та їхні очікування/таймери. Сервісна операція, що створює workflow, споживає рядки в його namespace; signal/update на наявному run не створює другий run автоматично. Межі сервісних викликів і зовнішніх payload — окремі параметри.

Вичерпання дає 429 `namespace_<resource>_exhausted`. Перевіряйте `retryable`: деякі квоти не допускають повтору та не мають підказки; повторювані сталі відмови вказують 60 секунд, не обіцяючи вільної місткості тоді. Неможливість оцінити налаштовану квоту дає 503 `namespace_durable_state_quota_unavailable` із підказкою в одну секунду. Тиск збережених рядків може вимагати retention або зміни місткості/конфігурації, а не швидкого циклу повторів.

Обирайте namespace заголовком запиту адміністративних метрик. `dw_namespace_durable_state_usage` і JSON-поля `limits`, `usage`, `remaining`, `configuration_status`, `measurement_status` показують цю область; namespace — контекст запиту, а не необмежена мітка метрик. Недоступні вимірювання не означають нульове використання чи необмежену місткість. Див. [повний довідник конфігурації](./server-config-reference.md#namespace-durable-controls).

## Налаштування Server {#server-configuration}

Задайте глобальні ліміти для однакової стелі кожної черги:

```bash
DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE=25
DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE=100
DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE=500
DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE=2000
DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE=600
DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE=1200
DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE=12000
DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE=24000
DW_QUERY_TASK_MAX_PENDING_PER_QUEUE=1024
```

Ліміти черги захищають одну чергу завдань. Ліміти простору імен
захищають загальний обсяг усіх його черг. Це корисно, коли орендар
може розділити роботу на багато черг, але використовує одну зовнішню
квоту. Ліміти бюджетної групи захищають іменовану залежність у вибраних
чергах без сповільнення всіх черг простору імен.

Використовуйте `DW_TASK_QUEUE_ADMISSION_OVERRIDES` для інших бюджетів
окремих черг чи просторів імен. Ключі перевіряються в порядку
`namespace:task_queue`, `namespace:*`, `task_queue`, потім `*`.

```bash
DW_TASK_QUEUE_ADMISSION_OVERRIDES='{
  "production:payments": {
    "workflow_tasks": {
      "max_active_leases_per_queue": 8,
      "max_dispatches_per_minute": 120,
      "dispatch_budget_group": "downstream-openai",
      "max_dispatches_per_minute_per_budget_group": 600
    },
    "activity_tasks": {
      "max_active_leases_per_queue": 12,
      "max_dispatches_per_minute": 240
    }
  },
  "production:*": {
    "workflow_tasks": {
      "max_active_leases_per_namespace": 300,
      "max_dispatches_per_minute_per_namespace": 6000
    },
    "activity_tasks": {
      "max_active_leases_per_namespace": 1200,
      "max_dispatches_per_minute_per_namespace": 12000
    }
  },
  "email": {
    "activity_tasks": {
      "max_active_leases_per_queue": 4,
      "max_dispatches_per_minute": 60,
      "dispatch_budget_group": "downstream-sendgrid",
      "max_dispatches_per_minute_per_budget_group": 300
    }
  },
  "*": {
    "workflow_tasks": { "max_active_leases_per_queue": 50 }
  }
}'
```

Значення перевизначення також приймає `max_active_leases` як псевдонім
`max_active_leases_per_queue` і `budget_group` як псевдонім
`dispatch_budget_group`.

Кеш має підтримувати атомарні блокування для серверних лімітів
активних оренд, частоти диспетчеризації та допуску query. Лічильники
частоти є короткочасними хвилинними групами лише для обмежених черг,
які фактично орендують завдання. Для багатовузлового розгортання
рекомендований Redis.

## Реєстрація слотів worker {#worker-slot-registration}

Щоб виділити незалежні ресурси процесів для Python-обробників workflow та
activity, використовуйте
[приклад окремих worker](https://python.durable-workflow.com/guides/separate-workers/)
англійською мовою. Розділяйте ролі списками зареєстрованих обробників. Обидва
значення паралельності мають залишатися додатними. Серверні ліміти обмежують
сукупне навантаження всіх процесів.

Worker Python надають локальні семафори через `Worker(...)` і
надсилають ті самі значення під час реєстрації:

```python
worker = Worker(
    client,
    task_queue="payments",
    workflows=[PaymentWorkflow],
    activities=[charge_card, send_receipt],
    max_concurrent_workflow_tasks=8,
    max_concurrent_activity_tasks=12,
)
```

Власні worker HTTP надсилають поля слотів до `POST /api/worker/register`:

```json
{
  "worker_id": "payments-python-1",
  "task_queue": "payments",
  "runtime": "python",
  "supported_workflow_types": ["payments.PaymentWorkflow"],
  "supported_activity_types": ["payments.charge_card", "payments.send_receipt"],
  "max_concurrent_workflow_tasks": 8,
  "max_concurrent_activity_tasks": 12
}
```

Слоти worker самі не є жорстким бюджетом орендаря. Вони описують
поточну здатність активних worker обробляти роботу. Додайте серверні
ліміти для стелі всієї черги, що діє після розгортання додаткових worker.

## Перегляд допуску {#inspect-admission}

Під час діагностики використовуйте CLI:

```bash
dw task-queue:list
dw task-queue:describe payments
dw task-queue:describe payments --json | jq '.admission'
```

Server надає ті самі дані через:

- `GET /api/task-queues`
- `GET /api/task-queues/{name}`

Payload допуску має три розділи:

```json
{
  "workflow_tasks": {
    "status": "throttled",
    "active_worker_count": 3,
    "configured_slot_count": 24,
    "leased_count": 8,
    "ready_count": 5,
    "available_slot_count": 16,
    "server_max_active_leases_per_queue": 8,
    "server_active_lease_count": 8,
    "server_remaining_active_lease_capacity": 0,
    "server_max_active_leases_per_namespace": 300,
    "server_namespace_active_lease_count": 149,
    "server_remaining_namespace_active_lease_capacity": 151,
    "server_max_dispatches_per_minute": 120,
    "server_dispatch_count_this_minute": 120,
    "server_remaining_dispatch_capacity": 0,
    "server_max_dispatches_per_minute_per_namespace": 6000,
    "server_namespace_dispatch_count_this_minute": 3520,
    "server_remaining_namespace_dispatch_capacity": 2480,
    "server_dispatch_budget_group": "downstream-openai",
    "server_max_dispatches_per_minute_per_budget_group": 600,
    "server_budget_group_dispatch_count_this_minute": 600,
    "server_remaining_budget_group_dispatch_capacity": 0,
    "server_lock_required": true,
    "server_lock_supported": true,
    "budget_source": "worker_registration.max_concurrent_workflow_tasks",
    "server_budget_source": "server.admission.queue_overrides"
  },
  "activity_tasks": {
    "status": "accepting",
    "configured_slot_count": 36,
    "server_max_active_leases_per_queue": 12,
    "server_remaining_active_lease_capacity": 4,
    "server_max_dispatches_per_minute": 240,
    "server_remaining_dispatch_capacity": 197
  },
  "query_tasks": {
    "status": "accepting",
    "max_pending_per_queue": 1024,
    "approximate_pending_count": 7,
    "remaining_pending_capacity": 1017,
    "lock_supported": true,
    "budget_source": "server.query_tasks.max_pending_per_queue"
  }
}
```

## Довідник статусів {#status-reference}

| Розділ | Статус | Значення |
|---------|--------|---------|
| Workflow/activity | `accepting` | Активні worker мають вільні слоти, жоден серверний ліміт не вичерпаний. |
| Workflow/activity | `throttled` | Необов’язковий серверний ліміт активних оренд або диспетчеризації за хвилину вичерпаний. |
| Workflow/activity | `saturated` | Усі зареєстровані слоти worker орендовані, навіть без серверного ліміту. |
| Workflow/activity | `no_slots` | Активні worker зареєстрували нуль слотів цього виду завдання. |
| Workflow/activity | `no_active_workers` | Жоден активний незастарілий worker не опитує чергу. |
| Workflow/activity | `unavailable` | Налаштований серверний ліміт потребує недоступного блокування кешу. |
| Query | `accepting` | Черга незавершених завдань query має вільну місткість. |
| Query | `full` | Завдання query досягли `DW_QUERY_TASK_MAX_PENDING_PER_QUEUE`. Нові query повертають HTTP `429`. |
| Query | `unavailable` | Черга query не може отримати блокування кешу. Нові query повертають HTTP `503`. |

## Підхід до налаштування {#tuning-pattern}

1. Почніть зі слотів worker відповідно до процесу: кількість завдань
   workflow з навантаженням CPU зазвичай нижча за activity з інтенсивним I/O.
2. Додайте ліміти активних оренд для черг, яким потрібна спільна
   стеля незавершеної роботи всіх worker.
3. Додайте ліміти активних оренд простору імен, якщо орендар може
   створювати багато черг, але потребує загальної стелі.
4. Додайте хвилинні ліміти диспетчеризації черг, що захищають API
   з обмеженням частоти, пул бази даних, орендаря або стару службу
   від сплесків навіть за вільних слотів worker.
5. Додайте ліміти бюджетних груп для кількох черг однієї залежності,
   залишаючи потік непов’язаних черг простору імен.
6. Додайте ліміти диспетчеризації простору імен, коли зовнішня квота
   діє для всього орендаря.
7. Переглядайте `dw task-queue:describe <queue>` під навантаженням.
   `saturated` означає потребу додаткової місткості worker або меншого
   fan-out workflow. `throttled` означає дію ліміту активних оренд чи
   частоти. `no_active_workers` означає відсутність здорового poller черги.
8. Залишайте місткість query достатньою для звичайного читання оператора,
   але обмеженою для швидкої відмови під час інцидентів. Переповнення
   query є зворотним тиском, а не втратою даних.

## Пов’язані посібники {#related-guides}

- [Server](/docs/polyglot/server)
- [CLI](/docs/polyglot/cli)
- [Python SDK](/docs/polyglot/python)
- [Протокол worker](/docs/polyglot/worker-protocol)
