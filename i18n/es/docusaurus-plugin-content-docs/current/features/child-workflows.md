---
sidebar_position: 9
---

# Workflows hijos {#child-workflows}

La implementación actual de `Workflow\V2` admite workflows hijos duraderos mediante llamadas secuenciales `child()` y barreras de reunión `all([...])` compuestas solo por hijos, mezcladas con actividades o anidadas en grupos mayores. Permiten que un padre programe uno o más subworkflows y espere sus resultados de forma duradera sin mantener vivo el proceso padre.

Un hijo sigue siendo una ejecución normal de workflow con sus propios ids de instancia y ejecución. Lo distingue el vínculo duradero con la ejecución padre y un `child_call_id` estable emitido por el padre para esa invocación.

## Límite del espacio de nombres {#namespace-boundary}

Un workflow hijo y las señales enviadas mediante su handle permanecen en el espacio de nombres del padre. Elegir otro tipo de workflow, lenguaje o cola no cambia ese espacio. Usa una [operación de servicio](./service-operations.md) para llamar de forma duradera a una operación publicada en otro espacio de nombres del mismo clúster.

```php
use function Workflow\V2\child;
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle(string $name): array
    {
        $child = child(ChildWorkflow::class, $name);

        return [
            'parent_workflow_id' => $this->workflowId(),
            'parent_run_id' => $this->runId(),
            'child' => $child,
        ];
    }
}
```

## Atributos de búsqueda y memo {#child-metadata-inheritance}

Una ejecución hija nueva comienza con copias de los atributos de búsqueda y el memo actuales del padre. Es una instantánea al crear la hija, no un vínculo activo. La hija puede actualizar claves heredadas o añadir las suyas; las actualizaciones posteriores del padre no cambian a la hija y viceversa. Los atributos copiados sin modificar se marcan como `inherited_from_parent`.

