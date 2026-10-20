---
sidebar_position: 4
title: Rust Cloud クイックスタート
description: プロビジョニング済みの Durable Workflow Cloud 名前空間に対して、共有 Sample App の Rust プレイグラウンドを実行します。
tags:
  - Rust
  - Cloud
  - quickstart
  - workers
keywords:
  - Rust Cloud クイックスタート
  - 名前空間ランタイム URL
  - Rust Worker
  - Sample App プレイグラウンド
---

# Rust Cloud クイックスタート {#rust-cloud-quickstart}

:::caution 制限付き早期アクセス

Durable Workflow Cloud は制限付き早期アクセスとして利用できます。Cloud が名前空間と2つのロール別ランタイム認証情報をプロビジョニングした後にだけ、このガイドを使ってください。一般に利用できる Rust の手順に Cloud は必要ありません。[Rust SDK ガイド](./rust.md)から始めるか、プレイグラウンドの既定のローカルランタイムに対して `scripts/playground rust` を実行してください。

:::

Sample App は PHP、Python、Rust に対して対称的な1つのプレイグラウンドを公開します。このページでは Rust を選び、ランタイムの対象だけを変更します。対応する [PHP](./php.md) と [Python](./python.md) SDK の手順は、同じコマンドで `php` または `python` を使います。[Sample App プレイグラウンド契約](https://github.com/durable-workflow/sample-app/blob/main/README.md#symmetric-sdk-playground)は3つの選択肢すべてを記載します。

プレイグラウンドは Sample App の機械管理メタデータから現在の安定版成果物バージョンを解決します。これらのコマンドにバージョン番号をコピーしたり、別の SDK インストール手順を追加したりせず、生成されたバージョンを使ってください。

## 1. 準備済みの Sample App を開く {#1-open-the-prepared-sample-app}

[Sample App の `main` ブランチから Codespace を作成し](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main)、セットアップ完了を待って、リポジトリのルートでターミナルを開きます。準備済みイメージには、共有プレイグラウンドが必要とする SDK ツールチェーンと `dw` が入っています。

Cloud はランタイム URL、ランタイム名前空間、2つのロール認証情報を提供します。アプリケーションのタスクキューを選び、次のプレースホルダーを対応する値に置き換えてからエクスポートします。

```bash
export DURABLE_WORKFLOW_RUNTIME_URL='<provisioned-runtime-url>'
export DURABLE_WORKFLOW_RUNTIME_NAMESPACE='<provisioned-runtime-namespace>'
export DURABLE_WORKFLOW_CLIENT_TOKEN='<client-runtime-credential>'
export DURABLE_WORKFLOW_WORKER_TOKEN='<worker-runtime-credential>'
export DURABLE_WORKFLOW_TASK_QUEUE='<rust-task-queue>'
```

ランタイム URL は Cloud が返す名前空間ランタイムのルートです。クエリ、フラグメント、末尾の `/api` がない絶対 HTTPS URL でなければなりません。SDK と CLI が独自の API ルートを追加します。ランタイム名前空間は URL とともに返される独立した値であり、URL のパスから推測する名前ではありません。

クライアント認証情報はワークフローの開始、説明、読み取りに使います。Worker 認証情報はタスクの登録、ポーリング、ハートビート、完了に使います。この1コマンドが両方の子プロセスを起動しても、両者は異なるロール別シークレットである必要があります。Cloud 管理キーは名前空間と認証情報を管理するものです。どちらのランタイム認証情報としてもエクスポートや受け渡しをしないでください。

## 2. Rust の手順を実行する {#2-run-the-rust-journey}

共有の外部ランタイム契約を実行します。

```bash
scripts/playground rust --runtime managed \
  --runtime-url "$DURABLE_WORKFLOW_RUNTIME_URL" \
  --namespace "$DURABLE_WORKFLOW_RUNTIME_NAMESPACE" \
  --task-queue "$DURABLE_WORKFLOW_TASK_QUEUE"
```

コマンドは呼び出し元が所有するソースを置き換えず、`.playground/rust` の不足ファイルのひな形を作ります。何かを起動する前に、有効なワークフロー型、アクティビティ型、キュー、Worker コマンド、クライアントコマンド、入力、期待結果を表示します。Worker は Worker 認証情報だけを受け取ります。その正確な登録が見えてから、クライアントはクライアント認証情報だけを受け取ります。

登録待機は60秒に制限されます。プロセス起動だけを準備完了とみなさないでください。コマンドが次のようなチェックポイントを表示してから進めます（ID は例です）。

```text
Worker ready: target=managed runtime_url=<provisioned-runtime-url> namespace=<provisioned-runtime-namespace> id=<worker-id> queue=<rust-task-queue> workflow_type=sample-app.playground.rust.authored-workflow activity_type=sample-app.playground.rust.authored-activity
```

同じコマンドがワークフローを1つ開始し、SDK クライアントの結果を最大120秒待ち、`dw` で `status=completed` を確認し、必要なワークフローとアクティビティの履歴を検査します。成功結果の例は次のとおりです。

```text
Completed rust workflow <workflow-id>: {"greeting":"Hello, Durable Workflow, from the Sample App Rust playground","input":{"name":"Durable Workflow"},"activity_runtime":"rust","workflow_runtime":"rust"}
```

最後の `Playground success` 行は、認証情報の値を出さずに、ランタイムの対象、名前空間、キュー、登録した型、期待結果の構造を再表示します。コマンドは `storage/app/playground-rust-evidence.json` に、選択した成果物バージョン、正確な登録、ワークフロー・実行 ID、`completed` ステータス、結果、履歴イベント型も書き込みます。プロビジョニング済み名前空間の運用サーフェスは引き続き Managed Waterline です。管理ランタイムの手順はローカルの Server や Waterline を起動しません。

## 範囲を絞った診断 {#bounded-diagnosis}

60秒以内に `Worker ready` チェックポイントが出ない場合、エラーの上に表示された有効な契約から確認します。

- **キューの不一致:** ランナーは `--task-queue` へ渡した正確な値を問い合わせます。Cloud がそのキューを受け入れ、表示された登録が同じ値を使っていることを確認し、同じコマンドを再実行します。
- **型の不一致:** エラーは Worker が広告すべきワークフロー型とアクティビティ型を示します。有効な契約と比較してください。呼び出し元が所有するファイルに古い固定登録があれば更新するか、`--source "$HOME/durable-rust-worker"` を使って新しいディレクトリで現行のひな形を検証します。
- **認証情報のロール不一致:** 登録前の認可エラーは Worker 認証情報、実行の説明や開始中の認可エラーはクライアント認証情報を示します。値を交換したり、どちらかを Cloud 管理キーに置き換えたりしないでください。
- **ランタイムの不一致:** 両ロールはプロビジョニングされた正確なランタイム URL とランタイム名前空間を使う必要があります。末尾の `/api` を取り除き、Cloud 管理 URL やセルフホスト Server URL に置き換えないでください。

登録に成功して完了に失敗する場合、表示されたワークフロー・実行 ID を保持します。Managed Waterline で選択した実行を検査し、保留中のワークフロー型またはアクティビティ型とタスクキューを有効な契約と比較します。別の実行を開始する前に不一致を修正してください。保持された証跡パスと制限付き Worker 出力は、クライアント結果、永続ステータス、期待結果、必要履歴のどの検査が失敗したかを示します。

より広い [Rust SDK ガイド](./rust.md)に戻るか、個々の型とメソッドには生成された [Rust API リファレンス](https://rust.durable-workflow.com/durable_workflow/)を使ってください。
