---
sidebar_position: 3
title: Cloud 管理ランタイム
description: Cloud プラン、測定済みワークフロー容量、請求と可用性を比較し、PHP、Python、Rust Worker を管理名前空間に接続します。
tags:
  - cloud
  - managed-runtime
  - polyglot
  - operations
keywords:
  - Durable Workflow Cloud
  - 名前空間ランタイム URL
  - ランタイム認証情報
  - 利用者が動かす Worker
  - プライベートネットワーク
  - 単一リージョン管理ランタイム
  - 複数リージョン管理ランタイム
---

# Cloud 管理ランタイム {#cloud-managed-runtime}

Durable Workflow Cloud は管理されたオーケストレーションサービスです。Cloud はホストされたコントロールプレーンとオーケストレーションランタイムの両方を運用し、ワークフロー状態、履歴、スケジュール、タスクキュー、リース、永続的な可視性を含みます。利用者はプロビジョニングされた Cloud 名前空間に対して SDK クライアントと Worker を動かします。

セルフホストとは別です。セルフホストの Durable Workflow Server は独立して動作し、Cloud に接続されることはありません。

## プランと料金 {#plans-and-pricing}

ワークフローの意味上の操作ではなく、プロビジョニングした容量に対して支払います。各名前空間は分離した管理ランタイムを受け取り、利用者の PHP、Python、Rust Worker は利用者自身の環境で動きます。現在のプロビジョニング可否は [Cloud 料金](https://cloud.durable-workflow.com/pricing)とダッシュボードで確認してください。

Cloud Dev は現在利用できます。4つの HA プランは認定中で、購入やプロビジョニングはまだできません。以下の料金、容量、可用性、SLA 条件は予定条件であり、現在の購入オファーではありません。

| プラン | ランタイム容量 | 含まれる永続ストレージ | 可用性 | 料金（USD） |
| --- | --- | --- | --- | --- |
| Cloud Dev | 1 vCPU、1 GB RAM | 5 GB | 単一ホスト、SLA なし | $0.075/時、稼働月最低 $2、月額上限 $50 |
| Cloud Standard | 2 vCPU、4 GB RAM | 25 GB | 予定: 単一リージョン HA、99.99% SLA | $0.45/時、稼働月最低 $10、月額上限 $300 |
| Cloud Multi-Region | 2 vCPU、4 GB RAM | 25 GB | 予定: 複数リージョン HA、99.99% SLA | $0.525/時、稼働月最低 $13、月額上限 $350 |
| Cloud Business | 4 vCPU、8 GB RAM | 100 GB | 予定: 単一リージョン HA、99.99% SLA | $0.90/時、稼働月最低 $20、月額上限 $600 |
| Cloud Business Multi-Region | 4 vCPU、8 GB RAM | 100 GB | 予定: 複数リージョン HA、99.99% SLA | $1.125/時、稼働月最低 $28、月額上限 $750 |

容量は管理ランタイムのコンポーネントを対象とし、利用者の Worker 計算資源は含みません。予定の HA プランでは複製と待機系容量が料金に含まれます。表はレプリカを合算して追加のワークフロー実行容量としていません。すべてのプランに Managed Waterline、基本的な暗号化バックアップ、アップグレード、安定したランタイム URL を含みます。

プロビジョニングされたランタイムは、有効化からプロビジョニング解除までのランタイム時間を分単位で計測して課金します。最低額と上限は UTC 暦月ごと、ランタイム購入単位に適用します。プロビジョニング済みのアイドル時間も課金対象です。プロビジョニング時間がない月のランタイム料金はありません。新しい購入には独自の最低額と上限があります。サービス管理の修復や復旧ではリセットしません。Stripe は累積使用量を毎月請求します。料金に適用税は含みません。

ストレージは含まれる割り当てに固定されます。別売り追加ストレージ、自動容量増加、ストレージ超過料金はありません。容量がさらに必要なら、上限に達する前に[より大きいランタイムプランを要求](https://cloud.durable-workflow.com/contact)してください。単一リージョンから複数リージョンへ移るだけではストレージは増えません。容量のアップグレードには請求変更だけでなく実際のランタイム変更が必要で、現在はサポートと調整して行います。ネットワーク使用量は計測していますが、現在は課金せず、無制限でもありません。

プランの選択は [Cloud 料金](https://cloud.durable-workflow.com/pricing)を参照してください。より大きな容量、異なる接続、SSO、エンタープライズサポート、独自の可用性要件は[お問い合わせ](https://cloud.durable-workflow.com/contact)ください。

## 管理サービスの境界 {#managed-service-boundary}

利用者に見える境界は1つの Cloud 名前空間です。

```text
Cloud organization
  project
    environment
      namespace
        stable runtime URL
        client runtime credential  ---> workflow starts and commands
        worker runtime credential  ---> registration, polling, and completion

Cloud-operated runtime
  workflow state and history
  schedules and task queues
  leases, matching, and visibility
  Managed Waterline
```

Cloud は名前空間のプロビジョニング、ランタイム運用、永続化、配置、ランタイムの健全性、復旧、その名前空間の Managed Waterline サーフェスを所有します。利用者はアプリケーションコード、ワークフロー・アクティビティ実装、Worker を動かすプロセスを所有します。Cloud 利用者は別の Waterline サービスをデプロイしません。

名前空間の HTTPS エンドポイントは管理ランタイムへ直接接続します。SDK トラフィックは Cloud Web サイト・コントロールプレーンアプリケーションをプロキシしません。返されたランタイム URL は `/api` を付けずそのまま使います。SDK と CLI が API パスを構築します。管理 API 呼び出しは引き続き `https://cloud.durable-workflow.com/api/v1` を使います。

Cloud 管理とランタイムトラフィックは異なる認証情報を使います。

- Cloud API キー（`dwc_...`）はプロジェクト、環境、名前空間、請求、ランタイム認証情報のライフサイクルを管理する。
- クライアントランタイム認証情報（`dwr_...`）は1つの管理名前空間でワークフローを開始・制御する。
- Worker ランタイム認証情報（`dwr_...`）はその名前空間で Worker を登録し、タスクをロングポーリングし、ハートビートを送り、処理結果を確定する。

Cloud API キーは名前空間ランタイム URL で受け入れません。ランタイム認証情報は1つの名前空間とロールに限定され、作成時だけ返され、その後の一覧・監査レスポンスには含みません。

Cloud オンボーディングで CLI を使う場合、[CLI ガイド](./cli.mdx)からインストールし、既存の単独インストールは明示的に `dw upgrade` で更新します。CLI はバックグラウンド更新をしません。インストール・更新後に `command -v dw` と `dw --version` を実行し、Cloud 認証情報を使う前にインストーラーの `PATH` 対処を解決して、選択したリリースが有効なバイナリであることを確認してください。

## 名前空間のプロビジョニングと接続 {#provision-and-connect-a-namespace}

### 1. 名前空間を作成しプロビジョニングする {#1-create-and-provision-the-namespace}

[Cloud ダッシュボード](https://cloud.durable-workflow.com/)で組織、プロジェクト、環境、名前空間を作成し、容量プランを選びます。アカウントや名前空間定義を作るだけでは有料容量はプロビジョニングされません。Stripe で支払い設定を完了し、名前空間ページで **Provision** を選びます。カード追加だけではプロビジョニングは始まりません。

プロビジョニングは非同期です。Cloud がランタイムを準備する間、名前空間ページは進捗を更新します。有効になるまで SDK の処理を開始せず待ってください。このページにはランタイム認証情報の作成と、ワークフローや履歴を検査する Managed Waterline アクセスもあります。

API による設定では先に支払い設定を完了します。次の例は組織の既定プランを使います。別の利用可能プランは `capacity_plan_version` で選べます。独自の Server URL、デプロイ識別子、配置レコードを指定しないでください。

```bash
curl -X POST \
  https://cloud.durable-workflow.com/api/v1/projects/PROJECT/environments/ENVIRONMENT/namespaces \
  -H "Authorization: Bearer dwc_..." \
  -H "Content-Type: application/json" \
  -d '{"name":"orders","retention_days":30}'

curl -X POST \
  https://cloud.durable-workflow.com/api/v1/projects/PROJECT/environments/ENVIRONMENT/namespaces/orders/provision \
  -H "Authorization: Bearer dwc_..."
```

プロビジョニング完了後、名前空間レスポンスは安定した `runtime_url`、`runtime_namespace`、管理状態、利用者向けリージョン情報を提供します。返された URL と名前空間値を Cloud 所有の設定として扱い、エンドポイントを導出したりセルフホスト Server アドレスに置き換えたりしないでください。

### 2. 別々のクライアント・Worker 認証情報を発行する {#2-issue-separate-client-and-worker-credentials}

2つのランタイムロールを独立に発行します。

```bash
curl -X POST \
  https://cloud.durable-workflow.com/api/v1/projects/PROJECT/environments/ENVIRONMENT/namespaces/orders/runtime-credentials \
  -H "Authorization: Bearer dwc_..." \
  -H "Content-Type: application/json" \
  -d '{"name":"orders-client","role":"client"}'

curl -X POST \
  https://cloud.durable-workflow.com/api/v1/projects/PROJECT/environments/ENVIRONMENT/namespaces/orders/runtime-credentials \
  -H "Authorization: Bearer dwc_..." \
  -H "Content-Type: application/json" \
  -d '{"name":"orders-worker","role":"worker"}'
```

各トークンは作成レスポンスに一度だけ表示されます。対応するロールだけが使うシークレットストアに保管します。意図的にクライアントと Worker を同一プロセスにまとめる場合も、2つの異なるシークレットとして受け取ります。ロールは独立にローテーション・失効し、どちらのランタイム認証情報も Cloud API キーに置き換えないでください。

### 3. 最初の Cloud ワークフローを完了する {#cloud-first-workflow}

Sample App の共有外部ランタイムプレイグラウンドは、PHP、Python、Rust で同じ記述済みワークフロー・アクティビティ手順を実行します。[Sample App Codespace](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main)を開き、プロビジョニングされた名前空間値と2つのランタイム認証情報をエクスポートし、アプリケーションのタスクキューを選びます。

```bash
export DURABLE_WORKFLOW_RUNTIME_URL='<provisioned-runtime-url>'
export DURABLE_WORKFLOW_NAMESPACE='<provisioned-runtime-namespace>'
export DURABLE_WORKFLOW_CLIENT_TOKEN='<client-runtime-credential>'
export DURABLE_WORKFLOW_WORKER_TOKEN='<worker-runtime-credential>'
export DURABLE_WORKFLOW_TASK_QUEUE='<language-task-queue>'
```

次にファーストパーティ SDK を選び、同じ管理ランタイム契約を実行します。

```bash
language=php # Choose php, python, or rust.
scripts/playground "$language" --runtime managed \
  --runtime-url "$DURABLE_WORKFLOW_RUNTIME_URL" \
  --namespace "$DURABLE_WORKFLOW_NAMESPACE" \
  --task-queue "$DURABLE_WORKFLOW_TASK_QUEUE"
```

ランナーは現在の安定版成果物バージョンを解決し、各認証情報を対応する子プロセスだけに渡します。正確なキューと生成したワークフロー型・アクティビティ型を広告する Worker 登録を最大60秒待ってから、クライアント要求を1つ開始します。SDK が期待結果を返し、`dw` が `completed` を報告し、必要な履歴が存在した場合にだけ成功します。管理モードではローカルの Server や Waterline を動かしません。

言語ごとに `language` だけを変更し、上の管理コマンド全体を再実行します。SDK 固有の記述は各ガイドへ進んでください。

- [PHP SDK](/docs/polyglot/php/): `language=php` を設定。
- [Python SDK](/docs/polyglot/python/): `language=python` を設定。
- [Rust 管理ランタイムクイックスタート](/docs/polyglot/rust-cloud-quickstart/): `language=rust` を設定し、Worker 準備、完了結果、不一致の診断を使う。

クライアントと Worker をまとめた手順でも、両ランタイム認証情報は異なるシークレットとして保持します。Cloud 管理キーはランタイム認証情報ではなく、どちらのランタイムトークン変数にもエクスポートしてはいけません。

### 4. 管理運用を続ける {#4-continue-with-managed-operation}

SDK クライアントは名前空間ランタイム URL でワークフローを開始し、後続コマンドを送ります。利用者が動かす Worker は Worker ロールで同じ URL に登録してロングポーリングします。Cloud は各リクエストを認証して範囲を限定し、管理ランタイムでオーケストレーションプロトコルを実行し、状態と履歴を永続化します。

利用者のアプリケーションは操作ごとのランタイムデプロイを選びません。ワークフロー ID、実行 ID、タスクキュー、互換性マーカー、Avro ペイロードエンコードは、Cloud 名前空間内の永続的なアプリケーション契約のままです。

## 利用者 Worker の接続 {#customer-run-worker-connectivity}

Worker は利用者のネットワーク、VM 群、コンテナプラットフォーム、アプリケーション環境で動かせます。名前空間ランタイム URL への送信 HTTPS 到達性が必要で、Worker プロトコルの長時間ポーリング要求を許可する必要があります。

- Cloud から Worker への受信接続は不要。
- プロキシや出口ゲートウェイは、ロングポーリングを短縮して過剰な再試行ループにしてはいけない。
- 一時的な接続失敗やサービス利用不能応答には上限付きバックオフで再試行するべき。
- Worker プロセスを移してもワークフロー状態は移らない。Cloud が名前空間の永続状態と履歴を保持する。
- 認証情報のローテーションにランタイム URL、名前空間、タスクキューの変更は不要。

## リージョン配置と復旧の境界 {#region-placement-and-recovery-boundary}

Cloud Dev は以下の復旧境界で利用可能です。HA の境界は、認定待ちで未提供の予定プランを説明します。

- **Cloud Dev:** 永続状態とバックアップを持つ1つの分離ホスト。保守と復旧でサービスが中断する場合がある。稼働時間 SLA や自動リージョンフェイルオーバーはない。
- **予定の単一リージョン HA:** 1リージョン内の3つの複製ホストと自動プライマリフェイルオーバー。1ホストが失敗しても残りのクォーラムを失わない。リージョン全体の停止は SLA 対象外。
- **予定の複数リージョン HA:** 3リージョンにまたがる3つの複製ホストと自動プライマリフェイルオーバー。残りのメンバーがクォーラムを形成できる限り、設定した1リージョンの喪失・分離を SLA に含む。

予定の HA プロファイルでは、安定したランタイム URL は選出されたプライマリを追跡する設計です。対応するフェイルオーバー中に SDK 設定は変えません。分離された旧プライマリは、正本となる処理の提供を続けられません。安全なプライマリを確立できない場合、競合する書き込みを受け入れずサービス提供を停止します。HA は要求が無中断という約束ではありません。クライアントと Worker には引き続き一時失敗への上限付き再試行が必要です。

名前空間ページはトポロジー、リージョン情報、サービス状態を公開します。バックアップは復旧を支えますがライブ複製の代替ではありません。短時間のフェイルオーバーテストは実施した失敗事例を示すもので、普遍的な復旧時間保証や1か月の達成可用性ではありません。

### SLA 計測とクレジット {#sla-measurement-and-credits}

4つの予定 SLA プランは UTC 暦月で 99.99% の稼働時間 SLA を指定し、利用者ランタイムエンドポイントを1分間隔で計測します。欠測は利用不能として数え、計画保守も除外しません。利用者がホストする Worker の可用性は管理ランタイムの可用性とは別です。

| 月間可用性 | 自動アカウントクレジット |
| --- | ---: |
| 99.99% 以上 | なし |
| 99.9% 以上、99.99% 未満 | 10% |
| 99.0% 以上、99.9% 未満 | 25% |
| 99.0% 未満 | 100% |

SLA プランではサービスクレジットがアカウントに自動適用されます。
その月の対象ランタイムへの請求額が上限であり、停止に対する現金返金はありません。
Cloud Dev に SLA クレジットはありません。プランの可用性範囲と請求条件は
[Cloud 利用規約](https://cloud.durable-workflow.com/terms)と
[Cloud 料金](https://cloud.durable-workflow.com/pricing)を参照してください。

## プライベート接続とサポートの境界 {#private-connectivity-and-support-boundary}

2.0 のセルフサービス Cloud 契約は、クライアントと Worker から公開名前空間ランタイム URL への送信アクセスを想定します。プライベート専用入口、独自の VPN・ピアリング、プロバイダー固有のプライベートルーティングはサポート主導の接続設計で、隠れた既定値ではありません。内部ランタイムアドレスを利用者へ渡したり、名前空間 URL を迂回させたりしません。

## Cloud とセルフホスト Server の選択 {#cloud-or-self-hosted-server}

チームが SDK クライアントと Worker を運用し、Durable Workflow にオーケストレーションランタイム、永続化、選択プランの可用性、復旧、Managed Waterline の運用を任せる場合は Cloud を選びます。

Server イメージ、データベース、キャッシュ、ネットワーク、認証、バックアップ、フェイルオーバーを独立に運用する必要がある場合、[セルフホスト Server](/docs/polyglot/server)を選びます。セルフホスト Server を Cloud 名前空間に登録・接続したり、その背後のランタイムとして使ったりはできません。組み込み Laravel、セルフホスト Server、Cloud は別のデプロイ選択肢です。

## 標準ワークフローベンチマーク {#standard-workflow-benchmarks}

[DW Standard Workflow v1](https://github.com/durable-workflow/server/tree/main/benchmarks/capacity) は、定義された 1 KiB の Avro 入力と結果を使い、ワークフロー開始1回、外部アクティビティ1回、ワークフロー完了1回から成る、小さく反復可能な負荷を定義します。利用者 Worker は管理ランタイム割り当ての外で動きます。

Cloud Dev は2026年11月19日に、Cloud が新しい Dev ランタイム向けにプロビジョニングするネイティブ Server 3.15.0 ランタイムで測定しました。ほかの4つの基準値は過去のものです。複製 HA トポロジーを含みますが、現在のランタイムリリースより前です。Dev からの外挿ではなく、現在の SLA プランの容量を認定するものでもありません。

| プラン | 標準ワークフロー/秒 | 30日間のワークフローアクション | 測定 |
| --- | ---: | ---: | --- |
| Cloud Dev | 1.5 | 7,776,000 | 2026年11月19日。詳細は後述 |
| Cloud Standard | 0.25 | 1,296,000 | 過去の値。再測定待ち |
| Cloud Multi-Region | 0.10 | 518,400 | 過去の値。再測定待ち |
| Cloud Business | 0.50 | 2,592,000 | 過去の値。再測定待ち |
| Cloud Business Multi-Region | 0.20 | 1,036,800 | 過去の値。再測定待ち |

30日推定は `workflows/second x 2,592,000 seconds x 2 workflow actions` で、この比較では開始1回とアクティビティ1回です。Cloud Dev では 1.5 x 2,592,000 x 2 = 7,776,000 です。そのレートで30日間連続実行する想定です。含まれるアクション割り当て枠、請求単位、他エンジンのアクション定義への正確な対応ではありません。

これは測定した負荷の基準値であり、最大スループットやすべてのアプリケーションの保証容量ではありません。大きいペイロード、追加アクティビティ、タイマー、シグナル、クエリ、リプレイ負荷の高い履歴、リージョン間通信、利用者 Worker のレイテンシで結果は変わります。表はタイマー、シグナル、リプレイ、飽和の個別ベンチマークを主張しません。任意のワークフローサイズを掛けるのではなく、実際の処理構成に合わせて計画してください。

### Cloud Dev の測定 {#cloud-dev-capacity}

Cloud Dev は開発・評価用の、分離した単一ホスト管理ランタイムです。この測定は通常どおりプロビジョニングした Dev ランタイムを使い、CPU、メモリ、ストレージ、ネットワーク、入口、バックアップ設定を変更していません。

| リソース | Cloud Dev |
| --- | --- |
| ランタイム計算資源 | 1共有 vCPU、1 GB RAM |
| 含まれる永続ストレージ | 5 GB |
| ランタイムサービス | ネイティブ Server、MySQL、Redis、入口コネクター |
| Managed Waterline | 認証付き Cloud アプリケーション経由で提供。Dev ホスト上のプロセスではない |
| ネットワーク経路 | スペース固有の直接 HTTPS 入口 |
| ランタイムの送信トラフィック | 4 Mbit/s にシェーピング |
| 利用者 Worker | 利用者環境で実行 |
| 可用性 | SLA なし。保守中断あり |
| 現在のランタイム料金 | [プランと料金](#plans-and-pricing)を参照 |
| ストレージ増加 | より大きいランタイムプランを要求。追加ストレージ販売なし |

実行は公開の [DW Standard Workflow v1 PHP 定義](https://github.com/durable-workflow/server/blob/f16f9b7337d3d64b1ba6458ab61ba2d7ed7f334f/benchmarks/capacity/v1/bindings/php/capacity_adapter.php)を使いました。開始1回、外部 echo アクティビティ1回、完了1回で、ワークフロー・アクティビティの各入力と結果の境界に 1,024 バイト文字列を Avro で渡します。ランタイムは、Cloud が新しい Dev ランタイム向けにプロビジョニングする Server リリースでした。ネイティブ Server 3.15.0 で、MySQL 8.0.46 と Redis 7.4.11 を使用しました。その `/api/cluster/info` は、実装 `rust`、バージョン 3.15.0、Worker プロトコル 1.20 を報告しました。外部 Worker とクライアントは PHP 8.4.27 上で公開版の PHP SDK 3.22.0 を使用し、このバインディングで固定されていた SDK 2.0.10 の代わりにインストールしました。これらはランタイムホストの外で動作し、ホストの通常の HTTPS 入口経由で接続しました。

負荷は 0.25、0.5、1、1.5、2 ワークフロー/秒の段階で投入し、境界のステップは繰り返しました。各ステップでは別の30秒ウォームアップの後、固定の5分間の時間帯を測定しました。時間帯内に観測された完了だけをスループットに数え、後から残りを完了させても報告レートは増えません。

- Worker: 1 ワークフロー/秒までは PHP Worker 4つ、1.5 では6つ、2 では4つ、6つ、または8つ。各 Worker はタスクポーリングのタイムアウトを1秒にしました。
- クライアント: `max(2, 8 x rate)` 個の独立したクライアントスロットが、固定スケジュールで開始を投入しました。1秒を超えて遅れた開始は、逃した開始スロットとして数えます。
- 結果: クライアントは各ワークフローの結果を1秒ごとにポーリングしました。ネイティブ Server は履歴のロングポーリング（`wait_new_event`、[server#1257](https://github.com/durable-workflow/server/issues/1257)）にまだ対応していません。
- 検査: すべての結果、完了状態、順序付きワークフロー・アクティビティ履歴を検証しました。
- ステップの合格条件は、エラーなし、時間帯内に逃した開始スロットなし、全ワークフローの検証完了、バックログ増加なし、OOM kill や再起動なしです。公開レートは、ホスト CPU が約80%以下で合格した最も高いステップです。
- ホスト CPU は `/proc/stat` から5秒ごとに取得しました。コンテナメモリは cgroup のワーキングセットです。

| 投入レート（Worker 数） | 時間帯、11月19日（UTC） | 開始 / 投入 | 時間帯内の完了 | 逃した開始 / エラー | p50 / p95 / p99（秒） | 時間帯終了時の未完了 | ホスト CPU 平均 / ピーク | 結果 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 0.25/s (4) | 22:56-23:01 | 75 / 75 | 75 | 0 / 0 | 1.24 / 1.30 / 1.42 | 0 | 29.3% / 35.2% | 合格 |
| 0.5/s (4) | 23:02-23:07 | 150 / 150 | 151 | 0 / 0 | 1.25 / 1.41 / 2.61 | 0 | 38.2% / 45.5% | 合格 |
| 1/s (4) | 23:08-23:13 | 300 / 300 | 300 | 0 / 0 | 1.36 / 1.57 / 1.65 | 1 | 58.8% / 64.2% | 合格 |
| 1/s (4)、再実行 | 23:36-23:41 | 300 / 300 | 300 | 0 / 0 | 1.36 / 1.56 / 1.64 | 1 | 48.5% / 61.6% | 合格 |
| 1.5/s (6) | 23:29-23:34 | 450 / 450 | 446 | 0 / 0 | 1.78 / 3.98 / 5.10 | 6 | 54.0% / 60.9% | 合格 |
| 1.5/s (6)、再実行 | 23:43-23:48 | 450 / 450 | 446 | 0 / 0 | 1.77 / 3.71 / 4.83 | 6 | 55.8% / 61.8% | 合格 |
| 2/s (4) | 23:15-23:20 | 522 / 600 | 520 | 78 / 0 | 6.49 / 9.87 / 10.58 | 16 | 50.4% / 65.5% | 不合格: 開始の取り逃し |
| 2/s (8) | 23:22-23:27 | 455 / 600 | 452 | 145 / 0 | 7.92 / 11.66 / 12.86 | 14 | 43.0% / 50.1% | 不合格: 開始の取り逃し |
| 2/s (6) | 23:49-23:54 | 496 / 600 | 487 | 104 / 1 | 6.97 / 10.43 / 11.04 | 15 | 48.6% / 56.4% | 不合格: 開始の取り逃し、失敗したワークフロー1件 |

| 1.5 ワークフロー/秒での測定結果 | 値 |
| --- | ---: |
| 投入レート | 1.5 標準ワークフロー/秒 |
| 測定時間帯 | 23:29:52-23:34:52 UTC |
| 時間帯内の完了 | 446（1.49/秒） |
| 残りを完了させた後の完了 | 開始した450件中450件 |
| エラー / 逃した開始スロット | 0 / 0 |
| 開始から結果までのレイテンシ p50 | 1.78秒 |
| 開始から結果までのレイテンシ p95 | 3.98秒 |
| 開始から結果までのレイテンシ p99 | 5.10秒 |
| 時間帯終了時点の測定コホートの未完了ワークフロー | 6 |
| ホスト CPU 平均 / ピーク | 54.0% / 60.9% |
| 30日間のワークフローアクション | 7,776,000 |

未完了だった6件は時間帯の最後の数秒に開始され、通常のレイテンシ範囲内で完了しました。これらは数えていません。時間帯中に同時に未完了だったワークフローは最大9件で、最後の1分間のレイテンシ中央値（1.87秒）は最初の1分間（1.76秒）に近いままだったため、バックログは増加しませんでした。1.5 の再実行ステップも同じスループットで合格し、p99 は4.83秒、ホスト CPU は平均55.8%でした。

レイテンシはクライアントのネットワーク（測定ホストからの HTTPS 往復1回あたり約85-170 ms）と1秒ごとの結果ポーリングを含むため、中央値が1秒を大きく下回ることはありません。内部タスクスケジューリングのレイテンシではなく、他エンジンの内部スケジューリング指標と比較するべきではありません。

どのステップでも**コンテナの OOM kill や再起動はありませんでした**。1.5 ワークフロー/秒で観測したコンテナのメモリピーク（ワーキングセット）は、ネイティブ Server 17.16 MiB、MySQL 244.35 MiB、Redis 6.29 MiB、入口コネクター 30.16 MiB でした。個別ピークは同時点のホスト全体 RSS ではなく、OS やほかのホストプロセスもメモリを消費します。ホストは通常の 1 GiB swap 設定で、最大約50 MiB を使用しました。初回の暗号化バックアップは最初の時間帯の前に取得・検証済みで、ほかのバックアップ取得は実行と重なっていません。

2 ワークフロー/秒のステップは合格しませんでした。Worker 4つ、8つ、6つでの3回の試行は、600の開始スロットのうちそれぞれ78、145、104を逃し、p99 レイテンシは10.6秒から12.9秒でした。ホスト CPU は上限ではなく、これらの試行では平均43-50%でした。上限はランタイムの送信トラフィックシェーピングでした。この方法では、ワークフロー1件あたり約400 KB のランタイム送信トラフィック（結果ポーリング、Worker のタスク応答、転送オーバーヘッド）が発生しました。1 ワークフロー/秒では 3.35 Mbit/s、1.5 と 2 では上限いっぱいの 4.0 Mbit/s です。Worker を増やしても改善しませんでした。Worker のポーリング自体がトラフィックを増やすためです。Worker 6つの試行では、送信トラフィックが飽和している間にアクティビティがタスクリースを失い、ワークフロー1件が失敗しました。それ以外のワークフローはすべてのステップで期待どおりの履歴で完了し、エラー、OOM kill、再起動はありませんでした。したがって、測定した Dev の基準値は 1.5 標準ワークフロー/秒であり、それより高いレートは主張しません。

これは2026年11月18日の Dev 基準値 0.25 ワークフロー/秒を置き換えます。その実行では、当時 Dev がプロビジョニングしていた PHP Server 2.9.12 ランタイムを Worker 1つと 100 ms ごとの結果ポーリングで測定し、単一 vCPU が上限でした。

これは新しいランタイムを約1時間測定したもので、長時間負荷試験ではありません。Server 3.15.0 の保守スキャンは保持されたすべての実行を読み取るため、データベースの処理量は保持履歴とともに増えます。Server 3.16.0 はこのスキャンを未完了の処理に限定します（[server#1256](https://github.com/durable-workflow/server/issues/1256)）。Cloud Dev は Server 3.16.0 で、保持履歴を伴うより長い実行を含めて再測定します。これは測定した開発用基準値であり、全ワークフローの普遍的な換算、最大スループット試験、SLA ではありません。大きいペイロード、追加アクティビティ、タイマー、シグナル、クエリ、リプレイ負荷の高い履歴、利用者 Worker のレイテンシで容量は変わります。Cloud の請求はワークフロー操作ではなく、固定の同梱ストレージを持つプロビジョニング済みランタイム時間に基づきます。

## 請求使用量 API {#billing-usage-api}

Cloud Dev は、プロビジョニングされた Dev スペースごとに1つの分離した単一ホストランタイムセルを使います。請求条件は次のとおりです。

| 請求条件 | Cloud Dev |
| --- | ---: |
| プロビジョニング済みランタイム | 1時間 $0.075、分単位で計測 |
| 暦月上限 | ランタイム購入ごとに $50 |
| 稼働月最低額 | 有効な UTC 月のランタイム購入ごとに $2 |
| 管理容量 | 1 vCPU、1 GB メモリ、5 GB 永続ストレージ |
| 追加永続ストレージ | 別売りなし。より大きいプランを要求 |
| 基本暗号化バックアップ | 同梱 |
| 可用性 | 単一ホスト、SLA なし |

割り当てには Cloud 運用の Server、MySQL、Redis、スケジューリング、Waterline アクセス、バックアップ、アップグレード、インフラを含みます。利用者の PHP、Python、Rust Worker は割り当て外で動きます。ワークフロー開始、アクティビティ試行、再試行、タイマー、シグナル、クエリ、更新、子ワークフローは運用テレメトリーであり、個別の請求単位ではありません。料金に適用税は含みません。同梱ストレージの別料金は発生しません。

Cloud は財務、運用、社内費用配賦の自動化に組織スコープの請求使用量を公開します。Cloud API キーで認証し、要求で顧客・組織 ID は受け入れません。呼び出し元の組織を `dwc_` Bearer トークンから解決し、他の利用者の使用量を照会できないようにします。

```http
GET /api/v1/billing/usage?period_start=2026-05-01&period_end=2026-05-31
Authorization: Bearer dwc_...
Accept: application/json
```

`period_start` と `period_end` は任意の ISO-8601 日付です。省略時は現在の暦月を返します。請求制限で名前空間のプロビジョニングやワークフロー操作が停止しても、使用量の読み取りとエクスポートは利用可能で、財務チームは支払い状態を回復できます。

レスポンススキーマは `durable_workflow.cloud.namespace_capacity_usage.v1` です。割り当て容量時間と意味上のイベントカウンターを分離します。過去の請求のためにストレージ関連フィールドはスキーマに残りますが、追加購入を認めるものではありません。省略した以下の Cloud Dev レスポンスは現行プラン条件を示します。

```json
{
  "schema": "durable_workflow.cloud.namespace_capacity_usage.v1",
  "access_control": {
    "scope": "organization_billing_usage",
    "read_allowed": true,
    "export_allowed": true
  },
  "current_period": {
    "starts_at": "2026-05-01T00:00:00+00:00",
    "ends_at": "2026-05-31T23:59:59+00:00"
  },
  "metering_policy": {
    "invoice_drivers": [
      "namespace_plan_capacity",
      "additional_durable_storage_gb_month"
    ],
    "semantic_events_are_invoice_units": false,
    "network": "measured_not_billable",
    "basic_backups": "included",
    "customer_worker_compute": "excluded"
  },
  "by_namespace": [
    {
      "namespace": "development",
      "project": "sample-app",
      "environment": "development",
      "plan": {
        "version": "cloud-dev.single-host-v2",
        "name": "Cloud Dev",
        "availability_class": "development_single_host",
        "sla_status": "none",
        "billing_terms": {
          "currency": "usd",
          "unit": "provisioned_runtime_hour",
          "hourly_rate_cents": "7.5",
          "monthly_cap_cents": 5000,
          "active_month_minimum_cents": 200,
          "scope": "runtime_purchase",
          "billing_period": "calendar_month_utc",
          "metering_resolution_seconds": 60,
          "additional_storage_unit": "gb_month",
          "additional_storage_rate_cents": 0,
          "additional_storage_available": false,
          "additional_storage_metering_unit": "gb_hour",
          "additional_storage_in_monthly_cap": false
        }
      },
      "allocation": {
        "managed_cpu_vcpu": 1,
        "managed_memory_gb": 1,
        "included_durable_storage_gb": 5
      },
      "operational_telemetry": {
        "billing_status": "not_billable",
        "counters": {
          "workflow_execution_count": 20,
          "activity_execution_count": 40,
          "timer_fire_count": 5,
          "signal_delivery_count": 3,
          "update_delivery_count": 0,
          "query_task_count": 2
        }
      }
    }
  ]
}
```

Cloud Dev の時間計測は、分離ランタイムの有効化時に始まり、プロビジョニング解除で止まります。月額上限と最低額は UTC 暦月のランタイム購入ごとに適用します。ストレージが自動で増えたり課金が始まったりしません。Cloud はランタイムディスクに運用・復旧用の予備領域を確保します。同梱容量に達する前に、より大きいプランを要求してください。

アイドルランタイムにも容量料金が発生します。プロビジョニング解除は容量請求を止め、有効なランタイムデータと認証情報を削除します。一時停止・再開操作ではありません。予定 SLA 条件は同じ時間モデルをそれぞれの料金、最低額、上限で使います。使用量の解釈にはプランが返す `billing_terms` を使います。過去の請求書は承諾済み条件を維持します。

デプロビジョニング前に[ランタイム間の移行手順](/docs/polyglot/runtime-migration/#preserve-evidence)に従い、検証済みの履歴とペイロードの証跡を保持し、移行元の実行がすべて終端状態であることを確認します。移行元がプロビジョニングされている間は容量料金が続きます。

下流の財務システムにファイルで渡す必要がある場合、同じ証跡を CSV または JSON レポートでエクスポートします。

```bash
curl -OJ "https://cloud.durable-workflow.com/api/v1/billing/usage/export?period_start=2026-05-01&period_end=2026-05-31" \
  -H "Authorization: Bearer dwc_..."

curl -OJ "https://cloud.durable-workflow.com/api/v1/billing/usage/report?period_start=2026-05-01&period_end=2026-05-31" \
  -H "Authorization: Bearer dwc_..."
```

JSON を使うダッシュボードパネルには、パネルの期間で同じ API を要求します。

```text
GET https://cloud.durable-workflow.com/api/v1/billing/usage?period_start=${__from:date:YYYY-MM-DD}&period_end=${__to:date:YYYY-MM-DD}
Authorization: Bearer dwc_...
```

次に名前空間容量行を平坦化します。

```jq
.by_namespace[]
| {
    project,
    environment,
    namespace,
    plan: .plan.name,
    cpu_vcpu: .allocation.managed_cpu_vcpu,
    memory_gb: .allocation.managed_memory_gb,
    included_storage_gb: .allocation.included_durable_storage_gb,
    capacity_status
  }
```

容量とストレージの照合には `invoice_units` を使います。負荷の構成やベンチマーク動作の理解には `operational_telemetry` を使い、イベントカウンターを料金に変換しないでください。

## 関連リファレンス {#related-references}

- [デプロイモード](/docs/polyglot/deployment-modes)
- [PHP SDK](/docs/polyglot/php)
- [Python SDK](/docs/polyglot/python)
- [Rust SDK](/docs/polyglot/rust)
- [Server](/docs/polyglot/server)
- [セルフホストのデプロイ](/docs/deployment)
- [サポート](/docs/support)
