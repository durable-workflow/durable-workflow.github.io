---
sidebar_position: 9
---

# Тестування {#testing}

## `Workflow\V2` {#workflowv2}

`Workflow\V2\WorkflowStub::fake()` надає детермінований шлях тестування
безпосередньо в процесі для підтримуваного інтерфейсу fake `V2`.

- готові завдання workflow та activity виконуються в процесі без очікування worker черги;
- вкладені дочірні workflow виконуються як справжні вкладені run `V2` у тому самому режимі fake;
- підміни activity все одно записують стійкі рядки `activity_executions`, завдань та історії;
- перевірки можливостей backend пропускаються для fake, тому `sync` придатний для тестів;
- `WorkflowStub::assertDispatched()`, `assertDispatchedTimes()`, `assertNotDispatched()` і `assertNothingDispatched()` перевіряють диспетчеризацію activity `V2`;
- `WorkflowStub::assertSignalSent()`, `assertSignalSentTimes()` і `assertSignalNotSent()` перевіряють signal `V2`, надіслані через `WorkflowStub::signal()` або `signalWithStart()`;
- `WorkflowStub::assertUpdateSent()`, `assertUpdateSentTimes()` і `assertUpdateNotSent()` перевіряють update `V2`, надіслані через `WorkflowStub::update()`, `attemptUpdate()` або `submitUpdate()`;
- відкладені завдання timer залишаються стійкою роботою черги до свого часу. Після переміщення часу `WorkflowStub::runReadyTasks()` виконує вже належні завдання в процесі.

### Область тестування першого випуску {#first-release-testing-scope}

Наведене нижче **не** входить до інтерфейсу fake `V2` першого випуску
й може додаватися майбутніми додатковими контрактами:

- немає еквівалента старого мосту `resume()` для `V2`;
- немає окремої підміни дочірнього workflow або помічника перевірки диспетчеризації. Дочірні workflow виконуються як справжні вкладені run `V2` у fake, тому перевіряйте їх через спостережуваний результат;
- немає hook відкладеного callback для введення signal чи update зі зміщенням віртуального часу під час одного виконання fake. Натомість переміщуйте час і викликайте `WorkflowStub::runReadyTasks()` між явними викликами signal/update.

`WorkflowStub::mock()` забезпечує цю область під час виконання:
передавання підкласу `Workflow` викидає `LogicException` зі зрозумілою
вказівкою тестувати дочірні workflow через спостережуваний результат.
Цілями підміни можуть бути лише класи `Activity` та нерозв’язані рядкові ключі.

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

final class MyWorkflow extends Workflow
{
    public function handle(): array
    {
        return [
            'result' => activity(MyActivity::class, 'Taylor'),
            'workflow_id' => $this->workflowId(),
            'run_id' => $this->runId(),
        ];
    }
}
```

```php
use Workflow\V2\Testing\ActivityFakeContext;
use Workflow\V2\WorkflowStub;

public function testWorkflow(): void
{
    WorkflowStub::fake();

    WorkflowStub::mock(MyActivity::class, function (ActivityFakeContext $context, string $name): string {
        $this->assertSame('Taylor', $name);
        $this->assertSame('my-workflow-id', $context->workflowId());

        return "Hello, {$name}!";
    });

    $workflow = WorkflowStub::make(MyWorkflow::class, 'my-workflow-id');
    $workflow->start();

    $this->assertTrue($workflow->refresh()->completed());
    $this->assertSame('Hello, Taylor!', $workflow->output()['result']);

    WorkflowStub::assertDispatched(MyActivity::class, function (string $name): bool {
        return $name === 'Taylor';
    });
}
```

Використовуйте `WorkflowStub::assertDispatched()`, `assertDispatchedTimes()`,
`assertNotDispatched()` і `assertNothingDispatched()` для перевірки
записаної диспетчеризації activity `V2`.

Для workflow з timer перемістіть час помічниками travel Laravel,
а потім явно виконайте чергу завдань, час яких настав:

```php
use function Workflow\V2\timer;
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;

