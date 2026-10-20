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
