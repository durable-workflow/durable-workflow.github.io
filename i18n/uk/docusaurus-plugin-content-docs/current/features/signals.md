---
sidebar_position: 1
title: Signal
description: Надсилайте типізовані зовнішні команди до активних workflow та дізнайтеся про валідацію, маршрутизацію й очікування signal.
tags:
  - commands
  - signals
  - human-in-the-loop
keywords:
  - сигнали workflow
  - команда signal
  - workflow з участю людини
---

import SignalSimulator from '@site/src/components/SignalSimulator';

# Signal {#signals}

Signal дозволяють спричиняти події у workflow ззовні. Це корисно для реакції на зовнішні події, втручання *людини в процес* чи повідомлення про завершення зовнішнього завдання. Для повторюваних упорядкованих вхідних даних зі стійким просуванням курсора використовуйте [потоки повідомлень](./message-streams.md).

## Прийняття та закриття {#acceptance-and-closure}

`signal_received` підтверджує стійке прийняття, але не обробку сигналу кодом
workflow. Якщо потрібне підтвердження бізнес-операції, перевірте збережений
стан сигналу та історію.

У Core 2.7.0 і сумісному Server придатні сигнали, прийняті під час віддаленого
завдання workflow, отримують можливість доставки перед успішним закриттям. Прийняті сигнали
для екземпляра, оголошені його контрактом команд, переходять через [continue-as-new](./continue-as-new.md) зі
сталими ідентифікаторами, аргументами та порядком. Сигнал для конкретного
запуску ніколи не переходить до іншого запуску.

Пізніша реєстрація Worker не додає сталого оголошення сигналів до запуску,
створеного без нього.
Якщо runtime не може встановити можливість доставки, прийнятий сигнал отримує
явний стан відхилення, описаний нижче.

Якщо запуск закривається без застосування сигналу, сигнал отримує стан
`rejected`, причину `run_closed_before_signal_applied`, час закриття та подію
`SignalRejected`. Це стосується невикористаного буферизованого сигналу під час
звичайного завершення та сигналів, які неможливо застосувати до помилки,
скасування чи тайм-ауту. Попереднє підтвердження прийняття залишається дійсним.
Коли потрібен збережений результат обробки, використовуйте
[update](./updates.md), а не лише підтвердження прийняття.

Перед оновленням компонента запису до Core 2.7.0 дочекайтеся завершення поточної
роботи й оновіть усі embedded-компоненти та прямі читачі бази даних, зокрема Waterline, якщо він читає ту
саму базу. Старі читачі не розпізнають `SignalRejected`; не залишайте їх поруч
із новим компонентом запису й не повертайте стару версію після збереження події.

## Очікування іменованих signal {#named-signal-waits}

Workflow безпосередньо викликає `await('signal-name')`. Наступна прийнята команда signal із цією назвою продовжує запуск та повертає детерміноване значення призупиненому workflow.

```php
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;
use function Workflow\V2\await;

#[Type('order-approval')]
#[Signal('approved-by', [
    ['name' => 'approvedBy', 'type' => 'string'],
])]
final class OrderApprovalWorkflow extends Workflow
{
    public function handle(): array
    {
        $approvedBy = await('approved-by');

        return [
            'approved_by' => $approvedBy,
            'workflow_id' => $this->workflowId(),
            'run_id' => $this->runId(),
        ];
    }
}
```

Надішліть signal із PHP за публічним ідентифікатором екземпляра:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$result = $workflow->attemptSignalWithArguments('approved-by', [
    'approvedBy' => 'Taylor',
]);

$result->accepted();    // true
$result->outcome();     // "signal_received"
$result->commandId();   // Durable signal-command id
$result->instanceId();  // "order-123"
```

Поведінка signal:

- Заздалегідь оголосіть кожну назву зовнішнього signal через повторюваний атрибут класу `#[Signal('signal-name')]`. За потреби додайте впорядкований контракт параметрів.
- Команди signal спрямовані на публічний ідентифікатор екземпляра workflow, а не запуску, тому ланцюжки continue-as-new зберігають той самий публічний маршрут signal.
- За наявності контракту параметрів прийом відхиляє некоректні дані як `rejected_invalid_arguments` із машинозчитуваними `validation_errors`.
- Без контракту `await('name')` повертає `true`, якщо аргументів немає, єдиний аргумент, якщо передано один, або повний масив аргументів, якщо передано кілька.
- Невідомі назви signal відхиляються як `rejected_unknown_signal`. Signal для закритого чи незапущеного екземпляра відхиляються як `rejected_not_active` або `rejected_not_started`.

