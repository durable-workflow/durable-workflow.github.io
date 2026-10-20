---
sidebar_position: 6
title: API de workflow
sidebar_label: API de workflow
description: Referencia de la API de workflow.
tags:
  - reference
  - workflows
  - api
keywords:
  - API de workflow
---

# API de workflow {#workflow-api}

Esta página contiene la referencia completa. Para una lectura más sencilla, consulta la página de cada función.

- [Workflows](./workflows.md): estructura de la clase y modelo de orquestación determinista.
- [Actividades](./activities.md): efectos secundarios, reintentos y enrutamiento.
- [Actividades locales](../features/local-activities.md): trabajo breve en el
  mismo proceso con historial de actividad y semántica de reintentos.
- [Señales](../features/signals.md), [Actualizaciones](../features/updates.md) y
  [Consultas](../features/queries.md): contratos que expone el workflow.
- [Temporizadores](../features/timers.md),
  [Esperas por condición](../features/condition-waits.md) y
  [Continuar como nueva ejecución](../features/continue-as-new.md): control del
  flujo de larga duración.
- [Flujos de mensajes](../features/message-streams.md): mensajes repetidos y
  ordenados con semántica de cursor.

## Más información para IA {#more-info-for-ai}

La mayoría de lectores puede omitir el desplegable siguiente. Ábrelo si necesitas
firmas exactas, contratos de retorno, notas para uso automatizado o toda la API
en un solo lugar.

<details id="workflow-api-details">
<summary><b>Más información para IA</b></summary>

**Objeto base de workflow**

```php
use Workflow\V2\Workflow;

abstract class Workflow
{
    public ?string $connection = null;
    public ?string $queue = null;

    public function workflowId(): string;
    public function runId(): string;
    public function lastChild(): ?ChildWorkflowHandle;
    public function children(): array;
    public function historyLength(): int;
    public function historySize(): int;
    public function shouldContinueAsNew(): bool;
}
```

| Miembro | Cuándo usarlo | Contrato de retorno |
| --- | --- | --- |
| `workflowId()` | El workflow necesita su id público estable de instancia. | Cadena con el id de instancia, invariable al continuar como nueva ejecución. |
| `runId()` | El workflow necesita el id de la ejecución actual. | Cadena con el id de la ejecución seleccionada. |
| `lastChild()` | El workflow necesita enviar una señal al último hijo creado. | `ChildWorkflowHandle` o `null`. |
| `children()` | El workflow necesita referencias a los hijos visibles en la secuencia actual de reproducción. | Lista de `ChildWorkflowHandle`. |
| `historyLength()` | El workflow necesita una señal del presupuesto de historial por cantidad. | Número actual de eventos de historial. |
| `historySize()` | El workflow necesita una señal del presupuesto de historial por bytes. | Tamaño aproximado del historial guardado en bytes. |
| `shouldContinueAsNew()` | El workflow debe rotar antes de encarecer el historial. | `true` cuando los presupuestos de historial configurados recomiendan rotar. |

## Comandos durables {#durable-commands}

La fachada estática delega en funciones auxiliares del espacio `Workflow\V2`.
Ambas formas son equivalentes:

```php
use Workflow\V2\Workflow;
use function Workflow\V2\activity;

$resultFromFacade = Workflow::activity(SendReceipt::class, $orderId);
$resultFromHelper = activity(SendReceipt::class, $orderId);
```

<span id="durable-command-surface"></span>

