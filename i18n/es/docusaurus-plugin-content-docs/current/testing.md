---
sidebar_position: 9
---

# Pruebas {#testing}

## Replay antes de desplegar o revertir {#replay-before-deployment}

Conserve exportaciones de ejecuciones seleccionadas de workflows representativos abiertos y cerrados recientemente. Cubra las rutas de actividades, reintentos, señales, actualizaciones, workflows hijos, temporizadores y marcadores de versión que puede encontrar el candidato. Conserve cada generación necesaria de continue-as-new. Use historiales sin podar con los bytes originales del payload y sus codecs disponibles. Un indicador de exportación por sí solo no demuestra integridad completa. Consulte los [límites de retención](./configuration/pruning-workflows.md).

### PHP integrado {#embedded-php-replay}

Exporte desde el almacén que pertenece a la aplicación. Establezca `WORKFLOW_ID` y `RUN_ID` para la instancia y ejecución seleccionadas exactamente:

```bash
php artisan workflow:v2:history-export "$WORKFLOW_ID" \
  --run-id="$RUN_ID" --output=replay-bundles/run.json
```

Ejecute la verificación dentro del artefacto de la aplicación candidata, con sus clases de workflow y configuración cargadas. Guarde los informes fuera del directorio de paquetes. Use un entorno de CI aislado sin credenciales para efectos externos en producción:

```bash
php artisan workflow:v2:replay-verify replay-bundles/run.json \
  --json --output=replay-one.json
php artisan workflow:v2:replay-simulate replay-bundles \
  --json --output=replay-report.json
```

Un código de salida distinto de cero bloquea la promoción. Un cero todavía puede exigir revisión. Guarde esta comprobación del informe de lote como `gate-replay.php` y ejecute `php gate-replay.php replay-report.json` en CI:

```php
<?php
$report = json_decode(file_get_contents($argv[1]), true, 512, JSON_THROW_ON_ERROR);
$evidence = $report['evidence'] ?? [];
$count = $evidence['bundle_count'] ?? 0;
$allowed = ($report['promotion_decision'] ?? null) === 'safe_to_promote'
    && $count > 0
    && ($evidence['missing_bundle_count'] ?? 1) === 0
    && ($evidence['replay_checked_count'] ?? 0) === $count;
exit($allowed ? 0 : 1);
```

`--skip-replay` comprueba solo la integridad. Ni siquiera un resultado limpio autoriza una promoción segura para replay. Un éxito cubre únicamente las rutas registradas y el prefijo visible de una ejecución abierta, no ramas futuras, corrección de negocio ni comportamiento de red. Antes de revertir, pruebe el artefacto antiguo con los historiales ya escritos por workers nuevos que podría recibir. Mantenga también pruebas unitarias y con un runtime real.

### SDK de servicio {#service-sdk-replay}

