---
sidebar_position: 9
---

# 子ワークフロー {#child-workflows}

現在の `Workflow\V2` は、逐次の `child()` と、子のみ、アクティビティとの混合、さらに大きいグループ内の入れ子を含む `all([...])` の fan-in バリアで永続子ワークフローをサポートします。親プロセスを動かし続けずに、1つ以上の子を永続的にスケジュールして結果を待てます。

子も固有のインスタンス ID と実行 ID を持つ通常の実行です。親への永続リンクと、その呼び出しに親が発行する安定した `child_call_id` により子として扱います。

## 名前空間の境界 {#namespace-boundary}

子ワークフローとそのハンドルから送るシグナルは親の名前空間に留まります。別のワークフロー型、言語、キューを選んでも名前空間は変わりません。同じクラスターの別の名前空間で公開された操作を永続的に呼び出すには、[サービス操作](./service-operations.md)を使ってください。

```php
use function Workflow\V2\child;
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle(string $name): array
    {
        $child = child(ChildWorkflow::class, $name);

        return [
            'parent_workflow_id' => $this->workflowId(),
            'parent_run_id' => $this->runId(),
            'child' => $child,
        ];
    }
}
```

## 検索属性と memo {#child-metadata-inheritance}

新しい子実行は、親の現在の検索属性と memo のコピーで開始します。これは子の作成時点のスナップショットであり、常時連動するリンクではありません。子は継承したキーを更新したり独自のキーを追加したりできます。後から親を更新しても子は変わらず、子を更新しても親は変わりません。変更していないコピー済み検索属性には `inherited_from_parent` が付いています。

