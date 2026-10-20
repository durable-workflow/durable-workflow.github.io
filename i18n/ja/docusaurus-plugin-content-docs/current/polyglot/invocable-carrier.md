---
sidebar_position: 4
title: 呼び出し可能な HTTP キャリア
description: アクティビティ専用の invocable_http キャリアを設定し、Server がリースしたアクティビティタスクを HTTPS ハンドラーへ POST して構造化された結果を照合できるようにします。
tags:
  - external-execution
  - invocable-carrier
  - worker-protocol
keywords:
  - 呼び出し可能なキャリア
  - invocable_http
  - 外部エグゼキューター設定
  - アクティビティ HTTP ハンドラー
  - 外部タスク入力エンベロープ
  - 外部タスク結果エンベロープ
---

# 呼び出し可能な HTTP キャリア {#invocable-http-carrier}

呼び出し可能な HTTP キャリアは、[外部実行サーフェス](./external-execution.md)で定義された最初の具体的なキャリアです。`GET /api/cluster/info` の `worker_protocol.invocable_carrier_contract` で、`schema: durable-workflow.v2.invocable-carrier.contract`、`version: 1`、`carrier_type: invocable_http` として公開します。

設定されたハンドラーマッピングが `invocable_http` キャリアに解決されると、Server はキャリアに依存しない[外部タスク入力エンベロープ](./external-execution.md#published-contract-seams)で設定済みエンドポイントを呼び出し、レスポンスを[外部タスク結果エンベロープ](./external-execution.md#published-contract-seams)に照らして照合します。ワークフロータスク、シグナル・更新の順序、リプレイ、履歴の変更は Server 内に残ります。キャリアは宣言された入力と結果のエンベロープを HTTPS 境界の向こうへ運ぶだけです。

## 用途 {#what-it-is}

このキャリアは、運用チームがロングポーリング Worker よりも HTTPS ハンドラーとしてホストしたい、アクティビティ相当の処理に使います。

- 内部 HTTP サービスでホストするオペレーターの保守アクティビティとプラットフォーム自動化
- すでに HTTPS エンドポイントで終わる、範囲を制限した統合の引き継ぎ
- アクティビティ型ごとに1つの POST ルートを公開するサーバーレスまたはコンテナ型のアクティビティハンドラー

アクティビティの実行は設定済みエンドポイントへ委譲します。永続ワークフローの状態、履歴、アクティビティ完了の契約は Server が引き続き所有します。

## アクティビティ専用のスコープ {#activity-only-scope}

公開マニフェストはキャリアのスコープを `task_kinds: [activity_task]` に固定し、設定によって境界がずれないように対象外の事項を明記します。

- `workflow_task_execution`: ワークフロータスクは実際のワークフローランタイムに残る
- `workflow_replay`: キャリアはワークフロー履歴をリプレイしない
- `history_mutation`: ハンドラーはイベント履歴を直接編集できない
- `generic_webhook_ingress`: 汎用の入口はこのキャリアではなくブリッジアダプターを通す

アクティビティ以外の `kind` を持つハンドラーマッピングや、`activity_task` 以外の機能を持つキャリアマッピングは、アクティビティのポーリングレスポンスに現れる前に、設定検証で `invalid_invocable_carrier_scope` により失敗します。

## HTTPS の対象とメソッド {#https-target-and-method}

キャリアの `target_fields` はマッピングを公開する前に Server が検証します。

| フィールド | 必須 | 許容値 | 補足 |
| --- | --- | --- | --- |
| `url` | はい | 絶対 HTTPS URL、またはループバック開発用の HTTP（`localhost`、`127.0.0.0/8`、`::1`） | URL 内の認証情報（`scheme://user:pass@host`）は禁止。 |
| `method` | いいえ | `POST` | 既定は `POST`。ほかの HTTP メソッドは受け入れない。 |
| `timeout_seconds` | いいえ | 1〜900 の整数 | ハンドラー試行1回のトランスポート期限。タスクの期限は Server・ランタイムが別に強制する。 |
| `retry_policy` | いいえ | オブジェクト（後述） | キャリアが管理するトランスポート再試行の上限。 |

不正な対象は `invalid_carrier_target` で安全側に失敗し、ディスカバリー出力に現れません。

## 認証モデル {#auth-model}

ループバック以外の `invocable_http` マッピングは、外部エグゼキューター設定から `auth_ref` を解決する必要があります。認証なしの呼び出し可能な HTTP は、開発者がローカルで反復できるよう、ループバック HTTP の対象だけに許可します。

- `auth_refs` は設定の最上位で一度宣言し、既定値またはマッピングごとに参照します。対応する型には `profile`、`env`、`token_file`、`mtls`、`signed_headers` があります。
- 有効な `auth_ref` がないループバック以外の対象に解決されるマッピングは、設定検証で `missing_invocable_auth_ref` により失敗します。
- トークン、シークレット、署名、認可ヘッダーは、クラスター診断、`dw server:info` 出力、アクティビティのポーリングレスポンスに表示しません。マッピング診断は、解決した `auth_ref` と機密情報を除去した概要を報告し、認証情報の値は出しません。

運用担当者は機密情報を除去したランタイム診断を読み、使われる認証シークレットを確認できます。Server がシークレット自体を公開することはありません。

## トランスポート再試行と永続アクティビティ再試行 {#transport-retry-versus-durable-activity-retry}

呼び出し可能なキャリアの任意の `retry_policy` は**トランスポート専用**です。ハンドラーが結果を報告する前のキャリアの HTTP 配信を管理します。

| `retry_policy` フィールド | 許容値 | 既定値 | 意味 |
| --- | --- | --- | --- |
| `max_attempts` | 1〜5 の整数 | `1` | 1つのタスクリースに対してキャリアが行う HTTP 配信試行の最大数。 |
| `backoff_seconds` | 各値が 0〜300 の整数配列、最大5要素 | `[]` | 次の HTTP 試行までの試行ごとのバックオフ。 |
| `retryable_status_codes` | `[408, 425, 429, "5xx"]` の部分集合 | `[408, 429, "5xx"]` | トランスポート再試行可能とみなすレスポンスコード。 |

トランスポートの再試行は履歴イベントになりません。Server が知るのはキャリアの最後の試行だけです。ハンドラーが返した構造化された成功・失敗エンベロープ、`failure.kind=timeout, classification=deadline_exceeded` に対応するトランスポートタイムアウト、または不正出力のいずれかになります。

ハンドラーが結果を報告した後も、**永続アクティビティの再試行ポリシーは Server とランタイムが管理します**。タスク単位の再試行、スケジューリング、バックオフは、引き続きワークフロー側で宣言したアクティビティ再試行ポリシーに従います。キャリアの `retry_policy` はそれを延長、上書き、代替しません。

## リクエストとレスポンスのエンベロープ {#request-and-response-envelope}

Server はキャリアに依存しない入力エンベロープを送り、キャリアに依存しない結果エンベロープを期待します。

| 方向 | コンテンツタイプ | スキーマ |
| --- | --- | --- |
| リクエスト | `application/vnd.durable-workflow.external-task-input+json` | `external_task_input_contract` |
| レスポンス | `application/vnd.durable-workflow.external-task-result+json` | `external_task_result_contract` |

ハンドラーは入力エンベロープの `task.id`、`task.attempt`、`task.idempotency_key` を保持し、宣言された成功または失敗のエンベロープを返す必要があります（または不正出力への対応付けを出力して安全側に失敗します）。

キャリアはトランスポートの事実を結果の事実へ決定的に対応付けます。

- トランスポートタイムアウト → `failure.kind=timeout`、`classification=deadline_exceeded`
- 有効な結果エンベロープがない非 2xx レスポンス → `malformed_output`
- レスポンスの不正な JSON またはスキーマ不一致 → `malformed_output`
- 未対応のペイロード参照を参照する結果エンベロープ → `unsupported_payload`

ハンドラーは冪等でなければなりません。キャリアがトランスポート配信を再試行したり、ランタイムが未完了のリースを再配信したりすると、同じ `task.id` と `task.idempotency_key` が複数回届く場合があります。

## 設定例 {#configuration-example}

Server は `DW_EXTERNAL_EXECUTOR_CONFIG_PATH` からハンドラーマッピングを読み、必要に応じて `DW_EXTERNAL_EXECUTOR_CONFIG_OVERLAY` でオーバーレイを選びます。環境変数の完全な一覧は [Server 設定リファレンス](./server-config-reference.md)を参照してください。

次は1つの `invocable_http` キャリアと1つのアクティビティマッピングを登録する最小限の `durable-workflow.external-executor.config` ドキュメントです。

```json
{
  "schema": "durable-workflow.external-executor.config",
  "version": 1,
  "defaults": {
    "profile": "prod",
    "namespace": "operations",
    "task_queue": "operator-tasks",
    "auth_ref": "handler-token"
  },
  "auth_refs": {
    "handler-token": {
      "type": "env",
      "env": "DURABLE_WORKFLOW_HANDLER_TOKEN"
    }
  },
  "carriers": {
    "ops-invocable": {
      "type": "invocable_http",
      "url": "https://handlers.example.com/durable/activity",
      "method": "POST",
      "timeout_seconds": 60,
      "capabilities": ["activity_task"],
      "retry_policy": {
        "max_attempts": 3,
        "backoff_seconds": [2, 5],
        "retryable_status_codes": [408, 429, "5xx"]
      }
    }
  },
  "mappings": [
    {
      "name": "billing.reconcile-ledger",
      "kind": "activity",
      "task_queue": "operator-tasks",
      "activity_type": "billing.reconcile-ledger",
      "carrier": "ops-invocable",
      "handler": "billing.reconcile-ledger",
      "timeout_seconds": 60
    }
  ]
}
```

ループバック開発版では `"url": "http://127.0.0.1:8080/durable/activity"` を使います。ループバック HTTP だけが認証なしを許可する経路なので、`auth_ref` を省略できます。

## 検査と診断 {#inspection-and-diagnostics}

稼働中の Server から公開された呼び出し可能なキャリア契約を表示する CLI コマンドは2つあります。

- `dw server:info` は、スキーマ名、契約バージョン、キャリア型、タスク種別、許可されたリクエスト・レスポンスのコンテンツタイプ、機密情報を除去した外部エグゼキューターマッピング診断を表示します。Server が期待するマッピングを読み込んだことを確認するために使います。
- `dw doctor` は cluster-info 診断を実行して `invocable_carrier_contract` ブロックを表示し、マッピングの広告を妨げた `invalid_carrier_target`、`missing_invocable_auth_ref`、`invalid_invocable_carrier_scope`、`unknown_carrier`、`unknown_auth_ref`、`unknown_handler` のエラーを示します。

アクティビティのポーリングレスポンス自体が、解決したマッピング、認証情報を除去したキャリアの対象、有効な `retry_policy` を報告します。Worker と運用ツールは、設定ファイルの独自コピーをキャッシュせず、これらのフィールドを正本として読みます。

## 共存とロールアウト {#coexistence-and-rollout}

呼び出し可能なキャリアのロールアウト境界は同じマニフェストで公開します。

- マッピングがアクティビティ型固有である場合だけ、ポーリング型キャリアと `invocable_http` キャリアがキューを共有できます。同じ `(task_queue, activity_type)` の組を2つのマッピングが占有できません。
- 運用担当者は、参照される認証情報を削除する前に、呼び出し可能なマッピングを削除するかオーバーレイで無効化する必要があります。マッピングの処理を完了させる前に認証情報を撤去すると、すべての新しい試行は `failure.kind=auth` になり、黙って成功しません。
- キャリアの `retry_policy` は純粋にトランスポート用です。ワークフローが観測するタスク試行数を管理するのは永続アクティビティの再試行ポリシーだけです。

## 関連サーフェス {#related-surfaces}

- [外部実行サーフェス](./external-execution.md): このキャリアが実装する、キャリアに依存しない製品の境界。
- [PHP の呼び出し可能なアクティビティハンドラー](./invocable-php-handler.md): 外部プロセスで入力エンベロープを解析し、アクティビティの callable をディスパッチし、このキャリアが期待する構造化結果エンベロープを出力する PHP ヘルパー。
- [Server 設定リファレンス](./server-config-reference.md): `DW_EXTERNAL_EXECUTOR_CONFIG_PATH` と `DW_EXTERNAL_EXECUTOR_CONFIG_OVERLAY` の環境変数。
- [外部ペイロードストレージ](../features/external-payload-storage.md): 大きすぎるリクエストや結果のペイロードを設定済みドライバーへ退避し、キャリアと同じ入力・結果スキーマの中で検証可能な参照エンベロープとして表す方法。
- [Worker プロトコル](./worker-protocol.md): このキャリアをポーリング型ハンドラーの構造とともに公開する、より広い Worker プレーンの契約。
