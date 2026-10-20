---
sidebar_position: 2
---

import QuerySimulator from '@site/src/components/QuerySimulator';

# Consultas {#queries}

As consultas permitem obter informações sobre o estado atual de um workflow sem afetar sua execução. Isso é útil para monitoramento e depuração.

## Métodos de consulta seguros para replay {#replay-safe-query-methods}

As consultas reproduzem o histórico confirmado da execução selecionada e depois invocam o método anotado no objeto de workflow reconstituído. Elas não aplicam implicitamente comandos de sinal ou atualização que foram aceitos, mas ainda não aplicados.

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

Acesse a execução atual pelo ID público da instância:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$workflow->currentStage(); // "waiting-for-approval"
$workflow->query('starts-with', 'waiting'); // true
$workflow->queryWithArguments('starts-with', ['prefix' => 'waiting']); // true
```

Quando quiser fixar explicitamente uma execução histórica ou selecionada, faça a consulta por `loadRun($runId)`:

```php
$selectedRun = WorkflowStub::loadRun($runId);

$selectedRun->currentStage();
```

Comportamento das consultas:

- As consultas são seguras para replay: observam apenas o histórico confirmado e não alteram o estado do workflow.
- Os argumentos são encaminhados ao método anotado. Declare um nome público estável com `#[QueryMethod('public-name')]` para que a chamada continue válida após renomeações do método PHP.
- `load($instanceId)` consulta a execução durável mais recente dessa instância. `loadRun($runId)` direciona a consulta a uma execução específica, o que é útil para consultar execuções anteriores a uma transição continue-as-new.
- Sinais e atualizações aceitos, mas ainda não aplicados, aparecem no histórico de comandos, porém só contam como estado aplicado quando o worker registra `SignalApplied` / `UpdateApplied`.

Para definir um método de consulta em um workflow, use a anotação `QueryMethod`. O argumento string opcional permite fixar um nome público durável de consulta que permanece válido após renomeações do método PHP:

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

Para consultar um workflow, chame o método na instância do workflow. O método de consulta retorna os dados do workflow.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$ready = $workflow->getReady();
$sameReady = $workflow->query('is-ready');
```

Use `queryWithArguments()` quando o chamador já tiver uma lista posicional ou um mapa de parâmetros nomeados:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$workflow->queryWithArguments('starts-with', [
    'prefix' => 'wait',
]);
```

O Waterline usa a interface de contrato de consulta da execução selecionada. O painel expõe `declared_query_targets[*]` junto com sinais e atualizações, mas só mostra a execução de consultas quando `can_query = true`. A operação de consulta da execução selecionada ou atual envia `arguments` em JSON para `/waterline/api/instances/{instanceId}/queries/{query}` ou `/waterline/api/instances/{instanceId}/runs/{runId}/queries/{query}`. Executar uma consulta ainda exige uma definição de workflow que possa ser carregada, pois a execução selecionada precisa passar por replay antes de invocar o método de consulta. Quando há destinos duráveis de consulta, mas essa definição está indisponível, os detalhes da execução selecionada informam `can_query = false` com `query_blocked_reason = workflow_definition_unavailable`, e os POSTs de consulta retornam HTTP `409 Conflict` com `blocked_reason = workflow_definition_unavailable`. Se a execução tiver apenas um instantâneo incompleto e o build atual não puder mais completar seu preenchimento, os detalhes informam `declared_contract_source = unavailable`. Os destinos de consulta remanescentes continuam visíveis como metadados de diagnóstico, mas argumentos nomeados de consulta continuam sendo rejeitados com `422` até que um build compatível persista o contrato ausente.

A ponte pública de webhooks expõe essa mesma interface de consulta segura para replay fora do Waterline:

```text
POST /webhooks/instances/{instanceId}/queries/{query}
POST /webhooks/instances/{instanceId}/runs/{runId}/queries/{query}
```

Essas rotas de webhook aceitam o mesmo campo JSON `arguments` do Waterline, retornam um `result` tipado em JSON no sucesso e usam o mesmo formato de erro para argumentos inválidos (`422` com `validation_errors`) e bloqueios de replay (`409` com `blocked_reason`). Quando a definição atual do workflow ainda pode ser carregada, os chamadores podem endereçar a consulta pelo destino durável `#[QueryMethod('public-name')]` ou pelo nome do método PHP subjacente. Respostas HTTP bem-sucedidas normalizam `query_name` para o destino público durável, para que chamadores externos não passem a depender de detalhes de renomeação de métodos.

<QuerySimulator />

**Importante:** Consultar um workflow não avança sua execução, ao contrário dos sinais.
