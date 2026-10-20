---
sidebar_position: 13
---

# Webhook {#webhooks}

框架提供 Webhook，使外部系统能够动态启动工作流并发送信号，便于集成外部服务、API 和自动化工具。

## 启用 Webhook {#enabling-webhooks}

在应用路由文件（`routes/web.php` 或 `routes/api.php`）中注册 Webhook 路由即可启用：

```php
use Workflow\V2\Webhooks;

Webhooks::routes([
    App\Workflows\OrderWorkflow::class,
    'manual-invoice' => App\Workflows\InvoiceWorkflow::class,
]);
```

传入要开放的工作流类的显式映射。每个别名成为公开路由段，每个工作流类必须通过 `#[Type(...)]` 或 `workflows.v2.types.workflows` 注册项提供稳定持久类型键。完整路由矩阵见[显式命令与查询 Webhook](#explicit-command-and-query-webhooks)。

## 可见性元数据 {#visibility-metadata}

通过 `Workflow\V2\Webhooks::routes(...)` 注册路由时，启动路由还接受保留的 `visibility` 对象。这些字段作为工作流可见性元数据存储，不传给工作流的 `handle()` 方法。

```bash
curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -d '{
           "workflow_id": "order-123",
           "orderId": 123,
           "visibility": {
             "business_key": "order-123",
             "labels": {
               "tenant": "acme",
               "region": "us-east"
             },
             "memo": {
               "customer": {
                 "id": 42,
                 "name": "Taylor"
               },
               "source": "checkout"
             }
           }
         }'
```

`business_key` 和 `visibility.labels` 复制到实例、运行、运行摘要、类型化启动历史、所选运行详情和历史导出。Waterline 可用精确匹配查询参数按这些字段过滤列表。

`visibility.memo` 复制到实例、运行、类型化启动历史、所选运行详情和历史导出，后续 `continueAsNew()` 运行默认继承同一 memo。顶层必须是 JSON 对象，可嵌套标量、`null`、数组或对象。`memo` 是仅供返回的元数据，不是列表过滤或运行摘要搜索字段。

## Webhook 身份验证 {#webhook-authentication}

默认 Webhook 不要求身份验证，但可在 `config/workflows.php` 中配置多种策略之一。

**注意：** Webhook URL 与外部人员共享或公开访问时，应启用令牌或 HMAC 签名身份验证，防止未经授权的访问。

### 身份验证方法 {#authentication-methods}

支持：

1. 无身份验证（none）
2. 令牌身份验证（token）
3. HMAC 签名验证（signature）
4. 自定义身份验证（custom）

### 令牌身份验证 {#token-authentication}

使用令牌身份验证时，Webhook 要求请求头携带有效 API 令牌。默认头为 `Authorization`，可通过配置修改。

#### 请求示例 {#example-request}

```bash
curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -H "Authorization: your-api-token" \
     -d '{"orderId": 123}'
```

### HMAC 签名身份验证 {#hmac-signature-authentication}

HMAC 身份验证使用秘密密钥验证请求。默认头为 `X-Signature`，同样可更改。

#### 请求示例 {#example-request-1}

```bash
BODY='{"orderId": 123}'
SIGNATURE=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "your-secret-key" | awk '{print $2}')

curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -H "X-Signature: $SIGNATURE" \
     -d "$BODY"
```

### 自定义身份验证 {#custom-authentication}

创建实现 `WebhookAuthenticator` 接口的类，以使用自定义身份验证器：

```php
use Illuminate\Http\Request;
use Workflow\Auth\WebhookAuthenticator;

class CustomAuthenticator implements WebhookAuthenticator
{
    public function validate(Request $request): Request
    {
        $allow = true;

        if ($allow) {
            return $request;
        } else {
            abort(401, 'Unauthorized');
        }
    }
}
```

然后在 `config/workflows.php` 中配置：

```php
'webhook_auth' => [
    'method' => 'custom',
    'custom' => [
        'class' => App\Your\CustomAuthenticator::class,
    ],
],
```

验证有效时，`validate()` 方法应返回 `Request`；未授权时调用 `abort(401)`。

## 配置 Webhook 路由 {#configuring-webhook-routes}

默认 Webhook 位于 `/webhooks` 下。可在 `config/workflows.php` 中自定义路由路径：

```php
'webhooks_route' => 'workflows',
```

更改后，Webhook 可通过以下路径访问：

```
POST /workflows/start/order-workflow
POST /workflows/signal/order-workflow/{workflowId}/mark-as-shipped
POST /workflows/instances/{workflowId}/queries/{query}
POST /workflows/instances/{workflowId}/runs/{runId}/queries/{query}
POST /workflows/instances/{workflowId}/signals/{signal}
POST /workflows/instances/{workflowId}/runs/{runId}/signals/{signal}
POST /workflows/instances/{workflowId}/repair
POST /workflows/instances/{workflowId}/cancel
POST /workflows/instances/{workflowId}/terminate
GET  /workflows/instances/{workflowId}/describe
POST /workflows/instances/{workflowId}/runs/{runId}/repair
POST /workflows/instances/{workflowId}/runs/{runId}/cancel
POST /workflows/instances/{workflowId}/runs/{runId}/terminate
GET  /workflows/instances/{workflowId}/runs/{runId}/describe
GET  /workflows/workflow-tasks/poll
GET  /workflows/activity-tasks/poll
POST /workflows/control-plane/start
```

## 显式命令与查询 Webhook {#explicit-command-and-query-webhooks}

持久启动、信号、更新、修复、取消和终止命令通过 HTTP 提供，同时提供当前运行和所选运行的可安全重放查询路由。

注册显式别名映射，只为希望开放的工作流添加路由。

```php
use Workflow\V2\Webhooks;

Webhooks::routes([
    App\Workflows\OrderWorkflow::class,
    'manual-invoice' => App\Workflows\InvoiceWorkflow::class,
]);
```

直接注册工作流类时，该类必须通过 `#[Type(...)]` 定义稳定类型键，或在 `workflows.v2.types.workflows` 下注册：

```php
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

#[Type('order-workflow')]
class OrderWorkflow extends Workflow
{
    public function handle(int $orderId)
    {
        // ...
    }
}
```

等价的配置注册：

```php
// config/workflows.php
'v2' => [
    'types' => [
        'workflows' => [
            'order-workflow' => App\Workflows\OrderWorkflow::class,
        ],
    ],
],
```

生成的启动路由：

```
POST /webhooks/start/order-workflow
```

请求示例：

```bash
curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -d '{"workflow_id":"order-123","orderId":123}'
```

`workflow_id` 是不透明的公开工作流实例 ID，不是运行 ID，应视为不透明字符串。

调用方提供的 `workflow_id` 必须是非空、URL 安全的字符串，最多 191 个字符，只能包含字母、数字、`.`、`_`、`-` 和 `:`。空白、过长或含不支持字符的 ID 在 Webhook 校验时以 HTTP `422` 拒绝。

重构使已存工作流类名失效时，同一持久类型映射也是当前 Worker 的回退依据。保留 `order-workflow` 稳定，并将配置注册指向新类，即使原存储 PHP 类名无法加载，已入队 v2 工作仍能解析持久类型键。

也可显式请求重复启动行为：

```bash
curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -d '{"workflow_id":"order-123","orderId":123,"on_duplicate":"return_existing_active"}'
```

支持的 `on_duplicate` 值：

- `reject_duplicate`
- `return_existing_active`

所有命令 Webhook 返回相同 JSON 信封：

```json
{
  "outcome": "started_new",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "rejection_reason": null
}
```

创建新运行时的接受响应：

```json
{
  "outcome": "started_new",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "rejection_reason": null
}
```

调用方要求复用已有活动运行时的接受响应：

```json
{
  "outcome": "returned_existing_active",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "rejection_reason": null
}
```

重复启动被拒绝的响应：

```json
{
  "outcome": "rejected_duplicate",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": null,
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "command_source": "webhook",
  "rejection_reason": "instance_already_started"
}
```

响应字段：

- `workflow_id` 是公开工作流实例 ID。
- `run_id` 是已接受启动命令创建的首个活动运行。
- `requested_run_id` 仅在调用方显式指定某个所选运行时设置。
- `resolved_run_id` 是引擎为该命令实际解析的运行；实例目标启动中与 `run_id` 相同。
- `command_id` 是持久启动命令 ID。
- Webhook 路由的 `command_source` 为 `webhook`。
- 实例目标的信号、更新、修复、取消和终止路由，解析实例最新的持久运行，而不只是信任可变的当前运行指针。因此，即使该列偏移，仍可通过同一公开 ID 访问 continue-as-new 链。
- 运行目标命令路由在同一公开实例 ID 下固定某个所选运行。如果它不再是当前运行，以 `target_scope = run`、`outcome = rejected_not_current` 和 `rejection_reason = selected_run_not_current` 拒绝；此时 `run_id` 和 `requested_run_id` 保留历史选择，`resolved_run_id` 指向调用方下一步应访问的当前运行。
- 载荷键按声明顺序匹配工作流 `handle()` 参数名。
- 工作流在 `handle()` 上定义启动参数。
- 未声明 `handle()` 的工作流类，在创建运行前以 HTTP `422` 验证错误拒绝。
- 缺少必填载荷键时，以 HTTP `422` 验证错误拒绝，不会静默丢弃。
- 空白、过长或不满足路由安全要求的 `workflow_id`，以 HTTP `422` 验证错误拒绝，不会进入重复启动处理。
- 无效 `on_duplicate` 值以 HTTP `422` 验证错误拒绝。
- `on_duplicate = return_existing_active` 复用当前活动运行时返回 HTTP `200`。
- 未复用的重复启动返回 HTTP `409`，包含 `outcome = rejected_duplicate`、`command_status = rejected` 和 `rejection_reason = instance_already_started`。
- 持久 `workflow_commands` 行将 Webhook 入口上下文与业务参数分开存储，包括调用方标签、验证方式或结果、请求路由名称、请求路径，以及从规范化载荷和选定请求头（如 `X-Request-Id`、`X-Correlation-Id`）推导的请求指纹。

启动 Webhook 当前 HTTP 响应矩阵：

- 创建新运行：`202`，`outcome = started_new`
- 复用已有活动运行：`200`，`outcome = returned_existing_active`
- 重复启动被拒绝：`409`，`outcome = rejected_duplicate`
- Webhook 身份验证失败：`401`
- 未知别名：`404`
- 载荷验证失败：`422`

### 信号命令 Webhook {#signal-command-webhooks}

提供实例目标和运行目标两种信号命令：

```text
POST /webhooks/instances/{workflowId}/signals/{signal}
POST /webhooks/instances/{workflowId}/runs/{runId}/signals/{signal}
```

`workflowId` 是公开工作流实例 ID。实例目标路由在应用时解析当前活动运行。运行目标路由另接受所选 `runId`，该运行已成为历史时拒绝。信号名来自路由参数。请求体当前接受一个可选顶层字段：

```json
{
  "arguments": ["Taylor"]
}
```

`arguments` 字段必须是数组。省略时，通过 `await('signal-name')` 等待的工作流恢复并返回 `true`。目标工作流类还必须通过 `#[Workflow\V2\Attributes\Signal('...')]` 声明该信号名；未声明名称会被持久地拒绝，不会盲目缓冲。

信号示例：

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/signals/approved-by" \
     -H "Content-Type: application/json" \
     -d '{"arguments":["Taylor"]}'
```

信号接受响应：

```json
{
  "outcome": "signal_received",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": null,
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "rejection_reason": null
}
```

已接受和被拒绝的信号命令还会获得独立的持久 `workflow_signal_records` 生命周期行，链接回原始命令。信号命令响应仍将命令 ID 作为 HTTP 关联 ID；Waterline 所选运行详情和历史导出以 `signals[*].id` 展示生命周期行，同时提供信号名、`signal_wait_id`、命令序列、应用后的工作流序列、状态、结果、验证错误和已存参数。

实例存在但尚未启动运行时的拒绝响应：

```json
{
  "outcome": "rejected_not_started",
  "workflow_id": "order-123",
  "run_id": null,
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "instance_not_started"
}
```

当前运行已关闭时的拒绝响应：

```json
{
  "outcome": "rejected_not_active",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "run_not_active"
}
```

路由指向未声明信号名时的拒绝响应：

```json
{
  "outcome": "rejected_unknown_signal",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "unknown_signal"
}
```

运行目标信号路由指向历史运行时的拒绝响应：

```json
{
  "outcome": "rejected_not_current",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": "01J...",
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "run",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "selected_run_not_current"
}
```

信号 Webhook 当前 HTTP 响应矩阵：

- 信号命令被接受：`202`，`outcome = signal_received`
- Webhook 身份验证失败：`401`
- 未知工作流实例 ID：`404`
- 工作流未声明该信号名：`404`，`outcome = rejected_unknown_signal`；运行已有类型化 `WorkflowStarted` 契约快照，或旧 `WorkflowStarted` 事件可在首次兼容接收时回填后，拒绝不再依赖先反射实时工作流类
- 实例尚无当前运行：`409`，`outcome = rejected_not_started`
- 目标当前运行已关闭：`409`，`outcome = rejected_not_active`
- 运行目标路由指向历史所选运行：`409`，`outcome = rejected_not_current`
- `arguments` 存在但不是数组：`422`

### 带启动的信号 Webhook {#signal-with-start-webhooks}

一个以实例为目标的关联接收路由，会先启动新运行或复用当前活动运行，再记录信号：

```text
POST /webhooks/start/{alias}/signals/{signal}
```

`alias` 是在 `Workflow\V2\Webhooks::routes([...])` 中注册的 Webhook 工作流别名。`signal` 是 `#[Signal(...)]` 声明的持久信号名。

请求体组合普通启动字段和一个保留的 `signal_arguments` 字段，用于附带信号载荷：

```json
{
  "workflow_id": "order-123",
  "signal_arguments": ["Taylor"],
  "visibility": {
    "business_key": "order-123"
  }
}
```

`signal_arguments` 必须是数组。路由将 `on_duplicate` 默认为 `return_existing_active`；此关联接收路由拒绝其他重复策略值。

路由启动新运行时的接受响应：

```json
{
  "outcome": "signal_received",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": null,
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "start_command_id": "01J...",
  "start_command_sequence": 1,
  "start_outcome": "started_new",
  "start_command_status": "accepted",
  "intake_group_id": "01J...",
  "rejection_reason": null
}
```

工作流实例已有当前活动运行时，同一路由返回 `start_outcome = returned_existing_active`，并仍将信号命令作为顶层 `command_*` 响应对象。关联启动与信号命令共享 `intake_group_id`、请求路由元数据和请求关联头，运行时在 Worker 能执行首个用户工作流步骤前，于同一事务记录两个命令。

所选运行详情和历史导出在 `linked_intakes[*]` 中固定同一组合接收。持久权威依据是每个已接受命令行记录的共享 `workflow_commands.context.intake.group_id` 及 `mode`。在 `signal_with_start` 模式下，分组行提供 `start_command_*`、非启动的 `primary_command_*`、`complete`、`missing_expected_command_types` 和按顺序嵌套的 `commands[*]` 快照。

信号名未知或信号载荷未通过持久契约校验时，运行时在创建新运行前拒绝信号命令。此时响应的 `run_id`、`start_command_id` 和 `start_outcome` 为 `null`。

带启动的信号 Webhook 当前 HTTP 响应矩阵：

- 请求创建运行并记录信号：`202`，`outcome = signal_received`，`start_outcome = started_new`
- 请求复用当前活动运行并记录信号：`202`，`outcome = signal_received`，`start_outcome = returned_existing_active`
- Webhook 身份验证失败：`401`
- 未知 Webhook 工作流别名：`404`
- 工作流未声明信号名：`404`，`outcome = rejected_unknown_signal`
- `signal_arguments` 是数组但不满足持久信号契约：`422`，`outcome = rejected_invalid_arguments`
- `signal_arguments` 存在但不是数组，或 `on_duplicate` 不是 `return_existing_active`：`422`

### 查询 Webhook {#query-webhooks}

提供实例目标和运行目标两种查询路由：

```text
POST /webhooks/instances/{workflowId}/queries/{query}
POST /webhooks/instances/{workflowId}/runs/{runId}/queries/{query}
```

`workflowId` 是公开工作流实例 ID。实例目标路由刷新后解析实例最新的持久运行。运行目标路由固定某个所选 `runId`，可包括历史或已关闭运行，因为查询是只读重放操作。

`query` 是 `#[QueryMethod]` 声明的公开查询目标。工作流定义仍可加载时，路由也接受底层 PHP 方法名，但成功响应将 `query_name` 规范化回持久公开目标。

请求体接受位置 `arguments` 列表，或以声明查询参数为键的具名 `arguments` 映射：

```json
{
  "arguments": ["start"]
}
```

```json
{
  "arguments": {
    "prefix": "start"
  }
}
```

查询 Webhook 不同于修改状态的 Webhook 路由，不会追加持久命令行。它重放所选运行并立即返回序列化结果。

查询示例：

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/queries/events-starting-with" \
     -H "Content-Type: application/json" \
     -d '{"arguments":{"prefix":"start"}}'
```

查询接受响应：

```json
{
  "query_name": "events-starting-with",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "target_scope": "instance",
  "result": "i:1;"
}
```

查询参数不匹配声明契约时的拒绝响应：

```json
{
  "query_name": "events-starting-with",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "target_scope": "instance",
  "message": "Workflow query [events-starting-with] received invalid arguments.",
  "validation_errors": {
    "prefix": [
      "The prefix argument is required."
    ]
  }
}
```

所选运行的工作流定义已无法重放时的拒绝响应：

```json
{
  "query_name": "events-starting-with",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "target_scope": "instance",
  "blocked_reason": "workflow_definition_unavailable",
  "message": "Workflow 01J... [order-123] cannot execute query [events-starting-with] because the workflow definition is unavailable for durable type [order-workflow]."
}
```

查询 Webhook 当前 HTTP 响应矩阵：

- 查询重放成功：`200`，包含序列化 `result`
- Webhook 身份验证失败：`401`
- 未知工作流实例 ID 或所选运行 ID：`404`
- 所选实例尚未启动、所选运行未声明请求查询，或重放因 `blocked_reason = workflow_definition_unavailable` 阻塞：`409`
- 声明查询契约拒绝提供的 `arguments`：`422`

### 更新命令 Webhook {#update-command-webhooks}

提供实例目标和运行目标的更新 POST 路由，以及持久生命周期查询路由：

```text
POST /webhooks/instances/{workflowId}/updates/{update}
POST /webhooks/instances/{workflowId}/runs/{runId}/updates/{update}
GET /webhooks/instances/{workflowId}/updates/{updateId}
GET /webhooks/instances/{workflowId}/runs/{runId}/updates/{updateId}
```

`workflowId` 是公开工作流实例 ID。`update` 是 `#[UpdateMethod]` 声明的持久更新名称。`updateId` 是更新响应返回的持久生命周期 ID。实例目标 POST 路由在应用时解析当前活动运行。运行目标 POST 路由另接受所选 `runId`，若其已成为历史则拒绝。实例目标 GET 路由读取该工作流实例保存的生命周期，运行目标 GET 路由将查找范围缩小到所选运行。

使用 `#[UpdateMethod('mark-approved')]` 时，即使底层 PHP 方法名不同，公开 Webhook 目标也是 `mark-approved`。

请求体接受位置 `arguments` 列表，或以声明更新参数为键的具名 `arguments` 映射：

```json
{
  "arguments": [true, "api"]
}
```

```json
{
  "arguments": {
    "approved": true
  }
}
```

调用方只需要持久更新命令被接受，允许工作流 Worker 稍后应用时，将 `wait_for` 设为 `accepted`：

```json
{
  "arguments": {
    "approved": true
  },
  "wait_for": "accepted"
}
```

省略 `wait_for` 或设为 `completed` 时，Webhook 先记录已接受更新，再在配置的完成预算内等待工作流 Worker 应用。可通过 `wait_timeout_seconds` 为单次请求覆盖预算：

```json
{
  "arguments": {
    "approved": true
  },
  "wait_timeout_seconds": 5
}
```

Worker 在预算内完成时，Webhook 返回正常的更新完成或失败响应。等待预算先耗尽时，返回 HTTP `202` 及仍未关闭的已接受生命周期，避免无限阻塞。`wait_for` 为 `accepted` 时，Webhook 记录命令行、独立更新生命周期行和类型化 `UpdateAccepted` 历史，再调度或重新派发工作流任务，不等待应用就返回 HTTP `202`。

每个更新 POST 和 GET 响应除正常命令字段外，还包含 `update_id`、`update_name`、`update_status`、`workflow_sequence`、`accepted_at`、`applied_at`、`rejected_at` 和 `closed_at`。已接受但未关闭的生命周期在 Worker 关闭前，返回 `workflow_sequence = null`、`result = null`、`applied_at = null`、`rejected_at = null` 和 `closed_at = null`。

具名映射被接受后，引擎先规范化为声明参数顺序，再追加类型化 `UpdateAccepted` 或 `UpdateApplied` 历史。可选参数也在此规范化步骤中填入 PHP 默认值。

每个已接受或被拒绝更新都由以 `update_id` 为键的持久 `workflow_updates` 行支持。调用方可 POST 一次，稍后 GET 已存生命周期，无需从通用命令行推断状态。

更新示例：

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/updates/mark-ready" \
     -H "Content-Type: application/json" \
     -d '{"arguments":{"approved":true}}'
```

更新完成响应：

```json
{
  "outcome": "update_completed",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "update_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "update_name": "mark-ready",
  "update_status": "completed",
  "workflow_sequence": 1,
  "accepted_at": "2026-04-10T12:00:00.000000Z",
  "applied_at": "2026-04-10T12:00:01.000000Z",
  "rejected_at": null,
  "closed_at": "2026-04-10T12:00:01.000000Z",
  "wait_for": "completed",
  "wait_timed_out": false,
  "wait_timeout_seconds": 10,
  "rejection_reason": null,
  "validation_errors": [],
  "result": {
    "approved": true
  },
  "failure_id": null,
  "failure_message": null
}
```

仅接受更新的响应：

```json
{
  "outcome": null,
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "update_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "update_name": "mark-ready",
  "update_status": "accepted",
  "workflow_sequence": null,
  "accepted_at": "2026-04-10T12:00:00.000000Z",
  "applied_at": null,
  "rejected_at": null,
  "closed_at": null,
  "wait_for": "accepted",
  "wait_timed_out": false,
  "wait_timeout_seconds": null,
  "rejection_reason": null,
  "validation_errors": [],
  "result": null,
  "failure_id": null,
  "failure_message": null
}
```

生命周期查询示例：

```bash
curl "https://example.com/webhooks/instances/order-123/updates/01J..." \
     -H "Content-Type: application/json"
```

更新仍未关闭时的查询响应：

```json
{
  "outcome": null,
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "update_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "update_name": "mark-ready",
  "update_status": "accepted",
  "workflow_sequence": null,
  "accepted_at": "2026-04-10T12:00:00.000000Z",
  "applied_at": null,
  "rejected_at": null,
  "closed_at": null,
  "wait_for": "status",
  "wait_timed_out": false,
  "wait_timeout_seconds": null,
  "rejection_reason": null,
  "validation_errors": [],
  "result": null,
  "failure_id": null,
  "failure_message": null
}
```

生命周期关闭后的查询响应：

```json
{
  "outcome": "update_completed",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "update_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "update_name": "mark-ready",
  "update_status": "completed",
  "workflow_sequence": 1,
  "accepted_at": "2026-04-10T12:00:00.000000Z",
  "applied_at": "2026-04-10T12:00:01.000000Z",
  "rejected_at": null,
  "closed_at": "2026-04-10T12:00:01.000000Z",
  "wait_for": "status",
  "wait_timed_out": false,
  "wait_timeout_seconds": null,
  "rejection_reason": null,
  "validation_errors": [],
  "result": {
    "approved": true
  },
  "failure_id": null,
  "failure_message": null
}
```

查询路由不等待执行，只读取已存持久生命周期，因此始终返回 `wait_for = status`、`wait_timed_out = false` 和 `wait_timeout_seconds = null`。

所选运行已有更早被接受的信号待应用时，后续 POST 以 `rejected_pending_signal` 拒绝，不会在调用方路径内直接执行该工作流任务。无效具名或位置载荷以 `rejected_invalid_arguments` 拒绝，并包含 `validation_errors`。指向历史运行的 POST 路由以 `rejected_not_current` 拒绝。

更新 POST 路由当前 HTTP 响应矩阵：

- 更新命令被接受并完成：`200`，`outcome = update_completed`
- `wait_for = accepted` 持久接受更新命令，留待工作流 Worker 应用：`202`，`update_status = accepted`
- Webhook 等待至 `wait_timeout_seconds` 或配置默认时间，Worker 仍未关闭更新生命周期：`202`，`update_status = accepted`、`wait_for = completed`、`wait_timed_out = true`
- Webhook 身份验证失败：`401`
- 未知工作流实例 ID：`404`
- 未知持久更新名称：`404`，`outcome = rejected_unknown_update`；运行已有类型化 `WorkflowStarted` 契约快照，或旧 `WorkflowStarted` 事件可在首次兼容接收时回填后，此拒绝可在实时定义回退之前从持久运行元数据得出
- 实例尚无当前运行：`409`，`outcome = rejected_not_started`
- 当前运行已关闭：`409`，`outcome = rejected_not_active`
- 运行目标路由指向历史所选运行：`409`，`outcome = rejected_not_current`
- 更新执行前仍须应用更早接受的信号：`409`，`outcome = rejected_pending_signal`
- 更新载荷为数组但不满足声明更新契约，包括缺少参数、未知参数、类型不匹配或违反可空性：`422`，`outcome = rejected_invalid_arguments`
- 更新主体抛出异常：`422`，`outcome = update_failed`
- `arguments` 存在但不是数组：`422`；该请求结构错误在创建持久命令行前被拒绝

更新 GET 生命周期查询路由当前 HTTP 响应矩阵：

- 生命周期已关闭，`update_status` 为 `completed`、`failed` 或 `rejected`：`200`
- `update_status = accepted`：`202`
- Webhook 身份验证失败：`401`
- 请求范围内未知工作流实例 ID、所选运行 ID 或 `update_id`：`404`

### 修复与终态命令 Webhook {#repair-and-terminal-command-webhooks}

提供实例目标和运行目标的修复及终态命令路由：

```text
POST /webhooks/instances/{workflowId}/repair
POST /webhooks/instances/{workflowId}/cancel
POST /webhooks/instances/{workflowId}/terminate
POST /webhooks/instances/{workflowId}/runs/{runId}/repair
POST /webhooks/instances/{workflowId}/runs/{runId}/cancel
POST /webhooks/instances/{workflowId}/runs/{runId}/terminate
```

这里的 `workflowId` 是公开工作流实例 ID。实例路由始终解析当前活动运行。运行路由另接受所选 `runId`，对历史选择以持久 `rejected_not_current` 结果拒绝。启动路由使用的 `workflows.webhook_auth` 配置同样适用于这些终态命令路由。

修复示例：

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/repair" \
     -H "Content-Type: application/json"
```

取消示例：

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/cancel" \
     -H "Content-Type: application/json"
```

终止示例：

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/terminate" \
     -H "Content-Type: application/json"
```

运行时恢复当前运行持久进度时的修复接受响应：

```json
{
  "outcome": "repair_dispatched",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "rejection_reason": null
}
```

当前运行已有健康持久恢复路径时的修复接受响应：

```json
{
  "outcome": "repair_not_needed",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "rejection_reason": null
}
```

取消接受响应：

```json
{
  "outcome": "cancelled",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "rejection_reason": null
}
```

终止接受响应：

```json
{
  "outcome": "terminated",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "rejection_reason": null
}
```

实例存在但尚未启动运行时的拒绝响应：

```json
{
  "outcome": "rejected_not_started",
  "workflow_id": "order-123",
  "run_id": null,
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "instance_not_started"
}
```

当前运行已关闭时的拒绝响应：

```json
{
  "outcome": "rejected_not_active",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "run_not_active"
}
```

运行目标的修复、取消或终止路由指向历史运行时的拒绝响应：

```json
{
  "outcome": "rejected_not_current",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": "01J...",
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "run",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "selected_run_not_current"
}
```

修复、取消和终止 Webhook 当前 HTTP 响应矩阵：

- 修复重新派发逾期就绪任务、重新认领过期租约，或重建尚未开始运行的缺失持久任务：`200`，`outcome = repair_dispatched`；包括命令应用前任务行丢失的已接受更新和已接受信号工作流应用任务
- 运行已有健康持久恢复路径，或所选运行已处于没有任务行的执行中活动：`200`，`outcome = repair_not_needed`
- 当前运行成功关闭：`200`，`outcome = cancelled` 或 `outcome = terminated`
- Webhook 身份验证失败：`401`
- 未知工作流实例 ID：`404`
- 实例尚无当前运行：`409`，`outcome = rejected_not_started`
- 当前运行已关闭：`409`，`outcome = rejected_not_active`
- 运行目标路由指向历史所选运行：`409`，`outcome = rejected_not_current`

### 描述 Webhook {#describe-webhooks}

提供实例目标和运行目标的描述路由，用于通过 HTTP 检查工作流状态：

```text
GET /webhooks/instances/{workflowId}/describe
GET /webhooks/instances/{workflowId}/runs/{runId}/describe
```

`workflowId` 是公开工作流实例 ID。实例目标路由返回当前运行状态。运行目标路由按 ID 描述具体运行，包括历史或已关闭运行。

描述是只读检查操作，不创建持久命令行，也不重放工作流。它从已提交投影数据返回实例元数据、当前或所选运行状态、摘要字段和操作可用性。

描述示例：

```bash
curl "https://example.com/webhooks/instances/order-123/describe"
```

活动工作流响应：

```json
{
  "found": true,
  "workflow_instance_id": "order-123",
  "workflow_type": "order-workflow",
  "workflow_class": "App\\Workflows\\OrderWorkflow",
  "business_key": "order-123",
  "run": {
    "workflow_run_id": "01J...",
    "run_number": 1,
    "is_current_run": true,
    "status": "waiting",
    "status_bucket": "running",
    "closed_reason": null,
    "compatibility": "build-a",
    "connection": "redis",
    "queue": "default",
    "started_at": "2026-04-12T12:00:00+00:00",
    "closed_at": null,
    "last_progress_at": "2026-04-12T12:00:01+00:00",
    "wait_kind": "signal",
    "wait_reason": "Waiting for signal [approved-by]"
  },
  "run_count": 1,
  "actions": {
    "can_signal": true,
    "can_query": true,
    "can_update": true,
    "can_cancel": true,
    "can_terminate": true
  },
  "reason": null
}
```

已终止工作流响应：

```json
{
  "found": true,
  "workflow_instance_id": "order-123",
  "workflow_type": "order-workflow",
  "workflow_class": "App\\Workflows\\OrderWorkflow",
  "business_key": "order-123",
  "run": {
    "workflow_run_id": "01J...",
    "run_number": 1,
    "is_current_run": true,
    "status": "terminated",
    "status_bucket": "failed",
    "closed_reason": "terminated",
    "compatibility": "build-a",
    "connection": "redis",
    "queue": "default",
    "started_at": "2026-04-12T12:00:00+00:00",
    "closed_at": "2026-04-12T12:01:00+00:00",
    "last_progress_at": "2026-04-12T12:01:00+00:00",
    "wait_kind": null,
    "wait_reason": null
  },
  "run_count": 1,
  "actions": {
    "can_signal": false,
    "can_query": false,
    "can_update": false,
    "can_cancel": false,
    "can_terminate": false
  },
  "reason": null
}
```

操作可用性反映该操作目前能否成功：已关闭运行不能接受命令，仅远程工作流不能在本地处理查询或更新，非当前运行不能接收信号、更新、取消或终止。

运行目标描述示例：

```bash
curl "https://example.com/webhooks/instances/order-123/runs/01J.../describe"
```

运行目标响应包含相同载荷，但所选运行是历史运行时，`is_current_run` 为 `false`，所有修改状态的操作也均为 `false`。

实例未找到时的响应：

```json
{
  "found": false,
  "workflow_instance_id": "order-123",
  "workflow_type": null,
  "workflow_class": null,
  "business_key": null,
  "run": null,
  "run_count": 0,
  "actions": {
    "can_signal": false,
    "can_query": false,
    "can_update": false,
    "can_cancel": false,
    "can_terminate": false
  },
  "reason": "instance_not_found"
}
```

实例存在但所选运行未找到时的响应：

```json
{
  "found": true,
  "workflow_instance_id": "order-123",
  "workflow_type": "order-workflow",
  "workflow_class": "App\\Workflows\\OrderWorkflow",
  "business_key": "order-123",
  "run": null,
  "run_count": 1,
  "actions": {
    "can_signal": false,
    "can_query": false,
    "can_update": false,
    "can_cancel": false,
    "can_terminate": false
  },
  "reason": "run_not_found"
}
```

描述 Webhook 当前 HTTP 响应矩阵：

- 找到实例，无论运行是活动、已关闭还是历史：`200`
- 找到实例但所选运行不存在：`200`，`reason = run_not_found`
- Webhook 身份验证失败：`401`
- 工作流实例 ID 不存在：`404`，`reason = instance_not_found`

### 控制平面启动 Webhook {#control-plane-start-webhook}

控制平面启动路由直接接受持久工作流类型键，无需在本地解析工作流类。通过类型键而非 PHP 类别名驱动工作流的外部消费者，应优先使用此启动路径。

```text
POST /webhooks/control-plane/start
```

请求体接受：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `workflow_type` | string | 是 | 持久工作流类型键 |
| `instance_id` | string | 否 | 调用方提供的公开工作流实例 ID |
| `arguments` | string | 否 | 带编解码器标签的序列化参数 |
| `connection` | string | 否 | 队列连接覆盖 |
| `queue` | string | 否 | 队列名称覆盖 |
| `business_key` | string | 否 | 调用方提供的业务键 |
| `labels` | object | 否 | 可见性标签 |
| `memo` | object | 否 | 未索引元数据 |
| `duplicate_start_policy` | string | 否 | `reject_duplicate` 或 `return_existing_active` |

请求示例：

```bash
curl -X POST "https://example.com/webhooks/control-plane/start" \
     -H "Content-Type: application/json" \
     -d '{
           "workflow_type": "order-workflow",
           "instance_id": "order-123",
           "arguments": "{\"orderId\":123}",
           "connection": "redis",
           "queue": "default",
           "business_key": "order-123",
           "labels": {"tenant": "acme"}
         }'
```

新启动工作流的响应：

```json
{
  "started": true,
  "workflow_instance_id": "order-123",
  "workflow_run_id": "01J...",
  "workflow_type": "order-workflow",
  "outcome": "started_new",
  "task_id": "01J...",
  "reason": null
}
```

省略 `instance_id` 时，引擎自动生成基于 ULID 的实例 ID。

工作流类型键通过 `workflows.v2.types.workflows` 配置或 `#[Type(...)]` 特性映射到本地可解析类时，在启动时应用完整命令契约快照和路由。类在本地不可用时，使用类型键和选项中的显式路由创建实例，命令契约快照和定义指纹推迟到认领首个任务的 Worker 处理。因此，外部消费者可以启动只有 Worker 集群能够解析的类型键工作流。

控制平面启动 Webhook 当前 HTTP 响应矩阵：

- 创建新运行：`202`，`outcome = started_new`
- 复用已有活动运行：`200`，`outcome = returned_existing_active`
- 重复启动被拒绝：`409`，`outcome = rejected_duplicate`
- Webhook 身份验证失败：`401`
- 缺少 `workflow_type` 或 `instance_id` 无效：`422`

`WorkflowControlPlane` 契约也作为容器可解析的单例提供，以供编程调用。从 Laravel 容器解析 `Workflow\V2\Contracts\WorkflowControlPlane`，即可在 PHP 代码、测试或 Artisan 命令中直接调用 `start()`、`signal()`、`query()`、`update()`、`cancel()`、`terminate()` 和 `describe()`。

Webhook 系统覆盖显式别名启动接收、实例目标和运行目标的信号、更新、查询、描述、修复、取消、终止命令 Webhook，工作流和活动任务轮询路由，以及基于类型键创建工作流的控制平面启动路由。
