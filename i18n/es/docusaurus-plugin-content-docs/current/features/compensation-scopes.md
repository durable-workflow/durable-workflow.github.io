---
sidebar_position: 12
title: Ámbitos de compensación
description: Conserve las obligaciones de compensación más allá de la ejecución del workflow que las creó y recupérelas después de que la ejecución se cierre, en workflows integrados en Laravel.
---

# Ámbitos de compensación {#compensation-scopes}

Esta guía explica la compensación conservada en workflows integrados en Laravel que utilizan `Workflow\V2\Workflow`. Una [saga](sagas.md) compensa dentro de la ejecución que la registró. Un ámbito de compensación guarda cada obligación en un registro duradero, de modo que la obligación todavía puede compensarse después de que esa ejecución se haya completado, haya fallado o haya sido cancelada.

Use un ámbito cuando la cancelación pueda llegar tarde, por ejemplo cuando un workflow de envío se completó y su pedido se cancela días después, o cuando una operación de avance puede surtir efecto sin devolver un resultado registrado.

## Disponibilidad y estabilidad {#availability-and-stability}

| Parte | Estado |
| --- | --- |
| `DurableScope`, `RegisteredObligation`, `Obligation`, `ScopeIdentity` | Estabilidad prevista (2.32.0 o posterior) |
| `ScopedOperation`, `OperationContext`, `ForwardResult`, `Resolution`, `HandlerRegistry`, `HandlerContractViolation` | Estabilidad prevista (2.32.0 o posterior) |
| `ScopeAuthorization`, `ScopeAuthorizationRefused`, `ScopeRecovery::request()`, `ScopeRecovery::describe()`, `ScopeRetention::release()` | Estabilidad prevista (2.32.0 o posterior) |
| `DurableScope::reserveChild()` y admisión raíz (`RootReservationStore`) | Experimental |
| Clases marcadas con `@internal` (actividades, persistencia, motor de recuperación) | No es API pública |

Las API de ámbitos se publicaron por primera vez como experimentales en 2.29.0. La recuperación automática después de que se cierre la ejecución de origen, el calendario de reintentos de recuperación y `describe()` llegan en 2.31.0. Los resultados de manejador revisados (`failed()`, `rejected()` y `HandlerContractViolation`) llegan en 2.32.0. Toda la API sigue siendo experimental, y puede cambiar en una versión menor, hasta que una versión posterior (2.32.0 o posterior, según se decida en esa versión) promueva las partes marcadas con estabilidad prevista. Tras esa promoción, siguen la [política de compatibilidad de 2.x](../compatibility.md). La compatibilidad inicial se limita a Laravel integrado y a la compensación secuencial.

## Cómo funciona {#how-it-works}

Un ámbito se identifica mediante `(application, namespace, key, generation)`. Su trabajo de avance pertenece a una única ejecución de origen, así que elija una generación que sea única para esa ejecución. Cada obligación se registra, junto con su compensación, antes de que se despache su efecto de avance. El registro guarda:

- un tipo y una versión de manejador cerrados, nunca un closure de PHP;
- un ID de operación estable, que el manejador utiliza para conciliar con el proveedor;
- una entrada portable (como máximo 15 360 bytes como JSON, 500 valores y profundidad 7);
- los resultados del avance y de la compensación, con referencias de evidencia.

Mientras la ejecución de origen está abierta, cancelarla ejecuta la saga nativa, que compensa en orden inverso al de registro. Después de que la ejecución se cierra, un workflow de recuperación canónico compensa las mismas obligaciones a partir del registro. Nunca reabre la ejecución original ni modifica su historial.

## Configurar el host {#set-up-the-host}

Vincule una política de autorización de ámbitos y un registro de manejadores cerrado en un service provider. La política devuelve su versión de política. Para rechazar, lanza `ScopeAuthorizationRefused`.

```php
use App\Compensation\OrderScopeAuthorization;
use App\Compensation\StockReservation;
use Workflow\V2\Compensation\Execution\HandlerRegistry;
use Workflow\V2\Compensation\Security\ScopeAuthorization;

$this->app->singleton(ScopeAuthorization::class, OrderScopeAuthorization::class);
$this->app->singleton(HandlerRegistry::class, static fn (): HandlerRegistry => new HandlerRegistry([
    'stock.reserve' => ['1' => new StockReservation()],
]));
```

`ScopeAuthorization::assertAllowed($scope, $principal, $operation)` se invoca con `register`, `forward`, `compensate`, `participate`, `request`, `release` o `inspect`. Rechace cualquier otro nombre de operación. Solo `ScopeAuthorizationRefused` es un rechazo permanente. Cualquier otra excepción se trata como transitoria: se reintenta, y la recuperación automática vuelve a intentarlo más tarde. Derive el principal de una política de aplicación de confianza, nunca de la carga útil de una solicitud. Ejecute las migraciones del paquete; crean las tablas del registro en la conexión de almacenamiento del workflow.

