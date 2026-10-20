---
sidebar_position: 20
---

# Programaciones {#schedules}

Las programaciones inician ejecuciones recurrentes mediante expresiones cron. Cada una es una entidad duradera con nombre que el motor evalúa en cada tick para decidir si debe activar otra ejecución.

## Crear una programación {#creating-a-schedule}

Usa `ScheduleManager::create()` para definirla:

```php
use Workflow\V2\Enums\ScheduleOverlapPolicy;
use Workflow\V2\Support\ScheduleManager;

$schedule = ScheduleManager::create(
    scheduleId: 'daily-invoice-sync',
    workflowClass: InvoiceSyncWorkflow::class,
    cronExpression: '0 2 * * *',
    arguments: ['nightly'],
    timezone: 'America/New_York',
    overlapPolicy: ScheduleOverlapPolicy::Skip,
    labels: ['team' => 'billing'],
    memo: ['origin' => 'scheduled'],
    searchAttributes: ['tenant_id' => '42'],
    notes: 'Runs every night at 2 AM ET.',
    executionTimeoutSeconds: 120,
    runTimeoutSeconds: 60,
);
```

`scheduleId` es un identificador único elegido por el usuario. Cada activación recibe un ID determinista de instancia derivado de ese ID y de la marca de tiempo de activación.

### Parámetros {#parameters}

| Parámetro | Tipo | Predeterminado | Descripción |
|---|---|---|---|
| `scheduleId` | `string` | obligatorio | Identificador único de la programación |
| `workflowClass` | `string` | obligatorio | Clase de workflow que se iniciará |
| `cronExpression` | `string` | obligatorio | Expresión cron estándar de 5 campos |
| `arguments` | `array` | `[]` | Argumentos para `handle()` |
| `timezone` | `string` | `'UTC'` | Zona horaria para evaluar cron |
| `overlapPolicy` | `ScheduleOverlapPolicy` | `Skip` | Qué hacer si la ejecución anterior sigue activa |
| `labels` | `array` | `[]` | Etiquetas de visibilidad para cada ejecución activada |
| `memo` | `array` | `[]` | Campos memo para cada ejecución activada |
| `searchAttributes` | `array` | `[]` | Atributos de búsqueda para cada ejecución activada |
| `jitterSeconds` | `int` | `0` | Demora aleatoria máxima en segundos añadida a cada activación para mitigar picos simultáneos |
| `maxRuns` | `int\|null` | `null` | Máximo de ejecuciones antes de eliminar automáticamente la programación |
| `connection` | `string\|null` | `null` | Conexión de cola de las ejecuciones, que sustituye la predeterminada de la clase |
| `queue` | `string\|null` | `null` | Cola de las ejecuciones, que sustituye la predeterminada de la clase |
| `notes` | `string\|null` | `null` | Notas libres del operador |
| `namespace` | `string\|null` | `null` | Espacio de nombres, por defecto `workflows.v2.namespace` configurado o `'default'` |
| `executionTimeoutSeconds` | `int\|null` | `null` | Plazo de cada ejecución lógica del workflow, incluidos reintentos y continuación como nueva ejecución |
| `runTimeoutSeconds` | `int\|null` | `null` | Plazo de cada ejecución individual, reiniciado al continuar como nueva |

### Tiempos de espera del workflow {#workflow-timeouts}

El plazo global cubre una ejecución lógica entre reintentos y continuaciones. El plazo por ejecución limita cada generación y se reinicia al continuar como nueva. Ninguna ejecución puede superar el presupuesto global restante. Cada ocurrencia programada inicia un presupuesto nuevo, medido desde el inicio real del workflow, no desde la hora programada.

Ambas opciones aceptan enteros positivos de segundos o `null`. Si se omiten o son `null`, no fijan el límite correspondiente. Las activaciones manuales, ticks automáticos, inicios almacenados en búfer y recuperaciones históricas aplican los límites guardados mediante el iniciador PHP predeterminado.

En `createFromSpec()`, coloca los límites en la acción:

