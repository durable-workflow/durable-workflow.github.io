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

Передавання моделей працює подібно до `SerializesModels`.

```php
use App\Models\User;
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(User $user)
    {
        return activity(MyActivity::class, $user->name);
    }
}
```

Коли модель Eloquent передається до workflow або activity, серіалізується лише
її `ModelIdentifier`. Це зменшує розмір даних і допомагає workflow працювати
ефективно.

```
object(ModelIdentifier) {
    id: 42,
    class: "App\Models\User",
    relations: [],
    connection: "mysql"
}
```

Під час виконання workflow або activity отримує з бази даних повний екземпляр
моделі, включно із завантаженими зв’язками. Якщо потрібно уникнути додаткових
запитів до бази даних під час виконання, перетворіть модель на масив перед
передаванням.

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
