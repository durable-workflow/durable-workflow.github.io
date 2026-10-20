---
sidebar_position: 11
title: Помилки й відновлення
description: Діагностика помилок activity, винятків без повторних спроб, тайм-аутів запуску, очищення під час скасування та дій відновлення.
tags:
  - failures
  - recovery
  - operations
keywords:
  - помилки workflow
  - виняток без повторних спроб
  - відновлення workflow
---

# Помилки й відновлення {#failures-and-recovery}

Перед діагностикою помилки пам’ятайте основний контракт виконання:

- завдання workflow відновлюються через відтворення зафіксованої історії;
- activity виконуються щонайменше один раз і можуть спостерігатися повторно;
- спливання оренди й повторна доставка є звичайними шляхами відновлення
  та не доводять, що попередній worker не виконав побічний ефект.

Спочатку прочитайте [гарантії виконання й ідемпотентність](./constraints/execution-guarantees.md)
для точної семантики повторних спроб, повторної доставки та стійких
результатів.

## Обробка винятків {#handling-exceptions}

`Workflow\V2\Activity` типово має `$tries = 1`: одну спробу без автоматичного повторення після винятку. Перша помилка activity передається workflow. Код workflow може перехопити її, як у прикладі нижче. Якщо виняток не оброблено, запуск завершується помилкою й стає термінальним.

Повторні спроби потрібно явно налаштувати. Задайте `$tries` більше за `1`, щоб дозволити додаткові спроби, або `0` для необмеженої кількості, і виберіть політику `backoff()`. Помилка, яка допускає повторення, передається коду workflow лише після вичерпання налаштованого бюджету спроб або часу. Неповторювана помилка оминає решту повторних спроб.

```php
use Exception;
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public int $tries = 1;

    public function handle(): void
    {
        throw new Exception();
    }
}
```

```php
use Exception;
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(): void
    {
        try {
            $result = activity(MyActivity::class);
        } catch (Exception) {
            // handle the exception here
        }
    }
}
```

## Винятки без повторних спроб {#non-retryable-exceptions}

Деякі винятки не слід повторювати. Це винятки без повторних спроб (non-retryable).
Коли activity викидає такий виняток, workflow одразу позначає activity
невдалою та припиняє повторні спроби.

```php
use Workflow\V2\Activity;
use Workflow\Exceptions\NonRetryableException;

class MyNonRetryableActivity extends Activity
{
    public function handle(): void
    {
        throw new NonRetryableException('This is a non-retryable error');
    }
}
```

## Процес відновлення {#recovery-process}

Спочатку перевірте стійкий статус вибраного запуску й політику повторних спроб activity. За типової єдиної спроби необроблена помилка activity вже зробила запуск термінальним. Розгортання виправлення чи виклик `repair()` не відкриває цей невдалий запуск знову.