final class MyTimerWorkflow extends Workflow
{
    public function handle(): array
    {
        timer(60);

        return ['done' => true];
    }
}

public function testTimerWorkflow(): void
{
    WorkflowStub::fake();

    $workflow = WorkflowStub::make(MyTimerWorkflow::class, 'timer-workflow');
    $workflow->start();

    $this->travel(60)->seconds();

    WorkflowStub::runReadyTasks();

    $this->assertTrue($workflow->refresh()->completed());
    $this->assertSame(['done' => true], $workflow->output());
}
```

`WorkflowStub::runReadyTasks()` виконує лише завдання, час яких уже настав.
Він не переміщує реальний час і не змушує майбутні timer спрацьовувати раніше.

### Надсилання signal у режимі fake {#sending-signals-in-fake-mode}

Workflow, що очікують signal, можуть отримувати їх у fake. Виклик
`$workflow->signal(...)` записує стійку команду signal і створює завдання
workflow. У fake воно виконується в процесі, тому workflow продовжується
синхронно:

```php
use function Workflow\V2\activity;
use Workflow\V2\Attributes\Signal;
use function Workflow\V2\await;
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;

#[Signal('name-provided')]
final class ApprovalWorkflow extends Workflow
{
    public function handle(): array
    {
        $name = await('name-provided');
        $greeting = activity(GreetingActivity::class, $name);

        return ['name' => $name, 'greeting' => $greeting];
    }
}

public function testSignalWorkflow(): void
{
    WorkflowStub::fake();
    WorkflowStub::mock(GreetingActivity::class, 'Hello, Taylor!');

    $workflow = WorkflowStub::make(ApprovalWorkflow::class, 'approval-1');
    $workflow->start();

    // Workflow suspends at await('name-provided')
    $this->assertSame('waiting', $workflow->refresh()->status());

    // Send the signal — resumes the workflow inline
    $workflow->signal('name-provided', 'Taylor');

    $this->assertTrue($workflow->refresh()->completed());
    $this->assertSame('Taylor', $workflow->output()['name']);

    WorkflowStub::assertSignalSent('name-provided');
    WorkflowStub::assertSignalSentTimes('name-provided', 1);
    WorkflowStub::assertSignalNotSent('other-signal');
}
```

Використовуйте `WorkflowStub::assertSignalSent()`, `assertSignalSentTimes()`
і `assertSignalNotSent()` для перевірки надісланих signal. Форма callback
отримує ID екземпляра й аргументи signal:

```php
WorkflowStub::assertSignalSent(
    'name-provided',
    fn (string $instanceId, string $name): bool =>
        $instanceId === 'approval-1' && $name === 'Taylor'
);
```

### Надсилання update у режимі fake {#sending-updates-in-fake-mode}

Update також застосовуються в процесі у fake. Виклик
`$workflow->attemptUpdate(...)` або `$workflow->update(...)` записує стійку
команду update, створює завдання workflow для його застосування й виконує
завдання в процесі:

```php
use Workflow\UpdateMethod;
use Workflow\V2\Attributes\Signal;
use function Workflow\V2\await;
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;

#[Signal('done')]
final class SettingsWorkflow extends Workflow
{
    private bool $enabled = false;

    public function handle(): array
    {
        await('done');

        return ['enabled' => $this->enabled];
    }

    #[UpdateMethod]
    public function toggle(bool $enabled): array
    {
        $this->enabled = $enabled;

        return ['enabled' => $this->enabled];
    }
}

