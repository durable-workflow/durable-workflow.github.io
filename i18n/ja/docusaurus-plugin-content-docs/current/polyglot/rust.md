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
