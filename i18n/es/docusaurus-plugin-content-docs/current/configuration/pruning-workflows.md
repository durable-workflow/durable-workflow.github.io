---
sidebar_position: 6
title: Depuración de workflows
description: Archivado, retención, exportaciones verificadas y depuración segura de datos de workflows.
---

# Depuración de workflows {#pruning-workflows}

Workflow v2 distingue dos operaciones de ciclo de vida:

1. **Archivar**: marca una ejecución terminal como archivada para excluirla de las vistas de la flota activa. Archivar **no** elimina filas.
2. **Depurar**: elimina detalles retenidos aptos para borrarse o proyecciones huérfanas. La API de limpieza integrada exige una ejecución terminal y cerrada y comprueba sus bloqueos de retención. El host elige la política de retención. Archivar no es un requisito de la API.

Server tiene una política de retención por namespace independiente: su retención automática omite las ejecuciones archivadas. Por tanto, archivar una ejecución de Server la protege de esa limpieza. No es un paso previo al borrado automático.

## Conservar el historial más allá de la retención de la base de datos {#keeping-history-beyond-database-retention}

Decida dónde se conservará el historial necesario antes de activar la limpieza:

| Requisito | Opción | Consecuencia para almacenamiento y limpieza |
| --- | --- | --- |
| Conservar historial reciente en Server | Retención acotada por namespace, de 1 a 365 días | Las ejecuciones cerradas aptas pueden depurarse después del límite. Exporte antes si necesita conservarlas más tiempo. |
| Conservar todo el historial del namespace en Server | Modo de retención del namespace `forever` | El historial permanece en la base de datos principal hasta que vuelva explícitamente a una retención acotada. |
| Conservar ejecuciones cerradas concretas de Server | Archivar esas ejecuciones | Las pasadas automáticas y explícitas de retención las omiten. La API publicada no tiene operación para desarchivar, así que no use el archivado como bloqueo temporal de exportación. |
| Conservar un registro independiente más duradero | Exportar cada ejecución cerrada y conservar sus objetos de cargas externas | La aplicación controla la programación, verificación, acceso y posterior eliminación de esa copia. No hay una exportación continua del historial incorporada. |

`forever` y el archivado conservan las filas en la base de datos en vez de moverlas a un almacenamiento más barato. Prevea el historial y las cargas acumuladas, los índices, las copias de seguridad y el tiempo de restauración. La depuración conserva las filas de ejecución e instancia, incluidos los campos raíz de cargas. Su almacenamiento no se reduce a cero. Una exportación permite replay e investigación, pero no es una copia de seguridad completa de la base de datos ni garantiza que un archivo aislado permita reanudar una ejecución.

### Exportar antes de depurar {#export-before-pruning}

Use el mismo procedimiento para el trabajo de retención de una aplicación integrada y para un namespace de Server. La selección y la autoridad de limpieza son distintas, como se explica a continuación.

