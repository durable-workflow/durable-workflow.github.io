---
sidebar_position: 2
---

import QuerySimulator from '@site/src/components/QuerySimulator';

# Query {#queries}

Query дозволяють отримувати інформацію про поточний стан workflow без впливу на його виконання. Це корисно для спостереження та налагодження.

## Методи query, безпечні для відтворення {#replay-safe-query-methods}

Query відтворюють зафіксовану історію поточного обраного запуску, а потім викликають анотований метод на відновленому об’єкті workflow. Вони не застосовують неявно прийняті, але ще не застосовані команди signal чи update.

```php
use Workflow\QueryMethod;
use Workflow\V2\Workflow;
use function Workflow\V2\await;

final class ApprovalWorkflow extends Workflow
{
    private string $stage = 'booting';

    public function handle(): void
    {
        $this->stage = 'waiting-for-approval';

        await('approved-by');

        $this->stage = 'approved';
    }

    #[QueryMethod('current-stage')]
    public function currentStage(): string
    {
        return $this->stage;
    }

    #[QueryMethod('starts-with')]
    public function startsWith(string $prefix): bool
    {
        return str_starts_with($this->stage, $prefix);
    }
}
```

Звертайтеся до поточного запуску за публічним ідентифікатором екземпляра:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$workflow->currentStage(); // "waiting-for-approval"
$workflow->query('starts-with', 'waiting'); // true
$workflow->queryWithArguments('starts-with', ['prefix' => 'waiting']); // true
```

Щоб явно обрати один історичний чи визначений запуск, виконуйте query через `loadRun($runId)`:

```php
$selectedRun = WorkflowStub::loadRun($runId);

$selectedRun->currentStage();
```

Поведінка query:

- Query безпечні для відтворення: вони спостерігають лише зафіксовану історію та не змінюють стан workflow.
- Аргументи передаються анотованому методу. Оголосіть стабільну публічну назву через `#[QueryMethod('public-name')]`, щоб виклик зберігався після перейменування PHP-методу.
- `load($instanceId)` запитує найновіший стійкий запуск екземпляра. `loadRun($runId)` обирає один конкретний запуск, що корисно для query до continue-as-new.
- Прийняті, але ще не застосовані signal та update видимі в історії команд, але не враховуються як застосований стан, доки worker не запише `SignalApplied` / `UpdateApplied`.

Для визначення методу query у workflow використовуйте анотацію `QueryMethod`. Необов’язковий рядковий аргумент фіксує публічну стійку назву query, яка зберігається після перейменування PHP-методів:

```php
use Workflow\QueryMethod;
use Workflow\V2\Workflow;

final class MyWorkflow extends Workflow
{
    private bool $ready = false;

    #[QueryMethod('is-ready')]
    public function getReady(): bool
    {
        return $this->ready;
    }
}
```

Щоб виконати query workflow, викличте метод на екземплярі workflow. Метод query поверне дані з workflow.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$ready = $workflow->getReady();
$sameReady = $workflow->query('is-ready');
```

Використовуйте `queryWithArguments()`, якщо викликач уже має позиційний список чи мапу іменованих параметрів:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$workflow->queryWithArguments('starts-with', [
    'prefix' => 'wait',
]);
```

Waterline використовує контракт query обраного запуску. Панель показує `declared_query_targets[*]` поряд із signal та update, але виконання query доступне лише за `can_query = true`. Оператор query обраного чи поточного запуску надсилає JSON `arguments` до `/waterline/api/instances/{instanceId}/queries/{query}` або `/waterline/api/instances/{instanceId}/runs/{runId}/queries/{query}`. Виконання query потребує доступного визначення workflow, оскільки обраний запуск має бути відтворений до виклику методу query. Коли стійкі цілі query існують, але визначення недоступне, деталі обраного запуску повідомляють `can_query = false` із `query_blocked_reason = workflow_definition_unavailable`, а POST query повертає HTTP `409 Conflict` із `blocked_reason = workflow_definition_unavailable`. Якщо запуск має лише неповний знімок, який поточна збірка більше не може доповнити, деталі повідомляють `declared_contract_source = unavailable`. Збережені цілі query залишаються видимими як діагностичні метадані, але іменовані аргументи query відхиляються з `422`, доки сумісна збірка не збереже відсутній контракт.

Публічний міст webhook надає той самий безпечний для відтворення API query поза Waterline:

```text
POST /webhooks/instances/{instanceId}/queries/{query}
POST /webhooks/instances/{instanceId}/runs/{runId}/queries/{query}
```

Ці маршрути webhook приймають те саме поле JSON `arguments`, що й Waterline, повертають типізований JSON `result` у разі успіху та використовують однакову форму помилки для некоректних аргументів (`422` із `validation_errors`) та блокування відтворення (`409` із `blocked_reason`). Якщо поточне визначення workflow доступне, викликачі можуть звертатися до query за стійкою ціллю `#[QueryMethod('public-name')]` чи назвою PHP-методу. Успішні HTTP-відповіді нормалізують `query_name` до стійкої публічної цілі, щоб зовнішні викликачі не залежали від деталей перейменування методів.

<QuerySimulator />

**Важливо:** query workflow не просуває його виконання, на відміну від signal.
