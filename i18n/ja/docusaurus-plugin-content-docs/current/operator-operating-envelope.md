---
sidebar_position: 14
title: 運用の適用範囲
description: Durable Workflow v2 の健全性、キュー状態、再構築、エクスポート、アーカイブ、デプロイ形態に関する運用者向け契約。
tags:
  - operations
  - observability
  - Waterline
keywords:
  - 運用の適用範囲
  - ワークフロー v2 の健全性
  - プロジェクション再構築
  - 履歴エクスポート
  - アーカイブ検証
  - キューの健全性
  - 高可用性
---

# 運用の適用範囲 {#operator-operating-envelope}

このガイドは Durable Workflow v2 の運用者向け契約を定義します。更新を止める診断と参考診断、Waterline と Worker のテレメトリの分担、再構築とエクスポートの検証、文書化された運用範囲に含まれるデプロイ形態を判断するために使います。

ここでのデプロイ・復旧手順は、Laravel 組み込みとセルフホスト Server に適用します。Durable Workflow Cloud は別のマネージドサービスで、runtime の永続化、単一リージョン配置、バックアップ、復元、復旧を Cloud が管理し、利用者は Namespace URL に接続する SDK と Worker を運用します。このガイドで Server を Cloud へ接続しないでください。利用者の責任境界は [Cloud マネージド runtime](/docs/polyglot/cloud-control-plane)を参照してください。

## 正式な情報源 {#source-of-truth-surfaces}

次の情報源を併用してください。

| 情報源 | 用途 | 契約分類 |
| --- | --- | --- |
| `php artisan workflow:v2:doctor --strict` | v2 の受付・更新前の基盤能力の確認 | 停止条件 |
| `GET /waterline/api/v2/health` | 現在のエンジン接続の準備状態と、停止・参考のヘルス確認 | `status = error` は停止、`status = warning` は参考 |
| `GET /waterline/api/stats` | 永続状態の全体件数、滞留、修復、プロジェクション差分、Worker 互換性 | 参考とベンチマーク |
| `php artisan workflow:v2:rebuild-projections ...` | プロジェクションのずれのプレビューと修復 | 保守 |
| `php artisan workflow:v2:backfill-command-contracts ...` | 旧コマンド契約スナップショットのプレビューと補完 | 保守 |
| `php artisan workflow:v2:history-export ...` と Waterline のエクスポートルート | Replay、保管への引き渡し、障害成果物 | 検証 |
| Waterline のアーカイブと `archive()` | 終了実行のライフサイクル変更 | ライフサイクル |
| Worker SDK のメトリクス、トレース、ログ | 開始待ち遅延、ポーリング成功、Sticky キャッシュ、独自テレメトリ | runtime テレメトリ |

各実行を所有する runtime が、永続状態の正式な運用契約を持ちます。Waterline は組み込みパッケージから直接、または PHP SDK 経由の独立 Server から表示します。Worker 内の遅延とプロセス挙動の正式な情報源は Worker のテレメトリです。

### デプロイ形態ごとの対応 {#surface-mapping-by-deployment-shape}

上の Waterline ルートは両方のデプロイ形態で使用できます。組み込みは Laravel の永続状態をプロセス内で読みます。service モードは公開 Waterline イメージを使い、PHP SDK で独立 Server の一つの Namespace を読みます。Waterline の有無にかかわらず、認証付き Server API と `dw` CLI は直接利用できます。

| 運用上の問い | Waterline（組み込み・service） | 独立 Server の面 |
| --- | --- | --- |
| エンジン接続の準備状態と停止・参考のヘルス | `GET /waterline/api/v2/health` | `GET /api/system/health`（管理者認証、コントロール v2）。稼働確認は `dw server:health`、トポロジー・プロトコル・更新安全性は `dw server:info`。 |
| 永続全体件数、滞留、修復、互換性、差分 | `GET /waterline/api/stats` | `GET /api/system/operator-metrics` と `dw system:operator-metrics` |
| 選択実行の詳細と履歴エクスポート | `GET /waterline/api/instances/...` と `/waterline/api/.../history-export` | `GET /api/workflows/{workflowId}`、`/runs/{runId}`、`/runs/{runId}/history/export`（[Server API](./polyglot/server-api-reference.md)参照） |
| 運用コマンド（キャンセル、強制終了、修復、アーカイブ、シグナル・Update・クエリ） | `POST /waterline/api/instances/.../{cancel\|terminate\|repair\|archive}` とシグナル・Update・クエリのルート | `POST /api/workflows/{workflowId}/{cancel\|terminate\|repair\|archive}` と `POST /api/system/repair/pass` |
| トポロジーとノード識別 | 組み込み：`php artisan workflow:v2:doctor --json` の `topology`。service：接続先 Server の面を使う | `GET /api/cluster/info`、`GET /api/health`、`GET /api/ready`（または `dw server:info`） |

以降のフィールド群と契約名は、どの情報源から読んでも同じです。Waterline は設定した runtime と Namespace に限定され、組み込みと Server 管理の実行を混在させません。

## 日付付きの 2.0 検証記録 {#dated-20-evidence-snapshot}

この記録は、公開アーティファクトで測定した動作と、対応していても各運用者が自身の環境で演習すべき手順を区別します。成功行は記載の 2.0 シナリオとトポロジーだけに適用され、別の基盤や大規模構成への包括的主張ではありません。

現在の検証記録は次のとおりです。