```php
$schedule = ScheduleManager::createFromSpec(
    scheduleId: 'hourly-invoice-sync',
    spec: ['intervals' => [['every' => 'PT1H']]],
    action: [
        'workflow_class' => InvoiceSyncWorkflow::class,
        'input' => ['hourly'],
        'execution_timeout_seconds' => 120,
        'run_timeout_seconds' => 60,
    ],
);
```

La creación y actualización de acciones validan los plazos PHP con las mismas reglas de `StartOptions` que los inicios directos. No hace falta un iniciador personalizado.

Cambia los límites de futuros inicios actualizando la acción:

```php
$schedule = ScheduleManager::update($schedule, action: [
    ...$schedule->action,
    'execution_timeout_seconds' => 240,
    'run_timeout_seconds' => 90,
]);
```

Se sustituye la acción completa: conserva su clase y entrada como se muestra. Las ejecuciones ya iniciadas mantienen sus plazos originales. Asigna `null` para eliminar un límite en los siguientes inicios.

## Programación avanzada {#advanced-scheduling}

Estas secciones cubren lo necesario cuando cron básico no basta: intervalos fijos, combinación de cron e intervalos y políticas de solapamiento. Puedes omitirlas si no las necesitas.

### Programaciones por intervalo {#interval-based-schedules}

Además de cron, se admiten intervalos con duraciones ISO 8601. Usa `ScheduleManager::createFromSpec()` para controlar toda la especificación:

```php
use Workflow\V2\Support\ScheduleManager;

$schedule = ScheduleManager::createFromSpec(
    scheduleId: 'health-check-30m',
    spec: [
        'intervals' => [
            ['every' => 'PT30M'],
        ],
    ],
    action: [
        'workflow_type' => 'health-check',
        'workflow_class' => HealthCheckWorkflow::class,
        'input' => ['region' => 'us-east-1'],
    ],
);
```

### Campos de especificación de intervalos {#interval-spec-fields}

| Campo | Tipo | Descripción |
|---|---|---|
| `every` | `string` | Duración ISO 8601, por ejemplo `PT30M` (30 minutos), `PT1H` (1 hora), `P1D` (1 día) |
| `offset` | `string\|null` | Desplazamiento de fase en duración ISO 8601; mueve el punto de alineación del intervalo |

El desplazamiento controla en qué punto del ciclo se activa. Un intervalo horario con 5 minutos de desplazamiento se activa a `:05`, `:05+1h`, etc.:

```php
$schedule = ScheduleManager::createFromSpec(
    scheduleId: 'offset-hourly',
    spec: [
        'intervals' => [
            ['every' => 'PT1H', 'offset' => 'PT5M'],
        ],
    ],
    action: [
        'workflow_type' => 'sync-workflow',
        'workflow_class' => SyncWorkflow::class,
        'input' => [],
    ],
);
```

### Combinar cron e intervalos {#mixed-cron-and-interval-specs}

Una programación puede combinar ambos. El motor evalúa todas las especificaciones y usa la próxima hora más temprana:

```php
$schedule = ScheduleManager::createFromSpec(
    scheduleId: 'mixed-schedule',
    spec: [
        'cron_expressions' => ['0 12 * * *'],  // noon daily
        'intervals' => [['every' => 'PT6H']],  // every 6 hours
        'timezone' => 'America/Chicago',
    ],
    action: [
        'workflow_type' => 'report-workflow',
        'workflow_class' => ReportWorkflow::class,
        'input' => [],
    ],
);
```

`createFromSpec` acepta los mismos parámetros de ciclo de vida que `create()` (`overlapPolicy`, `jitterSeconds`, `maxRuns`, `connection`, `queue`, `namespace`, etc.) como argumentos con nombre separados.

## Políticas de solapamiento {#overlap-policies}

Si la ejecución anterior sigue activa al dispararse la programación, la política decide qué hacer:

| Política | Comportamiento |
|---|---|
| `Skip` | No iniciar otra ejecución (predeterminada) |
| `BufferOne` | Guardar una activación pendiente y omitir las siguientes hasta vaciar el búfer. En el próximo `tick()` tras completarse la activa, se dispara automáticamente la pendiente. |
| `BufferAll` | Guardar todas las activaciones pendientes sin límite; se vacían secuencialmente al terminar las ejecuciones anteriores. |
| `AllowAll` | Iniciar otra ejecución con independencia del estado de la anterior |
| `CancelOther` | Cancelar la anterior e iniciar la nueva |
| `TerminateOther` | Terminar la anterior e iniciar la nueva |

