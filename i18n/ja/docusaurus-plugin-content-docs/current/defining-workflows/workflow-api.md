---
sidebar_position: 6
title: ワークフロー API
sidebar_label: ワークフロー API
description: ワークフロー API リファレンス。
tags:
  - reference
  - workflows
  - api
keywords:
  - ワークフロー API
---

# ワークフロー API {#workflow-api}

このページは完全なリファレンスです。読みやすい解説は各機能のページを参照してください。

- [ワークフロー](./workflows.md): クラスの構造と決定的なオーケストレーションモデル。
- [アクティビティ](./activities.md): 副作用、リトライ、ルーティング。
- [ローカルアクティビティ](../features/local-activities.md): アクティビティ履歴とリトライの意味論を持つ、短い同一プロセス内処理。
- [シグナル](../features/signals.md)、[更新](../features/updates.md)、[クエリ](../features/queries.md): ワークフローへの公開契約。
- [タイマー](../features/timers.md)、[条件待機](../features/condition-waits.md)、[新しい実行への継続](../features/continue-as-new.md): 長期間の制御フロー。
- [メッセージストリーム](../features/message-streams.md): カーソルの意味論を持つ、繰り返し送られる順序付きメッセージ。

## AI 向けの詳細情報 {#more-info-for-ai}

通常は以下の折りたたみを読み飛ばして構いません。正確なシグネチャ、戻り値の契約、機械で扱うための注意点、API 全体の一覧が必要な場合に開いてください。

<details id="workflow-api-details">
<summary><b>AI 向けの詳細情報</b></summary>

**基底ワークフローオブジェクト**

```php
use Workflow\V2\Workflow;

abstract class Workflow
{
    public ?string $connection = null;
    public ?string $queue = null;

    public function workflowId(): string;
    public function runId(): string;
    public function lastChild(): ?ChildWorkflowHandle;
    public function children(): array;
    public function historyLength(): int;
    public function historySize(): int;
    public function shouldContinueAsNew(): bool;
}
```

| メンバー | 用途 | 戻り値の契約 |
| --- | --- | --- |
| `workflowId()` | 安定した公開インスタンス ID が必要な場合。 | continue-as-new をまたいで変わらないインスタンス ID 文字列。 |
| `runId()` | 現在実行中の実行 ID が必要な場合。 | 選択された実行の ID 文字列。 |
| `lastChild()` | 最後に起動した子にシグナルを送る場合。 | `ChildWorkflowHandle` または `null`。 |
| `children()` | 現在のリプレイシーケンスで見える子のハンドルが必要な場合。 | `ChildWorkflowHandle` のリスト。 |
| `historyLength()` | 件数ベースの履歴予算の指標が必要な場合。 | 現在の履歴イベント件数。 |
| `historySize()` | バイト数ベースの履歴予算の指標が必要な場合。 | 保存済み履歴のおおよそのバイト数。 |
| `shouldContinueAsNew()` | 履歴コストが増える前に実行を切り替える場合。 | 設定した履歴予算が切り替えを推奨すると `true`。 |

## 永続コマンド {#durable-commands}

静的ファサードは `Workflow\V2` 名前空間のヘルパーへ委譲します。2つの形式は等価です。

```php
use Workflow\V2\Workflow;
use function Workflow\V2\activity;

$resultFromFacade = Workflow::activity(SendReceipt::class, $orderId);
$resultFromHelper = activity(SendReceipt::class, $orderId);
```

<span id="durable-command-surface"></span>

