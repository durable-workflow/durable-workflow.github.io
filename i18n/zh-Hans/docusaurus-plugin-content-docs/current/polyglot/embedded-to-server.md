---
sidebar_position: 1
title: 从嵌入式迁移到 Server
description: 将 Laravel 嵌入式 v2 部署迁移到独立 Durable Workflow Server。
---

# 从嵌入式迁移到 Server {#embedded-to-server-migration}

本指南适用于已在 Laravel 应用中运行 Durable Workflow v2、并将新工作流流量迁移到独立 Server 的团队。如果应用仍使用 v1，请先阅读[迁移到 2.0](/docs/migration)，并将现有 v1 运行保留在 v1 引擎上直到完成。

如果尚未选择目标，或 Laravel 框架集成是决策的一部分，请先阅读 [Laravel 采用与运行时迁移](/docs/laravel-adoption/)。本页是作出选择后的自托管 Server 操作手册，不是 Cloud 迁移路径。

迁移是一条采用路径，不是原地数据库搬迁。独立 Server 负责新的控制平面启动、持久历史、计划、Worker 注册及通过 HTTP 交付任务。应用 Worker 继续负责工作流和活动代码。

<div
  data-public-payload-codec-contract="avro-only"
  data-payload-codec="avro"
  data-authority-manifest="https://durable-workflow.github.io/sdk-neutrality-contract.json"
  data-legacy-v1-import-drain="internal">
  Durable Workflow 2.0 只有一种公开负载编解码器：<code data-payload-codec-field="codec">avro</code>。
  JSON 是 HTTP 文档传输格式，不是持久负载编解码器。仅支持 PHP 的 v1 读取器保留在导入/排空路径内部，不能用于新的 v2 运行。参见 <a href="/docs/polyglot/avro-value-protocol/">Avro Value 协议</a>。
</div>

这是自托管迁移指南。它不会将嵌入式部署变成 Cloud 命名空间，迁移得到的 Server 也不会连接到 Durable Workflow Cloud。独立的托管服务选择见 [Cloud 托管运行时](/docs/polyglot/cloud-control-plane)。

## 当前边界 {#current-boundary}

当前支持：

