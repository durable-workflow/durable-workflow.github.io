---
sidebar_position: 13
title: 迁移到 2.0
description: 将现有 Laravel Workflow v1 应用升级至 Durable Workflow v2。
tags:
  - migration
  - upgrade
  - v2
keywords:
  - 迁移到 Durable Workflow v2
  - Laravel Workflow 升级
  - v2 schema 迁移
  - 工作流 v1 到 v2
---

# 迁移到 2.0 {#migrating-to-20}

本指南介绍现有 Laravel v1 应用升级至 v2 时的主要变化。首先在 [Laravel 采用与运行时迁移指南](/docs/laravel-adoption/)中选择：继续由 Laravel 拥有运行时，还是通过 PHP SDK 连接 Cloud 或自托管 Server。本页随后提供详细的 v1 到 v2 嵌入式软件包操作流程。

## 升级流程 {#upgrade-procedure}

### 升级之前 {#before-upgrading}

**1. 盘点所有 v1 执行存储**

v1 执行状态不一定仅存于工作流数据库。除工作流行和历史外，Laravel 队列 job 还可能以就绪、延迟或已保留状态存在 Redis、队列数据库、SQS 或其他队列后端中。修改代码前记录以下全部内容：

- 工作流存储连接及实际 v1 模型/表映射
- v1 工作流和活动使用的全部队列连接和队列名称，包括每个工作流或活动的覆盖配置
- 恢复相同队列所需的队列后端数据库、键前缀、区域、账号及其他路由设置
- 用于获取确切 `APP_KEY` 的密钥管理器引用及不可变版本，以及 v1 唯一 job 锁使用的缓存存储

不要把 `APP_KEY` 值、密钥管理器恢复凭据、数据库凭据或队列提供商凭据复制进此清单。加密 job 和序列化工作流参数需要原始密钥，但恢复清单只能包含其密钥管理器引用和版本。将能够取回密钥的凭据与 SQL、队列备份分开进行访问控制。

默认 v1 表是 `workflows`、`workflow_logs`、`workflow_signals`、`workflow_timers`、`workflow_exceptions` 和 `workflow_relationships`。已发布的 `config/workflows.php` 文件可能替换 `stored_workflow_model`、`stored_workflow_log_model`、`stored_workflow_signal_model`、`stored_workflow_timer_model` 或 `stored_workflow_exception_model`。替换模型还可能覆盖其 Eloquent `$table`；`workflow_relationships_table` 单独控制关系表。应备份这些配置模型实际解析的表和存储连接，不要只备份默认名称。

**2. 选择回滚边界，并使 v1 工作静止**

获取恢复切点期间，阻止新工作流启动和信号。暂停调度器，并在当前 job 到达边界后停止所有能消费清单内队列的 Worker。例如：

```bash
# Horizon
php artisan horizon:pause

# Supervisor or systemd (use the names from your deployment)
sudo supervisorctl stop <your-worker-group>:*
sudo systemctl stop laravel-worker
```

若 Supervisor、systemd、Kubernetes 或其他进程管理器立即启动替代 Worker，单独执行 `php artisan queue:restart` 并不能使系统静止。捕获状态前，确认没有使用方能够再保留一个 job。

选择并记录以下一种策略：

- **排空 v1：** 阻止新 v1 工作，让 v1 Worker 继续运行，直到 `php artisan workflow:v1:list`（可用时）或对配置的 stored-workflow 表执行等价查询显示无非终态工作流。随后停止 Worker，确认相关队列中没有就绪、延迟或已保留的 v1 job。仅 SQL 回滚可以覆盖这些已终结 v1 工作流。
- **保留进行中的 v1：** 在 job 边界停止 Worker，对 SQL 及每个持久队列后端获取应用一致快照。队列快照必须包含就绪、延迟和已保留工作，且与 SQL 来自同一恢复切点。除非后端已说明如何安全恢复消息和租约，否则切点前应等待已保留 job 完成。
- **接受进行中工作丢失：** 如果后端无法提供可恢复的队列切点，记录受影响工作流 ID，并明确接受本次回滚无法恢复依赖队列的非终态执行。只有证明下述 Watchdog 路径有效后，才可将符合条件的 `pending` 行排除此处置之外；只有测试过保留的入口后，才可排除真正的纯信号等待。不得将其他 SQL 行宣称为可恢复工作。

