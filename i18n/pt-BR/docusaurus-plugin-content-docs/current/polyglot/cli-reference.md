---
sidebar_position: 4
title: Referência de comandos da CLI
description: Referência dos comandos da CLI Durable Workflow, modos estáveis de saída, opções comuns e comportamento de falhas.
tags:
  - CLI
  - reference
  - control-plane
  - automation
keywords:
  - referência de comandos dw
  - saída da CLI
  - ponte de webhook
  - comando de workflow
---

# Referência de comandos da CLI {#cli-command-reference}

Esta página documenta a interface de comandos `dw` v2 como contrato para
operadores e automação. Use o [guia da CLI](/docs/polyglot/cli) para instalação
e configuração de perfis; use esta página ao conectar scripts, jobs de CI,
runbooks ou agentes de IA a formatos exatos de comando.

Todos os comandos apoiados pelo servidor usam a versão `2` do protocolo do
plano de controle do servidor independente. A CLI valida os manifestos de
protocolo publicados antes de confiar nos campos canônicos de requisição e resposta.

## Opções globais {#global-options}

Comandos apoiados pelo servidor aceitam estas opções, salvo indicação contrária.

| Opção | Significado |
| --- | --- |
| `--server`, `-s` | URL base do servidor. Sobrescreve perfis e variáveis de ambiente nesta invocação. |
| `--namespace` | Namespace de destino. Sobrescreve o namespace do perfil. |
| `--token` | Token bearer desta invocação. Prefira perfis com `--token-env` para automações armazenadas. |
| `--env` | Perfil nomeado de ambiente da CLI. Nomes desconhecidos falham em vez de usar fallback. |
| `--output=table\|json\|jsonl` | Contrato de saída. `table` é legível por pessoas, `json` é um documento JSON e `jsonl` é um objeto JSON por linha para comandos de listagem. |
| `--json` | Alias local de saída JSON nos comandos que o expõem. |

Comandos que aceitam payloads do chamador usam um contrato compartilhado de entrada:

| Opção | Significado |
| --- | --- |
| `--input`, `-i` | Documento de entrada inline. |
| `--input-file` | Lê entrada de um arquivo ou `-` para stdin. Mutuamente exclusivo com `--input`. |
| `--input-encoding=json\|raw\|base64` | Decodifica entrada como JSON, passa texto bruto como um argumento ou decodifica base64 como um argumento. Padrão `json`. |

Entrada JSON para inícios de workflow, sinais, consultas, atualizações,
agendamentos e conclusões de atividade representa o array de argumentos
posicionais v2. Entradas raw e base64 tornam-se um argumento posicional para
que o servidor ainda receba o array canônico `input`.

## Conexão e diagnósticos {#connection-and-diagnostics}

| Comando | Finalidade | Opções importantes |
| --- | --- | --- |
| `dw --version` | Imprime a identidade de build da CLI. Quando `DW_ENV` ou `DURABLE_WORKFLOW_SERVER_URL` seleciona um destino, também faz uma breve sondagem de compatibilidade. | `-V`, `--version` |
| `dw server:health` | Verifica saúde e acesso autenticado ao servidor. | opções globais, `--json` |
| `dw server:info` | Mostra versão do servidor, manifesto de topologia de papéis, manifestos de protocolo, contrato de requisições, protocolo de workers, fatos da frota e metadados de compatibilidade. | opções globais, `--json` |
| `dw doctor` | Explica o estado resolvido de perfil/servidor/token/TLS, avisos remotos de compatibilidade e próximos passos. | opções globais, `--json` |
| `dw debug workflow <workflow-id>` | Captura diagnóstico de execução presa: estado, tarefas pendentes, fatos da fila, falhas e metadados de compatibilidade. | `--run-id`, opções globais, `--json` |
| `dw server:start-dev` | Serve a aplicação HTTP de um projeto Laravel existente configurado. Exige PHP externo. | `--port`, `--host` (padrão `127.0.0.1`), `--db=sqlite\|mysql\|pgsql` |
| `dw watch workflow <workflow-id>` | Consulta um workflow até estado terminal ou limite de polling configurado. | `--run-id`, `--interval`, `--max-polls`, opções globais |
| `dw upgrade` | Substitui o binário independente `dw` em execução por um release mais novo (ou fixado). Recusa reescrever vendor do Composer, cellar do Homebrew e instalações PHAR. | `--tag`, `--dry-run`, `--force`, `--output=table\|json` |

