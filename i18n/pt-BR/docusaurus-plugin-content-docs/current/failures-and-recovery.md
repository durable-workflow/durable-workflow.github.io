---
sidebar_position: 11
title: Falhas e recuperação
description: Diagnostique falhas de atividades, exceções permanentes, timeouts de execução, limpeza de cancelamento e ações de recuperação.
tags:
  - failures
  - recovery
  - operations
keywords:
  - falhas de workflow
  - exceção permanente
  - recuperação de workflow
---

# Falhas e recuperação {#failures-and-recovery}

Antes de investigar uma falha, lembre-se do contrato central de execução:

- tarefas de workflow se recuperam por replay do histórico confirmado
- atividades executam pelo menos uma vez e podem ser observadas mais de uma vez
- expiração de leases e reentrega são caminhos normais de recuperação, sem
  provar que o worker anterior deixou de realizar o efeito externo

Leia [Garantias de execução e idempotência](./constraints/execution-guarantees.md)
para entender as regras exatas de novas tentativas, reentrega e resultados
duráveis.

## Tratamento de exceções {#handling-exceptions}

`Workflow\V2\Activity` usa `$tries = 1` por padrão: uma tentativa, sem repetição automática após uma exceção. A primeira falha da atividade é devolvida ao workflow. O código pode capturá-la, como no exemplo; se não tratar a exceção, a execução falha e se torna terminal.

Novas tentativas precisam ser configuradas explicitamente. Defina `$tries` acima de `1` para permitir mais tentativas, ou como `0` para tentativas ilimitadas, e escolha uma política de `backoff()`. Uma falha que permite repetição só é entregue ao código do workflow quando o orçamento configurado de tentativas ou de tempo se esgota. Uma falha não repetível ignora as tentativas restantes.

```php
use Exception;
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public int $tries = 1;

    public function handle(): void
    {
        throw new Exception();
    }
}
```

```php
use Exception;
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(): void
    {
        try {
            $result = activity(MyActivity::class);
        } catch (Exception) {
            // handle the exception here
        }
    }
}
```

## Exceções que não permitem novas tentativas {#non-retryable-exceptions}

Algumas exceções representam falhas permanentes que não devem provocar uma
nova tentativa. Quando uma atividade lança uma dessas exceções, o mecanismo
marca a atividade como falha imediatamente e interrompe as tentativas.

```php
use Workflow\V2\Activity;
use Workflow\Exceptions\NonRetryableException;

class MyNonRetryableActivity extends Activity
{
    public function handle(): void
    {
        throw new NonRetryableException('This is a non-retryable error');
    }
}
```

## Processo de recuperação {#recovery-process}

Primeiro, consulte o estado durável da execução selecionada e a política de novas tentativas da atividade. Com a tentativa única padrão, uma falha de atividade não tratada já tornou a execução terminal. Implantar uma correção ou chamar `repair()` não reabre essa execução com falha.

