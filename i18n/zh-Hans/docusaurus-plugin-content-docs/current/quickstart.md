---
sidebar_position: 2
title: Durable Workflow 2.0 快速入门
description: 选择服务模式运行时，用 PHP、Python 或 Rust 完成第一个工作流。
tags:
  - quickstart
  - getting-started
  - PHP
  - Python
  - Rust
keywords:
  - Durable Workflow 快速入门
  - Durable Workflow 2.0 快速入门
  - 独立 PHP SDK 快速入门
  - Python SDK 快速入门
  - Rust SDK 快速入门
  - 独立 Server Docker 快速入门
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import PythonPackageReleaseLink from '@site/src/components/PythonPackageReleaseLink';

# Durable Workflow 2.0 快速入门 {#durable-workflow-20-quickstart}

## 开始之前 {#before-you-begin}

**目标：** 用 PHP、Python 或 Rust 运行一个服务模式工作流，并读取已完成的持久结果。

**预计时间：** 运行时就绪后约 15 分钟。

**完成标志：** 所选 SDK 启动 Worker 和工作流，然后输出工作流 ID、`status=completed` 和 `Hello, <language>!`。

**前提条件：**

- `curl` 和终端
- 本地自托管路径需要 Docker，或使用已经配置好的 Durable Workflow Cloud 命名空间
- 一种语言工具链：PHP 8.1+ 和 Composer、Python 3.10+，或 Rust 1.86+

服务模式不需要 Laravel。本指南末尾单独介绍 Laravel 内嵌模式。

## 1. 选择服务模式运行时 {#1-choose-your-service-mode-runtime}

