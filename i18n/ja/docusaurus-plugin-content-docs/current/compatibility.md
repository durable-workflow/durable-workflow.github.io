---
sidebar_position: 17
title: バージョン互換性
description: Durable Workflow の公開インターフェースに対する、正規の互換性とリリース規範の契約。
tags:
  - compatibility
  - operations
  - protocols
  - api-stability
keywords:
  - バージョン互換性
  - 互換性の規範
  - リリースの規範
  - 安定性レベル
  - プロトコルマニフェスト
  - コントロールプレーンバージョン
  - Worker プロトコルバージョン
  - インターフェースの安定性契約
---

import PublicAuthorityIdentity from '@site/src/components/PublicAuthorityIdentity';
import WorkerProtocolAuthorityRoles from '@site/src/components/WorkerProtocolAuthorityRoles';
import protocolCatalog from '@site/static/platform-protocol-specs.json';

# バージョン互換性 {#version-compatibility}

このページは、Durable Workflow 公開プラットフォームの**正規の互換性とリリース規範の契約**です。次の唯一の正しい情報源です。

- どのインターフェースが公開か
- 各公開インターフェースの安定性レベル
- パッチ、マイナー、メジャーの各リリースに含められる変更
- フィールドが契約の一部か、診断専用か
- Server が対応不能なインターフェースを通知したとき、クライアントが安全側に拒否するためのランタイムのバージョン交渉プロトコル

パッケージごとの安定性ドキュメント（`durable-workflow/workflow` リポジトリの `docs/api-stability.md`、`dw` CLI リファレンス、Waterline 運用者 API ページなど）は、このページに**従属**します。このルールの下で個別の詳細を追加します。食い違う場合はこのページが優先し、個別ドキュメント側のバグです。

SDK、Server マニフェスト、CI ゲートが一つの正しい情報源に対して検証できるよう、同じ契約を機械可読形式でも公開しています。

- スタンドアロン Durable Workflow Server の `GET /api/cluster/info` レスポンス本文にある `surface_stability_contract`。スキーマは `durable-workflow.v2.surface-stability.contract`、バージョンは `5`。
- このリポジトリの `static/compatibility-contract.json` にある、同じマニフェストの固定ミラー。
- Server が再公開するプロセス内の情報源である PHP クラス `Workflow\V2\Support\SurfaceStabilityContract`。

以下のインターフェースの安定性レベル、フィールド集合、破壊的変更のルールを変えるリリースは、同じ変更でこのページ、JSON ミラー、PHP マニフェスト、該当する個別の安定性ドキュメントを更新しなければなりません。ドキュメント CI は、機械可読契約、利用可能な公開 Rust メタデータ、Worker プロトコル仕様を検証します。このページとマニフェストの文章の整合性は、明示的にリリースレビューの責任です。

## 併用する資料: プラットフォームプロトコル仕様カタログ {#companion-platform-protocol-spec-catalog}

このページは、*どの*インターフェースが公開で、*どのように*変更できるかを定めます。[プラットフォームプロトコル仕様](/docs/platform-protocol-specs)カタログは、各インターフェースの規範となる機械可読仕様が*どこに*あるか、*形式*（HTTP API は OpenAPI、オブジェクト分類は JSON Schema、イベントストリームの意味は AsyncAPI）、*担当リポジトリ*、規定するオブジェクト分類、成果物を解決する公開 URL を示します。SDK 作者、エージェント、運用者は、文章の再読やリポジトリ内の実装詳細への依存ではなく、仕様カタログに対して検証してください。

カタログは `GET /api/cluster/info` の `platform_protocol_specs` として通知されます。

<PublicAuthorityIdentity
  manifest={protocolCatalog}
  manifestUrl="https://durable-workflow.github.io/platform-protocol-specs.json"
/>

全カタログエントリの `surface_family` は、上記契約に存在しなければなりません。サイト CI はカタログを検証し、各公開仕様 URL を解決し、リポジトリ内だけの規範フィールドを拒否します。

<WorkerProtocolAuthorityRoles />

