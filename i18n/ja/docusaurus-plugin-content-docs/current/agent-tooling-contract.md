---
sidebar_position: 9.3
title: エージェントツール契約
description: MCP ツール、CLI JSON、サーバー診断、Waterline エクスポート、SDK フィクスチャを、機械操作可能な一つの Durable Workflow v2 契約として扱います。
tags:
  - ai
  - agents
  - mcp
  - operations
keywords:
  - durable workflow agent tooling
  - ai tooling contract
  - mcp workflow diagnostics
  - machine readable workflow operations
---

# エージェントツール契約 {#agent-tooling-contract}

Durable Workflow v2 は、安定した契約を通じて製品の事実を公開し、AI 支援による開発を平常的な作業にします。ツールは HTML からワークフロー状態を推測したり、ログの解析結果を唯一の正しい情報源としたり、どの SDK の動作が CLI コマンドに対応するかを推測したりすべきではありません。ドキュメントのバージョンを読み、ローカルのインターフェースを検出し、文書化された操作を呼び出し、名前付きの事実を報告すべきです。

このページは、将来の MCP ツール、ローカルエージェント、スクリプト、SDK が維持すべき契約の形式を定義します。

## 契約の層 {#contract-layers}

| 層 | 安定した操作手段 | 契約上の期待 |
| --- | --- | --- |
| ドキュメント取得 | 正規の `llms.txt` と `llms-full.txt` は安定版 2.0 ドキュメントに追従します。`llms-2.0.txt` と `llms-full-2.0.txt` は同じリリース系列に固定された別名です。 | 2.0 製品の作業には正規 URL を使用します。URL でアーカイブ済み 1.x 系列を示す必要がある場合は `-1.x.txt`、利用側がメジャーバージョンを明示した URL を必要とする場合は `-2.0.txt` に固定します。 |
| ローカル検出 | `/mcp/workflows` の `list_workflows` | アプリが所有する MCP 許可リストは、公開ワークフローキー、必要な認証情報、期待する引数、スモークテストへの適性を示します。 |
| ワークフロー操作 | MCP の `start_workflow`、`get_workflow_result`、`get_workflow_history`、`diagnose_workflow`、`repair_workflow`、`dw` JSON コマンド、SDK クライアント | 各クライアントは、UI をスクレイピングせずに、ワークフロー ID、実行 ID、名前空間、タスクキュー、コマンドステータス、根本原因分類、修復方法、名前付きの失敗フィールドを報告します。 |
| サーバー診断 | `/api/cluster/info`、`dw server:info --output=json`、`dw doctor --output=json`、`dw debug workflow --output=json` | 互換性、プロトコル、タスクキュー、Worker、停止した実行に関する事実は機械可読で、量が制限されています。 |
| 永続化された証拠 | Waterline の選択実行詳細と履歴エクスポート | リプレイ、待機、タイマー、系譜、投影元、整合性チェック、永続化された失敗、運用者が実行できる操作は、型付き状態から得られます。 |
| 言語間の同等性 | CLI/Python リクエストフィクスチャと SDK テスト | 共通のコントロールプレーン操作は、言語間でリクエスト形式を一致させます。 |

各層は単独で利用できるべきです。これらを組み合わせることで、エージェントは小さな変更を行い、それを検証し、結果を説明するのに十分なコンテキストを得られます。

## MCP ツールの設計 {#mcp-tool-design}

新しい MCP ツールは、Durable Workflow の概念を直接公開すべきです。

- ワークフロー、実行、タスクキュー、スケジュール、履歴、失敗、Worker、名前空間、互換性など、製品の名詞を使います。
- 文章だけの概要ではなく、安定した識別子と名前付きのステータスフィールドを返します。
- 診断ツールは `root_cause`、`remediation`、`next_actions` オブジェクトを返し、エージェントが自然言語を解析せずに次のコマンドを選べるようにします。
- 履歴、失敗、ペイロードは、件数を制限した配列とプレビューを含め、無制限のトレースをダウンロードせずに調べられるようにします。
- 検出と変更を分離します。クライアントはワークフローを開始・操作する前に、何が存在し、どの認証情報が必要かを問い合わせられるべきです。
- 変更を明示的かつ構造化されたものにします。ローカルのサンプルワークフローでは `repair_workflow` が正式な修復操作であり、修復が拒否された場合や不要な場合でも `durable-workflow.v2.safe-mutation` エンベロープを返します。
- 認証情報不要のスモークテスト用ワークフローを明示し、外部サービスに触れずにローカル接続をテストできるようにします。
- ツール説明や結果メタデータに、秘密の値、顧客固有のホスト名、アカウント固有の認証情報を含めてはいけません。

サンプルアプリの `/mcp/workflows` エンドポイントは、ローカルワークフローインターフェースのリファレンスです。将来のプロジェクト固有 MCP サーバーも同じ方針を保つべきです。設定が許可リストを所有し、ツールは列挙されたワークフローのみを操作し、結果は人が `dw`、Waterline、SDK で再現できる永続ワークフローの事実を示します。

