---
sidebar_position: 13
title: 2.0 への移行
description: 既存の Laravel Workflow v1 アプリケーションを Durable Workflow v2 に更新します。
tags:
  - migration
  - upgrade
  - v2
keywords:
  - Durable Workflow v2 への移行
  - Laravel Workflow の更新
  - v2 スキーマ移行
  - ワークフロー v1 から v2 へ
---

# 2.0 への移行 {#migrating-to-20}

このガイドは、既存 Laravel v1 アプリケーションを v2 へ更新する際の主な変更を扱います。まず [Laravel への導入とランタイム移行ガイド](/docs/laravel-adoption/)で、Laravel がランタイムを所有し続けるか、PHP SDK 経由で Cloud・セルフホスト Server に接続するかを選んでください。その後、このページの詳細な v1 から v2 への組み込みパッケージ手順を使います。

## アップグレード手順 {#upgrade-procedure}

### アップグレード前 {#before-upgrading}

**1. すべての v1 実行ストアを調査する**

v1 実行状態は、必ずしも Workflow データベース内だけに収まりません。行と履歴に加え、Laravel キュージョブが Redis、キュー DB、SQS、他のバックエンドで準備済み、遅延、予約済みになっている場合があります。コード変更前に次をすべて記録します。

- Workflow ストレージ接続と、実際の v1 モデル・テーブル対応
- ワークフロー・アクティビティ個別の上書きを含む、すべてのキュー接続・キュー名
- 同じキューを復元するために必要なバックエンドの DB、キー接頭辞、リージョン、アカウント、他のルーティング設定
- 正確な `APP_KEY` を取得する秘密管理システムの参照と不変のバージョン、および v1 一意ジョブロックに使うキャッシュストア

`APP_KEY` の値、秘密管理の復旧認証情報、DB・キュープロバイダーの認証情報をこの一覧にコピーしないでください。暗号化ジョブとシリアライズされたワークフロー引数には元のキーが必要ですが、復旧マニフェストには秘密管理参照と版だけを置きます。キーを取得できる認証情報は、SQL・キューバックアップとは別にアクセス制御してください。

既定 v1 テーブルは `workflows`、`workflow_logs`、`workflow_signals`、`workflow_timers`、`workflow_exceptions`、`workflow_relationships` です。公開済み `config/workflows.php` は `stored_workflow_model`、`stored_workflow_log_model`、`stored_workflow_signal_model`、`stored_workflow_timer_model`、`stored_workflow_exception_model` を置き換える場合があります。代替モデルは Eloquent `$table` も上書きでき、関係テーブルは別の `workflow_relationships_table` が制御します。既定名だけでなく、設定モデルから解決したテーブルと接続をバックアップします。

**2. ロールバック境界を選び v1 作業を静止させる**

復旧時点を採取する間、新規開始とシグナルを防ぎます。スケジューラーを一時停止し、調査対象キューを消費できる全 Worker を、現在ジョブの境界後に停止します。例:

```bash
# Horizon
php artisan horizon:pause

# Supervisor or systemd (use the names from your deployment)
sudo supervisorctl stop <your-worker-group>:*
sudo systemctl stop laravel-worker
```

Supervisor、systemd、Kubernetes などが即座に代替 Worker を開始する場合、`php artisan queue:restart` 単独では静止になりません。状態取得前に、どの消費側も次のジョブを予約できないことを確認します。

次のいずれかを選び、記録します。

- **v1 をドレイン:** 新規 v1 作業を止め、`php artisan workflow:v1:list`（利用可能な場合）または設定済み stored-workflow テーブルの同等クエリで非終端がなくなるまで Worker を動かします。その後停止し、準備済み・遅延・予約済み v1 ジョブがないことを確認します。終端 v1 ワークフローは SQL だけのロールバックで対応できます。
- **処理中 v1 を保持:** ジョブ境界で Worker を止め、SQL と全永続キューバックエンドのアプリ整合的なスナップショットを取ります。準備済み・遅延・予約済みを含み、SQL と同じ復旧時点でなければなりません。メッセージとリースを安全に復元する手順がバックエンドにない限り、予約済みジョブの完了を待って採取します。
- **処理中の喪失を受容:** 復元可能なキュー時点を採取できない場合、対象 ID を記録し、キュー依存の非終端実行はこのロールバックで復旧不能と明示的に受容します。適格な `pending` 行は後述の Watchdog 経路を実証後、真のシグナル専用待機は保持する入口のテスト後にだけ除外できます。他の SQL 行を復旧可能な作業として示さないでください。

