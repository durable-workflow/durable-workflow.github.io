---
sidebar_position: 19
title: Tiempos de espera
description: Límites de tiempo de workflows y actividades, sus resultados y la limpieza antes del cierre.
---

# Tiempos de espera {#timeouts}

Los tiempos de espera del workflow permiten limitar cuánto tiempo puede ejecutarse. Hay dos alcances:

- **Tiempo de espera de la ejecución completa**: limita el tiempo real total de todas las ejecuciones de una instancia de workflow, incluidas las transiciones continue-as-new. El plazo se calcula una vez al inicio y se conserva sin cambios.
- **Tiempo de espera de cada ejecución**: limita una ejecución individual. El plazo se calcula de nuevo al comenzar cada ejecución, también tras continue-as-new.

Ambos son opcionales y pueden combinarse.

## Configuración {#configuration}

Los tiempos de espera se configuran mediante `StartOptions` al iniciar un workflow:

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class, 'order-123');

$workflow->start(
    $orderId,
    StartOptions::rejectDuplicate()
        ->withExecutionTimeout(7200)   // 2 hours across all runs
        ->withRunTimeout(3600),        // 1 hour per run
);
```

### Tiempo de espera de la ejecución completa {#execution-timeout}

El tiempo de espera de la ejecución completa abarca toda la instancia del workflow. Si utiliza continue-as-new, el plazo no cambia entre las ejecuciones de la cadena.

```php
StartOptions::rejectDuplicate()->withExecutionTimeout(86400); // 24 hours
```

El valor se almacena en el modelo `WorkflowInstance` y el plazo calculado queda fijado en cada `WorkflowRun`.

### Tiempo de espera de cada ejecución {#run-timeout}

El tiempo de espera de cada ejecución se aplica a una sola ejecución. Tras continue-as-new, la nueva ejecución recibe un plazo calculado a partir del momento actual más el tiempo de espera configurado.

```php
StartOptions::rejectDuplicate()->withRunTimeout(1800); // 30 minutes per run
```

### Validación {#validation}

Los valores deben ser de al menos 1 segundo. Pasar cero o un valor negativo lanza `LogicException`:

```php
// Throws LogicException: "Workflow v2 execution timeout must be at least 1 second."
StartOptions::rejectDuplicate()->withExecutionTimeout(0);
```

### Plano de control {#control-plane}

También puede establecer los tiempos de espera al iniciar un workflow mediante el plano de control:

```php
$controlPlane->start('my-app.order-workflow', 'order-123', [
    'execution_timeout_seconds' => 7200,
    'run_timeout_seconds' => 3600,
]);
```

La respuesta `describe` incluye los tiempos de espera y sus plazos:

```php
$description = $controlPlane->describe('order-123');

