---
sidebar_position: 2
title: Server
description: Implantação e configuração do Durable Workflow Server independente.
tags:
  - server
  - plano-de-controle
  - operações
  - multilíngue
keywords:
  - Durable Workflow Server
  - servidor independente
  - API do plano de controle
  - workflows multilíngues
---

# Server {#server}

O Durable Workflow Server é publicado como um serviço independente de orquestração de workflows implementado em PHP. Ele expõe o mesmo motor durável do pacote PHP incorporado por meio de um plano de controle HTTP+JSON e um protocolo de workers independentes da linguagem. PHP é um detalhe de implementação desse componente, não uma exigência para a linguagem da aplicação.

## É apenas para equipes PHP? {#is-this-only-for-php-teams}

Não. PHP, Python e Rust têm SDKs oficiais. Uma equipe que usa apenas Python ou Rust pode implantar o Server como infraestrutura, escrever workflows e atividades com seu SDK nativo e se comunicar pelo protocolo público. Sua aplicação não incorpora Laravel nem se torna uma aplicação Laravel.

Os caminhos de adoção são separados:

- **Servidor independente:** os operadores implantam a imagem publicada do Server e seus papéis de banco de dados, fila/cache, agendador e API. As equipes executam workers PHP, Python ou Rust nesse endpoint. O Server controla o estado de orquestração e a fronteira pública do plano de controle e dos workers.
- **Incorporação ao Laravel:** uma aplicação Laravel instala o pacote PHP de workflows e controla o motor por sua própria fila, banco de dados, configuração e implantação. Essa é a vantagem da integração nativa ao Laravel, não um requisito do servidor independente.
- **Cloud gerenciado:** o Durable Workflow Cloud opera o runtime de orquestração, sua persistência, localização e recuperação. As equipes executam clientes e workers dos SDKs em um namespace do Cloud provisionado. Elas não implantam esta distribuição do Server para o Cloud nem conectam um Server próprio a ele. Consulte [Runtime gerenciado do Cloud](/docs/polyglot/cloud-control-plane/).

As três opções usam os mesmos conceitos de execução durável. Os workers externos do Server e do Cloud usam nomes estáveis de texto para tipos de workflow e atividade e o envelope compartilhado do codec. Assim, um workflow filho ou uma atividade entre linguagens preserva o formato dos dados sem expor a serialização do PHP.

Se estiver escolhendo entre o Server independente e a incorporação do pacote, comece por [Modos de implantação](/docs/polyglot/deployment-modes). Esta página trata da distribuição no modo de serviço.

Use o Server independente quando precisar de:
- **Workflows multilíngues**: workers de workflows e atividades PHP, Python e Rust compartilhando um runtime durável
- **Orquestração de microsserviços**: coordenar serviços escritos em linguagens diferentes
- **Runtime centralizado**: várias aplicações compartilham um motor de workflows
- **Ambientes sem Laravel**: usar o Durable Workflow fora do Laravel

Se já executa v2 incorporado a uma aplicação Laravel, use o [guia de migração para o Server](/docs/polyglot/embedded-to-server) para preparar chaves de tipo, implantar o Server ao lado da execução incorporada, conectar workers e direcionar apenas os novos inícios de workflow para o Server. Mantenha [Modos de implantação](/docs/polyglot/deployment-modes) por perto durante a mudança para preservar ids, resultados de comandos, semântica das tarefas e regras de propriedade do runtime explícitos.

Consulte [Compatibilidade e roteamento de workers](/docs/polyglot/worker-compatibility-routing) ao implantar coortes de compilação, drenar coortes antigas ou manter execuções prolongadas fixadas a executores compatíveis durante uma reversão.

Consulte [Topologia de papéis do Server](/docs/polyglot/server-role-topology) para conhecer o vocabulário de papéis, classes de processo, limites de autoridade, domínios de falha e caminho de migração publicados por `GET /api/cluster/info`.

## Início rápido {#quick-start}

:::info Alternativa gerenciada

