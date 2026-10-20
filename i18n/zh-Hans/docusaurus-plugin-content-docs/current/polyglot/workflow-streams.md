---
title: 工作流流
description: 使用 PHP、Python 和 Rust SDK 生产和消费作用域限于单次运行的持久化输出流。
tags:
  - service-mode
  - workflow-streams
  - php
  - python
  - rust
---

# 工作流流 {#workflow-streams}

工作流流是由 Durable Workflow Server 管理的具名输出日志，作用域限于单次运行。PHP、Python 和 Rust 提供类型化的列表、描述、订阅、追加、关闭及错误操作，应用无需自行组装 HTTP 请求。运行时公布 `durable-workflow.v2.workflow-streams.contract@1`；[机器可读的 SDK 矩阵](/workflow-stream-capabilities.json) 记录各 SDK 的精确支持范围。

每条流从 0 开始分配单调递增的偏移量。一页的 `next_offset` 是下次请求的起始偏移量，包含该位置。向消费者交付采用至少一次语义：先完成该页的幂等副作用，再持久化 `next_offset` 检查点。在写入该检查点前崩溃，可能导致条目重新交付。

## 从工作流代码输出 {#emit-from-workflow-code}

三个 SDK 都通过相同的确定性命令边界输出：`record_side_effect.workflow_stream`。各 SDK 根据任务的持久化工作流命令标识、流命令序号及批次索引派生条目幂等键。Server 将流变更与记录的副作用一起提交。重放消费该副作用，不会为同一次逻辑追加创建另一个持久化条目。

PHP：

```php
use DurableWorkflow\Model\WorkflowStreamAppendItem;

$context->appendWorkflowStream('progress', [
    new WorkflowStreamAppendItem(['percent' => 50]),
]);
$context->closeWorkflowStream('progress');
```

Python：

```python
from durable_workflow import WorkflowStreamAppendItem

yield ctx.append_workflow_stream("progress", [
    WorkflowStreamAppendItem(payload={"percent": 50}),
])
yield ctx.close_workflow_stream("progress")
```

Rust：

```rust
let item = WorkflowStreamAppendItem::new(serde_json::json!({"percent": 50}))?;
ctx.append_workflow_stream("progress", &[item], None)?;
ctx.close_workflow_stream("progress", None)?;
```

工作流辅助方法用于确定性编写。工作流外部的代码可以使用各客户端的类型化 `append` 操作，并提供自己的稳定幂等键。

## 订阅与恢复 {#subscribe-and-resume}

订阅读取大小有限的一页，可选择等待新条目，最长 60 秒。PHP 支持在有限轮询之间调用取消回调。Python 支持普通任务取消，或使用 `asyncio.Event` 取消正在进行的轮询。丢弃 Rust 的订阅 future 会取消其请求。

| SDK | 分页操作 | 恢复值 | 类型化迭代 |
| --- | --- | --- | --- |
| PHP | `subscribeWorkflowStream(...)` | `WorkflowStreamPage::$nextOffset` | `iterateWorkflowStream(...)` |
| Python | `await subscribe_workflow_stream(...)` | `WorkflowStreamPage.next_offset` | `iter_workflow_stream(...)` |
| Rust | `subscribe_workflow_stream(...).await` | `WorkflowStreamPage::next_offset` | 重复执行有限分页 future，直到 `terminal`。 |

生命周期状态为 `open`、`closed` 和 `errored`。类型化描述还提供 `last_offset`、`total_items`、`pending_items` 及 `error_reason`。向终态流追加会被拒绝。达到配置的待处理条目上限时，追加返回 `stream_full`；生产者必须降低速度，或等待消费者清空流。

## 外部载荷引用 {#external-payload-references}

内联值使用共享的 Avro Value 信封。外部引用遵循各 SDK 现有的存储契约，不引入另一种传输方式：

| SDK | 外部引用行为 |
| --- | --- |
| PHP | 追加并返回不透明的 `payload_reference`；存储上传和获取仍由应用负责。 |
| Python | 使用配置的外部存储驱动上传、校验完整性、缓存、获取及解码外部 Avro 信封。未配置驱动时，调用方可以追加或检查不透明的 `payload_reference`。 |
| Rust | 追加并返回不透明引用及其元数据。当前 Rust SDK 不声明支持外部存储驱动。 |

## 工作流流与嵌入式 MessageStream {#workflow-streams-and-embedded-messagestream}

行为一致的地方采用一致的名称，但两种模型不能互换。

| 概念 | 服务模式工作流流 | 嵌入式 Laravel MessageStream |
| --- | --- | --- |
| 地址 | 工作流运行 + 流名称 | 工作流实例/运行 + 流键 |
| 方向 | 仅工作流输出 | 工作流收件箱和发件箱 |
| 首个偏移量 | 0 | 1 |
| 交付 | 至少一次；消费者管理检查点 | 至少一次；引擎管理消息游标 |
| 继续为新运行 | 不转移流游标 | 收件箱游标转移到后续运行 |
| 向工作流发送消息 | 不提供；使用信号或更新 | 通过 `inbox()->receive()` 提供 |

Waterline 为两种模式使用一个标准化表，展示模式、生命周期、头部/游标偏移量、待处理数量、方向及错误。它不会把服务输出流显示为工作流入站收件箱。

## 资格验证 {#qualification}

公开的[工作流流场景清单](/platform-conformance/workflow-stream-runtime-scenarios.json) 要求使用已发布制品验证 PHP 生产者到 Python 和 Rust 消费者、生产者 Worker 重启、消费者重连、生命周期/背压/取消，以及外部载荷引用。发布结果必须记录每个必需场景；仅有源码单元测试不能作为一致性证据。