Los identificadores (aplicación, clave, generación, clave de operación y versión del manejador) usan de 1 a 128 caracteres de `A-Z a-z 0-9 . _ : / -` y empiezan por una letra o un dígito. Los tipos de manejador usan `a-z 0-9 . _ -`, empiezan por una letra minúscula y no deben empezar por `dw.`, que está reservado para el motor.

## Registrar obligaciones en un workflow {#register-obligations-in-a-workflow}

```php
use Workflow\V2\Attributes\Type;
use Workflow\V2\Compensation\Definition\Obligation;
use Workflow\V2\Compensation\Definition\ScopeIdentity;
use Workflow\V2\Compensation\DurableScope;
use Workflow\V2\Exceptions\WorkflowCancellationRequestedException;
use Workflow\V2\Workflow;

#[Type('order')]
final class OrderWorkflow extends Workflow
{
    public function handle(array $identity, array $shipment): array
    {
        $scope = new DurableScope($this, ScopeIdentity::fromArray($identity), 'order-service');
        try {
            $scope->execute(new Obligation('reserve-stock', 'stock.reserve', '1', ['sku' => 'sku-1']));
            $scope->participate('shipment', ScopeIdentity::fromArray($shipment));
            // ... start the shipment workflow, wait for business events ...

            return ['status' => 'completed'];
        } catch (WorkflowCancellationRequestedException $cancelled) {
            self::cancellationShield(fn () => $this->compensate());

            return self::cancellationShield(static fn () => $scope->verifyCompensation());
        }
    }
}
```

- `execute()` registra la obligación y después ejecuta su operación de avance.
- `register()` solo registra y devuelve una `RegisteredObligation`. Llame a su `execute()` más adelante en el mismo workflow cuando el orden de compensación deba diferir del orden de despacho.
- `participate()` registra un ámbito hijo. La compensación secuencial espera el registro verificado de ese hijo antes de compensar obligaciones anteriores del padre. Un hijo ausente o no verificado detiene el trabajo anterior del padre.

## Escribir un manejador {#write-a-handler}

```php
use InvalidArgumentException;
use Workflow\V2\Compensation\Execution\ForwardResult;
use Workflow\V2\Compensation\Execution\OperationContext;
use Workflow\V2\Compensation\Execution\Resolution;
use Workflow\V2\Compensation\Execution\ScopedOperation;

final class StockReservation implements ScopedOperation
{
    public function assertInput(array $input): void
    {
        if (! is_string($input['sku'] ?? null)) {
            throw new InvalidArgumentException('A SKU is required.');
        }
    }

    public function execute(OperationContext $context): ForwardResult
    {
        // Idempotent by operation ID: a retry or a lost acknowledgement finds the same reservation.
        $reservation = Stock::reserve($context->operationId, $context->obligation->input['sku']);

        return ForwardResult::observed(['reservation' => $reservation->id], ['stock:' . $reservation->id]);
    }

    public function compensate(OperationContext $context): Resolution
    {
        if (! Stock::release($context->operationId)) {
            return Resolution::unknown('stock-release-pending');
        }

        return Resolution::verified(['stock-release:' . $context->operationId]);
    }
}
```

Los manejadores pueden ejecutarse más de una vez para la misma operación, así que haga que ambos métodos sean idempotentes por `operationId`.

- `execute()` devuelve `ForwardResult::observed()` con evidencia, `unknown()` cuando el resultado en el proveedor es incierto, o `rejected()` cuando el proveedor con certeza no produjo ningún efecto. Un avance rechazado hace fallar la llamada del workflow con `scope_forward_rejected`, y su compensación no necesita ninguna llamada al proveedor. Cuando `$context->reconcileBeforeForward` es true, es posible que un intento anterior haya surtido efecto; consulte la operación antes de emitirla de nuevo.
- `compensate()` devuelve `Resolution::verified()` solo con evidencia de que el efecto se ha deshecho y de que no es posible ningún efecto de avance tardío. El valor devuelto por un callback, un timeout o una ejecución cerrada no constituye esa evidencia. Devuelva `unknown()` para mantener la obligación sin resolver y permitir que se ejecuten los reintentos nativos, o `failed()` cuando la compensación con certeza no puede completarse. Cuando `$context->forwardOutcomeUnconfirmed` es true, el efecto de avance nunca se confirmó y aún puede llegar tarde.
- Un resultado no válido, como `verified()` sin evidencia, un motivo no válido o un valor del resultado de avance que supera el límite, lanza `HandlerContractViolation`. El motor registra el resultado como desconocido, de modo que la compensación sigue conciliando la operación, y hace fallar la actividad con el error no reintentable `scope_handler_contract_violation` seguido del mensaje de la infracción. No se reintenta como un resultado desconocido del proveedor.
- Los manejadores escritos para 2.31.0 o anteriores pueden pasar un segundo argumento a `verified()`. `verified($evidence, true)` sigue verificando y emite un aviso `E_USER_DEPRECATED`; `verified($evidence, false)` devuelve `unknown('late-forward-possible')`. Elimine el segundo argumento.

## Cancelar y recuperar {#cancel-and-recover}

