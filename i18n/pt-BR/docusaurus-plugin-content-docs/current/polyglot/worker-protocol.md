---
sidebar_position: 5
title: Protocolo de workers
description: Implemente o protocolo versionado do plano de workers para polling, leases, replay de histórico, heartbeats, conclusão e resultados de tarefas externas.
tags:
  - worker-protocol
  - external-workers
  - polyglot
keywords:
  - protocolo de workers
  - polling de workers externos
  - ponte de tarefas de workflow
---

# Protocolo de workers {#worker-protocol}

O Durable Workflow expõe um protocolo versionado de workers por dois contratos
de ponte. Esses contratos definem o conjunto completo de operações usadas por
workers externos, incluindo o servidor independente Durable Workflow, para
consultar, reservar, executar e concluir tarefas de workflow e atividade.

## Versão do protocolo {#protocol-version}

A versão atual anunciada pelo servidor é **1.20**. O protocolo segue numeração
no estilo semver:

- **Major** aumenta quando uma mudança é incompatível com versões anteriores
  (novos campos obrigatórios, operações removidas, semântica de paginação alterada).
- **Minor** aumenta para mudanças aditivas (novos campos opcionais, novos tipos de comando não terminal).

Workers podem usar uma minor anterior na mesma major. Um servidor anunciando
`1.N` aceita `X-Durable-Workflow-Protocol-Version: 1.M` quando `M <= N` e
retorna seu `1.N` anunciado na resposta. Portanto, o servidor padrão `1.20`
aceita requisições de `1.0` a `1.20`. Descubra a minor exigida e o perfil
opcional de capacidades de cada SDK antes de implantar. Cabeçalhos ausentes
ou malformados, majors diferentes e minors de worker mais novas que as do
servidor são rejeitados por segurança.

SDK PHP 2.3.2, SDK Python 2.5.7 e SDK Rust 3.5.0 usam `1.20` por padrão.
Esses releases também permitem selecionar `1.19` explicitamente para um
Server antigo compatível. Capacidades opcionais, incluindo cancelamento
cooperativo, continuam exigindo adesão explícita. Selecionar uma versão do
protocolo não as habilita. Veja a [documentação de cada SDK](/docs/polyglot/deployment-modes/)
para configuração e metadados publicados de compatibilidade.

Você pode obter a descrição completa do protocolo programaticamente:

```php
use Workflow\V2\Support\WorkerProtocolVersion;

$summary = WorkerProtocolVersion::describe();
// Returns version, verb lists, command types, and pagination defaults.
```

## Descoberta de capacidades {#capability-discovery}

O servidor independente publica capacidades do protocolo em
`worker_protocol.server_capabilities` em `GET /api/cluster/info`. O mesmo
objeto é repetido como `server_capabilities` nas respostas do plano de workers,
incluindo poll, heartbeat, conclusão e falha.

Leia estes campos antes de enviar campos opcionais de comando:

- `supported_workflow_task_commands`: tipos aceitos pela conclusão de tarefas de workflow.
- `poll_status`: respostas de poll contêm status legível por máquina mesmo
  sem tarefa sob lease, distinguindo `leased`, `empty`, `throttled` e
  `unavailable` sem obrigar clientes a inferir o estado da fila de `task: null`.
- `activity_retry_policy` e `activity_timeouts`: opções de novas tentativas e timeout de atividades.
- `worker_session_verbs` e `worker_sessions`: operações do ciclo de vida de
  sessões, campos de comando de atividade, renovação, detecção de falha e
  estados terminais. O formato de runtime de sessões é especificado por
  [`worker-sessions-runtime.schema.json`](/platform-protocol-specs/worker-sessions-runtime.schema.json).
- `child_workflow_retry_policy` e `child_workflow_timeouts`: opções de novas tentativas e timeout de workflows filhos.
- `parent_close_policy`: suporte à política de encerramento do pai de workflows filhos.
- `query_tasks`: tarefas de consulta roteadas pelo servidor para runtimes externos.
- `non_retryable_failures`: suporte a metadados de falhas não retentáveis de workflow e atividade.

