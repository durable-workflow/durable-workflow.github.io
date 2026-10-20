---
sidebar_position: 4
title: 命名空间、认证与 Worker 注册
description: Server 命名空间解析、角色限定认证及 Worker 注册契约参考。
tags:
  - server
  - namespaces
  - authentication
  - worker-protocol
keywords:
  - Durable Workflow 命名空间认证
  - 角色限定 Server 令牌
  - Worker 注册契约
  - X-Namespace
---

# 命名空间、认证与 Worker 注册 {#namespace-auth-and-worker-registration}

配置独立 Server、签发自动化凭据或实现 Worker 运行时时，请使用本参考。Server 有三个独立契约，必须一致才能执行工作：

- 请求通过 `X-Namespace`、`?namespace=` 或 Server 默认命名空间指定命名空间
- 凭据具有路由族要求的角色
- Worker 注册的命名空间、任务队列、运行时、类型键及容量，与工作流启动和任务轮询使用的内容一致

## 请求权限依据 {#request-authority}

Durable Workflow 将命名空间、认证角色和协议版本作为请求权限依据。不要从工作流 ID、任务 ID 或显示标签推断这些信息。

| 请求族 | 所需凭据角色 | 所需版本头 | 命名空间来源 |
| --- | --- | --- | --- |
| 发现 `GET /api/cluster/info` | `worker`、`operator` 或 `admin` | 无 | 可选 `X-Namespace` 提供上下文 |
| 命名空间列表/描述 | `operator` 或 `admin` | `X-Durable-Workflow-Control-Plane-Version: 2` | 路由目标或请求上下文 |
| 命名空间创建/更新/存储策略 | `admin` | `X-Durable-Workflow-Control-Plane-Version: 2` | 路由目标或请求体 |
| 工作流、计划、任务队列、桥接适配器、Worker 可见性 | `operator` 或 `admin` | `X-Durable-Workflow-Control-Plane-Version: 2` | 依次使用 `X-Namespace`、`?namespace=`、默认值 |
| 系统健康、指标、维护轮次及存储测试 | `admin` | `X-Durable-Workflow-Control-Plane-Version: 2` | 依次使用 `X-Namespace`、`?namespace=`、默认值 |
| Worker 注册、轮询、心跳、完成 | `worker` | `X-Durable-Workflow-Protocol-Version: 1.0` | 依次使用 `X-Namespace`、`?namespace=`、默认值 |

在有角色限制的端点上，Server 先检查路由角色，再检查命名空间是否存在。角色不符的令牌收到认证失败，不会获知命名空间是否存在。角色和版本检查通过后，命名空间作用域的路由以 `reason: "namespace_not_found"` 拒绝未知命名空间。

## 认证角色 {#auth-roles}

令牌认证是默认的生产路径：

```bash
DW_AUTH_DRIVER=token
DW_WORKER_TOKEN=worker-secret
DW_OPERATOR_TOKEN=operator-secret
DW_ADMIN_TOKEN=admin-secret
```

如果部署使用一个共享的 `DW_AUTH_TOKEN`，该令牌实际上拥有全部路由权限。生产环境应优先使用角色限定令牌，防止 Worker 进程修改命名空间或执行系统维护轮次。

签名认证也有相同的角色划分：

```bash
DW_AUTH_DRIVER=signature
DW_WORKER_SIGNATURE_KEY=worker-signature-secret
DW_OPERATOR_SIGNATURE_KEY=operator-signature-secret
DW_ADMIN_SIGNATURE_KEY=admin-signature-secret
```

`DW_AUTH_DRIVER=none` 仅用于本地开发。它移除所有路由的认证边界，绝不能暴露到可信本地网络之外。

## 信号授权与归属 {#signal-authorization-and-attribution}

接纳信号前，Server 对请求进行认证，并强制执行配置的角色及命名空间策略。工作流信号路由要求 `operator` 或 `admin` 凭据。这些路由权限不实现应用的订单审批策略。请在转发信号前，由可信应用网关或受支持的自定义认证提供器执行该业务决策。如果最终用户不能直接发送信号，请将高权限 Server 凭据保留在该可信边界内。

Server 从已认证的凭据派生命令的 `principal`。`approvedBy` 等信号参数仍是应用数据，即使其拼写与参与者主体相同。使用单一服务令牌的网关记录的是该服务的主体，不一定是请求背后的人。任何人工审批字段都应从网关已认证用户及授权决定中派生，不应直接接受客户端提供的值。

