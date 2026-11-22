---
sidebar_position: 20
---

# Agendamentos {#schedules}

Agendamentos permitem iniciar execuções de workflow de forma recorrente usando expressões cron. Cada agendamento é uma entidade durável nomeada que o mecanismo avalia a cada tick para determinar se uma nova execução deve ser disparada.

## Criação de um agendamento {#creating-a-schedule}

Use `ScheduleManager::create()` para definir um agendamento nomeado:

```php
use Workflow\V2\Enums\ScheduleOverlapPolicy;
use Workflow\V2\Support\ScheduleManager;

$schedule = ScheduleManager::create(
    scheduleId: 'daily-invoice-sync',
    workflowClass: InvoiceSyncWorkflow::class,
    cronExpression: '0 2 * * *',
    arguments: ['nightly'],
    timezone: 'America/New_York',
    overlapPolicy: ScheduleOverlapPolicy::Skip,
    labels: ['team' => 'billing'],
    memo: ['origin' => 'scheduled'],
    searchAttributes: ['tenant_id' => '42'],
    notes: 'Runs every night at 2 AM ET.',
    executionTimeoutSeconds: 120,
    runTimeoutSeconds: 60,
);
```

O `scheduleId` é um identificador único escolhido pelo usuário para o agendamento. Uma execução iniciada para uma ocorrência do agendamento recebe um ID determinístico de instância de workflow derivado do namespace, do ID do agendamento e do horário da ocorrência. Veja [IDs de execução](#run-ids).

### Parâmetros {#parameters}

| Parâmetro | Tipo | Padrão | Descrição |
|---|---|---|---|
| `scheduleId` | `string` | obrigatório | Identificador único do agendamento |
| `workflowClass` | `string` | obrigatório | A classe de workflow a iniciar |
| `cronExpression` | `string` | obrigatório | Expressão cron padrão (5 campos) |
| `arguments` | `array` | `[]` | Argumentos passados ao método `handle()` do workflow |
| `timezone` | `string` | `'UTC'` | Fuso horário para avaliar a expressão cron |
| `overlapPolicy` | `ScheduleOverlapPolicy` | `Skip` | O que fazer quando a execução anterior ainda está ativa |
| `labels` | `array` | `[]` | Rótulos de visibilidade aplicados a cada execução disparada |
| `memo` | `array` | `[]` | Campos de memo aplicados a cada execução disparada |
| `searchAttributes` | `array` | `[]` | Atributos de busca aplicados a cada execução disparada |
| `jitterSeconds` | `int` | `0` | Atraso aleatório máximo em segundos adicionado a cada horário de disparo (mitigação de picos simultâneos) |
| `maxRuns` | `int\|null` | `null` | Número máximo de execuções antes da exclusão automática do agendamento |
| `connection` | `string\|null` | `null` | Conexão de fila para execuções disparadas (sobrescreve o padrão da classe de workflow) |
| `queue` | `string\|null` | `null` | Nome da fila para execuções disparadas (sobrescreve o padrão da classe de workflow) |
| `notes` | `string\|null` | `null` | Notas livres do operador |
| `namespace` | `string\|null` | `null` | Namespace do agendamento (usa o `workflows.v2.namespace` configurado ou `'default'` como padrão) |
| `executionTimeoutSeconds` | `int\|null` | `null` | Tempo limite de cada execução lógica de workflow, incluindo repetições e continue-as-new |
| `runTimeoutSeconds` | `int\|null` | `null` | Tempo limite de cada execução individual, reiniciado em continue-as-new |

### Fusos horários e horário de verão {#time-zones-and-daylight-saving-time}

As expressões cron selecionam horários locais no fuso `timezone` do
agendamento. As mudanças de horário seguem estas regras:

- Quando o campo de horas seleciona menos de 24 horas, um horário local
  repetido dispara uma única vez, na primeira ocorrência. Em Nova York,
  `30 1 * * *` dispara à 01:30 EDT no dia em que os relógios são atrasados.
- Um horário local pulado ao adiantar os relógios dispara uma vez, deslocado
  pela duração do salto. Em Nova York, `30 2 * * *` dispara às 03:30 nesse dia.
- Um campo que seleciona todas as 24 horas, incluindo `*`, `*/1` e `0-23`,
  mantém os intervalos de tempo real durante a hora repetida. Por exemplo,
  `*/15 * * * *` continua disparando a cada 15 minutos reais durante as duas
  ocorrências da hora repetida em Nova York.

Use `timezone: 'UTC'` para evitar mudanças do horário local. Use uma
especificação de intervalo quando uma duração fixa entre as execuções for
mais importante do que o horário local.

### Tempos limite do workflow {#workflow-timeouts}

O tempo limite de execução lógica abrange repetições e continue-as-new. O
tempo limite de execução individual limita uma única execução e reinicia em
continue-as-new. Uma execução individual não pode exceder o prazo restante da
execução lógica. Cada ocorrência agendada inicia um novo prazo de execução
lógica, medido a partir do início real do workflow, e não do horário de disparo agendado.

Ambas as opções aceitam segundos inteiros positivos ou `null`. Opções omitidas
ou `null` deixam o limite correspondente sem definição. Disparos manuais,
ticks automáticos, inícios em buffer e preenchimentos retroativos aplicam os
limites armazenados pelo iniciador PHP padrão.

Em `createFromSpec()`, coloque os limites na ação:

```php
$schedule = ScheduleManager::createFromSpec(
    scheduleId: 'hourly-invoice-sync',
    spec: ['intervals' => [['every' => 'PT1H']]],
    action: [
        'workflow_class' => InvoiceSyncWorkflow::class,
        'input' => ['hourly'],
        'execution_timeout_seconds' => 120,
        'run_timeout_seconds' => 60,
    ],
);
```

A criação e as atualizações de ação validam os tempos limite de workflows PHP
com as mesmas regras de `StartOptions` usadas em inícios diretos. Não é
necessário um iniciador personalizado.

Altere os limites de inícios futuros atualizando a ação:

```php
$schedule = ScheduleManager::update($schedule, action: [
    ...$schedule->action,
    'execution_timeout_seconds' => 240,
    'run_timeout_seconds' => 90,
]);
```

A ação é substituída, portanto preserve sua classe de workflow e entrada
como mostrado. Execuções já iniciadas mantêm seus prazos originais. Defina um
campo de tempo limite como `null` para remover esse limite dos próximos inícios.

## Agendamento avançado {#advanced-scheduling}

As seções abaixo abordam recursos usados quando o padrão cron básico não basta: disparos em intervalo fixo, combinação de especificações cron e de intervalo e políticas de sobreposição. Avance se não precisar desses recursos.

### Agendamentos por intervalo {#interval-based-schedules}

Além de expressões cron, agendamentos oferecem disparos por intervalo usando a sintaxe de duração ISO 8601. Use `ScheduleManager::createFromSpec()` para ter controle completo sobre a especificação do agendamento:

```php
use Workflow\V2\Support\ScheduleManager;

$schedule = ScheduleManager::createFromSpec(
    scheduleId: 'health-check-30m',
    spec: [
        'intervals' => [
            ['every' => 'PT30M'],
        ],
    ],
    action: [
        'workflow_type' => 'health-check',
        'workflow_class' => HealthCheckWorkflow::class,
        'input' => ['region' => 'us-east-1'],
    ],
);
```

### Campos da especificação de intervalo {#interval-spec-fields}

| Campo | Tipo | Descrição |
|---|---|---|
| `every` | `string` | Duração ISO 8601 (por exemplo, `PT30M` para 30 minutos, `PT1H` para 1 hora, `P1D` para 1 dia) |
| `offset` | `string\|null` | Deslocamento de fase como duração ISO 8601, que altera o ponto de alinhamento do intervalo |

O parâmetro offset controla em que ponto do ciclo do intervalo o agendamento dispara. Por exemplo, um intervalo de uma hora com deslocamento de 5 minutos dispara em `:05`, `:05+1h` etc.:

```php
$schedule = ScheduleManager::createFromSpec(
    scheduleId: 'offset-hourly',
    spec: [
        'intervals' => [
            ['every' => 'PT1H', 'offset' => 'PT5M'],
        ],
    ],
    action: [
        'workflow_type' => 'sync-workflow',
        'workflow_class' => SyncWorkflow::class,
        'input' => [],
    ],
);
```

### Especificações mistas de cron e intervalo {#mixed-cron-and-interval-specs}

Um único agendamento pode combinar expressões cron e intervalos. O mecanismo avalia todas as especificações e usa o horário de disparo futuro mais próximo:

```php
$schedule = ScheduleManager::createFromSpec(
    scheduleId: 'mixed-schedule',
    spec: [
        'cron_expressions' => ['0 12 * * *'],  // noon daily
        'intervals' => [['every' => 'PT6H']],  // every 6 hours
        'timezone' => 'America/Chicago',
    ],
    action: [
        'workflow_type' => 'report-workflow',
        'workflow_class' => ReportWorkflow::class,
        'input' => [],
    ],
);
```

O método `createFromSpec` aceita todos os mesmos parâmetros de ciclo de vida de `create()` (`overlapPolicy`, `jitterSeconds`, `maxRuns`, `connection`, `queue`, `namespace` etc.) como argumentos nomeados separados.

## Políticas de sobreposição {#overlap-policies}

Quando um agendamento dispara e a execução anterior ainda está ativa, a política de sobreposição controla o comportamento:

| Política | Comportamento |
|---|---|
| `Skip` | Não iniciar uma nova execução (padrão) |
| `BufferOne` | Manter um disparo pendente em buffer; ignorar os seguintes até esvaziá-lo. No próximo `tick()` após a conclusão da execução ativa, o disparo em buffer ocorre automaticamente. |
| `BufferAll` | Manter todos os disparos pendentes em buffer, sem limite; cada disparo é processado sequencialmente conforme as execuções anteriores concluem. |
| `AllowAll` | Iniciar a nova execução independentemente do estado da anterior |
| `CancelOther` | Cancelar a execução anterior e iniciar a nova |
| `TerminateOther` | Terminar a execução anterior e iniciar a nova |

## Gerenciamento de agendamentos {#managing-schedules}

### Pausar e retomar {#pause-and-resume}

```php
ScheduleManager::pause($schedule);

// The schedule will not trigger while paused.

ScheduleManager::resume($schedule);
// next_fire_at is recalculated from now.
```

### Atualizar {#update}

```php
ScheduleManager::update(
    $schedule,
    cronExpression: '30 3 * * *',
    timezone: 'America/Chicago',
    overlapPolicy: ScheduleOverlapPolicy::AllowAll,
    notes: 'Moved to 3:30 AM CT.',
);
```

Somente uma mudança na especificação (expressões cron, intervalos ou fuso horário) ou no jitter recalcula `next_fire_at`. As demais atualizações o mantêm, então não podem pular um disparo pendente. O evento `ScheduleUpdated` lista em `changed_fields` apenas os campos cujo valor armazenado mudou.

Uma atualização que não muda nada não registra evento e mantém `next_fire_at`, incluindo o jitter. Em um agendamento recém-carregado, `wasChanged()` no modelo retornado é `false`.

Mudar a ação (tipo de workflow, argumentos, roteamento de fila ou timeouts) descarta os disparos em buffer sob `BufferOne` ou `BufferAll`, porque foram capturados para a ação antiga. Cada disparo descartado é registrado como um evento `ScheduleTriggerSkipped` com o motivo `action_changed` e seu `occurrence_time`.

### Excluir {#delete}

```php
ScheduleManager::delete($schedule);
```

A exclusão é lógica: a linha permanece com status `deleted` e horário `deleted_at`. Um agendamento excluído não pode ser pausado, retomado, atualizado nem disparado. O id continua ocupado. Veja [Aplicar a partir da configuração](#apply-from-configuration).

### Aplicar a partir da configuração {#apply-from-configuration}

Ferramentas de deploy podem aplicar as mesmas definições de agendamento a cada deploy. Crie cada agendamento e atualize-o quando o id já estiver ocupado:

```php
use Workflow\V2\Exceptions\ScheduleAlreadyExistsException;
use Workflow\V2\Support\ScheduleManager;

try {
    ScheduleManager::create(
        scheduleId: 'daily-invoice-sync',
        workflowClass: InvoiceSyncWorkflow::class,
        cronExpression: '0 2 * * *',
        timezone: 'America/New_York',
    );
} catch (ScheduleAlreadyExistsException $e) {
    if ($e->existingStatus === 'deleted') {
        throw $e; // The id belonged to a deleted schedule. Pick a new id.
    }

    ScheduleManager::update(
        ScheduleManager::findByScheduleId($e->scheduleId, $e->namespace),
        cronExpression: '0 2 * * *',
        timezone: 'America/New_York',
    );
}
```

Reaplicar uma definição sem mudanças não registra nada, então é seguro executar isso a cada deploy.

Ids de agendamento não podem ser reutilizados. Um agendamento excluído, inclusive um excluído ao esgotar `max_runs`, mantém seu id. Criar um agendamento com esse id lança `ScheduleAlreadyExistsException` com `existingStatus` `deleted`. Use um id novo.

O Server nativo aplica a mesma regra de ids: criar um agendamento com um id ocupado retorna `409 schedule_already_exists`. A partir do Server nativo 3.6.0, reaplicar um agendamento sem mudanças também não faz nada: não registra nenhum evento `ScheduleUpdated` e mantém `next_fire_at`. O resultado da resposta continua sendo `updated`. Versões do Server nativo anteriores à 3.6.0 registram `ScheduleUpdated` e recalculam `next_fire_at` a cada atualização, mesmo sem mudanças.

### Descrever {#describe}

```php
$description = ScheduleManager::describe($schedule);

$description->scheduleId;      // 'daily-invoice-sync'
$description->namespace;       // 'default'
$description->status;          // ScheduleStatus::Active
$description->spec;            // ['cron_expressions' => ['0 2 * * *'], 'timezone' => 'America/New_York']
$description->overlapPolicy;   // ScheduleOverlapPolicy::Skip
$description->firesCount;      // 47
$description->nextFireAt;      // DateTimeInterface|null
$description->lastFiredAt;     // DateTimeInterface|null
$description->latestInstanceId; // 'schedule:daily-invoice-sync:...'
$description->jitterSeconds;   // 0
$description->note;            // 'Runs every night at 2 AM ET.'
$description->toArray();       // full array representation
```

### Buscar pelo ID do agendamento {#find-by-schedule-id}

```php
$schedule = ScheduleManager::findByScheduleId('daily-invoice-sync');
```

## Disparo de agendamentos {#triggering-schedules}

### Disparo manual {#manual-trigger}

```php
$instanceId = ScheduleManager::trigger($schedule);
```

Isso avalia imediatamente a política de sobreposição e, se permitido, inicia uma nova execução de workflow. Retorna o ID da instância do workflow iniciado ou `null` se o disparo foi ignorado.

### Tick (avaliar todos os agendamentos vencidos) {#tick-evaluate-all-due-schedules}

```php
$results = ScheduleManager::tick();

// Returns rows with schedule_id, instance_id, outcome, occurrence_time,
// last_fired_at, and next_fire_at when those fields apply.
```

`tick()` dispara os agendamentos vencidos, isto é, os agendamentos ativos cujo `next_fire_at` está no passado. Cada chamada inicia no máximo `$limit` deles (`tick(int $limit = 100)`), começando pelos mais antigos e repartidos em round-robin entre namespaces. Agendamentos vencidos além do limite continuam vencidos para a próxima chamada. O campo `occurrence_time` é o horário de disparo vencido observado pelo agendador. Após cada disparo, `next_fire_at` avança a partir da hora atual para a próxima ocorrência cron ou de intervalo.

### Política para disparos perdidos {#missed-fire-policy}

A avaliação ao vivo dos agendamentos usa a semântica **disparar uma vez e retomar**. Se o agendador ficar indisponível durante um ou mais horários nominais de disparo, o primeiro tick após a recuperação inicia um workflow para o `next_fire_at` vencido, registra esse horário como `occurrence_time` e então avança `next_fire_at` a partir da hora atual. Ocorrências nominais adicionais que passaram durante a indisponibilidade são ignoradas pela avaliação ao vivo.

A mesma regra se aplica quando o agendador está em execução, mas não consegue acompanhar a demanda. Um agendamento que ainda aguarda uma passagem quando chega seu próximo horário nominal dispara uma vez e ignora as ocorrências intermediárias. Consulte [Tamanho da passagem e rajadas](#pass-size-and-bursts).

Use `backfill()` quando todas as ocorrências perdidas precisarem executar. O preenchimento retroativo enumera explicitamente a janela solicitada e registra cada ocorrência separadamente.

### Comando Artisan {#artisan-command}

Execute um único tick pela linha de comando:

```bash
php artisan workflow:v2:schedule-tick
php artisan workflow:v2:schedule-tick --json
php artisan workflow:v2:schedule-tick --limit=500
```

Para avaliar agendamentos continuamente, chame esse comando pelo agendador de tarefas do Laravel:

```php
// app/Console/Kernel.php
$schedule->command('workflow:v2:schedule-tick')->everyMinute();
```

### Tamanho da passagem e rajadas {#pass-size-and-bursts}

Cada passagem de `workflow:v2:schedule-tick` inicia no máximo `limit`
agendamentos vencidos e, separadamente, esvazia no máximo `limit` ações em
buffer. `limit` vem da opção `--limit`; na falta dela, de
`workflows.v2.schedules.tick_limit` (`DW_V2_SCHEDULE_TICK_LIMIT`); o padrão é
100. Um valor que não seja um inteiro positivo faz o comando falhar sem avaliar
nenhum agendamento; ele nunca é substituído por outro tamanho. A configuração e
a opção exigem Workflow 2.16.0 ou posterior.

Os dois lotes são repartidos em round-robin entre namespaces, começando pelos
mais antigos, de modo que um namespace muito ativo não atrasa os demais.
Agendamentos vencidos além de `limit` continuam vencidos e são processados na
próxima passagem. Quando `N` agendamentos vencem juntos, não há nenhum vencido
mais antigo e todos os inícios têm sucesso, todos eles disparam em até
`ceil(N / limit)` passagens. Com a receita de execução a cada minuto, o último
inicia até `ceil(N / limit) - 1` minutos após o primeiro. Defina `limit` com um
valor igual ou maior que a maior rajada esperada.

O limite de tempo é maior quando:

- um início falha: a ocorrência continua vencida e é tentada novamente nas
  passagens seguintes, de modo que um agendamento que continua falhando segue
  ocupando uma vaga enquanto for o mais antigo;
- agendamentos que venceram antes, ou outros agendamentos que vencem antes de a
  rajada ser concluída, são selecionados primeiro;
- ticks são executados com atraso ou deixam de ser executados.

Sob sobrecarga contínua, um agendamento que espera além do seu próximo horário
nominal dispara uma vez e ignora as ocorrências intermediárias, conforme descrito
em [Política para disparos perdidos](#missed-fire-policy). Use `backfill()` se
essas ocorrências precisarem executar.

Configure alertas para as métricas de operador `schedules.missed`,
`schedules.oldest_overdue_at` e `schedules.max_overdue_ms`, e para aumentos em
`schedules.failures_total`.

:::note Atualização de uma aplicação que publicou sua configuração antes da 2.16.0

O Laravel mescla a configuração de um pacote a um arquivo de configuração
publicado uma chave de nível superior por vez. Uma aplicação que publicou
`config/workflows.php` antes da 2.16.0 mantém seu próprio array `v2`, portanto
`DW_V2_SCHEDULE_TICK_LIMIT` não é lido: o comando usa 100 e continua aceitando
`--limit`. Para usar a configuração, publique novamente o arquivo de
configuração ou adicione esta entrada ao array `v2` do arquivo publicado:

```php
'schedules' => [
    'tick_limit' => env('DW_V2_SCHEDULE_TICK_LIMIT', 100),
],
```

:::

### Server nativo {#native-server}

O Server nativo 3.x avalia os agendamentos por conta própria, portanto não há
comando para executar nem agendar. Cada processo do Server executa um loop de
manutenção: aguarda 250 ms, depois esvazia até 100 ações em buffer e inicia até
100 agendamentos vencidos, ordenados por `next_fire_at`, e então aguarda
novamente. O tamanho do lote é fixo; não há configuração para ele. As passagens
de agendamento são serializadas entre os nós do Server, portanto adicionar nós
não aumenta a vazão. Uma rajada de `N` agendamentos vencidos dispara em até
`ceil(N / 100)` passagens, na ordem de vencimento.

Um início recusado pelo Server é registrado como falha, e o agendamento passa
para sua próxima ocorrência, de modo que um agendamento com falha não mantém
sua vaga. Um agendamento cuja especificação não pode ser avaliada continua
vencido e é tentado novamente a cada passagem. O comando
`schedule:evaluate --limit` do Server PHP congelado não se aplica ao Server
nativo.

## Máximo de execuções {#max-runs}

Quando `maxRuns` é definido, o agendamento acompanha `remaining_actions`. Após o último disparo permitido, ele é excluído logicamente de forma automática.

```php
$schedule = ScheduleManager::create(
    scheduleId: 'one-shot-retry',
    workflowClass: RetryWorkflow::class,
    cronExpression: '*/5 * * * *',
    maxRuns: 3,
);

// After 3 triggers, the schedule status becomes 'deleted'.
```

## Preenchimento retroativo {#backfill}

O preenchimento retroativo dispara workflows para ocorrências cron passadas que foram perdidas, por exemplo após uma pausa no agendamento, uma indisponibilidade na implantação ou uma criação tardia:

```php
$results = ScheduleManager::backfill(
    $schedule,
    from: new DateTimeImmutable('2026-04-10 00:00:00'),
    to: new DateTimeImmutable('2026-04-14 00:00:00'),
);

// Returns: [['schedule_id' => '...', 'instance_id' => '...|null', 'cron_time' => '...'], ...]
```

Cada ocorrência cron perdida é disparada sequencialmente. A política de sobreposição do agendamento vale para cada ocorrência, com uma exceção: **políticas de buffer (`BufferOne`, `BufferAll`) são tratadas como `AllowAll` durante o preenchimento retroativo**. O buffer é um mecanismo de controle de fluxo em tempo real que não se aplica a operações de recuperação de atrasos. O preenchimento retroativo deve iniciar cada ocorrência perdida, em vez de colocá-las em um buffer que nunca será esvaziado. Você também pode sobrescrever a política explicitamente:

```php
$results = ScheduleManager::backfill(
    $schedule,
    from: new DateTimeImmutable('2026-04-10 00:00:00'),
    to: new DateTimeImmutable('2026-04-14 00:00:00'),
    overlapPolicyOverride: ScheduleOverlapPolicy::AllowAll,
);
```

O preenchimento retroativo respeita `maxRuns`. Se as ações restantes do agendamento se esgotarem durante a operação, ela para e o agendamento é excluído automaticamente.

## IDs de execução {#run-ids}

Uma execução iniciada para uma ocorrência do agendamento, seja um disparo agendado, um preenchimento retroativo ou uma ação em buffer, recebe um ID determinístico de instância de workflow:

```text
schedule.ns:{namespace hash}:{schedule ID length}:{schedule ID}:backfill:{occurrence}
```

- `{namespace hash}` são os primeiros 32 caracteres hexadecimais do SHA-256 do namespace do agendamento.
- `{schedule ID length}` é o comprimento do ID do agendamento em bytes.
- `{occurrence}` é o horário da ocorrência em segundos Unix. O sufixo é `backfill` em todas as ocorrências, não só nos preenchimentos retroativos.
- Se o ID completo passar de 191 caracteres, ou se o ID do agendamento contiver um caractere fora de `[A-Za-z0-9._:-]`, a parte `{schedule ID length}:{schedule ID}` é substituída por `h:{SHA-256 do ID do agendamento}` (64 caracteres hexadecimais).

Por exemplo, o agendamento `nightly` no namespace `default` disparado em 2026-11-18 às 09:00 UTC inicia `schedule.ns:37a8eec1ce19687d132fe29051dca629:7:nightly:backfill:1794992400`.

O namespace faz parte do ID, então agendamentos com o mesmo ID em namespaces diferentes iniciam instâncias separadas. Uma ocorrência cuja execução já foi iniciada não é iniciada de novo: o disparo repetido é ignorado e registrado como `already_fired_occurrence`.

Onde o formato se aplica:

- **Workflow embutido 2.15.15 e posteriores.** Um `trigger()` manual não tem ocorrência, então seu ID termina com o horário do disparo em milissegundos Unix em vez de `backfill:{occurrence}`. Execuções iniciadas por versões anteriores mantêm seus IDs `schedule:{scheduleId}:{suffix}`.
- **Server nativo 3.13.0 e posteriores.** Disparos manuais não têm ocorrência e mantêm IDs gerados pelo servidor. Execuções iniciadas por versões anteriores do Server mantêm seus IDs gerados.

## Leitura da ocorrência no código do workflow {#reading-the-occurrence-in-workflow-code}

Um agendamento passa os mesmos argumentos a todas as execuções, inclusive as de preenchimento retroativo. Para saber qual ocorrência uma execução representa, chame `$this->scheduleOrigin()` no workflow. O método retorna um `Workflow\V2\Support\ScheduleOrigin`, ou `null` para uma execução que nenhum agendamento iniciou. Ele está disponível a partir do Workflow embutido 2.30.0.

- `scheduleId` é o identificador do agendamento.
- `occurrenceTime` é o horário avaliado pelo agendador, como `DateTimeImmutable`. Em um tick, é o horário de disparo com jitter. Em um preenchimento retroativo, é a ocorrência passada enumerada. É `null` em um `trigger()` manual, que não tem ocorrência.
- `triggerNumber` indica qual disparo do agendamento foi este, começando em 1.

O valor vem do próprio evento de histórico `ScheduleTriggered` da execução, gravado junto com o início da execução. Ele está disponível na primeira tarefa de workflow e é o mesmo em todo replay. Não é o horário de início da execução nem `Workflow::now()`, então não se desloca com o jitter, atrasos do agendador ou inícios em buffer.

Um relatório diário que processa o dia anterior à sua ocorrência:

```php
use Workflow\V2\Workflow;

final class DailyReportWorkflow extends Workflow
{
    public function handle(): mixed
    {
        $windowEnd = $this->scheduleOrigin()?->occurrenceTime
            ?? throw new LogicException('Start this workflow from a schedule.');
        $windowStart = $windowEnd->modify('-1 day');

        return Workflow::activity(
            BuildReport::class,
            $windowStart->format(DATE_ATOM),
            $windowEnd->format(DATE_ATOM),
        );
    }
}
```

Com o cron `0 0 * * *` e jitter, um tick que dispara às 00:00:12 UTC de 2026-11-18 cobre de 2026-11-17T00:00:12 a 2026-11-18T00:00:12. Um preenchimento retroativo que abrange as ocorrências da meia-noite de 1º, 2 e 3 de novembro inicia três execuções cujas janelas terminam nessas meias-noites, embora as três comecem agora.

Quais execuções mantêm a origem:

- **Continue-as-new.** A sucessora pertence à mesma execução agendada. Ela registra o `ScheduleTriggered` da antecessora logo após o próprio início e lê a mesma origem. O Server nativo faz isso desde a 3.5.0.
- **Repetições e redrive.** As repetições de atividade acontecem dentro da execução, então veem a mesma origem. Uma execução iniciada por agendamento nunca é repetida como uma nova execução, e o redrive de uma execução com falha iniciada por agendamento é recusado com `unsupported_history`. Nenhuma execução repetida pode perder a origem.
- **Disparos posteriores.** Cada disparo, seja tick ou preenchimento retroativo, inicia sua própria execução com sua própria origem.

Execuções iniciadas antes de esta API existir já têm o evento, então também leem sua origem. Históricos sem o evento leem `null`.

Workers em modo de serviço leem o mesmo valor do seu contexto de workflow. Use-os com o Server nativo 3.13.0 ou posterior, que registra o evento `ScheduleTriggered` que eles leem.

- SDK de PHP 3.13.0 e posteriores: `WorkflowContext::scheduleOrigin()`.
- SDK de Python 2.19.0 e posteriores: `ctx.schedule_origin`.
- SDK de Rust 4.19.0 e posteriores: `ctx.schedule_origin()`.

## Roteamento por fila {#queue-routing}

Quando `connection` ou `queue` é definido em um agendamento, os workflows disparados são encaminhados a essa conexão e fila, em vez do padrão da classe de workflow:

```php
$schedule = ScheduleManager::create(
    scheduleId: 'priority-sync',
    workflowClass: InvoiceSyncWorkflow::class,
    cronExpression: '0 * * * *',
    connection: 'redis',
    queue: 'high-priority',
);

// Every triggered run dispatches to redis/high-priority,
// regardless of InvoiceSyncWorkflow's default routing.
```

A precedência de roteamento é: campos do agendamento → padrões da classe de workflow → configuração global de fila.

## Variação aleatória de horário {#jitter}

Quando vários agendamentos compartilham a mesma expressão cron, todos disparam no mesmo instante, criando um pico simultâneo de carga. O parâmetro `jitterSeconds` espalha os disparos por uma janela aleatória para suavizar a carga.

```php
$schedule = ScheduleManager::create(
    scheduleId: 'hourly-report',
    workflowClass: ReportWorkflow::class,
    cronExpression: '0 * * * *',
    jitterSeconds: 300, // fire within 0–300 seconds after the top of the hour
);
```

Quando `jitterSeconds` é definido, cada `next_fire_at` calculado recebe um deslocamento aleatório entre 0 e `jitterSeconds`, inclusive. A variação é sorteada novamente a cada cálculo do próximo disparo, após um disparo, retomada ou atualização.

A variação só se aplica ao horário de disparo da avaliação por tick armazenado no banco. A enumeração do preenchimento retroativo sempre usa horários cron canônicos, sem variação, para que as ocorrências recuperadas coincidam com os horários cron exatos.

Definir `jitterSeconds` como `0`, o padrão, desabilita totalmente a variação: os horários de disparo correspondem exatamente ao cron.

## Tipos de evento de histórico {#history-event-types}

Eventos de ciclo de vida de agendamentos são registrados em dois fluxos separados:

- **Linhagem da execução de workflow.** Quando um agendamento dispara um
  workflow, um evento `ScheduleTriggered` é acrescentado ao histórico da
  execução iniciada (`workflow_history_events`). Isso dá à execução um
  vínculo verificável com o agendamento que a iniciou.
- **Fluxo de auditoria do agendamento.** Cada transição de ciclo de vida do
  agendamento é registrada no log de auditoria por agendamento
  (`workflow_schedule_history_events`), com um campo `sequence` que aumenta
  monotonicamente. O fluxo de auditoria é a fonte de verdade sobre “o que
  aconteceu com este agendamento”; o histórico da execução é a fonte de
  verdade sobre “por que esta execução foi iniciada”.

Ambos os fluxos usam o mesmo enum `HistoryEventType` e o mesmo registro de
chaves de payload `HistoryEventPayloadContract`, mantendo sincronizados os
nomes dos eventos e os formatos de payload entre os fluxos.

### Evento de linhagem da execução (na execução de workflow iniciada) {#run-lineage-event-on-the-started-workflow-run}

`ScheduleTriggered` é acrescentado ao histórico da execução de workflow
disparada com as seguintes chaves de payload:

- `schedule_id`: identificador do agendamento visível ao usuário.
- `schedule_ulid`: chave primária ULID interna do agendamento.
- `cron_expression`, `timezone`, `overlap_policy`: expressão cron principal,
  fuso horário IANA e política de sobreposição ativos no momento do disparo.
- `trigger_number`: número desse disparo, contado a partir de 1.
- `occurrence_time`: horário de disparo avaliado pelo agendador. Disparos por
  tick registram o `next_fire_at` vencido; disparos retroativos registram a
  ocorrência enumerada. Com a variação aleatória habilitada, o valor de
  disparos por tick inclui o horário com variação armazenado no agendamento.

### Fluxo de auditoria do agendamento (no próprio agendamento) {#schedule-audit-stream-on-the-schedule-itself}

Cada transição de ciclo de vida é registrada no fluxo de auditoria do próprio
agendamento. As sequências começam em `1` para `ScheduleCreated` e aumentam
monotonicamente por agendamento.

| Evento | Quando é registrado | Chaves de payload |
| --- | --- | --- |
| `ScheduleCreated` | O agendamento foi criado | `spec`, `action`, `overlap_policy`, `next_fire_at`, `command_context` |
| `SchedulePaused` | O agendamento foi pausado | `reason`, `paused_at`, `command_context` |
| `ScheduleResumed` | O agendamento foi retomado | `next_fire_at`, `command_context` |
| `ScheduleUpdated` | O cron, fuso horário, especificação, ação ou política do agendamento foi alterado | `changed_fields`, `spec`, `action`, `overlap_policy`, `next_fire_at`, `command_context` |
| `ScheduleTriggered` | Uma execução de workflow foi iniciada pelo agendamento | `workflow_instance_id`, `workflow_run_id`, `outcome`, `effective_overlap_policy`, `trigger_number`, `occurrence_time`, `command_context` |
| `ScheduleTriggerSkipped` | Um disparo foi ignorado pela política de sobreposição, por status que não permite disparo ou por ações esgotadas | `reason`, `skipped_trigger_count`, `last_skipped_at`, `occurrence_time`, `command_context` |
| `ScheduleDeleted` | O agendamento foi excluído logicamente, por chamada explícita de exclusão ou por esgotar `max_runs` (`reason: max_runs_exhausted`) | `reason`, `deleted_at`, `command_context` |

`command_context` contém os atributos de principal, ID de requisição, origem
e motivo registrados por `ScheduleManager` quando o chamador passa um
`CommandContext`. Ele é opcional: eventos registrados sem contexto omitem a
chave, em vez de gravar um valor em branco.

### Estabilidade do contrato de payload {#payload-contract-stability}

As chaves de payload das duas tabelas acima são declaradas em
`Workflow\V2\Support\HistoryEventPayloadContract`, verificadas em cada gravação
e fixadas por cobertura de testes no pacote de workflow. Adicionar uma chave
a qualquer evento de agendamento é uma mudança no formato de transmissão e
segue as regras de alteração de eventos de histórico do
[contrato de compatibilidade de versões](../compatibility.md).

### Retenção {#retention}

No Laravel embarcado, o Workflow a partir da versão 2.29.0 mantém por padrão até 1.000 instantâneos
de auditoria por agendamento. O primeiro evento, normalmente `ScheduleCreated`, e os mais recentes
mantêm seus números de sequência originais. Defina `DW_V2_SCHEDULE_AUDIT_HISTORY_LIMIT` ou
`workflows.v2.schedules.audit_history_limit` como um inteiro maior ou igual a 2 para alterar o
limite.

Cada novo evento de auditoria remove até 100 instantâneos antigos. Para reduzir manualmente o
histórico de um agendamento existente, repita o comando a seguir até `retained_events` ficar menor
ou igual a `configured_limit`.

```sh
php artisan workflow:v2:schedule-audit-prune --namespace=orders --schedule=daily-invoices
```

A exclusão de um agendamento pela API registra `ScheduleDeleted` e preserva o histórico de auditoria
retido e os registros de disparo. Após excluir fisicamente a linha do agendamento, limpe seus
registros órfãos no espaço de nomes exato.

```sh
php artisan workflow:v2:schedule-audit-prune --namespace=orders --limit=500
```

O limite da limpeza se aplica à soma dos eventos de auditoria e dos registros de disparo. Repita o
comando até `audit_events_deleted` e `occurrences_deleted` chegarem a zero. Use `--null-namespace`
no lugar de `--namespace` para linhas antigas cujo espaço de nomes seja `NULL` no SQL.

Antes de ativar o limite, execute a migração de ocorrências de agendamento e encerre os agendadores
antigos e os processos que gravam agendamentos. Em uma atualização por etapas, defina
`workflows.v2.schedules.audit_history_limit` como `null` do PHP até que esses processos parem. Os
registros de disparo permanecem após a remoção de instantâneos e continuam evitando inícios
duplicados. [Instruções de
atualização](https://github.com/durable-workflow/workflow/releases/tag/2.29.0)

### Visibilidade {#visibility}

O fluxo de auditoria é exposto por todas as interfaces do operador:

- **No processo (Eloquent).** `WorkflowSchedule::historyEvents()`
  (resolvido por `ConfiguredV2Models::query(
  'schedule_history_event_model', ...)`) retorna o fluxo de um agendamento
  a partir da aplicação host.
- **HTTP do Waterline.** `GET /waterline/api/v2/schedules/{scheduleId}/history`
  retorna o fluxo com paginação por cursor usando `limit` (1–500, padrão 100)
  e `after_sequence`. A resposta é restrita ao namespace do Waterline, para
  que implantações com vários tenants só vejam as linhas de auditoria do seu tenant.
- **Interface do Waterline.** A ação **Histórico** em cada linha do registro de
  agendamentos abre uma janela modal com o fluxo desse agendamento. Eventos
  são exibidos com sequência, horário registrado, tipo, IDs vinculados de
  instância e execução de workflow e payload formatado. O controle
  **Carregar mais** avança o cursor em lotes de 100.
- **HTTP do servidor independente.** `GET /api/schedules/{scheduleId}/history`
  no servidor independente retorna o mesmo fluxo com o mesmo contrato de
  paginação e as mesmas regras de escopo `X-Namespace`. O histórico permanece
  disponível após a exclusão lógica, pois a trilha de auditoria permite ao
  operador reconstruir um agendamento removido.
- **CLI.** `dw schedule:history <schedule-id>` imprime o fluxo em uma tabela
  (`Seq`, `Event`, `Recorded At`, `Workflow Refs`), com uma indicação
  **More events available** quando `has_more` é true. `--limit` e
  `--after-sequence` são encaminhados ao endpoint do servidor, `--all`
  pagina todos os eventos restantes e `--output=json` / `--output=jsonl`
  emitem saída estruturada. `jsonl` remove o envelope de cursor para que
  cada linha seja um evento autossuficiente.
- **SDK Python.** `Client.get_schedule_history(schedule_id, *, limit=None,
  after_sequence=None)` retorna uma única `ScheduleHistoryPage`, e
  `Client.iter_schedule_history(schedule_id, *, limit=None, after_sequence=None)`
  é um `AsyncIterator[ScheduleHistoryEvent]` que pagina o fluxo completo com
  os mesmos argumentos nomeados. `ScheduleHandle` expõe os métodos de
  conveniência correspondentes `.history(...)` e `.iter_history(...)`.
  `limit` é restringido pelo servidor entre 1 e 500 (padrão 100), e
  `after_sequence` é um cursor não negativo obtido do `next_cursor` da página anterior.

Todas essas interfaces leem a mesma tabela `workflow_schedule_history_events`.
O contrato de chaves de payload em
[Estabilidade do contrato de payload](#payload-contract-stability) vale
independentemente da interface usada pelo operador.

### Comportamento da migração para agendamentos anteriores à auditoria {#migration-behavior-for-pre-audit-schedules}

O fluxo de auditoria de agendamentos foi introduzido com a tabela
`workflow_schedule_history_events`. Agendamentos criados antes dessa migração
não recebem um evento retroativo `ScheduleCreated`. `ScheduleManager`
registra eventos de auditoria apenas conforme ocorrem transições de ciclo de
vida, e a migração não sintetiza um evento retroativo para agendamentos existentes.

O que isso significa para operadores:

- O fluxo de um agendamento preexistente fica vazio até sua próxima transição
  de ciclo de vida. Pausar, retomar, atualizar, disparar, ignorar um disparo
  ou excluir o agendamento acrescenta eventos normalmente a partir daí.
- Os números de sequência ainda começam em `1` e aumentam monotonicamente
  por agendamento. Um agendamento preexistente cujo primeiro evento registrado
  é `SchedulePaused` terá `sequence = 1` nessa linha. A ausência de um
  `ScheduleCreated` anterior é esperada.
- Eventos `ScheduleTriggered` e `ScheduleTriggerSkipped` são gravados sempre
  que um tick avalia o agendamento. Assim, qualquer agendamento que dispare
  em cadência cron após a migração acumulará linhas de auditoria sem intervenção do operador.
- Nenhuma ação do operador é necessária para incluir um agendamento no fluxo
  de auditoria. O fluxo está sempre habilitado; só não tem linhas até a
  gravação do primeiro evento após a migração.

## Rastreamento de disparos ignorados {#skip-tracking}

Quando um disparo é ignorado pela política de sobreposição, por status que não permite disparo ou por ações esgotadas, o agendamento registra:

- `last_skip_reason`: por que o disparo mais recente foi ignorado (por exemplo, `overlap_policy_skip`, `status_not_triggerable`, `remaining_actions_exhausted`)
- `last_skipped_at`: quando o disparo foi ignorado
- `skipped_trigger_count`: número acumulado de disparos ignorados

Esses campos são incluídos em `ScheduleManager::describe()` e na API de detalhes de agendamento do Waterline.

## Escopo de namespace {#namespace-scoping}

Agendamentos pertencem a um namespace. Quando `namespace` é passado a `create()` ou `createFromSpec()`, o agendamento fica restrito a ele. Quando omitido, herda o `workflows.v2.namespace` configurado, cujo padrão é `'default'`.

IDs de agendamento são únicos dentro de um namespace. O mesmo `scheduleId` pode existir em namespaces diferentes sem conflito.

O iniciador PHP padrão de agendamentos passa o namespace armazenado do
agendamento à instância de workflow, à execução e às tarefas duráveis. Uma
mudança posterior no namespace padrão da aplicação não move as execuções de
um agendamento existente. Use Workflow 2.4.2 ou posterior para essa propagação de namespace.

```php
$schedule = ScheduleManager::create(
    scheduleId: 'daily-sync',
    workflowClass: SyncWorkflow::class,
    cronExpression: '0 2 * * *',
    namespace: 'billing',
);

// Find by schedule ID within a namespace:
$found = ScheduleManager::findByScheduleId('daily-sync', namespace: 'billing');
```

Quando o Waterline é configurado com um namespace (`waterline.namespace`), os endpoints de lista e detalhes de agendamentos ficam automaticamente restritos a ele. Isso garante que implantações com vários tenants mostrem apenas agendamentos pertencentes ao namespace do operador.

## Banco de dados {#database}

A tabela de agendamentos (`workflow_schedules`) é criada pela migração `2026_04_14_000157`. A classe do modelo é configurável por `workflows.v2.schedule_model`.

Se sua implantação executa migrações do pacote junto com migrações da aplicação, a migração 157 detecta uma tabela `workflow_schedules` preexistente e a trata adequadamente: se a tabela já corresponde ao schema do pacote, é mantida como está; se foi criada por uma migração de compatibilidade anterior com outro schema, é substituída.
