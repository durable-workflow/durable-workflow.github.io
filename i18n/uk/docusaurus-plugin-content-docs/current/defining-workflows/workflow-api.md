---
sidebar_position: 6
title: Workflow API
sidebar_label: Workflow API
description: Довідник Workflow API.
tags:
  - reference
  - workflows
  - api
keywords:
  - workflow API
---

# Workflow API {#workflow-api}

Ця сторінка містить повний довідник. Для простішого викладу дивіться сторінку окремої можливості.

- [Workflow](./workflows.md) описує структуру класу workflow та модель детермінованої оркестрації.
- [Activity](./activities.md) описує побічні ефекти, повторні спроби й маршрутизацію.
- [Локальні activity](../features/local-activities.md) описують коротку роботу activity в тому самому процесі з історією activity та семантикою повторних спроб.
- [Signal](../features/signals.md), [update](../features/updates.md) та [query](../features/queries.md) описують контракти взаємодії з workflow.
- [Timer](../features/timers.md), [очікування умов](../features/condition-waits.md) та [продовження як новий запуск](../features/continue-as-new.md) описують керування тривалим виконанням.
- [Потоки повідомлень](../features/message-streams.md) описують повторювані впорядковані повідомлення із семантикою курсора.

## Додаткові відомості для ШІ {#more-info-for-ai}

Більшість читачів може пропустити блок нижче. Відкрийте його, якщо потрібні точні сигнатури, контракти повернення, відомості для автоматизації або повний API в одному місці.

<details id="workflow-api-details">
<summary><b>Додаткові відомості для ШІ</b></summary>

**Базовий об’єкт workflow**

```php
use Workflow\V2\Workflow;

abstract class Workflow
{
    public ?string $connection = null;
    public ?string $queue = null;

    public function workflowId(): string;
    public function runId(): string;
    public function lastChild(): ?ChildWorkflowHandle;
    public function children(): array;
    public function historyLength(): int;
    public function historySize(): int;
    public function shouldContinueAsNew(): bool;
}
```

| Член | Коли використовувати | Контракт повернення |
| --- | --- | --- |
| `workflowId()` | Workflow потрібен стабільний публічний ідентифікатор екземпляра. | Рядок ідентифікатора екземпляра, незмінний між continue-as-new. |
| `runId()` | Workflow потрібен ідентифікатор поточного запуску. | Рядок ідентифікатора запуску обраного виконання. |
| `lastChild()` | Workflow має надіслати signal останньому створеному дочірньому workflow. | `ChildWorkflowHandle` або `null`. |
| `children()` | Workflow потрібні дескриптори дочірніх workflow, видимих поточній послідовності відтворення. | Список `ChildWorkflowHandle`. |
| `historyLength()` | Workflow потрібен кількісний показник бюджету історії. | Поточна кількість подій історії. |
| `historySize()` | Workflow потрібен показник бюджету історії в байтах. | Приблизний розмір збереженої історії в байтах. |
| `shouldContinueAsNew()` | Workflow має перейти до нового запуску до того, як історія стане дорогою. | `true`, якщо налаштовані бюджети історії рекомендують перехід. |

## Стійкі команди {#durable-commands}

Статичний фасад делегує виклики допоміжним функціям у просторі імен `Workflow\V2`. Обидві форми еквівалентні:

```php
use Workflow\V2\Workflow;
use function Workflow\V2\activity;

$resultFromFacade = Workflow::activity(SendReceipt::class, $orderId);
$resultFromHelper = activity(SendReceipt::class, $orderId);
```

<span id="durable-command-surface"></span>

