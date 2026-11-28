---
title: Agrupar revisiones tras una pausa
description: Actualice una entidad tras un periodo de calma mediante esperas de señal duraderas.
---

# Agrupar revisiones tras una pausa {#debouncing-and-coalescing}

## Esperar un periodo de calma {#quiet-window}

Use un ID de workflow estable por entidad. Conserve la revisión positiva más alta y actualice a esa versión. El patrón omite deliberadamente las revisiones intermedias. Úselo para actualizar al estado más reciente. Procese operaciones como los pagos individuales en un flujo que atienda cada solicitud.

Cada señal abre una nueva espera con un tiempo límite. Un resultado `null` marca el fin de la pausa. Las esperas y los temporizadores registrados guían la reproducción.

```php
use Workflow\V2\Activity;
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, await, continueAsNew};

#[Type('docs.entity-debounce')]
#[Signal('changed', [
    ['name' => 'revision', 'type' => 'int', 'allows_null' => false],
])]
final class EntityDebounce extends Workflow
{
    public function handle(
        string $entity,
        int $pending = 0,
        int $applied = 0,
        int $batches = 0,
    ): mixed {
        while (true) {
            if ($pending <= $applied) {
                $pending = max($applied, await('changed'));
            }

            while (($next = await('changed', timeout: 1)) !== null) {
                $pending = max($pending, $next);
            }

            if ($pending <= $applied) {
                continue;
            }

            activity(ApplyRevision::class, $entity, $pending);
            $applied = $pending;

            if (++$batches >= 2) {
                return continueAsNew($entity, 0, $applied, 0);
            }
        }
    }
}

#[Type('docs.apply-revision')]
final class ApplyRevision extends Activity
{
    public function handle(string $entity, int $revision): array
    {
        return ['entity' => $entity, 'revision' => $revision];
    }
}
```

Registre el tipo de workflow para que un worker nuevo o una ejecución sucesora encuentre la misma definición.

```php
config(['workflows.v2.types.workflows' => [
    'docs.entity-debounce' => EntityDebounce::class,
]]);
```

## Admitir cambios de forma atómica {#embedded-intake}

```php
use Workflow\V2\WorkflowStub;

$entity = 'customer-42';
$revision = 1;
$receipt = WorkflowStub::make(EntityDebounce::class, 'refresh:'.$entity)
    ->signalWithStart('changed', [$revision], $entity);
```

El recibo confirma la admisión duradera. La actividad puede seguir pendiente. El `signalWithStart` embebido inicia una instancia ausente, envía la señal a su ejecución activa o crea una ejecución nueva tras el cierre. Las políticas de inicio ordinarias dejan cerrada una instancia cerrada.

## Conservar cambios pendientes y limitar el historial {#pending-input-and-continuation}

Una señal recibida durante la actividad queda pendiente hasta la siguiente espera. El siguiente lote tiene su propio periodo de calma. La actividad en curso sigue ejecutándose. Incluya en la continuación la revisión aplicada y cualquier revisión pendiente ya consumida. Las señales pendientes dirigidas a la instancia con un controlador declarado pueden pasar a la ejecución sucesora. Un comando dirigido a una ejecución queda vinculado a la seleccionada.

Mida el historial con una ráfaga representativa. `SignalReceived`, `SignalApplied`, las esperas, los temporizadores y las actividades generan eventos. Una ráfaga continua puede agotar el historial antes de la primera pausa. Limite la entrada y deje margen para continuar. Continue-as-new conserva el plazo de ejecución.

La actividad del ejemplo devuelve la revisión elegida. Para efectos reales, use en el destino una clave de idempotencia como `(entidad, revisión)`. Un reintento de actividad puede repetir la solicitud externa aunque la señal se haya deduplicado.
