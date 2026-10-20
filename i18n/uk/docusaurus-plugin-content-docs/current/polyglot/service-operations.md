---
title: Виклики сервісів між namespace
description: Опублікуйте сервісну операцію та довговічно викликайте її з іншого namespace.
---

# Виклики сервісів між namespace {#cross-namespace-service-calls}

Сервісна операція, також звана операцією Nexus, є підтримуваним довговічним викликом між namespace одного кластера Durable Workflow. Адреса містить цільовий namespace і трійку endpoint/сервіс/операція. Дочірній workflow або звичайний signal залишається у своєму namespace. Ні ім’я черги, ні інша мова не змінюють цього правила.

## Вибір підтримуваного API {#choose-a-supported-authoring-surface}

| Викликач | Опублікований API | Цільовий namespace |
| --- | --- | --- |
| Вбудований PHP | `Workflow::serviceOperation()` або helper `serviceOperation()` | `ServiceOperationOptions(targetNamespace: 'billing')` |
| PHP SDK | `WorkflowContext::serviceOperation()` | Параметр масиву `namespace => 'billing'` |
| Python SDK | `yield context.call_nexus_service(...)` | Ключовий аргумент `target_namespace='billing'` |
| Rust SDK | Авторські очікування Nexus не опубліковані | Відстежуються у [Rust SDK #86](https://github.com/durable-workflow/sdk-rust/issues/86). Призупинена чернетка не є підтримкою встановленого пакета. |

Для Laravel workflow використовуйте [вбудований приклад](../features/service-operations.md), для прямолінійного API worker — [приклад PHP SDK](https://php.durable-workflow.com/build/workflows-activities/), а для генераторів — [довідник Python workflow](https://python.durable-workflow.com/reference/workflow/). Перед розгортанням викликача перевірте оголошений підключеним runtime контракт сервісних операцій. Сам API керування клієнта не доводить підтримку workflow worker.

У PHP SDK міжпросторові виклики наразі використовують параметр масиву. Еквівалентний типізований параметр відстежується у [PHP SDK #193](https://github.com/durable-workflow/sdk-php/issues/193).

## Публікація цільової операції {#publish-the-target-operation}

Цільовому namespace належать endpoint, сервіс, операція та worker обробника. Спочатку створіть namespace і запустіть worker, який реєструє цільовий тип workflow у вибраній черзі. Цей каталог використовує namespace `billing`, тип workflow `billing.invoice` і чергу `billing`.

Зміни каталогу потребують облікових даних адміністратора. Коли орендований workflow надсилає сервісну команду, runtime окремо перевіряє повноваження викликача.

```bash
curl --fail-with-body -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/service-endpoints" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: billing" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"endpoint_name":"billing"}'

curl --fail-with-body -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/service-endpoints/billing/services" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: billing" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"service_name":"invoices"}'

curl --fail-with-body -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/service-endpoints/billing/services/invoices/operations" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: billing" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"operation_name":"create","operation_mode":"sync","handler_binding_kind":"start_workflow","handler_target_reference":"billing.invoice","handler_binding":{"workflow_type":"billing.invoice","queue":"billing"},"deadline_policy":{"timeout_seconds":30}}'
```

Імена каталогу нормалізуються до нижнього регістру. Записи endpoint і сервісу організовують операцію, але не замінюють її справжнього обробника. Підтримуйте доступність сумісного worker у цільовому namespace. Реєстрація не доводить виконання роботи.

## Очікування та записані результати {#waiting-and-recorded-results}

PHP SDK за замовчуванням використовує `mode_override=sync` і `wait_for=completed`. Python використовує `mode='sync'` і `wait_for='completed'`. Обидва призупиняють виконання до довговічного кінцевого результату сервісу та відтворюють записаний результат або типізовану помилку в початковому місці виклику. Стан pending або started не є успішним бізнес-результатом.

Щоб чекати лише прийняття, PHP використовує `wait_for='accepted'` або `mode_override='async'`; Python підтримує `wait_for='accepted'`, `mode='async'` і helper `start_nexus_operation()`. Зберігайте повернений id виклику для перевірки. Пізніше завершення не замінює початкове записане прийняття викликача. Якщо рішення workflow потребують результату цілі, вибирайте очікування завершення.

Обмежуйте виконання сервісу через `deadline_policy` каталогу, як вище. Політика приймає рівно одне поле: додатне ціле `timeout_seconds` або RFC3339 `deadline_at` із часовим зміщенням. Runtime записує один `call_deadline_at` від початкового прийняття. Replay, повторні спроби й пізніші зміни каталогу не можуть його скинути. Політика null не створює нового deadline сервісу.

Не використовуйте `wait_timeout_seconds` викликача як timeout виконання. Односекундний параметр очікування без deadline каталогу все ще може повернути результат цілі, яка завершується після трьох секунд. Після timeout перевірте початковий виклик і пов’язану ціль. Сплив часу не доводить відсутність зовнішніх ефектів, а скасування цілі є окремою політикою.

## Помилки, повторні спроби та ідемпотентність {#failures-retries-and-idempotency}

PHP передає кінцеві результати помилок сервісу через `ServiceOperationFailed`; Python піднімає `NexusOperationFailed` у точці yield. Обробляючи помилку, зберігайте типізовані подробиці та id виклику. Очікувані бізнес-помилки може обробити код workflow; неочікувані можуть залишитися помилками workflow.

Runtime керує записаною політикою повторних спроб сервісу. Не додавайте другий цикл HTTP-повторів у код workflow. Для звичайних викликів PHP і Python створюють стабільні ключі. Якщо ключ задає застосунок, зберігайте ті самі ціль, запит і задуману операцію для повторів і replay. Новий ключ означає новий бізнес-запит, а не відновлення втраченої відповіді.

Для відкритих історій зберігайте стабільними цільовий namespace, трійку каталогу, payload і параметри очікування. Якщо довговічний намір змінюється, використовуйте гілку версії workflow.

## Дотримання межі namespace {#enforce-the-namespace-boundary}

Міжпросторовий параметр за замовчуванням — `allow`. Автентифікація, перевірки ролей, інші політики меж і авторизація namespace продовжують діяти. Ідентичність викликача походить від орендованого workflow; вхідні дані застосунку не можуть видати його за інший namespace.

Щоб самостійно розгорнутий PHP Server відмовляв у міжпросторових сервісних викликах, узгоджено налаштуйте й перезапустіть його ролі API/worker:

```bash
DW_SERVICE_BOUNDARY_CROSS_NAMESPACE_DEFAULT=deny
```

Політика відмовляє у міжпросторовому виклику до dispatch обробника. Виклики в межах одного namespace та інші політики меж також потрібно перевірити. Ця змінна не замінює облікові дані або ACL орендарів.

## Перевірка початкового виклику {#inspect-the-original-call}

Використовуйте [API подробиць виклику й каталогу](./server-api-reference.md#service-catalog-admin-apis) або [перевірку сервісних викликів CLI](./cli-reference.md#service-call-inspection). Зберігайте разом id workflow/run викликача та цільового сервісного виклику. Перевірка лише для читання не запитує нового виконання. Для перевірки втраченої відповіді або заміни worker використовуйте початковий id.
