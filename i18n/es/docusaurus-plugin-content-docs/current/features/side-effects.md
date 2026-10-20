---
sidebar_position: 7
---

# Efectos secundarios {#side-effects}

Un efecto secundario es una clausura con código no determinista. Se ejecuta una sola vez y se guarda el resultado. Si se reintenta el workflow, no se ejecuta de nuevo: devuelve el resultado guardado. Así se conserva el determinismo, porque la reproducción siempre devuelve el mismo valor almacenado sin volver a ejecutar el código no determinista.

```php
use function Workflow\V2\await;
use function Workflow\V2\sideEffect;
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Workflow;

#[Signal('finish')]
class MyWorkflow extends Workflow
{
    public function handle(): array
    {
        $token = sideEffect(fn () => random_int(1000, 9999));
        $finish = await('finish');

        return compact('token', 'finish');
    }
}
```

El workflow solo llama una vez a `random_int()` y guarda el resultado, aunque después falle y se reintente.

## Cuándo usar efectos secundarios {#when-to-use-side-effects}

Usa `sideEffect()` para un valor no determinista que:

- se calcule localmente sin E/S externa (números aleatorios, UUID o marcas de tiempo);
- nunca deba cambiar tras registrarse, incluso al reproducir;
- no necesite reintentos: la clausura se ejecuta exactamente una vez.

```php
// Generate a correlation token for downstream systems.
$correlationId = sideEffect(fn () => (string) Str::uuid());

// Snapshot the current time for a business rule.
$decidedAt = sideEffect(fn () => now()->toIso8601String());
```

## Cuándo usar una actividad {#when-to-use-an-activity-instead}

Si el código puede fallar, consulta un servicio externo o necesita reintentos o tiempos de espera, usa una [actividad](../defining-workflows/activities.md):

| Escenario | Usar |
|---|---|
| Generar un token aleatorio | `sideEffect()` |
| Leer un valor de configuración al decidir | `sideEffect()` |
| Llamar a una API externa | `activity()` |
| Escribir en una base de datos | `activity()` |
| Enviar un correo o notificación | `activity()` |
| Calcular un valor costoso que puede lanzar una excepción | `activity()` |

Como regla práctica, si la clausura puede lanzar una excepción que querrías reintentar, debe ser una actividad.

## Funcionamiento {#how-it-works}

- cada llamada `sideEffect()` añade un evento tipado `SideEffectRecorded` con la secuencia del paso;
- la reproducción del workflow y de consultas reutilizan el valor confirmado sin volver a ejecutar la clausura;
- Waterline muestra la instantánea como entrada tipada en la cronología de la ejecución seleccionada;
- los efectos secundarios solo sirven para instantáneas seguras para la reproducción, no para trabajo que pueda fallar o necesite reintentos.

## Antipatrones {#anti-patterns}

**No llames a servicios externos dentro de un efecto secundario.** Si falla la llamada, no se reintenta y el workflow falla permanentemente:

```php
// BAD: HTTP calls can fail and side effects do not retry.
$price = sideEffect(fn () => Http::get('/api/price')->json('amount'));

// GOOD: Use an activity for external calls.
$price = activity(FetchPriceActivity::class);
```

**No incluyas operaciones lentas o bloqueantes.** La clausura se ejecuta en el hilo de la tarea de workflow. Un trabajo prolongado retrasa toda la tarea:

```php
// BAD: Expensive computation blocks the workflow task.
$hash = sideEffect(fn () => bcrypt($largePayload));

// GOOD: Offload heavy work to an activity.
$hash = activity(ComputeHashActivity::class, $largePayload);
```

**No dependas de estado externo mutable.** La clausura se ejecuta exactamente una vez. Si lees un valor que cambia, la instantánea queda fijada en la primera ejecución, no al reproducir:

```php
// The cached value is whatever it was during the first execution.
// If the cache changes later, this workflow still sees the old value.
$setting = sideEffect(fn () => cache('feature.flag'));
```

Es intencional: la instantánea queda fijada para garantizar el determinismo. Si necesitas un valor que se actualice durante la vida del workflow, usa una señal o actividad.

## Ejecutar este patrón {#run-this-pattern}

El workflow de tiempo transcurrido de la [Aplicación de ejemplo](/docs/sample-app) es la referencia ejecutable para encapsular las lecturas del reloj en `sideEffect()`:

```bash
php artisan app:elapsed
```

`App\Workflows\Elapsed\ElapsedTimeWorkflow` registra marcas de inicio y fin como enteros dentro de callbacks de `sideEffect()` para conservar el valor tras decodificar cargas Avro al reproducir. El detalle de Waterline muestra dos eventos `MarkerRecorded` a ambos lados del disparo del temporizador. Esa pareja es la evidencia en disco de que las lecturas del reloj siguieron siendo deterministas.
