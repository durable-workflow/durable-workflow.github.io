---
sidebar_position: 3
title: Interface de execução externa
description: Use o contrato de execução externa independente de transporte com garantias de atividade para tarefas limitadas, pontes e handlers operáveis por IA.
tags:
  - external-execution
  - bridge-adapters
  - worker-protocol
  - AI
keywords:
  - execução externa
  - adaptador de ponte
  - protocolo de workers de atividade
  - envelope de resultado de tarefa
---

# Interface de execução externa {#external-execution-surface}

O Durable Workflow v2 trata a execução externa como uma interface de produto
definida primeiro pelo contrato, não como uma convenção de shell ou um único
transporte de worker. O servidor independente publica o contrato abrangente
legível por máquina em `GET /api/cluster/info`, em
`worker_protocol.external_execution_surface_contract`.

Esse contrato se chama `activity_grade_external_execution`. Ele se destina a
trabalho durável e limitado que pode executar fora de um runtime completo de workflow:

- atividades de manutenção de operadores
- automação de plataforma
- transferências entre integrações
- adaptadores de ponte que iniciam, sinalizam, atualizam ou transferem trabalho
- handlers baseados em scripts, daemons, HTTP, filas, serverless ou agentes

O foco inicial é automação de operadores, plataforma e integrações. Agentes de
IA e scripts são consumidores importantes porque precisam de handles estáveis,
mas não redefinem o limite do runtime.

## Limite {#boundary}

Handlers externos podem:

- executar uma tarefa de workflow ou atividade sob lease
- enviar heartbeats de progresso do lease pelo protocolo de workers
- retornar um envelope estruturado de sucesso ou falha
- usar um adaptador de ponte para iniciar, sinalizar, atualizar ou transferir trabalho limitado

Handlers externos não podem:

- interpretar a semântica de replay de workflows
- controlar o comportamento de `ContinueAsNew`
- aplicar regras de ordenação de sinais, atualizações ou consultas fora do contrato do runtime
- alterar diretamente o histórico de eventos
- atuar como um runtime de workflow sem limites

Essas regras ficam no servidor e nos runtimes reais dos SDKs. Um transportador
deve apenas mover envelopes declarados de entrada e resultado por um limite de transporte.

## Pontos de integração publicados do contrato {#published-contract-seams}

Leia `GET /api/cluster/info` antes de conectar um transportador. Os caminhos v2 relevantes são:

| Caminho | Finalidade |
| --- | --- |
| `worker_protocol.external_execution_surface_contract` | Limite do produto, limite do runtime, classes válidas de transportadores e estado dos pontos de integração. |
| `worker_protocol.external_task_input_contract` | Envelope de entrada independente de transportador para uma tarefa de workflow ou atividade sob lease. |
| `worker_protocol.external_task_result_contract` | Envelope independente de transportador para sucesso, falha e saída malformada. |
| `worker_protocol.server_capabilities.external_execution_surface` | Ponteiro compacto de capacidade para negociação no plano de workers. |

A interface de execução externa também nomeia pontos de integração planejados
para composição determinística de autenticação/perfil/TLS, mapeamento de
handlers por configuração, adaptadores de ponte limitados, armazenamento
externo de payloads e segurança de admissão/rollout. Trate-os como pontos de
integração do contrato, não como detalhes privados de implementação.

## Requisitos do transportador {#carrier-requirements}

Um transportador válido pode ser uma CLI ou daemon baseado em poll, uma
invocação de handler HTTP, um worker baseado em fila ou uma invocação
serverless. O transporte pode variar, mas estes requisitos não:

- emitir o schema de entrada declarado
- aceitar o schema de resultado declarado
- preservar `task.id`, `task.attempt` e `task.idempotency_key`
- mapear falhas de transporte para um resultado estruturado de falha ou saída malformada
- resolver entradas de autenticação, TLS, perfil e ambiente deterministicamente

Códigos de saída, stderr, falhas de processo, falhas HTTP, timeouts de
visibilidade de fila e erros da plataforma serverless são fatos de transporte.
Eles só se tornam fatos de workflow depois que o transportador os mapeia para
o envelope de resultado declarado ou para `malformed_output`.

O primeiro transportador concreto sob esse contrato é o
[transportador HTTP invocável](./invocable-carrier.md), publicado em
`worker_protocol.invocable_carrier_contract`. Ele serve apenas para tarefas de
atividade, exige HTTPS (com HTTP em loopback permitido só para desenvolvimento)
e resolve a autenticação pela configuração do executor externo. Sua
`retry_policy` de transporte é distinta da política de novas tentativas da
atividade durável, cuja autoridade continua no servidor/runtime depois que um
resultado é informado.

## Adaptadores de ponte {#bridge-adapters}

Adaptadores de ponte são interfaces limitadas de entrada ou transferência.
Eles podem iniciar, sinalizar, atualizar ou transferir trabalho, mas não são
runtimes de workflow e não devem ocultar o comportamento de replay ou do
histórico de eventos.

Todo adaptador de ponte precisa de resultados de máquina explícitos para:

- destino desconhecido
- falha de autenticação
- payload malformado
- início duplicado
- roteamento sem suporte
- transferência aceita
- transferência rejeitada

Use a mesma clareza operacional do restante do plano de controle: códigos de
status estáveis, valores nomeados de `reason` e contexto suficiente para que
`dw`, Waterline, SDKs e agentes expliquem o ocorrido sem extrair informações da prosa.

A CLI expõe diretamente a interface de ponte de webhook:

```bash
dw bridge:webhook stripe \
  --action=start_workflow \
  --idempotency-key=stripe-event-1001 \
  --target='{"workflow_type":"orders.fulfillment","task_queue":"external-workflows","business_key":"order-1001"}' \
  --input='{"order_id":"order-1001"}' \
  --json
```

A resposta JSON segue o mesmo contrato de resultado de adaptador de ponte
publicado por `/api/cluster/info`, incluindo `outcome`, `reason`,
`control_plane_outcome`, `idempotency_key` e o resumo `target` com dados sensíveis ocultos.

## Formato operável por agentes {#agent-operable-shape}

A interface de execução externa faz parte da abordagem v2 de desenvolvimento
assistido por IA. Pessoas aprendem o invariante workflow/atividade/replay;
ferramentas operam por contratos estáveis:

1. descobrir a interface de execução externa em `/api/cluster/info`
2. escolher um transportador que atenda aos requisitos publicados
3. emitir um envelope de entrada de tarefa externa
4. preservar a identidade e a idempotência da tarefa
5. retornar um envelope de sucesso, falha ou saída malformada
6. relatar falhas de ponte e transporte com resultados nomeados

Isso mantém previsíveis o scaffolding assistido por IA e a automação de
operadores: a ferramenta pode citar o manifesto do protocolo, o envelope da
tarefa, o envelope de resultado e o resultado da ponte em vez de inferir
comportamento de um único script de demonstração.
