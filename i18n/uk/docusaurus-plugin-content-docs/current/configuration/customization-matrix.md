---
sidebar_position: 4.5
title: Матриця налаштування
description: Зафіксована матриця підтримки Durable Workflow v2 для перевизначення моделей, налаштувань серіалізації, заміни репозиторію спостереження, стану, імпорту, міграцій та поведінки запису.
---

# Матриця налаштування {#customization-matrix}

Ця сторінка фіксує підтримуваний контракт налаштування Durable Workflow v2.
Використовуйте її, якщо потрібно перенести стійкі моделі v2 на інше з’єднання, замінити підкласи моделей чи PHP-репозиторій операторського спостереження або визначити, чи старе налаштування серіалізації залишається чинним під час міграції.

## Матриця підтримуваних перевизначень {#supported-override-matrix}

| Можливість | Підтримуваний контракт | Примітки |
| --- | --- | --- |
| `workflows.v2.instance_model` із підкласом сумісної схеми, що зберігає базову назву `WorkflowInstance` | Підтримується | Використовуйте цей варіант, якщо потрібні лише інше з’єднання, перетворення типів або простір імен застосунку. Успадковані зв’язки зберігають контракт зовнішнього ключа `workflow_instance_id` пакета. |
| `workflows.v2.instance_model` із підкласом, що змінює таблицю чи базову назву | Підтримується з явним перевизначенням зв’язків | Перевизначте `runs()`, `commands()` та `updates()`, щоб вони зберігали `workflow_instance_id`. Пакет перевіряє це під час запуску та відхиляє успадковане визначення зв’язків, яке змінило б ці ключі. `currentRun()` уже явно задає `current_run_id` і не потребує перевизначення. |
| Інші перевизначення `workflows.v2.*_model` (`run_model`, `task_model`, `history_event_model`, проєкції, розклади, рядки activity, помилки, повідомлення, memo, атрибути пошуку, дочірні виклики) | Підтримується для підкласів із сумісною схемою | Зберігайте назви стовпців, первинні та зовнішні ключі пакета. Ці зв’язки вже явно задають свої ключі, тож підкласи зі зміненими таблицями можуть зберігати успадковані методи зв’язків, якщо схема сумісна. |
| Власні назви таблиць разом із власними назвами стовпців зовнішніх ключів | Не підтримується | Середовище виконання v2 та операторські засоби покладаються на назви стовпців і ключів пакета. Їх зміна виходить за межі підтримуваного контракту. |
| Заміна `OperatorObservabilityRepository` | Підтримується через прив’язку контейнера | Прив’яжіть свою реалізацію до `Workflow\V2\Contracts\OperatorObservabilityRepository`. Це контракт інтеграції PHP-середовища виконання для Waterline та `WorkflowStub::historyExport()`, а не стабільний міжмовний API. Репозиторій отримує об’єкти моделей пакета. |
| `serializer` | Підтримується лише для `avro` та застарілих кодеків завершення/імпорту | Нові запуски v2 завжди використовують семантику Avro. `workflow-serializer-y` та `workflow-serializer-base64` залишаються чинними лише для завершення чи імпорту історії v1, яка ще потребує нативного декодування PHP. Власні класи серіалізації v1 не підтримуються у v2. |
| Діагностика стану та doctor | Підтримується | `php artisan workflow:v2:doctor` та стан/статистика Waterline v2 відображають налаштовані класи моделей і позначають застарілі налаштування серіалізації як борг міграції. |
| Міграції пакета через нетипове з’єднання | Підтримується з опублікованими міграціями | Автоматично завантажені міграції пакета використовують типове з’єднання Laravel. Якщо стійкі моделі використовують інше з’єднання, опублікуйте міграції та явно задайте їх `$connection`. |
| Основний шлях запису середовища виконання (`WorkflowStub::make()`, `load()`, створення завдань, визначення поточного запуску) | Підтримується через налаштовані стійкі моделі | Середовище виконання враховує налаштовані `instance_model`, `run_model` та `task_model`. Зберігайте схеми таблиць запису сумісними зі стовпцями й ключами пакета. |

## Точні ключі моделей v2 {#exact-v2-model-keys}

Опубліковані налаштування `workflows.php` надають такі ключі стійких моделей у `workflows.v2`:

- `instance_model`
- `run_model`
- `history_event_model`
- `task_model`
- `command_model`
- `link_model`
- `activity_execution_model`
- `activity_attempt_model`
- `timer_model`
- `failure_model`
- `run_summary_model`
- `run_wait_model`
- `run_timeline_entry_model`
- `run_timer_entry_model`
- `run_lineage_entry_model`
- `schedule_model`
- `schedule_history_event_model`

Використовуйте підкласи моделей пакета для цих ключів. Зберігайте назви стовпців та зовнішні ключі пакета, якщо сторінка цієї документації не вказує інше.

## Правило перевизначення моделі екземпляра {#instance-model-override-rule}

Єдине поточне перевизначення v2, що потребує додаткової роботи зі зв’язками, — `workflows.v2.instance_model`, коли підклас змінює автоматично визначений зовнішній ключ із `workflow_instance_id` на інший.

Типовий безпечний приклад:

```php
namespace App\Models\V2;

use Workflow\V2\Models\WorkflowInstance as BaseWorkflowInstance;

final class WorkflowInstance extends BaseWorkflowInstance
{
    protected $connection = 'workflow';
}
```

Оскільки базова назва підкласу залишається `WorkflowInstance`, Eloquent зберігає той самий автоматично визначений зовнішній ключ, а успадковані зв’язки залишаються узгодженими.

Якщо використовуєте іншу базову назву чи модель сховища зі зміненою таблицею, явно перевизначте відповідні зв’язки:

```php
namespace App\Workflow\Storage;

use Illuminate\Database\Eloquent\Relations\HasMany;
use Workflow\V2\Models\WorkflowCommand;
use Workflow\V2\Models\WorkflowInstance as BaseWorkflowInstance;
use Workflow\V2\Models\WorkflowRun;
use Workflow\V2\Models\WorkflowUpdate;
use Workflow\V2\Support\ConfiguredV2Models;

final class TenantWorkflowInstance extends BaseWorkflowInstance
{
    protected $table = 'tenant_workflow_instances';

    public function runs(): HasMany
    {
        return $this->hasMany(
            ConfiguredV2Models::resolve('run_model', WorkflowRun::class),
            'workflow_instance_id',
        );
    }

    public function commands(): HasMany
    {
        return $this->hasMany(
            ConfiguredV2Models::resolve('command_model', WorkflowCommand::class),
            'workflow_instance_id',
        )->oldest('created_at');
    }

    public function updates(): HasMany
    {
        return $this->hasMany(
            ConfiguredV2Models::resolve('update_model', WorkflowUpdate::class),
            'workflow_instance_id',
        )
            ->orderBy('command_sequence')
            ->oldest('accepted_at')
            ->oldest('created_at')
            ->oldest('id');
    }
}
```

Якщо цих перевизначень немає, запуск пакета одразу завершується з помилкою, замість переходу застосунку на автоматично визначені ключі на кшталт `tenant_workflow_instance_id` чи `custom_workflow_instance_id`.

## Правила серіалізації, імпорту та стану {#serializer-import-and-health-rules}

- Зберігайте `serializer = 'avro'` для нової роботи v2.
- Використовуйте застарілі кодеки лише під час завершення чи імпорту історії v1, яка ще потребує нативного декодування даних PHP.
- Не спрямовуйте v2 на видалені власні класи серіалізації v1.
- Запускайте `php artisan workflow:v2:doctor` після оновлень та змін налаштувань. Це засіб діагностики застарілих налаштувань серіалізації та інших проблем готовності до запуску.
- Стан і статистика Waterline v2 є операторським відображенням тих самих налаштувань стійких моделей.

## Правила міграції та запису {#migration-and-write-side-rules}

- Звичайний шлях — автоматично завантажені міграції пакета через типове з’єднання.
- Якщо стійкі моделі використовують інше з’єднання, опублікуйте міграції та задайте їх `$connection`, щоб `php artisan migrate` використовував ту саму базу даних, що й налаштовані підкласи моделей.
- Зберігайте назви таблиць, первинні та зовнішні ключі пакета для кожної моделі, яка бере участь у шляху запису середовища виконання.
- Налаштування шляху запису впливають не лише на читання: запуск, завантаження, визначення поточного запуску та виконання завдань використовують налаштовані стійкі моделі.

## Пов’язані посібники {#related-guides}

- [Публікація налаштувань](./publishing-config.md)
- [З’єднання з базою даних](./database-connection.md)
- [Посібник міграції](../migration.md)
- [Спостереження](../monitoring.md)
