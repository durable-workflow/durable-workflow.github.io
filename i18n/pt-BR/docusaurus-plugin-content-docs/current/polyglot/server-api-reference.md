---
sidebar_position: 3
title: Referência da API do Server
description: Referência HTTP dos endpoints do servidor Durable Workflow para planos de controle e workers, namespaces, armazenamento, agendamentos e sistema.
tags:
  - server
  - API
  - reference
  - control-plane
keywords:
  - API do servidor Durable Workflow
  - cabeçalho de versão do plano de controle
  - endpoints do protocolo de workers
  - API de armazenamento externo de payloads
---

# Referência da API do Server {#server-api-reference}

O servidor independente expõe uma API HTTP+JSON versionada. Use esta página ao
criar SDKs, scripts, adaptadores de ponte ou runbooks que chamem o servidor
diretamente. Use o [guia do servidor](/docs/polyglot/server) para implantação
e configuração e a [referência de comandos da CLI](/docs/polyglot/cli-reference)
ao executar `dw` no shell.

## Cabeçalhos e versionamento {#headers-and-versioning}

Todas as requisições autenticadas usam tokens bearer, a menos que o servidor
esteja configurado com outro driver:

```http
Authorization: Bearer <token>
X-Namespace: default
Content-Type: application/json
Accept: application/json
```

Rotas do plano de controle exigem:

```http
X-Durable-Workflow-Control-Plane-Version: 2
```

Rotas do plano de workers exigem:

```http
X-Durable-Workflow-Protocol-Version: 1.0
```

O servidor publica versões suportadas e contratos legíveis por máquina em
`GET /api/cluster/info`. Clientes devem descobrir as versões ali antes de
iniciar automações de longa duração. Versões de controle ausentes ou sem
suporte são rejeitadas com motivo nomeado, como `missing_control_plane_version`
ou `unsupported_control_plane_version`.

Para validação, geração de código e verificações de divergência, use o
catálogo normativo [Especificações de protocolo da plataforma](/docs/platform-protocol-specs)
em vez desta referência em prosa. Ele vincula o OpenAPI do plano de controle,
OpenAPI e AsyncAPI de workers, JSON Schema de `cluster_info` e schemas
adjacentes de MCP, histórico, Waterline e reparo/ações disponíveis.

## Descoberta e saúde {#discovery-and-health}

Estas rotas são usadas por balanceadores, inicialização de SDKs e verificações
de compatibilidade.

| Método | Caminho | Autenticação | Finalidade |
| --- | --- | --- | --- |
| `GET` | `/api/health` | não | Sondagem de liveness e resumo de topologia legível por máquina do nó que respondeu. |
| `GET` | `/api/ready` | não | Sondagem de prontidão, mesmo resumo de topologia e verificações de bootstrap de segurança de rollout. |
| `GET` | `/api/cluster/info` | sim | Identidade do servidor, faixas de SDK suportadas, topologia de papéis, resumo da saúde da coordenação, contratos de controle e workers, codecs e capacidades. |

Exemplo:

<!-- docs-example id="server.cluster-info.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/cluster/info" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" | jq '.control_plane.version, .worker_protocol.version'
```

`/api/cluster/info` intencionalmente não exige cabeçalho de versão do plano
de controle porque é o endpoint que anuncia as versões suportadas. A mesma
resposta inclui `coordination_health`, resumo de rollout e prontidão de todos
os namespaces que espelha as verificações que já alimentam a prontidão do servidor.

### Resumo público de topologia {#public-topology-summary}

`GET /api/health` e `GET /api/ready` retornam um objeto `topology` no topo do
contrato implementado de resumo de saúde. Use-o para identificar qual nó
respondeu antes de terem sucesso autenticação do controle, resolução de
namespace ou descoberta mais ampla em `/api/cluster/info`.

O resumo público sempre inclui:

- `topology.schema`
- `topology.version`
- `topology.current_shape`
- `topology.current_process_class`
- `topology.current_roles`
- `topology.execution_mode`
- `topology.matching_role.queue_wake_enabled`
- `topology.matching_role.shape`
- `topology.matching_role.wake_owner`
- `topology.matching_role.task_dispatch_mode`
- `topology.matching_role.partition_primitives`
- `topology.matching_role.backpressure_model`
- `topology.matching_role.discovery_limits.poll_batch_cap`
- `topology.matching_role.discovery_limits.availability_ceiling_seconds`
- `topology.matching_role.discovery_limits.wake_signal_ttl_seconds`
- `topology.matching_role.discovery_limits.workflow_task_lease_seconds`
- `topology.matching_role.discovery_limits.activity_task_lease_seconds`

`topology.matching_role.discovery_limits` é o contrato numérico congelado do
matching: `poll_batch_cap` é o lote máximo de linhas de tarefas prontas
retornado por poll; `availability_ceiling_seconds` é a tolerância entre
backends aplicada a `available_at` para tarefas recém-disponíveis resistirem
a divergências de timestamp inferiores a um segundo; `wake_signal_ttl_seconds`
é o TTL padrão de sinais de `CacheLongPollWakeStore`; e
`workflow_task_lease_seconds` / `activity_task_lease_seconds` são as durações
padrão dos leases. Tornar esses valores mais restritivos é mudança de
protocolo, pois workers e ferramentas downstream os leem como contrato
autoritativo; renomear um campo também é quebra de protocolo.

`/api/ready` retorna o mesmo bloco `topology` mesmo com `status` geral
`not_ready`, para que sondagens ainda distingam respostas de
`server_http_node`, `scheduler_node`, `matching_node` e `execution_node`
enquanto houver impedimentos de bootstrap.

Exemplo:

<!-- docs-example id="server.health.topology.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/health" | jq '{
  status,
  topology: {
    schema: .topology.schema,
    version: .topology.version,
    current_shape: .topology.current_shape,
    current_process_class: .topology.current_process_class,
    current_roles: .topology.current_roles,
    execution_mode: .topology.execution_mode,
    matching_role: .topology.matching_role
  }
}'
```

### Impedimentos de prontidão {#readiness-blockers}

`GET /api/ready` retorna `status` no topo e `checks` legíveis por máquina.
Duas verificações definem se o servidor pode avaliar com segurança a saúde
da segurança de rollout:

- `checks.migrations` é o bloqueio de bootstrap e migração. Publica
  `repository_exists`, `pending_migrations`, `adoptable_migrations`,
  `blocking_migrations`, `missing_tables`, `operator_surface` e `readiness_contract`.
