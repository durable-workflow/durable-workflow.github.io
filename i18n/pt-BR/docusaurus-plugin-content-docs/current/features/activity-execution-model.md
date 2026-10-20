---
sidebar_position: 22
title: Modelo de execução de atividades
description: Como atividades comuns em fila, atividades locais, sessões de worker e execução sticky se relacionam no Durable Workflow v2.
tags:
  - atividades
  - workers
  - execução
keywords:
  - modelo de execução de atividades
  - atividades locais
  - sessões de worker
  - execução sticky
  - despacho durável de tarefas
  - atividades em fila
---

# Modelo de execução de atividades {#activity-execution-model}

Para conhecer o suporte dos workers de serviço e a negociação de capacidades
que recusa operações não suportadas em PHP, Python e Rust, consulte a matriz
de suporte de [afinidade portátil de workers](/docs/polyglot/portable-worker-affinity)
do modo de serviço.

O Durable Workflow v2 tem primitivas explícitas para as escolhas comuns de
posicionamento de atividades:

- atividades comuns em fila para trabalho durável com concessão independente;
- [atividades locais](/docs/features/local-activities) para trabalho curto
  no mesmo processo, que ainda registra histórico de atividade;
- [sessões de worker](/docs/features/worker-sessions) para afinidade durável
  de atividades entre várias etapas de atividades em fila;
- [execução sticky](/docs/features/sticky-execution) para afinidade do cache
  de replay do workflow, usando o replay comum como alternativa que garante a correção.

## Atividades comuns em fila {#ordinary-queued-activities}

`activity(...)` e `Workflow::activity(...)` são atividades comuns em fila.
Elas continuam sendo a primitiva padrão de atividade.

1. O código do workflow chama `activity(MyActivity::class, ...)`.
2. A tarefa do workflow registra `ActivityScheduled` e cria uma tarefa durável
   de atividade na conexão e fila configuradas.
3. Um worker compatível reivindica essa tarefa de atividade sob uma concessão.
4. O worker executa a classe de atividade e informa conclusão, falha,
   cancelamento, heartbeat ou tempo limite.
5. O mecanismo registra o resultado da atividade no histórico do workflow e
   retoma o workflow a partir do estado durável.

Tentativas de atividades comuns podem executar em qualquer worker compatível.
Uma repetição pode ser encaminhada a outro processo, host ou build. O código
da atividade deve ser idempotente diante de entregas duplicadas, repetições
após expiração da concessão e disputas com conclusões tardias. Use
`activity_execution_id` como chave padrão de idempotência remota e
`activity_attempt_id` apenas quando um sistema downstream precisar de
correlação por tentativa.

```php
use function Workflow\V2\activity;

$quote = activity(FetchQuoteActivity::class, $customerId);
$invoice = activity(CreateInvoiceActivity::class, $quote['id']);
```

## Atividades locais {#local-activities}

`localActivity(...)`, `Workflow::localActivity(...)` e
`Workflow::executeLocalActivity(...)` executam uma classe de atividade dentro
do processo do worker de workflow que está executando a tarefa do workflow.
Elas não criam uma tarefa comum de atividade.

Atividades locais ainda registram o histórico normal de atividade:

- `ActivityScheduled`
- `ActivityStarted`
- `ActivityHeartbeatRecorded`
- `ActivityRetryScheduled`
- `ActivityCompleted`
- `ActivityFailed`
- `ActivityCancelled`
- `ActivityTimedOut`

Cada evento de atividade local contém `execution_mode=local` e
`local_activity=true`, e o instantâneo da execução da atividade armazena
`activity_options.execution_mode=local`. Os heartbeats da atividade renovam
a concessão da tarefa de workflow proprietária enquanto a tentativa local executa.

Use atividades locais para efeitos colaterais curtos e idempotentes que
precisam da semântica de repetição, tempo limite, heartbeat, cancelamento e
visibilidade de atividades, mas não de roteamento por fila nem de uma frota
independente de workers de atividade. Consulte [Atividades locais](/docs/features/local-activities)
para conhecer a API e os contratos de tempos limite, repetição, desligamento,
replay a frio, roteamento e métricas.

```php
use Workflow\V2\Support\LocalActivityOptions;
use function Workflow\V2\localActivity;

$receipt = localActivity(
    SendReceiptActivity::class,
    new LocalActivityOptions(maxAttempts: 3, startToCloseTimeout: 10),
    $orderId,
);
```

## Sessões de worker {#worker-sessions}

Sessões de worker fixam uma sequência de tentativas de atividades comuns em
fila a uma concessão de sessão de worker. Use quando várias etapas duráveis
precisarem reutilizar recursos locais do worker, como memória de GPU, um
sistema de arquivos montado ou um modelo carregado.

Sessões de worker não tornam uma atividade local. Cada atividade na sessão
continua sendo uma tarefa durável com sua própria concessão, heartbeat,
tempo limite, repetição e histórico terminal. A sessão adiciona afinidade
explícita e regras de admissão ao roteamento normal por fila.

Consulte [Sessões de worker](/docs/features/worker-sessions) para conhecer a API
de sessão, o ciclo de vida da concessão, roteamento, tratamento de falhas,
comportamento de desligamento e diagnóstico para operadores.

## Execução sticky {#sticky-execution}

A execução sticky é uma otimização do replay de tarefas de workflow. Um worker
pode manter um cache de replay aquecido e local ao processo após concluir uma
tarefa de workflow. Se assumir uma tarefa posterior dessa execução, poderá
reutilizar seu cache válido. A afinidade não reserva tarefas prontas nem dá
prioridade de correspondência ao proprietário do cache; outro worker elegível
pode assumir a tarefa e fazer replay do histórico a frio.

A execução sticky não torna o progresso do workflow local ao processo. A
correção sempre recorre ao replay comum a frio a partir do histórico durável
após ausência no cache, reinicialização, drenagem, implantação ou expulsão.
O código do workflow não deve depender de estado em memória fora do histórico.

Consulte [Execução sticky](/docs/features/sticky-execution) para conhecer o
ciclo de vida do cache sticky, a identidade de roteamento, as regras de
alternativa, os controles de implantação e as métricas.

## Escolha da primitiva adequada {#choosing-the-right-primitive}

Use diretamente o código do workflow para decisões de fluxo e cálculos determinísticos.

Use [`sideEffect(...)`](/docs/features/side-effects) para um instantâneo seguro
para replay de um valor não determinístico que não precise da semântica de
repetição, tempo limite, heartbeat ou cancelamento de atividades.

Use [atividades locais](/docs/features/local-activities) para efeitos colaterais
curtos, repetíveis e no mesmo processo que devam ser visíveis como tentativas
de atividade, sem entrar na correspondência normal de tarefas.

Use [atividades](/docs/defining-workflows/activities) comuns para chamadas
remotas, E/S lenta, trabalho intenso de CPU, controle de pressão por fila,
frotas dedicadas de workers ou trabalho que deva continuar por meio de uma
tarefa de atividade com concessão separada.

Use [sessões de worker](/docs/features/worker-sessions) quando várias etapas
de atividades comuns precisarem de afinidade explícita ao mesmo worker.
