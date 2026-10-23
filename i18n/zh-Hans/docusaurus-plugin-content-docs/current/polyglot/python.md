---
sidebar_position: 4
tags:
  - Python
  - SDK
  - workers
  - polyglot
keywords:
  - sample-app-playground
  - Python SDK
  - durable_workflow Client
  - Python Worker
  - 异步工作流客户端
---

import ProductPromotion from '@site/src/components/ProductPromotion';
import PythonPackageReleaseLink from '@site/src/components/PythonPackageReleaseLink';

# Python SDK {#python-sdk}

Python SDK 是面向自托管 Durable Workflow Server 或 Durable Workflow Cloud 命名空间运行时的轻量、异步优先客户端。Python 进程可以通过运行时控制平面 API 启动、观察、发送信号和取消工作流，也可以注册为执行工作流任务和活动的 Worker。

## 试用本地 Sample App 试验环境 {#try-the-local-sample-app-playground}

若要通过最短路径在不使用 Cloud 的情况下编写工作流，请在 [GitHub Codespaces 中打开当前 Sample App 的 `main` 分支](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main)，然后运行：

<!-- docs-example id="sdk.python.sample-app-playground" -->
```bash
scripts/playground python
```

本地试验环境生成由调用方拥有的工作流和活动源码，选择当前稳定制品，并启动已发布的 Server 和 Waterline。它先等待与生成契约中的标识、工作流类型、活动类型和任务队列完全匹配的 Worker 注册，再启动工作流。成功要求获得预期的完成结果和历史；随后终端输出精确的本地 Waterline 运行链接和结构化 JSON 证据路径。

对于不想使用 Sample App 的用户，下方的包安装、内联快速入门、API 参考及仓库示例仍是直接路径。

<ProductPromotion source="docs-v2-python-sdk">
使用独立的角色限定凭据，对 Cloud 托管命名空间运行 Python 客户端和 Worker。
</ProductPromotion>

SDK 面向与 PHP 包相同的持久模型：实例 ID、运行 ID、历史事件、任务队列和类型键跨语言共享。Python Worker 可以处理 PHP 编写工作流的活动，反之亦然。

Python SDK、PHP SDK、Rust SDK 和 `dw` 之间的能力比较见[客户端与 Worker 能力](/docs/polyglot/cli-python-parity/)。