Corrigir o código enquanto a execução original aguarda só é possível se a atividade ainda tiver uma tentativa válida disponível. Configure `$tries` acima de `1`, ou como `0` para tentativas ilimitadas, com `backoff()` antes de agendar a atividade. Opcionalmente, defina `ActivityOptions::$scheduleToCloseTimeout` para limitar a duração total da atividade entre todas as tentativas; os prazos do workflow continuam valendo. Consulte [Novas tentativas](./configuration/options.md#retries), [Intervalo entre tentativas](./configuration/options.md#backoff) e [ActivityOptions](./configuration/options.md#activityoptions). A política é armazenada ao agendar a atividade; uma implantação posterior não amplia seus orçamentos de tentativas ou de tempo.

Para uma execução que ainda aguarda uma atividade que permite novas tentativas:

1. Consulte seus logs e identifique os erros ou exceções.
2. Encontre a causa e corrija o código.
3. Implante a correção onde os workers da fila são executados.
4. Reinicie ou substitua gradualmente os workers relevantes para que carreguem o novo código e adquiram trabalho com segurança.
5. Deixe um worker saudável executar a próxima tentativa válida. Reparo ou reentrega pode recuperar o transporte de tarefas perdido; não concede outra tentativa de negócio depois que a atividade ou a execução se encerra.
6. Verifique o resultado durável no Waterline, na exportação do histórico ou na API do Server. Uma linha de log de um worker não é a fonte de verdade.
7. Se a atividade continuar falhando, confira os orçamentos restantes de tentativas e de tempo antes de repetir o processo.

Uma execução com uma tentativa válida disponível permanece aguardando e pode continuar quando o código corrigido tiver sucesso, desde que seus orçamentos originais não tenham expirado. Isso não garante corrigir todo workflow no mesmo lugar: uma falha final de atividade não tratada, uma falha do código do workflow, um limite estrutural ou um prazo do workflow podem tornar a execução terminal.

Para uma execução terminal com falha, preserve o histórico e reconcilie os efeitos externos antes de decidir se a aplicação deve iniciar outro workflow. Use idempotência na aplicação para operações de negócio repetidas. Não há repetição automática do workflow inteiro nem reabertura de execução terminal; consulte [Novas tentativas no nível do workflow](#workflow-level-retry).

## Recusa de entrada e recuperação no modo de serviço {#service-entry-recovery}

**Suporte publicado.** O Server 2.9.9 e os SDKs PHP 2.5.4, Python 2.6.2 e Rust 3.5.6 introduziram as proteções de entrada e o comportamento de roteamento e recuperação descritos abaixo. Essas são as versões mínimas para esses recursos; instale as versões estáveis atuais para receber correções de segurança.

Uma entrada incompatível provoca uma recusa de implantação/replay antes de executar o código de workflow da aplicação, não uma nova tentativa de atividade nem uma falha terminal de negócio. O worker informa `failure_reason = workflow_entry_arguments_mismatch`, e o Server mantém a tarefa de workflow com falha e `replay_blocked = true`, sem criar outra tentativa automaticamente. Seu `replay_blocked_reason` genérico é `worker_reported_replay_failure`. A execução permanece não terminal, com entrada, histórico e prazos registrados intactos. Já uma exceção lançada pelo corpo do workflow após a entrada bem-sucedida ainda pode fazer a execução falhar.

Recupere somente depois de conferir o estado durável real:

1. Inspecione a execução selecionada com `GET /api/workflows/{workflowId}/runs/{runId}/debug`. Confirme que `latest_workflow_task_failure.reason` é `workflow_entry_arguments_mismatch` e que o original continua aberto. Esse procedimento não reabre uma execução terminal.
2. Implante código que aceite os argumentos posicionais ou a entrada tipada registrados. Preserve os ids originais de workflow e execução, namespace, fila, compatibilidade de build, histórico e prazos. Nunca edite a entrada armazenada nem a substitua por novos valores padrão de DTO.
3. Confirme no [roteamento de definições](./polyglot/worker-compatibility-routing.md#definition-fingerprint-evolution) que há um worker elegível. Repair não cria um worker nem comprova compatibilidade de replay.
4. Use `POST /api/workflows/{workflowId}/runs/{runId}/repair` com a credencial normal de operador autorizado e o namespace. A rota da execução selecionada recusa um alvo histórico em vez de reparar silenciosamente uma execução mais recente. PHP também oferece `Client::repairWorkflow($workflowId, $runId)`; `repair_workflow(workflow_id)` do Python aponta para a instância atual, e Rust não tem um método auxiliar de reparo equivalente.
5. Verifique se o mesmo original continua com a entrada e o prefixo do histórico registrados e confirma o resultado esperado uma única vez. Um prazo original já vencido continua valendo. Se a substituição ainda for incompatível, inspecione a nova recusa em vez de repetir repair continuamente.

Versões antigas do Server podem armazenar o motivo específico do SDK sem classificá-lo como bloqueio de replay; informar a falha, por si só, não garante a ausência de novas tentativas automáticas. Use a combinação qualificada de runtime e SDK. Consulte os limites por linguagem em [Versionamento](./features/versioning.md#service-sdk-entry-safeguard) e as rotas autenticadas de execução selecionada em [Comandos de workflow](./polyglot/server-api-reference.md#workflow-commands).

## Aplicação de timeouts do workflow {#workflow-timeout-enforcement}

Quando `StartOptions::withExecutionTimeout()` ou
`StartOptions::withRunTimeout()` é configurado, o mecanismo registra um prazo
na execução do workflow. O prazo de execução lógica abrange o workflow inteiro,
incluindo execuções criadas por continue-as-new. O prazo de uma execução
individual recomeça em cada nova execução.

Se o prazo já tiver passado quando o mecanismo iniciar uma tarefa de workflow,
a execução é encerrada imediatamente:

- Atividades abertas, temporizadores e tarefas pendentes são cancelados, com
  eventos de histórico tipados como `ActivityCancelled` e `TimerCancelled`.
- Um registro `WorkflowFailure` é criado com `failure_category = timeout` e
  `propagation_kind = timeout`.
- Um evento `WorkflowTimedOut` é registrado com `timeout_kind` igual a
  `execution_timeout` ou `run_timeout`.
- O estado da execução passa a `failed`, com `closed_reason = timed_out`.
- Workflows pais que aguardam o filho são notificados.

O monitor de tarefas em segundo plano também procura execuções não terminais
com prazos vencidos e sem tarefa de workflow aberta, como uma execução que
aguarda uma atividade ou temporizador. Ao encontrar uma, cria uma tarefa para
que o executor detecte e aplique o timeout na próxima passagem.

Waterline mostra `failure_category` na coluna **Category** da tabela de
exceções e nos detalhes de falhas da linha do tempo. Exportações de histórico
incluem `failure_category` em `failures[*]`. A v2 final grava essa
classificação quando registra a falha. Registros importados da v1 que não podem
ser classificados continuam visíveis como diagnósticos sem classificação.

## Novas tentativas de atividades {#activity-retries}

Para um orçamento compartilhado de tentativas entre workflows e filas, combine os limites de repetição com [admission do Server e breaker da aplicação](./polyglot/task-queue-admission.md#retry-load-and-downstream-budgets). Primeiras tentativas e repetições contam; a execução local/integrada tem outros limites.

O padrão de `Workflow\V2\Activity` é `$tries = 1`. Assim, uma falha é
entregue ao workflow imediatamente, a menos que a atividade configure mais
tentativas.

```php
use RuntimeException;
use Workflow\V2\Activity;

class ChargeCard extends Activity
{
    public int $tries = 3;

    public function backoff(): array
    {
        return [5, 30];
    }

    public function handle(): string
    {
        throw new RuntimeException('temporary gateway failure');
    }
}
```

No código do workflow, limite o tempo total da atividade, incluindo as esperas na fila e entre tentativas:

```php
use Workflow\V2\Support\ActivityOptions;
use function Workflow\V2\activity;

$result = activity(ChargeCard::class, new ActivityOptions(
    scheduleToCloseTimeout: 120,
));
```

Juntas, essas configurações permitem no máximo três tentativas, com intervalos de 5 e 30 segundos, dentro do prazo original de 120 segundos de schedule-to-close. Se o prazo do workflow vencer antes, ele também se aplica. Habilite novas tentativas apenas para operações que possam ser repetidas com segurança e proteja os efeitos externos com controles de idempotência.

Quando uma atividade que permite novas tentativas lança uma exceção antes de esgotar
`$tries`, o mecanismo encerra o registro atual de `activity_attempts` no
estado do runtime, devolve o registro de `activity_executions` a `pending`,
grava um evento tipado `ActivityRetryScheduled` e cria uma nova tarefa durável.
O valor de `available_at` segue a política de `backoff()`. O workflow continua
aguardando a mesma execução de atividade. Ele só recebe a exceção quando falha
a última tentativa permitida.

A tarefa registra `retry_of_task_id`, `retry_after_attempt_id`,
`retry_after_attempt` e `retry_backoff_seconds` em seu payload, para que
Waterline explique o agendamento. Os detalhes da execução selecionada
reconstroem a tentativa com falha em `activities[*].attempts` a partir do
histórico tipado de atividades, mostram `ActivityRetryScheduled` na linha do
tempo e informam as contagens de novas tentativas em
`operator_metrics.activities.retrying`,
`operator_metrics.activities.failed_attempts` e
`operator_metrics.backlog.retrying_activities`.

`Workflow\Exceptions\NonRetryableExceptionContract` interrompe a política de
novas tentativas. Uma exceção que implementa esse contrato faz a atividade
falhar imediatamente e retoma o workflow com a exceção.

### Resolução do atraso entre tentativas {#retry-delay-resolution}

Os valores de `backoff()` de uma atividade são segundos inteiros. Os intervalos
de novas tentativas duráveis têm resolução de um segundo. Não use uma fração como
`0.1` para pedir uma nova tentativa em 100 ms. As APIs dos SDKs que geram intervalos
a partir de valores fracionários os arredondam para cima, até o próximo segundo
inteiro. As referências dos SDKs Python e Rust descrevem os tipos de parâmetros
aceitos e suas conversões.

A próxima tentativa fica apta a começar após o atraso, mas a latência da fila e a
carga dos workers podem adiá-la ainda mais. Para testes rápidos, use
[tempo controlado ou casos limitados com atraso zero](./testing.md#keeping-delay-tests-fast).

### Identidade e idempotência da atividade {#activity-execution-identity-and-idempotency}

Uma nova tentativa não é o único motivo para observar a mesma atividade lógica
mais de uma vez. Expiração de lease, perda de worker, atraso no relato de
conclusão e reentrega podem produzir outra tentativa ou um relato de conclusão
obsoleto para a mesma execução durável.

- `activity_execution_id` identifica a atividade lógica ao longo de novas
  tentativas e reentregas. Use-o como chave padrão de idempotência de efeitos
  remotos.
- `activity_attempt_id` identifica uma tentativa específica. Use-o apenas
  quando o sistema de destino precisa distinguir as tentativas.
- Um relato tardio de conclusão ou falha de uma tentativa substituída é um
  comportamento normal de tentativa obsoleta. Não prova que o mecanismo
  confirmou a mesma tentativa duas vezes.

Ao investigar uma conclusão tardia após a expiração de um lease:

- consulte Waterline, a exportação de histórico ou a API do Server para saber
  qual tentativa venceu a disputa pelo resultado durável
- não presuma que a rejeição do relato tardio significa que o efeito remoto não
  aconteceu
- verifique o sistema externo pela chave de idempotência antes de forçar uma
  nova tentativa ou um reparo manual

O padrão mais seguro é tornar o efeito remoto idempotente por
`activity_execution_id` e usar o resultado durável para saber se o mecanismo
aceitou o relato daquela tentativa específica.

### Marcadores de falha permanente {#non-retryable-failure-markers}

Quando uma atividade ou workflow lança uma exceção que implementa
`Workflow\Exceptions\NonRetryableExceptionContract`, o mecanismo grava
`non_retryable = true` no registro `WorkflowFailure` e no payload do evento
tipado, como `ActivityFailed`, `WorkflowFailed` ou `UpdateCompleted`.
Esse marcador durável informa a operadores, workers externos e ferramentas que
a falha é permanente e que repetir a mesma operação não terá sucesso.

O marcador aparece em toda a camada de visibilidade:

- **Registros de falha:** coluna booleana `workflow_failures.non_retryable`.
- **Eventos de histórico:** campo `non_retryable` no payload tipado.
- **Snapshots de falha:** `non_retryable` em `FailureSnapshots::forRun()`.
- **Detalhes da execução:** `non_retryable` na lista de exceções.
- **Linha do tempo:** `non_retryable` nos metadados de detalhes da falha.
- **Exportações de histórico:** `non_retryable` em `failures[*]`.
- **Waterline:** marcador “non-retryable” ao lado da categoria de falha na tabela
  de exceções e na linha do tempo.
- **Integração de workers externos:** o payload do comando `complete()` aceita
  `non_retryable`. Workers externos podem informar falhas permanentes sem
  exigir que o processo do runtime resolva a classe da exceção.

Para falhas que não implementam o contrato, `non_retryable` é `false` por
padrão. A v2 final grava o marcador no momento da falha. Declare o contrato antes
de registrar a falha quando operadores ou SDKs precisarem distinguir falhas
permanentes das que permitem novas tentativas.

```php
use Workflow\Exceptions\NonRetryableExceptionContract;

class PaymentDeclinedException extends \RuntimeException implements NonRetryableExceptionContract
{
    // This failure will be marked as non-retryable in the durable record.
}
```

## Novas tentativas do workflow inteiro {#workflow-level-retry}

Durable Workflow v2 **não** inicia automaticamente uma nova tentativa do
workflow inteiro. Quando uma execução falha por exceção não tratada, limite
estrutural ou timeout, seu estado é terminal. O mecanismo não inicia
automaticamente outra execução da mesma instância.

Essa é uma escolha de projeto:

- **Atividades já oferecem novas tentativas.** Políticas com `$tries`,
  `backoff()` e exceções permanentes tratam falhas transitórias na etapa
  apropriada.
- **O replay é o mecanismo de recuperação.** Se uma tarefa de workflow encontra
  uma falha transitória de infraestrutura, como erro de banco ou perda de
  worker, o sistema de tarefas duráveis despacha a tarefa novamente e retoma
  pelo histórico confirmado, sem criar outra execução.
- **Continue-as-new atende workflows longos.** Workflows que precisam renovar o
  estado ou compactar o histórico usam `continueAsNew()` como reinício
  explícito.
- **O reparo recupera execuções presas.** O comando `repair()` e o reparo
  automático no loop do worker recuperam execuções cujo transporte de tarefas
  duráveis foi perdido.

Se sua aplicação precisa tentar novamente o workflow inteiro, modele esse
comportamento explicitamente:

```php
use function Workflow\V2\activity;
use Throwable;
use Workflow\V2\Workflow;

class RetryableWorkflow extends Workflow
{
    public function handle(string $orderId): void
    {
        try {
            activity(ProcessOrderActivity::class, $orderId);
        } catch (Throwable $e) {
            // Record the failure, then start a new workflow
            // for retry-at-workflow-level scenarios.
            activity(NotifyFailureActivity::class, $orderId, $e->getMessage());
        }
    }
}
```

## Limites de relatórios de falha Python no modo de serviço {#python-failure-report-limits}

O SDK Python **2.11.0 ou posterior** limita os relatórios de falha enviados no modo de serviço a mensagens UTF-8 de 62 KiB, pilhas de 128 KiB, 64 KiB de metadados opcionais combinados e um corpo completo codificado de 1 MiB, incluindo os marcadores. Limites de transporte conhecidos menores são respeitados. O [guia de relatórios Python](./polyglot/python.md#bounded-failure-reports) explica a configuração, os diagnósticos de omissão, a semântica de novas tentativas preservada e a igualdade entre a primeira execução local e o replay a frio. Esses limites se aplicam aos relatórios do SDK. O registro embarcado e o armazenamento de resumos do Core mantêm contratos separados.

## Limites de relatos de falha Rust no modo serviço {#rust-failure-report-limits}

Em workers de serviço realmente executando Rust SDK **4.10.1 ou posterior**, mensagem enviada tem até 62 KiB UTF-8 com marcador, stack 128 KiB quando suportado, metadata opcional serializada combinada 64 KiB e corpo codificado completo 1 MiB ou limite de transporte conhecido menor. Tipo, retry e identidade permanecem; envelope obrigatório impossível é recusado. A [guia Rust](./polyglot/rust.md#bounded-failure-reports) explica marcadores, details Avro inteiros e resultados locais. Não qualifica SDKs antigos, modo embedded nem a correção separada do armazenamento de resumo Core.

## Guias relacionados {#related-guides}

- [Garantias de execução e idempotência](./constraints/execution-guarantees.md)
  explica o contrato de replay, novas tentativas, expiração de leases e
  reentrega que orienta todos os caminhos de recuperação desta página.
- [Monitoramento](./monitoring.md) mostra onde Waterline, exportação de histórico,
  logs de workers e telemetria do runtime expõem as informações de falha.
