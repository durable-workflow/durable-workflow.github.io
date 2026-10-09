---
sidebar_position: 2
title: Durable Workflow 2.0 クイックスタート
description: サービスモードのランタイムを選び、PHP、Python、Rust で最初のワークフローを完了させます。
tags:
  - quickstart
  - getting-started
  - PHP
  - Python
  - Rust
keywords:
  - Durable Workflow クイックスタート
  - Durable Workflow 2.0 クイックスタート
  - 独立 PHP SDK クイックスタート
  - Python SDK クイックスタート
  - Rust SDK クイックスタート
  - Server Docker クイックスタート
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import PythonPackageReleaseLink from '@site/src/components/PythonPackageReleaseLink';

# Durable Workflow 2.0 クイックスタート {#durable-workflow-20-quickstart}

## 始める前に {#before-you-begin}

**目的：** PHP、Python、Rust のいずれかでサービスモードのワークフローを実行し、完了した永続結果を読み取ります。

**所要時間：** ランタイムの準備後、約 15 分です。

**完了の目印：** 選んだ SDK が Worker とワークフローを開始し、ワークフロー ID、`status=completed`、`Hello, <language>!` を出力します。

**必要なもの：**

- `curl` とターミナル
- ローカルのセルフホスト経路には Docker、または準備済みの Durable Workflow Cloud 名前空間
- PHP 8.1+ と Composer、Python 3.10+、Rust 1.86+ のいずれかのツールチェーン

サービスモードに Laravel は不要です。Laravel 組み込みモードは、このガイドの最後で説明します。

## 1. サービスモードのランタイムを選ぶ {#1-choose-your-service-mode-runtime}

