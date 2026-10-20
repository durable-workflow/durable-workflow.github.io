---
sidebar_position: 2
---

import QuerySimulator from '@site/src/components/QuerySimulator';

# クエリ {#queries}

クエリは実行に影響を与えずに現在の状態を取得でき、監視やデバッグに使えます。

## 安全にリプレイできるクエリメソッド {#replay-safe-query-methods}

クエリは現在選択されている実行のコミット済み履歴をリプレイし、復元したオブジェクトの注釈付きメソッドを呼びます。受理済みで未適用のシグナルや更新を暗黙に適用しません。

```php
use Workflow\QueryMethod;
use Workflow\V2\Workflow;
use function Workflow\V2\await;

final class ApprovalWorkflow extends Workflow
{
    private string $stage = 'booting';

    public function handle(): void
    {
        $this->stage = 'waiting-for-approval';

        await('approved-by');

        $this->stage = 'approved';
    }

    #[QueryMethod('current-stage')]
    public function currentStage(): string
    {
        return $this->stage;
    }

    #[QueryMethod('starts-with')]
    public function startsWith(string $prefix): bool
    {
        return str_starts_with($this->stage, $prefix);
    }
}
```

公開インスタンス ID から現在の実行を参照します。

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$workflow->currentStage(); // "waiting-for-approval"
$workflow->query('starts-with', 'waiting'); // true
$workflow->queryWithArguments('starts-with', ['prefix' => 'waiting']); // true
```

過去や選択済みの1つの実行を明示的に固定するには `loadRun($runId)` を使います。

```php
$selectedRun = WorkflowStub::loadRun($runId);

$selectedRun->currentStage();
```

クエリの動作:

- コミット済み履歴のみを参照し、状態を変更しないため安全にリプレイできます。
- 引数は注釈付きメソッドに渡されます。PHP メソッド名の変更後も呼べるよう `#[QueryMethod('public-name')]` で安定した公開名を宣言します。
- `load($instanceId)` は最新の永続実行を、`loadRun($runId)` は特定の実行を対象にします（continue-as-new 前の調査に便利です）。
- 受理済みで未適用のシグナル・更新はコマンド履歴には見えますが、Worker が `SignalApplied` / `UpdateApplied` を記録するまで適用済み状態には含みません。

`QueryMethod` 注釈でクエリメソッドを定義します。任意の文字列引数で公開名を固定し、PHP メソッド名の変更後も維持できます。

```php
use Workflow\QueryMethod;
use Workflow\V2\Workflow;

final class MyWorkflow extends Workflow
{
    private bool $ready = false;

    #[QueryMethod('is-ready')]
    public function getReady(): bool
    {
        return $this->ready;
    }
}
```

ワークフローインスタンス上でメソッドを呼ぶと、そのデータを返します。

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$ready = $workflow->getReady();
$sameReady = $workflow->query('is-ready');
```

呼び出し元が位置引数リストや名前付きマップを持っている場合は `queryWithArguments()` を使います。

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$workflow->queryWithArguments('starts-with', [
    'prefix' => 'wait',
]);
```

Waterline は選択実行のクエリ契約を使います。ダッシュボードはシグナルや更新とともに `declared_query_targets[*]` を表示しますが、実行操作は `can_query = true` の場合のみ表示します。選択実行・現在実行のクエリ操作は JSON の `arguments` を `/waterline/api/instances/{instanceId}/queries/{query}` または `/waterline/api/instances/{instanceId}/runs/{runId}/queries/{query}` に送ります。メソッド呼び出し前にリプレイが必要なため、読み込み可能な定義が必要です。永続ターゲットがあっても定義がなければ、詳細は `can_query = false` と `query_blocked_reason = workflow_definition_unavailable` を示し、POST は `blocked_reason = workflow_definition_unavailable` で HTTP `409 Conflict` を返します。不完全なスナップショットしかなく現在のビルドで補完できなければ `declared_contract_source = unavailable` です。残存ターゲットは診断メタデータとして表示しますが、互換ビルドが不足契約を保存するまで名前付きクエリ引数は `422` で拒否します。

公開 Webhook ブリッジは Waterline の外にも同じ安全なクエリを提供します。

```text
POST /webhooks/instances/{instanceId}/queries/{query}
POST /webhooks/instances/{instanceId}/runs/{runId}/queries/{query}
```

Webhook ルートは Waterline と同じ JSON `arguments` を受け取り、成功時に型付き JSON `result` を返します。不正引数は `422` と `validation_errors`、リプレイ停止は `409` と `blocked_reason` の同じ形式です。現在の定義を読める場合、永続的な `#[QueryMethod('public-name')]` と基になる PHP メソッド名のどちらでも指定できます。HTTP 成功応答は `query_name` を永続公開名に正規化し、外部呼び出し元がメソッド名変更の詳細に依存しないようにします。

<QuerySimulator />

**重要:** クエリはシグナルと異なり、ワークフローの実行を進めません。