1. **Establezca una ventana segura.** Ejecute la exportación con suficiente antelación al límite de retención, dejando tiempo para reintentos, interrupciones y verificaciones pendientes. Por ejemplo, una exportación diaria con 30 días de retención deja más tiempo de recuperación que un trabajo que comienza el día 30. Antes de la primera exportación o de reducir la retención, proteja temporalmente el origen: pause la limpieza integrada o use la política `forever` de Server. Registre la política anterior y restáurela solo después de verificar. La limpieza puede ejecutarse en cuanto una ejecución sea apta.
2. **Inventaríe las ejecuciones cerradas.** Fije un límite superior UTC y seleccione valores de `closed_at` anteriores a él. Exporte cada ejecución, incluidas las fallidas, canceladas, terminadas y las predecesoras de continue-as-new. Una instancia puede tener varias ejecuciones. Conserve el namespace, el id de instancia, el id de ejecución y el momento de cierre de cada candidata, y recorra todas las páginas.
3. **Exporte una ejecución concreta.** Use el endpoint o comando limitado a la ejecución mostrado abajo, en vez de exportar la que sea actual cuando se ejecute el trabajo. Mantenga las exportaciones candidatas separadas de las copias ya verificadas.
4. **Verifique la copia almacenada.** Léala desde el destino. Compare su identidad con el inventario del namespace y compruebe la versión del esquema, la secuencia final esperada, el intervalo completo de eventos, la política de ocultación y la suma de integridad. Verifique las firmas configuradas con una clave de confianza. Conserve la compilación exacta de la aplicación y los codecs necesarios para un replay en frío. Una suma verifica que los bytes coinciden, no que el historial estuviera completo al exportarlo.
5. **Conserve los bytes externos.** Las exportaciones conservan las envolturas de referencias externas, no una copia independiente de cada objeto. Conserve esos bytes durante toda la vida de la exportación y pruebe su recuperación sin una caché caliente del runtime. Siga el [ciclo de vida de las cargas externas](../features/external-payload-storage.md#replay-retention-and-cleanup).
6. **Concilie antes de limpiar.** Compare el inventario de ejecuciones cerradas con los registros verificados en el destino. Alerte ante ids ausentes, verificaciones fallidas y exportaciones pendientes que se acerquen al límite. Avance el punto de control solo después de contabilizar cada candidata. Vuelva a examinar ventanas superpuestas de cierre y deduplique por namespace e id de ejecución. No reemplace un paquete completo verificado por una exportación posterior incompleta.

:::warning La depuración es irreversible sin una copia de recuperación

Exportar después de depurar no permite reconstruir los eventos eliminados. La implementación publicada aún puede marcar una ejecución terminal depurada con `history_complete: true` y reutilizar su `dedupe_key` anterior. Se sigue en [Workflow #856](https://github.com/durable-workflow/workflow/issues/856). No confíe en ninguno de esos campos como prueba de que la limpieza no ocurrió. Los trabajos integrados de exportación deben rechazar las ejecuciones con `details_pruned_at`. Una lista de Server deja de mostrar una ejecución cuando se elimina su resumen, por lo que un inventario iniciado después de limpiar no demuestra que se capturaron todas las ejecuciones anteriores. Conserve el inventario previo y examine las ausencias desde una copia de recuperación.

:::

### Seleccionar y exportar ejecuciones de Server {#selecting-and-exporting-server-runs}

La lista de workflows permite comparar `CloseTime` mediante el parámetro `query`. Este ejemplo selecciona un intervalo UTC fijo semiabierto:

```bash
curl --fail-with-body --get "$DURABLE_WORKFLOW_SERVER_URL/api/workflows" \
  -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  --data-urlencode "query=CloseTime >= '2026-10-01T00:00:00Z' AND CloseTime < '2026-10-02T00:00:00Z'" \
  --data-urlencode "page_size=200"
```

Lea `workflow_id`, `run_id` y `closed_at` de cada entrada de `workflows`. Repita la misma solicitud con `next_page_token` hasta obtener `next_page_token: null`. No filtre solo por `status=completed`, porque omitiría errores y otros resultados terminales. Mantenga la misma ventana al paginar e impida que la limpieza elimine sus resúmenes durante la captura.

Para cada pareja seleccionada, exporte y almacene su paquete:

```bash
curl --fail-with-body "$DURABLE_WORKFLOW_SERVER_URL/api/workflows/$WORKFLOW_ID/runs/$RUN_ID/history/export" \
  -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  --output "$RUN_ID.candidate.json"
```

La [política de retención de Server](../polyglot/server.md#retention) determina cuándo puede actuar la limpieza automática. Cuando todas las copias necesarias estén verificadas, restaure la política acotada prevista. Revise la capacidad antes de usar `forever` durante una interrupción prolongada de la exportación. Las ejecuciones archivadas siguen protegidas con independencia de esa política.

### Seleccionar y exportar ejecuciones integradas {#selecting-and-exporting-embedded-runs}

Use el modelo de ejecución configurado para seleccionar ejecuciones cerradas sin depurar mediante `closed_at`. La consulta siguiente crea el inventario de candidatas, no una exportación automática:

```php
use Workflow\V2\Models\WorkflowRun;
use Workflow\V2\Support\ConfiguredV2Models;

$runs = ConfiguredV2Models::query('run_model', WorkflowRun::class)
    ->whereNull('details_pruned_at')
    ->whereNotNull('closed_at')
    ->where('closed_at', '>=', $fromUtc)
    ->where('closed_at', '<', $untilUtc)
    ->orderBy('id')
    ->lazyById(100);

foreach ($runs as $run) {
    // Persist the candidate run id and close time in your export inventory.
}
```

Exporte cada ejecución seleccionada con el arranque y la configuración de almacenamiento habituales de la aplicación:

```bash
php artisan workflow:v2:history-export "$WORKFLOW_ID" --run-id="$RUN_ID" --output="$RUN_ID.candidate.json" --pretty
php artisan workflow:v2:replay-verify "$RUN_ID.candidate.json" --skip-replay --json
```

`--skip-replay` verifica la integridad y la estructura sin ejecutar un replay. No demuestra que sigan disponibles los bytes externos ni que el archivo se capturara antes de depurar. Pruebe por separado un replay completo representativo con la compilación prevista de la aplicación. La limpieza solo puede llamar a `pruneRun()` tras cumplir sus requisitos de retención y exportación. Una exportación correcta no autoriza automáticamente el borrado.

## Archivar ejecuciones terminales {#archiving-terminal-runs}

Archive una ejecución completada, fallida, cancelada o terminada mediante el plano de control:

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

La misma operación está disponible por la ruta HTTP del plano de control. Solo pueden archivarse ejecuciones cerradas. Archivar de nuevo una ejecución ya archivada devuelve `accepted` con el resultado `archive_not_needed`.

### Automatizar el archivado {#automating-archival}

Archive ejecuciones terminales periódicamente: consulte la tabla duradera de ejecuciones para encontrar las que finalizaron antes de su ventana de retención y llame a `archive()` para cada una. Para una regla temporal sencilla, añada algo como esto a `routes/console.php`:

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

## Depurar filas de proyección {#pruning-projection-rows}

Las proyecciones de resumen, espera, cronología, temporizador y linaje pueden reconstruirse a partir del historial y los comandos duraderos. Use `workflow:v2:rebuild-projections --prune-stale` para borrar las filas de proyección cuya ejecución duradera ya no exista:

```bash
# Preview what would be pruned
php artisan workflow:v2:rebuild-projections --prune-stale --dry-run

# Actually prune stale projection rows
php artisan workflow:v2:rebuild-projections --prune-stale
```

## Depurar filas duraderas {#pruning-durable-rows}

Los hosts integrados pueden usar la API de limpieza publicada tras aplicar su política de retención y verificar las exportaciones o copias de recuperación necesarias:

```php
use Workflow\V2\Support\WorkflowRunRetentionCleanup;

$report = WorkflowRunRetentionCleanup::pruneRun($runId);
```

`pruneRun()` bloquea la ejecución seleccionada y elimina sus detalles en una única transacción de almacenamiento. Rechaza una ejecución no terminal, un cierre sin fecha o una actividad separada abierta (`detached_activity_still_open`). El host sigue siendo responsable de seleccionar una ejecución autorizada y aplicar su ventana de retención. `retentionHoldReason($runId)` permite inspeccionar el bloqueo por actividad separada. La depuración lo vuelve a comprobar antes de borrar.

Conserve `workflow_runs` y `workflow_instances`. La ejecución permanece como un registro terminal con `details_pruned_at`; repetir la limpieza conserva la primera marca. Los campos raíz de entrada y salida permanecen en la fila, así que contabilice su almacenamiento por separado. No recree los resúmenes o el historial eliminados con una reconstrucción de proyecciones. Una exportación posterior a la depuración no recupera el historial borrado. La limitación de integridad de exportación se sigue en [Workflow #856](https://github.com/durable-workflow/workflow/issues/856).

Esta API elimina detalles de la base de datos. El host controla la retención y limpieza de objetos externos, incluidas las referencias de raíces retenidas, trabajo separado y bloqueos activos de copia de seguridad o recuperación. Siga el [ciclo de vida de las cargas externas](../features/external-payload-storage.md) antes de eliminar objetos. Verifique la exportación y los bytes externos necesarios **antes** de depurar. Las ejecuciones archivadas con detalles retenidos siguen disponibles para investigar incidentes.
