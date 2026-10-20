---
sidebar_position: 11
title: Sagas
description: Compensación duradera, orden de deshacer operaciones y limpieza antes de un plazo.
---

# Sagas {#sagas}

Esta guía explica la compensación en workflows integrados en Laravel que utilizan `Workflow\V2\Workflow`. Para los workers en modo de servicio, consulte la [guía del SDK de PHP](https://php.durable-workflow.com/build/workflows-activities/), la [guía del SDK de Python](https://python.durable-workflow.com/sdk-reference/#saga-compensation) o la [referencia del SDK de Rust](https://rust.durable-workflow.com/durable_workflow/struct.Saga.html).

Las sagas son un patrón consolidado para gestionar operaciones complejas y prolongadas:

- Una saga gestiona transacciones distribuidas mediante una secuencia de transacciones locales.
- Una transacción local es una unidad de trabajo que realiza un participante de la saga, una actividad.
- Cada operación de la saga puede revertirse mediante una actividad compensatoria.
- El código del workflow decide cuándo invocar la compensación. Esta puede fallar y necesita tiempo y workers operativos para completarse.

```php
use function Workflow\V2\activity;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

#[Type('booking-saga')]
class BookingSagaWorkflow extends Workflow
{
    public function handle(): array
    {
        try {
            $flightId = activity(BookFlightActivity::class);
            $this->addCompensation(fn () => activity(CancelFlightActivity::class, $flightId));

            $hotelId = activity(BookHotelActivity::class);
            $this->addCompensation(fn () => activity(CancelHotelActivity::class, $hotelId));

            $carId = activity(BookRentalCarActivity::class);
            $this->addCompensation(fn () => activity(CancelRentalCarActivity::class, $carId));

            return compact('flightId', 'hotelId', 'carId');
        } catch (\Throwable $e) {
            $this->compensate();

            throw $e;
        }
    }
}
```

Cuando el workflow captura una excepción, `$this->compensate()` ejecuta todas las compensaciones registradas en **orden inverso**. En el ejemplo, si falla `BookRentalCarActivity`, el motor cancela primero el hotel y después el vuelo, deshaciendo la saga desde el paso más reciente.

Registre cada compensación después de que su actividad directa termine correctamente. El replay reconstruye ese orden de registro y reutiliza los resultados de actividad ya guardados, incluidas las compensaciones completadas.

## Compensación por vencimiento del plazo {#deadline-driven-compensation}

Un [tiempo de espera de workflow](./timeouts.md#timeout-outcome-and-cleanup) aplicado por el motor cierra la ejecución antes de que su código pueda compensar. Un bloque `catch` o `finally` no cambia ese comportamiento. Las órdenes inmediatas `cancel()` y `terminate()` tampoco dan tiempo para la limpieza.

Use un plazo anterior de la aplicación cuando quiera revertir el trabajo completado al agotarse el tiempo. Este workflow integrado reserva un recurso y espera hasta 30 segundos una señal de confirmación. Al vencer, el código del workflow se reanuda, libera la reserva y devuelve el resultado de negocio `expired`:

```php
use function Workflow\V2\{activity, await};
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Support\ActivityOptions;
use Workflow\V2\Workflow;

#[Type('reservation-deadline')]
#[Signal('confirm')]
final class ReservationDeadlineWorkflow extends Workflow
{
    public function handle(string $orderId): array
    {
        $reservationId = activity(
            ReserveResourceActivity::class,
            new ActivityOptions(scheduleToCloseTimeout: 30),
            $orderId,
        );
        $this->addCompensation(fn () => activity(
            ReleaseResourceActivity::class,
            new ActivityOptions(scheduleToCloseTimeout: 30),
            $reservationId,
        ));

        if (await('confirm', timeout: 30) === null) {
            $this->compensate();

            return ['status' => 'expired'];
        }

        return ['status' => 'confirmed'];
    }
}
```

`ReserveResourceActivity` y `ReleaseResourceActivity` son actividades de su aplicación. Haga ambas idempotentes con una clave de negocio estable para la reserva. La espera empieza después de reservar correctamente. Envíe `confirm` sin argumentos para obtener `true` como resultado correcto; `null` significa que la espera ha vencido.

Inícielo con un límite mayor del motor como protección final:

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(ReservationDeadlineWorkflow::class, 'order-123');
$workflow->start(
    'order-123',
    StartOptions::rejectDuplicate()->withRunTimeout(300),
);

// From an authenticated application action, before the wait expires:
WorkflowStub::load('order-123')->signal('confirm');
```

Si la espera vence y la compensación termina correctamente, el workflow finaliza de forma normal con `status: expired` en su resultado. No es una ejecución cerrada por el tiempo de espera del motor. Si falla la actividad que libera la reserva, `compensate()` propaga el error. Si el plazo del motor llega primero, la ejecución se cierra y no puede ejecutarse la compensación restante. Reserve tiempo suficiente para la planificación y los reintentos, y tenga en cuenta un plazo de ejecución completa anterior si lo hay.

La operación cooperativa independiente `requestCancellation()` permite que un llamador solicite limpieza mientras la ejecución está activa. Use su escudo de cancelación acotado para realizar limpieza duradera bajo esa solicitud. El tiempo de espera de un workflow no la activa automáticamente. Consulte [Cancelación cooperativa](../polyglot/cancellation.md).

## Orden de las compensaciones {#compensation-ordering}

Por defecto, las compensaciones se ejecutan **secuencialmente en orden inverso al registro**. Es la opción más segura porque los pasos posteriores pueden depender de los anteriores.

Por defecto, `compensate()` se detiene ante el primer fallo de compensación y lo propaga al llamador.

## Compensación en paralelo {#parallel-compensation}

Para ejecutar compensaciones en paralelo, use `setParallelCompensation(true)`. En ese modo, cada cierre de compensación debe devolver una llamada de actividad iniciada, sin esperar su resultado, para que el motor pueda ejecutarlas simultáneamente:

```php
use function Workflow\V2\activity;

use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

#[Type('parallel-saga')]
class ParallelSagaWorkflow extends Workflow
{
    public function handle(): void
    {
        $this->setParallelCompensation(true);

        try {
            $flightId = activity(BookFlightActivity::class);
            $this->addCompensation(fn () => activity(CancelFlightActivity::class, $flightId));

            $hotelId = activity(BookHotelActivity::class);
            $this->addCompensation(fn () => activity(CancelHotelActivity::class, $hotelId));

            activity(ChargePaymentActivity::class);
        } catch (\Throwable $e) {
            $this->compensate();

            throw $e;
        }
    }
}
```

Cuando la compensación paralela está activada, los cierres devuelven llamadas de actividad que el motor reúne y ejecuta mediante `all()`.

## Continuar ante errores {#continue-with-error}

Por defecto, si una actividad compensatoria lanza una excepción, se omiten las compensaciones restantes y el error se propaga. Para ejecutarlas todas aunque alguna falle, use `setContinueWithError(true)`:

```php
$this->setContinueWithError(true);
```

Con esta opción, el motor captura y descarta las excepciones de cada cierre de compensación y continúa con el siguiente. Es útil cuando las compensaciones son independientes y se desea intentar la limpieza aunque fallen algunos pasos.

### Combinar ambas opciones {#combining-both-flags}

Puede combinar `setParallelCompensation(true)` y `setContinueWithError(true)`. Con ambas opciones, todas las compensaciones se ejecutan en paralelo mediante `all()` y se captura la excepción de cualquiera de ellas para que las demás terminen. Sin `setContinueWithError(true)`, un fallo de compensación paralela se propaga de inmediato y el workflow falla.

```php
$this->setParallelCompensation(true);
$this->setContinueWithError(true);
```

## Cómo funciona {#how-it-works}

- `addCompensation()` registra una función invocable que se ejecutará durante `compensate()`
- `compensate()` recorre las compensaciones registradas en orden inverso
- Cada cierre de compensación es un paso normal del workflow V2. Sus actividades producen eventos duraderos de historial como cualquier otra actividad
- Las actividades de compensación se muestran en la cronología y la exportación del historial de Waterline
- Si el workflow termina correctamente, los cierres de compensación no se invocan ni producen historial

## Ejecutar este patrón {#run-this-pattern}

La saga del agente de viajes guiada por señales de la [Sample App](/docs/sample-app) es la referencia ejecutable de esta página. Clone la aplicación de ejemplo, configure `OPENAI_API_KEY` y ejecute:

```bash
php artisan app:ai
```

`App\Workflows\Ai\AiWorkflow` registra compensaciones para cada actividad de reserva. Si un vuelo falla tras reservar un hotel, la lista de compensaciones revierte la reserva del hotel. Es el mismo patrón de esta página, con eventos visibles en la cronología de la ejecución en Waterline.