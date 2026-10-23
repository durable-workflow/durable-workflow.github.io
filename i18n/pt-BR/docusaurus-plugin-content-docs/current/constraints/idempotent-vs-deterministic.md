---
sidebar_position: 2
title: "Idempotência e determinismo"
sidebar_label: Idempotente e determinístico
description: No Durable Workflow 2.0, o determinismo torna a orquestração segura para replay e a idempotência torna seguros os efeitos de atividades repetidas.
slug: /constraints/idempotent-vs-deterministic
canonical_path: /docs/constraints/idempotent-vs-deterministic/
image: /img/idempotent-vs-deterministic.png
tags:
  - constraints
  - determinism
  - idempotency
  - replay
keywords:
  - idempotente e determinístico
  - idempotência e determinismo
  - determinístico e idempotente
  - workflow determinístico
  - atividade idempotente
---

# Workflows idempotentes e determinísticos: qual é a diferença? {#idempotent-vs-deterministic-workflows-whats-the-difference}

**Um comportamento determinístico toma as mesmas decisões quando recebe as mesmas entradas e o mesmo histórico. Um comportamento idempotente tem o mesmo efeito pretendido, independentemente de uma operação ser executada uma ou várias vezes.** O determinismo torna uma execução previsível. A idempotência torna execuções repetidas seguras. Nenhuma das propriedades implica a outra.

| Pergunta | Determinístico | Idempotente |
| --- | --- | --- |
| O que permanece igual? | As decisões tomadas a partir das mesmas entradas e do mesmo histórico | O efeito externo pretendido após uma ou muitas chamadas |
| Por que o Durable Workflow precisa disso? | O replay deve reconstruir o mesmo caminho do workflow | Novas tentativas e reentrega não devem duplicar efeitos externos |
| Onde se aplica? | No código de workflows e orquestração | Nas atividades e nos sistemas que elas chamam |
| Proíbe entrada/saída ou aleatoriedade? | Sim, dentro do código do workflow que passa por replay, a menos que o resultado seja registrado | Não. Uma atividade pode usar entrada/saída, tempo ou aleatoriedade e ainda tornar seu efeito seguro para repetição |

## As propriedades são independentes {#the-properties-are-independent}

### Determinístico, mas não idempotente {#deterministic-but-not-idempotent}

Considere uma operação que incrementa um contador:

```text
increment(counter):
    counter.value = counter.value + 1
```

Com o mesmo valor inicial do contador, essa operação sempre faz o mesmo cálculo e, portanto, é determinística. Ela não é idempotente: chamá-la duas vezes incrementa o contador duas vezes, enquanto chamá-la uma vez o incrementa uma vez.

### Idempotente, mas não determinístico {#idempotent-but-not-deterministic}

Agora considere uma atividade que define um pedido em um estado conhecido, mas usa intervalos aleatórios entre tentativas ao contatar o serviço:

```text
archive(order_id):
    wait(random_backoff())
    PUT /orders/{order_id}/status {"status": "archived"}
```

O tempo e o número de tentativas internas podem variar, então essa implementação não é determinística. Ainda assim, a operação pode ser idempotente: após uma chamada bem-sucedida ou várias, o pedido está arquivado. A resposta, a latência e o caminho interno não precisam ser idênticos. O efeito externo pretendido precisa.

## Por que o código do workflow deve ser determinístico {#why-workflow-code-must-be-deterministic}

O Durable Workflow reconstrói o estado da orquestração fazendo replay do histórico confirmado. Com a mesma entrada do workflow e o mesmo histórico, o código do workflow deve agendar as mesmas atividades, temporizadores e esperas na mesma ordem. Uma leitura do relógio do sistema, um valor aleatório, uma consulta ao banco de dados em tempo real ou uma resposta de rede no corpo do workflow pode selecionar uma ramificação diferente durante o replay e fazer com que as novas decisões não correspondam ao histórico.

Mova essas operações para atividades ou use um auxiliar de workflow que registre o valor no histórico. O replay então retorna o resultado registrado da atividade ou do efeito, em vez de realizar a operação externa novamente. O determinismo não exige que toda invocação de atividade produza uma resposta universal e atemporal. Ele exige que a orquestração durante o replay tome decisões coerentes com seu histórico registrado.

Consulte [Restrições dos workflows](./workflow-constraints.md) para conhecer as regras de código e [Como funciona](../how-it-works.md) para conhecer o modelo de replay.

Para regras de Rust sobre `HashMap`, relógios, aleatoriedade e ordem de futures, consulte as [substituições duráveis](../polyglot/rust.md#rust-determinism-rules). Rust SDK 4.5.0 adiciona [testes de atividades/workflows sem Server e replay do histórico registrado](../polyglot/rust.md#offline-testing-and-replay); mantenha testes de integração para seus limites de execução documentados.

## Por que atividades e efeitos externos devem ser idempotentes {#why-activities-and-side-effects-must-be-idempotent}

As atividades atravessam a fronteira durável para acessar bancos de dados, APIs de pagamento, provedores de e-mail, armazenamento de objetos e outros sistemas. Elas podem ser entregues novamente após um limite de tempo, uma nova tentativa, uma falha de worker ou um lease expirado. Um worker pode até concluir a alteração externa e depois falhar antes que o Durable Workflow receba seu relato.

Projete o efeito pretendido da atividade para que outra tentativa seja segura:

- envie uma chave de idempotência estável à API remota
- faça upsert com um identificador durável de negócio ou execução
- grave em um objeto ou recurso com nome determinístico
- use uma operação naturalmente idempotente, como definir um valor ou excluir um recurso conhecido

Uma chave de idempotência não torna o código da atividade determinístico nem impede que outra tentativa comece. Ela permite que o sistema externo reconheça que tentativas repetidas representam a mesma operação lógica.

Consulte [Restrições das atividades](./activity-constraints.md), [Modelo de execução de atividades](../features/activity-execution-model.md) e [Garantias de execução e idempotência](./execution-guarantees.md) para conhecer os contratos de novas tentativas, reentrega e histórico durável.

## Uma fronteira em todos os SDKs {#one-boundary-across-every-sdk}

O mesmo projeto se aplica a workers escritos em PHP, Python ou Rust:

1. Mantenha a orquestração segura para replay: com a mesma entrada e o mesmo histórico, emita os mesmos comandos duráveis.
2. Coloque chamadas de rede, relógios, aleatoriedade e estado externo mutável atrás de uma fronteira de atividade.
3. Dê a cada atividade que produz efeitos externos uma identidade estável que o sistema de destino possa deduplicar.

A sintaxe da linguagem muda. A fronteira entre determinismo e idempotência permanece.
