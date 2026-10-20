---
sidebar_position: 19
title: Tempos limite
description: Limites de tempo de workflows e atividades, seus resultados e a limpeza antes do encerramento.
---

# Tempos limite {#timeouts}

Os tempos limite do workflow permitem limitar por quanto tempo ele pode executar. Há dois escopos:

- **Tempo limite da execução completa**: limita o tempo real total de todas as execuções de uma instância de workflow, incluindo as transições continue-as-new. O prazo é calculado uma vez no início e preservado sem alterações.
- **Tempo limite de cada execução**: limita uma execução individual. O prazo é recalculado no início de cada execução, inclusive após continue-as-new.

Ambos são opcionais e podem ser combinados.

## Configuração {#configuration}

Os tempos limite são configurados por `StartOptions` ao iniciar um workflow:

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class, 'order-123');

$workflow->start(
    $orderId,
    StartOptions::rejectDuplicate()
        ->withExecutionTimeout(7200)   // 2 hours across all runs
        ->withRunTimeout(3600),        // 1 hour per run
);
```

### Tempo limite da execução completa {#execution-timeout}

O tempo limite da execução completa abrange toda a instância do workflow. Se ela usa continue-as-new, o prazo permanece igual em todas as execuções da cadeia.

```php
StartOptions::rejectDuplicate()->withExecutionTimeout(86400); // 24 hours
```

O valor é armazenado no modelo `WorkflowInstance` e o prazo calculado fica registrado em cada `WorkflowRun`.

### Tempo limite de cada execução {#run-timeout}

O tempo limite de cada execução se aplica a uma única execução. Após continue-as-new, a nova execução recebe um prazo calculado a partir do instante atual mais o tempo limite configurado.

```php
StartOptions::rejectDuplicate()->withRunTimeout(1800); // 30 minutes per run
```

### Validação {#validation}

Os valores devem ser de pelo menos 1 segundo. Passar zero ou um valor negativo lança `LogicException`:

```php
// Throws LogicException: "Workflow v2 execution timeout must be at least 1 second."
StartOptions::rejectDuplicate()->withExecutionTimeout(0);
```

### Plano de controle {#control-plane}

Também é possível definir os tempos limite ao iniciar um workflow pelo plano de controle:

```php
$controlPlane->start('my-app.order-workflow', 'order-123', [
    'execution_timeout_seconds' => 7200,
    'run_timeout_seconds' => 3600,
]);
```

A resposta `describe` inclui os tempos limite e seus prazos:

```php
$description = $controlPlane->describe('order-123');

