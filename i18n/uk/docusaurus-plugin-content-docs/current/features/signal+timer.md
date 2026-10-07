---
sidebar_position: 5
---

# Signal + timer {#signal--timer}

`Workflow\V2` підтримує `await($condition, timeout: $seconds, conditionKey: $key)` для очікування умов із тайм-аутом та `await('signal-name', timeout: $seconds)` для очікування іменованих signal із тайм-аутом.

Використовуйте це, коли workflow має продовжитися одразу після того, як умова над стійким відтвореним станом стане істинною, але також має розблокуватися після крайнього строку, якщо стан не зміниться.

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

Повертається `true`, коли умова стає істинною до спрацювання завдання тайм-ауту, та `false`, коли тайм-аут перемагає.

Для іменованих signal `await('name', timeout: minutes(5))` повертає дані signal після надходження та `null`, якщо перемагає тайм-аут. `null` зарезервовано для тайм-ауту: signal без аргументів повертає `true`, з одним аргументом — це значення, з кількома — масив. `Workflow\V2` не використовує застарілі методи зміни стану `#[SignalMethod]`.

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
