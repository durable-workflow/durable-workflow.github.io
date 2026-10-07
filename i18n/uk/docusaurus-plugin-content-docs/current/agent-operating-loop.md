---
sidebar_position: 9.1
title: Операційний цикл агента
description: Стабільний процес v2 для AI-агентів із виявленням, зміною, виконанням, діагностикою та відновленням застосунків Durable Workflow.
tags:
  - ai
  - agents
  - mcp
  - operations
keywords:
  - цикл агента durable workflow
  - налагодження workflow AI
  - mcp workflows
  - експорт історії waterline
  - вивід dw json
---

# Операційний цикл агента {#agent-operating-loop}

Durable Workflow v2 найпростіше використовувати агентам, коли кожен крок
має стабільний ідентифікатор. Наведений цикл починається з того самого
інваріанта, який вивчає людина, а потім використовує машиночитані
контракти для виявлення, виконання, діагностики й відновлення.

## 1. Використовуйте правильну лінійку документації {#1-use-the-right-docs-line}

Для стабільної 2.0 використовуйте канонічний пакет. Він відповідає тому
самому типовому шляху Docs без версії, який читачі відкривають із
публічного сайту:

```text
https://durable-workflow.com/llms-full.txt
```

Використовуйте версійований пакет 2.0, коли сама URL-адреса має називати
поточну мажорну лінійку:

```text
https://durable-workflow.com/llms-full-2.0.txt
```

Використовуйте явне закріплення 1.x, коли сама URL-адреса має називати
цю стабільну мажорну лінійку:

```text
https://durable-workflow.com/llms-full-1.x.txt
```

## 2. Виявіть локальний інтерфейс workflow {#2-discover-the-local-workflow-surface}

За наявності починайте з endpoint MCP sample-app:

```text
/mcp/workflows
```

Еталонний контракт інструментів, безпечні ключі smoke-workflow і форму
звіту агента наведено в [інтерфейсі workflow MCP](./mcp-workflows.md).

Спочатку викликайте `list_workflows`. Відповідь повідомляє агенту відкриті
workflow, потрібні облікові дані, прийняті аргументи та вже наявні недавні
run. Використовуйте `simple` або `elapsed` для smoke-тестів без облікових
даних перед прикладами, що потребують зовнішніх ключів API.

Якщо MCP недоступний, використовуйте контракти CLI та Server:

```bash
dw server:info --output=json
dw workflow:list --output=json
dw task-queue:list --output=json
```

Ці команди надають версії протоколів, контекст простору імен, видимість
workflow і здоров’я черг завдань без зчитування UI.

## 3. Зробіть найменшу зміну {#3-make-the-smallest-change}

Під час редагування коду workflow зберігайте межу стійкого виконання:

- рішення оркестрації залишайте в методах workflow;
- ввід/вивід, випадковість, мережеві виклики й зовнішні облікові дані
  розміщуйте в activity;
- використовуйте signal, update, query, timer і потоки повідомлень замість
  довільних таблиць або завдань черг;
- повторюваний ввід людини чи AI залишайте в контракті
  [потоків повідомлень](./features/message-streams.md).

Ця межа важливіша за мовний інтерфейс. Класи workflow PHP, `dw`, Python
SDK та зовнішні worker мають описувати ті самі операції площини керування.

Коли зміна вихідного коду не потрібна, крок «змінити» може бути явним
операційним вибором: обрати відкритий ключ workflow, надати стабільний
`business_key`, обрати `duplicate_start_policy=return_existing_active`
для ідемпотентних smoke-запусків або надіслати задокументований ввід
signal/update, рекомендований `diagnose_workflow`.

## 4. Виконуйте через структуровані інтерфейси {#4-run-through-structured-handles}

Використовуйте найточніший доступний інтерфейс для задачі:

| Задача | Рекомендований інтерфейс |
| --- | --- |
| Запустити локальний workflow прикладу | `start_workflow` через `/mcp/workflows` |
| Відновити локальний workflow прикладу | `diagnose_workflow`, потім `repair_workflow` лише за дозволом remediation |
| Запустити workflow Server чи надіслати йому команду | `dw workflow:start`, `dw workflow:signal`, `dw workflow:update` або відповідні методи SDK |
| Перевірити сумісність | `dw server:info --output=json` і `/api/cluster/info` |
| Переглянути здоров’я черги | `dw task-queue:describe <queue> --output=json` |
| Порівняти інтерфейси клієнтів і worker | [Можливості клієнтів і worker](./polyglot/cli-python-parity.md) |
| Реалізувати worker іншою мовою, ніж PHP | [Протокол worker](./polyglot/worker-protocol.md) |
| Реалізувати зовнішній обробник | [Інтерфейс зовнішнього виконання](./polyglot/external-execution.md) |

Для циклів агентів обирайте вивід JSON або JSONL. Таблиці термінала
призначені для людей.

## 5. Діагностуйте перед відновленням {#5-diagnose-before-repairing}

Збирайте факти перед зміною коду або повторенням команд:

```bash
dw doctor --output=json
dw server:info --output=json
dw debug workflow <workflow-id> --output=json
dw workflow:history <workflow-id> <run-id> --output=json
```

Для інтерфейсу MCP sample-app викличте:

```json
{"tool": "diagnose_workflow", "arguments": {"workflow_id": "<workflow_id>"}}
```

Прочитайте `root_cause.category`, `remediation.classification` і
`remediation.automatic_repair.allowed`. Викликайте `repair_workflow`
лише за значення true останнього поля:

```json
{"tool": "repair_workflow", "arguments": {"workflow_id": "<workflow_id>"}}
```

Якщо Waterline доступний, експортуйте історію обраного run. Експорт
містить типізовані події історії, контекст обраного run, очікування, timer,
лінію походження, метадані джерела проєкції, перевірки цілісності й стійкі
помилки. Ці факти дозволяють агенту відрізнити помилку workflow від
недоступного worker, відсутніх облікових даних, збою черги завдань,
несумісного клієнта або очікуваної дії оператора.

## 6. Звітуйте за контрактами {#6-report-with-contracts}

Звіти агентів мають посилатися на стабільні факти:

- версія документації й використаний пакет LLM;
- ID workflow, ID run, простір імен і черга завдань;
- викликана команда чи інструмент MCP;
- статус JSON, код завершення чи іменована причина помилки;
- `root_cause.category`, `remediation.classification` і дозвіл або відмова
  відновлення;
- недавні типізовані події історії та остання стійка помилка;
- версія сумісності або протоколу з `server:info` чи `/api/cluster/info`.

Ця форма звіту переносима між локальними sample-app, окремими
розгортаннями Server, worker Python і майбутніми клієнтськими SDK.

## 7. Опубліковані докази {#7-published-proof}

Набір перевірок відповідності sample-app доводить цикл агента на
опублікованих артефактах. Його частина MCP виконує:

1. виявлення: JSON-RPC `tools/list` і `list_workflows`;
2. зміну: вибір workflow `simple` без облікових даних із явним
   `business_key`;
3. запуск: `start_workflow`;
4. діагностику: `diagnose_workflow` з об’єктами першопричини та усунення;
5. відновлення: `repair_workflow` як безпечну структуровану зміну або відмову;
6. перевірку: `get_workflow_result`, `diagnose_workflow` і
   `get_workflow_history`.

Доказ записує коди статусів інструментів, ID workflow, статус завершення,
schema id першопричини, schema id усунення, schema id безпечної зміни
та обмежену історію в метадані відповідності.

## Пов’язані сторінки {#related-pages}

- [Розробка за допомогою AI](./ai-assisted-development.md)
- [Контракт інструментів агентів](./agent-tooling-contract.md)
- [Інтерфейс workflow MCP](./mcp-workflows.md)
- [Sample App](./sample-app.md)
- [Довідник команд CLI](./polyglot/cli-reference.md)
- [Протокол worker](./polyglot/worker-protocol.md)
- [Інтерфейс зовнішнього виконання](./polyglot/external-execution.md)
