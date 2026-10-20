---
sidebar_position: 5
title: PHP の呼び出し可能なアクティビティハンドラー
description: PHP の InvocableActivityHandler ヘルパーを使い、外部タスク入力エンベロープを受け取り結果エンベロープを返す HTTPS エンドポイントでアクティビティハンドラーをホストします。
tags:
  - external-execution
  - invocable-carrier
  - worker-protocol
keywords:
  - 呼び出し可能なアクティビティハンドラー
  - InvocableActivityHandler
  - 外部タスク入力
  - 外部タスク結果
  - PHP アクティビティアダプター
  - Lambda アクティビティハンドラー
---

# PHP の呼び出し可能なアクティビティハンドラー {#php-invocable-activity-handler}

[呼び出し可能な HTTP キャリア](./invocable-carrier.md)により、Server はロングポーリング Worker を待つ代わりに、リースしたアクティビティタスクを HTTPS エンドポイントへ POST できます。PHP ヘルパー `Workflow\V2\Support\InvocableActivityHandler` は、外部 PHP プロセスがそのリクエストを Server で照合できる結果エンベロープへ変換するための参照実装です。

次の環境にアクティビティハンドラーを接続する際に使います。

- HTTPS 経由で呼び出す AWS Lambda または Google Cloud Function
- 薄い HTTP サービスの背後に置く Laravel コントローラー
- アクティビティキューごとに1つの POST エンドポイントを公開するコンテナ

ヘルパーはキャリアに依存しない外部タスク入力エンベロープを解析し、登録した callable を検索し、リースの期限を強制し、Server が期待する失敗の構造も含めて、キャリアに依存しない外部タスク結果エンベロープを出力します。

## クイックスタート {#quick-start}

外部プロセスに Durable Workflow パッケージをインストールし、アクティビティハンドラー名ごとに callable を登録して、リクエスト本文を `handle()` へ渡します。

```php
use Workflow\V2\Support\InvocableActivityHandler;

$handler = new InvocableActivityHandler([
    'billing.charge-card' => static function (int $amount, string $currency): array {
        // Real charge-card logic. Must be idempotent per task id.
        return [
            'approved' => true,
            'amount' => $amount,
            'currency' => $currency,
        ];
    },
]);

$envelope = json_decode(file_get_contents('php://input'), associative: true);
$result = $handler->handle($envelope);

header('Content-Type: application/vnd.durable-workflow.external-task-result+json');
echo json_encode($result, JSON_UNESCAPED_SLASHES);
```

ハンドラーは入力エンベロープを受け取り、結果エンベロープを返します。キャリア契約（HTTPS、POST、認証、タイムアウト、再試行の上限）は呼び出し可能な HTTP キャリアが管理します。PHP ヘルパーは引数のデコード、ハンドラーのディスパッチ、期限の強制、結果のエンコード、失敗の分類を管理します。

## ハンドラーの登録 {#registering-handlers}

最初のコンストラクター引数は、Server が入力エンベロープで送る `task.handler` 値をキーにしたマップです。この値は外部エグゼキューター設定の一致するエントリーの `handler` フィールドです。

```php
new InvocableActivityHandler(
    handlers: [
        'billing.charge-card' => [$billingService, 'chargeCard'],
        'billing.refund' => [$billingService, 'refund'],
        'ops.rotate-key' => static fn (string $keyId): array => $keys->rotate($keyId),
    ],
    carrier: 'billing-lambda',
    resultCodec: 'avro',
);
```

未登録の `task.handler` を持つ入力は、`failure.kind = application`、`classification = application_error`、`type = UnknownActivityHandler` の `failed` 結果を生成します。Server 側では設定されたアクティビティ再試行ポリシーが引き続き適用されます。

任意の `carrier` 名は、すべての結果エンベロープの `metadata.carrier` に含まれ、運用担当者がレスポンスを生成した外部ランタイムを判別できます。安定していて機密情報を含まない識別子（`billing-lambda`、`ops-cloud-run`、`laravel-admin-api`）を使ってください。