## Gestionar programaciones {#managing-schedules}

### Pausar y reanudar {#pause-and-resume}

```php
ScheduleManager::pause($schedule);

// The schedule will not trigger while paused.

ScheduleManager::resume($schedule);
// next_fire_at is recalculated from now.
```

### Actualizar {#update}

```php
ScheduleManager::update(
    $schedule,
    cronExpression: '30 3 * * *',
    timezone: 'America/Chicago',
    overlapPolicy: ScheduleOverlapPolicy::AllowAll,
    notes: 'Moved to 3:30 AM CT.',
);
```

Cambiar la expresión cron o zona horaria recalcula `next_fire_at`.

### Eliminar {#delete}

```php
ScheduleManager::delete($schedule);
```

La eliminación es lógica: la fila permanece con estado `deleted` y marca `deleted_at`. Ya no puede pausarse, reanudarse, actualizarse ni activarse.

### Describir {#describe}

```php
$description = ScheduleManager::describe($schedule);

$description->scheduleId;      // 'daily-invoice-sync'
$description->namespace;       // 'default'
$description->status;          // ScheduleStatus::Active
$description->spec;            // ['cron_expressions' => ['0 2 * * *'], 'timezone' => 'America/New_York']
$description->overlapPolicy;   // ScheduleOverlapPolicy::Skip
$description->firesCount;      // 47
$description->nextFireAt;      // DateTimeInterface|null
$description->lastFiredAt;     // DateTimeInterface|null
$description->latestInstanceId; // 'schedule:daily-invoice-sync:...'
$description->jitterSeconds;   // 0
$description->note;            // 'Runs every night at 2 AM ET.'
$description->toArray();       // full array representation
```

### Buscar por ID de programación {#find-by-schedule-id}

```php
$schedule = ScheduleManager::findByScheduleId('daily-invoice-sync');
```

## Activar programaciones {#triggering-schedules}

### Activación manual {#manual-trigger}

```php
$instanceId = ScheduleManager::trigger($schedule);
```

Evalúa inmediatamente el solapamiento y, si se permite, inicia una ejecución. Devuelve su ID de instancia o `null` si se omitió.

### Tick: evaluar todas las programaciones vencidas {#tick-evaluate-all-due-schedules}

```php
$results = ScheduleManager::tick();

// Returns rows with schedule_id, instance_id, outcome, occurrence_time,
// last_fired_at, and next_fire_at when those fields apply.
```

`tick()` busca programaciones activas con `next_fire_at` pasado y las activa en orden. `occurrence_time` es la hora vencida observada por el planificador. Tras cada activación, `next_fire_at` avanza desde el reloj actual a la siguiente ocurrencia cron o de intervalo.

### Política de activaciones perdidas {#missed-fire-policy}

La evaluación en vivo usa la semántica **activar una vez y después continuar**. Si el planificador está caído durante una o más horas nominales, el primer tick recuperado inicia un workflow para el `next_fire_at` atrasado, lo registra como `occurrence_time` y avanza desde el reloj actual. Las demás ocurrencias nominales transcurridas durante la caída se omiten.

Usa `backfill()` si deben ejecutarse todas las perdidas. Enumera explícitamente el intervalo solicitado y registra cada ocurrencia por separado.

### Comando Artisan {#artisan-command}

Ejecuta un tick desde la línea de comandos:

```bash
php artisan workflow:v2:schedule-tick
php artisan workflow:v2:schedule-tick --json
```

El servidor independiente expone la misma evaluación con su propio comando:

```bash
php artisan schedule:evaluate --limit=100
```

Para evaluar continuamente, llama al comando desde el planificador de tareas de Laravel:

```php
// app/Console/Kernel.php
$schedule->command('workflow:v2:schedule-tick')->everyMinute();
```

## Máximo de ejecuciones {#max-runs}

Con `maxRuns`, se sigue `remaining_actions`. Tras la última activación permitida, se elimina lógicamente la programación de forma automática.

