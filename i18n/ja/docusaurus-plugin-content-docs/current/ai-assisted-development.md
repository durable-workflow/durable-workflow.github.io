---
sidebar_position: 9
title: AI 支援による開発
description: Durable Workflow の v2 ドキュメント、MCP インターフェース、CLI 出力、履歴エクスポートを、コーディングエージェントの安定した操作手段として使用します。
tags:
  - ai
  - agents
  - llms
keywords:
  - Durable Workflow AI ドキュメント
  - llms.txt
  - AI コーディングアシスタント
---

# AI 支援による開発 {#ai-assisted-development}

Durable Workflow v2 は、人が永続実行モデルを学び、繰り返しの調査や運用作業をツールに任せられるように設計されています。重要なのはチャットのプロンプトではなく、エージェントが推測せずに読み取り、呼び出し、根拠として示せる安定した操作手段です。

## 情報取得のインターフェース {#retrieval-surfaces}

次の LLM 向け成果物を使って、AI アシスタントに Durable Workflow の機械可読ドキュメントを提供してください。

| インターフェース | URL | 用途 |
| --- | --- | --- |
| 正規マニフェスト | `https://durable-workflow.com/llms.txt` | 安定版 2.0 のドキュメント索引。サイトのバージョンなしの既定 Docs パスに追従します。 |
| 正規の完全バンドル | `https://durable-workflow.com/llms-full.txt` | 正規マニフェストに対応する単一ファイルのドキュメントバンドル。 |
| v1 マニフェスト | `https://durable-workflow.com/llms-1.x.txt` | バージョンを固定した 1.x アーカイブ。 |
| v1 完全バンドル | `https://durable-workflow.com/llms-full-1.x.txt` | バージョンを固定した 1.x 安定版バンドル。 |
| v2 マニフェスト | `https://durable-workflow.com/llms-2.0.txt` | 正規マニフェストと同等の、バージョンを固定した 2.0 索引。 |
| v2 完全バンドル | `https://durable-workflow.com/llms-full-2.0.txt` | バージョンを固定した 2.0 バンドル。 |

安定版 2.0 の作業では、エージェントの既定プロンプトで `/llms.txt` または `/llms-full.txt` を取得してください。1.x アプリケーションの保守では `-1.x.txt` の URL に固定します。

## ローカル MCP インターフェース {#local-mcp-surface}

[サンプルアプリ](/docs/sample-app) は `/mcp/workflows` に Laravel MCP サーバーを公開しています。これはローカルでの v2 ワークフロー開発における AI クライアント連携のリファレンスです。専用の [MCP ワークフローインターフェース](/docs/mcp-workflows) ページで、エンドポイント、ツール群、安全なスモークテスト用ワークフロー、レポート形式を定義しています。

MCP サーバーは UI のスクレイピングではなく、構造化されたワークフロー操作をエージェントに提供します。

| ツール | 安定した操作手段 |
| --- | --- |
| `list_workflows` | 設定済みワークフローキー、必要な認証情報、ステータス値、最近の実行を検出します。 |
| `start_workflow` | 設定済みの v2 ワークフローを開始し、`workflow_id`、`run_id`、ステータス、ビジネスキー、コマンド結果を受け取ります。 |
| `get_workflow_result` | 現在または選択した実行のステータス、出力、可視性メタデータ、最新の失敗概要をポーリングします。 |
| `get_workflow_history` | 型付き v2 履歴イベントの末尾と最近の永続化された失敗を、件数を制限して取得します。 |

認証情報なしのスモークテストには `simple` または `elapsed` を使ってください。外部認証情報を使うワークフローは、ローカル環境に必要なキーを配置した後でのみ使用します。

エージェントが繰り返し AI 入力や人間の入力を受けるワークフローを編集する場合は、v2 の[メッセージストリーム](/docs/features/message-streams)契約を参照させてください。安定した記述パターンは `Workflow::inbox()` / `Workflow::outbox()` / `MessageStream` です。`MessageService`、`WorkflowMessage`、カーソル行への直接書き込みはランタイム内部の処理であり、サンプルコードのパターンではありません。

## コマンドと診断の契約 {#command-and-diagnostic-contracts}

エージェントは、スクリーンショットや文章よりも機械可読インターフェースを優先してください。

- [エージェント運用ループ](/docs/agent-operating-loop)は、v2 ドキュメント、MCP エンドポイント、`dw` の JSON 出力、Waterline 履歴エクスポート、SDK リファレンスを、検出・変更・実行・診断を繰り返せる一つの手順にまとめています。
- [エージェントツール契約](/docs/agent-tooling-contract)は、MCP ツール、CLI JSON、サーバー診断、Waterline エクスポート、SDK フィクスチャが、一つの機械操作可能なインターフェースとしてどう対応するかを定義します。
- `dw` コマンドは自動化用の安定した終了コードを公開します。[CLI リファレンス](/docs/polyglot/cli#exit-codes)を参照してください。
- [クライアントと Worker の機能](/docs/polyglot/cli-python-parity/)は、`dw` と三つのファーストパーティ SDK のライフサイクル、メッセージ、スケジュール、可視性、Worker 実行を比較し、存在するものについては共通リクエストの証拠も示します。
- [外部実行インターフェース](/docs/polyglot/external-execution)は、アクティビティ相当のタスク境界、キャリアの要件、ブリッジ結果、入力・結果エンベロープのパスを `/api/cluster/info` から公開します。
- シェルによる確認には、サーバーのヘルス、情報、名前空間、ワークフロー、スケジュール、Worker、タスクキューの各コマンドが適しています。
- Waterline 履歴エクスポートは、リプレイと失敗診断の情報源です。型付き履歴イベント、投影元メタデータ、整合性チェック、選択実行のコンテキスト、待機、タイマー、系譜、最新の永続化された失敗を含みます。
- Python SDK の型とメソッドシグネチャは、生成された [Python API リファレンス](https://python.durable-workflow.com/)にあります。

エージェントが停止しているワークフローを説明する際は、まず次の事実を収集してください。

1. `workflow_id` と `run_id`
2. 現在の実行ステータスと最新の失敗概要
3. 最近の型付き履歴イベント
4. 未完了の待機、タイマー、保留中のタスク
5. Worker とタスクキューのヘルス
6. 対象ドキュメントのバージョン。現在の製品の作業には `2.0`、レガシー保守に限り `1.x` を使用します

これらがあれば、永続ワークフローの失敗と、Worker ランタイムの失敗、外部認証情報の不足、キューの停止、承認待ちの運用操作を区別できます。

## プロンプトの形式 {#prompt-shape}

コーディングエージェントには明示的な制約と操作手段を与えてください。

```text
Use Durable Workflow docs from https://durable-workflow.com/llms-full-2.0.txt.
Use the sample app MCP endpoint at /mcp/workflows for workflow discovery,
start, result, and history. Prefer dw JSON/exit-code contracts and Waterline
history exports over screenshots. For external handlers or bridge adapters,
read worker_protocol.external_execution_surface_contract from /api/cluster/info
and preserve the external task input/result envelopes. Use Durable Workflow
2.0 APIs unless I explicitly ask for legacy 1.x maintenance.
```

目的は、人がワークフロー・アクティビティ・リプレイの不変条件を学び、ツールが製品の動作を推測せず、文書化された契約を通じて操作することです。
