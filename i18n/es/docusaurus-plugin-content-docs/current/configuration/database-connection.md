---
sidebar_position: 4
---

# Conexión de base de datos {#database-connection}

Estos son los pasos para personalizar la conexión de base de datos de los modelos durables de workflow v2. *Solo* hace falta si quieres usar una conexión distinta de la predeterminada de tu aplicación Laravel.

Consulta la [Matriz de personalización](./customization-matrix.md) para conocer el
contrato completo de sustituciones v2, incluidas las subclases que cambian de tabla,
las reglas del serializador, la sustitución del repositorio, los diagnósticos de
salud y los requisitos de migración.

1. Crea clases en el directorio de modelos de tu aplicación que extiendan las clases base de modelos v2.
2. Establece la opción `$connection` deseada en cada clase.
3. Publica el archivo de configuración de workflow.
4. Actualiza las vinculaciones de modelos de `workflows.v2` para que apunten a tus clases personalizadas.

## Extender los modelos de workflow v2 {#extending-v2-workflow-models}

Pon lo siguiente en `app\Models\V2\WorkflowInstance.php`.

```php
namespace App\Models\V2;

use Workflow\V2\Models\WorkflowInstance as BaseWorkflowInstance;

class WorkflowInstance extends BaseWorkflowInstance
{
    protected $connection = 'mysql';
}
```

Repite el patrón para cada modelo durable v2 que debas redirigir. Como mínimo:

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

Cada subclase debe declarar `protected $connection = 'mysql';` (o el nombre de conexión que hayas definido en `config/database.php`).

## Registrar modelos personalizados {#registering-custom-models}

Publica el archivo de configuración de workflow y actualiza las vinculaciones `workflows.v2.*_model` para que apunten a tus clases personalizadas:

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

El paquete resuelve los modelos mediante `Workflow\V2\Support\ConfiguredV2Models`, por lo que cualquier relación o consulta que acceda a un modelo v2 usará automáticamente la conexión configurada.

Si vas más allá de las subclases con esquema compatible y cambias la clave
foránea inferida de tu `instance_model` personalizado, el paquete valida al
arrancar que hayas sustituido explícitamente las relaciones `runs()`,
`commands()` y `updates()`.

## Migraciones {#migrations}

Las migraciones de workflow se cargan automáticamente desde el paquete (`WorkflowServiceProvider::loadMigrationsFrom`) y se ejecutan en la conexión predeterminada de base de datos. Si diriges las tablas v2 a otra conexión, publica las migraciones con `php artisan vendor:publish --tag=migrations` y establece `protected $connection = 'mysql';` en cada clase de migración publicada para que `php artisan migrate` las ejecute en la base de datos correcta.
