---
sidebar_position: 9.2
title: MCP ワークフローインターフェース
description: 検出、開始、診断、修復、結果、履歴のための AI クライアント用ワークフローインターフェースのリファレンスとして、サンプルアプリの MCP サーバーを使用します。
tags:
  - ai
  - agents
  - mcp
  - sample-app
keywords:
  - Durable Workflow MCP
  - MCP ワークフローツール
  - サンプルアプリ MCP サーバー
  - AI クライアントのワークフロー検出
---

# MCP ワークフローインターフェース {#mcp-workflow-surface}

サンプルアプリは、Durable Workflow v2 のリファレンス MCP サーバーを次の場所に公開します。

```text
/mcp/workflows
```

AI クライアントが Waterline をスクレイピングしたり Laravel 内部を推測したりせずに、ローカルのワークフローアプリを調査・操作する必要がある場合に使用してください。このエンドポイントは構造化された開発用インターフェースです。アプリが公開を選んだワークフローを列挙し、認証情報の要件を説明し、実行を開始し、結果をポーリングし、量を制限した履歴の事実を返します。

## サーバー契約 {#server-contract}

サンプルアプリは `routes/ai.php` からサーバーを登録し、`config/workflow_mcp.php` で公開するワークフローキーを設定します。この設定を、AI クライアント用の公開許可リストとして扱ってください。ワークフローを MCP から操作できるのは、このリストに載っており、クライアントが安全に実行できるか判断するための十分なメタデータがある場合だけです。

設定する各ワークフローには次を記述します。

- 安定したワークフローキー
- そのキーに対応するワークフロークラス
- 必須引数と任意引数
- 認証情報の要件
- 認証情報なしのローカルスモークテストで安全に使えるか
- エージェントが根拠として示せる出力と履歴の期待値

ツール説明に秘密を含めないでください。認証情報が必要であることは示しますが、その値やアカウント固有の詳細は含めません。

## ツール {#tools}

リファレンスサーバーは六つのワークフローツールを公開します。

| ツール | 用途 |
| --- | --- |
| `list_workflows` | 設定済みワークフローキー、説明、認証情報の要件、v2 ステータス、最近の実行を検出します。 |
| `start_workflow` | 設定済みワークフローを開始し、`workflow_id`、`run_id`、ステータス、ビジネスキー、コマンド結果を返します。 |
| `get_workflow_result` | 現在または選択した実行のステータス、出力、可視性メタデータ、最新の失敗概要をポーリングします。 |
| `get_workflow_history` | 型付き v2 履歴イベントの末尾と最近の永続化された失敗を、件数を制限して取得します。 |
| `diagnose_workflow` | 構造化された事実、根本原因、修復方法、次の操作を使って選択実行を分類します。 |
| `repair_workflow` | 組み込みの v2 修復コマンドを要求し、受理、拒否、不要のいずれかの構造化された変更結果を返します。 |

開始操作の前に必ず `list_workflows` を呼び出してください。これはエージェントの互換性チェックです。レスポンスは、存在するワークフローキーと、現在の環境でワークフローを実行できるかをクライアントに伝えます。

検出エンベロープは、規範となるスキーマ ID `durable-workflow.v2.mcp-discovery` を使用します。エージェントはこれにより、ツールを呼び出す前に、公開ツール一覧の形式、パラメータスキーマ、検出ヒント、`payload_preview_limit_bytes` の意味を識別できます。

## ツール入力契約 {#tool-input-contract}

MCP ツールスキーマは、意図的に Laravel 内部ではなく Durable Workflow の用語を使います。サンプルアプリのサーバーを拡張する際も、次のフィールドを安定させてください。

| ツール | 安定した入力 |
| --- | --- |
| `list_workflows` | 最近の実行を検出するための `show_recent`、`limit`、任意の `status`。 |
| `start_workflow` | `workflow`、順序付きの `arguments`、任意の `instance_id`、`business_key`、`visibility_labels`、`memo`、`search_attributes`、`duplicate_start_policy`。 |
| `get_workflow_result` | `workflow_id`、任意の `run_id`、`include_recent_history`、`history_limit`。 |
| `get_workflow_history` | `workflow_id` または `run_id`、`limit`、`include_payloads`。 |
| `diagnose_workflow` | `workflow_id` または `run_id`、加えて任意の `history_limit`。 |
| `repair_workflow` | `workflow_id` または `run_id`。 |

新しいエージェントでは、レガシーの `args` 入力より `arguments` を優先してください。`arguments` はワークフローの `handle()` の引数順に直接対応します。`args` は古いオブジェクト形式の呼び出し元のためだけに存在します。

呼び出し元が指定する `instance_id` は、エージェントに冪等性が必要な場合だけ使用します。繰り返しのスモーク実行が重複として失敗せず、アクティブなワークフローに接続すべき場合は、`duplicate_start_policy=return_existing_active` と組み合わせてください。

## ツール結果契約 {#tool-result-contract}

ツール結果エンベロープは、規範となるスキーマ ID `durable-workflow.v2.mcp-tool-results` を使用します。エージェントはこれにより、結果ステータス、ペイロードプレビューの切り詰め、エラーフィールド、根本原因と修復方法のオブジェクト、安全な変更エンベロープ、スキーマ・バージョンマーカーを解析できます。

