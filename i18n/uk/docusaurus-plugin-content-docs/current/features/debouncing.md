---
title: Групування ревізій після паузи
description: Оновлюйте сутність після паузи в надходженні сигналів за допомогою стійких очікувань.
---

# Групування ревізій після паузи {#debouncing-and-coalescing}

## Дочекайтеся паузи {#quiet-window}

Використовуйте стабільний ідентифікатор workflow для кожної сутності. Зберігайте найбільшу додатну ревізію й оновлюйте до цієї версії. Проміжні ревізії навмисно пропускаються. Застосовуйте цей підхід для переходу до останнього стану. Такі операції, як окремі платежі, обробляйте в потоці, який виконує кожен запит.

Кожен сигнал відкриває нове очікування з обмеженням часу. Результат `null` завершує паузу. Записані очікування й таймери визначають повторне відтворення.

```php
use Workflow\V2\Activity;
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, await, continueAsNew};

#[Type('docs.entity-debounce')]
#[Signal('changed', [
    ['name' => 'revision', 'type' => 'int', 'allows_null' => false],
])]
final class EntityDebounce extends Workflow
{
    public function handle(
        string $entity,
        int $pending = 0,
        int $applied = 0,
        int $batches = 0,
    ): mixed {
        while (true) {
            if ($pending <= $applied) {
                $pending = max($applied, await('changed'));
            }

            while (($next = await('changed', timeout: 1)) !== null) {
                $pending = max($pending, $next);
            }

            if ($pending <= $applied) {
                continue;
            }

            activity(ApplyRevision::class, $entity, $pending);
            $applied = $pending;

            if (++$batches >= 2) {
                return continueAsNew($entity, 0, $applied, 0);
            }
        }
    }
}

#[Type('docs.apply-revision')]
final class ApplyRevision extends Activity
{
    public function handle(string $entity, int $revision): array
    {
        return ['entity' => $entity, 'revision' => $revision];
    }
}
```

Зареєструйте тип workflow, щоб новий worker або наступний запуск знайшов те саме визначення.

```php
config(['workflows.v2.types.workflows' => [
    'docs.entity-debounce' => EntityDebounce::class,
]]);
```

## Приймайте зміни атомарно {#embedded-intake}

```php
use Workflow\V2\WorkflowStub;

$entity = 'customer-42';
$revision = 1;
$receipt = WorkflowStub::make(EntityDebounce::class, 'refresh:'.$entity)
    ->signalWithStart('changed', [$revision], $entity);
```

Квитанція підтверджує стійке прийняття. Дія ще може очікувати виконання. Вбудований `signalWithStart` запускає відсутній екземпляр, надсилає сигнал його активному запуску або створює новий запуск після закриття. Звичайні політики запуску залишають закритий екземпляр закритим.

## Зберігайте очікувані зміни й обмежуйте історію {#pending-input-and-continuation}

Сигнал, отриманий під час дії, зберігається до наступного очікування. Наступна група має власну паузу. Поточна дія триває. Передайте застосовану ревізію та вже прочитану очікувану ревізію в аргументах продовження. Очікувані сигнали, адресовані екземпляру, можуть перейти до наступного запуску, якщо їхній обробник оголошено. Команда, адресована запуску, залишається прив’язаною до вибраного запуску.

Виміряйте історію для типового сплеску. `SignalReceived`, `SignalApplied`, очікування, таймери й дії додають події. Безперервний потік може заповнити історію до завершення паузи. Обмежуйте вхід і залишайте запас для продовження. Continue-as-new зберігає кінцевий строк виконання.

Демонстраційна дія повертає вибрану ревізію. Для справжнього зовнішнього ефекту використовуйте в цільовій системі ключ ідемпотентності, наприклад `(сутність, ревізія)`. Повторна спроба дії може повторити зовнішній запит навіть після дедуплікації сигналу.
