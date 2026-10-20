---
sidebar_position: 14
tags:
  - continue-as-new
  - history
  - message-streams
  - workflows
keywords:
  - continuar como nueva ejecución
  - crecimiento del historial del workflow
  - traspaso de ejecución
  - traspaso de flujo de mensajes
---

# Continuar como nueva ejecución {#continue-as-new}

El patrón **Continuar como nueva ejecución** permite que un workflow activo se reinicie con nuevos argumentos. Es útil para:

* Evitar que el historial crezca sin límite.
* Modelar bucles iterativos o workflows recursivos.
* Dividir workflows prolongados en ejecuciones más pequeñas y manejables conservando la continuidad.

## Usar `continueAsNew` {#using-continueasnew}

Para reiniciar como nueva ejecución, llama a `continueAsNew(...)` dentro de `handle()`. Es una transición de ejecución de primera clase.

```php
use function Workflow\V2\activity;
use function Workflow\V2\continueAsNew;
use Workflow\V2\Workflow;

class CounterWorkflow extends Workflow
{
    public function handle(int $count = 0, int $max = 3)
    {
        $result = activity(CountActivity::class, $count);

        if ($count >= $max) {
            return [
                'count' => $result,
                'workflow_id' => $this->workflowId(),
                'run_id' => $this->runId(),
            ];
        }

        return continueAsNew($count + 1, $max);
    }
}
```

En este ejemplo:

* El workflow ejecuta una actividad en cada iteración.
* Si no ha alcanzado el máximo, continúa como nueva ejecución con argumentos incrementados.
* Solo devuelve el resultado final al terminar el bucle.

Al continuar como nueva ejecución:

- El id de instancia sigue estable; `WorkflowStub::runId()` avanza a la ejecución más reciente.
- La ejecución anterior se cierra como `completed` / `continued` y la siguiente empieza de inmediato con un nuevo id.
- Las señales, consultas, actualizaciones y comandos del operador a nivel de instancia resuelven la ejecución duradera más reciente. Los dirigidos explícitamente a una ejecución siguen vinculados a ella.

Core 2.7.0 y los Servers compatibles conservan las señales recibidas a nivel de instancia cuyo manejador esté declarado en el contrato de comandos y que la ejecución antigua aún no haya aplicado. Se transfieren con las actualizaciones aceptadas pendientes en el orden original de comandos. No cambian los IDs de señal y comando, bytes de argumentos ni fechas de recepción. Una señal ya aplicada no vuelve a entregarse a la sucesora. Conserva el estado de negocio necesario en los argumentos de `continueAsNew()`; el estado local arbitrario no se copia automáticamente.

Una señal dirigida a una ejecución nunca cambia de destino. Si no puede aplicarse antes del cierre, recibe el rechazo explícito descrito en [aceptación y cierre de señales](./signals.md#acceptance-and-closure). La ausencia de declaraciones heredadas no autoriza su traspaso; esas señales se cierran explícitamente en la predecesora.

Los bucles prolongados pueden desprenderse del historial sin inventar otro id público de workflow en cada transición.

## Presupuesto de historial {#history-budget}

El código puede observar la longitud actual del historial y una sugerencia de continuación mediante contexto explícito del runtime. Así puede traspasar deliberadamente antes de alcanzar límites costosos.

```php
use function Workflow\V2\activity;
use function Workflow\V2\continueAsNew;
use Workflow\V2\Workflow;

class PollingWorkflow extends Workflow
{
    public function handle(int $iteration = 0)
    {
        $result = activity(PollActivity::class);

        if ($this->shouldContinueAsNew()) {
            return continueAsNew($iteration + 1);
        }

        return ['result' => $result, 'iteration' => $iteration];
    }
}
```

### Métodos disponibles {#available-methods}

| Método | Tipo de retorno | Descripción |
| --- | --- | --- |
| `$this->historyLength()` | `int` | Número de eventos de historial de la ejecución actual |
| `$this->historySize()` | `int` | Tamaño total de los eventos en bytes |
| `$this->shouldContinueAsNew()` | `bool` | `true` cuando supera el presupuesto configurado de cantidad o bytes |

### Configuración {#configuration}

Los umbrales de recomendación son configurables:

```php
// config/workflows.php
'v2' => [
    'history_budget' => [
        'continue_as_new_event_threshold' => 10000,
        'continue_as_new_size_bytes_threshold' => 5242880, // 5 MB
    ],
],
```

`shouldContinueAsNew()` devuelve `true` al superar cualquiera. Los resúmenes también registran `history_event_count`, `history_size_bytes` y `continue_as_new_recommended` para que Waterline señale ejecuciones largas en las vistas de flota.

## Conservación de metadatos {#metadata-carry-forward}

Al continuar, la nueva ejecución hereda automáticamente los metadatos de la anterior:

| Metadatos | Comportamiento de conservación |
| --- | --- |
| Atributos de búsqueda | Se conserva el mapa combinado completo, incluidas las inserciones/actualizaciones durante la ejecución |
| Memo | Se conserva el mapa combinado completo, incluidas las inserciones/actualizaciones durante la ejecución |
| Etiquetas de visibilidad | Se conservan sin cambios (se fijan una vez al iniciar) |
| Clave de negocio | Se conserva sin cambios |
| Marcador de compatibilidad | Se conserva para dirigir la nueva ejecución a la misma compilación de worker |
| Posición del cursor de mensajes | Se conserva para saber qué mensajes entrantes ya se consumieron mediante [Flujos de mensajes](./message-streams.md) |

La nueva ejecución comienza con esos metadatos y puede seguir actualizando atributos de búsqueda y memo. Así, un workflow de sondeo prolongado acumula metadatos entre generaciones sin perder estado al desprenderse del historial.

```php
use function Workflow\V2\{activity, continueAsNew, upsertMemo, upsertSearchAttributes};
use Workflow\V2\Workflow;

class PollingWorkflow extends Workflow
{
    public function handle(int $iteration = 0)
    {
        $result = activity(PollActivity::class);

        upsertSearchAttributes(['iteration' => (string) $iteration, 'status' => 'polling']);
        upsertMemo(['last_result' => $result, 'iteration' => $iteration]);

        if ($this->shouldContinueAsNew()) {
            // The new run inherits all search attributes and memo
            return continueAsNew($iteration + 1);
        }

        return ['result' => $result, 'iteration' => $iteration];
    }
}
```

Para bucles prolongados de intervención humana o asistentes, prefiere la fachada de primera clase `$this->inbox()` / `$this->outbox()` de [Flujos de mensajes](./message-streams.md). Los mensajes pendientes y el cursor pasan a la nueva ejecución; los consumidos permanecen en la original como evidencia histórica.
