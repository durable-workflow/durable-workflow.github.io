---
sidebar_position: 2
---

import QuerySimulator from '@site/src/components/QuerySimulator';

# Consultas {#queries}

Las consultas recuperan información del estado actual de un workflow sin afectar su ejecución. Son útiles para supervisar y depurar.

## Métodos de consulta seguros para la reproducción {#replay-safe-query-methods}

Las consultas reproducen el historial confirmado de la ejecución seleccionada y después invocan el método anotado en el objeto de workflow reconstruido. No aplican implícitamente señales o actualizaciones aceptadas pero aún no aplicadas.

```php
use Workflow\QueryMethod;
use Workflow\V2\Workflow;
use function Workflow\V2\await;

final class ApprovalWorkflow extends Workflow
{
    private string $stage = 'booting';

    public function handle(): void
    {
        $this->stage = 'waiting-for-approval';

        await('approved-by');

        $this->stage = 'approved';
    }

    #[QueryMethod('current-stage')]
    public function currentStage(): string
    {
        return $this->stage;
    }

    #[QueryMethod('starts-with')]
    public function startsWith(string $prefix): bool
    {
        return str_starts_with($this->stage, $prefix);
    }
}
```

Dirígete a la ejecución actual mediante el id público de instancia:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$workflow->currentStage(); // "waiting-for-approval"
$workflow->query('starts-with', 'waiting'); // true
$workflow->queryWithArguments('starts-with', ['prefix' => 'waiting']); // true
```

Para fijar explícitamente una ejecución histórica o seleccionada, consulta mediante `loadRun($runId)`:

```php
$selectedRun = WorkflowStub::loadRun($runId);

$selectedRun->currentStage();
```

Comportamiento de las consultas:

- Son seguras para la reproducción: solo observan historial confirmado y no modifican el estado.
- Los argumentos se pasan al método anotado. Declara un nombre público estable con `#[QueryMethod('public-name')]` para que siga disponible aunque se renombre el método PHP.
- `load($instanceId)` consulta la ejecución duradera más reciente de la instancia; `loadRun($runId)` se dirige a una ejecución concreta (útil antes de continuar como nueva ejecución).
- Las señales y actualizaciones aceptadas pero aún no aplicadas aparecen en el historial de comandos, pero no cuentan como estado aplicado hasta que el worker registra `SignalApplied` / `UpdateApplied`.

Para definir un método de consulta, usa la anotación `QueryMethod`. El argumento de cadena opcional fija un nombre público duradero que sobrevive a los cambios de nombre del método PHP:

```php
use Workflow\QueryMethod;
use Workflow\V2\Workflow;

final class MyWorkflow extends Workflow
{
    private bool $ready = false;

    #[QueryMethod('is-ready')]
    public function getReady(): bool
    {
        return $this->ready;
    }
}
```

Para consultar, llama al método en la instancia del workflow. Devuelve los datos del workflow.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$ready = $workflow->getReady();
$sameReady = $workflow->query('is-ready');
```

Usa `queryWithArguments()` cuando ya tengas una lista posicional o un mapa de parámetros con nombre:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$workflow->queryWithArguments('starts-with', [
    'prefix' => 'wait',
]);
```

Waterline usa el contrato de consultas de la ejecución seleccionada. El panel expone `declared_query_targets[*]` junto a señales y actualizaciones, pero solo muestra la ejecución de consultas si `can_query = true`. El operador de consulta de ejecución seleccionada o actual envía `arguments` JSON a `/waterline/api/instances/{instanceId}/queries/{query}` o `/waterline/api/instances/{instanceId}/runs/{runId}/queries/{query}`. Sigue siendo necesaria una definición de workflow cargable, porque la ejecución debe reproducirse antes de invocar el método. Si existen destinos duraderos pero no está disponible la definición, el detalle informa `can_query = false` y `query_blocked_reason = workflow_definition_unavailable`, y los POST devuelven HTTP `409 Conflict` con `blocked_reason = workflow_definition_unavailable`. Si la instantánea está incompleta y la compilación actual ya no puede completarla, el detalle informa `declared_contract_source = unavailable`. Los destinos que sobrevivan siguen visibles como diagnóstico, pero los argumentos con nombre se rechazan con `422` hasta que una compilación compatible guarde el contrato ausente.

El puente público de webhooks expone las mismas consultas seguras para la reproducción fuera de Waterline:

```text
POST /webhooks/instances/{instanceId}/queries/{query}
POST /webhooks/instances/{instanceId}/runs/{runId}/queries/{query}
```

Esas rutas aceptan el mismo campo JSON `arguments`, devuelven un `result` JSON tipado al tener éxito y usan los mismos errores para argumentos no válidos (`422` con `validation_errors`) y bloqueos de reproducción (`409` con `blocked_reason`). Si sigue siendo cargable la definición actual, se puede usar el destino duradero `#[QueryMethod('public-name')]` o el nombre del método PHP. Las respuestas HTTP satisfactorias normalizan `query_name` al destino público duradero para evitar que los clientes dependan de detalles de nombres de métodos.

<QuerySimulator />

**Importante:** una consulta no hace avanzar el workflow, a diferencia de las señales.