| Фасад | Допоміжна функція | Сигнатура | Стійкий ефект |
| --- | --- | --- | --- |
| `Workflow::activity()` | `activity()` | `activity(string $activity, mixed ...$arguments): mixed` | Планує activity та очікує її результат. |
| `Workflow::executeActivity()` | `activity()` | `executeActivity(string $activity, mixed ...$arguments): mixed` | Псевдонім `activity()`. |
| `Workflow::localActivity()` | `localActivity()` | `localActivity(string $activity, mixed ...$arguments): mixed` | Виконує коротку activity в поточному процесі worker workflow та записує історію activity з `execution_mode=local`. |
| `Workflow::executeLocalActivity()` | `localActivity()` | `executeLocalActivity(string $activity, mixed ...$arguments): mixed` | Псевдонім `localActivity()`. |
| `Workflow::child()` | `child()` | `child(string $workflow, ChildWorkflowOptions? $options = null, mixed ...$arguments): mixed` | Запускає дочірній workflow та очікує його результат. Передайте `ChildWorkflowOptions` першим аргументом для політики закриття батьківського workflow (типово `ParentClosePolicy::Abandon`) чи перевизначення маршрутизації дочірнього. |
| `Workflow::executeChildWorkflow()` | `child()` | `executeChildWorkflow(string $workflow, ChildWorkflowOptions? $options = null, mixed ...$arguments): mixed` | Псевдонім `child()`. |
| `Workflow::async()` | `async()` | `async(callable $callback): mixed` | Виконує callable як автоматично згенерований дочірній workflow. |
| `Workflow::all()` | `all()` | `all(iterable $calls): mixed` | Очікує паралельні виклики та повертає результати в порядку ітерації. |
| `Workflow::parallel()` | `all()` | `parallel(iterable $calls): mixed` | Псевдонім `all()`. |
| `Workflow::select()` | `select()` | `select(iterable $calls): SelectionResult` | Починає незалежні стійкі виклики та повертає першого зафіксованого переможця і стабільні дескриптори всіх учасників. |
| `Workflow::await()` | `await()` | `await(callable\|string $condition, int\|string\|CarbonInterval\|null $timeout = null, ?string $conditionKey = null): mixed` | Очікує іменований signal або умову, безпечну для відтворення. |
| `Workflow::awaitWithTimeout()` | `await()` | `awaitWithTimeout(int\|string\|CarbonInterval $timeout, callable\|string $condition, ?string $conditionKey = null): mixed` | Очікує signal чи умову з явним тайм-аутом. |
| `Workflow::awaitSignal()` | `await()` | `awaitSignal(string $name): mixed` | Очікує іменований signal. |
| `Workflow::timer()` | `timer()` | `timer(int\|string\|CarbonInterval $duration): mixed` | Призупиняє виконання до просування стійкого часу. |
| `Workflow::sideEffect()` | `sideEffect()` | `sideEffect(callable $callback): mixed` | Записує недетермінований результат в історію та відтворює його. |
| `Workflow::uuid4()` | `uuid4()` | `uuid4(): mixed` | Генерує стабільний під час відтворення UUIDv4. |
| `Workflow::uuid7()` | `uuid7()` | `uuid7(): mixed` | Генерує стабільний під час відтворення UUIDv7. |
| `Workflow::continueAsNew()` | `continueAsNew()` | `continueAsNew(mixed ...$arguments): mixed` | Завершує поточний запуск та починає новий для того самого екземпляра. |
| `Workflow::getVersion()` | `getVersion()` | `getVersion(string $changeId, int $minSupported = WorkflowStub::DEFAULT_VERSION, int $maxSupported = 1): mixed` | Узгоджує версію коду workflow, безпечну для відтворення. |
| `Workflow::patched()` | `patched()` | `patched(string $changeId): mixed` | Повертає, чи запуск перетнув іменований маркер зміни. |
| `Workflow::deprecatePatch()` | `deprecatePatch()` | `deprecatePatch(string $changeId): mixed` | Зберігає маркер зміни після видалення старого коду. |
| `Workflow::upsertMemo()` | `upsertMemo()` | `upsertMemo(array $entries): void` | Оновлює неіндексовані метадані запуску. |
| `Workflow::upsertSearchAttributes()` | `upsertSearchAttributes()` | `upsertSearchAttributes(array $attributes): void` | Оновлює індексовані метадані, видимі оператору. |
| `Workflow::now()` | `now()` | `now(): CarbonInterface` | Читає детермінований час workflow. |

`activity()` та `executeActivity()` планують стійкі завдання activity в черзі.
`localActivity()` та `executeLocalActivity()` працюють у поточному процесі worker workflow й записують звичайну історію activity з локальним маркером. Використовуйте `sideEffect()` для знімків, безпечних для відтворення, яким не потрібна семантика повторних спроб, тайм-ауту, heartbeat чи скасування activity. Використовуйте `Workflow::workerSession()` або `Workflow\V2\workerSession()`, коли кільком звичайним крокам activity потрібен підтримуваний контракт прив’язки до сесії worker. Повний контракт виконання наведено в [моделі виконання activity](/docs/features/activity-execution-model), [локальних activity](/docs/features/local-activities) та [сесіях worker](/docs/features/worker-sessions).