构造函数签名、返回类型、异常类和指标名称见生成的 [Python SDK API 参考](https://python.durable-workflow.com/)。

Python SDK 2.5.0 为粘性执行增加可选的有界历史缓存。请使用 Server 2.5.10 或更新版本，并在每个 Worker 上启用。参见[可移植 Worker 亲和性](/docs/polyglot/portable-worker-affinity)及 [Python 指南与可运行示例](https://python.durable-workflow.com/guides/sticky-execution/)。

Cloud 客户使用已配置命名空间的运行时 URL 和命名空间，并使用独立的客户端与 Worker 凭据。连接边界见 [Cloud 托管运行时](/docs/polyglot/cloud-control-plane)；下方快速入门使用本地自托管值。

## 要求 {#requirements}

- Python 3.10 或更高版本
- Docker（用于本快速入门的本地 Server）、现有的[自托管 Server](/docs/polyglot/server)，或已配置的 [Cloud 命名空间运行时](/docs/polyglot/cloud-control-plane)

## 安装 {#installation}

安装 <PythonPackageReleaseLink authority="qualified">Python SDK 稳定发布</PythonPackageReleaseLink>。精确依赖约束由与 Server 快速入门相同的制品组合生成，可用锁文件或约束文件保留以确保可重复性。

<!-- docs-example id="python.sdk.install" -->
```bash
pip install %%artifact.pythonPackagePin%%
```

SDK 使用 [httpx](https://www.python-httpx.org/) 进行 HTTP 通信，使用 `fastavro` Python 包编码唯一公开 v2 负载编解码器所采用的 Apache Avro 线格式。Prometheus 指标支持为可选项。

## 快速入门 {#quickstart}

下面的完整 Python 程序定义带一个活动的工作流，在本地 Durable Workflow Server 上启动并等待结果：

<!-- docs-example id="python.quickstart.worker" -->
```python
import asyncio
import uuid

from durable_workflow import Client, Worker, workflow, activity

@activity.defn(name="greet")
async def greet(name: str) -> dict:
    return {"greeting": f"Hello, {name}!", "length": len(name)}

@workflow.defn(name="greeter")
class GreeterWorkflow:
    def run(self, ctx, *args):
        result = yield ctx.schedule_activity("greet", list(args))
        return result

async def main():
    workflow_id = f"greeting-{uuid.uuid4().hex}"

    async with Client("http://localhost:8080", token="dev-token", namespace="default") as client:
        handle = await client.start_workflow(
            workflow_type="greeter",
            task_queue="default",
            workflow_id=workflow_id,
            input=["world"],
        )

        worker = Worker(
            client,
            task_queue="default",
            workflows=[GreeterWorkflow],
            activities=[greet],
        )

        await worker.run_until(workflow_id=workflow_id, timeout=30.0)
        result = await handle.result(timeout=10.0)

    print(result)  # {"greeting": "Hello, world!", "length": 5}

asyncio.run(main())
```

### 连接本地 Server 运行 {#running-against-a-local-server}

上方程序假定 Durable Workflow Server 在 `http://localhost:8080` 可达，并使用本地 `dev-token`。如果尚未启动，最快的无需源码路径是使用已发布 Server 镜像：

```bash
export DW_SERVER_IMAGE=%%artifact.serverDockerHubImage%%
export DW_AUTH_TOKEN=dev-token

docker volume create durable-workflow-python-quickstart

docker run --rm \
  -v durable-workflow-python-quickstart:/app/database \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$DW_SERVER_IMAGE" server-bootstrap

docker rm -f durable-workflow-server >/dev/null 2>&1 || true
docker run -d --name durable-workflow-server \
  -p 8080:8080 \
  -v durable-workflow-python-quickstart:/app/database \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$DW_SERVER_IMAGE"

until curl -sf http://localhost:8080/api/ready > /dev/null; do sleep 1; done
```

生产部署的认证驱动、数据库配置和 TLS 等内容见 [Server 设置指南](/docs/polyglot/server)。

更完整的示例见 SDK 仓库的 [`examples/order_processing`](https://github.com/durable-workflow/sdk-python/tree/main/examples/order_processing)，这是通过订单工作流端到端运行 Python Worker 的 Docker Compose 栈。

## 客户端 API 参考 {#client-api-reference}

异步 `durable_workflow.Client` 是控制平面和 Worker 平面 HTTP 调用的公开入口。请作为异步上下文管理器使用，以便正确关闭底层 `httpx.AsyncClient` 连接池。

```python
from durable_workflow import Client

async with Client(
    "https://workflow.example.com",
    token="shared-token",
    namespace="default",
    timeout=60.0,
) as client:
    info = await client.get_cluster_info()
```

### 构造函数 {#constructor}

| 参数 | 类型 | 默认值 | 使用场景 |
| --- | --- | --- | --- |
| `base_url` | `str` | 必填 | Server 源地址，不包含 `/api`。 |
| `token` | `str \| None` | `None` | 一个 bearer 令牌应同时授权控制平面和 Worker 平面调用。 |
| `control_token` | `str \| None` | `None` | 控制平面调用需要与 Worker 轮询不同的 bearer 令牌。 |
| `worker_token` | `str \| None` | `None` | Worker 平面调用需要与运维调用不同的 bearer 令牌。 |
| `namespace` | `str` | `"default"` | 通过 `X-Namespace` 定位 Server 命名空间。 |
| `timeout` | `float` | `60.0` | 覆盖默认 HTTP 超时。 |
| `retry_policy` | `TransportRetryPolicy \| None` | 默认策略 | 调整短暂 HTTP 失败的传输重试。 |
| `metrics` | `MetricsRecorder \| None` | 无操作 | 向自定义记录器输出客户端和 Worker 指标。 |
| `payload_size_limit_bytes` | `int` | SDK 默认值 | 匹配 Server 最大负载字节契约。 |
| `payload_size_warning_threshold_percent` | `int` | SDK 默认值 | 在负载达到配置上限前警告。 |
| `payload_size_warnings` | `bool` | `True` | 在测试或受控脚本中禁用本地负载大小警告。 |

`token` 是最简单的选项。如果同时设置 `control_token` 和 `worker_token`，控制平面方法使用 `control_token`，Worker 平面方法使用 `worker_token`。

### 外部负载存储 {#external-payload-storage}

普通 `Client` 和 `Worker` 操作会自动使用 Server 的认证运行时传输。SDK 通过 `GET /api/cluster/info` 发现命名空间策略和传输上限，上传大于阈值或为满足请求限制而必须外置的编码值，并在解码前获取引用值。工作流和活动代码收到的是解码后的值。提供商凭据保留在 Server 上。远程 Worker 不需要 boto3、提供商客户端或 Server 本地目录的访问权。

运行时引用使用 `durable-workflow.v2.runtime-external-payload-reference.v1` 模式和不透明 `reference_id`，不含提供商 `uri`。上传和获取使用普通角色凭据及命名空间，验证编码字节大小和 SHA-256，并在 Worker 完成时保留任务尝试与租约围栏。路由、上限和类型化拒绝见[运行时 HTTP 契约](./server-api-reference.md#runtime-external-payload-transport)。SDK 支持取决于兼容且可用的传输，而不只是已配置驱动。

以下**直接提供商辅助函数**用于应用有意访问自身提供商的存储和测试场景。它们使用另一种带 URI 的模式，普通 Server 或 Cloud 客户端不需要它们。Server 会以 HTTP `422` 和 `external_payload_unsupported` 拒绝提供商 `external_storage` 封装。

| API | 职责 | 失败接口 |
| --- | --- | --- |
| `ExternalStorageDriver` | `put(data, sha256=..., codec=...)`、`get(uri)` 和 `delete(uri)` 的协议。 | 驱动抛出的存储错误。 |
| `LocalFilesystemExternalStorage` | 本地开发和测试用的无依赖 `file://` 驱动。 | 引用 URI 越出配置根目录时抛出 `ValueError`。 |
| `S3ExternalStorage` | boto3 兼容客户端适配器。 | 引用外部桶/前缀或响应不是字节时抛出 `ValueError`。 |
| `GCSExternalStorage` | google-cloud-storage 风格客户端适配器。 | 引用外部桶/前缀或响应不是字节时抛出 `ValueError`。 |
| `AzureBlobExternalStorage` | Azure 容器客户端适配器。 | 引用外部容器/前缀或响应不是字节时抛出 `ValueError`。 |
| `ExternalPayloadReference` | 带 `uri`、`sha256`、`size_bytes`、`codec` 和模式的不可变线格式引用。 | `from_dict()` 收到不支持的模式或格式错误字段时抛出 `ValueError`。 |
| `ExternalPayloadCache` | 已验证外部负载字节的有界重放缓存。 | 构造函数拒绝非正数的条目或字节上限。 |
| `store_external_payload()` | 通过驱动存储编码字节，并返回 `ExternalPayloadReference`。 | 驱动错误。 |
| `fetch_external_payload()` | 获取引用字节，然后在解码前验证大小和 SHA-256。 | 大小/哈希不匹配时抛出 `ExternalPayloadIntegrityError`。 |
| `delete_external_payload()` | 删除引用对象，并驱逐相应缓存条目。 | 驱动抛出的存储错误。 |
| `external_storage_envelope()` | 阈值内将值内联编码，超过阈值后通过驱动写入字节。 | 阈值无效或没有驱动能解析引用时抛出 `ValueError`。 |
| `external_storage_driver_from_policy()` | 根据显式策略和应用自有提供商客户端构建直接驱动，不授予 Server 或 Cloud 上的直接提供商访问权。 | 策略禁用、不支持或缺少所需客户端、bucket、容器时抛出 `ValueError`。 |

```python
from durable_workflow import (
    ExternalPayloadCache,
    LocalFilesystemExternalStorage,
    external_storage_envelope,
    to_avro_payload_value,
)
from durable_workflow.serializer import encode
from durable_workflow.external_storage import fetch_external_payload, store_external_payload

storage = LocalFilesystemExternalStorage("/var/lib/durable-workflow/payloads")
cache = ExternalPayloadCache(max_entries=256, max_bytes=32 * 1024 * 1024)

payload = to_avro_payload_value({"invoice_pdf": "x" * 1_000_000})
envelope = external_storage_envelope(
    payload,
    external_storage=storage,
    threshold_bytes=64 * 1024,
)

reference = store_external_payload(
    storage,
    encode({"archived": True}).encode("utf-8"),
    codec="avro",
)
payload_bytes = fetch_external_payload(storage, reference, cache=cache)
```

这些直接辅助函数的引用模式为 `EXTERNAL_PAYLOAD_REFERENCE_SCHEMA`（`durable-workflow.v2.external-payload-reference.v1`）。适配器不会向 `durable-workflow` 添加云 SDK 依赖；应用传入已配置的 S3、GCS 或 Azure 客户端。

提供商引用包含以下字段。这不是 Server HTTP 路由接受的运行时引用：

```json
{
  "schema": "durable-workflow.v2.external-payload-reference.v1",
  "uri": "s3://dw-payloads/billing/run-001/input.avro",
  "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "size_bytes": 1048576,
  "codec": "avro",
  "expires_at": "2026-05-22T00:00:00Z"
}
```

`ExternalPayloadReference.from_dict()` 拒绝未知模式和格式错误的字段。`fetch_external_payload()` 在返回字节前验证 `size_bytes` 和 `sha256`，大小或哈希不符时抛出 `ExternalPayloadIntegrityError`。对象缺失也可能触发提供商驱动自身的错误。`ExternalPayloadCache` 只能缓存已验证字节。缓存淘汰不授予删除 Server 管理对象的权限。`delete_external_payload()` 是直接提供商操作，不是运行时引用清理 API。

在有意访问应用自有提供商存储、且拥有所需客户端的代码中使用 `external_storage_driver_from_policy()`。读取命名空间策略不会让提供商封装变成有效 Server 请求。客户端仍由应用管理。可选适配器不会把 boto3、google-cloud-storage 或 azure-storage-blob 加入运行时依赖：

```python
from durable_workflow.external_storage import external_storage_driver_from_policy

namespace = await client.describe_namespace("billing")
driver = external_storage_driver_from_policy(
    namespace.external_payload_storage,
    s3_client=application_owned_s3_client,
)
```

策略禁用、驱动不支持或缺少所需客户端时，工厂抛出 `ValueError`。禁用的策略不会返回空驱动。调用前应检查 `policy.enabled`。

### 命名空间 {#namespaces}

命名空间是工作流、计划、搜索属性和外部负载存储的租户边界。Client 通过构造参数 `namespace=` 一次定位一个命名空间，但下方运维接口适用于 bearer 令牌授权的任意命名空间。

| 方法 | 返回 | 失败接口 |
| --- | --- | --- |
| `await client.list_namespaces()` | `NamespaceList` | 认证/Server 错误。 |
| `await client.describe_namespace(name)` | `NamespaceDescription` | `NamespaceNotFound`、认证/Server 错误。 |
| `await client.create_namespace(name, description=None, retention_days=30)` | `NamespaceDescription` | 名称重复或保留期无效时抛出 `InvalidArgument`，以及认证/Server 错误。 |
| `await client.update_namespace(name, description=None, retention_days=None)` | `NamespaceDescription` | `NamespaceNotFound`、`InvalidArgument`、认证/Server 错误。只发送已提供字段。 |
| `await client.set_namespace_external_storage(name, driver=..., enabled=True, threshold_bytes=None, config=None)` | `NamespaceDescription` | 策略未通过 Server 验证时抛出 `InvalidArgument`，以及认证/Server 错误。 |
| `await client.test_external_storage(driver=None, small_payload_bytes=None, large_payload_bytes=None)` | `StorageTestResult` | 绑定策略缺少必填字段时抛出 `InvalidArgument`，以及认证/Server 错误。 |

`set_namespace_external_storage` 对应 `dw namespace:set-storage-driver`。第一个位置参数是命名空间 `name`，与 `describe_namespace`、`create_namespace` 和 `update_namespace` 一致。已弃用的 `namespace=` 别名发出 `DeprecationWarning`；新代码应使用位置参数 `name`。`config` 字典携带驱动专属键，包括 `s3`、`gcs` 和 `azure` 可选的 `disk` 字段，使凭据留在 Server。返回的 `NamespaceDescription` 反映 Server 实际持久化的策略，包括调用方未提供值时 Server 回退使用的阈值。

`test_external_storage` 对应 `dw storage:test`。Server 通过绑定的外部存储驱动往返测试小型和大型负载，返回 `StorageTestResult`，其中每个负载的 `StoragePayloadTestResult` 记录提供 `wrote`、`read`、`verified`、`latency_ms` 和 `bytes` 字段。

`NamespaceDescription` 携带[外部负载存储](#external-payload-storage)中说明的 `external_payload_storage` 策略。普通客户端自动使用发现的运行时传输。直接辅助函数需要应用拥有提供商访问权；取得策略描述不会让提供商封装变成有效 Server 请求。

### 集群与任务队列 {#cluster-and-task-queues}

| 方法 | 返回 | 说明 |
| --- | --- | --- |
| `await client.health()` | `dict[str, Any]` | 调用健康端点进行存活检查。 |
| `await client.get_cluster_info()` | `dict[str, Any]` | 读取 Server 版本、协议、能力及兼容性元数据。 |
| `await client.list_task_queues()` | `TaskQueueList` | 列出命名空间可见的任务队列。 |
| `await client.describe_task_queue(name)` | `TaskQueueDescription` | 返回 Worker 容量、当前租约、查询准入及派发预算信息。 |
| `await client.list_task_queue_build_ids(task_queue)` | `TaskQueueBuildIdRollout` | 采集队列各构建 ID 群组状态快照，包括 `build_id` 为 `None` 的群组下的无版本 Worker。 |
| `await client.drain_task_queue_build_id(task_queue, build_id)` | `TaskQueueBuildIdRolloutState` | 将构建 ID 群组标记为排空，使其停止认领新任务。传入 `build_id=None` 排空无版本 Worker。操作幂等。 |
| `await client.resume_task_queue_build_id(task_queue, build_id)` | `TaskQueueBuildIdRolloutState` | 撤销之前的排空，使群组能再次认领工作。传入 `build_id=None` 恢复无版本 Worker。操作幂等。 |

任务队列返回类型提供嵌套的 `TaskQueueAdmission`、`TaskQueueTaskAdmission`、`TaskQueueQueryAdmission`、`TaskQueueBuildIdCohort`、`TaskQueueBuildIdRollout` 和 `TaskQueueBuildIdRolloutState` 数据类，使脚本无需解析自然语言输出即可检查 Server 容量及构建 ID 发布。端到端发布流程见 [Worker 构建 ID 发布](/docs/polyglot/worker-build-id-rollout)；这些方法对应的 CLI 是 `dw task-queue:build-ids`、`dw task-queue:drain` 和 `dw task-queue:resume`。

### 工作流操作 {#workflow-operations}

| 方法 | 返回 | 失败接口 |
| --- | --- | --- |
| `await client.start_workflow(...)` | `WorkflowHandle` | `WorkflowAlreadyStarted`, `InvalidArgument`, `Unauthorized`, `ServerError` |
| `await client.describe_workflow(workflow_id)` | `WorkflowExecution` | `WorkflowNotFound`, 认证/Server 错误 |
| `await client.list_workflows(...)` | `WorkflowList` | 认证/Server 错误 |
| `await client.list_workflow_runs(workflow_id)` | `WorkflowRunList` | `WorkflowNotFound`, 认证/Server 错误 |
| `await client.describe_workflow_run(workflow_id, run_id)` | `WorkflowRun` | `WorkflowNotFound`, 认证/Server 错误 |
| `await client.get_history(workflow_id, run_id)` | 已解码历史负载 | `WorkflowNotFound`, 认证/Server 错误 |
| `await client.export_history(workflow_id, run_id)` | 已解码归档历史负载 | `WorkflowNotFound`, 认证/Server 错误 |
| `await client.signal_workflow(workflow_id, signal_name, args=None)` | `None` | `WorkflowNotFound`, `InvalidArgument`, 认证/Server 错误 |
| `await client.query_workflow(workflow_id, query_name, args=None)` | 已解码查询结果 | `QueryFailed`, `WorkflowNotFound`, 认证/Server 错误 |
| `await client.update_workflow(workflow_id, update_name, args=None, ...)` | 已解码更新结果 | `UpdateRejected`, `WorkflowNotFound`, 认证/Server 错误 |
| `await client.cancel_workflow(workflow_id, reason=None)` | `None` | `WorkflowNotFound`, 认证/Server 错误 |
| `await client.terminate_workflow(workflow_id, reason=None)` | `None` | `WorkflowNotFound`, 认证/Server 错误 |
| `await client.repair_workflow(workflow_id)` | `WorkflowCommandResult` | `WorkflowNotFound`, 认证/Server 错误 |
| `await client.archive_workflow(workflow_id, reason=None)` | `WorkflowCommandResult` | `WorkflowNotFound`, 认证/Server 错误 |
| `await client.get_result(handle, poll_interval=0.5, timeout=30.0)` | 已解码工作流输出 | `WorkflowFailed`, `WorkflowCancelled`, `WorkflowTerminated`, `TimeoutError` |

`start_workflow` 接受 `workflow_type`、`task_queue`、可选 `workflow_id`、可选 `input`、`duplicate_policy`、`memo`、`search_attributes`、`business_key`、`execution_timeout_seconds` 和 `run_timeout_seconds`。所有调用方负载在越过 HTTP 边界前都进行 Avro 封装。

脚本已知工作流 ID 且需要句柄风格方法时，使用 `client.get_workflow_handle(workflow_id, run_id=None, workflow_type="")`。

| `WorkflowHandle` 方法 | 等效客户端方法 |
| --- | --- |
| `await handle.result(...)` | `client.get_result(handle, ...)` |
| `await handle.describe()` | `client.describe_workflow(handle.workflow_id)` |
| `await handle.signal(name, args=None)` | `client.signal_workflow(...)` |
| `await handle.query(name, args=None)` | `client.query_workflow(...)` |
| `await handle.update(name, args=None, ...)` | `client.update_workflow(...)` |
| `await handle.cancel(reason=None)` | `client.cancel_workflow(...)` |
| `await handle.terminate(reason=None)` | `client.terminate_workflow(...)` |

两个操作都立即关闭 Server 运行，并产生不同终态结果。`cancel_workflow` 不向工作流代码交付协作请求，也不运行 saga/finally 清理。有时限的工作流清理应配合协作 Worker 使用 `request_cancellation()`。操作策略、监督和恢复见[协作式取消指南](/docs/polyglot/cancellation)。

### 当前工作流的身份标识 {#workflow-identity}

从 Python SDK 2.9.0 开始，工作流代码可以读取只读属性 `ctx.workflow_id` 和
`ctx.run_id`。两者都是当前任务中的字符串，重放时保持一致。continue-as-new 后，
工作流 ID 不变，后继运行会获得自己的运行 ID。不要用通过参数传入的前一运行 ID
替换当前运行 ID。

```python
from durable_workflow import workflow

@workflow.defn(name="identity")
class IdentityWorkflow:
    def run(self, ctx):
        identity = {"workflow_id": ctx.workflow_id, "run_id": ctx.run_id}
        yield ctx.schedule_activity("record_identity", [identity])
        return identity
```

这些属性读取任务的本地身份标识，不会发送 HTTP 请求。在工作流代码之外轮询状态时，
使用 `await client.describe_workflow(workflow_id)`。读取已注册查询处理器公开的状态时，
使用 `await client.query_workflow(workflow_id, query_name)`。身份属性不能替代这两种操作。

### 计划 {#schedules}

计划使用 `ScheduleSpec` 表示日历/间隔规则，使用 `ScheduleAction` 表示计划触发时发出的工作流启动请求。

| 方法 | 返回 | 说明 |
| --- | --- | --- |
| `await client.create_schedule(...)` | `ScheduleHandle` | 创建计划并返回句柄。 |
| `await client.list_schedules()` | `ScheduleList` | 列出可见计划。 |
| `await client.describe_schedule(schedule_id)` | `ScheduleDescription` | 读取计划状态、动作、下次触发及计数器。 |
| `await client.update_schedule(schedule_id, ...)` | `None` | 更新规范、动作、重叠策略、抖动、memo、搜索属性或注释。 |
| `await client.pause_schedule(schedule_id, note=None)` | `None` | 暂停后续触发。 |
| `await client.resume_schedule(schedule_id, note=None)` | `None` | 恢复已暂停计划。 |
| `await client.trigger_schedule(schedule_id, overlap_policy=None)` | `ScheduleTriggerResult` | 请求立即触发。 |
| `await client.backfill_schedule(schedule_id, start_time=..., end_time=..., overlap_policy=None)` | `ScheduleBackfillResult` | 重放错过的触发窗口。 |
| `await client.get_schedule_history(schedule_id, *, limit=None, after_sequence=None)` | `ScheduleHistoryPage` | 返回计划审计历史流的一页，按 `sequence` 升序。Server 将 `limit` 限定在 1 到 500 之间（默认 100）；`after_sequence` 是从前一页 `next_cursor` 获取的非负游标。计划 ID 未知时抛出 `ScheduleNotFound`。调用 `delete_schedule` 后历史仍保留，使运维人员能审计计划移除原因。 |
| `client.iter_schedule_history(schedule_id, *, limit=None, after_sequence=None)` | `AsyncIterator[ScheduleHistoryEvent]` | yield 计划的每个审计事件，内部持续分页，直到 Server 报告 `has_more=False`。失败接口与 `get_schedule_history` 相同。 |
| `await client.delete_schedule(schedule_id)` | `None` | 删除计划。 |

`client.get_schedule_handle(schedule_id)` 返回 `ScheduleHandle`，其 `describe`、`update`、`pause`、`resume`、`trigger`、`backfill`、`history`、`iter_history` 和 `delete` 方法转发到对应客户端方法。`ScheduleHandle.history(...)` 返回 `ScheduleHistoryPage`，`ScheduleHandle.iter_history(...)` 返回 `AsyncIterator[ScheduleHistoryEvent]`。

`ScheduleHistoryPage` 携带有序 `events` 列表、`has_more` 标记、`next_cursor` 整数（最后一页为 `None`）、`schedule_id` 及所属 `namespace`。每个 `ScheduleHistoryEvent` 携带 `sequence`、`event_type`（`ScheduleCreated`、`SchedulePaused`、`ScheduleResumed`、`ScheduleUpdated`、`ScheduleTriggered`、`ScheduleTriggerSkipped` 或 `ScheduleDeleted`）、`recorded_at`、已触发工作流的可选 `workflow_instance_id` 和 `workflow_run_id`，以及控制平面为该转换记录的原始 `payload` 字典。

### 桥接事件与 Worker 平面方法 {#bridge-events-and-worker-plane-methods}

`await client.send_webhook_bridge_event(adapter, action=..., target=..., input=..., idempotency_key=..., correlation=None)` 返回 `BridgeAdapterOutcome`，与 `dw bridge:webhook` 使用相同的机器可读结果契约。这是 webhook 形式系统进行有限接入的 Python 入口。

底层 Worker 平面方法向自定义 Worker 和协议测试公开，但普通应用应使用 `Worker`：

| 方法组 | 方法 |
| --- | --- |
| Worker 注册 | `register_worker` |
| 工作流任务 | `poll_workflow_task`, `complete_workflow_task`, `fail_workflow_task`, `workflow_task_history` |
| 查询任务 | `poll_query_task`, `complete_query_task`, `fail_query_task` |
| 活动任务 | `poll_activity_task`, `complete_activity_task`, `fail_activity_task`, `heartbeat_activity_task` |

这些方法发送 `X-Durable-Workflow-Protocol-Version`，并在配置后使用 `worker_token`。除非编写 SDK 适配器或协议一致性测试，否则优先使用更高层的 `Worker`。

`workflow_task_history(...)` 为一个已租用工作流任务分页读取重放历史。仅在 `poll_workflow_task(...)` 返回 `next_history_page_token` 后调用：

```python
page = await client.workflow_task_history(
    task_id="workflow-task-01",
    next_history_page_token="history-page-2",
    lease_owner="python-worker-1",
    workflow_task_attempt=2,
)
```

请求体使用 `next_history_page_token`、`lease_owner` 和 `workflow_task_attempt`。解码后的响应使用 Worker 协议字段名 `history_events`、`total_history_events` 和 `next_history_page_token`，不使用控制平面运行历史的 `events` 或 `next_page_token`。

### Worker {#workers}

Worker 注册表展示 Server 最近见过哪些 Worker，以及每个 Worker 能运行什么。用这些方法驱动构建 ID 发布、查找要注销的失联 Worker，并通过运维脚本核对集群容量。

| 方法 | 返回 | 失败接口 |
| --- | --- | --- |
| `await client.list_workers(task_queue=None, status=None)` | `WorkerList` | 认证/Server 错误。 |
| `await client.describe_worker(worker_id)` | `WorkerDescription` | `WorkerNotFound`, 认证/Server 错误. |
| `await client.deregister_worker(worker_id)` | `dict[str, Any]` | `WorkerNotFound`, 认证/Server 错误. |

`list_workers` 在 Server 端过滤：传入 `task_queue` 限定到单个队列，传入 `status` 指定一个 Server 可识别的状态字符串。默认返回命名空间全部已注册 Worker。

`WorkerDescription` 携带 Worker 运行时、SDK 版本、构建 ID、声明的工作流和活动类型、最后心跳及当前任务准入，使脚本能决定排空哪个群组或移除哪些 Worker。

`deregister_worker` 在 Server 端幂等；它移除不再发送心跳的 Worker，使容量核算和 `list_workers` 保持准确。它不会中断执行中的租约。

### 搜索属性 {#search-attributes}

搜索属性是工作流执行上用于过滤和索引的类型化命名空间元数据。Python 客户端提供与 CLI 相同的控制平面接口。

| 方法 | 返回 | 失败接口 |
| --- | --- | --- |
| `await client.list_search_attributes()` | `SearchAttributeList` | 认证/Server 错误。 |
| `await client.create_search_attribute(name, attribute_type)` | `dict[str, Any]` | 名称重复或类型不受支持时抛出 `InvalidArgument`，以及认证/Server 错误。 |
| `await client.delete_search_attribute(name)` | `dict[str, Any]` | `SearchAttributeNotFound`，属性为系统定义时抛出 `InvalidArgument`，以及认证/Server 错误。 |

`SearchAttributeList` 区分 `system` 和 `custom` 属性定义，使运维脚本能先确认引擎定义的键（工作流 ID、状态、类型、启动时间等）存在，再拒绝创建冲突的自定义键。支持的 `attribute_type` 值是 `keyword`、`text`、`int`、`double`、`bool`、`datetime` 和 `keyword_list`。

### 系统维护 {#system-maintenance}

运维脚本和值班自动化通过 Client 驱动与 `dw system:*` 命令相同的维护循环。每个方法要求 bearer 令牌具备 admin 作用域；否则 Server 返回 `Unauthorized`。

| 方法 | 返回 | 对应 CLI |
| --- | --- | --- |
| `await client.repair_status()` | `dict[str, Any]` | `dw system:repair-status` |
| `await client.repair_pass(run_ids=None, instance_id=None)` | `dict[str, Any]` | `dw system:repair-pass` |
| `await client.retention_status()` | `dict[str, Any]` | `dw system:retention-status` |
| `await client.retention_pass(run_ids=None, limit=None)` | `dict[str, Any]` | `dw system:retention-pass` |
| `await client.activity_timeout_status()` | `dict[str, Any]` | `dw system:activity-timeout-status` |
| `await client.activity_timeout_pass(execution_ids=None, limit=None)` | `dict[str, Any]` | `dw system:activity-timeout-pass` |

`repair_pass` 运行一次任务修复扫描。不传过滤条件时，Server 在整个命名空间内执行；传入 `run_ids` 缩小到特定工作流运行列表，或传入 `instance_id` 限定为单个活动实例。

不传 `run_ids` 时，`retention_pass` 要求 PHP Server 根据当前命名空间策略清理过期终态运行，最多到扫描上限。显式 `run_ids` 直接定位已关闭运行，绕过该年龄扫描，可以清理比有限保留窗口更新的历史。永久保留和已归档运行保护仍适用。配套的 `retention_status()` 报告当前策略、截止时间及有限的符合条件列表，不删除历史。缩短策略或提交显式目标前，请审查[保留过程](./server.md#retention)。

`activity_timeout_pass` 对已经超过截止时间的活动执行强制执行从启动到关闭和从调度到关闭的截止时间。不传过滤条件时，Server 处理任意过期活动执行，最多到扫描上限；传入 `execution_ids` 定位特定列表，或用 `limit` 限制单次轮次。

没有工作时，这些方法不会抛出异常。安静时段重复调用返回相同的 `passes` / `repaired` / `pruned` 计数器，增量为零，因此可以安全用于 cron 驱动的运维脚本。

## 定义工作流 {#defining-workflows}

工作流是用 `@workflow.defn` 装饰的 Python 类。`run` 方法可以是普通同步函数，也可以是向 Server yield 持久命令的同步生成器。工作流需要持久执行的操作时，请使用生成器形式；不支持 `async def run`。

```python
from durable_workflow import workflow

@workflow.defn(name="order-processing")
class OrderWorkflow:
    def run(self, ctx, *args):
        order = args[0] if args else {}

        # Schedule an activity and wait for the result
        validated = yield ctx.schedule_activity(
            "validate_order", [order]
        )

        # Start a timer (durable sleep)
        yield ctx.start_timer(seconds=60)

        # Schedule another activity
        receipt = yield ctx.schedule_activity(
            "process_payment", [validated]
        )

        return receipt
```

`@workflow.defn(name="...")` 中的 `name` 是跨语言使用的类型键。它必须是普通字符串，不能是 Python 模块路径或类引用。

### 信号、查询与更新 {#signals-queries-and-updates}

信号记录在持久历史中，并在工作流重放期间派发给 Python 处理器：

```python
@workflow.defn(name="approval")
class ApprovalWorkflow:
    def __init__(self) -> None:
        self.approved = False
        self.approved_by = None

    @workflow.signal("approve")
    def approve(self, by: str) -> None:
        self.approved = True
        self.approved_by = by

    def run(self, ctx, *args):
        ready = yield ctx.wait_condition(
            lambda: self.approved, key="approval.approved", timeout=60,
        )
        return {
            "status": "approved" if ready else "timed_out",
            "approved": self.approved,
            "approved_by": self.approved_by,
        }
```

等待属于工作流，而不是活动。谓词读取回放重建的信号处理器状态；等待审批时，工作器不会占用活动槽位。条件超时与工作流有限的单次运行和整体执行截止时间相互独立。等待外部任务完成时，请使用提交后立即返回的短活动，以及[关联的回调](./polling-patterns.md#callback-and-signal-completion)。

查询和更新接收器装饰器允许工作流类公布稳定的处理器名称。Python Worker 通过重放已提交工作流历史，并针对该重放状态调用已注册查询处理器，执行 Server 路由的查询任务。它们也应用通过工作流任务交付的已接受更新：

```python
@workflow.defn(name="approval")
class ApprovalWorkflow:
    def __init__(self) -> None:
        self.approved = False

    @workflow.query("status")
    def status(self) -> dict:
        return {"approved": self.approved}

    @workflow.update("set_approval")
    def set_approval(self, approved: bool) -> dict:
        self.approved = approved
        return {"approved": self.approved}

    @set_approval.validator
    def validate_set_approval(self, approved: bool) -> None:
        if not isinstance(approved, bool):
            raise ValueError("approved must be boolean")
```

Python Worker 通过向 Server 返回查询任务结果来完成 Server 路由的查询。对于声明的更新验证器，Worker 改为接收专用验证任务，重放权威工作流状态，并仅调用验证器。验证成功之前，Server 不会记录已接受更新，也不会派发更新处理器。除非发现结果公布同步接受前契约，否则带验证器的 Worker 拒绝注册；拒绝、缺失或不兼容 Worker、Worker 丢失、超时，以及被隔离的重复或过时完成，仍是明确的类型化结果。PHP 和 Rust 当前不提供更新验证器编写 API，会在其工作流契约中公布这一缺失，而不是声称验证器对等。

### 处理器生命周期 {#handler-lifecycle}

**已发布的验证功能。** Python SDK 2.6.2 引入了以下处理器保护。Server 路由的异步查询和更新验证器仍然受支持。修正后的范围见 [SDK #177](https://github.com/durable-workflow/sdk-python/issues/177#issuecomment-6296781770)。

每次重放都会在执行 `run()` 之前构造一个新的工作流实例。工作流启动时已记录的信号，会在 `run()` 到达第一个 `yield` 后应用，因此构造函数和首个 `yield` 前的初始化先执行。信号和更新处理器修改这份经重放恢复的状态。查询只检查它，不改变持久状态；更新验证器在接受前检查验证后即丢弃的重放状态。持久活动、定时器和子工作流命令应放在 `run()` 中，而不是处理器中。

| 处理器 | 支持的形式及失败结果 |
| --- | --- |
| `@workflow.signal` | 同步函数。重放期间应用信号时抛出异常，会导致工作流运行失败。 |
| `@workflow.update` | 同步函数。处理器异常会导致该更新失败。 |
| `@workflow.update_validator` 或 `@update_method.validator` | Worker 下的同步函数或 `async def`。异常会在接受更新前将其拒绝。 |
| `@workflow.query` | Worker 下的同步函数或 `async def`。处理器异常会使查询失败，而不是使工作流运行失败。 |

验证会拒绝信号和更新的协程函数，并拒绝包括查询和验证器在内的**所有**装饰处理器的生成器函数和异步生成器函数。它会在定义、注册或重放时抛出 `InvalidWorkflowDefinition`，继承的处理器和离线工具也包括在内。同步的信号和更新包装函数不能通过返回异步值绕过保护。所有类型的处理器返回生成器或异步生成器值都会被拒绝。这些限制不禁止 `run()` 使用的同步生成器。

对于 Server 路由的查询，Worker 会在原查询截止时间以及领取和取消权限约束下，显式等待异步结果。等待不会赋予新的时间预算，也不允许在失去权限后提交结果。对于接受前的验证，Worker 同样会等待异步验证器基于临时重放状态得出的结果，之后该状态会被丢弃。

本地同步辅助方法无法 await。SDK 会让 `workflow.query_state()` 以 `QueryFailed` 拒绝异步结果，让 `workflow.validate_update()` 以 `UpdateRejected` 拒绝异步结果。它们会关闭返回的协程，而不是将协程泄漏为操作结果。

### 工作流上下文 {#workflow-context}

传给 `run` 的 `WorkflowContext` 提供确定性操作：

| 方法 | 描述 |
|--------|-------------|
| `ctx.schedule_activity(type, args)` | 调度活动任务，可选每次调用的重试和超时选项 |
| `ctx.start_timer(seconds)` | 持久休眠 |
| `ctx.start_child_workflow(type, args)` | 启动子工作流，可选每次调用的重试和工作流超时选项 |
| `yield [command, [...]]` | 按输入顺序等待嵌套确定性活动、子工作流、定时器或混合组 |
| `yield ctx.select({key: command, ...})` | 从首个持久提交的成员恢复，同时保留每个未胜出项的句柄 |
| `ctx.saga()` | 注册并逆序运行持久活动补偿 |
| `ctx.side_effect(fn)` | 捕获非确定性值 |
| `ctx.get_version(change_id, min, max)` | 安全的工作流代码版本管理 |
| `ctx.upsert_search_attributes(attrs)` | 更新搜索属性 |
| `ctx.continue_as_new(*args)` | 使用新输入重启工作流 |
| `ctx.now()` | 持久化的工作流开始时间，在本次运行内固定 |
| `ctx.random()` | 带种子的随机生成器 |
| `ctx.uuid4()` | 确定性 UUID |
| `ctx.logger` | 重放期间保持静默的日志器 |

### 入口兼容性与恢复 {#entry-compatibility-and-recovery}

**已发布支持。** Python SDK 2.6.2 引入了下述入口保护，Server 2.9.9 提供了配套的路由和恢复支持。这些是相应功能的最低支持版本；请安装当前稳定版本以获取安全修复。

Worker 会在调用 `run(ctx, *start_input)` 前，将已记录参数绑定到入口签名。缺少必需参数或参数数量不兼容时，会在方法体执行前抛出 `WorkflowEntryArgumentsMismatchError`，原因为 `workflow_entry_arguments_mismatch`。默认值只补充省略的参数。Python 类型注解仍不强制执行：改变注解不会验证或转换已记录数据。无论普通方法体还是生成器方法体，成功进入后抛出的 `TypeError` 仍属于应用失败。

Worker 会自动声明 `workflow_entry_arguments_validation`。使用经过验证的 Server 时，失败任务的重放会被阻止，而原运行保持非终态。较旧的运行时可能重试该任务；仅 SDK 端的拒绝并不能确立完整恢复契约。

使用 `await client.describe_workflow_run(workflow_id, run_id)` 和指定运行的调试端点检查确切运行。恢复兼容入口方法后，使用[恢复流程](../failures-and-recovery.md#service-entry-recovery)中指定运行的 HTTP 修复路由。相反，`await client.repair_workflow(workflow_id)` 和 `handle.repair()` 会解析实例的当前运行；两者都不接受运行 ID 参数。请保留原输入、历史、命名空间、队列、构建和截止时间。若要改变命令，请将 `ctx.get_version` 放在兼容方法内部，并通过[定义路由](./worker-compatibility-routing.md#definition-fingerprint-evolution)验证冷重放。

### 工作流时间与持久等待 {#workflow-time-and-durable-waits}

在 Worker 重放期间，`ctx.now()` 返回运行的**持久化开始时间**。
活动、定时器、信号或其他持久步骤结束后，这个值也不会推进。
对同一历史进行多次冷重放会得到同一个起始值。
continue-as-new 后继运行有自己的开始时间，不会沿用前一运行的时钟基准。

[已发布的 Python 实现](https://github.com/durable-workflow/sdk-python/blob/150c6f6bc14e3516f75cc615b2f75f093ed84ea1/src/durable_workflow/workflow.py#L2594-L2601)
优先使用存在的 `WorkflowStarted.payload.timestamp`，否则使用规范的
`WorkflowStarted.recorded_at`。持久化重放时间缺失或无效时，会明确报告时钟错误，
而不是允许读取 Worker 的墙上时钟。这是
[SDK #146](https://github.com/durable-workflow/sdk-python/issues/146) 已确定的固定开始时间契约。

应等待持久操作，而不是循环等待 `ctx.now()` 改变：

```python
from durable_workflow import workflow


@workflow.defn(name="wait_without_clock_loop")
class WaitWithoutClockLoop:
    def run(self, ctx):
        started_at = ctx.now()
        yield ctx.start_timer(30)
        return {
            "run_started_at": started_at.isoformat(),
            "after_wait": ctx.now().isoformat(),
        }
```

定时器的持久完成会恢复工作流。返回的两个时间戳都是同一个开始时间。
即使定时器已触发，`while ctx.now() < deadline` 这样的循环条件也不会因此变为假。

需要相对延迟时，使用 `yield ctx.start_timer(seconds)` 或 `yield ctx.sleep(seconds)`。
工作需要与持久定时器竞争时，使用[首次完成选择](#first-completion-selection)。
需要 Server 强制执行工作流期限（包括 Worker 已停止的情况）时，在
`client.start_workflow(...)` 中设置 `execution_timeout_seconds` 和 `run_timeout_seconds`。
HTTP 或 `get_result()` 的等待超时只限制该本地请求，并不能替代工作流的持久化期限。
需要跨 continue-as-new 保留应用期限时，应将其明确传入输入，且不要替换 Server 原有的执行期限。

需要测量一次活动调用内的实际耗时时，应在活动中读取单调时钟，并将时长作为活动结果返回。
对于外部 UTC 期限，让活动检查有权威性的外部时钟并返回判断；工作流重放该已记录结果。
绝不要将 UTC 时间戳与单调时钟值比较，也不要对不同进程或主机的单调时钟读数做差。
在 Python 中，对 `ctx.now()` 做差既不能测量有效处理时间，也不能测量实际经过的墙上时间。

#### 各 SDK 的时钟差异 {#clock-differences-across-sdks}

这些 API 在提供时是确定性的，但并不共享同一个时钟：

| 编写接口 | 重复调用与持久步骤 | continue-as-new 后继运行 |
| --- | --- | --- |
| Python `ctx.now()` | 固定为本次运行的持久化开始时间，定时器或活动之后也不变。 | 使用后继运行的开始时间基准。 |
| 嵌入式 PHP `Workflow::now()` | 从运行开始时间起步，并推进到重放已消费事件的记录时间。参见[工作流时间](../features/timers.md#reading-deterministic-time)。 | 从新运行开始，随后沿该运行已消费的事件推进。 |
| 服务模式 PHP SDK | 没有通用的公开工作流 `now()` 辅助方法。使用持久操作或已记录的活动／副作用值。 | 需要跨交接保留应用时间状态时，必须明确传递。 |
| 服务模式 Rust SDK | 没有通用的公开 `WorkflowContext::now()` 辅助方法。`side_effect` 可以记录一个小型墙上时钟快照，但它不是会推进的时钟。 | 新运行中的副作用是新操作；需要时应明确传递先前的时间状态。 |

嵌入式 PHP 的行为已存在于
[已发布的 Core](https://github.com/durable-workflow/workflow/blob/64efa176e4c37e5d6ae80e767ba3b41464024e53/src/V2/Support/WorkflowFiberContext.php)。
独立的 [PHP SDK 上下文](https://github.com/durable-workflow/sdk-php/blob/2.5.2/src/Worker/WorkflowContext.php)
和 [Rust SDK 上下文](https://github.com/durable-workflow/sdk-rust/blob/3.5.5/src/lib.rs)
各有自己的 API。应迁移持久操作与期限策略，而不是假定每个 SDK 的时钟辅助方法都有相同语义。

#### 使用序列值排列发出的事件 {#order-emitted-events-with-sequence-values}

工作流时间戳不是事件排序键。使用 `ctx.now()` 标记的 Python 事件可能都有同一个时间戳。
应使用 [Workflow Streams 偏移量](./workflow-streams.md)、相应的
[嵌入式发件箱序列](../features/message-streams.md)，或确定性的工作流本地计数器。
运行本地计数器应配合 `run_id` 使用；如果应用需要一个逻辑序列，必须通过
continue-as-new 明确传递。独立流或运行不会因拥有时间戳而获得全局顺序。


### 活动重试与超时 {#activity-retries-and-timeouts}

某个活动调用需要不同于默认单次尝试行为的重试预算或截止时间时，在 `ctx.schedule_activity(...)` 上使用 `ActivityRetryPolicy` 和超时关键字参数：

```python
from durable_workflow import ActivityRetryPolicy

receipt = yield ctx.schedule_activity(
    "process_payment",
    [validated],
    retry_policy=ActivityRetryPolicy(
        max_attempts=4,
        initial_interval_seconds=1,
        backoff_coefficient=2,
        maximum_interval_seconds=30,
        non_retryable_error_types=["ValidationError"],
    ),
    start_to_close_timeout=120,
    schedule_to_close_timeout=300,
    heartbeat_timeout=15,
)
```

`start_to_close_timeout` 限制 Worker 启动后的单次尝试。`schedule_to_close_timeout` 限制跨所有尝试的整个活动执行。`heartbeat_timeout` 要求长时间运行活动在间隔到期前调用 `activity.context().heartbeat(...)`。活动被调度时，重试策略作为快照写入持久活动执行，因此后续部署不会改变已经运行的尝试。

`ctx.schedule_activity(..., queue="payments-v2")` 为新调度的活动执行选择队列。已记录的活动及其重试和修复后的任务仍保留原队列。更改 `Worker.task_queue` 不会移动这些任务，也不会改变现有运行的工作流队列。在核实所有依赖之前，应保留兼容的旧工作器池；请参阅[已记录的活动队列](./task-matching-dispatch.md#recorded-activity-queues)。

### 确定性规则 {#determinism-rules}

工作流代码根据历史重放，不得直接执行任何非确定性操作：

- 不执行 I/O（HTTP 调用、文件读取、数据库查询）
- 不使用 `datetime.now()` 或 `time.time()`；`ctx.now()` 仅用于固定的运行开始时间基准，等待应使用持久定时器。
- 不使用 `random.random()`，改用 `ctx.random()`
- 不使用 `uuid.uuid4()`，改用 `ctx.uuid4()`

所有非确定性必须通过上下文或用 `ctx.side_effect()` 捕获。

### 扇出 {#fan-out}

yield 命令列表以并发运行：

```python
@workflow.defn(name="fan-out-example")
class FanOutWorkflow:
    def run(self, ctx, *args):
        items = args[0]

        # Nested lists may mix activities, children, and timers.
        results = yield [
            ctx.schedule_activity("process_item", [items[0]]),
            [
                ctx.start_child_workflow("process-batch", [items[1:]]),
                ctx.start_timer(1),
            ],
        ]

        return results  # same nested shape and input order
```

Worker 为每个持久叶子输出一个普通命令，并附加共享的稳定 `parallel_group_*` 字段及完整的从外到内路径。历史可以按任意顺序关闭成员；重放仍按持久输入位置绑定结果和失败。完全重复的终态交付会被忽略。Worker 重启后的待处理历史和完整已完成历史都重建同一组，不会重新调度已完成工作。

### 首次完成选择 {#first-completion-selection}

独立工作应一起启动，但任一成员完成后工作流即可推进时，使用 `ctx.select()`：

```python
selected = yield ctx.select({
    "resolver": ctx.schedule_activity("resolve-request", [request_id]),
    "input": ctx.wait_condition(lambda: self.resolution is not None, key="resolution-ready"),
    "deadline": ctx.start_timer(2),
})

if selected.key == "deadline":
    yield selected.handles["resolver"].cancel()
    return {"status": "timed_out"}

yield selected.handles["deadline"].cancel()
return {"status": "resolved", "value": selected.result()}
```

`SelectionResult` 包含胜出项的稳定键、输入索引、操作种类和持久标识、类型化结果，以及所有 `DurableOperationHandle` 实例。`yield handle.await_result()` 可稍后等待未胜出项；`yield handle.cancel()` 记录一个无返回值的显式请求。只有已提交的 `SelectionOperationCancelled` 历史能证明取消胜出；重放越过未有对应记录的请求，如果完成先提交，`await_result()` 仍返回该完成结果。即使后续历史中另一个完成先出现，重放仍消费持久化的胜出项。重复和乱序的外部交付不能替换已提交胜出项。

### Saga 补偿 {#saga-compensation}

```python
def forward(saga):
    flight = yield ctx.schedule_activity("trip.reserve-flight", [])
    saga.add_compensation("trip.cancel-flight", [flight])

    hotel = yield ctx.schedule_activity("trip.reserve-hotel", [])
    saga.add_compensation("trip.cancel-hotel", [hotel])

    yield ctx.schedule_activity("trip.charge", [])
    return {"status": "booked"}

return (yield from ctx.saga().run(forward))
```

失败后，saga 按注册顺序逆序串行执行普通活动命令。终态 `cancel_workflow` 不恢复工作流执行补偿。辅助工具在首次补偿失败时停止。`SagaCompensationFailed` 将初始失败、补偿失败、补偿活动类型及确定性注册顺序保留为结构化诊断。

### 子工作流 {#child-workflows}

```python
from durable_workflow import ChildWorkflowRetryPolicy

result = yield ctx.start_child_workflow(
    "child-workflow-type",
    [{"input": "data"}],
    task_queue="child-queue",
    parent_close_policy="terminate",
    retry_policy=ChildWorkflowRetryPolicy(
        max_attempts=3,
        initial_interval_seconds=2,
        backoff_coefficient=2,
        non_retryable_error_types=["ValidationError"],
    ),
    execution_timeout_seconds=600,
    run_timeout_seconds=120,
)
```

`execution_timeout_seconds` 限制跨重试和继续为新运行的逻辑子工作流执行。`run_timeout_seconds` 限制每次子运行尝试。子运行失败后应用重试退避；无效子启动命令是协议错误，不作为子尝试重试。

### 继续为新运行 {#continue-as-new}

对长时间运行的工作流，使用继续为新运行来重置历史：

```python
from durable_workflow import ContinueAsNew

@workflow.defn(name="polling-workflow")
class PollingWorkflow:
    def run(self, ctx, *args):
        iteration = args[0] if args else 0

        result = yield ctx.schedule_activity("poll_source", [])

        if result.get("done"):
            return result

        # Continue with incremented iteration
        return ContinueAsNew(arguments=[iteration + 1])
```

## 定义活动 {#defining-activities}

活动是用 `@activity.defn` 装饰的异步 Python 函数。活动与工作流不同，可以自由执行 I/O。

```python
from durable_workflow import activity

@activity.defn(name="send_email")
async def send_email(to: str, subject: str, body: str) -> dict:
    # Activities can do I/O: HTTP calls, database queries, etc.
    response = await some_email_client.send(to=to, subject=subject, body=body)
    return {"message_id": response.id, "sent": True}
```

`name` 是跨语言共享的类型键。PHP 工作流可以调度名为 `"send_email"` 的活动，并由 Python Worker 接收执行，反之亦然。

### 活动上下文 {#activity-context}

在活动内部，通过 `activity.context()` 访问执行元数据和发送心跳：

```python
@activity.defn(name="long_running_task")
async def long_running_task(items: list) -> dict:
    ctx = activity.context()

    print(f"Attempt #{ctx.info.attempt_number}")
    print(f"Task queue: {ctx.info.task_queue}")

    for i, item in enumerate(items):
        # Check for cancellation
        if ctx.is_cancelled:
            return {"partial": True, "processed": i}

        await process(item)

        # Heartbeat to keep the task alive
        await ctx.heartbeat({"progress": i + 1, "total": len(items)})

    return {"processed": len(items)}
```

### 心跳请求 {#activity-heartbeat-requests}

对于远程活动，在有界工作期间调用 `await ctx.heartbeat(...)`，并在 `heartbeat_timeout` 到期前留足时间。第一个窗口从运行时领取任务开始，早于 Python 收到任务。每个已记录心跳使用运行时的记录时间，而不是响应到达 Python 的时间。暂停、请求延迟和传输重试都会消耗预算。请遵循[发送节奏建议](../features/heartbeats.md#heartbeat-cadence-and-receipts)。

直接调用 `Client.heartbeat_activity_task()` 会使用配置的 `TransportRetryPolicy`。策略处理后，传输错误可能以 `httpx.TransportError` 传播，HTTP 拒绝会映射为 `ServerError` 等 SDK 异常。这是 HTTP 重试，不是新的活动尝试，也不会增加心跳时间。Worker 要求活动停止时，`ActivityContext.heartbeat()` 可能抛出 `ActivityCancelled`。启用协作式进程监督后，心跳或所有权检查失败可能停止或放弃回调。不要假定每次失败都会回到异常处理块，或清理代码总会执行。

不要忽略心跳或所有权故障后继续执行外部工作或报告成功。进度不是外部提交，也不是可恢复检查点的确认。请保持外部副作用幂等。

### 不可重试错误 {#non-retryable-errors}

抛出 `NonRetryableError`，使活动失败且不重试：

```python
from durable_workflow import NonRetryableError

@activity.defn(name="validate")
async def validate(data: dict) -> dict:
    if "required_field" not in data:
        raise NonRetryableError("Missing required_field")
    return data
```

### 终结的业务错误 {#terminal-business-errors}

`non_retryable_error_types` 精确匹配**最外层**异常的短名称（`exception_type`）或完全限定类名（`exception_class`）。例如，即使 `SpecificValidationError` 是子类，`ValidationError` 也不会匹配它。`app.errors.ValidationError` 这样的限定名称必须与已记录的类名一致。策略不会遍历子类或异常原因。`raise RuntimeError(...) from NonRetryableError(...)` 报告的是外层 `RuntimeError`，因此仍可能重试。

转换已知业务异常时，应将 `NonRetryableError` 作为最外层异常，并使用 `cause=error` 保留原始 Python 原因。这无需名称列表就能将活动失败标记为不可重试，但不会自动使整个工作流失败。活动因不可重试错误或重试预算耗尽而不再重试时，工作流代码会收到 `ActivityFailed`。

```python
from durable_workflow import ActivityFailed, NonRetryableError, activity, workflow

@activity.defn(name="validate_order")
async def validate_order(order: dict) -> dict:
    try:
        if order.get("amount", 0) <= 0:
            raise ValueError("amount must be positive")
    except ValueError as error:
        raise NonRetryableError("Order validation failed", cause=error) from error
    return order

@workflow.defn(name="place_order")
class PlaceOrderWorkflow:
    def run(self, ctx, order: dict):
        try:
            yield ctx.schedule_activity("validate_order", [order])
        except ActivityFailed as failure:
            if (
                failure.activity_type != "validate_order"
                or failure.exception_type != "NonRetryableError"
                or not failure.non_retryable
            ):
                raise
            return {"order_id": order["id"], "status": "rejected"}
        return {"order_id": order["id"], "status": "accepted"}
```

输入 `{"id": "order-123", "amount": 0}` 时，活动失败一次，工作流随后以 `status: rejected` 正常完成。只处理预期的业务失败；示例会重新抛出其他失败。业务流程需要时，可以继续执行后续持久步骤。未捕获的 `ActivityFailed` 会使工作流失败。保留 Python 原因不代表重试策略会检查该异常链，也不代表所有 SDK 都暴露完全相同的原因对象。

### 同步与异步活动 {#activity-execution}

普通的远程 `def` 活动在专用线程池中执行，线程数受 `max_concurrent_activity_tasks` 限制。
每个函数都保留自己的活动上下文。函数阻塞时，轮询、工作流任务和 Worker 心跳仍可继续执行。
`async def` 活动在事件循环中执行，必须使用非阻塞 I/O；异步函数中的阻塞调用仍会阻塞该事件循环。

在同步函数中调用 `activity.context().heartbeat_sync(details)`，即可通过所属的事件循环发送进度，
同时保留原任务、尝试和 Worker 的身份。异步函数使用 `await activity.context().heartbeat(details)`。

取消等待并不会停止正在运行的 Python 线程。其实际槽位在函数返回前一直被占用，取消后的迟到返回不会提交结果。
如果函数在 `shutdown_timeout` 后仍在运行，关闭过程会抛出 `RuntimeError` 并保留 Worker 注册。
请限制下游 I/O 的超时时间，并为 CPU 密集型任务使用单独隔离的 Worker 进程。
详见 [SDK 执行与关闭参考](https://python.durable-workflow.com/reference/worker/)。

### 从辅助线程发送心跳 {#heartbeat-helper-thread}

对于长时间的阻塞调用，请在同步活动内部获取 `ctx = activity.context()`，
再将它传给辅助线程。新线程不会自动继承活动上下文。
在辅助线程中调用 `ctx.heartbeat_sync(details)`，不要在 Worker 事件循环中调用。
完整实现见 SDK 参考中的[辅助线程示例](https://python.durable-workflow.com/reference/activity/#heartbeats-during-one-blocking-call)。

调用正常返回或抛出异常时，都要停止辅助线程并通过 `join()` 等待其退出。
如果心跳抛出 `ActivityCancelled` 或 `ActivityLeaseAuthorityLost`，
请向阻塞调用发出协作取消信号，并在返回结果前重新抛出原始异常。
辅助线程中的异常无法强制中断阻塞的库调用。请为该调用设置有限的截止时间和取消机制，
同时限制心跳请求的超时时间和重试次数。否则，即使实际工作已卡住，辅助线程仍会持续报告存活。

## Worker {#worker}

`Worker` 向 Server 注册、轮询任务，并派发给你的工作流和活动实现。

需要独立工作流和活动进程时，请按 Python SDK 的[可运行进程拆分指南](https://python.durable-workflow.com/guides/separate-workers/)操作。它涵盖独立注册、共享或不同任务队列、重试、角色专属槽位及优雅关闭。

```python
from durable_workflow import Client, Worker

async with Client("http://localhost:8080", token="secret") as client:
    worker = Worker(
        client,
        task_queue="default",
        workflows=[GreeterWorkflow, OrderWorkflow],
        activities=[greet, send_email, validate],
        max_concurrent_workflow_tasks=10,
        max_concurrent_activity_tasks=10,
    )

    await worker.run()  # blocks until worker.stop() is called
```

对于冒烟测试和单工作流示例，`await worker.run_until(workflow_id="...", timeout=60.0)` 注册同一个 Worker，通过顺序轮询驱动一个工作流到终态。部署后应持续轮询的 Worker 使用 `run()`。

| 参数 | 默认值 | 描述 |
|-----------|---------|-------------|
| `task_queue` | 必填 | 要轮询的任务队列 |
| `workflows` | `()` | 要注册的工作流类 |
| `activities` | `()` | 要注册的活动函数 |
| `worker_id` | 自动生成 | 唯一 Worker 标识符 |
| `poll_timeout` | `35.0` | 长轮询超时，单位秒 |
| `max_concurrent_workflow_tasks` | `10` | 最大并行工作流任务数 |
| `max_concurrent_activity_tasks` | `10` | 最大并行活动任务数 |
| `shutdown_timeout` | `30.0` | 停止时排空执行中任务的秒数 |
| `metrics` | 客户端记录器 | 轮询和任务计数器/直方图的可选指标记录器 |
| `interceptors` | `()` | 用于观测、追踪和策略钩子的有序 Worker 任务封装 |

两个 `max_concurrent_*` 值在 Worker 注册期间公布给 Server，并出现在任务队列准入诊断中。将它们视为 Worker 本地容量。命名空间、队列或下游预算组需要跨多个 Worker 的硬性共享预算时，使用 Server 端[任务队列准入](/docs/polyglot/task-queue-admission)上限。

### Worker API 参考 {#worker-api-reference}

| 方法 | 返回 | 使用场景 |
| --- | --- | --- |
| `await worker.run()` | `None` | 由 systemd、Docker、Kubernetes 或本地开发 shell 监督的长时间运行进程。注册一次，然后轮询工作流、活动和查询任务，直到停止或取消。 |
| `await worker.run_until(workflow_id=..., timeout=60.0, poll_interval=0.5)` | `WorkflowExecution` | 启动一个工作流，并希望由同一进程驱动至终态的冒烟测试和示例。 |
| `await worker.stop()` | `None` | 协作式关闭。停止新轮询，并在 `shutdown_timeout` 内排空执行中任务。 |

`run()` 在开始轮询前验证 Server 兼容性。Worker 要求 Server 公布的 `control_plane.version`、`control_plane.request_contract`、`worker_protocol.version` 和 `auth_composition_contract` 与 SDK 支持的契约版本匹配。缺失或不兼容的清单在注册期间抛出 `RuntimeError`，让监督器快速失败，不运行无法安全完成任务的 Worker。

`run_until()` 使用与 `run()` 相同的注册和派发路径，但顺序轮询，并返回指定工作流最终的 `WorkflowExecution`。超时后工作流仍非终态时，抛出 `TimeoutError`。

任务执行期间：

- 未知工作流或活动类型作为任务失败回报 Server，不会隐藏在本地日志中
- `NonRetryableError` 将活动失败标记为不可重试
- `ActivityCancelled` 作为取消结果传播
- 未处理的活动异常报告为可重试失败，除非活动重试策略或 Server 截止时间另有规定
- 查询处理器异常报告为 `QueryFailed`

### Worker 拦截器 {#worker-interceptors}

Worker 执行需要围绕任务进行追踪、指标、审计日志或本地策略检查时，传入 `interceptors=[...]`。拦截器按给定顺序运行；首个拦截器是最外层，应调用 `next` 继续链。

```python
from durable_workflow import (
    ActivityInterceptorContext,
    PassthroughWorkerInterceptor,
)

class AuditInterceptor(PassthroughWorkerInterceptor):
    async def execute_activity(self, context: ActivityInterceptorContext, next):
        print("activity started", context.activity_type, context.worker_id)
        return await next(context)

worker = Worker(
    client,
    task_queue="orders",
    workflows=[OrderWorkflow],
    activities=[charge_card],
    interceptors=[AuditInterceptor()],
)
```

| 钩子 | 上下文字段 | `next` 返回 |
| --- | --- | --- |
| `execute_workflow_task(context, next)` | `worker_id`, `task_queue`, `task` | 工作流命令，或 `None` |
| `execute_activity(context, next)` | `worker_id`, `task_queue`, `task`, `activity_type`, `args` | 已解码活动结果 |
| `execute_query_task(context, next)` | `worker_id`, `task_queue`, `task` | 已编码查询结果字符串 |

仅需一个钩子时，将 `PassthroughWorkerInterceptor` 作为基类。希望类型检查器强制提供全部钩子时，直接实现 `WorkerInterceptor`。

### Worker 会话 {#worker-sessions}

当多个顺序执行的远程活动需要同一个 Worker 的本地资源时，使用 `WorkerSessionOptions`。本示例已使用 Python SDK **2.9.0** 和 Server **2.11.0** 验证；参见[可移植亲和性的版本要求](./portable-worker-affinity.md)。每次工作流运行应使用唯一的 `job_id`，避免新运行重复使用已终止的会话 ID。

下方缓存是可丢弃的。每个活动都能根据持久保存的业务输入重建缓存，因此替代持有者不依赖上一个进程的内存：

```python
from durable_workflow import ActivityFailed, WorkerSessionOptions, activity, workflow

# Disposable process-local state. Rebuild it from durable business input.
documents = {}

def ensure_document(job_id):
    rebuilt = job_id not in documents
    if rebuilt:
        documents[job_id] = {"text": "document:" + job_id}
    return documents[job_id], rebuilt

@activity.defn(name="prepare_document")
async def prepare_document(job_id):
    document, rebuilt = ensure_document(job_id)
    return {"holder": activity.context().info.worker_id, "rebuilt": rebuilt}

@activity.defn(name="inspect_document")
async def inspect_document(job_id):
    document, rebuilt = ensure_document(job_id)
    return {"holder": activity.context().info.worker_id,
            "rebuilt": rebuilt, "text": document["text"]}

@workflow.defn(name="inspect_document_workflow")
class InspectDocumentWorkflow:
    def run(self, ctx, job_id):
        session = WorkerSessionOptions(
            session_id="documents:" + job_id,
            requirements=("fs:documents",),
            lease_seconds=5,
            ttl_seconds=60,
            max_concurrent_activities=1,
            allow_reacquire_after_failure=True,
        )
        options = dict(worker_session=session,
                       start_to_close_timeout=5,
                       schedule_to_start_timeout=12,
                       schedule_to_close_timeout=20,
                       retry_policy={"max_attempts": 1})
        try:
            prepared = yield ctx.schedule_activity("prepare_document", [job_id], **options)
            inspected = yield ctx.schedule_activity("inspect_document", [job_id], **options)
        except ActivityFailed as error:
            if error.activity_type not in {"prepare_document", "inspect_document"}:
                raise
            return {"status": "resource_unavailable", "job_id": job_id}
        return {"status": "inspected", "prepared": prepared, "inspected": inspected}
```

注册两个活动，并在 Worker 上声明所需能力：

```python
from durable_workflow import Worker

worker = Worker(
    client,
    task_queue="documents",
    workflows=[InspectDocumentWorkflow],
    activities=[prepare_document, inspect_document],
    capabilities=["fs:documents"],
)
await worker.run()
```

在 `documents` 任务队列启动 `inspect_document_workflow`，输入为 `[job_id]`。第一个活动按需获取会话；只要租约有效，第二个活动就使用同一持有者。`max_concurrent_activities=1` 限制该会话内同时执行的活动数。队列路由和能力检查仍然生效。这些较短的租约与超时用于演示有界行为；请按实际工作调整，并在到期之前留出充足时间发送心跳。

持有者丢失或租约到期后，`allow_reacquire_after_failure=True` 允许另一个符合条件的 Worker 重新获取会话。它必须重建本地资源。已提交的活动结果会被重放，而未提交的副作用可能重复：请使用持久资源标识和幂等的外部操作。会话不会迁移内存、文件或已打开的句柄。

显式关闭和绝对 TTL 到期对该会话 ID 都是终态。后续活动无法重新打开它，可能一直无法获准执行，直到运行时处理已配置的超时。请运行[已发布部署方案](https://github.com/durable-workflow/server/blob/2.11.0/docker-compose.published.yml)中的 Server 调度器/维护角色；仅有 API 进程不足以执行超时处理。工作流通过 `ActivityFailed` 处理重试耗尽后的活动失败，并返回 `resource_unavailable`；应用随后可以选择新会话，根据业务输入重建资源。本示例不承诺立即抛出会话已关闭异常，也不会自动重新打开终态会话。

需要显式管理持有者生命周期时，使用 `worker.worker_session(options)` 及其 `create()`、`renew()`、`close(reason)` 方法。Worker 正常关闭时会关闭其持有的会话。参见[共享生命周期约定](../features/worker-sessions.md#lifecycle)。

## 日志 {#logging}

SDK 使用 Python 标准 `logging` 模块及结构化日志器名称：

| 日志器名称 | 记录内容 |
|-------------|--------------|
| `durable_workflow.worker` | Worker 注册、任务轮询、任务完成、错误 |
| `durable_workflow.workflow.replay` | 工作流重放事件（重放期间静默） |

### 配置日志 {#configuring-logging}

在应用入口点设置日志级别：

```python
import logging

# Show INFO-level worker events (registration, task completion)
logging.basicConfig(level=logging.INFO)

# Or configure specific loggers
logging.getLogger("durable_workflow.worker").setLevel(logging.DEBUG)
logging.getLogger("durable_workflow.workflow.replay").setLevel(logging.INFO)
```

### 日志级别 {#log-levels}

- **INFO**：Worker 注册、任务启动/完成、工作流完成
- **DEBUG**：详细任务负载（已截断）、轮询周期
- **WARNING**：可重试错误（失败的 API 调用、未知工作流类型）
- **ERROR**：不可重试失败、重放崩溃

### 重放感知日志 {#replay-aware-logging}

工作流内部使用 `ctx.logger` 记录重放感知日志：

```python
@workflow.defn(name="order_processor")
class OrderProcessor:
    def run(self, ctx, order_id: str):
        ctx.logger.info("Processing order %s", order_id)  # Only logs during execution, not replay
        result = yield ctx.schedule_activity("process_order", [order_id])
        ctx.logger.info("Order processed: %s", result)
        return result
```

日志语句**在重放期间保持静默**，避免工作流恢复或继续执行时产生大量重复日志。

### 结构化日志 {#structured-logging}

需要 JSON 结构化日志时，为应用根日志器配置 JSON 格式化器：

```python
import logging
import json

class JSONFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps({
            "timestamp": self.formatTime(record),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        })

handler = logging.StreamHandler()
handler.setFormatter(JSONFormatter())
logging.getLogger("durable_workflow").addHandler(handler)
logging.getLogger("durable_workflow").setLevel(logging.INFO)
```

## 指标 {#metrics}

`Client(metrics=...)` 和 `Worker(metrics=...)` 接受提供两个方法的任意记录器：

```python
def increment(name: str, value: float = 1.0, tags: dict[str, str] | None = None) -> None: ...
def record(name: str, value: float, tags: dict[str, str] | None = None) -> None: ...
```

默认记录器无操作，因此指标采集没有设置成本。测试或自定义导出循环可使用 `InMemoryMetrics`：

```python
from durable_workflow import Client, InMemoryMetrics, Worker

metrics = InMemoryMetrics()

async with Client("http://localhost:8080", token="secret", metrics=metrics) as client:
    worker = Worker(client, task_queue="default", workflows=[GreeterWorkflow], activities=[greet])
```

对于 Prometheus，安装可选附加依赖，并传入 `PrometheusMetrics`：

```bash
pip install 'durable-workflow[prometheus]'
```

```python
from durable_workflow import Client, PrometheusMetrics

metrics = PrometheusMetrics()
client = Client("http://localhost:8080", token="secret", metrics=metrics)
```

SDK 记录：

| 指标 | 类型 | 标签 |
|--------|------|------|
| `durable_workflow_client_requests` | 计数器 | `method`, `route`, `plane`, `status_code`, `outcome` |
| `durable_workflow_client_request_duration_seconds` | 直方图 | `method`, `route`, `plane`, `status_code`, `outcome` |
| `durable_workflow_worker_polls` | 计数器 | `task_kind`, `task_queue`, `outcome` |
| `durable_workflow_worker_poll_duration_seconds` | 直方图 | `task_kind`, `task_queue`, `outcome` |
| `durable_workflow_worker_tasks` | 计数器 | `task_kind`, `task_queue`, `outcome` |
| `durable_workflow_worker_task_duration_seconds` | 直方图 | `task_kind`, `task_queue`, `outcome` |

## 计划 {#schedules-1}

通过客户端创建和管理计划工作流：

```python
from durable_workflow import ScheduleSpec, ScheduleAction

# Create a schedule
handle = await client.create_schedule(
    schedule_id="hourly-report",
    spec=ScheduleSpec(cron_expressions=["0 * * * *"]),
    action=ScheduleAction(
        workflow_type="generate-report",
        task_queue="default",
        input=[{"format": "pdf"}],
    ),
    overlap_policy="skip",
    jitter_seconds=30,
)

# List all schedules
schedule_list = await client.list_schedules()

# Describe a schedule
desc = await handle.describe()
print(f"Next fire: {desc.next_fire_at}")
print(f"Total fires: {desc.fires_count}")

# Pause and resume
await handle.pause(note="maintenance window")
await handle.resume(note="maintenance complete")

# Trigger immediately
result = await handle.trigger()

# Backfill missed runs
backfill = await handle.backfill(
    start_time="2024-01-01T00:00:00Z",
    end_time="2024-01-02T00:00:00Z",
)

# Update the schedule
await handle.update(
    spec=ScheduleSpec(cron_expressions=["*/30 * * * *"]),
    note="Changed to every 30 minutes",
)

# Read the audit history stream (paused/resumed/triggered/updated events)
page = await handle.history(limit=100)
for event in page.events:
    print(event.sequence, event.event_type, event.recorded_at)
while page.has_more and page.next_cursor is not None:
    page = await handle.history(limit=100, after_sequence=page.next_cursor)
    for event in page.events:
        print(event.sequence, event.event_type, event.recorded_at)

# Or iterate every event without managing cursors
async for event in handle.iter_history():
    print(event.sequence, event.event_type)

# Delete the schedule (history survives the delete for audit)
await handle.delete()
```

## 同步客户端 {#synchronous-client}

脚本、notebook 和非异步上下文使用同步封装：

<!-- docs-example id="python.sync-client" -->
```python
import uuid

from durable_workflow.sync import Client as SyncClient

client = SyncClient("http://localhost:8080", token="secret")
workflow_id = f"sync-greeting-{uuid.uuid4().hex}"

handle = client.start_workflow(
    workflow_type="greeter",
    task_queue="default",
    workflow_id=workflow_id,
    input=["world"],
)

execution = client.describe_workflow(workflow_id)
print(execution.status)
```

同步客户端对应异步 API，但每次调用由 `asyncio.run` 封装。

## 错误处理 {#error-handling}

SDK 将 Server 错误码映射为类型化 Python 异常：

| 异常 | 触发情况 |
|-----------|------|
| `WorkflowNotFound` | 工作流 ID 不存在 |
| `WorkflowAlreadyStarted` | 工作流 ID 重复且策略冲突 |
| `WorkflowFailed` | 工作流执行失败 |
| `WorkflowCancelled` | 工作流已取消（继承 `BaseException`，而非 `Exception`） |
| `WorkflowTerminated` | 工作流已终止 |
| `ActivityCancelled` | 活动在执行期间被取消（继承 `BaseException`，而非 `Exception`） |
| `ChildWorkflowFailed` | 子工作流失败 |
| `QueryFailed` | 查询处理器返回错误 |
| `UpdateRejected` | 更新被工作流拒绝 |
| `ScheduleNotFound` | 计划 ID 不存在 |
| `ScheduleAlreadyExists` | 计划 ID 重复 |
| `NamespaceNotFound` | 命名空间不存在 |
| `InvalidArgument` | 请求参数无效 |
| `Unauthorized` | 认证失败 |
| `ServerError` | Server 返回意外错误 |

<!-- docs-example id="python.duplicate-start-recovery" -->
```python
from durable_workflow import WorkflowNotFound, WorkflowAlreadyStarted

try:
    handle = await client.start_workflow(
        workflow_type="greeter",
        task_queue="default",
        workflow_id="existing-id",
        input=["world"],
    )
except WorkflowAlreadyStarted:
    handle = client.get_workflow_handle("existing-id")
except WorkflowNotFound:
    print("Workflow type not registered on any worker")
```

### 有意让 `except Exception` 无法捕获取消 {#cancellation-is-intentionally-uncatchable-by-except-exception}

`WorkflowCancelled` 和 `ActivityCancelled` 继承 `BaseException`，而不是 `Exception`。活动体中，或等待 `client.get_result()` 的代码中的通用 `except Exception:` 块**不会**捕获它们。这是有意设计：取消是控制平面结果，如果被通用捕获静默吞掉，就可能让活动在工作流要求停止后仍报告成功。

活动任务取消时需要本地清理，应按类名捕获并重新抛出。这不会恢复已关闭工作流执行补偿：

```python
from durable_workflow import ActivityCancelled, activity

@activity.defn(name="long_task")
async def long_task(items: list) -> dict:
    ctx = activity.context()
    try:
        for i, item in enumerate(items):
            await process(item)
            await ctx.heartbeat({"progress": i + 1})
        return {"done": True}
    except ActivityCancelled:
        await cleanup_partial_state()
        raise
```

这与标准库 `asyncio.CancelledError` 和 `KeyboardInterrupt` 的做法一致。

## 测试 {#testing}

工作流作者应能在没有运行中的 Server 或 Worker 时测试工作流代码。`durable_workflow.testing` 模块提供两种入口：

- `WorkflowEnvironment` 在单个 Python 进程中使用用户注册的活动模拟，驱动工作流完成。
- `replay_history` 和 `replay_history_file` 用当前工作流代码重放采集的生产历史，遇到任何非确定性即抛出异常。

两个入口都复用 Worker 运行时使用的 `durable_workflow.workflow.replay` 机制，因此通过测试工具的工作流在真实 Worker 下具有相同行为。

### WorkflowEnvironment {#workflowenvironment}

`WorkflowEnvironment` 将 yield 的工作流命令派发给已注册模拟，并自动触发定时器、副作用和搜索属性 upsert。测试不需要真实时钟、Redis 或 Server。

```python
from durable_workflow import workflow
from durable_workflow.testing import WorkflowEnvironment

@workflow.defn(name="greeter")
class Greeter:
    def run(self, ctx, name: str):
        greeting = yield ctx.schedule_activity("greet", [name])
        return greeting


def test_greeter_returns_activity_result() -> None:
    env = WorkflowEnvironment()
    env.register_activity_result("greet", "hello, world")

    result = env.execute_workflow(Greeter, "world")

    assert result == "hello, world"
```

| 方法 | 用途 |
| --- | --- |
| `register_activity_result(name, result)` | 每次调用活动 `name` 都返回 `result`。测试不关心参数时使用。 |
| `register_activity(name, fn)` | 对活动 `name` 的每次调度调用执行 `fn(*arguments)`。模拟需要随参数变化或捕获调用时使用。 |
| `register_child_workflow_result(workflow_type, result)` | 工作流启动类型为 `workflow_type` 的子工作流时，返回 `result`。 |
| `signal(name, args=None, run=None)` | 排队一个信号，在下一次重放迭代前交付。测试工具注入 `SignalReceived` 事件并派发给已注册的 `@workflow.signal` 处理器。传入 `run=N` 定位继续为新运行链的第 `N` 环。 |
| `register_workflow(workflow_cls)` | 让另一个工作流类可按名称解析。链通过 `continue_as_new(workflow_type=...)` 调用不同于初始工作流的类型时必需。 |
| `execute_workflow(workflow_cls, *args, run_id="test-run")` | 驱动工作流到终态并返回结果。沿 `continue_as_new` 链跟随至最后运行，并返回其结果。工作流以失败状态结束时抛出 `WorkflowFailed`。 |
| `runs` / `run_count` | `execute_workflow` 返回后，为链中每一环提供一个 `WorkflowRunRecord`（输入、工作流类型、历史事件、终态命令），使测试能对完整继续运行链进行断言。 |

缺少样例时，测试工具明确失败：

- 调度未注册模拟的活动会抛出 `KeyError`
- 启动未注册模拟的子工作流会抛出 `KeyError`
- 工作流在迭代上限内（默认 `1000`）始终未到达终态，会抛出 `RuntimeError`

对确实需要超过默认迭代次数的工作流，在 `WorkflowEnvironment(...)` 中传入 `iteration_limit=...` 调整上限。

#### 可调用活动模拟 {#callable-activity-mocks}

模拟需要根据参数响应或记录调用时，使用 `register_activity`：

```python
def test_callable_mock_captures_arguments() -> None:
    captured: list[str] = []

    def record_greet(name: str) -> str:
        captured.append(name)
        return f"greeted:{name}"

    env = WorkflowEnvironment()
    env.register_activity("greet", record_greet)

    assert env.execute_workflow(Greeter, "alice") == "greeted:alice"
    assert captured == ["alice"]
```

#### 信号 {#signals}

通过 `env.signal(...)` 排队的信号在下一次重放迭代前交付完毕。信号负载使用与 Worker 运行时相同的 `{codec, blob}` 封装，并派发给工作流已注册的 `@workflow.signal` 处理器：

```python
@workflow.defn(name="approval")
class Approval:
    def __init__(self) -> None:
        self.approved_by: str | None = None

    @workflow.signal("approve")
    def on_approve(self, by: str) -> None:
        self.approved_by = by

    def run(self, ctx):
        yield ctx.schedule_activity("wait", [])
        return {"approved_by": self.approved_by}


def test_signal_is_delivered_before_run_returns() -> None:
    env = WorkflowEnvironment()
    env.register_activity_result("wait", None)
    env.signal("approve", ["alice"])

    result = env.execute_workflow(Approval)

    assert result == {"approved_by": "alice"}
```

#### 定时器、副作用与搜索属性 {#timers-side-effects-and-search-attributes}

测试工具为这些命令自动触发相应历史事件，因此工作流在测试中不会因系统时钟时间阻塞：

- `ctx.sleep(seconds)` → `TimerFired`
- `ctx.side_effect(...)` → `SideEffectRecorded`
- `ctx.upsert_search_attributes(...)` → `SearchAttributesUpserted`
- `workflow.version(...)` 标记 → `VersionMarkerRecorded`

#### 继续为新运行链 {#continue-as-new-chains}

工作流返回 `ctx.continue_as_new(...)` 时，测试工具向即将完成的运行追加 `WorkflowContinuedAsNew` 事件、重置历史，并用命令参数启动新运行。`execute_workflow` 的返回值是链中最后一环的终态结果。

```python
@workflow.defn(name="countdown")
class Countdown:
    def run(self, ctx, counter: int):
        yield ctx.schedule_activity("emit", [counter])
        if counter > 0:
            return ctx.continue_as_new(counter - 1)
        return {"final_counter": counter}


def test_chain_returns_final_run_result() -> None:
    env = WorkflowEnvironment()
    env.register_activity_result("emit", None)

    result = env.execute_workflow(Countdown, 3)

    assert result == {"final_counter": 0}
    assert env.run_count == 4
    assert [r.input for r in env.runs] == [[3], [2], [1], [0]]
```

链切换工作流类型时，先注册后续类：

```python
@workflow.defn(name="stage-one")
class StageOne:
    def run(self, ctx):
        yield ctx.schedule_activity("stage_one", [])
        return ctx.continue_as_new(workflow_type="stage-two")


@workflow.defn(name="stage-two")
class StageTwo:
    def run(self, ctx):
        return (yield ctx.schedule_activity("stage_two", []))


def test_chain_can_switch_workflow_type() -> None:
    env = WorkflowEnvironment()
    env.register_workflow(StageTwo)
    env.register_activity_result("stage_one", None)
    env.register_activity_result("stage_two", "done")

    assert env.execute_workflow(StageOne) == "done"
    assert [r.workflow_type for r in env.runs] == ["stage-one", "stage-two"]
```

使用 `run=N` 将信号定位到链中的特定一环：

```python
env.signal("approve", ["alice"], run=2)  # delivered to the second run
```

链长由 `continue_as_new_limit` 限制（默认 `50`）。超出上限抛出 `RuntimeError`，使测试捕获失控的继续运行，而非无限循环；链确实需要更长时，用 `WorkflowEnvironment(continue_as_new_limit=...)` 调整上限。

#### 失败断言 {#failure-assertions}

抛出 Python 异常的工作流表现为 `WorkflowFailed`：

```python
import pytest
from durable_workflow.errors import WorkflowFailed

@workflow.defn(name="failing")
class Failing:
    def run(self, ctx):
        yield ctx.schedule_activity("step", [])
        raise RuntimeError("boom")


def test_workflow_failure_surfaces_as_workflow_failed() -> None:
    env = WorkflowEnvironment()
    env.register_activity_result("step", None)

    with pytest.raises(WorkflowFailed) as exc_info:
        env.execute_workflow(Failing)

    assert "boom" in str(exc_info.value)
```

### 针对生产历史的重放测试 {#replay-testing-against-production-history}

用 `replay_history` 针对从 Server 采集的真实历史，对工作流变更进行回归测试。重放器用当前工作流代码运行已记录的事件序列，如果 yield 的命令不同于历史记录就抛出异常，这正是非确定性缺陷的定义。

```python
from durable_workflow import Client
from durable_workflow.testing import replay_history

async with Client("http://localhost:8080") as client:
    history = await client.get_history("order-42", run_id="...")

replay_history(OrderWorkflow, history["events"], start_input=["order-42"])
```

先前已完成的工作流，对相同历史重放时仍必须完成。如果工作流代码变化导致偏离已记录序列（活动调用重排、分支移除、活动类型更改），`replay_history` 会抛出异常，使回归在 CI 中被发现，而非进入生产。

`replay_history_file` 是便捷封装，读取两种结构之一的 JSON 文件：顶层事件列表，或带 `events` 键、与 `get_history` 响应结构一致的字典：

```python
from durable_workflow.testing import replay_history_file

replay_history_file(
    OrderWorkflow,
    "tests/histories/order-42.json",
    start_input=["order-42"],
)
```

两个函数都接受可选 `payload_codec` 验证提示。不设置时使用历史记录的标签。显式或记录的标签必须为 `avro`；`json`、未知或无标签的持久负载在解码前即失败。

#### 基于类的重放器 {#class-based-replayer}

一次测试需要重放多种工作流类型的历史，或需要由采集的 `WorkflowStarted` 事件决定重放哪个工作流时，使用 `Replayer` 类。预先注册每个工作流类，对每份采集历史调用一次 `replay(...)`：

```python
from durable_workflow import Replayer, ReplayOutcome

replayer = Replayer(workflows=[OrderWorkflow, RefundWorkflow])

# Explicit type and input — equivalent to replay_history(OrderWorkflow, ...).
outcome: ReplayOutcome = replayer.replay(
    history["events"],
    start_input=["order-42"],
    workflow_type="order",
)

# Type and start input inferred from a WorkflowStarted event in the history.
outcome = replayer.replay(history)  # history may be an events list or a
                                    # dict with an "events" key

for command in outcome.commands:
    # Inspect commands the replayed workflow would have emitted next.
    ...
```

`Replayer(workflows=[...])` 对空工作流集合或重复注册抛出 `ValueError`。历史请求未注册工作流类型时，或注册多个工作流但调用方未提供 `workflow_type`、历史又没有 `WorkflowStarted` 事件时，`replay(...)` 抛出 `ValueError`。

`ReplayOutcome.commands` 与函数式 `replay_history` 辅助函数返回相同命令列表；基于类的入口让测试套件能在多份历史之间共享一次注册。

### 测试工具参考 {#test-harness-reference}

| 符号 | 用途 |
| --- | --- |
| `durable_workflow.testing.WorkflowEnvironment` | 进程内测试工具。通过已注册活动和子工作流模拟驱动工作流完成。 |
| `durable_workflow.testing.replay_history(workflow_cls, events, start_input=None, *, run_id="", payload_codec=None)` | 使用当前工作流代码重放历史事件序列。遇到非确定性时抛出异常。 |
| `durable_workflow.testing.replay_history_file(workflow_cls, path, start_input=None, *, run_id="", payload_codec=None)` | 从磁盘加载 JSON 历史并重放。接受顶层事件列表或带 `events` 键的字典。 |
| `durable_workflow.Replayer(*, workflows=[...])` | 基于类的重放器。注册一个或多个工作流类，然后调用 `replay(history, start_input=None, *, workflow_type=None, workflow_id=None, run_id="", payload_codec=None)` 重放每份采集历史。历史包含 `WorkflowStarted` 事件时，从中推断 `workflow_type` 和 `start_input`。 |
| `durable_workflow.ReplayOutcome` | `Replayer.replay` 返回的数据类。携带 `commands: list[Command]`，即重放工作流接下来本应输出的命令。 |
| `durable_workflow.errors.WorkflowFailed` | 工作流以失败状态终止时由 `execute_workflow` 抛出。 |
| `durable_workflow.errors.WorkflowCancelled` | 工作流取消时的终态。继承 `BaseException`。 |
| `durable_workflow.errors.WorkflowTerminated` | 工作流被 Server 终止时的终态。继承 `BaseException`。 |

## 负载编解码器 {#payload-codec}

<div
  data-public-payload-codec-contract="avro-only"
  data-payload-codec="avro"
  data-authority-manifest="https://durable-workflow.github.io/sdk-neutrality-contract.json"
  data-legacy-v1-import-drain="none">
  越过 Worker 协议边界的每个负载都带编解码器标签。Durable Workflow 2.0 只有一种公开负载编解码器：<code data-payload-codec-field="codec">avro</code>。Python SDK 拒绝标记为 JSON、未知及无标签的持久负载，不会选择其他解码器。参见 <a href="/docs/polyglot/avro-value-protocol/">Avro Value 协议</a>。
</div>

### 内置 Avro 支持 {#avro-support-is-built-in}

固定版本的 2.0 SDK 制品将 `fastavro` 作为运行时依赖，因此每个出站接口（`start_workflow`、`signal_workflow`、`query_workflow`、`update_workflow`、活动结果编码、计划动作）都通过优化的生产路径输出带 Avro 标签的负载。无需安装可选编解码器附加依赖。

### 固定类型化值 {#fixed-typed-values}

SDK 在共享的 `durable_workflow.protocol.Value` 模式中显式选择具名分支。它不在 Avro 中将值编码为 JSON。因此整数和双精度数、字符串和字节、布尔值和整数，以及列表和映射跨 SDK 保持不同。线格式使用 Avro 单对象帧及模式指纹；未知指纹以 `unsupported_payload_schema` 失败。

每个客户端和 Worker 接口均使用默认 Avro 端到端工作：

- **客户端启动、信号、查询、更新**：`start_workflow`、`signal_workflow`、`query_workflow` 和 `update_workflow` 通过固定 Value 模式输出 `payload_codec = "avro"` 负载。因此 Python 客户端可以驱动 PHP 和其他多语言 SDK 将要重放的工作流，反之亦然。
- **活动 Worker**：带 Avro 标签的活动参数透明解码。Worker 将活动结果编码为 Avro，使 PHP、Python 和未来 SDK Worker 共享同一负载边界。
- **活动失败**：`fail_activity_task(..., details=...)` 将 `failure.details` 作为 `{codec, blob}` 封装发送。Server 记录 blob 及 `details_payload_codec`，使来自 Python Worker 的诊断失败数据在历史导出和可观测视图中保持语言中立。
- **工作流 Worker 历史重放**：带 Avro 标签的启动输入和活动结果事件在重放期间解码，使 Python 工作流能参与 Avro 编码的运行。
- **工作流查询任务**：Server 路由的查询任务携带带 Avro 标签的工作流参数、查询参数及重放历史。Worker 将查询结果作为 Avro 封装返回。

### 对 v2 运行执行 Python 活动 Worker {#running-a-python-activity-worker-against-a-v2-run}

无需编解码器配置。SDK 在解码每次认领前验证 `payload_codec`，仅接受 `avro`，运行活动，并返回带 Avro 标签的结果。其他任何标签都默认拒绝，以 `unsupported_payload_codec` 失败；Worker 绝不嗅探或猜测格式。

### 可在 Python 和 PHP 间无损往返的类型 {#types-that-round-trip-cleanly-across-python-and-php}

| Python 类型 | Avro Value 分支 | PHP 类型 |
|-------------|------|----------|
| `str` | `StringValue` | `string` |
| `bytes` | `BytesValue` | `AvroBinaryValue` |
| `int` | `LongValue` | `int` |
| `float` | `DoubleValue` | `float` |
| `bool` | `BooleanValue` | `bool` |
| `None` | `null` | `null` |
| `list` | `ArrayValue` | `array`（列表） |
| `dict[str, ...]` | `MapValue` | `array`（字符串键映射） |

将数据类、集合、元组和 datetime 对象等 Python 专属类型适配为规范字符串、整数、映射或列表，再用作工作流或活动值。

## 连接共享 Server 运行 {#running-against-a-shared-server}

上方[快速入门](#quickstart)展示如何通过已发布 Docker 镜像启动本地 Server。团队环境中，通常让 Python Worker 指向现有 Server（预发布、生产或共享开发实例）：

```python
from durable_workflow import Client

client = Client(
    "https://workflow.example.internal",
    control_token="team-orders-operator-token",
    worker_token="team-orders-worker-token",
    namespace="team-orders",
)
```

将 `namespace` 参数设为共享 Server 为团队配置的租户命名空间，并使用为该命名空间签发的凭据。Server 运维人员管理命名空间创建；详情见 [Server 指南](/docs/polyglot/server)。

同一构造函数也支持 Cloud 托管运行时。使用 Cloud 为命名空间提供的运行时 URL 和命名空间值，将 `control_token` 设为客户端运行时凭据，将 `worker_token` 设为 Worker 运行时凭据。Cloud 负责配置命名空间；不要替换为自托管 Server 地址。参见 [Cloud 托管运行时](/docs/polyglot/cloud-control-plane)。
