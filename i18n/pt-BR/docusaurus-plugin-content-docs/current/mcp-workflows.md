---
sidebar_position: 9.2
title: Interface MCP para workflows
description: Use o servidor MCP do aplicativo de exemplo como interface de referência de workflows para clientes de IA, com descoberta, início, diagnóstico, reparo, resultados e histórico.
tags:
  - ai
  - agents
  - mcp
  - sample-app
keywords:
  - durable workflow mcp
  - ferramentas mcp para workflows
  - servidor mcp do aplicativo de exemplo
  - descoberta de workflows por clientes de ia
---

# Interface MCP para workflows {#mcp-workflow-surface}

O aplicativo de exemplo expõe o servidor MCP de referência do Durable Workflow v2 em:

```text
/mcp/workflows
```

Use-o quando um cliente de IA precisar inspecionar ou operar uma aplicação
local de workflows sem extrair dados do Waterline nem adivinhar detalhes
internos do Laravel. O endpoint é uma interface estruturada de desenvolvimento:
identifica os workflows que a aplicação escolhe expor, descreve requisitos de
credenciais, inicia execuções, consulta resultados e retorna fatos limitados do histórico.

## Contrato do servidor {#server-contract}

O aplicativo de exemplo registra o servidor em `routes/ai.php` e configura
as chaves de workflows expostos em `config/workflow_mcp.php`. Trate essa
configuração como a lista pública de permissões para clientes de IA.
Um workflow só pode ser operado por MCP quando estiver listado com metadados
suficientes para que o cliente decida se pode executá-lo com segurança.

Cada workflow configurado deve descrever:

- uma chave estável de workflow
- a classe de workflow associada à chave
- argumentos obrigatórios e opcionais
- requisitos de credenciais
- se é seguro para verificações básicas locais sem credenciais
- expectativas de saída e histórico que um agente possa citar

Mantenha segredos fora das descrições das ferramentas. Informe que um
workflow exige uma credencial, sem incluir seu valor ou detalhes da conta.

## Ferramentas {#tools}

O servidor de referência expõe seis ferramentas de workflow:

| Ferramenta | Uso |
| --- | --- |
| `list_workflows` | Descobrir chaves de workflows configurados, descrições, requisitos de credenciais, status v2 e execuções recentes. |
| `start_workflow` | Iniciar um workflow configurado e retornar `workflow_id`, `run_id`, status, chave de negócio e resultado do comando. |
| `get_workflow_result` | Consultar periodicamente a execução atual ou selecionada para obter status, saída, metadados de visibilidade e o resumo da falha mais recente. |
| `get_workflow_history` | Buscar um trecho final limitado dos eventos tipados do histórico v2 e das falhas duráveis recentes. |
| `diagnose_workflow` | Classificar uma execução selecionada com fatos estruturados, causa raiz, remediação e próximas ações. |
| `repair_workflow` | Solicitar o comando de reparo integrado da v2 e retornar um resultado estruturado de mutação aceita, recusada ou desnecessária. |

Chame `list_workflows` antes de qualquer início. Essa é a verificação de
compatibilidade do agente: a resposta informa quais chaves de workflow existem
e se um workflow pode executar no ambiente atual.

Os envelopes de descoberta usam o ID de esquema normativo
`durable-workflow.v2.mcp-discovery`. Os agentes podem usá-lo para reconhecer
o formato publicado da lista de ferramentas, os esquemas de parâmetros, as
orientações de descoberta e a semântica de `payload_preview_limit_bytes`
antes de chamar uma ferramenta.

## Contrato de entrada das ferramentas {#tool-input-contract}

Os esquemas das ferramentas MCP usam intencionalmente os termos do Durable
Workflow em vez de detalhes internos do Laravel. Mantenha estes campos
estáveis ao estender o servidor do aplicativo de exemplo:

| Ferramenta | Entradas estáveis |
| --- | --- |
| `list_workflows` | `show_recent`, `limit` e `status` opcional para descobrir execuções recentes. |
| `start_workflow` | `workflow`, `arguments` ordenados, `instance_id`, `business_key`, `visibility_labels`, `memo`, `search_attributes` e `duplicate_start_policy` opcionais. |
| `get_workflow_result` | `workflow_id`, `run_id` opcional, `include_recent_history` e `history_limit`. |
| `get_workflow_history` | `workflow_id` ou `run_id`, `limit` e `include_payloads`. |
| `diagnose_workflow` | `workflow_id` ou `run_id`, além de `history_limit` opcional. |
| `repair_workflow` | `workflow_id` ou `run_id`. |

Prefira `arguments` à entrada legada `args` para novos agentes. `arguments`
corresponde diretamente à ordem dos argumentos de `handle()` do workflow,
enquanto `args` existe somente para chamadores antigos que usam formato de objeto.

Use `instance_id` fornecido pelo chamador somente quando o agente precisar
de idempotência. Combine-o com `duplicate_start_policy=return_existing_active`
quando uma verificação básica repetida deva se associar ao workflow ativo
em vez de falhar por duplicação.

## Contrato de resultado das ferramentas {#tool-result-contract}

Os envelopes de resultado das ferramentas usam o ID de esquema normativo
`durable-workflow.v2.mcp-tool-results`. Os agentes podem usá-lo para interpretar
status do resultado, truncamento da prévia de payload, campos de erro, objetos
de causa raiz e remediação, envelopes de mutação segura e marcadores de esquema/versão.

