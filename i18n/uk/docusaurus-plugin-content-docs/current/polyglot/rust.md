---
sidebar_position: 5
title: Rust SDK
description: Встановлення офіційного Rust SDK, його crate, вихідний код і згенерована документація API.
tags:
  - Rust
  - SDK
  - workers
  - polyglot
keywords:
  - sample-app-playground
  - Rust SDK
  - durable-workflow crate
  - Rust worker
  - crates.io
---

import ProductPromotion from '@site/src/components/ProductPromotion';

# Rust SDK {#rust-sdk}

Ця настанова описує загальнодоступну поверхню SDK. Для окремих типів
і методів переходьте до згенерованого довідника API. Обліковий запис Cloud
не потрібний: основний шлях використовує опублікований Rust crate
із самостійно розгорнутим Server. Розробники, які вже беруть участь
у контрольованому ранньому доступі Durable Workflow Cloud, можуть вибрати
окремий [quickstart керованого runtime](./rust-cloud-quickstart.md).

Офіційний Rust SDK надає написання workflow разом із протокольною сумісністю.
Rust дає змогу створювати детерміновані workflows, activities та довготривалі
worker services з тією самою моделлю durable-виконання, що й PHP та Python.
Асинхронний клієнт площини керування запускає executions, надсилає signals,
виконує queries та updates, скасовує, terminate й очікує результати.
Worker runtime replay історію workflow, виконує обробники workflow/activity/update,
повідомляє heartbeats worker та activity й обмінюється мовно-незалежними
payload із самостійно розгорнутим Server або namespace runtime Durable Workflow Cloud.

