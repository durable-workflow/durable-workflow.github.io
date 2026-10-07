---
sidebar_position: 5
title: PHP-обробник invocable activity
description: Використання PHP-помічника InvocableActivityHandler для HTTPS-обробників activities, які отримують оболонки вхідних даних external task та повертають оболонки результату.
tags:
  - external-execution
  - invocable-carrier
  - worker-protocol
keywords:
  - обробник invocable activity
  - InvocableActivityHandler
  - вхідні дані external task
  - результат external task
  - PHP activity adapter
  - Lambda activity handler
---

# PHP-обробник invocable activity {#php-invocable-activity-handler}

[Invocable HTTP carrier](./invocable-carrier.md) дає змогу Server надсилати
leased activity task через POST до HTTPS endpoint замість очікування
long-poll worker. PHP-помічник `Workflow\V2\Support\InvocableActivityHandler`
є еталонною реалізацією, за допомогою якої зовнішній PHP-процес перетворює
запит на оболонку результату, яку Server може узгодити.

Використовуйте його для інтеграції обробника activity з:

- AWS Lambda або Google Cloud Function, яку викликають через HTTPS
- Laravel controller за невеликим HTTP-сервісом
- контейнером, який надає один POST endpoint на чергу activities

Помічник розбирає незалежну від carrier оболонку вхідних даних external task,
знаходить зареєстрований callable, контролює deadline lease і формує
незалежну від carrier оболонку результату external task,
включно з формами помилок, яких очікує Server.

## Швидкий початок {#quick-start}

Установіть пакет Durable Workflow у зовнішньому процесі, зареєструйте
один callable для кожної назви обробника activity
та передайте тіло запиту до `handle()`:

```php
use Workflow\V2\Support\InvocableActivityHandler;

$handler = new InvocableActivityHandler([
    'billing.charge-card' => static function (int $amount, string $currency): array {
        // Real charge-card logic. Must be idempotent per task id.
        return [
            'approved' => true,
            'amount' => $amount,
            'currency' => $currency,
        ];
    },
]);

$envelope = json_decode(file_get_contents('php://input'), associative: true);
$result = $handler->handle($envelope);

header('Content-Type: application/vnd.durable-workflow.external-task-result+json');
echo json_encode($result, JSON_UNESCAPED_SLASHES);
```

Обробник отримує вхідну оболонку й повертає оболонку результату.
Invocable HTTP carrier відповідає за контракт carrier: HTTPS, POST,
автентифікацію, timeouts та retry budget. PHP-помічник відповідає
за декодування аргументів, dispatch обробника, контроль deadline,
кодування результату й класифікацію помилок.

## Реєстрація обробників {#registering-handlers}

Перший аргумент конструктора є map із ключами, що відповідають
`task.handler` у вхідній оболонці від Server. Це значення поля `handler`
відповідного запису конфігурації зовнішнього виконавця:

```php
new InvocableActivityHandler(
    handlers: [
        'billing.charge-card' => [$billingService, 'chargeCard'],
        'billing.refund' => [$billingService, 'refund'],
        'ops.rotate-key' => static fn (string $keyId): array => $keys->rotate($keyId),
    ],
    carrier: 'billing-lambda',
    resultCodec: 'avro',
);
```

Вхідні дані з незареєстрованим `task.handler` дають результат
`failed` із `failure.kind = application`,
`classification = application_error` та `type = UnknownActivityHandler`.
Налаштована retry policy activity продовжує діяти на Server.

Необов'язкове ім'я `carrier` повертається в `metadata.carrier` кожної
оболонки результату, щоб оператор міг визначити зовнішній runtime відповіді.
Використовуйте сталий ідентифікатор без секретів, наприклад
`billing-lambda`, `ops-cloud-run` або `laravel-admin-api`.

Необов'язковий `resultCodec` визначає серіалізацію поверненого значення
в `result.payload.blob`. Стандартно це `avro`, що відповідає codec
durable payload PHP workers. Codec результату має бути відомим
`CodecRegistry` Server. `protobuf` не приймається
й негайно відхиляється в конструкторі.

## Оболонка результату {#result-envelope}

За успіху `handle()` повертає незалежну від carrier оболонку успіху:

```json
{
  "schema": "durable-workflow.v2.external-task-result",
  "version": 1,
  "outcome": {
    "status": "succeeded",
    "recorded": true
  },
  "task": {
    "id": "acttask_01HV7D3G3G61TAH2YB5RK45XJS",
    "kind": "activity_task",
    "attempt": 1,
    "idempotency_key": "attempt_01HV7D3KJ1C8WQNNY8MVM8J40X"
  },
  "result": {
    "payload": {
      "codec": "avro",
      "blob": "<base64-encoded payload>"
    },
    "metadata": {
      "content_type": "application/vnd.durable-workflow.result+json"
    }
  },
  "metadata": {
    "handler": "billing.charge-card",
    "carrier": "billing-lambda",
    "duration_ms": 42
  }
}
```

Поля `task.id`, `task.attempt` і `task.idempotency_key` копіюються
з вхідної оболонки, щоб Server міг узгодити результат
із початковим lease.

За помилки `handle()` повертає оболонку помилки. Блок `failure`
містить вид, classification, повідомлення, початковий PHP-тип, stack trace
і можливість retry. Помилка deadline також містить назву `deadline`
та значення `expires_at`:

