---
sidebar_position: 5
title: Compatibilidade e roteamento de workers
description: Mantenha seguros os rollouts de builds de workers, vinculando trabalho em andamento a executores compatíveis e tornando explícitas as lacunas no rollout.
tags:
  - worker-protocol
  - compatibility
  - operations
  - rollouts
keywords:
  - compatibilidade de workers
  - rollouts de builds de workers
  - marcadores de compatibilidade
  - roteamento por build id
  - rollback de workers
---

# Compatibilidade e roteamento de workers {#worker-compatibility-and-routing}

Use este guia para implantar um novo build de worker, testar um canário em uma
fila de tarefas, reverter um build defeituoso ou manter workflows de longa
duração ativos durante um rollout de build de worker. O Durable Workflow v2
trata a compatibilidade de workers como um contrato de roteamento, não como uma
convenção informal de implantação.

A regra principal é simples: uma execução iniciada em uma família de
compatibilidade deve continuar chegando a workers que possam reproduzi-la e
executá-la com segurança. O sistema deve apresentar "nenhum worker compatível
disponível" como um estado operacional explícito em vez de entregar a tarefa
silenciosamente a um build diferente.

## Duas identidades relacionadas {#two-related-identities}

O Durable Workflow expõe duas interfaces de rollout relacionadas, mas distintas:

- **Build id** é a identidade da coorte visível ao operador no servidor
  independente. É o valor que um worker registra como `build_id` e o que as
  APIs de rollout da fila de tarefas drenam ou retomam.
- **Marcador de compatibilidade** é a identidade de roteamento do trabalho em
  andamento. Em workers PHP embarcados e hospedados no servidor, vem de
  `DW_V2_CURRENT_COMPATIBILITY` e `DW_V2_SUPPORTED_COMPATIBILITIES`. No servidor
  independente, as coortes de build id são a forma de o operador inspecionar e
  controlar esses grupos de workers compatíveis.

Trate ambos os valores como strings opacas, como `orders-2026-04-28` ou
`api-v3`. O Durable Workflow não interpreta semver, compara datas nem presume
que uma string seja mais nova que outra.

## O que fica vinculado {#what-gets-pinned}

A compatibilidade se vincula ao trabalho durável do workflow, não apenas aos
processos de worker ativos.

- **Início do workflow** registra a família de compatibilidade atual na nova execução.
- **Tarefas de workflow** herdam essa família e a mantêm em novas tentativas,
  expiração de leases e redistribuição.
- **Tarefas de atividade** herdam a mesma família da execução pai.
- **Execuções de nova tentativa** mantêm a família da execução de origem.
- **Continuar como novo** mantém a família da execução atual.
- **Workflows filhos** herdam a família da execução pai.

Isso significa que um workflow de longa duração não migra para outra família
de executores só porque uma implantação mudou. Novos builds afetam novos
inícios, a menos que você drene deliberadamente as coortes antigas e mova o
tráfego.

## Como funciona o roteamento {#how-routing-works}

A compatibilidade é aplicada em mais de uma camada.

### Restrição no momento do poll {#poll-time-narrowing}

Workers restringem o que solicitam por fila de tarefas e coorte de
compatibilidade/build, para que o servidor ou motor embarcado evite oferecer
primeiro tarefas obviamente incompatíveis.

Isso é uma dica de eficiência, não o limite final de segurança.

### Aplicação no momento da reserva {#claim-time-enforcement}

A aplicação no momento da reserva é o limite de correção. Se um worker não
puder executar uma tarefa com segurança, o Durable Workflow rejeita a reserva
com um motivo explícito de compatibilidade em vez de reatribuir sua propriedade
silenciosamente.

Esse é o contrato em que confiar durante implantações que afetam a compatibilidade:

- tarefas nunca são silenciosamente liberadas a um worker incompatível
- expiração de lease e reentrega preservam a família de compatibilidade original
- a ausência de um worker compatível é um estado observável, não um comportamento indefinido

