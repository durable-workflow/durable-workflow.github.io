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

# 外部载荷存储 {#external-payload-storage}

外部载荷存储将大型工作流载荷转存至可插拔对象存储（S3、GCS、Azure Blob 或本地文件系统），并用小型、可验证的引用信封替换工作流历史中的内联字节。活动或子工作流参数、结果、信号或更新载荷过大，不适合内联存储在工作流历史对应的数据库行中时，使用此功能。

编码大小低于命名空间阈值时，运行时仍使用内联载荷。只有达到阈值的载荷才写入配置的驱动，并以 `durable-workflow.v2.external-payload-reference.v1` 信封记录到历史。引用缺失、被修改或超出配置前缀时，重放和历史导出会拒绝继续；系统绝不会为缺失的二进制对象悄然替换空值。

## 使用场景 {#when-to-use-it}

应用确实需要通过工作流传递超过数百 KB 的字节数据时，优先使用外部载荷存储：

- 文档和媒体处理管道，在活动之间传递 PDF、图像或音频二进制数据。
- 报表、导出或归档，最终输出为大型序列化产物。
- 外部系统产生的消息流载荷，且系统未提供工作流可直接引用的稳定对象 URL。
- 其他会触发 [`payload_size_bytes` 结构限制](../constraints/structural-limits.md#payload-size)的载荷。

控制平面字段、ID、状态标记和典型 JSON 等小载荷仍内联存储，不产生额外费用。策略由阈值控制，因此在命名空间启用外部存储不会移动小载荷。

## 转存原理 {#how-offload-works}

每个命名空间具有独立的外部载荷存储策略。运行时为持久存储编码载荷时，会将编码字节长度与配置的 `threshold_bytes` 比较：

- 编码大小低于阈值：载荷仍以内联方式存储，历史不变。
- 编码大小达到或超过阈值：运行时将编码字节交给配置的驱动，接收驱动管理的 URI，并在历史中记录外部载荷引用。引用包含 URI、SHA-256 哈希、准确字节长度、载荷编解码器，以及可选的 `expires_at` 提示。

重放时，Worker 通过同一驱动获取引用的字节，验证返回对象的大小和 SHA-256 符合预期后，才交给解码器。大小或哈希不匹配会抛出 `ExternalPayloadIntegrityException`（PHP）或 `ExternalPayloadIntegrityError`（Python），表现为重放失败，绝不会静默返回空载荷。

引用信封是稳定的线格式。无论由 PHP 工作流、Python SDK Worker 还是直接 HTTP API 调用方产生，格式均相同。完整字段契约见[外部载荷引用信封](../polyglot/server-api-reference.md#external-payload-reference-envelope)。

## 解码信任边界 {#decode-trust-boundary}

载荷存储和载荷解码是独立的信任边界。对象存储可保存编码字节或引用，而解码这些字节的编解码服务、自定义解码器、Worker 进程或历史导出工具能够看到明文应用载荷。

将任何编解码服务视为客户自行管理的信任边界：明确其运行位置、可访问的网络、可使用的密钥、输出的审计日志，以及解码预览到达运维界面前的脱敏方式。Durable Workflow 记录编解码器名称、引用 URI、哈希、大小、模式指纹和有界预览，但这些事实不等同于端到端加密。

## 驱动选择 {#driver-choices}

| 驱动 | URI 方案 | 典型用途 |
| --- | --- | --- |
| `local` | `file://` | 本地开发、CI，以及 Server 和 Worker 共享文件系统的单节点部署。Worker 与 Server 位于不同主机时不适用。 |
| `s3` | `s3://` | 通过服务端文件系统磁盘访问 Amazon S3 及兼容 S3 的对象存储，如 MinIO、Cloudflare R2 等。 |
| `gcs` | `gs://` | 通过服务端文件系统磁盘访问 Google Cloud Storage。 |
| `azure` | `azure://` | 通过服务端文件系统磁盘访问 Azure Blob Storage。 |

对象存储驱动通过具名的服务端文件系统磁盘配置实际桶／容器凭据，因此秘密保存在 Server 配置中，而非命名空间策略记录中。

## 配置命名空间 {#configuring-a-namespace}

通过 [CLI](../polyglot/cli-reference.md#namespace-and-search-attribute-commands) 或 [Server HTTP API](../polyglot/server-api-reference.md#namespace-and-storage) 配置策略。二者在命名空间记录中写入相同的 `external_payload_storage` 信封。

### 使用 CLI {#with-the-cli}

```bash
# Production namespace using Amazon S3 through the 'external-payload-objects' disk.
dw namespace:set-storage-driver billing s3 \
  --disk=external-payload-objects \
  --bucket=dw-payloads \
  --prefix=billing/ \
  --threshold-bytes=2097152

# Development namespace using the local filesystem.
dw namespace:set-storage-driver dev local \
  --uri=file:///var/lib/durable-workflow/payloads

# Disable offload while keeping the policy record (all payloads stay inline).
dw namespace:set-storage-driver billing s3 \
  --disk=external-payload-objects \
  --bucket=dw-payloads \
  --disable
```

### 使用 Server API {#with-the-server-api}

```bash
curl -sS -X PUT "$DURABLE_WORKFLOW_SERVER_URL/api/namespaces/billing/external-storage" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "driver": "s3",
    "threshold_bytes": 2097152,
    "config": {
      "disk": "external-payload-objects",
      "bucket": "dw-payloads",
      "prefix": "billing/"
    }
  }'
```

`GET /api/namespaces/{name}` 或 `dw namespace:describe` 返回的命名空间描述携带解析后的 `external_payload_storage` 信封，使运维人员和自动化无需再次写入即可验证生效策略。

## 验证策略 {#verifying-the-policy}

在开放工作流流量前，使用往返诊断，证明配置的策略确实能以命名空间凭据写入和读取字节：

```bash
dw storage:test --namespace=billing --large-bytes=2097152 --json
```

诊断写入一个小型内联载荷和一个超过阈值的载荷，重新获取二者，验证大小和 SHA-256，并返回机器可读的 `small_payload` 和 `large_payload` 结果对象。大载荷结果通过，证明驱动可以端到端产生有效的 `durable-workflow.v2.external-payload-reference.v1` 信封。诊断失败应视为存储策略问题。策略无法通过往返测试的命名空间，不应开放工作流流量。

## 选择阈值 {#picking-a-threshold}

默认行为是保留内联载荷，直到达到 `threshold_bytes`。建议的起点：

- 根据内联载荷开始造成运维压力的大小设置阈值，通常是编码后 256 KiB 至 2 MiB。
- 在命名空间 [`payload_size_bytes`](../constraints/structural-limits.md#payload-size) 结构限制之下保留充足余量，使限制检查引用信封，而非字节数据本身。
- 每个命名空间设置单一阈值。根据每次运行产生最多字节的活动或工作流选择，而不是针对中位数载荷调节。

阈值设得过低没有益处：小载荷通过数据库往返比外部存储更快，引用信封本身也会消耗少量历史空间。

## 重放、保留与清理 {#replay-retention-and-cleanup}

- **重放完整性。** 每次获取都会按引用的 `size_bytes` 和 `sha256` 验证存储对象。二进制对象被修改或缺失时抛出完整性异常，不会静默替换为其他值。
- **已验证获取缓存。** Worker 按 `(uri, sha256, size, codec)` 缓存已验证字节，并限制条目数和总字节数。同一运行重复读取历史时可避免重新获取相同对象，同时不削弱首次加载的完整性检查。
- **保留。** Server 保留清理过程删除工作流运行时，也删除该运行历史引用的外部载荷对象。只要保留清理正常运行，孤立对象就不会持续累积。
- **历史导出。** 导出历史保留引用信封。需要引用字节的下游消费者应通过同一驱动获取，并在解码前按信封验证。导出格式不会内联外部字节。

## 从代码使用 {#using-it-from-code}

多数应用无需直接调用存储 API：运行时根据命名空间策略透明转存，SDK 在重放时解码引用。需要在运行时之外构建或消费信封的应用，例如语言无关桥接处理器或合成大载荷的测试，可使用 SDK 辅助工具。

- **PHP（工作流包）。** `Workflow\V2\Support\ExternalPayloadStorage` 通过实现 `Workflow\V2\Contracts\ExternalPayloadStorageDriver` 的任意驱动存储和获取字节。`LocalFilesystemExternalPayloadStorage` 处理 `file://` URI，独立 Server 附带的文件系统磁盘驱动通过具名 Laravel 磁盘支持 `s3`、`gcs` 和 `azure` 策略驱动。
- **Python SDK。** [外部载荷存储](../polyglot/python.md#external-payload-storage)介绍 `ExternalPayloadReference`、`ExternalPayloadCache`、`store_external_payload()`、`fetch_external_payload()`，以及 `LocalFilesystemExternalStorage`、`S3ExternalStorage`、`GCSExternalStorage` 和 `AzureBlobExternalStorage` 适配器。云 SDK 客户端仍由应用管理；SDK 不将 boto3、google-cloud-storage 或 azure-storage-blob 添加为运行时依赖。
- **直接 HTTP。** 手动编码载荷的 HTTP 调用方可通过驱动存储字节，再将引用信封作为请求的载荷字段提交。Worker 协议载荷信封（`{codec, blob}`）仍用于携带活动参数、结果、信号载荷和更新载荷的引用。

## 另请参阅 {#see-also}

- [传递数据](../defining-workflows/passing-data.md)：默认内联载荷契约。
- [结构限制：载荷大小](../constraints/structural-limits.md#payload-size)：外部存储帮助满足的引擎强制上限。
- [Server API 参考：命名空间与存储](../polyglot/server-api-reference.md#namespace-and-storage)：完整 HTTP 契约，包括引用信封字段。
- [CLI 参考：命名空间与搜索属性命令](../polyglot/cli-reference.md#namespace-and-search-attribute-commands)：`dw namespace:set-storage-driver` 和 `dw storage:test` 用法。
- [Python SDK：外部载荷存储](../polyglot/python.md#external-payload-storage)：Python 侧驱动、辅助函数和重放缓存指南。