$description['execution_timeout_seconds']; // 7200
$description['run']['run_timeout_seconds']; // 3600
$description['run']['execution_deadline_at']; // ISO 8601 timestamp
$description['run']['run_deadline_at'];       // ISO 8601 timestamp
```

### Waterline {#waterline}

Cuando hay tiempos de espera configurados, la vista de detalle de la ejecución en Waterline muestra sus duraciones y plazos calculados.

### Historial {#history}

Los datos del evento de historial `WorkflowStarted` incluyen los tiempos de espera y los plazos cuando están configurados:

```json
{
    "execution_timeout_seconds": 7200,
    "run_timeout_seconds": 3600,
    "execution_deadline_at": "2026-04-12T14:00:00+00:00",
    "run_deadline_at": "2026-04-12T13:00:00+00:00"
}
```

### Continue-as-new {#continue-as-new}

Cuando un workflow usa continue-as-new:

- El **plazo de la ejecución completa** se conserva sin cambios desde la ejecución anterior.
- El **tiempo de espera de cada ejecución** se conserva, pero el **plazo de esa ejecución** se calcula de nuevo desde el momento actual.

Por tanto, el tiempo de espera de la ejecución completa siempre se mide desde el inicio original, mientras que cada ejecución nueva recibe su propia ventana.

## Aplicación de los límites {#enforcement}

Los tiempos de espera del workflow se aplican en dos puntos:

1. **Al iniciar una tarea de workflow**: cada tarea comprueba `deadlineExpired()` antes de ejecutar el workflow. Si el plazo ha vencido, la ejecución se cierra inmediatamente por tiempo de espera.
2. **Mediante TaskWatchdog**: el watchdog busca ejecuciones no terminales con el plazo completo o individual vencido y sin una tarea de workflow abierta. Crea y despacha una tarea de plazo vencido, que aplica el cierre en la siguiente ejecución de la tarea.

Cuando vence un tiempo de espera, el motor:

- Cancela todas las tareas abiertas de actividad, temporizador y workflow, salvo la actual
- Cancela todas las ejecuciones de actividad abiertas y registra eventos `ActivityCancelled`
- Cancela todos los temporizadores pendientes y registra eventos `TimerCancelled`
- Registra un `WorkflowFailure` con `failure_category = timeout` y `WorkflowTimeoutException`
- Registra el evento terminal `WorkflowTimedOut` con `timeout_kind` igual a `execution_timeout` o `run_timeout`
- Aplica la política de cierre del padre a los workflows hijos abiertos
- Notifica a los workflows padres si esta era una ejecución hija

La fila de error almacena `Workflow\V2\Exceptions\WorkflowTimeoutException` como clase de excepción, junto con `timeout_kind` y la marca de tiempo del plazo para su inspección programática.

### Resultado del tiempo de espera y limpieza {#timeout-outcome-and-cleanup}

Un plazo de workflow cierra la ejecución con estado `failed` y `closed_reason = timed_out`. El evento terminal es `WorkflowTimedOut`. El runtime registra `WorkflowTimeoutException` como datos del error. **No** lanza esa excepción dentro del cuerpo del workflow ni reanuda su código para limpiar. Los bloques `catch` y `finally` y las compensaciones de saga registradas no se ejecutan cuando el motor aplica este plazo.

Cancelar la ejecución duradera de una actividad no revierte un efecto externo ni demuestra que su callback se haya detenido. Use operaciones idempotentes y conciliación propia de la aplicación para los efectos que ya podrían haberse confirmado.

Si necesita limpiar tras un plazo de la aplicación, use un temporizador duradero más corto o una espera con tiempo límite que permita ejecutar [compensación antes del cierre](./sagas.md#deadline-driven-compensation). Reserve tiempo para reintentos de actividad, planificación de workers y limpieza antes de cualquiera de los plazos del motor. El tiempo de espera del motor sigue siendo el límite final. Un worker retrasado puede alcanzarlo antes de terminar la compensación.

Las órdenes inmediatas `cancel()` y `terminate()` también cierran la ejecución sin dar tiempo al código de limpieza. La operación cooperativa independiente `requestCancellation()` puede entregar una limpieza acotada a un worker compatible mientras la ejecución siga activa. Un tiempo de espera de workflow no se convierte automáticamente en una solicitud de cancelación cooperativa, y un escudo de cancelación no amplía el plazo completo o individual. Consulte [Cancelar y terminar](./cancel-and-terminate.md) y [Cancelación cooperativa](../polyglot/cancellation.md).

## Lease de una tarea de workflow {#workflow-task-lease}

Una tarea de workflow es un turno de un worker que reproduce el historial confirmado y genera comandos duraderos. No es todo el workflow. Esperar un temporizador duradero, una actividad en cola o una señal duradera no retiene una misma tarea durante toda la espera; una tarea posterior reanuda la ejecución.

| Despliegue | Segundos predeterminados | Ajuste |
| --- | --- | --- |
| Laravel embebido | `300` | `DW_V2_WORKFLOW_TASK_LEASE_SECONDS` |
| Server | `60` | `DW_WORKFLOW_TASK_TIMEOUT` |

El ajuste embebido corresponde a `workflows.v2.workflow_task_lease_seconds`. Server asigna su propio ajuste a esa clave del paquete al arrancar, por lo que debes usar el ajuste de Server en Server. Es configuración del runtime, no una opción de `StartOptions` ni un timeout de actividad por inicio. Consulta [Publicar la configuración](../configuration/publishing-config.md#workflow-task-lease-v2) y la [referencia de configuración de Server](../polyglot/server-config-reference.md#worker-protocol-and-query-transport).

### Heartbeats y ejecución {#workflow-task-heartbeats}

Los workers en modo servicio usan heartbeats de tarea para renovar la reserva de una tarea de workflow en curso. Server valida la tarea, el intento y el propietario de la lease. Una renovación confirmada usa la duración efectiva de la lease, con los límites de limpieza por cancelación que correspondan. No cambia los plazos originales de ejecución/run ni los timeouts de actividades. Un heartbeat de registro del worker solo comunica la actividad de la flota; un heartbeat de actividad informa del progreso de esa actividad. Ninguno sustituye la renovación de una tarea de workflow.

El código síncrono de un workflow embebido no puede renovar periódicamente mientras está bloqueado. Mantén el código determinista y breve; lleva el trabajo largo de E/S o CPU a actividades. La lease no es un límite estricto de ejecución del proceso o la CPU.

### Vencimiento de la lease {#workflow-task-lease-expiry}

Una reserva vencida y sin terminar pasa a ser recuperable. Matching/watchdog o la reparación elimina la reserva vencida y vuelve a despachar el trabajo para que un worker compatible reproduzca el historial confirmado. La recuperación necesita procesos de recuperación activos, una base de datos disponible y un worker elegible. El vencimiento no mata el proceso anterior ni garantiza una nueva entrega inmediata. En Server, una reserva vencida o reemplazada no puede enviar comandos nuevos; una renovación rechazada debe tratarse como pérdida de autoridad.

La reparación no reabre una ejecución cerrada, no concede reintentos de negocio adicionales ni reinicia los plazos originales. En cambio, `startToCloseTimeout` limita un intento de actividad según su política de reintentos registrada. Los timeouts de run y ejecución limitan la vida del workflow; renovar o reproducir una tarea de workflow no los prolonga.

## Tiempos de espera de las actividades {#activity-timeouts}

Los tiempos de espera de las actividades permiten limitar la duración de cada actividad. Hay cuatro alcances:

- **Schedule-to-start**: limita el tiempo desde la programación hasta la primera reclamación del worker. Se aplica mientras la actividad está `Pending`.
- **Start-to-close**: limita el tiempo desde que un worker reclama la actividad hasta su finalización. Se reinicia en cada intento.
- **Schedule-to-close**: limita el tiempo real total desde la programación hasta el fin, incluidos todos los intentos. Siempre es terminal: reintentar no ayuda si el plazo total ha vencido.
- **Heartbeat**: limita el tiempo entre heartbeats. En actividades largas que llaman a `$this->heartbeat()`, el motor exige un heartbeat dentro del intervalo configurado o considera que la actividad no responde.

Todos son opcionales y pueden combinarse. Configúrelos con `ActivityOptions` al llamar a una actividad:

```php
use function Workflow\V2\activity;
use Workflow\V2\Support\ActivityOptions;

