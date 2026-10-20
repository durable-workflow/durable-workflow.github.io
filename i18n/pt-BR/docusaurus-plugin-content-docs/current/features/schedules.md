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

O `scheduleId` é um identificador único escolhido pelo usuário para o agendamento. Cada execução disparada recebe um ID determinístico de instância de workflow derivado do ID do agendamento e do horário do disparo.

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

Atualizar a expressão cron ou o fuso horário recalcula `next_fire_at`.

### Excluir {#delete}

```php
ScheduleManager::delete($schedule);
```

A exclusão é lógica: a linha permanece com status `deleted` e horário `deleted_at`. Um agendamento excluído não pode ser pausado, retomado, atualizado nem disparado.

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

`tick()` encontra todos os agendamentos ativos cujo `next_fire_at` está no passado e os dispara em ordem. O campo `occurrence_time` é o horário de disparo vencido observado pelo agendador. Após cada disparo, `next_fire_at` avança a partir da hora atual para a próxima ocorrência cron ou de intervalo.

### Política para disparos perdidos {#missed-fire-policy}

A avaliação ao vivo dos agendamentos usa a semântica **disparar uma vez e retomar**. Se o agendador ficar indisponível durante um ou mais horários nominais de disparo, o primeiro tick após a recuperação inicia um workflow para o `next_fire_at` vencido, registra esse horário como `occurrence_time` e então avança `next_fire_at` a partir da hora atual. Ocorrências nominais adicionais que passaram durante a indisponibilidade são ignoradas pela avaliação ao vivo.

Use `backfill()` quando todas as ocorrências perdidas precisarem executar. O preenchimento retroativo enumera explicitamente a janela solicitada e registra cada ocorrência separadamente.

### Comando Artisan {#artisan-command}

Execute um único tick pela linha de comando:

```bash
php artisan workflow:v2:schedule-tick
php artisan workflow:v2:schedule-tick --json
```

O servidor independente expõe a mesma passagem de avaliação com seu próprio comando:

```bash
php artisan schedule:evaluate --limit=100
```

Para avaliar agendamentos continuamente, chame esse comando pelo agendador de tarefas do Laravel:

```php
// app/Console/Kernel.php
$schedule->command('workflow:v2:schedule-tick')->everyMinute();
```

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

IDs de instância do preenchimento retroativo são determinísticos: `schedule:{scheduleId}:backfill:{timestamp}`.

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
| `ScheduleTriggerSkipped` | Um disparo foi ignorado pela política de sobreposição, por status que não permite disparo ou por ações esgotadas | `reason`, `skipped_trigger_count`, `last_skipped_at`, `command_context` |
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

O fluxo de auditoria é retido durante toda a vida da linha do agendamento.
A exclusão do agendamento é lógica e grava um evento final `ScheduleDeleted`.
As próprias linhas de auditoria não são excluídas em cascata quando uma linha
de agendamento é removida. Operadores que removem agendamentos históricos
devem escolher uma estratégia explícita de retenção para sua implantação.
O pacote não inclui um TTL para eventos de auditoria.

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
