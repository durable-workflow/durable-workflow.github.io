---
sidebar_position: 15
---

# バージョニング {#versioning}

## ビルド変更前のリプレイ {#replay-before-changing-builds}

候補を昇格する前に、代表的な実行中および最近終了した履歴を、その候補の正確なアプリケーションコードでリプレイします。ロールバック前には、新しいビルドが書き込んだ履歴を古いアーティファクトでリプレイしてください。[リプレイの判定](../testing.md#replay-before-deployment)に従います。ルーティング先の互換コホートや整合性確認の成功だけでは、リプレイ互換性を証明できません。

ワークフローは数か月や数年動く場合があるため、実行中に定義を変更することはよくあります。バージョニングせずに実行経路に影響するコードを変えると、リプレイ時に非決定性エラーが発生します。

`getVersion()` はバージョン付きの分岐点を作り、実行中のワークフローに安全に変更を導入します。

## 記録済みのエントリ引数を進化させる {#evolving-recorded-entry-arguments}

実行は開始時に記録した引数を保持します。新しい定義をデプロイしても、その入力は書き換わりません。リプレイ時、ランタイムは記録済みの値を現在のワークフローのエントリメソッドに束縛し、**その後で初めてメソッド本体のコードを実行します**。本体内の `getVersion()` や `patched()` の分岐は、互換性のないシグネチャを救済できません。まず本体に入れる必要があります。

既存の位置引数の順序を保ち、記録された型を引き続き受け入れてください。PHP のデフォルト値は省略された引数を補いますが、その位置にすでに記録された互換性のない値を置き換えません。たとえば `[7]` で始まった実行は、デプロイ後も整数 `7` を渡します。

| エントリの変更 | 記録済み入力 `[7]` への影響 |
| --- | --- |
| `handle(int $amount)` → `handle(int $amount, string $currency = 'USD')` | 古い引数は引き続き束縛でき、新しい末尾引数にはデフォルト値を使えます。リプレイするコマンドの互換性も保つ必要があります。 |
| デフォルト値のない必須引数を末尾に追加 | 古い実行にはその値がありません。 |
| 先頭側の引数を挿入、削除、並べ替え | 既存の値が別のパラメーターに渡る可能性があります。同じパラメーター名でも位置入力は修復されません。 |
| `int $amount` を `string $amount` に変更 | 記録済みの整数は文字列にはなっていません。 |
| `int $amount` を `PaymentRequest $request` に変更 | 依存性注入は入力の移行ではありません。新しく構築された DTO が、記録済みの金額をコンストラクターのデフォルト値で置き換えてはいけません。 |
| 末尾パラメーターだけを削除 | PHP が呼び出しを受け入れる場合でも、その意味を捨てることでリプレイするコマンドや業務動作が変わらないか確認してください。 |

別の入力契約が必要なら、末尾に任意パラメーターを追加するか、新しいワークフロー型を使う方法を優先してください。内部で新しい DTO が必要なら、互換性のある記録済み引数からワークフロー**本体内で**明示的に構築し、永続コマンドの変更はそこでバージョニングします。対応する実行が必要とする間は、サポートする各入力形式をリプレイできるコードを残してください。実際に保存された入力を新しい定義でテストし、永続的な待機後のコールドリプレイも含めます。新規開始だけのテストでは、このデプロイ境界を確認できません。

### Workflow 2.7.2 の動作 {#released-embedded-entry-behavior}

Workflow **2.7.2** では、エントリ引数の個数や型のエラーが終端の `WorkflowFailed` イベントになる場合があります。一方、一部の依存性解決エラーは実行を未完了のまま残し、タスクが繰り返し失敗します。スカラーを、コンストラクターにデフォルト値を持つ注入 DTO に変えると、誤ったデータで動作する場合さえあります。これらは [Workflow #866](https://github.com/durable-workflow/workflow/issues/866) で追跡する製品の不具合であり、安全なバージョニング手法ではありません。

互換性のあるコードに戻せば、再配信できる未完了実行を復旧できる場合がありますが、すでに終端となった実行は再開しません。`repair()` も新しいバージョン分岐も、その失敗済みの元の実行を復活させるとは約束しません。まず実際の状態と失敗を調べ、復旧方法を決める間も入力と履歴を保持してください。

### 公開済みの組み込み保護 {#embedded-entry-argument-safeguard}

Workflow **2.7.3** はアプリケーションコードに入る前に記録済みのエントリ引数を検証します。不整合な束縛は型付き `WorkflowEntryArgumentsMismatchException` と、`replay_blocked_reason = workflow_entry_arguments_mismatch` を持つリプレイ停止状態の**ワークフロータスク**になります。**実行自体は非終端のまま**です。診断フィールドは引数の値をコピーせず、ワークフロー、エントリメソッド、パラメーター、期待型と実際の型を示します。記録済み入力を捨てる新規 DTO 注入も拒否されます。組み込みアプリケーションに実際にインストールされた Workflow パッケージを確認してください。この保護は、旧リリースで終端になった実行を再開しません。

この公開済み保護を使い、まだ開いている同じ元の実行を次の手順で復旧します。

1. 選択した実行のタスク診断を調べ、`workflow_entry_arguments_mismatch` を確認します。すべてのタスク失敗をこの原因と決めつけないでください。
2. 元の記録済み引数を受け入れる定義に戻すか、ワークフロー本体に互換アダプターをデプロイします。元のワークフロー識別子、入力、履歴、期限を保ち、新しいシグネチャに合わせるためにストレージを編集しないでください。
3. 互換コードが利用可能になった後、その同じ未完了実行に対してサポートされる修復操作を使います。元の処理が再開し、終端結果が一度だけ記録されることを確認してください。修復は元の期限を延長しません。すでに期限を過ぎている場合も、その期限が適用されます。

この保護は、ワークフロー本体から投げられた例外をデプロイ不整合と**再解釈しません**。実際のアプリケーション `TypeError` や本体の未処理エラーは、通常のワークフロー失敗動作に従います。また、[shared #220](https://github.com/durable-workflow/.github/issues/220) で追跡する、旧分岐を廃止するための全実行の確認機能も提供しません。

### サービス SDK には別の境界がある {#service-sdk-entry-boundaries}

組み込み Core の修正は、サービスモードでワークフローコードを実行する SDK プロセスを変えません。以下の古い公開済み SDK は、[shared #221](https://github.com/durable-workflow/.github/issues/221) で追跡するサービスモードのエントリ保護より前のバージョンです。

| 公開済み SDK | エントリ束縛の動作 |
| --- | --- |
| [PHP 2.5.3](https://github.com/durable-workflow/sdk-php/tree/43d39bff50ccace0a309de41306cd350751ec575) | 登録したハンドラーを、コンテキストに続けて記録済み位置入力を渡して呼び出します。入口の `ArgumentCountError` や `TypeError` が汎用のワークフロー失敗経路に進む場合があります。 |
| [Python 2.6.1](https://github.com/durable-workflow/sdk-python/tree/150c6f6bc14e3516f75cc615b2f75f093ed84ea1) | `run(ctx, *start_input)` を呼び出します。引数の個数の変更でワークフローが失敗する場合があります。型注釈だけでは型を強制せず、記録済み値も変換しません。ジェネレーター本体のエラーもアプリケーションの失敗です。 |
| [Rust 3.5.5](https://github.com/durable-workflow/sdk-rust/tree/4d5047ba9da39785512340b0975ce28da09f0cee) | 型付きアダプターは、固定シグネチャのハンドラーを呼ぶ前に入力をデシリアライズします。リクエスト型の変更は、このデコードで失敗する場合があります。PHP/Python の位置束縛とは異なり、未消費の履歴による付随的な拒否は、復旧可能なシグネチャ保護の保証ではありません。 |

サービス入力の互換性と実際の SDK 検証を、組み込みリリースとは分けて扱ってください。すべての `TypeError` や Rust ハンドラーのエラーを捕捉してリプレイ安全と呼ぶと、実際のアプリケーション障害を隠してしまいます。

### サービスモードのエントリ保護 {#service-sdk-entry-safeguard}

**公開済みのサポートです。** Server 2.9.9 と PHP SDK 2.5.4、Python SDK 2.6.2、Rust SDK 3.5.6 で、以下のエントリ保護とルーティング・復旧動作が導入されました。これらは機能の最小対応バージョンです。セキュリティ修正を含む最新の安定版をインストールしてください。

準備中の SDK は、アプリケーションのワークフローコードが動く前に、記録済みエントリ入力を検証します。入力に互換性がない場合は `workflow_entry_arguments_mismatch` を報告し、ワークフローの**タスク**を失敗かつリプレイブロックの状態にします。`fail_workflow` の送信や業務上の**実行**のクローズは行いません。入力、ワークフローと実行の識別情報、コミット済み履歴、ビルド固定、元の期限は変わりません。PHP は必須の位置引数と宣言された PHP 型を検証します。Python はシグネチャへの束縛で引数の個数と既定値を処理しますが、型注釈が実行時の型チェックになるわけではありません。Rust の型付きアダプターは、ハンドラーまたは状態ファクトリーを呼ぶ前に入力のデコードを検証します。Rust の生のハンドラーは、引き続き自身でアプリケーション入力を処理する責任を持ちます。

Server のタスク固有の `failure_reason` は `workflow_entry_arguments_mismatch` です。`replay_blocked_reason` は汎用の `worker_reported_replay_failure` のままです。対象実行のデバッグ応答で `latest_workflow_task_failure.reason` を調べてください。これらを、前述した組み込み Core の診断と混同しないでください。束縛に成功した後のアプリケーションコードが `TypeError` を投げる、Rust ハンドラーのエラーを返す、その他の理由で失敗する場合は、通常の業務失敗として扱われます。

元の記録済み入力を受け入れるコードに戻してから、[同じ元の実行に対するサポート済み復旧手順](../failures-and-recovery.md#service-entry-recovery)を使います。入力を DTO の既定値で置き換えたり、履歴を変更したり、期限をリセットしたりしてはいけません。この保護は、古い Worker がすでに終端にした実行を再び開くものではありません。

安全な置き換えルーティングには、[エントリ検証の Worker 能力](../polyglot/worker-compatibility-routing.md#definition-fingerprint-evolution)も必要です。フィンガープリントが変わったことはリプレイ互換性の証明でも、実行の元のフィンガープリントを書き換える理由でもありません。永続コマンドの変更は互換性のあるエントリメソッド内でバージョン分岐し、昇格前にコールドリプレイを検証してください。

## アクティビティの引数と結果を変更する {#evolving-activity-arguments-and-results}

アクティビティには、スケジュール時に記録された引数と、完了時に記録された結果という、保存済みの二つの契約があります。デプロイしても、どちらも移行されません。これは組み込み PHP と、PHP、Python、Rust SDK を使うサービスモードの Worker に共通です。

未実行の試行や再試行には、最初のスケジュール時の引数が渡されます。実行される実装は Worker の登録とビルドルーティングのポリシーで決まり、古いビルドの場合もあります。新しい実装をデプロイしても、すべての試行で使われる保証はなく、キュー内の引数も更新されません。

完了したアクティビティをリプレイすると、現在のワークフローコードは、アクティビティを再実行せずに記録済みの結果を受け取ります。ステップとアクティビティ型の一致は、引数や結果のスキーマ検証ではありません。データ構造を変更すると、履歴の不一致にならずにアプリケーションコードが失敗する場合があります。

### 既存の値の意味を保って省略可能な入力を追加する {#additive-activity-input}

既存の位置引数とその意味を保ってください。組み込み PHP では、末尾に省略可能な引数を追加すると、`[7]` のような記録済みの引数を引き続き受け取れます。

```php
use Workflow\V2\Activity;

final class PriceActivity extends Activity
{
    public function handle(int $amount, string $currency = 'USD'): array
    {
        return ['amount' => $amount, 'currency' => $currency];
    }
}
```

デフォルト値が補うのは省略された引数です。記録済みの互換性のない値を変換したり、引数の並べ替えを修正したりはしません。外部への副作用にも互換性が必要です。再試行はデプロイ後にも発生するため、冪等性を維持してください。

PHP のサービスモードハンドラーは、アクティビティコンテキストに続いて記録済みの位置引数を受け取ります。Python のハンドラーは位置引数を直接受け取ります。どちらも、省略された引数にはデフォルト値が必要です。Python の型注釈だけでは、値の検証や変換は行われません。Rust の型付きアクティビティは、一つのリクエスト値をデシリアライズします。既存の表現を保ち、省略可能なフィールドか、Serde のデフォルト値を明示したフィールドを追加してください。必須フィールドを追加すると、Rust ハンドラーの実行前にデコードが失敗する場合があります。API は [PHP](https://php.durable-workflow.com/)、[Python](https://python.durable-workflow.com/)、[Rust](https://rust.durable-workflow.com/) SDK のガイドを参照してください。

### フォールバックで古い結果を読み取る {#additive-activity-result}

新しいアクティビティ結果に `currency` を追加しても、ワークフローは `amount` しか含まない過去の完了結果を受け取れる必要があります。

```php
$result = activity(PriceActivity::class, 7);
$currency = $result['currency'] ?? 'USD';
```

従来の業務上の意味を保つフォールバックを選んでください。クエリや復旧を含む、リプレイされる可能性のあるすべての履歴で必要です。新しい表現を書き込むコードより先に、互換性のある読み取りコードをデプロイしてください。ロールバック先の読み取りコードでも、新しく記録された結果を検証します。入力引数のデフォルト値は、記録済みの結果にフィールドを追加しません。

### 契約が異なる場合は新しい型を使う {#incompatible-activity-contract}

フィールド名、表現、業務上の意味を変更するときは、既存のアクティビティ型を残して新しい型を導入してください。古い履歴では従来のステップを維持し、新しい実行では新しい型をスケジュールする必要がある場合は、スケジュール呼び出しにワークフローの `getVersion()` 分岐を置きます。アクティビティ内部の分岐では、本体に入る前に失敗する引数を修復できません。バージョンマーカーも、履歴内の結果を書き換えません。

実際にインストールされたパッケージと新しいプロセスで、二つのデプロイ境界を検証してください。古いコードでスケジュールして候補のアクティビティで実行し、次に古いアクティビティで完了して候補のワークフローでリプレイします。互換性のない入力と結果も失敗対照として含めてください。前述のワークフロー入口の保護が、アクティビティのシグネチャやアプリケーションの結果読み取りも保護するとは限りません。組み込みアクティビティの DTO に関する確認済みの不具合は [Workflow #910](https://github.com/durable-workflow/workflow/issues/910) で追跡しています。

これらの契約と併せて、[記録済みのワークフロー開始引数](#evolving-recorded-entry-arguments)と[シグナルペイロードの変更手順](signals.md#evolve-a-signal-payload)も確認してください。

### 検証済みの失敗境界 {#activity-compatibility-failures}

[#363 の公開パッケージ検証](https://github.com/durable-workflow/durable-workflow.github.io/issues/363)では、各デプロイ境界で新しいプロセスを使用しました。以下は実測した基準バージョンであり、最低対応バージョンではありません。

| 公開パッケージ | 互換性のないアクティビティ入力 | 互換性のない結果読み取り |
| --- | --- | --- |
| 組み込み Workflow 2.11.2 | 必須引数の欠落は `ArgumentCountError` となり、アクティビティが失敗します。 | Laravel のエラー処理下で存在しない配列フィールドにアクセスすると、`ErrorException` でワークフローが失敗します。 |
| PHP SDK 3.2.0 と Server 2.11.0 | 必須の位置引数の欠落は、アクティビティの失敗で `ArgumentCountError` として報告されます。 | 欠落したフィールドを必須文字列の読み取り関数に渡すと、`TypeError` でワークフローが失敗します。 |
| Python SDK 2.9.0 と Server 2.11.0 | 必須の位置引数の欠落は `TypeError` となり、アクティビティが失敗します。 | 結果に存在しないキーを参照すると、`KeyError` でワークフローが失敗します。 |
| Rust SDK 4.2.2 と Server 2.11.0 | 新しい必須リクエストフィールドは、アクティビティハンドラー実行前の型付き入力デコードで失敗します。 | 新しい必須結果フィールドは、ワークフロー内の型付き結果デコードで失敗します。 |

サービスモードの検証では `max_attempts = 1` を記録しました。その後、未処理のアクティビティ失敗によりワークフローが失敗しました。通常、アクティビティ失敗は記録済みの再試行・タイムアウトポリシーに従います。ワークフローは再試行を使い切ったアクティビティ失敗を処理できます。結果の読み取りエラーはアプリケーションのワークフロー失敗であり、完了したアクティビティの再実行要求ではありません。互換性のある追加変更の対照はすべて、元の金額 `7` とデフォルト通貨 `USD` で完了し、アクティビティ試行は一回、修復はゼロでした。結果の対照では、完了したアクティビティは完了状態を保ちました。

組み込み Workflow 2.11.2 では、記録済みのスカラー `7` を、金額のデフォルト値が `0` の注入された DTO に置き換えるシグネチャ変更が受け入れられ、誤って `0` で完了する場合もあります。この製品不具合は [Workflow #910](https://github.com/durable-workflow/workflow/issues/910) で追跡しています。依存性注入を入力の移行として使わず、ワークフロー入口の保護がこのケースも対象にすると思わないでください。互換コードを戻しても、終了済みの実行は再開されません。実際の状態を確認し、記録済みの入力、履歴、期限を変更せずに[復旧ガイド](../failures-and-recovery.md)に従ってください。

## `getVersion` の使用 {#using-getversion}

`getVersion()` は安全にリプレイできる逐次ヘルパーです。各変更点は初回に実行の永続バージョンマーカーを記録し、後のリプレイは現在のコードから分岐を計算せず、その値を再利用します。新しい分岐点より前に始まった実行は保守的に `DEFAULT_VERSION` になります。

```php
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;
use function Workflow\V2\{activity, getVersion};

final class MyWorkflow extends Workflow
{
    public function handle(): void
    {
        $version = getVersion(
            'my-change-id',
            WorkflowStub::DEFAULT_VERSION,
            1
        );

        if ($version === WorkflowStub::DEFAULT_VERSION) {
            activity(OldActivity::class);
        } else {
            activity(NewActivity::class);
        }
    }
}
```

## 仕組み {#how-it-works}

`getVersion()` は3つの引数を受け取ります。

- **changeId**: この変更点の一意な識別子。
- **minSupported**: このコードがまだサポートする最小バージョン。
- **maxSupported**: 新規実行用の最大（現在の）バージョン。

`getVersion()` に達すると次のように動作します。

- **新規実行**は `change_id`、選んだ `version`、サポート範囲を持つ型付き `VersionMarkerRecorded` を追加し、`maxSupported` を返します。
- **リプレイ**は記録済みマーカーのバージョンを返します。
- **まだマーカーのない実行**は、現在の定義より古いと判定されると `WorkflowStub::DEFAULT_VERSION` にフォールバックします。まず実行の互換性マーカーと現在の Worker を調べ、次に永続スナップショットの `workflow_definition_fingerprint` を現在読み込めるクラスと比較します。一致なら同じ定義なので新規記録し、不一致なら変更前の実行としてフォールバックします。フィンガープリント導入前の `WorkflowStarted` 履歴しかない実行は、定義が不変と証明できないため保守的に `DEFAULT_VERSION` です。これは導入前の実行に対する確定した2.0の方針であり、記録がないだけで取得を妨げません。フォールバックは合成マーカーを追加せず、新しいステップも消費しません。
- **クエリメソッド**は注釈付きメソッドの前に同じコミット済みマーカーをリプレイし、ワークフロータスクと同じ分岐を見ます。
- **Waterline** は選択実行のタイムラインに `version_change_id`、`version`、`version_min_supported`、`version_max_supported` を表示します。詳細には `workflow_definition_fingerprint`、`workflow_definition_current_fingerprint`、`workflow_definition_matches_current` も表示し、マーカーのコミット前でも古い定義で開始したことを確認できます。

新規ワークフローは最新経路を、既存ワークフローは元の経路を使えます。

## 新しいバージョンの追加 {#adding-a-new-version}

既存のワークフローが `prePatchActivity` を呼ぶとします。

```php
use Workflow\V2\Workflow;
use function Workflow\V2\activity;

final class MyWorkflow extends Workflow
{
    public function handle()
    {
        $result = activity(PrePatchActivity::class);

        return $result;
    }
}
```

実行中のワークフローを壊さず `postPatchActivity` に置き換えます。

```php
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;
use function Workflow\V2\{activity, getVersion};

final class MyWorkflow extends Workflow
{
    public function handle()
    {
        $version = getVersion(
            'activity-change',
            WorkflowStub::DEFAULT_VERSION,
            1
        );

        $result = $version === WorkflowStub::DEFAULT_VERSION
            ? activity(PrePatchActivity::class)
            : activity(PostPatchActivity::class);

        return $result;
    }
}
```

新しい `getVersion()` 分岐点を導入する展開では、そのビルド波の `DW_V2_CURRENT_COMPATIBILITY` を引き続き更新してください。ランタイムはマーカーの欠落が新規実行なのか `DEFAULT_VERSION` を維持すべき旧実行なのかの主な根拠に、開始時の `workflow_definition_fingerprint` を使います。互換性マーカーも Worker ルーティングに必要で、フィンガープリントより先に検査します。導入前の記録のない実行は定義不変を検証できず、保守的に `DEFAULT_VERSION` を維持します。

## さらにバージョンを追加 {#adding-more-versions}

さらに変更するには `maxSupported` を増やします。

```php
$version = getVersion(
    'activity-change',
    WorkflowStub::DEFAULT_VERSION,
    2
);

$result = match($version) {
    WorkflowStub::DEFAULT_VERSION => activity(PrePatchActivity::class),
    1 => activity(PostPatchActivity::class),
    2 => activity(AnotherPatchActivity::class),
};
```

## 古いバージョンの廃止 {#deprecating-old-versions}

旧バージョンを使う全ワークフローの完了後、`minSupported` を上げてサポートを削除し、古い経路の保守を終えられます。

```php
// After all DEFAULT_VERSION workflows have completed:
$version = getVersion(
    'activity-change',
    1,  // No longer supporting DEFAULT_VERSION
    2
);

$result = match($version) {
    1 => activity(PostPatchActivity::class),
    2 => activity(AnotherPatchActivity::class),
};
```

`minSupported` 未満の実行がリプレイすると `VersionNotSupportedException` を投げます。安全なフォールバックが `WorkflowStub::DEFAULT_VERSION` のままである旧互換性の実行も含みます。

同じ `changeId` を別の分岐点に誤って再利用すると、不一致を黙認せず決定性エラーにします。論理変更ごとに安定した1つの ID を維持します。

## 複数の変更点 {#multiple-change-points}

独立した変更に対し、同じワークフローで複数の `getVersion()` を使えます。

```php
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;
use function Workflow\V2\getVersion;

final class MyWorkflow extends Workflow
{
    public function handle(): void
    {
        $version1 = getVersion('change-1', WorkflowStub::DEFAULT_VERSION, 1);
        $version2 = getVersion('change-2', WorkflowStub::DEFAULT_VERSION, 1);

        // Each change point is tracked independently
    }
}
```

**重要:** 各 `changeId` はワークフロー内で一意にします。選んだバージョンは型付き履歴に記録され、後のタスク、クエリ、Waterline 詳細で決定的にリプレイされます。古い実行で `VersionMarkerRecorded` が表示されなければ、既存履歴に新マーカーを補完せず旧 `DEFAULT_VERSION` 経路を維持したという意味です。詳細の `workflow_definition_fingerprint`、`workflow_definition_current_fingerprint`、`workflow_definition_matches_current` で、現在のビルドが読める定義と異なる定義で開始したか分かります。

## `patched()` の短縮形 {#patched-shorthand}

`patched($changeId)` は「この実行が1度限りの変更点を通ったか」を表す2状態の短縮形です。`getVersion()` と同じ `VersionMarkerRecorded` を記録し、整数の代わりに真偽値を返します。

```php
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, patched};

final class MyWorkflow extends Workflow
{
    public function handle(): string
    {
        if (patched('use-new-payment-activity')) {
            return activity(NewPaymentActivity::class);
        }

        return activity(LegacyPaymentActivity::class);
    }
}
```

動作:

- 新規実行はマーカーをコミットし、新しい分岐に入り `true` を返します。
- この `changeId` 導入前の実行は、`getVersion()` と同じフィンガープリントのフォールバックで `DEFAULT_VERSION` を維持し `false` を返します。
- どちらのリプレイもコミット済みマーカーを読み同じ値を返すため、分岐判断が永続化されます。

`patched()` は `getVersion($changeId, DEFAULT_VERSION, 1) === 1` と完全に等価です。2つの分岐だけで、旧分岐を永久に残す必要がない場合に使います。真偽値は `DEFAULT_VERSION` と `1` の `match` より読みやすくなります。

3つ以上の分岐や同じ論理変更の次版を予定するなら、`maxSupported` を明示した `getVersion()` を使います。同じ `changeId` の `patched()` を `getVersion()` へ変えると、既存マーカーの `maxSupported = 1` により決定性エラーになります。

## `deprecatePatch()` で旧分岐を削除 {#removing-the-legacy-branch-with-deprecatepatch}

`patched()` 変更点の旧実行がすべて完了したら、旧分岐を削除できます。互換性を保つには呼び出しを丸ごと消さず、`deprecatePatch()` に置き換えます。

```php
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, deprecatePatch};

final class MyWorkflow extends Workflow
{
    public function handle(): string
    {
        deprecatePatch('use-new-payment-activity');

        return activity(NewPaymentActivity::class);
    }
}
```

`deprecatePatch()` は変更点をタイムラインに残し、記録済み `VersionMarkerRecorded` が既知の呼び出しと一致するようにします。戻り値は `null` で、無条件に新経路に進みます。展開後は次の動作になります。

- 新規実行は `deprecate_patch` マーカーをコミットし、新分岐に入り `null` を返します。
- 同じ `changeId` の `patched` マーカーをコミット済みの実行はそれをリプレイし、唯一残った廃止後の分岐をエラーなく通ります。
- `patched()` が `false`（旧経路）の実行は終了済みであることが前提です。まだ動いていれば旧マーカーを読んでも新分岐を実行します。そのため安全な順序は「旧実行をすべて終えてから `deprecatePatch()` を展開」です。

2段階のパッチライフサイクルと配置ルール:

1. 変更点に **`patched()` を導入**し、両分岐を残します。新規実行は新分岐、旧実行は旧分岐を通ります。
2. **すべての旧実行の完了を待ちます。** Waterline の実行検索や `dw workflow:list` で旧分岐をリプレイし得る未完了実行がないことを確認します。
3. **同じ位置、同じ `changeId` で `deprecatePatch()` に置換**し、本体の旧分岐を削除します。永続履歴が既知の変更点と一致するよう呼び出しは残します。
4. **任意で `deprecatePatch()` 自体を削除**できますが、クエリ、エクスポート、監査を含む過去のリプレイも今後このマーカーを読まないと確信できる場合に限ります。取り消せない段階です。通常は実行時コストなしで無期限に残せます。

配置ルール:

- `patched()` と `deprecatePatch()` はワークフロー本体から呼び、アクティビティ、シグナルハンドラー、クエリから呼びません。決定的にリプレイするワークフローステップだからです。
- 各 `changeId` は1つの論理変更点です。別の分岐への再利用は決定性エラーです。
- 同じ `changeId` はライフサイクル中にどちらの形式にもできますが、同時には使えません。展開時に置換し、共存させません。
- 同じ `changeId` の `getVersion()` と `patched()` は共存できません。導入時に1つの方式を選びます。
