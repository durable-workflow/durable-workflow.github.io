---
sidebar_position: 19
title: SDK の中立性
description: 将来の TypeScript、Go、Java、.NET SDK が、プロトコルを再設計せずに Durable Workflow の公開インターフェースを実装できる状態を保つ、継続的な言語非依存の契約。
tags:
  - compatibility
  - protocols
  - api-stability
  - sdk
  - language-agnosticism
keywords:
  - SDK の中立性
  - 言語非依存
  - プロトコルの中立性
  - コーデックの中立性
  - TypeScript SDK
  - Go SDK
  - Java SDK
  - .NET SDK
  - Python SDK
  - PHP ワークフローパッケージ
---

import PythonPackageReleaseLink from '@site/src/components/PythonPackageReleaseLink';

# SDK の中立性 {#sdk-neutrality}

このページは、プラットフォーム全体の SDK 中立性契約を人向けに説明するガイドです。Durable Workflow の全公開インターフェースが満たすべき最低限の中立性ルールと、新しい Server、Workflow、CLI、Waterline、MCP インターフェースにリリースレビュアーが適用する、継続的な言語非依存監査を列挙します。

上流のアーキテクチャガイドは [`sdk-neutrality.md`](https://github.com/durable-workflow/workflow/blob/main/docs/architecture/sdk-neutrality.md) です。利用可能な機械可読の規範は、このサイトの [`/sdk-neutrality-contract.json`](/sdk-neutrality-contract.json) に、スキーマ ID `durable-workflow.v2.sdk-neutrality.contract` として公開されています。プロトコルと SDK の対応範囲の規範は、Workflow Composer パッケージの `resources/sdk-neutrality-contract.json` にある JSON です。公開ミラーは、ドキュメントで集中管理する成果物の組み合わせから、現在のパッケージ配布メタデータを加えます。スタンドアロン Durable Workflow Server は、パッケージの基本マニフェストを `GET /api/cluster/info` の `sdk_neutrality_contract` に再公開します。このページと公開 JSON 契約が食い違う場合は JSON 契約が優先し、食い違いはドキュメントのバグです。

この契約は、*どの*インターフェースが公開で*どのように*変更できるかを定める[バージョン互換性](/docs/compatibility)の規範と、各インターフェースの規範仕様が*どこに*あるかを示す[プラットフォームプロトコル仕様](/docs/platform-protocol-specs)カタログに従います。現在の PHP、Python、Rust 以外の将来の SDK が、プロトコル再設計なしで対象にできるよう、仕様が*どのような形*を取れるかを定めます。

## この契約が必要な理由 {#why-this-exists}

Durable は、PHP の `durable-workflow/sdk` パッケージ、Python の `durable_workflow` パッケージ、Rust の `durable-workflow` crate という三つのファーストパーティのスタンドアロン SDK を提供します。別の PHP `durable-workflow/workflow` パッケージは、引き続き組み込み Laravel エンジンとリプレイの所有者であり、フレームワークに依存しない PHP SDK ではありません。幅広いファーストパーティ SDK 群の構築・保守は、リリースの目標では**ありません**。TypeScript、Go、Java、.NET エコシステムでの SDK 需要はまだ実証されておらず、広い公式ラインアップの維持費は高いものです。

この契約が防ぐのは別の失敗です。SDK の下にある公開契約が、言語固有の前提を知らぬ間に固定してしまうことです。将来 TypeScript や Go SDK を作る価値が生じたとき、作業は「公開ワイヤプロトコルに対して新しいクライアントを書く」であるべきで、「他の言語が話せるようプロトコルを再設計する」であってはいけません。

## 範囲 {#scope}

| 範囲キー | 意味 |
| --- | --- |
| `goal` | 将来の TypeScript、Go、Java、.NET SDK が存在するためにプロトコル再設計を必要としないよう、プロトコルと契約の中立性を保つ。 |
| `non_goal` | 幅広い公式 SDK 群の提供。ファーストパーティ SDK の範囲は意図的に狭くし、採用需要が正当化するときだけ広げる。 |
| `present_priority` | Python は、既存ユーザーにとって現在最も価値の高い非 PHP 経路であり、同等性の網羅で優先する。 |
| `future_posture` | TypeScript、Go、Java、.NET などは需要に基づく。予約済みリリース枠はないが、全公開契約は、将来これらの言語の SDK をワイヤプロトコルを壊さずに記述できる形式でなければならない。 |

## 公式 SDK の対応範囲ポリシー {#official-sdk-breadth-policy}

公式 SDK の一覧は意図的に狭くしています。

| 言語 | 方針 | 公開パッケージ | 適合性の規範 |
| --- | --- | --- | --- |
| PHP | `priority` | [`durable-workflow/sdk`](https://packagist.org/packages/durable-workflow/sdk) | [`signal_query_runtime_contract`](https://durable-workflow.github.io/platform-conformance/signal-query-runtime-scenarios.json)、アクター `sdk_php`、`php_sdk_client`、`php_worker` |
| Python | `priority` | <PythonPackageReleaseLink>`durable_workflow` %%artifact.pythonPublishedSdkVersion%%</PythonPackageReleaseLink> | [`history_replay_bundles`](https://durable-workflow.github.io/platform-conformance/replay-runtime-scenarios.json)、アクター `python_sdk_runtime` |
| Rust | `priority` | [`durable-workflow`](https://crates.io/crates/durable-workflow) | [`signal_query_runtime_contract`](https://durable-workflow.github.io/platform-conformance/signal-query-runtime-scenarios.json)、アクター `rust_sdk`、`rust_worker`、`rust_sdk_client` |
| TypeScript | `demand_driven` | なし | 公開契約は、プロトコル再設計なしで TypeScript に実装可能でなければならない。 |
| Go | `demand_driven` | なし | 公開契約は、プロトコル再設計なしで Go に実装可能でなければならない。 |
| Java | `demand_driven` | なし | 公開契約は、プロトコル再設計なしで Java に実装可能でなければならない。 |
| .NET | `demand_driven` | なし | 公開契約は、プロトコル再設計なしで .NET に実装可能でなければならない。 |

JSON 契約は、`first_party.php_sdk`、`first_party.python_sdk`、`first_party.rust_sdk` の網羅を構成する正確な `scenario_ids` を列挙します。Laravel パッケージは `embedded_engines.php_workflow_engine` として別途追跡し、リプレイの網羅はアクター `workflow_php_runtime` に置きます。利用者は SDK リポジトリを clone したりテスト群を読んだりせず、リンクされたカタログでこれらの識別子を直接解決できます。

新しいファーストパーティ SDK を追加するのは、次の場合だけです。

1. 既存 SDK では対応できない、文書化されたユーザー需要がある。
2. 候補の保守チームが、適合性ハーネス、プロトコル仕様カタログ、リリースの規範マニフェスト上で SDK を維持すると約束する。
3. SDK の追加に、Worker プロトコル、コントロールプレーン、履歴イベントのワイヤ形式、リプレイフィクスチャの破壊的変更が必要ない。必要なら、バグは SDK ではなくプロトコルにある。

## 中立性ルール {#neutrality-rules}

Durable の全公開契約は、次の七つの中立性ルールすべてを満たさなければなりません。正確なフィールド形式の規範は JSON マニフェストで、概要はレビュアー向けです。JSON の各ルールは `requirement`、`rationale`、`how_to_apply` 行、`authority` 配列を持ちます。各規範エントリには、安定したカタログまたはスキーマ ID と、公開成果物への絶対 URL があります。

| ルール | 要件 |
| --- | --- |
| `protocol_neutrality` | 公開 RPC・イベントインターフェースは、HTTP 対応ランタイムなら生成・利用できる HTTP+JSON または AsyncAPI 形式を使う。 |
| `codec_neutrality` | 公開境界を越える全永続ペイロードは `avro` を通知する。他の公開またはエンジン固有 v2 コーデックは提供しない。 |
| `error_shape_neutrality` | 公開失敗オブジェクトは（`code`、`message`、任意の `details`）の構造化エンベロープを使う。PHP・Python の例外クラス名は診断専用とする。 |
| `type_identity_neutrality` | ワークフロー、アクティビティ、子ワークフロー、例外の型は、安定した文字列名で識別する。クラス FQCN とモジュールパスは SDK 入力の便宜であり、契約ではない。 |
| `replay_fixture_neutrality` | リプレイフィクスチャと正解となる履歴バンドルは、公開 `history_event_payloads`・`replay_bundle` スキーマに適合する JSON とする。 |
| `discovery_neutrality` | 全公開インターフェースへ、`GET /api/cluster/info` と `platform_protocol_specs` カタログから到達できる。 |
| `documentation_neutrality` | 公開契約のドキュメントは、スキーマ、ルート、フィールドの意味で形式を説明する。PHP・Python クラスの動作は SDK 例であり、規範契約ではない。 |

## 継続的な言語非依存監査 {#standing-language-agnosticism-audit}

新しい Server、Workflow、CLI、Waterline、MCP インターフェースは、`stable` への昇格前に中立性監査を通過しなければなりません。監査範囲のインターフェース分類に触れる全変更について、リリース PR の継続的レビュー項目とします。対象分類は次のとおりです。

- `server_api`
- `worker_protocol`
- `cli_json`
- `waterline_api`
- `mcp_discovery_results`
- `cluster_info_manifests`

チェックリストは八段階です。七つは上記のルールに対応します。八つ目の**将来 SDK の思考実験**では、公開仕様カタログと標準の HTTP+JSON ツール群だけを使い、TypeScript または Go SDK が新しいインターフェースをどう利用するかを二文で説明します。ファーストパーティ SDK が必要な回答になるなら、中立ではありません。昇格前に形式を変更するか、中立性の不足を既知の制限として記録します。

## 将来の SDK が依存するもの {#what-a-future-sdk-relies-on}

この契約は、将来の SDK がファーストパーティ SDK ソースを調べずに読めなければならないインターフェースを示します。

- **プロトコル:** 公開[プロトコルカタログ](https://durable-workflow.github.io/platform-protocol-specs.json)の `durable-workflow.v2.control-plane-api`、`durable-workflow.v2.worker-protocol-api`、`durable-workflow.v2.worker-protocol-stream`。
- **コーデック:** `durable-workflow.v2.worker-protocol-api` が文書化し、`durable-workflow.v2.cluster-info-envelope` 検出スキーマで通知する共通コーデック集合。
- **エラー形式:** Worker プロトコルの失敗エンベロープと `durable-workflow.v2.repair-actionability-objects` スキーマ。
- **リプレイ入力:** `durable-workflow.v2.history-event-payloads` と `durable-workflow.v2.replay-bundle` の JSON Schema、および公開 [`history_replay_bundles`](https://durable-workflow.github.io/platform-conformance/replay-runtime-scenarios.json) カタログのシナリオ ID。
- **検出:** `durable-workflow.v2.cluster-info-envelope` と `durable-workflow.v2.platform-protocol-specs.catalog` 自体。

ある言語の SDK 候補からこれらのいずれかに到達できなければ、SDK の構築にはプロトコル変更が必要になり、言語非依存の保証は守られていません。

## リリースゲート {#release-gates}

新しい公開インターフェース分類を導入する、または既存インターフェースを `prerelease`・`experimental` から `stable` に昇格させるリリースは、監査結果をリリース PR に記録しなければなりません。マニフェストのリリースゲート節は具体的な確認を列挙します。

- `audit_recorded`: リリース PR の説明に適用した監査手順を記し、新しいインターフェースのプロトコル仕様カタログエントリ、適合性フィクスチャ、検出エントリへリンクする。
- `no_php_or_python_only_required_fields`: `stable` インターフェースの保証フィールドが、PHP 専用・Python 専用コーデックを要求しない。
- `universal_codec_advertised`: Worker プロトコル交渉は、共通コーデックを厳密に一つ、`avro` として通知する。
- `fixture_schema_validated`: 新しいリプレイフィクスチャ・正解履歴バンドルを、公開 JSON Schema に対して検証する。
- `discovery_entry_present`: 新しい公開インターフェースに、空でない `surface_family`、`owner_repo`、`format` を持つ `platform_protocol_specs` カタログエントリがある。

強制は機械と人のゲートで分担します。リリース CI は公開契約内の全規範 URL、プロトコル・スキーマ ID、適合性シナリオ ID を解決し、監査範囲をインターフェース安定性分類と照合し、リポジトリ内の規範パスや実装シンボルを拒否します。リリースレビュアーは、公開インターフェースを追加・昇格する全リリース PR で SDK 中立性監査を確認し、将来 SDK の思考実験に責任を持ちます。

## この契約を変更する {#changing-this-contract}

中立性ルールの追加、既存ルールの厳格化、必須監査手順の追加、監査範囲へのインターフェース分類の追加、公式 SDK 対応範囲ポリシーの変更は、契約変更です。マニフェストのバージョンを上げ、同じ変更でアーキテクチャガイドとこのページを更新し、利用可能な契約 [`/sdk-neutrality-contract.json`](/sdk-neutrality-contract.json) を一致させてください。中立性ルールや監査手順の削除はメジャー変更です。
