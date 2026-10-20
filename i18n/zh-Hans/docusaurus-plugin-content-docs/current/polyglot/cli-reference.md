---
sidebar_position: 4
title: CLI 命令参考
description: Durable Workflow CLI 命令、稳定输出模式、常用选项和失败行为参考。
tags:
  - CLI
  - reference
  - control-plane
  - automation
keywords:
  - dw 命令参考
  - CLI 输出
  - 桥接 webhook
  - 工作流命令
---

# CLI 命令参考 {#cli-command-reference}

本页将 v2 `dw` 命令接口记录为运维与自动化契约。安装和配置档设置见 [CLI 指南](/docs/polyglot/cli)；将脚本、CI 任务、操作手册或 AI Agent 接入精确命令形式时，请使用本页。

所有依赖 Server 的命令都面向独立 Server 控制平面协议版本 `2`。CLI 在信任规范请求和响应字段前，会验证 Server 公布的协议清单。

## 全局选项 {#global-options}

除非另有说明，依赖 Server 的命令接受以下选项。

| 选项 | 含义 |
| --- | --- |
| `--server`, `-s` | Server 基础 URL。本次调用覆盖配置档和环境变量。 |
| `--namespace` | 目标命名空间。覆盖配置档命名空间。 |
| `--token` | 本次调用的 bearer 令牌。存储的自动化配置优先使用带 `--token-env` 的配置档。 |
| `--env` | 具名 CLI 环境配置档。未知配置档名称会失败，不会回退。 |
| `--output=table\|json\|jsonl` | 输出契约。`table` 供人阅读，`json` 为一个 JSON 文档，列表命令的 `jsonl` 为每行一个 JSON 对象。 |
| `--json` | 在提供此选项的命令中，是命令本地的 JSON 输出别名。 |

接受调用方负载的命令使用共享的输入契约：

| 选项 | 含义 |
| --- | --- |
| `--input`, `-i` | 内联输入文档。 |
| `--input-file` | 从文件读取输入，或用 `-` 读取标准输入。与 `--input` 互斥。 |
| `--input-encoding=json\|raw\|base64` | 将输入解码为 JSON、将原始文本作为一个参数传入，或将 base64 解码为一个参数。默认 `json`。 |

工作流启动、信号、查询、更新、计划及活动完成的 JSON 输入表示 v2 位置参数数组。raw 和 base64 输入转为一个位置参数，使 Server 仍收到规范的 `input` 数组。

## 连接与诊断 {#connection-and-diagnostics}

| 命令 | 用途 | 重要选项 |
| --- | --- | --- |
| `dw --version` | 输出 CLI 构建标识。`DW_ENV` 或 `DURABLE_WORKFLOW_SERVER_URL` 选择了目标时，也执行短时兼容性探测。 | `-V`, `--version` |
| `dw server:health` | 检查 Server 健康及认证可达性。 | 全局选项, `--json` |
| `dw server:info` | 展示 Server 版本、角色拓扑清单、协议清单、请求契约、Worker 协议、Worker 集群信息及兼容性元数据。 | 全局选项, `--json` |
| `dw doctor` | 解释解析后的配置档/Server/令牌/TLS 状态、远程兼容性警告及后续步骤。 | 全局选项, `--json` |
| `dw debug workflow <workflow-id>` | 采集一个工作流卡住运行的诊断：状态、待处理任务、队列信息、失败及兼容性元数据。 | `--run-id`, 全局选项, `--json` |
| `dw server:start-dev` | 为已配置的现有 Laravel 项目提供 HTTP 应用服务。要求外部 PHP。 | `--port`, `--host` （默认 `127.0.0.1`）, `--db=sqlite\|mysql\|pgsql` |
| `dw watch workflow <workflow-id>` | 轮询工作流，直到终态或达到配置的轮询限制。 | `--run-id`, `--interval`, `--max-polls`, 全局选项 |
| `dw upgrade` | 用更新或固定发布替换当前独立 `dw` 二进制文件。拒绝重写 Composer vendor、Homebrew cellar 和 PHAR 安装。 | `--tag`, `--dry-run`, `--force`, `--output=table\|json` |

