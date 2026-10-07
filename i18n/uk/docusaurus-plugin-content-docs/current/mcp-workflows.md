---
sidebar_position: 9.2
title: Інтерфейс workflow MCP
description: Використовуйте MCP-сервер sample-app як еталонний інтерфейс workflow для AI-клієнтів із виявленням, запуском, діагностикою, відновленням, результатами й історією.
tags:
  - ai
  - agents
  - mcp
  - sample-app
keywords:
  - durable workflow mcp
  - інструменти workflow mcp
  - mcp сервер sample-app
  - виявлення workflow AI-клієнтом
---

# Інтерфейс workflow MCP {#mcp-workflow-surface}

Sample App надає еталонний MCP-сервер Durable Workflow v2 за адресою:

```text
/mcp/workflows
```

Використовуйте його, коли AI-клієнту потрібно переглядати локальний
застосунок workflow або керувати ним без зчитування сторінок Waterline
чи припущень про внутрішню реалізацію Laravel. Endpoint є структурованим
інтерфейсом розробки: називає workflow, які застосунок відкриває, описує
вимоги до облікових даних, запускає run, опитує результати й повертає
обмежені факти історії.

## Контракт сервера {#server-contract}

Sample App реєструє сервер у `routes/ai.php` і налаштовує відкриті ключі
workflow в `config/workflow_mcp.php`. Ця конфігурація є публічним списком
дозволених workflow для AI-клієнтів. Workflow доступний для керування
через MCP лише за наявності в списку з достатніми метаданими для рішення
клієнта про безпечний запуск.

Кожен налаштований workflow має описувати:

- стабільний ключ workflow;
- клас workflow за цим ключем;
- обов’язкові й необов’язкові аргументи;
- вимоги до облікових даних;
- безпечність локальних smoke-тестів без облікових даних;
- очікуваний вивід та історію, на які агент може послатися.

Не розміщуйте секрети в описах інструментів. Вказуйте потребу workflow
в облікових даних, але не їхні значення чи деталі конкретного облікового
запису.

## Інструменти {#tools}

Еталонний сервер надає шість інструментів workflow:

| Інструмент | Використання |
| --- | --- |
| `list_workflows` | Виявлення налаштованих ключів workflow, описів, вимог до облікових даних, статусів v2 і недавніх run. |
| `start_workflow` | Запуск налаштованого workflow з поверненням `workflow_id`, `run_id`, статусу, бізнес-ключа й результату команди. |
| `get_workflow_result` | Опитування поточного або обраного run щодо статусу, виводу, метаданих видимості й останнього опису помилки. |
| `get_workflow_history` | Отримання обмеженого кінця типізованої історії подій v2 та недавніх стійких помилок. |
| `diagnose_workflow` | Класифікація обраного run зі структурованими фактами, першопричиною, способом усунення й наступними діями. |
| `repair_workflow` | Запит вбудованої команди відновлення v2 з поверненням структурованого результату зміни: прийнято, відмовлено або не потрібно. |

Викликайте `list_workflows` перед кожним запуском. Це перевірка сумісності
агента: відповідь повідомляє клієнту наявні ключі workflow та можливість
виконання workflow в поточному середовищі.

Конверти виявлення використовують нормативний schema id
`durable-workflow.v2.mcp-discovery`. Агенти можуть розпізнавати за ним
опубліковану форму списку інструментів, схеми параметрів, підказки
виявлення та семантику `payload_preview_limit_bytes` перед викликом.

## Контракт входу інструментів {#tool-input-contract}

Схеми інструментів MCP використовують терміни Durable Workflow.
Під час розширення сервера sample-app зберігайте ці поля стабільними:

| Інструмент | Стабільні входи |
| --- | --- |
| `list_workflows` | `show_recent`, `limit` і необов’язковий `status` для виявлення недавніх run. |
| `start_workflow` | `workflow`, впорядковані `arguments`, необов’язкові `instance_id`, `business_key`, `visibility_labels`, `memo`, `search_attributes` і `duplicate_start_policy`. |
| `get_workflow_result` | `workflow_id`, необов’язковий `run_id`, `include_recent_history` і `history_limit`. |
| `get_workflow_history` | `workflow_id` або `run_id`, `limit` і `include_payloads`. |
| `diagnose_workflow` | `workflow_id` або `run_id` і необов’язковий `history_limit`. |
| `repair_workflow` | `workflow_id` або `run_id`. |

Для нових агентів обирайте `arguments` замість старого входу `args`.
`arguments` безпосередньо відповідає порядку аргументів workflow `handle()`,
а `args` існує лише для старих клієнтів з об’єктним входом.

Використовуйте заданий клієнтом `instance_id` лише за потреби
ідемпотентності. Поєднуйте його з
`duplicate_start_policy=return_existing_active`, коли повторний smoke-запуск
має підключатися до активного workflow замість помилки повторного запуску.

## Контракт результату інструментів {#tool-result-contract}

Конверти результатів використовують нормативний schema id
`durable-workflow.v2.mcp-tool-results`. Агенти можуть розбирати за ним
статус результату, обрізання перегляду payload, поля помилок, об’єкти
першопричини й усунення, конверти безпечних змін та маркери схеми/версії.

