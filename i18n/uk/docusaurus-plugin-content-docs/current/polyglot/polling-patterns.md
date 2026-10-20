---
title: Опитування зовнішнього стану
description: Вибирайте обмежене опитування або сигнали зворотного виклику, очікуйте довговічно в коді workflow та враховуйте витрати історії.
---

# Опитування зовнішнього стану {#polling-external-state}

Опитуйте зовнішнє завдання в activity, а не мережевими запитами в коді workflow. Спершу визначте, де має відбуватися очікування, а тоді обирайте інтервал.

## Оберіть межу очікування {#choose-the-waiting-boundary}

| Шаблон | Використання worker | Довговічна історія та керування |
| --- | --- | --- |
| Повторювати одну activity до готовності | Слот activity під час кожної спроби; звільняється на час затримки між спробами | Кожна спроба й кожне заплановане повторення додають історію. Код workflow не відновлюється між спробами, тому в цей момент не може перевірити бюджет історії чи виконати continue-as-new. |
| Одна тривала activity із heartbeat | Займає слот activity протягом усього очікування | Кожен прийнятий heartbeat додає подію історії. Задайте скінченні дедлайни activity та обмежений тайм-аут запиту до зовнішньої системи; heartbeat не продовжує дедлайн усього виконання. |
| Перевірка в activity, а потім довговічний timer | Звільняє слоти activity між перевірками | Кожна перевірка додає події activity, а кожен інтервал — події timer. Між перевірками код workflow може вирішити, чи зупинитися, виконати компенсацію або continue-as-new. |
| Окремий дочірній workflow для опитування | Дочірній workflow використовує слоти відповідно до обраного шаблону | Переносить історію опитування до дочірнього workflow; додає батькові події запуску та завершення дочірнього виклику. Історія та виконання дочірнього workflow не стають безкоштовними. Явно оберіть політику закриття батька. |
| Надіслати завдання й повернутися, потім отримати сигнал зворотного виклику | Звільняє слот activity після надсилання; workflow очікує довговічно | Надсилання, прийняття й застосування сигналу та очікування з дедлайном додають історію. Потрібні автентифікована кореляція й обробка дублікатів у застосунку. |

Використовуйте короткі перевірки, які безпечно повторювати. Обробник, заблокований зовнішнім запитом, не стане чутливим до скасування лише через наявність timer чи політики скасування у workflow.

## Завершення через зворотний виклик і сигнал {#callback-and-signal-completion}

Якщо зовнішня система може повідомити про результат, надішліть завдання в короткій activity та поверніть підтвердження прийняття. Нехай **workflow** з кінцевим дедлайном очікує задекларований сигнал або умову, стан якої відновлюється під час replay. Не утримуйте activity, HTTP-відповідь чи SSE-з’єднання відкритими до завершення завдання.

До запуску workflow виберіть ID інстансу та збережіть зв’язок між автентифікованою зовнішньою операцією, namespace, **публічним ID інстансу workflow** і назвою задекларованого сигналу. Activity може надіслати завдання відразу після фіксації запуску. ID run позначає лише один run і не є стабільною адресою зворотного виклику після continue-as-new. Автентифікуйте зворотний виклик та перевірте збережений зв’язок перед пересиланням; не довіряйте полям маршрутизації чи ідентифікації довільного запиту.

### Зворотний виклик у вбудованому PHP {#embedded-php-callback}

Налаштуйте `services.jobs.url` для постачальника, а `services.jobs.callback_url` — для автентифікованого адаптера застосунку. Пристосуйте запит `/jobs` до API постачальника: він має швидко підтверджувати надсилання та повертати `job_id`. Реалізуйте відповідну автентифікацію й обмежте тривалість запиту. Ключ операції допомагає дедуплікації лише тоді, коли постачальник справді його враховує.