| 証拠と日付（UTC） | 直接測定した内容 | 範囲 |
| --- | --- | --- |
| 単一リージョン切替演習、2026-07-28 | ノード間の完了、API 一台喪失、MySQL の中断と復旧、Redis 中断と DB ポーリングへの復帰、Worker リースの喪失・再取得、単一スケジューラー再起動を測定。全段階の喪失・重複確認が成功。 | 一つの接続先の背後に API 二台、MySQL 一つ、Redis 高速化層一つ、キューワーカー一つ、スケジューラー・保守一つを同一リージョンに配置。DB と Redis はコンテナ中断で、マネージド昇格ではない。 |
| タイマー再起動マトリクス、2026-07-28 | 待機ワークフローが Worker と Server の再起動後に完了し、各実行の schedule と fire が一つで、Replay コマンドの重複なし。 | 公開 Server の構成上の永続タイマーと Replay 復旧。任意のプロセス状態や外部効果の復旧ではない。 |
| アクティビティ runtime マトリクス、2026-07-29 | Worker 再起動時の結果復旧、再試行・タイムアウト、ハートビート・キャンセル観測、終端結果の永続化、必要な製品面での冪等な完了。 | アクティビティ単位のエンジン動作。外部効果の冪等性はアプリケーション所有。 |
| ライフサイクルのマトリクス、2026-07-29 | PHP、Python、Rust、CLI、API、履歴、Waterline で完了・失敗、重複開始・ID 再使用、タイムアウト・再試行、履歴の連続性、効果重複防止。 | 実施シナリオのライフサイクルの正しさ。可用性や処理量のベンチマークではない。 |

対応するリリース系列は[互換性契約](./compatibility.md)を参照し、トポロジー固有のフェイルオーバーを主張する前に、自身の環境で文書化された復旧手順を演習してください。

### 測定済みの保証と対応手順 {#measured-guarantee-vs-supported-procedure}

| 障害または結果 | 日付付き証拠で直接確認 | 対応する運用手順 | 証明していないこと |
| --- | --- | --- | --- |
| API 一台の喪失 | API 二台の片方を停止し、共通接続先から残った方へ到達、受付済み状態を保持して完了。 | `/api/ready` で故障ノードを除外し、中断要求を再試行。復帰前にトポロジーと登録を確認。 | 全台喪失、AZ 隔離、任意のネットワーク分断。 |
| データベースの中断 | 両 API が未準備となり、永続状態は残り、リース切れ後の置換 Worker が再取得して完了し、重複完了を拒否。 | 書ける DB を先に復元し、準備を待ち、旧所有者をフェンスし、代表実行を確認後再開。マネージド昇格は提供元のフェンス、RPO、経過時間の証拠が別途必要。 | マネージド DB 昇格、スプリットブレイン中の確認済み書き込み、測定外の RPO・RTO。 |
| Redis の中断 | 高速化劣化を報告しながら DB ポーリングで状態保持。同じポーリング要求の再送は重複リースを作らず、Redis 復帰後に準備状態が回復。 | 高速化層として扱い、警告を許容。永続層の後に復元し、検出遅延が基準へ戻ることを確認。 | Redis の二重プライマリー、分断時キャッシュ、提供元の昇格時間。 |
| Worker 再起動・喪失 | Worker 喪失後にリースを再取得して完了。後続アクティビティ検証は再起動後の結果復旧と冪等完了も確認。 | リースの期限切れまたはドレイン後、互換 Worker を起動。登録とキュー取得を確認し、外部効果は冪等にする。 | 永続化していないプロセス内状態の復元や、外部効果の exactly-once。 |
| Server・スケジューラー再起動 | Server 再起動後も眠った実行がタイマー重複なく完了。API 一台喪失と単一スケジューラー再起動中も進捗保持。 | 永続層を戻し、ロールを準備状態にする。スケジューラー・保守が一つであること、登録、代表完了を確認。 | 全 Server と永続ノードの同時喪失、複数リージョン、定常的な重複スケジューラー。 |
| 重複配信 | DB 復旧と Worker 喪失の各段階で一つの論理完了と重複 HTTP `409` を記録。Redis 劣化時は元のリースを再送。アクティビティの冪等完了も別途成功。 | 安定したリクエスト・タスク識別子を使い、古い試行拒否を守り、外部効果を冪等にする。 | 永続エンジン境界外の普遍的な exactly-once 配信・効果。 |
| 終端への到達 | ノード間、API 喪失、DB 復旧、Worker 喪失で `completed`。後続ライフサイクル検証は完了、失敗、キャンセル、強制終了、タイムアウト、再試行も確認。 | アーカイブや復旧完了宣言前に、対象実行と履歴・エクスポートを確認する。 | 未検証の負荷形態、連携、障害の組合せの完了。 |

### 現在の最大負荷テスト {#largest-current-load-cell}

最大の Server 負荷テストは、開始並行数 **8** で **1,000 件**を開始し、同時に **8 本**のポーリング Worker を 120 秒動かします。開始完了率 98% 以上に加え、接続先の可用性、キャッシュキーの解消、サンプルの網羅、リソース上限を確認します。

これは短時間の**正しさの確認**であり、持続的な本番規模のベンチマークではありません。普遍的なスループット、遅延、メモリ、最大並行数を証明しません。運用する正確なトポロジー、Worker 構成、DB、キャッシュ、リリースでベンチマークと長時間負荷を測定してください。

### 明示的な対象外 {#explicitly-out-of-scope}

2.0 の検証は次を対象にしません。

- ネットワーク分断
- 意図的なクロックずれ
- 複数リージョン運用
- スプリットブレイン

これらは 2.0 リリースの前提ではなく、それぞれの分断、時刻差、複数リージョン、スプリットブレインへの対応を主張する場合の前提です。対応する範囲は、公開トポロジー、復旧資料、記載シナリオで測定した動作です。非対応の障害実験を、文書化済みの単一リージョン手順が使えない証拠として提示しないでください。

## 対応トポロジー {#supported-topologies}

Durable Workflow v2 は次の運用形態に対応します。第 1 列は `/api/cluster/info` と [Server ロールトポロジー](./polyglot/server-role-topology.md)の `topology.current_shape` と一致し、自動化が読む検出契約と揃っています。

