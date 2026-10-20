---
sidebar_position: 12
tags:
  - observability
  - operations
  - Waterline
keywords:
  - Waterline
  - ワークフロー監視
  - 永続履歴
  - ランタイムテレメトリ
  - Waterline の操作可否
  - 診断専用の証拠
  - 修復状態
---

# 監視 {#monitoring}

[Waterline](https://github.com/durable-workflow/waterline) は、ワークフロー状態を扱う運用者 UI と API です。提供形態は選択したランタイム境界に従います。Cloud は Managed Waterline を含み、セルフホストの運用者は必要に応じて Waterline を別途デプロイします。

Waterline は一つの運用製品で、三つの利用形態があります。

- **組み込みモード**では、ワークフローを所有する Laravel アプリケーションに Composer パッケージをインストールし、その永続状態をプロセス内で読みます。
- **セルフホストのサービスモード**では、公開 `durableworkflow/waterline` イメージを実行し、PHP SDK と公開 Server API を通じて[スタンドアロン Server](./polyglot/server.md) が所有する状態を読みます。Server ディストリビューションは Waterline を同梱・運用しません。
- **Cloud Managed Waterline** は、[Durable Workflow Cloud](./polyglot/cloud-control-plane.md) に含まれる名前空間単位の運用環境です。Cloud が Managed Waterline とその背後の名前空間ランタイムを運用します。

組み込みとセルフホストサービスは、同じ中核 Waterline UI と `/waterline/api/...` 運用ルート分類を公開します。Cloud は、顧客がデプロイする Waterline のルートホストの代わりに、マネージドインターフェースで運用機能を提供します。いずれもランタイム状態を統合しません。各ビューは、そのランタイムと名前空間が所有する実行だけに限定されます。セルフホスト Server では、Waterline をデプロイしなくても、ネイティブ API、CLI、SDK の運用インターフェースを使えます。ネイティブルートは [Server API リファレンス](./polyglot/server-api-reference.md)、Waterline のルートとレスポンス契約は [Waterline 運用者 API リファレンス](./waterline-operator-api.md)を参照してください。

Durable Workflow には二つの可観測性プレーンがあります。

| プレーン | 正しい情報源 | 典型的な質問 |
| --- | --- | --- |
| 永続状態 | 所有するランタイムのワークフローデータベースと API、Waterline 投影、履歴エクスポート | 開始したか。現在の実行はどれか。どのシグナル、更新、タイマー、アクティビティ、リトライ、失敗がコミットされたか。今どの運用操作が安全か。 |
| Worker・ランタイムのテレメトリ | キュー Worker ログ、SDK メトリクス記録器、Prometheus/OpenMetrics エンドポイント、アプリケーショントレース | Worker はポーリングしているか。タスクに何秒かかるか。エクスポーターは設定済みか。カスタムメトリクスは Worker プロセス外へ送られたか。 |

Waterline は、意図的に Worker メトリクスを置き換えません。アクティビティや Worker コードでカスタムメトリクスを記録した場合は、Worker のテレメトリエンドポイントをスクレイプします。Waterline は、そのランタイムの信号を永続ワークフロー履歴と現在の実行状態に関連付けるために使います。

Worker・クライアントの設定も運用インターフェースと別です。名前空間を所有するランタイムへ接続する際は、言語ガイドとともに、生成済み [PHP SDK API リファレンス](https://php.durable-workflow.com/api/)、[Python SDK API リファレンス](https://python.durable-workflow.com/)、[Rust SDK API リファレンス](https://rust.durable-workflow.com/)を使用してください。

Worker テレメトリに繰り返しの取得、遅延完了の競合、停止したリースがある場合は、このガイドと[実行保証と冪等性](./constraints/execution-guarantees.md)を併読してください。この契約は、少なくとも一回の配送で生じる不確実性と、永続結果の重複を分離し、重複して見える証拠から誤った運用判断をしないようにします。

:::tip 組み込み Laravel のトレース相関

アプリケーションログをワークフロー実行やアクティビティの試行に関連付けるには、
任意の[組み込みモードのトレース連携（英語）](https://github.com/durable-workflow/workflow/blob/main/docs/embedded-tracing.md)を設定します。
キュー Worker、再試行、復旧をまたいで W3C コンテキストを保持し、アプリケーションの
OpenTelemetry プロバイダーと Laravel ログチャネルを使用します。ガイドでは、
トレースの有効化、ログ tap の追加、スキーマ移行の実行、エクスポートの制限を説明します。
ロールアウト前に、Span の関係図とランタイム・SDK の機能対応表を確認してください。

:::

### ダッシュボードビュー {#dashboard-view}

![Waterline ダッシュボード](https://raw.githubusercontent.com/durable-workflow/waterline/refs/heads/main/docs/screenshots/dashboard.png)

ダッシュボードは、実行中の総数、最近の実行カウンター、フリート全体のメトリクスを表示し、作業が流れているか、停止しているか、失敗しているかを一目で把握できます。

これらの事実に関するロールアウト・運用手順の契約には、[運用者の運用範囲](./operator-operating-envelope.md)を使ってください。トラフィックをブロックする診断と助言のみの診断、Waterline と Worker テレメトリ間のキューヘルスの分担、再構築・エクスポート・アーカイブ経路の検証方法を説明します。

### ワークフロービュー {#workflow-view}

![Waterline ワークフロー詳細](https://raw.githubusercontent.com/durable-workflow/waterline/refs/heads/main/docs/screenshots/workflow-detail.png)

ワークフロー詳細ビューは、一つの実行の永続タイムラインを表示します。発生したアクティビティ、シグナル、タイマー、子ワークフローを順番に示し、それぞれの入力、出力、時間を表示します。

## Waterline のデプロイとアクセス {#waterline-deployment-and-access}

### 組み込み Laravel {#embedded-laravel}

Workflow パッケージとともに Laravel アプリケーションへ Waterline をインストールし、マイグレーションを実行します。完全なインストール・設定ガイドは [durable-workflow/waterline](https://github.com/durable-workflow/waterline) を参照してください。

組み込みモードは、ホストアプリのデータベース接続、ルートミドルウェア、認証ゲート、Workflow パッケージを使います。Laravel アプリ、そのキュー Worker、スケジューラー、マイグレーション、Waterline アセットを一つのデプロイ境界として運用します。[Waterline 運用者 API リファレンス](./waterline-operator-api.md#installation)に、現在の Composer コマンドとアセット公開手順があります。

### Waterline サービス {#waterline-service}

公開イメージは独自の PHP・Laravel ランタイムを含みます。コンテナホストに PHP、Composer、Workflow パッケージは不要で、スタンドアロン Server のデータベースには接続しません。

次の例は、ホストポート `8080` のループバックにバインドし、独自 UI 状態を名前付きボリュームへ永続化し、一つの Server 名前空間へ接続します。

```bash
export WATERLINE_SERVER_ENDPOINT=https://workflow.example.com
export WATERLINE_SERVER_TOKEN=replace-with-a-server-token

docker run --detach \
  --name waterline \
  --restart unless-stopped \
  --publish 127.0.0.1:8080:8080 \
  --volume waterline-data:/data \
  --env WATERLINE_SERVER_ENDPOINT \
  --env WATERLINE_SERVER_TOKEN \
  --env WATERLINE_NAMESPACE=orders \
  --env WATERLINE_ACCESS_MODE=read_only \
  --env WATERLINE_ALLOW_UNAUTHENTICATED=true \
  --env APP_URL=https://waterline.example.com \
  durableworkflow/waterline:%%artifact.waterlineVersion%%
```

`APP_URL` が示す URL の `/waterline` を開きます。イメージはコンテナポート `8080` で待ち受けます。内部ポートを意図的に変える場合だけ `PORT` を設定してください。`WATERLINE_PATH` は既定の `waterline` URL 接頭辞を変更します。リポジトリには同じ接続境界の [Docker Compose サービス定義](https://github.com/durable-workflow/waterline/blob/main/deploy/docker-compose.service.yml)もあります。

サービスモードには独立した二つの認証層があります。

1. `WATERLINE_SERVER_TOKEN` は、PHP SDK が `WATERLINE_SERVER_ENDPOINT` を呼び出す際の bearer 認証情報です。ワークフロー、Worker、キュー、スケジュールの観測には Server の operator ロールが必要で、Server ヘルス・運用メトリクスには admin ロールが必要な場合があります。
2. ブラウザーと Waterline API のアクセスは、デプロイの入口の境界です。自己完結型イメージにはホスト Laravel のユーザーディレクトリがありません。そのため `WATERLINE_ALLOW_UNAUTHENTICATED=true` は、認証リバースプロキシの背後、または上記ループバックのようなプライベートインターフェースだけで使います。周囲の認証境界が整うまでは `false` にしてください。

`WATERLINE_NAMESPACE` は、調査したい名前空間に合わせます。全 SDK リクエストに送信されます。既定の `WATERLINE_ACCESS_MODE=read_only` は Waterline 内の変更操作をブロックします。`operator` は、必要なコマンドを許可する Server トークンがある場合だけ使います。

`/data` ボリュームは Waterline 所有の保存済みビュー、表示設定、Laravel ランタイム状態を保持します。既定では `/data/waterline.sqlite` にファイルベースの SQLite データベースを持ちます。Server のワークフロー履歴は含みません。独自状態を MySQL・PostgreSQL に置く場合は `DATABASE_URL` または通常の `DB_*` 設定を使います。

#### ヘルスとメトリクス {#health-and-metrics}

問いに応じて次のプローブを使います。

| インターフェース | 証明すること |
| --- | --- |
| `GET /up` | Waterline HTTP プロセスが起動し、応答できる。イメージの Docker ヘルスチェックはこのルートを使います。 |
| `GET /waterline/api/v2/health` | PHP SDK を通じて、名前空間単位の Server ヘルス、Worker 登録、タスクキューの証拠を組み立てられる。 |
| `GET /waterline/api/stats` | Waterline が使うダッシュボード総数と Server 由来の運用概要。 |
| Server の `GET /api/system/health` と `GET /api/system/operator-metrics` | Waterline から独立したネイティブ Server のヘルス・運用契約。 |

`/waterline/api/stats` は運用 JSON として扱い、Prometheus のスクレイプ先にはしません。Worker SDK メトリクス、ログ、トレース、カスタムテレメトリは引き続き Worker プロセスから取得します。`/up` は正常でも Waterline ヘルスや stats が利用不可なら、Waterline プロセス故障よりも、Server 接続、権限、名前空間、SDK 機能の境界を調べます。

#### ワークフローの可視性と運用操作 {#workflow-visibility-and-operator-actions}

サービスモードでは、一覧、選択実行詳細、履歴エクスポート、スケジュール、Worker 状態、タスクキューの証拠、シグナル、更新、クエリ、修復、キャンセル、強制終了、アーカイブは、PHP SDK を通じて設定先のスタンドアロン Server から投影します。Waterline のルート形式は [Waterline 運用者 API リファレンス](./waterline-operator-api.md)、基礎となる Server 契約は [Server API リファレンス](./polyglot/server-api-reference.md)のままです。

Waterline が表示するのは、設定した名前空間と接続先 Server 所有の実行だけです。組み込み実行は組み込み Waterline から、Server 管理の実行はサービスデプロイまたはネイティブ Server インターフェースから見ます。Waterline のバックエンド変更では、実行の移行や統合は行いません。

#### トラブルシューティングの境界 {#troubleshooting-boundaries}

| 症状 | 確認する境界 |
| --- | --- |
| `/up` 提供前にコンテナが終了する | 必須の `WATERLINE_SERVER_ENDPOINT`、書き込み可能な `/data`、有効な `PORT`、DB 設定、範囲を絞った起動時マイグレーションログを確認。 |
| Server 由来のビューが `401`・`403` を返す | `WATERLINE_SERVER_TOKEN` と Server ロールを確認。Waterline の入口の拒否は、別のプロキシまたは `WATERLINE_ALLOW_UNAUTHENTICATED` の問題です。 |
| 変更ルートが `waterline_read_only` を返す | 読み取り専用を維持するか、明示的に `WATERLINE_ACCESS_MODE=operator` を設定。Server トークンにもコマンド権限が必要です。 |
| 期待するワークフローがない | `WATERLINE_NAMESPACE`、Server エンドポイント、開始を受理したランタイムを確認。他の名前空間や組み込みランタイムは検索しません。 |
| `/up` 成功でもヘルス・stats・ビューが機能利用不可を報告する | Server API・CLI で接続先を直接検証し、トークンロールと、公開 Waterline/PHP SDK 組み合わせが必要メソッドを持つかを確認。 |
| サービスカタログルートが `backend_capability_unavailable` を報告する | サービスモードは組み込みの名前空間横断サービスカタログを複製しません。接続先 Server のネイティブサービスエンドポイントと API を使います。 |
| Waterline にカスタムメトリクスがない | Worker のメトリクスエクスポーターを調査。Waterline は永続的な運用の事実を報告し、任意のプロセスメトリクスは扱いません。 |

### Cloud Managed Waterline {#cloud-managed-waterline}

Cloud 顧客は、名前空間単位のマネージド運用インターフェースから Cloud Managed Waterline を開きます。Waterline、Server、PHP、内部エンドポイントをデプロイ・設定せず、二つ目の Waterline ログインも管理しません。上記のセルフホストイメージ、`WATERLINE_*` 設定、Server トークン、データベース、入口認証の手順は適用されません。

顧客の Cloud 認証が運用者の識別情報を確立します。Cloud の組織、プロジェクト、環境、名前空間の権限が、開ける Managed Waterline の範囲を決めます。その境界内で、ワークフロー一覧と検索、実行詳細と永続履歴、名前空間ヘルス、ロールが許す運用操作を使えます。選択名前空間に限定され、他環境・名前空間のデータを統合しません。

変更はロールで制御します。Cloud は、サポートする各運用変更を認証済み Cloud アクターに監査データで関連付けます。結果の永続ワークフロー遷移は履歴にも見えます。例えばアーカイブ成功は Cloud 監査データに主体を記録し、永続 `WorkflowArchived` イベントを記録します。利用にプライベートなランタイム認証情報や内部デプロイの知識は不要です。

## 一覧・詳細 API {#list-and-detail-api}

Waterline の一覧ビュー（`/waterline/api/flows/{bucket}`）と選択実行詳細（`/waterline/api/flows/{id}`）は、独自ダッシュボードやスクリプトで直接利用できる型付き JSON 契約を返します。[Waterline 運用者 API リファレンス](./waterline-operator-api.md)は、エンドポイント一覧、選択実行のフィールド分類、履歴エクスポート、操作可否、スケジュール、保存済みビュー、設定、運用操作契約を記載します。

### 操作可否の契約 {#actionability-contract}

Waterline は一覧行、選択実行詳細、履歴エクスポートに、バージョン付きの操作可否契約を付けます。利用側は `actionability_contract.schema = waterline.actionability` と `actionability_contract.version = 1` を以下のフィールドの契約識別子として扱います。

実行単位の `actionability` は、選択実行を修復できるかを示します。

| フィールド | 意味 |
| --- | --- |
| `repair_state` | `repairable`、`blocked`、`not_needed`、`unknown` のいずれか。 |
| `repairable` | `repair_state = repairable` の真偽値による略記。 |
| `blocked_reason` | `repair_state = blocked` の場合の安定した理由コード。 |
| `status_bucket` | 実行単位の判断に使った Waterline バケット。 |
| `closed_reason` | 実行が終了している場合の永続的な終了理由。 |
| `task_problem` | 実行にタスク単位の問題を検出したか。 |
| `diagnostic_only_evidence` | 子の証拠行の少なくとも一つが参考情報であり、再開元ではない場合 true。 |

`activities`、`waits`、`timers`、`exceptions`、`logs`、タイムライン・エクスポートの各証拠行も、独自の `actionability` を持つ場合があります。

| フィールド | 意味 |
| --- | --- |
| `state` | 有効な修復元なら `actionable`、それ以外は `diagnostic_only`。 |
| `repair_source` | 修復可能な規範情報源に裏付けられた行だけ true。 |
| `diagnostic_only` | 再開元として使ってはいけない場合 true。 |
| `history_authority` | `typed_history`、`mutable_open_fallback`、`failure_row_fallback`、`unsupported_terminal_without_history` などの規範情報源。 |
| `history_unsupported_reason` | 未対応のフォールバック履歴の安定した理由コード。 |

自動化は、`actionability.repair_state`、`actionability.repairable`、行単位の `actionability.repair_source` に基づき、修復、再開、リプレイの操作を許可すべきです。`diagnostic_only = true` の行は、有用な失敗やフォールバックメタデータを含んでも、永続的な再開元にはなりません。`history_authority = unsupported_terminal_without_history` は診断証拠だけです。ブロック理由は説明しますが、安全に進捗を再構築する十分な型付き履歴を証明しません。

## Waterline からのコントロールプレーン操作 {#control-plane-actions-from-waterline}

運用者は詳細ビューから直接、キャンセル、強制終了、修復、アーカイブできます。各操作は同じ実行 ID への `POST` に対応し、結果状態付きの `200`、または現在状態で無効なら `409` を返します。

サービスモードでは、PHP SDK を通じてサポートするコマンドを転送します。変更には `WATERLINE_ACCESS_MODE=operator` と、コマンド権限を持つ Server 認証情報の両方が必要です。Waterline がなくても Server API・CLI を直接使用できます。

Cloud Managed Waterline では、Cloud ロールと名前空間権限が変更を制御し、認証済み Cloud 識別情報が監査の主体となります。顧客が Waterline から Server への認証情報を設定することはありません。

## 関連ガイド {#related-guides}

- [実行保証と冪等性](./constraints/execution-guarantees.md)は、運用証拠を形作るリプレイ、リトライ、リース期限切れ、永続結果の契約を説明します。
- [運用者の運用範囲](./operator-operating-envelope.md)は、ヘルス、キュー状態、再構築、エクスポート、アーカイブ、トポロジーの期待を一つの運用契約に結び付けます。
- [失敗と復旧](./failures-and-recovery.md)は、ダッシュボードの事実の背後にある、リトライ枯渇、リトライ不可の失敗、タイムアウト、修復の動作を説明します。
- [AI 支援による開発](./ai-assisted-development.md)は、状態診断時にエージェントが使うべき Waterline、CLI、MCP、LLM 可読契約を示します。