public function testUpdateWorkflow(): void
{
    WorkflowStub::fake();

    $workflow = WorkflowStub::make(SettingsWorkflow::class, 'settings-1');
    $workflow->start();

    $this->assertSame('waiting', $workflow->refresh()->status());

    $result = $workflow->attemptUpdate('toggle', true);

    $this->assertTrue($result->accepted());

    WorkflowStub::assertUpdateSent('toggle');
    WorkflowStub::assertUpdateSentTimes('toggle', 1);
    WorkflowStub::assertUpdateNotSent('other-update');

    // Complete the workflow
    $workflow->signal('done');
    $this->assertTrue($workflow->refresh()->completed());
    $this->assertTrue($workflow->output()['enabled']);
}
```

Використовуйте `WorkflowStub::assertUpdateSent()`, `assertUpdateSentTimes()`
і `assertUpdateNotSent()` для перевірки надісланих update. Форма callback
отримує ID екземпляра й аргументи update:

```php
WorkflowStub::assertUpdateSent(
    'toggle',
    fn (string $instanceId, bool $enabled): bool =>
        $instanceId === 'settings-1' && $enabled === true
);
```

### Тестування результатів запуску й політики повторного запуску {#testing-start-outcomes-and-duplicate-start-policy}

Використовуйте `attemptStart()` для перевірки поведінки повторного запуску
без викидання винятків. `StartResult` має типізовані помічники результатів:

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

public function testRejectDuplicateStart(): void
{
    WorkflowStub::fake();
    WorkflowStub::mock(MyActivity::class, 'result');

    $workflow = WorkflowStub::make(MyWorkflow::class, 'order-123');

    $first = $workflow->start('Taylor');
    $this->assertTrue($first->startedNew());

    $second = WorkflowStub::load('order-123');
    $duplicate = $second->attemptStart('Taylor');

    $this->assertTrue($duplicate->rejected());
    $this->assertTrue($duplicate->rejectedDuplicate());
    $this->assertSame('instance_already_started', $duplicate->rejectionReason());
}
```

Для тестування повернення наявного активного run передайте
`StartOptions::returnExistingActive()`:

```php
public function testReturnExistingActiveStart(): void
{
    WorkflowStub::fake();

    $workflow = WorkflowStub::make(MySignalWorkflow::class, 'order-123');
    $workflow->start();

    $this->assertSame('waiting', $workflow->refresh()->status());

    $second = WorkflowStub::load('order-123');
    $result = $second->attemptStart(StartOptions::returnExistingActive());

    $this->assertTrue($result->accepted());
    $this->assertTrue($result->returnedExistingActive());
    $this->assertSame($workflow->runId(), $result->runId());
}
```

Обидві політики записують стійкі команди та події історії. Для глибшої
перевірки можна також перевіряти рядки `WorkflowCommand` і
`WorkflowHistoryEvent`.

### Тестування бюджету історії {#testing-history-budget}

Поля `HistoryBudget` (`history_event_count`, `history_size_bytes`,
`continue_as_new_recommended`) надаються проєкцією огляду run й доступні
через `RunDetailView`. У коді workflow базовий клас `Workflow` надає їх
як `$this->historyLength()`, `$this->historySize()` і
`$this->shouldContinueAsNew()`:

```php
use Workflow\V2\Workflow;

final class LongRunningWorkflow extends Workflow
{
    public function handle(): void
    {
        while (true) {
            // ... process work ...

            if ($this->shouldContinueAsNew()) {
                Workflow::continueAsNew($this->carryForwardState());
            }
        }
    }
}
```

Для тестування порогів бюджету історії задайте низькі значення
й перевірте рекомендацію:

```php
public function testHistoryBudgetRecommendsContinueAsNew(): void
{
    config()->set('workflows.v2.history_budget.continue_as_new_event_threshold', 5);

    WorkflowStub::fake();

    // Run a workflow that produces enough history events to trip the threshold
    $workflow = WorkflowStub::make(ManyActivitiesWorkflow::class, 'budget-test');
    $workflow->start();

    $summary = $workflow->summary();
    $this->assertTrue($summary->continue_as_new_recommended);
}
```

## Старий `Workflow\WorkflowStub` {#legacy-workflowworkflowstub}

:::warning Стара v1

