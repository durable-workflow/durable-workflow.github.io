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
