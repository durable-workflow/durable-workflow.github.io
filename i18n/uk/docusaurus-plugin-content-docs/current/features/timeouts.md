---
sidebar_position: 19
---

# Тайм-аути {#timeouts}

Тайм-аути рівня workflow обмежують допустиму тривалість його виконання. Є два рівні обмеження:

- **Тайм-аут виконання** — обмежує загальний календарний час усіх запусків екземпляра workflow, включно з переходами continue-as-new. Кінцевий термін обчислюється один раз під час старту й переноситься без змін.
- **Тайм-аут запуску** — обмежує окремий запуск. Кінцевий термін перераховується на початку кожного нового запуску, зокрема після continue-as-new.

Обидва тайм-аути необов’язкові й можуть застосовуватися разом.

## Налаштування {#configuration}

Тайм-аути налаштовуються через `StartOptions` під час запуску workflow:

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class, 'order-123');

$workflow->start(
    $orderId,
    StartOptions::rejectDuplicate()
        ->withExecutionTimeout(7200)   // 2 hours across all runs
        ->withRunTimeout(3600),        // 1 hour per run
);
```

### Тайм-аут виконання {#execution-timeout}

Тайм-аут виконання охоплює весь екземпляр workflow. Якщо workflow використовує continue-as-new, кінцевий термін залишається однаковим для всіх запусків у ланцюжку.

```php
StartOptions::rejectDuplicate()->withExecutionTimeout(86400); // 24 hours
```

Значення тайм-ауту зберігається в моделі `WorkflowInstance`, а обчислений кінцевий термін фіксується в кожному `WorkflowRun`.

### Тайм-аут запуску {#run-timeout}

Тайм-аут запуску діє на один запуск. Після continue-as-new новий запуск отримує новий кінцевий термін: поточний час плюс налаштований тайм-аут запуску.

```php
StartOptions::rejectDuplicate()->withRunTimeout(1800); // 30 minutes per run
```

### Перевірка значень {#validation}

Значення тайм-ауту має становити щонайменше 1 секунду. Нульове або від’ємне значення спричиняє `LogicException`:

```php
// Throws LogicException: "Workflow v2 execution timeout must be at least 1 second."
StartOptions::rejectDuplicate()->withExecutionTimeout(0);
```

### Площина керування {#control-plane}

Тайм-аути також можна задати під час запуску workflow через площину керування:

```php
$controlPlane->start('my-app.order-workflow', 'order-123', [
    'execution_timeout_seconds' => 7200,
    'run_timeout_seconds' => 3600,
]);
```

Відповідь `describe` містить поля тайм-аутів і кінцевих термінів:

```php
$description = $controlPlane->describe('order-123');

$description['execution_timeout_seconds']; // 7200
$description['run']['run_timeout_seconds']; // 3600
$description['run']['execution_deadline_at']; // ISO 8601 timestamp
$description['run']['run_deadline_at'];       // ISO 8601 timestamp
```

### Waterline {#waterline}

Якщо тайм-аути налаштовано, детальний перегляд запуску у Waterline показує їхню тривалість та обчислені кінцеві терміни.

### Історія {#history}

Дані події історії `WorkflowStarted` містять поля тайм-аутів і кінцевих термінів, якщо їх налаштовано:

```json
{
    "execution_timeout_seconds": 7200,
    "run_timeout_seconds": 3600,
    "execution_deadline_at": "2026-04-12T14:00:00+00:00",
    "run_deadline_at": "2026-04-12T13:00:00+00:00"
}
```

### Continue-as-new {#continue-as-new}

Під час continue-as-new:

- **Кінцевий термін виконання** переноситься з попереднього запуску без змін.
- Значення **тайм-ауту запуску** переноситься, але **кінцевий термін запуску** перераховується від поточного часу.

Отже, тайм-аут виконання завжди відлічується від початкового старту, а кожен новий запуск отримує власне нове часове вікно.

## Застосування тайм-аутів {#enforcement}

Тайм-аути рівня workflow перевіряються у двох місцях:

1. **На початку завдання workflow** — кожне завдання workflow перевіряє `deadlineExpired()` перед виконанням workflow. Якщо кінцевий термін минув, запуск одразу завершується через тайм-аут.
2. **Через TaskWatchdog** — watchdog шукає незавершені запуски, у яких минув кінцевий термін виконання або запуску, але немає відкритого завдання workflow. Для такого запуску він створює й відправляє завдання workflow про прострочений термін. Тайм-аут застосовується під час наступного виконання завдання.

Коли спрацьовує тайм-аут, рушій:

- Скасовує всі відкриті завдання (activity, timer, workflow), крім поточного
- Скасовує всі відкриті виконання activity, записуючи події історії `ActivityCancelled`
- Скасовує всі очікувані timer, записуючи події історії `TimerCancelled`
- Записує `WorkflowFailure` із `failure_category = timeout` та `WorkflowTimeoutException`
- Записує термінальну подію історії `WorkflowTimedOut`, де `timeout_kind` має значення `execution_timeout` або `run_timeout`
- Застосовує політику закриття батьківського workflow до всіх відкритих дочірніх workflow
- Сповіщає батьківські workflow, якщо це був дочірній запуск

Запис помилки містить клас винятку `Workflow\V2\Exceptions\WorkflowTimeoutException`, а також `timeout_kind` і часову мітку кінцевого терміну для програмної перевірки.

## Тайм-аути activity {#activity-timeouts}

Тайм-аути activity обмежують допустиму тривалість окремих виконань activity. Є чотири типи тайм-аутів:

- **Schedule-to-start** — обмежує час від планування до першого отримання завдання worker. Діє, поки activity має стан `Pending`.
- **Start-to-close** — обмежує час від отримання activity worker до її завершення. Починається заново для кожної повторної спроби.
- **Schedule-to-close** — обмежує загальний календарний час від планування до завершення для всіх повторних спроб. Цей тайм-аут завжди термінальний: повторна спроба не допоможе, оскільки загальний кінцевий термін уже минув.
- **Heartbeat** — обмежує час між heartbeat. Для тривалих activity, які викликають `$this->heartbeat()`, рушій вимагає heartbeat протягом налаштованого інтервалу. Інакше activity вважається такою, що не відповідає.

Усі тайм-аути необов’язкові й можуть застосовуватися разом. Налаштовуйте їх через `ActivityOptions` під час виклику activity:

```php
use function Workflow\V2\activity;
use Workflow\V2\Support\ActivityOptions;