| Fachada | Función auxiliar | Firma | Efecto durable |
| --- | --- | --- | --- |
| `Workflow::activity()` | `activity()` | `activity(string $activity, mixed ...$arguments): mixed` | Programa una actividad y espera su resultado. |
| `Workflow::executeActivity()` | `activity()` | `executeActivity(string $activity, mixed ...$arguments): mixed` | Alias de `activity()`. |
| `Workflow::localActivity()` | `localActivity()` | `localActivity(string $activity, mixed ...$arguments): mixed` | Ejecuta una actividad breve en el proceso actual del worker de workflow y registra historial con `execution_mode=local`. |
| `Workflow::executeLocalActivity()` | `localActivity()` | `executeLocalActivity(string $activity, mixed ...$arguments): mixed` | Alias de `localActivity()`. |
| `Workflow::child()` | `child()` | `child(string $workflow, ChildWorkflowOptions? $options = null, mixed ...$arguments): mixed` | Inicia un workflow hijo y espera su resultado. Pasa `ChildWorkflowOptions` como primer argumento para establecer la política de cierre del padre (predeterminada: `ParentClosePolicy::Abandon`) o sustituir el enrutamiento del hijo. |
| `Workflow::executeChildWorkflow()` | `child()` | `executeChildWorkflow(string $workflow, ChildWorkflowOptions? $options = null, mixed ...$arguments): mixed` | Alias de `child()`. |
| `Workflow::async()` | `async()` | `async(callable $callback): mixed` | Ejecuta un callable como workflow hijo generado automáticamente. |
| `Workflow::all()` | `all()` | `all(iterable $calls): mixed` | Espera llamadas concurrentes y devuelve resultados en orden de iteración. |
| `Workflow::parallel()` | `all()` | `parallel(iterable $calls): mixed` | Alias de `all()`. |
| `Workflow::select()` | `select()` | `select(iterable $calls): SelectionResult` | Inicia llamadas durables independientes y devuelve el primer ganador confirmado junto con referencias estables a cada miembro. |
| `Workflow::await()` | `await()` | `await(callable\|string $condition, int\|string\|CarbonInterval\|null $timeout = null, ?string $conditionKey = null): mixed` | Espera una señal con nombre o una condición segura para la reproducción. |
| `Workflow::awaitWithTimeout()` | `await()` | `awaitWithTimeout(int\|string\|CarbonInterval $timeout, callable\|string $condition, ?string $conditionKey = null): mixed` | Espera una señal o condición con tiempo de espera explícito. |
| `Workflow::awaitSignal()` | `await()` | `awaitSignal(string $name): mixed` | Espera una señal con nombre. |
| `Workflow::timer()` | `timer()` | `timer(int\|string\|CarbonInterval $duration): mixed` | Suspende hasta que avance el tiempo durable. |
| `Workflow::sideEffect()` | `sideEffect()` | `sideEffect(callable $callback): mixed` | Registra un resultado no determinista en el historial y lo reproduce. |
| `Workflow::uuid4()` | `uuid4()` | `uuid4(): mixed` | Genera un UUIDv4 estable al reproducir. |
| `Workflow::uuid7()` | `uuid7()` | `uuid7(): mixed` | Genera un UUIDv7 estable al reproducir. |
| `Workflow::continueAsNew()` | `continueAsNew()` | `continueAsNew(mixed ...$arguments): mixed` | Termina la ejecución actual e inicia otra para la misma instancia. |
| `Workflow::getVersion()` | `getVersion()` | `getVersion(string $changeId, int $minSupported = WorkflowStub::DEFAULT_VERSION, int $maxSupported = 1): mixed` | Negocia una versión del código de workflow segura para la reproducción. |
| `Workflow::patched()` | `patched()` | `patched(string $changeId): mixed` | Indica si la ejecución cruzó un marcador de parche con nombre. |
| `Workflow::deprecatePatch()` | `deprecatePatch()` | `deprecatePatch(string $changeId): mixed` | Mantiene un marcador de parche después de eliminar el código antiguo. |
| `Workflow::upsertMemo()` | `upsertMemo()` | `upsertMemo(array $entries): void` | Actualiza metadatos no indexados de ejecución. |
| `Workflow::upsertSearchAttributes()` | `upsertSearchAttributes()` | `upsertSearchAttributes(array $attributes): void` | Actualiza metadatos indexados visibles para el operador. |
| `Workflow::now()` | `now()` | `now(): CarbonInterface` | Lee el tiempo determinista del workflow. |

`activity()` y `executeActivity()` programan tareas de actividad durables en cola.
`localActivity()` y `executeLocalActivity()` se ejecutan en el proceso actual del
worker de workflow y registran historial normal de actividad con el marcador local.
Usa `sideEffect()` para instantáneas seguras para la reproducción que no deban usar
reintentos, tiempos de espera, latidos o cancelación de actividades. Usa
`Workflow::workerSession()` o `Workflow\V2\workerSession()` si varios pasos de
actividad ordinarios necesitan el contrato de afinidad de sesión de worker.
Consulta el contrato completo en [Modelo de ejecución de actividades](/docs/features/activity-execution-model),
[Actividades locales](/docs/features/local-activities) y
[Sesiones de worker](/docs/features/worker-sessions).

