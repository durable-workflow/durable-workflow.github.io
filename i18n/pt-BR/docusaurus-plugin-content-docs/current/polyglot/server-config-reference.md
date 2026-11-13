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

Esta página documenta o contrato das variáveis de ambiente `DW_*` da imagem do Durable Workflow Server para operadores. Use-a ao criar modelos de implantação, revisar a configuração de produção ou migrar os nomes antigos `WORKFLOW_*` / `ACTIVITY_*` para o contrato v2 do Server. O Server atual é o Server nativo 3.x; [Server nativo 3.x](#native-server-3x) indica quais configurações ele respeita, ignora ou recusa. O PHP Server 2.x está congelado na versão 2.11.8.

O PHP Server 2.x também utiliza as configurações comuns do Laravel, como `DB_*`, `REDIS_*`, `QUEUE_CONNECTION` e `CACHE_STORE`. Essas variáveis de infraestrutura são listadas separadamente porque conectam os componentes da implantação e não controlam a API do Durable Workflow.

## Server nativo 3.x {#native-server-3x}

As tabelas de variáveis desta página registram o contrato `DW_*` publicado pelo PHP Server 2.11.0, e suas finalidades descrevem o PHP 2.x. O Server nativo 3.x lê os mesmos nomes, com os mesmos aliases antigos, por meio de uma auditoria de inicialização que atribui a cada configuração do contrato um único tratamento:

- **Respeitada:** o Server nativo lê a configuração e aplica o significado do PHP. As configurações que não aparecem abaixo são respeitadas.
- **Ignorada:** o Server nativo aceita a configuração, mas ela não altera nada que clientes ou operadores observem.
- **Recusada, salvo no padrão:** o Server nativo se recusa a iniciar, a menos que a configuração não esteja definida ou mantenha o padrão do PHP. O erro de inicialização indica a configuração, o valor aceito e o motivo.

O Server nativo lê seu ambiente uma única vez, quando o processo inicia, e não mantém cache de configuração. Para alterar uma configuração, reinicie ou substitua o processo do Server. Assim como o `env:audit` do PHP, a auditoria nativa avisa sobre nomes `DW_*` desconhecidos e nomes antigos, e `DW_ENV_AUDIT_STRICT=1` transforma esses avisos em recusa de inicialização.

O Server nativo recusa estas configurações, a menos que mantenham o valor indicado:

| Motivo | Configurações e valores aceitos |
| --- | --- |
| O Server nativo sempre fixa as execuções à definição de workflow registrada | `DW_V2_PIN_TO_RECORDED_FINGERPRINT`: não definida ou `true` |
| O Server nativo não consegue aplicar um limite alterado de operações Nexus | `DW_MAX_NEXUS_OPERATIONS_PER_CALLER`: não definida ou `200`<br />`DW_MAX_OPERATION_NAME_LENGTH`: não definida ou `256` |
| O Server nativo não consegue aplicar um limite alterado de séries de métricas | `DW_METRICS_PROMETHEUS_ACTIVITY_SERIES_LIMIT`: não definida ou `100`<br />`DW_METRICS_PROMETHEUS_TASK_QUEUE_SERIES_LIMIT`: não definida ou `100`<br />`DW_METRICS_PROMETHEUS_WORKFLOW_SERIES_LIMIT`: não definida ou `100`<br />`DW_METRICS_WORKFLOW_TASK_FAILURE_TYPE_LIMIT`: não definida ou `20` |
| O Server nativo não consegue aplicar um teto alterado de tarefas de consulta pendentes | `DW_QUERY_TASK_MAX_PENDING_PER_QUEUE`: não definida ou `1024` |
| O Server nativo não consegue aplicar um limite estrutural alterado | `DW_V2_LIMIT_COMMAND_BATCH_SIZE`: não definida ou `1000` |
| O Server nativo não consegue aplicar uma temporização alterada do reparo de tarefas | `DW_V2_TASK_REPAIR_FAILURE_BACKOFF_MAX_SECONDS`: não definida ou `60`<br />`DW_V2_TASK_REPAIR_REDISPATCH_AFTER_SECONDS`: não definida ou `3`<br />`DW_V2_TASK_REPAIR_SCAN_LIMIT`: não definida ou `25` |
| O Server nativo não publica a procedência do pacote | `DW_EXPOSE_PACKAGE_PROVENANCE`: não definida ou `false` |
| O Server nativo não informa uma declaração de múltiplos nós | `DW_V2_MULTI_NODE`: não definida ou `false` |
| O Server nativo não executa workflows do Workflow 1 | `DW_V1_ENABLED`: não definida ou `false` |
| O Server nativo não valida a compatibilidade da frota de workers | `DW_V2_FLEET_VALIDATION_MODE`: não definida ou diferente de `fail` |
| O Server nativo entrega tarefas apenas a workers que fazem polling | `DW_TASK_DISPATCH_MODE`: não definida ou `poll` |
| O Server nativo não tem configuração de executor externo | `DW_EXTERNAL_EXECUTOR_CONFIG_OVERLAY`: não definida ou vazia<br />`DW_EXTERNAL_EXECUTOR_CONFIG_PATH`: não definida ou vazia |
| O Server nativo não tem modo de recuperação da migração de memo | `DW_WORKFLOW_MEMO_MIGRATION_RECOVERY`: não definida ou vazia |
| O Server nativo não tem limites de estado durável por namespace | `DW_NAMESPACE_DURABLE_HARD_LIMITS`: não definida ou `{}`<br />`DW_NAMESPACE_DURABLE_LIMITS`: não definida ou `{}`<br />`DW_NAMESPACE_DURABLE_OVERRIDES`: não definida ou `{}` |
| O Server nativo não tem limites de admissão de requisições por namespace | `DW_NAMESPACE_ADMISSION_OVERRIDES`: não definida ou `{}`<br />`DW_NAMESPACE_HARD_MAX_CONCURRENT_REQUESTS`: não definida ou vazia<br />`DW_NAMESPACE_HARD_MAX_REQUESTS_PER_MINUTE`: não definida ou vazia<br />`DW_NAMESPACE_MAX_CONCURRENT_REQUESTS`: não definida ou vazia<br />`DW_NAMESPACE_MAX_REQUESTS_PER_MINUTE`: não definida ou vazia |
| O Server nativo não tem política de fronteira de serviço | `DW_SERVICE_BOUNDARY_CROSS_NAMESPACE_DEFAULT`: não definida ou `allow`<br />`DW_SERVICE_BOUNDARY_HARD_MAX_IN_FLIGHT`: não definida ou vazia<br />`DW_SERVICE_BOUNDARY_HARD_RATE_LIMIT_PER_MINUTE`: não definida ou vazia<br />`DW_SERVICE_BOUNDARY_MAX_IN_FLIGHT`: não definida ou vazia<br />`DW_SERVICE_BOUNDARY_NAMESPACE_MAX_IN_FLIGHT`: não definida ou vazia<br />`DW_SERVICE_BOUNDARY_NAMESPACE_OVERRIDES`: não definida ou `{}`<br />`DW_SERVICE_BOUNDARY_NAMESPACE_RATE_LIMIT_PER_MINUTE`: não definida ou vazia<br />`DW_SERVICE_BOUNDARY_RATE_LIMIT_PER_MINUTE`: não definida ou vazia |
| O Server nativo não tem arquivo de admissão de armazenamento | `DW_STORAGE_ADMISSION_FILE`: não definida ou vazia<br />`DW_STORAGE_ADMISSION_SOURCE`: não definida ou vazia |
| O Server nativo não tem limites de admissão de tarefas | `DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE`: não definida, vazia ou que não seja um número positivo<br />`DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE`: não definida, vazia ou que não seja um número positivo<br />`DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE`: não definida, vazia ou que não seja um número positivo<br />`DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE`: não definida, vazia ou que não seja um número positivo<br />`DW_TASK_QUEUE_ADMISSION_OVERRIDES`: não definida ou `{}`<br />`DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE`: não definida, vazia ou que não seja um número positivo<br />`DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE`: não definida, vazia ou que não seja um número positivo<br />`DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE`: não definida, vazia ou que não seja um número positivo<br />`DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE`: não definida, vazia ou que não seja um número positivo |
| O Server nativo implementa uma única versão do protocolo dos workers | `DW_WORKER_PROTOCOL_VERSION`: não definida ou `1.20` |
| O Server nativo nunca confia em cabeçalhos de atribuição encaminhados | `DW_TRUST_FORWARDED_ATTRIBUTION_HEADERS`: não definida ou `false` |
| O Server nativo fixa execuções apenas a ids de compilação de workers registrados; não tem marcadores de compatibilidade válidos para todo o Server | `DW_V2_COMPATIBILITY_HEARTBEAT_TTL`: não definida ou `30`<br />`DW_V2_COMPATIBILITY_NAMESPACE`: não definida ou vazia<br />`DW_V2_CURRENT_COMPATIBILITY`: não definida ou vazia<br />`DW_V2_NAMESPACE`: não definida ou vazia<br />`DW_V2_SUPPORTED_COMPATIBILITIES`: não definida ou vazia |
| O Server nativo não informa problemas de codec de payloads | `DW_SERIALIZER`: não definida, vazia ou `avro` |
| O Server nativo é executado apenas como processo de servidor HTTP independente | `DW_MODE`: não definida ou `service`<br />`DW_SERVER_PROCESS_CLASS`: não definida ou com valor diferente de `scheduler_node` e `worker_node`<br />`DW_SERVER_TOPOLOGY_SHAPE`: não definida ou com valor diferente de `embedded` e `split_control_execution` |
| O Server nativo usa `default` para requisições que não indicam namespace | `DW_DEFAULT_NAMESPACE`: não definida ou `default` |
| O Server nativo armazena payloads externos apenas no seu disco local | `DW_EXTERNAL_PAYLOAD_S3_BUCKET`: não definida ou vazia |
| O Server nativo aceita apenas sua própria autenticação por token | `DW_AUTH_BACKWARD_COMPATIBLE`: não definida ou `true`<br />`DW_AUTH_PROVIDER`: não definida ou vazia<br />`DW_PRINCIPAL_TOKENS`: não definida ou vazia |

O Server nativo aceita, mas ignora: `DW_ADMIN_SIGNATURE_KEY`, `DW_AUTH_METHOD_HEADER`, `DW_AUTH_STATUS_HEADER`, `DW_BOOTSTRAP_DELAY_SECONDS`, `DW_BOOTSTRAP_RETRIES`, `DW_CALLER_LABEL_HEADER`, `DW_CALLER_TYPE_HEADER`, `DW_COMPRESSION_ENABLED`, `DW_DUE_TIMER_RECOVERY_SCAN_LIMIT`, `DW_EXPIRED_WORKFLOW_TASK_RECOVERY_TTL_SECONDS`, `DW_EXTERNAL_PAYLOAD_S3_ACCESS_KEY_ID`, `DW_EXTERNAL_PAYLOAD_S3_ENDPOINT`, `DW_EXTERNAL_PAYLOAD_S3_REGION`, `DW_EXTERNAL_PAYLOAD_S3_SECRET_ACCESS_KEY`, `DW_EXTERNAL_PAYLOAD_S3_SESSION_TOKEN`, `DW_EXTERNAL_PAYLOAD_S3_USE_PATH_STYLE_ENDPOINT`, `DW_MAX_HISTORY_EVENTS`, `DW_MAX_TASKS_PER_POLL`, `DW_OBSERVABILITY_BAGGAGE_ALLOWLIST`, `DW_OBSERVABILITY_CONTEXT_ENABLED`, `DW_OPERATOR_SIGNATURE_KEY`, `DW_PACKAGE_PROVENANCE_PATH`, `DW_POLLING_CACHE_PATH`, `DW_QUERY_TASK_POLL_MAX_CONCURRENT`, `DW_QUERY_TASK_POLL_MAX_CONCURRENT_PER_NAMESPACE`, `DW_SIGNATURE_KEY`, `DW_SQLITE_CLAIM_LOCK_TTL_SECONDS`, `DW_SQLITE_CLAIM_LOCK_WAIT_SECONDS`, `DW_STORAGE_ADMISSION_MAX_AGE_SECONDS`, `DW_V2_CACHE_VALIDATION_MODE`, `DW_V2_GUARDRAILS_BOOT`, `DW_V2_LIMIT_SEARCH_ATTRIBUTE_SIZE_BYTES`, `DW_V2_LIMIT_WARNING_THRESHOLD_PERCENT`, `DW_V2_MATCHING_ROLE_QUEUE_WAKE`, `DW_V2_TASK_DISPATCH_MODE`, `DW_V2_TASK_REPAIR_LOOP_THROTTLE_SECONDS`, `DW_V2_TENANCY_ENVIRONMENT`, `DW_V2_TENANCY_ORGANIZATION`, `DW_V2_TENANCY_PROJECT`, `DW_V2_UPDATE_WAIT_POLL_INTERVAL_MS`, `DW_V2_VALIDATE_CACHE_BACKEND`, `DW_WAKE_SIGNAL_TTL_SECONDS`, `DW_WORKER_LONG_POLL_MAX_CONCURRENT`, `DW_WORKER_LONG_POLL_MAX_CONCURRENT_PER_NAMESPACE`, `DW_WORKER_LONG_POLL_RESERVED_HTTP_WORKERS`, `DW_WORKER_POLL_INTERVAL_MS`, `DW_WORKER_POLL_SIGNAL_CHECK_INTERVAL_MS`, `DW_WORKER_SIGNATURE_KEY`.

O Server nativo não tem limites de lease ou de despacho de filas de tarefas no servidor, grupos de orçamento, admissão de requisições por namespace, cotas de estado durável por namespace nem limites de polling mantido em espera, e ainda não há equivalente nativo para eles. Cada processo do Server nativo abre no máximo quatro conexões de banco de dados. As tarefas de consulta têm um limite fixo de 16 tarefas pendentes ou com lease por namespace; acima dele, novas consultas são recusadas com HTTP `429` e `query_task_queue_full`, como no PHP. Esse limite não é configurável. Para limitar a concorrência de tarefas no Server nativo, dimensione os slots de cada worker do SDK e o número de workers. [Admissão de filas de tarefas](/docs/polyglot/task-queue-admission) descreve os controles do PHP 2.x.

A autenticação do Server nativo difere da do PHP 2.x nestes pontos:

- `DW_AUTH_TOKEN` é obrigatório. O Server nativo se recusa a iniciar sem ele e aceita o token compartilhado para todos os papéis, junto com quaisquer tokens limitados por papel.
- `DW_AUTH_DRIVER` aceita apenas `token`. O Server nativo recusa `signature`, e uma imagem de release também recusa `none`. As configurações de chaves de assinatura são ignoradas.

O Server nativo também lê configurações fora do contrato do PHP:

- `DW_BIND_ADDRESS`: o endereço de escuta. O binário usa `127.0.0.1:8080` por padrão; a imagem publicada define `0.0.0.0:8080`.
- `DW_RUST_MAINTENANCE_LOOP`: `1` ou `true` adiciona a passagem de reparo (reparo de tarefas e timeouts de atividades) ao loop interno de timers e agendamentos. A imagem publicada define `1`, pois não tem agendador separado.
- `DW_RUST_EXPERIMENTAL`: exigido como `1` apenas por compilações de desenvolvimento sem versão de release. As imagens de release não precisam dele.
- `DW_UPGRADE_BACKUP_FINGERPRINT` e `DW_RUST_UPGRADE_QUEUE_*`: entradas da [migração para o Server nativo](%%artifact.serverTakeoverRunbookUrl%%), sem volta, de um banco de dados PHP, qualificada na imagem publicada 3.0.4 dentro do escopo declarado no runbook.
- `DW_V2_LIMIT_HISTORY_TRANSACTION_ROWS` (antigo `WORKFLOW_V2_LIMIT_HISTORY_TRANSACTION_ROWS`): respeitada antes de sua inclusão no contrato do PHP.

## Quando as alterações entram em vigor {#how-changes-take-effect}

O Server nativo 3.x lê seu ambiente apenas ao iniciar o processo; reinicie ou substitua o processo do Server para aplicar uma alteração. O restante desta seção descreve o PHP 2.x.

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

O repositório do Server mantém o contrato canônico em `config/dw-contract.php`. O Server nativo 3.x executa a auditoria equivalente na inicialização, conforme descrito em [Server nativo 3.x](#native-server-3x). No PHP 2.x, na inicialização do contêiner, `php artisan env:audit` avisa quando encontra variáveis `DW_*` desconhecidas ou nomes antigos. Defina `DW_ENV_AUDIT_STRICT=1` para que o ponto de entrada falhe em vez de iniciar com avisos.

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
| `DW_AUTH_PROVIDER` | não definido | PHP 2.x: classe resolvida pelo Laravel que implementa `App\Contracts\AuthProvider`. O Server nativo 3.x se recusa a iniciar quando ela está definida. | `WORKFLOW_SERVER_AUTH_PROVIDER` |
| `DW_AUTH_DRIVER` | `token` | Driver de autenticação do PHP 2.x: `none`, `token` ou `signature`. O Server nativo 3.x aceita apenas `token`. | `WORKFLOW_SERVER_AUTH_DRIVER` |
| `DW_AUTH_TOKEN` | não definido | PHP 2.x: token bearer compartilhado quando não há token limitado por papel. Server nativo 3.x: obrigatório e aceito para todos os papéis. | `WORKFLOW_SERVER_AUTH_TOKEN` |
| `DW_SIGNATURE_KEY` | não definido | PHP 2.x: chave de assinatura HMAC compartilhada quando não há chave limitada por papel. Ignorada pelo Server nativo 3.x, que não tem autenticação por assinatura. | `WORKFLOW_SERVER_SIGNATURE_KEY` |
| `DW_WORKER_TOKEN` | não definido | Token bearer para registro, polling, heartbeats e conclusão de tarefas dos workers. | `WORKFLOW_SERVER_WORKER_TOKEN` |
| `DW_OPERATOR_TOKEN` | não definido | Token bearer para leituras e operações do operador no plano de controle. | `WORKFLOW_SERVER_OPERATOR_TOKEN` |
| `DW_ADMIN_TOKEN` | não definido | Token bearer para alterações de namespaces, retenção e outras operações administrativas. | `WORKFLOW_SERVER_ADMIN_TOKEN` |
| `DW_PRINCIPAL_TOKENS` | não definido | Mapa JSON de tokens para identidades nomeadas. Cada entrada fornece `token`, `subject`, `roles` e, opcionalmente, `tenant`, `label` e `claims` não secretos. O Server nativo 3.x se recusa a iniciar quando ela está definida. | `WORKFLOW_SERVER_PRINCIPAL_TOKENS` |
| `DW_WORKER_SIGNATURE_KEY` | não definido | Chave HMAC para requisições do papel worker ao usar autenticação por assinatura. | `WORKFLOW_SERVER_WORKER_SIGNATURE_KEY` |
| `DW_OPERATOR_SIGNATURE_KEY` | não definido | Chave HMAC para requisições do papel operador ao usar autenticação por assinatura. | `WORKFLOW_SERVER_OPERATOR_SIGNATURE_KEY` |
| `DW_ADMIN_SIGNATURE_KEY` | não definido | Chave HMAC para requisições do papel administrador ao usar autenticação por assinatura. | `WORKFLOW_SERVER_ADMIN_SIGNATURE_KEY` |
| `DW_AUTH_BACKWARD_COMPATIBLE` | `true` | PHP 2.x: aceita `DW_AUTH_TOKEN` / `DW_SIGNATURE_KEY` compartilhados como alternativa quando falta uma credencial limitada por papel. O Server nativo 3.x sempre aceita o token compartilhado e se recusa a iniciar quando esta variável é `false`. | `WORKFLOW_SERVER_AUTH_BACKWARD_COMPATIBLE` |

Use credenciais limitadas por papel em produção. No PHP 2.x, `DW_AUTH_DRIVER=none` serve apenas para verificações locais básicas, pois permite acessar todos os endpoints sem token bearer nem assinatura; as imagens de release nativas o recusam.

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
| `DW_WORKER_POLL_TIMEOUT` | `30` | Espera padrão quando o poll omite `timeout_seconds`. O valor enviado pelo SDK prevalece; este não é o máximo. Veja os [orçamentos de timeout completos](../deployment.md#worker-long-poll-timeout-budgets). | `WORKFLOW_SERVER_WORKER_POLL_TIMEOUT` |
| `DW_WORKER_POLL_INTERVAL_MS` | `1000` | Milissegundos entre buscas internas enquanto um polling permanece aberto. | `WORKFLOW_SERVER_WORKER_POLL_INTERVAL_MS` |
| `DW_WORKER_POLL_SIGNAL_CHECK_INTERVAL_MS` | `100` | Milissegundos entre verificações de sinais de despertar enquanto um polling permanece aberto. | `WORKFLOW_SERVER_WORKER_POLL_SIGNAL_CHECK_INTERVAL_MS` |
| `DW_POLLING_CACHE_PATH` | `storage/framework/cache/server-polling/<APP_ENV>` | Diretório de coordenação do polling dos workers quando o cache é armazenado em arquivos. | `WORKFLOW_SERVER_POLLING_CACHE_PATH` |
| `DW_WAKE_SIGNAL_TTL_SECONDS` | `max(DW_WORKER_POLL_TIMEOUT + 5, 60)` | TTL dos sinais de despertar por fila que interrompem a espera de um polling. | `WORKFLOW_SERVER_WAKE_SIGNAL_TTL_SECONDS` |
| `DW_WORKER_LONG_POLL_MAX_CONCURRENT` | não definido; derivado de `PHP_CLI_SERVER_WORKERS` | Limite opcional de esperas simultâneas de long polling de tarefas de workflow ou atividade neste nó. O polling de consultas tem um orçamento separado. O Server nativo 3.x a ignora; veja [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKER_LONG_POLL_MAX_CONCURRENT` |
| `DW_WORKER_LONG_POLL_RESERVED_HTTP_WORKERS` | `2` | Workers do servidor CLI do PHP reservados para saúde e plano de controle ao calcular o limite de espera do long polling de workflows e atividades. O Server nativo 3.x a ignora; veja [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKER_LONG_POLL_RESERVED_HTTP_WORKERS` |
| `DW_MAX_TASKS_PER_POLL` | `1` | Máximo de tarefas retornadas por polling de um worker. | `WORKFLOW_SERVER_MAX_TASKS_PER_POLL` |
| `DW_SQLITE_CLAIM_LOCK_TTL_SECONDS` | `10` | Segundos até expirar a exclusão de reivindicação de tarefas, apoiada em cache, do backend SQLite de início rápido. | `WORKFLOW_SERVER_SQLITE_CLAIM_LOCK_TTL_SECONDS` |
| `DW_SQLITE_CLAIM_LOCK_WAIT_SECONDS` | `5` | Segundos que uma reivindicação de tarefas SQLite espera pela exclusão apoiada em cache antes de retornar pressão de bloqueio do backend. | `WORKFLOW_SERVER_SQLITE_CLAIM_LOCK_WAIT_SECONDS` |
| `DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` | não definido | Máximo de leases ativos de tarefas de workflow por namespace e fila. O Server nativo 3.x se recusa a iniciar quando ela é um número positivo; veja [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` |
| `DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` | não definido | Máximo de leases ativos de tarefas de workflow entre todas as filas de um namespace. O Server nativo 3.x se recusa a iniciar quando ela é um número positivo; veja [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` |
| `DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE` | não definido | Máximo de despachos de tarefas de workflow por minuto, namespace e fila. O Server nativo 3.x se recusa a iniciar quando ela é um número positivo; veja [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE` |
| `DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` | não definido | Máximo de despachos de tarefas de workflow por minuto em todo um namespace. O Server nativo 3.x se recusa a iniciar quando ela é um número positivo; veja [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` |
| `DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` | não definido | Máximo de leases ativos de tarefas de atividade por namespace e fila. O Server nativo 3.x se recusa a iniciar quando ela é um número positivo; veja [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` |
| `DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` | não definido | Máximo de leases ativos de tarefas de atividade entre todas as filas de um namespace. O Server nativo 3.x se recusa a iniciar quando ela é um número positivo; veja [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` |
| `DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE` | não definido | Máximo de despachos de tarefas de atividade por minuto, namespace e fila. O Server nativo 3.x se recusa a iniciar quando ela é um número positivo; veja [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE` |
| `DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` | não definido | Máximo de despachos de tarefas de atividade por minuto em todo um namespace. O Server nativo 3.x se recusa a iniciar quando ela é um número positivo; veja [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` |
| `DW_TASK_QUEUE_ADMISSION_OVERRIDES` | `{}` | Opções JSON específicas por `namespace:task_queue`, `namespace:*`, `task_queue` ou `*` para leases ativos, ritmo de despacho, limites de namespace e grupos de orçamento de serviços posteriores. O Server nativo 3.x se recusa a iniciar, a menos que ela não esteja definida ou seja `{}`; veja [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_TASK_QUEUE_ADMISSION_OVERRIDES` |
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
| `DW_QUERY_TASK_MAX_PENDING_PER_QUEUE` | `1024` | Máximo de tarefas de consulta pendentes apoiadas em cache por namespace e fila antes de recusar novas consultas. O Server nativo 3.x recusa qualquer valor diferente de `1024` e aplica, em vez disso, seu próprio limite fixo de tarefas de consulta; veja [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_QUERY_TASK_MAX_PENDING_PER_QUEUE` |
| `DW_QUERY_TASK_POLL_TIMEOUT` | `5` | Máximo de segundos que cada polling de consultas ocioso espera antes de verificar novamente a pressão de tarefas de workflow e a disponibilidade do plano de controle. | `WORKFLOW_SERVER_QUERY_TASK_POLL_TIMEOUT` |
| `DW_QUERY_TASK_POLL_MAX_CONCURRENT` | não definido; derivado de `PHP_CLI_SERVER_WORKERS` | Limite opcional de esperas simultâneas de long polling de consultas ociosas neste nó. Consultas pendentes ainda podem ser reivindicadas imediatamente antes de o polling começar a esperar. O Server nativo 3.x a ignora; veja [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_QUERY_TASK_POLL_MAX_CONCURRENT` |
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
| `DW_MAX_HISTORY_EVENTS` | `50000` | Não tem efeito. Nenhuma versão do Server a lê, e o histórico por execução não tem limite. Limite históricos longos com continue-as-new. | `WORKFLOW_MAX_HISTORY_EVENTS` |
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

## Limites na fronteira de requisições do Server {#server-request-boundary-limits}

Ao usar o servidor independente, um conjunto separado de tetos é aplicado na fronteira de requisições HTTP, antes que uma tarefa de workflow, sinal, atualização ou consulta chegue ao plano de controle. Esses limites falham imediatamente com uma resposta `422 validation_failed` (ou `413 payload_too_large` nas verificações do corpo inteiro), para que clientes saibam o motivo da rejeição sem que o servidor grave qualquer registro no banco de dados.

| Limite | Padrão | Chave de configuração | O que restringe |
|---|---|---|---|
| Tamanho do corpo | 2 MiB | `server.limits.max_payload_bytes` | Total de bytes do corpo da requisição HTTP, exceto uma conclusão de tarefa de workflow no Server nativo 3.6.0 ou posterior (próxima linha) |
| Tamanho da conclusão de tarefa de workflow | 32 MiB (16 × tamanho do corpo) | derivado de `server.limits.max_payload_bytes` | Server nativo 3.6.0 ou posterior: uma requisição que conclui uma tarefa de workflow com comandos. Os argumentos de cada comando continuam respeitando o limite por payload |
| Tamanho do memo | 256 KiB | `server.limits.max_memo_bytes` | Memo serializado em `POST /workflows` e `POST /schedules` |
| Contagem de atributos de busca | 100 | `server.limits.max_search_attributes` | Atributos de busca personalizados registrados por namespace |
| Comprimento da chave de atributo de busca | 128 bytes | `server.limits.max_search_attribute_key_length` | Comprimento de uma única chave de atributo de busca no início |
| Tamanho do valor de atributo de busca | 2 KiB | `server.limits.max_search_attribute_value_bytes` | Cada valor de string (e cada elemento de um valor de array) no início |
| Nome de sinal / atualização / consulta | 256 bytes | `server.limits.max_operation_name_length` | Segmento do caminho da URL para nomes de sinal/atualização/consulta |
| Comprimento de `workflow_id` | 128 caracteres | validador do controlador | ID do workflow em `POST /workflows` |
| `workflow_type` / `task_queue` / `business_key` | 255 caracteres | validador do controlador | Campos de string em `POST /workflows` |
| `request_id` | 255 caracteres | validador do controlador | Token de deduplicação em sinais/atualizações/cancelamento/término |
| `reason` | 1.000 caracteres | validador do controlador | Texto do motivo em cancelamento/término/arquivamento |

Use as opções `DW_*` documentadas para os limites configuráveis do PHP
Server 2.x. Os limites de validação do controlador são fixos. O Native Server
3.x aceita as opções de suas [notas de implementação](#native-server-3x).
No native 3.8.0, `DW_MAX_PAYLOAD_BYTES=0` define um teto de zero bytes para
requisições comuns e conclusões de tarefas de workflow, recusando corpos não
vazios. O teto para nomes de operações é fixo em 256 bytes.

Os valores configurados atualmente são publicados em `limits` na resposta de `GET /api/cluster/info`, para que clientes possam descobri-los em tempo de execução:

```json
{
  "limits": {
    "max_payload_bytes": 2097152,
    "max_memo_bytes": 262144,
    "max_search_attributes": 100,
    "max_search_attribute_key_length": 128,
    "max_search_attribute_value_bytes": 2048,
    "max_operation_name_length": 256,
    "max_pending_activities": 2000,
    "max_pending_children": 2000
  }
}
```

Erros de validação são retornados no envelope padrão de erro do plano de controle, com `reason: "validation_failed"` e um mapa `validation_errors` cujas chaves são os campos inválidos (`signal_name`, `update_name`, `query_name`, `search_attributes`, `memo` e assim por diante). Rejeições por tamanho de payload usam `reason: "payload_too_large"` e o código de status `413`.

### Tamanho da conclusão de tarefa de workflow {#workflow-task-completion-size}

No Server nativo 3.6.0 e posteriores, uma requisição que conclui uma tarefa de workflow com comandos (`POST /api/worker/workflow-tasks/{id}/complete` e `POST /api/worker/activity-tasks/{id}/continuation/complete`) pode ter até 16 vezes `max_payload_bytes`: 32 MiB com o padrão de 2 MiB. Ela segue `DW_MAX_PAYLOAD_BYTES` e não tem configuração própria. Os argumentos de cada comando continuam respeitando o limite por payload dentro da conclusão. O Server PHP 2.x e versões nativas anteriores limitam uma conclusão a um limite de payload, como qualquer outra requisição.

Uma conclusão maior é recusada com `413 payload_too_large` e `limit_kind: workflow_task_completion_bytes` antes que algo seja registrado. Reexecutar a tarefa produz os mesmos comandos, então reenviar a conclusão recebe a mesma recusa. Quando o PHP SDK 3.17.0 ou posterior recebe essa recusa tipada, não reenvia a conclusão: o worker falha a execução uma única vez com um comando `fail_workflow` cuja mensagem começa com `Structural limit exceeded: workflow_task_completion_bytes:` e informa os dois tamanhos, e o Server registra a falha com `failure_category = structural_limit`.

O Python SDK 2.17 e o Rust SDK 4.15 tratam a recusa tipada. No Server 3.8.0,
uma conclusão grande demais pode falhar no transporte antes que o worker
receba HTTP 413. No teste com o SDK de Python publicado, `httpx.ReadError`
deixou o workflow pendente em vez de falhar por um limite estrutural. A
aceitação de requisições acima do limite no Server publicado continua aberta
na [correção da resposta do Server](https://github.com/durable-workflow/.github/issues/228#issuecomment-6848969678).
Reduza as conclusões até que esse caminho seja qualificado.

Para manter uma conclusão dentro do limite:

- Divida um fan-out grande em lotes menores distribuídos entre tarefas de workflow.
- Mova trabalho para workflows filhos, ou use continue-as-new.
- Guarde argumentos grandes no armazenamento externo de payloads, para que a conclusão leve referências em vez dos payloads.

#### Planejamento de comandos em Rust {#rust-completion-planning}

O Rust SDK 4.15.0 ainda usa o limite comum por payload como teto agregado do
planejamento de comandos (2 MiB por padrão), antes da capacidade maior de
conclusão do Server. Sem armazenamento externo de payloads no namespace, o
fan-out publicado de 300 × 10 KB é recusado com `external_payload_unavailable`.
O worker encerra e a execução continua pendente. Use lotes menores enquanto a
[correção do planejador agregado do SDK](https://github.com/durable-workflow/sdk-rust/issues/254)
estiver pendente. Esse caminho do SDK ainda não implementa a capacidade maior
do Server.

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

## Controles adicionais do PHP Server publicado {#additional-published-php-controls}

Esta referência cobre o contrato publicado do **PHP Server 2.11.0**, incluindo os controles abaixo. Confira a imagem executada: a versão de instalação escolhida separadamente pode ser anterior. `unset` indica ausência de valor de ambiente; seu efeito depende do controle. Padrões e aliases vêm do [contrato publicado](https://github.com/durable-workflow/server/blob/36d16273604755f3dd0743cab331cc7c62e51d8e/config/dw-contract.php). O build verifica o snapshot versionado em todos os idiomas. Esta referência não altera o conjunto de versões selecionado.

### Admissão HTTP por namespace {#namespace-request-controls}

| Variável | Padrão | Finalidade | Alias antigo |
| --- | --- | --- | --- |
| `DW_NAMESPACE_MAX_REQUESTS_PER_MINUTE` | `unset` | Limite opcional de requisições de controle por minuto e namespace; sem valor não há limite. O Server nativo 3.x se recusa a iniciar quando ela não está vazia; veja [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_MAX_REQUESTS_PER_MINUTE` |
| `DW_NAMESPACE_MAX_CONCURRENT_REQUESTS` | `unset` | Limite opcional de requisições de controle simultâneas por namespace; sem valor não há limite. O Server nativo 3.x se recusa a iniciar quando ela não está vazia; veja [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_MAX_CONCURRENT_REQUESTS` |
| `DW_NAMESPACE_HARD_MAX_REQUESTS_PER_MINUTE` | `unset` | Teto obrigatório de requisições por minuto, incluindo overrides de namespace. O Server nativo 3.x se recusa a iniciar quando ela não está vazia; veja [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_HARD_MAX_REQUESTS_PER_MINUTE` |
| `DW_NAMESPACE_HARD_MAX_CONCURRENT_REQUESTS` | `unset` | Teto obrigatório de requisições simultâneas, incluindo overrides de namespace. O Server nativo 3.x se recusa a iniciar quando ela não está vazia; veja [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_HARD_MAX_CONCURRENT_REQUESTS` |
| `DW_NAMESPACE_ADMISSION_OVERRIDES` | `{}` | Objeto JSON por namespace com overrides de frequência e concorrência de requisições. O Server nativo 3.x se recusa a iniciar, a menos que ela não esteja definida ou seja `{}`; veja [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_ADMISSION_OVERRIDES` |

[Admissão de requisições por namespace](./task-queue-admission.md#namespace-request-admission).

### Cotas de estado durável por namespace {#namespace-durable-controls}

| Variável | Padrão | Finalidade | Alias antigo |
| --- | --- | --- | --- |
| `DW_NAMESPACE_DURABLE_LIMITS` | `{}` | JSON de cotas padrão de linhas duráveis por namespace. Totais e limites pending/open são independentes; tarefas pendentes são linhas ready na fila, com leases ativos limitados à parte. Objeto vazio não limita. O Server nativo 3.x se recusa a iniciar, a menos que ela não esteja definida ou seja `{}`; veja [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_DURABLE_LIMITS` |
| `DW_NAMESPACE_DURABLE_HARD_LIMITS` | `{}` | JSON de tetos obrigatórios de linhas duráveis, incluindo overrides; objeto vazio não acrescenta tetos do operador. O Server nativo 3.x se recusa a iniciar, a menos que ela não esteja definida ou seja `{}`; veja [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_DURABLE_HARD_LIMITS` |
| `DW_NAMESPACE_DURABLE_OVERRIDES` | `{}` | JSON de overrides de cotas duráveis por namespace; tetos obrigatórios continuam valendo. O Server nativo 3.x se recusa a iniciar, a menos que ela não esteja definida ou seja `{}`; veja [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_DURABLE_OVERRIDES` |

[Cotas de estado durável por namespace](./task-queue-admission.md#namespace-durable-state).

### Cotas de payload externo e transporte S3 {#external-payload-quotas-and-s3}

| Variável | Padrão | Finalidade | Alias antigo |
| --- | --- | --- | --- |
| `DW_EXTERNAL_PAYLOAD_COMPLETION_MAX_BYTES` | `unset` | Bytes distintos entre upload slots imutáveis de um completion com lease; sem valor usa `DW_EXTERNAL_PAYLOAD_MAX_BYTES`. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_COMPLETION_MAX_BYTES` |
| `DW_EXTERNAL_PAYLOAD_MAX_BYTES_PER_NAMESPACE` | `unset` | Bytes acumulados de payload externo por namespace. Conta objetos prontos e em andamento; sem valor não limita. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_MAX_BYTES_PER_NAMESPACE` |
| `DW_EXTERNAL_PAYLOAD_MAX_OBJECTS_PER_NAMESPACE` | `unset` | Quantidade de objetos de payload externo por namespace. Conta objetos prontos e em andamento; sem valor não limita. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_MAX_OBJECTS_PER_NAMESPACE` |
| `DW_EXTERNAL_PAYLOAD_HARD_MAX_BYTES_PER_NAMESPACE` | `unset` | Teto obrigatório de bytes acumulados de payload externo por namespace, incluindo overrides. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_HARD_MAX_BYTES_PER_NAMESPACE` |
| `DW_EXTERNAL_PAYLOAD_HARD_MAX_OBJECTS_PER_NAMESPACE` | `unset` | Teto obrigatório de objetos de payload externo por namespace, incluindo overrides. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_HARD_MAX_OBJECTS_PER_NAMESPACE` |
| `DW_EXTERNAL_PAYLOAD_NAMESPACE_OVERRIDES` | `{}` | Objeto JSON por namespace com overrides de cotas `max_bytes` e `max_objects`. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_NAMESPACE_OVERRIDES` |
| `DW_EXTERNAL_PAYLOAD_S3_ACCESS_KEY_ID` | `unset` | Access-key ID opcional do disco compatível com S3 gerenciado pelo runtime; pode ser omitido com workload identity. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_ACCESS_KEY_ID` |
| `DW_EXTERNAL_PAYLOAD_S3_SECRET_ACCESS_KEY` | `unset` | Chave secreta opcional do disco compatível com S3 gerenciado; deve acompanhar o access-key ID. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_SECRET_ACCESS_KEY` |
| `DW_EXTERNAL_PAYLOAD_S3_SESSION_TOKEN` | `unset` | Session token opcional de credenciais temporárias do disco compatível com S3 gerenciado. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_SESSION_TOKEN` |
| `DW_EXTERNAL_PAYLOAD_S3_REGION` | `us-east-1` | Região do disco compatível com S3 gerenciado pelo runtime. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_REGION` |
| `DW_EXTERNAL_PAYLOAD_S3_BUCKET` | `unset` | Bucket do disco compatível com S3 gerenciado pelo runtime. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_BUCKET` |
| `DW_EXTERNAL_PAYLOAD_S3_ENDPOINT` | `unset` | Endpoint HTTPS opcional do serviço compatível com S3 para payloads externos. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_ENDPOINT` |
| `DW_EXTERNAL_PAYLOAD_S3_USE_PATH_STYLE_ENDPOINT` | `false` | Usar endereçamento de bucket path-style no serviço compatível com S3 gerenciado. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_USE_PATH_STYLE_ENDPOINT` |

### Limites de serviço por namespace chamador {#service-caller-namespace-controls}

| Variável | Padrão | Finalidade | Alias antigo |
| --- | --- | --- | --- |
| `DW_SERVICE_BOUNDARY_NAMESPACE_RATE_LIMIT_PER_MINUTE` | `unset` | Limite compartilhado opcional por minuto de chamadas de serviço, agregado por namespace chamador. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_NAMESPACE_RATE_LIMIT_PER_MINUTE` |
| `DW_SERVICE_BOUNDARY_NAMESPACE_MAX_IN_FLIGHT` | `unset` | Limite compartilhado opcional de chamadas de serviço em andamento, agregado por namespace chamador. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_NAMESPACE_MAX_IN_FLIGHT` |
| `DW_SERVICE_BOUNDARY_HARD_RATE_LIMIT_PER_MINUTE` | `unset` | Teto obrigatório por minuto para políticas de fronteira de serviço e namespace chamador. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_HARD_RATE_LIMIT_PER_MINUTE` |
| `DW_SERVICE_BOUNDARY_HARD_MAX_IN_FLIGHT` | `unset` | Teto obrigatório de chamadas em andamento para políticas de fronteira de serviço e namespace chamador. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_HARD_MAX_IN_FLIGHT` |
| `DW_SERVICE_BOUNDARY_NAMESPACE_OVERRIDES` | `{}` | JSON de overrides de frequência e chamadas em andamento por namespace chamador; os tetos continuam valendo. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_NAMESPACE_OVERRIDES` |

### Coordenação, armazenamento e runtime {#coordination-storage-and-runtime-controls}

| Variável | Padrão | Finalidade | Alias antigo |
| --- | --- | --- | --- |
| `DW_OBSERVABILITY_CONTEXT_ENABLED` | `false` | Ativar persistência e entrega limitadas de trace context e descoberta quando sua API e seu schema opcionais estiverem instalados. | - |
| `DW_OBSERVABILITY_BAGGAGE_ALLOWLIST` | `[]` | Lista JSON de chaves baggage permitidas nas origens do run; vazia por padrão. Links nunca carregam baggage. | - |
| `DW_STORAGE_ADMISSION_FILE` | `unset` | Arquivo local opcional de observação de pressão de armazenamento, somente leitura; observações inválidas ou antigas bloqueiam escritas. | - |
| `DW_STORAGE_ADMISSION_SOURCE` | `unset` | Identidade esperada do recurso de armazenamento na observação de admissão. | - |
| `DW_STORAGE_ADMISSION_MAX_AGE_SECONDS` | `15` | Idade máxima da observação de armazenamento em segundos, de 1 a 300. | - |
| `DW_RUNTIME_CREDENTIALS_ENABLED` | `false` | Ativar credenciais bearer de runtime duráveis, vinculadas ao namespace e apoiadas em banco de dados, pela API admin. | `WORKFLOW_SERVER_RUNTIME_CREDENTIALS_ENABLED` |
| `DW_WORKER_LONG_POLL_MAX_CONCURRENT_PER_NAMESPACE` | `unset` | Limite por nó de esperas long-poll workflow/activity de um namespace; não excede o teto global de workers. Recusa se a autoridade de cache compartilhado estiver indisponível. O Server nativo 3.x a ignora; veja [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKER_LONG_POLL_MAX_CONCURRENT_PER_NAMESPACE` |
| `DW_QUERY_TASK_POLL_MAX_CONCURRENT_PER_NAMESPACE` | `unset` | Limite por nó de esperas long-poll query-task de um namespace; não excede o teto global de queries. Recusa se a autoridade de cache compartilhado estiver indisponível. O Server nativo 3.x a ignora; veja [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_QUERY_TASK_POLL_MAX_CONCURRENT_PER_NAMESPACE` |
| `DW_V1_ENABLED` | `false` | Ativar migração e esvaziamento de fila embedded v1 apenas para preservar seu estado deliberadamente; Server independente usa somente v2 por padrão. | `WORKFLOW_V1_ENABLED` |

## Variáveis de infraestrutura de execução {#runtime-infrastructure-variables}

As variáveis de infraestrutura de execução controlam o framework e suas dependências. A auditoria do Server as reconhece para não emitir avisos, mas elas não são controles estáveis da API do Durable Workflow. O Server nativo 3.x lê o grupo Banco de dados, incluindo as configurações TLS abaixo. Ele não tem Redis, cache nem fila do Laravel, grava seus logs na saída de erro padrão e não lê `LOG_CHANNEL` nem `LOG_LEVEL`.

| Grupo | Variáveis | Uso |
| --- | --- | --- |
| Aplicação | `APP_NAME`, `APP_ENV`, `APP_KEY`, `APP_DEBUG`, `APP_URL`, `APP_VERSION`, idioma, fuso horário, manutenção e criptografia | Identidade e comportamento de inicialização da aplicação Laravel. |
| Logs | `LOG_CHANNEL`, `LOG_LEVEL`, `LOG_STDERR_FORMATTER`, opções de stack, daily, Slack e Papertrail | Destinos, formatação e retenção dos logs do Laravel. |
| Banco de dados | `DB_CONNECTION`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, `DB_SOCKET`, `DB_URL`, `DB_SSLMODE` (`DB_SSL_MODE`), `DB_SSLROOTCERT` (`DB_SSL_ROOT_CERT`), `MYSQL_ATTR_SSL_CA`, conjunto de caracteres, collation e chaves estrangeiras | Armazenamento SQL de estado das tabelas de workflows, namespaces, workers e projeções. Veja [TLS do banco de dados](#database-tls). |
| Redis/cache/fila | `REDIS_*`, `QUEUE_CONNECTION`, `QUEUE_FAILED_DRIVER`, `CACHE_STORE`, `CACHE_PREFIX`, `SESSION_*` | Workers de fila, bloqueios de cache, sinais de long polling e suporte web e de sessões. |
| Arquivos/e-mail/difusão | `FILESYSTEM_DISK`, `MAIL_*`, `BROADCAST_*`, `PUSHER_*`, `AWS_*` | Integrações do framework usadas por recursos específicos de cada implantação. |
| Compilação/execução | `MYSQL_VERSION`, `REDIS_VERSION`, `PHP_CLI_SERVER_WORKERS`, `VITE_APP_NAME`, `BCRYPT_ROUNDS` | Imagens do Docker Compose e comportamento de execução do framework. |

## TLS do banco de dados {#database-tls}

O Server nativo 3.x resolve essas configurações como o PHP 2.x: mesmas entradas, aliases,
nomes de modo e recusas. Ele tem um único processo do Server para configurar, além de
qualquer comando `schema-upgrade` ou de migração executado contra o mesmo banco de dados.
No PHP 2.x, use as mesmas configurações TLS no servidor API, worker de fila, job de
inicialização/migração e agendador. O padrão do PostgreSQL é `prefer`;
MySQL/MariaDB mantêm os padrões de conexão quando nenhum modo é definido.
Nenhum desses padrões garante uma conexão criptografada e autenticada.

| `DB_SSLMODE` | PostgreSQL | MySQL / MariaDB |
| --- | --- | --- |
| `disable` | Sem TLS. | Sem TLS; opções TLS conflitantes são recusadas. |
| `allow`, `prefer` | TLS oportunista sem garantia de criptografia ou identidade. | Recusados. |
| `require` | Criptografia obrigatória. | Criptografia obrigatória com mysqlnd e OpenSSL. |
| `verify-ca` | Criptografia e cadeia de certificados confiável obrigatórias. | Recusado: PDO mysqlnd não verifica apenas a cadeia independentemente do hostname. |
| `verify-full` | Criptografia, cadeia confiável e hostname correspondente obrigatórios. | Criptografia, cadeia confiável e hostname correspondente obrigatórios. |

`DB_SSL_MODE` é um alias de `DB_SSLMODE`; `DB_SSL_ROOT_CERT`, de
`DB_SSLROOTCERT`. Para verificar certificados, monte um arquivo CA legível no
caminho configurado em **todos os papéis**, inclusive migrações.
`MYSQL_ATTR_SSL_CA` pode fornecer a CA para `verify-full` explícito em
MySQL/MariaDB. Conflitos entre configurações canônicas, aliases ou URL impedem
a inicialização. TLS obrigatório exige um hostname TCP explícito; sockets Unix
são recusados. Modos TLS explícitos de MySQL/MariaDB precisam de PDO MySQL com
mysqlnd e OpenSSL.

```dotenv
DB_CONNECTION=pgsql
DB_HOST=database.example.com
DB_SSLMODE=verify-full
DB_SSLROOTCERT=/run/database-ca/ca.pem
```

Use o hostname DNS do certificado. No Helm, configure `externalDatabase.sslMode`
e `externalDatabase.tls.existingSecret` / `caKey`. Crie o Secret antes da instalação
ou atualização; o chart monta sua CA nos quatro papéis, inclusive no hook de
inicialização. Reinicie os papéis persistentes após alterar o ambiente: a
configuração é armazenada em cache na inicialização.

## Logs dos contêineres {#container-logs}

O Server nativo 3.x sempre grava seus logs na saída de erro padrão. No PHP 2.x, defina
`LOG_CHANNEL=stderr` nos contêineres da API, dos workers e do agendador
para que `docker logs` ou `kubectl logs` colete os logs da aplicação. Defina-o
explicitamente nas versões existentes. Use `LOG_LEVEL` para escolher a gravidade
mínima. Para JSON com um registro por linha, adicione:

```dotenv
LOG_STDERR_FORMATTER="Monolog\Formatter\JsonFormatter"
```

Reinicie os processos persistentes após alterar essas opções, pois a configuração
é armazenada em cache na inicialização. Um canal de arquivo escolhido
explicitamente precisa de armazenamento e coleta próprios; o Kubernetes não
coleta `storage/logs/laravel.log` automaticamente. `DW_LOG_FORMAT` não é uma opção compatível.

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
