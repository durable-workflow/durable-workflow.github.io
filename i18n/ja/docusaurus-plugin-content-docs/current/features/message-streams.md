---
sidebar_position: 18
tags:
  - message-streams
  - workflows
  - continue-as-new
  - AI
keywords:
  - メッセージストリーム
  - ワークフローの inbox
  - ワークフローの outbox
  - MessageStream
  - 繰り返し送るワークフローメッセージ
---

# メッセージストリーム {#message-streams}

メッセージストリームは、人の入力ループ、アシスタントの応答、ワークフロー間通知など、リプレイと continue-as-new を越えて保持する順序付きメッセージを繰り返し扱う v2 の記述 API です。

このページは埋め込み Laravel の inbox/outbox API を説明します。Server が所有する[ワークフローストリーム](/docs/polyglot/workflow-streams/)も意味が一致する箇所ではストリーム、オフセット、保留数、ライフサイクル、エラーという名前を使いますが、出力専用です。サービスモードに受信メッセージや continue-as-new のカーソル転送を追加するものではありません。

ワークフローでは正式なファサードを使います。

- `$this->inbox('stream-key')`
- `$this->outbox('stream-key')`
- `$this->messages('stream-key')`
- `Workflow\V2\MessageStream`

ワークフローコードから `workflow_messages` やカーソルの行を直接書き込まないでください。安定した契約はファサードです。下位のメッセージサービスはパッケージ・ランタイム統合用です。

:::warning Workflow 2.20.3 より前のメッセージストリーム

