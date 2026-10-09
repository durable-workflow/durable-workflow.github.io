---
sidebar_position: 3.5
title: Garantias de execução e idempotência
description: O contrato público da v2 para replay, novas tentativas, expiração de leases, reentrega e identificadores de idempotência.
tags:
  - constraints
  - idempotency
  - retries
  - replay
keywords:
  - garantias de execução
  - idempotência
  - replay
  - reentrega
  - expiração de lease
  - pelo menos uma vez
  - exatamente uma vez
---

# Garantias de execução e idempotência {#execution-guarantees-and-idempotency}

Durable Workflow v2 estabelece uma fronteira clara entre o **replay do workflow** e a **execução de atividades**:

- O código do workflow passa por replay a partir do histórico confirmado e deve ser determinístico.
- O código da atividade realiza efeitos externos e executa **pelo menos uma vez**.
- A camada de histórico durável registra os resultados confirmados de workflows e atividades exatamente uma vez para um mesmo identificador durável, mesmo quando o transporte entrega o trabalho mais de uma vez.

Essas garantias permitem sobreviver a reinicializações de workers, expiração de leases, reentrega de filas e implantações graduais sem perder o ponto da execução.

## Replay não é uma nova tentativa {#replay-is-not-retry}

As tarefas de workflow reconstroem o estado por replay do histórico confirmado e então decidem o próximo passo. O replay executa novamente o corpo do workflow, mas **não** executa novamente atividades, reenvia sinais nem repete efeitos já registrados no histórico.

Por isso, o código de orquestração deve ser determinístico. Use recursos seguros para workflows, como [`Workflow::now()`](../defining-workflows/workflow-api.md), [`sideEffect(...)`](../features/side-effects.md), consultas, atualizações, resultados de atividades, memos e atributos de busca quando precisar atravessar a fronteira durável.

## Atividades executam pelo menos uma vez {#activity-execution-is-at-least-once}

Como as atividades realizam efeitos externos, seu contrato é diferente:

- Uma tentativa de atividade pode ser adquirida mais de uma vez.
- A expiração de um lease pode provocar a reentrega a outro worker.
- Um worker pode concluir uma operação externa, perder seu lease e enviar o resultado depois.
- Uma nova tentativa agenda outra tentativa durável para a mesma execução lógica de atividade.

Observar o mesmo trabalho mais de uma vez **faz parte do contrato**. Quem desenvolve a aplicação deve tornar o corpo da atividade, ou o sistema remoto que ela chama, seguro para repetição.

Veja [Restrições das atividades](./activity-constraints.md) para orientações de código e [Falhas e recuperação](../failures-and-recovery.md) para o comportamento de recuperação disponível ao operador.

## O que ocorre exatamente uma vez {#what-is-exactly-once}

Durable Workflow **não** promete que um processo de worker receba trabalho com efeitos externos apenas uma vez. Ele garante que os fatos duráveis confirmados são a fonte de verdade e não se duplicam para um mesmo identificador durável.

Na prática:

- Uma decisão confirmada do workflow é persistida uma vez no histórico tipado para o identificador durável de comando ou etapa que representa.
- Um resultado terminal confirmado de uma tentativa de atividade é persistido uma vez para seu `activity_attempt_id`.
- O replay lê esses fatos confirmados e reconstrói o estado do workflow, sem repetir o trabalho externo.

O modelo central é:

- **Transporte e workers operam pelo menos uma vez.**
- **O histórico durável confirmado registra os fatos exatamente uma vez por identificador durável.**

## Expiração de leases e reentrega {#lease-expiry-and-redelivery}

A expiração de um lease é um caminho normal de recuperação em sistemas distribuídos:

- Uma tarefa adquirida tem um proprietário de lease e um horário de expiração.
- Se o lease expirar antes de o worker relatar progresso ou conclusão, a tarefa fica disponível para reentrega.
- Outro worker pode adquirir o mesmo trabalho lógico.

A reentrega não significa que o mecanismo esqueceu o que já foi confirmado. Ela recupera a execução diante da incerteza na camada de worker ou transporte.

Ao investigar sintomas de execução duplicada, separe duas perguntas:

1. O efeito externo aconteceu mais de uma vez?
2. O estado durável registrou mais de um resultado confirmado para o mesmo identificador durável?