- 通过 Server 控制平面 API 或 CLI 启动新工作流。
- 向 Server 注册 PHP、Python、Rust 或自定义 HTTP Worker。
- 通过 Worker 协议轮询并完成工作流和活动任务。
- 将符合条件的嵌入式 v2 历史导出包导入 Server，作为 Server 管理的工作流状态。
- 从嵌入式 v2 或 Server v2 导出已关闭运行的历史包，用于审计、调试及归档交接。
- 通过读取 Server 状态的 Server API、CLI 和 SDK 接口观察 Server 管理的工作流，或部署 [Waterline 服务模式](/docs/monitoring#waterline-service)，作为通过 PHP SDK 连接的独立观察器。原 Laravel 应用中的 Waterline 包仍只读取该嵌入式运行时的状态。

当前不支持自动执行的操作：

- 将 v1 运行迁移到 Server。
- 使用非 PHP Worker 重放 v1 历史。

规划切换时，让 v1 运行在启动它们的位置排空。嵌入式 v2 运行可以原地排空，也可以通过下方导入流程迁移。

## 部署模式契约 {#deployment-mode-contract}

嵌入式与服务模式的固定比较见[部署模式](/docs/polyglot/deployment-modes)。本迁移指南在共享契约上增加四条切换规则：

- 现有嵌入式运行继续在启动位置执行。
- 新的 Server 管理运行从首次切换起就使用稳定的类型键、命名空间名称、任务队列及 Avro 负载契约。
- 信号、查询、更新、修复、取消、终止和归档必须持续路由到管理目标运行的运行时。
- 每个 Waterline 部署必须持续指向其要观察的运行时和命名空间；它不会合并嵌入式和 Server 管理的运行。

## 切换不变量 {#cutover-invariants}

整个迁移期间必须遵守以下规则：

- 将 Server 配置为显式远程依赖：直接设置基础 URL、命名空间、任务队列和认证材料，不从 Laravel 应用本地设置中推断。
- 两个运行时中的工作流 ID、运行定位规则、工作流/活动类型键、负载编解码器标签（`avro`）及兼容性标记保持稳定。
- 将信号、查询、更新、修复、取消、终止和归档路由到管理目标运行的同一个运行时。
- 导入嵌入式运行前，暂停嵌入式 Worker 足够长时间，以导出静止状态的包，其中没有已租用的工作流/活动任务，也没有正在运行的活动尝试。
- 将语言中立性视为迁移契约的一部分：Server 管理的工作流使用稳定别名和固定 Avro Value 模式，不使用 PHP 专属类名或负载格式。

## 阶段 A：准备嵌入式 v2 {#phase-a-prepare-embedded-v2}

部署 Server 前，先让嵌入式应用使用语言中立契约。这可以减少切换时需要更改的代码。

1. 定义稳定的工作流和活动类型键。

   ```php
   // config/workflows.php
   'v2' => [
       'types' => [
           'workflows' => [
               'orders.process' => App\Workflows\ProcessOrderWorkflow::class,
           ],
           'activities' => [
               'orders.reserve-inventory' => App\Activities\ReserveInventory::class,
               'orders.capture-payment' => App\Activities\CapturePayment::class,
           ],
       ],
   ],
   ```

2. 在每个外部边界使用这些键。

   Server 客户端发送 `workflow_type: "orders.process"`，Worker 使用相同字符串注册 `supported_workflow_types` / `supported_activity_types`。不要将 PHP 全限定类名作为持久公开契约。

3. 使用 v2 Avro 负载契约。

   ```php
   // config/workflows.php
   'serializer' => 'avro',
   ```

   新的嵌入式和 Server 管理的 v2 工作流必须使用 Avro。旧 PHP 读取器只能保留在 v1 导入/排空路径内部，等待旧 v1 运行完成。

4. 选择命名空间和任务队列名称。

   选择在整个嵌入式到 Server 切换期间都能保持稳定的名称：

   ```bash
   export DURABLE_WORKFLOW_NAMESPACE=production
   export DURABLE_WORKFLOW_TASK_QUEUE=orders
   ```

5. 决定是否需要兼容性标记。

   单一 Worker 集群部署可以不设置兼容性。标准 v2 发布机制（金丝雀、排空、回滚、重放调试）都在一个稳定 v2 契约内运行，不存在“混合集群 v2”采用通道。如果嵌入式到 Server 切换期间确实出现构建版本不一致的窗口，请在切换前设置 `DW_V2_CURRENT_COMPATIBILITY` 和 `DW_V2_SUPPORTED_COMPATIBILITIES`，避免新构建在该窗口中认领来自不兼容构建的运行。

## 阶段 B：在嵌入式旁部署 Server {#phase-b-deploy-the-server-beside-embedded}

在 Laravel 应用旁运行独立 Server，同时应用继续处理现有嵌入式运行。

```bash
git clone https://github.com/durable-workflow/server.git
cd server
cp .env.example .env
docker compose up -d
```

本地开发可设置 `DW_AUTH_DRIVER=none`。共享环境请使用角色限定凭据：

```bash
DW_AUTH_DRIVER=token
DW_WORKER_TOKEN=worker-secret
DW_OPERATOR_TOKEN=operator-secret
DW_ADMIN_TOKEN=admin-secret
```

验证发现并创建命名空间：

```bash
export SERVER=http://localhost:8080
export ADMIN_TOKEN=admin-secret
export OPERATOR_TOKEN=operator-secret

curl "$SERVER/api/health"

curl "$SERVER/api/cluster/info" \
  -H "Authorization: Bearer $OPERATOR_TOKEN"

curl -X POST "$SERVER/api/namespaces" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"name":"production","description":"Production workflows","retention_days":30}'
```

Server 拒绝没有 `X-Durable-Workflow-Control-Plane-Version: 2` 的控制平面请求；Worker 使用独立的 `X-Durable-Workflow-Protocol-Version: 1.0` 头。

## 阶段 C：连接 Worker {#phase-c-connect-workers}

Worker 必须先注册再轮询。注册公布运行时、任务队列及 Worker 可执行的类型键。

```bash
export WORKER_TOKEN=worker-secret

curl -X POST "$SERVER/api/worker/register" \
  -H "Authorization: Bearer $WORKER_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Protocol-Version: 1.0" \
  -H "Content-Type: application/json" \
  -d '{
    "worker_id": "orders-php-1",
    "task_queue": "orders",
    "runtime": "php",
    "sdk_version": "<installed-sdk-version>",
    "supported_workflow_types": ["orders.process"],
    "supported_activity_types": [
      "orders.reserve-inventory",
      "orders.capture-payment"
    ],
    "max_concurrent_workflow_tasks": 10,
    "max_concurrent_activity_tasks": 50
  }'
```

然后以 Server 模式针对相同命名空间和任务队列运行 Worker。Python Worker 通过 Python SDK 遵循相同注册和轮询契约。自定义 Worker 可直接使用 [Worker 协议](/docs/polyglot/worker-protocol)。

切换前检查可见性：

```bash
curl "$SERVER/api/workers" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"

curl "$SERVER/api/task-queues/orders" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

## 阶段 D：将新启动路由到 Server {#phase-d-route-new-starts-to-the-server}

一次切换一个工作流族。保留嵌入式应用和队列 Worker 处理旧运行，直到排空。

先启动影子工作流：

```bash
curl -X POST "$SERVER/api/workflows" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "orders-shadow-1001",
    "workflow_type": "orders.process",
    "task_queue": "orders",
    "input": [{"order_id":"1001","mode":"shadow"}]
  }'