- `adoptable_migrations` significa que tabelas de workflow existentes só
  precisam de adoção do histórico de migração. O servidor permanece pronto e
  informa `status: "warning"` para programar a adoção antes da próxima passagem de migração.
- `blocking_migrations` significa que registros de migração da segurança de
  rollout ainda são necessários. O servidor rejeita por segurança com
  `status: "pending"` e uma string `remediation` em vez de atender como se a
  frota estivesse atualizada.
- `operator_surface.available` e `operator_surface.required_tables` informam
  se a interface operacional v2 tem as tabelas duráveis necessárias para
  explicar a segurança de rollout após iniciar.
- `readiness_contract.version` fixa a revisão do contrato de instalação e
  adoção esperada por scripts ao interpretar esses campos.
- `checks.workflow_v2` espelha o veredito de segurança de rollout de todos os
  namespaces. Sem pré-requisitos de prontidão, informa `status: "blocked"` e
  acrescenta `blocked_by`, `message` e `remediation` em vez de fingir saúde da frota.

Exemplo:

<!-- docs-example id="server.ready.blockers.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/ready" | jq '{
  status,
  migrations: {
    status: .checks.migrations.status,
    adoptable_migrations: .checks.migrations.adoptable_migrations,
    blocking_migrations: (.checks.migrations.blocking_migrations | map(.migration)),
    missing_tables: .checks.migrations.missing_tables,
    operator_surface: .checks.migrations.operator_surface,
    readiness_contract: .checks.migrations.readiness_contract
  },
  workflow_v2: {
    status: .checks.workflow_v2.status,
    blocked_by: .checks.workflow_v2.blocked_by,
    remediation: .checks.workflow_v2.remediation
  }
}'
```

### Manifesto de topologia do cluster {#cluster-topology-manifest}

`/api/cluster/info` retorna o manifesto `topology` do nó no schema
`durable-workflow.v2.role-topology`. É a forma suportada de descobrir se o
nó atua como `standalone_server`, `embedded` ou `split_control_execution`,
quais papéis controla e o que se espera de `matching_role`,
`shape_assignments`, `authority_boundaries`, `failure_domains`,
`scaling_boundaries` e `migration_path`. A mesma resposta publica o estado
atual de segurança de rollout desse nó.

Leia o manifesto assim:

- `topology.current_shape`, `topology.current_process_class`,
  `topology.current_roles` e `topology.execution_mode` informam qual formato
  de papéis o nó está servindo. Descrevem o nó que respondeu, não a frota inteira.
- `topology.role_vocabulary` é a lista fixa de nomes válidos de papéis v2.
- `topology.matching_role.queue_wake_enabled`,
  `topology.matching_role.shape`, `topology.matching_role.wake_owner`,
  `topology.matching_role.task_dispatch_mode`,
  `topology.matching_role.partition_primitives` e
  `topology.matching_role.backpressure_model` informam se a descoberta ampla
  ocorre no worker ou por varredura dedicada de matching, qual processo a
  controla, quais eixos de roteamento ficam estáveis e qual limite durável
  de admissão a v2 aplica hoje.
- `topology.matching_role.discovery_limits` publica os números congelados:
  `poll_batch_cap`, `availability_ceiling_seconds`, `wake_signal_ttl_seconds`,
  `workflow_task_lease_seconds` e `activity_task_lease_seconds`. Use-os para
  verificar a implantação contra o contrato documentado; o pacote emite os
  mesmos identificadores em `dw server:info`, no snapshot de métricas de
  operação e na interface de saúde por namespace.
- `topology.role_catalog` e `topology.authority_surfaces` mapeiam os papéis
  para interfaces, escritas duráveis e caminhos de leitura esperados nesse nó.
- `topology.shape_assignments` é o inventário legível por máquina de classes
  de processo de cada formato. Compare o conjunto atual de papéis com essa
  tabela para mapear o nó a uma classe documentada.
- `topology.supported_topologies` resume famílias de implantação suportadas
  e classes de nó esperadas por cada uma.
- `coordination_health` resume risco de rollout e compatibilidade da frota
  em um bloco legível por máquina. Além de `status` e `http_status`, pode
  publicar `blocked_by`, `message` e `remediation` quando a avaliação estiver
  bloqueada por problemas prévios, como migrações ausentes ou banco inacessível.
- `coordination_health.checks[]` sempre inclui a verificação congelada
  `activity_path` junto de `worker_compatibility`, `task_transport`,
  `routing_health`, `durable_resume_paths` e verificações de projeção/agendador.
  `activity_path` é a contraparte de atividades de `task_transport`: expõe
  execuções com prazo schedule-to-start, start-to-close, schedule-to-close ou
  heartbeat vencido sem aplicação (`timeout_overdue`,
  `oldest_timeout_overdue_at`, `max_timeout_overdue_age_ms`) e backlog
  sustentado de novas tentativas (`retrying`, `oldest_retrying_started_at`,
  `max_retrying_age_ms`). Renomeá-la é mudança de protocolo.
- `coordination_health.routing_drains` resume coortes de build id drenando
  entre namespaces e filas. Use `queues_with_drains` e entradas `build_ids`
  por fila para ver onde o tráfego é intencionalmente desviado de workers drenando.
- `execution_mode` distingue execução embarcada `local_queue_worker` de
  execução por protocolo `remote_worker_protocol`.
- `split_control_execution` é topologia suportada do produto, não outro
  produto servidor nem uma API diferente.

Exemplo:

<!-- docs-example id="server.cluster-info.topology.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/cluster/info" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  | jq '{
    current_shape: .topology.current_shape,
    current_roles: .topology.current_roles,
    execution_mode: .topology.execution_mode,
    matching_role: .topology.matching_role,
    coordination_health: {
      status: .coordination_health.status,
      http_status: .coordination_health.http_status,
      blocked_by: .coordination_health.blocked_by,
      queues_with_drains: .coordination_health.routing_drains.queues_with_drains
    }
  }'
```

Para o contrato conceitual, incluindo vocabulário de papéis e caminho de
migração, veja [Topologia de papéis do Server](/docs/polyglot/server-role-topology).

### Rejeições de topologia por nó incorreto {#wrong-node-topology-rejections}

Rotas hospedadas autenticadas são rejeitadas por segurança quando o nó não
hospeda a interface de controle HTTP exigida. O bloqueio ocorre após validar
papel e versão, mas antes de resolver namespace, para que requisições ao nó
incorreto não revelem a existência do namespace.