```php
$schedule = ScheduleManager::create(
    scheduleId: 'one-shot-retry',
    workflowClass: RetryWorkflow::class,
    cronExpression: '*/5 * * * *',
    maxRuns: 3,
);

// After 3 triggers, the schedule status becomes 'deleted'.
```

## Recuperación de ocurrencias pasadas {#backfill}

La recuperación histórica activa workflows para ocurrencias cron perdidas, por ejemplo tras una pausa, caída de despliegue o creación tardía:

```php
$results = ScheduleManager::backfill(
    $schedule,
    from: new DateTimeImmutable('2026-04-10 00:00:00'),
    to: new DateTimeImmutable('2026-04-14 00:00:00'),
);

// Returns: [['schedule_id' => '...', 'instance_id' => '...|null', 'cron_time' => '...'], ...]
```

Se activan secuencialmente. Se aplica la política de solapamiento con una excepción: **`BufferOne` y `BufferAll` se tratan como `AllowAll` durante la recuperación**. El búfer regula flujo en tiempo real y no tiene sentido al recuperar; deben iniciarse todas las ocurrencias, sin almacenarlas en un búfer que nunca se vaciará. También puedes sustituir explícitamente la política:

```php
$results = ScheduleManager::backfill(
    $schedule,
    from: new DateTimeImmutable('2026-04-10 00:00:00'),
    to: new DateTimeImmutable('2026-04-14 00:00:00'),
    overlapPolicyOverride: ScheduleOverlapPolicy::AllowAll,
);
```

Se respeta `maxRuns`: si se agotan las acciones a mitad de recuperación, se detiene y se elimina la programación automáticamente.

Los IDs de instancia son deterministas: `schedule:{scheduleId}:backfill:{timestamp}`.

## Enrutamiento por colas {#queue-routing}

Con `connection` o `queue` en la programación, los workflows usan esos valores en lugar de los predeterminados de la clase:

```php
$schedule = ScheduleManager::create(
    scheduleId: 'priority-sync',
    workflowClass: InvoiceSyncWorkflow::class,
    cronExpression: '0 * * * *',
    connection: 'redis',
    queue: 'high-priority',
);

// Every triggered run dispatches to redis/high-priority,
// regardless of InvoiceSyncWorkflow's default routing.
```

Precedencia: campos de programación → valores de clase de workflow → configuración global de colas.

## Variación aleatoria {#jitter}

Si varias programaciones comparten cron, se disparan a la vez y crean un pico de carga. `jitterSeconds` distribuye activaciones por una ventana aleatoria para suavizarlo.

```php
$schedule = ScheduleManager::create(
    scheduleId: 'hourly-report',
    workflowClass: ReportWorkflow::class,
    cronExpression: '0 * * * *',
    jitterSeconds: 300, // fire within 0–300 seconds after the top of the hour
);
```

Cada `next_fire_at` calculado se desplaza un valor aleatorio entre 0 y `jitterSeconds`, ambos incluidos. Se vuelve a sortear tras cada activación, reanudación o actualización que recalcule la siguiente hora.

Solo afecta a la hora de evaluación por tick guardada en la base de datos. La recuperación histórica siempre enumera horas cron canónicas sin variación para conservar los límites exactos.

Con `jitterSeconds = 0` (predeterminado) se desactiva y las horas coinciden exactamente con cron.

## Tipos de eventos de historial {#history-event-types}

El ciclo de vida se registra en dos flujos separados:

- **Linaje de la ejecución de workflow.** Al activar un workflow, se añade `ScheduleTriggered` a su historial (`workflow_history_events`) como vínculo verificable con la programación que lo inició.
- **Flujo de auditoría de la programación.** Cada transición queda en `workflow_schedule_history_events` con `sequence` creciente por programación. Este flujo determina «qué pasó con la programación»; el historial de ejecución determina «por qué se inició».

Ambos usan `HistoryEventType` y el registro de claves `HistoryEventPayloadContract`, manteniendo sincronizados nombres y formas de cargas.

### Evento de linaje en la ejecución iniciada {#run-lineage-event-on-the-started-workflow-run}

