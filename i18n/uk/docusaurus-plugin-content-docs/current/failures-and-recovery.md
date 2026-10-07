---
sidebar_position: 11
title: Помилки й відновлення
description: Діагностика помилок activity, винятків без повторних спроб, тайм-аутів run, очищення під час скасування та дій відновлення.
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

- завдання workflow відновлюються через replay зафіксованої історії;
- activity виконуються щонайменше один раз і можуть спостерігатися повторно;
- спливання оренди й повторна доставка є звичайними шляхами відновлення
  та не доводять, що попередній worker не виконав побічний ефект.

Спочатку прочитайте [гарантії виконання й ідемпотентність](./constraints/execution-guarantees.md)
для точної семантики повторних спроб, повторної доставки та стійких
результатів.

## Обробка винятків {#handling-exceptions}

Коли activity викидає виняток, workflow отримує його після вичерпання
кількості `$tries`. До цього система повторює activity за її політикою
повторних спроб. Щоб виняток одразу передавався workflow після помилки,
встановіть `$tries` у 1.

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

Деякі винятки не слід повторювати. Вони називаються non-retryable.
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

Загальний процес виправлення невдалої activity:

1. Перевірте журнали невдалої activity та знайдіть помилки чи винятки.
2. Визначте джерело помилки й виправте код.
3. Розгорніть виправлення на сервері, де працює черга.
4. Перезапустіть або поступово замініть відповідні worker, щоб вони
   отримали новий код і безпечно повторно забрали роботу.
5. Дочекайтеся повторної спроби activity або передавання стійкого
   завдання здоровому worker через відновлення/повторну доставку.
6. Перевірте стійкий результат у Waterline, експорті історії чи Server API.
   Один рядок журналу worker не визначає стійкий результат.
7. Якщо activity продовжує помилятися, повторюйте процес до виправлення.

Це дозволяє workflow залишатися запущеним, поки activity помиляється.
Після виправлення activity workflow завершується зі статусом completed.
Статус failed означає, що всі `$tries` activity вичерпано, а виняток
не оброблено.

## Забезпечення тайм-аутів workflow {#workflow-timeout-enforcement}

За заданих `StartOptions::withExecutionTimeout()` або
`StartOptions::withRunTimeout()` рушій записує дедлайн run workflow.
Дедлайн виконання охоплює весь логічний workflow, включно з run
continue-as-new, а дедлайн окремого run скидається для кожного нового run.

Якщо дедлайн минув на момент запуску завдання workflow, run одразу закривається:

- Усі відкриті виконання activity, timer і незавершені завдання
  скасовуються з типізованими подіями історії (`ActivityCancelled`, `TimerCancelled`).
- Записується рядок `WorkflowFailure` з `failure_category = timeout`
  і `propagation_kind = timeout`.
- Записується подія історії `WorkflowTimedOut` з `timeout_kind`, заданим
  як `execution_timeout` або `run_timeout`.
- Статус run стає `failed` з `closed_reason = timed_out`.
- Батьківські workflow, що очікують дочірній із тайм-аутом, отримують
  повідомлення.

Фоновий watchdog завдань також шукає нетермінальні run з минулими
дедлайнами без відкритого завдання workflow, наприклад run, що очікує
activity або timer на момент спливання дедлайну. Знайшовши такий run,
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
як стан runtime, повертає рядок `activity_executions` до `pending`,
записує типізовану подію історії `ActivityRetryScheduled` для невдалої
спроби та створює нове стійке завдання activity з `available_at` за
політикою `backoff()`. Workflow продовжує очікувати те саме виконання
activity й отримує виняток лише після помилки останньої дозволеної спроби.

Завдання повторної спроби записує `retry_of_task_id`,
`retry_after_attempt_id`, `retry_after_attempt` і `retry_backoff_seconds`
у payload, щоб Waterline пояснював причину планування. Деталі обраного
run спочатку відновлюють невдалу спробу в `activities[*].attempts`
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

- **Рядки помилок**: boolean-стовпець `workflow_failures.non_retryable`.
- **Події історії**: поле `non_retryable` у типізованому payload події.
- **Знімки помилок**: `non_retryable` у `FailureSnapshots::forRun()`.
- **Деталі run**: `non_retryable` у масиві винятків.
- **Записи часової шкали**: `non_retryable` у метаданих деталей помилки.
- **Експорт історії**: `non_retryable` у масиві `failures[*]`.
- **Waterline**: позначка «non-retryable» біля категорії помилки в таблиці
  винятків і часовій шкалі.
- **Міст зовнішніх worker**: payload команди `complete()` приймає
  `non_retryable`, щоб зовнішні worker workflow повідомляли такі помилки
  без потреби хост-процесу розв’язувати клас throwable.

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
рівні workflow. Коли run workflow завершується помилкою через необроблений
виняток, структурний ліміт або тайм-аут, він стає термінальним. Рушій
не запускає автоматично новий run того самого екземпляра workflow.

Це свідоме рішення:

- **Activity уже мають повторні спроби.** Політики activity з
  налаштованими `$tries`, `backoff()` і винятками non-retryable
  обробляють тимчасові помилки на відповідному рівні.
- **Replay workflow є примітивом відновлення.** Якщо завдання workflow
  зустрічає тимчасову інфраструктурну помилку, як помилка бази чи падіння
  worker, система стійких завдань повторно надсилає його, а replay
  продовжує зафіксовану історію без нового run.
- **Continue-as-new обслуговує довготривалі workflow.** Workflow, яким
  потрібен свіжий стан чи ущільнення історії, використовують
  `continueAsNew()` як явний перезапуск на рівні workflow.
- **Repair відновлює застряглі run.** Команда `repair()` та автоматичне
  відновлення циклу worker відновлюють run після втрати транспорту
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
  пояснюють контракт replay, повторних спроб, спливання оренди та
  повторної доставки, що визначає кожен шлях відновлення на цій сторінці.
- [Моніторинг](./monitoring.md) пояснює, де Waterline, експорт історії,
  журнали worker і телеметрія runtime показують описані факти помилок.