Por ejemplo, la hija hereda inicialmente `customer=customer-42` y la nota de memo del padre. Cambiar su etapa o nota deja intactos los valores del padre. Por tanto, un filtro por cliente puede encontrar a ambos mientras conserven ese valor; consulte los [filtros de lista de padres/hijos](./search-attributes.md#parent-child-list-filters).

Las [comprobaciones de artefactos publicados](https://github.com/durable-workflow/durable-workflow.github.io/issues/368#issuecomment-6362355504) verifican la instantánea y las actualizaciones independientes en Workflow 2.10.1 embebido y en modo servicio con Python SDK 2.9.0 / Server 2.11.0. Son comprobaciones de metadatos de versiones identificadas, no un cambio de la combinación de instalación seleccionada.

## Comportamiento actual {#current-behavior}

- Importa `use function Workflow\V2\child;` y llama a `child(ChildWorkflow::class, ...)`. Suspende al padre, crea una ejecución hija duradera y devuelve su resultado al cerrarse.
- Un hijo fallido lanza una excepción en el padre; uno satisfactorio devuelve su salida. Cancelación y terminación producen tipos de excepción distintos.
- `$this->child()` devuelve la última referencia a hijo; `$this->children()` devuelve todas en orden de pasos. Exponen `id()`, `runId()`, `callId()` y helpers de señales como `signal()` y `signalWithArguments()`.
- Si un hijo usa `continueAsNew()`, el padre sigue automáticamente la ejecución más reciente: `runId()` avanza y `id()` sigue estable.
- `all()` combina clausuras `fn () => child(...)` y `fn () => activity(...)` en una barrera. El primer fallo de hijo despierta al padre; con ramas satisfactorias espera a que todas se cierren.

## Barrera de hijos en paralelo {#parallel-child-barrier}

Importa `use function Workflow\V2\all;` y `use function Workflow\V2\child;` para que un paso del padre espere varios hijos juntos.

```php
use function Workflow\V2\all;
use function Workflow\V2\child;
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle(): array
    {
        $children = all([
            fn () => child(FirstChildWorkflow::class),
            fn () => child(SecondChildWorkflow::class),
        ]);

        return $children;
    }
}
```

La forma exclusiva de hijos sigue siendo útil cuando todos los miembros paralelos son workflows hijos:

- espera al grupo completo como un paso del padre;
- conserva el orden original del array en los resultados;
- lanza en el padre el cierre no satisfactorio seleccionado, desempatando por la hora de cierre más temprana y luego el menor índice.

Para combinar hijos y actividades en el mismo paso de reunión, usa una barrera mixta `all([...])`. Las esperas comparten `parallel_group_id` y Waterline la etiqueta `parallel_group_kind = mixed`. Si un subgrupo mixto o de hijos está dentro de otro `all([...])`, el grupo más interno determina `parallel_group_id` y `parallel_group_path` conserva la ruta completa de fuera hacia dentro.

## Contrato de identidad {#identity-contract}

- `child()->id()` y `target_name` en Waterline son el id de instancia del hijo, estable a lo largo de su cadena de ejecuciones.
- `child_call_id` identifica la invocación emitida por el padre y sigue estable aunque el hijo use `continueAsNew()`.
- `resume_source_id`, `child_workflow_run_id` y las rutas de ejecución seleccionada apuntan a una ejecución concreta del hijo dentro de esa cadena.

## Referencias a hijos {#child-handles}

Cuando el padre alcanza duraderamente un paso de hijo, puede inspeccionar esa invocación mediante `ChildWorkflowHandle`.

```php
use Workflow\UpdateMethod;
use function Workflow\V2\child;
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle()
    {
        return child(ApprovalWorkflow::class);
    }

    #[UpdateMethod('approve-child')]
    public function approveChild(string $approvedBy): void
    {
        $this->child()?->signal('approved-by', $approvedBy);
    }
}
```

- `$this->child()` devuelve la última referencia visible o `null`.
- `$this->children()` devuelve todas las visibles en orden de pasos.
- En barreras `all([fn () => child(...)])`, aparecen en el orden de llamadas de hijo, y `$this->child()` devuelve la última visible.
- `runId()` sigue el último `ChildRunStarted` registrado por el padre en esa cadena. Un padre que espera a un hijo que continuó como nueva ejecución ve su último id sin perder el `callId()` original.

## Disponibilidad de referencias {#handle-availability}

Las referencias se basan en historial, no en especulación:

- Antes de alcanzar duraderamente un paso de hijo, `$this->child()` devuelve `null` y `$this->children()` una lista vacía.
- Tras registrar la programación o inicio del hijo, la referencia es visible para consultas, actualizaciones y reproducciones posteriores.
- La reproducción de consultas nunca despacha señales de hijo desde actualizaciones registradas; solo restaura el estado en memoria derivado del historial confirmado.

## Visibilidad en Waterline {#waterline-visibility}

Cuando el padre espera un hijo, Waterline lo muestra como espera de hijo, no como otro tipo de tarea:

- el resumen informa `wait_kind = child` y `liveness_state = waiting_for_child`;
- `waits` incluye `kind = child`, el `child_call_id` estable, el id de instancia hijo en `target_name` y el id de ejecución hijo en `resume_source_id`;
- con varias esperas abiertas, el detalle también expone `open_wait_count`;
- las esperas creadas por una barrera mixta o de hijos comparten `parallel_group_id` y exponen `parallel_group_kind`, `parallel_group_base_sequence`, `parallel_group_size` y `parallel_group_index`;
- las esperas anidadas exponen `parallel_group_path`, ordenado desde la barrera exterior hasta la interior;
- `timeline` incluye eventos tipados como `ChildWorkflowScheduled`, `ChildRunStarted`, `ChildRunCompleted` y `ChildRunFailed`, con el mismo `child_call_id`;
- las esperas abiertas y el linaje prefieren el historial tipado `ChildWorkflowScheduled` / `ChildRunStarted` del padre, conservan una entrada lógica por `child_call_id` y siguen la última ejecución hija registrada por el padre aunque desaparezcan filas copiadas de `workflow_links` o cambie el `current_run_id` mutable del hijo después de confirmar el historial;
- tras registrar un evento tipado de resolución del hijo, el detalle mantiene resuelta la espera desde el historial del padre aunque cambie la fila mutable del hijo. El historial terminal del hijo o los enlaces heredados pueden complementar linaje y diagnóstico, pero no sustituyen el historial tipado del paso en el padre que necesita la reproducción;
- tras ese evento, el linaje seleccionado y la exportación también conservan desde el historial padre el tipo, clase, número de ejecución, grupo de estado y motivo de cierre del hijo, sin releer esos campos de su fila mutable;
- si existe una fila terminal o enlace del hijo pero el padre carece de historial tipado `ChildWorkflowScheduled`, `ChildRunStarted`, `ChildRunCompleted`, `ChildRunFailed`, `ChildRunCancelled` o `ChildRunTerminated` para ese paso, la reproducción de workers y consultas se bloquea con `history_shape_mismatch` y eventos registrados `no typed history`. Waterline marca la espera seleccionada `status = unsupported`, expone `history_authority = unsupported_terminal_without_history` y `history_unsupported_reason = terminal_child_link_without_typed_parent_history`, y muestra la identidad del hijo desde la tarea bloqueada o el linaje alternativo cuando sea posible;
- si se pierde la fila de tarea de reanudación del padre después del evento de resolución, el detalle sigue en `repair_needed`, expone una tarea sintética ausente con `workflow_wait_kind = child`, `child_call_id` y `child_workflow_run_id`, y `repair()`, `workflow:v2:repair-pass` o la reparación del bucle del worker recrean la misma tarea desde el historial tipado del padre;
- los arrays de linaje exponen la relación padre/hijo junto a enlaces de continuación como nueva ejecución, y las entradas de hijos llevan el mismo `child_call_id`.

## Política de cierre del padre {#parent-close-policy}

Cuando el padre se cierra por finalización, fallo, vencimiento, cancelación o terminación, cada hijo abierto se trata según su **política de cierre del padre**. Se fija por llamada y controla qué ocurre con el hijo al salir la ejecución padre.

| Política | Valor | Comportamiento |
|---|---|---|
| Abandonar | `abandon` | El hijo sigue independientemente. Es la predeterminada. |
| Solicitar cancelación cooperativa | `request_cancellation` | El hijo recibe una solicitud de limpieza cooperativa con el linaje y plazo originales de cancelación del padre. |
| Solicitar cancelación terminal | `request_cancel` | Se envía un comando de cancelación al hijo al cerrar el padre. |
| Terminar | `terminate` | Se envía un comando de terminación al hijo al cerrar el padre. |

### Política predeterminada {#default-policy}

Una llamada `child()` sin `ChildWorkflowOptions` usa siempre `ParentClosePolicy::Abandon`. Los helpers compatibles a nivel de código fuente `Workflow\V2\child()`, `Workflow\V2\Workflow::child()` y `Workflow\V2\Workflow::executeChildWorkflow()` crean opciones predeterminadas si el primer argumento no es `ChildWorkflowOptions`, con `parentClosePolicy` en `ParentClosePolicy::Abandon`. Lo mismo ocurre en cada clausura `child()` de una barrera `all([...])` sin opciones. Sustitúyela pasando explícitamente `ChildWorkflowOptions` como se muestra abajo.

### Establecer la política {#setting-the-policy}

Pasa `ChildWorkflowOptions` como primer argumento de `child()`:

```php
use function Workflow\V2\child;
use Workflow\V2\Enums\ParentClosePolicy;
use Workflow\V2\Support\ChildWorkflowOptions;
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle(): array
    {
        $options = new ChildWorkflowOptions(
            parentClosePolicy: ParentClosePolicy::RequestCancel,
        );

        return child(ChildWorkflow::class, $options, 'argument1');
    }
}
```

El mismo patrón funciona con clausuras de `all()` para barreras paralelas:

```php
use function Workflow\V2\all;
use function Workflow\V2\child;
use Workflow\V2\Enums\ParentClosePolicy;
use Workflow\V2\Support\ChildWorkflowOptions;

$cancelOptions = new ChildWorkflowOptions(
    parentClosePolicy: ParentClosePolicy::RequestCancel,
);

$results = all([
    fn () => child(FirstChild::class, $cancelOptions),
    fn () => child(SecondChild::class, $cancelOptions, 'arg'),
]);
```

### Funcionamiento {#how-it-works}

- La política se registra en `workflow_links` (`parent_close_policy`) y en la carga del evento `ChildWorkflowScheduled`.
- Al cerrar el padre por cualquier motivo, el motor consulta enlaces abiertos cuya política no sea abandonar y envía a cada hijo el comando correspondiente (solicitud cooperativa, cancelación o terminación).
- Si el hijo ya se cerró, se omite silenciosamente el comando.
- La aplicación es de mejor esfuerzo: rechazar un comando del hijo (por ejemplo, ya terminal) no afecta al cierre padre. El éxito registra `ParentClosePolicyApplied` en el padre; el fallo registra `ParentClosePolicyFailed` para distinguir ambos resultados.
- Continuar como nueva ejecución **no** activa la política, porque la instancia sigue activa bajo otra ejecución.

### Matriz de disposiciones del padre {#parent-disposition-matrix}

La política actúa en toda disposición terminal del padre, pero no en ejecuciones aún activas o traspasadas a una continuación. El motor aplica el mismo comportamiento a todas las disposiciones terminales: ejecuta la política de cada enlace hijo abierto que no sea abandonar.

| Disposición del padre | ¿Se aplica? | Notas |
|---|---|---|
| Completado | Sí | Tras registrar `WorkflowCompleted`. Una llamada secuencial `child()` siempre espera al hijo, por lo que una finalización natural suele carecer de hijos abiertos; aun así se aplica como pasada de seguridad. |
| Fallido | Sí | Tras registrar `WorkflowFailed` por un fallo terminal de tarea de workflow. |
| Plazo vencido | Sí | Tras `WorkflowTimedOut` en cierres por plazo de ejecución o plazo global del workflow. |
| Cancelado | Sí | Después de que el comando aceptado `CancelRequested` cierre al padre. |
| Terminado | Sí | Después de que el comando aceptado `TerminateRequested` cierre al padre. |
| Continuar como nueva ejecución | No | La instancia sigue activa en la nueva ejecución; los enlaces hijos se redirigen conservando su política. |
| Restablecer | No aplicable actualmente | El runtime v2 no expone un comando independiente ni disposición terminal de restablecimiento. Una futura operación de restablecimiento o reparación que cierre o sustituya al padre debe definir si transfiere la propiedad de los hijos; si la anterior queda terminal, debe aplicar la política antes de dejar de poseer hijos abiertos. |

### Cuándo usar cada política {#when-to-use-each-policy}

**Abandonar** (predeterminada) es adecuada si el hijo representa trabajo independiente que debe completarse con independencia del padre, como una notificación o limpieza obligatoria.

**Solicitar cancelación cooperativa** usa `ParentClosePolicy::RequestCancellation` para limpieza cooperativa. Conserva la identidad raíz y el plazo inmutable de una solicitud de cancelación del padre ya existente. Si se cierra sin ella, registra un presupuesto compartido de 600 segundos desde la fecha de cierre registrada. Repetir la aplicación no concede más tiempo. Consulta la capacidad de workers y el contrato de limpieza del modo servicio en [Cancelación cooperativa](/docs/polyglot/cancellation).

**Solicitar cancelación terminal** aplica `cancel()` al hijo al cerrar el padre. Pese al nombre de la política, no entrega la solicitud cooperativa separada `requestCancellation()`. El hijo no puede ejecutar limpieza ni compensación de workflow tras cerrar su ejecución. Completa la compensación antes de cerrar al padre o usa **Abandonar** para limpieza independiente.

**Terminar** es adecuada si los hijos deben parar inmediatamente. Úsala para hijos auxiliares sin valor independiente tras cerrar al padre.

### Visibilidad en Waterline {#waterline-visibility-1}

Waterline muestra `parent_close_policy` en:

- la entrada del enlace hijo en el linaje de la ejecución padre;
- la carga de la entrada `ChildWorkflowScheduled` en la cronología;
- el evento `CancelRequested` o `TerminateRequested` del hijo al aplicar la política, con un motivo que identifica el cierre del padre.

## Limitaciones actuales {#current-limitations}

La superficie actual no incluye:

- funciones integradas de concurrencia limitada más allá de las barreras actuales `all([fn () => child(...)])`, `all([fn () => activity(...)])` y mixtas `all([fn () => child(...), fn () => activity(...)])`.

Se admiten referencias duraderas a pasos de hijo ya alcanzados, pero aún no hay API de mayor nivel para lanzar y obtener referencias o limitar concurrencia más allá de `child(...)` y `all([...])`.

## Ejecutar este patrón {#run-this-pattern}

El workflow de coordinación de microservicios de la [Aplicación de ejemplo](/docs/sample-app) es la referencia ejecutable de orquestación padre/hijo entre aplicaciones:

```bash
php artisan app:microservice
```

`App\Workflows\Microservice\MicroserviceWorkflow` ejecuta al padre en la aplicación Laravel principal y despacha trabajo hijo al worker de microservicio incluido. Abre Waterline durante la ejecución para ver los enlaces hijos bajo el padre y la política de cierre en el linaje, como describe esta página.
