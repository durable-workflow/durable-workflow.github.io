---
sidebar_position: 6
---

# Очищення workflow {#pruning-workflows}

Workflow v2 розділяє дві окремі операції життєвого циклу:

1. **Архівування** позначає запуск у кінцевому стані як архівований, щоб
   виключити його з оглядів активних запусків. Архівування **не** видаляє рядків.
2. **Очищення** видаляє дозволені політикою деталі чи осиротілі проєкції.
   Embedded API вимагає кінцевого стану, часу закриття та перевіряє утримання.
   Політику зберігання визначає хост; архівування не є вимогою цього API.

Server має окрему політику зберігання namespace: автоматичне очищення пропускає
архівовані запуски. Архівування захищає запуск від цього очищення й не є
підготовчим кроком для автоматичного видалення.

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

Після перевірки політики зберігання та потрібної копії експорту чи відновлення
embedded-хост може скористатися готовим API:

```php
use Workflow\V2\Support\WorkflowRunRetentionCleanup;

$report = WorkflowRunRetentionCleanup::pruneRun($runId);
```

`pruneRun()` блокує вибраний запуск і видаляє його деталі в одній транзакції.
Операція відмовляє для активного запуску, відсутнього часу закриття чи відкритої
відокремленої activity (`detached_activity_still_open`). Хост відповідає за
авторизований вибір запуску та строк зберігання. `retentionHoldReason($runId)`
дозволяє перевірити утримання activity; операція повторює перевірку перед видаленням.

Зберігайте `workflow_runs` і `workflow_instances`. Рядок запуску залишається
в кінцевому стані з `details_pruned_at`; повторне очищення не змінює першу мітку.
Початкові аргументи й результат залишаються в рядку запуску, тому окремо враховуйте
їхній обсяг. Відновлення проєкцій не повертає видалену історію. Експорт після
очищення також її не відновить; обмеження ознаки повноти експорту відстежується у
[Workflow #856](https://github.com/durable-workflow/workflow/issues/856).

Цей API видаляє деталі з бази даних. Зберіганням і видаленням зовнішніх об'єктів
керує хост, ураховуючи посилання з кореневих рядків, відокремлену роботу та
утримання резервних копій. Дотримуйтеся
[життєвого циклу зовнішніх даних](../features/external-payload-storage.md).
Перевірте експорт і потрібні зовнішні байти **до** очищення. Архівовані запуски
зі збереженими деталями залишаються доступними для дослідження інцидентів.