| ファサード | ヘルパー | シグネチャ | 永続的な作用 |
| --- | --- | --- | --- |
| `Workflow::activity()` | `activity()` | `activity(string $activity, mixed ...$arguments): mixed` | アクティビティをスケジュールし、結果を待ちます。 |
| `Workflow::executeActivity()` | `activity()` | `executeActivity(string $activity, mixed ...$arguments): mixed` | `activity()` の別名。 |
| `Workflow::localActivity()` | `localActivity()` | `localActivity(string $activity, mixed ...$arguments): mixed` | 現在のワークフロー Worker 内で短いアクティビティを実行し、`execution_mode=local` 付きの履歴を記録します。 |
| `Workflow::executeLocalActivity()` | `localActivity()` | `executeLocalActivity(string $activity, mixed ...$arguments): mixed` | `localActivity()` の別名。 |
| `Workflow::child()` | `child()` | `child(string $workflow, ChildWorkflowOptions? $options = null, mixed ...$arguments): mixed` | 子を開始して結果を待ちます。最初の引数に `ChildWorkflowOptions` を渡し、親終了時ポリシー（既定 `ParentClosePolicy::Abandon`）や子のルーティングを指定できます。 |
| `Workflow::executeChildWorkflow()` | `child()` | `executeChildWorkflow(string $workflow, ChildWorkflowOptions? $options = null, mixed ...$arguments): mixed` | `child()` の別名。 |
| `Workflow::async()` | `async()` | `async(callable $callback): mixed` | 自動生成した子ワークフローとして callable を実行します。 |
| `Workflow::all()` | `all()` | `all(iterable $calls): mixed` | 並行呼び出しを待ち、反復順で結果を返します。 |
| `Workflow::parallel()` | `all()` | `parallel(iterable $calls): mixed` | `all()` の別名。 |
| `Workflow::select()` | `select()` | `select(iterable $calls): SelectionResult` | 独立した永続呼び出しを開始し、最初にコミットされた勝者と全メンバーの安定したハンドルを返します。 |
| `Workflow::await()` | `await()` | `await(callable\|string $condition, int\|string\|CarbonInterval\|null $timeout = null, ?string $conditionKey = null): mixed` | 名前付きシグナルまたは安全にリプレイできる条件を待ちます。 |
| `Workflow::awaitWithTimeout()` | `await()` | `awaitWithTimeout(int\|string\|CarbonInterval $timeout, callable\|string $condition, ?string $conditionKey = null): mixed` | 明示的なタイムアウト付きでシグナルや条件を待ちます。 |
| `Workflow::awaitSignal()` | `await()` | `awaitSignal(string $name): mixed` | 名前付きシグナルを待ちます。 |
| `Workflow::timer()` | `timer()` | `timer(int\|string\|CarbonInterval $duration): mixed` | 永続的な時刻が進むまで中断します。 |
| `Workflow::sideEffect()` | `sideEffect()` | `sideEffect(callable $callback): mixed` | 非決定的な結果を履歴に記録してリプレイします。 |
| `Workflow::uuid4()` | `uuid4()` | `uuid4(): mixed` | リプレイで安定した UUIDv4 を生成します。 |
| `Workflow::uuid7()` | `uuid7()` | `uuid7(): mixed` | リプレイで安定した UUIDv7 を生成します。 |
| `Workflow::continueAsNew()` | `continueAsNew()` | `continueAsNew(mixed ...$arguments): mixed` | 現在の実行を終え、同じインスタンスの新しい実行を開始します。 |
| `Workflow::getVersion()` | `getVersion()` | `getVersion(string $changeId, int $minSupported = WorkflowStub::DEFAULT_VERSION, int $maxSupported = 1): mixed` | 安全にリプレイできるコードバージョンを決定します。 |
| `Workflow::patched()` | `patched()` | `patched(string $changeId): mixed` | 名前付きパッチマーカーを実行が通過したか返します。 |
| `Workflow::deprecatePatch()` | `deprecatePatch()` | `deprecatePatch(string $changeId): mixed` | 古いコードを削除した後もパッチマーカーを維持します。 |
| `Workflow::upsertMemo()` | `upsertMemo()` | `upsertMemo(array $entries): void` | 索引のない実行メタデータを更新します。 |
| `Workflow::upsertSearchAttributes()` | `upsertSearchAttributes()` | `upsertSearchAttributes(array $attributes): void` | 索引付きの運用者向けメタデータを更新します。 |
| `Workflow::now()` | `now()` | `now(): CarbonInterface` | 決定的なワークフロー時刻を読みます。 |

`activity()` と `executeActivity()` は永続キュータスクをスケジュールします。`localActivity()` と `executeLocalActivity()` は現在のワークフロー Worker 内で実行し、ローカルマーカー付きの通常の履歴を記録します。アクティビティのリトライ、タイムアウト、ハートビート、キャンセルの意味論を使うべきでない値のスナップショットには `sideEffect()` を使います。複数の通常アクティビティステップに Worker セッションのアフィニティ契約が必要なら `Workflow::workerSession()` または `Workflow\V2\workerSession()` を使います。完全な契約は[アクティビティの実行モデル](/docs/features/activity-execution-model)、[ローカルアクティビティ](/docs/features/local-activities)、[Worker セッション](/docs/features/worker-sessions)を参照してください。

