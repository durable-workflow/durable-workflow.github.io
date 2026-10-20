---
sidebar_position: 8
---

# Heartbeats {#heartbeats}

Os heartbeats permitem que uma atividade de longa duração informe que sua tentativa atual continua ativa.

`heartbeat()` atualiza a linha de `activity_attempts` reivindicada no momento, replica o heartbeat mais recente na execução ativa da atividade, renova a concessão da tarefa dessa atividade e acrescenta um evento tipado `ActivityHeartbeatRecorded` ao histórico da tentativa atual. Os detalhes da execução selecionada no Waterline e as exportações de histórico reconstroem o status da tentativa, o ID da tarefa, o worker, o heartbeat, a concessão e os horários de cancelamento e encerramento primeiro a partir do histórico tipado de `ActivityStarted`, `ActivityHeartbeatRecorded`, `ActivityRetryScheduled`, `ActivityCompleted`, `ActivityFailed` e `ActivityCancelled`. As linhas mutáveis das tentativas ficam disponíveis como alternativa ou complemento para dados antigos.

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

O runtime registra uma linha durável própria para cada tentativa de atividade, incluindo número da tentativa, status, horário de início, heartbeat mais recente, expiração da concessão e horário de encerramento. Também registra o histórico tipado das tentativas conforme as atividades iniciam, enviam heartbeats, repetem, concluem, falham ou são canceladas. Assim, os detalhes históricos sobrevivem mesmo que linhas mutáveis de tentativas ou tarefas divirjam depois. Cada heartbeat bem-sucedido da tentativa reivindicada no momento registra um ponto compacto `ActivityHeartbeatRecorded` na linha do tempo, com o ID da execução da atividade, o ID da tentativa, o horário do heartbeat, a expiração da concessão e um instantâneo da atividade no momento do evento. Se um comando de cancelamento ou término fechar a execução, a ponte registra `ActivityCancelled` quando o worker observa a parada e rejeita conclusões ou falhas posteriores como obsoletas, em vez de transformar o cancelamento em resultado.

Heartbeats são sinais operacionais de que o trabalho continua ativo. Como cada heartbeat aceito passa a integrar o histórico durável, escolha um intervalo adequado às necessidades de tempo limite e recuperação, sem usá-lo como um log de progresso de alto volume. Mantenha o instantâneo opcional compacto o suficiente para o diagnóstico pelo operador, sem tratá-lo como um fluxo contínuo de eventos.
