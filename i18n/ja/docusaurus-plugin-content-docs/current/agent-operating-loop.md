---
sidebar_position: 9.1
title: エージェント運用ループ
description: Durable Workflow アプリケーションの検出、変更、実行、診断、修復を行う、安定した v2 の手順を AI エージェントに提供します。
tags:
  - ai
  - agents
  - mcp
  - operations
keywords:
  - Durable Workflow エージェント運用ループ
  - AI ワークフローのデバッグ
  - MCP ワークフロー
  - Waterline 履歴エクスポート
  - dw JSON 出力
---

# エージェント運用ループ {#agent-operating-loop}

Durable Workflow v2 は、各手順に安定した操作手段があるとエージェントにとって使いやすくなります。以下のループは、人が学ぶものと同じ不変条件から始め、検出、実行、診断、修復には機械可読な契約を使います。

## 1. 適切なドキュメント系列を使う {#1-use-the-right-docs-line}

安定版 2.0 の作業には、正規バンドルを使ってください。これは、公開サイトから人がアクセスするものと同じ、バージョンなしの既定 Docs パスに追従します。

```text
https://durable-workflow.com/llms-full.txt
```

URL 自体で現在のメジャー系列を示す必要がある場合は、2.0 固有のバンドルを使います。

```text
https://durable-workflow.com/llms-full-2.0.txt
```

URL 自体で安定版メジャー系列を示す必要がある場合は、明示的な 1.x 固定 URL を使います。

```text
https://durable-workflow.com/llms-full-1.x.txt
```

## 2. ローカルのワークフローインターフェースを検出する {#2-discover-the-local-workflow-surface}

利用できる場合は、サンプルアプリの MCP エンドポイントから始めます。

```text
/mcp/workflows
```

リファレンスとなるツール契約、安全なスモークテスト用ワークフローキー、エージェントのレポート形式については、[MCP ワークフローインターフェース](./mcp-workflows.md)を参照してください。

最初に `list_workflows` を呼び出します。レスポンスから、公開されているワークフロー、必要な認証情報、受け付ける引数、既存の最近の実行が分かります。外部 API キーを必要とする例を操作する前に、`simple` または `elapsed` を使って認証情報なしのスモークテストを行ってください。

MCP が利用できない場合は、代わりに CLI とサーバーの契約を使います。

```bash
dw server:info --output=json
dw workflow:list --output=json
dw task-queue:list --output=json
```

これらのコマンドは、UI のスクレイピングなしで、プロトコルバージョン、名前空間のコンテキスト、ワークフローの可視性、タスクキューのヘルスを提供します。

## 3. 最小限の変更を行う {#3-make-the-smallest-change}

ワークフローコードを編集する際は、永続性の境界を守ってください。

- オーケストレーションの判断はワークフローメソッドに置く
- I/O、乱数、ネットワーク呼び出し、外部認証情報はアクティビティに置く
- その場しのぎのテーブルやキュージョブではなく、シグナル、更新、クエリ、タイマー、メッセージストリームを使う
- 繰り返しの人間や AI の入力には、[メッセージストリーム](./features/message-streams.md)の契約を使う

この境界は言語ごとのインターフェースよりも重要です。PHP ワークフロークラス、`dw`、Python SDK、外部 Worker は、すべて同じコントロールプレーン操作を表すべきです。

ソース編集が不要な場合、「変更」は明示的な運用上の選択でも構いません。公開されたワークフローキーを選び、安定した `business_key` を指定し、冪等なスモーク実行のために `duplicate_start_policy=return_existing_active` を選択するか、`diagnose_workflow` が推奨する文書化済みのシグナル・更新入力を送ります。

## 4. 構造化された操作手段で実行する {#4-run-through-structured-handles}

タスクに最も適した具体的な操作手段を使ってください。

