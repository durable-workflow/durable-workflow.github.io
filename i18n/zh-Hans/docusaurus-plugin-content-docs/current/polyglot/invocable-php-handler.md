---
sidebar_position: 5
title: PHP 可调用活动处理器
description: 使用 PHP InvocableActivityHandler 辅助工具，将活动处理器托管在 HTTPS 端点后，接收外部任务输入封装并返回结果封装。
tags:
  - external-execution
  - invocable-carrier
  - worker-protocol
keywords:
  - 可调用活动处理器
  - InvocableActivityHandler
  - 外部任务输入
  - 外部任务结果
  - PHP 活动适配器
  - Lambda 活动处理器
---

# PHP 可调用活动处理器 {#php-invocable-activity-handler}

[可调用 HTTP 载体](./invocable-carrier.md)让服务器将已租用活动任务 POST 到 HTTPS 端点，无须等待长轮询 Worker。PHP 辅助类 `Workflow\V2\Support\InvocableActivityHandler` 是参考实现，外部 PHP 进程使用它将请求转换为服务器可以核对的结果封装。

使用它将活动处理器接入：

- 通过 HTTPS 调用的 AWS Lambda 或 Google Cloud Function
- 精简 HTTP 服务后方的 Laravel 控制器
- 为每个活动队列提供单个 POST 端点的容器

辅助工具解析与载体无关的外部任务输入封装，查找注册的可调用对象，实施租约截止时间限制，并输出与载体无关的外部任务结果封装，包括服务器期望的失败结构。

## 快速开始 {#quick-start}

在外部进程中安装 Durable Workflow 包，为每个活动处理器名称注册一个可调用对象，并将请求体交给 `handle()`：

```php
use Workflow\V2\Support\InvocableActivityHandler;

$handler = new InvocableActivityHandler([
    'billing.charge-card' => static function (int $amount, string $currency): array {
        // Real charge-card logic. Must be idempotent per task id.
        return [
            'approved' => true,
            'amount' => $amount,
            'currency' => $currency,
        ];
    },
]);

$envelope = json_decode(file_get_contents('php://input'), associative: true);
$result = $handler->handle($envelope);

header('Content-Type: application/vnd.durable-workflow.external-task-result+json');
echo json_encode($result, JSON_UNESCAPED_SLASHES);
```

处理器接收输入封装，返回结果封装。载体契约（HTTPS、POST、认证、超时和重试预算）由可调用 HTTP 载体负责。PHP 辅助工具负责参数解码、处理器派发、截止时间实施、结果编码和失败分类。

## 注册处理器 {#registering-handlers}

构造函数的第一个参数是映射，其键为服务器在输入封装中发送的 `task.handler` 值。该值对应外部执行器配置中匹配条目的 `handler` 字段：

```php
new InvocableActivityHandler(
    handlers: [
        'billing.charge-card' => [$billingService, 'chargeCard'],
        'billing.refund' => [$billingService, 'refund'],
        'ops.rotate-key' => static fn (string $keyId): array => $keys->rotate($keyId),
    ],
    carrier: 'billing-lambda',
    resultCodec: 'avro',
);
```

输入的 `task.handler` 未注册时，产生 `failed` 结果，包含 `failure.kind = application`、`classification = application_error` 和 `type = UnknownActivityHandler`。配置的活动重试策略仍在服务器端适用。

可选的 `carrier` 名称在每个结果封装的 `metadata.carrier` 中回显，让运维人员知道哪个外部运行时产生了响应。使用稳定且适合脱敏显示的标识，例如 `billing-lambda`、`ops-cloud-run` 或 `laravel-admin-api`。

可选的 `resultCodec` 控制辅助工具如何将返回值序列化到 `result.payload.blob`。默认为 `avro`，与 PHP Worker 用于持久负载的编解码器一致。结果编解码器必须为服务器 `CodecRegistry` 所识别；不接受 `protobuf`，并会在构造函数中立即失败。

## 结果封装 {#result-envelope}

成功时，`handle()` 返回与载体无关的成功封装：

```json
{
  "schema": "durable-workflow.v2.external-task-result",
  "version": 1,
  "outcome": {
    "status": "succeeded",
    "recorded": true
  },
  "task": {
    "id": "acttask_01HV7D3G3G61TAH2YB5RK45XJS",
    "kind": "activity_task",
    "attempt": 1,
    "idempotency_key": "attempt_01HV7D3KJ1C8WQNNY8MVM8J40X"
  },
  "result": {
    "payload": {
      "codec": "avro",
      "blob": "<base64-encoded payload>"
    },
    "metadata": {
      "content_type": "application/vnd.durable-workflow.result+json"
    }
  },
  "metadata": {
    "handler": "billing.charge-card",
    "carrier": "billing-lambda",
    "duration_ms": 42
  }
}
```

`task.id`、`task.attempt` 和 `task.idempotency_key` 从输入封装复制，使服务器能够将结果与原始租约核对。

失败时，`handle()` 返回失败封装。`failure` 块包含种类、分类、消息、原始 PHP 类型、堆栈跟踪，以及失败是否可重试。截止时间失败还包含 `deadline` 名称和 `expires_at` 值：

