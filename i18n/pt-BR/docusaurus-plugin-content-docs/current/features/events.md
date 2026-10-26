---
sidebar_position: 12
---

# Eventos {#events}

Eventos de ciclo de vida são disparados em etapas importantes da execução de workflows e atividades para informar à aplicação sobre progresso, conclusão ou falhas. São eventos padrão do Laravel. Registre listeners no seu `EventServiceProvider` ou com `Event::listen()`.

`WorkflowCancelled` e `WorkflowTerminated` aguardam a confirmação da transação na conexão que armazena a execução. Comandos rejeitados e gravações revertidas não emitem nenhum desses eventos. Outras limitações das transações do mecanismo e da ordem dos eventos de ciclo de vida são acompanhadas em [workflow#893](https://github.com/durable-workflow/workflow/issues/893). Uma transação em um banco separado da aplicação não torna atômicas as gravações no armazenamento do workflow.

## Identidade dos eventos {#event-identity}

Todo evento V2 contém campos de identidade durável:

| Campo | Descrição |
|---|---|
| `instanceId` | O ID da instância de workflow, estável entre transições continue-as-new. |
| `runId` | O ID da execução específica. |
| `workflowType` | A chave de tipo durável registrada via `#[Type('...')]`. |
| `workflowClass` | O nome da classe PHP do workflow. |
| `committedAt` | Marca de tempo ISO 8601 do relógio real, capturada ao preparar a notificação de ciclo de vida. |

Eventos de atividade também incluem:

| Campo | Descrição |
|---|---|
| `activityExecutionId` | O ID durável da execução da atividade. |
| `activityType` | A chave de tipo durável da atividade. |
| `activityClass` | O nome da classe PHP da atividade. |
| `sequence` | A posição da atividade na execução do workflow. |
| `attemptNumber` | O número da tentativa (começa em 1). |

## Eventos de workflow {#workflow-events}

### WorkflowStarted {#workflowstarted}

Disparado quando o início de um workflow é confirmado de forma durável, ou seja, quando a primeira execução foi criada e o evento de histórico `WorkflowStarted` foi registrado.

```php
use Workflow\V2\Events\WorkflowStarted;

Event::listen(WorkflowStarted::class, function (WorkflowStarted $event) {
    Log::info('Workflow started', [
        'instance_id' => $event->instanceId,
        'run_id' => $event->runId,
        'type' => $event->workflowType,
    ]);
});
```

Esse evento também é disparado quando uma nova execução inicia via continue-as-new.

### WorkflowCompleted {#workflowcompleted}

Disparado quando uma execução de workflow conclui com sucesso.

```php
use Workflow\V2\Events\WorkflowCompleted;

Event::listen(WorkflowCompleted::class, function (WorkflowCompleted $event) {
    Log::info('Workflow completed', [
        'instance_id' => $event->instanceId,
        'run_id' => $event->runId,
    ]);
});
```

### WorkflowFailed {#workflowfailed}

Disparado quando uma execução de workflow falha de forma terminal.

O estouro do tempo limite de uma execução também dispara `WorkflowFailed`. Já o vencimento do prazo de limpeza de uma solicitação de cancelamento cooperativo dispara `WorkflowCancelled`.

Campos adicionais:
- `exceptionClass`: O nome da classe PHP da exceção.
- `message`: A mensagem da exceção.

```php
use Workflow\V2\Events\WorkflowFailed;

Event::listen(WorkflowFailed::class, function (WorkflowFailed $event) {
    Log::error('Workflow failed', [
        'instance_id' => $event->instanceId,
        'exception' => $event->exceptionClass,
        'message' => $event->message,
    ]);
});
```

### WorkflowCancelled {#workflowcancelled}

Disparado quando o cancelamento imediato fecha uma execução ou quando o cancelamento cooperativo a fecha após concluir a limpeza ou vencer seu prazo. A solicitação de cancelamento por si só não dispara esse evento.

Além dos campos de identidade comuns:

| Campo | Descrição |
|---|---|
| `reason` | Motivo original do comando de cancelamento, ou `null`. Mensagens de conclusão da limpeza ou de vencimento do prazo não o substituem. |
| `closedAt` | Horário persistido de fechamento da execução como string ISO 8601 em UTC. |

```php
use Workflow\V2\Events\WorkflowCancelled;

Event::listen(WorkflowCancelled::class, function (WorkflowCancelled $event) {
    Log::info('Workflow cancelled', [
        'instance_id' => $event->instanceId,
        'run_id' => $event->runId,
        'reason' => $event->reason,
        'closed_at' => $event->closedAt,
    ]);
});
```

### WorkflowTerminated {#workflowterminated}

Disparado quando o encerramento forçado fecha uma execução. Contém os mesmos campos de identidade, `reason` e `closedAt`, com o motivo do comando de encerramento. O encerramento forçado não executa o código de limpeza do workflow.

```php
use Workflow\V2\Events\WorkflowTerminated;

Event::listen(WorkflowTerminated::class, function (WorkflowTerminated $event) {
    Log::info('Workflow terminated', [
        'instance_id' => $event->instanceId,
        'run_id' => $event->runId,
        'reason' => $event->reason,
        'closed_at' => $event->closedAt,
    ]);
});
```

Estas são notificações Laravel dentro do processo. Uma falha no listener não pode desfazer um fechamento confirmado. Os eventos não autorizam a retomada de uma execução fechada nem garantem entrega durável a um sistema externo.

## Eventos de atividade {#activity-events}

### ActivityStarted {#activitystarted}

Disparado quando uma tarefa de atividade é reivindicada e sua execução inicia.

```php
use Workflow\V2\Events\ActivityStarted;

Event::listen(ActivityStarted::class, function (ActivityStarted $event) {
    Log::info('Activity started', [
        'activity' => $event->activityType,
        'sequence' => $event->sequence,
        'attempt' => $event->attemptNumber,
    ]);
});
```

### ActivityCompleted {#activitycompleted}

Disparado quando uma atividade conclui com sucesso.

```php
use Workflow\V2\Events\ActivityCompleted;

Event::listen(ActivityCompleted::class, function (ActivityCompleted $event) {
    Log::info('Activity completed', [
        'activity' => $event->activityType,
        'execution_id' => $event->activityExecutionId,
    ]);
});
```

### ActivityFailed {#activityfailed}

Disparado quando uma atividade falha de forma terminal, por esgotamento das tentativas ou por uma exceção não repetível. Falhas repetíveis que terão uma nova tentativa **não** disparam esse evento.

Campos adicionais:
- `exceptionClass`: O nome da classe PHP da exceção.
- `message`: A mensagem da exceção.

```php
use Workflow\V2\Events\ActivityFailed;

Event::listen(ActivityFailed::class, function (ActivityFailed $event) {
    Log::error('Activity failed', [
        'activity' => $event->activityType,
        'exception' => $event->exceptionClass,
        'message' => $event->message,
    ]);
});
```

## Eventos de falha {#failure-events}

### FailureRecorded {#failurerecorded}

Disparado sempre que um registro durável de falha é confirmado, tanto para falhas terminais de workflows quanto de atividades. É o ponto único de integração com ferramentas de relatório de erros, como Sentry ou Bugsnag.

| Campo | Descrição |
|---|---|
| `failureId` | O ID do registro durável de falha. |
| `sourceKind` | `"workflow_run"` ou `"activity_execution"`. |
| `sourceId` | O ID da origem (ID da execução do workflow ou da atividade). |
| `exceptionClass` | O nome da classe PHP da exceção. |
| `message` | A mensagem da exceção. |

```php
use Workflow\V2\Events\FailureRecorded;

Event::listen(FailureRecorded::class, function (FailureRecorded $event) {
    // Report to Sentry, Bugsnag, etc.
    report(new \RuntimeException(
        "[{$event->sourceKind}] {$event->exceptionClass}: {$event->message}"
    ));
});
```

## Semântica dos horários {#timestamp-semantics}

O mecanismo captura `committedAt` ao preparar uma notificação de ciclo de vida. É uma marca de tempo do relógio real, diferente de:

- **Tempo virtual do workflow**: O tempo lógico dentro da execução do workflow, usado por temporizadores.
- **Horário da tentativa**: Quando uma tentativa específica de atividade iniciou ou terminou.
- **Latência de retomada**: Quanto tempo depois do vencimento de um temporizador o workflow efetivamente retomou.

Para cancelamento e encerramento forçado, `closedAt` é o horário persistido de fechamento em UTC. Uma transação externa de armazenamento pode ser confirmada depois da captura dos campos do evento. Registre separadamente o horário de recebimento no listener ao medir a latência de entrega.

## Ciclo de vida {#lifecycle}

Um ciclo de vida típico de workflow bem-sucedido:

```
Workflow\V2\Events\WorkflowStarted
Workflow\V2\Events\ActivityStarted
Workflow\V2\Events\ActivityCompleted
Workflow\V2\Events\WorkflowCompleted
```

Um ciclo de vida de workflow com falha terminal de atividade:

```
Workflow\V2\Events\WorkflowStarted
Workflow\V2\Events\ActivityStarted
Workflow\V2\Events\ActivityFailed
Workflow\V2\Events\FailureRecorded    (source: activity_execution)
Workflow\V2\Events\WorkflowFailed
Workflow\V2\Events\FailureRecorded    (source: workflow_run)
```

Uma execução cancelada termina com:

```
Workflow\V2\Events\WorkflowStarted
Workflow\V2\Events\WorkflowCancelled
```

A limpeza cooperativa pode emitir eventos de atividade entre essas duas notificações.

Uma execução encerrada à força termina com:

```
Workflow\V2\Events\WorkflowStarted
Workflow\V2\Events\WorkflowTerminated
```

## Namespace dos eventos {#event-namespace}

Os eventos V2 ficam no namespace `Workflow\V2\Events`. Se estiver atualizando uma aplicação existente, consulte [Migração](../migration.md) para conhecer o mapeamento dos eventos de compatibilidade V1.
