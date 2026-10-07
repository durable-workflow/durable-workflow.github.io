---
sidebar_position: 4
tags:
  - Python
  - SDK
  - workers
  - polyglot
keywords:
  - sample-app-playground
  - Python SDK
  - durable_workflow Client
  - worker Python
  - асинхронний клієнт workflow
---

import ProductPromotion from '@site/src/components/ProductPromotion';
import PythonPackageReleaseLink from '@site/src/components/PythonPackageReleaseLink';

# Python SDK {#python-sdk}

Python SDK є легким клієнтом із пріоритетом асинхронної роботи для власного
Durable Workflow Server або runtime namespace Durable Workflow Cloud.
Він дозволяє процесам Python запускати, спостерігати, надсилати signal і
скасовувати workflow через control-plane API та реєструватися як worker
для виконання завдань workflow й activity.

## Спробуйте локальний майданчик Sample App {#try-the-local-sample-app-playground}

Для найкоротшого шляху розробки без Cloud відкрийте поточну
[гілку `main` Sample App у GitHub Codespaces](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main)
і виконайте:

<!-- docs-example id="sdk.python.sample-app-playground" -->
```bash
scripts/playground python
```

Локальний майданчик генерує вихідний код workflow й activity, який належить
користувачу, вибирає поточні стабільні артефакти та запускає опубліковані
Server і Waterline. Перед запуском workflow чекає реєстрації worker з
ідентичністю, типами workflow/activity й чергою, відповідними згенерованому
контракту. Успіх потребує очікуваних завершеного результату й історії.
Термінал показує точне локальне посилання виконання Waterline та шлях
до структурованих доказів JSON.

Встановлення пакета, quickstart, довідник API й приклад репозиторію нижче
залишаються прямими шляхами для користувачів без Sample App.

<ProductPromotion source="docs-v2-python-sdk">
Запускайте клієнти й worker Python проти керованого Cloud namespace
з окремими обліковими даними ролей.
</ProductPromotion>

SDK використовує ту саму надійну модель, що й пакет PHP: спільні ID
екземплярів і виконань, події історії, черги й ключі типів.
Worker Python може виконувати activity для workflow PHP і навпаки.

Порівняння Python SDK, PHP SDK, Rust SDK і `dw` наведено в
[можливостях клієнтів і worker](/docs/polyglot/cli-python-parity/).