**タイマーヘルパー**

タイマーヘルパーは `timer()` と `Workflow::timer()` の短縮形です。

```php
use Workflow\V2\Workflow;

Workflow::seconds(30);
Workflow::minutes(5);
Workflow::hours(2);
Workflow::days(1);
Workflow::weeks(1);
Workflow::months(1);
Workflow::years(1);
```

| ヘルパー | 等価な呼び出し |
| --- | --- |
| `seconds(int $seconds)` | `timer($seconds)` |
| `minutes(int $minutes)` | `timer($minutes * 60)` |
| `hours(int $hours)` | `timer($hours * 3600)` |
| `days(int $days)` | `timer($days * 86400)` |
| `weeks(int $weeks)` | `timer($weeks * 604800)` |
| `months(int $months)` | `timer("{$months} months")` |
| `years(int $years)` | `timer("{$years} years")` |

期間が設定や入力から決まる場合は `timer()` を明示的に呼びます。固定の業務上の待機としてコードを読みやすくする場合はタイマーヘルパーを使います。

**メッセージストリーム**

ワークフローインスタンスから永続メッセージストリームを開きます。

```php
use Workflow\V2\MessageStream;
use Workflow\V2\Workflow;

final class AssistantWorkflow extends Workflow
{
    public function handle(string $targetWorkflowId): array
    {
        $message = $this->inbox('ai.user')->receiveOne();

        if ($message === null) {
            return ['status' => 'waiting'];
        }

        $reply = $this->outbox('ai.assistant')->sendReference(
            targetInstanceId: $targetWorkflowId,
            payloadReference: 'app://payloads/reply-123',
            correlationId: $this->workflowId(),
            idempotencyKey: 'reply-123',
            metadata: ['kind' => 'assistant_reply'],
        );

        return [
            'status' => 'sent',
            'stream' => $reply->stream_key,
            'sequence' => $reply->sequence,
        ];
    }
}
```

| メソッド | シグネチャ | 契約 |
| --- | --- | --- |
| `$this->messages()` | `messages(?string $streamKey = null, ?MessageService $messages = null): MessageStream` | 読み取りまたは送信用にストリームを開きます。 |
| `$this->inbox()` | `inbox(?string $streamKey = null, ?MessageService $messages = null): MessageStream` | 受信コード用の別名。 |
| `$this->outbox()` | `outbox(?string $streamKey = null, ?MessageService $messages = null): MessageStream` | 送信コード用の別名。 |
| `MessageStream::key()` | `key(): string` | ストリームキーを返します。 |
| `MessageStream::cursor()` | `cursor(): int` | この実行の永続カーソル位置を返します。 |
| `MessageStream::hasPending()` | `hasPending(): bool` | 未消費メッセージの有無を返します。 |
| `MessageStream::pendingCount()` | `pendingCount(): int` | 未消費メッセージ数を返します。 |
| `MessageStream::peek()` | `peek(int $limit = 100): Collection` | 消費せずに未処理メッセージを読みます。 |
| `MessageStream::receive()` | `receive(int $limit = 1, ?int $consumedBySequence = null): Collection` | メッセージを読み取って消費し、カーソルの前進を記録します。 |
| `MessageStream::receiveOne()` | `receiveOne(?int $consumedBySequence = null): ?WorkflowMessage` | 1件を読み取って消費します。 |
| `MessageStream::sendReference()` | `sendReference(string $targetInstanceId, ?string $payloadReference = null, MessageChannel\|string $channel = MessageChannel::WorkflowMessage, ?string $correlationId = null, ?string $idempotencyKey = null, array $metadata = [], ?DateTimeInterface $expiresAt = null): WorkflowMessage` | 別のインスタンスへ順序付きペイロード参照メッセージを送ります。 |

繰り返し送られる順序付きメッセージとカーソルにはメッセージストリームを使います。単発の外部イベントには[シグナル](../features/signals.md)、要求と応答を伴う変更には[更新](../features/updates.md)を使います。

**属性と公開契約**

