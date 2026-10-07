---
sidebar_position: 2
title: Inicio rápido de Durable Workflow 2.0
description: Elige un entorno en modo servicio y completa tu primer workflow con PHP, Python o Rust.
tags:
  - quickstart
  - getting-started
  - PHP
  - Python
  - Rust
keywords:
  - Durable Workflow quickstart
  - Durable Workflow 2.0 quickstart
  - standalone PHP SDK quickstart
  - Python SDK quickstart
  - Rust SDK quickstart
  - standalone server Docker quickstart
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import PythonPackageReleaseLink from '@site/src/components/PythonPackageReleaseLink';

# Inicio rápido de Durable Workflow 2.0 {#durable-workflow-20-quickstart}

## Antes de empezar {#before-you-begin}

**Objetivo:** ejecutar un workflow en modo servicio y leer su resultado
duradero con PHP, Python o Rust.

**Tiempo estimado:** unos 15 minutos una vez disponible el entorno de ejecución.

**Resultado final:** el SDK elegido inicia un worker y un workflow, e imprime
el ID del workflow, `status=completed` y `Hello, <language>!`.

**Requisitos:**

- `curl` y una terminal.
- Docker para la ruta local autogestionada, o un espacio de nombres
  provisionado en Durable Workflow Cloud.
- Las herramientas de un lenguaje: PHP 8.1+ con Composer, Python 3.10+ o Rust 1.86+.

El modo servicio no requiere Laravel. La ruta de Laravel integrado aparece
por separado al final de esta guía.

## 1. Elige tu entorno en modo servicio {#1-choose-your-service-mode-runtime}

