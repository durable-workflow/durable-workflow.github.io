---
sidebar_position: 13
---

# Webhook {#webhooks}

Фреймворк надає webhook, через які зовнішні системи можуть динамічно запускати workflow й надсилати signal. Це дає змогу інтегрувати зовнішні сервіси, API та засоби автоматизації.

## Увімкнення webhook {#enabling-webhooks}
Щоб увімкнути webhook, зареєструйте їхні маршрути у файлі маршрутів застосунку (`routes/web.php` або `routes/api.php`):

```php
use Workflow\V2\Webhooks;

Webhooks::routes([
    App\Workflows\OrderWorkflow::class,
    'manual-invoice' => App\Workflows\InvoiceWorkflow::class,
]);
```

Передайте явну мапу класів workflow, які потрібно зробити доступними. Кожен псевдонім стає публічним сегментом маршруту, а кожен клас workflow має містити стабільний стійкий ключ типу через `#[Type(...)]` або реєстрацію в `workflows.v2.types.workflows`. Повну матрицю маршрутів наведено в розділі [Явні webhook команд і query](#explicit-command-and-query-webhooks).

## Метадані видимості {#visibility-metadata}
Під час реєстрації маршрутів через `Workflow\V2\Webhooks::routes(...)` маршрут запуску також приймає зарезервований об’єкт `visibility`. Його поля зберігаються як метадані видимості workflow й не передаються до методу `handle()`.

```bash
curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -d '{
           "workflow_id": "order-123",
           "orderId": 123,
           "visibility": {
             "business_key": "order-123",
             "labels": {
               "tenant": "acme",
               "region": "us-east"
             },
             "memo": {
               "customer": {
                 "id": 42,
                 "name": "Taylor"
               },
               "source": "checkout"
             }
           }
         }'
```

`business_key` та `visibility.labels` копіюються в екземпляр, запуск, стисле представлення запуску, типізовану історію старту, деталі вибраного запуску й експорт історії. Waterline може фільтрувати списки за цими полями через параметри запиту з точним збігом.

`visibility.memo` копіюється в екземпляр, запуск, типізовану історію старту, деталі вибраного запуску й експорт історії. Подальші запуски `continueAsNew()` типово успадковують це memo. На верхньому рівні воно має бути об’єктом JSON із вкладеними скалярними значеннями, `null`, масивами або об’єктами. `memo` — це лише повернені метадані, а не поле фільтрування списку чи пошуку в стислому представленні запуску.

## Автентифікація webhook {#webhook-authentication}
Типово webhook не вимагають автентифікації, але одну з кількох стратегій можна налаштувати в `config/workflows.php`.

**Важливо:** якщо URL webhook доступні зовнішнім сторонам або опубліковані, увімкніть автентифікацію токеном або підписом HMAC, щоб запобігти несанкціонованому доступу.

### Способи автентифікації {#authentication-methods}
Підтримуються:
1. Без автентифікації (none)
2. Автентифікація токеном (token)
3. Перевірка підпису HMAC (signature)
4. Власна автентифікація (custom)

### Автентифікація токеном {#token-authentication}
За автентифікації токеном webhook вимагають чинний API-токен у заголовках запиту. Типовий заголовок — `Authorization`, але його можна змінити в налаштуваннях.

#### Приклад запиту {#example-request}
```bash
curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -H "Authorization: your-api-token" \
     -d '{"orderId": 123}'
```

### Автентифікація підписом HMAC {#hmac-signature-authentication}
За автентифікації HMAC запити перевіряються секретним ключем. Типовий заголовок — `X-Signature`, але його також можна змінити.

#### Приклад запиту {#example-request-1}
```bash
BODY='{"orderId": 123}'
SIGNATURE=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "your-secret-key" | awk '{print $2}')

curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -H "X-Signature: $SIGNATURE" \
     -d "$BODY"
```

### Власна автентифікація {#custom-authentication}
Для власної автентифікації створіть клас, що реалізує інтерфейс `WebhookAuthenticator`:

```php
use Illuminate\Http\Request;
use Workflow\Auth\WebhookAuthenticator;

class CustomAuthenticator implements WebhookAuthenticator
{
    public function validate(Request $request): Request
    {
        $allow = true;

        if ($allow) {
            return $request;
        } else {
            abort(401, 'Unauthorized');
        }
    }
}
```

Потім налаштуйте його в `config/workflows.php`:

```php
'webhook_auth' => [
    'method' => 'custom',
    'custom' => [
        'class' => App\Your\CustomAuthenticator::class,
    ],
],
```

Метод `validate()` має повертати `Request` для чинного запиту або викликати `abort(401)` для неавторизованого.

## Налаштування маршрутів webhook {#configuring-webhook-routes}
Типово webhook доступні за `/webhooks`. Шлях маршруту можна налаштувати в `config/workflows.php`:

```php
'webhooks_route' => 'workflows',
```

Після зміни webhook будуть доступні за:
```
POST /workflows/start/order-workflow
POST /workflows/signal/order-workflow/{workflowId}/mark-as-shipped
POST /workflows/instances/{workflowId}/queries/{query}
POST /workflows/instances/{workflowId}/runs/{runId}/queries/{query}
POST /workflows/instances/{workflowId}/signals/{signal}
POST /workflows/instances/{workflowId}/runs/{runId}/signals/{signal}
POST /workflows/instances/{workflowId}/repair
POST /workflows/instances/{workflowId}/cancel
POST /workflows/instances/{workflowId}/terminate
GET  /workflows/instances/{workflowId}/describe
POST /workflows/instances/{workflowId}/runs/{runId}/repair
POST /workflows/instances/{workflowId}/runs/{runId}/cancel
POST /workflows/instances/{workflowId}/runs/{runId}/terminate
GET  /workflows/instances/{workflowId}/runs/{runId}/describe
GET  /workflows/workflow-tasks/poll
GET  /workflows/activity-tasks/poll
POST /workflows/control-plane/start
```

## Явні webhook команд і query {#explicit-command-and-query-webhooks}

Через HTTP доступні стійкі команди start, signal, update, repair, cancel і terminate, а також безпечні щодо replay маршрути query для читання поточного або вибраного запуску.

Ви реєструєте явну мапу псевдонімів і надаєте маршрути лише потрібним workflow.

```php
use Workflow\V2\Webhooks;

Webhooks::routes([
    App\Workflows\OrderWorkflow::class,
    'manual-invoice' => App\Workflows\InvoiceWorkflow::class,
]);
```

За прямої реєстрації класу workflow він має визначати стабільний ключ типу через `#[Type(...)]` або бути зареєстрованим у `workflows.v2.types.workflows`:

```php
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

#[Type('order-workflow')]
class OrderWorkflow extends Workflow
{
    public function handle(int $orderId)
    {
        // ...
    }
}
```

Еквівалентна реєстрація в конфігурації:

```php
// config/workflows.php
'v2' => [
    'types' => [
        'workflows' => [
            'order-workflow' => App\Workflows\OrderWorkflow::class,
        ],
    ],
],
```

Отриманий маршрут запуску:

```
POST /webhooks/start/order-workflow
```

Приклад запиту:

```bash
curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -d '{"workflow_id":"order-123","orderId":123}'
```

`workflow_id` — це непрозорий публічний ID екземпляра workflow. Він не є ID запуску й має трактуватися як непрозорий рядок.

Заданий ініціатором `workflow_id` має бути непорожнім рядком до 191 символу, придатним для URL, і містити лише літери, цифри, `.`, `_`, `-` та `:`. Порожні, задовгі ID або ID з непідтримуваними символами відхиляються під час перевірки webhook з HTTP `422`.

Та сама мапа стійких типів є запасним шляхом worker, коли збережена назва класу workflow змінюється після рефакторингу. Якщо зберегти `order-workflow` сталим і спрямувати реєстрацію на новий клас, робота v2 у черзі зможе знайти стійкий ключ типу, навіть якщо початковий збережений PHP-клас більше не завантажується.

Можна також явно задати поведінку повторного запуску:

```bash
curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -d '{"workflow_id":"order-123","orderId":123,"on_duplicate":"return_existing_active"}'
```

Підтримувані значення `on_duplicate`:

- `reject_duplicate`
- `return_existing_active`

Усі webhook команд повертають однаковий конверт JSON:

```json
{
  "outcome": "started_new",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "rejection_reason": null
}
```

Прийнята відповідь після створення нового запуску:

```json
{
  "outcome": "started_new",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "rejection_reason": null
}
```

Прийнята відповідь, коли ініціатор запитав повторне використання наявного активного запуску:

```json
{
  "outcome": "returned_existing_active",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "rejection_reason": null
}
```

Відхилена відповідь повторного старту:

```json
{
  "outcome": "rejected_duplicate",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": null,
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "command_source": "webhook",
  "rejection_reason": "instance_already_started"
}
```

Поля відповіді:

- `workflow_id` — публічний ID екземпляра workflow.
- `run_id` — перший активний запуск, створений прийнятою командою start.
- `requested_run_id` задається лише тоді, коли ініціатор явно адресував вибраний запуск.
- `resolved_run_id` — запуск, який рушій фактично визначив для команди. Для стартів, адресованих екземпляру, він збігається з `run_id`.
- `command_id` — стійкий ID команди start.
- `command_source` має значення `webhook` для маршрутів webhook.
- маршрути signal, update, repair, cancel і terminate, адресовані екземпляру, знаходять його найновіший стійкий запуск, не покладаючись лише на змінюваний покажчик поточного запуску. Тому ланцюжки continue-as-new залишаються доступними за тим самим публічним ID, навіть якщо цей стовпець відхилився.
- маршрути команд для вибраного запуску фіксують один запуск під тим самим публічним ID екземпляра й відхиляються з `target_scope = run`, `outcome = rejected_not_current` та `rejection_reason = selected_run_not_current`, якщо він уже не поточний. Тоді `run_id` та `requested_run_id` залишаються на історичному виборі, а `resolved_run_id` указує на поточний запуск для наступного звернення.
- ключі даних зіставляються з назвами параметрів `handle()` workflow у порядку оголошення.
- Workflow визначають аргументи старту в `handle()`.
- Класи workflow без `handle()` відхиляються з помилками перевірки HTTP `422` до створення запуску.
- відсутні обов’язкові ключі даних відхиляються з помилками перевірки HTTP `422`, а не непомітно пропускаються.
- порожні, задовгі або непридатні для маршруту `workflow_id` відхиляються з помилками перевірки HTTP `422` до обробки повторного старту.
- нечинні значення `on_duplicate` відхиляються з помилками перевірки HTTP `422`.
- `on_duplicate = return_existing_active` повертає HTTP `200` за повторного використання поточного активного запуску.
- повторні старти без повторного використання повертають HTTP `409` з `outcome = rejected_duplicate`, `command_status = rejected` та `rejection_reason = instance_already_started`.
- стійкий запис `workflow_commands` також зберігає контекст входу webhook окремо від бізнес-аргументів: позначку ініціатора, спосіб або результат автентифікації, назву й шлях маршруту та відбиток запиту з нормалізованих даних і вибраних заголовків, зокрема `X-Request-Id` та `X-Correlation-Id`

Поточна матриця відповідей HTTP для webhook старту:

- `202` з `outcome = started_new` після створення нового запуску
- `200` з `outcome = returned_existing_active` за повторного використання наявного активного запуску
- `409` з `outcome = rejected_duplicate` після відхилення повторного старту
- `401` за помилки автентифікації webhook
- `404` для невідомого псевдоніма
- `422` за помилки перевірки даних


### Webhook команд signal {#signal-command-webhooks}

Команди signal доступні для екземпляра й вибраного запуску:

```text
POST /webhooks/instances/{workflowId}/signals/{signal}
POST /webhooks/instances/{workflowId}/runs/{runId}/signals/{signal}
```

`workflowId` — публічний ID екземпляра workflow. Маршрут екземпляра визначає поточний активний запуск на момент застосування. Маршрут вибраного запуску також приймає `runId` і відхиляє історичний запуск. Назва signal береться з параметра маршруту. Тіло запиту зараз приймає одне необов’язкове поле верхнього рівня:

```json
{
  "arguments": ["Taylor"]
}
```

Поле `arguments` має бути масивом. Якщо його пропущено, workflow, що очікує через `await('signal-name')`, продовжується зі значенням `true`.
Цільовий клас workflow має оголосити назву signal через `#[Workflow\V2\Attributes\Signal('...')]`. Неоголошені назви стійко відхиляються, а не сліпо буферизуються.

Приклад signal:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/signals/approved-by" \
     -H "Content-Type: application/json" \
     -d '{"arguments":["Taylor"]}'
```

Прийнята відповідь signal:

```json
{
  "outcome": "signal_received",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": null,
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "rejection_reason": null
}
```

Прийняті й відхилені команди signal також отримують окремий стійкий запис життєвого циклу `workflow_signal_records`, пов’язаний із початковою командою. Відповіді signal повертають ID команди як ID кореляції HTTP. Деталі вибраного запуску Waterline та експорт історії показують запис життєвого циклу як `signals[*].id` разом із назвою signal, `signal_wait_id`, послідовністю команди, послідовністю workflow після застосування, станом, результатом, помилками перевірки й збереженими аргументами.

Відхилена відповідь, коли екземпляр існує, але ще не має запуску:

```json
{
  "outcome": "rejected_not_started",
  "workflow_id": "order-123",
  "run_id": null,
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "instance_not_started"
}
```

Відхилена відповідь, коли поточний запуск уже закрито:

```json
{
  "outcome": "rejected_not_active",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "run_not_active"
}
```

Відхилена відповідь, коли маршрут адресує неоголошену назву signal:

```json
{
  "outcome": "rejected_unknown_signal",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "unknown_signal"
}
```

Відхилена відповідь, коли маршрут signal для вибраного запуску адресує історичний запуск:

```json
{
  "outcome": "rejected_not_current",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": "01J...",
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "run",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "selected_run_not_current"
}
```

Поточна матриця відповідей HTTP для webhook signal:

- `202` з `outcome = signal_received` після прийняття команди signal
- `401` за помилки автентифікації webhook
- `404` для невідомого ID екземпляра workflow
- `404` з `outcome = rejected_unknown_signal`, якщо workflow не оголошує цю назву signal. Якщо запуск уже має типізований знімок контракту `WorkflowStarted` або старішу подію `WorkflowStarted` можна доповнити за першого сумісного прийняття, відхилення більше не залежить від попередньої рефлексії поточного класу workflow
- `409` з `outcome = rejected_not_started`, якщо екземпляр ще не має поточного запуску
- `409` з `outcome = rejected_not_active`, якщо цільовий поточний запуск уже закрито
- `409` з `outcome = rejected_not_current`, якщо маршрут вибраного запуску адресує історичний запуск
- `422`, якщо `arguments` наявне, але не є масивом

### Webhook Signal-With-Start {#signal-with-start-webhooks}

Один маршрут пов’язаного прийняття для екземпляра починає новий запуск або повторно використовує поточний активний перед записом signal:

```text
POST /webhooks/start/{alias}/signals/{signal}
```

`alias` — псевдонім workflow, зареєстрований для webhook у `Workflow\V2\Webhooks::routes([...])`. `signal` — стійка назва signal, оголошена через `#[Signal(...)]`.

Тіло запиту поєднує звичайні поля старту й зарезервоване поле `signal_arguments` для даних доданого signal:

```json
{
  "workflow_id": "order-123",
  "signal_arguments": ["Taylor"],
  "visibility": {
    "business_key": "order-123"
  }
}
```

`signal_arguments` має бути масивом. Маршрут типово задає `on_duplicate` як `return_existing_active` й відхиляє будь-яку іншу політику повторного старту для цього пов’язаного прийняття.

Прийнята відповідь, коли маршрут починає новий запуск:

```json
{
  "outcome": "signal_received",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": null,
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "start_command_id": "01J...",
  "start_command_sequence": 1,
  "start_outcome": "started_new",
  "start_command_status": "accepted",
  "intake_group_id": "01J...",
  "rejection_reason": null
}
```

Якщо екземпляр workflow уже має активний поточний запуск, маршрут повертає `start_outcome = returned_existing_active` і залишає команду signal об’єктом відповіді верхнього рівня `command_*`. Пов’язані команди start і signal мають спільні `intake_group_id`, метадані маршруту й заголовки кореляції. Runtime записує обидві команди в одній транзакції до виконання worker першого користувацького кроку workflow.

Деталі вибраного запуску й експорт історії фіксують те саме складене прийняття в `linked_intakes[*]`. Стійким джерелом істини є спільні `workflow_commands.context.intake.group_id` та `mode`, записані в кожній прийнятій команді. Для режиму `signal_with_start` згрупований запис містить `start_command_*`, нестартовий `primary_command_*`, `complete`, `missing_expected_command_types` та впорядковані вкладені знімки `commands[*]`.

Якщо назва signal невідома або дані signal не проходять перевірку стійкого контракту, runtime відхиляє команду signal до створення нового запуску. Тоді відповідь залишає `run_id`, `start_command_id` та `start_outcome` зі значенням `null`.

Поточна матриця відповідей HTTP для webhook signal-with-start:

- `202` з `outcome = signal_received` та `start_outcome = started_new`, якщо запит створює запуск і записує signal
- `202` з `outcome = signal_received` та `start_outcome = returned_existing_active`, якщо запит повторно використовує поточний активний запуск і записує signal
- `401` за помилки автентифікації webhook
- `404` для невідомого псевдоніма workflow webhook
- `404` з `outcome = rejected_unknown_signal`, якщо workflow не оголошує цю назву signal
- `422` з `outcome = rejected_invalid_arguments`, якщо `signal_arguments` є масивом, але порушує стійкий контракт signal
- `422`, якщо `signal_arguments` наявне, але не є масивом, або `on_duplicate` має значення, відмінне від `return_existing_active`

### Webhook query {#query-webhooks}

Маршрути query доступні для екземпляра й вибраного запуску:

```text
POST /webhooks/instances/{workflowId}/queries/{query}
POST /webhooks/instances/{workflowId}/runs/{runId}/queries/{query}
```

`workflowId` — публічний ID екземпляра workflow. Маршрут екземпляра після оновлення знаходить його найновіший стійкий запуск. Маршрут вибраного запуску фіксує один `runId`, зокрема історичний або вже закритий, оскільки query є операціями replay лише для читання.

`query` — публічна ціль query, оголошена через `#[QueryMethod]`. Якщо визначення workflow ще можна завантажити, маршрут також приймає назву відповідного PHP-методу. Успішні відповіді нормалізують `query_name` до стійкої публічної цілі.

Тіло запиту приймає позиційний список `arguments` або іменовану мапу `arguments` із ключами оголошених параметрів query:

```json
{
  "arguments": ["start"]
}
```

```json
{
  "arguments": {
    "prefix": "start"
  }
}
```

На відміну від маршрутів webhook, які змінюють стан, webhook query не додають запис стійкої команди. Вони відтворюють вибраний запуск і відразу повертають серіалізований результат.

Приклад query:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/queries/events-starting-with" \
     -H "Content-Type: application/json" \
     -d '{"arguments":{"prefix":"start"}}'
```

Прийнята відповідь query:

```json
{
  "query_name": "events-starting-with",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "target_scope": "instance",
  "result": "i:1;"
}
```

Відхилена відповідь, коли аргументи query не відповідають оголошеному контракту:

```json
{
  "query_name": "events-starting-with",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "target_scope": "instance",
  "message": "Workflow query [events-starting-with] received invalid arguments.",
  "validation_errors": {
    "prefix": [
      "The prefix argument is required."
    ]
  }
}
```

Відхилена відповідь, коли визначення workflow вибраного запуску більше не можна відтворити:

```json
{
  "query_name": "events-starting-with",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "target_scope": "instance",
  "blocked_reason": "workflow_definition_unavailable",
  "message": "Workflow 01J... [order-123] cannot execute query [events-starting-with] because the workflow definition is unavailable for durable type [order-workflow]."
}
```

Поточна матриця відповідей HTTP для webhook query:

- `200` із серіалізованим `result` після успішного replay query
- `401` за помилки автентифікації webhook
- `404` для невідомого ID екземпляра workflow або вибраного запуску
- `409`, якщо вибраний екземпляр ще не почався, потрібний query не оголошено у вибраному запуску або replay заблоковано з `blocked_reason = workflow_definition_unavailable`
- `422`, якщо оголошений контракт query відхиляє передані `arguments`

### Webhook команд update {#update-command-webhooks}

Доступні маршрути POST update для екземпляра й вибраного запуску та маршрути перевірки стійкого життєвого циклу:

```text
POST /webhooks/instances/{workflowId}/updates/{update}
POST /webhooks/instances/{workflowId}/runs/{runId}/updates/{update}
GET /webhooks/instances/{workflowId}/updates/{updateId}
GET /webhooks/instances/{workflowId}/runs/{runId}/updates/{updateId}
```

`workflowId` — публічний ID екземпляра workflow. `update` — стійка назва update, оголошена через `#[UpdateMethod]`. `updateId` — стійкий ID життєвого циклу з відповіді update. POST екземпляра визначає поточний активний запуск на момент застосування. POST вибраного запуску також приймає `runId` і відхиляє історичний запуск. GET екземпляра читає збережений життєвий цикл цього екземпляра workflow, а GET вибраного запуску звужує пошук до нього.

За використання `#[UpdateMethod('mark-approved')]` публічна ціль webhook — `mark-approved`, навіть якщо відповідний PHP-метод має іншу назву.

Тіло запиту приймає позиційний список `arguments` або іменовану мапу `arguments` із ключами оголошених параметрів update:

```json
{
  "arguments": [true, "api"]
}
```

```json
{
  "arguments": {
    "approved": true
  }
}
```

Задайте `wait_for` як `accepted`, якщо потрібне лише прийняття стійкої команди update, а worker workflow має застосувати її пізніше:

```json
{
  "arguments": {
    "approved": true
  },
  "wait_for": "accepted"
}
```

Якщо `wait_for` пропущено або задано як `completed`, webhook спочатку записує прийнятий update, а потім очікує на його застосування worker workflow в межах налаштованого бюджету завершення. Перевизначте цей бюджет для окремого запиту через `wait_timeout_seconds`:

```json
{
  "arguments": {
    "approved": true
  },
  "wait_timeout_seconds": 5
}
```

Якщо worker завершує update в межах бюджету, webhook повертає звичайну відповідь завершеного або неуспішного update. Якщо бюджет очікування спливає раніше, webhook повертає HTTP `202` із ще відкритим прийнятим життєвим циклом замість необмеженого блокування. За `wait_for = accepted` webhook записує команду, окремий запис життєвого циклу update й типізовану історію `UpdateAccepted`, планує або повторно відправляє завдання workflow та повертає HTTP `202` без очікування застосування.

Кожна відповідь POST і GET update містить звичайні поля команди та `update_id`, `update_name`, `update_status`, `workflow_sequence`, `accepted_at`, `applied_at`, `rejected_at` і `closed_at`. Прийняті, але відкриті життєві цикли повертають `workflow_sequence = null`, `result = null`, `applied_at = null`, `rejected_at = null` та `closed_at = null`, доки worker не закриє життєвий цикл.

Коли іменовану мапу прийнято, рушій нормалізує її за порядком оголошення параметрів перед додаванням типізованої історії `UpdateAccepted` або `UpdateApplied`. Під час нормалізації необов’язкові параметри також заповнюються типовими значеннями PHP.

Кожен прийнятий або відхилений update має один стійкий запис `workflow_updates` із ключем `update_id`. Тому ініціатор може один раз виконати POST і згодом прочитати збережений життєвий цикл через GET без визначення стану із загальних записів команд.

Приклад update:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/updates/mark-ready" \
     -H "Content-Type: application/json" \
     -d '{"arguments":{"approved":true}}'
```

Відповідь завершеного update:

```json
{
  "outcome": "update_completed",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "update_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "update_name": "mark-ready",
  "update_status": "completed",
  "workflow_sequence": 1,
  "accepted_at": "2026-04-10T12:00:00.000000Z",
  "applied_at": "2026-04-10T12:00:01.000000Z",
  "rejected_at": null,
  "closed_at": "2026-04-10T12:00:01.000000Z",
  "wait_for": "completed",
  "wait_timed_out": false,
  "wait_timeout_seconds": 10,
  "rejection_reason": null,
  "validation_errors": [],
  "result": {
    "approved": true
  },
  "failure_id": null,
  "failure_message": null
}
```

Відповідь лише прийнятого update:

```json
{
  "outcome": null,
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "update_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "update_name": "mark-ready",
  "update_status": "accepted",
  "workflow_sequence": null,
  "accepted_at": "2026-04-10T12:00:00.000000Z",
  "applied_at": null,
  "rejected_at": null,
  "closed_at": null,
  "wait_for": "accepted",
  "wait_timed_out": false,
  "wait_timeout_seconds": null,
  "rejection_reason": null,
  "validation_errors": [],
  "result": null,
  "failure_id": null,
  "failure_message": null
}
```

Приклад перевірки життєвого циклу:

```bash
curl "https://example.com/webhooks/instances/order-123/updates/01J..." \
     -H "Content-Type: application/json"
```

Відповідь перевірки, поки update ще відкритий:

```json
{
  "outcome": null,
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "update_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "update_name": "mark-ready",
  "update_status": "accepted",
  "workflow_sequence": null,
  "accepted_at": "2026-04-10T12:00:00.000000Z",
  "applied_at": null,
  "rejected_at": null,
  "closed_at": null,
  "wait_for": "status",
  "wait_timed_out": false,
  "wait_timeout_seconds": null,
  "rejection_reason": null,
  "validation_errors": [],
  "result": null,
  "failure_id": null,
  "failure_message": null
}
```

Відповідь перевірки після закриття життєвого циклу:

```json
{
  "outcome": "update_completed",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "update_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "update_name": "mark-ready",
  "update_status": "completed",
  "workflow_sequence": 1,
  "accepted_at": "2026-04-10T12:00:00.000000Z",
  "applied_at": "2026-04-10T12:00:01.000000Z",
  "rejected_at": null,
  "closed_at": "2026-04-10T12:00:01.000000Z",
  "wait_for": "status",
  "wait_timed_out": false,
  "wait_timeout_seconds": null,
  "rejection_reason": null,
  "validation_errors": [],
  "result": {
    "approved": true
  },
  "failure_id": null,
  "failure_message": null
}
```

Маршрути перевірки не очікують на виконання. Вони лише читають збережений стійкий життєвий цикл, тому завжди повертають `wait_for = status`, `wait_timed_out = false` та `wait_timeout_seconds = null`.

Якщо вибраний запуск уже має раніше прийнятий signal, що очікує на застосування, подальший POST відхиляється як `rejected_pending_signal`, не виконуючи завдання workflow безпосередньо в шляху запиту ініціатора. Нечинні іменовані або позиційні дані відхиляються як `rejected_invalid_arguments` із `validation_errors`. POST до історичного вибраного запуску відхиляється як `rejected_not_current`.

Поточна матриця відповідей HTTP для маршрутів POST update:

- `200` з `outcome = update_completed`, якщо команду update прийнято й завершено
- `202` з `update_status = accepted`, якщо `wait_for = accepted` стійко приймає команду update й залишає її застосування worker workflow
- `202` з `update_status = accepted`, `wait_for = completed` та `wait_timed_out = true`, якщо webhook дочекався `wait_timeout_seconds` або типового налаштованого часу, але worker досі не закрив життєвий цикл update
- `401` за помилки автентифікації webhook
- `404` для невідомого ID екземпляра workflow
- `404` з `outcome = rejected_unknown_update` для невідомої стійкої назви update. Якщо запуск уже має типізований знімок контракту `WorkflowStarted` або старішу подію можна доповнити за першого сумісного прийняття, відхилення може бути визначене зі стійких метаданих запуску до звернення до поточного визначення
- `409` з `outcome = rejected_not_started`, якщо екземпляр ще не має поточного запуску
- `409` з `outcome = rejected_not_active`, якщо поточний запуск уже закрито
- `409` з `outcome = rejected_not_current`, якщо маршрут вибраного запуску адресує історичний запуск
- `409` з `outcome = rejected_pending_signal`, якщо раніше прийнятий signal ще має бути застосований до виконання update
- `422` з `outcome = rejected_invalid_arguments`, якщо дані update є масивом, але не відповідають оголошеному контракту через відсутні чи невідомі аргументи, невідповідність типів або порушення допустимості null
- `422` з `outcome = update_failed`, якщо тіло update спричиняє виняток
- `422`, якщо `arguments` наявне, але не є масивом. Така помилка структури запиту відхиляється до створення запису стійкої команди

Поточна матриця відповідей HTTP для маршрутів GET перевірки update:

- `200` після закриття життєвого циклу зі станом `update_status` як `completed`, `failed` або `rejected`
- `202`, поки `update_status = accepted`
- `401` за помилки автентифікації webhook
- `404` для невідомого ID екземпляра workflow, вибраного запуску або `update_id` у запитаній області

### Webhook відновлення й термінальних команд {#repair-and-terminal-command-webhooks}

Маршрути repair і термінальних команд доступні для екземпляра й вибраного запуску:

```text
POST /webhooks/instances/{workflowId}/repair
POST /webhooks/instances/{workflowId}/cancel
POST /webhooks/instances/{workflowId}/terminate
POST /webhooks/instances/{workflowId}/runs/{runId}/repair
POST /webhooks/instances/{workflowId}/runs/{runId}/cancel
POST /webhooks/instances/{workflowId}/runs/{runId}/terminate
```

`workflowId` тут є публічним ID екземпляра workflow. Маршрути екземпляра завжди визначають поточний активний запуск. Маршрути запуску також приймають вибраний `runId` і відхиляють історичний вибір зі стійким результатом `rejected_not_current`. До термінальних команд застосовується та сама конфігурація `workflows.webhook_auth`, що й до маршруту старту.

Приклад repair:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/repair" \
     -H "Content-Type: application/json"
```

Приклад cancel:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/cancel" \
     -H "Content-Type: application/json"
```

Приклад terminate:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/terminate" \
     -H "Content-Type: application/json"
```

Прийнята відповідь repair, коли runtime відновлює стійкий прогрес поточного запуску:

```json
{
  "outcome": "repair_dispatched",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "rejection_reason": null
}
```

Прийнята відповідь repair, коли поточний запуск уже має справний стійкий шлях відновлення:

```json
{
  "outcome": "repair_not_needed",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "rejection_reason": null
}
```

Прийнята відповідь cancel:

```json
{
  "outcome": "cancelled",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "rejection_reason": null
}
```

Прийнята відповідь terminate:

```json
{
  "outcome": "terminated",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "rejection_reason": null
}
```

Відхилена відповідь, коли екземпляр існує, але ще не має запуску:

```json
{
  "outcome": "rejected_not_started",
  "workflow_id": "order-123",
  "run_id": null,
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "instance_not_started"
}
```

Відхилена відповідь, коли поточний запуск уже закрито:

```json
{
  "outcome": "rejected_not_active",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "run_not_active"
}
```

Відхилена відповідь, коли маршрут repair, cancel або terminate адресує історичний запуск:

```json
{
  "outcome": "rejected_not_current",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": "01J...",
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "run",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "selected_run_not_current"
}
```

Поточна матриця відповідей HTTP для webhook repair, cancel і terminate:

- `200` з `outcome = repair_dispatched`, якщо repair повторно відправляє прострочене готове завдання, повторно отримує прострочену оренду або відтворює відсутнє стійке завдання, яке ще не почало виконуватися. Це включає завдання застосування прийнятих update і signal, записи яких втрачено до застосування команди
- `200` з `outcome = repair_not_needed`, якщо запуск уже має справний стійкий шлях відновлення або вибраний запуск уже перебуває в активній activity без запису завдання
- `200` з `outcome = cancelled` або `outcome = terminated` після успішного закриття поточного запуску
- `401` за помилки автентифікації webhook
- `404` для невідомого ID екземпляра workflow
- `409` з `outcome = rejected_not_started`, якщо екземпляр ще не має поточного запуску
- `409` з `outcome = rejected_not_active`, якщо поточний запуск уже закрито
- `409` з `outcome = rejected_not_current`, якщо маршрут вибраного запуску адресує історичний запуск

### Webhook describe {#describe-webhooks}

Маршрути describe для перевірки стану workflow через HTTP доступні для екземпляра й вибраного запуску:

```text
GET /webhooks/instances/{workflowId}/describe
GET /webhooks/instances/{workflowId}/runs/{runId}/describe
```

`workflowId` — публічний ID екземпляра workflow. Маршрут екземпляра повертає стан поточного запуску. Маршрут вибраного запуску описує конкретний запуск за ID, зокрема історичний або вже закритий.

Describe — це операція перевірки лише для читання. Вона не створює запис стійкої команди й не відтворює workflow. Вона повертає метадані екземпляра, стан поточного або вибраного запуску, поля стислого представлення й доступність дій із зафіксованих даних проєкції.

Приклад describe:

```bash
curl "https://example.com/webhooks/instances/order-123/describe"
```

Відповідь для активного workflow:

```json
{
  "found": true,
  "workflow_instance_id": "order-123",
  "workflow_type": "order-workflow",
  "workflow_class": "App\\Workflows\\OrderWorkflow",
  "business_key": "order-123",
  "run": {
    "workflow_run_id": "01J...",
    "run_number": 1,
    "is_current_run": true,
    "status": "waiting",
    "status_bucket": "running",
    "closed_reason": null,
    "compatibility": "build-a",
    "connection": "redis",
    "queue": "default",
    "started_at": "2026-04-12T12:00:00+00:00",
    "closed_at": null,
    "last_progress_at": "2026-04-12T12:00:01+00:00",
    "wait_kind": "signal",
    "wait_reason": "Waiting for signal [approved-by]"
  },
  "run_count": 1,
  "actions": {
    "can_signal": true,
    "can_query": true,
    "can_update": true,
    "can_cancel": true,
    "can_terminate": true
  },
  "reason": null
}
```

Відповідь для примусово завершеного workflow:

```json
{
  "found": true,
  "workflow_instance_id": "order-123",
  "workflow_type": "order-workflow",
  "workflow_class": "App\\Workflows\\OrderWorkflow",
  "business_key": "order-123",
  "run": {
    "workflow_run_id": "01J...",
    "run_number": 1,
    "is_current_run": true,
    "status": "terminated",
    "status_bucket": "failed",
    "closed_reason": "terminated",
    "compatibility": "build-a",
    "connection": "redis",
    "queue": "default",
    "started_at": "2026-04-12T12:00:00+00:00",
    "closed_at": "2026-04-12T12:01:00+00:00",
    "last_progress_at": "2026-04-12T12:01:00+00:00",
    "wait_kind": null,
    "wait_reason": null
  },
  "run_count": 1,
  "actions": {
    "can_signal": false,
    "can_query": false,
    "can_update": false,
    "can_cancel": false,
    "can_terminate": false
  },
  "reason": null
}
```

Доступність дій показує, чи може операція виконатися зараз: закриті запуски не приймають команди, суто віддалені workflow не можуть обслуговувати query або update локально, а непоточні запуски не можуть отримувати signal, update, скасування або примусове завершення.

Приклад describe для вибраного запуску:

```bash
curl "https://example.com/webhooks/instances/order-123/runs/01J.../describe"
```

Відповідь вибраного запуску містить ті самі дані, але `is_current_run` матиме значення `false` для історичного запуску, а всі дії зміни стану також матимуть `false`.

Відповідь, коли екземпляр не знайдено:

```json
{
  "found": false,
  "workflow_instance_id": "order-123",
  "workflow_type": null,
  "workflow_class": null,
  "business_key": null,
  "run": null,
  "run_count": 0,
  "actions": {
    "can_signal": false,
    "can_query": false,
    "can_update": false,
    "can_cancel": false,
    "can_terminate": false
  },
  "reason": "instance_not_found"
}
```

Відповідь, коли екземпляр існує, але вибраний запуск не знайдено:

```json
{
  "found": true,
  "workflow_instance_id": "order-123",
  "workflow_type": "order-workflow",
  "workflow_class": "App\\Workflows\\OrderWorkflow",
  "business_key": "order-123",
  "run": null,
  "run_count": 1,
  "actions": {
    "can_signal": false,
    "can_query": false,
    "can_update": false,
    "can_cancel": false,
    "can_terminate": false
  },
  "reason": "run_not_found"
}
```

Поточна матриця відповідей HTTP для webhook describe:

- `200`, якщо екземпляр знайдено, незалежно від того, чи запуск активний, закритий або історичний
- `200`, якщо екземпляр знайдено, але вибраний запуск не існує (`reason = run_not_found`)
- `401` за помилки автентифікації webhook
- `404`, якщо ID екземпляра workflow не існує (`reason = instance_not_found`)


### Webhook старту площини керування {#control-plane-start-webhook}

Маршрут старту площини керування безпосередньо приймає стійкий ключ типу workflow без вимоги локально знайти клас workflow. Це рекомендований шлях старту для зовнішнього споживача, який керує workflow через ключі типів, а не псевдоніми PHP-класів.

```text
POST /webhooks/control-plane/start
```

Тіло запиту приймає:

| Поле | Тип | Обов’язкове | Опис |
| --- | --- | --- | --- |
| `workflow_type` | string | так | Стійкий ключ типу workflow |
| `instance_id` | string | ні | Публічний ID екземпляра workflow, заданий ініціатором |
| `arguments` | string | ні | Серіалізовані аргументи з позначкою кодека |
| `connection` | string | ні | Перевизначення підключення черги |
| `queue` | string | ні | Перевизначення назви черги |
| `business_key` | string | ні | Бізнес-ключ, заданий ініціатором |
| `labels` | object | ні | Позначки видимості |
| `memo` | object | ні | Неіндексовані метадані |
| `duplicate_start_policy` | string | ні | `reject_duplicate` або `return_existing_active` |

Приклад запиту:

```bash
curl -X POST "https://example.com/webhooks/control-plane/start" \
     -H "Content-Type: application/json" \
     -d '{
           "workflow_type": "order-workflow",
           "instance_id": "order-123",
           "arguments": "{\"orderId\":123}",
           "connection": "redis",
           "queue": "default",
           "business_key": "order-123",
           "labels": {"tenant": "acme"}
         }'
```

Відповідь для щойно розпочатого workflow:

```json
{
  "started": true,
  "workflow_instance_id": "order-123",
  "workflow_run_id": "01J...",
  "workflow_type": "order-workflow",
  "outcome": "started_new",
  "task_id": "01J...",
  "reason": null
}
```

Якщо `instance_id` пропущено, рушій автоматично створює ID екземпляра на основі ULID.

Якщо ключ типу workflow відповідає локально доступному класу через `workflows.v2.types.workflows` або атрибут `#[Type(...)]`, повний знімок контракту команд і маршрутизація застосовуються під час старту. Якщо клас локально недоступний, екземпляр створюється з ключем типу й явною маршрутизацією з параметрів. Фіксація контракту команд та відбитка визначення відкладається до worker, який отримає перше завдання. Тому зовнішній споживач може запускати workflow за ключами типів, які здатна знайти лише група worker.

Поточна матриця відповідей HTTP для webhook старту площини керування:

- `202` з `outcome = started_new` після створення нового запуску
- `200` з `outcome = returned_existing_active` за повторного використання наявного активного запуску
- `409` з `outcome = rejected_duplicate` після відхилення повторного старту
- `401` за помилки автентифікації webhook
- `422`, якщо `workflow_type` відсутнє або `instance_id` нечинне

Контракт `WorkflowControlPlane` також доступний як singleton у контейнері для програмного використання. Отримайте `Workflow\V2\Contracts\WorkflowControlPlane` з контейнера Laravel, щоб викликати `start()`, `signal()`, `query()`, `update()`, `cancel()`, `terminate()` та `describe()` безпосередньо з PHP-коду, тестів або команд Artisan.

Система webhook охоплює явне прийняття старту за псевдонімом, webhook команд signal, update, query, describe, repair, cancel і terminate для екземпляра й вибраного запуску, маршрути опитування завдань workflow та activity і маршрут старту площини керування для створення workflow за ключем типу.