A primeira questão exige atividades idempotentes. A segunda faz parte do contrato do mecanismo.

## Identificadores padrão de idempotência {#default-idempotency-surfaces}

Estes identificadores são referências estáveis para deduplicar trabalho:

| Identificador | O que identifica | Uso comum |
| --- | --- | --- |
| `workflow_instance_id` | Uma instância pública de workflow | Tratar inícios duplicados e identificar a execução no domínio da aplicação |
| `workflow_run_id` | Uma execução durável específica | Fixar a execução selecionada para consultas, exportação ou diagnóstico |
| `workflow_command_id` | Um comando externo que modifica estado | Deduplicar novas tentativas de solicitações do cliente |
| `activity_execution_id` | Uma execução lógica de atividade ao longo de novas tentativas | Chave padrão de idempotência para efeitos externos |
| `activity_attempt_id` | Uma tentativa específica dessa atividade | Correlacionar tentativas quando o sistema remoto precisa distingui-las |
| `schedule_id` | Uma definição de agendamento | Deduplicar operações de propriedade e identidade de disparos |
| `idempotencyKey` do fluxo de mensagens | Um envio lógico de mensagem sujeito a novas tentativas | Evitar a ingestão duplicada quando o remetente tenta novamente |

Na dúvida, use `activity_execution_id` como chave padrão de idempotência de uma operação externa. Use `activity_attempt_id` apenas quando o destino externo realmente precisar distinguir cada tentativa.

```php
use Workflow\V2\Activity;

final class ChargeCard extends Activity
{
    public function handle(array $payload): string
    {
        return app(PaymentGateway::class)->charge(
            $payload,
            idempotencyKey: $this->activityId(),
            attemptCorrelation: $this->attemptId(),
        );
    }
}
```

## O que a aplicação precisa tornar idempotente {#what-developers-must-make-idempotent}

Você **não** precisa tornar o próprio replay idempotente. O framework reconstrói o estado a partir do histórico confirmado.

Você **precisa** tornar seguros para repetição os efeitos externos, como:

- chamadas de pagamento ou cobrança
- e-mails, mensagens de texto e webhooks
- gravações em outro banco de dados ou serviço
- criação ou upload de arquivos
- qualquer comando que crie ou modifique estado fora do histórico do workflow

Abordagens comuns:

- Passe uma chave de idempotência à API remota.
- Grave em um recurso de destino determinístico, como uma chave de objeto conhecida.
- Use um upsert ou uma transação com um identificador durável como chave.
- Torne a ação naturalmente repetível, para que a segunda chamada não altere nada.

## Orientações para operação {#operator-guidance}

Ao diagnosticar uma execução no Waterline, na CLI ou nos logs do Server:

- Considere normal observar uma atividade novamente após a expiração de um lease, até que o resultado durável da tentativa indique um problema.
- Considere relatos tardios de conclusão ou falha como uma disputa que o mecanismo resolve. Eles não provam que o efeito externo deixou de acontecer.
- Trate o replay de uma tarefa de workflow como recuperação, e não como uma nova tentativa do workflow inteiro.
- Investigue workers compatíveis ausentes, leases presos ou reparos repetidos como sinais operacionais. Eles não justificam repetir efeitos externos no corpo do workflow.

A distinção essencial para a operação é entre **incerteza do transporte** e **resultado durável**. Durable Workflow expõe ambos para que você possa distingui-los.

## Guias relacionados {#related-guides}

- [Visão geral](./overview.md) apresenta a divisão entre workflows e atividades.
- [Restrições dos workflows](./workflow-constraints.md) descreve as regras de código determinístico.
- [Restrições das atividades](./activity-constraints.md) explica a segurança de efeitos externos e as técnicas de idempotência.
- [Falhas e recuperação](../failures-and-recovery.md) aborda novas tentativas, aplicação de timeouts e reparo.
- [Modelo de execução de atividades](../features/activity-execution-model.md) explica atividades em fila, atividades locais, sessões de workers e execução sticky.
- [Atividades locais](../features/local-activities.md) explica tentativas no mesmo processo, heartbeats de tarefas de workflow, novas tentativas e replay sem cache.
- [Execução sticky](../features/sticky-execution.md) explica os caches de replay e por que o replay sem cache continua sendo a alternativa que preserva a correção.
