---
sidebar_position: 4
title: CLI コマンドリファレンス
description: Durable Workflow CLI コマンド、安定した出力モード、共通オプション、失敗時動作のリファレンス。
tags:
  - CLI
  - reference
  - control-plane
  - automation
keywords:
  - dw コマンドリファレンス
  - CLI 出力
  - ブリッジ Webhook
  - ワークフローコマンド
---

# CLI コマンドリファレンス {#cli-command-reference}

このページは v2 `dw` コマンドサーフェスを運用・自動化の契約として記載します。インストールとプロファイル設定は [CLI ガイド](/docs/polyglot/cli)を使い、スクリプト、CI ジョブ、運用手順書、AI エージェントを正確なコマンド構造へ接続する際はこのページを使ってください。

Server を利用するすべてのコマンドは、スタンドアロン Server のコントロールプレーンプロトコルバージョン `2` を対象にします。CLI は正規のリクエスト・レスポンスフィールドを信頼する前に、Server 公開のプロトコルマニフェストを検証します。

## グローバルオプション {#global-options}

特記しない限り、Server を利用するコマンドは次のオプションを受け入れます。

| オプション | 意味 |
| --- | --- |
| `--server`, `-s` | Server ベース URL。この呼び出しでプロファイルと環境変数を上書きする。 |
| `--namespace` | 対象の名前空間。プロファイルの名前空間を上書きする。 |
| `--token` | この呼び出しの Bearer トークン。保存する自動化設定には `--token-env` 付きプロファイルを推奨。 |
| `--env` | 名前付き CLI 環境プロファイル。未知の名前はフォールバックせず失敗する。 |
| `--output=table\|json\|jsonl` | 出力契約。`table` は人間向け、`json` は単一 JSON ドキュメント、`jsonl` は一覧コマンドで1行1 JSON オブジェクト。 |
| `--json` | 対応コマンドでの JSON 出力のコマンドローカルな別名。 |

呼び出し元のペイロードを受け入れるコマンドは、1つの入力契約を共有します。

| オプション | 意味 |
| --- | --- |
| `--input`, `-i` | インライン入力ドキュメント。 |
| `--input-file` | ファイルから入力を読む。`-` は標準入力。`--input` とは排他。 |
| `--input-encoding=json\|raw\|base64` | JSON としてデコード、生テキストを1引数として渡す、base64 を1引数へデコード。既定 `json`。 |

ワークフロー開始、シグナル、クエリ、更新、スケジュール、アクティビティ完了の JSON 入力は、v2 の位置引数配列を表します。raw と base64 入力は単一の位置引数となるため、Server は引き続き正規の `input` 配列を受け取ります。

## 接続と診断 {#connection-and-diagnostics}

| コマンド | 用途 | 主なオプション |
| --- | --- | --- |
| `dw --version` | CLI ビルド ID を表示。`DW_ENV` または `DURABLE_WORKFLOW_SERVER_URL` が対象を選択する場合、短い互換性プローブも行う。 | `-V`, `--version` |
| `dw server:health` | Server の健全性と認証到達性を確認。 | グローバルオプション、`--json` |
| `dw server:info` | Server バージョン、ロールトポロジー・プロトコルマニフェスト、要求契約、Worker プロトコル、Worker 群の事実、互換性メタデータを表示。 | グローバルオプション、`--json` |
| `dw doctor` | 解決したプロファイル・Server・トークン・TLS 状態、リモート互換性警告、次の対応を説明。 | グローバルオプション、`--json` |
| `dw debug workflow <workflow-id>` | 停滞した1ワークフローの状態、保留タスク、キュー情報、失敗、互換性メタデータを取得。 | `--run-id`、グローバルオプション、`--json` |
| `dw server:start-dev` | 設定済みの既存 Laravel プロジェクトの HTTP アプリケーションを提供。外部 PHP が必要。 | `--port`、`--host`（既定 `127.0.0.1`）、`--db=sqlite\|mysql\|pgsql` |
| `dw watch workflow <workflow-id>` | 終了状態または設定したポーリング上限までワークフローをポーリング。 | `--run-id`, `--interval`, `--max-polls`、グローバルオプション |
| `dw upgrade` | 稼働中の単独 `dw` バイナリを新しい（または指定した）リリースへ置換。Composer vendor と Homebrew cellar の書き換えは拒否。 | `--tag`, `--dry-run`, `--force`, `--output=table\|json` |

契約構造の検証には `server:info`、CLI が Server と通信できない理由の説明には `doctor`、サポートに機械可読な実行記録が必要な場合には `debug workflow` を使います。

### ローカルプロジェクトの HTTP Server {#local-project-http-server}

`artisan` があるインストール済み Laravel プロジェクトのディレクトリから `dw server:start-dev` を実行します。このコマンドではネイティブ CLI と別に `PATH` 上の PHP 実行ファイルが必要です。先にデータベース設定と移行を行います。選択した `--db` は `DB_CONNECTION` として渡すため、ドライバー変更時は Laravel の設定キャッシュを消してください。必要なキュー Worker とスケジューラーは別で動かします。`.env` 編集後はコマンドを再起動します。Artisan の `--no-reload` モードによって、選択したドライバーは HTTP 要求にも適用し続けます。

既定のバインドはループバックです。全インターフェースには明示的に `--host=0.0.0.0` を使います。MySQL と PostgreSQL モードには、それぞれ `mysql` または `pgsql`、および `redis` というプロジェクトの Compose サービスが必要です。依存プロセスや HTTP プロセスの失敗は非ゼロを返します。HTTP プロセス終了後も Compose サービスは稼働を続けます。

POSIX ネイティブバイナリは SIGINT と SIGTERM を有効な子へ転送し、そのプロセスグループの停止を最大5秒待ちます。Windows はコンソール割り込み動作を使います。

公開イメージを使うスタンドアロン Durable Workflow Server は、[サービスクイックスタート](/docs/quickstart)に従ってください。