Сигнатури конструкторів, типи результатів, класи винятків і назви метрик є
в згенерованому [довіднику API Python SDK](https://python.durable-workflow.com/).

Клієнти Cloud використовують надані URL runtime і namespace з окремими
обліковими даними клієнта й worker. Цю межу підключення описано в
[керованому runtime Cloud](/docs/polyglot/cloud-control-plane).
Quickstart нижче використовує локальні значення самостійного Server.

## Вимоги {#requirements}

- Python 3.10 чи новіший
- Docker для локального Server цього quickstart, наявний
  [самостійний Server](/docs/polyglot/server) або наданий
  [runtime namespace Cloud](/docs/polyglot/cloud-control-plane)

## Встановлення {#installation}

Встановіть <PythonPackageReleaseLink authority="qualified">стабільний реліз
Python SDK</PythonPackageReleaseLink>. Точна вимога генерується з того
самого кортежу, що й quickstart Server. Файл lock чи constraints
може зберегти її для відтворюваності.

<!-- docs-example id="python.sdk.install" -->
```bash
pip install %%artifact.pythonPackagePin%%
```

SDK залежить від [httpx](https://www.python-httpx.org/) для HTTP та пакета
`fastavro` для кодування Apache Avro єдиного публічного кодека payload v2.
Підтримка метрик Prometheus необов'язкова.

## Quickstart {#quickstart}

Ця повна програма Python визначає workflow з однією activity,
запускає його на локальному Durable Workflow Server і чекає результату:

<!-- docs-example id="python.quickstart.worker" -->
```python
import asyncio
import uuid

from durable_workflow import Client, Worker, workflow, activity

@activity.defn(name="greet")
async def greet(name: str) -> dict:
    return {"greeting": f"Hello, {name}!", "length": len(name)}

@workflow.defn(name="greeter")
class GreeterWorkflow:
    def run(self, ctx, *args):
        result = yield ctx.schedule_activity("greet", list(args))
        return result

async def main():
    workflow_id = f"greeting-{uuid.uuid4().hex}"

    async with Client("http://localhost:8080", token="dev-token", namespace="default") as client:
        handle = await client.start_workflow(
            workflow_type="greeter",
            task_queue="default",
            workflow_id=workflow_id,
            input=["world"],
        )

        worker = Worker(
            client,
            task_queue="default",
            workflows=[GreeterWorkflow],
            activities=[greet],
        )

        await worker.run_until(workflow_id=workflow_id, timeout=30.0)
        result = await handle.result(timeout=10.0)

    print(result)  # {"greeting": "Hello, world!", "length": 5}

asyncio.run(main())
```

### Запуск із локальним Server {#running-against-a-local-server}

Програма вище очікує Server на `http://localhost:8080` з локальним
`dev-token`. Найшвидший запуск без вихідного коду: опублікований образ Server:

```bash
export DW_SERVER_IMAGE=%%artifact.serverDockerHubImage%%
export DW_AUTH_TOKEN=dev-token

docker volume create durable-workflow-python-quickstart

docker run --rm \
  -v durable-workflow-python-quickstart:/app/database \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$DW_SERVER_IMAGE" server-bootstrap

docker rm -f durable-workflow-server >/dev/null 2>&1 || true
docker run -d --name durable-workflow-server \
  -p 8080:8080 \
  -v durable-workflow-python-quickstart:/app/database \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$DW_SERVER_IMAGE"

until curl -sf http://localhost:8080/api/ready > /dev/null; do sleep 1; done
```

Production розгортання, драйвери автентифікації, базу й TLS описано в
[посібнику налаштування Server](/docs/polyglot/server).

Більший приклад: [`examples/order_processing`](https://github.com/durable-workflow/sdk-python/tree/main/examples/order_processing)
у репозиторії SDK. Стек Docker Compose запускає worker Python і виконує
workflow замовлення наскрізно.

## Довідник API клієнта {#client-api-reference}

Асинхронний `durable_workflow.Client` є публічною точкою входу до HTTP
control-plane і worker. Використовуйте його як async context manager,
щоб пул з'єднань `httpx.AsyncClient` коректно закривався.

```python
from durable_workflow import Client

async with Client(
    "https://workflow.example.com",
    token="shared-token",
    namespace="default",
    timeout=60.0,
) as client:
    info = await client.get_cluster_info()
```

### Конструктор {#constructor}

| Аргумент | Тип | Типове значення | Призначення |
| --- | --- | --- | --- |
| `base_url` | `str` | обов'язковий | Origin Server без `/api`. |
| `token` | `str | None` | `None` | Один bearer token для control-plane і worker. |
| `control_token` | `str | None` | `None` | Окремий bearer token control-plane від poll worker. |
| `worker_token` | `str | None` | `None` | Окремий bearer token worker від операторських викликів. |
| `namespace` | `str` | `"default"` | Цільовий namespace Server через `X-Namespace`. |
| `timeout` | `float` | `60.0` | Перевизначення типового HTTP тайм-ауту. |
| `retry_policy` | `TransportRetryPolicy | None` | типова політика | Налаштування retry тимчасових помилок HTTP. |
| `metrics` | `MetricsRecorder | None` | no-op | Метрики клієнта й worker через власний recorder. |
| `payload_size_limit_bytes` | `int` | типове SDK | Відповідність максимальному розміру payload Server. |
| `payload_size_warning_threshold_percent` | `int` | типове SDK | Попередження до досягнення межі payload. |
| `payload_size_warnings` | `bool` | `True` | Вимкнення локальних попереджень розміру в тестах чи контрольованих скриптах. |

`token` є найпростішим варіантом. Якщо задані `control_token` і
`worker_token`, методи control-plane використовують перший, а worker другий.

### Зовнішнє сховище payload {#external-payload-storage}

SDK експортує той самий контракт посилання на зовнішній payload, що й
Server та API сховища CLI. Використовуйте його, якщо обробники activity
Python чи носії invocable мають декодувати великі посилання з історії,
або процес Python створює незалежну від мови обгортку без великих
вбудованих байтів.

| API | Роль | Помилки |
| --- | --- | --- |
| `ExternalStorageDriver` | Протокол `put(data, sha256=..., codec=...)`, `get(uri)`, `delete(uri)`. | Помилки сховища драйвера. |
| `LocalFilesystemExternalStorage` | Драйвер `file://` без залежностей для локальної розробки й тестів. | `ValueError` за URI поза налаштованим коренем. |
| `S3ExternalStorage` | Адаптер клієнта, сумісного з boto3. | `ValueError` за сторонній bucket/prefix чи небайтову відповідь. |
| `GCSExternalStorage` | Адаптер клієнта стилю google-cloud-storage. | `ValueError` за сторонній bucket/prefix чи небайтову відповідь. |
| `AzureBlobExternalStorage` | Адаптер клієнта контейнера Azure. | `ValueError` за сторонній container/prefix чи небайтову відповідь. |
| `ExternalPayloadReference` | Незмінне посилання з `uri`, `sha256`, `size_bytes`, `codec` і схемою. | `ValueError`, якщо `from_dict()` отримує непідтримувану схему чи неправильні поля. |
| `ExternalPayloadCache` | Обмежений кеш replay вже перевірених зовнішніх байтів. | Конструктор відхиляє недодатні межі кількості записів чи байтів. |
| `store_external_payload()` | Зберігає закодовані байти драйвером і повертає `ExternalPayloadReference`. | Помилки драйвера. |
| `fetch_external_payload()` | Отримує байти й перевіряє розмір та SHA-256 до декодування. | `ExternalPayloadIntegrityError` за невідповідності розміру/hash. |
| `delete_external_payload()` | Видаляє об'єкт і запис кешу. | Помилки сховища драйвера. |
| `external_storage_envelope()` | Кодує значення всередині до перевищення порогу, потім пише драйвером. | `ValueError` за неправильного порогу чи відсутнього драйвера посилання. |
| `external_storage_driver_from_policy()` | Створює драйвер політики Server чи Cloud `external_payload_storage` із клієнтами провайдерів застосунку. | `ValueError` за вимкненої/непідтримуваної політики чи відсутніх client/bucket/container. |

```python
from durable_workflow import (
    ExternalPayloadCache,
    LocalFilesystemExternalStorage,
    external_storage_envelope,
    to_avro_payload_value,
)
from durable_workflow.serializer import encode
from durable_workflow.external_storage import fetch_external_payload, store_external_payload

storage = LocalFilesystemExternalStorage("/var/lib/durable-workflow/payloads")
cache = ExternalPayloadCache(max_entries=256, max_bytes=32 * 1024 * 1024)

payload = to_avro_payload_value({"invoice_pdf": "x" * 1_000_000})
envelope = external_storage_envelope(
    payload,
    external_storage=storage,
    threshold_bytes=64 * 1024,
)

reference = store_external_payload(
    storage,
    encode({"archived": True}).encode("utf-8"),
    codec="avro",
)
payload_bytes = fetch_external_payload(storage, reference, cache=cache)
```

Схема посилання: `EXTERNAL_PAYLOAD_REFERENCE_SCHEMA`
(`durable-workflow.v2.external-payload-reference.v1`). Адаптери об'єктних
сховищ не додають залежностей cloud SDK до `durable-workflow`:
застосунок передає вже налаштовані клієнти S3, GCS чи Azure.

Поля мережевої обгортки навмисно невеликі й стабільні:

```json
{
  "schema": "durable-workflow.v2.external-payload-reference.v1",
  "uri": "s3://dw-payloads/billing/run-001/input.avro",
  "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "size_bytes": 1048576,
  "codec": "avro",
  "expires_at": "2026-05-22T00:00:00Z"
}
```

`ExternalPayloadReference.from_dict()` відхиляє невідомі схеми й неправильні
поля. `fetch_external_payload()` перевіряє `size_bytes` і `sha256` до
повернення байтів та піднімає `ExternalPayloadIntegrityError` за відсутнього,
обрізаного чи зміненого об'єкта. Replay worker має використовувати
`ExternalPayloadCache` лише після перевірки, щоб уникати повторного
завантаження blob без послаблення цілісності.

Після читання політики `external_payload_storage` namespace з control-plane
Server чи Cloud функція `external_storage_driver_from_policy()` повертає
відповідний драйвер. Клієнти провайдерів належать застосунку, тому SDK
не додає boto3, google-cloud-storage чи azure-storage-blob як залежності runtime:

```python
from durable_workflow.external_storage import external_storage_driver_from_policy

namespace = await client.describe_namespace("billing")
driver = external_storage_driver_from_policy(
    namespace.external_payload_storage,
    s3_client=application_owned_s3_client,
)
```

Фабрика піднімає `ValueError` за вимкненої політики, непідтримуваного
драйвера чи відсутнього клієнта провайдера. Вимкнена політика не повертає
no-op драйвера. Перевіряйте `policy.enabled` перед запитом драйвера.

### Namespace {#namespaces}

Namespace є межею орендарів workflow, schedule, атрибутів пошуку й
зовнішнього сховища payload. Client вибирає один namespace через аргумент
конструктора `namespace=`, але операторська поверхня нижче діє для
кожного namespace, дозволеного bearer token.

| Метод | Результат | Помилки |
| --- | --- | --- |
| `await client.list_namespaces()` | `NamespaceList` | Помилки автентифікації/Server. |
| `await client.describe_namespace(name)` | `NamespaceDescription` | `NamespaceNotFound`, помилки автентифікації/Server. |
| `await client.create_namespace(name, description=None, retention_days=30)` | `NamespaceDescription` | `InvalidArgument` за дубліката назви чи неправильного retention, помилки автентифікації/Server. |
| `await client.update_namespace(name, description=None, retention_days=None)` | `NamespaceDescription` | `NamespaceNotFound`, `InvalidArgument`, помилки автентифікації/Server. Надсилаються лише задані поля. |
| `await client.set_namespace_external_storage(name, driver=..., enabled=True, threshold_bytes=None, config=None)` | `NamespaceDescription` | `InvalidArgument` за відхилення політики перевіркою Server, помилки автентифікації/Server. |
| `await client.test_external_storage(driver=None, small_payload_bytes=None, large_payload_bytes=None)` | `StorageTestResult` | `InvalidArgument` за відсутніх потрібних полів політики, помилки автентифікації/Server. |

`set_namespace_external_storage` відповідає `dw namespace:set-storage-driver`.
Перший позиційний аргумент є `name` namespace, як у `describe_namespace`,
`create_namespace`, `update_namespace`. Застарілий псевдонім `namespace=`
дає `DeprecationWarning`. Новий код має використовувати позиційний `name`.
Словник `config` містить ключі драйвера, включно з необов'язковим `disk`
для `s3`, `gcs`, `azure`, щоб облікові дані залишалися на сервері.
`NamespaceDescription` відображає фактично збережену політику, включно
з типовим порогом сервера, якщо викликач не задав значення.

`test_external_storage` відповідає `dw storage:test`. Server перевіряє
запис і читання малого й великого payload через прив'язаний драйвер
та повертає `StorageTestResult` із записами `StoragePayloadTestResult`
і полями `wrote`, `read`, `verified`, `latency_ms`, `bytes`.

`NamespaceDescription` містить політику `external_payload_storage`,
описану в [зовнішньому сховищі payload](#external-payload-storage).
Поєднуйте його з `external_storage_driver_from_policy()` для створення
драйвера Python без повторного читання облікових даних кодом застосунку.

### Кластер і черги завдань {#cluster-and-task-queues}

| Метод | Результат | Примітки |
| --- | --- | --- |
| `await client.health()` | `dict[str, Any]` | Викликає endpoint здоров'я для перевірки життя. |
| `await client.get_cluster_info()` | `dict[str, Any]` | Читає версію Server, протокол, можливості й метадані сумісності. |
| `await client.list_task_queues()` | `TaskQueueList` | Показує видимі черги namespace. |
| `await client.describe_task_queue(name)` | `TaskQueueDescription` | Повертає місткість worker, lease, допуск query та бюджет dispatch. |
| `await client.list_task_queue_build_ids(task_queue)` | `TaskQueueBuildIdRollout` | Знімок груп build-id черги, включно з неверсіонованими worker групи `build_id=None`. |
| `await client.drain_task_queue_build_id(task_queue, build_id)` | `TaskQueueBuildIdRolloutState` | Позначає групу build-id як draining без нових завдань. `build_id=None` виконує drain неверсіонованих worker. Ідемпотентний. |
| `await client.resume_task_queue_build_id(task_queue, build_id)` | `TaskQueueBuildIdRolloutState` | Знімає drain для відновлення роботи групи. `build_id=None` відновлює неверсіонованих worker. Ідемпотентний. |

Результати черг надають вкладені dataclass `TaskQueueAdmission`,
`TaskQueueTaskAdmission`, `TaskQueueQueryAdmission`, `TaskQueueBuildIdCohort`,
`TaskQueueBuildIdRollout`, `TaskQueueBuildIdRolloutState` для перевірки
місткості Server і розгортання build-id без розбору тексту.
[Розгортання build-id worker](/docs/polyglot/worker-build-id-rollout)
описує наскрізний процес. Відповідні CLI команди:
`dw task-queue:build-ids`, `dw task-queue:drain`, `dw task-queue:resume`.

### Операції workflow {#workflow-operations}

| Метод | Результат | Помилки |
| --- | --- | --- |
| `await client.start_workflow(...)` | `WorkflowHandle` | `WorkflowAlreadyStarted`, `InvalidArgument`, `Unauthorized`, `ServerError` |
| `await client.describe_workflow(workflow_id)` | `WorkflowExecution` | `WorkflowNotFound`, помилки автентифікації/Server |
| `await client.list_workflows(...)` | `WorkflowList` | Помилки автентифікації/Server |
| `await client.list_workflow_runs(workflow_id)` | `WorkflowRunList` | `WorkflowNotFound`, помилки автентифікації/Server |
| `await client.describe_workflow_run(workflow_id, run_id)` | `WorkflowRun` | `WorkflowNotFound`, помилки автентифікації/Server |
| `await client.get_history(workflow_id, run_id)` | декодований payload історії | `WorkflowNotFound`, помилки автентифікації/Server |
| `await client.export_history(workflow_id, run_id)` | декодований архівний payload історії | `WorkflowNotFound`, помилки автентифікації/Server |
| `await client.signal_workflow(workflow_id, signal_name, args=None)` | `None` | `WorkflowNotFound`, `InvalidArgument`, помилки автентифікації/Server |
| `await client.query_workflow(workflow_id, query_name, args=None)` | декодований результат query | `QueryFailed`, `WorkflowNotFound`, помилки автентифікації/Server |
| `await client.update_workflow(workflow_id, update_name, args=None, ...)` | декодований результат update | `UpdateRejected`, `WorkflowNotFound`, помилки автентифікації/Server |
| `await client.cancel_workflow(workflow_id, reason=None)` | `None` | `WorkflowNotFound`, помилки автентифікації/Server |
| `await client.terminate_workflow(workflow_id, reason=None)` | `None` | `WorkflowNotFound`, помилки автентифікації/Server |
| `await client.repair_workflow(workflow_id)` | `WorkflowCommandResult` | `WorkflowNotFound`, помилки автентифікації/Server |
| `await client.archive_workflow(workflow_id, reason=None)` | `WorkflowCommandResult` | `WorkflowNotFound`, помилки автентифікації/Server |
| `await client.get_result(handle, poll_interval=0.5, timeout=30.0)` | декодований результат workflow | `WorkflowFailed`, `WorkflowCancelled`, `WorkflowTerminated`, `TimeoutError` |

`start_workflow` приймає `workflow_type`, `task_queue`, необов'язкові
`workflow_id`, `input`, `duplicate_policy`, `memo`, `search_attributes`,
`business_key`, `execution_timeout_seconds`, `run_timeout_seconds`.
Усі дані викликача отримують Avro обгортку до перетину HTTP межі.

Використовуйте `client.get_workflow_handle(workflow_id, run_id=None, workflow_type="")`,
якщо скрипт уже знає ID workflow та потребує методів handle.

| Метод `WorkflowHandle` | Еквівалентний метод клієнта |
| --- | --- |
| `await handle.result(...)` | `client.get_result(handle, ...)` |
| `await handle.describe()` | `client.describe_workflow(handle.workflow_id)` |
| `await handle.signal(name, args=None)` | `client.signal_workflow(...)` |
| `await handle.query(name, args=None)` | `client.query_workflow(...)` |
| `await handle.update(name, args=None, ...)` | `client.update_workflow(...)` |
| `await handle.cancel(reason=None)` | `client.cancel_workflow(...)` |
| `await handle.terminate(reason=None)` | `client.terminate_workflow(...)` |

Обидві операції негайно закривають виконання Server з різними термінальними
результатами. `cancel_workflow` не доставляє кооперативного запиту до коду
workflow й не запускає очищення saga/finally. Для обмеженого очищення
використовуйте `request_cancellation()` із кооперативними worker.
[Посібник кооперативного скасування](/docs/polyglot/cancellation) описує
політики операцій, нагляд і відновлення.

### Schedule {#schedules}

Schedule використовують `ScheduleSpec` для календаря/інтервалів і
`ScheduleAction` для запиту запуску workflow за спрацювання.

| Метод | Результат | Примітки |
| --- | --- | --- |
| `await client.create_schedule(...)` | `ScheduleHandle` | Створює schedule і повертає handle. |
| `await client.list_schedules()` | `ScheduleList` | Показує видимі schedule. |
| `await client.describe_schedule(schedule_id)` | `ScheduleDescription` | Читає стан, дію, наступне спрацювання й лічильники. |
| `await client.update_schedule(schedule_id, ...)` | `None` | Оновлює специфікацію, дію, overlap, jitter, memo, атрибути пошуку чи примітку. |
| `await client.pause_schedule(schedule_id, note=None)` | `None` | Призупиняє майбутні запуски. |
| `await client.resume_schedule(schedule_id, note=None)` | `None` | Відновлює призупинений schedule. |
| `await client.trigger_schedule(schedule_id, overlap_policy=None)` | `ScheduleTriggerResult` | Просить негайного запуску. |
| `await client.backfill_schedule(schedule_id, start_time=..., end_time=..., overlap_policy=None)` | `ScheduleBackfillResult` | Повторює пропущені вікна запуску. |
| `await client.get_schedule_history(schedule_id, *, limit=None, after_sequence=None)` | `ScheduleHistoryPage` | Повертає сторінку історії аудиту schedule за зростанням `sequence`. Server обмежує `limit` між 1 і 500 (типово 100). `after_sequence` є невід'ємним курсором попереднього `next_cursor`. Піднімає `ScheduleNotFound` за невідомого ID. Історія зберігається після `delete_schedule` для аудиту причини вилучення. |
| `client.iter_schedule_history(schedule_id, *, limit=None, after_sequence=None)` | `AsyncIterator[ScheduleHistoryEvent]` | Видає всі події аудиту, читаючи сторінки до `has_more=False`. Помилки як у `get_schedule_history`. |
| `await client.delete_schedule(schedule_id)` | `None` | Видаляє schedule. |

`client.get_schedule_handle(schedule_id)` повертає `ScheduleHandle` із
методами `describe`, `update`, `pause`, `resume`, `trigger`, `backfill`,
`history`, `iter_history`, `delete`, що викликають відповідні методи клієнта.
`ScheduleHandle.history(...)` повертає `ScheduleHistoryPage`, а
`ScheduleHandle.iter_history(...)` повертає `AsyncIterator[ScheduleHistoryEvent]`.

`ScheduleHistoryPage` містить упорядковані `events`, прапорець `has_more`,
цілий `next_cursor` (чи `None` на останній сторінці), `schedule_id` та
власника `namespace`. `ScheduleHistoryEvent` містить `sequence`,
`event_type` (`ScheduleCreated`, `SchedulePaused`, `ScheduleResumed`,
`ScheduleUpdated`, `ScheduleTriggered`, `ScheduleTriggerSkipped`, `ScheduleDeleted`),
`recorded_at`, необов'язкові `workflow_instance_id`, `workflow_run_id`
запущених workflow та сирий словник `payload` переходу control-plane.

### Події bridge й методи площини worker {#bridge-events-and-worker-plane-methods}

`await client.send_webhook_bridge_event(adapter, action=..., target=..., input=..., idempotency_key=..., correlation=None)`
повертає `BridgeAdapterOutcome` за тим самим машиночитаним контрактом,
що й `dw bridge:webhook`. Це точка входу Python для обмеженого
приймання даних із систем формату webhook.

Низькорівневі методи worker публічні для власних worker і тестів протоколу,
але звичайні застосунки мають використовувати `Worker`:

| Група методів | Методи |
| --- | --- |
| Реєстрація worker | `register_worker` |
| Завдання workflow | `poll_workflow_task`, `complete_workflow_task`, `fail_workflow_task`, `workflow_task_history` |
| Завдання query | `poll_query_task`, `complete_query_task`, `fail_query_task` |
| Завдання activity | `poll_activity_task`, `complete_activity_task`, `fail_activity_task`, `heartbeat_activity_task` |

Ці методи надсилають `X-Durable-Workflow-Protocol-Version` і використовують
`worker_token`, якщо він заданий. Надавайте перевагу `Worker`, якщо
не пишете адаптер SDK чи тест відповідності протоколу.

`workflow_task_history(...)` читає історію replay сторінками для вже
орендованого завдання. Викликайте лише після повернення
`next_history_page_token` методом `poll_workflow_task(...)`:

```python
page = await client.workflow_task_history(
    task_id="workflow-task-01",
    next_history_page_token="history-page-2",
    lease_owner="python-worker-1",
    workflow_task_attempt=2,
)
```

Тіло запиту містить `next_history_page_token`, `lease_owner`,
`workflow_task_attempt`. Декодована відповідь містить поля протоколу worker
`history_events`, `total_history_events`, `next_history_page_token`,
а не поля історії control-plane `events` чи `next_page_token`.

### Worker {#workers}

Реєстр worker показує нещодавно видимих Server worker та їхні можливості.
Використовуйте його для розгортання build-id, вилучення застарілих worker
і узгодження місткості парку скриптами оператора.

| Метод | Результат | Помилки |
| --- | --- | --- |
| `await client.list_workers(task_queue=None, status=None)` | `WorkerList` | Помилки автентифікації/Server. |
| `await client.describe_worker(worker_id)` | `WorkerDescription` | `WorkerNotFound`, помилки автентифікації/Server. |
| `await client.deregister_worker(worker_id)` | `dict[str, Any]` | `WorkerNotFound`, помилки автентифікації/Server. |

`list_workers` фільтрує на сервері: `task_queue` обмежує чергу, `status`
вибирає один підтримуваний статус. Типово повертає всіх зареєстрованих
worker namespace.

`WorkerDescription` містить runtime, версію SDK, build ID, оголошені типи
workflow/activity, останній heartbeat і поточний допуск завдань для
вибору групи drain чи worker для вилучення.

`deregister_worker` ідемпотентний на Server. Він вилучає worker без heartbeat
для чистого обліку місткості й `list_workers`, але не перериває активні lease.

### Атрибути пошуку {#search-attributes}

Атрибути пошуку є типізованими метаданими namespace на виконаннях workflow
для фільтрації й індексування. Python клієнт відображає ту саму
поверхню control-plane, що й CLI.

| Метод | Результат | Помилки |
| --- | --- | --- |
| `await client.list_search_attributes()` | `SearchAttributeList` | Помилки автентифікації/Server. |
| `await client.create_search_attribute(name, attribute_type)` | `dict[str, Any]` | `InvalidArgument` за дублікатів чи непідтримуваного типу, помилки автентифікації/Server. |
| `await client.delete_search_attribute(name)` | `dict[str, Any]` | `SearchAttributeNotFound`, `InvalidArgument` за системного атрибута, помилки автентифікації/Server. |

`SearchAttributeList` розділяє визначення `system` і `custom` для перевірки
наявності ключів рушія (ID workflow, статус, тип, початок тощо) до відмови
створення конфліктного власного ключа. `attribute_type` підтримує
`keyword`, `text`, `int`, `double`, `bool`, `datetime`, `keyword_list`.

### Системне обслуговування {#system-maintenance}

Операторські скрипти й чергова автоматизація керують через Client тими самими
циклами обслуговування, що й `dw system:*`. Кожен метод вимагає admin scope
bearer token, інакше Server повертає `Unauthorized`.

| Метод | Результат | Відповідник CLI |
| --- | --- | --- |
| `await client.repair_status()` | `dict[str, Any]` | `dw system:repair-status` |
| `await client.repair_pass(run_ids=None, instance_id=None)` | `dict[str, Any]` | `dw system:repair-pass` |
| `await client.retention_status()` | `dict[str, Any]` | `dw system:retention-status` |
| `await client.retention_pass(run_ids=None, limit=None)` | `dict[str, Any]` | `dw system:retention-pass` |
| `await client.activity_timeout_status()` | `dict[str, Any]` | `dw system:activity-timeout-status` |
| `await client.activity_timeout_pass(execution_ids=None, limit=None)` | `dict[str, Any]` | `dw system:activity-timeout-pass` |

`repair_pass` виконує один прохід виправлення завдань. Без фільтрів охоплює
namespace. `run_ids` обмежує список виконань, `instance_id` обмежує
один активний екземпляр.

`retention_pass` застосовує вікно retention namespace до термінальних виконань.
Без фільтрів видаляє прострочені виконання до межі сканування. `run_ids`
обмежує прохід, `limit` кількість виконань. `retention_status()` показує
вікно retention, межу часу й придатні до видалення ID до межі сканування.

`activity_timeout_pass` застосовує start-to-close і schedule-to-close
до activity з минулим дедлайном. Без фільтрів обробляє прострочені виконання
до межі сканування. `execution_ids` вибирає список, `limit` обмежує прохід.

Ці методи не піднімають винятків за порожньої роботи. Повторні виклики
у тихий період повертають ті самі `passes` / `repaired` / `pruned`
з нульовими змінами, тому придатні для скриптів cron.

## Визначення workflow {#defining-workflows}

Workflow є класами Python з `@workflow.defn`. Метод `run` є генератором,
який передає команди Server через yield.

```python
from durable_workflow import workflow

@workflow.defn(name="order-processing")
class OrderWorkflow:
    def run(self, ctx, *args):
        order = args[0] if args else {}

        # Schedule an activity and wait for the result
        validated = yield ctx.schedule_activity(
            "validate_order", [order]
        )

        # Start a timer (durable sleep)
        yield ctx.start_timer(seconds=60)

        # Schedule another activity
        receipt = yield ctx.schedule_activity(
            "process_payment", [validated]
        )

        return receipt
```

`name` у `@workflow.defn(name="...")` є ключем типу для всіх мов.
Це має бути звичайний рядок, а не шлях модуля Python чи посилання на клас.

### Signal, query й update {#signals-queries-and-updates}

Signal записуються в надійну історію й передаються обробникам Python під час replay:

```python
@workflow.defn(name="approval")
class ApprovalWorkflow:
    def __init__(self) -> None:
        self.approved = False
        self.approved_by = None

    @workflow.signal("approve")
    def approve(self, by: str) -> None:
        self.approved = True
        self.approved_by = by

    def run(self, ctx, *args):
        yield ctx.schedule_activity("wait_for_approval", [])
        return {"approved": self.approved, "approved_by": self.approved_by}
```

Декоратори query й update дозволяють класам публікувати сталі назви обробників.
Worker Python виконують маршрутизовані Server query через replay зафіксованої
історії й виклик зареєстрованого обробника зі станом replay. Вони також
застосовують прийняті update, доставлені через завдання workflow:

```python
@workflow.defn(name="approval")
class ApprovalWorkflow:
    def __init__(self) -> None:
        self.approved = False

    @workflow.query("status")
    def status(self) -> dict:
        return {"approved": self.approved}

    @workflow.update("set_approval")
    def set_approval(self, approved: bool) -> dict:
        self.approved = approved
        return {"approved": self.approved}

    @set_approval.validator
    def validate_set_approval(self, approved: bool) -> None:
        if not isinstance(approved, bool):
            raise ValueError("approved must be boolean")
```

Worker Python завершують маршрутизовані query поверненням результату завдання
Server. Для оголошеного валідатора update worker отримує окреме завдання
валідації, відновлює авторитетний стан і викликає лише валідатор.
Server не записує прийнятий update й не направляє його обробнику до успішної
валідації. Worker із валідатором відмовляється реєструватися без оголошеного
контракту синхронної перевірки до прийняття. Відмова, відсутні чи несумісні
worker, втрата worker, тайм-аут і відгороджені дублікати чи старі завершення
залишаються явними типізованими результатами. PHP і Rust зараз не надають
API авторства валідаторів update й оголошують цю відсутність у контрактах
workflow, замість заявляти паритет валідаторів.

### Контекст workflow {#workflow-context}

`WorkflowContext`, переданий до `run`, надає детерміновані операції:

| Метод | Опис |
|--------|-------------|
| `ctx.schedule_activity(type, args)` | Планування activity з необов'язковими retry й тайм-аутами виклику |
| `ctx.start_timer(seconds)` | Надійний сон |
| `ctx.start_child_workflow(type, args)` | Запуск дочірнього workflow з необов'язковими retry й тайм-аутами |
| `yield [command, [...]]` | Очікування вкладеної детермінованої групи activity, дочірніх workflow, timer чи змішаної групи в порядку вводу |
| `yield ctx.select({key: command, ...})` | Продовження після першого надійно зафіксованого члена зі збереженням handle інших |
| `ctx.saga()` | Реєстрація й виконання надійних компенсацій activity у зворотному порядку |
| `ctx.side_effect(fn)` | Фіксація недетермінованого значення |
| `ctx.get_version(change_id, min, max)` | Безпечне версіонування коду workflow |
| `ctx.upsert_search_attributes(attrs)` | Оновлення атрибутів пошуку |
| `ctx.continue_as_new(*args)` | Перезапуск workflow з новим вводом |
| `ctx.now()` | Детермінований годинник з історії |
| `ctx.random()` | Генератор випадкових чисел зі сталим seed |
| `ctx.uuid4()` | Детермінований UUID |
| `ctx.logger` | Logger, що мовчить під час replay |

### Повторні спроби й тайм-аути activity {#activity-retries-and-timeouts}

Використовуйте `ActivityRetryPolicy` і параметри тайм-ауту
`ctx.schedule_activity(...)`, якщо виклик потребує іншого бюджету retry
чи дедлайну замість типової однієї спроби:

```python
from durable_workflow import ActivityRetryPolicy

receipt = yield ctx.schedule_activity(
    "process_payment",
    [validated],
    retry_policy=ActivityRetryPolicy(
        max_attempts=4,
        initial_interval_seconds=1,
        backoff_coefficient=2,
        maximum_interval_seconds=30,
        non_retryable_error_types=["ValidationError"],
    ),
    start_to_close_timeout=120,
    schedule_to_close_timeout=300,
    heartbeat_timeout=15,
)
```

`start_to_close_timeout` обмежує одну спробу після початку worker.
`schedule_to_close_timeout` обмежує все виконання activity між спробами.
`heartbeat_timeout` вимагає виклику `activity.context().heartbeat(...)`
до завершення інтервалу для тривалих activity. Політика retry фіксується
на надійному виконанні під час планування, тому наступні розгортання
не змінюють активних спроб.

### Правила детермінізму {#determinism-rules}

Код workflow відтворюється з історії та не має напряму виконувати
недетерміновані операції:

- Без I/O: HTTP викликів, читання файлів, запитів бази
- Без `datetime.now()` чи `time.time()`: використовуйте `ctx.now()`
- Без `random.random()`: використовуйте `ctx.random()`
- Без `uuid.uuid4()`: використовуйте `ctx.uuid4()`

Уся недетермінованість має проходити через контекст або фіксуватися `ctx.side_effect()`.

### Fan-out {#fan-out}

Передайте через yield список команд для паралельного виконання:

```python
@workflow.defn(name="fan-out-example")
class FanOutWorkflow:
    def run(self, ctx, *args):
        items = args[0]

        # Nested lists may mix activities, children, and timers.
        results = yield [
            ctx.schedule_activity("process_item", [items[0]]),
            [
                ctx.start_child_workflow("process-batch", [items[1:]]),
                ctx.start_timer(1),
            ],
        ]

        return results  # same nested shape and input order
```

Worker видає одну звичайну команду на надійний листок і додає спільні сталі
поля `parallel_group_*` та повний шлях від зовнішньої до внутрішньої групи.
Історія може завершувати членів у будь-якому порядку, але replay прив'язує
результати й помилки за надійною позицією вводу. Точні дублікати термінального
доставлення ігноруються. Очікувана історія після restart worker і повністю
завершена історія відновлюють ту саму групу без повторного планування завершеної роботи.

### Вибір першого завершення {#first-completion-selection}

Використовуйте `ctx.select()`, коли незалежна робота має почати разом,
але workflow може просуватися після завершення одного члена:

```python
selected = yield ctx.select({
    "resolver": ctx.schedule_activity("resolve-request", [request_id]),
    "input": ctx.wait_condition(lambda: self.resolution is not None, key="resolution-ready"),
    "deadline": ctx.start_timer(2),
})

if selected.key == "deadline":
    yield selected.handles["resolver"].cancel()
    return {"status": "timed_out"}

yield selected.handles["deadline"].cancel()
return {"status": "resolved", "value": selected.result()}
```

`SelectionResult` містить сталий ключ переможця, індекс вводу, вид операції
та надійну ідентичність, типізований результат і всі `DurableOperationHandle`.
`yield handle.await_result()` дозволяє пізніше дочекатися іншого члена.
`yield handle.cancel()` записує явний запит без результату. Лише зафіксована
історія `SelectionOperationCancelled` доводить перемогу скасування.
Replay просувається після запиту без позначки, а `await_result()` повертає
завершення, що зафіксувалося першим. Replay використовує збереженого переможця,
навіть якщо пізніша історія спочатку містить інше завершення.
Дублікати й зовнішнє доставлення поза порядком не заміняють переможця.

### Компенсація saga {#saga-compensation}

```python
def forward(saga):
    flight = yield ctx.schedule_activity("trip.reserve-flight", [])
    saga.add_compensation("trip.cancel-flight", [flight])

    hotel = yield ctx.schedule_activity("trip.reserve-hotel", [])
    saga.add_compensation("trip.cancel-hotel", [hotel])

    yield ctx.schedule_activity("trip.charge", [])
    return {"status": "booked"}

return (yield from ctx.saga().run(forward))
```

Після помилки saga виконує звичайні команди activity послідовно у зворотному
порядку реєстрації. Термінальний `cancel_workflow` не відновлює workflow
для компенсацій. Помічник зупиняється на першій помилці компенсації.
`SagaCompensationFailed` зберігає початкову помилку, помилку компенсації,
її тип activity і детермінований порядок як структуровану діагностику.

### Дочірні workflow {#child-workflows}

```python
from durable_workflow import ChildWorkflowRetryPolicy

result = yield ctx.start_child_workflow(
    "child-workflow-type",
    [{"input": "data"}],
    task_queue="child-queue",
    parent_close_policy="terminate",
    retry_policy=ChildWorkflowRetryPolicy(
        max_attempts=3,
        initial_interval_seconds=2,
        backoff_coefficient=2,
        non_retryable_error_types=["ValidationError"],
    ),
    execution_timeout_seconds=600,
    run_timeout_seconds=120,
)
```

`execution_timeout_seconds` обмежує логічне дочірнє виконання між retry й
continue-as-new. `run_timeout_seconds` обмежує кожну спробу run.
Retry backoff застосовується після помилки дочірнього виконання.
Неправильні команди запуску є помилками протоколу й не повторюються як дочірні спроби.

### Continue-as-new {#continue-as-new}

Для тривалих workflow використовуйте continue-as-new для скидання історії:

```python
from durable_workflow import ContinueAsNew

@workflow.defn(name="polling-workflow")
class PollingWorkflow:
    def run(self, ctx, *args):
        iteration = args[0] if args else 0

        result = yield ctx.schedule_activity("poll_source", [])

        if result.get("done"):
            return result

        # Continue with incremented iteration
        return ContinueAsNew(arguments=[iteration + 1])
```

## Визначення activity {#defining-activities}

Activity є асинхронними функціями Python з `@activity.defn`.
На відміну від workflow, вони можуть вільно виконувати I/O.

```python
from durable_workflow import activity

@activity.defn(name="send_email")
async def send_email(to: str, subject: str, body: str) -> dict:
    # Activities can do I/O: HTTP calls, database queries, etc.
    response = await some_email_client.send(to=to, subject=subject, body=body)
    return {"message_id": response.id, "sent": True}
```

`name` є ключем типу для всіх мов. PHP workflow може планувати activity
`"send_email"`, яку отримає worker Python, і навпаки.

### Контекст activity {#activity-context}

Усередині activity використовуйте `activity.context()` для метаданих
виконання й heartbeat:

```python
@activity.defn(name="long_running_task")
async def long_running_task(items: list) -> dict:
    ctx = activity.context()

    print(f"Attempt #{ctx.info.attempt_number}")
    print(f"Task queue: {ctx.info.task_queue}")

    for i, item in enumerate(items):
        # Check for cancellation
        if ctx.is_cancelled:
            return {"partial": True, "processed": i}

        await process(item)

        # Heartbeat to keep the task alive
        await ctx.heartbeat({"progress": i + 1, "total": len(items)})

    return {"processed": len(items)}
```

### Неповторювані помилки {#non-retryable-errors}

Підніміть `NonRetryableError`, щоб завершити activity помилкою без retry:

```python
from durable_workflow import NonRetryableError

@activity.defn(name="validate")
async def validate(data: dict) -> dict:
    if "required_field" not in data:
        raise NonRetryableError("Missing required_field")
    return data
```

## Worker {#worker}

`Worker` реєструється на Server, опитує завдання й направляє їх до ваших
реалізацій workflow та activity.

```python
from durable_workflow import Client, Worker

async with Client("http://localhost:8080", token="secret") as client:
    worker = Worker(
        client,
        task_queue="default",
        workflows=[GreeterWorkflow, OrderWorkflow],
        activities=[greet, send_email, validate],
        max_concurrent_workflow_tasks=10,
        max_concurrent_activity_tasks=10,
    )

    await worker.run()  # blocks until worker.stop() is called
```

Для коротких тестів і прикладів одного workflow
`await worker.run_until(workflow_id="...", timeout=60.0)` реєструє того самого
worker та веде workflow до термінального стану послідовним опитуванням.
Для постійно розгорнутих worker використовуйте `run()`.

| Параметр | Типове значення | Опис |
|-----------|---------|-------------|
| `task_queue` | обов'язковий | Черга завдань для poll |
| `workflows` | `()` | Класи workflow для реєстрації |
| `activities` | `()` | Функції activity для реєстрації |
| `worker_id` | автоматичний | Унікальний ID worker |
| `poll_timeout` | `35.0` | Тайм-аут long-poll у секундах |
| `max_concurrent_workflow_tasks` | `10` | Максимум паралельних завдань workflow |
| `max_concurrent_activity_tasks` | `10` | Максимум паралельних завдань activity |
| `shutdown_timeout` | `30.0` | Секунди drain активних завдань під час stop |
| `metrics` | recorder клієнта | Необов'язковий recorder лічильників/гістограм poll і завдань |
| `interceptors` | `()` | Упорядковані обгортки завдань для інструментування, трасування й політик |

Два значення `max_concurrent_*` оголошуються Server під час реєстрації й
відображаються в діагностиці допуску. Це локальна місткість worker.
Використовуйте серверні [ліміти допуску черг](/docs/polyglot/task-queue-admission),
якщо namespace, черга чи downstream група бюджету потребує жорсткого
спільного обмеження для кількох worker.

### Довідник API worker {#worker-api-reference}

| Метод | Результат | Призначення |
| --- | --- | --- |
| `await worker.run()` | `None` | Тривалий процес під systemd, Docker, Kubernetes чи оболонкою розробки. Реєструється раз і опитує workflow, activity та query до зупинки чи скасування. |
| `await worker.run_until(workflow_id=..., timeout=60.0, poll_interval=0.5)` | `WorkflowExecution` | Короткі тести й приклади одного workflow, який той самий процес має вести до термінального стану. |
| `await worker.stop()` | `None` | Кооперативне завершення процесу. Зупиняє нові poll і чекає активні завдання до `shutdown_timeout`. |

`run()` перевіряє сумісність Server перед poll. Worker вимагає відповідності
`control_plane.version`, `control_plane.request_contract`,
`worker_protocol.version`, `auth_composition_contract` підтримуваним версіям SDK.
Відсутній чи несумісний маніфест піднімає `RuntimeError` під час реєстрації,
щоб менеджер процесів одразу бачив неспроможність безпечно завершувати завдання.

`run_until()` використовує ту саму реєстрацію й dispatch, але опитує
послідовно та повертає остаточний `WorkflowExecution` названого workflow.
Піднімає `TimeoutError`, якщо workflow не термінальний після тайм-ауту.

Під час виконання завдань:

- невідомі типи workflow чи activity повертаються Server як помилки завдань,
  а не ховаються лише в локальних журналах
- `NonRetryableError` позначає помилку activity як неповторювану
- `ActivityCancelled` поширюється як результат скасування
- необроблені винятки activity є повторюваними помилками, якщо політика
  retry чи дедлайн Server не визначають іншого
- винятки query повертаються як `QueryFailed`

### Перехоплювачі worker {#worker-interceptors}

Передайте `interceptors=[...]` для трасування, метрик, журналу аудиту чи
локальних перевірок політики навколо завдань. Вони працюють у переданому
порядку: перший є зовнішньою обгорткою й має викликати `next` для продовження.

```python
from durable_workflow import (
    ActivityInterceptorContext,
    PassthroughWorkerInterceptor,
)

class AuditInterceptor(PassthroughWorkerInterceptor):
    async def execute_activity(self, context: ActivityInterceptorContext, next):
        print("activity started", context.activity_type, context.worker_id)
        return await next(context)

worker = Worker(
    client,
    task_queue="orders",
    workflows=[OrderWorkflow],
    activities=[charge_card],
    interceptors=[AuditInterceptor()],
)
```

| Hook | Поля контексту | Результат next |
| --- | --- | --- |
| `execute_workflow_task(context, next)` | `worker_id`, `task_queue`, `task` | Команди workflow або `None` |
| `execute_activity(context, next)` | `worker_id`, `task_queue`, `task`, `activity_type`, `args` | Декодований результат activity |
| `execute_query_task(context, next)` | `worker_id`, `task_queue`, `task` | Закодований рядок результату query |

Використовуйте `PassthroughWorkerInterceptor` як базовий клас для одного hook.
Реалізуйте `WorkerInterceptor` напряму, якщо перевірка типів має вимагати
наявності всіх hook.

## Журналювання {#logging}

SDK використовує стандартний модуль `logging` Python зі структурованими назвами:

| Назва logger | Записи |
|-------------|--------------|
| `durable_workflow.worker` | Реєстрація worker, poll, завершення завдань, помилки |
| `durable_workflow.workflow.replay` | Події replay workflow, без записів під час replay |

### Налаштування журналювання {#configuring-logging}

Задайте рівень журналювання в точці входу застосунку:

```python
import logging

# Show INFO-level worker events (registration, task completion)
logging.basicConfig(level=logging.INFO)

# Or configure specific loggers
logging.getLogger("durable_workflow.worker").setLevel(logging.DEBUG)
logging.getLogger("durable_workflow.workflow.replay").setLevel(logging.INFO)
```

### Рівні журналювання {#log-levels}

- **INFO:** реєстрація worker, початок/завершення завдань і завершення workflow
- **DEBUG:** детальні обрізані payload завдань, цикли poll
- **WARNING:** повторювані помилки, невдалі API виклики, невідомі типи workflow
- **ERROR:** неповторювані помилки, збої replay

### Журналювання з урахуванням replay {#replay-aware-logging}

У workflow використовуйте `ctx.logger` для журналювання з урахуванням replay:

```python
@workflow.defn(name="order_processor")
class OrderProcessor:
    def run(self, ctx, order_id: str):
        ctx.logger.info("Processing order %s", order_id)  # Only logs during execution, not replay
        result = yield ctx.schedule_activity("process_order", [order_id])
        ctx.logger.info("Order processed: %s", result)
        return result
```

Журнали **мовчать під час replay**, щоб уникати дублікатів під час відновлення
чи продовження workflow.

### Структуроване журналювання {#structured-logging}

Для структурованих журналів JSON задайте JSON formatter кореневого logger застосунку:

```python
import logging
import json

class JSONFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps({
            "timestamp": self.formatTime(record),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        })

handler = logging.StreamHandler()
handler.setFormatter(JSONFormatter())
logging.getLogger("durable_workflow").addHandler(handler)
logging.getLogger("durable_workflow").setLevel(logging.INFO)
```

## Метрики {#metrics}

`Client(metrics=...)` і `Worker(metrics=...)` приймають recorder із двома методами:

```python
def increment(name: str, value: float = 1.0, tags: dict[str, str] | None = None) -> None: ...
def record(name: str, value: float, tags: dict[str, str] | None = None) -> None: ...
```

Типовий recorder не виконує дій, тому збір метрик не потребує налаштування.
Для тестів чи власних циклів експорту використовуйте `InMemoryMetrics`:

```python
from durable_workflow import Client, InMemoryMetrics, Worker

metrics = InMemoryMetrics()

async with Client("http://localhost:8080", token="secret", metrics=metrics) as client:
    worker = Worker(client, task_queue="default", workflows=[GreeterWorkflow], activities=[greet])
```

Для Prometheus встановіть необов'язкове доповнення й передайте `PrometheusMetrics`:

```bash
pip install 'durable-workflow[prometheus]'
```

```python
from durable_workflow import Client, PrometheusMetrics

metrics = PrometheusMetrics()
client = Client("http://localhost:8080", token="secret", metrics=metrics)
```

SDK записує:

| Метрика | Тип | Мітки |
|--------|------|------|
| `durable_workflow_client_requests` | Лічильник | `method`, `route`, `plane`, `status_code`, `outcome` |
| `durable_workflow_client_request_duration_seconds` | Гістограма | `method`, `route`, `plane`, `status_code`, `outcome` |
| `durable_workflow_worker_polls` | Лічильник | `task_kind`, `task_queue`, `outcome` |
| `durable_workflow_worker_poll_duration_seconds` | Гістограма | `task_kind`, `task_queue`, `outcome` |
| `durable_workflow_worker_tasks` | Лічильник | `task_kind`, `task_queue`, `outcome` |
| `durable_workflow_worker_task_duration_seconds` | Гістограма | `task_kind`, `task_queue`, `outcome` |

## Schedule {#schedules-1}

Створюйте й керуйте запланованими workflow через клієнт:

```python
from durable_workflow import ScheduleSpec, ScheduleAction

# Create a schedule
handle = await client.create_schedule(
    schedule_id="hourly-report",
    spec=ScheduleSpec(cron_expressions=["0 * * * *"]),
    action=ScheduleAction(
        workflow_type="generate-report",
        task_queue="default",
        input=[{"format": "pdf"}],
    ),
    overlap_policy="skip",
    jitter_seconds=30,
)

# List all schedules
schedule_list = await client.list_schedules()

# Describe a schedule
desc = await handle.describe()
print(f"Next fire: {desc.next_fire_at}")
print(f"Total fires: {desc.fires_count}")

# Pause and resume
await handle.pause(note="maintenance window")
await handle.resume(note="maintenance complete")

# Trigger immediately
result = await handle.trigger()

# Backfill missed runs
backfill = await handle.backfill(
    start_time="2024-01-01T00:00:00Z",
    end_time="2024-01-02T00:00:00Z",
)

# Update the schedule
await handle.update(
    spec=ScheduleSpec(cron_expressions=["*/30 * * * *"]),
    note="Changed to every 30 minutes",
)

# Read the audit history stream (paused/resumed/triggered/updated events)
page = await handle.history(limit=100)
for event in page.events:
    print(event.sequence, event.event_type, event.recorded_at)
while page.has_more and page.next_cursor is not None:
    page = await handle.history(limit=100, after_sequence=page.next_cursor)
    for event in page.events:
        print(event.sequence, event.event_type, event.recorded_at)

# Or iterate every event without managing cursors
async for event in handle.iter_history():
    print(event.sequence, event.event_type)

# Delete the schedule (history survives the delete for audit)
await handle.delete()
```

## Синхронний клієнт {#synchronous-client}

Для скриптів, notebook і неасинхронних контекстів використовуйте синхронну обгортку:

<!-- docs-example id="python.sync-client" -->
```python
import uuid

from durable_workflow.sync import Client as SyncClient

client = SyncClient("http://localhost:8080", token="secret")
workflow_id = f"sync-greeting-{uuid.uuid4().hex}"

handle = client.start_workflow(
    workflow_type="greeter",
    task_queue="default",
    workflow_id=workflow_id,
    input=["world"],
)

execution = client.describe_workflow(workflow_id)
print(execution.status)
```

Синхронний клієнт відображає async API, але обгортає кожен виклик в `asyncio.run`.

## Обробка помилок {#error-handling}

SDK зіставляє коди помилок Server із типізованими винятками Python:

| Виняток | Умова |
|-----------|------|
| `WorkflowNotFound` | ID workflow не існує |
| `WorkflowAlreadyStarted` | Дублікат ID workflow з конфліктною політикою |
| `WorkflowFailed` | Виконання workflow завершилося помилкою |
| `WorkflowCancelled` | Workflow скасований, успадковує `BaseException`, а не `Exception` |
| `WorkflowTerminated` | Workflow примусово завершений |
| `ActivityCancelled` | Activity скасована під час виконання, успадковує `BaseException`, а не `Exception` |
| `ChildWorkflowFailed` | Дочірній workflow завершився помилкою |
| `QueryFailed` | Обробник query повернув помилку |
| `UpdateRejected` | Workflow відхилив update |
| `ScheduleNotFound` | ID schedule не існує |
| `ScheduleAlreadyExists` | Дублікат ID schedule |
| `NamespaceNotFound` | Namespace не існує |
| `InvalidArgument` | Неправильні параметри запиту |
| `Unauthorized` | Автентифікація не пройшла |
| `ServerError` | Server повернув неочікувану помилку |

<!-- docs-example id="python.duplicate-start-recovery" -->
```python
from durable_workflow import WorkflowNotFound, WorkflowAlreadyStarted

try:
    handle = await client.start_workflow(
        workflow_type="greeter",
        task_queue="default",
        workflow_id="existing-id",
        input=["world"],
    )
except WorkflowAlreadyStarted:
    handle = client.get_workflow_handle("existing-id")
except WorkflowNotFound:
    print("Workflow type not registered on any worker")
```

### Скасування навмисно не перехоплюється except Exception {#cancellation-is-intentionally-uncatchable-by-except-exception}

`WorkflowCancelled` і `ActivityCancelled` успадковують `BaseException`, а не
`Exception`. Загальний `except Exception:` усередині activity чи коду, що
чекає `client.get_result()`, їх **не перехопить**. Це навмисно: скасування
є результатом control-plane. Мовчазне поглинання в загальному catch могло
б дозволити activity повідомити успіх після запиту workflow зупинитися.

Якщо activity потребує локального очищення за скасування завдання,
перехопіть конкретний клас і підніміть виняток знову.
Це не відновлює закритий workflow для компенсації:

```python
from durable_workflow import ActivityCancelled, activity

@activity.defn(name="long_task")
async def long_task(items: list) -> dict:
    ctx = activity.context()
    try:
        for i, item in enumerate(items):
            await process(item)
            await ctx.heartbeat({"progress": i + 1})
        return {"done": True}
    except ActivityCancelled:
        await cleanup_partial_state()
        raise
```

Це відповідає прецедентам стандартної бібліотеки `asyncio.CancelledError` і `KeyboardInterrupt`.

## Тестування {#testing}

Автор має мати змогу тестувати workflow без Server чи worker.
Модуль `durable_workflow.testing` надає два способи:

- `WorkflowEnvironment` виконує workflow в одному процесі Python із
  зареєстрованими користувачем mock activity.
- `replay_history` і `replay_history_file` відтворюють збережену production
  історію проти поточного коду й піднімають виняток за недетермінізму.

Обидва способи використовують той самий механізм `durable_workflow.workflow.replay`,
що й worker, тому тест перевіряє таку саму поведінку replay, як у runtime.

### WorkflowEnvironment {#workflowenvironment}

`WorkflowEnvironment` виконує команди через зареєстровані mock та автоматично
створює timer, side effect і upsert атрибутів пошуку. Тестам не потрібні
справжній годинник, Redis чи Server.

```python
from durable_workflow import workflow
from durable_workflow.testing import WorkflowEnvironment

@workflow.defn(name="greeter")
class Greeter:
    def run(self, ctx, name: str):
        greeting = yield ctx.schedule_activity("greet", [name])
        return greeting


def test_greeter_returns_activity_result() -> None:
    env = WorkflowEnvironment()
    env.register_activity_result("greet", "hello, world")

    result = env.execute_workflow(Greeter, "world")

    assert result == "hello, world"
```

| Метод | Призначення |
| --- | --- |
| `register_activity_result(name, result)` | Повертає `result` для кожної activity `name`, якщо аргументи неважливі тесту. |
| `register_activity(name, fn)` | Викликає `fn(*arguments)` для кожної activity `name`, якщо mock залежить від аргументів чи має фіксувати виклики. |
| `register_child_workflow_result(workflow_type, result)` | Повертає `result` для дочірнього workflow типу `workflow_type`. |
| `signal(name, args=None, run=None)` | Ставить signal перед наступним replay. Harness додає `SignalReceived` і викликає `@workflow.signal`. `run=N` вибирає ланку `N` continue-as-new. |
| `register_workflow(workflow_cls)` | Реєструє додатковий клас за назвою. Потрібно для `continue_as_new(workflow_type=...)` з іншим типом. |
| `execute_workflow(workflow_cls, *args, run_id="test-run")` | Веде workflow до термінального стану й повертає результат. Продовжує ланцюг `continue_as_new` до останнього виконання. Піднімає `WorkflowFailed` за failed. |
| `runs` / `run_count` | Після `execute_workflow` надає `WorkflowRunRecord` кожної ланки (ввід, тип, історія, термінальна команда) для перевірки всього ланцюга. |

Harness явно повідомляє відсутні fixture:

- activity без зареєстрованого mock піднімає `KeyError`
- дочірній workflow без mock піднімає `KeyError`
- workflow без термінального стану за ліміту ітерацій (типово `1000`)
  піднімає `RuntimeError`

Передайте `iteration_limit=...` у `WorkflowEnvironment(...)` для workflow,
які правомірно потребують більше ітерацій.

#### Mock activity як функції {#callable-activity-mocks}

Використовуйте `register_activity`, якщо mock має відповідати за
аргументами чи фіксувати виклики:

```python
def test_callable_mock_captures_arguments() -> None:
    captured: list[str] = []

    def record_greet(name: str) -> str:
        captured.append(name)
        return f"greeted:{name}"

    env = WorkflowEnvironment()
    env.register_activity("greet", record_greet)

    assert env.execute_workflow(Greeter, "alice") == "greeted:alice"
    assert captured == ["alice"]
```

#### Signal {#signals}

Signal, поставлені через `env.signal(...)`, доставляються перед наступною
ітерацією replay. Payload отримує ту саму обгортку `{codec, blob}`,
що й у runtime, і передається зареєстрованому обробнику `@workflow.signal`:

```python
@workflow.defn(name="approval")
class Approval:
    def __init__(self) -> None:
        self.approved_by: str | None = None

    @workflow.signal("approve")
    def on_approve(self, by: str) -> None:
        self.approved_by = by

    def run(self, ctx):
        yield ctx.schedule_activity("wait", [])
        return {"approved_by": self.approved_by}


def test_signal_is_delivered_before_run_returns() -> None:
    env = WorkflowEnvironment()
    env.register_activity_result("wait", None)
    env.signal("approve", ["alice"])

    result = env.execute_workflow(Approval)

    assert result == {"approved_by": "alice"}
```

#### Timer, побічні ефекти й атрибути пошуку {#timers-side-effects-and-search-attributes}

Harness автоматично створює відповідну подію історії для кожної команди,
тому workflow не блокується на реальному часі в тесті:

- `ctx.sleep(seconds)` → `TimerFired`
- `ctx.side_effect(...)` → `SideEffectRecorded`
- `ctx.upsert_search_attributes(...)` → `SearchAttributesUpserted`
- `workflow.version(...)` маркери → `VersionMarkerRecorded`

#### Ланцюги continue-as-new {#continue-as-new-chains}

Коли workflow повертає `ctx.continue_as_new(...)`, harness додає
`WorkflowContinuedAsNew` до завершуваного виконання, скидає історію й
починає нове з аргументами команди. `execute_workflow` повертає
термінальний результат останньої ланки.

```python
@workflow.defn(name="countdown")
class Countdown:
    def run(self, ctx, counter: int):
        yield ctx.schedule_activity("emit", [counter])
        if counter > 0:
            return ctx.continue_as_new(counter - 1)
        return {"final_counter": counter}


def test_chain_returns_final_run_result() -> None:
    env = WorkflowEnvironment()
    env.register_activity_result("emit", None)

    result = env.execute_workflow(Countdown, 3)

    assert result == {"final_counter": 0}
    assert env.run_count == 4
    assert [r.input for r in env.runs] == [[3], [2], [1], [0]]
```

Якщо ланцюг змінює тип workflow, спочатку зареєструйте наступний клас:

```python
@workflow.defn(name="stage-one")
class StageOne:
    def run(self, ctx):
        yield ctx.schedule_activity("stage_one", [])
        return ctx.continue_as_new(workflow_type="stage-two")


@workflow.defn(name="stage-two")
class StageTwo:
    def run(self, ctx):
        return (yield ctx.schedule_activity("stage_two", []))


def test_chain_can_switch_workflow_type() -> None:
    env = WorkflowEnvironment()
    env.register_workflow(StageTwo)
    env.register_activity_result("stage_one", None)
    env.register_activity_result("stage_two", "done")

    assert env.execute_workflow(StageOne) == "done"
    assert [r.workflow_type for r in env.runs] == ["stage-one", "stage-two"]
```

Направляйте signal конкретній ланці через `run=N`:

```python
env.signal("approve", ["alice"], run=2)  # delivered to the second run
```

Довжина ланцюга обмежена `continue_as_new_limit` (типово `50`).
Перевищення піднімає `RuntimeError` для виявлення нескінченних продовжень
замість безкінечного циклу. Для правомірно довшого ланцюга задайте
`WorkflowEnvironment(continue_as_new_limit=...)`.

#### Перевірка помилок {#failure-assertions}

Workflow, що піднімає виняток Python, повертає `WorkflowFailed`:

```python
import pytest
from durable_workflow.errors import WorkflowFailed

@workflow.defn(name="failing")
class Failing:
    def run(self, ctx):
        yield ctx.schedule_activity("step", [])
        raise RuntimeError("boom")


def test_workflow_failure_surfaces_as_workflow_failed() -> None:
    env = WorkflowEnvironment()
    env.register_activity_result("step", None)

    with pytest.raises(WorkflowFailed) as exc_info:
        env.execute_workflow(Failing)

    assert "boom" in str(exc_info.value)
```

### Тестування replay production історії {#replay-testing-against-production-history}

Використовуйте `replay_history` для регресійної перевірки зміни коду
проти справжньої історії Server. Replayer виконує поточний код за
записаною послідовністю й піднімає виняток за команди, що відрізняється
від записаної. Це визначення помилки недетермінізму.

```python
from durable_workflow import Client
from durable_workflow.testing import replay_history

async with Client("http://localhost:8080") as client:
    history = await client.get_history("order-42", run_id="...")

replay_history(OrderWorkflow, history["events"], start_input=["order-42"])
```

Workflow, що раніше завершився, має завершитися при replay тієї самої
історії. Якщо код розходиться із записаною послідовністю (інший порядок
activity, вилучені гілки, змінені типи), `replay_history` піднімає виняток
для виявлення регресії в CI до production.

`replay_history_file` читає JSON файл однієї з двох форм: верхній список
подій чи словник із ключем `events`, що відповідає `get_history`:

```python
from durable_workflow.testing import replay_history_file

replay_history_file(
    OrderWorkflow,
    "tests/histories/order-42.json",
    start_input=["order-42"],
)
```

Обидві функції приймають необов'язкову підказку `payload_codec`.
Без неї використовується записаний тег історії. Явний чи записаний тег
має бути `avro`. `json`, невідомий чи відсутній тег надійного payload
відхиляється до декодування.

#### Replayer як клас {#class-based-replayer}

Для кількох типів workflow за один тест або вибору типу через збережену
подію `WorkflowStarted` використовуйте клас `Replayer`.
Зареєструйте всі класи заздалегідь і викличте `replay(...)` для кожної історії:

```python
from durable_workflow import Replayer, ReplayOutcome

replayer = Replayer(workflows=[OrderWorkflow, RefundWorkflow])

# Explicit type and input — equivalent to replay_history(OrderWorkflow, ...).
outcome: ReplayOutcome = replayer.replay(
    history["events"],
    start_input=["order-42"],
    workflow_type="order",
)

# Type and start input inferred from a WorkflowStarted event in the history.
outcome = replayer.replay(history)  # history may be an events list or a
                                    # dict with an "events" key

for command in outcome.commands:
    # Inspect commands the replayed workflow would have emitted next.
    ...
```

`Replayer(workflows=[...])` відхиляє порожній набір чи дублікати з `ValueError`.
`replay(...)` піднімає `ValueError` за незареєстрованого типу історії або
кількох зареєстрованих workflow без `workflow_type` викликача й без
події `WorkflowStarted` в історії.

`ReplayOutcome.commands` є тим самим списком команд, що й результат
`replay_history`. Клас дозволяє тестам використовувати одну реєстрацію
для багатьох історій.

### Довідник тестового harness {#test-harness-reference}

| Символ | Призначення |
| --- | --- |
| `durable_workflow.testing.WorkflowEnvironment` | Тестовий harness у процесі для завершення workflow з mock activity й дочірніх workflow. |
| `durable_workflow.testing.replay_history(workflow_cls, events, start_input=None, *, run_id="", payload_codec=None)` | Replay послідовності подій проти поточного коду з винятком за недетермінізму. |
| `durable_workflow.testing.replay_history_file(workflow_cls, path, start_input=None, *, run_id="", payload_codec=None)` | Завантаження історії JSON із диска й replay. Приймає список подій чи словник `events`. |
| `durable_workflow.Replayer(*, workflows=[...])` | Replayer як клас. Реєструйте workflow, потім викликайте `replay(history, start_input=None, *, workflow_type=None, workflow_id=None, run_id="", payload_codec=None)` для історій. Визначає `workflow_type` і `start_input` з `WorkflowStarted` за наявності. |
| `durable_workflow.ReplayOutcome` | Dataclass результату `Replayer.replay` з `commands: list[Command]`, наступними командами відтвореного workflow. |
| `durable_workflow.errors.WorkflowFailed` | Виняток `execute_workflow` за завершення failed. |
| `durable_workflow.errors.WorkflowCancelled` | Термінальний стан скасованого workflow, успадковує `BaseException`. |
| `durable_workflow.errors.WorkflowTerminated` | Термінальний стан workflow, примусово завершеного Server, успадковує `BaseException`. |

## Кодек payload {#payload-codec}

<div
  data-public-payload-codec-contract="avro-only"
  data-payload-codec="avro"
  data-authority-manifest="https://durable-workflow.github.io/sdk-neutrality-contract.json"
  data-legacy-v1-import-drain="none">
  Кожен payload межі протоколу worker має тег кодека.
  Durable Workflow 2.0 має один публічний кодек: <code data-payload-codec-field="codec">avro</code>.
  Python SDK відхиляє JSON, невідомі й нетеговані надійні payload
  замість вибору іншого декодера. Див. <a href="/docs/polyglot/avro-value-protocol/">протокол Avro Value</a>.
</div>

### Avro вбудовано {#avro-support-is-built-in}

Зафіксований артефакт SDK 2.0 встановлює `fastavro` як залежність runtime.
Тому `start_workflow`, `signal_workflow`, `query_workflow`, `update_workflow`,
кодування результату activity й дії schedule надсилають Avro payload
оптимізованим production шляхом. Додатковий codec пакет не потрібен.

### Фіксовані типізовані значення {#fixed-typed-values}

SDK явно вибирає іменовані гілки спільної схеми `durable_workflow.protocol.Value`.
Значення не кодуються як JSON усередині Avro. Цілі й дробові числа,
рядки й байти, bool і цілі, списки й мапи залишаються різними між SDK.
Мережевий формат використовує Avro single-object і fingerprint схеми.
Невідомі fingerprint відхиляються з `unsupported_payload_schema`.

Кожна поверхня клієнта й worker працює наскрізно з типовим Avro:

- **Запуск, signal, query, update клієнта:** `start_workflow`, `signal_workflow`,
  `query_workflow`, `update_workflow` надсилають `payload_codec = "avro"`
  через фіксовану Value. Python клієнт може керувати workflow, які
  відтворюють PHP та інші SDK, і навпаки.
- **Worker activity:** Avro аргументи прозоро декодуються, а результати
  кодуються як Avro для спільної межі PHP, Python і майбутніх SDK.
- **Помилки activity:** `fail_activity_task(..., details=...)` надсилає
  `failure.details` як `{codec, blob}`. Server записує blob і
  `details_payload_codec`, зберігаючи незалежність діагностики від мови
  в експорті історії й оглядах спостережуваності.
- **Replay історії workflow:** Avro ввід запуску й події результату activity
  декодуються під час replay для участі Python workflow в Avro виконанні.
- **Завдання query workflow:** маршрутизовані query містять Avro аргументи
  workflow, query та історію replay. Результат повертається в Avro обгортці.

### Worker activity Python для виконання v2 {#running-a-python-activity-worker-against-a-v2-run}

Налаштування кодека не потрібне. SDK перевіряє `payload_codec` перед
декодуванням кожного отриманого завдання, приймає лише `avro`, виконує
activity й повертає Avro результат. Інший тег відхиляється з
`unsupported_payload_codec`. Worker не вгадує формат за вмістом.

### Типи, що зберігаються між Python і PHP {#types-that-round-trip-cleanly-across-python-and-php}

| Тип Python | Гілка Avro Value | Тип PHP |
|-------------|------|----------|
| `str` | `StringValue` | `string` |
| `bytes` | `BytesValue` | `AvroBinaryValue` |
| `int` | `LongValue` | `int` |
| `float` | `DoubleValue` | `float` |
| `bool` | `BooleanValue` | `bool` |
| `None` | `null` | `null` |
| `list` | `ArrayValue` | `array` (список) |
| `dict[str, ...]` | `MapValue` | `array` (мапа з рядковими ключами) |

Перед передаванням значень workflow чи activity перетворюйте специфічні
типи Python (dataclass, множини, кортежі, datetime) на канонічні
рядки, цілі числа, мапи чи списки.

## Запуск зі спільним Server {#running-against-a-shared-server}

[Quickstart](#quickstart) вище запускає локальний Server з опублікованим
образом Docker. У командному середовищі worker Python зазвичай
підключається до наявного Server (тестового, production чи спільного dev):

```python
from durable_workflow import Client

client = Client(
    "https://workflow.example.internal",
    control_token="team-orders-operator-token",
    worker_token="team-orders-worker-token",
    namespace="team-orders",
)
```

Задайте `namespace` орендаря, наданий команді спільним Server, та видані
для нього облікові дані. Namespace створює оператор Server.
Докладніше в [посібнику Server](/docs/polyglot/server).

Той самий конструктор підтримує керований runtime Cloud. Використовуйте
надані Cloud URL runtime і namespace, задайте `control_token` обліковими
даними клієнта runtime, а `worker_token` обліковими даними worker.
Cloud створює namespace. Не заміняйте URL адресою самостійного Server.
Див. [керований runtime Cloud](/docs/polyglot/cloud-control-plane).