Os agentes devem tratar os seguintes campos de resultado como referências
duráveis para correlação entre ferramentas:

| Ferramenta | Campos de resultado estáveis |
| --- | --- |
| `list_workflows` | `available_workflows`, `allow_fqcn`, `workflow_id_kind`, `run_id_kind`, `status_values` e `recent_workflows` opcional. |
| `start_workflow` | `workflow_id`, `run_id`, `workflow`, `workflow_class`, `workflow_type`, `status`, `running`, `business_key`, `duplicate_start_policy` e `command`. |
| `get_workflow_result` | `found`, `workflow_id`, `run_id`, `current_run_id`, `current_run_is_selected`, `status`, `running`, `output`, `error`, metadados de visibilidade e registros de data/hora. |
| `get_workflow_history` | `found`, `workflow_id`, `run_id`, `current_run_id`, `status`, `history_event_count`, `returned_event_count`, `events_are_most_recent`, `payloads_included`, `events` e `failures`. |
| `diagnose_workflow` | `found`, `workflow_id`, `run_id`, `diagnosis`, `facts`, `latest_failure`, `recent_history`, `root_cause`, `remediation` e `next_actions`. |
| `repair_workflow` | `found`, `workflow_id`, `run_id`, `accepted`, `status`, `mutation`, `command`, `remediation` e `next_actions`. |

As prévias de payload do histórico têm tamanho intencionalmente limitado.
Quando `include_payloads` é verdadeiro, a prévia de cada evento informa
`payload_preview_limit_bytes`, `size_bytes`, `preview_bytes` e `truncated`,
para que um agente cite se viu o payload completo ou apenas uma prévia.

## Taxonomia de falhas e remediação {#failure-and-remediation-taxonomy}

`diagnose_workflow` é a interface de causa raiz legível por máquina.
Seu objeto `root_cause` usa o ID de esquema
`durable-workflow.v2.agent-root-cause` e inclui:

- `category`, como `activity_failure`, `workflow_failure`,
  `task_repair_attention`, `waiting_for_signal`, `history_growth_attention`,
  `in_progress` ou `none`
- `source.kind` e `source.id` para o workflow, atividade, espera, fila de
  tarefas ou família de histórico que produziu a classificação
- `retryable`, `severity` e `actionable`
- detalhes de falha como `failure_category`, `exception_class` e `handled`
  quando existe uma linha de falha durável

O objeto complementar `remediation` usa o ID de esquema
`durable-workflow.v2.agent-remediation`. Ele inclui
`classification`, um `summary` curto, `automatic_repair.tool` e
`automatic_repair.allowed`, além de entradas `next_actions` para os comandos
seguintes suportados. Os agentes devem chamar `repair_workflow` somente quando
`automatic_repair.allowed` for verdadeiro. Outras classificações orientam o
agente a aguardar, enviar a entrada esperada pela interface documentada de
comandos de workflow, inspecionar o histórico, alterar código de workflow ou
atividade, ou planejar Continue-As-New.

`repair_workflow` retorna um envelope `durable-workflow.v2.safe-mutation`.
O campo `mutation.applied` informa se um comando de reparo foi aceito,
enquanto `command.outcome` distingue `repair_dispatched`, `repair_not_needed`
e recusas estruturadas, como uma execução terminal ou que não é a atual.

## Ciclo seguro do agente {#safe-agent-loop}

Use primeiro workflows sem credenciais:

```json
{"tool": "list_workflows", "arguments": {"show_recent": true, "limit": 5}}
{"tool": "start_workflow", "arguments": {"workflow": "simple", "business_key": "demo-001"}}
{"tool": "diagnose_workflow", "arguments": {"workflow_id": "<workflow_id>"}}
{"tool": "repair_workflow", "arguments": {"workflow_id": "<workflow_id>"}}
{"tool": "get_workflow_result", "arguments": {"workflow_id": "<workflow_id>"}}
{"tool": "get_workflow_history", "arguments": {"run_id": "<run_id>", "limit": 25}}
```

As chaves de workflow `simple` e `elapsed` são as opções preferenciais para
verificações básicas. Use exemplos com credenciais somente depois que
`list_workflows` informar o requisito e o ambiente local contiver as chaves necessárias.

## Formato do relatório {#report-shape}

Um cliente de IA deve relatar resultados MCP com fatos estáveis:

- versão da documentação usada, normalmente `2.0`
- endpoint MCP e nome da ferramenta
- chave do workflow, `workflow_id` e `run_id`
- status e resumo da falha mais recente
- `root_cause.category` e `remediation.classification`
- se `remediation.automatic_repair.allowed` era verdadeiro antes da tentativa
  de mutação de reparo
- nomes e registros de data/hora dos eventos de um histórico limitado
- se a execução usou um workflow de verificação básica sem credenciais
  ou um exemplo com credenciais

Esses fatos se alinham às interfaces da CLI, do SDK Python e da exportação
de histórico do Waterline, permitindo reproduzir a mesma execução com outro cliente.

## Páginas relacionadas {#related-pages}

- [Desenvolvimento assistido por IA](./ai-assisted-development.md)
- [Ciclo operacional do agente](./agent-operating-loop.md)
- [Contrato de ferramentas para agentes](./agent-tooling-contract.md)
- [Aplicativo de exemplo](./sample-app.md)
- [Capacidades de clientes e workers](./polyglot/cli-python-parity.md)
- [Fluxos de mensagens](./features/message-streams.md)