```

观察运行：

```bash
curl "$SERVER/api/workflows/orders-shadow-1001" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

影子路径正常后，将生产调用方从 `WorkflowStub::start()` 改为 Server 客户端、CLI 或直接 HTTP API。信号、查询、更新、取消和终止仍路由到启动工作流的同一个运行时。嵌入式启动的工作流应接收嵌入式命令；Server 上启动的工作流应接收 Server 控制平面命令。

## 阶段 E：导入符合条件的嵌入式 v2 运行 {#phase-e-import-eligible-embedded-v2-runs}

使用历史导出作为导入格式。嵌入式运行时仍是导出包的事实来源；Server 验证导出包，在一个事务内写入持久数据行，并根据这些行重建 Server 投影。

资格条件：

- 包模式必须为 `durable-workflow.v2.history-export`，且 `schema_version: 1`。
- 来源运行必须是嵌入式 v2，导出必须包含 `workflow.source_runtime: "embedded"`。v1 历史仍不在范围内。
- 非终态运行必须是当前嵌入式运行。
- 终态运行必须有 `history_complete: true`。
- 已脱敏的包会被拒绝。
- 存在已租用的工作流任务、已租用的活动任务或正在运行的活动尝试时会被拒绝。暂停 Worker 或等待租约过期后，再次导出。

导入事实来源规则：

- 复制 `history_events`，作为权威的重放和审计日志。
- 从包中重建工作流标识、负载、命令、信号、更新、任务、活动执行、定时器、失败及沿袭链接。
- 导入后重建 Server 摘要、等待、定时器、时间线及沿袭投影。投影行不是导入权威来源。
- 待处理工作流任务仍可由兼容的 Server Worker 认领。
- 待处理活动执行及就绪活动任务仍可由兼容的 Server 活动 Worker 认领。
- 待处理定时器保留其 `fire_at` 时间戳，Server 定时器修复/恢复能够看到它们。

失败与回滚：

- 导入在一个数据库事务中全部成功或全部失败。
- 如果进程在提交前退出，或验证失败，Server 不会残留部分运行状态。
- 重试相同包根据 `run_id` 和 `dedupe_key` 保持幂等。
- 如果另一个 Server 运行已占用同一 `run_id`，导入会被拒绝。

可见性与审计：

- 导入运行在 Server 列表/详情视图中提供 `engine_source: embedded_v2_import`。
- 持久运行行记录 `import_source=embedded_v2`、`import_id`、`import_dedupe_key`、`import_contract_version` 和 `imported_at`。

运维流程：

对于嵌入式 v2 运行：

```bash
php artisan workflow:v2:history-export order-123 \
  --output=storage/workflow-history/order-123.json \
  --pretty
```

在 Server 上试运行导入：

```bash
php artisan workflow:v2:history-import storage/workflow-history/order-123.json \
  --namespace=production \
  --dry-run \
  --json
```

导入包：

```bash
php artisan workflow:v2:history-import storage/workflow-history/order-123.json \
  --namespace=production \
  --import-id=orders-cutover-2026-05-05
```

或调用 HTTP 运维端点：

```bash
curl -X POST "$SERVER/api/workflows/import/embedded-v2" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  --data-binary @order-123-import-request.json
```

其中 `order-123-import-request.json` 内容为：

