---
sidebar_position: 13
title: セルフホストのデプロイ
description: サポートする Durable Workflow v2 のセルフホスト経路と、出発点となる成果物を選びます。
---

# セルフホストのデプロイ {#self-hosting-deployments}

Durable Workflow v2 は複数のセルフホスト構成に対応します。運用環境に合う最小の経路を選び、イメージ、DB、キャッシュ、認証、準備状態、アップグレードの契約を明示してください。

このガイドはスタンドアロン Server の配布を扱います。Laravel アプリに組み込む場合は、パッケージのインストール・設定ページを使います。Durable Workflow Cloud は、ランタイム、永続化、配置、復旧を Cloud が運用する別のマネージドサービスです。セルフホスト Server を Cloud に接続することはありません。[Cloud マネージドランタイム](/docs/polyglot/cloud-control-plane)を参照してください。現在の契約は単一リージョンのランタイム・復旧境界であり、マルチリージョン複製、自動リージョンフェイルオーバー、フェイルバックを約束しません。

Server は Waterline を同梱・運用しません。運用 UI が必要な場合だけ別途デプロイし、[Waterline デプロイ・監視ガイド](/docs/monitoring/#waterline-service)に従って Server 所有の名前空間へ接続します。Cloud は代わりに Managed Waterline を含みます。

## デプロイのサポートマトリクス {#deployment-support-matrix}

| 経路 | 出発点 | 対応する用途 | この経路が約束しないもの | 商用サポートの開始点 |
| --- | --- | --- | --- | --- |
| ローカル開発・社内非本番 | `%%artifact.serverTagEnv%%` または `%%artifact.serverImageEnv%%` を使う [`docker-compose.published.yml`](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml) | 開発マシン一台、LAN デモ、共有ステージング、SDK・Worker 統合テスト | インターネット公開本番、永続バックアップ保証、厳密な秘密ローテーション、マルチノードフェイルオーバー | 開発スタックを本番手順書にする支援が必要 |
| 単一ノード本番 | 同じ [`docker-compose.published.yml`](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml) に本番 env、MySQL・Redis ボリューム、ロール別トークン、バックアップ、リバースプロキシ TLS、固定タグ・ダイジェストを設定 | 永続状態と単純な運用モデルを持つ VM、VPS、社内 Docker ホスト一台 | ホスト HA、自動 DB フェイルオーバー、マルチリージョン復旧、無停止の大規模トポロジー変更 | 本番でバックアップ、復元、認証、TLS、更新、復帰手順のレビューが必要 |
| 小規模クラスター | 公開 `durableworkflow/server`・`ghcr.io/durable-workflow/server`、[Compose 手順](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml)をプロセステンプレートにし、API 2～3 台、共有外部 MySQL/PostgreSQL、Redis、独立 Worker、厳密に一つのスケジューラー・保守ランナー | 一台では不足する API・Worker 容量の水平拡張。[順次更新契約](/docs/rolling-upgrades)の全条件成立時のローリング更新 | SQLite クラスター、Redis なしの複数ノード、定常的な重複スケジューラー、アクティブ/アクティブ複数書込 DB、無人リージョン切替、広範な「ファイブナイン」「無停止」SLA、[証拠ゲート](#release-evidence-status)通過前のセルフサービス単一リージョン HA | 複数ホストの容量、障害ドメイン、更新、復旧計画が必要、またはゲート対象 HA を主張したい |
| Kubernetes Helm チャート | `oci://ghcr.io/durable-workflow/charts/durable-workflow` の [Server 所有チャート](https://github.com/durable-workflow/server/tree/main/k8s/helm/durable-workflow)と外部 DB、Redis、ingress、秘密管理 | Server、Worker、単一スケジューラー、bootstrap、service、probe、policy の再現可能な本番導入・更新 | 永続化の同梱、プロバイダー管理インフラ、アクティブ/アクティブのマルチリージョン、独自 operator、[証拠ゲート](#release-evidence-status)通過前のセルフサービス HA | プロバイダー固有設計、容量、復旧、公開 values 契約外の変更が必要 |
| 生の Kubernetes マニフェスト | Server の [`k8s/`](https://github.com/durable-workflow/server/tree/main/k8s)、公開イメージ、既存 DB・Redis・ingress・秘密管理 | Kubernetes 運用済みチーム向けの、API、Worker、スケジューラー、bootstrap、service、probe、config、secret の調査可能な定義 | 別の Helm ライフサイクル、マネージド Kubernetes 検証、アクティブ/アクティブのマルチリージョン、独自 operator、環境固有ストレージ・ネットワーク・セキュリティ判断、[証拠ゲート](#release-evidence-status)通過前のセルフサービス HA | オーバーレイ、管理クラスター検証、プロバイダー固有本番計画、ゲート対象 HA が必要 |
| アクティブ/パッシブのマルチリージョン評価 | リージョンごとの検証済み単一ノード・小規模クラスター、アクティブから待機側への非同期 DB 複製、レビュー済み切替・復帰手順 | サポート主導の地域災害復旧設計評価と環境固有リハーサル | 実証済みセルフサービス 2.0 契約、アクティブ/アクティブ、自動・無人リージョン切替、同期複製（RPO=0）、リージョン間アクティブ可視性・連合検索、エンジン強制の地域固定キュー | 本番で複製、切替、復帰、RPO、RTO に依存する前 |
| サポート主導のトポロジー | 環境に基づくレビュー済み設計 | セルフホストの複数リージョン、無人切替、RPO=0 複数書込複製、定常重複スケジューラー、独自セキュリティ・ネットワーク、非公開 SLO、オーバーレイ、移行計画 | コピーして実行するだけのセルフサービス | トポロジー自体が製品リスクの一部となる |

公開配布は、ローカル、単一ノード本番、小規模クラスターに最適化しています。Kubernetes マニフェストは既存運用チーム向けです。[アクティブ/パッシブのマルチリージョン](#activepassive-multi-region)はサポート主導の評価用で、実証済みセルフサービス契約ではありません。

単一リージョンの HA（管理 DB・Redis の切替、API・Worker 喪失、スケジューラー再起動）は、正確なリリースの証拠ゲートが閉じている間はサポート主導です。[単一リージョンの高可用性とフェイルオーバー](#single-region-high-availability-and-failover)を参照してください。セルフホストのアクティブ/アクティブ、自動リージョン切替、定常重複スケジューラー、プロバイダー固有 Kubernetes 検証は、DB、キャッシュ、ネットワーク、セキュリティ、ランナー、更新の選択に依存するためサポート主導です。Helm は同じ運用者所有境界内のセルフサービスパッケージ化経路です。Cloud は現在単一リージョンの運用・復旧であり、複製・リージョン切替を提供しません。[Cloud マネージドランタイム](/docs/polyglot/cloud-control-plane)と[サポート境界](/docs/support)を参照してください。

## 本番復旧の成果物 {#production-recovery-deliverables}

「本番対応」とは、コンテナを起動するだけでなく、その構成の復旧パケットを公開することです。最新証拠をデプロイコマンドと同じ手順書に保ちます。

| 経路 | 最低限の公開復旧パケット |
| --- | --- |
| 単一ノード本番 | バックアップ周期、固定イメージ・ダイジェスト、env・設定スナップショットの場所、許容する最大復元遅れ、最新の復元成功リハーサル日時と検証証拠。 |
| 小規模クラスター | 上記に加え、API 一台、Worker 一台、スケジューラー、Redis、共有 DB 喪失の想定影響、復元後の Worker 再登録、当該リリースの順次更新または全停止方針。 |
| Helm チャート | クラスターパケットに加え、チャート版、values リビジョン、イメージダイジェスト、ingress・秘密の担当、最新更新・復帰リハーサル。 |
| 生の Kubernetes | クラスターパケットに加え、正常宣言前に復元・再適用が必要なストレージ、秘密、ingress、ロールアウトの担当。 |
| 単一リージョン HA 評価（ゲート閉鎖中はサポート主導） | クラスターまたは生定義のパケットに加え、管理 DB・Redis 切替、API・Worker 喪失、スケジューラー再起動が、[HA 契約](#single-region-high-availability-and-failover)の目標内で確認済み書込を失わず完了した証拠。 |
| アクティブ/パッシブのマルチリージョン評価（サポート主導） | リージョン別パケットに加え、複製・フェンシング設計、測定遅延、運用者所有 RPO/RTO、昇格・復帰手順、環境固有リハーサル。 |

要求時に出せない場合、文書化とリハーサルまでステージングと扱います。[運用者の運用範囲](/docs/operator-operating-envelope)が、復元順序、検証、リハーサル頻度を定めます。

## セキュリティ、データ、監査の方針 {#security-data-and-audit-posture}

多くのセキュリティ管理は運用環境から継承します。イメージタグ、移行計画、復旧証拠と同じパケットに次を公開します。

| 領域 | 正確なリリースの説明 |
| --- | --- |
| データ処理 | 引数、結果、履歴、メモ、検索属性、ラベル、コマンド文脈、監査行、例外文、運用注記は顧客データを含み得る。[ワークフロー ID](./defining-workflows/workflow-id.md#ids-are-visible-metadata)、属性、ラベルは見えるメタデータで、秘密保管先ではない。ID は平文でコーデック対象外。 |
| 暗号化 | 本番 HTTP は全て TLS。マイグレーションを含む Server の全ロールで [データベース TLS](./polyglot/server-config-reference.md#database-tls) も設定する。保存時暗号化は DB、オブジェクトストレージ、ファイルシステム、キュー、キャッシュ、秘密管理が担う。パッケージ・Server は各ペイロードフィールドを自動暗号化しない。 |
| コンプライアンス | OSS とセルフホストは管理機能・監査証拠を提供し、単独で認証にはならない。SOC 2、HIPAA、PCI、ISO、FedRAMP 等は、ホステッド契約で別途明記しない限り自社プログラムの責任。 |
| 監査ログ | コマンド、スケジュール監査、エクスポートメタデータ、サービス呼出記録は永続証拠。追加構築なしに完全な SIEM、DLP、不変外部台帳、法的保全システムにはならない。 |
| サポート | 限定ロール認証、TLS、バックアップ、復元訓練、狭いセルフサービス構成は文書化済み。高度な ID、mTLS、プライベートネットワーク、独自ポリシー、プロバイダー準拠、独自構成レビューは明示がなければサポート主導。 |

ネットワークの方針も明示します。

- **Webhook 入口:** 公開 endpoint、認証、再送・冪等性、タイムアウト、ペイロード上限、信頼プロキシヘッダー設定、秘密更新計画を文書化。
- **Worker とバックエンド:** TLS 検証、Worker 限定認証、名前空間ヘッダーを使用。信頼できない網を越えるならプライベート接続・mTLS を使い、更新で Worker トークンに運用権限を与えない。
- **運用画面:** Waterline、Server 運用 API、CLI 自動化 endpoint、独自管理画面を、認証セッションまたは限定サービス認証の背後に置き、ブラウザー CSRF 保護とプロキシ・TLS 境界を文書化。

## 公開イメージ {#published-images}

セルフホストには公開イメージを使います。

- Docker Hub: `%%artifact.serverDockerHubImage%%`
- GitHub Container Registry: `%%artifact.serverGhcrImage%%`
- ダイジェスト固定: `durableworkflow/server@sha256:...` または `ghcr.io/durable-workflow/server@sha256:...`

可変タグはローカル実験だけに使います。本番 env は特定版・ダイジェストへ固定し、更新と復帰を監査可能にします。

## ローカル開発と社内非本番 {#local-development-and-internal-non-production}

ソース不要の MySQL・Redis スタックには公開イメージ Compose を使います。

```bash
curl -fsSLO https://raw.githubusercontent.com/durable-workflow/server/main/docker-compose.published.yml

export %%artifact.serverTagEnv%%
export DW_AUTH_TOKEN=dev-token

docker compose -f docker-compose.published.yml up -d --wait
```

API、準備状態、クラスター検出、Worker 登録を検証します。

```bash
curl http://localhost:8080/api/health
curl http://localhost:8080/api/ready
curl -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  http://localhost:8080/api/cluster/info

curl -X POST http://localhost:8080/api/worker/register \
  -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Namespace: default" \
  -H "X-Durable-Workflow-Protocol-Version: 1.0" \
  -d '{"worker_id":"compose-worker","task_queue":"compose","runtime":"python"}'
```

開発・社内ステージング向けです。一つの互換トークン、既定パスワード、ローカルボリュームを使い、TLS もないため、本番のセキュリティ境界にはなりません。

## 単一ノード本番 {#single-node-production}

同じ Compose に、ソース管理外の本番設定を使います。

```env
%%artifact.serverImageEnv%%
SERVER_PORT=8080
APP_ENV=production
APP_DEBUG=false

DB_DATABASE=durable_workflow
DB_USERNAME=workflow
DB_PASSWORD=replace-with-random-password
DB_ROOT_PASSWORD=replace-with-random-root-password

DW_AUTH_DRIVER=token
DW_AUTH_BACKWARD_COMPATIBLE=false
DW_WORKER_TOKEN=replace-with-worker-token
DW_OPERATOR_TOKEN=replace-with-operator-token
DW_ADMIN_TOKEN=replace-with-admin-token
```

その env で開始します。

```bash
docker compose --env-file durable-workflow.prod.env \
  -f docker-compose.published.yml up -d --wait
```

本番サービスとして運用します。

- API の前にリバースプロキシを置き、TLS、公開ルーティング、リクエストログ、IP 許可リストを担わせる。
- MySQL・Redis を公開しない。
- Worker は `DW_WORKER_TOKEN`、アプリ・運用は `DW_OPERATOR_TOKEN`、名前空間・管理は `DW_ADMIN_TOKEN`。
- 毎更新前と定期的に MySQL をバックアップ。Redis は正常再起動のため保持するが、永続履歴の正しい情報源は MySQL。
- 復元用に正確な env、イメージ版・ダイジェスト、DB バックアップをまとめる。

更新順序:

1. MySQL をバックアップし現在イメージを記録。
2. `DW_SERVER_IMAGE` または `DW_SERVER_TAG` だけ変更。
3. 新イメージを pull。
4. `docker compose --env-file durable-workflow.prod.env -f docker-compose.published.yml up -d --wait` を実行。
5. 外部トラフィック前に `/api/ready`、`/api/cluster/info`、Worker 登録を確認。

最新のコマンド例は Server README の[公式イメージと Compose](https://github.com/durable-workflow/server#official-image--compose)にあります。

## 小規模クラスター {#small-clustered-deployments}

単一ノードの控えめな拡張です。検証済みセルフサービス契約は意図的に限定しています。

- ステートレス API 2～3 台を LB 配下に配置。ヘルス、準備状態、検出、登録、タスク取得・完了がスティッキーセッションなしで動作する。
- 永続履歴は共有外部 MySQL・PostgreSQL。一台用 SQLite はクラスター永続化に使わない。
- キャッシュ、ロングポール起動、クエリータスクキューロック、受付ロック、キュー状態に共有 Redis。Redis なしの複数ノードは未対応。
- 更新時は各ノードの `GET /api/cluster/info` を確認。`topology.current_shape` は `standalone_server`、`topology.current_roles` は `api_ingress`、`control_plane`、`matching`、`history_projection`、`topology.execution_mode` は `remote_worker_protocol`。実 matching を `topology.matching_role` で確認。既定は `queue_wake_enabled: true`、`shape: "in_worker"`、`wake_owner: "worker_loop"`。専用化で `DW_V2_MATCHING_ROLE_QUEUE_WAKE=0` のノードは `queue_wake_enabled: false`、`shape: "dedicated"`、`wake_owner: "dedicated_repair_pass"`。意図した `task_dispatch_mode`、固定軸 `partition_primitives`、現在の `backpressure_model` も通知する。[Server ロールトポロジー](/docs/polyglot/server-role-topology)に各フィールドの意味がある。
- 外部 SDK Worker は API と独立に拡張。別ホストでも、特定ノードでなく LB endpoint へ接続。
- テナント、外部 API、DB プールなど共有依存を保護するキューに[タスクキュー受付制御](/docs/polyglot/task-queue-admission)を設定。
- スケジュール評価、アクティビティ期限、履歴削除のスケジューラー・保守は厳密に一つ。
- 新 API・Worker の受付前に、更新ごとに一回 bootstrap・移行。
- 全停止（Worker ドレイン、スケジューラー停止、API 置換、bootstrap、Worker・スケジューラー再開）か、全保証成立時の[順次更新](/docs/rolling-upgrades)を選ぶ。
- DB と Redis を主要障害ドメインと扱う。Server コンテナは置換可能だが永続化・協調層はそうではない。

公開手順は `standalone_server` で始まります。検出には対応トポロジー `split_control_execution` もありますが、別製品ではなくロール割当の異なる一つの契約です。後に明示的分離を試す場合も、ホスト名・コンテナ名から推測せず `/api/cluster/info` の `topology.current_shape`、`topology.current_roles`、`topology.matching_role` を読みます。[Server ロールトポロジー](/docs/polyglot/server-role-topology)に割当と移行経路をまとめています。

全 API ノードで認証トークン・署名キー、アプリ版、Workflow 版、コーデック、DB、Redis 接続を同じにします。各 `DW_SERVER_ID` は一意にし、検出・ログで識別します。

SQLite クラスター、Redis なしの複数ノード、定常重複スケジューラー、アクティブ/アクティブ複数書込 DB、無人リージョン切替、広い「ファイブナイン」「無停止」SLA は、依存前に別検証・サポート設計が必要です。[アクティブ/パッシブ](#activepassive-multi-region)も評価用です。単一リージョン HA は証拠ゲート通過までサポート主導です。[以下](#single-region-high-availability-and-failover)に復旧目標、準備状態、ゲートの証拠を示します。

VM、網、DB、キャッシュ、バックアップ、LB のモデルが明確ならセルフサービスです。それらの境界、容量、更新順序、復旧判断に支援が必要ならサポート主導です。

## Worker のロングポーリングのタイムアウト予算 {#worker-long-poll-timeout-budgets}

正常なポーリングでも、サーバーの待機が終わるまでデータが届かないことがあります。Worker の HTTP クライアント、送信プロキシ、サービスメッシュ、公開ロードバランサー、ingress、API 前の各リバースプロキシで、この無通信時間を許容してください。Worker のポーリングも共有 API ingress を通ります。matching ロールを分離しても、これらの経路は迂回しません。

| 予算 | 制限する範囲 |
| --- | --- |
| サーバーのポーリング時間 | タスクを待って空の応答を返すまでの時間。リクエストの `timeout_seconds` は `DW_WORKER_POLL_TIMEOUT` より優先されます。環境変数はフィールド省略時の既定値であり、SDK の上限ではありません。プロトコルの上限は 60 秒です。 |
| クライアントの接続 / プールタイムアウト | 接続の確立、またはプールからの取得。無通信のポーリング全体と同じ長さにする必要はありません。 |
| クライアントの読み取り / 全体タイムアウト | 応答バイトの待機、またはトランスポートが対応する場合の操作全体。サーバーの待機に接続、スケジュール、応答の余裕を加えます。読み取りタイムアウトは要求全体でなく、チャンク間の無通信時間の場合があります。 |
| 中継点の idle / upstream read / 要求タイムアウト | すべての経路の実行中要求の制限で、正常な待機と応答を許容します。要求間のアイドル接続 keepalive は別の制限です。 |
| 停止 / 呼び出し元の期限 | Worker の停止予算と呼び出し元やクエリの元の権限期限は厳密な上限です。その範囲内でキャンセルまたはドレインし、プロキシや再試行のためにクエリ期限を延長しないでください。 |

インストールした SDK の計算方法を確認してください。以下で検証した Python 版は、正の待機時間をサーバーに最大 60 秒として要求し、HTTP 各フェーズに少なくとも 5 秒を加えます。Worker の既定のポーリングは 35 秒で、通常は各 HTTP フェーズが 40 秒になります。中継点の読み取り制限が 30 秒だと、正常な既定ポーリングを切断する場合があります。PHP と Rust の既定値と再試行ポリシーはそれぞれ異なります。Python の余裕時間や gRPC keepalive 設定は共通ルールではありません。[PHP](https://php.durable-workflow.com/)、[Python](https://python.durable-workflow.com/)、[Rust](https://rust.durable-workflow.com/) SDK と[matching リファレンス](./polyglot/task-matching-dispatch.md)を参照してください。

PHP SDK **3.2.0** の通常の制御プレーン `Client` 呼び出しには、既定の HTTP 全体期限がありません。[PHP #203 の検証済みの制限](https://github.com/durable-workflow/sdk-php/issues/203)を参照し、有界の HTTP クライアントを設定して、呼び出し元の元の期限を保ってください。Worker のポーリングタイムアウトは、SDK のすべての要求の期限ではありません。

PHP SDK **3.4.0 以降**は SDK 所有のトランスポートによる通常の制御 HTTP 要求に**既定60秒の全体期限**を設けます。`0.001` 秒以上の有限値を `requestTimeoutSeconds` で設定できます。SDK 所有の要求のタイムアウトは `reason=request_timeout` と `status=0` を持ちます。SDK は1回だけ試行します。応答がタイムアウトしても変更は受理済みの可能性があるため、再送前に元の識別子と結果を確認してください。注入したクライアント/トランスポートは独自の方針を保ち、このオプションと併用できません。要求単位の制限は worker long-poll、payload 転送、workflow/呼び出し元の期限を置き換えません。`composer.lock` を確認してください。この最低バージョンは選択済みインストール構成を更新しません。[HTTP 設定](https://php.durable-workflow.com/getting-started/client-setup/)と[3.4.0 の通常インストール検証](https://github.com/durable-workflow/sdk-php/issues/203#issuecomment-6363909756)を参照してください。

### 検証済みの短いポーリング例 {#verified-poll-timeout-example}

独立した検証で、公開済み Python SDK **2.9.0**、PHP Server **2.11.0**、Nginx **1.30.5** と空のタスクキューを使いました。両ケースとも SDK の待機は **3 秒**、HTTPX の connect/read/write/pool は **8 秒**、呼び出し元の外側の期限は **10 秒**で固定しました。変更したのは Nginx の upstream 読み取りタイムアウトだけです。

| 中継点の設定 | 観測した応答 |
| --- | --- |
| `proxy_read_timeout 1s` | upstream の応答ヘッダーを待つ途中、約 1 秒で Nginx が HTTP **504** を返し、SDK は `ServerError` を報告しました。 |
| `proxy_read_timeout 8s` | 正常なポーリングが約 3 秒後に HTTP **200**、`task: null`、`poll_status: empty` で完了しました。 |

両ケースでサーバーの既定値は意図的に 1 秒にしましたが、要求の明示的な 3 秒が適用されました。最初の失敗を見るため、HTTP 試行は 1 回だけにしています。これは機能検証であり、容量や本番サイジングの結果ではありません。[#267 の検証記録](https://github.com/durable-workflow/durable-workflow.github.io/issues/267)に正確なイメージ、要求、プロキシログがあります。

Nginx では既存の Worker ポーリング用 location に適切な upstream 読み取り予算を設定します。次の 8 秒は、この 3 秒ポーリング例の値です。

```nginx
proxy_connect_timeout 2s;
proxy_read_timeout 8s;
```

[Nginx の `proxy_read_timeout` は upstream 読み取り間を測ります](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_read_timeout)。[HTTPX は接続、読み取り、書き込み、プールを区別します](https://www.python-httpx.org/advanced/timeouts/)。各フェーズの 8 秒は全体の 8 秒期限ではありません。必要な場合は外側の期限も明示してください。他のプロキシやプロバイダーでは名称と意味が異なります。実際の SDK で経路全体を検証し、一つの ingress 設定を増やすだけで別の短い制限も直ったと判断しないでください。

### Worker を再起動する前に応答を診断する {#diagnose-poll-disconnects}

- **通常の空ポーリング：** runtime がタスクなしで成功応答を返します。検証した版の生の応答は `poll_status: empty` です。通常どおりポーリングを続けます。
- **中継点の切断：** トランスポート例外、接続リセット、プロキシの 502/504 がサーバーの正常待機終了前に起きる場合があります。SDK エラーと経過時間をプロキシ/upstream ログと照合します。readiness が正常で後続の要求が成功しても、中継点の設定が正しいとは限りません。
- **runtime が利用不可：** データベース、キャッシュ、受付の構造化された理由と readiness を確認します。ゲートウェイの HTML エラーは runtime の型付き拒否ではありません。
- **名前空間やポーリングの受付拒否：** HTTP 429 を含め、理由、名前空間/キュー、再試行間隔を確認します。idle 制限を増やしても容量や認可は改善しません。

Worker の再接続は、元のプロキシ設定が正常だった証拠ではありません。ポーリングとタスク完了が実際に継続しているか確認し、失敗が続く場合は種類、キュー、時刻、頻度を残してください。単発の切断だけでプロセスを再起動する必要はありません。Python クライアントは HTTP タイムアウトの再試行後に `poll_status: timeout` を合成する場合もあります。この値だけでは、runtime の空応答がプロキシを通過した証拠になりません。トランスポート再試行とアクティビティ再試行、実行期限、クエリの権限期限を区別してください。

## SQL 接続の予算 {#sql-connection-budgets}

API レプリカの追加や、[ローリング更新](/docs/rolling-upgrades)で旧・新プロセスを
同時稼働させる前に、データベースセッションの予算を決めます。CPU に余裕があっても
接続上限に達することがあります。これは書き込み・commit 遅延、HTTP リクエスト容量、
保持データの増加とは別の制約です。

### SQL を使う全プロセスを数える {#count-every-sql-owning-process}

公開 PHP Compose 構成では、次の役割が SQL クライアントになり得ます。

| 役割 | 数える対象 |
| --- | --- |
| API | SQL を利用し得る同時実行 PHP リクエストプロセスすべて。準備状態確認、運用リクエスト、待機中の poll も含みます。公開 Apache prefork 設定は API コンテナごとに最大 24 リクエストプロセスです。これは HTTP プロセス上限であり、SQL プールサイズや 24 セッションが開いているという測定値ではありません。 |
| Laravel キュー Worker | `php artisan queue:work` プロセスごとに数えます。公開 Compose レシピでは一つですが、Worker コンテナを追加するとプロセスも増えます。外部 SDK Worker とは別です。 |
| スケジューラー・保守 | コンテナ数だけでなく、同時に動く PHP コマンドを数えます。Compose スケジューラーはスケジュール評価、修復、アクティビティのタイムアウト、履歴削除を順番に実行するため、通常のループでは同時に一コマンドが動きます。スケジューラー単一実行の原則を守ります。 |
| 初期化と運用ツール | 更新中に重なるマイグレーション・初期化、投影再構築、保持処理、バックアップ、監視、対話的 SQL クライアント。意図的に並列実行するコマンドは個別に数えます。 |
| SDK クライアント・Worker | 通常、Server データベースへの直接接続はゼロです。サービスモードの PHP・Python・Rust SDK は HTTP を使います。アクティビティや他のアプリコードが実際に同じ DB に接続する場合だけ加算します。 |

コンテナ数やホスト名だけでなく、**各プロセスが使う個別の SQL 接続ハンドル**を
数えます。Laravel のデフォルト接続と `workflows.storage.connection` は同じ設定名を
共有する場合があります。保存先の接続名が異なる場合や、DB キュー・キャッシュ・
セッション用接続、読み取り・書き込み・直接接続の別ハンドルを使う場合は、同じ DB
エンドポイントでも追加セッションが開くことがあります。Redis 接続は SQL セッション
ではありません。有効なキャッシュ済み設定と、各役割が実際に使う接続名を調べます。

独自 FPM 構成では nginx や Apache event のスレッドではなく、PHP-FPM の実行子プロセスを
数えます。独自 Octane 構成ではリクエスト Worker、タスク Worker、実際の DB クライアントを
洗い出します。どちらも Apache の 24 プロセスをそのままプールサイズにしないでください。
同期 long poll は待機中も PHP 実行プロセスを占有し、DB セッションを保持する場合が
あります。仕事のない HTTP poll の SQL 使用量を自動的にゼロと見積もらないでください。

### 保守的なローリング更新の計算例 {#a-conservative-rolling-upgrade-example}

これは計画例であり、**測定済みの処理容量ではありません**。DB のクライアントセッション
上限を 120、他のアプリ用を 10、復旧・管理用の予約を 15 とすると、この構成の割当は 95
です。キュー・キャッシュは Redis、PHP プロセスごとの SQL ハンドルは最大一つと仮定します。

| 最大重複時 | 計算 | 計画セッション数 |
| --- | --- | ---: |
| 更新用の追加一台を含む API レプリカ | `(2 + 1) × 24 × 1` | 72 |
| Laravel キュー Worker | `2 × 1` | 2 |
| 単一スケジューラー・保守コマンド | `1 × 1` | 1 |
| 初期化・マイグレーション | `1 × 1` | 1 |
| バックアップ、監視、その他承認済みツール | 明示的な割当 | 4 |
| **構成の小計** | | **80** |
| 構成内の未割当余裕 | `95 − 80` | 15 |

この仮定では API を四台にすると小計 104 となり、割当 95 を超えます。API プロセスごとに
SQL ハンドルが二つなら、三台の API だけで 144 セッション必要です。保存用接続、Worker 数、
更新中の追加レプリカ数を変えたら再計算します。DB が重複分を吸収すると決めつけず、
プロセス・レプリカ上限を下げるか段階的に置き換えます。`max_connections` を増やす場合も、
DB のメモリと負荷を評価する必要があります。

### 予算を観測して守る {#observe-and-enforce-the-budget}

1. 有効な接続上限、他のクライアント、復旧用予約を記録します。API レプリカ・プロセス数と
   更新中の追加数に明確な上限を設けます。新旧キュー Worker やツールの重複も含めます。
2. 正確な公開イメージと設定を使った隔離環境で、アイドル時、poll 待機中、実際の処理中、
   時間を区切った新旧重複時のセッションを採取します。アイドルセッションと監視接続自身も
   数えます。PostgreSQL は `pg_stat_activity`、MySQL は `information_schema.PROCESSLIST` を
   提供します。適切に権限を限定した監視ロールを使い、SQL 文やペイロードは持ち出しません。
3. アプリユーザー・DB ごとの観測数とプロセス単位の割当を比較します。短い観測はその
   テスト構成の仮定を検証するだけで、飽和限界や全負荷に対する保証ではありません。
4. セッション余裕に加え、接続拒否、トランザクション・commit 遅延、ロック待ち、保持中の
   HTTP リクエスト、ストレージ増加を監視します。準備状態が正常でも更新余力の証明にはなりません。
5. 上限に近いときは重複を減らすか、旧 API・Worker グループをドレインして終了してから
   後継を起動します。復旧アクセスを残し、初期化は計画したマイグレーション時間帯だけに
   実行します。安全な重複が収まらなければ、文書化された全停止の更新手順を使います。

[タスクキューの受付制御](/docs/polyglot/task-queue-admission)は一部の配信・リース処理を
制限します。`DW_WORKER_LONG_POLL_MAX_CONCURRENT` と `DW_QUERY_TASK_POLL_MAX_CONCURRENT` は
ノード内の待機 poll を制限します。いずれも SQL セッション全体、DB バイト数、commit 遅延の
上限ではありません。完了、heartbeat、運用リクエスト、ヘルスチェック用の容量も残します。

まず書き込み可能な DB への直接接続を基準にします。接続プロキシは、正確な Server リリース、プールモード、準備済み文、トランザクション境界、セッション状態、ロックの設定で検証する必要があります。**PgBouncer のトランザクションプールには、修正済みの Server 2.9.8 以降が必要です。** [公開版 2.9.8 の受け入れ結果](https://github.com/durable-workflow/server/issues/524#issuecomment-6293185092)では、PostgreSQL 16.15 と PgBouncer 1.26.1 について、PostgreSQL への直接接続、セッションプール、`max_prepared_statements=0` または `max_prepared_statements=200` のトランザクションプールを検証しました。これは互換性のある最低バージョンと正確な検証済み構成を示すもので、最新バージョンへの固定指定や容量の保証ではありません。他の組み合わせは別途検証してください。トラフィックを受け入れる前に、選択したエンドポイントに対して通常の `server-bootstrap` 初期化を実行します。

`GET /api/ready` は、パラメーターをバインドした DB 読み取り（`bound_read_query`）と設定済みの準備状態チェックを実行します。書き込み容量は明示的に未検証のままです。TCP 接続、マイグレーション、準備状態応答の成功だけでは、すべてのワークフロー SQL 操作やコミット容量は証明できません。読み取りレプリカで、claim と永続的遷移を確定する書き込み主系を置き換えてはいけません。

## Kubernetes 用 Helm チャート {#helm-chart-for-kubernetes}

Server リポジトリが[チャートソースとリリース手順](https://github.com/durable-workflow/server/tree/main/k8s/helm/durable-workflow)を所有します。OCI からインストールします。

```bash
helm install durable-workflow \
  %%artifact.helmChartRepository%% \
  --version %%artifact.helmChartVersion%% \
  --namespace durable-workflow --create-namespace \
  -f my-values.yaml
```

values ファイルでは、外部の MySQL/PostgreSQL と Redis、既存の Kubernetes Secret による本番認証情報、環境に合った ingress/TLS を指定してください。チャートは永続ストレージやプロバイダー管理のインフラを作成しません。再現可能なデプロイのため、Server イメージをダイジェストで固定してください。

### チャートのリリースを選ぶ {#helm-chart-selection}

各チャートリリースは、テスト対象の Server イメージを `Chart.yaml` の `appVersion` に記録します。チャートと Server のバージョン番号は独立しています。選択した[互換な組み合わせ](./compatibility.md#last-qualified-reproducible-tuple)は、チャート **%%artifact.helmChartVersion%%** と Server **%%artifact.helmChartAppVersion%%** で、表やインストールコマンドと同じリリースメタデータに基づきます。[公開済み OCI/パッケージの検証記録](%%artifact.helmChartQualificationUrl%%)が確認するのはその組み合わせであり、新たな Kubernetes インストールではありません。

別の Server バージョンでは、候補の公開済みチャートの `Chart.yaml` を調べ（[選択済みチャートのソース](%%artifact.helmChartSourceUrl%%)を例として参照）、`appVersion` が目的の Server と一致するチャートの正確なバージョンを選んでください。選択したリリースの [UPGRADING ノート](%%artifact.helmChartUpgradeUrl%%)を、途中で通過するすべてのチャートバージョンについて確認してください。Server のバージョンからチャートのバージョンを推測したり、現在のソースから未公開チャートを選んだりしないでください。

`image.tag` の上書きはイメージを変更しますが、チャートに記録された `appVersion` は変わりません。その組み合わせ自体のレンダリング済みマニフェスト、bootstrap、ロールアウト、ランタイムを検証するまでは、カスタムのチャート/イメージ構成です。通常のデータベースバックアップとロールバック境界をアップグレード計画に含めてください。レンダリングの成功だけではデプロイの動作を証明できません。

公開履歴には例外があります。チャート 0.2.2 は、チャートのパッチ番号で Server のマイナーバージョンを跨ぎました。後の[公開済み訂正](https://github.com/durable-workflow/server/blob/2.11.0/k8s/helm/durable-workflow/docs/UPGRADING.md#chart-022--server-210)はこの例外を認め、明示されたマイナーバージョンの方針に戻しています。過去のバージョンは変更されません。この注記は後の Server/チャート構成を選択するものではありません。

## Kubernetes マニフェスト {#kubernetes-manifests}

既存運用チーム向けに、Server の [`k8s/`](https://github.com/durable-workflow/server/tree/main/k8s) に次があります。

- Namespace と共通ラベル
- ConfigMap と Secret の分離
- bootstrap・移行 Job
- API Deployment と Service
- Worker Deployment
- スケジューラー CronJob
- PodDisruptionBudget
- `/api/health` 生存・`/api/ready` 準備プローブ
- 保守的なリソース要求・上限

適用前に公開版・ダイジェストへ固定し、実 DB・Redis 認証情報と既存サービスに対応する ConfigMap を提供します。意図的に生で調査可能な定義です。Helm ではなく、汎用のマネージド Kubernetes 動作を約束しません。

本番では最低限、次を実証します。

```bash
kubectl -n durable-workflow wait --for=condition=complete job/durable-workflow-migrate --timeout=180s
kubectl -n durable-workflow rollout status deploy/durable-workflow-server
kubectl -n durable-workflow rollout status deploy/durable-workflow-worker
kubectl -n durable-workflow port-forward svc/durable-workflow-server 8080:8080
curl http://localhost:8080/api/ready
curl -H "Authorization: Bearer $DW_ADMIN_TOKEN" http://localhost:8080/api/cluster/info
```

単一リージョン HA は、証拠ゲート閉鎖中は小規模クラスター同様サポート主導です。[以下の HA](#single-region-high-availability-and-failover)にある準備状態、単一スケジューラー、共有基盤のルールが必要です。プロバイダー固有 LB、storage class、network policy、アクティブ/アクティブ複数リージョン、無人切替はサポート主導または別追跡です。Helm 管理の導入・更新には、独立バージョンの Helm 経路を使います。

## 単一リージョンの高可用性とフェイルオーバー {#single-region-high-availability-and-failover}

現在は、小規模クラスター・生 Kubernetes 上に重ねる**未検証のサポート主導**契約候補です。**一つのリージョン内**で、管理 DB（RDS Multi-AZ、Aurora、Cloud SQL HA、Patroni 昇格等）・管理 Redis（Sentinel、Elasticache replication-group、Memorystore HA 等）の切替、API・Worker 喪失、スケジューラー・保守再起動への耐性を目標にします。リージョン間アクティブ/パッシブは別の[評価](#activepassive-multi-region)です。

意図するエンジン動作、準備ルール、イベント別復旧目標、スプリットブレイン防止、リハーサル合格基準は Workflow の [`docs/deployment/ha-failover.md`](https://github.com/durable-workflow/workflow/blob/main/docs/deployment/ha-failover.md) と Server の [`docs/ha-failover-validation.md`](https://github.com/durable-workflow/server/blob/main/docs/ha-failover-validation.md) にあり、この節が公開説明です。

### リリース証拠の状態 {#release-evidence-status}

文書の公開 Server リリースに対する、正確なリリースの成功結果リンクはありません。記録済み公開イメージの試行は、API 準備待ちの `topology_start` で止まり、障害マトリクス・復旧上限を確立できていません。ランナー、シナリオ定義、個別環境の訓練の存在を、公開イメージの全項目合格と扱わないでください。そのため HA はサポート主導のままです。

セルフサービスと記述できるのは、ソース不要の実行がイメージ・ランナー・Compose 全てに文書と同じリリースを使い、`single-region-failover-result.json` を公開して次を全て満たす場合だけです。`outcome: "pass"`、`runner_blocked: false`、全 `phase_outcomes` の `status: "pass"`、全復旧上限判定の合格、公開[フェイルオーバーシナリオ](/platform-conformance/single-region-failover-scenarios.json)の全必須証拠。この節に成功結果をリンクし、イメージが `%%artifact.serverDockerHubImage%%` と同じでなければなりません。それまでは以下の上限は評価目標であり、公開イメージの検証済み主張ではありません。

### 候補トポロジー {#candidate-topology}

小規模・生マニフェスト構成で、次の三原則を保ちます。

- **書き込み可能 DB endpoint は常に一つ。** 管理切替は、旧主系が再接続する前にフェンス（書込ユーザー失効、`read_only=on` 降格、複製切断、正常スナップショット復元等）する条件で許容。接続プロキシは Server が使う DB の意味論を保ち、正確なリリース・モード・設定で検証する必要があります。PgBouncer トランザクションプールの必要バージョンと検証済みモードは[SQL 接続の予算](#sql-connection-budgets)を参照してください。
- **Redis endpoint は同時に一つ、昇格経路を文書化。** 管理切替は許容。Redis は高速化層であり正しさの基盤ではないため、切替は遅延事象であって正しさの事象ではありません。
- **スケジューラー・保守は常に一つ。** オーケストレーター（Compose `deploy.replicas: 1`、ホストリースで保護した systemd、Kubernetes `Deployment` の `replicas: 1` と `RollingUpdate.maxSurge: 0`）が再起動中も単一性を維持します。定常重複は契約外です。

### イベント別の動作と復旧目標 {#per-event-behavior-and-recovery-targets}

以下は意図する上限付き目標です。ゲート閉鎖中は公開イメージ保証ではありません。実測時間はエンジン目標に管理サービスの昇格遅延を足したものです。

| イベント | 候補エンジン動作 | 基盤・ランナー復帰後の復旧目標 |
| --- | --- | --- |
| 管理 DB 切替 | 書込・読取はエラー。黙ってバッファしない。全 API・スケジューラーで `/api/ready` 失敗。確認済み作業を失わない。 | 接続プール再接続一回 + `task_repair` 周期（既定 3 秒）一回 + 処理中ポーラーのロングポール期限（既定 30 秒、最大 60 秒）一回。 |
| 管理 Redis 切替 | 起動信号喪失でロングポール期限へフォールバック。高速化ヘルスは **warning**、error ではない。通常 `/api/ready` は正常。 | Redis クライアント再接続間隔。 |
| N 台中 API 一台喪失 | LB が準備周期内に除外。対象リクエストは LB で失敗しクライアントが再試行。 | 運用者設定の LB 準備周期（通常 5～10 秒）。 |
| Worker 喪失 | 保有タスクはリース期限まで停止。他 Worker は自分のタスクを取得。 | リース期限（アクティビティは 5 分）+ 修復周期一回。 |
| スケジューラー・保守再起動 | 発火、アクティビティ期限強制、履歴削除を一時停止し、再起動後次 tick で再開。単一なので重複発火しない。 | オーケストレーターの再起動遅延 + tick 一回。 |

### LB、準備状態、トラフィック切り替え {#load-balancer-readiness-and-traffic-shift-rules}

LB が切替中の受付を一元判断します。

- **`GET /api/ready`** に接続し、`/api/health` だけにしない。health は HTTP 提供、ready は DB 接続と設定された準備チェックを報告し、Redis 起動高速化の正常・劣化も示します。すべてのワークフロー SQL 操作や書き込み容量を検証するものではありません。DB 停止時は全ノードで正しく失敗します。LB は全停止状態を許容し、古い「最後の正常」一覧に戻ってはいけません。
- 間隔 5～10 秒、除外しきい値は連続 2～3 回失敗。
- スティッキー不要。外部 Worker が `server-a` で取得し `server-b` で完了することを小規模 smoke が実証。
- Redis のみの切替は DB 永続経路が使える限り全ノード準備正常。`checks.cache.status=warning`、`checks.cache.degraded_capability=long_poll_wake_acceleration` で示し、この警告で除外しない。

基盤復帰後は、少なくとも一台の ready 200 を待ち、管理トークンで LB 経由の cluster info を取得して構成を確認し、LB 経由でプローブ Worker を登録し、オーケストレーター内のスケジューラーが厳密に一つであると確認して、外部トラフィックを戻します。

### 正確な成果物でリハーサルする {#run-the-exact-artifact-rehearsal}

Server リリースは、チェックアウトから製品をビルドせず全障害項目を検証する再利用可能な基準リハーサルを含みます。ランナーと Compose はイメージと同じタグから取り、移動する既定ブランチと任意イメージを混ぜません。Docker Engine、Compose v2、Python 3.11 以降、公開レジストリアクセスのあるクリーンホストで実行します。

<!-- docs-example id="single-region-failover-exact-release" -->
```bash
export DW_SERVER_RELEASE=%%artifact.serverVersion%%
git clone --depth 1 --single-branch --branch "$DW_SERVER_RELEASE" \
  https://github.com/durable-workflow/server.git "server-$DW_SERVER_RELEASE"
cd "server-$DW_SERVER_RELEASE"
export DW_SERVER_IMAGE="durableworkflow/server:$DW_SERVER_RELEASE"
scripts/conformance/single-region-failover-published-artifacts.sh \
  --result-dir ./failover-result
```

一つの変数から checkout と `DW_SERVER_IMAGE` を導出します。イメージだけを上書きせず、clone 前に `DW_SERVER_RELEASE` を変更します。ランナーは具体的公開タグ・ダイジェストを要求し、全補助イメージを pull してダイジェスト解決し、Compose build、製品ソース bind mount、ローカル・可変参照を拒否します。nginx 一つの背後に API 二台、MySQL 一つ、Redis 一つ、スケジューラー・保守一つを起動します。

結果のスキーマは `durable-workflow.v2.single-region-failover.result` です。正確な成果物・ツール版、正規化構成、準備遷移、実測時間・上限判定、ワークフロー・実行・タスク・スケジュール ID、ノード横断完了、API 喪失、DB・Redis 中断、Worker リース喪失、単一スケジューラー再起動の重複・喪失アサーションを記録します。外部ランナーは `GET /api/cluster/info` の `single_region_failover_contract` から呼出方法・シナリオを検出します。

上記ゲートに合格した結果だけが公開イメージの中断・復旧を検証します。失敗、部分、runner-blocked は診断証拠です。基準成功でもローカル MySQL・Redis 再起動はクラウドプロバイダー昇格の証拠になりません。管理 HA の主張前に、プロバイダー固有の昇格、フェンシング、RPO、経過時間も保持します。

### 復旧パケットへの追加 {#recovery-packet-additions}

契約を主張する小規模・生定義デプロイは、[運用範囲](/docs/operator-operating-envelope)のパケットに全事象の証拠を追加しなければなりません。

- 管理 DB 切替が確認済み書込を失わず上限内に完了。
- 管理 Redis 切替が LB ローテーションを不安定化せず、作業を失わず、`checks.cache.status=warning` と劣化機能 `long_poll_wake_acceleration` を示す。
- API 喪失を設定周期内に LB が吸収し、確認済み書込を失わない。
- Worker 喪失後、リース期限を通して実行を保持し、修復上限後に再取得し、厳密に一度完了。
- 別ホストでのスケジューラー再起動が重複発火せず、`next_fire_at` + 一 tick を越えて未評価のスケジュールを残さない。

ゲート閉鎖中は独自訓練が成功してもサポート主導です。公開全段階成功でゲートが開いた後も、環境固有証拠を記録し、運用範囲の周期で更新して初めてセルフサービスになります。

### 未対応 HA 主張との境界 {#boundary-against-unsupported-ha-claims}

契約は限定的で、次は**範囲外**のままサポート設計が必要です。構成自体がリスクの一部です。

- アクティブ/アクティブ複数書込 DB
- セルフホストのアクティブ/パッシブ複数リージョン、自動・無人地域切替（[次節](#activepassive-multi-region)は評価手引き）
- 同期リージョン間 DB 複製（RPO=0）
- 定常の重複スケジューラー・保守
- エンジン強制の地域固定キュー
- 公開チャートのパッケージ契約を超える管理 Kubernetes 検証
- 上限を越える広い「ファイブナイン」「無停止」SLA

契約は*指定事象での上限付き復旧*であり、DB、網、オーケストレーターに依存する稼働率の約束ではありません。専用検証なしにマーケティング・SLA で境界を越えてはいけません。

## アクティブ/パッシブのマルチリージョン {#activepassive-multi-region}

**サポート主導の評価ガイダンス**であり、2.0 の実証済みセルフサービス契約ではありません。本番依存前に候補設計をレビューし、サポートと環境固有訓練を作ります。各地域は文書化した単一ノード、小規模、生 Kubernetes から始めますが、その契約は地域間複製、切替、復帰、RPO、RTO、スプリットブレインを確立しません。詳しいデータ規範、複製前提、名前空間・キュー・Worker、切替・復帰、フェンシング、整合性・遅延は、Workflow の [`docs/deployment/multi-region.md`](https://github.com/durable-workflow/workflow/blob/main/docs/deployment/multi-region.md) と Server の [`docs/multi-region-validation.md`](https://github.com/durable-workflow/server/blob/main/docs/multi-region-validation.md) にあります。

評価する候補構成:

- **アクティブ地域**一つ。検証済み単一・小規模構成で、LB 配下 API、共有外部 MySQL/PostgreSQL 書込 DB、Redis、厳密に一つの保守・スケジューラー、外部 Worker。
- **待機地域**一つ。非同期複製 DB、任意の待機 Redis、スケジューラーなし。事前 API・Worker はゼロ以上で昇格まで休止。
- **地域切替**は運用者の明示作業。障害地域への書込を止め、公開 RPO に対する複製状態を確認、待機 DB を昇格、必要移行を新主系で実施、単一スケジューラー開始、Worker endpoint・外部交通を切替、投影を再構築。自動切替はありません。
- **復帰**は元地域の回復後、同じ逆順手順。回復主系は、待機側へ再接続前に書込失効、`read_only=on`、複製切断、正常スナップショット復元等でフェンスします。

データ規範と複製の前提:

- DB が唯一の永続的な正しい情報源で、同時に書ける地域は厳密に一つ。待機側は昇格まで読取レプリカ。RPO は非同期複製遅延、RTO は運用手順の所要時間。
- Redis は地域内高速化。起動信号、クエリーキューロック、受付ロックは地域間伝播せず、期待しない。各地域が Redis を持ち、待機側が cold/warm かは運用者判断。正しさは切替時の保持に依存しない。
- 可視性はアクティブ DB が供給。昇格後に読み取る。

名前空間、キュー、登録:

- DB 内に保存し、最終複製コミット時点のまま生存。エンジンは地域分割しない。
- 新アクティブ Worker は昇格後に地域 API へ登録。旧地域の登録は DB に残り通常の期限経路で失効。
- ビルド ID ロールアウト・デプロイライフサイクルは DB にあるため切替後も残る。

平常時の整合性と遅延:

- 開始、シグナル、更新はアクティブ DB にコミットし、その遅延を受ける。切替で権限を撤回中は拒否。
- ワークフロー・アクティビティ配送は地域内高速化契約に従い、Redis 正常時は一秒未満、それ以外は永続ポーリング周期。
- スケジュールはアクティブの単一スケジューラーが発火。不在時は停止し、昇格後に永続行から再開。
- 書込後読取はアクティブ地域内だけ。地域間 read-your-writes・RPO=0 は提供しない。

この候補はバックアップ・証拠の代替ではありません。[運用範囲](/docs/operator-operating-envelope)のパケットに、複製遅延 SLO、昇格手順遅延、最新成功訓練日、回復主系のフェンシング手順を追加します。

セルフホストのアクティブ/パッシブ・アクティブ/アクティブ複数地域、自動切替、同期複製、地域間アクティブ可視性、エンジン強制の地域固定キューは、構成自体がリスクなので[サポート主導](/docs/support)です。現在の [Cloud 契約](/docs/polyglot/cloud-control-plane)は単一地域で、これらを保証しません。

## 準備状態の契約 {#readiness-contract}

ヘルスと準備状態の両方を使います。

- `GET /api/health`: HTTP を提供。
- `GET /api/ready`: DB 接続、マイグレーション、既定名前空間など設定された依存チェックを報告。すべてのワークフロー SQL 操作や書き込み余力を証明するものではありません。
- `GET /api/cluster/info`: 認証済みクライアントがビルド、両プロトコル、コーデック、機能を検出可能。
- `POST /api/worker/register`: 期待名前空間・キューへ認証可能。

`/api/health` だけでトラフィックを切り替えないでください。
