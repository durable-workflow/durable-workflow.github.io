---
title: Cancelamento cooperativo
description: Solicite limpeza com prazo limitado em um workflow, seus filhos e suas atividades.
---

# Cancelamento cooperativo {#cooperative-cancellation}

O Server 2.5.0 adiciona cancelamento cooperativo por meio do protocolo 1.20.
Ele exige workers que habilitem explicitamente a cooperação. Verifique a
descoberta do runtime e o suporte a capacidades do SDK antes de usá-lo.

## Solicitar limpeza {#request-cleanup}

Use `requestCancellation()` no SDK PHP, `request_cancellation()` em Python ou
Rust, ou a rota `request-cancellation` do Server. A execução permanece ativa
enquanto o código do workflow trata a solicitação e realiza a limpeza. Uma
limpeza bem-sucedida encerra a execução como `Cancelled`.

```http
POST /api/workflows/{workflowId}/runs/{runId}/request-cancellation
X-Durable-Workflow-Control-Plane-Version: 2
Authorization: Bearer <operator-token>
X-Namespace: <namespace>
Content-Type: application/json

{"reason":"Order withdrawn","cleanup_timeout_seconds":30}
```

A execução selecionada ainda deve ser a atual. A primeira solicitação aceita
retorna HTTP 202. Uma duplicata retorna HTTP 200 com a identidade e o prazo da
solicitação original. Alterar o timeout em uma duplicata não amplia o
orçamento de limpeza.

O contexto imutável de cancelamento expõe os IDs da solicitação e da raiz, o
motivo, o solicitante, a origem, o horário da solicitação original, o prazo e a
linhagem ordenada. O código do workflow o recebe no ponto de entrega registrado.
Chamadas concluídas anteriormente são reproduzidas normalmente. Os auxiliares
determinísticos `deadline()` e `remaining()` permitem que a limpeza tome as
mesmas decisões após uma reinicialização.

O `cancel()` existente fecha uma execução imediatamente e não retoma a limpeza
do workflow. `terminate()` também a fecha imediatamente, com resultado
`Terminated`.

## Escolher políticas das operações {#choose-operation-policies}

| Política | Workflow filho | Atividade remota | Atividade local |
| --- | --- | --- | --- |
| TryCancel | Solicita limpeza do filho e continua a limpeza do pai | Solicita a parada do callback e continua a limpeza do workflow | Para o callback supervisionado e continua a limpeza |
| WaitCancellationCompleted | Aguarda o resultado terminal registrado do filho | Aguarda o recibo durável de parada do callback original | Aguarda o recibo durável de parada do callback original |
| Abandon | Deixa o filho independente | Deixa a atividade independente sob seu timeout total finito original | Rejeitada antes da admissão |

O encerramento do pai tem uma política separada. `RequestCancellation` envia
uma solicitação cooperativa com a linhagem de cancelamento original e o prazo
limitado. `RequestCancel` mantém seu comportamento legado de cancelamento
imediato.

Cada filho cooperante herda a identidade da solicitação raiz e o orçamento de
limpeza. Um filho pode receber um prazo menor, mas não pode ampliar esse
orçamento. Uma operação abandonada tem vida útil independente e fica fora dessa
espera pela limpeza.

## Supervisão e recuperação {#supervision-and-recovery}

Workers cooperativos observam o cancelamento independentemente dos heartbeats
das atividades da aplicação. PHP usa processos de callback supervisionados.
Python supervisiona callbacks assíncronos e síncronos. Rust supervisiona
futures de callbacks assíncronos. Trabalho desacoplado e serviços downstream
precisam de seu próprio comportamento de cancelamento e idempotência.

A limpeza pode usar um escudo de cancelamento para executar atividades
duráveis, temporizadores e chamadas a filhos. O escudo preserva o prazo
original. Se um worker morrer, seu substituto reproduz o mesmo ponto de entrega
e as chamadas de limpeza concluídas antes de retomar. A expiração ou a
terminação revoga a autoridade de execução restante.

Uma tentativa antiga de atividade não pode publicar um resultado depois de ser
isolada por fencing. Efeitos externos já aceitos ainda precisam de idempotência
ou reconciliação na aplicação.

## Inspecionar a cascata {#inspect-the-cascade}

Os diagnósticos da execução expõem `cancellation_cascade`, incluindo a
solicitação raiz, execuções participantes, tentativas de atividades, políticas,
recibos de parada, prazos e resultados da limpeza. A CLI e o Waterline
apresentam a mesma visualização.

O ciclo de vida distingue `requested`, `delivered`, `cleaning_up`, `cancelled`,
`deadline_expired` e `terminated`. Uma visualização incompleta identifica o que
não pode ser verificado, em vez de tratar um recibo ausente como prova de
sucesso.

Uma solicitação contra uma reserva ativa de worker incompatível retorna uma
recusa explícita de capacidade sem registrar um cancelamento parcial.
Atualizar um registro não atualiza uma reserva já emitida.

## Limite do release {#release-boundary}

Solicitações para a execução inteira, políticas de filhos e atividades,
limpeza protegida com prazo limitado, recuperação e inspeção da cascata compõem
o release suportado. Escopos de operação canceláveis independentemente
permanecem como uma prévia desabilitada no código-fonte e são marcados como
experimentais na referência do protocolo.

Consulte a [especificação do protocolo de workers](/platform-protocol-specs/worker-protocol-api.openapi.yaml)
para os formatos exatos de solicitações, recibos e capacidades. Guias de autoria
específicos de cada linguagem estão nos sites dos SDKs
[PHP](https://php.durable-workflow.com/),
[Python](https://python.durable-workflow.com/) e
[Rust](https://rust.durable-workflow.com/).
