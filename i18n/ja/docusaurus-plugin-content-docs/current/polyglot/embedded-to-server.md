---
sidebar_position: 1
title: 組み込みから Server への移行
description: Laravel 組み込み v2 デプロイをスタンドアロンの Durable Workflow Server へ移行します。
---

# 組み込みから Server への移行 {#embedded-to-server-migration}

このガイドは、すでに Laravel アプリケーション内で Durable Workflow v2 を実行し、新しいワークフロートラフィックをスタンドアロン Server へ移すチーム向けです。まだ v1 の場合は [2.0 への移行](/docs/migration)から始め、既存の v1 実行は完了まで v1 エンジンに残してください。

移行先が未定、または Laravel フレームワーク統合が判断に関わる場合は、まず [Laravel の採用とランタイム移行](/docs/laravel-adoption/)を使います。このページはセルフホスト Server を選んだ後の運用手順書であり、Cloud 移行手順ではありません。

この移行は採用経路であり、データベースをその場で移すものではありません。スタンドアロン Server は、新しいコントロールプレーンの開始、永続履歴、スケジュール、Worker 登録、HTTP によるタスク配信を所有します。アプリケーション Worker は引き続きワークフローとアクティビティのコードを所有します。

<div
  data-public-payload-codec-contract="avro-only"
  data-payload-codec="avro"
  data-authority-manifest="https://durable-workflow.github.io/sdk-neutrality-contract.json"
  data-legacy-v1-import-drain="internal">
  Durable Workflow 2.0 の公開ペイロードコーデックは <code data-payload-codec-field="codec">avro</code> だけです。
  JSON は HTTP ドキュメントのトランスポートであり、永続ペイロードコーデックではありません。PHP 専用の v1 reader はインポート・既存実行完了の内部経路に残り、新しい v2 実行には選択できません。<a href="/docs/polyglot/avro-value-protocol/">Avro Value プロトコル</a>を参照してください。
</div>

これはセルフホストの移行ガイドです。組み込みデプロイを Cloud 名前空間に変換せず、結果の Server も Durable Workflow Cloud に接続されません。別の管理サービスの選択肢は [Cloud 管理ランタイム](/docs/polyglot/cloud-control-plane)を参照してください。

## 現在の境界 {#current-boundary}

現在対応していること:

- Server のコントロールプレーン API または CLI から新しいワークフローを開始する。
- PHP、Python、Rust、カスタム HTTP Worker を Server へ登録する。
- Worker プロトコルでワークフロータスクとアクティビティタスクをポーリングして完了する。
- 適格な組み込み v2 履歴エクスポートバンドルを、Server 管理のワークフロー状態としてインポートする。
- 監査、デバッグ、アーカイブの引き継ぎのため、組み込み v2 または Server v2 から閉じた実行の履歴バンドルをエクスポートする。
- Server 状態を読む Server API、CLI、SDK サーフェスで Server 管理ワークフローを観測するか、PHP SDK 経由で接続する独立した観測サービスとして [Waterline サービスモード](/docs/monitoring#waterline-service)をデプロイする。元の Laravel アプリ内の Waterline パッケージは、その組み込みランタイムの状態だけを引き続き読む。

現在、自動操作として対応しないこと:

- v1 実行を Server へ移す。
- PHP 以外の Worker で v1 履歴をリプレイする。

v1 実行が開始した場所で完了するよう切り替えを計画してください。組み込み v2 実行は、その場で完了を待つか、後述のインポート手順で移せます。

## デプロイモードの契約 {#deployment-mode-contract}

固定された組み込みとサービスの比較は[デプロイモード](/docs/polyglot/deployment-modes)を参照してください。この移行ガイドは、その共通契約に切り替え固有の4規則を追加します。

- 既存の組み込み実行は、開始した場所で実行を続ける。
- 新しい Server 管理実行は、最初の切り替えから安定した型キー、名前空間名、タスクキュー、Avro ペイロード契約を使う。
- シグナル、クエリ、更新、修復、キャンセル、終了、アーカイブは、対象実行を所有するランタイムへ引き続きルーティングする。
- 各 Waterline デプロイは、観測対象のランタイムと名前空間を向き続ける。組み込みと Server 管理の実行を統合しない。

## 切り替えの不変条件 {#cutover-invariants}

移行中は次の規則を維持します。

- Server を明示的なリモート依存先として設定する。Laravel アプリのローカル設定から推測せず、ベース URL、名前空間、タスクキュー、認証情報を直接設定する。
- 両ランタイムでワークフロー ID、対象実行の規則、ワークフロー・アクティビティ型キー、ペイロードコーデックタグ（`avro`）、互換性マーカーを安定させる。
- シグナル、クエリ、更新、修復、キャンセル、終了、アーカイブを対象実行の所有ランタイムへ送る。
- 組み込み実行のインポート前に、リース中のワークフロー・アクティビティタスクも実行中のアクティビティ試行もない静止したバンドルをエクスポートできるだけ、組み込み Worker を一時停止する。
- 言語中立性を移行契約の一部として扱う。Server 管理ワークフローは PHP 専用クラス名や形式ではなく、安定した別名と固定の Avro Value スキーマを使う。

## フェーズ A: 組み込み v2 の準備 {#phase-a-prepare-embedded-v2}

Server をデプロイする前に、組み込みアプリで言語に依存しない契約を使います。切り替え中に変更するコード量を減らせます。

1. 安定したワークフロー型キーとアクティビティ型キーを定義します。

   ```php
   // config/workflows.php
   'v2' => [
       'types' => [
           'workflows' => [
               'orders.process' => App\Workflows\ProcessOrderWorkflow::class,
           ],
           'activities' => [
               'orders.reserve-inventory' => App\Activities\ReserveInventory::class,
               'orders.capture-payment' => App\Activities\CapturePayment::class,
           ],
       ],
   ],
   ```

2. すべての外部境界でそのキーを使います。

   Server クライアントは `workflow_type: "orders.process"` を送信し、Worker は同じ文字列で `supported_workflow_types` / `supported_activity_types` を登録します。PHP FQCN を永続的な公開契約として公開しないでください。

3. v2 Avro ペイロード契約を使います。

   ```php
   // config/workflows.php
   'serializer' => 'avro',
   ```

   新しい組み込みと Server 管理の v2 ワークフローには Avro が必須です。古い PHP reader は、旧 v1 実行の完了を待つ間、v1 インポート・完了経路の内部だけに保持できます。

4. 名前空間とタスクキューの名前を選びます。

   組み込みから Server への切り替えを通じて維持できる名前を選んでください。

   ```bash
   export DURABLE_WORKFLOW_NAMESPACE=production
   export DURABLE_WORKFLOW_TASK_QUEUE=orders
   ```

5. 互換性マーカーが必要か判断します。

   単一の Worker 群では互換性を未設定にできます。標準の v2 ロールアウト機構（カナリア、ドレイン、ロールバック、リプレイデバッグ）はすべて1つの安定した v2 契約内で動作します。「混在 Worker 群の v2」という採用経路はありません。組み込みから Server への切り替え中にビルド差異の期間が生じる場合は、切り替え前に `DW_V2_CURRENT_COMPATIBILITY` と `DW_V2_SUPPORTED_COMPATIBILITIES` を設定し、その期間に新ビルドが非互換ビルドの実行をクレームしないようにします。

## フェーズ B: 組み込みと並行して Server をデプロイする {#phase-b-deploy-the-server-beside-embedded}

アプリが既存の組み込み実行を処理する間、Laravel アプリの隣でスタンドアロン Server を動かします。

```bash
git clone https://github.com/durable-workflow/server.git
cd server
cp .env.example .env
docker compose up -d
```

ローカル開発では `DW_AUTH_DRIVER=none` を設定できます。共有環境ではロール別認証情報を使います。

```bash
DW_AUTH_DRIVER=token
DW_WORKER_TOKEN=worker-secret
DW_OPERATOR_TOKEN=operator-secret
DW_ADMIN_TOKEN=admin-secret
```

ディスカバリーを検証し、名前空間を作成します。

```bash
export SERVER=http://localhost:8080
export ADMIN_TOKEN=admin-secret
export OPERATOR_TOKEN=operator-secret

curl "$SERVER/api/health"

curl "$SERVER/api/cluster/info" \
  -H "Authorization: Bearer $OPERATOR_TOKEN"

curl -X POST "$SERVER/api/namespaces" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"name":"production","description":"Production workflows","retention_days":30}'
```

Server は `X-Durable-Workflow-Control-Plane-Version: 2` のないコントロールプレーン要求を拒否します。Worker は別のヘッダー `X-Durable-Workflow-Protocol-Version: 1.0` を使います。

## フェーズ C: Worker を接続する {#phase-c-connect-workers}

Worker はポーリング前に登録する必要があります。登録はランタイム、タスクキュー、実行可能な型キーを広告します。

```bash
export WORKER_TOKEN=worker-secret

curl -X POST "$SERVER/api/worker/register" \
  -H "Authorization: Bearer $WORKER_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Protocol-Version: 1.0" \
  -H "Content-Type: application/json" \
  -d '{
    "worker_id": "orders-php-1",
    "task_queue": "orders",
    "runtime": "php",
    "sdk_version": "<installed-sdk-version>",
    "supported_workflow_types": ["orders.process"],
    "supported_activity_types": [
      "orders.reserve-inventory",
      "orders.capture-payment"
    ],
    "max_concurrent_workflow_tasks": 10,
    "max_concurrent_activity_tasks": 50
  }'
```

次に同じ名前空間とタスクキューで Server モードの Worker を動かします。Python Worker は Python SDK 経由で同じ登録・ポーリング契約に従います。カスタム Worker は [Worker プロトコル](/docs/polyglot/worker-protocol)を直接使えます。

切り替え前に可視性を確認します。

```bash
curl "$SERVER/api/workers" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"

curl "$SERVER/api/task-queues/orders" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

## フェーズ D: 新しい開始を Server へ向ける {#phase-d-route-new-starts-to-the-server}

ワークフローファミリーを1つずつ切り替えます。古い実行が完了するまで、組み込みアプリとキュー Worker を動かし続けます。

最初に検証用のシャドーワークフローを開始します。

```bash
curl -X POST "$SERVER/api/workflows" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "orders-shadow-1001",
    "workflow_type": "orders.process",
    "task_queue": "orders",
    "input": [{"order_id":"1001","mode":"shadow"}]
  }'
