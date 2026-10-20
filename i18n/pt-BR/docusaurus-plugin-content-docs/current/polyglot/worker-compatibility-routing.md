---
sidebar_position: 5
title: Compatibilidade e roteamento dos workers
description: Preserve fixações originais ao promover novas inicializações e investigar workers compatíveis ausentes.
tags: [worker-protocol, compatibility, operations, rollouts]
keywords: [compatibilidade dos workers, implantação, marcadores, roteamento, reversão]
---

# Compatibilidade e roteamento dos workers

Compatibilidade é um contrato de roteamento. Mantenha workers capazes de reproduzir históricos existentes enquanto muda o build de novas inicializações. Drenar não transfere suas execuções para outro build.

## Duas identidades relacionadas {#two-related-identities}

- O **identificador de build** é o `build_id` registrado da coorte do Server independente, com escopo de namespace e fila. Promoção, drenagem e retomada atuam nessa coorte.
- O **marcador de compatibilidade** fica no trabalho durável. PHP embutido usa `DW_V2_CURRENT_COMPATIBILITY` e `DW_V2_SUPPORTED_COMPATIBILITIES`; builds dos workers independentes oferecem a identidade correspondente de roteamento.

Trate identidades como strings opacas. Um nome aparentemente novo não comprova compatibilidade de replay nem autoriza mudar uma fixação existente.

## O que fica fixado {#what-gets-pinned}

