---
sidebar_position: 1
title: Señales
description: Envía comandos externos tipados a workflows activos y comprende la validación, el enrutamiento y las esperas de señales.
tags:
  - commands
  - signals
  - human-in-the-loop
keywords:
  - señales de workflow
  - comando de señal
  - workflow con intervención humana
---

import SignalSimulator from '@site/src/components/SignalSimulator';

# Señales {#signals}

Las señales permiten activar eventos desde fuera del workflow. Sirven para reaccionar a eventos externos, permitir intervenciones humanas o indicar que terminó una tarea externa. Para entradas repetidas y ordenadas con avance duradero del cursor, usa [Flujos de mensajes](./message-streams.md).

## Aceptación y cierre {#acceptance-and-closure}

`signal_received` confirma la aceptación duradera. No confirma que el código haya procesado la señal. Inspecciona su estado conservado y su historial cuando la operación de negocio necesite confirmación.

Con Core 2.7.0 o un Server compatible, las señales aptas aceptadas durante una tarea remota de workflow tienen un turno de entrega antes del cierre satisfactorio. Las señales recibidas dirigidas a la instancia y declaradas en su contrato de comandos pasan a través de [continuar como nueva ejecución](./continue-as-new.md) con identidad, argumentos y orden originales. Una señal dirigida a una ejecución concreta nunca pasa a otra.

Las ejecuciones sin declaración duradera de señales no la adquieren porque un worker se registre después. Si el runtime no puede establecer la entrega, la señal aceptada se cierra con la disposición explícita de rechazo descrita abajo.

Si una ejecución se cierra sin aplicar una señal, su estado pasa a `rejected` con `run_closed_before_signal_applied`, fecha de cierre y un evento `SignalRejected`. Esto incluye señales almacenadas sin usar al completar normalmente y las que no pueden aplicarse antes de un fallo, cancelación o vencimiento. El recibo previo de aceptación sigue siendo válido. Usa una [actualización](./updates.md) cuando quien llama necesite un resultado de procesamiento conservado además de la aceptación.

Antes de actualizar un escritor a Core 2.7.0, drena y actualiza todos los lectores embebidos o de acceso directo a base de datos, incluido Waterline si comparte la base. Los lectores antiguos no decodifican `SignalRejected`; no los dejes con el nuevo escritor ni restaures un lector antiguo tras almacenar ese evento.

## Esperas de señales con nombre {#named-signal-waits}

El workflow llama directamente a `await('signal-name')`. El siguiente comando aceptado con ese nombre reanuda la ejecución y devuelve un valor determinista al workflow suspendido.

```php
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;
use function Workflow\V2\await;

#[Type('order-approval')]
#[Signal('approved-by', [
    ['name' => 'approvedBy', 'type' => 'string'],
])]
final class OrderApprovalWorkflow extends Workflow
{
    public function handle(): array
    {
        $approvedBy = await('approved-by');

        return [
            'approved_by' => $approvedBy,
            'workflow_id' => $this->workflowId(),
            'run_id' => $this->runId(),
        ];
    }
}
```

Activa la señal desde PHP usando el id público de instancia:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$result = $workflow->attemptSignalWithArguments('approved-by', [
    'approvedBy' => 'Taylor',
]);

$result->accepted();    // true
$result->outcome();     // "signal_received"
$result->commandId();   // Durable signal-command id
$result->instanceId();  // "order-123"
```

Comportamiento de las señales:

- Declara por adelantado cada nombre externo mediante el atributo de clase repetible `#[Signal('signal-name')]`. Puedes incluir un contrato ordenado de parámetros.
- Los comandos apuntan al id público de instancia, no al id de ejecución, para conservar la ruta pública al continuar como nueva ejecución.
- Con contrato de parámetros, la admisión rechaza cargas no válidas con `rejected_invalid_arguments` y `validation_errors` legibles por máquinas.
- Sin contrato, `await('name')` devuelve `true` sin argumentos, el valor único con uno o el array completo con varios.
- Los nombres desconocidos se rechazan con `rejected_unknown_signal`; las señales para instancias cerradas o sin iniciar se rechazan con `rejected_not_active` o `rejected_not_started`.

## Tras una respuesta incierta {#after-an-uncertain-response}