## Сумісна еволюція даних сигналу {#evolve-a-signal-payload}

Використовуйте один оголошений аргумент-мапу для даних застосунку, які потребують сумісних доповнень. У цьому прикладі додавання необов’язкової інформаційної `note` зберігає `schema_version: 1`. Старий відправник не передає це поле, а новіший читач використовує `null`. Старий читач може його проігнорувати, не змінюючи рішення про схвалення. Не використовуйте ігнороване поле для зміни, що має впливати на авторизацію або бізнес-поведінку.

```php
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;
use function Workflow\V2\await;

#[Type('map-approval')]
#[Signal('reviewed', [
    ['name' => 'payload', 'type' => 'array', 'allows_null' => false],
])]
final class MapApprovalWorkflow extends Workflow
{
    public function handle(): array
    {
        $payload = await('reviewed');
        if (! is_array($payload) || array_is_list($payload)
            || ($payload['schema_version'] ?? null) !== 1) {
            return ['status' => 'rejected_payload', 'reason' => 'unsupported_shape_or_version'];
        }
        if (! in_array($payload['decision'] ?? null, ['approved', 'rejected'], true)) {
            return ['status' => 'rejected_payload', 'reason' => 'invalid_decision'];
        }
        $note = $payload['note'] ?? null;
        if ($note !== null && ! is_string($note)) {
            return ['status' => 'rejected_payload', 'reason' => 'invalid_note'];
        }

        return ['status' => 'processed', 'decision' => $payload['decision'], 'note' => $note];
    }
}
```

Обидва відправники використовують той самий оголошений параметр `payload`:

```php
use Workflow\V2\WorkflowStub;

$oldPayload = ['schema_version' => 1, 'decision' => 'approved'];
$newPayload = [...$oldPayload, 'note' => 'review λ'];

$receipt = WorkflowStub::load('review-123')->attemptSignalWithArguments(
    'reviewed',
    ['payload' => $newPayload], // An old sender passes $oldPayload here.
);
```

Оголошення перевіряє зовнішній аргумент. Скаляр замість `payload` відхиляється під час приймання. Тип `array` не перевіряє вкладені поля й не відрізняє список PHP від мапи з рядковими ключами. Workflow перевіряє ці правила застосунку до виконання бізнес-роботи. Тому непідтримувана версія або некоректна `note` може бути довговічно прийнята, а згодом дати `rejected_payload` як результат workflow. Цей результат відокремлений від квитанції `signal_received`.

Зберігайте обов’язкові поля та їхню семантику. Визначте, чи означають відсутнє поле й явний `null` те саме; тут для `note` це так. Зберігайте декодери старих записаних значень. Несумісна структура або зміна значення потребує нової версії формату застосунку та явного плану сумісності, а не просто ще одного необов’язкового поля.

Запуск зберігає оголошення сигналів і типові значення, записані на момент старту. Зміна поточної сигнатури обробника чи типового значення не переписує цей контракт. Додавання ще одного аргументу сигналу верхнього рівня відрізняється від додавання ключа в наявну мапу. Не вважайте, що старий запуск прийме його або перейме нове типове значення. Нові запуски можуть записати нове оголошення, тоді як старі зберігають своє.

Цей формат застосунку відокремлений від фіксованої [транспортної схеми Avro Value](/docs/polyglot/avro-value-protocol). Клієнти PHP, Python і Rust у сервісному режимі кодують підтримувані мапи, списки та скалярні значення через свої SDK. Dataclass Python, доменний об’єкт PHP або struct Rust потребує відповідного явного адаптера значень. Поле версії застосунку не є реєстром схем. API сервісного режиму наведено в [довідниках SDK](/docs/sdk-neutrality).