Use `server:info` para validar o formato do contrato, `doctor` para explicar
por que uma CLI não se comunica com um servidor e `debug workflow` quando o
suporte precisar de uma captura de execução legível por máquina.

### Servidor HTTP de projeto local {#local-project-http-server}

Execute `dw server:start-dev` no diretório de um projeto Laravel instalado que
contenha `artisan`. A CLI nativa exige um executável PHP separado no `PATH`
para esse comando. Configure o banco e execute migrações antes. O `--db`
selecionado é passado como `DB_CONNECTION`, portanto limpe a configuração em
cache do Laravel ao trocar drivers. Execute workers de fila e agendador
separadamente quando necessário. Reinicie o comando após editar `.env`. O
driver selecionado continua aplicado a requisições HTTP pelo modo `--no-reload` do Artisan.

O padrão é loopback. Use `--host=0.0.0.0` explicitamente para escutar em todas
as interfaces. Modos MySQL e PostgreSQL exigem serviços Compose do projeto
chamados respectivamente `mysql` ou `pgsql`, além de `redis`. Falhas de
dependências ou processos HTTP retornam código não zero. Serviços Compose
continuam executando quando o processo HTTP termina.

Binários nativos POSIX encaminham SIGINT e SIGTERM ao filho ativo e aguardam
até cinco segundos para seu grupo de processos parar. Instalações de código-fonte
e PHAR exigem extensões PHP `pcntl` e `posix` para esse encaminhamento.
Windows usa seu comportamento de interrupção do console.

Para um Durable Workflow Server independente com imagens publicadas, siga o
[início rápido de serviço](/docs/quickstart).

### Informações do servidor e topologia de papéis {#server-info-and-role-topology}

`dw server:info` é a interface CLI de `GET /api/cluster/info`. No modo tabela,
inclui uma seção `Topology:` que resume o contrato publicado para o nó que respondeu:

- `Supported Shapes` e `Current Shape` identificam formatos válidos de
  implantação e qual este nó está servindo agora.
- `Current Process Class` e `Current Roles` nomeiam classe de processo e
  conjunto de papéis do nó que respondeu.
- `Matching Role`, `Matching Partitions` e `Matching Backpressure` expõem
  formato do matching, responsabilidade pelo despertar, modo de despacho e
  primitivas de partição que determinam a reserva de trabalho pronto.
- `Matching Discovery Limits` resume o contrato numérico congelado do matching:
  `poll_batch_cap`, `availability_ceiling_seconds`, `wake_signal_ttl_seconds`,
  `workflow_task_lease_seconds` e `activity_task_lease_seconds`, permitindo
  verificar a implantação contra o contrato documentado sem procurar no código do pacote.
- `Current Write Boundaries` lista as superfícies de escrita durável atualmente
  controladas pelos papéis deste nó.
- `Scaling Boundaries` e `Failure Domains` informam qual fator de carga ou
  primeiro sinal de falha esperar para cada papel.

Use `--output=json` quando scripts precisarem do manifesto bruto.
`topology.schema` e `topology.version` fixam a revisão do contrato para
detectar divergências de formato; `topology.execution_mode` informa o modo de
despacho servido pelo nó. Os campos estáveis de máquina ficam em `topology`,
incluindo `supported_shapes`, `current_shape`, `current_process_class`,
`current_roles`, `matching_role`, `role_catalog`, `authority_boundaries`,
`authority_surfaces`, `supported_topologies`, `scaling_boundaries` e
`failure_domains`. O bloco `topology.matching_role` também publica
`partition_primitives` e `backpressure_model` para scripts verificarem os
eixos de roteamento usados na descoberta de tarefas prontas sem interpretar
prosa. `topology.matching_role.discovery_limits` expõe o contrato numérico
congelado do matching: `poll_batch_cap`, `availability_ceiling_seconds`,
`wake_signal_ttl_seconds`, `workflow_task_lease_seconds` e
`activity_task_lease_seconds`, permitindo fixar os números do pacote workflow
sem extrair dados de uma seção para pessoas.

