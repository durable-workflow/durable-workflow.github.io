---
sidebar_position: 20
---

# 调度 {#schedules}

调度通过 cron 表达式周期性启动工作流运行。每项调度都是具名的持久实体，引擎在每次 tick 时评估是否应触发新运行。

## 创建调度 {#creating-a-schedule}

使用 `ScheduleManager::create()` 定义具名调度：

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

`scheduleId` 是用户选择的唯一调度标识。每次触发运行都会获得由调度 ID 和触发时间戳推导出的确定性工作流实例 ID。

### 参数 {#parameters}

| 参数 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `scheduleId` | `string` | 必填 | 唯一调度标识 |
| `workflowClass` | `string` | 必填 | 要启动的工作流类 |
| `cronExpression` | `string` | 必填 | 标准 cron 表达式，5 个字段 |
| `arguments` | `array` | `[]` | 传入工作流 `handle()` 方法的参数 |
| `timezone` | `string` | `'UTC'` | 评估 cron 表达式的时区 |
| `overlapPolicy` | `ScheduleOverlapPolicy` | `Skip` | 前次运行仍活动时的处理方式 |
| `labels` | `array` | `[]` | 应用于每个触发运行的可见性标签 |
| `memo` | `array` | `[]` | 应用于每个触发运行的 memo 字段 |
| `searchAttributes` | `array` | `[]` | 应用于每个触发运行的搜索属性 |
| `jitterSeconds` | `int` | `0` | 添加到每次触发时间的最大随机延迟秒数，用于缓解惊群 |
| `maxRuns` | `int\|null` | `null` | 自动删除调度前允许的最大运行次数 |
| `connection` | `string\|null` | `null` | 触发运行的队列连接，覆盖工作流类默认值 |
| `queue` | `string\|null` | `null` | 触发运行的队列名称，覆盖工作流类默认值 |
| `notes` | `string\|null` | `null` | 自由格式运维备注 |
| `namespace` | `string\|null` | `null` | 调度的命名空间，默认使用配置的 `workflows.v2.namespace` 或 `'default'` |
| `executionTimeoutSeconds` | `int\|null` | `null` | 每次逻辑工作流执行跨重试和 continue-as-new 的超时 |
| `runTimeoutSeconds` | `int\|null` | `null` | 每次独立运行的超时，continue-as-new 时重置 |

### 工作流超时 {#workflow-timeouts}

执行超时覆盖跨重试和 continue-as-new 的一次逻辑执行。运行超时限制单次运行，并在 continue-as-new 时重置。单次运行不能超过剩余执行预算。每次调度触发都从实际工作流启动时开始新的执行预算，而非从计划触发时间计时。

两个选项接受正整数秒数或 `null`。省略或设为 `null` 则不设置相应限制。手动触发、自动 tick、缓冲启动和回填均通过默认 PHP 启动器应用已存限制。

使用 `createFromSpec()` 时，将限制放入 action：

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

创建和更新 action 时，按与直接启动相同的 `StartOptions` 规则验证 PHP 工作流超时，无需自定义启动器。

更新 action 可更改未来启动的限制：

```php
$schedule = ScheduleManager::update($schedule, action: [
    ...$schedule->action,
    'execution_timeout_seconds' => 240,
    'run_timeout_seconds' => 90,
]);
```

action 会被替换，因此须按示例保留工作流类和输入。已启动运行保留原始截止时间。将超时字段设为 `null` 可移除后续启动的相应限制。

## 高级调度 {#advanced-scheduling}

基本 cron 模式不足时，以下功能可用于固定间隔触发、混合 cron 与间隔规范，以及重叠策略。没有这些需求时可跳过。

### 基于间隔的调度 {#interval-based-schedules}

除 cron 表达式外，调度也支持 ISO 8601 时长语法的间隔触发。使用 `ScheduleManager::createFromSpec()` 可完整控制调度规范：

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

### 间隔规范字段 {#interval-spec-fields}

