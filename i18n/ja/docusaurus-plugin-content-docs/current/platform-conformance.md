---
sidebar_position: 19
title: プラットフォーム適合性スイート
description: Durable Workflow v2 の適合性スイートマニフェスト、フィクスチャカタログ、ハーネス規則、リリースゲートの公開規範。
tags:
  - compatibility
  - conformance
  - protocols
  - api-stability
keywords:
  - プラットフォーム適合性スイート
  - 適合性ハーネス
  - 適合性フィクスチャ
  - Durable Workflow の互換性
  - platform-conformance-contract
---

import PublicAuthorityIdentity from '@site/src/components/PublicAuthorityIdentity';
import WorkerProtocolAuthorityRoles from '@site/src/components/WorkerProtocolAuthorityRoles';
import platformConformanceContract from '@site/static/platform-conformance-contract.json';

# プラットフォーム適合性スイート {#platform-conformance-suite}

このページは、Durable Workflow の**プラットフォーム適合性スイート**の公開規範です。v2 互換性を主張する実装について、適合対象マトリクス、再利用可能なフィクスチャカタログ、ハーネス契約、合否ルール、リリースゲートを定義します。

<PublicAuthorityIdentity
  manifest={platformConformanceContract}
  manifestUrl="https://durable-workflow.github.io/platform-conformance-contract.json"
/>

スタンドアロン Server は同じマニフェストを `GET /api/cluster/info` の `platform_conformance_suite` で通知します。[プラットフォームプロトコル仕様](/docs/platform-protocol-specs)カタログは、この入れ子のマニフェストを `cluster_info_envelope` 仕様の `platform_conformance_suite_manifest` オブジェクト分類と名付けます。

スイートは[バージョン互換性](/docs/compatibility)の規範に従います。インターフェース分類・安定性ルールは安定性契約と一致しなければなりません。互換性の規範は契約の内容を、このページはそれに従うことの証明方法を定義します。

<WorkerProtocolAuthorityRoles />

## 公開適合性の規範 {#public-conformance-authorities}