`ScheduleTriggered` se añade al historial de la ejecución activada con estas claves:

- `schedule_id`: identificador visible al usuario.
- `schedule_ulid`: clave primaria ULID interna.
- `cron_expression`, `timezone`, `overlap_policy`: expresión cron principal, zona IANA y política activas al dispararse.
- `trigger_number`: número de activación desde 1.
- `occurrence_time`: hora que evaluó el planificador. Los ticks registran el `next_fire_at` vencido y la recuperación la ocurrencia enumerada. Con variación aleatoria, el valor del tick incluye la hora desplazada guardada.

### Flujo de auditoría propio de la programación {#schedule-audit-stream-on-the-schedule-itself}

Cada transición se registra en su flujo propio. Las secuencias empiezan en `1` para `ScheduleCreated` y aumentan monótonamente por programación.

| Evento | Cuándo se registra | Claves de carga útil |
| --- | --- | --- |
| `ScheduleCreated` | Al crearla | `spec`, `action`, `overlap_policy`, `next_fire_at`, `command_context` |
| `SchedulePaused` | Al pausarla | `reason`, `paused_at`, `command_context` |
| `ScheduleResumed` | Al reanudarla | `next_fire_at`, `command_context` |
| `ScheduleUpdated` | Al cambiar cron, zona, especificación, acción o política | `changed_fields`, `spec`, `action`, `overlap_policy`, `next_fire_at`, `command_context` |
| `ScheduleTriggered` | Al iniciar una ejecución desde ella | `workflow_instance_id`, `workflow_run_id`, `outcome`, `effective_overlap_policy`, `trigger_number`, `occurrence_time`, `command_context` |
| `ScheduleTriggerSkipped` | Al omitir por solapamiento, estado no activable o acciones agotadas | `reason`, `skipped_trigger_count`, `last_skipped_at`, `command_context` |
| `ScheduleDeleted` | Al eliminar lógicamente, explícitamente o por agotar `max_runs` (`reason: max_runs_exhausted`) | `reason`, `deleted_at`, `command_context` |

`command_context` contiene principal, id de solicitud, origen y motivo registrados por `ScheduleManager` cuando se pasa un `CommandContext`. Es opcional; sin contexto se omite la clave en lugar de guardar un valor vacío.

### Estabilidad del contrato de cargas útiles {#payload-contract-stability}

Las claves de ambas tablas se declaran en `Workflow\V2\Support\HistoryEventPayloadContract`, se comprueban en cada escritura y están fijadas mediante pruebas del paquete. Añadir una clave es un cambio de formato de transmisión y sigue las reglas de eventos del [contrato de compatibilidad de versiones](../compatibility.md).

### Retención {#retention}

El flujo de auditoría se conserva durante la vida de la fila de programación. El borrado lógico escribe un último `ScheduleDeleted`; las filas de auditoría no se eliminan en cascada al borrar la programación. Si purgas programaciones históricas, elige una estrategia explícita de retención: el paquete no incluye TTL para auditoría.

### Visibilidad {#visibility}

El flujo se expone en todas las superficies de operador:

- **En el proceso (Eloquent).** `WorkflowSchedule::historyEvents()` (resuelto mediante `ConfiguredV2Models::query('schedule_history_event_model', ...)`) devuelve el flujo desde la aplicación anfitriona.
- **HTTP de Waterline.** `GET /waterline/api/v2/schedules/{scheduleId}/history` acepta `limit` (1–500, predeterminado 100) y cursor `after_sequence`. Se limita al espacio de nombres de Waterline para que cada cliente solo vea sus filas.
- **Interfaz de Waterline.** La acción **Historial** del registro abre un diálogo con secuencia, fecha, tipo de evento, IDs enlazados de instancia y ejecución y carga formateada. **Cargar más** avanza el cursor en lotes de 100.
- **HTTP del servidor independiente.** `GET /api/schedules/{scheduleId}/history` devuelve el mismo flujo, paginación y reglas de `X-Namespace`. Sigue disponible después del borrado lógico para reconstruir lo ocurrido.
- **CLI.** `dw schedule:history <schedule-id>` imprime una tabla (`Seq`, `Event`, `Recorded At`, `Workflow Refs`) con el aviso **Hay más eventos disponibles** si `has_more` es `true`. `--limit` y `--after-sequence` se pasan al servidor, `--all` recorre el resto y `--output=json` / `--output=jsonl` emiten salida estructurada. `jsonl` omite el sobre de cursor y cada línea es un evento completo.
- **SDK Python.** `Client.get_schedule_history(schedule_id, *, limit=None, after_sequence=None)` devuelve una `ScheduleHistoryPage`. `Client.iter_schedule_history(schedule_id, *, limit=None, after_sequence=None)` es un `AsyncIterator[ScheduleHistoryEvent]` que recorre el flujo con los mismos argumentos. `ScheduleHandle` ofrece `.history(...)` y `.iter_history(...)`. El servidor limita `limit` a 1–500 (predeterminado 100); `after_sequence` es un cursor no negativo obtenido de `next_cursor` en la página anterior.

