---
sidebar_position: 6
---

# Pruning Workflows
Sometimes you may want to periodically delete completed workflows that are no longer needed. To accomplish this, you may use the `model:prune` artisan command.

```bash
php artisan model:prune --model="Workflow\Models\StoredWorkflow"
```

By default, only completed workflows older than 1 month are pruned. You can control this via configuration setting.

```php
'prune_age' => '1 month',
```

You can schedule the `model:prune` artisan command in your application's `routes/console.php` file.

```php
Schedule::command('model:prune', [
    '--model' => StoredWorkflow::class,
])->daily();
```

You can also control which workflows are pruned by extending the base workflow model and implementing your own `prunable` method.

```php
public function prunable(): Builder
{
    return static::where('status', 'completed')
            ->where('created_at', '<=', now()->subMonth())
            ->whereDoesntHave('parents');
}
```

You may test the `model:prune` command with the `--pretend` option. When pretending, the `model:prune` command will report how many records would be pruned if the command were to actually run.

```bash
php artisan model:prune --model="Workflow\Models\StoredWorkflow" --pretend
```
