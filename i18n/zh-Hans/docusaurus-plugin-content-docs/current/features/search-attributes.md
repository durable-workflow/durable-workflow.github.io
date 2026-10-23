---
sidebar_position: 17
---

# 搜索属性 {#search-attributes}

搜索属性是带类型、已索引的键值对，工作流可在执行期间随时插入或更新。可见性标签只在启动时设置一次，而搜索属性可随工作流推进更新，适合跟踪工作流状态、客户标识，或其他在运行生命周期内变化的运维可见元数据。

## 插入或更新搜索属性 {#upserting-search-attributes}

`upsertSearchAttributes()` 是可按顺序编写的持久辅助函数。每次调用记录类型化 `SearchAttributesUpserted` 历史事件，并将新属性合并到运行持久化的搜索属性中。

```php
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, upsertSearchAttributes};

final class OrderWorkflow extends Workflow
{
    public function handle(string $orderId, string $customer): array
    {
        upsertSearchAttributes([
            'status' => 'processing',
            'customer' => $customer,
            'order_id' => $orderId,
        ]);

        $result = activity(ProcessOrderActivity::class, $orderId);

        upsertSearchAttributes([
            'status' => 'completed',
            'result' => $result->outcome,
        ]);

        return $result->toArray();
    }
}
```

## 启动时设置搜索属性 {#setting-search-attributes-at-start-time}

也可在启动工作流时通过 `StartOptions::withSearchAttributes()` 设置搜索属性。启动时属性立即记录到运行，并出现在 `StartAccepted` 和 `WorkflowStarted` 历史事件中。后续 `upsertSearchAttributes()` 调用在此基础上合并。

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(OrderWorkflow::class, 'order-42');
$workflow->start(
    $orderId,
    $customer,
    StartOptions::rejectDuplicate()->withSearchAttributes([
        'env' => 'production',
        'region' => 'us-east',
        'priority' => 'high',
    ]),
);
```

可将 `withSearchAttributes()` 与其他 `StartOptions` 构建方法链式调用：

```php
$options = StartOptions::rejectDuplicate()
    ->withBusinessKey('order-42')
    ->withLabels(['tenant' => 'acme'])
    ->withMemo(['note' => 'VIP order'])
    ->withSearchAttributes(['priority' => 'high']);

$workflow->start($orderId, $customer, $options);
```

启动时搜索属性与 `upsertSearchAttributes()` 遵循相同验证规则：键须为 1 至 64 个 URL 安全字符，值须为标量或 null，null 值被丢弃，不持久化。

### 控制平面 {#control-plane}

控制平面 `start()` 方法也接受搜索属性：

```php
$controlPlane->start('orders.process-order', 'order-42', [
    'arguments' => $serializedArgs,
    'search_attributes' => ['env' => 'production', 'priority' => 'high'],
]);
```

## 工作原理 {#how-it-works}

`upsertSearchAttributes()` 接受键值对关联数组：

- **键**须为 1 至 64 个 URL 安全字符，即字母、数字、连字符或下划线
- **值**须为标量（字符串、整数、浮点数、布尔值）或 null；字符串值最多 191 个字符
- 将值设为 `null` 会从搜索属性中删除该键

每次调用：

1. 暂停工作流 Fiber，交出 `UpsertSearchAttributesCall` 命令
2. 执行器校验并规范化属性，键按字母顺序排序
3. 追加 `SearchAttributesUpserted` 历史事件，包含插入或更新的 `attributes` 及完整 `merged` 结果
4. 用合并映射更新运行的 `search_attributes` 列
5. 刷新运行摘要投影，使 Waterline 立即反映变更

重放时复用已记录搜索属性事件，不重新执行插入或更新，以保持确定性。

## 合并行为 {#merging-behavior}

同一运行中多次插入或更新的搜索属性会合并。每次调用在已有键之上覆盖新键：

```php
// First upsert
upsertSearchAttributes(['status' => 'processing', 'customer' => 'Taylor']);
// search_attributes = { customer: Taylor, status: processing }