Ao bloquear, o servidor retorna `503` com
`reason: "topology_role_unavailable"`, mais:

- `current_shape`: formato anunciado pelo nó que respondeu.
- `current_process_class`: classe de processo declarada, como `scheduler_node`
  ou `execution_node`.
- `current_roles`: papéis realmente hospedados pelo nó.
- `required_roles`: papéis da rota hospedada exigidos pelo endpoint.
- `missing_roles`: subconjunto de `required_roles` ausente no nó.

Rotas de controle retornam o payload no envelope do plano de controle. Rotas
de workers retornam os mesmos campos no envelope do protocolo de workers e
mantêm o cabeçalho normal de versão.

Exemplo de resposta de `GET /api/workflows` ao chegar em um nó somente de agendador:

```json
{
  "reason": "topology_role_unavailable",
  "message": "This node does not host the topology roles required for this endpoint.",
  "current_shape": "standalone_server",
  "current_process_class": "scheduler_node",
  "current_roles": ["scheduler"],
  "required_roles": ["api_ingress", "control_plane"],
  "missing_roles": ["api_ingress", "control_plane"]
}
```

`GET /api/health`, `GET /api/ready` e `GET /api/cluster/info` autenticado
continuam disponíveis para liveness e descoberta mesmo em nós que não
hospedam a interface atual de controle HTTP.

### Bloqueio de bootstrap do workflow {#workflow-bootstrap-gate}

Rotas autenticadas que alteram ou atendem tráfego workflow v2 também são
rejeitadas quando `checks.workflow_v2.status` do nó é `blocked`. O bloqueio
ocorre após validar papel e versão, antes de resolver namespace, portanto
uma requisição durante rollout bloqueado nunca observa a existência do namespace.

Quando acionado, retorna `503` com `reason: "workflow_v2_blocked"`, mais:

- `blocked_by`: lista ordenada de impedimentos prévios (como `migrations`)
  que impedem workflow v2 de atender com segurança.
- `remediation`: instrução curta para resolver os impedimentos, espelhada
  do campo `checks.workflow_v2.remediation` de `/api/ready`.

As famílias bloqueadas pelo bootstrap são:

- **Início e mutação de workflow**: todas as rotas `/api/workflows` nos
  grupos de início, descrição, comandos e comandos por execução (por exemplo,
  `POST /api/workflows`, `POST /api/workflows/{workflowId}/signal/{signalName}`,
  `POST /api/workflows/{workflowId}/runs/{runId}/cancel`).
- **Mutação de agendamento**: `POST /api/schedules`,
  `PUT /api/schedules/{scheduleId}`, `DELETE /api/schedules/{scheduleId}`,
  `POST /api/schedules/{scheduleId}/pause`,
  `POST /api/schedules/{scheduleId}/resume`,
  `POST /api/schedules/{scheduleId}/trigger` e
  `POST /api/schedules/{scheduleId}/backfill`.
- **Adaptadores de ponte**: `POST /api/bridge-adapters/webhook/{adapter}`.
- **Protocolo de workers**: todas as rotas `/api/worker` e `/api/worker/*`,
  incluindo registro, heartbeat e operações de poll/conclusão/falha/heartbeat
  de tarefas de workflow, consulta e atividade.

**Leituras** de agendamento são intencionalmente isentas para permitir
inspeção na recuperação: `GET /api/schedules`,
`GET /api/schedules/{scheduleId}` e
`GET /api/schedules/{scheduleId}/history` continuam atendendo enquanto o
bloqueio impede outras rotas.

Rotas de controle retornam o payload no envelope do plano de controle,
incluindo `X-Durable-Workflow-Control-Plane-Version`. Rotas de workers
retornam `reason`, `blocked_by` e `remediation` no envelope de workers e
mantêm `X-Durable-Workflow-Protocol-Version` para decidir pelo motivo legível
por máquina em vez de inferir estado da fila de um `503` isolado.

Exemplo de resposta de `POST /api/workflows` enquanto falta uma migração de
segurança de rollout:

```json
{
  "reason": "workflow_v2_blocked",
  "message": "This node is not ready to serve workflow v2 traffic until bootstrap blockers are cleared.",
  "blocked_by": ["migrations"],
  "remediation": "Restore database connectivity and migrate the workflow tables before relying on workflow v2 rollout-safety health."
}
```

O mesmo payload retorna no envelope de workers em `/api/worker/*`, para
que SDKs continuem decidindo por `reason` e repetindo após resolver o impedimento anterior.

### Saúde do sistema por namespace {#namespace-scoped-system-health}

`GET /api/system/health` é a interface autenticada de saúde da coordenação e
segurança de rollout de um namespace. Exige admin e
`X-Durable-Workflow-Control-Plane-Version: 2`, resolve namespace pelas regras
normais de controle e retorna o namespace exato avaliado e o snapshot atual `health`:

<!-- docs-example id="server.system-health.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/system/health" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  | jq '{namespace, status: .health.status, healthy: .health.healthy}'
```

Interprete o payload assim:

- `namespace`: namespace cujo estado de rollout/coordenação foi avaliado.
- `health.status` e `health.healthy`: veredito geral legível por máquina desse namespace.
- `health.checks` e `health.categories`: fatos de prontidão, compatibilidade,
  projeção e coordenação por interface.
- `health.operator_metrics`: métricas atuais de filas, workers e reparo do
  namespace incluídas no mesmo snapshot.
- `health.structural_limits`: limites estruturais efetivos e diagnósticos
  relacionados aplicados a esse namespace.

## Plano de controle de workflows {#workflow-control-plane}

Rotas de workflow são rotas de operador/plano de controle. Exigem papel
operator ou admin e `X-Durable-Workflow-Control-Plane-Version: 2`.

| Método | Caminho | Finalidade |
| --- | --- | --- |
| `GET` | `/api/workflows` | Lista instâncias de workflow. Suporta filtros como status, tipo, texto de consulta e limite. |
| `POST` | `/api/workflows` | Inicia uma instância de workflow. |
| `GET` | `/api/workflows/{workflowId}` | Descreve a execução atual de um ID de workflow. |
| `GET` | `/api/workflows/{workflowId}/debug` | Retorna diagnósticos limitados para investigar execução presa. |
| `GET` | `/api/workflows/{workflowId}/runs` | Lista execuções de um ID de workflow. |
| `GET` | `/api/workflows/{workflowId}/runs/{runId}` | Descreve uma execução específica. |
| `GET` | `/api/workflows/{workflowId}/runs/{runId}/debug` | Retorna diagnósticos limitados de uma execução selecionada. |
| `GET` | `/api/workflows/{workflowId}/runs/{runId}/history` | Pagina eventos do histórico da execução. |
| `GET` | `/api/workflows/{workflowId}/runs/{runId}/history/export` | Exporta o pacote de replay de arquivo da execução. |

Requisições de início usam o formato de controle independente de linguagem:

<!-- docs-example id="server.workflow-start.curl" -->
```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/workflows" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_type": "orders.fulfillment",
    "workflow_id": "order-1001",
    "task_queue": "orders",
    "input": ["order-1001"],
    "memo": {"source": "api-reference"},
    "search_attributes": {"CustomerId": "cust-42"},
    "duplicate_policy": "fail"
  }'
