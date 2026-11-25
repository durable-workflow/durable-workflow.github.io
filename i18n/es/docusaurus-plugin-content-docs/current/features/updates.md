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
- Rechaza como `update_validator_rejected`, antes de aceptarla, una solicitud que tu [validador de actualización](#validate-updates-before-acceptance) rechaza.

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

## Validar actualizaciones antes de aceptarlas {#validate-updates-before-acceptance}

Sin un validador, una actualización que incumple una regla de negocio se acepta y después falla. Queda registrada como una actualización fallida, y quien llama no puede distinguir una solicitud incorrecta de una operación fallida. Declara un validador para rechazar la solicitud antes de que se acepte. Los validadores requieren Workflow 2.42.0 o posterior.

```php
use RuntimeException;
use Workflow\UpdateMethod;
use Workflow\UpdateValidator;
use Workflow\V2\Workflow;

final class CartWorkflow extends Workflow
{
    private array $items = [];

    #[UpdateMethod('add-item')]
    public function addItem(string $item): array
    {
        $this->items[] = $item;

        return $this->items;
    }

    #[UpdateValidator('add-item')]
    public function validateAddItem(string $item): void
    {
        if (count($this->items) >= 10) {
            throw new RuntimeException('The cart is full.');
        }
    }
}
```

`#[UpdateValidator]` identifica la actualización por su nombre durable, o por el nombre de su método cuando la actualización no tiene alias. El validador recibe los mismos argumentos que la actualización. Antes de aceptar la actualización, el motor reconstruye el estado de la ejecución a partir de su historial y llama solo al validador:

- Si retorna con normalidad, la actualización se acepta y se aplica como de costumbre.
- Si lanza una excepción o devuelve `false`, la actualización se rechaza con el motivo `update_validator_rejected` y el resultado `rejected_invalid_arguments`. `rejectedByValidator()` es verdadero, `rejectionMessage()` devuelve el mensaje de la excepción y `validationErrors()` devuelve los errores de una `ValidationException` de Laravel. `update()` lanza una `LogicException` que incluye ambos.
- Una actualización rechazada nunca se acepta, su handler nunca se ejecuta y el workflow no se despierta. Como cualquier otro rechazo, solo se registra como un evento de auditoría `UpdateRejected`, que la reproducción ignora.

Los validadores son de solo lectura. Pueden leer el estado reconstruido del workflow, pero cualquier llamada durable (una actividad, un temporizador, un workflow hijo, una señal, un side effect, `await`, continue-as-new o un upsert de memo o de atributos de búsqueda) lanza `UpdateValidatorCommandException` y rechaza la actualización. Los cambios que un validador hace en el estado reconstruido se descartan. Un validador generador se rechaza, porque su cuerpo nunca se ejecuta.

Los validadores no se registran en el historial y nunca se ejecutan durante la reproducción, así que no afectan al determinismo. Ven el estado del historial confirmado: una actualización aceptada pero aún no aplicada no es visible para ellos. La reproducción y el validador se ejecutan mientras la admisión de la actualización mantiene los bloqueos de la ejecución, así que mantén los validadores rápidos.

Si el estado no puede reconstruirse, o el validador encuentra un error de base de datos, se lanza `UpdateValidationFailedException` y no se registra nada. Las rutas de webhook de actualización responden con un `503` reintentable y `update_validation_failed`. Reintenta con el mismo ID de solicitud.

Un reintento con clave de una actualización rechazada devuelve el rechazo conservado sin volver a ejecutar el validador.

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

Los webhooks de actualización de Laravel embebido toman la clave del llamador de `X-Request-Id`. Conserva esa cabecera al pasar por proxies. Las actualizaciones HTTP del Server independiente toman la clave solo del campo `request_id` del cuerpo JSON; su cabecera `X-Request-Id` es contexto de correlación. Sin la clave del cuerpo, la actualización no tiene clave de deduplicación, aunque varias peticiones compartan la cabecera.

Una clave de comando identifica una actualización en una instancia de workflow, en todas sus ejecuciones. Con Workflow 2.18.0 o posterior, adjúntala con `withRequestId()`. Tras perder una respuesta, vuelve a enviar la misma actualización con la misma clave:

```php
use Workflow\V2\WorkflowStub;

$result = WorkflowStub::load('order-123')
    ->withRequestId('mark-ready-order-123')
    ->attemptUpdate('mark-ready', true);

$result->retained();          // True when this call returned an earlier admission
$result->intentVerified();    // False only for a legacy receipt
$result->requestIdConflict(); // True when the key already names a different update
$result->updateId();          // The original update on every matching retry
```

- Un reintento con la misma clave, nombre de actualización, argumentos tipados y ejecución de destino explícita devuelve el recibo original, incluido su ID de actualización, y no registra nada. Después del cierre o de continuar como nueva ejecución, el reintento sigue devolviendo la actualización original. No admite una actualización nueva en una ejecución sucesora.
- La misma clave con otro nombre de actualización, otros argumentos u otra ejecución de destino se rechaza como `rejected_request_id_conflict`. `conflict()` identifica el comando conservado y las partes que difieren. No se registra nada y la clave mantiene su recibo original.
- Un recibo admitido antes de que Workflow registrara la intención del comando se lee con `retained()` verdadero e `intentVerified()` falso. Es la admisión original, no una prueba de que los argumentos de este reintento coincidan con ella.
- Las claves tienen de 1 a 255 caracteres Unicode y se comparan exactamente. Una clave no válida lanza `InvalidCommandRequestIdException` antes de la admisión.

Usa una clave por operación lógica y nunca cambies sus argumentos. Usa una clave nueva para una operación nueva, también después de confirmar que se rechazó una actualización con clave. Las versiones anteriores a Workflow 2.18.0 y al Server nativo 3.9.0 no comparan la intención: en ellas, una clave reutilizada con otros argumentos u otro nombre de actualización devuelve el recibo de la primera actualización.

Los clientes en modo servicio envían la clave como `request_id` en el cuerpo. El Server nativo 3.9.2 y posteriores aplican las mismas reglas y añaden un rechazo `request_id_ambiguous` para algunas claves heredadas. Consulta [claves de comando de señales y actualizaciones](/docs/polyglot/server-api-reference#command-keys) para el contrato HTTP y las llamadas de PHP, Python, Rust y la CLI.

La recuperación depende de conservar comandos, actualizaciones e historial. Cuando la retención depura los detalles de una ejecución, sus claves desaparecen con ellos, y una solicitud posterior con esa clave se admite como un comando nuevo. Aquí no se promete una duración de deduplicación independiente de la aplicación. Revisa la [retención del historial](../configuration/pruning-workflows.md) y conserva el registro de negocio durante el tiempo que exija tu aplicación. La falta de evidencia sigue siendo un resultado desconocido.

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
- Una actualización aceptada mientras se ejecuta la tarea de workflow que completa la ejecución recibe un turno de entrega antes de que la ejecución se cierre, igual que una señal. Su manejador se ejecuta y quien la llamó recibe su resultado. Las actualizaciones todavía pendientes cuando una ejecución falla, se cancela o se termina se cierran con un fallo explícito.
- Los manejadores fallidos no cierran el workflow; se registran como fallos de actualización y dejan la ejecución abierta para la siguiente tarea de reproducción.
- Las consultas reproducen las actualizaciones completadas. Las rechazadas o fallidas permanecen solo como hechos de comandos e historial no reproducibles.
