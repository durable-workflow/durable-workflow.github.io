---
sidebar_position: 4
title: Invocable HTTP carrier
description: Налаштування invocable_http carrier лише для activities, щоб Server міг POST leased activity task до HTTPS-обробника й узгодити структурований результат.
tags:
  - external-execution
  - invocable-carrier
  - worker-protocol
keywords:
  - invocable carrier
  - invocable_http
  - конфігурація зовнішнього виконавця
  - HTTP-обробник activity
  - оболонка вхідних даних external task
  - оболонка результату external task
---

# Invocable HTTP carrier {#invocable-http-carrier}

Invocable HTTP carrier є першим конкретним carrier, визначеним у межах
[зовнішнього виконання](./external-execution.md). Він публікується
в `GET /api/cluster/info` за шляхом
`worker_protocol.invocable_carrier_contract`
зі значеннями `schema: durable-workflow.v2.invocable-carrier.contract`,
`version: 1` та `carrier_type: invocable_http`.

Коли налаштоване зіставлення обробника визначає carrier `invocable_http`,
Server викликає його endpoint з незалежною від carrier
[оболонкою вхідних даних external task](./external-execution.md#published-contract-seams)
і узгоджує відповідь з
[оболонкою результату external task](./external-execution.md#published-contract-seams).
Workflow tasks, порядок signals/updates, replay і зміни історії
залишаються всередині Server. Carrier лише передає визначені оболонки
вхідних даних і результатів через межу HTTPS.

## Призначення {#what-it-is}

Invocable HTTP carrier призначений для роботи рівня activity, яку
операторська команда воліє розмістити як HTTPS-обробник замість long-poll worker:

- activities обслуговування та автоматизація платформи у внутрішньому HTTP-сервісі
- обмежені передачі роботи інтеграціям, які вже мають HTTPS endpoint
- serverless або контейнерні обробники activity з одним POST-маршрутом
  на тип activity

Виконання activity передається налаштованому endpoint.
Durable-стан workflow, історія та контракт завершення activity
залишаються відповідальністю Server.

## Область лише activities {#activity-only-scope}

Опублікований manifest закріплює область carrier як
`task_kinds: [activity_task]` і явно визначає те, чого він не робить,
щоб конфігурація не змінювала цю межу:

- `workflow_task_execution` — workflow tasks залишаються на справжніх workflow runtimes
- `workflow_replay` — carrier ніколи не replay історію workflow
- `history_mutation` — обробники не можуть безпосередньо змінювати історію подій
- `generic_webhook_ingress` — загальні вхідні webhooks проходять через bridge adapter

Зіставлення обробника з `kind`, відмінним від activity, або зіставлення carrier
з capability, відмінною від `activity_task`, не проходить перевірку
конфігурації з `invalid_invocable_carrier_scope` ще до появи
в activity poll-відповіді.

## HTTPS-ціль та метод {#https-target-and-method}

Server перевіряє `target_fields` carrier перед публікацією зіставлення:

| Поле | Обов'язкове | Дозволено | Примітки |
| --- | --- | --- | --- |
| `url` | так | абсолютний HTTPS URL або HTTP для локальної loopback-розробки (`localhost`, `127.0.0.0/8`, `::1`) | Облікові дані в URL (`scheme://user:pass@host`) заборонені. |
| `method` | ні | `POST` | Стандартно `POST`. Інші HTTP-методи не приймаються. |
| `timeout_seconds` | ні | ціле число 1–900 | Транспортний deadline однієї спроби обробника. Deadline task окремо контролює Server/runtime. |
| `retry_policy` | ні | об'єкт (дивіться нижче) | Транспортний retry budget carrier. |

Некоректні цілі відхиляються з `invalid_carrier_target`
і ніколи не потрапляють у discovery.

## Модель автентифікації {#auth-model}

Зіставлення `invocable_http` поза loopback мають отримати `auth_ref`
з конфігурації зовнішнього виконавця. Invocable HTTP без автентифікації
дозволений лише для loopback HTTP-цілей під час локальної розробки.

- `auth_refs` оголошуються один раз на верхньому рівні конфігурації
  та використовуються зі стандартних налаштувань або окремих зіставлень.
  Підтримувані типи: `profile`, `env`, `token_file`, `mtls` і `signed_headers`.
- Зіставлення з ціллю поза loopback без дієвого `auth_ref` не проходить
  перевірку конфігурації з `missing_invocable_auth_ref`.
- Токени, секрети, підписи та заголовки авторизації ніколи не виводяться
  в діагностиці кластера, `dw server:info` чи activity poll-відповіді.
  Діагностика зіставлення показує вибраний `auth_ref` і приховане
  зведення, а не значення облікових даних.

Оператор може перевірити за діагностикою runtime, який секрет автентифікації
буде використано, без розкриття самого секрету Server.

## Транспортні retries та durable retries activity {#transport-retry-versus-durable-activity-retry}

Необов'язкова `retry_policy` invocable carrier діє **лише на транспорт**.
Вона керує HTTP-доставкою carrier до повідомлення результату обробником:

| Поле `retry_policy` | Дозволено | Стандартне значення | Значення |
| --- | --- | --- | --- |
| `max_attempts` | ціле число 1–5 | `1` | Максимальна кількість спроб HTTP-доставки carrier для одного task lease. |
| `backoff_seconds` | масив цілих чисел 0–300, до 5 елементів | `[]` | Затримка перед кожною наступною HTTP-спробою. |
| `retryable_status_codes` | підмножина `[408, 425, 429, "5xx"]` | `[408, 429, "5xx"]` | Коди відповіді, які допускають транспортний retry. |

Транспортні retries не стають подіями історії. Server отримує лише
остаточний результат carrier: структуровану оболонку успіху чи помилки
від обробника, транспортний timeout, зіставлений із
`failure.kind=timeout, classification=deadline_exceeded`,
або один із варіантів некоректного результату.

Після повідомлення результату обробником **durable retry policy activity
залишається повноваженням Server/runtime**. Retry task, його планування
та backoff продовжують виконувати політику activity, оголошену у workflow.
`retry_policy` carrier не подовжує, не перевизначає й не замінює її.

## Оболонки запиту та відповіді {#request-and-response-envelope}

Server надсилає незалежну від carrier оболонку вхідних даних
і очікує таку саму незалежну оболонку результату:

| Напрямок | Content type | Schema |
| --- | --- | --- |
| Запит | `application/vnd.durable-workflow.external-task-input+json` | `external_task_input_contract` |
| Відповідь | `application/vnd.durable-workflow.external-task-result+json` | `external_task_result_contract` |

Обробник має зберегти `task.id`, `task.attempt` і `task.idempotency_key`
із вхідної оболонки та повернути визначену оболонку успіху чи помилки
або отримати відхилення через зіставлення некоректного результату.

Carrier детерміновано зіставляє транспортні факти з результатами:

- транспортний timeout → `failure.kind=timeout`,
  `classification=deadline_exceeded`
- відповідь не 2xx без коректної оболонки результату → `malformed_output`
- некоректний JSON або невідповідність schema у відповіді → `malformed_output`
- оболонка результату з непідтримуваним посиланням на payload → `unsupported_payload`

Обробники мають бути ідемпотентними. Ті самі `task.id` і `task.idempotency_key`
можуть надійти кілька разів, якщо carrier повторює транспортну доставку
або runtime повторно доставляє незавершений lease.

## Приклад конфігурації {#configuration-example}

Server читає зіставлення обробників з `DW_EXTERNAL_EXECUTOR_CONFIG_PATH`
і може вибрати overlay через `DW_EXTERNAL_EXECUTOR_CONFIG_OVERLAY`.
Повний список змінних середовища наведено в
[довіднику конфігурації Server](./server-config-reference.md).

Мінімальний документ `durable-workflow.external-executor.config` нижче
реєструє один carrier `invocable_http` та одне зіставлення activity:

```json
{
  "schema": "durable-workflow.external-executor.config",
  "version": 1,
  "defaults": {
    "profile": "prod",
    "namespace": "operations",
    "task_queue": "operator-tasks",
    "auth_ref": "handler-token"
  },
  "auth_refs": {
    "handler-token": {
      "type": "env",
      "env": "DURABLE_WORKFLOW_HANDLER_TOKEN"
    }
  },
  "carriers": {
    "ops-invocable": {
      "type": "invocable_http",
      "url": "https://handlers.example.com/durable/activity",
      "method": "POST",
      "timeout_seconds": 60,
      "capabilities": ["activity_task"],
      "retry_policy": {
        "max_attempts": 3,
        "backoff_seconds": [2, 5],
        "retryable_status_codes": [408, 429, "5xx"]
      }
    }
  },
  "mappings": [
    {
      "name": "billing.reconcile-ledger",
      "kind": "activity",
      "task_queue": "operator-tasks",
      "activity_type": "billing.reconcile-ledger",
      "carrier": "ops-invocable",
      "handler": "billing.reconcile-ledger",
      "timeout_seconds": 60
    }
  ]
}
```

Локальний loopback-варіант використовує
`"url": "http://127.0.0.1:8080/durable/activity"`
і може не містити `auth_ref`, бо loopback HTTP є єдиним дозволеним
шляхом без автентифікації.

## Огляд та діагностика {#inspection-and-diagnostics}

Дві CLI-команди показують опублікований контракт invocable carrier
з активного Server:

- `dw server:info` відображає назву schema, версію контракту, тип carrier,
  види tasks, дозволені content types запитів і відповідей та діагностику
  зіставлень зовнішнього виконавця з прихованими секретами.
  Перевірте нею, що Server завантажив очікувані зіставлення.
- `dw doctor` виконує діагностику cluster info, виводить блок
  `invocable_carrier_contract` і показує помилки
  `invalid_carrier_target`, `missing_invocable_auth_ref`,
  `invalid_invocable_carrier_scope`, `unknown_carrier`,
  `unknown_auth_ref` або `unknown_handler`, які завадили публікації зіставлення.

Activity poll-відповідь сама повідомляє вибране зіставлення, ціль carrier
з прихованими даними автентифікації та дієву `retry_policy`.
Workers і операторські інструменти використовують ці поля як джерело
істини замість власної кешованої копії конфігурації.

## Співіснування та rollout {#coexistence-and-rollout}

Межа rollout invocable carrier публікується в тому самому manifest:

- Poll-based carrier та `invocable_http` можуть спільно використовувати
  чергу лише за зіставлень для конкретних типів activity.
  Два зіставлення не можуть володіти тією самою парою `(task_queue, activity_type)`.
- Перед видаленням облікових даних оператор має прибрати або вимкнути
  через overlay зіставлення invocable, що їх використовують.
  Видалення облікових даних до drain зіставлення переводить кожну
  нову спробу в `failure.kind=auth`, а не в удаваний успіх.
- `retry_policy` carrier стосується лише транспорту.
  Durable retry policy activity залишається єдиним джерелом рішень
  щодо кількості спроб task, які бачить workflow.

## Пов'язані поверхні {#related-surfaces}

- [Зовнішнє виконання](./external-execution.md) — незалежна від carrier
  продуктова межа, яку реалізує цей carrier.
- [PHP-обробник invocable activity](./invocable-php-handler.md) — PHP-помічник
  для розбору вхідних оболонок зовнішнім процесом, виклику activity callable
  та формування структурованих оболонок результату, яких очікує carrier.
- [Довідник конфігурації Server](./server-config-reference.md) — змінні
  середовища `DW_EXTERNAL_EXECUTOR_CONFIG_PATH`
  та `DW_EXTERNAL_EXECUTOR_CONFIG_OVERLAY`.
- [Зовнішнє сховище payload](../features/external-payload-storage.md) —
  перенесення завеликих payload запиту чи результату в налаштований driver
  та подання їх перевірюваними посиланнями в тих самих schemas.
- [Worker-протокол](./worker-protocol.md) — ширший контракт worker plane,
  який публікує цей carrier поруч із poll-based формами обробників.