$result = activity(
    LongRunningActivity::class,
    new ActivityOptions(
        scheduleToStartTimeout: 30,     // must be claimed within 30s
        startToCloseTimeout: 300,       // each attempt has 5 minutes
        scheduleToCloseTimeout: 600,    // total 10 minutes across all retries
        heartbeatTimeout: 15,           // must heartbeat every 15 seconds
        maxAttempts: 3,
    ),
    $input,
);
```

### Тайм-аут schedule-to-start {#schedule-to-start-timeout}

Кінцевий термін обчислюється під час планування activity. Якщо до цього терміну жоден worker не отримає activity, `TaskWatchdog` застосовує тайм-аут. Якщо повторні спроби ще доступні, нове завдання activity планується із зафіксованою затримкою, а кінцевий термін schedule-to-start перераховується від моменту доступності повторної спроби. Кожна спроба отримує нове часове вікно. Якщо `scheduleToStartTimeout` не налаштовано, під час повторної спроби кінцевий термін очищається. Коли всі спроби вичерпано, записується термінальна подія історії `ActivityTimedOut` і workflow пробуджується.

### Тайм-аут start-to-close {#start-to-close-timeout}

Кінцевий термін обчислюється, коли worker отримує завдання activity. Кожна повторна спроба отримує новий кінцевий термін start-to-close. Якщо activity не завершиться вчасно, поточна спроба закривається. За наявності повторних спроб виконання повертається до стану `Pending` з новим кінцевим терміном schedule-to-start, якщо його налаштовано. Це запобігає негайному повторному тайм-ауту завдання. Якщо всі спроби вичерпано, записується термінальний тайм-аут.

### Тайм-аут schedule-to-close {#schedule-to-close-timeout}

Кінцевий термін обчислюється один раз під час планування й ніколи не починається заново. Коли він спливає, activity одразу завершується термінальною помилкою, навіть якщо повторні спроби ще доступні, адже загальний допустимий календарний час минув. Це обмежує загальну вартість нестабільної activity, яка інакше могла б повторюватися нескінченно в межах тайм-аутів окремих спроб.

### Тайм-аут heartbeat {#heartbeat-timeout}

Початковий кінцевий термін обчислюється, коли worker отримує завдання activity. Кожен успішний виклик `$this->heartbeat()` продовжує термін на налаштований інтервал. Якщо activity не викличе `heartbeat()` до спливу терміну, рушій вважає, що worker не відповідає. За наявності повторних спроб планується нова спроба з новим кінцевим терміном schedule-to-start, якщо його налаштовано. Інакше записується термінальний тайм-аут.

```php
use Workflow\V2\Activity;

class LongRunningActivity extends Activity
{
    public function handle($input)
    {
        foreach ($items as $item) {
            $this->heartbeat(['processed' => $count]);
            // ... process item ...
        }
    }
}
```

### Застосування тайм-аутів {#enforcement-1}

`TaskWatchdog` застосовує тайм-аути activity під час кожного проходу циклу worker. Він шукає виконання з простроченими значеннями у стовпцях кінцевих термінів і передає їх `ActivityTimeoutEnforcer`. Кожне застосування записує:

- Термінальну подію історії `ActivityTimedOut`, де `timeout_kind` має значення `schedule_to_start`, `start_to_close`, `schedule_to_close` або `heartbeat`
- Запис `WorkflowFailure` із `failure_category = timeout` та `propagation_kind = timeout`
- Завдання відновлення workflow, яке пробуджує батьківський workflow, щоб він міг отримати помилку

У детальному перегляді activity Waterline показує політику повторних спроб із усіма налаштованими типами тайм-аутів. Хронологія показує тип тайм-ауту в повідомленні події про тайм-аут activity.

### Що ще не реалізовано {#what-is-not-yet-covered}

Наведені нижче можливості заплановано, але ще не реалізовано:

- Політики повторних спроб на рівні workflow

### Структурні обмеження {#structural-limits}

Рушій застосовує типізовані помилки структурних обмежень для розміру даних, кількості очікуваних паралельних операцій і максимального розміру метаданих. Повний контракт обмежень, налаштування та класифікацію помилок наведено в розділі [Структурні обмеження](../constraints/structural-limits.md).
