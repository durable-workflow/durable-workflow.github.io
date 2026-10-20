---
sidebar_position: 4
tags:
  - Python
  - SDK
  - workers
  - polyglot
keywords:
  - sample-app-playground
  - SDK Python
  - Client de durable_workflow
  - worker Python
  - cliente asíncrono de workflows
---

import ProductPromotion from '@site/src/components/ProductPromotion';
import PythonPackageReleaseLink from '@site/src/components/PythonPackageReleaseLink';

# SDK Python {#python-sdk}

El SDK Python es un cliente ligero diseñado para uso asíncrono con Server
autogestionado o un entorno de namespace de Durable Workflow Cloud. Permite
iniciar, observar, señalar y cancelar workflows mediante la API del plano de
control, y registrar procesos Python como workers que ejecutan tareas de
workflow y actividades.

## Prueba el entorno local de Sample App {#try-the-local-sample-app-playground}

Para empezar a crear sin Cloud por el camino más corto, abre la
[rama `main` actual de Sample App en GitHub Codespaces](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main)
y ejecuta:

<!-- docs-example id="sdk.python.sample-app-playground" -->
```bash
scripts/playground python
```

El entorno local genera código de workflow y actividad propiedad de quien lo
ejecuta, selecciona artefactos estables actuales e inicia Server y Waterline
publicados. Antes de iniciar el workflow espera un registro de worker cuya
identidad, tipos y cola coincidan con el contrato generado. El éxito exige el
resultado completado y el historial esperados. El terminal imprime después el
enlace local exacto de la ejecución en Waterline y la ruta de evidencia JSON estructurada.

La instalación del paquete, inicio rápido, referencia de API y ejemplo del
repositorio siguientes siguen siendo rutas directas si no quieres usar Sample App.

<ProductPromotion source="docs-v2-python-sdk">
Ejecuta clientes y workers Python contra un namespace gestionado por Cloud con
credenciales separadas y limitadas por rol.
</ProductPromotion>

El SDK usa el mismo modelo duradero que el paquete PHP: identificadores de
instancia y ejecución, eventos, colas y claves de tipo compartidos entre
lenguajes. Un worker Python puede ejecutar actividades de un workflow escrito
en PHP y viceversa.

Compara Python, PHP, Rust y `dw` en
[Capacidades de clientes y workers](/docs/polyglot/cli-python-parity/).

