---
title: Topologia de papéis do Server
description: Interprete o manifesto de topologia de /api/cluster/info para papéis do servidor Durable Workflow, limites de escala, domínios de falha e etapas de migração.
tags:
  - server
  - topology
  - deployment
  - control-plane
  - workers
keywords:
  - topologia de papéis Durable Workflow
  - topologia de cluster info
  - limites de escala do servidor
  - separação de controle e execução
---

# Topologia de papéis do Server {#server-role-topology}

## Por que este manifesto existe {#why-this-manifest-exists}

`GET /api/cluster/info` publica o manifesto `topology` do servidor no schema
`durable-workflow.v2.role-topology`. Trate esse manifesto como o contrato
público de nomes de papéis, formatos de implantação suportados, autoridade de
escrita durável, expectativas de domínios de falha, limites de escala e caminho
ordenado de migração da distribuição independente atual para uma topologia
com controle e execução separados.

Use esta página ao analisar o formato do servidor em scripts, painéis,
runbooks ou automação de rollout. Use a
[Referência da API do Server](/docs/polyglot/server-api-reference) para a
interface HTTP bruta e o [Guia do Server](/docs/polyglot/server) para a
configuração da implantação.

## Ler o manifesto de topologia {#reading-the-topology-manifest}

O objeto `topology` responde a estas perguntas do contrato:

| Família de campos | Pergunta respondida |
| --- | --- |
| `schema`, `version` | Qual revisão do contrato de topologia você está lendo? |
| `supported_shapes` | Quais formatos de implantação do produto são válidos? |
| `role_vocabulary` | Quais nomes de papéis são válidos neste contrato? |
| `current_shape`, `current_process_class`, `current_roles`, `execution_mode` | O que o nó que respondeu está fazendo agora? |
| `matching_role.*` | Quem controla o despertar amplo de tarefas prontas, quais eixos de roteamento estão congelados e qual postura de despacho/controle de pressão está ativa? |
| `role_catalog`, `authority_surfaces` | Quais interfaces e superfícies de mutação durável pertencem a cada papel? |
| `shape_assignments` | Quais classes de processo são permitidas em cada formato suportado? |
| `authority_boundaries`, `failure_domains`, `scaling_boundaries` | Qual papel pode gravar o quê, como cada papel falha e por qual eixo de carga ele escala? |
| `supported_topologies`, `migration_path` | Quais famílias de implantação são suportadas pelo produto e qual é o caminho ordenado do formato independente para papéis mais isolados? |
| `kernel_invariants` | Quais garantias do núcleo durável a separação de papéis deve preservar, independentemente do formato em execução? |

`current_shape`, `current_process_class` e `current_roles` descrevem o nó que
respondeu à requisição HTTP, não a frota inteira. Use `current_process_class`
como identidade declarada do nó e compare `current_roles` com os conjuntos de
classes de processo em `shape_assignments` quando precisar verificar essa declaração.

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/cluster/info" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  | jq '{
    current_shape: .topology.current_shape,
    current_process_class: .topology.current_process_class,
    current_roles: .topology.current_roles,
    execution_mode: .topology.execution_mode,
    matching_role: .topology.matching_role,
    scaling_boundaries: .topology.scaling_boundaries,
    migration_path: .topology.migration_path
  }'