```bash
dw server:info --output=json \
  | jq '.topology | {current_shape, current_process_class, current_roles, matching_role, scaling_boundaries, failure_domains}'
```

Para o significado dos campos, veja
[Topologia de papéis do Server](/docs/polyglot/server-role-topology).

### Informações do servidor e saúde da coordenação {#server-info-and-coordination-health}

`dw server:info` também publica o veredito de segurança de rollout de todos os
namespaces para ler a saúde da coordenação sem uma interface de saúde
separada. No modo tabela, a CLI exibe `Coordination Health:` sob `Topology:`.
Em `--output=json`, os mesmos dados ficam em `coordination_health`, com estes
campos estáveis de máquina:

- `coordination_health.schema` e `coordination_health.version` fixam a revisão do contrato.
- `coordination_health.namespace_scope` informa se o veredito cobre um namespace ou a frota inteira.
- `coordination_health.status` e `coordination_health.http_status` informam o
  veredito geral e o bloqueio HTTP aplicado à prontidão.
- `coordination_health.generated_at` registra quando o snapshot foi obtido.
- `coordination_health.categories` resume contagens por categoria (como `correctness`, `safety`, `routing`).
- `coordination_health.warning_checks` e `coordination_health.error_checks`
  listam nomes das verificações que levaram a aviso ou erro para scripts
  decidirem pelos pontos de falha.
- `coordination_health.checks[]` é o array de detalhes por verificação, em que
  cada entrada fixa `name`, `status`, `category` e `message` usados para
  explicar degradação. O inventário congelado sempre inclui
  `worker_compatibility`, `task_transport`, `routing_health`,
  `durable_resume_paths`, verificações de projeção/agendador e `activity_path`.
  `activity_path` é a contraparte de atividades de `task_transport`: apresenta
  execuções cujos prazos schedule-to-start, start-to-close, schedule-to-close
  ou heartbeat passaram sem aplicação, além do backlog sustentado de novas
  tentativas de atividades. Renomear `activity_path` é alteração de protocolo.

```bash
dw server:info --output=json \
  | jq '.coordination_health | {status, http_status, namespace_scope, warning_checks, error_checks}'
```

Para o contrato de prontidão subjacente, veja a
[Referência da API do Server](/docs/polyglot/server-api-reference).

### Autoatualização {#self-upgrade}

`dw upgrade` baixa o artefato da plataforma correspondente do release GitHub
de `durable-workflow/cli`, verifica-o com o `SHA256SUMS` do release e substitui
o binário somente se o checksum corresponder. Use `--tag` para fixar uma tag,
`--dry-run` para resolver o release de destino e imprimir URLs sem baixar e
`--force` para baixar e substituir mesmo se as versões atual e de destino coincidirem.

O comando recusa reescrever instalações gerenciadas por outra ferramenta.
A saída JSON usa um campo estável `status` para a automação decidir sem interpretar prosa:

| `status` | Significado |
| --- | --- |
| `upgraded` | Binário substituído por `target_version`. |
| `noop` | `current_version` já corresponde a `target_version`; `--force` ignora isso. |
| `dry-run` | `--dry-run` resolveu `target_version`, `asset_url` e `checksum_url` sem baixar. |
| `refused` | Tipo de instalação não é binário de release independente (vendor Composer, cellar Homebrew ou PHAR), ou não há artefato publicado para a plataforma. |
| `permission-denied` | O diretório de instalação não é gravável; o payload inclui um `hint` com o próximo passo recomendado. |
| `error` | Erro de busca do catálogo de releases, divergência de checksum ou erro de filesystem. |

Nas recusas, `installation.kind` identifica a ferramenta responsável
(`composer-vendor`, `homebrew`, `phar` ou `binary`), e `reason` nomeia o
responsável correto a usar. Para automação pública sem código-fonte,
reinstale um release fixado por `https://durable-workflow.com/install.sh`;
para Homebrew gerenciado pelo tap, use `brew upgrade durable-workflow/tap/dw`.

## Perfis de ambiente {#environment-profiles}

Perfis ficam em `~/.config/dw/config.json` ou
`$XDG_CONFIG_HOME/dw/config.json` quando definido. Defina `DW_CONFIG_HOME` para
isolar um diretório de perfis de teste ou CI.