| 運用形態（`topology.current_shape`） | 対応する運用契約 | 主な障害ドメイン | 復旧・切替の想定 |
| --- | --- | --- | --- |
| `embedded`、単一ノード | Waterline、制御、健康、再構築、エクスポート、アーカイブを一つのアプリ、一つの DB、一つのキャッシュで実行。 | 同一ホストの Laravel、DB、キャッシュ。 | ホスト・DB 喪失は全体停止。永続状態を先に戻し、アプリ一台を準備状態にし、再開前に登録を確認。 |
| `embedded`、同一リージョン小規模クラスタ | 一つの共有 DB、起床用キャッシュ、同一の互換性・設定を使用。ノードを同じ DC・リージョンに置き、キュー・タイマーの起床遅延を制限。 | 共有 DB、共有起床キャッシュ、LB、単一スケジューラー・保守。 | アプリ一台喪失は容量減だけ。DB 喪失は停止。Redis のみなら警告と DB ポーリングで正しさを保持。切替・更新は明示手順で、自動 HA の保証ではない。 |
| `standalone_server` 配布 | [セルフホスト](./deployment.md)の構成表を使い、同じ健康・統計・保存・キューの区別を `/api/system/...`、`/api/workflows/...` または独立 Waterline に適用。 | 共有 DB、Redis、API 群、独立 Worker、任意の Waterline、単一スケジューラー・保守。 | API と観測用 Waterline は交換可能。DB、Redis、単一スケジューラーの順序が復旧を定義。永続層復元後に `/api/ready`、`/api/cluster/info`、登録を確認して再開。 |
| `split_control_execution` | `standalone_server` と同じ契約で、`ingress_node`、`control_plane_node`、`scheduler_node`、`matching_node`、`execution_node` にロールを分離します。運用・健康・コマンドを各ノードへ適用し、管理読み取りを対象ロールへ送ります。 | 各ロールが別プロセスなので [Server ロールトポロジー](./polyglot/server-role-topology.md)の障害モデルに従う。共有 DB、Redis、単一スケジューラー選出は全体境界。 | 復旧順序は独立構成と同じ。各ノードの `topology.current_shape`、`topology.current_process_class`、`topology.current_roles` を確認する。異なるノードのルートは `503 topology_role_unavailable`。 |

`split_control_execution` は別のエンジンや製品ではありません。`topology.shape_assignments` のロール別プロセスに分けた、`standalone_server` と同じ運用契約です。個別ロールを明記しない限り、残りの説明は両方に適用します。[Server ロールトポロジー](./polyglot/server-role-topology.md)に語彙、権限境界、移行手順があります。

Waterline の service モードは観測用デプロイであり、別の Server トポロジーではありません。追加・削除しても `topology.current_shape`、Server の API・CLI の可用性、実行を所有する runtime は変わりません。

運用するトポロジーの手順書に、復元順序、バックアップ間隔、想定フェイルオーバー遅延、リージョン固定の挙動を公開してください。製品契約は測るべき事実を定義し、デプロイ契約は受け入れる復旧時間、手動作業、障害ドメインを記録します。

### 形態ごとの障害ドメイン確認 {#failure-domain-checklist-by-supported-shape}

上の表を概要として、次の具体的な喪失モデルに沿って手順書を作成します。

- **Laravel 組み込み・単一ノード**：一つのアプリケーションが制御、マッチング、プロジェクション、スケジュール、実行を担当します。失われると、健全な永続ストレージへ同じアプリが復帰するまで、永続コマンド、進捗、スケジュール発火、運用読み取りがすべて停止します。
- **Laravel 組み込み・同一リージョンの小規模クラスタ**：通常ノード一台の喪失は HTTP・Worker 容量の一部だけを減らし、残りが共有ストアから取得を継続します。共有 DB、キャッシュ経由の起床経路、単一スケジューラー・保守担当が主な正しさの境界です。
- **独立 Server（`standalone_server`）**：`server_http_node` 一台の喪失はその入口と制御コマンドだけを止め、Worker は取得済み作業を終え、他の API が継続できます。`worker_node` の喪失は、該当 `(connection, queue, compatibility)` の滞留、年齢、互換性警告に影響します。`scheduler_node` の喪失は新しいスケジュール発火と保守を止めますが、実行中ワークフローを無効化しません。DB 喪失は全体停止です。Redis のみの喪失なら DB ポーリングを維持し、`long_poll_wake_acceleration` の劣化と検出遅延を報告します。
- **ロール分割 Server（`split_control_execution`）**：`ingress_node`、`control_plane_node`、`scheduler_node`、`matching_node`、`execution_node` を別プロセスにします。失われた役割だけが劣化します。入口停止は外部 HTTP を止め、制御停止は取得済み作業を続けながら運用コマンドを速やかに拒否します。マッチング停止は直接の準備済み検出へ戻り、スケジューラー停止は発火を止めて取りこぼしを記録し、実行停止は永続状態を失わず準備済みタスクを蓄積します。DB 喪失は全体障害、Redis のみなら独立構成と同じ DB フォールバックと警告状態です。

異なる前提が必要な場合は、既存のセルフサービス手順がそのまま通用すると考えず、別の検証済み契約を持つ手順書を作ってください。

### トポロジーごとの復旧資料 {#published-recovery-packet-by-topology}

上のトポロジーが本番対応となるのは、対応する復旧資料を手順書とともに公開している場合だけです。

| トポロジー | 運用者が公開する事実 |
| --- | --- |
| `embedded`、単一ノード | DB バックアップ予定、キャッシュ保持の想定、復元するアプリ改訂と環境・設定、許容復元遅れ、直近の成功した演習の証拠。 |
| `embedded`、同一リージョン小規模クラスタ | 単一ノードの資料に加え、現在のスケジューラー・保守担当、一般ノードと共有 DB・キャッシュを失う場合の差、キュー起床調整を戻す切替手順。 |
| `standalone_server` 配布 | DB・Redis のバックアップ頻度、固定イメージ、認証情報の場所、`server_http_node`・`worker_node`・`scheduler_node` の切替想定、直近の `/api/ready` と `/api/cluster/info` 復元確認、Worker 再登録証拠。 |
| `split_control_execution` 配布 | 独立構成の全資料に、`ingress_node`、`control_plane_node`、`scheduler_node`、`matching_node`、`execution_node` の拡張・障害想定と、誤ノードの `503 topology_role_unavailable` に対するクライアントのルーティング規則を追加。 |

