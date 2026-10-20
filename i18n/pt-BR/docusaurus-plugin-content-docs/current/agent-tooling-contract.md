---
sidebar_position: 9.3
title: Contrato de ferramentas para agentes
description: Trate ferramentas MCP, JSON da CLI, diagnósticos do servidor, exportações do Waterline e fixtures dos SDKs como um único contrato operável por máquina do Durable Workflow v2.
tags:
  - ai
  - agents
  - mcp
  - operations
keywords:
  - ferramentas para agentes durable workflow
  - contrato de ferramentas de ia
  - diagnóstico de workflows mcp
  - operações de workflow legíveis por máquina
---

# Contrato de ferramentas para agentes {#agent-tooling-contract}

O Durable Workflow v2 mantém previsível o desenvolvimento assistido por IA
ao expor fatos do produto por contratos estáveis. Uma ferramenta não deve
inferir o estado do workflow pelo HTML, interpretar logs como fonte de verdade
ou adivinhar qual comportamento de SDK corresponde a um comando da CLI.
Ela deve ler a versão da documentação, descobrir a interface local, chamar
operações documentadas e relatar fatos nomeados.

Esta página define o formato de contrato que futuras ferramentas MCP,
agentes locais, scripts e SDKs devem preservar.

## Camadas do contrato {#contract-layers}

| Camada | Referência estável | Expectativa do contrato |
| --- | --- | --- |
| Recuperação da documentação | Os arquivos canônicos `llms.txt` e `llms-full.txt` acompanham a documentação estável 2.0. `llms-2.0.txt` e `llms-full-2.0.txt` são aliases fixados para a mesma linha de release. | Use URLs canônicas para trabalhar no produto 2.0. Fixe `-1.x.txt` quando uma URL precisar identificar a linha arquivada 1.x, ou `-2.0.txt` quando um consumidor exigir a versão principal explícita na URL. |
| Descoberta local | `/mcp/workflows` `list_workflows` | A lista de permissões MCP da aplicação identifica as chaves de workflows expostos, as credenciais necessárias, os argumentos esperados e a adequação a verificações básicas. |
| Operações de workflow | MCP `start_workflow`, `get_workflow_result`, `get_workflow_history`, `diagnose_workflow`, `repair_workflow`; comandos JSON do `dw`; clientes dos SDKs | Cada cliente informa ID do workflow, ID da execução, namespace, fila de tarefas, status do comando, classificação de causa raiz, remediação e campos de falha nomeados sem extrair dados de uma interface visual. |
| Diagnósticos do servidor | `/api/cluster/info`, `dw server:info --output=json`, `dw doctor --output=json`, `dw debug workflow --output=json` | Os fatos sobre compatibilidade, protocolo, filas de tarefas, workers e execuções paradas são legíveis por máquina e limitados. |
| Evidência durável | Detalhes da execução selecionada e exportação de histórico do Waterline | Replay, esperas, temporizadores, linhagem, origem da projeção, verificações de integridade, falhas duráveis e ações disponíveis ao operador vêm de estado tipado. |
| Paridade entre linguagens | Fixtures de requisições CLI/Python e testes dos SDKs | As operações compartilhadas do plano de controle mantêm os formatos das requisições alinhados entre linguagens. |

Cada camada deve ser utilizável isoladamente. Em conjunto, elas dão a um
agente contexto suficiente para fazer uma pequena alteração, comprová-la
e explicar o resultado.

## Projeto de ferramentas MCP {#mcp-tool-design}

Novas ferramentas MCP devem expor diretamente os conceitos do Durable Workflow:

- Use os termos do produto, como workflow, execução, fila de tarefas,
  agendamento, histórico, falha, worker, namespace e compatibilidade.
- Retorne identificadores estáveis e campos de status nomeados em vez de
  resumos apenas em texto livre.
- Retorne objetos `root_cause`, `remediation` e `next_actions` nas ferramentas
  de diagnóstico, para que os agentes escolham o próximo comando sem
  interpretar linguagem natural.
- Inclua arrays e prévias de tamanho limitado para histórico, falhas e
  payloads, permitindo inspeção sem baixar rastreamentos ilimitados.
- Separe descoberta de mutação. Um cliente deve poder perguntar o que existe
  e quais credenciais são necessárias antes de iniciar ou enviar comandos a um workflow.
- Mantenha as mutações explícitas e estruturadas. Para workflows de exemplo
  locais, `repair_workflow` é a mutação de reparo principal; ela retorna um
  envelope `durable-workflow.v2.safe-mutation` mesmo quando o reparo é
  recusado ou desnecessário.
- Marque explicitamente os workflows de verificação básica sem credenciais,
  para que os agentes testem a integração local sem acessar serviços externos.
- Nunca inclua valores secretos, nomes de host específicos de clientes ou
  credenciais de contas nas descrições das ferramentas ou nos metadados de resultado.