真正的纯信号等待，在回滚后外部信号入口仍可用时，可以合理地没有排队 job。活动重试和定时器由队列承载：一条 `workflow_timers` 行或 waiting 状态的 `workflows` 行无法重建丢失的延迟 job。

受支持的 v1.0.77 还会从队列 Worker 循环启动默认启用的 `Workflow\Watchdog`。Watchdog 可以找到 `updated_at` 至少五分钟前、且存在序列化 `arguments` 的 `pending` 工作流，再将其重新分发到记录的连接和队列。这是有界、仅针对 pending 的唤醒路径，不能替代队列备份。只有预发布证据显示恢复的 v1 Worker 循环分发 Watchdog、Watchdog 重新分发符合条件的过期 `pending` 行，以及该工作流在预期队列上推进后，才能依赖它。它不重建活动重试或定时器 job，也不恢复 `waiting` 或 `running` 行。这些状态仍需要保留的队列 job；若工作流确实在等待信号，也可使用有效的外部信号路径。

**3. 备份回滚恢复集**

升级前创建完整数据库备份：

```bash
# MySQL/MariaDB
mysqldump -u root -p your_database > backup-v1-$(date +%Y%m%d-%H%M%S).sql

# PostgreSQL
pg_dump -U postgres your_database > backup-v1-$(date +%Y%m%d-%H%M%S).sql

# Laravel backup package (if installed)
php artisan backup:run --only-db
```

然后按后端保留队列状态：

- **数据库队列：** 将队列表及其连接包含在同一恢复切点中。它们可能位于工作流数据库之外。
- **Redis 队列：** 使用可恢复的 Redis 快照或备份，包含确切队列数据库/前缀及就绪、延迟和已保留键。若同一 Redis 数据库保存切点所需的唯一 job 锁，也保留这些键。优先使用专用队列数据库或实例；恢复共享 Redis 快照可能回退无关应用数据。
- **SQS 或其他托管队列：** 仅当提供商支持的时间点消息恢复能一致保留可用、延迟和进行中消息时才使用。SQS 不为本流程提供任意队列快照，因此应排空 v1 工作，或将剩余依赖队列的 v1 工作归类为不可恢复。仅 SQL 的例外只有已证明符合 Watchdog 条件的 `pending` 行和已测试的纯信号等待。

将 SQL 备份、队列备份、非密钥清单和恢复时间戳放在一起。恢复清单可以列出 `APP_KEY` 密钥管理器引用和版本，但不得包含密钥或能取回它的凭据。密钥管理器、数据库、队列提供商和备份恢复凭据应分别进行访问控制。从一个切点恢复 SQL、从另一个切点恢复队列状态，不属于受支持的进行中回滚。

**4. 先在预发布环境测试**

**未在预发布环境测试，不要升级生产。** 升级包含：

- 数据库 schema 变更（v2 持久内核添加新表；确切数量以 `php artisan migrate` 实际应用为准，未来压缩迁移可能合并各功能文件）
- 需要代码更新的命名空间变化
- 队列 Worker 重启（短暂中断）
- 后端能力验证

**预发布测试清单：**

- [ ] 将 v2 代码部署到预发布环境
- [ ] 对预发布数据库运行迁移
- [ ] 重启队列 Worker
- [ ] 运行 `php artisan workflow:v2:doctor --strict`
- [ ] 启动新 v2 工作流并验证完成
- [ ] 验证 v1 工作流（若有）仍能完成
- [ ] 检查 Waterline 同时显示 v1 和 v2 工作流
- [ ] 运行应用测试套件
- [ ] 确认日志中无错误

仅在预发布验证通过后才继续生产升级。