ロールバック後も外部シグナル入口が使える真のシグナル専用待機は、キュージョブがなくても正当です。アクティビティリトライとタイマーはキュー依存です。`workflow_timers` 行や待機中 `workflows` 行は、失われた遅延ジョブを再作成しません。

サポート対象 v1.0.77 は、既定有効の `Workflow\Watchdog` をキュー Worker ループから開始します。`updated_at` が五分以上前でシリアライズ済み `arguments` がある `pending` を見つけ、記録済み接続・キューへ再配送できます。これは限定された pending 専用の起動経路で、キューバックアップの代替ではありません。復元 v1 Worker ループが Watchdog を配送し、Watchdog が適格な古い `pending` 行を再配送し、期待キューで進むことをステージングで観測した場合だけ依存できます。リトライ・タイマージョブを再作成せず、`waiting`・`running` を復旧しません。それらには保持したジョブ、または真のシグナル待機なら有効な外部入口が必要です。

**3. ロールバック復旧セットをバックアップする**

更新前に DB の完全バックアップを作ります。

```bash
# MySQL/MariaDB
mysqldump -u root -p your_database > backup-v1-$(date +%Y%m%d-%H%M%S).sql

# PostgreSQL
pg_dump -U postgres your_database > backup-v1-$(date +%Y%m%d-%H%M%S).sql

# Laravel backup package (if installed)
php artisan backup:run --only-db
```

続いてバックエンドに応じてキュー状態を保持します。

- **DB キュー:** 同じ復旧時点にキューテーブルと接続を含めます。Workflow DB の外にある場合があります。
- **Redis キュー:** 正確な DB・接頭辞と準備済み・遅延・予約済みキーを含む復元可能なスナップショットを使います。同じ DB に必要な一意ジョブロックがある場合、そのキーも保持します。専用 DB・インスタンスを推奨します。共有スナップショットの復元は無関係なアプリデータを巻き戻す恐れがあります。
- **SQS などのマネージドキュー:** 利用可能・遅延・処理中メッセージを整合的に保持できる場合だけ、プロバイダー対応の時点復元を使います。SQS はこの手順に使える任意のキュースナップショットを提供しないため、ドレインするか、残るキュー依存作業を復旧不能と分類します。SQL だけの例外は、実証済み Watchdog 適格 `pending` とテスト済みシグナル専用待機だけです。

SQL、キューバックアップ、秘密でない一覧、復旧タイムスタンプを一緒に保存します。マニフェストに `APP_KEY` の秘密管理参照・版は書けますが、キーや取得認証情報は含めません。秘密管理、DB、キュープロバイダー、バックアップ復旧の認証情報は別にアクセス制御します。別々の時点の SQL とキューの復元は、処理中ロールバックとしてサポートしません。

**4. まずステージングでテストする**

**ステージングでテストせずに本番更新しないでください。** 更新は次を含みます。

- DB スキーマ変更。v2 永続カーネルは新テーブルを追加します。正確な数は `php artisan migrate` の適用結果で、将来の統合マイグレーションでは機能別ファイルがまとめられる可能性があります
- コード更新を要する名前空間変更
- キュー Worker の再起動（短い中断）
- バックエンド機能検証

**ステージングのチェックリスト:**

