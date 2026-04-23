---
sidebar_position: 4.5
title: Customization Matrix
description: Frozen support matrix for Durable Workflow v2 model overrides, serializer settings, observability repository replacement, health, imports, migrations, and write-side behavior.
---

# Customization Matrix

This page freezes the supported Durable Workflow v2 customization contract.
Use it when you need to move v2 durable models onto a different connection,
swap model subclasses, replace the PHP operator-observability repository, or
decide whether an older serializer setting is still valid during migration.

## Supported override matrix

| Surface | Supported contract | Notes |
| --- | --- | --- |
| `workflows.v2.instance_model` with a schema-compatible subclass that keeps the basename `WorkflowInstance` | Supported | Use this shape when you only need a different connection, casts, or app namespace. The inherited relations keep the package's `workflow_instance_id` foreign-key contract. |
| `workflows.v2.instance_model` with a table-swapped or basename-changing subclass | Supported with explicit relation overrides | Override `runs()`, `commands()`, and `updates()` so they keep `workflow_instance_id`. The package now validates this at boot and rejects inherited relation inference that would change those keys. `currentRun()` already pins `current_run_id` explicitly and does not need an override. |
| Other `workflows.v2.*_model` overrides (`run_model`, `task_model`, `history_event_model`, projections, schedules, activity rows, failures, messages, memos, search attributes, child calls) | Supported for schema-compatible subclasses | Keep the package column names, primary keys, and foreign keys. These relations already pin the keys they use, so table-swapped subclasses can stay on the inherited relation methods when the schema stays compatible. |
| Custom table names plus custom foreign-key column names | Unsupported | The v2 runtime and operator surfaces assume the package column and key names. If you change them, you are outside the supported contract. |
| `OperatorObservabilityRepository` replacement | Supported by container binding | Bind your implementation to `Workflow\V2\Contracts\OperatorObservabilityRepository`. This is a PHP runtime integration contract for Waterline and `WorkflowStub::historyExport()`, not a stable cross-language API. The repository receives package model objects. |
| `serializer` | Supported only for `avro` and legacy drain/import codecs | New v2 runs always use Avro semantics. `workflow-serializer-y` and `workflow-serializer-base64` remain valid only for finishing or importing v1 history that still needs PHP-native decoding. Custom serializer classes from v1 are unsupported in v2. |
| Health and doctor diagnostics | Supported | `php artisan workflow:v2:doctor` and Waterline v2 health/stats reflect the configured model classes and flag stale serializer settings as migration debt. |
| Package migrations on a non-default connection | Supported with published migrations | Auto-loaded package migrations run on Laravel's default connection. If your durable models use another connection, publish the migrations and set the migration `$connection` explicitly. |
| Core write-side runtime (`WorkflowStub::make()`, `load()`, task creation, current-run resolution) | Supported through the configured durable models | The runtime honors the configured `instance_model`, `run_model`, and `task_model`. Keep write-side tables schema-compatible with the package columns and keys. |

## Exact v2 model keys

The published `workflows.php` config exposes these durable model keys under
`workflows.v2`:

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

Use subclasses of the package models for those keys. Keep the package's column
names and foreign keys unless a page in this docs set says otherwise.

## Instance-model override rule

The only current v2 override that needs extra relation work is
`workflows.v2.instance_model` when your subclass changes the inferred foreign
key away from `workflow_instance_id`.

Typical safe example:

```php
namespace App\Models\V2;

use Workflow\V2\Models\WorkflowInstance as BaseWorkflowInstance;

final class WorkflowInstance extends BaseWorkflowInstance
{
    protected $connection = 'workflow';
}
```

Because the subclass basename is still `WorkflowInstance`, Eloquent keeps the
same inferred foreign key and the inherited relations remain aligned.

If you use a different basename or a table-swapped storage model, override the
affected relations explicitly:

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

If those overrides are missing, package boot now fails fast instead of letting
the app drift onto inferred keys such as
`tenant_workflow_instance_id` or `custom_workflow_instance_id`.

## Serializer, import, and health rules

- Keep `serializer = 'avro'` for new v2 work.
- Use legacy codecs only while draining or importing v1 history that still
  needs PHP-native payload decoding.
- Do not point v2 at removed custom serializer classes from v1.
- Run `php artisan workflow:v2:doctor` after upgrades and config changes. It is
  the diagnostic surface that flags legacy serializer settings and other boot
  readiness problems.
- Treat Waterline v2 health and stats as the operator-facing view of the same
  durable model configuration.

## Migration and write-side rules

- The normal path is auto-loaded package migrations on the default connection.
- If your durable models use another connection, publish the migrations and set
  the migration `$connection` so `php artisan migrate` targets the same
  database as your configured model subclasses.
- Keep the package table names, primary keys, and foreign keys on every model
  that participates in the runtime write path.
- The write path is not read-only customization: starts, loads, current-run
  resolution, and task execution all use the configured durable models.

## Related Guides

- [Publishing Config](./publishing-config.md)
- [Database Connection](./database-connection.md)
- [Migration Guide](../migration.md)
- [Monitoring](../monitoring.md)