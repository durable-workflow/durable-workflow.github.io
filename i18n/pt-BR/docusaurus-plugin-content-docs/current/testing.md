---
sidebar_position: 9
---

# Testes {#testing}

## Replay antes da implantação ou reversão {#replay-before-deployment}

Guarde exportações de execuções selecionadas de workflows representativos abertos e encerrados recentemente. Cubra os caminhos de atividades, tentativas, sinais, atualizações, workflows filhos, temporizadores e marcadores de versão que o candidato pode encontrar. Preserve cada geração necessária de continue-as-new. Use históricos sem poda com os bytes originais dos payloads e os codecs disponíveis. Um indicador de exportação sozinho não comprova completude. Consulte os [limites de retenção](./configuration/pruning-workflows.md).

### PHP embarcado {#embedded-php-replay}

Exporte do armazenamento pertencente à aplicação. Defina `WORKFLOW_ID` e `RUN_ID` para a instância e a execução exatas selecionadas:

```bash
php artisan workflow:v2:history-export "$WORKFLOW_ID" \
  --run-id="$RUN_ID" --output=replay-bundles/run.json
```

Execute a verificação dentro do artefato da aplicação candidata, com suas classes de workflow e configuração carregadas. Mantenha os relatórios fora do diretório dos bundles. Use um ambiente de CI isolado, sem credenciais para efeitos externos em produção:

```bash
php artisan workflow:v2:replay-verify replay-bundles/run.json \
  --json --output=replay-one.json
php artisan workflow:v2:replay-simulate replay-bundles \
  --json --output=replay-report.json
```

Um código de saída diferente de zero bloqueia a promoção. Zero ainda pode exigir revisão. Salve esta verificação do relatório em lote como `gate-replay.php` e execute `php gate-replay.php replay-report.json` na CI:

```php
<?php
$report = json_decode(file_get_contents($argv[1]), true, 512, JSON_THROW_ON_ERROR);
$evidence = $report['evidence'] ?? [];
$count = $evidence['bundle_count'] ?? 0;
$allowed = ($report['promotion_decision'] ?? null) === 'safe_to_promote'
    && $count > 0
    && ($evidence['missing_bundle_count'] ?? 1) === 0
    && ($evidence['replay_checked_count'] ?? 0) === $count;
exit($allowed ? 0 : 1);
```

`--skip-replay` verifica apenas integridade. Mesmo um resultado sem problemas não autoriza uma promoção segura para replay. A aprovação cobre somente caminhos registrados e o prefixo visível de uma execução aberta, não ramificações futuras, correção de negócio ou comportamento de rede. Antes de reverter, teste o artefato antigo com históricos já escritos por workers novos que ele possa receber. Mantenha também testes unitários e com um runtime real.

### SDKs em modo serviço {#service-sdk-replay}