Antes de fazer polling, cada worker deve registrar namespace, fila, runtime,
chaves de tipos suportadas e capacidade local por `POST /api/worker/register`.
A referência [Namespace, autenticação e registro de workers](/docs/polyglot/namespace-auth-workers)
congela esse payload e o contrato de autenticação com escopo por papel. Para
o contrato mais amplo de descoberta de tarefas prontas e atribuição de leases,
veja [Matching e despacho de tarefas](/docs/polyglot/task-matching-dispatch).
Para afinidade de atividades entre etapas duráveis, veja
[Sessões de worker](/docs/features/worker-sessions).

## Semântica de execução {#execution-semantics}

O transporte de workers é coordenação distribuída pelo menos uma vez, não
entrega exatamente uma vez:

- replay de tarefa de workflow reconstrói o estado do histórico confirmado;
  não é nova tentativa no nível do workflow
- expiração do lease de atividade pode causar reentrega a outro worker
- relatos tardios de conclusão ou falha podem ser rejeitados como antigos
  porque outra tentativa já venceu a disputa durável

Use `activity_execution_id` como chave padrão de idempotência remota quando
um worker ou transportador se comunicar com outro sistema. Use
`activity_attempt_id` somente quando o downstream precisar distinguir
tentativas separadas da mesma execução lógica de atividade.

Leia [Garantias de execução e idempotência](/docs/constraints/execution-guarantees)
para o contrato autoritativo de replay, novas tentativas, expiração de leases,
reentrega e histórico durável exatamente uma vez por trás dessas operações.

## Ponte de tarefas de workflow {#workflow-task-bridge}

O contrato `WorkflowTaskBridge` define como um worker externo interage com
tarefas duráveis de workflow:

| Operação | Descrição |
|------|-------------|
| `poll` | Encontra tarefas prontas de workflow que correspondam à fila e aos critérios de compatibilidade |
| `claim` / `claimStatus` | Reserva uma tarefa específica, adquirindo lease de 5 minutos |
| `historyPayload` | Obtém o histórico completo de replay de uma tarefa reservada |
| `historyPayloadPaginated` | Obtém histórico em páginas para workflows grandes |
| `execute` | Reserva e executa uma tarefa no processo usando o executor do pacote |
| `complete` | Envia comandos de um worker externo para concluir uma tarefa |
| `fail` | Registra uma falha de tarefa de um worker externo |
| `heartbeat` | Estende o lease de uma tarefa reservada |

### Histórico paginado {#paginated-history}

Para workflows com histórico grande, use `historyPayloadPaginated` para obter
eventos em páginas:

```php
use Workflow\V2\Contracts\WorkflowTaskBridge;

$bridge = app(WorkflowTaskBridge::class);

$afterSequence = 0;
$allEvents = [];

do {
    $page = $bridge->historyPayloadPaginated($taskId, $afterSequence, 500);
    $allEvents = array_merge($allEvents, $page['history_events']);
    $afterSequence = $page['next_after_sequence'] ?? $afterSequence;
} while ($page['has_more']);
```

O tamanho padrão de página é 500 eventos (correspondendo a
`WorkerProtocolVersion::DEFAULT_HISTORY_PAGE_SIZE` e ao `default_history_page_size`
publicado nas capacidades); o máximo é 1000. Servidores podem anunciar um
padrão efetivo diferente no manifesto, portanto prefira ler a capacidade
publicada a fixar qualquer número no código. A resposta inclui `has_more` e
`next_after_sequence` para paginação por cursor.

### Compressão de histórico {#history-compression}

Para históricos muito grandes, a ponte ou servidor pode comprimir o payload
de eventos para reduzir o tamanho de transferência. A compressão é opcional:
o chamador deve solicitá-la por um parâmetro no estilo `Accept-Encoding`.

Quando a contagem de eventos de uma resposta excede o limite de compressão
(50 eventos), a ponte pode retornar:

- `history_events`: `[]` (array vazio, indicando eventos na chave comprimida)
- `history_events_compressed`: payload comprimido codificado em base64
- `history_events_encoding`: algoritmo usado (`gzip` ou `deflate`)