| 运行时 | 适用情况 | 下一步 |
| --- | --- | --- |
| Durable Workflow Cloud | 希望由 Durable Workflow 运维运行时、持久存储和 Managed Waterline。 | 按照可直接执行的 [Cloud 第一个工作流](/docs/polyglot/cloud-control-plane/#cloud-first-workflow)指南，将完整的 PHP、Python、Rust 程序连接到已配置的凭据，并获得 `completed` 结果。**不要运行 Server 或单独的 Waterline 服务。** |
| 自托管 Server | 希望自行运维运行时，或执行下面这个使用已发布制品的本地示例。 | 继续使用 Docker 和 `curl`。需要操作界面时，再单独部署 Waterline。 |

下面的完整程序使用本地自托管 Server，无需账户或源码检出即可运行。Cloud 使用相同的 SDK 和 Worker 模型，将本地开发连接替换为 [Cloud 托管运行时](/docs/polyglot/cloud-control-plane/)提供的连接信息即可。

## 2. 启动本地 Server {#2-start-the-local-server}

如果选择 Cloud，跳过这一步。自托管路径请展开并执行下面固定版本的配置。它会启动一个不挂载源码的 Server，使用 SQLite 和开发令牌。

<details>
<summary>启动固定版本的 Server 镜像</summary>

<!-- docs-example id="quickstart.server.setup" -->
```bash
export DW_SERVER_IMAGE=%%artifact.serverDockerHubImage%%
export DW_AUTH_TOKEN=dev-token

docker volume create durable-workflow-quickstart

docker run --rm \
  -v durable-workflow-quickstart:/app/database \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$DW_SERVER_IMAGE" server-bootstrap

docker rm -f durable-workflow-server >/dev/null 2>&1 || true
docker run -d --name durable-workflow-server \
  -p 8080:8080 \
  -v durable-workflow-quickstart:/app/database \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$DW_SERVER_IMAGE"

until curl -sf http://localhost:8080/api/ready >/dev/null; do sleep 1; done
curl -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  http://localhost:8080/api/cluster/info
```

</details>

**预期结果：** 就绪请求成功，集群信息标识出本地独立 Server。完成一种语言的入门路径前，请保持 Server 运行。

## 3. 选择一种语言 {#choose-one-language}

三种第一方 SDK 同等受支持。页面只显示选中的标签页，便于专注于一条路径。

<Tabs groupId="quickstart-language" className="quickstart-language-tabs">
<TabItem value="php" label="PHP" default>

要求：PHP 8.1 或更高版本，以及 Composer。这里使用不依赖框架的 `durable-workflow/sdk` 包。

1. **安装 SDK。**

<!-- docs-example id="quickstart.php.install" -->
```bash
mkdir durable-workflow-php-quickstart
cd durable-workflow-php-quickstart
composer require %%artifact.phpSdkComposerPackage%%
```

2. **添加 Worker 和客户端。** 展开完整源码，将两个文件复制到新项目中。

<details>
<summary>可直接运行的完整 PHP 源码</summary>

Worker 在自己的任务队列上注册一种工作流类型和一种活动类型。

<!-- docs-example id="quickstart.php.worker" -->
```bash
cat > worker.php <<'PHP'
<?php

declare(strict_types=1);

require __DIR__.'/vendor/autoload.php';

use DurableWorkflow\Client;
use DurableWorkflow\Worker;
use DurableWorkflow\Worker\ActivityContext;
use DurableWorkflow\Worker\WorkflowContext;

$client = new Client('http://localhost:8080', token: 'dev-token');
$worker = new Worker($client, 'quickstart-php');

$worker->registerActivity(
    'quickstart.greet',
    static fn (ActivityContext $context, string $name): string => "Hello, {$name}!",
);

$worker->registerWorkflow(
    'quickstart.greeter',
    static function (WorkflowContext $context, string $name): array {
        $greeting = $context->activity('quickstart.greet', [$name]);

        return ['greeting' => $greeting, 'language' => 'php'];
    },
);

$worker->run();
PHP
```

#### 客户端与结果读取 {#client-and-result-reader}

客户端启动一个名称唯一的工作流，等待所选运行完成，然后读取 Server 保存的持久终态。

<!-- docs-example id="quickstart.php.client" -->
```bash
cat > start.php <<'PHP'
<?php

declare(strict_types=1);

require __DIR__.'/vendor/autoload.php';

use DurableWorkflow\Client;

$client = new Client('http://localhost:8080', token: 'dev-token');
$workflowId = 'quickstart-php-greeter-'.bin2hex(random_bytes(4));
$handle = $client->startWorkflow(
    workflowType: 'quickstart.greeter',
    workflowId: $workflowId,
    taskQueue: 'quickstart-php',
    input: ['PHP'],
);

$result = $handle->result(timeoutSeconds: 30);
$execution = $handle->describeSelectedRun();

echo "workflow_id={$execution->workflowId}\n";
echo "status={$execution->status}\n";
echo 'result='.json_encode($result, JSON_THROW_ON_ERROR)."\n";
PHP
```

</details>

3. **运行 Worker 和客户端。**

<!-- docs-example id="quickstart.php.run" -->
```bash
php worker.php > quickstart-worker.log 2>&1 &
export QUICKSTART_WORKER_PID=$!
trap 'kill "$QUICKSTART_WORKER_PID" 2>/dev/null || true' EXIT

php start.php

kill "$QUICKSTART_WORKER_PID" 2>/dev/null || true
trap - EXIT
```

**预期结果：** 输出 `status=completed`，结果包含 `"greeting":"Hello, PHP!"`。你已在没有 Laravel 的情况下运行独立 PHP Worker，并读取其持久结果。

接下来阅读 [PHP SDK 指南](/docs/polyglot/php/)。

</TabItem>
<TabItem value="python" label="Python">

要求：Python 3.10 或更高版本。程序将 Worker 和客户端放在同一进程中，但它们仍通过公开的 Worker API 和控制平面 API 与 Server 通信。

1. **安装 SDK。**

   使用上方版本清单列出的 <PythonPackageReleaseLink authority="qualified">Python SDK 稳定版本</PythonPackageReleaseLink>。生成的精确版本要求让这条可执行路径使用文档指定的稳定版本。

<!-- docs-example id="quickstart.python.install" -->
```bash
mkdir durable-workflow-python-quickstart
cd durable-workflow-python-quickstart

python3 -m venv .venv
. .venv/bin/activate
pip install %%artifact.pythonPackagePin%%
```

2. **创建并运行 Worker 和客户端。** 展开完整程序，最后一条命令会运行它。

<details>
<summary>可直接运行的完整 Python 源码</summary>

<!-- docs-example id="quickstart.python.greeter" -->
```bash
cat > greeter.py <<'PY'
import asyncio
import time

from durable_workflow import Client, Worker, activity, workflow


@activity.defn(name="quickstart.greet")
async def greet(name: str) -> dict:
    return {"greeting": f"Hello, {name}!", "language": "python"}


@workflow.defn(name="quickstart.greeter")
class GreeterWorkflow:
    def run(self, ctx, name):
        return (yield ctx.schedule_activity("quickstart.greet", [name]))


async def main():
    workflow_id = f"quickstart-python-greeter-{int(time.time())}"

    async with Client(
        "http://localhost:8080",
        token="dev-token",
        namespace="default",
    ) as client:
        handle = await client.start_workflow(
            workflow_type="quickstart.greeter",
            task_queue="quickstart-python",
            workflow_id=workflow_id,
            input=["Python"],
        )

        worker = Worker(
            client,
            task_queue="quickstart-python",
            workflows=[GreeterWorkflow],
            activities=[greet],
        )
        await worker.run_until(workflow_id=workflow_id, timeout=30.0)

        result = await handle.result(timeout=10.0)
        execution = await handle.describe_run()

    print(f"workflow_id={execution.workflow_id}")
    print(f"status={execution.status}")
    print(f"result={result}")


asyncio.run(main())
PY

python greeter.py
```

</details>

**预期结果：** 输出 `status=completed`，结果包含 `Hello, Python!`。最后两次 SDK 调用从 Server 读取所选运行的结果和持久终态。

接下来阅读 [Python SDK 指南](/docs/polyglot/python/)。

</TabItem>
<TabItem value="rust" label="Rust">

要求：Rust 1.86 或更高版本。此示例在同一个 Tokio 进程中运行原生 Worker 和客户端。

1. **安装 SDK。**

<!-- docs-example id="quickstart.rust.install" -->
```bash
cargo new durable-workflow-rust-quickstart
cd durable-workflow-rust-quickstart
%%artifact.rustCargoAddCommand%%
cargo add tokio --features macros,rt-multi-thread,time
```

2. **创建并运行 Worker 和客户端。** 展开完整程序，最后一条命令会编译并运行它。

<details>
<summary>可直接运行的完整 Rust 源码</summary>

<!-- docs-example id="quickstart.rust.greeter" -->
```bash
cat > src/main.rs <<'RS'
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use durable_workflow::{json, Client, Result, Worker, WorkflowResultOptions};

#[tokio::main]
async fn main() -> Result<()> {
    let client = Client::builder("http://localhost:8080")
        .token(Some("dev-token".to_string()))
        .namespace("default")
        .build()?;
    let task_queue = "quickstart-rust";
    let mut worker = Worker::new(client.clone(), task_queue);

    worker.register_activity("quickstart.greet", |_context, arguments| async move {
        let name = arguments
            .get(0)
            .and_then(|value| value.as_str())
            .unwrap_or("Rust");
        Ok(json!({"greeting": format!("Hello, {name}!"), "language": "rust"}))
    });

    worker.register_workflow("quickstart.greeter", |context, input| async move {
        let name = input.get(0).and_then(|value| value.as_str()).unwrap_or("Rust");
        context.activity("quickstart.greet", json!([name])).await
    });

    worker.register().await?;
    let workflow_id = format!("quickstart-rust-greeter-{}", unique_suffix());
    let handle = client
        .start_workflow(
            "quickstart.greeter",
            task_queue,
            &workflow_id,
            json!(["Rust"]),
        )
        .await?;

    let watcher = handle.clone();
    worker
        .run_until(async move {
            loop {
                if watcher.describe().await.is_ok_and(|run| run.is_terminal()) {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
        })
        .await?;

    let result = handle.result(WorkflowResultOptions::default()).await?;
    let execution = handle.describe_selected_run().await?;

    println!("workflow_id={workflow_id}");
    println!("status={}", execution.status.as_deref().unwrap_or("unknown"));
    println!("result={result}");
    Ok(())
}

fn unique_suffix() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}
RS

cargo run
```

</details>

**预期结果：** 输出 `status=completed`，JSON 结果包含 `"greeting":"Hello, Rust!"`。示例等待 Worker 完成运行，然后读取所选运行的持久状态和解码后的结果。

接下来阅读 [Rust SDK 指南](/docs/polyglot/rust/)。

</TabItem>
</Tabs>

## 4. 清理本地 Server {#4-clean-up-the-local-server}

Cloud 用户没有需要移除的本地 Server。自托管示例完成后执行：

```bash
docker rm -f durable-workflow-server
docker volume rm durable-workflow-quickstart
```

## 独立路径：Laravel 内嵌模式 {#separate-path-embedded-laravel}

Laravel 内嵌模式是一种第一方 PHP 部署模式，适合希望将工作流状态、队列执行、配置和操作工具放在现有 Laravel 基础设施中的应用。它安装 `durable-workflow/workflow` 包。

使用已发布的包创建一个新的内嵌应用：

```bash
composer create-project laravel/laravel durable-workflow-laravel-quickstart
cd durable-workflow-laravel-quickstart
composer require %%artifact.workflowComposerPackage%%
php artisan migrate
php artisan queue:work
```

如果需要在同一个 Laravel 应用中使用操作界面，再添加经过验证的 Waterline 内嵌 Composer 包：

```bash
composer require %%artifact.waterlineComposerPackage%%
php artisan waterline:install
```

这个 Composer 包的安装方式用于内嵌模式。自行部署的 Waterline 服务使用另一种安装方式。Laravel 内嵌模式无需运行 Server，也无需安装服务模式 SDK。

继续阅读[内嵌安装](/docs/installation/)，配置非 `sync` 的 Laravel 队列，然后[定义](/docs/defining-workflows/workflows/)并[启动](/docs/defining-workflows/starting-workflows/)内嵌工作流。[部署模式](/docs/polyglot/deployment-modes/)介绍这条路径与服务模式平台的关系。

## 下一步 {#next-steps}

- 在[能力索引](/docs/capabilities/)中检查所选运行时和 SDK 的支持范围。
- 继续阅读服务模式的 [PHP SDK](/docs/polyglot/php/)、[Python SDK](/docs/polyglot/python/)或 [Rust SDK](/docs/polyglot/rust/)指南。
- 在[客户端与 Worker 能力](/docs/polyglot/cli-python-parity/)中比较生命周期、消息、调度、可见性和 Worker 执行。
- 通过 [Cloud 托管运行时](/docs/polyglot/cloud-control-plane/)或[自托管 Server](/docs/polyglot/server/)运维相应运行时。需要命令行自动化时，添加 [CLI](/docs/polyglot/cli/)。
- 用 [Worker 兼容性与路由](/docs/polyglot/worker-compatibility-routing/)和 [build-ID 发布](/docs/polyglot/worker-build-id-rollout/)规划安全的服务 Worker 部署。

Laravel 内嵌模式的定时器、信号、查询、活动和子工作流等编写功能，请参考单独的[内嵌文档](/docs/category/embedded/)。

版本发布验证有独立指南。[平台一致性测试套件](/docs/platform-conformance/)包含用于认证的精确制品矩阵、公开源码检查、完整执行记录、实际耗时标准、清理步骤和机器可读的快速入门契约。

