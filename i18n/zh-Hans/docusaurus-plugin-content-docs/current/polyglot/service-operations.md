---
title: 跨命名空间服务调用
description: 发布服务操作，并从其他命名空间持久调用它。
---

# 跨命名空间服务调用 {#cross-namespace-service-calls}

服务操作也称为 Nexus 操作，是同一个 Durable Workflow 集群内受支持的跨命名空间持久调用。地址由目标命名空间和端点/服务/操作三元组组成。子工作流或普通信号仍属于自己的命名空间。队列名称和编程语言都不会改变这一规则。

## 选择受支持的编写接口 {#choose-a-supported-authoring-surface}

| 调用方 | 已发布接口 | 目标命名空间 |
| --- | --- | --- |
| 嵌入式 PHP | `Workflow::serviceOperation()` 或辅助函数 `serviceOperation()` | `ServiceOperationOptions(targetNamespace: 'billing')` |
| PHP SDK | `WorkflowContext::serviceOperation()` | 数组选项 `['namespace' => 'billing']` |
| Python SDK | `yield context.call_nexus_service(...)` | 关键字参数 `target_namespace='billing'` |
| Rust SDK | 尚未发布可编写的 Nexus 等待接口 | 由 [Rust SDK #86](https://github.com/durable-workflow/sdk-rust/issues/86) 跟踪。暂缓的草稿不代表已安装版本支持。 |

Laravel 工作流请参考[嵌入式示例](../features/service-operations.md)，顺序编写的 Worker API 请参考 [PHP SDK 服务调用示例](https://php.durable-workflow.com/build/workflows-activities/)，生成器编写方式请参考 [Python 工作流参考](https://python.durable-workflow.com/reference/workflow/)。部署调用方之前，先发现所连接运行时公布的服务操作契约。仅有客户端管理 API 并不能证明工作流 Worker 支持此功能。

PHP SDK 当前通过数组选项编写跨命名空间调用。等效的类型化选项由 [PHP SDK #193](https://github.com/durable-workflow/sdk-php/issues/193) 跟踪。

## 发布目标操作 {#publish-the-target-operation}

目标命名空间拥有端点、服务、操作及处理程序 Worker。先创建命名空间，再运行一个在所选队列注册目标工作流类型的 Worker。以下目录使用命名空间 `billing`、工作流类型 `billing.invoice` 和队列 `billing`。

修改目录需要管理员凭据。当持有租约的工作流发出服务命令时，运行时会另外检查调用方权限。

```bash
curl --fail-with-body -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/service-endpoints" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: billing" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"endpoint_name":"billing"}'

curl --fail-with-body -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/service-endpoints/billing/services" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: billing" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"service_name":"invoices"}'

curl --fail-with-body -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/service-endpoints/billing/services/invoices/operations" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: billing" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"operation_name":"create","operation_mode":"sync","handler_binding_kind":"start_workflow","handler_target_reference":"billing.invoice","handler_binding":{"workflow_type":"billing.invoice","queue":"billing"},"deadline_policy":{"timeout_seconds":30}}'
```

目录名称会规范化为小写。端点和服务记录用于组织操作，并不能替代真正的处理程序。请让兼容的 Worker 在目标命名空间中保持可用。注册不代表工作已经执行。

## 等待与记录的结果 {#waiting-and-recorded-results}

PHP SDK 默认使用 `mode_override=sync` 和 `wait_for=completed`。Python 使用 `mode='sync'` 和 `wait_for='completed'`。两者都会挂起，直到服务达到持久终态，再在原调用位置重放记录的结果或带类型的失败。pending 或 started 调用并不是成功的业务结果。

若只等待接纳，PHP 使用 `wait_for='accepted'` 或 `mode_override='async'`；Python 支持 `wait_for='accepted'`、`mode='async'` 和辅助函数 `start_nexus_operation()`。请保存返回的调用 id 以供检查。稍后的完成不会替换调用方原来记录的接纳结果。如果工作流决策需要目标结果，请选择等待完成。

如上所示，通过目录的 `deadline_policy` 限制服务执行。它只接受以下两项之一：正整数 `timeout_seconds`，或带时区偏移的 RFC3339 `deadline_at`。运行时根据原始接纳记录唯一的 `call_deadline_at`。重放、重试和后续目录修改都不能重置它。null 策略不会创建新的服务截止时间。

不要把调用方的 `wait_timeout_seconds` 当作执行超时。未设置目录截止时间时，一秒的等待选项仍可能返回在三秒后完成的目标结果。超时后请检查原调用及关联目标。到期并不证明外部副作用没有发生，目标取消由另一项策略决定。

## 失败、重试与幂等性 {#failures-retries-and-idempotency}

PHP 通过 `ServiceOperationFailed` 暴露服务终态失败；Python 在 yield 位置抛出 `NexusOperationFailed`。处理错误时请保留带类型的详细信息和调用 id。预期的业务失败可由工作流代码处理；意外失败可以继续作为工作流失败传播。

运行时负责已记录的服务重试策略。不要在工作流代码中再添加一层 HTTP 重试循环。PHP 和 Python 会为普通工作流调用生成稳定键。如果应用提供键，请在重试和重放中保持目标、请求及预期操作一致。新键代表新的业务请求，而不是恢复丢失的确认。

对于开放历史，请保持目标命名空间、目录三元组、负载和等待选项稳定。持久意图改变时，使用工作流版本分支。

## 强制命名空间边界 {#enforce-the-namespace-boundary}

跨命名空间默认值为 `allow`。身份验证、角色检查、其他边界策略和命名空间授权仍然适用。调用方身份来自持有租约的工作流，应用输入不能冒充另一个调用方命名空间。

如果自托管 PHP Server 应拒绝跨命名空间服务调用，请一致地配置并重启其 API/Worker 角色：

```bash
DW_SERVICE_BOUNDARY_CROSS_NAMESPACE_DEFAULT=deny
```

该策略在分派处理程序前拒绝跨命名空间调用。同一命名空间的调用和其他边界策略仍需单独检查。不要将此变量当作凭据或租户 ACL 的替代品。

## 检查原调用 {#inspect-the-original-call}

使用[服务调用详情及目录 API](./server-api-reference.md#service-catalog-admin-apis) 或 [CLI 服务调用检查](./cli-reference.md#service-call-inspection)。请一起保留调用方的工作流/运行 id 和目标服务调用 id。只读检查不会请求再次执行。检查丢失的响应或替换 Worker 时，请复用原 id。
