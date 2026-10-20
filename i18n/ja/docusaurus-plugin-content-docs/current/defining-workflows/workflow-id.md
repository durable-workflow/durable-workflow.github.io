---
sidebar_position: 6
---

# ワークフロー ID {#workflow-id}

## インスタンス ID と実行 ID {#instance-ids-and-run-ids}

永続ワークフローには、ライフサイクルが異なる2つの識別子があります。

- **インスタンス ID**（`id()`、`workflowId()`）は安定した公開ハンドルです。最初の開始時に生成されるか、呼び出し元が指定します。continue-as-new の連鎖を含め、ワークフローの存続中は変わりません。
- **実行 ID**（`runId()`）は1つの実行世代を識別します。初回開始時と continue-as-new 時など、新しい実行を作成するたびに割り当てられます。

インスタンス ID は外部から呼び出す公開ハンドルとして扱います。実行 ID は調査、デバッグ、監査で特定世代を参照するためのもので、長期間使うコントロールプレーンの呼び出し元が追跡すべきものではありません。

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class);

$id = $workflow->id();

$workflow->start();

$runId = $workflow->runId();
```

安定した公開ハンドルが必要ならインスタンス ID を、特定の実行を調べるなら実行 ID を使います。

## 実行 ID のライフサイクル {#run-id-lifecycle}

実行 ID は実行世代の識別子です。v2 ワークフローの各世代が固有の ID を持ち、1つのインスタンス ID が時間とともに多数の世代をまたぐことができます。

- 新しい `start()` は最初の実行と実行 ID を作成します。
- `continueAsNew(...)` は現在の実行を `completed` / `continued` で閉じ、同じインスタンス ID の下で新しい実行 ID の実行を開始します。[新しい実行への継続](/docs/features/continue-as-new)を参照してください。

実行 ID は1世代に属するため、世代をまたいで永続的に操作する呼び出し元はインスタンス ID で解決します。

- シグナル、クエリ、更新、運用コマンドは常にインスタンスの最新の永続実行を解決します。continue-as-new をまたいで呼び出し元が実行 ID を追跡する必要はありません。
- Waterline の実行詳細、履歴エクスポート、リプレイデバッガーなど、特定の世代を固定する詳細調査ツールは、1つの実行を独立して調べるため明示的な実行 ID を受け付けます。

実行 ID はコード内では `runId()`、履歴・投影・エクスポートでは `workflow_run_id` / `run_id` として現れます。常にそのイベントや行が属する世代の ID です。古い履歴の実行 ID が、同じインスタンスの現在の実行 ID と一致するとは限りません。

## ユーザー定義のインスタンス ID {#user-defined-instance-ids}

開始時には任意で ID を指定できます。ユーザー定義 ID は、英字、数字、`.`、`_`、`-`、`:` のみを使う191文字以内の URL 安全な文字列でなければなりません。

```php
$workflow = WorkflowStub::make(MyWorkflow::class, 'order-123');
```

後でワークフローを参照するときは独自 ID で読み込めます。

```php
$workflow = WorkflowStub::load('order-123');
```

### 呼び出し元が指定する ID の選択 {#choosing-a-caller-supplied-id}

1つのビジネス操作を一貫して識別する ID を選びます。同じ開始のリトライでは同じ ID を使い、別の操作には新しい ID を生成します。ストアを共有するアプリ間の衝突を防ぐため、ワークフロー型の接頭辞と、必要なら不透明なテナント参照を含めます。たとえば `order:tenant-7f2:01J9Z6K6Z2EPV5G0C3R8F4M9AN` は接頭辞と衝突耐性のある識別子を組み合わせています。テナント接頭辞は命名規約であり、認可の境界ではありません。名前空間の分離は別途設定します。

ID は[重複開始ポリシー](../configuration/options.md)を上書きしません。既定では重複開始を拒否します。`ReturnExistingActive` は別の実行を開始したり元の引数を置換したりせずに、既存のアクティブなワークフローを返せます。完了したインスタンスの ID は予約されたままで、型を変えても再利用できません。

### ID は可視のメタデータ {#ids-are-visible-metadata}

インスタンス ID は Waterline、URL、CLI 出力、ログ、履歴エクスポート、データベースに平文で現れます。ペイロード暗号化を含むコーデックはこれらの識別子を保護しません。メールアドレス、氏名、アクセストークンなどの個人情報や秘密の代わりに不透明な参照を使ってください。機密のビジネス情報は、アプリのデータ処理方針で保護するペイロードフィールドに保存します。推測困難な ID は認可の代わりにはなりません。

## アクティビティとワークフロー内での ID の参照 {#accessing-ids-inside-activities-and-workflows}

アクティビティ内:

```php
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public function handle(): void
    {
        $id = $this->workflowId();
        $runId = $this->runId();
    }
}
```

ワークフロー内では、`$this->workflowId()` はインスタンス ID を、`$this->runId()` は現在実行中の選択された実行 ID を返します。
