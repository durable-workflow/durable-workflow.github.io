---
sidebar_position: 7
title: Worker Build-Id のロールアウト
description: スタンドアロン Server の build-id ロールアウト状態を使い、実行を取り残さず Worker ビルドのロールアウト、カナリア、ドレイン、ロールバックを行います。
tags:
  - worker-protocol
  - operations
  - rollouts
  - build-ids
  - task-queues
keywords:
  - Worker ビルド ID のロールアウト
  - Worker ビルドのドレイン
  - Worker ビルドのロールバック
  - カナリア Worker
  - バージョンなしからバージョン付きへの切り替え
---

# Worker Build-Id のロールアウト {#worker-build-id-rollout}

バージョンなし Worker からビルドタグ付き Worker への切り替え、タスクキューでの新ビルドのカナリア運用、廃止前の旧ビルドのドレイン、不良ビルドのロールバックに、このリファレンスを使います。Server は稼働中の Worker 行とともに運用担当者の意図を記録します。これにより、古い Worker がバックログの処理完了前に消えても、次のポーリング、CLI の describe、`list_task_queue_build_ids` 呼び出しは正確なロールアウト状態を反映します。

このガイドはコホート制御を扱います。ルーティング契約全体については、[Worker の互換性とルーティング](/docs/polyglot/worker-compatibility-routing)を参照してください。進行中の処理は互換性のある実行主体に固定し、「互換 Worker が利用できない」状態を明示的な運用状態として扱う規則を説明しています。

Durable Workflow Server は、1つのタスクキューのロールアウトを **build-id コホート**の集合として表します。コホートは、`POST /api/worker/register` 呼び出し時に同じ `build_id` を報告したすべての Worker 登録をまとめます。`build_id` を省略した Worker は**バージョンなしコホート**を形成します。これはロールアウト前の既定で、最初の切り替え時に移行元となります。

## Server が記録するロールアウト状態 {#rollout-state-the-server-records}

各 `(namespace, task_queue, build_id)` コホートは、Worker 状態の集計（有効、ドレイン中、古い、合計の数）と運用担当者の意図を持ちます。

| フィールド | 用途 |
| --- | --- |
| `build_id` | 登録したビルドの ID。`null` はバージョンなしコホートを示す。 |
| `rollout_status` | 新しいタスクに対するコホートの動作の集計表示。`active`、`active_with_draining`、`draining`、`stale_only`、`no_workers`。 |
| `drain_intent` | コホートに対する運用担当者の意図。`active` または `draining`。 |
| `drained_at` | 初めてドレイン中とマークした時刻。有効なコホートには存在しない。ドレインを繰り返してもこの時刻は変わらない。 |
| `active_worker_count` | 現在新しいタスクを受け入れる稼働中 Worker 数。 |
| `draining_worker_count` | 進行中タスクを保持するが、新しい処理をクレームしない稼働中 Worker 数。 |
| `stale_worker_count` | 最後のハートビートが古いと判断するしきい値より前の Worker 数。 |
| `total_worker_count` | 3つの Worker 集団の合計。 |
| `runtimes`, `sdk_versions` | コホート内で観測したランタイムと SDK バージョン文字列の重複なし一覧。 |
| `last_heartbeat_at`, `first_seen_at` | コホート全体のハートビート期間。削除前に静止したコホートを確認するのに有用。 |

`drain_intent` は永続的です。Worker の再起動、全 Worker の停止、コホートの陳腐化によって、黙って `active` に戻ることはありません。明示的な `POST .../build-ids/resume` だけが `drain_intent` と `drained_at` を消去します。これにより、稼働中 Worker がいなくなった後も `rollout_status` は正確です。

## ロールアウトを検査する {#inspect-the-rollout}

ビルドをドレインまたは削除する前に、キューで引き続き到達可能なコホートを確認します。

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/task-queues/orders-critical/build-ids" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

同じスナップショットは運用 CLI と Python SDK でも取得できます。

```bash
dw task-queue:build-ids orders-critical --json
```

```python
from durable_workflow import Client

async with Client("https://durable-workflow.example", token=operator_token) as client:
    rollout = await client.list_task_queue_build_ids("orders-critical")
    for cohort in rollout.build_ids:
        print(cohort.build_id, cohort.rollout_status, cohort.total_worker_count)
```

## 最初の切り替え: バージョンなしからバージョン付きへ {#first-cutover-unversioned-to-versioned}

常にバージョンなし Worker が処理してきたキューは、`rollout_status: "active"` の単一 `build_id: null` コホートを報告します。最初の切り替えでは、それと並べて新しいビルドタグ付きコホートを導入します。

1. 安定した `build_id`（例: `orders-worker-2026-04-22`）を `POST /api/worker/register` で登録する新しい Worker 群をデプロイします。
2. 両方のコホートが有効なことを確認します。
   ```bash
   dw task-queue:build-ids orders-critical --json
   ```
   `null` と新しい `build_id` の両方が `rollout_status: "active"` と非ゼロの `active_worker_count` を報告するはずです。
3. 新しい Worker が処理を担当し始めたら、バージョンなしコホートのドレインを開始します。
   ```bash
   dw task-queue:drain orders-critical --unversioned
   ```
   バージョンなしコホートの `drain_intent` は `draining` に変わります。稼働中の Worker は進行中タスクを処理しますが、新しいタスクのクレームを止めます。その後 `build_id` なしで届く Worker 登録やハートビートもドレイン中として扱います。
