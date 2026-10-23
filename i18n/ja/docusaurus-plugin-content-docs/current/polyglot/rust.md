---
sidebar_position: 5
title: Rust SDK
description: ファーストパーティの Rust SDK をインストールし、crate、ソース、生成 API ドキュメントを参照します。
tags:
  - Rust
  - SDK
  - workers
  - polyglot
keywords:
  - sample-app-playground
  - Rust SDK
  - durable-workflow crate
  - Rust Worker
  - crates.io
---

import ProductPromotion from '@site/src/components/ProductPromotion';

# Rust SDK {#rust-sdk}

一般に利用できる SDK サーフェスにはこのガイドを使い、個々の型とメソッドは生成 API リファレンスへ進んでください。Cloud アカウントは不要です。主な手順は、公開された Rust crate をセルフホスト Server と使います。Durable Workflow Cloud の制限付き早期アクセスに参加済みの開発者は、明確に別の[管理ランタイムクイックスタート](./rust-cloud-quickstart.md)も選べます。

ファーストパーティの Rust SDK は、プロトコル互換クライアントだけでなくワークフローを記述するサーフェスです。Rust は PHP と Python と同じ永続実行モデルで、決定的なワークフロー、アクティビティ、長時間動く Worker サービスを記述できます。非同期コントロールプレーンクライアントは実行の開始、シグナル、クエリ、更新、キャンセル、終了、待機を行います。Worker ランタイムはワークフロー履歴をリプレイし、ワークフロー・アクティビティ・更新ハンドラーを実行し、Worker とアクティビティのハートビートを報告し、セルフホスト Server または Durable Workflow Cloud 名前空間ランタイムと言語に依存しないペイロードを交換します。