**Funciones auxiliares de temporizadores**

Estas funciones son abreviaturas de `timer()` y `Workflow::timer()`:

```php
use Workflow\V2\Workflow;

Workflow::seconds(30);
Workflow::minutes(5);
Workflow::hours(2);
Workflow::days(1);
Workflow::weeks(1);
Workflow::months(1);
Workflow::years(1);
```

| Función auxiliar | Equivalente |
| --- | --- |
| `seconds(int $seconds)` | `timer($seconds)` |
| `minutes(int $minutes)` | `timer($minutes * 60)` |
| `hours(int $hours)` | `timer($hours * 3600)` |
| `days(int $days)` | `timer($days * 86400)` |
| `weeks(int $weeks)` | `timer($weeks * 604800)` |
| `months(int $months)` | `timer("{$months} months")` |
| `years(int $years)` | `timer("{$years} years")` |

Usa llamadas explícitas a `timer()` cuando la duración provenga de configuración
o de la entrada del workflow. Usa las funciones auxiliares para expresar en el
código una espera fija del negocio.

**Flujos de mensajes**

Abre flujos de mensajes durables desde la instancia del workflow:

```php
use Workflow\V2\MessageStream;
use Workflow\V2\Workflow;

final class AssistantWorkflow extends Workflow
{
    public function handle(string $targetWorkflowId): array
    {
        $message = $this->inbox('ai.user')->receiveOne();

        if ($message === null) {
            return ['status' => 'waiting'];
        }

        $reply = $this->outbox('ai.assistant')->sendReference(
            targetInstanceId: $targetWorkflowId,
            payloadReference: 'app://payloads/reply-123',
            correlationId: $this->workflowId(),
            idempotencyKey: 'reply-123',
            metadata: ['kind' => 'assistant_reply'],
        );

        return [
            'status' => 'sent',
            'stream' => $reply->stream_key,
            'sequence' => $reply->sequence,
        ];
    }
}
```

| Método | Firma | Contrato |
| --- | --- | --- |
| `$this->messages()` | `messages(?string $streamKey = null, ?MessageService $messages = null): MessageStream` | Abre el flujo para leer o enviar. |
| `$this->inbox()` | `inbox(?string $streamKey = null, ?MessageService $messages = null): MessageStream` | Alias para código de recepción. |
| `$this->outbox()` | `outbox(?string $streamKey = null, ?MessageService $messages = null): MessageStream` | Alias para código de envío. |
| `MessageStream::key()` | `key(): string` | Devuelve la clave del flujo. |
| `MessageStream::cursor()` | `cursor(): int` | Devuelve la posición del cursor durable de esta ejecución. |
| `MessageStream::hasPending()` | `hasPending(): bool` | Indica si existen mensajes sin consumir. |
| `MessageStream::pendingCount()` | `pendingCount(): int` | Devuelve la cantidad de mensajes sin consumir. |
| `MessageStream::peek()` | `peek(int $limit = 100): Collection` | Lee mensajes pendientes sin consumirlos. |
| `MessageStream::receive()` | `receive(int $limit = 1, ?int $consumedBySequence = null): Collection` | Lee y consume mensajes, registrando el avance del cursor. |
| `MessageStream::receiveOne()` | `receiveOne(?int $consumedBySequence = null): ?WorkflowMessage` | Lee y consume un mensaje. |
| `MessageStream::sendReference()` | `sendReference(string $targetInstanceId, ?string $payloadReference = null, MessageChannel\|string $channel = MessageChannel::WorkflowMessage, ?string $correlationId = null, ?string $idempotencyKey = null, array $metadata = [], ?DateTimeInterface $expiresAt = null): WorkflowMessage` | Envía a otra instancia un mensaje ordenado con referencia a la carga útil. |

Usa flujos de mensajes para mensajes repetidos y ordenados con semántica de cursor.
Usa [Señales](../features/signals.md) para eventos externos puntuales y
[Actualizaciones](../features/updates.md) para mutaciones con solicitud y respuesta.

**Atributos y contratos públicos**