$result = activity(
    LongRunningActivity::class,
    new ActivityOptions(
        scheduleToStartTimeout: 30,     // must be claimed within 30s
        startToCloseTimeout: 300,       // each attempt has 5 minutes
        scheduleToCloseTimeout: 600,    // total 10 minutes across all retries
        heartbeatTimeout: 15,           // must heartbeat every 15 seconds
        maxAttempts: 3,
    ),
    $input,
);
```

### Tiempo de espera de programación a inicio {#schedule-to-start-timeout}

El plazo se calcula al programar la actividad. Si ningún worker la reclama antes, `TaskWatchdog` aplica el tiempo de espera. Si quedan intentos, se programa una nueva tarea de actividad con la espera registrada y el plazo schedule-to-start se recalcula desde el momento en que el nuevo intento esté disponible. Cada intento recibe una ventana nueva. Si no se configuró `scheduleToStartTimeout`, el plazo se borra al reintentar. Si se agotan los intentos, se registra el evento terminal `ActivityTimedOut` y se despierta el workflow.

### Tiempo de espera de inicio a cierre {#start-to-close-timeout}

El plazo se calcula cuando un worker reclama la tarea de actividad. Cada intento recibe un nuevo plazo start-to-close. Si la actividad no termina a tiempo, el intento actual se cierra. Si quedan intentos, la ejecución vuelve a `Pending` con un plazo schedule-to-start nuevo, si está configurado, para evitar que el reintento venza de inmediato. Si se agotan los intentos, se registra un tiempo de espera terminal.

### Tiempo de espera de programación a cierre {#schedule-to-close-timeout}

El plazo se calcula una vez al programar y nunca se reinicia. Al vencer, la actividad falla de forma terminal de inmediato, aunque queden intentos, porque ya ha pasado todo el tiempo real permitido. Esto limita el coste total de una actividad inestable que, de otro modo, podría reintentarse indefinidamente dentro de los límites por intento.

### Tiempo de espera de heartbeat {#heartbeat-timeout}

El plazo inicial se calcula cuando un worker reclama la tarea de actividad. Cada llamada correcta a `$this->heartbeat()` extiende el plazo por el intervalo configurado. Si la actividad no llama a `heartbeat()` antes del vencimiento, el motor considera que el worker no responde. Si quedan intentos, se programa uno nuevo con un plazo schedule-to-start restablecido, si está configurado. En caso contrario, se registra un tiempo de espera terminal.

```php
use Workflow\V2\Activity;

class LongRunningActivity extends Activity
{
    public function handle($input)
    {
        foreach ($items as $item) {
            $this->heartbeat(['processed' => $count]);
            // ... process item ...
        }
    }
}
```

### Aplicación de los límites {#enforcement-1}

Los tiempos de espera de las actividades se aplican mediante `TaskWatchdog` en cada pasada del bucle del worker. Busca ejecuciones cuyas columnas de plazo hayan vencido y delega en `ActivityTimeoutEnforcer`. Cada aplicación registra:

- Un evento terminal `ActivityTimedOut` con `timeout_kind` igual a `schedule_to_start`, `start_to_close`, `schedule_to_close` o `heartbeat`
- Una fila `WorkflowFailure` con `failure_category = timeout` y `propagation_kind = timeout`
- Una tarea de reanudación para despertar al workflow padre y que pueda observar el error

Waterline muestra en el detalle de la actividad la política de reintentos con todos los tiempos de espera configurados. La cronología indica el tipo de tiempo de espera en el mensaje del evento correspondiente.

### Qué falta por implementar {#what-is-not-yet-covered}

Las siguientes funciones están previstas, pero aún no se han implementado:

- Políticas de reintento a nivel de workflow

### Límites estructurales {#structural-limits}

El motor aplica errores tipados de límites estructurales para el tamaño de cargas, la cantidad de tareas pendientes de fan-out y los límites de metadatos. Consulte [Límites estructurales](../constraints/structural-limits.md) para conocer el contrato, la configuración y la clasificación de errores.