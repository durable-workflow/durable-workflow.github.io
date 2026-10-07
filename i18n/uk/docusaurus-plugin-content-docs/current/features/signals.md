---
sidebar_position: 1
title: Signal
description: Надсилайте типізовані зовнішні команди до активних workflow та дізнайтеся про валідацію, маршрутизацію й очікування signal.
tags:
  - commands
  - signals
  - human-in-the-loop
keywords:
  - workflow signals
  - signal command
  - human in the loop workflow
---

import SignalSimulator from '@site/src/components/SignalSimulator';

# Signal {#signals}

Signal дозволяють спричиняти події у workflow ззовні. Це корисно для реакції на зовнішні події, втручання *людини в процес* чи повідомлення про завершення зовнішнього завдання. Для повторюваних упорядкованих вхідних даних зі стійким просуванням курсора використовуйте [потоки повідомлень](./message-streams.md).

## Очікування іменованих signal {#named-signal-waits}

Workflow безпосередньо викликає `await('signal-name')`. Наступна прийнята команда signal із цією назвою продовжує запуск та повертає детерміноване значення призупиненому workflow.

```php
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;
use function Workflow\V2\await;

#[Type('order-approval')]
#[Signal('approved-by', [
    ['name' => 'approvedBy', 'type' => 'string'],
])]
final class OrderApprovalWorkflow extends Workflow
{
    public function handle(): array
    {
        $approvedBy = await('approved-by');

        return [
            'approved_by' => $approvedBy,
            'workflow_id' => $this->workflowId(),
            'run_id' => $this->runId(),
        ];
    }
}
```

Надішліть signal із PHP за публічним ідентифікатором екземпляра:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$result = $workflow->attemptSignalWithArguments('approved-by', [
    'approvedBy' => 'Taylor',
]);

$result->accepted();    // true
$result->outcome();     // "signal_received"
$result->commandId();   // Durable signal-command id
$result->instanceId();  // "order-123"
```

Поведінка signal:

- Заздалегідь оголосіть кожну назву зовнішнього signal через повторюваний атрибут класу `#[Signal('signal-name')]`. За потреби додайте впорядкований контракт параметрів.
- Команди signal спрямовані на публічний ідентифікатор екземпляра workflow, а не запуску, тому ланцюжки continue-as-new зберігають той самий публічний маршрут signal.
- За наявності контракту параметрів прийом відхиляє некоректні дані як `rejected_invalid_arguments` із машинозчитуваними `validation_errors`.
- Без контракту `await('name')` повертає `true`, якщо аргументів немає, єдиний аргумент, якщо передано один, або повний масив аргументів, якщо передано кілька.
- Невідомі назви signal відхиляються як `rejected_unknown_signal`. Signal для закритого чи незапущеного екземпляра відхиляються як `rejected_not_active` або `rejected_not_started`.

<SignalSimulator />

**Важливо:** функцію `await()` слід використовувати лише у workflow, а не в activity.

Для очікування умов, коли предикат над стійким станом має стати істинним, дивіться [очікування умов](./condition-waits.md). Для `await` із тайм-аутом дивіться [signal + timer](./signal+timer.md). Для повторюваних потоків inbox/outbox дивіться [потоки повідомлень](./message-streams.md).

## Запуск цього шаблону {#run-this-pattern}

Workflow, що запускається через webhook у [Sample App](/docs/sample-app), — виконуваний приклад шаблону очікування іменованого signal із цієї сторінки:

```bash
php artisan app:webhook
```

`App\Workflows\Webhooks\WebhookWorkflow` запускається через вхідний HTTP webhook і зупиняється на `await('ready')` до надходження відповідного signal. Відкрийте Waterline під час очікування: подія `WorkflowExecutionSignaled` з’явиться в момент прийняття signal.
