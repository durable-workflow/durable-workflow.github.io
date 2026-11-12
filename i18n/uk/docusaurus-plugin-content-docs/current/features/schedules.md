---
sidebar_position: 20
---

# Розклади {#schedules}

Розклади дають змогу періодично запускати workflow за виразами cron. Кожен розклад — це іменована стійка сутність, яку рушій перевіряє на кожному tick, щоб визначити потребу нового запуску.

## Створення розкладу {#creating-a-schedule}

Використовуйте `ScheduleManager::create()` для визначення іменованого розкладу:

```php
use Workflow\V2\Enums\ScheduleOverlapPolicy;
use Workflow\V2\Support\ScheduleManager;

$schedule = ScheduleManager::create(
    scheduleId: 'daily-invoice-sync',
    workflowClass: InvoiceSyncWorkflow::class,
    cronExpression: '0 2 * * *',
    arguments: ['nightly'],
    timezone: 'America/New_York',
    overlapPolicy: ScheduleOverlapPolicy::Skip,
    labels: ['team' => 'billing'],
    memo: ['origin' => 'scheduled'],
    searchAttributes: ['tenant_id' => '42'],
    notes: 'Runs every night at 2 AM ET.',
    executionTimeoutSeconds: 120,
    runTimeoutSeconds: 60,
);
```

`scheduleId` — це унікальний ідентифікатор розкладу, обраний користувачем. Кожен запущений workflow отримує детермінований ID екземпляра, утворений з ID розкладу й часової мітки запуску.

### Параметри {#parameters}

| Параметр | Тип | Типове значення | Опис |
|---|---|---|---|
| `scheduleId` | `string` | обов’язковий | Унікальний ідентифікатор розкладу |
| `workflowClass` | `string` | обов’язковий | Клас workflow для запуску |
| `cronExpression` | `string` | обов’язковий | Стандартний вираз cron із 5 полів |
| `arguments` | `array` | `[]` | Аргументи для методу `handle()` workflow |
| `timezone` | `string` | `'UTC'` | Часовий пояс для обчислення виразу cron |
| `overlapPolicy` | `ScheduleOverlapPolicy` | `Skip` | Дія, якщо попередній запуск ще активний |
| `labels` | `array` | `[]` | Позначки видимості для кожного запуску |
| `memo` | `array` | `[]` | Поля memo для кожного запуску |
| `searchAttributes` | `array` | `[]` | Атрибути пошуку для кожного запуску |
| `jitterSeconds` | `int` | `0` | Максимальна випадкова затримка в секундах для кожного спрацювання, що згладжує масове одночасне навантаження |
| `maxRuns` | `int\|null` | `null` | Максимальна кількість запусків перед автоматичним видаленням розкладу |
| `connection` | `string\|null` | `null` | Підключення черги для запусків, що перевизначає типове значення класу workflow |
| `queue` | `string\|null` | `null` | Назва черги для запусків, що перевизначає типове значення класу workflow |
| `notes` | `string\|null` | `null` | Довільні примітки оператора |
| `namespace` | `string\|null` | `null` | Namespace розкладу, типово налаштований `workflows.v2.namespace` або `'default'` |
| `executionTimeoutSeconds` | `int\|null` | `null` | Тайм-аут кожного логічного виконання workflow з повторними спробами й continue-as-new |
| `runTimeoutSeconds` | `int\|null` | `null` | Тайм-аут окремого запуску, що починається заново після continue-as-new |

### Часові пояси й перехід на літній час {#time-zones-and-daylight-saving-time}

Вирази cron задають місцевий час у часовому поясі розкладу `timezone`.
Під час переведення годинника діють такі правила:

- Якщо поле годин охоплює менше ніж усі 24 години, повторений місцевий час
  спрацьовує один раз, при першому настанні. У Нью-Йорку `30 1 * * *`
  спрацьовує о 01:30 EDT у день переведення годинника назад.
- Місцевий час, пропущений при переведенні годинника вперед, спрацьовує
  один раз зі зсувом на величину пропуску. Нью-йоркський розклад
  `30 2 * * *` цього дня спрацьовує о 03:30.
- Поле годин, що охоплює всі 24 години, зокрема `*`, `*/1` та `0-23`,
  зберігає відлік фактичного часу протягом повтореної години. Наприклад,
  `*/15 * * * *` продовжує спрацьовувати кожні 15 фактичних хвилин
  протягом обох проходів повтореної години в Нью-Йорку.

