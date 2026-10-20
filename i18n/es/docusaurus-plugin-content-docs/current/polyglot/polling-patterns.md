---
title: Sondeo del estado externo
description: Elija reintentos acotados, actividades con heartbeat o bucles de temporizadores duraderos y contabilice su coste en el historial.
---

# Sondeo del estado externo {#polling-external-state}

Consulte un trabajo externo desde una actividad, nunca mediante solicitudes de red en el código del workflow. Decida dónde debe residir la espera antes de elegir el intervalo.

## Elija el límite de la espera {#choose-the-waiting-boundary}

| Patrón | Uso de workers | Historial duradero y control |
| --- | --- | --- |
| Reintentar una actividad hasta que esté lista | Un slot de actividad durante cada intento; se libera durante la espera entre reintentos | Cada intento y reintento añade historial. El código del workflow no se reanuda entre intentos, por lo que no puede consultar entonces el presupuesto de historial ni continuar como nuevo. |
| Una actividad larga con heartbeats | Ocupa su slot de actividad durante toda la espera | Cada heartbeat aceptado añade un evento al historial. Use plazos finitos para la actividad y un timeout acotado para la solicitud externa; los heartbeats no amplían el plazo de toda la ejecución. |
| Una consulta en una actividad seguida de un temporizador duradero | Libera los slots de actividad entre consultas | Cada consulta añade eventos de actividad y cada intervalo añade eventos de temporizador. Entre consultas, el workflow puede decidir detenerse, compensar o continuar como nuevo. |
| Un workflow hijo dedicado al sondeo | El hijo usa los slots que requiere el patrón elegido | Traslada el historial del sondeo al hijo; añade eventos de inicio y resolución del hijo al padre. El historial y la ejecución del hijo siguen teniendo coste. Elija explícitamente la política de cierre del padre. |

Use consultas breves que puedan repetirse con seguridad. Un callback bloqueado en una solicitud externa no se vuelve receptivo solo porque su workflow tenga un temporizador o una política de cancelación.

## Acote los reintentos y el historial {#bound-retries-and-history}

Los reintentos son explícitos: las actividades PHP tienen un solo intento por defecto. Por ejemplo, configure `maxAttempts: 3`, `backoff: [5, 30]`, `startToCloseTimeout: 10` y `scheduleToCloseTimeout: 90` para tres intentos remotos con demoras finitas y un tiempo total original. La política equivalente de Python es `ActivityRetryPolicy(max_attempts=3, backoff_seconds=[5, 30])`, con opciones separadas de timeout por intento y total. Devolver correctamente «todavía no está listo» no es un fallo ni activa un reintento. Consulte [fallos y recuperación](../failures-and-recovery.md).

