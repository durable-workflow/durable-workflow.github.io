---
sidebar_position: 2
title: 2.0 機能索引
description: Durable Workflow 2.0 のサービスモード SDK、組み込みランタイム、プロトコル、機能の索引。
tags:
  - capabilities
  - compatibility
  - polyglot
keywords:
  - Durable Workflow 2.0 の機能
  - PHP Python Rust SDK
  - ワークフローエンジンの機能比較
  - 正確な最低対応版
---

# Durable Workflow 2.0 機能索引 {#durable-workflow-20-capability-index}

これは安定版 Durable Workflow 2.0 リリース系列の機能索引です。

## サポートするインストール可能なチャネル {#supported-installable-channel}

成果物の正確な識別情報は、この機能概要ではなく、パッケージレジストリとリリースメタデータが管理します。

| インターフェース | サポートするチャネル | この索引での役割 |
| --- | --- | --- |
| CLI | 2.0 安定版 | 機械可読な運用・診断クライアント。 |
| PHP SDK | 2.0 安定版 | Cloud 名前空間ランタイムまたはセルフホスト Server 向けの、ファーストパーティのサービスモード `durable-workflow/sdk` クライアントとリモートのワークフロー・アクティビティ Worker。 |
| 組み込み Laravel エンジン | 2.0 安定版 | 独自の記述ランタイム、永続化エンジン、キュー、リプレイを持つ、アプリケーション内の独立した `durable-workflow/workflow` デプロイモード。 |
| Python SDK | 2.0 安定版 | Cloud 名前空間ランタイムまたはセルフホスト Server 向けの、ファーストパーティのサービスモードの決定的ワークフロー・アクティビティ SDK と運用・コントロールプレーンクライアント。Python 3.10 以降が必要です。 |
| Rust SDK | 2.0 安定版 | Cloud 名前空間ランタイムまたはセルフホスト Server 向けの、ファーストパーティのサービスモードの決定的ワークフロー・アクティビティ SDK、Worker サービス、コントロールプレーンクライアント。Rust 1.86 以降が必要です。 |
| Server | 2.0 安定版 | v2 コントロールプレーン・Worker プロトコル向けの、PHP で実装された言語中立のセルフホストランタイム。 |
| Waterline | 2.0 安定版 | Cloud は Managed Waterline を含みます。セルフホストの運用者は Server 名前空間に対してサービスイメージを別途デプロイします。組み込み Laravel では Composer パッケージをインストールし、アプリ所有の状態をプロセス内で読みます。 |

PHP、Python、Rust が、三つのファーストパーティのサービスモード SDK 言語です。ランタイム検出が公開済みの機能を報告する場合、それぞれがプロビジョニング済み Durable Workflow Cloud 名前空間ランタイム、またはセルフホスト Server を対象にできます。安定した文字列型名、一つの永続コマンド・履歴モデル、コントロールプレーンバージョン `2`、Worker プロトコルメジャー `1`、公開ペイロードエンベロープを共有します。Rust はワークフロー SDK であり、生のプロトコル呼び出しだけでなく、決定的なワークフローコード、アクティビティ、Worker サービスを実行します。Python は、ワークフロー記述と、名前空間、スケジュール、Worker、キュー、履歴、修復などの運用クライアント機能を併せ持ちます。

組み込み Laravel は、引き続き独立したアプリケーション内 PHP デプロイモードです。PHP サービスモードのクライアントや Worker に必要なものではありません。フレームワークに依存しない PHP SDK は、組み込み Laravel エンジンと独立したバージョンで提供します。

[デプロイモード](/docs/polyglot/deployment-modes/)で所有境界を選び、[Cloud マネージドランタイム](/docs/polyglot/cloud-control-plane/)または[セルフホスト Server](/docs/polyglot/server/)に進んでください。以下の機能の証拠は、選択したランタイムが必要な契約を通知する場合にだけ適用されます。

PHP SDK 2.3.2、Python SDK 2.5.7、Rust SDK 3.5.0 の既定 Worker プロトコルは `1.20` です。既定 Worker には、メジャー `1` 内の `1.20` 以降を通知する Server が必要です。各 SDK は、古い互換 Server 向けに明示的な `1.19` 選択もサポートします。協調的キャンセルには `1.20` と明示的な機能のオプトインが必要です。互換性はランタイム検出と選択した SDK の公開メタデータで判断します。[バージョン互換性](/docs/compatibility/)と [Worker プロトコル](/docs/polyglot/worker-protocol/)を参照してください。