## コマンドと SDK の同等性 {#command-and-sdk-parity}

自動化では、意味を変えずにクライアントを切り替えられるべきです。

| 操作の種類 | 必要な同等性の証拠 |
| --- | --- |
| 開始、シグナル、更新、クエリ、修復、キャンセル、強制終了、アーカイブ | CLI と SDK のリクエスト本文が、文書化されたコントロールプレーン形式と一致する。 |
| 履歴、詳細、一覧、結果 | レスポンスが安定した識別子、ステータス名、タイムスタンプ、失敗フィールドを維持する。 |
| タスクキューと Worker | 容量、リース、スロット、互換性、Worker ID が構造化された事実のまま維持される。 |
| 外部実行 | 入力・結果エンベロープが言語中立であり、名前付きのブリッジ結果を運ぶ。 |

コントロールプレーン操作の CLI コマンド、SDK メソッド、MCP ツールを追加する際は、他のクライアントが照合できる共通フィクスチャや文書化済みの JSON 例を優先してください。人間向けの表を用意しても構いませんが、自動化の契約は JSON または JSONL です。

## 診断レポートの形式 {#diagnosis-report-shape}

失敗または停止した実行をツールが説明する場合、レポートには次を含めるべきです。

- 使用したドキュメントのバージョンとソースページ
- 呼び出したコマンド、SDK メソッド、MCP ツール
- ワークフロー ID、実行 ID、名前空間、タスクキュー
- 現在のステータスと最新の永続化された失敗概要
- 最近の型付き履歴イベント名
- 保留中の待機、タイマー、タスク、外部アクティビティリース
- 利用できる場合は Worker とタスクキューの互換性に関する事実
- 名前付きの終了コード、HTTP ステータス、検証エラー、またはブロック理由
- 機械可読な `root_cause.category` と `remediation.classification`
- 安全な修復操作が許可されたか、適用されたか、拒否されたか、不要だったか

この形式により、ローカル Laravel アプリ、スタンドアロンサーバーのデプロイ、Python Worker、将来の SDK にわたって同じレポートを使えます。

## 根本原因と修復方法 {#root-cause-and-remediation}

サポートする根本原因スキーマ ID は `durable-workflow.v2.agent-root-cause` です。診断ツールには次を含めるべきです。

- `category`。例: `activity_failure`、`workflow_failure`、`task_repair_attention`、`waiting_for_signal`、`history_growth_attention`、`in_progress`、`none`
- `source.kind` と `source.id`
- `retryable`、`severity`、`actionable`

サポートする修復方法スキーマ ID は `durable-workflow.v2.agent-remediation` です。`classification`、`summary`、`automatic_repair.tool`、`automatic_repair.allowed`、`next_actions` を含みます。`repair_workflow` は、サポートするローカル MCP 修復インターフェースです。MCP が利用できない場合は、文書化された `dw` CLI JSON 契約とサーバーの HTTP コントロールプレーンルートが代わりのインターフェースになります。

```bash
dw debug workflow <workflow-id> --output=json
dw workflow:history <workflow-id> <run-id> --output=json
dw workflow:repair <workflow-id> --output=json
dw system:repair-status --output=json
dw system:repair-pass --output=json
```

これらは、調査、安全な変更、診断、修復自動化のためにサポートする非 MCP 契約です。

## エージェントの制約 {#guardrails-for-agents}

エージェントには定型作業を自動化する権限を与え、永続モデルを迂回する権限は与えないでください。

- ワークフローのオーケストレーションの決定性を保ちます。
- I/O、乱数、外部 API 呼び出し、認証情報はアクティビティまたは外部ハンドラーに置きます。
- ワークフロー制御には、その場しのぎの状態テーブルではなく、シグナル、更新、クエリ、スケジュール、タイマー、メッセージストリームを使います。
- Waterline 履歴エクスポートを、変更 API ではなく証拠として扱います。
- 公開ドキュメントで明示されない限り、ルート一覧、データベース内部、フレームワーク固有のモデル行は実装詳細として扱います。

不変条件は人にも理解できます。ワークフローは永続的な判断を記録し、アクティビティは失敗し得る作業を行い、リプレイは何が起きたかを説明できなければなりません。ツール契約は、それ以外の部分に安定した操作手段を提供します。

## 関連ページ {#related-pages}

- [AI 支援による開発](./ai-assisted-development.md)
- [エージェント運用ループ](./agent-operating-loop.md)
- [MCP ワークフローインターフェース](./mcp-workflows.md)
- [クライアントと Worker の機能](./polyglot/cli-python-parity.md)
- [サーバー HTTP API リファレンス](./polyglot/server-api-reference.md)
- [監視](./monitoring.md)
