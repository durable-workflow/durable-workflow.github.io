---
sidebar_position: 13
title: Referência da API do operador Waterline
description: Contratos tipados da API do Waterline para listas do painel, detalhes da execução selecionada, exportação de histórico, agendamentos, visualizações salvas, preferências e ações do operador.
tags:
  - Waterline
  - observability
  - API
  - reference
keywords:
  - referência da API Waterline
  - detalhes da execução selecionada
  - exportação de histórico
  - contrato de ações disponíveis
  - ações do operador de workflow
---

# Referência da API do operador Waterline {#waterline-operator-api-reference}

O Waterline é a interface de operação do estado durável tanto em Laravel
embutido quanto em implantações do servidor independente. A interface visual
usa a mesma API HTTP+JSON documentada aqui, permitindo que scripts, painéis
e agentes leiam fatos duráveis de workflows sem extrair dados do HTML.

Use esta referência quando precisar de evidências operacionais tipadas:
detalhes da execução selecionada, exportação de histórico, ações disponíveis,
opções de comandos, visualizações salvas, preferências e visibilidade de
agendamentos. Use [Monitoramento](./monitoring.md) para a divisão conceitual
entre estado durável do Waterline e telemetria de workers/runtime.

## Instalação {#installation}

Instale o Waterline na mesma aplicação Laravel embutida que instala o pacote Workflow:

```bash
composer require \
  %%artifact.waterlineComposerPackage%% \
  %%artifact.workflowComposerPackage%%
php artisan waterline:install
```

As versões fixadas geradas selecionam releases estáveis 2.x do Waterline
e do Workflow. O modo embutido lê diretamente o estado de workflows da
aplicação e dispensa SDK de serviço. Após atualizar o Waterline, publique os assets atuais:

```bash
composer update durable-workflow/waterline
php artisan waterline:publish
```

Para observação no modo de serviço dentro de um host Laravel, instale também o SDK PHP:

```bash
composer require %%artifact.phpSdkComposerPackage%%
```

