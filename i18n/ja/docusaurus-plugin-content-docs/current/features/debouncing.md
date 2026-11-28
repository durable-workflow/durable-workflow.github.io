---
title: 静穏期間の後でリビジョンをまとめる
description: 永続的なシグナル待機を使い、入力が途切れた後で対象を更新します。
---

# 静穏期間の後でリビジョンをまとめる {#debouncing-and-coalescing}

## 入力が途切れるまで待つ {#quiet-window}

対象ごとに一定のワークフロー ID を使います。正のリビジョン番号の最大値を保持し、その版に更新します。この方法は途中のリビジョンを意図的に省き、最新状態への更新に使います。個別の支払いなどは、すべての要求を処理する別のフローで扱ってください。

シグナルを受け取るたびに、時間制限付きの待機を新しく開きます。結果が `null` なら静穏期間が終わりました。リプレイは記録済みの待機とタイマーに従います。

```php
use Workflow\V2\Activity;
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, await, continueAsNew};

#[Type('docs.entity-debounce')]
#[Signal('changed', [
    ['name' => 'revision', 'type' => 'int', 'allows_null' => false],
])]
final class EntityDebounce extends Workflow
{
    public function handle(
        string $entity,
        int $pending = 0,
        int $applied = 0,
        int $batches = 0,
    ): mixed {
        while (true) {
            if ($pending <= $applied) {
                $pending = max($applied, await('changed'));
            }

            while (($next = await('changed', timeout: 1)) !== null) {
                $pending = max($pending, $next);
            }

            if ($pending <= $applied) {
                continue;
            }

            activity(ApplyRevision::class, $entity, $pending);
            $applied = $pending;

            if (++$batches >= 2) {
                return continueAsNew($entity, 0, $applied, 0);
            }
        }
    }
}

#[Type('docs.apply-revision')]
final class ApplyRevision extends Activity
{
    public function handle(string $entity, int $revision): array
    {
        return ['entity' => $entity, 'revision' => $revision];
    }
}
```

新しいワーカーや後続実行が同じ定義を解決できるよう、ワークフロー型を登録します。

```php
config(['workflows.v2.types.workflows' => [
    'docs.entity-debounce' => EntityDebounce::class,
]]);
```

## 変更をアトミックに受け付ける {#embedded-intake}

```php
use Workflow\V2\WorkflowStub;

$entity = 'customer-42';
$revision = 1;
$receipt = WorkflowStub::make(EntityDebounce::class, 'refresh:'.$entity)
    ->signalWithStart('changed', [$revision], $entity);
```

受領記録は永続的な受付を確認します。アクティビティはまだ保留中の場合があります。組み込みの `signalWithStart` は、存在しないインスタンスの開始、稼働中の実行へのシグナル送信、または終了後の新規実行の作成を行います。通常の開始ポリシーでは、終了済みのインスタンスはそのままです。

## 保留中の変更を保持し、履歴を制限する {#pending-input-and-continuation}

アクティビティの実行中に受け取ったシグナルは、次の待機まで保留されます。次のバッチには新しい静穏期間があり、実行中のアクティビティは続行されます。適用済みのリビジョンと、読み取り済みで保留中のリビジョンを継続の引数に含めます。宣言済みハンドラー宛てでインスタンスを指定した保留シグナルは、後続実行に引き継がれることがあります。実行を指定したコマンドは、その実行に固定されます。

代表的な入力の集中を再現し、履歴を計測します。`SignalReceived`、`SignalApplied`、待機、タイマー、アクティビティはいずれもイベントを追加します。入力が続くと、静穏期間が終わる前に履歴が上限に達することがあります。入力を制限し、継続の余裕を確保します。Continue-as-new は実行期限を維持します。

例のアクティビティは選択したリビジョンを返します。実際の副作用には、宛先システムで `(対象, リビジョン)` などの冪等性キーを使います。シグナルが重複排除されていても、アクティビティの再試行で外部要求が繰り返されることがあります。