```

## Vocabulário de papéis {#role-vocabulary}

Os nomes públicos de papéis são fixados por `topology.role_vocabulary`:

| Papel | Responsabilidade |
| --- | --- |
| `api_ingress` | Aceitar tráfego HTTP externo, incluindo entradas de descoberta e plano de controle. |
| `control_plane` | Iniciar, sinalizar, atualizar, reparar, cancelar, terminar, arquivar e alterar de outras formas o estado do ciclo de vida do workflow. |
| `matching` | Descobrir trabalho pronto, controlar leases de tarefas e coordenar a pressão de despacho. |
| `history_projection` | Persistir histórico durável e manter resumos e exportações derivados das execuções. |
| `scheduler` | Disparar agendamentos e persistir o estado das execuções agendadas. |
| `execution_plane` | Executar tarefas de workflow e atividade. |

Automações devem tratar esses identificadores exatos como o vocabulário estável.

## Formatos de implantação suportados {#supported-deployment-shapes}

`topology.supported_shapes` nomeia os formatos de implantação válidos do produto:

| Formato | Classes de processo publicadas em `shape_assignments` | Significado do contrato |
| --- | --- | --- |
| `embedded` | `application_process` | Um processo da aplicação controla plano de controle, matching, projeção de histórico, agendador e execução. |
| `standalone_server` | `server_http_node`, `scheduler_node`, `worker_node` | Distribuição independente atual: entrada HTTP/plano de controle no nó do servidor, agendador isolado em sua própria classe de processo e execução em nós worker. |
| `split_control_execution` | `ingress_node`, `control_plane_node`, `scheduler_node`, `matching_node`, `execution_node` | O mesmo contrato do produto separado em classes de processo mais restritas por papel para que limites de escala e falha possam se mover por subsistema. |

`split_control_execution` é uma topologia suportada, não um segundo motor ou
uma API diferente. A mesma interface de descoberta descreve tanto o formato
independente quanto os formatos com papéis separados.

## Identidade do nó atual {#current-node-identity}

Use `current_shape`, `current_process_class`, `current_roles` e `execution_mode` juntos:

- `current_shape` identifica o contrato de formato do nó que respondeu.
- `current_process_class` identifica a classe de processo declarada desse nó.
- `current_roles` identifica o conjunto de papéis ativos nesse nó.
- `execution_mode` distingue `remote_worker_protocol` de `local_queue_worker`.

Na distribuição do servidor independente, `current_shape` permanece
`standalone_server` mesmo quando `DW_MODE=embedded` muda a execução para
workers de fila locais. Nesse caso, `execution_mode` muda para
`local_queue_worker`, enquanto o nó HTTP mantém o contrato de papéis do
servidor independente.

### Bloqueio de rotas hospedadas {#hosted-route-gating}

O mesmo contrato de topologia também informa quando um nó deve rejeitar
inteiramente tráfego hospedado. Rotas hospedadas autenticadas são rejeitadas
por segurança a menos que o nó anuncie o conjunto de controle HTTP que elas
exigem hoje: `api_ingress` mais `control_plane`.

Respostas de nó incorreto retornam `503` com
`reason: "topology_role_unavailable"` e as evidências de topologia necessárias
para redirecionar:

- `current_shape`
- `current_process_class`
- `current_roles`
- `required_roles`
- `missing_roles`

Esse bloqueio ocorre antes da resolução de namespace nas rotas hospedadas.
Assim, uma requisição enviada a `scheduler_node`, `matching_node` ou
`execution_node` não descobre se o namespace nomeado existe antes de ser
redirecionada à classe de nó correta. `GET /api/health`, `GET /api/ready` e
`GET /api/cluster/info` autenticado continuam disponíveis para que automações
descubram o formato do nó antes de tentar novamente em outro lugar.

### Bloqueio de bootstrap do workflow {#workflow-bootstrap-gate}

Um segundo bloqueio no nível da rota rejeita requisições por segurança quando
o nó que responde tem impedimentos de bootstrap não resolvidos do workflow v2.
Enquanto `checks.workflow_v2.status` for `blocked`, rotas autenticadas de
início/mutação de workflow, mutação de agendamento, adaptadores de ponte e
protocolo de workers retornam `503` com `reason: "workflow_v2_blocked"`, mais:

- `blocked_by`: lista ordenada de impedimentos anteriores de prontidão, como `migrations`.
- `remediation`: instrução ao operador para resolver os impedimentos listados,
  espelhada de `/api/ready` `checks.workflow_v2.remediation`.

O bloqueio de bootstrap ocupa a mesma posição do bloqueio de topologia de
rotas hospedadas: depois da validação de papel e versão do protocolo, antes da
resolução de namespace. Portanto, uma requisição bloqueada nunca observa a
existência do namespace.

As famílias bloqueadas são rotas de workflow como `/api/workflows`, mutações
de agendamento como `POST /api/schedules`, `PUT /api/schedules/{scheduleId}`,
`DELETE /api/schedules/{scheduleId}`, `/pause`, `/resume`, `/trigger` e
`/backfill`, rotas de adaptadores de ponte como
`/api/bridge-adapters/webhook/{adapter}` e rotas do protocolo de workers em `/api/worker`.

**Leituras** de agendamentos (`GET /api/schedules`,
`GET /api/schedules/{scheduleId}`, `GET /api/schedules/{scheduleId}/history`)
são intencionalmente isentas para que operadores inspecionem o estado durante
a recuperação. Rotas do protocolo de workers retornam o mesmo payload de
bloqueio de bootstrap no envelope do protocolo de workers, para que os SDKs
decidam pelo mesmo `reason: "workflow_v2_blocked"` legível por máquina retornado
pelo plano de controle.

## Contrato do papel de matching {#matching-role-contract}

`topology.matching_role` congela a postura ativa de matching e despertar do nó
que respondeu:

| Campo | Significado |
| --- | --- |
| `queue_wake_enabled` | Se sinais de despertar de fila de curta duração estão habilitados no momento. |
| `shape` | Qual formato de implantação de matching este nó anuncia: `in_worker` ou `dedicated`. |
| `wake_owner` | Qual implementação controla a varredura ampla de despertar: `worker_loop` ou `dedicated_repair_pass`. |
| `task_dispatch_mode` | Se o despacho ocorre por workers remotos orientados por `poll` ou execução local orientada por `queue`. |
| `partition_primitives` | Eixos de roteamento congelados considerados pelo papel de matching, em ordem: `connection`, `queue`, `compatibility`, `namespace`. |
| `backpressure_model` | O limite de admissão durável aplicado pelo papel de matching. A v2 atual informa `lease_ownership`. |
| `discovery_limits` | O contrato numérico congelado do papel de matching compilado no pacote workflow: `poll_batch_cap`, `availability_ceiling_seconds`, `wake_signal_ttl_seconds`, `workflow_task_lease_seconds` e `activity_task_lease_seconds`. |

Isso permite distinguir "matching existe, mas o despertar está degradado" de
"este nó executa outro modo de despacho intencionalmente" e fornece o mesmo
vocabulário de roteamento e controle de pressão que o próprio servidor publica
nas métricas operacionais.

`discovery_limits` é o contrato numérico do papel de matching:
`poll_batch_cap` congela o lote máximo de linhas de tarefas prontas retornado
por poll; `availability_ceiling_seconds` congela a tolerância entre backends
aplicada a `available_at` para que tarefas recém-disponíveis resistam a
divergências de timestamp inferiores a um segundo; `wake_signal_ttl_seconds`
congela o TTL padrão dos sinais de `CacheLongPollWakeStore`; e
`workflow_task_lease_seconds` / `activity_task_lease_seconds` congelam as
durações padrão dos leases de tarefas de workflow e atividade. Operadores leem
esses valores para verificar que a implantação corresponde ao contrato
documentado sem procurar no código do pacote. Tornar qualquer um deles mais
restritivo é uma alteração de protocolo, pois tempos de despacho, worker e
aceleração em outras partes do contrato dependem deles; renomear um campo
também é uma quebra de protocolo.

## Limites de autoridade {#authority-boundaries}

`topology.authority_boundaries` nomeia as superfícies de escrita durável que
cada papel deve alterar:

| Papel | Escritas publicadas |
| --- | --- |
| `api_ingress` | `worker_registrations` |
| `control_plane` | `workflow_instances`, `workflow_runs.status`, `workflow_tasks.lifecycle` |
| `matching` | `workflow_tasks.leases`, `activity_tasks.leases` |
| `history_projection` | `history_events`, `workflow_run_summaries`, `workflow_history_exports` |
| `scheduler` | `workflow_schedules.fire_state`, `workflow_starts.scheduled` |
| `execution_plane` | `workflow_tasks.outcomes`, `activity_attempts`, `worker_compatibility_heartbeats` |

Use esse contrato para detectar desvios entre papéis antes de separar
processos ou adicionar automação específica de topologia.

## Limites de falha e escala {#failure-and-scaling-boundaries}

### Domínios de falha {#failure-domains}

`topology.failure_domains` nomeia o primeiro comportamento degradado e o
primeiro sinal visível ao operador para a indisponibilidade de cada papel:

| Domínio de falha | `effect` | `operator_signal` |
| --- | --- | --- |
| `control_plane_down` | `workers_continue_claimed_tasks_only_until_lease_expiry` | `operator_commands_fail_fast` |
| `execution_plane_down` | `ready_tasks_accumulate_without_loss` | `operators_see_ready_depth_growth` |
| `matching_down` | `claim_falls_back_to_direct_ready_task_discovery` | `ready_depth_rises_while_claim_rate_falls` |
| `history_projection_down` | `projection_reads_may_stale_while_durable_writes_continue` | `projection_lag_seconds_may_increase` |
| `scheduler_down` | `scheduled_workflows_stop_firing_and_record_missed_runs` | `operators_see_missed_schedule_state` |
| `api_ingress_down` | `external_http_traffic_stops_at_the_edge` | `embedded_in_process_calls_may_continue` |

Essas são expectativas visíveis do produto, não detalhes internos. Use-as
para descrever o que deve acontecer quando um papel degrada antes de ler logs.

### Limites de escala {#scaling-boundaries}

`topology.scaling_boundaries` informa por qual eixo de carga cada papel escala
principalmente no modelo de papéis separados:

| Papel | Limite de escala |
| --- | --- |
| `api_ingress` | `incoming_http_request_rate` |
| `control_plane` | `operator_commands_and_run_lifecycle_transitions` |
| `matching` | `ready_task_rate_and_poller_count` |
| `history_projection` | `durable_event_rate` |
| `scheduler` | `active_schedule_count` |
| `execution_plane` | `workflow_and_activity_task_rate` |

Essa é a resposta explícita a "o que escalamos independentemente?" na topologia
de papéis separados.

## Caminho de migração {#migration-path}

`topology.migration_path` é ordenado. Cada etapa preserva um único núcleo
durável enquanto isola as responsabilidades com mais clareza:

1. `audit_role_boundaries`
   Resultado: ferramentas sinalizam escritas entre papéis antes de mudar o formato do runtime.
2. `expose_role_bindings`
   Resultado: pontos de integração do container permitem adaptadores fora do processo sem alterar o pacote.
3. `introduce_dedicated_matching_shape`
   Resultado: matching pode executar como classe de processo própria sem mudar o contrato de reserva.
4. `split_history_projection`
   Resultado: histórico e projeções podem sair do processo sem introduzir um segundo escritor.
5. `split_scheduler`
   Resultado: disparos de agendamento podem usar eleição de líder, enquanto implantações de réplica única continuam válidas.
6. `optional_execution_partitioning`
   Resultado: workers podem particionar por namespace, conexão, fila e compatibilidade.

Leia essa lista como a ordem suportada de transição de topologia, não como um
roadmap separado do produto e desconectado do motor atual.

Cada entrada `topology.migration_path[]` contém uma flag explícita
`reversible: true`. Trate o caminho como bidirecional: uma implantação que
chegou a `split_history_projection` PODE reunir novamente o papel de histórico
no processo do plano de controle e continuar sendo um formato de topologia
válido. Rollback faz parte do contrato, não é um caso extremo não modelado.

## Invariantes do núcleo durável {#durable-kernel-invariants}

`topology.kernel_invariants` enumera as garantias preservadas pela separação
de papéis independentemente do formato suportado em execução. Use essa lista
ao validar que uma mudança candidata de topologia é suportada pelo produto,
em vez de um fork do motor:

| Invariante | Garantia |
| --- | --- |
| `single_persistence_engine` | Um único banco de workflows sustenta todos os formatos; a separação de papéis não introduz um segundo motor de persistência. |
| `single_worker_protocol` | Um único protocolo HTTP de workers transporta reserva, conclusão, falha e heartbeat em todas as topologias; separar papéis não bifurca o contrato de workers. |
| `single_history_writer` | `history_events` tem exatamente um escritor durável por evento lógico, independentemente de onde executa o papel de histórico/projeção. |
| `single_control_authority_per_run` | Toda mutação de uma execução passa por uma única autoridade de plano de controle; locks de linha por execução serializam transições entre réplicas. |
| `embedded_topology_remains_supported` | O formato embarcado em que um processo ocupa todos os papéis DEVE continuar válido; hosts embarcados existentes nunca são forçados a migrar. |
| `role_split_is_topology_only` | Separar papéis é uma mudança de topologia, não um fork do produto; reuni-los em um único processo é sempre uma topologia válida. |

O campo `applies_to` de cada entrada lista os formatos cobertos pelo invariante.
Na família suportada, todos os invariantes atualmente se aplicam a `embedded`,
`standalone_server` e `split_control_execution`. Se uma atualização adicionar
um formato, os invariantes cujo `applies_to` não o inclua DEVEM ser revisados
antes de tratar esse formato como suportado pelo produto.

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/cluster/info" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  | jq '.topology.kernel_invariants[] | {id, applies_to}'
```

