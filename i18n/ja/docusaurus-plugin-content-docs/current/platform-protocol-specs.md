---
sidebar_position: 18
title: プラットフォームプロトコル仕様
description: 公開された Durable Workflow の OpenAPI、JSON Schema、AsyncAPI 仕様の利用者向けカタログ。
tags:
  - compatibility
  - protocols
  - api-stability
  - openapi
  - json-schema
  - asyncapi
keywords:
  - プラットフォームプロトコル仕様
  - プロトコルカタログ
  - OpenAPI
  - AsyncAPI
  - JSON Schema
  - コントロールプレーン仕様
  - Worker プロトコル仕様
---

import PublicAuthorityIdentity from '@site/src/components/PublicAuthorityIdentity';
import ProtocolCatalog from '@site/src/components/ProtocolCatalog';
import WorkerProtocolAuthorityRoles from '@site/src/components/WorkerProtocolAuthorityRoles';
import protocolCatalog from '@site/static/platform-protocol-specs.json';

# プラットフォームプロトコル仕様 {#platform-protocol-specs}

プラットフォームプロトコルカタログは、Durable Workflow の各公開インターフェースをどの機械可読仕様が規定するかを、SDK 作者、エージェント、運用者、サードパーティツールに正確に伝えます。

自動化には[機械可読カタログ](https://durable-workflow.github.io/platform-protocol-specs.json)を使用してください。利用可能な各エントリは、安定した仕様識別子と、OpenAPI、AsyncAPI、JSON Schema の成果物を直接取得できる公開 HTTPS URL の両方を提供します。

リポジトリのパス、実装シンボル、テストフィクスチャは、意図的に利用者向けの規範としていません。公開カタログから除外し、検証の診断情報としてだけ保持しています。

## カタログの識別情報と検出 {#catalog-identity-and-discovery}

<PublicAuthorityIdentity
  manifest={protocolCatalog}
  manifestUrl="https://durable-workflow.github.io/platform-protocol-specs.json"
/>

カタログは次からも利用できます。

- https://durable-workflow.github.io/platform-protocol-specs.json の公開 JSON カタログ
- スタンドアロン Server の GET /api/cluster/info にある platform_protocol_specs
- 人が理解するための背景を提供する、この 2.0 ガイド

JSON URL は機械が利用するカタログの規範となる情報源です。Server は同じカタログを再公開するため、クライアントはリポジトリ構成を仮定せずに、有効なプロトコルインターフェースを検出できます。

<WorkerProtocolAuthorityRoles />

## 利用者向けフィールド {#consumer-fields}

各エントリは次の契約を公開します。

| フィールド | 意味 |
|---|---|
| spec_id | 安定した Durable Workflow プロトコル識別子。公開ドキュメントは対応する識別情報を持ちます。 |
| spec_url | 機械可読仕様への直接の公開 HTTPS URL。 |
| format | openapi、json_schema、または asyncapi。 |
| status | 参照する成果物が公開済み、作業中、計画中のいずれであるか。 |
| surface_family | インターフェースを規定する互換性ポリシーの分類。 |
| authority_manifest | ランタイムがそのインターフェースを通知する検出マニフェスト。 |
| owner_repo | 仕様を担当するプロジェクト。 |
| object_families | 公開オブジェクト分類名と担当プロジェクト。 |
| evolution_rule | 追加変更と破壊的変更の互換性ルール。 |
| breaking_change_release | その進化ルールが要求するリリース境界。 |

利用者は spec_url を解決し、ドキュメントの識別情報が spec_id と一致することを検証してください。ソースチェックアウトへのアクセスは必要ありません。

## 利用可能な仕様 {#available-specifications}

この一覧は公開 JSON カタログから描画されます。そのため、仕様の識別情報、利用可否、公開リンク、オブジェクト分類の担当は、別の文章による規範ではなく、カタログデータとして維持されます。

<ProtocolCatalog />

### Worker セッションランタイムの補足 {#worker-session-runtime-notes}

このスキーマは、Worker セッションの機能検出、ライフサイクルエンベロープ、タスクアフィニティのスナップショット、運用者向け可視性を対象にします。安定した識別子は durable-workflow.v2.worker-sessions-runtime です。

### ローカルアクティビティランタイムの補足 {#local-activity-runtime-notes}

このスキーマは、ローカルアクティビティの機能検出、オプションのスナップショット、履歴マーカー、リトライの意味、運用者向け可視性を対象にします。安定した識別子は durable-workflow.v2.local-activity-runtime です。

### Cluster-info エンベロープの補足 {#cluster-info-envelope-notes}

このスキーマは、GET /api/cluster/info と、そのエンドポイントから利用できる入れ子の検出マニフェストを対象にします。安定した識別子は durable-workflow.v2.cluster-info-envelope です。

## 形式 {#formats}

| 形式 | 用途 |
|---|---|
| OpenAPI 3.1 | ルート、メソッド、ステータスコード、エンベロープが契約の一部である HTTP・JSON リクエスト/レスポンスのインターフェース。 |
| JSON Schema 2020-12 | 永続化レコード、イベントペイロード、結果エンベロープ、ランタイムオプション、関連オブジェクト分類。 |
| AsyncAPI 2.6 以降 | ポーリング、ストリーム、リース更新、順序、配信の意味。 |

## ステータスの段階 {#status-levels}

| ステータス | 意味 |
|---|---|
| published | 公開の機械可読仕様が spec_url にあり、直接利用できます。 |
| in_progress | 公開仕様はありますが、対象範囲は部分的です。列挙されたフィールドとルートは規範です。 |
| planned | 安定したカタログ識別情報はありますが、利用可能な仕様はまだありません。計画中のエントリは spec_url を通知しません。 |

## 進化ルール {#evolution-rules}

additive_minor_breaking_major は、マイナーリリースでの追加変更を認めます。削除、名前変更、型の制限、意味の変更にはメジャーリリースが必要であり、実用的な場合は並行するルートやフィールドを使うべきです。

parallel_primitive_only は、固定されたワイヤ形式を規定します。元の形式をデコード可能なまま保ち、破壊的な形式変更は新しいイベント型、コマンド型、スキーマ識別子の下で導入しなければなりません。

experimental_any_release は、実験的であると明示した仕様にだけ適用し、任意のリリースでの変更を認めます。

## リリース検証 {#release-validation}

ドキュメントサイトの CI は、次の機械チェックを実施します。

| ゲート | CI が確認する内容 |
|---|---|
| catalog_aligned_with_surface_families | 各エントリが宣言済みの公開互換性分類を参照する。 |
| owner_repo_known | エントリとオブジェクト分類の担当が、カタログの語彙を使う。 |
| format_known | 利用可能な各成果物を宣言された形式として解析できる。 |
| public_spec_references_resolve | 利用可能な各 spec_url が公開プロトコル仕様の名前空間内の HTTPS URL であり、spec_id と一致する識別情報を持つ配布済み成果物に解決する。 |
| repository_local_authority_fields_rejected | 公開エントリに、リポジトリ内のパス、実装シンボル、テスト参照、古い規範フィールドが含まれない。 |
| workflow_package_mirror_aligned | 当該リリース入力が利用できる場合、公開カタログがパッケージ化された Workflow カタログと一致する。 |
| server_owned_spec_mirrors_aligned | 入力が利用できる場合、Server 所有の公開成果物が担当リポジトリのミラーと一致する。 |
| diagnostic_provenance_complete | 検証専用の由来情報が、全カタログエントリとオブジェクト分類を網羅する。 |
| object_family_metadata_declared | カタログエントリと公開ドキュメントで、オブジェクト分類名と担当が一致する。 |
| rendered_retrieval_surfaces_aligned | ビルド済み 2.0 ページと完全な 2.0 モデル取得バンドルが、利用可能な各エントリのカタログ識別情報、公開 URL、オブジェクト分類の担当を公開する。 |
| breaking_change_release_consistent_with_evolution_rule | すべての破壊的変更リリース値が進化ルールと一致する。 |
| deliverable_specs_published | 必須の全プラットフォームインターフェースに、公開済みで解析可能な仕様がある。 |

機械チェックは公開 JSON カタログを読み込み、語彙と利用者に安全な参照を検証し、配布済み仕様を解析し、オブジェクト分類と埋め込みスキーマのメタデータを確認し、利用可能な場合はパッケージミラーを比較します。サイトとモデル用バンドルの生成後、意味に基づくチェックが、描画されたカタログ値を同じ JSON の規範と比較します。ドキュメントの文章や見出しは比較対象ではありません。

契約が変わる場合は、パッケージ化された Workflow カタログ、この公開 JSON ミラー、影響する公開仕様成果物をまとめて更新してください。人によるレビューでは、説明文を機械の規範とせずに、有用性が保たれていることを確認します。

続いて[プラットフォーム適合性スイート](/docs/platform-conformance)で、これらのプロトコル仕様を実行検証する、現在有効なバイト列に結び付いたフィクスチャを解決してください。過去のフィクスチャの証拠はスイート内で別に識別され、現在のカタログの規範に代わるものではありません。