```

`duplicate_policy` aceita somente `fail` e `use-existing`. Omitir o campo ou
enviar `null` seleciona `fail`. Ambas as políticas criam uma execução quando o
ID do workflow ainda não foi utilizado.

| Política | Já existe uma execução ativa | A execução existente está encerrada |
| --- | --- | --- |
| `fail` (padrão) | Recusar a inicialização duplicada. | Recusar a inicialização duplicada. |
| `use-existing` | Retornar a execução existente em estado pending, running ou waiting sem iniciar outra. | Recusar a inicialização duplicada. |

Nenhuma política reabre uma execução encerrada. Use um novo ID de workflow para
uma nova execução. `reject` não é um valor aceito e retorna HTTP 422.

### Comandos de workflow {#workflow-commands}

O servidor também fornece rotas cooperativas `request-cancellation`. Veja
[Cancelamento cooperativo](/docs/polyglot/cancellation/) para o contrato de
limpeza limitada e requisitos de workers.

Rotas de comando por instância operam na execução atual de um ID de workflow:

| Método | Caminho | Finalidade |
| --- | --- | --- |
| `POST` | `/api/workflows/{workflowId}/signal/{signalName}` | Envia um sinal. |
| `POST` | `/api/workflows/{workflowId}/query/{queryName}` | Executa uma consulta somente leitura. |
| `POST` | `/api/workflows/{workflowId}/update/{updateName}` | Envia ou executa uma atualização. |
| `POST` | `/api/workflows/{workflowId}/cancel` | Fecha a execução como cancelada imediatamente; não retoma a limpeza do workflow. |
| `POST` | `/api/workflows/{workflowId}/terminate` | Força a terminação. |
| `POST` | `/api/workflows/{workflowId}/repair` | Pede reparo de estado preso retentável. |
| `POST` | `/api/workflows/{workflowId}/archive` | Arquiva uma execução fechada. |

Rotas por execução rejeitam explicitamente destinos históricos ou incorretos:

| Método | Caminho | Finalidade |
| --- | --- | --- |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/signal/{signalName}` | Envia sinal somente se a execução selecionada for a atual. |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/query/{queryName}` | Executa consulta na execução selecionada. |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/update/{updateName}` | Envia ou executa atualização somente se a execução for a atual. |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/cancel` | Cancela somente se a execução for a atual. |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/terminate` | Termina somente se a execução for a atual. |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/repair` | Repara somente se a execução for a atual. |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/archive` | Arquiva somente se a execução for atual e fechada. |

Os comandos levam valores de negócio em envelopes Avro. Os SDKs oficiais os codificam automaticamente. Um cliente HTTP direto deve usar o envelope `{codec, blob}` do codificador Avro oficial ou a referência do runtime abaixo. O documento HTTP externo é JSON; JSON de negócio sem codificação não é um codec alternativo.

## Namespace e armazenamento {#namespace-and-storage}

Rotas de namespace exigem operator ou admin. Rotas que alteram namespace e
armazenamento externo exigem admin.

| Método | Caminho | Finalidade |
| --- | --- | --- |
| `GET` | `/api/namespaces` | Lista namespaces. |
| `POST` | `/api/namespaces` | Cria um namespace. |
| `GET` | `/api/namespaces/{namespace}` | Descreve retenção, metadados e política de armazenamento. |
| `PUT` | `/api/namespaces/{namespace}` | Atualiza metadados ou retenção. |
| `PUT` | `/api/namespaces/{namespace}/external-storage` | Configura a política de armazenamento externo de payloads. |
| `POST` | `/api/storage/test` | Grava e lê payloads pequeno e grande pelo driver externo configurado. |

Políticas de armazenamento externo permitem que envelopes grandes carreguem
referências estáveis em vez de bytes brutos. Políticas locais resolvem pelo
caminho de filesystem configurado. Políticas de objetos como `s3`, `gcs` e
`azure` usam um disco configurado explicitamente e configurações de
bucket/prefixo no servidor.

### Envelope de referência a payload externo {#external-payload-reference-envelope}

O Server aceita referências do **runtime**, diferentes das referências com URI de provedor dos helpers embutidos. Uma solicitação com `external_storage` é recusada com HTTP `422` e `external_payload_unsupported`. Não copie referências `file://`, `s3://`, `gs://` ou `azure://` para solicitações ao Server.

O envelope do runtime contém exatamente `codec` e `external_payload`:

```json
{
  "codec": "avro",
  "external_payload": {
    "schema": "durable-workflow.v2.runtime-external-payload-reference.v1",
    "reference_id": "ep_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "codec": "avro",
    "size_bytes": 1048576,
    "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  }
}
```

O identificador e o hash acima são ilustrativos. Use sem alterações a referência retornada por um envio real. A referência aninhada contém exatamente cinco campos:

| Campo | Obrigatório | Significado |
| --- | --- | --- |
| `schema` | sim | `durable-workflow.v2.runtime-external-payload-reference.v1`. |
| `reference_id` | sim | ID opaco do Server: `ep_` seguido por 26 caracteres ULID maiúsculos. Não é um URI de provedor. |
| `codec` | sim | `avro`, igual ao envelope externo. |
| `size_bytes` | sim | Tamanho inteiro não negativo dos bytes codificados enviados. |
| `sha256` | sim | SHA-256 desses mesmos bytes, retornado em hexadecimal minúsculo. |

### Transporte de payloads externos do runtime {#runtime-external-payload-transport}