O endpoint `/mcp/workflows` do aplicativo de exemplo é a interface local de
referência para workflows. Futuros servidores MCP específicos de projetos
devem manter a mesma abordagem: a configuração define a lista de permissões,
as ferramentas operam somente os workflows listados e os resultados citam
fatos duráveis que uma pessoa pode reproduzir por `dw`, Waterline ou um SDK.

## Paridade de comandos e SDKs {#command-and-sdk-parity}

A automação deve poder alternar entre clientes sem mudanças de semântica:

| Família de operações | Evidência de paridade exigida |
| --- | --- |
| start, signal, update, query, repair, cancel, terminate, archive | Os corpos das requisições da CLI e dos SDKs correspondem ao formato documentado do plano de controle. |
| history, describe, list, result | As respostas preservam identificadores estáveis, nomes de status, registros de data/hora e campos de falha. |
| filas de tarefas e workers | Capacidade, leases, slots, compatibilidade e IDs de workers permanecem fatos estruturados. |
| execução externa | Os envelopes de entrada e resultado permanecem neutros em relação à linguagem e carregam resultados nomeados das pontes de integração. |

Ao adicionar um comando da CLI, método de SDK ou ferramenta MCP para uma
ação do plano de controle, prefira uma fixture compartilhada ou um exemplo
JSON documentado que outro cliente possa verificar. Tabelas para pessoas
podem existir, mas JSON ou JSONL é o contrato da automação.

## Formato do relatório de diagnóstico {#diagnosis-report-shape}

Quando uma ferramenta explicar uma execução com falha ou parada, o relatório deve incluir:

- versão da documentação e página-fonte usada
- comando, método de SDK ou ferramenta MCP chamado
- ID do workflow, ID da execução, namespace e fila de tarefas
- status atual e resumo da falha durável mais recente
- nomes dos eventos tipados recentes do histórico
- esperas, temporizadores, tarefas ou leases de atividades externas pendentes
- fatos de compatibilidade de workers e filas de tarefas quando disponíveis
- código de saída, status HTTP, erro de validação ou motivo de bloqueio nomeado
- `root_cause.category` e `remediation.classification` legíveis por máquina
- se uma mutação segura de reparo foi permitida, aplicada, recusada ou desnecessária

Esse formato mantém os relatórios portáteis entre aplicações Laravel locais,
implantações do servidor independente, workers Python e futuros SDKs.

## Causa raiz e remediação {#root-cause-and-remediation}

O ID do esquema de causa raiz suportado é
`durable-workflow.v2.agent-root-cause`. Ferramentas de diagnóstico devem incluir:

- `category`, como `activity_failure`, `workflow_failure`,
  `task_repair_attention`, `waiting_for_signal`, `history_growth_attention`,
  `in_progress` ou `none`
- `source.kind` e `source.id`
- `retryable`, `severity` e `actionable`

O ID do esquema de remediação suportado é
`durable-workflow.v2.agent-remediation`. Ele inclui
`classification`, `summary`, `automatic_repair.tool`,
`automatic_repair.allowed` e `next_actions`. `repair_workflow` é a interface
local de reparo MCP suportada. Quando MCP estiver indisponível, use o contrato
JSON documentado da CLI `dw` e as rotas HTTP do plano de controle do servidor:

```bash
dw debug workflow <workflow-id> --output=json
dw workflow:history <workflow-id> <run-id> --output=json
dw workflow:repair <workflow-id> --output=json
dw system:repair-status --output=json
dw system:repair-pass --output=json
```

Esses comandos são o contrato suportado sem MCP para inspeção, mutação
segura, diagnóstico e automação de reparo.

## Limites de atuação dos agentes {#guardrails-for-agents}

Permita que agentes automatizem procedimentos, sem contornar o modelo durável:

- Mantenha determinística a orquestração de workflows.
- Coloque E/S, aleatoriedade, chamadas de APIs externas e credenciais
  em atividades ou handlers externos.
- Use sinais, atualizações, consultas, agendamentos, temporizadores e fluxos
  de mensagens em vez de tabelas de estado improvisadas para controlar workflows.
- Trate a exportação de histórico do Waterline como evidência, não como API de mutação.
- Trate listas de rotas, detalhes internos do banco de dados e linhas de
  modelos específicas do framework como detalhes de implementação, a menos
  que a documentação pública os identifique explicitamente.

A invariante permanece compreensível para pessoas: workflows registram
decisões duráveis, atividades realizam trabalho sujeito a falhas e o replay
deve explicar o que aconteceu. O contrato de ferramentas fornece aos agentes
referências estáveis para o restante.

## Páginas relacionadas {#related-pages}

- [Desenvolvimento assistido por IA](./ai-assisted-development.md)
- [Ciclo operacional do agente](./agent-operating-loop.md)
- [Interface MCP para workflows](./mcp-workflows.md)
- [Capacidades de clientes e workers](./polyglot/cli-python-parity.md)
- [Referência da API HTTP do Server](./polyglot/server-api-reference.md)
- [Monitoramento](./monitoring.md)
