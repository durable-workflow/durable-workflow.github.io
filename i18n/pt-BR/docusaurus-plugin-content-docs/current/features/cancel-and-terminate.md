---
sidebar_position: 16
---

# Cancelar e terminar {#cancel-and-terminate}

Este guia aborda a API `Workflow\V2\WorkflowStub` do modo Laravel embarcado.
Para clientes e workers no modo de serviço, use o
[guia do SDK PHP](https://php.durable-workflow.com/), a
[referência de cancelamento em Python](https://python.durable-workflow.com/reference/errors/#durable_workflow.errors.ActivityCancelled) ou a
[API de ciclo de vida em Rust](https://rust.durable-workflow.com/durable_workflow/struct.Client.html#method.cancel_workflow).

Cancelar e terminar são comandos duráveis próprios que encerram um workflow em execução. Ambos são registrados no histórico de comandos, aparecem em eventos tipados do histórico e são apresentados no Waterline.

Na API embarcada atual, ambos os comandos encerram a execução imediatamente.
**Cancelar** registra o resultado `cancelled`; **terminar** registra `terminated`.
Nenhum dos comandos agenda limpeza dentro do workflow encerrado. O Laravel
embarcado também oferece `requestCancellation()` para limpeza cooperativa com
limites definidos. O Server e os SDKs PHP, Python e Rust oferecem essa
solicitação cooperativa separada com workers que a habilitam explicitamente.
Consulte [Cancelamento cooperativo](/docs/polyglot/cancellation) para conhecer
os contratos de capacidade, prazo, limpeza e recuperação.

## Cancelar {#cancel}

Cancelar muda imediatamente a execução para `cancelled` e registra histórico durável.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$result = $workflow->cancel();

$result->accepted();   // true
$result->outcome();    // "cancelled"
$result->commandId();  // Durable command id
$result->reason();     // null (no reason provided)
```

### Cancelar com motivo {#cancel-with-reason}

Você pode fornecer um motivo estruturado para distinguir cancelamentos solicitados pelo usuário, determinados por política ou iniciados pelo operador nas trilhas de auditoria, no histórico de comandos e no Waterline.

```php
$result = $workflow->cancel('Customer requested cancellation');

$result->reason(); // "Customer requested cancellation"
```

O motivo é persistido no registro durável do comando e nos eventos tipados `CancelRequested` e `WorkflowCancelled`, sobrevivendo ao replay, à exportação e à análise offline.

### O que o cancelamento faz {#what-cancel-does}

Quando um comando de cancelamento é aceito, o mecanismo encerra as execuções de atividades abertas e os temporizadores pendentes, muda a execução para `cancelled` e retoma o workflow pai que estiver aguardando o filho cancelado, para que possa observar o resultado.

### O cancelamento é rejeitado quando {#cancel-is-rejected-when}

- A instância ainda não iniciou: `rejection_reason = instance_not_started`
- A execução atual já está encerrada: `rejection_reason = run_not_active`
- Um cancelamento direcionado a uma execução endereça uma execução histórica, que não é a atual: `rejection_reason = selected_run_not_current`

## Terminar {#terminate}

Terminar encerra imediatamente um workflow em execução sem agendar mais código de workflow. Assim como cancelar, não oferece uma janela de limpeza. Use quando o resultado distinto `terminated` for apropriado.

```php
$result = $workflow->terminate();

$result->accepted();   // true
$result->outcome();    // "terminated"
```

### Terminar com motivo {#terminate-with-reason}

```php
$result = $workflow->terminate('Operator emergency shutdown');

$result->reason(); // "Operator emergency shutdown"
```

### O que o término faz {#what-terminate-does}

O término segue as mesmas etapas transacionais do cancelamento, mas:

- Registra os eventos de histórico `TerminateRequested` e `WorkflowTerminated`.
- Cria a linha `WorkflowFailure` com `failure_category = terminated` e `propagation_kind = terminated`.
- Define `closed_reason = terminated` na execução.
- Não agenda nenhuma execução adicional de código do workflow.

### O término é rejeitado quando {#terminate-is-rejected-when}

As condições de rejeição são as mesmas do cancelamento.

## Comandos direcionados a uma execução {#run-targeted-commands}

Tanto cancelar quanto terminar podem direcionar uma execução específica em vez da execução atual da instância.

```php
$selectedRun = WorkflowStub::loadRun($runId);
$result = $selectedRun->attemptCancel('Draining old run');

$result->targetScope(); // "run"
```

Comandos direcionados a uma execução são rejeitados com `selected_run_not_current` quando a execução endereçada não é mais a atual da instância. A resposta inclui `requested_run_id` (a execução endereçada pelo chamador) e `resolved_run_id` (a execução atual que deve ser usada em seguida).

## API sem lançamento de exceções {#non-throwing-api}

Use `attemptCancel()` e `attemptTerminate()` para tratar rejeições sem exceções:

```php
$result = $workflow->attemptCancel('Duplicate order');

if ($result->rejected()) {
    $result->rejectionReason(); // e.g. "run_not_active"
}
```

`cancel()` e `terminate()` lançam `LogicException` em caso de rejeição.

## Webhooks {#webhooks}

Cancelar e terminar estão disponíveis por rotas de webhook:

```text
POST /webhooks/instances/{workflowId}/cancel
POST /webhooks/instances/{workflowId}/terminate
POST /webhooks/instances/{workflowId}/runs/{runId}/cancel
POST /webhooks/instances/{workflowId}/runs/{runId}/terminate
```

Passe o motivo no corpo da requisição:

```json
{
  "reason": "Operator: duplicate order"
}
```

A resposta inclui o resultado do comando, o ID público da instância e o motivo:

```json
{
  "outcome": "cancelled",
  "workflow_id": "order-123",
  "run_id": "01J10000000000000000000021",
  "reason": "Operator: duplicate order",
  "command_id": "01J40000000000000000000021",
  "command_status": "accepted"
}
```

## Cancelamento exige captura explícita {#cancellation-is-not-an-error-you-catch-by-accident}

Cancelamento é um resultado explícito do ciclo de vida, não um erro inesperado
da aplicação. A classe `Workflow\V2\Exceptions\WorkflowCancelledException`
do pacote embarcado estende `\Error`, e não `\Exception`. Um bloco
`catch (\Exception $e)` não a captura; um bloco `catch (\Throwable $t)` captura.

Ao ler o resultado de um workflow cancelado, capture a exceção pelo nome caso
precise distinguir o cancelamento de outras falhas. Capturar uma exceção na
leitura do resultado não reabre a execução cancelada nem agenda limpeza nela.

## Waterline {#waterline}

O Waterline expõe cancelar e terminar como ações do operador na tela de detalhes da execução selecionada. O payload de detalhes inclui os indicadores `can_cancel` e `can_terminate`, derivados do estado durável.

A tela de histórico de comandos mostra cada comando de cancelamento ou término com seu motivo, identidade do chamador e resultado. O campo `commands[*].reason` contém o motivo informado pelo operador ou chamador, quando fornecido.

## Mapeamento de status {#status-mapping}

Execuções `cancelled` e `terminated` entram no grupo de status `failed` para roteamento de listas. Os campos brutos `status` e `closed_reason` as distinguem:

| Status | Grupo de status | Motivo do encerramento |
| --- | --- | --- |
| `cancelled` | `failed` | `cancelled` |
| `terminated` | `failed` | `terminated` |

## Histórico tipado {#typed-history}

Uma execução cancelada produz esta sequência de histórico:

```
StartAccepted
WorkflowStarted
... (workflow progress) ...
CancelRequested       <- reason field present when supplied
TimerCancelled        <- for each open timer
ActivityCancelled     <- for each open activity
WorkflowCancelled     <- failure_id, failure_category, reason when supplied
```

Uma execução terminada produz:

```
StartAccepted
WorkflowStarted
... (workflow progress) ...
TerminateRequested    <- reason field present when supplied
TimerCancelled        <- for each open timer
ActivityCancelled     <- for each open activity
WorkflowTerminated    <- failure_id, failure_category, reason when supplied
```

## Cancelar e terminar em comparação {#cancel-vs-terminate}

| | Cancelar | Terminar |
| --- | --- | --- |
| Mais código do workflow é agendado | Não | Não |
| Atividades abertas são canceladas | Sim | Sim |
| Temporizadores abertos são cancelados | Sim | Sim |
| Metadados do motivo | Sim | Sim |
| Histórico durável de comandos | Sim | Sim |
| O pai recebe o resultado do filho | Sim | Sim |
| Linha de falha registrada | Sim (`cancelled`) | Sim (`terminated`) |
| Grupo de status | `failed` | `failed` |
| Motivo do encerramento | `cancelled` | `terminated` |