Solicite la compensación con una clave de solicitud estable:

```php
use Workflow\V2\Compensation\Recovery\ScopeRecovery;

$result = app(ScopeRecovery::class)->request($scope, 'cancel-order-42', 'order-service', 'customer-cancelled');
```

- Si la ejecución de origen sigue abierta, la solicitud le pide que se cancele y su saga compensa.
- Si esa ejecución se cierra con el ámbito todavía sin verificar, el watchdog de tareas dirige la misma solicitud a la recuperación canónica en su siguiente pasada. Se ejecuta en los bucles de los workers de cola y en `workflow:v2:repair-pass`, y primero vuelve a autorizar al principal original. Las pasadas concurrentes o una solicitud manual que compita con ellas inician una sola ejecución de recuperación.
- Si la ejecución ya está cerrada, la solicitud inicia directamente la recuperación canónica.

Las ejecuciones de recuperación realizan hasta seis intentos por compensación. Entre intentos esperan 1, 2, 5 y 10 segundos, y después un lease de actividad más una pasada de reparación de tareas, de modo que el intento de un worker que se haya caído se recupera antes del último intento. La verificación de un hijo, o una nueva solicitud autorizada, despierta de inmediato un reintento en espera. Un fallo persistente sigue haciendo fallar la ejecución de recuperación, y la obligación queda sin resolver.

Inspeccione el resultado con `describe()`. Es de solo lectura y requiere la autorización `inspect`. Siempre devuelve las mismas claves. Los estados provienen de los enums `ScopeStatus`, `NextAction`, `AutomaticRecovery` y `ObligationStatus`, y un rechazo es un `code` estable más el `message` del host, que no es estable para su procesamiento automático. Estos enums pueden incorporar nuevos casos en una versión menor, así que gestione los valores que no reconozca con una rama por defecto:

```php
$view = app(ScopeRecovery::class)->describe($scope, 'order-service');
// scopeStatus, originStatus, recoveryRunId, recoveryStatus, automaticRecovery, refusal, nextAction, unresolved
```

`nextAction` es `submit_fresh_authorized_request` cuando la recuperación automática fue rechazada (`automaticRecovery: recovery_authorization_failed`) o una ejecución de recuperación falló. En ese caso, envíe una nueva clave de solicitud. Repetir una clave de solicitud devuelve su comprobante original y nunca inicia otra ejecución.

El registro del ámbito liquida la compensación. Una decisión de negocio, como marcar el pedido como `cancelled`, sigue siendo un paso de su aplicación después de que `scopeStatus` sea `verified`. El patrón recomendado es un listener que finalice la cancelación de negocio cuando se complete una ejecución de recuperación, como hace el ejemplo de proveedor del repositorio del motor.

## Retención, actualización y reversión {#retention-upgrade-and-rollback}

- `ScopeRetention::release($scope, $principal)` elimina las entradas y los resultados de avance conservados después de la verificación. Mantiene una lápida, de modo que una generación o una clave de solicitud antiguas nunca puedan volver a aceptarse. Nada caduca automáticamente, y la depuración del historial de ejecuciones nunca elimina el registro.
- Una reversión del esquema se rechaza antes de que cualquier migración ejecute `down()` mientras el registro contenga algún ámbito, incluida una lápida liberada. Para volver atrás, restaure una copia de seguridad de la base de datos realizada antes de la actualización.
- Revertir solo el paquete a una versión anterior conserva el registro. La recuperación se reanuda cuando vuelva a actualizar. No revierta a una versión anterior mientras haya una ejecución de recuperación abierta.

## Garantías y límites {#guarantees-and-limits}

Tras la promoción, las API estables no cambian de forma incompatible dentro de 2.x. Los historiales de compensación registrados se reproducen en cada versión 2.x posterior, y el comportamiento nuevo solo llega tras un marcador de versión registrado. Las migraciones del registro solo añaden.

Estos límites son mínimos que pueden aumentar, pero no disminuirán:

- entrada de una obligación: 15 360 bytes como JSON, 500 valores y profundidad 7; valor del resultado de avance: 11 264 bytes, 400 valores y profundidad 7 (los ámbitos registrados antes de 2.32.0 conservan para ambos el límite de envoltorio anterior, más amplio);
- 256 obligaciones por ámbito, incluidos hasta 16 participantes hijos, y un nivel de anidamiento;
- 128 solicitudes por ámbito, compartidas con las solicitudes hijas del motor;
- 32 referencias de evidencia de como máximo 128 bytes por resultado.

No se garantiza: el momento en que actúa el watchdog, los intervalos exactos de reintento (solo que la recuperación dura más que una reparación de lease), la disposición de las filas del registro ni nada marcado con `@internal`. Nunca se prometen efectos externos exactamente una vez; la conciliación con el proveedor por ID de operación es responsabilidad de su manejador.

La [guía de ámbitos de compensación](https://github.com/durable-workflow/workflow/blob/main/docs/compensation-scopes.md) del repositorio del motor documenta el contrato completo, incluidas las API experimentales de reserva de hijos y de admisión raíz.