スイートは、安定した機械可読の規範をスキーマ識別情報と公開 URL で登録します。フレームワーク非依存 PHP SDK の規範は [`durable-workflow.v2.php-sdk-conformance-contract`](pathname:///platform-conformance/php-sdk-conformance.json) です。公開済みスタンドアロン Server に対して `durable-workflow/sdk` を評価するための、公開パッケージ構成、シナリオ・証拠要件、公開ランナー・結果スキーマ識別子を宣言します。

## 対象マトリクス {#target-matrix}

適合性の**対象**は、Durable 互換性を主張できる実装の種類です。一つの実装が複数を主張できます。例えばスタンドアロン Server は `standalone_server`、`worker_protocol_implementation`、`repair_actionability_surface` を主張します。

| 対象 | 必須インターフェース分類 | 必須フィクスチャカテゴリ |
| --- | --- | --- |
| `standalone_server` | `server_api`, `worker_protocol`, `cluster_info_manifests` | `control_plane_request_response`, `signal_query_runtime_contract`, `workflow_update_runtime_contract`, `search_attribute_runtime_contract`, `schedules_runtime_contract`, `namespace_runtime_contract`, `child_workflow_runtime_contract`, `saga_runtime_contract`, `worker_versioning_runtime_contract`, `migration_runtime_contract`, `skew_refusal_matrix_contract`, `principal_attribution_contract`, `worker_task_lifecycle`, `failure_repair_actionability` |
| `embedded_engine` | `history_event_wire_formats` | `history_replay_bundles` |
| `official_sdk` | `official_sdks`, `worker_protocol`, `history_event_wire_formats` | `control_plane_request_response`, `signal_query_runtime_contract`, `workflow_update_runtime_contract`, `search_attribute_runtime_contract`, `schedules_runtime_contract`, `namespace_runtime_contract`, `child_workflow_runtime_contract`, `saga_runtime_contract`, `worker_versioning_runtime_contract`, `migration_runtime_contract`, `skew_refusal_matrix_contract`, `principal_attribution_contract`, `worker_task_lifecycle`, `history_replay_bundles` |
| `worker_protocol_implementation` | `worker_protocol`, `history_event_wire_formats` | `worker_task_lifecycle`, `signal_query_runtime_contract`, `workflow_update_runtime_contract`, `search_attribute_runtime_contract`, `schedules_runtime_contract`, `namespace_runtime_contract`, `child_workflow_runtime_contract`, `saga_runtime_contract`, `worker_versioning_runtime_contract`, `migration_runtime_contract`, `skew_refusal_matrix_contract`, `history_replay_bundles` |
| `cli_json_client` | `cli_json` | `control_plane_request_response`, `signal_query_runtime_contract`, `workflow_update_runtime_contract`, `search_attribute_runtime_contract`, `schedules_runtime_contract`, `namespace_runtime_contract`, `child_workflow_runtime_contract`, `saga_runtime_contract`, `worker_versioning_runtime_contract`, `migration_runtime_contract`, `skew_refusal_matrix_contract`, `principal_attribution_contract`, `cli_json_envelopes` |
| `waterline_contract_surface` | `waterline_api` | `signal_query_runtime_contract`, `workflow_update_runtime_contract`, `search_attribute_runtime_contract`, `namespace_runtime_contract`, `saga_runtime_contract`, `worker_versioning_runtime_contract`, `migration_runtime_contract`, `skew_refusal_matrix_contract`, `principal_attribution_contract`, `waterline_observer_envelopes` |
| `repair_actionability_surface` | `worker_protocol`, `server_api` | `failure_repair_actionability` |
| `mcp_discovery_surface` | `mcp_discovery_results` | `mcp_discovery_envelopes` |
| `prerelease_release_candidate` | `server_api`, `official_sdks`, `cli_json`, `waterline_api`, `cluster_info_manifests` | `skew_refusal_matrix_contract`, `workflow_update_runtime_contract`, `principal_attribution_contract`, `prerelease_readiness_contract` |

対象は安定しています。対象追加、既存対象の必須インターフェース追加、必須カテゴリ追加、暫定カテゴリの必須化、安定ランタイムシナリオの `operations`・`pass_criteria` 変更、公開要件（`artifact_policy`、`common_result_evidence`、`required_matrix`、`scenario_requirements`、`host_runner_contract`）変更、合否ルール変更は、スイート契約の変更であり、マニフェスト版を進めなければなりません。

## フィクスチャカタログ {#fixture-catalog}

各安定ソースは、カタログ内の `artifact_id`、`resolver_url`、`sha256` の三つの機械可読な結び付きを持つ公開成果物です。ランタイム ID の末尾はスイート版、プロトコル ID はプロトコルカタログ版です。利用側は `resolver_url` を取得し、SHA-256 がカタログと一致するバイト列だけを受理します。

| カテゴリ | ステータス | 利用側が解決できる規範 |
| --- | --- | --- |
| `control_plane_request_response` | `stable` | [`durable-workflow.v2.control-plane-api@catalog-16`](https://raw.githubusercontent.com/durable-workflow/durable-workflow.github.io/f781ced1ae33c8697835bd527a125bdf3eaf4321/static/platform-protocol-specs/control-plane-api.openapi.yaml) |
| `worker_task_lifecycle` | `stable` | [`durable-workflow.v2.worker-protocol-api@catalog-16`](https://durable-workflow.github.io/platform-protocol-specs/v1.19/worker-protocol-api.openapi.yaml) |
| `worker_task_lifecycle` | `stable` | [`durable-workflow.v2.worker-protocol-stream@catalog-16`](https://durable-workflow.github.io/platform-protocol-specs/v1.19/worker-protocol-stream.asyncapi.yaml) |
| `signal_query_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/signal_query_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/signal-query-runtime-scenarios.json) |
| `workflow_update_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/workflow_update_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/workflow-update-runtime-scenarios.json) |
| `search_attribute_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/search_attribute_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/search-attribute-runtime-scenarios.json) |
| `schedules_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/schedules_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/schedules-runtime-scenarios.json) |
| `history_replay_bundles` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/history_replay_bundles@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/replay-runtime-scenarios.json) |
| `history_replay_bundles` | `stable` | [`durable-workflow.v2.history-event-payloads@catalog-16`](https://raw.githubusercontent.com/durable-workflow/durable-workflow.github.io/f781ced1ae33c8697835bd527a125bdf3eaf4321/static/platform-protocol-specs/history-event-payloads.schema.json) |
| `history_replay_bundles` | `stable` | [`durable-workflow.v2.replay-bundle@catalog-16`](https://raw.githubusercontent.com/durable-workflow/durable-workflow.github.io/f781ced1ae33c8697835bd527a125bdf3eaf4321/static/platform-protocol-specs/replay-bundle.schema.json) |
| `namespace_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/namespace_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/namespace-runtime-scenarios.json) |
| `child_workflow_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/child_workflow_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/child-workflow-runtime-scenarios.json) |
| `worker_versioning_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/worker_versioning_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/worker-versioning-runtime-scenarios.json) |
| `saga_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/saga_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/saga-runtime-scenarios.json) |
| `migration_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/migration_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/migration-runtime-scenarios.json) |
| `skew_refusal_matrix_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/skew_refusal_matrix_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/skew-refusal-matrix-scenarios.json) |
| `prerelease_readiness_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/prerelease_readiness_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/prerelease-readiness-scenarios.json) |
| `failure_repair_actionability` | `stable` | [`durable-workflow.v2.repair-actionability-objects@catalog-16`](https://raw.githubusercontent.com/durable-workflow/durable-workflow.github.io/f781ced1ae33c8697835bd527a125bdf3eaf4321/static/platform-protocol-specs/repair-actionability-objects.schema.json) |
| `cli_json_envelopes` | `stable` | [`durable-workflow.cli.output-schema-manifest@3`](https://durable-workflow.github.io/cli-json-envelopes/v3/manifest.json) |
| `principal_attribution_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/principal_attribution_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/principal-attribution-scenarios.json) |

