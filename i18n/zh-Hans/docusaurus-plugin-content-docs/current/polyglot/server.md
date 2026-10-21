---
sidebar_position: 2
title: Server
description: 部署和配置 Durable Workflow 独立 Server。
tags:
  - server
  - control-plane
  - operations
  - polyglot
keywords:
  - Durable Workflow Server
  - 独立 Server
  - 控制平面 API
  - 多语言工作流
---

# Server {#server}

已发布的 Durable Workflow Server 是用 PHP 实现的独立工作流编排服务。它通过语言中立的 HTTP+JSON 控制平面和 Worker 协议，公开与嵌入式 PHP 包相同的持久化引擎。PHP 是此边界的实现语言，不是应用语言要求。

## 只适用于 PHP 团队吗？ {#is-this-only-for-php-teams}

不是。PHP、Python 和 Rust 都有第一方 SDK。仅使用 Python 或 Rust 的团队可将已发布的独立 Server 部署为基础设施，以各自 SDK 编写工作流和活动，通过公开协议通信。应用无需嵌入 Laravel，也不会因此变成 Laravel 应用。

采用方式分为：

- **独立部署**：运维部署已发布的 Server 镜像及其数据库、队列/缓存、调度器和 API 角色。应用团队运行 PHP、Python 或 Rust Worker 连接该端点。Server 拥有编排状态及公开控制平面/Worker 边界。
- **嵌入式部署**：Laravel 应用安装 PHP Workflow 包，通过自己的队列、数据库、配置和部署管理引擎。这是 Laravel 原生方案的优势，不是独立部署的前提。
- **托管 Cloud**：Durable Workflow Cloud 管理编排运行时、持久化、资源放置及恢复。应用团队将 SDK 客户端和 Worker 连接到已配置的 Cloud 命名空间，不为 Cloud 部署此 Server，也不把自托管 Server 接入 Cloud。参阅 [Cloud 托管运行时](/docs/polyglot/cloud-control-plane/)。

三种方式采用相同的持久化执行概念。独立和 Cloud 托管的外部 Worker 使用稳定字符串类型名称及共享编解码信封，使跨语言子工作流或活动保持载荷形态，而不暴露 PHP 序列化。

在独立 Server 与嵌入包之间选择时，请先阅读[部署模式](/docs/polyglot/deployment-modes)。本页介绍服务模式发行版。

需要以下能力时可使用独立 Server：
- **多语言工作流**：PHP、Python 和 Rust 工作流及活动 Worker 共享同一持久化运行时
- **微服务编排**：编排不同语言编写的服务
- **集中式工作流运行时**：多个应用共享一个工作流引擎
- **非 Laravel 环境**：在 Laravel 之外使用 Durable Workflow

如果已在 Laravel 应用中嵌入 v2，请使用[嵌入式迁移到 Server 指南](/docs/polyglot/embedded-to-server)，准备类型键、在嵌入式执行旁部署 Server、连接 Worker，并仅将新的工作流启动路由到 Server。切换时同时参考[部署模式](/docs/polyglot/deployment-modes)，明确 ID、命令结果、任务语义及运行时归属。

滚动发布 Worker 构建群、排空旧构建群，或回滚时保持长期运行固定在兼容执行器上，请参考 [Worker 兼容性与路由](/docs/polyglot/worker-compatibility-routing)。

需要 `GET /api/cluster/info` 所公开的当前角色词汇、进程类别、权限边界、故障域或迁移路径时，参阅 [Server 角色拓扑](/docs/polyglot/server-role-topology)。

## 快速开始 {#quick-start}

:::info 托管方案

