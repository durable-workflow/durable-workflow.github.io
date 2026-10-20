---
sidebar_position: 12
---

# Eventos {#events}

Eventos de ciclo de vida são disparados em etapas importantes da execução de workflows e atividades para informar à aplicação sobre progresso, conclusão ou falhas. São eventos padrão do Laravel. Registre listeners no seu `EventServiceProvider` ou com `Event::listen()`.

Todos os eventos de ciclo de vida V2 são disparados **depois que o estado durável é confirmado** no banco. Assim, listeners só observam eventos respaldados por dados confirmados. Se uma transação for revertida, nenhum evento é disparado.

## Identidade dos eventos {#event-identity}

Todo evento V2 contém campos de identidade durável:

| Campo | Descrição |
|---|---|
| `instanceId` | O ID da instância de workflow, estável entre transições continue-as-new. |
| `runId` | O ID da execução específica. |
| `workflowType` | A chave de tipo durável registrada via `#[Type('...')]`. |
| `workflowClass` | O nome da classe PHP do workflow. |
| `committedAt` | Horário ISO 8601 em que o registro durável foi confirmado (hora real da confirmação). |

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

O campo `committedAt` em todos os eventos representa o **horário da confirmação**: a hora real em que o registro durável, seja evento de histórico ou registro de falha, foi gravado no banco. Ele é diferente de:

- **Tempo virtual do workflow**: O tempo lógico dentro da execução do workflow, usado por temporizadores.
- **Horário da tentativa**: Quando uma tentativa específica de atividade iniciou ou terminou.
- **Latência de retomada**: Quanto tempo depois do vencimento de um temporizador o workflow efetivamente retomou.

O horário da confirmação é o mais útil para integrações externas, pois reflete quando o estado se tornou durável e observável.

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

## Namespace dos eventos {#event-namespace}

Os eventos V2 ficam no namespace `Workflow\V2\Events`. Se estiver atualizando uma aplicação existente, consulte [Migração](../migration.md) para conhecer o mapeamento dos eventos de compatibilidade V1.