Los reintentos encajan cuando la falta de disponibilidad es un resultado explícitamente reintentable y el workflow no necesita ejecutarse entre consultas. No convierta reintentos ilimitados en un bucle de sondeo invisible. La paridad de las demoras en actividades locales se sigue en [la incidencia del contrato de reintentos](https://github.com/durable-workflow/.github/issues/219); estos ejemplos usan actividades remotas.

## Inicie nuevas ejecuciones de forma deliberada {#roll-over-deliberately}

Esta demostración ejecutable consulta una vez por ejecución, espera y pasa un contador finito de consultas restantes a la siguiente ejecución. Sustituya únicamente la consulta de estado sintética de la actividad por una solicitud real acotada. El ejemplo devuelve el último estado incluso al alcanzar el límite de consultas; el llamador debe comprobar `ready`.

### PHP integrado {#embedded-php}

```php
use Workflow\V2\Activity;
use Workflow\V2\Support\ActivityOptions;
use Workflow\V2\Workflow;
use function Workflow\V2\activity;
use function Workflow\V2\timer;
use function Workflow\V2\continueAsNew;

final class CheckDemoStatus extends Activity
{
    public function handle(int $remaining): array
    {
        return ['ready' => $remaining <= 1];
    }
}

final class PollDemo extends Workflow
{
    public function handle(int $remaining = 2, int $intervalSeconds = 30): array
    {
        $status = activity(CheckDemoStatus::class, new ActivityOptions(
            maxAttempts: 1, startToCloseTimeout: 10, scheduleToCloseTimeout: 15,
        ), $remaining);
        if ($status['ready'] || $remaining <= 1) {
            return $status;
        }
        timer($intervalSeconds);
        return continueAsNew($remaining - 1, $intervalSeconds);
    }
}
```

Inícielo mediante la [configuración habitual del workflow integrado](../installation.md), con timeouts finitos por ejecución y para la ejecución lógica completa.

### Worker Python en modo servicio {#python-service-worker}

```python
from durable_workflow import activity, workflow
from durable_workflow.workflow import ActivityRetryPolicy

@activity.defn(name="poll-demo.status")
async def check_status(remaining):
    return {"ready": remaining <= 1}

@workflow.defn(name="poll-demo")
class PollDemo:
    def run(self, ctx, remaining=2, interval_seconds=30):
        result = yield ctx.schedule_activity(
            "poll-demo.status", [remaining],
            retry_policy=ActivityRetryPolicy(max_attempts=1, backoff_seconds=[1]),
            start_to_close_timeout=10, schedule_to_close_timeout=15,
        )
        if result["ready"] or remaining <= 1:
            return result
        yield ctx.sleep(interval_seconds)
        return ctx.continue_as_new(remaining - 1, interval_seconds)
```

Registre `PollDemo` y `check_status` en el mismo [worker Python](./python.md), y luego inicie con los argumentos `[2, 30]` y timeouts finitos de ejecución lógica y de ejecución individual. Observe la instancia actual del workflow para seguir a su sucesora; un handle asociado a una ejecución concreta sigue seleccionando la ejecución original.

Ambos ejemplos se ejecutaron en las versiones publicadas Server **2.9.7 / Core 2.7.2**, con Python **2.6.1** instalado normalmente y la entrada de prueba `[2, 1]`. Ambos completaron dos consultas reales en dos ejecuciones. Continue-as-new reinicia el historial de la ejecución, añade costes de ejecución y enlace, y conserva el plazo original de la ejecución lógica. No proporciona una duración ilimitada.

Use esperas duraderas relativas. El avance del reloj de Python y las lecturas del presupuesto de historial estables durante la reproducción siguen siendo trabajos separados sobre [reloj](https://github.com/durable-workflow/.github/issues/215) y [presupuesto](https://github.com/durable-workflow/workflow/issues/859). Esta receta no toma decisiones mediante `ctx.now()` ni una longitud de historial recalculada. No considere `DW_MAX_HISTORY_EVENTS` una transición automática aplicada obligatoriamente: [Server #504](https://github.com/durable-workflow/server/issues/504) sigue esa carencia.

## Interrumpa y reconcilie {#interrupt-and-reconcile}

Para detenerse mediante una señal, [seleccione entre la señal y la espera pendiente](../features/concurrency.md) y cancele explícitamente la operación perdedora según su política de cancelación admitida. La selección por sí sola no cancela las demás operaciones. Pedir que una actividad se detenga no demuestra que nunca haya ocurrido un efecto externo: use claves de idempotencia y reconcilie antes de compensar o reiniciar. La cancelación inmediata, la terminación y el timeout estricto del workflow no ejecutan su código de compensación; use la [cancelación cooperativa](./cancellation.md) admitida cuando deba ejecutarse la limpieza.

## Inspeccione el historial real {#inspect-the-actual-history}

Las mediciones anteriores en modo servicio de Python registraron:

| Caso completado | Eventos del historial canónico |
| --- | --- |
| Una actividad remota que tiene éxito en el tercer intento | 10 en total: 1 programación, 3 inicios, 2 programaciones de reintento, 1 finalización y 3 eventos del ciclo de vida de la ejecución |
| Una actividad con dos heartbeats aceptados | 8 en total: 3 eventos de actividad, 2 de heartbeat y 3 del ciclo de vida |
| Dos consultas correctas separadas por un temporizador | 11 en total: 6 eventos de actividad, 2 de temporizador y 3 del ciclo de vida |

El ejemplo de transición registró **8 + 5** eventos entre las ejecuciones Python y **8 + 6** entre las PHP; PHP también registra `StartAccepted` para la sucesora. Son costes medidos de operaciones y ejecuciones, no totales universales de eventos, unidades de facturación ni resultados de rendimiento. Otras órdenes, fallos, cancelaciones y metadatos de admisión del runtime pueden añadir eventos. Inspeccione el historial de cada ejecución, la política de intentos conservada y los plazos originales en lugar de estimar el crecimiento solo por las iteraciones. Las observaciones exactas y los registros fallidos de las pruebas se conservan en [el comprobante de cualificación](https://github.com/durable-workflow/durable-workflow.github.io/issues/283#issuecomment-6288504564).