```json
{
  "schema": "durable-workflow.v2.external-task-result",
  "version": 1,
  "outcome": {
    "status": "failed",
    "retryable": true,
    "recorded": true
  },
  "task": {"id": "...", "kind": "activity_task", "attempt": 1, "idempotency_key": "..."},
  "failure": {
    "kind": "timeout",
    "classification": "deadline_exceeded",
    "message": "Invocable activity task received after lease.expires_at.",
    "type": "ExternalTaskDeadlineExceeded",
    "stack_trace": null,
    "timeout_type": "deadline_exceeded",
    "cancelled": false,
    "details": {
      "deadline": "lease.expires_at",
      "expires_at": "2026-04-22T15:14:02.000000Z"
    }
  },
  "metadata": {"handler": "billing.charge-card", "carrier": "billing-lambda", "duration_ms": 3}
}
```

## 失败分类 {#failure-taxonomy}

| `failure.kind` | `classification` | 可重试 | 触发情况 |
| --- | --- | --- | --- |
| `timeout` | `deadline_exceeded` | 是 | 封装到达时租约或输入截止时间已过，或执行期间某个截止时间到期后处理器才返回。 |
| `decode_failure` | `decode_failure` | 否 | 无法按声明的编解码器解码参数、截止时间字符串无法解析、处理器因参数抛出 `TypeError` / `ValueError`，或无法使用配置的结果编解码器重新编码成功负载。 |
| `application` | `application_error` | 取决于抛出的异常 | 处理器抛出异常。异常实现 `Workflow\Exceptions\NonRetryableExceptionContract` 时，`retryable` 为 `false`，否则为 `true`。消息是异常消息，`type` 是异常类。 |
| `application` | `application_error` | 否 | `task.kind` 不是 `activity_task`，或映射中未注册 `task.handler`。 |

辅助工具从不返回裸异常。每条代码路径都生成结构化结果封装，使可调用载体能够以确定性方式核对响应。

## 截止时间与幂等性 {#deadlines-and-idempotency}

输入封装携带当前有效的 `lease.expires_at`，以及声明的活动截止时间（`schedule_to_start`、`start_to_close`、`schedule_to_close`、`heartbeat`）。辅助工具会检查全部截止时间：

- 派发处理器前，任何已过期的截止时间都会直接产生 `timeout` 失败，并由 `details.deadline` 指明过期字段，不调用注册的可调用对象。
- 处理器返回后，辅助工具再次检查截止时间。处理器运行时间超过租约时，产生相同的 `timeout` 失败，并从封装中丢弃返回值。

载体会重试传输投递，运行时会重新投递未报告结果的租约，因此相同的 `task.id` 和 `task.idempotency_key` 可能多次到达。处理器代码必须幂等。同一次尝试的重试在各封装中使用稳定的幂等键。

## 负载编解码器与外部存储 {#payload-codecs-and-external-storage}

参数负载通过 `payloads.arguments` 到达，并携带 `codec` 字段。辅助工具使用服务器的 `CodecRegistry` 解码。唯一的公开 v2 编解码器是 `avro`；`json`、未知编解码器、格式错误或未标记的 blob 均被拒绝处理。JSON 仍用于 HTTP 载体文档，不是持久负载编解码器。

工作流输入超过配置的[外部负载存储](../features/external-payload-storage.md)阈值时，服务器通过配置的驱动存储字节，并发送引用封装代替内联 blob。将 `ExternalPayloadStorageDriver` 传入构造函数，使辅助工具在调用处理器前解析引用：

```php
use Workflow\V2\Contracts\ExternalPayloadStorageDriver;
use Workflow\V2\Support\InvocableActivityHandler;

$handler = new InvocableActivityHandler(
    handlers: $handlers,
    carrier: 'billing-lambda',
    resultCodec: 'avro',
    externalStorage: $driver,
);
```

驱动必须满足服务器写入负载时使用的同一契约，确保引用、哈希和编解码器全部匹配。外部进程无法解析的引用会产生 `decode_failure`，不会悄然变成空负载。

## 生产环境连接 {#production-wiring}

通过单个 POST 路由托管处理器的 Laravel 控制器如下：

```php
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Workflow\V2\Support\InvocableActivityHandler;

final class BillingActivityController
{
    public function __construct(private readonly InvocableActivityHandler $handler) {}

    public function __invoke(Request $request): JsonResponse
    {
        $result = $this->handler->handle($request->all());

        return new JsonResponse(
            data: $result,
            headers: ['Content-Type' => 'application/vnd.durable-workflow.external-task-result+json'],
        );
    }
}
```

将外部执行器配置指向此控制器前方的 HTTPS URL，并声明 `auth_ref`，使路由经过认证。回环 HTTP 豁免仅用于开发迭代。

## 相关接口 {#related-surfaces}

- [可调用 HTTP 载体](./invocable-carrier.md)：投递输入封装并核对结果封装的服务器端载体契约。
- [外部执行接口](./external-execution.md)：与载体无关的产品边界，包括辅助工具实现的输入和结果封装 schema。
- [外部负载存储](../features/external-payload-storage.md)：如何将过大参数或结果转存到配置的驱动，并表示为可验证的引用封装。
- [Worker 协议](./worker-protocol.md)：更广泛的 Worker 平面契约，在发布可调用载体契约的同时也规定基于轮询的处理器形式。
