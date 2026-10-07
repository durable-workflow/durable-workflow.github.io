---
sidebar_position: 2
title: Швидкий старт Durable Workflow 2.0
description: Оберіть runtime сервісного режиму та завершіть перший workflow із PHP, Python або Rust.
tags:
  - quickstart
  - getting-started
  - PHP
  - Python
  - Rust
keywords:
  - швидкий старт Durable Workflow
  - швидкий старт Durable Workflow 2.0
  - швидкий старт окремого PHP SDK
  - швидкий старт Python SDK
  - швидкий старт Rust SDK
  - швидкий старт окремого Server Docker
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import PythonPackageReleaseLink from '@site/src/components/PythonPackageReleaseLink';

# Швидкий старт Durable Workflow 2.0 {#durable-workflow-20-quickstart}

## Перед початком {#before-you-begin}

**Мета:** виконати один workflow сервісного режиму та прочитати його
завершений стійкий результат із PHP, Python або Rust.

**Очікуваний час:** приблизно 15 хвилин після підготовки runtime.

**Результат завершення:** обраний SDK запускає worker і workflow, потім
друкує ID workflow, `status=completed` і `Hello, <language>!`.

**Передумови:**

- `curl` і термінал;
- Docker для локального власного розгортання або підготовлений простір
  імен Durable Workflow Cloud;
- інструменти однієї мови: PHP 8.1+ із Composer, Python 3.10+ або Rust 1.86+.

Сервісний режим не потребує Laravel. Окремий шлях вбудованого Laravel
наведено наприкінці посібника.

## 1. Оберіть runtime сервісного режиму {#1-choose-your-service-mode-runtime}

