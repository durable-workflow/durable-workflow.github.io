---
sidebar_position: 10
---

import ConcurrencySimulator from '@site/src/components/ConcurrencySimulator';

# Concurrencia {#concurrency}

Esta guía cubre la concurrencia de workflows Laravel embebidos con `Workflow\V2\Workflow`. Para workers en modo servicio, usa la [guía del SDK PHP](https://php.durable-workflow.com/build/workflows-activities/), la [guía del SDK Python](https://python.durable-workflow.com/sdk-reference/#deterministic-parallel-groups) o la [referencia del SDK Rust](https://rust.durable-workflow.com/durable_workflow/struct.WorkflowContext.html#method.parallel).

`all([...])` describe el grupo duradero completo antes de suspenderse. El runtime embebido programa sus comandos de actividades e hijos y devuelve los resultados con la estructura anidada original de la entrada.

Usa un grupo de selección si el progreso depende del primer miembro completado en lugar de toda la barrera. La selección también es duradera: inicia todos los miembros, registra un ganador y deja activos a los demás hasta que el código los espere o cancele explícitamente.

## En serie {#series}

Este ejemplo ejecuta 3 actividades en serie, esperando a que termine cada una antes de continuar con la siguiente.

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle()
    {
        return [
            activity(MyActivity1::class),
            activity(MyActivity2::class),
            activity(MyActivity3::class),
        ];
    }
}
```

<ConcurrencySimulator
  activities={[
    { name: 'MyActivity1', duration: 1500 },
    { name: 'MyActivity2', duration: 2000 },
    { name: 'MyActivity3', duration: 1200 },
  ]}
  mode="series"
  title="Simulador de ejecución en serie"
/>

## En paralelo {#parallel}

Este ejemplo ejecuta 3 actividades en paralelo, espera a que todas terminen y reúne los resultados.

```php
use function Workflow\V2\{all, activity};
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle()
    {
        return all([
            fn () => activity(MyActivity1::class),
            fn () => activity(MyActivity2::class),
            fn () => activity(MyActivity3::class),
        ]);
    }
}
```

<ConcurrencySimulator
  activities={[
    { name: 'MyActivity1', duration: 2000 },
    { name: 'MyActivity2', duration: 1500 },
    { name: 'MyActivity3', duration: 2500 },
  ]}
  mode="parallel"
  title="Simulador de ejecución en paralelo"
/>

La diferencia principal es dónde ocurre la suspensión. En serie, cada `activity()` suspende y reanuda directamente el workflow. En paralelo, las clausuras describen primero toda la barrera y `all()` suspende una vez para el grupo completo. Así todos los miembros pueden ejecutarse en paralelo antes de reanudar el workflow.

## Selección de la primera finalización {#first-completion-selection}

`select([...])` inicia actividades, hijos, temporizadores, esperas de señal, esperas por condición o barreras ordinarias anidadas independientes. Reanuda cuando un miembro confirma un resultado apto o fallo tipado. Asigna claves de aplicación estables si el código posterior necesita distinguirlos o volver a acceder a ellos. Las claves deben ser cadenas no vacías o enteros no negativos.

El coordinador siguiente inicia el plazo en el mismo paso duradero que el resolutor. Procesar entradas o avanzar en el resolutor no puede reiniciarlo ni posponerlo:

```php
use function Workflow\V2\{activity, await, select, timer};
use Workflow\V2\Workflow;

final class ResolveInRealTime extends Workflow
{
    public function handle(string $requestId): array
    {
        $selected = select([
            'resolved' => fn () => activity(ResolveRequest::class, $requestId),
            'manual' => fn () => await('resolution.received'),
            'deadline' => fn () => timer('2 seconds'),
        ]);

        if ($selected->key === 'deadline') {
            $selected->handles['resolved']->cancel();

            return ['status' => 'timed_out'];
        }

        // The deadline is not cancelled just because another member won.
        $selected->handles['deadline']->cancel();

        return [
            'status' => 'resolved',
            'source' => $selected->key,
            'value' => $selected->result(),
        ];
    }
}
```

El resultado contiene clave e índice estables del miembro, tipo e identidad duradera de operación, resultado o fallo tipado, referencia al ganador y referencias a todos los miembros. Una referencia no ganadora puede esperarse después con `await()` o cancelarse con `cancel()`. La selección nunca descarta ni cancela implícitamente a un hermano. `cancel()` es una solicitud sin retorno de valor y nunca informa de si ganó la cancelación. El historial `SelectionOperationCancelled` determina el resultado. Si la finalización se confirma primero, no se escribe marcador de cancelación. La reproducción avanza después de la llamada solo cuando un límite confirmado de tarea de workflow, un comando sucesor o un evento terminal demuestra que se confirmó la ausencia de efecto. La reproducción de consultas se detiene en una cancelación en curso sin exponer estado posterior especulativo. Esperar la referencia tras esa confirmación devuelve la finalización anterior.

El runtime registra la primera resolución apta mientras mantiene el bloqueo de confirmación del padre. Por eso, reinicios en frío, recargas del historial persistido, consultas y finalizaciones posteriores de perdedores reutilizan el ganador registrado, sin competir con futuros locales del lenguaje ni reinterpretar el orden. Las entregas exactamente duplicadas son idempotentes. Las entradas concurrentes se ordenan por historial duradero confirmado; una entrada que llega mientras corre una actividad es visible en la siguiente tarea de workflow, y una entrada tardía o duplicada no reemplaza al ganador registrado.

## Barreras anidadas {#nested-barriers}

Los grupos anidados `all([...])` permiten expresar en un paso un árbol duradero de distribución y reunión de trabajo. El runtime programa cada actividad o hijo como secuencia hoja duradera, registra su `parallel_group_path` completo, espera hasta que todas las barreras que la contienen puedan avanzar y reconstruye la forma anidada original del resultado antes de reanudar. Al reproducir, cada hoja de actividad o hijo debe coincidir con esa ruta registrada. El historial tipado de hojas sin metadatos de grupo se considera historial incompatible de una versión preliminar antigua, sin suponer su encaje en la barrera actual.

```php
use function Workflow\V2\{all, activity};
use Workflow\V2\Workflow;

