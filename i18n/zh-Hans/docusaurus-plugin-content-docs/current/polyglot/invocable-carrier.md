---
sidebar_position: 4
title: 可调用 HTTP 载体
description: 配置仅支持活动的 invocable_http 载体，让服务器将已租用活动任务 POST 到 HTTPS 处理器端点，并核对结构化结果。
tags:
  - external-execution
  - invocable-carrier
  - worker-protocol
keywords:
  - 可调用载体
  - invocable_http
  - 外部执行器配置
  - 活动 HTTP 处理器
  - 外部任务输入封装
  - 外部任务结果封装
---

# 可调用 HTTP 载体 {#invocable-http-carrier}

可调用 HTTP 载体是[外部执行接口](./external-execution.md)定义的第一个具体载体。它由 `GET /api/cluster/info` 的 `worker_protocol.invocable_carrier_contract` 发布，使用 `schema: durable-workflow.v2.invocable-carrier.contract`、`version: 1` 和 `carrier_type: invocable_http`。

配置的处理器映射解析到 `invocable_http` 载体时，服务器携带与载体无关的[外部任务输入封装](./external-execution.md#published-contract-seams)调用配置的端点，并根据[外部任务结果封装](./external-execution.md#published-contract-seams)核对响应。工作流任务、信号和更新排序、重放及历史变更仍在服务器内进行。载体仅跨 HTTPS 边界传递已声明的输入和结果封装。

## 用途 {#what-it-is}

可调用 HTTP 载体适用于运维团队希望作为 HTTPS 处理器托管，而非长轮询 Worker 的活动工作：

- 托管在内部 HTTP 服务中的运维维护活动和平台自动化
- 已以 HTTPS 端点作为终点的有界集成交接
- 为每个活动类型提供单个 POST 路由的无服务器或容器化活动处理器

活动执行委托给配置的端点。持久工作流状态、历史和活动完成契约仍由服务器负责。

## 仅支持活动的范围 {#activity-only-scope}

已发布清单将载体范围固定为 `task_kinds: [activity_task]`，并明确列出不包含的目标，防止配置改变边界：

- `workflow_task_execution`：工作流任务仍在真正的工作流运行时执行
- `workflow_replay`：载体从不重放工作流历史
- `history_mutation`：处理器不得直接编辑事件历史
- `generic_webhook_ingress`：通用入口通过桥接适配器实现，不通过此载体

处理器映射使用非活动 `kind`，或载体映射使用非 `activity_task` 能力时，配置验证以 `invalid_invocable_carrier_scope` 失败，该映射不会出现在活动轮询响应中。

## HTTPS 目标与方法 {#https-target-and-method}

服务器在公布映射前验证载体的 `target_fields`：

| 字段 | 必填 | 允许值 | 说明 |
| --- | --- | --- | --- |
| `url` | 是 | 绝对 HTTPS URL，或供本地开发使用的回环 HTTP（`localhost`、`127.0.0.0/8`、`::1`） | 禁止 URL 凭据（`scheme://user:pass@host`）。 |
| `method` | 否 | `POST` | 默认为 `POST`，不接受其他 HTTP 方法。 |
| `timeout_seconds` | 否 | 1–900 的整数 | 单次处理器尝试的传输截止时间。服务器或运行时单独实施任务截止时间。 |
| `retry_policy` | 否 | 对象，见下文 | 由载体管理的传输重试预算。 |

无效目标以 `invalid_carrier_target` 拒绝处理，绝不会出现在发现输出中。

## 认证模型 {#auth-model}

非回环的 `invocable_http` 映射必须从外部执行器配置解析出 `auth_ref`。只有回环 HTTP 目标允许无认证的可调用 HTTP，方便开发人员在本地迭代。

- `auth_refs` 在配置顶层声明一次，并由默认项或单个映射引用。支持类型包括 `profile`、`env`、`token_file`、`mtls` 和 `signed_headers`。
- 映射解析到非回环目标，但没有有效 `auth_ref` 时，配置验证以 `missing_invocable_auth_ref` 失败。
- 令牌、秘密、签名和认证头绝不在集群诊断、`dw server:info` 输出或活动轮询响应中回显。映射诊断报告解析到哪个 `auth_ref` 以及脱敏摘要，绝不报告凭据值。

这样，运维人员可以读取脱敏的运行时诊断，确认会使用哪个认证秘密，而服务器不会暴露秘密本身。

## 传输重试与持久活动重试 {#transport-retry-versus-durable-activity-retry}

可调用载体上可选的 `retry_policy` **仅用于传输**，控制处理器报告结果前载体的 HTTP 投递：

| `retry_policy` 字段 | 允许值 | 默认值 | 含义 |
| --- | --- | --- | --- |
| `max_attempts` | 1–5 的整数 | `1` | 同一任务租约内载体最多进行的 HTTP 投递尝试次数。 |
| `backoff_seconds` | 整数数组，每项 0–300，最多 5 项 | `[]` | 下一次 HTTP 尝试前，各次尝试的退避时间。 |
| `retryable_status_codes` | `[408, 425, 429, "5xx"]` 的子集 | `[408, 429, "5xx"]` | 视为可进行传输重试的响应码。 |

传输重试不会成为历史事件。服务器只获知载体的最终尝试：处理器返回的结构化成功或失败封装、映射为 `failure.kind=timeout, classification=deadline_exceeded` 的传输超时，或某种格式错误输出结果。

处理器报告结果后，**持久活动重试策略仍由服务器或运行时负责**。任务级重试、调度和退避继续遵循工作流侧声明的活动重试策略。载体的 `retry_policy` 不会延长、覆盖或替代该策略。

## 请求与响应封装 {#request-and-response-envelope}

服务器发送与载体无关的输入封装，并期望返回与载体无关的结果封装：

| 方向 | 内容类型 | Schema |
| --- | --- | --- |
| 请求 | `application/vnd.durable-workflow.external-task-input+json` | `external_task_input_contract` |
| 响应 | `application/vnd.durable-workflow.external-task-result+json` | `external_task_result_contract` |

处理器必须保留输入封装的 `task.id`、`task.attempt` 和 `task.idempotency_key`，并返回声明的成功或失败封装；否则通过格式错误输出映射明确拒绝处理。

载体以确定性方式将传输事实映射到结果事实：

- 传输超时 → `failure.kind=timeout`、`classification=deadline_exceeded`
- 非 2xx 响应且没有有效结果封装 → `malformed_output`
- 响应 JSON 无效或与 schema 不匹配 → `malformed_output`
- 结果封装引用不受支持的负载引用 → `unsupported_payload`

处理器必须幂等。如果载体重试传输投递，或运行时重新投递未完成租约，相同的 `task.id` 和 `task.idempotency_key` 可能多次到达。

## 配置示例 {#configuration-example}

服务器从 `DW_EXTERNAL_EXECUTOR_CONFIG_PATH` 读取处理器映射，可选择通过 `DW_EXTERNAL_EXECUTOR_CONFIG_OVERLAY` 指定覆盖层。完整环境变量列表见 [Server 配置参考](./server-config-reference.md)。

以下最小 `durable-workflow.external-executor.config` 文档注册一个 `invocable_http` 载体和一个活动映射：

```json
{
  "schema": "durable-workflow.external-executor.config",
  "version": 1,
  "defaults": {
    "profile": "prod",
    "namespace": "operations",
    "task_queue": "operator-tasks",
    "auth_ref": "handler-token"
  },
  "auth_refs": {
    "handler-token": {
      "type": "env",
      "env": "DURABLE_WORKFLOW_HANDLER_TOKEN"
    }
  },
  "carriers": {
    "ops-invocable": {
      "type": "invocable_http",
      "url": "https://handlers.example.com/durable/activity",
      "method": "POST",
      "timeout_seconds": 60,
      "capabilities": ["activity_task"],
      "retry_policy": {
        "max_attempts": 3,
        "backoff_seconds": [2, 5],
        "retryable_status_codes": [408, 429, "5xx"]
      }
    }
  },
  "mappings": [
    {
      "name": "billing.reconcile-ledger",
      "kind": "activity",
      "task_queue": "operator-tasks",
      "activity_type": "billing.reconcile-ledger",
      "carrier": "ops-invocable",
      "handler": "billing.reconcile-ledger",
      "timeout_seconds": 60
    }
  ]
}
```

本地回环开发配置使用 `"url": "http://127.0.0.1:8080/durable/activity"`，并可省略 `auth_ref`，因为回环 HTTP 是唯一允许无认证的路径。

## 检查与诊断 {#inspection-and-diagnostics}

两个 CLI 命令从运行中的服务器展示已发布的可调用载体契约：

- `dw server:info` 显示 schema 名称、契约版本、载体类型、任务种类、允许的请求与响应内容类型，以及脱敏的外部执行器映射诊断。使用它确认服务器加载了预期映射。
- `dw doctor` 执行 cluster-info 诊断，输出 `invocable_carrier_contract` 块，并显示阻止映射被声明的 `invalid_carrier_target`、`missing_invocable_auth_ref`、`invalid_invocable_carrier_scope`、`unknown_carrier`、`unknown_auth_ref` 或 `unknown_handler` 错误。

活动轮询响应本身报告解析后的映射、已脱敏认证信息的载体目标，以及有效的 `retry_policy`。Worker 和运维工具应以这些字段为依据，不要缓存自己的配置文件副本作为权威来源。

## 共存与发布 {#coexistence-and-rollout}

可调用载体的发布边界在同一清单中规定：

- 基于轮询的载体和 `invocable_http` 载体仅在映射按活动类型区分时，才可共享队列。两个映射不能同时认领相同的 `(task_queue, activity_type)` 组合。
- 删除映射引用的凭据前，运维人员必须先移除可调用映射，或通过覆盖层禁用它。在映射排空前移除凭据，会让每次新尝试都进入 `failure.kind=auth`，不会悄然成功。
- 载体 `retry_policy` 仅控制传输。持久活动重试策略仍是决定工作流观察到多少次任务尝试的唯一权威。

## 相关接口 {#related-surfaces}

- [外部执行接口](./external-execution.md)：此载体实现的、与载体无关的产品边界。
- [PHP 可调用活动处理器](./invocable-php-handler.md)：外部进程用于解析输入封装、派发活动可调用对象，并输出此载体期望的结构化结果封装的 PHP 辅助工具。
- [Server 配置参考](./server-config-reference.md)：`DW_EXTERNAL_EXECUTOR_CONFIG_PATH` 和 `DW_EXTERNAL_EXECUTOR_CONFIG_OVERLAY` 环境变量。
- [外部负载存储](../features/external-payload-storage.md)：如何将过大请求或结果负载转存到配置的驱动，并在可调用载体使用的同一输入与结果 schema 中表示为可验证的引用封装。
- [Worker 协议](./worker-protocol.md)：更广泛的 Worker 平面契约，在发布此载体的同时也规定基于轮询的处理器形式。
