---
title: Sondeo del estado externo
description: Elegir sondeos acotados o señales de callback, esperar de forma duradera en el workflow y contabilizar el coste del historial.
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
| Enviar el trabajo y regresar; después recibir una señal de callback | Libera el slot de actividad tras el envío; el workflow espera de forma duradera | El envío, la admisión y aplicación de señales y las esperas con plazo añaden historial. Requiere correlación autenticada y gestión de duplicados en la aplicación. |

Use consultas breves que puedan repetirse con seguridad. Un callback bloqueado en una solicitud externa no se vuelve receptivo solo porque su workflow tenga un temporizador o una política de cancelación.

## Completar mediante callback y señal {#callback-and-signal-completion}

Si el sistema externo puede notificarle, envíe el trabajo desde una actividad corta y devuelva el acuse de recibo. Deje que el **workflow** espere una señal declarada o una condición reconstruida durante el replay, con un plazo finito. No mantenga abierta una actividad, respuesta HTTP o conexión SSE hasta que termine el trabajo.

Elija el identificador de instancia y guarde la relación entre la operación externa autenticada, el namespace, el **identificador público de instancia del workflow** y el nombre de señal declarado antes de iniciar el workflow. La actividad puede enviar el trabajo en cuanto se confirme el inicio. Un identificador de run solo identifica ese run; no es una dirección estable para callbacks tras continue-as-new. Autentique el callback y compruebe la relación guardada antes de reenviarlo; no confíe en campos de identidad o enrutamiento de solicitudes arbitrarias.

### Callback PHP embebido {#embedded-php-callback}

Configure `services.jobs.url` para el proveedor y `services.jobs.callback_url` para el adaptador autenticado de la aplicación. Adapte la solicitud `/jobs` a la API del proveedor: debe confirmar rápidamente el envío y devolver `job_id`. Implemente su autenticación específica y limite la duración de la solicitud. La clave de operación solo sirve para deduplicar si el proveedor realmente la respeta.

```php
use Illuminate\Support\Facades\Http;
use Workflow\V2\Activity;
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Support\ActivityOptions;
use Workflow\V2\Workflow;
use function Workflow\V2\activity;
use function Workflow\V2\await;

#[Type('external.submit')]
final class SubmitExternalJob extends Activity
{
    public function handle(string $workflowId, string $operationId): array
    {
        return Http::connectTimeout(2)->timeout(5)
            ->withHeaders(['Idempotency-Key' => $operationId])
            ->post(config('services.jobs.url').'/jobs', [
                'workflow_id' => $workflowId,
                'operation_id' => $operationId,
                'signal' => 'job-completed',
                'callback_url' => config('services.jobs.callback_url'),
            ])->throw()->json();
    }
}

#[Type('external-completion')]
#[Signal('job-completed', [
    ['name' => 'operationId', 'type' => 'string'],
    ['name' => 'result', 'type' => 'array'],
])]
final class ExternalCompletion extends Workflow
{
    public function handle(string $operationId): array
    {
        $job = activity(SubmitExternalJob::class, new ActivityOptions(
            maxAttempts: 1, startToCloseTimeout: 10, scheduleToCloseTimeout: 15,
        ), $this->workflowId(), $operationId);

        $received = await('job-completed', timeout: 10);
        if ($received === null) {
            return ['status' => 'timed_out', 'job_id' => $job['job_id']];
        }
        if ($received[0] !== $operationId) {
            return ['status' => 'unexpected_operation'];
        }
        return ['status' => 'completed', 'result' => $received[1]];
    }
}
```

Inicie con un identificador de instancia elegido por el llamante y límites finitos para el run y la ejecución completa. Registre `ExternalCompletion` con [webhooks autenticados](../features/webhooks.md); el adaptador de callback puede reenviar la entrada validada a la ruta de señal dirigida a la instancia:

```bash
curl -fsS -X POST "$APP_URL/webhooks/instances/external-job-42/signals/job-completed" \
  -H "Authorization: $WEBHOOK_TOKEN" -H 'Content-Type: application/json' \
  -d '{"arguments":["op-42",{"value":42}]}'
```

Este es el formato `arguments` del webhook embebido, no el sobre de carga útil del Server. El proveedor debe llamar al adaptador autenticado de su aplicación, sin recibir credenciales de operador ni de worker del Server.

### Callback y condición en Python {#python-callback-and-condition}

La actividad siguiente solo realiza el envío acotado. Configure `JOB_API_URL`, `JOB_CALLBACK_URL` y la autenticación del proveedor en su entorno. Registre ambas definiciones en el [worker Python](./python.md). Pase explícitamente el identificador de instancia que conoce el llamante; el ejemplo no inventa un acceso al identificador desde el contexto del workflow.

```python
import os
import httpx
from durable_workflow import activity, workflow
from durable_workflow.workflow import ActivityRetryPolicy

@activity.defn(name="external.submit")
async def submit_external_job(workflow_id, operation_id):
    async with httpx.AsyncClient(timeout=5.0) as provider:
        response = await provider.post(
            os.environ["JOB_API_URL"] + "/jobs",
            headers={"Idempotency-Key": operation_id},
            json={"workflow_id": workflow_id, "operation_id": operation_id,
                  "signal": "job-completed",
                  "callback_url": os.environ["JOB_CALLBACK_URL"]},
        )
        response.raise_for_status()
        return response.json()

@workflow.defn(name="external-completion")
class ExternalCompletion:
    def __init__(self):
        self.results = {}

    @workflow.signal("job-completed")
    def completed(self, operation_id: str, result: dict):
        self.results.setdefault(operation_id, result)

    def run(self, ctx, workflow_id, operation_id):
        job = yield ctx.schedule_activity(
            "external.submit", [workflow_id, operation_id],
            retry_policy=ActivityRetryPolicy(max_attempts=1, backoff_seconds=[1]),
            start_to_close_timeout=10, schedule_to_close_timeout=15,
        )
        ready = yield ctx.wait_condition(
            lambda: operation_id in self.results,
            key="external.completed", timeout=10,
        )
        if not ready:
            return {"status": "timed_out", "job_id": job["job_id"]}
        return {"status": "completed", "result": self.results[operation_id]}
```