資料がない、古い、未検証なら、稼働ノード数に関係なく開発用として扱います。

### 基準を使う前に現在のトポロジーを確認する {#verify-live-topology-identity-before-trusting-the-baseline}

独立 Server とロール分割では、キュー、スケジューラー、ロール障害を解釈する前に、製品が報告するノード識別を確認します。正式な情報源は `GET /api/cluster/info` です。

| フィールド | 用途 |
| --- | --- |
| `topology.current_shape` | 現在 `embedded`、`standalone_server`、`split_control_execution` のどれを通知しているか。 |
| `topology.current_roles` | 実際にこのノードが提供する論理ロール。 |
| `topology.supported_shapes` | 現在の Server ビルドが公開対応するデプロイ形態。 |
| `topology.shape_assignments` | 各形態と文書化されたプロセスクラスの役割群との対応。現在の組合せと比較する。 |

更新中は、これらを最初のトポロジー差分確認に使います。

- セルフサービスの独立形態では、API は `api_ingress`、`control_plane`、`matching`、`history_projection` を、スケジューラーは `scheduler` を、Worker は `execution_plane` を報告する必要があります。
- 分割形態では、滞留やスケジューラー遅延を Worker 問題と解釈する前に、各ノードの `current_roles` が `shape_assignments` のロール群と一致することを確認します。
- `current_roles` が計画からずれていれば、識別を直すまでキューやフェイルオーバーの基準を信頼しないでください。

組み込みは `/api/cluster/info` を提供しません。`php artisan workflow:v2:doctor --json` の `topology` を確認します。同じスキーマで `current_shape`、`current_process_class`、`current_roles`、`execution_mode`、入れ子の `matching_role` を公開します。

## 停止が必要な診断と参考診断 {#blocking-and-advisory-diagnostics}

Durable Workflow v2 は、停止が必要な診断と参考診断を区別します。

| 重大度 | 意味 | 通常の対応 |
| --- | --- | --- |
| 停止条件 | 現在の設定・準備状態では v2 通信を信頼できない | 更新を止め、前提を修復し、再検証 |
| 参考 | 読み取り可能だが、導出情報に再構築・補完・手動確認が必要 | 適切なら稼働を維持し、指定面を修復 |
| 健全 | その面に現在の問題は見つかっていない | 通常運用を継続 |

同梱の各面には次のように適用します。

- `workflow:v2:doctor --strict` は基盤能力の問題が `error` なら停止します。例は queue モードの未対応ドライバーやロック非対応キャッシュです。poll モードのキュー情報は参考です。
- `GET /waterline/api/v2/health` は次を返します。
  - `status = ok`：v2 運用面が準備でき、確認項目も一致
  - `status = warning`：読み取れるが、完全に信頼するには再構築、バックフィル、修復が必要
  - `status = error` と HTTP `503`：エンジン接続が未準備、または能力問題で v2 面が利用不可
- `GET /waterline/api/stats` は永続状態の事実です。JSON は画面やスクリプトの運用診断に使い、メトリクス収集エンドポイントとしては扱いません。

## 正しさと高速化の確認 {#correctness-vs-acceleration-checks}

各 v2 ヘルスチェックは `correctness` または `acceleration` の `category` を持ち、スナップショットは分類別の集計を公開します。運用者は一覧を再集計せず、二つの異なる問いを判断できます。

- **正しさ**：永続的な準備済みタスクの検出、プロジェクションの鮮度、コマンド契約のバックフィル、履歴保持、互換性、基盤能力が健全かを示します。`status = error` なら安全な取得や信頼できる運用状態にリスクがあり、解消まで更新を止めます。
- **高速化**：任意の起床通知伝播が追いついているかを示します。正しさの経路は永続ポーリングなので、`status = warning` はノード間の起床が遅くてもタスクは孤立していないことを意味します。

`checks` の各項目が `category` を持ち、`categories` に集計があるため、画面で両者を一目で確認できます。

```json
{
  "status": "warning",
  "categories": {
    "correctness": {"status": "ok", "check_count": 8},
    "acceleration": {"status": "warning", "check_count": 1}
  }
}
```

`acceleration` の劣化は高速化だけの問題として、キャッシュや起床基盤を調査します。永続的な準備済み検出だけに依存する通信は止めません。`correctness` の劣化が停止信号です。正式な高速化項目は `long_poll_wake_acceleration` で、`warning` より高くならず、その他の項目はすべて正しさに属します。

## キューの健全性の意味 {#queue-health-semantics}

キューの健全性は、永続キュー状態と Worker・runtime のテレメトリに分かれます。

### 永続キューの事実 {#durable-queue-facts}

永続タスクの状態には Waterline の統計とキュー画面を使います。

