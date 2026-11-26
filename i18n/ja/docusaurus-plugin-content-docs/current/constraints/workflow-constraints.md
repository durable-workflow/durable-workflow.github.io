---
sidebar_position: 2
title: ワークフローの制約
description: リプレイの決定性を保ち、起動時に安全でない呼び出しを検出します。
---

# ワークフローの制約 {#workflow-constraints}

ワークフロークラスは、時間とともに変わる外部状態やサービスに依存できません。現在日時、現在のユーザー、外部ネットワークリソースなど、変化しうる情報を直接使わないでください。

ワークフロー内では次の操作を避けます。

- 現在日時を読む `Carbon::now()` は、呼び出すたびに値が変わります。`Workflow\V2\Workflow::now()` または `Workflow\V2\now()` を使うと、リプレイに安全なワークフロー時刻を得られます。
- 現在のユーザーを読む `Auth::user()` は、ログイン中のユーザーに依存します。開始時にユーザーを入力として渡してください。
- 外部ネットワークへの直接リクエストは、応答、速度、可用性が変化します。必要なデータを開始時の入力に渡すか、アクティビティで取得してください。
- `sideEffect` に結果を記録する場合を除き、乱数生成器などのランダムな値を使わないでください。必要な値を開始時の入力に渡す方法もあります。

## ワークフローコードからのロギング {#workflow-logging}

エンジンはワークフローが起動するたびに履歴からリプレイするため、ワークフローコード内の通常のログ呼び出しは完了したステップごとに書き直されます。50 ステップのワークフローは最初の行を 50 回記録します。代わりにリプレイ対応ロガーを使ってください。コードが初めて実行されるときだけ書き込みます。組み込みワークフロー、PHP SDK、Rust のロガーは、各行に実行の識別情報も付けます。