必須の全プラットフォームプロトコルカタログエントリは `published` です。呼び出し可能キャリアのエントリは `in_progress` のままです。利用可能な各エントリは、公開 OpenAPI、AsyncAPI、JSON Schema ドキュメントへ直接リンクします。[`cluster_info_envelope`](/docs/platform-protocol-specs#cluster-info-envelope-notes) スキーマは、他の全エントリに到達できる検出インターフェースを固定します。

## 安定性レベル {#stability-levels}

Durable Workflow の各公開インターフェースは、次の安定性レベルを厳密に一つ持ちます。分類は明示的です。未分類のインターフェースは公開ではありません。

| レベル | 意味 | 破壊的変更を許す時点 |
|-------|---------|-----------------------------------|
| `frozen` | ワークフローの全存続期間、同じ方法でデコードしなければならないワイヤ形式または永続化形式。フィールドの名前変更、削除、用途変更はプロトコル破壊であり、マイナー変更ではありません。 | 新しい型名を持つ**並行プリミティブ**を導入する場合のみ。元の形式は無期限にデコード可能なまま保ちます。 |
| `stable` | プラットフォームの semver 保証対象の公開インターフェース。追加変更はマイナーリリースで提供します。 | メジャーリリースのみ。 |
| `prerelease` | 機能は完成しているが、対応する `1.0.0` / `2.0.0` 確定前に変更可能な公開インターフェース。 | 明確に表示したプレリリース版。リリースノートに記載します。 |
| `experimental` | 公開だが不安定なインターフェース。パッチを含む任意のリリースで変更可能。呼び出し元は実験的フラグを読んでオプトインする必要があります。 | 任意のリリース。変更をリリースノートに記載します。 |

## 公開インターフェースの分類 {#public-surface-families}

以下が完全な一覧です。分類の追加、削除、再分類には契約変更が必要です。同じコミットで `SurfaceStabilityContract` のバージョン、このページ、JSON ミラーを更新します。

| 分類 | 安定性 | `/api/cluster/info` の規範マニフェスト | 対象 |
|--------|-----------|-------------------------------------------|----------------|
| `server_api` | `stable` | `control_plane` | スタンドアロン Server の HTTP API。コントロールプレーン、名前空間、スケジュール、システムのルートと `/api/health`、`/api/ready`、`/api/cluster/info`。ルートごとのバージョンは `control_plane.request_contract` と `control_plane.response.contract` が規定します。Server 最上位の `version` はビルド識別情報であり、クライアント互換性の規範ではありません。 |
| `worker_protocol` | `stable` | `worker_protocol` | 外部 SDK Worker が、登録、ポーリング、ハートビート、Worker セッションリース管理、ワークフロー・アクティビティ・クエリタスクの完了・失敗に使う Worker プレーン HTTP API。`worker_sessions` と `local_activities` のランタイム契約、`external_execution_surface_contract`、`external_executor_config_contract`、`invocable_carrier_contract`、`external_task_input_contract`、`external_task_result_contract` を含みます。 |
| `cli_json` | `stable` | 該当なし（CLI リファレンス参照） | `dw` の `--output=json` と `--output=jsonl` の形式。JSON の終了コードとフィールド名が永続的なインターフェースです。人向けの `--output=table` はドキュメントであり、契約ではありません。 |
| `waterline_api` | `stable` | 該当なし（Waterline 運用者 API 参照） | `/waterline/api/v2/*` の可観測性 HTTP API、エンジン情報源契約、ダッシュボード JSON 形式。Waterline は Workflow パッケージのメジャーバージョンと一致させる必要があります。 |
| `mcp_discovery_results` | `stable` | 該当なし（MCP ワークフローページ参照） | `/mcp/*` の Model Context Protocol インターフェースと `llms.txt` / `llms-2.0.txt` 検出ファイル。MCP ツール名、パラメータスキーマ、`payload_preview_limit_bytes` の意味は契約の一部です。ツール説明と検出ヒントは診断用です。 |
| `official_sdks` | `stable` | `client_compatibility` | ファーストパーティ SDK: PHP `durable-workflow/sdk`、Python `durable_workflow`、Rust `durable-workflow`。`dw` CLI は公式コマンドクライアントです。各 SDK の公開インターフェースは、このページに従う個別の安定性ドキュメントが規定します。 |
| `history_event_wire_formats` | `frozen` | 該当なし（固定形式。Workflow の `docs/api-stability.md` 参照） | `workflow_history_events` と `workflow_schedule_history_events` の全行の永続化形式。ワークフローがイベントを書いた後は、それをリプレイする将来の全 SDK が同じフィールド集合をデコードしなければなりません。 |
| `cluster_info_manifests` | `stable` | `surface_stability_contract`、`client_compatibility`、`control_plane`、`worker_protocol`、`auth_composition_contract`、`coordination_health` | `GET /api/cluster/info` 自体が公開するプロトコルマニフェスト。入れ子の各マニフェストは独自の `schema` と `version` を持ち、独自の契約ルールに従って進化します。エンベロープのキーは安定しています。 |

### パッケージごとの安定性ドキュメント {#per-package-stability-documents}

次の資料は、このページのルールの下で個別の詳細を追加します。

- `durable-workflow/workflow`（PHP）: [`docs/api-stability.md`](https://github.com/durable-workflow/workflow/blob/main/docs/api-stability.md)。PHP 記述 API、Server 向け `Support\*` クラス、固定履歴イベントのワイヤ形式表の規範です。
- `durable-workflow/sdk`（PHP）: [`README.md`](https://github.com/durable-workflow/sdk-php/blob/main/README.md)。Packagist から配布する、フレームワーク非依存のリモートクライアント・Worker API の規範です。
- `durable-workflow/server`: [`README.md`](https://github.com/durable-workflow/server/blob/main/README.md) と `docs/contracts/*`。スタンドアロン Server のリクエスト・レスポンス契約の規範です。
- `dw` CLI: [`/docs/polyglot/cli-reference`](/docs/polyglot/cli-reference)。JSON 出力形式と終了コードの規範です。
- Python SDK: `durable-workflow/sdk-python` の `README.md`。`durable_workflow` パッケージ公開 API の規範です。
- Rust SDK: `durable-workflow/sdk-rust` の `README.md` と `[package.metadata.durable-workflow]`。`durable-workflow` crate 公開 API とパッケージ互換性宣言の規範です。

## リリースルール {#release-rules}

以下は上記の全公開分類に適用します。JSON ミラーの `release_rules` にも記載しています。

### パッチリリース {#patch-releases}

許可するもの:

- 文書化された契約を維持するバグ修正
- ドキュメント修正
- 公開インターフェースを変更しない依存更新
- `experimental` のインターフェースへの変更

禁止するもの:

- `stable` または `frozen` のフィールド、ルート、コマンド、クラスの削除・名前変更
- `stable` ルートやコマンドの受付入力の制限
- 既存 `stable` フィールドの意味の変更

### マイナーリリース {#minor-releases}

許可するもの:

- `stable` インターフェースへの新しいフィールド、ルート、コマンド、クラスの追加
- 安全な既定値を持つ任意パラメータの追加
- 検出レスポンスへの新しい機能フラグの追加
- `prerelease`・`experimental` から `stable` への昇格

禁止するもの:

- `stable` または `frozen` のフィールド、ルート、コマンド、クラスの削除・名前変更
- 既存 `stable`・`frozen` フィールドの意味の変更

### メジャーリリース {#major-releases}

許可するもの:

- `stable` インターフェースの削除、名前変更、制限
- 必須の `control_plane.version`・`worker_protocol.version` の引き上げ
- 以前サポートしていた SDK・CLI バージョン範囲の廃止

必須事項:

- メジャー確定の少なくとも一つ前のマイナーリリースで、リリースノートに予告する
- 可能なら前のマイナーリリースで新旧のインターフェースを並行提供し、メジャー前に移行できるようにする
- 公開前に[移行ガイド](/docs/migration)へ移行経路を記載する

## 診断専用フィールドと保証フィールド {#diagnostic-only-versus-guaranteed-fields}

`stable`・`frozen` インターフェースの全フィールドは、**保証**または**診断専用**のどちらかです。変更ルールは異なります。

- **保証フィールド**は文書化された契約の一部です。生成側は文書どおりの形式で出力し続け、利用側は存在と意味に依存できます。`stable` の保証フィールドの削除・名前変更はメジャー変更です。
- **診断専用フィールド**は、人の切り分け、デバッグ、可観測性のために出力します。任意のマイナーリリースで追加・名前変更・削除できます。文書化するすべての場所で `diagnostic_only: true`（またはページ上の同等表現）を付けます。**利用側は本番の判断ロジックで診断フィールドを解析、永続化、分岐条件に使用してはいけません。**

`stable`・`frozen` 形式に追加された未知のフィールドは、古い利用側が無視しなければなりません（前方互換性）。未知の必須フィールドは安全側に拒否しなければなりません。SDK と CLI は、個別の安定性ドキュメントで独自の前方互換動作を公開します。

## 互換性マトリクス {#compatibility-matrix}

これは運用上の互換性マトリクスです。どのクライアントバージョンを、どの Server プロトコルマニフェストに対して検証したかを記録します。各コンポーネントは `GET /api/cluster/info` で実行時に検証し、マニフェストが一致しない場合は安全側に拒否します。

### 最後に適格性を確認した再現可能な組み合わせ {#last-qualified-reproducible-tuple}

表は [`stable-releases.json`](/stable-releases.json) からこのドキュメント用に選んだ、レビュー済みの安定版の組み合わせです。各コンポーネントは独立してバージョン管理されるため、互換な組み合わせに異なるパッケージバージョンが含まれます。リリース・適格性確認レポートは、各完了チェックの正確なバージョンとイメージダイジェストを保持します。

| コンポーネント | サポートするバージョン | インストール識別情報 |
|-----------|-------------------|------------------|
| Server | `%%artifact.serverVersion%%` | `%%artifact.serverDockerHubImage%%` |
| Helm チャート | `%%artifact.helmChartVersion%%` | `%%artifact.helmChartInstallIdentity%%` |
| CLI | `%%artifact.cliVersion%%` | `%%artifact.cliInstallerEnv%%` |
| Workflow エンジン | `%%artifact.workflowVersion%%` | `%%artifact.workflowComposerPackage%%` |
| Waterline 運用ツール | `%%artifact.waterlineVersion%%` | `%%artifact.waterlineComposerPackage%%` |
| PHP SDK | `%%artifact.phpSdkVersion%%` | `%%artifact.phpSdkComposerPackage%%` |
| Python SDK | `%%artifact.pythonSdkVersion%%` | `%%artifact.pythonPackagePin%%` |
| Rust SDK | `%%artifact.rustSdkVersion%%` | `%%artifact.rustCargoRequirement%%` |

Helm チャートに記録された `appVersion` は `%%artifact.helmChartAppVersion%%` で、選択した Server と一致します。[公開済みの組み合わせの検証記録](%%artifact.helmChartQualificationUrl%%)は OCI/パッケージのダイジェストとソース識別子を確認したもので、新たなクラスターインストールの結果ではありません。インストールやイメージの上書き前に、[チャートの選択とアップグレード](./deployment.md#helm-chart-selection)を確認してください。


PyPI は Python 配布版を `%%artifact.pythonRegistryVersion%%` と表示します。文書化した PEP 440 のインストール表記 `%%artifact.pythonSdkVersion%%` は、同じリリースに解決します。この正規化が別のサポート対象バージョンを作ることはありません。

影響する利用側の適格性確認後に、選択した組み合わせを更新します。公開 Server レジストリと生成クイックスタートは、選択した成果物を使います。パッケージは独立してリリースでき、プロトコルマニフェスト、機能、利用側チェックで互換性を検証します。

以前の alpha・beta 成果物は過去のものです。導入時の代替選択肢ではありません。リリース履歴はそのまま残します。

各安定コンポーネントはセマンティックバージョニングに従います。追加機能は互換リリースで提供でき、公開の破壊的変更にはメジャーリリースが必要です。機能を有効にする前に、実行時検出でインストール済み Server と Worker の機能を確認してください。

### ランタイムプロトコルの互換性 {#runtime-protocol-compatibility}

最上位のパッケージバージョンがサポートする系列を選びます。ランタイムプロトコルマニフェストは、安全側に拒否する第二のチェックです。

| クライアント | 製品系列 | コントロールプレーン | Worker 登録時の既定プロトコル |
|--------|---------------|---------------|--------------------------------------|
| CLI | `%%artifact.cliVersion%%` | `2` | 該当なし |
| PHP SDK | `%%artifact.phpSdkVersion%%` | `2` | `1.20` |
| Python SDK | `%%artifact.pythonSdkVersion%%` | `2` | `1.20` |
| Rust SDK | `%%artifact.rustSdkVersion%%` | `2` | `1.20` |

SDK は、互換性のある古い Server 向けに Worker プロトコル `1.19` を明示的に選ぶこともできます。協調的キャンセルには `1.20` が必要で、`1.19` を選ぶとその機能は利用できません。個々の操作は、文書化された最小プロトコルバージョンを使えます。登録時の既定値は、すべての Worker リクエストが `1.20` を送るという意味ではありません。

現在の公開 Server は、上の規範役割表にある Worker プロトコルバージョンを通知します。同じメジャーで、通知したマイナー以下のリクエストヘッダーを受理し、通知バージョンを返します。ヘッダーの欠如・不正形式、異なるメジャー、Server より先の Worker マイナーは安全側に拒否します。CLI は `control_plane.version: "2"` を検証します。

Server 最上位の `version` はビルド識別情報です。クライアントは、プロトコル交渉に `GET /api/cluster/info` の `control_plane`、`worker_protocol`、`client_compatibility`、`surface_stability_contract` マニフェストを使わなければなりません。

Workflow と Waterline は互換性のある 2.x リリースを使用しなければなりません。安定版確定後の互換性境界は、実行時検出とパッケージ制約で定めます。

### 実行時検証の例 {#runtime-validation-examples}

SDK は Worker 登録前に検出結果を検証します。非互換 Server では、レガシーのプレリリース経路を試すのではなく、明示的な互換性エラーを出します。全 Worker リクエストは `X-Durable-Workflow-Protocol-Version` を、コントロールプレーンリクエストは `X-Durable-Workflow-Control-Plane-Version: 2` を送ります。

製品系列を昇格させる前に、クリーンなマシンで開始し、上に記載した公開成果物だけをインストールし、PHP、Python、Rust の適合性経路を完了しなければなりません。ソースチェックアウトや未公開の代替物は、公開成果物の証拠になりません。

現在、安定版パッケージメタデータと実行時検出がサポートする 2.x の互換性境界を定めます。リリース適格性確認では引き続き公開前に公開成果物を一緒にインストールし、パッチ・マイナーは以下のセマンティックバージョニングに従います。

### リリースの進め方 {#release-progression}

パッチは文書化された安定契約を維持します。マイナーはフィールド、ルート、コマンド、クラス、安全な既定値付きの任意パラメータを追加できます。安定契約の破壊にはメジャーと文書化した移行経路が必要です。固定履歴イベント形式は無期限にデコード可能とし、新形式は既存イベントの変更ではなく並行プリミティブを使います。

全リリースで、パッケージメタデータ、リリースノート、インストールコマンド、言語横断の例を同期しなければなりません。

### リリースレビューチェックリスト {#release-review-checklist}

- 機械可読互換性契約が、Workflow のインターフェース安定性マニフェストと一致すること。
- 選択した全 SDK バージョンが、選択した Server に対して成功すること。
- インストール例が安定版リリースチャネルを使うこと。
- パッケージメタデータが正確な SDK リリース・プロトコル版を示すこと。後の Server 適格性確認は互換性の証拠に記録する。
- クリーンなマシンでの PHP、Python、Rust 公開成果物適合性が成功すること。
- リリースノートが基準点以降の追加を説明し、古いプレリリースをサポート対象の選択肢として示さないこと。

## 関連資料 {#see-also}

- [Server の設定](/docs/polyglot/server): スタンドアロン Server のデプロイ
- [Server API リファレンス](/docs/polyglot/server-api-reference): `GET /api/cluster/info` とプロトコルマニフェスト
- [PHP SDK](/docs/polyglot/php): PHP クライアントと Worker
- [Python SDK](/docs/polyglot/python): Python クライアントと Worker
- [Rust SDK](/docs/polyglot/rust): Rust クライアントと Worker
- [CLI](/docs/polyglot/cli): コマンドラインインターフェース
- [移行ガイド](/docs/migration): v1 から v2 への移行
- [PHP Workflow の `docs/api-stability.md`](https://github.com/durable-workflow/workflow/blob/main/docs/api-stability.md): PHP Workflow パッケージごとの安定性
