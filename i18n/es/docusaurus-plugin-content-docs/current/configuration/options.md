---
sidebar_position: 2
---

# Opciones {#options}

Al definir workflows y actividades puedes configurar varias opciones, como el número de intentos antes de declarar un fallo, la conexión y la cola, y la duración máxima de ejecución en segundos.

```php
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public ?string $connection = 'default';
    public ?string $queue = 'default';

    public int $tries = 3;

    public function backoff(): array
    {
        return [1, 2, 5, 10, 15, 30, 60, 120];
    }
}
```

Las propiedades `$connection` y `$queue` de `Workflow\V2\Workflow` y `Workflow\V2\Activity` se declaran como `public ?string` y su valor predeterminado es `null`. Al redefinirlas en subclases debes conservar el tipo anulable para cumplir las reglas de invariancia de tipos de propiedades públicas de PHP. Usa `null` para heredar la conexión o cola predeterminadas de la aplicación en lugar de fijar un valor.

Los tiempos de espera de las actividades no se configuran con una propiedad de clase. Usa [`ActivityOptions`](#activityoptions) por llamada (por ejemplo, `startToCloseTimeout`) o la instantánea de la política de reintentos tomada al programar la actividad. Consulta también [Política de reparación de tareas](/docs/polyglot/server-config-reference#workflow-package-controls) para los ajustes temporales del bucle del worker.

## StartOptions {#startoptions}

`Workflow\V2\StartOptions` contiene la configuración de visibilidad, deduplicación y tiempo de espera de ejecución al iniciar el workflow. No selecciona una cola: el enrutamiento depende de las propiedades `$connection` y `$queue` de las clases de workflow y actividad, y de `ActivityOptions` por llamada.

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;
use Workflow\V2\Enums\DuplicateStartPolicy;

$workflow = WorkflowStub::make(MyWorkflow::class);

$workflow->start(
    'arg1',
    new StartOptions(
        duplicateStartPolicy: DuplicateStartPolicy::ReturnExistingActive,
        businessKey: 'order-12345',
        labels: ['tenant' => 'acme'],
        executionTimeoutSeconds: 3600,
    ),
);
```

El motor consume `StartOptions` sin pasarlas como argumentos a `handle()`. Se guardan con el workflow y se usan en los despachos posteriores de workflows y actividades, incluida la reproducción y la continuación como nueva ejecución.

## ActivityOptions {#activityoptions}

`Workflow\V2\Support\ActivityOptions` permite sustituir por llamada el enrutamiento, los reintentos y los tiempos de espera al invocar una actividad, sin modificar su clase:

```php
use function Workflow\V2\activity;
use Workflow\V2\Support\ActivityOptions;

$result = activity(
    ChargeCard::class,
    new ActivityOptions(
        connection: 'redis',
        queue: 'critical',
        maxAttempts: 5,
        startToCloseTimeout: 30,
    ),
    $orderId,
);
```

Las opciones de enrutamiento de `ActivityOptions` se aplican al programar una nueva ejecución de actividad. No trasladan una actividad ya registrada en el historial. Antes de cambiar los grupos de workers, consulta las [colas de actividad registradas](../polyglot/task-matching-dispatch.md#recorded-activity-queues).

## Conexión {#connection}

El ajuste `$connection` especifica la conexión de cola a la que se enviará el workflow o la actividad. Su valor no se establece de forma predeterminada, por lo que se usa la conexión predeterminada. Puedes cambiarlo con la propiedad `$connection` de la clase de workflow o actividad.

## Cola {#queue}

El ajuste `$queue` especifica la cola a la que se añadirá el workflow o la actividad. Su valor no se establece de forma predeterminada, por lo que se usa la cola predeterminada de la conexión elegida. Puedes cambiarlo con la propiedad `$queue` de la clase de workflow o actividad.

Una actividad guarda su conexión y cola resueltas al programarse. Sus reintentos y tareas reparadas reutilizan ese enrutamiento registrado, aunque cambien los valores predeterminados de la clase o las opciones de una llamada. Las ejecuciones de workflow existentes también conservan su cola de workflow registrada. Mantén workers compatibles en las colas antiguas mientras existan esas dependencias. Sigue el [procedimiento de transición de colas](../polyglot/task-matching-dispatch.md#recorded-activity-queues).

## Reintentos {#retries}

El ajuste `$tries` controla el número total de intentos de una actividad antes de considerarla fallida. Su valor predeterminado es `1` (un solo intento, sin reintentos automáticos). Establece un valor mayor que `1` para permitir reintentos, o `0` para reintentar indefinidamente. Puedes sustituirlo por llamada mediante `ActivityOptions::$maxAttempts`.

## Tiempo de espera {#timeout}

La clase base `Activity` v2 no tiene una propiedad `$timeout`. Configura los tiempos de espera por llamada mediante [`ActivityOptions`](#activityoptions) con `startToCloseTimeout`, `scheduleToStartTimeout`, `scheduleToCloseTimeout` o `heartbeatTimeout`. El runtime guarda una instantánea de la política de reintentos resultante al programar la ejecución de actividad. Así, el tiempo de espera de un intento ya programado permanece estable aunque un despliegue posterior cambie la clase o las opciones. La temporización del despacho en el bucle del worker se controla mediante [Política de reparación de tareas](/docs/polyglot/server-config-reference#workflow-package-controls).

## Espera entre reintentos {#backoff}

El método `backoff` devuelve un array de enteros que corresponden al intento actual. La espera predeterminada crece exponencialmente hasta 2 minutos. Puedes cambiarla implementando `backoff` en la clase de actividad.

## Espacio de nombres {#namespace}

Los workflows pueden limitarse a un espacio de nombres para aislar varios espacios. El espacio configurado se aplica tanto a la API de inicio del plano de control como a `Workflow\V2\WorkflowStub::make()->start()`. Se guarda en la nueva instancia, ejecución, tareas duraderas y proyección del resumen de ejecución. Los filtros de consulta de tareas y visibilidad de Waterline pueden restringir los resultados a un espacio. Usa Workflow 2.4.2 o posterior para una asignación coherente en ambas API de inicio PHP.

Los nombres solo pueden contener caracteres alfanuméricos en minúscula, puntos, guiones bajos y guiones (`[a-z0-9._-]+`, máximo 128 caracteres).

Establece el espacio predeterminado mediante una variable de entorno:

```env
DW_V2_NAMESPACE=production
```

O en `config/workflows.php`:

```php
'v2' => [
    'namespace' => env('DW_V2_NAMESPACE'),
    // ...
],
```

Un espacio explícito sustituye al predeterminado configurado. El stub lo acepta como tercer argumento de `make()`:

```php
$workflow = \Workflow\V2\WorkflowStub::make(
    OrderProcessingWorkflow::class,
    'order-12345',
    'staging',
);
$workflow->start();
```

El plano de control lo acepta en las opciones de `start()`:

```php
$controlPlane->start('order-processing', 'order-12345', [
    'namespace' => 'staging',
    // ...
]);
```

Si no se configura ni se pasa explícitamente un espacio, las nuevas instancias conservan `null`. Un observador limitado a un espacio no incluye esas ejecuciones. Cambiar la configuración no reasigna las instancias existentes. Se rechaza iniciar una instancia existente mediante otro espacio.

### Limitar Waterline a un espacio de nombres {#waterline-namespace-scoping}

Si Waterline usa una base de datos compartida con varios espacios, establece `WATERLINE_NAMESPACE` para restringir todas las listas a uno:

```env
WATERLINE_NAMESPACE=production
```

Esto añade un filtro de espacio a cada consulta de visibilidad para que Waterline solo muestre sus workflows. También limita todas las operaciones de comandos (cancelación, señal, terminación, actualización, reparación, archivo y consultas) al espacio configurado. Un comando dirigido a una instancia o ejecución de otro espacio devuelve 404 y no se ejecuta.

### Limitar comandos a un espacio de nombres {#command-namespace-scoping}

`WorkflowStub::load()`, `loadSelection()` y `loadRun()` aceptan un parámetro opcional `namespace`:

```php
use Workflow\V2\WorkflowStub;

// Load only if the instance belongs to the given namespace
$stub = WorkflowStub::load('order-12345', namespace: 'production');

// Load a specific run, scoped to namespace
$stub = WorkflowStub::loadRun($runId, namespace: 'production');

// Load a specific selection, scoped to namespace
$stub = WorkflowStub::loadSelection('order-12345', $runId, namespace: 'production');
```

Cuando `namespace` es `null` (predeterminado), la carga abarca todos los espacios para conservar la compatibilidad. Si se proporciona uno, la consulta filtra por espacio en la base de datos y lanza `ModelNotFoundException` si el workflow no existe en él.

Los métodos de comandos del plano de control (`signal`, `cancel`, `terminate`, `update`, `repair`, `archive`) también aceptan `namespace` en su array de opciones:

```php
$controlPlane->cancel('order-12345', [
    'namespace' => 'production',
]);
```

### Filtrado por espacio de nombres en los puentes de tareas {#task-bridge-namespace-filtering}

Los puentes de tareas de workflow y actividad aceptan un parámetro opcional `namespace` en `poll()`:

```php
$tasks = $bridge->poll('redis', 'default', limit: 10, namespace: 'production');
```

Si se omite, `poll()` devuelve tareas de todos los espacios, lo que conserva la compatibilidad con instalaciones anteriores a esta función.

## Alias de tipo duraderos {#durable-type-aliases}

Las claves de tipo duraderas de workflows y actividades se guardan al registrarlas en `workflows.v2.types`. Las cargas útiles de fallos pueden usar el mismo patrón para clases de excepción:

```php
'v2' => [
    'types' => [
        'workflows' => [
            'billing.invoice-sync' => App\Workflows\InvoiceSyncWorkflow::class,
        ],
        'activities' => [
            'payments.capture' => App\Activities\CapturePaymentActivity::class,
        ],
        'exceptions' => [
            'billing.invoice-declined' => App\Exceptions\InvoiceDeclined::class,
        ],
        'exception_class_aliases' => [
            App\Exceptions\LegacyInvoiceDeclined::class => App\Exceptions\InvoiceDeclined::class,
        ],
    ],
],
```

Cuando se registra un fallo de actividad, actualización, hijo o workflow con un alias de excepción, el motor lo guarda como `exception_type` en el historial tipado y como `type` en la carga útil del fallo. La reproducción resuelve primero el alias y luego recurre a la clase PHP registrada. Así, mover la clase posteriormente puede conservar la semántica de `catch` mientras el alias apunte a la clase actual del throwable.

Para fallos v1 importados que se registraron antes de existir un alias, `workflows.v2.types.exception_class_aliases` puede asociar el nombre completo de la excepción antigua con la clase actual. Los alias duraderos de `exceptions` siguen teniendo prioridad. El mapa de alias de clase solo sirve de puente de refactorización para cargas ya registradas sin `type` duradero; los nuevos workflows deben usar alias de excepción duraderos para independizar el historial de los nombres PHP.

La versión final de v2 escribe alias duraderos al registrar el fallo. Configura alias estables antes de registrar fallos cuyas clases de throwable puedan moverse después.

Si un fallo reproducido no puede resolverse con el mapa duradero `exceptions`, el mapa de alias de clase ni la clase registrada, el motor no recurre a una excepción genérica dentro del workflow. La reproducción de consultas lanza `UnresolvedWorkflowFailureException`, Waterline marca el fallo con `exception_replay_blocked = true` y una tarea de worker que encuentre el mismo problema queda fallida mientras la ejecución permanece abierta. Corrige el mapa y repara la ejecución en lugar de usar bloques amplios `catch (RuntimeException)` para fallos históricos renombrados.

## Espera por bloqueo en workflows de la API anterior {#legacy-overlap-release-delay}

En aplicaciones que usan `Workflow\Workflow`, configure `overlapReleaseAfter` con un número entero de segundos mayor o igual que cero. El valor predeterminado es `0`. Se aplica a los trabajos de workflow, actividad, señal y resultado de workflow hijo que no pueden adquirir su bloqueo. No cambia la caducidad del bloqueo ni la espera tras excepciones de actividad. `Workflow\V2\Workflow` usa reservas de tareas y no utiliza este middleware.

```php
use Workflow\WorkflowOptions;
use Workflow\WorkflowStub;

$workflow = WorkflowStub::make(MyLegacyWorkflow::class);
$workflow->start('argument', new WorkflowOptions(overlapReleaseAfter: 5));
```

`WorkflowOptions::set(['overlapReleaseAfter' => 5])` admite la misma configuración. El valor se guarda con la ejecución y se hereda en los hijos y en continue-as-new cuando no se proporciona un `WorkflowOptions` explícito. Un objeto de opciones explícito sustituye las opciones heredadas y restablece esta espera a cero si se omite.

Laravel cuenta las reservas de la cola como intentos, incluso cuando el middleware devuelve el trabajo a la cola antes de ejecutarlo. Una espera positiva reduce los reintentos rápidos, pero no garantiza que un límite bajo de `$tries`, `--tries` o del contador de intentos de la cola en base de datos sea suficiente. Elija la espera y el límite de intentos según la duración prevista de la contención.