| 事実 | 意味 |
| --- | --- |
| `operator_metrics.backlog.runnable_tasks` | 今すぐ取得できる永続タスク。 |
| `operator_metrics.backlog.delayed_tasks` | 存在するが `available_at` を待っている永続タスク。 |
| `operator_metrics.backlog.leased_tasks` | Worker が現在取得中の永続タスク。 |
| `operator_metrics.backlog.tasks_added_last_minute` | 直近 60 秒に作成した別々の永続タスク行。転送試行数ではなく永続キューへの流入。 |
| `operator_metrics.backlog.tasks_dispatched_last_minute` | 直近 60 秒に最後の成功 `last_dispatched_at` がある別々の行。`tasks_added_last_minute` と比較し、流入が配信を上回るか調べる。 |
| `operator_metrics.starts.pending_runs`, `operator_metrics.starts.pending_commands`, `operator_metrics.starts.ready_tasks`, `operator_metrics.starts.oldest_pending_start_at`, `operator_metrics.starts.max_pending_ms` | 永続的な開始滞留。受け付けたがタスクとして動き始めていない開始と、通常の Worker 側キュー遅延を区別する。 |
| `operator_metrics.tasks.oldest_ready_due_at`, `operator_metrics.tasks.max_ready_due_age_ms` | 現在処理できる最古タスクと配信準備からの年齢。「最古の準備済みタスク」を機械可読で示す。 |
| `operator_metrics.tasks.dispatch_overdue`, `operator_metrics.tasks.oldest_dispatch_overdue_since`, `operator_metrics.tasks.max_dispatch_overdue_age_ms` | 配信起床が成功していない準備済みタスクと最古年齢。単なるキュー増加と、通知高速化の劣化を区別する。 |
| `operator_metrics.backlog.unhealthy_tasks` | 配信失敗、取得失敗、配信超過、リース切れがある永続タスク。 |
| `operator_metrics.backlog.repair_needed_runs` | 信頼できる永続再開経路がない、開いている実行。 |
| `operator_metrics.tasks.oldest_lease_expired_at`, `operator_metrics.tasks.max_lease_expired_age_ms` | 最古の期限切れリースと年齢。停滞リースと重複リスクの主な年齢指標。 |
| `operator_metrics.backlog.oldest_compatibility_blocked_started_at`, `operator_metrics.backlog.max_compatibility_blocked_age_ms` | 互換性で止まった最古の実行と年齢。作業は残るが取得できる互換 Worker がいない場合に使う。 |
| 有効・古いポーラー | 登録 Worker がキューへのハートビートを継続しているか。 |
| 現在のリース | 現在取得中のワークフロー・アクティビティタスクと期限切れの有無。 |

これらは永続的なワークフロータスクとアクティビティタスクだけを対象にします。

全体ではなくキュー別に調べるには、Server のキュー可視化ルートで滞留年齢、ポーラー、有効リース、受付予算、`stats.tasks_added_last_minute` と `stats.tasks_dispatched_last_minute` を読みます。流入と配信を比べ、滞留や Worker 容量不足のキューを識別します。全体比較には上記 `operator_metrics.backlog.*` を使います。

Waterline の `GET /waterline/api/v2/health` は、設定 Namespace の同じ詳細を `queue_visibility.*` に公開します。次のフィールド群が型付きのキュー健全性契約です。

| フィールド群 | 意味 |
| --- | --- |
| `queue_visibility.available`, `queue_visibility.reason` | 現在の Namespace のキュー情報を生成できるか、できなければその理由。 |
| `queue_visibility.task_queues[].stats.approximate_backlog_count`, `queue_visibility.task_queues[].stats.approximate_backlog_age` | キュー別の滞留数と最古の永続滞留年齢。 |
| `queue_visibility.task_queues[].stats.tasks_added_last_minute`, `queue_visibility.task_queues[].stats.tasks_dispatched_last_minute` | 直近 60 秒のキュー別流入と配信。全体の健全な合計に隠れる高負荷キューを探す。 |
| `queue_visibility.task_queues[].stats.pollers.active_count`, `queue_visibility.task_queues[].stats.pollers.stale_count`, `queue_visibility.task_queues[].stats.pollers.stale_after_seconds` | キューの有効・古いポーラー数と、判断に使ったハートビート閾値。 |
| `queue_visibility.task_queues[].stats.workflow_tasks.*`, `queue_visibility.task_queues[].stats.activity_tasks.*` | キュー別の準備、取得済み、リース切れ数。ワークフローとアクティビティ別。 |
| `queue_visibility.task_queues[].repair.candidates`, `dispatch_failed`, `expired_leases`, `dispatch_overdue` | すでに修復が必要、配信失敗、リース切れ、再配信遅延のキュー別圧力。 |
| `queue_visibility.task_queues[].repair.oldest_dispatch_failed_at`, `max_dispatch_failed_age_ms`, `oldest_lease_expired_at`, `max_lease_expired_age_ms`, `oldest_dispatch_overdue_since`, `max_dispatch_overdue_age_ms` | 最古の配信失敗、リース切れ、配信超過のキュー別年齢。 |

同じ応答の `coordination_alerts[]` は、キュー別事実とヘルス一覧をまとめる運用者向け集計です。警告・エラーの通知要約に使い、対応する `queue_visibility` や `checks` の証拠を掘り下げます。

キュー別の受付状態を、スロットとポーラーの主要な信号として使います。`saturated` は稼働 Worker の全登録枠がリース済み、`throttled` は Server 上限で意図的に抑制、`no_slots` は登録済みでもその種類の容量がゼロ、`no_active_workers` は健全なポーラーなし、`unavailable` はロックによる受付ガードが安全を証明できない状態です。

通常のキュー遅延が正常でも新規開始が停滞する場合は `operator_metrics.starts.*` を使い、開始受付・最初のタスク作成の滞留と、その下流の Worker 取得を区別します。

### ポーラー負荷と受付予算 {#poller-pressure-and-admission-budgets}

キューが劣化したときは、詳細ルートや `dw task-queue:describe` で、Worker 容量不足、意図した制限、稼働ポーラーなしを区別します。

| キュー状態 | 意味 | 扱い |
| --- | --- | --- |
| `accepting` | Worker に空き枠があり、Server 上限にも未到達。 | 健全な基準状態。 |
| `saturated` | 登録済み Worker の全枠がリース済み。 | Worker 容量の圧力。 |
| `throttled` | Server の有効リース・配信レート上限が意図的に抑制。 | 予期しない上限や基準を超える滞留増加でなければ参考。 |
| `no_slots` | 有効 Worker は登録済みだが、その種類の枠を一つも通知していない。 | そのキューの停止条件。 |
| `no_active_workers` | キューを担当する健全なポーラーがない。 | そのキューの停止条件。 |
| `unavailable` | 設定された受付経路に必要なロックを取得できない。 | 受付の依存先が回復するまで停止。 |

状態と流れの事実を併用します。

