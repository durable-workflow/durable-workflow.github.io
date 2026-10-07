---
sidebar_position: 10
---

import ConcurrencySimulator from '@site/src/components/ConcurrencySimulator';

# Конкурентне виконання {#concurrency}

Цей посібник описує конкурентне виконання у вбудованих Laravel workflow з
`Workflow\V2\Workflow`. Для worker у сервісному режимі використовуйте
[посібник PHP SDK](https://php.durable-workflow.com/build/workflows-activities/),
[посібник Python SDK](https://python.durable-workflow.com/sdk-reference/#deterministic-parallel-groups) або
[довідник Rust SDK](https://rust.durable-workflow.com/durable_workflow/struct.WorkflowContext.html#method.parallel).

`all([...])` описує всю стійку групу перед призупиненням. Вбудований runtime
планує її команди activity й дочірніх workflow та повертає результати
у початковій вкладеній структурі вхідних даних.

Використовуйте групу вибору, коли подальше виконання залежить від першого
завершеного учасника, а не від усього бар’єра. Вибір також стійкий: він запускає
кожного учасника, записує одного переможця й залишає решту працювати, доки
код workflow не дочекається їх або явно не скасує.

## Послідовне виконання {#series}

Цей приклад виконує 3 activity послідовно, очікуючи на завершення кожної перед переходом до наступної.

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle()
    {
        return [
            activity(MyActivity1::class),
            activity(MyActivity2::class),
            activity(MyActivity3::class),
        ];
    }
}
```

<ConcurrencySimulator
  activities={[
    { name: 'MyActivity1', duration: 1500 },
    { name: 'MyActivity2', duration: 2000 },
    { name: 'MyActivity3', duration: 1200 },
  ]}
  mode="series"
  title="Симулятор послідовного виконання"
/>

## Паралельне виконання {#parallel}

Цей приклад виконує 3 activity паралельно, очікує на завершення всіх і збирає результати.

```php
use function Workflow\V2\{all, activity};
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle()
    {
        return all([
            fn () => activity(MyActivity1::class),
            fn () => activity(MyActivity2::class),
            fn () => activity(MyActivity3::class),
        ]);
    }
}
```

<ConcurrencySimulator
  activities={[
    { name: 'MyActivity1', duration: 2000 },
    { name: 'MyActivity2', duration: 1500 },
    { name: 'MyActivity3', duration: 2500 },
  ]}
  mode="parallel"
  title="Симулятор паралельного виконання"
/>

Основна відмінність між послідовним і паралельним прикладами — момент призупинення. У послідовному прикладі кожен виклик `activity()` безпосередньо призупиняє й відновлює workflow. У паралельному прикладі замикання спочатку описують увесь бар’єр, а `all()` призупиняє workflow один раз для всієї групи. Тому всі учасники можуть працювати паралельно до відновлення workflow.

## Вибір першого завершення {#first-completion-selection}

`select([...])` запускає незалежні activity, дочірні workflow, timer, очікування
signal, очікування умов або вкладені звичайні бар’єри й відновлює виконання,
коли один учасник фіксує придатний результат або типізовану помилку. Надавайте
учасникам стабільні ключі застосунку, якщо подальший код має розрізняти їх
або повторно звертатися до них. Ключ учасника має бути непорожнім рядком
або невід’ємним цілим числом.

Наведений координатор починає відлік кінцевого терміну на тому самому
стійкому кроці, що й resolver. Обробка вхідних даних і прогрес resolver
не можуть скинути або відкласти цей термін:

```php
use function Workflow\V2\{activity, await, select, timer};
use Workflow\V2\Workflow;

final class ResolveInRealTime extends Workflow
{
    public function handle(string $requestId): array
    {
        $selected = select([
            'resolved' => fn () => activity(ResolveRequest::class, $requestId),
            'manual' => fn () => await('resolution.received'),
            'deadline' => fn () => timer('2 seconds'),
        ]);

        if ($selected->key === 'deadline') {
            $selected->handles['resolved']->cancel();

            return ['status' => 'timed_out'];
        }

        // The deadline is not cancelled just because another member won.
        $selected->handles['deadline']->cancel();

        return [
            'status' => 'resolved',
            'source' => $selected->key,
            'value' => $selected->result(),
        ];
    }
}
```

Результат містить стабільні ключ та індекс учасника, тип операції й стійку
ідентичність, результат або типізовану помилку, дескриптор переможця та
дескриптор кожного учасника. На іншого учасника можна пізніше очікувати
через `await()` або скасувати його через `cancel()`. Вибір ніколи не відкидає
й не скасовує інших учасників неявно. `cancel()` — це запит із результатом
void/unit, який не повідомляє, чи перемогло скасування. Джерелом істини щодо
результату є історія `SelectionOperationCancelled`. Якщо завершення зафіксовано
першим, runtime не записує позначку скасування. Replay проходить виклик cancel
лише після того, як зафіксована межа завдання workflow, наступна команда або
термінальна подія workflow доведе фіксацію цієї операції без ефекту. Replay
query зупиняється на незавершеному cancel, не показуючи спекулятивний стан
після нього. Очікування дескриптора після зафіксованої операції без ефекту
повертає попередній результат завершення.

Runtime записує перший придатний результат, утримуючи блокування фіксації
батьківського запуску. Тому холодний перезапуск, повторне завантаження
збереженої історії, replay query і подальші завершення інших учасників
використовують записаного переможця, а не змагаються локальними futures мови
чи переосмислюють порядок історії. Точна повторна доставка ідемпотентна.
Конкурентні вхідні дані впорядковуються за їхньою зафіксованою стійкою історією.
Дані, що надійшли під час виконання activity, стають видимими на наступному
завданні workflow. Пізні або повторні дані не можуть замінити вже записаного
переможця.

## Вкладені бар’єри {#nested-barriers}

Вкладені групи `all([...])` дають одному кроку workflow змогу описати дерево стійкого розгалуження роботи й збирання результатів. Runtime планує кожну activity або дочірній workflow як стійку листову послідовність, записує повний `parallel_group_path` листка й очікує, доки кожен охоплюючий бар’єр зможе просунутися. Потім він відновлює початкову вкладену структуру результатів перед продовженням тіла workflow. Під час replay листок activity або дочірнього workflow з кроку `all([...])` має відповідати записаному шляху групи. Типізована історія листка без метаданих групи вважається несумісною історією старої попередньої версії, а не підставляється в поточний бар’єр за припущенням.

```php
use function Workflow\V2\{all, activity};
use Workflow\V2\Workflow;

final class NestedWorkflow extends Workflow
{
    public function handle(): array
    {
        return all([
            fn () => activity(BuildSummary::class),
            fn () => all([
                fn () => activity(BuildInvoice::class),
                fn () => activity(BuildShipment::class),
            ]),
        ]);
    }
}
```

У цьому прикладі Waterline показує три відкриті очікування листків, а не одне штучне «вкладене» очікування. Перший листок належить лише зовнішньому бар’єру. Другий і третій листки містять `parallel_group_path` із двома записами, тому оператори бачать як зовнішню групу, так і внутрішню підгрупу, яка досі відкрита.

Розмір зовнішньої групи рахує стійкі листки, а не вкладені масиви. Кожен
вкладений листок має `parallel_group_path` від зовнішньої групи до внутрішньої.
Кожен запис шляху зберігає ту саму стійку позицію workflow. Група планує всі
листки до призупинення, а потім збирає успішні значення за позиціями вхідних
даних. Перезапуск worker і replay завершеної історії відновлюють ту саму
ідентичність групи. Точна повторна термінальна доставка ігнорується. Пізнє
завершення іншого учасника може доповнити часткову діагностику, але не змінює
учасника з помилкою, уже вибраного детермінованою політикою вбудованого runtime.

Вбудований runtime передає типізовану помилку листка з `all()` і зберігає
стійкі метадані групи бар’єра в історії та представленнях для оператора.

## Асинхронний callback {#async-callback}

`async(...)` виконує серіалізований callback як стійкий дочірній workflow із системним типом `durable-workflow.async`. Асинхронні callback використовують той самий контракт допоміжних функцій лише для послідовного коду, що й іменовані workflow v2. Тому `activity()`, `await()`, `timer()`, `sideEffect()` та інші однокрокові функції призупиняють виконання безпосередньо в тілі callback без обов’язкового `yield`.

```php
use function Workflow\V2\{activity, async};
use Workflow\V2\Workflow;

final class CustomerWorkflow extends Workflow
{
    public function handle(string $customerId): array
    {
        $profile = async(static function () use ($customerId): array {
            $customer = activity(LoadCustomer::class, $customerId);

            return [
                'customer' => $customer,
                'score' => activity(ScoreCustomer::class, $customer['id']),
            ];
        });

        return ['profile' => $profile];
    }
}
```

Батьківський запуск бачить callback як очікування дочірнього workflow. Тому історія команд, походження запусків і деталі у Waterline використовують ті самі `child_call_id`, ID дочірнього запуску та історію його результату, що й явний виклик `child(...)`. Callback серіалізується за допомогою підтримки серіалізованих замикань Laravel, тому обмежуйте його одним застосунком і розгортанням. Використовуйте іменований виклик `child(SomeWorkflow::class, ...)`, якщо потрібен стабільний публічний тип workflow для маршрутизації між сервісами або тривалої еволюції коду. У v2 callback `async(...)` підтримують лише послідовний код, тому викликайте `activity()`, `child()`, `await()`, `timer()` та `all([...])` безпосередньо без `yield`.

## Змішані бар’єри activity та дочірніх workflow {#mixed-activity--child-barriers}

Та сама функція `all()` також збирає результати змішаної групи activity й дочірніх workflow. Результати повертаються в початковому порядку масиву, успішні учасники очікують на решту групи, а перший учасник із помилкою одразу пробуджує батьківський workflow.

Якщо на момент replay батьківського workflow кілька учасників бар’єра вже завершилися з помилками, батьківський workflow отримує помилку з найранішим записаним часом закриття. За однакового часу двох помилок перемагає менший індекс листка бар’єра. Тому відновлення workflow і replay query вибирають той самий виняток. Подальші помилки інших учасників не замінюють виняток, уже переданий батьківському кроку.

```php
use function Workflow\V2\{all, activity, child};
use Workflow\V2\Workflow;

final class OrderWorkflow extends Workflow
{
    public function handle(): array
    {
        [$charge, $shipment] = all([
            fn () => activity(ChargeCustomer::class),
            fn () => child(ShipOrderWorkflow::class),
        ]);

        return compact('charge', 'shipment');
    }
}
```

## Поточні обмеження {#current-limits}

Поточний API конкурентного виконання ще не містить:

- вбудованих засобів обмеження конкурентності, окрім явних вкладених груп `all([...])`

## Паралельні дочірні workflow {#child-workflows-in-parallel}

Дочірні workflow також можуть виконуватися у власному бар’єрі `all([...])`. Він працює так само, як паралельне виконання activity, але для дочірніх workflow: батьківський workflow стійко запускає кілька дочірніх запусків і відновлюється лише тоді, коли весь дочірній бар’єр може просунутися.

```php
use function Workflow\V2\{all, child};
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle(): array
    {
        return all([
            fn () => child(MyChild1::class),
            fn () => child(MyChild2::class),
            fn () => child(MyChild3::class),
        ]);
    }
}
```

<ConcurrencySimulator
  activities={[
    { name: 'MyChild1', duration: 2200 },
    { name: 'MyChild2', duration: 1800 },
    { name: 'MyChild3', duration: 2500 },
  ]}
  mode="parallel"
  title="Симулятор паралельних дочірніх workflow"
/>

Так можна легко побудувати ієрархічний паралелізм у workflow, зокрема вкладені групи лише дочірніх workflow або змішані групи дочірніх workflow й activity, коли одному батьківському кроку потрібні кілька рівнів збирання результатів.