Сумісність даних також не дозволяє зміненому визначенню workflow отримати наявний запуск. Залишайте доступним потрібний сумісний worker або build. Обмеження відбитка вихідного коду в Server 2.9.7 відстежується окремо в [Server #518](https://github.com/durable-workflow/server/issues/518). Цей рецепт не обходить його й не обіцяє, що поточний обробник замінить код старого запуску. Використовуйте [версіонування workflow](./versioning.md) для безпечних щодо replay змін коду в межах підтримуваного контракту маршрутизації runtime.

Та сама межа записаних значень поширюється на аргументи та результати активностей: повторні спроби й replay можуть зустрічати старі структури. Підтримуйте сумісність їхніх адаптерів із цими значеннями замість переписування історії або покладання на поточні типові значення моделі.

## Після невизначеної відповіді {#after-an-uncertain-response}

Тайм-аут чи втрата відповіді можливі після durable-приймання сигналу.
Подальша відповідь про закрите чи відсутнє виконання описує пізніший запит;
вона не доводить, чи застосовано початковий сигнал. Між перевіркою статусу
та надсиланням workflow теж може закритися чи перейти до нового виконання.

Для розслідування зберігайте початкові namespace, workflow ID, назву сигналу,
аргументи й ключ операції застосунку. Повтор має відповідати фактичному
контракту обробки дублікатів цільового runtime. Відмова повтору сама по собі
не є підставою запускати новий workflow.

Дивіться [відновлення невизначеної команди](./updates.md#recover-after-an-uncertain-response)
для перевірки збережених update та звіряння стану в застосунку.

## Особа відправника та авторизація {#sender-identity-and-authorization}

`approvedBy` — це дані застосунку. Рядок `Taylor` у прикладі не підтверджує
особу автентифікованого відправника. Контракт `#[Signal]` перевіряє назву та
аргументи signal. Ваш Laravel-застосунок має автентифікувати користувача й
перевірити його право на операцію до приймання signal.

Наприклад, endpoint погодження може використовувати автентифікованого
користувача та policy замовлення. У цьому застосунку модель `Order` зберігає
поля `workflow_instance_id` і `workflow_namespace`, а зареєстрована policy
`approve` перевіряє доступ користувача до замовлення. Endpoint не бере особу
відправника чи маршрут workflow з тіла запиту:

```php
use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Route;
use Workflow\V2\CommandContext;
use Workflow\V2\WorkflowStub;

Route::post('/orders/{order}/approve', function (Request $request, Order $order) {
    $user = $request->user();
    Gate::forUser($user)->authorize('approve', $order);

    $actorId = (string) $user->getAuthIdentifier();
    $context = CommandContext::phpApi()->withPrincipal('user', $actorId);

    $result = WorkflowStub::load(
        $order->workflow_instance_id,
        $order->workflow_namespace,
    )->withCommandContext($context)->attemptSignalWithArguments('approved-by', [
        'approvedBy' => $actorId,
    ]);

    return response()->json([
        'accepted' => $result->accepted(),
        'outcome' => $result->outcome(),
        'command_id' => $result->commandId(),
    ], $result->accepted() ? 202 : 409);
})->middleware('auth');
```

Policy перевіряється до завантаження workflow та надсилання signal. Таку саму
policy мають застосовувати всі точки погодження, зокрема webhook та
адміністративні endpoints, які можуть надіслати цей signal. Усередині workflow
`await('approved-by')` повертає записаний аргумент. Він не повертає об'єкт
автентифікованого відправника й не виконує додаткової перевірки дозволів.

Аудитна особа команди зберігається окремо від аргументу.
`withCommandContext()` записує контекст у `WorkflowCommand`, визначений через
`commandId()`. Поле `context.principal` та методи `principalType()`,
`principalId()` і `principalLabel()` доступні для аудиту в коді host-застосунку.
Пов'язані історія та операторські подання можуть показувати записану особу
команди. Відсутність цих даних не підтверджує особу відправника.

`CommandContext::withPrincipal()` записує дані, надані довіреним кодом
host-застосунку. Він не автентифікує користувача й не надає права на signal.
Не формуйте цей контекст із довільного вводу клієнта та не звертайтеся до
поточної HTTP-сесії чи актуальних дозволів у базі даних під час
детермінованого replay workflow.

SDK-виклики в service mode використовують HTTP-авторизацію Server замість
цього embedded-маршруту. Дивіться
[авторизацію та атрибуцію signal](/docs/polyglot/namespace-auth-workers#signal-authorization-and-attribution),
щоб налаштувати облікові дані, довірені шлюзи й аудитну особу.

<SignalSimulator />

**Важливо:** функцію `await()` слід використовувати лише у workflow, а не в activity.

Для очікування умов, коли предикат над стійким станом має стати істинним, дивіться [очікування умов](./condition-waits.md). Для `await` із тайм-аутом дивіться [signal + timer](./signal+timer.md). Для повторюваних потоків inbox/outbox дивіться [потоки повідомлень](./message-streams.md).

## Запуск цього шаблону {#run-this-pattern}

Workflow, що запускається через webhook у [Sample App](/docs/sample-app), — виконуваний приклад шаблону очікування іменованого signal із цієї сторінки:

```bash
php artisan app:webhook
```

`App\Workflows\Webhooks\WebhookWorkflow` запускається через вхідний HTTP webhook і зупиняється на `await('ready')` до надходження відповідного signal. Відкрийте Waterline під час очікування: подія `SignalReceived` з’явиться в момент прийняття signal.
