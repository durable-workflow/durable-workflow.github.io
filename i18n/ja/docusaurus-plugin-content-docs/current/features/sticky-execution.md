---
sidebar_position: 25
title: Sticky 実行
description: 参考情報としてのタスクアフィニティ、Worker 内 Replay キャッシュ、通常のマッチング、コールド Replay 診断を説明します。
tags:
  - sticky-execution
  - replay
  - operations
keywords:
  - Sticky 実行
  - Sticky Replay キャッシュ
  - コールド Replay フォールバック
  - worker_id ルーティング
  - Sticky キャッシュ診断
---

# Sticky 実行 {#sticky-execution}

Sticky 実行は、Durable Workflow v2 で対応している Replay の最適化です。Worker はワークフロータスク完了後、プロセス内にワークフローのキャッシュを保持できます。同じ実行の後続タスクを取得した場合、有効なキャッシュを再利用できます。アフィニティがその Worker のためにタスクを予約することはありません。

Sticky 実行は正しさを保証する機能ではありません。進捗を確定するのは永続履歴だけであり、履歴からの通常のコールド Replay は常に有効です。ワークフローの正しさをプロセス内状態に依存させないでください。

## 契約の概要 {#contract-summary}

Sticky 実行には四つの保証があります。

- Sticky キャッシュを所有するのは Worker プロセスであり、Server やデータベースではありません。
- キャッシュ所有者の識別には、Worker プロトコルの `worker_id` を使用します。
- アフィニティは参考情報で期限があります。キャッシュミス、再起動、ドレイン、ロールアウト、退避時にはコールド Replay が必須です。
- 有効化、TTL、容量、ヒット率、ミス率、強制コールド Replay、容量圧力に対して、運用者向けの設定と診断があります。

永続的なアフィニティのフィールドは、実行とワークフロータスクの `sticky_worker_id` と `sticky_until` です。タスクの診断フィールドは `sticky_replay_mode` と `sticky_claimed_at` です。

## Sticky キャッシュのライフサイクル {#sticky-cache-lifecycle}

Sticky キャッシュは、一つ以上の実行について Replay 済みのワークフロー状態を持つ、Worker 内のデータ構造です。対応 Worker がタスクを完了すると、Server は `sticky_until` までその Worker を所有者として記録できます。後続タスクも作成時にこのアフィニティを引き継ぎます。

キャッシュの内容と退避方針は Worker が管理します。容量到達、ドレイン開始、再起動、ビルド変更、安全でない状態の検出、メモリ解放などにより退避できます。Server はキャッシュ内容を永続状態として扱いません。

Sticky ルーティングのタスクを受け取っても、有効なキャッシュが残っていなければ、Worker は永続履歴からコールド Replay しなければなりません。進捗を確定する権限はタスクリースだけです。

## ルーティングの識別情報 {#routing-identity}

ルーティングの識別子は、Worker プロトコルの `worker_id` です。Sticky キャッシュを有効にして登録し、タスクキュー上の有効な Worker としてハートビートを続けることで参加します。

Sticky アフィニティは、準備済みタスクのマッチングで所有者を優先したり、所有者専用に保持したりしません。PHP runtime は優先度、`available_at`、タスク ID の順で候補を選びます。Server は同一優先度内で公平性キーに従って候補バッチを再配分することもあります。通常の互換性、型、キュー、Namespace、容量、リースの確認は引き続き適用されます。

即使別の稼働中 Worker にアフィニティがあっても、条件を満たす任意のポーリング Worker が `sticky_until` より前に取得できます。所有者に空きスロットがなければ、別の Worker が即座に取得してコールド Replay できます。所有者のキャッシュや期限切れを待ちません。TTL を増やしても、所有者の予約時間は延びません。

`sticky_until` は保存されたアフィニティの有効期間と、所有者の取得を `sticky_hit_expected` と表示できる期間を制限します。タスクの実行可能時刻やリースを変更せず、所有者のキャッシュにその実行が残っている保証もしません。

## フォールバックの意味 {#fallback-semantics}

コールド Replay は必須のフォールバックです。次の場合に行います。

- Sticky 実行が無効
- Worker が Sticky キャッシュ対応を登録していない
- タスクに有効な `sticky_worker_id` と `sticky_until` がない
- 所有者が古い、不在、ドレイン中、再起動済み、入れ替え済み
- 所有者が実行をキャッシュから退避した
- 所有者のアフィニティが有効な間を含め、別の Worker が取得した
- タスク取得前にアフィニティが期限切れになった

Replay モードの診断は次のとおりです。

- `sticky_hit_expected`：所有者が期限前に取得しました。使用前にローカルキャッシュの有効性を検証する必要があります。
- `cold_replay`：Sticky アフィニティは適用されませんでした。
- `forced_cold_replay`：所有者は記録されていましたが、別の Worker が取得したか、期限切れでした。元の所有者が正常な間にも起こります。

`forced_cold_replay` は正しさの失敗ではありません。そのタスクで Sticky 実行による Replay の高速化が得られなかったことを示します。