| Comando | Finalidade | Opções importantes |
| --- | --- | --- |
| `dw env:set <name>` | Cria ou atualiza um perfil nomeado. | `--server`, `--namespace`, `--token-env`, `--token`, `--tls-verify=true\|false`, `--profile-output=table\|json\|jsonl`, `--make-default`, `--json` |
| `dw env:list` | Lista perfis com tokens literais ocultos por padrão. | `--show-token`, `--json`, `--output=jsonl` |
| `dw env:show [name]` | Mostra um perfil, usando o atual por padrão. | `--show-token`, `--json` |
| `dw env:use <name>` | Define o perfil padrão. Nomes desconhecidos falham. | `--json` |
| `dw env:delete <name>` | Exclui um perfil. | `--json` |

Prefira `--token-env=NAME` em produção para manter segredos no ambiente de
runtime, não no arquivo de perfil.

## Comandos de workflow {#workflow-commands}

| Comando | Finalidade | Opções importantes |
| --- | --- | --- |
| `dw workflow:start` | Inicia um workflow pelo plano de controle. | `--type`, `--workflow-id`, `--business-key`, `--task-queue`, `--duplicate-policy`, `--memo`, `--search-attr key=value`, `--execution-timeout`, `--run-timeout`, `--wait`, opções de entrada, `--json` |
| `dw workflow:list` | Lista instâncias de workflow. | `--type`, `--status`, `--query`, `--limit`, opções globais de saída |
| `dw workflow:describe <workflow-id>` | Descreve a execução atual ou selecionada. | `--run-id`, `--follow`, `--json` |
| `dw workflow:list-runs <workflow-id>` | Lista execuções de uma instância. | `--json` |
| `dw workflow:show-run <workflow-id> <run-id>` | Mostra uma execução. | `--follow`, `--json` |
| `dw workflow:history <workflow-id> <run-id>` | Lê eventos do histórico da execução. | `--follow`, `--page-size`, `--json` |
| `dw workflow:history-export <workflow-id> <run-id>` | Exporta o payload de histórico de arquivo da execução. | `--output-file`, opções globais |
| `dw workflow:signal <workflow-id> <signal-name>` | Envia um sinal. | `--run-id`, opções de entrada, `--json` |
| `dw workflow:query <workflow-id> <query-name>` | Executa consulta de workflow somente leitura. | `--run-id`, opções de entrada, `--json` |
| `dw workflow:update <workflow-id> <update-name>` | Envia ou executa uma atualização. | `--wait=accepted\|completed`, `--run-id`, opções de entrada, `--json` |
| `dw workflow:cancel [workflow-id]` | Fecha um workflow ou lote selecionado como cancelado; não executa limpeza no código do workflow. | `--reason`, `--run-id`, `--all-matching`, `--type`, `--status`, `--limit`, `--yes`, `--json` |
| `dw workflow:terminate <workflow-id>` | Força a terminação de um workflow. | `--reason`, `--run-id`, `--json` |
| `dw workflow:repair <workflow-id>` | Pede ao servidor para reparar uma execução presa ou retentável. | `--json` |
| `dw workflow:archive <workflow-id>` | Arquiva uma execução fechada. | `--reason`, `--json` |

Exemplos:

```bash
dw workflow:start \
  --type=App\\Workflows\\ProcessOrder \
  --workflow-id=order-123 \
  --task-queue=payments \
  --input='["order-123"]' \
  --json

dw workflow:update order-123 approve --wait=completed --input='["manager"]'
dw workflow:cancel --all-matching='WorkflowType = "ImportJob"' --limit=25 --yes
```

`workflow:start`, `workflow:signal`, `workflow:query` e `workflow:update`
validam campos canônicos pelo contrato de requisições publicado pelo servidor.
Aliases legados não canônicos são rejeitados antes de enviar a requisição.

## Inspeção de chamadas de serviço {#service-call-inspection}

Use `dw service-call:describe <endpoint> <service> <operation> <call-id>` para
inspecionar uma chamada Nexus durável no namespace do endpoint. Por exemplo,
`dw service-call:describe billing invoices create call-42 --namespace=shared --json`
retorna a resposta completa do Server.