为了审计检查，命令响应及关联的命令/历史元数据提供已记录的主体。持久化命令将它存储在 `context.principal` 下；它与信号参数，以及工作流具名信号等待所返回的值相互独立。缺少主体元数据不能证明某个特定发送者。Laravel 策略检查及宿主端命令上下文见[嵌入式信号示例](/docs/features/signals#sender-identity-and-authorization)。

审计轨迹需要稳定的参与者主体时，请使用[具名主体令牌](/docs/polyglot/server-config-reference#authentication)。共享角色令牌不能标识单个应用用户，禁用认证的开发模式也不提供经过认证的人类身份。转发的调用方/认证归属头可以添加配置的审计标签，但不提供经 Server 认证的主体。除非满足[可信网关要求](/docs/polyglot/server-config-reference#command-attribution)，否则保持禁用转发归属信息。

## 命名空间契约 {#namespace-contract}

引导过程创建默认命名空间。如果省略命名空间头时应解析到 `default` 以外的命名空间，请设置 `DW_DEFAULT_NAMESPACE`：

```bash
DW_DEFAULT_NAMESPACE=default
```

将客户端或 Worker 指向租户或环境命名空间之前，先创建该命名空间：

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/namespaces" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "orders-prod",
    "description": "production order workflows",
    "retention_days": 90
  }'
```

命名空间名称会规范化为小写，可以包含字母、数字、点、下划线和连字符。规范化后名称必须唯一。例如先创建 `Production` 再创建 `production`，会产生 `reason: "namespace_already_exists"` 冲突。

普通工作流启动通过 `X-Namespace` 指定命名空间：

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/workflows" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_type": "orders.fulfillment",
    "workflow_id": "order-1001",
    "task_queue": "orders",
    "input": ["order-1001"]
  }'
```

控制平面读取、工作流命令、计划操作、搜索属性操作、任务队列可见性及 Worker 可见性使用相同的命名空间上下文。命名空间管理路由本身是例外：它们以路由或请求体中的命名空间为目标，不要求命名空间在执行创建或描述之前已存在。

## Worker 注册契约 {#worker-registration-contract}

每个 Worker 进程必须先注册再轮询。注册有命名空间作用域，因此元组 `(namespace, worker_id)` 标识 Worker 记录。已注册的 `task_queue` 必须与该 Worker ID 后续轮询请求一致。

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/worker/register" \
  -H "Authorization: Bearer $DW_WORKER_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Protocol-Version: 1.0" \
  -H "Content-Type: application/json" \
  -d '{
    "worker_id": "py-orders-1",
    "task_queue": "orders",
    "runtime": "python",
    "sdk_version": "<installed-sdk-version>",
    "build_id": "orders-worker-2026-04-22",
    "supported_workflow_types": ["orders.fulfillment"],
    "workflow_definition_fingerprints": {
      "orders.fulfillment": "sha256:definition-fingerprint"
    },
    "supported_activity_types": ["payments.capture"],
    "max_concurrent_workflow_tasks": 10,
    "max_concurrent_activity_tasks": 50
  }'
```

| 字段 | 必填 | 契约 |
| --- | --- | --- |
| `worker_id` | 否 | 稳定的进程标识。省略时 Server 生成一个，但长时间运行的运行时应设置它，用于日志和任务队列诊断。 |
| `task_queue` | 是 | 此 Worker 轮询的队列。轮询其他队列会以 `reason: "task_queue_mismatch"` 失败。 |
| `runtime` | 是 | `php`、`python`、`rust`、`typescript`、`go`、`java` 或 `external` 之一。接受某运行时标识不代表提供了第一方 SDK。 |
| `sdk_version` | 否 | 在 Worker 可见性和诊断中显示的运行时 SDK 版本。 |
| `build_id` | 否 | 任务队列构建 ID 可见性及发布群组使用的部署/构建标识。在同一重放兼容的 Worker 族中应保持稳定。 |
| `supported_workflow_types` | 否 | 此 Worker 能够重放的工作流类型键。为空表示不进行工作流类型过滤。 |
| `workflow_definition_fingerprints` | 否 | 每个工作流的确定性定义指纹。运行中的 Worker 以已变化的指纹重新注册时会被拒绝。 |
| `supported_activity_types` | 否 | 此 Worker 能够执行的活动类型键。为空表示不进行活动类型过滤。 |
| `max_concurrent_workflow_tasks` | 否 | 公布的本地工作流任务槽位。默认 `100`；最小 `1`。 |
| `max_concurrent_activity_tasks` | 否 | 公布的本地活动任务槽位。默认 `100`；最小 `1`。 |

公布的定义指纹未变时，运行中的 Worker 可以使用相同 Worker ID 重新注册。如果运行中的 Worker 更改了已公布类型的工作流代码，必须使用新的 `worker_id` 重启；否则注册以 `reason: "workflow_definition_changed"` 失败。

`build_id` 不仅是展示元数据。它是任务队列发布 API 面向运维人员的群组标识。能够安全重放同一批执行中工作的 Worker 应保持同一个 `build_id`，发布创建新兼容族时再更改。固定和回滚契约见 [Worker 兼容性与路由](/docs/polyglot/worker-compatibility-routing)，排空/恢复流程见 [Worker 构建 ID 发布](/docs/polyglot/worker-build-id-rollout)。

## 轮询与可见性 {#polling-and-visibility}

Worker 轮询请求必须使用与注册时相同的命名空间、Worker ID 和任务队列：

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/worker/workflow-tasks/poll" \
  -H "Authorization: Bearer $DW_WORKER_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Protocol-Version: 1.0" \
  -H "Content-Type: application/json" \
  -d '{
    "worker_id": "py-orders-1",
    "task_queue": "orders",
    "timeout_seconds": 30
  }'
```