- [ ] v2 コードをステージングへデプロイ
- [ ] ステージング DB にマイグレーション
- [ ] キュー Worker を再起動
- [ ] `php artisan workflow:v2:doctor --strict` を実行
- [ ] 新しい v2 ワークフローを開始し完了を確認
- [ ] 既存 v1 ワークフローも完了することを確認
- [ ] Waterline に v1 と v2 が表示されることを確認
- [ ] アプリのテストスイートを実行
- [ ] ログにエラーがないことを確認

成功後にだけ本番へ進みます。

### アップグレードの実行 {#upgrade-steps}

**1. Composer 依存を更新する**

```bash
composer require %%artifact.workflowComposerPackage%%
```

保守中パッケージは v1・v2 とも `durable-workflow/workflow` です。このコマンドは現在の公開 v2 成果物の固定指定へ制約を変えます。旧 `laravel-workflow/laravel-workflow` は名称変更前の依存グラフの互換別名だけです。新規要件とロールバックには保守中の名前を使います。現在の固定指定は安定版 2.0 です。互換な 2.x 更新を自動的に許可するなら `durable-workflow/workflow:^2.0` を使います。

**2. DB マイグレーションを実行する**

```bash
php artisan migrate
```

v2 は機能契約を支える永続カーネルテーブルを追加します。現在の機能別マイグレーションは次を作成します。

- コア: `workflow_instances`、`workflow_runs`、`workflow_history_events`、`workflow_tasks`、`workflow_commands`
- アクティビティ: `activity_executions`、`activity_attempts`
- 機能: `workflow_updates`、`workflow_signal_records`、`workflow_run_waits`、`workflow_run_timeline_entries`、`workflow_run_lineage_entries`、`workflow_schedules`、`workflow_schedule_history_events`
- 可観測性: `workflow_run_summaries`、`workflow_failures`、`workflow_links`、`worker_compatibility_heartbeats`
- タイマー: `workflow_run_timers`、`workflow_run_timer_entries`
- 検索・メモ・メッセージ・子: `workflow_search_attributes`、`workflow_memos`、`workflow_messages`、`workflow_child_calls`
- サービスカタログ: `workflow_service_endpoints`、`workflow_services`、`workflow_service_operations`、`workflow_service_calls`

将来の統合でファイル数が減っても永続契約は変わりません。実 DB の確認には、更新後に `php artisan migrate:status` を実行します。

既定 v1 テーブル（`workflows`、`workflow_logs`、`workflow_signals`、`workflow_timers`、`workflow_exceptions`、`workflow_relationships`）は v1 上での完了のため保持します。モデルがテーブル・接続を上書きする場合は、それが v1 の正しい情報源です。

**3. 必要なら設定を更新する**

v2 設定は後方互換です。v1 で公開した `config/workflow.php` も引き続き動作します。新オプションは次です。

- `durable_types`: 言語非依存のワークフロー参照の型別名
- `task_repair_policy`: 停止タスクの扱い
- `backend_capability_check`: 厳格・許容の検証
- `projection_rebuild`: 履歴再構築戦略
- `history_budget`: continue-as-new 向けイベント数制限

適切な既定値があります。必要な場合だけ変更してください。詳細は[設定](/docs/configuration/options/)を参照してください。

**ペイロードの既定コーデックは `avro` になりました。** v1 は PHP 専用の `Workflow\Serializers\Y::class` でした。v2 は言語中立の `avro` で、Python、Go、TypeScript Worker が PHP ランタイムを共有せずにデコードできます。新規 v2 に対応する唯一のコーデックで、新規実行は `payload_codec = "avro"` を持ちます。

公開済み v1 `config/workflows.php` に `'serializer' => Workflow\Serializers\Y::class` がある場合、v2 は移行診断のため読みますが、新規ペイロードは Avro に解決します。更新後に `php artisan workflow:v2:doctor` を実行すると、レガシー設定を v1 ドレイン・インポートの懸念として報告します。

既定を明示的に受け入れるには `serializer` を未設定にするか、固定します。

```php
// config/workflows.php — v2 default (language-neutral, compact binary)
'serializer' => 'avro',
```

