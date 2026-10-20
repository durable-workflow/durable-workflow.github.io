---
sidebar_position: 14
tags:
  - continue-as-new
  - history
  - message-streams
  - workflows
keywords:
  - 新しい実行への継続
  - ワークフロー履歴の増大
  - 実行の引き継ぎ
  - メッセージストリームの引き継ぎ
---

# 新しい実行への継続 {#continue-as-new}

**Continue As New** は、実行中のワークフローが新しい引数で自身を再開するパターンです。次の場合に役立ちます。

* 履歴が際限なく増えることを防ぐ。
* 反復ループや再帰的なワークフローを表す。
* 連続性を保ちつつ、長期のワークフローを小さく管理しやすい実行に分ける。

## `continueAsNew` の使用 {#using-continueasnew}

`handle()` 内から `continueAsNew(...)` を呼びます。`continueAsNew()` は正式な実行間の遷移です。

```php
use function Workflow\V2\activity;
use function Workflow\V2\continueAsNew;
use Workflow\V2\Workflow;

class CounterWorkflow extends Workflow
{
    public function handle(int $count = 0, int $max = 3)
    {
        $result = activity(CountActivity::class, $count);

        if ($count >= $max) {
            return [
                'count' => $result,
                'workflow_id' => $this->workflowId(),
                'run_id' => $this->runId(),
            ];
        }

        return continueAsNew($count + 1, $max);
    }
}
```

この例では次のように動作します。

* 各反復でアクティビティを実行します。
* 最大回数に達していなければ、増やした引数で新しい実行に継続します。
* ループが終わったときだけ最終結果を返します。

新しい実行に継続するとき:

- インスタンス ID は連鎖全体で維持され、`WorkflowStub::runId()` は最新の実行へ進みます。
- 旧実行は `completed` / `continued` で閉じ、新しい実行 ID で次の実行が直ちに始まります。
- インスタンス宛てのシグナル、クエリ、更新、運用コマンドは最新の永続実行を解決します。明示的に実行を対象とするコマンドは選択した実行に固定されます。

Core 2.7.0 と互換 Server は、実行のコマンド契約にハンドラーが宣言され、旧実行で未適用のインスタンス宛て受信シグナルを保ちます。保留中の受理済み更新とともに元のコマンド順で転送します。シグナルとコマンドの ID、引数バイト列、受信時刻は変わりません。適用済みシグナルは後続に再配信しません。次の実行に必要な業務状態は `continueAsNew()` に渡す引数に含めてください。任意のローカル状態は自動ではコピーしません。

実行宛てシグナルの対象は変更しません。終了前に適用できなければ、[シグナルの受理と終了](./signals.md#acceptance-and-closure)の明示的な拒否状態になります。旧宣言が欠落していても引き継ぎは許可されず、前の実行で明示的に終了します。

長期ループは、実行が進むたびに公開 ID を作り直さずに履歴を減らせます。

## 履歴の予算 {#history-budget}

ワークフローコードは明示的なランタイムコンテキストから現在の履歴長と継続推奨フラグを参照できます。長期ループが履歴予算の限界に達する前に、計画的に引き継げます。

```php
use function Workflow\V2\activity;
use function Workflow\V2\continueAsNew;
use Workflow\V2\Workflow;

class PollingWorkflow extends Workflow
{
    public function handle(int $iteration = 0)
    {
        $result = activity(PollActivity::class);

        if ($this->shouldContinueAsNew()) {
            return continueAsNew($iteration + 1);
        }

        return ['result' => $result, 'iteration' => $iteration];
    }
}
```

### 利用可能なメソッド {#available-methods}

| メソッド | 戻り型 | 説明 |
| --- | --- | --- |
| `$this->historyLength()` | `int` | 現在の実行の履歴イベント数 |
| `$this->historySize()` | `int` | 履歴イベントの総バイト数 |
| `$this->shouldContinueAsNew()` | `bool` | 設定した件数またはバイト数の予算を超えると `true` |

### 設定 {#configuration}

新しい実行への継続を推奨するしきい値は設定できます。

```php
// config/workflows.php
'v2' => [
    'history_budget' => [
        'continue_as_new_event_threshold' => 10000,
        'continue_as_new_size_bytes_threshold' => 5242880, // 5 MB
    ],
],
```

いずれかのしきい値を超えると `shouldContinueAsNew()` は `true` です。実行サマリーも `history_event_count`、`history_size_bytes`、`continue_as_new_recommended` を追跡し、Waterline が一覧で長期実行を示せます。

## メタデータの引き継ぎ {#metadata-carry-forward}

新しい実行は前の実行のメタデータを自動継承します。

| メタデータ | 引き継ぎ動作 |
| --- | --- |
| 検索属性 | 実行中の upsert を含む結合済みマップ全体 |
| メモ | 実行中の upsert を含む結合済みマップ全体 |
| 可視化ラベル | そのまま（開始時に1度設定） |
| ビジネスキー | そのまま |
| 互換性マーカー | 同じ Worker ビルドを対象にするよう引き継ぐ |
| メッセージカーソル位置 | [メッセージストリーム](./message-streams.md)で消費済みの受信メッセージを把握できるよう引き継ぐ |

新しい実行は継承したメタデータから開始し、検索属性とメモの upsert を続けられます。長期のポーリングワークフローも、履歴を減らす際に状態を失わず世代をまたいでメタデータを蓄積できます。

```php
use function Workflow\V2\{activity, continueAsNew, upsertMemo, upsertSearchAttributes};
use Workflow\V2\Workflow;

class PollingWorkflow extends Workflow
{
    public function handle(int $iteration = 0)
    {
        $result = activity(PollActivity::class);

        upsertSearchAttributes(['iteration' => (string) $iteration, 'status' => 'polling']);
        upsertMemo(['last_result' => $result, 'iteration' => $iteration]);

        if ($this->shouldContinueAsNew()) {
            // The new run inherits all search attributes and memo
            return continueAsNew($iteration + 1);
        }

        return ['result' => $result, 'iteration' => $iteration];
    }
}
```

人の入力やアシスタントの長期ループには、正式な `$this->inbox()` / `$this->outbox()` の[メッセージストリーム](./message-streams.md)ファサードを優先します。保留中のメッセージとカーソルは新しい実行に移り、消費済みメッセージは証拠として元の実行の履歴に残ります。