**PHP:** use `DurableWorkflow\Worker\Replayer::replay()` com o codec da aplicação, o callable, a lista de eventos, a entrada original, a fila e a identidade registrada da tarefa. Deixe `NonDeterministicWorkflow` reprovar o teste e confira os comandos e resultados esperados. Consulte os [testes de replay em PHP](https://php.durable-workflow.com/build/testing/).

**Python:** use `Replayer.replay()` ou `verify_replay()` com os workflows candidatos registrados e confira o resultado esperado. Receber um objeto, por si só, não é uma asserção aprovada. Forneça o `start_input` original decodificado quando os eventos o omitirem: o Core o armazena em `payloads.arguments`. Preserve o tipo, os IDs e o codec registrados. Consulte as [APIs de replay em Python](https://python.durable-workflow.com/sdk-reference/#replay-captured-histories). `--simulate-bundles` verifica integridade, não código candidato; a compatibilidade atual com o esquema 2 está em [Python #173](https://github.com/durable-workflow/sdk-python/issues/173). Não reescreva a versão nem o checksum para contornar uma recusa.

**Rust:** o SDK **4.5.0 ou mais recente** oferece `testing::WorkflowEnvironment` e `WorkflowHistory` para testes de atividades/workflows sem Server e replay de exportações completas. Reutilize os registros candidatos, preserve a entrada original/todas as páginas e verifique a conclusão ou o prefixo pendente esperado. Divergências retornam `Error::NonDeterministicReplay` tipado com sequência durável e comandos esperados/reais. Novas disputas select e outros caminhos não suportados precisam de integração. Consulte os [testes, regras de determinismo e exemplos de replay do Rust](./polyglot/rust.md#offline-testing-and-replay).

## Testes rápidos com atrasos {#keeping-delay-tests-fast}

Atrasos de temporizadores e backoff de novas tentativas duráveis usam segundos
inteiros. Se uma API do SDK aceita frações e as arredonda para cima, 100 ms se
tornam um segundo. Esses valores não aceleram testes com muitas tentativas.

Em testes embutidos, use `WorkflowStub::fake()`, simule os resultados das atividades
e avance o relógio de testes do Laravel pelo atraso configurado. Depois chame
`WorkflowStub::runReadyTasks()` para executar o trabalho já vencido. Limite o número
de tentativas. Um backoff de zero segundos específico do teste permite verificar
novas tentativas limitadas sem espera real. Mantenha um teste separado do
cronograma real de backoff. Alterar o relógio local de testes não avança o relógio
de um Server remoto.

## `Workflow\V2` {#workflowv2}

`Workflow\V2\WorkflowStub::fake()` oferece um caminho determinístico de testes com execução imediata no mesmo processo para os recursos suportados pelo modo fake da `V2`.

- tarefas prontas de workflow e atividade executam imediatamente no mesmo processo em vez de esperar por um worker de fila
- workflows filhos aninhados executam como execuções `V2` reais e aninhadas no mesmo modo fake
- mocks de atividades ainda gravam registros duráveis de `activity_executions`, tarefas e histórico
- as verificações de capacidades do backend são ignoradas no caminho fake, então `sync` continua utilizável em testes
- `WorkflowStub::assertDispatched()`, `assertDispatchedTimes()`, `assertNotDispatched()` e `assertNothingDispatched()` abrangem despachos de atividades da `V2`
- `WorkflowStub::assertSignalSent()`, `assertSignalSentTimes()` e `assertSignalNotSent()` abrangem sinais da `V2` enviados por `WorkflowStub::signal()` ou `signalWithStart()`
- `WorkflowStub::assertUpdateSent()`, `assertUpdateSentTimes()` e `assertUpdateNotSent()` abrangem atualizações da `V2` enviadas por `WorkflowStub::update()`, `attemptUpdate()` ou `submitUpdate()`
- tarefas de temporizador com atraso permanecem como trabalho durável em fila até chegar a hora de execução. Depois de avançar o tempo, `WorkflowStub::runReadyTasks()` processa no mesmo processo as tarefas cujo prazo já chegou

### Escopo de testes da versão inicial {#first-release-testing-scope}

Os recursos a seguir **não** fazem parte do modo fake da `V2` na versão inicial e podem ser acrescentados como contratos aditivos no futuro:

- não há equivalente de `V2` para a ponte legada `resume()`
- não há mock dedicado de workflow filho nem auxiliar de asserção de despacho de filhos. Workflows filhos executam como execuções `V2` reais e aninhadas no modo fake, então teste-os pela saída observável em vez de usar mocks
- não há hook de callback atrasado para injetar sinais ou atualizações em instantes de tempo virtual durante uma única execução fake. Em vez disso, avance o tempo e chame `WorkflowStub::runReadyTasks()` entre chamadas explícitas de sinal/atualização

`WorkflowStub::mock()` aplica esse escopo no runtime: passar uma subclasse de `Workflow` lança uma `LogicException` com uma mensagem clara orientando a testar workflows filhos pela saída observável. Apenas classes `Activity` (e chaves de string não resolvidas) são aceitas como alvos de mocks.

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

final class MyWorkflow extends Workflow
{
    public function handle(): array
    {
        return [
            'result' => activity(MyActivity::class, 'Taylor'),
            'workflow_id' => $this->workflowId(),
            'run_id' => $this->runId(),
        ];
    }
}
```

```php
use Workflow\V2\Testing\ActivityFakeContext;
use Workflow\V2\WorkflowStub;

public function testWorkflow(): void
{
    WorkflowStub::fake();

    WorkflowStub::mock(MyActivity::class, function (ActivityFakeContext $context, string $name): string {
        $this->assertSame('Taylor', $name);
        $this->assertSame('my-workflow-id', $context->workflowId());

        return "Hello, {$name}!";
    });

    $workflow = WorkflowStub::make(MyWorkflow::class, 'my-workflow-id');
    $workflow->start();

    $this->assertTrue($workflow->refresh()->completed());
    $this->assertSame('Hello, Taylor!', $workflow->output()['result']);

    WorkflowStub::assertDispatched(MyActivity::class, function (string $name): bool {
        return $name === 'Taylor';
    });
}
```

Use `WorkflowStub::assertDispatched()`, `assertDispatchedTimes()`, `assertNotDispatched()` e `assertNothingDispatched()` para verificar os despachos de atividades da `V2` registrados.

Para workflows com temporizadores, avance o tempo com os auxiliares de viagem no tempo do Laravel e então processe explicitamente a fila de tarefas cujo prazo já chegou:

```php
use function Workflow\V2\timer;
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;

final class MyTimerWorkflow extends Workflow
{
    public function handle(): array
    {
        timer(60);

        return ['done' => true];
    }
}

public function testTimerWorkflow(): void
{
    WorkflowStub::fake();

    $workflow = WorkflowStub::make(MyTimerWorkflow::class, 'timer-workflow');
    $workflow->start();

    $this->travel(60)->seconds();

    WorkflowStub::runReadyTasks();

    $this->assertTrue($workflow->refresh()->completed());
    $this->assertSame(['done' => true], $workflow->output());
}
```

`WorkflowStub::runReadyTasks()` processa apenas tarefas cujo prazo já chegou. Ele não avança o relógio do sistema nem força temporizadores futuros a disparar antes da hora.

### Enviando sinais no modo fake {#sending-signals-in-fake-mode}

Workflows que aguardam sinais podem recebê-los no modo fake. Quando você chama `$workflow->signal(...)`, o mecanismo registra o comando durável de sinal e cria uma tarefa de workflow. No modo fake, essa tarefa executa imediatamente no mesmo processo, então o workflow retoma de forma síncrona:

```php
use function Workflow\V2\activity;
use Workflow\V2\Attributes\Signal;
use function Workflow\V2\await;
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;

#[Signal('name-provided')]
final class ApprovalWorkflow extends Workflow
{
    public function handle(): array
    {
        $name = await('name-provided');
        $greeting = activity(GreetingActivity::class, $name);

        return ['name' => $name, 'greeting' => $greeting];
    }
}

public function testSignalWorkflow(): void
{
    WorkflowStub::fake();
    WorkflowStub::mock(GreetingActivity::class, 'Hello, Taylor!');

    $workflow = WorkflowStub::make(ApprovalWorkflow::class, 'approval-1');
    $workflow->start();

    // Workflow suspends at await('name-provided')
    $this->assertSame('waiting', $workflow->refresh()->status());

    // Send the signal — resumes the workflow inline
    $workflow->signal('name-provided', 'Taylor');

    $this->assertTrue($workflow->refresh()->completed());
    $this->assertSame('Taylor', $workflow->output()['name']);

    WorkflowStub::assertSignalSent('name-provided');
    WorkflowStub::assertSignalSentTimes('name-provided', 1);
    WorkflowStub::assertSignalNotSent('other-signal');
}
```

Use `WorkflowStub::assertSignalSent()`, `assertSignalSentTimes()` e `assertSignalNotSent()` para verificar quais sinais foram enviados durante o teste. A forma com callback recebe o ID de instância e os argumentos do sinal:

```php
WorkflowStub::assertSignalSent(
    'name-provided',
    fn (string $instanceId, string $name): bool =>
        $instanceId === 'approval-1' && $name === 'Taylor'
);
```

### Enviando atualizações no modo fake {#sending-updates-in-fake-mode}

Atualizações também são aplicadas imediatamente no mesmo processo no modo fake. Quando você chama `$workflow->attemptUpdate(...)` ou `$workflow->update(...)`, o mecanismo registra o comando durável de atualização, cria uma tarefa de workflow que aplica a atualização e a executa no mesmo processo:

```php
use Workflow\UpdateMethod;
use Workflow\V2\Attributes\Signal;
use function Workflow\V2\await;
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;

#[Signal('done')]
final class SettingsWorkflow extends Workflow
{
    private bool $enabled = false;

    public function handle(): array
    {
        await('done');

        return ['enabled' => $this->enabled];
    }

    #[UpdateMethod]
    public function toggle(bool $enabled): array
    {
        $this->enabled = $enabled;

        return ['enabled' => $this->enabled];
    }
}

public function testUpdateWorkflow(): void
{
    WorkflowStub::fake();

    $workflow = WorkflowStub::make(SettingsWorkflow::class, 'settings-1');
    $workflow->start();

    $this->assertSame('waiting', $workflow->refresh()->status());

    $result = $workflow->attemptUpdate('toggle', true);

    $this->assertTrue($result->accepted());

    WorkflowStub::assertUpdateSent('toggle');
    WorkflowStub::assertUpdateSentTimes('toggle', 1);
    WorkflowStub::assertUpdateNotSent('other-update');

    // Complete the workflow
    $workflow->signal('done');
    $this->assertTrue($workflow->refresh()->completed());
    $this->assertTrue($workflow->output()['enabled']);
}
```

Use `WorkflowStub::assertUpdateSent()`, `assertUpdateSentTimes()` e `assertUpdateNotSent()` para verificar quais atualizações foram enviadas durante o teste. A forma com callback recebe o ID de instância e os argumentos da atualização:

```php
WorkflowStub::assertUpdateSent(
    'toggle',
    fn (string $instanceId, bool $enabled): bool =>
        $instanceId === 'settings-1' && $enabled === true
);
```

### Testando resultados de início e política de início duplicado {#testing-start-outcomes-and-duplicate-start-policy}

Use `attemptStart()` para verificar o comportamento de início duplicado sem lançar exceções. `StartResult` expõe auxiliares tipados de resultado:

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

public function testRejectDuplicateStart(): void
{
    WorkflowStub::fake();
    WorkflowStub::mock(MyActivity::class, 'result');

    $workflow = WorkflowStub::make(MyWorkflow::class, 'order-123');

    $first = $workflow->start('Taylor');
    $this->assertTrue($first->startedNew());

    $second = WorkflowStub::load('order-123');
    $duplicate = $second->attemptStart('Taylor');

    $this->assertTrue($duplicate->rejected());
    $this->assertTrue($duplicate->rejectedDuplicate());
    $this->assertSame('instance_already_started', $duplicate->rejectionReason());
}
```

Para testar a política de retornar o workflow ativo existente, passe `StartOptions::returnExistingActive()`:

```php
public function testReturnExistingActiveStart(): void
{
    WorkflowStub::fake();

    $workflow = WorkflowStub::make(MySignalWorkflow::class, 'order-123');
    $workflow->start();

    $this->assertSame('waiting', $workflow->refresh()->status());

    $second = WorkflowStub::load('order-123');
    $result = $second->attemptStart(StartOptions::returnExistingActive());

    $this->assertTrue($result->accepted());
    $this->assertTrue($result->returnedExistingActive());
    $this->assertSame($workflow->runId(), $result->runId());
}
```

As duas políticas registram comandos e eventos de histórico duráveis. Portanto, você também pode fazer asserções sobre registros `WorkflowCommand` e `WorkflowHistoryEvent` para uma verificação mais profunda.

### Testando o orçamento de histórico {#testing-history-budget}

Os campos de `HistoryBudget` (`history_event_count`, `history_size_bytes`, `continue_as_new_recommended`) aparecem na projeção de resumo da execução e estão disponíveis por meio de `RunDetailView`. No código do workflow, a classe base `Workflow` os expõe como `$this->historyLength()`, `$this->historySize()` e `$this->shouldContinueAsNew()`:

```php
use Workflow\V2\Workflow;

final class LongRunningWorkflow extends Workflow
{
    public function handle(): void
    {
        while (true) {
            // ... process work ...

            if ($this->shouldContinueAsNew()) {
                Workflow::continueAsNew($this->carryForwardState());
            }
        }
    }
}
```

Para testar os limiares de orçamento de histórico, configure valores baixos e verifique a recomendação:

```php
public function testHistoryBudgetRecommendsContinueAsNew(): void
{
    config()->set('workflows.v2.history_budget.continue_as_new_event_threshold', 5);

    WorkflowStub::fake();

    // Run a workflow that produces enough history events to trip the threshold
    $workflow = WorkflowStub::make(ManyActivitiesWorkflow::class, 'budget-test');
    $workflow->start();

    $summary = $workflow->summary();
    $this->assertTrue($summary->continue_as_new_recommended);
}
```

## `Workflow\WorkflowStub` legado {#legacy-workflowworkflowstub}

:::warning v1 legada

Os exemplos desta seção usam o runtime da v1 (`Workflow\Workflow`, `use function Workflow\activity`, `execute()` no estilo gerador com `yield`, `Workflow\Models\StoredWorkflow`). Mantenha esses padrões para testes que ainda exercitem workflows da v1 durante a migração. Novos testes devem usar `Workflow\V2\WorkflowStub::fake()` com `Workflow\V2\Workflow` e métodos `handle()` sequenciais, como mostrado acima.

:::

### Workflows {#workflows}

Você pode executar workflows de forma síncrona no ambiente de testes e usar mocks de atividades e workflows filhos para definir comportamentos e saídas esperados sem executar as implementações reais.

```
use function Workflow\activity;
use Workflow\Workflow;

class MyWorkflow extends Workflow
{
    public function execute()
    {
        $result = yield activity(MyActivity::class);

        return $result;
    }
}
```

O workflow acima pode ser testado chamando primeiro `WorkflowStub::fake()` e então criando um mock da atividade.

```
public function testWorkflow()
{
    WorkflowStub::fake();

    WorkflowStub::mock(MyActivity::class, 'result');

    $workflow = WorkflowStub::make(MyWorkflow::class);
    $workflow->start();

    $this->assertSame($workflow->output(), 'result');
}
```

Você também pode fornecer um callback em vez de um valor de resultado a ` WorkflowStub::mock()`.

O `$context` do workflow e os argumentos da atividade atual também serão passados ao callback.

```
public function testWorkflow()
{
    WorkflowStub::fake();

    WorkflowStub::mock(MyActivity::class, function ($context) {
        return 'result';
    });

    $workflow = WorkflowStub::make(MyWorkflow::class);
    $workflow->start();

    $this->assertSame($workflow->output(), 'result');
}
```

Você pode verificar quais atividades ou workflows filhos foram despachados usando os métodos `assertDispatched`, `assertNotDispatched` e `assertNothingDispatched`:

```
WorkflowStub::assertDispatched(MyActivity::class);

// Assert the activity was dispatched twice...
WorkflowStub::assertDispatched(MyActivity::class, 2);

WorkflowStub::assertNotDispatched(MyActivity::class);

WorkflowStub::assertNothingDispatched();
```

Você pode passar uma closure aos métodos `assertDispatched` ou `assertNotDispatched` para verificar se uma atividade ou workflow filho que satisfaz determinada condição foi despachado. Os argumentos da atividade ou workflow filho serão passados ao callback.

```
WorkflowStub::assertDispatched(TestOtherActivity::class, function ($string) {
    return $string === 'other';
});
```

### Avançando o tempo {#skipping-time}

Ao manipular o horário do sistema com `$this->travel()` ou `$this->travelTo()`, você pode simular workflows dependentes de tempo. Essa estratégia permite testar limites de tempo, atrasos e outras lógicas sensíveis ao tempo nos workflows.

```
use function Workflow\{activity, timer};
use Workflow\Workflow;

class MyTimerWorkflow extends Workflow
{
    public function execute()
    {
        yield timer(60);

        $result = yield activity(MyActivity::class);

        return $result;
    }
}
```

O workflow acima espera 60 segundos antes de executar a atividade. Usar `$this->travel()` e `$workflow->resume()` permite pular esse período de espera no runtime legado.

```
public function testTimeTravelWorkflow()
{
    WorkflowStub::fake();

    WorkflowStub::mock(MyActivity::class, 'result');

    $workflow = WorkflowStub::make(MyTimerWorkflow::class);
    $workflow->start();

    $this->travel(120)->seconds();

    $workflow->resume();

    $this->assertSame($workflow->output(), 'result');
}
```

Os métodos auxiliares `$this->travel()` e `$this->travelTo()` usam `Carbon::setTestNow()` internamente.

### Atividades {#activities}

Testar atividades é semelhante a testar jobs do Laravel. Você cria a atividade manualmente e então chama o método `handle()`.

```
$workflow = WorkflowStub::make(MyWorkflow::class);

$activity = new MyActivity(0, now()->toDateTimeString(), StoredWorkflow::findOrFail($workflow->id()));

$result = $activity->handle();
```

Observe que atividades legadas continuam executando pelo método de job `handle()` do runtime. Em `Workflow\V2`, o código de workflow e atividade definido pelo usuário também fica em `handle()`.
