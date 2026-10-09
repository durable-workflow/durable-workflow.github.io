---
sidebar_position: 3
title: Restrições das atividades
description: Torne os efeitos externos seguros para novas tentativas, expiração de leases e reentrega.
---

# Restrições das atividades {#activity-constraints}

As atividades atravessam a fronteira durável para realizar operações de entrada e saída e efeitos externos. Elas não passam por replay como o código do workflow. São **executadas pelo menos uma vez**, o que significa que novas tentativas, expiração de leases e reentrega podem fazer com que o mesmo trabalho lógico seja observado mais de uma vez.

Esse comportamento faz parte do contrato. Se uma atividade faz uma cobrança, envia um e-mail, grava em outro sistema ou modifica um recurso externo, a operação precisa ser segura para repetição.

## Na prática {#what-this-means-in-practice}

- O identificador padrão para garantir a idempotência de uma execução lógica de atividade é `activity_execution_id`.
- Cada tentativa também recebe seu próprio `activity_attempt_id`.
- Um worker pode concluir uma operação externa, perder seu lease e enviar o resultado depois. O mecanismo pode rejeitar esse relato tardio porque outro worker já venceu a disputa pelo resultado durável, mas o efeito externo pode ter ocorrido.
- O código da atividade pode realizar operações de entrada e saída, consultar o relógio do sistema e usar estado mutável do processo. O código do workflow não pode. Mantenha essa fronteira clara.

## Padrões de idempotência recomendados {#preferred-idempotency-patterns}

Muitas APIs externas aceitam um `Idempotency-Key`. Quando o serviço remoto oferecer esse recurso, use a identidade lógica da atividade fornecida pelo runtime.

- Prefira `activity_execution_id` quando o sistema remoto deve tratar novas tentativas como a mesma solicitação lógica.
- Use `activity_attempt_id` apenas quando o sistema remoto precisa distinguir as tentativas de um mesmo trabalho lógico.

Outros padrões úteis:

- Grave em um recurso externo com nome determinístico ou chave natural.
- Use upserts ou tabelas de deduplicação com um identificador durável como chave.
- Torne a operação naturalmente idempotente, para que a segunda chamada não faça nenhuma alteração.

Muitas operações já são naturalmente idempotentes. Codificar o mesmo vídeo duas vezes ainda produz o mesmo vídeo. Excluir o mesmo arquivo duas vezes não faz nada na segunda chamada.

Algumas operações não são naturalmente idempotentes, mas a duplicação ainda pode ser a falha menos prejudicial. Se você não sabe se um e-mail saiu do provedor, enviar uma cópia pode ser preferível a perder a notificação silenciosamente. Faça essa escolha de forma consciente.

## O que não presumir {#what-not-to-assume}

- Não presuma que uma tentativa de atividade só executa em um worker.
- Não presuma que uma nova tentativa significa que o efeito externo anterior falhou.
- Não presuma que um relato tardio de conclusão significa que a atividade nunca executou.
- Não mova efeitos externos para o código do workflow para evitar novas tentativas. Isso transforma um problema de idempotência em uma falha de determinismo.

Veja [Garantias de execução e idempotência](./execution-guarantees.md) para o contrato completo e [Falhas e recuperação](../failures-and-recovery.md) para o modelo de recuperação disponível ao operador.
