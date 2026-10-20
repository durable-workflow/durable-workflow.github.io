---
sidebar_position: 21
tags:
  - payloads
  - storage
  - history
keywords:
  - 外部载荷存储
  - 大型载荷
  - 载荷转存
  - S3 存储
  - GCS 存储
  - Azure Blob 存储
---

# 外部负载存储 {#external-payload-storage}

在嵌入式 Laravel 中，外部存储会把工作流历史中的大型编码值替换为指向应用自有存储的可验证引用。本页说明这一存储边界。服务模式的客户端和 Worker 使用 [Server 运行时传输](../polyglot/server-api-reference.md#runtime-external-payload-transport)：Server 保管提供商凭据，SDK 通过经过身份验证的 HTTP 交换不透明引用 ID。提供商 URI 不是 Server 接受的负载封装。

## 何时使用 {#when-to-use-it}

当大型文档、媒体、报表、活动参数或结果确实需要经过持久执行时，使用外部存储。小值保持内联，不需要向对象存储写入。外置负载不会取消负载大小、历史事件数量的限制，也不会消除限制单次运行保留对象数量的需要。

## 外置机制 {#how-offload-works}

应用的命名空间策略提供存储驱动和正数 `threshold_bytes`。编码后大小**大于**阈值的负载由驱动保存。等于或小于阈值的值保持内联。策略禁用或缺少驱动时，值也保持内联。

嵌入式提供商引用使用 `durable-workflow.v2.external-payload-reference.v1` 模式，包含 `uri`、`sha256`、`size_bytes`、`codec` 和可选的 `expires_at`。编解码器为 `avro`。`Workflow\V2\Support\ExternalPayloads` 用 `dw-external-payload:v1:` 前缀保存编码封装。运行时需要值时，会获取编码字节，在解码前验证大小和 SHA-256。字节缺失或改变会导致失败，绝不会用 `null` 替代。

这种提供商引用不同于 Server 的 `durable-workflow.v2.runtime-external-payload-reference.v1` 模式。在不同部署模式之间搬用驱动辅助函数或已存封装前，请查看[各模式支持表](../polyglot/server-api-reference.md#external-payload-support-by-mode)。

## 解码的信任边界 {#decode-trust-boundary}

存储与解码有各自的信任边界。提供商可以保存编码字节，而解码它们的 Worker、编解码服务器或导出工具可以看到应用值。请明确解码器运行位置、可访问的密钥，以及预览和日志如何脱敏。哈希、大小和编解码器名称只是完整性元数据，不代表端到端加密保证。提供商 URI 也可能包含敏感对象名。

## 驱动选择 {#driver-choices}

| 驱动 | URI 协议 | 嵌入式模式要求 |
| --- | --- | --- |
| 本地文件系统 | `file://` | 所有解析引用的嵌入式进程必须能访问同一存储根目录。 |
| S3 兼容存储 | `s3://` | 由应用管理的驱动或文件系统磁盘，并配置正确的 bucket、前缀和凭据。 |
| Google Cloud Storage | `gs://` | 由应用管理的驱动或磁盘，以及提供商客户端。 |
| Azure Blob Storage | `azure://` | 由应用管理的驱动或磁盘，以及提供商客户端。 |

Server 自身可以使用本地存储，而远程 SDK Worker 通过 HTTP 获取数据。这些 Worker 不需要共享文件系统或提供商凭据。

## 配置命名空间 {#configuring-a-namespace}

嵌入式应用在自身 Laravel 运行时配置命名空间存储策略和 `ExternalPayloadStorageDriver`。凭据应放在应用配置中，而非工作流参数、历史或引用 URI 中。执行和重放同一运行的进程应使用一致的策略。

对于自托管 Server，管理用[命名空间存储 API](../polyglot/server-api-reference.md#namespace-and-storage) 和 [CLI 存储命令](../polyglot/cli-reference.md#namespace-and-search-attribute-commands)配置 Server 自有策略。这些操作不会让 SDK Worker 获得对提供商的直接访问权。

### 使用 CLI {#with-the-cli}

`dw namespace:set-storage-driver` 配置的是 Server 命名空间，不是独立嵌入式应用的 Laravel 容器。驱动要求的磁盘、bucket 和前缀选项见 CLI 参考。

### 使用 Server API {#with-the-server-api}

`PUT /api/namespaces/{namespace}/external-storage` 是管理员策略操作。普通 SDK 客户端通过 `GET /api/cluster/info` 发现配置后的运行时传输，不会把提供商配置复制到 Worker。

## 验证策略 {#verifying-the-policy}

使用实际配置的驱动和将来执行重放的进程，测试一个大于阈值的值。获取后验证编码字节的准确长度和 SHA-256。对于 Server，`dw storage:test --namespace=billing --json` 检查配置的存储路径。存储诊断不能证明每种 SDK 的工作流执行、备份恢复或所有提供商适配器都正常。

## 选择阈值 {#picking-a-threshold}

为普通请求和负载上限预留余量。阈值针对**编码字节**，不是原始文件大小或业务 JSON 长度。阈值过低会让小值也增加存储请求和保留引用。运行时传输还可能外置更多值，让整个 HTTP 请求满足总大小限制。服务模式应采用发现的 Server 上限，不要把嵌入式阈值当作线协议上限。

## 重放、保留与清理 {#replay-retention-and-cleanup}

- **重放完整性。** 只有在获取并验证引用字节后才解码值。任何保留运行仍需使用的对象都必须保留。
- **已验证读取缓存。** `ExternalPayloadStorage` 对已验证字节缓存设有边界。清空缓存不会删除底层对象或改变其所有权。
- **保留。** 运行时清理会考虑仍被保留的所有者和共享对象。存储故障、备份保留或剩余引用可能延迟删除。运行保留清理并不保证没有孤立对象。
- **历史导出。** 导出可以不获取对象而保留引用元数据。校验和或 `history_complete` 标记并不能证明外部字节存在，也不能证明归档可重放。请遵守[备份与恢复边界](../configuration/pruning-workflows.md#export-before-pruning)，并单独验证对象。自包含归档仍由 [Server #520](https://github.com/durable-workflow/server/issues/520) 跟踪。

## 在代码中使用 {#using-it-from-code}

嵌入式 PHP 使用 `Workflow\V2\Support\ExternalPayloadStorage` 和 `ExternalPayloadStorageDriver`。`LocalFilesystemExternalPayloadStorage` 处理本地根目录。提供商适配器负责自己的访问配置和 URI 规则。应用通常让运行时应用命名空间策略，而不是手工构造存储封装。

服务模式下，当 Server 声明传输可用时，PHP、Python 和 Rust SDK 客户端与 Worker 会自动上传和获取运行时负载。不要向 Server 提交提供商 `external_storage` 封装，也不要通过直接提供商辅助函数删除 Server 管理的对象。请参阅[上传和获取契约](../polyglot/server-api-reference.md#runtime-external-payload-transport)与 [Python 辅助函数边界](../polyglot/python.md#external-payload-storage)。

## 另请参阅 {#see-also}

- [传递数据](../defining-workflows/passing-data.md)
- [结构限制：负载大小](../constraints/structural-limits.md#payload-size)
- [Server API：运行时外部负载传输](../polyglot/server-api-reference.md#runtime-external-payload-transport)
- [Python SDK：外部负载存储](../polyglot/python.md#external-payload-storage)