```php
use Illuminate\Support\Facades\Http;
use Workflow\V2\Activity;
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Support\ActivityOptions;
use Workflow\V2\Workflow;
use function Workflow\V2\activity;
use function Workflow\V2\await;

#[Type('external.submit')]
final class SubmitExternalJob extends Activity
{
    public function handle(string $workflowId, string $operationId): array
    {
        return Http::connectTimeout(2)->timeout(5)
            ->withHeaders(['Idempotency-Key' => $operationId])
            ->post(config('services.jobs.url').'/jobs', [
                'workflow_id' => $workflowId,
                'operation_id' => $operationId,
                'signal' => 'job-completed',
                'callback_url' => config('services.jobs.callback_url'),
            ])->throw()->json();
    }
}

#[Type('external-completion')]
#[Signal('job-completed', [
    ['name' => 'operationId', 'type' => 'string'],
    ['name' => 'result', 'type' => 'array'],
])]
final class ExternalCompletion extends Workflow
{
    public function handle(string $operationId): array
    {
        $job = activity(SubmitExternalJob::class, new ActivityOptions(
            maxAttempts: 1, startToCloseTimeout: 10, scheduleToCloseTimeout: 15,
        ), $this->workflowId(), $operationId);

        $received = await('job-completed', timeout: 10);
        if ($received === null) {
            return ['status' => 'timed_out', 'job_id' => $job['job_id']];
        }
        if ($received[0] !== $operationId) {
            return ['status' => 'unexpected_operation'];
        }
        return ['status' => 'completed', 'result' => $received[1]];
    }
}
```

Запускайте з ID інстансу, вибраним викликачем, і скінченними тайм-аутами run та всього виконання. Зареєструйте `ExternalCompletion` для [автентифікованих вебхуків](../features/webhooks.md); адаптер зворотного виклику може переслати перевірені дані до маршруту сигналу, спрямованого на інстанс:

```bash
curl -fsS -X POST "$APP_URL/webhooks/instances/external-job-42/signals/job-completed" \
  -H "Authorization: $WEBHOOK_TOKEN" -H 'Content-Type: application/json' \
  -d '{"arguments":["op-42",{"value":42}]}'
```

Це формат `arguments` вбудованого вебхука, а не конверт payload Server. Постачальник має викликати автентифікований адаптер застосунку, а не отримувати облікові дані оператора чи worker Server.

### Зворотний виклик і умова Python {#python-callback-and-condition}

Наведена activity виконує лише обмежене за часом надсилання. Налаштуйте `JOB_API_URL`, `JOB_CALLBACK_URL` та автентифікацію постачальника в її середовищі. Зареєструйте обидва визначення в [Python worker](./python.md). Явно передайте відомий викликачу ID інстансу workflow; приклад не вигадує accessor ідентифікатора в контексті workflow.

```python
import os
import httpx
from durable_workflow import activity, workflow
from durable_workflow.workflow import ActivityRetryPolicy

@activity.defn(name="external.submit")
async def submit_external_job(workflow_id, operation_id):
    async with httpx.AsyncClient(timeout=5.0) as provider:
        response = await provider.post(
            os.environ["JOB_API_URL"] + "/jobs",
            headers={"Idempotency-Key": operation_id},
            json={"workflow_id": workflow_id, "operation_id": operation_id,
                  "signal": "job-completed",
                  "callback_url": os.environ["JOB_CALLBACK_URL"]},
        )
        response.raise_for_status()
        return response.json()

@workflow.defn(name="external-completion")
class ExternalCompletion:
    def __init__(self):
        self.results = {}

    @workflow.signal("job-completed")
    def completed(self, operation_id: str, result: dict):
        self.results.setdefault(operation_id, result)

    def run(self, ctx, workflow_id, operation_id):
        job = yield ctx.schedule_activity(
            "external.submit", [workflow_id, operation_id],
            retry_policy=ActivityRetryPolicy(max_attempts=1, backoff_seconds=[1]),
            start_to_close_timeout=10, schedule_to_close_timeout=15,
        )
        ready = yield ctx.wait_condition(
            lambda: operation_id in self.results,
            key="external.completed", timeout=10,
        )
        if not ready:
            return {"status": "timed_out", "job_id": job["job_id"]}
        return {"status": "completed", "result": self.results[operation_id]}
```