$description['execution_timeout_seconds']; // 7200
$description['run']['run_timeout_seconds']; // 3600
$description['run']['execution_deadline_at']; // ISO 8601 timestamp
$description['run']['run_deadline_at'];       // ISO 8601 timestamp
```

### Waterline {#waterline}

Quando há tempos limite configurados, a visão de detalhes da execução no Waterline mostra suas durações e os prazos calculados.

### Histórico {#history}

Os dados do evento de histórico `WorkflowStarted` incluem os tempos limite e os prazos quando configurados:

```json
{
    "execution_timeout_seconds": 7200,
    "run_timeout_seconds": 3600,
    "execution_deadline_at": "2026-04-12T14:00:00+00:00",
    "run_deadline_at": "2026-04-12T13:00:00+00:00"
}
```

### Continue-as-new {#continue-as-new}

Quando um workflow usa continue-as-new:

- O **prazo da execução completa** é preservado sem alterações desde a execução anterior.
- O **tempo limite de cada execução** é mantido, mas o **prazo dessa execução** é recalculado a partir do instante atual.

Assim, o tempo limite da execução completa é sempre medido desde o início original, enquanto cada nova execução recebe sua própria janela.

## Aplicação dos limites {#enforcement}

Os tempos limite do workflow são aplicados em dois pontos:

1. **Ao iniciar uma tarefa de workflow**: cada tarefa verifica `deadlineExpired()` antes de executar o workflow. Se o prazo venceu, a execução é encerrada imediatamente por tempo limite.
2. **Pelo TaskWatchdog**: o watchdog procura execuções não terminais com prazo completo ou individual vencido e sem tarefa de workflow aberta. Ele cria e despacha uma tarefa de prazo expirado, que aplica o encerramento na próxima execução da tarefa.

Quando um tempo limite vence, o motor:

- Cancela todas as tarefas abertas de atividade, temporizador e workflow, exceto a atual
- Cancela todas as execuções de atividade abertas e registra eventos `ActivityCancelled`
- Cancela todos os temporizadores pendentes e registra eventos `TimerCancelled`
- Registra um `WorkflowFailure` com `failure_category = timeout` e `WorkflowTimeoutException`
- Registra o evento terminal `WorkflowTimedOut` com `timeout_kind` igual a `execution_timeout` ou `run_timeout`
- Aplica a política de encerramento do pai aos workflows filhos abertos
- Notifica os workflows pais se esta era uma execução filha

A linha de falha armazena `Workflow\V2\Exceptions\WorkflowTimeoutException` como classe da exceção, com `timeout_kind` e o instante do prazo para inspeção programática.

### Resultado do tempo limite e limpeza {#timeout-outcome-and-cleanup}

Um prazo de workflow encerra a execução com estado `failed` e `closed_reason = timed_out`. O evento terminal é `WorkflowTimedOut`. O runtime registra `WorkflowTimeoutException` como dados da falha. Ele **não** lança essa exceção dentro do corpo do workflow nem retoma seu código para limpeza. Os blocos `catch` e `finally` e as compensações de saga registradas não executam quando o motor aplica esse prazo.

Cancelar a execução durável de uma atividade não desfaz um efeito externo nem prova que seu callback parou. Use operações idempotentes e reconciliação da própria aplicação para os efeitos que já podem ter sido confirmados.

Se for preciso limpar após um prazo da aplicação, use um temporizador durável mais curto ou uma espera com tempo limite que permita executar [compensação antes do encerramento](./sagas.md#deadline-driven-compensation). Reserve tempo para novas tentativas de atividades, agendamento de workers e limpeza antes de qualquer um dos prazos do motor. O tempo limite do motor continua sendo o limite final. Um worker atrasado pode alcançá-lo antes de terminar a compensação.

Os comandos imediatos `cancel()` e `terminate()` também encerram a execução sem dar tempo ao código de limpeza. A operação cooperativa independente `requestCancellation()` pode entregar uma limpeza limitada a um worker compatível enquanto a execução estiver ativa. Um tempo limite de workflow não se transforma automaticamente em solicitação de cancelamento cooperativo, e uma proteção contra cancelamento não amplia o prazo completo ou individual. Consulte [Cancelar e terminar](./cancel-and-terminate.md) e [Cancelamento cooperativo](../polyglot/cancellation.md).

## Lease de uma tarefa de workflow {#workflow-task-lease}

Uma tarefa de workflow é uma rodada de um worker que reproduz o histórico confirmado e produz comandos duráveis. Não é o workflow inteiro. Esperar um temporizador durável, uma atividade em fila ou um sinal durável não mantém uma única tarefa durante toda a espera; uma tarefa posterior retoma a execução.

| Implantação | Segundos padrão | Configuração |
| --- | --- | --- |
| Laravel embutido | `300` | `DW_V2_WORKFLOW_TASK_LEASE_SECONDS` |
| Server | `60` | `DW_WORKFLOW_TASK_TIMEOUT` |

A configuração embutida corresponde a `workflows.v2.workflow_task_lease_seconds`. Na inicialização, o Server aplica sua própria configuração a essa chave do pacote. Portanto, use a configuração do Server no Server. É uma configuração do runtime, não uma opção de `StartOptions` nem um timeout de atividade por início. Veja [Publicação da configuração](../configuration/publishing-config.md#workflow-task-lease-v2) e a [referência de configuração do Server](../polyglot/server-config-reference.md#worker-protocol-and-query-transport).

### Heartbeats e execução {#workflow-task-heartbeats}

Workers em modo de serviço usam heartbeats de tarefa para renovar a posse de uma tarefa de workflow em andamento. O Server valida a tarefa, a tentativa e o proprietário da lease. Uma renovação confirmada usa a duração efetiva da lease, respeitando os limites aplicáveis à limpeza de cancelamento. Ela não altera os prazos originais da execução/run nem os timeouts de atividades. Um heartbeat de registro do worker informa apenas a presença na frota; um heartbeat de atividade informa o progresso daquela atividade. Nenhum substitui a renovação de uma tarefa de workflow.

Código síncrono de workflow embutido não pode renovar periodicamente enquanto está bloqueado. Mantenha o código determinístico e curto; coloque trabalho longo de E/S ou CPU em atividades. A lease não é um limite rígido de execução do processo ou da CPU.

### Expiração da lease {#workflow-task-lease-expiry}

Uma posse expirada e inacabada se torna elegível para recuperação. Matching/watchdog ou o reparo limpa a posse expirada e despacha o trabalho novamente para que um worker compatível reproduza o histórico confirmado. A recuperação exige processos de recuperação em execução, banco de dados disponível e worker elegível. A expiração não mata o processo anterior nem garante reentrega imediata. No Server, uma posse expirada ou substituída não pode enviar novos comandos; uma renovação recusada deve ser tratada como perda de autoridade.

O reparo não reabre uma execução fechada, não concede tentativas de negócio extras nem reinicia prazos originais. Já `startToCloseTimeout` limita uma tentativa de atividade conforme sua política de repetição registrada. Os timeouts de run e execução limitam a vida do workflow; renovar ou reproduzir uma tarefa de workflow não os prolonga.

## Tempos limite das atividades {#activity-timeouts}

Os tempos limite das atividades permitem limitar a duração de cada atividade. Há quatro escopos:

- **Schedule-to-start**: limita o tempo entre o agendamento e a primeira reivindicação do worker. Aplica-se enquanto a atividade está `Pending`.
- **Start-to-close**: limita o tempo desde que um worker reivindica a atividade até sua conclusão. Reinicia a cada tentativa.
- **Schedule-to-close**: limita o tempo real total entre o agendamento e o fim, incluindo todas as tentativas. É sempre terminal: tentar novamente não ajuda se o prazo total já venceu.
- **Heartbeat**: limita o tempo entre heartbeats. Em atividades longas que chamam `$this->heartbeat()`, o motor exige um heartbeat dentro do intervalo configurado ou considera que a atividade não responde.

Todos são opcionais e podem ser combinados. Configure-os com `ActivityOptions` ao chamar uma atividade:

```php
use function Workflow\V2\activity;
use Workflow\V2\Support\ActivityOptions;

