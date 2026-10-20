---
title: クライアントと Worker の機能
description: CLI、PHP SDK、Python SDK、Rust SDK のクライアント機能と Worker 機能を比較します。
---

# クライアントと Worker の機能 {#client-and-worker-capabilities}

プロセスが行う処理に合わせてサーフェスを選んでください。`dw` CLI とファーストパーティの PHP、Python、Rust SDK は、v2 コントロールプレーンと Worker の契約を共有していますが、オペレーター、クライアント、Worker の役割は同一ではありません。

既存リンクを維持するため、すべてのクライアントを扱うこのガイドは元の `/docs/polyglot/cli-python-parity/` ルートに置いています。

## 機能の比較 {#capability-comparison}

| 機能 | `dw` CLI | PHP SDK | Python SDK | Rust SDK |
| --- | --- | --- | --- | --- |
| ワークフローのライフサイクル | **対応:** 開始、一覧、検査、待機、キャンセル、終了、アーカイブの運用コマンド。[コマンド](./cli-reference.md#workflow-commands) | **対応:** `Client` と `WorkflowHandle` を使った開始、説明、一覧、結果待機、キャンセル、終了。[ライフサイクルの根拠](./php.md#lifecycle-updates-schedules-and-visibility) | **対応:** 非同期クライアントで開始、一覧・説明、結果待機、キャンセル、終了。[ワークフロー操作](./python.md#workflow-operations) | **対応:** `Client` と `WorkflowHandle` を使った開始、説明、結果待機、キャンセル、終了。[終了操作](./rust.md#cancel-terminate-and-handle-terminal-outcomes) |
| シグナル | **対応:** ワークフロー ID または選択した実行に送信。[コマンド](./cli-reference.md#workflow-commands) | **対応:** クライアントとハンドルの送信メソッド、および Worker のシグナル履歴。[PHP API](./php.md#lifecycle-updates-schedules-and-visibility) | **対応:** 非同期クライアントが送信し、ワークフロー Worker がシグナルを処理。[メッセージ](./python.md#signals-queries-and-updates) | **対応:** クライアントとハンドルの送信、および Worker のシグナル処理。[Rust API](https://rust.durable-workflow.com/) |
| クエリ | **対応:** 名前付きの読み取り専用クエリを実行し、構造化出力を返す。[コマンド](./cli-reference.md#workflow-commands) | **対応:** クライアントとハンドルのクエリ、および登録した Worker のクエリハンドラー。[PHP API](./php.md#lifecycle-updates-schedules-and-visibility) | **対応:** 非同期クライアントのクエリと、リプレイされる Worker のクエリハンドラー。[メッセージ](./python.md#signals-queries-and-updates) | **対応:** ランタイムディスカバリーがクエリタスク対応を広告する場合、クライアントのクエリとリプレイされる Worker のクエリハンドラー。[Rust API](https://rust.durable-workflow.com/) |
| 更新 | **対応:** 送信し、受理または完了の結果を待機。[コマンド](./cli-reference.md#workflow-commands) | **対応:** `updateWorkflow` と `registerUpdate`。PHP SDK はバリデーターの記述を公開せず、バリデーターなしと宣言する。[PHP API](./php.md#lifecycle-updates-schedules-and-visibility) | **対応:** クライアント、ワークフローハンドラー、およびディスカバリーが事前受理契約を広告する場合の同期宣言バリデーター。バリデーターを持つ Worker は未対応ランタイムを拒否する。[メッセージ](./python.md#signals-queries-and-updates) | **対応:** クライアント、ハンドル、Avro ペイロード、登録した Worker の更新サーフェス。Rust SDK はバリデーターの記述を公開せず、バリデーターなしと宣言する。[更新](./rust.md#workflow-updates) |
| スケジュール | **対応:** スケジュールの完全なライフサイクル、バックフィル、監査履歴。[コマンド](./cli-reference.md#schedule-commands) | **対応:** `Client` によるスケジュールの完全なライフサイクルと一覧。[PHP API](./php.md#lifecycle-updates-schedules-and-visibility) | **対応:** 完全な非同期スケジュールライフサイクルと監査履歴のページング。[スケジュール](./python.md#schedules) | **未対応:** 現在の Rust SDK はスケジュール管理 API を提供すると表明していない。CLI、PHP、Python、または Server API を使う。 |
| 可視性 | **対応:** ワークフロー・実行の検索、Worker、タスクキュー、履歴、診断 JSON。[コマンド](./cli-reference.md#workflow-commands) | **対応:** ワークフローのフィルタリング・ページング、履歴、名前空間、Worker、タスクキュー。[可視性の根拠](./php.md#lifecycle-updates-schedules-and-visibility) | **対応:** ワークフロー、スケジュール、名前空間、Worker、キュー、履歴、検索属性のクライアントサーフェス。[クライアント API](./python.md#client-api-reference) | **相違:** 選択した実行の説明・結果には対応。全体の一覧・検索と名前空間管理は提供すると表明していない。[Rust クライアント](./rust.md#package-and-source) |
| Worker の実行 | **意図的な相違:** 低レベルの Worker プロトコルコマンドは診断と適合性検証に対応する。`dw` はアプリケーションの Worker ランタイムではない。[Worker コマンド](./cli-reference.md#worker-protocol-commands) | **対応:** `durable-workflow/sdk` によるリモートのワークフロー、アクティビティ、クエリ、更新のハンドラー。[PHP Worker](./php.md#run-a-remote-php-worker) | **対応:** 決定的なワークフローとアクティビティの Worker。[Python Worker](./python.md#worker) | **対応:** ネイティブのワークフロー、アクティビティ、クエリ、更新のハンドラー。[Rust Worker API](https://rust.durable-workflow.com/) |

**対応**は、指定した現行リリースのサーフェスがその機能を公開することを意味します。**相違**は意図的なスコープ境界です。**未対応**は明示的な現在の不足であり、暗黙の約束ではありません。機能がネゴシエーションした Worker プロトコルに依存する場合、ランタイムのプロトコルディスカバリーが引き続き正本です。

## 製品サーフェスごとの根拠 {#evidence-by-product-surface}

### CLI {#cli}

[CLI の概要](./cli.mdx)は、インストール、プロファイル、構造化出力、終了動作を定義します。[コマンドリファレンス](./cli-reference.md)は、ライフサイクル、メッセージ、スケジュール、可視性、意図的に SDK の Worker ループとは異なる低レベルの Worker プロトコルコマンドを含む、完全な運用サーフェスです。

### PHP SDK {#php-sdk}

固定された PHP SDK はフレームワークに依存しないクライアント API とリモート Worker API を公開します。現在の公開サーフェスには、ワークフローのライフサイクルと結果ハンドル、シグナル、クエリ、更新、スケジュール、ワークフローのフィルタリング・履歴、名前空間、Worker、タスクキューの可視性、登録したワークフロー、アクティビティ、クエリ、更新のハンドラーを含みます。[PHP SDK ガイド](./php.md)と生成された [PHP API リファレンス](https://php.durable-workflow.com/api/)を参照してください。

### Python SDK {#python-sdk}

Python SDK は非同期のコントロールプレーンクライアントと、決定的なワークフロー・アクティビティ Worker を組み合わせます。ガイドは[クライアント操作](./python.md#client-api-reference)、[メッセージハンドラー](./python.md#signals-queries-and-updates)、[Worker の実行](./python.md#worker)、[スケジュール管理](./python.md#schedules)を公開します。生成された [Python API リファレンス](https://python.durable-workflow.com/)には正確なシグネチャと結果型があります。

### Rust SDK {#rust-sdk}

公開済みの Rust SDK は、コントロールプレーンと選択した実行のライフサイクル、シグナル、リプレイされるクエリ、更新、ネイティブのワークフロー・アクティビティ Worker を公開します。更新のサポートには `Client::update_workflow`、`WorkflowHandle::update`、`Worker::register_update` とそれぞれの Avro 値版を含みます。スケジュール管理と全体の一覧・検索は明示的に未対応のままです。[Rust SDK ガイド](./rust.md)と生成された [Rust API リファレンス](https://rust.durable-workflow.com/)を参照してください。

## 共通契約の根拠 {#shared-contract-evidence}

4つの製品はすべて、同じバージョン付き HTTP+JSON コントロールプレーンと公開ペイロードエンベロープを対象にします。根拠は何を証明するかで分かれます。

- [機能インデックス](/docs/capabilities/)は正確な成果物の最低バージョンと現在の対応範囲を記録します。
- [プラットフォーム適合性スイート](/docs/platform-conformance/)はクライアント間と Worker 間のランタイムシナリオを記録します。
- CLI と Python のリポジトリは、現在意味上のリクエスト本文をバイト単位で比較する操作について、共有リクエストフィクスチャを保持します。
- PHP と Rust の公開 API リファレンスとリリーステストが、上記の追加対応メソッドの根拠になります。

2つのリポジトリに共有フィクスチャが存在しても、ほかの SDK にその操作がないことを意味しません。逆に、共通のエンドポイントがあっても、すべての製品が同じオペレーターや Worker の役割を公開するとは限りません。

## クライアントサーフェスの追加と拡張 {#adding-or-extending-a-client-surface}

新しい CLI または SDK 操作を追加する際は、次を守ってください。

1. パス、メソッド、意味上のフィールド、ペイロードエンベロープ、エラー結果を言語に依存させない。
2. 参加するすべてのクライアントまたは Worker に、リクエストとランタイムの根拠を追加する。
3. 意図的に異なる構文や役割の境界を文書化する。
4. 未対応の製品を明示する。
5. 言語固有のシリアライズ、ファイルパス、クラス名、エラー構造を公開契約の不具合として扱う。
