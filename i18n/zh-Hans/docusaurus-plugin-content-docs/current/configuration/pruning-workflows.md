---
sidebar_position: 6
---

# 工作流清理 {#pruning-workflows}

Workflow v2 区分两种生命周期操作：

1. **归档**：将终态运行标记为已归档，从活动运行概览中移除。归档**不删除**任何行。
2. **清理**：移除符合条件的保留明细或孤立投影。嵌入式清理 API 要求运行已关闭且处于终态，并检查保留约束。保留策略由宿主决定，归档不是此 API 的前提。

Server 另有命名空间保留策略，自动清理会跳过归档运行。因此，归档会保护 Server 运行免于该清理，而不是自动删除的准备步骤。

## 在数据库保留期之外保存历史 {#keeping-history-beyond-database-retention}

启用清理前，先决定所需历史应存放在哪里：

| 需求 | 选项 | 存储与清理后果 |
| --- | --- | --- |
| 在 Server 保存近期历史 | 命名空间有界保留，1 至 365 天 | 符合条件的关闭运行可在截止时间后被清理；需要更长记录时应提前导出。 |
| 在 Server 保存命名空间全部历史 | 命名空间保留模式 `forever` | 历史保留在主数据库中，直到显式恢复有界保留。 |
| 保留选定的已关闭 Server 运行 | 归档这些运行 | 自动和显式 Server 保留清理均跳过它们。已发布 API 不提供取消归档，勿将归档用作临时导出锁。 |
| 保存更长时间的独立记录 | 导出每个已关闭运行并保存外部载荷对象 | 应用负责调度、验证、访问控制与最终删除。没有内置持续历史导出器。 |

`forever` 和归档保留数据库行，而不是把它们转移到低成本存储。应规划累计的历史与载荷字节、索引、备份和恢复时间。清理仍保留运行与实例行，包括根载荷字段，存储量不会降为零。历史导出支持重放与调查，但不是完整数据库备份，也不保证仅凭该文件就能恢复运行。

### 清理前导出 {#export-before-pruning}

嵌入式应用的保留作业和 Server 命名空间可采用相同流程，但选择方式和清理权限有所不同，如下所述。

