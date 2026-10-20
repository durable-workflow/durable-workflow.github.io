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

大きなペイロードを交換可能なオブジェクトストア（S3、GCS、Azure Blob、ローカルファイルシステム）へ移し、履歴内のバイト列を小さく検証可能な参照エンベロープに置き換えます。アクティビティや子の引数・結果、シグナル、更新が、履歴を保持するデータベース行には大きすぎる場合に使います。

エンコード後のサイズが名前空間のしきい値未満ならインラインのままです。しきい値を超えるものだけをドライバーに書き、`durable-workflow.v2.external-payload-reference.v1` として履歴に記録します。参照の欠落、改変、設定プレフィックス外への参照ではリプレイとエクスポートを拒否し、失われた blob を黙って空の値にしません。

## 使用する場面 {#when-to-use-it}

数百キロバイトを超えるバイト列を渡す正当な必要がある場合に優先します。

- PDF、画像、音声をアクティビティ間で渡す文書・メディア処理。
- 最終出力が大きなシリアライズ済み成果物になるレポート、エクスポート、アーカイブ。
- 直接参照できる安定した URL を外部システムが提供しないメッセージストリームのペイロード。
- そのままでは [`payload_size_bytes` の構造上の制限](../constraints/structural-limits.md#payload-size)に達するペイロード。

コントロールプレーンのフィールド、ID、状態フラグ、一般的な JSON などの小さいペイロードはインラインで、追加コストはありません。しきい値で制御するため、有効化だけで小さなものまで移しません。

## 外部保存の仕組み {#how-offload-works}

名前空間ごとに独立したポリシーを持ちます。永続保存用のエンコード時に、バイト数を `threshold_bytes` と比較します。

- しきい値未満なら従来どおりインラインに保存し、履歴は変わりません。
- しきい値以上なら、エンコード済みバイト列をドライバーに渡して専用 URI を受け取り、参照を履歴へ保存します。URI、SHA-256、正確なバイト数、コーデック、任意の `expires_at` ヒントを含みます。

リプレイ時は同じドライバーで取得し、期待するサイズと SHA-256 を検証してからデコードします。不一致は `ExternalPayloadIntegrityException`（PHP）または `ExternalPayloadIntegrityError`（Python）となり、リプレイが失敗します。黙って空にはしません。

エンベロープは安定した通信形式で、PHP ワークフロー、Python Worker、直接 HTTP 呼び出しのどれが生成しても同じです。全フィールドは[外部ペイロード参照エンベロープ](../polyglot/server-api-reference.md#external-payload-reference-envelope)を参照してください。

## デコードの信頼境界 {#decode-trust-boundary}

保存とデコードは別の信頼境界です。ストアがエンコード済みバイト列や参照を持つ一方、それをデコードするコーデックサーバー、カスタムデコーダー、Worker、履歴ツールは平文を参照できます。

コーデックサーバーは顧客管理の信頼境界として扱い、配置先、到達可能なネットワーク、参照可能なキー、監査ログ、運用画面に出す前のプレビュー秘匿化を決めます。Durable Workflow はコーデック名、URI、ハッシュ、サイズ、スキーマフィンガープリント、制限付きプレビューを記録しますが、それはエンドツーエンド暗号化と同義ではありません。

## ドライバーの選択 {#driver-choices}

| ドライバー | URI スキーム | 一般的な用途 |
| --- | --- | --- |
| `local` | `file://` | 開発、CI、Server と Worker がファイルシステムを共有する単一ノード配置。異なるホストには不適切です。 |
| `s3` | `s3://` | Server 側ディスク経由の Amazon S3 と互換ストア（MinIO、Cloudflare R2 など）。 |
| `gcs` | `gs://` | Server 側ディスク経由の Google Cloud Storage。 |
| `azure` | `azure://` | Server 側ディスク経由の Azure Blob Storage。 |

バケットやコンテナーの資格情報は Server 側の名前付きファイルシステムディスクで設定します。秘密は名前空間ポリシーでなく Server 設定に置きます。

## 名前空間の設定 {#configuring-a-namespace}

[CLI](../polyglot/cli-reference.md#namespace-and-search-attribute-commands) または [Server HTTP API](../polyglot/server-api-reference.md#namespace-and-storage) で設定します。どちらも名前空間レコードの同じ `external_payload_storage` を書き込みます。

### CLI の使用 {#with-the-cli}

```bash
# Production namespace using Amazon S3 through the 'external-payload-objects' disk.
dw namespace:set-storage-driver billing s3 \
  --disk=external-payload-objects \
  --bucket=dw-payloads \
  --prefix=billing/ \
  --threshold-bytes=2097152

# Development namespace using the local filesystem.
dw namespace:set-storage-driver dev local \
  --uri=file:///var/lib/durable-workflow/payloads

# Disable offload while keeping the policy record (all payloads stay inline).
dw namespace:set-storage-driver billing s3 \
  --disk=external-payload-objects \
  --bucket=dw-payloads \
  --disable
```

### Server API の使用 {#with-the-server-api}

```bash
curl -sS -X PUT "$DURABLE_WORKFLOW_SERVER_URL/api/namespaces/billing/external-storage" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "driver": "s3",
    "threshold_bytes": 2097152,
    "config": {
      "disk": "external-payload-objects",
      "bucket": "dw-payloads",
      "prefix": "billing/"
    }
  }'
```

`GET /api/namespaces/{name}` や `dw namespace:describe` の説明は解決済み `external_payload_storage` を含み、再書き込みせず有効ポリシーを検証できます。

## ポリシーの検証 {#verifying-the-policy}

トラフィックを流す前に往復診断を実行し、名前空間の資格情報で実際に書き込み・読み取りできることを証明します。

```bash
dw storage:test --namespace=billing --large-bytes=2097152 --json
```

診断は小さなインライン値としきい値を超える値を書き、両方を取得してサイズと SHA-256 を検証し、機械可読な `small_payload` と `large_payload` を返します。大容量側の成功は有効な `durable-workflow.v2.external-payload-reference.v1` を端から端まで生成できる証明です。失敗はポリシーの問題として扱い、往復検証に通らない名前空間でトラフィックを有効にしないでください。

## しきい値の選択 {#picking-a-threshold}

既定では `threshold_bytes` を超えない限りインラインのままです。出発点として次を使います。

- インライン値が運用上の負荷になり始める大きさに合わせます。通常はエンコード済み256 KiB〜2 MiBです。
- 名前空間の [`payload_size_bytes`](../constraints/structural-limits.md#payload-size) より十分低くし、元のバイト列ではなく参照エンベロープが上限の対象になるよう余裕を持たせます。
- 名前空間ごとに1つ設定します。中央値ではなく、実行あたりの最大バイト数を生むアクティビティやワークフローに合わせます。

極端に低くしても利点はありません。小さな値は外部ストレージよりデータベースの往復の方が速く、参照自体も少量の履歴領域を使います。

## リプレイ、保持、クリーンアップ {#replay-retention-and-cleanup}

- **完全性**: 毎回 `size_bytes` と `sha256` を照合します。改変や欠落は別の値に置換せず完全性例外になります。
- **検証済み取得キャッシュ**: `(uri, sha256, size, codec)` で件数・バイト数制限付きキャッシュを持ち、初回検証を弱めず同じ実行の再取得を減らします。
- **保持**: Server の保持処理が実行を削除すると、履歴の参照先オブジェクトも削除します。保持処理が稼働していれば孤立オブジェクトは蓄積しません。
- **履歴エクスポート**: 参照形式を維持し外部バイト列を埋め込みません。必要な利用者は同じドライバーで取得し、デコード前に検証します。

## コードからの使用 {#using-it-from-code}

通常は API を直接呼ぶ必要はありません。ランタイムがポリシーで透過的に外部保存し、SDK がリプレイ時に解決します。言語非依存ブリッジや大容量テストなど、外部でエンベロープを作成・消費する場合に SDK ヘルパーを使います。

- **PHP（ワークフローパッケージ）**: `Workflow\V2\Support\ExternalPayloadStorage` は `Workflow\V2\Contracts\ExternalPayloadStorageDriver` 実装を通して保存・取得します。`LocalFilesystemExternalPayloadStorage` は `file://` を扱い、独立 Server は名前付き Laravel ディスクで `s3`、`gcs`、`azure` を支えるディスクドライバーを提供します。
- **Python SDK**: [外部ペイロードストレージ](../polyglot/python.md#external-payload-storage)に `ExternalPayloadReference`、`ExternalPayloadCache`、`store_external_payload()`、`fetch_external_payload()`、`LocalFilesystemExternalStorage`、`S3ExternalStorage`、`GCSExternalStorage`、`AzureBlobExternalStorage` の説明があります。Cloud SDK クライアントはアプリが所有し、SDK は boto3、google-cloud-storage、azure-storage-blob を実行依存に追加しません。
- **直接 HTTP**: 手動エンコードする呼び出し元はドライバーに保存し、リクエストのペイロードに参照を渡せます。Worker プロトコルの `{codec, blob}` 形式も引数、結果、シグナル、更新の参照を運びます。

## 関連情報 {#see-also}

- [データの受け渡し](../defining-workflows/passing-data.md): 既定のインライン契約。
- [構造上の制限: ペイロードサイズ](../constraints/structural-limits.md#payload-size): 外部保存により守れるエンジンの上限。
- [Server API: 名前空間とストレージ](../polyglot/server-api-reference.md#namespace-and-storage): 参照フィールドを含む完全な HTTP 契約。
- [CLI: 名前空間と検索属性コマンド](../polyglot/cli-reference.md#namespace-and-search-attribute-commands): `dw namespace:set-storage-driver` と `dw storage:test`。
- [Python SDK: 外部ペイロードストレージ](../polyglot/python.md#external-payload-storage): Python のドライバー、ヘルパー、リプレイキャッシュ。
