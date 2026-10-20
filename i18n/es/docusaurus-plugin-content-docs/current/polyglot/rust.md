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

Las actividades de larga duración deben enviar latidos e inspeccionar `should_stop()`. Al cancelar, libera archivos temporales, conexiones y otros recursos locales del proceso y devuelve pronto. El estado duradero rechaza una finalización tardía, que no puede convertir una ejecución cancelada o terminada en éxito; los workers gestionados siguen sondeando tras ese rechazo definitivo y después de reiniciar.

Para imágenes del servidor, autenticación y topología de producción, continúa en la [guía de configuración del servidor](/docs/polyglot/server).
