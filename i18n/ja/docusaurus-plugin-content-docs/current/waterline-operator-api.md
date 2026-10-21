---
sidebar_position: 13
title: Waterline 運用者 API リファレンス
description: ダッシュボード一覧、選択実行詳細、履歴エクスポート、スケジュール、保存済みビュー、設定、運用操作のための型付き Waterline API 契約。
tags:
  - Waterline
  - observability
  - API
  - reference
keywords:
  - Waterline API リファレンス
  - 選択実行の詳細
  - 履歴エクスポート
  - 操作可否の契約
  - ワークフローの運用操作
---

# Waterline 運用者 API リファレンス {#waterline-operator-api-reference}

Waterline は、組み込み Laravel とスタンドアロン Server デプロイの両方で永続状態を扱う運用インターフェースです。UI もここに記載する同じ HTTP+JSON API を使うため、スクリプト、ダッシュボード、エージェントは HTML をスクレイピングせずに永続ワークフローの事実を読めます。

選択実行詳細、履歴エクスポート、操作可否、コマンドの利用可否、保存済みビュー、設定、スケジュールの可視性など、型付きの運用証拠が必要な場合に使ってください。Waterline の永続状態と Worker・ランタイムテレメトリの概念的な区別は、[監視](./monitoring.md)を参照してください。

## インストール {#installation}

Workflow パッケージをインストールした同じ組み込み Laravel アプリケーションに、Waterline をインストールします。

```bash
composer require \
  %%artifact.waterlineComposerPackage%% \
  %%artifact.workflowComposerPackage%%
php artisan waterline:install
```

生成された固定指定は Waterline と Workflow の安定版 2.x を選びます。組み込みモードはアプリのワークフロー状態を直接読み、サービス SDK は不要です。Waterline の更新後は現在のアセットを公開してください。

```bash
composer update durable-workflow/waterline
php artisan waterline:publish
```

Laravel ホスト内からサービスモードを観測する場合は、PHP SDK もインストールします。

```bash
composer require %%artifact.phpSdkComposerPackage%%
```