运维人员可以通过控制平面可见性检查同一注册状态：

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/task-queues/orders" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" | jq '.pollers, .admission'
```

Worker 收不到任务时，应先检查任务队列可见性。它区分缺少 Worker、队列不匹配、不支持的工作流/活动类型过滤、Worker 槽位饱和、Server 活动租约上限、派发速率上限，以及查询任务背压。

当 Server 在 `GET /api/cluster/info` 中公布 `worker_protocol.server_capabilities.poll_status = true` 时，轮询响应本身通过 `poll_status` 提供相同的机器可读结果。工作流任务、活动任务和查询任务轮询路由即使在 `task` 为 `null` 时也保留该字段，使 Worker 运行时能基于一个稳定接口分支处理：

- `leased`：成功租用任务。
- `empty`：轮询返回前没有就绪任务。
- `throttled`：队列准入限制阻止本次轮询获得新任务。
- `unavailable`：Server 无法安全协调队列，返回类型化的不可用结果，而不是假装队列为空。
- `draining`：Worker 的构建 ID 群组正在排空，因此轮询以 HTTP `409` 和 `reason: "worker_draining"` 失败，直到群组恢复。

## 错误接口 {#error-surface}

自动化应根据具名原因分支处理，不应依赖自然语言消息。

| 原因 | 位置 | 含义 | 运维操作 |
| --- | --- | --- | --- |
| `missing_control_plane_version` | 控制平面路由 | 请求省略了 `X-Durable-Workflow-Control-Plane-Version: 2`。 | 添加版本头或升级客户端配置档。 |
| `missing_protocol_version` | Worker 路由 | 请求省略了 `X-Durable-Workflow-Protocol-Version: 1.0`。 | 修复 Worker 客户端或 SDK 版本协商。 |
| `namespace_not_found` | 命名空间作用域路由 | `X-Namespace`、查询字符串或 Server 默认值指定的命名空间不存在。 | 创建命名空间或纠正客户端命名空间。 |
| `namespace_already_exists` | `POST /api/namespaces` | 规范化后的命名空间名称已存在。 | 复用该名称或选择不同名称。 |
| `task_queue_mismatch` | Worker 轮询路由 | 为某个队列注册的 Worker ID 试图轮询另一个队列。 | 使用新 Worker ID 重启，或轮询已注册队列。 |
| `worker_draining` | Worker 轮询路由 | Worker 的构建 ID 群组被标记为排空，可以完成执行中的工作，但不能认领新任务。 | 恢复群组以回滚，或在当前租约排空后停止 Worker。 |
| `workflow_definition_changed` | `POST /api/worker/register` | 运行中的 Worker ID 试图公布已更改的工作流指纹。 | 使用新 Worker ID 重启已更改的进程。 |
| `validation_failed` | 任意 JSON 路由 | 字段缺失、格式错误、过大或超出允许范围。 | 阅读 `errors` 或 `validation_errors` 并修正负载。 |

## 另请参阅 {#see-also}

- [Server API 参考](/docs/polyglot/server-api-reference)
- [Worker 协议](/docs/polyglot/worker-protocol)
- [任务队列准入](/docs/polyglot/task-queue-admission)
- [CLI 命令参考](/docs/polyglot/cli-reference)
