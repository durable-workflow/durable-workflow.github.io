---
sidebar_position: 23
title: Atividades locais
description: Execute atividades curtas no processo atual do worker de workflow, preservando histórico durável, repetições, tempos limite e visibilidade.
tags:
  - atividades
  - workers
  - execução
keywords:
  - atividades locais
  - localActivity
  - executeLocalActivity
  - atividade no mesmo processo
  - heartbeat da tarefa de workflow
---

# Atividades locais {#local-activities}

Atividades locais são a primitiva v2 para trabalho curto de atividade que deve
executar no processo do worker de workflow que está executando a tarefa atual.
Elas preservam a semântica de repetição, tempo limite, heartbeat, cancelamento,
histórico e visibilidade para o operador, mas não passam pelo enfileiramento
comum de tarefas de atividade.

Use atividades locais quando o trabalho tiver baixa latência, for idempotente
e adequado ao próprio worker de workflow. Use atividades comuns em fila quando
o trabalho precisar de escalabilidade independente de workers, roteamento por
fila, execução longa ou uma concessão separada de tarefa de atividade.

## Resumo do contrato {#contract-summary}

- `localActivity(...)` e `Workflow::localActivity(...)` executam a classe de
  atividade no mesmo processo da tarefa atual de workflow.
- O runtime cria uma linha `activity_executions` e eventos normais de histórico
  de atividade marcados com `execution_mode=local` e `local_activity=true`.
- Nenhuma tarefa comum `TaskType::Activity` é criada, por isso as opções de
  roteamento `connection`, `queue`, sessão de worker e schedule-to-start são rejeitadas.
- A tentativa local detém a concessão da tarefa de workflow. O `heartbeat()` da
  atividade renova essa concessão e registra `ActivityHeartbeatRecorded`.
- Repetições são tarefas duráveis de workflow com espera progressiva, sem
  repetições ocultas em loops.
- O replay a frio lê o histórico confirmado da atividade. Se uma tentativa
  local iniciada não tiver evento terminal após a perda do worker, a próxima
  tentativa registra `retry_reason=cold_replay`.
- Detalhes da execução, exportação de histórico, linhas do tempo e métricas
  do operador expõem tentativas locais separadamente das tentativas comuns em fila.

## API de autoria {#authoring-api}

Use o helper do namespace:

```php
use Workflow\V2\Support\LocalActivityOptions;
use function Workflow\V2\localActivity;

$receipt = localActivity(
    SendReceiptActivity::class,
    new LocalActivityOptions(
        maxAttempts: 3,
        startToCloseTimeout: 10,
        scheduleToCloseTimeout: 30,
        heartbeatTimeout: 5,
    ),
    $orderId,
);
```

Ou use a fachada estática de workflow:

```php
use Workflow\V2\Workflow;

$receipt = Workflow::localActivity(SendReceiptActivity::class, $orderId);
$receipt = Workflow::executeLocalActivity(SendReceiptActivity::class, $orderId);
```

`LocalActivityOptions` aceita campos de repetição e tempo limite:

- `maxAttempts`
- `backoff`
- `startToCloseTimeout`
- `scheduleToCloseTimeout`
- `heartbeatTimeout`
- `nonRetryableErrorTypes`

Ela rejeita `connection`, `queue`, roteamento de sessão de worker e
`scheduleToStartTimeout`, pois uma atividade local não entra na
correspondência normal de tarefas.

## Execução e histórico {#execution-and-history}

Quando o replay do workflow chega a uma atividade local, a tarefa atual de workflow:

1. cria a execução da atividade com `activity_options.execution_mode=local`;
2. registra `ActivityScheduled` e `ActivityStarted` com o marcador local;
3. instancia e executa a classe de atividade no processo do worker de workflow;
4. registra `ActivityCompleted`, `ActivityFailed`, `ActivityTimedOut` ou
   `ActivityCancelled`;
5. retoma o código do workflow a partir do evento registrado da atividade.

O replay não executa novamente uma atividade local concluída. O replay para
consulta e o replay a frio leem os mesmos eventos de histórico usados pelas atividades comuns.

## Heartbeats {#heartbeats}