A resposta preserva chamador original e destino vinculado, prazo da chamada,
status, resultado, registros de tentativas, falha tipada e referências retidas
de payload. Resultados bem-sucedidos permanecem em valores Avro sem perdas
`result_envelope`. Uma chamada aceita ou iniciada ainda está pendente, não é
um resultado concluído com sucesso.

O comando faz um único GET. Não solicita nova tentativa, cancelamento ou
download de objeto externo. O Server pode reconciliar uma chamada com o
resultado terminal de seu workflow vinculado ao atender a leitura. Aplicam-se
a autorização do namespace e todos os seletores de endpoint, serviço, operação e chamada.

## Comandos de adaptadores de ponte {#bridge-adapter-commands}

Comandos de ponte são ferramentas limitadas de entrada e transferência para
eventos de integração. Chamam a interface de adaptadores do servidor e
retornam o formato `durable-workflow.v2.bridge-adapter-outcome.contract` em
JSON. Não executam código de workflow nem controlam suas transições de estado.

| Comando | Finalidade | Opções importantes |
| --- | --- | --- |
| `dw bridge:webhook <adapter>` | Envia um evento de ponte de webhook que inicia, sinaliza ou atualiza um workflow pelo plano de controle. | `--action=start_workflow\|signal_workflow\|update_workflow`, `--idempotency-key`, `--target`, opções de entrada, `--correlation`, `--json` |

Exemplos:

```bash
dw bridge:webhook stripe \
  --action=start_workflow \
  --idempotency-key=stripe-event-1001 \
  --target='{"workflow_type":"orders.fulfillment","task_queue":"external-workflows","business_key":"order-1001"}' \
  --input='{"order_id":"order-1001"}' \
  --json

dw bridge:webhook pagerduty \
  --action=signal_workflow \
  --idempotency-key=pd-event-3003 \
  --target='{"workflow_id":"wf-remediation-42","signal_name":"incident_escalated"}' \
  --input='{"severity":"critical"}'
```

Use os campos de resultado da ponte em vez de inferir comportamento apenas do
status HTTP. `outcome`, `reason`, `control_plane_outcome`, `idempotency_key`
e o resumo `target` com dados sensíveis ocultos são o contrato de automação
para duplicatas, falhas de roteamento, payloads malformados e transferências aceitas.

## Comandos de agendamento {#schedule-commands}

| Comando | Finalidade | Opções importantes |
| --- | --- | --- |
| `dw schedule:create` | Cria um agendamento. | `--schedule-id`, `--workflow-type`, `--cron`, `--interval`, `--task-queue`, `--timezone`, `--execution-timeout`, `--run-timeout`, `--overlap-policy`, `--jitter`, `--max-runs`, `--paused`, `--note`, opções de entrada, `--json` |
| `dw schedule:list` | Lista agendamentos. | opções globais de saída |
| `dw schedule:describe <schedule-id>` | Descreve um agendamento. | `--json` |
| `dw schedule:update <schedule-id>` | Atualiza especificação ou entrada do workflow. | opções de criação de agendamento, opções de entrada, `--json` |
| `dw schedule:pause <schedule-id>` | Pausa um agendamento. | `--note`, `--json` |
| `dw schedule:resume <schedule-id>` | Retoma um agendamento. | `--note`, `--json` |
| `dw schedule:trigger <schedule-id>` | Dispara um agendamento imediatamente. | `--overlap-policy`, `--json` |
| `dw schedule:backfill <schedule-id>` | Preenche retroativamente uma janela de tempo. | `--start-time`, `--end-time`, `--overlap-policy`, `--json` |
| `dw schedule:delete <schedule-id>` | Exclui um agendamento. | `--json` |

Use `--cron` ou `--interval` ao criar agendamentos por intervalo. Use
`--paused` para registrar na implantação sem iniciar trabalho ainda.

## Comandos de workers e filas de tarefas {#worker-and-task-queue-commands}

