---
sidebar_position: 5
title: SDK de Rust
description: Instala el SDK oficial de Rust y encuentra su crate, código fuente y documentación generada de la API.
tags:
  - Rust
  - SDK
  - workers
  - polyglot
keywords:
  - sample-app-playground
  - SDK de Rust
  - crate durable-workflow
  - worker Rust
  - crates.io
---

import ProductPromotion from '@site/src/components/ProductPromotion';

# SDK de Rust {#rust-sdk}

Utiliza esta guía para la interfaz del SDK de acceso general y continúa en la referencia generada de la API para tipos y métodos concretos. No necesitas una cuenta Cloud: la ruta principal utiliza el crate Rust publicado con un Server autohospedado. Los desarrolladores ya inscritos en el acceso anticipado controlado de Durable Workflow Cloud pueden elegir la ruta separada del [inicio rápido de runtime gestionado](./rust-cloud-quickstart.md).

El SDK oficial de Rust permite crear workflows, además de ofrecer compatibilidad de protocolo. Rust permite escribir workflows deterministas, actividades y servicios de worker de larga duración con el mismo modelo de ejecución duradera que PHP y Python. El cliente asíncrono del plano de control inicia, señaliza, consulta, actualiza, cancela, termina y espera ejecuciones; el runtime del worker reproduce el historial, ejecuta manejadores de workflow/actividad/actualización, envía latidos de worker y actividad e intercambia cargas útiles independientes del lenguaje con Server autohospedado o un runtime de espacio de nombres de Cloud.

