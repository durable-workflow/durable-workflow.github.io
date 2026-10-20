---
sidebar_position: 6
---

# 条件待機 {#condition-waits}

`await($condition, $conditionKey = null)` は安全にリプレイできる条件待機を提供します。更新、アクティビティ結果、子の結果などの永続入力から導かれたワークフロー状態だけに述語が依存する場合に使います。名前付き外部シグナルの値を直接受け取りたい場合は `await('name')` を呼びます。[シグナル](./signals.md)を参照してください。

条件待機を進めるには、シグナルによる変更メソッドではなく更新メソッドを使います。

```php
use Workflow\UpdateMethod;
use function Workflow\V2\await;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

#[Type('approval-workflow')]
class MyWorkflow extends Workflow
{
    private bool $ready = false;

    public function handle(): void
    {
        await(fn () => $this->ready, 'approval.ready');
    }

    #[UpdateMethod]
    public function setReady(bool $ready = true): array
    {
        $this->ready = $ready;

        return ['ready' => $this->ready];
    }
}
```

任意の条件キーは、待機を識別する安定した URL 安全な運用者向けラベルです。リプレイは記録済みキーを検証し、後のデプロイで同じワークフローステップを別の述語に誤って再利用することを防ぎます。デプロイをまたいで安全にワークフローを変更する方法は[バージョニング](./versioning.md)を参照してください。

タイムアウト付き条件待機は[シグナル + タイマー](./signal+timer.md)を参照してください。

**重要:** `await()` はワークフロー内でのみ使い、アクティビティ内では使わないでください。
