---
sidebar_position: 3
---

# Actualizaciones {#updates}

Las actualizaciones permiten recuperar información del estado actual de un workflow y modificarlo al mismo tiempo. Combinan, en esencia, una consulta y una señal.

## Comandos explícitos de actualización {#explicit-update-commands}

Cada actualización aceptada:

- Es una llamada de solicitud/respuesta a un workflow activo. `attemptUpdate*()` espera a que termine el manejador; `submitUpdate*()` retorna al aceptar duraderamente el comando y permite consultar después con `inspectUpdate($updateId)`.
- Usa el nombre duradero declarado en el historial y en las rutas webhook. `#[UpdateMethod('mark-approved')]` mantiene estable el nombre público aunque cambie el método PHP.
- Se rechaza para ejecuciones históricas o cerradas, sin modificar silenciosamente la actual.
- Rechaza nombres no declarados con `rejected_unknown_update` y argumentos contrarios al contrato con `rejected_invalid_arguments` y `validation_errors` legibles por máquinas antes de ejecutar el manejador.

Como las consultas, primero reproduce historial confirmado. A diferencia de ellas, puede modificar estado seguro para la reproducción y devolver un valor.

Define el método con `UpdateMethod`. Su argumento de cadena opcional fija un nombre público duradero que sobrevive a los cambios de nombre PHP:

```php
use Workflow\UpdateMethod;
use Workflow\V2\Workflow;

final class MyWorkflow extends Workflow
{
    private bool $ready = false;

    #[UpdateMethod('mark-ready')]
    public function updateReady(bool $ready): bool
    {
        $this->ready = $ready;

        return $this->ready;
    }
}
```

Llama directamente al método para obtener el valor de retorno sin envoltorio:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$ready = $workflow->updateReady(true);
```

Esa llamada PHP directa sigue usando el nombre del método. El destino del comando duradero continúa siendo `mark-ready`.

Usa `attemptUpdate()` si también necesitas el resultado del comando duradero. Pasa ahí el nombre duradero:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$result = $workflow->attemptUpdate('mark-ready', true);

$result->accepted();        // true
$result->completed();       // true when the update body ran successfully
$result->updateStatus();    // "accepted", "completed", "failed", or "rejected"
$result->updateId();        // Durable update lifecycle id
$result->result();          // Raw update return value when completed
$result->failureMessage();  // Failure message when the update body threw
```

`attemptUpdate()` registra primero la aceptación y después espera a que el worker aplique la actualización y cierre su ciclo de vida. La espera se limita mediante `workflows.v2.update_wait.completion_timeout_seconds`. Si el worker no lo ha cerrado al agotarse el presupuesto, devuelve el ciclo aceptado con `waitTimedOut() === true` y `updateStatus() === 'accepted'`.

Usa `withUpdateWaitTimeout()` si una llamada necesita otro presupuesto de finalización:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123')
    ->withUpdateWaitTimeout(5);

$result = $workflow->attemptUpdate('mark-ready', true);
```

Usa `attemptUpdateWithArguments()` si ya tienes una lista posicional o mapa de parámetros con nombre:

```php
$result = $workflow->attemptUpdateWithArguments('mark-ready', [
    'ready' => true,
]);
```

Los mapas con nombre se validan con la instantánea duradera del contrato y se normalizan al orden de declaración antes de aceptarlos.

Usa `submitUpdate()` o `submitUpdateWithArguments()` si solo necesitas aceptación duradera y permites que el worker la aplique después:

```php
$accepted = $workflow->submitUpdate('mark-ready', true);

$accepted->accepted();     // true
$accepted->completed();    // false
$accepted->updateStatus(); // "accepted"
$accepted->result();       // null until the worker records UpdateCompleted
```

Usa `inspectUpdate()` si ya tienes un `update_id` y quieres leer más tarde el ciclo almacenado sin volver a esperar:

```php
$latest = $workflow->inspectUpdate($accepted->updateId());

$latest->updateStatus(); // "accepted"
$latest->closedAt();     // null until the lifecycle closes
```

`inspectUpdate()` no espera a la ejecución. Recarga el ciclo duradero y devuelve el `UpdateResult` actual.

## Recuperarse tras una respuesta incierta {#recover-after-an-uncertain-response}

La admisión duradera, la finalización del manejador y un efecto de negocio externo son hechos separados. El plazo de quien llama puede vencer mientras una actualización aceptada sigue ejecutándose, y una respuesta perdida puede ocultar un resultado ya confirmado. Un rechazo posterior a enviar otra actualización no aclara el resultado original.

Si tu aplicación guardó el ID de actualización, inspecciona ese ciclo conservado en lugar de enviar otra. Conserva el ID de ejecución original para que una continuación como nueva ejecución no redirija la investigación:

```php
use Workflow\V2\WorkflowStub;

