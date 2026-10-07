---
sidebar_position: 8
tags:
  - sample-app
  - Laravel
  - message-streams
  - Waterline
keywords:
  - sample app
  - застосунок Laravel
  - приклад workflow AI
  - панель Waterline
---

# Sample App {#sample-app}

https://github.com/durable-workflow/sample-app

Це галерея вбудованого Laravel: приклад застосунку Laravel 13 на
стабільній лінійці Durable Workflow 2.0 із workflow для запуску в
GitHub Codespace. Починайте тут, якщо ваша модель розгортання —
**вбудований Laravel** і ви хочете разом переглянути виконання черг
Laravel та Waterline.

Оберіть приклади відповідно до runtime:

| Модель розгортання | Шлях прикладу |
| --- | --- |
| Durable Workflow Cloud | Почніть із [керованого runtime Cloud](/docs/polyglot/cloud-control-plane/), потім оберіть посібник SDK PHP, Python або Rust із наданими обліковими даними простору імен. Користувачі Cloud не запускають Server. |
| Власний сервісний режим | Використовуйте [швидкий старт Durable Workflow 2.0](/docs/quickstart/) для повних прикладів PHP, Python і Rust на опублікованих артефактах із локальним Server. |
| Вбудований Laravel | Продовжуйте з цією галереєю та [вбудованим встановленням](/docs/installation/). |

Галерея дає наскрізні докази роботи рушія в Laravel. Це перше місце
реалістичного покриття вбудованих можливостей Laravel і джерело
прикладів природних для Laravel шаблонів на цьому сайті. Для сервісних
і міжмовних розгортань використовуйте відповідні приклади вище.
Якщо хочете поділитися шаблоном durable-workflow,
[посібник додавання прикладу](/docs/contribute-a-sample) пояснює процес.