Descubra `namespace.external_payload_storage.transport` por `GET /api/cluster/info`. Seu esquema é `durable-workflow.v2.runtime-external-payload-transport.v1`, versão `1`. Use suas rotas e limites apenas quando o armazenamento do namespace estiver `available`. O Server mantém as credenciais do provedor e não retorna localizações do provedor.

| Método | Caminho | Resultado |
| --- | --- | --- |
| `POST` | `/api/external-payloads/v1` | Envia bytes codificados com limites. `201` retorna o esquema `durable-workflow.v2.runtime-external-payload-upload.v1`, `transport_version: 1` e `reference`. |
| `GET` | `/api/external-payloads/v1/{referenceId}` | Busca e verifica os bytes codificados referenciados. `200` retorna `application/octet-stream`. |

Ambas as rotas usam credencial normal do runtime com papel `worker`, `operator` ou `admin` e `X-Namespace`. Ambas exigem `X-Durable-Workflow-Payload-Codec`, `X-Durable-Workflow-Payload-Size` e `X-Durable-Workflow-Payload-SHA256`. O envio também exige `Content-Type: application/octet-stream`. Uma busca entre namespaces retorna não encontrado sem revelar objetos alheios. Possuir um ID não concede acesso nem autoridade para concluir workflows.

Os bytes enviados são os **bytes UTF-8 da string base64 `blob` do envelope Avro oficial**, sem acrescentar quebra de linha. Não são Avro binário decodificado nem JSON de negócio. Calcule tamanho e SHA-256 exatamente sobre esses bytes. Por exemplo, após instalar o SDK Python:

```bash
python - <<'PY'
from pathlib import Path
from durable_workflow.serializer import encode

Path("payload.avro.txt").write_bytes(
    encode([{"message": "large value", "optional": None}]).encode("utf-8")
)
PY

PAYLOAD_SIZE=$(wc -c < payload.avro.txt | tr -d ' ')
PAYLOAD_SHA256=$(sha256sum payload.avro.txt | cut -d ' ' -f 1)

curl --fail-with-body -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/external-payloads/v1" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: billing" \
  -H "Content-Type: application/octet-stream" \
  -H "X-Durable-Workflow-Payload-Codec: avro" \
  -H "X-Durable-Workflow-Payload-Size: $PAYLOAD_SIZE" \
  -H "X-Durable-Workflow-Payload-SHA256: $PAYLOAD_SHA256" \
  --data-binary @payload.avro.txt > upload.json

REFERENCE_ID=$(jq -r '.reference.reference_id' upload.json)
curl --fail-with-body -sS "$DURABLE_WORKFLOW_SERVER_URL/api/external-payloads/v1/$REFERENCE_ID" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: billing" \
  -H "X-Durable-Workflow-Payload-Codec: avro" \
  -H "X-Durable-Workflow-Payload-Size: $PAYLOAD_SIZE" \
  -H "X-Durable-Workflow-Payload-SHA256: $PAYLOAD_SHA256" \
  -o fetched.avro.txt
cmp payload.avro.txt fetched.avro.txt
```

O envio verifica a integridade dos bytes antes de gravar uma referência. Ele não executa um workflow nem comprova que os bytes sejam um payload de negócio válido. A primeira solicitação verificada que incorpora estado reivindica a referência; continuam valendo a validação de payload e as verificações normais de solicitação, namespace, tentativa da tarefa e lease. Para envios de conclusão de workers, use o SDK oficial e seu contexto descoberto, sem inventar uma permissão de lease no cliente direto.

Leia `limits.max_payload_bytes`, `request_timeout_seconds` e `abandoned_upload_expiry_seconds` no manifesto. Também se aplicam cotas de bytes e objetos, limites normais de solicitação e limites de envio de conclusão. Pelo critério do limite, um valor igual ao limiar permanece inline. Os SDKs externalizam valores maiores e podem externalizar outros para que a solicitação agregada caiba.

| Resultado | Status HTTP | Ação |
| --- | --- | --- |
| Referência ausente ou expirada | `404` / `410` | Restaure o objeto necessário ou corrija a referência. Não decodifique ausência como `null`. |
| Sem autorização | `401` / `403` | Corrija credencial, papel ou autorização do namespace. |
| Envelope incompatível ou falha de integridade | `415` / `422` | Corrija codec, campos, tamanho, hash ou bytes codificados. |
| Payload grande demais | `413` | Reduza o valor codificado ou use uma política maior permitida. |
| Cota ou permissão de envio esgotada | `429` | Inspecione a capacidade e repita apenas dentro do orçamento original. |
| Armazenamento indisponível | `503` | Restaure a disponibilidade antes de repetir dentro do mesmo orçamento. |
| Conclusão obsoleta ou conflitante | `409` | Não repita inventando identidade de tarefa ou novo lease. |

O Server controla a retenção. Não há rota de exclusão para clientes. Uma remoção do cache não deve excluir o objeto. Envios não reivindicados podem expirar; proprietários retidos, objetos compartilhados, falhas de armazenamento e retenções para backup afetam a limpeza. Um histórico exportado com referências não é um backup autossuficiente dos bytes.

### Suporte a payloads externos por modo {#external-payload-support-by-mode}

| Cliente ou worker | Caminho de armazenamento | Credenciais do provedor |
| --- | --- | --- |
| Pacote workflow Laravel embutido | Política da aplicação e referências com URI de provedor. | Aplicação embutida. |
| SDK PHP | Envio e busca automáticos descobertos com referências opacas. | Server. |
| SDK Python | Envio e busca automáticos descobertos com referências opacas. | Server. |
| SDK Rust | Envio e busca automáticos descobertos com referências opacas. | Server. |
| HTTP direto | Envio e busca explícitos do runtime e referência retornada em um campo de payload suportado. | Server. |

Todos os SDKs exigem transporte do runtime compatível e disponível. Helpers de provedor servem para integrações embutidas ou diretas com armazenamento da aplicação. Sua disponibilidade não torna envelopes de provedor um formato de entrada suportado pelo Server ou Cloud.

O contrato completo de autoridade de solicitações, resolução de namespaces, credenciais por papel e registro de workers está em [Namespaces, autenticação e registro de workers](/docs/polyglot/namespace-auth-workers).

## APIs administrativas do catálogo de serviços {#service-catalog-admin-apis}

Rotas do catálogo são rotas autenticadas admin do plano de controle. Usam a
mesma resolução de namespace, bloqueio por papel de topologia e exigência de
`X-Durable-Workflow-Control-Plane-Version: 2` do restante do controle hospedado.