## Saúde da coordenação {#coordination-health}

`/api/cluster/info` também publica `coordination_health` junto de `topology`.
Mantenha a distinção clara:

- `topology` informa o que o nó pode fazer e como o formato do produto deve se comportar.
- `coordination_health` informa se as verificações de segurança de rollout e
  coordenação estão saudáveis no momento entre namespaces.
- `coordination_health.blocked_by`, `coordination_health.message` e
  `coordination_health.remediation` aparecem quando o servidor não pode avaliar
  a saúde da segurança de rollout porque faltam pré-requisitos de prontidão,
  como migrações ou conectividade com o banco.
- `coordination_health.routing_drains` resume coortes de build id drenando
  entre filas e namespaces. `queues_with_drains` informa se a automação de
  rollout está intencionalmente desviando tráfego de alguma coorte agora.
- `coordination_health.warning_checks`, `coordination_health.error_checks` e
  `coordination_health.checks` continuam sendo o inventário normalizado de
  verificações depois que a avaliação de segurança de rollout está executando.
- `coordination_health.checks[]` sempre inclui a verificação congelada
  `activity_path` junto de `worker_compatibility`, `task_transport`,
  `routing_health`, `durable_resume_paths` e verificações de projeção/agendador.
  `activity_path` é a contraparte de atividades de `task_transport`: apresenta
  execuções de atividade cujo prazo schedule-to-start, start-to-close,
  schedule-to-close ou heartbeat passou sem aplicação, além do backlog
  sustentado de novas tentativas de atividades. Renomear a verificação é uma
  alteração de protocolo.

Use ambas as interfaces ao decidir se uma mudança de topologia é suportada e
segura no momento.

## Referências relacionadas {#related-references}

- [Referência da API do Server](/docs/polyglot/server-api-reference) para o
  contrato HTTP autenticado de `/api/cluster/info`.
- [Guia do Server](/docs/polyglot/server) para configurar a implantação e o
  modelo operacional mais amplo do servidor independente.
- [Modos de implantação](/docs/polyglot/deployment-modes) para quando escolher
  embarcado, servidor independente ou topologias mais amplas orientadas por suporte.