Puede vencer un plazo o perderse una respuesta después de admitir la señal de forma duradera. Una respuesta posterior de ejecución cerrada o no encontrada describe esa solicitud posterior; no establece si se aplicó la señal original. Consultar el estado antes de enviar también deja un intervalo en el que el workflow puede cerrarse o continuar como nueva ejecución.

Conserva el espacio de nombres, identidad del workflow, nombre de señal, argumentos y clave de operación originales al investigar una entrega incierta. Repetir una señal debe respetar el contrato real de duplicados del destino. No inicies un workflow de reemplazo solo porque se rechazó el reintento.

Consulta [recuperar un comando incierto](./updates.md#recover-after-an-uncertain-response) para inspeccionar actualizaciones conservadas y conciliar desde la aplicación.

## Identidad y autorización del remitente {#sender-identity-and-authorization}

`approvedBy` son datos de la aplicación. La cadena `Taylor` del ejemplo no demuestra que el remitente esté autenticado. Un contrato `#[Signal]` valida el nombre y argumentos; tu aplicación Laravel debe autenticar a quien llama y autorizar la operación antes de admitirla.

Por ejemplo, un endpoint de aprobación puede usar el usuario autenticado y una política de pedidos. Esta aplicación define un modelo `Order` con `workflow_instance_id` y `workflow_namespace` almacenados, y registra una política `approve` que comprueba el acceso al pedido. El endpoint no toma del cuerpo de la solicitud el actor ni los valores de enrutamiento:

```php
use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Route;
use Workflow\V2\CommandContext;
use Workflow\V2\WorkflowStub;

Route::post('/orders/{order}/approve', function (Request $request, Order $order) {
    $user = $request->user();
    Gate::forUser($user)->authorize('approve', $order);

    $actorId = (string) $user->getAuthIdentifier();
    $context = CommandContext::phpApi()->withPrincipal('user', $actorId);

    $result = WorkflowStub::load(
        $order->workflow_instance_id,
        $order->workflow_namespace,
    )->withCommandContext($context)->attemptSignalWithArguments('approved-by', [
        'approvedBy' => $actorId,
    ]);

    return response()->json([
        'accepted' => $result->accepted(),
        'outcome' => $result->outcome(),
        'command_id' => $result->commandId(),
    ], $result->accepted() ? 202 : 409);
})->middleware('auth');
```

La política se comprueba antes de cargar el workflow o enviar la señal. Todas las entradas de aprobación, incluidos webhooks o endpoints administrativos, deben aplicar la misma política. Dentro del workflow, `await('approved-by')` recibe el argumento registrado; no devuelve un objeto de remitente autenticado ni realiza otra comprobación de permisos.

La identidad de auditoría del comando es independiente de ese argumento. `withCommandContext()` registra el contexto en el `WorkflowCommand` identificado por `commandId()`. `context.principal` y los accesores `principalType()`, `principalId()` y `principalLabel()` permiten inspeccionar la auditoría en el host. El historial enlazado y las vistas de operador pueden mostrar la atribución registrada. La falta de atribución no establece una identidad.

`CommandContext::withPrincipal()` registra lo que suministra código confiable del host. No autentica usuarios ni autoriza señales. Mantén el contexto fuera de las entradas controladas por quien llama y no consultes una sesión HTTP activa ni permisos actuales en base de datos durante la reproducción determinista.

Las llamadas de SDK en modo servicio usan el límite de autorización HTTP de Server en lugar de esta ruta embebida. Consulta credenciales, gateways confiables e identidad de auditoría en [Autorización y atribución de señales](/docs/polyglot/namespace-auth-workers#signal-authorization-and-attribution).

<SignalSimulator />

**Importante:** usa `await()` únicamente en workflows, no en actividades.

Para esperar un predicado sobre estado duradero, consulta [Esperas por condición](./condition-waits.md). Para `await` con plazo, consulta [Señal + temporizador](./signal+timer.md). Para flujos repetidos de entrada/salida, consulta [Flujos de mensajes](./message-streams.md).

## Ejecutar este patrón {#run-this-pattern}

El workflow iniciado mediante webhook de la [Aplicación de ejemplo](/docs/sample-app) es la referencia ejecutable de la espera de señales con nombre:

```bash
php artisan app:webhook
```

`App\Workflows\Webhooks\WebhookWorkflow` comienza desde un webhook HTTP y se detiene en `await('ready')` hasta que llega la señal. Abre Waterline durante la espera y verás aparecer el evento `WorkflowExecutionSignaled` en cuanto se acepte.
