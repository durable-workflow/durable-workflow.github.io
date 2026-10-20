---
sidebar_position: 20
---

# スケジュール {#schedules}

cron 式でワークフローを定期的に開始できます。各スケジュールは名前付きの永続エンティティで、エンジンが tick ごとに評価して新しい実行を起動するか決めます。

## スケジュールの作成 {#creating-a-schedule}

`ScheduleManager::create()` で定義します。

```php
use Workflow\V2\Enums\ScheduleOverlapPolicy;
use Workflow\V2\Support\ScheduleManager;

$schedule = ScheduleManager::create(
    scheduleId: 'daily-invoice-sync',
    workflowClass: InvoiceSyncWorkflow::class,
    cronExpression: '0 2 * * *',
    arguments: ['nightly'],
    timezone: 'America/New_York',
    overlapPolicy: ScheduleOverlapPolicy::Skip,
    labels: ['team' => 'billing'],
    memo: ['origin' => 'scheduled'],
    searchAttributes: ['tenant_id' => '42'],
    notes: 'Runs every night at 2 AM ET.',
    executionTimeoutSeconds: 120,
    runTimeoutSeconds: 60,
);
```

`scheduleId` はユーザーが選ぶ一意な識別子です。各起動実行はスケジュール ID と起動時刻から導く決定的なインスタンス ID を持ちます。

### パラメーター {#parameters}

| パラメーター | 型 | 既定値 | 説明 |
|---|---|---|---|
| `scheduleId` | `string` | 必須 | スケジュールの一意識別子 |
| `workflowClass` | `string` | 必須 | 起動するクラス |
| `cronExpression` | `string` | 必須 | 標準の5フィールド cron 式 |
| `arguments` | `array` | `[]` | `handle()` に渡す引数 |
| `timezone` | `string` | `'UTC'` | cron 評価のタイムゾーン |
| `overlapPolicy` | `ScheduleOverlapPolicy` | `Skip` | 前回実行がアクティブな場合の動作 |
| `labels` | `array` | `[]` | 各実行の可視化ラベル |
| `memo` | `array` | `[]` | 各実行のメモ |
| `searchAttributes` | `array` | `[]` | 各実行の検索属性 |
| `jitterSeconds` | `int` | `0` | 各発火時刻に加える最大ランダム遅延秒数（集中負荷の軽減） |
| `maxRuns` | `int\|null` | `null` | 自動削除までの最大実行数 |
| `connection` | `string\|null` | `null` | 起動先キュー接続（クラスの既定値を上書き） |
| `queue` | `string\|null` | `null` | 起動先キュー名（クラスの既定値を上書き） |
| `notes` | `string\|null` | `null` | 自由記述の運用メモ |
| `namespace` | `string\|null` | `null` | 名前空間（省略時は `workflows.v2.namespace`、または `'default'`） |
| `executionTimeoutSeconds` | `int\|null` | `null` | リトライ・continue-as-new をまたぐ論理実行の制限秒数 |
| `runTimeoutSeconds` | `int\|null` | `null` | 個々の実行の制限秒数。continue-as-new でリセット |

### ワークフローのタイムアウト {#workflow-timeouts}

実行全体のタイムアウトはリトライと continue-as-new をまたぐ1つの論理実行を対象にします。個別の実行タイムアウトは continue-as-new でリセットしますが、全体の残り時間を超えられません。各予定回は別の全体制限時間を持ち、予定時刻ではなく実際の開始から測ります。

どちらも正の整数秒または `null` です。省略・null は未設定です。手動起動、自動 tick、バッファーからの起動、バックフィルも、既定の PHP 起動処理で保存済み上限を適用します。

`createFromSpec()` では action に上限を設定します。

```php
$schedule = ScheduleManager::createFromSpec(
    scheduleId: 'hourly-invoice-sync',
    spec: ['intervals' => [['every' => 'PT1H']]],
    action: [
        'workflow_class' => InvoiceSyncWorkflow::class,
        'input' => ['hourly'],
        'execution_timeout_seconds' => 120,
        'run_timeout_seconds' => 60,
    ],
);
```

作成と action 更新は、直接開始と同じ `StartOptions` の規則で PHP のタイムアウトを検証します。独自の起動処理は不要です。

今後の起動の上限は action の更新で変えます。

```php
$schedule = ScheduleManager::update($schedule, action: [
    ...$schedule->action,
    'execution_timeout_seconds' => 240,
    'run_timeout_seconds' => 90,
]);
```

action は置換されるので、例のようにクラスと入力を保ってください。開始済み実行の期限は変わりません。フィールドを `null` にすると以後の起動から上限を除けます。