自己完結型 Waterline サービスイメージは SDK を含みます。接続、認証、永続化の入力は[監視](./monitoring.md#waterline-service)に記載しています。

### インターフェースの言語 {#interface-language}

Waterline は組み込み・サービスモードの両方で、英語、ブラジルポルトガル語、簡体字中国語、フランス語、ドイツ語、日本語、スペイン語、ウクライナ語に対応します。Laravel アプリまたはサービスコンテナの環境に設定します。

```dotenv
WATERLINE_LOCALE=es
```

| 言語 | 設定 |
| --- | --- |
| 英語 | `en` |
| ブラジルポルトガル語 | `pt-BR` |
| 簡体字中国語 | `zh-Hans` |
| フランス語 | `fr` |
| ドイツ語 | `de` |
| 日本語 | `ja` |
| スペイン語 | `es` |
| ウクライナ語 | `uk` |

`es-ES`、`es-MX`、`es-419` などの地域別名は、共通スペイン語 UI を選びます。`pt`、`pt_br` と大文字小文字違いはブラジルポルトガル語（`pt-BR`）を選び、他のポルトガル語地域は英語にフォールバックします。件数、グラフラベル、相対時間は選択言語に従います。

簡体字中国語には `zh-Hans` を使います。`zh`、`zh-CN`、`zh-SG`、`zh-Hans-CN` のような明示的簡体字タグも同じ UI を選びます。アンダースコアと大文字小文字違いも使えます。`zh-Hant`、`zh-TW`、`zh-HK` などの繁体字は英語にフォールバックします。

日本語には `ja` を使います。`ja-JP` などの地域別名、アンダースコア、大文字小文字違いも同じ UI を選びます。

フランス語には `fr` を使います。`fr-FR`、`fr-CA` などの地域別名、アンダースコア、大文字小文字違いも共通 UI を選びます。

ドイツ語には `de` を使います。`de-DE`、`de-AT`、`de-CH` などの地域別名、アンダースコア、大文字小文字違いも共通 UI を選びます。

既定・フォールバックは英語です。組み込みアプリでは、解決済み設定の `waterline.locale` も使えます。変更後は Laravel の設定キャッシュを再構築してください。ホストアプリのロケール、ワークフロー名、識別子、ペイロード、元の例外文は変更しません。JSON API のフィールド名と機械状態も既存の値を維持します。

## デプロイ境界 {#deployment-boundary}

Waterline は二つのバックエンドアダプターを持ちます。

- 組み込みモードは Laravel ホスト内で動き、Workflow パッケージの永続状態をプロセス内で読みます。
- サービスモードは公開 Waterline イメージで動き、`durable-workflow/sdk` と Server 公開 API を通じ、一つのスタンドアロン Server 名前空間を読みます。

両アダプターがこのページのルートを公開します。サービスモードは、対応する Server 契約へ変換します。

| Waterline ルート分類 | サービスモードが使うスタンドアロン Server 契約 |
| --- | --- |
| `GET /waterline/api/v2/health` | Server ヘルス、Worker 登録、タスクキューの可視性。 |
| `GET /waterline/api/stats` | 名前空間単位の運用ダッシュボードとメトリクススナップショット。 |
| フロー一覧、選択実行詳細、履歴エクスポート | [Server API リファレンス](./polyglot/server-api-reference.md)のワークフロー一覧、詳細、実行、履歴、診断。 |
| シグナル、更新、クエリ、キャンセル、強制終了、修復、アーカイブ | 対応する Server ワークフローコマンドと修復契約。 |
| `/waterline/api/v2/schedules` 配下 | Server のスケジュール一覧、詳細、履歴、変更契約。 |

Waterline があっても、Server API、CLI、SDK を直接使えます。モード・名前空間横断の可視性を仮定しないでください。実行は所有元のランタイムと名前空間から読み取り・操作します。[デプロイモード](./polyglot/deployment-modes.md)が共通の製品境界を定義します。

## ベースパスと範囲 {#base-path-and-scope}

Waterline は Laravel アプリで設定したベースパスにマウントします。以下は `/waterline` を使います。別の接頭辞で公開する場合も `/api/...` 接尾辞は同じにします。

`WATERLINE_NAMESPACE` を設定すると、全一覧、詳細、スケジュール、運用操作ルートは名前空間単位になります。他名前空間の状態を漏らさず、範囲外の読み取り・コマンドには not-found の意味を返します。

```bash
curl -sS "$APP_URL/waterline/api/instances/order-1001" \
  -H "Accept: application/json" | jq '.status, .run_id, .actionability'
```

## 認証 {#authentication}

全 Waterline UI・JSON API コントローラーは Waterline のアクセスチェックを通ります。組み込みモードでは Laravel ホストがチェックを定義し、ガード、ルートミドルウェア、ゲート、ポリシー、SSO/OIDC/SAML セッション、ディレクトリ連携グループ、サービストークン、レート制限を決めます。

現在の JSON 運用 API グループは Laravel の CSRF ミドルウェアを除外し、読み取りとコマンドに一貫したセッション・サービストークン境界をホストが適用できるようにします。リクエスト認証と、API の周囲に加えるブラウザーセッションの CSRF 保護の文書化は、ホストの責任です。

自己完結型サービスイメージにはホストアプリのユーザーがありません。`WATERLINE_ALLOW_UNAUTHENTICATED=true` の前に、認証リバースプロキシの背後かプライベートインターフェースに置きます。この設定は入口チェックを周囲のデプロイに委譲します。別途 `WATERLINE_SERVER_TOKEN` が PHP SDK からスタンドアロン Server への呼び出しを認証します。この Server 認証情報をブラウザーへ公開してはいけません。

`WATERLINE_ACCESS_MODE=read_only` は変更ルートをローカルでブロックします。`operator` は有効化しますが、接続先 Server は独自のトークンロール・名前空間権限を引き続き適用します。例と二つの認証境界は[監視](./monitoring.md#waterline-service)を参照してください。

## ダッシュボードとヘルス {#dashboard-and-health}

| メソッド | パス | 目的 |
| --- | --- | --- |
| `GET` | `/waterline/api/stats` | ダッシュボード総数、バックログカウンター、修復ポリシー、運用メトリクス、フリート傾向。 |
| `GET` | `/waterline/api/v2/health` | Waterline パッケージ・ランタイムのヘルスと v2 データ情報源の準備状態。 |

`/waterline/api/stats` はダッシュボード概要です。`operator_metrics` は Waterline 所有の JSON 診断であり、Prometheus のスクレイプ先ではありません。実行時遅延・カスタムテレメトリには Worker SDK メトリクスを使います。

[運用者の運用範囲](./operator-operating-envelope.md)は、ロールアウト・障害対応中の解釈を定義します。特に次を扱います。

| フィールド分類 | 意味 |
| --- | --- |
| `operator_metrics.backlog.*` | 永続的な実行可能、遅延、リース済み、不健全、修復必要、取得失敗、互換性ブロックの作業数と、フリート全体の `tasks_added_last_minute`・`tasks_dispatched_last_minute` のキュー流量。 |
| `operator_metrics.matching_role.*` | 応答プロセスのノード固有 matching・配送契約。`queue_wake_enabled`、デプロイ `shape`、`task_dispatch_mode`、固定 `partition_primitives`、現在の `backpressure_model`。 |
| `operator_metrics.repair.*` | 選択候補、候補の経過時間、スキャン負荷を含む修復ループの走査範囲。 |
| `operator_metrics.projections.*` | 実行概要、待機、タイムライン、タイマー、系譜の投影ずれの件数。 |
| `operator_metrics.command_contracts.*` | まだバックフィルが必要な古い WorkflowStarted 契約スナップショット。 |
| `operator_metrics.history.*` | 履歴サイズ・イベント数の圧力と continue-as-new 推奨。 |
| `queue_visibility.available`, `queue_visibility.reason` | このホストで名前空間単位のキュー可視性を利用できるかと、できない理由。 |
| `queue_visibility.task_queues[].stats.*` | キュー固有のバックログ、経過時間、ポーラー数、ワークフロー・アクティビティの準備済み対リース済み件数、`tasks_added_last_minute` / `tasks_dispatched_last_minute` 流量。 |
| `queue_visibility.task_queues[].repair.*` | キュー固有の候補、配送失敗、期限切れリース、配送遅延の件数と各状態の最長経過時間。 |
| `coordination_alerts[]` | ヘルスチェックと、ポーラー不在のバックログ、古いポーラー、長期の修復候補などキュー可視性リスクから得る警告・エラー概要。 |
| `checks[]`, `categories.*` | ブロックする v2 ヘルスチェックと助言チェック。各 `category = correctness \| acceleration` と、Worker 画面で使う分類集計。 |
| `engine_source`, `readiness_contract` | v2 運用ブリッジを実際に使用しているか、状態をどの準備状態契約が規定するか。 |

キュー流量は、永続キューへの入力が配送速度を上回るかに答えます。`tasks_added_last_minute` は直近 60 秒に作った異なる永続タスク行数、`tasks_dispatched_last_minute` は同じ期間内に最新の成功した配送が行われた異なる行数です。

単独でなく Server のタスクキュー可視性ルートと合わせて使ってください。Waterline は永続入力が配送を上回るかを示し、`/api/task-queues` と `/api/task-queues/{taskQueue}` は、高負荷キューが `saturated`、意図的な `throttled`、`no_active_workers`、または正常なポーラー・スロット不足かを示します。

`GET /waterline/api/v2/health` は、Waterline 内で同じキュー固有の証拠を公開します。一つの名前空間の現在状態が必要なスクリプト・ダッシュボードは、キュー別統計を `queue_visibility.task_queues[]`、運用者の注意が必要なキュー・ヘルス条件の概要を `coordination_alerts[]` から読みます。

`matching_role` は、このノードが現在どの matching 構成を提供するかという別の問いに答えます。`shape` は `in_worker` と `dedicated` を区別し、`partition_primitives` は軸を `connection`/`queue`/`compatibility`/`namespace` に固定し、現在の `backpressure_model` は `lease_ownership` を報告します。これはプロセス固有として扱います。構成混在の更新では、バックログやポーリングの差を Worker 問題と決める前にノード間で比較してください。

`GET /waterline/api/v2/health` も、`error` はブロック、`warning` は助言、`ok` は現在の v2 運用ブリッジが準備済み、という区別を使います。

## 一覧ビュー {#list-views}

永続ステータス別に分類します。

| メソッド | パス | バケット |
| --- | --- | --- |
| `GET` | `/waterline/api/flows/running` | 未終了またはアクティブにブロック中の実行。 |
| `GET` | `/waterline/api/flows/completed` | `closed_reason = continued` の継続済み実行を含む、正常終了した実行。 |
| `GET` | `/waterline/api/flows/failed` | 失敗した実行。 |
| `GET` | `/waterline/api/flows/cancelled` | キャンセルした実行。 |
| `GET` | `/waterline/api/flows/terminated` | 強制終了した実行。 |

一覧行は簡潔な運用概要です。安定フィールドは識別情報（`id`、`instance_id`、`run_id`、`workflow_type`）、状態（`status`、`closed_reason`、`archived_at`）、時間、`history_event_count`、`history_size_bytes`、`continue_as_new_recommended`、`repair_blocked` などの修復・操作可否バッジです。

## 選択実行の詳細 {#selected-run-detail}

二つのアドレス指定モードがあります。

| メソッド | パス | 目的 |
| --- | --- | --- |
| `GET` | `/waterline/api/instances/{instanceId}` | インスタンスの現在の選択実行。 |
| `GET` | `/waterline/api/instances/{instanceId}/runs/{runId}` | 明示的な選択実行。 |
| `GET` | `/waterline/api/flows/{id}` | Waterline 行または実行 ID によるレガシー・詳細検索。 |

選択実行詳細は、運用画面の規範となる JSON 契約です。次の永続状態と派生診断を含みます。

| フィールド分類 | 意味 |
| --- | --- |
| `activities`, `timers`, `waits`, `children` | 型付き履歴を優先して再構築する、現在と過去の待機状態。 |
| `signals`, `updates`, `declared_signals`, `declared_updates`, `declared_queries` | コマンドライフサイクル行と、ロード可能なワークフロー契約の対象。 |
| `timeline` | 順序付き永続イベントと診断エントリ。 |
| `exceptions`, `logs` | 失敗の事実とリプレイ・デバッグのコンテキスト。 |
| `can_signal`, `can_update`, `can_query`, `can_cancel`, `can_terminate`, `can_archive` | 選択実行に対する UI・自動化の操作可否。 |
| `actionability` | 以下で説明するバージョン付き修復・証拠契約。 |

自動化は画像より選択実行詳細を優先すべきです。画像は運用者が見たものを示せますが、詳細は修復、クエリ、キャンセル、アーカイブ、リプレイが可能・不可能な理由を説明します。

## 履歴エクスポート {#history-export}

履歴エクスポートはリプレイ・デバッグバンドルです。選択実行を再現・保存できるよう、保存済みのワークフロー、コマンド、アクティビティ、更新、タスク、失敗、履歴のペイロードを意図的に含めます。

| メソッド | パス | 目的 |
| --- | --- | --- |
| `GET` | `/waterline/api/instances/{instanceId}/history-export` | インスタンスの現在の選択実行をエクスポート。 |
| `GET` | `/waterline/api/instances/{instanceId}/runs/{runId}/history-export` | 明示的な実行をエクスポート。 |
| `GET` | `/waterline/api/flows/{id}/history-export` | Waterline 行・実行 ID によるレガシー・詳細エクスポート。 |

保護環境の外へ出る可能性がある場合、まず履歴エクスポートの墨消し機能を設定します。下流ツールは `redaction` メタデータを保持し、どのポリシーが成果物に適用されたか確認できるようにしてください。

## 操作可否の契約 {#actionability-contract}

一覧行、選択実行詳細、タイムライン、履歴エクスポートに、バージョン付き操作可否契約を付けます。

```json
{
  "actionability_contract": {
    "schema": "waterline.actionability",
    "version": 1
  }
}
```

識別子は `actionability_contract.schema = waterline.actionability` と `actionability_contract.version = 1` です。

実行単位の `actionability` は、選択実行を修復できるかを示します。

| フィールド | 意味 |
| --- | --- |
| `repair_state` | `repairable`、`blocked`、`not_needed`、`unknown` のいずれか。 |
| `repairable` | `repair_state = repairable` の真偽値による略記。 |
| `blocked_reason` | `repair_state = blocked` 時の安定した理由コード。 |
| `status_bucket` | 実行単位の判断に使った Waterline バケット。 |
| `closed_reason` | 終了済み実行の永続的な終了理由。 |
| `task_problem` | 実行にタスク単位の問題を検出したか。 |
| `diagnostic_only_evidence` | 少なくとも一行が参考情報であり再開元でない場合 true。 |

`activities`、`waits`、`timers`、`exceptions`、`logs`、タイムライン・エクスポートの証拠行も、独自の `actionability` を持つ場合があります。

| フィールド | 意味 |
| --- | --- |
| `state` | 有効な修復元なら `actionable`、それ以外は `diagnostic_only`。 |
| `repair_source` | 修復可能な規範情報源が裏付ける行だけ true。 |
| `diagnostic_only` | 再開元に使ってはいけない場合 true。 |
| `history_authority` | `typed_history`、`mutable_open_fallback`、`failure_row_fallback`、`unsupported_terminal_without_history` などの規範情報源。 |
| `history_unsupported_reason` | 未対応のフォールバック履歴の安定した理由コード。 |

エージェント・スクリプトは、`actionability.repair_state`、`actionability.repairable`、行単位の `actionability.repair_source` に基づき修復・再開を判断しなければなりません。`diagnostic_only = true` の行は証拠であり、リプレイ・再開の許可ではありません。

## 運用操作 {#operator-actions}

Waterline 操作は選択実行契約から発行する永続コマンドです。インスタンスルートは現在実行を対象とし、実行ルートは古い・異なる実行を明示的に拒否します。

| メソッド | パス | 目的 |
| --- | --- | --- |
| `POST` | `/waterline/api/instances/{instanceId}/queries/{query}` | 現在実行に宣言済みクエリを実行。 |
| `POST` | `/waterline/api/instances/{instanceId}/signals/{signal}` | 現在実行にシグナルを送信。 |
| `POST` | `/waterline/api/instances/{instanceId}/updates/{update}` | 現在実行に更新を送信。 |
| `POST` | `/waterline/api/instances/{instanceId}/repair` | 操作可否が許す場合に現在実行の修復を配送。 |
| `POST` | `/waterline/api/instances/{instanceId}/cancel` | 現在実行のキャンセルを要求。 |
| `POST` | `/waterline/api/instances/{instanceId}/terminate` | 現在実行を強制終了。 |
| `POST` | `/waterline/api/instances/{instanceId}/archive` | 選択した終了済み実行をアーカイブ。 |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/queries/{query}` | 明示的な選択実行にクエリを実行。 |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/signals/{signal}` | 選択実行が現在実行の場合だけシグナル送信。 |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/updates/{update}` | 選択実行が現在実行の場合だけ更新送信。 |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/repair` | 明示的な選択実行を修復。 |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/cancel` | 選択実行が現在実行の場合だけキャンセル。 |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/terminate` | 選択実行が現在実行の場合だけ強制終了。 |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/archive` | 選択した終了済み実行をアーカイブ。 |

シグナル、更新、クエリは JSON の `arguments` を受け付けます。不正な引数はフィールド単位の検証失敗を返します。リプレイがブロックされると、最善努力で実行せず、`workflow_definition_unavailable` などの安定した理由と `409 Conflict` を返します。

## 更新の調査 {#update-inspection}

| メソッド | パス | 目的 |
| --- | --- | --- |
| `GET` | `/waterline/api/instances/{instanceId}/updates/{updateId}` | 現在実行の更新ライフサイクル行を調査。 |
| `GET` | `/waterline/api/instances/{instanceId}/runs/{runId}/updates/{updateId}` | 明示的実行の更新ライフサイクル行を調査。 |
| `GET` | `/waterline/api/flows/{id}/updates/{updateId}` | レガシー・詳細の更新検索。 |

UI・エージェントが、更新の受理、適用、完了、拒否、待機中のタイムアウト、リプレイ互換性によるブロックを説明する場合に使います。

## スケジュール {#schedules}

スケジュールルートは v2 の可視性・運用操作ルートです。

| メソッド | パス | 目的 |
| --- | --- | --- |
| `GET` | `/waterline/api/v2/schedules` | 現在の範囲で見えるスケジュール一覧。 |
| `GET` | `/waterline/api/v2/schedules/{scheduleId}` | 一つの詳細。 |
| `GET` | `/waterline/api/v2/schedules/{scheduleId}/history` | スケジュールのライフサイクル監査イベントを読む。 |
| `POST` | `/waterline/api/v2/schedules/{scheduleId}/pause` | 将来の発火を一時停止。 |
| `POST` | `/waterline/api/v2/schedules/{scheduleId}/resume` | 一時停止を再開。 |
| `POST` | `/waterline/api/v2/schedules/{scheduleId}/trigger` | 即時発火を要求。 |
| `POST` | `/waterline/api/v2/schedules/{scheduleId}/backfill` | 指定期間をバックフィル。 |
| `DELETE` | `/waterline/api/v2/schedules/{scheduleId}` | スケジュールを削除。 |

スケジュールは名前空間と `schedule_id` で識別します。同じ `schedule_id` が複数の名前空間に存在することがあります。スケジュール単位のルートはすべて、省略可能な `namespace` パラメーターをクエリ文字列またはリクエスト本文で受け付けます。

- 名前空間単位の Waterline は、自身の名前空間だけを操作します。`WATERLINE_NAMESPACE` を設定した組み込み Waterline と、すべてのサービスモードのデプロイが該当します。他の名前空間へのリクエストは `404` を返します。
- クラスター全体の組み込み Waterline は、リクエストされた名前空間を操作します。`namespace` がなく、`schedule_id` が複数の名前空間に存在する場合は、理由 `schedule_namespace_required` とともに `409` を返します。何も変更されません。

```bash
curl -sS -X POST \
  "$APP_URL/waterline/api/v2/schedules/nightly-invoice-sync/pause?namespace=billing" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"note": "Supplier maintenance"}' | jq '.status, .note'
```

### スケジュール行 {#schedule-rows}

一覧レスポンスはページ単位で、`data`、`current_page`、`last_page`、`per_page`、`total`、`operator_scope` を持ちます。`data` の各行は、組み込みモードとサービスモードで同じフィールドを持ちます。

| フィールド | 意味 |
| --- | --- |
| `schedule_id` | スケジュールの ID。スケジュール単位のすべてのルートに `namespace` とともに送ります。 |
| `id` | `schedule_id` と同じ値。古いクライアント向けに残しています。 |
| `namespace` | スケジュールの名前空間。 |
| `workflow_type`, `workflow_class` | スケジュールが開始するワークフロー。どちらも `null` の場合があります。 |
| `status`, `paused` | `active`、`paused`、`deleted` のいずれかと、スケジュールが一時停止中かどうか。 |
| `note` | 運用者の注記、または `null`。 |
| `spec` | 発火の周期。`cron_expressions`（cron 文字列）、`intervals`（ISO 8601 期間の `every` と省略可能な `offset` を持つオブジェクト）、`timezone`。 |
| `overlap_policy` | `skip`、`buffer_one`、`buffer_all`、`cancel_other`、`terminate_other`、`allow_all` のいずれか。 |
| `next_fire_at`, `last_fired_at` | ISO 8601 タイムスタンプ、または `null`。 |
| `last_outcome` | 記録された直近の発火結果。記録がない場合は `null`。`outcome`（`scheduled`、`drained`、`backfilled`、`skipped`、`failed` など）、`at`、`reason`、`workflow_id`、`run_id` を持ちます。 |
| `fires_count`, `failures_count`, `skipped_trigger_count`, `remaining_actions` | カウンター。バックエンドが報告しないカウンターは `null`。 |
| `search_attributes` | スケジュールの検索属性、または `null`。 |
| `created_at`, `updated_at` | ISO 8601 タイムスタンプ。 |

`last_fired_at` があり `last_outcome` がない行は、バックエンドが発火時刻だけを報告し、その結果を報告しなかったことを示します。

一覧行と、詳細、`pause`、`resume` の各レスポンスには、`action`、`max_runs`、`jitter_seconds`、`paused_at`、`last_skip_reason`、`last_skipped_at`、`latest_workflow_instance_id`、`buffered_actions`、`memo`、`recent_actions` も含まれます。`recent_actions` の各要素は `outcome`、`fired_at`、`reason`、`workflow_id`、`run_id`、`occurrence_time` を持ちます。`latest_instance_id` は古いクライアント向けに `latest_workflow_instance_id` と同じ値を返します。`spec` は、発火の周期を表すフィールドの後に、バックエンドが保存したその他のキーをすべて保持します。

### 発火とバックフィルの結果 {#trigger-and-backfill-results}

`trigger` は省略可能な `overlap_policy` を受け付けます。`schedule_id`、`namespace`、`outcome`（`triggered`、`buffered`、`buffer_full`、`skipped`）、`triggered`、`workflow_id`、`run_id`、`reason` を返します。`triggered` はワークフローが開始した場合だけ `true` です。`instance_id` は古いクライアント向けに `workflow_id` と同じ値を返します。

`backfill` には ISO 8601 タイムスタンプの `from` と `to` が必須で、省略可能な `overlap_policy` も受け付けます。`schedule_id`、`namespace`、`fires_attempted`、`started_count`、`skipped_count`、`failed_count`、`results` を返します。各結果は `fire_time`、`workflow_id`、`outcome`（`started`、`skipped`、`failed`）、`reason` を持ちます。古いクライアント向けに、各結果は `schedule_id` も繰り返します。また、`cron_time`、`instance_id`、`error` は、それぞれ `fire_time`、`workflow_id`、失敗した結果の `reason` と同じ値を返します。`backfill` は、終了が開始より後でない期間を、理由 `invalid_time_range` とともに `422` で拒否します。

どちらのルートも、不明な `overlap_policy` を理由 `invalid_overlap_policy` とともに `422` で拒否します。

## 保存済みビューと設定 {#saved-views-and-preferences}

これらは UI 所有の運用設定であり、ワークフロー履歴ではありません。ただし、障害時に使う正確なフィルター・表配置を共有でき、安定した手順書に役立ちます。

| メソッド | パス | 目的 |
| --- | --- | --- |
| `GET` | `/waterline/api/saved-views` | 保存済み運用ビュー一覧。 |
| `POST` | `/waterline/api/saved-views` | ビューを作成。 |
| `GET` | `/waterline/api/saved-views/{view}` | 一つのビューを読む。 |
| `PUT` | `/waterline/api/saved-views/{view}` | ビューを更新。 |
| `DELETE` | `/waterline/api/saved-views/{view}` | ビューを削除。 |
| `GET` | `/waterline/api/preferences/{surface}` | 一つの画面の UI 設定を読む。 |
| `PUT` | `/waterline/api/preferences/{surface}` | 一つの画面の UI 設定を更新。 |

ビュー名や設定ペイロードを永続ワークフローの事実と扱わないでください。証拠には選択実行詳細か履歴エクスポートを示します。

## エラー契約 {#error-contract}

通常の HTTP ステータスと JSON エラー詳細を使います。

| ステータス | 意味 |
| --- | --- |
| `400` | 不正なリクエストまたは未対応の操作ペイロード。 |
| `404` | 現在名前空間にインスタンス、実行、更新、スケジュール、保存済みビュー、設定画面が見つからない。 |
| `409` | 過去、終了済み、リプレイブロック、定義利用不可などにより選択実行が操作を実行できない。クラスター全体のスケジュールリクエストで `schedule_id` に `namespace` が必要な場合も `409` を返す。 |
| `422` | 検証失敗。フィールド単位のエラーを含む。 |
| `500` | 予期しないアプリケーション失敗。 |

自動化は、ステータスと `blocked_reason`、`query_blocked_reason`、`outcome`、`reason`、`actionability` などの安定した値で分岐します。通知文やボタンラベルを契約として解析しないでください。

## 関連資料 {#see-also}

- [監視](./monitoring.md)
- [失敗と復旧](./failures-and-recovery.md)
- [クエリ](./features/queries.md)
- [キャンセルと強制終了](./features/cancel-and-terminate.md)
- [エージェントツール契約](./agent-tooling-contract.md)