| Comando | Finalidade | Opções importantes |
| --- | --- | --- |
| `dw worker:register [worker-id]` | Registra worker com metadados de capacidade e compatibilidade. | `--task-queue`, `--runtime`, `--sdk-version`, `--build-id`, `--workflow-type`, `--activity-type`, `--max-workflow-tasks`, `--max-activity-tasks`, `--json` |
| `dw worker:list` | Lista workers. | `--task-queue`, `--status`, opções globais de saída |
| `dw worker:describe <worker-id>` | Descreve um worker. | `--json` |
| `dw worker:deregister <worker-id>` | Remove o registro de um worker. | `--json` |
| `dw task-queue:list` | Lista filas ativas e status de admissão. | opções globais de saída |
| `dw task-queue:describe <queue>` | Descreve capacidade de workers, leases, orçamentos de despacho e capacidade pendente de consultas. | `--json` |
| `dw task-queue:build-ids <queue>` | Inspeciona estado das coortes por build id e status de rollout de uma fila. | `--json` |
| `dw task-queue:drain <queue>` | Marca uma coorte como drenando para parar de reservar novas tarefas. | `--build-id <value>`, `--unversioned`, `--json` |
| `dw task-queue:resume <queue>` | Limpa uma drenagem anterior para voltar a reservar trabalho. | `--build-id <value>`, `--unversioned`, `--json` |

Os comandos de fila são a visão operacional preferida para diagnósticos de
limitação, capacidade e ausência de workers. Veja
[Admissão de filas de tarefas](/docs/polyglot/task-queue-admission) para a
política do servidor e [Rollout por build id de workers](/docs/polyglot/worker-build-id-rollout)
para o ciclo completo de transição de sem versão para versionado, canário,
drenagem e rollback.

`dw task-queue:drain` e `dw task-queue:resume` exigem `--build-id <value>`
para uma coorte específica ou `--unversioned` para workers registrados sem
`build_id`. Combinar ambos falha rapidamente com erro de opção inválida.
Ambos são idempotentes: drenagens repetidas não alteram `drained_at`, e
retomar uma coorte já ativa não faz nada.

## Comandos do protocolo de workers {#worker-protocol-commands}

Estes são recursos de baixo nível do protocolo para diagnóstico, testes de
fumaça e experimentos de workers sem SDK. Workers PHP e Python normais devem
usar os loops de seus SDKs.

| Comando | Finalidade | Opções importantes |
| --- | --- | --- |
| `dw workflow-task:poll <worker-id>` | Consulta uma tarefa de workflow. | `--task-queue`, `--build-id`, `--poll-request-id`, `--history-page-size`, `--accept-history-encoding`, `--json` |
| `dw workflow-task:history <task-id> <page-token>` | Busca a próxima página do histórico de uma tarefa sob lease. | `--lease-owner`, `--attempt`, `--json` |
| `dw workflow-task:complete <task-id> <attempt>` | Conclui uma tarefa de workflow com payloads de comandos. | `--lease-owner`, `--complete-result`, `--command`, `--json` |
| `dw workflow-task:fail <task-id> <attempt>` | Informa falha de execução da tarefa para nova tentativa ou diagnóstico. Distinto de concluir com comando `fail_workflow`. | `--lease-owner`, `--message`, `--type`, `--stack-trace`, `--json` |
| `dw query-task:poll <worker-id>` | Consulta e obtém lease de uma tarefa de consulta roteada. | `--task-queue`, `--json` |
| `dw query-task:complete <query-task-id> <attempt>` | Conclui uma consulta sob lease com resultado JSON e envelope correspondente. | `--lease-owner`, `--result`, `--json` |
| `dw query-task:fail <query-task-id> <attempt>` | Informa falha de consulta sob lease com motivo legível por máquina. | `--lease-owner`, `--message`, `--reason`, `--type`, `--stack-trace`, `--json` |
| `dw activity:complete <task-id> <attempt-id>` | Conclui uma tentativa de atividade sob lease. | `--lease-owner`, opções de entrada, `--json` |
| `dw activity:fail <task-id> <attempt-id>` | Falha uma tentativa de atividade sob lease. | `--lease-owner`, `--message`, `--type`, `--non-retryable`, `--json` |

Use `workflow-task:fail` para falhas de execução no worker, como divergências
de replay ou erros de desserialização; aponta para
`POST /worker/workflow-tasks/{taskId}/fail`. Concluir uma tarefa com comando
que falha o workflow é separado e passa por `workflow-task:complete` com o
payload apropriado.