final class NestedWorkflow extends Workflow
{
    public function handle(): array
    {
        return all([
            fn () => activity(BuildSummary::class),
            fn () => all([
                fn () => activity(BuildInvoice::class),
                fn () => activity(BuildShipment::class),
            ]),
        ]);
    }
}
```

Waterline muestra tres esperas hoja abiertas, no una espera sintética «anidada». La primera solo pertenece a la barrera exterior; la segunda y tercera exponen un `parallel_group_path` de dos entradas para ver el grupo exterior y el subgrupo interior aún abierto.

El tamaño del grupo exterior cuenta hojas duraderas, no arrays anidados. Cada hoja lleva una ruta de fuera hacia dentro; todas sus entradas conservan la misma posición duradera del workflow. El grupo programa todas las hojas antes de suspenderse y después reúne los valores satisfactorios por posición de entrada. El reinicio del worker y la reproducción de historial completado reconstruyen la misma identidad de grupo. Las entregas terminales exactamente duplicadas se ignoran, y una finalización tardía de un hermano puede enriquecer diagnósticos parciales sin cambiar el miembro fallido ya seleccionado por la política determinista embebida.

El runtime embebido lanza el fallo tipado de la hoja desde `all()` y conserva los metadatos duraderos del grupo en el historial y las vistas de operador.

## Callback asíncrono {#async-callback}

`async(...)` ejecuta un callback serializable como workflow hijo duradero con tipo de sistema `durable-workflow.async`. Usa el mismo contrato secuencial de helpers que los workflows v2 con nombre: `activity()`, `await()`, `timer()`, `sideEffect()` y otros helpers de paso único suspenden directamente dentro del callback sin exigir `yield`.

```php
use function Workflow\V2\{activity, async};
use Workflow\V2\Workflow;

final class CustomerWorkflow extends Workflow
{
    public function handle(string $customerId): array
    {
        $profile = async(static function () use ($customerId): array {
            $customer = activity(LoadCustomer::class, $customerId);

            return [
                'customer' => $customer,
                'score' => activity(ScoreCustomer::class, $customer['id']),
            ];
        });

        return ['profile' => $profile];
    }
}
```

El padre ve el callback como espera de hijo. Historial, linaje y detalle de Waterline usan el mismo `child_call_id`, id de ejecución hijo e historial de resultados que `child(...)`. Se serializa con el soporte de clausuras serializables de Laravel; mantenlo local a la aplicación y despliegue. Usa `child(SomeWorkflow::class, ...)` con nombre si necesitas un tipo público estable para enrutamiento entre servicios o evolución prolongada del código. En v2 los callbacks `async(...)` son solo secuenciales: llama directamente a `activity()`, `child()`, `await()`, `timer()` y `all([...])` sin `yield`.

## Barreras mixtas de actividades e hijos {#mixed-activity--child-barriers}

El mismo `all()` reúne grupos mixtos de actividades e hijos. Los resultados conservan el orden del array, los miembros satisfactorios esperan al resto y el primer fallo despierta inmediatamente al padre.

Si varios miembros ya se cerraron sin éxito al reproducir el padre, recibe el fallo con la hora de cierre registrada más temprana. En empate gana el menor índice de hoja, por lo que reanudación y consultas eligen la misma excepción. Los fallos posteriores de hermanos no sustituyen la ya lanzada en el paso padre.

```php
use function Workflow\V2\{all, activity, child};
use Workflow\V2\Workflow;

final class OrderWorkflow extends Workflow
{
    public function handle(): array
    {
        [$charge, $shipment] = all([
            fn () => activity(ChargeCustomer::class),
            fn () => child(ShipOrderWorkflow::class),
        ]);

        return compact('charge', 'shipment');
    }
}
```

## Límites actuales {#current-limits}

La superficie actual aún no incluye:

- funciones integradas de concurrencia limitada más allá de grupos anidados explícitos `all([...])`.

## Workflows hijos en paralelo {#child-workflows-in-parallel}

Los hijos también pueden ejecutarse en su propia barrera `all([...])`. Funciona como las actividades paralelas: el padre distribuye varias ejecuciones hijas duraderamente y solo se reanuda cuando toda la barrera puede avanzar.

```php
use function Workflow\V2\{all, child};
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle(): array
    {
        return all([
            fn () => child(MyChild1::class),
            fn () => child(MyChild2::class),
            fn () => child(MyChild3::class),
        ]);
    }
}
```

<ConcurrencySimulator
  activities={[
    { name: 'MyChild1', duration: 2200 },
    { name: 'MyChild2', duration: 1800 },
    { name: 'MyChild3', duration: 2500 },
  ]}
  mode="parallel"
  title="Simulador de workflows hijos en paralelo"
/>

Esto permite crear paralelismo jerárquico, incluidos grupos anidados de hijos o mixtos cuando un paso padre necesita varias capas de reunión.