Використовуйте `timezone: 'UTC'`, щоб уникнути місцевого переведення
годинника. Якщо важлива стала тривалість між запусками, використовуйте
інтервальну специфікацію замість прив’язки до місцевого часу.

### Тайм-аути workflow {#workflow-timeouts}

Тайм-аут виконання охоплює одне логічне виконання з повторними спробами
й continue-as-new. Тайм-аут запуску обмежує окремий запуск і починається
заново після continue-as-new. Запуск не може перевищити залишок бюджету
виконання. Кожне спрацювання розкладу починає новий бюджет виконання,
відлік якого йде від фактичного старту workflow, а не запланованого часу.

Обидва параметри приймають додатні цілі секунди або `null`. Пропущений
параметр або `null` залишає відповідний ліміт невстановленим. Ручні запуски,
автоматичні tick, буферизовані запуски й backfill застосовують збережені ліміти
через типовий PHP-стартер.

Для `createFromSpec()` задайте ліміти в дії:

```php
$schedule = ScheduleManager::createFromSpec(
    scheduleId: 'hourly-invoice-sync',
    spec: ['intervals' => [['every' => 'PT1H']]],
    action: [
        'workflow_class' => InvoiceSyncWorkflow::class,
        'input' => ['hourly'],
        'execution_timeout_seconds' => 120,
        'run_timeout_seconds' => 60,
    ],
);
```

Створення та оновлення дії перевіряють тайм-аути PHP workflow за тими самими
правилами `StartOptions`, що й прямі запуски. Власний стартер не потрібен.

Змініть ліміти майбутніх запусків, оновивши дію:

```php
$schedule = ScheduleManager::update($schedule, action: [
    ...$schedule->action,
    'execution_timeout_seconds' => 240,
    'run_timeout_seconds' => 90,
]);
```

Дія замінюється повністю, тому зберігайте її клас workflow та вхідні дані,
як показано. Уже розпочаті запуски зберігають початкові кінцеві терміни.
Задайте полю тайм-ауту `null`, щоб прибрати ліміт із подальших запусків.

## Розширене планування {#advanced-scheduling}

Наступні розділи описують можливості, потрібні за межами простого cron: фіксовані інтервали, поєднання специфікацій cron та інтервалів і політики перекриття. Їх можна пропустити, якщо цих можливостей не потрібно.

### Розклади за інтервалом {#interval-based-schedules}

Окрім виразів cron, розклади підтримують спрацювання за інтервалом у синтаксисі тривалості ISO 8601. Використовуйте `ScheduleManager::createFromSpec()` для повного керування специфікацією:

```php
use Workflow\V2\Support\ScheduleManager;

$schedule = ScheduleManager::createFromSpec(
    scheduleId: 'health-check-30m',
    spec: [
        'intervals' => [
            ['every' => 'PT30M'],
        ],
    ],
    action: [
        'workflow_type' => 'health-check',
        'workflow_class' => HealthCheckWorkflow::class,
        'input' => ['region' => 'us-east-1'],
    ],
);
```

### Поля специфікації інтервалу {#interval-spec-fields}

| Поле | Тип | Опис |
|---|---|---|
| `every` | `string` | Тривалість ISO 8601, наприклад `PT30M` для 30 хвилин, `PT1H` для 1 години, `P1D` для 1 дня |
| `offset` | `string\|null` | Фазове зміщення у форматі тривалості ISO 8601, що зсуває точку вирівнювання інтервалу |

Параметр offset визначає момент спрацювання в циклі інтервалу. Наприклад, годинний інтервал зі зміщенням на 5 хвилин спрацьовує о `:05`, `:05+1h` тощо:

```php
$schedule = ScheduleManager::createFromSpec(
    scheduleId: 'offset-hourly',
    spec: [
        'intervals' => [
            ['every' => 'PT1H', 'offset' => 'PT5M'],
        ],
    ],
    action: [
        'workflow_type' => 'sync-workflow',
        'workflow_class' => SyncWorkflow::class,
        'input' => [],
    ],
);
```

### Поєднані специфікації cron та інтервалів {#mixed-cron-and-interval-specs}

Один розклад може поєднувати вирази cron та інтервали. Рушій обчислює всі специфікації й використовує найближчий час спрацювання:

```php
$schedule = ScheduleManager::createFromSpec(
    scheduleId: 'mixed-schedule',
    spec: [
        'cron_expressions' => ['0 12 * * *'],  // noon daily
        'intervals' => [['every' => 'PT6H']],  // every 6 hours
        'timezone' => 'America/Chicago',
    ],
    action: [
        'workflow_type' => 'report-workflow',
        'workflow_class' => ReportWorkflow::class,
        'input' => [],
    ],
);
```