## デプロイ、ドレイン、ロールアウト {#deployment-drain-and-rollout}

Sticky 実行は Worker のライフサイクルに従います。ドレイン時は新しいタスク取得を止め、既存タスクを通常のリース契約で完了、ハートビート、失敗処理、期限切れさせます。他の互換 Worker は、アフィニティの期限を待たずに準備済みタスクを取得してコールド Replay できます。

置換 Worker はプロセス内キャッシュを引き継ぎません。新 Worker がキャッシュを温めるまで、ロールアウトで `forced_cold_replay` が増える場合があります。プロセスごと・再起動ごとに一意の `worker_id` を使い、古いキャッシュ所有者と新プロセスを診断で区別してください。

タスクを実行できるかは、引き続きビルド ID の互換性とワークフロー定義のフィンガープリントで決まります。Sticky 実行で互換性のないコードにルーティングすることはできません。

## 運用者の設定 {#operator-controls}

Sticky 実行はワークフローと runtime の設定、および Worker 能力で制御し、独立 Server イメージの環境変数では制御しません。Workflow パッケージでは有効フラグと TTL を設定できます。

```php
'workflows' => [
    'v2' => [
        'sticky_execution' => [
            'enabled' => true,
            'ttl_seconds' => 300,
        ],
    ],
],
```

各 Worker は登録とハートビートでキャッシュ容量を通知します。runtime で Sticky ルーティングを無効にしたり、非対応 Worker を使ったりしても、ワークフローの意味は変わりません。既存実行は通常のコールド Replay で継続します。

## Worker プロトコルのフィールド {#worker-protocol-fields}

対応 Worker は登録時に能力を通知します。

```json
{
  "worker_id": "orders-worker-01",
  "task_queue": "orders",
  "runtime": "python",
  "sticky_cache_enabled": true,
  "sticky_cache_capacity": 100
}
```

Worker はハートビートでキャッシュ診断を報告します。

```json
{
  "worker_id": "orders-worker-01",
  "sticky_cache": {
    "enabled": true,
    "capacity": 100,
    "size": 72,
    "hit_count": 940,
    "miss_count": 31,
    "forced_cold_replay_count": 8,
    "eviction_count": 15
  }
}
```

ワークフロータスクのポーリング応答には、`sticky_worker_id`、`sticky_until`、`replay_mode`、`cache_directive` を持つ `task.sticky_execution` が含まれます。`resume_if_present` は、有効な温まったキャッシュの使用許可として扱い、キャッシュがないか無効ならコールド Replay します。

## メトリクスと診断 {#metrics-and-diagnostics}

運用メトリクスには次が含まれます。

- `sticky_execution.active_sticky_runs`
- `sticky_execution.ready_sticky_tasks`
- `sticky_execution.leased_sticky_tasks`
- `sticky_execution.hit_expected_last_minute`
- `sticky_execution.miss_last_minute`
- `sticky_execution.forced_cold_replay_last_minute`
- `sticky_execution.cold_replay_last_minute`
- `sticky_execution.hit_rate_last_minute`
- `sticky_execution.miss_rate_last_minute`
- `sticky_execution.capacity_pressure_tasks`

独立 Server は `sticky_execution_workers` に、Worker キャッシュの容量、サイズ、ヒット数、ミス数、強制コールド Replay 数、退避数、容量圧力のある Worker 数も報告します。

これらの診断は次のように使用します。

- `ready_sticky_tasks` は、記録されたアフィニティが期限切れでない準備済みタスク数です。所有者のために保持されているという意味ではありません。PHP runtime の `capacity_pressure_tasks` も現在は同じ数を報告します。
- 予想ヒット率の低さは、別 Worker の取得、TTL 切れ、Worker 置換、退避などで起こります。TTL や容量を変える前に、取得者 ID と Worker のキャッシュメトリクスを照合します。
- ミスや強制コールド Replay が多くても正しさは守られていますが、Replay コストの削減は得られていません。
- Worker のキャッシュ容量圧力は、通知容量に近い、または超えた Worker を示します。ワークフロー実行スロットの空きや準備済みタスク数とは異なります。

## Replay に安全なコード {#replay-safe-code}

ワークフローコードは Sticky 実行とコールド Replay で同じ動作をする必要があります。判断には永続履歴である入力、アクティビティ結果、タイマー、シグナル、Update、副作用、バージョンマーカーを使います。メモと検索属性のプロジェクションは運用メタデータなので、その可変値で業務ロジックを分岐しないでください。

可変グローバル、ローカルファイル、開いたソケット、オブジェクトの同一性、乱数、壁時計などのプロセス内状態に正しさを依存させないでください。Sticky 実行が偶然保持しても、ミス、再起動、ロールアウト、退避で失われます。

一度記録すべき非決定的な値には [`sideEffect(...)`](/docs/features/side-effects) を、外部への副作用には通常のアクティビティを使用します。Replay と永続履歴の契約は[実行保証と冪等性](/docs/constraints/execution-guarantees)を参照してください。
