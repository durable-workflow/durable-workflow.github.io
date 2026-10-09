---
sidebar_position: 1
title: Visão geral das restrições
description: Entenda as regras de determinismo dos workflows e de idempotência das atividades.
---

# Visão geral {#overview}

Workflows e atividades ficam em lados diferentes da fronteira durável e seguem restrições diferentes. O código do workflow passa por **replay**. O código da atividade pode ser **reexecutado em uma nova tentativa**. Essas operações têm regras distintas.

Comece por [Workflows idempotentes e determinísticos](/docs/constraints/idempotent-vs-deterministic/) para comparar as duas propriedades e ver exemplos de por que uma não implica a outra.

- **O código de orquestração do workflow deve ser determinístico.** O mecanismo faz replay do histórico para reconstruir o estado sempre que o workflow retoma a execução, seja em outro worker, após uma reinicialização, após uma implantação ou durante uma execução longa. O replay executa novamente o corpo do workflow, sem executar novamente as atividades. Por isso, o workflow deve tomar as mesmas decisões, na mesma ordem, sempre que receber o mesmo histórico. Consultar o relógio do sistema ou um cache em tempo real, gerar números aleatórios, fazer chamadas de rede e acessar outras fontes de mudança são operações proibidas no corpo do workflow. Use [`Workflow::now()`](../defining-workflows/workflow-api.md), [`sideEffect(...)`](../features/side-effects.md), atividades e outros recursos apropriados para atravessar a fronteira durável.

- **O código das atividades deve ser idempotente.** As tentativas de atividade têm execução **pelo menos uma vez**. Novas tentativas, expiração de leases e reentrega podem fazer com que o mesmo trabalho lógico seja observado mais de uma vez. Esse comportamento faz parte do contrato. O framework registra no máximo um resultado terminal por tentativa na camada de estado durável, mas o corpo de uma atividade pode começar a executar mais de uma vez antes de o mecanismo receber o relato vencedor. Considere a repetição normal e use uma chave de idempotência, um recurso de destino determinístico ou uma operação naturalmente idempotente quando o efeito externo não puder ser duplicado.

- **Event sourcing persiste o histórico.** O mecanismo grava cada etapa durável, como uma atividade concluída, um temporizador disparado, um sinal recebido ou um efeito registrado, como um evento de histórico tipado. O replay lê esse histórico e devolve os resultados registrados ao corpo do workflow, sem despachar novamente atividades, temporizadores ou sinais. Para um mesmo identificador, os eventos de estado durável são registrados exatamente uma vez na camada de histórico, mesmo quando o transporte entrega o trabalho mais de uma vez.

Juntos, determinismo e idempotência permitem retomar workflows que atravessam implantações, reinicializações de workers e novas tentativas distribuídas, sem perder o ponto de execução e sem duplicar efeitos externos que a aplicação já tornou seguros para repetição.

Veja [Garantias de execução e idempotência](./execution-guarantees.md) para o contrato público da v2 sobre replay, reentrega, expiração de leases e histórico durável registrado exatamente uma vez. Depois, consulte [Restrições dos workflows](./workflow-constraints.md) para as regras de código que mantêm o replay determinístico e [Restrições das atividades](./activity-constraints.md) para tornar segura a execução de atividades pelo menos uma vez.