```

実行を監視します。

```bash
curl "$SERVER/api/workflows/orders-shadow-1001" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

シャドー経路が動作したら、本番の呼び出し元を `WorkflowStub::start()` から Server クライアント、CLI、または直接 HTTP API へ移します。シグナル、クエリ、更新、キャンセル、終了は、開始したランタイムへ向けたままにします。組み込みで開始したワークフローには組み込みコマンド、Server で開始したワークフローには Server コントロールプレーンコマンドを送るべきです。

## フェーズ E: 適格な組み込み v2 実行をインポートする {#phase-e-import-eligible-embedded-v2-runs}

履歴エクスポートをインポート形式として使います。バンドルの正本は組み込みランタイムです。Server は検証し、単一トランザクション内で永続行を書き込み、その行から Server のプロジェクションを再構築します。

適格性:

- バンドルスキーマは `durable-workflow.v2.history-export`、`schema_version: 1` でなければならない。
- 元の実行は組み込み v2 で、エクスポートは `workflow.source_runtime: "embedded"` を含む必要がある。v1 履歴は対象外。
- 未終了の実行は現在の組み込み実行でなければならない。
- 終了済みの実行には `history_complete: true` が必要。
- 機密情報を除去したバンドルは拒否される。
- リース中のワークフロータスク、リース中のアクティビティタスク、実行中のアクティビティ試行は拒否される。Worker を一時停止するかリース期限切れを待ち、再エクスポートする。

インポートの正本に関する規則:

- `history_events` は権威あるリプレイ・監査ログとしてコピーする。
- ワークフロー ID、ペイロード、コマンド、シグナル、更新、タスク、アクティビティ実行、タイマー、失敗、系譜リンクをバンドルから再構築する。
- Server の概要、待機、タイマー、タイムライン、系譜のプロジェクションをインポート後に再構築する。プロジェクション行はインポートの正本ではない。
- 保留中のワークフロータスクは互換 Server Worker が引き続きクレームできる。
- 保留中のアクティビティ実行と実行可能アクティビティタスクは、互換 Server アクティビティ Worker が引き続きクレームできる。
- 保留中のタイマーは `fire_at` 時刻を維持し、Server のタイマー修復・復旧から可視である。

失敗とロールバック:

- インポートは単一データベーストランザクション内ですべて適用するか、何も適用しない。
- コミット前にプロセスが終了するか検証に失敗した場合、部分的な実行状態は Server に残らない。
- 同じバンドルの再試行は `run_id` と `dedupe_key` によって冪等。
- 別の Server 実行が同じ `run_id` をすでに所有する場合、インポートは拒否される。

可視性と監査:

- インポート済み実行は Server の一覧・詳細で `engine_source: embedded_v2_import` を公開する。
- 永続実行行は `import_source=embedded_v2`、`import_id`、`import_dedupe_key`、`import_contract_version`、`imported_at` を記録する。

運用手順:

組み込み v2 実行の場合:

```bash
php artisan workflow:v2:history-export order-123 \
  --output=storage/workflow-history/order-123.json \
  --pretty
```

Server でインポートのドライランを行います。

```bash
php artisan workflow:v2:history-import storage/workflow-history/order-123.json \
  --namespace=production \
  --dry-run \
  --json
```

バンドルをインポートします。

```bash
php artisan workflow:v2:history-import storage/workflow-history/order-123.json \
  --namespace=production \
  --import-id=orders-cutover-2026-05-05
```

または HTTP の運用エンドポイントを呼びます。

```bash
curl -X POST "$SERVER/api/workflows/import/embedded-v2" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  --data-binary @order-123-import-request.json
```

ここで `order-123-import-request.json` は次の内容です。