O chamador descomprime decodificando base64, expandindo com o algoritmo
indicado e decodificando o JSON para recuperar o array original `history_events`.

```php
use Workflow\V2\Support\HistoryPayloadCompression;

// Compress a history payload for transfer (bridge/server side).
$compressed = HistoryPayloadCompression::compress($payload, 'gzip');

// Decompress on the worker side.
$original = HistoryPayloadCompression::decompress($compressed);
```

Se o chamador não solicitar compressão ou a contagem ficar abaixo do limite,
a resposta contém o array padrão não comprimido `history_events`.

### Semântica de long poll {#long-poll-semantics}

Ambas as operações `poll` suportam long poll opcional. Quando o chamador
inclui `timeout_seconds`, a ponte ou servidor mantém a conexão aberta até
essa duração, aguardando uma tarefa correspondente ficar pronta em vez de
retornar imediatamente um resultado vazio.

| Parâmetro | Padrão | Mínimo | Máximo |
|-----------|---------|-----|-----|
| `timeout_seconds` | 30 | 1 | 60 |

Comportamento:

- Se uma tarefa ficar pronta durante a espera, ela retorna imediatamente.
- Se o timeout expirar sem tarefa, a resposta mantém o envelope normal de
  poll e retorna `task: null` com `poll_status: "empty"`.
- O cliente deve repetir imediatamente uma resposta vazia de long poll, a
  menos que esteja encerrando.
- Timeouts HTTP do transporte devem ser maiores que 60 segundos para evitar
  desconexões prematuras.

Toda resposta de poll de worker inclui `poll_status`:

| Valor | Significado |
|------|---------|
| `leased` | O servidor concedeu lease de uma tarefa a este worker. |
| `empty` | Nenhuma tarefa correspondente ficou pronta antes de terminar o poll curto ou timeout de long poll. |
| `throttled` | Limites de admissão impediram a concessão de lease, embora a fila ainda possa ter tarefas prontas. |
| `unavailable` | A fila ou caminho de matching ficou temporariamente indisponível; o worker deve tratar o poll como falha transitória de infraestrutura. |

Decida por `poll_status` antes de supor que um poll vazio significa capacidade
ociosa. `task: null` com `poll_status: "throttled"` é controle de pressão,
não ausência de trabalho.

```php
use Workflow\V2\Support\WorkerProtocolVersion;

$semantics = WorkerProtocolVersion::longPollSemantics();
// ['default_timeout_seconds' => 30, 'min_timeout_seconds' => 1, 'max_timeout_seconds' => 60]

// Clamp a caller-supplied timeout to the valid range.
$clamped = WorkerProtocolVersion::clampLongPollTimeout($userTimeout);
```

### Status da resposta de poll {#poll-response-status}

O servidor mantém um contrato de resposta entre polls de tarefas de workflow,
atividade e consulta:

- `task`: payload da tarefa sob lease ou `null` quando o poll não concedeu trabalho.
- `poll_status`: resultado legível por máquina da tentativa de poll.
- `protocol_version` e `server_capabilities`: campos repetidos do manifesto do protocolo.

Workers devem decidir por `poll_status` antes de presumir algo sobre `task`
específico da rota:

| `poll_status` | Status HTTP típico | Significado |
| --- | --- | --- |
| `leased` | `200` | O servidor concedeu trabalho, e `task` contém o payload. |
| `empty` | `200` | Nenhuma tarefa correspondente ficou pronta antes do retorno. |
| `throttled` | `200` | Limites de admissão retiveram um novo lease nesta tentativa. |
| `unavailable` | `503` ou `200` | O servidor não conseguiu coordenar a fila com segurança e retornou indisponibilidade tipada. |
| `draining` | `409` | A coorte de build id do worker está drenando; o servidor recusa novos leases e retorna `reason: "worker_draining"`. |

### Requisições de conclusão, heartbeat e falha {#completion-heartbeat-and-fail-requests}

Endpoints de workflow `complete`, `heartbeat` e `fail` exigem que o worker
repita dois campos de identidade do lease retornados por poll ou reserva:

| Campo | Tipo | Descrição |
|------|------|-------------|
| `lease_owner` | string | Identidade do worker detentor do lease. Deve corresponder ao `lease_owner` retornado por `poll` ou `claim`. |
| `workflow_task_attempt` | inteiro ≥ 1 | Número da tentativa da tarefa sob lease. Deve corresponder ao `workflow_task_attempt` retornado por `poll` ou `claim`. |

Tentativas antigas ou detentores incorretos são rejeitados antes de aplicar
qualquer comando, para que um worker expirado não confirme comandos de replay
em uma tarefa reservada novamente.

Endpoints e corpos de requisição:

- `POST /api/worker/workflow-tasks/{task_id}/complete`: exige `lease_owner`,
  `workflow_task_attempt` e array `commands` não vazio. Veja
  [Tipos de comando](#command-types) para os formatos.
- `POST /api/worker/workflow-tasks/{task_id}/heartbeat`: exige `lease_owner`
  e `workflow_task_attempt`. Retorna expiração renovada do lease e status atual da execução.
- `POST /api/worker/workflow-tasks/{task_id}/fail`: exige `lease_owner`,
  `workflow_task_attempt` e objeto `failure` com `message` obrigatório e
  `type` e `stack_trace` opcionais.

Exemplo de requisição de conclusão:

```json
{
  "lease_owner": "py-worker-1",
  "workflow_task_attempt": 1,
  "commands": [
    { "type": "complete_workflow" }
  ]
}
```

Exemplo de requisição de heartbeat:

```json
{
  "lease_owner": "py-worker-1",
  "workflow_task_attempt": 1
}
```

Exemplo de requisição de falha:

```json
{
  "lease_owner": "py-worker-1",
  "workflow_task_attempt": 1,
  "failure": {
    "message": "Replay mismatch at event 7",
    "type": "DeterminismFailed"
  }
}
```

### Tipos de comando {#command-types}

Ao concluir uma tarefa, o worker externo envia uma lista de comandos tipados.
No máximo um comando terminal é permitido por conclusão.

**Comandos não terminais** (zero ou mais, processados em ordem):

| Tipo | Campos obrigatórios | Descrição |
|------|----------------|-------------|
| `schedule_activity` | `activity_type` | Agenda uma tarefa de atividade para execução |
| `start_timer` | `delay_seconds` | Agenda um temporizador durável |
| `start_child_workflow` | `workflow_type` | Inicia uma instância de workflow filho |
| `complete_update` | `update_id` | Marca uma atualização aceita como aplicada e concluída |
| `fail_update` | `update_id`, `message` | Marca uma atualização aceita como falha |
| `record_side_effect` | `result` | Registra um resultado determinístico de efeito colateral |
| `record_version_marker` | `change_id`, `version`, `min_supported`, `max_supported` | Registra uma decisão de versionamento |
| `upsert_search_attributes` | `attributes` | Insere ou atualiza metadados indexados na execução |

`schedule_activity` aceita campos opcionais `retry_policy`,
`start_to_close_timeout`, `schedule_to_start_timeout`,
`schedule_to_close_timeout` e `heartbeat_timeout`. `retry_policy` usa
`max_attempts`, `backoff_seconds` e `non_retryable_error_types`.

`start_child_workflow` aceita `parent_close_policy`, `retry_policy`,
`execution_timeout_seconds` e `run_timeout_seconds` opcionais.
`parent_close_policy` é `abandon`, `request_cancel`, `request_cancellation`
ou `terminate`. `request_cancel` fecha o filho imediatamente;
`request_cancellation` solicita limpeza cooperativa com identidade e prazo
originais do cancelamento. Veja [cancelamento cooperativo](/docs/polyglot/cancellation).
A política de novas tentativas do filho usa o mesmo objeto `max_attempts`,
`backoff_seconds` e `non_retryable_error_types` das atividades. Backoff se
aplica após uma execução filha falhar; comandos de início inválidos são erros
de protocolo e não consomem tentativas do filho.

`complete_update` fecha a atualização aceita nomeada por `update_id` depois
de o worker aplicar seu handler. Aceita `result` opcional no mesmo envelope
`{codec, blob}` de resultados de conclusão de workflow. `fail_update` fecha
a atualização aceita como falha e aceita `exception_class`, `exception_type`
e `non_retryable` opcionais além de `message` obrigatório.

**Comandos terminais** (no máximo um):

| Tipo | Campos obrigatórios | Descrição |
|------|----------------|-------------|
| `complete_workflow` | — | Marca a execução como concluída (`result` opcional) |
| `fail_workflow` | `message` | Marca a execução como falha |
| `continue_as_new` | — | Fecha a execução e inicia outra (`arguments`, `workflow_type` opcionais) |

Se um comando de cancelamento ou terminação fechar a execução enquanto uma
tarefa de workflow está sob lease, chamadas `history`, `heartbeat`, `complete`
e `fail` mantêm o envelope do protocolo, mas rejeitam com `reason: "run_closed"`.
A resposta também inclui `can_continue: false`, `cancel_requested: true` e um
`stop_reason` concreto como `run_cancelled` ou `run_terminated`, para distinguir
a observação de cancelamento de erro genérico de lease. A mesma resposta
inclui `run_closed_reason` e `run_closed_at` do registro durável para registrar
o estado exato de fechamento que parou a tarefa.

Respostas de poll de workflow incluem contexto estável de retomada copiado
do payload durável da tarefa:

| Campo | Significado |
|------|---------|
| `workflow_wait_kind` | Espera aplicada pela tarefa: `update`, `signal`, `child`, `condition`, `timer` ou `null` para tarefas comuns de replay/início |
| `open_wait_id` | Identidade estável da espera, como `update:{id}` ou `signal-application:{id}` |
| `resume_source_kind` / `resume_source_id` | Origem durável que despertou a tarefa, como `workflow_update`, `workflow_signal`, `timer` ou `child_workflow_run` |
| `workflow_update_id` | ID da atualização aceita quando a tarefa aplica uma atualização |
| `workflow_signal_id` | ID do sinal aceito quando a tarefa aplica um sinal |
| `signal_name` / `signal_wait_id` | Destino do sinal e identidade estável da espera quando a tarefa aplica um sinal ou espera por sinal com temporizador |
| `workflow_command_id` | ID do comando do plano de controle que produziu a tarefa, quando disponível |
| `activity_execution_id` / `activity_attempt_id` / `activity_type` | Identificadores da atividade quando a tarefa retoma após uma atividade concluída ou com falha |
| `child_call_id` / `child_workflow_run_id` | Identificadores de espera por filho quando a tarefa resolve um workflow filho |
| `timer_id` / `condition_wait_id` | Identificadores de temporizador puro e condição com temporizador ao retomar após um temporizador |
| `condition_key` / `condition_definition_fingerprint` | Rótulo estável de condição e fingerprint do predicado quando registrados por uma espera de condição com temporizador |
| `workflow_sequence` / `workflow_event_type` | Sequência de histórico e tipo do evento para tarefas de resolução de atividade, filho e temporizador baseadas em eventos |

Campos não aplicáveis são `null`. Workers SDK devem preferir esses campos a
varrer o histórico para correlacionar uma tarefa sob lease a atualização
aceita, sinal, resultado de atividade, resolução de filho ou espera com
temporizador. Retomadas de temporizador puro definem
`workflow_wait_kind: "timer"`, `open_wait_id: "timer:{timer_id}"`,
`resume_source_kind: "timer"` e `timer_id`. Retomadas por sinal definem
`workflow_wait_kind: "signal"` e `signal_name`; tarefas de aplicação de sinal
aceito também definem `workflow_signal_id`, e esperas por sinal com
temporizador definem `signal_wait_id` com o `timer_id` disparado. Retomadas de
timeout de condição definem `workflow_wait_kind: "condition"`,
`condition_wait_id` e, para esperas com chave, `condition_key` e
`condition_definition_fingerprint`.

## Tarefas de consulta {#query-tasks}

Quando uma consulta do plano de controle aponta para um workflow cujo código
pertence a um runtime externo, o servidor independente não pode reproduzi-lo
no processo PHP. Em vez disso, cria uma tarefa efêmera de consulta e aguarda
um worker ativo com capacidade de consulta na fila do workflow. Isso inclui
workers remotos do SDK PHP cujo código de workflow está fora do processo Server.

Consultas são somente leitura. Workers reproduzem o histórico fornecido,
invocam o handler registrado e concluem ou falham a tarefa. Não gravam eventos
duráveis nem repetem a tarefa após o timeout da consulta do chamador no plano de controle.

| Endpoint | Descrição |
|----------|-------------|
| `POST /api/worker/query-tasks/poll` | Faz long poll por consulta na fila registrada do worker |
| `POST /api/worker/query-tasks/{query_task_id}/complete` | Envia o resultado da consulta |
| `POST /api/worker/query-tasks/{query_task_id}/fail` | Rejeita ou falha a consulta |

Requisição de poll:

```json
{
  "worker_id": "py-worker-1",
  "task_queue": "orders"
}
```

Resposta de poll:

```json
{
  "poll_status": "leased",
  "task": {
    "query_task_id": "01J...",
    "query_task_attempt": 1,
    "workflow_id": "order-123",
    "run_id": "01J...",
    "workflow_type": "order-processing",
    "query_name": "status",
    "payload_codec": "avro",
    "workflow_arguments": { "codec": "avro", "blob": "<base64-avro-bytes>" },
    "query_arguments": { "codec": "avro", "blob": "<base64-avro-bytes>" },
    "history_events": [],
    "task_queue": "orders",
    "lease_owner": "py-worker-1",
    "lease_expires_at": "2026-04-18T12:00:00.000000Z"
  },
  "protocol_version": "1.13",
  "server_capabilities": { "query_tasks": true }
}
```

`task` é `null` quando o poll não retorna lease. Use `poll_status` para
distinguir espera vazia normal de limitação ou indisponibilidade temporária.
O worker deve repetir `lease_owner` e `query_task_attempt` na conclusão ou
falha; tentativas antigas e detentores incorretos são rejeitados.

Requisição de conclusão:

```json
{
  "lease_owner": "py-worker-1",
  "query_task_attempt": 1,
  "result": { "status": "ready" },
  "result_envelope": { "codec": "avro", "blob": "<base64-avro-bytes>" }
}
```

Requisição de falha:

```json
{
  "lease_owner": "py-worker-1",
  "query_task_attempt": 1,
  "failure": {
    "reason": "rejected_unknown_query",
    "message": "unknown query 'status'",
    "type": "QueryFailed"
  }
}
```

Use `reason: "rejected_unknown_query"` quando o tipo de workflow não tiver
handler correspondente; o chamador recebe `404`. Outras falhas de consulta
no worker devem usar `reason: "query_rejected"` e retornar `409`. Sem worker
ativo que aceite a consulta, o plano de controle retorna
`query_worker_unavailable`; sem resultado antes do timeout configurado,
retorna `query_worker_timeout`.

## Ponte de tarefas de atividade {#activity-task-bridge}

O contrato `ActivityTaskBridge` define como um worker externo interage com tarefas de atividade:

| Operação | Descrição |
|------|-------------|
| `poll` | Encontra tarefas prontas de atividade por fila e compatibilidade |
| `claim` / `claimStatus` | Reserva uma tarefa específica de atividade com lease |
| `complete` | Registra conclusão de atividade com resultado |
| `fail` | Registra falha de atividade com `failure.details` opcional com tag de codec |
| `status` | Verifica liveness e cancelamento sem renovar o lease |
| `heartbeat` | Estende o lease e informa progresso opcional |

Respostas de heartbeat incluem `can_continue` e `cancel_requested`, permitindo
a atividades longas reagir a solicitações de cancelamento. Quando cancelar
ou terminar no nível da execução para uma atividade sob lease, respostas de
heartbeat, conclusão e falha também incluem `run_closed_reason` e `run_closed_at`.

## Codecs de payload {#payload-codecs}

Cada string de bytes de payload que cruza o limite do protocolo recebe uma
tag **`payload_codec`** nomeando o formato do blob. A v2 usa um codec
independente de linguagem: **`avro`**, permitindo que qualquer SDK (PHP,
Python, Go, TypeScript, Rust) codifique e decodifique sem compartilhar runtime
ou chave de aplicação. O servidor anuncia suporte a codecs em
`GET /api/cluster/info`, em **`capabilities.payload_codecs`**.

### O codec `avro` {#the-avro-codec}

`avro` é o codec de valores tipados v2. Todo payload usa o schema recursivo
fixo `durable_workflow.protocol.Value` e frames padrão de objeto único Avro.
Suas variantes nomeadas preservam booleanos, inteiros de 64 bits com sinal,
doubles finitos, bytes, strings UTF-8, listas e mapas com chaves string sem
schemas por workflow ou registro. Veja o
[protocolo Avro Value](/docs/polyglot/avro-value-protocol/).

### Formato de transmissão: envelope de payload {#wire-format-payload-envelope}

Nos campos que contêm bytes (`arguments`, `result`, `payload` etc.), o
protocolo apresenta o codec junto à string opaca. Respostas de poll têm esta forma:

```json
{
  "task_id": "...",
  "payload_codec": "avro",
  "arguments": {
    "codec": "avro",
    "blob": "<base64-avro-bytes>"
  },
  "history_events": [ ... ]
}
```

O worker lê `payload_codec` e confirma `avro` antes de decodificar. Um valor
desconhecido é erro; o worker não deve tentar detectar ou adivinhar o formato.

Conclusões de atividade enviam `result` no mesmo envelope `{codec, blob}`.
Falhas podem enviar diagnósticos estruturados em `failure.details`; quando
presente, também é um envelope `{codec, blob}`. O servidor guarda o blob
literalmente e registra `details_payload_codec` com o payload durável da
falha, permitindo a workers não PHP preservar diagnósticos sem serialização PHP.

A interface estável de falhas entre linguagens é `activity_type`,
`failure_category`, `exception_type`, `message`, `code`, `non_retryable` e
`details` com tag de codec. Campos de runtime como nomes de classes de exceção,
caminhos de arquivos-fonte, linhas e stack traces são apenas diagnósticos.
SDKs não devem expô-los em seu `exception_payload` padrão; só podem
apresentá-los quando worker ou servidor registrar explicitamente um envelope
`diagnostics` ou `runtime_diagnostics`.

### Iniciar um workflow {#starting-a-workflow}

`POST /api/workflows` aceita `input` em dois formatos:

1. **Array JSON simples**: o servidor adapta cada valor ao schema fixo Avro
   Value. JSON não expressa a variante de bytes; clientes que precisam de
   bytes enviam um envelope Avro explícito.

   ```json
   { "workflow_type": "MyWorkflow", "input": ["hello", 42] }
   ```

2. **Envelope explícito**: para clientes que já possuem bytes pré-codificados:

   ```json
   {
     "workflow_type": "MyWorkflow",
     "input": { "codec": "avro", "blob": "<base64-avro-bytes>" }
   }
   ```

O servidor guarda o blob literalmente e marca a execução com o codec `avro`.

O codec é armazenado em `WorkflowRun` e **se propaga por toda a vida da
execução**: argumentos e resultados de atividades, argumentos de
sinais/atualizações e entradas de workflows filhos são todos codificados em Avro.

Inícios embarcados/do pacote (workflows iniciados em PHP por
`WorkflowStub::make(...)->start(...)` em vez da API HTTP) também resolvem o
padrão de novas execuções pelo contrato final v2 exclusivo de Avro.

## Resolver as pontes {#resolving-the-bridges}

Ambas as pontes são registradas no container Laravel e podem ser resolvidas diretamente:

```php
use Workflow\V2\Contracts\WorkflowTaskBridge;
use Workflow\V2\Contracts\ActivityTaskBridge;

$workflowBridge = app(WorkflowTaskBridge::class);
$activityBridge = app(ActivityTaskBridge::class);
```

## Guias relacionados {#related-guides}

- [Server](./server.md) documenta endpoints do plano de controle e formato de
  implantação que hospedam este protocolo.
- [Interface de execução externa](./external-execution.md) explica os
  contratos de worker, ponte e handler com garantias de atividade construídos
  sobre o protocolo de workers.
