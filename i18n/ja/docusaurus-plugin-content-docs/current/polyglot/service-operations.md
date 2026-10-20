---
title: 名前空間をまたぐサービス呼び出し
description: サービス操作を公開し、別の名前空間から永続的に呼び出します。
---

# 名前空間をまたぐサービス呼び出し {#cross-namespace-service-calls}

サービス操作は Nexus 操作とも呼ばれ、同じ Durable Workflow クラスター内の名前空間間でサポートされる永続的な呼び出しです。対象名前空間とエンドポイント/サービス/操作の組で指定します。子ワークフローや通常のシグナルは自身の名前空間に留まります。キュー名や言語を変えても、この規則は変わりません。

## サポートされる記述インターフェースを選ぶ {#choose-a-supported-authoring-surface}

| 呼び出し元 | 公開済みのインターフェース | 対象名前空間 |
| --- | --- | --- |
| 埋め込み PHP | `Workflow::serviceOperation()` またはヘルパー `serviceOperation()` | `ServiceOperationOptions(targetNamespace: 'billing')` |
| PHP SDK | `WorkflowContext::serviceOperation()` | 配列オプション `['namespace' => 'billing']` |
| Python SDK | `yield context.call_nexus_service(...)` | キーワード引数 `target_namespace='billing'` |
| Rust SDK | Nexus 待機を記述する機能は未公開 | [Rust SDK #86](https://github.com/durable-workflow/sdk-rust/issues/86)で追跡中です。保留中のドラフトはインストール済み製品の対応を意味しません。 |

Laravel ワークフローには[埋め込みの例](../features/service-operations.md)、順次記述する Worker API には [PHP SDK のサービス呼び出し例](https://php.durable-workflow.com/build/workflows-activities/)、ジェネレーター形式には [Python ワークフローリファレンス](https://python.durable-workflow.com/reference/workflow/)を使ってください。呼び出し元をデプロイする前に、接続先ランタイムが公開するサービス操作の契約を確認します。クライアント管理 API だけでは、ワークフロー Worker の対応は証明できません。

PHP SDK では現在、名前空間をまたぐ呼び出しに配列オプションを使います。同等の型付きオプションは [PHP SDK #193](https://github.com/durable-workflow/sdk-php/issues/193)で追跡しています。

## 対象操作を公開する {#publish-the-target-operation}

対象名前空間がエンドポイント、サービス、操作、ハンドラーの Worker を所有します。まず名前空間を作成し、選んだキューで対象のワークフロー型を登録する Worker を実行します。このカタログは名前空間 `billing`、ワークフロー型 `billing.invoice`、キュー `billing` を使います。

カタログの変更には管理者の認証情報が必要です。リースを持つワークフローがサービスコマンドを送信する際、ランタイムは呼び出し元の権限を別途検証します。

```bash
curl --fail-with-body -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/service-endpoints" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: billing" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"endpoint_name":"billing"}'

curl --fail-with-body -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/service-endpoints/billing/services" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: billing" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"service_name":"invoices"}'

curl --fail-with-body -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/service-endpoints/billing/services/invoices/operations" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: billing" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"operation_name":"create","operation_mode":"sync","handler_binding_kind":"start_workflow","handler_target_reference":"billing.invoice","handler_binding":{"workflow_type":"billing.invoice","queue":"billing"},"deadline_policy":{"timeout_seconds":30}}'
```

カタログ名は小文字に正規化されます。エンドポイントとサービスのレコードは操作を整理するもので、実際のハンドラーの代わりにはなりません。対象名前空間で互換性のある Worker を利用可能にしてください。登録だけでは処理の実行を証明できません。

## 待機と記録済みの結果 {#waiting-and-recorded-results}

PHP SDK の既定値は `mode_override=sync` と `wait_for=completed` です。Python は `mode='sync'` と `wait_for='completed'` を使います。どちらもサービスが永続的な終端結果に達するまで中断し、元の呼び出し位置で記録済みの結果または型付きの失敗をリプレイします。保留中や開始済みの呼び出しは業務上の成功結果ではありません。

受け付けだけを待つ場合、PHP は `wait_for='accepted'` または `mode_override='async'` を使います。Python は `wait_for='accepted'`、`mode='async'`、ヘルパー `start_nexus_operation()` に対応します。確認用に返された呼び出し id を保存してください。後の完了は呼び出し元の元の記録済み受け付けを置き換えません。ワークフロー判断に対象結果が必要なら、完了待ちを選びます。

上記のように、カタログの `deadline_policy` でサービス実行を制限します。正の整数 `timeout_seconds` またはオフセット付き RFC3339 `deadline_at` のどちらか一つだけを指定できます。ランタイムは元の受け付けから一つの `call_deadline_at` を記録します。リプレイ、再試行、後のカタログ編集でリセットされることはありません。null ポリシーは新しいサービス期限を作りません。

呼び出し元の `wait_timeout_seconds` を実行タイムアウトとして使わないでください。カタログに期限がなければ、一秒の待機オプションでも、三秒後に完了する対象の結果を返すことがあります。タイムアウト後は元の呼び出しと関連する対象を調べます。期限切れは外部への作用がなかった証拠ではなく、対象のキャンセルは別のポリシーです。

## 失敗、再試行、冪等性 {#failures-retries-and-idempotency}

PHP はサービスの終端失敗を `ServiceOperationFailed` で公開し、Python は yield の位置で `NexusOperationFailed` を送出します。エラーを処理するときは型付きの詳細と呼び出し id を保持してください。想定内の業務上の失敗はワークフローコードで扱い、想定外のものはワークフローの失敗として残せます。

記録済みのサービス再試行ポリシーはランタイムが管理します。ワークフローコード内に二重の HTTP 再試行ループを加えないでください。通常の呼び出しでは PHP と Python が安定したキーを生成します。アプリケーションがキーを指定する場合、再試行とリプレイで対象、リクエスト、意図する操作を同一に保ちます。新しいキーは新たな業務リクエストであり、失われた確認の復旧ではありません。

開いている履歴では、対象名前空間、カタログの組、ペイロード、待機オプションを安定させます。この永続的な意図を変える場合は、ワークフローのバージョン分岐を使います。

## 名前空間の境界を適用する {#enforce-the-namespace-boundary}

名前空間間の既定値は `allow` です。認証、ロール検証、他の境界ポリシー、名前空間の認可は引き続き適用されます。呼び出し元の識別情報はリースを持つワークフローから取得され、アプリケーション入力で別の呼び出し元名前空間を名乗ることはできません。

セルフホストの PHP Server で名前空間間のサービス呼び出しを拒否するには、API/Worker の各ロールを同じ設定で構成し、再起動します。

```bash
DW_SERVICE_BOUNDARY_CROSS_NAMESPACE_DEFAULT=deny
```

このポリシーはハンドラーへ渡す前に名前空間間の呼び出しを拒否します。同じ名前空間内の呼び出しと他の境界ポリシーも引き続き確認が必要です。この変数を認証情報やテナント ACL の代わりにしないでください。

## 元の呼び出しを調べる {#inspect-the-original-call}

[サービス呼び出し詳細とカタログ API](./server-api-reference.md#service-catalog-admin-apis)、または [CLI のサービス呼び出し検査](./cli-reference.md#service-call-inspection)を使います。呼び出し元のワークフロー/実行 id と対象サービス呼び出し id を一緒に保持してください。読み取り専用の検査は新しい実行を要求しません。レスポンスの紛失や Worker 交換を確認するときは、元の id を再利用します。