Use esta família para registrar metadados de endpoint, serviço e operação por
namespace no catálogo entre namespaces. Nomes ignoram maiúsculas/minúsculas
na entrada e são normalizados para minúsculas em respostas e buscas.

| Método | Caminho | Finalidade |
| --- | --- | --- |
| `GET` | `/api/service-endpoints` | Lista endpoints de serviço do namespace atual. |
| `POST` | `/api/service-endpoints` | Cria um endpoint de serviço. |
| `GET` | `/api/service-endpoints/{endpointName}` | Descreve um endpoint. |
| `PUT` | `/api/service-endpoints/{endpointName}` | Atualiza descrição ou metadados do endpoint. |
| `DELETE` | `/api/service-endpoints/{endpointName}` | Exclui um endpoint não utilizado. |
| `GET` | `/api/service-endpoints/{endpointName}/services` | Lista serviços de um endpoint. |
| `POST` | `/api/service-endpoints/{endpointName}/services` | Cria um serviço em um endpoint. |
| `GET` | `/api/service-endpoints/{endpointName}/services/{serviceName}` | Descreve um serviço. |
| `PUT` | `/api/service-endpoints/{endpointName}/services/{serviceName}` | Atualiza descrição ou metadados do serviço. |
| `DELETE` | `/api/service-endpoints/{endpointName}/services/{serviceName}` | Exclui um serviço não utilizado. |
| `GET` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations` | Lista operações de um serviço. |
| `POST` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations` | Cria um vínculo de operação. |
| `GET` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations/{operationName}` | Descreve uma operação. |
| `GET` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations/{operationName}/service-calls/{serviceCallId}` | Descreve o snapshot de uma chamada durável. |
| `PUT` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations/{operationName}` | Atualiza um vínculo de operação. |
| `DELETE` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations/{operationName}` | Exclui uma operação não utilizada. |

Coleções usam arrays `service_endpoints`, `services` ou `operations`.
Recursos individuais incluem nomes estáveis minúsculos, metadados e timestamps:

- Endpoints retornam `id`, `namespace`, `endpoint_name`, `description`,
  `metadata`, `created_at` e `updated_at`.
- Serviços adicionam `endpoint_id` e `service_name`.
- Operações adicionam `service_id`, `operation_name`, `operation_mode`,
  `handler_binding_kind`, `handler_target_reference`, `handler_binding`,
  `deadline_policy`, `idempotency_policy`, `cancellation_policy`,
  `retry_policy`, `boundary_policy` e `metadata`.
- Snapshots de chamadas adicionam `caller_namespace`, IDs de workflow do
  chamador e vinculado, `status`, `resolved_binding_kind`,
  `resolved_target_reference`, referências de payload, snapshots de políticas
  e timestamps de ciclo de vida como `accepted_at`, `started_at`,
  `completed_at`, `failed_at` e `cancelled_at`.

Criação/atualização de operação usa os mesmos nomes JSON da resposta.
`operation_mode` é `sync` ou `async`. `handler_binding_kind` é
`start_workflow`, `signal_workflow`, `update_workflow`, `query_workflow`,
`activity_execution` ou `invocable_http`. Novas operações devem fornecer
`handler_target_reference` ou um payload `handler_binding` não vazio.

O detalhe aninhado de chamada também expõe `service_call_attempts`,
`retry_attempt_count`, o `call_deadline_at` original, metadados tipados de
falha e o `result_envelope` Avro retido. Chamadas aceitas ou iniciadas não
são terminais. Um workflow chamador que espera conclusão resolve com o
resultado real ou falha/cancelamento terminal do workflow vinculado,
preservando identidade e prazo originais da chamada.

Use a [inspeção de chamadas na CLI](./cli-reference.md#service-call-inspection)
ou o catálogo Waterline para inspecionar a chamada original. A inspeção não
solicita outra execução do serviço.

Rotas de exclusão rejeitam por segurança com HTTP `409` e motivo nomeado
quando há dependentes, como `endpoint_has_services`, `service_has_operations`
ou `operation_has_service_calls`.

## Adaptadores de ponte {#bridge-adapters}

Adaptadores de ponte são endpoints limitados de entrada. Não executam código
de workflow; entregam eventos ao plano de controle e retornam resultado nomeado.

| Método | Caminho | Finalidade |
| --- | --- | --- |
| `POST` | `/api/bridge-adapters/webhook/{adapter}` | Inicia, sinaliza ou atualiza um workflow a partir de evento no formato de webhook. |

Exemplo:

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/bridge-adapters/webhook/stripe" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "start_workflow",
    "idempotency_key": "evt_1001",
    "target": {
      "workflow_type": "orders.fulfillment",
      "task_queue": "orders",
      "business_key": "order-1001"
    },
    "input": {"order_id": "order-1001"}
  }'
