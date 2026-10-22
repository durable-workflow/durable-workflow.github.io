---
sidebar_position: 3
title: Server 配置参考
description: Durable Workflow Server 环境变量、默认值、旧版别名及运行基础设施设置参考。
tags:
  - server
  - config
  - reference
  - operations
keywords:
  - Durable Workflow Server 配置
  - DW 环境变量
  - Server 环境审计
  - 工作流 Server 环境
---

# Server 配置参考 {#server-config-reference}

本页说明 Durable Workflow Server 镜像面向运维人员的 `DW_*` 环境变量契约。构建部署模板、检查生产配置，或将旧的 `WORKFLOW_*` / `ACTIVITY_*` 名称迁移到 v2 Server 契约时，请参考本页。

Server 也使用常规 Laravel 运行时设置，例如 `DB_*`、`REDIS_*`、`QUEUE_CONNECTION` 和 `CACHE_STORE`。这些变量属于部署基础设施，并非 Durable Workflow API 控制项，因此单独列出。

## 配置变更何时生效 {#how-changes-take-effect}

已发布的 PHP Server 镜像在入口脚本中运行 `php artisan config:cache`。环境值在启动时解析并写入 Laravel 配置缓存。修改环境文件、编排器中的环境声明或挂载的配置文件，都不会使运行中的部署热加载配置。

使用新配置重启或替换所有受影响的进程，包括 HTTP API 副本、本地 Laravel 队列 Worker 和调度器。修改 SDK 客户端或 Worker 自身配置时，另行重启长期运行的 SDK Worker。API 重启成功并不会更新仍在运行的队列 Worker 或调度器。共享数据库与缓存的各角色应使用一致的预期配置。

滚动变更期间，每个节点执行自己已加载的限制。共享准入计数器无法让配置不同的节点自动采用相同限制，因此某个 API 副本接受的请求可能被另一个拒绝。需要一致切换限制时：

