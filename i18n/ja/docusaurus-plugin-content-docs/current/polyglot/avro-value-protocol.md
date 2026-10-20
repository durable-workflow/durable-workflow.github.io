---
title: Avro Value プロトコル
sidebar_label: Avro Value プロトコル
---

# Avro Value プロトコル {#avro-value-protocol}

Durable Workflow 2.0 は、すべての Avro ペイロードに単一の固定再帰スキーマ
[`durable_workflow.protocol.Value`](/schemas/v2/durable_workflow.protocol.Value.v1.avsc)
を使います。ワークフローの入力と結果、アクティビティの値と失敗の詳細、シグナル、クエリ、更新、リプレイ履歴、外部保存ペイロードはすべて同じスキーマを使います。アプリケーションが独自の Avro スキーマを公開する必要はなく、プラットフォームもネットワーク上のスキーマレジストリを必要としません。

値のユニオンには、null、真偽値、符号付き64ビット整数、有限の倍精度浮動小数点数、バイト列、UTF-8 文字列、リスト、文字列キーのマップそれぞれに異なる名前付き分岐があります。これにより PHP、Python、Rust で `7` と `7.0`、テキストとバイト列、リストとマップを区別できます。

## ワイヤーフレーム {#wire-frame}

`blob` フィールドは標準の Avro single-object バイト列を base64 で包んだものです。

```text
C3 01 || 8-byte little-endian CRC-64-AVRO fingerprint || Avro datum
```

スキーマ v1 のフィンガープリントは `e2a33dff55802237` です。SDK は対応するフィンガープリントごとの不変スキーマを同梱し、フレームから writer スキーマを選び、現在の reader に対して解決します。未知のフィンガープリントや互換性のない新しい分岐は `unsupported_payload_schema` で失敗します。デコーダーは推測や JSON へのフォールバックを行いません。

将来追加する値の種類は、一意な名前を持つ新しいレコード分岐としてユニオンの末尾に追加します。リリース済みの分岐は並べ替えたり再利用したりしません。

## 値のポリシー {#value-policy}

- マップのキーは文字列でなければなりません。SDK はそれ以外のキーを文字列化せず拒否します。
- 整数は Avro の符号付き64ビット `long` の範囲に収まる必要があります。
- 倍精度浮動小数点数は有限でなければなりません。NaN と無限大は拒否します。
- Python の `bytes` と Rust の `AvroValue::Bytes` は Avro の `bytes` を選びます。PHP の文字列だけではテキストかバイナリかを宣言できないため、PHP の呼び出し元は `AvroBinaryValue::fromBytes()` を使います。
- Decimal、任意精度整数、日時、UUID、enum、dataclass、Pydantic、ドメインオブジェクトには、正規の値の種類への明示的なアダプターが必要です。

Avro は Durable Workflow 2.0 で唯一のペイロードコーデックです。HTTP のリクエストとレスポンスのドキュメントは引き続き JSON トランスポートですが、その中のすべての永続値はこの固定スキーマと single-object フレームを使います。`json` コーデックタグ、未知のコーデック、タグのない生の永続 blob は `unsupported_payload_codec` で安全側に失敗します。ランタイムは変換や推測を行いません。

## JSON 検査用の射影 {#json-inspection-projection}

実行の説明は、損失のないペイロードの正本として `input_envelope`、`output_envelope`、結果エンベロープを保持します。CLI や Waterline など JSON を表示する検査画面は、JSON で表現できない値を型付きの射影で表示します。

```json
{"$type":"bytes","base64":"AP8="}
{"$type":"map","entries":[{"key":"0","value":"zero"}]}
```

マップの射影は、空のマップや、PHP 配列では型を変えずに保持できない数値に見える文字列キーに使われます。通常のスカラー、リスト、曖昧さのない文字列キーのマップは通常の JSON 値のままです。元の型付きの値が必要な利用者は、表示用の射影ではなく付属するエンベロープをデコードします。

## 再現可能なベンチマーク {#repeatable-benchmark}

各 SDK は同じ代表値のベンチマークを同梱し、選択した本番経路に処理時間の上限を適用します。

```bash
# PHP SDK checkout
composer benchmark-avro-value

# Python SDK checkout
python benchmarks/avro_value.py --enforce

# Rust SDK checkout
cargo run --release --example avro_value_benchmark -- --enforce
```

JSON 出力は、コンパクトな JSON、廃止した JSON-in-Avro ラッパー、固定型付きスキーマを比較します。生の datum、フレーム付きペイロード、実際の `{codec, blob}` HTTP エンベロープのサイズと、アダプター、エンコード、デコードを含むエンドツーエンドのレイテンシを報告します。`AVRO_VALUE_ENCODE_BUDGET_US` と `AVRO_VALUE_DECODE_BUDGET_US` で、認定用ランナーの既定の時間上限を厳しくできます。リリース CI は処理時間の上限を適用してこれらのコマンドを実行します。本番経路のリグレッションは、リリース前に説明または修正が必要です。古いラッパーの実装はベンチマーク内だけに存在し、ランタイムの互換経路にはなりません。

## デプロイ前チェック {#deployment-preflight}

Server のブートストラップは保存済みのすべての `payload_codec` を調査し、インラインフレーム、ネストした履歴のエンベロープ、外部ペイロード参照の single-object マジックと固定スキーマのフィンガープリントを検証します。有効な実行やリプレイに関係する非 Avro ペイロード、タグなしペイロード、破損した参照、古いフレームが存在すると、新しいランタイムが起動する前にデプロイを停止します。有効な実行は現在のプレリリース上で完了を待てます。保持する終了済み状態やリプレイに関係する状態は、バックアップを先に行う[プレリリース履歴の移行](/docs/polyglot/prerelease-history-migration)に従う必要があります。実行をエクスポートしても、拒否されたデータベース状態は変わりません。事前チェックを回避するために履歴を削除してはいけません。