| 字段 | 类型 | 说明 |
|---|---|---|
| `every` | `string` | ISO 8601 时长，例如 `PT30M` 为 30 分钟，`PT1H` 为 1 小时，`P1D` 为 1 天 |
| `offset` | `string\|null` | ISO 8601 时长表示的相位偏移，移动间隔的对齐点 |

offset 控制调度在间隔周期中的触发位置。例如，每小时一次、偏移 5 分钟的调度在 `:05`、`:05+1h` 等时刻触发：

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

### 混合 cron 与间隔规范 {#mixed-cron-and-interval-specs}

单项调度可以组合 cron 表达式和间隔。引擎评估所有规范，选择最早的下一触发时间：

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

`createFromSpec` 接受与 `create()` 相同的所有生命周期参数，包括 `overlapPolicy`、`jitterSeconds`、`maxRuns`、`connection`、`queue`、`namespace` 等，均作为独立具名参数传入。

## 重叠策略 {#overlap-policies}

调度触发时，前次运行若仍活动，重叠策略决定处理方式：

| 策略 | 行为 |
|---|---|
| `Skip` | 不启动新运行，默认策略 |
| `BufferOne` | 缓冲一次待处理触发，缓冲排空前跳过后续触发。活动运行完成后的下一次 `tick()` 自动执行缓冲触发。 |
| `BufferAll` | 缓冲全部待处理触发，不设上限；前次运行完成后依次排空每次缓冲触发。 |
| `AllowAll` | 无论前次运行状态如何，都启动新运行 |
| `CancelOther` | 取消前次运行，再启动新运行 |
| `TerminateOther` | 终止前次运行，再启动新运行 |

## 管理调度 {#managing-schedules}

### 暂停与恢复 {#pause-and-resume}

```php
ScheduleManager::pause($schedule);

// The schedule will not trigger while paused.

ScheduleManager::resume($schedule);
// next_fire_at is recalculated from now.
```

### 更新 {#update}

```php
ScheduleManager::update(
    $schedule,
    cronExpression: '30 3 * * *',
    timezone: 'America/Chicago',
    overlapPolicy: ScheduleOverlapPolicy::AllowAll,
    notes: 'Moved to 3:30 AM CT.',
);
```

更新 cron 表达式或时区会重新计算 `next_fire_at`。

### 删除 {#delete}

```php
ScheduleManager::delete($schedule);
```

删除采用软删除，行保留为 `deleted` 状态，并带 `deleted_at` 时间戳。已删除调度不能暂停、恢复、更新或触发。

### 描述 {#describe}

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

### 按调度 ID 查找 {#find-by-schedule-id}

```php
$schedule = ScheduleManager::findByScheduleId('daily-invoice-sync');
```

## 触发调度 {#triggering-schedules}

### 手动触发 {#manual-trigger}

```php
$instanceId = ScheduleManager::trigger($schedule);
```

这会立即评估重叠策略，允许时启动新工作流运行。返回已启动工作流的实例 ID；触发被跳过时返回 `null`。

### tick：评估所有到期调度 {#tick-evaluate-all-due-schedules}

```php
$results = ScheduleManager::tick();

// Returns rows with schedule_id, instance_id, outcome, occurrence_time,
// last_fired_at, and next_fire_at when those fields apply.
```

`tick()` 查找所有 `next_fire_at` 已过期的活动调度，并依次触发。`occurrence_time` 是调度器观察到的到期触发时间。每次触发后，`next_fire_at` 从当前时钟推进到下一个 cron 或间隔时点。

### 错过触发的策略 {#missed-fire-policy}

实时调度评估使用**触发一次，然后恢复正常**语义。调度器停机跨越一个或多个计划触发时间时，恢复后的首次 tick 为逾期 `next_fire_at` 启动一个工作流，将该到期时间记录为 `occurrence_time`，然后从当前时钟推进 `next_fire_at`。停机期间额外错过的计划时点会被实时评估跳过。

每个错过时点都必须运行时，使用 `backfill()`。回填显式枚举请求的时间窗口，分别记录每个时点。

### Artisan 命令 {#artisan-command}

从命令行执行单次 tick：

```bash
php artisan workflow:v2:schedule-tick
php artisan workflow:v2:schedule-tick --json
```

