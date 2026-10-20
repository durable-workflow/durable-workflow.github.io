---
title: Streams de workflow
description: Produza e consuma streams de saída duráveis vinculados à execução com os SDKs PHP, Python e Rust.
tags:
  - service-mode
  - workflow-streams
  - php
  - python
  - rust
---

# Streams de workflow {#workflow-streams}

Os Workflow Streams são logs de saída nomeados, vinculados à execução e
gerenciados pelo Durable Workflow Server. PHP, Python e Rust expõem operações
tipadas de listagem, descrição, assinatura, acréscimo, fechamento e erro, para
que as aplicações não precisem montar requisições HTTP. O runtime anuncia
`durable-workflow.v2.workflow-streams.contract@1`; a
[matriz de SDKs legível por máquina](/workflow-stream-capabilities.json) registra
o suporte exato em cada SDK.

Cada stream atribui offsets monotonicamente crescentes começando em 0. O
`next_offset` de uma página é o próximo offset inclusivo a solicitar. A entrega
a consumidores ocorre pelo menos uma vez: conclua os efeitos idempotentes da
página e depois persista `next_offset` de forma durável. Uma falha antes desse
checkpoint pode fazer com que os itens sejam entregues novamente.

## Emitir a partir do código do workflow {#emit-from-workflow-code}

Os três SDKs emitem pelo mesmo ponto de comando determinístico:
`record_side_effect.workflow_stream`. Cada SDK deriva a chave de idempotência
do item da identidade durável do comando de workflow da tarefa, da posição
ordinal do comando de stream e do índice no lote. O Server confirma a mutação
do stream e o efeito colateral registrado juntos. O replay consome esse efeito
colateral e não pode criar outro item durável para o mesmo acréscimo lógico.

PHP:

```php
use DurableWorkflow\Model\WorkflowStreamAppendItem;

$context->appendWorkflowStream('progress', [
    new WorkflowStreamAppendItem(['percent' => 50]),
]);
$context->closeWorkflowStream('progress');
```

Python:

```python
from durable_workflow import WorkflowStreamAppendItem

yield ctx.append_workflow_stream("progress", [
    WorkflowStreamAppendItem(payload={"percent": 50}),
])
yield ctx.close_workflow_stream("progress")
```

Rust:

```rust
let item = WorkflowStreamAppendItem::new(serde_json::json!({"percent": 50}))?;
ctx.append_workflow_stream("progress", &[item], None)?;
ctx.close_workflow_stream("progress", None)?;
```

Os auxiliares de workflow destinam-se à autoria determinística. Código fora de
um workflow pode usar a operação tipada `append` de cada cliente e fornecer sua
própria chave de idempotência estável.

## Assinar e retomar {#subscribe-and-resume}

A assinatura lê uma página de tamanho limitado, opcionalmente aguardando novos
itens por até 60 segundos. PHP aceita um callback de cancelamento entre polls
limitados. Python aceita o cancelamento normal da tarefa ou um `asyncio.Event`
que cancela o poll em andamento. Descartar a future de assinatura do Rust
cancela sua requisição.

| SDK | Operação de página | Valor para retomada | Iteração tipada |
| --- | --- | --- | --- |
| PHP | `subscribeWorkflowStream(...)` | `WorkflowStreamPage::$nextOffset` | `iterateWorkflowStream(...)` |
| Python | `await subscribe_workflow_stream(...)` | `WorkflowStreamPage.next_offset` | `iter_workflow_stream(...)` |
| Rust | `subscribe_workflow_stream(...).await` | `WorkflowStreamPage::next_offset` | Repita a future da página limitada até `terminal`. |

`open`, `closed` e `errored` são os estados do ciclo de vida. A descrição tipada
também expõe `last_offset`, `total_items`, `pending_items` e `error_reason`.
Acrescentar a um stream terminal é rejeitado. Quando o limite configurado de
itens pendentes é alcançado, o acréscimo retorna `stream_full`; os produtores
devem reduzir o ritmo ou aguardar que os consumidores esvaziem o stream.

## Referências a payloads externos {#external-payload-references}

Valores inline usam o envelope Avro Value compartilhado. Referências externas
seguem o contrato de armazenamento existente de cada SDK em vez de inventar
outro transporte:

| SDK | Comportamento da referência externa |
| --- | --- |
| PHP | Acrescenta e retorna uma `payload_reference` opaca; o upload e a busca no armazenamento continuam sob responsabilidade da aplicação. |
| Python | Usa o driver de armazenamento externo configurado para fazer upload, verificar a integridade, armazenar em cache, buscar e decodificar um envelope Avro externo. Sem um driver, os chamadores podem acrescentar ou inspecionar uma `payload_reference` opaca. |
| Rust | Acrescenta e retorna uma referência opaca e seus metadados. O SDK Rust atual não declara suporte a um driver de armazenamento externo. |

## Workflow Streams e MessageStream embarcado {#workflow-streams-and-embedded-messagestream}

Os nomes se alinham onde o comportamento se alinha, mas os modelos não são
intercambiáveis.

| Conceito | Workflow Stream no modo de serviço | MessageStream embarcado no Laravel |
| --- | --- | --- |
| Endereço | Execução do workflow + nome do stream | Instância/execução do workflow + chave do stream |
| Direção | Somente saída do workflow | Caixa de entrada e saída do workflow |
| Primeiro offset | 0 | 1 |
| Entrega | Pelo menos uma vez; checkpoint sob responsabilidade do consumidor | Pelo menos uma vez; cursor de mensagens gerenciado pelo motor |
| Continuar como novo | Sem transferência do cursor do stream | O cursor da caixa de entrada é transferido para a nova execução |
| Mensagens de entrada do workflow | Não fornecidas; use sinais ou atualizações | Fornecidas por `inbox()->receive()` |

O Waterline usa uma tabela normalizada para ambos os modos e mostra o modo,
ciclo de vida, offsets de cabeça/cursor, contagem de pendências, direção e erro.
Ele não apresenta streams de saída do serviço como uma caixa de entrada do
workflow.

## Qualificação {#qualification}

O [manifesto público de cenários de Workflow Stream](/platform-conformance/workflow-stream-runtime-scenarios.json)
exige execuções com artefatos publicados para produtor PHP com consumidores
Python e Rust, reinicialização do worker produtor, reconexão do consumidor,
ciclo de vida/controle de pressão/cancelamento e referências a payloads
externos. Um resultado de release deve registrar todos os cenários exigidos;
testes unitários do código-fonte sozinhos não são evidência de conformidade.
