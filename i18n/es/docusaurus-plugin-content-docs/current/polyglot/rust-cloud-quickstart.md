---
sidebar_position: 4
title: Inicio rápido de Rust con Cloud
description: Ejecuta el entorno Rust compartido de Sample App contra un espacio de nombres aprovisionado de Durable Workflow Cloud.
tags:
  - Rust
  - Cloud
  - quickstart
  - workers
keywords:
  - inicio rápido Rust Cloud
  - URL del runtime del espacio de nombres
  - worker Rust
  - entorno de pruebas de Sample App
---

# Inicio rápido de Rust con Cloud {#rust-cloud-quickstart}

:::caution Acceso anticipado controlado

Durable Workflow Cloud está disponible mediante acceso anticipado controlado.
Utiliza esta guía solo después de que Cloud aprovisione un espacio de nombres y
dos credenciales de runtime por rol. La ruta Rust de disponibilidad general no
requiere Cloud; empieza con la [guía del SDK de Rust](./rust.md) o ejecuta
`scripts/playground rust` contra el runtime local predeterminado del entorno.

:::

Sample App ofrece un entorno simétrico para PHP, Python y Rust. Esta página
selecciona Rust y solo cambia el runtime de destino. Las rutas correspondientes
de [PHP](./php.md) y [Python](./python.md) utilizan el mismo comando con `php`
o `python`; el [contrato del entorno de Sample App](https://github.com/durable-workflow/sample-app/blob/main/README.md#symmetric-sdk-playground)
documenta las tres opciones.

El entorno resuelve las versiones estables actuales desde los metadatos
gestionados automáticamente de Sample App. Utiliza esas versiones generadas
en lugar de copiar números en estos comandos o añadir un paso separado de
instalación del SDK.

## 1. Abrir Sample App preparada {#1-open-the-prepared-sample-app}

[Crea un Codespace desde la rama `main` de Sample App](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main),
espera a que termine la preparación y abre un terminal en la raíz del repositorio.
La imagen preparada contiene las herramientas del SDK y `dw` que necesita el
entorno compartido.

Cloud proporciona la URL del runtime, su espacio de nombres y dos credenciales
por rol. Elige una cola de aplicación y exporta estos marcadores solo después
de sustituirlos por sus valores correspondientes:

```bash
export DURABLE_WORKFLOW_RUNTIME_URL='<provisioned-runtime-url>'
export DURABLE_WORKFLOW_RUNTIME_NAMESPACE='<provisioned-runtime-namespace>'
export DURABLE_WORKFLOW_CLIENT_TOKEN='<client-runtime-credential>'
export DURABLE_WORKFLOW_WORKER_TOKEN='<worker-runtime-credential>'
export DURABLE_WORKFLOW_TASK_QUEUE='<rust-task-queue>'
```

La URL del runtime es la raíz del runtime del espacio de nombres que devuelve
Cloud. Debe ser una URL HTTPS absoluta sin consulta, fragmento ni `/api` final;
el SDK y la CLI añaden sus propias rutas API. El espacio de nombres es el valor
independiente devuelto con esa URL, no un nombre inferido de su ruta.

La credencial de cliente inicia, describe y lee workflows. La de worker registra,
sondea, envía latidos y completa tareas. Deben ser secretos diferentes por rol
aunque este comando inicie ambos procesos hijos. Una clave de administración de
Cloud gestiona espacios de nombres y credenciales; no la exportes ni la pases
como credencial de runtime.

## 2. Ejecutar la ruta Rust {#2-run-the-rust-journey}

Ejecuta el contrato compartido de runtime externo:

```bash
scripts/playground rust --runtime managed \
  --runtime-url "$DURABLE_WORKFLOW_RUNTIME_URL" \
  --namespace "$DURABLE_WORKFLOW_RUNTIME_NAMESPACE" \
  --task-queue "$DURABLE_WORKFLOW_TASK_QUEUE"
```

El comando genera los archivos ausentes en `.playground/rust` sin reemplazar
código del usuario. Antes de iniciar nada, imprime los tipos efectivos de
workflow y actividad, la cola, los comandos de worker y cliente, la entrada y
el resultado esperado. El worker recibe solo su credencial; después de que su
registro exacto sea visible, el cliente recibe solo la credencial de cliente.

La espera de registro está limitada a 60 segundos. Iniciar el proceso no prueba
que esté listo. Continúa solo después de que el comando imprima un punto de
control como este (las identidades son ilustrativas):

```text
Worker ready: target=managed runtime_url=<provisioned-runtime-url> namespace=<provisioned-runtime-namespace> id=<worker-id> queue=<rust-task-queue> workflow_type=sample-app.playground.rust.authored-workflow activity_type=sample-app.playground.rust.authored-activity
```

El mismo comando inicia un workflow, espera hasta 120 segundos el resultado del
cliente SDK, confirma `status=completed` con `dw` y comprueba el historial
requerido de workflow y actividad. Un resultado satisfactorio tiene este aspecto:

```text
Completed rust workflow <workflow-id>: {"greeting":"Hello, Durable Workflow, from the Sample App Rust playground","input":{"name":"Durable Workflow"},"activity_runtime":"rust","workflow_runtime":"rust"}
```

La línea final `Playground success` repite el runtime de destino, espacio de
nombres, cola, tipos registrados y estructura del resultado esperado sin valores
de credenciales. El comando también escribe `storage/app/playground-rust-evidence.json`
con versiones seleccionadas, registro exacto, identidad de workflow/ejecución,
estado `completed`, resultado y tipos de eventos del historial. Managed
Waterline sigue siendo la interfaz del operador para el espacio aprovisionado;
esta ruta gestionada no inicia Server ni Waterline locales.

## Diagnóstico acotado {#bounded-diagnosis}

Si el punto de control `Worker ready` no aparece en 60 segundos, empieza por el
contrato efectivo impreso antes del error:

- **Cola no coincidente:** el ejecutor consulta el valor exacto pasado a
  `--task-queue`. Confirma que Cloud admite la cola y que el registro impreso
  utiliza el mismo valor; después repite el comando.
- **Tipos no coincidentes:** el error indica los tipos de workflow y actividad
  que debe anunciar el worker. Compáralos con el contrato efectivo. Si tus
  archivos contienen registros antiguos fijados en el código, actualízalos o
  verifica la generación actual en un directorio nuevo con
  `--source "$HOME/durable-rust-worker"`.
- **Rol de credencial incorrecto:** un fallo de autorización antes del registro
  apunta a la credencial del worker; al describir o iniciar, a la de cliente.
  No intercambies los valores ni uses una clave de administración de Cloud.
- **Runtime no coincidente:** ambos roles deben utilizar la URL y el espacio
  de nombres exactos aprovisionados. Elimina el `/api` final; no uses la URL
  de administración de Cloud ni la de un Server autohospedado.

Si el registro funciona pero falla la finalización, conserva la identidad de
workflow/ejecución impresa. Inspecciona esa ejecución en Managed Waterline y
compara su tipo pendiente de workflow o actividad y la cola con el contrato
efectivo. Corrige la discrepancia antes de iniciar otra ejecución. La ruta de
evidencia y la salida acotada del worker identifican si falló el resultado del
cliente, el estado duradero, el resultado esperado o la comprobación de historial.

Vuelve a la [guía general del SDK de Rust](./rust.md) o utiliza la
[referencia generada de la API de Rust](https://rust.durable-workflow.com/durable_workflow/)
para tipos y métodos concretos.