- `tasks_added_last_minute > tasks_dispatched_last_minute` と `saturated` は、流入が Worker 容量を上回ることを示します。
- 同じ差と `throttled` は明示上限による抑制であり、無制限の処理量ではなく、意図した上限の契約で判断します。
- 最古の準備年齢の増加と `no_active_workers` または古いポーラーは、健全な取得者が失われたことを示し、その範囲のルーティング障害として扱います。

### マッチングロールの配置 {#matching-role-deployment-shape}

現在のノードがどのマッチング・配信契約を提供するかは `operator_metrics.matching_role.*` で確認します。

| 事実 | 意味 |
| --- | --- |
| `operator_metrics.matching_role.queue_wake_enabled` | キューループのイベントで、Worker 内の広域ポーリング起床をまだ実行するか。 |
| `operator_metrics.matching_role.shape` | その起床経路を所有するなら `in_worker`、別の `workflow:v2:repair-pass --loop` が走査を担当するなら `dedicated`。 |
| `operator_metrics.matching_role.task_dispatch_mode` | 準備済みタスクに使う `queue` または `poll`。 |
| `operator_metrics.matching_role.partition_primitives` | 固定のルーティング軸。順序は `connection`、`queue`、`compatibility`、`namespace`。 |
| `operator_metrics.matching_role.backpressure_model` | エンジンの永続受付境界。現行 v2 は `lease_ownership`。 |

これらはノード単位で、全体の値ではありません。形態混在の更新では、切替対象の各ノード・Pod を読み、マッチングが意図した場所へ移ったことを確認してから、滞留やポーラー変化を Worker の問題と解釈します。

### Worker と SDK のテレメトリ {#worker-and-sdk-telemetry}

次には Worker のメトリクス、トレース、ログを使います。

- ワークフロー・アクティビティの `schedule_to_start` 遅延
- ポーリング成功率と同期・先行配信の動作
- Sticky キャッシュのサイズと退避
- Worker の CPU、メモリ、スレッド、イベントループ負荷
- アクティビティや Worker が出す独自アプリケーションメトリクス

同期クエリ、ライブデバッグなど非永続の制御呼び出しは、画面で別に分類してください。永続タスク滞留に含まず、Waterline の修復カウンターも変更しません。

## Worker 互換性と更新時の健全性 {#worker-compatibility-and-rollout-health}

`operator_metrics.workers` は、現在の Worker 群が必要な契約を安全に処理できるかを決める互換性を公開します。

| 事実 | 意味 |
| --- | --- |
| `operator_metrics.workers.required_compatibility` | Namespace の作業を取得するために Worker が通知すべき互換性。 |
| `operator_metrics.workers.active_workers` | 互換性ハートビートから確認した個別の稼働 Worker 数。 |
| `operator_metrics.workers.active_worker_scopes` | Worker が担当する `(connection, queue)` の数。 |
| `operator_metrics.workers.active_workers_supporting_required` | 必要なマーカーを通知している Worker。 |
| `operator_metrics.workers.fleet` | 範囲ごとの稼働 Worker 一覧。`worker_id`、`connection`、`queue`、`supported`、`supports_required`、ハートビートの `source`（`database` / `cache`）、`recorded_at`。 |

集計で必要な作業を取得できない Worker がある更新状態を検出し、`fleet` で不足する `(connection, queue)` を特定します。Waterline も互換性パネルに同じ一覧を表示するので、メトリクスを手で問い合わせる必要はありません。

Namespace の `active_workers_supporting_required` がゼロになると、Waterline は該当実行に `no_compatible_worker_for_task` を表示します。`worker_compatibility` ヘルスチェックも `correctness` の `warning` になり、分類集計を `warning` にするため、互換性の穴が一覧に埋もれません。

ビルド更新時のドレイン・再開は [ビルド ID を使う更新](./polyglot/worker-build-id-rollout.md)、診断の背後にある固定契約は [Worker の互換性とルーティング](./polyglot/worker-compatibility-routing.md)を参照してください。

## アラートの意味 {#alert-semantics}

アラートの閾値は構成固有です。キュー年齢、修復遅延、Worker 覆域、復元時間の数値基準を公開し、次の契約違反が通常の修復・watchdog の時間枠より続いたら通知します。

| アラート分類 | 情報源 | 扱い | 通知する条件 | 運用対応 |
| --- | --- | --- | --- | --- |
| 準備判定の停止 | `workflow:v2:doctor --strict`、`GET /waterline/api/v2/health` | 停止 | `doctor --strict` がエラー、または健康が `status = error` / HTTP `503` | 更新・切替を止め、前提を修復し、準備と互換性を再確認。 |
| 互換 Worker の覆域 | `operator_metrics.workers.*`、`worker_compatibility`、`no_compatible_worker_for_task` | 停止 | 必要な Namespace・`(connection, queue)` で `active_workers_supporting_required = 0` | 非互換 Worker をドレインし、互換 Worker を登録。新規取得を信頼する前に `correctness` 解消を確認。 |
| 永続キュー遅延 | Waterline キュー画面、`operator_metrics.backlog.*`、Worker の `schedule_to_start` | 持続すれば停止、短ければ参考 | 互換 Worker がいるのに最古の準備年齢・開始待ちが公開基準を超え続ける | Worker 容量を増やし、受付上限とスケジューラー・マッチングの進捗を確認。 |
| ポーラー負荷・受付飽和 | キュー詳細、`dw task-queue:describe`、`status`、古いポーラー、追加・配信率 | `no_active_workers`・`no_slots`・`unavailable` は停止。意図した `throttled` は参考 | `saturated` のまま年齢・流入配信差が増加、または予定保守外で停止状態へ変化 | 枠や失われた Worker 群を戻す。無計画な増設前に上限とロック依存が意図どおりか確認。 |
| ワークフロー開始滞留 | `operator_metrics.starts.*`、開始テレメトリ、最初のタスクの `schedule_to_start` | 持続すれば停止、短ければ参考 | 互換性・キュー容量があるのに `pending_commands`、`ready_tasks`、`max_pending_ms` が基準超過 | 開始コマンドが永続タスクになり、マッチング・配信が最初のタスクを作るか確認。増設前に開始経路と一般遅延を分ける。 |
| プロジェクション差分と修復負債 | `run_summary_projection` / `selected_run_projections`、`operator_metrics.repair.*` | 参考 | 予定再構築の時間枠を超えて継続、または最古候補年齢が増える | プレビュー、修復を行い、警告解消と年齢の基準復帰を確認。 |
| 再試行・失敗の急増 | `operator_metrics.backlog.unhealthy_tasks`、永続実行診断、Worker エラー | 参考。進捗を妨げれば停止へ | 配信・取得失敗、リース切れ、試行枯渇が基準を超えて継続 | 対象タスクを調べ、Worker と永続エラーを照合し、通信ドレイン・キュー隔離を判断。 |
| 起床高速化の劣化 | `long_poll_wake_acceleration` と `acceleration` 集計 | 参考 | キャッシュ・通知保守後も警告が続く | キャッシュ・通知伝播を調査。`correctness` も劣化しない限り正しさの障害にしない。 |