### 升级步骤 {#upgrade-steps}

**1. 更新 Composer 依赖**

```bash
composer require %%artifact.workflowComposerPackage%%
```

v1 和 v2 维护中的 Composer 软件包都是 `durable-workflow/workflow`；此命令将版本约束改为当前公开 v2 产物固定版本。旧名称 `laravel-workflow/laravel-workflow` 仅是软件包重命名前创建的依赖图的兼容别名。新依赖要求和回滚均使用维护中的名称。当前公开产物固定版本指定稳定 2.0 软件包。若希望 Composer 自动接受兼容的 2.x 更新，使用 `durable-workflow/workflow:^2.0`。

**2. 运行数据库迁移**

```bash
php artisan migrate
```

v2 添加支撑 v2 功能契约的持久内核表。当前各功能迁移创建：

- 核心：`workflow_instances`、`workflow_runs`、`workflow_history_events`、`workflow_tasks`、`workflow_commands`
- 活动：`activity_executions`、`activity_attempts`
- 功能：`workflow_updates`、`workflow_signal_records`、`workflow_run_waits`、`workflow_run_timeline_entries`、`workflow_run_lineage_entries`、`workflow_schedules`、`workflow_schedule_history_events`
- 可观测性：`workflow_run_summaries`、`workflow_failures`、`workflow_links`、`worker_compatibility_heartbeats`
- 定时器：`workflow_run_timers`、`workflow_run_timer_entries`
- 搜索 / memo / 消息 / 子工作流：`workflow_search_attributes`、`workflow_memos`、`workflow_messages`、`workflow_child_calls`
- 服务目录：`workflow_service_endpoints`、`workflow_services`、`workflow_service_operations`、`workflow_service_calls`

未来压缩迁移可能将其合并到更少文件中，而不改变持久契约。确认数据库实际状态的受支持方式，是升级后运行 `php artisan migrate:status`。

默认 v1 表（`workflows`、`workflow_logs`、`workflow_signals`、`workflow_timers`、`workflow_exceptions` 和 `workflow_relationships`）会保留，以便在 v1 上完成执行。若配置的 v1 模型覆盖了表或存储连接，则以这些配置表作为 v1 事实来源。

**3. 更新配置（如有需要）**

v2 配置向后兼容。如果 v1 中发布了 `config/workflow.php`，它仍可使用。新 v2 选项包括：

- `durable_types`：用于语言无关工作流引用的类型别名
- `task_repair_policy`：如何处理卡住的任务
- `backend_capability_check`：严格或宽松验证
- `projection_rebuild`：从历史重建的策略
- `history_budget`：continue-as-new 的事件数量限制

这些选项有合理默认值，仅在需要非默认行为时配置。详情参见[配置](/docs/configuration/options/)。

**负载编解码器默认值改为 `avro`。** v1 默认使用仅 PHP 可用的 `Workflow\Serializers\Y::class`；v2 默认使用语言中立的 `avro`，让 Python、Go 和 TypeScript Worker 无需共享 PHP 运行时即可解码负载。新 v2 工作流唯一受支持的编解码器是 `avro`。新启动的 v2 工作流将标记为 `payload_codec = "avro"`。

如果从 v1 发布的 `config/workflows.php` 中有 `'serializer' => Workflow\Serializers\Y::class`，v2 仍读取该值，让迁移诊断能够指出它，但新 v2 工作流负载仍解析为 Avro。升级后运行 `php artisan workflow:v2:doctor`，它会将旧编解码器设置标记为 v1 排空/导入相关问题。

要明确接受 v2 默认值，可不设置 `serializer`，或将其固定为：

```php
// config/workflows.php — v2 default (language-neutral, compact binary)
'serializer' => 'avro',
```

只有需要继续排空在 Server 与仅 PHP Worker 之间共享 PHP 原生值的 v1 运行实例时，才保留旧编解码器（`'workflow-serializer-y'` 或 `'workflow-serializer-base64'`）。旧类名（`Workflow\Serializers\Y::class` 等）仍作为解码 v1 运行实例的别名接受。

