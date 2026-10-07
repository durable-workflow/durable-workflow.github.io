---
title: Workflow Streams
description: Створення й читання стійких вихідних потоків окремого run через SDK PHP, Python і Rust.
tags:
  - service-mode
  - workflow-streams
  - php
  - python
  - rust
---

# Workflow Streams {#workflow-streams}

Workflow Streams — іменовані журнали виводу окремого run, якими володіє
Durable Workflow Server. PHP, Python і Rust мають типізовані операції
списку, опису, підписки, додавання, закриття та помилки, тому застосунки
не мають складати запити HTTP самостійно. Runtime оголошує
`durable-workflow.v2.workflow-streams.contract@1`.
[Машиночитана матриця SDK](/workflow-stream-capabilities.json) фіксує
точну підтримку кожного SDK.

Кожен потік призначає монотонно зростаючі зміщення від 0. `next_offset`
сторінки є наступним включним зміщенням для запиту. Доставка споживачам
відбувається щонайменше один раз: завершіть ідемпотентні ефекти сторінки,
потім стійко збережіть `next_offset` як контрольну точку. Падіння до
контрольної точки може повторно доставити елементи.

## Emit із коду workflow {#emit-from-workflow-code}

Три SDK створюють елементи через ту саму детерміновану межу команди:
`record_side_effect.workflow_stream`. Кожен SDK утворює ключ ідемпотентності
елемента зі стійкої ідентичності команди workflow завдання, порядкового
номера команди потоку та індексу пакета. Server разом фіксує зміну потоку
й записаний side effect. Replay читає цей side effect і не може створити
другий стійкий елемент для того самого логічного додавання.

PHP:

```php
use DurableWorkflow\Model\WorkflowStreamAppendItem;

$context->appendWorkflowStream('progress', [
    new WorkflowStreamAppendItem(['percent' => 50]),
]);
$context->closeWorkflowStream('progress');
```

Python:

```python
from durable_workflow import WorkflowStreamAppendItem

yield ctx.append_workflow_stream("progress", [
    WorkflowStreamAppendItem(payload={"percent": 50}),
])
yield ctx.close_workflow_stream("progress")
```

Rust:

```rust
let item = WorkflowStreamAppendItem::new(serde_json::json!({"percent": 50}))?;
ctx.append_workflow_stream("progress", &[item], None)?;
ctx.close_workflow_stream("progress", None)?;
```

Помічники workflow призначені для детермінованого написання коду.
Код поза workflow може використовувати типізовану операцію `append`
кожного клієнта й надавати власний стабільний ключ ідемпотентності.

## Підписка й відновлення {#subscribe-and-resume}

Підписка читає обмежену сторінку, за потреби очікуючи нові елементи
до 60 секунд. PHP приймає callback скасування між обмеженими опитуваннями.
Python приймає звичайне скасування завдання або `asyncio.Event`, що
скасовує активне опитування. Відкидання future підписки Rust скасовує запит.

| SDK | Операція сторінки | Значення відновлення | Типізована ітерація |
| --- | --- | --- | --- |
| PHP | `subscribeWorkflowStream(...)` | `WorkflowStreamPage::$nextOffset` | `iterateWorkflowStream(...)` |
| Python | `await subscribe_workflow_stream(...)` | `WorkflowStreamPage.next_offset` | `iter_workflow_stream(...)` |
| Rust | `subscribe_workflow_stream(...).await` | `WorkflowStreamPage::next_offset` | Повторювати future обмеженої сторінки до `terminal`. |

`open`, `closed` і `errored` — стани життєвого циклу. Типізований опис
також надає `last_offset`, `total_items`, `pending_items` і `error_reason`.
Додавання до термінального потоку відхиляється. Коли досягнуто налаштованої
межі незавершених елементів, додавання повертає `stream_full`. Виробники
мають уповільнитися або дочекатися читання потоку споживачами.

## Посилання на зовнішні payload {#external-payload-references}

Вбудовані значення використовують спільний конверт Avro Value.
Зовнішні посилання дотримуються наявного контракту сховища кожного SDK:

| SDK | Поведінка зовнішніх посилань |
| --- | --- |
| PHP | Додає й повертає непрозорий `payload_reference`. Завантаження та отримання зі сховища залишаються відповідальністю застосунку. |
| Python | Використовує налаштований драйвер зовнішнього сховища для завантаження, перевірки цілісності, кешування, отримання й декодування зовнішнього конверта Avro. Без драйвера клієнти можуть додавати або переглядати непрозорий `payload_reference`. |
| Rust | Додає й повертає непрозоре посилання та його метадані. Поточний Rust SDK не заявляє драйвер зовнішнього сховища. |

## Workflow Streams і вбудований MessageStream {#workflow-streams-and-embedded-messagestream}

Назви узгоджені там, де узгоджена поведінка, але моделі не взаємозамінні.

| Поняття | Workflow Stream сервісного режиму | MessageStream вбудованого Laravel |
| --- | --- | --- |
| Адреса | Run workflow + назва потоку | Екземпляр/run workflow + ключ потоку |
| Напрям | Лише вивід workflow | Вхідна й вихідна скриньки workflow |
| Перше зміщення | 0 | 1 |
| Доставка | Щонайменше один раз, контрольна точка споживача | Щонайменше один раз, курсор повідомлень рушія |
| Continue as new | Курсор потоку не передається | Курсор вхідної скриньки передається продовженому run |
| Вхідні повідомлення workflow | Не надаються, використовуйте signal або update | Надаються через `inbox()->receive()` |

Waterline використовує одну нормалізовану таблицю для обох режимів
і показує режим, життєвий цикл, зміщення голови/курсора, кількість
незавершених елементів, напрям і помилку. Вихідні потоки сервісу
не показуються як вхідна скринька workflow.

## Перевірка відповідності {#qualification}

Публічний [маніфест сценаріїв Workflow Stream](/platform-conformance/workflow-stream-runtime-scenarios.json)
потребує запусків опублікованих артефактів для виробника PHP зі
споживачами Python і Rust, перезапуску worker виробника, повторного
підключення споживача, життєвого циклу/зворотного тиску/скасування
та зовнішніх посилань payload. Результат випуску має записати кожен
обов’язковий сценарій. Самі модульні тести вихідного коду не є доказом
відповідності.
