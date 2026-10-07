---
sidebar_position: 3
---

# Update {#updates}

Update дають змогу одночасно отримати інформацію про поточний стан workflow і змінити його. По суті, це поєднання query та signal в одному виклику.

## Явні команди update {#explicit-update-commands}

Кожен прийнятий update:

- Є викликом запит–відповідь до активного workflow. `attemptUpdate*()` очікує на завершення обробника, а `submitUpdate*()` повертається відразу після стійкого прийняття команди й надає `inspectUpdate($updateId)` для подальшого опитування.
- Використовує оголошену стійку назву update в історії команд і маршрутизації webhook. `#[UpdateMethod('mark-approved')]` зберігає публічну назву виклику за перейменування PHP-методу.
- Відхиляється для історичних або вже закритих запусків замість непомітної зміни поточного запуску.
- До виконання обробника відхиляє неоголошені назви методів як `rejected_unknown_update`, а аргументи, що порушують контракт, як `rejected_invalid_arguments` із машиночитаними `validation_errors`.

Як і query, update спочатку відтворюють зафіксовану історію. На відміну від query, update можуть змінювати безпечний щодо replay стан workflow і повертати значення.

Щоб визначити метод update у workflow, використовуйте анотацію `UpdateMethod`. Необов’язковий рядковий аргумент фіксує публічну стійку назву, яка зберігається за перейменування PHP-методу:

```php
use Workflow\UpdateMethod;
use Workflow\V2\Workflow;

final class MyWorkflow extends Workflow
{
    private bool $ready = false;

    #[UpdateMethod('mark-ready')]
    public function updateReady(bool $ready): bool
    {
        $this->ready = $ready;

        return $this->ready;
    }
}
```

Викликайте метод update безпосередньо, якщо потрібне лише повернене значення:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$ready = $workflow->updateReady(true);
```

Прямий PHP-виклик і далі використовує назву методу. Стійка ціль команди залишається `mark-ready`.

Використовуйте `attemptUpdate()`, якщо також потрібен результат стійкої команди. Передайте йому стійку назву update:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$result = $workflow->attemptUpdate('mark-ready', true);

$result->accepted();        // true
$result->completed();       // true when the update body ran successfully
$result->updateStatus();    // "accepted", "completed", "failed", or "rejected"
$result->updateId();        // Durable update lifecycle id
$result->result();          // Raw update return value when completed
$result->failureMessage();  // Failure message when the update body threw
```

`attemptUpdate()` спочатку записує прийнятий update, а потім очікує, доки worker workflow застосує його й закриє життєвий цикл update. Час очікування обмежено `workflows.v2.update_wait.completion_timeout_seconds`. Якщо до спливу бюджету worker не закрив update, `attemptUpdate()` повертає прийнятий життєвий цикл із `waitTimedOut() === true` та `updateStatus() === 'accepted'`.

Використовуйте `withUpdateWaitTimeout()`, якщо одному виклику потрібен інший бюджет очікування завершення:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123')
    ->withUpdateWaitTimeout(5);

$result = $workflow->attemptUpdate('mark-ready', true);
```

Використовуйте `attemptUpdateWithArguments()`, якщо код виклику вже має позиційний список або мапу іменованих параметрів:

```php
$result = $workflow->attemptUpdateWithArguments('mark-ready', [
    'ready' => true,
]);
```

Іменовані мапи перевіряються за стійко зафіксованим контрактом update й нормалізуються в порядку оголошення до прийняття.

Використовуйте `submitUpdate()` або `submitUpdateWithArguments()`, якщо потрібне лише стійке прийняття, а worker workflow може застосувати update пізніше:

```php
$accepted = $workflow->submitUpdate('mark-ready', true);

$accepted->accepted();     // true
$accepted->completed();    // false
$accepted->updateStatus(); // "accepted"
$accepted->result();       // null until the worker records UpdateCompleted
```

Використовуйте `inspectUpdate()`, якщо вже маєте `update_id` і хочете пізніше прочитати збережений життєвий цикл без повторного очікування:

```php
$latest = $workflow->inspectUpdate($accepted->updateId());

$latest->updateStatus(); // "accepted"
$latest->closedAt();     // null until the lifecycle closes
```

`inspectUpdate()` не очікує на виконання workflow. Він повторно завантажує збережений стійкий життєвий цикл і повертає поточний `UpdateResult`.

Правила update:

- `load($instanceId)` оновлює найновіший стійкий запуск екземпляра, зокрема після continue-as-new.
- `loadRun($runId)` відхиляється з `rejected_not_current`, щойно вибраний запуск стає історичним.
- Закриті запуски відхиляють update з `rejected_not_active`.
- Помилки тіла update не закривають запуск workflow. Вони записуються як помилки рівня update й залишають запуск відкритим для наступного завдання replay.
- Query відтворюють завершені update, а відхилені чи неуспішні update залишаються лише фактами команд та історії, які не відтворюються.
