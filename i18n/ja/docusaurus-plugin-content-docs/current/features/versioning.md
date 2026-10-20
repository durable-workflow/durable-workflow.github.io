---
sidebar_position: 15
---

# バージョニング {#versioning}

ワークフローは数か月や数年動く場合があるため、実行中に定義を変更することはよくあります。バージョニングせずに実行経路に影響するコードを変えると、リプレイ時に非決定性エラーが発生します。

`getVersion()` はバージョン付きの分岐点を作り、実行中のワークフローに安全に変更を導入します。

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
