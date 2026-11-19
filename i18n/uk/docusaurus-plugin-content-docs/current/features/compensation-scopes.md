---
sidebar_position: 12
title: Області компенсації
description: Зберігайте зобов'язання компенсації довше за запуск workflow, який їх створив, і відновлюйте їх після закриття запуску у вбудованих Laravel workflow.
---

# Області компенсації {#compensation-scopes}

Цей посібник описує збережену компенсацію у вбудованих Laravel workflow з
`Workflow\V2\Workflow`. [Saga](sagas.md) виконує компенсацію всередині запуску,
який її зареєстрував. Область компенсації зберігає кожне зобов'язання в durable-реєстрі,
тож зобов'язання можна компенсувати навіть після того, як цей запуск завершився,
завершився помилкою або був скасований.

Використовуйте область, коли скасування може надійти із запізненням, наприклад після
завершення workflow відвантаження, коли замовлення скасовують через кілька днів, або
коли пряма операція може дати ефект, не повернувши записаного результату.

## Доступність і стабільність {#availability-and-stability}

| Частина | Статус |
| --- | --- |
| `DurableScope`, `RegisteredObligation`, `Obligation`, `ScopeIdentity` | Стабільна з 2.31.0 |
| `ScopedOperation`, `OperationContext`, `ForwardResult`, `Resolution`, `HandlerRegistry` | Стабільна з 2.31.0 |
| `ScopeAuthorization`, `ScopeRecovery::request()`, `ScopeRecovery::describe()`, `ScopeRetention::release()` | Стабільна з 2.31.0 |
| `DurableScope::reserveChild()` і допуск кореня (`RootReservationStore`) | Експериментальна |
| Класи з позначкою `@internal` (activity, збереження даних, рушій відновлення) | Не є публічним API |

API областей уперше з'явилися як експериментальні у 2.29.0. Автоматичне відновлення
після закриття початкового запуску, розклад повторних спроб відновлення та `describe()`
з'являються у 2.31.0. До 2.31.0 увесь API експериментальний і може змінитися в
мінорному випуску. Починаючи з 2.31.0, стабільні частини дотримуються
[політики сумісності 2.x](../compatibility.md). Початкова підтримка обмежена
вбудованим Laravel і послідовною компенсацією.

## Як це працює {#how-it-works}

Область ідентифікується за `(application, namespace, key, generation)`. Її пряма
робота належить одному початковому запуску, тому обирайте покоління, унікальне для
цього запуску. Кожне зобов'язання реєструється разом зі своєю компенсацією до того,
як буде надіслано його прямий ефект. Реєстр записує:

- закритий тип і версію обробника, ніколи не PHP-замикання;
- стабільний ID операції, за яким обробник звіряє стан із провайдером;
- переносимі вхідні дані (не більше 16 KiB, 512 значень і глибини 8);
- результати прямої операції та компенсації з посиланнями на докази.

Поки початковий запуск відкритий, його скасування виконує нативну saga, яка компенсує
у порядку, зворотному до порядку реєстрації. Після закриття запуску канонічний
workflow відновлення компенсує ті самі зобов'язання з реєстру. Він ніколи не
відкриває початковий запуск повторно і не змінює його історію.

## Налаштування хоста {#set-up-the-host}

Зв'яжіть політику авторизації області та закритий реєстр обробників у service
provider. Політика повертає свою версію політики або викидає виняток, щоб відмовити.

```php
use App\Compensation\OrderScopeAuthorization;
use App\Compensation\StockReservation;
use Workflow\V2\Compensation\Execution\HandlerRegistry;
use Workflow\V2\Compensation\Security\ScopeAuthorization;

$this->app->singleton(ScopeAuthorization::class, OrderScopeAuthorization::class);
$this->app->singleton(HandlerRegistry::class, static fn (): HandlerRegistry => new HandlerRegistry([
    'stock.reserve' => ['1' => new StockReservation()],
]));
```