验证契约结构时使用 `server:info`，分析 CLI 无法连接 Server 的原因时使用 `doctor`，支持团队需要单次运行的机器可读采集时使用 `debug workflow`。

### 本地项目 HTTP 服务 {#local-project-http-server}

在已安装 Laravel 项目中包含 `artisan` 的目录运行 `dw server:start-dev`。原生 CLI 执行此命令要求 `PATH` 中有独立的 PHP 可执行文件。先配置数据库并运行迁移。选定的 `--db` 值作为 `DB_CONNECTION` 传入，因此更换驱动时需清除 Laravel 缓存配置。按需单独运行队列 Worker 和调度器。编辑 `.env` 后重启命令。选定驱动通过 Artisan 的 `--no-reload` 模式持续应用于 HTTP 请求。

命令默认绑定回环地址。显式使用 `--host=0.0.0.0` 才绑定所有接口。MySQL 和 PostgreSQL 模式分别要求项目 Compose 服务名为 `mysql` 或 `pgsql`，并且有 `redis`。依赖或 HTTP 进程失败返回非零值。HTTP 进程结束后，Compose 服务继续运行。

POSIX 原生二进制文件将 SIGINT 和 SIGTERM 转发给活动子进程，并最多等待五秒让其进程组停止。源码和 PHAR 安装要求 PHP 的 `pcntl` 和 `posix` 扩展才能转发。Windows 使用自身的控制台中断行为。

使用已发布镜像运行独立 Durable Workflow Server 时，请按[服务快速入门](/docs/quickstart)操作。

### Server 信息与角色拓扑 {#server-info-and-role-topology}

`dw server:info` 是 `GET /api/cluster/info` 的 CLI 接口。表格模式包含 `Topology:` 部分，汇总 Server 为响应节点公布的角色拓扑契约：

- `Supported Shapes` 和 `Current Shape` 指出哪些部署形态合法，以及节点当前使用哪种形态。
- `Current Process Class` 和 `Current Roles` 指出响应节点的进程类别和角色组合。
- `Matching Role`、`Matching Partitions` 和 `Matching Backpressure` 提供决定如何认领就绪工作的匹配角色形态、唤醒归属、任务派发模式及分区原语。
- `Matching Discovery Limits` 汇总固定的匹配角色数值契约：`poll_batch_cap`、`availability_ceiling_seconds`、`wake_signal_ttl_seconds`、`workflow_task_lease_seconds` 和 `activity_task_lease_seconds`，使运维人员无需搜索包源码就能验证部署符合文档契约。
- `Current Write Boundaries` 列出此节点角色当前拥有的持久写入接口。
- `Scaling Boundaries` 和 `Failure Domains` 告诉运维人员每个角色预期的负载驱动因素或首个故障信号。

脚本需要原始清单时使用 `--output=json`。`topology.schema` 和 `topology.version` 固定清单契约修订版，让脚本检测形态偏移；`topology.execution_mode` 报告响应节点提供的派发模式。稳定机器字段位于 `topology` 下，包括 `supported_shapes`、`current_shape`、`current_process_class`、`current_roles`、`matching_role`、`role_catalog`、`authority_boundaries`、`authority_surfaces`、`supported_topologies`、`scaling_boundaries` 和 `failure_domains`。`topology.matching_role` 块还公布 `partition_primitives` 和 `backpressure_model`，使脚本无需解析自然语言就能检查节点发现就绪任务使用的路由维度。`topology.matching_role.discovery_limits` 提供固定的匹配角色数值契约：`poll_batch_cap`、`availability_ceiling_seconds`、`wake_signal_ttl_seconds`、`workflow_task_lease_seconds` 和 `activity_task_lease_seconds`，使脚本无需抓取供人阅读的部分就能固定工作流包的匹配角色数值。

