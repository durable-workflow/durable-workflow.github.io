---
sidebar_position: 4
---

# З’єднання з базою даних {#database-connection}

Workflow використовує стандартне підключення Laravel до бази даних застосунку, якщо ви не вибрали інше підключення для його надійного сховища.

Щоб використовувати для сховища workflow підключення з `config/database.php`, задайте його назву в середовищі:

```dotenv
DW_STORAGE_CONNECTION=workflows
```

Моделі, транзакції, блокування рядків і дії після фіксації Workflow використовують це підключення. Усі таблиці надійного стану workflow мають використовувати одне підключення Laravel. Транспорт черги налаштовується окремо в конфігурації черг Laravel.

Ви також можете вибрати підключення через власні класи моделей, як описано нижче. Налаштована модель V2 `run_model` задає підключення сховища для метаданих V2 без явно заданого підключення моделі. Явні підключення моделей мають збігатися з ним. `DW_STORAGE_CONNECTION` має пріоритет над властивостями підключення моделей.

Повний контракт перевизначення v2, зокрема підкласи зі зміненими таблицями,
правила серіалізації, заміну репозиторію, діагностику стану та вимоги до міграцій,
наведено в [матриці налаштування](./customization-matrix.md).

## Підключення власних моделей {#custom-model-connections}

1. Створіть класи в каталозі моделей застосунку, які успадковують базові моделі v2
2. Задайте потрібний `$connection` у кожному класі
3. Опублікуйте файл налаштувань workflow
4. Оновіть прив’язки моделей `workflows.v2`, щоб вони вказували на ваші класи

## Успадкування моделей workflow v2 {#extending-v2-workflow-models}

Додайте цей код до `app\Models\V2\WorkflowInstance.php`.

```php
namespace App\Models\V2;

use Workflow\V2\Models\WorkflowInstance as BaseWorkflowInstance;

class WorkflowInstance extends BaseWorkflowInstance
{
    protected $connection = 'mysql';
}
```

Повторіть цей шаблон для кожної стійкої моделі v2, яку потрібно перенаправити,
щонайменше для таких:

- `Workflow\V2\Models\WorkflowRun`
- `Workflow\V2\Models\WorkflowHistoryEvent`
- `Workflow\V2\Models\WorkflowTask`
- `Workflow\V2\Models\WorkflowCommand`
- `Workflow\V2\Models\WorkflowLink`
- `Workflow\V2\Models\ActivityExecution`
- `Workflow\V2\Models\ActivityAttempt`
- `Workflow\V2\Models\WorkflowTimer`
- `Workflow\V2\Models\WorkflowFailure`
- `Workflow\V2\Models\WorkflowRunSummary`
- `Workflow\V2\Models\WorkflowSchedule`
- `Workflow\V2\Models\WorkflowScheduleHistoryEvent`

Кожен підклас має оголосити `protected $connection = 'mysql';` або іншу назву
з’єднання, визначену в `config/database.php`.

## Реєстрація власних моделей {#registering-custom-models}

Опублікуйте файл налаштувань workflow та оновіть прив’язки
`workflows.v2.*_model`, щоб вони вказували на ваші класи:

```php
// config/workflows.php

'v2' => [
    'instance_model' => App\Models\V2\WorkflowInstance::class,
    'run_model' => App\Models\V2\WorkflowRun::class,
    'history_event_model' => App\Models\V2\WorkflowHistoryEvent::class,
    'task_model' => App\Models\V2\WorkflowTask::class,
    'command_model' => App\Models\V2\WorkflowCommand::class,
    // ...
],
```

Пакет отримує моделі через `Workflow\V2\Support\ConfiguredV2Models`, тож кожен
зв’язок або запит до моделі v2 автоматично використовуватиме налаштоване з’єднання.

Якщо ви виходите за межі підкласів із сумісною схемою та змінюєте автоматично
визначений зовнішній ключ власної `instance_model`, пакет під час запуску
перевіряє, що зв’язки `runs()`, `commands()` та `updates()` явно перевизначено.

## Міграції {#migrations}

Міграції Workflow автоматично завантажуються з пакета та враховують `DW_STORAGE_CONNECTION`. Міграції застосунку зберігають власні налаштовані підключення.

Якщо ви використовуєте власні підключення моделей без `DW_STORAGE_CONNECTION`, задайте ту саму `$connection` у відповідних опублікованих міграціях workflow. Параметр Laravel `--database` також дає змогу вибрати ціль під час запуску лише цих міграцій workflow. Міграції застосунку мають залишатися на підключенні застосунку.

## Межі транзакцій {#transaction-boundaries}

Коли дані застосунку та сховище workflow використовують одне підключення Laravel, запуск workflow всередині транзакції входить до цієї транзакції. Відкат видаляє записи workflow, зроблені всередині неї. Рушій передає завдання workflow до черги та надсилає події життєвого циклу після фіксації зовнішньої транзакції сховища. Відкат скасовує ці дії.

Наприклад, із `DW_STORAGE_CONNECTION=workflows`:

```php
use App\Workflows\OrderWorkflow;
use Illuminate\Support\Facades\DB;
use Workflow\V2\WorkflowStub;

DB::connection('workflows')->transaction(function () {
    WorkflowStub::make(OrderWorkflow::class, 'order-123')->start('order-123');
});
```

Моделі застосунку, зміни яких мають фіксуватися атомарно з цим запуском, також повинні використовувати підключення `workflows`.

Транзакції на різних підключеннях Laravel фіксуються незалежно, навіть якщо назви підключень указують на одну фізичну базу даних. Транзакція на стандартному підключенні застосунку не може відкотити workflow, уже зафіксований через інше підключення сховища. Розміщуйте зміни, яким потрібна атомарність, на одному підключенні та включайте їх до його транзакції.

Публікація після фіксації захищає межу сховища workflow. Окрема база даних або брокер повідомлень черги має власні правила транзакцій і доставки.
