---
sidebar_position: 8
tags:
  - signals
  - queries
  - continue-as-new
  - sample-app
keywords:
  - розмовний workflow
  - тривала розмова
  - схвалення людиною
  - заміна worker
---

# Еталонний розмовний workflow {#conversational-workflow-reference}

Це один виконуваний еталон тривалої розмови у вбудованому runtime Laravel.
Він поєднує можливості, що мають власні посібники:
[signal](./features/signals.md) для впорядкованого вводу,
[activity](./defining-workflows/activities.md) для роботи моделі,
[query](./features/queries.md) для статусу та
[continue-as-new](./features/continue-as-new.md) для обмеження історії. Worker
сервісного режиму використовують ті самі примітиви через свої
[посібники SDK](./polyglot/deployment-modes.md).

Вихідний код — `ConversationWorkflow` у
[прикладі застосунку](./sample-app.md), у каталозі
[`app/Workflows/Conversation`](https://github.com/durable-workflow/sample-app/tree/main/app/Workflows/Conversation).
Він використовує детерміновану імітацію моделі, тому не потребує облікового
запису постачальника AI чи секретів. Це еталон шаблону стійкості, а не чат-бот
для production, і він не дає жодних обіцянок щодо затримки чи масштабу.

## Запуск {#run-it}

Коли worker черги прикладу застосунку працює (`composer run dev`):

```bash
php artisan app:conversation \
  --message="Hello" \
  --message="Please refund my order" \
  --message="Thanks" \
  --turns-per-run=2
```

Без `--message` команда запитує ввід. Повідомлення, що містить «refund»,
змушує імітацію моделі запропонувати дію, і команда запитує схвалення.
`--decision=decline` відповідає на сценарні запити схвалення відмовою.
Відкрийте `/waterline`, щоб переглянути кожен запуск у ланцюжку.

## Як працює хід {#how-a-turn-works}

```php
#[Signal('message', [['name' => 'text', 'type' => 'string']])]
#[Signal('decision', [
    ['name' => 'proposalId', 'type' => 'string'],
    ['name' => 'approved', 'type' => 'bool'],
    ['name' => 'reviewer', 'type' => 'string'],
])]
class ConversationWorkflow extends Workflow
{
    public function handle(array $state = [], int $turnsPerRun = 3, int $inactivitySeconds = 3600): array
    {
        $this->state = array_replace($this->state, $state);

        while (true) {
            if ($this->turnsThisRun >= $turnsPerRun) {
                return continueAsNew(
                    array_replace($this->state, ['generation' => $this->state['generation'] + 1]),
                    $turnsPerRun,
                    $inactivitySeconds,
                );
            }

            $text = await('message', $inactivitySeconds);

            // A null text is the inactivity timeout; "/end" finishes.
            // Otherwise one turn runs:
            //   activity(FakeModelActivity::class, ...) proposes a reply
            //   uuid4() records an ID for a proposed action (replay-safe)
            //   await('decision', ...) waits for a decision naming that ID
            //   activity(RecordReplyActivity::class, ...) stores the reply
        }
    }
}
```

1. Кожен signal `message` — це один ввід користувача. Workflow застосовує
   прийняті повідомлення по одному ходу за раз у порядку їхнього прийняття.
2. Виклик моделі виконується в activity. Відтворення повторно використовує
   зафіксований результат замість повторного виклику моделі.
3. Коли модель пропонує дію, workflow призначає їй ID через `uuid4()`. Він
   записує значення в історію, тож відтворення повертає той самий ID. Потім
   workflow чекає на signal `decision`, що повторює цей ID; query `status`
   повідомляє його. Signals буферизуються за назвою, тому рішення щодо
   будь-якої іншої пропозиції (надіслане зарано, двічі або повторно після
   невизначеної відповіді) ігнорується, а не застосовується до наступної
   пропозиції. Лише схвалення пропозиції, що очікує, запускає
   `ApplyApprovedActionActivity`. Відмова або тайм-аут записують відповідь і
   нічого не змінюють.
4. `RecordReplyActivity` записує відповідь у таблицю застосунку
   `conversation_records` за посиланням, побудованим з ID workflow і номера
   ходу. Історія зберігає лише це посилання.
5. Query `status` повідомляє фазу (`waiting_for_input`, `thinking`,
   `awaiting_approval`, `applying_action`, `recording_reply`,
   `continuing_as_new` або `completed`), покоління, кількість ходів, пропозицію,
   що очікує на рішення, якщо вона є, і посилання на останню відповідь. Текст
   відповіді читайте за цим посиланням.

## Що переживає втрату worker {#what-survives-a-lost-worker}

Тести прикладу виконують рушій по одному завданню за раз і зупиняють worker в
обраній точці:

| Збій | Що відбувається |
| --- | --- |
| Worker отримує в оренду завдання, що застосовує повідомлення, а потім припиняє роботу | Нічого не просувається, доки оренда не завершиться. Потім прохід відновлення передає те саме завдання іншому worker, який застосовує повідомлення один раз. |
| Worker припиняє роботу під час виконання activity моделі | Після завершення оренди activity повторюється на іншому worker. Запуск фіксує одне завершення цієї activity, а відповідь записується один раз. |
| Worker відповіді записує рядок, а потім припиняє роботу до звіту | Повторна спроба знову виконує activity. Оскільки ключем рядка є посилання, залишається одна відповідь. |

Activity виконуються щонайменше один раз: повторна спроба може повторити
роботу, яка вже відбулася поза рушієм. Стійка історія фіксує кожен результат
один раз. Дайте кожному побічному ефекту сталий ключ, як це роблять посилання
відповіді та дії, і передавайте той самий ключ будь-якій зовнішній системі.
Див. [гарантії виконання](./constraints/execution-guarantees.md) та
[завершення оренди й повторну доставку](./constraints/execution-guarantees.md#lease-expiry-and-redelivery).

## Обмеження історії {#bounding-history}

Після `$turnsPerRun` ходів запуск продовжується як новий. Наступний запуск
отримує лише явний стан, переданий у `continueAsNew()`: покоління, кількість
ходів, обмежений підсумок і посилання на останню відповідь. Інші властивості
об’єкта workflow відновлюються відтворенням і не копіюються.

Повідомлення, які було прийнято, але ще не застосовано, переходять до
наступного запуску в початковому порядку. Це стосується оголошених signal,
надісланих екземпляру workflow. Signal, надісланий одному конкретному запуску,
відхиляється, якщо цей запуск закривається раніше. Див.
[прийняття та закриття signal](./features/signals.md#acceptance-and-closure)
і [continue-as-new](./features/continue-as-new.md).

## Що залишається вашою відповідальністю {#what-stays-your-responsibility}

- **Зберігання даних.** Приклад зберігає текст відповідей у таблиці
  застосунку. Оберіть для неї термін зберігання, контроль доступу й резервне
  копіювання або використайте
  [зовнішнє сховище даних](./features/external-payload-storage.md).
- **Підсумовування.** Імітація моделі веде поточний підсумок фіксованої
  довжини. Зі справжньою моделлю ви вирішуєте, який контекст переходить через
  continue-as-new і наскільки великим він може стати.
- **Хто може надсилати ввід або схвалювати.** Рушій записує signal та його
  аргументи. Автентифікуйте й авторизуйте відправників і рецензентів у своєму
  застосунку до надсилання signal; див.
  [особу відправника та авторизацію](./features/signals.md#sender-identity-and-authorization).
- **Зовнішні ефекти.** Рушій не забезпечує виконання зовнішнього виклику рівно
  один раз. Використовуйте ключі ідемпотентності, як це робить activity
  схваленої дії.
- **Повторне надсилання signal.** Якщо відповідь на надсилання signal втрачено,
  перш ніж надсилати його знову, див.
  [після невизначеної відповіді](./features/signals.md#after-an-uncertain-response).

Приклад зберігає відповіді через activity і не використовує потоки повідомлень
з коду workflow. У релізах Workflow до 2.20.0 включно `outbox()->sendReference()`
та `inbox()->receive()` у коді workflow не є безпечними для відтворення
([workflow#1010](https://github.com/durable-workflow/workflow/issues/1010)); див.
попередження в [потоках повідомлень](./features/message-streams.md).

## Пов’язані посібники {#related-guides}

- [Signal](./features/signals.md) і [query](./features/queries.md)
- [Continue-as-new](./features/continue-as-new.md)
- [Потоки повідомлень](./features/message-streams.md)
- [Activity](./defining-workflows/activities.md) і
  [гарантії виконання](./constraints/execution-guarantees.md)
- [Помилки й відновлення](./failures-and-recovery.md)
- [Приклад застосунку](./sample-app.md)
