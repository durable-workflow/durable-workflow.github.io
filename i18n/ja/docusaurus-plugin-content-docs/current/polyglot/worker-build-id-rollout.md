---
sidebar_position: 7
title: ワーカーのビルドIDロールアウト
description: コホートを確認し、新規開始用のビルドを選び、古いビルドに固定された実行の処理能力を維持します。
tags: [worker-protocol, operations, rollouts, build-ids, task-queues]
keywords: [ワーカービルド, ドレイン, ロールバック, カナリア, バージョンなしワーカー]
---

# ワーカーのビルドIDロールアウト

## ビルド変更前のリプレイ {#replay-before-changing-builds}

候補を昇格する前に、代表的な実行中および最近終了した履歴を、その候補の正確なアプリケーションコードでリプレイします。ロールバック前には、新しいビルドが書き込んだ履歴を古いアーティファクトでリプレイしてください。[リプレイの判定](../testing.md#replay-before-deployment)に従います。ルーティング先の互換コホートや整合性確認の成功だけでは、リプレイ互換性を証明できません。

このガイドでは、コホートの確認、新規ワークフロー用ビルドの選択、既存実行に必要な互換ワーカーの維持を説明します。昇格は新規開始の選択を変更し、ドレインは対象コホートの新しいタスク取得を止めます。どちらも既存実行を移行せず、ビルドを削除できる根拠にもなりません。

タスク、アクティビティ、再試行、子、continue-as-newが保持する識別情報は[ワーカーの互換性とルーティング](/docs/polyglot/worker-compatibility-routing)を参照してください。コホートの範囲は`(namespace, task_queue, build_id)`です。`build_id`のない登録は、バージョンなしの`null`コホートに属します。

## サーバーが保存するロールアウト状態 {#rollout-state-the-server-records}

| フィールド | 意味 |
| --- | --- |
| `build_id` | 登録されたビルド識別子。`null`はバージョンなしコホートです。 |
| `rollout_status` | `active`、`active_with_draining`、`draining`、`stale_only`、`no_workers`のいずれかです。 |
| `drain_intent`, `drained_at` | 永続的なドレイン意図と最初の時刻。再実行しても時刻は変わりません。 |
| `promoted_at`, `rolled_back_at` | 保存された昇格とロールバックの時刻。 |
| `new_start_selected` | 明示的な昇格で選択されたコホート。`false`でも、後述の単一コホートへのフォールバックはあり得ます。 |
| `active_worker_count` | 最新で、ドレイン中でない登録数。空きスロット数でも、全ワークフロー型の対応保証でもありません。 |
| `draining_worker_count` | 最新かつドレイン指定された登録数。新規取得はできませんが、必ずしもリースを保持しているわけではありません。 |
| `stale_worker_count` | heartbeatが`stale_after_seconds`より古い登録数。 |
| `total_worker_count` | アクティブ、ドレイン中、古い登録の合計。 |
| `runtimes`, `sdk_versions` | 登録で観測したランタイムとSDKの文字列。 |
| `last_heartbeat_at`, `first_seen_at` | 登録の鮮度と経過時間。残存実行がない証拠ではありません。 |
| `pending_workflow_tasks` | 以下で説明するワークフロータスク数と診断。 |

ドレイン意図は再起動、ワーカー不在、古いheartbeatを越えて残ります。明示的な再開でのみ解除され、不在のワーカーが自動再開されることはありません。

## ロールアウトを確認する {#inspect-the-rollout}

処理能力を変える前に、正確な名前空間とキューを確認してください。

```bash
curl -fsS "$DURABLE_WORKFLOW_SERVER_URL/api/task-queues/orders-critical/build-ids" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

```bash
dw task-queue:build-ids orders-critical --namespace orders-prod --json
```

```python
from durable_workflow import Client

async with Client("https://durable-workflow.example", token=operator_token,
                  namespace="orders-prod") as client:
    rollout = await client.list_task_queue_build_ids("orders-critical")
    for cohort in rollout.build_ids:
        print(cohort.build_id, cohort.rollout_status, cohort.total_worker_count)
```

古いSDKの応答モデルにない追加フィールドについては、HTTPスナップショットを基準にします。

## コホート別の未完了ワークフロータスク {#pending-workflow-tasks-by-cohort}

`pending_workflow_tasks`は、この名前空間とキューのワークフロータスクだけを数えます。タスクの実効互換性で分類し、未設定なら実行の互換性を使います。アクティビティの滞留、開いた実行数、スループット、プロセス負荷ではありません。

| 子フィールド | 解釈 |
| --- | --- |
| `ready_count` | `ready`状態のワークフロータスク行数。 |
| `leased_count` | `leased`状態の行数。 |
| `total_count` | `ready_count + leased_count`。 |
| `status` | 0件なら`idle`。それ以外は`pending`、または非nullビルドにアクティブワーカーがいなければ`no_compatible_worker`。 |
| `operator_visible_signal`, `message` | 互換ワーカー不在の診断。それ以外ではnullになり得ます。 |

バージョンなしコホートには、このビルド固有の不在診断は付きません。フィールド欠落、要求失敗、古い観測を0件とみなさず、再取得してheartbeatと型の宣言を確認してください。

例えば旧ビルドにreadyが2件、leasedが1件あり、新ビルドには0件の場合があります。キュー合計3件だけでは、どちらのフリートに処理能力が必要か分かりません。旧ビルドのアクティブワーカーが0なら、互換ワーカーを復旧するか、誤ったドレインを明示的に解除します。新ビルドの増員では旧ピンの仕事を消費できません。古い登録しか残らない場合は、利用可能と数える前にプロセスやheartbeatの喪失を調べてください。

コホートを縮小する際は、個別のタスク数、最新ワーカー、宣言型、空きスロット、ドレイン意図を確認します。既存リースと既存実行から将来生じる仕事の処理能力を残してください。シグナル、タイマー、アクティビティ、子を待つ実行は、今のワークフロータスクが0でも後で旧ビルドを必要とします。アクティビティは別の保存済みキューを使う場合もあります。このエンドポイントは、安全な廃止判断や、最後の必要コホートを0へ縮小する権限を提供しません。

保護された廃止判断は[Server #519](https://github.com/durable-workflow/server/issues/519)、別途のスクレイプ／ゼロスケール機能は[Server #534](https://github.com/durable-workflow/server/issues/534)で追跡します。このチェックリストで提供される機能ではなく、組み込みのKEDA/HPAトリガーもここでは規定しません。

## バージョンなしからの初回切り替え {#first-cutover-unversioned-to-versioned}

1. 安定したビルドIDで新ワーカーを起動し、名前空間、キュー、対応型、最新heartbeatを確認します。
2. 両コホートと元の実行を確認します。新しい名前や登録数で互換性を判断しないでください。
3. 新規開始で選ぶ時点で、新ビルドを明示的に昇格します。

   ```bash
   dw task-queue:promote orders-critical --namespace orders-prod --build-id orders-v2
   ```

4. 既存履歴に対応するワーカーを維持します。昇格は旧ピンを変えず、ドレインも移行ではありません。
5. 残存依存関係を独立に解消してから旧処理能力を廃止します。タスク0件や登録0件だけでは不十分です。必要な実行がある限り、成果物と復旧経路を維持してください。

## 新ビルドのカナリア運用 {#canary-a-new-build}

サーバーはビルド間の割合ランプを提供しません。新規開始には、ドレインもロールバックもされていない直近の昇格コホートを選びます。なければ、要求された型を宣言する唯一のアクティブコホート、次にキュー内の唯一のアクティブコホートを選びます。決まらなければ実行は未固定です。同じ型を扱う複数のアクティブコホートがあっても、昇格なしで重み付き配分にはなりません。

増員は容量を変えるだけで、昇格による新規選択方針は変えません。カナリアを分離するには別キューを使い、アプリケーションから対象の新規開始を明示的に送ります。元キューで昇格するときも、旧ピンの実行用に旧ワーカーを残してください。

## 旧ビルドをドレインする {#drain-an-older-build}

ドレインは対象コホートのworkflow、activity、queryのpollによる新規取得を止めますが、仕事を別ビルドへ移しません。ドレイン中のワーカーのpollは、`poll_status: "draining"`と`reason: "worker_draining"`を含むHTTP409を返します。既存リースの元の権限は維持されます。

```bash
dw task-queue:drain orders-critical --namespace orders-prod --build-id orders-v1
```

新ビルドが自分の仕事を取得できるだけで実行しないでください。旧実行が待ち続けることがあります。早すぎるドレインからは、コホートを再開し元のビルドのワーカーを戻します。

```bash
dw task-queue:resume orders-critical --namespace orders-prod --build-id orders-v1
```

全ワーカーのドレインや停止は、ビルド成果物を削除できる証拠ではありません。このスナップショットには保護された廃止判断はありません。

## 不良ビルドをロールバックする {#roll-back-a-bad-build}

既知の正常ワーカーを復旧し、必要ならコホートを再開して、将来の新規開始用に昇格します。その後、不良デプロイをロールバックします。ロールバックは既存ピンを書き換えず、残りの仕事を他ビルドへ渡しません。互換ワーカーを残すか、アプリケーションとして明示的に復旧方針を決めてください。

再試行、子、continue-as-newは元のピンを継承します。無期限に続くチェーンは新たに昇格したビルドへ移行しません。リプレイ互換の更新では識別子を安定させるか、旧チェーンを終了して新方針で本当に新しいインスタンスを開始します。保存済み互換性フィールドの編集で移行を強制しないでください。

## エンドポイントとコマンド一覧 {#endpoints-and-commands-reference}

| 目的 | HTTPエンドポイント | CLI | Python SDKメソッド |
| --- | --- | --- | --- |
| コホート確認 | `GET /api/task-queues/{taskQueue}/build-ids` | `dw task-queue:build-ids` | `Client.list_task_queue_build_ids` |
| 新規開始用の昇格 | `POST /api/task-queues/{taskQueue}/build-ids/promote` | `dw task-queue:promote` | `Client.promote_task_queue_build_id` |
| ドレイン | `POST /api/task-queues/{taskQueue}/build-ids/drain` | `dw task-queue:drain` | `Client.drain_task_queue_build_id` |
| 再開 | `POST /api/task-queues/{taskQueue}/build-ids/resume` | `dw task-queue:resume` | `Client.resume_task_queue_build_id` |

変更要求は`{"build_id":"orders-v2"}`、またはバージョンなしコホート用の`{"build_id":null}`を受け取ります。CLIでは`--build-id`と`--unversioned`のどちらか一方だけを指定します。

完全なライフサイクルには`GET /api/deployments`と`POST /api/deployments/{name}/{promote,drain,resume,rollback}`を使います。返された`orders-prod/orders-critical@orders-v2`のような名前と元の名前空間を使用してください。公開Apache経路では名前の区切りの`/`を保持します。複合名全体を符号化すると、API到達前にApacheのHTML404になる場合があります。拒否は型付き`reason`と`blockages`配列を含むHTTP409です。`expected_resolution`を確認し、拒否を昇格成功として扱わないでください。[Server #521](https://github.com/durable-workflow/server/issues/521)は不完全な現行OpenAPIミラーの課題であり、新実装や凍結スキーマの変更ではありません。

## 関連資料 {#related-references}

- [ワーカーの互換性とルーティング](/docs/polyglot/worker-compatibility-routing)
- [名前空間、認証、ワーカー登録](/docs/polyglot/namespace-auth-workers)
- [タスクキューの受付制御](/docs/polyglot/task-queue-admission)
- [ローリングアップグレード](/docs/rolling-upgrades)
- [Server APIリファレンス](/docs/polyglot/server-api-reference)
- [CLIコマンドリファレンス](/docs/polyglot/cli-reference)