**PHP:** use `DurableWorkflow\Worker\Replayer::replay()` con el codec de la aplicación, el callable, la lista de eventos, la entrada original, la cola y la identidad registrada de la tarea. Deje que `NonDeterministicWorkflow` haga fallar la prueba y compruebe comandos y resultados esperados. Consulte las [pruebas de replay de PHP](https://php.durable-workflow.com/build/testing/).

**Python:** use `Replayer.replay()` o `verify_replay()` con los workflows candidatos registrados y compruebe el resultado esperado. Recibir un objeto no es, por sí solo, una aserción satisfactoria. Proporcione el `start_input` original decodificado cuando los eventos no lo incluyan: Core lo almacena en `payloads.arguments`. Conserve el tipo, los ID y el codec registrados. Consulte las [API de replay de Python](https://python.durable-workflow.com/sdk-reference/#replay-captured-histories). `--simulate-bundles` comprueba integridad, no código candidato; la compatibilidad actual con el esquema 2 se sigue en [Python #173](https://github.com/durable-workflow/sdk-python/issues/173). No reescriba la versión ni la suma de comprobación para evitar un rechazo.

**Rust:** el SDK **4.5.0 o posterior** proporciona `testing::WorkflowEnvironment` y `WorkflowHistory` para pruebas de actividades/workflows sin Server y reproducción de exportaciones completas. Reutilice los registros candidatos, conserve la entrada original/todas las páginas y compruebe la finalización o el prefijo pendiente esperado. Una divergencia devuelve `Error::NonDeterministicReplay` tipado con la secuencia duradera y los comandos esperados/reales. Las carreras select nuevas y otros caminos no soportados necesitan integración. Consulte las [pruebas, reglas de determinismo y ejemplos de reproducción de Rust](./polyglot/rust.md#offline-testing-and-replay).

## Pruebas rápidas con retrasos {#keeping-delay-tests-fast}

Los retrasos de los temporizadores y el backoff de reintentos duraderos usan
segundos enteros. Si una API del SDK admite fracciones y las redondea hacia
arriba, 100 ms se convierten en un segundo. Esos valores no aceleran las pruebas
con muchos reintentos.

En pruebas embebidas, use `WorkflowStub::fake()`, simule los resultados de las
actividades y avance el reloj de pruebas de Laravel según el retraso configurado.
Después llame a `WorkflowStub::runReadyTasks()` para procesar el trabajo ya vencido.
Limite el número de intentos. Un backoff de cero segundos específico de la prueba
permite comprobar reintentos acotados sin esperar tiempo real. Conserve una prueba
separada del calendario de backoff real. Cambiar el reloj local de pruebas no
adelanta el reloj de un Server remoto.

## `Workflow\V2` {#workflowv2}

`Workflow\V2\WorkflowStub::fake()` ofrece una ruta de prueba determinista con ejecución inmediata para las funciones admitidas por el modo simulado de `V2`.

- las tareas listas de workflow y actividad se ejecutan inmediatamente sin esperar a un worker de colas
- los workflows hijos anidados se ejecutan como ejecuciones `V2` reales anidadas bajo el mismo modo simulado
- las actividades simuladas siguen escribiendo filas duraderas de `activity_executions`, tareas e historial
- se omiten las comprobaciones de capacidades del backend en esta ruta, por lo que `sync` sigue siendo utilizable en pruebas
- `WorkflowStub::assertDispatched()`, `assertDispatchedTimes()`, `assertNotDispatched()` y `assertNothingDispatched()` cubren los despachos de actividades `V2`
- `WorkflowStub::assertSignalSent()`, `assertSignalSentTimes()` y `assertSignalNotSent()` cubren las señales `V2` enviadas mediante `WorkflowStub::signal()` o `signalWithStart()`
- `WorkflowStub::assertUpdateSent()`, `assertUpdateSentTimes()` y `assertUpdateNotSent()` cubren las actualizaciones `V2` enviadas mediante `WorkflowStub::update()`, `attemptUpdate()` o `submitUpdate()`
- las tareas de temporizador diferidas siguen en la cola duradera hasta su vencimiento; tras avanzar el tiempo, `WorkflowStub::runReadyTasks()` ejecuta inmediatamente las que ya vencieron

### Alcance de pruebas de la primera publicación {#first-release-testing-scope}

Lo siguiente **no** forma parte del modo simulado de la primera publicación de `V2` y podría añadirse en futuros contratos aditivos:

- no existe un equivalente `V2` del puente heredado `resume()`
- no hay un auxiliar específico para simular workflows hijos ni comprobar su despacho; se ejecutan como ejecuciones `V2` reales anidadas, por lo que debes probar su salida observable
- no hay un hook de callback diferido para inyectar señales o actualizaciones en instantes virtuales durante una misma ejecución simulada; avanza el tiempo y llama a `WorkflowStub::runReadyTasks()` entre llamadas explícitas de señal o actualización

`WorkflowStub::mock()` impone este alcance en ejecución: pasar una subclase de `Workflow` lanza `LogicException` con un mensaje que indica que debes probar la salida observable de los workflows hijos. Solo acepta clases `Activity` (y claves de cadena sin resolver) como objetivos de simulación.

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

final class MyWorkflow extends Workflow
{
    public function handle(): array
    {
        return [
            'result' => activity(MyActivity::class, 'Taylor'),
            'workflow_id' => $this->workflowId(),
            'run_id' => $this->runId(),
        ];
    }
}
```

```php
use Workflow\V2\Testing\ActivityFakeContext;
use Workflow\V2\WorkflowStub;

public function testWorkflow(): void
{
    WorkflowStub::fake();

    WorkflowStub::mock(MyActivity::class, function (ActivityFakeContext $context, string $name): string {
        $this->assertSame('Taylor', $name);
        $this->assertSame('my-workflow-id', $context->workflowId());

        return "Hello, {$name}!";
    });

    $workflow = WorkflowStub::make(MyWorkflow::class, 'my-workflow-id');
    $workflow->start();

    $this->assertTrue($workflow->refresh()->completed());
    $this->assertSame('Hello, Taylor!', $workflow->output()['result']);

    WorkflowStub::assertDispatched(MyActivity::class, function (string $name): bool {
        return $name === 'Taylor';
    });
}
```

Usa `WorkflowStub::assertDispatched()`, `assertDispatchedTimes()`, `assertNotDispatched()` y `assertNothingDispatched()` para comprobar los despachos registrados de actividades `V2`.

Para workflows con temporizadores, avanza el tiempo con los auxiliares de Laravel y ejecuta explícitamente las tareas vencidas de la cola:

```php
use function Workflow\V2\timer;
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;

final class MyTimerWorkflow extends Workflow
{
    public function handle(): array
    {
        timer(60);

        return ['done' => true];
    }
}

public function testTimerWorkflow(): void
{
    WorkflowStub::fake();

    $workflow = WorkflowStub::make(MyTimerWorkflow::class, 'timer-workflow');
    $workflow->start();

    $this->travel(60)->seconds();

    WorkflowStub::runReadyTasks();

    $this->assertTrue($workflow->refresh()->completed());
    $this->assertSame(['done' => true], $workflow->output());
}
```

`WorkflowStub::runReadyTasks()` solo ejecuta tareas cuyo plazo ya llegó. No adelanta el reloj ni fuerza la activación anticipada de temporizadores futuros.

### Enviar señales en modo simulado {#sending-signals-in-fake-mode}

Los workflows que esperan señales pueden recibirlas en modo simulado. Al llamar a `$workflow->signal(...)`, el motor registra el comando duradero y crea una tarea de workflow. Esa tarea se ejecuta inmediatamente en modo simulado y el workflow se reanuda de forma síncrona:

```php
use function Workflow\V2\activity;
use Workflow\V2\Attributes\Signal;
use function Workflow\V2\await;
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;

#[Signal('name-provided')]
final class ApprovalWorkflow extends Workflow
{
    public function handle(): array
    {
        $name = await('name-provided');
        $greeting = activity(GreetingActivity::class, $name);

        return ['name' => $name, 'greeting' => $greeting];
    }
}

public function testSignalWorkflow(): void
{
    WorkflowStub::fake();
    WorkflowStub::mock(GreetingActivity::class, 'Hello, Taylor!');

    $workflow = WorkflowStub::make(ApprovalWorkflow::class, 'approval-1');
    $workflow->start();

    // Workflow suspends at await('name-provided')
    $this->assertSame('waiting', $workflow->refresh()->status());

    // Send the signal — resumes the workflow inline
    $workflow->signal('name-provided', 'Taylor');

    $this->assertTrue($workflow->refresh()->completed());
    $this->assertSame('Taylor', $workflow->output()['name']);

    WorkflowStub::assertSignalSent('name-provided');
    WorkflowStub::assertSignalSentTimes('name-provided', 1);
    WorkflowStub::assertSignalNotSent('other-signal');
}
```

Usa `WorkflowStub::assertSignalSent()`, `assertSignalSentTimes()` y `assertSignalNotSent()` para verificar qué señales se enviaron. La forma con callback recibe el identificador de instancia y los argumentos de la señal:

```php
WorkflowStub::assertSignalSent(
    'name-provided',
    fn (string $instanceId, string $name): bool =>
        $instanceId === 'approval-1' && $name === 'Taylor'
);
```

### Enviar actualizaciones en modo simulado {#sending-updates-in-fake-mode}

Las actualizaciones también se aplican inmediatamente. Al llamar a `$workflow->attemptUpdate(...)` o `$workflow->update(...)`, el motor registra el comando duradero, crea una tarea que aplica la actualización y la ejecuta de inmediato:

```php
use Workflow\UpdateMethod;
use Workflow\V2\Attributes\Signal;
use function Workflow\V2\await;
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;

#[Signal('done')]
final class SettingsWorkflow extends Workflow
{
    private bool $enabled = false;

    public function handle(): array
    {
        await('done');

        return ['enabled' => $this->enabled];
    }

    #[UpdateMethod]
    public function toggle(bool $enabled): array
    {
        $this->enabled = $enabled;

        return ['enabled' => $this->enabled];
    }
}

public function testUpdateWorkflow(): void
{
    WorkflowStub::fake();

    $workflow = WorkflowStub::make(SettingsWorkflow::class, 'settings-1');
    $workflow->start();

    $this->assertSame('waiting', $workflow->refresh()->status());

    $result = $workflow->attemptUpdate('toggle', true);

    $this->assertTrue($result->accepted());

    WorkflowStub::assertUpdateSent('toggle');
    WorkflowStub::assertUpdateSentTimes('toggle', 1);
    WorkflowStub::assertUpdateNotSent('other-update');

    // Complete the workflow
    $workflow->signal('done');
    $this->assertTrue($workflow->refresh()->completed());
    $this->assertTrue($workflow->output()['enabled']);
}
```

Usa `WorkflowStub::assertUpdateSent()`, `assertUpdateSentTimes()` y `assertUpdateNotSent()` para verificar qué actualizaciones se enviaron. La forma con callback recibe el identificador de instancia y los argumentos de la actualización:

```php
WorkflowStub::assertUpdateSent(
    'toggle',
    fn (string $instanceId, bool $enabled): bool =>
        $instanceId === 'settings-1' && $enabled === true
);
```

### Probar resultados de inicio y políticas de inicio duplicado {#testing-start-outcomes-and-duplicate-start-policy}

Usa `attemptStart()` para verificar el comportamiento de inicios duplicados sin lanzar excepciones. `StartResult` expone auxiliares de resultado tipados:

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

public function testRejectDuplicateStart(): void
{
    WorkflowStub::fake();
    WorkflowStub::mock(MyActivity::class, 'result');

    $workflow = WorkflowStub::make(MyWorkflow::class, 'order-123');

    $first = $workflow->start('Taylor');
    $this->assertTrue($first->startedNew());

    $second = WorkflowStub::load('order-123');
    $duplicate = $second->attemptStart('Taylor');

    $this->assertTrue($duplicate->rejected());
    $this->assertTrue($duplicate->rejectedDuplicate());
    $this->assertSame('instance_already_started', $duplicate->rejectionReason());
}
```

Para probar la política de devolver la ejecución activa existente, pasa `StartOptions::returnExistingActive()`:

```php
public function testReturnExistingActiveStart(): void
{
    WorkflowStub::fake();

    $workflow = WorkflowStub::make(MySignalWorkflow::class, 'order-123');
    $workflow->start();

    $this->assertSame('waiting', $workflow->refresh()->status());

    $second = WorkflowStub::load('order-123');
    $result = $second->attemptStart(StartOptions::returnExistingActive());

    $this->assertTrue($result->accepted());
    $this->assertTrue($result->returnedExistingActive());
    $this->assertSame($workflow->runId(), $result->runId());
}
```

Ambas políticas registran comandos duraderos y eventos de historial. También puedes comprobar filas `WorkflowCommand` y `WorkflowHistoryEvent` para verificar más detalles.

### Probar el presupuesto del historial {#testing-history-budget}

Los campos de `HistoryBudget` (`history_event_count`, `history_size_bytes`, `continue_as_new_recommended`) aparecen en la proyección del resumen de ejecución y están disponibles mediante `RunDetailView`. En el workflow, la clase base `Workflow` los expone como `$this->historyLength()`, `$this->historySize()` y `$this->shouldContinueAsNew()`:

```php
use Workflow\V2\Workflow;

final class LongRunningWorkflow extends Workflow
{
    public function handle(): void
    {
        while (true) {
            // ... process work ...

            if ($this->shouldContinueAsNew()) {
                Workflow::continueAsNew($this->carryForwardState());
            }
        }
    }
}
```

Para probar los umbrales del presupuesto, configura valores bajos y verifica la recomendación:

```php
public function testHistoryBudgetRecommendsContinueAsNew(): void
{
    config()->set('workflows.v2.history_budget.continue_as_new_event_threshold', 5);

    WorkflowStub::fake();

    // Run a workflow that produces enough history events to trip the threshold
    $workflow = WorkflowStub::make(ManyActivitiesWorkflow::class, 'budget-test');
    $workflow->start();

    $summary = $workflow->summary();
    $this->assertTrue($summary->continue_as_new_recommended);
}
```

## `Workflow\WorkflowStub` heredado {#legacy-workflowworkflowstub}

:::warning v1 heredada

Los ejemplos de esta sección usan el entorno v1 (`Workflow\Workflow`, `use function Workflow\activity`, `execute()` como generador con `yield`, `Workflow\Models\StoredWorkflow`). Conserva estos patrones para pruebas que aún ejercitan workflows v1 durante la migración. Las pruebas nuevas deben usar `Workflow\V2\WorkflowStub::fake()` con `Workflow\V2\Workflow` y métodos `handle()` de código secuencial, como se muestra arriba.

:::

### Workflows {#workflows}

Puedes ejecutar workflows de forma síncrona en pruebas y simular actividades y workflows hijos para definir comportamientos y salidas esperados sin ejecutar sus implementaciones reales.

```
use function Workflow\activity;
use Workflow\Workflow;

class MyWorkflow extends Workflow
{
    public function execute()
    {
        $result = yield activity(MyActivity::class);

        return $result;
    }
}
```

Para probar el workflow anterior, llama primero a `WorkflowStub::fake()` y después simula la actividad.

```
public function testWorkflow()
{
    WorkflowStub::fake();

    WorkflowStub::mock(MyActivity::class, 'result');

    $workflow = WorkflowStub::make(MyWorkflow::class);
    $workflow->start();

    $this->assertSame($workflow->output(), 'result');
}
```

También puedes pasar un callback en lugar de un valor de resultado a ` WorkflowStub::mock()`.

El callback recibirá el `$context` del workflow y los argumentos de la actividad actual.

```
public function testWorkflow()
{
    WorkflowStub::fake();

    WorkflowStub::mock(MyActivity::class, function ($context) {
        return 'result';
    });

    $workflow = WorkflowStub::make(MyWorkflow::class);
    $workflow->start();

    $this->assertSame($workflow->output(), 'result');
}
```

Puedes comprobar qué actividades o workflows hijos se despacharon mediante `assertDispatched`, `assertNotDispatched` y `assertNothingDispatched`:

```
WorkflowStub::assertDispatched(MyActivity::class);

// Assert the activity was dispatched twice...
WorkflowStub::assertDispatched(MyActivity::class, 2);

WorkflowStub::assertNotDispatched(MyActivity::class);

WorkflowStub::assertNothingDispatched();
```

Puedes pasar una función anónima a `assertDispatched` o `assertNotDispatched` para comprobar si se despachó una actividad o workflow hijo que cumple una condición. El callback recibe sus argumentos.

```
WorkflowStub::assertDispatched(TestOtherActivity::class, function ($string) {
    return $string === 'other';
});
```

### Saltar en el tiempo {#skipping-time}

Al manipular la hora del sistema con `$this->travel()` o `$this->travelTo()`, puedes simular workflows dependientes del tiempo. Así puedes probar vencimientos, retrasos y otra lógica temporal.

```
use function Workflow\{activity, timer};
use Workflow\Workflow;

class MyTimerWorkflow extends Workflow
{
    public function execute()
    {
        yield timer(60);

        $result = yield activity(MyActivity::class);

        return $result;
    }
}
```

El workflow anterior espera 60 segundos antes de ejecutar la actividad. `$this->travel()` y `$workflow->resume()` permiten omitir esa espera en el entorno heredado.

```
public function testTimeTravelWorkflow()
{
    WorkflowStub::fake();

    WorkflowStub::mock(MyActivity::class, 'result');

    $workflow = WorkflowStub::make(MyTimerWorkflow::class);
    $workflow->start();

    $this->travel(120)->seconds();

    $workflow->resume();

    $this->assertSame($workflow->output(), 'result');
}
```

Los auxiliares `$this->travel()` y `$this->travelTo()` usan internamente `Carbon::setTestNow()`.

### Actividades {#activities}

Probar actividades es similar a probar trabajos de Laravel. Crea la actividad manualmente y llama a `handle()`.

```
$workflow = WorkflowStub::make(MyWorkflow::class);

$activity = new MyActivity(0, now()->toDateTimeString(), StoredWorkflow::findOrFail($workflow->id()));

$result = $activity->handle();
```

Las actividades heredadas siguen ejecutándose mediante el método de trabajo `handle()` del entorno. En `Workflow\V2`, el código de workflows y actividades definido por el usuario también está en `handle()`.