$result = activity(
    LongRunningActivity::class,
    new ActivityOptions(
        scheduleToStartTimeout: 30,     // must be claimed within 30s
        startToCloseTimeout: 300,       // each attempt has 5 minutes
        scheduleToCloseTimeout: 600,    // total 10 minutes across all retries
        heartbeatTimeout: 15,           // must heartbeat every 15 seconds
        maxAttempts: 3,
    ),
    $input,
);
```

### Tempo limite entre agendamento e início {#schedule-to-start-timeout}

O prazo é calculado ao agendar a atividade. Se nenhum worker a reivindicar antes, `TaskWatchdog` aplica o tempo limite. Se restarem tentativas, uma nova tarefa de atividade é agendada com a espera registrada e o prazo schedule-to-start é recalculado a partir do instante em que a nova tentativa fica disponível. Cada tentativa recebe uma nova janela. Se `scheduleToStartTimeout` não foi configurado, o prazo é removido ao tentar novamente. Se as tentativas se esgotarem, o evento terminal `ActivityTimedOut` é registrado e o workflow é despertado.

### Tempo limite entre início e encerramento {#start-to-close-timeout}

O prazo é calculado quando um worker reivindica a tarefa de atividade. Cada tentativa recebe um novo prazo start-to-close. Se a atividade não terminar a tempo, a tentativa atual é encerrada. Se restarem tentativas, a execução volta a `Pending` com um novo prazo schedule-to-start, se configurado, para evitar que a nova tentativa expire imediatamente. Se as tentativas se esgotarem, um tempo limite terminal é registrado.

### Tempo limite entre agendamento e encerramento {#schedule-to-close-timeout}

O prazo é calculado uma vez no agendamento e nunca reinicia. Ao vencer, a atividade falha de forma terminal imediatamente, mesmo que restem tentativas, pois todo o tempo real permitido já passou. Isso limita o custo total de uma atividade instável que, de outra forma, poderia repetir indefinidamente dentro dos limites de cada tentativa.

### Tempo limite de heartbeat {#heartbeat-timeout}

O prazo inicial é calculado quando um worker reivindica a tarefa de atividade. Cada chamada bem-sucedida a `$this->heartbeat()` estende o prazo pelo intervalo configurado. Se a atividade não chamar `heartbeat()` antes do vencimento, o motor considera que o worker não responde. Se restarem tentativas, uma nova é agendada com o prazo schedule-to-start reiniciado, se configurado. Caso contrário, um tempo limite terminal é registrado.

```php
use Workflow\V2\Activity;

class LongRunningActivity extends Activity
{
    public function handle($input)
    {
        foreach ($items as $item) {
            $this->heartbeat(['processed' => $count]);
            // ... process item ...
        }
    }
}
```

### Aplicação dos limites {#enforcement-1}

Os tempos limite das atividades são aplicados pelo `TaskWatchdog` a cada passagem do loop do worker. Ele procura execuções cujas colunas de prazo já venceram e delega para `ActivityTimeoutEnforcer`. Cada aplicação registra:

- Um evento terminal `ActivityTimedOut` com `timeout_kind` igual a `schedule_to_start`, `start_to_close`, `schedule_to_close` ou `heartbeat`
- Uma linha `WorkflowFailure` com `failure_category = timeout` e `propagation_kind = timeout`
- Uma tarefa de retomada para despertar o workflow pai e permitir que observe a falha

O Waterline mostra nos detalhes da atividade a política de novas tentativas com todos os tempos limite configurados. A linha do tempo indica o tipo de tempo limite na mensagem do evento correspondente.

### O que ainda não está implementado {#what-is-not-yet-covered}

Os seguintes recursos estão planejados, mas ainda não foram implementados:

- Políticas de novas tentativas no nível do workflow

### Limites estruturais {#structural-limits}

O motor aplica falhas tipadas de limites estruturais para tamanho de payloads, quantidade de tarefas pendentes de fan-out e limites de metadados. Consulte [Limites estruturais](../constraints/structural-limits.md) para conhecer o contrato, a configuração e a classificação das falhas.