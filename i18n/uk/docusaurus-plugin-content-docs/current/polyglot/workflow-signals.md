---
title: Signal-with-start і signal між workflow
description: Запускайте або повторно використовуйте workflow і надсилайте йому signal однією операцією, а також довговічно надсилайте signal іншому workflow з коду workflow за допомогою PHP, Python і Rust SDK.
---

# Signal-with-start і signal між workflow {#signal-with-start-and-workflow-signals}

Native Server 3.15.0 додає дві операції signal:

- **Signal-with-start** — це виклик клієнта. Один запит запускає workflow або
  повторно використовує його відкритий запуск і записує один signal у цей запуск
  в одній транзакції Server.
- **Signal іншому workflow** — це команда workflow. Код workflow надсилає signal
  іншому workflow у своєму namespace. Запит і його результат записуються один
  раз в історію відправника, а replay ніколи не надсилає signal повторно.

## Вимоги {#requirements}

| Runtime | Signal-with-start | Signal іншому workflow |
| --- | --- | --- |
| Native Server | 3.15.0 або новіший, оголошується як `capabilities.signal_with_start` | 3.15.0 або новіший, оголошується як команда worker `signal_external_workflow` |
| PHP SDK | 3.22.0 або новіший: `Client::signalWithStart()` | 3.22.0 або новіший: `WorkflowContext::signalExternalWorkflow()` |
| Python SDK | 2.20.0 або новіший: `Client.signal_with_start()` | 2.20.0 або новіший: `ctx.signal_external_workflow()` |
| Rust SDK | 4.21.0 або новіший: `Client::signal_with_start()` | 4.21.0 або новіший: `ctx.signal_external_workflow()` |
| Вбудований PHP (Laravel) | `WorkflowStub::signalWithStart()`, див. [посібник із signal](../features/signals.md#signal-with-start) | Workflow 2.35.0 або новіший (експериментально): `signalExternalWorkflow()`, див. [посібник із signal](../features/signals.md#signal-another-workflow) |

Опублікований PHP Server 2.x не підтримує жодної з цих операцій. SDK
перевіряють підключений Server до надсилання. Зі старішим Server виклик клієнта
спричиняє `ServerCapabilityUnavailable` (PHP), `RuntimeCapabilityUnsupported`
(Python) або `Error::SignalWithStartUnavailable` (Rust), і нічого не
надсилається. Worker відхиляє нову команду signal із
`signal_external_workflow_unavailable` ще до надсилання будь-чого, тому завдання
workflow не завершується, а запуск не отримує стану помилки.

## Signal-with-start {#signal-with-start}

Використовуйте signal-with-start, коли викликач адресує одну сутність і не може
втратити подію між окремими запуском і signal. Окремі
`start(use-existing)` і наступний `signal` — це дві операції: запуск може
закритися між ними, і тоді signal відхиляється. У signal-with-start такого
проміжку немає.

- **Запуску немає.** Новий запуск стартує з вхідними даними й дедлайнами цього
  виклику. `start_outcome` у квитанції дорівнює `started_new`.
- **Відкритий запуск**, зокрема найновіший запуск після continue-as-new. Signal
  додається до нього, а `start_outcome` дорівнює `returned_existing_active`.
  Запуск зберігає свої вхідні дані, дедлайни й історію. Політика дублікатів
  `fail` натомість відхиляє його з `instance_already_started`.
- **Закритий запуск.** Відхиляється з `run_not_active`, якщо політика для
  закритого запуску не `start_new_run`. Вона запускає новий запуск після
  закритого, а квитанція називає закритий запуск у `closed_run_id`. Закритий
  запуск зберігає свій результат.

Тип workflow має бути типом екземпляра, а черга завдань — чергою відкритого
запуску. Інакше Server відхиляє запит із `workflow_type_conflict` або
`task_queue_conflict`. За будь-якої відмови нічого не записується.

Ідентифікатор запиту є [ключем команди](./server-api-reference.md#command-keys)
signal. Кожен SDK генерує його для кожного виклику, якщо ви його не передали.
Зберігайте власний ключ, коли повтор має пережити перезапуск процесу. Повтор із
тим самим ключем, назвою signal, аргументами й типом workflow повертає початкову
квитанцію з `retained: true`, навіть після того, як запуск закрився або
продовжився через continue-as-new, і нічого не запускає.

```php
use DurableWorkflow\Exception\SignalWithStartFailed;

try {
    $receipt = $client->signalWithStart(
        'orders.entity',      // workflow type
        'order-42',           // workflow ID
        'orders',             // task queue
        'changed',            // signal name
        [2],                  // signal arguments
        input: ['order-42'],  // input for a run this call starts
        requestId: 'order-42-revision-2',
    );
    $receipt['start_outcome']; // "started_new" or "returned_existing_active"
} catch (SignalWithStartFailed $failed) {
    $failed->reason(); // For example "run_not_active". Nothing was written.
}
```

```python
from durable_workflow.errors import SignalWithStartFailed

try:
    receipt = await client.signal_with_start(
        "order-42",
        "changed",
        workflow_type="orders.entity",
        task_queue="orders",
        input=["order-42"],
        signal_args=[2],
        request_id="order-42-revision-2",
    )
    receipt["start_outcome"]  # "started_new" or "returned_existing_active"
except SignalWithStartFailed as failed:
    failed.reason  # For example "run_not_active". Nothing was written.
```

```rust
use durable_workflow::{json, SignalWithStartOptions};

match client
    .signal_with_start(
        "orders.entity",
        "orders",
        "order-42",
        "changed",
        json!(["order-42"]),
        json!([2]),
        SignalWithStartOptions::new().request_id("order-42-revision-2"),
    )
    .await
{
    Ok(receipt) => println!("{}", receipt["start_outcome"]),
    // For example Some("run_not_active"). Nothing was written.
    Err(error) => println!("{:?}", error.signal_with_start_refusal()),
}
```

Передайте `closedRunPolicy: 'start_new_run'` (PHP), `closed_run_policy="start_new_run"`
(Python) або `ClosedRunPolicy::StartNewRun` (Rust), щоб запустити новий запуск
після закритого. Signal-with-start приймає signal один раз. Робота, яку
спричиняє signal, усе одно потребує власної ідемпотентності.

## Signal іншому workflow {#signal-another-workflow}

Код workflow надсилає signal іншому workflow у своєму namespace за ID workflow.
Без ID запуску signal надходить до поточного запуску цілі; з ним — лише до цього
запуску. Signal є командою workflow, а не activity:

- Завершення, що його містить, записує `ExternalSignalRequested` в історію
  відправника, приймає signal у цілі та записує рівно один результат,
  `ExternalSignalDelivered` або `ExternalSignalFailed`, із тим самим номером
  послідовності, і все це в одній транзакції Server.
- У цілі це звичайний signal: та сама подія `SignalReceived` і той самий запис
  signal, що й для будь-якого іншого signal, з атрибуцією запуску-відправнику.
  Його ключ команди в цілі — `workflow-signal:<sender run ID>:<sequence>`.
  Викликачі не можуть використовувати цей префікс: signal або signal-with-start,
  ідентифікатор запиту якого починається з `workflow-signal:`, відхиляється з 422
  і `reason: "request_id_reserved"`.
- Replay читає записаний результат і ніколи не надсилає повторно. Інші ціль,
  запуск, назва signal чи аргументи в цій точці workflow призводять до збою
  replay як недетермінованого.

Недоставлений signal — це повернуте значення, а не виняток. Код workflow сам
вирішує, що з ним робити.

| Результат | Причина | Коли |
| --- | --- | --- |
| `delivered` | немає | Цільовий запуск прийняв signal. |
| `target_not_found` | `instance_not_found` | У цьому namespace немає workflow із таким ID. |
| `target_not_found` | `run_not_found` | ID запуску не відповідає жодному запуску цього workflow. |
| `target_closed` | `run_not_active` | Цільовий запуск закрився. |
| `target_closed` | `historical_run` | ID запуску вказує на запуск, замінений через continue-as-new. |
| `rejected` | `unknown_signal`, `invalid_signal_arguments`, `structural_limit_exceeded` | Ціль відхилила signal так само, як відхилила б HTTP-signal. |
| `rejected` | `runtime_reserved_signal` | Назву зарезервовано для потоку повідомлень runtime. |
| `rejected` | `self_target` | Ціль — власний workflow відправника. |
| `rejected` | `request_id_conflict` | Ключ команди вже використано для іншого signal. |

SDK перевіряють назву signal у коді workflow до того, як щось буде записано.
Вона не може бути порожньою, не може містити керівного символу (байта менше
`0x20` або `0x7f`) і має не більше 191 символу та 255 байтів. ID цільового
workflow має від 1 до 191 символу. Відхилена назва спричиняє `InvalidSignalName`
(PHP і Python) або повертає `Error::InvalidExternalSignal` (Rust), і жодна
команда не надсилається.

```php
use DurableWorkflow\Attribute\Workflow;
use DurableWorkflow\Worker\WorkflowContext;

final class ApproverWorkflow
{
    #[Workflow('orders.approver')]
    public function run(WorkflowContext $context, string $orderId): array
    {
        $result = $context->signalExternalWorkflow($orderId, 'approve', ['Ada']);

        if (! $result->delivered()) {
            // target_not_found, target_closed or rejected, with a reason
            return ['skipped' => $result->outcome->value, 'reason' => $result->reason];
        }

        return ['delivered_to' => $result->targetRunId];
    }
}
```

Handle запущеного дочірнього workflow має ту саму команду: `$child->signal('approve', ['Ada'])`.

```python
from durable_workflow import workflow


@workflow.defn(name="orders.approver")
class Approver:
    def run(self, ctx: workflow.WorkflowContext, order_id: str):
        result = yield ctx.signal_external_workflow(order_id, "approve", ["Ada"])
        if not result.delivered:
            # target_not_found, target_closed or rejected, with a reason
            return {"skipped": result.outcome, "reason": result.reason}
        return {"delivered_to": result.target_run_id}
```

```rust
use durable_workflow::{json, ExternalSignalOutcome};

worker.register_workflow("orders.approver", |ctx, input| async move {
    let order_id = input[0].as_str().unwrap_or_default().to_owned();
    let result = ctx
        .signal_external_workflow(order_id, "approve", json!(["Ada"]))
        .await?;
    match result.outcome {
        ExternalSignalOutcome::Delivered => Ok(json!({"delivered_to": result.target_run_id})),
        // target_not_found, target_closed or rejected, with a reason
        _ => Ok(json!({"skipped": result.outcome.as_str(), "reason": result.reason})),
    }
});
```

Додайте `.run_id(run_id)` у Rust, `run_id=` у Python або `runId:` у PHP, щоб
надіслати signal лише одному запуску цілі.

Виконуйте команду окремо. Вона не може бути учасником паралельної групи чи
довговічного вибору. Worker, що утримує завдання workflow, може надіслати signal
будь-якому workflow у namespace цього завдання без ролі оператора, потрібної для
HTTP-signal. Розміщуйте в окремому namespace workflow, якому код інших workflow
не повинен надсилати signal.

## Коли activity все ще потрібна {#when-an-activity-is-still-needed}

Використовуйте activity, що викликає клієнт, коли команда workflow не підходить:

- **Signal-with-start із коду workflow.** Команди workflow для signal-with-start
  немає. Викличте signal-with-start клієнта з activity й виведіть ідентифікатор
  запиту зі стабільних даних workflow, як-от ID workflow і бізнес-ключа, щоб
  кожна повторна спроба activity надсилала той самий ключ, а Server приймав
  signal один раз.
- **Інший namespace.** Signal залишаються в межах namespace. Натомість
  використовуйте [виклик сервісу між namespace](./service-operations.md).
- **Старіший Server.** До native Server 3.15.0 код workflow може надсилати
  signal лише через activity. Дайте й цьому signal стабільний ідентифікатор
  запиту, щоб повторна спроба activity не записала другий signal.

Activity виконується щонайменше один раз, тому саме стабільний ідентифікатор
запиту не дає повторній спробі надіслати другий signal. Команда signal записує
свій результат в історію без завдання activity.
