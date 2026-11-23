---
sidebar_position: 5
---

# Signal + timer {#signal--timer}

`Workflow\V2` підтримує `await($condition, timeout: $seconds, conditionKey: $key)` для очікування умов із тайм-аутом та `await('signal-name', timeout: $seconds)` для очікування іменованих signal із тайм-аутом.

Використовуйте це, коли workflow має продовжитися одразу після того, як умова над стійким відтвореним станом стане істинною, але також має розблокуватися після крайнього строку, якщо стан не зміниться.

PHP workflow у сервісному режимі використовують `timeout` у `WorkflowContext::waitCondition()` і `deferCondition()`. Починаючи з PHP SDK 3.9.0, він приймає ті самі рядки тривалості та інтервали, що й вбудований `await()`; див. [тривалості PHP SDK](../polyglot/php.md#durations).

```php
use Workflow\UpdateMethod;
use function Workflow\V2\await;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

use function Workflow\V2\minutes;

#[Type('approval-with-timeout')]
class MyWorkflow extends Workflow
{
    private bool $ready = false;

    public function handle(): string
    {
        $approved = await(fn () => $this->ready, timeout: minutes(5), conditionKey: 'approval.ready');

        return $approved ? 'approved' : 'timed out';
    }

    #[UpdateMethod]
    public function markReady(bool $ready = true): array
    {
        $this->ready = $ready;

        return ['ready' => $this->ready];
    }
}
```

import SignalTimerSimulator from '@site/src/components/SignalTimerSimulator';

<SignalTimerSimulator />

`await()` із параметром `timeout:` працює так:

- Предикат має залежати лише від відтворених стійких даних: результатів activity, змін update чи результатів дочірніх workflow. Нестійкий стан не пробудить очікування.
- Необов’язковий ключ умови — стабільна операторська мітка очікування. Відтворення перевіряє ключ щодо попередньої історії, щоб нове розгортання не могло непомітно використати той самий крок workflow для іншого предиката.
- Якщо предикат стає істинним до спрацювання timer, `await()` повертає `true`.
- Якщо першим настає крайній строк, `await()` повертає `false`.

Для читабельних значень тайм-ауту доступні допоміжні функції timer: `seconds()`, `minutes()`, `hours()`, `days()`, `weeks()`, `months()`, `years()`.

Для стійкої зміни предиката з коду застосунку викличте оголошений update:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('approval-with-timeout');

$workflow->markReady();
```

У вбудованому режимі Laravel діє порядок подій в історії виконання. Update, прийнятий до події `TimerFired` для цього очікування, може задовольнити умову, навіть якщо worker застосує його після спрацювання timer. Результат визначає перший стан, що задовольняє умову. Невдалі update й ті, що прийняті після `TimerFired`, не можуть задовольнити цю умову. Якщо позначки часу збігаються, порядок визначають позиції подій в історії. Після завершення очікування повторне відтворення використовує записаний результат.

Це саме правило діє для умови в `select()` та її тайм-ауту. Іменований signal може завершити очікування, якщо його отримано до відповідної події `TimerFired`.

Для іменованих signal `await('name', timeout: minutes(5))` повертає дані signal після надходження та `null`, якщо перемагає тайм-аут. `null` зарезервовано для тайм-ауту: signal без аргументів повертає `true`, з одним аргументом — це значення, з кількома — масив. `Workflow\V2` не використовує застарілі методи зміни стану `#[SignalMethod]`.

Про порядок у service mode див. [умови з обмеженням часу в Native Server](../polyglot/workflow-signals.md#timed-condition-order).

## Допоміжна функція `awaitWithTimeout()` {#awaitwithtimeout-helper}

`Workflow::awaitWithTimeout($timeout, $condition, $conditionKey = null)` — зручна оболонка для `await($condition, timeout: $timeout, conditionKey: $conditionKey)`. Крайній строк стоїть першим аргументом, щоб намір обмежити очікування був очевидним у місці виклику.

```php
use function Workflow\V2\{await, minutes};
use Workflow\V2\Workflow;

#[Type('approval-with-timeout')]
class MyWorkflow extends Workflow
{
    private bool $ready = false;

    public function handle(): string
    {
        $approved = Workflow::awaitWithTimeout(
            minutes(5),
            fn () => $this->ready,
            'approval.ready',
        );

        return $approved ? 'approved' : 'timed out';
    }

    #[UpdateMethod]
    public function markReady(bool $ready = true): array
    {
        $this->ready = $ready;

        return ['ready' => $this->ready];
    }
}
```

Семантика повернення така сама, як у `await()` із `timeout:`: виклик повертає `true`, якщо умова перемагає, `false`, якщо крайній строк перемагає для callable-предиката, дані signal, якщо іменований signal перемагає, та `null`, якщо крайній строк перемагає для іменованого signal.

`awaitWithTimeout()` виражає «очікувати умову не довше цього часу», тоді як інша форма — «очікувати умову з параметром тайм-ауту». Обирайте форму, зрозумілішу в місці виклику. Середовище виконання трактує їх однаково, і вони записують ту саму історію workflow.
