---
sidebar_position: 11
---

# Saga {#sagas}

このガイドでは `Workflow\V2\Workflow` を使用する、Laravel 組み込みワークフローの補償処理を説明します。service モードの Worker については、[PHP SDK ガイド](https://php.durable-workflow.com/build/workflows-activities/)、[Python SDK ガイド](https://python.durable-workflow.com/sdk-reference/#saga-compensation)、[Rust SDK リファレンス](https://rust.durable-workflow.com/durable_workflow/struct.Saga.html)を参照してください。

Saga は、複雑で長時間の処理を管理するための設計パターンです。

- Saga は一連のローカルトランザクションで分散トランザクションを管理します。
- ローカルトランザクションは、Saga の参加者（アクティビティ）が行う作業単位です。
- Saga の各操作は、補償アクティビティで取り消せます。
- 補償をいつ呼ぶかはワークフローコードが決めます。補償自体も失敗し得るため、完了には時間と正常な Worker が必要です。

```php
use function Workflow\V2\activity;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

#[Type('booking-saga')]
class BookingSagaWorkflow extends Workflow
{
    public function handle(): array
    {
        try {
            $flightId = activity(BookFlightActivity::class);
            $this->addCompensation(fn () => activity(CancelFlightActivity::class, $flightId));

            $hotelId = activity(BookHotelActivity::class);
            $this->addCompensation(fn () => activity(CancelHotelActivity::class, $hotelId));

            $carId = activity(BookRentalCarActivity::class);
            $this->addCompensation(fn () => activity(CancelRentalCarActivity::class, $carId));

            return compact('flightId', 'hotelId', 'carId');
        } catch (\Throwable $e) {
            $this->compensate();

            throw $e;
        }
    }
}
```

ワークフローが例外を捕捉すると、`$this->compensate()` は登録したすべての補償を**逆順**で実行します。上の例では、`BookRentalCarActivity` が失敗した場合、ホテル、次にフライトをキャンセルし、最新の手順からさかのぼって Saga を取り消します。

それぞれの順方向アクティビティが成功してから補償を登録します。Replay は登録順を再構成し、完了済みの補償を含め、記録済みのアクティビティ結果を再利用します。

## 期限に応じた補償処理 {#deadline-driven-compensation}

エンジンの[ワークフロータイムアウト](./timeouts.md#timeout-outcome-and-cleanup)は、ワークフローコードが補償を実行する前に実行を閉じます。`catch` や `finally` はこの動作を変えません。即時の `cancel()` と `terminate()` にもクリーンアップ猶予はありません。

タイムアウト時に完了済み作業を取り消したい場合は、アプリケーション側に早い期限を設けます。この組み込みワークフローはリソースを予約し、確認シグナルを最大 30 秒待ちます。待機が期限切れになるとコードが再開し、予約を解放してから業務結果 `expired` を返します。

```php
use function Workflow\V2\{activity, await};
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Support\ActivityOptions;
use Workflow\V2\Workflow;

#[Type('reservation-deadline')]
#[Signal('confirm')]
final class ReservationDeadlineWorkflow extends Workflow
{
    public function handle(string $orderId): array
    {
        $reservationId = activity(
            ReserveResourceActivity::class,
            new ActivityOptions(scheduleToCloseTimeout: 30),
            $orderId,
        );
        $this->addCompensation(fn () => activity(
            ReleaseResourceActivity::class,
            new ActivityOptions(scheduleToCloseTimeout: 30),
            $reservationId,
        ));

        if (await('confirm', timeout: 30) === null) {
            $this->compensate();

            return ['status' => 'expired'];
        }

        return ['status' => 'confirmed'];
    }
}
```

`ReserveResourceActivity` と `ReleaseResourceActivity` はアプリケーションのアクティビティです。予約を識別する安定した業務キーを使い、両方を冪等にしてください。待機は予約成功後に始まります。引数なしで `confirm` を送れば、成功時は `true`、待機期限切れは `null` になります。

最後の安全上限として、より長いエンジンの制限を設定して開始します。

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(ReservationDeadlineWorkflow::class, 'order-123');
$workflow->start(
    'order-123',
    StartOptions::rejectDuplicate()->withRunTimeout(300),
);

// From an authenticated application action, before the wait expires:
WorkflowStub::load('order-123')->signal('confirm');
```

待機が期限切れになり、補償が成功すると、出力が `status: expired` の正常完了になります。エンジンによるタイムアウトではありません。解放アクティビティが失敗したら、`compensate()` はその失敗を伝播します。エンジンの期限が先に来れば実行は閉じ、残る補償は実行できません。スケジュールと再試行の時間を確保し、より早い実行全体の期限がある場合も考慮してください。

実行が有効な間に呼び出し元がクリーンアップを要求するには、別の協調的 `requestCancellation()` 操作を使用できます。キャンセル要求中の永続クリーンアップには、上限付きのキャンセルシールドを使います。ワークフローのタイムアウトが自動的にこれを起動することはありません。[協調的キャンセル](../polyglot/cancellation.md)を参照してください。

## 補償処理の順序 {#compensation-ordering}

既定では、補償は**登録の逆順で逐次実行**されます。後の手順が前の手順に依存する場合があるため、最も安全な既定動作です。

既定の `compensate()` は最初の補償失敗で停止し、その失敗を呼び出し元に伝播します。

## 並列の補償処理 {#parallel-compensation}

補償を並列に実行するには、`setParallelCompensation(true)` を使います。有効時は各補償クロージャから、開始済みでまだ待機していないアクティビティ呼び出しを返し、エンジンが同時実行できるようにしてください。

```php
use function Workflow\V2\activity;

use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

#[Type('parallel-saga')]
class ParallelSagaWorkflow extends Workflow
{
    public function handle(): void
    {
        $this->setParallelCompensation(true);

        try {
            $flightId = activity(BookFlightActivity::class);
            $this->addCompensation(fn () => activity(CancelFlightActivity::class, $flightId));

            $hotelId = activity(BookHotelActivity::class);
            $this->addCompensation(fn () => activity(CancelHotelActivity::class, $hotelId));

            activity(ChargePaymentActivity::class);
        } catch (\Throwable $e) {
            $this->compensate();

            throw $e;
        }
    }
}
```

並列補償を有効にすると、補償クロージャが返したアクティビティ呼び出しを、エンジンが集めて `all()` で実行します。

## エラーがあっても継続する {#continue-with-error}

既定では補償アクティビティが例外を投げると、残る補償をスキップしてエラーを伝播します。個々の失敗に関係なく全補償を実行するには、`setContinueWithError(true)` を使います。

```php
$this->setContinueWithError(true);
```

有効にすると、各補償クロージャの例外をエンジンが捕捉して破棄し、次の補償へ進みます。補償が独立しており、一部が失敗しても可能な限りクリーンアップを行いたい場合に便利です。

### 両方のフラグを組み合わせる {#combining-both-flags}

`setParallelCompensation(true)` と `setContinueWithError(true)` は組み合わせられます。両方が有効なら `all()` で全補償を同時実行し、補償の例外を捕捉して残りも完了させます。`setContinueWithError(true)` がなければ、並列補償の失敗を直ちに伝播し、ワークフローも失敗します。

```php
$this->setParallelCompensation(true);
$this->setContinueWithError(true);
```

## 仕組み {#how-it-works}

- `addCompensation()` は、`compensate()` 中に呼び出す callable を登録します
- `compensate()` は登録した補償を逆順に処理します
- 各補償クロージャは通常の V2 ワークフローステップです。呼び出すアクティビティは、通常と同じ永続履歴イベントを作ります
- 補償アクティビティは Waterline のタイムラインと履歴エクスポートに表示されます
- ワークフローが成功した場合、補償クロージャは呼ばれず、履歴も作りません

## このパターンを実行する {#run-this-pattern}

[Sample App](/docs/sample-app) の、シグナルで進む旅行代理店 Saga がこのページの実行可能なリファレンスです。サンプルアプリをクローンし、`OPENAI_API_KEY` を設定して、次を実行してください。

```bash
php artisan app:ai
```

`App\Workflows\Ai\AiWorkflow` は各予約アクティビティの補償を登録します。ホテル予約成功後にフライトが失敗すると、補償一覧を使ってホテル予約を取り消します。このページと同じパターンであり、イベントは Waterline の実行タイムラインで確認できます。
