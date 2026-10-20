---
sidebar_position: 2
title: アクティビティ
description: 非決定的な副作用、リトライ、ルーティング、呼び出しごとのオプションを扱うアクティビティクラスを定義します。
tags:
  - authoring
  - activities
  - retries
keywords:
  - Durable Workflow のアクティビティクラス
  - アクティビティのオプション
  - 非決定的な副作用
---

# アクティビティ {#activities}

アクティビティは、API リクエスト、データ処理、メール送信などの特定の操作を行う処理単位で、ワークフローから実行できます。

:::note 永続実行の契約
通常の v2 アクティビティは永続キュータスクとして実行されます。ローカルアクティビティは、短い処理を同じプロセスで実行しつつ永続的なアクティビティ履歴を記録する明示的なプリミティブです。複数の永続アクティビティステップで1つの Worker リースが必要なら Worker セッションを使えます。スティッキー実行はサポートされるリプレイ最適化であり、正しさの契約ではありません。正確な契約は[アクティビティの実行モデル](/docs/features/activity-execution-model)、[ローカルアクティビティ](/docs/features/local-activities)、[Worker セッション](/docs/features/worker-sessions)、[スティッキー実行](/docs/features/sticky-execution)を参照してください。
:::

`make:activity` Artisan コマンドで新しいアクティビティを作成できます。

```php
php artisan make:activity MyActivity --v2
```

`Activity` クラスを継承し、`handle()` を実装して定義します。

```php
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public function handle()
    {
        // Perform some work...
        return $result;
    }
}
```

## 実行契約 {#execution-contract}

`activity(...)` の呼び出しごとに履歴へアクティビティコマンドを記録し、Worker が取得する永続キュータスクを作成します。通常のアクティビティは互換性のあるどの Worker でも取得できます。[Worker セッション](/docs/features/worker-sessions)では、ワークフローが明示的にその契約を選択すると、一連のアクティビティ試行を1つのセッションリースに固定できます。

キュー処理をスケジュールせずに安全にリプレイできる値が必要なら、[`sideEffect(...)`](/docs/features/side-effects) を使います。タイムアウト、ハートビート、アクティビティ履歴の意味論を持ち、短くリトライ可能な同一プロセス内の処理には[ローカルアクティビティ](/docs/features/local-activities)を使います。配置モデル全体は[アクティビティの実行モデル](/docs/features/activity-execution-model)、スティッキーリプレイキャッシュの動作は[スティッキー実行](/docs/features/sticky-execution)を参照してください。

## 冪等性と永続的な識別情報 {#idempotency-and-durable-identity}

アクティビティは少なくとも1回実行されます。リトライ、リース失効、再配信により同じ論理アクティビティが複数回観測されるため、副作用やリモートの対象は繰り返しても安全でなければなりません。

関連付けやリモートの重複排除には、アクティビティ内でランタイムの永続識別子を使います。

- `activityId()` はリトライを通して1つの論理アクティビティ実行を識別し、通常のリモート冪等性キーとして使います。
- `attemptId()` はその実行の個別の試行を識別します。
- `attemptCount()` は現在何回目の試行かを示します。

リモートシステムがリトライを同じ論理リクエストとして扱うべきなら `activityId()` を優先します。個別の試行を区別する必要がある場合のみ `attemptId()` を使います。Worker がリモート処理を終えた後にリースを失い、遅れて報告した場合、別の Worker が永続状態の競合に勝っていれば完了報告は拒否されます。それでもリモートの副作用は既に発生している可能性があります。

識別子の運用モデルは[実行保証と冪等性](/docs/constraints/execution-guarantees)、[ハートビート](/docs/features/heartbeats)、[失敗と復旧](/docs/failures-and-recovery)を参照してください。

## 呼び出しごとの上書き {#per-call-overrides}

ルーティングとリトライは既定でクラスの `$connection`、`$queue`、`$tries`、`backoff()` を使います。1つの呼び出しを高優先度キューへ送る、試行回数を増やすなど、個別に上書きする場合は `ActivityOptions` を渡します。

```php
use function Workflow\V2\activity;
use Workflow\V2\Support\ActivityOptions;

$result = activity(
    MyActivity::class,
    new ActivityOptions(queue: 'high-priority', maxAttempts: 5),
    'Taylor',
);
```

タイムアウトとハートビートを含む全フィールドは[アクティビティのオプション](/docs/configuration/options#activityoptions)を参照してください。

## ローカルアクティビティの呼び出し {#local-activity-calls}

短い冪等な副作用を現在のワークフロー Worker プロセス内で実行し、アクティビティのリトライ、タイムアウト、ハートビート、キャンセル、履歴の意味論が必要な場合は `localActivity(...)` を使います。

```php
use Workflow\V2\Support\LocalActivityOptions;
use function Workflow\V2\localActivity;

$receipt = localActivity(
    SendReceiptActivity::class,
    new LocalActivityOptions(maxAttempts: 3, startToCloseTimeout: 10),
    $orderId,
);
```

通常のアクティビティタスクを作らないため、ローカルアクティビティは `connection`、`queue`、Worker セッションのルーティング、schedule-to-start オプションを拒否します。完全な契約は[ローカルアクティビティ](/docs/features/local-activities)を参照してください。
