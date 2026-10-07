---
sidebar_position: 7
---

# Побічні ефекти {#side-effects}

Побічний ефект — замикання з недетермінованим кодом. Замикання виконується лише один раз, а результат зберігається. Якщо workflow виконується повторно, замикання не запускається знову, а повертає збережений результат. Це робить workflow детермінованим: відтворення завжди повертає те саме збережене значення без повторного виконання недетермінованого коду.

```php
use function Workflow\V2\await;
use function Workflow\V2\sideEffect;
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Workflow;

#[Signal('finish')]
class MyWorkflow extends Workflow
{
    public function handle(): array
    {
        $token = sideEffect(fn () => random_int(1000, 9999));
        $finish = await('finish');

        return compact('token', 'finish');
    }
}
```

Workflow викличе `random_int()` лише один раз і збереже результат, навіть якщо згодом зазнає збою та виконуватиметься повторно.

## Коли використовувати побічні ефекти {#when-to-use-side-effects}

Використовуйте `sideEffect()`, якщо потрібне недетерміноване значення, яке:

- обчислюється локально без зовнішнього введення-виведення: випадкові числа, UUID чи часові позначки
- не має змінюватися після запису, навіть між відтвореннями
- не потребує семантики повторних спроб, бо замикання виконується рівно один раз

```php
// Generate a correlation token for downstream systems.
$correlationId = sideEffect(fn () => (string) Str::uuid());

// Snapshot the current time for a business rule.
$decidedAt = sideEffect(fn () => now()->toIso8601String());
```

## Коли натомість використовувати activity {#when-to-use-an-activity-instead}

Якщо код може зазнати збою, звертається до зовнішнього сервісу чи потребує семантики повторних спроб/тайм-ауту, використовуйте [activity](../defining-workflows/activities.md) замість побічного ефекту:

| Сценарій | Використовуйте |
|---|---|
| Генерування випадкового токена | `sideEffect()` |
| Читання налаштування в момент рішення | `sideEffect()` |
| Виклик зовнішнього API | `activity()` |
| Запис до бази даних | `activity()` |
| Надсилання листа чи сповіщення | `activity()` |
| Дороге обчислення, що може викинути виняток | `activity()` |

Практичне правило: якщо замикання може викинути виняток, після якого ви хотіли б повторити спробу, воно має бути в activity.

## Принцип роботи {#how-it-works}

- кожен `sideEffect()` додає типізовану подію історії `SideEffectRecorded` з послідовністю кроку workflow
- відтворення workflow та query повторно використовують зафіксоване значення без повторного запуску замикання
- Waterline показує знімок побічного ефекту як типізований запис історії на часовій шкалі обраного запуску
- побічні ефекти призначені лише для знімків, безпечних для відтворення, а не для роботи, що може зазнати збою чи потребує повторних спроб

## Антишаблони {#anti-patterns}

**Не викликайте зовнішні сервіси всередині побічного ефекту.** Якщо виклик сервісу зазнає збою, побічний ефект не повторюватиметься, і workflow остаточно завершиться з помилкою:

```php
// BAD: HTTP calls can fail and side effects do not retry.
$price = sideEffect(fn () => Http::get('/api/price')->json('amount'));

// GOOD: Use an activity for external calls.
$price = activity(FetchPriceActivity::class);
```

**Не розміщуйте повільні чи блокувальні операції всередині побічного ефекту.** Замикання працює в потоці завдання workflow. Тривала робота затримує все завдання workflow:

```php
// BAD: Expensive computation blocks the workflow task.
$hash = sideEffect(fn () => bcrypt($largePayload));

// GOOD: Offload heavy work to an activity.
$hash = activity(ComputeHashActivity::class, $largePayload);
```

**Не покладайтеся на змінний зовнішній стан.** Замикання виконується рівно один раз. Якщо ви читаєте значення, що змінюється з часом, знімок фіксується в момент першого виконання, а не відтворення:

```php
// The cached value is whatever it was during the first execution.
// If the cache changes later, this workflow still sees the old value.
$setting = sideEffect(fn () => cache('feature.flag'));
```

Це навмисна поведінка: знімок фіксується для детермінованості. Якщо потрібне значення, яке оновлюється протягом життя workflow, використовуйте signal чи activity.

## Запуск цього шаблону {#run-this-pattern}

Workflow вимірювання тривалості в [Sample App](/docs/sample-app) — виконуваний приклад читання годинника через `sideEffect()`:

```bash
php artisan app:elapsed
```

`App\Workflows\Elapsed\ElapsedTimeWorkflow` записує початкову й кінцеву часові позначки як цілі значення всередині callback `sideEffect()`, щоб значення зберігалося після декодування Avro під час відтворення. Деталі запуску Waterline показують дві події `MarkerRecorded` до й після спрацювання timer. Ця пара маркерів є збереженим на диску свідченням детермінованості читання годинника.