| Entorno | Cuándo elegirlo | Siguiente paso |
| --- | --- | --- |
| Durable Workflow Cloud | Quieres que Durable Workflow opere el entorno, la persistencia y Managed Waterline. | Sigue [Tu primer workflow en Cloud](/docs/polyglot/cloud-control-plane/#cloud-first-workflow), con programas completos de PHP, Python y Rust, credenciales provisionadas y un resultado `completed`. **No ejecutes Server ni un servicio Waterline separado.** |
| Server autogestionado | Quieres operar el entorno o realizar este ejercicio local con artefactos publicados. | Continúa con Docker y `curl`. Despliega Waterline por separado si necesitas su interfaz de operación. |

Los ejemplos siguientes usan un Server local autogestionado, sin cuenta ni
descarga del código fuente. Cloud usa los mismos SDK y workers. Sustituye la
conexión local de desarrollo por los datos provisionados que aparecen en
[Entorno gestionado de Cloud](/docs/polyglot/cloud-control-plane/).

## 2. Inicia el Server local {#2-start-the-local-server}

Si elegiste Cloud, pasa al siguiente paso. Para la ruta autogestionada,
despliega y ejecuta la configuración fijada. Inicia Server con SQLite y un
token de desarrollo, sin descargar el código fuente.

<details>
<summary>Iniciar la imagen fijada de Server</summary>

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

**Resultado esperado:** la comprobación de disponibilidad responde
correctamente y la información del clúster identifica el Server local.
Déjalo en ejecución mientras completas la ruta de un lenguaje.

## 3. Elige un lenguaje {#choose-one-language}

Puedes elegir cualquiera de los tres SDK oficiales. Solo se muestra la
pestaña seleccionada para que sigas una ruta completa.

<Tabs groupId="quickstart-language" className="quickstart-language-tabs">
<TabItem value="php" label="PHP" default>

Requisitos: PHP 8.1 o posterior y Composer. Esta ruta usa
`durable-workflow/sdk`, independiente del framework.

1. **Instala el SDK.**

<!-- docs-example id="quickstart.php.install" -->
```bash
mkdir durable-workflow-php-quickstart
cd durable-workflow-php-quickstart
composer require %%artifact.phpSdkComposerPackage%%
```

2. **Añade el worker y el cliente.** Abre el código completo y copia los
   dos archivos en el proyecto nuevo.

<details>
<summary>Código PHP completo y ejecutable</summary>

El worker registra un tipo de workflow y un tipo de actividad en su propia
cola de tareas.

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

#### Cliente y lectura del resultado {#client-and-result-reader}

El cliente inicia un workflow con un nombre único, espera a la ejecución
seleccionada y consulta el estado terminal duradero guardado por Server.

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

3. **Ejecuta el worker y el cliente.**

<!-- docs-example id="quickstart.php.run" -->
```bash
php worker.php > quickstart-worker.log 2>&1 &
export QUICKSTART_WORKER_PID=$!
trap 'kill "$QUICKSTART_WORKER_PID" 2>/dev/null || true' EXIT

php start.php

kill "$QUICKSTART_WORKER_PID" 2>/dev/null || true
trap - EXIT
```

**Resultado esperado:** `status=completed` y un resultado con
`"greeting":"Hello, PHP!"`. Has ejecutado un worker PHP independiente y
consultado su resultado duradero sin Laravel.

Continúa con la [Guía del SDK PHP](/docs/polyglot/php/).

</TabItem>
<TabItem value="python" label="Python">

Requisitos: Python 3.10 o posterior. El programa ejecuta el worker y el cliente
en un proceso. Ambos se comunican con Server mediante las API públicas de
workers y del plano de control.

1. **Instala el SDK.**

   Usa la <PythonPackageReleaseLink authority="qualified">versión estable
   del SDK Python</PythonPackageReleaseLink> del manifiesto. El requisito
   exacto generado mantiene esta ruta en la versión estable documentada.

<!-- docs-example id="quickstart.python.install" -->
```bash
mkdir durable-workflow-python-quickstart
cd durable-workflow-python-quickstart

python3 -m venv .venv
. .venv/bin/activate
pip install %%artifact.pythonPackagePin%%
```

2. **Crea y ejecuta el worker y el cliente.** Abre el programa completo.
   Su último comando lo ejecuta.

<details>
<summary>Código Python completo y ejecutable</summary>

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

**Resultado esperado:** `status=completed` y un resultado con
`Hello, Python!`. Las dos últimas llamadas del SDK leen de Server el resultado
y el estado terminal duradero de la ejecución seleccionada.

Continúa con la [Guía del SDK Python](/docs/polyglot/python/).

</TabItem>
<TabItem value="rust" label="Rust">

Requisitos: Rust 1.86 o posterior. Este ejemplo ejecuta un worker nativo y un
cliente en un proceso Tokio.

1. **Instala el SDK.**

<!-- docs-example id="quickstart.rust.install" -->
```bash
cargo new durable-workflow-rust-quickstart
cd durable-workflow-rust-quickstart
%%artifact.rustCargoAddCommand%%
cargo add tokio --features macros,rt-multi-thread,time
```

2. **Crea y ejecuta el worker y el cliente.** Abre el programa completo.
   Su último comando lo compila y ejecuta.

<details>
<summary>Código Rust completo y ejecutable</summary>

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

**Resultado esperado:** `status=completed` y un resultado JSON con
`"greeting":"Hello, Rust!"`. El ejemplo espera a que el worker termine la
ejecución y lee su estado duradero y el resultado decodificado.

Continúa con la [Guía del SDK Rust](/docs/polyglot/rust/).

</TabItem>
</Tabs>

## 4. Elimina los recursos del Server local {#4-clean-up-the-local-server}

Cloud no necesita un Server local. Al terminar el ejercicio autogestionado:

```bash
docker rm -f durable-workflow-server
docker volume rm durable-workflow-quickstart
```

## Ruta separada: Laravel integrado {#separate-path-embedded-laravel}

Laravel integrado es un modelo de despliegue PHP para aplicaciones que quieren
mantener el estado de los workflows, las colas, la configuración y las
herramientas de operación dentro de su infraestructura Laravel. Instala
`durable-workflow/workflow`. Esta ruta no usa Server ni `durable-workflow/sdk`.

Inicia una aplicación integrada nueva con el paquete publicado:

```bash
composer create-project laravel/laravel durable-workflow-laravel-quickstart
cd durable-workflow-laravel-quickstart
composer require %%artifact.workflowComposerPackage%%
php artisan migrate
php artisan queue:work
```

Para añadir la interfaz de operación a esa misma aplicación, instala el
paquete Composer de Waterline integrado:

```bash
composer require %%artifact.waterlineComposerPackage%%
php artisan waterline:install
```

Este paquete Composer corresponde al modo integrado. El servicio Waterline
autogestionado se despliega por separado. Laravel integrado no ejecuta Server
ni instala los SDK del modo servicio.

Continúa con la [Instalación integrada](/docs/installation/) para configurar
una cola Laravel distinta de `sync`. Después,
[define](/docs/defining-workflows/workflows/) e
[inicia](/docs/defining-workflows/starting-workflows/) un workflow integrado.
[Modos de despliegue](/docs/polyglot/deployment-modes/) compara esta ruta con
la plataforma en modo servicio.

## Siguientes pasos {#next-steps}

- Consulta el [Índice de capacidades](/docs/capabilities/) para comprobar las
  funciones del entorno y SDK elegidos.
- Sigue la guía del [SDK PHP](/docs/polyglot/php/),
  [SDK Python](/docs/polyglot/python/) o [SDK Rust](/docs/polyglot/rust/).
- Compara el ciclo de vida, los mensajes, las programaciones, la visibilidad y
  la ejecución en [Capacidades de clientes y workers](/docs/polyglot/cli-python-parity/).
- Opera el [Entorno gestionado de Cloud](/docs/polyglot/cloud-control-plane/)
  o [Server autogestionado](/docs/polyglot/server/). Añade el
  [CLI](/docs/polyglot/cli/) cuando necesites automatización en la terminal.
- Planifica el despliegue seguro con
  [Compatibilidad y enrutamiento de workers](/docs/polyglot/worker-compatibility-routing/)
  y [Despliegue por build ID](/docs/polyglot/worker-build-id-rollout/).

Para las funciones de Laravel integrado, como temporizadores, señales,
consultas, actividades y workflows hijos, usa la
[Documentación del modo integrado](/docs/category/embedded/).

La [Suite de conformidad de la plataforma](/docs/platform-conformance/)
documenta la validación de versiones: matriz exacta de artefactos,
comprobaciones del código público, registros completos, criterios de tiempo,
limpieza y contrato de inicio rápido legible por máquinas.
