---
sidebar_position: 1
---

# Публікація налаштувань {#publishing-config}

Це створить файл налаштувань `workflows.php` у каталозі `config`.

```bash
php artisan vendor:publish --provider="Workflow\Providers\WorkflowServiceProvider" --tag="config"
```

## Lease для workflow task (v2) {#workflow-task-lease-v2}

Задайте lease для вбудованих workflow task додатним цілим числом секунд:

```env
DW_V2_WORKFLOW_TASK_LEASE_SECONDS=300
```

Це відповідає `workflows.v2.workflow_task_lease_seconds` у `config/workflows.php` із типовим значенням `300`. Отримання task і поновлення читають чинну конфігурацію. Нуль не вимикає lease. Після зміни конфігурації розгортання оновіть кеш конфігурації та перезапустіть тривалі worker-процеси.

Server натомість використовує `DW_WORKFLOW_TASK_TIMEOUT` і відображає це значення на налаштування пакета. Цей lease відновлення відокремлений від дедлайнів activity та workflow. Дивіться [Lease для workflow task](../features/timeouts.md#workflow-task-lease).

## Зміна каталогу workflow {#changing-workflows-folder}

За замовчуванням команди `make` записують файли до каталогу `app/Workflows`.

```php
php artisan make:workflow MyWorkflow
php artisan make:activity MyActivity
```

Це можна змінити налаштуванням `workflows_folder`.

```php
'workflows_folder' => 'Workflows',
```

## Використання власних моделей у застарілій v1 {#using-custom-models-legacy-v1}

:::note Застаріла версія

Ключі `stored_workflow_*` налаштовують класи v1 `Workflow\Models\StoredWorkflow*`.
Workflow v2 використовує наведені нижче перевизначення стійких моделей:
`instance_model`, `run_model`, `task_model` тощо. Зберігайте ключі v1 лише тоді,
коли під час міграції ще виконуєте workflow v1.

:::

В опублікованому файлі `workflows.php` можна замінити класи моделей v1 власними
підкласами.

```php
'stored_workflow_model' => App\Models\StoredWorkflow::class,

'stored_workflow_exception_model' => App\Models\StoredWorkflowException::class,

'stored_workflow_log_model' => App\Models\StoredWorkflowLog::class,

'stored_workflow_signal_model' => App\Models\StoredWorkflowSignal::class,

'stored_workflow_timer_model' => App\Models\StoredWorkflowTimer::class,
```

## Перевизначення моделей v2 {#using-model-overrides-v2}

Середовище виконання також надає перевизначення моделей для таблиць стійких
екземплярів, запусків, завдань, історії та проєкцій:

```php
'v2' => [
    'instance_model' => App\Models\WorkflowInstance::class,
    'run_model' => App\Models\WorkflowRun::class,
    'task_model' => App\Models\WorkflowTask::class,
    'history_event_model' => App\Models\WorkflowHistoryEvent::class,
    'run_summary_model' => App\Models\WorkflowRunSummary::class,
    'run_wait_model' => App\Models\WorkflowRunWait::class,
    'run_timeline_entry_model' => App\Models\WorkflowTimelineEntry::class,
    'run_timer_entry_model' => App\Models\WorkflowRunTimerEntry::class,
    'run_lineage_entry_model' => App\Models\WorkflowRunLineageEntry::class,
],
```

Ці перевизначення впливають не лише на читання чи відновлення проєкцій.
`WorkflowStub::make()`, `load()`, `loadSelection()`, резервування екземпляра,
вибір запуску та виконання завдань workflow використовують налаштовані
`instance_model`, `run_model` і `task_model`. Деталі Waterline та експорт історії
читають через ті самі класи. Отже, одне перевизначення на рівні застосунку
керує як основним шляхом середовища виконання, так і операторським читанням.

Зберігайте схему власних підкласів сумісною з вбудованими моделями. Якщо підклас
також змінює назви таблиць чи інші домовленості Eloquent, які моделі пакета
зазвичай визначають автоматично, перевизначте відповідні зв’язки, щоб
`currentRun()`, `runs()` та подібні запити залишалися узгодженими з вашою схемою.

Дивіться [матрицю налаштування](./customization-matrix.md) для зафіксованого
контракту підтримки v2: які перевизначення безпечні як успадковані підкласи,
які потребують явного перевизначення зв’язків і як узгоджуються серіалізація,
репозиторій, стан, імпорт, міграція та поведінка запису.

## Кодек даних {#payload-codec}

v2 використовує `avro` для даних нових workflow:

```php
'serializer' => 'avro',
```

- **`avro`** (типовий, обов’язковий для нових workflow v2) — бінарне кодування
  Apache Avro. Компактне під час передавання й зберігання, із швидшим
  кодуванням/декодуванням великих даних, ніж застарілий серіалізатор PHP.

Якщо опубліковані налаштування v1 ще містять `serializer`, фінальна v2 читає це
значення для діагностики `workflow:v2:doctor`, але нові дані v2 все одно
використовують Avro.

### Застарілі кодеки лише для міграції v1 {#legacy-codecs-v1-migration-only}

Два кодеки лише для PHP залишаються доступними для читання історії v1 під час міграції:

- `workflow-serializer-y` — PHP `SerializableClosure` з екрануванням байтів
  (типовий у v1).
- `workflow-serializer-base64` — PHP `SerializableClosure` з кодуванням base64.

Налаштування `serializer` на застарілий кодек буде позначено командою
`php artisan workflow:v2:doctor`. Нові workflow v2 усе одно використовують Avro.
Зберігайте застарілий кодек лише під час завершення чи імпорту запусків v1,
що потребують нативного декодування даних PHP.

Внутрішній засіб читання для імпорту/завершення v1 розпізнає застарілі повні
назви класів, наприклад `Workflow\Serializers\Y::class`. Це не публічні псевдоніми
кодеків v2, і новий запуск v2 чи SDK не може їх обрати.

## Маркери сумісності {#compatibility-markers}

Середовище виконання може позначати кожен новий запуск маркером сумісності,
а worker — оголошувати маркери, які вони можуть безпечно виконувати. Цей захист
залишає тривалі запуски на сумісних збірках під час запланованих оновлень worker.

Задайте маркер для нових запусків поточної збірки:

```env
DW_V2_CURRENT_COMPATIBILITY=build-2026-04
```

За потреби дозвольте worker приймати кілька маркерів під час оновлення:

```env
DW_V2_SUPPORTED_COMPATIBILITIES=build-2026-04,build-2026-03
```

Налаштуйте, як довго знімок heartbeat одного worker залишається видимим в огляді
worker на основі бази даних:

```env
DW_V2_COMPATIBILITY_HEARTBEAT_TTL=30
```

За потреби обмежте огляд одним застосунком чи простором імен розгортання,
якщо кілька застосунків використовують спільну базу даних workflow:

```env
DW_V2_COMPATIBILITY_NAMESPACE=sample-app
```

Опубліковані налаштування `workflows.php` пов’язують ці значення так:

```php
'v2' => [
    'compatibility' => [
        'current' => env('DW_V2_CURRENT_COMPATIBILITY'),
        'supported' => env('DW_V2_SUPPORTED_COMPATIBILITIES'),
        'namespace' => env('DW_V2_COMPATIBILITY_NAMESPACE'),
        'heartbeat_ttl_seconds' => (int) env('DW_V2_COMPATIBILITY_HEARTBEAT_TTL', 30),
    ],
],
```

Якщо `supported` не задано, worker типово використовують єдиний маркер `current`.
Старі рядки завдань і зведень запусків, створені до появи маркерів сумісності
завдань, доповнюються маркером запуску під час міграції та, за потреби, знову
під час отримання чи відновлення в середовищі виконання. Завдання й запуски,
що справді ніде не мають маркера, залишаються доступними будь-якому worker.

Резервна поведінка `getVersion()` віддає перевагу `workflow_definition_fingerprint`
на момент старту запуску, коли відтворення доходить до нової точки розгалуження,
що ще не має типізованої події `VersionMarkerRecorded`. Це дозволяє запуску з
тією самою сумісністю зберегти гілку `DEFAULT_VERSION`, коли він явно почався
на старішому визначенні workflow. Старі запуски, історія `WorkflowStarted` яких
передує знімку відбитка, використовують маркер сумісності на момент старту та
перевірки зайнятої послідовності. Тому продовжуйте змінювати
`DW_V2_CURRENT_COMPATIBILITY` для хвиль розгортання нового версіонованого коду
workflow та тимчасово вказуйте старий і новий маркери в
`DW_V2_SUPPORTED_COMPATIBILITIES`, поки старі worker завершують роботу.

Кожен worker черги також записує до бази даних знімок heartbeat сумісності під
час `Looping` та обробки завдань. Waterline й засоби деталей показують огляд
локальної збірки (`compatibility_supported`, `compatibility_reason`) та всього
набору worker (`compatibility_namespace`, `compatibility_supported_in_fleet`,
`compatibility_fleet_reason`, `compatibility_fleet`). Коли задано
`DW_V2_COMPATIBILITY_NAMESPACE`, рядки heartbeat у базі даних мають відповідати
цьому простору імен. Кожен знімок повідомляє власний `namespace` разом із
`worker_id`, областю черг, підтримуваними маркерами та `source = database`.
Під час поступового оновлення цей огляд також читає старий формат heartbeat
з кешу для worker, які ще не перезапустилися на нову таблицю знімків. Такі
застарілі рядки кешу залишаються видимими як резервний варіант оновлення навіть
за налаштованого простору імен, але показують `namespace = null`, доки старі
worker не перезапустяться на шлях знімків із простором імен. Отже, сувора
ізоляція просторів імен стає повною лише після переходу всіх worker на heartbeat
у базі даних. Відновлення на рівні транспорту, наприклад повторне надсилання
простроченого завдання чи створення відсутнього, більше не залежить від здатності
worker, який сканує завдання, виконати це завдання. Лише остаточне отримання залишається
обмеженим сумісністю.

Коли відкрите завдання вже існує, але ані поточна збірка, ані активні знімки
heartbeat worker не оголошують його маркер, запуск показує очікування сумісного
worker замість хибного стану `repair_needed` на цій збірці.

## Бюджети історії {#history-budgets}

Waterline використовує проєкцію зведення запуску для повідомлення розміру
типізованої історії обраного запуску. Ці пороги визначають, коли проєкція
вмикає `continue_as_new_recommended`:

```env
DW_V2_CONTINUE_AS_NEW_EVENT_THRESHOLD=10000
DW_V2_CONTINUE_AS_NEW_SIZE_BYTES_THRESHOLD=5242880
```

Опублікована конфігурація `workflows.php` зіставляє ці значення тут:

```php
'v2' => [
    'history_budget' => [
        'continue_as_new_event_threshold' => (int) env('DW_V2_CONTINUE_AS_NEW_EVENT_THRESHOLD', 10000),
        'continue_as_new_size_bytes_threshold' => (int) env('DW_V2_CONTINUE_AS_NEW_SIZE_BYTES_THRESHOLD', 5242880),
    ],
],
```

Задайте будь-якому порогу `0`, щоб вимкнути відповідну частину рекомендації.
Прапорець дорадчий. Використовуйте його для планування меж `continueAsNew()`
до зростання вартості відтворення, не змінюючи поведінки обраного запуску.

## Політика очікування update {#update-wait-policy}

API update з очікуванням завершення, як-от `attemptUpdate()`, маршрути webhook
для update та елементи керування update у Waterline, очікують лише в межах
обмеженого бюджету, після чого повертають життєвий цикл усе ще прийнятого update.
Налаштуйте типовий бюджет тут:

```env
DW_V2_UPDATE_WAIT_COMPLETION_TIMEOUT_SECONDS=10
DW_V2_UPDATE_WAIT_POLL_INTERVAL_MS=50
```

Опублікована конфігурація `workflows.php` зіставляє ці значення тут:

```php
'v2' => [
    'update_wait' => [
        'completion_timeout_seconds' => (int) env('DW_V2_UPDATE_WAIT_COMPLETION_TIMEOUT_SECONDS', 10),
        'poll_interval_milliseconds' => (int) env('DW_V2_UPDATE_WAIT_POLL_INTERVAL_MS', 50),
    ],
],
```

`completion_timeout_seconds` визначає, як довго `attemptUpdate*` та HTTP-очікування
завершення намагаються отримати результат, застосований worker, до повернення
прийнятого життєвого циклу замість нескінченного блокування.
`poll_interval_milliseconds` лише налаштовує частоту перевірки викликачем
стійкого рядка update під час очікування. Він не змінює порядок виконання worker
чи поведінку відтворення. Операторські метрики Waterline показують активні
значення `update_wait` поруч із політикою відновлення, щоб оператори бачили
дієві типові налаштування без відкривання файлів.

## Приховування даних експорту історії {#history-export-redaction}

Експорт історії навмисно містить збережені дані workflow, команд, activity,
update, завдань та помилок, бо налагодження відтворення й передавання архіву
потребують стійких фактів. Якщо такі файли можуть залишити захищене середовище,
налаштуйте засіб приховування даних перед широким відкриттям точки експорту
чи виведення CLI.

Створіть засіб приховування даних, який реалізує
`Workflow\V2\Contracts\HistoryExportRedactor`:

```php
namespace App\Support;

use Workflow\V2\Contracts\HistoryExportRedactor;

final class WorkflowHistoryExportRedactor implements HistoryExportRedactor
{
    public function redact(mixed $value, array $context): mixed
    {
        return [
            'redacted' => true,
            'path' => $context['path'],
        ];
    }
}
```

Потім зареєструйте його в `config/workflows.php`:

```php
'v2' => [
    'history_export' => [
        'redactor' => App\Support\WorkflowHistoryExportRedactor::class,
        'signing_key' => env('DW_V2_HISTORY_EXPORT_SIGNING_KEY'),
        'signing_key_id' => env('DW_V2_HISTORY_EXPORT_SIGNING_KEY_ID'),
    ],
],
```

Засіб отримує поточне значення та контекст, зокрема `path`, `category`,
`workflow_instance_id`, `workflow_run_id` та `workflow_type`. Експорт викликає
його для аргументів/результатів workflow, даних подій історії, даних/контексту
команд, даних update, завдань та activity, а також діагностики повідомлень,
файлів і стеків помилок. Результат містить `redaction.applied`,
`redaction.policy` та `redaction.paths`, щоб подальші інструменти могли
визначити політику, яка сформувала файл.

Кожен експорт також містить блок `integrity`, обчислений після приховування
даних. Контрольна сума використовує `canonicalization = json-recursive-ksort-v1`
та `checksum_algorithm = sha256`. Коли налаштовано `signing_key`, ті самі
канонічні дані підписуються з `signature_algorithm = hmac-sha256`, а
необов’язковий `signing_key_id` повідомляється як `key_id`. Зберігайте ключ
підпису поза експортованим файлом і змінюйте ідентифікатор ключа, коли подальшим
засобам перевірки потрібно розрізняти ключі.

## Перехоплювачі worker {#worker-interceptors}

Перехоплювачі worker доступні починаючи з наступного випуску пакета Workflow.
Вбудований Durable Workflow запускає впорядковані перехоплювачі worker навколо
завдань workflow, activity та query, які він виконує в процесах вашого застосунку.
Використовуйте їх для журналу аудиту, міток метрик, контексту tenant чи трасування,
які ви хочете написати один раз, а не в кожному workflow та activity. Форма hook
відповідає перехоплювачам
[Python](../polyglot/python.md#worker-interceptors),
[PHP](../polyglot/php.md#worker-interceptors) і
[Rust](../polyglot/rust.md#worker-interceptors) SDK.

Перелічіть класи перехоплювачів у `workflows.v2.interceptors` у
`config/workflows.php`. Вони розв’язуються з контейнера Laravel, тож впровадження
через конструктор працює, і виконуються в зазначеному порядку; перший є зовнішньою
обгорткою.

```php
'v2' => [
    // ...
    'interceptors' => [
        App\Workflows\AuditInterceptor::class,
    ],
],
```

Кожен перехоплювач реалізує `Workflow\V2\Interceptors\WorkerInterceptor`.
Розширте `Workflow\V2\Interceptors\PassthroughWorkerInterceptor`, щоб реалізувати
лише потрібні hook, і викликайте `$next($context)`, щоб продовжити ланцюжок. Цей
перехоплювач аудиту журналює кожне зафіксоване завдання workflow і кожну спробу
activity:

```php
namespace App\Workflows;

use Illuminate\Support\Facades\DB;
use Psr\Log\LoggerInterface;
use Workflow\V2\Interceptors\ActivityInterceptorContext;
use Workflow\V2\Interceptors\PassthroughWorkerInterceptor;
use Workflow\V2\Interceptors\WorkflowTaskInterceptorContext;
use Workflow\V2\Interceptors\WorkflowTaskOutcome;

final class AuditInterceptor extends PassthroughWorkerInterceptor
{
    public function __construct(private readonly LoggerInterface $audit)
    {
    }

    public function executeWorkflowTask(WorkflowTaskInterceptorContext $context, callable $next): WorkflowTaskOutcome
    {
        $outcome = $next($context);
        // The task commits after the chain returns; log only once it has.
        DB::afterCommit(fn () => $this->audit->info('workflow task', [
            'workflow_id' => $context->workflowId,
            'run_id' => $context->runId,
            'attempt' => $context->workflowTaskAttempt,
            'recorded' => $outcome->historyEventTypes,
        ]));

        return $outcome;
    }

    public function executeActivity(ActivityInterceptorContext $context, callable $next): mixed
    {
        $this->audit->info('activity started', [
            'activity_type' => $context->activityType,
            'attempt' => $context->attemptNumber,
            'workflow_id' => $context->workflowId,
        ]);
        try {
            return $next($context);
        } finally {
            $this->audit->info('activity finished', ['activity_type' => $context->activityType]);
        }
    }
}
```

Контейнер створює налаштовані перехоплювачі для кожного завдання. Прив’яжіть
перехоплювач як singleton, коли він має зберігати стан між завданнями.

| Hook | Контекст | Повертає `$next` |
| --- | --- | --- |
| `executeWorkflowTask($context, $next)` | `workerId`, `connection`, `taskQueue`, `namespace`, `task`, `taskId`, `workflowType`, `workflowId`, `runId`, `workflowTaskAttempt`, `historyLength`, `replaying` | `WorkflowTaskOutcome` з `historyEventTypes`, `runStatus`, `nextTaskId` |
| `executeActivity($context, $next)` | `workerId`, `connection`, `taskQueue`, `namespace`, `task`, `activityType`, `activityClass`, `arguments`, `attemptNumber`, `taskId`, `activityExecutionId`, `activityAttemptId`, `workflowId`, `runId`, `local`, `activity` | результат activity |
| `executeQueryTask($context, $next)` | `workerId` (завжди null), `connection`, `taskQueue`, `namespace`, `task`, `queryName`, `workflowType`, `workflowId`, `runId`, `arguments` | результат query |

`task` є знімком узятого рядка завдання у вигляді масиву, а не самою моделлю.
`workerId` ідентифікує процес queue worker за хостом та ID процесу. Query
виконуються у викликальному процесі, тому їхній `workerId` дорівнює null.

Перехоплювачі завдань workflow не можуть змінити те, що записує workflow:

- `executeWorkflowTask` обгортає завдання workflow всередині його транзакції бази
  даних, один раз на кожну спробу завдання. `replaying` має значення `true`, коли
  попередні завдання workflow уже записали команди для run. Це не ключ
  дедуплікації: `historyEventTypes` перелічує лише події, які додало це завдання.
- Побічні ефекти hook виконуються до фіксації завдання й можуть повторитися під час
  повторної спроби, тож відкладайте їх через `DB::afterCommit()` або прив’язуйте їх
  до ключа з `taskId` і `workflowTaskAttempt`.
- Рушій фіксує історію, яку створив код workflow. Результат є поданням лише для
  читання; повернення іншого результату чи передавання іншого контексту в `$next`
  нічого не змінює.
- Помилка з коду workflow доходить до рушія без змін, навіть якщо перехоплювач
  перехоплює її та повертається звичайним чином.
- Якщо перехоплювач кидає виняток за межі ланцюжка, пропускає `$next` або викликає
  його більше одного разу, транзакція завдання відкочується, тож нічого не
  записується. Завдання звільняється з `WorkflowTaskInterceptorFailed` як останньою
  помилкою й повторюється після звичайного backoff відновлення. Зовнішній
  перехоплювач усе ще може перехопити виняток, кинутий внутрішнім перехоплювачем
  після `$next`, і дозволити завданню зафіксуватися; пропущений або повторений
  `$next` завжди спричиняє збій завдання.
- Hook виконуються, поки рядки run і завдання заблоковані, тож робіть їх короткими.
  Вони не повинні фіксувати чи відкочувати зовнішню транзакцію й не повинні
  надсилати команди, як-от signal, run, який вони обгортають; зміна записаного
  стану run спричиняє збій завдання за кожної спроби.
- Local activity виконуються всередині завдання workflow, тож hook, який постійно
  завершується помилкою після `$next`, змушує кожну повторну спробу знову
  виконувати ці local activity.

Перехоплювачі activity та query можуть змінювати аргументи через
`$context->withArguments(...)` і змінювати повернене значення, оскільки результат
activity записується один раз, а query нічого не записує. Переписані аргументи query
знову перевіряються за контрактом query. Винятки activity проходять крізь кожен
перехоплювач, якщо жоден із них їх не обробить, а потім обробляються звичайною
політикою повторних спроб activity. Перехоплювачі activity обгортають activity з
черги та local activity; `local` розрізняє їх. Імітовані activity у
`WorkflowStub::fake()` не запускають перехоплювачів.

Коли [вбудоване трасування](../monitoring.md#embedded-tracing) увімкнено, вбудовані
span workflow та activity залишаються зовнішніми, тож перехоплювачі виконуються
всередині активного span і можуть додавати атрибути чи дочірні span.

Перехоплювачі обгортають завдання черги, local activity та query, які запускає цей
пакет. Завдання, передані зовнішнім SDK worker через мости завдань worker,
виконуються під власними перехоплювачами відповідного SDK. Маршрут `execute` мосту
worker, який виконує взяте завдання workflow у процесі для викликача мосту, не
запускає перехоплювачі завдань workflow. Запис у `workflows.v2.interceptors`, який
не вдається розв’язати, спричиняє збій кожного шляху по-своєму: завдання workflow із
черги звільняється й повторюється, спроба activity завершується помилкою відповідно
до своєї політики повторних спроб, а query кидає виняток своєму викликачу.
Перевіряйте список під час розгортання.
[Посібник із вбудованих перехоплювачів](https://github.com/durable-workflow/workflow/blob/main/docs/worker-interceptors.md)
містить повний контракт.
