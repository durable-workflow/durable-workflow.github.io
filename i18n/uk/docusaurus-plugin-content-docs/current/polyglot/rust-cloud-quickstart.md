---
sidebar_position: 4
title: Швидкий старт Rust у Cloud
description: Запуск спільного середовища Rust Sample App із підготовленим простором імен Durable Workflow Cloud.
tags:
  - Rust
  - Cloud
  - quickstart
  - workers
keywords:
  - швидкий старт Rust Cloud
  - URL runtime простору імен
  - worker Rust
  - playground Sample App
---

# Швидкий старт Rust у Cloud {#rust-cloud-quickstart}

:::caution Контрольований ранній доступ

Durable Workflow Cloud доступний через контрольований ранній доступ.
Використовуйте цей посібник лише після підготовки Cloud простору імен
і двох облікових даних runtime з окремими ролями. Загальнодоступний
шлях Rust не потребує Cloud. Почніть із [посібника Rust SDK](./rust.md)
або виконайте `scripts/playground rust` із типовим локальним runtime
середовища прикладів.

:::

Sample App має одне симетричне середовище прикладів для PHP, Python
і Rust. Ця сторінка обирає Rust і змінює лише ціль runtime.
Відповідні шляхи SDK [PHP](./php.md) і [Python](./python.md)
використовують ту саму команду з `php` або `python`.
[Контракт середовища прикладів Sample App](https://github.com/durable-workflow/sample-app/blob/main/README.md#symmetric-sdk-playground)
описує всі три варіанти.

Середовище визначає поточні стабільні версії артефактів із машинних
метаданих Sample App. Використовуйте згенеровані версії, не копіюючи
номери до команд і не додаючи окремого кроку встановлення SDK.

## 1. Відкрийте підготовлений Sample App {#1-open-the-prepared-sample-app}

[Створіть Codespace з гілки `main` Sample App](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main),
дочекайтеся завершення налаштування й відкрийте термінал у корені
репозиторію. Підготовлений образ містить інструменти SDK і `dw`,
потрібні спільному середовищу прикладів.

Cloud надає URL runtime, простір імен runtime та два облікові дані
ролей. Оберіть чергу завдань застосунку й експортуйте ці заповнювачі
лише після заміни відповідними значеннями:

```bash
export DURABLE_WORKFLOW_RUNTIME_URL='<provisioned-runtime-url>'
export DURABLE_WORKFLOW_RUNTIME_NAMESPACE='<provisioned-runtime-namespace>'
export DURABLE_WORKFLOW_CLIENT_TOKEN='<client-runtime-credential>'
export DURABLE_WORKFLOW_WORKER_TOKEN='<worker-runtime-credential>'
export DURABLE_WORKFLOW_TASK_QUEUE='<rust-task-queue>'
```

URL runtime є коренем runtime простору імен, поверненим Cloud.
Потрібна абсолютна URL-адреса HTTPS без query, fragment або кінцевого
`/api`. SDK та CLI додають власні маршрути API. Простір імен runtime
є окремим поверненим значенням. Не визначайте його назву зі шляху URL.

Облікові дані клієнта запускають, описують і читають workflow.
Облікові дані worker реєструють, опитують, надсилають heartbeat
і завершують завдання. Це мають бути різні секрети з окремими ролями,
хоча одна команда запускає обидва дочірні процеси. Ключ адміністрування
Cloud керує просторами імен та обліковими даними. Не експортуйте
й не передавайте його як облікові дані runtime.

## 2. Виконайте шлях Rust {#2-run-the-rust-journey}

Виконайте спільний контракт зовнішнього runtime:

```bash
scripts/playground rust --runtime managed \
  --runtime-url "$DURABLE_WORKFLOW_RUNTIME_URL" \
  --namespace "$DURABLE_WORKFLOW_RUNTIME_NAMESPACE" \
  --task-queue "$DURABLE_WORKFLOW_TASK_QUEUE"
```

Команда створює відсутні файли в `.playground/rust`, не замінюючи
код клієнта. Вона друкує фактичні типи workflow й activity, чергу,
команди worker та клієнта, вхід і очікуваний результат до запуску.
Worker отримує лише свої облікові дані. Після появи його точної
реєстрації клієнт отримує лише облікові дані клієнта.

Очікування реєстрації обмежене 60 секундами. Сам запуск процесу
не є готовністю. Продовжуйте лише після повідомлення контрольної
точки такої форми, з ілюстративними ідентичностями:

```text
Worker ready: target=managed runtime_url=<provisioned-runtime-url> namespace=<provisioned-runtime-namespace> id=<worker-id> queue=<rust-task-queue> workflow_type=sample-app.playground.rust.authored-workflow activity_type=sample-app.playground.rust.authored-activity
```

Та сама команда запускає один workflow, очікує результат клієнта SDK
до 120 секунд, підтверджує `status=completed` через `dw` і перевіряє
потрібну історію workflow та activity. Приклад успішного результату:

```text
Completed rust workflow <workflow-id>: {"greeting":"Hello, Durable Workflow, from the Sample App Rust playground","input":{"name":"Durable Workflow"},"activity_runtime":"rust","workflow_runtime":"rust"}
```

Останній рядок `Playground success` повторює ціль runtime, простір
імен, чергу, зареєстровані типи й форму очікуваного результату без
значень облікових даних. Команда також записує
`storage/app/playground-rust-evidence.json` з обраними версіями
артефактів, точною реєстрацією, ідентичністю workflow/run, статусом
`completed`, результатом і типами подій історії. Managed Waterline
залишається інтерфейсом оператора підготовленого простору імен.
Керований шлях не запускає локальні Server чи Waterline.

## Обмежена діагностика {#bounded-diagnosis}

Якщо контрольна точка `Worker ready` не з’явилася за 60 секунд,
почніть із фактичного контракту, надрукованого над помилкою:

- **Невідповідність черги:** runner перевіряє точне значення
  `--task-queue`. Підтвердьте допуск цієї черги Cloud і те саме
  значення в надрукованій реєстрації, потім повторіть команду.
- **Невідповідність типів:** помилка називає типи workflow та activity,
  які worker має оголосити. Звірте їх із фактичним контрактом.
  Якщо власні файли містять старі жорстко задані реєстрації, оновіть
  їх або перевірте поточний згенерований приклад у новому каталозі
  через `--source "$HOME/durable-rust-worker"`.
- **Невідповідність ролей облікових даних:** помилка авторизації перед
  реєстрацією вказує на облікові дані worker, а під час опису чи запуску
  run — на облікові дані клієнта. Не міняйте їх місцями й не замінюйте
  ключем адміністрування Cloud.
- **Невідповідність runtime:** обидві ролі мають використовувати точну
  надану URL-адресу runtime та простір імен. Приберіть кінцевий `/api`.
  Не підставляйте URL адміністрування Cloud чи власного Server.

Якщо реєстрація успішна, але завершення ні, збережіть надруковану
ідентичність workflow/run. Перегляньте обраний run у Managed Waterline
і звірте тип незавершеного workflow або activity та чергу завдань
із фактичним контрактом. Виправте невідповідність до нового запуску.
Збережений шлях доказів і обмежений вивід worker визначають невдалу
перевірку: результат клієнта, стійкий статус, очікуваний результат
або потрібна історія.

Поверніться до повного [посібника Rust SDK](./rust.md) або використовуйте
згенерований [довідник Rust API](https://rust.durable-workflow.com/durable_workflow/)
для окремих типів і методів.
