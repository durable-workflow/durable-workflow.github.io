---
sidebar_position: 6
---

# ワークフローの削除 {#pruning-workflows}

Workflow v2 には、二つの異なるライフサイクル操作があります。

1. **アーカイブ**：終了済みの実行をアーカイブ済みにし、アクティブな実行群の画面から除外します。行は**削除しません**。
2. **削除**：削除可能な保持済み詳細や孤立したプロジェクションを取り除きます。組み込みの cleanup API は、終了して閉じた実行であることと、保持条件を確認します。保持ポリシーはホストが決め、アーカイブは API の前提条件ではありません。

Server には Namespace 単位の別の保持ポリシーがあり、自動削除はアーカイブ済みの実行を除外します。したがって、Server のアーカイブは自動削除に備える手順ではなく、削除から保護する操作です。

## データベースの保持期間より長く履歴を残す {#keeping-history-beyond-database-retention}

削除を有効にする前に、必要な履歴をどこに残すか決めてください。

| 要件 | 方法 | 保存と削除への影響 |
| --- | --- | --- |
| 最近の履歴を Server に保存 | Namespace の有限保持（1～365 日） | 終了済み実行は保持期限後に削除対象になります。長い記録が必要なら先にエクスポートします。 |
| Namespace の全履歴を Server に保存 | Namespace 保持を `forever` にする | 明示的に有限保持へ戻すまで、履歴をプライマリーデータベースに残します。 |
| 選択した終了済み Server 実行を保存 | 対象実行をアーカイブ | 自動・明示的な Server 保持処理はいずれも除外します。公開 API にアーカイブ解除はないため、一時的なエクスポート用ロックには使わないでください。 |
| 長期間の独立した記録を残す | 全終了実行をエクスポートし、外部ペイロードのオブジェクトも保存 | スケジュール、検証、アクセス制御、最終的な削除はアプリケーションの責任です。常設の自動履歴エクスポーターはありません。 |

`forever` とアーカイブは、安価なストレージへ移すのではなく、データベースの行を保持します。増えていく履歴とペイロード、インデックス、バックアップ、復旧時間を計画してください。削除後も実行とインスタンスの行、およびルートのペイロードフィールドは残り、保存量はゼロになりません。履歴エクスポートは Replay や調査を支援しますが、完全なデータベースバックアップではなく、そのファイルだけで実行を再開できる保証もありません。

### 削除前にエクスポートする {#export-before-pruning}

組み込みアプリケーションの保持ジョブと Server の Namespace に、同じ手順を使います。後述のとおり、選択方法と削除権限は異なります。