任意の `resultCodec` は戻り値を `result.payload.blob` にシリアライズする方法を制御します。既定は `avro` で、PHP Worker がすでに永続ペイロードに使うコーデックと一致します。結果コーデックは Server の `CodecRegistry` が認識するものでなければなりません。`protobuf` は受け入れず、コンストラクターで即時に失敗します。

## 結果エンベロープ {#result-envelope}

成功時、`handle()` はキャリアに依存しない成功エンベロープを返します。

```json
{
  "schema": "durable-workflow.v2.external-task-result",
  "version": 1,
  "outcome": {
    "status": "succeeded",
    "recorded": true
  },
  "task": {
    "id": "acttask_01HV7D3G3G61TAH2YB5RK45XJS",
    "kind": "activity_task",
    "attempt": 1,
    "idempotency_key": "attempt_01HV7D3KJ1C8WQNNY8MVM8J40X"
  },
  "result": {
    "payload": {
      "codec": "avro",
      "blob": "<base64-encoded payload>"
    },
    "metadata": {
      "content_type": "application/vnd.durable-workflow.result+json"
    }
  },
  "metadata": {
    "handler": "billing.charge-card",
    "carrier": "billing-lambda",
    "duration_ms": 42
  }
}
```

`task.id`、`task.attempt`、`task.idempotency_key` フィールドは入力エンベロープからコピーするため、Server は結果を元のリースと照合できます。

失敗時、`handle()` は失敗エンベロープを返します。`failure` ブロックには種類、分類、メッセージ、発生元の PHP 型、スタックトレース、再試行可能かどうかを含みます。期限による失敗には `deadline` 名と `expires_at` 値も含みます。

```json
{
  "schema": "durable-workflow.v2.external-task-result",
  "version": 1,
  "outcome": {
    "status": "failed",
    "retryable": true,
    "recorded": true
  },
  "task": {"id": "...", "kind": "activity_task", "attempt": 1, "idempotency_key": "..."},
  "failure": {
    "kind": "timeout",
    "classification": "deadline_exceeded",
    "message": "Invocable activity task received after lease.expires_at.",
    "type": "ExternalTaskDeadlineExceeded",
    "stack_trace": null,
    "timeout_type": "deadline_exceeded",
    "cancelled": false,
    "details": {
      "deadline": "lease.expires_at",
      "expires_at": "2026-04-22T15:14:02.000000Z"
    }
  },
  "metadata": {"handler": "billing.charge-card", "carrier": "billing-lambda", "duration_ms": 3}
}
```

## 失敗の分類 {#failure-taxonomy}

| `failure.kind` | `classification` | 再試行可能 | 発生条件 |
| --- | --- | --- | --- |
| `timeout` | `deadline_exceeded` | はい | エンベロープ到着時にリースまたは入力の期限がすでに切れていた、または実行中にいずれかの期限が切れてからハンドラーが戻った。 |
| `decode_failure` | `decode_failure` | いいえ | 宣言したコーデックで引数をデコードできない、期限文字列を解析できない、パラメーターでハンドラーが `TypeError` / `ValueError` を送出した、または設定した結果コーデックで成功ペイロードを再エンコードできない。 |
| `application` | `application_error` | 送出された例外による | ハンドラーが例外を送出した。例外が `Workflow\Exceptions\NonRetryableExceptionContract` を実装する場合 `retryable` は `false`、それ以外は `true`。メッセージは例外メッセージで、`type` は例外クラス。 |
| `application` | `application_error` | いいえ | `task.kind` が `activity_task` ではない、または `task.handler` がマップに登録されていない。 |

ヘルパーは生の例外を返しません。すべてのコード経路で構造化結果エンベロープを生成するため、呼び出し可能なキャリアはレスポンスを決定的に照合できます。

## 期限と冪等性 {#deadlines-and-idempotency}

