---
title: ワークフローストリーム
description: PHP、Python、Rust SDK で実行スコープの永続出力ストリームを生成し、消費します。
tags:
  - service-mode
  - workflow-streams
  - php
  - python
  - rust
---

# ワークフローストリーム {#workflow-streams}

ワークフローストリームは、Durable Workflow Server が所有する、名前付きで実行スコープの出力ログです。PHP、Python、Rust は型付きの一覧、説明、購読、追加、クローズ、エラー操作を公開するため、アプリケーションで HTTP リクエストを組み立てる必要はありません。ランタイムは `durable-workflow.v2.workflow-streams.contract@1` を広告し、[機械可読の SDK マトリックス](/workflow-stream-capabilities.json)が各 SDK の正確な対応を記録します。

各ストリームは 0 から始まる単調増加のオフセットを割り当てます。ページの `next_offset` は、次に要求する範囲の先頭オフセットです。利用者への配信は少なくとも1回です。ページの冪等な効果を完了してから、`next_offset` を永続的にチェックポイントしてください。そのチェックポイントより前にクラッシュすると、項目が再配信される場合があります。

## ワークフローコードから出力する {#emit-from-workflow-code}

3つの SDK は同じ決定的コマンド境界 `record_side_effect.workflow_stream` を通じて出力します。各 SDK はタスクの永続ワークフローコマンド ID、ストリームコマンドの序数、バッチインデックスから項目の冪等性キーを導出します。Server はストリームの変更と記録した副作用を一緒にコミットします。リプレイはその副作用を消費し、同じ論理的な追加について別の永続項目を作りません。

PHP:

```php
use DurableWorkflow\Model\WorkflowStreamAppendItem;

$context->appendWorkflowStream('progress', [
    new WorkflowStreamAppendItem(['percent' => 50]),
]);
$context->closeWorkflowStream('progress');
```

Python:

```python
from durable_workflow import WorkflowStreamAppendItem

yield ctx.append_workflow_stream("progress", [
    WorkflowStreamAppendItem(payload={"percent": 50}),
])
yield ctx.close_workflow_stream("progress")
```

Rust:

```rust
let item = WorkflowStreamAppendItem::new(serde_json::json!({"percent": 50}))?;
ctx.append_workflow_stream("progress", &[item], None)?;
ctx.close_workflow_stream("progress", None)?;
```

ワークフローヘルパーは決定的な記述のためのものです。ワークフロー外のコードは、各クライアントの型付き `append` 操作を使い、独自の安定した冪等性キーを指定できます。

## 購読と再開 {#subscribe-and-resume}

購読は範囲を制限したページを読み取り、必要に応じて新しい項目を最大60秒待ちます。PHP は制限付きポーリングの間でキャンセルコールバックを受け入れます。Python は通常のタスクキャンセル、または進行中のポーリングをキャンセルする `asyncio.Event` を受け入れます。Rust の購読 Future をドロップすると、そのリクエストをキャンセルします。

| SDK | ページ操作 | 再開値 | 型付き反復 |
| --- | --- | --- | --- |
| PHP | `subscribeWorkflowStream(...)` | `WorkflowStreamPage::$nextOffset` | `iterateWorkflowStream(...)` |
| Python | `await subscribe_workflow_stream(...)` | `WorkflowStreamPage.next_offset` | `iter_workflow_stream(...)` |
| Rust | `subscribe_workflow_stream(...).await` | `WorkflowStreamPage::next_offset` | `terminal` まで制限付きページの Future を繰り返す。 |

ライフサイクル状態は `open`、`closed`、`errored` です。型付きの説明は `last_offset`、`total_items`、`pending_items`、`error_reason` も公開します。終了したストリームへの追加は拒否します。設定された保留数の上限に達すると追加は `stream_full` を返します。生成側は速度を落とすか、消費側がストリームを処理するまで待つ必要があります。

## 外部ペイロード参照 {#external-payload-references}

インライン値は共有の Avro Value エンベロープを使います。外部参照は、別のトランスポートを発明せず、各 SDK の既存ストレージ契約に従います。

| SDK | 外部参照の動作 |
| --- | --- |
| PHP | 不透明な `payload_reference` を追加し、返す。ストレージへのアップロードと取得はアプリケーションが引き続き所有する。 |
| Python | 設定済みの外部ストレージドライバーで、外部 Avro エンベロープのアップロード、整合性検査、キャッシュ、取得、デコードを行う。ドライバーがない場合、呼び出し元は不透明な `payload_reference` を追加または検査できる。 |
| Rust | 不透明な参照とそのメタデータを追加し、返す。現在の Rust SDK は外部ストレージドライバーの提供を表明していない。 |

## ワークフローストリームと組み込み MessageStream {#workflow-streams-and-embedded-messagestream}

動作が一致する部分では名前も揃えていますが、モデルは交換可能ではありません。

| 概念 | サービスモードのワークフローストリーム | 組み込み Laravel MessageStream |
| --- | --- | --- |
| アドレス | ワークフロー実行 + ストリーム名 | ワークフローインスタンス・実行 + ストリームキー |
| 方向 | ワークフロー出力のみ | ワークフローの受信箱と送信箱 |
| 最初のオフセット | 0 | 1 |
| 配信 | 少なくとも1回。消費側がチェックポイントを所有 | 少なくとも1回。エンジンがメッセージカーソルを所有 |
| 新しい実行として継続 | ストリームカーソルの移行なし | 受信箱カーソルを継続先の実行へ移行 |
| ワークフローへの入力メッセージ | 提供しない。シグナルまたは更新を使う | `inbox()->receive()` で提供 |

Waterline は両モードに1つの正規化されたテーブルを使い、モード、ライフサイクル、先頭・カーソルのオフセット、保留数、方向、エラーを表示します。サービスの出力ストリームをワークフローの受信箱として表示しません。

## 認定 {#qualification}

公開の[ワークフローストリームシナリオマニフェスト](/platform-conformance/workflow-stream-runtime-scenarios.json)は、PHP 生成側から Python・Rust 消費側への配信、生成側 Worker の再起動、消費側の再接続、ライフサイクル・バックプレッシャー・キャンセル、外部ペイロード参照について、公開成果物での実行を要求します。リリース結果には必須シナリオをすべて記録する必要があります。ソースの単体テストだけでは適合性の根拠になりません。