レガシーコーデック（`'workflow-serializer-y'`・`'workflow-serializer-base64'`）を保持するのは、Server と PHP 専用 Worker 間で PHP ネイティブ値を共有する v1 実行をドレインする必要がある場合だけです。旧クラス名（`Workflow\Serializers\Y::class` など）は v1 デコード用別名として受け付けます。

**v1 の独自シリアライザークラスは v2 未対応です。** 公開 v2 レジストリは `avro` だけを解決します。旧 `workflow-serializer-y` と `workflow-serializer-base64` のリーダーは内部 v1 インポート・ドレイン経路に限定され、新規 v2 実行や SDK ペイロードには選べません。独自実装がある場合は先に v1 をドレインするか、過去ペイロードを `avro` に再エンコードします。独自クラスは参照しません。doctor は他の `workflows.serializer` 値を移行負債として報告します。新規実行で省略すると `avro` です。

**独自モデルのサブクラスは、パッケージの列・キー契約を維持する場合だけ対応します。** [カスタマイズマトリクス](/docs/configuration/customization-matrix/)の固定対応表が規範です。v2 のインスタンス、実行、タスク、履歴イベント、投影、スケジュール、アクティビティ、失敗、リンク、メッセージ、メモ、検索属性、子呼び出しモデルは、テーブル名、主キー、外部キーを維持する場合にサブクラス化できます。独自テーブル名と独自外部キー列名は契約外です。Waterline は `Workflow\V2\Contracts\OperatorObservabilityRepository` 経由で投影を読むため、スキーマ互換のサブクラスでは Waterline 変更は不要です。

**環境変数:**

新たな必須変数はありません。既存 `QUEUE_CONNECTION`、`CACHE_DRIVER`、`DB_CONNECTION` は動作します。

**4. キュー Worker を再起動する**

v2 コードをロードするために再起動します。

```bash
# If using Laravel queue workers
php artisan queue:restart

# If using Supervisor
sudo supervisorctl restart <your-worker-group>:*

# If using systemd
sudo systemctl restart laravel-worker

# If using Horizon
php artisan horizon:terminate
```

Worker は次の順に動きます。

1. 現在のジョブを完了
2. 正常終了
3. v2 コードをロードして再起動

**v2 ワークフロー処理前に必ず再起動します。** v1 は旧・新 Worker で完了できます（finish-on-v1 互換性）。

### アップグレード後 {#after-upgrading}

**1. バックエンド機能を検証する**

```bash
php artisan workflow:v2:doctor --strict
```

期待する出力:

```
✓ Database driver supports required features
✓ Queue driver supports required features
✓ Cache driver supports locks
✓ All backend capabilities present
```

