---
sidebar_position: 8
---

# Heartbeats {#heartbeats}

Os heartbeats permitem que uma atividade de longa duração informe que sua tentativa atual continua ativa.

`heartbeat()` atualiza a linha de `activity_attempts` reivindicada no momento com o horário do heartbeat e o progresso mais recente, reflete o último heartbeat na execução de atividade ativa e renova o lease dessa tarefa de atividade. Ele grava um evento de histórico `ActivityHeartbeatRecorded` apenas quando o progresso mudou, no máximo uma vez por intervalo de registro (veja abaixo). O detalhe da execução selecionada no Waterline e as exportações de histórico leem o último heartbeat e o progresso da linha da tentativa, e reconstroem o status da tentativa, o id da tarefa, o worker, o lease, o cancelamento e os horários de encerramento a partir do histórico tipado `ActivityStarted`, `ActivityHeartbeatRecorded`, `ActivityRetryScheduled`, `ActivityCompleted`, `ActivityFailed` e `ActivityCancelled`, com as linhas de tentativa como alternativa para dados antigos.

```php
use Workflow\V2\Activity;

final class PollRemoteJob extends Activity
{
    public function handle(string $jobId): array
    {
        do {
            sleep(1);

            $status = RemoteService::status($jobId);

            $this->heartbeat([
                'message' => 'Polling remote job',
                'current' => $status['completed'] ?? null,
                'total' => $status['total'] ?? null,
                'unit' => 'steps',
                'details' => [
                    'remote_state' => $status['state'] ?? 'running',
                ],
            ]);
        } while ($status['state'] === 'running');

        return $status;
    }
}
```

Dentro da atividade, `activityId()`, `attemptId()` e `attemptCount()` expõem a identidade da execução durável e da tentativa atual quando você precisa de chaves de correlação para trabalho externo. Use `activityId()` como chave padrão de idempotência remota. Use `attemptId()` apenas para sistemas que precisam distinguir tentativas da mesma execução durável de atividade.

Workers poliglotas podem enviar heartbeats pela ponte HTTP de workers sem instanciar a classe de atividade PHP. Consulte os endpoints no [protocolo de workers](/docs/polyglot/worker-protocol).

