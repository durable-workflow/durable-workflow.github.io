---
sidebar_position: 9.1
title: Ciclo operacional do agente
description: Ofereça aos agentes de IA um processo v2 estável para descobrir, alterar, executar, diagnosticar e reparar aplicações Durable Workflow.
tags:
  - ai
  - agents
  - mcp
  - operations
keywords:
  - ciclo do agente durable workflow
  - depuração de workflows com ia
  - workflows mcp
  - exportação do histórico waterline
  - saída json dw
---

# Ciclo operacional do agente {#agent-operating-loop}

O Durable Workflow v2 é mais fácil de usar por agentes quando cada etapa
tem uma referência estável. O ciclo abaixo começa com a mesma invariante
ensinada a uma pessoa e depois usa contratos legíveis por máquina para
descoberta, execução, diagnóstico e reparo.

## 1. Use a linha correta da documentação {#1-use-the-right-docs-line}

Para trabalhar na versão estável 2.0, use o pacote canônico. Ele acompanha
o mesmo caminho padrão Docs sem versão que os leitores acessam no site público:

```text
https://durable-workflow.com/llms-full.txt
```

Use o pacote específico da versão 2.0 quando a própria URL precisar
identificar a linha principal atual:

```text
https://durable-workflow.com/llms-full-2.0.txt
```

Use a versão 1.x explicitamente fixada quando a própria URL precisar
identificar essa linha principal estável:

```text
https://durable-workflow.com/llms-full-1.x.txt
```

## 2. Descubra a interface local de workflows {#2-discover-the-local-workflow-surface}

Comece pelo endpoint MCP do aplicativo de exemplo quando estiver disponível:

```text
/mcp/workflows
```

Consulte [Interface MCP para workflows](./mcp-workflows.md) para conhecer o
contrato de referência das ferramentas, as chaves de workflows seguros para
verificações básicas e o formato dos relatórios do agente.

Chame `list_workflows` primeiro. A resposta informa quais workflows são
expostos, de quais credenciais precisam, quais argumentos aceitam e quais
execuções recentes já existem. Use `simple` ou `elapsed` para verificações
básicas sem credenciais antes de usar exemplos que exigem chaves de APIs externas.

Se MCP estiver indisponível, use os contratos da CLI e do servidor:

```bash
dw server:info --output=json
dw workflow:list --output=json
dw task-queue:list --output=json
```

Esses comandos fornecem versões de protocolo, contexto de namespace,
visibilidade de workflows e saúde das filas de tarefas sem extrair dados da interface visual.

## 3. Faça a menor alteração {#3-make-the-smallest-change}

Ao editar código de workflow, preserve o limite durável:

- mantenha decisões de orquestração nos métodos de workflow
- coloque E/S, aleatoriedade, chamadas de rede e credenciais externas em atividades
- use sinais, atualizações, consultas, temporizadores e fluxos de mensagens
  em vez de tabelas ou jobs de fila improvisados
- mantenha entradas humanas ou de IA repetidas no contrato de
  [Fluxos de mensagens](./features/message-streams.md)

Esse limite importa mais que a interface da linguagem. Classes PHP de workflow,
`dw`, o SDK Python e workers externos devem descrever as mesmas operações
do plano de controle.

Quando não for preciso editar código-fonte, a etapa de "alteração" pode ser
uma escolha operacional explícita: selecionar a chave de workflow exposta,
fornecer uma `business_key` estável, escolher
`duplicate_start_policy=return_existing_active` para verificações básicas
idempotentes ou enviar a entrada documentada de sinal/atualização recomendada
por `diagnose_workflow`.

## 4. Execute por referências estruturadas {#4-run-through-structured-handles}

Use a referência mais específica disponível para a tarefa:

| Tarefa | Referência preferencial |
| --- | --- |
| Iniciar um workflow de exemplo local | `start_workflow` por `/mcp/workflows` |
| Reparar um workflow de exemplo local | `diagnose_workflow`, seguido de `repair_workflow` somente quando a remediação permitir |
| Iniciar ou enviar comandos a um workflow no servidor | `dw workflow:start`, `dw workflow:signal`, `dw workflow:update` ou equivalentes nos SDKs |
| Verificar compatibilidade | `dw server:info --output=json` e `/api/cluster/info` |
| Inspecionar a saúde da fila | `dw task-queue:describe <queue> --output=json` |
| Comparar interfaces de clientes e workers | [Capacidades de clientes e workers](./polyglot/cli-python-parity.md) |
| Implementar um worker em outra linguagem que não PHP | [Protocolo de workers](./polyglot/worker-protocol.md) |
| Implementar um handler externo | [Interface de execução externa](./polyglot/external-execution.md) |

Prefira saídas JSON ou JSONL para os ciclos de agentes. Tabelas de terminal são para pessoas.

## 5. Diagnostique antes de reparar {#5-diagnose-before-repairing}

Reúna fatos antes de alterar código ou reenviar comandos:

```bash
dw doctor --output=json
dw server:info --output=json
dw debug workflow <workflow-id> --output=json
dw workflow:history <workflow-id> <run-id> --output=json
```

Na interface MCP do aplicativo de exemplo, chame:

```json
{"tool": "diagnose_workflow", "arguments": {"workflow_id": "<workflow_id>"}}
```

Leia `root_cause.category`, `remediation.classification` e
`remediation.automatic_repair.allowed`. Chame `repair_workflow` somente
quando o último campo for verdadeiro:

```json
{"tool": "repair_workflow", "arguments": {"workflow_id": "<workflow_id>"}}
```

Se o Waterline estiver disponível, exporte o histórico da execução selecionada.
A exportação inclui eventos tipados do histórico, contexto da execução
selecionada, esperas, temporizadores, linhagem, metadados da origem das
projeções, verificações de integridade e falhas duráveis. Esses fatos permitem
distinguir um bug no workflow de um worker indisponível, uma credencial
ausente, uma fila indisponível, um cliente incompatível ou uma ação pendente do operador.

## 6. Relate usando contratos {#6-report-with-contracts}

Os relatórios dos agentes devem citar fatos estáveis, não capturas de tela:

- versão da documentação e pacote para LLM usado
- ID do workflow, ID da execução, namespace e fila de tarefas
- comando ou ferramenta MCP chamado
- status JSON, código de saída ou motivo de falha nomeado
- `root_cause.category`, `remediation.classification` e se o reparo
  foi permitido ou recusado
- eventos tipados recentes do histórico e a falha durável mais recente
- compatibilidade ou versão de protocolo obtida de `server:info` ou `/api/cluster/info`

Esse formato de relatório é portátil entre aplicativos de exemplo locais,
implantações do servidor independente, workers Python e futuros SDKs clientes.

## 7. Comprovação com artefatos publicados {#7-published-proof}

A estrutura de testes de conformidade do aplicativo de exemplo comprova o
ciclo do agente com artefatos publicados. Sua partição MCP executa:

1. descobrir: JSON-RPC `tools/list` e `list_workflows`
2. alterar: escolher o workflow `simple`, sem credenciais, com uma
   `business_key` explícita
3. executar: `start_workflow`
4. diagnosticar: `diagnose_workflow` com objetos de causa raiz e remediação
5. reparar: `repair_workflow` como mutação estruturada segura ou recusa
6. verificar: `get_workflow_result`, `diagnose_workflow` e
   `get_workflow_history`

A comprovação registra códigos de status das ferramentas, ID do workflow,
status de conclusão, ID do esquema de causa raiz, ID do esquema de remediação,
ID do esquema de mutação segura e evidências limitadas de histórico nos
metadados de conformidade.

## Páginas relacionadas {#related-pages}

- [Desenvolvimento assistido por IA](./ai-assisted-development.md)
- [Contrato de ferramentas para agentes](./agent-tooling-contract.md)
- [Interface MCP para workflows](./mcp-workflows.md)
- [Aplicativo de exemplo](./sample-app.md)
- [Referência de comandos da CLI](./polyglot/cli-reference.md)
- [Protocolo de workers](./polyglot/worker-protocol.md)
- [Interface de execução externa](./polyglot/external-execution.md)