### Server 情報とロールトポロジー {#server-info-and-role-topology}

`dw server:info` は `GET /api/cluster/info` の CLI サーフェスです。テーブルモードの `Topology:` セクションは、応答ノードに対して Server が公開したロールトポロジー契約を要約します。

- `Supported Shapes` と `Current Shape` は、有効なデプロイ構成とノードが現在提供する構成を示す。
- `Current Process Class` と `Current Roles` は応答ノードのプロセスクラスとロールの組を示す。
- `Matching Role`、`Matching Partitions`、`Matching Backpressure` は、実行可能な処理のクレーム方法を決めるマッチング構成、起床の所有権、ディスパッチモード、分割基本要素を公開する。
- `Matching Discovery Limits` は固定のマッチング数値契約 `poll_batch_cap`、`availability_ceiling_seconds`、`wake_signal_ttl_seconds`、`workflow_task_lease_seconds`、`activity_task_lease_seconds` を要約し、パッケージソースを検索せずに文書化された契約との一致を検証できる。
- `Current Write Boundaries` はノードのロールが現在所有する永続書き込みサーフェスを一覧する。
- `Scaling Boundaries` と `Failure Domains` は、各ロールで想定する負荷要因と最初の障害シグナルを示す。

スクリプトで生のマニフェストが必要なら `--output=json` を使います。`topology.schema` と `topology.version` は契約リビジョンを固定し、構造のずれを検出できます。`topology.execution_mode` は応答ノードのディスパッチモードを報告します。安定した機械フィールドは `topology` 配下の `supported_shapes`、`current_shape`、`current_process_class`、`current_roles`、`matching_role`、`role_catalog`、`authority_boundaries`、`authority_surfaces`、`supported_topologies`、`scaling_boundaries`、`failure_domains` です。`topology.matching_role` は `partition_primitives` と `backpressure_model` も公開し、文章を解析せずノードが実行可能タスク検出に使うルーティング軸を検査できます。`topology.matching_role.discovery_limits` は固定数値契約 `poll_batch_cap`、`availability_ceiling_seconds`、`wake_signal_ttl_seconds`、`workflow_task_lease_seconds`、`activity_task_lease_seconds` を公開し、人間向けセクションの解析なしに Workflow パッケージの値を固定できます。

```bash
dw server:info --output=json \
  | jq '.topology | {current_shape, current_process_class, current_roles, matching_role, scaling_boundaries, failure_domains}'
```

フィールドの意味は [Server ロールのトポロジー](/docs/polyglot/server-role-topology)を参照してください。

### Server 情報と調整の健全性 {#server-info-and-coordination-health}

`dw server:info` は全名前空間のロールアウト安全性の判定も公開し、別のヘルスサーフェスを立てずに調整の健全性を読めます。テーブルモードでは `Topology:` の下に `Coordination Health:` を表示します。`--output=json` では同じデータが `coordination_health` 配下の安定フィールドにあります。

- `coordination_health.schema` と `coordination_health.version` は契約リビジョンを固定する。
- `coordination_health.namespace_scope` は1名前空間か全 Worker 群かを示す。
- `coordination_health.status` と `coordination_health.http_status` は最上位の判定と、Server が準備状態に適用する HTTP 制限を示す。
- `coordination_health.generated_at` は取得時刻を記録する。
- `coordination_health.categories` は `correctness`、`safety`、`routing` など分類ごとの件数を要約する。
- `coordination_health.warning_checks` と `coordination_health.error_checks` は、警告・エラーの判定に至らせた検査名を並べ、失敗サーフェスで分岐できる。
- `coordination_health.checks[]` は各検査の詳細配列で、`name`、`status`、`category`、`message` を固定し、劣化した判定を自動化で説明できる。固定一覧は必ず `worker_compatibility`、`task_transport`、`routing_health`、`durable_resume_paths`、プロジェクション・スケジューラー検査、`activity_path` を含む。`activity_path` は `task_transport` のアクティビティ側に対応し、強制されないまま schedule-to-start、start-to-close、schedule-to-close、ハートビート期限が過ぎたアクティビティ実行と、継続する再試行バックログを示す。名前変更はプロトコルレベルの変更。

```bash
dw server:info --output=json \
  | jq '.coordination_health | {status, http_status, namespace_scope, warning_checks, error_checks}'
```

フィールドを支える準備状態契約は [Server API リファレンス](/docs/polyglot/server-api-reference)を参照してください。

### 自己アップグレード {#self-upgrade}

`dw upgrade` は `durable-workflow/cli` の GitHub リリースからプラットフォームに合うアセットを取得し、リリースの `SHA256SUMS` と検証し、チェックサム一致時だけ稼働中バイナリを置き換えます。`--tag` は特定リリースタグへ固定し、`--dry-run` はダウンロードせず対象を解決してアセット URL を表示し、`--force` は現行と対象バージョンが同じでも再ダウンロード・置換します。

他ツールが管理するインストールは書き換えを拒否します。JSON 出力は安定した `status` を使い、文章を解析せず分岐できます。

| `status` | 意味 |
| --- | --- |
| `upgraded` | バイナリを `target_version` に置換した。 |
| `noop` | `current_version` が `target_version` と一致する。`--force` で回避。 |
| `dry-run` | ダウンロードせず `target_version`、`asset_url`、`checksum_url` を解決した。 |
| `refused` | 単独リリースバイナリ以外（Composer vendor、Homebrew cellar）、またはプラットフォーム用アセットが未公開。 |
| `permission-denied` | インストールディレクトリが書き込み不可。推奨対応を `hint` に含む。 |
| `error` | リリースカタログ取得、チェックサム不一致、ファイルシステムのエラー。 |