Виберіть ID інстансу та збережіть зв’язок namespace/інстанс/сигнал для операції **до виклику start**. Activity може початися відразу після фіксації запуску. Потім застосунок запускає цей інстанс зі скінченними часовими бюджетами:

```python
handle = await client.start_workflow(
    workflow_type="external-completion", task_queue="external-jobs",
    workflow_id="external-job-42", input=["external-job-42", "op-42"],
    execution_timeout_seconds=60, run_timeout_seconds=30,
)
```

Після автентифікації постачальника та пошуку збереженого зв’язку його операції адаптер використовує Client у **тому самому namespace**:

```python
await client.signal_workflow(
    "external-job-42", "job-completed", args=["op-42", {"value": 42}],
)
```

Це викликає `POST /api/workflows/{workflowId}/signal/{signalName}` Server зі звичайним Avro-конвертом SDK. Успішний виклик сигналу підтверджує прийняття, а не обробку зворотного виклику кодом workflow. Якщо потрібне підтвердження обробки, перевірте результат workflow або збережений статус сигналу.

### Ранні виклики, продовження та запізнілі виклики {#early-continued-and-late-callbacks}

- Задекларуйте сигнал до запуску run. Зворотний виклик, що надходить до початку очікування, зберігається й споживається в довговічному порядку; Python відновлює стан обробника під час replay. Пізніша реєстрація не може переписати декларації старого run.
- Зворотні виклики до інстансу переходять через continue-as-new; виклики, явно спрямовані на run, залишаються прив’язаними до нього. У сумісних runtime Core 2.7.0+ придатні отримані сигнали інстансу зберігають початкові ідентичність і порядок під час передачі. Стан **уже застосованих** викликів треба передавати в аргументах продовження, якщо він ще потрібен застосунку.
- Після термінального закриття зворотний виклик явно відхиляється. З опублікованим Server Python повертає `SignalFailed.reason == "run_not_active"` зі статусом409. Прийнятий, але не застосований сигнал натомість може зберегти статус відхилення через закриття; попередня квитанція прийняття не стирається. Див. [прийняття та закриття сигналів](../features/signals.md#acceptance-and-closure).
- Дедлайн очікування не скасовує зовнішнє завдання. Узгодьте його результат або попросіть постачальника скасувати його через activity. Запізнілий результат може потребувати рішення щодо відновлення; не запускайте мовчки заміну.

### Дублікати доставки й обмеження потоків {#duplicate-delivery-and-streaming-limits}

Постачальники повторюють зворотні виклики, а мережева помилка може статися вже після прийняття сигналу. Збережіть ключ операції/події та точний намір, дедуплікуйте на вході зворотного виклику й у бізнес-обробці та залишайте невизначені доставки для узгодження. Python-обробник залишає перший результат операції в цьому run; це не гарантує дедуплікації між run або одноразового прийняття. Не позначайте невизначене пересилання обробленим лише тому, що запит надіслано. [Спільне issue #216](https://github.com/durable-workflow/.github/issues/216) досі відповідає за безпечні повтори сигналів і збережену ідентичність прийняття. Заголовок ідемпотентності або одна спроба activity самі собою не гарантують одноразових зовнішніх ефектів.

Запустіть workflow до надсилання роботи за цим рецептом. У service mode `start(use-existing)` і наступний `signal` — це **дві операції**, між якими може статися закриття; атомарне прийняття залишається в [спільному issue #222](https://github.com/durable-workflow/.github/issues/222). Вбудований `signalWithStart` — окремий атомарний API. Запит debounce [Website #280](https://github.com/durable-workflow/durable-workflow.github.io/issues/280) було замінено цією продуктовою вимогою, а не виконано цим рецептом.

HTTP/SSE-сокет, утримуваний у activity, не довговічний: втрата worker або процесу закриває його, він займає слот activity, а повторне з’єднання може дублювати чи пропускати зовнішні події. Надсилання та зворотні виклики все одно додають історію activity, сигналів і очікувань; виконання не стає безкоштовним чи необмеженим. Для довговічного **виводу workflow** використовуйте [Workflow Streams](./workflow-streams.md) з контрактом збережених послідовностей/курсорів, а не вважайте транспортне з’єднання сховищем.

Наведений PHP- і Python-код виконано з опублікованим **Server 2.9.7 / Core 2.7.2** і нормально встановленим **Python SDK 2.6.1**. Окремі перевірки PostgreSQL 17.11 охопили ранні виклики й виклики під час очікування, запізніле відхилення та continue-as-new зі зворотним викликом за відсутності Python worker і подальшим холодним читанням. Вбудовані перевірки використовували справжній маршрут вебхука. Це доказ роботи рецепта, а не кваліфікація всіх БД, автентифікації постачальника, коректного завершення процесу чи native runtime. [Запис перевірки](https://github.com/durable-workflow/durable-workflow.github.io/issues/321#issuecomment-6292485315) зберігає невдалі початкові спроби окремо.

## Обмежуйте спроби та історію {#bound-retries-and-history}

Повторні спроби потрібно вмикати явно: для PHP activity типово дозволена одна спроба. Наприклад, задайте `maxAttempts: 3`, `backoff: [5, 30]`, `startToCloseTimeout: 10` і `scheduleToCloseTimeout: 90` для трьох віддалених спроб зі скінченними затримками та початковим загальним часом. Відповідна політика Python — `ActivityRetryPolicy(max_attempts=3, backoff_seconds=[5, 30])`, з окремими параметрами тайм-аутів спроби й усієї activity. Успішне повернення «ще не готово» не є помилкою й не запускає повторну спробу. Див. [помилки та відновлення](../failures-and-recovery.md).

Повторні спроби доречні, коли неготовність — це явно визначений результат, що допускає повторення, а коду workflow не потрібно виконуватися між перевірками. Не перетворюйте необмежені повтори на прихований цикл опитування. Узгодженість затримок локальних activity відстежується в [задачі про контракт повторних спроб](https://github.com/durable-workflow/.github/issues/219); тут приклади використовують віддалені activity.

## Явно переходьте до нового запуску {#roll-over-deliberately}

Цей виконуваний приклад робить одну перевірку за запуск, очікує та передає скінченний лічильник решти перевірок у наступний запуск. Замініть лише синтетичний пошук стану в activity справжнім запитом з обмеженим тайм-аутом. Приклад повертає останній стан навіть після вичерпання перевірок; викликач має перевіряти `ready`.

### Вбудований PHP {#embedded-php}

```php
use Workflow\V2\Activity;
use Workflow\V2\Support\ActivityOptions;
use Workflow\V2\Workflow;
use function Workflow\V2\activity;
use function Workflow\V2\timer;
use function Workflow\V2\continueAsNew;

final class CheckDemoStatus extends Activity
{
    public function handle(int $remaining): array
    {
        return ['ready' => $remaining <= 1];
    }
}

final class PollDemo extends Workflow
{
    public function handle(int $remaining = 2, int $intervalSeconds = 30): array
    {
        $status = activity(CheckDemoStatus::class, new ActivityOptions(
            maxAttempts: 1, startToCloseTimeout: 10, scheduleToCloseTimeout: 15,
        ), $remaining);
        if ($status['ready'] || $remaining <= 1) {
            return $status;
        }
        timer($intervalSeconds);
        return continueAsNew($remaining - 1, $intervalSeconds);
    }
}
```

Запускайте його через звичайне [налаштування вбудованого workflow](../installation.md), задавши скінченні тайм-аути запуску та всього виконання.

### Сервісний worker Python {#python-service-worker}

```python
from durable_workflow import activity, workflow
from durable_workflow.workflow import ActivityRetryPolicy

@activity.defn(name="poll-demo.status")
async def check_status(remaining):
    return {"ready": remaining <= 1}

@workflow.defn(name="poll-demo")
class PollDemo:
    def run(self, ctx, remaining=2, interval_seconds=30):
        result = yield ctx.schedule_activity(
            "poll-demo.status", [remaining],
            retry_policy=ActivityRetryPolicy(max_attempts=1, backoff_seconds=[1]),
            start_to_close_timeout=10, schedule_to_close_timeout=15,
        )
        if result["ready"] or remaining <= 1:
            return result
        yield ctx.sleep(interval_seconds)
        return ctx.continue_as_new(remaining - 1, interval_seconds)
```

Зареєструйте `PollDemo` і `check_status` в одному [worker Python](./python.md), а тоді запустіть з аргументами `[2, 30]` і скінченними тайм-аутами виконання та запуску. Щоб відстежувати наступника, спостерігайте за поточним екземпляром workflow; дескриптор конкретного запуску й надалі вибирає початковий запуск.

Обидва приклади виконано на опублікованих Server **2.9.7 / Core 2.7.2**, зі звичайно встановленим Python **2.6.1** та тестовим входом `[2, 1]`. Обидва виконали дві справжні перевірки у двох запусках. Continue-as-new починає нову історію запуску, додає витрати на запуск і зв'язок та зберігає початковий дедлайн виконання. Це не дає необмеженого часу життя.

Тут використовуйте відносні довговічні очікування. Просування годинника Python і стабільне під час відтворення читання бюджету історії залишаються окремими задачами про [годинник](https://github.com/durable-workflow/.github/issues/215) та [бюджет](https://github.com/durable-workflow/workflow/issues/859). Цей рецепт не розгалужується за `ctx.now()` чи повторно обчисленою довжиною історії. Не вважайте `DW_MAX_HISTORY_EVENTS` примусово застосовуваним автоматичним переходом: [Server #504](https://github.com/durable-workflow/server/issues/504) відстежує цю прогалину.

## Переривайте та звіряйте наслідки {#interrupt-and-reconcile}

Для зупинки через signal [змагайте signal із поточним очікуванням через select](../features/concurrency.md) та явно скасуйте операцію, яка програла, відповідно до підтримуваної політики скасування. Сам select не скасовує решту операцій. Запит зупинити activity не доводить відсутності зовнішнього побічного ефекту: використовуйте ключі ідемпотентності та звіряйте стан перед компенсацією або повторним запуском. Негайне скасування, terminate і жорсткий тайм-аут workflow не виконують компенсацію з коду workflow; якщо потрібне очищення, використовуйте підтримуване [кооперативне скасування](./cancellation.md).

## Перевіряйте фактичну історію {#inspect-the-actual-history}

Наведені вимірювання сервісного режиму Python зафіксували:

| Завершений сценарій | Події канонічної історії |
| --- | --- |
| Одна віддалена activity успішна з третьої спроби | Усього 10: 1 планування, 3 початки, 2 планування повтору, 1 завершення та 3 події життєвого циклу запуску |
| Одна activity із двома прийнятими heartbeat | Усього 8: 3 події activity, 2 події heartbeat та 3 події життєвого циклу |
| Дві успішні перевірки з одним timer між ними | Усього 11: 6 подій activity, 2 події timer та 3 події життєвого циклу |

Приклад переходу записав **8 + 5** подій у запусках Python та **8 + 6** у PHP; PHP також записує `StartAccepted` для наступника. Це виміряні витрати операцій і запусків, а не універсальні підсумки подій, одиниці оплати чи результати продуктивності. Інші команди, помилки, скасування та метадані прийняття в конкретному runtime можуть додавати події. Перевіряйте історію кожного запуску, збережену політику спроб і початкові дедлайни, а не оцінюйте зростання лише за кількістю ітерацій. Точні спостереження та невдалі записи перевірочної програми збережені в [підтвердженні кваліфікації](https://github.com/durable-workflow/durable-workflow.github.io/issues/283#issuecomment-6288504564).