Elija el identificador de instancia y persista la relación namespace/instancia/señal de la operación **antes de llamar a start**. La actividad puede comenzar en cuanto se confirme el inicio. Después, la aplicación inicia esa instancia con presupuestos finitos:

```python
handle = await client.start_workflow(
    workflow_type="external-completion", task_queue="external-jobs",
    workflow_id="external-job-42", input=["external-job-42", "op-42"],
    execution_timeout_seconds=60, run_timeout_seconds=30,
)
```

Tras autenticar al proveedor y resolver la relación guardada de su operación, el adaptador usa un Client en el **mismo namespace**:

```python
await client.signal_workflow(
    "external-job-42", "job-completed", args=["op-42", {"value": 42}],
)
```

Esto llama a `POST /api/workflows/{workflowId}/signal/{signalName}` del Server con el sobre Avro normal del SDK. Una llamada exitosa confirma la admisión, no que el código del workflow haya procesado el callback. Si importa la confirmación, consulte el resultado del workflow o el estado retenido de la señal.

### Callbacks tempranos, continuaciones y callbacks tardíos {#early-continued-and-late-callbacks}

- Declare la señal antes de iniciar el run. Un callback que llega antes de su espera se conserva y consume en orden duradero; Python reconstruye el estado del manejador durante el replay. Un registro posterior no puede reescribir las declaraciones de un run antiguo.
- Los callbacks dirigidos a la instancia siguen continue-as-new; las llamadas dirigidas explícitamente a un run siguen limitadas a ese run. En runtimes compatibles Core 2.7.0+, las señales de instancia recibidas y aptas conservan su identidad y orden al transferirse. El estado de callbacks **ya aplicados** debe pasarse en la entrada de continuación si la aplicación aún lo necesita.
- Un callback tras el cierre terminal se rechaza explícitamente. Con el Server publicado, Python expone `SignalFailed.reason == "run_not_active"` y estado409. Una señal admitida pero no aplicada puede conservar en cambio una disposición de rechazo por cierre; no se borra su recibo de admisión anterior. Consulte [admisión y cierre de señales](../features/signals.md#acceptance-and-closure).
- El plazo de espera no cancela el trabajo externo. Reconcilie su resultado o solicite su cancelación al proveedor mediante una actividad. Un resultado tardío puede requerir una decisión de recuperación de la aplicación; no inicie silenciosamente trabajo de sustitución.

### Entregas duplicadas y límites del streaming {#duplicate-delivery-and-streaming-limits}

Los proveedores reintentan callbacks, y puede haber un error de red después de admitir la señal. Persista la clave de operación/evento y la intención exacta, deduplique tanto en la entrada del callback como en el procesamiento de negocio y conserve las entregas inciertas para reconciliarlas. El manejador Python conserva el primer resultado de cada operación en este run; no garantiza deduplicación entre runs ni admisión única. No marque un reenvío incierto como procesado solo porque envió la solicitud. [La incidencia compartida #216](https://github.com/durable-workflow/.github/issues/216) sigue cubriendo los reintentos seguros y la identidad retenida de admisión. Un encabezado de idempotencia o un único intento de actividad no garantiza por sí solo efectos externos únicos.

Inicie el workflow antes de que esta receta envíe el trabajo. En modo servicio, `start(use-existing)` seguido de `signal` son **dos operaciones**, con una carrera frente al cierre; la admisión atómica sigue en [la incidencia compartida #222](https://github.com/durable-workflow/.github/issues/222). El `signalWithStart` embebido es otra API atómica. La petición de debounce [Website #280](https://github.com/durable-workflow/durable-workflow.github.io/issues/280) fue sustituida por ese requisito de producto, no completada por esta receta.

Un socket HTTP/SSE mantenido dentro de una actividad no es duradero: perder el worker o proceso lo cierra, ocupa un slot de actividad y al reconectar puede repetir o perder eventos externos. El envío y los callbacks siguen añadiendo historial de actividad, señales y esperas; la ejecución no es gratuita ni ilimitada. Para **salida duradera del workflow**, use [Workflow Streams](./workflow-streams.md) y su contrato persistido de secuencia/cursor, en vez de tratar una conexión de transporte como almacenamiento.

El código PHP y Python se ejecutó con **Server 2.9.7 / Core 2.7.2** publicado y **SDK Python 2.6.1** instalado normalmente. Controles separados de PostgreSQL 17.11 cubrieron callbacks tempranos y durante la espera, rechazo tardío y continue-as-new con callback mientras el worker Python estaba ausente, seguido de lectura en frío. Los controles embebidos usaron la ruta real del webhook. Esta evidencia corresponde a la receta, no a todas las bases, autenticación del proveedor, apagado ordenado ni runtime nativo. El [registro de calificación](https://github.com/durable-workflow/durable-workflow.github.io/issues/321#issuecomment-6292485315) conserva por separado los originales fallidos.

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
