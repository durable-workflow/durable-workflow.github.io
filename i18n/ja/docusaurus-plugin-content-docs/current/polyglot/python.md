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
  - 非同期ワークフロークライアント
---

import ProductPromotion from '@site/src/components/ProductPromotion';
import PythonPackageReleaseLink from '@site/src/components/PythonPackageReleaseLink';

# Python SDK {#python-sdk}

Python SDK は、セルフホスト Durable Workflow Server または Durable Workflow Cloud 名前空間ランタイム向けの軽量な非同期優先クライアントです。Python プロセスはランタイムのコントロールプレーン API からワークフローの開始、観測、シグナル、キャンセルを行い、ワークフロータスクとアクティビティを実行する Worker として登録できます。

## ローカルの Sample App プレイグラウンドを試す {#try-the-local-sample-app-playground}

Cloud を使わず最短で記述を試すには、現在の [Sample App の `main` ブランチを GitHub Codespaces で開き](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main)、次を実行します。

<!-- docs-example id="sdk.python.sample-app-playground" -->
```bash
scripts/playground python
```

ローカルプレイグラウンドは呼び出し元が所有するワークフローとアクティビティのソースを生成し、現在の安定版成果物を選択し、公開された Server と Waterline を起動します。ID、ワークフロー型、アクティビティ型、タスクキューが生成した契約と一致する Worker 登録を待ってから、ワークフローを開始します。成功には期待した完了結果と履歴が必要です。その後、ターミナルは正確なローカル Waterline 実行リンクと構造化 JSON 証跡のパスを表示します。

Sample App を使わない利用者には、以下のパッケージインストール、インラインのクイックスタート、API リファレンス、リポジトリ例が直接の経路です。

<ProductPromotion source="docs-v2-python-sdk">
別々のロール別認証情報を使い、Cloud 管理の名前空間に対して Python クライアントと Worker を実行します。
</ProductPromotion>

SDK は PHP パッケージと同じ永続モデルを対象にします。インスタンス ID、実行 ID、履歴イベント、タスクキュー、型キーは言語間で共有されます。Python Worker は PHP で記述したワークフローのアクティビティを処理でき、その逆も可能です。

Python SDK、PHP SDK、Rust SDK、`dw` の機能比較は[クライアントと Worker の機能](/docs/polyglot/cli-python-parity/)を参照してください。