[选择托管运行：Cloud Dev 每小时 $0.075，每月最高 $50，不按工作流收费。](https://cloud.durable-workflow.com/pricing)
配置期间的小时费率按分钟计量，每个使用月份最低 $2，包含 5 GB 存储。
每个运行时以 USD 计价。Dev 没有可用性 SLA。HA 套餐仍在规划中，尚不可配置。

:::

### 已发布镜像与 SQLite {#published-image--sqlite}

无需源码运行 Server 的最快方式是已发布的 Docker 镜像。本示例在容器内使用 SQLite、数据库队列与文件缓存。挂载 `/app/database`，让引导过程和 API 共享同一 SQLite 文件：

```bash
server_image=%%artifact.serverDockerHubImage%%
export DW_AUTH_TOKEN=dev-token

docker volume create durable-workflow-server-quickstart

docker run --rm \
  -v durable-workflow-server-quickstart:/app/database \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$server_image" server-bootstrap

docker rm -f durable-workflow-server durable-workflow-server-queue-worker >/dev/null 2>&1 || true
docker run -d --name durable-workflow-server \
  -p 127.0.0.1:8080:8080 \
  -v durable-workflow-server-quickstart:/app/database \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$server_image"

docker run -d --name durable-workflow-server-queue-worker \
  --health-cmd="server-process-healthcheck worker" \
  -v durable-workflow-server-quickstart:/app/database \
  -e DW_SERVER_PROCESS_CLASS=worker_node \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$server_image" php artisan queue:work database --queue=default --sleep=1 --tries=3

until curl -sf http://localhost:8080/api/ready >/dev/null; do sleep 1; done
curl http://localhost:8080/api/health
curl -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  http://localhost:8080/api/cluster/info \
  | jq '.topology | {current_shape, current_roles, execution_mode}'
```

这会创建默认命名空间，并启动 API 及基础设施队列 Worker。Laravel 队列 `default` 与 SDK 的命名任务队列不同。SDK Worker 停止时，队列 Worker 仍推进持久定时器。调度评估和生产维护还需要下方已发布 Compose 栈的其他角色。

API 绑定回环地址，`dev-token` 只用于此本地练习。远程访问应使用带自有凭据、TLS 和网络访问控制的 Compose 部署。生产演练应使用 MySQL 与共享 Redis。

练习结束后删除这些本地容器和数据库：

```bash
docker rm -f durable-workflow-server durable-workflow-server-queue-worker
docker volume rm durable-workflow-server-quickstart
```

### 已发布镜像与 Compose {#published-image--compose}

需要由 MySQL 与 Redis 支持的、无需源码的多容器栈时，使用已发布的 Compose 制品：

```bash
curl -fsSLO https://raw.githubusercontent.com/durable-workflow/server/main/docker-compose.published.yml

server_image=%%artifact.serverDockerHubImage%%
export DW_AUTH_TOKEN=dev-token

env DW_SERVER_IMAGE="$server_image" docker compose \
  -f docker-compose.published.yml up -d --wait
curl -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  http://localhost:8080/api/cluster/info \
  | jq '.topology | {current_shape, current_roles, execution_mode}'
```

### 端口 {#ports}

| 服务 | 端口 | 用途 |
|---------|------|---------|
| Server API | 8080 | 控制平面与 Worker 协议端点 |
| MySQL | 3306 | 数据库（为开发方便而公开） |
| Redis | 6379 | 缓存和队列（为开发方便而公开） |

## 配置 {#configuration}

Server 使用环境变量配置。以下汇总主要设置，完整运维 `DW_*` 契约见 [Server 配置参考](/docs/polyglot/server-config-reference)。

### 数据库 {#database}

```bash
DB_CONNECTION=mysql
DB_HOST=mysql
DB_PORT=3306
DB_DATABASE=workflow
DB_USERNAME=workflow
DB_PASSWORD=secret
```

支持 MySQL 8.0+、PostgreSQL 13+、SQLite 3.35+。

### 缓存与队列 {#cache-and-queue}

```bash
CACHE_STORE=redis
QUEUE_CONNECTION=redis

REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=null
REDIS_DB=0
```

缓存必须支持[原子锁](https://laravel.com/docs/12.x/cache#atomic-locks)。队列驱动包括 Redis、Amazon SQS、Beanstalkd 和 database。

Server 端[任务队列准入上限](/docs/polyglot/task-queue-admission)及查询任务背压需要原子缓存锁。多节点部署若需在全部 Server 进程间统一执行工作流、活动或查询准入，请使用 Redis。

### 身份验证 {#authentication}

Server 支持三种认证模式：

**令牌认证**（默认）：

```bash
DW_AUTH_DRIVER=token
DW_AUTH_TOKEN=your-secret-token-here
```

所有请求必须发送 `Authorization: Bearer your-secret-token-here`。

最小权限部署应配置角色令牌，而不是共享单一令牌：

```bash
DW_AUTH_DRIVER=token
DW_WORKER_TOKEN=worker-secret
DW_OPERATOR_TOKEN=operator-secret
DW_ADMIN_TOKEN=admin-secret
```

Worker 令牌允许注册、轮询、心跳和完成工作。运维令牌允许启动、列出、发送信号、查询、更新、修复、取消、终止、归档和观察工作流。管理员令牌可访问命名空间、保留管理等管理端点。

**HMAC 签名**：

```bash
DW_AUTH_DRIVER=signature
DW_SIGNATURE_KEY=your-signature-secret
```

请求必须包含 `X-Signature`，计算方式为 `hash_hmac('sha256', request_body, DW_SIGNATURE_KEY)`。Server 也接受角色签名密钥：

```bash
DW_AUTH_DRIVER=signature
DW_WORKER_SIGNATURE_KEY=worker-signature-secret
DW_OPERATOR_SIGNATURE_KEY=operator-signature-secret
DW_ADMIN_SIGNATURE_KEY=admin-signature-secret
```

**无认证**（仅开发）：

```bash
DW_AUTH_DRIVER=none
```

⚠️ **生产环境禁止使用 `none`。** 所有端点将公开可访问。

### Workflow 包 {#workflow-package}

Docker 镜像安装 `durable-workflow/workflow` 包，可如下控制版本：

```bash
# Build-time arg (set in docker-compose.yml or pass to docker build)
WORKFLOW_PACKAGE_REF=v2        # branch, tag, or commit
WORKFLOW_PACKAGE_SOURCE=       # custom Git remote (optional)
```

### 保留 {#retention}

PHP Server 根据命名空间保留策略选择待清理的已关闭运行历史。默认有界时长通过以下值配置：

```bash
DW_HISTORY_RETENTION_DAYS=30
```

每次扫描使用命名空间的**当前**策略。更改时长也影响变更前已关闭的历史，不会从更新日起为每次运行重新计算保留期。

| 策略变化 | 对保留的关闭运行的影响 |
| --- | --- |
| 缩短有界保留 | 旧运行可在下次扫描时符合条件。 |
| 延长有界保留 | 仍保留的运行可能不再符合条件，已清理历史不会恢复。 |
| 改为 `forever` | 扫描不选择运行，显式保留清理也跳过。 |
| 从 `forever` 改回 `bounded` | 必须提供 `retention_days`，已有关闭历史按此时长判断。 |

例如在 **10 月 19 日 12:00 UTC**，**10 月 1 日 12:00 UTC** 关闭的运行已存在 18 天，超出 7 天窗口但仍在 90 天窗口内。从 90 天改为 7 天会立即使其符合条件，后续清理可处理它。扫描采用严格早于比较，恰好处于截止时刻的运行不在该次选择中。

#### 检查保留策略变更 {#review-a-retention-change}

缩短保留期前，应检查关闭时间并保存所需历史。通过[历史导出 API](./server-api-reference.md#workflow-control-plane)导出重要运行，并保留可恢复的数据库及外部载荷备份。重放导出必须保留引用的载荷对象，不能替代数据库和存储备份。

使用管理员凭据更新命名空间：

```bash
curl -sS -X PUT "$DURABLE_WORKFLOW_SERVER_URL/api/namespaces/orders-prod" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"retention_mode":"bounded","retention_days":7}'
```

`forever` 应发送 `{"retention_mode":"forever","retention_days":null}`。恢复有界保留必须显式指定 1 至 365 天的时长。

检查当前命名空间策略及有界的符合清理条件运行列表：

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/system/retention?limit=100" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

`cutoff` 描述当前扫描边界。`expired_run_count` 统计返回的 ID，最多 `scan_limit`，不是整个积压数量。`scan_pressure: true` 表示已达到上限。此读取不删除历史。

更新不是清理预览，也没有宽限期。策略改变后，普通 Worker 心跳即可触发小规模、受节流的保留清理。定时 `history:prune` 和显式系统操作也可处理符合条件的运行。必须在缩短策略**之前**备份并检查。

#### 清理与保护 {#retention-cleanup-and-protections}

不带 `run_ids` 的 `POST /api/system/retention/pass` 按当前策略选择到期运行，最多达到限制。检查响应的 `pruned`、`skipped`、`failed` 及逐运行原因，区分入选与实际删除完成。

:::warning 显式运行 ID 绕过年龄扫描

在 PHP Server 中，指定 `run_ids` 会直接定位这些已关闭运行，包括比当前有界保留窗口更年轻的运行，并不是与到期列表取交集。应把每个目标当作破坏性操作检查；普通按年龄清理请省略 `run_ids`。

:::

保留清理跳过已归档运行与配置为 `forever` 的命名空间。归档只在同一数据库保留历史，并非独立备份。未完成的分离活动等其他保留约束也可阻止删除。应检查返回原因，不要假定选中就已删除。

记录需要超过 1 至 365 天有界窗口时，应选择在数据库保留历史，或维护独立的已验证导出。[长期历史流程](../configuration/pruning-workflows.md#keeping-history-beyond-database-retention)说明 `CloseTime` 选择、分页、外部字节和清理前对账。已发布 API 无取消归档操作，因此归档运行以后也不能通过 Server 保留清理删除。

清理移除历史、相关明细及符合条件的外部载荷，之后延长策略无法恢复。[嵌入式清理指南](../configuration/pruning-workflows.md)描述应用负责的独立流程，其清理 API 不应用 Server 命名空间保留策略。其他运行时应先验证保留行为，再应用此 PHP Server 流程。

当前历史导出保留外部引用，而不是对象的独立副本。[Server #520](https://github.com/durable-workflow/server/issues/520) 请求提供自包含且经过验证的归档流程；导出加校验和并不提供该能力。还应拒绝已清理的历史，不要信任其 `history_complete` 标记；已知的错误完整性问题仍在 [Workflow #856](https://github.com/durable-workflow/workflow/issues/856) 中保持未解决状态。

### 命名空间 {#namespaces}

`server-bootstrap` 执行迁移并初始化 `default` 命名空间。使用 `DW_DEFAULT_NAMESPACE` 更改请求省略命名空间请求头时采用的命名空间：

```bash
DW_DEFAULT_NAMESPACE=default
```

通过 API 创建命名空间：

```bash
curl -X POST http://localhost:8080/api/namespaces \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "production",
    "description": "Production workflows",
    "retention_days": 90
  }'
```

## 健康检查 {#health-checks}

### API 健康状态 {#api-health}

```bash
curl http://localhost:8080/api/health
```

返回 `200 OK` 及以下内容：

```json
{
  "status": "serving",
  "timestamp": "2026-04-15T12:00:00Z",
  "checks": {
    "database": "ok"
  },
  "topology": {
    "schema": "durable-workflow.v2.role-topology",
    "version": 4,
    "current_shape": "standalone_server",
    "current_process_class": "server_http_node",
    "current_roles": ["api_ingress", "control_plane", "matching", "history_projection"],
    "execution_mode": "remote_worker_protocol",
    "matching_role": {
      "queue_wake_enabled": true,
      "shape": "in_worker",
      "wake_owner": "worker_loop",
      "task_dispatch_mode": "poll",
      "partition_primitives": ["connection", "queue", "compatibility", "namespace"],
      "backpressure_model": "lease_ownership",
      "discovery_limits": {
        "poll_batch_cap": 100,
        "availability_ceiling_seconds": 1,
        "wake_signal_ttl_seconds": 60,
        "workflow_task_lease_seconds": 300,
        "activity_task_lease_seconds": 300
      }
    }
  }
}
```

### 公开拓扑摘要 {#public-topology-summary}

无需认证的 `GET /api/health` 与 `GET /api/ready` 都公开响应节点的 `topology` 摘要。此块刻意小于 `/api/cluster/info`，但仍提供控制平面认证或命名空间解析之前识别分角色节点所需的字段：

- `topology.schema`
- `topology.version`
- `topology.current_shape`
- `topology.current_process_class`
- `topology.current_roles`
- `topology.execution_mode`
- `topology.matching_role.queue_wake_enabled`
- `topology.matching_role.shape`
- `topology.matching_role.wake_owner`
- `topology.matching_role.task_dispatch_mode`
- `topology.matching_role.partition_primitives`
- `topology.matching_role.backpressure_model`
- `topology.matching_role.discovery_limits.poll_batch_cap`
- `topology.matching_role.discovery_limits.availability_ceiling_seconds`
- `topology.matching_role.discovery_limits.wake_signal_ttl_seconds`
- `topology.matching_role.discovery_limits.workflow_task_lease_seconds`
- `topology.matching_role.discovery_limits.activity_task_lease_seconds`

`topology.matching_role.discovery_limits` 是编译进 Workflow 包的固定匹配角色数值契约：`poll_batch_cap` 是每次轮询返回的就绪任务行上限；`availability_ceiling_seconds` 是应用于 `available_at` 的跨后端容差，使刚可用任务不受亚秒时间漂移影响；`wake_signal_ttl_seconds` 是 `CacheLongPollWakeStore` 的默认信号 TTL；`workflow_task_lease_seconds` 与 `activity_task_lease_seconds` 是默认工作流和活动任务租约时长。Worker 与下游工具将这些视为权威契约，收紧任何值都属于协议级变更。

部署尚未就绪时，`/api/ready` 也包含同一摘要，因此即使引导阻塞存在，探针仍可区分 `server_http_node`、`scheduler_node`、`matching_node` 与 `execution_node` 响应。

### 就绪状态 {#readiness}

```bash
curl http://localhost:8080/api/ready
```

`/api/ready` 是部署准入门，只有引导前提与发布安全健康处于就绪或警告状态才返回 `200 OK`。

按以下方式解释机器可读字段：

- `checks.migrations.repository_exists` 和 `checks.migrations.pending_migrations` 表明迁移记录库是否存在，以及哪些迁移仍待完成。
- `checks.migrations.adoptable_migrations` 列出只需纳入迁移历史的建表迁移。它是 `warning`，不是安全拒绝式停机，运维可安排采纳时机，Server 保持就绪。
- `checks.migrations.blocking_migrations` 列出允许流量前必须落地的发布安全迁移记录。非空时就绪安全拒绝，`checks.migrations.status = "pending"`。
- `checks.migrations.missing_tables` 报告缺失持久化表；`checks.migrations.operator_surface` 表明 Server 启动后 v2 运维接口是否足以解释发布安全状态。
- `checks.migrations.readiness_contract.version` 固定脚本应解析的启动及迁移采纳契约修订。
- `checks.workflow_v2` 反映全命名空间发布安全判断。暂不能评估时返回 `status: "blocked"` 以及 `blocked_by`、`message` 和 `remediation`，帮助先解决上游就绪门，而不是追逐队列症状。

### 工作流引导准入门 {#workflow-bootstrap-gate}

`checks.workflow_v2.status: "blocked"` 也是路由级准入门，不仅是就绪信号。v2 引导阻塞时，Server 对工作流启动/修改、调度修改、桥接适配器和 Worker 协议路由安全拒绝，返回 HTTP `503` 与机器可读 `reason: "workflow_v2_blocked"`。此门在角色与协议版本检查后、命名空间解析前执行，阻塞请求无法探测命名空间是否存在。

引导门响应始终包含：

- `reason: "workflow_v2_blocked"`：调用方按机器可读名称分支，不依赖说明文本。
- `blocked_by`：有序的上游就绪阻塞项，例如 `migrations`。
- `remediation`：解决阻塞的运维说明，与 `/api/ready` 的 `checks.workflow_v2.remediation` 相同。

受引导门控制的路由类别：

- **工作流启动与修改**：`/api/workflows` 启动、命令及按运行定位的命令路由。
- **调度修改**：`POST /api/schedules`、`PUT /api/schedules/{scheduleId}`、`DELETE /api/schedules/{scheduleId}`、`POST /api/schedules/{scheduleId}/pause`、`POST /api/schedules/{scheduleId}/resume`、`POST /api/schedules/{scheduleId}/trigger` 和 `POST /api/schedules/{scheduleId}/backfill`。
- **桥接适配器**：`POST /api/bridge-adapters/webhook/{adapter}`。
- **Worker 协议**：所有 `/api/worker` 和 `/api/worker/*` 路由，包括注册、心跳、工作流任务、查询任务和活动任务操作。Worker 路由使用 Worker 协议信封返回引导门载荷，并保留 `X-Durable-Workflow-Protocol-Version` 请求头，使 SDK 可按与控制平面相同的 `reason: "workflow_v2_blocked"` 分支。

调度**读取**有意豁免，以便恢复期间检查状态：`GET /api/schedules`、`GET /api/schedules/{scheduleId}` 和 `GET /api/schedules/{scheduleId}/history` 在引导门阻塞其他路由时仍可访问。

### Server 能力 {#server-capabilities}

```bash
curl http://localhost:8080/api/cluster/info \
  -H "Authorization: Bearer $TOKEN"
```

返回 Server 构建版本、支持的 SDK 版本、引擎能力、客户端兼容性策略，以及独立版本管理的控制平面和 Worker 协议清单：

```json
{
  "server_id": "server-1",
  "version": "2.0.0",
  "default_namespace": "default",
  "supported_sdk_versions": {
    "php": ">=1.0",
    "python": ">=0.2,<1.0",
    "cli": ">=0.1,<1.0"
  },
  "client_compatibility": {
    "schema": "durable-workflow.v2.client-compatibility",
    "version": 1,
    "authority": "protocol_manifests",
    "top_level_version_role": "informational",
    "fail_closed": true
  },
  "capabilities": {
    "workflow_tasks": true,
    "activity_tasks": true,
    "signals": true,
    "queries": true,
    "updates": true,
    "schedules": true,
    "child_workflow_retry_policy": true,
    "child_workflow_timeouts": true,
    "payload_codecs": ["avro"],
    "response_compression": ["gzip", "deflate"]
  },
  "control_plane": {
    "version": "2",
    "header": "X-Durable-Workflow-Control-Plane-Version",
    "request_contract": { "schema": "durable-workflow.v2.control-plane-request.contract", "version": 1, "...": "..." },
    "response_contract": { "schema": "durable-workflow.v2.control-plane-response.contract", "version": 1, "...": "..." }
  },
  "worker_protocol": {
    "version": "1.0",
    "server_capabilities": {
      "long_poll_timeout": 30,
      "supported_workflow_task_commands": [
        "complete_workflow",
        "fail_workflow",
        "continue_as_new",
        "schedule_activity",
        "start_timer",
        "start_child_workflow"
      ],
      "workflow_task_poll_request_idempotency": true,
      "poll_status": true,
      "history_page_size_default": 500,
      "history_page_size_max": 1000,
      "activity_retry_policy": true,
      "activity_timeouts": true,
      "child_workflow_retry_policy": true,
      "child_workflow_timeouts": true,
      "parent_close_policy": true,
      "non_retryable_failures": true,
      "response_compression": ["gzip", "deflate"],
      "history_compression": {
        "supported_encodings": ["gzip"],
        "compression_threshold": 8192
      }
    }
  }
}
```

以 `client_compatibility.authority: "protocol_manifests"` 作为客户端检查规则。顶层 `version` 是构建标识；CLI 和 SDK 遇到缺失或不支持的 `control_plane.version`、`control_plane.request_contract`、`worker_protocol.version` 应安全拒绝。

### 角色拓扑与部署形态 {#role-topology-and-deployment-shape}

逐字段说明见 [Server 角色拓扑](/docs/polyglot/server-role-topology)。本节保留内联 `cluster/info` 示例；需要统一查阅支持的形态、权限边界、故障域、扩缩边界或迁移契约时，请使用专页。

`GET /api/cluster/info` 也公开 `topology` 清单。它是响应节点的机器可读角色映射，让运维与自动化读取统一契约，而不从容器名称或发布手册猜测节点职责。

```json
{
  "topology": {
    "schema": "durable-workflow.v2.role-topology",
    "version": 2,
    "supported_shapes": [
      "embedded",
      "standalone_server",
      "split_control_execution"
    ],
    "role_vocabulary": [
      "api_ingress",
      "control_plane",
      "matching",
      "history_projection",
      "scheduler",
      "execution_plane"
    ],
    "current_shape": "standalone_server",
    "current_process_class": "server_http_node",
    "current_roles": [
      "api_ingress",
      "control_plane",
      "matching",
      "history_projection"
    ],
    "execution_mode": "remote_worker_protocol",
    "matching_role": {
      "queue_wake_enabled": true,
      "shape": "in_worker",
      "wake_owner": "worker_loop",
      "task_dispatch_mode": "poll",
      "partition_primitives": [
        "connection",
        "queue",
        "compatibility",
        "namespace"
      ],
      "backpressure_model": "lease_ownership",
      "discovery_limits": {
        "poll_batch_cap": 100,
        "availability_ceiling_seconds": 1,
        "wake_signal_ttl_seconds": 60,
        "workflow_task_lease_seconds": 300,
        "activity_task_lease_seconds": 300
      }
    },
    "shape_assignments": {
      "embedded": {
        "process_classes": [
          {
            "name": "application_process",
            "roles": [
              "control_plane",
              "matching",
              "history_projection",
              "scheduler",
              "execution_plane"
            ]
          }
        ]
      },
      "standalone_server": {
        "process_classes": [
          {
            "name": "server_http_node",
            "roles": [
              "api_ingress",
              "control_plane",
              "matching",
              "history_projection"
            ]
          },
          {
            "name": "scheduler_node",
            "roles": ["scheduler"]
          },
          {
            "name": "worker_node",
            "roles": ["execution_plane"]
          }
        ]
      },
      "split_control_execution": {
        "process_classes": [
          {
            "name": "ingress_node",
            "roles": ["api_ingress"]
          },
          {
            "name": "control_plane_node",
            "roles": ["control_plane", "history_projection"]
          },
          {
            "name": "scheduler_node",
            "roles": ["scheduler"]
          },
          {
            "name": "matching_node",
            "roles": ["matching"]
          },
          {
            "name": "execution_node",
            "roles": ["execution_plane"]
          }
        ]
      }
    },
    "authority_boundaries": {
      "control_plane": {
        "writes": [
          "workflow_instances",
          "workflow_runs.status",
          "workflow_tasks.lifecycle"
        ]
      },
      "execution_plane": {
        "writes": [
          "workflow_tasks.outcomes",
          "activity_attempts",
          "worker_compatibility_heartbeats"
        ]
      },
      "matching": {
        "writes": [
          "workflow_tasks.leases",
          "activity_tasks.leases"
        ]
      },
      "history_projection": {
        "writes": [
          "history_events",
          "workflow_run_summaries",
          "workflow_history_exports"
        ]
      },
      "scheduler": {
        "writes": [
          "workflow_schedules.fire_state",
          "workflow_starts.scheduled"
        ]
      },
      "api_ingress": {
        "writes": ["worker_registrations"]
      }
    },
   "failure_domains": {
      "control_plane_down": {
        "effect": "workers_continue_claimed_tasks_only_until_lease_expiry",
        "operator_signal": "operator_commands_fail_fast"
      },
      "execution_plane_down": {
        "effect": "ready_tasks_accumulate_without_loss",
        "operator_signal": "operators_see_ready_depth_growth"
      },
      "matching_down": {
        "effect": "claim_falls_back_to_direct_ready_task_discovery",
        "operator_signal": "ready_depth_rises_while_claim_rate_falls"
      },
      "history_projection_down": {
        "effect": "projection_reads_may_stale_while_durable_writes_continue",
        "operator_signal": "projection_lag_seconds_may_increase"
      },
      "scheduler_down": {
        "effect": "scheduled_workflows_stop_firing_and_record_missed_runs",
        "operator_signal": "operators_see_missed_schedule_state"
      },
      "api_ingress_down": {
        "effect": "external_http_traffic_stops_at_the_edge",
        "operator_signal": "embedded_in_process_calls_may_continue"
      }
    },
    "scaling_boundaries": {
      "api_ingress": "incoming_http_request_rate",
      "control_plane": "operator_commands_and_run_lifecycle_transitions",
      "matching": "ready_task_rate_and_poller_count",
      "history_projection": "durable_event_rate",
      "scheduler": "active_schedule_count",
      "execution_plane": "workflow_and_activity_task_rate"
    },
    "migration_path": [
      {
        "step": "audit_role_boundaries",
        "result": "tooling flags cross-role writes before runtime shape changes",
        "reversible": true
      },
      {
        "step": "expose_role_bindings",
        "result": "container seams allow out-of-process adapters without patching the package",
        "reversible": true
      },
      {
        "step": "introduce_dedicated_matching_shape",
        "result": "matching can run as its own process class without changing the claim contract",
        "reversible": true
      },
      {
        "step": "split_history_projection",
        "result": "history and projections can move out of process without introducing a second writer",
        "reversible": true
      },
      {
        "step": "split_scheduler",
        "result": "schedule firing can move behind leader election while single-replica deployments stay legal",
        "reversible": true
      },
      {
        "step": "optional_execution_partitioning",
        "result": "workers can partition by namespace, connection, queue, and compatibility",
        "reversible": true
      }
    ],
    "kernel_invariants": [
      {
        "id": "single_persistence_engine",
        "summary": "one workflow database backs every topology shape; role split does not introduce a second persistence engine",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "single_worker_protocol",
        "summary": "one HTTP worker protocol carries claim, complete, fail, and heartbeat traffic across every topology; role split does not fork the worker contract",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "single_history_writer",
        "summary": "history_events has exactly one durable writer per logical event regardless of where the history/projection role runs",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "single_control_authority_per_run",
        "summary": "every mutation of a given workflow run routes through one control-plane authority; per-run row locks serialise transitions across replicas",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "embedded_topology_remains_supported",
        "summary": "the embedded shape where one process fills every role MUST stay legal; existing embedded hosts are never forced to migrate",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "role_split_is_topology_only",
        "summary": "splitting roles is a topology change, not a product fork; collapsing the roles back onto a single process is always a legal topology",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      }
    ]
  },
  "coordination_health": {
    "schema": "durable-workflow.v2.coordination-health.contract",
    "version": 2,
    "namespace_scope": "all_namespaces",
    "status": "ok",
    "http_status": 200,
    "warning_checks": [],
    "error_checks": [],
    "categories": {
      "correctness": "ok"
    },
    "checks": [
      {
        "name": "worker_compatibility",
        "status": "ok",
        "category": "correctness",
        "message": null
      },
      {
        "name": "activity_path",
        "status": "ok",
        "category": "correctness",
        "message": null
      }
    ],
    "routing_drains": {
      "queues_with_drains": 0,
      "draining_build_id_count": 0,
      "active_worker_count": 0,
      "draining_worker_count": 0,
      "stale_worker_count": 0,
      "queues": []
    }
  }
}
```

`topology.version` 是角色清单模式版本，不等于顶层 Server 构建版本。自动化假定新版字段存在前应先检查它。当前契约包含 `supported_shapes`、`role_vocabulary`、`current_shape`、`current_process_class`、`current_roles`、`execution_mode`、`matching_role`、`role_catalog`、`shape_assignments`、`authority_boundaries`、`authority_surfaces`、`failure_domains`、`supported_topologies`、`scaling_boundaries`、`migration_path` 和 `kernel_invariants`。

各字段含义如下：

- `supported_shapes` 列出合法产品拓扑。
- `role_vocabulary` 是固定的 v2 角色名称，自动化与诊断应使用此规范词汇。
- `current_shape`、`current_process_class` 和 `current_roles` 描述刚查询的节点。以 `current_process_class` 为声明身份，并与当前形态的 `shape_assignments` 角色组合核对。
- `execution_mode` 区分嵌入式本地队列执行（`local_queue_worker`）与独立 Server Worker 协议执行（`remote_worker_protocol`）。
- `matching_role.queue_wake_enabled`、`matching_role.shape`、`matching_role.wake_owner`、`matching_role.task_dispatch_mode`、`matching_role.partition_primitives` 和 `matching_role.backpressure_model` 表明节点是继续在 Worker 内唤醒，还是由专用修复/匹配循环负责扫描，以及稳定路由轴和当前持久化准入边界。
- `matching_role.discovery_limits` 固定包编译的数值契约：`poll_batch_cap` 为每轮就绪行上限，`availability_ceiling_seconds` 为应用于 `available_at` 的跨后端亚秒漂移容差，`wake_signal_ttl_seconds` 为唤醒信号默认 TTL，`workflow_task_lease_seconds` 与 `activity_task_lease_seconds` 为默认租约。运维无需搜索源码即可核对部署；收紧任何值属于协议变更。
- `role_catalog` 和 `authority_surfaces` 表明当前清单版本中各角色拥有的接口与持久化修改路径。
- `shape_assignments` 将支持形态映射到允许的进程类别及角色组合。
- `supported_topologies` 汇总支持的部署家族及其期望节点类别。
- `authority_boundaries` 指定各角色应修改的持久化写入接口，帮助拆分前发现跨角色偏差。
- `failure_domains` 明确角色宕机时最先可见的运维降级信号。
- `scaling_boundaries` 指定角色拆分后的主要负载维度。
- 经过认证的托管路由若节点没有所需 HTTP 控制接口则安全拒绝，返回 `503`、`reason: "topology_role_unavailable"` 以及 `current_shape`、`current_process_class`、`current_roles`、`required_roles` 和 `missing_roles`，以便调用方重路由到实际提供接口的节点。
- `coordination_health` 是同一发现调用发布的集群级发布安全摘要。它使用 `all_namespaces` 范围，汇总当前状态、HTTP 行为以及也用于就绪的规范化警告/错误检查名。上游就绪阻塞评估时，附带 `blocked_by`、`message` 和 `remediation`。
- `coordination_health.checks[]` 始终将固定检查 `activity_path` 与 `worker_compatibility`、`task_transport`、`routing_health`、`durable_resume_paths` 及投影/调度器检查一同返回。`activity_path` 是活动侧的 `task_transport`：用 `timeout_overdue`、`oldest_timeout_overdue_at`、`max_timeout_overdue_age_ms` 显示尚未执行的调度到开始、开始到关闭、调度到关闭或心跳超时，用 `retrying`、`oldest_retrying_started_at`、`max_retrying_age_ms` 显示持续重试积压。重命名属于协议变更。
- `coordination_health.routing_drains` 汇总跨队列与命名空间的排空构建群。`queues_with_drains` 大于零表示集群正有意避开至少一个排空群。
- `migration_path` 按顺序列出从现有独立发行版走向更隔离角色边界的步骤，不引入第二引擎。每项 `reversible: true` 表示退回较少隔离的形态仍是合法拓扑。
- `kernel_invariants` 列出角色拆分必须保留的 `single_persistence_engine`、`single_worker_protocol`、`single_history_writer`、`single_control_authority_per_run`、`embedded_topology_remains_supported` 和 `role_split_is_topology_only`。各项 `applies_to` 指明适用形态；自动化可在变更前用它验证内核不变量。

角色拆分仍是拓扑变化，不是第二引擎或独立控制平面 API。从 `standalone_server` 演进到明确的 `split_control_execution` 时，运维仍读取相同发现接口。`current_shape`、`current_roles`、`execution_mode`、`matching_role`、`shape_assignments`、`authority_boundaries`、`failure_domains`、`scaling_boundaries` 与 `migration_path` 作为同一清单版本管理，使发布工具理解实际 Server 的统一拓扑。

同一约束也通过 `topology.kernel_invariants` 机器可读地呈现，使自动化在应用拓扑变更前确认没有引入第二持久化引擎、分叉 Worker 协议、第二历史写入者或不可逆迁移。

托管路由门只适用于经过认证的 API 与 Worker 端点。即使 `scheduler_node`、`matching_node` 或 `execution_node` 不提供当前 HTTP 控制接口，`GET /api/health`、`GET /api/ready` 与经过认证的 `GET /api/cluster/info` 仍可用于发现、存活及拓扑检查。

对于载体中立的外部处理程序，同一端点公开 `worker_protocol.external_execution_surface_contract`。该清单命名[活动级外部执行接口](/docs/polyglot/external-execution)，链接外部任务输入/结果信封契约，并将工作流重放、`ContinueAsNew`、信号/更新/查询排序和事件历史解释保留在真正运行时内。

客户端代码的主要字段说明：

- 应用版本字段是 `version`，不是 `server_version`。
- 工作流任务命令能力位于 `worker_protocol.server_capabilities.supported_workflow_task_commands`，不在 `worker_protocol` 顶层。同一嵌套对象也通过每次 Worker 响应的 `server_capabilities` 返回。
- `worker_protocol.server_capabilities.poll_status` 表示即使未租出任务，轮询响应也保留机器可读 `poll_status`，让 Worker 无需解析说明文本即可区分 `empty`、`throttled`、`unavailable` 和 `draining`。
- 重试策略、超时字段、父关闭策略、不可重试失败等命令选项能力也在 `server_capabilities` 中回传，Worker 无需单独 cluster-info 请求即可协商。
- 唯一 v2 载荷编解码器位于 `capabilities.payload_codecs`，列表严格为 `['avro']`。PHP 专用 v1 导入/排空序列化属于内部迁移机制，不出现在运行时能力中。

## 连接 Worker {#connecting-workers}

Worker 轮询 Server 获取任务，执行工作流代码或活动。完整契约见 [Worker 协议](/docs/polyglot/worker-protocol)。路由角色矩阵、命名空间查找规则及准确注册载荷见[命名空间、认证与 Worker 注册](/docs/polyglot/namespace-auth-workers)。

### PHP Worker {#php-workers}

框架中立的 PHP 应用和远程 Worker 使用独立 Server SDK，无需安装 Laravel 或嵌入式 Workflow 包：

<!-- docs-example id="server.php-sdk.install" -->
```bash
composer require %%artifact.phpSdkComposerPackage%%
```

创建客户端，并向 Worker 注册工作流或活动 callable：

```php
use DurableWorkflow\Client;
use DurableWorkflow\Worker;
use DurableWorkflow\Worker\WorkflowContext;

$client = new Client(
    'http://localhost:8080',
    token: getenv('DURABLE_WORKFLOW_AUTH_TOKEN') ?: null,
    namespace: 'default',
);

$worker = new Worker($client, taskQueue: 'polyglot-php');
$worker->registerWorkflow(
    'invoice',
    static function (WorkflowContext $context, string $invoiceId): array {
        $context->activity('charge-card', [$invoiceId]);

        return ['invoice_id' => $invoiceId, 'status' => 'paid'];
    },
);
$worker->run();
```

客户端、认证、载荷及 Worker 生命周期见 [PHP SDK 指南](/docs/polyglot/php/)。独立的 `durable-workflow/workflow` 包是嵌入式 Laravel 运行时，也是已发布 Server 镜像中的引擎。嵌入式 Laravel 工作流通过应用队列 Worker 执行包内本地任务，不需要此独立 Server。

### Python Worker {#python-workers}

Python Worker 使用 `durable-workflow` SDK：

```bash
pip install %%artifact.pythonPackagePin%%
```

Worker 设置见 [Python SDK](/docs/polyglot/python) 指南。

### 自定义语言 Worker {#custom-language-workers}

任何语言都可以按以下步骤实现 Worker：
1. 使用 `POST /api/worker/register` 注册
2. 使用 `POST /api/worker/workflow-tasks/poll`、`POST /api/worker/activity-tasks/poll` 或 `POST /api/worker/query-tasks/poll` 长轮询任务
3. 使用 `POST /api/worker/workflow-tasks/{id}/complete`、`POST /api/worker/activity-tasks/{id}/complete` 或 `POST /api/worker/query-tasks/{id}/complete` 完成任务

所有请求都需要：
- `Authorization: Bearer $TOKEN`
- `X-Namespace: your-namespace`
- `X-Durable-Workflow-Protocol-Version: 1.0`

Server 验证命名空间是否存在。连接 Worker 或客户端之前，先用 `POST /api/namespaces` 注册，否则返回 `404` 和 `reason: "namespace_not_found"`。

curl 操作流程见 [Server README](https://github.com/durable-workflow/server#getting-started-end-to-end-workflow)。

调整 Worker 注册槽位、Server 有效租约上限、每分钟分派预算和查询任务背压，请参阅[任务队列准入](/docs/polyglot/task-queue-admission)。

## CLI {#cli}

[Durable Workflow CLI](/docs/polyglot/cli) 提供 Server 的 shell 接口：

```bash
# Install — Linux and macOS
curl -fsSL https://durable-workflow.com/install.sh | sh

# Install — macOS (Homebrew alternative)
brew install durable-workflow/tap/dw

# Install — Windows (PowerShell)
# irm https://durable-workflow.com/install.ps1 | iex

# Configure
export DURABLE_WORKFLOW_SERVER_URL=http://localhost:8080
export DURABLE_WORKFLOW_AUTH_TOKEN=your-token
export DURABLE_WORKFLOW_NAMESPACE=default

# Use
dw server:health
dw workflow:list
dw workflow:start --type=my-workflow --input='["value"]'
dw workflow:start --type=my-workflow --input-file=input.json
```

自动识别平台的安装器与直接二进制下载见 [CLI 安装页](/docs/polyglot/cli#install)。

任务队列命令包含工作流任务、活动任务和查询任务的准入状态，可区分缺少 Worker、槽位饱和、Server 有效租约或分派速率节流，以及查询溢出。

## 部署 {#deployment}

生产部署前，请使用[自托管部署指南](/docs/deployment)选择支持的拓扑。该指南区分本地开发、单节点生产、小集群、原始 Kubernetes 清单及由支持团队协助的拓扑。

自助小集群契约刻意限制为：负载均衡后 2 至 3 个无状态 API 节点、一个共享外部 MySQL 或 PostgreSQL、共享 Redis、独立扩缩的 Worker，以及恰好一个调度器或维护进程。每个版本选择全停升级或[滚动升级](/docs/rolling-upgrades)，后者必须满足版本差、模式、排空、就绪和回滚契约。SQLite 集群、无 Redis 多节点、重复调度器、active/active 多区域和提供方特定故障转移，未经单独验证均不在此契约内。独立版本的 Helm 路径见[部署指南](/docs/deployment#helm-chart-for-kubernetes)。[active/passive 多区域内容](/docs/deployment#activepassive-multi-region)属于支持团队协助评估，并非已验证的自助 2.0 契约；候选区域仍须从文档中的单区域或小集群形态开始。

自托管 Server 应从已发布镜像开始，而非源码树构建：

- Docker Hub：`%%artifact.serverDockerHubImage%%`
- GitHub Container Registry：`%%artifact.serverGhcrImage%%`
- 已发布镜像 Compose：[`docker-compose.published.yml`](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml)
- 原始 Kubernetes 清单：[`k8s/`](https://github.com/durable-workflow/server/tree/main/k8s)

生产部署应固定版本标签或镜像摘要、使用角色凭据、提供流量前先运行引导/迁移，并通过 `/api/ready`、`/api/cluster/info` 与 Worker 注册证明就绪。不要仅依据 `/api/health` 切换生产流量。

## API 参考 {#api-reference}

完整逐端点说明，包括必需请求头、角色、Worker 协议路由、外部载荷存储路由及错误原因名，参阅 [Server API 参考](/docs/polyglot/server-api-reference)。

Server 提供三个 API 接口类别：

### 控制平面 {#control-plane}

启动、描述、发送信号、查询、更新、取消和终止工作流，并管理命名空间、任务队列、调度、搜索属性和 Worker。每个控制平面请求必须包含 `X-Durable-Workflow-Control-Plane-Version: 2`，缺失则以 `missing_control_plane_version` 拒绝。

主要端点：

- `POST /api/workflows`：启动工作流
- `GET /api/workflows/{id}`：描述工作流
- `POST /api/workflows/{id}/signal/{name}`：发送信号
- `POST /api/workflows/{id}/query/{name}`：执行查询
- `POST /api/workflows/{id}/update/{name}`：执行更新
- `POST /api/workflows/{id}/cancel`：立即以取消状态关闭
- `POST /api/workflows/{id}/terminate`：立即终止
- `GET /api/workflows/{id}/runs/{runId}/history`：列出历史事件
- `GET /api/workflows/{id}/runs/{runId}/history/export`：导出重放包
- `GET /api/namespaces`、`POST /api/namespaces`、`GET|PUT /api/namespaces/{namespace}`：命名空间管理
- `GET /api/workers`、`GET|DELETE /api/workers/{id}`：Worker 集群管理
- `GET /api/task-queues`、`GET /api/task-queues/{taskQueue}`：队列积压、轮询者、租约和准入可见性
- `GET|POST /api/schedules`、`GET|PUT|DELETE /api/schedules/{id}`、`POST /api/schedules/{id}/{pause|resume|trigger|backfill}`：调度管理
- `GET|POST|DELETE /api/search-attributes`：搜索属性管理
- `GET|POST|PUT|DELETE /api/service-endpoints...`：管理员专用服务目录端点、嵌套服务、操作绑定和持久服务调用快照
- `POST /api/system/repair/pass`、`POST /api/system/activity-timeouts/pass`、`POST /api/system/retention/pass`：运维清理轮次

工作流控制平面响应（包括历史列表）包含嵌套 `control_plane` 元数据，标识操作与响应契约版本。历史导出刻意不包裹此信封，直接返回重放包，使完整性校验和及可选签名覆盖客户端接收的准确产物。

验证失败返回 HTTP 422、`reason: validation_failed`、`errors` 与 `validation_errors`。工作流操作也将原因与明细投影到 `control_plane.reason` 及 `control_plane.validation_errors`。当前按运行命令在响应和 `control_plane.run_id` 返回 URL 的 `run_id`，以区分实例级和显式选定运行命令。

任务队列可见性用于判断落后是因为持久化积压增长、Worker 缺少空闲槽位，还是 Server 准入限制。`GET /api/task-queues` 返回每队列摘要，`GET /api/task-queues/{taskQueue}` 展开 `pollers` 与 `current_leases`。两者均提供 `stats.approximate_backlog_count`、`stats.approximate_backlog_age_seconds` 以及按类型的 `stats.workflow_tasks.*` / `stats.activity_tasks.*` 就绪与租约计数。详情还包括 `admission`，便于区分 Worker 容量压力与 Server 队列/查询节流。集群级流入与分派率见 `operator_metrics.backlog.tasks_added_last_minute` 和 `operator_metrics.backlog.tasks_dispatched_last_minute`，单队列对比使用 `stats.tasks_added_last_minute` 与 `stats.tasks_dispatched_last_minute`。

### Worker 协议 {#worker-protocol}

Worker 注册、轮询、发送心跳并完成任务，需要 `X-Durable-Workflow-Protocol-Version: 1.0`。

主要端点：

- `POST /api/worker/register`：注册 Worker
- `POST /api/worker/workflow-tasks/poll`：长轮询工作流任务
- `POST /api/worker/workflow-tasks/{id}/complete`：完成工作流任务
- `POST /api/worker/query-tasks/poll`：长轮询 Server 路由的工作流查询任务
- `POST /api/worker/query-tasks/{id}/complete`：完成查询任务
- `POST /api/worker/query-tasks/{id}/fail`：失败或拒绝查询任务
- `POST /api/worker/activity-tasks/poll`：长轮询活动任务
- `POST /api/worker/activity-tasks/{id}/complete`：完成活动任务

详见 [Worker 协议](/docs/polyglot/worker-protocol)。

### 发现（无版本） {#discovery-unversioned}

唯一**无需** `X-Durable-Workflow-Control-Plane-Version` 的端点是发现和健康探针：

- `GET /api/health`：存活探针与公开 `topology` 摘要（无需认证）
- `GET /api/ready`：就绪探针及同一 `topology` 摘要（无需认证）
- `GET /api/cluster/info`：Server 能力、协议版本和唯一 Avro 载荷编解码器。客户端应先访问此端点，发现支持的控制平面与 Worker 协议版本。

## 故障排查 {#troubleshooting}

### Worker 未收到任务 {#workers-not-receiving-tasks}

**检查：**
1. Worker 已注册？ `curl http://localhost:8080/api/workers -H "Authorization: Bearer $TOKEN" -H "X-Durable-Workflow-Control-Plane-Version: 2" -H "X-Namespace: default"`
2. Worker 是否轮询正确任务队列？
3. 工作流是否使用匹配的任务队列启动？
4. Server 实例之间是否共享缓存后端？

### 长轮询连接立即超时 {#long-poll-connections-timing-out-immediately}

**检查：**
1. 缓存驱动是否支持原子锁？用 `php artisan workflow:v2:doctor --strict` 验证。
2. Server 能否连接 Redis？
3. 负载均衡超时是否高于长轮询超时（默认 60 秒）？

### 数据库连接错误 {#database-connection-errors}

**检查：**
1. 数据库主机和端口正确吗？
2. 凭据有效吗？
3. 数据库存在吗？
4. 是否执行迁移？ `php artisan migrate:status`

### 身份验证失败 {#auth-failures}

**检查：**
1. `DW_AUTH_DRIVER` 与客户端认证方式匹配吗？
2. Server 与客户端的令牌/HMAC 密钥是否相同？
3. 是否发送 `Authorization: Bearer $TOKEN` 或 HMAC 签名请求头？

## 了解更多 {#learn-more}

- [Worker 协议参考](/docs/polyglot/worker-protocol)：完整 Worker API 契约
- [嵌入式迁移到 Server](/docs/polyglot/embedded-to-server)：从 Laravel 嵌入式 v2 应用迁移
- [Python SDK](/docs/polyglot/python)：构建 Python Worker
- [CLI](/docs/polyglot/cli)：命令行接口
- [Server 仓库](https://github.com/durable-workflow/server)：源码、问题和发布