```bash
dw server:info --output=json \
  | jq '.topology | {current_shape, current_process_class, current_roles, matching_role, scaling_boundaries, failure_domains}'
```

这些字段的含义见 [Server 角色拓扑](/docs/polyglot/server-role-topology)。

### Server 信息与协调健康 {#server-info-and-coordination-health}

`dw server:info` 还公布 Server 跨所有命名空间的发布安全结论，使运维人员无需建立独立健康接口即可读取协调健康。表格模式中，CLI 在 `Topology:` 下展示 `Coordination Health:`。`--output=json` 中，相同数据位于 `coordination_health` 下，包含以下稳定机器字段：

- `coordination_health.schema` 和 `coordination_health.version` 固定清单契约修订版。
- `coordination_health.namespace_scope` 报告结论覆盖单个命名空间还是整个集群。
- `coordination_health.status` 和 `coordination_health.http_status` 报告顶层结论，以及 Server 对就绪状态应用的 HTTP 准入检查。
- `coordination_health.generated_at` 记录快照采集时间。
- `coordination_health.categories` 汇总各类别数量（例如 `correctness`、`safety`、`routing`）。
- `coordination_health.warning_checks` 和 `coordination_health.error_checks` 列出使结论变为警告或错误的检查名称，让脚本根据失败接口分支处理。
- `coordination_health.checks[]` 是各检查详情数组，每个条目固定 `name`、`status`、`category` 和 `message`，供自动化解释降级结论。固定检查清单始终包含 `worker_compatibility`、`task_transport`、`routing_health`、`durable_resume_paths`、投影/调度器检查及 `activity_path`。`activity_path` 是活动侧对应于 `task_transport` 的检查：它暴露从调度到启动、从启动到关闭、从调度到关闭或心跳截止时间已过却未被强制执行的活动，以及持续的活动重试积压。重命名 `activity_path` 属于协议级变更。

```bash
dw server:info --output=json \
  | jq '.coordination_health | {status, http_status, namespace_scope, warning_checks, error_checks}'
```

这些字段背后的就绪契约见 [Server API 参考](/docs/polyglot/server-api-reference)。

### 自升级 {#self-upgrade}

`dw upgrade` 从 `durable-workflow/cli` GitHub 发布下载匹配平台的制品，用发布的 `SHA256SUMS` 验证，且仅在校验和匹配时替换正在运行的二进制文件。用 `--tag` 固定到特定发布标签，用 `--dry-run` 解析目标发布并输出制品 URL 而不下载，用 `--force` 在当前版本与目标版本相同时仍重新下载并替换。

命令拒绝重写由其他工具管理的安装。JSON 输出使用稳定的 `status` 字段，使自动化无需解析自然语言即可分支处理：

| `status` | 含义 |
| --- | --- |
| `upgraded` | 二进制文件已替换为 `target_version`。 |
| `noop` | `current_version` 已匹配 `target_version`；`--force` 可绕过。 |
| `dry-run` | `--dry-run` 已解析 `target_version`、`asset_url` 和 `checksum_url`，没有下载。 |
| `refused` | 安装类型不是独立发布二进制文件（Composer vendor、Homebrew cellar 或 PHAR），或平台没有已发布制品。 |
| `permission-denied` | 安装目录不可写；负载包含建议下一步的 `hint`。 |
| `error` | 获取发布目录失败、校验和不匹配，或文件系统错误。 |

拒绝时，JSON 负载的 `installation.kind` 标识管理工具（`composer-vendor`、`homebrew`、`phar` 或 `binary`），`reason` 指出应改用哪个管理方。公开且无需源码的自动化可通过 `https://durable-workflow.com/install.sh` 重新安装固定发布；Homebrew tap 管理的安装使用 `brew upgrade durable-workflow/tap/dw`。

## 环境配置档 {#environment-profiles}

配置档位于 `~/.config/dw/config.json`，设置了 `XDG_CONFIG_HOME` 时则位于 `$XDG_CONFIG_HOME/dw/config.json`。设置 `DW_CONFIG_HOME` 可隔离测试或 CI 配置档目录。

