---
sidebar_position: 4
description: O que o código de workflows e atividades pode fazer.
---

# Resumo das restrições {#constraints-summary}

| Restrição | Código do workflow | Código da atividade |
| --- | --- | --- |
| Entrada e saída | Não permitido | Permitido |
| Variáveis globais mutáveis | Não permitido | Permitido |
| Funções não determinísticas | Não permitido | Permitido |
| `Carbon::now()` | Não permitido | Permitido |
| `sleep()` | Não permitido | Permitido |
| Efeitos externos | Mova-os para atividades | Permitidos apenas quando seguros para repetição |

O código do workflow deve ser determinístico porque o mecanismo reconstrói seu estado fazendo replay do histórico de etapas duráveis. Ele invoca novamente o corpo do workflow, não as atividades. Se o corpo produzir decisões diferentes durante o replay, o mecanismo não conseguirá reconstruir o estado do workflow nem continuar a execução corretamente. O corpo do workflow não precisa ser idempotente. O requisito do replay é o determinismo.

As atividades devem ser idempotentes porque sua execução ocorre pelo menos uma vez. Novas tentativas, expiração de leases e reentrega podem fazer com que a mesma tentativa seja observada mais de uma vez. Esse comportamento faz parte do contrato, em vez de ser um erro. Tornar o corpo da atividade ou seu destino externo seguro para repetição, com uma chave de idempotência, um recurso de destino determinístico ou uma operação naturalmente idempotente, impede que a execução duplicada produza efeitos externos duplicados.

Consulte [Workflows idempotentes e determinísticos](/docs/constraints/idempotent-vs-deterministic/)
para uma comparação direta e exemplos que distinguem as duas propriedades.

Consulte [Garantias de execução e idempotência](./execution-guarantees.md)
para conhecer o contrato público da v2 por trás desses termos.