コンストラクターシグネチャ、戻り値の型、例外クラス、メトリクス名は、生成された [Python SDK API リファレンス](https://python.durable-workflow.com/)を参照してください。

Python SDK 2.5.0 はスティッキー実行向けに任意の上限付き履歴キャッシュを追加します。Server 2.5.10 以降を使い、各 Worker で有効にしてください。[ポータブル Worker アフィニティ](/docs/polyglot/portable-worker-affinity)と [Python ガイドおよび実行可能な例](https://python.durable-workflow.com/guides/sticky-execution/)を参照してください。

Cloud の利用者は、プロビジョニング済み名前空間のランタイム URL と名前空間を、別々のクライアントと Worker の認証情報で使います。接続境界は [Cloud 管理ランタイム](/docs/polyglot/cloud-control-plane)を参照してください。以下のクイックスタートはローカルのセルフホスト値を使います。

## 要件 {#requirements}

- Python 3.10 以降
- Docker（このクイックスタートのローカル Server 用）、既存の[セルフホスト Server](/docs/polyglot/server)、またはプロビジョニング済みの [Cloud 名前空間ランタイム](/docs/polyglot/cloud-control-plane)

## インストール {#installation}

<PythonPackageReleaseLink authority="qualified">安定版 Python SDK リリース</PythonPackageReleaseLink>をインストールします。正確な要件は Server クイックスタートと同じ組から生成され、ロックまたは制約ファイルに保持すると再現可能になります。

<!-- docs-example id="python.sdk.install" -->
```bash
pip install %%artifact.pythonPackagePin%%
```

SDK は HTTP に [httpx](https://www.python-httpx.org/)、唯一の公開 v2 ペイロードコーデックが使う Apache Avro ワイヤー形式のエンコードに `fastavro` Python パッケージへ依存します。Prometheus メトリクス対応は任意です。

## クイックスタート {#quickstart}

次は、アクティビティを1つ持つワークフローを定義し、ローカルの Durable Workflow Server に対して開始して結果を待つ完全な Python プログラムです。

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

### ローカル Server に対して実行する {#running-against-a-local-server}

上のプログラムは、ローカルの `dev-token` で `http://localhost:8080` に到達できる Durable Workflow Server を想定します。まだない場合、ソース不要の最短経路は公開 Server イメージです。

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

認証ドライバー、データベース設定、TLS など本番デプロイは [Server セットアップガイド](/docs/polyglot/server)を参照してください。

より大きな例として、SDK リポジトリは Python Worker で注文ワークフローを端から端まで実行する Docker Compose スタック [`examples/order_processing`](https://github.com/durable-workflow/sdk-python/tree/main/examples/order_processing)を含みます。

## クライアント API リファレンス {#client-api-reference}

非同期 `durable_workflow.Client` はコントロールプレーンと Worker プレーンの HTTP 呼び出しの公開入口です。基盤の `httpx.AsyncClient` 接続プールを適切に閉じるため、非同期コンテキストマネージャーとして使います。

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

### コンストラクター {#constructor}

| 引数 | 型 | 既定値 | 用途 |
| --- | --- | --- | --- |
| `base_url` | `str` | 必須 | `/api` を含まない Server のオリジン。 |
| `token` | `str \| None` | `None` | 1つの Bearer トークンで両プレーンの呼び出しを認可する場合。 |
| `control_token` | `str \| None` | `None` | コントロールプレーンと Worker ポーリングで別の Bearer トークンが必要な場合。 |
| `worker_token` | `str \| None` | `None` | Worker プレーンと運用呼び出しで別の Bearer トークンが必要な場合。 |
| `namespace` | `str` | `"default"` | `X-Namespace` で Server の名前空間を指定する。 |
| `timeout` | `float` | `60.0` | 既定の HTTP タイムアウトを上書きする。 |
| `retry_policy` | `TransportRetryPolicy \| None` | 既定のポリシー | 一時的な HTTP 失敗のトランスポート再試行を調整する。 |
| `metrics` | `MetricsRecorder \| None` | 何もしない | カスタム記録先へクライアントと Worker のメトリクスを出力する。 |
| `payload_size_limit_bytes` | `int` | SDK 既定値 | Server の最大ペイロードバイト数契約に合わせる。 |
| `payload_size_warning_threshold_percent` | `int` | SDK 既定値 | 設定した上限に達する前に警告する。 |
| `payload_size_warnings` | `bool` | `True` | テストや管理されたスクリプトでローカルのサイズ警告を無効にする。 |
| `failure_report_limit_bytes` | `int` | `1048576` | エンコード済みの障害レポート全体の上限を引き下げます。[障害レポートのサイズ制限](#bounded-failure-reports)を参照してください。 |

`token` が最も単純な選択肢です。`control_token` と `worker_token` の両方を設定すると、コントロールプレーンのメソッドは `control_token`、Worker プレーンのメソッドは `worker_token` を使います。

### 障害レポートのサイズ制限 {#bounded-failure-reports}

Python SDK **2.11.0** から、送信する障害レポートにサイズ制限が加わりました。既定値は、**メッセージが UTF-8 で 62 KiB**、**スタックが 128 KiB**、**シリアライズ後の任意の詳細と診断情報が合計 64 KiB**、**HTTPX でエンコードした本文全体が 1 MiB** です。本文の上限には、マーカー、JSON エスケープ、リースの識別情報、バッチ内のほかのコマンドも含まれます。設定または検出された転送上限がより小さい場合は、その値が優先されます。障害の型、クラス、コード、リトライポリシー、リースの識別情報は保持されます。

必要に応じて本文の上限を引き下げます。ペイロードサイズの警告設定は引き続き助言として扱われます。

```python
from durable_workflow import Client

async with Client(
    "https://workflow.example.com",
    worker_token="worker-token",
    control_token="operator-token",
    failure_report_limit_bytes=512 * 1024,
) as client:
    info = await client.get_cluster_info()
```

短縮されたフィールドには、見える切り詰めマーカーと元のバイト数が付けられます。Avro の詳細は全体を保持するか、全体を省略します。必須のエンベロープを表現できない場合は、HTTP 送信前に `FailureReportTooLarge` が発生します。ローカル障害はワークフローコードが参照する前に正規化されるため、初回実行とコールドリプレイは保存された同じメッセージを参照します。一度参照したローカルメッセージは、最終的なバッチサイズ調整でも変更されません。

### 外部ペイロードストレージ {#external-payload-storage}

通常の `Client` と `Worker` 操作は、Server の認証付きランタイム転送を自動で使います。SDK は `GET /api/cluster/info` で名前空間ポリシーと転送上限を検出し、しきい値を超える値やリクエストを収めるために必要な値をアップロードし、参照値を取得してからデコードします。ワークフローとアクティビティのコードはデコード済み値を受け取ります。プロバイダー認証情報は Server に残ります。リモート Worker に boto3、プロバイダークライアント、Server のローカルディレクトリへのアクセスは不要です。

ランタイム参照は `durable-workflow.v2.runtime-external-payload-reference.v1` スキーマと不透明な `reference_id` を持ち、プロバイダーの `uri` は含みません。アップロードと取得は通常のロール認証情報と名前空間を使い、サイズと SHA-256 を検証し、Worker 完了時のタスク試行とリースのフェンスを維持します。経路、上限、型付き拒否は [HTTP 契約](./server-api-reference.md#runtime-external-payload-transport)を参照してください。SDK の対応には利用可能な互換転送が必要であり、ドライバー設定だけでは足りません。

以下の**直接プロバイダーヘルパー**は、アプリケーションが所有するプロバイダーを意図的に使う保存処理やテスト用です。別の URI スキーマを使います。通常の Server、Cloud クライアントには不要です。Server はプロバイダーの `external_storage` エンベロープを HTTP `422`、`external_payload_unsupported` で拒否します。

| API | 役割 | 失敗サーフェス |
| --- | --- | --- |
| `ExternalStorageDriver` | `put(data, sha256=..., codec=...)`、`get(uri)`、`delete(uri)` のプロトコル。 | ドライバーが送出するストレージエラー。 |
| `LocalFilesystemExternalStorage` | ローカル開発・テスト用の依存なし `file://` ドライバー。 | 参照 URI が設定ルートの外へ出ると `ValueError`。 |
| `S3ExternalStorage` | boto3 互換クライアント用アダプター。 | 別バケット・プレフィックスへの参照やバイト列以外の応答で `ValueError`。 |
| `GCSExternalStorage` | google-cloud-storage 形式のクライアント用アダプター。 | 別バケット・プレフィックスへの参照やバイト列以外の応答で `ValueError`。 |
| `AzureBlobExternalStorage` | Azure コンテナクライアント用アダプター。 | 別コンテナ・プレフィックスへの参照やバイト列以外の応答で `ValueError`。 |
| `ExternalPayloadReference` | `uri`、`sha256`、`size_bytes`、`codec`、スキーマを持つ不変のワイヤー参照。 | `from_dict()` が未対応スキーマや不正フィールドを受け取ると `ValueError`。 |
| `ExternalPayloadCache` | 検証済みの外部ペイロードバイト列用の上限付きリプレイキャッシュ。 | コンストラクターは正でないエントリー数・バイト数上限を拒否する。 |
| `store_external_payload()` | エンコード済みバイト列をドライバーで保存し `ExternalPayloadReference` を返す。 | ドライバーエラー。 |
| `fetch_external_payload()` | 参照されたバイト列を取得し、デコード前にサイズと SHA-256 を検証する。 | サイズ・ハッシュ不一致で `ExternalPayloadIntegrityError`。 |
| `delete_external_payload()` | 参照オブジェクトを削除し、キャッシュエントリーも削除する。 | ドライバーが送出するストレージエラー。 |
| `external_storage_envelope()` | しきい値までは値をインラインにエンコードし、超えたらドライバーでバイト列を書き込む。 | 不正なしきい値や参照を解決できるドライバーがない場合は `ValueError`。 |
| `external_storage_driver_from_policy()` | 明示されたポリシーとアプリケーション所有のプロバイダークライアントから直接ドライバーを構築します。Server、Cloud 上の直接プロバイダーアクセスを許可しません。 | ポリシー無効、未対応、または必要なクライアント、バケット、コンテナーがない場合に `ValueError`。 |

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

直接ヘルパーの参照スキーマは `EXTERNAL_PAYLOAD_REFERENCE_SCHEMA`（`durable-workflow.v2.external-payload-reference.v1`）です。アダプターは `durable-workflow` にクラウド SDK の依存関係を追加しません。アプリケーションが設定済み S3、GCS、Azure クライアントを渡します。

プロバイダー参照のフィールドは次のとおりです。Server HTTP 経路が受け付けるランタイム参照ではありません。

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

`ExternalPayloadReference.from_dict()` は未知のスキーマや不正フィールドを拒否します。`fetch_external_payload()` はバイトを返す前に `size_bytes` と `sha256` を検証し、不一致なら `ExternalPayloadIntegrityError` を送出します。オブジェクト欠落時にはプロバイダードライバーのエラーが発生する場合もあります。`ExternalPayloadCache` は検証済みバイトだけに使ってください。キャッシュ破棄は Server 管理オブジェクトを削除する権限を与えません。`delete_external_payload()` はプロバイダーへの直接操作であり、ランタイム参照の清掃 API ではありません。

`external_storage_driver_from_policy()` は、アプリケーション所有のプロバイダーストレージを意図的に使い、必要なクライアントを所有するコードで使用します。ポリシーを読んでも、プロバイダーエンベロープが有効な Server リクエストにはなりません。クライアントはアプリケーションが所有します。任意のアダプターは boto3、google-cloud-storage、azure-storage-blob をランタイム依存に追加しません。

```python
from durable_workflow.external_storage import external_storage_driver_from_policy

namespace = await client.describe_namespace("billing")
driver = external_storage_driver_from_policy(
    namespace.external_payload_storage,
    s3_client=application_owned_s3_client,
)
```

ポリシー無効、未対応ドライバー、必要なクライアント欠落時にファクトリーは `ValueError` を送出します。無効なポリシーは空のドライバーを返しません。呼び出す前に `policy.enabled` を確認してください。

### 名前空間 {#namespaces}

名前空間はワークフロー、スケジュール、検索属性、外部ペイロードストレージのテナント境界です。Client はコンストラクター引数 `namespace=` で一度に1つの名前空間を対象にしますが、以下の運用サーフェスは Bearer トークンで認可された任意の名前空間に適用できます。

| メソッド | 戻り値 | 失敗サーフェス |
| --- | --- | --- |
| `await client.list_namespaces()` | `NamespaceList` | 認証・Server エラー。 |
| `await client.describe_namespace(name)` | `NamespaceDescription` | `NamespaceNotFound`、認証・Server エラー。 |
| `await client.create_namespace(name, description=None, retention_days=30)` | `NamespaceDescription` | 名前重複や不正な保持期間で `InvalidArgument`、認証・Server エラー。 |
| `await client.update_namespace(name, description=None, retention_days=None)` | `NamespaceDescription` | `NamespaceNotFound`、`InvalidArgument`、認証・Server エラー。指定フィールドだけ送る。 |
| `await client.set_namespace_external_storage(name, driver=..., enabled=True, threshold_bytes=None, config=None)` | `NamespaceDescription` | Server のポリシー検証に失敗すると `InvalidArgument`、認証・Server エラー。 |
| `await client.test_external_storage(driver=None, small_payload_bytes=None, large_payload_bytes=None)` | `StorageTestResult` | 対象ポリシーの必須フィールド不足で `InvalidArgument`、認証・Server エラー。 |

`set_namespace_external_storage` は `dw namespace:set-storage-driver` に対応します。最初の位置引数は名前空間の `name` で、`describe_namespace`、`create_namespace`、`update_namespace` と一致します。非推奨の別名 `namespace=` は `DeprecationWarning` を出します。新しいコードでは位置引数 `name` を使うべきです。`config` 辞書は、認証情報を Server に残すための `s3`、`gcs`、`azure` の任意の `disk` を含め、ドライバー固有キーを持ちます。返される `NamespaceDescription` は、呼び出し元が値を指定しなかったときのしきい値を含め、Server が実際に永続化したポリシーを反映します。

`test_external_storage` は `dw storage:test` に対応します。Server は対象の外部ストレージドライバーに小・大のペイロードを書いて読み戻し、`StorageTestResult` を返します。各ペイロードの `StoragePayloadTestResult` レコードに `wrote`、`read`、`verified`、`latency_ms`、`bytes` を公開します。

`NamespaceDescription` は[外部ペイロードストレージ](#external-payload-storage)で説明した `external_payload_storage` ポリシーを持ちます。通常のクライアントは検出したランタイム転送を自動で使います。直接ヘルパーにはアプリケーション所有のプロバイダーアクセスが必要です。ポリシーの説明を取得しても、プロバイダーエンベロープが有効な Server リクエストにはなりません。

### クラスターとタスクキュー {#cluster-and-task-queues}

| メソッド | 戻り値 | 補足 |
| --- | --- | --- |
| `await client.health()` | `dict[str, Any]` | 生存確認用のヘルスエンドポイントを呼ぶ。 |
| `await client.get_cluster_info()` | `dict[str, Any]` | Server バージョン、プロトコル、機能、互換性メタデータを読む。 |
| `await client.list_task_queues()` | `TaskQueueList` | 名前空間で可視のタスクキューを一覧する。 |
| `await client.describe_task_queue(name)` | `TaskQueueDescription` | Worker 容量、現在のリース、クエリ受け入れ、ディスパッチ上限の事実を返す。 |
| `await client.list_task_queue_build_ids(task_queue)` | `TaskQueueBuildIdRollout` | キューの build-id 別コホート状態を取得する。`build_id` が `None` のバージョンなしコホートも含む。 |
| `await client.drain_task_queue_build_id(task_queue, build_id)` | `TaskQueueBuildIdRolloutState` | コホートをドレイン中として新しいタスクのクレームを止める。バージョンなし Worker には `build_id=None` を渡す。冪等。 |
| `await client.resume_task_queue_build_id(task_queue, build_id)` | `TaskQueueBuildIdRolloutState` | 以前のドレインを戻して再びクレーム可能にする。バージョンなし Worker には `build_id=None` を渡す。冪等。 |

タスクキューの戻り値型は、ネストした `TaskQueueAdmission`、`TaskQueueTaskAdmission`、`TaskQueueQueryAdmission`、`TaskQueueBuildIdCohort`、`TaskQueueBuildIdRollout`、`TaskQueueBuildIdRolloutState` の dataclass を公開します。スクリプトは文章出力を解析せず Server 側容量と build-id ロールアウトを検査できます。全手順は [Worker Build-Id のロールアウト](/docs/polyglot/worker-build-id-rollout)を参照してください。対応する CLI は `dw task-queue:build-ids`、`dw task-queue:drain`、`dw task-queue:resume` です。

### ワークフロー操作 {#workflow-operations}

| メソッド | 戻り値 | 失敗サーフェス |
| --- | --- | --- |
| `await client.start_workflow(...)` | `WorkflowHandle` | `WorkflowAlreadyStarted`、`InvalidArgument`、`Unauthorized`、`ServerError` |
| `await client.describe_workflow(workflow_id)` | `WorkflowExecution` | `WorkflowNotFound`、認証・Server エラー |
| `await client.list_workflows(...)` | `WorkflowList` | 認証・Server エラー |
| `await client.list_workflow_runs(workflow_id)` | `WorkflowRunList` | `WorkflowNotFound`、認証・Server エラー |
| `await client.describe_workflow_run(workflow_id, run_id)` | `WorkflowRun` | `WorkflowNotFound`、認証・Server エラー |
| `await client.get_history(workflow_id, run_id)` | デコード済み履歴ペイロード | `WorkflowNotFound`、認証・Server エラー |
| `await client.export_history(workflow_id, run_id)` | デコード済みアーカイブ履歴ペイロード | `WorkflowNotFound`、認証・Server エラー |
| `await client.signal_workflow(workflow_id, signal_name, args=None)` | `None` | `WorkflowNotFound`、`InvalidArgument`、認証・Server エラー |
| `await client.query_workflow(workflow_id, query_name, args=None)` | デコード済みクエリ結果 | `QueryFailed`、`WorkflowNotFound`、認証・Server エラー |
| `await client.update_workflow(workflow_id, update_name, args=None, ...)` | デコード済み更新結果 | `UpdateRejected`、`WorkflowNotFound`、認証・Server エラー |
| `await client.cancel_workflow(workflow_id, reason=None)` | `None` | `WorkflowNotFound`、認証・Server エラー |
| `await client.terminate_workflow(workflow_id, reason=None)` | `None` | `WorkflowNotFound`、認証・Server エラー |
| `await client.repair_workflow(workflow_id)` | `WorkflowCommandResult` | `WorkflowNotFound`、認証・Server エラー |
| `await client.archive_workflow(workflow_id, reason=None)` | `WorkflowCommandResult` | `WorkflowNotFound`、認証・Server エラー |
| `await client.get_result(handle, poll_interval=0.5, timeout=30.0)` | デコード済みワークフロー出力 | `WorkflowFailed`、`WorkflowCancelled`、`WorkflowTerminated`、`TimeoutError` |

`start_workflow` は `workflow_type`、`task_queue`、任意の `workflow_id`、`input`、`duplicate_policy`、`memo`、`search_attributes`、`business_key`、`execution_timeout_seconds`、`run_timeout_seconds` を受け入れます。呼び出し元のすべてのペイロードは HTTP 境界を越える前に Avro エンベロープ化します。

スクリプトがワークフロー ID を知っていてハンドル形式のメソッドを使いたい場合、`client.get_workflow_handle(workflow_id, run_id=None, workflow_type="")` を使います。

| `WorkflowHandle` メソッド | 同等のクライアントメソッド |
| --- | --- |
| `await handle.result(...)` | `client.get_result(handle, ...)` |
| `await handle.describe()` | `client.describe_workflow(handle.workflow_id)` |
| `await handle.signal(name, args=None)` | `client.signal_workflow(...)` |
| `await handle.query(name, args=None)` | `client.query_workflow(...)` |
| `await handle.update(name, args=None, ...)` | `client.update_workflow(...)` |
| `await handle.cancel(reason=None)` | `client.cancel_workflow(...)` |
| `await handle.terminate(reason=None)` | `client.terminate_workflow(...)` |

両操作は異なる終了結果で Server 実行を即時に閉じます。`cancel_workflow` はワークフローコードへ協調要求を届けず、Saga や finally のクリーンアップを実行しません。時間を制限したクリーンアップには、協調する Worker と `request_cancellation()` を使います。操作ポリシー、監督、復旧は[協調キャンセルガイド](/docs/polyglot/cancellation)を参照してください。

### 現在のワークフローの識別情報 {#workflow-identity}

Python SDK 2.9.0 以降では、ワークフローコードから読み取り専用の
`ctx.workflow_id` と `ctx.run_id` を取得できます。どちらも現在のタスクに含まれる
文字列で、リプレイ中も同じ値です。continue-as-new 後もワークフロー ID は変わらず、
後続の実行には新しい実行 ID が割り当てられます。引数として渡された前の実行の ID で
置き換えないでください。

```python
from durable_workflow import workflow

@workflow.defn(name="identity")
class IdentityWorkflow:
    def run(self, ctx):
        identity = {"workflow_id": ctx.workflow_id, "run_id": ctx.run_id}
        yield ctx.schedule_activity("record_identity", [identity])
        return identity
```

これらのプロパティは HTTP リクエストを送らず、ローカルのタスク識別情報を読みます。
ワークフローコードの外で状態をポーリングするには
`await client.describe_workflow(workflow_id)` を使います。登録済みクエリハンドラーが
公開する状態には `await client.query_workflow(workflow_id, query_name)` を使います。
識別情報のプロパティは、これらの操作の代わりにはなりません。

### スケジュール {#schedules}

スケジュールは、カレンダー・間隔規則に `ScheduleSpec`、発火時に出すワークフロー開始要求に `ScheduleAction` を使います。

| メソッド | 戻り値 | 補足 |
| --- | --- | --- |
| `await client.create_schedule(...)` | `ScheduleHandle` | スケジュールを作成してハンドルを返す。 |
| `await client.list_schedules()` | `ScheduleList` | 可視のスケジュールを一覧する。 |
| `await client.describe_schedule(schedule_id)` | `ScheduleDescription` | 状態、アクション、次回発火、カウンターを読む。 |
| `await client.update_schedule(schedule_id, ...)` | `None` | 仕様、アクション、重複ポリシー、ジッター、memo、検索属性、注記を更新する。 |
| `await client.pause_schedule(schedule_id, note=None)` | `None` | 今後の発火を一時停止する。 |
| `await client.resume_schedule(schedule_id, note=None)` | `None` | 一時停止したスケジュールを再開する。 |
| `await client.trigger_schedule(schedule_id, overlap_policy=None)` | `ScheduleTriggerResult` | 即時発火を要求する。 |
| `await client.backfill_schedule(schedule_id, start_time=..., end_time=..., overlap_policy=None)` | `ScheduleBackfillResult` | 逃した発火時間帯を再実行する。 |
| `await client.get_schedule_history(schedule_id, *, limit=None, after_sequence=None)` | `ScheduleHistoryPage` | `sequence` 昇順の監査履歴ストリームを1ページ返す。`limit` は Server 側で1〜500（既定100）に制限。`after_sequence` は前ページの `next_cursor` から得る非負カーソル。未知の ID には `ScheduleNotFound`。削除理由を監査できるよう履歴は `delete_schedule` 後も残る。 |
| `client.iter_schedule_history(schedule_id, *, limit=None, after_sequence=None)` | `AsyncIterator[ScheduleHistoryEvent]` | Server が `has_more=False` と報告するまで内部でページングし、すべての監査イベントを yield する。失敗は `get_schedule_history` と同じ。 |
| `await client.delete_schedule(schedule_id)` | `None` | スケジュールを削除する。 |

`client.get_schedule_handle(schedule_id)` は、対応するクライアントメソッドへ転送する `describe`、`update`、`pause`、`resume`、`trigger`、`backfill`、`history`、`iter_history`、`delete` を持つ `ScheduleHandle` を返します。`ScheduleHandle.history(...)` は `ScheduleHistoryPage`、`ScheduleHandle.iter_history(...)` は `AsyncIterator[ScheduleHistoryEvent]` を返します。

`ScheduleHistoryPage` は順序付きの `events` リスト、`has_more` フラグ、整数 `next_cursor`（最終ページは `None`）、`schedule_id`、所有する `namespace` を持ちます。各 `ScheduleHistoryEvent` は `sequence`、`event_type`（`ScheduleCreated`、`SchedulePaused`、`ScheduleResumed`、`ScheduleUpdated`、`ScheduleTriggered`、`ScheduleTriggerSkipped`、`ScheduleDeleted`）、`recorded_at`、発火したワークフローの任意の `workflow_instance_id` と `workflow_run_id`、コントロールプレーンが遷移に記録した生の `payload` 辞書を持ちます。

### ブリッジイベントと Worker プレーンのメソッド {#bridge-events-and-worker-plane-methods}

`await client.send_webhook_bridge_event(adapter, action=..., target=..., input=..., idempotency_key=..., correlation=None)` は、`dw bridge:webhook` と同じ機械可読結果契約 `BridgeAdapterOutcome` を返します。Webhook 形式のシステムからの範囲を制限した入口となる Python のエントリーポイントです。

低レベルの Worker プレーンメソッドはカスタム Worker とプロトコルテスト向けに公開しますが、通常のアプリケーションは `Worker` を使うべきです。

| メソッド群 | メソッド |
| --- | --- |
| Worker 登録 | `register_worker` |
| ワークフロータスク | `poll_workflow_task`, `complete_workflow_task`, `fail_workflow_task`, `workflow_task_history` |
| クエリタスク | `poll_query_task`, `complete_query_task`, `fail_query_task` |
| アクティビティタスク | `poll_activity_task`, `complete_activity_task`, `fail_activity_task`, `heartbeat_activity_task` |

これらは `X-Durable-Workflow-Protocol-Version` を送り、設定されていれば `worker_token` を使います。SDK アダプターやプロトコル適合性テストを書いていない限り、高レベルの `Worker` を優先してください。

`workflow_task_history(...)` は、リース済みの1ワークフロータスクのリプレイ履歴をページングします。`poll_workflow_task(...)` が `next_history_page_token` を返した後にだけ呼びます。

```python
page = await client.workflow_task_history(
    task_id="workflow-task-01",
    next_history_page_token="history-page-2",
    lease_owner="python-worker-1",
    workflow_task_attempt=2,
)
```

リクエスト本文は `next_history_page_token`、`lease_owner`、`workflow_task_attempt` を使います。デコードしたレスポンスは Worker プロトコルのフィールド名 `history_events`、`total_history_events`、`next_history_page_token` を使い、コントロールプレーン実行履歴の `events` や `next_page_token` は使いません。

### Worker {#workers}

Worker レジストリは、Server が最近観測した Worker と各 Worker が実行できる処理を公開します。運用スクリプトで build-id ロールアウトを進め、登録解除する古い Worker を探し、Worker 群の容量を照合するために使います。

| メソッド | 戻り値 | 失敗サーフェス |
| --- | --- | --- |
| `await client.list_workers(task_queue=None, status=None)` | `WorkerList` | 認証・Server エラー。 |
| `await client.describe_worker(worker_id)` | `WorkerDescription` | `WorkerNotFound`、認証・Server エラー。 |
| `await client.deregister_worker(worker_id)` | `dict[str, Any]` | `WorkerNotFound`、認証・Server エラー。 |

`list_workers` は Server 側でフィルタリングします。1キューに絞るには `task_queue`、Server が認識する単一の状態文字列には `status` を渡します。既定は名前空間の全登録 Worker を返します。

`WorkerDescription` はランタイム、SDK バージョン、ビルド ID、宣言したワークフロー型・アクティビティ型、最終ハートビート、現在のタスク受け入れ状態を持ち、スクリプトはドレインするコホートや一覧から削除する Worker を判断できます。

`deregister_worker` は Server 側で冪等です。ハートビートしなくなった Worker を削除し、容量計算と `list_workers` を正確に保ちます。進行中のリースは中断しません。

### 検索属性 {#search-attributes}

検索属性は、フィルタリングとインデックス作成のためにワークフロー実行に現れる、型付きの名前空間メタデータです。Python クライアントは CLI と同じコントロールプレーンサーフェスを提供します。

| メソッド | 戻り値 | 失敗サーフェス |
| --- | --- | --- |
| `await client.list_search_attributes()` | `SearchAttributeList` | 認証・Server エラー。 |
| `await client.create_search_attribute(name, attribute_type)` | `dict[str, Any]` | 名前重複や未対応型で `InvalidArgument`、認証・Server エラー。 |
| `await client.delete_search_attribute(name)` | `dict[str, Any]` | `SearchAttributeNotFound`、システム定義属性には `InvalidArgument`、認証・Server エラー。 |

`SearchAttributeList` は `system` と `custom` の属性定義を分けます。運用スクリプトは、ワークフロー ID、状態、型、開始時刻などエンジン定義キーの存在を確認し、衝突するカスタムキーの作成を拒否できます。対応する `attribute_type` 値は `keyword`、`text`、`int`、`double`、`bool`、`datetime`、`keyword_list` です。

### システム保守 {#system-maintenance}

運用スクリプトとオンコール自動化は、Client から `dw system:*` と同じ保守ループを動かせます。各メソッドには admin スコープの Bearer トークンが必要で、なければ Server は `Unauthorized` を返します。

| メソッド | 戻り値 | 対応 CLI |
| --- | --- | --- |
| `await client.repair_status()` | `dict[str, Any]` | `dw system:repair-status` |
| `await client.repair_pass(run_ids=None, instance_id=None)` | `dict[str, Any]` | `dw system:repair-pass` |
| `await client.retention_status()` | `dict[str, Any]` | `dw system:retention-status` |
| `await client.retention_pass(run_ids=None, limit=None)` | `dict[str, Any]` | `dw system:retention-pass` |
| `await client.activity_timeout_status()` | `dict[str, Any]` | `dw system:activity-timeout-status` |
| `await client.activity_timeout_pass(execution_ids=None, limit=None)` | `dict[str, Any]` | `dw system:activity-timeout-pass` |

`repair_pass` はタスク修復走査を1回実行します。フィルターがなければ名前空間全体を対象にします。`run_ids` で特定のワークフロー実行リストへ絞り、`instance_id` で単一の稼働中インスタンスに制限します。

`run_ids` がなければ、`retention_pass` は現在の名前空間ポリシーで期限切れの終了済み実行を走査上限まで削除するよう PHP Server に要求します。明示的な `run_ids` は閉じた実行を直接対象にし、その経過時間走査を回避するため、保持期間より新しい履歴も削除できます。永久保持とアーカイブ済み実行の保護は引き続き適用されます。対応する `retention_status()` は、履歴を削除せず現在のポリシー、基準時刻、上限付きの適格一覧を報告します。ポリシーの短縮や明示対象の送信前に、[保持手順](./server.md#retention)を確認してください。

`activity_timeout_pass` は、期限を過ぎたアクティビティ実行の start-to-close と schedule-to-close 期限を強制します。フィルターがなければ走査上限まで期限切れ実行を処理します。`execution_ids` で特定リスト、`limit` で1回の処理数を制限します。

これらは処理対象が空でも例外を出しません。静かな期間に繰り返し呼ぶと、同じ `passes` / `repaired` / `pruned` カウンターを差分ゼロで返すため、cron による運用スクリプトから安全に呼び出せます。

## ワークフローの定義 {#defining-workflows}

ワークフローは `@workflow.defn` でデコレートした Python クラスです。`run` メソッドは通常の同期関数、または永続コマンドを Server に yield する同期ジェネレーターです。永続的な処理が必要な場合はジェネレーター形式を使います。`async def run` はサポートされません。

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

`@workflow.defn(name="...")` の `name` は言語間で使う型キーです。Python のモジュールパスやクラス参照ではなく、単なる文字列でなければなりません。

### シグナル、クエリ、更新 {#signals-queries-and-updates}

シグナルは永続履歴に記録し、ワークフローリプレイ時に Python ハンドラーへディスパッチします。

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

待機するのはアクティビティではなくワークフローです。述語はリプレイで再構築されたシグナルハンドラーの状態を読みます。承認を待つ間、ワーカーがアクティビティのスロットを占有することはありません。条件のタイムアウトは、ワークフローの有限な run と実行全体の期限とは別です。外部ジョブの完了には、送信してすぐ戻る短いアクティビティと[対応付けられたコールバック](./polling-patterns.md#callback-and-signal-completion)を使用します。

クエリと更新の受信デコレーターにより、ワークフロークラスは安定したハンドラー名を公開できます。Python Worker は、コミット済みワークフロー履歴をリプレイし、再現した状態に対して登録済みクエリハンドラーを呼んで、Server からルーティングされたクエリタスクを実行します。ワークフロータスクで届いた受理済み更新も適用します。

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

Python Worker は Server へクエリタスク結果を返して、ルーティングされたクエリを完了します。宣言済み更新バリデーターの場合は、代わりに専用検証タスクを受け取り、正本のワークフロー状態をリプレイし、バリデーターだけを呼びます。検証に成功するまで、Server は受理済み更新を記録せず、更新ハンドラーもディスパッチしません。バリデーターを持つ Worker は、ディスカバリーが同期事前受理契約を広告しない限り登録を拒否します。拒否、互換 Worker の欠落や不一致、Worker 喪失、タイムアウト、フェンシングされた重複・古い完了は、明示的な型付き結果になります。PHP と Rust は現在更新バリデーター記述 API を公開せず、同等対応を主張するのではなく、その不在をワークフロー契約で広告します。

### ハンドラーのライフサイクル {#handler-lifecycle}

**公開済みの検証機能です。** Python SDK 2.6.2 で以下のハンドラー検査が導入されました。Server がルーティングする非同期クエリと更新バリデーターは引き続きサポートされます。修正された範囲は [SDK #177](https://github.com/durable-workflow/sdk-python/issues/177#issuecomment-6296781770) を参照してください。

リプレイのたびに、`run()` の実行前に新しいワークフローインスタンスが作られます。ワークフロー開始時にすでに記録されているシグナルは、`run()` が最初の `yield` に達した後に適用されます。そのため、コンストラクターと `yield` 前の初期化が先に実行されます。シグナルと更新のハンドラーは、このリプレイ済み状態を変更します。クエリは永続状態を変更せずに調べ、更新バリデーターは受付前に、検証後に破棄されるリプレイ済み状態を調べます。永続的なアクティビティ、タイマー、子ワークフローのコマンドは、ハンドラーではなく `run()` に置いてください。

| ハンドラー | サポートされる形式と失敗時の結果 |
| --- | --- |
| `@workflow.signal` | 同期関数。リプレイ中にシグナルを適用して例外が発生すると、ワークフロー実行が失敗します。 |
| `@workflow.update` | 同期関数。ハンドラーの例外は、その更新を失敗させます。 |
| `@workflow.update_validator` または `@update_method.validator` | Worker 配下の同期関数または `async def`。例外は受付前に更新を拒否します。 |
| `@workflow.query` | Worker 配下の同期関数または `async def`。ハンドラーの例外はクエリを失敗させ、ワークフロー実行は失敗させません。 |

検証は、シグナルと更新のコルーチン関数を拒否します。また、クエリとバリデーターを含む**すべて**のデコレート済みハンドラーについて、ジェネレーター関数と非同期ジェネレーター関数を拒否します。定義時、登録時、リプレイ時に `InvalidWorkflowDefinition` を発生させ、継承したハンドラーやオフラインツールも対象となります。シグナルと更新の同期ラッパーが非同期の値を返して検査を回避することはできません。どの種類のハンドラーでも、ジェネレーターや非同期ジェネレーターの値を返すと拒否されます。これらの制約は、`run()` で使う同期ジェネレーターを禁止するものではありません。

Server がルーティングするクエリでは、Worker は元のクエリ期限とタスク取得・キャンセル権限の下で、非同期結果を明示的に await します。待機しても新しい予算は与えられず、権限を失った後の結果送信も許可されません。受付前の検証でも、Worker は検証後に破棄されるリプレイ済み状態に対する非同期バリデーターの結果を await します。

ローカルの同期ヘルパーは await できません。`workflow.query_state()` は非同期結果を `QueryFailed` で拒否し、`workflow.validate_update()` は `UpdateRejected` で拒否します。返されたコルーチンは操作結果として流出させずに閉じます。

### ワークフローコンテキスト {#workflow-context}

`run` へ渡す `WorkflowContext` は決定的な操作を提供します。

| メソッド | 説明 |
|--------|-------------|
| `ctx.schedule_activity(type, args)` | アクティビティタスクをスケジュールする。呼び出しごとの再試行・タイムアウト設定は任意 |
| `ctx.start_timer(seconds)` | 永続的なスリープ |
| `ctx.start_child_workflow(type, args)` | 子ワークフローを開始する。呼び出しごとの再試行・ワークフロータイムアウト設定は任意 |
| `yield [command, [...]]` | ネストした決定的なアクティビティ、子ワークフロー、タイマー、混合グループを入力順で合流する |
| `yield ctx.select({key: command, ...})` | すべての非勝者ハンドルを保持し、最初に永続コミットされたメンバーで再開する |
| `ctx.saga()` | 逆順の永続アクティビティ補償を登録して実行する |
| `ctx.side_effect(fn)` | 非決定的な値を記録する |
| `ctx.get_version(change_id, min, max)` | 安全なワークフローコードのバージョニング |
| `ctx.upsert_search_attributes(attrs)` | 検索属性を更新する |
| `ctx.continue_as_new(*args)` | 新しい入力でワークフローを再開する |
| `ctx.now()` | 永続化されたワークフロー開始時刻。この実行中は固定 |
| `ctx.random()` | シード付き乱数生成器 |
| `ctx.uuid4()` | 決定的な UUID |
| `ctx.logger` | リプレイ中は出力しないロガー |

### エントリの互換性と復旧 {#entry-compatibility-and-recovery}

**公開済みのサポートです。** Python SDK 2.6.2 で以下のエントリ保護が導入され、Server 2.9.9 でルーティングと復旧がサポートされました。これらは機能の最小対応バージョンです。セキュリティ修正を含む最新の安定版をインストールしてください。

Worker は `run(ctx, *start_input)` を呼ぶ前に、記録済み引数をエントリシグネチャに束縛します。必須引数の不足や引数の個数の不整合は、本体が動く前に `WorkflowEntryArgumentsMismatchError` と理由 `workflow_entry_arguments_mismatch` を発生させます。既定値は省略された引数だけを補います。Python の型注釈は引き続き強制されません。注釈の変更だけで記録済みデータが検証・変換されることはありません。通常の本体でもジェネレーター本体でも、進入に成功した後の `TypeError` はアプリケーションの失敗です。

Worker は `workflow_entry_arguments_validation` を自動的に通知します。検証済みの Server と組み合わせると、失敗したタスクのリプレイがブロックされ、元の実行は非終端のままです。古いランタイムはそのタスクを再試行する場合があり、SDK 側の拒否だけでは復旧契約全体は成立しません。

`await client.describe_workflow_run(workflow_id, run_id)` と実行指定のデバッグエンドポイントで、正確な対象実行を確認します。互換性のあるエントリメソッドに戻してから、[復旧手順](../failures-and-recovery.md#service-entry-recovery)の実行指定 HTTP 修復ルートを使ってください。一方、`await client.repair_workflow(workflow_id)` と `handle.repair()` はインスタンスの現在の実行を解決し、どちらも実行 ID の引数を受け付けません。元の入力、履歴、名前空間、キュー、ビルド、期限を維持します。コマンドを変更する場合は、その互換メソッド内に `ctx.get_version` を配置し、[定義ルーティング](./worker-compatibility-routing.md#definition-fingerprint-evolution)を使ってコールドリプレイを検証してください。

### ワークフロー時刻と永続的な待機 {#workflow-time-and-durable-waits}

Worker でのリプレイ中、`ctx.now()` は実行の**永続化された開始時刻**を返します。
アクティビティ、タイマー、シグナルなどの永続的なステップが終わっても進みません。
同じ履歴をコールドリプレイすると、常に同じ開始値が返ります。
continue-as-new の後続実行には独自の開始時刻があり、前の実行の時計の基準を引き継ぎません。

[公開済みの Python 実装](https://github.com/durable-workflow/sdk-python/blob/150c6f6bc14e3516f75cc615b2f75f093ed84ea1/src/durable_workflow/workflow.py#L2594-L2601)
は、`WorkflowStarted.payload.timestamp` があればそれを使い、なければ正規の
`WorkflowStarted.recorded_at` を使います。永続化されたリプレイ時刻が存在しない場合や
無効な場合は明示的な時計エラーになります。Worker の実時間時計を読む許可にはなりません。
これは [SDK #146](https://github.com/durable-workflow/sdk-python/issues/146) で合意した、
開始時刻を固定する契約です。

`ctx.now()` が変わるまでループするのではなく、永続的な操作を待ちます。

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

タイマーの永続的な完了によってワークフローが再開します。返される2つの時刻は
同じ開始時刻です。`while ctx.now() < deadline` のようなループは、
タイマーが発火しただけでは条件が偽になりません。

相対的な遅延には `yield ctx.start_timer(seconds)` または `yield ctx.sleep(seconds)`
を使います。作業と永続タイマーを競合させる場合は、
[最初の完了の選択](#first-completion-selection)を使います。Worker の停止中も
Server にワークフローの期限を強制させる場合は、`client.start_workflow(...)` の
`execution_timeout_seconds` と `run_timeout_seconds` を設定します。
HTTP や `get_result()` の待機タイムアウトが制限するのは、そのローカルリクエストだけです。
ワークフローの永続化された期限の代わりにはなりません。アプリケーションの期限を
continue-as-new に引き継ぐ必要がある場合は、Server の元の実行期限を置き換えずに、
入力として明示的に渡します。

1回のアクティビティ呼び出し内で実際の経過時間を測定するには、その中で単調時計を読み、
所要時間をアクティビティ結果として返します。外部の UTC 期限については、
アクティビティで権威ある外部時計を確認し、その判断を返します。
ワークフローは記録済みの結果をリプレイします。UTC タイムスタンプと単調時計の値を比較したり、
異なるプロセスやホストの単調時計の値を引き算したりしないでください。
Python で `ctx.now()` 同士を引いても、実処理時間や実時間での経過時間にはなりません。

#### SDK 間の時計の違い {#clock-differences-across-sdks}

これらの API は、提供されている場合には決定的ですが、共通の時計ではありません。

| 記述インターフェース | 繰り返し呼び出しと永続的なステップ | continue-as-new の後続実行 |
| --- | --- | --- |
| Python `ctx.now()` | タイマーやアクティビティの後も、この実行の永続化された開始時刻に固定されます。 | 後続実行の開始時刻を基準にします。 |
| 組み込み PHP `Workflow::now()` | 実行の開始時刻から始まり、リプレイが消費したイベントの記録時刻へ進みます。[ワークフロー時刻](../features/timers.md#reading-deterministic-time)を参照してください。 | 新しい実行から始まり、その実行で消費したイベントに沿って進みます。 |
| サービスモードの PHP SDK | 汎用の公開ワークフローヘルパー `now()` はありません。永続的な操作か、記録済みのアクティビティ／副作用の値を使います。 | 引き継ぎ後も必要なアプリケーションの時刻状態は、明示的に渡します。 |
| サービスモードの Rust SDK | 汎用の公開ヘルパー `WorkflowContext::now()` はありません。`side_effect` で小さな実時間時計のスナップショットを記録できますが、進む時計ではありません。 | 新しい実行の副作用は新しい操作です。以前の時刻状態が必要なら明示的に渡します。 |

組み込み PHP の動作は
[公開済み Core](https://github.com/durable-workflow/workflow/blob/64efa176e4c37e5d6ae80e767ba3b41464024e53/src/V2/Support/WorkflowFiberContext.php)
にあります。別の [PHP SDK コンテキスト](https://github.com/durable-workflow/sdk-php/blob/2.5.2/src/Worker/WorkflowContext.php)
と [Rust SDK コンテキスト](https://github.com/durable-workflow/sdk-rust/blob/3.5.5/src/lib.rs)
には独自の API があります。すべての SDK で時計ヘルパーの意味が同じだと仮定せず、
永続的な操作と期限ポリシーを移植してください。

#### 発行イベントをシーケンス値で順序付けする {#order-emitted-events-with-sequence-values}

ワークフローのタイムスタンプはイベントの順序キーではありません。
`ctx.now()` を付けた Python イベントは、すべて同じ時刻になり得ます。
[Workflow Streams のオフセット](./workflow-streams.md)、対応する
[組み込み送信ボックスのシーケンス](../features/message-streams.md)、または決定的な
ワークフローローカルのカウンターを使います。実行ローカルのカウンターには `run_id`
を組み合わせます。アプリケーションが1つの論理シーケンスを必要とする場合は、
continue-as-new で明示的に引き継ぎます。独立したストリームや実行のタイムスタンプから、
全体的な順序が得られるわけではありません。


### アクティビティの再試行とタイムアウト {#activity-retries-and-timeouts}

アクティビティ呼び出しに、既定の単一試行とは異なる再試行上限や期限が必要な場合、`ctx.schedule_activity(...)` の `ActivityRetryPolicy` とタイムアウトのキーワード引数を使います。

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

`start_to_close_timeout` は Worker 開始後の1試行を制限します。`schedule_to_close_timeout` は全試行を通じたアクティビティ実行全体を制限します。`heartbeat_timeout` では、長時間のアクティビティが間隔の経過前に `activity.context().heartbeat(...)` を呼ぶ必要があります。再試行ポリシーはスケジュール時に永続アクティビティ実行へ固定されるため、後のデプロイで進行中の試行は変わりません。

`ctx.schedule_activity(..., queue="payments-v2")` は、新しくスケジュールするアクティビティ実行のキューを選択します。記録済みのアクティビティ、その再試行、修復されたタスクは元のキューを保持します。`Worker.task_queue` を変更しても、これらのタスクや既存実行のワークフローキューは移動しません。すべての依存関係を把握するまで、互換性のある古いプールを維持してください。[記録済みのアクティビティキュー](./task-matching-dispatch.md#recorded-activity-queues)を参照してください。

### 決定性の規則 {#determinism-rules}

ワークフローコードは履歴からリプレイされます。非決定的な操作を直接行ってはいけません。

- I/O（HTTP 呼び出し、ファイル読み取り、データベースクエリ）を行わない
- `datetime.now()` や `time.time()` は使わず、`ctx.now()` は実行開始の固定基準にだけ使います。待機には永続タイマーを使います。
- `random.random()` の代わりに `ctx.random()` を使う
- `uuid.uuid4()` の代わりに `ctx.uuid4()` を使う

非決定的な処理はすべてコンテキスト経由にするか、`ctx.side_effect()` で記録する必要があります。

### ファンアウト {#fan-out}

並行実行するにはコマンドのリストを yield します。

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

Worker は永続的な末端操作ごとに通常のコマンドを1つ出し、共有の安定した `parallel_group_*` フィールドと外側から内側への完全なパスを付けます。履歴は任意の順序でメンバーを閉じられますが、リプレイは永続的な入力位置によって結果と失敗を対応付けます。完全に重複した終了配信は無視します。Worker 再起動後の保留履歴と完全な完了履歴は、完了した処理を再スケジュールせず同じグループを再構築します。

### 最初の完了の選択 {#first-completion-selection}

独立した処理をまとめて開始し、1メンバーの完了でワークフローを進めたい場合、`ctx.select()` を使います。

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

`SelectionResult` は、勝者の安定したキー、入力インデックス、操作種別と永続 ID、型付き結果、すべての `DurableOperationHandle` を含みます。後で非勝者を待つには `yield handle.await_result()`、明示的な void 要求を記録するには `yield handle.cancel()` を使います。キャンセルが勝ったことを証明するのはコミット済み `SelectionOperationCancelled` 履歴だけです。リプレイは印のない要求を越えて進み、先にコミットした完了を `await_result()` が引き続き返します。後の履歴で別の完了が先に現れても、リプレイは保存済みの勝者を消費します。外部配信の重複や順序の入れ替わりがコミット済み勝者を置き換えることはありません。

### Saga 補償 {#saga-compensation}

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

Saga は失敗後、登録の逆順で通常のアクティビティコマンドを順番に実行します。即時終了の `cancel_workflow` は補償のためにワークフローを再開しません。ヘルパーは最初の補償失敗で止まります。`SagaCompensationFailed` は開始原因の失敗、補償の失敗、補償アクティビティ型、決定的な登録順序を構造化診断として保持します。

### 子ワークフロー {#child-workflows}

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

`execution_timeout_seconds` は再試行と continue-as-new 実行を含む論理的な子ワークフロー実行全体を制限します。`run_timeout_seconds` は子の各実行試行を制限します。子の実行が失敗すると再試行バックオフを適用します。不正な子開始コマンドはプロトコルエラーであり、子の試行として再試行しません。

### Continue-as-New {#continue-as-new}

長時間のワークフローでは continue-as-new を使って履歴をリセットします。

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

## アクティビティの定義 {#defining-activities}

アクティビティは `@activity.defn` でデコレートした非同期 Python 関数です。ワークフローとは異なり、I/O を自由に実行できます。

```python
from durable_workflow import activity

@activity.defn(name="send_email")
async def send_email(to: str, subject: str, body: str) -> dict:
    # Activities can do I/O: HTTP calls, database queries, etc.
    response = await some_email_client.send(to=to, subject=subject, body=body)
    return {"message_id": response.id, "sent": True}
```

`name` は言語間で共有する型キーです。PHP ワークフローが `"send_email"` という名前のアクティビティをスケジュールすると Python Worker が取得でき、その逆も可能です。

### アクティビティコンテキスト {#activity-context}

アクティビティ内では `activity.context()` から実行メタデータとハートビートへアクセスします。

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

#### 受信した再試行ポリシーと元の試行回数 {#activity-retry-metadata}

Python SDK **2.12.0 以降**が必要です。`info = activity.context().info` は
元の `attempt_number` と不変の `retry_info` スナップショットを提供します。
`info.retry_info.policy()` は未知のフィールドも含む新しいコピーを返します。

ポリシーがない場合も、ルートの `retry_policy: null` の場合も、試行上限は不明です。
`policy_provided` は両者を `False` と `True` で区別します。
受信したポリシーオブジェクトの `max_attempts: null` は、明示的に無制限を意味します。
この場合、`is_unlimited()` は `True`、`max_attempts()` は `None` です。
正の整数の上限があれば、`max_attempts()` はその値を返し、
`is_last_configured_attempt()` は元の試行回数と比較します。
上限が不明な場合、最後の試行かどうかの判定は `None` を返します。

この判定は受信した再試行予算を表します。キャンセル、期限、ワークフローの終了、
再試行できない失敗により、上限より前に実行が終わる場合があります。
通常および監視付きのリモートコールバックは元のスナップショットを受け取ります。
インラインおよび準備済みローカルコールバックは、親のリモート再試行ポリシーを継承しません。

#### 元の実行にシグナルを送る {#signal-originating-run}

`info.workflow_id` と `info.run_id` は受信した元の識別子を保持し、
`None` の場合もあります。ローカルコールバックは既知の親識別子だけを継承します。
SDK がタスク ID で代用することはありません。認可済みのアプリケーションクライアントを
このヘルパーに渡してください。ハンドルは元の実行に固定されます。

```python
from durable_workflow import Client, activity


async def signal_originating_run(client: Client, business_event_id: str) -> dict:
    info = activity.context().info
    if info.workflow_id is None or info.run_id is None:
        raise RuntimeError("This activity has no known originating workflow run")
    handle = client.get_workflow_handle(info.workflow_id, run_id=info.run_id)
    return await handle.signal(
        "payment_recorded",
        [business_event_id],
        request_id=f"payment-recorded:{business_event_id}",
    )
```

`business_event_id` は再試行の間で一定に保ち、Server のコマンドキーの長さ制限に
収めてください。現在公開されている Server は、すべてのシグナル経路でこれらのキーを
保持するわけではありません。ビジネスイベントの処理を冪等にし、配信結果が不確かな場合は
照合してください。[アクティビティの正式なリファレンス](https://python.durable-workflow.com/reference/activity/)
と[シグナル受領記録の保持要件](https://github.com/durable-workflow/.github/issues/216)を参照してください。

### ハートビートのリクエスト {#activity-heartbeat-requests}

リモートアクティビティでは、上限を設けた処理の途中で、`heartbeat_timeout` より十分前に `await ctx.heartbeat(...)` を呼び出します。最初の期間はランタイムのタスク取得から始まり、Python の受信より前です。記録されたハートビートはランタイムでの記録時刻を使い、Python が応答を受信した時刻は使いません。中断、リクエストの遅延、通信の再試行も時間予算を消費します。[送信間隔の指針](../features/heartbeats.md#heartbeat-cadence-and-receipts)に従ってください。

`Client.heartbeat_activity_task()` の直接呼び出しは、設定された `TransportRetryPolicy` を使います。このポリシーの処理後、通信エラーは `httpx.TransportError` として伝播し、HTTP の拒否は `ServerError` などの SDK 例外になります。これは HTTP の再試行であり、新しいアクティビティ試行やハートビートの時間延長ではありません。Worker が停止を求めると、`ActivityContext.heartbeat()` は `ActivityCancelled` を発生させる場合があります。協調的なプロセス監督が有効な場合、ハートビートや所有権確認の失敗によってコールバックが停止または放棄される場合があります。すべての失敗が例外処理ブロックに戻ったり、後始末が必ず実行されたりするとは限りません。

ハートビートや所有権の失敗を抑制して外部処理を続けたり、成功を報告したりしないでください。進捗は外部コミットや再開可能なチェックポイントの確認ではありません。外部作用は冪等にしてください。

### ハートビートの拒否とコールバックの終了 {#heartbeat-refusals-and-callback-exit}

**Python SDK 2.9.0** では、ハートビートの応答が `can_continue=false` を示すと、`ctx.heartbeat()` と `ctx.heartbeat_sync()` は `ActivityLeaseAuthorityLost` を送出します。例外には `activity_deadline_elapsed`、`attempt_closed`、`run_closed` など、Server の元の理由が保持されます。キャンセル要求の場合は `ActivityCancelled` を送出します。[公開済み SDK の検証結果](https://github.com/durable-workflow/sdk-python/issues/186#issuecomment-6361330674)を参照してください。

拒否を受け取ったハートビートが、協調的に終了する地点です。外部処理を停止し、例外を再送出してください。例外を捕捉して成功を返してはいけません。ハートビートを一度も送らないコードは、戻るまで実行を続ける可能性があります。補助ハートビートでは、ブロック中のライブラリ呼び出しを強制的に中断できません。有限の I/O 期限と、その呼び出し自体のキャンセル機構を使用してください。

物理アクティビティスロットは、コールバックまたはスレッドが終了するまで占有されます。試行の実行権限を失っても、そのスレッドが別の処理に使えるようにはならず、Worker は終了済みの試行に遅れた結果を送信しません。ランタイムによるタイムアウトの適用と、アプリケーションコードの停止は別の境界です。[アクティビティのタイムアウト](../features/timeouts.md#activity-timeouts)と[補助スレッドのガイド](#heartbeat-helper-thread)を参照してください。

### 再試行しないエラー {#non-retryable-errors}

再試行せずにアクティビティを失敗させるには `NonRetryableError` を送出します。

```python
from durable_workflow import NonRetryableError

@activity.defn(name="validate")
async def validate(data: dict) -> dict:
    if "required_field" not in data:
        raise NonRetryableError("Missing required_field")
    return data
```

### 終端となる業務エラー {#terminal-business-errors}

`non_retryable_error_types` は、**最も外側の**例外の短い名前（`exception_type`）または完全修飾クラス名（`exception_class`）に完全一致します。例えば `ValidationError` は、サブクラスであっても `SpecificValidationError` には一致しません。`app.errors.ValidationError` のような修飾名は、記録されたクラス名に一致する必要があります。ポリシーはサブクラスや例外の原因をたどりません。`raise RuntimeError(...) from NonRetryableError(...)` は外側の `RuntimeError` を報告するため、再試行される場合があります。

既知の業務例外を変換するときは、`NonRetryableError` を外側の例外として送出し、`cause=error` で元の Python の原因を保持してください。名前の一覧に依存せず、アクティビティの失敗を再試行不可にします。これだけでワークフロー全体が自動的に失敗するわけではありません。再試行不可の失敗、または試行予算の消費によって再試行がなくなると、ワークフローコードは `ActivityFailed` を受け取ります。

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

入力が `{"id": "order-123", "amount": 0}` の場合、アクティビティは一回失敗し、ワークフローは `status: rejected` で正常に完了します。意図した業務失敗だけを処理してください。この例は他の失敗を再送出します。業務フローに必要なら後続の永続ステップへ進めます。未処理の `ActivityFailed` はワークフローを失敗させます。Python の原因を保持しても、再試行ポリシーがその連鎖を検査することや、すべての SDK が同じ原因オブジェクトを提供することを意味しません。

### 同期アクティビティと非同期アクティビティ {#activity-execution}

通常のリモート `def` アクティビティは、`max_concurrent_activity_tasks` で上限を設定した専用のスレッドプールで実行されます。
各関数は自身のアクティビティコンテキストを保持します。関数がブロックしている間も、ポーリング、ワークフロータスク、ワーカーの heartbeat は進行できます。
`async def` アクティビティはイベントループで実行されるため、ノンブロッキング I/O を使ってください。
非同期関数内のブロッキング呼び出しも、そのイベントループを停止させます。

同期関数から進捗を送信するには `activity.context().heartbeat_sync(details)` を呼び出します。
元のタスク、試行、ワーカーの識別情報を使い、担当するイベントループ経由で送信されます。
非同期関数では `await activity.context().heartbeat(details)` を使います。

待機をキャンセルしても、実行中の Python スレッドは停止しません。関数が戻るまで物理スロットは使用中のままで、キャンセル後に戻った結果は送信されません。
`shutdown_timeout` を過ぎても関数が実行中の場合、シャットダウンは `RuntimeError` を発生させ、ワーカー登録を維持します。
呼び出し先の I/O タイムアウトを制限し、CPU 負荷の高い処理には個別に分離したワーカープロセスを使ってください。
詳しくは [SDK の実行とシャットダウンのリファレンス](https://python.durable-workflow.com/reference/worker/)を参照してください。

### 補助スレッドからのハートビート {#heartbeat-helper-thread}

長時間のブロッキング呼び出しでは、同期アクティビティ内で
`ctx = activity.context()` を取得し、補助スレッドに渡してください。
新しいスレッドにはアクティビティのコンテキストが自動では引き継がれません。
補助スレッドでは `ctx.heartbeat_sync(details)` を使い、ワーカーのイベントループ上では
呼び出さないでください。SDK リファレンスの[完全な実装例](https://python.durable-workflow.com/reference/activity/#heartbeats-during-one-blocking-call)を参照してください。

呼び出しが正常終了した場合も例外を送出した場合も、補助スレッドを停止して
`join()` で終了を待ちます。ハートビートが `ActivityCancelled` または
`ActivityLeaseAuthorityLost` を送出したら、呼び出しに協調的なキャンセルを通知し、
結果を返す前に元の例外を再送出してください。補助スレッドの例外では、
ブロック中のライブラリ呼び出しを強制的に中断できません。呼び出し自体に有限の期限と
キャンセル手段を設け、ハートビート要求のタイムアウトと再試行も制限してください。
そうしないと、処理が停止していても補助スレッドが生存を通知し続けます。

## Worker {#worker}

`Worker` は Server に登録し、タスクをポーリングして、ワークフローとアクティビティの実装へディスパッチします。

独立したワークフロー・アクティビティプロセスには、Python SDK の[実行可能なプロセス分離ガイド](https://python.durable-workflow.com/guides/separate-workers/)に従ってください。別々の登録、共有・個別のタスクキュー、再試行、ロール別スロット、正常終了を扱います。

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

スモークテストや1ワークフローの例では、`await worker.run_until(workflow_id="...", timeout=60.0)` が同じ Worker を登録し、逐次ポーリングで1ワークフローを終了状態まで進めます。ポーリングを続けるデプロイ済み Worker には `run()` を使います。

| パラメーター | 既定値 | 説明 |
|-----------|---------|-------------|
| `task_queue` | 必須 | ポーリングするタスクキュー |
| `workflows` | `()` | 登録するワークフロークラス |
| `activities` | `()` | 登録するアクティビティ関数 |
| `worker_id` | 自動生成 | 一意な Worker 識別子 |
| `poll_timeout` | `35.0` | ロングポーリングのタイムアウト秒数 |
| `max_concurrent_workflow_tasks` | `10` | 並列ワークフロータスクの最大数 |
| `max_concurrent_activity_tasks` | `10` | 並列アクティビティタスクの最大数 |
| `shutdown_timeout` | `30.0` | 停止時に進行中タスクの完了を待つ秒数 |
| `metrics` | クライアントの記録先 | ポーリングとタスクのカウンター・ヒストグラム向け任意のメトリクス記録先 |
| `interceptors` | `()` | 計測、トレース、ポリシーフック用の順序付き Worker タスクラッパー |

2つの `max_concurrent_*` 値は Worker 登録時に Server に広告され、タスクキュー受け入れ診断に現れます。Worker のローカル容量として扱ってください。名前空間、キュー、下流制限グループに複数 Worker 間の厳密な共有上限が必要な場合、Server 側の[タスクキュー受け入れ](/docs/polyglot/task-queue-admission)上限を使います。

### Worker API リファレンス {#worker-api-reference}

| メソッド | 戻り値 | 用途 |
| --- | --- | --- |
| `await worker.run()` | `None` | systemd、Docker、Kubernetes、ローカル開発シェルが監督する長時間プロセス。一度登録し、停止・キャンセルまでワークフロー、アクティビティ、クエリタスクをポーリングする。 |
| `await worker.run_until(workflow_id=..., timeout=60.0, poll_interval=0.5)` | `WorkflowExecution` | 1ワークフローを開始し、同じプロセスで終了状態まで進めるスモークテストと例。 |
| `await worker.stop()` | `None` | 協調的な停止。新しいポーリングを止め、`shutdown_timeout` まで進行中タスクの完了を待つ。 |

`run()` はポーリング開始前に Server 互換性を検証します。Worker は、公開された `control_plane.version`、`control_plane.request_contract`、`worker_protocol.version`、`auth_composition_contract` が SDK の対応契約バージョンと一致することを要求します。マニフェストがない、または非互換の場合、登録中に `RuntimeError` を送出します。監督プロセスはタスクを安全に完了できない Worker を稼働させず早期に失敗できます。

`run_until()` は `run()` と同じ登録・ディスパッチ経路を使いますが、逐次ポーリングし、指定したワークフローの最終 `WorkflowExecution` を返します。タイムアウト後も未終了なら `TimeoutError` を送出します。

タスク実行中:

- 未知のワークフロー型やアクティビティ型は、ローカルログに隠さずタスク失敗として Server に報告する
- `NonRetryableError` はアクティビティ失敗を再試行不可にする
- `ActivityCancelled` はキャンセル結果として伝播する
- 未処理のアクティビティ例外は、再試行ポリシーや Server 期限に反しない限り再試行可能な失敗として報告する
- クエリハンドラーの例外は `QueryFailed` として報告する

### Worker インターセプター {#worker-interceptors}

タスク前後のトレース、メトリクス、監査ログ、ローカルポリシー検査が必要な場合は `interceptors=[...]` を渡します。指定順に実行し、最初のインターセプターが外側のラッパーになります。チェーンを続けるため `next` を呼ぶべきです。

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

| フック | コンテキストフィールド | `next` の戻り値 |
| --- | --- | --- |
| `execute_workflow_task(context, next)` | `worker_id`, `task_queue`, `task` | ワークフローコマンド、または `None` |
| `execute_activity(context, next)` | `worker_id`, `task_queue`, `task`, `activity_type`, `args` | デコード済みアクティビティ結果 |
| `execute_query_task(context, next)` | `worker_id`, `task_queue`, `task` | エンコード済みクエリ結果文字列 |

1フックだけが必要な場合は `PassthroughWorkerInterceptor` を基底クラスにします。型チェッカーですべてのフックの存在を強制したい場合は `WorkerInterceptor` を直接実装します。

### Worker セッション {#worker-sessions}

複数のリモートアクティビティが順番に同じ Worker のローカルリソースを使う場合は、`WorkerSessionOptions` を使用します。この例は Python SDK **2.9.0** と Server **2.11.0** で検証済みです。[ポータブルなアフィニティのバージョン要件](./portable-worker-affinity.md)も参照してください。ワークフローの各実行で一意の `job_id` を使い、新しい実行で終端状態のセッション ID を再利用しないようにします。

以下のキャッシュは破棄可能です。各アクティビティは永続化された業務入力から再構築できるため、交代した保持者が前のプロセスのメモリに依存することはありません。

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

両方のアクティビティを登録し、Worker で必要な capability を宣言します。

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

`documents` タスクキューで、入力を `[job_id]` として `inspect_document_workflow` を開始します。最初のアクティビティが必要に応じてセッションを取得し、リースが有効な間は次のアクティビティも同じ保持者を使います。`max_concurrent_activities=1` は、そのセッション内で同時実行するアクティビティを制限します。キューのルーティングと capability の検査も適用されます。この短いリースとタイムアウトは有限の動作を示すためのものです。実際の作業に合わせて設定し、期限より十分前にハートビートを送信してください。

保持者の喪失やリース切れの後は、`allow_reacquire_after_failure=True` により、条件を満たす別の Worker がセッションを再取得できます。その Worker はローカルリソースを再構築する必要があります。確定済みのアクティビティ結果はリプレイされますが、未確定の副作用は繰り返される可能性があります。永続的なリソース識別子と冪等な外部操作を使用してください。セッションはメモリ、ファイル、開いたハンドルを移行しません。

明示的なクローズと絶対 TTL の満了は、そのセッション ID に対する終端状態です。後続のアクティビティは再度開けず、設定したタイムアウトが適用されるまで実行が許可されない場合があります。[公開済みのデプロイ手順](https://github.com/durable-workflow/server/blob/2.11.0/docker-compose.published.yml)にある Server のスケジューラー/メンテナンスロールを実行してください。API プロセスだけではタイムアウトは適用されません。ワークフローは試行を使い切ったアクティビティの失敗を `ActivityFailed` で処理し、`resource_unavailable` を返します。その後、アプリケーションは新しいセッションを選び、業務入力からリソースを再構築できます。この例は、セッション終了例外の即時送出や終端セッションの自動再開を保証しません。

保持者のライフサイクルを明示的に操作するには、`worker.worker_session(options)` とその `create()`、`renew()`、`close(reason)` を使用します。Worker の正常なシャットダウンでは、保持中のセッションを閉じます。[共通のライフサイクル契約](../features/worker-sessions.md#lifecycle)を参照してください。

## ログ {#logging}

SDK は構造化したロガー名で Python 標準の `logging` モジュールを使います。

| ロガー名 | 記録する内容 |
|-------------|--------------|
| `durable_workflow.worker` | Worker 登録、タスクポーリング、タスク完了、エラー |
| `durable_workflow.workflow.replay` | ワークフローのリプレイイベント（リプレイ中は出力しない） |

### ログの設定 {#configuring-logging}

アプリケーションの入口でログレベルを設定します。

```python
import logging

# Show INFO-level worker events (registration, task completion)
logging.basicConfig(level=logging.INFO)

# Or configure specific loggers
logging.getLogger("durable_workflow.worker").setLevel(logging.DEBUG)
logging.getLogger("durable_workflow.workflow.replay").setLevel(logging.INFO)
```

### ログレベル {#log-levels}

- **INFO**: Worker 登録、タスク開始・完了、ワークフロー完了
- **DEBUG**: 詳細なタスクペイロード（切り詰めあり）、ポーリング周期
- **WARNING**: 再試行可能なエラー（API 呼び出し失敗、未知のワークフロー型）
- **ERROR**: 再試行不可の失敗、リプレイクラッシュ

### リプレイを考慮したログ {#replay-aware-logging}

ワークフロー内では、リプレイを考慮する `ctx.logger` を使います。

```python
@workflow.defn(name="order_processor")
class OrderProcessor:
    def run(self, ctx, order_id: str):
        ctx.logger.info("Processing order %s", order_id)  # Only logs during execution, not replay
        result = yield ctx.schedule_activity("process_order", [order_id])
        ctx.logger.info("Order processed: %s", result)
        return result
```

ワークフローの復旧や実行継続でログが重複しないよう、ログ文は**リプレイ中に出力しません**。

### 構造化ログ {#structured-logging}

JSON 構造化ログには、アプリケーションのルートロガーに JSON フォーマッターを設定します。

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

## メトリクス {#metrics}

`Client(metrics=...)` と `Worker(metrics=...)` は、2メソッドを持つ任意の記録先を受け入れます。

```python
def increment(name: str, value: float = 1.0, tags: dict[str, str] | None = None) -> None: ...
def record(name: str, value: float, tags: dict[str, str] | None = None) -> None: ...
```

既定の記録先は何もしないため、収集に設定は不要です。テストやカスタムエクスポーターループには `InMemoryMetrics` を使います。

```python
from durable_workflow import Client, InMemoryMetrics, Worker

metrics = InMemoryMetrics()

async with Client("http://localhost:8080", token="secret", metrics=metrics) as client:
    worker = Worker(client, task_queue="default", workflows=[GreeterWorkflow], activities=[greet])
```

Prometheus では任意の extra をインストールし、`PrometheusMetrics` を渡します。

```bash
pip install 'durable-workflow[prometheus]'
```

```python
from durable_workflow import Client, PrometheusMetrics

metrics = PrometheusMetrics()
client = Client("http://localhost:8080", token="secret", metrics=metrics)
```

SDK は次を記録します。

| メトリクス | 型 | タグ |
|--------|------|------|
| `durable_workflow_client_requests` | カウンター | `method`, `route`, `plane`, `status_code`, `outcome` |
| `durable_workflow_client_request_duration_seconds` | ヒストグラム | `method`, `route`, `plane`, `status_code`, `outcome` |
| `durable_workflow_worker_polls` | カウンター | `task_kind`, `task_queue`, `outcome` |
| `durable_workflow_worker_poll_duration_seconds` | ヒストグラム | `task_kind`, `task_queue`, `outcome` |
| `durable_workflow_worker_tasks` | カウンター | `task_kind`, `task_queue`, `outcome` |
| `durable_workflow_worker_task_duration_seconds` | ヒストグラム | `task_kind`, `task_queue`, `outcome` |

## スケジュール {#schedules-1}

クライアントでスケジュールされたワークフローを作成・管理します。

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

## 同期クライアント {#synchronous-client}

スクリプト、ノートブック、非同期でないコンテキストには同期ラッパーを使います。

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

同期クライアントは非同期 API と同じ形ですが、各呼び出しを `asyncio.run` で包みます。

## エラー処理 {#error-handling}

SDK は Server のエラーコードを型付き Python 例外に対応付けます。

| 例外 | 条件 |
|-----------|------|
| `WorkflowNotFound` | ワークフロー ID が存在しない |
| `WorkflowAlreadyStarted` | ポリシーに衝突する重複ワークフロー ID |
| `WorkflowFailed` | ワークフロー実行が失敗した |
| `WorkflowCancelled` | ワークフローがキャンセルされた（`Exception` ではなく `BaseException` を継承） |
| `WorkflowTerminated` | ワークフローが終了された |
| `ActivityCancelled` | 実行中にアクティビティがキャンセルされた（`Exception` ではなく `BaseException` を継承） |
| `ChildWorkflowFailed` | 子ワークフローが失敗した |
| `QueryFailed` | クエリハンドラーがエラーを返した |
| `UpdateRejected` | ワークフローが更新を拒否した |
| `ScheduleNotFound` | スケジュール ID が存在しない |
| `ScheduleAlreadyExists` | スケジュール ID が重複している |
| `NamespaceNotFound` | 名前空間が存在しない |
| `InvalidArgument` | リクエストパラメーターが不正 |
| `Unauthorized` | 認証失敗 |
| `ServerError` | Server が予期しないエラーを返した |

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

### キャンセルは意図的に `except Exception` で捕捉できない {#cancellation-is-intentionally-uncatchable-by-except-exception}

`WorkflowCancelled` と `ActivityCancelled` は `Exception` ではなく `BaseException` を継承します。アクティビティ本体や `client.get_result()` を await するコードの汎用 `except Exception:` は、これらを**捕捉しません**。これは意図的です。キャンセルはコントロールプレーンの結果であり、すべてを捕捉する処理で黙って飲み込むと、ワークフローが停止を要求した後にアクティビティが成功を報告できてしまいます。

タスクのキャンセル時にローカルクリーンアップが必要なら、クラス名で捕捉して再送出します。これは閉じたワークフローを補償のために再開するものではありません。

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

標準ライブラリの `asyncio.CancelledError` と `KeyboardInterrupt` の先例に従っています。

## テスト {#testing}

ワークフローの作成者は、稼働中の Server や Worker がなくてもコードをテストできるべきです。`durable_workflow.testing` は2つの入口を提供します。

- `WorkflowEnvironment` は、ユーザー登録のアクティビティモックに対し、単一 Python プロセスでワークフローを完了まで進める。
- `replay_history` と `replay_history_file` は、取得した本番履歴を現在のワークフローコードに対してリプレイし、非決定性があれば例外を出す。

両者は実行時に Worker が使う同じ `durable_workflow.workflow.replay` 機構を再利用するため、テストハーネスを通過したワークフローは実際の Worker でも同じように振る舞います。

### WorkflowEnvironment {#workflowenvironment}

`WorkflowEnvironment` は yield したワークフローコマンドを登録済みモックへディスパッチし、タイマー、副作用、検索属性の upsert を自動発火します。テストに実際の時計、Redis、Server は不要です。

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

| メソッド | 用途 |
| --- | --- |
| `register_activity_result(name, result)` | アクティビティ `name` の各呼び出しに `result` を返す。引数を問わないテスト向け。 |
| `register_activity(name, fn)` | スケジュールされた `name` の各呼び出しに `fn(*arguments)` を呼ぶ。引数で変化するモックや呼び出し記録向け。 |
| `register_child_workflow_result(workflow_type, result)` | 型 `workflow_type` の子を開始すると `result` を返す。 |
| `signal(name, args=None, run=None)` | 次のリプレイ反復前に配信するシグナルをキューに入れる。ハーネスは `SignalReceived` を注入し、登録済み `@workflow.signal` ハンドラーへ送る。continue-as-new チェーンのリンク `N` には `run=N` を渡す。 |
| `register_workflow(workflow_cls)` | 追加ワークフロークラスを名前で解決可能にする。開始時以外の型を `continue_as_new(workflow_type=...)` で使うチェーンに必要。 |
| `execute_workflow(workflow_cls, *args, run_id="test-run")` | 終了状態まで進めて結果を返す。`continue_as_new` を最終実行まで追い、その結果を返す。失敗状態で終わると `WorkflowFailed`。 |
| `runs` / `run_count` | `execute_workflow` が戻った後、チェーンの各リンクに1つの `WorkflowRunRecord`（入力、ワークフロー型、履歴イベント、終了コマンド）を公開し、継続チェーン全体を検証できる。 |

フィクスチャが不足するとハーネスは明示的に失敗します。

- 登録済みモックのないアクティビティのスケジュールは `KeyError`
- 登録済みモックのない子ワークフローの開始は `KeyError`
- 反復上限（既定 `1000`）内に終了しないワークフローは `RuntimeError`

正当に既定値より多く反復するワークフローは、`WorkflowEnvironment(...)` へ `iteration_limit=...` を渡して上限を調整します。

#### callable のアクティビティモック {#callable-activity-mocks}

引数に応じた応答や呼び出し記録が必要なら `register_activity` を使います。

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

#### シグナル {#signals}

`env.signal(...)` でキューに入れたシグナルは次のリプレイ反復前に取り出します。ペイロードは実行時の Worker と同じ `{codec, blob}` エンベロープに包み、登録された `@workflow.signal` ハンドラーへ送ります。

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

#### タイマー、副作用、検索属性 {#timers-side-effects-and-search-attributes}

ハーネスは各コマンドに対応する履歴イベントを自動発火するため、テスト内のワークフローは実時間で待機しません。

- `ctx.sleep(seconds)` → `TimerFired`
- `ctx.side_effect(...)` → `SideEffectRecorded`
- `ctx.upsert_search_attributes(...)` → `SearchAttributesUpserted`
- `workflow.version(...)` マーカー → `VersionMarkerRecorded`

#### Continue-as-new チェーン {#continue-as-new-chains}

ワークフローが `ctx.continue_as_new(...)` を返すと、ハーネスは完了する実行に `WorkflowContinuedAsNew` を追加し、履歴をリセットし、コマンドの引数で新しい実行を開始します。`execute_workflow` の戻り値は最終リンクの終了結果です。

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

チェーンで型を切り替える場合、後続クラスを先に登録します。

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

チェーンの特定リンクへシグナルを送るには `run=N` を使います。

```python
env.signal("approve", ["alice"], run=2)  # delivered to the second run
```

チェーン長は `continue_as_new_limit`（既定 `50`）で制限します。上限を超えると `RuntimeError` を送出し、無限に回る代わりに暴走した継続をテストで検出します。正当に長いチェーンは `WorkflowEnvironment(continue_as_new_limit=...)` で上限を調整します。

#### 失敗のアサーション {#failure-assertions}

Python 例外を送出するワークフローは `WorkflowFailed` として現れます。

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

### 本番履歴に対するリプレイテスト {#replay-testing-against-production-history}

Server から取得した実際の履歴に対する変更の回帰テストには `replay_history` を使います。リプレイヤーは記録済みイベント列に対して現行コードを実行し、履歴に記録したものと異なるコマンドを yield すると例外を出します。これが非決定性バグの定義です。

```python
from durable_workflow import Client
from durable_workflow.testing import replay_history

async with Client("http://localhost:8080") as client:
    history = await client.get_history("order-42", run_id="...")

replay_history(OrderWorkflow, history["events"], start_input=["order-42"])
```

以前完了したワークフローは、同じ履歴でリプレイしても完了する必要があります。アクティビティ呼び出し順序の変更、分岐の削除、アクティビティ型の変更などで記録列から逸脱すると `replay_history` が例外を出し、本番ではなく CI で回帰を検出します。

便利なラッパー `replay_history_file` は、最上位のイベントリスト、または `get_history` レスポンスと同じ `events` キーを持つ辞書の、2形式の JSON ファイルを読めます。

```python
from durable_workflow.testing import replay_history_file

replay_history_file(
    OrderWorkflow,
    "tests/histories/order-42.json",
    start_input=["order-42"],
)
```

両関数は任意の検証ヒント `payload_codec` を受け入れます。未設定なら履歴の記録タグを使います。明示または記録されたタグは `avro` でなければなりません。`json`、未知、タグなしの永続ペイロードはデコード前に失敗します。

#### クラス形式のリプレイヤー {#class-based-replayer}

1回のテストで複数のワークフロー型の履歴をリプレイする場合や、取得した `WorkflowStarted` イベントで対象ワークフローを決める場合は `Replayer` クラスを使います。全クラスを先に登録し、取得履歴ごとに `replay(...)` を呼びます。

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

`Replayer(workflows=[...])` は空のワークフロー集合や重複登録を `ValueError` で拒否します。`replay(...)` は、未登録の型が履歴に要求された場合、または複数登録時に呼び出し元が `workflow_type` を指定せず履歴に `WorkflowStarted` もない場合、`ValueError` を送出します。

`ReplayOutcome.commands` は関数形式の `replay_history` ヘルパーが返すものと同じコマンドリストです。クラス形式の入口は、多数の履歴で1つの登録を共有するために存在します。

### テストハーネスリファレンス {#test-harness-reference}

| シンボル | 用途 |
| --- | --- |
| `durable_workflow.testing.WorkflowEnvironment` | プロセス内テストハーネス。登録したアクティビティ・子ワークフローモックに対して完了まで進める。 |
| `durable_workflow.testing.replay_history(workflow_cls, events, start_input=None, *, run_id="", payload_codec=None)` | 履歴イベント列を現在のコードに対してリプレイする。非決定性で例外を出す。 |
| `durable_workflow.testing.replay_history_file(workflow_cls, path, start_input=None, *, run_id="", payload_codec=None)` | ディスクの JSON 履歴を読みリプレイする。最上位イベントリストまたは `events` キーの辞書を受け入れる。 |
| `durable_workflow.Replayer(*, workflows=[...])` | クラス形式のリプレイヤー。1つ以上のクラスを登録し、取得履歴ごとに `replay(history, start_input=None, *, workflow_type=None, workflow_id=None, run_id="", payload_codec=None)` を呼ぶ。履歴に `WorkflowStarted` があれば `workflow_type` と `start_input` を推定する。 |
| `durable_workflow.ReplayOutcome` | `Replayer.replay` が返す dataclass。次に出力するはずのコマンド `commands: list[Command]` を持つ。 |
| `durable_workflow.errors.WorkflowFailed` | ワークフローが失敗状態で終了すると `execute_workflow` が送出する。 |
| `durable_workflow.errors.WorkflowCancelled` | キャンセルされたワークフローの終了状態。`BaseException` を継承する。 |
| `durable_workflow.errors.WorkflowTerminated` | Server に終了されたワークフローの終了状態。`BaseException` を継承する。 |

## ペイロードコーデック {#payload-codec}

<div
  data-public-payload-codec-contract="avro-only"
  data-payload-codec="avro"
  data-authority-manifest="https://durable-workflow.github.io/sdk-neutrality-contract.json"
  data-legacy-v1-import-drain="none">
  Worker プロトコル境界を越えるすべてのペイロードにはコーデックタグが付きます。
  Durable Workflow 2.0 の公開ペイロードコーデックは <code data-payload-codec-field="codec">avro</code> だけです。
  Python SDK は別のデコーダーを選ばず、JSON タグ付き、未知、タグなしの永続ペイロードを拒否します。<a href="/docs/polyglot/avro-value-protocol/">Avro Value プロトコル</a>を参照してください。
</div>

### Avro 対応は組み込み済み {#avro-support-is-built-in}

固定された 2.0 SDK 成果物はランタイム依存として `fastavro` を取得するため、すべての送信サーフェス（`start_workflow`、`signal_workflow`、`query_workflow`、`update_workflow`、アクティビティ結果のエンコード、スケジュールアクション）が最適化された本番経路で Avro タグ付きペイロードを出力します。任意のコーデック extra のインストールは不要です。

### 固定された型付きの値 {#fixed-typed-values}

SDK は共有 `durable_workflow.protocol.Value` スキーマ内の名前付き分岐を明示的に選びます。Avro 内で値を JSON エンコードしません。したがって整数と倍精度浮動小数点数、文字列とバイト列、真偽値と整数、リストとマップは SDK 間でも区別されます。ワイヤーでは Avro single-object フレームとスキーマフィンガープリントを使い、未知のフィンガープリントは `unsupported_payload_schema` で失敗します。

すべてのクライアント・Worker サーフェスは、Avro 既定で端から端まで動作します。

- **クライアントの開始、シグナル、クエリ、更新:** `start_workflow`、`signal_workflow`、`query_workflow`、`update_workflow` は固定 Value スキーマで `payload_codec = "avro"` のペイロードを出力します。Python クライアントは PHP などの多言語 SDK がリプレイするワークフローを操作でき、逆も可能です。
- **アクティビティ Worker:** Avro タグ付き引数は透過的にデコードされます。Worker は結果を Avro へエンコードし、PHP、Python、将来の SDK Worker が1つのペイロード境界を共有します。
- **アクティビティ失敗:** `fail_activity_task(..., details=...)` は `failure.details` を `{codec, blob}` エンベロープで送ります。Server は blob と `details_payload_codec` を記録し、Python Worker の失敗診断データが履歴エクスポートと可観測性ビューで言語中立のままになります。
- **ワークフロー Worker の履歴リプレイ:** Avro タグ付き開始入力とアクティビティ結果イベントをリプレイ中にデコードするため、Python ワークフローは Avro コーデックの実行に参加できます。
- **ワークフロークエリタスク:** Server がルーティングするクエリタスクは Avro タグ付きワークフロー引数、クエリ引数、リプレイ履歴を持ちます。Worker はクエリ結果を Avro エンベロープで返します。

### v2 実行に対して Python アクティビティ Worker を動かす {#running-a-python-activity-worker-against-a-v2-run}

コーデック設定は不要です。SDK は各クレームをデコードする前に `payload_codec` を検証し、`avro` だけを受け入れ、アクティビティを実行し、Avro タグ付き結果を返します。それ以外のタグは `unsupported_payload_codec` で安全側に失敗し、形式の嗅ぎ分けや推測はしません。

### Python と PHP 間で正確に往復できる型 {#types-that-round-trip-cleanly-across-python-and-php}

| Python 型 | Avro Value 分岐 | PHP 型 |
|-------------|------|----------|
| `str` | `StringValue` | `string` |
| `bytes` | `BytesValue` | `AvroBinaryValue` |
| `int` | `LongValue` | `int` |
| `float` | `DoubleValue` | `float` |
| `bool` | `BooleanValue` | `bool` |
| `None` | `null` | `null` |
| `list` | `ArrayValue` | `array`（リスト） |
| `dict[str, ...]` | `MapValue` | `array`（文字列キーのマップ） |

dataclass、集合、タプル、datetime オブジェクトなど Python 固有の型は、ワークフローやアクティビティの値に使う前に正規の文字列、整数、マップ、リストへ変換します。

## 共有 Server に対して実行する {#running-against-a-shared-server}

上の[クイックスタート](#quickstart)は公開 Docker イメージでローカル Server を起動する方法を示します。チーム環境では通常、Python Worker を既存の Server（ステージング、本番、共有開発インスタンス）へ向けます。

```python
from durable_workflow import Client

client = Client(
    "https://workflow.example.internal",
    control_token="team-orders-operator-token",
    worker_token="team-orders-worker-token",
    namespace="team-orders",
)
```

`namespace` 引数を、共有 Server がチーム用にプロビジョニングしたテナント名前空間に設定し、その名前空間用に発行された認証情報を使います。名前空間作成は Server の運用担当者が管理します。詳細は [Server ガイド](/docs/polyglot/server)を参照してください。

同じコンストラクターは Cloud 管理ランタイムにも対応します。Cloud が提供した名前空間のランタイム URL と名前空間値を使い、`control_token` にクライアントランタイム認証情報、`worker_token` に Worker ランタイム認証情報を設定します。名前空間は Cloud がプロビジョニングします。セルフホスト Server アドレスへ置き換えないでください。[Cloud 管理ランタイム](/docs/polyglot/cloud-control-plane)を参照してください。

## ワークフロー一覧と履歴のページ {#workflow-list-and-history-pages}

公開されている次の呼び出しは、自動的な全件取得ではなく**1ページ**を返します：`await client.list_workflows(...)` / `await client.get_history(workflow_id, run_id, ...)`。返された不透明な token で続け、namespace、フィルター、選択した workflow/run を維持してください。最後の null/空 token で終了し、ページのエラーを明示的に処理します。部分的なページは replay bundle ではありません。オフライン replay には SDK の履歴エクスポート API を使います。[公開 Python 2.9.0 クライアントのソース](https://github.com/durable-workflow/sdk-python/blob/2.9.0/src/durable_workflow/client.py)が現在の引数を定義しており、新たな自動イテレーターの提供を意味しません。
