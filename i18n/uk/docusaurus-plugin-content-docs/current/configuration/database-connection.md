---
sidebar_position: 4
---

# З’єднання з базою даних {#database-connection}

Нижче наведено кроки для зміни з’єднання з базою даних, яке використовують стійкі
моделі workflow v2. Це потрібно *лише* тоді, коли ви хочете використовувати інше
з’єднання, ніж типове з’єднання вашого застосунку Laravel.

Повний контракт перевизначення v2, зокрема підкласи зі зміненими таблицями,
правила серіалізації, заміну репозиторію, діагностику стану та вимоги до міграцій,
наведено в [матриці налаштування](./customization-matrix.md).

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

Міграції Workflow автоматично завантажуються з пакета
(`WorkflowServiceProvider::loadMigrationsFrom`) і виконуються через типове
з’єднання з базою даних. Якщо таблиці v2 використовують інше з’єднання,
опублікуйте міграції командою `php artisan vendor:publish --tag=migrations` та
задайте `protected $connection = 'mysql';` у кожному опублікованому класі
міграції, щоб `php artisan migrate` виконав їх у правильній базі даних.
