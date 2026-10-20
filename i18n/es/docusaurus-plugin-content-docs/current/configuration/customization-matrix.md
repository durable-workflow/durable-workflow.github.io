---
sidebar_position: 4.5
title: Matriz de personalización
description: Matriz de soporte fijada para las sustituciones de modelos de Durable Workflow v2, serializadores, repositorio de observabilidad, salud, importaciones, migraciones y escrituras.
---

# Matriz de personalización {#customization-matrix}

Esta página fija el contrato de personalización compatible con Durable Workflow v2.
Úsala para trasladar los modelos duraderos v2 a otra conexión, sustituir sus
subclases, reemplazar el repositorio PHP de observabilidad para operadores o
determinar si una configuración antigua de serializador sigue siendo válida durante la migración.

## Matriz de sustituciones compatibles {#supported-override-matrix}

| Superficie | Contrato compatible | Notas |
| --- | --- | --- |
| `workflows.v2.instance_model` con una subclase de esquema compatible que conserve el nombre base `WorkflowInstance` | Compatible | Usa esta forma si solo necesitas otra conexión, conversiones de atributos o espacio de nombres de la aplicación. Las relaciones heredadas conservan el contrato de clave foránea `workflow_instance_id` del paquete. |
| `workflows.v2.instance_model` con una subclase que cambie la tabla o el nombre base | Compatible con sustituciones explícitas de relaciones | Sustituye `runs()`, `commands()` y `updates()` para que conserven `workflow_instance_id`. El paquete lo valida al arrancar y rechaza la inferencia de relaciones heredadas que cambiaría esas claves. `currentRun()` ya fija explícitamente `current_run_id` y no necesita sustituirse. |
| Otras sustituciones `workflows.v2.*_model` (`run_model`, `task_model`, `history_event_model`, proyecciones, programaciones, filas de actividades, fallos, mensajes, memos, atributos de búsqueda y llamadas a hijos) | Compatibles con subclases de esquema compatible | Conserva los nombres de columnas, claves primarias y claves foráneas del paquete. Estas relaciones ya fijan sus claves, por lo que las subclases que cambien de tabla pueden conservar los métodos heredados si el esquema sigue siendo compatible. |
| Nombres de tabla y nombres de columnas de claves foráneas personalizados | No compatible | El runtime v2 y las superficies del operador presuponen los nombres de columnas y claves del paquete. Cambiarlos queda fuera del contrato compatible. |
| Sustitución de `OperatorObservabilityRepository` | Compatible mediante vinculación en el contenedor | Vincula tu implementación a `Workflow\V2\Contracts\OperatorObservabilityRepository`. Es un contrato de integración del runtime PHP para Waterline y `WorkflowStub::historyExport()`, no una API estable entre lenguajes. El repositorio recibe objetos de modelo del paquete. |
| `serializer` | Compatible solo con `avro` y los códecs heredados de vaciado/importación | Las nuevas ejecuciones v2 siempre usan la semántica de Avro. `workflow-serializer-y` y `workflow-serializer-base64` solo siguen siendo válidos para terminar o importar historiales v1 que aún requieran decodificación nativa de PHP. Las clases de serializadores personalizados v1 no son compatibles con v2. |
| Diagnósticos de salud y doctor | Compatibles | `php artisan workflow:v2:doctor` y la salud/estadísticas de Waterline v2 reflejan las clases de modelo configuradas y señalan los ajustes obsoletos del serializador como deuda de migración. |
| Migraciones del paquete en una conexión no predeterminada | Compatibles con migraciones publicadas | Las migraciones cargadas automáticamente se ejecutan en la conexión predeterminada de Laravel. Si tus modelos duraderos usan otra conexión, publica las migraciones y establece explícitamente su `$connection`. |
| Runtime central de escritura (`WorkflowStub::make()`, `load()`, creación de tareas y resolución de la ejecución actual) | Compatible mediante los modelos duraderos configurados | El runtime respeta `instance_model`, `run_model` y `task_model` configurados. Mantén las tablas de escritura compatibles con las columnas y claves del paquete. |

## Claves exactas de modelos v2 {#exact-v2-model-keys}

La configuración publicada `workflows.php` expone estas claves de modelos duraderos
bajo `workflows.v2`:

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

Usa subclases de los modelos del paquete para esas claves. Conserva los nombres
de columnas y claves foráneas del paquete salvo que otra página de esta documentación indique lo contrario.

## Regla para sustituir el modelo de instancia {#instance-model-override-rule}

La única sustitución v2 actual que requiere trabajo adicional en las relaciones
es `workflows.v2.instance_model` cuando tu subclase cambia la clave foránea
inferida por una distinta de `workflow_instance_id`.

Ejemplo habitual seguro:

```php
namespace App\Models\V2;

use Workflow\V2\Models\WorkflowInstance as BaseWorkflowInstance;

final class WorkflowInstance extends BaseWorkflowInstance
{
    protected $connection = 'workflow';
}
```

Como el nombre base de la subclase sigue siendo `WorkflowInstance`, Eloquent
conserva la misma clave foránea inferida y las relaciones heredadas permanecen alineadas.

Si usas otro nombre base o un modelo de almacenamiento con otra tabla, sustituye
explícitamente las relaciones afectadas:

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

Si faltan esas sustituciones, el paquete falla de inmediato al arrancar en lugar
de dejar que la aplicación use claves inferidas como
`tenant_workflow_instance_id` o `custom_workflow_instance_id`.

## Reglas de serialización, importación y salud {#serializer-import-and-health-rules}

- Conserva `serializer = 'avro'` para el trabajo nuevo en v2.
- Usa códecs heredados solo al finalizar o importar historiales v1 que aún
  necesiten decodificar cargas útiles con PHP nativo.
- No configures v2 con clases de serializadores personalizados v1 eliminadas.
- Ejecuta `php artisan workflow:v2:doctor` después de actualizar o cambiar la
  configuración. Este diagnóstico señala los ajustes heredados del serializador
  y otros problemas que impiden arrancar correctamente.
- Considera la salud y las estadísticas de Waterline v2 como la vista para el
  operador de esa misma configuración de modelos duraderos.

## Reglas de migración y escritura {#migration-and-write-side-rules}

- El procedimiento habitual usa las migraciones del paquete cargadas automáticamente en la conexión predeterminada.
- Si tus modelos duraderos usan otra conexión, publica las migraciones y configura
  su `$connection` para que `php artisan migrate` apunte a la misma base de datos
  que las subclases de modelo configuradas.
- Conserva los nombres de tabla, claves primarias y claves foráneas del paquete
  en cada modelo que participe en la ruta de escritura del runtime.
- La ruta de escritura no se limita a personalizar lecturas: los inicios, cargas,
  resolución de la ejecución actual y ejecución de tareas usan los modelos duraderos configurados.

## Guías relacionadas {#related-guides}

- [Publicar la configuración](./publishing-config.md)
- [Conexión de base de datos](./database-connection.md)
- [Guía de migración](../migration.md)
- [Supervisión](../monitoring.md)