## 高度なスケジューリング {#advanced-scheduling}

基本の cron では不足する場合の、固定間隔、cron と間隔の混在、重複ポリシーを説明します。必要な場合だけ参照してください。

### 間隔ベースのスケジュール {#interval-based-schedules}

cron のほか、ISO 8601 期間形式による間隔発火をサポートします。仕様を完全に制御するには `ScheduleManager::createFromSpec()` を使います。

```php
use Workflow\V2\Support\ScheduleManager;

$schedule = ScheduleManager::createFromSpec(
    scheduleId: 'health-check-30m',
    spec: [
        'intervals' => [
            ['every' => 'PT30M'],
        ],
    ],
    action: [
        'workflow_type' => 'health-check',
        'workflow_class' => HealthCheckWorkflow::class,
        'input' => ['region' => 'us-east-1'],
    ],
);
```

### 間隔仕様のフィールド {#interval-spec-fields}

| フィールド | 型 | 説明 |
|---|---|---|
| `every` | `string` | ISO 8601 期間（30分は `PT30M`、1時間は `PT1H`、1日は `P1D`） |
| `offset` | `string\|null` | 間隔の基準点をずらす ISO 8601 期間の位相オフセット |

offset は周期内の発火位置を制御します。たとえば1時間間隔に5分を指定すると `:05`、`:05+1h` などに発火します。

```php
$schedule = ScheduleManager::createFromSpec(
    scheduleId: 'offset-hourly',
    spec: [
        'intervals' => [
            ['every' => 'PT1H', 'offset' => 'PT5M'],
        ],
    ],
    action: [
        'workflow_type' => 'sync-workflow',
        'workflow_class' => SyncWorkflow::class,
        'input' => [],
    ],
);
```

### cron と間隔の混在 {#mixed-cron-and-interval-specs}

1つに両方を組み合わせられます。全仕様を評価し、最も早い次回時刻を使います。

```php
$schedule = ScheduleManager::createFromSpec(
    scheduleId: 'mixed-schedule',
    spec: [
        'cron_expressions' => ['0 12 * * *'],  // noon daily
        'intervals' => [['every' => 'PT6H']],  // every 6 hours
        'timezone' => 'America/Chicago',
    ],
    action: [
        'workflow_type' => 'report-workflow',
        'workflow_class' => ReportWorkflow::class,
        'input' => [],
    ],
);
```

`createFromSpec` は `create()` と同じライフサイクル引数（`overlapPolicy`、`jitterSeconds`、`maxRuns`、`connection`、`queue`、`namespace` など）を別々の名前付き引数で受け取ります。

## 重複実行ポリシー {#overlap-policies}

前回の実行がアクティブな場合の動作を制御します。

| ポリシー | 動作 |
|---|---|
| `Skip` | 新規実行を開始しない（既定）。 |
| `BufferOne` | 1つだけ保留し、処理されるまで以後をスキップ。アクティブ実行完了後の次の `tick()` で自動起動。 |
| `BufferAll` | 上限なく全起動を保留し、先行実行が完了するたび順番に処理。 |
| `AllowAll` | 先行状態を問わず開始。 |
| `CancelOther` | 先行実行をキャンセルして開始。 |
| `TerminateOther` | 先行実行を強制終了して開始。 |

## スケジュールの管理 {#managing-schedules}

### 一時停止と再開 {#pause-and-resume}

```php
ScheduleManager::pause($schedule);

// The schedule will not trigger while paused.

ScheduleManager::resume($schedule);
// next_fire_at is recalculated from now.
```

### 更新 {#update}

```php
ScheduleManager::update(
    $schedule,
    cronExpression: '30 3 * * *',
    timezone: 'America/Chicago',
    overlapPolicy: ScheduleOverlapPolicy::AllowAll,
    notes: 'Moved to 3:30 AM CT.',
);
```

cron やタイムゾーンの更新は `next_fire_at` を再計算します。

### 削除 {#delete}

```php
ScheduleManager::delete($schedule);
```

論理削除のため行は `deleted` と `deleted_at` を持って残ります。削除後は停止、再開、更新、起動できません。

### 詳細取得 {#describe}

