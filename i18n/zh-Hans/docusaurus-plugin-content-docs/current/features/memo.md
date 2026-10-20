---
sidebar_position: 18
---

# memo {#memo}

memo 是未索引的键值元数据，工作流可在执行期间随时读取和更新。与已索引、可过滤的[搜索属性](./search-attributes.md)不同，memo 适合更丰富的结构化元数据，在详情视图和历史导出中展示，但按契约不参与集群范围的过滤与排序。

## 插入或更新 memo {#upserting-memos}

`upsertMemo()` 是可按顺序编写的持久辅助函数。每次调用记录类型化 `MemoUpserted` 历史事件，并将新条目合并到运行持久化的 memo 中。

```php
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, upsertMemo};

final class OrderWorkflow extends Workflow
{
    public function handle(string $orderId, string $customer): array
    {
        upsertMemo([
            'customer_name' => $customer,
            'order_id' => $orderId,
            'status' => 'processing',
            'line_items' => [
                ['sku' => 'WIDGET-1', 'qty' => 2],
                ['sku' => 'GADGET-3', 'qty' => 1],
            ],
        ]);

        $result = activity(ProcessOrderActivity::class, $orderId);

        upsertMemo([
            'status' => 'completed',
            'result_summary' => $result->outcome,
        ]);

        return $result->toArray();
    }
}
```

也可在启动时通过 `StartOptions` 设置 memo：

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(OrderWorkflow::class, 'order-123');
$workflow->start(
    'ORD-456',
    'Taylor',
    StartOptions::rejectDuplicate()->withMemo([
        'source' => 'api',
        'priority' => 'high',
    ]),
);
```

## 工作原理 {#how-it-works}

`upsertMemo()` 接受键值对关联数组：

- **键**必须是非空字符串，最多 64 个字符
- **值**可以是任何可 JSON 序列化的数据：标量、null、数组或嵌套对象
- 将值设为 `null` 会从 memo 删除该键

每次调用：

1. 暂停工作流 Fiber，交出 `UpsertMemoCall` 命令
2. 执行器校验并规范化条目，键按字母顺序排序
3. 追加 `MemoUpserted` 历史事件，包含插入或更新的 `entries` 及完整 `merged` 结果
4. 用合并映射更新运行的 `memo` 列

重放时复用已记录的 memo 事件，不重新执行插入或更新，以保持确定性。

## 合并行为 {#merging-behavior}

同一运行中多次插入或更新的 memo 会合并。每次调用在已有键之上覆盖新键：

```php
// First upsert
upsertMemo(['status' => 'processing', 'customer' => 'Taylor']);
// memo = { customer: Taylor, status: processing }

// Second upsert
upsertMemo(['status' => 'completed', 'result' => 'success']);
// memo = { customer: Taylor, result: success, status: completed }
```

要删除键，将其设为 `null`：

```php
upsertMemo(['temporary_note' => null]);
```

## 可见性 {#visibility}

memo 出现在：

- **运行详情视图**：Waterline 工作流详情页显示完整合并 memo
- **历史时间线**：每个 `MemoUpserted` 事件作为类型化条目展示
- **历史导出**：JSON 历史导出包含 memo
- **Describe**：控制平面 `describe` 响应包含当前 memo

memo **不**包含在运行摘要投影中，**不**支持过滤、排序或保存视图。需要已索引、可过滤元数据时，请使用[搜索属性](./search-attributes.md)。

## 继续为新运行 {#continue-as-new}

工作流继续为新运行时，当前 memo 自动继承到新运行。新运行从上一运行的完整合并 memo 开始，可继续插入或更新。

## 嵌套结构 {#nested-structures}

搜索属性只允许标量值，而 memo 支持嵌套 JSON 结构：

```php
upsertMemo([
    'order' => [
        'id' => 'ORD-456',
        'items' => [
            ['sku' => 'WIDGET-1', 'qty' => 2],
            ['sku' => 'GADGET-3', 'qty' => 1],
        ],
    ],
    'metadata' => [
        'source' => 'api',
        'version' => 2,
    ],
]);
```

嵌套对象具有相同的键约束：每层的每个键都须为非空字符串，最多 64 个字符。

## 约束 {#constraints}

- 键名：每个嵌套层级中均为非空字符串，最多 64 个字符
- 值：任何可 JSON 序列化类型，包括标量、null、数组和嵌套对象
- 将值设为 `null` 会删除该键
- memo 是最终一致的元数据，不是重放的权威依据，不要根据 memo 值进行工作流逻辑分支

## memo、搜索属性与可见性标签对比 {#memo-vs-search-attributes-vs-visibility-labels}

| | memo | 搜索属性 | 可见性标签 |
|---|---|---|---|
| **设置时机** | 启动时或执行期间任意时刻 | 执行期间任意时刻 | 仅启动时 |
| **可变** | 是，通过 `upsertMemo()` | 是，通过 `upsertSearchAttributes()` | 否 |
| **值类型** | 任何可 JSON 序列化类型 | 仅标量 | 仅标量 |
| **索引** | 否 | 是 | 是 |
| **可过滤** | 否 | 是 | 是 |
| **用途** | 丰富元数据、备注、上下文 | 动态状态、进度跟踪 | 静态分类 |
| **历史事件** | 每次插入或更新记录 `MemoUpserted` | 每次插入或更新记录 `SearchAttributesUpserted` | 无，启动时设置 |