入力エンベロープには有効な `lease.expires_at` と、宣言されたアクティビティの期限（`schedule_to_start`、`start_to_close`、`schedule_to_close`、`heartbeat`）が入ります。ヘルパーはすべてを検査します。

- ハンドラーをディスパッチする前に、期限切れの項目が1つでもあれば `timeout` 失敗で早期に終了し、`details.deadline` に期限切れのフィールドを示します。登録した callable は呼び出しません。
- ハンドラーが戻った後、期限を再検査します。リースより長く動いたハンドラーは同じ `timeout` 失敗となり、戻り値はエンベロープから破棄します。

キャリアはトランスポート配信を再試行し、ランタイムは未報告のリースを再配信するため、同じ `task.id` と `task.idempotency_key` が複数回届く場合があります。ハンドラーコードは冪等でなければなりません。各エンベロープの冪等性キーは、同じ試行の再試行を通して安定しています。

## ペイロードコーデックと外部ストレージ {#payload-codecs-and-external-storage}

引数ペイロードは `codec` フィールド付きの `payloads.arguments` に届きます。ヘルパーは Server の `CodecRegistry` でデコードします。公開 v2 コーデックは `avro` だけです。`json`、未知のコーデック、不正またはタグのない blob は安全側に失敗します。JSON は HTTP キャリアのドキュメント形式であり、永続ペイロードコーデックではありません。

ワークフロー入力が設定された[外部ペイロードストレージ](../features/external-payload-storage.md)のしきい値を超えると、Server は設定済みドライバーへバイト列を保存し、インライン blob の代わりに参照エンベロープを送ります。`ExternalPayloadStorageDriver` をコンストラクターへ渡すと、ヘルパーはハンドラーを呼ぶ前に参照を解決できます。

```php
use Workflow\V2\Contracts\ExternalPayloadStorageDriver;
use Workflow\V2\Support\InvocableActivityHandler;

$handler = new InvocableActivityHandler(
    handlers: $handlers,
    carrier: 'billing-lambda',
    resultCodec: 'avro',
    externalStorage: $driver,
);
```

参照、ハッシュ、コーデックがすべて一致するように、ドライバーは Server がペイロードの書き込みに使うものと同じ契約を満たす必要があります。外部プロセスが解決できない参照は、黙って空のペイロードになるのではなく `decode_failure` を生成します。

## 本番環境への接続 {#production-wiring}

単一の POST ルートでハンドラーをホストする Laravel コントローラーは次のようになります。

```php
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Workflow\V2\Support\InvocableActivityHandler;

final class BillingActivityController
{
    public function __construct(private readonly InvocableActivityHandler $handler) {}

    public function __invoke(Request $request): JsonResponse
    {
        $result = $this->handler->handle($request->all());

        return new JsonResponse(
            data: $result,
            headers: ['Content-Type' => 'application/vnd.durable-workflow.external-task-result+json'],
        );
    }
}
```

外部エグゼキューター設定でこのコントローラーの前面の HTTPS URL を指定し、ルートを認証するために `auth_ref` を宣言してください。ループバック HTTP の例外は開発時の反復にだけ適用されます。

## 関連サーフェス {#related-surfaces}

- [呼び出し可能な HTTP キャリア](./invocable-carrier.md): 入力エンベロープを配信し、結果エンベロープを照合する Server 側のキャリア契約。
- [外部実行サーフェス](./external-execution.md): ヘルパーが実装する入力・結果エンベロープのスキーマを含む、キャリアに依存しない製品の境界。
- [外部ペイロードストレージ](../features/external-payload-storage.md): 大きすぎる引数や結果を設定済みドライバーへ退避し、検証可能な参照エンベロープとして表す方法。
- [Worker プロトコル](./worker-protocol.md): 呼び出し可能なキャリア契約をポーリング型ハンドラーの構造とともに公開する、より広い Worker プレーンの契約。