永続契約へのリスクを通知することが目的であり、全ての一時的な信号を呼び出しにしません。キューと Worker の警告は、実際のトポロジーの運用契約を脅かす場合だけ停止条件にします。

## 再構築、修復、復元の期待動作 {#rebuild-repair-and-restore-expectations}

運用面がずれを報告したら、次の順序で確認します。

1. `GET /waterline/api/v2/health` を確認します。
   - `run_summary_projection` と `selected_run_projections` の警告は読み取り可能でも一覧・詳細の再構築が必要なことを示します。
   - `command_contract_snapshots` は、シグナル・Update・クエリの宣言を信用する前に、旧実行の WorkflowStarted 契約をバックフィルする必要があります。
   - `durable_resume_paths` は、投影された次の再開元を信頼する前に、開いた実行の修復が必要です。
2. プロジェクションの作業をプレビューします。

   ```bash
   php artisan workflow:v2:rebuild-projections --needs-rebuild --dry-run
   ```

3. 対象のプロジェクションを再構築します。

   ```bash
   php artisan workflow:v2:rebuild-projections --needs-rebuild
   ```

4. コマンド契約バックフィルをプレビューします。

   ```bash
   php artisan workflow:v2:backfill-command-contracts --dry-run
   ```

5. 現在のワークフロークラスが使える場合に契約をバックフィルします。

   ```bash
   php artisan workflow:v2:backfill-command-contracts
   ```

6. 保持処理で意図的に永続行を取り除いた後、対応実行・履歴がないプロジェクションを削除したい場合だけ `--prune-stale` を使います。

`operator_metrics.repair.*` は修復走査の負荷を公開します。候補数、選択数、最古候補の年齢、走査上限への圧力から、基準内か容量調査が必要かを判断します。

### 保持とプロジェクションのずれ {#retention-and-projection-drift}

Workflow 2.6.3 以降では `details_pruned_at` がある実行は、summary 欠落、再構築負債、欠落年齢に数えません。ただし drift レポートの `runs` 総数には含みます。明示的な実行・インスタンス指定も含め、全再構築モードが除外するため、削除した一覧行を復活させたり、再び削除対象に戻したりしません。

マーカーのない summary 欠落は引き続きずれを報告します。空履歴だけでは旧保持ジョブの削除を証明できません。対応を決める前に正式な保持記録で意図的な削除を確認します。再構築では履歴を復元できず、必要なら適切なバックアップを使用します。

古い runtime は、マーク済み実行を summary 欠落と誤報する場合があります。再構築で警告を解消しようとする前にアップグレードしてください。保持処理後は `run_summary_projection` が `ok`、`projections.run_summaries.needs_rebuild` がゼロで、同じ実行が後の削除対象に出ないことを確認します。本当のプロジェクション欠落には修復が必要です。

## エクスポートとアーカイブの検証 {#export-and-archive-verification}

エクスポートとアーカイブの目的は異なります。

- **エクスポート**：Replay、デバッグ、保存用の成果物を作る
- **アーカイブ**：閉じた実行をアーカイブ済みにして、稼働中の群の表示から外す
- **削除**：保持期間が確実に終わった後、プロジェクションまたは永続行を取り除く

次の順で検証します。

1. 対象実行をエクスポートします。

   ```bash
   php artisan workflow:v2:history-export <workflow-instance-id> --run-id=<workflow-run-id> --output=storage/app/workflow-history/run.json --pretty
   ```

