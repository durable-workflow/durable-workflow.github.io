---
title: 協調キャンセル
description: ワークフロー、その子、アクティビティ全体に、時間を制限したクリーンアップを要求します。
---

# 協調キャンセル {#cooperative-cancellation}

Server 2.5.0 はプロトコル 1.20 による協調キャンセルを追加します。協調を明示的に有効にした Worker が必要です。使用前にランタイムのディスカバリーと SDK の機能対応を確認してください。

## クリーンアップを要求する {#request-cleanup}

PHP SDK では `requestCancellation()`、Python または Rust では `request_cancellation()`、あるいは Server の `request-cancellation` ルートを使います。ワークフローコードが要求を処理してクリーンアップする間、実行は有効なままです。クリーンアップに成功すると実行は `Cancelled` で終了します。

```http
POST /api/workflows/{workflowId}/runs/{runId}/request-cancellation
X-Durable-Workflow-Control-Plane-Version: 2
Authorization: Bearer <operator-token>
X-Namespace: <namespace>
Content-Type: application/json

{"reason":"Order withdrawn","cleanup_timeout_seconds":30}
```

選択した実行は、引き続き現在の実行である必要があります。最初に受理した要求は HTTP 202 を返します。重複要求は、元の要求 ID と期限を伴う HTTP 200 を返します。重複要求のタイムアウトを変更しても、クリーンアップの予算は延長されません。

不変のキャンセルコンテキストは、要求とルートの ID、理由、要求者、ソース、元の要求時刻、期限、順序付きの系譜を公開します。ワークフローコードは、記録された配信境界でこれを受け取ります。それ以前に完了した呼び出しは通常どおりリプレイします。決定的な `deadline()` と `remaining()` ヘルパーにより、再起動後もクリーンアップは同じ判断を行えます。

既存の `cancel()` は実行を即時に閉じ、ワークフローのクリーンアップを再開しません。`terminate()` も即時に閉じ、結果は `Terminated` になります。

## 操作のポリシーを選ぶ {#choose-operation-policies}

| ポリシー | 子ワークフロー | リモートアクティビティ | ローカルアクティビティ |
| --- | --- | --- | --- |
| TryCancel | 子のクリーンアップを要求し、親のクリーンアップを続ける | コールバック停止を要求し、ワークフローのクリーンアップを続ける | 監督対象のコールバックを停止し、クリーンアップを続ける |
| WaitCancellationCompleted | 子の記録済み終了結果を待つ | 元のコールバックの永続的な停止受領記録を待つ | 元のコールバックの永続的な停止受領記録と合流する |
| Abandon | 子を独立したまま残す | 元の有限な合計タイムアウトの下でアクティビティを独立したまま残す | 受け入れ前に拒否される |

親を閉じる際のポリシーは別にあります。`RequestCancellation` は、元のキャンセルの系譜と制限付きの期限で協調要求を送ります。`RequestCancel` は従来の即時キャンセル動作を維持します。

協調する各子は、ルート要求 ID とクリーンアップ予算を継承します。子の期限は短くできますが、予算は拡大できません。放棄した操作は独立した寿命を持ち、そのクリーンアップの合流対象から外れます。

## 監督と復旧 {#supervision-and-recovery}

協調する Worker は、アプリケーションのアクティビティハートビートと独立してキャンセルを監視します。PHP は監督対象のコールバックプロセスを使います。Python は非同期と同期のコールバックを監督します。Rust は非同期コールバックの Future を監督します。切り離した処理と下流サービスには、独自のキャンセルと冪等性の動作が必要です。

クリーンアップはキャンセルシールドを使って、永続アクティビティ、タイマー、子の呼び出しを実行できます。シールドは元の期限を維持します。Worker が停止した場合、代替 Worker は同じ配信境界と完了済みのクリーンアップ呼び出しをリプレイしてから再開します。期限切れや終了は、残っている実行権限を取り消します。

フェンシング済みの古いアクティビティ試行は結果を公開できません。すでに受理された外部副作用には、引き続きアプリケーションの冪等性または整合処理が必要です。

## カスケードを検査する {#inspect-the-cascade}

実行の診断は `cancellation_cascade` を公開し、ルート要求、参加する実行、アクティビティの試行、ポリシー、停止受領記録、期限、クリーンアップ結果を含みます。CLI と Waterline は同じ情報を表示します。

ライフサイクルは `requested`、`delivered`、`cleaning_up`、`cancelled`、`deadline_expired`、`terminated` を区別します。不完全なビューでは、受領記録の欠落を成功の証拠とせず、検証できない項目を示します。

互換性のない有効な Worker クレームに対する要求は、部分的なキャンセルを記録せず、明示的な機能拒否を返します。登録をアップグレードしても、すでに発行したクレームはアップグレードされません。

## リリースの境界 {#release-boundary}

実行全体への要求、子とアクティビティのポリシー、期限付きのシールドされたクリーンアップ、復旧、カスケードの検査がサポート対象のリリースを構成します。個別にキャンセルできる操作スコープは無効化されたソースプレビューのままで、プロトコルリファレンスでは実験的と記されています。

要求、受領記録、機能の正確な構造は[Worker プロトコル仕様](/platform-protocol-specs/worker-protocol-api.openapi.yaml)を参照してください。言語ごとの記述ガイドは [PHP](https://php.durable-workflow.com/)、[Python](https://python.durable-workflow.com/)、[Rust](https://rust.durable-workflow.com/) の SDK サイトにあります。