Виправлення коду під час очікування початкового запуску можливе, лише поки activity має допустиму повторну спробу. До планування activity задайте `$tries` більше за `1` або `0` для необмеженої кількості спроб і налаштуйте `backoff()`. За потреби задайте `ActivityOptions::$scheduleToCloseTimeout`, щоб обмежити загальну тривалість activity з усіма повторними спробами. Кінцеві терміни workflow залишаються чинними. Дивіться [Повторні спроби](./configuration/options.md#retries), [Затримка між спробами](./configuration/options.md#backoff) та [ActivityOptions](./configuration/options.md#activityoptions). Політика фіксується під час планування activity, тому подальше розгортання не розширює бюджет спроб чи часу наявної activity.

Для запуску, який досі очікує activity з можливістю повторної спроби:

1. Перевірте журнали невдалої activity та знайдіть помилки чи винятки.
2. Визначте джерело помилки й виправте код.
3. Розгорніть виправлення там, де працюють worker черги.
4. Перезапустіть або поступово замініть відповідні worker, щоб вони отримали новий код і безпечно забрали роботу.
5. Нехай справний worker виконає наступну допустиму спробу. Відновлення чи повторна доставка можуть відновити втрачений транспорт завдань, але не дають додаткової бізнес-спроби після закриття activity або запуску.
6. Перевірте стійкий результат у Waterline, експорті історії чи Server API. Один рядок журналу worker не визначає стійкий результат.
7. Якщо activity продовжує помилятися, перевірте залишок бюджету спроб і часу перед повторенням процесу.

Запуск із допустимою повторною спробою activity залишається в очікуванні й може продовжитися після успішного виконання виправленого коду, якщо початкові бюджети не спливли. Це не гарантує виправлення кожного workflow на місці: необроблена остаточна помилка activity, помилка коду workflow, структурне обмеження чи тайм-аут workflow можуть зробити запуск термінальним.

Для термінального невдалого запуску збережіть історію та звірте зовнішні побічні ефекти перед рішенням, чи має застосунок почати новий workflow. Використовуйте ідемпотентність застосунку для повторних бізнес-операцій. Автоматичних повторних запусків усього workflow чи відкриття термінального запуску немає. Дивіться [Повторні спроби рівня workflow](#workflow-level-retry).

## Забезпечення тайм-аутів workflow {#workflow-timeout-enforcement}

За заданих `StartOptions::withExecutionTimeout()` або
`StartOptions::withRunTimeout()` рушій записує кінцевий термін запуску workflow.
Кінцевий термін виконання охоплює весь логічний workflow, включно із запусками
continue-as-new, а кінцевий термін окремого запуску скидається для кожного нового запуску.

Якщо кінцевий термін минув на момент початку завдання workflow, запуск одразу закривається:

- Усі відкриті виконання activity, timer і незавершені завдання
  скасовуються з типізованими подіями історії (`ActivityCancelled`, `TimerCancelled`).
- Записується рядок `WorkflowFailure` з `failure_category = timeout`
  і `propagation_kind = timeout`.
- Записується подія історії `WorkflowTimedOut` з `timeout_kind`, заданим
  як `execution_timeout` або `run_timeout`.
- Статус запуску стає `failed` з `closed_reason = timed_out`.
- Батьківські workflow, що очікують дочірній із тайм-аутом, отримують
  повідомлення.

Фоновий наглядач завдань також шукає нетермінальні запуски зі спливлими
кінцевими термінами без відкритого завдання workflow, наприклад запуск, що очікує
activity або timer на момент спливання терміну. Знайшовши такий запуск,
він створює завдання workflow, щоб виконавець виявив і забезпечив
тайм-аут під час наступного проходу.

Waterline показує `failure_category` в окремому стовпці **Category**
таблиці винятків і деталях помилок часової шкали. Експорт історії містить
`failure_category` у масиві `failures[*]`. Фінальна v2 записує класифікацію
під час помилки. Імпортовані рядки v1, які неможливо класифікувати,
залишаються видимими як некласифікована діагностика.

## Повторні спроби activity {#activity-retries}

`Workflow\V2\Activity` має типове `$tries = 1`, тому помилка activity
одразу повертається workflow, якщо activity явно не вмикає повторні спроби.

```php
use RuntimeException;
use Workflow\V2\Activity;

class ChargeCard extends Activity
{
    public int $tries = 3;

    public function backoff(): array
    {
        return [5, 30];
    }

    public function handle(): string
    {
        throw new RuntimeException('temporary gateway failure');
    }
}
```

Коли activity з дозволеними повторними спробами викидає виняток до
вичерпання `$tries`, рушій закриває поточний рядок `activity_attempts`
як стан середовища виконання, повертає рядок `activity_executions` до `pending`,
записує типізовану подію історії `ActivityRetryScheduled` для невдалої
спроби та створює нове стійке завдання activity з `available_at` за
політикою `backoff()`. Workflow продовжує очікувати те саме виконання
activity й отримує виняток лише після помилки останньої дозволеної спроби.

Завдання повторної спроби записує `retry_of_task_id`,
`retry_after_attempt_id`, `retry_after_attempt` і `retry_backoff_seconds`
у payload, щоб Waterline пояснював причину планування. Деталі обраного
запуску спочатку відновлюють невдалу спробу в `activities[*].attempts`
із типізованої історії activity, показують `ActivityRetryScheduled` на
часовій шкалі та повідомляють кількість повторюваних activity через
`operator_metrics.activities.retrying`,
`operator_metrics.activities.failed_attempts` і
`operator_metrics.backlog.retrying_activities`.

`Workflow\Exceptions\NonRetryableExceptionContract` негайно обходить
політику повторних спроб: виняток non-retryable одразу завершує activity
помилкою й відновлює workflow із цим винятком.

### Ідентичність виконання activity та ідемпотентність {#activity-execution-identity-and-idempotency}

Повторна спроба — не єдина причина повторного спостереження тієї самої
логічної activity. Спливання оренди, втрата worker, затримка повідомлення
завершення та повторна доставка можуть створити іншу спробу чи застаріле
повідомлення завершення того самого стійкого виконання activity.

- `activity_execution_id` визначає логічну activity між повторними
  спробами й доставками. Використовуйте його як типовий ключ
  ідемпотентності віддалених побічних ефектів.
- `activity_attempt_id` визначає одну конкретну спробу логічної activity.
  Використовуйте його лише коли зовнішній системі потрібно розрізняти спроби.
- Пізнє повідомлення завершення чи помилки заміненої спроби є звичайною
  поведінкою застарілої спроби та не доводить подвійної фіксації рушієм.

Під час розслідування пізнього завершення після спливання оренди:

- визначайте переможну стійку спробу за Waterline, експортом історії
  або Server API;
- не вважайте відхилене пізнє завершення доказом відсутності віддаленого
  побічного ефекту;
- перевіряйте зовнішню систему за ключем ідемпотентності перед
  примусовою ручною повторною спробою чи відновленням.

Найбезпечніший типовий підхід — зробити віддалений побічний ефект
ідемпотентним за `activity_execution_id`, а потім визначати за стійким
результатом, чи прийняв рушій повідомлення конкретної спроби.

### Маркери помилок без повторних спроб {#non-retryable-failure-markers}

Коли activity або workflow викидає виняток, що реалізує
`Workflow\Exceptions\NonRetryableExceptionContract`, рушій записує
`non_retryable = true` у рядок `WorkflowFailure` і payload типізованої
події історії (`ActivityFailed`, `WorkflowFailed`, `UpdateCompleted`).
Цей стійкий маркер повідомляє операторам, зовнішнім worker та інструментам,
що помилка постійна й повторення тієї самої операції не допоможе.

Позначка проходить через усі інтерфейси видимості:

- **Рядки помилок**: логічний стовпець `workflow_failures.non_retryable`.
- **Події історії**: поле `non_retryable` у типізованому payload події.
- **Знімки помилок**: `non_retryable` у `FailureSnapshots::forRun()`.
- **Деталі запуску**: `non_retryable` у масиві винятків.
- **Записи часової шкали**: `non_retryable` у метаданих деталей помилки.
- **Експорт історії**: `non_retryable` у масиві `failures[*]`.
- **Waterline**: позначка «non-retryable» біля категорії помилки в таблиці
  винятків і часовій шкалі.
- **Міст зовнішніх worker**: payload команди `complete()` приймає
  `non_retryable`, щоб зовнішні worker workflow повідомляли такі помилки
  без потреби хост-процесу визначати клас викинутого об’єкта.

Для помилок, які не реалізують контракт, `non_retryable` за замовчуванням
дорівнює `false`. Фінальна v2 записує стійкий маркер в момент помилки.
Тому оголосіть контракт до запису помилки, якщо операторам або SDK
потрібно відрізняти постійні помилки від придатних до повторної спроби.

```php
use Workflow\Exceptions\NonRetryableExceptionContract;

class PaymentDeclinedException extends \RuntimeException implements NonRetryableExceptionContract
{
    // This failure will be marked as non-retryable in the durable record.
}
```

## Повторні спроби на рівні workflow {#workflow-level-retry}

Durable Workflow v2 **не** підтримує автоматичних повторних спроб на
рівні workflow. Коли запуск workflow завершується помилкою через необроблений
виняток, структурний ліміт або тайм-аут, він стає термінальним. Рушій
не запускає автоматично новий запуск того самого екземпляра workflow.

Це свідоме рішення:

- **Activity уже мають повторні спроби.** Політики activity з
  налаштованими `$tries`, `backoff()` і винятками non-retryable
  обробляють тимчасові помилки на відповідному рівні.
- **Відтворення workflow є примітивом відновлення.** Якщо завдання workflow
  зустрічає тимчасову інфраструктурну помилку, як помилка бази чи падіння
  worker, система стійких завдань повторно надсилає його, а відтворення
  продовжує зафіксовану історію без нового запуску.
- **Continue-as-new обслуговує довготривалі workflow.** Workflow, яким
  потрібен свіжий стан чи ущільнення історії, використовують
  `continueAsNew()` як явний перезапуск на рівні workflow.
- **Відновлення повертає до роботи застряглі запуски.** Команда `repair()` та автоматичне
  відновлення в циклі worker відновлюють запуски після втрати транспорту
  стійких завдань.

Якщо застосунку потрібна семантика повторних спроб на рівні workflow,
моделюйте її явно:

```php
use function Workflow\V2\activity;
use Throwable;
use Workflow\V2\Workflow;

class RetryableWorkflow extends Workflow
{
    public function handle(string $orderId): void
    {
        try {
            activity(ProcessOrderActivity::class, $orderId);
        } catch (Throwable $e) {
            // Record the failure, then start a new workflow
            // for retry-at-workflow-level scenarios.
            activity(NotifyFailureActivity::class, $orderId, $e->getMessage());
        }
    }
}
```

## Пов’язані посібники {#related-guides}

- [Гарантії виконання й ідемпотентність](./constraints/execution-guarantees.md)
  пояснюють контракт відтворення, повторних спроб, спливання оренди та
  повторної доставки, що визначає кожен шлях відновлення на цій сторінці.
- [Моніторинг](./monitoring.md) пояснює, де Waterline, експорт історії,
  журнали worker і телеметрія середовища виконання показують описані факти помилок.
