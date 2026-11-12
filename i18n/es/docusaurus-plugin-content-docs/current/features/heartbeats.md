---
sidebar_position: 8
---

# Latidos {#heartbeats}

Los latidos permiten que una actividad prolongada comunique que su intento actual sigue vivo.

`heartbeat()` actualiza la fila de `activity_attempts` reclamada en ese momento con la hora del heartbeat y el progreso más reciente, refleja el último heartbeat en la ejecución de actividad activa y renueva el lease de esa tarea de actividad. Escribe un evento de historial `ActivityHeartbeatRecorded` solo cuando el progreso cambió, como mucho una vez por intervalo de registro (ver más abajo). El detalle de la ejecución seleccionada en Waterline y las exportaciones de historial leen el último heartbeat y el progreso de la fila del intento, y reconstruyen el estado del intento, el id de tarea, el worker, el lease, la cancelación y las marcas de cierre a partir del historial tipado `ActivityStarted`, `ActivityHeartbeatRecorded`, `ActivityRetryScheduled`, `ActivityCompleted`, `ActivityFailed` y `ActivityCancelled`, con las filas de intento como respaldo para datos antiguos.

```php
use Workflow\V2\Activity;

final class PollRemoteJob extends Activity
{
    public function handle(string $jobId): array
    {
        do {
            sleep(1);

            $status = RemoteService::status($jobId);

            $this->heartbeat([
                'message' => 'Polling remote job',
                'current' => $status['completed'] ?? null,
                'total' => $status['total'] ?? null,
                'unit' => 'steps',
                'details' => [
                    'remote_state' => $status['state'] ?? 'running',
                ],
            ]);
        } while ($status['state'] === 'running');

        return $status;
    }
}
```

Dentro de la actividad, `activityId()`, `attemptId()` y `attemptCount()` exponen la identidad de ejecución duradera y del intento actual para correlacionar trabajo externo. Usa `activityId()` como clave predeterminada de idempotencia remota y `attemptId()` solo si el sistema necesita distinguir intentos de la misma ejecución duradera.

Los workers políglotas pueden enviar latidos mediante el puente HTTP sin construir la clase PHP de actividad. Consulta los endpoints en el [protocolo de workers](/docs/polyglot/worker-protocol).

