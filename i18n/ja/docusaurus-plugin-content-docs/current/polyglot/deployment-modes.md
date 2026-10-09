---
sidebar_position: 2
title: デプロイモード
description: Durable Workflow Cloud またはセルフホスト Server のサービスモードと、Laravel にランタイムを組み込むモードを選びます。
tags:
  - deployment
  - server
  - laravel
  - polyglot
keywords:
  - Durable Workflow のデプロイモード
  - Laravel 組み込みモード
  - サービスモード
  - Durable Workflow Cloud
  - セルフホスト Server
---

import ProductPromotion from '@site/src/components/ProductPromotion';

# デプロイモード {#deployment-modes}

<ProductPromotion source="docs-v2-deployment-modes">
PHP、Python、Rust の Worker を使いながら、オーケストレーションのランタイム運用を任せたい場合は、マネージドサービスモードを選べます。
</ProductPromotion>

Durable Workflow v2 には 2 つのデプロイモードがあります。

- **サービスモード:** アプリケーションと Worker が SDK を通じてリモートランタイムに接続します。[Durable Workflow Cloud](/docs/polyglot/cloud-control-plane/) または[セルフホスト Server](/docs/polyglot/server/) を選びます。
- **Laravel 組み込みモード:** Laravel アプリケーションに `durable-workflow/workflow` をインストールし、そのアプリケーションがランタイムを直接管理します。

Cloud とセルフホスト Server は、サービスモード内のランタイムの選択肢です。両方を組み合わせて動かす必要はありません。Cloud では Durable Workflow がオーケストレーションと永続ストレージを運用し、利用者は SDK クライアントと Worker を動かします。Cloud には Managed Waterline が含まれます。**Cloud の利用者が独自の Server や Waterline サービスをインストール、デプロイ、接続する必要はありません。** セルフホスト Server に Waterline は含まれません。運用者は、Server が管理する名前空間に接続する Waterline を別途デプロイできます。

このページでは、ワークフロー群をどのランタイムで管理するか、モード間をどう切り替えるか、両モードでどの契約を維持するかを確認できます。

Laravel を使うチームには、[Laravel の導入とランタイム移行ガイド](/docs/laravel-adoption/) もあります。v1 から v2、組み込みモードからサービスモードへの移行に加え、公開済み PHP SDK の Laravel ブリッジとテスト用 fake を説明しています。

## サービスモードのランタイムを選ぶ {#choose-a-service-mode-runtime}

| ランタイムの選択肢 | 永続状態を運用する担当 | チームが動かすもの | 最初に読むガイド |
| --- | --- | --- | --- |
| Durable Workflow Cloud | Durable Workflow が名前空間のマネージドランタイム、永続ストレージ、アップグレード、サービスエンドポイント、Managed Waterline を運用します。 | 発行された認証情報を使うアプリケーションクライアントと PHP、Python、Rust の Worker。Server や別の Waterline サービスを動かす必要はありません。 | [Cloud マネージドランタイム](/docs/polyglot/cloud-control-plane/) |
| セルフホスト Server | チームが Server と永続ストレージのデプロイ、セキュリティ、スケーリング、バックアップ、アップグレードを担当します。 | Server、アプリケーションクライアント、PHP、Python、Rust の Worker。必要に応じて、Server が管理する名前空間に接続する Waterline を別サービスとしてデプロイします。 | [セルフホスト Server](/docs/polyglot/server/) |

どちらも同じクライアントと Worker のモデルを使います。違いはランタイムの運用と認証情報で、ワークフローの書き方は共通です。

## 共通の永続実行モデルと、それぞれの境界 {#same-durable-model-different-boundary}

組み込みモードとサービスモードは、同じ v2 カーネルを使います。変わるのは、その周りのホスティング、認証、通信の境界です。サービスモードでは同じカーネルを HTTP+JSON の制御 API と Worker API から利用します。gRPC は必須ではなく、別の実行エンジンも必要ありません。