```json
{
  "import_id": "orders-cutover-2026-05-05",
  "bundle": {
    "schema": "durable-workflow.v2.history-export",
    "schema_version": 1,
    "workflow": {
      "source_runtime": "embedded"
    }
  }
}
```

上方 `bundle` 对象经过缩写；请传入完整的 `workflow:v2:history-export` JSON 文档。

对于仅需保留或审计的 Server 管理运行：

```bash
curl "$SERVER/api/workflows/order-123/runs/$RUN_ID/history/export" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  > order-123-history.json
```

如果希望终态 Server 运行不被保留期清理删除，请在导出后归档：

```bash
curl -X POST "$SERVER/api/workflows/order-123/archive" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"reason":"history exported to archive storage"}'
```

## 阶段 F：添加多语言 Worker {#phase-f-add-polyglot-workers}

工作流族通过 Server 运行后，可注册相同命名空间、任务队列和类型键，添加 Python、Rust 或自定义 Worker。每个公开 v2 负载都使用 `avro`；活动输入和输出应保持语言中立：数组、对象、字符串、数字、布尔值及 null。

请使用 [Python SDK 指南](/docs/polyglot/python) 或 [Rust SDK 指南](/docs/polyglot/rust)。直接 HTTP 实现请使用 [Worker 协议参考](/docs/polyglot/worker-protocol)。

## 切换检查清单 {#cutover-checklist}

- [ ] v1 运行已排空，或有意保留在 v1 引擎上。
- [ ] 嵌入式 v2 在外部边界使用稳定类型键，不使用 PHP 全限定类名。
- [ ] 每个新 v2 工作流使用唯一的公开 `avro` 编解码器。
- [ ] 从部署网络访问 Server `/api/health` 和 `/api/cluster/info` 均通过检查。
- [ ] 目标命名空间在 Server 上存在。
- [ ] Worker 使用预期任务队列和支持的类型键注册。
- [ ] 影子工作流启动、由 Worker 认领并到达预期状态。
- [ ] 运维人员能够列出工作流、检查任务队列和查看 Worker 注册。
- [ ] 旧嵌入式启动方已暂停或迁移，避免重复业务键在两个运行时同时启动。
- [ ] 选定导入的嵌入式 v2 运行从静止的嵌入式运行时导出，并通过 `workflow:v2:history-import --dry-run`。
- [ ] 导入运行在 Server 详情/列表接口中显示 `engine_source: embedded_v2_import` 及预期的 `import_id`。
- [ ] 只需保留的已关闭旧运行已导出到持久存储。

## 故障排查 {#troubleshooting}

| 症状 | 可能原因 | 修复 |
| --- | --- | --- |
| `missing_control_plane_version` | 客户端调用控制平面路由时没有 v2 头 | 发送 `X-Durable-Workflow-Control-Plane-Version: 2` |
| `missing_protocol_version` | Worker 调用 Worker 路由时没有 Worker 协议头 | 发送 `X-Durable-Workflow-Protocol-Version: 1.0` |
| `namespace_not_found` | Server 上尚未创建命名空间 | 使用 `POST /api/namespaces` 创建 |
| Worker 轮询未返回任务 | 任务队列、类型键、命名空间或兼容性标记不匹配 | 比较工作流启动负载、Worker 注册和任务队列可见性 |
| 非 PHP Worker 无法解码 v1 负载 | 运行包含 PHP 原生 v1 历史 | 将运行保留在内部 PHP v1 导入/排空路径，不要路由到 v2 Worker |
| 旧工作流不响应 Server 信号/查询/更新 | 运行在嵌入式模式启动 | 通过嵌入式应用发送命令，直到该运行完成 |
| 导入拒绝 `tasks.leased_task_present` | 嵌入式导出捕获了已租用任务 | 暂停嵌入式 Worker，等待租约释放或完成，再次导出 |
| 导入返回 `already_imported` | 相同 `run_id` 和 `dedupe_key` 已存在于 Server | 将重试视为成功，并检查 Server 运行 |
| 导入运行可见但未被认领 | Worker 类型键、任务队列、命名空间或兼容性标记与导入行不匹配 | 比较导入报告、运行详情和 Worker 注册 |

## 相关指南 {#related-guides}

- [Server 设置](/docs/polyglot/server)
- [Worker 协议](/docs/polyglot/worker-protocol)
- [Python SDK](/docs/polyglot/python)
- [迁移到 2.0](/docs/migration)
