---
sidebar_position: 4
title: Transportador HTTP invocável
description: Configure o transportador invocable_http exclusivo de atividades para que o servidor envie uma tarefa de atividade sob lease por POST a um handler HTTPS e reconcilie o resultado estruturado.
tags:
  - external-execution
  - invocable-carrier
  - worker-protocol
keywords:
  - transportador invocável
  - invocable_http
  - configuração de executor externo
  - handler HTTP de atividade
  - envelope de entrada de tarefa externa
  - envelope de resultado de tarefa externa
---

# Transportador HTTP invocável {#invocable-http-carrier}

O transportador HTTP invocável é o primeiro transportador concreto definido na
[interface de execução externa](./external-execution.md). Ele é publicado por
`GET /api/cluster/info` em `worker_protocol.invocable_carrier_contract`, com
`schema: durable-workflow.v2.invocable-carrier.contract`, `version: 1` e
`carrier_type: invocable_http`.

Quando um mapeamento de handler configurado resolve para um transportador
`invocable_http`, o servidor invoca o endpoint configurado com o
[envelope de entrada de tarefa externa](./external-execution.md#published-contract-seams)
independente de transportador e reconcilia a resposta com o
[envelope de resultado de tarefa externa](./external-execution.md#published-contract-seams).
Tarefas de workflow, ordenação de sinais/atualizações, replay e mutação do
histórico permanecem no servidor. O transportador apenas move os envelopes
declarados de entrada e resultado por um limite HTTPS.

## O que é {#what-it-is}

O transportador HTTP invocável existe para trabalho com garantias de atividade
que uma equipe de operação prefere hospedar como handler HTTPS em vez de worker de long poll:

- atividades de manutenção de operadores e automação de plataforma hospedadas em um serviço HTTP interno
- transferências limitadas entre integrações que já terminam em um endpoint HTTPS
- handlers de atividade serverless ou em containers que expõem uma rota POST por tipo de atividade

A execução da atividade é delegada ao endpoint configurado. O estado durável
do workflow, o histórico e o contrato de conclusão da atividade continuam sob
responsabilidade do servidor.

## Escopo exclusivo de atividades {#activity-only-scope}

O manifesto publicado fixa o escopo do transportador em
`task_kinds: [activity_task]` e nomeia exclusões explícitas para que o limite
não se desloque pela configuração:

- `workflow_task_execution`: tarefas de workflow permanecem em runtimes reais de workflow
- `workflow_replay`: o transportador nunca reproduz histórico de workflow
- `history_mutation`: handlers não podem editar o histórico de eventos diretamente
- `generic_webhook_ingress`: a entrada genérica passa por um adaptador de ponte, não por este transportador

Um mapeamento de handler com `kind` diferente de atividade, ou de transportador
com uma capacidade diferente de `activity_task`, falha na validação da
configuração com `invalid_invocable_carrier_scope` antes de aparecer na resposta
de poll de atividades.

## Destino HTTPS e método {#https-target-and-method}

Os `target_fields` do transportador são validados pelo servidor antes de um
mapeamento ser exposto:

| Campo | Obrigatório | Permitido | Observações |
| --- | --- | --- | --- |
| `url` | sim | URL HTTPS absoluta ou HTTP para desenvolvimento em loopback (`localhost`, `127.0.0.0/8`, `::1`) | Credenciais na URL (`scheme://user:pass@host`) são proibidas. |
| `method` | não | `POST` | Padrão `POST`. Nenhum outro método HTTP é aceito. |
| `timeout_seconds` | não | inteiro de 1 a 900 | Prazo de transporte de uma tentativa do handler. O prazo da tarefa é aplicado separadamente pelo servidor/runtime. |
| `retry_policy` | não | objeto (veja abaixo) | Orçamento de novas tentativas de transporte controlado pelo transportador. |

Destinos inválidos são rejeitados com `invalid_carrier_target` e nunca
aparecem na saída de descoberta.

## Modelo de autenticação {#auth-model}

Mapeamentos `invocable_http` fora de loopback devem resolver um `auth_ref` da
configuração do executor externo. HTTP invocável sem autenticação só é
permitido em destinos HTTP de loopback para iteração local de desenvolvimento.

- `auth_refs` são declarados uma vez no topo da configuração e referenciados
  pelos padrões ou por mapeamento. Tipos suportados incluem `profile`, `env`,
  `token_file`, `mtls` e `signed_headers`.
- Um mapeamento para um destino fora de loopback sem `auth_ref` efetivo falha
  na validação com `missing_invocable_auth_ref`.
- Tokens, segredos, assinaturas e cabeçalhos de autorização nunca são exibidos
  em diagnósticos do cluster, na saída de `dw server:info` ou na resposta de
  poll de atividades. Os diagnósticos informam qual `auth_ref` foi resolvido e
  o resumo com dados sensíveis ocultos, nunca o valor da credencial.

A intenção é que um operador possa ler os diagnósticos do runtime com dados
sensíveis ocultos e confirmar qual segredo de autenticação será usado sem que
o servidor jamais exponha o próprio segredo.

## Novas tentativas de transporte versus da atividade durável {#transport-retry-versus-durable-activity-retry}

A `retry_policy` opcional de um transportador invocável é **exclusiva de
transporte**. Ela governa a entrega HTTP antes de o handler informar um resultado:

| Campo de `retry_policy` | Permitido | Padrão | Significado |
| --- | --- | --- | --- |
| `max_attempts` | inteiro de 1 a 5 | `1` | Máximo de tentativas de entrega HTTP por lease de tarefa. |
| `backoff_seconds` | array de inteiros, cada um de 0 a 300, com até 5 entradas | `[]` | Espera por tentativa antes da próxima tentativa HTTP. |
| `retryable_status_codes` | subconjunto de `[408, 425, 429, "5xx"]` | `[408, 429, "5xx"]` | Códigos de resposta que permitem nova tentativa de transporte. |

Novas tentativas de transporte nunca se tornam eventos de histórico. O
servidor só fica sabendo da tentativa final do transportador: o envelope
estruturado de sucesso/falha retornado pelo handler, um timeout de transporte
mapeado para `failure.kind=timeout, classification=deadline_exceeded` ou um dos
caminhos de saída malformada.

Assim que o handler informa um resultado, a **política de novas tentativas da
atividade durável continua sob autoridade do servidor/runtime**. Novas
tentativas, agendamento e backoff da tarefa continuam seguindo a política de
atividade declarada pelo workflow. A `retry_policy` do transportador não a
amplia, substitui nem sobrepõe.

## Envelope de requisição e resposta {#request-and-response-envelope}

O servidor envia o envelope de entrada independente de transportador e espera
receber o envelope de resultado independente de transportador:

| Direção | Tipo de conteúdo | Schema |
| --- | --- | --- |
| Requisição | `application/vnd.durable-workflow.external-task-input+json` | `external_task_input_contract` |
| Resposta | `application/vnd.durable-workflow.external-task-result+json` | `external_task_result_contract` |

O handler deve preservar `task.id`, `task.attempt` e `task.idempotency_key` do
envelope de entrada e responder com o envelope declarado de sucesso ou falha
(ou rejeitar por segurança emitindo um mapeamento de saída malformada).

O transportador mapeia fatos de transporte para fatos de resultado deterministicamente:

- timeout de transporte → `failure.kind=timeout`, `classification=deadline_exceeded`
- resposta não 2xx sem envelope de resultado válido → `malformed_output`
- JSON inválido ou schema divergente na resposta → `malformed_output`
- envelope de resultado com referência de payload sem suporte → `unsupported_payload`

Handlers devem ser idempotentes. O mesmo `task.id` e `task.idempotency_key`
podem chegar mais de uma vez se o transportador repetir a entrega ou o runtime
reentregar um lease não concluído.

## Exemplo de configuração {#configuration-example}

O servidor lê mapeamentos de handlers em `DW_EXTERNAL_EXECUTOR_CONFIG_PATH`,
selecionando opcionalmente uma sobreposição com
`DW_EXTERNAL_EXECUTOR_CONFIG_OVERLAY`. Veja a
[Referência de configuração do Server](./server-config-reference.md) para a
lista completa de variáveis de ambiente.

Abaixo está um documento mínimo `durable-workflow.external-executor.config`
que registra um transportador `invocable_http` e um mapeamento de atividade:

```json
{
  "schema": "durable-workflow.external-executor.config",
  "version": 1,
  "defaults": {
    "profile": "prod",
    "namespace": "operations",
    "task_queue": "operator-tasks",
    "auth_ref": "handler-token"
  },
  "auth_refs": {
    "handler-token": {
      "type": "env",
      "env": "DURABLE_WORKFLOW_HANDLER_TOKEN"
    }
  },
  "carriers": {
    "ops-invocable": {
      "type": "invocable_http",
      "url": "https://handlers.example.com/durable/activity",
      "method": "POST",
      "timeout_seconds": 60,
      "capabilities": ["activity_task"],
      "retry_policy": {
        "max_attempts": 3,
        "backoff_seconds": [2, 5],
        "retryable_status_codes": [408, 429, "5xx"]
      }
    }
  },
  "mappings": [
    {
      "name": "billing.reconcile-ledger",
      "kind": "activity",
      "task_queue": "operator-tasks",
      "activity_type": "billing.reconcile-ledger",
      "carrier": "ops-invocable",
      "handler": "billing.reconcile-ledger",
      "timeout_seconds": 60
    }
  ]
}
```

Uma variante local usa `"url": "http://127.0.0.1:8080/durable/activity"` e
pode omitir `auth_ref`, pois HTTP em loopback é o único caminho sem autenticação permitido.

## Inspeção e diagnósticos {#inspection-and-diagnostics}

Dois comandos da CLI apresentam o contrato publicado do transportador
invocável de um servidor em execução:

- `dw server:info` exibe o nome do schema, versão do contrato, tipo de
  transportador, tipos de tarefa, tipos de conteúdo permitidos de
  requisição/resposta e diagnósticos dos mapeamentos do executor externo com
  dados sensíveis ocultos. Use-o para confirmar que o servidor carregou os mapeamentos esperados.
- `dw doctor` executa o diagnóstico de cluster-info, imprime o bloco
  `invocable_carrier_contract` e mostra erros `invalid_carrier_target`,
  `missing_invocable_auth_ref`, `invalid_invocable_carrier_scope`,
  `unknown_carrier`, `unknown_auth_ref` ou `unknown_handler` que impediram o
  anúncio de um mapeamento.

A própria resposta de poll de atividades informa o mapeamento resolvido, o
destino do transportador (com autenticação oculta) e a `retry_policy` efetiva.
Workers e ferramentas de operação leem esses campos como fonte de verdade em
vez de manter em cache sua própria cópia do arquivo de configuração.

## Coexistência e rollout {#coexistence-and-rollout}

O limite do rollout do transportador invocável é publicado no mesmo manifesto:

- Um transportador baseado em poll e um `invocable_http` só podem compartilhar
  uma fila quando os mapeamentos forem específicos por tipo de atividade. Dois
  mapeamentos não podem reivindicar o mesmo par `(task_queue, activity_type)`.
- Operadores devem remover ou desabilitar por sobreposição os mapeamentos
  invocáveis antes de excluir as credenciais referenciadas. Remover as
  credenciais antes de drenar o mapeamento leva toda nova tentativa a
  `failure.kind=auth`, não a um sucesso silencioso.
- A `retry_policy` do transportador é puramente de transporte. A política de
  novas tentativas da atividade durável continua sendo a única autoridade sobre
  quantas tentativas de tarefa o workflow observa.

## Interfaces relacionadas {#related-surfaces}

- [Interface de execução externa](./external-execution.md): o limite de produto
  independente de transportador implementado por este transportador.
- [Handler PHP de atividade invocável](./invocable-php-handler.md): auxiliar PHP
  usado por um processo externo para interpretar envelopes de entrada,
  despachar callables de atividade e emitir os envelopes estruturados esperados.
- [Referência de configuração do Server](./server-config-reference.md): variáveis
  `DW_EXTERNAL_EXECUTOR_CONFIG_PATH` e `DW_EXTERNAL_EXECUTOR_CONFIG_OVERLAY`.
- [Armazenamento externo de payloads](../features/external-payload-storage.md):
  como payloads grandes de requisição ou resultado são transferidos para um
  driver configurado e representados por um envelope de referência verificável
  nos mesmos schemas de entrada e resultado usados pelo transportador invocável.
- [Protocolo de workers](./worker-protocol.md): o contrato mais amplo do plano
  de workers que publica este transportador junto aos formatos de handlers baseados em poll.
