---
sidebar_position: 14
tags:
  - continue-as-new
  - histórico
  - fluxos-de-mensagens
  - workflows
keywords:
  - continuar como novo
  - crescimento do histórico do workflow
  - transferência entre execuções
  - transferência de fluxo de mensagens
---

# Continuar como novo {#continue-as-new}

O padrão **Continuar como novo** permite que um workflow em execução reinicie a si mesmo com novos argumentos.
Isso é útil quando você precisa:

* Impedir o crescimento ilimitado do histórico do workflow.
* Modelar loops iterativos ou workflows recursivos.
* Dividir workflows de longa duração em execuções menores e gerenciáveis, preservando a continuidade.

## Uso de `continueAsNew` {#using-continueasnew}

Para reiniciar um workflow como novo, chame o helper `continueAsNew(...)` dentro do método `handle()` do workflow. `continueAsNew()` é uma transição de execução própria.

```php
use function Workflow\V2\activity;
use function Workflow\V2\continueAsNew;
use Workflow\V2\Workflow;

class CounterWorkflow extends Workflow
{
    public function handle(int $count = 0, int $max = 3)
    {
        $result = activity(CountActivity::class, $count);

        if ($count >= $max) {
            return [
                'count' => $result,
                'workflow_id' => $this->workflowId(),
                'run_id' => $this->runId(),
            ];
        }

        return continueAsNew($count + 1, $max);
    }
}
```

Neste exemplo:

* O workflow executa uma atividade a cada iteração.
* Se a contagem máxima ainda não tiver sido atingida, continua como novo com os argumentos incrementados.
* O resultado final só é retornado quando o loop termina.

Quando um workflow continua como novo:

- O ID da instância permanece estável em toda a cadeia; `WorkflowStub::runId()` avança para a execução mais recente.
- A execução que continua é encerrada como `completed` / `continued`, e a próxima inicia imediatamente com um novo ID de execução.
- Sinais, consultas, atualizações e comandos do operador com escopo de instância resolvem a execução durável mais recente. Comandos explicitamente direcionados a uma execução continuam vinculados à execução selecionada.

O Core 2.7.0 e Servers compatíveis preservam sinais recebidos com escopo de
instância cujo handler esteja declarado no contrato de comandos da execução
e que a execução anterior ainda não tenha aplicado. Eles são transferidos
junto com atualizações aceitas pendentes, na ordem original dos comandos.
IDs de sinais e comandos, bytes dos argumentos e horários de recebimento
permanecem inalterados. Um sinal já aplicado não é entregue novamente à
sucessora. Mantenha o estado de negócio necessário à próxima execução nos
argumentos passados a `continueAsNew()`. Estado local arbitrário não é copiado automaticamente.

Um sinal direcionado a uma execução nunca é redirecionado. Se não puder ser
aplicado antes do encerramento da execução, recebe a rejeição explícita
descrita em [aceitação e encerramento de sinais](./signals.md#acceptance-and-closure).
A ausência de declarações legadas não autoriza a transferência. Esses sinais
são encerrados explicitamente na execução antecessora.

Loops de longa duração podem descartar o histórico sem inventar um novo ID público de workflow a cada avanço para uma nova execução.

## Limites do histórico {#history-budget}

O código do workflow pode observar o tamanho atual do histórico e um indicador de sugestão de continuar como novo por meio do contexto explícito do runtime. Isso permite que loops de longa duração façam a transferência deliberadamente antes de atingir os limites do histórico.

```php
use function Workflow\V2\activity;
use function Workflow\V2\continueAsNew;
use Workflow\V2\Workflow;

class PollingWorkflow extends Workflow
{
    public function handle(int $iteration = 0)
    {
        $result = activity(PollActivity::class);

        if ($this->shouldContinueAsNew()) {
            return continueAsNew($iteration + 1);
        }

        return ['result' => $result, 'iteration' => $iteration];
    }
}
```

### Métodos disponíveis {#available-methods}

| Método | Tipo de retorno | Descrição |
| --- | --- | --- |
| `$this->historyLength()` | `int` | Número de eventos de histórico na execução atual |
| `$this->historySize()` | `int` | Tamanho total dos eventos de histórico em bytes |
| `$this->shouldContinueAsNew()` | `bool` | `true` quando a execução excede o limite configurado de quantidade de eventos ou tamanho em bytes |

### Configuração {#configuration}

Os limites para recomendar continuar como novo são configuráveis:

```php
// config/workflows.php
'v2' => [
    'history_budget' => [
        'continue_as_new_event_threshold' => 10000,
        'continue_as_new_size_bytes_threshold' => 5242880, // 5 MB
    ],
],
```

`shouldContinueAsNew()` retorna `true` quando qualquer um dos limites é ultrapassado. Os resumos de execução também acompanham `history_event_count`, `history_size_bytes` e `continue_as_new_recommended`, para que o Waterline possa sinalizar execuções de longa duração nas visões da frota.

## Transferência de metadados {#metadata-carry-forward}

Quando um workflow continua como novo, a nova execução herda automaticamente os metadados da anterior:

| Metadado | Comportamento de transferência |
| --- | --- |
| Atributos de busca | O mapa mesclado completo é transferido, incluindo inserções e atualizações feitas durante a execução |
| Memo | O mapa mesclado completo é transferido, incluindo inserções e atualizações feitas durante a execução |
| Rótulos de visibilidade | Transferidos sem alterações (definidos uma vez no início) |
| Chave de negócio | Transferida sem alterações |
| Marcador de compatibilidade | Transferido para que a nova execução direcione o mesmo build de worker |
| Posição do cursor de mensagens | Transferida para que a nova execução saiba quais mensagens de entrada já foram consumidas por [Fluxos de mensagens](./message-streams.md) |

A nova execução inicia com os metadados herdados e pode continuar inserindo e atualizando atributos de busca e memo a partir deles. Assim, um workflow de polling de longa duração pode acumular metadados entre gerações sem perder estado ao descartar o histórico.

```php
use function Workflow\V2\{activity, continueAsNew, upsertMemo, upsertSearchAttributes};
use Workflow\V2\Workflow;

class PollingWorkflow extends Workflow
{
    public function handle(int $iteration = 0)
    {
        $result = activity(PollActivity::class);

        upsertSearchAttributes(['iteration' => (string) $iteration, 'status' => 'polling']);
        upsertMemo(['last_result' => $result, 'iteration' => $iteration]);

        if ($this->shouldContinueAsNew()) {
            // The new run inherits all search attributes and memo
            return continueAsNew($iteration + 1);
        }

        return ['result' => $result, 'iteration' => $iteration];
    }
}
```

Para loops de longa duração com entrada humana ou de assistentes, prefira a
fachada própria `$this->inbox()` / `$this->outbox()` de
[Fluxos de mensagens](./message-streams.md). Mensagens pendentes do fluxo e a
posição do cursor passam à nova execução, enquanto mensagens consumidas
permanecem na execução original como evidência histórica.