$latest = WorkflowStub::loadRun($savedRunId, $savedNamespace)->inspectUpdate($savedUpdateId);

$latest->updateStatus();
$latest->result(); // Available when that retained update completed.
```

Los IDs guardados proceden de la operación original. La inspección lee el registro conservado y puede funcionar después de que la ejecución se cierre o sea histórica. Si la evidencia falta o se ha depurado, el resultado sigue sin resolver; no autoriza a repetir un efecto. Conserva un registro de operación en la aplicación para conciliar cuando se pierdan la respuesta y el ID generado.

### IDs de solicitud y recibos conservados {#request-ids-and-retained-receipts}

Guarda en la aplicación el espacio de nombres, ID de instancia, ID de ejecución original, ID de actualización, nombre de operación e intención. Un recibo aceptado prueba la admisión duradera. Un ciclo completado aporta el resultado registrado del manejador. Ninguno prueba que un pago, correo o escritura independiente haya ocurrido exactamente una vez.

`request_id` no es un contrato portable de ID de actualización limitado a una ejecución. Las rutas PHP verificadas pueden devolver la primera actualización conservada si se envía la misma clave con otros argumentos. La búsqueda embebida también abarca distintos nombres de actualización de esa instancia. Reutilizar una clave tras continuar como nueva ejecución puede devolver el resultado predecesor sin admitir una actualización en la sucesora. También puede devolverse un recibo con clave después del cierre mientras se rechaza una actualización nueva.

Usa una clave por operación lógica y conserva su intención original. No cambies argumentos, no la reutilices para otro nombre de actualización ni supongas que inicia una operación nueva en la siguiente ejecución. La ruta de actualización activa del servicio PHP y la búsqueda embebida no tienen idénticas reglas de coincidencia. En particular, reutilizarla entre nombres no es una receta de recuperación compatible. El [registro de cualificación](https://github.com/durable-workflow/durable-workflow.github.io/pull/268) identifica el runtime y SDK PHP publicados y documenta las rutas distintas. Server nativo y los demás SDK necesitan su propia cualificación.

La recuperación depende de conservar comandos, actualizaciones e historial. Aquí no se promete una duración de deduplicación independiente de la aplicación. Revisa la [retención del historial](../configuration/pruning-workflows.md) y conserva el registro de negocio durante el tiempo que exija tu aplicación. La falta de evidencia sigue siendo un resultado desconocido.

### Proteger el efecto de negocio {#protect-the-business-effect}

Para una operación como cobrar una factura:

1. Guarda antes de enviar el comando una clave de operación, como `tenant-1:charge:invoice-123`, y su intención inmutable. Reutilízala al recuperar.
2. En la actividad que aplica el efecto, usa una restricción única de base de datos sobre cliente y clave. Comprueba atómicamente la intención, aplica el efecto local y guarda el resultado en una transacción. Devuelve el resultado guardado para un duplicado de igual intención; rechaza otra intención.
3. Con un proveedor externo, usa su contrato de idempotencia o un proceso de bandeja de salida y conciliación. Una transacción local no puede hacer atómica una llamada independiente al proveedor.
4. Tras una respuesta incierta, concilia el registro de operación, el ciclo original y la evidencia del proveedor. Registra si el efecto está pendiente, confirmado, fallido o aún desconocido antes de decidir otra acción.

Una consulta seguida de un comando deja una carrera. Una señal duplicada puede activar otra actividad aunque la original fuera admitida. La protección de la aplicación debe tolerar entregas repetidas. El ejemplo cualificado ejecuta dos actividades para una clave, pero confirma un solo efecto local de base de datos. No demuestra ejecución exactamente una vez en sistemas externos arbitrarios.

Reglas de actualización:

- `load($instanceId)` actualiza la ejecución duradera más reciente, incluso tras continuar como nueva ejecución.
- Las actualizaciones nuevas mediante `loadRun($runId)` se rechazan con `rejected_not_current` si la seleccionada ya es histórica. Inspeccionar recibos conservados es distinto.
- Las actualizaciones nuevas a ejecuciones cerradas se rechazan con `rejected_not_active`. Repetir un recibo conservado con clave es distinto.
- Los manejadores fallidos no cierran el workflow; se registran como fallos de actualización y dejan la ejecución abierta para la siguiente tarea de reproducción.
- Las consultas reproducen las actualizaciones completadas. Las rechazadas o fallidas permanecen solo como hechos de comandos e historial no reproducibles.
