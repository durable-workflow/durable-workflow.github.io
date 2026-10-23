---
sidebar_position: 9
---

# テスト {#testing}

## デプロイまたはロールバック前のリプレイ {#replay-before-deployment}

代表的な実行中のランと最近終了したランについて、選択したランのエクスポートを保存します。候補コードが通る可能性のあるアクティビティ、再試行、シグナル、更新、子ワークフロー、タイマー、バージョンマーカーの経路を含めてください。必要な continue-as-new の各世代も保存します。プルーニングされておらず、元のペイロードのバイト列とコーデックが利用できる履歴を使います。エクスポートのフラグだけでは完全性を証明できません。[保持の制約](./configuration/pruning-workflows.md)を参照してください。

### 組み込み PHP {#embedded-php-replay}

新しい JSON bundle で整数値の浮動小数点数、入れ子の浮動小数点数、ゼロの符号（`1.0` や `-0.0`）を保つには、`workflow:v2:history-export` に Workflow **2.11.4 以降**を使ってください。実際に `artisan` を実行する成果物の `composer.lock` を確認します。別途選択された構成は旧版を固定している場合があります。[通常インストールの writer 検証](https://github.com/durable-workflow/workflow/issues/912#issuecomment-6364964505)は、待機中/完了済み実行の compact/pretty 出力を、元の checksum を置き換えずに確認しています。これは writer と整合性の検証であり、候補 workflow コードの検証ではありません。

情報を失った旧 JSON は無効なままです。2.11.4 は再解釈や修復をしません。正本のストアと元の payload バイトが利用できる場合、修正済み producer で再エクスポートしてください。生成 bundle は変更せず、数値の変換や checksum/バージョンの書き換えで強制的に通さないでください。引き続き候補の replay と以下の昇格判定を実行します。

アプリケーションが所有するストアからエクスポートします。`WORKFLOW_ID` と `RUN_ID` に、選択したインスタンスとランの正確な ID を設定します。

```bash
php artisan workflow:v2:history-export "$WORKFLOW_ID" \
  --run-id="$RUN_ID" --output=replay-bundles/run.json
```

候補アプリケーションのアーティファクト内で、ワークフローのクラスと設定を読み込んで検証します。レポートはバンドルのディレクトリの外に置きます。本番環境に副作用を起こす認証情報を持たない、隔離した CI 環境を使ってください。

```bash
php artisan workflow:v2:replay-verify replay-bundles/run.json \
  --json --output=replay-one.json
php artisan workflow:v2:replay-simulate replay-bundles \
  --json --output=replay-report.json
```

終了コードがゼロ以外なら昇格をブロックします。ゼロでもレビューが必要な場合があります。次の一括レポート用の判定を `gate-replay.php` として保存し、CI で `php gate-replay.php replay-report.json` を実行します。

```php
<?php
$report = json_decode(file_get_contents($argv[1]), true, 512, JSON_THROW_ON_ERROR);
$evidence = $report['evidence'] ?? [];
$count = $evidence['bundle_count'] ?? 0;
$allowed = ($report['promotion_decision'] ?? null) === 'safe_to_promote'
    && $count > 0
    && ($evidence['missing_bundle_count'] ?? 1) === 0
    && ($evidence['replay_checked_count'] ?? 0) === $count;
exit($allowed ? 0 : 1);
```

`--skip-replay` は整合性だけを確認します。問題のない結果でも、リプレイ互換な昇格を承認する根拠にはなりません。成功が対象とするのは記録済みの経路と実行中のランの可視プレフィックスだけで、将来の分岐、業務ロジックの正しさ、ネットワーク動作ではありません。ロールバック前には、新しい Worker がすでに書き込み、古いアーティファクトが受け取る可能性のある履歴を、その古いアーティファクトでテストします。ユニットテストと実際のランタイムを使うテストも維持してください。

### サービス SDK {#service-sdk-replay}

Server イメージ、内蔵 CLI、`dw`/SDK の HTTP エクスポートは、実際の Server producer に依存します。Core 2.11.4 の公開だけでは成果物の更新や検証にはなりません。[Server #692 の独立したパッケージ固定・イメージ・インストール済み transport 検証](https://github.com/durable-workflow/server/issues/692)に従い、Core tag から HTTP 修正を推定しないでください。無効な bundle は引き続き拒否します。

**PHP:** アプリケーションのコーデック、呼び出し可能オブジェクト、イベント一覧、元の入力、キュー、記録されたタスク ID を指定して `DurableWorkflow\Worker\Replayer::replay()` を使います。`NonDeterministicWorkflow` でテストを失敗させ、期待するコマンドと結果を検証してください。[PHP のリプレイテスト](https://php.durable-workflow.com/build/testing/)を参照してください。

**Python:** 登録した候補ワークフローに対して `Replayer.replay()` または `verify_replay()` を使い、期待する結果を検証します。オブジェクトが返るだけではテストの成功になりません。イベントに入力が含まれない場合は、デコードした元の `start_input` を渡してください。Core のエクスポートでは `payloads.arguments` に保存されます。記録された型、ID、コーデックを維持します。[Python のリプレイ API](https://python.durable-workflow.com/sdk-reference/#replay-captured-histories)を参照してください。`--simulate-bundles` が確認するのは整合性であり、候補コードではありません。現行スキーマ 2 との互換性は [Python #173](https://github.com/durable-workflow/sdk-python/issues/173) で管理しています。拒否を回避するためにバージョンやチェックサムを書き換えないでください。

**Rust:** SDK **4.5.0 以降**の `testing::WorkflowEnvironment` と `WorkflowHistory` で、Server 不要のアクティビティ/ワークフローテストと自己完結したエクスポートのリプレイができます。候補の登録を再利用し、元の入力/全履歴ページを保持して、完了または期待する待機プレフィックスをアサートしてください。不一致は永続シーケンスと期待/実際のコマンドを持つ型付き `Error::NonDeterministicReplay` になります。新しい select 競合など未対応の実行経路には統合テストが必要です。[Rust テスト、決定性ルール、リプレイ例](./polyglot/rust.md#offline-testing-and-replay)を参照してください。

## 遅延を含むテストを高速に保つ {#keeping-delay-tests-fast}

タイマー遅延と永続リトライのバックオフは整数秒を使います。小数値を受け付けて切り上げる
SDK API では、100 ms は 1 秒になります。秒未満の値を使っても、リトライの多いテストは
高速になりません。

組み込みモードのテストでは `WorkflowStub::fake()` を使い、アクティビティの結果をモックし、
設定した遅延の分だけ Laravel のテスト時計を進めます。その後 `WorkflowStub::runReadyTasks()`
を呼び、期限に達したタスクを処理します。試行回数は有限にしてください。テスト専用のゼロ秒
バックオフを使えば、実時間の待機なしで回数を制限したリトライ結果を確認できます。実際の
バックオフ予定を検証するテストは別に残してください。ローカルのテスト時計を変更しても、
リモート Server の時計は進みません。

## `Workflow\V2` {#workflowv2}

`Workflow\V2\WorkflowStub::fake()` は、対応する `V2` fake 機能に対し、決定的なインラインテスト経路を提供します。

- 準備済みのワークフロー・アクティビティタスクは、キュー Worker を待たずにインライン実行します
- 入れ子の子ワークフローは、同じ fake モード内の実際の入れ子 `V2` 実行として動きます
- アクティビティのモックも、永続 `activity_executions`、タスク、履歴の行を書き込みます
- fake 経路ではバックエンド機能チェックを迂回するため、テストで `sync` を使えます
- `WorkflowStub::assertDispatched()`、`assertDispatchedTimes()`、`assertNotDispatched()`、`assertNothingDispatched()` は `V2` アクティビティの配送を検証します
- `WorkflowStub::assertSignalSent()`、`assertSignalSentTimes()`、`assertSignalNotSent()` は `WorkflowStub::signal()` または `signalWithStart()` で送った `V2` シグナルを検証します
- `WorkflowStub::assertUpdateSent()`、`assertUpdateSentTimes()`、`assertUpdateNotSent()` は `WorkflowStub::update()`、`attemptUpdate()`、`submitUpdate()` で送った `V2` 更新を検証します
- 遅延タイマータスクは期日まで永続キュー内に残ります。時刻を進めた後、`WorkflowStub::runReadyTasks()` が期日到来済みタスクをインラインで処理します

### 初回リリースのテスト範囲 {#first-release-testing-scope}

次は初回リリースの `V2` fake 機能に**含まれず**、将来の追加契約として導入される可能性があります。

- レガシー `resume()` ブリッジに相当する `V2` 機能はありません
- 子ワークフロー専用のモック・配送検証ヘルパーはありません。fake モードでも実際の入れ子 `V2` 実行として動くため、モックせず観測できる出力でテストします
- 一回の fake 実行中に仮想時刻のオフセットでシグナル・更新を注入する遅延コールバックフックはありません。代わりに明示的なシグナル・更新呼び出しの間で時刻を進め、`WorkflowStub::runReadyTasks()` を呼びます

`WorkflowStub::mock()` は実行時にこの範囲を強制します。`Workflow` サブクラスを渡すと、子ワークフローは観測できる出力でテストするよう明確に案内する `LogicException` を投げます。モック対象は `Activity` クラス（および未解決の文字列キー）だけです。

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

final class MyWorkflow extends Workflow
{
    public function handle(): array
    {
        return [
            'result' => activity(MyActivity::class, 'Taylor'),
            'workflow_id' => $this->workflowId(),
            'run_id' => $this->runId(),
        ];
    }
}
```

```php
use Workflow\V2\Testing\ActivityFakeContext;
use Workflow\V2\WorkflowStub;

public function testWorkflow(): void
{
    WorkflowStub::fake();

    WorkflowStub::mock(MyActivity::class, function (ActivityFakeContext $context, string $name): string {
        $this->assertSame('Taylor', $name);
        $this->assertSame('my-workflow-id', $context->workflowId());

        return "Hello, {$name}!";
    });

    $workflow = WorkflowStub::make(MyWorkflow::class, 'my-workflow-id');
    $workflow->start();

    $this->assertTrue($workflow->refresh()->completed());
    $this->assertSame('Hello, Taylor!', $workflow->output()['result']);

    WorkflowStub::assertDispatched(MyActivity::class, function (string $name): bool {
        return $name === 'Taylor';
    });
}
```

記録された `V2` アクティビティ配送の検証には、`WorkflowStub::assertDispatched()`、`assertDispatchedTimes()`、`assertNotDispatched()`、`assertNothingDispatched()` を使います。

タイマーを使うワークフローでは、Laravel の時刻移動ヘルパーで時刻を進め、期日到来タスクキューを明示的に処理します。

```php
use function Workflow\V2\timer;
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;

final class MyTimerWorkflow extends Workflow
{
    public function handle(): array
    {
        timer(60);

        return ['done' => true];
    }
}

public function testTimerWorkflow(): void
{
    WorkflowStub::fake();

    $workflow = WorkflowStub::make(MyTimerWorkflow::class, 'timer-workflow');
    $workflow->start();

    $this->travel(60)->seconds();

    WorkflowStub::runReadyTasks();

    $this->assertTrue($workflow->refresh()->completed());
    $this->assertSame(['done' => true], $workflow->output());
}
```

`WorkflowStub::runReadyTasks()` は期日到来済みのタスクだけを処理します。実時計を早送りしたり、将来の遅延タイマーを早く発火させたりはしません。

### fake モードでシグナルを送る {#sending-signals-in-fake-mode}

シグナル待機中のワークフローも fake モードで受信できます。`$workflow->signal(...)` を呼ぶと、エンジンは永続シグナルコマンドを記録し、ワークフロータスクを作ります。fake モードではその場で実行するため、ワークフローは同期的に再開します。

```php
use function Workflow\V2\activity;
use Workflow\V2\Attributes\Signal;
use function Workflow\V2\await;
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;

#[Signal('name-provided')]
final class ApprovalWorkflow extends Workflow
{
    public function handle(): array
    {
        $name = await('name-provided');
        $greeting = activity(GreetingActivity::class, $name);

        return ['name' => $name, 'greeting' => $greeting];
    }
}

public function testSignalWorkflow(): void
{
    WorkflowStub::fake();
    WorkflowStub::mock(GreetingActivity::class, 'Hello, Taylor!');

    $workflow = WorkflowStub::make(ApprovalWorkflow::class, 'approval-1');
    $workflow->start();

    // Workflow suspends at await('name-provided')
    $this->assertSame('waiting', $workflow->refresh()->status());

    // Send the signal — resumes the workflow inline
    $workflow->signal('name-provided', 'Taylor');

    $this->assertTrue($workflow->refresh()->completed());
    $this->assertSame('Taylor', $workflow->output()['name']);

    WorkflowStub::assertSignalSent('name-provided');
    WorkflowStub::assertSignalSentTimes('name-provided', 1);
    WorkflowStub::assertSignalNotSent('other-signal');
}
```

テスト中に送ったシグナルを、`WorkflowStub::assertSignalSent()`、`assertSignalSentTimes()`、`assertSignalNotSent()` で検証します。コールバック形式はインスタンス ID とシグナル引数を受け取ります。

```php
WorkflowStub::assertSignalSent(
    'name-provided',
    fn (string $instanceId, string $name): bool =>
        $instanceId === 'approval-1' && $name === 'Taylor'
);
```

### fake モードで更新を送る {#sending-updates-in-fake-mode}

更新も fake モードではインラインで適用します。`$workflow->attemptUpdate(...)` または `$workflow->update(...)` を呼ぶと、エンジンは永続更新コマンドを記録し、更新を適用するワークフロータスクを作成して、その場で実行します。

```php
use Workflow\UpdateMethod;
use Workflow\V2\Attributes\Signal;
use function Workflow\V2\await;
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;

#[Signal('done')]
final class SettingsWorkflow extends Workflow
{
    private bool $enabled = false;

    public function handle(): array
    {
        await('done');

        return ['enabled' => $this->enabled];
    }

    #[UpdateMethod]
    public function toggle(bool $enabled): array
    {
        $this->enabled = $enabled;

        return ['enabled' => $this->enabled];
    }
}

public function testUpdateWorkflow(): void
{
    WorkflowStub::fake();

    $workflow = WorkflowStub::make(SettingsWorkflow::class, 'settings-1');
    $workflow->start();

    $this->assertSame('waiting', $workflow->refresh()->status());

    $result = $workflow->attemptUpdate('toggle', true);

    $this->assertTrue($result->accepted());

    WorkflowStub::assertUpdateSent('toggle');
    WorkflowStub::assertUpdateSentTimes('toggle', 1);
    WorkflowStub::assertUpdateNotSent('other-update');

    // Complete the workflow
    $workflow->signal('done');
    $this->assertTrue($workflow->refresh()->completed());
    $this->assertTrue($workflow->output()['enabled']);
}
```

送信した更新を、`WorkflowStub::assertUpdateSent()`、`assertUpdateSentTimes()`、`assertUpdateNotSent()` で検証します。コールバック形式はインスタンス ID と更新引数を受け取ります。

```php
WorkflowStub::assertUpdateSent(
    'toggle',
    fn (string $instanceId, bool $enabled): bool =>
        $instanceId === 'settings-1' && $enabled === true
);
```

### 開始結果と重複開始ポリシーをテストする {#testing-start-outcomes-and-duplicate-start-policy}

例外を投げずに重複開始の動作を検証するには、`attemptStart()` を使います。`StartResult` は型付き結果ヘルパーを公開します。

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

public function testRejectDuplicateStart(): void
{
    WorkflowStub::fake();
    WorkflowStub::mock(MyActivity::class, 'result');

    $workflow = WorkflowStub::make(MyWorkflow::class, 'order-123');

    $first = $workflow->start('Taylor');
    $this->assertTrue($first->startedNew());

    $second = WorkflowStub::load('order-123');
    $duplicate = $second->attemptStart('Taylor');

    $this->assertTrue($duplicate->rejected());
    $this->assertTrue($duplicate->rejectedDuplicate());
    $this->assertSame('instance_already_started', $duplicate->rejectionReason());
}
```

既存アクティブ実行を返すポリシーは、`StartOptions::returnExistingActive()` を渡してテストします。

```php
public function testReturnExistingActiveStart(): void
{
    WorkflowStub::fake();

    $workflow = WorkflowStub::make(MySignalWorkflow::class, 'order-123');
    $workflow->start();

    $this->assertSame('waiting', $workflow->refresh()->status());

    $second = WorkflowStub::load('order-123');
    $result = $second->attemptStart(StartOptions::returnExistingActive());

    $this->assertTrue($result->accepted());
    $this->assertTrue($result->returnedExistingActive());
    $this->assertSame($workflow->runId(), $result->runId());
}
```

両ポリシーとも永続コマンドと履歴イベントを記録するため、詳しい検証には `WorkflowCommand`・`WorkflowHistoryEvent` 行もアサートできます。

### 履歴の使用量上限をテストする {#testing-history-budget}

`HistoryBudget` フィールド（`history_event_count`、`history_size_bytes`、`continue_as_new_recommended`）は、実行概要の投影と `RunDetailView` から利用できます。ワークフローコードでは、`Workflow` 基底クラスが `$this->historyLength()`、`$this->historySize()`、`$this->shouldContinueAsNew()` として公開します。

```php
use Workflow\V2\Workflow;

final class LongRunningWorkflow extends Workflow
{
    public function handle(): void
    {
        while (true) {
            // ... process work ...

            if ($this->shouldContinueAsNew()) {
                Workflow::continueAsNew($this->carryForwardState());
            }
        }
    }
}
```

履歴の使用量上限のしきい値をテストするには、低い値に設定し、推奨が出ることを検証します。

```php
public function testHistoryBudgetRecommendsContinueAsNew(): void
{
    config()->set('workflows.v2.history_budget.continue_as_new_event_threshold', 5);

    WorkflowStub::fake();

    // Run a workflow that produces enough history events to trip the threshold
    $workflow = WorkflowStub::make(ManyActivitiesWorkflow::class, 'budget-test');
    $workflow->start();

    $summary = $workflow->summary();
    $this->assertTrue($summary->continue_as_new_recommended);
}
```

## レガシー `Workflow\WorkflowStub` {#legacy-workflowworkflowstub}

:::warning レガシー v1

この節の例は v1 ランタイム（`Workflow\Workflow`、`use function Workflow\activity`、`yield` を使うジェネレータースタイルの `execute()`、`Workflow\Models\StoredWorkflow`）を使用します。移行中に v1 ワークフローを検証するテスト用に保持してください。新しいテストは、上記のとおり `Workflow\V2\WorkflowStub::fake()`、`Workflow\V2\Workflow`、直線的な `handle()` メソッドを使うべきです。

:::

### ワークフロー {#workflows}

テスト環境でワークフローを同期実行し、アクティビティと子ワークフローをモックして、実装を実行せずに期待する動作と出力を定義できます。

```
use function Workflow\activity;
use Workflow\Workflow;

class MyWorkflow extends Workflow
{
    public function execute()
    {
        $result = yield activity(MyActivity::class);

        return $result;
    }
}
```

上記は、まず `WorkflowStub::fake()` を呼び、アクティビティをモックしてテストできます。

```
public function testWorkflow()
{
    WorkflowStub::fake();

    WorkflowStub::mock(MyActivity::class, 'result');

    $workflow = WorkflowStub::make(MyWorkflow::class);
    $workflow->start();

    $this->assertSame($workflow->output(), 'result');
}
```

` WorkflowStub::mock()` に結果値の代わりにコールバックを渡すこともできます。

コールバックにはワークフローの `$context` と現在のアクティビティの引数も渡します。

```
public function testWorkflow()
{
    WorkflowStub::fake();

    WorkflowStub::mock(MyActivity::class, function ($context) {
        return 'result';
    });

    $workflow = WorkflowStub::make(MyWorkflow::class);
    $workflow->start();

    $this->assertSame($workflow->output(), 'result');
}
```

`assertDispatched`、`assertNotDispatched`、`assertNothingDispatched` で、どのアクティビティ・子ワークフローが配送されたかを検証できます。

```
WorkflowStub::assertDispatched(MyActivity::class);

// Assert the activity was dispatched twice...
WorkflowStub::assertDispatched(MyActivity::class, 2);

WorkflowStub::assertNotDispatched(MyActivity::class);

WorkflowStub::assertNothingDispatched();
```

`assertDispatched`・`assertNotDispatched` にクロージャを渡すと、指定した真偽判定を満たすアクティビティ・子ワークフローが配送されたことを検証できます。引数はコールバックへ渡されます。

```
WorkflowStub::assertDispatched(TestOtherActivity::class, function ($string) {
    return $string === 'other';
});
```

### 時間を飛ばす {#skipping-time}

`$this->travel()`・`$this->travelTo()` でシステム時刻を操作し、時間に依存するワークフローをシミュレートできます。タイムアウト、遅延、その他の時間依存ロジックをテストできます。

```
use function Workflow\{activity, timer};
use Workflow\Workflow;

class MyTimerWorkflow extends Workflow
{
    public function execute()
    {
        yield timer(60);

        $result = yield activity(MyActivity::class);

        return $result;
    }
}
```

上記ワークフローは、アクティビティ実行前に 60 秒待機します。レガシーランタイムでは `$this->travel()` と `$workflow->resume()` で待機を飛ばせます。

```
public function testTimeTravelWorkflow()
{
    WorkflowStub::fake();

    WorkflowStub::mock(MyActivity::class, 'result');

    $workflow = WorkflowStub::make(MyTimerWorkflow::class);
    $workflow->start();

    $this->travel(120)->seconds();

    $workflow->resume();

    $this->assertSame($workflow->output(), 'result');
}
```

`$this->travel()` と `$this->travelTo()` は内部で `Carbon::setTestNow()` を使います。

### アクティビティ {#activities}

アクティビティのテストは Laravel ジョブと同様です。手動でアクティビティを作り、`handle()` を呼びます。

```
$workflow = WorkflowStub::make(MyWorkflow::class);

$activity = new MyActivity(0, now()->toDateTimeString(), StoredWorkflow::findOrFail($workflow->id()));

$result = $activity->handle();
```

レガシーアクティビティも、ランタイムの `handle()` ジョブメソッドで実行されることに注意してください。`Workflow\V2` でも、ユーザー定義のワークフロー・アクティビティコードは `handle()` に置きます。