Метод `createFromSpec` приймає ті самі параметри життєвого циклу, що й `create()` (`overlapPolicy`, `jitterSeconds`, `maxRuns`, `connection`, `queue`, `namespace` тощо), як окремі іменовані аргументи.

## Політики перекриття {#overlap-policies}

Якщо розклад спрацьовує, поки попередній запуск ще активний, поведінку визначає політика перекриття:

| Політика | Поведінка |
|---|---|
| `Skip` | Не починати новий запуск, типова поведінка |
| `BufferOne` | Буферизувати одне очікуване спрацювання, пропускаючи подальші до спорожнення буфера. На наступному `tick()` після завершення активного запуску буферизоване спрацювання виконується автоматично. |
| `BufferAll` | Буферизувати всі очікувані спрацювання без обмеження. Вони виконуються послідовно після завершення попередніх запусків. |
| `AllowAll` | Почати новий запуск незалежно від стану попереднього |
| `CancelOther` | Скасувати попередній запуск, а потім почати новий |
| `TerminateOther` | Примусово завершити попередній запуск, а потім почати новий |

## Керування розкладами {#managing-schedules}

### Призупинення й відновлення {#pause-and-resume}

```php
ScheduleManager::pause($schedule);

// The schedule will not trigger while paused.

ScheduleManager::resume($schedule);
// next_fire_at is recalculated from now.
```

### Оновлення {#update}

```php
ScheduleManager::update(
    $schedule,
    cronExpression: '30 3 * * *',
    timezone: 'America/Chicago',
    overlapPolicy: ScheduleOverlapPolicy::AllowAll,
    notes: 'Moved to 3:30 AM CT.',
);
```

Лише зміна специфікації (вирази cron, інтервали або часовий пояс) чи джитера перераховує `next_fire_at`. Інші оновлення зберігають його, тому не можуть пропустити належне спрацювання. Подія `ScheduleUpdated` перелічує в `changed_fields` лише поля, збережене значення яких змінилося.

Оновлення, яке нічого не змінює, не записує подію і зберігає `next_fire_at` разом із джитером. Для щойно завантаженого розкладу `wasChanged()` на повернутій моделі дорівнює `false`.

Зміна дії (тип workflow, аргументи, маршрутизація черги або тайм-аути) відкидає спрацювання, буферизовані за `BufferOne` або `BufferAll`, бо їх було захоплено для старої дії. Кожне відкинуте спрацювання записується як подія `ScheduleTriggerSkipped` з причиною `action_changed` і його `occurrence_time`.

### Видалення {#delete}

```php
ScheduleManager::delete($schedule);
```