独立 Server 通过自己的命令提供相同评估过程：

```bash
php artisan schedule:evaluate --limit=100
```

要持续评估调度，请从 Laravel 任务调度器调用此命令：

```php
// app/Console/Kernel.php
$schedule->command('workflow:v2:schedule-tick')->everyMinute();
```

## 最大运行次数 {#max-runs}

设置 `maxRuns` 后，调度跟踪 `remaining_actions`。最后一次允许的触发完成后，调度自动软删除。

```php
$schedule = ScheduleManager::create(
    scheduleId: 'one-shot-retry',
    workflowClass: RetryWorkflow::class,
    cronExpression: '*/5 * * * *',
    maxRuns: 3,
);

// After 3 triggers, the schedule status becomes 'deleted'.
```

## 回填 {#backfill}

回填为错过的历史 cron 时点触发工作流，例如调度暂停、部署中断或创建过晚后：

```php
$results = ScheduleManager::backfill(
    $schedule,
    from: new DateTimeImmutable('2026-04-10 00:00:00'),
    to: new DateTimeImmutable('2026-04-14 00:00:00'),
);

// Returns: [['schedule_id' => '...', 'instance_id' => '...|null', 'cron_time' => '...'], ...]
```

每个错过的 cron 时点依次触发。重叠策略适用于每次触发，但有一个例外：**回填期间，缓冲策略（`BufferOne`、`BufferAll`）视为 `AllowAll`**。缓冲是实时流控机制，对追赶操作没有意义。回填应启动每个错过时点，而不是加入永远不会排空的缓冲。也可显式覆盖策略：

```php
$results = ScheduleManager::backfill(
    $schedule,
    from: new DateTimeImmutable('2026-04-10 00:00:00'),
    to: new DateTimeImmutable('2026-04-14 00:00:00'),
    overlapPolicyOverride: ScheduleOverlapPolicy::AllowAll,
);
```

回填遵守 `maxRuns`。剩余动作在回填中途用尽时，操作停止，调度自动删除。

回填实例 ID 是确定性的：`schedule:{scheduleId}:backfill:{timestamp}`。

## 队列路由 {#queue-routing}

调度设置 `connection` 或 `queue` 后，触发工作流派发到指定连接和队列，覆盖工作流类默认值：

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

路由优先级：调度字段 → 工作流类默认值 → 全局队列配置。

## 抖动 {#jitter}

多个调度共享 cron 表达式时，会在同一瞬间触发，形成惊群峰值。`jitterSeconds` 在随机时间窗口内分散触发，使负载平滑。

```php
$schedule = ScheduleManager::create(
    scheduleId: 'hourly-report',
    workflowClass: ReportWorkflow::class,
    cronExpression: '0 * * * *',
    jitterSeconds: 300, // fire within 0–300 seconds after the top of the hour
);
```

设置 `jitterSeconds` 后，每次计算的 `next_fire_at` 都加上 0 至 `jitterSeconds`（含两端）之间的随机偏移。每次计算下一触发时间时重新随机，包括触发、恢复或更新之后。

抖动只应用于数据库中 tick 评估所用的触发时间。回填枚举始终使用标准、无抖动的 cron 时间，使回填时点落在准确的 cron 边界。

`jitterSeconds` 设为 `0`（默认值）时完全禁用抖动，触发时间精确匹配 cron。

## 历史事件类型 {#history-event-types}

调度生命周期事件记录在两条独立事件流中：

- **工作流运行谱系。** 调度触发工作流时，向已启动运行的历史（`workflow_history_events`）追加 `ScheduleTriggered` 事件，为运行提供可验证的来源调度链接。
- **调度审计流。** 每次调度生命周期转换记录在独立调度审计日志（`workflow_schedule_history_events`）中，使用单调递增的 `sequence` 字段。审计流是“此调度发生了什么”的权威依据，运行历史是“此运行为何启动”的权威依据。

两条流使用同一个 `HistoryEventType` 枚举和 `HistoryEventPayloadContract` 载荷键注册表，使事件名和载荷结构跨流保持同步。