// Second upsert
upsertSearchAttributes(['status' => 'completed', 'result' => 'success']);
// search_attributes = { customer: Taylor, result: success, status: completed }
```

要删除键，将其设为 `null`：

```php
upsertSearchAttributes(['temporary_flag' => null]);
```

## 可见性与过滤 {#visibility-and-filtering}

搜索属性出现在：

- **运行详情视图**：合并搜索属性映射与标签、memo 一起显示
- **运行摘要投影**：搜索属性包含在反规范化摘要中，便于快速读取
- **可见性过滤器**：运维人员可在 Waterline 保存视图中按搜索属性值过滤工作流运行
- **历史时间线**：每个 `SearchAttributesUpserted` 事件作为类型化条目展示
- **历史导出**：JSON 历史导出包含搜索属性

### 父子运行列表筛选 {#parent-child-list-filters}

子运行[在创建时继承搜索属性和 memo](./child-workflows.md#child-metadata-inheritance)，随后可以独立更新自己的值。按继承属性筛选不会自动排除子运行。对于已注册的 keyword 属性，Server 查询 `customer = 'customer-42'` 可能返回父运行及所有仍保留该值的子运行。Memo 仍是未索引的元数据，不是另一种搜索属性筛选条件。

经过验证的 Server 2.11.0 列表 API **没有内置的仅根运行或仅子运行谓词**。`ParentWorkflowId`、`RootWorkflowId`、`IsChildWorkflow` 不是其查询语言中的自动关系字段；已发布版本的检查会拒绝这些未注册名称。注册同名自定义属性也不会自动填入父子身份。工作流类型筛选选择的是某个类型，而不是跨类型的所有根运行或子运行。

需要实际父子关系时，请检查运行的谱系。更广泛的共享可见性筛选仍属于[产品工作](https://github.com/durable-workflow/.github/issues/224)；说明此限制或采用用户自定义元数据约定并不等于交付该能力。[验证记录](https://github.com/durable-workflow/durable-workflow.github.io/issues/368#issuecomment-6362355504)保留了同时返回父子运行的结果和被拒绝的谓词。

## 修复 datetime 搜索属性 {#repair-datetime-search-attributes}

基于历史的修复命令要求**实际安装 Workflow 2.12.0 或更新版本**。请在将执行命令的 Laravel 应用中检查 `composer.lock` 和 `php artisan help workflow:v2:repair-search-datetimes`。源码 checkout 或 Composer 约束本身不能证明已安装该命令。

datetime 投影以微秒精度保存 UTC 时刻：`2026-10-08T12:34:56.123456+02:00` 表示 `2026-10-08T10:34:56.123456Z`。旧 writer 可能保存偏移量对应的本地时间，同时在有类型历史中保留偏移量。升级可以阻止新的 writer 错误，但不会识别或重写旧行。不要从已存储的本地时间猜测原始时区。

先升级所有投影 writer，并备份工作流数据库。使用**精确的 run ID**，而不是工作流实例 ID。先预览：

```sh
php artisan workflow:v2:repair-search-datetimes RUN_ID --namespace=production --json
php artisan workflow:v2:repair-search-datetimes RUN_ID --namespace=production --key=SubmittedAt --json
```

`--namespace=production` 是精确相等检查，应使用 run 的实际命名空间。仅当精确 run ID 已足够时才省略，包括旧的 null 命名空间；显式空命名空间会被拒绝。不传 `--key` 时选择该 run 的 datetime 属性。可重复选项选择已知键，例如 `--key=SubmittedAt --key=ApprovedAt`。

默认为预览。检查 `examined`、`would_repair` 和精确的 run/键选择后，再显式应用同一选择：

```sh
php artisan workflow:v2:repair-search-datetimes RUN_ID --namespace=production --key=SubmittedAt --apply --json
```

重新读取所选属性和 run summary，再次预览。证据未变且值已正确时，重复 apply 会报告零修复。修复一个子集并不能证明未选键也正确。

每个键都需要最新保留的、显式有类型的 `SearchAttributesUpserted` 证据，其原始逻辑命令序号必须与投影一致。历史已清理、证据缺失或过期、时区不明确、命名空间错误、键不再作为 datetime 属性保留时，操作会被拒绝。任一键无法证明就拒绝整个选择；应检查历史并只选择可证明的键，不要猜测偏移量。

命令先锁定并验证整个选择，再在一个存储事务中更新派生属性及其 summary。权威历史、业务命令、run/task 标识和 lease 均不改变。JSON 失败区分 `refused` 与 `unverified`：出现意外存储错误后，应先检查行再重试，因为结果不确定的 commit 不保证已 rollback。

此命令修复派生搜索属性及其 summary，不恢复已清理历史，也不改变权威 input。Server 独立的可见性查询绑定路径和镜像采用都需要各自经过验证的交付；Core tag 本身不能证明 HTTP 已修复。请参阅[规范恢复流程](https://github.com/durable-workflow/workflow/blob/b3bbfdb5258c68546ae38ca1fde52818e4b05d12/docs/architecture/projection-timestamp-storage.md#datetime-search-attributes)。

## 继续为新运行 {#continue-as-new}

工作流继续为新运行时，当前搜索属性自动继承到新运行。新运行从上一运行的完整合并属性映射开始，可继续插入或更新。

## 隐私与限制 {#privacy-and-limits}

搜索属性是**明文运维元数据**，任何有 Waterline 访问权限的人都可查看其值，且存储时不加密。绝不要在搜索属性中存储秘密、密码、令牌或个人身份信息（PII）。

约束：

- 键名：1 至 64 个 URL 安全字符，匹配 `[a-zA-Z0-9_-]`
- 值：仅限标量类型，即字符串、整数、浮点数或布尔值，字符串最多 191 个字符
- 将值设为 `null` 会删除该键

## 搜索属性、memo 与可见性标签对比 {#search-attributes-vs-memo-vs-visibility-labels}

| | 搜索属性 | memo | 可见性标签 |
|---|---|---|---|
| **设置时机** | 启动时或执行期间任意时刻 | 启动时或执行期间任意时刻 | 仅启动时 |
| **可变** | 是，通过 `upsertSearchAttributes()` | 是，通过 `upsertMemo()` | 否 |
| **值类型** | 仅标量 | 任何可 JSON 序列化类型 | 仅标量 |
| **索引** | 是 | 否 | 是 |
| **可过滤** | 是 | 否 | 是 |
| **用途** | 动态状态、进度跟踪 | 丰富元数据、备注、上下文 | 静态分类 |
| **历史事件** | 每次插入或更新记录 `SearchAttributesUpserted` | 每次插入或更新记录 `MemoUpserted` | 无，启动时设置 |

丰富结构化元数据如果不需要过滤或排序，请改用 [memo](./memo.md)。
