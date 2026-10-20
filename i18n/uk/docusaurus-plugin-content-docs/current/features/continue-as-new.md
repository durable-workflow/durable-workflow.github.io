---
sidebar_position: 14
tags:
  - continue-as-new
  - history
  - message-streams
  - workflows
keywords:
  - continue as new
  - зростання історії workflow
  - передача виконання новому запуску
  - перенесення потоку повідомлень
---

# Continue As New {#continue-as-new}

Шаблон **Continue As New** дає активному workflow змогу перезапустити себе з новими аргументами.
Він корисний, коли потрібно:

* Запобігти необмеженому зростанню історії workflow.
* Моделювати цикли або рекурсивні workflow.
* Розділити тривалі workflow на менші керовані виконання зі збереженням безперервності.

## Використання `continueAsNew` {#using-continueasnew}

Щоб почати workflow як новий запуск, викличте допоміжну функцію `continueAsNew(...)` усередині методу `handle()` workflow. `continueAsNew()` є повноцінним переходом між запусками.

```php
use function Workflow\V2\activity;
use function Workflow\V2\continueAsNew;
use Workflow\V2\Workflow;

class CounterWorkflow extends Workflow
{
    public function handle(int $count = 0, int $max = 3)
    {
        $result = activity(CountActivity::class, $count);

        if ($count >= $max) {
            return [
                'count' => $result,
                'workflow_id' => $this->workflowId(),
                'run_id' => $this->runId(),
            ];
        }

        return continueAsNew($count + 1, $max);
    }
}
```

У цьому прикладі:

* Workflow виконує activity на кожній ітерації.
* Якщо максимального лічильника ще не досягнуто, він продовжується новим запуском зі збільшеними аргументами.
* Остаточний результат повертається лише після завершення циклу.

Під час continue-as-new:

- ID екземпляра залишається сталим у всьому ланцюжку, а `WorkflowStub::runId()` переходить до найновішого запуску.
- Продовжений запуск закривається як `completed` / `continued`, а наступний одразу починається з новим ID запуску.
- Signal, query, update та команди оператора для екземпляра знаходять найновіший стійкий запуск. Команди для конкретного запуску залишаються прив'язаними до нього.

Core 2.7.0 і сумісні Server зберігають прийняті сигнали для екземпляра, обробник
яких оголошений контрактом команд запуску і які попередній запуск ще не
застосував. Вони переходять разом із прийнятими
незастосованими update у початковому порядку команд. Ідентифікатори сигналів
і команд, байти аргументів та час прийняття не змінюються. Уже застосований
сигнал не доставляється наступному запуску повторно. Передавайте потрібний
бізнес-стан через аргументи `continueAsNew()`: довільний локальний стан
автоматично не копіюється.

Сигнал для конкретного запуску не переспрямовується. Якщо його неможливо
застосувати до закриття цього запуску, він отримує явний стан відмови,
описаний у розділі [прийняття та закриття сигналів](./signals.md#acceptance-and-closure).
Відсутні оголошення старого запуску не дають права на передачу; такі сигнали
явно закриваються в попередньому запуску.

Тривалі цикли можуть звільнятися від накопиченої історії без створення нового публічного ID workflow за кожного переходу запуску.

## Бюджет історії {#history-budget}

Код workflow може перевіряти поточну довжину історії та прапорець рекомендації continue-as-new через явний контекст runtime. Це дає тривалим циклам змогу свідомо передавати виконання до досягнення граничного бюджету історії.

```php
use function Workflow\V2\activity;
use function Workflow\V2\continueAsNew;
use Workflow\V2\Workflow;

class PollingWorkflow extends Workflow
{
    public function handle(int $iteration = 0)
    {
        $result = activity(PollActivity::class);

        if ($this->shouldContinueAsNew()) {
            return continueAsNew($iteration + 1);
        }

        return ['result' => $result, 'iteration' => $iteration];
    }
}
```

### Доступні методи {#available-methods}

| Метод | Тип результату | Опис |
| --- | --- | --- |
| `$this->historyLength()` | `int` | Кількість подій історії поточного запуску |
| `$this->historySize()` | `int` | Загальний розмір подій історії в байтах |
| `$this->shouldContinueAsNew()` | `bool` | `true`, коли запуск перевищує налаштований бюджет кількості подій або розміру в байтах |

### Налаштування {#configuration}

Пороги рекомендації continue-as-new можна налаштувати:

```php
// config/workflows.php
'v2' => [
    'history_budget' => [
        'continue_as_new_event_threshold' => 10000,
        'continue_as_new_size_bytes_threshold' => 5242880, // 5 MB
    ],
],
```

`shouldContinueAsNew()` повертає `true` після перетину будь-якого порога. Стислі представлення запусків також відстежують `history_event_count`, `history_size_bytes` та `continue_as_new_recommended`, щоб Waterline міг позначати тривалі запуски в загальних представленнях.

## Перенесення метаданих {#metadata-carry-forward}

Під час continue-as-new новий запуск автоматично успадковує метадані попереднього:

| Метадані | Правила перенесення |
| --- | --- |
| Атрибути пошуку | Переноситься повна об’єднана мапа, включно з оновленнями під час запуску |
| Memo | Переноситься повна об’єднана мапа, включно з оновленнями під час запуску |
| Позначки видимості | Переносяться без змін, задаються один раз на початку |
| Бізнес-ключ | Переноситься без змін |
| Маркер сумісності | Переноситься, щоб новий запуск призначався тій самій збірці worker |
| Позиція курсора повідомлень | Переноситься, щоб новий запуск знав, які вхідні повідомлення вже спожито через [Потоки повідомлень](./message-streams.md) |

Новий запуск починається з успадкованих метаданих і може продовжувати оновлення атрибутів пошуку й memo. Тому тривалий workflow опитування може накопичувати метадані між поколіннями, не втрачаючи стан під час звільнення від історії.

```php
use function Workflow\V2\{activity, continueAsNew, upsertMemo, upsertSearchAttributes};
use Workflow\V2\Workflow;

class PollingWorkflow extends Workflow
{
    public function handle(int $iteration = 0)
    {
        $result = activity(PollActivity::class);

        upsertSearchAttributes(['iteration' => (string) $iteration, 'status' => 'polling']);
        upsertMemo(['last_result' => $result, 'iteration' => $iteration]);

        if ($this->shouldContinueAsNew()) {
            // The new run inherits all search attributes and memo
            return continueAsNew($iteration + 1);
        }

        return ['result' => $result, 'iteration' => $iteration];
    }
}
```

Для тривалих циклів введення користувачем або роботи асистента обирайте
повноцінний фасад `$this->inbox()` / `$this->outbox()`
[Потоків повідомлень](./message-streams.md). Очікувані повідомлення потоку
й позиція курсора переходять до продовженого запуску, а спожиті повідомлення
залишаються в початковому запуску як свідчення історії.