```php
use Workflow\QueryMethod;
use Workflow\UpdateMethod;
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

#[Type('order-approval')]
#[Signal('approved-by', [
    ['name' => 'approvedBy', 'type' => 'string', 'allows_null' => false],
])]
final class OrderApprovalWorkflow extends Workflow
{
    private string $stage = 'waiting';

    public function handle(): void
    {
        $this->stage = Workflow::awaitSignal('approved-by');
    }

    #[QueryMethod('current-stage')]
    public function currentStage(): string
    {
        return $this->stage;
    }

    #[UpdateMethod('mark-ready')]
    public function markReady(): string
    {
        return $this->stage = 'ready';
    }
}
```

| Atributo | Destino | Contrato estable |
| --- | --- | --- |
| `#[Type('type-key')]` | Clase de workflow o actividad | Declara la clave de tipo durable independiente del lenguaje. |
| `#[Signal('signal-name', [...])]` | Clase de workflow, repetible | Declara los nombres de señal aceptados y contratos opcionales de parámetros ordenados. |
| `#[QueryMethod('query-name')]` | Método de workflow | Declara un nombre de consulta seguro para la reproducción. Omítelo para usar el nombre del método PHP. |
| `#[UpdateMethod('update-name')]` | Método de workflow | Declara un nombre de actualización seguro para la reproducción. Omítelo para usar el nombre del método PHP. |

Las señales, consultas y actualizaciones son contratos públicos. Prefiere nombres
explícitos para que renombrar métodos PHP no rompa la API.

**Superficie de fallos**

Los fallos de la API de autoría son fallos durables del workflow, salvo que el
comando se rechace antes de ejecutarse:

| Superficie | Fallo habitual | Significado para el operador |
| --- | --- | --- |
| `activity()` | La actividad lanza una excepción, vence su plazo o agota los reintentos. | La ejecución registra el fallo de actividad en el historial y sigue el manejo de errores del workflow. |
| `child()` | El hijo falla, se cancela, termina o agota su plazo. | El padre observa un resultado de fallo del hijo en el comando que espera. |
| `await()` | Vence el plazo antes de satisfacerse la condición o señal. | La espera devuelve un valor o falla según la forma elegida. |
| `timer()` | La duración normalizada no es válida. | El código debe pasar duraciones positivas o esperas explícitas de duración cero. |
| `continueAsNew()` | No se puede crear la nueva ejecución. | La ejecución actual conserva la evidencia de la transición fallida. |
| `upsertSearchAttributes()` | La clave, cantidad o tamaño total de atributos supera los límites. | La ejecución falla antes de guardar metadatos indexados no válidos. |
| `MessageStream::receive()` | No hay una secuencia positiva de historial disponible. | La recepción debe ocurrir durante la ejecución del workflow, no desde código directo de servicio. |
| `MessageStream::sendReference()` | La referencia de carga, ruta o contrato de almacenamiento no es válido en el destino. | El orden de mensajes es independiente de la integridad del almacén de cargas útiles. |

Consulta los límites de cargas e historial en [Límites estructurales](../constraints/structural-limits.md).
Para respuestas de rechazo de comandos fuera del código PHP del workflow,
consulta [Referencia de la API del servidor](../polyglot/server-api-reference.md).

**Reglas de determinismo**

El código del workflow debe ser seguro para la reproducción. Encapsula el trabajo
irreversible o no determinista en comandos durables:

```php
use Workflow\V2\Workflow;

final class DeterministicWorkflow extends Workflow
{
    public function handle(): array
    {
        $workflowTime = Workflow::now();
        $stableId = Workflow::uuid7();
        $remoteQuote = Workflow::activity(FetchQuote::class);

        return [
            'time' => $workflowTime->toIso8601String(),
            'id' => $stableId,
            'quote' => $remoteQuote,
        ];
    }
}
```

- Usa `Workflow::now()` en lugar del reloj real en las bifurcaciones del workflow.
- Usa `Workflow::uuid4()` o `Workflow::uuid7()` en lugar de aleatoriedad directa.
- Coloca las llamadas de red, escrituras de archivos, envíos de correo y efectos
  secundarios externos en actividades.
- Usa `Workflow::sideEffect()` solo si el valor debe capturarse en el historial
  y el efecto en sí no es la acción de negocio.
- Usa `Workflow::getVersion()`, `Workflow::patched()` y
  `Workflow::deprecatePatch()` para evolucionar el código sin romper la reproducción.

</details>