Todas leen `workflow_schedule_history_events`; se aplica la [Estabilidad del contrato de cargas útiles](#payload-contract-stability) con independencia de la superficie.

### Migración de programaciones anteriores a la auditoría {#migration-behavior-for-pre-audit-schedules}

El flujo se introdujo con `workflow_schedule_history_events`. Las programaciones anteriores a esa migración no reciben un `ScheduleCreated` retroactivo. `ScheduleManager` solo registra transiciones cuando ocurren; la migración no sintetiza eventos para las existentes.

Para el operador:

- El flujo preexistente está vacío hasta su siguiente transición. Pausar, reanudar, actualizar, activar, omitir o eliminar añade eventos normalmente desde entonces.
- Las secuencias empiezan igualmente en `1` y aumentan por programación. Si el primer evento es `SchedulePaused`, tendrá `sequence = 1`; es normal que no lo preceda `ScheduleCreated`.
- `ScheduleTriggered` y `ScheduleTriggerSkipped` se escriben cada vez que un tick la evalúa, por lo que una programación cron acumula auditoría sin intervención tras la migración.
- No hay que habilitarla: siempre está activa, pero no tiene filas hasta el primer evento posterior a la migración.

## Seguimiento de omisiones {#skip-tracking}

Si se omite una activación por solapamiento, estado o acciones agotadas, se registra:

- `last_skip_reason`: motivo más reciente, como `overlap_policy_skip`, `status_not_triggerable` o `remaining_actions_exhausted`.
- `last_skipped_at`: cuándo se omitió.
- `skipped_trigger_count`: total acumulado.

Se incluyen en `ScheduleManager::describe()` y en la API de detalle de Waterline.

## Ámbito por espacio de nombres {#namespace-scoping}

Las programaciones pertenecen a un espacio. `namespace` en `create()` o `createFromSpec()` lo fija; si se omite, hereda `workflows.v2.namespace`, con `'default'` como alternativa.

Los IDs son únicos dentro de un espacio; puede existir el mismo `scheduleId` en varios sin conflicto.

El iniciador PHP estándar pasa el espacio guardado a instancia, ejecución y tareas duraderas. Cambiar después el predeterminado de la aplicación no mueve las ejecuciones de una programación existente. Usa Workflow 2.4.2 o posterior para esta propagación.

```php
$schedule = ScheduleManager::create(
    scheduleId: 'daily-sync',
    workflowClass: SyncWorkflow::class,
    cronExpression: '0 2 * * *',
    namespace: 'billing',
);

// Find by schedule ID within a namespace:
$found = ScheduleManager::findByScheduleId('daily-sync', namespace: 'billing');
```

Con `waterline.namespace`, las listas y detalles de programaciones de Waterline se limitan automáticamente al espacio del operador en despliegues multicliente.

## Base de datos {#database}

`workflow_schedules` se crea con la migración `2026_04_14_000157`. La clase de modelo se configura mediante `workflows.v2.schedule_model`.

Si ejecutas migraciones del paquete junto a las de aplicación, la 157 detecta una tabla `workflow_schedules` previa: si ya coincide con el esquema del paquete la conserva; si una migración provisional anterior la creó con otro esquema, la sustituye.