Агенти мають використовувати такі поля результатів як стійкі
ідентифікатори для зв’язування викликів інструментів:

| Інструмент | Стабільні поля результатів |
| --- | --- |
| `list_workflows` | `available_workflows`, `allow_fqcn`, `workflow_id_kind`, `run_id_kind`, `status_values` і необов’язковий `recent_workflows`. |
| `start_workflow` | `workflow_id`, `run_id`, `workflow`, `workflow_class`, `workflow_type`, `status`, `running`, `business_key`, `duplicate_start_policy` і `command`. |
| `get_workflow_result` | `found`, `workflow_id`, `run_id`, `current_run_id`, `current_run_is_selected`, `status`, `running`, `output`, `error`, метадані видимості й часові позначки. |
| `get_workflow_history` | `found`, `workflow_id`, `run_id`, `current_run_id`, `status`, `history_event_count`, `returned_event_count`, `events_are_most_recent`, `payloads_included`, `events` і `failures`. |
| `diagnose_workflow` | `found`, `workflow_id`, `run_id`, `diagnosis`, `facts`, `latest_failure`, `recent_history`, `root_cause`, `remediation` і `next_actions`. |
| `repair_workflow` | `found`, `workflow_id`, `run_id`, `accepted`, `status`, `mutation`, `command`, `remediation` і `next_actions`. |

Перегляд payload історії навмисно обмежений. Якщо `include_payloads`
дорівнює true, перегляд кожної події повідомляє
`payload_preview_limit_bytes`, `size_bytes`, `preview_bytes` і `truncated`,
щоб агент міг вказати, чи бачив повний payload або лише перегляд.

## Класифікація помилок і способів усунення {#failure-and-remediation-taxonomy}

`diagnose_workflow` — машиночитаний інтерфейс першопричини. Його об’єкт
`root_cause` використовує schema id `durable-workflow.v2.agent-root-cause`
і містить:

- `category`, наприклад `activity_failure`, `workflow_failure`,
  `task_repair_attention`, `waiting_for_signal`, `history_growth_attention`,
  `in_progress` або `none`;
- `source.kind` і `source.id` для workflow, activity, очікування, черги
  завдань або сімейства історії, що дало класифікацію;
- `retryable`, `severity` і `actionable`;
- деталі помилки, як `failure_category`, `exception_class` і `handled`,
  коли існує рядок стійкої помилки.

Супровідний об’єкт `remediation` використовує schema id
`durable-workflow.v2.agent-remediation`. Він містить `classification`,
короткий `summary`, `automatic_repair.tool` і `automatic_repair.allowed`,
а також записи `next_actions` підтримуваних подальших команд. Агенти мають
викликати `repair_workflow` лише за `automatic_repair.allowed=true`.
Інші класифікації вказують очікувати, надіслати очікуваний вхід через
задокументовані команди workflow, переглянути історію, змінити код workflow
чи activity або запланувати Continue-As-New.

`repair_workflow` повертає конверт `durable-workflow.v2.safe-mutation`.
Поле `mutation.applied` повідомляє, чи прийнято команду відновлення,
а `command.outcome` розрізняє `repair_dispatched`, `repair_not_needed`
та структуровані відмови, як термінальний або непоточний run.

## Безпечний цикл агента {#safe-agent-loop}

Спочатку використовуйте workflow без облікових даних:

```json
{"tool": "list_workflows", "arguments": {"show_recent": true, "limit": 5}}
{"tool": "start_workflow", "arguments": {"workflow": "simple", "business_key": "demo-001"}}
{"tool": "diagnose_workflow", "arguments": {"workflow_id": "<workflow_id>"}}
{"tool": "repair_workflow", "arguments": {"workflow_id": "<workflow_id>"}}
{"tool": "get_workflow_result", "arguments": {"workflow_id": "<workflow_id>"}}
{"tool": "get_workflow_history", "arguments": {"run_id": "<run_id>", "limit": 25}}
```

Ключі workflow `simple` та `elapsed` є рекомендованими для smoke-перевірок.
Приклади з обліковими даними використовуйте лише після того, як
`list_workflows` повідомить вимогу, а локальне середовище матиме потрібні
ключі.

## Форма звіту {#report-shape}

AI-клієнт має повідомляти результати MCP через стабільні факти:

- використана версія документації, зазвичай `2.0`;
- endpoint MCP і назва інструмента;
- ключ workflow, `workflow_id` і `run_id`;
- статус і останній опис помилки;
- `root_cause.category` і `remediation.classification`;
- чи було `remediation.automatic_repair.allowed=true` перед спробою
  зміни відновлення;
- обмежений перелік назв подій історії та часових позначок;
- чи run використовував smoke-workflow без облікових даних або приклад
  з обліковими даними.

Ці факти узгоджені з CLI, Python SDK та експортом історії Waterline,
тож людина може відтворити той самий run з іншого клієнта.

## Пов’язані сторінки {#related-pages}

- [Розробка за допомогою AI](./ai-assisted-development.md)
- [Операційний цикл агента](./agent-operating-loop.md)
- [Контракт інструментів агентів](./agent-tooling-contract.md)
- [Sample App](./sample-app.md)
- [Можливості клієнтів і worker](./polyglot/cli-python-parity.md)
- [Потоки повідомлень](./features/message-streams.md)
