---
sidebar_position: 21
tags:
  - payloads
  - storage
  - history
keywords:
  - 外部ペイロードストレージ
  - 大容量ペイロード
  - ペイロードの外部保存
  - S3 ストレージ
  - GCS ストレージ
  - Azure Blob ストレージ
---

# 外部ペイロードストレージ {#external-payload-storage}

組み込み Laravel では、外部ストレージがワークフロー履歴内の大きなエンコード済み値を、アプリケーション管理ストレージへの検証可能な参照に置き換えます。このページはその保存境界を説明します。サービスモードのクライアントと Worker は [Server のランタイム転送](../polyglot/server-api-reference.md#runtime-external-payload-transport)を使います。Server がプロバイダー認証情報を保持し、SDK は認証付き HTTP で不透明な参照 ID を交換します。プロバイダー URI は Server に送信できるペイロードエンベロープではありません。

## 利用する場面 {#when-to-use-it}

耐久実行を通じて受け渡す必要がある大きな文書、メディア、レポート、アクティビティの引数や結果に外部ストレージを使います。小さな値はインラインのままで、オブジェクトストレージへの書き込みは発生しません。外部化しても、ペイロード上限、履歴イベント数の上限、実行が保持するオブジェクト数を制限する必要性はなくなりません。

## 外部化の仕組み {#how-offload-works}

アプリケーションの名前空間ポリシーがストレージドライバーと正の `threshold_bytes` を提供します。エンコード後のサイズがしきい値を**超える**ペイロードをドライバーで保存します。しきい値以下の値はインラインのままです。ポリシーが無効、またはドライバーがない場合もインラインになります。

組み込みのプロバイダー参照は `durable-workflow.v2.external-payload-reference.v1` スキーマを使い、`uri`、`sha256`、`size_bytes`、`codec` と任意の `expires_at` を持ちます。コーデックは `avro` です。`Workflow\V2\Support\ExternalPayloads` は `dw-external-payload:v1:` 接頭辞付きでエンコード済みエンベロープを保存します。ランタイムが値を必要とすると、エンコード済みバイトを取得し、サイズと SHA-256 を検証してからデコードします。欠落や変更は失敗になり、代わりに `null` を使うことはありません。

このプロバイダー参照は Server の `durable-workflow.v2.runtime-external-payload-reference.v1` スキーマと異なります。ドライバーヘルパーや保存済みエンベロープを別の配置モードへ持ち込む前に、[モード別対応表](../polyglot/server-api-reference.md#external-payload-support-by-mode)を確認してください。

## デコードの信頼境界 {#decode-trust-boundary}

保存とデコードは別々の信頼境界です。プロバイダーがエンコード済みバイトを保持していても、デコードする Worker、コーデックサーバー、エクスポートツールにはアプリケーション値が見えます。デコーダーの実行場所、使用できる鍵、プレビューとログの秘匿方法を決めてください。ハッシュ、サイズ、コーデック名は整合性メタデータであり、エンドツーエンド暗号化の保証ではありません。プロバイダー URI に機密のオブジェクト名が含まれる場合もあります。

## ドライバーの選択 {#driver-choices}

| ドライバー | URI スキーム | 組み込みモードの要件 |
| --- | --- | --- |
| ローカルファイルシステム | `file://` | 参照を解決するすべての組み込みプロセスが同じ保存ルートにアクセスできること。 |
| S3 互換ストレージ | `s3://` | 適切なバケット、接頭辞、認証情報を持つアプリケーション管理ドライバーまたはファイルシステムディスク。 |
| Google Cloud Storage | `gs://` | アプリケーション管理ドライバーまたはディスクとプロバイダークライアント。 |
| Azure Blob Storage | `azure://` | アプリケーション管理ドライバーまたはディスクとプロバイダークライアント。 |

Server 自体がローカルストレージを使っていても、リモート SDK Worker は HTTP でデータを取得できます。その Worker に共有ファイルシステムやプロバイダー認証情報は不要です。

## 名前空間の設定 {#configuring-a-namespace}

組み込みアプリケーションは、自身の Laravel ランタイムで名前空間の保存ポリシーと `ExternalPayloadStorageDriver` を設定します。認証情報はアプリケーション設定に置き、ワークフロー引数、履歴、参照 URI に入れないでください。実行とリプレイを行うプロセス間で同じポリシーを使います。

セルフホスト Server では、管理用の[名前空間ストレージ API](../polyglot/server-api-reference.md#namespace-and-storage)と [CLI コマンド](../polyglot/cli-reference.md#namespace-and-search-attribute-commands)が Server のポリシーを設定します。SDK Worker にプロバイダーへの直接アクセスを与える操作ではありません。

### CLI を使う {#with-the-cli}

`dw namespace:set-storage-driver` は Server の名前空間を設定します。独立した組み込みアプリケーションの Laravel コンテナーは設定しません。ドライバーに必要なディスク、バケット、接頭辞のオプションは CLI リファレンスを参照してください。

### Server API を使う {#with-the-server-api}

`PUT /api/namespaces/{namespace}/external-storage` は管理者のポリシー操作です。通常の SDK クライアントは `GET /api/cluster/info` で設定済みランタイム転送を検出し、プロバイダー設定を Worker にコピーしません。

## ポリシーの検証 {#verifying-the-policy}

実際のドライバーとリプレイを行うプロセスを使い、しきい値を超える値を処理してください。取得後にエンコード済みバイト長と SHA-256 を正確に検証します。Server では `dw storage:test --namespace=billing --json` が設定済み保存経路を確認します。ストレージ診断だけで、各 SDK のワークフロー実行、バックアップ復元、すべてのプロバイダーアダプターの動作が証明されるわけではありません。

## しきい値の選択 {#picking-a-threshold}

通常のリクエスト上限とペイロード上限に余裕を持たせます。しきい値の対象は**エンコード済みバイト**であり、元のファイルサイズや業務 JSON の長さではありません。極端に小さいしきい値は、小さな値にもストレージ要求と保持参照を追加します。ランタイム転送は HTTP リクエスト全体を上限内に収めるため、追加の値を外部化することもあります。サービスモードでは、組み込みのしきい値を通信上限と見なさず、検出した Server の上限を使ってください。

## リプレイ、保持、クリーンアップ {#replay-retention-and-cleanup}

- **リプレイの整合性。** 参照先のバイトを取得、検証してから値をデコードします。保持対象の実行が必要とするオブジェクトを残してください。
- **検証済み取得のキャッシュ。** `ExternalPayloadStorage` は検証済みバイトのキャッシュを制限します。キャッシュを消しても保存オブジェクトの削除や所有権変更は起きません。
- **保持。** ランタイムのクリーンアップは、保持中の所有者と共有オブジェクトを考慮します。ストレージ障害、バックアップ保留、残存参照で削除が遅れることがあります。保持処理の稼働は孤立オブジェクトがないという保証ではありません。
- **履歴のエクスポート。** エクスポートは、オブジェクトを取得せず参照メタデータを保存できます。チェックサムや `history_complete` は、外部バイトの存在やアーカイブのリプレイ可能性を証明しません。[バックアップと復元の境界](../configuration/pruning-workflows.md#export-before-pruning)に従い、オブジェクトを別途検証してください。自己完結型アーカイブは [Server #520](https://github.com/durable-workflow/server/issues/520) で継続追跡しています。

## コードからの利用 {#using-it-from-code}

組み込み PHP は `Workflow\V2\Support\ExternalPayloadStorage` と `ExternalPayloadStorageDriver` を使います。`LocalFilesystemExternalPayloadStorage` はローカルルートを扱います。プロバイダーアダプターがアクセス設定と URI 規則を管理します。通常、アプリケーションは保存エンベロープを手作りせず、ランタイムに名前空間ポリシーを適用させます。

サービスモードでは、Server が利用可能な転送を公開すると、PHP、Python、Rust SDK のクライアントと Worker がランタイムペイロードを自動でアップロード、取得します。プロバイダーの `external_storage` エンベロープを Server に送ったり、直接アクセス用ヘルパーで Server 管理オブジェクトを削除したりしないでください。[アップロードと取得の契約](../polyglot/server-api-reference.md#runtime-external-payload-transport)と [Python ヘルパーの境界](../polyglot/python.md#external-payload-storage)を参照してください。

## 関連項目 {#see-also}

- [データの受け渡し](../defining-workflows/passing-data.md)
- [構造上の制限: ペイロードサイズ](../constraints/structural-limits.md#payload-size)
- [Server API: ランタイム外部ペイロード転送](../polyglot/server-api-reference.md#runtime-external-payload-transport)
- [Python SDK: 外部ペイロードストレージ](../polyglot/python.md#external-payload-storage)
