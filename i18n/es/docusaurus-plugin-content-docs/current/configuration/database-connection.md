---
sidebar_position: 4
---

# Conexión de base de datos {#database-connection}

Workflow usa la conexión de base de datos predeterminada de tu aplicación Laravel, salvo que selecciones otra conexión para su almacenamiento duradero.

Para usar una conexión definida en `config/database.php` como almacenamiento de workflow, establece su nombre en el entorno:

```dotenv
DW_STORAGE_CONNECTION=workflows
```

Los modelos, las transacciones, los bloqueos de filas y las acciones posteriores al commit de workflow usan esa conexión. Mantén todas las tablas duraderas de workflow en la misma conexión de Laravel. Configura el transporte de la cola por separado mediante la configuración de colas de Laravel.

También puedes seleccionar la conexión mediante clases de modelos personalizadas, como se explica más abajo. El `run_model` v2 configurado proporciona la conexión de almacenamiento para los metadatos v2 sin conexión explícita en su modelo. Las conexiones explícitas de los modelos deben coincidir con ella. `DW_STORAGE_CONNECTION` tiene prioridad sobre las propiedades de conexión de los modelos.

Consulta la [Matriz de personalización](./customization-matrix.md) para conocer el
contrato completo de sustituciones v2, incluidas las subclases que cambian de tabla,
las reglas del serializador, la sustitución del repositorio, los diagnósticos de
salud y los requisitos de migración.

## Conexiones de modelos personalizados {#custom-model-connections}

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

Repite el patrón para cada modelo duradero v2 que debas redirigir. Como mínimo:

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

Las migraciones de workflow se cargan automáticamente desde el paquete y respetan `DW_STORAGE_CONNECTION`. Las migraciones de la aplicación conservan sus propias conexiones configuradas.

Si usas conexiones de modelos personalizados sin `DW_STORAGE_CONNECTION`, asigna la misma `$connection` a sus migraciones de workflow publicadas. La opción `--database` de Laravel también permite seleccionar el destino al ejecutar solo esas migraciones de workflow. Mantén las migraciones de la aplicación en su conexión de aplicación.

## Límites de las transacciones {#transaction-boundaries}

Cuando los datos de la aplicación y el almacenamiento de workflow usan la misma conexión de Laravel, iniciar un workflow dentro de una transacción lo incorpora a ella. Un rollback elimina las escrituras de workflow realizadas dentro de esa transacción. El motor publica las tareas de workflow en la cola y emite los eventos del ciclo de vida después del commit de la transacción de almacenamiento más externa. Un rollback descarta esas acciones.

Por ejemplo, con `DW_STORAGE_CONNECTION=workflows`:

```php
use App\Workflows\OrderWorkflow;
use Illuminate\Support\Facades\DB;
use Workflow\V2\WorkflowStub;

DB::connection('workflows')->transaction(function () {
    WorkflowStub::make(OrderWorkflow::class, 'order-123')->start('order-123');
});
```

Los modelos de la aplicación cuyos cambios deban confirmarse atómicamente con este inicio también deben usar la conexión `workflows`.

Las transacciones en conexiones distintas de Laravel se confirman de forma independiente, aunque los nombres de conexión apunten a la misma base de datos física. Una transacción en la conexión predeterminada de la aplicación no puede revertir un workflow ya confirmado en otra conexión de almacenamiento. Coloca los cambios que requieran atomicidad en la misma conexión e inclúyelos en su transacción.

La publicación posterior al commit protege el límite del almacenamiento de workflow. Una base de datos o un broker de mensajes independiente para la cola tiene sus propias reglas de transacción y entrega.
