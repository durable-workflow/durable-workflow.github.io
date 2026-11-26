---
sidebar_position: 2
---

# Restricciones de los workflows {#workflow-constraints}

Para ser determinista, una clase de workflow no puede depender de estados
externos o servicios que cambien con el tiempo. Su código no debe consultar
directamente la fecha y hora actuales, el usuario de la sesión, recursos de
red externos ni otras fuentes de estado variable.

Ten en cuenta estas reglas al escribir un workflow:

- No uses `Carbon::now()` para consultar la fecha y hora actuales. El resultado
  cambia entre llamadas. Usa `Workflow\V2\Workflow::now()` o el helper
  `Workflow\V2\now()`, que devuelven una hora del workflow segura para la
  reproducción del historial.
- No uses `Auth::user()` para obtener el usuario actual. El resultado depende
  de la sesión. Pasa el usuario como entrada al iniciar el workflow.
- No hagas peticiones de red a recursos externos. Pueden responder lentamente
  o dejar de estar disponibles. Pasa los datos necesarios como entradas al
  iniciar el workflow o usa una actividad para obtenerlos.
- No generes valores aleatorios directamente en el workflow. Si necesitas
  hacerlo durante la ejecución, usa un side effect para registrar el resultado.
  También puedes pasar el valor aleatorio como entrada al iniciar el workflow.

## Logging desde el código del workflow {#workflow-logging}

El motor reproduce un workflow a partir de su historial cada vez que se despierta, así que una llamada de log ordinaria en el código del workflow se vuelve a escribir por cada paso completado. Un workflow con 50 pasos registra su primera línea 50 veces. Usa en su lugar el logger consciente de la reproducción. Solo escribe cuando el código se ejecuta por primera vez. Los loggers de los workflows embebidos, del PHP SDK y de Rust también añaden la identidad de la ejecución a cada línea:

- Workflows embebidos (Workflow 2.42.0 o posterior): `$this->logger()` devuelve un logger PSR-3 que escribe a través del logger de Laravel, o del canal que indiques, como en `$this->logger('workflow')`. Cada línea incluye `workflow_instance_id`, `workflow_run_id`, `workflow_type` y `namespace`. `$this->replayState()` devuelve `Workflow\V2\Enums\WorkflowReplayState` (`Replaying`, `Executing` o `Unavailable`), y `$this->isReplaying()` es su forma booleana.
- PHP SDK: `$context->logger()` escribe a través del logger PSR-3 del `Worker`. Consulta la [guía del PHP SDK](../polyglot/php.md#workflow-logging).
- Rust SDK: `ctx.logger()`. Consulta el [logger de workflow del Rust SDK 4.17](../polyglot/rust.md#workflow-logging).
- Python SDK: `ctx.logger`, que guarda silencio durante la reproducción pero no añade la identidad de la ejecución.

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

final class ShipOrderWorkflow extends Workflow
{
    public function handle(string $orderId): string
    {
        $this->logger()->info('Shipping started', ['order_id' => $orderId]);
        $label = activity(PrintLabelActivity::class, $orderId);
        $this->logger()->info('Label printed', ['label' => $label]);

        return $label;
    }
}
```

Las consultas y los validadores de actualización nunca registran logs, porque siempre son una reproducción.

En los workflows embebidos, las líneas se escriben después de que se confirme la transacción de base de datos de la tarea de workflow, así que una tarea que se revierte no escribe nada. El código que espera en un handle `select()` pendiente sin registrar un paso registra una sola vez, en la tarea que supera la espera. Las líneas de un handler de actualización en vivo se escriben cuando se aplica la actualización. En el PHP SDK, las líneas se escriben después de que el Server acepta la tarea de workflow; consulta la [guía del PHP SDK](../polyglot/php.md#workflow-logging).

El logging es una observación del proceso. Mantén los comandos durables del workflow independientes de las observaciones del estado de reproducción y de la entrega de logs. Un logger consciente de la reproducción no es un outbox exactly-once: si un worker embebido o del PHP SDK muere entre la confirmación o la aceptación y la escritura, esas líneas se pierden, y el logger de Rust puede repetir un mensaje de un intento no confirmado tras una caída o un reintento. Mantén los handlers del host acotados y no bloqueantes para que el logging no detenga el worker. Coloca los efectos de negocio durables en la actividad adecuada o en una operación de workflow registrada.

## Comprobaciones al iniciar la aplicación {#boot-time-guardrails}

Cuando registras clases de workflow en `workflows.v2.types.workflows`, el paquete
las analiza al iniciar la aplicación para detectar llamadas claramente
incompatibles con la reproducción, como `Carbon::now()`, `Auth::user()`, `DB::`,
`Http::` o `random_int()`. La opción `workflows.v2.guardrails.boot` determina
cómo se comunican los hallazgos:

| Modo | Comportamiento |
|------|----------------|
| `warn` (predeterminado) | Registra una advertencia por cada hallazgo. La aplicación puede iniciarse. |
| `silent` | Omite por completo el análisis al iniciar la aplicación. |
| `throw` | Lanza una `LogicException` ante el primer hallazgo. Es útil en CI. |

```php
// config/workflows.php
'v2' => [
    'guardrails' => [
        'boot' => env('DW_V2_GUARDRAILS_BOOT', 'warn'),
    ],
],
```

Configura `DW_V2_GUARDRAILS_BOOT=throw` en CI para que la compilación falle si
se añaden llamadas incompatibles con la reproducción. Mantén `warn` en
producción para que un hallazgo previo no impida un despliegue.

### Qué comprueba el análisis {#scan-coverage}

El análisis es léxico. Solo lee la clase del workflow, sus clases padre y sus traits, y señala:

- lecturas del reloj: `time()`, `date()`, `microtime()`, `hrtime()`, `today()`, llamadas estáticas como `Carbon::now()`, y `new DateTime()`, `new DateTimeImmutable()`, `new Carbon()` o `new CarbonImmutable()` sin argumento o con un tiempo relativo como `'now'` o `'+1 day'`. Una fecha fija no se señala.
- aleatoriedad: `random_int()`, `random_bytes()`, `rand()`, `mt_rand()`, `uniqid()`, `shuffle()`, `array_rand()`, `str_shuffle()` y ayudantes del estilo de `Str::uuid()`.
- estado en vivo: `DB::`, `Cache::`, `Http::`, `Auth::`, `auth()` y `request()`.

No ve llamadas hechas mediante clases auxiliares o de servicio, valores que dependen del estado del proceso como propiedades estáticas o el orden de datos sin orden, ni nada que se decida en tiempo de ejecución. Un análisis limpio no prueba el determinismo. Ejecuta la [verificación de replay](../testing.md) sobre historiales registrados para detectar el resto.

En la primera versión, el análisis al iniciar la aplicación es la única
comprobación del modo workflow que puede bloquear el inicio. El runtime no
repite el diagnóstico de determinismo al reclamar una tarea de workflow. Esta
decisión es deliberada en 2.0: el análisis detecta problemas en los workflows
PHP registrados localmente antes del despliegue. Waterline muestra los cambios
en la huella de la definición de ejecuciones largas sin convertir la entrega
de tareas entre versiones del código en una nueva causa de fallos de despliegue.

Las ejecuciones anteriores al registro de huellas de definición también siguen
una política conservadora. Si una ejecución llega a una nueva rama de
`getVersion()` y su evento `WorkflowStarted` es anterior a la captura de la
huella, el runtime mantiene esa ejecución en `WorkflowStub::DEFAULT_VERSION`.
Consulta [Versionado](../features/versioning.md).

### Cambios en comentarios y formato {#comment-only-edits}

De forma predeterminada, una huella de definición cubre las líneas de código fuente literales. Por eso, editar solo comentarios, docblocks o espacios en blanco en una clase de workflow, sus traits o sus clases de workflow padre, o dentro de una closure de condición de `await()`, cuenta como un cambio de definición para las ejecuciones en curso: un marcador `getVersion()` o `patched()` ausente toma `WorkflowStub::DEFAULT_VERSION`, y una closure de condición editada hace fallar el replay.

Desde 2.34, los workers pueden registrar en su lugar huellas de los tokens de código PHP sin comentarios ni espacios en blanco (prefijo `sha256-tokens:`), que esas ediciones no cambian. Actívelo con `DW_DEFINITION_FINGERPRINT_VERSION=v2` cuando todos los workers estén actualizados a 2.34 o posterior, porque un worker anterior trata esa ejecución como cambiada. Cada ejecución conserva la versión de huella que registró: las ejecuciones iniciadas antes de activarlo siguen siendo sensibles a los cambios de comentarios, y volver a `v1` es seguro.