Видалення є м’яким: запис залишається зі станом `deleted` і часовою міткою `deleted_at`. Видалений розклад не можна призупинити, відновити, оновити або запустити. Його ідентифікатор лишається зайнятим. Див. [Застосування з конфігурації](#apply-from-configuration).

### Застосування з конфігурації {#apply-from-configuration}

Інструменти розгортання можуть застосовувати ті самі визначення розкладів під час кожного розгортання. Створіть кожен розклад і оновіть його, якщо ідентифікатор уже зайнятий:

```php
use Workflow\V2\Exceptions\ScheduleAlreadyExistsException;
use Workflow\V2\Support\ScheduleManager;

try {
    ScheduleManager::create(
        scheduleId: 'daily-invoice-sync',
        workflowClass: InvoiceSyncWorkflow::class,
        cronExpression: '0 2 * * *',
        timezone: 'America/New_York',
    );
} catch (ScheduleAlreadyExistsException $e) {
    if ($e->existingStatus === 'deleted') {
        throw $e; // The id belonged to a deleted schedule. Pick a new id.
    }

    ScheduleManager::update(
        ScheduleManager::findByScheduleId($e->scheduleId, $e->namespace),
        cronExpression: '0 2 * * *',
        timezone: 'America/New_York',
    );
}
```

Повторне застосування незміненого визначення нічого не записує, тож його можна запускати під час кожного розгортання.

Ідентифікатори розкладів не можна використати повторно. Видалений розклад, зокрема видалений після вичерпання `max_runs`, зберігає свій ідентифікатор. Створення розкладу з цим ідентифікатором викидає `ScheduleAlreadyExistsException` з `existingStatus` `deleted`. Використайте новий ідентифікатор.

Нативний Server застосовує те саме правило: створення розкладу із зайнятим ідентифікатором повертає `409 schedule_already_exists`. Починаючи з нативного Server 3.6.0, повторне застосування незміненого розкладу також нічого не робить: подія `ScheduleUpdated` не записується, а `next_fire_at` зберігається. Результат відповіді й надалі `updated`. Версії нативного Server до 3.6.0 записують `ScheduleUpdated` і перераховують `next_fire_at` під час кожного оновлення, навіть незміненого.

### Опис {#describe}

```php
$description = ScheduleManager::describe($schedule);

$description->scheduleId;      // 'daily-invoice-sync'
$description->namespace;       // 'default'
$description->status;          // ScheduleStatus::Active
$description->spec;            // ['cron_expressions' => ['0 2 * * *'], 'timezone' => 'America/New_York']
$description->overlapPolicy;   // ScheduleOverlapPolicy::Skip
$description->firesCount;      // 47
$description->nextFireAt;      // DateTimeInterface|null
$description->lastFiredAt;     // DateTimeInterface|null
$description->latestInstanceId; // 'schedule:daily-invoice-sync:...'
$description->jitterSeconds;   // 0
$description->note;            // 'Runs every night at 2 AM ET.'
$description->toArray();       // full array representation
```

### Пошук за ID розкладу {#find-by-schedule-id}

```php
$schedule = ScheduleManager::findByScheduleId('daily-invoice-sync');
```

## Запуск розкладів {#triggering-schedules}

### Ручний запуск {#manual-trigger}

```php
$instanceId = ScheduleManager::trigger($schedule);
```

Цей виклик одразу перевіряє політику перекриття й, якщо дозволено, починає новий запуск workflow. Він повертає ID екземпляра розпочатого workflow або `null`, якщо спрацювання пропущено.

### Tick: перевірка всіх розкладів, час яких настав {#tick-evaluate-all-due-schedules}

```php
$results = ScheduleManager::tick();

// Returns rows with schedule_id, instance_id, outcome, occurrence_time,
// last_fired_at, and next_fire_at when those fields apply.
```

`tick()` запускає розклади, час яких настав, тобто активні розклади, чий `next_fire_at` уже минув. Кожен виклик запускає щонайбільше `$limit` із них (`tick(int $limit = 100)`), від найстаріших, розподіляючи їх по колу між namespace. Розклади понад ліміт, час яких настав, чекають наступного виклику. Поле `occurrence_time` містить час належного спрацювання, який побачив планувальник. Після кожного спрацювання `next_fire_at` переходить від поточного часу до наступного спрацювання cron або інтервалу.

### Політика пропущених спрацювань {#missed-fire-policy}

Поточна перевірка розкладів використовує семантику **одне спрацювання, потім звичайне продовження**. Якщо планувальник був недоступний протягом одного чи кількох запланованих моментів, перший tick після відновлення запускає один workflow для простроченого `next_fire_at`, записує цей час як `occurrence_time`, а потім визначає наступний `next_fire_at` від поточного часу. Інші моменти, що минули під час простою, пропускаються поточною перевіркою.

Те саме правило діє, коли планувальник працює, але не встигає. Розклад, що ще чекає на прохід, коли настає його наступний запланований момент, спрацьовує один раз і пропускає проміжні спрацювання. Див. [Розмір проходу та сплески](#pass-size-and-bursts).

Використовуйте `backfill()`, якщо потрібно виконати кожне пропущене спрацювання. Backfill явно перелічує спрацювання потрібного часового вікна й записує кожне окремо.

### Команда Artisan {#artisan-command}

Виконайте один tick із командного рядка:

```bash
php artisan workflow:v2:schedule-tick
php artisan workflow:v2:schedule-tick --json
php artisan workflow:v2:schedule-tick --limit=500
```

Для постійної перевірки розкладів викликайте цю команду з планувальника завдань Laravel:

```php
// app/Console/Kernel.php
$schedule->command('workflow:v2:schedule-tick')->everyMinute();
```

### Розмір проходу та сплески {#pass-size-and-bursts}

Кожен прохід `workflow:v2:schedule-tick` запускає щонайбільше `limit` розкладів,
час яких настав, і окремо обробляє щонайбільше `limit` буферизованих дій.
`limit` береться з параметра `--limit`, інакше з `workflows.v2.schedules.tick_limit`
(`DW_V2_SCHEDULE_TICK_LIMIT`), а типове значення — 100. Якщо значення не є
додатним цілим числом, команда завершується з помилкою, не перевіривши жодного
розкладу; інший розмір замість нього ніколи не підставляється. Налаштування й
параметр потребують Workflow 2.16.0 або новішої версії.

Обидві партії розподіляються по колу між namespace, від найстаріших, тож один
завантажений namespace не може затримати інший. Розклади понад `limit`, час яких
настав, і далі очікують запуску й обробляються наступним проходом. Якщо час `N`
розкладів настає одночасно, старіших розкладів, що чекають запуску, немає й кожен
запуск успішний, усі вони спрацьовують упродовж `ceil(N / limit)` проходів. За
щохвилинного рецепта останній запускається не пізніше ніж через
`ceil(N / limit) - 1` хвилин після першого. Задайте `limit` не меншим за
найбільший очікуваний сплеск.

Ця межа довша, якщо:

- запуск завершується помилкою: спрацювання залишається належним і повторюється
  на наступних проходах, тож розклад, що постійно завершується помилкою,
  займає слот, доки залишається найстарішим;
- розклади, час яких настав раніше, або нові розклади, час яких настає до
  завершення сплеску, вибираються першими;
- tick виконуються із запізненням або пропускаються.

За тривалого перевантаження розклад, що чекає довше за свій наступний
запланований момент, спрацьовує один раз і пропускає проміжні спрацювання, як
описано в розділі [Політика пропущених спрацювань](#missed-fire-policy).
Використовуйте `backfill()`, якщо ці спрацювання потрібно виконати.

Налаштуйте сповіщення за метриками оператора `schedules.missed`,
`schedules.oldest_overdue_at` і `schedules.max_overdue_ms`, а також за
зростанням `schedules.failures_total`.

:::note Оновлення застосунку, який опублікував конфігурацію до 2.16.0

Laravel об’єднує конфігурацію пакета з опублікованим файлом конфігурації
по одному ключу верхнього рівня. Застосунок, який опублікував
`config/workflows.php` до 2.16.0, зберігає власний масив `v2`, тому
`DW_V2_SCHEDULE_TICK_LIMIT` не зчитується: команда використовує 100 і
далі приймає `--limit`. Щоб використати це налаштування, повторно опублікуйте
файл конфігурації або додайте такий запис до масиву `v2` опублікованого файлу:

```php
'schedules' => [
    'tick_limit' => env('DW_V2_SCHEDULE_TICK_LIMIT', 100),
],
```

:::

### Нативний Server {#native-server}

Нативний Server 3.x сам перевіряє розклади, тому жодної команди не потрібно
ні запускати, ні планувати. Кожен процес Server виконує цикл обслуговування:
чекає 250 мс, потім обробляє до 100 буферизованих дій і запускає до 100
розкладів, час яких настав, упорядкованих за `next_fire_at`, а потім знову
чекає. Розмір партії фіксований; налаштування для нього немає. Проходи
розкладів між вузлами Server виконуються послідовно, тому додавання вузлів не
підвищує пропускну здатність. Сплеск із `N` розкладів, час яких настав,
спрацьовує впродовж `ceil(N / 100)` проходів у порядку настання.

Запуск, який Server відхиляє, записується як помилка, і розклад переходить до
наступного спрацювання, тож розклад, що завершується помилкою, не утримує свій
слот. Розклад, специфікацію якого не вдається обчислити, залишається належним
і повторюється на кожному проході. Команда `schedule:evaluate --limit`
замороженого PHP Server не застосовується до нативного Server.

## Максимальна кількість запусків {#max-runs}

Якщо задано `maxRuns`, розклад відстежує `remaining_actions`. Після останнього дозволеного спрацювання він автоматично м’яко видаляється.

```php
$schedule = ScheduleManager::create(
    scheduleId: 'one-shot-retry',
    workflowClass: RetryWorkflow::class,
    cronExpression: '*/5 * * * *',
    maxRuns: 3,
);

// After 3 triggers, the schedule status becomes 'deleted'.
```

## Backfill {#backfill}

Backfill запускає workflow для пропущених минулих спрацювань cron, наприклад через призупинення розкладу, збій розгортання або пізнє створення:

```php
$results = ScheduleManager::backfill(
    $schedule,
    from: new DateTimeImmutable('2026-04-10 00:00:00'),
    to: new DateTimeImmutable('2026-04-14 00:00:00'),
);

// Returns: [['schedule_id' => '...', 'instance_id' => '...|null', 'cron_time' => '...'], ...]
```

Кожне пропущене спрацювання cron запускається послідовно. Політика перекриття застосовується до кожного, з одним винятком: **політики буферизації (`BufferOne`, `BufferAll`) під час backfill трактуються як `AllowAll`**. Буферизація керує потоком у реальному часі й не має сенсу для надолуження минулих спрацювань. Backfill має запускати кожне пропущене спрацювання, а не залишати їх у буфері, який ніколи не спорожніє. Політику також можна явно перевизначити:

```php
$results = ScheduleManager::backfill(
    $schedule,
    from: new DateTimeImmutable('2026-04-10 00:00:00'),
    to: new DateTimeImmutable('2026-04-14 00:00:00'),
    overlapPolicyOverride: ScheduleOverlapPolicy::AllowAll,
);
```

Backfill дотримується `maxRuns`: якщо доступні дії розкладу вичерпано під час backfill, операція зупиняється, а розклад автоматично видаляється.

ID екземплярів backfill детерміновані: `schedule:{scheduleId}:backfill:{timestamp}`.

## Маршрутизація черг {#queue-routing}

Якщо в розкладі задано `connection` або `queue`, workflow відправляються до цього підключення й черги замість типових значень класу workflow:

```php
$schedule = ScheduleManager::create(
    scheduleId: 'priority-sync',
    workflowClass: InvoiceSyncWorkflow::class,
    cronExpression: '0 * * * *',
    connection: 'redis',
    queue: 'high-priority',
);

// Every triggered run dispatches to redis/high-priority,
// regardless of InvoiceSyncWorkflow's default routing.
```

Пріоритет маршрутизації: поля розкладу → типові значення класу workflow → глобальна конфігурація черги.

## Jitter {#jitter}

Коли кілька розкладів мають однаковий вираз cron, вони спрацьовують одночасно й створюють різкий сплеск навантаження. Параметр `jitterSeconds` розподіляє спрацювання у випадковому часовому вікні, згладжуючи навантаження.

```php
$schedule = ScheduleManager::create(
    scheduleId: 'hourly-report',
    workflowClass: ReportWorkflow::class,
    cronExpression: '0 * * * *',
    jitterSeconds: 300, // fire within 0–300 seconds after the top of the hour
);
```

Якщо задано `jitterSeconds`, кожен обчислений `next_fire_at` зсувається на випадкове значення від 0 до `jitterSeconds` включно. Jitter обирається заново під час кожного обчислення наступного спрацювання: після запуску, відновлення або оновлення.

Jitter застосовується лише до часу спрацювання tick, збереженого в базі даних. Перелік backfill завжди використовує канонічні моменти cron без jitter, щоб спрацювання відповідали точним межам cron.

Значення `0` для `jitterSeconds`, яке є типовим, повністю вимикає jitter. Час спрацювання точно відповідає cron.

## Типи подій історії {#history-event-types}

Події життєвого циклу розкладу записуються у два окремі потоки:

- **Походження запуску workflow.** Коли розклад запускає workflow, до історії
  розпочатого запуску (`workflow_history_events`) додається `ScheduleTriggered`.
  Це дає запуску перевірюваний зв’язок із розкладом, який його створив.
- **Потік аудиту розкладу.** Кожен перехід життєвого циклу розкладу
  записується в його журнал аудиту (`workflow_schedule_history_events`)
  із монотонно зростаючим `sequence`. Потік аудиту є джерелом істини щодо
  того, що сталося з розкладом, а історія запуску — щодо причини його старту.

Обидва потоки використовують той самий enum `HistoryEventType` і реєстр
ключів даних `HistoryEventPayloadContract`, тому назви подій та структури
даних залишаються узгодженими між потоками.

### Подія походження в розпочатому запуску workflow {#run-lineage-event-on-the-started-workflow-run}

`ScheduleTriggered` додається до історії запущеного workflow з такими
ключами даних:

- `schedule_id` — ідентифікатор розкладу для користувача.
- `schedule_ulid` — внутрішній первинний ключ ULID розкладу.
- `cron_expression`, `timezone`, `overlap_policy` — основний вираз cron,
  часовий пояс IANA та активна політика перекриття розкладу на момент
  спрацювання.
- `trigger_number` — номер спрацювання, починаючи з 1.
- `occurrence_time` — час спрацювання розкладу, який перевірив планувальник.
  Спрацювання tick записують належний `next_fire_at`, а backfill —
  перелічений момент backfill. За ввімкненого jitter значення tick
  включає час зі зсувом jitter, збережений у розкладі.

### Потік аудиту самого розкладу {#schedule-audit-stream-on-the-schedule-itself}

Кожен перехід життєвого циклу розкладу записується у власний потік аудиту.
Нумерація починається з `1` для `ScheduleCreated` і монотонно зростає
окремо для кожного розкладу.

| Подія | Коли записується | Ключі даних |
| --- | --- | --- |
| `ScheduleCreated` | Розклад створено | `spec`, `action`, `overlap_policy`, `next_fire_at`, `command_context` |
| `SchedulePaused` | Розклад призупинено | `reason`, `paused_at`, `command_context` |
| `ScheduleResumed` | Розклад відновлено | `next_fire_at`, `command_context` |
| `ScheduleUpdated` | Змінено cron, часовий пояс, специфікацію, дію або політику розкладу | `changed_fields`, `spec`, `action`, `overlap_policy`, `next_fire_at`, `command_context` |
| `ScheduleTriggered` | Розклад почав запуск workflow | `workflow_instance_id`, `workflow_run_id`, `outcome`, `effective_overlap_policy`, `trigger_number`, `occurrence_time`, `command_context` |
| `ScheduleTriggerSkipped` | Спрацювання пропущено через політику перекриття, недопустимий стан або вичерпані дії | `reason`, `skipped_trigger_count`, `last_skipped_at`, `occurrence_time`, `command_context` |
| `ScheduleDeleted` | Розклад м’яко видалено явним викликом або через вичерпання `max_runs` (`reason: max_runs_exhausted`) | `reason`, `deleted_at`, `command_context` |

`command_context` містить суб’єкта, ID запиту, джерело й причину, які записує
`ScheduleManager`, коли ініціатор передає `CommandContext`. Він необов’язковий.
Події без контексту не містять цього ключа замість запису порожнього значення.

### Стабільність контракту даних {#payload-contract-stability}

Ключі даних обох наведених таблиць оголошено в
`Workflow\V2\Support\HistoryEventPayloadContract`. Вони перевіряються
під час кожного запису й зафіксовані тестами пакета workflow. Додавання
ключа до будь-якої події розкладу змінює формат передавання й дотримується
правил зміни подій історії з
[контракту сумісності версій](../compatibility.md).

### Зберігання {#retention}

Потік аудиту зберігається протягом життя запису розкладу. М’яке видалення
розкладу записує кінцеву подію `ScheduleDeleted`. Самі записи аудиту
не видаляються каскадно під час видалення запису розкладу. Оператори, які
остаточно очищають історичні розклади, мають обрати явну стратегію зберігання
для свого розгортання. Пакет не містить вбудованого TTL подій аудиту.

### Видимість {#visibility}

Потік аудиту доступний через усі інтерфейси оператора:

- **У процесі (Eloquent).** `WorkflowSchedule::historyEvents()`
  (отриманий через `ConfiguredV2Models::query(
  'schedule_history_event_model', ...)`) повертає потік розкладу
  всередині основного застосунку.
- **Waterline HTTP.**
  `GET /waterline/api/v2/schedules/{scheduleId}/history` повертає потік
  із `limit` (1–500, типово 100) та курсорною пагінацією `after_sequence`.
  Відповідь обмежена namespace Waterline, тому багатоклієнтські розгортання
  бачать лише записи аудиту свого клієнта.
- **Waterline UI.** Дія **History** у кожному рядку реєстру розкладів
  Waterline відкриває модальне вікно з потоком цього розкладу. Події
  показують номер послідовності, час запису, тип, пов’язані ID екземпляра
  workflow і запуску та відформатовані дані. Кнопка **Load more**
  пересуває курсор порціями по 100.
- **HTTP окремого сервера.**
  `GET /api/schedules/{scheduleId}/history` повертає той самий потік
  із тим самим контрактом пагінації та правилами обмеження `X-Namespace`.
  Історія залишається доступною після м’якого видалення розкладу,
  оскільки оператори використовують аудит для відновлення відомостей
  про видалений розклад.
- **CLI.** `dw schedule:history <schedule-id>` друкує потік таблицею
  (`Seq`, `Event`, `Recorded At`, `Workflow Refs`) із підказкою
  **More events available**, коли `has_more` має значення true.
  `--limit` та `--after-sequence` передаються серверній кінцевій точці,
  `--all` проходить усі події, що залишилися, сторінками, а
  `--output=json` / `--output=jsonl` повертають структурований результат.
  `jsonl` відкидає конверт курсора, тому кожен рядок є самостійною подією.
- **Python SDK.** `Client.get_schedule_history(schedule_id, *, limit=None,
  after_sequence=None)` повертає одну `ScheduleHistoryPage`, а
  `Client.iter_schedule_history(schedule_id, *, limit=None, after_sequence=None)`
  є `AsyncIterator[ScheduleHistoryEvent]`, який проходить весь потік
  сторінками з тими самими іменованими аргументами. `ScheduleHandle`
  надає відповідні зручні методи `.history(...)` та `.iter_history(...)`.
  Сервер обмежує `limit` діапазоном від 1 до 500 (типово 100).
  `after_sequence` — невід’ємний курсор із `next_cursor` попередньої сторінки.

Усі ці інтерфейси читають ту саму таблицю `workflow_schedule_history_events`.
Контракт ключів із розділу
[Стабільність контракту даних](#payload-contract-stability) діє незалежно
від обраного оператором інтерфейсу.

### Міграція розкладів, створених до аудиту {#migration-behavior-for-pre-audit-schedules}

Потік аудиту розкладів з’явився разом із таблицею
`workflow_schedule_history_events`. Розклади, створені до цієї міграції,
не отримують ретроспективної події `ScheduleCreated`. `ScheduleManager`
записує аудит лише під час переходів життєвого циклу, а міграція
не створює штучних подій для наявних розкладів.

Що це означає для операторів:

- Потік наявного розкладу порожній до наступного переходу його життєвого
  циклу. Призупинення, відновлення, оновлення, запуск, пропуск спрацювання
  або видалення розкладу відтоді додають події звичайним способом.
- Нумерація й далі починається з `1` і монотонно зростає для кожного
  розкладу. Якщо перша записана подія наявного розкладу — `SchedulePaused`,
  її запис матиме `sequence = 1`. Відсутність попередньої
  `ScheduleCreated` є очікуваною.
- `ScheduleTriggered` та `ScheduleTriggerSkipped` записуються за кожної
  перевірки розкладу tick. Тому розклад, який спрацьовує за cron після
  міграції, накопичує аудит без втручання оператора.
- Оператору не потрібно окремо вмикати аудит розкладу. Потік завжди
  ввімкнений, але не містить записів до першої події після міграції.

## Відстеження пропусків {#skip-tracking}

Коли спрацювання пропущено через політику перекриття, недопустимий стан або вичерпані дії, розклад записує пропуск:

- `last_skip_reason` — причина останнього пропущеного спрацювання, наприклад `overlap_policy_skip`, `status_not_triggerable`, `remaining_actions_exhausted`
- `last_skipped_at` — час пропуску
- `skipped_trigger_count` — сумарна кількість пропущених спрацювань

Ці поля входять до `ScheduleManager::describe()` та API деталей розкладу Waterline.

## Обмеження namespace {#namespace-scoping}

Розклад належить namespace. Якщо `namespace` передано до `create()` або `createFromSpec()`, розклад обмежений ним. Якщо параметр пропущено, розклад успадковує налаштований `workflows.v2.namespace`, типово `'default'`.

ID розкладів унікальні в межах namespace. Той самий `scheduleId` може існувати в різних namespace без конфлікту.

Стандартний PHP-стартер розкладів передає збережений namespace розкладу
до екземпляра workflow, запуску й стійких завдань. Подальша зміна типового
namespace застосунку не переносить виконання наявного розкладу. Для цього
поширення namespace використовуйте Workflow 2.4.2 або новіший.

```php
$schedule = ScheduleManager::create(
    scheduleId: 'daily-sync',
    workflowClass: SyncWorkflow::class,
    cronExpression: '0 2 * * *',
    namespace: 'billing',
);

// Find by schedule ID within a namespace:
$found = ScheduleManager::findByScheduleId('daily-sync', namespace: 'billing');
```

Якщо для Waterline налаштовано namespace (`waterline.namespace`), кінцеві точки списку й деталей розкладів автоматично обмежуються ним. Тому багатоклієнтські розгортання показують лише розклади namespace оператора.

## База даних {#database}

Таблицю розкладів (`workflow_schedules`) створює міграція `2026_04_14_000157`. Клас моделі налаштовується через `workflows.v2.schedule_model`.

Якщо розгортання виконує міграції пакета разом із міграціями застосунку, міграція 157 виявляє наявну таблицю `workflow_schedules` і обробляє її так: таблиця, яка вже відповідає схемі пакета, залишається без змін. Якщо її створила попередня допоміжна міграція з іншою схемою, таблиця замінюється.