**Допоміжні функції timer**

Допоміжні функції timer — скорочення для `timer()` та `Workflow::timer()`:

```php
use Workflow\V2\Workflow;

Workflow::seconds(30);
Workflow::minutes(5);
Workflow::hours(2);
Workflow::days(1);
Workflow::weeks(1);
Workflow::months(1);
Workflow::years(1);
```

| Допоміжна функція | Еквівалент |
| --- | --- |
| `seconds(int $seconds)` | `timer($seconds)` |
| `minutes(int $minutes)` | `timer($minutes * 60)` |
| `hours(int $hours)` | `timer($hours * 3600)` |
| `days(int $days)` | `timer($days * 86400)` |
| `weeks(int $weeks)` | `timer($weeks * 604800)` |
| `months(int $months)` | `timer("{$months} months")` |
| `years(int $years)` | `timer("{$years} years")` |

Використовуйте явні виклики `timer()`, коли тривалість походить із налаштувань чи вхідних даних workflow. Використовуйте допоміжні функції timer, коли вихідний код має виражати фіксоване очікування бізнес-процесу.

**Потоки повідомлень**

Відкривайте стійкі потоки повідомлень з екземпляра workflow:

```php
use Workflow\V2\MessageStream;
use Workflow\V2\Workflow;

final class AssistantWorkflow extends Workflow
{
    public function handle(string $targetWorkflowId): array
    {
        $message = $this->inbox('ai.user')->receiveOne();

        if ($message === null) {
            return ['status' => 'waiting'];
        }

        $reply = $this->outbox('ai.assistant')->sendReference(
            targetInstanceId: $targetWorkflowId,
            payloadReference: 'app://payloads/reply-123',
            correlationId: $this->workflowId(),
            idempotencyKey: 'reply-123',
            metadata: ['kind' => 'assistant_reply'],
        );

        return [
            'status' => 'sent',
            'stream' => $reply->stream_key,
            'sequence' => $reply->sequence,
        ];
    }
}
```

| Метод | Сигнатура | Контракт |
| --- | --- | --- |
| `$this->messages()` | `messages(?string $streamKey = null, ?MessageService $messages = null): MessageStream` | Відкриває потік для читання чи надсилання. |
| `$this->inbox()` | `inbox(?string $streamKey = null, ?MessageService $messages = null): MessageStream` | Псевдонім для коду вхідних повідомлень. |
| `$this->outbox()` | `outbox(?string $streamKey = null, ?MessageService $messages = null): MessageStream` | Псевдонім для коду вихідних повідомлень. |
| `MessageStream::key()` | `key(): string` | Повертає ключ потоку. |
| `MessageStream::cursor()` | `cursor(): int` | Повертає стійку позицію курсора цього запуску. |
| `MessageStream::hasPending()` | `hasPending(): bool` | Повертає, чи потік містить неспожиті повідомлення. |
| `MessageStream::pendingCount()` | `pendingCount(): int` | Повертає кількість неспожитих повідомлень потоку. |
| `MessageStream::peek()` | `peek(int $limit = 100): Collection` | Читає очікувані повідомлення без споживання. |
| `MessageStream::receive()` | `receive(int $limit = 1, ?int $consumedBySequence = null): Collection` | Читає та споживає повідомлення, записуючи просування курсора. |
| `MessageStream::receiveOne()` | `receiveOne(?int $consumedBySequence = null): ?WorkflowMessage` | Читає та споживає одне повідомлення. |
| `MessageStream::sendReference()` | `sendReference(string $targetInstanceId, ?string $payloadReference = null, MessageChannel\|string $channel = MessageChannel::WorkflowMessage, ?string $correlationId = null, ?string $idempotencyKey = null, array $metadata = [], ?DateTimeInterface $expiresAt = null): WorkflowMessage` | Надсилає впорядковане повідомлення з посиланням на дані іншому екземпляру workflow. |

Використовуйте потоки повідомлень для повторюваних упорядкованих повідомлень із семантикою курсора. Використовуйте [signal](../features/signals.md) для одноразових зовнішніх подій та [update](../features/updates.md) для змін за моделлю запит/повернення.

**Атрибути та публічні контракти**