Para firmas de constructores, tipos devueltos, excepciones y nombres de métricas,
consulta la [referencia generada de la API del SDK Python](https://python.durable-workflow.com/).

El SDK Python 2.5.0 añade una caché de historial opcional y acotada para ejecución
sticky. Usa Server 2.5.10 o posterior y habilítala en cada worker. Consulta
[Afinidad portable de workers](/docs/polyglot/portable-worker-affinity) y la
[guía Python y ejemplo ejecutable](https://python.durable-workflow.com/guides/sticky-execution/).

Los clientes Cloud usan URL y namespace provisionados, con credenciales de
cliente y worker separadas. Consulta
[Entorno gestionado de Cloud](/docs/polyglot/cloud-control-plane). El inicio rápido
siguiente usa valores locales autogestionados.

## Requisitos {#requirements}

- Python 3.10 o posterior
- Docker para el Server local del ejemplo, un
  [Server autogestionado](/docs/polyglot/server) existente o un
  [entorno Cloud de namespace](/docs/polyglot/cloud-control-plane) provisionado

## Instalación {#installation}

Instala la <PythonPackageReleaseLink authority="qualified">versión estable del
SDK Python</PythonPackageReleaseLink>. El requisito exacto se genera desde la
misma combinación que el inicio rápido de Server. Un archivo de bloqueo o
restricciones puede conservarlo para reproducibilidad.

<!-- docs-example id="python.sdk.install" -->
```bash
pip install %%artifact.pythonPackagePin%%
```

El SDK depende de [httpx](https://www.python-httpx.org/) para HTTP y de `fastavro`
para codificar el formato Apache Avro del único códec público de cargas v2.
El soporte de métricas Prometheus es opcional.

## Inicio rápido {#quickstart}

Este programa completo define un workflow con una actividad, lo inicia contra
un servidor local y espera el resultado:

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

### Ejecutar contra un servidor local {#running-against-a-local-server}

El programa presupone un servidor en `http://localhost:8080` con `dev-token`
local. Si no tienes uno, la vía más rápida sin código fuente es la imagen publicada:

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

Para producción (controladores de autenticación, base, TLS), consulta la
[guía de configuración de Server](/docs/polyglot/server).

Para un ejemplo mayor, [`examples/order_processing`](https://github.com/durable-workflow/sdk-python/tree/main/examples/order_processing)
incluye un Compose que ejecuta un worker Python y un workflow completo de pedidos.

## Referencia de la API de cliente {#client-api-reference}

`durable_workflow.Client` asíncrono es la entrada pública para llamadas HTTP de
control y workers. Úsalo como gestor de contexto asíncrono para cerrar
correctamente el pool de conexiones `httpx.AsyncClient`.

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

### Constructor {#constructor}

| Argumento | Tipo | Predeterminado | Cuándo usarlo |
| --- | --- | --- | --- |
| `base_url` | `str` | obligatorio | Origen de Server, sin `/api`. |
| `token` | `str | None` | `None` | Un token bearer autoriza llamadas de control y workers. |
| `control_token` | `str | None` | `None` | El control necesita un bearer diferente del sondeo de workers. |
| `worker_token` | `str | None` | `None` | El plano de workers necesita un bearer diferente de las llamadas de operador. |
| `namespace` | `str` | `"default"` | Seleccionar namespace mediante `X-Namespace`. |
| `timeout` | `float` | `60.0` | Cambiar el plazo HTTP predeterminado. |
| `retry_policy` | `TransportRetryPolicy | None` | política predeterminada | Ajustar reintentos de transporte ante fallos HTTP transitorios. |
| `metrics` | `MetricsRecorder | None` | sin operación | Emitir métricas de cliente y worker a un registrador propio. |
| `payload_size_limit_bytes` | `int` | predeterminado del SDK | Ajustar al contrato máximo de bytes de carga del servidor. |
| `payload_size_warning_threshold_percent` | `int` | predeterminado del SDK | Avisar antes de alcanzar el límite. |
| `payload_size_warnings` | `bool` | `True` | Desactivar avisos locales de tamaño en pruebas o scripts controlados. |

`token` es lo más sencillo. Si estableces `control_token` y `worker_token`, los
métodos usan el correspondiente a su plano.

### Almacenamiento externo de cargas {#external-payload-storage}

El SDK exporta el mismo contrato de referencias externas que las API de
almacenamiento de Server y CLI. Úsalo para que manejadores Python de actividades
o contenedores invocables decodifiquen referencias grandes del historial, o para
crear sobres independientes del lenguaje sin incluir todos los bytes en línea.

| API | Función | Errores |
| --- | --- | --- |
| `ExternalStorageDriver` | Protocolo para `put(data, sha256=..., codec=...)`, `get(uri)` y `delete(uri)`. | Errores de almacenamiento del controlador. |
| `LocalFilesystemExternalStorage` | Controlador `file://` sin dependencias para desarrollo y pruebas. | `ValueError` si una URI sale de la raíz configurada. |
| `S3ExternalStorage` | Adaptador de cliente compatible con boto3. | `ValueError` para bucket/prefijo ajeno o respuestas que no son bytes. |
| `GCSExternalStorage` | Adaptador de cliente de estilo google-cloud-storage. | `ValueError` para bucket/prefijo ajeno o respuestas que no son bytes. |
| `AzureBlobExternalStorage` | Adaptador de cliente de contenedor Azure. | `ValueError` para contenedor/prefijo ajeno o respuestas que no son bytes. |
| `ExternalPayloadReference` | Referencia inmutable con `uri`, `sha256`, `size_bytes`, `codec` y esquema. | `ValueError` si `from_dict()` recibe esquema no admitido o campos malformados. |
| `ExternalPayloadCache` | Caché de reproducción acotada de bytes externos ya verificados. | Rechaza límites de entradas o bytes que no sean positivos. |
| `store_external_payload()` | Guarda bytes codificados y devuelve `ExternalPayloadReference`. | Errores del controlador. |
| `fetch_external_payload()` | Obtiene bytes y verifica tamaño y SHA-256 antes de decodificar. | `ExternalPayloadIntegrityError` si no coincide tamaño/huella. |
| `delete_external_payload()` | Elimina el objeto y cualquier entrada de caché. | Errores del controlador. |
| `external_storage_envelope()` | Codifica en línea hasta superar el umbral; después escribe mediante controlador. | `ValueError` si el umbral es inválido o no hay controlador que resuelva la referencia. |
| `external_storage_driver_from_policy()` | Crea el controlador desde una política `external_payload_storage` de Server o Cloud y clientes del proveedor aportados por la aplicación. | `ValueError` si está deshabilitada, no admitida o falta cliente/bucket/contenedor. |

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

El esquema de referencia es `EXTERNAL_PAYLOAD_REFERENCE_SCHEMA`
(`durable-workflow.v2.external-payload-reference.v1`). Los adaptadores no añaden
dependencias SDK Cloud a `durable-workflow`: la aplicación aporta sus clientes
S3, GCS o Azure ya configurados.

Los campos del sobre de transmisión son deliberadamente pequeños y estables:

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

`ExternalPayloadReference.from_dict()` rechaza esquemas desconocidos y campos
malformados. `fetch_external_payload()` verifica `size_bytes` y `sha256` antes de
devolver bytes y lanza `ExternalPayloadIntegrityError` si el objeto falta, está
truncado o cambió. Usa `ExternalPayloadCache` solo tras verificar, para evitar
descargas repetidas durante reproducción sin debilitar integridad.

Si la aplicación ya leyó `external_payload_storage` del servidor o plano Cloud,
`external_storage_driver_from_policy()` devuelve el controlador correspondiente.
Los clientes del proveedor siguen siendo de la aplicación. El SDK no añade
boto3, google-cloud-storage ni azure-storage-blob como dependencias de ejecución:

```python
from durable_workflow.external_storage import external_storage_driver_from_policy

namespace = await client.describe_namespace("billing")
driver = external_storage_driver_from_policy(
    namespace.external_payload_storage,
    s3_client=application_owned_s3_client,
)
```

La fábrica lanza `ValueError` ante política deshabilitada, controlador no
admitido o cliente ausente. No devuelve un controlador sin efecto para políticas
deshabilitadas: comprueba `policy.enabled` antes de pedirlo.

### Namespaces {#namespaces}

Los namespaces delimitan la separación entre inquilinos para workflows,
programaciones, atributos de búsqueda y almacenamiento externo. El cliente
selecciona uno con `namespace=`, pero las operaciones siguientes sirven para
cualquier namespace autorizado por el bearer.

| Método | Devuelve | Errores |
| --- | --- | --- |
| `await client.list_namespaces()` | `NamespaceList` | Errores de autenticación/servidor. |
| `await client.describe_namespace(name)` | `NamespaceDescription` | `NamespaceNotFound`, errores de autenticación/servidor. |
| `await client.create_namespace(name, description=None, retention_days=30)` | `NamespaceDescription` | `InvalidArgument` por nombre duplicado o retención inválida, errores de autenticación/servidor. |
| `await client.update_namespace(name, description=None, retention_days=None)` | `NamespaceDescription` | `NamespaceNotFound`, `InvalidArgument`, errores de autenticación/servidor. Solo envía los campos aportados. |
| `await client.set_namespace_external_storage(name, driver=..., enabled=True, threshold_bytes=None, config=None)` | `NamespaceDescription` | `InvalidArgument` si la política falla la validación, errores de autenticación/servidor. |
| `await client.test_external_storage(driver=None, small_payload_bytes=None, large_payload_bytes=None)` | `StorageTestResult` | `InvalidArgument` si faltan campos obligatorios en la política vinculada, errores de autenticación/servidor. |

`set_namespace_external_storage` equivale a `dw namespace:set-storage-driver`.
El primer argumento posicional es `name`, igual que en `describe_namespace`,
`create_namespace` y `update_namespace`. El alias obsoleto `namespace=` emite
`DeprecationWarning`; usa `name` posicional en código nuevo. `config` contiene
claves específicas del controlador, incluido `disk` opcional en `s3`, `gcs` y
`azure`, para mantener credenciales en el servidor. `NamespaceDescription`
refleja lo realmente persistido, incluido el umbral usado por defecto si no se
aportó uno.

`test_external_storage` equivale a `dw storage:test`. El servidor escribe y lee
una carga pequeña y otra grande mediante el controlador vinculado. Devuelve
`StorageTestResult`, con registros `StoragePayloadTestResult` por carga y campos
`wrote`, `read`, `verified`, `latency_ms` y `bytes`.

`NamespaceDescription` lleva la política `external_payload_storage` documentada
en [Almacenamiento externo de cargas](#external-payload-storage). Combínala con
`external_storage_driver_from_policy()` para crear el controlador Python sin
volver a leer credenciales en código de aplicación.

### Clúster y colas de tareas {#cluster-and-task-queues}

| Método | Devuelve | Notas |
| --- | --- | --- |
| `await client.health()` | `dict[str, Any]` | Llama al endpoint de salud para comprobar vida. |
| `await client.get_cluster_info()` | `dict[str, Any]` | Lee versión, protocolos, capacidades y compatibilidad del servidor. |
| `await client.list_task_queues()` | `TaskQueueList` | Enumera colas visibles en el namespace. |
| `await client.describe_task_queue(name)` | `TaskQueueDescription` | Devuelve capacidad, leases actuales, admisión de consultas y presupuestos de despacho. |
| `await client.list_task_queue_build_ids(task_queue)` | `TaskQueueBuildIdRollout` | Captura el estado de cohortes por build-id, incluidos workers sin versión bajo `build_id` igual a `None`. |
| `await client.drain_task_queue_build_id(task_queue, build_id)` | `TaskQueueBuildIdRolloutState` | Marca una cohorte para drenaje y deja de reclamar nuevas tareas. `build_id=None` drena workers sin versión. Idempotente. |
| `await client.resume_task_queue_build_id(task_queue, build_id)` | `TaskQueueBuildIdRolloutState` | Revierte un drenaje y permite reclamar de nuevo. `build_id=None` reanuda workers sin versión. Idempotente. |

Los tipos devueltos exponen dataclasses anidadas `TaskQueueAdmission`,
`TaskQueueTaskAdmission`, `TaskQueueQueryAdmission`, `TaskQueueBuildIdCohort`,
`TaskQueueBuildIdRollout` y `TaskQueueBuildIdRolloutState` para comprobar capacidad
y despliegues sin analizar prosa. Consulta
[Despliegue por build-id de worker](/docs/polyglot/worker-build-id-rollout).
Los equivalentes CLI son `dw task-queue:build-ids`, `dw task-queue:drain` y
`dw task-queue:resume`.

### Operaciones de workflow {#workflow-operations}

| Método | Devuelve | Errores |
| --- | --- | --- |
| `await client.start_workflow(...)` | `WorkflowHandle` | `WorkflowAlreadyStarted`, `InvalidArgument`, `Unauthorized`, `ServerError` |
| `await client.describe_workflow(workflow_id)` | `WorkflowExecution` | `WorkflowNotFound`, errores de autenticación/servidor |
| `await client.list_workflows(...)` | `WorkflowList` | Errores de autenticación/servidor |
| `await client.list_workflow_runs(workflow_id)` | `WorkflowRunList` | `WorkflowNotFound`, errores de autenticación/servidor |
| `await client.describe_workflow_run(workflow_id, run_id)` | `WorkflowRun` | `WorkflowNotFound`, errores de autenticación/servidor |
| `await client.get_history(workflow_id, run_id)` | carga de historial decodificada | `WorkflowNotFound`, errores de autenticación/servidor |
| `await client.export_history(workflow_id, run_id)` | carga de historial para archivo decodificada | `WorkflowNotFound`, errores de autenticación/servidor |
| `await client.signal_workflow(workflow_id, signal_name, args=None)` | `None` | `WorkflowNotFound`, `InvalidArgument`, errores de autenticación/servidor |
| `await client.query_workflow(workflow_id, query_name, args=None)` | resultado de consulta decodificado | `QueryFailed`, `WorkflowNotFound`, errores de autenticación/servidor |
| `await client.update_workflow(workflow_id, update_name, args=None, ...)` | resultado de actualización decodificado | `UpdateRejected`, `WorkflowNotFound`, errores de autenticación/servidor |
| `await client.cancel_workflow(workflow_id, reason=None)` | `None` | `WorkflowNotFound`, errores de autenticación/servidor |
| `await client.terminate_workflow(workflow_id, reason=None)` | `None` | `WorkflowNotFound`, errores de autenticación/servidor |
| `await client.repair_workflow(workflow_id)` | `WorkflowCommandResult` | `WorkflowNotFound`, errores de autenticación/servidor |
| `await client.archive_workflow(workflow_id, reason=None)` | `WorkflowCommandResult` | `WorkflowNotFound`, errores de autenticación/servidor |
| `await client.get_result(handle, poll_interval=0.5, timeout=30.0)` | salida de workflow decodificada | `WorkflowFailed`, `WorkflowCancelled`, `WorkflowTerminated`, `TimeoutError` |

`start_workflow` acepta `workflow_type`, `task_queue`, `workflow_id` e `input`
opcionales, `duplicate_policy`, `memo`, `search_attributes`, `business_key`,
`execution_timeout_seconds` y `run_timeout_seconds`. Todas las cargas se envuelven
en Avro antes de cruzar HTTP.

Usa `client.get_workflow_handle(workflow_id, run_id=None, workflow_type="")`
si ya conoces el identificador y quieres métodos de handle.

| Método de `WorkflowHandle` | Método equivalente del cliente |
| --- | --- |
| `await handle.result(...)` | `client.get_result(handle, ...)` |
| `await handle.describe()` | `client.describe_workflow(handle.workflow_id)` |
| `await handle.signal(name, args=None)` | `client.signal_workflow(...)` |
| `await handle.query(name, args=None)` | `client.query_workflow(...)` |
| `await handle.update(name, args=None, ...)` | `client.update_workflow(...)` |
| `await handle.cancel(reason=None)` | `client.cancel_workflow(...)` |
| `await handle.terminate(reason=None)` | `client.terminate_workflow(...)` |

Ambas operaciones cierran inmediatamente la ejecución en Server con resultados
terminales distintos. `cancel_workflow` no entrega una petición cooperativa al
código ni ejecuta limpieza saga/finally. Usa `request_cancellation()` con workers
cooperantes para limpieza acotada. Consulta la
[guía de cancelación cooperativa](/docs/polyglot/cancellation) para políticas,
supervisión y recuperación.

### Programaciones {#schedules}

Usan `ScheduleSpec` para reglas de calendario/intervalo y `ScheduleAction` para
la petición de inicio emitida en cada activación.

| Método | Devuelve | Notas |
| --- | --- | --- |
| `await client.create_schedule(...)` | `ScheduleHandle` | Crea una programación y devuelve un handle. |
| `await client.list_schedules()` | `ScheduleList` | Enumera programaciones visibles. |
| `await client.describe_schedule(schedule_id)` | `ScheduleDescription` | Lee estado, acción, siguiente activación y contadores. |
| `await client.update_schedule(schedule_id, ...)` | `None` | Actualiza reglas, acción, solapamiento, variación temporal, memo, atributos de búsqueda o nota. |
| `await client.pause_schedule(schedule_id, note=None)` | `None` | Pausa activaciones futuras. |
| `await client.resume_schedule(schedule_id, note=None)` | `None` | Reanuda una programación pausada. |
| `await client.trigger_schedule(schedule_id, overlap_policy=None)` | `ScheduleTriggerResult` | Solicita una activación inmediata. |
| `await client.backfill_schedule(schedule_id, start_time=..., end_time=..., overlap_policy=None)` | `ScheduleBackfillResult` | Recupera intervalos de activación perdidos. |
| `await client.get_schedule_history(schedule_id, *, limit=None, after_sequence=None)` | `ScheduleHistoryPage` | Página de auditoría ordenada por `sequence` ascendente. `limit` se limita en el servidor a 1–500 (100 por defecto). `after_sequence` es un cursor no negativo del `next_cursor` anterior. Lanza `ScheduleNotFound` si no existe. El historial sobrevive a `delete_schedule` para auditar por qué se eliminó. |
| `client.iter_schedule_history(schedule_id, *, limit=None, after_sequence=None)` | `AsyncIterator[ScheduleHistoryEvent]` | Produce todos los eventos paginando hasta `has_more=False`. Mismos errores que `get_schedule_history`. |
| `await client.delete_schedule(schedule_id)` | `None` | Elimina la programación. |

`client.get_schedule_handle(schedule_id)` devuelve `ScheduleHandle` con métodos
`describe`, `update`, `pause`, `resume`, `trigger`, `backfill`, `history`,
`iter_history` y `delete` delegados al cliente. `ScheduleHandle.history(...)`
devuelve `ScheduleHistoryPage`; `ScheduleHandle.iter_history(...)`, un
`AsyncIterator[ScheduleHistoryEvent]`.

`ScheduleHistoryPage` lleva `events` ordenados, `has_more`, `next_cursor` entero
(o `None` al final), `schedule_id` y `namespace` propietario. Cada
`ScheduleHistoryEvent` lleva `sequence`, `event_type` (`ScheduleCreated`,
`SchedulePaused`, `ScheduleResumed`, `ScheduleUpdated`, `ScheduleTriggered`,
`ScheduleTriggerSkipped` o `ScheduleDeleted`), `recorded_at`,
`workflow_instance_id` y `workflow_run_id` opcionales para workflows activados,
y el diccionario `payload` original registrado por control.

### Eventos de puente y métodos del plano de workers {#bridge-events-and-worker-plane-methods}

`await client.send_webhook_bridge_event(adapter, action=..., target=..., input=..., idempotency_key=..., correlation=None)`
devuelve `BridgeAdapterOutcome`, el mismo contrato legible por máquinas que
`dw bridge:webhook`. Es la entrada Python para una recepción acotada desde sistemas
de tipo webhook.

Los métodos de bajo nivel son públicos para workers propios y pruebas de
protocolo, pero las aplicaciones normales deben usar `Worker`:

| Grupo | Métodos |
| --- | --- |
| Registro de workers | `register_worker` |
| Tareas de workflow | `poll_workflow_task`, `complete_workflow_task`, `fail_workflow_task`, `workflow_task_history` |
| Tareas de consulta | `poll_query_task`, `complete_query_task`, `fail_query_task` |
| Tareas de actividad | `poll_activity_task`, `complete_activity_task`, `fail_activity_task`, `heartbeat_activity_task` |

Envían `X-Durable-Workflow-Protocol-Version` y usan `worker_token` si existe.
Prefiere `Worker` salvo para adaptadores SDK o pruebas de conformidad.

`workflow_task_history(...)` pagina el historial de una tarea con lease ya
adquirido. Llámalo solo si `poll_workflow_task(...)` devuelve `next_history_page_token`:

```python
page = await client.workflow_task_history(
    task_id="workflow-task-01",
    next_history_page_token="history-page-2",
    lease_owner="python-worker-1",
    workflow_task_attempt=2,
)
```

La petición usa `next_history_page_token`, `lease_owner` y
`workflow_task_attempt`. La respuesta usa los campos del protocolo
`history_events`, `total_history_events` y `next_history_page_token`, no los del
historial de control `events` ni `next_page_token`.

### Workers {#workers}

El registro muestra workers vistos recientemente y qué ejecuta cada uno. Úsalo
para despliegues por build-id, eliminar registros obsoletos y conciliar capacidad.

| Método | Devuelve | Errores |
| --- | --- | --- |
| `await client.list_workers(task_queue=None, status=None)` | `WorkerList` | Errores de autenticación/servidor. |
| `await client.describe_worker(worker_id)` | `WorkerDescription` | `WorkerNotFound`, errores de autenticación/servidor. |
| `await client.deregister_worker(worker_id)` | `dict[str, Any]` | `WorkerNotFound`, errores de autenticación/servidor. |

`list_workers` filtra en servidor: `task_queue` limita a una cola y `status` a
una cadena reconocida. Por defecto devuelve todos los registrados del namespace.

`WorkerDescription` lleva entorno, versión SDK, build-id, tipos declarados,
último latido y admisión actual para decidir qué cohorte drenar o qué workers retirar.

`deregister_worker` es idempotente en servidor y elimina un worker que ya no
envía latidos para mantener correctos capacidad y listado. No interrumpe leases en curso.

### Atributos de búsqueda {#search-attributes}

Son metadatos tipados del namespace presentes en ejecuciones para filtrar e
indexar. El cliente refleja las mismas operaciones de control que la CLI.

| Método | Devuelve | Errores |
| --- | --- | --- |
| `await client.list_search_attributes()` | `SearchAttributeList` | Errores de autenticación/servidor. |
| `await client.create_search_attribute(name, attribute_type)` | `dict[str, Any]` | `InvalidArgument` por duplicados o tipos no admitidos, errores de autenticación/servidor. |
| `await client.delete_search_attribute(name)` | `dict[str, Any]` | `SearchAttributeNotFound`, `InvalidArgument` para atributos del sistema, errores de autenticación/servidor. |

`SearchAttributeList` separa definiciones `system` y `custom` para verificar las
claves del motor (identificador, estado, tipo, inicio, etc.) y rechazar colisiones
con claves propias. Los tipos admitidos son `keyword`, `text`, `int`, `double`,
`bool`, `datetime` y `keyword_list`.

### Mantenimiento del sistema {#system-maintenance}

Scripts y automatización operativa ejecutan los mismos ciclos que `dw system:*`
mediante el cliente. Cada método exige ámbito admin en el bearer; sin él devuelve
`Unauthorized`.

| Método | Devuelve | Equivalente CLI |
| --- | --- | --- |
| `await client.repair_status()` | `dict[str, Any]` | `dw system:repair-status` |
| `await client.repair_pass(run_ids=None, instance_id=None)` | `dict[str, Any]` | `dw system:repair-pass` |
| `await client.retention_status()` | `dict[str, Any]` | `dw system:retention-status` |
| `await client.retention_pass(run_ids=None, limit=None)` | `dict[str, Any]` | `dw system:retention-pass` |
| `await client.activity_timeout_status()` | `dict[str, Any]` | `dw system:activity-timeout-status` |
| `await client.activity_timeout_pass(execution_ids=None, limit=None)` | `dict[str, Any]` | `dw system:activity-timeout-pass` |

`repair_pass` realiza una pasada de reparación. Sin filtros abarca el namespace.
`run_ids` limita a ejecuciones concretas; `instance_id`, a una instancia activa.

Sin `run_ids`, `retention_pass` pide a PHP Server podar ejecuciones terminales
vencidas según la política y límite de exploración. Los `run_ids` explícitos
apuntan directamente a ejecuciones cerradas y omiten ese filtro de antigüedad:
pueden podar historial más joven que la ventana de retención. Siguen aplicándose
retención indefinida y protección de archivadas. `retention_status()` informa de
política, fecha de corte y lista elegible acotada sin eliminar. Revisa el
[procedimiento de retención](./server.md#retention) antes de acortar políticas o
enviar objetivos explícitos.

`activity_timeout_pass` impone plazos start-to-close y schedule-to-close ya
vencidos. Sin filtros procesa los vencidos hasta el límite; `execution_ids`
selecciona una lista y `limit` acota una pasada.

No lanzan errores por falta de trabajo. Repetirlas en períodos tranquilos
devuelve los mismos contadores `passes` / `repaired` / `pruned` con incrementos
cero. Pueden llamarse con seguridad desde scripts cron.

## Definir workflows {#defining-workflows}

Los workflows son clases Python decoradas con `@workflow.defn`. `run` es un
generador que produce comandos para el servidor.

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

El `name` de `@workflow.defn(name="...")` es la clave de tipo compartida entre
lenguajes. Debe ser una cadena simple, no una ruta de módulo ni referencia de clase.

### Señales, consultas y actualizaciones {#signals-queries-and-updates}

Las señales se registran en historial duradero y se entregan a manejadores
Python durante la reproducción:

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

Los decoradores receptores de consultas y actualizaciones publican nombres
estables de manejador. Los workers ejecutan consultas enrutadas por el servidor
reproduciendo el historial confirmado e invocando el manejador sobre ese estado.
También aplican actualizaciones aceptadas recibidas en tareas de workflow:

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

Los workers completan consultas devolviendo un resultado al servidor. Si se
declara un validador de actualizaciones, reciben una tarea de validación dedicada,
reproducen el estado autorizado e invocan solo el validador. El servidor no
registra aceptación ni despacha el manejador hasta validar. Los workers con
validadores rechazan registrarse salvo que el descubrimiento anuncie el contrato
síncrono previo a aceptación. Rechazo, workers ausentes o incompatibles, pérdida
de worker, vencimiento y finalizaciones duplicadas u obsoletas bloqueadas siguen
siendo resultados tipados explícitos. PHP y Rust no ofrecen actualmente API de
creación de validadores y anuncian esa ausencia en sus contratos, sin afirmar
paridad de validación.

### Contexto del workflow {#workflow-context}

`WorkflowContext`, pasado a `run`, ofrece operaciones deterministas:

| Método | Descripción |
|--------|-------------|
| `ctx.schedule_activity(type, args)` | Programa una actividad con opciones opcionales por llamada de reintentos y plazos |
| `ctx.start_timer(seconds)` | Espera duradera |
| `ctx.start_child_workflow(type, args)` | Inicia un workflow hijo con opciones opcionales de reintento y plazos |
| `yield [command, [...]]` | Espera un grupo determinista anidado de actividades, hijos, temporizadores o mixto en orden de entrada |
| `yield ctx.select({key: command, ...})` | Reanuda con el primer miembro confirmado duraderamente y conserva handles de los demás |
| `ctx.saga()` | Registra y ejecuta compensaciones duraderas de actividad en orden inverso |
| `ctx.side_effect(fn)` | Captura un valor no determinista |
| `ctx.get_version(change_id, min, max)` | Versionado seguro del código del workflow |
| `ctx.upsert_search_attributes(attrs)` | Actualiza atributos de búsqueda |
| `ctx.continue_as_new(*args)` | Reinicia el workflow con otra entrada |
| `ctx.now()` | Reloj determinista desde historial |
| `ctx.random()` | Generador aleatorio con semilla |
| `ctx.uuid4()` | UUID determinista |
| `ctx.logger` | Logger silencioso durante la reproducción |

### Reintentos y plazos de actividades {#activity-retries-and-timeouts}

Usa `ActivityRetryPolicy` y argumentos de plazo en `ctx.schedule_activity(...)`
cuando una llamada necesite otro presupuesto o límite que el intento único
predeterminado:

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

`start_to_close_timeout` limita un intento desde que el worker lo inicia.
`schedule_to_close_timeout` limita la actividad completa entre todos sus intentos.
`heartbeat_timeout` exige a actividades largas llamar a
`activity.context().heartbeat(...)` antes de vencer el intervalo. La política
queda fijada en la ejecución duradera al programar; despliegues posteriores no
cambian intentos ya en curso.

### Reglas de determinismo {#determinism-rules}

El código se reproduce desde historial. No debe realizar directamente operaciones
no deterministas:

- Sin E/S (HTTP, lecturas de archivos, consultas de base)
- Sin `datetime.now()` ni `time.time()`; usa `ctx.now()`
- Sin `random.random()`; usa `ctx.random()`
- Sin `uuid.uuid4()`; usa `ctx.uuid4()`

Todo no determinismo debe pasar por el contexto o capturarse con `ctx.side_effect()`.

### Ejecución en paralelo {#fan-out}

Produce una lista de comandos para ejecutarlos concurrentemente:

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

El worker emite un comando normal por hoja duradera con campos estables
compartidos `parallel_group_*` y la ruta completa de fuera hacia dentro. El
historial puede cerrar miembros en cualquier orden; la reproducción asocia
resultados y fallos por posición duradera de entrada. Ignora entregas terminales
exactamente duplicadas. Tanto el historial pendiente tras reiniciar como el
completado reconstruyen el mismo grupo sin reprogramar trabajo terminado.

### Selección de la primera finalización {#first-completion-selection}

Usa `ctx.select()` para iniciar trabajo independiente a la vez y avanzar al
completar un miembro:

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

`SelectionResult` incluye clave estable, índice de entrada, tipo de operación,
identidad duradera y resultado tipado del ganador, y todos los
`DurableOperationHandle`. `yield handle.await_result()` espera después a un no
ganador; `yield handle.cancel()` registra una petición explícita sin resultado.
Solo `SelectionOperationCancelled` confirmado demuestra que ganó la cancelación.
La reproducción avanza tras una petición sin marcador y `await_result()` sigue
devolviendo la finalización que se confirmó primero. Consume el ganador
persistido aunque un historial posterior contenga antes otra finalización.
Entregas externas duplicadas o desordenadas no sustituyen un ganador confirmado.

### Compensación de sagas {#saga-compensation}

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

Tras un fallo, la saga ejecuta comandos normales de actividad secuencialmente en
orden inverso al registro. `cancel_workflow` terminal no reanuda para compensar.
El auxiliar se detiene en el primer fallo de compensación.
`SagaCompensationFailed` conserva el fallo inicial, el de compensación, el tipo
de actividad y el orden determinista como diagnósticos estructurados.

### Workflows hijos {#child-workflows}

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

`execution_timeout_seconds` limita la ejecución lógica del hijo entre reintentos
y continue-as-new. `run_timeout_seconds` limita cada intento. La espera progresiva
de reintento se aplica tras fallar el hijo. Los comandos de inicio inválidos son
errores de protocolo y no se reintentan como intentos del hijo.

### Continue-as-new {#continue-as-new}

En workflows largos, usa continue-as-new para reiniciar el historial:

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

## Definir actividades {#defining-activities}

Las actividades son funciones asíncronas con `@activity.defn`. Pueden realizar
E/S libremente, a diferencia de los workflows.

```python
from durable_workflow import activity

@activity.defn(name="send_email")
async def send_email(to: str, subject: str, body: str) -> dict:
    # Activities can do I/O: HTTP calls, database queries, etc.
    response = await some_email_client.send(to=to, subject=subject, body=body)
    return {"message_id": response.id, "sent": True}
```

`name` es la clave compartida entre lenguajes. Un workflow PHP puede programar
`"send_email"` y un worker Python recogerla, y viceversa.

### Contexto de actividad {#activity-context}

Accede a metadatos y latidos dentro de la actividad con `activity.context()`:

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

### Errores no reintentables {#non-retryable-errors}

Lanza `NonRetryableError` para fallar sin reintentos:

```python
from durable_workflow import NonRetryableError

@activity.defn(name="validate")
async def validate(data: dict) -> dict:
    if "required_field" not in data:
        raise NonRetryableError("Missing required_field")
    return data
```

## Worker {#worker}

`Worker` se registra, sondea tareas y las despacha a tus implementaciones.

Para procesos separados de workflow y actividad, sigue la
[guía ejecutable de separación de procesos](https://python.durable-workflow.com/guides/separate-workers/).
Cubre registros separados, colas compartidas o distintas, reintentos, plazas por
rol y cierre ordenado.

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

Para comprobaciones básicas y ejemplos de un workflow,
`await worker.run_until(workflow_id="...", timeout=60.0)` registra el mismo worker
y lleva un workflow a estado terminal con sondeo secuencial. Usa `run()` en
workers desplegados que deban seguir sondeando.

| Parámetro | Predeterminado | Descripción |
|-----------|---------|-------------|
| `task_queue` | obligatorio | Cola que se sondea |
| `workflows` | `()` | Clases de workflow que se registran |
| `activities` | `()` | Funciones de actividad que se registran |
| `worker_id` | generado automáticamente | Identificador único |
| `poll_timeout` | `35.0` | Plazo de sondeo largo en segundos |
| `max_concurrent_workflow_tasks` | `10` | Máximo de tareas de workflow en paralelo |
| `max_concurrent_activity_tasks` | `10` | Máximo de tareas de actividad en paralelo |
| `shutdown_timeout` | `30.0` | Segundos para drenar tareas en curso al detener |
| `metrics` | registrador del cliente | Registrador opcional de contadores/histogramas de sondeos y tareas |
| `interceptors` | `()` | Envoltorios ordenados para instrumentación, trazas y políticas |

Los dos `max_concurrent_*` se anuncian al registrar y aparecen en diagnósticos de
admisión. Son capacidad local. Usa límites de
[admisión de colas](/docs/polyglot/task-queue-admission) en servidor para un
presupuesto compartido estricto de namespace, cola o dependencia entre workers.

### Referencia de la API de worker {#worker-api-reference}

| Método | Devuelve | Cuándo usarlo |
| --- | --- | --- |
| `await worker.run()` | `None` | Proceso de larga duración supervisado por systemd, Docker, Kubernetes o terminal local. Registra una vez y sondea workflows, actividades y consultas hasta detenerse o cancelarse. |
| `await worker.run_until(workflow_id=..., timeout=60.0, poll_interval=0.5)` | `WorkflowExecution` | Comprobaciones y ejemplos de un workflow conducido por el mismo proceso hasta estado terminal. |
| `await worker.stop()` | `None` | Cierre cooperativo: detiene sondeos nuevos y drena tareas hasta `shutdown_timeout`. |

`run()` valida compatibilidad antes de sondear. Exige que
`control_plane.version`, `control_plane.request_contract`, `worker_protocol.version`
y `auth_composition_contract` publicados coincidan con versiones admitidas por
el SDK. Manifiestos ausentes o incompatibles lanzan `RuntimeError` durante el
registro para que el supervisor detecte el fallo sin ejecutar un worker inseguro.

`run_until()` registra y despacha igual, pero sondea secuencialmente y devuelve
el `WorkflowExecution` final. Lanza `TimeoutError` si sigue no terminal al vencer.

Durante las tareas:

- tipos desconocidos se notifican al servidor como fallos de tarea, sin
  ocultarlos en registros locales
- `NonRetryableError` marca fallos de actividad no reintentables
- `ActivityCancelled` se propaga como cancelación
- excepciones no controladas se notifican como reintentables salvo que política
  o plazo del servidor indiquen lo contrario
- excepciones de consulta se notifican como `QueryFailed`

### Interceptores de worker {#worker-interceptors}

Pasa `interceptors=[...]` para trazas, métricas, auditoría o comprobaciones de
políticas locales alrededor de las tareas. Se ejecutan en el orden dado. El
primero envuelve al resto y debe llamar a `next` para continuar.

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

| Hook | Campos de contexto | Devuelve `next` |
| --- | --- | --- |
| `execute_workflow_task(context, next)` | `worker_id`, `task_queue`, `task` | comandos de workflow o `None` |
| `execute_activity(context, next)` | `worker_id`, `task_queue`, `task`, `activity_type`, `args` | resultado de actividad decodificado |
| `execute_query_task(context, next)` | `worker_id`, `task_queue`, `task` | cadena de resultado de consulta codificada |

Usa `PassthroughWorkerInterceptor` como base si solo necesitas un hook. Implementa
`WorkerInterceptor` directamente para que la comprobación de tipos exija todos.

## Registros {#logging}

El SDK usa `logging` estándar con nombres estructurados:

| Logger | Qué registra |
|-------------|--------------|
| `durable_workflow.worker` | Registro de workers, sondeos, finalización y errores |
| `durable_workflow.workflow.replay` | Eventos de reproducción (silencioso durante reproducción) |

### Configurar registros {#configuring-logging}

Establece el nivel en la entrada de la aplicación:

```python
import logging

# Show INFO-level worker events (registration, task completion)
logging.basicConfig(level=logging.INFO)

# Or configure specific loggers
logging.getLogger("durable_workflow.worker").setLevel(logging.DEBUG)
logging.getLogger("durable_workflow.workflow.replay").setLevel(logging.INFO)
```

### Niveles de registro {#log-levels}

- **INFO**: registro de workers, inicio/finalización de tareas y workflows
- **DEBUG**: cargas detalladas truncadas y ciclos de sondeo
- **WARNING**: errores reintentables, llamadas API fallidas y tipos desconocidos
- **ERROR**: fallos no reintentables y errores de reproducción

### Registros conscientes de la reproducción {#replay-aware-logging}

Usa `ctx.logger` dentro de workflows:

```python
@workflow.defn(name="order_processor")
class OrderProcessor:
    def run(self, ctx, order_id: str):
        ctx.logger.info("Processing order %s", order_id)  # Only logs during execution, not replay
        result = yield ctx.schedule_activity("process_order", [order_id])
        ctx.logger.info("Order processed: %s", result)
        return result
```

Los registros quedan **silenciados durante reproducción** para evitar duplicados
al recuperar o continuar la ejecución.

### Registros estructurados {#structured-logging}

Para JSON, configura un formateador JSON en el logger raíz de la aplicación:

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

## Métricas {#metrics}

`Client(metrics=...)` y `Worker(metrics=...)` aceptan registradores con dos métodos:

```python
def increment(name: str, value: float = 1.0, tags: dict[str, str] | None = None) -> None: ...
def record(name: str, value: float, tags: dict[str, str] | None = None) -> None: ...
```

El predeterminado no hace nada y no requiere configuración. Usa `InMemoryMetrics`
en pruebas o bucles exportadores propios:

```python
from durable_workflow import Client, InMemoryMetrics, Worker

metrics = InMemoryMetrics()

async with Client("http://localhost:8080", token="secret", metrics=metrics) as client:
    worker = Worker(client, task_queue="default", workflows=[GreeterWorkflow], activities=[greet])
```

Para Prometheus, instala el extra opcional y pasa `PrometheusMetrics`:

```bash
pip install 'durable-workflow[prometheus]'
```

```python
from durable_workflow import Client, PrometheusMetrics

metrics = PrometheusMetrics()
client = Client("http://localhost:8080", token="secret", metrics=metrics)
```

El SDK registra:

| Métrica | Tipo | Etiquetas |
|--------|------|------|
| `durable_workflow_client_requests` | Contador | `method`, `route`, `plane`, `status_code`, `outcome` |
| `durable_workflow_client_request_duration_seconds` | Histograma | `method`, `route`, `plane`, `status_code`, `outcome` |
| `durable_workflow_worker_polls` | Contador | `task_kind`, `task_queue`, `outcome` |
| `durable_workflow_worker_poll_duration_seconds` | Histograma | `task_kind`, `task_queue`, `outcome` |
| `durable_workflow_worker_tasks` | Contador | `task_kind`, `task_queue`, `outcome` |
| `durable_workflow_worker_task_duration_seconds` | Histograma | `task_kind`, `task_queue`, `outcome` |

## Programaciones {#schedules-1}

Crea y gestiona workflows programados desde el cliente:

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

## Cliente síncrono {#synchronous-client}

Para scripts, cuadernos y contextos no asíncronos, usa el envoltorio síncrono:

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

Refleja la API asíncrona, envolviendo cada llamada con `asyncio.run`.

## Gestión de errores {#error-handling}

El SDK mapea códigos del servidor a excepciones Python tipadas:

| Excepción | Cuándo ocurre |
|-----------|------|
| `WorkflowNotFound` | No existe el identificador de workflow |
| `WorkflowAlreadyStarted` | Identificador duplicado con política en conflicto |
| `WorkflowFailed` | Falló la ejecución |
| `WorkflowCancelled` | Cancelación del workflow (hereda de `BaseException`, no de `Exception`) |
| `WorkflowTerminated` | Terminación del workflow |
| `ActivityCancelled` | Cancelación durante la actividad (hereda de `BaseException`, no de `Exception`) |
| `ChildWorkflowFailed` | Falló un workflow hijo |
| `QueryFailed` | El manejador de consulta devolvió error |
| `UpdateRejected` | El workflow rechazó la actualización |
| `ScheduleNotFound` | No existe la programación |
| `ScheduleAlreadyExists` | Identificador de programación duplicado |
| `NamespaceNotFound` | No existe el namespace |
| `InvalidArgument` | Parámetros inválidos |
| `Unauthorized` | Falló la autenticación |
| `ServerError` | Error inesperado del servidor |

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

### La cancelación no se captura con `except Exception` deliberadamente {#cancellation-is-intentionally-uncatchable-by-except-exception}

`WorkflowCancelled` y `ActivityCancelled` heredan de `BaseException`, no de
`Exception`. Un `except Exception:` genérico en una actividad o al esperar
`client.get_result()` **no** las captura. La cancelación es un resultado de
control; ocultarla permitiría informar de éxito tras pedir detener la actividad.

Si necesitas limpieza local al cancelar una tarea, captura la clase por nombre
y vuelve a lanzarla. Esto no reanuda el workflow cerrado para compensarlo:

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

Sigue el precedente de `asyncio.CancelledError` y `KeyboardInterrupt` de la
biblioteca estándar.

## Pruebas {#testing}

El código de workflow se puede probar sin servidor ni worker activos.
`durable_workflow.testing` incluye dos entradas:

- `WorkflowEnvironment` lleva el workflow a término en un proceso con
  actividades simuladas registradas por el usuario.
- `replay_history` y `replay_history_file` reproducen historial capturado de
  producción contra el código actual y fallan ante no determinismo.

Ambas reutilizan `durable_workflow.workflow.replay`, igual que el worker, de
modo que el comportamiento del banco de pruebas coincide con el real.

### WorkflowEnvironment {#workflowenvironment}

Despacha comandos a simulaciones registradas y genera automáticamente
temporizadores, efectos secundarios y actualizaciones de atributos. No necesita
reloj real, Redis ni servidor.

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

| Método | Función |
| --- | --- |
| `register_activity_result(name, result)` | Devuelve `result` en cada llamada a `name` cuando no importan argumentos. |
| `register_activity(name, fn)` | Llama `fn(*arguments)` por invocación programada si debe variar según argumentos o registrar llamadas. |
| `register_child_workflow_result(workflow_type, result)` | Devuelve `result` al iniciar un hijo de ese tipo. |
| `signal(name, args=None, run=None)` | Encola una señal antes de la siguiente reproducción. Inyecta `SignalReceived` y llama al manejador `@workflow.signal`. `run=N` apunta al eslabón `N` de continue-as-new. |
| `register_workflow(workflow_cls)` | Permite resolver otra clase por nombre. Necesario si `continue_as_new(workflow_type=...)` usa otro tipo. |
| `execute_workflow(workflow_cls, *args, run_id="test-run")` | Lleva a estado terminal y devuelve resultado. Sigue continue-as-new hasta el final. Lanza `WorkflowFailed` si termina fallido. |
| `runs` / `run_count` | Tras ejecutar, expone un `WorkflowRunRecord` por eslabón (entrada, tipo, eventos y comando terminal) para comprobar toda la cadena. |

El banco de pruebas falla explícitamente si faltan datos simulados:

- actividad sin simulación registrada: `KeyError`
- hijo sin simulación registrada: `KeyError`
- workflow que no termina dentro del límite de iteraciones (por defecto `1000`):
  `RuntimeError`

Pasa `iteration_limit=...` a `WorkflowEnvironment(...)` para workflows que
necesiten legítimamente más iteraciones.

#### Simulaciones de actividad invocables {#callable-activity-mocks}

Usa `register_activity` para responder según argumentos o capturar llamadas:

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

#### Señales {#signals}

Las señales `env.signal(...)` se entregan antes de la siguiente reproducción.
La carga se envuelve en `{codec, blob}`, como en ejecución real, y se despacha
al manejador `@workflow.signal`:

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

#### Temporizadores, efectos secundarios y atributos de búsqueda {#timers-side-effects-and-search-attributes}

Se genera automáticamente el evento correspondiente para que las pruebas no
bloqueen por tiempo real:

- `ctx.sleep(seconds)` → `TimerFired`
- `ctx.side_effect(...)` → `SideEffectRecorded`
- `ctx.upsert_search_attributes(...)` → `SearchAttributesUpserted`
- marcadores `workflow.version(...)` → `VersionMarkerRecorded`

#### Cadenas continue-as-new {#continue-as-new-chains}

Cuando se devuelve `ctx.continue_as_new(...)`, se añade `WorkflowContinuedAsNew`
a la ejecución que termina, se reinicia el historial y comienza otra con los
argumentos del comando. `execute_workflow` devuelve el resultado terminal final.

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

Si cambia el tipo, registra primero la clase siguiente:

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

Dirige una señal a un eslabón concreto con `run=N`:

```python
env.signal("approve", ["alice"], run=2)  # delivered to the second run
```

`continue_as_new_limit` limita la longitud (por defecto `50`). Superarlo lanza
`RuntimeError` para detectar continuaciones descontroladas. Ajusta con
`WorkflowEnvironment(continue_as_new_limit=...)` si la cadena debe ser mayor.

#### Comprobaciones de fallos {#failure-assertions}

Las excepciones Python del workflow se presentan como `WorkflowFailed`:

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

### Pruebas de reproducción con historial de producción {#replay-testing-against-production-history}

Usa `replay_history` para probar regresiones contra historial real del servidor.
Ejecuta el código actual con la secuencia registrada y falla si produce un
comando distinto, que es la definición de un error de no determinismo.

```python
from durable_workflow import Client
from durable_workflow.testing import replay_history

async with Client("http://localhost:8080") as client:
    history = await client.get_history("order-42", run_id="...")

replay_history(OrderWorkflow, history["events"], start_input=["order-42"])
```

Un workflow completado debe seguir completándose con el mismo historial. Si
cambia el orden de actividades, se eliminan ramas o cambian tipos y diverge la
secuencia, `replay_history` falla para detectar la regresión en CI, no producción.

`replay_history_file` lee JSON con una lista de eventos superior o un diccionario
con clave `events`, como la respuesta de `get_history`:

```python
from durable_workflow.testing import replay_history_file

replay_history_file(
    OrderWorkflow,
    "tests/histories/order-42.json",
    start_input=["order-42"],
)
```

Ambas aceptan `payload_codec` opcional como indicación de validación. Omítelo
para usar la etiqueta registrada. La explícita o registrada debe ser `avro`.
Cargas duraderas `json`, desconocidas o sin etiqueta fallan antes de decodificar.

#### Reproductor basado en clases {#class-based-replayer}

Usa `Replayer` si una pasada prueba distintos tipos o debe dejar que
`WorkflowStarted` elija cuál reproducir. Registra todas las clases y llama
`replay(...)` por historial capturado:

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

`Replayer(workflows=[...])` rechaza un conjunto vacío o registros duplicados con
`ValueError`. `replay(...)` lanza `ValueError` ante tipos no registrados, o si
hay varios y no se proporciona `workflow_type` ni existe `WorkflowStarted`.

`ReplayOutcome.commands` es la misma lista que devuelven los auxiliares
`replay_history`. La clase permite compartir un registro entre muchos historiales.

### Referencia del banco de pruebas {#test-harness-reference}

| Símbolo | Función |
| --- | --- |
| `durable_workflow.testing.WorkflowEnvironment` | Banco de pruebas en proceso contra actividades e hijos simulados hasta completar. |
| `durable_workflow.testing.replay_history(workflow_cls, events, start_input=None, *, run_id="", payload_codec=None)` | Reproduce eventos contra código actual. Falla ante no determinismo. |
| `durable_workflow.testing.replay_history_file(workflow_cls, path, start_input=None, *, run_id="", payload_codec=None)` | Carga y reproduce JSON del disco: lista superior o diccionario con `events`. |
| `durable_workflow.Replayer(*, workflows=[...])` | Reproductor por clases. Registra una o más y llama `replay(history, start_input=None, *, workflow_type=None, workflow_id=None, run_id="", payload_codec=None)` por historial. Infiere `workflow_type` y `start_input` de `WorkflowStarted` si existe. |
| `durable_workflow.ReplayOutcome` | Dataclass devuelta por `Replayer.replay`. Lleva `commands: list[Command]`, los comandos que se emitirían a continuación. |
| `durable_workflow.errors.WorkflowFailed` | Lo lanza `execute_workflow` al terminar fallido. |
| `durable_workflow.errors.WorkflowCancelled` | Estado terminal por cancelación. Hereda de `BaseException`. |
| `durable_workflow.errors.WorkflowTerminated` | Estado terminal por terminación del servidor. Hereda de `BaseException`. |

## Códec de cargas {#payload-codec}

<div
  data-public-payload-codec-contract="avro-only"
  data-payload-codec="avro"
  data-authority-manifest="https://durable-workflow.github.io/sdk-neutrality-contract.json"
  data-legacy-v1-import-drain="none">
  Toda carga que cruza el protocolo de workers lleva etiqueta de códec.
  Durable Workflow 2.0 tiene un único códec público: <code data-payload-codec-field="codec">avro</code>.
  El SDK Python rechaza cargas duraderas etiquetadas JSON, desconocidas y sin
  etiqueta en vez de elegir otro decodificador. Consulta el <a href="/docs/polyglot/avro-value-protocol/">protocolo Avro Value</a>.
</div>

### Soporte Avro incluido {#avro-support-is-built-in}

El artefacto SDK 2.0 fijado incluye `fastavro` como dependencia de ejecución.
Todas las salidas (`start_workflow`, `signal_workflow`, `query_workflow`,
`update_workflow`, resultados de actividad y acciones de programación) emiten
cargas Avro por la ruta optimizada de producción. No hay un extra de códec opcional.

### Valores tipados fijos {#fixed-typed-values}

El SDK selecciona explícitamente ramas con nombre del esquema compartido
`durable_workflow.protocol.Value`, sin codificar JSON dentro de Avro. Enteros y
dobles, cadenas y bytes, booleanos y enteros, listas y mapas se mantienen
distintos entre SDK. Usa el encuadre Avro de objeto único y huella del esquema.
Las huellas desconocidas fallan con `unsupported_payload_schema`.

Todas las interfaces funcionan de principio a fin con Avro predeterminado:

- **Inicios, señales, consultas y actualizaciones:** `start_workflow`,
  `signal_workflow`, `query_workflow` y `update_workflow` emiten
  `payload_codec = "avro"` mediante Value fijo. Un cliente Python dirige
  workflows reproducibles por PHP y otros SDK y viceversa.
- **Worker de actividad:** decodifica argumentos Avro transparentemente y
  codifica resultados Avro para compartir un límite de carga entre lenguajes.
- **Fallos de actividad:** `fail_activity_task(..., details=...)` envía
  `failure.details` como `{codec, blob}`. El servidor registra el blob y
  `details_payload_codec`, conservando diagnósticos independientes del lenguaje
  en exportaciones y vistas.
- **Reproducción de historial:** decodifica entrada y resultados de actividad
  Avro para que workflows Python participen en ejecuciones Avro.
- **Tareas de consulta:** transportan argumentos de workflow y consulta e
  historial etiquetados Avro. El resultado también es un sobre Avro.

### Worker de actividad Python contra una ejecución v2 {#running-a-python-activity-worker-against-a-v2-run}

No hace falta configurar códec. Valida `payload_codec` antes de decodificar cada
reclamación, acepta solo `avro`, ejecuta y devuelve resultado Avro. Otras etiquetas
se rechazan con `unsupported_payload_codec`; nunca inspecciona ni adivina formatos.

### Tipos que conservan su valor entre Python y PHP {#types-that-round-trip-cleanly-across-python-and-php}

| Tipo Python | Rama Avro Value | Tipo PHP |
|-------------|------|----------|
| `str` | `StringValue` | `string` |
| `bytes` | `BytesValue` | `AvroBinaryValue` |
| `int` | `LongValue` | `int` |
| `float` | `DoubleValue` | `float` |
| `bool` | `BooleanValue` | `bool` |
| `None` | `null` | `null` |
| `list` | `ArrayValue` | `array` (lista) |
| `dict[str, ...]` | `MapValue` | `array` (mapa con claves de cadena) |

Adapta dataclasses, conjuntos, tuplas y objetos datetime a cadenas, enteros,
mapas o listas canónicos antes de usarlos como valores de workflow o actividad.

## Ejecutar contra un servidor compartido {#running-against-a-shared-server}

El [inicio rápido](#quickstart) muestra un servidor local con imagen publicada.
En equipo, normalmente apuntas el worker a un servidor existente de pruebas,
producción o desarrollo compartido:

```python
from durable_workflow import Client

client = Client(
    "https://workflow.example.internal",
    control_token="team-orders-operator-token",
    worker_token="team-orders-worker-token",
    namespace="team-orders",
)
```

Establece `namespace` con el provisionado para tu equipo y usa sus credenciales.
El operador de Server crea namespaces. Consulta la
[guía de Server](/docs/polyglot/server).

El mismo constructor sirve para Cloud. Usa su URL y namespace, `control_token`
con la credencial de cliente y `worker_token` con la de worker. Cloud provisiona
el namespace: no sustituyas por una dirección autogestionada. Consulta
[Entorno gestionado de Cloud](/docs/polyglot/cloud-control-plane).