| 機能 | 組み込みモード | サービスモード | 両モードで共通の契約 |
| --- | --- | --- | --- |
| 永続ワークフローモデル | Laravel アプリケーションがパッケージを直接実行し、アプリケーションのランタイム内にワークフロー状態を書き込みます。 | Cloud またはセルフホスト Server がサービス API の背後でワークフロー状態を管理します。 | ワークフロー ID、run ID、型付き履歴、コマンドの結果、再試行、修復の意味、履歴エクスポートは同じ v2 契約です。 |
| 制御 API | アプリケーションコード、`WorkflowStub`、アプリケーション内の運用ツールから開始やコマンドを実行します。 | 明示的な認証とプロトコルヘッダーを付け、HTTP+JSON で Server API、CLI、SDK から開始やコマンドを実行します。フレームワークに依存しない PHP クライアントは `durable-workflow/sdk` の `DurableWorkflow\Client` を使います。 | 重複開始ポリシー、実行の指定、コマンド ID、結果の名前は共通です。後続コマンドは、開始を受け付けたランタイムへ送ります。 |
| Worker の通信 | Laravel のキュー Worker が、アプリケーションのデプロイ内でワークフロータスクとアクティビティタスクを実行します。 | Worker が HTTP+JSON の Worker プロトコルで登録、ロングポーリング、ハートビート、完了報告を行います。PHP のリモート Worker は `durable-workflow/sdk` の `DurableWorkflow\Worker` を使います。 | タスクリース、互換性マーカー、リプレイの意味、アクティビティの少なくとも 1 回の実行は共通です。 |
| タスク配信の既定値 | 通常は、アプリケーションから Laravel キューへタスクを配信します。 | サービスランタイムはポーリングによる配信を使い、外部 Worker が HTTP 経由で仕事を取得します。セルフホスト Server の運用者は、この既定値を明示的に変更できます。 | ready、leased、repair のライフサイクルと永続タスクモデルは共通です。 |
| ワークフローとアクティビティの型キー | PHP エイリアスからアプリケーション内のクラスを解決できます。 | Worker が登録時に対応する型キーを通知します。 | 公開する型キーは、安定した言語中立の名前にします。PHP の完全修飾クラス名や、それを模した PHP のダミー型を公開契約にしないでください。 |
| 運用画面 | 組み込みの Waterline パッケージやアプリケーション内のツールが、Laravel アプリケーションの永続状態を直接読みます。 | Cloud は名前空間用の Managed Waterline を提供します。セルフホストの運用者は、Server が管理する名前空間に接続する Waterline を別途デプロイできます。サービス API、CLI、SDK からもランタイムが管理する状態を読めます。 | 検索属性、メモ、実行状態、キュー診断、履歴エクスポートは、その実行を管理するランタイム内の永続的な事実です。Waterline が複数のランタイムや名前空間を統合することはありません。 |
| 認証とテナントの境界 | アプリケーションの認証は、Laravel ホストが自身のルートとセッションに提供する仕組みに従います。 | 名前空間の選択と Server の認証トークンまたは署名は、必須の API 境界です。 | 名前空間名、タスクキュー、互換性マーカー、固定の Avro ペイロード契約は、切り替え前後で維持します。 |
| ランタイムの探索 | アプリケーション内でサービスを解決するか、アプリケーションの設定を使います。 | Worker とクライアントに、リモートのベース URL を明示的に設定します。 | どちらのモードも、共通の `APP_URL`、`APP_KEY`、localhost の前提、同一コンテナ内の探索に依存させないでください。 |
| 移行の境界 | 既存の組み込み実行は、開始した場所で動き続けます。 | 新しいサービス管理の実行は、選択した Cloud またはセルフホストランタイムで開始し、そこに留まります。 | 実行中の状態がモード間で自動移行されることはありません。エクスポートは監査やデバッグ用で、実行中の状態をインポートする仕組みではありません。 |

## 組み込みモードが適する場合 {#choose-embedded-mode-when}

