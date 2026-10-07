---
sidebar_position: 6
---

# Очікування умови {#condition-waits}

`await($condition, $conditionKey = null)` дає змогу очікувати на умову без порушення replay. Використовуйте його, коли предикат залежить лише від стану workflow, який уже отримано зі збережених вхідних даних, наприклад update, результатів activity або дочірніх workflow. Щоб безпосередньо отримати значення іменованого зовнішнього signal, викличте `await('name')` — див. [Signals](./signals.md).

Стан для очікування умови змінює метод update замість методів, які змінюють стан через signal:

```php
use Workflow\UpdateMethod;
use function Workflow\V2\await;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

#[Type('approval-workflow')]
class MyWorkflow extends Workflow
{
    private bool $ready = false;

    public function handle(): void
    {
        await(fn () => $this->ready, 'approval.ready');
    }

    #[UpdateMethod]
    public function setReady(bool $ready = true): array
    {
        $this->ready = $ready;

        return ['ready' => $this->ready];
    }
}
```

Необов’язковий ключ умови — це стабільна позначка очікування для оператора, придатна для URL. Під час replay перевіряється раніше записаний ключ, тому нове розгортання не зможе випадково використати той самий крок workflow для іншого предиката. Безпечну зміну workflow між розгортаннями описано в розділі [Versioning](./versioning.md).

Очікування умови з тайм-аутом описано в розділі [Signal + Timer](./signal+timer.md).

**Важливо:** `await()` слід використовувати лише у workflow, а не в activity.