`ScopeAuthorization::assertAllowed($scope, $principal, $operation)` викликається з
`register`, `forward`, `compensate`, `participate`, `request`, `release` або
`inspect`. Визначайте principal на основі довіреної політики застосунку, ніколи не
з payload запиту. Запустіть міграції пакета; вони створюють таблиці реєстру в
з'єднанні сховища workflow.

## Реєстрація зобов'язань у workflow {#register-obligations-in-a-workflow}

```php
use Workflow\V2\Attributes\Type;
use Workflow\V2\Compensation\Definition\Obligation;
use Workflow\V2\Compensation\Definition\ScopeIdentity;
use Workflow\V2\Compensation\DurableScope;
use Workflow\V2\Exceptions\WorkflowCancellationRequestedException;
use Workflow\V2\Workflow;

#[Type('order')]
final class OrderWorkflow extends Workflow
{
    public function handle(array $identity, array $shipment): array
    {
        $scope = new DurableScope($this, ScopeIdentity::fromArray($identity), 'order-service');
        try {
            $scope->execute(new Obligation('reserve-stock', 'stock.reserve', '1', ['sku' => 'sku-1']));
            $scope->participate('shipment', ScopeIdentity::fromArray($shipment));
            // ... start the shipment workflow, wait for business events ...

            return ['status' => 'completed'];
        } catch (WorkflowCancellationRequestedException $cancelled) {
            self::cancellationShield(fn () => $this->compensate());

            return self::cancellationShield(static fn () => $scope->verifyCompensation());
        }
    }
}
```

- `execute()` реєструє зобов'язання, а потім виконує його пряму операцію.
- `register()` лише реєструє і повертає `RegisteredObligation`. Викличте його
  `execute()` пізніше в тому самому workflow, коли порядок компенсації має
  відрізнятися від порядку надсилання.
- `participate()` реєструє дочірню область. Послідовна компенсація чекає на
  перевірений реєстр цієї дочірньої області, перш ніж компенсувати попередні
  зобов'язання батьківської області. Відсутня або неперевірена дочірня область
  зупиняє попередню роботу батьківської області.

## Написання обробника {#write-a-handler}

```php
use InvalidArgumentException;
use Workflow\V2\Compensation\Execution\ForwardResult;
use Workflow\V2\Compensation\Execution\OperationContext;
use Workflow\V2\Compensation\Execution\Resolution;
use Workflow\V2\Compensation\Execution\ScopedOperation;

final class StockReservation implements ScopedOperation
{
    public function assertInput(array $input): void
    {
        if (! is_string($input['sku'] ?? null)) {
            throw new InvalidArgumentException('A SKU is required.');
        }
    }

    public function execute(OperationContext $context): ForwardResult
    {
        // Idempotent by operation ID: a retry or a lost acknowledgement finds the same reservation.
        $reservation = Stock::reserve($context->operationId, $context->obligation->input['sku']);

        return ForwardResult::observed(['reservation' => $reservation->id], ['stock:' . $reservation->id]);
    }

    public function compensate(OperationContext $context): Resolution
    {
        if (! Stock::release($context->operationId)) {
            return Resolution::unknown('stock-release-pending');
        }

        return Resolution::verified(['stock-release:' . $context->operationId], true);
    }
}
```

Обробники можуть виконуватися більше одного разу для тієї самої операції, тому
зробіть обидва методи ідемпотентними за `operationId`. Повертайте
`ForwardResult::unknown()`, коли результат у провайдера невизначений. Повертайте
`Resolution::verified()` лише за наявності доказу, що ефект скасовано; повернення
з callback, тайм-аут або закритий запуск таким доказом не є. `Resolution::unknown()`
залишає зобов'язання невирішеним і дає змогу виконатися нативним повторним спробам.

## Скасування та відновлення {#cancel-and-recover}

Запитуйте компенсацію зі стабільним ключем запиту:

```php
use Workflow\V2\Compensation\Recovery\ScopeRecovery;

$result = app(ScopeRecovery::class)->request($scope, 'cancel-order-42', 'order-service', 'customer-cancelled');
```

- Якщо початковий запуск ще відкритий, запит просить його скасуватися, і його saga
  виконує компенсацію.