## 機能と SDK の最低対応版 {#capability-and-sdk-floors}

「サービスモード」は Cloud またはセルフホスト Server がリモートランタイムを所有することを意味します。「組み込み」は Laravel アプリケーションがプロセス内でランタイムを所有することを意味します。SDK 欄は意図的に差分を記録しています。空欄や制限付きの SDK に同等性があるとは解釈しないでください。

| 機能 | 現在の 2.0 契約とファーストパーティの最低対応版 | 明示的な 2.0 の証拠 |
| --- | --- | --- |
| ワークフロー | リモートの PHP、Python、Rust Worker で決定的なワークフローを記述します。組み込み Laravel の記述には Workflow パッケージを使います。 | [ワークフローの記述](/docs/defining-workflows/workflows/)、[PHP SDK](/docs/polyglot/php/)、[Python SDK](/docs/polyglot/python/)、[Rust SDK](/docs/polyglot/rust/) |
| アクティビティとサービス | 組み込みエンジンと三つのサービスモード SDK すべてでアクティビティを記述できます。Rust のワークフローとアクティビティはファーストパーティ Worker サービスで実行します。Python と PHP はファーストパーティの制御・サービスクライアントも提供します。 | [アクティビティ](/docs/defining-workflows/activities/)、[PHP SDK](/docs/polyglot/php/)、[アクティビティ実行](/docs/features/activity-execution-model/)、[外部実行](/docs/polyglot/external-execution/) |
| シグナル | 現在の最低対応版で、PHP、Python、Rust のワークフローインターフェースから永続的な非同期変更を利用できます。 | [シグナル](/docs/features/signals/)、[Python SDK](/docs/polyglot/python/)、[Rust SDK](/docs/polyglot/rust/) |
| クエリ | 読み取り専用のリプレイクエリをサポートします。PHP、Python、Rust はクエリハンドラー・クライアントを公開します。Rust のリプレイクエリタスクには Worker プロトコル `1.8` 以降が必要です。 | [クエリ](/docs/features/queries/)、[Python SDK](/docs/polyglot/python/)、[Rust SDK](/docs/polyglot/rust/) |
| 更新 | PHP、Python、Rust はクライアントと Worker ハンドラーの更新インターフェースを公開します。Python の宣言済みバリデーターは、Server 検出がその正確な契約を通知する場合、受理前の同期検証を使います。承認後に受理され、拒否、Worker 喪失、タイムアウト、フェンスされた完了は明示的に失敗します。PHP と Rust はバリデーターの記述を公開せず、バリデーターを宣言しません。 | [更新](/docs/features/updates/)、[Python SDK](/docs/polyglot/python/)、[Rust SDK](/docs/polyglot/rust/#workflow-updates) |
| タイマー | サービスランタイムが支える永続タイマーを PHP、Python、Rust でリプレイします。 | [タイマー](/docs/features/timers/)、[Rust SDK](/docs/polyglot/rust/) |
| リトライ | 永続アクティビティのリトライポリシーをコマンドとともに記録します。PHP、Python、Rust は現在の最低対応版でアクティビティのリトライオプションを公開します。 | [失敗と復旧](/docs/failures-and-recovery/)、[Python SDK](/docs/polyglot/python/)、[Rust SDK](/docs/polyglot/rust/) |
| タイムアウト | Cloud とセルフホスト Server のサービスモードランタイムは、アクティビティとワークフローのタイムアウト各種を強制します。Rust にはアクティビティオプションと、ワークフローの実行全体・個別実行の開始時期限があります。 | [タイムアウト](/docs/features/timeouts/)、[Rust SDK](/docs/polyglot/rust/) |
| 子ワークフロー | PHP、Python、Rust は永続的な子を開始して待機します。言語間の型識別情報は安定した文字列で、子のペイロードは共通エンベロープを使います。 | [子ワークフロー](/docs/features/child-workflows/)、[Python SDK](/docs/polyglot/python/) |
| 決定的な並列合成 | PHP の `all()`/`parallel()`、Python の入れ子の list-yield、Rust の `WorkflowContext::parallel()`/`join()` は、アクティビティ、子ワークフロー、タイマー、混合・入れ子グループを通常のコマンドでスケジュールします。三つとも共通のグループ識別・パスメタデータを公開し、入れ子の入力順で結果を復元します。 | [並行処理](/docs/features/concurrency/)、[Python SDK](/docs/polyglot/python/#fan-out)、[Rust SDK](/docs/polyglot/rust/#deterministic-parallel-groups) |
| <span id="durable-first-completion-selection-capability">永続的な最初の完了の選択</span> | 組み込み PHP と PHP、Python、Rust サービス SDK は、独立したアクティビティ、子ワークフロー、タイマー、外部入力待機、入れ子グループのメンバーを開始します。安定したメンバー識別情報とともに一つの勝者を永続化します。勝者以外は続行し、待機・キャンセル用ハンドルを保持します。 | [並行処理](/docs/features/concurrency/#first-completion-selection)、[Python SDK](/docs/polyglot/python/#first-completion-selection)、[Rust SDK](/docs/polyglot/rust/#durable-first-completion-selection) |
| Saga 補償 | PHP の Saga ヘルパー、Python の `WorkflowContext.saga()`、Rust の `WorkflowContext::saga()` は、前進処理の成功後に永続的な補償を登録し、既定で逆順に逐次巻き戻します。Python と Rust は最初の補償失敗で停止し、起点の失敗と補償失敗を保持します。PHP はオプトインの並列・エラー時続行ポリシーも公開します。 | [Saga](/docs/features/sagas/)、[Python SDK](/docs/polyglot/python/#saga-compensation)、[Rust SDK](/docs/polyglot/rust/#saga-compensation) |
| キャンセル | 組み込み Laravel とサービスモードの PHP、Python、Rust は、明示的に有効化した Worker で、一つのルート識別情報、不変の期限、上限付きの後処理を伴う協調的キャンセル要求をサポートします。選択実行の安全性と型付き結果を持つ、即時の終端キャンセルも引き続き利用できます。 | [キャンセルと強制終了](/docs/features/cancel-and-terminate/)、[サービスモードのキャンセル](/docs/polyglot/cancellation/)、[Rust SDK](/docs/polyglot/rust/) |
| 強制終了 | 実行を即時に閉じ、区別された終端結果を記録します。Cloud とセルフホスト Server のサービスランタイム、CLI、PHP、Python、Rust の制御インターフェースから利用できます。 | [キャンセルと強制終了](/docs/features/cancel-and-terminate/)、[Server API](/docs/polyglot/server-api-reference/) |
| 副作用 | PHP、Python、Rust は非決定的な値を一度だけ記録し、リプレイでは記録済みの値をデコードします。 | [副作用](/docs/features/side-effects/)、[Python SDK](/docs/polyglot/python/)、[Rust SDK](/docs/polyglot/rust/) |
| Workflow Streams | PHP、Python、Rust は、Server 所有の実行単位の出力ストリームに対して、型付きの一覧、詳細、オフセット購読・再開、追記、終了、エラー操作を公開します。三つとも永続コマンド識別情報からリプレイ安全な emit を記述します。Python は設定されたストレージドライバーで外部ペイロードを解決し、PHP と Rust は不透明な参照を保持します。 | [Workflow Streams](/docs/polyglot/workflow-streams/)、[正確な SDK マトリクス](/workflow-stream-capabilities.json)、[ランタイムシナリオ](/platform-conformance/workflow-stream-runtime-scenarios.json) |
| バージョンマーカー | PHP、Python、Rust は、互換性のあるコード進化のための永続バージョンマーカーを公開します。 | [バージョン管理](/docs/features/versioning/)、[Python SDK](/docs/polyglot/python/)、[Rust SDK](/docs/polyglot/rust/) |
| 決定的リプレイ | PHP、Python、Rust のワークフロー Worker は、外部作業を再実行せず、永続履歴から判断を再構築し、型付きの非決定性を報告します。 | [実行保証](/docs/constraints/execution-guarantees/)、[プラットフォーム適合性](/docs/platform-conformance/)、[Rust SDK](/docs/polyglot/rust/) |
| スケジュール | Cloud とセルフホスト Server のサービスランタイムが永続スケジュールを所有します。PHP、Python、CLI はスケジュール操作を公開します。Rust はスケジュール管理 API を提供すると主張しません。 | [スケジュール](/docs/features/schedules/)、[CLI リファレンス](/docs/polyglot/cli-reference/)、[Python SDK](/docs/polyglot/python/) |
| 名前空間 | サービスモードランタイムは名前空間単位です。選択したランタイムが操作を公開する場合、PHP/Python クライアントと CLI は名前空間を管理します。Rust の Worker・クライアントは名前空間を対象にしますが、現在の最低対応版で名前空間管理を提供するとは主張しません。 | [名前空間、認証、Worker](/docs/polyglot/namespace-auth-workers/)、[Server API](/docs/polyglot/server-api-reference/) |
| 検索属性 | Cloud とセルフホスト Server のサービスランタイムは型付き検索属性に索引を付けます。PHP と Python は記述・制御インターフェースを公開し、CLI と運用者 API は構造化された検出・フィルタリングを公開します。 | [検索属性](/docs/features/search-attributes/)、[Python SDK](/docs/polyglot/python/) |
| Worker 互換性 | SDK はランタイム、SDK バージョン、ビルド ID、対応型、プロトコルバージョン、容量を登録し、Server は受け入れるバージョンとルーティングの事実を公開します。 | [互換性](/docs/compatibility/)、[Worker の互換性とルーティング](/docs/polyglot/worker-compatibility-routing/) |
| ローカルアクティビティ | 組み込み Laravel、PHP・Python サービス SDK、Rust SDK 3.1.0 で、明示的な Worker オプトインにより利用できます。 | [組み込みアクティビティ実行](/docs/features/activity-execution-model/)、[サービスモードの対応マトリクス](/docs/polyglot/portable-worker-affinity/) |
| Worker セッション | 組み込み Laravel、PHP・Python サービス SDK、Rust SDK 3.2.0 で、明示的な Worker オプトインにより利用できます。 | [Worker セッション](/docs/features/worker-sessions/)、[サービスモードの対応マトリクス](/docs/polyglot/portable-worker-affinity/) |
| スティッキー実行 | 組み込み Laravel と PHP サービス SDK で利用できます。Python と Rust は未対応です。 | [スティッキー実行](/docs/features/sticky-execution/)、[サービスモードの対応マトリクス](/docs/polyglot/portable-worker-affinity/) |
| コーデックの相互運用性 | PHP、Python、Rust は公開された `codec` + `blob` エンベロープと、一つの固定された再帰 Avro Value スキーマを使います。名前付き分岐が、整数と double、テキストとバイト列、真偽値と整数、リストとマップの区別を保ちます。 | [Avro Value プロトコル](/docs/polyglot/avro-value-protocol/)、[Worker プロトコル](/docs/polyglot/worker-protocol/)、[Rust SDK](/docs/polyglot/rust/) |
| 診断 | サービスランタイムと CLI は、バージョン、プロトコル、Worker、タスクキュー、リプレイ、履歴、型付きの失敗、修復の事実を JSON で公開します。Managed Waterline、別途デプロイするセルフホストサービス、組み込みパッケージが、それぞれを所有するランタイムの証拠を提示します。 | [監視](/docs/monitoring/)、[CLI リファレンス](/docs/polyglot/cli-reference/)、[Waterline 運用者 API](/docs/waterline-operator-api/) |
| エージェントツール | 検出 -> 変更 -> 実行 -> 診断 -> 修復を、公開マニフェスト、スキーマ、HTTP 操作、CLI JSON、SDK クライアント、型付き履歴・診断、安全な変更から利用できます。MCP は任意の一インターフェースであり、この機能の定義そのものではありません。 | [エージェントツール契約](/docs/agent-tooling-contract/)、[エージェント運用ループ](/docs/agent-operating-loop/) |

## ペイロード相互運用性の境界 {#payload-interoperability-boundary}

言語をまたぐワークフロー・アクティビティ呼び出しは、シリアライズされた PHP オブジェクト、Python pickle、Rust 実装型を渡しません。登録された文字列型名と公開ペイロードエンベロープを渡します。`avro` では、各ファーストパーティ SDK が公式の言語実装と同じ固定 Value スキーマを使います。デコードされたマップ、リスト、文字列、バイト列、整数、double、真偽値、null は、プリミティブ型を保ちます。言語固有のクラスを再構築するのは、その SDK 内だけです。

この契約は、ワークフローの入力と結果、子ワークフロー、アクティビティの入力と結果、シグナル、クエリ、更新、外部実行に適用します。デプロイ時には、Worker を受け入れる前に `GET /api/cluster/info` が通知するコーデックを検証する必要があります。

## リリースと成熟度の境界 {#release-and-maturity-boundary}

ここで索引化したプラットフォーム契約は、安定版 2.0 の製品インターフェースです。簡潔な適合性判断には、[AI エージェント向け評価](/docs/ai-agent-workflow-engine/)を使用してください。
