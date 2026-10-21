---
sidebar_position: 15
title: ローリングアップグレード
description: ライブトラフィックを停止せずに、Durable Workflow Server の API ノード、Worker、スケジューラーをセルフサービスで順次アップグレードします。
tags:
  - operations
  - upgrades
  - rollouts
  - rollback
keywords:
  - ローリングアップグレード
  - 順次更新の安全性
  - Worker のドレイン
  - スキーマのフェンシング
  - 準備状態の契約
  - ロールバック手順
---

# ローリングアップグレード {#rolling-upgrades}

## ビルド変更前のリプレイ {#replay-before-changing-builds}

候補を昇格する前に、代表的な実行中および最近終了した履歴を、その候補の正確なアプリケーションコードでリプレイします。ロールバック前には、新しいビルドが書き込んだ履歴を古いアーティファクトでリプレイしてください。[リプレイの判定](./testing.md#replay-before-deployment)に従います。ルーティング先の互換コホートや整合性確認の成功だけでは、リプレイ互換性を証明できません。

デプロイをオフラインにせず、API ノード、Worker、スケジューラーを置き換えるには、ローリングアップグレードを行います。この契約は[セルフホストのデプロイ](/docs/deployment)ガイドの小規模クラスター構成を対象とします。ロードバランサー配下の 2～3 個の API ノード、共有の外部 MySQL または PostgreSQL、共有 Redis、独立してスケールする Worker、厳密に一つのスケジューラーまたはメンテナンスランナーです。

このページのすべての保証条件が成立する場合に対応します。範囲外では、デプロイガイドにある全停止の手順を使用してください。

契約の基礎となるロール用語と構成マニフェストは、[Server のロールトポロジー](/docs/polyglot/server-role-topology)に記載しています。このガイドは、現在の `standalone_server` のプロセス分類をその場で順次更新する方法を説明します。

## ここでいうローリングアップグレード {#what-rolling-upgrade-means-here}

**ローリングアップグレード**は、残りのフリートがトラフィックを処理する間に、各プロセスを停止前にドレインし、一つずつ置き換えます。デプロイ全体の停止時間はゼロとなり、新旧プロセスが共存する重複期間に上限を設けます。

現在の `standalone_server` 構成では、四つのプロセス分類ごとにロールアウト方針を区別します。

- **HTTP/API ノード:** HTTP を処理するステートレスな Server プロセス。現在は `api_ingress`、`control_plane`、`matching`、`history_projection` ロールを持ちます。
- **Worker:** Worker プレーンをポーリングし、`execution_plane` としてアクティビティ・ワークフロータスクを実行する SDK プロセス。
- **スケジューラー / メンテナンスランナー:** `scheduler` として、スケジュール発火、アクティビティタイムアウト、履歴保持を処理する単一プロセス。
- **Bootstrap:** データベースマイグレーションと既定名前空間の初期投入を行う一回限りのプロセス。

API ノードと Worker は独立して更新します。スケジューラーは単一なので、新しいものの開始前に古いものを停止しますが、その間も残りのデプロイはサービスを継続します。

## 共存できるバージョン差のルール {#compatible-version-skew-rules}

重複期間とは、複数の Server イメージ、Workflow パッケージ版、Worker SDK 版が稼働する時間です。この節の全ルールを満たさなければなりません。

### Server イメージと Workflow パッケージ {#server-image-and-workflow-package}

- **隣接バージョンのみ。** 更新中の全 API ノードと他の Server プロセスは、クラスターの以前のパッケージと同じメジャーで、他の全稼働プロセスとの差が一つのマイナー以内の Workflow パッケージを持つ Server イメージを使います。メジャーをまたぐには全停止アップグレードが必要です。
- **前方への追加マイグレーション。** 同一メジャー内の Durable Workflow v2 スキーマ変更はすべて追加的です。新ノードは未移行の列・テーブルを要求してはいけません。旧ノードは読まない新列が存在しても壊れてはいけません。後述の[移行順序ルール](#schemabootstrap-ordering)がこれを保証します。
- **隣接するコントロールプレーン・Worker プロトコル版。** 各ノードは `GET /api/cluster/info` から `control_plane.version` と `worker_protocol.version` の対応範囲を公開します。新イメージの対応範囲は、稼働する全旧ノードの範囲と重ならなければなりません。事前に検出し、重ならなければ中止します。

### Worker SDK とビルド識別情報 {#worker-sdk-and-build-identity}

- **全 Worker ビルドにタグを付ける。** 更新に参加し得る Worker は、安定した `build_id` で `POST /api/worker/register` に登録しなければなりません。未バージョンの集団（`build_id: null`）は更新前の既定値です。初回切り替えは [Worker ビルド ID ロールアウトガイド](/docs/polyglot/worker-build-id-rollout)を参照してください。
- **元のルーティングを維持し、変更後の定義を検証する。** 実行はビルド固定と `WorkflowStarted` に記録されたフィンガープリントを保持します。`DW_V2_PIN_TO_RECORDED_FINGERPRINT=true`（既定）の場合、Server 2.9.9 以降は、記録済み定義を持つ適格な Worker を優先します。その Worker が残っていなければ、`workflow_entry_arguments_validation` を持つ置き換え Worker が、元の名前空間、キュー、型、ビルド、リプレイの制約の下で取得できます。SDK は元のエントリ入力を検証し、コミット済みコマンドをリプレイする必要があります。
- **ビルド共存時の受付方針。** 開始前に [`DW_V2_FLEET_VALIDATION_MODE`](/docs/polyglot/server-config-reference) を選びます。`warn` は必須互換性マーカーを持つ稼働 Worker がなくても続行します。`fail` はその間の配送をブロックし、準備状態を安全側に不成立とします。明確な切り替えが必要な本番更新では `fail` を使うべきです。

**公開済みのサポートです。** Server 2.9.9 と PHP SDK 2.5.4、Python SDK 2.6.2、Rust SDK 3.5.6 で、以下のエントリ保護とルーティング・復旧動作が導入されました。これらは機能の最小対応バージョンです。セキュリティ修正を含む最新の安定版をインストールしてください。 古いランタイムは、アプリケーションコードに正しいバージョン分岐を追加しても、変更されたフィンガープリントを拒否し続ける場合があります。フィンガープリント固定の無効化は、既定の安全なアップグレード手順ではありません。[定義ルーティング](./polyglot/worker-compatibility-routing.md#definition-fingerprint-evolution)に従って実際の Worker 能力を確認し、新しい経路の検証が完了するまでロールバック成果物を保持してください。バージョン分岐では、ワークフロー本体が始まる前の入力引数の不整合は修正できません。[エントリ互換性](./features/versioning.md#service-sdk-entry-safeguard)を参照してください。

## スキーマと bootstrap の順序 {#schemabootstrap-ordering}

スキーマ変更は一回の bootstrap で適用します。順序が重要です。

1. **最初に、厳密に一回実行。** 新しい API ノード、Worker、スケジューラーを開始する前に、一つのコンテナから `php artisan server:bootstrap --force`（または公開イメージの同等手順）を実行します。`migrate` と既定名前空間の初期投入を行い、接続先にテーブルが既にある Workflow パッケージマイグレーションを採用します。
2. **新スキーマは旧コードと後方互換。** このリリース経路の v2 マイグレーションは全て追加的（新テーブル、列、索引）です。旧 API ノードと Worker は新スキーマで動き続けます。
3. **完了前に新コードを開始しない。** bootstrap が正常終了してから新 Server イメージを更新します。新 API ノード・Worker は移行済みテーブルに依存し得ます。完了前の開始は、切り替え中の 5xx 急増の最も一般的な原因です。
4. **bootstrap は冪等。** 再実行は安全です。途中失敗なら原因を直して再実行します。マイグレーション台帳が続きから処理し、名前空間の初期投入は既存行があれば何もしません。

ある Server に先に適用されたマイグレーションが、準備状態インターフェースを壊してはなりません。計画中に非追加変更を見つけたら、そのリリースは全停止で更新し、次回からローリングに戻してください。

## 共存期間のドレインと受付 {#drain-and-admission-during-the-overlap-window}

三つの受付機構が自動的に安全を守ります。

- **起動時受付。** 全 Server プロセスは `BackendCapabilities`、`LongPollCacheValidator`、`WorkflowModeGuard`、準備状態契約をロードします。バックエンド・キャッシュが v2 契約を満たさなければ準備完了になりません。
- **Worker 互換性。** `DW_V2_FLEET_VALIDATION_MODE=fail` で、タスクの接続・キュー範囲に必要な互換性マーカーを通知する稼働 Worker がなければ、matching が配送をブロックし、`worker_compatibility` ヘルスは `warning` から `error` になります。タスクは準備済みで可視のまま保持され、破棄されません。ノードの準備状態は 503 を返し、ロードバランサーがローテーションから外します。
- **ルーティング安全性。** 必須互換性を持つ稼働 Worker がない準備済みタスクは保持され、`compatibility_blocked_runs` バックログメトリクスに数えます。ルーティングの問題が黙ってタスク喪失に変わることはありません。ドレイン後も少なくとも一回の実行保証は有効です。

重複期間を短くするため、新 Worker の稼働に合わせて旧集団をドレインします。[Worker ビルド ID ロールアウト](/docs/polyglot/worker-build-id-rollout)の手順を使います。

```bash
dw task-queue:drain orders-critical --build-id orders-worker-2026-04-21-z9
```

集団の `drain_intent` は `draining` に変わります。そのビルドの Worker は処理中作業を終えますが、新タスクを取得しません。`active_worker_count` と `draining_worker_count` がゼロになってから旧プロセスを停止します。

スケジューラーは長時間稼働タスクキューを持たず、Worker ドレインは不要です。旧コンテナを停止し、未実行なら bootstrap を行い、新コンテナを開始します。間隔は新コンテナの起動時間に制限され、次の tick で永続状態から発火を再開します。

専用 matching ロールの導入も行うなら、全実行ノードが引き続き広範囲の準備済みタスクを走査すると仮定せず、トポロジー変更を明示します。[タスクマッチングと配送](/docs/polyglot/task-matching-dispatch)の `workflow:v2:repair-pass --loop` と `DW_V2_MATCHING_ROLE_QUEUE_WAKE=0` 構成を参照してください。`GET /api/cluster/info` で実ノード契約を検証します。`topology.current_shape` は切り替える構成、`topology.current_roles` は文書化されたノードのロール群と一致し、`topology.matching_role.queue_wake_enabled`、`topology.matching_role.shape`、`topology.matching_role.wake_owner` は期待する広範囲の準備済みタスク担当を示すべきです。既定は `queue_wake_enabled: true`、`shape: "in_worker"`、`wake_owner: "worker_loop"`、専用化後の実行ノードは `queue_wake_enabled: false`、`shape: "dedicated"`、`wake_owner: "dedicated_repair_pass"` です。

## 準備状態と切り替え {#readiness-and-cutover}

ノードへのトラフィック開始は、生存確認だけでなく準備状態契約で判断します。

- `GET /api/health`: HTTP を提供することを証明。
- `GET /api/ready`: マイグレーション、既定名前空間、`DW_V2_FLEET_VALIDATION_MODE=fail` 時の Worker 互換性受付を含む、設定済みランタイム依存を利用できることを証明。
- `GET /api/cluster/info`: 認証済みクライアントが、ビルド識別情報、両プロトコル、ペイロードコーデック、Server 機能を検出できることを証明。
- `POST /api/worker/register`: 期待する名前空間・タスクキューへ Worker が認証できることを証明。

API ノード一つの切り替え手順:

1. ロードバランサーのローテーションから外します。最も簡単な方法は、新コンテナを起動する前に新イメージの起動前フックを止め、準備状態プローブを不成立にすることです。
2. 処理中の HTTP リクエストをドレインします。多くのクライアントは接続リセット時に再試行し、Worker のロングポーリングなど長い接続は残りのフリートへ再接続します。
3. 旧コンテナを停止し、新コンテナを開始します。
4. `GET /api/ready` の 200 と、`GET /api/cluster/info` の新ビルド識別情報を待ちます。matching トポロジーも変更するなら、`topology.matching_role.task_dispatch_mode`、`topology.matching_role.queue_wake_enabled`、`topology.matching_role.shape`、`topology.matching_role.wake_owner`、`topology.matching_role.partition_primitives`、`topology.matching_role.backpressure_model` が意図どおりか確認してから戻します。同じノード固有の契約を、応答プロセスのライブなバックログ・修復・Worker カウンターとともに得るには `/api/system/operator-metrics` を使います。
5. ノードをローテーションに戻します。

一つずつ繰り返します。前のノードが正常にトラフィックを処理してから次を更新してください。

Worker は集団単位で切り替えます。

1. 新しい `build_id` で新集団を開始。
2. `dw task-queue:build-ids <queue> --json` で、両集団が `rollout_status: "active"` とゼロでない `active_worker_count` を報告することを確認。
3. `dw task-queue:drain` で旧集団をドレイン。
4. 旧集団の `active_worker_count` と `draining_worker_count` がゼロになるのを待機。
5. 旧プロセスを停止。

## ロールバック {#rollback}

各手順は元に戻せます。開始前にロールバックを計画してください。

- **bootstrap のロールバック。** v2 マイグレーションは通常の Laravel `down()` で戻せます。新イメージが依存するマイグレーションを戻すには、先に全新ノードを停止します。そうしなければ新コードから列が欠落し、準備状態は 503 を返します。変更は追加的なので、多くのロールバックでは逆マイグレーションは不要です。
- **API ノード。** 新コンテナを止め、同じノードで旧コンテナを再開します。起動中はローテーションから外し、`GET /api/ready` が正常になれば戻します。他の更新済みノードも繰り返します。追加的変更なので旧コードは新スキーマを正常に読めます。
- **Worker。** 以前ドレインした集団を再開し、不良集団をドレインし、既知の正常ビルドを増やします。

  ```bash
  dw task-queue:resume orders-critical --build-id orders-worker-2026-04-21-z9
  dw task-queue:drain  orders-critical --build-id orders-worker-2026-04-22
  ```

  再開は `drain_intent` と `drained_at` を消し、再開した `build_id` でハートビートする Worker は次のポーリングで `active` に戻ります。両操作は冪等です。

非追加のスキーマ問題が表面化したら、全停止時間を設けてロールバックし、修正マイグレーションを実行して再計画します。

## 運用者による検証 {#operator-verification}

各段階はログではなく運用インターフェースから検証します。

| 問い | インターフェース |
| --- | --- |
| bootstrap は完了したか | `php artisan server:bootstrap --force` 終了コード 0、`migrate:status` で全件実行済み。 |
| 新ノードは準備済みか | `GET /api/ready` が 200、`GET /api/cluster/info` が新ビルドを報告。 |
| 互換性受付は正常か | `GET /api/system/operator-metrics` の `workers.fleet`、`workers.active_workers`、`workers.active_workers_supporting_required` が、全必須マーカーにゼロでない対応 Worker 数を示す。 |
| ドレインは進んでいるか | `dw task-queue:build-ids <queue> --json` の旧集団の `active_worker_count`・`draining_worker_count` が減る。 |
| ルーティングは安全か | `backlog.compatibility_blocked_runs` と `backlog.max_compatibility_blocked_age_ms` がゼロ付近で、`worker_compatibility` が `error` ではない。 |
| スケジューラーは追い付いたか | 運用メトリクスの `schedules.missed` がゼロ、`schedules.oldest_overdue_at` が null。 |
| 停止した実行が積み上がっていないか | 運用メトリクスの `runs.repair_needed` と `runs.max_repair_needed_age_ms` が更新前の基準付近。 |

`dw system:operator-metrics --json` は、同じスタンドアロン Server フリートのスナップショットをコンソールに公開します。既存の運用に合う方を選べます。別途デプロイした Waterline サービスは、PHP SDK を通じて `/waterline/api/v2/health` と `/waterline/api/stats` から同じ Server 所有の更新状態を読めます。エンドポイント、名前空間、Server トークンを更新対象フリートに合わせます。組み込み Laravel はプロセス内パッケージからこれらのルートを公開します。どちらでも Server API と CLI は利用可能です。[運用者の運用範囲](/docs/operator-operating-envelope)を参照してください。

## 失敗モードと対応 {#failure-modes-and-what-to-do}

| 症状 | 考えられる原因 | 操作 |
| --- | --- | --- |
| 起動後に新 API ノードの `GET /api/ready` が失敗 | bootstrap 未完了、または `DW_V2_FLEET_VALIDATION_MODE=fail` で互換 Worker 不在 | bootstrap を再実行し、互換集団を開始してからノードを戻す。 |
| 更新途中で `worker_compatibility` が `error` | 必須マーカーを持つ稼働 Worker 不在 | 対応 `build_id` の Worker を増やす。戻すべきなら旧集団を再開。 |
| `backlog.compatibility_blocked_runs` と `max_compatibility_blocked_age_ms` が増える | 稼働 Worker が対応しないマーカー向けのタスクが待機 | 同上。タスクは保持され、互換 Worker がハートビートすると自動的に再配送される。 |
| `dw task-queue:drain` 成功後も新タスクを取得 | ドレイン後にまだハートビートしていない | 一周期待つ。まだアクティブなら Worker を再起動し、ドレイン意図を取得させる。 |
| スケジューラー再起動後に発火停止 | 新旧両方が停止している | 新コンテナを開始し、次の運用メトリクスで `schedules.missed` がゼロに戻ることを確認。 |

一覧にない症状では、更新を失敗と扱います。新プロセス追加を止め、新しく開始した集団をドレインし、旧ビルドを復旧してから調査してください。

## 関連リファレンス {#related-references}

- [セルフホストのデプロイ](/docs/deployment): この契約が前提とする構成。
- [Worker ビルド ID ロールアウト](/docs/polyglot/worker-build-id-rollout): 集団単位のドレイン・再開。
- [運用者の運用範囲](/docs/operator-operating-envelope): 更新の信号と併読する診断、キュー、再構築契約。
- [Server 設定リファレンス](/docs/polyglot/server-config-reference): 安全性の環境変数 `DW_V2_FLEET_VALIDATION_MODE`、`DW_V2_PIN_TO_RECORDED_FINGERPRINT`、`DW_V2_GUARDRAILS_BOOT`、`DW_V2_CACHE_VALIDATION_MODE`、`DW_V2_MULTI_NODE`、`DW_V2_VALIDATE_CACHE_BACKEND`、`DW_V2_TASK_REPAIR_*`。
- [Server API リファレンス](/docs/polyglot/server-api-reference): 各段階を検証する準備状態、クラスター情報、運用メトリクスエンドポイント。