**v2 不支持 v1 自定义序列化器类。** 公开 v2 注册表仅解析 `avro`。旧版 `workflow-serializer-y` 和 `workflow-serializer-base64` 读取器限制在内部 v1 导入/排空路径，不能用于新 v2 运行实例或 SDK 负载。如果曾使用自定义序列化器，应在升级前排空 v1 运行实例，或将历史负载重新编码为 `avro`；不会调用自定义类。`php artisan workflow:v2:doctor` 将其他任何 `workflows.serializer` 值标记为迁移债务；新运行实例省略编解码器时解析为 `avro`。

**自定义模型子类只有保持软件包列和键契约时才受支持。** [定制矩阵](/docs/configuration/customization-matrix/)中冻结的支持矩阵是权威来源：v2 实例、运行、任务、历史事件、投影、计划、活动、失败、链接、消息、memo、搜索属性和子调用模型可派生子类，前提是保留软件包表名、主键和外键。自定义表名配合自定义外键列名超出契约。Waterline 通过 `Workflow\V2\Contracts\OperatorObservabilityRepository` 契约读取 v2 投影，因此 schema 兼容的子类无需修改 Waterline。

**环境变量：**

v2 不引入新的必需环境变量。现有 `QUEUE_CONNECTION`、`CACHE_DRIVER` 和 `DB_CONNECTION` 继续有效。

**4. 重启队列 Worker**

必须重启队列 Worker 以加载 v2 代码：

```bash
# If using Laravel queue workers
php artisan queue:restart

# If using Supervisor
sudo supervisorctl restart <your-worker-group>:*

# If using systemd
sudo systemctl restart laravel-worker

# If using Horizon
php artisan horizon:terminate
```

Worker 将：

1. 完成当前 job
2. 正常退出
3. 重新启动并加载 v2 代码

**处理 v2 工作流前必须重启 Worker。** v1 工作流可由旧或新 Worker 完成（在 v1 上完成的兼容性）。

### 升级之后 {#after-upgrading}

**1. 验证后端能力**

```bash
php artisan workflow:v2:doctor --strict
```

预期输出：

```
✓ Database driver supports required features
✓ Queue driver supports required features
✓ Cache driver supports locks
✓ All backend capabilities present
```