> Шукаєте версію Laravel 12 / Durable Workflow 1.x? Її збережено на [гілці `Laravel-12`](https://github.com/durable-workflow/sample-app/tree/Laravel-12). Старі дописи й посібники з шаблонами v1, як `Workflow\Workflow`, `yield activity(...)`, `Workflow\Activity`, стосуються цієї гілки.

## Галерея прикладів {#sample-gallery}

Кожен запис називає шаблон, який викладає приклад, клас workflow,
що його виконує, команду Artisan для запуску й екран Waterline,
що доводить фіксацію run. Галерея відтворює «Sample Index» README
репозиторію sample-app. Після додавання чи переміщення прикладу
README та галерея змінюються разом.

| Шаблон | Клас workflow | Команда | Екран Waterline |
|---------|----------------|---------|------------------|
| Найменший детермінований workflow v2 | `App\Workflows\Simple\SimpleWorkflow` | `php artisan app:workflow` | Список run → деталі run із двома подіями activity та подією `WorkflowCompleted` |
| Стійке вимірювання тривалості без розбіжностей replay | `App\Workflows\Elapsed\ElapsedTimeWorkflow` | `php artisan app:elapsed` | Деталі run із двома `SideEffectRecorded` для читання часу `sideEffect` навколо події `TimerFired` |
| Координація між Laravel-застосунками | `App\Workflows\Microservice\MicroserviceWorkflow` | `php artisan app:microservice` | Деталі run із подіями activity та маршрутизацією черг між worker застосунку й мікросервісу |
| Автоматизація браузера зі збереженими результатами | `App\Workflows\Playwright\CheckConsoleErrorsWorkflow` | `php artisan app:playwright` | Деталі run з activity Playwright, activity FFmpeg і activity очищення в порядку виконання |
| Запуск workflow webhook з очікуванням signal | `App\Workflows\Webhooks\WebhookWorkflow` | `php artisan app:webhook` | Деталі run із `WorkflowStarted` від входу webhook і подією `SignalReceived` для `ready` |
| Цикл activity AI зі стійкою повторною спробою/перевіркою | `App\Workflows\Prism\PrismWorkflow` | `php artisan app:prism` | Деталі run із повторними спробами activity та `ActivityCompleted`, що задовольняє валідатор |
| AI-агент із signal та компенсацією saga | `App\Workflows\Ai\AiWorkflow` | `php artisan app:ai` | Деталі run із посиланням потоку повідомлень, історією update та activity компенсації після помилки saga |

Стовпець екрана Waterline називає очікувані події здорового run.
Якщо однієї немає локально, ця прогалина допомагає швидко знайти
проблему worker або середовища.

## Посилання зі сторінок шаблонів {#pattern-page-cross-links}

Сторінки шаблонів цього сайту ведуть прямо до workflow прикладу,
який виконує відповідну можливість. Використовуйте таблицю для переходу
від сторінки шаблону до виконуваного workflow.

| Сторінка шаблону | Workflow прикладу |
|--------------|-----------------|
| [Saga](/docs/features/sagas) | `App\Workflows\Ai\AiWorkflow` (`php artisan app:ai`) |
| [Signal](/docs/features/signals) | `App\Workflows\Webhooks\WebhookWorkflow` (`php artisan app:webhook`) |
| [Потоки повідомлень](/docs/features/message-streams) | `App\Workflows\Ai\AiWorkflow` (`php artisan app:ai`) |
| [Дочірні workflow](/docs/features/child-workflows) | Окремого запису галереї ще немає. Використовуйте посібник дочірніх workflow. |
| [Side effect](/docs/features/side-effects) | `App\Workflows\Elapsed\ElapsedTimeWorkflow` (`php artisan app:elapsed`) |
| [Webhook](/docs/features/webhooks) | `App\Workflows\Webhooks\WebhookWorkflow` (`php artisan app:webhook`) |
| [Workflow MCP](/docs/mcp-workflows) | Усі записи галереї відкриті через `config/workflow_mcp.php` |

**Крок 1**

Створіть codespace з гілки main цього репозиторію.

![Створення codespace](https://user-images.githubusercontent.com/1130888/233664377-f300ad50-5436-4bb8-b172-c52e12047264.png)

**Крок 2**

Після створення codespace дочекайтеся його збірки. Зазвичай це
триває від 5 до 10 хвилин.

**Крок 3**

Після завершення ви побачите редактор і термінал унизу.

![Редактор і термінал](https://user-images.githubusercontent.com/1130888/233665550-1a4f2098-2919-4108-ac9f-bef1a9f2f47c.png)

**Крок 4**

Виконайте composer install.

```bash
composer install
```

**Крок 5**

Виконайте init для налаштування застосунку, встановлення додаткових
залежностей і міграцій.

```bash
php artisan app:init
```

Шлях `php artisan migrate` sample-app безпосередньо підхоплює міграції
пакетів Workflow і Waterline, тому всі таблиці та збережені подання
Waterline готові після звичайного встановлення.

**Крок 6**

Запустіть worker черги. Це дозволить обробляти workflow та activity.

```bash
php artisan queue:work
```

Для перевірки самого циклу відновлення без очікування наступного
циклу `Looping` зайнятого worker виконайте один явний прохід відновлення
з другого термінала:

```bash
php artisan workflow:v2:repair-pass
```

Команда використовує ту саму політику пошуку й backoff, що й цикл
worker. Вона корисна після виправлення локальної проблеми черги/backend,
для перевірки сценарію втраченого завдання або codespace з малим
трафіком, що довго очікує наступний прохід. Додайте `--run-id=...`
для обмеження одним або кількома обраними run під час експерименту
чи `--instance-id=...` для всього екземпляра.

**Крок 7**

Створіть нове вікно термінала.

![Новий термінал](https://user-images.githubusercontent.com/1130888/233666917-029247c7-9e6c-46de-b304-27473fd34517.png)

**Крок 8**

Запустіть workflow прикладу в новому терміналі.

```bash
php artisan app:workflow
```

**Крок 9**

Панель Waterline доступна за адресою https://[your-codespace-name]-80.preview.app.github.dev/waterline/dashboard.

![Панель Waterline](https://user-images.githubusercontent.com/1130888/233669600-3340ada6-5f73-4602-8d82-a81a9d43f883.png)

Waterline показує стійкий стан: чи почався workflow, який run поточний,
які типізовані події історії зафіксовані, які очікування відкриті та
які дії оператора доступні. Телеметрія worker окрема: затримка
опитування, тривалість завдань, налаштування exporter, власні метрики
застосунку та помилки процесу походять із журналів worker PHP або
endpoint метрик SDK зовнішнього worker.

| Інтерфейс | На що відповідає | Перевірка прикладу |
| --- | --- | --- |
| Waterline та експорт історії | Стійкий статус workflow, історія, повторні спроби, очікування, signal, update, помилки й дії оператора | Відкрийте `/waterline/dashboard` і експортуйте історію обраного run |
| Журнали worker | Помилки процесу worker черги PHP та рядки журналу застосунку | Переглядайте `storage/logs/laravel.log` під час роботи `php artisan queue:work` |
| Метрики SDK | Кількість запитів зовнішнього worker/клієнта, затримка опитування й тривалість завдань | Зчитайте endpoint Prometheus/OpenMetrics worker SDK |

Для worker Python встановіть додаткову підтримку Prometheus і
відкрийте метрики з його процесу:

```bash
pip install 'durable-workflow[prometheus]'
```

```python
from prometheus_client import start_http_server

from durable_workflow import Client, PrometheusMetrics, Worker

metrics = PrometheusMetrics()
start_http_server(9102)

async with Client("http://localhost:8080", token="secret", metrics=metrics) as client:
    worker = Worker(
        client,
        task_queue="default",
        workflows=[GreeterWorkflow],
        activities=[greet],
        metrics=metrics,
    )
    await worker.run()
```

Замініть `GreeterWorkflow` і `greet` на обробники workflow та activity,
зареєстровані цим worker.

Зчитуйте `:9102/metrics` для рядів `durable_workflow_worker_*` і
`durable_workflow_client_*`. Вони пояснюють продуктивність runtime
worker, а Waterline визначає зафіксовану історію workflow.

Екран деталей Waterline має дію «Export History» для обраного run.
Коли показаний поточний run екземпляра, кнопка використовує маршрут
експорту поточного run екземпляра. Деталі історичного run використовують
явний `/runs/{runId}/history-export`. Той самий пакет replay/налагодження
можна експортувати з термінала sample-app:

```bash
php artisan workflow:v2:history-export {workflow-instance-id} --run-id={workflow-run-id} --output=storage/app/workflow-history/example.json --pretty
```

Експорт містить контрольну суму цілісності SHA-256. Задайте
`DW_V2_HISTORY_EXPORT_SIGNING_KEY` і `DW_V2_HISTORY_EXPORT_SIGNING_KEY_ID`
у середовищі застосунку, якщо іншій системі потрібно перевіряти пакет
підписом HMAC.

Експортований блок `selected_run` містить `waits_projection_source`,
`timeline_projection_source`, `timers_projection_source` і
`lineage_projection_source`. Блок `links` також містить `projection_source`.
Розділи `links.parents` / `links.children` спочатку походять із типізованої
історії лінії походження обраного run. Зв’язки дочірніх workflow та
continue-as-new залишаються видимими в пакеті, навіть якщо змінювані
рядки зв’язків розійшлися під час локального експерименту. Коли рядок
лінії походження зберігається лише через старі змінювані дані сумісності,
пакет позначає його `history_authority = mutable_open_fallback` і
`diagnostic_only = true` без прихованого відновлення додаткових
метаданих зв’язків під час експорту.

## Потоки повідомлень AI workflow {#ai-workflow-message-streams}

Workflow з повторюваним вводом AI або людини мають використовувати
основний фасад потоків повідомлень v2 як шаблон написання:

```php
$reply = $this->inbox('ai.assistant')->receiveOne();

$this->outbox('ai.assistant')->sendReference(
    targetInstanceId: $this->workflowId(),
    payloadReference: $storedReplyReference,
    correlationId: $requestId,
);
```

Великі тіла запитів/відповідей залишайте у сховищі payload застосунку,
передаючи збережене посилання через потік. Нові приклади workflow
не повинні прямо записувати `workflow_messages`, `MessageStreamCursor`
або викликати `MessageService`. Стабільний контракт вхідної/вихідної
скриньки v2 наведено в [потоках повідомлень](/docs/features/message-streams).

**Крок 10**

Виконайте тести workflow та activity.

```bash
vendor/bin/phpunit
```

Тепер ви можете створювати й тестувати workflow.

## MCP-сервер AI-клієнта {#ai-client-mcp-server}

Sample App також надає сервер Laravel MCP за `/mcp/workflows`.
Це еталонний інтерфейс AI-клієнта Durable Workflow v2: він надає агентам
структуроване виявлення workflow, запуск, статус, вивід, недавню
типізовану історію та факти помилок без зчитування Waterline.

Докладний контракт endpoint та інструментів наведено в
[інтерфейсі workflow MCP](/docs/mcp-workflows). Ширший контракт
розробки за допомогою AI, зокрема маніфести LLM v2, коди завершення
CLI, експорти Waterline та довідники SDK, наведено в
[розробці за допомогою AI](/docs/ai-assisted-development).

Пакет Laravel MCP реєструє сервер у `routes/ai.php`. Відкриті ключі
workflow задані в `config/workflow_mcp.php`. Кожен запис може містити
клас workflow та метадані виявлення: опис, вимоги до облікових даних
і очікувані аргументи.

Типові інструменти:

| Інструмент | Призначення |
| --- | --- |
| `list_workflows` | Перелічує налаштовані ключі workflow, вимоги до облікових даних, значення статусу v2 і за потреби недавні run. |
| `start_workflow` | Запускає налаштований workflow v2 і повертає `workflow_id`, `run_id`, статус, бізнес-ключ і результат команди. |
| `get_workflow_result` | Опитує поточний або обраний run і повертає статус, вивід, метадані видимості й останній опис помилки. |
| `get_workflow_history` | Повертає обмежений кінець типізованої історії v2 та останні стійкі помилки для діагностики. |
| `diagnose_workflow` | Класифікує обраний run зі структурованими фактами, першопричиною, способом усунення й наступними діями. |
| `repair_workflow` | Запитує вбудовану команду відновлення v2 та повертає структурований результат зміни: прийнято, відмовлено або не потрібно. |

Типовий цикл агента:

```json
{"tool": "list_workflows", "arguments": {"show_recent": true, "limit": 5}}
{"tool": "start_workflow", "arguments": {"workflow": "simple", "business_key": "demo-001"}}
{"tool": "get_workflow_result", "arguments": {"workflow_id": "<workflow_id>"}}
{"tool": "get_workflow_history", "arguments": {"run_id": "<run_id>", "limit": 25}}
```

Використовуйте `simple` або `elapsed` для smoke-тестів без облікових
даних. Workflow `prism` відкритий як приклад AI, але потребує
`OPENAI_API_KEY` для завершення worker.