[Rust ドキュメントのトップページ](https://rust.durable-workflow.com/)は SDK インデックスと一般的な入口を提供します。crate のモジュール、構造体、トレイト、メソッドは生成された [Rust SDK API リファレンス](https://rust.durable-workflow.com/durable_workflow/)へ進んでください。

安定版 Rust SDK は、永続タイマー、子ワークフロー、アクティビティの再試行とタイムアウト、ローカルアクティビティ、Worker セッション、スティッキー実行、シグナル、リプレイされるクエリハンドラー、キャンセルと終了、Server が強制するワークフロー期限、型付き副作用、バージョンマーカー、更新、型付きの終了・リプレイ失敗に対応します。スケジュール管理の提供はまだ表明していません。全 SDK が同じ機能範囲を持つと想定せず、[2.0 機能インデックス](/docs/capabilities/)を使ってください。

## ローカルの Sample App プレイグラウンドを試す {#try-the-local-sample-app-playground}

Cloud を使わず最短で記述を試すには、現在の [Sample App の `main` ブランチを GitHub Codespaces で開き](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main)、次を実行します。

<!-- docs-example id="sdk.rust.sample-app-playground" -->
```bash
scripts/playground rust
```

ローカルプレイグラウンドは呼び出し元が所有するワークフローとアクティビティのソースを生成し、現在の安定版成果物を選択し、公開された Server と Waterline を起動します。ID、ワークフロー型、アクティビティ型、タスクキューが生成した契約と一致する Worker 登録を待ってから、ワークフローを開始します。成功には期待した完了結果と履歴が必要です。その後、ターミナルは正確なローカル Waterline 実行リンクと構造化 JSON 証跡のパスを表示します。

意図的に小さくトランスポートを優先したこのひな形は `serde_json::Value` を使いますが、推奨される Rust アプリケーション契約はこれだけではありません。crate の既存の[型付き入出力例](https://github.com/durable-workflow/sdk-rust/blob/main/examples/hello_world.rs)、[再試行・タイムアウト・ハートビート・終了失敗のアクティビティポリシー例](https://github.com/durable-workflow/sdk-rust/blob/main/examples/activity_options.rs)、[ローカルアクティビティ例](https://github.com/durable-workflow/sdk-rust/blob/3.1.0/examples/local_activities.rs)へ進んでください。Sample App を使わない利用者には、以下のパッケージ、リポジトリ例、生成 API リファレンスが直接の経路です。

## パッケージとソース {#package-and-source}

- [crates.io の crate](https://crates.io/crates/durable-workflow)
- [ソースリポジトリ](https://github.com/durable-workflow/sdk-rust)

最後に合格した認定済みの組から Rust SDK をインストールします。正確な要件は Server クイックスタートと同じ機械可読の正本から生成されます。

<!-- docs-example id="rust.sdk.install" -->
```bash
%%artifact.rustCargoAddCommand%%
```

または同じ認定済み要件を `Cargo.toml` に直接宣言します。

```toml
[dependencies]
%%artifact.rustCargoRequirement%%
```

crate は Rust 1.86 以降が必要です。パッケージメタデータは、その SDK リリースの認定に使った Server バージョン、Worker プロトコルの既定値と最小値、コントロールプレーン 2 を記録します。より新しい Server との互換性は別に検証します。デプロイ時は `GET /api/cluster/info` が広告するプロトコルマニフェストと機能を使ってください。

Server はメジャー `1` 内で Worker プロトコルヘッダーをネゴシエーションします。`1.N` を広告する Server は、`M <= N` の場合だけ Worker ヘッダー `1.M` を受け入れます。Rust SDK 3.5.0 の既定は `X-Durable-Workflow-Protocol-Version: 1.20` で、`1.20` 以降を広告する Server が必要です。古い互換 Server には、クライアントビルダーの `worker_protocol_version` 設定で `WorkerProtocolVersion::V119` を選びます。SDK 3.4.x の既定は `1.19` です。オプトインの協調キャンセルプロファイルは `1.20` が必要で、明示的な `1.19` 選択を拒否します。

ネゴシエーションは安全側に失敗します。ヘッダーの欠落・不正、異なるメジャー、Server が広告するマイナーより新しい Worker マイナーは拒否します。SDK と Server のリリースバージョンは独立に管理します。互換性はランタイムのプロトコルマニフェストで決まります。

## ワークフロー一覧と実行の全履歴 {#workflow-lists-and-history}

この API には Rust SDK **4.6.0 以降**が必要です。上の独立したインストール構成は古い crate を選ぶ場合があるため、`Cargo.lock` を確認してください。[通常インストールしたパッケージの受け入れ検証](https://github.com/durable-workflow/sdk-rust/issues/122#issuecomment-6363352910)では、公開 Server 2.11.0 に対して一覧3ページ、履歴6ページ、128 KiB payload、エクスポート/replay、読み取り専用の例を確認しています。オフラインテストの補助 API は4.5.0、ここで扱う一覧/履歴メソッドとイテレーターは4.6.0が必要です。選択済み Server/SDK 構成は変えません。

`Client::list_workflows(WorkflowListOptions)` と `Client::get_workflow_history(workflow_id, run_id, WorkflowHistoryOptions)` はそれぞれ**1ページ**を返します。不透明な `next_page_token` で手動継続するか、遅延イテレーターで全件を読みます。Server の検証、フィルター、namespace の範囲を維持し、新たなクエリフィールドや構文は追加しません。例えば、登録済み keyword 属性で未終了の実行を探します。

```rust
use durable_workflow::WorkflowListOptions;
async fn find(client: durable_workflow::Client) -> durable_workflow::Result<()> {
let mut matches = client.iter_workflows(
    WorkflowListOptions::new()
        .workflow_type("payments")
        .status("running")
        .query("OrderRef = 'order-42'")
        .page_size(2),
);
match (matches.next().await?, matches.next().await?) {
    (Some(run), None) => println!("open run: {} / {}", run.workflow_id, run.run_id),
    (None, _) => println!("no open run"),
    _ => println!("multiple open runs; refine the query"),
}
Ok(())
}
```

Server の `status=running` フィルターはアクティブな **status bucket** を選び、元の状態が `pending` や `waiting` の実行も含みます。`WorkflowSummary` は `status`、`status_bucket`、`is_terminal`、検索属性と、`raw` 内の未知のメタデータを保持します。検索属性は一意ではなく、親と値を継承した子の両方が一致する場合があります。上のように0件、1件、複数件を処理してください。目的の namespace でクライアントを作成してからイテレーターを構築し、各 token 間で namespace とフィルターを維持します。

全ページを同時に読み込まず、選択した実行の全履歴を読みます。

```rust
use durable_workflow::WorkflowHistoryOptions;
async fn audit(client: durable_workflow::Client) -> durable_workflow::Result<()> {
let mut events = client.iter_workflow_history(
    "payment-42", "selected-run-id", WorkflowHistoryOptions::new().page_size(100),
);
while let Some(event) = events.next().await? {
    println!("{}", event.event_type);
}
Ok(())
}
```

`iter_workflows(options)` は `next().await` で各 `WorkflowSummary` を返します。両イテレーターは `futures_util::TryStreamExt` 用の `into_stream()` に対応し、ポーリング前に返された stream を固定します。構築時に I/O は行わず、現在のページを使い切ると次を取得します。null/空 token で終了し、token 付きの空ページは継続します。重複/循環 token は有界の token 状態を使って `Error::Pagination` を返します。ページの失敗は元の型付きエラーを保持し、その後イテレーターは終了します。部分的な読み取りを完全な結果として扱わず、エラーを処理してください。stream を収集すると、収集した項目すべてを保存します。

履歴の反復は元の workflow/run を維持して利用可能なイベントを列挙し、continue-as-new を追跡せず、無期限の購読もしません。イベントのメタデータと payload の wire envelope を保持します。オフライン replay には履歴の一部ではなく、`Client::export_workflow_history` と `testing::WorkflowHistory::from_export` を使います。[オフライン replay](#rust-replay-export)を参照してください。

公開 Server 2.11 は既定で一覧50件（最大200）、履歴100イベント（最大1,000）を1ページに返します。ページサイズは変更せず Server の検証に渡します。必要な結果が得られたら止め、適切なサイズとアプリのタイムアウトを選んでください。同時に実行が変わる場合、ページ分割はスナップショット分離を追加しません。[公開された読み取り専用の例](https://github.com/durable-workflow/sdk-rust/blob/4.6.0/examples/workflow_pagination.rs)、[Client API](https://rust.durable-workflow.com/durable_workflow/struct.Client.html)、[ページ分割の型](https://rust.durable-workflow.com/durable_workflow/pagination/index.html)を参照してください。

## メトリクスと Prometheus エクスポート {#rust-sdk-metrics}

この API は Rust SDK **4.7.0 以降**が必要です。上の独立した構成が旧 crate を選ぶ場合があるため、`Cargo.lock` を確認してください。[通常インストールの受け入れ検証](https://github.com/durable-workflow/sdk-rust/pull/131#issuecomment-6364178456)では、HTTP4項目、公開 Server 2.11.0 と実際の worker による6メトリクス、公開エクスポート例を確認しています。この最低バージョンは選択済み構成を変えません。

既定の recorder は **no-op** です。`increment(name, count, tags)` と `record(name, seconds, tags)` を実装する `Arc<dyn metrics::MetricsRecorder>` を渡します。クライアント、クローン、新しく作る worker が継承します。`Worker::metrics_recorder` は worker の poll/task 観測を上書きし、要求の観測はクライアントの recorder を使います。コールバックは高速にし、exporter の失敗は内部で処理します。unwinding する recorder の panic は SDK 結果から分離しますが、ブロックする exporter やプロセス abort をこの hook で修復できません。

クライアント要求、worker poll、取得済み task の処理ごとに、カウンターを1増やし、非負の単調な経過時間を秒で1回記録します。安定した6つの名前は次のとおりです。

| カウンター | 時間ヒストグラム |
| --- | --- |
| `durable_workflow_client_requests` | `durable_workflow_client_request_duration_seconds` |
| `durable_workflow_worker_polls` | `durable_workflow_worker_poll_duration_seconds` |
| `durable_workflow_worker_tasks` | `durable_workflow_worker_task_duration_seconds` |

クライアントのタグキーは `method`、`route`、`plane`、`status_code`、`outcome`、worker は `task_kind`、`task_queue`、`outcome` のみです。検証済みルートのプレースホルダーは ID、クエリ文字列、payload、資格情報を含まず、不明なパスは `unknown` です。キュー名はアプリが制御し、実行ごとに作らず有限の集合にします。

クライアントの outcome は `ok`、`http_error`、`bridge_rejected`、`TransportError`、`TimeoutError`、`SdkError` と、キャンセルされた future の `pending` を含みます。`status_code` は観測した10進 HTTP 状態を保持し、なければ `none` です。Rust の例外名は他 SDK と同じとは限りません。

クライアントの1観測には内部 transport/storage admission の再試行と応答/payload 処理を含み、アプリや worker が管理する別呼び出しは別観測です。遅延イテレーターは取得ページごとに観測します。worker poll は管理された retry/backoff を含み、`task`、`empty`、`backpressure`、`error` を区別します。task 結果の `completed`、`failed`、`expired` は処理結果であり workflow の終端状態ではありません。これはプロセス観測で、永続カウント、課金単位、schedule-to-start 遅延ではなく、突然のプロセス喪失で最後のサンプルが失われる場合があります。

公式 Prometheus adapter には任意の Cargo feature `metrics-prometheus` を有効にします。この例は公開済みの依存関係設定を使います。

```toml
[dependencies]
durable-workflow = { version = "=4.7.0", features = ["metrics-prometheus"] }
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

[公開された例](https://github.com/durable-workflow/sdk-rust/blob/4.7.0/examples/metrics_prometheus.rs)を `examples/metrics_prometheus.rs` に保存します。これと同じソースバイトが通常インストールでコンパイル・実行済みで、health 要求のメトリクスを出力します。

```rust
//! Preview application-owned Prometheus export; serve `encode()` from your HTTP metrics route.
use durable_workflow::{metrics::PrometheusMetrics, Client};
use std::sync::Arc;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let recorder = Arc::new(PrometheusMetrics::new()?);
    let client = Client::builder(std::env::var("DURABLE_WORKFLOW_SERVER_URL")?)
        .token(std::env::var("DURABLE_WORKFLOW_AUTH_TOKEN").ok())
        .metrics_recorder(recorder.clone())
        .build()?;
    client.health().await?;
    // Workers inherit this client recorder; Worker::metrics_recorder overrides
    // only worker poll/task observations. Applications own the scrape endpoint.
    print!("{}", String::from_utf8(recorder.encode()?)?);
    Ok(())
}
```

セルフホスト Server に対して実行します。

```bash
DURABLE_WORKFLOW_SERVER_URL=http://localhost:8080 \
DURABLE_WORKFLOW_AUTH_TOKEN=your-token \
cargo run --features metrics-prometheus --example metrics_prometheus
```

`PrometheusMetrics::new()` は公式 Prometheus Rust client 0.14 に基づく専用 registry を持ちます。アプリのメトリクスルートから `encode()` のバイトを `Content-Type: text/plain; version=0.0.4` で返します。adapter は listener やグローバル registry を作りません。scrape のアクセス/認証、ネットワーク公開、リソース、終了はアプリが管理します。カウンターには `_total` が付き、ヒストグラムは標準 bucket/sum/count 系列です。`registry()` でアプリ独自の収集や追加メトリクスを扱えます。

OpenTelemetry のメトリクスには既存 meter で recorder を実装し、単位 `1` のカウンターと秒 `s` のヒストグラムを上の名前/タグで作ります。provider、集約、resource label、exporter のライフサイクルはアプリが管理し、実行 tracing とは別です。[recorder API](https://rust.durable-workflow.com/durable_workflow/metrics/trait.MetricsRecorder.html)、[Prometheus API](https://rust.durable-workflow.com/durable_workflow/metrics/struct.PrometheusMetrics.html)、[公開契約](https://github.com/durable-workflow/sdk-rust/blob/4.7.0/README.md#client-and-worker-metrics)を参照してください。

## Worker タスクの並行実行 {#worker-task-concurrency}

以下の有界実行レーンには Rust SDK **4.3.1 以降**が必要です。`Cargo.lock` のバージョンを確認してください。上の固定インストールは別の検証済み構成に属し、古い SDK を選ぶ場合があります。[公開パッケージの受け入れ検証](https://github.com/durable-workflow/sdk-rust/issues/107#issuecomment-6360719863)では、設定した三つのスロット、解放後に初めて入る四つ目のコールバック、処理済みのアクティビティ失敗を含む七つのワークフロー完了を確認しています。前述の Server プロトコル要件は引き続き適用されます。

`Worker::max_concurrent_workflow_tasks(...)` と `Worker::max_concurrent_activity_tasks(...)` は、それぞれ既定値が **10** です。`run()` と `run_until()` はワークフローとリモートアクティビティで独立した有界レーンを使います。各タスク種別を逐次実行するには **1** を指定します。例えば、アプリケーションのハンドラー登録前に既存のクライアントを設定します。

```rust
use durable_workflow::Worker;

let mut worker = Worker::new(client.clone(), "payments")
    .max_concurrent_workflow_tasks(1)
    .max_concurrent_activity_tasks(1);
```

ハンドラーを登録し、通常どおり `run()` または `run_until()` を起動してください。両方を一にしても、ワークフロータスク一つとリモートアクティビティタスク一つは同時に実行できます。クエリは別のポーリングレーンを使います。Worker のクローンは同時の `run_once()` 呼び出しを含めて容量を共有します。クローンを作っても独立した追加枠にはなりません。

ハートビートの空き容量は、入力・履歴の読み込み、コールバック実行、結果確定を含む実際の取得済みタスクに従います。空のロングポーリングは空き容量を残します。成功、失敗、拒否、キャンセルでローカルスロットを解放します。インラインのローカルアクティビティは**ワークフロータスク**のスロットを使い、リモートアクティビティプールを通りません。アクティビティ上限は複数ワークフローのインライン実行を別枠で制限しません。

ハンドラーは Tokio の async future であり、他の処理が進むよう実行権を譲る必要があります。ブロックする処理には `tokio::task::spawn_blocking` または別プロセスを使い、キャンセルと終了の境界を明示してください。並行数を増やしても CPU は分離されず、切り離されたスレッドがキャンセル可能になるわけでもありません。インストールした SDK の [Worker API](https://rust.durable-workflow.com/durable_workflow/struct.Worker.html) を参照してください。

## 受信したアクティビティのリトライ予算 {#activity-retry-info}

Rust SDK **4.8.0 以降**では、サービスモードのアクティビティハンドラーで `ActivityContext::retry_info()` を使えます。`Cargo.lock` でインストール済み crate を確認してください。上の独立したインストール指定は旧版の場合があります。返される `ActivityRetryInfo` は、元の `attempt_number()` と受信した `policy()` JSON を未知のフィールドも含めて保持します。この呼び出しの変更不能なスナップショットであり、コンテキストの変更可能な互換性フィールドには依存しません。

受信した予算は `attempt_limit()` と `is_last_configured_attempt()` で解釈します。

| 受信したリトライポリシー | `ActivityAttemptLimit` | 設定上の最終試行 |
| --- | --- | --- |
| 正の整数 `max_attempts: n` を持つオブジェクト | 初回を含む `Bounded(n)` | 元の試行番号が `n` 以上なら `Some(true)`、それ以外は `Some(false)` |
| `max_attempts: null` を持つオブジェクト | `Unlimited` | `Some(false)` |
| ポリシー省略、ルートの null、フィールド欠落、不正な上限 | `Unknown` | `None` |

試行番号が不正なゼロの場合も、ヘルパーは `None` を返します。ランタイムのスケジュール既定値は受信メタデータの証明にはなりません。公開済み Server 2.11.0 の明示的なポリシーなしの対照実行では、スナップショットが省略されるため、`Bounded(1)` を推定せず `Unknown` を返します。`policy()` はポリシー省略と受信した JSON null を区別しますが、どちらも無制限とは扱いません。 [通常インストールでの受け入れ検証](https://github.com/durable-workflow/sdk-rust/issues/135#issuecomment-6366200791)には、この対照実行と以下の例が含まれます。

設定上の最終試行でフォールバックを選ぶ、またはアプリケーションのアラートを記録するには、既存の Worker にハンドラーを登録します。

```rust
use durable_workflow::{json, Worker};

pub fn register_charge(worker: &mut Worker) {
    worker.register_activity("charge", |ctx, _| async move {
        let retry = ctx.retry_info();
        if retry.is_last_configured_attempt() == Some(true) {
            // Select a final-attempt fallback or record an application alert.
        }
        Ok(json!({"attempt": retry.attempt_number()}))
    });
}
```

`Some(false)` は次の実行を保証しません。再試行不可の失敗、キャンセル、ワークフローの終了、期限切れにより、設定した予算を使い切る前に処理が終わることがあります。このヘルパーはリトライの受け入れを変更せず、追加時間も与えません。

ローカルアクティビティと `testing::WorkflowEnvironment::run_activity` の直接呼び出しには、受信した Server スナップショットがなく、ポリシーは不明になります。新規の `run_workflow` テストでは、生成した履歴に記録するモデル上のスナップショットを公開します。このテスト仕様は、デプロイ済み Server がポリシーを送信する証明にはなりません。[ActivityRetryInfo](https://rust.durable-workflow.com/durable_workflow/struct.ActivityRetryInfo.html) と [ActivityAttemptLimit](https://rust.durable-workflow.com/durable_workflow/enum.ActivityAttemptLimit.html) を参照してください。

## 安定したアクティビティ識別子と外部処理の冪等性 {#activity-identity}

Rust SDK **4.9.0 以降**では、`ActivityContext` から最初に受信した識別子を取得できます。`Cargo.lock` でインストール済み crate を確認してください。上で独立に選択されているインストール指定は旧版の場合があります。これらのメソッドは、worker session のアクティビティも含め、元の claim から保持した不変の `Option<&str>` 値を返します。

| メソッド | 識別対象と用途 |
| --- | --- |
| `activity_execution_id()` | 再試行を通じて同じ論理アクティビティ実行を識別します。外部操作の重複排除に使います。 |
| `workflow_id()` | 所有元ワークフローの**インスタンス** ID。業務上の関連付けに使います。 |
| `run_id()` | 所有元ワークフローの **run** ID。その実行を関連付けるために使います。 |

特定の操作用のキーを作り、冪等な外部 API または永続的な副作用台帳へ渡してください。このハンドラーはキーを作るだけで、決済や外部の重複排除は実装しません。アクティビティ識別子がなければ、副作用の前に拒否します。代わりに、アプリケーションが明示的に安定した業務キーを渡すこともできます。

```rust
use durable_workflow::{json, ActivityError, Worker};

pub fn register_charge(worker: &mut Worker) {
    worker.register_activity("charge", |ctx, _| async move {
        let execution_id = ctx.activity_execution_id().ok_or_else(|| {
            ActivityError::new("MissingActivityIdentity", "Server activity identity is required")
                .non_retryable(true)
        })?;
        // Pass this key to an idempotent downstream API or durable effect ledger.
        let key = format!("payments:charge:{execution_id}");
        Ok(json!({
            "idempotency_key": key,
            "workflow_id": ctx.workflow_id(),
            "run_id": ctx.run_id(),
        }))
    });
}
```

旧 Server がこれらのフィールドを省略した場合、値は `None` のままです。欠けた論理アクティビティ ID を試行ごとの task ID、attempt ID、試行番号で代用しないでください。再試行時にキーが変わってしまいます。インラインの local activity には実際の親 workflow/run ID が渡ることがありますが、Server がコマンドを記録する前には Server の activity execution ID がありません。Server を使わないアクティビティテストにも受信した claim 識別子はありません。

安定したキーで副作用の重複を防げるのは、外部システムがそのキーを尊重する場合だけです。アクティビティ配送は引き続き少なくとも1回です。この API は外部処理の exactly-once、heartbeat 進捗の復元、再開可能なアクティビティ checkpoint を提供しません。

[ActivityContext の識別子メソッド](https://rust.durable-workflow.com/durable_workflow/struct.ActivityContext.html#method.activity_execution_id)と、ordinary/cooperative、local、worker-session の検証を含む[通常インストール 4.9.0 の記録](https://github.com/durable-workflow/sdk-rust/issues/139#issuecomment-6367230500)を参照してください。共通の契約は[実行保証](../constraints/execution-guarantees.md#service-activity-identity)にあります。

## 上限付きの失敗レポート {#bounded-failure-reports}

この上限には、**実際にインストールされた Rust SDK 4.10.1 以降**が必要です。worker の `Cargo.lock` を確認してください。新しい client や checkout だけでは、旧 worker は更新されません。対象は送信する失敗レポートであり、受信した履歴や他の業務 payload ではありません。

| フィールドまたは envelope | 上限 |
| --- | --- |
| マーカーを含む UTF-8 message | 62 KiB |
| サポートされる stack | 128 KiB |
| 任意の details・diagnostics・metadata を合わせたシリアライズ結果 | 64 KiB |
| 失敗リクエストの完全なエンコード済み body | 1 MiB |

実効 message 上限は、公開 Server の timeline 接頭辞用に元の64 KiBから2 KiBを予約します。JSON escape、マーカー、claim の識別情報、その他すべてのフィールドを body に含めて数えます。既知の輸送上限が低ければ、さらに小さくなります。小さなレポートの元の内容は保持します。

大きすぎるテキストには見えるマーカーが付きます。schema が対応する場合、既存の `diagnostics.sdk_failure_truncation` に元のバイト数と省略フィールドを記録します。diagnostics のない workflow/query-task schema や単純な command message では、統計を message のマーカーに含めます。Avro details は完全な有効 envelope/runtime reference のまま残すか、全体を省略してマークします。base64 を途中で切って壊しません。

元の例外 type、retry の判断、必須の claim 識別情報は保持します。低レベル consumer は公開された failure schema と `Client::fail_activity_task_with_failure`、`Client::fail_workflow_task_with_failure` を使えます。必須データが入らなければ `Error::FailureReporting` が明示的に拒否します。アプリの retry 結果を決めたり、小さい識別情報を捏造したりはしません。

ローカル失敗は、公開 Server の空白/NUL 正規化も含め、workflow コードが観測する前に制限します。最終リクエスト検査では、観測済みのローカル message や別の業務 payload を書き換えません。固定された入力が入らなければ reporting を拒否します。

この SDK 上限は、Core の派生 summary 保存修正、他 SDK、embedded 動作、Server イメージ採用の提供を証明しません。旧 worker では大きすぎる失敗を報告できない場合があります。[公開 source の方針](https://github.com/durable-workflow/sdk-rust/blob/dd58dd146f1337c3be24ad18fe65e3bb31d78b58/README.md#failure-report-limits)と[共通の失敗ガイド](../failures-and-recovery.md#rust-failure-report-limits)を参照してください。

## ローカルアクティビティ {#local-activities}

Rust SDK 3.1.0 は `Worker::local_activities(true)` で設定した Worker にインラインのローカル実行を追加します。通常のアクティビティ登録メソッドでコールバックを登録し、ワークフローコンテキストのローカルアクティビティメソッドを使います。再試行とタイムアウトの設定は[実行可能な例](https://github.com/durable-workflow/sdk-rust/blob/3.1.0/examples/local_activities.rs)と [LocalActivityOptions リファレンス](https://rust.durable-workflow.com/durable_workflow/struct.LocalActivityOptions.html)を参照してください。

Server はコールドリプレイのために終了結果を記録します。未コミットのローカル効果は Worker 喪失後に再実行される可能性があるため、冪等でなければなりません。非同期コールバックは Tokio に実行を譲る必要があります。ブロッキング処理には別プロセスの監督が必要です。インラインローカル実行と、準備された協調ローカル監督は別の Worker プロファイルを使います。

## Worker セッション {#worker-sessions}

`Worker::worker_sessions(true)` を有効にし、Worker が満たす要件を `capabilities(...)` で宣言します。`in_worker_session(WorkerSessionOptions::new(session_id))` でリモートアクティビティをルーティングします。アクティビティコンテキストは `worker_session()` で共有ハンドルを提供します。明示的なハンドルは Worker 登録後の `create()`、`renew()`、`close(reason)` に対応します。

`max_concurrent_worker_sessions(...)` で Worker セッション数、`max_concurrent_activities(...)` でセッション内のアクティビティ並行度を制限します。アイドルなハンドルは明示的に更新してください。アクティビティハートビートも保持者のリースを更新し、元の絶対 TTL は維持します。Tokio に実行を譲る非同期コールバックは、アプリケーションハートビートがなくても、ローカルで観測したリースまたは TTL の期限切れ時にドロップされます。

セッションリソースは保持者プロセス内にあります。代替プロセスは再構築が必要で、中断された外部効果には冪等性と試行のフェンシングが必要です。コミット済みの結果はコールバックを再実行せずにリプレイします。正常終了は登録解除前に保持中セッションを閉じます。ローカルアクティビティはセッションルーティングを使えません。

セッション対応は Rust SDK 3.2.0 からです。Server 2.5.1 以降を使ってください。[実行可能な例](https://github.com/durable-workflow/sdk-rust/blob/3.2.0/examples/worker_sessions.rs)は、2つの型付きアクティビティでプロセスローカルのキャッシュを再利用し、その世代を表示します。設定とライフサイクルメソッドは [WorkerSessionOptions](https://rust.durable-workflow.com/durable_workflow/struct.WorkerSessionOptions.html) と [WorkerSession](https://rust.durable-workflow.com/durable_workflow/struct.WorkerSession.html) を参照してください。

## 上限付きのスティッキー実行 {#bounded-sticky-execution}

`Worker::sticky_cache(StickyCacheOptions::new(capacity))` を有効にすると、不変のエンコード済み履歴を後続のリプレイ用に保持します。キャッシュは既定で無効です。`max_history_bytes(...)` と `ttl(...)` で保持する履歴と寿命を制限します。デコードとリプレイ用に追加のメモリを確保してください。

キャッシュはワークフロー、実行、ビルドの ID を使います。Worker 交換、期限切れ、追い出し、不正な履歴カーソルでは、完全な永続履歴へフォールバックします。終了したワークフローと停止した Worker はエントリーを破棄します。ワークフローコードは空のキャッシュでも正しくリプレイする必要があります。

対応は Rust SDK 3.4.0 と認定済み Server ベースラインからです。[設定リファレンス](https://rust.durable-workflow.com/durable_workflow/struct.StickyCacheOptions.html)、[実行可能な例](https://github.com/durable-workflow/sdk-rust/blob/3.4.0/examples/sticky_execution.rs)、[ポータブル Worker アフィニティガイド](./portable-worker-affinity.md)を参照してください。

## リリース済みリポジトリ例の準備 {#prepare-the-released-repository-example}

リポジトリの [`hello_world` 例](https://github.com/durable-workflow/sdk-rust/blob/main/examples/hello_world.rs)は、Rust Worker の登録、ワークフロー開始、シグナル送信、アクティビティ実行、アクティビティハートビート報告を行い、完了結果を待ちます。この例はアプリケーションクライアントと Worker を同一プロセスで動かすため、以下のアカウント不要の手順ではセルフホスト Server に接続します。プロビジョニング済み Cloud 名前空間は、別々のロール別認証情報を持つ任意の第2ランタイムです。

再現可能なソース演習には、認定済みの組に記録された正確な crate ソースを取得します。以下の値は機械可読の正本から生成されます。どちらの接続手順からも直接移動できるよう、例のディレクトリは絶対パスです。

<!-- docs-example id="rust.sdk.repository-source" -->
```bash
export DURABLE_WORKFLOW_RUST_VERSION=%%artifact.rustSdkVersion%%
export DURABLE_WORKFLOW_RUST_EXAMPLE_DIR="$PWD/durable-workflow-rust-${DURABLE_WORKFLOW_RUST_VERSION}"
git clone --depth 1 --single-branch --branch "$DURABLE_WORKFLOW_RUST_VERSION" \
  https://github.com/durable-workflow/sdk-rust.git "$DURABLE_WORKFLOW_RUST_EXAMPLE_DIR"
```

## セルフホスト Server で統合例を実行する {#run-the-combined-example-with-self-hosted-server}

変更していない `hello_world` 例は、同じ認証情報でワークフローコマンドと処理のポーリングを許可する認証ポリシーのセルフホスト Durable Workflow Server 向けに、単一トークンを受け入れます。

<!-- docs-example id="rust.sdk.self-hosted" -->
```bash
cd "$DURABLE_WORKFLOW_RUST_EXAMPLE_DIR"
DURABLE_WORKFLOW_SERVER_URL=http://localhost:8080 \
DURABLE_WORKFLOW_TOKEN=dev-token \
cargo run --example hello_world
```

この例はローカル Server クイックスタートが作成した `default` 名前空間を使います。既定の `rust-workers` タスクキューを変えるには `TASK_QUEUE` を使います。この手順に Cloud 参加や Cloud 認証情報は関係しません。

## 任意の第2経路: Durable Workflow Cloud に接続する {#optional-secondary-path-connect-to-durable-workflow-cloud}

管理ランタイムを最短で検証するには [Rust Cloud クイックスタート](./rust-cloud-quickstart.md)を使います。PHP と Python と同じ対称的な Sample App プレイグラウンドを使い、現在の安定版成果物を動的に選択し、正確な Worker 準備状態を検証し、完了結果を待ちます。

<ProductPromotion source="docs-v2-rust-sdk">
Cloud に参加済みですか。別々のロール別ランタイム認証情報で、プロビジョニング済み名前空間に対して共有 Rust プレイグラウンドを実行できます。
</ProductPromotion>

以下の低レベルな統合 SDK 例は、既存の Rust プロセスを適応させる際に有用です。Cloud が名前空間と2つのランタイム認証情報を作成したときに返した値をエクスポートします。

管理接続の境界は [Cloud 管理ランタイム](/docs/polyglot/cloud-control-plane)を参照してください。

<!-- docs-example id="rust.sdk.cloud.environment" -->
```bash
export DURABLE_WORKFLOW_RUNTIME_URL='https://your-runtime-url'
export DURABLE_WORKFLOW_RUNTIME_NAMESPACE='orders'
export DURABLE_WORKFLOW_CLIENT_TOKEN='dwr_client_credential'
export DURABLE_WORKFLOW_WORKER_TOKEN='dwr_worker_credential'
```

`$DURABLE_WORKFLOW_RUST_EXAMPLE_DIR/examples/hello_world.rs` で、既存の `server_url`、`token`、`Client::builder(...)` のセットアップを次の分離トークンのビルダー設定に置き換えます。

<!-- docs-example id="rust.sdk.cloud.client" -->
```rust
let runtime_url = std::env::var("DURABLE_WORKFLOW_RUNTIME_URL")
    .expect("DURABLE_WORKFLOW_RUNTIME_URL must be set");
let runtime_namespace = std::env::var("DURABLE_WORKFLOW_RUNTIME_NAMESPACE")
    .expect("DURABLE_WORKFLOW_RUNTIME_NAMESPACE must be set");
let client_token = std::env::var("DURABLE_WORKFLOW_CLIENT_TOKEN")
    .expect("DURABLE_WORKFLOW_CLIENT_TOKEN must be set");
let worker_token = std::env::var("DURABLE_WORKFLOW_WORKER_TOKEN")
    .expect("DURABLE_WORKFLOW_WORKER_TOKEN must be set");

let client = Client::builder(runtime_url)
    .namespace(runtime_namespace)
    .control_token(Some(client_token))
    .worker_token(Some(worker_token))
    .build()?;
```

次に通常どおり例を実行します。

<!-- docs-example id="rust.sdk.cloud.run" -->
```bash
cd "$DURABLE_WORKFLOW_RUST_EXAMPLE_DIR"
cargo run --example hello_world
```

例のワークフロー開始、シグナル、説明、結果の呼び出しは `control_token` を使います。`Worker` の登録、ポーリング、ハートビート、完了は `worker_token` を使います。両ロールは同じ Cloud 提供のランタイム URL、ランタイム名前空間、タスクキューを使いますが、認証情報は再利用しません。どちらの Cloud 認証情報も `.token(...)` に置き換えないでください。そのメソッドは、上のセルフホスト設定で使う汎用の単一トークンフォールバックです。

## Server が強制するワークフロータイムアウトで開始する {#start-with-server-enforced-workflow-timeouts}

Rust SDK は、開始プロセスの終了後も Server が強制するワークフロー期限のために `WorkflowStartOptions` と `Client::start_workflow_with_options` を提供します。実行全体のタイムアウトは continue-as-new 実行を含むワークフローインスタンス全体を対象とし、個別実行のタイムアウトは1つの実行を対象として新しい実行の開始時に再計算します。

<!-- docs-example id="rust.workflow-start-timeouts" -->
```rust
use durable_workflow::{json, Client, Result, WorkflowStartOptions};

async fn start(client: &Client) -> Result<()> {
    let handle = client.start_workflow_with_options(
        "orders.await-payment",
        "orders",
        "order-42",
        WorkflowStartOptions::new()
            .execution_timeout_seconds(300)
            .run_timeout_seconds(30),
        json!([{"order_id": "order-42"}]),
    ).await?;

    println!("workflow={} run={:?}", handle.workflow_id, handle.run_id);
    Ok(())
}
```

両値は秒単位の正の数で、個別実行のタイムアウトは実行全体のタイムアウトを超えられません。既存の便利メソッド `Client::start_workflow` は `WorkflowStartOptions::default()` を使い、実行全体のタイムアウトは3600秒、個別実行のタイムアウトは600秒です。Server の期限と continue-as-new の意味は[タイムアウト](/docs/features/timeouts)を参照してください。

これらはワークフローポリシーであり、HTTP や結果ポーリングのタイムアウトではありません。特に `WorkflowResultOptions::timeout` は、ローカルの `result()` 呼び出しの待機を止めるだけです。ワークフロー実行を閉じたりキャンセルしたり変更したりしません。呼び出し元は返された ID を検査し、再び待機できます。`WorkflowStartOptions` で設定した実行全体または個別実行の期限は永続的な Server 状態で、期限切れになると Server は終了結果 `timed_out` で実行を閉じます。

## 決定的な並列グループ {#deterministic-parallel-groups}

`WorkflowContext::parallel` と別名の `join` は、新しい Server コマンドを追加せず、アクティビティ、子ワークフロー、タイマー、混合グループ、ネストしたグループを合成します。`ParallelOperation` のコンストラクターは、木全体が判明するまで各末端操作を遅延させます。

```rust
use durable_workflow::{json, ChildWorkflowOptions, ParallelOperation};
use std::time::Duration;

let results = ctx.parallel(vec![
    ParallelOperation::activity("load-profile", json!(["customer-42"])),
    ParallelOperation::group(vec![
        ParallelOperation::child_workflow(
            "quote-shipping",
            ChildWorkflowOptions::new("shipping-workers"),
            json!(["customer-42"]),
        ),
        ParallelOperation::timer(Duration::from_secs(1)),
    ]),
]).await?;
```

すべての末端操作は、共有の安定したグループ ID と外側から内側への完全なパスを持ちます。成功結果はネストした入力の構造と順序を保持します。`Error::ParallelFailed` は型付きの末端原因、決定的なメンバーパス、グループパス、完了した兄弟操作を保持します。保留・完了履歴は再スケジュールせずにリプレイします。完全な重複や遅い完了が、選択された位置に対応する結果を変えることはありません。

## 永続的な最初の完了の選択 {#durable-first-completion-selection}

`WorkflowContext::select` と `select_keyed` は、アクティビティ、子ワークフロー、タイマー、シグナル、条件待機、ネストした通常のグループをまとめて開始し、ランタイムが記録した勝者から再開します。

```rust
use durable_workflow::{json, ParallelOperation, SelectionKey};
use std::time::Duration;

let selected = ctx.select_keyed(vec![
    ("resolver", ParallelOperation::activity("resolve-request", json!([request_id]))),
    ("input", ParallelOperation::signal("resolution.received")),
    ("deadline", ParallelOperation::timer(Duration::from_secs(2))),
]).await?;

if selected.key == SelectionKey::Name("deadline".to_string()) {
    if let Some(resolver) = selected.handle(&SelectionKey::Name("resolver".to_string())) {
        resolver.cancel().await?;
    }
}
```

`SelectionResult` は安定したキー・インデックス、操作種別と ID、型付きの値または失敗、各メンバーの `DurableOperationHandle` を保持します。非勝者は、後でワークフローコードが `handle.await_result()` または `handle.cancel()` を await しない限り続行します。キャンセル Future の解決値は unit です。キャンセルが勝ったことを証明するのは、コミットされた `SelectionOperationCancelled` 履歴だけです。リプレイは印のない要求を越えて進み、先にコミットした完了を `await_result()` が引き続き返します。再起動とリプレイは保存済みの勝者を使い、後続や重複した終了イベントで勝者が変わることはありません。

## Saga 補償 {#saga-compensation}

対応する順方向のアクティビティが完了してから補償を登録し、順方向の結果を `Saga::finish` へ渡します。

```rust
let mut saga = ctx.saga();
let outcome = async {
    let flight = ctx.activity("trip.reserve-flight", json!([])).await?;
    saga.add_compensation("trip.cancel-flight", json!([flight]))?;

    let hotel = ctx.activity("trip.reserve-hotel", json!([])).await?;
    saga.add_compensation("trip.cancel-hotel", json!([hotel]))?;

    ctx.activity("trip.charge", json!([])).await?;
    Ok(json!({"status": "booked"}))
}.await;

saga.finish(outcome).await
```

処理された失敗は、既存のアクティビティコマンドを登録の逆順で1つずつ補償実行します。補償は最初の失敗で止まります。`Error::SagaCompensationFailed` は、両方の型付きエラー、補償アクティビティ型、その登録順序を再起動とリプレイを通じて保持します。即時終了する `cancel_workflow` は補償のためにワークフローコードを再開しません。

## 決定的な副作用とバージョンマーカー {#deterministic-side-effects-and-version-markers}

Rust SDK は `WorkflowContext::side_effect` で小さな非決定的値を記録し、`WorkflowContext::uuid_v4` で決定的な UUIDv4 値を導出します。コールドリプレイはコールバックを再呼び出しせず、記録した値をデコードします。マーカーの順序変更、欠落、重複、コーデック非互換は型付き `Error::NonDeterministicReplay` を返します。

ロールアウト中に古いワークフロー分岐と新しい分岐のリプレイ互換性を保つには `WorkflowContext::get_version(change_id, min_supported, max_supported)` を使います。新しい実行は `max_supported` を記録し、既存の実行は永続マーカーを再利用します。`patched(change_id)` は真偽値形式のロールアウトを提供し、`deprecate_patch(change_id)` は古い分岐の処理完了後もマーカーを維持します。共有の永続的意味は[副作用](/docs/features/side-effects/)と[バージョニング](/docs/features/versioning/)を参照してください。

## Rust の決定性ルール {#rust-determinism-rules}

リプレイでは、記録済みの入力と履歴に対して、同じ順序で同じ永続コマンドを生成する必要があります。Rust の通常のコレクション、時計、並行処理のプリミティブは、この契約を自動では保ちません。

| ワークフローコードのパターン | 永続的な代替手段 |
| --- | --- |
| `HashMap` を走査しながらスケジュール | 先にキーをソートするか、`BTreeMap` を使用します。 |
| システム時刻、`thread_rng`、新しい UUID | `ctx.side_effect(...)` でスナップショットを記録するか、アクティビティを使用します。 |
| `tokio::time::sleep` または `std::thread::sleep` | `ctx.sleep(...)` または `ctx.start_timer(...)`。 |
| `tokio::select!` または通常の future の競合 | `ctx.select(...)` または `ctx.select_keyed(...)`。 |
| 追跡されない並行の永続呼び出し | 安定した入力順序で `ctx.parallel(...)`。 |
| ネットワーク、ファイルシステム、変化する外部 I/O | 登録済みのアクティビティ。 |
| デプロイ時に既存コマンドの順序を変更 | 安定した `ctx.get_version(...)` 分岐を使い、記録済み履歴でテストします。 |

アクティビティの外部副作用には引き続き冪等性が必要です。決定性だけでは、支払いやファイル書き込みの重複は安全になりません。[冪等性と決定性](../constraints/idempotent-vs-deterministic.md)を参照してください。

## オフラインテストとリプレイ {#offline-testing-and-replay}

これらの API には Rust SDK **4.5.0 以降**が必要です。`Cargo.lock` を確認してください。上記の別途選択したインストール構成では、API のない古い crate が選ばれる場合があります。[4.5.0 の通常インストール検証](https://github.com/durable-workflow/sdk-rust/issues/105#issuecomment-6362112580)では、Server 不要の 12 件の検証、このコンパイル済みの例、実際の Server 2.11.0 のエクスポート/リプレイを確認しています。新しい Server/SDK 構成を選択するものではありません。

### アクティビティとワークフローの単体テスト {#rust-activity-workflow-tests}

`testing::WorkflowEnvironment` は、登録済みワークフローとアクティビティを現在のプロセスで実行します。`from_worker(worker)` でアプリケーションの登録を再利用するか、直接コールバックを登録してください。`worker_mut()` から通常の型付き登録 API を使用できます。モックは明示的です。実際のアクティビティコールバックは自身のコードを実行するため、外部副作用を意図的に置き換えてください。

検証済みの手順では、`durable-workflow = "=4.5.0"`、`macros`、`rt-multi-thread`、`time` を有効にした Tokio と、以下のエクスポートヘルパー用の `serde_json = "1"` を使います。公開例を `examples/workflow_testing.rs` として保存し、`cargo run --example workflow_testing` を実行してください。

```rust
//! Run with `cargo run --example workflow_testing`; no Server is required.
use durable_workflow::{
    json,
    testing::{WorkflowEnvironment, WorkflowHistory},
    Result,
};

#[tokio::main]
async fn main() -> Result<()> {
    let mut env = WorkflowEnvironment::new()?;
    env.register_activity("greet", |_, args| async move {
        Ok(json!(format!(
            "Hello, {}!",
            args[0].as_str().unwrap_or("friend")
        )))
    });
    env.register_workflow("hello", |ctx, args| async move {
        ctx.activity("greet", args).await
    });

    // An activity unit test executes the real callback and argument adapters.
    assert_eq!(
        env.run_activity("greet", "Ada").await?,
        json!("Hello, Ada!")
    );
    // A workflow unit test may replace activity callbacks explicitly.
    env.mock_activity("greet", |_, args| async move {
        Ok(json!({"greeting_for":args[0]}))
    });
    assert_eq!(
        env.run_workflow("hello", "Ada").await?,
        json!({"greeting_for":"Ada"})
    );

    // Replay executes the same registered workflow without running activities.
    // In a deployment test, read the JSON produced by dw workflow:history-export
    // or Client::export_workflow_history instead of this captured test history.
    let history = WorkflowHistory::from_export(env.last_history().unwrap().export())?;
    assert!(env.replay(&history)?.completed);
    println!("activity, workflow and offline replay passed");
    Ok(())
}
```

直接の `run_activity` は 1 回の試行を実行します。`run_workflow` では、終端の失敗をワークフローコードに渡す前に、記録されたリトライポリシーを適用します。実際またはモックのリモート/ローカルアクティビティの失敗は、例外型、試行番号、再試行不可の情報を持つ型付き `Error::ActivityFailed` になります。未捕捉のワークフローエラーは元の Rust バリアントを保持します。ハートビートはローカルで記録します。JSON で元の Avro 値を保てない場合は `*_avro_value` 版を使用してください。

### エクスポートした実行をリプレイ {#rust-replay-export}

候補のワークフローを登録し、`dw workflow:history-export` または `Client::export_workflow_history(workflow_id, run_id).await?` の自己完結した JSON バンドルを読み込みます。このヘルパーを上記の例に追加してください。同じ import を使用し、完了済みの検証実行を想定しています。

```rust
fn replay(env: WorkflowEnvironment) -> std::result::Result<(), Box<dyn std::error::Error>> {
let export = serde_json::from_slice(&std::fs::read("workflow-history.json")?)?;
let history = WorkflowHistory::from_export(export)?;
let report = env.replay(&history)?;
assert!(report.completed); // A running snapshot can remain durably pending.
Ok(())
}
```

生の履歴では、**すべてのページ**を結合し、`WorkflowHistory::from_history("hello", original_input, response)` を使います。元のタスクキューが欠けていれば指定してください。元の入力と記録済み結果を保持します。削除/伏せ字化したペイロード、未解決の外部参照、残ったページトークンは拒否されます。SDK のエクスポートヘルパーはダウンロード中にペイロード参照を解決します。リプレイ自体は Server に接続せず、アクティビティコールバックも実行しません。

リプレイは Worker のデコード、副作用、バージョンマーカー、記録済み select 解決の処理を使います。変更や並べ替えたコマンドには `Error::NonDeterministicReplay(ReplayFailure)` が返り、`sequence`、`expected`、`actual` を示します。インストール済みパッケージの実エクスポート検証では、シーケンス 3 でアクティビティ変更を検出します。スナップショットを越える新規コマンドも失敗します。未終了のスナップショットは完了ではなく、永続的に待機中のプレフィックスを示す場合があります。期待する結果をアサートし、新しい分岐は新規のプロセス内実行と統合テストで確認してください。[公開済みのリプレイ検証](https://github.com/durable-workflow/sdk-rust/blob/4.5.0/tests/workflow_testing.rs)を参照してください。

### 実行の制限 {#rust-test-execution-limits}

タイマーとリトライの待ち時間は省略されます。並列コールバックはコマンド順に実行されるため、この環境はスケジュール競合や性能をテストしません。キュー、リース、デプロイの動作もシミュレートしません。コールバックは制御を譲る必要があります。`max_steps(n)` は永続ターン、コマンド、試行を制限し（既定 10,000）、`tokio::time::timeout` は非同期コールバックの時間を制限できます。

アクティビティのタイムアウトの模擬、**新たな select 競合**、シグナル、子、サービス、セッション、continue-as-new、キャンセルには統合テストが必要です。未対応コマンドは `Error::Testing` を返します。新しい select 競合は模擬できなくても、記録済みの勝者はリプレイできます。これらの境界には実ランタイムのテストを残してください。[テスト API](https://rust.durable-workflow.com/durable_workflow/testing/index.html)と[公開済みの実行契約](https://github.com/durable-workflow/sdk-rust/blob/4.5.0/README.md#testing-without-a-server)を参照してください。

## エントリの互換性と復旧 {#entry-compatibility-and-recovery}

**公開済みのサポートです。** Rust SDK 3.5.6 で以下のエントリ保護が導入され、Server 2.9.9 でルーティングと復旧がサポートされました。これらは機能の最小対応バージョンです。セキュリティ修正を含む最新の安定版をインストールしてください。

`Worker::register_typed_workflow` と型付きの状態保持アダプターは、アプリケーションハンドラーや状態ファクトリーを呼ぶ前に記録済み入力をデシリアライズします。入力構造に互換性がない場合、`fail_workflow` を送らず、タスク失敗型 `WorkflowEntryArgumentsMismatch` と理由 `workflow_entry_arguments_mismatch` を報告します。ワークフロー入力に対する SDK 内のエラーは `Error::HandlerType` であり、記録済みの値ではなくワークフローと期待する Rust 型を示します。生のワークフローハンドラーに、新たな Rust シグネチャ検査が追加されるわけではありません。進入に成功したアプリケーションハンドラーが返すエラーは、その文面がエントリ診断に似ていても、通常のワークフロー失敗として扱われます。

管理対象 Worker は `workflow_entry_arguments_validation` を自動的に通知します。検証済みの Server は失敗したタスクをリプレイブロック状態で保持し、元の実行を非終端のままにします。古いランタイムはタスクを再試行する場合があるため、SDK だけでは復旧契約全体は成立しません。

`Client::describe_workflow_run(workflow_id, run_id)` で元の実行を、実行指定のデバッグエンドポイントでタスク理由を調べます。互換性のある入力デコードとコードを復元してから、[復旧手順](../failures-and-recovery.md#service-entry-recovery)の実行指定 HTTP 修復ルートを使ってください。この crate には `repair_workflow` の便利メソッドはありません。元の入力、履歴、名前空間、キュー、ビルド、期限を維持し、互換ハンドラー内で永続コマンドの変更をバージョン分岐して、コールドリプレイを検証します。[定義ルーティング](./worker-compatibility-routing.md#definition-fingerprint-evolution)も参照してください。

## キャンセル、終了、終了結果の処理 {#cancel-terminate-and-handle-terminal-outcomes}

サービスモードの `cancel_workflow` と `terminate_workflow` はともに実行を即時に閉じます。異なる終了結果を記録しますが、どちらもワークフローコードにクリーンアップを依頼しません。時間を制限したワークフロークリーンアップには、協調する Worker と `request_cancellation()` を使います。操作ポリシー、監督、復旧は[協調キャンセルガイド](/docs/polyglot/cancellation)を参照してください。

```rust
use durable_workflow::{Client, WorkflowCommandOptions};

# async fn cancel(client: &Client) -> durable_workflow::Result<()> {
client.cancel_workflow(
    "order-42",
    WorkflowCommandOptions::new()
        .reason("customer withdrew the order")
        .request_id("cancel-order-42"),
).await?;
# Ok(())
# }
```

インスタンス対象の `cancel_workflow` と `terminate_workflow` は、Server 上の現在の実行を解決します。選択実行の安全性には `cancel_workflow_run`、`terminate_workflow_run`、またはハンドルの `cancel_selected_run`、`terminate_selected_run` メソッドを使います。選択した実行が古い場合、`Error::WorkflowCommandRejected` は安定した理由 `historical_run_command_rejected` と、ワークフロー ID、実行 ID、対象スコープ、HTTP ステータス、レスポンス本文を公開します。

成功した `WorkflowHandle::result` 呼び出しは、引き続きデコード済み JSON 値を返します。それ以外の結果は型付きの終了バリアントでマッチしてください。表示テキストではなく、安定した reason と category フィールドで分岐します。

<!-- docs-example id="rust.typed-workflow-timeouts" -->
```rust
use durable_workflow::{Error, WorkflowHandle, WorkflowResultOptions};

# async fn wait(handle: WorkflowHandle) -> durable_workflow::Result<()> {
match handle.result(WorkflowResultOptions::default()).await {
    Ok(value) => println!("completed: {value}"),
    Err(Error::WorkflowCancelled(outcome)) => {
        println!("cancelled {:?}: {}", outcome.run_id, outcome.reason);
    }
    Err(Error::WorkflowTerminated(outcome)) => {
        println!("terminated: {}", outcome.reason);
    }
    Err(Error::WorkflowFailed(outcome)) => {
        println!("failure {:?}: {:?}", outcome.failure_id, outcome.exception_class);
    }
    Err(Error::WorkflowTimedOut(outcome)) => match (
        outcome.reason.as_str(),
        outcome.failure_category.as_deref(),
    ) {
        ("result_wait_timeout", Some("client_timeout")) => {
            println!(
                "caller deadline for {} / {:?}; the run may still be open",
                outcome.workflow_id, outcome.run_id,
            );
        }
        ("execution_timeout" | "run_timeout", category) => {
            println!(
                "server timeout for {} / {:?}: reason={} category={:?}",
                outcome.workflow_id, outcome.run_id, outcome.reason, category,
            );
        }
        (reason, category) => {
            println!("other typed timeout: reason={reason} category={category:?}");
        }
    }
    Err(error) => return Err(error),
}
# Ok(())
# }
```

各終了結果はワークフローと実行の ID を持ちます。Server が提供する場合、公開 reason、失敗の category と ID、例外の type と class、再試行不可状態、メッセージ、例外ペイロードも保持します。ローカル待機期限は reason が `result_wait_timeout`、category が `client_timeout` です。Server タイムアウトは終了状態 `timed_out` の実行で、安定した reason は `execution_timeout` または `run_timeout` です。

どちらの開始メソッドが返すハンドルも、選択した `run_id` を保持します。`WorkflowHandle::result` はその実行固有ルートを説明するため、同じワークフロー ID を新しい実行に再利用しても、待機が黙って新しい実行の結果を報告することはありません。ログ、メトリクス、再試行記録には `outcome.workflow_id` と `outcome.run_id` の両方を残し、現在の実行を意図的に追跡する場合だけインスタンスレベルの検索を使ってください。

## ワークフロー更新 {#workflow-updates}

Rust はアプリケーションクライアント、選択ハンドル、Worker 記述の各役割で永続更新に対応します。JSON 互換値には `Client::update_workflow` または `WorkflowHandle::update`、明示的な型付き Avro 値には対応する `update_workflow_avro_value` または `update_avro_value` を使います。

Worker は `Worker::register_update` で名前付きハンドラーを登録します。Avro 値を直接受け取り返すハンドラーには `register_update_avro_value` を使います。更新は永続的で結果を伴うワークフロー変更です。送信後に結果を待たないシグナルや、読み取り専用でリプレイされるクエリとは別です。

## ペイロードエンベロープ {#payload-envelope}

ワークフロー入力、シグナル、アクティビティ、クエリ、結果は、`codec` とエンコード済み `blob` から成る公開 `PayloadEnvelope` 契約を使います。SDK の既定の `avro` 経路は、宣言した `apache-avro` 依存関係とプラットフォームの固定バージョン付き Value スキーマを使います。blob を独自実装したり、実装固有のレコードでエンベロープを置き換えたりしないでください。

<!-- docs-example id="rust.avro-payload-envelope" -->
```rust
use durable_workflow::{decode_payload, json, PayloadEnvelope, Result, Value};

fn round_trip() -> Result<()> {
    let envelope = PayloadEnvelope::avro(&json!({"order_id": "order-42"}))?;
    assert_eq!(envelope.codec, "avro");

    let decoded: Value = decode_payload(&envelope)?;
    assert_eq!(decoded["order_id"], "order-42");
    Ok(())
}
```

`start_workflow` と `start_workflow_with_options` は、シリアライズ可能な入力にこのエンベロープを自動適用します。プログラムが直接エンベロープを交換する必要がある場合だけ公開ヘルパーを使います。

## アクティビティのハートビート {#activity-heartbeats}

リモートアクティビティでは、`ActivityContext::heartbeat(...).await` は `Result<ActivityHeartbeatResponse>` を返します。エラーを伝播し、成功応答では `should_stop()` を確認してください。直接リクエストの失敗には `Error::Transport` と、型付き HTTP 拒否の `Error::ActivityTaskRejected` があります。協調的な監督下のタスクは、ハートビートや所有権の確認に失敗すると `Error::ActivityExecutionAbandoned` を返す場合があります。権限を失ったら外部処理を止めてください。コールバックが必ずアプリケーションの後始末に到達するとは考えないでください。

最初のハートビート期間はランタイムのタスク取得から始まり、タスク配信より前です。記録されたハートビートはランタイムの時刻を使い、呼び出し元の受信時刻は使いません。設定されたタイムアウトに十分な余裕を残して間隔を選び、各処理や I/O の上限を設け、中断、リクエストの遅延、通信の再試行に余裕を確保してください。[送信間隔の指針](../features/heartbeats.md#heartbeat-cadence-and-receipts)に従います。進捗ハートビートの自動送信や一括送信のスケジュールは保証されません。

キャンセル時は、まだ実行可能ならプロセス内のリソースを解放し、速やかに戻ります。永続状態は遅い完了を拒否し、キャンセルや終了済みの実行を成功に変えません。管理された Worker は、その確定的な拒否や再起動の後もポーリングを続けます。ハートビートの成功は、外部作用のコミットや置換試行の再開可能なチェックポイントではありません。

Server イメージ、認証、本番トポロジーについては [Server セットアップガイド](/docs/polyglot/server)へ進んでください。