Uma chamada bloqueante pode precisar de uma auxiliar dedicada a heartbeats.
Ela indica que o processo está vivo, não que está progredindo. Dê à chamada
um prazo finito próprio e pare a auxiliar quando ela terminar ou perder a
autoridade. No Python, siga o [exemplo de captura do contexto e cancelamento](../polyglot/python.md#heartbeat-helper-thread).

## Cadência e confirmações {#heartbeat-cadence-and-receipts}

Para uma atividade em fila, o primeiro prazo de heartbeat começa quando o runtime a reivindica, antes da entrega da tarefa e da execução do código do usuário. Um heartbeat registrado define o próximo prazo como seu horário no runtime mais `heartbeatTimeout`. Enviar a requisição ou receber sua resposta não inicia outra janela completa. Consulte [Tempo limite de heartbeat](./timeouts.md#heartbeat-timeout).

Escolha uma cadência com bastante margem dentro dessa janela e limite o trabalho entre chamadas. Com um tempo limite de 15 segundos, um alvo de cerca de cinco segundos pode ser um ponto de partida somente se a entrega, cada lote ou chamada de E/S, as pausas de execução, a latência da rede e as novas tentativas de transporte couberem no orçamento restante. Meça esses atrasos e deixe margem. É uma orientação de planejamento, não um intervalo seguro garantido. Uma tentativa expirada ou substituída não recupera seu lease enviando um heartbeat atrasado.

Não há agenda automática de heartbeats de progresso nem garantia de agrupamento no SDK. Heartbeats de registro do worker e verificações de propriedade não publicam progresso de atividade. Cada heartbeat aceito renova o lease e move o prazo de heartbeat. Um evento de histórico só é gravado quando o progresso difere do último registrado e passou pelo menos o maior valor entre o tempo limite de heartbeat e 60 segundos desde esse evento. Um heartbeat sem progresso apenas comprova atividade e não grava histórico. O progresso retido pelo intervalo é registrado uma vez quando a tentativa é encerrada. Um heartbeat por segundo durante uma hora com o mesmo progresso grava um evento. Históricos anteriores mantêm os eventos por heartbeat que já registraram.

No modo embarcado, `Activity::heartbeat()` retorna `void`. Progresso inválido e falhas de armazenamento podem lançar exceções. Um retorno normal não é um objeto de confirmação: uma tentativa encerrada, expirada ou substituída pode retornar sem registrar outro heartbeat. No modo de serviço, o tratamento de erros difere entre chamadas diretas ao cliente e workers supervisionados. Consulte os guias de [PHP](../polyglot/php.md#activity-heartbeats), [Python](../polyglot/python.md#activity-heartbeat-requests) e [Rust](../polyglot/rust.md#activity-heartbeats).

O progresso de heartbeat não confirma atomicamente um lote externo nem impede efeitos de um detentor obsoleto. Um checkpoint de aplicação seguro para novas tentativas precisa de seu próprio commit durável, uma chave lógica de trabalho estável e idempotência ou controle externo de posse. O acesso de uma tentativa substituta a checkpoints confirmados é acompanhado separadamente no [recurso de checkpoints](https://github.com/durable-workflow/.github/issues/218).

## Instantâneos de progresso {#progress-snapshots}

Tanto `Activity::heartbeat()` quanto `ActivityTaskBridge::heartbeat()` aceitam um instantâneo de progresso opcional com limites definidos:

- `message`
  - string não vazia de até 280 caracteres
- `current`
  - inteiro ou número de ponto flutuante não negativo
- `total`
  - inteiro ou número de ponto flutuante não negativo
- `unit`
  - string não vazia de até 64 caracteres
- `details`
  - mapa plano com até 20 entradas `key => scalar|null`, cujas chaves correspondem a `[A-Za-z0-9_.:-]{1,64}`

Use esse payload para informar progresso ao operador, como `"Downloading chunk"` ou `2 / 5 chunks`, sem incluir logs extensos ou estado aninhado arbitrário. Os detalhes da execução selecionada no Waterline, a entrada de heartbeat na linha do tempo e a exportação de histórico o expõem como `last_heartbeat_progress` na atividade e na tentativa atual. O evento bruto tipado `ActivityHeartbeatRecorded` mantém o mesmo payload normalizado em `progress`.

## Rastreamento durável de tentativas {#durable-attempt-tracking}

O runtime registra uma linha durável própria por tentativa de atividade, com número da tentativa, status, horário de início, último heartbeat e progresso, expiração do lease e horário de encerramento. Ele também registra histórico tipado da tentativa quando atividades começam, enviam heartbeat, tentam de novo, concluem, falham ou são canceladas, para que o detalhe histórico sobreviva mesmo se linhas mutáveis de tentativa ou tarefa divergirem depois. Um heartbeat registrado adiciona um ponto compacto `ActivityHeartbeatRecorded` na linha do tempo com o id da execução da atividade, o id da tentativa, o horário do heartbeat, a expiração do lease, o progresso e um snapshot da atividade naquele momento. Se um comando cancel ou terminate encerra a execução, a ponte registra `ActivityCancelled` quando o worker observa a parada e rejeita conclusão ou falha posteriores como obsoletas, em vez de transformar o cancelamento em resultado.

Heartbeats são sinais operacionais de atividade. Envie heartbeats com a frequência que seus tempos limite e sua recuperação exigirem. Heartbeats que só indicam atividade não adicionam histórico, e mudanças de progresso são registradas no máximo uma vez por intervalo. Mantenha o snapshot opcional de progresso compacto o suficiente para diagnóstico de operadores, em vez de tratá-lo como um fluxo de eventos.