拒否時、JSON の `installation.kind` は管理ツール（`composer-vendor`、`homebrew`、`binary`、`unknown`）を識別し、`reason` は代わりに使う正しい管理元を示します。`phar` を報告するのは、自身の 2.x コードを実行している 2.x PHAR だけです。公開されたソース不要の自動化では `https://durable-workflow.com/install.sh` で固定リリースを再インストールし、tap 管理の Homebrew では `brew upgrade durable-workflow/tap/dw` を使います。

## 環境プロファイル {#environment-profiles}

プロファイルは `~/.config/dw/config.json`、または設定済みなら `$XDG_CONFIG_HOME/dw/config.json` にあります。テスト・CI のプロファイルディレクトリを分離するには `DW_CONFIG_HOME` を設定します。

| コマンド | 用途 | 主なオプション |
| --- | --- | --- |
| `dw env:set <name>` | 名前付きプロファイルを作成・更新。 | `--server`, `--namespace`, `--token-env`, `--token`, `--tls-verify=true\|false`, `--profile-output=table\|json\|jsonl`, `--make-default`, `--json` |
| `dw env:list` | 既定で直接指定トークンを隠してプロファイル一覧を表示。 | `--show-token`, `--json`, `--output=jsonl` |
| `dw env:show [name]` | 1プロファイルを表示。既定は現在のプロファイル。 | `--show-token`, `--json` |
| `dw env:use <name>` | 既定プロファイルを設定。未知名は失敗。 | `--json` |
| `dw env:delete <name>` | プロファイルを削除。 | `--json` |

シークレットをプロファイルファイルではなく実行環境に残すため、本番プロファイルは `--token-env=NAME` を推奨します。

## ワークフローコマンド {#workflow-commands}