```php
$description = ScheduleManager::describe($schedule);

$description->scheduleId;      // 'daily-invoice-sync'
$description->namespace;       // 'default'
$description->status;          // ScheduleStatus::Active
$description->spec;            // ['cron_expressions' => ['0 2 * * *'], 'timezone' => 'America/New_York']
$description->overlapPolicy;   // ScheduleOverlapPolicy::Skip
$description->firesCount;      // 47
$description->nextFireAt;      // DateTimeInterface|null
$description->lastFiredAt;     // DateTimeInterface|null
$description->latestInstanceId; // 'schedule:daily-invoice-sync:...'
$description->jitterSeconds;   // 0
$description->note;            // 'Runs every night at 2 AM ET.'
$description->toArray();       // full array representation
```

### スケジュール ID による検索 {#find-by-schedule-id}

```php
$schedule = ScheduleManager::findByScheduleId('daily-invoice-sync');
```

## スケジュールの起動 {#triggering-schedules}

### 手動起動 {#manual-trigger}

```php
$instanceId = ScheduleManager::trigger($schedule);
```

直ちにポリシーを評価し、許可されれば開始します。開始したインスタンス ID、スキップなら `null` を返します。

### Tick（期限到来済みをすべて評価） {#tick-evaluate-all-due-schedules}

```php
$results = ScheduleManager::tick();

// Returns rows with schedule_id, instance_id, outcome, occurrence_time,
// last_fired_at, and next_fire_at when those fields apply.
```

`tick()` は `next_fire_at` が過去のアクティブな予定を順番に起動します。`occurrence_time` は観測した予定時刻です。その後 `next_fire_at` を現在時刻から次の cron または間隔の発生時点へ進めます。

### 未実行の予定に対する方針 {#missed-fire-policy}

ライブ評価は**1回起動して再開**します。停止中に予定時刻が1回以上過ぎた場合、復旧後最初の tick は遅れた `next_fire_at` に対し1つだけ起動し、`occurrence_time` にその予定を記録して、現在時刻から次回を計算します。停止中に過ぎた他の予定はライブ評価ではスキップします。

全未実行分が必要なら `backfill()` を使います。指定範囲を明示的に列挙し、各回を別々に記録します。

### Artisan コマンド {#artisan-command}

コマンドラインから1回評価します。

```bash
php artisan workflow:v2:schedule-tick
php artisan workflow:v2:schedule-tick --json
```

独立 Server にも同じ評価を行う専用コマンドがあります。

```bash
php artisan schedule:evaluate --limit=100
```

継続評価するには Laravel のタスクスケジューラーから呼びます。

```php
// app/Console/Kernel.php
$schedule->command('workflow:v2:schedule-tick')->everyMinute();
```

## 最大実行数 {#max-runs}

`maxRuns` を設定すると `remaining_actions` を追跡し、最後の許可された起動後に自動で論理削除します。

```php
$schedule = ScheduleManager::create(
    scheduleId: 'one-shot-retry',
    workflowClass: RetryWorkflow::class,
    cronExpression: '*/5 * * * *',
    maxRuns: 3,
);

// After 3 triggers, the schedule status becomes 'deleted'.
```

## バックフィル {#backfill}

停止、デプロイ障害、遅い作成などで逃した過去の cron 予定を起動します。

```php
$results = ScheduleManager::backfill(
    $schedule,
    from: new DateTimeImmutable('2026-04-10 00:00:00'),
    to: new DateTimeImmutable('2026-04-14 00:00:00'),
);

// Returns: [['schedule_id' => '...', 'instance_id' => '...|null', 'cron_time' => '...'], ...]
```

各回を順に起動し、ポリシーも適用します。ただし **`BufferOne` と `BufferAll` はバックフィル中 `AllowAll` として扱います**。バッファーはリアルタイムの流量制御で、処理されないバッファーへ溜めるのでなく全回を開始すべき追いつき処理には意味がありません。明示的にも上書きできます。

```php
$results = ScheduleManager::backfill(
    $schedule,
    from: new DateTimeImmutable('2026-04-10 00:00:00'),
    to: new DateTimeImmutable('2026-04-14 00:00:00'),
    overlapPolicyOverride: ScheduleOverlapPolicy::AllowAll,
);
```

`maxRuns` を守り、途中で残回数を使い切れば停止して自動削除します。

ID は決定的な `schedule:{scheduleId}:backfill:{timestamp}` です。

## キュールーティング {#queue-routing}

スケジュールに `connection`、`queue` があればクラスの既定値を上書きします。

```php
$schedule = ScheduleManager::create(
    scheduleId: 'priority-sync',
    workflowClass: InvoiceSyncWorkflow::class,
    cronExpression: '0 * * * *',
    connection: 'redis',
    queue: 'high-priority',
);

// Every triggered run dispatches to redis/high-priority,
// regardless of InvoiceSyncWorkflow's default routing.
```

