---
sidebar_position: 6
---

# Очищення workflow {#pruning-workflows}

Workflow v2 розділяє дві окремі операції життєвого циклу:

1. **Архівування** позначає запуск у кінцевому стані як архівований, щоб
   виключити його з оглядів активних запусків. Архівування **не** видаляє рядків.
2. **Очищення** видаляє застарілі рядки проєкцій чи стійкого стану з бази даних.
   Очищення має виконуватися лише для архівованих запусків.

## Архівування запусків у кінцевому стані {#archiving-terminal-runs}

Архівуйте завершений, невдалий, скасований чи примусово завершений запуск через
площину керування:

```php
use Workflow\V2\Contracts\WorkflowControlPlane;

$controlPlane = app(WorkflowControlPlane::class);

$result = $controlPlane->archive('order-12345', [
    'reason' => 'Retention period expired',
]);

if ($result['accepted']) {
    // Run's archived_at is now set; it disappears from active fleet views.
}
```

Та сама операція доступна через HTTP-маршрут площини керування. Архівувати можна
лише закриті запуски. Архівування вже архівованого запуску повертає `accepted`
із результатом `archive_not_needed`.

### Автоматизація архівування {#automating-archival}

Архівуйте запуски в кінцевому стані за розкладом: знаходьте завершені запуски
поза строком зберігання в таблиці стійких запусків і викликайте `archive()` для
кожного. Для простого правила за часом додайте подібний код до `routes/console.php`:

```php
use Illuminate\Support\Facades\Schedule;
use Workflow\V2\Models\WorkflowRun;
use Workflow\V2\Contracts\WorkflowControlPlane;

Schedule::call(function (WorkflowControlPlane $controlPlane): void {
    WorkflowRun::query()
        ->whereIn('status', ['completed', 'failed', 'cancelled', 'terminated'])
        ->whereNull('archived_at')
        ->where('closed_at', '<=', now()->subMonth())
        ->with('instance:id')
        ->chunkById(100, function ($runs) use ($controlPlane): void {
            foreach ($runs as $run) {
                $controlPlane->archive($run->instance->id, [
                    'reason' => 'retention_policy',
                ]);
            }
        });
})->daily();
```

## Очищення рядків проєкцій {#pruning-projection-rows}

Рядки проєкцій зведення запуску, очікування, часової шкали, timer та походження
можна відновити зі стійкої історії й команд. Використовуйте
`workflow:v2:rebuild-projections --prune-stale`, щоб видалити рядки проєкцій,
стійкий запуск яких більше не існує:

```bash
# Preview what would be pruned
php artisan workflow:v2:rebuild-projections --prune-stale --dry-run

# Actually prune stale projection rows
php artisan workflow:v2:rebuild-projections --prune-stale
```

## Очищення рядків стійкого стану {#pruning-durable-rows}

Рядки стійкого стану (`workflow_instances`, `workflow_runs`,
`workflow_history_events`, `workflow_tasks`, `activity_executions`,
`activity_attempts`, `workflow_failures` тощо) слід видаляти лише після
архівування запуску та остаточного завершення строку зберігання. Типізована
історія й походження посилаються на ці рядки, тож очищення має дотримуватися
порядку залежностей. Пакет ще не містить повної команди очищення стійкого стану.
Якщо потрібно звільнити диск, використовуйте обмежене завдання очищення, яке:

1. Обирає запуски з `archived_at IS NOT NULL AND archived_at <= now()->subMonths(3)`.
2. Спочатку видаляє залежні рядки: події історії, завдання, спроби activity,
   виконання activity, помилки, timer, зв’язки та команди.
3. Видаляє рядок `workflow_runs`, а потім `workflow_instances`, коли всі запуски видалено.
4. Відновлює проєкції командою `workflow:v2:rebuild-projections --prune-stale`,
   щоб очистити осиротілі рядки проєкцій.

Відстежуйте строк архівування та строк зберігання стійкого стану окремо.
Архівовані, але не очищені запуски залишаються доступними для експорту історії
та дослідження інцидентів.