任何检查失败时，参见[后端要求](/docs/installation/#requirements)了解驱动前提条件。

**2. 验证 v2 工作流成功启动**

使用 v2 API 启动测试工作流：

```php
use Workflow\V2\WorkflowStub;
use Workflow\V2\StartOptions;

$workflow = WorkflowStub::make(TestWorkflow::class, 'test-upgrade');
$result = $workflow->start(['test' => true], new StartOptions());
$runId = $result->runId();
```

`WorkflowStub::start()` 返回 `StartResult` 对象。与数据库行比较前，先用 `runId()` 取出运行 ID；把返回值当作标量字符串，会悄悄将对象与列比较。

检查：

- 工作流出现在 Waterline 中
- `workflow_instances` 表有匹配 `instance_id`（`$workflow->id()`）的行
- `workflow_runs` 表有匹配 `run_id`（`$result->runId()`）的行
- 工作流按预期完成或推进

**3. 检查 v1 工作流（若有）**

如果有进行中的 v1 工作流：

```bash
php artisan workflow:v1:list
```

验证它们继续推进。v1 工作流应在 v1 引擎上完成且不出错。

**4. 监控日志错误**

查看应用日志中与工作流有关的错误：

```bash
tail -f storage/logs/laravel.log | grep -i workflow
```

常见问题：

- 命名空间错误：代码仍使用 `Workflow\Workflow`，而非 `Workflow\V2\Workflow`
- 方法错误：v2 工作流或活动类仍需将入口方法重命名为 `handle()`
- 队列驱动错误：在 queue 模式下使用 `sync`（不受支持）；poll 模式（`workflows.v2.task_dispatch_mode=poll`）不使用队列投递任务，因此可以使用 `sync`

**5. 验证 Waterline 可观测性**

打开 Waterline（默认 `/waterline`），验证：

- v1 工作流（若有）显示原始数据
- v2 工作流显示完整运行/历史/活动详情
- Waterline 渲染无错误

### 回滚流程 {#rollback-procedure}

回滚是恢复集操作。当 v1 的 Laravel 队列状态位于 Redis、SQS、其他数据库或外部后端时，仅恢复工作流 SQL 数据库无法恢复进行中的执行。

如果生产升级失败，仅回滚到升级前选择的策略和恢复切点：

**1. 使应用入口、调度器和队列 Worker 静止**

使用升级前恢复切点的同一停止流程。确认恢复状态期间，没有 Worker 能保留 job，也没有请求能启动工作流或发送信号。

**2. 验证恢复集**

- 仅 SQL 恢复集只在所选切点不存在依赖保留队列工作的非终态 v1 执行时受支持。符合条件的过期 `pending` 行可改用上文已证明有效的 v1.0.77 Watchdog 路径，真正的纯信号等待可使用已测试的外部信号入口。不得将这两种例外扩展到其他状态。
- 进行中恢复集必须包含同一切点的 SQL 和可恢复的就绪、延迟、已保留队列状态，用于重试、定时器、活动及 `waiting` 或 `running` 工作。纯信号等待必须保留可用信号入口；定时器等待必须保留延迟队列 job。
- 若两项条件均不满足，到此停止。向前修复、手动核对记录的工作流，或按事先记录的接受受影响执行不可恢复的决定继续。

**3. 恢复数据库备份**

```bash
# MySQL/MariaDB
mysql -u root -p your_database < backup-v1-YYYYMMDD-HHMMSS.sql

# PostgreSQL
psql -U postgres -d your_database < backup-v1-YYYYMMDD-HHMMSS.sql
```

恢复全部配置的自定义 v1 模型表和 `workflow_relationships_table`，即使它们位于另一连接。

**4. 必要时恢复队列恢复切点**

保持使用方停止。遵循队列提供商恢复流程，恢复与 SQL 一起捕获的确切连接、队列、前缀、就绪 job、延迟 job 和已保留 job。若必需唯一 job 锁状态属于恢复切点，也恢复它。不要用同名空队列替代：它不能唤醒恢复后的重试、定时器或 `waiting`/`running` 工作。只有证明 v1.0.77 Watchdog 能启动并重新分发后，空但可写的队列才足以处理符合条件的 `pending` 行。

**5. 回退 Composer 依赖**

```bash
composer require durable-workflow/workflow:^1.0 --with-all-dependencies
```

受支持的 v1 和 v2 都使用维护中的软件包名 `durable-workflow/workflow`。`laravel-workflow/laravel-workflow` 仅是维护中软件包声明的旧别名，用于兼容旧依赖图；回滚依赖要求不要使用它。

使用单独控制的恢复凭据，通过盘点的密钥管理器引用和版本取回确切 `APP_KEY`。启动使用方前，将它与工作流存储连接、队列连接、队列名称、Redis 前缀和自定义模型配置一起恢复。加密 job 和序列化模型引用依赖于这些配置与恢复切点匹配。

**6. 重启队列 Worker，重新开放入口**

```bash
# Use the start command for your worker system, for example:
sudo supervisorctl start <your-worker-group>:*
sudo systemctl start laravel-worker
php artisan horizon:continue
```

**7. 验证 v1 执行可被唤醒**

Waterline 可见性证明行已恢复，但不能证明 Worker 能恢复执行。宣布回滚成功前完成以下清单：

- [ ] `composer show durable-workflow/workflow` 报告预期 v1 发布，且 Worker 已加载该代码。
- [ ] 实际配置的 v1 表和 `workflow_relationships_table` 位于预期存储连接。
- [ ] 配置的 stored-workflow 表（默认 `workflows`）中每条非终态行都按下一个唤醒路径分类：就绪/延迟/已保留队列 job、保留的定时器 job，或已测试的外部信号入口。符合条件的 `pending` 行可改为引用下述已证明的 v1.0.77 Watchdog 重新分发证据。
- [ ] 队列提供商检查确认上述每个队列承载的重试、定时器、活动及 `waiting` 或 `running` 工作流唤醒任务都存在于记录的连接和队列上。仅 SQL 定时器行不满足检查，Watchdog 也不能替代这些 job。
- [ ] 若恢复的 `pending` 行无保留的工作流 job，观察到 v1.0.77 Worker 循环将 Watchdog 入队；行超过五分钟过期边界后，Watchdog 将该工作流入队到记录的连接和队列，且行继续推进。没有端到端证明，即使 Waterline 显示该行，也应视为搁浅。
- [ ] 没有恢复的重试、定时器、`waiting` 或 `running` 行缺少所需可运行队列 job，或缺少真正信号等待所需的可用外部信号路径。此类行应视为搁浅；仅 pending 的 Watchdog 证据不能使其可恢复。
- [ ] 恢复的重试或定时器越过恢复切点前标记，受控信号等待能将信号唤醒入队并消费。
- [ ] 新 v1 金丝雀工作流完成，日志无缺失 job、解密、模型表、连接或队列路由错误。

使用默认表时，以下查询可作为初始清单；自定义时替换为配置的 stored-workflow 模型解析的表：

```sql
SELECT id, class, status
FROM workflows
WHERE status NOT IN ('completed', 'failed', 'cancelled');
```

**回滚注意事项：**

- 回滚会丢弃升级后启动的全部 v2 工作流（它们只存在于 v2 表）
- 仅 SQL 回滚恢复 v1 工作流记录，不恢复外部队列消息
- 只有从同一个应用一致恢复切点恢复 SQL 和持久队列状态，或文档记录的纯信号等待保留可用入口时，才支持进行中的 v1 执行。额外的仅 SQL 例外是具有已证明 v1.0.77 Watchdog 重新分发路径的符合条件过期 `pending` 行；它不涵盖重试、定时器或 `waiting`/`running` 工作
- 重放升级前恢复切点可能重复外部副作用；恢复排队活动工作前，审查应用幂等性
- 若必须保留升级窗口内启动的 v2 工作流，不要恢复数据库，应向前修复升级问题

## 代码变化 {#code-changes}

以下各节详细说明从 v1 API 迁移至 v2 API 所需的代码变更。

### 命名空间变化 {#namespace-change}

所有 v2 类都位于 `Workflow\V2` 下。更新导入：

```php
// v1
use Workflow\Workflow;
use Workflow\Activity;
use Workflow\WorkflowStub;

// v2
use Workflow\V2\Workflow;
use Workflow\V2\Activity;
use Workflow\V2\WorkflowStub;
```

### 入口方法 {#entry-method}

v2 工作流和活动使用 `handle()` 作为入口方法。v2 代码迁移时将 v1 `execute()` 方法重命名为 `handle()`：

```php
// v1
class MyWorkflow extends Workflow
{
    public function execute($input)
    {
        $result = yield ActivityStub::make(MyActivity::class, $input);
        return $result;
    }
}

// v2
use function Workflow\V2\activity;

class MyWorkflow extends Workflow
{
    public function handle($input)
    {
        return activity(MyActivity::class, $input);
    }
}
```

不要在 v2 工作流或活动上保留 `execute()` 入口，运行时会拒绝它。

### 活动调用 {#activity-calls}

v2 用直接函数辅助方法替代 `ActivityStub::make()` 和 `yield`：

```php
// v1
$result = yield ActivityStub::make(MyActivity::class, $arg1, $arg2);

// v2
use function Workflow\V2\activity;

$result = activity(MyActivity::class, $arg1, $arg2);
```

活动现在具有持久身份。每个已调度活动都有带稳定执行 ID 的 `activity_executions` 行，每次具体尝试都有带类型化历史的 `activity_attempts` 行。

### 工作流身份 {#workflow-identity}

v2 将身份拆分为实例 ID 和运行 ID：

- `id()`：公开工作流实例 ID（跨 continue-as-new 保持相同）
- `runId()`：当前运行实例的 ID

v1 中两者是同一个概念。

### 信号 {#signals}

v2 使用命名信号等待，替代基于 `#[SignalMethod]` 属性标记的修改方法：

```php
// v1
#[SignalMethod]
public function approve()
{
    $this->approved = true;
}

// v2
use function Workflow\V2\await;

$approved = await('approve');
```

命名信号支持 `await('name')` 进行阻塞式工作流代码等待，支持 `signal()` / `attemptSignal()` 接收外部输入。取消和终止不建模为信号，仍是明确的运行时命令。

### 查询 {#queries}

v2 使用重放安全的查询方法，替代直接读取工作流属性：

```php
// v1
#[QueryMethod]
public function getStatus(): string
{
    return $this->status;
}

// v2
use function Workflow\V2\query;

// Queries are defined as named, replay-safe accessors
```

### 定时器与副作用 {#timers-and-side-effects}

基于函数的辅助方法替代 v1 静态方法：

```php
// v1
yield Timer::make(60);
$value = yield SideEffect::make(fn() => random_int(1, 100));

// v2
use function Workflow\V2\timer;
use function Workflow\V2\sideEffect;

timer(60);
$value = sideEffect(fn() => random_int(1, 100));
```

### 超时 {#timeouts}

v2 通过 `StartOptions` 添加工作流级超时：

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

- **执行超时**跨越整个实例，包括 continue-as-new 转换。
- **运行超时**适用于单次运行，并在 continue-as-new 时重置。

### 数据库迁移 {#database-migrations}

v2 添加新表和列。软件包自动加载迁移，因此更新后运行：

```bash
composer update durable-workflow/workflow
php artisan migrate
```

2.0.0 发布包含干净的基础表迁移。常规路径是让 Laravel 自动加载软件包迁移并运行 `php artisan migrate`。

如果以前将 Durable Workflow 迁移发布到应用中，应选择一个迁移来源并保持其最新：

- **自动加载的软件包迁移**：从 `database/migrations` 删除旧的已发布 Durable Workflow 迁移文件，再运行 `php artisan migrate`。
- **已发布迁移**：迁移前发布当前集合：

  ```bash
  php artisan vendor:publish \
    --provider="Workflow\Providers\WorkflowServiceProvider" \
    --tag=migrations \
    --force

  php artisan migrate
  ```

不要一边保留过期已发布文件，一边依赖新自动加载的软件包文件；这可能使应用缺少较新的 v2 表或修复迁移。

若定制了迁移文件，每次升级时将本地副本与软件包 `src/migrations` 目录比较。保持表名、列、索引以及 nullable/default 契约与软件包模型的 schema 兼容。若定制安装将工作流表路由到非默认连接，应发布迁移、设置迁移 `$connection`，并按时间戳顺序持续纳入每项新软件包迁移。

对于 v2 预发布使用者，如果较早发布的摘要表迁移创建 `workflow_run_summaries` 时缺少 `memo` 列，会幂等修复 `workflow_run_summaries.memo`。全新安装已在基础摘要表迁移中创建此列。

### 后端能力检查 {#backend-capability-check}

v2 验证队列、数据库和缓存驱动满足要求。升级后运行 doctor 命令：

```bash
php artisan workflow:v2:doctor --strict
```

### 配置 {#configuration}

v2 引入多项新配置选项。以下内容详见[配置](/docs/configuration/options/)：

- 持久类型别名
- 任务修复策略
- 后端能力检查
- 投影重建
- 历史预算和导出脱敏

### Waterline {#waterline}

Waterline（监控 UI）已更新支持 v2，包含：

- 显示超时时长和截止时间的运行详情视图
- 带持久 ID 的活动尝试跟踪
- 更新后的工作流状态显示

### Continue-as-new {#continue-as-new}

v2 添加历史预算，可在事件数量超过阈值时自动触发 continue-as-new。元数据（memo、搜索属性、超时）会跨转换继承。

## 现有工作流 {#existing-workflows}

### 在 v1 上完成的策略 {#finish-on-v1-strategy}

**在 v1 下启动的工作流会继续通过 v1 兼容路径执行。** 升级后新启动的工作流使用 v2 语义。无需迁移正在运行的工作流实例。

升级至 2.0 时：

1. **v1 数据保留**：默认 `workflows`、`workflow_logs`、`workflow_signals`、`workflow_timers`、`workflow_exceptions` 和 `workflow_relationships` 表保持完整；配置的 v1 模型/表覆盖仍是权威来源
2. **v1 工作流用 v1 引擎完成**：进行中的 v1 工作流继续使用 v1 重放引擎执行，直到终态
3. **v2 工作流用 v2 引擎**：升级后启动的全部工作流使用 v2 schema（`workflow_instances`、`workflow_runs`、`workflow_history_events` 等）
4. **Waterline 同时显示两者**：监控 UI 并列显示 v1 和 v2 工作流

在 v1 上完成也依赖 Laravel 队列后端。保留每个 v1 队列连接和队列，直到其工作流全部终结。数据库行保留历史和状态，但不能从外部后端重建丢失的就绪、延迟或已保留 job。v1.0.77 Watchdog 可从 SQL 重新分发符合条件的过期 `pending` 工作流，但该有界恢复路径不能重建重试、定时器或 `waiting`/`running` 工作。

### 跟踪 v1 工作流完成情况 {#tracking-v1-workflow-completion}

查看升级后哪些 v1 工作流仍活跃：

```bash
php artisan workflow:v1:list
```

此命令列出全部尚未达到终态（已完成、失败、已取消）的 v1 工作流。用它持续跟踪 v1 工作流完成情况。

示例输出：

```
+--------------------------------------+---------------------+-----------+------------+
| ID                                   | Class               | Status    | Created    |
+--------------------------------------+---------------------+-----------+------------+
| 01J1234567890ABCDEFGHIJK             | App\OrderWorkflow   | running   | 2 days ago |
| 01J9876543210ZYXWVUTSRQP             | App\InvoiceWorkflow | pending   | 1 day ago  |
+--------------------------------------+---------------------+-----------+------------+
```

#### Waterline 可见性 {#waterline-visibility}

升级至 2.0 后，Waterline 自动显示两个引擎的工作流：

- **v1 工作流**显示原始 `StoredWorkflow` 数据（类、状态、日志、信号、异常）
- **v2 工作流**显示完整 v2 详情（运行实例、历史事件、定时器、活动、搜索属性）

无需配置，Waterline 读取两组表并呈现统一视图。

### 何时清理 v1 表 {#when-to-clean-up-v1-tables}

所有 v1 工作流完成后（`workflow:v1:list` 显示零活跃工作流），可选择删除 v1 表：

```sql
DROP TABLE IF EXISTS workflow_relationships;
DROP TABLE IF EXISTS workflow_exceptions;
DROP TABLE IF EXISTS workflow_timers;
DROP TABLE IF EXISTS workflow_signals;
DROP TABLE IF EXISTS workflow_logs;
DROP TABLE IF EXISTS workflows;
```

**重要：** 仍有任何活跃 v1 工作流时，不要删除这些表，否则 v1 重放将失败并使工作流卡住。

### 为什么在 v1 上完成？ {#why-finish-on-v1}

此策略避免在升级时强制数据迁移。v1 与 v2 的存储模型根本不同：

- **v1** 将工作流状态存为非规范化 `workflows` 行，附带相关日志、信号和定时器
- **v2** 将工作流状态存为事件溯源历史及投影（`workflow_instances`、`workflow_runs`、`workflow_history_events`）

将进行中的 v1 工作流转换为 v2 历史，需要从 v1 日志重建事件序列，有数据丢失和重放不一致风险。在 v1 上完成的方式让 v1 工作流在原引擎上安全完成，而新工作立即转向 v2。