[Початкова сторінка документації Rust](https://rust.durable-workflow.com/)
надає індекс SDK та загальні точки входу. Modules, structs, traits і methods
crate наведено у згенерованому
[довіднику Rust SDK API](https://rust.durable-workflow.com/durable_workflow/).

Стабільний Rust SDK підтримує durable timers, дочірні workflows, retries
і timeouts activity, local activities, worker sessions, sticky execution, signals,
query handlers з replay, cancellation і termination, серверні deadlines
workflow, типізовані side effects, маркери версій, updates та типізовані
термінальні помилки й помилки replay. Керування schedules поки не заявлено.
Використовуйте [каталог можливостей 2.0](/docs/capabilities/),
а не припускайте однаковий набір можливостей у кожному SDK.

## Спробуйте локальний playground Sample App {#try-the-local-sample-app-playground}

Для найкоротшого шляху до написання workflow без Cloud відкрийте
[`main` поточного Sample App у GitHub Codespaces](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main)
і виконайте:

<!-- docs-example id="sdk.rust.sample-app-playground" -->
```bash
scripts/playground rust
```

Локальний playground генерує код workflow та activity, яким володіє користувач,
вибирає поточні стабільні артефакти й запускає опубліковані Server та Waterline.
Перед запуском workflow він очікує реєстрації worker, чия ідентичність,
тип workflow, тип activity та task queue відповідають згенерованому контракту.
Успіх потребує очікуваного завершеного результату та історії.
Після цього термінал виводить точне локальне посилання на run у Waterline
та шлях до структурованих JSON-даних перевірки.

Цей навмисно невеликий транспортний scaffold використовує `serde_json::Value`.
Він не є єдиним рекомендованим контрактом Rust-застосунку.
Продовжіть із наявним
[прикладом типізованих вхідних даних і результатів](https://github.com/durable-workflow/sdk-rust/blob/main/examples/hello_world.rs),
[прикладом політики activity з retry, timeout, heartbeat і термінальними помилками](https://github.com/durable-workflow/sdk-rust/blob/main/examples/activity_options.rs)
та [прикладом local activity](https://github.com/durable-workflow/sdk-rust/blob/3.1.0/examples/local_activities.rs).
Пакет, приклад репозиторію та згенерований довідник API нижче залишаються
прямими шляхами для тих, хто не використовує Sample App.

## Пакет та вихідний код {#package-and-source}

- [Crate на crates.io](https://crates.io/crates/durable-workflow)
- [Репозиторій вихідного коду](https://github.com/durable-workflow/sdk-rust)

Установіть Rust SDK з останнього успішно перевіреного набору.
Точна вимога генерується з того самого машиночитаного джерела,
що й quickstart Server:

<!-- docs-example id="rust.sdk.install" -->
```bash
%%artifact.rustCargoAddCommand%%
```

Або оголосіть ту саму перевірену вимогу безпосередньо в `Cargo.toml`:

```toml
[dependencies]
%%artifact.rustCargoRequirement%%
```

Crate потребує Rust 1.86 або новішого. Metadata пакета записує версію Server,
використану для перевірки цього випуску SDK, стандартну та мінімальну версії
worker-протоколу й площину керування 2. Сумісність із новішим Server
перевіряється окремо. Під час розгортання використовуйте protocol manifests
і можливості, оголошені `GET /api/cluster/info`.

Server узгоджує заголовки worker-протоколу в межах major `1`:
Server з `1.N` приймає заголовок worker `1.M` лише за `M <= N`.
Rust SDK 3.5.0 за замовчуванням надсилає
`X-Durable-Workflow-Protocol-Version: 1.20` і потребує Server,
який оголошує `1.20` або новішу версію. Для старішого сумісного Server
оберіть `WorkerProtocolVersion::V119` через налаштування
`worker_protocol_version` у builder клієнта. SDK 3.4.x за замовчуванням
використовує `1.19`. Явно ввімкнений профіль кооперативного скасування
потребує `1.20` і відхиляє явний вибір `1.19`.

Узгодження відхиляє невідповідність. Відсутній чи некоректний заголовок,
інший major або worker minor вище оголошеного Server відхиляються.
Версії випусків SDK та Server відстежуються незалежно. Їхня сумісність
визначається protocol manifests runtime.

## Списки workflow та повна історія запуску {#workflow-lists-and-history}

Ці API потребують Rust SDK **4.6.0 або новішого**. Перевіряйте `Cargo.lock`: окрема комбінація встановлення вище може вибрати старіший crate. [Перевірка звичайного встановлення](https://github.com/durable-workflow/sdk-rust/issues/122#issuecomment-6363352910) підтверджує три сторінки списку, шість сторінок історії, payload 128 KiB, експорт/replay і приклад лише для читання з опублікованим Server 2.11.0. Офлайн-тести потребують 4.5.0; ці методи та ітератори списку/історії — 4.6.0. Вибрана комбінація Server/SDK не змінюється.

`Client::list_workflows(WorkflowListOptions)` і `Client::get_workflow_history(workflow_id, run_id, WorkflowHistoryOptions)` повертають **одну сторінку**. Продовжуйте вручну з її непрозорим `next_page_token` або використовуйте ліниві ітератори для повного читання. Методи зберігають перевірку Server, фільтри й namespace; нових полів чи граматики query немає. Наприклад, знайдіть відкритий запуск за зареєстрованим keyword-атрибутом:

```rust
use durable_workflow::WorkflowListOptions;
async fn find(client: durable_workflow::Client) -> durable_workflow::Result<()> {
let mut matches = client.iter_workflows(
    WorkflowListOptions::new()
        .workflow_type("payments")
        .status("running")
        .query("OrderRef = 'order-42'")
        .page_size(2),
);
match (matches.next().await?, matches.next().await?) {
    (Some(run), None) => println!("open run: {} / {}", run.workflow_id, run.run_id),
    (None, _) => println!("no open run"),
    _ => println!("multiple open runs; refine the query"),
}
Ok(())
}
```

Фільтр Server `status=running` вибирає активний **status bucket**, зокрема сирі статуси `pending` і `waiting`. `WorkflowSummary` зберігає `status`, `status_bucket`, `is_terminal`, пошукові атрибути й невідомі метадані в `raw`. Атрибути не унікальні: фільтр може знайти і батька, і дітей, які успадкували значення. Обробляйте нуль, один і кілька результатів, як вище. Створіть клієнт у потрібному namespace до ітератора; namespace і фільтри незмінні між token.

Прочитайте весь вибраний запуск, не завантажуючи всі сторінки разом:

```rust
use durable_workflow::WorkflowHistoryOptions;
async fn audit(client: durable_workflow::Client) -> durable_workflow::Result<()> {
let mut events = client.iter_workflow_history(
    "payment-42", "selected-run-id", WorkflowHistoryOptions::new().page_size(100),
);
while let Some(event) = events.next().await? {
    println!("{}", event.event_type);
}
Ok(())
}
```

`iter_workflows(options)` видає `WorkflowSummary` через `next().await`. Обидва ітератори підтримують `into_stream()` для `futures_util::TryStreamExt`; закріпіть stream перед polling. Створення не виконує I/O; наступна сторінка завантажується після вичерпання поточної. Null/порожній token завершує обхід; порожня сторінка з token продовжується. Повторні/циклічні token повертають `Error::Pagination` з обмеженим станом token. Помилка сторінки зберігає початкову типізовану помилку, після чого ітератор завершується. Обробляйте помилку: часткове читання не є повним результатом. Збирання stream усе одно зберігає всі зібрані елементи.

Ітерація історії зберігає початкові workflow/run і перелічує доступні події: не переходить за continue-as-new і не підписується назавжди. Метадані подій і wire-envelope payload зберігаються. Для офлайн-replay використовуйте `Client::export_workflow_history` із `testing::WorkflowHistory::from_export`, а не часткову сторінку. Див. [офлайн-replay](#rust-replay-export).

Опублікований Server 2.11 типово повертає 50 рядків списку (максимум 200) і 100 подій історії (максимум 1 000) на сторінку. Розмір передається незмінним для перевірки Server. Зупиняйтеся, коли результатів достатньо, вибирайте доречний розмір і задавайте таймаут застосунку. Пагінація не додає snapshot isolation під час конкурентних змін. Див. [опублікований приклад читання](https://github.com/durable-workflow/sdk-rust/blob/4.6.0/examples/workflow_pagination.rs), [Client API](https://rust.durable-workflow.com/durable_workflow/struct.Client.html) і [типи пагінації](https://rust.durable-workflow.com/durable_workflow/pagination/index.html).

## Метрики та експорт Prometheus {#rust-sdk-metrics}

Ці API потребують Rust SDK **4.7.0 або новішого**. Перевіряйте `Cargo.lock`: окрема комбінація встановлення вище може вибрати старіший crate. [Перевірка звичайного встановлення](https://github.com/durable-workflow/sdk-rust/pull/131#issuecomment-6364178456) підтверджує чотири HTTP-перевірки, усі шість метрик справжнього worker з опублікованим Server 2.11.0 та приклад експорту. Мінімальна версія функції не змінює вибрану комбінацію.

Типовий recorder — **no-op**. Надайте `Arc<dyn metrics::MetricsRecorder>` з `increment(name, count, tags)` і `record(name, seconds, tags)`. Клієнт, його клони й нові worker успадковують recorder. `Worker::metrics_recorder` перевизначає спостереження poll/task worker, а клієнтські запити зберігають recorder клієнта. Callback мають бути швидкими й локально обробляти збої exporter. Паніки recorder з unwinding ізольовані від результатів SDK; блокування exporter чи аварійне завершення процесу цей hook не виправляє.

Кожне спостереження запиту клієнта, poll worker або отриманого task збільшує один лічильник на одиницю й записує одну невід’ємну монотонну тривалість у секундах. Шість стабільних назв:

| Лічильник | Гістограма тривалості |
| --- | --- |
| `durable_workflow_client_requests` | `durable_workflow_client_request_duration_seconds` |
| `durable_workflow_worker_polls` | `durable_workflow_worker_poll_duration_seconds` |
| `durable_workflow_worker_tasks` | `durable_workflow_worker_task_duration_seconds` |

Ключі тегів клієнта — саме `method`, `route`, `plane`, `status_code`, `outcome`; worker — `task_kind`, `task_queue`, `outcome`. Перевірені шаблони маршрутів не містять ID, query string, payload чи credentials; невідомі шляхи мають `unknown`. Назви черг задає застосунок: використовуйте обмежений набір, а не чергу на кожен запуск.

Результати клієнта включають `ok`, `http_error`, `bridge_rejected`, `TransportError`, `TimeoutError`, `SdkError` і `pending` для скасованого future. `status_code` зберігає спостережений десятковий HTTP-статус, інакше `none`. Назви результатів винятків Rust не обов’язково збігаються з іншими SDK.

Одне клієнтське спостереження включає внутрішні повтори транспорту/storage admission та обробку відповіді/payload; окремі виклики застосунку чи worker рахуються окремо. Лінивий ітератор спостерігає кожну отриману сторінку. Poll worker включає керовані retry/backoff і розрізняє `task`, `empty`, `backpressure`, `error`. Результати task `completed`, `failed`, `expired` описують обробку dispatch, а не завершення workflow. Це спостереження процесу, не durable-лічильники, одиниці оплати чи schedule-to-start latency; аварійна втрата процесу може втратити останній зразок.

Для офіційного Prometheus adapter увімкніть необов’язковий Cargo feature `metrics-prometheus`. Цей приклад використовує опублікований рецепт залежностей:

```toml
[dependencies]
durable-workflow = { version = "=4.7.0", features = ["metrics-prometheus"] }
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

Збережіть [опублікований приклад](https://github.com/durable-workflow/sdk-rust/blob/4.7.0/examples/metrics_prometheus.rs) як `examples/metrics_prometheus.rs`. Саме ці байти скомпільовані й виконані в перевірці звичайного встановлення; приклад друкує метрики health-запиту:

```rust
//! Preview application-owned Prometheus export; serve `encode()` from your HTTP metrics route.
use durable_workflow::{metrics::PrometheusMetrics, Client};
use std::sync::Arc;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let recorder = Arc::new(PrometheusMetrics::new()?);
    let client = Client::builder(std::env::var("DURABLE_WORKFLOW_SERVER_URL")?)
        .token(std::env::var("DURABLE_WORKFLOW_AUTH_TOKEN").ok())
        .metrics_recorder(recorder.clone())
        .build()?;
    client.health().await?;
    // Workers inherit this client recorder; Worker::metrics_recorder overrides
    // only worker poll/task observations. Applications own the scrape endpoint.
    print!("{}", String::from_utf8(recorder.encode()?)?);
    Ok(())
}
```

Запустіть із власним self-hosted Server:

```bash
DURABLE_WORKFLOW_SERVER_URL=http://localhost:8080 \
DURABLE_WORKFLOW_AUTH_TOKEN=your-token \
cargo run --features metrics-prometheus --example metrics_prometheus
```

`PrometheusMetrics::new()` володіє окремим registry на офіційному Prometheus Rust client 0.14. Видавайте байти `encode()` з маршруту метрик застосунку з `Content-Type: text/plain; version=0.0.4`. Adapter не створює listener чи глобальний registry. Застосунок відповідає за scrape-доступ/автентифікацію, мережеву доступність, ресурси й завершення. Лічильники отримують `_total`, гістограми — стандартні bucket/sum/count. `registry()` дозволяє власний збір і додаткові метрики.

Для OpenTelemetry реалізуйте recorder через наявний meter: лічильники з одиницею `1` і гістограми секунд `s` з точними назвами/тегами вище. Provider, aggregation, resource labels і життєвий цикл exporter належать застосунку. Це окремо від execution tracing. Див. [recorder API](https://rust.durable-workflow.com/durable_workflow/metrics/trait.MetricsRecorder.html), [Prometheus API](https://rust.durable-workflow.com/durable_workflow/metrics/struct.PrometheusMetrics.html) і [опублікований контракт](https://github.com/durable-workflow/sdk-rust/blob/4.7.0/README.md#client-and-worker-metrics).

## Паралельність завдань worker {#worker-task-concurrency}

Описані нижче обмежені лінії виконання потребують Rust SDK **4.3.1 або новішого**. Перевірте версію в `Cargo.lock`: наведена вище фіксація встановлення належить окремому кваліфікованому набору артефактів і може обирати старіший SDK. [Перевірка опублікованого пакета](https://github.com/durable-workflow/sdk-rust/issues/107#issuecomment-6360719863) підтверджує три налаштовані слоти, допуск четвертого виклику після звільнення слота і сім завершених workflow, зокрема з обробленою помилкою activity. Вимоги протоколу Server вище залишаються чинними.

`Worker::max_concurrent_workflow_tasks(...)` і `Worker::max_concurrent_activity_tasks(...)` мають типове значення **10** кожен. `run()` та `run_until()` використовують незалежні обмежені лінії workflow і віддалених activity. Значення **1** задає послідовне виконання в межах цього типу завдань. Наприклад, налаштуйте наявний клієнт перед реєстрацією обробників:

```rust
use durable_workflow::Worker;

let mut worker = Worker::new(client.clone(), "payments")
    .max_concurrent_workflow_tasks(1)
    .max_concurrent_activity_tasks(1);
```

Зареєструйте обробники workflow та activity, потім запускайте `run()` або `run_until()` як звичайно. Дві межі по одному все одно дозволяють одночасно виконувати завдання workflow та віддаленої activity. Query має окрему лінію опитування. Клони worker спільно використовують налаштовану місткість, зокрема для одночасних `run_once()`. Клонування не створює додаткового незалежного бюджету.

Доступність у heartbeat відповідає фактично взятим завданням, включно із завантаженням аргументів/історії, виконанням і підтвердженням результату. Порожнє довге опитування залишає місткість доступною. Успіх, помилка, відмова та скасування звільняють локальний слот. Inline local activity займає слот **завдання workflow** та оминає пул віддалених activity. Тому межа activity не обмежує окремо inline-виконання в різних workflow.

Обробники є async future у Tokio і повинні віддавати керування. Для блокувальної роботи використовуйте `tokio::task::spawn_blocking` або окремий процес із явними межами скасування та завершення. Більша паралельність не ізолює CPU і не робить від’єднаний потік скасовуваним. Перегляньте [Worker API](https://rust.durable-workflow.com/durable_workflow/struct.Worker.html) для встановленої версії SDK.

## Локальні activity {#local-activities}

Rust SDK 3.1.0 додає inline local execution на workers із налаштуванням
`Worker::local_activities(true)`. Реєструйте callbacks звичайними
методами реєстрації activity, а потім викликайте local activity methods
контексту workflow. Конфігурацію retry та timeout наведено у
[виконуваному прикладі](https://github.com/durable-workflow/sdk-rust/blob/3.1.0/examples/local_activities.rs)
та [довіднику LocalActivityOptions](https://rust.durable-workflow.com/durable_workflow/struct.LocalActivityOptions.html).

Server записує термінальний результат для cold replay.
Незафіксовані локальні ефекти можуть повторитися після втрати worker
і мають бути ідемпотентними. Асинхронні callbacks мають передавати
керування Tokio. Блокувальна робота потребує окремого нагляду процесу.
Inline local execution та підготовлений кооперативний локальний нагляд
використовують окремі профілі worker.

## Сеанси worker {#worker-sessions}

Увімкніть `Worker::worker_sessions(true)` та оголосіть вимоги,
які задовольняє worker, через `capabilities(...)`.
Спрямовуйте віддалені activities через
`in_worker_session(WorkerSessionOptions::new(session_id))`.
Контекст activity надає спільний handle через `worker_session()`.
Явні handles підтримують `create()`, `renew()` та `close(reason)`
після реєстрації worker.

Обмежте кількість worker sessions через `max_concurrent_worker_sessions(...)`,
а одночасні activities session — через `max_concurrent_activities(...)`.
Явно поновлюйте idle handles. Heartbeats activity також поновлюють lease
власника, зберігаючи початковий абсолютний TTL. Асинхронний callback,
який передає керування Tokio, відкидається після локально визначеного
спливу lease чи TTL без потреби в application heartbeats.

Ресурси session живуть у процесі власника. Заміна має відбудувати їх.
Перервані зовнішні ефекти потребують ідемпотентності та attempt fencing.
Зафіксовані результати replay без повторного виконання callback.
Graceful shutdown закриває утримувані sessions перед deregistration.
Local activities не можуть використовувати session routing.

Підтримка sessions починається з Rust SDK 3.2.0.
Використовуйте Server 2.5.1 або новіший.
[Виконуваний приклад](https://github.com/durable-workflow/sdk-rust/blob/3.2.0/examples/worker_sessions.rs)
повторно використовує process-local cache у двох типізованих activities
та виводить його generation. Конфігурацію і методи життєвого циклу наведено
в [WorkerSessionOptions](https://rust.durable-workflow.com/durable_workflow/struct.WorkerSessionOptions.html)
та [WorkerSession](https://rust.durable-workflow.com/durable_workflow/struct.WorkerSession.html).

## Обмежений кеш sticky execution {#bounded-sticky-execution}

Увімкніть `Worker::sticky_cache(StickyCacheOptions::new(capacity))`, щоб
зберігати незмінну закодовану історію для наступного replay. Типово кеш
вимкнений. Задайте `max_history_bytes(...)` і `ttl(...)`, щоб обмежити
збережену історію та її час життя. Передбачте додаткову пам’ять для
декодування й replay.

Ключ кешу містить ідентичність workflow, run та збірки. Заміна worker,
спливання, витіснення або некоректний курсор історії повертає виконання
до повного replay стійкої історії. Термінальні workflow та зупинені workers
видаляють свої записи. Код workflow має правильно відтворюватися з порожнім кешем.

Підтримка починається з Rust SDK 3.4.0 та кваліфікованої базової версії Server.
Дивіться [довідник конфігурації](https://rust.durable-workflow.com/durable_workflow/struct.StickyCacheOptions.html),
[виконуваний приклад](https://github.com/durable-workflow/sdk-rust/blob/3.4.0/examples/sticky_execution.rs)
та [посібник переносної спорідненості workers](./portable-worker-affinity.md).

## Підготовка прикладу опублікованого репозиторію {#prepare-the-released-repository-example}

[Приклад `hello_world`](https://github.com/durable-workflow/sdk-rust/blob/main/examples/hello_world.rs)
репозиторію реєструє Rust worker, починає workflow, надсилає signal,
виконує activity, повідомляє heartbeat activity й очікує завершеного результату.
Оскільки приклад запускає клієнт застосунку та worker в одному процесі,
шлях без облікового запису нижче підключає його до самостійно розгорнутого Server.
Підготовлений Cloud namespace є необов'язковим другим runtime
з окремими обліковими даними для ролей.

Для відтворюваної вправи отримайте точний код crate, записаний
у перевіреному наборі. Значення нижче генерується з цього машиночитаного
джерела. Каталог прикладу абсолютний, щоб обидва шляхи підключення
могли перейти до нього безпосередньо:

<!-- docs-example id="rust.sdk.repository-source" -->
```bash
export DURABLE_WORKFLOW_RUST_VERSION=%%artifact.rustSdkVersion%%
export DURABLE_WORKFLOW_RUST_EXAMPLE_DIR="$PWD/durable-workflow-rust-${DURABLE_WORKFLOW_RUST_VERSION}"
git clone --depth 1 --single-branch --branch "$DURABLE_WORKFLOW_RUST_VERSION" \
  https://github.com/durable-workflow/sdk-rust.git "$DURABLE_WORKFLOW_RUST_EXAMPLE_DIR"
```

## Запуск спільного прикладу з власним Server {#run-the-combined-example-with-self-hosted-server}

Незмінений `hello_world` приймає один токен для самостійно розгорнутого
Durable Workflow Server, чия політика автентифікації дозволяє
тим самим обліковим даним виконувати команди workflow і polling роботи:

<!-- docs-example id="rust.sdk.self-hosted" -->
```bash
cd "$DURABLE_WORKFLOW_RUST_EXAMPLE_DIR"
DURABLE_WORKFLOW_SERVER_URL=http://localhost:8080 \
DURABLE_WORKFLOW_TOKEN=dev-token \
cargo run --example hello_world
```

Приклад використовує namespace `default`, підготовлений локальним quickstart
Server. Задайте `TASK_QUEUE`, щоб перевизначити стандартну чергу `rust-workers`.
Цей шлях не потребує участі в Cloud або облікових даних Cloud.

## Необов'язковий другий шлях: Durable Workflow Cloud {#optional-secondary-path-connect-to-durable-workflow-cloud}

Для найкоротшої перевірки керованого runtime використовуйте
[Rust Cloud quickstart](./rust-cloud-quickstart.md).
Він запускає той самий playground Sample App, що доступний PHP та Python,
динамічно вибирає поточні стабільні артефакти, перевіряє точну готовність
worker і очікує завершеного результату.

<ProductPromotion source="docs-v2-rust-sdk">
Уже берете участь у Cloud? Запустіть спільний Rust playground
у підготовленому namespace з окремими обліковими даними ролей runtime.
</ProductPromotion>

Нижчий рівень спільного прикладу SDK нижче корисний для адаптації
наявного Rust-процесу. Експортуйте значення, повернуті Cloud
під час підготовки namespace та створення двох його runtime credentials:

Межу керованого підключення описано в
[керованому Cloud runtime](/docs/polyglot/cloud-control-plane).

<!-- docs-example id="rust.sdk.cloud.environment" -->
```bash
export DURABLE_WORKFLOW_RUNTIME_URL='https://your-runtime-url'
export DURABLE_WORKFLOW_RUNTIME_NAMESPACE='orders'
export DURABLE_WORKFLOW_CLIENT_TOKEN='dwr_client_credential'
export DURABLE_WORKFLOW_WORKER_TOKEN='dwr_worker_credential'
```

У `$DURABLE_WORKFLOW_RUST_EXAMPLE_DIR/examples/hello_world.rs`
замініть наявні налаштування `server_url`, `token` та `Client::builder(...)`
на цю конфігурацію builder з окремими токенами:

<!-- docs-example id="rust.sdk.cloud.client" -->
```rust
let runtime_url = std::env::var("DURABLE_WORKFLOW_RUNTIME_URL")
    .expect("DURABLE_WORKFLOW_RUNTIME_URL must be set");
let runtime_namespace = std::env::var("DURABLE_WORKFLOW_RUNTIME_NAMESPACE")
    .expect("DURABLE_WORKFLOW_RUNTIME_NAMESPACE must be set");
let client_token = std::env::var("DURABLE_WORKFLOW_CLIENT_TOKEN")
    .expect("DURABLE_WORKFLOW_CLIENT_TOKEN must be set");
let worker_token = std::env::var("DURABLE_WORKFLOW_WORKER_TOKEN")
    .expect("DURABLE_WORKFLOW_WORKER_TOKEN must be set");

let client = Client::builder(runtime_url)
    .namespace(runtime_namespace)
    .control_token(Some(client_token))
    .worker_token(Some(worker_token))
    .build()?;
```

Потім запустіть приклад як звичайно:

<!-- docs-example id="rust.sdk.cloud.run" -->
```bash
cd "$DURABLE_WORKFLOW_RUST_EXAMPLE_DIR"
cargo run --example hello_world
```

Виклики start, signal, describe і result workflow прикладу використовують
`control_token`. Реєстрація, polling, heartbeat і completion `Worker`
використовують `worker_token`. Обидві ролі використовують однакові runtime URL,
runtime namespace та task queue від Cloud, але різні облікові дані.
Не замінюйте жодні облікові дані Cloud на `.token(...)`.
Цей метод є загальним single-token fallback власного Server вище.

## Запуск із серверними тайм-аутами workflow {#start-with-server-enforced-workflow-timeouts}

Rust SDK надає `WorkflowStartOptions` та `Client::start_workflow_with_options`
для deadlines workflow, які Server контролює навіть після завершення
процесу-ініціатора. Execution timeout охоплює весь екземпляр workflow,
включно з runs continue-as-new. Run timeout охоплює один run
і обчислюється заново на початку нового run.

<!-- docs-example id="rust.workflow-start-timeouts" -->
```rust
use durable_workflow::{json, Client, Result, WorkflowStartOptions};

async fn start(client: &Client) -> Result<()> {
    let handle = client.start_workflow_with_options(
        "orders.await-payment",
        "orders",
        "order-42",
        WorkflowStartOptions::new()
            .execution_timeout_seconds(300)
            .run_timeout_seconds(30),
        json!([{"order_id": "order-42"}]),
    ).await?;

    println!("workflow={} run={:?}", handle.workflow_id, handle.run_id);
    Ok(())
}
```

Обидва значення задаються в секундах і мають бути додатними.
Run timeout не може перевищувати execution timeout.
Наявний зручний метод `Client::start_workflow` використовує
`WorkflowStartOptions::default()`: execution timeout 3600 секунд
і run timeout 600 секунд. Серверні deadlines та семантику continue-as-new
описано в [timeouts](/docs/features/timeouts).

Це політика workflow, а не HTTP timeout чи timeout polling результату.
Зокрема, `WorkflowResultOptions::timeout` лише припиняє локальне очікування
виклику `result()`. Він не закриває, не скасовує й не змінює run workflow.
Ініціатор може перевірити повернену ідентичність та чекати знову.
Execution чи run deadline із `WorkflowStartOptions` є durable-станом Server.
Після його спливу Server закриває run із термінальним результатом `timed_out`.

## Детерміновані паралельні групи {#deterministic-parallel-groups}

`WorkflowContext::parallel` та його alias `join` поєднують activities,
дочірні workflows, timers, змішані та вкладені групи без нової команди Server.
Конструктори `ParallelOperation` відкладають кожен leaf
до визначення всього дерева:

```rust
use durable_workflow::{json, ChildWorkflowOptions, ParallelOperation};
use std::time::Duration;

let results = ctx.parallel(vec![
    ParallelOperation::activity("load-profile", json!(["customer-42"])),
    ParallelOperation::group(vec![
        ParallelOperation::child_workflow(
            "quote-shipping",
            ChildWorkflowOptions::new("shipping-workers"),
            json!(["customer-42"]),
        ),
        ParallelOperation::timer(Duration::from_secs(1)),
    ]),
]).await?;
```

Кожен leaf має спільну сталу ідентичність групи та повний шлях
від зовнішнього до внутрішнього рівня. Успішні результати зберігають
вкладену форму та порядок вхідних даних. `Error::ParallelFailed`
зберігає типізовану причину leaf, детермінований шлях учасника,
шлях групи та завершених сусідів. Незавершені й завершені історії
replay без повторного планування. Точні дублікати та пізні completions
не змінюють вибраного позиційного результату.

## Стійкий вибір першого завершення {#durable-first-completion-selection}

`WorkflowContext::select` та `select_keyed` одночасно починають activities,
дочірні workflows, timers, signals, очікування умов і вкладені звичайні
групи, а потім продовжують із переможцем, записаним runtime:

```rust
use durable_workflow::{json, ParallelOperation, SelectionKey};
use std::time::Duration;

let selected = ctx.select_keyed(vec![
    ("resolver", ParallelOperation::activity("resolve-request", json!([request_id]))),
    ("input", ParallelOperation::signal("resolution.received")),
    ("deadline", ParallelOperation::timer(Duration::from_secs(2))),
]).await?;

if selected.key == SelectionKey::Name("deadline".to_string()) {
    if let Some(resolver) = selected.handle(&SelectionKey::Name("resolver".to_string())) {
        resolver.cancel().await?;
    }
}
```

`SelectionResult` зберігає сталий ключ/index, вид та ідентичність операції,
типізоване значення чи помилку й `DurableOperationHandle` кожного учасника.
Інші учасники продовжують виконання, доки workflow пізніше не очікує
`handle.await_result()` або `handle.cancel()`.
Future скасування повертає unit. Лише зафіксована історія
`SelectionOperationCancelled` доводить, що скасування перемогло.
Replay проходить запит без такого запису, а `await_result()`
повертає completion, який зафіксувався раніше.
Restart і replay використовують збереженого переможця.
Пізні чи повторні термінальні події не можуть його змінити.

## Компенсація saga {#saga-compensation}

Реєструйте compensation лише після завершення відповідної forward activity,
потім передайте forward-результат до `Saga::finish`:

```rust
let mut saga = ctx.saga();
let outcome = async {
    let flight = ctx.activity("trip.reserve-flight", json!([])).await?;
    saga.add_compensation("trip.cancel-flight", json!([flight]))?;

    let hotel = ctx.activity("trip.reserve-hotel", json!([])).await?;
    saga.add_compensation("trip.cancel-hotel", json!([hotel]))?;

    ctx.activity("trip.charge", json!([])).await?;
    Ok(json!({"status": "booked"}))
}.await;

saga.finish(outcome).await
```

Оброблена помилка виконує наявну команду activity у зворотному порядку
реєстрації, по одній compensation. Компенсація зупиняється на першій помилці.
`Error::SagaCompensationFailed` зберігає обидві типізовані помилки,
тип compensation activity та порядок її реєстрації через restart і replay.
Термінальний `cancel_workflow` не відновлює код workflow для compensations.

## Детерміновані побічні ефекти та маркери версій {#deterministic-side-effects-and-version-markers}

Rust SDK записує невеликі недетерміновані значення через
`WorkflowContext::side_effect` та виводить детерміновані UUIDv4 через
`WorkflowContext::uuid_v4`. Cold replay декодує записане значення
замість повторного виклику callback. Змінений порядок, відсутні,
повторні чи несумісні з codec маркери повертають типізований
`Error::NonDeterministicReplay`.

Використовуйте `WorkflowContext::get_version(change_id, min_supported, max_supported)`,
щоб зберігати replay-сумісність старих і нових гілок workflow під час rollout.
Нові runs записують `max_supported`, а наявні використовують durable-маркер.
`patched(change_id)` надає булеву форму rollout,
а `deprecate_patch(change_id)` зберігає маркер після завершення старої гілки.
Спільну durable-семантику описано в
[side effects](/docs/features/side-effects/) та [версіюванні](/docs/features/versioning/).

## Правила детермінізму Rust {#rust-determinism-rules}

Replay має створювати ті самі durable-команди в тому самому порядку для записаного входу й історії. Звичайні колекції, годинники та примітиви конкурентності Rust не зберігають цей контракт автоматично:

| Шаблон у коді workflow | Durable-заміна |
| --- | --- |
| Планування під час обходу `HashMap` | Спочатку сортуйте ключі або використовуйте `BTreeMap`. |
| Системний годинник, `thread_rng` чи новий UUID | Записуйте знімок через `ctx.side_effect(...)` або використовуйте activity. |
| `tokio::time::sleep` чи `std::thread::sleep` | `ctx.sleep(...)` або `ctx.start_timer(...)`. |
| `tokio::select!` чи перегони звичайних future | `ctx.select(...)` або `ctx.select_keyed(...)`. |
| Невідстежувані конкурентні durable-виклики | `ctx.parallel(...)` зі стабільним порядком входів. |
| Мережа, файлова система чи змінний зовнішній I/O | Зареєстрована activity. |
| Зміна порядку наявних команд під час розгортання | Стабільна гілка `ctx.get_version(...)`, перевірена на записаній історії. |

Зовнішні ефекти activity все ще мають бути ідемпотентними; детермінізм не робить повторний платіж чи запис файлу безпечним. Див. [ідемпотентність і детермінізм](../constraints/idempotent-vs-deterministic.md).

## Офлайн-тести й replay {#offline-testing-and-replay}

Ці API потребують Rust SDK **4.5.0 або новішого**. Перевіряйте `Cargo.lock`: окрема комбінація встановлення вище може вибрати старіший crate без цих API. [Перевірка звичайного встановлення 4.5.0](https://github.com/durable-workflow/sdk-rust/issues/105#issuecomment-6362112580) підтверджує дванадцять перевірок без Server, цей скомпільований приклад і експорт/replay із реального Server 2.11.0. Вона не змінює вибрану комбінацію Server/SDK.

### Unit-тести activity і workflow {#rust-activity-workflow-tests}

`testing::WorkflowEnvironment` запускає зареєстровані workflow й activity у поточному процесі. Використовуйте `from_worker(worker)` для реєстрацій застосунку або реєструйте callback безпосередньо; `worker_mut()` надає звичайні типізовані API реєстрації. Mock задається явно: справжні callback activity виконують власний код, тому свідомо замінюйте зовнішні ефекти.

Для перевіреного рецепта використовуйте `durable-workflow = "=4.5.0"`, Tokio з `macros`, `rt-multi-thread` і `time`, а також `serde_json = "1"` для помічника експорту нижче. Збережіть опублікований приклад як `examples/workflow_testing.rs` і запустіть `cargo run --example workflow_testing`:

```rust
//! Run with `cargo run --example workflow_testing`; no Server is required.
use durable_workflow::{
    json,
    testing::{WorkflowEnvironment, WorkflowHistory},
    Result,
};

#[tokio::main]
async fn main() -> Result<()> {
    let mut env = WorkflowEnvironment::new()?;
    env.register_activity("greet", |_, args| async move {
        Ok(json!(format!(
            "Hello, {}!",
            args[0].as_str().unwrap_or("friend")
        )))
    });
    env.register_workflow("hello", |ctx, args| async move {
        ctx.activity("greet", args).await
    });

    // An activity unit test executes the real callback and argument adapters.
    assert_eq!(
        env.run_activity("greet", "Ada").await?,
        json!("Hello, Ada!")
    );
    // A workflow unit test may replace activity callbacks explicitly.
    env.mock_activity("greet", |_, args| async move {
        Ok(json!({"greeting_for":args[0]}))
    });
    assert_eq!(
        env.run_workflow("hello", "Ada").await?,
        json!({"greeting_for":"Ada"})
    );

    // Replay executes the same registered workflow without running activities.
    // In a deployment test, read the JSON produced by dw workflow:history-export
    // or Client::export_workflow_history instead of this captured test history.
    let history = WorkflowHistory::from_export(env.last_history().unwrap().export())?;
    assert!(env.replay(&history)?.completed);
    println!("activity, workflow and offline replay passed");
    Ok(())
}
```

Прямий `run_activity` виконує одну спробу. Усередині `run_workflow` записана retry policy застосовується до передавання остаточної помилки коду workflow. Справжні чи mock-помилки віддалених/локальних activity використовують типізований `Error::ActivityFailed` із типом винятку, номером спроби та ознакою non-retryable; необроблена помилка workflow зберігає початковий варіант Rust. Heartbeat збираються локально. Коли JSON не зберігає початкове значення Avro, використовуйте варіанти `*_avro_value`.

### Replay експортованого запуску {#rust-replay-export}

Зареєструйте кандидатний workflow, а потім завантажте самодостатній JSON-bundle з `dw workflow:history-export` або `Client::export_workflow_history(workflow_id, run_id).await?`. Додайте цей помічник до прикладу вище; він використовує ті самі імпорти й очікує завершений fixture:

```rust
fn replay(env: WorkflowEnvironment) -> std::result::Result<(), Box<dyn std::error::Error>> {
let export = serde_json::from_slice(&std::fs::read("workflow-history.json")?)?;
let history = WorkflowHistory::from_export(export)?;
let report = env.replay(&history)?;
assert!(report.completed); // A running snapshot can remain durably pending.
Ok(())
}
```

Для сирої історії об’єднайте **всі сторінки** й використовуйте `WorkflowHistory::from_history("hello", original_input, response)`, надавши початкову task queue, якщо її немає. Збережіть початковий вхід і записані результати; видалені/редаговані payload, нерозв’язані зовнішні посилання та залишені page token відхиляються. Помічник експорту SDK завантажує payload за посиланнями. Сам replay не звертається до Server і не виконує callback activity.

Replay використовує декодування worker, side effect, version marker і записані результати select. Змінені чи переставлені команди повертають `Error::NonDeterministicReplay(ReplayFailure)` з `sequence`, `expected` і `actual`; перевірка встановленого пакета на реальному експорті знаходить змінену activity на послідовності 3. Нові команди за межами знімка теж відхиляються. Відкритий знімок може показати durable-очікування префікса замість завершення: перевіряйте очікуваний результат, а нові гілки тестуйте свіжим виконанням у процесі й інтеграційними тестами. Див. [опубліковані replay-тести](https://github.com/durable-workflow/sdk-rust/blob/4.5.0/tests/workflow_testing.rs).

### Межі виконання {#rust-test-execution-limits}

Затримки timer і retry пропускаються. Паралельні callback виконуються в порядку команд, тому середовище не тестує перегони планування чи продуктивність. Воно не моделює черги, lease чи розгортання. Callback activity мають віддавати керування; `max_steps(n)` обмежує durable-переходи, команди й спроби (типово 10 000), а `tokio::time::timeout` може обмежити час асинхронного callback.

Моделювання таймаутів activity, **нові перегони select**, signal, діти, service, session, continue-as-new і скасування потребують інтеграційних тестів; непідтримувані команди повертають `Error::Testing`. Записаний переможець select може відтворюватися, хоча нові перегони select не моделюються. Зберігайте тести на справжньому runtime для цих меж. Див. [testing API](https://rust.durable-workflow.com/durable_workflow/testing/index.html) та [опублікований контракт виконання](https://github.com/durable-workflow/sdk-rust/blob/4.5.0/README.md#testing-without-a-server).

## Сумісність входу та відновлення {#entry-compatibility-and-recovery}

**Підтримка в опублікованих випусках.** SDK Rust 3.5.6 запровадив наведений нижче захист входу, а Server 2.9.9 додав маршрутизацію та відновлення. Це мінімальні версії для цих можливостей. Установлюйте поточні стабільні випуски, щоб отримувати виправлення безпеки.

`Worker::register_typed_workflow` і типізовані адаптери зі станом десеріалізують записаний вхід до виклику handler застосунку або його фабрики стану. Несумісна форма входу повідомляє тип помилки task `WorkflowEntryArgumentsMismatch` і причину `workflow_entry_arguments_mismatch`, не надсилаючи `fail_workflow`. Локальна помилка SDK — `Error::HandlerType` для входу workflow: вона містить workflow й очікуваний Rust-тип, а не записане значення. Низькорівневі handler workflow не отримують нових перевірок Rust-сигнатури. Помилка, повернена handler застосунку після успішного входу, залишається звичайною помилкою workflow, навіть якщо її текст схожий на діагностику входу.

Керований worker автоматично оголошує `workflow_entry_arguments_validation`. Перевірений Server зберігає невдалий task заблокованим для replay і залишає оригінальний run нетермінальним. Старіші runtime можуть натомість повторювати task, тому самого SDK недостатньо для повного контракту відновлення.

Використайте `Client::describe_workflow_run(workflow_id, run_id)` для огляду оригіналу та debug endpoint вибраного run для причини task. Відновіть сумісне декодування входу й код перед HTTP-маршрутом repair вибраного run із [процедури відновлення](../failures-and-recovery.md#service-entry-recovery). У crate немає допоміжного методу `repair_workflow`. Збережіть початкові вхід, історію, namespace, queue, build і дедлайни; версіонуйте зміни durable-команд усередині сумісного handler і перевіряйте холодний replay. Див. [маршрутизацію визначень](./worker-compatibility-routing.md#definition-fingerprint-evolution).

## Скасування, примусове завершення та термінальні результати {#cancel-terminate-and-handle-terminal-outcomes}

У service mode `cancel_workflow` та `terminate_workflow` закривають run
негайно. Вони записують різні термінальні результати, але не просять код
workflow виконати cleanup. Для обмеженого cleanup workflow використовуйте
`request_cancellation()` із workers, які підтримують кооперацію.
Політики операцій, supervision та recovery описано в
[настанові кооперативного скасування](/docs/polyglot/cancellation).

```rust
use durable_workflow::{Client, WorkflowCommandOptions};

# async fn cancel(client: &Client) -> durable_workflow::Result<()> {
client.cancel_workflow(
    "order-42",
    WorkflowCommandOptions::new()
        .reason("customer withdrew the order")
        .request_id("cancel-order-42"),
).await?;
# Ok(())
# }
```

`cancel_workflow` і `terminate_workflow` рівня instance вибирають
поточний run на Server. Для безпеки вибраного run викликайте
`cancel_workflow_run` або `terminate_workflow_run` чи методи handle
`cancel_selected_run` і `terminate_selected_run`.
Якщо вибраний run застарів, `Error::WorkflowCommandRejected` надає
сталий reason `historical_run_command_rejected` разом із workflow ID,
run ID, областю цілі, HTTP status і тілом відповіді.

Успішний `WorkflowHandle::result` продовжує повертати декодоване
JSON-значення. Для решти результатів обробляйте типізовані термінальні
варіанти. Розгалужуйтеся за сталими полями reason та category,
а не за текстом відображення:

<!-- docs-example id="rust.typed-workflow-timeouts" -->
```rust
use durable_workflow::{Error, WorkflowHandle, WorkflowResultOptions};

# async fn wait(handle: WorkflowHandle) -> durable_workflow::Result<()> {
match handle.result(WorkflowResultOptions::default()).await {
    Ok(value) => println!("completed: {value}"),
    Err(Error::WorkflowCancelled(outcome)) => {
        println!("cancelled {:?}: {}", outcome.run_id, outcome.reason);
    }
    Err(Error::WorkflowTerminated(outcome)) => {
        println!("terminated: {}", outcome.reason);
    }
    Err(Error::WorkflowFailed(outcome)) => {
        println!("failure {:?}: {:?}", outcome.failure_id, outcome.exception_class);
    }
    Err(Error::WorkflowTimedOut(outcome)) => match (
        outcome.reason.as_str(),
        outcome.failure_category.as_deref(),
    ) {
        ("result_wait_timeout", Some("client_timeout")) => {
            println!(
                "caller deadline for {} / {:?}; the run may still be open",
                outcome.workflow_id, outcome.run_id,
            );
        }
        ("execution_timeout" | "run_timeout", category) => {
            println!(
                "server timeout for {} / {:?}: reason={} category={:?}",
                outcome.workflow_id, outcome.run_id, outcome.reason, category,
            );
        }
        (reason, category) => {
            println!("other typed timeout: reason={reason} category={category:?}");
        }
    }
    Err(error) => return Err(error),
}
# Ok(())
# }
```

Кожен термінальний результат містить ідентичність workflow та run.
Він також зберігає публічний reason, категорію та ідентичність помилки,
тип і клас винятку, non-retryable стан, повідомлення та payload винятку,
якщо Server їх надає. Локальний deadline очікування має
reason `result_wait_timeout` і category `client_timeout`.
Серверний timeout є термінальним run `timed_out` зі сталим reason
`execution_timeout` або `run_timeout`.

Handles обох методів start зберігають вибраний `run_id`.
`WorkflowHandle::result` описує маршрут конкретного run, тому повторне
використання workflow ID для нового run не може непомітно повернути
новіший результат під час очікування. Зберігайте `outcome.workflow_id`
та `outcome.run_id` у логах, метриках і записах retry.
Використовуйте пошук рівня instance лише коли навмисно стежите за поточним run.

## Оновлення workflow {#workflow-updates}

Rust підтримує durable updates у ролях клієнта застосунку,
вибраного handle та написання worker. Використовуйте
`Client::update_workflow` чи `WorkflowHandle::update` для JSON-сумісних
значень, а відповідні `update_workflow_avro_value` чи `update_avro_value`
для явно типізованих Avro-значень.

Workers реєструють іменовані обробники через `Worker::register_update`.
Використовуйте `register_update_avro_value`, коли обробник безпосередньо
приймає та повертає Avro-значення. Update є durable-зміною workflow
з результатом. Він відрізняється від signals без очікування відповіді
та read-only queries із replay.

## Оболонка payload {#payload-envelope}

Вхідні дані workflow, signals, activities, queries та результати
використовують опублікований контракт `PayloadEnvelope`:
`codec` та закодований `blob`. Стандартний шлях SDK `avro`
використовує оголошену залежність `apache-avro` та закріплену версійовану
Value schema платформи. Не створюйте blob самостійно й не замінюйте
оболонку записом, специфічним для реалізації.

<!-- docs-example id="rust.avro-payload-envelope" -->
```rust
use durable_workflow::{decode_payload, json, PayloadEnvelope, Result, Value};

fn round_trip() -> Result<()> {
    let envelope = PayloadEnvelope::avro(&json!({"order_id": "order-42"}))?;
    assert_eq!(envelope.codec, "avro");

    let decoded: Value = decode_payload(&envelope)?;
    assert_eq!(decoded["order_id"], "order-42");
    Ok(())
}
```

`start_workflow` та `start_workflow_with_options` автоматично
застосовують цю оболонку до серіалізовуваних вхідних даних.
Використовуйте публічні helpers лише коли програма має
безпосередньо обмінюватися оболонкою.

## Heartbeat activity {#activity-heartbeats}

Для віддалених activities `ActivityContext::heartbeat(...).await` повертає `Result<ActivityHeartbeatResponse>`. Поширюйте помилки й перевіряйте `should_stop()` в успішній відповіді. Помилки прямих запитів охоплюють `Error::Transport` і типізовані відмови HTTP `Error::ActivityTaskRejected`. Завдання з кооперативним наглядом може натомість повернути `Error::ActivityExecutionAbandoned`, якщо heartbeat або перевірка повноважень зазнає збою. Припиняйте зовнішню роботу після втрати повноважень. Не припускайте, що callback завжди досягне коду очищення програми.

Перше вікно heartbeat починається під час отримання runtime повноважень на завдання, до його доставлення. Записаний heartbeat використовує час runtime, а не час отримання відповіді клієнтом. Виберіть періодичність із великим запасом у межах тайм-ауту, обмежуйте кожен крок роботи чи вводу-виводу та залишайте запас для пауз, затримки запитів і можливих транспортних повторів. Дотримуйтеся [порад щодо періодичності](../features/heartbeats.md#heartbeat-cadence-and-receipts). Автоматичний розклад чи групування heartbeat прогресу не гарантується.

За скасування звільняйте локальні ресурси процесу, якщо виконання ще дозволяє це, і швидко повертайте керування. Сталий стан відхиляє пізній completion і не дозволяє перетворити скасований чи terminated run на успіх. Керовані workers продовжують polling після остаточної відмови та після restart. Успішний heartbeat не є commit зовнішніх ефектів або відновлюваною контрольною точкою для замінної спроби.

Образи Server, автентифікацію та production-топологію описано в
[настанові налаштування Server](/docs/polyglot/server).