### 运行谱系事件：位于已启动工作流运行上 {#run-lineage-event-on-the-started-workflow-run}

`ScheduleTriggered` 追加到触发工作流运行的历史中，包含以下载荷键：

- `schedule_id`：用户可见的调度标识。
- `schedule_ulid`：调度内部 ULID 主键。
- `cron_expression`、`timezone`、`overlap_policy`：触发时的主要 cron 表达式、IANA 时区和生效重叠策略。
- `trigger_number`：第几次触发，从 1 开始。
- `occurrence_time`：调度器评估的触发时间。tick 触发记录到期的 `next_fire_at`；回填触发记录枚举出的回填时点。启用抖动时，tick 值包含调度存储的抖动后触发时间。

### 调度审计流：位于调度本身 {#schedule-audit-stream-on-the-schedule-itself}

每次调度生命周期转换记录在调度自身的审计流中。序列从 `ScheduleCreated` 的 `1` 开始，按调度单调递增。

| 事件 | 记录时机 | 载荷键 |
| --- | --- | --- |
| `ScheduleCreated` | 调度创建时 | `spec`、`action`、`overlap_policy`、`next_fire_at`、`command_context` |
| `SchedulePaused` | 调度暂停时 | `reason`、`paused_at`、`command_context` |
| `ScheduleResumed` | 调度恢复时 | `next_fire_at`、`command_context` |
| `ScheduleUpdated` | cron、时区、规范、action 或策略更改时 | `changed_fields`、`spec`、`action`、`overlap_policy`、`next_fire_at`、`command_context` |
| `ScheduleTriggered` | 从调度启动工作流运行时 | `workflow_instance_id`、`workflow_run_id`、`outcome`、`effective_overlap_policy`、`trigger_number`、`occurrence_time`、`command_context` |
| `ScheduleTriggerSkipped` | 因重叠策略、不可触发状态或动作耗尽跳过触发时 | `reason`、`skipped_trigger_count`、`last_skipped_at`、`command_context` |
| `ScheduleDeleted` | 显式删除或用尽 `max_runs`（`reason: max_runs_exhausted`）导致调度软删除时 | `reason`、`deleted_at`、`command_context` |

调用方传入 `CommandContext` 时，`command_context` 携带 `ScheduleManager` 记录的主体、请求 ID、来源和原因属性。该键可选；无上下文的事件省略该键，不写入空值。

### 载荷契约稳定性 {#payload-contract-stability}

以上两表中的载荷键在 `Workflow\V2\Support\HistoryEventPayloadContract` 中声明，每次写入都断言校验，并由工作流包测试固定。为任何调度事件添加新键都是线格式变更，须遵循[版本兼容性契约](../compatibility.md)中的历史事件变更规则。

### 保留 {#retention}

审计流在调度行生命周期内保留。删除调度是软删除，会写入最终 `ScheduleDeleted` 事件；移除调度行时，审计行本身不会级联删除。清理历史调度的运维人员必须为部署选择明确的保留策略，包没有提供审计事件的内置 TTL。

### 可见性 {#visibility}

所有运维接口都提供审计流：

