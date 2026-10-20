---
sidebar_position: 24
title: Sessões de worker
description: Fixe uma sequência de tentativas duráveis de atividade a uma concessão de sessão de worker para afinidade de GPU, sistema de arquivos ou estado local ao processo.
tags:
  - atividades
  - workers
  - afinidade
  - operações
keywords:
  - sessões de worker
  - afinidade de atividades
  - workers de gpu
  - workers com sistema de arquivos local
  - sessões no protocolo de workers
---

# Sessões de worker {#worker-sessions}

Sessões de worker são a primitiva v2 de afinidade de atividades. Use quando
várias etapas duráveis de atividade precisarem reutilizar estado local ao
processo, memória de GPU, um sistema de arquivos montado ou outro recurso local do worker.

## Resumo do contrato {#contract-summary}

- Uma sessão tem um único detentor da concessão por vez.
- A primeira atividade admitida na sessão cria ou readquire a concessão.
- Heartbeats de atividade renovam tanto a concessão da tentativa de atividade
  quanto a concessão da sessão.
- `POST /api/worker/sessions`, `POST /api/worker/sessions/{sessionId}/heartbeat`
  e `DELETE /api/worker/sessions/{sessionId}` expõem verbos explícitos de
  ciclo de vida para workers externos.
- O roteamento por fila continua ocorrendo primeiro. A admissão na sessão de
  worker ocorre depois que o worker está registrado na fila de tarefas.
- As `capabilities` do registro do worker devem atender a todos os requisitos da sessão.
- Sessões expiradas e órfãs são visíveis aos operadores e podem ser
  readquiridas quando a sessão permite recuperação de falhas.

## API de autoria {#authoring-api}

Autores de workflows PHP criam um handle de sessão com
`Workflow::workerSession()` ou `Workflow\V2\workerSession()` e agendam
atividades por esse handle:

```php
use Workflow\V2\Support\WorkerSessionOptions;
use Workflow\V2\Workflow;

$session = Workflow::workerSession(
    'gpu-render',
    new WorkerSessionOptions(
        queue: 'gpu-activities',
        requirements: ['gpu:nvidia-l4'],
        leaseSeconds: 120,
        ttlSeconds: 1800,
        maxConcurrentActivities: 1,
    ),
);

$frames = $session->activity(RenderFramesActivity::class, $videoId);
$manifest = $session->activity(AssembleManifestActivity::class, $frames['path']);
```

O instantâneo das opções de atividade armazena o mesmo contrato em
`activity_options.worker_session`. Runtimes externos usam o mesmo formato
JSON em `worker_session` de um comando de tarefa de workflow `schedule_activity`.

```json
{
  "type": "schedule_activity",
  "activity_type": "media.render-frames",
  "worker_session": {
    "session_id": "gpu-render",
    "queue": "gpu-activities",
    "requirements": ["gpu:nvidia-l4"],
    "lease_seconds": 120,
    "ttl_seconds": 1800,
    "max_concurrent_activities": 1,
    "create_if_missing": true,
    "allow_reacquire_after_failure": true
  }
}
```

## Ciclo de vida {#lifecycle}

A criação da sessão é adiada. A camada de correspondência cria ou readquire
uma sessão quando a primeira tarefa de atividade na sessão é admitida em um
worker com as capacidades necessárias. Um worker também pode criar a sessão
explicitamente antes do polling chamando `POST /api/worker/sessions`.

Uma sessão ativa termina quando o detentor a encerra, a concessão da sessão
expira, o TTL absoluto expira ou uma falha do worker detentor é detectada.
A expiração do TTL e o encerramento explícito são terminais para esse ID de
sessão. Após expiração da concessão ou detecção de sessão órfã, a sessão pode
ser readquirida quando `allow_reacquire_after_failure` é true.

## Concessão e titularidade {#lease-and-ownership}

No máximo um worker detém a concessão de uma sessão por vez. O servidor admite
tarefas de atividade na sessão somente quando uma destas condições é verdadeira:

- não há sessão e `create_if_missing` é true;
- a sessão ativa já pertence ao worker que faz o polling;
- a sessão está expirada, falhou ou ficou órfã e a reaquisição é permitida.

A titularidade da sessão não substitui a concessão por tentativa de atividade.
Cada tentativa ainda tem seu próprio `activity_attempt_id`, detentor da
concessão, heartbeat e caminhos de conclusão, falha, tempo limite e cancelamento.

## Admissão e roteamento {#admission-and-routing}

Sessões de worker participam do roteamento normal por fila.
`WorkerSessionOptions` pode definir `connection` e `queue`; `ActivityOptions`
por chamada ainda pode sobrescrevê-las. O servidor aplica a admissão específica
da sessão após a admissão normal na fila de tarefas:

- as `capabilities` do registro do worker devem cobrir todos os requisitos da sessão;
- `max_concurrent_activities` limita as tentativas de atividade com concessão
  dentro da sessão;
- `max_concurrent_worker_sessions` limita as concessões de sessão ativas
  mantidas por um registro de worker.

O roteamento específico da frota usa strings simples de capacidade, como
`gpu:nvidia-l4`, `gpu:a100`, `fs:/mnt/models` ou `zone:us-east-1a`.

## Falha, cancelamento e desligamento {#failure-cancellation-and-shutdown}

Heartbeats de atividade renovam a concessão da tentativa e a da sessão.
Workers também podem renovar a sessão diretamente pelo protocolo de workers.
Se a concessão da sessão expirar, a sessão passa a `expired`. Se o heartbeat
do registro do worker detentor estiver desatualizado ou ausente, passa a `orphaned`.

Quando o worker detentor morre no meio da sequência, atividades em andamento
mantêm o comportamento comum de pelo menos uma vez: as concessões das
tentativas expiram, o reparo as torna reivindicáveis novamente e conclusões
obsoletas podem ser rejeitadas. Um worker com as capacidades necessárias pode
readquirir a sessão quando o contrato permite. Autores de workflows devem
prever a reconstrução do estado local ao processo após a reaquisição.

O cancelamento do workflow continua sendo propagado nas respostas de heartbeat
das atividades. Uma concessão de sessão nunca autoriza uma atividade da sessão
a ignorar `cancel_requested`. Em um desligamento planejado, o worker deve
encerrar as sessões que detém por `DELETE /api/worker/sessions/{sessionId}`
antes de parar o processo. Atividades em andamento ainda concluem, falham,
são canceladas ou expiram sob suas próprias concessões de tentativa.

## Visibilidade {#visibility}

As capacidades do protocolo de workers anunciam `worker_session_verbs` e o
contrato de runtime `worker_sessions` por `GET /api/cluster/info` e por todas
as respostas do plano de workers. O contrato legível por máquina é publicado em
[`worker-sessions-runtime.schema.json`](/platform-protocol-specs/worker-sessions-runtime.schema.json)
e está indexado no catálogo de
[especificações do protocolo da plataforma](/docs/platform-protocol-specs#worker-session-runtime-notes).

Operadores podem listar sessões ativas, encerradas, expiradas, com falha ou
órfãs em `GET /api/worker-sessions`. A interface de detalhes inclui ID da
sessão, detentor, fila, requisitos, expiração da concessão, expiração do TTL,
contagem de atividades ativas e motivo da falha. As métricas do operador do
sistema incluem contagens para cada status de sessão.

## Quando escolher sessões de worker {#choosing-worker-sessions}

Prefira atividades comuns em fila quando cada etapa for independente. Prefira
uma atividade maior quando toda a operação for um único efeito colateral
atômico. Use uma sessão de worker apenas quando várias etapas duráveis de
atividade precisarem reutilizar um recurso local do worker e o workflow puder
tolerar sua reconstrução após uma falha do worker.

Consulte [Modelo de execução de atividades](/docs/features/activity-execution-model)
para entender a relação entre sessões de worker, atividades comuns em fila,
atividades locais e execução sticky.
