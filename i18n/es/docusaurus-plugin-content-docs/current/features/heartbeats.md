---
sidebar_position: 8
---

# Latidos {#heartbeats}

Los latidos permiten que una actividad prolongada comunique que su intento actual sigue vivo.

`heartbeat()` actualiza la fila `activity_attempts` reclamada, refleja el último latido en la ejecución de actividad activa, renueva la lease de su tarea y añade un evento tipado `ActivityHeartbeatRecorded` para el intento. Los detalles de ejecución seleccionada y las exportaciones de Waterline reconstruyen primero el estado del intento, id de tarea, worker, latido, lease, cancelación y fechas de cierre desde el historial tipado `ActivityStarted`, `ActivityHeartbeatRecorded`, `ActivityRetryScheduled`, `ActivityCompleted`, `ActivityFailed` y `ActivityCancelled`. Las filas mutables de intentos se conservan como alternativa o complemento para datos antiguos.

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

El runtime registra una fila duradera propia por intento con número, estado, hora de inicio, último latido, caducidad de la lease y hora de cierre. También registra historial tipado al iniciar, emitir latidos, reintentar, completar, fallar o cancelar actividades, por lo que el detalle histórico sobrevive si las filas mutables de intentos o tareas cambian después. Cada latido aceptado del intento reclamado registra un punto compacto `ActivityHeartbeatRecorded` en la cronología con ids de ejecución e intento, fecha del latido, caducidad de la lease e instantánea de actividad correspondiente al evento. Si un comando de cancelación o terminación cierra la ejecución, el puente registra `ActivityCancelled` cuando el worker observa la parada y rechaza posteriores finalizaciones o fallos por obsoletos, sin convertir la cancelación en resultado.

Los latidos señalan la vitalidad operativa. Como cada latido aceptado es historial duradero, elige un intervalo acorde con tus tiempos de espera y necesidades de recuperación en lugar de usarlo como registro masivo de progreso. Mantén compacta la instantánea opcional para diagnóstico del operador, en vez de tratarla como un flujo de eventos.