```

Use campos como `outcome`, `reason`, `idempotency_key` e
`control_plane_outcome` em vez de inferir o comportamento só do status HTTP.

## Protocolo de workers {#worker-protocol}

Rotas de workers exigem papel worker e
`X-Durable-Workflow-Protocol-Version: 1.0`. Workers SDK as usam internamente;
workers de linguagem personalizada podem implementar o mesmo protocolo.

| Método | Caminho | Finalidade |
| --- | --- | --- |
| `POST` | `/api/worker/register` | Registra identidade, filas, tipos de workflow/atividade suportados, capacidade, runtime e metadados de build. |
| `POST` | `/api/worker/heartbeat` | Atualiza visibilidade da frota e fatos de compatibilidade. |
| `POST` | `/api/worker/workflow-tasks/poll` | Faz long poll por tarefas de workflow. |
| `POST` | `/api/worker/workflow-tasks/{taskId}/history` | Busca histórico paginado de uma tarefa de workflow sob lease. |
| `POST` | `/api/worker/workflow-tasks/{taskId}/heartbeat` | Envia heartbeat de uma tarefa de workflow sob lease. |
| `POST` | `/api/worker/workflow-tasks/{taskId}/complete` | Conclui uma tarefa de workflow com comandos. |
| `POST` | `/api/worker/workflow-tasks/{taskId}/fail` | Falha uma tarefa de workflow. |
| `POST` | `/api/worker/query-tasks/poll` | Faz long poll por consultas roteadas pelo servidor. |
| `POST` | `/api/worker/query-tasks/{queryTaskId}/complete` | Conclui uma tarefa de consulta. |
| `POST` | `/api/worker/query-tasks/{queryTaskId}/fail` | Falha ou rejeita uma tarefa de consulta. |
| `POST` | `/api/worker/activity-tasks/poll` | Faz long poll por tarefas de atividade. |
| `POST` | `/api/worker/activity-tasks/{taskId}/heartbeat` | Envia heartbeat de uma tarefa de atividade sob lease. |
| `POST` | `/api/worker/activity-tasks/{taskId}/complete` | Conclui uma tarefa de atividade. |
| `POST` | `/api/worker/activity-tasks/{taskId}/fail` | Falha uma tarefa de atividade. |

Workers devem tratar IDs de lease, tentativas, IDs de tarefa e endpoints de
heartbeat como valores opacos emitidos pelo servidor. Lease antigo ou ID
incorreto retorna erro nomeado do protocolo em vez de concluir silenciosamente.

Quando `worker_protocol.server_capabilities.poll_status` é `true`, toda
resposta de poll de workflow, atividade e consulta contém `poll_status`
legível por máquina. Use como primeira decisão antes de inspecionar campos
específicos da rota:

| `poll_status` | Status HTTP típico | Significado |
| --- | --- | --- |
| `leased` | `200` | O servidor concedeu lease de uma tarefa, e `task` contém o payload. |
| `empty` | `200` | Nenhuma tarefa correspondente ficou pronta antes de retornar. |
| `throttled` | `200` | A fila está visível, mas limites de admissão de leases ou despacho retiveram nova tarefa neste poll. |
| `unavailable` | `503` ou `200` | O servidor não coordenou com segurança o caminho de poll e retornou indisponibilidade tipada em vez de agir como fila vazia. |
| `draining` | `409` | A coorte registrada está drenando; o servidor recusa novos leases e retorna `reason: "worker_draining"`. |

## Visibilidade da frota e das filas de tarefas {#fleet-and-task-queue-visibility}

Estas rotas expõem diagnósticos operacionais de frotas e admissão de filas.
São rotas do plano de controle.

| Método | Caminho | Finalidade |
| --- | --- | --- |
| `GET` | `/api/workers` | Lista workers registrados. |
| `GET` | `/api/workers/{workerId}` | Descreve um worker. |
| `DELETE` | `/api/workers/{workerId}` | Remove o registro de um worker. |
| `GET` | `/api/task-queues` | Lista filas e status de admissão. |
| `GET` | `/api/task-queues/{taskQueue}` | Descreve capacidade de workflow/atividade/consulta de uma fila. |
| `GET` | `/api/task-queues/{taskQueue}/build-ids` | Lista build ids observados em uma fila. |
| `POST` | `/api/task-queues/{taskQueue}/build-ids/drain` | Marca coorte de build id como drenando para parar novas reservas. |
| `POST` | `/api/task-queues/{taskQueue}/build-ids/resume` | Limpa drenagem anterior para voltar a reservar tarefas. |

Use respostas de fila para distinguir ausência de workers de slots saturados,
limites de leases ativos, orçamentos de despacho e controle de pressão de
consultas. Drenagem e retomada aceitam corpo JSON `{"build_id": "..."}` (ou
`{"build_id": null}` para a coorte sem versão), são idempotentes e persistem
a intenção do operador para que o estado de rollout permaneça fiel após
remover workers. Quando um heartbeat observa `drain_intent: "draining"`,
rotas de poll retornam HTTP `409` com `poll_status: "draining"` e
`reason: "worker_draining"` em vez de conceder novas tarefas. Veja
[Rollout por build id de workers](/docs/polyglot/worker-build-id-rollout)
para o ciclo completo de transição de sem versão para versionado, canário,
drenagem e rollback.

## Agendamentos e atributos de busca {#schedules-and-search-attributes}

Rotas de agendamento são rotas do plano de controle.

| Método | Caminho | Finalidade |
| --- | --- | --- |
| `GET` | `/api/schedules` | Lista agendamentos. |
| `POST` | `/api/schedules` | Cria um agendamento. |
| `GET` | `/api/schedules/{scheduleId}` | Descreve um agendamento. |
| `PUT` | `/api/schedules/{scheduleId}` | Atualiza especificação, ação, nota, memo ou atributos de busca. |
| `DELETE` | `/api/schedules/{scheduleId}` | Exclui um agendamento. |
| `POST` | `/api/schedules/{scheduleId}/pause` | Pausa disparos futuros. |
| `POST` | `/api/schedules/{scheduleId}/resume` | Retoma um agendamento pausado. |
| `POST` | `/api/schedules/{scheduleId}/trigger` | Dispara um agendamento imediatamente. |
| `POST` | `/api/schedules/{scheduleId}/backfill` | Preenche uma janela de tempo retroativamente. |
| `GET` | `/api/search-attributes` | Lista atributos de busca registrados. |
| `POST` | `/api/search-attributes` | Registra um atributo de busca. |
| `DELETE` | `/api/search-attributes/{name}` | Exclui um atributo de busca. |

Nomes e tipos de atributos fazem parte do contrato de busca do namespace.
Evite atributos de alta cardinalidade em painéis de operação ou rótulos de métricas.

### Filtros e continuação da listagem de agendamentos {#schedule-list-filters}

`GET /api/schedules` lê o namespace da requisição. A [qualificação do PHP Server publicado com instalação normal](https://github.com/durable-workflow/durable-workflow.github.io/issues/402#issuecomment-6370122227) verifica filtros combinados e continuação. Envie os seguintes parâmetros de consulta com a codificação URL habitual:

| Parâmetro | Valor aceito |
| --- | --- |
| `status` | `active` ou `paused`. |
| `workflow_type` | Tipo de workflow não vazio, com até 255 caracteres. Apenas espaços não são válidos. |
| `query` | Expressão de visibilidade não vazia, com até 2048 caracteres. |
| `page_size` | Inteiro de 1 a 200, padrão 50. |
| `next_page_token` | Token opaco não vazio, com até 8192 caracteres. |

Status, tipo de workflow e predicados da consulta se combinam com `AND`. Uma consulta de visibilidade de agendamentos aceita predicados de igualdade unidos por `AND`, como `Region = "eu" AND TaskQueue = "orders"`. Os campos integrados são `ScheduleId`, `Status`, `WorkflowType`, `TaskQueue` e `Note`. Os demais campos precisam ser atributos de busca registrados no namespace da requisição, com literais compatíveis com seus tipos. A igualdade em um atributo `keyword_list` testa a presença do elemento. Operadores como `OR`, `NOT`, `IN`, `LIKE` e comparações de intervalo não são aceitos e retornam `422`.

A resposta inclui `namespace`, `schedules`, `schedule_count` desta página e `next_page_token`. Continue somente quando houver um token. Envie-o sem alterações com o mesmo namespace, status, tipo de workflow e consulta. O token está vinculado à seleção de filtros analisada. A paginação lê dados em alteração, não um snapshot. Um cursor excluído, ou que não corresponde mais aos filtros, exige uma nova travessia sem token.

| HTTP / motivo | Próxima ação |
| --- | --- |
| `422` / `unsupported_schedule_list_filter` | Remova os nomes de parâmetros não aceitos. |
| `422` / `validation_failed` | Corrija os erros de validação dos campos. |
| `422` / `unsupported_schedule_visibility_field` | Use um campo integrado ou um atributo registrado neste namespace. |
| `422` / `unsupported_schedule_visibility_predicate` | Use predicados de igualdade unidos por `AND`. |
| `400` / `malformed_schedule_page_token` | Use o token recebido sem alterações ou reinicie sem ele. |
| `403` / `schedule_page_token_namespace_mismatch` | Use o namespace original ou reinicie no namespace desejado. |
| `409` / `schedule_page_token_filter_mismatch` | Reinicie sem token depois de alterar os filtros. |
| `409` / `stale_schedule_page_token` | Reinicie sem token no conjunto filtrado atual. |

Os [exemplos de filtragem e paginação de agendamentos na CLI](/docs/polyglot/cli-reference#schedule-list-filters) usam o mesmo contrato. Uma recusa de listagem inclui o campo `field` afetado e os detalhes de validação. Confira o motivo antes de tentar novamente.

## Operações do sistema {#system-operations}

Rotas do sistema exigem admin. São passagens explícitas de operador; prefira
rotas de status antes das de passagem na automação.

| Método | Caminho | Finalidade |
| --- | --- | --- |
| `GET` | `/api/system/health` | Retorna snapshot de saúde da coordenação e segurança de rollout por namespace, aninhado em `health`. |
| `GET` | `/api/system/metrics` | Retorna métricas JSON limitadas. |
| `GET` | `/api/system/operator-metrics` | Retorna snapshot por namespace de execuções, tarefas, backlog, reparo, workers e limites estruturais. |
| `GET` | `/api/system/repair` | Inspeciona backlog de reparo de workflows. |
| `POST` | `/api/system/repair/pass` | Executa uma passagem de reparo de workflows. |
| `GET` | `/api/system/activity-timeouts` | Inspeciona backlog de timeout de atividades. |
| `POST` | `/api/system/activity-timeouts/pass` | Executa uma passagem de aplicação de timeout de atividades. |
| `GET` | `/api/system/retention` | Inspeciona backlog de limpeza por retenção. |
| `POST` | `/api/system/retention/pass` | Executa uma passagem de limpeza por retenção. |

Na retenção do Server PHP, a rota de status lê a política atual e retorna
uma lista limitada de execuções elegíveis. Mudanças de política também
afetam histórico fechado existente. Uma passagem sem filtro seleciona
execuções expiradas; `run_ids` explícitos selecionam execuções fechadas sem
o filtro limitado por idade. Proteções de retenção para sempre e execuções
arquivadas continuam válidas. Revise o
[procedimento de retenção e etapas de backup](./server.md#retention) antes
de alterar a política ou limpar.

`/api/system/health` é a forma mais rápida de saber se um namespace está
saudável o suficiente para continuar recebendo tráfego. Retorna
`{namespace, health}`, em que `health` contém verificações categorizadas de
segurança de rollout, snapshot aninhado `health.operator_metrics` e resumo
de limites estruturais usado pela interface de saúde.

`/api/system/operator-metrics` é o complemento por namespace de
`/api/cluster/info` para contagens brutas de backlog, idade de bloqueio por
compatibilidade, detalhes da frota ou outras métricas por trás do resumo de saúde.

`/api/system/metrics` é uma interface JSON de operação, não um endpoint de
coleta Prometheus. Nomes e dimensões de métricas são limitados pela política
de crescimento limitado do servidor.

## Contrato de erros {#error-contract}

Respostas de erro usam status HTTP e motivos nomeados legíveis por máquina.
Clientes devem decidir por `reason` ou pelos campos aninhados de motivo do
plano de controle/protocolo de workers, não por mensagens em prosa.

Status comuns:

| Status | Significado |
| --- | --- |
| `400` | Cabeçalho de protocolo/versão ausente ou sem suporte, consulta malformada ou método de rota sem suporte. |
| `401` | Autenticação ausente ou inválida. |
| `403` | Token autenticado sem o papel exigido. |
| `404` | Namespace, workflow, execução, agendamento, worker ou atributo de busca não encontrado. |
| `409` | Duplicata ou conflito, como workflow já iniciado ou destino de execução inválido. |
| `422` | Validação falhou; a resposta inclui detalhes por campo. |
| `429` | Capacidade de admissão ou fila de tarefas esgotada. |
| `503` | A requisição chegou a nó sem os papéis de topologia exigidos. Rotas hospedadas retornam `reason: "topology_role_unavailable"` com `current_shape`, `current_process_class`, `current_roles`, `required_roles` e `missing_roles`. O mesmo status com `reason: "workflow_v2_blocked"`, `blocked_by` e `remediation` cobre início/mutação de workflow, mutação de agendamento, adaptadores de ponte e protocolo de workers durante bloqueio de bootstrap v2; leituras de agendamento (`GET /api/schedules`, `GET /api/schedules/{scheduleId}`, `GET /api/schedules/{scheduleId}/history`) permanecem disponíveis para inspeção na recuperação. |
| `500` | Falha do servidor. Trate como retentável somente quando a operação for idempotente ou tiver chave de idempotência. |

Respostas de validação incluem `reason: "validation_failed"` e `errors` ou
`validation_errors`. Respostas de comandos de workflow também projetam
detalhes de validação e operação no objeto aninhado `control_plane`.

## Veja também {#see-also}

- [Guia do Server](/docs/polyglot/server)
- [Namespace, autenticação e registro de workers](/docs/polyglot/namespace-auth-workers)
- [Protocolo de workers](/docs/polyglot/worker-protocol)
- [Admissão de filas de tarefas](/docs/polyglot/task-queue-admission)
- [Execução externa](/docs/polyglot/external-execution)
- [Referência de comandos da CLI](/docs/polyglot/cli-reference)