| 命令 | 用途 | 重要选项 |
| --- | --- | --- |
| `dw env:set <name>` | 创建或更新具名配置档。 | `--server`, `--namespace`, `--token-env`, `--token`, `--tls-verify=true\|false`, `--profile-output=table\|json\|jsonl`, `--make-default`, `--json` |
| `dw env:list` | 列出配置档，默认对字面令牌脱敏。 | `--show-token`, `--json`, `--output=jsonl` |
| `dw env:show [name]` | 展示一个配置档，默认当前配置档。 | `--show-token`, `--json` |
| `dw env:use <name>` | 设置默认配置档。未知名称会失败。 | `--json` |
| `dw env:delete <name>` | 删除配置档。 | `--json` |

生产配置档优先使用 `--token-env=NAME`，使密钥留在运行时环境中，而非配置档文件中。

## 工作流命令 {#workflow-commands}

| 命令 | 用途 | 重要选项 |
| --- | --- | --- |
| `dw workflow:start` | 通过控制平面启动工作流。 | `--type`, `--workflow-id`, `--business-key`, `--task-queue`, `--duplicate-policy`, `--memo`, `--search-attr key=value`, `--execution-timeout`, `--run-timeout`, `--wait`, 输入选项, `--json` |
| `dw workflow:list` | 列出工作流实例。 | `--type`, `--status`, `--query`, `--limit`, 全局输出选项 |
| `dw workflow:describe <workflow-id>` | 描述当前或选定运行。 | `--run-id`, `--follow`, `--json` |
| `dw workflow:list-runs <workflow-id>` | 列出工作流实例的运行。 | `--json` |
| `dw workflow:show-run <workflow-id> <run-id>` | 展示单次运行。 | `--follow`, `--json` |
| `dw workflow:history <workflow-id> <run-id>` | 读取运行历史事件。 | `--follow`, `--page-size`, `--json` |
| `dw workflow:history-export <workflow-id> <run-id>` | 导出归档用的运行历史负载。 | `--output-file`, 全局选项 |
| `dw workflow:signal <workflow-id> <signal-name>` | 发送信号。 | `--run-id`, 输入选项, `--json` |
| `dw workflow:query <workflow-id> <query-name>` | 执行只读工作流查询。 | `--run-id`, 输入选项, `--json` |
| `dw workflow:update <workflow-id> <update-name>` | 提交或执行工作流更新。 | `--wait=accepted\|completed`, `--run-id`, 输入选项, `--json` |
| `dw workflow:cancel [workflow-id]` | 将单个工作流或选定批次关闭为已取消；不运行工作流代码清理。 | `--reason`, `--run-id`, `--all-matching`, `--type`, `--status`, `--limit`, `--yes`, `--json` |
| `dw workflow:terminate <workflow-id>` | 强制终止工作流。 | `--reason`, `--run-id`, `--json` |
| `dw workflow:repair <workflow-id>` | 请求 Server 修复卡住或可重试运行。 | `--json` |
| `dw workflow:archive <workflow-id>` | 归档已关闭运行。 | `--reason`, `--json` |

示例：

```bash
dw workflow:start \
  --type=App\\Workflows\\ProcessOrder \
  --workflow-id=order-123 \
  --task-queue=payments \
  --input='["order-123"]' \
  --json

dw workflow:update order-123 approve --wait=completed --input='["manager"]'
dw workflow:cancel --all-matching='WorkflowType = "ImportJob"' --limit=25 --yes
```

`workflow:start`、`workflow:signal`、`workflow:query` 和 `workflow:update` 根据 Server 公布的请求契约验证规范请求字段。非规范的旧别名在请求发送前即被拒绝。

## 服务调用检查 {#service-call-inspection}

用 `dw service-call:describe <endpoint> <service> <operation> <call-id>` 检查端点命名空间中的一个持久 Nexus 调用。例如，`dw service-call:describe billing invoices create call-42 --namespace=shared --json` 返回完整 Server 响应。

