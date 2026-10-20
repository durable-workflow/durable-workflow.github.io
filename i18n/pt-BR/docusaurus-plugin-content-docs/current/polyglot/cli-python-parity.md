---
title: Capacidades de clientes e workers
description: Compare as capacidades de clientes e workers da CLI e dos SDKs PHP, Python e Rust.
---

# Capacidades de clientes e workers {#client-and-worker-capabilities}

Escolha a interface de acordo com o que o processo precisa fazer. A CLI
`dw` e os SDKs oficiais PHP, Python e Rust compartilham os contratos v2
do plano de controle e de workers, mas seus papéis de operador, cliente
e worker não são idênticos.

Este guia de todos os clientes permanece na rota original
`/docs/polyglot/cli-python-parity/` para preservar os links existentes.

## Comparação de capacidades {#capability-comparison}

| Capacidade | CLI `dw` | SDK PHP | SDK Python | SDK Rust |
| --- | --- | --- | --- | --- |
| Ciclo de vida de workflows | **Suportado:** comandos operacionais para iniciar, listar, inspecionar, aguardar, cancelar, terminar e arquivar. [Comandos](./cli-reference.md#workflow-commands) | **Suportado:** iniciar, descrever, listar, aguardar resultados, cancelar e terminar por `Client` e `WorkflowHandle`. [Evidências de ciclo de vida](./php.md#lifecycle-updates-schedules-and-visibility) | **Suportado:** iniciar, listar/descrever, aguardar resultados, cancelar e terminar pelo cliente assíncrono. [Operações de workflow](./python.md#workflow-operations) | **Suportado:** iniciar, descrever, aguardar resultados, cancelar e terminar por `Client` e `WorkflowHandle`. [Operações terminais](./rust.md#cancel-terminate-and-handle-terminal-outcomes) |
| Sinais | **Suportado:** enviar pelo ID do workflow ou execução selecionada. [Comandos](./cli-reference.md#workflow-commands) | **Suportado:** métodos de envio do cliente e handle, além do histórico de sinais do worker. [API PHP](./php.md#lifecycle-updates-schedules-and-visibility) | **Suportado:** cliente assíncrono envia e workers de workflow tratam sinais. [Mensagens](./python.md#signals-queries-and-updates) | **Suportado:** envio por cliente e handle, além do tratamento de sinais no worker. [API Rust](https://rust.durable-workflow.com/) |
| Consultas | **Suportado:** executar uma consulta nomeada somente leitura com saída estruturada. [Comandos](./cli-reference.md#workflow-commands) | **Suportado:** consultas por cliente e handle, além de handlers registrados no worker. [API PHP](./php.md#lifecycle-updates-schedules-and-visibility) | **Suportado:** consultas pelo cliente assíncrono e handlers de consulta por replay no worker. [Mensagens](./python.md#signals-queries-and-updates) | **Suportado:** consultas pelo cliente e handlers de consulta por replay no worker quando a descoberta do runtime anuncia suporte a tarefas de consulta. [API Rust](https://rust.durable-workflow.com/) |
| Atualizações | **Suportado:** enviar e aguardar resultados aceitos ou concluídos. [Comandos](./cli-reference.md#workflow-commands) | **Suportado:** `updateWorkflow` e `registerUpdate`; o SDK PHP não expõe autoria de validadores e não declara validadores. [API PHP](./php.md#lifecycle-updates-schedules-and-visibility) | **Suportado:** clientes, handlers de workflow e validadores declarados síncronos quando a descoberta anuncia o contrato anterior à aceitação. Workers com validadores recusam runtimes sem suporte. [Mensagens](./python.md#signals-queries-and-updates) | **Suportado:** cliente, handle, payloads Avro e interfaces registradas de atualização no worker; o SDK Rust não expõe autoria de validadores e não declara validadores. [Atualizações](./rust.md#workflow-updates) |
| Agendamentos | **Suportado:** ciclo de vida completo, preenchimento retroativo e histórico de auditoria. [Comandos](./cli-reference.md#schedule-commands) | **Suportado:** ciclo de vida completo e listagem por `Client`. [API PHP](./php.md#lifecycle-updates-schedules-and-visibility) | **Suportado:** ciclo de vida assíncrono completo e paginação do histórico de auditoria. [Agendamentos](./python.md#schedules) | **Não suportado:** o SDK Rust atual não declara uma API de gestão de agendamentos. Use CLI, PHP, Python ou a API do servidor. |
| Visibilidade | **Suportado:** busca de workflows/execuções, workers, filas de tarefas, histórico e JSON diagnóstico. [Comandos](./cli-reference.md#workflow-commands) | **Suportado:** filtragem/paginação de workflows, histórico, namespaces, workers e filas de tarefas. [Evidências de visibilidade](./php.md#lifecycle-updates-schedules-and-visibility) | **Suportado:** interfaces de cliente para workflows, agendamentos, namespaces, workers, filas, histórico e atributos de busca. [API do cliente](./python.md#client-api-reference) | **Diferente:** descrição/resultado da execução selecionada são suportados; não se declara listagem/busca em toda a frota nem administração de namespaces. [Cliente Rust](./rust.md#package-and-source) |
| Execução de workers | **Intencionalmente diferente:** comandos de baixo nível do protocolo de workers servem para diagnóstico e conformidade; `dw` não é um runtime de worker de aplicação. [Comandos de workers](./cli-reference.md#worker-protocol-commands) | **Suportado:** handlers remotos de workflow, atividade, consulta e atualização por `durable-workflow/sdk`. [Worker PHP](./php.md#run-a-remote-php-worker) | **Suportado:** workers determinísticos de workflows e atividades. [Worker Python](./python.md#worker) | **Suportado:** handlers nativos de workflow, atividade, consulta e atualização. [API de worker Rust](https://rust.durable-workflow.com/) |

**Suportado** significa que a interface do release atual indicado expõe a
capacidade. **Diferente** identifica um limite deliberado de escopo.
**Não suportado** é uma lacuna atual explícita, não uma promessa oculta.
A descoberta de protocolo em runtime continua normativa quando uma
capacidade depende de um protocolo de workers negociado.

## Evidências por interface do produto {#evidence-by-product-surface}

### CLI {#cli}

A [visão geral da CLI](./cli.mdx) define instalação, perfis, saída estruturada
e comportamento de saída. A [referência de comandos](./cli-reference.md)
é a interface completa de operação, incluindo ciclo de vida, mensagens,
agendamentos, visibilidade e comandos de baixo nível do protocolo de workers,
que intencionalmente não são um laço de worker de SDK.

### SDK PHP {#php-sdk}

O SDK PHP com versão fixada expõe APIs de cliente e worker remoto independentes
de framework. Sua interface pública atual inclui ciclo de vida de workflows
e handles de resultado, sinais, consultas, atualizações, agendamentos,
filtragem/histórico de workflows, visibilidade de namespaces, workers e filas
de tarefas, além de handlers registrados de workflow, atividade, consulta
e atualização. Consulte o [guia do SDK PHP](./php.md) e a
[referência gerada da API PHP](https://php.durable-workflow.com/api/).

### SDK Python {#python-sdk}

O SDK Python combina um cliente assíncrono do plano de controle com workers
determinísticos de workflows e atividades. Seu guia publica
[operações do cliente](./python.md#client-api-reference),
[handlers de mensagens](./python.md#signals-queries-and-updates),
[execução de workers](./python.md#worker) e
[gestão de agendamentos](./python.md#schedules). A
[referência gerada da API Python](https://python.durable-workflow.com/)
contém assinaturas e tipos de resultado exatos.

### SDK Rust {#rust-sdk}

O SDK Rust publicado expõe plano de controle e ciclo de vida da execução
selecionada, sinais, consultas por replay, atualizações e workers nativos
de workflow/atividade. O suporte a atualizações inclui `Client::update_workflow`,
`WorkflowHandle::update`, `Worker::register_update` e suas variantes de valores
Avro. Gestão de agendamentos e listagem/busca em toda a frota continuam sendo
lacunas explícitas. Consulte o [guia do SDK Rust](./rust.md) e a
[referência gerada da API Rust](https://rust.durable-workflow.com/).

## Evidências do contrato compartilhado {#shared-contract-evidence}

Os quatro produtos usam o mesmo plano de controle HTTP+JSON versionado e
envelope público de payload. As evidências se dividem pelo que comprovam:

- o [Índice de capacidades](/docs/capabilities/) registra as versões mínimas
  exatas dos artefatos e a abrangência atual;
- a [Suíte de conformidade da plataforma](/docs/platform-conformance/)
  registra cenários de runtime entre clientes e workers;
- repositórios CLI e Python mantêm fixtures de requisições compartilhadas
  para operações cujos corpos semânticos são hoje comparados byte a byte;
- referências públicas das APIs PHP e Rust e testes de release estabelecem
  os métodos adicionais suportados listados acima.

A existência de uma fixture compartilhada em dois repositórios não implica
que outros SDKs não tenham a operação. Da mesma forma, um endpoint comum
não implica que todo produto exponha o mesmo papel de operador ou worker.

## Adicionar ou estender uma interface de cliente {#adding-or-extending-a-client-surface}

Ao adicionar uma operação de CLI ou SDK:

1. Mantenha caminhos, métodos, campos semânticos, envelopes de payload e
   resultados de erro neutros em relação à linguagem.
2. Adicione evidências de requisições e runtime para cada cliente ou worker participante.
3. Documente sintaxes deliberadamente diferentes ou limites de papéis.
4. Identifique explicitamente os produtos sem suporte.
5. Trate serialização específica de linguagem, caminhos de arquivo, nomes
   de classe ou formatos de erro como bugs no contrato público.