1. **建立安全窗口。** 应远早于保留截止时间导出，为重试、停机和验证积压留出时间。例如，数据库保留 30 天、每天导出，比第 30 天才首次导出留有更多恢复时间。首次导出或缩短策略之前，暂时保护源数据：暂停嵌入式清理作业，或将 Server 设为 `forever`。记录原策略，只在验证后恢复。运行一旦符合条件就可能立即被清理。
2. **盘点已关闭运行。** 记录固定的 UTC 上界，选择早于它的 `closed_at`。导出每次运行，包括失败、取消、终止和 continue-as-new 的前驱运行。一个工作流实例可能有多次运行。保留每个候选项的命名空间、实例 ID、运行 ID 和关闭时间，并获取全部分页。
3. **导出指定运行。** 使用下方按运行定位的端点或命令，不要导出作业执行时碰巧处于当前状态的运行。候选导出与已验证副本分开保存。
4. **验证已存储副本。** 从目标位置读回副本。对照命名空间范围的清单核对运行标识、模式版本、预期最后历史序号、完整事件范围、脱敏策略及完整性校验和。使用可信密钥验证已配置的签名。保留冷重放需要的准确应用构建和编解码器。校验和证明字节一致，不证明导出时历史完整。
5. **保留外部字节。** 导出保留外部引用信封，并非每个引用对象的独立副本。为导出的完整生命周期保存这些字节，并在不使用已预热运行时缓存的情况下验证读取。遵循[外部载荷生命周期](../features/external-payload-storage.md#replay-retention-and-cleanup)。
6. **清理前对账。** 将已关闭运行清单与目标存储中已验证记录逐一比较。对缺失运行 ID、验证失败和接近保留截止时间的积压发出告警。只有全部候选项均已确认，才能推进导出检查点。使用重叠的关闭时间窗口重复扫描，并按命名空间与运行 ID 去重。不要用后续不完整导出覆盖已验证的完整包。

:::warning 没有恢复副本时，清理不可逆

清理后导出无法重建已删除事件。已发布实现仍可能将终态已清理运行标记为 `history_complete: true`，并复用先前的 `dedupe_key`，该问题由 [Workflow #856](https://github.com/durable-workflow/workflow/issues/856) 跟踪。不要把任一字段当作尚未清理的证据。嵌入式导出作业必须拒绝 `details_pruned_at` 已设置的运行。摘要被清理后，Server 列表不再显示该运行，因此清理后才建立的清单无法证明所有旧运行均已捕获。保留清理前清单，并利用恢复副本调查缺口。

:::

### 选择和导出 Server 运行 {#selecting-and-exporting-server-runs}

工作流列表的 `query` 参数支持比较 `CloseTime`。以下示例选择一个固定的左闭右开 UTC 区间：

```bash
curl --fail-with-body --get "$DURABLE_WORKFLOW_SERVER_URL/api/workflows" \
  -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  --data-urlencode "query=CloseTime >= '2026-10-01T00:00:00Z' AND CloseTime < '2026-10-02T00:00:00Z'" \
  --data-urlencode "page_size=200"
```

从 `workflows` 中读取每项的 `workflow_id`、`run_id` 和 `closed_at`。附带 `next_page_token` 重复相同请求，直到响应为 `next_page_token: null`。不要只筛选 `status=completed`，否则会漏掉失败等其他终态。分页期间保持时间窗口不变，并防止清理删除窗口内的摘要。

对每组选中的实例与运行，导出并保存其包：

```bash
curl --fail-with-body "$DURABLE_WORKFLOW_SERVER_URL/api/workflows/$WORKFLOW_ID/runs/$RUN_ID/history/export" \
  -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  --output "$RUN_ID.candidate.json"
```

[Server 保留策略](../polyglot/server.md#retention)决定自动清理何时生效。所有必要副本验证后，恢复预期的有界策略。导出长期中断时，持续使用 `forever` 前应检查容量。归档运行独立于该策略受到保护。

### 选择和导出嵌入式运行 {#selecting-and-exporting-embedded-runs}

使用配置的运行模型，按 `closed_at` 选择尚未清理的已关闭运行。以下查询生成候选清单，并不是自动导出器：

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

使用应用的常规引导和存储配置导出各运行：

```bash
php artisan workflow:v2:history-export "$WORKFLOW_ID" --run-id="$RUN_ID" --output="$RUN_ID.candidate.json" --pretty
php artisan workflow:v2:replay-verify "$RUN_ID.candidate.json" --skip-replay --json
```

`--skip-replay` 不执行重放，只检查完整性和结构。它不能证明外部字节仍可读取，也不能证明导出发生在清理之前。应另用预期应用构建验证代表性的完整重放。清理作业只有满足保留与导出要求后才能调用 `pruneRun()`。导出成功本身不构成删除授权。

## 归档终态运行 {#archiving-terminal-runs}

通过控制平面归档已完成、失败、取消或终止的运行：

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

同一操作也可通过控制平面 HTTP 路由使用。只有已关闭运行可以归档。重复归档返回 `accepted`，结果为 `archive_not_needed`。

### 自动归档 {#automating-archival}

可定期查询持久化运行表中超过保留期的终态运行，并为每个调用 `archive()`。简单时间规则可在 `routes/console.php` 中添加类似代码：

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

## 清理投影行 {#pruning-projection-rows}

运行摘要、等待、时间线、定时器及谱系投影行可以从持久化历史与命令重建。使用 `workflow:v2:rebuild-projections --prune-stale` 删除其持久化运行已不存在的投影行：

```bash
# Preview what would be pruned
php artisan workflow:v2:rebuild-projections --prune-stale --dry-run

# Actually prune stale projection rows
php artisan workflow:v2:rebuild-projections --prune-stale
```

## 清理持久化明细 {#pruning-durable-rows}

嵌入式宿主在落实保留策略并验证所需导出或恢复副本之后，可使用已提供的清理 API：

```php
use Workflow\V2\Support\WorkflowRunRetentionCleanup;

$report = WorkflowRunRetentionCleanup::pruneRun($runId);
```

`pruneRun()` 锁定选定运行，并在一个存储事务中移除明细行。它拒绝非终态运行、缺少关闭时间的运行，以及仍有开放分离活动的运行（`detached_activity_still_open`）。正确选择有权限的运行并落实保留窗口仍由宿主负责。`retentionHoldReason($runId)` 可检查分离活动的保留原因，清理操作在删除前会再次检查。

保留 `workflow_runs` 与 `workflow_instances`。运行行作为终态墓碑保留 `details_pruned_at`，重复清理保留首次标记。根输入与输出字段仍在运行行中，应另计存储。不要通过投影重建恢复已删摘要或历史。清理后的导出不能恢复历史；导出完整性标记限制由 [Workflow #856](https://github.com/durable-workflow/workflow/issues/856) 跟踪。

此 API 删除数据库明细。宿主负责外部对象保留与清理，包括保留根记录、分离工作及活动备份/恢复约束的引用。移除对象前遵循[外部载荷生命周期](../features/external-payload-storage.md)。必须在清理**之前**验证导出及所需外部字节。仍保留明细的归档运行可继续用于事故调查。