## O que os operadores devem configurar {#what-operators-should-configure}

Use famílias de compatibilidade estáveis e legíveis por pessoas para builds
que possam reproduzir com segurança os mesmos workflows em andamento.

Para workers PHP embarcados ou hospedados no servidor, defina:

```bash
DW_V2_CURRENT_COMPATIBILITY=orders-2026-04-28
DW_V2_SUPPORTED_COMPATIBILITIES=orders-2026-04-28,orders-2026-04-21
```

`DW_V2_CURRENT_COMPATIBILITY` nomeia a família à qual novas execuções ficam
vinculadas. `DW_V2_SUPPORTED_COMPATIBILITIES` nomeia as famílias que este worker
ainda pode reservar durante um rollout ou rollback. Use `*` apenas em frotas
com um único build ou ambientes de teste restritos; não o use para ocultar uma
política de rollout incerta.

Para workers do servidor independente, registre um `build_id` estável e use as
APIs de rollout por build id para drenar ou retomar coortes deliberadamente.

## Padrão seguro de rollout {#safe-rollout-pattern}

Use esta sequência para mudanças de worker que afetam a compatibilidade:

1. Inicie a nova coorte de workers com um novo build id ou marcador de compatibilidade.
2. Mantenha a coorte antiga ativa até confirmar que a nova consegue reservar trabalho.
3. Drene a coorte antiga para que pare de aceitar novas tarefas, mas possa concluir
   ou liberar o que já possui sob lease.
4. Observe as interfaces de compatibilidade e fila de tarefas até que a coorte
   antiga não seja mais necessária.
5. Retome a coorte antiga somente se precisar fazer rollback.

Mantenha a família de compatibilidade estável entre recompilações compatíveis
com replay. Altere-a somente quando os novos workers não devam mais reservar
tarefas criadas pela família antiga.

## Estado explícito de worker ausente {#explicit-missing-worker-state}

Quando nenhum worker puder atender à família de compatibilidade exigida, o
Durable Workflow deve mostrar isso claramente:

- os resumos da frota de workers mostram que a compatibilidade exigida não está coberta
- as interfaces de fila de tarefas e rollout mostram quais coortes de build
  ainda estão ativas, drenando, desatualizadas ou ausentes
- os diagnósticos do workflow mostram que a execução aguarda um worker compatível
- saúde operacional e métricas expõem o trabalho bloqueado por compatibilidade
  como uma condição nomeada

Esse é o sinal esperado durante um rollout parcial ou rollback incompleto.
Trate-o como uma condição operacional real a corrigir, não como um transitório aleatório.

## Relação com rollouts por build id {#how-this-relates-to-build-id-rollouts}

O estado de rollout por build id e o roteamento por compatibilidade resolvem
problemas diferentes:

- **Rollout por build id** informa aos operadores quais coortes de workers estão
  ativas e permite drená-las ou retomá-las deliberadamente.
- **Roteamento por compatibilidade** decide se uma tarefa específica em andamento
  pode ser executada em um worker específico.

Em geral, ambos são usados juntos. As coortes de build id indicam quais
executores estão disponíveis; o roteamento por compatibilidade garante que o
trabalho de longa duração chegue apenas a uma coorte compatível.

## Referências relacionadas {#related-references}

- [Namespace, autenticação e registro de workers](/docs/polyglot/namespace-auth-workers)
  para o payload de registro do worker, incluindo `build_id`
- [Rollout por build id de workers](/docs/polyglot/worker-build-id-rollout) para
  o ciclo de vida de drenagem/retomada em uma fila de tarefas
- [Referência de configuração do Server](/docs/polyglot/server-config-reference)
  para `DW_V2_CURRENT_COMPATIBILITY`, `DW_V2_SUPPORTED_COMPATIBILITIES` e configurações relacionadas
- [Envelope operacional do operador](/docs/operator-operating-envelope) para
  a saúde, as métricas e os diagnósticos de execução que expõem lacunas de compatibilidade