優先順はスケジュールのフィールド → クラスの既定値 → 全体のキュー設定です。

## ジッター {#jitter}

同じ cron の予定は同時に発火し負荷が集中します。`jitterSeconds` はランダムな時間窓に分散します。

```php
$schedule = ScheduleManager::create(
    scheduleId: 'hourly-report',
    workflowClass: ReportWorkflow::class,
    cronExpression: '0 * * * *',
    jitterSeconds: 300, // fire within 0–300 seconds after the top of the hour
);
```

各 `next_fire_at` に0〜`jitterSeconds`（両端を含む）の乱数を足します。起動、再開、更新など次回を計算するたびに選び直します。

ジッターはデータベースの tick 評価時刻だけに適用します。バックフィルは常に正規の cron 時刻を列挙し、正確な境界に置きます。

`0`（既定）ならジッターなしで、正確な cron 時刻です。

## 履歴イベントの種類 {#history-event-types}

ライフサイクルは別々の2つのストリームに記録します。

- **実行の系譜**: 起動した実行の `workflow_history_events` に `ScheduleTriggered` を追加し、開始元への検証可能なリンクを作ります。
- **スケジュール監査**: 各遷移を `workflow_schedule_history_events` に、スケジュールごとに単調増加する `sequence` で記録します。「この予定に何が起きたか」の正は監査ストリーム、「なぜこの実行が開始したか」の正は実行履歴です。

両者は同じ `HistoryEventType` 列挙と `HistoryEventPayloadContract` のキー登録を使い、名前と構造を同期します。

### 実行系譜イベント（開始した実行上） {#run-lineage-event-on-the-started-workflow-run}

`ScheduleTriggered` は次のキーで実行履歴に追加されます。

- `schedule_id`: ユーザー向け識別子。
- `schedule_ulid`: 内部 ULID 主キー。
- `cron_expression`、`timezone`、`overlap_policy`: 起動時の主 cron 式、IANA タイムゾーン、有効ポリシー。
- `trigger_number`: 1から始まる起動番号。
- `occurrence_time`: 評価した予定時刻。tick は期限到来の `next_fire_at`、バックフィルは列挙した時刻です。ジッター有効時の tick は保存されたジッター付き時刻を含みます。

### スケジュール監査ストリーム（予定自体の記録） {#schedule-audit-stream-on-the-schedule-itself}

各遷移を専用ストリームに記録します。`ScheduleCreated` の `1` からスケジュールごとに単調増加します。

| イベント | 記録時点 | ペイロードキー |
| --- | --- | --- |
| `ScheduleCreated` | 作成 | `spec`, `action`, `overlap_policy`, `next_fire_at`, `command_context` |
| `SchedulePaused` | 一時停止 | `reason`, `paused_at`, `command_context` |
| `ScheduleResumed` | 再開 | `next_fire_at`, `command_context` |
| `ScheduleUpdated` | cron、時間帯、仕様、action、ポリシーの変更 | `changed_fields`, `spec`, `action`, `overlap_policy`, `next_fire_at`, `command_context` |
| `ScheduleTriggered` | 実行の開始 | `workflow_instance_id`, `workflow_run_id`, `outcome`, `effective_overlap_policy`, `trigger_number`, `occurrence_time`, `command_context` |
| `ScheduleTriggerSkipped` | 重複方針、起動不可状態、残回数消尽でスキップ | `reason`, `skipped_trigger_count`, `last_skipped_at`, `command_context` |
| `ScheduleDeleted` | 明示削除または `max_runs` 消尽（`reason: max_runs_exhausted`）で論理削除 | `reason`, `deleted_at`, `command_context` |

`CommandContext` を渡すと、`ScheduleManager` が記録した principal、request id、source、reason を `command_context` に含みます。任意なので、未指定なら空値を書かずキーを省略します。

### ペイロード契約の安定性 {#payload-contract-stability}

上の両表のキーは `Workflow\V2\Support\HistoryEventPayloadContract` で宣言し、全書き込みで検証し、パッケージのテストで固定しています。キー追加は通信形式の変更で、[バージョン互換性契約](../compatibility.md)の履歴変更ルールに従います。

### 保持 {#retention}

監査はスケジュール行の存続中保持します。削除は最後の `ScheduleDeleted` を書く論理削除で、スケジュール行を除去しても監査行は連鎖削除しません。過去の予定を消去する運用者は明示的な保持方針を選ぶ必要があります。監査イベント用の組み込み TTL はありません。

### 可視化 {#visibility}

全運用経路で同じ監査を提供します。