Uma atividade local não detém uma concessão de tarefa de atividade. Ela detém
a concessão da tarefa de workflow que está executando o workflow no momento.
No início da tentativa, o runtime renova a concessão da tarefa de workflow.
Quando o código da atividade chama `$this->heartbeat()`, o runtime registra o
progresso, atualiza a tentativa da atividade e renova a concessão da tarefa de workflow.

Atividades locais de longa duração devem enviar heartbeats com frequência
suficiente para respeitar tanto o tempo limite de heartbeat da atividade
local quanto a concessão da tarefa de workflow:

```php
use Workflow\V2\Activity;

final class PollShortJobActivity extends Activity
{
    public function handle(string $jobId): array
    {
        $state = $this->fetch($jobId);

        $this->heartbeat([
            'message' => 'Polling remote job',
            'job_id' => $jobId,
            'state' => $state['status'],
        ]);

        return $state;
    }
}
```

## Tempos limite e repetições {#timeouts-and-retries}

`startToCloseTimeout` limita uma tentativa. `scheduleToCloseTimeout` limita
toda a execução local, incluindo repetições. `heartbeatTimeout` limita o
intervalo entre heartbeats registrados da atividade local.

Quando ocorre uma falha repetível ou um tempo limite, o runtime registra
`ActivityRetryScheduled` e cria uma tarefa de workflow que fica disponível
após a espera progressiva da repetição. Essa tarefa reproduz o histórico do
workflow, chega à mesma sequência de atividade local e inicia a próxima tentativa local.

Cada tentativa local é uma nova linha de `activity_attempts`. Uma repetição
registra `retry_reason` como `failure`, `timeout` ou `cold_replay`.

## Cancelamento e perda do worker {#cancellation-and-worker-loss}

O cancelamento é cooperativo. Uma atividade local observa o cancelamento nos
pontos de heartbeat, aplicação de tempo limite e conclusão da tentativa.
Uma tentativa local cancelada registra `ActivityCancelled` com o marcador local.

Se um worker sair antes de confirmar um evento terminal da atividade local,
a concessão da tarefa de workflow expira e o reparo normal de tarefas a
recupera. O replay a frio então lê o histórico confirmado. Se ele contiver
uma tentativa local iniciada sem evento terminal, o runtime agenda uma
repetição com `retry_reason=cold_replay`.

## Visibilidade {#visibility}

Operadores podem distinguir atividades locais em todos os lugares onde o
estado de atividades é informado:

- payloads de histórico incluem `execution_mode=local` e `local_activity=true`;
- `activity_executions.activity_options.execution_mode` é `local`;
- detalhes da execução e exportação de histórico incluem `execution_mode` e `local_activity`;
- métricas do operador expõem `activities.local`, `activities.local_open`,
  `activities.local_attempts` e contadores de atividades em fila e locais.

O manifesto do runtime é publicado em
`worker_protocol.server_capabilities.local_activities` no
`GET /api/cluster/info`. O contrato legível por máquina é
[`local-activity-runtime.schema.json`](/platform-protocol-specs/local-activity-runtime.schema.json)
e está indexado no catálogo de
[especificações do protocolo da plataforma](/docs/platform-protocol-specs#local-activity-runtime-notes).

Os nomes dos eventos continuam sendo os nomes normais de eventos de atividade,
para que linhas do tempo e ferramentas de replay preservem a ordem sem uma família paralela de eventos.

## Escolha da primitiva adequada {#choosing-the-right-primitive}

Use uma atividade local para efeitos colaterais curtos, repetíveis e
idempotentes que sejam mais adequados ao processo do worker de workflow e
não precisem de roteamento por fila.

Use uma [atividade](/docs/defining-workflows/activities) comum para chamadas
remotas, E/S lenta, trabalho intenso de CPU, frotas dedicadas de workers,
controle de pressão ou trabalho que deva continuar avançando por uma tarefa
de atividade com concessão separada após a perda do worker de workflow.

Use [sessões de worker](/docs/features/worker-sessions) quando várias etapas
de atividades comuns precisarem reutilizar recursos locais do worker, como
memória de GPU ou um sistema de arquivos montado.

Use [`sideEffect(...)`](/docs/features/side-effects) apenas para instantâneos
seguros para replay que não precisem da semântica de repetição, tempo limite,
heartbeat ou cancelamento de atividades.