```json
{
  "import_id": "orders-cutover-2026-05-05",
  "bundle": {
    "schema": "durable-workflow.v2.history-export",
    "schema_version": 1,
    "workflow": {
      "source_runtime": "embedded"
    }
  }
}
```

上記の `bundle` オブジェクトは省略しています。完全な `workflow:v2:history-export` JSON ドキュメントを渡してください。

保持や監査だけが必要な Server 管理実行の場合:

```bash
curl "$SERVER/api/workflows/order-123/runs/$RUN_ID/history/export" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  > order-123-history.json
```

保持期間による削除の対象外にしたい場合は、エクスポート後に終了済み Server 実行をアーカイブします。

```bash
curl -X POST "$SERVER/api/workflows/order-123/archive" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"reason":"history exported to archive storage"}'
```

## フェーズ F: 多言語 Worker を追加する {#phase-f-add-polyglot-workers}

ワークフローファミリーが Server 経由で動くようになったら、同じ名前空間、タスクキュー、型キーを登録して Python、Rust、カスタム Worker を追加します。公開 v2 ペイロードはすべて `avro` を使います。アクティビティの入出力は配列、オブジェクト、文字列、数値、真偽値、null といった言語に依存しないものに保ちます。

[Python SDK ガイド](/docs/polyglot/python)または [Rust SDK ガイド](/docs/polyglot/rust)を使います。直接 HTTP を実装する場合は [Worker プロトコルリファレンス](/docs/polyglot/worker-protocol)を使ってください。

## 切り替えチェックリスト {#cutover-checklist}

- [ ] v1 実行は完了済み、または意図的に v1 エンジンに残している。
- [ ] 組み込み v2 は外部境界で PHP FQCN ではなく安定した型キーを使う。
- [ ] 新しい v2 ワークフローはすべて唯一の公開コーデック `avro` を使う。
- [ ] デプロイネットワークから Server の `/api/health` と `/api/cluster/info` が成功する。
- [ ] 対象の名前空間が Server に存在する。
- [ ] Worker は期待したタスクキューと対応型キーで登録する。
- [ ] シャドーワークフローが開始され、Worker にクレームされ、期待状態に達する。
- [ ] 運用担当者がワークフロー一覧、タスクキューの検査、Worker 登録の表示を行える。
- [ ] 古い組み込みの開始元は一時停止または移行され、同じビジネスキーが両ランタイムで開始されない。
- [ ] インポート対象の組み込み v2 実行は静止した組み込みランタイムからエクスポートされ、`workflow:v2:history-import --dry-run` に合格する。
- [ ] インポート済み実行は Server の詳細・一覧で `engine_source: embedded_v2_import` と期待する `import_id` を示す。
- [ ] 保持だけが必要な閉じた旧実行は永続ストレージへエクスポート済み。

## トラブルシューティング {#troubleshooting}

| 症状 | 想定原因 | 対処 |
| --- | --- | --- |
| `missing_control_plane_version` | クライアントが v2 ヘッダーなしでコントロールプレーンルートを呼んだ | `X-Durable-Workflow-Control-Plane-Version: 2` を送る |
| `missing_protocol_version` | Worker が Worker プロトコルヘッダーなしで Worker ルートを呼んだ | `X-Durable-Workflow-Protocol-Version: 1.0` を送る |
| `namespace_not_found` | Server に名前空間が未作成 | `POST /api/namespaces` で作る |
| Worker のポーリングがタスクなしを返す | タスクキュー、型キー、名前空間、互換性マーカーの不一致 | ワークフロー開始ペイロード、Worker 登録、タスクキューの可視性を比較する |
| PHP 以外の Worker が v1 ペイロードをデコードできない | 実行に PHP ネイティブ v1 履歴が含まれる | 内部の PHP v1 インポート・完了経路に残し、v2 Worker へルーティングしない |
| 古いワークフローが Server のシグナル・クエリ・更新に反応しない | 組み込みモードで開始した実行 | 完了するまで組み込みアプリ経由でコマンドを送る |
| インポートが `tasks.leased_task_present` を拒否 | 組み込みエクスポートがリース中タスクを取り込んだ | 組み込み Worker を一時停止し、リースの解放または完了を待ち、再エクスポートする |
| インポートが `already_imported` を返す | 同じ `run_id` と `dedupe_key` が Server に存在する | 再試行を成功と扱い Server 実行を検査する |
| インポート済み実行は見えるがクレームされない | Worker 型キー、タスクキュー、名前空間、互換性マーカーがインポート行と不一致 | インポート報告、実行詳細、Worker 登録を比較する |

## 関連ガイド {#related-guides}

- [Server セットアップ](/docs/polyglot/server)
- [Worker プロトコル](/docs/polyglot/worker-protocol)
- [Python SDK](/docs/polyglot/python)
- [2.0 への移行](/docs/migration)
