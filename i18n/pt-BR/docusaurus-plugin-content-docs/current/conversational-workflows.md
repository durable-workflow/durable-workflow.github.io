---
sidebar_position: 8
tags:
  - signals
  - queries
  - continue-as-new
  - sample-app
keywords:
  - workflow conversacional
  - conversa de longa duração
  - aprovação humana
  - substituição de worker
---

# Referência de workflow conversacional {#conversational-workflow-reference}

Esta é uma referência executável única para uma conversa de longa duração no
runtime Laravel embutido. Ela combina recursos que têm seus próprios guias:
[sinais](./features/signals.md) para entradas ordenadas,
[atividades](./defining-workflows/activities.md) para o trabalho do modelo,
[consultas](./features/queries.md) para o status e
[continuar como novo](./features/continue-as-new.md) para limitar o histórico.
Workers no modo de serviço usam as mesmas primitivas por meio de seus
[guias de SDK](./polyglot/deployment-modes.md).

O código-fonte é o `ConversationWorkflow` no
[aplicativo de exemplo](./sample-app.md), em
[`app/Workflows/Conversation`](https://github.com/durable-workflow/sample-app/tree/main/app/Workflows/Conversation).
Ele usa um modelo falso determinístico, portanto não exige conta em provedor de
IA nem segredos. É uma referência para o padrão de durabilidade, não um chatbot
de produção, e não faz promessas de latência ou escala.

## Execute {#run-it}

Com o worker de fila do aplicativo de exemplo em execução (`composer run dev`):

```bash
php artisan app:conversation \
  --message="Hello" \
  --message="Please refund my order" \
  --message="Thanks" \
  --turns-per-run=2
```

Sem `--message`, o comando pede a entrada. Uma mensagem que contenha "refund"
faz o modelo falso propor uma ação, e o comando pede aprovação.
`--decision=decline` responde às aprovações roteirizadas com uma recusa. Abra
`/waterline` para inspecionar cada execução da cadeia.

## Como funciona um turno {#how-a-turn-works}

```php
#[Signal('message', [['name' => 'text', 'type' => 'string']])]
#[Signal('decision', [
    ['name' => 'approved', 'type' => 'bool'],
    ['name' => 'reviewer', 'type' => 'string'],
])]
class ConversationWorkflow extends Workflow
{
    public function handle(array $state = [], int $turnsPerRun = 3, int $inactivitySeconds = 3600): array
    {
        $this->state = array_replace($this->state, $state);

        while (true) {
            if ($this->turnsThisRun >= $turnsPerRun) {
                return continueAsNew(
                    array_replace($this->state, ['generation' => $this->state['generation'] + 1]),
                    $turnsPerRun,
                    $inactivitySeconds,
                );
            }

            $text = await('message', $inactivitySeconds);

            // A null text is the inactivity timeout; "/end" finishes.
            // Otherwise one turn runs:
            //   activity(FakeModelActivity::class, ...) proposes a reply
            //   await('decision', ...) holds a proposed action for a reviewer
            //   activity(RecordReplyActivity::class, ...) stores the reply
        }
    }
}
```

1. Cada sinal `message` é uma entrada do usuário. O workflow aplica as
   mensagens aceitas um turno por vez, na ordem em que foram aceitas.
2. A chamada ao modelo é executada em uma atividade. O replay reutiliza o
   resultado registrado em vez de chamar o modelo novamente.
3. Quando o modelo propõe uma ação, o workflow aguarda um sinal `decision`.
   Somente uma aprovação executa `ApplyApprovedActionActivity`. Uma recusa ou
   um tempo limite registra a resposta e não altera nada.
4. `RecordReplyActivity` grava a resposta na tabela `conversation_records` da
   aplicação, sob uma referência construída a partir do ID do workflow e do
   número do turno. O histórico armazena apenas essa referência.
5. A consulta `status` informa a fase (`waiting_for_input`, `thinking`,
   `awaiting_approval`, `applying_action`, `recording_reply`,
   `continuing_as_new` ou `completed`), a geração, a contagem de turnos, qualquer
   proposta pendente e a referência da resposta mais recente. Leia o texto da
   resposta por essa referência.

## O que sobrevive à perda de um worker {#what-survives-a-lost-worker}

Os testes do exemplo executam a engine uma tarefa por vez e interrompem um
worker em um ponto escolhido:

| Falha | O que acontece |
| --- | --- |
| Um worker adquire o lease da tarefa que aplica uma mensagem e então morre | Nada avança até o lease expirar. Em seguida, o passo de reparo entrega a mesma tarefa a outro worker, que aplica a mensagem uma vez. |
| Um worker morre enquanto a atividade do modelo está em execução | Depois que o lease expira, a atividade é tentada novamente em outro worker. A execução registra uma conclusão para essa atividade, e a resposta é registrada uma vez. |
| O worker da resposta grava a linha e morre antes de relatar o resultado | A nova tentativa executa a atividade novamente. Como a linha é indexada pela referência, permanece uma única resposta. |

Atividades executam pelo menos uma vez: uma nova tentativa pode repetir trabalho
que já aconteceu fora da engine. O histórico durável registra cada resultado uma
vez. Dê a cada efeito colateral uma chave estável, como fazem as referências da
resposta e da ação, e passe a mesma chave a qualquer sistema externo. Consulte
[garantias de execução](./constraints/execution-guarantees.md) e
[expiração de leases e reentrega](./constraints/execution-guarantees.md#lease-expiry-and-redelivery).

## Limitação do histórico {#bounding-history}

Após `$turnsPerRun` turnos, a execução continua como nova. A próxima execução
recebe apenas o estado explícito passado a `continueAsNew()`: a geração, a
contagem de turnos, um resumo limitado e a referência da resposta mais recente.
Outras propriedades do objeto de workflow são reconstruídas pelo replay e não
são copiadas.

Mensagens que foram aceitas, mas ainda não aplicadas, passam para a próxima
execução na ordem original. Isso vale para sinais declarados enviados à
instância do workflow. Um sinal enviado a uma execução específica é rejeitado
se essa execução encerrar antes. Consulte
[aceitação e encerramento de sinais](./features/signals.md#acceptance-and-closure)
e [continuar como novo](./features/continue-as-new.md).

## O que continua sob sua responsabilidade {#what-stays-your-responsibility}

- **Armazenamento de payloads.** O exemplo mantém o texto das respostas em uma
  tabela da aplicação. Defina a retenção, o controle de acesso e o backup dela,
  ou use [armazenamento externo de payloads](./features/external-payload-storage.md).
- **Sumarização.** O modelo falso mantém um resumo contínuo de tamanho fixo. Com
  um modelo real, você decide qual contexto atravessa o continue-as-new e até
  que tamanho ele pode crescer.
- **Quem pode enviar entradas ou aprovar.** A engine registra o sinal e seus
  argumentos. Autentique e autorize remetentes e revisores na sua aplicação
  antes de enviar o sinal; consulte
  [identidade do remetente e autorização](./features/signals.md#sender-identity-and-authorization).
- **Efeitos externos.** A engine não garante que uma chamada externa ocorra
  exatamente uma vez. Use chaves de idempotência, como faz a atividade de ação aprovada.
- **Envios de sinal repetidos.** Se a resposta de um envio de sinal for perdida,
  consulte [após uma resposta incerta](./features/signals.md#after-an-uncertain-response)
  antes de enviá-lo novamente.

O exemplo armazena as respostas por meio de uma atividade e não usa fluxos de
mensagens a partir do código do workflow. Nas versões do Workflow até a 2.20.0,
`outbox()->sendReference()` e `inbox()->receive()` no código do workflow não são
seguros para replay
([workflow#1010](https://github.com/durable-workflow/workflow/issues/1010)); veja
o aviso em [fluxos de mensagens](./features/message-streams.md).

## Guias relacionados {#related-guides}

- [Sinais](./features/signals.md) e [consultas](./features/queries.md)
- [Continuar como novo](./features/continue-as-new.md)
- [Fluxos de mensagens](./features/message-streams.md)
- [Atividades](./defining-workflows/activities.md) e
  [garantias de execução](./constraints/execution-guarantees.md)
- [Falhas e recuperação](./failures-and-recovery.md)
- [Aplicativo de exemplo](./sample-app.md)