- Laravel アプリケーションが、ワークフローの定義、Worker の実行、運用アクセスを 1 つのデプロイで管理している。
- 既存アプリケーションのキューと認証モデルが、ワークフロー運用に適した境界になっている。
- 最小限の自己完結したランタイムが必要で、言語中立の Worker プロトコルは不要である。
- 運用者が Waterline やホストアプリケーションのツールを主なワークフロー操作画面として使える。

[組み込みモードのインストール](/docs/installation/) と、設定ガイドを含む[組み込みモードのドキュメント](/docs/category/embedded/) から始めてください。

## サービスモードが適する場合 {#choose-service-mode-when}

- 複数のアプリケーションやチームで、1 つのワークフローランタイムを共有したい。
- Worker、制御 API の呼び出し元、運用者が、すべて Laravel/PHP に統一されているわけではない。
- クライアントとワークフローエンジンの間に、明示的なリモート認証と名前空間の境界が必要である。
- 対応する [Server の役割構成](/docs/polyglot/server-role-topology) に従って、API の入口、マッチングと配信、Worker を個別にスケールさせたい。
- セルフホスト Server が管理する名前空間を、Waterline から観察したい。Cloud には Managed Waterline が含まれます。

マネージドランタイムには [Durable Workflow Cloud](/docs/polyglot/cloud-control-plane/) から始めます。セルフホストには [Server](/docs/polyglot/server/) と[セルフホストのデプロイ](/docs/deployment/) を参照してください。次に [PHP SDK](/docs/polyglot/php/)、[Python SDK](/docs/polyglot/python/)、[Rust SDK](/docs/polyglot/rust/) を選びます。Cloud の利用者は Managed Waterline を使います。セルフホストの運用者が Waterline を別サービスとしてデプロイする場合は、[Server API リファレンス](/docs/polyglot/server-api-reference/) と[監視](/docs/monitoring#waterline-service) を参照してください。

## セルフホストのサービスモードへの移行ツール {#migration-tooling-to-self-hosted-service-mode}

組み込みモードからサービスモードへの対応する移行方法は、段階的な導入です。実行中の状態をその場で引き渡す方式ではありません。

- [組み込みモードから Server への移行](/docs/polyglot/embedded-to-server) で、切り替え手順を確認します。
- 切り替え前に `GET /api/cluster/info` で、移行先の Server ビルド、構成、機能契約を確認します。
- `POST /api/worker/register` と Worker プロトコルで、選んだ安定した型キーを外部 Worker が処理できることを確認します。
- 本番トラフィックを切り替える前に、`GET /api/system/operator-metrics`、`dw worker:list`、Waterline の運用画面で、Worker の登録と互換性のある Worker 群のカバレッジを確認します。
- アプリケーション内の制御 API 呼び出しを Server 対応の自動化に置き換える場合は、[クライアントと Worker の機能](/docs/polyglot/cli-python-parity/) を確認します。
- 監査やデバッグには、Cloud の Managed Waterline、セルフホストランタイムに接続した Waterline、Server の履歴エクスポートを使います。エクスポートを、稼働中の Server 管理の実行をインポートする手段として扱わないでください。

移行では、次の 3 つのルールを必ず守ります。

1. 既存の実行は、開始したランタイムに留めます。
2. 新しい Server 管理の実行では、最初の切り替えから安定した型キー、名前空間名、タスクキュー、固定の Avro ペイロード契約を使います。
3. シグナル、クエリ、更新、修復、キャンセル、強制終了、アーカイブは、対象の実行を管理するランタイムへ送ります。

## 関連リファレンス {#related-references}

- [インストール](/docs/installation)
- [Server](/docs/polyglot/server)
- [PHP SDK](/docs/polyglot/php)
- [Cloud マネージドランタイム](/docs/polyglot/cloud-control-plane)
- [組み込みモードから Server への移行](/docs/polyglot/embedded-to-server)
- [Server の役割構成](/docs/polyglot/server-role-topology)
- [Server 設定リファレンス](/docs/polyglot/server-config-reference)
