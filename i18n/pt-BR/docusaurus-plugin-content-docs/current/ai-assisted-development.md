---
sidebar_position: 9
title: Desenvolvimento assistido por IA
description: Use a documentação v2, a interface MCP, a saída da CLI e as exportações de histórico do Durable Workflow como referências estáveis para agentes de programação.
tags:
  - ai
  - agents
  - llms
keywords:
  - documentação durable workflow ia
  - llms.txt
  - assistentes de programação com ia
---

# Desenvolvimento assistido por IA {#ai-assisted-development}

O Durable Workflow v2 foi projetado para que uma pessoa aprenda o modelo
de execução durável e depois deixe as ferramentas cuidarem do trabalho
repetitivo de inspeção e operação. A parte essencial do produto não é um
prompt de conversa, mas o conjunto de referências estáveis que um agente
pode ler, chamar e citar sem fazer suposições.

## Fontes para recuperação de informações {#retrieval-surfaces}

Use estes artefatos para LLMs para fundamentar um assistente de IA na
documentação legível por máquina do Durable Workflow:

| Recurso | URL | Uso |
| --- | --- | --- |
| manifesto canônico | `https://durable-workflow.com/llms.txt` | Índice da documentação estável 2.0. Acompanha o caminho padrão Docs sem versão do site. |
| pacote completo canônico | `https://durable-workflow.com/llms-full.txt` | Documentação em um único arquivo, correspondente ao manifesto canônico. |
| manifesto v1 | `https://durable-workflow.com/llms-1.x.txt` | Arquivo da linha 1.x com versão fixada. |
| pacote completo v1 | `https://durable-workflow.com/llms-full-1.x.txt` | Pacote estável 1.x com versão fixada. |
| manifesto v2 | `https://durable-workflow.com/llms-2.0.txt` | Índice 2.0 com versão fixada, equivalente ao manifesto canônico. |
| pacote completo v2 | `https://durable-workflow.com/llms-full-2.0.txt` | Pacote 2.0 com versão fixada. |

Os prompts padrão de agentes devem buscar `/llms.txt` ou `/llms-full.txt`
para trabalho na versão estável 2.0. Fixe as URLs `-1.x.txt` ao manter
uma aplicação 1.x.

## Interface MCP local {#local-mcp-surface}

O [aplicativo de exemplo](/docs/sample-app) expõe um servidor MCP Laravel em
`/mcp/workflows`. Ele é a integração de referência de clientes de IA para
desenvolvimento local de workflows v2. A página específica
[Interface MCP para workflows](/docs/mcp-workflows) define o endpoint, as
ferramentas, os workflows seguros para verificações básicas e o formato dos relatórios.

O servidor MCP oferece operações estruturadas de workflow a um agente,
dispensando a extração de dados da interface visual:

| Ferramenta | Referência estável |
| --- | --- |
| `list_workflows` | Descobrir chaves de workflows configurados, requisitos de credenciais, valores de status e execuções recentes. |
| `start_workflow` | Iniciar um workflow v2 configurado e receber `workflow_id`, `run_id`, status, chave de negócio e resultado do comando. |
| `get_workflow_result` | Consultar periodicamente a execução atual ou selecionada para obter status, saída, metadados de visibilidade e o resumo da falha mais recente. |
| `get_workflow_history` | Buscar um trecho final limitado dos eventos tipados do histórico v2 e das falhas duráveis recentes. |

Use `simple` ou `elapsed` como verificações básicas que dispensam credenciais.
Use workflows com credenciais externas somente depois que o ambiente local
contiver as chaves necessárias.

Quando um agente editar workflows com interações repetidas de IA ou entrada
humana, indique o contrato v2 de
[Fluxos de mensagens](/docs/features/message-streams). O padrão estável de
autoria é `Workflow::inbox()` / `Workflow::outbox()` / `MessageStream`;
gravações diretas em `MessageService`, `WorkflowMessage` ou linhas de cursor
são detalhes internos do runtime, não padrões para código de exemplo.

## Contratos de comandos e diagnóstico {#command-and-diagnostic-contracts}

Os agentes devem preferir interfaces legíveis por máquina a capturas de tela ou texto livre:

- O [Ciclo operacional do agente](/docs/agent-operating-loop) reúne a
  documentação v2, o endpoint MCP, a saída JSON do `dw`, a exportação de
  histórico do Waterline e as referências dos SDKs em um processo repetível
  de descoberta, alteração, execução e diagnóstico.
- O [Contrato de ferramentas para agentes](/docs/agent-tooling-contract)
  define como ferramentas MCP, JSON da CLI, diagnósticos do servidor,
  exportações do Waterline e fixtures dos SDKs se alinham em uma única
  interface operável por máquina.
- Os comandos `dw` expõem códigos de saída estáveis para automação. Consulte
  a [referência da CLI](/docs/polyglot/cli#exit-codes).
- [Capacidades de clientes e workers](/docs/polyglot/cli-python-parity/)
  compara ciclo de vida, mensagens, agendamentos, visibilidade e execução
  de workers entre `dw` e os três SDKs oficiais, com evidências de requisições
  compartilhadas quando disponíveis.
- A [interface de execução externa](/docs/polyglot/external-execution)
  publica o limite de tarefas com garantias de atividade, os requisitos de
  transporte, os resultados das pontes de integração e os caminhos dos
  envelopes de entrada/resultado por meio de `/api/cluster/info`.
- Os comandos de saúde e informações do servidor, namespaces, workflows,
  agendamentos, workers e filas de tarefas são as referências adequadas
  para verificações por shell.
- A exportação de histórico do Waterline é a fonte para diagnóstico de replay
  e falhas. Ela inclui eventos tipados do histórico, metadados da origem das
  projeções, verificações de integridade, contexto da execução selecionada,
  esperas, temporizadores, linhagem e as falhas duráveis mais recentes.
- Os tipos e as assinaturas de métodos do SDK Python estão na
  [referência gerada da API Python](https://python.durable-workflow.com/).

Quando um agente precisar explicar um workflow parado, reúna primeiro:

1. `workflow_id` e `run_id`
2. status atual da execução e resumo da falha mais recente
3. eventos tipados recentes do histórico
4. esperas abertas, temporizadores e tarefas pendentes
5. saúde dos workers e das filas de tarefas
6. versão pertinente da documentação, usando `2.0` para o produto atual
   e `1.x` somente para manutenção legada

Esse conjunto permite distinguir uma falha durável do workflow de uma falha
do runtime do worker, de uma credencial externa ausente, de uma indisponibilidade
da fila ou de uma ação operacional aguardando aprovação.

## Formato do prompt {#prompt-shape}

Forneça aos agentes de programação restrições e referências explícitas:

```text
Use Durable Workflow docs from https://durable-workflow.com/llms-full-2.0.txt.
Use the sample app MCP endpoint at /mcp/workflows for workflow discovery,
start, result, and history. Prefer dw JSON/exit-code contracts and Waterline
history exports over screenshots. For external handlers or bridge adapters,
read worker_protocol.external_execution_surface_contract from /api/cluster/info
and preserve the external task input/result envelopes. Use Durable Workflow
2.0 APIs unless I explicitly ask for legacy 1.x maintenance.
```

O objetivo é simples: as pessoas aprendem a invariante entre workflow,
atividade e replay, e as ferramentas operam por contratos documentados,
em vez de inferir o comportamento do produto.
