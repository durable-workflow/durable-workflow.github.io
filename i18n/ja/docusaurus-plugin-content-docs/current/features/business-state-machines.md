---
sidebar_position: 12
title: 業務ステートマシン
description: 組み込み Laravel ワークフローで、共有の業務状態、連携ごとのポリシープロファイル、入れ子の子マシン、保持される補償を扱う実験的な遷移プロトコル。
---

# 業務ステートマシン {#business-state-machines}

:::warning 実験的

`Workflow\V2\StateMachine` API と、それが使用する確認付きの子開始（`Workflow::startChild()`）および `DurableScope::reserveChild()` は実験的です。これらは Workflow 2.29.0 から実験的に提供され、パッケージの安定性保証の対象外であり、マイナーリリースで変更される可能性があります。[安定性レベル](../compatibility.md#stability-levels)における `experimental` のサーフェスです。それが使用する保持型補償スコープ API のその他の部分は、Workflow 2.33.0 から安定版です。 子バインディングのカタログ、遷移の説明、`MachineInspection` は Workflow 2.41.0 で追加されました。

このページの例は、合成プロバイダーを使用するリポジトリのソース例です。インストール済みパッケージや実際のプロバイダーでの適格性確認ではありません。このページのいかなる内容も、次のことを意味しません。

- 進行中の実行を新しい定義、プロファイル、ルール、ハンドラーのバージョンへ移行すること
- 再帰的な子マシンや共有の子マシン
- 実際の決済、配送業者、倉庫のプロバイダーに対する保証
- 業務ステートマシン機能が完成している、または安定版リリースがあること

:::

このガイドでは、`Workflow\V2\Workflow` を使用する組み込み Laravel ワークフロー向けの、オプションの業務遷移プロトコルを説明します。このプロトコルは、アクティビティ、子ワークフロー、永続待機、リプレイ、[Saga](sagas.md) の補償という既存のプリミティブで構成されています。既存のワークフローと `Workflow\States\StateMachine` は変更されません。

## 使用する場面 {#when-to-use-it}

業務状態の意味は共通でも、その状態に到達する方法が連携ごとに異なる場合に、このプロトコルを使用します。

- **共有されるマシンの意味。** 1つの `MachineDefinition` が、状態の意味、遷移の識別子、必須の不変条件、名前付きの子スロットを宣言します。
- **連携ごとのポリシー。** 各 `PolicyProfile` は、その定義の範囲内で、エッジ、ハンドラーのバージョン、名前付き条件を選択します。ある連携では遷移の前に外部操作を必須にでき、別の連携ではすでに証拠を提供済みで作業をスキップできます。
- **入れ子の子マシン。** Order は、宣言された状態にある間、Shipment マシンをホストできます。バインディングは、再試行、状態の変更、Worker の再起動をまたいで、子の元の識別子を維持します。
- **保護された業務上の決定。** 新しい業務状態は、期待される状態、リビジョン、受理されたキャンセルを確認する、アプリケーション所有の境界を通じてコミットされます。
- **保持される補償。** 保持型の補償スコープにより、義務はそれを作成した実行よりも長く存続できます。

Saga を使う1つのワークフローで十分な場合は、[Saga](sagas.md) と[子ワークフロー](child-workflows.md)を直接使用してください。

## 遷移の契約 {#the-transition-contract}

マシンや連携にかかわらず、すべての遷移ハンドラーは同じ4つのメソッドを実装します。

```php
interface TransitionStep
{
    public function canTransition(TransitionContext $context): bool;
    public function canExecute(TransitionContext $context): bool;
    public function execute(TransitionContext $context): ExecutionReceipt;
    public function compensate(TransitionContext $context, ExecutionReference $originalExecution): void;
}
```

- `canTransition()` は、ターゲットにすでに到達しているかどうかに答えます。記録されたターゲット評価の純粋な射影です。
- `canExecute()` は、作業が許可されているかどうかに答えます。記録された許可評価の純粋な射影です。
- `execute()` は、記録されるアクティビティまたは永続待機をオーケストレーションし、`ExecutionReceipt` を返します。レシートは作業の受領を示すものであり、コミットの準備が整ったことを確立するものではありません。
- `compensate()` は元の `ExecutionReference` を受け取ります。必要な効果、またはそれが存在しないことを検証してから戻ってください。不明な作業や保留中の作業は、待機するか明示的に失敗する必要があり、決して正常に戻ってはいけません。

記録されたスナップショットから2つのガードを直接実装するには、`AssessedTransitionStep` を継承します。ランナーは、記録された評価と矛盾するカスタムガードを拒否します。

## ランナーによる遷移の実行 {#how-the-runner-executes-a-transition}

`TransitionRunner::run()` は、ワークフロー、固定されたプロファイル、元の `ExecutionReference`、イベント、`TransitionRuntime`、閉じたハンドラーレジストリを受け取ります。その後、次の処理を行います。

1. イベントと遷移元の状態に対応する一意のエッジを選択します。候補がなければ `Unavailable`、複数あれば `Ambiguous` を返します。
2. 記録された `before` スナップショットを要求し、プロファイルに定義がある場合は、その共有不変条件を確認します。不変条件が満たされなければ `Blocked`、不明なら `Unknown` を返します。
3. ターゲットガードを確認します。ターゲットが満たされている場合は作業をスキップしますが、保護されたコミットは引き続き通ります。スキップしても、すでに存在する外部効果の所有権を引き受けることはありません。ターゲットが不明なら `Unknown` を返します。
4. エッジが作業を宣言していない場合は `Pending` を返します。そうでなければ、実行ガードを確認し、ライブの受け入れを記録します。拒否なら `Blocked`、不明な応答なら `Unknown` を返します。
5. 元のステップの補償をネイティブ Saga に登録してから、`execute()` を呼び出します。
6. 新しい `after` スナップショットを要求し、不変条件とターゲットを再度確認します。遷移元の状態またはリビジョンが古ければ `Conflict`、結果が満たされなければ `Pending`、不明なら `Unknown` を返します。ターゲットが満たされていれば、保護されたコミットに進みます。
7. ランタイムを通じてコミットします。ランタイムは `Committed`、`Conflict`、`CancellationRequested` のいずれかを報告します。

`TransitionStatus` の値は処理結果であり、業務状態のカタログではありません。ランナーは遷移全体を再試行することはなく、ブロックされた遷移を自ら補償することもありません。待機、再試行、照合、補償のいずれを行うかはアプリケーションが決めます。結果は、所有するワークフローを閉じてよいという許可ではありません。順方向の作業または補償の義務が残っている間は、ワークフローを開いたままにしてください。

`ActivityTransitionRuntime` は、3つのアプリケーションアクティビティ（スナップショット、受け入れ、コミット）と任意の `MachineDefinition` で `TransitionRuntime` を実装します。通常のアクティビティ履歴を使用し、Worker コマンドや履歴イベントを追加しません。構成済みの Order/Shipment の例では、すべての遷移が同じランナー呼び出しを通ります。

```php
return (new TransitionRunner())->run(
    $this->workflow,
    $this->profile,
    $execution,
    Catalogue::transition($this->profile, $key)->event,
    new ActivityTransitionRuntime(
        SnapshotActivity::class,
        AdmissionActivity::class,
        CommitActivity::class,
        $this->profile->definition
    ),
    $handlers
);
```

この3つのアクティビティクラスはアプリケーションコードであり、パッケージのクラスではありません。

## 定義、プロファイル、バージョン {#definitions-profiles-and-versions}

`MachineDefinition` は、すべての連携が共有するものを保持します。例のバージョン 2 の定義は、4つの状態、遷移の識別子、不変条件のルール、Shipment の子スロットを宣言します。

```php
return new MachineDefinition(
    $machine,
    '2',
    [
        new MachineState('received', 'Business input accepted; completion has not been committed.'),
        new MachineState('working', 'Original work admitted; business completion remains pending.'),
        new MachineState('completed', 'The original execution has verified its required business outcome.'),
        new MachineState('cancelled', 'Original compensation verified and business cancellation committed.'),
    ],
    $machine === 'orders' ? ['begin', 'finish', 'cancel', 'reconcile'] : ['deliver'],
    self::fact('model_consistent'),
    $machine === 'orders' ? [
        new ChildSlot('shipment', ['received', 'working'], 'shipments', '2', 'completed'),
    ] : []
);
```

`PolicyProfile::forDefinition()` は、連携の `TransitionDefinition` エッジと名前付き条件をその定義に結び付けます。プロファイルは宣言されていない状態や遷移の識別子を追加できず、プロファイルの名前付き条件で共有不変条件を置き換えることもできません。

バージョン管理は次のルールに従います。

- **フィンガープリント。** 定義のフィンガープリントは、状態の意味、不変条件、スロットの宣言を対象とします。プロファイルのフィンガープリントは、定義とプロファイルのメタデータ、グラフ、条件の構造、ハンドラーのバージョン、および制限（ある場合）を対象とします。どちらも PHP の実装はハッシュしません。
- **固定された実行。** `ExecutionReference` は、スコープ、業務の対象、実行 ID、ポリシーのフィンガープリント、期待される遷移元の状態、リビジョンを固定します。選択したフィンガープリントは作業開始前に記録し、リプレイ時に再度渡してください。再開時に最新の構成から計算してはいけません。
- **新しい実行のみ。** 新しい定義やプロファイルのバージョンは、新しい実行に対して選択されます。実行中の対象の割り当てを書き換えるとフィンガープリントが変わり、元の実行はその後拒否します。進行中の実行を移行する API はありません。
- **保持される実装。** 実行または保持された義務が復旧可能である間は、古い定義、ルール、ハンドラー、認可のバージョンをデプロイしたままにしてください。ハンドラーは、`TransitionDefinition::handlerKey()` をキーとする閉じた型/バージョンのレジストリから取得されます。保存されたデータが PHP クラスを選択することはできず、ハンドラーが見つからない場合は、アプリケーションの I/O が行われる前に失敗します。

ワークフローコードを変更する際の一般的なルールについては、[バージョン管理](versioning.md)を参照してください。

## ルール、条件、記録された事実 {#rules-conditions-and-recorded-facts}

構成は条件を選択し、ルールの実装は信頼されたアプリケーションコードのままです。信頼されたブートストラップで構築された `RuleRegistry` は、ルールの型とバージョンを `ConditionRule` オブジェクトに対応付けます。`RuleReference` は型、バージョン、パラメーターを固定し、`ConditionDefinition::rule()`、`all()`、`any()`、`not()` がそれらのリーフを組み合わせます。1つの条件のノード数は最大 64 です。

判定には `Verdict::Satisfied`、`Verdict::Unsatisfied`、`Verdict::Unknown` の3つの値があります。`all()` では、満たされない子があればグループは満たされず、そうでなくても不明な子があればグループは不明になります。`any()` では、満たされた子があればグループは満たされ、そうでなくても不明な子があればグループは不明になります。不明を否定しても不明のままです。

事実は、記録されるスナップショットアクティビティの中でのみ収集されます。例の `AssessmentStore` は、証拠への参照とともに事実を記録し、プロファイルのターゲット条件と許可条件を評価します。

```php
$facts = new RecordedFacts($id, $values, array_combine(array_keys($values), array_map(
    static fn (string $name): string => 'recorded-fact:' . $id . ':' . $name,
    array_keys($values)
)));
$registry = Catalogue::registry();
$target = $registry->evaluateCondition($profile->condition($transition->key . '.target'), $facts);
$permission = $registry->evaluateCondition($profile->condition($transition->key . '.permission'), $facts);
```

プロファイルに定義がある場合、同じアクティビティが `MachineDefinition::assess()` を評価し、`MachineAssessment::fromEvaluation()` をスナップショットの `machineAssessment` として返します。`ConditionEvaluation::toArray()` の完全な説明をスナップショットとともに保持してください。評価がない場合、定義が変更された場合、または条件が変更された場合は、作業の前に拒否されます。記録された評価はホストの証拠であり、認可ではありません。保護されたコミットでは、引き続きライブの権限、リビジョン、キャンセルを確認する必要があります。

## 決定性のあるリプレイ {#deterministic-replay}

このプロトコルは記録された履歴に依存するため、通常の[ワークフローの制約](../constraints/workflow-constraints.md)が厳密に適用されます。

- ガードとルールは I/O を行いません。データベース、構成、プロバイダー、コンテナーを読み取りません。
- ライブの読み取りはスナップショットアクティビティ内で行います。リプレイ時には、完了したアクティビティは記録された結果を返し、ルールがライブデータに対して再評価されることはありません。
- `after` スナップショットには、異なるスナップショット ID と新たに収集した事実を使用する必要があります。`SnapshotPhase` は `before`、`after`、`compensation` の証拠を区別するため、あるフェーズが別のフェーズの代わりになることはできません。
- `execute()` と `compensate()` はアクティビティを呼び出します。同期的なプロバイダーやアプリケーションハンドラーはアクティビティでラップしてください。ワークフローコードから直接呼び出すと、リプレイ中にその効果が繰り返される可能性があります。
- 受け入れは権限と許可のみを記録します。Saga への登録前に、順方向の業務効果を実行してはいけません。
- ワークフローと履歴の境界をまたぐ場合は `TransitionResult::toArray()` を使用してください。アプリケーションのドメインオブジェクトは、ステップとランタイムのアダプターの背後に置きます。

## 保護された業務コミット {#protected-business-commits}

コミットアクティビティは、アプリケーションの業務上の権限主体です。次のことを行う必要があります。

1. 決定 ID を、そのスコープ、対象、ポリシー、遷移、内容に結び付けます。完全に同一の重複には記録済みの結果を返し、別の内容に ID を再利用した場合は拒否します。
2. アプリケーションの正となるロックの下で、ライブの権限、期待される遷移元の状態とリビジョン、および受理されたキャンセルを再確認します。
3. 同じストアを共有している場合は、業務状態、決定、および公開の意図（ある場合）をアトミックに記録します。
4. 確認応答が失われた後は、効果を繰り返すのではなく、その決定そのものを検索または再試行します。

`committed`、`conflict`、`cancellation_requested` のいずれかを持つ `CommitResult` を返します。最後のステータスは、受理されたキャンセルによってこのコミットが阻止されたことを意味します。補償が完了したことや、業務エンティティがキャンセルされたことを意味するものではありません。アプリケーションのストアと Durable Workflow の間に分散トランザクションがあることは意味しません。

## 親の状態にバインドされた子マシン {#child-machines-bound-to-parent-states}

親の定義内の `ChildSlot` は、スロット、それをホストする状態、子マシンと定義のバージョン、必要な業務結果を指定します。`MachineDefinition::assertBinding()` は、その宣言に照らしてバインディングを確認します。検索、認可、受け入れは行いません。

### 子バインディングのカタログ {#child-binding-catalog}

Workflow 2.41.0 以降、`MachineCatalog` は互いをホストできる定義を登録します。構築時に各スロットを登録済みの `machine@version` に解決し、バインディングが使用する前に無効なグラフを拒否します。

```php
$catalog = new MachineCatalog([$orders, $returns, $shipments], maxChildDepth: 1);

$catalog->child($orders, 'shipment');
$catalog->assertBinding($parentProfile, $binding, $childProfile);
```

- 重複したマシンバージョン、未登録の子を指すスロット、再帰的または循環的なバインディングは `InvalidMachineCatalog` を送出します。その `reason` は `state_machine_definition_duplicate`、`state_machine_child_definition_unregistered`、`state_machine_child_binding_cycle` のいずれかです。直接、他のマシン経由、または別のバージョンで自分自身をホストするマシンは循環です。
- `InvalidMachineCatalog::$path` は経路を列挙します。例: `orders@1 -> shipment:shipments@1 -> parent:orders@1`。
- 省略可能な `maxChildDepth` は、最も深いスロット経路がそれより長い場合に、次元 `child_depth` の `ResourceLimitExceeded` を送出します。`observed` はその深さを報告します。保持された補償がサポートする子の階層は 1 段なので、子が保持スコープに参加する場合は `maxChildDepth: 1` を使用してください。
- 複数の親またはホスト状態が 1 つの子定義を共有できます。
- `$catalog->assertBinding()` は、両方のプロファイルがフィンガープリントで比較して登録済みの定義そのものを使用していることも要求します。

カタログはオプトインです。ネイティブの子の開始、予約、`MachineDefinition::assertBinding()` はカタログを参照しないため、設定済みの例と同様に、ホストのバインディング認可で `$catalog->assertBinding()` を呼び出してください。カタログは設定です。各実行は引き続き自身のフィンガープリントを固定し、カタログを置き換えても何も移行されません。

`BindingIdentity` は、元の親の実行、名前空間、親のインスタンスと実行、スロット、**世代**、ホストする状態、子ワークフローの型、子のポリシーのフィンガープリント、必要な結果、入力のフィンガープリント、子のオプションを固定します。世代は1回の状態への進入を識別します。親が状態を変更したり、状態に再進入したりした後も、古い世代に対する要求が新しい子にリダイレクトされることはありません。

子の開始と待機は別々の遷移です。

- **開始。** 親は子を予約して受け入れ、正確なバインディングを記録し、その後でのみホストする状態をコミットします。バインディングがすでに記録されている場合、ステップは再度開始するのではなく、それを再利用します。保持型スコープでは、`DurableScope::reserveChild()` が `ChildReservation` を返し、`ChildReservation::start()` が確認付きのネイティブな子開始を使用します。`ChildReservationStore::close()` は後で、受け入れられた `ChildBinding` か、永続的な `NeverAdmittedChild` のいずれかを返します。
- **待機。** 後の遷移は、その同じ受け入れを観測します。2つ目の子も、2つ目の補償の所有者も作成しません。

例の共有ステップは、両方の遷移を示しています。

```php
if ($key === 'begin') {
    $childScope = Ownership::childScope($execution);
    $reservation = $this->scope->reserveChild(
        $execution->executionId . '.shipment',
        $childScope,
        Ownership::binding(
            $execution,
            $this->initialization['rootRun'],
            $this->initialization['integration'],
            $this->initialization['version']
        )
    );
    $existing = Workflow::activity(BoundaryActivity::class, 'binding', [
        'reservation' => $reservation->toArray(),
    ]);
    if ($existing === null) {
        $reservation->start(
            $execution->subject,
            $this->initialization['rootRun'],
            $execution->toArray(),
            $childScope->toArray()
        );
        $existing = Workflow::activity(BoundaryActivity::class, 'record-start', [
            'reservation' => $reservation->toArray(),
        ]);
    }
    $binding = ChildBinding::fromArray($existing);
    $operations[] = 'child:' . $binding->admission->childRunId;
} elseif ($key === 'finish') {
    $value = Workflow::activity(BoundaryActivity::class, 'active-binding', []);
    $binding = ChildBinding::fromArray($value);
    $outcome = StartedChildWorkflow::fromArray($binding->admission->toArray())->await();
    Workflow::activity(BoundaryActivity::class, 'outcome', [
        'binding' => $value,
        'outcome' => $outcome,
    ]);
} elseif ($key !== 'deliver') {
    throw new LogicException('A proof-only transition must not dispatch work.');
}
```

予約なしの場合、`Workflow::startChild()` は、後のステップで `await()` できる `StartedChildWorkflow` レシートを返します。親は子の業務結果を検証する必要があります。技術的な子の完了、受理されたシグナル、タイムアウトだけでは不十分です。`Workflow::startChild()` は組み込み専用であり、Worker プロトコルの実行ではこれを拒否します。

## 補償と保持型スコープ {#compensation-and-retained-scopes}

ランナーは、`execute()` が中断または失敗し得るより前に、元のステップをネイティブ Saga に登録します。コールバックが捕捉するのは元の実行とステップであり、レシートではありません。補償中、ランナーは新しい `compensation` スナップショットを要求し、元の実行を指定して `compensate()` を呼び出します。既定の逐次補償を使用してください。

実行ローカルな Saga コールバックは、その実行とともに終了します。保持型の補償スコープ（`Workflow\V2\Compensation`）は各義務を永続台帳に保持するため、発生元の実行が閉じた後でも補償できます。この API と、そのどの部分が安定版かについては、[補償スコープガイド](./compensation-scopes.md)で説明しています。例では、すべての外部効果をディスパッチする前に `DurableScope::execute()` を通じて `Obligation` として登録し、親の以前の効果を取り消す前に子スコープを検証します。その後、ステップ自身の補償は元の義務のみを検証します。

```php
public function compensate(TransitionContext $context, ExecutionReference $originalExecution): void
{
    Workflow::activity(RequestScopeActivity::class, $this->identity->toArray(), $this->principal);
    // Scope callbacks registered within execute() run first. Check only this step's original subset:
    // verifying the whole scope here would block earlier steps before their callbacks can run.
    Workflow::activity(BoundaryActivity::class, 'verify-step', [
        'execution' => $originalExecution->toArray(),
        'key' => $context->transition->key,
    ]);
}
```

業務上のキャンセルは別の決定です。例では、証明のみの遷移が、保持型スコープの検証後にのみ `cancelled` をコミットします。技術的なキャンセル、キューに入れられた復旧要求、失敗した補償では、業務上のキャンセルは成立しません。現在の保持グラフは親子1階層で、スコープあたり最大 16 個の子と 256 個の義務です。ルートと子の順方向の所有権は continue-as-new や redrive の後継には移らず、保持の解放は明示的なままです。

## バジェットと明示的な結果 {#budgets-and-explicit-outcomes}

信頼された構成で、マシンに上限を設けられます。

- `DefinitionLimits`（`states`、`transitions`、`childSlots`、`ruleNodes`）は、`limits:` として `MachineDefinition` に渡します。バインドされた各プロファイルも、展開された遷移元エッジと条件ノードの総数を確認します。
- `ExecutionLimits`（`commands`、`historyEvents`、`historyBytes`、`groupDepth`）は、`PolicyProfile::withLimits()` または `PolicyProfile::forDefinition()` の `limits:` 引数で付与します。コマンドのバジェットは `TransitionRunner` 内のすべての永続的な中断を対象とし、最大 4,096 コマンド、64 グループ階層までです。履歴の値は、各コマンドの前に `Workflow::historyBudgetAtStep()` で測定される受け入れのしきい値であり、絶対的な上限ではありません。

どちらの制限もそれぞれのフィンガープリントに含まれます。省略すれば以前のフィンガープリントは維持されます。バジェットを追加または変更するには、新しい実行向けに明示的に選択したバージョンが必要です。

実行中にバジェットに達すると、理由 `state_machine_<dimension>_limit_exceeded` とともに `TransitionStatus::Blocked` を返します。無効な定義は、いずれかのハンドラーが実行される前に、ディメンション、観測された数、制限を含む `ResourceLimitExceeded` を送出します。どちらの結果も、キャンセルが成功したことや、以前の外部効果が発生しなかったことを意味するものではありません。`Workflow::compensate()` は順方向のバジェットの外で実行されます。

## 診断 {#diagnostics}

- `TransitionResult::toArray()` は、実行、ステータス、理由、評価、遷移キーを返します。
- 2.41.0 以降、`TransitionResult::explain()` は結果を生成した `TransitionStage` と、そのチェックが評価した記録済みスナップショットとフェーズも示します。`toArray()` は変わりません。
- `ConditionEvaluation::toArray()` は、構造のフィンガープリント、スナップショット ID、ルールのバージョン、理由、証拠への参照、不足している事実を保持します。
- `MachineAssessment::toArray()` は、定義とスナップショットに結び付いた不変条件の判定を記録します。
- `ResourceLimitExceeded` は `dimension`、`observed`、`limit` を公開します。
- `ScopeRecovery::describe()` は、新たな認可済みキャンセル要求が必要な場合を含め、保持型スコープの状態を報告します。

ステージにより、同じステータスの結果を区別できます。

| ステージ | ステータス | 意味 |
| --- | --- | --- |
| `selection` | `unavailable`, `ambiguous` | イベントとソースに対する一意のエッジがありません。スナップショットはありません。 |
| `source` | `conflict` | スナップショットの状態またはリビジョンが想定ソースと異なります。 |
| `invariant` | `blocked`, `unknown` | 共有不変条件が作業の前または後に拒否しました。 |
| `target` | `pending`, `unknown` | ターゲットが不明、宣言された作業がない、または作業後も満たされていません。 |
| `permission` | `blocked`, `unknown` | 実行ガードが拒否しました。 |
| `admission` | `blocked`, `unknown` | 記録されたライブのアドミッションが拒否しました。 |
| `budget` | `blocked` | 前進用の予算が次のコマンドを拒否しました。スナップショットはありません。 |
| `commit` | `committed`, `conflict`, `cancellation_requested` | 保護されたコミットが決定を確認しました。 |

`invariant`、`target`、`permission` の各ステージでは、スナップショット ID を使って、ホストがそのスナップショットについて保持している `ConditionEvaluation` を見つけられます。`admission` と `commit` では、理由は記録されたアドミッションまたはコミットに由来し、スナップショットは使用された証拠を識別するだけです。作業後の拒否では `after` スナップショットが示されます。

`MachineInspection` は、運用ツールに業務主体のバージョン付きビューを提供します。ホストは、すでに認可した値からワークフローコードの外で構築します。

```php
$inspection = new MachineInspection(
    $profile, $state, $revision, $execution, $result,
    [$childBinding, $childReservation, $neverAdmittedChild],
    [['scope' => $scopeIdentity, 'description' => $scopeRecovery->describe($scopeIdentity, $principal)]],
);
$view = $inspection->toArray();
```

- `machine` には、固定されたマシン、定義、プロファイルのバージョンとそのフィンガープリントが含まれます。`business` はアプリケーションのストアにある現在の状態とリビジョンで、ワークフロー実行のステータスとは別物です。`transition` は実行の `explain()` です。
- `children` はバインディング世代ごとに 1 件なので、渡したリストより短くなることがあります。各エントリには `status`（`admitted`、`never_admitted`、`reserved`）、バインディングキー、スロット、世代、ホスト状態、必要な結果、バインディングを作成した実行、子のインスタンスと実行、クローズ ID が含まれます。アドミットされた子は、その業務結果の証拠ではありません。
- `participation` は、子を保持された親スコープと子スコープの ID および義務キーに関連付けます。これらは `compensation` エントリの `scopeId` と結合できます。アドミットされた子の `ChildReservation` は、その `ChildBinding` と一緒に渡してください。`participation` が null の場合、その子に保持された参加がないか、予約が渡されていません。
- `compensation` は、各スコープの ID と識別情報を `ScopeRecovery::describe()` のキーとともに列挙します。

構築時には、宣言されていない状態、別のプロファイルでの実行、別の実行の遷移、別の主体またはプロファイルの子の作業、矛盾または重複した世代、重複したスコープ、不正なスコープ記述を拒否します。I/O は行わず、何も認可しません。スコープキーはアプリケーションが定義するため、ルートスコープと主体の対応付けはホストが行います。

## 実行可能な例 {#runnable-examples}

例は workflow リポジトリにあり、その開発用依存関係とテストデータベースに対して実行されます。パッケージのマイグレーションではなく、独自の使い捨てアプリケーションテーブルを使用します。

| 例 | 示す内容 |
| --- | --- |
| [構成済みの Order と Shipment](https://github.com/durable-workflow/workflow/blob/main/examples/configured-state-machines/README.md) | 2つの連携プロファイル `prepare` と `imported` が、同じ状態と1つの共有ステップを使用します。準備では Shipment を `working` でホストし、インポートでは `received` でホストします。証明のみの `reconcile` エッジは、証拠が存在する場合に作業をスキップします。バージョン 2 では新しい対象向けに共有定義を追加し、バージョン 1 は固定されたままです。子の予約、保持型の補償、キャンセルの確定を含みます。 |
| [プロバイダーを使う Order、Payment、Shipment](https://github.com/durable-workflow/workflow/blob/main/examples/provider-state-machines/README.md) | 合成プロバイダーのジャーナルに対して、同じプロトコル上で3つのマシンを動かします。レシピは、予約優先と支払い優先のチェックアウト、返金の結果、在庫確保または配送後のオーソリとキャプチャ、銀行振込、代金引換、前払いと残金払い、サブスクリプションによる支払い、Cart のリース、単位金額、部分在庫、返品、交換、配送業者のインシデント、Worker 喪失からの復旧を扱います。 |
| [SQL による業務上の決定](https://github.com/durable-workflow/workflow/blob/main/examples/business-state-machines/README.md) | キャンセル、リビジョンの競合、権限の取り消し、公開の意図、確認応答の喪失に対する SQL フェンシングを備えた、アプリケーション所有の保護されたコミットと、ネイティブな入れ子の Order と Shipment の補償。 |

構成済みの例のテストは、workflow リポジトリから実行します。

```shell
vendor/bin/phpunit tests/Feature/V2/V2ConfiguredStateMachineExampleTest.php
```

3つとも、合成プロバイダーまたは同一データベースのプロバイダーを使用します。実際の配送業者、決済プロバイダー、倉庫、インストール済みパッケージのアップグレード、進行中の実行の移行に対する適格性確認ではありません。実際の連携では、独自の冪等性、フェンシング、不確実な結果の照合を用意する必要があります。

エンジンリポジトリの[業務ステートマシンリファレンス](https://github.com/durable-workflow/workflow/blob/main/docs/business-state-machines.md)には、アクティビティのペイロード形状を含む完全な契約が記載されています。提供状況は [durable-workflow/workflow#1069](https://github.com/durable-workflow/workflow/issues/1069) で追跡しています。