- **プロセス内（Eloquent）**: `WorkflowSchedule::historyEvents()` がストリームを返します。`ConfiguredV2Models::query('schedule_history_event_model', ...)` で解決します。
- **Waterline HTTP**: `GET /waterline/api/v2/schedules/{scheduleId}/history` は `limit`（1〜500、既定100）と `after_sequence` カーソルで返します。Waterline の名前空間に限定し、自テナントの行だけを表示します。
- **Waterline UI**: 登録一覧の **History** でモーダルを開き、シーケンス、時刻、種類、関連インスタンス・実行 ID、整形済みペイロードを表示します。**Load more** は100件ずつ進みます。
- **独立 Server HTTP**: `GET /api/schedules/{scheduleId}/history` も同じページングと `X-Namespace` を使います。削除した予定の再構築に必要なため、論理削除後も参照可能です。
- **CLI**: `dw schedule:history <schedule-id>` は `Seq`、`Event`、`Recorded At`、`Workflow Refs` の表と、`has_more` 時の **More events available** を表示します。`--limit` と `--after-sequence` は Server に転送し、`--all` は残りすべてを取得、`--output=json` / `--output=jsonl` は構造化出力です。`jsonl` はカーソル外枠を省き1行1イベントです。
- **Python SDK**: `Client.get_schedule_history(schedule_id, *, limit=None, after_sequence=None)` は `ScheduleHistoryPage`、`Client.iter_schedule_history(schedule_id, *, limit=None, after_sequence=None)` は同じ引数で全ページをたどる `AsyncIterator[ScheduleHistoryEvent]` です。`ScheduleHandle` にも `.history(...)`、`.iter_history(...)` があります。`limit` は Server で1〜500（既定100）に制限され、`after_sequence` は前ページの `next_cursor` から得る非負カーソルです。

すべて同じ `workflow_schedule_history_events` を読みます。[ペイロード契約の安定性](#payload-contract-stability)は利用経路を問いません。

### 監査導入前の予定の移行動作 {#migration-behavior-for-pre-audit-schedules}

監査は `workflow_schedule_history_events` と同時に導入されました。移行前に作成した予定に `ScheduleCreated` を遡及記録しません。`ScheduleManager` は実際の遷移時のみ記録し、移行で既存予定のイベントを合成しません。

運用上の意味:

- 既存予定は次の遷移まで空です。停止、再開、更新、起動、スキップ、削除から通常の記録を始めます。
- シーケンスは1から単調増加します。最初が `SchedulePaused` ならその行が `sequence = 1` で、前の `ScheduleCreated` がなくても正常です。
- tick 評価のたびに `ScheduleTriggered` または `ScheduleTriggerSkipped` を書くため、移行後に稼働する予定は介入なしで監査を蓄積します。
- 有効化作業は不要で常時有効です。移行後最初のイベントまで行がないだけです。

## スキップの追跡 {#skip-tracking}

重複方針、起動不可状態、残回数消尽でスキップすると次を追跡します。

- `last_skip_reason`: 最後の理由（`overlap_policy_skip`、`status_not_triggerable`、`remaining_actions_exhausted` など）。
- `last_skipped_at`: スキップ時刻。
- `skipped_trigger_count`: 累計回数。

`ScheduleManager::describe()` と Waterline の詳細 API に含まれます。

## 名前空間の限定 {#namespace-scoping}

`create()` や `createFromSpec()` の `namespace` に属します。省略時は `workflows.v2.namespace`（既定 `'default'`）を継承します。

ID は名前空間内で一意で、異なる名前空間では同じ `scheduleId` を使えます。

標準 PHP 起動処理は保存済み名前空間をインスタンス、実行、永続タスクに渡します。後でアプリの既定値を変えても既存予定の実行は移りません。この伝播には Workflow 2.4.2 以降を使います。

```php
$schedule = ScheduleManager::create(
    scheduleId: 'daily-sync',
    workflowClass: SyncWorkflow::class,
    cronExpression: '0 2 * * *',
    namespace: 'billing',
);

// Find by schedule ID within a namespace:
$found = ScheduleManager::findByScheduleId('daily-sync', namespace: 'billing');
```

Waterline に `waterline.namespace` があれば一覧・詳細を自動で限定し、運用者の名前空間の予定だけを表示します。

## データベース {#database}

`workflow_schedules` は移行 `2026_04_14_000157` で作成し、モデルは `workflows.v2.schedule_model` で変更できます。

アプリ移行と併用する場合、移行157は既存の `workflow_schedules` を検出します。スキーマが一致すれば維持し、古い補助移行で異なるスキーマが作られていれば置き換えます。