响应保留原始调用方和关联目标、调用截止时间、状态、结果、尝试记录、类型化失败及保留的负载引用。成功结果仍是无损 Avro `result_envelope` 值。已接受或已启动的调用仍为待处理，不能当成成功完成结果。

命令只发出一次 GET。它不请求重试、取消或外部对象下载。Server 在提供读取时，可以将调用与关联工作流终态结果进行协调。命名空间授权及端点、服务、操作、调用选择器均适用。

## 桥接适配器命令 {#bridge-adapter-commands}

桥接命令是集成事件的有限入口和交接工具。它们调用 Server 桥接适配器接口，在 JSON 模式返回 `durable-workflow.v2.bridge-adapter-outcome.contract` 结构。它们不执行工作流代码，也不负责工作流状态转换。

| 命令 | 用途 | 重要选项 |
| --- | --- | --- |
| `dw bridge:webhook <adapter>` | 发送一个 webhook 桥接事件，通过控制平面启动、发送信号或更新工作流。 | `--action=start_workflow\|signal_workflow\|update_workflow`, `--idempotency-key`, `--target`, 输入选项, `--correlation`, `--json` |

示例：

```bash
dw bridge:webhook stripe \
  --action=start_workflow \
  --idempotency-key=stripe-event-1001 \
  --target='{"workflow_type":"orders.fulfillment","task_queue":"external-workflows","business_key":"order-1001"}' \
  --input='{"order_id":"order-1001"}' \
  --json

dw bridge:webhook pagerduty \
  --action=signal_workflow \
  --idempotency-key=pd-event-3003 \
  --target='{"workflow_id":"wf-remediation-42","signal_name":"incident_escalated"}' \
  --input='{"severity":"critical"}'
```

使用桥接结果字段，不要仅凭 HTTP 状态推断行为。`outcome`、`reason`、`control_plane_outcome`、`idempotency_key` 及已脱敏的 `target` 摘要，是重复、路由未命中、格式错误负载及已接受交接的自动化契约。

## 计划命令 {#schedule-commands}

| 命令 | 用途 | 重要选项 |
| --- | --- | --- |
| `dw schedule:create` | 创建计划。 | `--schedule-id`, `--workflow-type`, `--cron`, `--interval`, `--task-queue`, `--timezone`, `--execution-timeout`, `--run-timeout`, `--overlap-policy`, `--jitter`, `--max-runs`, `--paused`, `--note`, 输入选项, `--json` |
| `dw schedule:list` | 列出计划。 | 全局输出选项 |
| `dw schedule:describe <schedule-id>` | 描述一个计划。 | `--json` |
| `dw schedule:update <schedule-id>` | 更新计划规范或工作流输入。 | 计划创建选项, 输入选项, `--json` |
| `dw schedule:pause <schedule-id>` | 暂停计划。 | `--note`, `--json` |
| `dw schedule:resume <schedule-id>` | 恢复计划。 | `--note`, `--json` |
| `dw schedule:trigger <schedule-id>` | 立即触发计划。 | `--overlap-policy`, `--json` |
| `dw schedule:backfill <schedule-id>` | 补跑某个时间窗口。 | `--start-time`, `--end-time`, `--overlap-policy`, `--json` |
| `dw schedule:delete <schedule-id>` | 删除计划。 | `--json` |

创建基于时间间隔的计划时，使用 `--cron` 或 `--interval` 之一。部署时注册但暂不启动工作时，使用 `--paused`。

## Worker 与任务队列命令 {#worker-and-task-queue-commands}