ツール間の関連付けでは、次の結果フィールドを永続的な識別手段として扱ってください。

| ツール | 安定した結果フィールド |
| --- | --- |
| `list_workflows` | `available_workflows`、`allow_fqcn`、`workflow_id_kind`、`run_id_kind`、`status_values`、任意の `recent_workflows`。 |
| `start_workflow` | `workflow_id`、`run_id`、`workflow`、`workflow_class`、`workflow_type`、`status`、`running`、`business_key`、`duplicate_start_policy`、`command`。 |
| `get_workflow_result` | `found`、`workflow_id`、`run_id`、`current_run_id`、`current_run_is_selected`、`status`、`running`、`output`、`error`、可視性メタデータ、タイムスタンプ。 |
| `get_workflow_history` | `found`、`workflow_id`、`run_id`、`current_run_id`、`status`、`history_event_count`、`returned_event_count`、`events_are_most_recent`、`payloads_included`、`events`、`failures`。 |
| `diagnose_workflow` | `found`、`workflow_id`、`run_id`、`diagnosis`、`facts`、`latest_failure`、`recent_history`、`root_cause`、`remediation`、`next_actions`。 |
| `repair_workflow` | `found`、`workflow_id`、`run_id`、`accepted`、`status`、`mutation`、`command`、`remediation`、`next_actions`。 |

履歴ペイロードのプレビューには意図的に上限があります。`include_payloads` が true の場合、各イベントのプレビューは `payload_preview_limit_bytes`、`size_bytes`、`preview_bytes`、`truncated` を報告し、エージェントが全ペイロードを見たのかプレビューだけを見たのか示せます。

## 失敗と修復方法の分類体系 {#failure-and-remediation-taxonomy}

`diagnose_workflow` は機械可読な根本原因インターフェースです。その `root_cause` オブジェクトはスキーマ ID `durable-workflow.v2.agent-root-cause` を使用し、次を含みます。

- `category`。例: `activity_failure`、`workflow_failure`、`task_repair_attention`、`waiting_for_signal`、`history_growth_attention`、`in_progress`、`none`
- 分類を生んだワークフロー、アクティビティ、待機、タスクキュー、履歴の種類を示す `source.kind` と `source.id`
- `retryable`、`severity`、`actionable`
- 永続化された失敗行がある場合、`failure_category`、`exception_class`、`handled` などの失敗詳細

対応する `remediation` オブジェクトはスキーマ ID `durable-workflow.v2.agent-remediation` を使用します。`classification`、短い `summary`、`automatic_repair.tool`、`automatic_repair.allowed` と、サポートする後続コマンドの `next_actions` エントリを含みます。エージェントは `automatic_repair.allowed` が true の場合にのみ `repair_workflow` を呼び出してください。他の分類では、待機、文書化されたワークフローコマンドによる期待される入力の送信、履歴の調査、ワークフローやアクティビティコードの変更、Continue-As-New の計画を指示します。

`repair_workflow` は `durable-workflow.v2.safe-mutation` エンベロープを返します。`mutation.applied` は修復コマンドが受理されたかを示し、`command.outcome` は `repair_dispatched`、`repair_not_needed`、終端実行や現在ではない実行などの構造化された拒否を区別します。

## 安全なエージェントループ {#safe-agent-loop}

まず認証情報不要のワークフローを使います。

```json
{"tool": "list_workflows", "arguments": {"show_recent": true, "limit": 5}}
{"tool": "start_workflow", "arguments": {"workflow": "simple", "business_key": "demo-001"}}
{"tool": "diagnose_workflow", "arguments": {"workflow_id": "<workflow_id>"}}
{"tool": "repair_workflow", "arguments": {"workflow_id": "<workflow_id>"}}
{"tool": "get_workflow_result", "arguments": {"workflow_id": "<workflow_id>"}}
{"tool": "get_workflow_history", "arguments": {"run_id": "<run_id>", "limit": 25}}
```

スモークテストには `simple` と `elapsed` のワークフローキーを推奨します。認証情報付きの例は、`list_workflows` が要件を報告し、ローカル環境に必要なキーを配置した後にだけ使用してください。

## レポート形式 {#report-shape}

AI クライアントは、安定した事実で MCP 結果を報告すべきです。

- 使用したドキュメントのバージョン。通常は `2.0`
- MCP エンドポイントとツール名
- ワークフローキー、`workflow_id`、`run_id`
- ステータスと最新の失敗概要
- `root_cause.category` と `remediation.classification`
- 修復操作を試みる前に `remediation.automatic_repair.allowed` が true だったか
- 件数を制限した履歴イベント名とタイムスタンプ
- 認証情報不要のスモークテスト用ワークフローを使ったか、認証情報付きの例を使ったか

これらの事実は CLI、Python SDK、Waterline 履歴エクスポートと対応するため、人は別のクライアントから同じ実行を再現できます。

## 関連ページ {#related-pages}

- [AI 支援による開発](./ai-assisted-development.md)
- [エージェント運用ループ](./agent-operating-loop.md)
- [エージェントツール契約](./agent-tooling-contract.md)
- [サンプルアプリ](./sample-app.md)
- [クライアントと Worker の機能](./polyglot/cli-python-parity.md)
- [メッセージストリーム](./features/message-streams.md)
