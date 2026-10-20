---
title: Сервісні операції
description: Викликайте операцію іншого namespace з вбудованого PHP workflow.
---

# Сервісні операції {#service-operations}

Використовуйте сервісну операцію, коли workflow потрібен довговічний результат від сервісу іншого namespace. Виклик адресує зареєстровані endpoint, сервіс і операцію. Runtime записує виклик та його результат, тому інший worker може відтворити той самий результат.

Дочірні workflow та signal залишаються у вихідному namespace. Зміна імені типу дочірнього workflow або черги завдань не перетинає цю межу. Для роботи, опублікованої в іншому namespace того самого кластера Durable Workflow, використовуйте сервісну операцію.

## Виклик із вбудованого PHP {#call-from-embedded-php}

Зареєструйте цільовий каталог і його обробник до запуску workflow-викликача. [Посібник із сервісного режиму](../polyglot/service-operations.md) пояснює спільний каталог, політику меж і окремо опубліковані API SDK.

```php
use Workflow\V2\Support\ServiceOperationOptions;
use Workflow\V2\Workflow;

final class CreateInvoice extends Workflow
{
    public function handle(int $invoiceId): mixed
    {
        $call = self::serviceOperation(
            'billing',
            'invoices',
            'create',
            [$invoiceId],
            new ServiceOperationOptions(
                targetNamespace: 'billing',
                modeOverride: 'sync',
                waitFor: 'completed',
            ),
        );

        return $call->responsePayload;
    }
}
```

`serviceOperation()` повертає `ServiceOperationResult` із довговічним `serviceCallId`, станом життєвого циклу, підсумком і даними відповіді. Кінцева помилка або скасування сервісу відновлюється як типізований виняток workflow у початковому місці виклику. Зберігайте відображення помилок застосунку доступними для replay.

## Вибір умови очікування {#choose-what-the-caller-waits-for}

Використовуйте `modeOverride: 'sync'` і `waitFor: 'completed'`, коли наступне рішення workflow залежить від результату сервісу. Workflow довговічно призупиняється, доки виклик не завершиться.

Використовуйте `modeOverride: 'async'` або `waitFor: 'accepted'`, коли достатньо прийняття. Повернений запис ідентифікує початковий виклик. Прийняття не означає завершення бізнес-роботи. Пізніший результат цілі не переписує вже записаний результат викликача, який очікував лише прийняття. Якщо workflow потрібен кінцевий результат, відразу вибирайте очікування завершення.

## Збереження записаного контракту {#preserve-the-recorded-contract}

Для відкритого run зберігайте стабільними цільовий namespace, endpoint/сервіс/операцію, запит і параметри очікування. Несумісні зміни оформлюйте через гілки версій workflow. Replay повторно використовує записану ідентичність і результат виклику, а не запитує нове виконання.

Явний ключ ідемпотентності є довговічною бізнес-ідентичністю. Повторно використовуйте його лише для тієї самої операції та запиту. Не змінюйте ключ тільки через втрату відповіді або завершення очікування. Перш ніж вирішувати, чи безпечна інша бізнес-операція, перевірте початковий виклик.

Щоб обмежити виконання сервісу, задайте `deadline_policy` операції в каталозі. Її `timeout_seconds` один раз обчислюється від початкового прийняття у `call_deadline_at`; альтернативою є `deadline_at` із часовим зміщенням. Заміна worker і replay не поновлюють цей deadline. `waitTimeoutSeconds` не є deadline виконання сервісу. Узгоджуйте бюджети workflow і сервісу. Після timeout перевіряйте ціль, а не припускайте, що зовнішніх ефектів не було.

## Пов’язані посібники {#related-guides}

- [Виклики сервісів між namespace](../polyglot/service-operations.md)
- [Дочірні workflow](./child-workflows.md)
- [Версіонування](./versioning.md)
- [Збої та відновлення](../failures-and-recovery.md)