La [página principal de documentación de Rust](https://rust.durable-workflow.com/) ofrece el índice del SDK y los puntos de entrada generales. Para módulos, structs, traits y métodos del crate, continúa en la [referencia generada de la API del SDK de Rust](https://rust.durable-workflow.com/durable_workflow/).

El SDK estable de Rust admite temporizadores duraderos, workflows hijos, reintentos y tiempos de espera de actividades, actividades locales, sesiones de worker, ejecución sticky, señales, manejadores de consulta mediante reproducción, cancelación y terminación, plazos de workflow exigidos por el servidor, efectos secundarios tipados, marcadores de versión, actualizaciones y fallos tipados terminales y de reproducción. Todavía no ofrece gestión de programaciones. Consulta el [índice de capacidades de 2.0](/docs/capabilities/) en lugar de suponer que todos los SDK tienen el mismo alcance.

## Probar el entorno local de Sample App {#try-the-local-sample-app-playground}

Para la ruta de autoría más breve sin Cloud, abre la [rama `main` actual de Sample App en GitHub Codespaces](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main) y ejecuta:

<!-- docs-example id="sdk.rust.sample-app-playground" -->
```bash
scripts/playground rust
```

El entorno local genera código de workflow y actividad propiedad del usuario, selecciona los artefactos estables actuales e inicia Server y Waterline publicados. Antes de iniciar el workflow, espera un registro de worker cuya identidad, tipo de workflow, tipo de actividad y cola coincidan con el contrato generado. El éxito exige el resultado completado y el historial esperados; después el terminal imprime el enlace local exacto a la ejecución en Waterline y la ruta a la evidencia JSON estructurada.

Esta estructura inicial, pequeña y centrada en el transporte, utiliza `serde_json::Value`; no es el único contrato recomendado para aplicaciones Rust. Continúa con el [ejemplo de entrada/salida tipada](https://github.com/durable-workflow/sdk-rust/blob/main/examples/hello_world.rs), el [ejemplo de políticas de actividad para reintentos, tiempos de espera, latidos y fallos terminales](https://github.com/durable-workflow/sdk-rust/blob/main/examples/activity_options.rs) y el [ejemplo de actividad local](https://github.com/durable-workflow/sdk-rust/blob/3.1.0/examples/local_activities.rs) del crate. El paquete, el ejemplo del repositorio y la referencia generada siguen siendo las rutas directas para quienes no quieran Sample App.

## Paquete y código fuente {#package-and-source}

- [Crate en crates.io](https://crates.io/crates/durable-workflow)
- [Repositorio de código fuente](https://github.com/durable-workflow/sdk-rust)

Instala el SDK de Rust de la última combinación de artefactos cualificada satisfactoriamente. El requisito exacto se genera desde la misma autoridad legible por máquinas que el inicio rápido de Server:

<!-- docs-example id="rust.sdk.install" -->
```bash
%%artifact.rustCargoAddCommand%%
```

O declara el mismo requisito cualificado directamente en `Cargo.toml`:

```toml
[dependencies]
%%artifact.rustCargoRequirement%%
```

El crate requiere Rust 1.86 o posterior. Sus metadatos registran la versión de Server utilizada para cualificar esa versión del SDK, el protocolo de workers predeterminado y mínimo y el plano de control 2. La compatibilidad con un Server posterior se verifica por separado. Durante el despliegue, utiliza los manifiestos de protocolo y las capacidades anunciadas por `GET /api/cluster/info`.

Server negocia las cabeceras del protocolo de workers dentro de la versión principal `1`: si anuncia `1.N`, solo acepta una cabecera de worker `1.M` cuando `M <= N`. El SDK de Rust 3.5.0 utiliza por defecto `X-Durable-Workflow-Protocol-Version: 1.20` y exige un servidor que anuncie `1.20` o posterior. Para un Server anterior compatible, selecciona `WorkerProtocolVersion::V119` mediante `worker_protocol_version` en el builder del cliente. El SDK 3.4.x utiliza `1.19` por defecto. El perfil opcional de cancelación cooperativa exige `1.20` y rechaza una selección explícita de `1.19`.

La negociación rechaza las incompatibilidades. Se rechaza una cabecera ausente o malformada, otra versión principal o una versión menor del worker superior a la anunciada por el servidor. Las versiones del SDK y de Server se gestionan por separado. Sus manifiestos de protocolo en runtime determinan la compatibilidad.

## Listas de workflows e historial completo de una ejecución {#workflow-lists-and-history}

Estas API requieren Rust SDK **4.6.0 o posterior**; revise `Cargo.lock`, pues la combinación de instalación anterior puede seleccionar un crate más antiguo. La [aceptación del paquete instalado normalmente](https://github.com/durable-workflow/sdk-rust/issues/122#issuecomment-6363352910) verifica tres páginas de lista, seis de historial, un payload de 128 KiB, exportación/reproducción y el ejemplo de solo lectura con Server 2.11.0 publicado. Las pruebas sin servidor requieren 4.5.0; estos métodos e iteradores de listas/historial requieren 4.6.0. La combinación seleccionada de Server/SDK no cambia.

`Client::list_workflows(WorkflowListOptions)` y `Client::get_workflow_history(workflow_id, run_id, WorkflowHistoryOptions)` devuelven **una página** cada uno. Continúe manualmente con su `next_page_token` opaco, o use iteradores perezosos para lecturas completas. Conservan validación, filtros y namespace del Server; no añaden campos ni gramática de consulta. Por ejemplo, busque una ejecución abierta con un atributo keyword registrado:

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

El filtro `status=running` del Server selecciona el **grupo de estados** activo, incluidos los estados originales `pending` y `waiting`. `WorkflowSummary` conserva `status`, `status_bucket`, `is_terminal`, atributos de búsqueda y metadatos desconocidos en `raw`. Los atributos no son únicos: el filtro puede encontrar un padre y los hijos que heredaron su valor. Gestione cero, uno y varios resultados como arriba. Cree el cliente con el namespace deseado antes del iterador; namespace y filtros permanecen fijos entre tokens.

Lea toda una ejecución seleccionada sin cargar todas las páginas a la vez:

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

`iter_workflows(options)` entrega cada `WorkflowSummary` mediante `next().await`. Ambos iteradores admiten `into_stream()` para `futures_util::TryStreamExt`; fije el stream antes de sondearlo. Construirlo no realiza I/O; obtiene otra página solo al agotar la actual. Un token nulo/vacío termina; una página vacía con token continúa. Los tokens repetidos o cíclicos devuelven `Error::Pagination` con estado acotado. Un fallo de página conserva el error tipado original y después termina ese iterador. Gestione el error: una lectura parcial no es completa. Recopilar un stream almacena todos los elementos recopilados.

El historial mantiene la identidad original de workflow/ejecución y enumera eventos disponibles; no sigue continue-as-new ni se suscribe indefinidamente. Conserva metadatos y sobres de payload. Para reproducción sin servidor use `Client::export_workflow_history` con `testing::WorkflowHistory::from_export`, en lugar de una página parcial. Véase [reproducción sin servidor](#rust-replay-export).

Server 2.11 publicado usa por defecto 50 filas de lista (máximo 200) y 100 eventos de historial (máximo 1.000) por página. Envía los tamaños sin modificar para validación del Server. Deténgase cuando tenga suficientes resultados, elija un tamaño adecuado y aplique un timeout de aplicación. La paginación no añade aislamiento de instantánea ante cambios concurrentes. Véanse el [ejemplo publicado de solo lectura](https://github.com/durable-workflow/sdk-rust/blob/4.6.0/examples/workflow_pagination.rs), [API Client](https://rust.durable-workflow.com/durable_workflow/struct.Client.html) y [tipos de paginación](https://rust.durable-workflow.com/durable_workflow/pagination/index.html).

## Métricas y exportación a Prometheus {#rust-sdk-metrics}

Estas API requieren Rust SDK **4.7.0 o posterior**. Revise `Cargo.lock`: la combinación de instalación anterior puede seleccionar un crate más antiguo. La [aceptación instalada normalmente](https://github.com/durable-workflow/sdk-rust/pull/131#issuecomment-6364178456) verifica cuatro controles HTTP, las seis métricas de un worker real con Server 2.11.0 publicado y el ejemplo de exportación. Este mínimo no cambia la combinación seleccionada.

El recorder predeterminado es **no-op**. Proporcione un `Arc<dyn metrics::MetricsRecorder>` con `increment(name, count, tags)` y `record(name, seconds, tags)`. Cliente, clones y nuevos workers lo heredan. `Worker::metrics_recorder` sustituye las observaciones poll/task del worker; las peticiones conservan el recorder del cliente. Los callbacks deben ser rápidos y gestionar localmente fallos del exporter. Los pánicos con unwinding se aíslan de los resultados del SDK; el hook no corrige exporters bloqueantes ni abortos del proceso.

Cada petición, poll o despacho de tarea obtenida incrementa un contador en uno y registra una duración monotónica no negativa en segundos. Los seis nombres estables son:

| Contador | Histograma de duración |
| --- | --- |
| `durable_workflow_client_requests` | `durable_workflow_client_request_duration_seconds` |
| `durable_workflow_worker_polls` | `durable_workflow_worker_poll_duration_seconds` |
| `durable_workflow_worker_tasks` | `durable_workflow_worker_task_duration_seconds` |

Las claves del cliente son exactamente `method`, `route`, `plane`, `status_code`, `outcome`; las del worker, `task_kind`, `task_queue`, `outcome`. Los patrones revisados de rutas excluyen ID, consultas, payloads y credenciales; rutas desconocidas usan `unknown`. Las colas dependen de la aplicación: use un conjunto acotado, no una por ejecución.

Los resultados del cliente incluyen `ok`, `http_error`, `bridge_rejected`, `TransportError`, `TimeoutError`, `SdkError` y `pending` para un future cancelado. `status_code` conserva el estado HTTP decimal observado, o `none`. Los nombres de excepciones Rust no tienen que coincidir con otros SDK.

Una observación del cliente incluye reintentos internos de transporte/storage admission y manejo de respuesta/payload; llamadas separadas de aplicación/worker se observan por separado. El iterador perezoso observa cada página solicitada. Los polls incluyen retry/backoff gestionados y distinguen `task`, `empty`, `backpressure`, `error`. Los resultados de tarea `completed`, `failed`, `expired` describen el despacho, no el estado terminal del workflow. Son observaciones del proceso, no contadores duraderos, unidades facturables ni latencia schedule-to-start; la pérdida abrupta del proceso puede omitir la muestra final.

Para el adaptador oficial de Prometheus, active el feature opcional Cargo `metrics-prometheus`. El ejemplo usa la receta publicada de dependencias:

```toml
[dependencies]
durable-workflow = { version = "=4.7.0", features = ["metrics-prometheus"] }
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

Guarde el [ejemplo publicado](https://github.com/durable-workflow/sdk-rust/blob/4.7.0/examples/metrics_prometheus.rs) como `examples/metrics_prometheus.rs`. Estos bytes exactos se compilaron y ejecutaron en la aceptación instalada; el ejemplo imprime métricas de una petición de salud:

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

Ejecútelo con su Server autohospedado:

```bash
DURABLE_WORKFLOW_SERVER_URL=http://localhost:8080 \
DURABLE_WORKFLOW_AUTH_TOKEN=your-token \
cargo run --features metrics-prometheus --example metrics_prometheus
```

`PrometheusMetrics::new()` posee un registro dedicado basado en el cliente oficial Prometheus Rust 0.14. Sirva los bytes de `encode()` desde la ruta de métricas de su aplicación con `Content-Type: text/plain; version=0.0.4`. El adaptador no crea listener ni registro global. La aplicación controla acceso/autenticación de scrape, exposición de red, recursos y cierre. Los contadores añaden `_total`; histogramas usan series bucket/sum/count. `registry()` permite colección propia y métricas adicionales.

Para métricas OpenTelemetry, implemente el recorder con su meter existente: contadores de unidad `1` e histogramas de segundos `s`, con nombres/tags exactos. Provider, agregación, etiquetas de recursos y ciclo del exporter pertenecen a la aplicación. Es independiente del tracing de ejecución. Véanse la [API recorder](https://rust.durable-workflow.com/durable_workflow/metrics/trait.MetricsRecorder.html), [API Prometheus](https://rust.durable-workflow.com/durable_workflow/metrics/struct.PrometheusMetrics.html) y [contrato publicado](https://github.com/durable-workflow/sdk-rust/blob/4.7.0/README.md#client-and-worker-metrics).

## Concurrencia de tareas del worker {#worker-task-concurrency}

Los carriles acotados descritos aquí requieren Rust SDK **4.3.1 o posterior**. Compruebe la versión de `Cargo.lock`: la instalación fijada arriba pertenece a otra tupla cualificada y puede seleccionar un SDK anterior. La [verificación del paquete publicado](https://github.com/durable-workflow/sdk-rust/issues/107#issuecomment-6360719863) confirma tres slots configurados, una cuarta llamada admitida al liberarse uno, y siete workflows completados, incluido un fallo de actividad manejado. Siguen vigentes los requisitos de protocolo del Server descritos arriba.

`Worker::max_concurrent_workflow_tasks(...)` y `Worker::max_concurrent_activity_tasks(...)` tienen un valor predeterminado de **10** cada uno. `run()` y `run_until()` usan carriles independientes y acotados para workflow y actividad remota. Configure **1** para ejecución secuencial dentro de esa familia de tareas. Por ejemplo, configure un cliente existente antes de registrar sus handlers:

```rust
use durable_workflow::Worker;

let mut worker = Worker::new(client.clone(), "payments")
    .max_concurrent_workflow_tasks(1)
    .max_concurrent_activity_tasks(1);
```

Registre los handlers y después inicie `run()` o `run_until()` normalmente. Dos límites de uno aún permiten ejecutar simultáneamente una tarea de workflow y una actividad remota. Las consultas mantienen su carril de polling separado. Los clones comparten la capacidad configurada, incluso entre llamadas simultáneas a `run_once()`; clonar no crea otro cupo independiente.

La disponibilidad anunciada en heartbeats sigue las tareas realmente reclamadas, incluida la carga de entrada/historial, la ejecución y la confirmación. Un long poll vacío deja capacidad disponible. Éxito, fallo, negativa y cancelación liberan el slot local. Las actividades locales inline ocupan su slot de **tarea de workflow** y evitan el pool remoto; el límite de actividades no acota por separado la ejecución inline entre workflows.

Los handlers son futures async de Tokio y deben ceder el control. Use `tokio::task::spawn_blocking` o un proceso separado para trabajo bloqueante, con límites explícitos de cancelación y apagado. Aumentar concurrencia no aísla CPU ni hace cancelable un thread desacoplado. Consulte la [API de Worker](https://rust.durable-workflow.com/durable_workflow/struct.Worker.html) del SDK instalado.

## Presupuestos de reintento recibidos por la actividad {#activity-retry-info}

Rust SDK **4.8.0 o posterior** ofrece `ActivityContext::retry_info()` en los manejadores de actividades del servicio. Comprueba el crate instalado en `Cargo.lock`: la versión de instalación seleccionada por separado arriba puede ser anterior. El `ActivityRetryInfo` devuelto conserva el `attempt_number()` original y el JSON de `policy()` recibido, incluidos los campos desconocidos. Es una instantánea inmutable de esta invocación, independiente de los campos de compatibilidad mutables del contexto.

Usa `attempt_limit()` e `is_last_configured_attempt()` para interpretar el presupuesto recibido:

| Política de reintento recibida | `ActivityAttemptLimit` | Último intento configurado |
| --- | --- | --- |
| Objeto con entero positivo `max_attempts: n` | `Bounded(n)`, incluido el primer intento | `Some(true)` cuando el intento original alcanza o supera `n`; en otro caso, `Some(false)` |
| Objeto con `max_attempts: null` | `Unlimited` | `Some(false)` |
| Política omitida, null raíz, campo ausente o límite inválido | `Unknown` | `None` |

El helper también devuelve `None` ante un número de intento cero inválido. El valor predeterminado de planificación del runtime no demuestra los metadatos recibidos: el control publicado de Server 2.11.0 sin política escrita omite la instantánea y devuelve `Unknown`, sin inferir `Bounded(1)`. `policy()` distingue una política omitida de un JSON null recibido sin interpretar ninguno como ilimitado. La [aceptación con instalación normal](https://github.com/durable-workflow/sdk-rust/issues/135#issuecomment-6366200791) incluye este control y la receta siguiente.

Para elegir una alternativa o registrar una alerta de aplicación en el último intento configurado, registra un manejador en tu Worker existente:

```rust
use durable_workflow::{json, Worker};

pub fn register_charge(worker: &mut Worker) {
    worker.register_activity("charge", |ctx, _| async move {
        let retry = ctx.retry_info();
        if retry.is_last_configured_attempt() == Some(true) {
            // Select a final-attempt fallback or record an application alert.
        }
        Ok(json!({"attempt": retry.attempt_number()}))
    });
}
```

`Some(false)` no promete otra ejecución. Un fallo no reintentable, la cancelación, el cierre del workflow y los plazos agotados pueden terminar el trabajo antes de consumir el presupuesto configurado. El helper no cambia la admisión de reintentos ni concede tiempo adicional.

Las actividades locales y las llamadas directas a `testing::WorkflowEnvironment::run_activity` no tienen una instantánea recibida del Server y devuelven política desconocida. Las pruebas nuevas con `run_workflow` exponen la instantánea modelada que registran en su historial generado. Esta semántica de pruebas no demuestra que un Server desplegado envíe una política. Consulta [ActivityRetryInfo](https://rust.durable-workflow.com/durable_workflow/struct.ActivityRetryInfo.html) y [ActivityAttemptLimit](https://rust.durable-workflow.com/durable_workflow/enum.ActivityAttemptLimit.html).

## Actividades locales {#local-activities}

El SDK de Rust 3.1.0 añade ejecución local en el propio worker con `Worker::local_activities(true)`. Registra callbacks con los métodos ordinarios de registro de actividades y utiliza los métodos de actividad local del contexto de workflow. Consulta el [ejemplo ejecutable](https://github.com/durable-workflow/sdk-rust/blob/3.1.0/examples/local_activities.rs) y la [referencia de LocalActivityOptions](https://rust.durable-workflow.com/durable_workflow/struct.LocalActivityOptions.html) para configurar reintentos y tiempos de espera.

Server registra el resultado terminal para reproducir desde cero. Los efectos locales sin confirmar pueden repetirse tras perder el worker y deben ser idempotentes. Los callbacks asíncronos deben ceder el control a Tokio. El trabajo bloqueante necesita supervisión en procesos separados. La ejecución local en línea y la supervisión local cooperativa preparada utilizan perfiles de worker separados.

## Sesiones de worker {#worker-sessions}

Habilita `Worker::worker_sessions(true)` y declara los requisitos que satisface el worker mediante `capabilities(...)`. Enruta actividades remotas con `in_worker_session(WorkerSessionOptions::new(session_id))`. El contexto de actividad proporciona el handle compartido mediante `worker_session()`. Los handles explícitos admiten `create()`, `renew()` y `close(reason)` después del registro del worker.

Limita el número de sesiones con `max_concurrent_worker_sessions(...)` y la concurrencia de sus actividades con `max_concurrent_activities(...)`. Renueva explícitamente los handles inactivos. Los latidos de actividad también renuevan la lease del titular, conservando el TTL absoluto original. Un callback asíncrono que ceda el control a Tokio se descarta cuando vence la lease o TTL observado localmente, sin requerir latidos de la aplicación.

Los recursos de sesión viven en el proceso titular. Su sustituto debe reconstruirlos, y los efectos externos interrumpidos necesitan idempotencia y exclusión de intentos antiguos. Los resultados confirmados se reproducen sin repetir el callback. El apagado ordenado cierra las sesiones antes de dar de baja al worker. Las actividades locales no pueden usar enrutamiento de sesiones.

Las sesiones se admiten desde el SDK de Rust 3.2.0. Utiliza Server 2.5.1 o posterior. El [ejemplo ejecutable](https://github.com/durable-workflow/sdk-rust/blob/3.2.0/examples/worker_sessions.rs) reutiliza una caché local del proceso entre dos actividades tipadas e imprime su generación. Consulta [WorkerSessionOptions](https://rust.durable-workflow.com/durable_workflow/struct.WorkerSessionOptions.html) y [WorkerSession](https://rust.durable-workflow.com/durable_workflow/struct.WorkerSession.html) para configuración y métodos del ciclo de vida.

## Ejecución sticky acotada {#bounded-sticky-execution}

Habilita `Worker::sticky_cache(StickyCacheOptions::new(capacity))` para conservar historial codificado inmutable para posteriores reproducciones. La caché está deshabilitada por defecto. Configura `max_history_bytes(...)` y `ttl(...)` para acotar el historial retenido y su duración. Reserva memoria adicional para decodificación y reproducción.

La caché utiliza la identidad de workflow, ejecución y compilación. Sustituir el worker, el vencimiento, el desalojo o un cursor de historial no válido provocan la lectura del historial duradero completo. Los workflows terminales y los workers detenidos descartan sus entradas. El código del workflow debe reproducirse correctamente con la caché vacía.

Se admite desde el SDK de Rust 3.4.0 y la base cualificada de Server. Consulta la [referencia de configuración](https://rust.durable-workflow.com/durable_workflow/struct.StickyCacheOptions.html), el [ejemplo ejecutable](https://github.com/durable-workflow/sdk-rust/blob/3.4.0/examples/sticky_execution.rs) y la [guía de afinidad portable de workers](./portable-worker-affinity.md).

## Preparar el ejemplo publicado del repositorio {#prepare-the-released-repository-example}

El [ejemplo `hello_world`](https://github.com/durable-workflow/sdk-rust/blob/main/examples/hello_world.rs) registra un worker Rust, inicia un workflow, envía una señal, ejecuta una actividad, comunica un latido de actividad y espera el resultado completado. Como ejecuta cliente y worker en un proceso, la ruta sin cuenta siguiente lo conecta a Server autohospedado. Un espacio de nombres aprovisionado de Cloud es un runtime secundario opcional con credenciales separadas por rol.

Para un ejercicio reproducible, obtén el código exacto del crate registrado en la combinación cualificada. El valor siguiente se genera desde esa autoridad legible por máquinas. El directorio del ejemplo es absoluto para que ambas rutas de conexión puedan acceder directamente:

<!-- docs-example id="rust.sdk.repository-source" -->
```bash
export DURABLE_WORKFLOW_RUST_VERSION=%%artifact.rustSdkVersion%%
export DURABLE_WORKFLOW_RUST_EXAMPLE_DIR="$PWD/durable-workflow-rust-${DURABLE_WORKFLOW_RUST_VERSION}"
git clone --depth 1 --single-branch --branch "$DURABLE_WORKFLOW_RUST_VERSION" \
  https://github.com/durable-workflow/sdk-rust.git "$DURABLE_WORKFLOW_RUST_EXAMPLE_DIR"
```

## Ejecutar el ejemplo combinado con Server autohospedado {#run-the-combined-example-with-self-hosted-server}

El ejemplo `hello_world` sin modificar acepta un token para un Durable Workflow Server autohospedado cuya política de autenticación permita a la misma credencial enviar comandos de workflow y sondear trabajo:

<!-- docs-example id="rust.sdk.self-hosted" -->
```bash
cd "$DURABLE_WORKFLOW_RUST_EXAMPLE_DIR"
DURABLE_WORKFLOW_SERVER_URL=http://localhost:8080 \
DURABLE_WORKFLOW_TOKEN=dev-token \
cargo run --example hello_world
```

El ejemplo utiliza el espacio `default` aprovisionado por el inicio rápido local de Server. Utiliza `TASK_QUEUE` para sustituir su cola predeterminada `rust-workers`. Esta ruta no requiere inscripción ni credenciales de Cloud.

## Ruta secundaria opcional: conectar a Durable Workflow Cloud {#optional-secondary-path-connect-to-durable-workflow-cloud}

Para la prueba más breve de runtime gestionado, utiliza el [inicio rápido de Rust con Cloud](./rust-cloud-quickstart.md). Ejecuta el mismo entorno simétrico de Sample App disponible para PHP y Python, selecciona dinámicamente los artefactos estables, verifica la preparación exacta del worker y espera un resultado completado.

<ProductPromotion source="docs-v2-rust-sdk">
¿Ya estás inscrito en Cloud? Ejecuta el entorno compartido de Rust contra tu
espacio de nombres aprovisionado con credenciales de runtime separadas por rol.
</ProductPromotion>

El ejemplo combinado de SDK de nivel inferior siguiente resulta útil al adaptar un proceso Rust existente. Exporta los valores devueltos cuando Cloud aprovisiona el espacio de nombres y crea sus dos credenciales de runtime:

Consulta [Runtime gestionado de Cloud](/docs/polyglot/cloud-control-plane) para el límite de conexión gestionada.

<!-- docs-example id="rust.sdk.cloud.environment" -->
```bash
export DURABLE_WORKFLOW_RUNTIME_URL='https://your-runtime-url'
export DURABLE_WORKFLOW_RUNTIME_NAMESPACE='orders'
export DURABLE_WORKFLOW_CLIENT_TOKEN='dwr_client_credential'
export DURABLE_WORKFLOW_WORKER_TOKEN='dwr_worker_credential'
```

En `$DURABLE_WORKFLOW_RUST_EXAMPLE_DIR/examples/hello_world.rs`, sustituye la configuración existente de `server_url`, `token` y `Client::builder(...)` por este builder con tokens separados:

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

Después ejecuta el ejemplo normalmente:

<!-- docs-example id="rust.sdk.cloud.run" -->
```bash
cd "$DURABLE_WORKFLOW_RUST_EXAMPLE_DIR"
cargo run --example hello_world
```

Las llamadas de inicio, señal, descripción y resultado del ejemplo utilizan `control_token`; las de registro de `Worker`, sondeo, latidos y finalización utilizan `worker_token`. Ambos roles usan la misma URL de runtime, espacio de nombres y cola proporcionados por Cloud, pero no comparten credencial. No sustituyas ninguna credencial Cloud por `.token(...)`: es la alternativa genérica de token único utilizada en la configuración autohospedada anterior.

## Iniciar con tiempos de espera exigidos por el servidor {#start-with-server-enforced-workflow-timeouts}

El SDK de Rust ofrece `WorkflowStartOptions` y `Client::start_workflow_with_options` para plazos de workflow que el servidor exige incluso después de que termine el proceso iniciador. El tiempo de espera de ejecución cubre toda la instancia, incluidas las ejecuciones de continuar como nuevo; el tiempo de espera de una ejecución cubre solo esa ejecución y se recalcula al comenzar otra.

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

Ambos valores se expresan en segundos, deben ser positivos y el tiempo de espera de una ejecución no puede superar al de la instancia completa. El método auxiliar existente `Client::start_workflow` utiliza `WorkflowStartOptions::default()`: 3600 segundos para la instancia y 600 segundos para una ejecución. Consulta [Tiempos de espera](/docs/features/timeouts) para los plazos del servidor y la semántica de continuar como nuevo.

Son políticas de workflow, no tiempos de espera HTTP ni de sondeo de resultados. En particular, `WorkflowResultOptions::timeout` solo detiene la espera de la llamada local `result()`. No cierra, cancela ni modifica la ejecución. Quien llama puede inspeccionar la identidad devuelta y volver a esperar. Un plazo configurado con `WorkflowStartOptions` es estado duradero del servidor; al vencer, el servidor cierra la ejecución con resultado terminal `timed_out`.

## Grupos paralelos deterministas {#deterministic-parallel-groups}

`WorkflowContext::parallel` y su alias `join` componen actividades, workflows hijos, temporizadores, grupos mixtos y grupos anidados sin añadir comandos nuevos de Server. Los constructores de `ParallelOperation` difieren cada hoja hasta conocer el árbol completo:

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

Cada hoja contiene la identidad estable compartida del grupo y su ruta completa de fuera hacia dentro. Los resultados satisfactorios conservan la estructura y el orden anidados de entrada. `Error::ParallelFailed` conserva la causa tipada de la hoja, la ruta determinista del miembro, la ruta del grupo y los hermanos completados. Los historiales pendientes y completados se reproducen sin reprogramar; los duplicados exactos y las finalizaciones tardías no cambian el resultado posicional elegido.

## Selección duradera de la primera finalización {#durable-first-completion-selection}

`WorkflowContext::select` y `select_keyed` inician conjuntamente actividades, workflows hijos, temporizadores, señales, esperas de condición y grupos ordinarios anidados, y continúan desde el ganador registrado por el runtime:

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

`SelectionResult` conserva clave/índice estable, tipo e identidad de operación, valor o fallo tipado y un `DurableOperationHandle` por miembro. Un miembro que no gana continúa salvo que el workflow espere posteriormente `handle.await_result()` o `handle.cancel()`. El futuro de cancelación devuelve unit; solo el historial confirmado `SelectionOperationCancelled` demuestra que ganó la cancelación. La reproducción avanza más allá de una solicitud sin marca y `await_result()` sigue devolviendo una finalización confirmada antes. El reinicio y la reproducción consumen el ganador persistido; los eventos terminales posteriores o duplicados no lo cambian.

## Compensación de sagas {#saga-compensation}

Registra una compensación solo cuando haya terminado la actividad de avance correspondiente y pasa el resultado de avance a `Saga::finish`:

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

Un fallo manejado ejecuta el comando de actividad existente en orden inverso de registro, una compensación a la vez. La compensación se detiene en su primer fallo. `Error::SagaCompensationFailed` conserva ambos errores tipados, el tipo de actividad de compensación y su orden de registro durante reinicio y reproducción. La operación terminal `cancel_workflow` no reanuda el código para ejecutar compensaciones.

## Efectos secundarios deterministas y marcadores de versión {#deterministic-side-effects-and-version-markers}

El SDK de Rust registra valores no deterministas pequeños con `WorkflowContext::side_effect` y deriva UUIDv4 deterministas con `WorkflowContext::uuid_v4`. Una reproducción desde cero decodifica el valor registrado sin volver a invocar el callback; marcadores reordenados, ausentes, duplicados o incompatibles con el códec devuelven `Error::NonDeterministicReplay` tipado.

Utiliza `WorkflowContext::get_version(change_id, min_supported, max_supported)` para mantener compatibles con la reproducción las ramas antiguas y nuevas durante un despliegue. Las ejecuciones nuevas registran `max_supported`; las existentes reutilizan el marcador duradero. `patched(change_id)` ofrece la forma booleana del despliegue y `deprecate_patch(change_id)` conserva el marcador tras finalizar la rama heredada. Consulta [Efectos secundarios](/docs/features/side-effects/) y [Versionado](/docs/features/versioning/) para la semántica duradera compartida.

## Reglas de determinismo de Rust {#rust-determinism-rules}

Una reproducción debe generar los mismos comandos duraderos, en el mismo orden, para la entrada y el historial registrados. Las colecciones, relojes y primitivas de concurrencia normales de Rust no mantienen automáticamente ese contrato:

| Patrón en el código del workflow | Sustitución duradera |
| --- | --- |
| Programar mientras se recorre un `HashMap` | Ordene primero las claves o use un `BTreeMap`. |
| Leer el reloj, `thread_rng` o un UUID nuevo | Registre una instantánea con `ctx.side_effect(...)` o use una actividad. |
| `tokio::time::sleep` o `std::thread::sleep` | `ctx.sleep(...)` o `ctx.start_timer(...)`. |
| `tokio::select!` o carreras de futuros normales | `ctx.select(...)` o `ctx.select_keyed(...)`. |
| Llamadas duraderas concurrentes sin seguimiento | `ctx.parallel(...)` con un orden estable de entrada. |
| Red, archivos o E/S externa mutable | Una actividad registrada. |
| Cambiar el orden de comandos existentes al desplegar | Una rama estable de `ctx.get_version(...)`, probada con el historial registrado. |

Los efectos externos de las actividades aún deben ser idempotentes; el determinismo no hace seguro repetir un pago o una escritura. Consulte [idempotencia y determinismo](../constraints/idempotent-vs-deterministic.md).

## Pruebas sin conexión y reproducción {#offline-testing-and-replay}

Estas API requieren Rust SDK **4.5.0 o posterior**. Compruebe `Cargo.lock`: la combinación de instalación independiente anterior puede seleccionar un crate más antiguo sin ellas. La [validación de la instalación normal de 4.5.0](https://github.com/durable-workflow/sdk-rust/issues/105#issuecomment-6362112580) verifica doce controles sin Server, este ejemplo compilado y exportación/reproducción de un Server 2.11.0 real. No promueve una nueva combinación Server/SDK.

### Pruebas unitarias de actividades y workflows {#rust-activity-workflow-tests}

`testing::WorkflowEnvironment` ejecuta workflows y actividades registrados en el proceso actual. Use `from_worker(worker)` para reutilizar los registros de la aplicación o registre callbacks directamente; `worker_mut()` expone las API tipadas habituales de registro. Los mocks son explícitos: los callbacks reales ejecutan su código, así que sustituya deliberadamente los efectos externos.

Use `durable-workflow = "=4.5.0"` para la receta verificada, Tokio con `macros`, `rt-multi-thread` y `time`, y `serde_json = "1"` para el helper de exportación siguiente. Guarde el ejemplo publicado como `examples/workflow_testing.rs` y ejecute `cargo run --example workflow_testing`:

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

`run_activity` directo ejecuta un intento. En `run_workflow`, la política de reintentos registrada se aplica antes de entregar un fallo definitivo al workflow. Los fallos reales o simulados de actividades remotas/locales usan `Error::ActivityFailed` tipado, con tipo de excepción, número de intento y marca no reintentable; un error de workflow no capturado conserva su variante Rust original. Los heartbeats se capturan localmente. Use las variantes `*_avro_value` cuando JSON no pueda conservar el valor Avro original.

### Reproducir una ejecución exportada {#rust-replay-export}

Registre el workflow candidato y cargue un bundle JSON completo de `dw workflow:history-export` o `Client::export_workflow_history(workflow_id, run_id).await?`. Añada este helper al ejemplo anterior; usa esos imports y espera un fixture completado:

```rust
fn replay(env: WorkflowEnvironment) -> std::result::Result<(), Box<dyn std::error::Error>> {
let export = serde_json::from_slice(&std::fs::read("workflow-history.json")?)?;
let history = WorkflowHistory::from_export(export)?;
let report = env.replay(&history)?;
assert!(report.completed); // A running snapshot can remain durably pending.
Ok(())
}
```

Para el historial sin procesar, combine **todas las páginas** y use `WorkflowHistory::from_history("hello", original_input, response)`, aportando la cola original cuando falte. Conserve la entrada y los resultados registrados; se rechazan payloads podados/redactados, referencias externas sin resolver y tokens de página restantes. El helper de exportación resuelve las referencias al descargar. La reproducción no contacta con Server ni ejecuta callbacks de actividad.

La reproducción usa las rutas del worker para decodificación, efectos laterales, marcadores de versión y resoluciones select registradas. Los comandos cambiados o reordenados devuelven `Error::NonDeterministicReplay(ReplayFailure)` con `sequence`, `expected` y `actual`; el control instalado sobre una exportación real detecta una actividad cambiada en la secuencia 3. Los comandos nuevos más allá de la instantánea también fallan. Una instantánea abierta puede mostrar un prefijo pendiente duradero en vez de completarse: compruebe el resultado esperado y pruebe ramas nuevas con ejecuciones nuevas en el proceso y pruebas de integración. Consulte los [controles publicados de reproducción](https://github.com/durable-workflow/sdk-rust/blob/4.5.0/tests/workflow_testing.rs).

### Límites de ejecución {#rust-test-execution-limits}

Se omiten las esperas de temporizadores y reintentos. Los callbacks paralelos se ejecutan en orden de comandos, así que este entorno no prueba carreras de planificación ni rendimiento. No simula colas, concesiones ni despliegues. Los callbacks deben ceder el control; `max_steps(n)` limita turnos duraderos, comandos e intentos (10 000 por defecto), mientras que `tokio::time::timeout` puede acotar el tiempo de callbacks asíncronos.

La simulación de timeouts de actividad, **nuevas carreras select**, señales, hijos, servicios, sesiones, continue-as-new y cancelación requieren integración; los comandos no soportados devuelven `Error::Testing`. Un ganador select registrado puede reproducirse aunque no se simule una carrera nueva. Mantenga pruebas con runtime real para esos límites. Consulte la [API de pruebas](https://rust.durable-workflow.com/durable_workflow/testing/index.html) y el [contrato de ejecución publicado](https://github.com/durable-workflow/sdk-rust/blob/4.5.0/README.md#testing-without-a-server).

## Compatibilidad de entrada y recuperación {#entry-compatibility-and-recovery}

**Soporte publicado.** El SDK Rust 3.5.6 incorporó la protección de entrada descrita a continuación, con enrutamiento y recuperación en Server 2.9.9. Son las versiones mínimas para estas funciones; instale las versiones estables actuales para recibir correcciones de seguridad.

`Worker::register_typed_workflow` y los adaptadores tipados con estado deserializan la entrada registrada antes de invocar el manejador de aplicación o su fábrica de estado. Una forma de entrada incompatible comunica el tipo de fallo de tarea `WorkflowEntryArgumentsMismatch` y el motivo `workflow_entry_arguments_mismatch`, sin enviar `fail_workflow`. El error local del SDK es `Error::HandlerType` para entrada de workflow, con el workflow y el tipo Rust esperado en vez del valor registrado. Los manejadores de workflow de bajo nivel no reciben nuevas comprobaciones de firma Rust. Un error devuelto después de entrar correctamente en el manejador de aplicación sigue siendo un fallo normal del workflow, aunque su texto se parezca al diagnóstico de entrada.

El worker gestionado anuncia `workflow_entry_arguments_validation` automáticamente. Un Server validado conserva la tarea fallida bloqueada para replay y deja la ejecución original no terminal. Los runtimes anteriores pueden reintentar la tarea, por lo que el SDK solo no establece el contrato completo de recuperación.

Use `Client::describe_workflow_run(workflow_id, run_id)` para inspeccionar el original y el endpoint de depuración de la ejecución seleccionada para consultar el motivo de tarea. Restaure la decodificación de entrada y el código compatibles antes de usar la ruta HTTP de reparación seleccionada del [procedimiento de recuperación](../failures-and-recovery.md#service-entry-recovery). Este crate no tiene un método auxiliar `repair_workflow`. Conserve la entrada, el historial, el namespace, la cola, el build y los plazos originales; versione los cambios de comandos durables dentro de un manejador compatible y valide el replay en frío. Consulte el [enrutamiento de definiciones](./worker-compatibility-routing.md#definition-fingerprint-evolution).

## Cancelar, terminar y manejar resultados terminales {#cancel-terminate-and-handle-terminal-outcomes}

En modo servicio, `cancel_workflow` y `terminate_workflow` cierran la ejecución inmediatamente. Registran resultados terminales distintos, pero ninguno pide al código realizar limpieza. Utiliza `request_cancellation()` con workers cooperativos para una limpieza acotada. Consulta la [guía de cancelación cooperativa](/docs/polyglot/cancellation) para políticas de operaciones, supervisión y recuperación.

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

`cancel_workflow` y `terminate_workflow` dirigidos a una instancia resuelven la ejecución actual en el servidor. Para restringir la operación a una ejecución seleccionada, utiliza `cancel_workflow_run`, `terminate_workflow_run` o los métodos del handle `cancel_selected_run` y `terminate_selected_run`. Si la ejecución seleccionada ya no es actual, `Error::WorkflowCommandRejected` expone el motivo estable `historical_run_command_rejected` con ID de workflow y ejecución, alcance de destino, estado HTTP y cuerpo de respuesta.

Las llamadas satisfactorias a `WorkflowHandle::result` siguen devolviendo el valor JSON decodificado. Maneja las variantes terminales tipadas para los demás resultados. Decide según los campos estables de motivo y categoría en lugar del texto mostrado:

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

Cada resultado terminal contiene las identidades de workflow y ejecución. También conserva motivo público, categoría e identidad del fallo, tipo y clase de excepción, estado no reintentable, mensaje y carga útil de excepción cuando el servidor los proporciona. Un plazo de espera local tiene motivo `result_wait_timeout` y categoría `client_timeout`; un vencimiento del servidor es una ejecución terminal `timed_out` con motivo estable `execution_timeout` o `run_timeout`.

Los handles devueltos por ambos métodos de inicio conservan el `run_id` seleccionado. `WorkflowHandle::result` describe esa ruta específica, por lo que reutilizar el ID de workflow para una ejecución posterior no hace que la espera devuelva silenciosamente el resultado de la nueva. Conserva `outcome.workflow_id` y `outcome.run_id` en registros, métricas y registros de reintento; utiliza búsquedas a nivel de instancia solo si quieres seguir la ejecución actual.

## Actualizaciones de workflow {#workflow-updates}

Rust admite actualizaciones duraderas en las funciones de cliente de aplicación, handle seleccionado y autoría de workers. Utiliza `Client::update_workflow` o `WorkflowHandle::update` para valores compatibles con JSON y sus métodos correspondientes `update_workflow_avro_value` o `update_avro_value` para valores Avro explícitamente tipados.

Los workers registran manejadores con nombre mediante `Worker::register_update`; utiliza `register_update_avro_value` si el manejador consume y devuelve valores Avro directamente. Una actualización modifica el workflow de forma duradera y devuelve un resultado. Es distinta de las señales sin espera y las consultas de solo lectura mediante reproducción.

## Sobre de cargas útiles {#payload-envelope}

Las entradas de workflow, señales, actividades, consultas y resultados utilizan el contrato publicado `PayloadEnvelope`: un `codec` y un `blob` codificado. La ruta predeterminada `avro` del SDK utiliza su dependencia declarada `apache-avro` y el esquema Value fijo y versionado de la plataforma; no construyas el blob manualmente ni sustituyas el sobre por un registro específico de implementación.

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

`start_workflow` y `start_workflow_with_options` aplican automáticamente este sobre a sus entradas serializables. Utiliza los auxiliares públicos solo si un programa necesita intercambiar directamente un sobre.

## Heartbeats de actividad {#activity-heartbeats}

Para actividades remotas, `ActivityContext::heartbeat(...).await` devuelve `Result<ActivityHeartbeatResponse>`. Propague los errores e inspeccione `should_stop()` en una respuesta correcta. Los fallos de peticiones directas incluyen `Error::Transport` y rechazos HTTP tipados como `Error::ActivityTaskRejected`. Una reclamación con supervisión cooperativa puede devolver `Error::ActivityExecutionAbandoned` cuando fallan los heartbeats o las comprobaciones de titularidad. Detenga el trabajo externo al perder autoridad. No suponga que un callback siempre llega al código de limpieza de la aplicación.

La primera ventana de heartbeat empieza al reclamar la actividad en el entorno de ejecución, antes de entregar la tarea. Un heartbeat registrado usa su marca de tiempo del entorno, no la recepción del llamador. Elija una cadencia con margen suficiente dentro del tiempo configurado, limite cada paso de trabajo o E/S y reserve tiempo para pausas, latencia y posibles reintentos de transporte. Siga las [recomendaciones de cadencia](../features/heartbeats.md#heartbeat-cadence-and-receipts). No se promete una programación automática de heartbeats de progreso ni de agrupación.

Al cancelar, libere recursos locales del proceso cuando la ejecución aún lo permita y vuelva con prontitud. El estado duradero rechaza una finalización tardía y no permite convertir una ejecución cancelada o terminada en éxito. Los workers gestionados siguen sondeando tras ese rechazo definitivo y después de reiniciar. Un heartbeat correcto no confirma efectos externos ni ofrece un punto de control reanudable a un intento de reemplazo.

Para imágenes del servidor, autenticación y topología de producción, continúa en la [guía de configuración del servidor](/docs/polyglot/server).