以下の例は、公開済み PHP Server **2.9.5**、そこで読み込まれた Workflow **2.6.2**、通常インストールした Python SDK **2.6.1** で確認しました。[公開アーティファクトの検証記録](https://github.com/durable-workflow/durable-workflow.github.io/issues/276#issuecomment-6285271861)は、終了時刻によるページング、実行単位のエクスポート、チェックサムと構造検証、アーカイブ/`forever` の保護、実際の `pruneRun()` による削除を対象としています。アプリケーション全体のリプレイや外部オブジェクトの復元を検証したものではありません。

1. **安全な時間枠を確保する。** 保持期間の十分早い段階でエクスポートし、再試行、障害、検証の滞留に備えます。例えば、30 日保持で毎日実行する方が、30 日目に初めて実行するより復旧時間を確保できます。初回や期間短縮の前には、組み込み削除ジョブを止めるか Server を `forever` にして、元データを一時保護します。元の設定を記録し、検証後に戻してください。削除対象になれば、すぐに削除が実行される可能性があります。
2. **閉じた実行を一覧化する。** 固定の UTC 上限を記録し、それより前の `closed_at` を選びます。失敗、キャンセル、強制終了、continue-as-new の前の実行も含めてすべてをエクスポートします。一つのインスタンスに複数の実行がある場合もあります。各候補の Namespace、インスタンス ID、実行 ID、終了時刻を残し、全ページを取得してください。
3. **特定の実行をエクスポートする。** ジョブ実行時にたまたま現在の実行であるものではなく、下記の実行指定エンドポイントやコマンドを使います。検証前の候補と検証済みコピーは分けて保存します。
4. **保存先から読み戻して確認する。** Namespace 単位の一覧に対する実行の同一性、スキーマバージョン、想定される最後の履歴番号、完全なイベント範囲、秘匿化方針、チェックサムを確認します。署名があれば信頼したキーで検証します。コールド Replay に必要な正確なアプリケーションビルドとコーデックも保存してください。チェックサムが証明するのはバイトの一致であり、エクスポート時に履歴が完全だったことではありません。
5. **外部のバイト列を保持する。** エクスポートには外部参照のエンベロープがあり、参照先すべての独立したコピーがあるわけではありません。エクスポートの寿命に合わせて実体を保存し、温まった runtime キャッシュを使わずに取得を試してください。[外部ペイロードのライフサイクル](../features/external-payload-storage.md#replay-retention-and-cleanup)に従います。
6. **削除前に照合する。** 閉じた実行の一覧と保存先の検証済み記録を照合します。不足する実行 ID、検証失敗、保持期限に近づく滞留を通知します。全候補を確認してからチェックポイントを進めます。終了時刻の範囲を重ねて再走査し、Namespace と実行 ID で重複排除します。後の不完全なエクスポートで検証済みの完全なバンドルを上書きしないでください。

これらはアプリケーションが担当する手順であり、製品がサポートする自己完結型アーカイブ操作ではありません。[Server #520](https://github.com/durable-workflow/server/issues/520) は、必要な外部バイトをすべてコピー、保持し、コールド検証する未提供の製品機能を追跡しています。参照だけのエクスポートや手動のチェックサム確認が成功しても、その要件を満たしたことにはなりません。

:::warning 復旧コピーなしの削除は取り消せません

削除後のエクスポートは、失われたイベントを再構成できません。公開済み実装は、削除済みの終了実行でも `history_complete: true` と表示し、以前の `dedupe_key` を再使用することがあります。[Workflow #856](https://github.com/durable-workflow/workflow/issues/856) で追跡しています。どちらの値も、未削除の証拠として信用しないでください。組み込みエクスポートは `details_pruned_at` がある実行を拒否する必要があります。Server の一覧は summary を削除した実行を表示しないため、削除後に作った一覧では、すべての古い実行を取得できたか証明できません。削除前の一覧を残し、復旧コピーを使って不足分を調査してください。

:::

### Server 実行の選択とエクスポート {#selecting-and-exporting-server-runs}

ワークフロー一覧の `query` パラメーターでは `CloseTime` を比較できます。次は固定した半開 UTC 区間の例です。

```bash
curl --fail-with-body --get "$DURABLE_WORKFLOW_SERVER_URL/api/workflows" \
  -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  --data-urlencode "query=CloseTime >= '2026-10-01T00:00:00Z' AND CloseTime < '2026-10-02T00:00:00Z'" \
  --data-urlencode "page_size=200"
```

`workflows` の各項目から `workflow_id`、`run_id`、`closed_at` を読みます。応答が `next_page_token: null` になるまで、同じリクエストに `next_page_token` を付けて続けます。失敗などの終了結果を漏らさないため、`status=completed` のみに限定しないでください。ページング中は時間範囲を変えず、取得中の summary が削除されないように保護します。

選択した各組について、バンドルをエクスポートして保存します。

```bash
curl --fail-with-body "$DURABLE_WORKFLOW_SERVER_URL/api/workflows/$WORKFLOW_ID/runs/$RUN_ID/history/export" \
  -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  --output "$RUN_ID.candidate.json"
```

[Server の保持ポリシー](../polyglot/server.md#retention)が自動削除のタイミングを決めます。すべての必要なコピーを検証後、意図した有限保持へ戻します。エクスポートが長期停止した場合に `forever` を使い続ける前には、容量を確認してください。アーカイブ済みの実行は、この設定とは別に保護されます。

### 組み込み実行の選択とエクスポート {#selecting-and-exporting-embedded-runs}

設定済みの実行モデルで、未削除の閉じた実行を `closed_at` から選択します。次のクエリは候補一覧を作るもので、自動エクスポーターではありません。

```php
use Workflow\V2\Models\WorkflowRun;
use Workflow\V2\Support\ConfiguredV2Models;

$runs = ConfiguredV2Models::query('run_model', WorkflowRun::class)
    ->whereNull('details_pruned_at')
    ->whereNotNull('closed_at')
    ->where('closed_at', '>=', $fromUtc)
    ->where('closed_at', '<', $untilUtc)
    ->orderBy('id')
    ->lazyById(100);

foreach ($runs as $run) {
    // Persist the candidate run id and close time in your export inventory.
}
```

通常のアプリケーション初期化と保存設定で、各候補をエクスポートします。

```bash
php artisan workflow:v2:history-export "$WORKFLOW_ID" --run-id="$RUN_ID" --output="$RUN_ID.candidate.json" --pretty
php artisan workflow:v2:replay-verify "$RUN_ID.candidate.json" --skip-replay --json
```

`--skip-replay` は Replay を実行せずに整合性と構造を確認します。外部バイトへのアクセスや、削除前の取得は証明しません。対象のアプリケーションビルドで、代表的な完全 Replay を別途試してください。削除ジョブが `pruneRun()` を呼べるのは、保持とエクスポートの要件を満たしてからです。エクスポートの成功自体が削除権限になるわけではありません。

## 終了済み実行のアーカイブ {#archiving-terminal-runs}

完了、失敗、キャンセル、強制終了した実行を、コントロールプレーンからアーカイブします。

```php
use Workflow\V2\Contracts\WorkflowControlPlane;

$controlPlane = app(WorkflowControlPlane::class);

$result = $controlPlane->archive('order-12345', [
    'reason' => 'Retention period expired',
]);

if ($result['accepted']) {
    // Run's archived_at is now set; it disappears from active fleet views.
}
```

同じ操作をコントロールプレーンの HTTP ルートでも利用できます。アーカイブできるのは閉じた実行だけです。すでにアーカイブ済みなら、`accepted` と `archive_not_needed` が返ります。

### アーカイブを自動化する {#automating-archival}

保持期間を過ぎた終了済み実行を永続実行テーブルから探し、各実行に `archive()` を呼ぶスケジュールを設定できます。単純な時間ベースの例として、`routes/console.php` に次を追加します。

```php
use Illuminate\Support\Facades\Schedule;
use Workflow\V2\Models\WorkflowRun;
use Workflow\V2\Contracts\WorkflowControlPlane;

Schedule::call(function (WorkflowControlPlane $controlPlane): void {
    WorkflowRun::query()
        ->whereIn('status', ['completed', 'failed', 'cancelled', 'terminated'])
        ->whereNull('archived_at')
        ->where('closed_at', '<=', now()->subMonth())
        ->with('instance:id')
        ->chunkById(100, function ($runs) use ($controlPlane): void {
            foreach ($runs as $run) {
                $controlPlane->archive($run->instance->id, [
                    'reason' => 'retention_policy',
                ]);
            }
        });
})->daily();
```

## プロジェクション行の削除 {#pruning-projection-rows}

実行の summary、待機、タイムライン、タイマー、系譜のプロジェクション行は、永続履歴とコマンドから再構成できます。対応する実行がなくなった行を削除するには、`workflow:v2:rebuild-projections --prune-stale` を使用します。

```bash
# Preview what would be pruned
php artisan workflow:v2:rebuild-projections --prune-stale --dry-run

# Actually prune stale projection rows
php artisan workflow:v2:rebuild-projections --prune-stale
```

## 永続データの詳細を削除する {#pruning-durable-rows}

組み込みホストは、保持ポリシーを適用し、必要なエクスポートや復旧コピーを検証した後、同梱の cleanup API を使用できます。

```php
use Workflow\V2\Support\WorkflowRunRetentionCleanup;

$report = WorkflowRunRetentionCleanup::pruneRun($runId);
```

`pruneRun()` は対象実行をロックし、一つの保存トランザクションで詳細行を削除します。非終端、終了時刻なし、未終了の切り離しアクティビティ（`detached_activity_still_open`）は拒否します。許可された正しい実行の選択と保持期間の適用はホストの責任です。`retentionHoldReason($runId)` で切り離しアクティビティの保持条件を調べられ、削除時にも再確認します。

`workflow_runs` と `workflow_instances` は残してください。実行行は終端の墓石として `details_pruned_at` を保持し、再削除でも最初の時刻を維持します。ルートの入力と出力も残るので、容量を別途計上します。プロジェクション再構築で消した summary や履歴を作り直してはいけません。削除後のエクスポートは履歴を復元できず、完全性表示の制限は [Workflow #856](https://github.com/durable-workflow/workflow/issues/856) で追跡しています。

この API が削除するのはデータベースの詳細です。外部オブジェクトの保持と削除はホストが担当し、残ったルート、切り離し作業、バックアップ・復旧による保持も考慮します。オブジェクトの削除前に[外部ペイロードのライフサイクル](../features/external-payload-storage.md)を確認してください。削除**前に**エクスポートと必要な外部バイト列を検証します。詳細を残したアーカイブ済み実行は、障害調査に使用できます。