1. 暂停调用方提交新请求，并从入口移除受影响的 API 副本。让在途请求完成，按照各自的关闭时间预算正常停止队列与调度器角色。
2. 向所有受影响角色应用相同配置，然后重启或替换它们。让各容器入口脚本重建配置缓存。
3. 检查启动日志中的配置错误、确认就绪状态，并实际验证变更的限制，然后恢复入口流量和调用方提交。参阅[部署与就绪指南](/docs/deployment#readiness-contract)。

存储在数据库中的运维设置采用不同生命周期。以下修改成功后，后续操作即可使用新值，无需重启 Server：

| 设置 | 即时修改 | 范围与限制 |
| --- | --- | --- |
| 命名空间描述与保留 | [`PUT /api/namespaces/{namespace}`](/docs/polyglot/server-api-reference#namespace-and-storage)，或 [`dw namespace:update`](/docs/polyglot/cli-reference#namespace-and-search-attribute-commands) | 保留策略作用于后续清理。更改策略不能恢复已剪除的数据。参阅 [Server 保留设置](/docs/polyglot/server#retention)。 |
| 命名空间外部载荷存储策略 | [`PUT /api/namespaces/{namespace}/external-storage`](/docs/features/external-payload-storage#configuring-a-namespace) | 更改持久化的命名空间策略。提供方凭据、已配置的文件系统磁盘及其他进程配置仍需按照上述流程重启。保留对现有运行所引用对象的访问。 |
| 命名空间搜索属性定义 | [`POST` / `DELETE /api/search-attributes`](/docs/polyglot/server-api-reference#schedules-and-search-attributes) | 更新后续请求使用的注册信息，不改写工作流历史，也不替代环境配置的大小和数量限制。 |

除非文档明确说明某个控制平面操作会修改持久化状态，本页的 `DW_*` 默认值和上限都属于进程配置。Server 不会轮询配置文件的变化。

## 契约如何执行 {#how-the-contract-is-enforced}

Server 仓库在 `config/dw-contract.php` 中维护规范契约。容器启动时，`php artisan env:audit` 会对未知的 `DW_*` 变量或旧名称发出警告。如需让入口脚本直接失败而不是带警告启动，请设置 `DW_ENV_AUDIT_STRICT=1`。

```bash
DW_ENV_AUDIT_STRICT=1
DW_AUTH_DRIVER=token
DW_ADMIN_TOKEN="${DW_ADMIN_TOKEN}"
DW_OPERATOR_TOKEN="${DW_OPERATOR_TOKEN}"
DW_WORKER_TOKEN="${DW_WORKER_TOKEN}"
```

旧名称仅用于回退。新部署优先使用 `DW_*` 名称。即使 Server 仍接受旧值，也应将旧名称警告视为待完成的迁移工作。

## Server 标识与模式 {#server-identity-and-mode}

| 变量 | 默认值 | 用途 | 旧版别名 |
| --- | --- | --- | --- |
| `DW_MODE` | `service` | Server 模式：`service` 由外部 Worker 轮询；`embedded` 通过 Laravel 队列在本地分派。 | `WORKFLOW_SERVER_MODE` |
| `DW_SERVER_ID` | `gethostname()` | 用于租约归属和 Worker 注册的唯一 Server 实例标识。 | `WORKFLOW_SERVER_ID` |
| `DW_SERVER_TOPOLOGY_SHAPE` | `standalone_server` | 集群发现中通告的拓扑形态，例如 `embedded`、`standalone_server` 或 `split_control_execution`。 | `WORKFLOW_SERVER_TOPOLOGY_SHAPE` |
| `DW_SERVER_PROCESS_CLASS` | `server_http_node` | 节点在所选拓扑中通告的进程类别，例如 `server_http_node`、`worker_node` 或 `scheduler_node`。 | `WORKFLOW_SERVER_PROCESS_CLASS` |
| `DW_SERVER_KEY` | 容器启动时生成 | 可选的 Server 内部运行密钥；未设置时由 Docker 镜像自动生成。 | - |
| `DW_DEFAULT_NAMESPACE` | `default` | 请求省略命名空间请求头时使用的命名空间。 | `WORKFLOW_SERVER_DEFAULT_NAMESPACE` |
| `DW_TASK_DISPATCH_MODE` | 未设置 | 覆盖 `workflows.v2.task_dispatch_mode`；在 service 模式中，未指定其他值时默认为 `poll`。 | `WORKFLOW_V2_TASK_DISPATCH_MODE` |
| `DW_WORKFLOW_MEMO_MIGRATION_RECOVERY` | 未设置 | 用于未记录的 memo 重写的一次性 MySQL 恢复证明：`raw-json` 或 `envelope-prefix:<last-converted-id>`。 | `WORKFLOW_SERVER_WORKFLOW_MEMO_MIGRATION_RECOVERY` |
| `DW_EXTERNAL_EXECUTOR_CONFIG_PATH` | 未设置 | 包含外部执行器处理程序映射的 `durable-workflow.external-executor.config` JSON 文件路径。 | `WORKFLOW_SERVER_EXTERNAL_EXECUTOR_CONFIG_PATH` |
| `DW_EXTERNAL_EXECUTOR_CONFIG_OVERLAY` | 未设置 | 在 Server 验证和发现之前应用的外部执行器配置文件中的覆盖层名称。 | `WORKFLOW_SERVER_EXTERNAL_EXECUTOR_CONFIG_OVERLAY` |

## 身份验证 {#authentication}

| 变量 | 默认值 | 用途 | 旧版别名 |
| --- | --- | --- | --- |
| `DW_AUTH_PROVIDER` | 未设置 | 可由 Laravel 解析、实现 `App\Contracts\AuthProvider` 的类。 | `WORKFLOW_SERVER_AUTH_PROVIDER` |
| `DW_AUTH_DRIVER` | `token` | 身份验证驱动：`none`、`token` 或 `signature`。 | `WORKFLOW_SERVER_AUTH_DRIVER` |
| `DW_AUTH_TOKEN` | 未设置 | 未配置角色令牌时使用的单个共享 Bearer 令牌。 | `WORKFLOW_SERVER_AUTH_TOKEN` |
| `DW_SIGNATURE_KEY` | 未设置 | 未配置角色签名密钥时使用的共享 HMAC 签名密钥。 | `WORKFLOW_SERVER_SIGNATURE_KEY` |
| `DW_WORKER_TOKEN` | 未设置 | 用于 Worker 注册、轮询、心跳和完成请求的 Bearer 令牌。 | `WORKFLOW_SERVER_WORKER_TOKEN` |
| `DW_OPERATOR_TOKEN` | 未设置 | 用于读取及运维控制平面操作的 Bearer 令牌。 | `WORKFLOW_SERVER_OPERATOR_TOKEN` |
| `DW_ADMIN_TOKEN` | 未设置 | 用于命名空间、保留设置及其他管理修改的 Bearer 令牌。 | `WORKFLOW_SERVER_ADMIN_TOKEN` |
| `DW_PRINCIPAL_TOKENS` | 未设置 | 命名 Bearer 令牌主体的 JSON 映射。每个条目提供 `token`、`subject`、`roles`，以及可选的 `tenant`、`label` 和不含秘密的 `claims`。 | `WORKFLOW_SERVER_PRINCIPAL_TOKENS` |
| `DW_WORKER_SIGNATURE_KEY` | 未设置 | 签名认证中用于 Worker 角色请求的 HMAC 密钥。 | `WORKFLOW_SERVER_WORKER_SIGNATURE_KEY` |
| `DW_OPERATOR_SIGNATURE_KEY` | 未设置 | 签名认证中用于运维角色请求的 HMAC 密钥。 | `WORKFLOW_SERVER_OPERATOR_SIGNATURE_KEY` |
| `DW_ADMIN_SIGNATURE_KEY` | 未设置 | 签名认证中用于管理员角色请求的 HMAC 密钥。 | `WORKFLOW_SERVER_ADMIN_SIGNATURE_KEY` |
| `DW_AUTH_BACKWARD_COMPATIBLE` | `true` | 缺少角色凭据时，接受共享 `DW_AUTH_TOKEN` / `DW_SIGNATURE_KEY` 作为回退。 | `WORKFLOW_SERVER_AUTH_BACKWARD_COMPATIBLE` |

生产环境应使用按角色划分的凭据。`DW_AUTH_DRIVER=none` 会让所有端点无需 Bearer 令牌或签名即可访问，因此仅适用于本地冒烟验证。

审计记录需要稳定的操作者主体而不只是角色标签时，请使用 `DW_PRINCIPAL_TOKENS`。Server 根据匹配的令牌条目确定记录的主体，客户端不能通过请求载荷或请求头覆盖它。

## 命令归属 {#command-attribution}

这些设置允许受信任网关将调用方元数据保存在持久化命令历史中。除非 Server 位于会剥离不可信客户端请求头的网关之后，否则请保持 `DW_TRUST_FORWARDED_ATTRIBUTION_HEADERS=false`。

| 变量 | 默认值 | 用途 | 旧版别名 |
| --- | --- | --- | --- |
| `DW_TRUST_FORWARDED_ATTRIBUTION_HEADERS` | `false` | 将转发的调用方及认证请求头记录到工作流命令历史。 | `WORKFLOW_SERVER_TRUST_FORWARDED_ATTRIBUTION_HEADERS` |
| `DW_CALLER_TYPE_HEADER` | `X-Workflow-Caller-Type` | 携带转发调用方类型的请求头。 | `WORKFLOW_SERVER_CALLER_TYPE_HEADER` |
| `DW_CALLER_LABEL_HEADER` | `X-Workflow-Caller-Label` | 携带转发调用方标签的请求头。 | `WORKFLOW_SERVER_CALLER_LABEL_HEADER` |
| `DW_AUTH_STATUS_HEADER` | `X-Workflow-Auth-Status` | 携带转发认证状态的请求头。 | `WORKFLOW_SERVER_AUTH_STATUS_HEADER` |
| `DW_AUTH_METHOD_HEADER` | `X-Workflow-Auth-Method` | 携带转发认证方法的请求头。 | `WORKFLOW_SERVER_AUTH_METHOD_HEADER` |

## Worker 轮询与准入 {#worker-polling-and-admission}

这些值控制长轮询时序、唤醒协调、Server 端准入上限，以及有界的任务分派预算。

| 变量 | 默认值 | 用途 | 旧版别名 |
| --- | --- | --- | --- |
| `DW_WORKER_POLL_TIMEOUT` | `30` | Server 保持轮询以等待任务的秒数。 | `WORKFLOW_SERVER_WORKER_POLL_TIMEOUT` |
| `DW_WORKER_POLL_INTERVAL_MS` | `1000` | 保持轮询期间内部扫描的间隔，单位为毫秒。 | `WORKFLOW_SERVER_WORKER_POLL_INTERVAL_MS` |
| `DW_WORKER_POLL_SIGNAL_CHECK_INTERVAL_MS` | `100` | 保持轮询期间检查唤醒信号的间隔，单位为毫秒。 | `WORKFLOW_SERVER_WORKER_POLL_SIGNAL_CHECK_INTERVAL_MS` |
| `DW_POLLING_CACHE_PATH` | `storage/framework/cache/server-polling/<APP_ENV>` | 使用文件轮询缓存时，存储 Worker 轮询协调状态的目录。 | `WORKFLOW_SERVER_POLLING_CACHE_PATH` |
| `DW_WAKE_SIGNAL_TTL_SECONDS` | `max(DW_WORKER_POLL_TIMEOUT + 5, 60)` | 用于提前结束等待中轮询的每队列唤醒信号 TTL。 | `WORKFLOW_SERVER_WAKE_SIGNAL_TTL_SECONDS` |
| `DW_WORKER_LONG_POLL_MAX_CONCURRENT` | 未设置；根据 `PHP_CLI_SERVER_WORKERS` 推导 | 此 Server 节点上工作流及活动长轮询等待的可选并发上限。查询任务轮询使用独立的等待预算。 | `WORKFLOW_SERVER_WORKER_LONG_POLL_MAX_CONCURRENT` |
| `DW_WORKER_LONG_POLL_RESERVED_HTTP_WORKERS` | `2` | 推导工作流及活动长轮询等待上限时，为健康检查和控制平面请求保留的 PHP CLI Server Worker 数量。 | `WORKFLOW_SERVER_WORKER_LONG_POLL_RESERVED_HTTP_WORKERS` |
| `DW_MAX_TASKS_PER_POLL` | `1` | 每次 Worker 轮询返回的最大任务数。 | `WORKFLOW_SERVER_MAX_TASKS_PER_POLL` |
| `DW_SQLITE_CLAIM_LOCK_TTL_SECONDS` | `10` | SQLite 快速入门后端保持基于缓存的 Worker 轮询领取门锁的秒数。 | `WORKFLOW_SERVER_SQLITE_CLAIM_LOCK_TTL_SECONDS` |
| `DW_SQLITE_CLAIM_LOCK_WAIT_SECONDS` | `5` | SQLite Worker 轮询领取在返回后端锁压力前等待缓存领取门的秒数。 | `WORKFLOW_SERVER_SQLITE_CLAIM_LOCK_WAIT_SECONDS` |
| `DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` | 未设置 | 每个命名空间及任务队列的工作流任务有效租约上限。 | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` |
| `DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` | 未设置 | 一个命名空间内所有队列的工作流任务有效租约上限。 | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` |
| `DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE` | 未设置 | 每个命名空间及任务队列每分钟分派的工作流任务上限。 | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE` |
| `DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` | 未设置 | 一个命名空间内所有队列每分钟分派的工作流任务上限。 | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` |
| `DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` | 未设置 | 每个命名空间及任务队列的活动任务有效租约上限。 | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` |
| `DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` | 未设置 | 一个命名空间内所有队列的活动任务有效租约上限。 | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` |
| `DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE` | 未设置 | 每个命名空间及任务队列每分钟分派的活动任务上限。 | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE` |
| `DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` | 未设置 | 一个命名空间内所有队列每分钟分派的活动任务上限。 | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` |
| `DW_TASK_QUEUE_ADMISSION_OVERRIDES` | `{}` | 有效租约、分派速率、命名空间上限和下游预算组的 JSON 覆盖，按 `namespace:task_queue`、`namespace:*`、`task_queue` 或 `*` 索引。 | `WORKFLOW_SERVER_TASK_QUEUE_ADMISSION_OVERRIDES` |
| `DW_DUE_TIMER_RECOVERY_SCAN_LIMIT` | `5` | 每次 Worker 轮询恢复的到期 service 模式定时器任务最大数量。 | `WORKFLOW_SERVER_DUE_TIMER_RECOVERY_SCAN_LIMIT` |
| `DW_EXPIRED_WORKFLOW_TASK_RECOVERY_SCAN_LIMIT` | `5` | 每轮恢复的租约过期工作流任务最大数量。 | `WORKFLOW_SERVER_EXPIRED_WORKFLOW_TASK_RECOVERY_SCAN_LIMIT` |
| `DW_EXPIRED_WORKFLOW_TASK_RECOVERY_TTL_SECONDS` | `5` | 每个队列执行过期任务恢复的最短间隔，单位为秒。 | `WORKFLOW_SERVER_EXPIRED_WORKFLOW_TASK_RECOVERY_TTL_SECONDS` |

Sticky 执行没有独立的 Server 镜像环境变量。关于 sticky 缓存生命周期、Worker 协议字段、重放模式和诊断，参阅 [Sticky 执行](/docs/features/sticky-execution)。

准入覆盖示例：

```json
{
  "production:billing": {
    "workflow_tasks": {
      "max_active_leases": 50,
      "max_dispatches_per_minute": 600
    },
    "activity_tasks": {
      "max_active_leases": 200
    }
  },
  "production:*": {
    "workflow_tasks": {
      "max_active_leases_per_namespace": 500
    }
  }
}
```

## Worker 协议与查询传输 {#worker-protocol-and-query-transport}

| 变量 | 默认值 | 用途 | 旧版别名 |
| --- | --- | --- | --- |
| `DW_WORKER_PROTOCOL_VERSION` | `WorkerProtocolVersion::VERSION` | Worker 平面响应中通告的 Worker 协议版本。 | `WORKFLOW_SERVER_WORKER_PROTOCOL_VERSION` |
| `DW_HISTORY_PAGE_SIZE_DEFAULT` | `WorkerProtocolVersion::DEFAULT_HISTORY_PAGE_SIZE` | Worker 读取历史时的默认分页大小。 | `WORKFLOW_SERVER_HISTORY_PAGE_SIZE_DEFAULT` |
| `DW_HISTORY_PAGE_SIZE_MAX` | `WorkerProtocolVersion::MAX_HISTORY_PAGE_SIZE` | Worker 读取历史时允许的最大分页大小。 | `WORKFLOW_SERVER_HISTORY_PAGE_SIZE_MAX` |
| `DW_UPDATE_VALIDATION_TIMEOUT` | `10` | 控制平面等待接受前同步更新验证器结果的秒数。 | `WORKFLOW_SERVER_UPDATE_VALIDATION_TIMEOUT` |
| `DW_UPDATE_VALIDATION_LEASE_TIMEOUT` | `5` | 更新验证任务租约保持归属的秒数，之后替代的具备验证能力的 Worker 可重试。 | `WORKFLOW_SERVER_UPDATE_VALIDATION_LEASE_TIMEOUT` |
| `DW_QUERY_TASK_TIMEOUT` | `DW_WORKER_POLL_TIMEOUT` | 控制平面等待 Worker 查询任务响应的秒数。 | `WORKFLOW_SERVER_QUERY_TASK_TIMEOUT` |
| `DW_QUERY_TASK_LEASE_TIMEOUT` | `DW_WORKFLOW_TASK_TIMEOUT` | 分配给 Worker 的临时查询任务租约超时。 | `WORKFLOW_SERVER_QUERY_TASK_LEASE_TIMEOUT` |
| `DW_QUERY_TASK_TTL_SECONDS` | `180` | Server 清理前保留查询任务结果行的时间，单位为秒。 | `WORKFLOW_SERVER_QUERY_TASK_TTL_SECONDS` |
| `DW_QUERY_TASK_MAX_PENDING_PER_QUEUE` | `1024` | 每个命名空间及任务队列缓存中允许的待处理查询任务上限，超过后拒绝新查询。 | `WORKFLOW_SERVER_QUERY_TASK_MAX_PENDING_PER_QUEUE` |
| `DW_QUERY_TASK_POLL_TIMEOUT` | `5` | 空闲查询任务 Worker 轮询在重新检查工作流任务压力和控制平面可用性之前等待的最大秒数。 | `WORKFLOW_SERVER_QUERY_TASK_POLL_TIMEOUT` |
| `DW_QUERY_TASK_POLL_MAX_CONCURRENT` | 未设置；根据 `PHP_CLI_SERVER_WORKERS` 推导 | 此 Server 节点上空闲查询任务长轮询等待的可选并发上限。进入空闲等待前，仍可立即领取待处理查询任务。 | `WORKFLOW_SERVER_QUERY_TASK_POLL_MAX_CONCURRENT` |
| `DW_WORKFLOW_TASK_TIMEOUT` | `60` | 工作流任务的默认租约超时，单位为秒。 | `WORKFLOW_TASK_TIMEOUT` |
| `DW_ACTIVITY_TASK_TIMEOUT` | `300` | 活动任务的默认租约超时，单位为秒。 | `ACTIVITY_TASK_TIMEOUT` |
| `DW_WORKER_STALE_AFTER_SECONDS` | `max(DW_WORKER_HEARTBEAT_INTERVAL_SECONDS * 3, 30)` | Worker 心跳后，其注册被视为过期所需的秒数。 | `WORKFLOW_SERVER_WORKER_STALE_AFTER_SECONDS` |
| `DW_WORKER_HEARTBEAT_INTERVAL_SECONDS` | `10` | Worker 注册及心跳确认中向 SDK 通告的心跳间隔，单位为秒。 | `WORKFLOW_SERVER_WORKER_HEARTBEAT_INTERVAL_SECONDS` |

## 限制、保留与指标 {#limits-retention-and-metrics}

这些设置限制请求边界和数据增长。如果应用经常接近这些值，应优先缩小载荷、使用外部载荷存储或 continue-as-new，而不是默认提高上限。

| 变量 | 默认值 | 用途 | 旧版别名 |
| --- | --- | --- | --- |
| `DW_METRICS_WORKFLOW_TASK_FAILURE_TYPE_LIMIT` | `20` | `dw_workflow_task_consecutive_failures` 报告的 `workflow_type` 序列上限，超出类型将汇总。 | `WORKFLOW_SERVER_METRICS_WORKFLOW_TASK_FAILURE_TYPE_LIMIT` |
| `DW_METRICS_PROMETHEUS_WORKFLOW_SERIES_LIMIT` | `100` | `/api/system/prometheus-metrics` 报告的工作流序列上限，超出序列将汇总。 | `WORKFLOW_SERVER_METRICS_PROMETHEUS_WORKFLOW_SERIES_LIMIT` |
| `DW_METRICS_PROMETHEUS_ACTIVITY_SERIES_LIMIT` | `100` | `/api/system/prometheus-metrics` 报告的活动序列上限，超出序列将汇总。 | `WORKFLOW_SERVER_METRICS_PROMETHEUS_ACTIVITY_SERIES_LIMIT` |
| `DW_METRICS_PROMETHEUS_TASK_QUEUE_SERIES_LIMIT` | `100` | `/api/system/prometheus-metrics` 报告的任务队列运行时序列上限，超出序列将汇总。 | `WORKFLOW_SERVER_METRICS_PROMETHEUS_TASK_QUEUE_SERIES_LIMIT` |
| `DW_MAX_HISTORY_EVENTS` | `50000` | 强制 continue-as-new 前每次工作流运行的历史事件上限。 | `WORKFLOW_MAX_HISTORY_EVENTS` |
| `DW_HISTORY_RETENTION_DAYS` | `30` | 命名空间未覆盖时，已关闭运行历史的默认保留天数。 | `WORKFLOW_HISTORY_RETENTION_DAYS` |
| `DW_MAX_PAYLOAD_BYTES` | `2097152` | 单个载荷序列化后的最大字节数。 | `WORKFLOW_MAX_PAYLOAD_BYTES` |
| `DW_EXTERNAL_PAYLOAD_MAX_BYTES` | `67108864` | 经身份验证的外部载荷上传与获取传输所接受的最大编码字节数（64 MiB）。 | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_MAX_BYTES` |
| `DW_EXTERNAL_PAYLOAD_REQUEST_TIMEOUT` | `30` | Server 向客户端通告的上传与获取请求超时预算，单位为秒。 | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_REQUEST_TIMEOUT` |
| `DW_EXTERNAL_PAYLOAD_UPLOAD_EXPIRY` | `3600` | 已上传的外部载荷在不透明引用过期前可保持未认领状态的秒数。 | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_UPLOAD_EXPIRY` |
| `DW_MAX_MEMO_BYTES` | `262144` | 工作流 memo 序列化后的最大字节数。 | `WORKFLOW_MAX_MEMO_BYTES` |
| `DW_MAX_SEARCH_ATTRIBUTES` | `100` | 单个工作流的搜索属性最大数量。 | `WORKFLOW_MAX_SEARCH_ATTRIBUTES` |
| `DW_MAX_SEARCH_ATTRIBUTE_KEY_LENGTH` | `128` | 单个搜索属性键的最大字节长度。 | `WORKFLOW_MAX_SEARCH_ATTRIBUTE_KEY_LENGTH` |
| `DW_MAX_SEARCH_ATTRIBUTE_VALUE_BYTES` | `2048` | 单个搜索属性字符串值的最大字节数。 | `WORKFLOW_MAX_SEARCH_ATTRIBUTE_VALUE_BYTES` |
| `DW_MAX_OPERATION_NAME_LENGTH` | `256` | 信号、更新或查询名称的最大字节长度。 | `WORKFLOW_MAX_OPERATION_NAME_LENGTH` |
| `DW_MAX_PENDING_ACTIVITIES` | `2000` | 拒绝命令批次之前，每次运行允许的待处理活动上限。 | `WORKFLOW_MAX_PENDING_ACTIVITIES` |
| `DW_MAX_PENDING_CHILDREN` | `2000` | 拒绝命令批次之前，每次运行允许的待处理子工作流上限。 | `WORKFLOW_MAX_PENDING_CHILDREN` |
| `DW_MAX_NEXUS_OPERATIONS_PER_CALLER` | `200` | 操作历史接口向每个调用方返回的 Nexus 操作上限，之后客户端需分页。 | `WORKFLOW_MAX_NEXUS_OPERATIONS_PER_CALLER` |
| `DW_COMPRESSION_ENABLED` | `true` | 对超过最小大小阈值的 JSON 响应启用压缩。 | `WORKFLOW_SERVER_COMPRESSION_ENABLED` |

## Docker 初始化与来源信息 {#docker-bootstrap-and-provenance}

| 变量 | 默认值 | 用途 | 旧版别名 |
| --- | --- | --- | --- |
| `DW_EXPOSE_PACKAGE_PROVENANCE` | `false` | 在管理员的 `/api/cluster/info` 请求中包含 `package_provenance`。 | `WORKFLOW_SERVER_EXPOSE_PACKAGE_PROVENANCE` |
| `DW_PACKAGE_PROVENANCE_PATH` | `<base_path>/.package-provenance` | Docker 构建来源信息文件的绝对路径。 | `WORKFLOW_SERVER_PACKAGE_PROVENANCE_PATH` |
| `DW_SERVICE_BOUNDARY_CROSS_NAMESPACE_DEFAULT` | `allow` | 跨命名空间调用未匹配更具体规则时，服务调用边界采用的默认操作。 | `WORKFLOW_SERVER_SERVICE_BOUNDARY_CROSS_NAMESPACE_DEFAULT` |
| `DW_SERVICE_BOUNDARY_RATE_LIMIT_PER_MINUTE` | 未设置 | 服务调用边界的可选每分钟速率限制。 | `WORKFLOW_SERVER_SERVICE_BOUNDARY_RATE_LIMIT_PER_MINUTE` |
| `DW_SERVICE_BOUNDARY_MAX_IN_FLIGHT` | 未设置 | 服务调用边界的可选并发限制。 | `WORKFLOW_SERVER_SERVICE_BOUNDARY_MAX_IN_FLIGHT` |

## Docker 初始化 {#docker-bootstrap}

| 变量 | 默认值 | 用途 | 旧版别名 |
| --- | --- | --- | --- |
| `DW_ENV_AUDIT_STRICT` | `0` | 当 `env:audit` 发现未知或旧版 `DW_*` 变量时使容器启动失败。 | - |
| `DW_BOOTSTRAP_RETRIES` | `30` | 入口脚本放弃迁移和默认命名空间初始化前的尝试次数。 | `WORKFLOW_SERVER_BOOTSTRAP_RETRIES` |
| `DW_BOOTSTRAP_DELAY_SECONDS` | `2` | 初始化尝试之间的间隔秒数。 | `WORKFLOW_SERVER_BOOTSTRAP_DELAY_SECONDS` |

## Workflow 包设置 {#workflow-package-controls}

Server 镜像内置 `durable-workflow/workflow`，因此也提供包级 `DW_V2_*` 设置。这些设置应与执行同一工作流的 Worker 部署一致。

| 变量 | 默认值 | 用途 | 旧版别名 |
| --- | --- | --- | --- |
| `DW_V2_NAMESPACE` | 未设置 | 将工作流实例限定到一个命名空间。 | `WORKFLOW_V2_NAMESPACE` |
| `DW_V2_TENANCY_ORGANIZATION` | 未设置 | 在就绪、发现和运维接口中公开的包租户层级的可选组织部分。 | `WORKFLOW_V2_TENANCY_ORGANIZATION` |
| `DW_V2_TENANCY_PROJECT` | 未设置 | 在就绪、发现和运维接口中公开的包租户层级的可选项目部分。 | `WORKFLOW_V2_TENANCY_PROJECT` |
| `DW_V2_TENANCY_ENVIRONMENT` | 未设置 | 在就绪、发现和运维接口中公开的包租户层级的可选环境部分。 | `WORKFLOW_V2_TENANCY_ENVIRONMENT` |
| `DW_V2_CURRENT_COMPATIBILITY` | 未设置 | 此 Worker 通告的兼容性标记。 | `WORKFLOW_V2_CURRENT_COMPATIBILITY` |
| `DW_V2_SUPPORTED_COMPATIBILITIES` | 未设置 | 此 Worker 接受的逗号分隔兼容性标记，或 `*`。 | `WORKFLOW_V2_SUPPORTED_COMPATIBILITIES` |
| `DW_V2_COMPATIBILITY_NAMESPACE` | 未设置 | 独立 Worker 集群共享工作流数据库时使用的兼容性命名空间。 | `WORKFLOW_V2_COMPATIBILITY_NAMESPACE` |
| `DW_V2_COMPATIBILITY_HEARTBEAT_TTL` | `30` | Worker 兼容性心跳的有效秒数。 | `WORKFLOW_V2_COMPATIBILITY_HEARTBEAT_TTL` |
| `DW_V2_PIN_TO_RECORDED_FINGERPRINT` | `true` | 优先选择已记录的工作流定义；各运行时的回退边界见下文。 | `WORKFLOW_V2_PIN_TO_RECORDED_FINGERPRINT` |
| `DW_V2_CONTINUE_AS_NEW_EVENT_THRESHOLD` | `10000` | 包建议工作流作者执行 continue-as-new 的历史事件数量阈值。 | `WORKFLOW_V2_CONTINUE_AS_NEW_EVENT_THRESHOLD` |
| `DW_V2_CONTINUE_AS_NEW_SIZE_BYTES_THRESHOLD` | `5242880` | 包建议执行 continue-as-new 的序列化历史字节大小阈值。 | `WORKFLOW_V2_CONTINUE_AS_NEW_SIZE_BYTES_THRESHOLD` |
| `DW_V2_HISTORY_EXPORT_SIGNING_KEY` | 未设置 | 用于认证历史导出归档的可选 HMAC 密钥。 | `WORKFLOW_V2_HISTORY_EXPORT_SIGNING_KEY` |
| `DW_V2_HISTORY_EXPORT_SIGNING_KEY_ID` | 未设置 | 与签名历史导出一同记录的密钥标识。 | `WORKFLOW_V2_HISTORY_EXPORT_SIGNING_KEY_ID` |
| `DW_V2_UPDATE_WAIT_COMPLETION_TIMEOUT_SECONDS` | `10` | Server 等待更新到达终态的秒数。 | `WORKFLOW_V2_UPDATE_WAIT_COMPLETION_TIMEOUT_SECONDS` |
| `DW_V2_UPDATE_WAIT_POLL_INTERVAL_MS` | `50` | 轮询更新阶段的间隔，单位为毫秒。 | `WORKFLOW_V2_UPDATE_WAIT_POLL_INTERVAL_MS` |
| `DW_V2_GUARDRAILS_BOOT` | `warn` | 启动时的结构保护模式：`warn`、`fail` 或 `silent`。 | `WORKFLOW_V2_GUARDRAILS_BOOT` |
| `DW_V2_LIMIT_PENDING_ACTIVITIES` | `2000` | 包级待处理活动数量上限。 | `WORKFLOW_V2_LIMIT_PENDING_ACTIVITIES` |
| `DW_V2_LIMIT_PENDING_CHILDREN` | `1000` | 包级待处理子工作流数量上限。 | `WORKFLOW_V2_LIMIT_PENDING_CHILDREN` |
| `DW_V2_LIMIT_PENDING_TIMERS` | `2000` | 包级待处理定时器数量上限。 | `WORKFLOW_V2_LIMIT_PENDING_TIMERS` |
| `DW_V2_LIMIT_PENDING_SIGNALS` | `5000` | 包级待处理信号数量上限。 | `WORKFLOW_V2_LIMIT_PENDING_SIGNALS` |
| `DW_V2_LIMIT_PENDING_UPDATES` | `500` | 包级待处理更新数量上限。 | `WORKFLOW_V2_LIMIT_PENDING_UPDATES` |
| `DW_V2_LIMIT_COMMAND_BATCH_SIZE` | `1000` | 一次工作流任务完成所接受的最大命令数。 | `WORKFLOW_V2_LIMIT_COMMAND_BATCH_SIZE` |
| `DW_V2_LIMIT_PAYLOAD_SIZE_BYTES` | `2097152` | 包级单个载荷字节上限。 | `WORKFLOW_V2_LIMIT_PAYLOAD_SIZE_BYTES` |
| `DW_V2_LIMIT_MEMO_SIZE_BYTES` | `262144` | 包级工作流 memo 字节上限。 | `WORKFLOW_V2_LIMIT_MEMO_SIZE_BYTES` |
| `DW_V2_LIMIT_SEARCH_ATTRIBUTE_SIZE_BYTES` | `40960` | 包级搜索属性字节上限。 | `WORKFLOW_V2_LIMIT_SEARCH_ATTRIBUTE_SIZE_BYTES` |
| `DW_V2_LIMIT_HISTORY_TRANSACTION_SIZE` | `5000` | 包级历史事务事件数量上限。 | `WORKFLOW_V2_LIMIT_HISTORY_TRANSACTION_SIZE` |
| `DW_V2_LIMIT_WARNING_THRESHOLD_PERCENT` | `80` | 包发出警告时的结构限制使用百分比。 | `WORKFLOW_V2_LIMIT_WARNING_THRESHOLD_PERCENT` |
| `DW_V2_TASK_DISPATCH_MODE` | `queue` | 包级任务分派模式；Server 模式中通常由 `DW_TASK_DISPATCH_MODE` 覆盖。 | - |
| `DW_V2_MATCHING_ROLE_QUEUE_WAKE` | `true` | 队列 Worker 是否在每次 Looping 事件执行 Worker 内部匹配角色唤醒。若由专用 `php artisan workflow:v2:repair-pass --loop` 守护进程负责扫描，设为 `false` 可让纯执行节点退出广泛轮询唤醒。 | `WORKFLOW_V2_MATCHING_ROLE_QUEUE_WAKE` |
| `DW_V2_TASK_REPAIR_REDISPATCH_AFTER_SECONDS` | `3` | 修复重新分派孤立工作流任务前的秒数。 | `WORKFLOW_V2_TASK_REPAIR_REDISPATCH_AFTER_SECONDS` |
| `DW_V2_TASK_REPAIR_LOOP_THROTTLE_SECONDS` | `5` | 每个队列执行任务修复的最短间隔，单位为秒。 | `WORKFLOW_V2_TASK_REPAIR_LOOP_THROTTLE_SECONDS` |
| `DW_V2_TASK_REPAIR_SCAN_LIMIT` | `25` | 每轮任务修复检查的最大任务数。 | `WORKFLOW_V2_TASK_REPAIR_SCAN_LIMIT` |
| `DW_V2_TASK_REPAIR_FAILURE_BACKOFF_MAX_SECONDS` | `60` | 任务修复失败退避的最大秒数。 | `WORKFLOW_V2_TASK_REPAIR_FAILURE_BACKOFF_MAX_SECONDS` |
| `DW_V2_MULTI_NODE` | `false` | 声明多节点部署，以验证缓存后端是否支持跨节点协调。 | `WORKFLOW_V2_MULTI_NODE` |
| `DW_V2_VALIDATE_CACHE_BACKEND` | `true` | 启动时验证长轮询缓存后端。 | `WORKFLOW_V2_VALIDATE_CACHE_BACKEND` |
| `DW_V2_CACHE_VALIDATION_MODE` | `warn` | 缓存后端验证失败模式：`fail`、`warn` 或 `silent`。 | `WORKFLOW_V2_CACHE_VALIDATION_MODE` |
| `DW_V2_FLEET_VALIDATION_MODE` | `warn` | Worker 集群兼容性验证模式：`warn` 记录日志；`fail` 在没有兼容 Worker 时阻止分派并安全拒绝。 | `WORKFLOW_V2_FLEET_VALIDATION_MODE` |
| `DW_SERIALIZER` | `avro` | 载荷编解码器诊断输入；正式 v2 将新运行的载荷解析为 Avro。 | `WORKFLOW_SERIALIZER` |

**已发布的指纹优先选择。** Server 2.9.9 使指纹优先选择对服务模式 Worker 生效。启用固定时，只有不存在符合条件的已记录定义 Worker，且替换 Worker 声明 `workflow_entry_arguments_validation`，才能回退到更改后的定义。禁用固定后，源码优先选择会取消，但构建固定、命名空间/队列/类型隔离、注册标识和严格重放仍然保留。配套的入口保护已在 PHP SDK 2.5.4、Python SDK 2.6.2 和 Rust SDK 3.5.6 中引入。这些是相应功能的最低支持版本；请安装包含安全修复的当前稳定版本。不要仅因为旧运行时的配置含有同一键，就假定它具有此行为。请参阅[定义路由](./worker-compatibility-routing.md#definition-fingerprint-evolution)。

在 CI 与部署清单中使用 `DW_V2_GUARDRAILS_BOOT`。保留旧名称 `WORKFLOW_V2_GUARDRAILS_BOOT` 只是为了让 `env:audit` 提醒 alpha 时期的用户改名；Workflow 包不再将旧名称作为运行时回退值读取。

配置 `DW_V2_MATCHING_ROLE_QUEUE_WAKE` 或专用 `workflow:v2:repair-pass --loop` 守护进程时，请参阅[任务匹配与分派](/docs/polyglot/task-matching-dispatch)。这些设置改变就绪任务的发现位置，而不改变 Worker 协议本身的契约。

## 运行基础设施变量 {#runtime-infrastructure-variables}

运行基础设施变量属于框架及依赖项控制。Server 审计认识这些变量，因此不会发出警告，但它们不是稳定的 Durable Workflow API 配置项。

| 分组 | 变量 | 用途 |
| --- | --- | --- |
| 应用 | `APP_NAME`、`APP_ENV`、`APP_KEY`、`APP_DEBUG`、`APP_URL`、`APP_VERSION`、区域、时区、维护及加密设置 | Laravel 应用的运行时标识与启动行为。 |
| 日志 | `LOG_CHANNEL`、`LOG_LEVEL`、`LOG_STDERR_FORMATTER`、堆栈、每日、Slack 与 Papertrail 设置 | Laravel 日志输出位置、格式与保留。 |
| 数据库 | `DB_CONNECTION`、`DB_HOST`、`DB_PORT`、`DB_DATABASE`、`DB_USERNAME`、`DB_PASSWORD`、`DB_SOCKET`、`DB_URL`、字符集、排序规则及外键设置 | 存储工作流、命名空间、Worker 及投影表的 SQL 状态库。 |
| Redis、缓存与队列 | `REDIS_*`、`QUEUE_CONNECTION`、`QUEUE_FAILED_DRIVER`、`CACHE_STORE`、`CACHE_PREFIX`、`SESSION_*` | 队列 Worker、缓存锁、长轮询信号和 Web/会话运行时支持。 |
| 文件系统、邮件与广播 | `FILESYSTEM_DISK`、`MAIL_*`、`BROADCAST_*`、`PUSHER_*`、`AWS_*` | 部署特有功能使用的框架集成。 |
| 构建与运行时 | `MYSQL_VERSION`、`REDIS_VERSION`、`PHP_CLI_SERVER_WORKERS`、`VITE_APP_NAME`、`BCRYPT_ROUNDS` | Docker Compose 镜像及框架运行行为。 |

## 容器日志 {#container-logs}

在 API、worker 和调度器容器中设置 `LOG_CHANNEL=stderr`，让 `docker logs`
或 `kubectl logs` 收集应用日志。已有发行版需显式设置。使用 `LOG_LEVEL`
选择最低严重级别。如需每行一条记录的 JSON，还应设置：

```dotenv
LOG_STDERR_FORMATTER="Monolog\Formatter\JsonFormatter"
```

配置会在启动时缓存，因此修改后应重启常驻进程。显式选择文件日志通道时，
需要自行提供存储和收集机制；Kubernetes 不会自动收集
`storage/logs/laravel.log`。`DW_LOG_FORMAT` 不是受支持的设置。

## 迁移说明 {#migration-notes}

迁移旧部署时，先改用公开名称，并将旧名称设为未设置。若两者同时存在，运维人员应以 `DW_*` 值为准，并移除旧名称。

```bash
# Before
WORKFLOW_SERVER_AUTH_DRIVER=token
WORKFLOW_SERVER_OPERATOR_TOKEN=operator-secret

# After
DW_AUTH_DRIVER=token
DW_OPERATOR_TOKEN=operator-secret
```

迁移后以 `DW_ENV_AUDIT_STRICT=1` 启动 Server 镜像，检查拼写错误、过时别名和从旧运行手册复制的设置。
