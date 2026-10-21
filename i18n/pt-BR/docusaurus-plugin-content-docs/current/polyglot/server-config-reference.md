---
sidebar_position: 3
title: Referência de configuração do Server
description: Variáveis de ambiente, valores padrão, aliases antigos e configuração de infraestrutura do Durable Workflow Server.
tags:
  - server
  - config
  - referência
  - operações
keywords:
  - configuração do Durable Workflow Server
  - variáveis de ambiente DW
  - auditoria do ambiente do Server
  - ambiente do Workflow Server
---

# Referência de configuração do Server {#server-config-reference}

Esta página documenta o contrato das variáveis de ambiente `DW_*` da imagem do Durable Workflow Server para operadores. Use-a ao criar modelos de implantação, revisar a configuração de produção ou migrar os nomes antigos `WORKFLOW_*` / `ACTIVITY_*` para o contrato v2 do Server.

O Server também utiliza as configurações comuns do Laravel, como `DB_*`, `REDIS_*`, `QUEUE_CONNECTION` e `CACHE_STORE`. Essas variáveis de infraestrutura são listadas separadamente porque conectam os componentes da implantação e não controlam a API do Durable Workflow.

## Quando as alterações entram em vigor {#how-changes-take-effect}

A imagem publicada do PHP Server executa `php artisan config:cache` no ponto de entrada. Os valores de ambiente são resolvidos nessa inicialização e gravados no cache de configuração do Laravel. Editar um arquivo de ambiente, alterar as variáveis declaradas no orquestrador ou substituir um arquivo de configuração montado não recarrega uma implantação em execução.

Reinicie ou substitua todos os processos afetados com a nova configuração: réplicas da API HTTP, workers locais de filas do Laravel e processos do agendador. Reinicie separadamente os workers persistentes dos SDKs ao alterar a configuração do próprio cliente ou worker. Reiniciar a API com sucesso não atualiza um worker de fila ou agendador que continua em execução. Mantenha a mesma configuração pretendida nos papéis que compartilham banco de dados e cache.

Durante uma atualização gradual, cada nó aplica os limites que carregou. Contadores compartilhados de admissão não fazem nós com configurações diferentes concordarem sobre um limite. Uma requisição pode ser aceita por uma réplica da API e recusada por outra. Para aplicar uma alteração de limite de forma consistente:

1. Pause novos envios dos clientes e retire as réplicas afetadas da API do tráfego de entrada. Aguarde o término das requisições em andamento. Encerre de forma ordenada os papéis de fila e agendador afetados, respeitando seus prazos de desligamento.
2. Aplique a mesma configuração a cada papel afetado e reinicie-o ou substitua-o. Deixe o ponto de entrada de cada contêiner reconstruir seu cache de configuração.
3. Verifique os logs de inicialização em busca de erros de configuração, confirme a prontidão e teste o limite alterado antes de restaurar o tráfego e os envios. Consulte o [guia de implantação e prontidão](/docs/deployment#readiness-contract).

As configurações do operador armazenadas no banco de dados têm outro ciclo de vida. Quando bem-sucedidas, as alterações abaixo ficam disponíveis para operações posteriores sem reiniciar o Server:

| Opção | Alteração em execução | Escopo e limites |
| --- | --- | --- |
| Descrição e retenção do namespace | [`PUT /api/namespaces/{namespace}`](/docs/polyglot/server-api-reference#namespace-and-storage), ou [`dw namespace:update`](/docs/polyglot/cli-reference#namespace-and-search-attribute-commands) | A política se aplica às próximas passagens de retenção. Alterá-la não restaura dados já removidos. Consulte [Retenção do Server](/docs/polyglot/server#retention). |
| Política de armazenamento externo de payloads do namespace | [`PUT /api/namespaces/{namespace}/external-storage`](/docs/features/external-payload-storage#configuring-a-namespace) | Altera a política armazenada do namespace. As credenciais do provedor, os discos configurados e outras opções do processo ainda exigem a reinicialização descrita acima. Preserve o acesso aos objetos referenciados por execuções existentes. |
| Definições de atributos de pesquisa do namespace | [`POST` / `DELETE /api/search-attributes`](/docs/polyglot/server-api-reference#schedules-and-search-attributes) | Atualiza o registro usado pelas próximas requisições. Não regrava o histórico do workflow nem substitui os limites de tamanho e quantidade configurados pelo ambiente. |

Os valores padrão e os limites `DW_*` desta referência continuam sendo configurações do processo, a menos que uma operação documentada do plano de controle altere explicitamente o estado armazenado. O Server não consulta periodicamente os arquivos de configuração em busca de alterações.

## Como o contrato é aplicado {#how-the-contract-is-enforced}

O repositório do Server mantém o contrato canônico em `config/dw-contract.php`. Na inicialização do contêiner, `php artisan env:audit` avisa quando encontra variáveis `DW_*` desconhecidas ou nomes antigos. Defina `DW_ENV_AUDIT_STRICT=1` para que o ponto de entrada falhe em vez de iniciar com avisos.

```bash
DW_ENV_AUDIT_STRICT=1
DW_AUTH_DRIVER=token
DW_ADMIN_TOKEN="${DW_ADMIN_TOKEN}"
DW_OPERATOR_TOKEN="${DW_OPERATOR_TOKEN}"
DW_WORKER_TOKEN="${DW_WORKER_TOKEN}"
```

Os nomes antigos são usados apenas como alternativa. Prefira o nome `DW_*` em toda nova implantação e trate os avisos sobre nomes antigos como uma migração pendente, mesmo quando o Server ainda respeita o valor.

## Identidade e modo do Server {#server-identity-and-mode}

| Variável | Valor padrão | Finalidade | Alias antigo |
| --- | --- | --- | --- |
| `DW_MODE` | `service` | Modo do Server: em `service` os workers externos fazem polling; `embedded` despacha localmente pela fila do Laravel. | `WORKFLOW_SERVER_MODE` |
| `DW_SERVER_ID` | `gethostname()` | Identificador único da instância do Server usado na titularidade de leases e no registro de workers. | `WORKFLOW_SERVER_ID` |
| `DW_SERVER_TOPOLOGY_SHAPE` | `standalone_server` | Topologia anunciada para descoberta do cluster, como `embedded`, `standalone_server` ou `split_control_execution`. | `WORKFLOW_SERVER_TOPOLOGY_SHAPE` |
| `DW_SERVER_PROCESS_CLASS` | `server_http_node` | Classe de processo anunciada para este nó na topologia selecionada, como `server_http_node`, `worker_node` ou `scheduler_node`. | `WORKFLOW_SERVER_PROCESS_CLASS` |
| `DW_SERVER_KEY` | gerado ao iniciar o contêiner | Chave interna opcional do runtime. As imagens Docker geram uma automaticamente quando não está definida. | - |
| `DW_DEFAULT_NAMESPACE` | `default` | Namespace usado quando a requisição omite o cabeçalho de namespace. | `WORKFLOW_SERVER_DEFAULT_NAMESPACE` |
| `DW_TASK_DISPATCH_MODE` | não definido | Substitui `workflows.v2.task_dispatch_mode`; no modo de serviço o Server usa `poll`, a menos que outro valor seja definido. | `WORKFLOW_V2_TASK_DISPATCH_MODE` |
| `DW_WORKFLOW_MEMO_MIGRATION_RECOVERY` | não definido | Comprovação de recuperação MySQL para uma única execução após uma regravação de memo não registrada: `raw-json` ou `envelope-prefix:<last-converted-id>`. | `WORKFLOW_SERVER_WORKFLOW_MEMO_MIGRATION_RECOVERY` |
| `DW_EXTERNAL_EXECUTOR_CONFIG_PATH` | não definido | Caminho de um arquivo JSON `durable-workflow.external-executor.config` com os handlers do executor externo. | `WORKFLOW_SERVER_EXTERNAL_EXECUTOR_CONFIG_PATH` |
| `DW_EXTERNAL_EXECUTOR_CONFIG_OVERLAY` | não definido | Nome da sobreposição do arquivo de configuração do executor externo aplicada antes da validação e da descoberta do Server. | `WORKFLOW_SERVER_EXTERNAL_EXECUTOR_CONFIG_OVERLAY` |

## Autenticação {#authentication}

| Variável | Valor padrão | Finalidade | Alias antigo |
| --- | --- | --- | --- |
| `DW_AUTH_PROVIDER` | não definido | Classe resolvida pelo Laravel que implementa `App\Contracts\AuthProvider`. | `WORKFLOW_SERVER_AUTH_PROVIDER` |
| `DW_AUTH_DRIVER` | `token` | Driver de autenticação: `none`, `token` ou `signature`. | `WORKFLOW_SERVER_AUTH_DRIVER` |
| `DW_AUTH_TOKEN` | não definido | Token bearer compartilhado quando não há token limitado por papel. | `WORKFLOW_SERVER_AUTH_TOKEN` |
| `DW_SIGNATURE_KEY` | não definido | Chave de assinatura HMAC compartilhada quando não há chave limitada por papel. | `WORKFLOW_SERVER_SIGNATURE_KEY` |
| `DW_WORKER_TOKEN` | não definido | Token bearer para registro, polling, heartbeats e conclusão de tarefas dos workers. | `WORKFLOW_SERVER_WORKER_TOKEN` |
| `DW_OPERATOR_TOKEN` | não definido | Token bearer para leituras e operações do operador no plano de controle. | `WORKFLOW_SERVER_OPERATOR_TOKEN` |
| `DW_ADMIN_TOKEN` | não definido | Token bearer para alterações de namespaces, retenção e outras operações administrativas. | `WORKFLOW_SERVER_ADMIN_TOKEN` |
| `DW_PRINCIPAL_TOKENS` | não definido | Mapa JSON de tokens para identidades nomeadas. Cada entrada fornece `token`, `subject`, `roles` e, opcionalmente, `tenant`, `label` e `claims` não secretos. | `WORKFLOW_SERVER_PRINCIPAL_TOKENS` |
| `DW_WORKER_SIGNATURE_KEY` | não definido | Chave HMAC para requisições do papel worker ao usar autenticação por assinatura. | `WORKFLOW_SERVER_WORKER_SIGNATURE_KEY` |
| `DW_OPERATOR_SIGNATURE_KEY` | não definido | Chave HMAC para requisições do papel operador ao usar autenticação por assinatura. | `WORKFLOW_SERVER_OPERATOR_SIGNATURE_KEY` |
| `DW_ADMIN_SIGNATURE_KEY` | não definido | Chave HMAC para requisições do papel administrador ao usar autenticação por assinatura. | `WORKFLOW_SERVER_ADMIN_SIGNATURE_KEY` |
| `DW_AUTH_BACKWARD_COMPATIBLE` | `true` | Aceita `DW_AUTH_TOKEN` / `DW_SIGNATURE_KEY` compartilhados como alternativa quando falta uma credencial limitada por papel. | `WORKFLOW_SERVER_AUTH_BACKWARD_COMPATIBLE` |

Use credenciais limitadas por papel em produção. `DW_AUTH_DRIVER=none` serve apenas para verificações locais básicas, pois permite acessar todos os endpoints sem token bearer nem assinatura.

Use `DW_PRINCIPAL_TOKENS` quando os registros de auditoria precisarem de identidades estáveis dos atores em vez de rótulos de papel. O Server obtém a identidade registrada da entrada correspondente ao token. Os clientes não podem substituí-la por dados ou cabeçalhos da requisição.

## Atribuição de comandos {#command-attribution}

Essas opções permitem que um gateway confiável preserve os metadados do chamador no histórico durável de comandos. Mantenha `DW_TRUST_FORWARDED_ATTRIBUTION_HEADERS=false`, a menos que o Server esteja atrás de um gateway que remova cabeçalhos não confiáveis enviados pelos clientes.

| Variável | Valor padrão | Finalidade | Alias antigo |
| --- | --- | --- | --- |
| `DW_TRUST_FORWARDED_ATTRIBUTION_HEADERS` | `false` | Registra os cabeçalhos encaminhados de chamador e autenticação no histórico de comandos do workflow. | `WORKFLOW_SERVER_TRUST_FORWARDED_ATTRIBUTION_HEADERS` |
| `DW_CALLER_TYPE_HEADER` | `X-Workflow-Caller-Type` | Cabeçalho que transporta o tipo de chamador encaminhado. | `WORKFLOW_SERVER_CALLER_TYPE_HEADER` |
| `DW_CALLER_LABEL_HEADER` | `X-Workflow-Caller-Label` | Cabeçalho que transporta o rótulo do chamador encaminhado. | `WORKFLOW_SERVER_CALLER_LABEL_HEADER` |
| `DW_AUTH_STATUS_HEADER` | `X-Workflow-Auth-Status` | Cabeçalho que transporta o estado de autenticação encaminhado. | `WORKFLOW_SERVER_AUTH_STATUS_HEADER` |
| `DW_AUTH_METHOD_HEADER` | `X-Workflow-Auth-Method` | Cabeçalho que transporta o método de autenticação encaminhado. | `WORKFLOW_SERVER_AUTH_METHOD_HEADER` |

## Polling e admissão dos workers {#worker-polling-and-admission}

Esses valores controlam os prazos de long polling, a coordenação de despertar, os limites de admissão do Server e os orçamentos limitados de despacho de tarefas.

| Variável | Valor padrão | Finalidade | Alias antigo |
| --- | --- | --- | --- |
| `DW_WORKER_POLL_TIMEOUT` | `30` | Segundos durante os quais o Server mantém um polling aberto à espera de uma tarefa. | `WORKFLOW_SERVER_WORKER_POLL_TIMEOUT` |
| `DW_WORKER_POLL_INTERVAL_MS` | `1000` | Milissegundos entre buscas internas enquanto um polling permanece aberto. | `WORKFLOW_SERVER_WORKER_POLL_INTERVAL_MS` |
| `DW_WORKER_POLL_SIGNAL_CHECK_INTERVAL_MS` | `100` | Milissegundos entre verificações de sinais de despertar enquanto um polling permanece aberto. | `WORKFLOW_SERVER_WORKER_POLL_SIGNAL_CHECK_INTERVAL_MS` |
| `DW_POLLING_CACHE_PATH` | `storage/framework/cache/server-polling/<APP_ENV>` | Diretório de coordenação do polling dos workers quando o cache é armazenado em arquivos. | `WORKFLOW_SERVER_POLLING_CACHE_PATH` |
| `DW_WAKE_SIGNAL_TTL_SECONDS` | `max(DW_WORKER_POLL_TIMEOUT + 5, 60)` | TTL dos sinais de despertar por fila que interrompem a espera de um polling. | `WORKFLOW_SERVER_WAKE_SIGNAL_TTL_SECONDS` |
| `DW_WORKER_LONG_POLL_MAX_CONCURRENT` | não definido; derivado de `PHP_CLI_SERVER_WORKERS` | Limite opcional de esperas simultâneas de long polling de tarefas de workflow ou atividade neste nó. O polling de consultas tem um orçamento separado. | `WORKFLOW_SERVER_WORKER_LONG_POLL_MAX_CONCURRENT` |
| `DW_WORKER_LONG_POLL_RESERVED_HTTP_WORKERS` | `2` | Workers do servidor CLI do PHP reservados para saúde e plano de controle ao calcular o limite de espera do long polling de workflows e atividades. | `WORKFLOW_SERVER_WORKER_LONG_POLL_RESERVED_HTTP_WORKERS` |
| `DW_MAX_TASKS_PER_POLL` | `1` | Máximo de tarefas retornadas por polling de um worker. | `WORKFLOW_SERVER_MAX_TASKS_PER_POLL` |
| `DW_SQLITE_CLAIM_LOCK_TTL_SECONDS` | `10` | Segundos até expirar a exclusão de reivindicação de tarefas, apoiada em cache, do backend SQLite de início rápido. | `WORKFLOW_SERVER_SQLITE_CLAIM_LOCK_TTL_SECONDS` |
| `DW_SQLITE_CLAIM_LOCK_WAIT_SECONDS` | `5` | Segundos que uma reivindicação de tarefas SQLite espera pela exclusão apoiada em cache antes de retornar pressão de bloqueio do backend. | `WORKFLOW_SERVER_SQLITE_CLAIM_LOCK_WAIT_SECONDS` |
| `DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` | não definido | Máximo de leases ativos de tarefas de workflow por namespace e fila. | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` |
| `DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` | não definido | Máximo de leases ativos de tarefas de workflow entre todas as filas de um namespace. | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` |
| `DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE` | não definido | Máximo de despachos de tarefas de workflow por minuto, namespace e fila. | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE` |
| `DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` | não definido | Máximo de despachos de tarefas de workflow por minuto em todo um namespace. | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` |
| `DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` | não definido | Máximo de leases ativos de tarefas de atividade por namespace e fila. | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` |
| `DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` | não definido | Máximo de leases ativos de tarefas de atividade entre todas as filas de um namespace. | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` |
| `DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE` | não definido | Máximo de despachos de tarefas de atividade por minuto, namespace e fila. | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE` |
| `DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` | não definido | Máximo de despachos de tarefas de atividade por minuto em todo um namespace. | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` |
| `DW_TASK_QUEUE_ADMISSION_OVERRIDES` | `{}` | Opções JSON específicas por `namespace:task_queue`, `namespace:*`, `task_queue` ou `*` para leases ativos, ritmo de despacho, limites de namespace e grupos de orçamento de serviços posteriores. | `WORKFLOW_SERVER_TASK_QUEUE_ADMISSION_OVERRIDES` |
| `DW_DUE_TIMER_RECOVERY_SCAN_LIMIT` | `5` | Máximo de tarefas de temporizador vencidas no modo de serviço recuperadas em cada passagem de polling de um worker. | `WORKFLOW_SERVER_DUE_TIMER_RECOVERY_SCAN_LIMIT` |
| `DW_EXPIRED_WORKFLOW_TASK_RECOVERY_SCAN_LIMIT` | `5` | Máximo de tarefas de workflow expiradas recuperadas em cada passagem. | `WORKFLOW_SERVER_EXPIRED_WORKFLOW_TASK_RECOVERY_SCAN_LIMIT` |
| `DW_EXPIRED_WORKFLOW_TASK_RECOVERY_TTL_SECONDS` | `5` | Mínimo de segundos entre passagens de recuperação de tarefas expiradas por fila. | `WORKFLOW_SERVER_EXPIRED_WORKFLOW_TASK_RECOVERY_TTL_SECONDS` |

A execução sticky não tem variáveis de ambiente próprias na imagem do Server. Consulte [Execução sticky](/docs/features/sticky-execution) para conhecer o ciclo de vida do cache sticky, os campos do protocolo dos workers, os modos de replay e os diagnósticos.

Exemplo de configuração específica de admissão:

```json
{
  "production:billing": {
    "workflow_tasks": {
      "max_active_leases": 50,
      "max_dispatches_per_minute": 600
    },
    "activity_tasks": {
      "max_active_leases": 200
    }
  },
  "production:*": {
    "workflow_tasks": {
      "max_active_leases_per_namespace": 500
    }
  }
}
```

## Protocolo de workers e transporte de consultas {#worker-protocol-and-query-transport}

| Variável | Valor padrão | Finalidade | Alias antigo |
| --- | --- | --- | --- |
| `DW_WORKER_PROTOCOL_VERSION` | `WorkerProtocolVersion::VERSION` | Versão do protocolo dos workers anunciada nas respostas do plano dos workers. | `WORKFLOW_SERVER_WORKER_PROTOCOL_VERSION` |
| `DW_HISTORY_PAGE_SIZE_DEFAULT` | `WorkerProtocolVersion::DEFAULT_HISTORY_PAGE_SIZE` | Tamanho de página padrão para leituras de histórico dos workers. | `WORKFLOW_SERVER_HISTORY_PAGE_SIZE_DEFAULT` |
| `DW_HISTORY_PAGE_SIZE_MAX` | `WorkerProtocolVersion::MAX_HISTORY_PAGE_SIZE` | Tamanho máximo de página respeitado nas leituras de histórico dos workers. | `WORKFLOW_SERVER_HISTORY_PAGE_SIZE_MAX` |
| `DW_UPDATE_VALIDATION_TIMEOUT` | `10` | Segundos que o plano de controle espera pelo resultado de um validador síncrono antes de aceitar uma atualização. | `WORKFLOW_SERVER_UPDATE_VALIDATION_TIMEOUT` |
| `DW_UPDATE_VALIDATION_LEASE_TIMEOUT` | `5` | Segundos durante os quais um validador mantém o lease de uma tarefa antes que um worker substituto com capacidade de validação possa tentar novamente. | `WORKFLOW_SERVER_UPDATE_VALIDATION_LEASE_TIMEOUT` |
| `DW_QUERY_TASK_TIMEOUT` | `DW_WORKER_POLL_TIMEOUT` | Segundos que o plano de controle espera pela resposta do worker a uma tarefa de consulta. | `WORKFLOW_SERVER_QUERY_TASK_TIMEOUT` |
| `DW_QUERY_TASK_LEASE_TIMEOUT` | `DW_WORKFLOW_TASK_TIMEOUT` | Prazo do lease das tarefas efêmeras de consulta entregues aos workers. | `WORKFLOW_SERVER_QUERY_TASK_LEASE_TIMEOUT` |
| `DW_QUERY_TASK_TTL_SECONDS` | `180` | Tempo durante o qual o Server mantém as linhas de resultados de consultas antes de removê-las. | `WORKFLOW_SERVER_QUERY_TASK_TTL_SECONDS` |
| `DW_QUERY_TASK_MAX_PENDING_PER_QUEUE` | `1024` | Máximo de tarefas de consulta pendentes apoiadas em cache por namespace e fila antes de recusar novas consultas. | `WORKFLOW_SERVER_QUERY_TASK_MAX_PENDING_PER_QUEUE` |
| `DW_QUERY_TASK_POLL_TIMEOUT` | `5` | Máximo de segundos que cada polling de consultas ocioso espera antes de verificar novamente a pressão de tarefas de workflow e a disponibilidade do plano de controle. | `WORKFLOW_SERVER_QUERY_TASK_POLL_TIMEOUT` |
| `DW_QUERY_TASK_POLL_MAX_CONCURRENT` | não definido; derivado de `PHP_CLI_SERVER_WORKERS` | Limite opcional de esperas simultâneas de long polling de consultas ociosas neste nó. Consultas pendentes ainda podem ser reivindicadas imediatamente antes de o polling começar a esperar. | `WORKFLOW_SERVER_QUERY_TASK_POLL_MAX_CONCURRENT` |
| `DW_WORKFLOW_TASK_TIMEOUT` | `60` | Prazo padrão do lease de uma tarefa de workflow, em segundos. | `WORKFLOW_TASK_TIMEOUT` |
| `DW_ACTIVITY_TASK_TIMEOUT` | `300` | Prazo padrão do lease de uma tarefa de atividade, em segundos. | `ACTIVITY_TASK_TIMEOUT` |
| `DW_WORKER_STALE_AFTER_SECONDS` | `max(DW_WORKER_HEARTBEAT_INTERVAL_SECONDS * 3, 30)` | Segundos após o heartbeat de um worker até considerar seu registro obsoleto. | `WORKFLOW_SERVER_WORKER_STALE_AFTER_SECONDS` |
| `DW_WORKER_HEARTBEAT_INTERVAL_SECONDS` | `10` | Cadência em segundos anunciada aos SDKs nas confirmações de registro e heartbeat do worker. | `WORKFLOW_SERVER_WORKER_HEARTBEAT_INTERVAL_SECONDS` |

## Limites, retenção e métricas {#limits-retention-and-metrics}

Essas opções controlam os limites das requisições e o crescimento limitado. Se uma aplicação se aproxima desses valores com frequência, prefira payloads menores, armazenamento externo de payloads ou continue-as-new em vez de aumentar os limites por padrão.

| Variável | Valor padrão | Finalidade | Alias antigo |
| --- | --- | --- | --- |
| `DW_METRICS_WORKFLOW_TASK_FAILURE_TYPE_LIMIT` | `20` | Máximo de séries `workflow_type` de `dw_workflow_task_consecutive_failures`; os tipos excedentes são resumidos. | `WORKFLOW_SERVER_METRICS_WORKFLOW_TASK_FAILURE_TYPE_LIMIT` |
| `DW_METRICS_PROMETHEUS_WORKFLOW_SERIES_LIMIT` | `100` | Máximo de séries de workflows de `/api/system/prometheus-metrics` antes de resumir as séries excedentes. | `WORKFLOW_SERVER_METRICS_PROMETHEUS_WORKFLOW_SERIES_LIMIT` |
| `DW_METRICS_PROMETHEUS_ACTIVITY_SERIES_LIMIT` | `100` | Máximo de séries de atividades de `/api/system/prometheus-metrics` antes de resumir as séries excedentes. | `WORKFLOW_SERVER_METRICS_PROMETHEUS_ACTIVITY_SERIES_LIMIT` |
| `DW_METRICS_PROMETHEUS_TASK_QUEUE_SERIES_LIMIT` | `100` | Máximo de séries de execução por fila de `/api/system/prometheus-metrics` antes de resumir as séries excedentes. | `WORKFLOW_SERVER_METRICS_PROMETHEUS_TASK_QUEUE_SERIES_LIMIT` |
| `DW_MAX_HISTORY_EVENTS` | `50000` | Máximo de eventos de histórico por execução antes de exigir continue-as-new. | `WORKFLOW_MAX_HISTORY_EVENTS` |
| `DW_HISTORY_RETENTION_DAYS` | `30` | Dias de retenção padrão do histórico de execuções encerradas quando o namespace não os substitui. | `WORKFLOW_HISTORY_RETENTION_DAYS` |
| `DW_MAX_PAYLOAD_BYTES` | `2097152` | Máximo de bytes serializados de um payload. | `WORKFLOW_MAX_PAYLOAD_BYTES` |
| `DW_EXTERNAL_PAYLOAD_MAX_BYTES` | `67108864` | Tamanho máximo codificado em bytes (64 MiB) aceito pelo transporte autenticado de envio e leitura de payloads externos. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_MAX_BYTES` |
| `DW_EXTERNAL_PAYLOAD_REQUEST_TIMEOUT` | `30` | Orçamento em segundos das requisições de envio e leitura anunciado pelo Server aos clientes. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_REQUEST_TIMEOUT` |
| `DW_EXTERNAL_PAYLOAD_UPLOAD_EXPIRY` | `3600` | Segundos que um payload externo enviado pode permanecer sem reivindicação antes de sua referência opaca expirar. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_UPLOAD_EXPIRY` |
| `DW_MAX_MEMO_BYTES` | `262144` | Máximo de bytes serializados do memo de um workflow. | `WORKFLOW_MAX_MEMO_BYTES` |
| `DW_MAX_SEARCH_ATTRIBUTES` | `100` | Máximo de atributos de pesquisa de um workflow. | `WORKFLOW_MAX_SEARCH_ATTRIBUTES` |
| `DW_MAX_SEARCH_ATTRIBUTE_KEY_LENGTH` | `128` | Comprimento máximo em bytes de uma chave de atributo de pesquisa. | `WORKFLOW_MAX_SEARCH_ATTRIBUTE_KEY_LENGTH` |
| `DW_MAX_SEARCH_ATTRIBUTE_VALUE_BYTES` | `2048` | Tamanho máximo em bytes do valor textual de um atributo de pesquisa. | `WORKFLOW_MAX_SEARCH_ATTRIBUTE_VALUE_BYTES` |
| `DW_MAX_OPERATION_NAME_LENGTH` | `256` | Comprimento máximo em bytes do nome de um sinal, atualização ou consulta. | `WORKFLOW_MAX_OPERATION_NAME_LENGTH` |
| `DW_MAX_PENDING_ACTIVITIES` | `2000` | Máximo de atividades pendentes por execução antes de recusar um lote de comandos. | `WORKFLOW_MAX_PENDING_ACTIVITIES` |
| `DW_MAX_PENDING_CHILDREN` | `2000` | Máximo de workflows filhos pendentes por execução antes de recusar um lote de comandos. | `WORKFLOW_MAX_PENDING_CHILDREN` |
| `DW_MAX_NEXUS_OPERATIONS_PER_CALLER` | `200` | Máximo de operações Nexus retornadas por chamador no histórico antes de exigir paginação. | `WORKFLOW_MAX_NEXUS_OPERATIONS_PER_CALLER` |
| `DW_COMPRESSION_ENABLED` | `true` | Ativa a compactação de respostas JSON que ultrapassam o tamanho mínimo. | `WORKFLOW_SERVER_COMPRESSION_ENABLED` |

## Inicialização do Docker e procedência {#docker-bootstrap-and-provenance}

| Variável | Valor padrão | Finalidade | Alias antigo |
| --- | --- | --- | --- |
| `DW_EXPOSE_PACKAGE_PROVENANCE` | `false` | Inclui `package_provenance` em `/api/cluster/info` para requisições de administrador. | `WORKFLOW_SERVER_EXPOSE_PACKAGE_PROVENANCE` |
| `DW_PACKAGE_PROVENANCE_PATH` | `<base_path>/.package-provenance` | Caminho absoluto do arquivo de procedência da compilação Docker. | `WORKFLOW_SERVER_PACKAGE_PROVENANCE_PATH` |
| `DW_SERVICE_BOUNDARY_CROSS_NAMESPACE_DEFAULT` | `allow` | Ação padrão do limite de chamadas de serviço entre namespaces quando nenhuma regra mais específica corresponde. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_CROSS_NAMESPACE_DEFAULT` |
| `DW_SERVICE_BOUNDARY_RATE_LIMIT_PER_MINUTE` | não definido | Limite opcional de chamadas de serviço por minuto. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_RATE_LIMIT_PER_MINUTE` |
| `DW_SERVICE_BOUNDARY_MAX_IN_FLIGHT` | não definido | Limite opcional de chamadas de serviço simultâneas. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_MAX_IN_FLIGHT` |

## Inicialização do Docker {#docker-bootstrap}

| Variável | Valor padrão | Finalidade | Alias antigo |
| --- | --- | --- | --- |
| `DW_ENV_AUDIT_STRICT` | `0` | Impede a inicialização do contêiner se `env:audit` encontrar variáveis `DW_*` desconhecidas ou antigas. | - |
| `DW_BOOTSTRAP_RETRIES` | `30` | Tentativas de inicialização antes que o ponto de entrada desista das migrações e da criação do namespace padrão. | `WORKFLOW_SERVER_BOOTSTRAP_RETRIES` |
| `DW_BOOTSTRAP_DELAY_SECONDS` | `2` | Segundos entre tentativas de inicialização. | `WORKFLOW_SERVER_BOOTSTRAP_DELAY_SECONDS` |

## Controles do pacote Workflow {#workflow-package-controls}

A imagem do Server inclui `durable-workflow/workflow`, portanto também expõe os controles `DW_V2_*` do pacote. Eles devem corresponder aos das implantações de workers que executam os mesmos workflows.

| Variável | Valor padrão | Finalidade | Alias antigo |
| --- | --- | --- | --- |
| `DW_V2_NAMESPACE` | não definido | Limita as instâncias de workflow a um namespace. | `WORKFLOW_V2_NAMESPACE` |
| `DW_V2_TENANCY_ORGANIZATION` | não definido | Segmento opcional de organização da hierarquia de tenancy do pacote Workflow, exposto na prontidão, descoberta e visões do operador. | `WORKFLOW_V2_TENANCY_ORGANIZATION` |
| `DW_V2_TENANCY_PROJECT` | não definido | Segmento opcional de projeto da hierarquia de tenancy do pacote Workflow, exposto na prontidão, descoberta e visões do operador. | `WORKFLOW_V2_TENANCY_PROJECT` |
| `DW_V2_TENANCY_ENVIRONMENT` | não definido | Segmento opcional de ambiente da hierarquia de tenancy do pacote Workflow, exposto na prontidão, descoberta e visões do operador. | `WORKFLOW_V2_TENANCY_ENVIRONMENT` |
| `DW_V2_CURRENT_COMPATIBILITY` | não definido | Marcador de compatibilidade anunciado por este worker. | `WORKFLOW_V2_CURRENT_COMPATIBILITY` |
| `DW_V2_SUPPORTED_COMPATIBILITIES` | não definido | Marcadores de compatibilidade separados por vírgulas aceitos por este worker, ou `*`. | `WORKFLOW_V2_SUPPORTED_COMPATIBILITIES` |
| `DW_V2_COMPATIBILITY_NAMESPACE` | não definido | Namespace de compatibilidade para bancos de dados de workflows compartilhados com frotas independentes. | `WORKFLOW_V2_COMPATIBILITY_NAMESPACE` |
| `DW_V2_COMPATIBILITY_HEARTBEAT_TTL` | `30` | Segundos durante os quais um heartbeat de compatibilidade do worker permanece válido. | `WORKFLOW_V2_COMPATIBILITY_HEARTBEAT_TTL` |
| `DW_V2_PIN_TO_RECORDED_FINGERPRINT` | `true` | Preferir a definição registrada do workflow; veja abaixo o limite do caminho alternativo para cada runtime. | `WORKFLOW_V2_PIN_TO_RECORDED_FINGERPRINT` |
| `DW_V2_CONTINUE_AS_NEW_EVENT_THRESHOLD` | `10000` | Número de eventos de histórico a partir do qual o pacote solicita ao autor usar continue-as-new. | `WORKFLOW_V2_CONTINUE_AS_NEW_EVENT_THRESHOLD` |
| `DW_V2_CONTINUE_AS_NEW_SIZE_BYTES_THRESHOLD` | `5242880` | Tamanho em bytes do histórico serializado a partir do qual o pacote solicita continue-as-new. | `WORKFLOW_V2_CONTINUE_AS_NEW_SIZE_BYTES_THRESHOLD` |
| `DW_V2_HISTORY_EXPORT_SIGNING_KEY` | não definido | Chave HMAC opcional para autenticar os arquivos de exportação do histórico. | `WORKFLOW_V2_HISTORY_EXPORT_SIGNING_KEY` |
| `DW_V2_HISTORY_EXPORT_SIGNING_KEY_ID` | não definido | Identificador da chave registrado junto às exportações assinadas do histórico. | `WORKFLOW_V2_HISTORY_EXPORT_SIGNING_KEY_ID` |
| `DW_V2_UPDATE_WAIT_COMPLETION_TIMEOUT_SECONDS` | `10` | Segundos que o Server espera para que uma atualização alcance uma etapa terminal. | `WORKFLOW_V2_UPDATE_WAIT_COMPLETION_TIMEOUT_SECONDS` |
| `DW_V2_UPDATE_WAIT_POLL_INTERVAL_MS` | `50` | Milissegundos entre consultas à etapa de uma atualização. | `WORKFLOW_V2_UPDATE_WAIT_POLL_INTERVAL_MS` |
| `DW_V2_GUARDRAILS_BOOT` | `warn` | Modo de limites estruturais na inicialização: `warn`, `fail` ou `silent`. | `WORKFLOW_V2_GUARDRAILS_BOOT` |
| `DW_V2_LIMIT_PENDING_ACTIVITIES` | `2000` | Máximo de atividades pendentes do pacote. | `WORKFLOW_V2_LIMIT_PENDING_ACTIVITIES` |
| `DW_V2_LIMIT_PENDING_CHILDREN` | `1000` | Máximo de workflows filhos pendentes do pacote. | `WORKFLOW_V2_LIMIT_PENDING_CHILDREN` |
| `DW_V2_LIMIT_PENDING_TIMERS` | `2000` | Máximo de temporizadores pendentes do pacote. | `WORKFLOW_V2_LIMIT_PENDING_TIMERS` |
| `DW_V2_LIMIT_PENDING_SIGNALS` | `5000` | Máximo de sinais pendentes do pacote. | `WORKFLOW_V2_LIMIT_PENDING_SIGNALS` |
| `DW_V2_LIMIT_PENDING_UPDATES` | `500` | Máximo de atualizações pendentes do pacote. | `WORKFLOW_V2_LIMIT_PENDING_UPDATES` |
| `DW_V2_LIMIT_COMMAND_BATCH_SIZE` | `1000` | Máximo de comandos aceitos na conclusão de uma tarefa de workflow. | `WORKFLOW_V2_LIMIT_COMMAND_BATCH_SIZE` |
| `DW_V2_LIMIT_PAYLOAD_SIZE_BYTES` | `2097152` | Máximo de bytes por payload do pacote. | `WORKFLOW_V2_LIMIT_PAYLOAD_SIZE_BYTES` |
| `DW_V2_LIMIT_MEMO_SIZE_BYTES` | `262144` | Máximo de bytes do memo de um workflow no pacote. | `WORKFLOW_V2_LIMIT_MEMO_SIZE_BYTES` |
| `DW_V2_LIMIT_SEARCH_ATTRIBUTE_SIZE_BYTES` | `40960` | Máximo de bytes de atributos de pesquisa do pacote. | `WORKFLOW_V2_LIMIT_SEARCH_ATTRIBUTE_SIZE_BYTES` |
| `DW_V2_LIMIT_HISTORY_TRANSACTION_SIZE` | `5000` | Máximo de eventos por transação de histórico do pacote. | `WORKFLOW_V2_LIMIT_HISTORY_TRANSACTION_SIZE` |
| `DW_V2_LIMIT_WARNING_THRESHOLD_PERCENT` | `80` | Porcentagem de um limite estrutural a partir da qual o pacote emite um aviso. | `WORKFLOW_V2_LIMIT_WARNING_THRESHOLD_PERCENT` |
| `DW_V2_TASK_DISPATCH_MODE` | `queue` | Modo de despacho de tarefas do pacote, normalmente substituído por `DW_TASK_DISPATCH_MODE` no modo Server. | - |
| `DW_V2_MATCHING_ROLE_QUEUE_WAKE` | `true` | Determina se os workers de fila despertam o papel de correspondência a cada evento Looping. Use `false` para excluir os nós dedicados à execução do despertar por polling amplo quando um daemon dedicado de `php artisan workflow:v2:repair-pass --loop` realiza a varredura. | `WORKFLOW_V2_MATCHING_ROLE_QUEUE_WAKE` |
| `DW_V2_TASK_REPAIR_REDISPATCH_AFTER_SECONDS` | `3` | Segundos antes de o reparo despachar novamente uma tarefa de workflow órfã. | `WORKFLOW_V2_TASK_REPAIR_REDISPATCH_AFTER_SECONDS` |
| `DW_V2_TASK_REPAIR_LOOP_THROTTLE_SECONDS` | `5` | Mínimo de segundos entre passagens de reparo de tarefas por fila. | `WORKFLOW_V2_TASK_REPAIR_LOOP_THROTTLE_SECONDS` |
| `DW_V2_TASK_REPAIR_SCAN_LIMIT` | `25` | Máximo de tarefas consideradas por passagem de reparo. | `WORKFLOW_V2_TASK_REPAIR_SCAN_LIMIT` |
| `DW_V2_TASK_REPAIR_FAILURE_BACKOFF_MAX_SECONDS` | `60` | Espera máxima em segundos após uma falha no reparo de tarefas. | `WORKFLOW_V2_TASK_REPAIR_FAILURE_BACKOFF_MAX_SECONDS` |
| `DW_V2_MULTI_NODE` | `false` | Declara uma implantação com vários nós para validar que o cache permite a coordenação entre nós. | `WORKFLOW_V2_MULTI_NODE` |
| `DW_V2_VALIDATE_CACHE_BACKEND` | `true` | Valida na inicialização o backend de cache do long polling. | `WORKFLOW_V2_VALIDATE_CACHE_BACKEND` |
| `DW_V2_CACHE_VALIDATION_MODE` | `warn` | Modo de falha de validação do backend de cache: `fail`, `warn` ou `silent`. | `WORKFLOW_V2_CACHE_VALIDATION_MODE` |
| `DW_V2_FLEET_VALIDATION_MODE` | `warn` | Modo de validação de compatibilidade da frota: `warn` registra avisos; `fail` bloqueia o despacho e recusa a operação se não houver worker compatível. | `WORKFLOW_V2_FLEET_VALIDATION_MODE` |
| `DW_SERIALIZER` | `avro` | Entrada de diagnóstico do codec de payloads; a versão final v2 resolve os payloads de novas execuções para Avro. | `WORKFLOW_SERIALIZER` |

**Preferência de fingerprint publicada.** O Server 2.9.9 torna efetiva a preferência de fingerprint para workers de serviço. Com a fixação ativada, uma definição alterada só pode ser alternativa quando não resta um worker elegível com a definição registrada e a substituição anuncia `workflow_entry_arguments_validation`. Com a fixação desativada, a preferência pelo código é removida; permanecem as fixações de build, o isolamento de namespace/fila/tipo, a identidade de registro e o replay estrito. As proteções de entrada correspondentes estão disponíveis desde os SDKs PHP 2.5.4, Python 2.6.2 e Rust 3.5.6. Essas são as versões mínimas para esses recursos; instale as versões estáveis atuais com correções de segurança. Não presuma esse comportamento em um runtime antigo apenas porque sua configuração contém a mesma chave. Consulte o [roteamento de definições](./worker-compatibility-routing.md#definition-fingerprint-evolution).

Use `DW_V2_GUARDRAILS_BOOT` na CI e nos manifestos de implantação. O nome antigo `WORKFLOW_V2_GUARDRAILS_BOOT` é mantido apenas para que `env:audit` indique o novo nome aos operadores da fase alfa. O pacote Workflow não o lê mais como alternativa durante a execução.

Consulte [Correspondência e despacho de tarefas](/docs/polyglot/task-matching-dispatch) ao configurar `DW_V2_MATCHING_ROLE_QUEUE_WAKE` ou um daemon dedicado de `workflow:v2:repair-pass --loop`. Essas opções alteram onde as tarefas prontas são descobertas, não o contrato do protocolo dos workers.

## Variáveis de infraestrutura de execução {#runtime-infrastructure-variables}

As variáveis de infraestrutura de execução controlam o framework e suas dependências. A auditoria do Server as reconhece para não emitir avisos, mas elas não são controles estáveis da API do Durable Workflow.

| Grupo | Variáveis | Uso |
| --- | --- | --- |
| Aplicação | `APP_NAME`, `APP_ENV`, `APP_KEY`, `APP_DEBUG`, `APP_URL`, `APP_VERSION`, idioma, fuso horário, manutenção e criptografia | Identidade e comportamento de inicialização da aplicação Laravel. |
| Logs | `LOG_CHANNEL`, `LOG_LEVEL`, opções de stack, daily, Slack e Papertrail | Destinos e retenção dos logs do Laravel. |
| Banco de dados | `DB_CONNECTION`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, `DB_SOCKET`, `DB_URL`, conjunto de caracteres, collation e chaves estrangeiras | Armazenamento SQL de estado das tabelas de workflows, namespaces, workers e projeções. |
| Redis/cache/fila | `REDIS_*`, `QUEUE_CONNECTION`, `QUEUE_FAILED_DRIVER`, `CACHE_STORE`, `CACHE_PREFIX`, `SESSION_*` | Workers de fila, bloqueios de cache, sinais de long polling e suporte web e de sessões. |
| Arquivos/e-mail/difusão | `FILESYSTEM_DISK`, `MAIL_*`, `BROADCAST_*`, `PUSHER_*`, `AWS_*` | Integrações do framework usadas por recursos específicos de cada implantação. |
| Compilação/execução | `MYSQL_VERSION`, `REDIS_VERSION`, `PHP_CLI_SERVER_WORKERS`, `VITE_APP_NAME`, `BCRYPT_ROUNDS` | Imagens do Docker Compose e comportamento de execução do framework. |

## Notas de migração {#migration-notes}

Ao migrar uma implantação antiga, altere primeiro para o nome público e deixe o nome antigo sem definição. Se ambos estiverem presentes, os operadores devem considerar o valor `DW_*` e remover o nome antigo.

```bash
# Before
WORKFLOW_SERVER_AUTH_DRIVER=token
WORKFLOW_SERVER_OPERATOR_TOKEN=operator-secret

# After
DW_AUTH_DRIVER=token
DW_OPERATOR_TOKEN=operator-secret
```

Após a migração, execute a imagem do Server com `DW_ENV_AUDIT_STRICT=1` para detectar variáveis com erros de digitação, aliases obsoletos e opções copiadas de procedimentos antigos.