| 命令 | 用途 | 重要选项 |
| --- | --- | --- |
| `dw worker:register [worker-id]` | 注册 Worker，并提供容量和兼容性元数据。 | `--task-queue`, `--runtime`, `--sdk-version`, `--build-id`, `--workflow-type`, `--activity-type`, `--max-workflow-tasks`, `--max-activity-tasks`, `--json` |
| `dw worker:list` | 列出 Worker。 | `--task-queue`, `--status`, 全局输出选项 |
| `dw worker:describe <worker-id>` | 描述一个 Worker。 | `--json` |
| `dw worker:deregister <worker-id>` | 注销一个 Worker。 | `--json` |
| `dw task-queue:list` | 列出活动任务队列和准入状态。 | 全局输出选项 |
| `dw task-queue:describe <queue>` | 描述 Worker 容量、租约、派发预算及待处理查询任务容量。 | `--json` |
| `dw task-queue:build-ids <queue>` | 检查一个队列各构建 ID 群组状态及发布状态。 | `--json` |
| `dw task-queue:drain <queue>` | 将构建 ID 群组标记为排空，使其停止认领新任务。 | `--build-id <value>`, `--unversioned`, `--json` |
| `dw task-queue:resume <queue>` | 清除之前的排空，使群组能再次认领新任务。 | `--build-id <value>`, `--unversioned`, `--json` |

任务队列命令是诊断限流、容量和缺少 Worker 的首选运维视图。这些字段背后的 Server 策略见[任务队列准入](/docs/polyglot/task-queue-admission)，完整的无版本到有版本切换、金丝雀、排空和回滚生命周期见 [Worker 构建 ID 发布](/docs/polyglot/worker-build-id-rollout)。

`dw task-queue:drain` 和 `dw task-queue:resume` 都要求用 `--build-id <value>` 定位特定构建群组，或用 `--unversioned` 定位未注册 `build_id` 的 Worker 群组。组合两者会立即返回无效选项错误。两个命令都幂等：重复排空不会移动已记录的 `drained_at` 时间戳，恢复已活动群组则无操作。

## Worker 协议命令 {#worker-protocol-commands}

这些命令是用于诊断、冒烟测试和非 SDK Worker 实验的底层协议工具。普通 PHP 和 Python Worker 应使用其 SDK Worker 循环。

| 命令 | 用途 | 重要选项 |
| --- | --- | --- |
| `dw workflow-task:poll <worker-id>` | 轮询一个工作流任务。 | `--task-queue`, `--build-id`, `--poll-request-id`, `--history-page-size`, `--accept-history-encoding`, `--json` |
| `dw workflow-task:history <task-id> <page-token>` | 获取已租用工作流任务的下一页历史。 | `--lease-owner`, `--attempt`, `--json` |
| `dw workflow-task:complete <task-id> <attempt>` | 使用命令负载完成一个工作流任务。 | `--lease-owner`, `--complete-result`, `--command`, `--json` |
| `dw workflow-task:fail <task-id> <attempt>` | 报告工作流任务执行失败，用于重试或诊断。不同于使用 `fail_workflow` 命令完成任务。 | `--lease-owner`, `--message`, `--type`, `--stack-trace`, `--json` |
| `dw query-task:poll <worker-id>` | 轮询并租用一个路由工作流查询任务。 | `--task-queue`, `--json` |
| `dw query-task:complete <query-task-id> <attempt>` | 使用 JSON 结果及匹配封装完成已租用查询任务。 | `--lease-owner`, `--result`, `--json` |
| `dw query-task:fail <query-task-id> <attempt>` | 使用机器可读原因报告已租用查询任务失败。 | `--lease-owner`, `--message`, `--reason`, `--type`, `--stack-trace`, `--json` |
| `dw activity:complete <task-id> <attempt-id>` | 完成一个已租用活动尝试。 | `--lease-owner`, 输入选项, `--json` |
| `dw activity:fail <task-id> <attempt-id>` | 使一个已租用活动尝试失败。 | `--lease-owner`, `--message`, `--type`, `--non-retryable`, `--json` |

Worker 侧执行失败（例如重放不匹配或反序列化错误）使用 `workflow-task:fail`，目标为 `POST /worker/workflow-tasks/{taskId}/fail`。用让工作流失败的工作流命令完成任务是另一件事，应通过 `workflow-task:complete` 及相应命令负载完成。