- 組み込みワークフロー（Workflow 2.42.0 以降）: `$this->logger()` は PSR-3 ロガーを返し、Laravel のロガー、または `$this->logger('workflow')` のように渡したチャネルを通じて書き込みます。各行には `workflow_instance_id`、`workflow_run_id`、`workflow_type`、`namespace` が含まれます。`$this->replayState()` は `Workflow\V2\Enums\WorkflowReplayState`（`Replaying`、`Executing`、`Unavailable`）を返し、`$this->isReplaying()` はその真偽値版です。
- PHP SDK: `$context->logger()` は `Worker` の PSR-3 ロガーを通じて書き込みます。[PHP SDK ガイド](../polyglot/php.md#workflow-logging)を参照してください。
- Rust SDK: `ctx.logger()`。[Rust SDK 4.17 のワークフローロガー](../polyglot/rust.md#workflow-logging)を参照してください。
- Python SDK: `ctx.logger`。リプレイ中は何も書き込みませんが、実行の識別情報は付けません。

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

final class ShipOrderWorkflow extends Workflow
{
    public function handle(string $orderId): string
    {
        $this->logger()->info('Shipping started', ['order_id' => $orderId]);
        $label = activity(PrintLabelActivity::class, $orderId);
        $this->logger()->info('Label printed', ['label' => $label]);

        return $label;
    }
}
```

クエリと更新バリデーターは常にリプレイなので、ログを書きません。

組み込みワークフローでは、ワークフロータスクのデータベーストランザクションがコミットされた後に行が書き込まれるため、ロールバックされたタスクは何も書き込みません。ステップを記録せずに保留中の `select()` ハンドルで待機するコードは、その待機を抜けたタスクで一度だけログを書きます。ライブで実行された更新ハンドラーの行は、更新が適用されたときに書き込まれます。PHP SDK では、Server がワークフロータスクを受理した後に行が書き込まれます。[PHP SDK ガイド](../polyglot/php.md#workflow-logging)を参照してください。

ロギングはプロセスの観測です。永続ワークフローコマンドを、リプレイ状態の観測やログ配送に依存させないでください。リプレイ対応ロガーは exactly-once outbox ではありません。組み込みまたは PHP SDK の Worker がコミットまたは受理と書き込みの間に停止すると、それらの行は失われます。Rust のロガーは、クラッシュや再試行の後に未確定の試行のメッセージを繰り返すことがあります。ホストのハンドラーは有界かつ非ブロッキングにして、ロギングで Worker を止めないでください。永続的な業務効果は、適切なアクティビティまたは記録されるワークフロー操作に置いてください。

## 起動時のチェック {#boot-time-guardrails}

`workflows.v2.types.workflows` に登録したクラスは、アプリ起動時にスキャンされます。`Carbon::now()`、`Auth::user()`、`DB::`、`Http::`、`random_int()` など、明らかにリプレイに安全でない呼び出しを検出します。`workflows.v2.guardrails.boot` で対応を指定します。

| モード | 動作 |
| --- | --- |
| `warn`（既定） | 検出ごとに警告を記録し、アプリの起動を妨げません。 |
| `silent` | 起動時スキャンを省略します。 |
| `throw` | 最初の検出で `LogicException` を投げます。CI に適しています。 |

```php
// config/workflows.php
'v2' => [
    'guardrails' => [
        'boot' => env('DW_V2_GUARDRAILS_BOOT', 'warn'),
    ],
],
```

CI では `DW_V2_GUARDRAILS_BOOT=throw` にして、安全でないリプレイ呼び出しの追加を拒否します。本番では `warn` を使い、未検出の問題がデプロイを停止させないようにします。

### スキャンが検査する内容 {#scan-coverage}

スキャンは字句的です。ワークフロークラス、その親クラス、トレイトだけを読み、次を検出します。

- 現在時刻の読み取り：`time()`、`date()`、`microtime()`、`hrtime()`、`today()`、`Carbon::now()` のような静的呼び出し、および引数なし、または `'now'` や `'+1 day'` などの相対時刻を渡した `new DateTime()`、`new DateTimeImmutable()`、`new Carbon()`、`new CarbonImmutable()`。固定日付は検出しません。
- ランダム性：`random_int()`、`random_bytes()`、`rand()`、`mt_rand()`、`uniqid()`、`shuffle()`、`array_rand()`、`str_shuffle()`、および `Str::uuid()` のようなヘルパー。
- 外部状態：`DB::`、`Cache::`、`Http::`、`Auth::`、`auth()`、`request()`。

ヘルパークラスやサービスクラスを経由した呼び出し、静的プロパティや順序のないデータの順序のようなプロセス状態に依存する値、実行時に決まる内容は検出できません。スキャンで問題がなくても決定性の証明にはなりません。残りを見つけるには、記録済みの履歴に対して[リプレイ検証](../testing.md)を実行してください。

初回リリースのワークフローモードでは、起動時スキャンだけが処理を阻止できるガードレールです。ランタイムはワークフロータスクの取得時に決定性診断を再実行しません。2.0 では、ローカルに登録した PHP ワークフローをデプロイ前に検査し、長期間実行中の定義フィンガープリントの変化は Waterline に表示します。異なるビルド間のタスク取得が、新たなデプロイ障害の原因になるのを避けています。

フィンガープリント記録以前の実行にも、保守的な方針を適用します。新しい `getVersion()` 分岐に到達した実行の `WorkflowStarted` 履歴がフィンガープリントのスナップショットより古い場合、ランタイムは `WorkflowStub::DEFAULT_VERSION` を維持します。現在の定義で安全にリプレイできるとは仮定しません。[バージョン管理](../features/versioning.md)を参照してください。

### コメントと書式の変更 {#comment-only-edits}

既定では、定義フィンガープリントはソース行そのものを対象にします。そのため、ワークフロークラス、その trait や親ワークフロークラス、または `await()` の条件 closure 内で、コメント、docblock、空白だけを編集しても、実行中のランにとっては定義の変更になります。履歴にない `getVersion()` や `patched()` のマーカーは `WorkflowStub::DEFAULT_VERSION` を取り、編集した条件 closure はリプレイを失敗させます。

2.34 以降、ワーカーは代わりに、コメントと空白を除いた PHP コードトークンのフィンガープリント（プレフィックス `sha256-tokens:`）を記録できます。こうした編集ではこの値は変わりません。すべてのワーカーを 2.34 以降に更新してから `DW_DEFINITION_FINGERPRINT_VERSION=v2` で有効にしてください。古いワーカーはそのような実行を変更済みとみなすためです。各実行は記録したフィンガープリントのバージョンを保持します。有効化する前に開始した実行はコメントの編集の影響を受けたままで、`v1` に戻すことは安全です。