2. 想定の実行 ID、スキーマ、秘匿化メタデータを確認します。
3. 参照された外部バイトを検証し、成果物の必要期間だけ保持します。[削除前のエクスポート手順](./configuration/pruning-workflows.md#export-before-pruning)で全終了実行と不足コピーを照合します。
4. データベース内に残す場合だけアーカイブします。Server はアーカイブ済みを削除せず、解除 API もありません。組み込みの削除はアプリケーション所有で、アーカイブを要求しません。
5. 所有する保持処理から許可された詳細を削除します。実行・インスタンスの墓石は残します。プロジェクション再構築は履歴を復元せず、マーク済み実行も除外します。

Waterline の対応ルートは [Waterline 運用 API リファレンス](./waterline-operator-api.md)を参照してください。

チェックサムと構造の確認では、すべての元イベントや独立した外部バイトがエクスポートに含まれることは証明できません。削除済みのソースは拒否してください。誤った完全エクスポートフラグは、[Workflow #856](https://github.com/durable-workflow/workflow/issues/856) で未解決の不具合です。この手動手順は、[Server #520](https://github.com/durable-workflow/server/issues/520) が要求する自己完結型の検証済みアーカイブ操作も提供しません。これらの製品の不足と、実際にデプロイ環境が合格した復旧確認を区別してください。

## バックアップ、復元、災害復旧の契約 {#backup-restore-and-disaster-recovery-contract}

バックアップ、復元、災害復旧は運用範囲の一部で、任意の私的手順書ではありません。各対応トポロジーで次を公開し演習します。

1. 永続バックアップ一式：DB、Server またはアプリのイメージ、環境・設定、認証情報の場所、Worker 再接続用の構成・復旧手順。
2. 復旧目標：許容される最大復元遅れ、フェイルオーバー遅延、再開を安全と判断できる担当。
3. 復元順序：永続ストレージ、キャッシュ、初期化・移行、単一スケジューラー・保守、API の準備、Worker 登録。
4. 検証：`/api/ready` または `/waterline/api/v2/health`、該当する `/api/cluster/info`、代表 Worker 登録、復元状態からの履歴エクスポート。
5. 復元後修復：プロジェクション再構築、必要なコマンド契約バックフィル、キュー・互換性・修復指標が基準へ戻ったことの確認。

複数リージョンとスプリットブレインは 2.0 の対応範囲外です。[セルフホストガイド](/docs/deployment#activepassive-multi-region)の active/passive はサポート主導評価用で、セルフサービスの複製、フェイルオーバー、フェイルバック、RPO、RTO の保証ではありません。[Cloud マネージド契約](/docs/polyglot/cloud-control-plane)も Namespace ごとに単一リージョンで、複数リージョンの複製・切替・復帰を約束しません。

復元演習の間隔も公開運用契約に含めます。少なくとも次の時点で演習します。

- そのトポロジーでの初回本番前
- バックアップ方式、スキーマ・初期化経路、認証、デプロイ形態の変更後
- バックアップ予定と同じ手順書に公開した定期的な間隔

直近の成功日、復元経過時間、検証記録を提示できなければ、そのトポロジーのバックアップと DR は未実証です。

## ベンチマークの範囲 {#benchmark-envelope}

Durable Workflow v2 は各環境で測るべき軸を定義します。本番が依存する前に、ステージングやカナリアで基準を記録します。

| 測定軸 | 基準にする項目 | 情報源 |
| --- | --- | --- |
| プロジェクションの健全性 | 定常 `needs_rebuild = 0`、意図的な差分後の再構築時間、古い・孤立行の削除時間 | `/waterline/api/v2/health`、`/waterline/api/stats`、`workflow:v2:rebuild-projections` |
| キュー負荷 | 滞留・最古準備の年齢、実行可能と遅延数、追加・配信率、配信超過年齢、古いポーラー、`accepting`・`saturated`・`throttled`・`no_slots`・`no_active_workers` | Waterline の統計・キュー画面と `operator_metrics.backlog.*` / `operator_metrics.tasks.*` |
| 開始遅延 | 受付済みだが最初のタスク作成待ちのコマンド、最古開始待ち年齢、最初の取得 | `operator_metrics.starts.*` と Worker の `schedule_to_start` |
| スケジュールから開始までの遅延 | 投入から開始までのワークフロー・アクティビティのキュー待ち | Worker SDK メトリクス |
| 多数タイマーの起床 | 集中発火時の通知伝播と、予定発火時刻から準備タスクの可視化までの遅れ | Worker テレメトリと同一リージョンの起床調整確認 |
| 修復走査コスト | 候補数、選択数、最古候補、最古欠落実行、走査圧力 | `operator_metrics.repair.*` |
| 履歴負荷 | イベント数、履歴サイズ、continue-as-new 推奨閾値 | `operator_metrics.history.*` |

これは測定軸であり、普遍的な遅延保証ではありません。運用トポロジーで許容する範囲を公開してください。

## 長時間負荷の証拠 {#long-soak-evidence}

一時的なベンチマークだけでは足りません。持続トラフィックに信頼できるとする前に、宣言した範囲内で時間を通じて稼働した長時間負荷の資料を残します。

最低限、次を含めます。

- 負荷形態：トポロジー、イメージ・アプリ改訂、Worker ビルド、キュー構成、キャッシュ、DB、開始・タイマー・アクティビティ・クエリ・エクスポートの代表的な比率
- 時間枠：開始終了時刻、通常の修復一周期、該当すれば保持・アーカイブ一回、代表的な業務周期の変動を含む期間
- キュー安定性：滞留・準備・開始待ちの年齢、追加対配信率、古いポーラー数が公開基準内
- 正しさ：健康面に持続 `status = error` がなく、`operator_metrics.repair.*` に不明な増加、`operator_metrics.workers.*` に持続互換性欠落がない
- プロセスとキャッシュ：メモリ、CPU、イベントループ・スレッド圧力、キャッシュ・系列数が定常負荷で単調増加せず上限内
- 復旧：直近の成功バックアップ、復元演習、復元所要時間、準備を証明したコマンド

同じ運用者がデプロイ手順書と一緒に取り出せる場所へ保存します。対応する長時間資料なしで測定値、アラート、復旧時間を主張する場合は、信頼済みの運用証拠ではなく暫定値として扱います。

## 運用者の一連の確認 {#end-to-end-operator-checklist}

アップグレード後と新環境を信頼する前に、次を確認します。

1. `php artisan workflow:v2:doctor --strict` を実行します。
2. `GET /waterline/api/v2/health` が `ok`、`warning`、`error` のどれかを確認します。
3. `GET /waterline/api/stats` で滞留、修復、履歴、契約、Worker 互換性、プロジェクションのずれを読みます。
4. ずれがあれば再構築・バックフィルをプレビューします。
5. 代表的な実行をエクスポートし、保存・Replay 成果物の経路を確認します。
6. アーカイブ後に稼働画面から外れ、保持削除まで永続行が残ることを確認します。
7. 手順書の復元・フェイルオーバーを演習し、実測遅延が公開したトポロジーの想定に合うことを確認します。

## 関連ガイド {#related-guides}

- [監視](./monitoring.md)
- [Waterline 運用 API](./waterline-operator-api.md)
- [ワークフローの削除](./configuration/pruning-workflows.md)
- [セルフホストのデプロイ](./deployment.md)