`query-task:poll`、`query-task:complete` 和 `query-task:fail` 驱动 `/worker/query-tasks/…` 的路由查询 Worker 接口。普通 Worker 通过 SDK 查询处理器拉取查询任务；CLI 接口用于诊断、CLI/SDK 对等检查和非 SDK Worker 实验。查询任务失败默认使用 `--reason=query_rejected`；请使用 `unknown_query`、`decode_failure` 或运行时专属标识等稳定原因字符串，使调用方区分预期拒绝和运行时错误。

### 工作流任务历史分页 {#workflow-task-history-pages}

`workflow-task:history` 是 Worker 平面历史分页端点的 CLI 诊断封装。仅在 `workflow-task:poll` 返回带 `next_history_page_token` 的已租用工作流任务后使用；普通 Worker 应让 SDK 获取额外历史分页。

<!-- docs-example id="cli.workflow-task-history.command" -->
```bash
dw workflow-task:history workflow-task-01 history-page-2 \
  --lease-owner=python-worker-1 \
  --attempt=2 \
  --json
```

JSON 输出是 Server 原始响应，不重命名字段：

<!-- docs-example id="cli.workflow-task-history.response" -->
```json
{
  "history_events": [
    {"event_id": 2, "event_type": "ActivityScheduled", "payload": {}}
  ],
  "total_history_events": 4,
  "next_history_page_token": "history-page-3"
}
```

自动化应读取 `history_events`、`total_history_events` 和 `next_history_page_token`。Worker 历史端点不使用控制平面运行历史的 `events` 或 `next_page_token` 字段。

## 命名空间与搜索属性命令 {#namespace-and-search-attribute-commands}

| 命令 | 用途 | 重要选项 |
| --- | --- | --- |
| `dw namespace:list` | 列出命名空间。 | 全局输出选项 |
| `dw namespace:create <name>` | 创建命名空间。 | `--description`, `--retention`, `--json` |
| `dw namespace:describe <name>` | 描述一个命名空间。 | `--json` |
| `dw namespace:update <name>` | 更新命名空间元数据。 | `--description`, `--retention`, `--json` |
| `dw namespace:set-storage-driver <name> <driver>` | 配置编码负载超过外移阈值时使用的命名空间外部负载存储策略。 | `--threshold-bytes`, `--uri`, `--disk`, `--bucket`, `--prefix`, `--region`, `--endpoint`, `--auth-profile`, `--disable`, `--json` |
| `dw storage:test` | 通过选定命名空间存储策略或驱动覆盖值，往返测试小型内联负载及大型外移负载。 | `--driver=local\|s3\|gcs\|azure`, `--small-bytes`, `--large-bytes`, 全局选项, `--json` |
| `dw search-attribute:list` | 列出搜索属性。 | 全局输出选项 |
| `dw search-attribute:create <name> <type>` | 注册搜索属性。 | `--json` |
| `dw search-attribute:delete <name>` | 删除搜索属性。 | `--json` |

搜索属性类型为兼容 Server 的值，例如 `keyword`、`text`、`int`、`double`、`bool`、`datetime` 和 `keyword_list`。

外部负载存储命令调用 Server 命名空间存储 API。驱动参数为 `local`、`s3`、`gcs` 或 `azure` 之一；对象存储驱动使用 Server 端文件系统配置，因此 CLI 标志描述命名空间策略，不携带提供商凭据。用 `--disk` 将 `s3`、`gcs` 或 `azure` 驱动绑定到持有实际提供商凭据的具名 Server 端文件系统磁盘。用 `--disable` 保留策略记录，同时阻止新的外移。

示例：

```bash
dw namespace:set-storage-driver billing s3 \
  --disk=external-payload-objects \
  --bucket=dw-payloads \
  --prefix=billing/ \
  --threshold-bytes=2097152 \
  --json

dw namespace:set-storage-driver dev local \
  --uri=file:///var/lib/durable-workflow/payloads

dw storage:test --namespace=billing --large-bytes=2097152 --json
dw storage:test --driver=s3 --small-bytes=128 --large-bytes=3145728 --json
```