`query-task:poll`, `query-task:complete` e `query-task:fail` acionam a interface
de consultas roteadas em `/worker/query-tasks/…`. Workers normais buscam
consultas por seu handler SDK; a CLI serve para diagnósticos, verificações de
paridade CLI/SDK e experimentos sem SDK. Falhas de consulta usam por padrão
`--reason=query_rejected`; use motivo estável como `unknown_query`,
`decode_failure` ou identificador de runtime para distinguir rejeições
esperadas de erros do runtime.

### Páginas de histórico de tarefa de workflow {#workflow-task-history-pages}

`workflow-task:history` é o wrapper de diagnóstico CLI do endpoint de páginas
de histórico no plano de workers. Use somente após `workflow-task:poll`
retornar uma tarefa sob lease com `next_history_page_token`; workers normais
devem deixar seu SDK buscar páginas adicionais.

<!-- docs-example id="cli.workflow-task-history.command" -->
```bash
dw workflow-task:history workflow-task-01 history-page-2 \
  --lease-owner=python-worker-1 \
  --attempt=2 \
  --json
```

A saída JSON é a resposta do servidor sem renomear campos:

<!-- docs-example id="cli.workflow-task-history.response" -->
```json
{
  "history_events": [
    {"event_id": 2, "event_type": "ActivityScheduled", "payload": {}}
  ],
  "total_history_events": 4,
  "next_history_page_token": "history-page-3"
}
```

Automações devem ler `history_events`, `total_history_events` e
`next_history_page_token`. O endpoint de histórico de worker não usa os
campos `events` ou `next_page_token` do histórico de execução no plano de controle.

## Comandos de namespace e atributos de busca {#namespace-and-search-attribute-commands}

| Comando | Finalidade | Opções importantes |
| --- | --- | --- |
| `dw namespace:list` | Lista namespaces. | opções globais de saída |
| `dw namespace:create <name>` | Cria um namespace. | `--description`, `--retention`, `--json` |
| `dw namespace:describe <name>` | Descreve um namespace. | `--json` |
| `dw namespace:update <name>` | Atualiza metadados de namespace. | `--description`, `--retention`, `--json` |
| `dw namespace:set-storage-driver <name> <driver>` | Configura a política de armazenamento externo do namespace usada quando payloads codificados excedem o limite de transferência. | `--threshold-bytes`, `--uri`, `--disk`, `--bucket`, `--prefix`, `--region`, `--endpoint`, `--auth-profile`, `--disable`, `--json` |
| `dw storage:test` | Grava e lê um payload pequeno inline e um grande externo pela política selecionada ou driver substituto. | `--driver=local\|s3\|gcs\|azure`, `--small-bytes`, `--large-bytes`, opções globais, `--json` |
| `dw search-attribute:list` | Lista atributos de busca. | opções globais de saída |
| `dw search-attribute:create <name> <type>` | Registra um atributo de busca. | `--json` |
| `dw search-attribute:delete <name>` | Exclui um atributo de busca. | `--json` |

Tipos de atributos de busca são valores compatíveis com o servidor, como
`keyword`, `text`, `int`, `double`, `bool`, `datetime` e `keyword_list`.

Comandos de armazenamento externo chamam a API de armazenamento do namespace.
O driver é `local`, `s3`, `gcs` ou `azure`; drivers de objetos usam a
configuração de filesystem do servidor, portanto flags descrevem a política
em vez de carregar credenciais de provedor. Use `--disk` para vincular `s3`,
`gcs` ou `azure` a um disco nomeado no servidor que contenha as credenciais
reais. Use `--disable` para manter o registro da política impedindo novas transferências.

Exemplos:

```bash
dw namespace:set-storage-driver billing s3 \
  --disk=external-payload-objects \
  --bucket=dw-payloads \
  --prefix=billing/ \
  --threshold-bytes=2097152 \
  --json

dw namespace:set-storage-driver dev local \
  --uri=file:///var/lib/durable-workflow/payloads

dw storage:test --namespace=billing --large-bytes=2097152 --json
dw storage:test --driver=s3 --small-bytes=128 --large-bytes=3145728 --json
```