```json
{
  "schema": "durable-workflow.v2.external-task-result",
  "version": 1,
  "outcome": {
    "status": "failed",
    "retryable": true,
    "recorded": true
  },
  "task": {"id": "...", "kind": "activity_task", "attempt": 1, "idempotency_key": "..."},
  "failure": {
    "kind": "timeout",
    "classification": "deadline_exceeded",
    "message": "Invocable activity task received after lease.expires_at.",
    "type": "ExternalTaskDeadlineExceeded",
    "stack_trace": null,
    "timeout_type": "deadline_exceeded",
    "cancelled": false,
    "details": {
      "deadline": "lease.expires_at",
      "expires_at": "2026-04-22T15:14:02.000000Z"
    }
  },
  "metadata": {"handler": "billing.charge-card", "carrier": "billing-lambda", "duration_ms": 3}
}
```

## Класифікація помилок {#failure-taxonomy}

| `failure.kind` | `classification` | Retry можливий | Коли виникає |
| --- | --- | --- | --- |
| `timeout` | `deadline_exceeded` | так | Deadline lease чи вхідних даних уже сплив на момент отримання оболонки або сплив під час виконання до повернення обробника. |
| `decode_failure` | `decode_failure` | ні | Аргументи не вдалося декодувати оголошеним codec, рядок deadline не вдалося розібрати, обробник підняв `TypeError` / `ValueError` через параметри або payload успіху не вдалося закодувати налаштованим codec результату. |
| `application` | `application_error` | залежить від винятку | Обробник підняв виняток. `retryable` дорівнює `false`, якщо виняток реалізує `Workflow\Exceptions\NonRetryableExceptionContract`, інакше `true`. Повідомлення береться з винятку, а `type` є його класом. |
| `application` | `application_error` | ні | `task.kind` не дорівнює `activity_task` або `task.handler` не зареєстрований у map. |

Помічник ніколи не повертає голий виняток. Кожен шлях виконання формує
структуровану оболонку результату, щоб invocable carrier міг
детерміновано узгодити відповідь.

## Deadlines та ідемпотентність {#deadlines-and-idempotency}

Вхідна оболонка містить активний `lease.expires_at` та оголошені
deadlines activity: `schedule_to_start`, `start_to_close`,
`schedule_to_close` і `heartbeat`. Помічник перевіряє всі:

- Перед dispatch обробника будь-який спливлий deadline одразу дає
  помилку `timeout`. `details.deadline` указує відповідне поле.
  Зареєстрований callable не викликається.
- Після повернення обробника помічник повторно перевіряє deadlines.
  Обробник, що працював довше за свій lease, дає ту саму помилку
  `timeout`, а повернене значення не потрапляє в оболонку.

Оскільки carrier повторює транспортну доставку, а runtime повторно доставляє
leases, про які не отримав результату, ті самі `task.id` і
`task.idempotency_key` можуть надійти кілька разів.
Код обробника має бути ідемпотентним. Ключ ідемпотентності кожної оболонки
залишається сталим для retries тієї самої спроби.

## Codecs payload та зовнішнє сховище {#payload-codecs-and-external-storage}

Payload аргументів надходять у `payloads.arguments` із полем `codec`.
Помічник декодує їх через `CodecRegistry` Server.
Єдиний публічний codec v2 — `avro`. `json`, невідомі codecs,
некоректні blobs та blobs без позначення відхиляються.
JSON залишається документом HTTP carrier, а не codec durable payload.

Коли вхідні дані workflow перевищують налаштований поріг
[зовнішнього сховища payload](../features/external-payload-storage.md),
Server зберігає bytes у налаштованому driver і надсилає оболонку
посилання замість inline blob. Передайте `ExternalPayloadStorageDriver`
до конструктора, щоб помічник міг отримати дані за посиланнями
перед викликом обробника:

```php
use Workflow\V2\Contracts\ExternalPayloadStorageDriver;
use Workflow\V2\Support\InvocableActivityHandler;

$handler = new InvocableActivityHandler(
    handlers: $handlers,
    carrier: 'billing-lambda',
    resultCodec: 'avro',
    externalStorage: $driver,
);
```

Driver має виконувати той самий контракт, який Server використовує
для запису payload, щоб посилання, hash і codec збігалися.
Посилання, яке зовнішній процес не може отримати, дає
`decode_failure` замість прихованого порожнього payload.

## Production-інтеграція {#production-wiring}

Laravel controller, який розміщує обробник за одним POST-маршрутом,
має такий вигляд:

```php
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Workflow\V2\Support\InvocableActivityHandler;

final class BillingActivityController
{
    public function __construct(private readonly InvocableActivityHandler $handler) {}

    public function __invoke(Request $request): JsonResponse
    {
        $result = $this->handler->handle($request->all());

        return new JsonResponse(
            data: $result,
            headers: ['Content-Type' => 'application/vnd.durable-workflow.external-task-result+json'],
        );
    }
}
```

У конфігурації зовнішнього виконавця вкажіть HTTPS URL цього controller
і оголосіть `auth_ref` для автентифікації маршруту.
Виняток loopback HTTP діє лише для локальної розробки.

## Пов'язані поверхні {#related-surfaces}

- [Invocable HTTP carrier](./invocable-carrier.md) — серверний контракт
  carrier для доставки вхідних оболонок та узгодження оболонок результату.
- [Зовнішнє виконання](./external-execution.md) — незалежна від carrier
  продуктова межа, включно зі schemas вхідних даних і результату,
  які реалізує помічник.
- [Зовнішнє сховище payload](../features/external-payload-storage.md) —
  перенесення завеликих аргументів чи результатів у налаштований driver
  та подання їх перевірюваними посиланнями.
- [Worker-протокол](./worker-protocol.md) — ширший контракт worker plane,
  що публікує invocable carrier поруч із poll-based формами обробників.
