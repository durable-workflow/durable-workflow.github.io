---
sidebar_position: 4
---

# Передавання даних {#passing-data}

Передавати дані до workflow можна через метод `start()`.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class);
$workflow->start('world');
```

Аргументи передаються до методу `handle()` workflow.

Так само можна передавати дані до activity через допоміжну функцію `activity()`.

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle($name)
    {
        return activity(MyActivity::class, $name);
    }
}
```

Аргументи передаються до методу `handle()` activity.

```php
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public function handle($name)
    {
        return "Hello, {$name}!";
    }
}
```

import PassingDataSimulator from '@site/src/components/PassingDataSimulator';

<PassingDataSimulator />

Зазвичай так варто передавати лише невеликі обсяги даних. Замість передавання
великих обсягів записуйте дані до бази даних, кешу чи файлової системи. Потім
передавайте ключ або шлях до файлу у workflow й activity. Activity зможуть
прочитати дані за цим ключем або шляхом.

Коли застосунку потрібно переносити великі обсяги байтів через історію,
наприклад документи, медіа чи серіалізовані експорти, увімкніть
[зовнішнє сховище даних](../features/external-payload-storage.md) для простору
імен. Середовище виконання виносить дані понад поріг до налаштованого об’єктного
сховища та записує в історію оболонку посилання, яку можна перевірити. Це
зберігає цілісність відтворення в межах
[`payload_size_bytes`](../constraints/structural-limits.md#payload-size).

## Результат {#output}

Після завершення workflow отримати результат можна методом `output()`.

```php
$workflow->output();
=> 'Hello, world!'
```

## Моделі {#models}

Payload у V2 використовують портативний формат значень, тому модель Eloquent не може бути аргументом чи результатом workflow або activity. Передавайте ключ моделі та завантажуйте модель усередині activity, яка її використовує.

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(int $userId)
    {
        return activity(MyActivity::class, $userId);
    }
}
```

```php
use App\Models\User;
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public function handle(int $userId)
    {
        $user = User::findOrFail($userId);

        return "Hello, {$user->name}!";
    }
}
```

Завантажуйте моделі в activity, а не в коді workflow. Код workflow виконується повторно під час replay, і запит до бази даних може повернути інші рядки під час пізнішого replay.

Передавання моделі в `start()` викидає `InvalidArgumentException`. Передавання моделі в `activity()` завершує запуск workflow з помилкою. Обидва повідомлення про помилку починаються з `unsupported_value_type`.

Те саме правило діє для колекцій Eloquent. Натомість передавайте масив ключів. Якщо activity потрібні лише кілька атрибутів, передайте масивом лише ці значення. Історія workflow їх зберігає, тому ніколи не додавайте облікові дані чи інші секрети.

У v1 workflow та activity отримували моделі через `SerializesModels`, який зберігав ідентифікатор моделі й повторно завантажував модель під час виконання job. V2 цього не робить.

## Впровадження залежностей {#dependency-injection}

Крім передавання даних, можна вказувати типи залежностей у методах `handle()`
workflow або activity. Сервісний контейнер Laravel автоматично впровадить ці
залежності.

```php
use Illuminate\Contracts\Foundation\Application;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(Application $app)
    {
        if ($app->runningInConsole()) {
            // ...
        }
    }
}
```

Впровадження залежностей не послаблює вимогу детермінованості workflow. Workflow
може вказувати типи стабільних сервісів, наприклад контейнера застосунку Laravel
чи засобів читання налаштувань. Але залежності, які виконують роботу, усе одно
потребують правильної стійкої межі. Зовнішнє введення-виведення, доступ до бази
даних, виклики сервісів та іншу роботу, яка може зазнати збою чи потребує повторних
спроб, розміщуйте в `activity(...)` або `localActivity(...)`. Використовуйте
`sideEffect()` лише для одноразового знімка значення, безпечного для відтворення,
який має бути зафіксований в історії: читання реального часу, згенерованого
випадкового значення або налаштування, збереженого в момент рішення.