| タスク | 推奨する操作手段 |
| --- | --- |
| ローカルのサンプルワークフローを開始する | `/mcp/workflows` の `start_workflow` |
| ローカルのサンプルワークフローを修復する | `diagnose_workflow` を使い、修復方法が許可する場合にのみ `repair_workflow` を使う |
| サーバーワークフローを開始または操作する | `dw workflow:start`、`dw workflow:signal`、`dw workflow:update`、または SDK の同等機能 |
| 互換性を確認する | `dw server:info --output=json` と `/api/cluster/info` |
| キューのヘルスを調べる | `dw task-queue:describe <queue> --output=json` |
| クライアントと Worker の機能を比較する | [クライアントと Worker の機能](./polyglot/cli-python-parity.md) |
| PHP 以外の Worker を実装する | [Worker プロトコル](./polyglot/worker-protocol.md) |
| 外部ハンドラーを実装する | [外部実行インターフェース](./polyglot/external-execution.md) |

エージェントのループには JSON または JSONL 出力を優先してください。ターミナルの表は人間向けです。

## 5. 修復する前に診断する {#5-diagnose-before-repairing}

コードを変更したりコマンドを再実行したりする前に、事実を収集します。

```bash
dw doctor --output=json
dw server:info --output=json
dw debug workflow <workflow-id> --output=json
dw workflow:history <workflow-id> <run-id> --output=json
```

MCP のサンプルアプリインターフェースでは、次を呼び出します。

```json
{"tool": "diagnose_workflow", "arguments": {"workflow_id": "<workflow_id>"}}
```

`root_cause.category`、`remediation.classification`、`remediation.automatic_repair.allowed` を読みます。最後のフィールドが true の場合にのみ `repair_workflow` を呼び出します。

```json
{"tool": "repair_workflow", "arguments": {"workflow_id": "<workflow_id>"}}
```

Waterline が利用できる場合は、選択した実行の履歴をエクスポートします。エクスポートには、型付き履歴イベント、選択実行のコンテキスト、待機、タイマー、系譜、投影元メタデータ、整合性チェック、永続化された失敗が含まれます。これらの事実により、エージェントはワークフローのバグと、Worker の不在、認証情報の不足、タスクキューの停止、クライアントの非互換性、保留中の運用操作を区別できます。

## 6. 契約に基づいて報告する {#6-report-with-contracts}

エージェントのレポートでは、スクリーンショットではなく安定した事実を示してください。

- 使用したドキュメントのバージョンと LLM バンドル
- ワークフロー ID、実行 ID、名前空間、タスクキュー
- 呼び出したコマンドまたは MCP ツール
- JSON ステータス、終了コード、または名前付きの失敗理由
- `root_cause.category`、`remediation.classification`、修復が許可されたか拒否されたか
- 最近の型付き履歴イベントと最新の永続化された失敗
- `server:info` または `/api/cluster/info` の互換性・プロトコルバージョン

このレポート形式は、ローカルのサンプルアプリ、スタンドアロンサーバーのデプロイ、Python Worker、将来のクライアント SDK の間で共通に使えます。

## 7. 公開済み成果物による検証 {#7-published-proof}

サンプルアプリの適合性ハーネスは、公開済み成果物を使ってエージェントループを検証します。MCP シャードは次を実行します。

1. 検出: JSON-RPC の `tools/list` と `list_workflows`
2. 変更: 明示的な `business_key` を使い、認証情報不要の `simple` ワークフローを選ぶ
3. 実行: `start_workflow`
4. 診断: 根本原因と修復方法のオブジェクトを返す `diagnose_workflow`
5. 修復: 安全な構造化変更または拒否としての `repair_workflow`
6. 検証: `get_workflow_result`、`diagnose_workflow`、`get_workflow_history`

この検証では、ツールのステータスコード、ワークフロー ID、完了ステータス、根本原因スキーマ ID、修復方法スキーマ ID、安全な変更スキーマ ID、件数を制限した履歴の証拠を適合性メタデータに記録します。

## 関連ページ {#related-pages}

- [AI 支援による開発](./ai-assisted-development.md)
- [エージェントツール契約](./agent-tooling-contract.md)
- [MCP ワークフローインターフェース](./mcp-workflows.md)
- [サンプルアプリ](./sample-app.md)
- [CLI コマンドリファレンス](./polyglot/cli-reference.md)
- [Worker プロトコル](./polyglot/worker-protocol.md)
- [外部実行インターフェース](./polyglot/external-execution.md)