Una llamada bloqueante puede necesitar un auxiliar dedicado a enviar heartbeats.
Este indica que el proceso sigue vivo, no que avance. Pon un plazo finito a la
llamada y detén el auxiliar cuando termine o pierda la autoridad. En Python,
sigue la [receta de captura de contexto y cancelación](../polyglot/python.md#heartbeat-helper-thread).

## Cadencia y confirmaciones {#heartbeat-cadence-and-receipts}

Para una actividad encolada, el primer plazo de heartbeat empieza cuando el entorno de ejecución la reclama, antes de entregar la tarea y ejecutar código de usuario. Un heartbeat registrado fija el siguiente plazo en su marca de tiempo del entorno más `heartbeatTimeout`. Ni enviar la petición ni recibir su respuesta abre otra ventana completa. Consulte [Tiempo de espera de heartbeat](./timeouts.md#heartbeat-timeout).

Elija una cadencia con suficiente margen dentro de esa ventana y limite el trabajo entre llamadas. Con un tiempo de espera de 15 segundos, un objetivo de unos cinco segundos puede servir de punto de partida solo si la entrega, cada lote o llamada de E/S, las pausas de ejecución, la latencia de red y los reintentos de transporte caben en el presupuesto restante. Mida esos retrasos y deje margen. Es una orientación para planificar, no un intervalo seguro garantizado. Un intento vencido o reemplazado no recupera su concesión enviando un heartbeat tardío.

No hay un calendario automático de heartbeats de progreso ni una garantía de agrupación en el SDK. Los heartbeats de registro del worker y las comprobaciones de propiedad no publican progreso de actividad. Cada heartbeat aceptado renueva el lease y desplaza el plazo de heartbeat. Solo se escribe un evento de historial cuando el progreso difiere del último registrado y ha pasado al menos el mayor entre el tiempo límite de heartbeat y 60 segundos desde ese evento. Un heartbeat sin progreso solo demuestra actividad y no escribe historial. El progreso retenido por el intervalo se registra una vez al cerrarse el intento. Un heartbeat por segundo durante una hora con el mismo progreso escribe un evento. Los historiales anteriores conservan los eventos por heartbeat que ya registraron.

En modo embebido, `Activity::heartbeat()` devuelve `void`. El progreso inválido y los fallos de almacenamiento pueden lanzar excepciones. Un retorno normal no es un objeto de confirmación: un intento cerrado, vencido o reemplazado puede volver sin registrar otro heartbeat. En modo servicio, el tratamiento de errores difiere entre las llamadas directas al cliente y los workers supervisados. Consulte las guías de [PHP](../polyglot/php.md#activity-heartbeats), [Python](../polyglot/python.md#activity-heartbeat-requests) y [Rust](../polyglot/rust.md#activity-heartbeats).

El progreso de heartbeat no confirma atómicamente un lote externo ni delimita sus efectos. Un punto de control de aplicación seguro ante reintentos necesita su propia confirmación duradera, una clave lógica estable de trabajo e idempotencia o control externo de titularidad. El acceso de un intento de reemplazo a puntos de control confirmados se sigue por separado en [la función de puntos de control](https://github.com/durable-workflow/.github/issues/218).

## Instantáneas de progreso {#progress-snapshots}

`Activity::heartbeat()` y `ActivityTaskBridge::heartbeat()` aceptan una instantánea opcional de progreso con límites:

- `message`
  - cadena no vacía de hasta 280 caracteres
- `current`
  - entero o decimal no negativo
- `total`
  - entero o decimal no negativo
- `unit`
  - cadena no vacía de hasta 64 caracteres
- `details`
  - mapa plano de hasta 20 entradas `key => scalar|null`, con claves que coincidan con `[A-Za-z0-9_.:-]{1,64}`

Usa esa carga para mostrar progreso al operador, como «Descargando fragmento» o `2 / 5 fragmentos`, no para registros extensos ni estado anidado arbitrario. El detalle de ejecución seleccionada, la entrada de latido en la cronología y la exportación lo muestran como `last_heartbeat_progress` en la actividad y el intento actual. El evento tipado original `ActivityHeartbeatRecorded` conserva la misma carga normalizada bajo `progress`.

## Seguimiento duradero de intentos {#durable-attempt-tracking}

El runtime guarda una fila durable propia por cada intento de actividad, con número de intento, estado, hora de inicio, último heartbeat y progreso, vencimiento del lease y hora de cierre. También registra historial tipado del intento cuando las actividades empiezan, envían heartbeat, se reintentan, terminan, fallan o se cancelan, de modo que el detalle histórico sobrevive aunque las filas mutables de intento o tarea cambien después. Un heartbeat registrado añade un punto compacto `ActivityHeartbeatRecorded` en la línea de tiempo con el id de ejecución de actividad, el id del intento, la hora del heartbeat, el vencimiento del lease, el progreso y una instantánea de la actividad en ese momento. Si un comando cancel o terminate cierra la ejecución, el puente registra `ActivityCancelled` cuando el worker observa la detención y rechaza como obsoletos la finalización o el fallo posteriores, en lugar de convertir la cancelación en un resultado.

Los heartbeats son señales operativas de actividad. Envía heartbeats tan a menudo como lo exijan tus tiempos límite y tu recuperación. Los heartbeats que solo indican actividad no añaden historial, y los cambios de progreso se registran como mucho una vez por intervalo. Mantén la instantánea opcional de progreso lo bastante compacta para el diagnóstico de operadores, en lugar de tratarla como un flujo de eventos.