| Runtime | Коли обрати | Наступна дія |
| --- | --- | --- |
| Durable Workflow Cloud | Ви хочете, щоб Durable Workflow обслуговував runtime, збереження стану та Managed Waterline. | Виконайте [перший workflow Cloud](/docs/polyglot/cloud-control-plane/#cloud-first-workflow), що зіставляє повні приклади PHP, Python і Rust з наданими обліковими даними та результатом `completed`. **Не запускайте Server або окрему службу Waterline.** |
| Власний Server | Ви хочете обслуговувати runtime самостійно або виконати цей точний локальний приклад на опублікованих артефактах. | Продовжіть нижче з Docker і `curl`. Окремо розгортайте Waterline лише за потреби його UI оператора. |

Виконуваний код нижче використовує локальний власний Server, щоб приклад
працював без облікового запису чи checkout вихідного коду. Cloud використовує
ту саму модель SDK та worker. Замініть локальне підключення розробки на
надані значення з [керованого runtime Cloud](/docs/polyglot/cloud-control-plane/).

## 2. Запустіть локальний Server {#2-start-the-local-server}

Пропустіть цю дію, якщо обрали Cloud. Для власного розгортання розгорніть
і виконайте точне закріплене налаштування. Воно запускає Server без
вихідного checkout із SQLite та токеном розробки.

<details>
<summary>Запустіть закріплений образ Server</summary>

<!-- docs-example id="quickstart.server.setup" -->
```bash
export DW_SERVER_IMAGE=%%artifact.serverDockerHubImage%%
export DW_AUTH_TOKEN=dev-token

docker volume create durable-workflow-quickstart

docker run --rm \
  -v durable-workflow-quickstart:/app/database \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$DW_SERVER_IMAGE" server-bootstrap

docker rm -f durable-workflow-server >/dev/null 2>&1 || true
docker run -d --name durable-workflow-server \
  -p 8080:8080 \
  -v durable-workflow-quickstart:/app/database \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$DW_SERVER_IMAGE"

until curl -sf http://localhost:8080/api/ready >/dev/null; do sleep 1; done
curl -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  http://localhost:8080/api/cluster/info
```

</details>

**Очікуваний результат:** запит готовності успішний, а cluster info визначає
локальний окремий Server. Залиште його запущеним під час виконання
шляху обраної мови.

## 3. Оберіть одну мову {#choose-one-language}

Усі три офіційні SDK доступні на одному рівні. Показується лише обрана
вкладка, щоб ви виконали один шлях без прокручування двох інших програм.

<Tabs groupId="quickstart-language" className="quickstart-language-tabs">
<TabItem value="php" label="PHP" default>

Вимоги: PHP 8.1 або новіший і Composer. Використовується незалежний від
фреймворку пакет `durable-workflow/sdk`.

1. **Встановіть SDK.**

<!-- docs-example id="quickstart.php.install" -->
```bash
mkdir durable-workflow-php-quickstart
cd durable-workflow-php-quickstart
composer require %%artifact.phpSdkComposerPackage%%
```

2. **Додайте worker і клієнт.** Розгорніть повний код і скопіюйте обидва
   файли в новий проєкт.

<details>
<summary>Повний виконуваний код PHP</summary>

Worker реєструє один тип workflow та один тип activity у власній черзі
завдань.

<!-- docs-example id="quickstart.php.worker" -->
```bash
cat > worker.php <<'PHP'
<?php

declare(strict_types=1);

require __DIR__.'/vendor/autoload.php';

use DurableWorkflow\Client;
use DurableWorkflow\Worker;
use DurableWorkflow\Worker\ActivityContext;
use DurableWorkflow\Worker\WorkflowContext;

$client = new Client('http://localhost:8080', token: 'dev-token');
$worker = new Worker($client, 'quickstart-php');

$worker->registerActivity(
    'quickstart.greet',
    static fn (ActivityContext $context, string $name): string => "Hello, {$name}!",
);

$worker->registerWorkflow(
    'quickstart.greeter',
    static function (WorkflowContext $context, string $name): array {
        $greeting = $context->activity('quickstart.greet', [$name]);

        return ['greeting' => $greeting, 'language' => 'php'];
    },
);

$worker->run();
PHP
```

#### Клієнт і читання результату {#client-and-result-reader}

Цей клієнт запускає workflow з унікальною назвою, очікує його обраний run
і потім описує стійкий термінальний стан, збережений Server.

<!-- docs-example id="quickstart.php.client" -->
```bash
cat > start.php <<'PHP'
<?php

declare(strict_types=1);

require __DIR__.'/vendor/autoload.php';

use DurableWorkflow\Client;

$client = new Client('http://localhost:8080', token: 'dev-token');
$workflowId = 'quickstart-php-greeter-'.bin2hex(random_bytes(4));
$handle = $client->startWorkflow(
    workflowType: 'quickstart.greeter',
    workflowId: $workflowId,
    taskQueue: 'quickstart-php',
    input: ['PHP'],
);

$result = $handle->result(timeoutSeconds: 30);
$execution = $handle->describeSelectedRun();

echo "workflow_id={$execution->workflowId}\n";
echo "status={$execution->status}\n";
echo 'result='.json_encode($result, JSON_THROW_ON_ERROR)."\n";
PHP
```

</details>

3. **Запустіть worker і клієнт.**

<!-- docs-example id="quickstart.php.run" -->
```bash
php worker.php > quickstart-worker.log 2>&1 &
export QUICKSTART_WORKER_PID=$!
trap 'kill "$QUICKSTART_WORKER_PID" 2>/dev/null || true' EXIT

php start.php

kill "$QUICKSTART_WORKER_PID" 2>/dev/null || true
trap - EXIT
```

**Очікуваний результат:** `status=completed` і результат із
`"greeting":"Hello, PHP!"`. Ви запустили окремий worker PHP та
переглянули його стійкий результат без Laravel.

Продовжіть із [посібником PHP SDK](/docs/polyglot/php/).

</TabItem>
<TabItem value="python" label="Python">

Вимоги: Python 3.10 або новіший. Програма містить worker і клієнт в одному
процесі, але вони спілкуються із Server через публічні API worker та
площини керування.

1. **Встановіть SDK.**

   Використовуйте <PythonPackageReleaseLink authority="qualified">стабільний
   випуск Python SDK</PythonPackageReleaseLink> із маніфесту вище.
   Згенерована точна вимога зберігає цей виконуваний шлях на задокументованій
   стабільній лінійці випуску.

<!-- docs-example id="quickstart.python.install" -->
```bash
mkdir durable-workflow-python-quickstart
cd durable-workflow-python-quickstart

python3 -m venv .venv
. .venv/bin/activate
pip install %%artifact.pythonPackagePin%%
```

2. **Створіть і запустіть worker та клієнт.** Розгорніть повну програму.
   Її остання команда запускає виконання.

<details>
<summary>Повний виконуваний код Python</summary>

<!-- docs-example id="quickstart.python.greeter" -->
```bash
cat > greeter.py <<'PY'
import asyncio
import time

from durable_workflow import Client, Worker, activity, workflow


@activity.defn(name="quickstart.greet")
async def greet(name: str) -> dict:
    return {"greeting": f"Hello, {name}!", "language": "python"}


@workflow.defn(name="quickstart.greeter")
class GreeterWorkflow:
    def run(self, ctx, name):
        return (yield ctx.schedule_activity("quickstart.greet", [name]))


async def main():
    workflow_id = f"quickstart-python-greeter-{int(time.time())}"

    async with Client(
        "http://localhost:8080",
        token="dev-token",
        namespace="default",
    ) as client:
        handle = await client.start_workflow(
            workflow_type="quickstart.greeter",
            task_queue="quickstart-python",
            workflow_id=workflow_id,
            input=["Python"],
        )

        worker = Worker(
            client,
            task_queue="quickstart-python",
            workflows=[GreeterWorkflow],
            activities=[greet],
        )
        await worker.run_until(workflow_id=workflow_id, timeout=30.0)

        result = await handle.result(timeout=10.0)
        execution = await handle.describe_run()

    print(f"workflow_id={execution.workflow_id}")
    print(f"status={execution.status}")
    print(f"result={result}")


asyncio.run(main())
PY

python greeter.py
```

</details>

**Очікуваний результат:** `status=completed` і результат із
`Hello, Python!`. Останні два виклики SDK читають результат обраного run
та стійкий термінальний стан із Server.

Продовжіть із [посібником Python SDK](/docs/polyglot/python/).

</TabItem>
<TabItem value="rust" label="Rust">

Вимоги: Rust 1.86 або новіший. Приклад запускає власний worker і клієнт
в одному процесі Tokio.

1. **Встановіть SDK.**

<!-- docs-example id="quickstart.rust.install" -->
```bash
cargo new durable-workflow-rust-quickstart
cd durable-workflow-rust-quickstart
%%artifact.rustCargoAddCommand%%
cargo add tokio --features macros,rt-multi-thread,time
```

2. **Створіть і запустіть worker та клієнт.** Розгорніть повну програму.
   Її остання команда компілює та запускає виконання.

<details>
<summary>Повний виконуваний код Rust</summary>

<!-- docs-example id="quickstart.rust.greeter" -->
```bash
cat > src/main.rs <<'RS'
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use durable_workflow::{json, Client, Result, Worker, WorkflowResultOptions};

#[tokio::main]
async fn main() -> Result<()> {
    let client = Client::builder("http://localhost:8080")
        .token(Some("dev-token".to_string()))
        .namespace("default")
        .build()?;
    let task_queue = "quickstart-rust";
    let mut worker = Worker::new(client.clone(), task_queue);

    worker.register_activity("quickstart.greet", |_context, arguments| async move {
        let name = arguments
            .get(0)
            .and_then(|value| value.as_str())
            .unwrap_or("Rust");
        Ok(json!({"greeting": format!("Hello, {name}!"), "language": "rust"}))
    });

    worker.register_workflow("quickstart.greeter", |context, input| async move {
        let name = input.get(0).and_then(|value| value.as_str()).unwrap_or("Rust");
        context.activity("quickstart.greet", json!([name])).await
    });

    worker.register().await?;
    let workflow_id = format!("quickstart-rust-greeter-{}", unique_suffix());
    let handle = client
        .start_workflow(
            "quickstart.greeter",
            task_queue,
            &workflow_id,
            json!(["Rust"]),
        )
        .await?;

    let watcher = handle.clone();
    worker
        .run_until(async move {
            loop {
                if watcher.describe().await.is_ok_and(|run| run.is_terminal()) {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
        })
        .await?;

    let result = handle.result(WorkflowResultOptions::default()).await?;
    let execution = handle.describe_selected_run().await?;

    println!("workflow_id={workflow_id}");
    println!("status={}", execution.status.as_deref().unwrap_or("unknown"));
    println!("result={result}");
    Ok(())
}

fn unique_suffix() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}
RS

cargo run
```

</details>

**Очікуваний результат:** `status=completed` і результат JSON із
`"greeting":"Hello, Rust!"`. Приклад очікує завершення run своїм worker,
потім читає стійкий статус і декодований результат обраного run.

Продовжіть із [посібником Rust SDK](/docs/polyglot/rust/).

</TabItem>
</Tabs>

## 4. Приберіть локальний Server {#4-clean-up-the-local-server}

Користувачам Cloud не потрібно видаляти локальний Server. Для прикладу
власного розгортання:

```bash
docker rm -f durable-workflow-server
docker volume rm durable-workflow-quickstart
```

## Окремий шлях: вбудований Laravel {#separate-path-embedded-laravel}

Вбудований Laravel — окремий офіційний режим розгортання PHP для
застосунків, яким потрібні стан workflow, виконання черг, налаштування й
інструменти оператора всередині наявної інфраструктури Laravel. Він
встановлює `durable-workflow/workflow` без окремого Server або
`durable-workflow/sdk`.

Створіть новий вбудований застосунок з опублікованим пакетом:

```bash
composer create-project laravel/laravel durable-workflow-laravel-quickstart
cd durable-workflow-laravel-quickstart
composer require %%artifact.workflowComposerPackage%%
php artisan migrate
php artisan queue:work
```

Для UI оператора в тому самому Laravel-застосунку додайте перевірений
вбудований пакет Waterline Composer:

```bash
composer require %%artifact.waterlineComposerPackage%%
php artisan waterline:install
```

Цей пакет Composer відрізняється від окремо розгорнутої служби Waterline
для власного Server. Вбудований Laravel не запускає Server і не встановлює
SDK сервісного режиму.

Продовжіть із [вбудованим встановленням](/docs/installation/) для
налаштування черги Laravel, відмінної від `sync`, потім
[визначте](/docs/defining-workflows/workflows/) і
[запустіть](/docs/defining-workflows/starting-workflows/) вбудований workflow.
[Режими розгортання](/docs/polyglot/deployment-modes/) порівнюють цей
спеціалізований шлях із платформою сервісного режиму.

## Наступні кроки {#next-steps}

- Використовуйте [індекс можливостей](/docs/capabilities/) для перевірки
  підтримуваного інтерфейсу обраного runtime та SDK.
- Продовжіть із посібником сервісного режиму
  [PHP SDK](/docs/polyglot/php/), [Python SDK](/docs/polyglot/python/)
  або [Rust SDK](/docs/polyglot/rust/).
- Порівняйте життєвий цикл, повідомлення, розклади, видимість і виконання
  worker у [можливостях клієнтів і worker](/docs/polyglot/cli-python-parity/).
- Обслуговуйте відповідний runtime через
  [керований runtime Cloud](/docs/polyglot/cloud-control-plane/) або
  [власний Server](/docs/polyglot/server/), потім додайте
  [CLI](/docs/polyglot/cli/) за потреби автоматизації shell.
- Плануйте безпечне розгортання сервісних worker через
  [сумісність і маршрутизацію worker](/docs/polyglot/worker-compatibility-routing/)
  та [оновлення build ID](/docs/polyglot/worker-build-id-rollout/).

Для написання вбудованих timer, signal, query, activity та дочірніх
workflow Laravel використовуйте окрему
[вбудовану документацію](/docs/category/embedded/).

[Набір перевірок відповідності платформи](/docs/platform-conformance/)
містить вимоги до перевірки випуску: точну матрицю артефактів, перевірки
публічних джерел, повні журнали виконання, критерії реального часу,
прибирання та машиночитаний контракт quickstart для сертифікації.