O Server independente seleciona a fixação de novas inicializações por promoção explícita, depois pelas alternativas de coorte ativa única. Inicializações ambíguas podem ficar sem fixação. Veja a [ordem de seleção](/docs/polyglot/worker-build-id-rollout#canary-a-new-build).

Tarefas e atividades herdam a compatibilidade da execução. Novas tentativas de tarefas, expiração de concessão e redistribuição a preservam. Execuções de nova tentativa, filhos e continue-as-new também herdam a fixação original. A promoção afeta instâncias novas posteriores; não muda uma cadeia continuada.

## Como o roteamento funciona {#how-routing-works}

### Restrição durante o poll {#poll-time-narrowing}

Workers solicitam namespace, fila e coorte compatível. A seleção evita oferecer trabalho incompatível, mas não é a autoridade final.

### Verificação na reivindicação {#claim-time-enforcement}

A reivindicação verifica compatibilidade original e identidade do worker. Um worker incompatível não obtém concessão porque outro build está ausente. A expiração também não amplia a compatibilidade.

## Evolução do fingerprint da definição {#definition-fingerprint-evolution}

**Preparação de versões ainda não publicadas.** O comportamento de roteamento abaixo foi integrado para Server 2.9.9 e os SDKs PHP 2.5.4, Python 2.6.2 e Rust 3.5.6. A publicação e a qualificação dos artefatos instalados continuam pendentes.

A fixação original do build e o fingerprint da definição respondem a perguntas diferentes. Uma nova compilação compatível com replay pode manter a família de build enquanto muda o fingerprint do código. Por padrão, o Server prefere um worker elegível com o fingerprint registrado em `WorkflowStarted`. Se não restar nenhum, uma definição alterada só pode reivindicar a tarefa original quando seu worker anuncia `workflow_entry_arguments_validation`. Essa capacidade promete recusar antes da entrada sem fazer a execução de negócio falhar. Ela não é inferida da linguagem do runtime nem da versão do protocolo; adicionar a string manualmente não torna segura uma implementação insegura de worker.

O caminho alternativo ainda exige namespace, task queue, tipo de workflow, build e capacidades de replay originais. A execução mantém o fingerprint e os snapshots de admissão registrados. O SDK precisa validar a entrada original e reproduzir os comandos confirmados; uma alteração de código, um marcador de versão ou um registro bem-sucedido não comprova que o replay terá sucesso. Reinicie o código alterado com um worker id novo, pois um registro ativo não pode mudar o fingerprint anunciado.

O detalhe da execução, sua depuração selecionada, as respostas de repair e o detalhe da task queue expõem `definition_routing`:

| Status | Significado e ação |
| --- | --- |
| `matching_definition_available` / `matching_definition_preferred` | Há capacidade elegível com a definição registrada ou ela tem preferência sobre o worker alterado. |
| `replay_required` | Uma definição alterada com a capacidade necessária pode reivindicar a tarefa. A validação de entrada e o replay estrito ainda precisam passar. Não é um diagnóstico de bloqueio. |
| `entry_validation_unavailable` | A substituição não tem a capacidade de validação de entrada. Atualize o SDK ou restaure a definição registrada. |
| `no_eligible_worker` / `worker_definition_missing` / `recorded_definition_missing` | Investigue a capacidade ou os dados de fingerprint ausentes, preservando as proteções originais de roteamento. |
| `pinning_disabled` | A preferência pelo código correspondente está desativada; as demais verificações de claim e replay continuam valendo. |

`blocked = true` descreve uma tarefa de workflow pronta e já disponível sem uma rota de definição elegível. O detalhe da fila inclui no máximo dez execuções e informa se existem outras prontas; não é uma contagem completa de todas as execuções passivas ou bloqueadas. Repair não consegue criar um worker correspondente nem reescrever o histórico. Após uma recusa real de entrada, siga o [procedimento de recuperação do mesmo original](../failures-and-recovery.md#service-entry-recovery).

`DW_V2_PIN_TO_RECORDED_FINGERPRINT=false` remove a preferência pelo código correspondente. Não remove fixações de build, limites de namespace/fila/tipo, identidade de registro, fencing de leases nem replay estrito. Não substitui o SDK seguro nem a atualização pelo caminho padrão. Runtimes antigos podem deixar uma definição alterada parada sem diagnóstico ou repetir uma recusa de entrada não classificada; use a combinação exata e qualificada de runtime e SDK.

## O que os operadores devem configurar {#what-operators-should-configure}

No PHP embutido, configure a família atual e as explicitamente aceitas:

```bash
DW_V2_CURRENT_COMPATIBILITY=orders-2026-04-28
DW_V2_SUPPORTED_COMPATIBILITIES=orders-2026-04-28,orders-2026-04-21
```

O primeiro valor fixa novas execuções embutidas; o segundo permite reivindicações para essas famílias. Use `*` somente com política de compatibilidade deliberadamente verificada. Workers independentes devem registrar `build_id` estável e usar promoção e controles de ciclo de vida do Server. Preserve a família entre reconstruções compatíveis com replay; trocar um rótulo não torna código incompatível seguro para reprodução.

## Padrão de implantação seguro {#safe-rollout-pattern}

1. Implante e confira namespace, fila, tipos aceitos e registros recentes da nova coorte. Mantenha a antiga disponível.
2. Promova explicitamente o build das novas inicializações. Quantidade de workers não define porcentagens de tráfego.
3. Preserve capacidade compatível para execuções fixadas, inclusive as que aguardam passivamente timer, sinal, atividade ou filho.
4. Drene apenas para impedir deliberadamente novas reivindicações da coorte. Se o trabalho parar por drenagem prematura, retome e restaure o build original compatível.
5. Para reverter novas inicializações, restaure/retome e promova a coorte correta; depois reverta a implantação defeituosa. As fixações existentes não mudam.

Zero tarefas pendentes não comprova retirada segura. Preserve artefato e recuperação enquanto uma execução fixada ou cadeia herdada puder precisar deles. [Server #519](https://github.com/durable-workflow/server/issues/519) acompanha essa função protegida separada; esta lista não a entrega.

## Estado explícito de worker ausente {#explicit-missing-worker-state}

Inspecione conjuntamente [tarefas pendentes por coorte](/docs/polyglot/worker-build-id-rollout#pending-workflow-tasks-by-cohort), registros recentes/em drenagem/desatualizados e a fixação original. `no_compatible_worker` indica trabalho de workflow pendente de build não nulo sem worker ativo compatível. Não conta filas de atividades nem todas as execuções passivas fixadas. Campo ausente, requisição falha ou heartbeat desatualizado não significa frota vazia nem zero tarefas. Restaure o build correto ou investigue fila, namespace e tipos antes de adicionar workers sem relação.

## Relação com implantações por build {#how-this-relates-to-build-id-rollouts}

O estado de implantação descreve capacidade registrada e intenções de novas inicializações/ciclo de vida; a compatibilidade determina a reivindicação de uma tarefa original específica. Use ambos. Nem drenagem nem reversão reescrevem compatibilidade durável ou provam que um build pode ser removido.

## Referências relacionadas {#related-references}

- [Namespace, autenticação e registro de workers](/docs/polyglot/namespace-auth-workers)
- [Implantação de identificadores de build](/docs/polyglot/worker-build-id-rollout)
- [Referência de configuração Server](/docs/polyglot/server-config-reference)
- [Limites operacionais](/docs/operator-operating-envelope)
