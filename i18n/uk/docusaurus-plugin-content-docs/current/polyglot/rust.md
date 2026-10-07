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
і timeouts activity, local activities, worker sessions, signals,
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

Crate потребує Rust 1.86 або новішого. Metadata пакета оголошує точний
перевірений діапазон Durable Workflow Server, worker-протокол 1.19
та площину керування 2. Під час розгортання визначальними залишаються
protocol manifests, оголошені `GET /api/cluster/info`.

Server узгоджує заголовки worker-протоколу в межах major `1`:
Server з `1.N` приймає заголовок worker `1.M` лише за `M <= N`.
Звичайні workers Rust SDK надсилають
`X-Durable-Workflow-Protocol-Version: 1.19` і потребують Server,
який оголошує `1.19` або новіший. Перевірений Server оголошує `1.20`.
Явно ввімкнений профіль кооперативного скасування потребує `1.20`.

Узгодження відхиляє невідповідність. Відсутній чи некоректний заголовок,
інший major або worker minor вище оголошеного Server відхиляються.
Діапазон версій Server вибирає сімейство випусків і не перевизначає
protocol manifest runtime.

## Local activities {#local-activities}

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
використовують окремі профілі worker. Sticky execution у Rust не підтримується.

## Worker sessions {#worker-sessions}

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

## Запуск із серверними timeouts workflow {#start-with-server-enforced-workflow-timeouts}

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

## Durable-вибір першого завершення {#durable-first-completion-selection}

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

## Детерміновані side effects та маркери версій {#deterministic-side-effects-and-version-markers}

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

## Cancel, terminate та термінальні результати {#cancel-terminate-and-handle-terminal-outcomes}

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

## Workflow updates {#workflow-updates}

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

Довготривалі activities мають надсилати heartbeats та перевіряти `should_stop()`.
За скасування звільніть тимчасові файли, підключення та інші
process-local ресурси й швидко поверніть керування.
Пізній completion відхиляється durable-станом і не може перетворити
скасований чи terminated run на успіх. Керовані workers продовжують
polling після такого остаточного відхилення та після restart.

Образи Server, автентифікацію та production-топологію описано в
[настанові налаштування Server](/docs/polyglot/server).