A imagem autossuficiente do serviço Waterline já inclui esse SDK.
Suas entradas de conexão, autenticação e persistência estão descritas em
[Monitoramento](./monitoring.md#waterline-service).

### Idioma da interface {#interface-language}

O Waterline oferece inglês, português brasileiro, chinês simplificado,
francês, alemão, japonês, espanhol e ucraniano nos modos embutido e de serviço.
Defina o idioma no ambiente da aplicação Laravel ou do contêiner de serviço:

```dotenv
WATERLINE_LOCALE=es
```

| Idioma | Configuração |
| --- | --- |
| Inglês | `en` |
| Português brasileiro | `pt-BR` |
| Chinês simplificado | `zh-Hans` |
| Francês | `fr` |
| Alemão | `de` |
| Japonês | `ja` |
| Espanhol | `es` |
| Ucraniano | `uk` |

Aliases regionais de espanhol, como `es-ES`, `es-MX` e `es-419`, selecionam
a interface espanhola compartilhada. `pt`, `pt_br` e variantes de maiúsculas
e minúsculas selecionam português brasileiro (`pt-BR`). Outras regiões de
português usam inglês como alternativa. Contagens, rótulos de gráficos e
durações relativas seguem o idioma escolhido.
Use `zh-Hans` para chinês simplificado. `zh`, `zh-CN`, `zh-SG` e tags que
explicitam a escrita simplificada, como `zh-Hans-CN`, selecionam a mesma
interface. Sublinhados e variantes de maiúsculas/minúsculas são aceitos.
Tags de chinês tradicional, como `zh-Hant`, `zh-TW` e `zh-HK`, usam inglês.
Use `ja` para japonês. Aliases regionais como `ja-JP`, sublinhados e
variantes de maiúsculas/minúsculas selecionam a mesma interface japonesa.
Use `fr` para francês. Aliases regionais como `fr-FR` e `fr-CA`, sublinhados
e variantes de maiúsculas/minúsculas selecionam a interface francesa compartilhada.
Use `de` para alemão. Aliases regionais como `de-DE`, `de-AT` e `de-CH`,
sublinhados e variantes de maiúsculas/minúsculas selecionam a interface alemã compartilhada.

Inglês é o padrão e a alternativa. Aplicações embutidas também podem definir
`waterline.locale` na configuração resolvida. Reconstrua a configuração
Laravel em cache após alterar essa opção. O Waterline preserva o idioma
da aplicação hospedeira, nomes de workflows, identificadores, payloads e
texto original das exceções. Os nomes dos campos JSON da API e os estados
de máquina mantêm seus valores existentes.

## Limite de implantação {#deployment-boundary}

O Waterline tem dois adaptadores de backend:

- O modo embutido executa dentro do host Laravel e lê em processo
  o estado durável do pacote Workflow.
- O modo de serviço executa a imagem publicada do Waterline e lê um
  namespace do servidor independente por `durable-workflow/sdk` e pela API pública do servidor.

Ambos expõem as rotas Waterline documentadas nesta página. O modo de
serviço converte essas rotas para os contratos correspondentes do servidor:

| Família de rotas Waterline | Contrato do servidor independente usado pelo modo de serviço |
| --- | --- |
| `GET /waterline/api/v2/health` | Saúde do servidor, registro de workers e visibilidade de filas de tarefas. |
| `GET /waterline/api/stats` | Painel de operação e instantâneo de métricas limitados ao namespace. |
| Listas de fluxos, detalhes da execução selecionada e exportação de histórico | Listagem, detalhes, execuções, histórico e diagnósticos de workflows da [Referência da API do Server](./polyglot/server-api-reference.md). |
| Ações de sinal, atualização, consulta, cancelamento, término forçado, reparo e arquivamento | Os contratos correspondentes de comandos e reparo de workflows do servidor. |
| Rotas em `/waterline/api/v2/schedules` | Contratos de listagem, detalhes, histórico e mutação de agendamentos do servidor. |

As interfaces da API do servidor, CLI e SDKs continuam disponíveis diretamente
quando o Waterline está implantado. Não presuma visibilidade entre modos
ou namespaces: execuções permanecem legíveis e operáveis pelo runtime
e namespace aos quais pertencem. [Modos de implantação](./polyglot/deployment-modes.md)
define esse limite compartilhado do produto.

## Caminho base e escopo {#base-path-and-scope}

O Waterline é montado no caminho base configurado na aplicação Laravel.
Os exemplos usam `/waterline`; se sua aplicação publicar Waterline sob
outro prefixo, mantenha os mesmos sufixos `/api/...`.

Quando `WATERLINE_NAMESPACE` está configurado, todas as rotas de listagem,
detalhes, agendamentos e ações operacionais são limitadas ao namespace.
Leituras e comandos entre namespaces retornam semântica de não encontrado,
em vez de revelar o estado de workflows de outro namespace.

```bash
curl -sS "$APP_URL/waterline/api/instances/order-1001" \
  -H "Accept: application/json" | jq '.status, .run_id, .actionability'
```

## Autenticação {#authentication}

Cada controlador de interface visual e API JSON passa pela verificação de
acesso do Waterline. No modo embutido, o host Laravel define essa verificação
e decide quais guards, middlewares de rota, gates, políticas, sessões
SSO/OIDC/SAML, grupos de diretório, tokens de serviço e limites de taxa se aplicam.

O grupo atual da API JSON de operação exclui o middleware CSRF do Laravel
para permitir que o host aplique um limite de sessão ou token de serviço
consistentemente a leituras e comandos. O host continua responsável por
autenticar essas requisições e documentar as proteções CSRF de sessão de
navegador que adicionar ao redor da API.

A imagem autossuficiente do serviço não tem usuários de uma aplicação
hospedeira. Coloque-a atrás de um proxy reverso com autenticação ou em
uma interface privada antes de definir `WATERLINE_ALLOW_UNAUTHENTICATED=true`;
essa configuração delega a verificação de entrada do Waterline à implantação
ao redor. Separadamente, `WATERLINE_SERVER_TOKEN` autentica as chamadas do
SDK PHP do Waterline ao servidor independente. Nunca exponha essa credencial
do servidor ao navegador.

`WATERLINE_ACCESS_MODE=read_only` bloqueia localmente rotas de mutação.
`operator` as habilita, mas o servidor conectado ainda aplica sua própria
autorização de função do token e namespace. Consulte
[Monitoramento](./monitoring.md#waterline-service) para o exemplo de
implantação e os dois limites de autenticação.

## Painel e saúde {#dashboard-and-health}

| Método | Caminho | Finalidade |
| --- | --- | --- |
| `GET` | `/waterline/api/stats` | Totais do painel, contadores de pendências, política de reparo, métricas operacionais e dados de tendências da frota. |
| `GET` | `/waterline/api/v2/health` | Saúde do pacote/runtime Waterline e prontidão da fonte de dados v2. |

`/waterline/api/stats` é a interface de resumo do painel. Trate
`operator_metrics` como diagnósticos JSON pertencentes ao Waterline, não
como interface de coleta Prometheus. Use métricas dos SDKs de workers para
latência do runtime e telemetria personalizada da aplicação.

Os [Limites operacionais do operador](./operator-operating-envelope.md)
definem como interpretar esses diagnósticos durante implantações e
resposta a incidentes. Em particular:

| Família de campos | Significado |
| --- | --- |
| `operator_metrics.backlog.*` | Contagens de trabalho durável executável, atrasado, sob lease, não saudável, que exige reparo, com falha de reserva e bloqueado por compatibilidade, além dos fatos de fluxo de fila `tasks_added_last_minute` e `tasks_dispatched_last_minute` de toda a frota. |
| `operator_metrics.matching_role.*` | Contrato local de correspondência/despacho do nó para o processo que atende à requisição: `queue_wake_enabled`, `shape` da implantação, `task_dispatch_mode`, `partition_primitives` congeladas e `backpressure_model` atual. |
| `operator_metrics.repair.*` | Impacto das varreduras do laço de reparo, incluindo candidatos selecionados, idade dos candidatos e pressão de varredura. |
| `operator_metrics.projections.*` | Contagens de divergência de projeções para resumos de execução, esperas, linhas do tempo, temporizadores e linhagem. |
| `operator_metrics.command_contracts.*` | Instantâneos legados de contratos WorkflowStarted que ainda precisam ser preenchidos. |
| `operator_metrics.history.*` | Pressão de tamanho do histórico e contagem de eventos, além de recomendações de continue-as-new. |
| `queue_visibility.available`, `queue_visibility.reason` | Se a visibilidade de filas limitada ao namespace está disponível nesta aplicação hospedeira e o motivo quando não está. |
| `queue_visibility.task_queues[].stats.*` | Pendências locais da fila, idade das pendências, contagens de pollers, tarefas de workflow/atividade prontas versus sob lease e fatos de fluxo por fila `tasks_added_last_minute` / `tasks_dispatched_last_minute`. |
| `queue_visibility.task_queues[].repair.*` | Pressão de reparo local da fila, incluindo candidatos, falhas de despacho, leases expiradas, contagens de despacho atrasado e a maior idade de cada condição. |
| `coordination_alerts[]` | Avisos e erros agregados das verificações de saúde, além de riscos de visibilidade das filas, como pendências sem pollers, pollers desatualizados ou candidatos antigos a reparo. |
| `checks[]`, `categories.*` | Verificações de saúde v2 bloqueantes ou consultivas, com `category = correctness \| acceleration` por verificação e agregações de categoria usadas pelo Waterline na interface de workers. |
| `engine_source`, `readiness_contract` | Se o Waterline está usando ativamente a ponte de operação v2 e qual contrato de prontidão rege esse estado. |

Os campos de fluxo de fila respondem a uma pergunta específica: a entrada
durável na fila chega mais rápido que o despacho pelo sistema?
`tasks_added_last_minute` conta linhas duráveis distintas de tarefas criadas
nos últimos 60 segundos, e `tasks_dispatched_last_minute` conta linhas
duráveis distintas cujo último despacho bem-sucedido ocorreu na mesma janela.

Use os totais de fluxo com as rotas de visibilidade de filas do servidor,
e não isoladamente. O Waterline informa se a entrada durável supera o
despacho, enquanto `/api/task-queues` e `/api/task-queues/{taskQueue}`
informam se a fila sobrecarregada está `saturated`, intencionalmente
`throttled`, `no_active_workers` ou com falta de pollers saudáveis ou slots por outro motivo.

`GET /waterline/api/v2/health` expõe as mesmas evidências locais de fila
sem sair da interface Waterline. Scripts e painéis que precisam do estado
atual de filas de um namespace devem ler `queue_visibility.task_queues[]`
para estatísticas por fila e `coordination_alerts[]` para o resumo das
condições de fila ou saúde que precisam de atenção do operador.

Os campos `matching_role` respondem a outra pergunta: qual topologia de
correspondência este nó atende atualmente? `shape` distingue `in_worker`
de `dedicated`, `partition_primitives` fixa os eixos de roteamento em
`connection`/`queue`/`compatibility`/`namespace`, e `backpressure_model`
atualmente informa `lease_ownership`. Trate esse bloco como local ao
processo. Em implantações com topologias mistas, compare-o entre nós antes
de presumir que diferenças de pendências ou polls indicam problemas de workers.

`GET /waterline/api/v2/health` usa a mesma distinção: `error` bloqueia,
`warning` é consultivo e `ok` significa que a ponte atual de operação v2 está pronta.

## Visualizações de listagem {#list-views}

As listagens são agrupadas por status durável:

| Método | Caminho | Categoria |
| --- | --- | --- |
| `GET` | `/waterline/api/flows/running` | Execuções abertas ou ativamente bloqueadas. |
| `GET` | `/waterline/api/flows/completed` | Execuções encerradas com sucesso, incluindo execuções continuadas com `closed_reason = continued`. |
| `GET` | `/waterline/api/flows/failed` | Execuções com falha. |
| `GET` | `/waterline/api/flows/cancelled` | Execuções canceladas. |
| `GET` | `/waterline/api/flows/terminated` | Execuções terminadas à força. |

As linhas são resumos operacionais compactos. Os campos estáveis incluem
identidade de workflow (`id`, `instance_id`, `run_id`, `workflow_type`),
estado (`status`, `closed_reason`, `archived_at`), informações de tempo,
`history_event_count`, `history_size_bytes`, `continue_as_new_recommended`
e indicadores de reparo/ações disponíveis, como `repair_blocked`.

## Detalhes da execução selecionada {#selected-run-detail}

O Waterline tem dois modos de endereçamento:

| Método | Caminho | Finalidade |
| --- | --- | --- |
| `GET` | `/waterline/api/instances/{instanceId}` | Execução atual selecionada de uma instância de workflow. |
| `GET` | `/waterline/api/instances/{instanceId}/runs/{runId}` | Execução selecionada explicitamente. |
| `GET` | `/waterline/api/flows/{id}` | Busca legada/de detalhes por linha Waterline ou ID de execução. |

Os detalhes da execução selecionada são o contrato JSON normativo para
telas de operação. Contêm estado durável e diagnósticos derivados para:

| Família de campos | Significado |
| --- | --- |
| `activities`, `timers`, `waits`, `children` | Estado atual e histórico de esperas reconstruído primeiro pelo histórico tipado. |
| `signals`, `updates`, `declared_signals`, `declared_updates`, `declared_queries` | Linhas do ciclo de vida de comandos e destinos do contrato do workflow que podem ser carregados. |
| `timeline` | Eventos duráveis e entradas diagnósticas ordenados. |
| `exceptions`, `logs` | Fatos de falha e contexto de replay/depuração. |
| `can_signal`, `can_update`, `can_query`, `can_cancel`, `can_terminate`, `can_archive` | Opções da interface e automação para a execução selecionada. |
| `actionability` | Contrato versionado de reparo e evidências descrito abaixo. |

A automação deve preferir os detalhes da execução selecionada a capturas
de tela. Uma captura mostra o que o operador viu; os detalhes explicam
por que um workflow pode ou não ser reparado, consultado, cancelado,
arquivado ou reproduzido por replay.

## Exportação de histórico {#history-export}

Exportações de histórico são pacotes de replay/depuração. Elas incluem
intencionalmente payloads armazenados de workflow, comandos, atividades,
atualizações, tarefas, falhas e histórico para permitir reproduzir ou
arquivar a execução selecionada.

| Método | Caminho | Finalidade |
| --- | --- | --- |
| `GET` | `/waterline/api/instances/{instanceId}/history-export` | Exportar a execução atual selecionada de uma instância. |
| `GET` | `/waterline/api/instances/{instanceId}/runs/{runId}/history-export` | Exportar uma execução explícita. |
| `GET` | `/waterline/api/flows/{id}/history-export` | Exportação legada/de detalhes por linha Waterline ou ID de execução. |

Se uma exportação puder sair de um ambiente protegido, configure primeiro
o componente de ocultação de dados da exportação de histórico. Ferramentas
posteriores devem preservar os metadados `redaction` para que os revisores
saibam qual política moldou o artefato.

## Contrato de ações disponíveis {#actionability-contract}

O Waterline anota linhas de listagem, respostas de detalhes da execução
selecionada, entradas da linha do tempo e exportações de histórico com
o contrato versionado de ações disponíveis:

```json
{
  "actionability_contract": {
    "schema": "waterline.actionability",
    "version": 1
  }
}
```

O identificador do contrato é `actionability_contract.schema = waterline.actionability`
com `actionability_contract.version = 1`.

O `actionability` no nível da execução informa se a execução selecionada pode ser reparada:

| Campo | Significado |
| --- | --- |
| `repair_state` | Um de `repairable`, `blocked`, `not_needed` ou `unknown`. |
| `repairable` | Atalho booleano para `repair_state = repairable`. |
| `blocked_reason` | Código estável do motivo quando `repair_state = blocked`. |
| `status_bucket` | Categoria do Waterline que definiu a decisão no nível da execução. |
| `closed_reason` | Motivo durável de encerramento quando a execução está fechada. |
| `task_problem` | Se o Waterline identificou um problema de tarefa na execução. |
| `diagnostic_only_evidence` | Verdadeiro quando ao menos uma linha é informativa, mas não é fonte para retomada. |

Linhas de evidência em `activities`, `waits`, `timers`, `exceptions`, `logs`
e entradas da linha do tempo/exportação podem incluir seu próprio bloco `actionability`:

| Campo | Significado |
| --- | --- |
| `state` | `actionable` quando a linha é uma fonte válida de reparo; caso contrário, `diagnostic_only`. |
| `repair_source` | Verdadeiro somente para linhas sustentadas por uma fonte normativa reparável. |
| `diagnostic_only` | Verdadeiro quando a linha não deve ser usada como fonte para retomada. |
| `history_authority` | Fonte normativa, como `typed_history`, `mutable_open_fallback`, `failure_row_fallback` ou `unsupported_terminal_without_history`. |
| `history_unsupported_reason` | Código estável do motivo de ausência de suporte ao histórico alternativo. |

Agentes e scripts devem condicionar decisões de reparo/retomada a
`actionability.repair_state`, `actionability.repairable` e ao
`actionability.repair_source` de cada linha. Uma linha com
`diagnostic_only = true` é evidência, não permissão para replay ou retomada.

## Ações do operador {#operator-actions}

Ações do Waterline são comandos duráveis emitidos pelo contrato da execução
selecionada. Rotas de instância usam a execução atual; rotas de execução
rejeitam explicitamente destinos obsoletos ou de outra execução.

| Método | Caminho | Finalidade |
| --- | --- | --- |
| `POST` | `/waterline/api/instances/{instanceId}/queries/{query}` | Executar uma consulta declarada na execução atual. |
| `POST` | `/waterline/api/instances/{instanceId}/signals/{signal}` | Enviar um sinal à execução atual. |
| `POST` | `/waterline/api/instances/{instanceId}/updates/{update}` | Enviar uma atualização à execução atual. |
| `POST` | `/waterline/api/instances/{instanceId}/repair` | Despachar uma passagem de reparo para a execução atual quando o contrato de ações disponíveis permitir. |
| `POST` | `/waterline/api/instances/{instanceId}/cancel` | Solicitar cancelamento da execução atual. |
| `POST` | `/waterline/api/instances/{instanceId}/terminate` | Terminar à força a execução atual. |
| `POST` | `/waterline/api/instances/{instanceId}/archive` | Arquivar a execução encerrada selecionada. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/queries/{query}` | Executar uma consulta na execução selecionada explícita. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/signals/{signal}` | Enviar um sinal somente se a execução selecionada for a atual. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/updates/{update}` | Enviar uma atualização somente se a execução selecionada for a atual. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/repair` | Reparar uma execução selecionada explícita. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/cancel` | Cancelar somente se a execução selecionada for a atual. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/terminate` | Terminar à força somente se a execução selecionada for a atual. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/archive` | Arquivar a execução encerrada selecionada. |

Sinais, atualizações e consultas aceitam `arguments` em JSON. Argumentos
inválidos retornam falhas de validação por campo. Bloqueios de replay
retornam `409 Conflict` com motivo estável, como
`workflow_definition_unavailable`, em vez de tentar executar sem garantias.

## Inspeção de atualizações {#update-inspection}

| Método | Caminho | Finalidade |
| --- | --- | --- |
| `GET` | `/waterline/api/instances/{instanceId}/updates/{updateId}` | Inspecionar uma linha do ciclo de vida de atualização da execução atual. |
| `GET` | `/waterline/api/instances/{instanceId}/runs/{runId}/updates/{updateId}` | Inspecionar uma linha do ciclo de vida de atualização de uma execução explícita. |
| `GET` | `/waterline/api/flows/{id}/updates/{updateId}` | Busca legada/de detalhes de atualização. |

Use a inspeção quando uma interface ou agente precisar explicar se uma
atualização foi aceita, aplicada, concluída, rejeitada, excedeu o tempo
de espera ou está bloqueada por compatibilidade de replay.

## Agendamentos {#schedules}

As rotas de agendamento do Waterline são rotas v2 de visibilidade e ações operacionais:

| Método | Caminho | Finalidade |
| --- | --- | --- |
| `GET` | `/waterline/api/v2/schedules` | Listar agendamentos visíveis no escopo atual. |
| `GET` | `/waterline/api/v2/schedules/{scheduleId}` | Descrever um agendamento. |
| `GET` | `/waterline/api/v2/schedules/{scheduleId}/history` | Ler os eventos de auditoria do ciclo de vida do agendamento. |
| `POST` | `/waterline/api/v2/schedules/{scheduleId}/pause` | Pausar disparos futuros. |
| `POST` | `/waterline/api/v2/schedules/{scheduleId}/resume` | Retomar um agendamento pausado. |
| `POST` | `/waterline/api/v2/schedules/{scheduleId}/trigger` | Provocar um disparo imediato. |
| `POST` | `/waterline/api/v2/schedules/{scheduleId}/backfill` | Preencher retroativamente uma janela de tempo. |
| `DELETE` | `/waterline/api/v2/schedules/{scheduleId}` | Excluir um agendamento. |

Um agendamento é identificado pelo namespace e pelo `schedule_id`. O mesmo
`schedule_id` pode existir em mais de um namespace. Toda rota de um agendamento
específico aceita um parâmetro `namespace` opcional na query string ou no corpo
da requisição:

- Um Waterline limitado a um namespace atua somente no próprio namespace. Isso
  inclui o Waterline embutido com `WATERLINE_NAMESPACE` definido e toda
  implantação no modo de serviço. Uma requisição para outro namespace retorna
  `404`.
- Um Waterline embutido para todo o cluster atua no namespace solicitado. Sem
  `namespace`, um `schedule_id` que existe em mais de um namespace retorna `409`
  com o motivo `schedule_namespace_required`. Nada é alterado.

```bash
curl -sS -X POST \
  "$APP_URL/waterline/api/v2/schedules/nightly-invoice-sync/pause?namespace=billing" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"note": "Supplier maintenance"}' | jq '.status, .note'
```

### Linhas de agendamento {#schedule-rows}

A resposta da listagem é paginada com `data`, `current_page`, `last_page`,
`per_page`, `total` e `operator_scope`. Cada linha em `data` tem os mesmos
campos nos modos embutido e de serviço:

| Campo | Significado |
| --- | --- |
| `schedule_id` | O ID do agendamento. Envie-o com `namespace` para toda rota de um agendamento específico. |
| `id` | O mesmo valor de `schedule_id`, mantido para clientes mais antigos. |
| `namespace` | O namespace do agendamento. |
| `workflow_type`, `workflow_class` | O workflow que o agendamento inicia. Qualquer um dos dois pode ser `null`. |
| `status`, `paused` | `active`, `paused` ou `deleted`, e se o agendamento está pausado. |
| `note` | A nota do operador, ou `null`. |
| `spec` | A cadência: `cron_expressions` (strings cron), `intervals` (objetos com durações ISO 8601 `every` e `offset` opcional) e `timezone`. |
| `overlap_policy` | `skip`, `buffer_one`, `buffer_all`, `cancel_other`, `terminate_other` ou `allow_all`. |
| `next_fire_at`, `last_fired_at` | Timestamps ISO 8601, ou `null`. |
| `last_outcome` | O resultado do disparo registrado mais recente, ou `null` quando nenhum foi registrado. Contém `outcome` (por exemplo, `scheduled`, `drained`, `backfilled`, `skipped` ou `failed`), `at`, `reason`, `workflow_id` e `run_id`. |
| `fires_count`, `failures_count`, `skipped_trigger_count`, `remaining_actions` | Contadores, ou `null` quando o backend não informa o contador. |
| `search_attributes` | Os atributos de busca do agendamento, ou `null`. |
| `created_at`, `updated_at` | Timestamps ISO 8601. |

Uma linha com `last_fired_at` e sem `last_outcome` indica que o backend
informou o horário do disparo sem o resultado.

As linhas da listagem e as respostas de detalhes, `pause` e `resume` também
incluem `action`, `max_runs`, `jitter_seconds`, `paused_at`,
`last_skip_reason`, `last_skipped_at`, `latest_workflow_instance_id`,
`buffered_actions`, `memo` e `recent_actions`. Cada ação recente tem
`outcome`, `fired_at`, `reason`, `workflow_id`, `run_id` e `occurrence_time`.
`latest_instance_id` repete `latest_workflow_instance_id` para clientes mais
antigos. Um `spec` mantém, depois dos campos de cadência, quaisquer outras
chaves que o backend armazenou.

### Resultados de disparo e preenchimento retroativo {#trigger-and-backfill-results}

`trigger` aceita um `overlap_policy` opcional. A rota retorna `schedule_id`,
`namespace`, `outcome` (`triggered`, `buffered`, `buffer_full` ou `skipped`),
`triggered`, `workflow_id`, `run_id` e `reason`. `triggered` é `true` somente
quando um workflow foi iniciado. `instance_id` repete `workflow_id` para
clientes mais antigos.

`backfill` exige os timestamps ISO 8601 `from` e `to` e aceita um
`overlap_policy` opcional. A rota retorna `schedule_id`, `namespace`,
`fires_attempted`, `started_count`, `skipped_count`, `failed_count` e
`results`. Cada resultado tem `fire_time`, `workflow_id`, `outcome` (`started`,
`skipped` ou `failed`) e `reason`. Para clientes mais antigos, cada resultado
também repete `schedule_id`, e `cron_time`, `instance_id` e `error` repetem
`fire_time`, `workflow_id` e o `reason` de um resultado com falha. `backfill`
recusa com `422` e o motivo `invalid_time_range` uma janela cujo fim não é
posterior ao início.

As duas rotas recusam um `overlap_policy` desconhecido com `422` e o motivo
`invalid_overlap_policy`.

## Visualizações salvas e preferências {#saved-views-and-preferences}

Visualizações salvas e preferências são configurações operacionais da
interface, não histórico de workflows. Ainda assim, são úteis para
procedimentos estáveis, pois permitem compartilhar filtros e disposição
de tabelas exatos usados durante um incidente.

| Método | Caminho | Finalidade |
| --- | --- | --- |
| `GET` | `/waterline/api/saved-views` | Listar visualizações operacionais salvas. |
| `POST` | `/waterline/api/saved-views` | Criar uma visualização salva. |
| `GET` | `/waterline/api/saved-views/{view}` | Ler uma visualização salva. |
| `PUT` | `/waterline/api/saved-views/{view}` | Atualizar uma visualização salva. |
| `DELETE` | `/waterline/api/saved-views/{view}` | Excluir uma visualização salva. |
| `GET` | `/waterline/api/preferences/{surface}` | Ler preferências de interface de uma área. |
| `PUT` | `/waterline/api/preferences/{surface}` | Atualizar preferências de interface de uma área. |

Não trate nomes de visualizações salvas ou payloads de preferências como
fatos duráveis de workflow. Para evidências, cite detalhes da execução
selecionada ou exportação de histórico.

## Contrato de erros {#error-contract}

O Waterline usa códigos de status HTTP comuns e detalhes de erro JSON:

| Status | Significado |
| --- | --- |
| `400` | Requisição malformada ou payload de ação não suportado. |
| `404` | Instância de workflow, execução, atualização, agendamento, visualização salva ou área de preferências não encontrada no namespace atual. |
| `409` | A execução selecionada não pode realizar a ação, muitas vezes por ser histórica, encerrada, bloqueada para replay ou com definição indisponível. Uma requisição de agendamento para todo o cluster também retorna `409` quando seu `schedule_id` precisa de um `namespace`. |
| `422` | Falha de validação; a resposta inclui erros por campo. |
| `500` | Falha inesperada da aplicação. |

A automação deve decidir pelo status e por campos estáveis, como
`blocked_reason`, `query_blocked_reason`, `outcome`, `reason` e valores
de `actionability`. Não interprete o texto de notificações ou rótulos
de botões como contrato.

## Veja também {#see-also}

- [Monitoramento](./monitoring.md)
- [Falhas e recuperação](./failures-and-recovery.md)
- [Consultas](./features/queries.md)
- [Cancelar e terminar](./features/cancel-and-terminate.md)
- [Contrato de ferramentas para agentes](./agent-tooling-contract.md)
