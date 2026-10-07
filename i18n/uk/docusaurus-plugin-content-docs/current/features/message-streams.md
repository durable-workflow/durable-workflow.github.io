---
sidebar_position: 18
tags:
  - message-streams
  - workflows
  - continue-as-new
  - AI
keywords:
  - потоки повідомлень
  - вхідний потік Workflow
  - вихідний потік Workflow
  - MessageStream
  - повторювані повідомлення workflow
---

# Потоки повідомлень {#message-streams}

Потоки повідомлень — це API v2 для повторюваних повідомлень workflow:
циклів введення користувачем, відповідей асистента, сповіщень між workflow
та інших упорядкованих повідомлень, які мають зберігатися після replay
і continue-as-new.

Ця сторінка описує вбудований Laravel API inbox/outbox. Серверні
[Workflow Streams](/docs/polyglot/workflow-streams/) використовують ті самі
поняття потоку, зміщення, кількості очікуваних елементів, життєвого циклу
й помилок там, де їхня семантика збігається, але працюють лише на вихід.
Вони не додають вхідних повідомлень workflow або перенесення курсора
continue-as-new до сервісного режиму.

Автори workflow мають використовувати повноцінний фасад:

- `$this->inbox('stream-key')`
- `$this->outbox('stream-key')`
- `$this->messages('stream-key')`
- `Workflow\V2\MessageStream`

Не записуйте рядки `workflow_messages` або курсорів безпосередньо з коду
workflow застосунку. Фасад є стабільним контрактом. Сервіси повідомлень нижчого
рівня призначені для інтеграції пакета та runtime.

## Отримання повідомлень {#receiving-messages}

Використовуйте `peek()`, коли workflow має перевірити очікувані вхідні
повідомлення без переміщення стійкого курсора. Використовуйте `receive()` або
`receiveOne()`, коли workflow готовий спожити повідомлення й записати
переміщення курсора в історію.

```php
use Workflow\V2\Workflow;

final class ApprovalInboxWorkflow extends Workflow
{
    public function handle(): array
    {
        $pending = $this->inbox('approval.requests')->peek(limit: 10);

        if ($pending->isEmpty()) {
            return ['status' => 'waiting'];
        }

        $message = $this->inbox('approval.requests')->receiveOne();

        return [
            'status' => 'received',
            'payload_reference' => $message?->payload_reference,
            'correlation_id' => $message?->correlation_id,
        ];
    }
}
```

`peek()` лише читає дані. `receive()` та `receiveOne()` позначають повідомлення
спожитими й переміщують стійкий курсор повідомлень поточного запуску.
Переміщення курсора є фактом історії, тому replay, експорт Waterline і передача
continue-as-new можуть визначити, які вхідні повідомлення вже спожито.

## Надсилання посилань {#sending-references}

Використовуйте `outbox(...)->sendReference(...)`, коли workflow має
опублікувати впорядковане вихідне повідомлення. Таблиця повідомлень зберігає
метадані маршрутизації та посилання на дані. Великий вміст або вміст, який
належить застосунку, залишається в його сховищі даних.

```php
use Workflow\V2\Workflow;

final class AssistantReplyWorkflow extends Workflow
{
    public function handle(string $targetWorkflowId, string $replyReference): array
    {
        $message = $this->outbox('ai.assistant')->sendReference(
            targetInstanceId: $targetWorkflowId,
            payloadReference: $replyReference,
            correlationId: $this->workflowId(),
            metadata: ['kind' => 'assistant_reply'],
        );

        return [
            'status' => 'sent',
            'stream' => $message->stream_key,
            'sequence' => $message->sequence,
        ];
    }
}
```

Це зберігає малий розмір історії workflow й дає споживачам змогу перевіряти
сховище даних окремо від стійкого порядку повідомлень.

## Continue-As-New {#continue-as-new}

Потоки повідомлень насамперед належать екземпляру. Під час continue-as-new
очікувані вхідні повідомлення й позиція курсора переносяться до продовженого
запуску. Спожиті повідомлення залишаються прив’язаними до початкового запуску
як історичні свідчення.

Тому тривалий workflow може звільнятися від історії, зберігаючи той самий
публічний маршрут повідомлень:

```php
use function Workflow\V2\continueAsNew;
use Workflow\V2\Workflow;

final class HumanInputLoopWorkflow extends Workflow
{
    public function handle(int $iteration = 0): array
    {
        $message = $this->inbox('human.replies')->receiveOne();

        if ($message === null) {
            return ['status' => 'waiting', 'iteration' => $iteration];
        }

        if ($this->shouldContinueAsNew()) {
            return continueAsNew($iteration + 1);
        }

        return [
            'status' => 'processed',
            'iteration' => $iteration,
            'payload_reference' => $message->payload_reference,
        ];
    }
}
```

Ініціатор продовжує адресувати ID екземпляра workflow. Йому не потрібно знати,
який запуск зараз володіє курсором потоку.

## Правила написання коду {#authoring-rules}

- Використовуйте змістовні ключі потоків, наприклад `ai.assistant`,
  `human.replies` або `approval.requests`, як частину публічного контракту workflow.
- Використовуйте `peek()` для перевірки, а `receive()` / `receiveOne()` —
  для стійкого споживання.
- Використовуйте `sendReference()` для вихідних повідомлень. Зберігайте великі
  дані в сховищі застосунку й передавайте посилання.
- Код застосунку має використовувати `Workflow::inbox()`, `Workflow::outbox()`
  та `MessageStream`, а не залежати від `MessageService`, `WorkflowMessage`
  або прямого запису рядків курсора.
- Для одноразових зовнішніх подій використовуйте [Signal](./signals.md).
  Для зміни стану з поверненням результату — [Update](./updates.md). Обирайте
  потоки повідомлень, коли повторюваним упорядкованим повідомленням потрібна
  семантика курсора.

## Запуск цього прикладу {#run-this-pattern}

Workflow туристичного агента у
[Sample App](/docs/sample-app) — це виконуваний приклад структури
inbox/outbox, описаної на цій сторінці:

```bash
php artisan app:ai
```

`App\Workflows\Ai\AiWorkflow` зберігає великі дані асистента в таблиці
застосунку `ai_workflow_messages` і публікує лише стійке посилання у вихідному
потоці `ai.assistant`. Відповіді надходять через відповідний вхідний потік
за допомогою update `receive`. Перегляньте клас workflow разом із цією
сторінкою, щоб побачити наскрізне використання тих самих викликів `inbox()`,
`outbox()` та `sendReference()`, що й у наведених прикладах.