- Якщо цей запуск закривається, а область досі неперевірена, watchdog задач
  спрямовує той самий запит до канонічного відновлення під час наступного проходу.
  Він працює в циклах worker черги та в `workflow:v2:repair-pass` і спершу повторно
  авторизує початковий principal. Паралельні проходи або конкурентний ручний запит
  запускають один запуск відновлення.
- Якщо запуск уже закритий, запит одразу запускає канонічне відновлення.

Запуски відновлення роблять до шести спроб на одну компенсацію. Між спробами вони
чекають 1, 2, 5 і 10 секунд, а потім одну оренду activity плюс один прохід
відновлення задач, щоб спробу worker, який аварійно завершився, було повернуто до
останньої спроби. Перевірка дочірньої області або новий авторизований запит одразу
пробуджує повторну спробу, що очікує. Стійка помилка все одно завершує запуск
відновлення помилкою, а зобов'язання залишається невирішеним.

Перевірте результат за допомогою `describe()`. Цей метод лише читає дані й потребує
авторизації `inspect`:

```php
$view = app(ScopeRecovery::class)->describe($scope, 'order-service');
// scopeStatus, originStatus, recoveryStatus, automaticRecovery, refusal, nextAction, unresolved
```

`nextAction` має значення `submit_fresh_authorized_request`, коли автоматичне
відновлення було відхилено (`automaticRecovery: recovery_authorization_failed`) або
запуск відновлення завершився помилкою. У такому разі надішліть новий ключ запиту.
Повторення ключа запиту повертає його початкову квитанцію і ніколи не запускає ще
один запуск.

Реєстр області врегульовує компенсацію. Бізнес-рішення, наприклад позначити
замовлення як `cancelled`, залишається кроком вашого застосунку після того, як
`scopeStatus` стане `verified`. Рекомендований шаблон — listener, який завершує
бізнес-скасування, коли запуск відновлення завершується, як це робить приклад
провайдера в репозиторії рушія.

## Зберігання, оновлення та відкат {#retention-upgrade-and-rollback}

- `ScopeRetention::release($scope, $principal)` видаляє збережені вхідні дані та
  результати прямих операцій після перевірки. Він залишає tombstone, тож старе
  покоління або ключ запиту більше ніколи не можуть бути прийняті. Ніщо не спливає
  автоматично, а очищення історії запусків ніколи не видаляє реєстр.
- Відкат схеми відхиляється ще до того, як будь-яка міграція виконає `down()`,
  поки реєстр містить хоча б одну область, зокрема звільнений tombstone. Щоб
  повернутися назад, відновіть резервну копію бази даних, зроблену до оновлення.
- Даунгрейд лише пакета зберігає реєстр. Відновлення продовжиться після повторного
  оновлення. Не виконуйте даунгрейд, поки відкритий запуск відновлення.

## Гарантії та обмеження {#guarantees-and-limits}

Починаючи з 2.31.0, стабільні API не змінюються несумісно в межах 2.x. Записані
історії компенсації відтворюються через replay у кожному пізнішому випуску 2.x, а
нова поведінка з'являється лише за записаним маркером версії. Міграції реєстру
лише додають.

Ці обмеження є мінімальними значеннями, які можуть зрости, але не зменшаться:

- 256 зобов'язань на область, 16 дочірніх областей на батьківську, один рівень вкладеності;
- 128 запитів на область;
- 32 посилання на докази розміром не більше 128 байтів на один результат.

Не гарантуються: час спрацювання watchdog, точні інтервали повторних спроб (лише те,
що відновлення триває довше за одне відновлення оренди), структура рядків реєстру та
все, що позначено `@internal`. Зовнішні ефекти рівно один раз ніколи не обіцяються;
звіряння з провайдером за ID операції — відповідальність вашого обробника.

[Посібник з областей компенсації](https://github.com/durable-workflow/workflow/blob/main/docs/compensation-scopes.md)
у репозиторії рушія документує повний контракт, зокрема експериментальні API
резервування дочірніх областей і допуску кореня.
