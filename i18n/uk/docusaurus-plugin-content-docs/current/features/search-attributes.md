---
sidebar_position: 17
---

# Атрибути пошуку {#search-attributes}

Атрибути пошуку — це типізовані індексовані пари ключ–значення, які workflow може додавати й оновлювати в будь-який момент виконання. На відміну від позначок видимості, які задаються один раз під час запуску, атрибути пошуку змінюються разом із виконанням workflow. Вони підходять для відстеження стану workflow, ідентифікаторів клієнтів та інших видимих оператору метаданих, які змінюються протягом запуску.

## Додавання й оновлення атрибутів пошуку {#upserting-search-attributes}

`upsertSearchAttributes()` — це стійкий допоміжний виклик для послідовного коду workflow. Кожен виклик записує типізовану подію історії `SearchAttributesUpserted` і об’єднує нові атрибути зі збереженими атрибутами пошуку запуску.

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

## Атрибути пошуку під час запуску {#setting-search-attributes-at-start-time}

Атрибути пошуку також можна задати під час запуску workflow через `StartOptions::withSearchAttributes()`. Вони одразу записуються в запуск і входять до подій історії `StartAccepted` та `WorkflowStarted`. Подальші виклики `upsertSearchAttributes()` об’єднують нові атрибути з цими початковими значеннями.

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

`withSearchAttributes()` можна поєднувати в ланцюжку з іншими методами побудови `StartOptions`:

```php
$options = StartOptions::rejectDuplicate()
    ->withBusinessKey('order-42')
    ->withLabels(['tenant' => 'acme'])
    ->withMemo(['note' => 'VIP order'])
    ->withSearchAttributes(['priority' => 'high']);

$workflow->start($orderId, $customer, $options);
```

Для атрибутів пошуку під час запуску діють ті самі правила перевірки, що й для `upsertSearchAttributes()`: ключі містять 1–64 символи, придатні для URL, значення є скалярними або null, а значення null відкидаються й не зберігаються.

### Площина керування {#control-plane}

Метод `start()` площини керування також приймає атрибути пошуку:

```php
$controlPlane->start('orders.process-order', 'order-42', [
    'arguments' => $serializedArgs,
    'search_attributes' => ['env' => 'production', 'priority' => 'high'],
]);
```

## Як це працює {#how-it-works}

Функція `upsertSearchAttributes()` приймає асоціативний масив пар ключ–значення:

- **Ключі** містять 1–64 символи, придатні для URL: літери, цифри, дефіси й підкреслення
- **Значення** мають бути скалярними (string, int, float, bool) або null. Рядки обмежені 191 символом
- Значення `null` видаляє відповідний ключ з атрибутів пошуку

Кожен виклик:

1. Призупиняє fiber workflow і передає команду `UpsertSearchAttributesCall`
2. Виконавець перевіряє й нормалізує атрибути, сортуючи ключі за абеткою
3. До історії додається подія `SearchAttributesUpserted` з оновленими `attributes` та повним результатом `merged`
4. Стовпець `search_attributes` запуску оновлюється об’єднаною мапою
5. Оновлюється проєкція стислого представлення запуску, щоб Waterline одразу відображав зміну

Під час replay використовуються записані події атрибутів пошуку без повторного виконання оновлення. Це зберігає детермінізм.

## Правила об’єднання {#merging-behavior}

Кілька викликів оновлення в межах одного запуску об’єднують атрибути пошуку. Кожен виклик додає нові ключі та замінює значення наявних:

```php
// First upsert
upsertSearchAttributes(['status' => 'processing', 'customer' => 'Taylor']);
// search_attributes = { customer: Taylor, status: processing }

// Second upsert
upsertSearchAttributes(['status' => 'completed', 'result' => 'success']);
// search_attributes = { customer: Taylor, result: success, status: completed }
```

Щоб видалити ключ, задайте для нього `null`:

```php
upsertSearchAttributes(['temporary_flag' => null]);
```

## Видимість і фільтрування {#visibility-and-filtering}

Атрибути пошуку відображаються в таких місцях:

- **Детальний перегляд запуску** — об’єднана мапа атрибутів пошуку відображається поруч із позначками й memo
- **Проєкція стислого представлення запуску** — атрибути пошуку входять до денормалізованого представлення для швидкого читання
- **Фільтри видимості** — оператори можуть фільтрувати запуски workflow за значеннями атрибутів пошуку в збережених представленнях Waterline
- **Хронологія історії** — кожна подія `SearchAttributesUpserted` відображається як типізований запис у хронології запуску
- **Експорт історії** — атрибути пошуку входять до експорту історії у JSON

## Continue-as-New {#continue-as-new}

Під час continue-as-new поточні атрибути пошуку автоматично переносяться до нового запуску. Новий запуск починається з повної об’єднаної мапи атрибутів попереднього запуску й може продовжувати її оновлення.

## Приватність і обмеження {#privacy-and-limits}

Атрибути пошуку — це **метадані оператора у відкритому тексті**. Їхні значення бачить кожен, хто має доступ до Waterline, і вони зберігаються без шифрування. Ніколи не зберігайте в атрибутах пошуку секрети, паролі, токени або персональні дані (PII).

Обмеження:

- Назви ключів: 1–64 символи, придатні для URL (`[a-zA-Z0-9_-]`)
- Значення: лише скалярні типи (string, int, float, bool), рядки обмежені 191 символом
- Значення `null` видаляє відповідний ключ

## Атрибути пошуку, memo й позначки видимості {#search-attributes-vs-memo-vs-visibility-labels}

| | Атрибути пошуку | Memo | Позначки видимості |
|---|---|---|---|
| **Коли задаються** | Під час запуску або виконання | Під час запуску або виконання | Лише під час запуску |
| **Змінюються** | Так, через `upsertSearchAttributes()` | Так, через `upsertMemo()` | Ні |
| **Типи значень** | Лише скалярні | Будь-які серіалізовані в JSON | Лише скалярні |
| **Індексуються** | Так | Ні | Так |
| **Фільтруються** | Так | Ні | Так |
| **Призначення** | Динамічний стан, відстеження прогресу | Структуровані метадані, примітки, контекст | Статична класифікація |
| **Події історії** | `SearchAttributesUpserted` на кожне оновлення | `MemoUpserted` на кожне оновлення | Немає, задаються під час запуску |

Для складніших структурованих метаданих, які не потребують фільтрування або сортування, використовуйте [memo](./memo.md).