| ランタイム | 適している場合 | 次の手順 |
| --- | --- | --- |
| Durable Workflow Cloud | ランタイム、永続ストレージ、Managed Waterline の運用を Durable Workflow に任せたい。 | 実行可能な [Cloud の最初のワークフロー](/docs/polyglot/cloud-control-plane/#cloud-first-workflow)に従います。PHP、Python、Rust の完全なソースを準備済みの認証情報へ接続し、`completed` の結果を得ます。**Server や独立した Waterline サービスを実行する必要はありません。** |
| セルフホスト Server | ランタイムを自分で運用したい、または公開済み製品だけでこのローカル例を試したい。 | 以下の Docker と `curl` の手順へ進みます。運用 UI が必要な場合だけ、Waterline を別途デプロイします。 |

以下の完全なソースは、アカウントや製品のソース取得なしで試せるローカル Server を使います。Cloud も同じ SDK と Worker モデルです。ローカル開発用の接続を、[Cloud マネージドランタイム](/docs/polyglot/cloud-control-plane/)の接続情報に置き換えてください。

## 2. ローカル Server を起動する {#2-start-the-local-server}

Cloud を選んだ場合は、この手順を省略します。セルフホストでは、固定バージョンの設定を開いて実行します。製品のソースをマウントせず、SQLite と開発用トークンを使う Server が起動します。

<details>
<summary>固定バージョンの Server イメージを起動する</summary>

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

**期待する結果：** readiness リクエストが成功し、クラスタ情報がローカルの独立 Server を示します。一つの言語の手順を終えるまで、そのまま実行してください。

## 3. 一つの言語を選ぶ {#choose-one-language}

三つの公式 SDK は同等に利用できます。選んだタブだけを表示するので、一つの手順に集中できます。

<Tabs groupId="quickstart-language" className="quickstart-language-tabs">
<TabItem value="php" label="PHP" default>

必要な環境：PHP 8.1 以降と Composer。この手順は、フレームワークに依存しない `durable-workflow/sdk` パッケージを使います。

1. **SDK をインストールします。**

<!-- docs-example id="quickstart.php.install" -->
```bash
mkdir durable-workflow-php-quickstart
cd durable-workflow-php-quickstart
composer require %%artifact.phpSdkComposerPackage%%
```

2. **Worker とクライアントを追加します。** 完全なソースを開き、二つのファイルを新しいプロジェクトへコピーします。

<details>
<summary>そのまま実行できる PHP の完全なソース</summary>

Worker は、専用のタスクキューにワークフロー型とアクティビティ型を一つずつ登録します。

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

#### クライアントと結果の読み取り {#client-and-result-reader}

クライアントは一意の名前のワークフローを開始し、選んだ実行の完了を待って、Server に保存された永続的な終端状態を読み取ります。

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

3. **Worker とクライアントを実行します。**

<!-- docs-example id="quickstart.php.run" -->
```bash
php worker.php > quickstart-worker.log 2>&1 &
export QUICKSTART_WORKER_PID=$!
trap 'kill "$QUICKSTART_WORKER_PID" 2>/dev/null || true' EXIT

php start.php

kill "$QUICKSTART_WORKER_PID" 2>/dev/null || true
trap - EXIT
```

**期待する結果：** `status=completed` と、`"greeting":"Hello, PHP!"` を含む結果です。Laravel を使わず、独立した PHP Worker を実行して、永続結果を確認できました。

次は [PHP SDK ガイド](/docs/polyglot/php/)へ進んでください。

</TabItem>
<TabItem value="python" label="Python">

必要な環境：Python 3.10 以降。このプログラムは Worker とクライアントを同じプロセスで動かしますが、公開 Worker API とコントロールプレーン API を通じて Server と通信します。

1. **SDK をインストールします。**

   共有マニフェストに記載された <PythonPackageReleaseLink authority="qualified">Python SDK の安定版</PythonPackageReleaseLink>を使います。マニフェストから生成する正確なバージョン指定により、この手順は文書化された安定版を使います。

<!-- docs-example id="quickstart.python.install" -->
```bash
mkdir durable-workflow-python-quickstart
cd durable-workflow-python-quickstart

python3 -m venv .venv
. .venv/bin/activate
pip install %%artifact.pythonPackagePin%%
```

2. **Worker とクライアントを作成して実行します。** 完全なプログラムを開いてください。最後のコマンドで実行します。

<details>
<summary>そのまま実行できる Python の完全なソース</summary>

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

**期待する結果：** `status=completed` と、`Hello, Python!` を含む結果です。最後の二つの SDK 呼び出しは、選んだ実行の結果と永続的な終端状態を Server から読み取ります。

次は [Python SDK ガイド](/docs/polyglot/python/)へ進んでください。

</TabItem>
<TabItem value="rust" label="Rust">

必要な環境：Rust 1.86 以降。この例は、同じ Tokio プロセスでネイティブ Worker とクライアントを動かします。

1. **SDK をインストールします。**

<!-- docs-example id="quickstart.rust.install" -->
```bash
cargo new durable-workflow-rust-quickstart
cd durable-workflow-rust-quickstart
%%artifact.rustCargoAddCommand%%
cargo add tokio --features macros,rt-multi-thread,time
```

2. **Worker とクライアントを作成して実行します。** 完全なプログラムを開いてください。最後のコマンドでコンパイルして実行します。

<details>
<summary>そのまま実行できる Rust の完全なソース</summary>

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

**期待する結果：** `status=completed` と、`"greeting":"Hello, Rust!"` を含む JSON の結果です。Worker が実行を終えるのを待ってから、選んだ実行の永続状態とデコードされた結果を読み取ります。

次は [Rust SDK ガイド](/docs/polyglot/rust/)へ進んでください。

</TabItem>
</Tabs>

## 4. ローカル Server を片付ける {#4-clean-up-the-local-server}

Cloud 利用者には、削除するローカル Server はありません。セルフホストの例を終えたら、次を実行します。

```bash
docker rm -f durable-workflow-server
docker volume rm durable-workflow-quickstart
```

## 別の経路：Laravel 組み込みモード {#separate-path-embedded-laravel}

Laravel 組み込みモードは、ワークフローの状態、キュー実行、設定、運用ツールを既存の Laravel インフラ内に置くための、公式 PHP デプロイモードです。`durable-workflow/workflow` をインストールします。独立した Server や `durable-workflow/sdk` は使いません。

公開済みパッケージで、新しい組み込みアプリを準備します。

```bash
composer create-project laravel/laravel durable-workflow-laravel-quickstart
cd durable-workflow-laravel-quickstart
composer require %%artifact.workflowComposerPackage%%
php artisan migrate
php artisan queue:work
```

同じ Laravel アプリ内に運用 UI を追加したい場合は、検証済みの Waterline 組み込み Composer パッケージを追加します。

```bash
composer require %%artifact.waterlineComposerPackage%%
php artisan waterline:install
```

この Composer パッケージは、組み込みモード用のインストール方法です。独立したセルフホスト Waterline サービスのインストール方法とは異なります。Laravel 組み込みモードでは、Server やサービスモード SDK は不要です。

[組み込みモードのインストール](/docs/installation/)で、`sync` 以外の Laravel キューを設定し、ワークフローを[定義](/docs/defining-workflows/workflows/)して[開始](/docs/defining-workflows/starting-workflows/)してください。[デプロイモード](/docs/polyglot/deployment-modes/)は、この経路とサービスモードを比較しています。

## 次のステップ {#next-steps}

- [機能一覧](/docs/capabilities/)で、選んだランタイムと SDK の対応範囲を確認します。
- サービスモードの [PHP SDK](/docs/polyglot/php/)、[Python SDK](/docs/polyglot/python/)、[Rust SDK](/docs/polyglot/rust/)を読みます。
- [クライアントと Worker の機能](/docs/polyglot/cli-python-parity/)で、ライフサイクル、メッセージ、スケジュール、可視性、Worker 実行を比較します。
- [Cloud マネージドランタイム](/docs/polyglot/cloud-control-plane/)または[セルフホスト Server](/docs/polyglot/server/)で運用します。シェルによる自動化が必要なら [CLI](/docs/polyglot/cli/)を追加します。
- [Worker の互換性とルーティング](/docs/polyglot/worker-compatibility-routing/)、[build-ID のロールアウト](/docs/polyglot/worker-build-id-rollout/)で、安全なサービス Worker のデプロイを計画します。

Laravel 組み込みモードのタイマー、シグナル、クエリ、アクティビティ、子ワークフローなどは、別の[組み込みドキュメント](/docs/category/embedded/)を参照してください。

リリース検証には専用のガイドがあります。[プラットフォーム適合性テスト](/docs/platform-conformance/)には、適合性検証に使う正確な製品マトリクス、公開ソースチェック、完全な実行記録、実時間の基準、片付け、機械可読のクイックスタート契約が含まれます。