4. バージョンなしコホートの `active_worker_count` と `draining_worker_count` が両方とも 0 になるまで待ちます。コホートは `drain_intent: "draining"` で一覧に残るため、切り替えが永続的であることを確認できます。

## 新ビルドをカナリア運用する {#canary-a-new-build}

カナリアは、主ビルドがサービスを続ける間に少量のトラフィックを受ける2つ目のビルドです。各コホートの状態を個別に検査できるよう、別の `build_id` を使います。

1. `build_id: orders-worker-2026-04-22-canary` を持つカナリア Worker をデプロイします。
2. `list_task_queue_build_ids` を検査し、両方のコホートが `rollout_status: "active"` と期待した Worker 数を報告することを確認します。
3. 新しい `build_id` の Worker を増やして主ビルドの Worker 数を減らして昇格するか、次のようにドレインしてカナリアを降格します。
   ```bash
   dw task-queue:drain orders-critical --build-id orders-worker-2026-04-22-canary
   ```

Server はコホート間のタスク配分を制御しません。運用担当者が各コホートの規模を決め、ポーリングの分布でトラフィックの重みを付けます。build-id ロールアウト状態により、どのコホートがまだ処理をクレームできるかを確認し、コホートの停止準備ができたときに明確な引き継ぎを開始できます。

## 旧ビルドをドレインする {#drain-an-older-build}

ドレインは、すでにリースしたタスクを旧ビルドに残し、新しいタスクをキュー上のほかの有効なコホートへ送ります。

```bash
dw task-queue:drain orders-critical --build-id orders-worker-2026-04-21-z9
```

Server はコホートに `drain_intent: "draining"` を記録し、その `build_id` で登録したすべての Worker を次のハートビートでドレイン中とマークします。呼び出しは冪等です。再実行しても `drained_at` はリセットされず、自動化から安全に再試行できます。

Worker 行が `draining` になると、ワークフロータスク、アクティビティタスク、クエリタスクのポーリングルートはその Worker に新しい処理をリースしません。コホートを再開するまで、ポーリングは HTTP `409`、`poll_status: "draining"`、`reason: "worker_draining"` で失敗します。

`draining` は一般的なポーリングレスポンス契約の一部であり、ドレイン専用の特殊なフィールドではありません。同じ `poll_status` サーフェスを通じて、Worker は通常の `leased` と `empty`、受け入れ制御の `throttled`、ほかのポーリング経路の型付き `unavailable` 調整失敗を観測します。

`list_task_queue_build_ids` をポーリングし、`active_worker_count` と `draining_worker_count` が 0 に下がるのを監視します。その時点で、コホートは Worker 数 0 の `rollout_status: "draining"` を示します。稼働中 Worker は残っておらず、運用担当者の意図は引き続き「ドレイン済み」と記録されています。この時点で Worker プロセスを停止し、ビルド成果物を安全に削除できます。

## 不良ビルドをロールバックする {#roll-back-a-bad-build}

ロールバックは逆の流れです。以前ドレインしたコホートを再開し、新しいトラフィックを戻し、不良ビルドをドレインします。

1. 正常と分かっているコホートを再開します。
   ```bash
   dw task-queue:resume orders-critical --build-id orders-worker-2026-04-21-z9
   ```
   Server は `drain_intent` と `drained_at` を消去し、その `build_id` で引き続きハートビートしている Worker 行を直ちに `active` に戻します。読み取りエンドポイントはドレイン状態を報告しなくなります。
2. 不良コホートをドレインします。
   ```bash
   dw task-queue:drain orders-critical --build-id orders-worker-2026-04-22
   ```
3. 正常なビルドの規模を再び増やすか、すでに Worker を停止している場合は再デプロイします。その `build_id` で登録する Worker は消去済みのドレイン意図を受け取り、`active` として登録されます。

再開も冪等です。すでに有効なコホートに再実行しても何も変えないため、自動ロールバックフローでも安全に呼び出せます。

## エンドポイントとコマンドのリファレンス {#endpoints-and-commands-reference}

| 意図 | HTTP エンドポイント | CLI | Python SDK メソッド |
| --- | --- | --- | --- |
| コホート状態を検査 | `GET /api/task-queues/{taskQueue}/build-ids` | `dw task-queue:build-ids` | `Client.list_task_queue_build_ids` |
| コホートをドレイン中とマーク | `POST /api/task-queues/{taskQueue}/build-ids/drain` | `dw task-queue:drain` | `Client.drain_task_queue_build_id` |
| 以前ドレインしたコホートを再開 | `POST /api/task-queues/{taskQueue}/build-ids/resume` | `dw task-queue:resume` | `Client.resume_task_queue_build_id` |

ドレインと再開はともに JSON 本文 `{"build_id": "..."}` を受け取り、バージョンなしコホートでは `{"build_id": null}` を使います。CLI はバージョンなしコホートを `--unversioned`、その他のビルドを `--build-id <value>` で表します。両方を組み合わせると早期に失敗します。

## 関連リファレンス {#related-references}

- [名前空間、認証、Worker 登録](/docs/polyglot/namespace-auth-workers): 各 Worker に `build_id` を記録する `POST /api/worker/register` 呼び出し
- [タスクキューの受け入れ](/docs/polyglot/task-queue-admission): ロールアウト状態と併用する Worker スロットとディスパッチの上限
- [Server API リファレンス](/docs/polyglot/server-api-reference): コントロールプレーンの全ルート、必要なロール、プロトコルヘッダー
- [CLI コマンドリファレンス](/docs/polyglot/cli-reference): すべての `dw task-queue:*` サブコマンドの引数とフラグ