ワークフローコードは、後続のワークフロータスクのたびに、またクエリのたびにリプレイされます。Workflow 2.20.0 までのリリースでは、`outbox()->sendReference()` はリプレイのたびに送信メッセージと受信メッセージを新たに書き込み、`inbox()->receive()` と `receiveOne()` はリプレイ時に別のメッセージを返したり、何も返さなかったりすることがあります（[workflow#1010](https://github.com/durable-workflow/workflow/issues/1010)）。Workflow 2.20.1 は送信と受信をリプレイ用に記録し、クエリによるメッセージの
書き込みや消費を防ぎます。空の受信と、ステップをまたいで保持したストリームには、
以下で説明する 2.20.3 の追加のリプレイ修正が必要です。

- 以前のリリースで重複した行は削除されません。論理的な送信ごとに `reply:{turn}` のような安定した `idempotencyKey` を与え、以前のリリースが書き込んだストリームを消費するときは `idempotency_key` で重複を除いてください。以前のリリースが誤ったステップで消費したメッセージは、消費済みのままです。
- シグナル、更新、すべてのストリームは一つのメッセージカーソルを共有します。
  2.20.2 以前では、シグナル、更新、別のストリームでの受信によってカーソルが
  保留中のメッセージより先へ進み、それらを隠すことがあります
  （[workflow#1011](https://github.com/durable-workflow/workflow/issues/1011)）。
  これらのバージョンでのシグナル順序の問題には、メッセージより先にシグナルを
  送り、シグナルや条件がメッセージの存在を示した後でのみ受信してください。

:::

## ストリームのアップグレードとロールバック {#stream-upgrades}

Workflow 2.20.3 では、共有カーソルが `receive()`、`receiveOne()`、`peek()`、
`pendingCount()`、`hasPending()` から保留メッセージを隠すことはなくなりました。
受信は引き続き連番順とバッチの上限に従います。アップグレード後、受信ループは、
共有カーソルが以前隠していた古い保留メッセージを、新しいメッセージより先に
返すことがあります。

リプレイ中の受信は、元のステップが消費した内容を返します。元の呼び出しが何も
見つけなかった場合、リプレイでも何も返しません。初めて実行される更新ハンドラーは
引き続き受信できます。プロパティに保持したストリームは、ストリームを開いた
ステップではなく、現在のワークフローステップで受信を記録するようになりました。
以前のリリースでストリームを開いたステップに記録された受信も、引き続き
リプレイできます。

埋め込みアプリケーションを 2.20.3 より前のバージョンに戻す前に、新しいパッケージが
書き込んだ履歴で[リプレイテストの基準](../testing.md#replay-before-deployment)を
満たしてください。以前のバージョンは保持したストリームの受信を開いたステップで
検索するため、その実行のリプレイ結果が変わる可能性があります。ロールバックすると、
共有カーソル、空の受信のリプレイ、fake タスク処理の精度の不具合も再発します。
[タグの互換性に関する注記](https://github.com/durable-workflow/workflow/blob/2.20.3/CHANGELOG.md#2203---2026-11-04)を参照してください。

[workflow#1024](https://github.com/durable-workflow/workflow/issues/1024) のクエリ制限は
残っています。クエリはハンドラーを誤ったステップでリプレイするため、更新ハンドラーが
受信したメッセージに対して何も返さない場合があります。クエリはメッセージ行を
変更しません。ワークフロー自身のリプレイと完了時の出力は、引き続きハンドラーが
受信した内容を返します。

## メッセージの受信 {#receiving-messages}

永続カーソルを進めずに保留中の受信メッセージを調べるには `peek()` を使います。消費してカーソルの前進を履歴に記録する準備ができたら `receive()` または `receiveOne()` を使います。

```php
use Workflow\V2\Workflow;

final class ApprovalInboxWorkflow extends Workflow
{
    public function handle(): array
    {
        $pending = $this->inbox('approval.requests')->peek(limit: 10);

        if ($pending->isEmpty()) {
            return ['status' => 'waiting'];
        }

        $message = $this->inbox('approval.requests')->receiveOne();

        return [
            'status' => 'received',
            'payload_reference' => $message?->payload_reference,
            'correlation_id' => $message?->correlation_id,
        ];
    }
}
```

`peek()` は読み取り専用です。`receive()` と `receiveOne()` は消費済みとし、現在の実行の永続カーソルを進めます。この前進は履歴上の事実なので、リプレイ、Waterline のエクスポート、continue-as-new の引き継ぎが消費済み入力を把握できます。

## 参照の送信 {#sending-references}

順序付きの送信メッセージを公開するには `outbox(...)->sendReference(...)` を使います。メッセージテーブルはルーティングメタデータとペイロード参照を保存し、大きな内容やアプリ所有の内容はアプリのペイロードストアに保持します。

```php
use Workflow\V2\Workflow;

final class AssistantReplyWorkflow extends Workflow
{
    public function handle(string $targetWorkflowId, string $replyReference): array
    {
        $message = $this->outbox('ai.assistant')->sendReference(
            targetInstanceId: $targetWorkflowId,
            payloadReference: $replyReference,
            correlationId: $this->workflowId(),
            metadata: ['kind' => 'assistant_reply'],
        );

        return [
            'status' => 'sent',
            'stream' => $message->stream_key,
            'sequence' => $message->sequence,
        ];
    }
}
```

履歴を小さく保ち、永続メッセージの順序とは別にペイロードストアを検証できます。

## 新しい実行への継続 {#continue-as-new}

メッセージストリームはインスタンスを中心とします。continue-as-new 時、保留中の受信メッセージは次の実行に移り、カーソル位置は引き継がれ、消費済みメッセージは履歴の証拠として元の実行に残ります。Workflow 2.20.1 以前はカーソルだけを移していました。continue-as-new の時点で保留中だったメッセージは終了した実行に残り、次の実行には届きませんでした（[workflow#1018](https://github.com/durable-workflow/workflow/issues/1018)、2.20.2 で修正）。これらのリリースでは、`continueAsNew()` を呼ぶ前に保留中のメッセージを受信するか、引き継ぎ後も残す必要がある入力を[シグナル](./signals.md)として送信してください。実行がまだ適用していない受理済みシグナルは次の実行に移ります。

そのため長期ワークフローは、公開メッセージルートを維持して履歴を減らせます。

```php
use function Workflow\V2\continueAsNew;
use Workflow\V2\Workflow;

final class HumanInputLoopWorkflow extends Workflow
{
    public function handle(int $iteration = 0): array
    {
        $message = $this->inbox('human.replies')->receiveOne();

        if ($message === null) {
            return ['status' => 'waiting', 'iteration' => $iteration];
        }

        if ($this->shouldContinueAsNew()) {
            return continueAsNew($iteration + 1);
        }

        return [
            'status' => 'processed',
            'iteration' => $iteration,
            'payload_reference' => $message->payload_reference,
        ];
    }
}
```

呼び出し元は同じインスタンス ID を使い、どの実行が現在カーソルを所有しているか知る必要はありません。

## 記述ルール {#authoring-rules}

- `ai.assistant`、`human.replies`、`approval.requests` など意味を表すキーを使い、公開契約の一部として扱います。
- 調査には `peek()`、永続的な消費には `receive()` / `receiveOne()` を使います。
- 送信には `sendReference()` を使い、大きなペイロードはアプリのストアに保存して参照を渡します。
- アプリコードは `Workflow::inbox()`、`Workflow::outbox()`、`MessageStream` を使い、`MessageService`、`WorkflowMessage`、カーソル行への書き込みに依存する記述を避けます。
- 単発の外部イベントには[シグナル](./signals.md)、要求・応答の状態変更には[更新](./updates.md)、順序付きメッセージの繰り返しとカーソルにはメッセージストリームを使います。

## このパターンの実行 {#run-this-pattern}

[サンプルアプリ](/docs/sample-app)の旅行エージェントワークフローは、この inbox/outbox の実行可能な参照例です。

```bash
php artisan app:ai
```

`App\Workflows\Ai\AiWorkflow` は大きなアシスタントのペイロードをアプリ所有の `ai_workflow_messages` に保存し、`ai.assistant` outbox に永続参照だけを公開します。返信は `receive` 更新を通じて対応する inbox ストリームへ届きます。ページとクラスを並べて読むと、上の例と同じ `inbox()`、`outbox()`、`sendReference()` を端から端まで確認できます。
