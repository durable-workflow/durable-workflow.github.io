---
title: 可視性クエリ言語
description: 状態、時刻、識別情報、型付き検索属性で Server の実行を絞り込む HTTP 例とページングのリファレンス。
---

# 可視性クエリ言語

`GET /api/workflows?query=...` で Server の一つの名前空間にある実行を検索します。このリファレンスは[互換性マニフェスト](../compatibility.md#last-qualified-reproducible-tuple)で選択された公開済みネイティブ Server、現在の `%%artifact.serverVersion%%` を説明します。一覧は保存された可視性情報を読みます。ワークフローの名前付きクエリハンドラーは実行しません。

リクエストには operator または admin の bearer トークン、`X-Namespace`、`X-Durable-Workflow-Control-Plane-Version: 2` が必要です。[名前空間の認可](./namespace-auth-workers.md)を参照してください。結果にはインスタンスの以前の実行や、属性が一致する子の実行も含まれます。ルートだけを選ぶ組み込み述語はありません。

## リクエストを送る {#make-a-request}

`DURABLE_WORKFLOW_SERVER_URL` に Server のベース URL、`DURABLE_WORKFLOW_AUTH_TOKEN` に operator または admin トークンを設定します。例には Bash、curl、jq が必要です。固定の UTC 区間を調べたい期間に置き換えてください。

```bash
query='Status = failed AND CloseTime >= "2026-11-14T00:00:00Z" AND CloseTime < "2026-11-15T00:00:00Z"'
page=$(curl --fail-with-body --silent --show-error --get \
  "$DURABLE_WORKFLOW_SERVER_URL/api/workflows" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H 'X-Namespace: default' \
  -H 'X-Durable-Workflow-Control-Plane-Version: 2' \
  --data-urlencode "query=$query" \
  --data-urlencode 'page_size=50')
printf '%s\n' "$page" | jq '{workflow_count, workflows, next_page_token}'
```

`Status = failed` はキャンセル済みと強制終了済みも含む状態グループを選びます。その状態だけを選ぶには `Status = cancelled` または `Status = terminated` を使います。`running` は pending、running、waiting を含みます。`completed` は完了した実行を選びます。状態値は大文字と小文字を区別しません。

クエリとページトークンには `--data-urlencode` を使います。シェルの引用符、クエリ文字列のエスケープ、URL エンコードは別の処理です。成功したレスポンスの `workflows: []` は、このリクエストに一致する実行がないことを意味します。

## フィールド {#fields}

フィールド名は大文字と小文字を区別します。組み込み名はカスタム属性より優先されます。

| フィールド | 値 | 演算子 |
| --- | --- | --- |
| `WorkflowType`, `WorkflowId`, `RunId`, `TaskQueue` | 実行の型、インスタンス ID、実行 ID、タスクキュー | `=`、`!=`、`IN`、否定した `IN` |
| `Status`, `ExecutionStatus` | 上記の状態または状態グループ | `=`, `!=` |
| `StartTime`, `ExecutionTime` | 実行開始時刻。二つの名前は別名です。 | スカラー比較、`IN`、否定した `IN` |
| `CloseTime` | 実行終了時刻 | スカラー比較、`IN`、否定した `IN` |
| `BuildId`, `BuildIds` | 実行の互換性値の別名。Worker フリートの検索ではありません。 | keyword 演算子。ただし以下のネイティブ拒否制約があります。 |

スカラー比較は `=`、`!=`、`<`、`<=`、`>`、`>=` です。開始時刻または終了時刻がない場合、否定を含むどの比較にも一致しません。返す実行の compatibility が非 null なら、ネイティブ一覧は HTTP `409` / `unqualified_build_visibility` で拒否します。build 述語を解析できても build による一覧が資格検証済みとは限りません。

他のフィールドは、この名前空間に登録された検索属性である必要があります。`GET /api/search-attributes` で定義を確認し、`POST /api/search-attributes` と `{"name":"OrderTotal","type":"double"}` などの JSON 本文で登録します。登録には admin トークンが必要です。保存時に型を推論しただけでは未登録キーを検索できません。定義を削除しても保存値は残りますが、そのキーのクエリは無効になります。

識別子は ASCII 英字で始まり、ASCII 英字、数字、`_` が続きます。登録名を正確に使ってください。memo、可視性ラベル、ビジネスキー、親やルートの関係名は追加の組み込み構造化フィールドではありません。ビジネスキーは後述の単純検索で検索できます。

## 型と比較 {#types-and-comparisons}

| 登録された型 | リテラルと比較の動作 |
| --- | --- |
| `keyword` | 文字列全体の等値、不等値、`IN`、否定した `IN`。順序比較はできません。 |
| `string`, `text` | `keyword` と同じ演算子で文字列全体を比較します。部分文字列、全文検索、`LIKE` 演算子はありません。 |
| `int` | `42`、`-3` など引用符なしの整数。スカラー比較、`IN`、否定した `IN`。引用符付き数値や小数は整数リテラルではありません。 |
| `double` | 引用符なしの整数または小数。`1.5e3` など指数表記も使えます。スカラー比較、`IN`、否定した `IN`。 |
| `bool` | 引用符なしの `true` または `false`。大文字と小文字は区別しません。スカラー比較、`IN`、否定した `IN` が使え、`false` は `true` より小さい値です。`1` と `"true"` は真偽値リテラルではありません。 |
| `datetime` | 引用符付き日時。スカラー比較、`IN`、否定した `IN` は時点を比較します。`"2026-11-14T12:34:56.123456Z"` のように UTC またはオフセットを明示してください。 |
| `keyword_list` | `Tags = "urgent"` は要素の所属を検査します。`Tags IN ("urgent", "review")` は列挙した要素のいずれかに一致します。不等値、順序比較、所属の否定は拒否されます。 |

対象の属性がない実行は、`!=` や否定した `IN` を含め、その述語に一致しません。存在検査や `IS NULL` 述語はありません。以前の別の登録型で残った値は、新しい型へ自動変換されません。

keyword、テキスト、組み込みテキストフィールドの比較はデータベースの等値規則に従います。公開された MySQL/MariaDB スキーマは `utf8mb4_unicode_ci` を使い、大文字と小文字、アクセント、末尾の空白を無視します。SQLite とネイティブ PostgreSQL の比較は完全一致です。keyword_list の所属も完全一致です。これらのバックエンドで同じテキスト結果になるとは想定しないでください。

日時には ISO 日付とタイムスタンプを使え、小数部はマイクロ秒まで保持されます。日付だけなら UTC の午前零時で、タイムゾーンの省略時も UTC です。移植可能なクエリには明示的なタイムスタンプを使います。`tomorrow` のような相対日付や `Europe/Paris` のようなゾーン名は使えません。呼び出し側で移動区間を計算して固定境界を送ってください。

## 構文、優先順位、エスケープ {#syntax-and-escaping}

- 比較は `Field operator literal` と書きます。述語を `AND` または `OR` で区切ります。キーワードは大文字と小文字を区別しません。
- `NOT` は `AND` より先に次の述語へ適用され、`AND` は `OR` より強く結合します。`A = 1 OR B = 2 AND C = 3` は `A = 1 OR (B = 2 AND C = 3)` を意味します。
- 括弧は空でないカンマ区切りの `IN` リストに使います。真偽式をグループ化することはできません。必要なら各 `OR` 分岐に述語を繰り返します。
- 所属の否定は **`NOT Region IN ("eu", "us")`** です。SQL 形式の `Region NOT IN (...)` は未対応です。`Status IN (...)` も未対応なので、`Status = running OR Status = completed` を使います。
- 文字列には単一引用符か二重引用符を使います。選んだ引用符とリテラルのバックスラッシュを `\` でエスケープします。例は `Customer = 'O\'Brien'` と `Path = "C:\\orders"` です。パーサーは `\n`、`\t`、`\r` などの C 形式もデコードします。JSON の `\uXXXX` はここでは Unicode エスケープではありません。Unicode 文字を直接記述してください。
- 引用符なしテキストには ASCII 英字、数字、`_`、`.`、`:`、`-` を使えます。意図せず真偽値や数値に推論されないよう、テキストには引用符を推奨します。SQL の `SELECT`、`ORDER BY`、`LIMIT` 句はありません。

式の中では、演算子のない登録済み真偽値フィールドが `Flag = true` を意味することがあり、`NOT Flag` は `Flag = false` を意味します。一方、単独の `Flag` は単純検索テキストです。明示的な比較で曖昧さを避けてください。

Server は比較構文、`IN (...)`、先頭の `NOT` 述語から式を認識します。他のテキストはワークフロー ID とビジネスキーの部分文字列検索になります。例えば `query=order-1001` は単純検索です。そのため未対応の SQL 風テキストは構文エラーではなく単純検索になる場合があります。記載された文法を使い、認識された式が無効な場合は `query` エラーを確認してください。

## クエリ例 {#query-examples}

以下の式を上記 curl リクエストの `query` 値として渡せます。カスタム例では、選択した名前空間に `OrderTotal: double`、`Attempt: int`、`Region: keyword`、`Tags: keyword_list`、`Approved: bool`、`DueAt: datetime` が登録され、値が設定されていることを前提とします。

| 目的 | クエリ |
| --- | --- |
| 数値しきい値を超える注文 | `WorkflowType = "orders.fulfillment" AND OrderTotal > 1000` |
| 両端を含む範囲の試行回数 | `Attempt >= 2 AND Attempt <= 5` |
| 二つの地域のいずれか | `Region IN ("eu", "us")` |
| それ以外の記録済み地域 | `NOT Region IN ("eu", "us")` |
| リスト内のいずれかのタグ | `Tags IN ("urgent", "review")` |
| 明示的な false | `Approved = false` |
| 時間ウィンドウ | `DueAt >= "2026-11-14T00:00:00Z" AND DueAt < "2026-11-15T00:00:00Z"` |
| 同じ型の二つのキュー | `WorkflowType = "orders.fulfillment" AND TaskQueue = "orders" OR WorkflowType = "orders.fulfillment" AND TaskQueue = "priority"` |

## ページングと制限 {#pagination-and-limits}

| パラメーター | 動作 |
| --- | --- |
| `workflow_type` | 任意の完全一致型フィルター。`query` と `status` と `AND` で組み合わせます。 |
| `status` | 任意のフィルター。正規の状態グループ `running`、`completed`、`failed` を推奨します。現在の一覧エンドポイントは正確な状態 `cancelled`、`terminated` も受け付けますが、ここでは `pending`、`waiting` は使えません。 |
| `page_size` | `1` から `200` の整数。既定は `50`。`limit` ではなくこのパラメーターを使います。 |
| `next_page_token` | 前のレスポンスのトークンをデコードや自作せずコピーします。null になったら終了します。 |

`workflow_count` はこのページの件数であり、全一致実行の総数ではありません。開始/ソート時刻の降順、次に実行 ID の降順で並びます。ページングはオフセットでライブデータを読みます。名前空間、クエリ、フィルター、ページサイズを固定してください。リクエスト間の挿入、終了、属性更新で一致項目が移動し、重複や欠落が起こり得ます。スナップショットのエクスポートではありません。現在、無効なトークンはエラーではなく最初のページに戻ります。

最初の例に次ページがある場合は取得します。

```bash
next=$(printf '%s\n' "$page" | jq -r '.next_page_token // empty')
if [ -n "$next" ]; then
  curl --fail-with-body --silent --show-error --get \
    "$DURABLE_WORKFLOW_SERVER_URL/api/workflows" \
    -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
    -H 'X-Namespace: default' \
    -H 'X-Durable-Workflow-Control-Plane-Version: 2' \
    --data-urlencode "query=$query" \
    --data-urlencode 'page_size=50' \
    --data-urlencode "next_page_token=$next" | jq .
fi
```

ページサイズは返却行数を制限し、評価処理量は制限しません。式と `IN` リストは小さくし、選択性の高い型、状態、属性の述語を使います。ワークフローパーサーは schedule API の 2048 文字制限を定義していません。HTTP サーバーやプロキシが独自の URI 制限を設ける場合があります。[Schedule 一覧](./server-api-reference.md#schedule-list-filters)は等値と `AND` の別の文法を使います。

## 無効なクエリ {#invalid-queries}

認識した式が解析、フィールド検索、型検査で失敗すると、HTTP `422`、`reason: "validation_failed"`、`message`、`errors.query` と `validation_errors.query` の配列が返ります。無効なページサイズや状態では、代わりにそのパラメーターのキーを使います。

| 無効な式 | 修正 |
| --- | --- |
| `Unknown = 1` | この名前空間に属性を登録するか、フィールド名を修正します。 |
| `OrderTotal = "1000"` | 数値リテラル `1000` を使います。 |
| `Approved = 1` | `true` または `false` を使います。 |
| `Region > "eu"` | keyword は等値と所属をサポートし、順序比較はできません。 |
| `Tags != "urgent"` または `NOT Tags IN ("urgent")` | keyword_list では所属の否定は未対応です。 |
| `Attempt IN ()`, `Attempt = 1 AND` | 空でないリスト、または完全な述語を指定します。 |
| `DueAt > "tomorrow"` | 具体的なタイムスタンプを送ります。 |

## Embedded モードと Waterline {#mode-support}

この言語は Server のワークフロー一覧 API で利用できます。現在の embedded 一覧と Waterline の保存ビュー用フィルターは、この文法全体を実装していません。既存の完全一致メタデータ `key=value` フィルターや部分文字列フィールドは、範囲、`IN`、`!=`、真偽式の対応を意味しません。サービスモード Waterline も、保存ビューをこの言語として扱うには明示的な UI/API 対応が必要です。共通の同等性対応は[可視性クエリ機能](https://github.com/durable-workflow/.github/issues/224)で未完了です。

この参考は[公開済みネイティブパーサーと単体テスト](https://github.com/durable-workflow/server/blob/b6e04ce7e679464e91f6ceae83310d3bb3204092/rust/src/runtime/visibility_query.rs)、[HTTP ページング実装](https://github.com/durable-workflow/server/blob/b6e04ce7e679464e91f6ceae83310d3bb3204092/rust/src/runtime/visibility.rs)、[一覧 API テスト](https://github.com/durable-workflow/server/blob/b6e04ce7e679464e91f6ceae83310d3bb3204092/rust/tests/execution/visibility.rs)に基づきます。これらは公開 Server の動作であり、embedded や Waterline の同等性対応の完了を示しません。