Em JSON, `namespace:set-storage-driver` retorna o payload do namespace com sua
política `external_payload_storage`. `storage:test` retorna o status do
diagnóstico e objetos de resultado `small_payload` e `large_payload`;
automações devem decidir por esses campos em vez de interpretar a tabela para pessoas.

O diagnóstico também é a verificação operacional mais rápida do contrato de
envelope de referência. Um resultado aprovado de payload grande prova que a
política pode gravar bytes codificados, retornar uma referência
`durable-workflow.v2.external-payload-reference.v1`, reler o objeto e verificar
`size_bytes` e `sha256`. Um diagnóstico com falha deve ser tratado como
problema de política de armazenamento antes de permitir que workflows
transfiram payloads por esse namespace.

## Comandos do sistema {#system-commands}

Comandos do sistema expõem passagens de manutenção do servidor como operações
explícitas que podem ser usadas em scripts.

| Comando | Finalidade | Opções importantes |
| --- | --- | --- |
| `dw system:repair-status` | Mostra backlog/status de reparo de workflows. | `--json` |
| `dw system:repair-pass` | Executa uma passagem de reparo. | `--run-id`, `--limit`, `--json` |
| `dw system:activity-timeout-status` | Mostra backlog/status de timeout de atividades. | `--json` |
| `dw system:activity-timeout-pass` | Executa uma passagem de timeout de atividades. | `--task-id`, `--limit`, `--json` |
| `dw system:retention-status` | Mostra backlog/status de retenção. | `--json` |
| `dw system:retention-pass` | Executa uma passagem de limpeza por retenção. | `--run-id`, `--limit`, `--json` |

Prefira comandos de status antes dos de passagem em runbooks, para que
operadores vejam o escopo pendente antes de alterar o estado do servidor.

## Comandos de schema {#schema-commands}

| Comando | Finalidade | Opções importantes |
| --- | --- | --- |
| `dw schema:list` | Lista schemas publicados legíveis por máquina. | não exige conexão com servidor |
| `dw schema:show <command-name>` | Mostra o JSON Schema incluído para a saída de um comando. | `--output=json\|jsonl`; não exige conexão com servidor |
| `dw schema:manifest` | Mostra o manifesto de schemas. | não exige conexão com servidor |

Comandos de schema são úteis quando um cliente IA ou job de CI precisa do
contrato atual de plano de controle, resposta ou saída sem extrair prosa.
O [manifesto v4 atual](https://durable-workflow.github.io/cli-json-envelopes/v4/manifest.json)
vincula cada envelope JSON e schema JSONL por registro por resolvedor público
e digest. Seus campos de payload de início/execução e consulta/atualização
aceitam somente o codec `avro`. Os manifestos retidos
[v3](https://durable-workflow.github.io/cli-json-envelopes/v3/manifest.json) e
[v2](https://durable-workflow.github.io/cli-json-envelopes/v2/manifest.json)
continuam disponíveis com os bytes originais para consumidores fixados em revisão.

## Contrato de saída e códigos de saída {#output-and-exit-contract}

Use `--output=json` quando um comando retorna um objeto e `--output=jsonl`
quando uma listagem alimenta um processador de streams. Tabelas para pessoas
podem melhorar com o tempo; nomes de campos JSON são o contrato de automação.

Todos os comandos usam a política estável documentada no
[guia da CLI](/docs/polyglot/cli#exit-codes):

| Código | Significado |
| --- | --- |
| `0` | Sucesso. |
| `1` | O comando executou, mas falhou genericamente. |
| `2` | Uso local inválido ou erro de validação. |
| `3` | Falha de rede ou transporte. |
| `4` | Falha de autenticação ou autorização. |
| `5` | Recurso não encontrado. |
| `6` | Falha `5xx` no servidor. |
| `7` | Timeout. |

Para pacotes de suporte, colete `dw doctor --output=json`,
`dw server:info --output=json` e `dw debug workflow <workflow-id> --output=json`.

## Guias relacionados {#related-guides}

- [CLI](./cli.mdx) cobre instalação, perfis e comportamento dos códigos de saída.
- [Server](./server.md) documenta o plano de controle HTTP chamado pelos comandos apoiados pelo servidor.
- [Capacidades de clientes e workers](./cli-python-parity.md) compara interfaces
  de cliente e worker de CLI, PHP, Python e Rust.