[Execução gerenciada: Cloud Dev por $0.075/hora, limitado a $50/mês, sem cobrança por workflow.](https://cloud.durable-workflow.com/pricing)
A tarifa por hora provisionada é medida por minuto, com mínimo de $2 por mês
ativo e 5 GB de armazenamento incluídos. Os preços são em USD por runtime. Dev não tem SLA
de disponibilidade. Os planos HA estão previstos e ainda não podem ser provisionados.

:::

### Imagem publicada e SQLite {#published-image--sqlite}

A forma mais rápida de executar o Server sem código-fonte é a imagem Docker publicada. Este início rápido usa SQLite, filas de banco de dados e cache de arquivos dentro do contêiner. Monte `/app/database` para que a inicialização e a API compartilhem o mesmo arquivo SQLite:

```bash
server_image=%%artifact.serverDockerHubImage%%
export DW_AUTH_TOKEN=dev-token

docker volume create durable-workflow-server-quickstart

docker run --rm \
  -v durable-workflow-server-quickstart:/app/database \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$server_image" server-bootstrap

docker rm -f durable-workflow-server durable-workflow-server-queue-worker >/dev/null 2>&1 || true
docker run -d --name durable-workflow-server \
  -p 127.0.0.1:8080:8080 \
  -v durable-workflow-server-quickstart:/app/database \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$server_image"

docker run -d --name durable-workflow-server-queue-worker \
  --health-cmd="server-process-healthcheck worker" \
  -v durable-workflow-server-quickstart:/app/database \
  -e DW_SERVER_PROCESS_CLASS=worker_node \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$server_image" php artisan queue:work database --queue=default --sleep=1 --tries=3

until curl -sf http://localhost:8080/api/ready >/dev/null; do sleep 1; done
curl http://localhost:8080/api/health
curl -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  http://localhost:8080/api/cluster/info \
  | jq '.topology | {current_shape, current_roles, execution_mode}'
```

Isso cria o namespace padrão e inicia a API e seu worker de infraestrutura. A fila do Laravel é `default`, separada das filas de tarefas nomeadas do SDK. O worker da fila faz avançar os temporizadores duráveis enquanto os workers dos SDKs estão parados. A avaliação de agendamentos e a manutenção de produção precisam dos papéis adicionais do conjunto Compose publicado abaixo.

A API é vinculada à interface de loopback e `dev-token` serve apenas para este exercício. Para acesso remoto, use a implantação Compose com credenciais próprias, TLS e controles de rede. Use esse conjunto com MySQL e Redis compartilhado para ensaiar produção.

Remova os contêineres e o banco de dados deste exercício ao terminar:

```bash
docker rm -f durable-workflow-server durable-workflow-server-queue-worker
docker volume rm durable-workflow-server-quickstart
```

### Imagem publicada e Compose {#published-image--compose}

Use o artefato Compose publicado para um conjunto de vários contêineres sem código-fonte apoiado por MySQL e Redis:

```bash
curl -fsSLO https://raw.githubusercontent.com/durable-workflow/server/main/docker-compose.published.yml

server_image=%%artifact.serverDockerHubImage%%
export DW_AUTH_TOKEN=dev-token

env DW_SERVER_IMAGE="$server_image" docker compose \
  -f docker-compose.published.yml up -d --wait
curl -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  http://localhost:8080/api/cluster/info \
  | jq '.topology | {current_shape, current_roles, execution_mode}'
```

### Portas {#ports}

| Serviço | Porta | Finalidade |
|---------|------|---------|
| API do Server | 8080 | Endpoints do plano de controle e do protocolo dos workers |
| MySQL | 3306 | Banco de dados, exposto para facilitar o desenvolvimento |
| Redis | 6379 | Cache e fila, expostos para facilitar o desenvolvimento |

## Configuração {#configuration}

O Server é configurado com variáveis de ambiente. As opções principais estão resumidas abaixo. O contrato completo `DW_*` para operadores está documentado na [referência de configuração](/docs/polyglot/server-config-reference).

### Banco de dados {#database}

```bash
DB_CONNECTION=mysql
DB_HOST=mysql
DB_PORT=3306
DB_DATABASE=workflow
DB_USERNAME=workflow
DB_PASSWORD=secret
```

Compatíveis: MySQL 8.0+, PostgreSQL 13+ e SQLite 3.35+.

### Cache e fila {#cache-and-queue}

```bash
CACHE_STORE=redis
QUEUE_CONNECTION=redis

REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=null
REDIS_DB=0
```

O cache deve permitir [bloqueios atômicos](https://laravel.com/docs/12.x/cache#atomic-locks). Drivers de fila: Redis, Amazon SQS, Beanstalkd e banco de dados.

Bloqueios atômicos de cache são necessários para os [limites de admissão por fila](/docs/polyglot/task-queue-admission) e a contrapressão de consultas. Use Redis em implantações com vários nós nas quais a admissão de workflows, atividades ou consultas precisa valer entre todos os processos do Server.

### Autenticação {#authentication}

O Server oferece três modos de autenticação:

**Baseada em token** (padrão):

```bash
DW_AUTH_DRIVER=token
DW_AUTH_TOKEN=your-secret-token-here
```

Todas as requisições devem enviar `Authorization: Bearer your-secret-token-here`.

Para uma implantação com privilégios mínimos, configure tokens limitados por papel em vez de um token compartilhado:

```bash
DW_AUTH_DRIVER=token
DW_WORKER_TOKEN=worker-secret
DW_OPERATOR_TOKEN=operator-secret
DW_ADMIN_TOKEN=admin-secret
```

Os tokens de worker permitem registrar workers, fazer polling, enviar heartbeats e concluir trabalho. Os de operador permitem iniciar, listar, sinalizar, consultar, atualizar, reparar, cancelar, terminar, arquivar e observar workflows. Os de administrador permitem usar endpoints administrativos, como gestão de namespaces e retenção.

**Assinatura HMAC**:

```bash
DW_AUTH_DRIVER=signature
DW_SIGNATURE_KEY=your-signature-secret
```

As requisições devem incluir `X-Signature`, calculada como `hash_hmac('sha256', request_body, DW_SIGNATURE_KEY)`. O Server também permite chaves de assinatura limitadas por papel:

```bash
DW_AUTH_DRIVER=signature
DW_WORKER_SIGNATURE_KEY=worker-signature-secret
DW_OPERATOR_SIGNATURE_KEY=operator-signature-secret
DW_ADMIN_SIGNATURE_KEY=admin-signature-secret
```

**Sem autenticação** (apenas desenvolvimento):

```bash
DW_AUTH_DRIVER=none
```

⚠️ **Não use `none` em produção.** Todos os endpoints passam a ser públicos.

### Pacote Workflow {#workflow-package}

A imagem Docker instala o pacote `durable-workflow/workflow`. Escolha a versão:

```bash
# Build-time arg (set in docker-compose.yml or pass to docker build)
WORKFLOW_PACKAGE_REF=v2        # branch, tag, or commit
WORKFLOW_PACKAGE_SOURCE=       # custom Git remote (optional)
```

### Retenção {#retention}

O PHP Server usa a retenção por namespace para selecionar o histórico encerrado que pode ser limpo. A duração limitada padrão é configurada com:

```bash
DW_HISTORY_RETENTION_DAYS=30
```

Cada busca usa a política **atual** do namespace. Alterar a duração também afeta o histórico encerrado antes da mudança. Isso não dá a cada execução um novo período de retenção a partir da data de atualização.

| Alteração de política | Efeito sobre execuções encerradas retidas |
| --- | --- |
| Reduzir a retenção limitada | Execuções antigas podem se tornar elegíveis na próxima busca. |
| Ampliar a retenção limitada | Execuções ainda retidas podem deixar de ser elegíveis. O histórico já removido não é restaurado. |
| Mudar para `forever` | As buscas não selecionam execuções e as passagens explícitas as ignoram. |
| Mudar de `forever` para `bounded` | Informe `retention_days`; o histórico encerrado existente é avaliado com essa duração. |

Por exemplo, em **19 de outubro às 12:00 UTC**, uma execução encerrada em **1º de outubro às 12:00 UTC** tem 18 dias. Está fora de uma janela de 7 dias e dentro de uma de 90. Alterar de 90 para 7 dias a torna elegível imediatamente; a limpeza pode processá-la em uma passagem posterior. Uma execução encerrada exatamente no limite fica fora dessa seleção, que usa uma comparação estritamente anterior.

#### Revisar uma alteração de retenção {#review-a-retention-change}

Antes de reduzir a retenção, revise os instantes de encerramento e preserve o histórico necessário. Exporte execuções importantes pela [API de exportação de histórico](./server-api-reference.md#workflow-control-plane) e mantenha cópias recuperáveis do banco de dados e dos payloads externos. Uma exportação de replay precisa dos objetos referenciados e não substitui um backup do banco de dados e do armazenamento.

Atualize o namespace com uma credencial de administrador:

```bash
curl -sS -X PUT "$DURABLE_WORKFLOW_SERVER_URL/api/namespaces/orders-prod" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"retention_mode":"bounded","retention_days":7}'
```

Para `forever`, envie `{"retention_mode":"forever","retention_days":null}`. Voltar à retenção limitada exige uma duração explícita de 1 a 365 dias.

Inspecione a política atual do namespace e a lista limitada de execuções elegíveis:

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/system/retention?limit=100" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

`cutoff` descreve a busca atual. `expired_run_count` conta os IDs retornados até `scan_limit`, não todo o trabalho pendente. `scan_pressure: true` significa que esse limite foi atingido. Essa leitura não remove histórico.

A atualização não é uma prévia nem um período de carência: heartbeats normais dos workers já podem acionar uma pequena passagem de retenção com frequência limitada após alterar a política. `history:prune` agendado e as passagens explícitas do sistema também podem processar execuções elegíveis. Faça backups e revise **antes** de reduzir a política.

#### Limpeza e proteções {#retention-cleanup-and-protections}

`POST /api/system/retention/pass` sem `run_ids` seleciona execuções expiradas sob a política atual até seu limite. Inspecione `pruned`, `skipped`, `failed` e os motivos por execução da resposta para distinguir a seleção da exclusão concluída.

:::warning IDs explícitos ignoram a busca por idade

No PHP Server, fornecer `run_ids` direciona diretamente essas execuções encerradas, inclusive as mais recentes que a janela de retenção limitada atual. Não há interseção com a lista de execuções expiradas. Revise cada alvo como uma operação destrutiva. Omita `run_ids` na limpeza normal por idade.

:::

As passagens de retenção ignoram execuções arquivadas e namespaces configurados como `forever`. Arquivar mantém o histórico no mesmo banco de dados, não é uma cópia independente. Outras restrições, como uma atividade destacada ainda aberta, também podem impedir a exclusão. Verifique o motivo retornado em vez de presumir que uma execução selecionada foi removida.

Para manter um registro além da janela limitada de 1 a 365 dias, escolha entre preservar o histórico no banco de dados ou manter exportações verificadas independentes. O [procedimento de histórico de longo prazo](../configuration/pruning-workflows.md#keeping-history-beyond-database-retention) explica seleção por `CloseTime`, paginação, bytes externos e reconciliação antes da remoção. A API publicada não permite desarquivar. Uma execução arquivada não pode ser removida depois pelas passagens de retenção do Server.

A limpeza remove histórico, detalhes relacionados e payloads externos elegíveis. Uma ampliação posterior da política não pode recuperá-los. O [guia de limpeza incorporada](../configuration/pruning-workflows.md) descreve um processo separado controlado pela aplicação; sua API de limpeza não aplica a política de retenção por namespace do Server. Para outro runtime, confirme o comportamento de retenção antes de aplicar este procedimento do PHP Server.

As exportações atuais preservam referências externas, não cópias independentes dos objetos. O fluxo de arquivo autossuficiente verificado é solicitado em [Server #520](https://github.com/durable-workflow/server/issues/520); uma exportação com checksum não o fornece. Recuse também históricos já limpos em vez de confiar no indicador `history_complete`: o caso conhecido de falsa completude permanece aberto em [Workflow #856](https://github.com/durable-workflow/workflow/issues/856).

### Namespaces {#namespaces}

O comando `server-bootstrap` executa migrações e cria o namespace `default`. Use `DW_DEFAULT_NAMESPACE` para alterar o namespace quando uma requisição omitir seu cabeçalho:

```bash
DW_DEFAULT_NAMESPACE=default
```

Crie namespaces pela API:

```bash
curl -X POST http://localhost:8080/api/namespaces \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "production",
    "description": "Production workflows",
    "retention_days": 90
  }'
```

## Verificações de saúde {#health-checks}

### Saúde da API {#api-health}

```bash
curl http://localhost:8080/api/health
```

Retorna `200 OK` com:

```json
{
  "status": "serving",
  "timestamp": "2026-04-15T12:00:00Z",
  "checks": {
    "database": "ok"
  },
  "topology": {
    "schema": "durable-workflow.v2.role-topology",
    "version": 4,
    "current_shape": "standalone_server",
    "current_process_class": "server_http_node",
    "current_roles": ["api_ingress", "control_plane", "matching", "history_projection"],
    "execution_mode": "remote_worker_protocol",
    "matching_role": {
      "queue_wake_enabled": true,
      "shape": "in_worker",
      "wake_owner": "worker_loop",
      "task_dispatch_mode": "poll",
      "partition_primitives": ["connection", "queue", "compatibility", "namespace"],
      "backpressure_model": "lease_ownership",
      "discovery_limits": {
        "poll_batch_cap": 100,
        "availability_ceiling_seconds": 1,
        "wake_signal_ttl_seconds": 60,
        "workflow_task_lease_seconds": 300,
        "activity_task_lease_seconds": 300
      }
    }
  }
}
```

### Resumo público da topologia {#public-topology-summary}

`GET /api/health` e `GET /api/ready`, sem autenticação, publicam o resumo `topology` do nó que responde. Esse bloco público é menor que `/api/cluster/info`, mas inclui os campos necessários para identificar nós de papéis separados antes da autenticação do plano de controle ou da resolução do namespace:

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

`topology.matching_role.discovery_limits` é o contrato numérico fixado do papel de correspondência compilado no pacote Workflow: `poll_batch_cap` é o máximo de linhas prontas retornadas por polling; `availability_ceiling_seconds` é a tolerância entre backends aplicada a `available_at` para suportar diferenças inferiores a um segundo em tarefas recém-disponíveis; `wake_signal_ttl_seconds` é o TTL padrão de sinais de `CacheLongPollWakeStore`; e `workflow_task_lease_seconds` / `activity_task_lease_seconds` são as durações padrão de seus leases. Reduzir esses valores é uma alteração de protocolo, pois workers e ferramentas os leem como o contrato oficial de correspondência.

O mesmo resumo aparece em `/api/ready` mesmo quando a implantação não está pronta. Assim, as sondas podem distinguir respostas de `server_http_node`, `scheduler_node`, `matching_node` e `execution_node` enquanto há bloqueios de inicialização.

### Prontidão {#readiness}

```bash
curl http://localhost:8080/api/ready
```

`/api/ready` é a condição de prontidão para implantar. Só retorna `200 OK` se os pré-requisitos de inicialização e a segurança da implantação estiverem prontos ou em estado de aviso.

Interprete os campos legíveis por máquina assim:

- `checks.migrations.repository_exists` e `checks.migrations.pending_migrations` indicam se o repositório de migrações existe e quais registros continuam pendentes.
- `checks.migrations.adoptable_migrations` lista migrações de criação de tabelas que só precisam ser incorporadas ao histórico de migrações. É uma `warning`, não uma interrupção obrigatória, portanto o Server pode continuar pronto enquanto os operadores agendam essa incorporação.
- `checks.migrations.blocking_migrations` lista registros necessários à segurança da implantação que devem ser aplicados antes de admitir tráfego. Se a lista não estiver vazia, a prontidão é bloqueada com `checks.migrations.status = "pending"`.
- `checks.migrations.missing_tables` informa as tabelas duráveis ainda ausentes, e `checks.migrations.operator_surface` indica se a interface do operador v2 pode explicar a segurança da implantação após a inicialização.
- `checks.migrations.readiness_contract.version` fixa a revisão do contrato de inicialização e adoção de migrações que os scripts devem interpretar.
- `checks.workflow_v2` reflete a avaliação de segurança da implantação em todos os namespaces. Se ainda não puder ser avaliada, retorna `status: "blocked"` com `blocked_by`, `message` e `remediation` para corrigir o pré-requisito em vez de perseguir sintomas nas filas.

### Bloqueio de inicialização de workflows {#workflow-bootstrap-gate}

`checks.workflow_v2.status: "blocked"` também bloqueia rotas, não é apenas um sinal de prontidão. Enquanto a inicialização v2 está bloqueada, o Server recusa rotas de início e alteração de workflows, alteração de agendamentos, adaptadores de ponte e protocolo dos workers com HTTP `503` e `reason: "workflow_v2_blocked"`. A verificação ocorre após validar o papel e a versão do protocolo, mas antes de resolver o namespace, portanto requisições bloqueadas nunca descobrem sua existência.

A resposta de bloqueio de inicialização sempre inclui:

- `reason: "workflow_v2_blocked"` para que os clientes decidam por um nome legível por máquina e não por uma mensagem em prosa.
- `blocked_by`: lista ordenada de pré-requisitos que bloqueiam a prontidão, por exemplo `migrations`.
- `remediation`: instruções para o operador resolver os bloqueios, refletidas de `checks.workflow_v2.remediation` em `/api/ready`.

Famílias de rotas sujeitas ao bloqueio de inicialização:

- **Início e alteração de workflows**: rotas de início, comandos e comandos de uma execução específica em `/api/workflows`.
- **Alteração de agendamentos**: `POST /api/schedules`, `PUT /api/schedules/{scheduleId}`, `DELETE /api/schedules/{scheduleId}`, `POST /api/schedules/{scheduleId}/pause`, `POST /api/schedules/{scheduleId}/resume`, `POST /api/schedules/{scheduleId}/trigger` e `POST /api/schedules/{scheduleId}/backfill`.
- **Adaptadores de ponte**: `POST /api/bridge-adapters/webhook/{adapter}`.
- **Protocolo dos workers**: todas as rotas `/api/worker` e `/api/worker/*`, incluindo registro, heartbeat e operações de tarefas de workflow, consulta e atividade. Elas retornam o bloqueio no envelope do protocolo dos workers e preservam `X-Durable-Workflow-Protocol-Version` para que os SDKs interpretem o mesmo `reason: "workflow_v2_blocked"` do plano de controle.

As **leituras** de agendamentos são excluídas de propósito para permitir inspecioná-los durante a recuperação: `GET /api/schedules`, `GET /api/schedules/{scheduleId}` e `GET /api/schedules/{scheduleId}/history` continuam disponíveis enquanto o bloqueio de inicialização impede outras rotas.

### Capacidades do Server {#server-capabilities}

```bash
curl http://localhost:8080/api/cluster/info \
  -H "Authorization: Bearer $TOKEN"
```

Retorna a versão de compilação do Server, as versões de SDKs aceitas, as capacidades do motor, a política de compatibilidade dos clientes e os manifestos do plano de controle e do protocolo dos workers com versões independentes:

```json
{
  "server_id": "server-1",
  "version": "2.0.0",
  "default_namespace": "default",
  "supported_sdk_versions": {
    "php": ">=1.0",
    "python": ">=0.2,<1.0",
    "cli": ">=0.1,<1.0"
  },
  "client_compatibility": {
    "schema": "durable-workflow.v2.client-compatibility",
    "version": 1,
    "authority": "protocol_manifests",
    "top_level_version_role": "informational",
    "fail_closed": true
  },
  "capabilities": {
    "workflow_tasks": true,
    "activity_tasks": true,
    "signals": true,
    "queries": true,
    "updates": true,
    "schedules": true,
    "child_workflow_retry_policy": true,
    "child_workflow_timeouts": true,
    "payload_codecs": ["avro"],
    "response_compression": ["gzip", "deflate"]
  },
  "control_plane": {
    "version": "2",
    "header": "X-Durable-Workflow-Control-Plane-Version",
    "request_contract": { "schema": "durable-workflow.v2.control-plane-request.contract", "version": 1, "...": "..." },
    "response_contract": { "schema": "durable-workflow.v2.control-plane-response.contract", "version": 1, "...": "..." }
  },
  "worker_protocol": {
    "version": "1.0",
    "server_capabilities": {
      "long_poll_timeout": 30,
      "supported_workflow_task_commands": [
        "complete_workflow",
        "fail_workflow",
        "continue_as_new",
        "schedule_activity",
        "start_timer",
        "start_child_workflow"
      ],
      "workflow_task_poll_request_idempotency": true,
      "poll_status": true,
      "history_page_size_default": 500,
      "history_page_size_max": 1000,
      "activity_retry_policy": true,
      "activity_timeouts": true,
      "child_workflow_retry_policy": true,
      "child_workflow_timeouts": true,
      "parent_close_policy": true,
      "non_retryable_failures": true,
      "response_compression": ["gzip", "deflate"],
      "history_compression": {
        "supported_encodings": ["gzip"],
        "compression_threshold": 8192
      }
    }
  }
}
```

Use `client_compatibility.authority: "protocol_manifests"` como regra para verificar clientes. `version` no nível superior identifica a compilação. Os clientes CLI e SDK devem recusar a operação se `control_plane.version`, `control_plane.request_contract` ou `worker_protocol.version` estiver ausente ou não for aceito.

### Topologia de papéis e formato da implantação {#role-topology-and-deployment-shape}

A referência de cada campo deste manifesto está em [Topologia de papéis do Server](/docs/polyglot/server-role-topology). Esta seção mantém o exemplo `cluster/info`; use a página específica para reunir topologias aceitas, limites de autoridade, domínios de falha, limites de escala e contrato de migração.

`GET /api/cluster/info` também publica um manifesto `topology`. É o mapa de papéis legível por máquina do nó que responde. Operadores e automação podem ler um único contrato sem deduzir as funções do nó a partir de nomes de contêineres ou procedimentos de implantação.

```json
{
  "topology": {
    "schema": "durable-workflow.v2.role-topology",
    "version": 2,
    "supported_shapes": [
      "embedded",
      "standalone_server",
      "split_control_execution"
    ],
    "role_vocabulary": [
      "api_ingress",
      "control_plane",
      "matching",
      "history_projection",
      "scheduler",
      "execution_plane"
    ],
    "current_shape": "standalone_server",
    "current_process_class": "server_http_node",
    "current_roles": [
      "api_ingress",
      "control_plane",
      "matching",
      "history_projection"
    ],
    "execution_mode": "remote_worker_protocol",
    "matching_role": {
      "queue_wake_enabled": true,
      "shape": "in_worker",
      "wake_owner": "worker_loop",
      "task_dispatch_mode": "poll",
      "partition_primitives": [
        "connection",
        "queue",
        "compatibility",
        "namespace"
      ],
      "backpressure_model": "lease_ownership",
      "discovery_limits": {
        "poll_batch_cap": 100,
        "availability_ceiling_seconds": 1,
        "wake_signal_ttl_seconds": 60,
        "workflow_task_lease_seconds": 300,
        "activity_task_lease_seconds": 300
      }
    },
    "shape_assignments": {
      "embedded": {
        "process_classes": [
          {
            "name": "application_process",
            "roles": [
              "control_plane",
              "matching",
              "history_projection",
              "scheduler",
              "execution_plane"
            ]
          }
        ]
      },
      "standalone_server": {
        "process_classes": [
          {
            "name": "server_http_node",
            "roles": [
              "api_ingress",
              "control_plane",
              "matching",
              "history_projection"
            ]
          },
          {
            "name": "scheduler_node",
            "roles": ["scheduler"]
          },
          {
            "name": "worker_node",
            "roles": ["execution_plane"]
          }
        ]
      },
      "split_control_execution": {
        "process_classes": [
          {
            "name": "ingress_node",
            "roles": ["api_ingress"]
          },
          {
            "name": "control_plane_node",
            "roles": ["control_plane", "history_projection"]
          },
          {
            "name": "scheduler_node",
            "roles": ["scheduler"]
          },
          {
            "name": "matching_node",
            "roles": ["matching"]
          },
          {
            "name": "execution_node",
            "roles": ["execution_plane"]
          }
        ]
      }
    },
    "authority_boundaries": {
      "control_plane": {
        "writes": [
          "workflow_instances",
          "workflow_runs.status",
          "workflow_tasks.lifecycle"
        ]
      },
      "execution_plane": {
        "writes": [
          "workflow_tasks.outcomes",
          "activity_attempts",
          "worker_compatibility_heartbeats"
        ]
      },
      "matching": {
        "writes": [
          "workflow_tasks.leases",
          "activity_tasks.leases"
        ]
      },
      "history_projection": {
        "writes": [
          "history_events",
          "workflow_run_summaries",
          "workflow_history_exports"
        ]
      },
      "scheduler": {
        "writes": [
          "workflow_schedules.fire_state",
          "workflow_starts.scheduled"
        ]
      },
      "api_ingress": {
        "writes": ["worker_registrations"]
      }
    },
   "failure_domains": {
      "control_plane_down": {
        "effect": "workers_continue_claimed_tasks_only_until_lease_expiry",
        "operator_signal": "operator_commands_fail_fast"
      },
      "execution_plane_down": {
        "effect": "ready_tasks_accumulate_without_loss",
        "operator_signal": "operators_see_ready_depth_growth"
      },
      "matching_down": {
        "effect": "claim_falls_back_to_direct_ready_task_discovery",
        "operator_signal": "ready_depth_rises_while_claim_rate_falls"
      },
      "history_projection_down": {
        "effect": "projection_reads_may_stale_while_durable_writes_continue",
        "operator_signal": "projection_lag_seconds_may_increase"
      },
      "scheduler_down": {
        "effect": "scheduled_workflows_stop_firing_and_record_missed_runs",
        "operator_signal": "operators_see_missed_schedule_state"
      },
      "api_ingress_down": {
        "effect": "external_http_traffic_stops_at_the_edge",
        "operator_signal": "embedded_in_process_calls_may_continue"
      }
    },
    "scaling_boundaries": {
      "api_ingress": "incoming_http_request_rate",
      "control_plane": "operator_commands_and_run_lifecycle_transitions",
      "matching": "ready_task_rate_and_poller_count",
      "history_projection": "durable_event_rate",
      "scheduler": "active_schedule_count",
      "execution_plane": "workflow_and_activity_task_rate"
    },
    "migration_path": [
      {
        "step": "audit_role_boundaries",
        "result": "tooling flags cross-role writes before runtime shape changes",
        "reversible": true
      },
      {
        "step": "expose_role_bindings",
        "result": "container seams allow out-of-process adapters without patching the package",
        "reversible": true
      },
      {
        "step": "introduce_dedicated_matching_shape",
        "result": "matching can run as its own process class without changing the claim contract",
        "reversible": true
      },
      {
        "step": "split_history_projection",
        "result": "history and projections can move out of process without introducing a second writer",
        "reversible": true
      },
      {
        "step": "split_scheduler",
        "result": "schedule firing can move behind leader election while single-replica deployments stay legal",
        "reversible": true
      },
      {
        "step": "optional_execution_partitioning",
        "result": "workers can partition by namespace, connection, queue, and compatibility",
        "reversible": true
      }
    ],
    "kernel_invariants": [
      {
        "id": "single_persistence_engine",
        "summary": "one workflow database backs every topology shape; role split does not introduce a second persistence engine",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "single_worker_protocol",
        "summary": "one HTTP worker protocol carries claim, complete, fail, and heartbeat traffic across every topology; role split does not fork the worker contract",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "single_history_writer",
        "summary": "history_events has exactly one durable writer per logical event regardless of where the history/projection role runs",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "single_control_authority_per_run",
        "summary": "every mutation of a given workflow run routes through one control-plane authority; per-run row locks serialise transitions across replicas",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "embedded_topology_remains_supported",
        "summary": "the embedded shape where one process fills every role MUST stay legal; existing embedded hosts are never forced to migrate",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "role_split_is_topology_only",
        "summary": "splitting roles is a topology change, not a product fork; collapsing the roles back onto a single process is always a legal topology",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      }
    ]
  },
  "coordination_health": {
    "schema": "durable-workflow.v2.coordination-health.contract",
    "version": 2,
    "namespace_scope": "all_namespaces",
    "status": "ok",
    "http_status": 200,
    "warning_checks": [],
    "error_checks": [],
    "categories": {
      "correctness": "ok"
    },
    "checks": [
      {
        "name": "worker_compatibility",
        "status": "ok",
        "category": "correctness",
        "message": null
      },
      {
        "name": "activity_path",
        "status": "ok",
        "category": "correctness",
        "message": null
      }
    ],
    "routing_drains": {
      "queues_with_drains": 0,
      "draining_build_id_count": 0,
      "active_worker_count": 0,
      "draining_worker_count": 0,
      "stale_worker_count": 0,
      "queues": []
    }
  }
}
```

Interprete `topology.version` como a versão do esquema do manifesto de papéis, não como sinônimo da versão de compilação do Server. A automação deve verificar esse campo antes de presumir campos adicionados em revisões posteriores. O contrato público atual inclui `supported_shapes`, `role_vocabulary`, `current_shape`, `current_process_class`, `current_roles`, `execution_mode`, `matching_role`, `role_catalog`, `shape_assignments`, `authority_boundaries`, `authority_surfaces`, `failure_domains`, `supported_topologies`, `scaling_boundaries`, `migration_path` e `kernel_invariants`.

Interprete os campos assim:

- `supported_shapes` lista as topologias aceitas do produto.
- `role_vocabulary` é a lista fixa de papéis v2. É o vocabulário canônico para automação e diagnósticos.
- `current_shape`, `current_process_class` e `current_roles` descrevem o nó consultado agora. Use `current_process_class` como sua identidade declarada e compare o conjunto de papéis com `shape_assignments` dessa topologia para validá-la.
- `execution_mode` distingue a execução local de fila incorporada (`local_queue_worker`) da execução do Server independente pelo protocolo dos workers (`remote_worker_protocol`).
- `matching_role.queue_wake_enabled`, `matching_role.shape`, `matching_role.wake_owner`, `matching_role.task_dispatch_mode`, `matching_role.partition_primitives` e `matching_role.backpressure_model` indicam se o nó mantém o despertar dentro do worker ou espera que um loop dedicado de reparo ou correspondência faça a varredura, quais eixos de roteamento permanecem estáveis e qual limite durável de admissão a camada de correspondência aplica.
- `matching_role.discovery_limits` fixa os valores numéricos de correspondência compilados no pacote: `poll_batch_cap`, máximo de linhas prontas por polling; `availability_ceiling_seconds`, tolerância entre backends de `available_at` a diferenças inferiores a um segundo; `wake_signal_ttl_seconds`, TTL padrão de sinais de despertar do long polling; `workflow_task_lease_seconds`, lease padrão de tarefa de workflow; e `activity_task_lease_seconds`, lease padrão de tarefa de atividade. Eles permitem conferir o contrato sem buscar no código do pacote. Reduzir um valor é uma alteração de protocolo.
- `role_catalog` e `authority_surfaces` indicam as interfaces e os caminhos de alteração durável controlados por cada papel nesta revisão do manifesto.
- `shape_assignments` associa cada topologia aceita às classes de processo e conjuntos de papéis que ela pode executar.
- `supported_topologies` resume as famílias de implantação aceitas e as classes de nó esperadas por cada uma.
- `authority_boundaries` indica quais escritas duráveis cada papel deve alterar, para detectar desvios entre papéis antes de dividir uma implantação.
- `failure_domains` descreve o primeiro sinal de degradação visível ao operador quando um papel falha, em vez de deixá-lo implícito em um procedimento.
- `scaling_boundaries` identifica a principal dimensão de carga de cada papel ao dividir a topologia.
- As rotas hospedadas autenticadas recusam a operação se o nó não hospedar essa interface HTTP de controle. O Server retorna `503` com `reason: "topology_role_unavailable"`, `current_shape`, `current_process_class`, `current_roles`, `required_roles` e `missing_roles` para redirecionar o cliente a um nó que exponha a interface.
- `coordination_health` é o resumo de segurança da implantação de toda a frota publicado na mesma chamada. Usa o escopo `all_namespaces`, resume estado e resposta HTTP, lista nomes normalizados de verificações de aviso e erro que também alimentam a prontidão, e adiciona `blocked_by`, `message` e `remediation` quando pré-requisitos impedem avaliar a segurança.
- `coordination_health.checks[]` sempre inclui a verificação fixa `activity_path` junto de `worker_compatibility`, `task_transport`, `routing_health`, `durable_resume_paths` e verificações de projeções e agendador. `activity_path` é o equivalente de `task_transport` para atividades: mostra prazos de agendamento a início, início a encerramento, agendamento a encerramento ou heartbeat vencidos sem aplicação (`timeout_overdue`, `oldest_timeout_overdue_at`, `max_timeout_overdue_age_ms`) e novas tentativas persistentes pendentes (`retrying`, `oldest_retrying_started_at`, `max_retrying_age_ms`). Renomear a verificação é uma alteração de protocolo.
- `coordination_health.routing_drains` resume coortes de compilação em drenagem entre filas e namespaces. Se `queues_with_drains` for maior que zero, a frota está afastando tráfego intencionalmente de pelo menos uma coorte em drenagem.
- `migration_path` lista os passos ordenados da distribuição independente atual para limites de papéis mais isolados sem introduzir outro motor. `reversible: true` em cada entrada declara que voltar a uma topologia menos isolada continua válido.
- `kernel_invariants` lista as garantias duráveis que a divisão de papéis precisa preservar em qualquer topologia aceita: `single_persistence_engine`, `single_worker_protocol`, `single_history_writer`, `single_control_authority_per_run`, `embedded_topology_remains_supported` e `role_split_is_topology_only`. `applies_to` de cada entrada lista as topologias cobertas. A automação PODE usá-lo para verificar que uma mudança preserva o núcleo antes de aplicá-la.

Assim, a divisão de papéis é uma mudança de topologia, não outro motor nem outra API de plano de controle. Ao passar de uma frota `standalone_server` reduzida para `split_control_execution`, os operadores continuam lendo a mesma interface de descoberta. `current_shape`, `current_roles`, `execution_mode`, `matching_role`, `shape_assignments`, `authority_boundaries`, `failure_domains`, `scaling_boundaries` e `migration_path` são versionados juntos em um manifesto para que as ferramentas interpretem a mesma topologia publicada pelo Server.

A mesma restrição é exposta de forma legível por máquina em `topology.kernel_invariants`, para que a automação verifique antes da mudança que ela não introduz outro motor de persistência, uma bifurcação do protocolo dos workers, outro gravador de histórico ou uma migração irreversível.

O bloqueio de rotas hospedadas afeta apenas endpoints autenticados de API e workers. `GET /api/health`, `GET /api/ready` e `GET /api/cluster/info` autenticado continuam disponíveis para descoberta, liveness e inspeção de topologia mesmo em processos `scheduler_node`, `matching_node` e `execution_node` que não hospedam a interface HTTP de controle.

Para handlers externos independentes do transporte, o mesmo endpoint publica `worker_protocol.external_execution_surface_contract`. Esse manifesto define a [interface de execução externa no nível de atividade](/docs/polyglot/external-execution), vincula os contratos de entrada e resultado das tarefas externas e mantém o replay do workflow, `ContinueAsNew`, a ordem de sinais, atualizações e consultas e a interpretação do histórico dentro de runtimes reais.

Notas de campos para clientes:

- A versão da aplicação é `version`, não `server_version`.
- As capacidades de comandos de tarefas de workflow ficam em `worker_protocol.server_capabilities.supported_workflow_task_commands`, não no nível superior de `worker_protocol`. O mesmo objeto aninhado aparece em cada resposta do plano dos workers por `server_capabilities`.
- `worker_protocol.server_capabilities.poll_status` indica que as respostas de polling mantêm `poll_status` mesmo sem lease. Os workers podem distinguir `empty`, `throttled`, `unavailable` e `draining` sem interpretar mensagens de erro em prosa.
- As opções de comandos dos workers, incluindo políticas de novas tentativas, tempos limite, política de encerramento do pai e falhas não repetíveis, também aparecem em `server_capabilities` para negociar o comportamento sem outra consulta de informações do cluster.
- O único codec de payloads v2 fica em `capabilities.payload_codecs` e a lista é exatamente `['avro']`. Os serializadores PHP v1 de importação e drenagem são mecanismos internos de migração e nunca aparecem nas capacidades do runtime.

## Conectar workers {#connecting-workers}

Os workers fazem polling no Server e executam código de workflow ou atividades. Consulte a referência do [protocolo dos workers](/docs/polyglot/worker-protocol) para o contrato completo. Para a matriz de papéis de rotas, regras de namespace e dados exatos de registro, consulte [Namespace, autenticação e registro de workers](/docs/polyglot/namespace-auth-workers).

### Workers PHP {#php-workers}

As aplicações PHP independentes de frameworks e os workers remotos usam o SDK do Server independente. Não instalam Laravel nem o pacote Workflow incorporado:

<!-- docs-example id="server.php-sdk.install" -->
```bash
composer require %%artifact.phpSdkComposerPackage%%
```

Crie um cliente e registre funções de workflow ou atividade em um worker:

```php
use DurableWorkflow\Client;
use DurableWorkflow\Worker;
use DurableWorkflow\Worker\WorkflowContext;

$client = new Client(
    'http://localhost:8080',
    token: getenv('DURABLE_WORKFLOW_AUTH_TOKEN') ?: null,
    namespace: 'default',
);

$worker = new Worker($client, taskQueue: 'polyglot-php');
$worker->registerWorkflow(
    'invoice',
    static function (WorkflowContext $context, string $invoiceId): array {
        $context->activity('charge-card', [$invoiceId]);

        return ['invoice_id' => $invoiceId, 'status' => 'paid'];
    },
);
$worker->run();
```

Consulte o [guia do SDK PHP](/docs/polyglot/php/) para cliente, autenticação, payloads e ciclo de vida do worker. O pacote separado `durable-workflow/workflow` é o runtime incorporado ao Laravel e o motor hospedado na imagem publicada do Server. Os workflows incorporados executam tarefas do pacote pelo worker da aplicação e não precisam deste Server.

### Workers Python {#python-workers}

Os workers Python usam o SDK `durable-workflow`:

```bash
pip install %%artifact.pythonPackagePin%%
```

Consulte o guia do [SDK Python](/docs/polyglot/python) para configurar workers.

### Workers em outras linguagens {#custom-language-workers}

Qualquer linguagem pode implementar um worker:
1. Registrando-o com `POST /api/worker/register`
2. Fazendo polling por `POST /api/worker/workflow-tasks/poll`, `POST /api/worker/activity-tasks/poll` ou `POST /api/worker/query-tasks/poll`
3. Concluindo tarefas com `POST /api/worker/workflow-tasks/{id}/complete`, `POST /api/worker/activity-tasks/{id}/complete` ou `POST /api/worker/query-tasks/{id}/complete`

Todas as requisições exigem:
- `Authorization: Bearer $TOKEN`
- `X-Namespace: your-namespace`
- `X-Durable-Workflow-Protocol-Version: 1.0`

O Server verifica se o namespace existe. Registre-o por `POST /api/namespaces` antes de direcionar workers ou clientes a ele. Caso contrário, retorna `404` com `reason: "namespace_not_found"`.

Consulte o [README do Server](https://github.com/durable-workflow/server#getting-started-end-to-end-workflow) para um passo a passo com curl.

Consulte [Admissão de filas](/docs/polyglot/task-queue-admission) para ajustar slots de registro, limites de leases ativos do Server, orçamentos de despacho por minuto e contrapressão de consultas.

## CLI {#cli}

A [CLI do Durable Workflow](/docs/polyglot/cli) oferece uma interface de shell para o Server:

```bash
# Install — Linux and macOS
curl -fsSL https://durable-workflow.com/install.sh | sh

# Install — macOS (Homebrew alternative)
brew install durable-workflow/tap/dw

# Install — Windows (PowerShell)
# irm https://durable-workflow.com/install.ps1 | iex

# Configure
export DURABLE_WORKFLOW_SERVER_URL=http://localhost:8080
export DURABLE_WORKFLOW_AUTH_TOKEN=your-token
export DURABLE_WORKFLOW_NAMESPACE=default

# Use
dw server:health
dw workflow:list
dw workflow:start --type=my-workflow --input='["value"]'
dw workflow:start --type=my-workflow --input-file=input.json
```

Consulte a [página de instalação da CLI](/docs/polyglot/cli#install) para um instalador que detecta a plataforma e downloads diretos de binários.

Os comandos de filas mostram o estado de admissão de tarefas de workflow, atividade e consulta. Use-os para distinguir workers ausentes, slots saturados, limites do Server por leases ativos ou ritmo de despacho e excesso de consultas pendentes.

## Implantação {#deployment}

Use o [guia de implantação autogerenciada](/docs/deployment) para escolher uma topologia aceita antes de receber tráfego de produção. Ele distingue desenvolvimento local, produção em um nó, clusters pequenos, manifestos Kubernetes diretos e topologias orientadas pelo suporte.

O contrato de cluster pequeno autogerenciado é limitado: 2 ou 3 nós API sem estado atrás de um balanceador, um banco MySQL ou PostgreSQL externo compartilhado, Redis compartilhado, workers escalados separadamente e um único agendador ou processo de manutenção. Escolha atualizações com parada total ou [graduais](/docs/rolling-upgrades) conforme a versão. Esse contrato estabelece requisitos de diferença de versões, esquema, drenagem, prontidão e reversão. Clusters SQLite, implantações com vários nós sem Redis, agendadores duplicados, operação multirregião ativa/ativa e failover específico do provedor ficam de fora até serem validados separadamente. O caminho Helm, versionado à parte, é documentado no [guia de implantação](/docs/deployment#helm-chart-for-kubernetes). O material multirregião ativo/passivo do [guia de autogerenciamento](/docs/deployment#activepassive-multi-region) orienta avaliações com suporte, não prova um contrato 2.0 de autosserviço. Cada região candidata deve partir de uma topologia documentada de uma região ou cluster pequeno.

Para implantações autogerenciadas, comece com imagens publicadas em vez de compilações da árvore de código-fonte:

- Docker Hub: `%%artifact.serverDockerHubImage%%`
- GitHub Container Registry: `%%artifact.serverGhcrImage%%`
- Compose de imagem publicada: [`docker-compose.published.yml`](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml)
- Manifestos Kubernetes diretos: [`k8s/`](https://github.com/durable-workflow/server/tree/main/k8s)

Implantações de produção devem fixar uma tag de versão ou digest, usar credenciais por papel, executar inicialização e migrações antes do tráfego e comprovar prontidão com `/api/ready`, `/api/cluster/info` e registro de workers. Não mude o tráfego com base apenas em `/api/health`.

## Referência da API {#api-reference}

Para uma referência completa de endpoints, cabeçalhos obrigatórios, papéis, protocolo dos workers, armazenamento externo e motivos de erro, consulte a [referência da API do Server](/docs/polyglot/server-api-reference).

O Server expõe três interfaces API:

### Plano de controle {#control-plane}

Inicie, descreva, sinalize, consulte, atualize, cancele e termine workflows. Gerencie namespaces, filas, agendamentos, atributos de pesquisa e workers. Cada requisição do plano de controle exige `X-Durable-Workflow-Control-Plane-Version: 2`. Se faltar, ela é recusada com `missing_control_plane_version`.

Endpoints principais:
- `POST /api/workflows`: iniciar um workflow
- `GET /api/workflows/{id}`: descrever um workflow
- `POST /api/workflows/{id}/signal/{name}`: enviar um sinal
- `POST /api/workflows/{id}/query/{name}`: executar uma consulta
- `POST /api/workflows/{id}/update/{name}`: executar uma atualização
- `POST /api/workflows/{id}/cancel`: encerrar a execução imediatamente como cancelada
- `POST /api/workflows/{id}/terminate`: terminar imediatamente
- `GET /api/workflows/{id}/runs/{runId}/history`: listar eventos da execução
- `GET /api/workflows/{id}/runs/{runId}/history/export`: exportar um pacote de replay
- `GET /api/namespaces`, `POST /api/namespaces`, `GET|PUT /api/namespaces/{namespace}`: gestão de namespaces
- `GET /api/workers`, `GET|DELETE /api/workers/{id}`: gestão da frota de workers
- `GET /api/task-queues`, `GET /api/task-queues/{taskQueue}`: tarefas pendentes, pollers, leases e admissão de filas
- `GET|POST /api/schedules`, `GET|PUT|DELETE /api/schedules/{id}`, `POST /api/schedules/{id}/{pause|resume|trigger|backfill}`: gestão de agendamentos
- `GET|POST|DELETE /api/search-attributes`: gestão de atributos de pesquisa
- `GET|POST|PUT|DELETE /api/service-endpoints...`: catálogo de serviços apenas para administradores, serviços aninhados, vínculos de operações e snapshots duráveis de chamadas
- `POST /api/system/repair/pass`, `POST /api/system/activity-timeouts/pass`, `POST /api/system/retention/pass`: passagens do operador

As respostas do plano de controle, incluindo listas de histórico, contêm metadados aninhados `control_plane` que identificam a operação e a versão do contrato de resposta. A exportação de histórico não usa esse envelope: retorna o pacote de replay sem alterações para que sua soma de integridade e assinatura opcional cubram o artefato exato recebido.

Falhas de validação retornam HTTP 422 com `reason: validation_failed`, `errors` e `validation_errors`. As rotas de operações também refletem esses dados em `control_plane.reason` e `control_plane.validation_errors`. As rotas direcionadas a uma execução específica refletem o `run_id` da URL na resposta e em `control_plane.run_id`, para distinguir comandos de instância dos direcionados a uma execução selecionada.

A visibilidade de filas permite determinar se o atraso vem do crescimento de tarefas pendentes, slots indisponíveis ou limites de admissão. `GET /api/task-queues` retorna um resumo por fila e `GET /api/task-queues/{taskQueue}` o amplia com `pollers` e `current_leases`. Ambas as rotas expõem `stats.approximate_backlog_count`, `stats.approximate_backlog_age_seconds` e contadores de prontidão e leases por tipo em `stats.workflow_tasks.*` / `stats.activity_tasks.*`. O detalhe também inclui `admission` para separar pressão de capacidade e limites do Server sobre filas ou consultas. As taxas globais de entrada e despacho ficam em `operator_metrics.backlog.tasks_added_last_minute` e `operator_metrics.backlog.tasks_dispatched_last_minute`. As rotas de filas expõem `stats.tasks_added_last_minute` e `stats.tasks_dispatched_last_minute` para comparar uma única fila.

### Protocolo dos workers {#worker-protocol}

Os workers se registram, fazem polling, enviam heartbeats e concluem tarefas. É necessário `X-Durable-Workflow-Protocol-Version: 1.0`.

Endpoints principais:
- `POST /api/worker/register`: registrar um worker
- `POST /api/worker/workflow-tasks/poll`: long polling de tarefas de workflow
- `POST /api/worker/workflow-tasks/{id}/complete`: concluir uma tarefa de workflow
- `POST /api/worker/query-tasks/poll`: long polling de consultas de workflow roteadas pelo Server
- `POST /api/worker/query-tasks/{id}/complete`: concluir uma tarefa de consulta de workflow
- `POST /api/worker/query-tasks/{id}/fail`: falhar ou recusar uma tarefa de consulta de workflow
- `POST /api/worker/activity-tasks/poll`: long polling de tarefas de atividade
- `POST /api/worker/activity-tasks/{id}/complete`: concluir uma tarefa de atividade

Consulte a referência do [protocolo dos workers](/docs/polyglot/worker-protocol) para detalhes.

### Descoberta sem versão {#discovery-unversioned}

Os únicos endpoints que **não** exigem `X-Durable-Workflow-Control-Plane-Version` são os de descoberta e as verificações de saúde:

- `GET /api/health`: verificação de liveness e resumo público `topology`, sem autenticação
- `GET /api/ready`: verificação de prontidão e o mesmo resumo `topology`, sem autenticação
- `GET /api/cluster/info`: capacidades do Server, versões de protocolo e o único codec de payloads Avro. Os clientes devem consultá-lo primeiro para descobrir as versões aceitas do plano de controle e do protocolo dos workers.

## Solução de problemas {#troubleshooting}

### Os workers não recebem tarefas {#workers-not-receiving-tasks}

**Verifique:**
1. Os workers foram registrados? `curl http://localhost:8080/api/workers -H "Authorization: Bearer $TOKEN" -H "X-Durable-Workflow-Control-Plane-Version: 2" -H "X-Namespace: default"`
2. Fazem polling na fila correta?
3. O workflow foi iniciado com essa fila?
4. O cache é compartilhado entre as instâncias do Server?

### As conexões de long polling expiram imediatamente {#long-poll-connections-timing-out-immediately}

**Verifique:**
1. O driver de cache permite bloqueios atômicos? Teste `php artisan workflow:v2:doctor --strict`
2. O Server consegue acessar o Redis?
3. O tempo limite do balanceador supera o do long polling, que é de 60 s por padrão?

### Erros de conexão ao banco de dados {#database-connection-errors}

**Verifique:**
1. O host e a porta do banco de dados estão corretos?
2. As credenciais são válidas?
3. O banco de dados existe?
4. As migrações executaram? `php artisan migrate:status`

### Falhas de autenticação {#auth-failures}

**Verifique:**
1. `DW_AUTH_DRIVER` corresponde ao método do cliente?
2. O token ou segredo HMAC é igual no Server e no cliente?
3. `Authorization: Bearer $TOKEN` ou os cabeçalhos de assinatura HMAC são enviados?

## Saiba mais {#learn-more}

- [Referência do protocolo dos workers](/docs/polyglot/worker-protocol): contrato completo dos workers
- [Migração da incorporação para o Server](/docs/polyglot/embedded-to-server): adotar o Server a partir de uma aplicação Laravel v2 incorporada
- [SDK Python](/docs/polyglot/python): criar workers Python
- [CLI](/docs/polyglot/cli): interface de linha de comando
- [Repositório do Server](https://github.com/durable-workflow/server): código, issues e versões