Приклади цього розділу використовують runtime v1 (`Workflow\Workflow`,
`use function Workflow\activity`, генераторний `execute()` із `yield`,
`Workflow\Models\StoredWorkflow`). Зберігайте ці шаблони для тестів workflow
v1 під час міграції. Нові тести мають використовувати
`Workflow\V2\WorkflowStub::fake()` із `Workflow\V2\Workflow` і послідовними
методами `handle()`, як показано вище.

:::

### Workflow {#workflows}

У тестовому середовищі можна синхронно виконувати workflow та підміняти
activity й дочірні workflow, визначаючи очікувану поведінку й результати
без запуску справжніх реалізацій.

```
use function Workflow\activity;
use Workflow\Workflow;

class MyWorkflow extends Workflow
{
    public function execute()
    {
        $result = yield activity(MyActivity::class);

        return $result;
    }
}
```

Наведений workflow можна протестувати викликом `WorkflowStub::fake()`
із подальшою підміною activity.

```
public function testWorkflow()
{
    WorkflowStub::fake();

    WorkflowStub::mock(MyActivity::class, 'result');

    $workflow = WorkflowStub::make(MyWorkflow::class);
    $workflow->start();

    $this->assertSame($workflow->output(), 'result');
}
```

До ` WorkflowStub::mock()` також можна передати callback замість
значення результату.

Callback також отримує `$context` workflow та аргументи поточної activity.

```
public function testWorkflow()
{
    WorkflowStub::fake();

    WorkflowStub::mock(MyActivity::class, function ($context) {
        return 'result';
    });

    $workflow = WorkflowStub::make(MyWorkflow::class);
    $workflow->start();

    $this->assertSame($workflow->output(), 'result');
}
```

Перевіряйте, які activity чи дочірні workflow були надіслані, методами
`assertDispatched`, `assertNotDispatched` і `assertNothingDispatched`:

```
WorkflowStub::assertDispatched(MyActivity::class);

// Assert the activity was dispatched twice...
WorkflowStub::assertDispatched(MyActivity::class, 2);

WorkflowStub::assertNotDispatched(MyActivity::class);

WorkflowStub::assertNothingDispatched();
```

До `assertDispatched` або `assertNotDispatched` можна передати замикання
для перевірки, що надіслана activity чи дочірній workflow задовольняє
умову. Callback отримує аргументи activity або дочірнього workflow.

```
WorkflowStub::assertDispatched(TestOtherActivity::class, function ($string) {
    return $string === 'other';
});
```

### Пропуск часу {#skipping-time}

Змінюючи системний час через `$this->travel()` або `$this->travelTo()`,
можна моделювати workflow, залежні від часу, та тестувати тайм-аути,
затримки й іншу часову логіку.

```
use function Workflow\{activity, timer};
use Workflow\Workflow;

class MyTimerWorkflow extends Workflow
{
    public function execute()
    {
        yield timer(60);

        $result = yield activity(MyActivity::class);

        return $result;
    }
}
```

Наведений workflow очікує 60 секунд перед виконанням activity.
`$this->travel()` і `$workflow->resume()` дозволяють пропустити цей
період очікування в старому runtime.

```
public function testTimeTravelWorkflow()
{
    WorkflowStub::fake();

    WorkflowStub::mock(MyActivity::class, 'result');

    $workflow = WorkflowStub::make(MyTimerWorkflow::class);
    $workflow->start();

    $this->travel(120)->seconds();

    $workflow->resume();

    $this->assertSame($workflow->output(), 'result');
}
```

Помічники `$this->travel()` і `$this->travelTo()` використовують
`Carbon::setTestNow()` усередині.

### Activity {#activities}

Тестування activity схоже на тестування завдань Laravel. Вручну
створіть activity й викличте метод `handle()`.

```
$workflow = WorkflowStub::make(MyWorkflow::class);

$activity = new MyActivity(0, now()->toDateTimeString(), StoredWorkflow::findOrFail($workflow->id()));

$result = $activity->handle();
```

Старі activity все ще виконуються через метод завдання runtime `handle()`.
У `Workflow\V2` код workflow та activity користувача також міститься
в `handle()`.