たとえば、子は最初に `customer=customer-42` と親の memo のノートを継承します。子のステージやノートを変えても、親の値はそのままです。両者が同じ顧客値を保持する間、顧客フィルターは親と子の両方に一致します。[親子の一覧フィルター](./search-attributes.md#parent-child-list-filters)を参照してください。

[公開済み成果物の検証](https://github.com/durable-workflow/durable-workflow.github.io/issues/368#issuecomment-6362355504)では、組み込み Workflow 2.10.1 と、Python SDK 2.9.0 / Server 2.11.0 のサービスモードで、スナップショットと独立した更新を確認しています。これは明示したバージョンのメタデータ検証であり、選択済みのインストール構成を変更するものではありません。

## 現在の動作 {#current-behavior}

- `use function Workflow\V2\child;` をインポートし `child(ChildWorkflow::class, ...)` を呼びます。親を中断して永続子実行を作り、子が閉じると結果を返します。
- 失敗は親で例外となり、成功は出力を返します。キャンセルと強制終了はそれぞれ別の例外型です。
- `$this->child()` は最新、`$this->children()` はステップ順の全ハンドルを返します。`id()`、`runId()`、`callId()`、`signal()`、`signalWithArguments()` などを提供します。
- 子の `continueAsNew()` は透過的に追跡され、`runId()` は進み、`id()` は維持されます。
- `all()` は `fn () => child(...)` と `fn () => activity(...)` を混在できます。最初の子失敗で親が再開し、成功の場合は全分岐が閉じるまで待ちます。

## 並列の子バリア {#parallel-child-barrier}

1つの親ステップで複数の子をまとめて待つには `use function Workflow\V2\all;` と `use function Workflow\V2\child;` をインポートします。

```php
use function Workflow\V2\all;
use function Workflow\V2\child;
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle(): array
    {
        $children = all([
            fn () => child(FirstChildWorkflow::class),
            fn () => child(SecondChildWorkflow::class),
        ]);

        return $children;
    }
}
```

並列メンバーがすべて子なら、この子専用形式が便利です。

- 子グループ全体を1つの親ステップとして待ちます。
- 戻り値は元の配列順を維持します。
- 非成功の子の終了結果を、終了時刻が最も早いもの、同時ならインデックス最小という規則で選び、親本体に例外として投げます。

同じ fan-in にアクティビティも含むなら混合 `all([...])` を使います。両方の待機が `parallel_group_id` を共有し、Waterline は `parallel_group_kind = mixed` と表示します。より大きな `all([...])` に入れ子になっている場合、最内グループが ID を決め、`parallel_group_path` は外から内への全経路を保ちます。

### 大規模なファンアウトのコスト {#fan-out-cost}

子が完了するたびに、その処理は親の実行をロックしたまま、子の結果の記録、グループバリアの確認、親のプロジェクションの更新を行います。Workflow 2.27 以降では、この処理量は兄弟の数に応じて増えません。完了処理は他の子の履歴を読まず、一定数のクエリだけを実行します。ただし、同じ親の子の完了処理は親のロックを順番に取得し、完了処理がロックを保持している間、親は自身のワークフロータスクを実行できません。

2.27 より前は、完了のたびにすべての兄弟の履歴と実行も読み直していたため、大規模なファンアウトのすべての子を完了させる処理量は子の数の二乗に比例して増えていました。

数百の子へのファンアウトや、保留中の子の既定上限 1,000（`pending_child_count`、[構造上の制限](../constraints/structural-limits.md)を参照）に近い場合は、作業を分割してください。

- **バッチ:** 子のグループを開始し、`all([...])` で待ってから次のグループを開始します。
- **ツリー:** 各子に自身の子を開始させ、1 つの親が同時に監督する子を数百以内に抑えます。

## 識別情報の契約 {#identity-contract}

- `child()->id()` と Waterline の `target_name` は子のインスタンス ID で、子の実行連鎖を通して不変です。
- `child_call_id` は親が発行した呼び出しを表し、子が `continueAsNew()` しても不変です。
- `resume_source_id`、`child_workflow_run_id`、選択実行ルートは、その連鎖内の特定の子実行を指します。

## 子のハンドル {#child-handles}

親が永続的に子ステップへ達すると、`ChildWorkflowHandle` で呼び出しを調べられます。

```php
use Workflow\UpdateMethod;
use function Workflow\V2\child;
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle()
    {
        return child(ApprovalWorkflow::class);
    }

    #[UpdateMethod('approve-child')]
    public function approveChild(string $approvedBy): void
    {
        $this->child()?->signal('approved-by', $approvedBy);
    }
}
```

- `$this->child()` は最後に見えるハンドルか `null` を返します。
- `$this->children()` は見える全ハンドルをステップ順に返します。
- `all([fn () => child(...)])` でも呼び出し順で現れ、`$this->child()` は最後を返します。
- `runId()` はその呼び出し連鎖で親が最後に記録した `ChildRunStarted` を追い、元の `callId()` を維持して最新の子実行 ID を表示します。

## ハンドルが利用可能になる時点 {#handle-availability}

ハンドルは推測ではなく履歴に基づきます。

- 子ステップへ永続的に到達する前は `$this->child()` が `null`、`$this->children()` が空リストです。
- 親がそのステップのスケジュールや子開始履歴を記録すると、クエリ、更新、後のリプレイに見えるようになります。
- クエリリプレイは記録済み更新から子へのシグナルを送らず、コミット済み履歴が示すメモリ状態だけを復元します。

## Waterline の表示 {#waterline-visibility}

親が子を待つときは、別のタスク種別ではなく子待機として表示します。

- 親サマリーは `wait_kind = child`、`liveness_state = waiting_for_child` を報告します。
- `waits` は `kind = child`、安定した `child_call_id`、`target_name` の子インスタンス ID、`resume_source_id` の子実行 ID を含みます。
- 複数が未解決なら `open_wait_count` も表示します。
- 同じ子専用・混合バリアの待機は `parallel_group_id` を共有し、`parallel_group_kind`、`parallel_group_base_sequence`、`parallel_group_size`、`parallel_group_index` を表示します。
- 入れ子では最外から最内へ並ぶ `parallel_group_path` も表示します。
- `timeline` は同じ `child_call_id` を持つ `ChildWorkflowScheduled`、`ChildRunStarted`、`ChildRunCompleted`、`ChildRunFailed` などを含みます。
- 未解決待機と系譜は親の型付き `ChildWorkflowScheduled` / `ChildRunStarted` を優先し、`child_call_id` ごとに論理項目を1つ維持します。コピーした `workflow_links` が消えたり、子の可変 `current_run_id` が後にずれたりしても、親が記録した最新実行を追います。
- 親に型付き解決イベントがあれば、後で子の可変行がずれても解決済みを維持します。子の終端履歴や旧リンクは系譜・診断を補えますが、リプレイに必要な親の型付き履歴の代わりにはなりません。
- 解決後の系譜とエクスポートは、子の型、クラス、実行番号、状態分類、終了理由も可変行を読み直さず親履歴から得ます。
- 終端の子行やリンクがあっても、親に `ChildWorkflowScheduled`、`ChildRunStarted`、`ChildRunCompleted`、`ChildRunFailed`、`ChildRunCancelled`、`ChildRunTerminated` がなければ、Worker とクエリは `history_shape_mismatch` と記録イベント `no typed history` で停止します。Waterline は `status = unsupported`、`history_authority = unsupported_terminal_without_history`、`history_unsupported_reason = terminal_child_link_without_typed_parent_history` を表示し、可能なら停止タスクや系譜のフォールバックから識別情報を示します。
- 解決イベント後に親再開タスク行が失われた場合、詳細は `repair_needed` のまま、`workflow_wait_kind = child`、`child_call_id`、`child_workflow_run_id` 付きの合成不足タスクを表示します。手動 `repair()`、`workflow:v2:repair-pass`、Worker ループ修復は親履歴から同じ解決タスクを再作成します。
- 系譜配列は continue-as-new のリンクとともに親子関係を示し、子項目も同じ `child_call_id` を持ちます。

## 親終了時ポリシー {#parent-close-policy}

親が完了、失敗、タイムアウト、キャンセル、強制終了で閉じると、未完了の子は各呼び出しに設定された**親終了時ポリシー**に従います。

| ポリシー | 値 | 動作 |
|---|---|---|
| 独立継続 | `abandon` | 子は独立して実行を続けます。既定値です。 |
| 協調的キャンセル要求 | `request_cancellation` | 親の元のキャンセル系譜と期限を持つクリーンアップ要求を受けます。 |
| 即時キャンセル要求 | `request_cancel` | 親の終了時に cancel コマンドを送ります。 |
| 強制終了 | `terminate` | 親の終了時に terminate コマンドを送ります。 |

### 既定のポリシー {#default-policy}

`ChildWorkflowOptions` のない `child()` は常に `ParentClosePolicy::Abandon` です。ソース互換ヘルパーの `Workflow\V2\child()`、`Workflow\V2\Workflow::child()`、`Workflow\V2\Workflow::executeChildWorkflow()` は、最初の引数がオプションでなければ `parentClosePolicy` が `ParentClosePolicy::Abandon` の既定オプションを作ります。`all([...])` 内の省略時も同じです。以下のように明示的なオプションで変更します。

### ポリシーの設定 {#setting-the-policy}

`child()` の最初の引数として `ChildWorkflowOptions` を渡します。

```php
use function Workflow\V2\child;
use Workflow\V2\Enums\ParentClosePolicy;
use Workflow\V2\Support\ChildWorkflowOptions;
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle(): array
    {
        $options = new ChildWorkflowOptions(
            parentClosePolicy: ParentClosePolicy::RequestCancel,
        );

        return child(ChildWorkflow::class, $options, 'argument1');
    }
}
```

`all()` のクロージャでも同じパターンを使えます。

```php
use function Workflow\V2\all;
use function Workflow\V2\child;
use Workflow\V2\Enums\ParentClosePolicy;
use Workflow\V2\Support\ChildWorkflowOptions;

$cancelOptions = new ChildWorkflowOptions(
    parentClosePolicy: ParentClosePolicy::RequestCancel,
);

$results = all([
    fn () => child(FirstChild::class, $cancelOptions),
    fn () => child(SecondChild::class, $cancelOptions, 'arg'),
]);
```

### 仕組み {#how-it-works}

- `workflow_links` の `parent_close_policy` と `ChildWorkflowScheduled` ペイロードに保存します。
- 親がどの理由で閉じても、abandon 以外の未完了リンクを調べ、対応する要求・cancel・terminate を送ります。
- 適用時に子が既に閉じていれば何もせず、コマンドは黙ってスキップします。
- 適用はベストエフォートです。子が終端などで拒否しても親の終了に影響しません。成功なら親に `ParentClosePolicyApplied`、失敗なら `ParentClosePolicyFailed` を記録し、区別できます。
- continue-as-new はインスタンスが新実行でアクティブなためポリシーを**発動しません**。Workflow 2.26 以降は、代わりにチェーンの最後の実行が適用します。[Continue-as-new と開いている子](#continue-as-new-and-open-children)を参照してください。

### 親の終了結果の一覧 {#parent-disposition-matrix}

全終端結果で適用し、まだ稼働中や継続先に引き継いだ実行では適用しません。親を終端にする結果では共通して、abandon 以外の未完了子リンクに適用します。

| 親の結果 | 適用するか | 補足 |
|---|---|---|
| 完了 | はい | `WorkflowCompleted` 後。逐次 `child()` は子を待つため自然完了時は通常未完了の子がありませんが、安全確認として適用処理は呼びます。 |
| 失敗 | はい | 終端タスク失敗の `WorkflowFailed` 後。 |
| タイムアウト | はい | 実行・全体タイムアウトの `WorkflowTimedOut` 後。 |
| キャンセル | はい | 受理した `CancelRequested` が親を閉じた後。 |
| 強制終了 | はい | 受理した `TerminateRequested` が親を閉じた後。 |
| continue-as-new | いいえ | インスタンスは新しい実行でアクティブなままです。Workflow 2.26 以降は、継続先の実行が開いている子の監督を引き継ぎ、チェーンの最後の実行がそれらのポリシーを適用します。 |
| リセット | 現在は対象外 | v2 は独立した reset コマンドや終端結果を提供しません。将来、親を閉じたり置換したりする reset・repair は子の所有権移転を定義し、旧実行を終端にするなら所有を手放す前にポリシーを適用する必要があります。 |

### Continue-as-new と開いている子 {#continue-as-new-and-open-children}

Workflow 2.26 以降、自身が起動した子がまだ開いている間に continue-as-new した親は、同じトランザクション内でそれらの子を継続先の実行に引き渡します。組み込み実行とサービスモードの実行は同じように動作します。

- 開いている各子は、2.26 のマイグレーションが作成する `workflow_child_supervisions` テーブルに行を持ちます。すでに閉じた子は引き渡されません。
- 子リンク、子の呼び出し、シーケンス、期限、親終了時ポリシーは、開始した実行が記録したとおりに保たれます。継続先の実行がさらに continue-as-new すると、子を再び引き渡します。
- チェーンの最後の実行が完了、失敗、タイムアウト、キャンセル、強制終了で閉じると、各子のポリシーを適用し、自身の履歴に `ParentClosePolicyApplied` または `ParentClosePolicyFailed` を記録します。`abandon` は `abandon` のままです。閉じた以前の実行には新しい履歴は追加されません。
- 継続先の実行はこれらの子のハンドルを持たず、子の結果も継続先の実行には届きません。次の実行に必要なものは `continueAsNew()` の引数で渡してください。
- 引き渡された子が失敗した場合、チェーンのいずれかの実行がまだ監督している間は、開始した実行が記録したリトライポリシーに従い、同じ子の呼び出し識別子と試行回数でリトライされます。リトライ実行の `WorkflowStarted` は開始した実行を親として示し、チェーンの最後の実行がリトライ実行に親終了時ポリシーを適用します。試行回数を使い切った場合、失敗がリトライ不可の場合、またはチェーンが閉じた場合、失敗は確定します。

2.26 より前は、これらの子はチェーンが閉じた後も実行を続け、ポリシーは適用されませんでした。また、親が continue-as-new した後に失敗した子はリトライされませんでした。[2.26.0 のリリースノート](https://github.com/durable-workflow/workflow/releases/tag/2.26.0)を参照してください。

### 各ポリシーの用途 {#when-to-use-each-policy}

**Abandon**（既定）は、通知や必須のクリーンアップなど、親の結果にかかわらず完了すべき独立処理に使います。

**Request Cancellation** は `ParentClosePolicy::RequestCancellation` による協調的クリーンアップです。既存の親要求のルート識別情報と変更不可の期限を維持します。要求なしで親が閉じた場合、記録済み終了時刻から600秒の共有クリーンアップ上限を1つ記録します。繰り返し適用しても延長しません。サービス Worker の機能と契約は[協調的キャンセル](/docs/polyglot/cancellation)を参照してください。

**Request Cancel** は親終了時に子の終端 `cancel()` を適用します。名前にかかわらず、別の協調的 `requestCancellation()` は送りません。終了後にワークフローコードによるクリーンアップや補償はできません。必要な補償は親終了前に完了するか、独立クリーンアップに **Abandon** を使います。

**Terminate** は、親の補助だけを担い、親終了後は独立した価値がない子を即時に止める場合に使います。

### Waterline の表示 {#waterline-visibility-1}

Waterline は `parent_close_policy` を次に表示します。

- 親の系譜画面の子リンク。
- `ChildWorkflowScheduled` のタイムラインペイロード。
- 発動時の子の `CancelRequested` または `TerminateRequested` 履歴。理由は親の終了を示します。

## 現在の制限 {#current-limitations}

現在は次を含みません。

- 現在の子専用 `all([fn () => child(...)])`、アクティビティ専用 `all([fn () => activity(...)])`、混合 `all([fn () => child(...), fn () => activity(...)])` バリア以外の、同時実行数を制限する組み込みヘルパー。

既に到達した子ステップの永続ハンドルは使えますが、`child(...)` と `all([...])` を超える高水準の起動ハンドルや同時実行数制限 API はまだありません。

## このパターンの実行 {#run-this-pattern}

[サンプルアプリ](/docs/sample-app)のマイクロサービス調整ワークフローは、アプリ境界をまたぐ親子構成の実行可能な参照例です。

```bash
php artisan app:microservice
```

`App\Workflows\Microservice\MicroserviceWorkflow` はメイン Laravel アプリで親を実行し、同梱のマイクロサービス Worker へ子処理を送ります。実行中に Waterline を開くと、親の下に子リンクが現れ、系譜画面に終了時ポリシーが表示されます。