| コマンド | 用途 | 主なオプション |
| --- | --- | --- |
| `dw workflow:start` | コントロールプレーンでワークフローを開始。 | `--type`, `--workflow-id`, `--business-key`, `--task-queue`, `--duplicate-policy`, `--memo`, `--search-attr key=value`, `--execution-timeout`, `--run-timeout`, `--wait`、入力オプション、`--json` |
| `dw workflow:list` | ワークフローインスタンスを一覧。 | `--type`, `--status`, `--query`, `--limit`、グローバル出力オプション |
| `dw workflow:describe <workflow-id>` | 現在または選択した実行を説明。 | `--run-id`, `--follow`, `--json` |
| `dw workflow:list-runs <workflow-id>` | インスタンスの実行を一覧。 | `--json` |
| `dw workflow:show-run <workflow-id> <run-id>` | 1実行を表示。 | `--follow`, `--json` |
| `dw workflow:history <workflow-id> <run-id>` | 実行の履歴イベントを読む。 | `--follow`, `--page-size`, `--json` |
| `dw workflow:history-export <workflow-id> <run-id>` | 実行履歴バンドルをエクスポート。外部ペイロードは参照のまま。 | `--output-file`、グローバルオプション |
| `dw workflow:history-archive <workflow-id> <run-id> <directory>` | 閉じた実行の自己完結型の検証済みアーカイブを、すべての外部ペイロードのバイトを含めて書き出す（native Server）。 | `--hold-ttl`、`--json`、グローバルオプション |
| `dw workflow:history-archive-check <directory>` | 履歴アーカイブをそのファイルだけで検証。 | `--json` |
| `dw workflow:signal <workflow-id> <signal-name>` | シグナルを送信。 | `--request-id`、`--run-id`、入力オプション、`--json` |
| `dw workflow:query <workflow-id> <query-name>` | 読み取り専用クエリを実行。 | `--run-id`、入力オプション、`--json` |
| `dw workflow:update <workflow-id> <update-name>` | 更新を送信または実行。 | `--wait=accepted\|completed`, `--request-id`、`--run-id`、入力オプション、`--json` |
| `dw workflow:update-outcome <workflow-id> <update-id>` | 更新を再送信せずに、保持された更新結果を読み取ります。 | `--wait=accepted\|completed`, `--wait-timeout`, `--json` |
| `dw workflow:cancel [workflow-id]` | 1ワークフローまたは選択したバッチをキャンセルとして閉じる。コードのクリーンアップは動かない。 | `--reason`, `--run-id`, `--all-matching`, `--type`, `--status`, `--limit`, `--yes`, `--json` |
| `dw workflow:terminate <workflow-id>` | ワークフローを強制終了。 | `--reason`, `--run-id`, `--json` |
| `dw workflow:repair <workflow-id>` | 停滞または再試行可能な実行の修復を Server に要求。 | `--json` |
| `dw workflow:redrive <workflow-id> <run-id>` | 失敗した実行を、完了したステップを再利用する新しい実行で続行します。[失敗した実行を redrive する](../failures-and-recovery.md#redrive) を参照してください。 | `--request-id`, `--json` |
| `dw workflow:archive <workflow-id>` | 閉じた実行をアーカイブ。 | `--reason`, `--json` |

例:

```bash
dw workflow:start \
  --type=App\\Workflows\\ProcessOrder \
  --workflow-id=order-123 \
  --task-queue=payments \
  --input='["order-123"]' \
  --json

dw workflow:update order-123 approve --wait=completed --input='["manager"]'
dw workflow:cancel --all-matching='WorkflowType = "ImportJob"' --limit=25 --yes
```

`workflow:start`、`workflow:signal`、`workflow:query`、`workflow:update` は、Server が公開する要求契約に照らして正規フィールドを検証します。正規でない旧別名は要求送信前に拒否します。

### シグナルまたは更新を再試行する {#retry-a-signal-or-update}

`workflow:signal` と `workflow:update` は、コマンドキーを本文の `request_id` として送ります。値は `--request-id` の値、または呼び出しごとに生成される `cli-signal-…` か `cli-update-…` のキーです。CLI は各コマンドを一度だけ送り、自動で再送することはありません。応答を失った後は、使用したキーが表示され、JSON エラーエンベロープの `request_id` にも含まれます。同じ `--request-id`、名前、入力、`--run-id` で同じコマンドを繰り返します。

```bash
dw workflow:signal order-123 approve --input='["Grace"]' --request-id=approve-order-123
```

native Server 3.9.2 以降では、再試行は元の受領記録（`Retained: yes`）を返し、何も記録しません。CLI 2.11.0 以降では次のようになります。

- 同じキーで名前、入力、実行対象のいずれかが異なる場合、終了コード `9`（`request_id_conflict`）で終了します。
- あいまいなレガシー識別情報に一致するキーは、終了コード `10`（`request_id_ambiguous`）で終了します。
- レガシーの受領記録は `Intent Verified: no (legacy receipt; ...)` と表示されます。これは元の受理であり、再試行の入力が一致する証明ではありません。

どちらの拒否でも何も記録されません。変更せずにそのまま繰り返さないでください。CLI 2.10.0 以前は、どちらの拒否でも終了コード `2` で終了します。キーは 1〜255 文字の Unicode 文字列で、完全一致で比較されます。Server の契約は[シグナルと更新のコマンドキー](./server-api-reference.md#command-keys)を参照してください。

### 更新の結果を読み取る {#read-update-outcome}

CLI 2.8 以降では、Server が `capabilities.update_outcome_reads` を公開している場合（native 3.6.0 以降）、受け付け済みの更新を `update_id` で読み取れます。受け付け時のレシートにある ID を使ってください。

```bash
dw workflow:update-outcome order-123 "$UPDATE_ID"
dw workflow:update-outcome order-123 "$UPDATE_ID" --wait=completed --wait-timeout=30
```

既定の `--wait=accepted` はすぐに応答します。受け付け済みでも完了していない更新は、完了待ちがタイムアウトした場合も保留中です。完了した更新の結果が null の場合もあります。`--json` は検証済みのレシートを返すので、`update_status` で区別してください。各実行は結果を一度読み取るだけで、更新を再送信しません。

`--wait-timeout` には `--wait=completed` と 1 秒以上の整数が必要です。失敗した更新は終了コード 2 を返します。不明または削除済みの更新 ID は 5 を返しますが、更新が一度も受け付けられなかったことを意味しません。PHP Server 2.x など、この機能を持たない Server では、結果のリクエストを送る前に 8 で終了します。

### 履歴アーカイブ {#history-archives}

`dw workflow:history-archive`（dw 2.13.0 以降、native Server 3.0.3 以降、管理者資格情報が必要）は、閉じた実行を一つディレクトリに書き出します。このコマンドは Server の履歴エクスポート、外部ペイロード取得、バックアップホールドのルートを使用します。ディレクトリには、Server の履歴エクスポート、エクスポートが参照するすべての外部ペイロードの正確なバイト、各オブジェクトのコーデック・長さ・SHA-256 を記した `manifest.json`、および `receipt.json` が含まれます。

コピーは次の順に進みます。

1. dw は Server の外部ペイロードのバックアップホールドを取得し、コピー中にペイロードが回収されないようにします。
2. dw は各オブジェクトを一度だけ取得し、長さとダイジェストを確認します。
3. dw はディスク上のディレクトリ全体を検証します。
4. dw はホールドが一度も失効していないことを確認します。
5. その後に初めて、dw はレシートを書き込みます。

ホールドはどの経路でも解放されます。Ctrl-C の場合（終了コード 130）や、Unix での SIGTERM の場合（終了コード 143）も同様です。シグナルの後にレシートが書き込まれることはありません。

`--hold-ttl` はホールドのリース期間を秒単位で指定します。既定値は 900 で、60 から 3600 の範囲で指定できます。各オブジェクトはリース期間の半分以内に届く必要があるため、大きなオブジェクトでは値を増やしてください。

コマンドは次の三つの結果のいずれかを報告します。

| 結果 | 終了コード | 意味 |
| --- | --- | --- |
| `verified` | 0 | アーカイブは完全です。 |
| `incomplete` | 1 | レシートは書き込まれていません。同じコマンドを再実行すると再開します。 |
| `refused` | 2 | 何もコピーされていません。実行が開いている、削除済み、または秘匿化されている、履歴のシーケンスに欠落がある、またはランタイム転送で取得できない参照を含んでいます。 |

ほかのバックアップも同じホールドを使うため、別のバックアップがホールドを保持している間、コピーは HTTP 409（終了コード 2）で拒否されます。時間をおいて再試行してください。管理者以外のトークンは HTTP 403（終了コード 4）を受け取り、何もコピーされません。バックアップホールドのルートを持たない Server、または無効な `--hold-ttl` では終了コード 1 になります。その他の接続、認証、Server のエラーは通常の終了コードのままです。

`dw workflow:history-archive-check <directory>` は Server を必要としません。すべてのファイルを読み戻し、`verified`、失敗した確認ごとにコード付きの所見を伴う `incomplete`、または `refused` を報告します。

native Server 3.30.0 が追加するのは、オフライン検証コマンド `durable-workflow-server history-archive verify <directory>` だけで、`dw workflow:history-archive` はこれを必要としません。この検証コマンドはディレクトリだけを読み取り、JSON レポートを出力し、結果が `verified` の場合にのみ終了コード 0 で終了します。

アーカイブは選択した実行だけを対象とし、データベースのバックアップではありません。暗号化せずに書き出され、その保存期間はアプリケーションが管理します。形式、対象範囲、所見コードは Server の[履歴アーカイブガイド](https://github.com/durable-workflow/server/blob/main/docs/history-archives.md)にあります。

## サービス呼び出しの検査 {#service-call-inspection}

エンドポイントの名前空間の永続 Nexus 呼び出しを1件検査するには `dw service-call:describe <endpoint> <service> <operation> <call-id>` を使います。たとえば `dw service-call:describe billing invoices create call-42 --namespace=shared --json` は完全な Server レスポンスを返します。

レスポンスは元の呼び出し元とリンク対象、呼び出し期限、状態、結果、試行記録、型付き失敗、保持ペイロード参照を維持します。成功結果は損失のない Avro の `result_envelope` 値のままです。受理済み・開始済み呼び出しはまだ保留中であり、成功した完了結果ではありません。

コマンドは GET を1回要求します。再試行、キャンセル、外部オブジェクトのダウンロードは要求しません。Server は読み取り提供中に、リンクしたワークフローの終了結果と呼び出しを照合することがあります。名前空間認可と、エンドポイント、サービス、操作、呼び出しのセレクターはすべて適用されます。

## ブリッジアダプターコマンド {#bridge-adapter-commands}

ブリッジコマンドは統合イベントのための、範囲を制限した入口・引き継ぎツールです。Server のブリッジアダプターサーフェスを呼び、JSON モードで `durable-workflow.v2.bridge-adapter-outcome.contract` の構造を返します。ワークフローコードを実行せず、状態遷移も所有しません。

| コマンド | 用途 | 主なオプション |
| --- | --- | --- |
| `dw bridge:webhook <adapter>` | コントロールプレーンで開始、シグナル、更新を行う Webhook ブリッジイベントを1つ送る。 | `--action=start_workflow\|signal_workflow\|update_workflow`, `--idempotency-key`, `--target`、入力オプション、`--correlation`, `--json` |

例:

```bash
dw bridge:webhook stripe \
  --action=start_workflow \
  --idempotency-key=stripe-event-1001 \
  --target='{"workflow_type":"orders.fulfillment","task_queue":"external-workflows","business_key":"order-1001"}' \
  --input='{"order_id":"order-1001"}' \
  --json

dw bridge:webhook pagerduty \
  --action=signal_workflow \
  --idempotency-key=pd-event-3003 \
  --target='{"workflow_id":"wf-remediation-42","signal_name":"incident_escalated"}' \
  --input='{"severity":"critical"}'
```

HTTP 状態だけから動作を推測せず、ブリッジ結果フィールドを使います。`outcome`、`reason`、`control_plane_outcome`、`idempotency_key`、機密情報を除去した `target` 概要は、重複、ルーティング不一致、不正ペイロード、受理済み引き継ぎに対する自動化契約です。

## スケジュールコマンド {#schedule-commands}

| コマンド | 用途 | 主なオプション |
| --- | --- | --- |
| `dw schedule:create` | スケジュールを作成。 | `--schedule-id`, `--workflow-type`, `--cron`, `--interval`, `--task-queue`, `--timezone`, `--execution-timeout`, `--run-timeout`, `--overlap-policy`, `--jitter`, `--max-runs`, `--paused`, `--note`、入力オプション、`--json` |
| `dw schedule:list` | スケジュールを一覧。 | `--status`, `--type`, `--query`, `--limit`, `--next-page-token`, `--json` |
| `dw schedule:describe <schedule-id>` | 1スケジュールを説明。 | `--json` |
| `dw schedule:update <schedule-id>` | スケジュール仕様・入力を更新。 | 作成オプション、入力オプション、`--json` |
| `dw schedule:pause <schedule-id>` | 一時停止。 | `--note`, `--json` |
| `dw schedule:resume <schedule-id>` | 再開。 | `--note`, `--json` |
| `dw schedule:trigger <schedule-id>` | 即時発火。 | `--overlap-policy`, `--json` |
| `dw schedule:backfill <schedule-id>` | 時間帯をバックフィル。 | `--start-time`, `--end-time`, `--overlap-policy`, `--json` |
| `dw schedule:delete <schedule-id>` | 削除。 | `--json` |

間隔ベースのスケジュールを作るときは `--cron` または `--interval` のどちらかを使います。デプロイ時に登録してもまだ開始したくない場合は `--paused` を使います。

### スケジュールの絞り込みとページ取得 {#schedule-list-filters}

`dw schedule:list` は、解決された名前空間から絞り込み済みの1ページを返します。`--namespace` を省略すると、解決された既定の名前空間だけが対象になり、すべての名前空間は対象になりません。ステータス、ワークフロー型、可視性の条件は `AND` で結合されます。これらのオプションは[通常の公開 CLI と PHP Server の検証](https://github.com/durable-workflow/durable-workflow.github.io/issues/402#issuecomment-6370122227)で確認しています。

| CLI オプション | Server のクエリパラメーター | 意味 |
| --- | --- | --- |
| `--status` | `status` | `active` または `paused`。 |
| `--type` | `workflow_type` | 完全一致のワークフロー型。 |
| `--query` | `query` | スケジュールの可視性クエリ。 |
| `--limit` | `page_size` | 1〜200件。既定は50件。 |
| `--next-page-token` | `next_page_token` | 前のレスポンスから取得した不透明な継続トークン。 |

既存の `production` 名前空間に keyword 属性 `Region` が登録されている場合、リージョン `eu`、タスクキュー `orders` の一時停止中の `orders.rollup` スケジュールを取得します。

```bash
dw schedule:list --namespace=production --status=paused --type=orders.rollup \
  --query='Region = "eu" AND TaskQueue = "orders"' --limit=25 --json
```

JSON レスポンスの `next_page_token` を読み、その値を `NEXT_PAGE_TOKEN` に設定します。次のページでも同じ名前空間とフィルターを指定します。

```bash
dw schedule:list --namespace=production --status=paused --type=orders.rollup \
  --query='Region = "eu" AND TaskQueue = "orders"' --limit=25 --json \
  --next-page-token="$NEXT_PAGE_TOKEN"
```

トークンは名前空間とフィルターの組み合わせに属します。フィルターを変更した場合や、古いカーソルとして拒否された場合は、トークンなしで最初から取得してください。各呼び出しは現在のページを読み取り、固定スナップショットを読み取るわけではありません。対応するクエリ構文とレスポンスフィールドは、[スケジュール一覧 API の制約と拒否理由](/docs/polyglot/server-api-reference#schedule-list-filters)を参照してください。

## Worker とタスクキューのコマンド {#worker-and-task-queue-commands}

| コマンド | 用途 | 主なオプション |
| --- | --- | --- |
| `dw worker:register [worker-id]` | 容量と互換性メタデータを持つ Worker を登録。 | `--task-queue`, `--runtime`, `--sdk-version`, `--build-id`, `--workflow-type`, `--activity-type`, `--max-workflow-tasks`, `--max-activity-tasks`, `--json` |
| `dw worker:list` | Worker を一覧。 | `--task-queue`, `--status`、グローバル出力オプション |
| `dw worker:describe <worker-id>` | 1 Worker を説明。 | `--json` |
| `dw worker:deregister <worker-id>` | 1 Worker の登録解除。 | `--json` |
| `dw task-queue:list` | 有効なタスクキューと受け入れ状態を一覧。 | グローバル出力オプション |
| `dw task-queue:describe <queue>` | Worker 容量、リース、ディスパッチ上限、保留クエリ容量を説明。 | `--json` |
| `dw task-queue:build-ids <queue>` | 1キューの build-id 別コホートとロールアウト状態を検査。 | `--json` |
| `dw task-queue:drain <queue>` | コホートをドレイン中として新規クレームを止める。 | `--build-id <value>`, `--unversioned`, `--json` |
| `dw task-queue:resume <queue>` | 以前のドレインを消去して再び新規クレームを可能にする。 | `--build-id <value>`, `--unversioned`, `--json` |
| `dw task-queue:retirement <queue>` | 1つのビルドコホートまたはキュー全体の廃止をまだ妨げているものを、件数・サンプル・復旧手順とともに表示する。読み取り専用。 | `--build-id <value>`, `--unversioned`, `--json` |
| `dw task-queue:retire <queue>` | 依存するものが何もないときにだけ、1つのビルドコホートまたはキュー全体を廃止する。拒否された場合は何も変更しない。 | `--build-id <value>`, `--unversioned`, `--expected-revision <revision>`, `--json` |
| `dw task-queue:pause-activities <queue>` | 1 つのタスクキューで、再開するまで新しいアクティビティのディスパッチを保留する。 | `--reason <text>`, `--json` |
| `dw task-queue:resume-activities <queue>` | 一時停止中のタスクキューでアクティビティのディスパッチを再開する。 | `--json` |
| `dw task-queue:activity-dispatch <queue>` | アクティビティのディスパッチが一時停止中かどうかと、誰がいつ、なぜ一時停止または再開したかを表示する。 | `--json` |

タスクキューコマンドは、スロットリング、容量、Worker 不在を診断する推奨運用ビューです。Server 側のフィールドのポリシーは[タスクキューの受け入れ](/docs/polyglot/task-queue-admission)、バージョンなしからバージョン付きへの切り替え、カナリア、ドレイン、ロールバックの全手順は [Worker Build-Id のロールアウト](/docs/polyglot/worker-build-id-rollout)を参照してください。

`dw task-queue:drain` と `dw task-queue:resume` は両方とも、特定ビルドコホートを対象とする `--build-id <value>`、または `build_id` なしで登録した Worker コホートを対象とする `--unversioned` のどちらかが必要です。併用すると不正オプションで早期に失敗します。両コマンドは冪等です。ドレインを繰り返しても `drained_at` はずれず、有効なコホートの再開は何もしません。

`dw task-queue:retirement` と `dw task-queue:retire`（CLI 2.12.0 以降）は、1つのビルドコホート（`--build-id <value>` または `--unversioned`）を、どちらのオプションもなければキュー上の全コホートを調査・廃止します。

```bash
dw task-queue:retirement orders --build-id build-2026.04.20-a3f
dw task-queue:retire orders --build-id build-2026.04.20-a3f --expected-revision=sha256:...
```

調査は読み取り専用です。対象が廃止可能な場合は、調査したインベントリリビジョンに結び付いた対応する `dw task-queue:retire` コマンドを表示します。サーバーは廃止時にチェックを繰り返します。拒否された廃止は HTTP 409 で、何も変更しません。`dw` は各ブロッカーと復旧手順を表示し、コード `2` で終了します。両コマンドには `capabilities.worker_build_retirement` を通知するサーバー（ネイティブ Server 3.14.0 以降）が必要です。それ以外のサーバーでは、`dw` はリクエストを送信する前にコード `8` で終了します。全体の流れは[ビルドまたはキューを廃止する](/docs/polyglot/worker-build-id-rollout#retire-a-build-or-queue)を参照してください。

`dw task-queue:pause-activities`、`dw task-queue:resume-activities`、`dw task-queue:activity-dispatch`（CLI 2.7.0 以降）は、選択した namespace の 1 つのタスクキューで、アクティビティのディスパッチを一時停止、再開、表示します。たとえば下流サービスの障害中に使います。

```bash
dw task-queue:pause-activities orders --reason='payments vendor outage'
dw task-queue:activity-dispatch orders
dw task-queue:resume-activities orders
```

キューが一時停止中は、そのキューのアクティビティタスクはリースされません。準備済みのタスクは準備済みのまま試行回数を保ち、実行中のアクティビティは完了まで実行され、アクティビティの期限は進み続けるため、schedule-to-start や schedule-to-close のタイムアウトは引き続き発生します。ワークフロータスク、シグナル、クエリ、更新はこれまでどおり配信されます。`--reason` は最大 1000 文字です。一時停止と再開は冪等です。`--json` は Server の `outcome`（`paused`、`already_paused`、`resumed`、`not_paused`）を `activity_dispatch` の状態とともに返します。一時停止はビルド ID のドレインではありません。1 つのビルドの Worker を止めるには `dw task-queue:drain` を使います。

この 3 つのコマンドには、`capabilities.task_queue_activity_dispatch_pause` を通知する Server（native Server 3.8.0 以降）が必要です。それ以外の Server（公開済みの PHP Server 2.x を含む）では、`dw` は要求を送信する前に終了コード `8` で終了します。`dw task-queue:describe` と `dw task-queue:list` は、Server が報告する場合にアクティビティのディスパッチ状態を表示します。

## Worker プロトコルコマンド {#worker-protocol-commands}

これらは診断、スモークテスト、SDK を使わない Worker 実験のための低レベルツールです。通常の PHP と Python Worker は SDK の Worker ループを使うべきです。

| コマンド | 用途 | 主なオプション |
| --- | --- | --- |
| `dw workflow-task:poll <worker-id>` | ワークフロータスクを1件ポーリング。 | `--task-queue`, `--build-id`, `--poll-request-id`, `--history-page-size`, `--accept-history-encoding`, `--json` |
| `dw workflow-task:history <task-id> <page-token>` | リース済みタスクの次の履歴ページを取得。 | `--lease-owner`, `--attempt`, `--json` |
| `dw workflow-task:complete <task-id> <attempt>` | コマンドペイロードでタスクを完了。 | `--lease-owner`, `--complete-result`, `--command`, `--json` |
| `dw workflow-task:fail <task-id> <attempt>` | 再試行・診断のため実行失敗を報告。`fail_workflow` コマンドでタスクを完了することとは別。 | `--lease-owner`, `--message`, `--type`, `--stack-trace`, `--json` |
| `dw query-task:poll <worker-id>` | ルーティングされたクエリタスクを1件ポーリングしてリース。 | `--task-queue`, `--json` |
| `dw query-task:complete <query-task-id> <attempt>` | JSON 結果と一致するエンベロープでリース済みクエリを完了。 | `--lease-owner`, `--result`, `--json` |
| `dw query-task:fail <query-task-id> <attempt>` | 機械可読理由でクエリ失敗を報告。 | `--lease-owner`, `--message`, `--reason`, `--type`, `--stack-trace`, `--json` |
| `dw activity:complete <task-id> <attempt-id>` | リース済みアクティビティ試行を1件完了。 | `--lease-owner`、入力オプション、`--json` |
| `dw activity:fail <task-id> <attempt-id>` | リース済みアクティビティ試行を1件失敗にする。 | `--lease-owner`, `--message`, `--type`, `--non-retryable`, `--json` |

リプレイ不一致やデシリアライズエラーなど Worker 側の実行失敗には `workflow-task:fail` を使います。対象は `POST /worker/workflow-tasks/{taskId}/fail` です。ワークフロー自体を失敗させるコマンドでタスクを完了することは別で、適切なコマンドペイロードを持つ `workflow-task:complete` を使います。

`query-task:poll`、`query-task:complete`、`query-task:fail` は `/worker/query-tasks/…` のルーティングクエリ Worker サーフェスを操作します。通常の Worker は SDK クエリハンドラーから取得します。CLI は診断、CLI・SDK の同等性検査、SDK なしの Worker 実験向けです。クエリタスク失敗の既定は `--reason=query_rejected` です。呼び出し元が想定内の拒否とランタイムエラーを区別できるよう、`unknown_query`、`decode_failure`、ランタイム固有識別子など安定した理由文字列を使います。

### ワークフロータスクの履歴ページ {#workflow-task-history-pages}

`workflow-task:history` は Worker プレーンの履歴ページエンドポイントの CLI 診断ラッパーです。`workflow-task:poll` が `next_history_page_token` 付きのリース済みタスクを返した後にだけ使います。通常の Worker は SDK に追加ページを取得させるべきです。

<!-- docs-example id="cli.workflow-task-history.command" -->
```bash
dw workflow-task:history workflow-task-01 history-page-2 \
  --lease-owner=python-worker-1 \
  --attempt=2 \
  --json
```

JSON 出力はフィールド名を変更しない Server レスポンスです。

<!-- docs-example id="cli.workflow-task-history.response" -->
```json
{
  "history_events": [
    {"event_id": 2, "event_type": "ActivityScheduled", "payload": {}}
  ],
  "total_history_events": 4,
  "next_history_page_token": "history-page-3"
}
```

自動化は `history_events`、`total_history_events`、`next_history_page_token` を読みます。Worker 履歴はコントロールプレーンの実行履歴フィールド `events`、`next_page_token` を使いません。

## 名前空間と検索属性のコマンド {#namespace-and-search-attribute-commands}

| コマンド | 用途 | 主なオプション |
| --- | --- | --- |
| `dw namespace:list` | 名前空間を一覧。 | グローバル出力オプション |
| `dw namespace:create <name>` | 名前空間を作成。 | `--description`, `--retention`, `--json` |
| `dw namespace:describe <name>` | 1名前空間を説明。 | `--json` |
| `dw namespace:update <name>` | 名前空間メタデータを更新。 | `--description`, `--retention`, `--json` |
| `dw namespace:set-storage-driver <name> <driver>` | エンコード済みペイロードが退避しきい値を超えた際の外部ストレージポリシーを設定。 | `--threshold-bytes`, `--uri`, `--disk`, `--bucket`, `--prefix`, `--region`, `--endpoint`, `--auth-profile`, `--disable`, `--json` |
| `dw storage:test` | 選択した名前空間ポリシーまたはドライバー上書きで、小さなインラインと大きな退避ペイロードを書いて読み戻す。 | `--driver=local\|s3\|gcs\|azure`, `--small-bytes`, `--large-bytes`、グローバルオプション、`--json` |
| `dw search-attribute:list` | 検索属性を一覧。 | グローバル出力オプション |
| `dw search-attribute:create <name> <type>` | 検索属性を登録。 | `--json` |
| `dw search-attribute:delete <name>` | 検索属性を削除。 | `--json` |

検索属性型は `keyword`、`text`、`int`、`double`、`bool`、`datetime`、`keyword_list` など Server 互換の値です。

外部ペイロードストレージコマンドは Server の名前空間ストレージ API を呼びます。ドライバー引数は `local`、`s3`、`gcs`、`azure` のいずれかです。オブジェクトストアは Server 側ファイルシステム設定を使うため、CLI フラグはプロバイダー認証情報ではなく名前空間ポリシーを表します。`--disk` は `s3`、`gcs`、`azure` を、実際の認証情報を持つ名前付き Server 側ディスクへ結び付けます。`--disable` はポリシーレコードを残して新しい退避を防ぎます。

例:

```bash
dw namespace:set-storage-driver billing s3 \
  --disk=external-payload-objects \
  --bucket=dw-payloads \
  --prefix=billing/ \
  --threshold-bytes=2097152 \
  --json

dw namespace:set-storage-driver dev local \
  --uri=file:///var/lib/durable-workflow/payloads

dw storage:test --namespace=billing --large-bytes=2097152 --json
dw storage:test --driver=s3 --small-bytes=128 --large-bytes=3145728 --json
```

JSON モードの `namespace:set-storage-driver` は `external_payload_storage` ポリシー付きの名前空間ペイロードを返します。`storage:test` は診断状態と `small_payload`、`large_payload` 結果オブジェクトを返します。自動化は人間向けテーブルを解析せずこれらで分岐するべきです。

診断は参照エンベロープ契約の最短の運用検査でもあります。大きなペイロードの成功は、選択ポリシーがエンコード済みバイト列を書き、`durable-workflow.v2.external-payload-reference.v1` 参照を返し、読み戻して `size_bytes` と `sha256` を検証できることを証明します。失敗はストレージポリシーの問題として扱い、その名前空間でワークフローに退避を許す前に解決するべきです。

## システムコマンド {#system-commands}

システムコマンドは Server の保守処理を明示的でスクリプト化可能な操作として公開します。

| コマンド | 用途 | 主なオプション |
| --- | --- | --- |
| `dw system:repair-status` | ワークフロー修復バックログ・状態を表示。 | `--json` |
| `dw system:repair-pass` | 修復処理を1回実行。 | `--run-id`, `--limit`, `--json` |
| `dw system:activity-timeout-status` | アクティビティタイムアウトのバックログ・状態を表示。 | `--json` |
| `dw system:activity-timeout-pass` | タイムアウト処理を1回実行。 | `--task-id`, `--limit`, `--json` |
| `dw system:retention-status` | 保持期間による削除のバックログ・状態を表示。 | `--json` |
| `dw system:retention-pass` | 保持期限のクリーンアップ処理を1回実行。 | `--run-id`, `--limit`, `--json` |

運用手順書では、状態変更前に保留範囲が見えるよう、pass コマンドの前に status コマンドを使ってください。

## スキーマコマンド {#schema-commands}

| コマンド | 用途 | 主なオプション |
| --- | --- | --- |
| `dw schema:list` | 公開機械可読スキーマを一覧。 | Server 接続不要 |
| `dw schema:show <command-name>` | 1コマンド出力の同梱 JSON Schema を表示。 | `--output=json\|jsonl`、Server 接続不要 |
| `dw schema:manifest` | スキーママニフェストを表示。 | Server 接続不要 |

AI クライアントや CI ジョブが文章ドキュメントを解析せず現行コントロールプレーン、レスポンス、出力の契約を必要とするときに有用です。[現行 v4 マニフェスト](https://durable-workflow.github.io/cli-json-envelopes/v4/manifest.json)は、すべての JSON エンベロープとレコード単位 JSONL スキーマを公開リゾルバーとダイジェストで結び付けます。ワークフロー開始・実行とクエリ・更新のペイロードは `avro` だけを受け入れます。保持された [v3 マニフェスト](https://durable-workflow.github.io/cli-json-envelopes/v3/manifest.json)と [v2 マニフェスト](https://durable-workflow.github.io/cli-json-envelopes/v2/manifest.json)は、リビジョン固定の利用者向けに元のバイト列のまま利用できます。

## 出力と終了の契約 {#output-and-exit-contract}

1オブジェクトを返す場合は `--output=json`、一覧をストリーム処理へ渡す場合は `--output=jsonl` を使います。人間向けテーブルは改善できますが、JSON フィールド名は自動化契約です。

全コマンドは [CLI ガイド](/docs/polyglot/cli#exit-codes)の安定した終了コードポリシーを使います。

| コード | 意味 |
| --- | --- |
| `0` | 成功。 |
| `1` | コマンドは動作したが一般的な失敗。 |
| `2` | ローカルの使用法または検証エラー。 |
| `3` | ネットワーク・トランスポート失敗。 |
| `4` | 認証・認可失敗。 |
| `5` | リソースが見つからない。 |
| `6` | Server 側 `5xx` 失敗。 |
| `7` | タイムアウト。 |
| `8` | 互換性エラー。コマンドは要求を送信する前に拒否した。 |
| `9` | シグナルまたは更新のコマンドキーが、すでに別のコマンドを指している（`request_id_conflict`、CLI 2.11.0+）。 |
| `10` | シグナルまたは更新のコマンドキーが、あいまいなレガシー識別情報に一致する（`request_id_ambiguous`、CLI 2.11.0+）。 |

サポート用には `dw doctor --output=json`、`dw server:info --output=json`、`dw debug workflow <workflow-id> --output=json` を収集します。

## 関連ガイド {#related-guides}

- [CLI](./cli.mdx)はインストール、プロファイル設定、終了コードの動作を扱います。
- [Server](./server.md)は Server 利用コマンドが呼ぶ HTTP コントロールプレーンを記載します。
- [クライアントと Worker の機能](./cli-python-parity.md)は CLI、PHP、Python、Rust のクライアントと Worker サーフェスを比較します。