```php
use Workflow\QueryMethod;
use Workflow\UpdateMethod;
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

#[Type('order-approval')]
#[Signal('approved-by', [
    ['name' => 'approvedBy', 'type' => 'string', 'allows_null' => false],
])]
final class OrderApprovalWorkflow extends Workflow
{
    private string $stage = 'waiting';

    public function handle(): void
    {
        $this->stage = Workflow::awaitSignal('approved-by');
    }

    #[QueryMethod('current-stage')]
    public function currentStage(): string
    {
        return $this->stage;
    }

    #[UpdateMethod('mark-ready')]
    public function markReady(): string
    {
        return $this->stage = 'ready';
    }
}
```

| Атрибут | Ціль | Стабільний контракт |
| --- | --- | --- |
| `#[Type('type-key')]` | Клас workflow чи activity | Оголошує стійкий ключ типу, незалежний від мови. |
| `#[Signal('signal-name', [...])]` | Клас workflow, можна повторювати | Оголошує прийняті назви signal та необов’язкові впорядковані контракти параметрів. |
| `#[QueryMethod('query-name')]` | Метод workflow | Оголошує назву query, безпечну для відтворення. Без явної назви використовується назва PHP-методу. |
| `#[UpdateMethod('update-name')]` | Метод workflow | Оголошує назву update, безпечну для відтворення. Без явної назви використовується назва PHP-методу. |

Signal, query та update — публічні контракти workflow. Віддавайте перевагу явним назвам, щоб перейменування PHP-методів не порушувало API.

**Можливі помилки**

Помилки API написання workflow є стійкими помилками workflow, якщо команду не відхилено до виконання:

| API | Типова помилка | Значення для оператора |
| --- | --- | --- |
| `activity()` | Activity викидає виняток, перевищує тайм-аут чи вичерпує політику повторних спроб. | Запуск записує історію помилки activity та дотримується обробки помилок workflow. |
| `child()` | Дочірній workflow завершується з помилкою, скасовується, примусово завершується чи перевищує тайм-аут. | Батьківський workflow бачить помилку дочірнього на команді очікування. |
| `await()` | Тайм-аут спливає до виконання умови чи отримання signal. | Очікування повертається чи завершується з помилкою відповідно до обраної форми await. |
| `timer()` | Некоректна тривалість після нормалізації. | Код має передавати додатну тривалість або явне очікування нульової тривалості. |
| `continueAsNew()` | Новий запуск неможливо створити. | Поточний запуск залишається джерелом відомостей про невдалий перехід. |
| `upsertSearchAttributes()` | Ключ, кількість чи загальний розмір атрибутів перевищують межі. | Запуск завершується з помилкою до збереження некоректних індексованих метаданих. |
| `MessageStream::receive()` | Немає додатної послідовності історії workflow. | Отримання має відбуватися під час виконання workflow, а не безпосередньо з коду сервісу. |
| `MessageStream::sendReference()` | Посилання на дані, маршрут чи контракт сховища некоректні на стороні отримувача. | Упорядкування повідомлень залишається відокремленим від цілісності сховища даних. |

Обмеження даних та історії наведено в [структурних обмеженнях](../constraints/structural-limits.md). Відповіді відхилення команд поза кодом PHP workflow наведено в [довіднику Server API](../polyglot/server-api-reference.md).

**Правила детермінованості**

Код workflow має бути безпечним для відтворення. Розміщуйте незворотну чи недетерміновану роботу за стійкими командами:

```php
use Workflow\V2\Workflow;

final class DeterministicWorkflow extends Workflow
{
    public function handle(): array
    {
        $workflowTime = Workflow::now();
        $stableId = Workflow::uuid7();
        $remoteQuote = Workflow::activity(FetchQuote::class);

        return [
            'time' => $workflowTime->toIso8601String(),
            'id' => $stableId,
            'quote' => $remoteQuote,
        ];
    }
}
```

- Використовуйте `Workflow::now()` замість реального часу в гілках workflow.
- Використовуйте `Workflow::uuid4()` або `Workflow::uuid7()` замість прямої випадковості.
- Розміщуйте мережеві виклики, записи до файлової системи, надсилання листів та зовнішні побічні ефекти в activity.
- Використовуйте `Workflow::sideEffect()` лише тоді, коли значення потрібно зафіксувати в історії, а сам побічний ефект не є бізнес-дією.
- Використовуйте `Workflow::getVersion()`, `Workflow::patched()` та `Workflow::deprecatePatch()` для розвитку коду workflow без порушення відтворення.

</details>