スイート行は CLI スキーマ v3 を不変の過去証拠として保持します。現在の CLI 契約は [`durable-workflow.cli.output-schema-manifest@4`](https://durable-workflow.github.io/cli-json-envelopes/v4/manifest.json) の閉包であり、v2・v3 バイト列を書き換えずに Avro 専用ペイロードフィールドを公開します。

現在の Worker プロトコル対象は、`durable-workflow.v2.worker-protocol-api@catalog-16` と `durable-workflow.v2.worker-protocol-stream@catalog-16` に記録した、ライフサイクル中立のプロトコル 1.19 バイト列を使います。1.15～1.18 は履歴に残る版付き resolver URL から利用できます。これらはバージョンなしの現在の公開 Server プロトコル規範を置き換えません。旧 beta 表現のバイト列は、マニフェスト内で明示的に過去扱いした [`durable-workflow.v2.worker-protocol-api@catalog-16-beta-history`](https://raw.githubusercontent.com/durable-workflow/durable-workflow.github.io/e990bc36731463cc5b2cb2a9175dbccfdea61704/static/platform-protocol-specs/worker-protocol-api.openapi.yaml) としてだけ残ります。

計画中の `waterline_observer_envelopes` と `mcp_discovery_envelopes` は `provisional` です。予定ソースツリー位置は規範でない仮置きであり、ハーネスはフィクスチャとして解決したり、安定適合性の主張に使ったりしてはいけません。

## ワークフローライフサイクルのリリース規範 {#workflow-lifecycle-release-authority}

正確な公開済みライフサイクルシナリオの規範は [JSON として公開](https://durable-workflow.github.io/platform-conformance/workflow-lifecycle-scenarios.json)しています。現在の Server、PHP SDK、Rust SDK の公開境界で検証する要件を記録します。

PHP シャードは、現在の組み合わせが指定する正確な `durable-workflow/sdk` を Packagist から使い捨て Composer プロジェクトへインストールします。対応する公開 Server イメージに対し、別々の PHP クライアント・Worker を動かし、配布物と公式 `apache/avro` の由来を記録し、`local_product_source_checkouts_used=false` を報告しなければなりません。

Rust シャードは正確な crate を crates.io から入れ、SDK と公式 `apache-avro` のレジストリソース・チェックサムを記録します。ペイロード証拠は `apache-avro` を使う SDK 公開 Avro エンベロープです。独自コーデック・ローカル製品ソースは認めません。

Rust は次の全セルを実行・報告します。

- 公開 SDK コマンドによる `instance_cancel`、`instance_terminate`。
- 選択実行と現在実行を混同しない `selected_run_guard`、`stale_run_rejection`。
- ワークフロー・実行の識別情報を持つ型付き終端結果 `typed_failed`、`typed_cancelled`、`typed_terminated`、`typed_timed_out`。
- アクティビティがキャンセルを観測し、遅延完了が終端結果を上書きしない `cancellation_heartbeat`、`late_activity_completion_refused`。
- キャンセル確定待ち中の `worker_restart_during_cancellation`。代替 Worker が閉じたアクティビティを再取得しないことを証明。

マニフェストは正確な成果物・Server 版、クラスター識別情報、インストール由来、ワークフロー ID、各セル結果、安定理由、ペイロード契約、実行構成、Rust シャード契約版、ランナー識別情報、終了ステータスも要求します。Rust 証拠の欠落、未対応、runner-blocked、不成功では満たせません。

カテゴリが対象に必須となるのは、対象が列挙し、カテゴリが `provisional` でない場合だけです。暫定カテゴリは助言警告を出し、後のスイート版で `stable` に昇格して初めて必須になります。

`signal_query_runtime_contract` は安定カテゴリです。具体的に固定した公開成果物版を記録し、全必須シナリオを `pass`、`fail`、`unsupported`、`not_covered`、`runner_blocked` のいずれかで、知見へのリンク付きで示します。`latest`、`current`、`head`、`<latest>`、`${VERSION}`、`{{ version }}` などの仮置き・未解決版は結果ゲートで失敗します。合格に数えるのは `pass` だけです。

`published_artifact_install_only`、`python_worker_cli_and_sdk_baseline`、`php_worker_cli_and_sdk_baseline`、`python_worker_php_facing_and_cli_clients`、`php_worker_python_and_cli_clients`、`rust_worker_rust_php_python_clients`、`python_worker_rust_client`、`php_worker_rust_client`、`rust_query_error_and_immutability`、`ordered_signal_delivery`、`dedup_contract_observation`、`signal_during_replay`、`query_during_replay`、`rust_replayed_instance_state_query_after_cold_restart`、`completed_run_signal_and_query`、`unknown_signal_and_query_errors`、`malformed_signal_and_query_payloads`、`waterline_operator_visibility`。

ID と合格基準は、機械可読の [`static/platform-conformance/signal-query-runtime-scenarios.json`](pathname:///platform-conformance/signal-query-runtime-scenarios.json) にあります。実装テストで検証しても構いませんが、外部ハーネスの安定フィクスチャ情報源ではありません。

Rust セルは、シナリオ定義が宣言する正確な `durable-workflow` を crates.io から入れ、SDK と解決済み `apache-avro` の Cargo ソース・チェックサムを記録します。スナップショット由来のクエリ転送は `rust_worker_rust_php_python_clients` と `rust_query_error_and_immutability` で評価し、リプレイしたインスタンス状態ではありません。別セルの `rust_replayed_instance_state_query_after_cold_restart` は `register_replayed_workflow` と `register_replayed_query` を使い、完全停止後に新 Rust プロセスを開始し、履歴を復元し、Rust・PHP・Python から実行中・復元済み・完了状態を比較します。成功・失敗両クエリ列は、最初の成功した測定クエリ前に履歴・コマンド件数を記録し、件数を変えてはいけません。

`completed_run_signal_and_query` では、正常完了しリプレイ可能な宣言済みハンドラーがある実行は、主張する全公開クエリから最終状態を返さなければなりません。安定した終端エラーが有効なのは、明示的未対応の終端状態または利用不可のハンドラーだけです。一般的な完了済みエラーでは合格になりません。

`workflow_update_runtime_contract` は安定ランタイムカテゴリです。公開成果物を使い、Server、CLI、Python SDK、PHP SDK、Waterline を固定し、ローカル製品ソース使用の有無を明記し、全シナリオを `pass`、`fail`、`unsupported`、`not_covered`、`runner_blocked` とリンク付きで示します。公開コントロールプレーン、履歴、CLI・SDK、運用者可読面を検証する必要があり、ローカルソース実行は数えません。

必須更新シナリオは、公開成果物導入、宣言更新契約の可視性、受理の制御・履歴証拠、実行中・待機中の運用可視性、完了結果の往復、失敗・拒否、重複要求・冪等性、不明更新・不正入力の拒否、ペイロード往復、終端動作、認証主体の帰属、PHP・Python の各クライアント・Worker 同等性、運用診断です。SDK に正式な更新対応がなければ、言語を省略せず、型付き未対応セルと具体的な SDK 知見を報告します。

ID・基準は [`static/platform-conformance/workflow-update-runtime-scenarios.json`](pathname:///platform-conformance/workflow-update-runtime-scenarios.json) にあります。登録済みホストランナーが固定成果物を導入し全マトリクスを実行できるまで、現在の引き継ぎは意図的に `runner_blocked` です。

`search_attribute_runtime_contract` は安定ランタイムカテゴリです。公開成果物で、PHP・Python の開始・upsert、CLI クエリ・エラー、Waterline、言語間コーデック往復、等値・範囲・真偽値、OR/NOT 文法、キーワードリスト所属、型安全性、索引遅延分布、負荷時遅延、名前空間分離、予約名拒否、クエリ注入対策を検証します。全必須セルを `pass`、`fail`、`unsupported`、`not_covered`、`runner_blocked` と知見リンク付きで記録するまで、Python・Server の smoke だけでは不適合です。合格に数えるのは `pass` だけです。

ID・基準は [`static/platform-conformance/search-attribute-runtime-scenarios.json`](pathname:///platform-conformance/search-attribute-runtime-scenarios.json) にあります。

`schedules_runtime_contract` は安定ランタイムカテゴリです。公開成果物で、cron・固定周期、一覧・詳細、一時停止中無発火と再開、削除後無発火、未発火ポリシー、再起動耐性、CLI・Python SDK・PHP 向け操作、Python 作成の PHP 発火・PHP 作成の Python 発火、不正 cron 拒否、存在しない型の結果を検証します。全必須セルを `pass`、`fail`、`unsupported`、`not_covered`、`runner_blocked` とリンク付きで記録するまで、ライフサイクル smoke 部分集合は不適合です。`pass` だけを合格に数えます。

ID・基準は [`static/platform-conformance/schedules-runtime-scenarios.json`](pathname:///platform-conformance/schedules-runtime-scenarios.json) にあります。

`history_replay_bundles` も安定ランタイムカテゴリです。公開成果物で PHP・Python の、完了履歴、Worker 再起動、アクティビティ、シグナル・更新、待機条件、版マーカー、Saga 補償のリプレイ、コード乖離・Server 履歴変更・不正履歴の明示的拒否、処理中シグナルの再起動タイミングを検証します。全必須セルを `pass`、`fail`、`unsupported`、`not_covered`、`runner_blocked` とリンク付きで記録するまで、正解履歴 smoke 部分集合は不適合です。`pass` だけを合格に数えます。

ID・基準は [`static/platform-conformance/replay-runtime-scenarios.json`](pathname:///platform-conformance/replay-runtime-scenarios.json) にあります。

`namespace_runtime_contract` は安定ランタイムカテゴリです。公開成果物で作成・更新・詳細・一覧、終了時除去と再作成、可視性・変更分離、PHP Worker キュー分離、CLI の名前空間文脈と既定範囲、SDK 選択同等性、検索属性スキーマ・値クエリ分離、スケジュール分離、Waterline・運用範囲、明示 Nexus 名前空間横断呼出、予約名拒否、製品知見の結果記録先を検証します。全必須セルを `pass`、`fail`、`unsupported`、`not_covered`、`runner_blocked` とリンク付きで記録するまで、名前空間 smoke は不適合です。`pass` だけを合格に数えます。

Waterline・運用範囲の非規範実装補足は、公開 Waterline または専用シャードから得られます。有用な記録は、範囲付き一覧・詳細、提供する場合のスケジュール、検索属性値、ダッシュボード範囲、運用 API stats、製品が通知する既定・範囲なしビューの文書化した判定です。規範基準は `waterline_operator_namespace_visibility` シナリオのままです。

ID・基準は [`static/platform-conformance/namespace-runtime-scenarios.json`](pathname:///platform-conformance/namespace-runtime-scenarios.json) にあります。

`child_workflow_runtime_contract` は安定ランタイムカテゴリです。公開成果物で PHP・Python の同言語親子、両方向の言語横断親子、子失敗の型往復、親キャンセル伝播、親が観測する子直接キャンセル、子待機中の親 Worker 再起動リプレイ、五つの子への並列 fan-out、名前空間動作を検証します。全必須セルを `pass`、`fail`、`unsupported`、`not_covered`、`runner_blocked` とリンク付きで記録するまで、一つの親子 smoke は不適合です。`pass` だけを合格に数えます。

ID・基準は [`static/platform-conformance/child-workflow-runtime-scenarios.json`](pathname:///platform-conformance/child-workflow-runtime-scenarios.json) にあります。

`saga_runtime_contract` は安定ランタイムカテゴリです。公開成果物で、前進成功、後段失敗と逆順補償、余分な補償のない初期失敗、補償リトライの冪等性、補償失敗の終端可視性、補償途中の再起動、PHP ワークフローから Python 補償と逆方向、型付き補償エラー往復、運用者に見える補償中状態を検証します。一つの正常系・SDK だけの smoke は、全必須セルを `pass`、`fail`、`unsupported`、`not_covered`、`runner_blocked` とリンク付きで記録するまで不適合です。`pass` だけを数えます。PHP パッケージは実行マトリクスで `workflow-php`、プラットフォーム成果物との比較で `workflow` とも記録できます。

ID・基準は [`static/platform-conformance/saga-runtime-scenarios.json`](pathname:///platform-conformance/saga-runtime-scenarios.json) にあります。

`worker_versioning_runtime_contract` は安定ランタイムカテゴリです。公開成果物でビルド ID 登録、運用ロールアウト可視性、ドレイン・再開、実行別互換性固定、互換 Worker のみのリプレイ、新規開始の昇格版ルーティング、キャッシュ追放後リプレイ、互換 Worker 不在診断、CLI・Waterline、PHP/Python 横断固定、版を上げない敵対的動作、履歴 API 版固定を検証します。全必須セルを `pass`、`fail`、`unsupported`、`not_covered`、`runner_blocked` とリンク付きで記録するまで、部分 smoke は不適合です。`pass` だけを数えます。

PHP/Python 固定証拠は、Worker ランタイム、ワークフロー・実行 ID、キューのロールアウト状態、固定を検証する公開 poll・更新結果、公開 Worker 成果物の導入元・版、ローカル製品ソースを使っていない確認を記録します。

ID・基準は [`static/platform-conformance/worker-versioning-runtime-scenarios.json`](pathname:///platform-conformance/worker-versioning-runtime-scenarios.json) にあります。

`migration_runtime_contract` は安定ランタイムカテゴリです。公開成果物で最新対応 v1 状態、文書の移行手順、完了履歴保持・リプレイ、処理中進行、アクティビティ途中のリトライ、シグナル・タイマー待機、スケジュール周期、Worker 登録投影、Waterline、更新前状態への CLI アクセス、新規 v2、キューを考慮した復帰、未対応版差の明確な拒否を検証します。復帰証拠は準備済み・遅延・予約済み v1 キューを列挙し、ドレイン、整合的 SQL・キュー同時点捕捉、復旧不能受容のいずれかを記録し、全復元非終端行の起動経路を実証します。古い適格 `pending` は、既定有効 Watchdog の投入、五分経過後の再配送、記録キューでの進行を観測した場合だけ v1.0.77 Watchdog を使えます。この例外はリトライ、タイマー、`waiting`・`running` の保持キューの代替ではありません。SQL だけの復帰が合格するのは、他のキュー依存非終端が復旧時点にない場合だけです。マニフェストには `APP_KEY` の秘密管理参照・版だけを記録し、キーと復旧認証情報は SQL・キューから別にアクセス制御します。現実的 v1 状態から始めない移行・新規インストール smoke は、全必須セルを `pass`、`fail`、`unsupported`、`not_covered`、`runner_blocked` とリンク付きで記録するまで不適合です。`pass` だけを数えます。

文書手順セルは、現行ガイドのコマンド一覧、実際に順番どおり実行したコマンド、終了コード、各所要時間を記録します。前後スナップショットは、観測した完了履歴、処理中実行、リトライ中、シグナル・タイマー待機、スケジュール、Worker 登録を含めます。

ID・基準は [`static/platform-conformance/migration-runtime-scenarios.json`](pathname:///platform-conformance/migration-runtime-scenarios.json) にあります。

`skew_refusal_matrix_contract` は安定ランタイムカテゴリです。公開成果物で CLI、Python SDK、スタンドアロン PHP SDK Worker、Waterline の互換、後方差、前方差、範囲外を検証します。Workflow は組み込み Laravel・Waterline エンジンとしてのみ存在します。将来版境界も試し、各差分操作の要求・応答を捕捉し、Worker を `register_refused`・`register_and_serve`・`register_and_drop`、Waterline を `banner`・`render_refused`・`stale_render` に分類します。全必須セルを `pass`、`fail`、`unsupported`、`not_covered`、`runner_blocked` とリンク付きで記録するまで部分 smoke は不適合です。`pass` だけを数えます。明確な警告のない `register_and_drop`・`stale_render` はブロックする製品知見です。

ID・基準は [`static/platform-conformance/skew-refusal-matrix-scenarios.json`](pathname:///platform-conformance/skew-refusal-matrix-scenarios.json) にあります。

`principal_attribution_contract` は安定ランタイムカテゴリです。公開成果物で、開始、シグナル、クエリ、キャンセル、完了、失敗、匿名、Server 起点イベントの履歴が Server 導出主体を記録することを証明します。ペイロード・ヘッダー偽装、alice/bob の名前付き主体、認証情報更新、CLI・Waterline、Python SDK と PHP `DurableWorkflow\Client` 両方の認証付き開始・シグナルを検証します。SDK セルは版、操作出力、履歴・API 主体サンプル、生 HTTP の参照主体を記録し、形と期待 ID を比較可能にします。PHP は正確な Packagist 配布物として `durable-workflow/sdk` を解決し、dist 種別・URL・参照を記録します。`durable-workflow/workflow` は組み込み・Waterline エンジン用に別解決します。全シナリオを `pass`、`fail`、`unsupported`、`not_covered`、`runner_blocked` とリンク付きで記録するまで、ロールトークン smoke 部分集合は不適合です。

ID・基準は [`static/platform-conformance/principal-attribution-scenarios.json`](pathname:///platform-conformance/principal-attribution-scenarios.json) にあります。

`prerelease_readiness_contract` は協調 2.0 リリース候補向けの安定ランタイムカテゴリです。公開成果物と公開ユーザードキュメントだけを使い、Workflow・Waterline 個別の GO / NO-GO を記録します。中核機能、移行、公開 API 安定性、文書正確性、設定の理解しやすさ、相互互換性を検証し、Server、CLI、PHP・Python・Rust SDK、Workflow、Waterline、サンプル、文書を一つの組み合わせとして評価します。現行公開文書から、各版付き 2.0 スタンドアロン経路と別の組み込み Laravel 経路を実行し、10 分以内の観測可能な完了まで、正確なコマンド、出力、版、由来、実時間を記録します。検出だけでは、PHP、Python、Rust、Laravel 各シナリオを `pass`、`fail`、`unsupported`、`not_covered`、`runner_blocked` とするまで不適合です。成果物不足、古い文書、未記載移行手順、導入不能、API 不安定、破壊リスク、チャネル不一致は非合格セルと知見リンクを記録します。ランナーだけの証拠は不適合で、準備完了にできません。

ID・基準は [`static/platform-conformance/prerelease-readiness-scenarios.json`](pathname:///platform-conformance/prerelease-readiness-scenarios.json) にあります。簡潔な [2.0 クイックスタート](/docs/quickstart/)が公開導入経路です。

## 合否ルール {#pass--fail-rules}

1. **`guaranteed_field_equality`。** 保証フィールドは全て存在し、型が正しく、実装応答で値が一致しなければなりません。診断専用は無視します。
2. **`unknown_additive_fields_tolerated`。** 余分なフィールドは、文書化した診断専用か、安定性レベルが追加進化を認める場合だけ合格。
3. **`frozen_shape_exact_match`。** `frozen` 分類に基づくフィクスチャは完全一致が必要。不一致は必ず失敗。
4. **`required_fixtures_must_pass`。** 対象を主張するリリースは全必須カテゴリに合格する必要があり、一つでも失敗するとその対象に不適合。
5. **`stable_runtime_scenario_coverage`。** 安定カテゴリは、定義した全必須シナリオをマニフェストの `pass`、`fail`、`unsupported`、`not_covered`、`runner_blocked` で報告します。完全適合には全て合格が必要。smoke のみ、省略、公開機能未対応、未網羅、ランナーブロックは不適合で、担当知見にリンクします。この状態集合と pass のみのルールはスイート版 5 以降の意味です。
6. **`provisional_categories_warn_only`。** 暫定カテゴリの失敗は警告のみでリリースをブロックしません。
7. **`diagnostic_only_mismatches_pass`。** 診断専用だけの差は `diagnostic_diff` に記録し、合格とします。

ハーネス結果は四つの適合性レベルの一つを宣言します。

| レベル | 意味 |
| --- | --- |
| `full` | 主張する全対象の全必須フィクスチャに合格。 |
| `partial` | 少なくとも一対象は全必須合格だが、別の主張対象が失敗。 |
| `provisional` | 暫定カテゴリのみ失敗し、必須は全合格。 |
| `nonconforming` | 全主張対象で少なくとも一つの必須が失敗。 |

## ハーネス契約 {#harness-contract}

適合するハーネスは次を行います。

- `GET /api/cluster/info` の `platform_conformance_suite`、オフライン時は静的ミラーからマニフェストを読む
- 各宣言フィクスチャを正しい情報源パスから読む
- 文書化された操作で実装を動かす
- 上記合否ルールで比較
- 実行ごとに、スキーマ `durable-workflow.v2.platform-conformance.result`、スイート版、実装識別情報、各結果、診断差分、全体レベルを持つ結果文書を出す
- レベルが `nonconforming` の場合に限り非ゼロ終了

結果文書は成果物です。互換性の主張は、実装ビルドとそのビルドが示すスイート版に対して生成した場合だけ有効です。

## リリースゲート {#release-gates}

| リリース | 必須の主張対象 | 必須成果物 |
| --- | --- | --- |
| `durable-workflow/server` | `standalone_server`, `worker_protocol_implementation`, `repair_actionability_surface` | リリースに添付したハーネス結果文書。 |
| `durable-workflow/workflow` | `embedded_engine` | リリースに添付したハーネス結果文書。 |
| `durable-workflow/sdk` | `official_sdk`, `worker_protocol_implementation` | リリースに添付したハーネス結果文書。 |
| `durable_workflow` | `official_sdk`, `worker_protocol_implementation` | リリースに添付したハーネス結果文書。 |
| `dw` | `cli_json_client` | リリースに添付したハーネス結果文書。 |
| `waterline` | `waterline_contract_surface` | リリースに添付したハーネス結果文書。 |
| `durable-workflow/2.0-release-candidate` | `prerelease_release_candidate` | 公開成果物によるプレリリース準備結果を保持した適合性記録。 |

レビュアーは添付、`full` または `provisional`、結果版と試験ビルド公開版の一致を確認します。`nonconforming` はリリースをブロックします。

## リリースチェック {#release-check}

`scripts/check-platform-conformance-authority.js` は、静的マニフェストが欠落、リポジトリ内、版の別名のみ、サイト外の規範を指す場合にビルドを失敗させます。安定フィクスチャの各 `authority_doc` を正規の現行版サイト URL として検証し、リポジトリ相対ソース、テスト、文書、schema ディレクトリ、未版付け ID、非公開 resolver、誤ダイジェストを全安定カテゴリで拒否します。ランタイムカテゴリはスイートに結び付いた公開シナリオも必要です。同じチェックは、このページに機械ミラー由来のマニフェストスキーマ、対象、カテゴリ、合否ルール、リリースゲートの記載も要求します。

スイート変更時は、このページと `static/platform-conformance-contract.json` を同時更新します。対象追加、必須カテゴリ追加、暫定の安定化、安定シナリオ `operations`・`pass_criteria`、公開要件（`artifact_policy`、`common_result_evidence`、`required_matrix`、`scenario_requirements`、`host_runner_contract`）、合否ルール変更では、同じリリースでスイート版を進めます。チェックは基準と公開要件スナップショットを版付きダイジェストに固定し、古い版で新しい基準・証拠要件が観測されないようにします。

公開ランタイム基準・公開要件のダイジェストエントリは追加専用です。安定 `operations`・`pass_criteria` を進めるには、全既存 `VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS` を維持し、版を上げ、シナリオマニフェストを合わせ、新しい現行版の基準ダイジェストを追加します。証拠要件、成果物方針、必須マトリクス、シナリオ要件、ホストランナー契約を変えるには、全既存 `VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS` を維持し、版とマニフェストを進め、新版の公開要件ダイジェストを追加します。チェックは対象ブランチの公開済みエントリと比較するため、新版のダイジェストを足しても旧エントリの編集・削除は失敗します。