- **进程内（Eloquent）。** `WorkflowSchedule::historyEvents()` 通过 `ConfiguredV2Models::query('schedule_history_event_model', ...)` 解析，从宿主应用内部返回某项调度的事件流。
- **Waterline HTTP。** `GET /waterline/api/v2/schedules/{scheduleId}/history` 返回流，支持 `limit`（1 至 500，默认 100）和 `after_sequence` 游标分页。响应限定在 Waterline 命名空间，多租户部署只看到本租户审计行。
- **Waterline 界面。** Waterline 调度注册表每行的 **History（历史）**操作打开模态框展示该调度流。事件显示序列、记录时间、事件类型、关联工作流实例及运行 ID 和格式化载荷。**Load more（加载更多）**控件每次推进游标加载 100 条。
- **独立 Server HTTP。** 独立 Server 的 `GET /api/schedules/{scheduleId}/history` 返回相同事件流，使用相同分页契约和 `X-Namespace` 范围规则。调度软删除后仍可查看历史，因为运维人员需要审计轨迹重建已移除调度。
- **CLI。** `dw schedule:history <schedule-id>` 将流打印为表格，列为 `Seq`、`Event`、`Recorded At`、`Workflow Refs`。`has_more` 为真时提示 **More events available（还有更多事件）**。`--limit` 和 `--after-sequence` 转发至 Server 端点，`--all` 分页读取所有剩余事件，`--output=json` / `--output=jsonl` 输出结构化结果；`jsonl` 移除游标信封，使每行是独立完整事件。
- **Python SDK。** `Client.get_schedule_history(schedule_id, *, limit=None, after_sequence=None)` 返回一个 `ScheduleHistoryPage`；`Client.iter_schedule_history(schedule_id, *, limit=None, after_sequence=None)` 是 `AsyncIterator[ScheduleHistoryEvent]`，用相同关键字参数分页遍历完整事件流。`ScheduleHandle` 提供对应的 `.history(...)` 和 `.iter_history(...)` 便捷方法。Server 将 `limit` 限定在 1 至 500 之间，默认 100；`after_sequence` 为非负游标，取自上一页的 `next_cursor`。

这些接口均读取同一 `workflow_schedule_history_events` 表。无论使用哪个运维接口，[载荷契约稳定性](#payload-contract-stability)中的载荷键契约都适用。

### 审计流引入前调度的迁移行为 {#migration-behavior-for-pre-audit-schedules}

调度审计流与 `workflow_schedule_history_events` 表一起引入。执行该迁移前创建的调度不会补记 `ScheduleCreated`。`ScheduleManager` 仅在生命周期转换发生时记录审计事件，迁移不会为已有调度合成回填事件。

运维含义：

- 已有调度在下一次生命周期转换前，流为空。此后暂停、恢复、更新、触发、跳过触发或删除调度，都会正常追加事件。
- 序列仍从 `1` 开始，按调度单调递增。已有调度的首个记录事件若是 `SchedulePaused`，该行 `sequence = 1`；此前没有 `ScheduleCreated` 是预期情况。
- tick 每次评估调度时都会写入 `ScheduleTriggered` 或 `ScheduleTriggerSkipped`，因此迁移后按 cron 触发的调度会自动累积审计行，无需运维干预。
- 无需任何运维操作来启用审计流。它始终开启，只是在迁移后的首个事件写入前没有行。

## 跳过跟踪 {#skip-tracking}

因重叠策略、不可触发状态或动作耗尽跳过触发时，调度记录：

- `last_skip_reason`：最近一次跳过触发的原因，如 `overlap_policy_skip`、`status_not_triggerable`、`remaining_actions_exhausted`
- `last_skipped_at`：跳过发生时间
- `skipped_trigger_count`：累计跳过次数

这些字段包含在 `ScheduleManager::describe()` 和 Waterline 调度详情 API 中。

## 命名空间范围 {#namespace-scoping}

调度属于某个命名空间。向 `create()` 或 `createFromSpec()` 传入 `namespace` 时，调度限定在该命名空间；省略时继承配置的 `workflows.v2.namespace`，默认 `'default'`。

调度 ID 在命名空间内唯一，相同 `scheduleId` 可在不同命名空间存在，不发生冲突。

标准 PHP 调度启动器将调度保存的命名空间传给工作流实例、运行和持久任务。应用默认命名空间之后发生变化，不会移动已有调度的执行。该命名空间传播需要 Workflow 2.4.2 或更新版本。

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

Waterline 配置命名空间（`waterline.namespace`）后，调度列表和详情端点自动限定到该命名空间，确保多租户部署只展示运维人员所属命名空间的调度。

## 数据库 {#database}

调度表（`workflow_schedules`）由迁移 `2026_04_14_000157` 创建，模型类可通过 `workflows.v2.schedule_model` 配置。

部署同时运行包迁移和应用迁移时，迁移 157 会检测已有 `workflow_schedules` 表并妥善处理：若表已匹配包结构则保持原样；若由早期兼容迁移创建且结构不同，则替换该表。