失敗したチェックがあれば、ドライバー前提を[バックエンド要件](/docs/installation/#requirements)で確認します。

**2. v2 の正常な開始を検証する**

v2 API でテストワークフローを開始します。

```php
use Workflow\V2\WorkflowStub;
use Workflow\V2\StartOptions;

$workflow = WorkflowStub::make(TestWorkflow::class, 'test-upgrade');
$result = $workflow->start(['test' => true], new StartOptions());
$runId = $result->runId();
```

`WorkflowStub::start()` は `StartResult` を返します。DB 行と比較する前に `runId()` で ID を取得します。スカラー文字列として扱うと、オブジェクトと列を黙って比較してしまいます。

次を確認します。

- Waterline に表示される
- `workflow_instances` に一致する `instance_id`（`$workflow->id()`）の行がある
- `workflow_runs` に一致する `run_id`（`$result->runId()`）の行がある
- 想定どおり完了・進行する

**3. 既存 v1 を確認する**

処理中 v1 がある場合:

```bash
php artisan workflow:v1:list
```

進行を確認します。v1 エンジンでエラーなく完了すべきです。

**4. ログを監視する**

Workflow 関連エラーを監視します。

```bash
tail -f storage/logs/laravel.log | grep -i workflow
```

一般的な問題:

- 名前空間: `Workflow\V2\Workflow` でなく `Workflow\Workflow` を使っている
- メソッド: v2 クラスの入口を `handle()` に変えていない
- キュードライバー: キューモードで未対応の `sync` を使っている。poll モード（`workflows.v2.task_dispatch_mode=poll`）では配送にキューを使わず `sync` が可能

**5. Waterline の可観測性を確認する**

Waterline（既定 `/waterline`）を開き、次を確認します。

- v1 が元のデータで表示される
- v2 が完全な実行・履歴・アクティビティ詳細で表示される
- 描画エラーがない

### ロールバック手順 {#rollback-procedure}

ロールバックは復旧セットの操作です。Laravel キュー状態が Redis、SQS、別 DB、外部バックエンドにある場合、Workflow SQL だけの復元では処理中 v1 を戻せません。

本番更新が失敗したら、更新前に選んだ方針と復旧時点にのみ戻します。

**1. アプリ入口、スケジューラー、キュー Worker を静止させる**

更新前と同じ停止手順を使います。復元中にジョブ予約もワークフロー開始・シグナルも起こせないことを確認します。

**2. 復旧セットを検証する**

- SQL のみが対応するのは、保持ジョブに依存する非終端 v1 がない復旧時点だけです。適格な古い `pending` は上記の実証済み v1.0.77 Watchdog、真のシグナル専用待機はテスト済み外部入口を使えます。他状態へ例外を広げないでください。
- 処理中復旧には、リトライ、タイマー、アクティビティ、`waiting`・`running` 用の SQL と復元可能な準備済み・遅延・予約済みキュー状態が同じ時点で必要です。シグナル専用待機は有効な入口、タイマー待機は遅延ジョブを保持します。
- どちらでもなければここで停止します。前進修正、記録実行の手動照合、または事前文書化した復旧不能の受容に基づいて進めます。

**3. DB バックアップを復元する**

```bash
# MySQL/MariaDB
mysql -u root -p your_database < backup-v1-YYYYMMDD-HHMMSS.sql

# PostgreSQL
psql -U postgres -d your_database < backup-v1-YYYYMMDD-HHMMSS.sql
```

他接続にあっても、全独自 v1 モデルテーブルと `workflow_relationships_table` を復元します。

**4. 必要な場合、キューの同じ復旧時点を復元する**

消費側は停止したまま、プロバイダー手順で SQL と一緒に取得した正確な接続、キュー、接頭辞、準備済み・遅延・予約済みジョブを復元します。対象に含む一意ジョブロックも戻します。同名の空キューで代用しないでください。リトライ、タイマー、`waiting`・`running` を起動できません。空でも書き込み可能なキューで足りるのは、v1.0.77 Watchdog の起動・再配送を実証した適格 `pending` だけです。

**5. Composer 依存を戻す**

```bash
composer require durable-workflow/workflow:^1.0 --with-all-dependencies
```

保守中の名前は v1・v2 とも `durable-workflow/workflow` です。`laravel-workflow/laravel-workflow` は古い依存グラフのための別名だけなので、ロールバック要件に使いません。

別管理の復旧認証情報を使い、記録した秘密管理参照・版から正確な `APP_KEY` を取得します。消費側開始前に、ストレージ接続、キュー接続・名前、Redis 接頭辞、独自モデル設定と一緒に戻します。暗号化ジョブとシリアライズしたモデル参照は、復旧時点と同じ設定に依存します。

**6. キュー Worker と入口を再開する**

```bash
# Use the start command for your worker system, for example:
sudo supervisorctl start <your-worker-group>:*
sudo systemctl start laravel-worker
php artisan horizon:continue
```

**7. v1 実行への到達性を検証する**

Waterline で見えることは行の復元を証明するだけで、Worker が再開できる証明ではありません。成功とする前に次を確認します。

- [ ] `composer show durable-workflow/workflow` が意図した v1 を報告し、Worker がロードした。
- [ ] 実際の v1 テーブルと `workflow_relationships_table` が期待接続にある。
- [ ] 全非終端行（既定 `workflows`）の次回起動を、準備済み・遅延・予約済みジョブ、保持タイマージョブ、テスト済み外部シグナル入口に分類した。適格 `pending` は後述の実証済み Watchdog 証拠でもよい。
- [ ] キュープロバイダーで、各リトライ、タイマー、アクティビティ、`waiting`・`running` の起動ジョブが記録接続・キューにあると確認した。SQL タイマー行だけでは不足し、Watchdog は代替ではない。
- [ ] 保持ジョブのない復元 `pending` は、v1.0.77 Worker が Watchdog を投入し、五分の期限後に記録接続・キューへ再投入され、行が進行するのを観測した。エンドツーエンド証拠がなければ Waterline に見えても孤立と扱う。
- [ ] 必要な実行可能ジョブ、または真のシグナル待機の有効な入口を欠く、復元リトライ、タイマー、`waiting`・`running` はない。欠く場合は孤立であり pending 専用 Watchdog 証拠では復旧可能にならない。
- [ ] 復元リトライ・タイマーが復旧時点前のマーカーを越え、制御したシグナル待機が起動ジョブを投入・消費できた。
- [ ] 新しい v1 カナリアが完了し、欠落ジョブ、復号、モデルテーブル、接続、キュールーティングのエラーがない。

既定テーブルでは次が調査の出発点です。独自モデルなら解決したテーブルに置き換えます。

```sql
SELECT id, class, status
FROM workflows
WHERE status NOT IN ('completed', 'failed', 'cancelled');
```

**ロールバックの重要事項:**

- 更新後に開始した v2 は破棄されます（v2 テーブルにしか存在しません）
- SQL のみでは v1 レコードを戻し、外部キューメッセージは戻しません
- 処理中 v1 は、整合した同時点の SQL・永続キュー、または文書化したシグナル専用待機の有効入口がある場合だけ対応します。追加の SQL 専用例外は実証済み Watchdog 適格な古い `pending` だけで、リトライ、タイマー、`waiting`・`running` は含みません
- 過去の復旧時点の再生は外部副作用を繰り返す場合があります。キューのアクティビティを戻す前に冪等性を確認してください
- 更新期間中の v2 を保持する必要があるなら、DB を戻さず問題を前進修正します

## コード変更 {#code-changes}

以下は v1 から v2 API へのコード変更の詳細です。

### 名前空間の変更 {#namespace-change}

全 v2 クラスは `Workflow\V2` 配下です。import を更新します。

```php
// v1
use Workflow\Workflow;
use Workflow\Activity;
use Workflow\WorkflowStub;

// v2
use Workflow\V2\Workflow;
use Workflow\V2\Activity;
use Workflow\V2\WorkflowStub;
```

### 入口メソッド {#entry-method}

v2 ワークフローとアクティビティは `handle()` を入口に使います。v1 `execute()` を変更します。

```php
// v1
class MyWorkflow extends Workflow
{
    public function execute($input)
    {
        $result = yield ActivityStub::make(MyActivity::class, $input);
        return $result;
    }
}

// v2
use function Workflow\V2\activity;

class MyWorkflow extends Workflow
{
    public function handle($input)
    {
        return activity(MyActivity::class, $input);
    }
}
```

v2 の入口に `execute()` を残さないでください。ランタイムが拒否します。

### アクティビティ呼び出し {#activity-calls}

v2 は `ActivityStub::make()` と `yield` を直接呼ぶ関数ヘルパーで置き換えます。

```php
// v1
$result = yield ActivityStub::make(MyActivity::class, $arg1, $arg2);

// v2
use function Workflow\V2\activity;

$result = activity(MyActivity::class, $arg1, $arg2);
```

アクティビティは永続識別情報を持ちます。各予定実行は安定 ID を持つ `activity_executions` 行、各試行は型付き履歴の `activity_attempts` 行を持ちます。

### ワークフローの識別情報 {#workflow-identity}

v2 はインスタンス ID と実行 ID に分離します。

- `id()`: 公開インスタンス ID（continue-as-new をまたいで同じ）
- `runId()`: 現在実行の ID

v1 では同じ概念でした。

### シグナル {#signals}

v2 は `#[SignalMethod]` 属性付き変更メソッドの代わりに名前付きシグナル待機を使います。

```php
// v1
#[SignalMethod]
public function approve()
{
    $this->approved = true;
}

// v2
use function Workflow\V2\await;

$approved = await('approve');
```

`await('name')` はワークフローのブロック待機、`signal()` / `attemptSignal()` は外部入力です。キャンセル・強制終了はシグナルではなく明示的ランタイムコマンドです。

### クエリ {#queries}

プロパティを直接読む代わりに、リプレイ安全なクエリメソッドを使います。

```php
// v1
#[QueryMethod]
public function getStatus(): string
{
    return $this->status;
}

// v2
use function Workflow\V2\query;

// Queries are defined as named, replay-safe accessors
```

### タイマーと副作用 {#timers-and-side-effects}

関数ヘルパーが v1 静的メソッドを置き換えます。

```php
// v1
yield Timer::make(60);
$value = yield SideEffect::make(fn() => random_int(1, 100));

// v2
use function Workflow\V2\timer;
use function Workflow\V2\sideEffect;

timer(60);
$value = sideEffect(fn() => random_int(1, 100));
```

### タイムアウト {#timeouts}

v2 は `StartOptions` でワークフロー単位のタイムアウトを追加します。

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class, 'order-123');