```php
use Workflow\QueryMethod;
use Workflow\UpdateMethod;
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

#[Type('order-approval')]
#[Signal('approved-by', [
    ['name' => 'approvedBy', 'type' => 'string', 'allows_null' => false],
])]
final class OrderApprovalWorkflow extends Workflow
{
    private string $stage = 'waiting';

    public function handle(): void
    {
        $this->stage = Workflow::awaitSignal('approved-by');
    }

    #[QueryMethod('current-stage')]
    public function currentStage(): string
    {
        return $this->stage;
    }

    #[UpdateMethod('mark-ready')]
    public function markReady(): string
    {
        return $this->stage = 'ready';
    }
}
```

| 属性 | 対象 | 安定した契約 |
| --- | --- | --- |
| `#[Type('type-key')]` | ワークフローまたはアクティビティクラス | 言語に依存しない永続型キーを宣言します。 |
| `#[Signal('signal-name', [...])]` | ワークフロークラス、繰り返し可 | 受理するシグナル名と、任意の順序付きパラメーター契約を宣言します。 |
| `#[QueryMethod('query-name')]` | ワークフローメソッド | 安全にリプレイできるクエリ名を宣言します。省略時は PHP メソッド名を使います。 |
| `#[UpdateMethod('update-name')]` | ワークフローメソッド | 安全にリプレイできる更新名を宣言します。省略時は PHP メソッド名を使います。 |

シグナル、クエリ、更新は公開契約です。PHP メソッド名の変更が API の破壊的変更にならないよう、明示的な名前を推奨します。

**失敗の種類**

記述 API の失敗は、実行前にコマンドが拒否される場合を除き、永続ワークフローの失敗になります。

| 対象 | 一般的な失敗 | 運用上の意味 |
| --- | --- | --- |
| `activity()` | 例外、タイムアウト、リトライポリシーの上限到達。 | 失敗履歴を記録し、ワークフローのエラー処理に従います。 |
| `child()` | 子の失敗、キャンセル、強制終了、タイムアウト。 | 親は待機中のコマンドで子の失敗結果を観測します。 |
| `await()` | 条件やシグナルの成立前にタイムアウト。 | 選んだ await 形式に従って戻るか失敗します。 |
| `timer()` | 正規化後の期間入力が不正。 | 正の期間か、明示的なゼロ期間の待機を渡してください。 |
| `continueAsNew()` | 新しい実行を作成できない。 | 現在の実行が失敗した遷移の証拠を保持します。 |
| `upsertSearchAttributes()` | 属性キー、件数、総サイズが上限超過。 | 不正な索引メタデータを保存する前に実行が失敗します。 |
| `MessageStream::receive()` | 正のワークフロー履歴シーケンスがない。 | サービスコードから直接ではなく、ワークフロー実行内で受信します。 |
| `MessageStream::sendReference()` | 後続でペイロード参照、ルート、ストレージ契約が不正。 | メッセージの順序とペイロードストアの完全性は別の契約です。 |

ペイロードと履歴の上限は[構造上の制限](../constraints/structural-limits.md)を参照してください。PHP ワークフローコード外のコマンド拒否応答は [Server API リファレンス](../polyglot/server-api-reference.md)を参照してください。

**決定性のルール**

ワークフローコードは安全にリプレイできなければなりません。取り消せない処理や非決定的な処理は永続コマンドを通して実行します。

```php
use Workflow\V2\Workflow;

final class DeterministicWorkflow extends Workflow
{
    public function handle(): array
    {
        $workflowTime = Workflow::now();
        $stableId = Workflow::uuid7();
        $remoteQuote = Workflow::activity(FetchQuote::class);

        return [
            'time' => $workflowTime->toIso8601String(),
            'id' => $stableId,
            'quote' => $remoteQuote,
        ];
    }
}
```

- 分岐では実時計の代わりに `Workflow::now()` を使います。
- 直接の乱数の代わりに `Workflow::uuid4()` や `Workflow::uuid7()` を使います。
- ネットワーク呼び出し、ファイル書き込み、メール送信、外部への副作用はアクティビティ内に置きます。
- `Workflow::sideEffect()` は値を履歴に記録する必要があり、副作用そのものが業務操作ではない場合にのみ使います。
- `Workflow::getVersion()`、`Workflow::patched()`、`Workflow::deprecatePatch()` でリプレイを壊さずコードを変更します。

</details>
