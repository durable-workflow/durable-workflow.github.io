---
title: Avro Value 协议
sidebar_label: Avro Value 协议
---

# Avro Value 协议 {#avro-value-protocol}

Durable Workflow 2.0 对所有 Avro 负载使用同一个固定的递归 [`durable_workflow.protocol.Value`](/schemas/v2/durable_workflow.protocol.Value.v1.avsc) schema。工作流输入和结果、活动值和失败详情、信号、查询、更新、重放历史，以及外部存储的负载都使用该 schema。应用无需发布自己的 Avro schema，平台也不需要网络 schema 注册服务。

Value 联合类型为 null、布尔值、有符号 64 位整数、有限双精度浮点数、字节、UTF-8 字符串、列表和字符串键映射分别定义了具名分支。因此，PHP、Python 和 Rust 中的 `7` 与 `7.0`、文本与字节、列表与映射都能保持区别。

## 线格式帧 {#wire-frame}

`blob` 字段是标准 Avro 单对象字节的 base64 编码：

```text
C3 01 || 8-byte little-endian CRC-64-AVRO fingerprint || Avro datum
```

schema v1 的指纹为 `e2a33dff55802237`。SDK 内置各个受支持指纹对应的不可变 schema，根据帧选择写入方 schema，并与当前读取方 schema 进行解析匹配。未知指纹或不兼容的新分支会以 `unsupported_payload_schema` 失败；解码器不会猜测，也不会回退到 JSON。

未来新增的值种类将作为具有唯一名称的记录分支追加到联合类型。已发布的分支永不重新排序或复用。

## 值策略 {#value-policy}

- 映射键必须为字符串。SDK 拒绝其他键，不会将其转换为字符串。
- 整数必须在 Avro `long` 的有符号 64 位范围内。
- 双精度浮点数必须有限；NaN 和无穷大均被拒绝。
- Python `bytes` 和 Rust `AvroValue::Bytes` 选择 Avro `bytes`。PHP 调用方使用 `AvroBinaryValue::fromBytes()`，因为仅凭 PHP 字符串无法声明内容是文本还是二进制。
- 十进制数、任意精度整数、日期时间、UUID、枚举、dataclass、Pydantic 对象和领域对象，需要通过显式适配器转换为规范的值种类。

Avro 是 Durable Workflow 2.0 唯一的负载编解码器。HTTP 请求和响应文档仍以 JSON 传输，但其中的每个持久值都使用该固定 schema 和单对象帧。`json` 编解码器标签、未知编解码器或未标记的原始持久 blob，都会以 `unsupported_payload_codec` 拒绝处理。运行时绝不转码或猜测。

## 用于检查的 JSON 投影 {#json-inspection-projection}

运行详情保留 `input_envelope`、`output_envelope` 和结果封装，作为无损负载的权威来源。CLI 和 Waterline 等面向 JSON 的检查接口，使用类型化投影显示 JSON 无法表示的值：

```json
{"$type":"bytes","base64":"AP8="}
{"$type":"map","entries":[{"key":"0","value":"zero"}]}
```

空映射以及看起来像数字的字符串键使用映射投影，因为 PHP 数组无法在保持其类型的情况下保留这些形式。普通标量、列表和无歧义的字符串键映射仍显示为普通 JSON 值。需要原始类型化值的使用方应解码附带的封装，而非显示投影。

## 可重复的基准测试 {#repeatable-benchmark}

每个 SDK 都附带相同的代表性值基准测试，并对其选定的生产执行路径实施性能预算：

```bash
# PHP SDK checkout
composer benchmark-avro-value

# Python SDK checkout
python benchmarks/avro_value.py --enforce

# Rust SDK checkout
cargo run --release --example avro_value_benchmark -- --enforce
```

JSON 输出比较紧凑 JSON、已移除的 JSON-in-Avro 包装和固定类型化 schema。它报告原始数据、带帧负载和实际 `{codec, blob}` HTTP 封装的大小，以及端到端适配、编码和解码延迟。验证运行器可通过 `AVRO_VALUE_ENCODE_BUDGET_US` 和 `AVRO_VALUE_DECODE_BUDGET_US` 收紧默认预算。发布 CI 执行这些命令并强制检查预算；生产执行路径出现回归时，必须在发布前解释或修正。旧包装实现仅保留在基准测试中，不是运行时兼容路径。

## 部署预检 {#deployment-preflight}

Server 引导过程清点每个已持久化的 `payload_codec`，并检查内联帧、嵌套历史封装和外部负载引用的单对象魔数及固定 schema 指纹。只要存在与活动运行或重放相关的非 Avro 负载、未标记负载、损坏引用或过时帧，部署就会在新运行时启动前停止。活动运行可以在当前预发布版上完成；保留的终态和重放相关状态必须遵循先备份的[预发布历史迁移](/docs/polyglot/prerelease-history-migration)流程。导出运行不会改变数据库中被拒绝的状态。绝不能删除历史来绕过预检。