$workflow->start(
    $orderId,
    StartOptions::rejectDuplicate()
        ->withExecutionTimeout(7200)   // 2 hours across all runs
        ->withRunTimeout(3600),        // 1 hour per run
);
```

- **実行全体のタイムアウト**は continue-as-new を含むインスタンス全体を対象とします。
- **個別実行タイムアウト**は一つの実行に適用し、continue-as-new でリセットします。

### DB マイグレーション {#database-migrations}

新しいテーブル・列を追加します。パッケージが自動ロードするため、更新後に次を実行します。

```bash
composer update durable-workflow/workflow
php artisan migrate
```

2.0.0 は整った基本テーブルマイグレーションを含みます。通常は Laravel の自動ロードに任せ、`php artisan migrate` を使います。

以前アプリへマイグレーションを公開した場合は、情報源を一つ選んで最新に保ちます。

- **パッケージ自動ロード:** `database/migrations` から古い公開 Durable Workflow ファイルを除去し、`php artisan migrate` を実行。
- **公開マイグレーション:** 移行前に現在のセットを公開。

  ```bash
  php artisan vendor:publish \
    --provider="Workflow\Providers\WorkflowServiceProvider" \
    --tag=migrations \
    --force

  php artisan migrate
  ```

古い公開ファイルと新しい自動ロードに同時依存しないでください。新 v2 テーブルや修復マイグレーションを欠く場合があります。

独自変更がある場合は、更新ごとに `src/migrations` と比較します。テーブル名、列、索引、nullable・既定値の契約をモデルとスキーマ互換に保ちます。非既定接続へ振る場合は、公開して `$connection` を設定し、その後も新マイグレーションをタイムスタンプ順にすべて取り込みます。

v2 プレリリース利用者では、古い公開マイグレーションが `memo` なしで `workflow_run_summaries` を作っていた場合、`workflow_run_summaries.memo` を冪等に修復します。新規インストールでは基本マイグレーションで作成済みです。

### バックエンド機能チェック {#backend-capability-check}

キュー、DB、キャッシュが要件を満たすか検証します。更新後に doctor を実行します。

```bash
php artisan workflow:v2:doctor --strict
```

### 設定 {#configuration}

新オプションの詳細は[設定](/docs/configuration/options/)を参照してください。

- 永続型別名
- タスク修復ポリシー
- バックエンド機能チェック
- 投影再構築
- 履歴の使用量上限とエクスポートの墨消し

### Waterline {#waterline}

監視 UI は v2 向けに次を更新しました。

- タイムアウト期間・期限を示す実行詳細
- 永続 ID によるアクティビティ試行追跡
- ワークフローステータス表示

### Continue-as-new {#continue-as-new}

v2 の履歴の使用量上限は、イベント数がしきい値を超えると自動で continue-as-new を起動できます。メタデータ（メモ、検索属性、タイムアウト）は遷移間で引き継ぎます。

## 既存ワークフロー {#existing-workflows}

### v1 上で完了させる戦略 {#finish-on-v1-strategy}

**v1 で開始したものは、v1 互換経路で実行を続けます。** 更新後の新規ワークフローは v2 の意味を使います。実行中インスタンスの移行は不要です。

2.0 へ更新すると:

1. **v1 データを保持。** 既定の `workflows`、`workflow_logs`、`workflow_signals`、`workflow_timers`、`workflow_exceptions`、`workflow_relationships` はそのままです。設定モデル・テーブルの上書きは引き続き規範です。
2. **v1 は v1 エンジンで完了。** 処理中は終端まで v1 リプレイエンジンを使います。
3. **v2 は v2 エンジンを使用。** 更新後の開始は v2 スキーマ（`workflow_instances`、`workflow_runs`、`workflow_history_events` など）を使います。
4. **Waterline は両方を表示。** UI に並んで表示します。

finish-on-v1 は Laravel キューにも依存します。終端まで全 v1 接続・キューを維持します。DB 行は履歴・状態を保持しますが、外部バックエンドで失われた準備済み・遅延・予約済みジョブは再構築しません。v1.0.77 Watchdog は適格な古い `pending` を SQL から再配送できますが、リトライ、タイマー、`waiting`・`running` は復旧しません。

### v1 完了の追跡 {#tracking-v1-workflow-completion}

更新後のアクティブな v1 を確認します。

```bash
php artisan workflow:v1:list
```

終端（完了、失敗、キャンセル）でない全 v1 を列挙します。時間経過に伴う完了の追跡に使います。

出力例:

```
+--------------------------------------+---------------------+-----------+------------+
| ID                                   | Class               | Status    | Created    |
+--------------------------------------+---------------------+-----------+------------+
| 01J1234567890ABCDEFGHIJK             | App\OrderWorkflow   | running   | 2 days ago |
| 01J9876543210ZYXWVUTSRQP             | App\InvoiceWorkflow | pending   | 1 day ago  |
+--------------------------------------+---------------------+-----------+------------+
```

#### Waterline の可視性 {#waterline-visibility}

更新後は自動的に両エンジンを表示します。

- **v1:** 元の `StoredWorkflow` データ（クラス、ステータス、ログ、シグナル、例外）
- **v2:** 完全な v2 詳細（実行、履歴、タイマー、アクティビティ、検索属性）

設定は不要です。両テーブル群を読み、統一ビューを提供します。

### v1 テーブルを除去する時点 {#when-to-clean-up-v1-tables}

全 v1 完了後（`workflow:v1:list` がアクティブゼロ）、任意で削除できます。

```sql
DROP TABLE IF EXISTS workflow_relationships;
DROP TABLE IF EXISTS workflow_exceptions;
DROP TABLE IF EXISTS workflow_timers;
DROP TABLE IF EXISTS workflow_signals;
DROP TABLE IF EXISTS workflow_logs;
DROP TABLE IF EXISTS workflows;
```

**重要:** アクティブな v1 が残る間は削除しないでください。リプレイが失敗し、停止したままになります。

### v1 上で完了させる理由 {#why-finish-on-v1}

更新時のデータ移行を強制しないためです。ストレージモデルは根本的に異なります。

- **v1:** 非正規化の `workflows` 行と関連ログ、シグナル、タイマーに状態を保存
- **v2:** 投影（`workflow_instances`、`workflow_runs`、`workflow_history_events`）を持つイベントソーシング履歴に保存

処理中 v1 を v2 履歴へ変換するには v1 ログからイベント列を復元する必要があり、データ喪失やリプレイ不整合の危険があります。v1 は元のエンジンで安全に完了し、新規作業はすぐ v2 へ移せます。