JSON 模式中，`namespace:set-storage-driver` 返回带 `external_payload_storage` 策略的命名空间负载。`storage:test` 返回诊断状态及 `small_payload` 和 `large_payload` 结果对象；自动化应根据这些字段分支，不解析供人阅读的表格。

此诊断也是最快的引用封装契约运维检查。大负载结果通过，证明选定策略能写入编码字节、返回 `durable-workflow.v2.external-payload-reference.v1` 引用、读回对象，并验证 `size_bytes` 和 `sha256`。允许工作流通过此命名空间外移负载前，应先将失败诊断视为存储策略问题处理。

## 系统命令 {#system-commands}

系统命令将 Server 维护轮次暴露为显式、可脚本化操作。

| 命令 | 用途 | 重要选项 |
| --- | --- | --- |
| `dw system:repair-status` | 展示工作流修复积压/状态。 | `--json` |
| `dw system:repair-pass` | 运行一次修复轮次。 | `--run-id`, `--limit`, `--json` |
| `dw system:activity-timeout-status` | 展示活动超时积压/状态。 | `--json` |
| `dw system:activity-timeout-pass` | 运行一次活动超时轮次。 | `--task-id`, `--limit`, `--json` |
| `dw system:retention-status` | 展示保留期积压/状态。 | `--json` |
| `dw system:retention-pass` | 运行一次保留期清理轮次。 | `--run-id`, `--limit`, `--json` |

操作手册应先用状态命令，再用执行轮次命令，让运维人员在变更 Server 状态前看到待处理范围。

## 模式命令 {#schema-commands}

| 命令 | 用途 | 重要选项 |
| --- | --- | --- |
| `dw schema:list` | 列出已发布的机器可读模式。 | 无需 Server 连接 |
| `dw schema:show <command-name>` | 展示一个命令输出随包附带的 JSON Schema。 | `--output=json\|jsonl`; 无需 Server 连接 |
| `dw schema:manifest` | 展示模式清单。 | 无需 Server 连接 |

AI 客户端或 CI 任务需要当前控制平面、响应或输出契约且不想抓取自然语言文档时，可使用模式命令。[当前 v4 清单](https://durable-workflow.github.io/cli-json-envelopes/v4/manifest.json) 通过公开解析器和摘要绑定每个 JSON 封装及记录级 JSONL 模式。其工作流启动/运行和查询/更新负载字段仅接受 `avro` 编解码器。保留的 [v3 清单](https://durable-workflow.github.io/cli-json-envelopes/v3/manifest.json) 和 [v2 清单](https://durable-workflow.github.io/cli-json-envelopes/v2/manifest.json) 仍以原始字节提供给固定修订版的消费者。

## 输出与退出契约 {#output-and-exit-contract}

命令返回单个对象时使用 `--output=json`，列表命令为流处理器提供输入时使用 `--output=jsonl`。供人阅读的表格可以随时间改进；JSON 字段名是自动化契约。

所有命令使用 [CLI 指南](/docs/polyglot/cli#exit-codes)中记录的稳定退出码策略：

| 代码 | 含义 |
| --- | --- |
| `0` | 成功。 |
| `1` | 命令已运行，但发生一般失败。 |
| `2` | 本地用法无效或验证错误。 |
| `3` | 网络或传输失败。 |
| `4` | 认证或授权失败。 |
| `5` | 资源不存在。 |
| `6` | Server 端 `5xx` 失败。 |
| `7` | 超时。 |

支持资料包应收集 `dw doctor --output=json`、`dw server:info --output=json` 和 `dw debug workflow <workflow-id> --output=json`。

## 相关指南 {#related-guides}

- [CLI](./cli.mdx) 介绍安装、配置档设置及退出码行为。
- [Server](./server.md) 记录依赖 Server 的命令调用的 HTTP 控制平面。
- [客户端与 Worker 能力](./cli-python-parity.md) 比较 CLI、PHP、Python 和 Rust 的客户端与 Worker 接口。
