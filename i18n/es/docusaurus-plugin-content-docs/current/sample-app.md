---
sidebar_position: 8
tags:
  - sample-app
  - Laravel
  - message-streams
  - Waterline
keywords:
  - aplicación de ejemplo
  - consumidor Laravel
  - ejemplo de workflow de IA
  - panel de Waterline
---

# Aplicación de ejemplo {#sample-app}

https://github.com/durable-workflow/sample-app

Esta es la galería de Laravel integrado: una aplicación Laravel 13 de ejemplo
basada en la línea estable Durable Workflow 2.0, con workflows ejecutables en
un GitHub Codespace. Es el punto de partida adecuado si tu modelo de despliegue
es **Laravel integrado** y quieres examinar juntos la ejecución de colas de
Laravel y Waterline.

Elige los ejemplos que correspondan a tu entorno de ejecución:

| Modelo de despliegue | Ejemplos que debes usar |
| --- | --- |
| Durable Workflow Cloud | Empieza con [Entorno de ejecución gestionado de Cloud](/docs/polyglot/cloud-control-plane/) y después elige la guía del SDK PHP, Python o Rust con las credenciales del namespace provisionado. Los usuarios de Cloud no ejecutan Server. |
| Modo servicio autogestionado | Usa el [inicio rápido de Durable Workflow 2.0](/docs/quickstart/) para obtener ejemplos completos con artefactos publicados de PHP, Python y Rust contra un Server local. |
| Laravel integrado | Continúa con esta galería y la [instalación integrada](/docs/installation/). |

La galería aporta evidencia de principio a fin del motor alojado en Laravel.
No es una aplicación inicial universal para despliegues en modo servicio o
políglotas. Es el primer lugar donde las funcionalidades integradas reciben
cobertura realista de Laravel, y la fuente que refleja este sitio cuando
muestra un patrón nativo de Laravel. Si quieres compartir un patrón de
Durable Workflow, la guía
[Aportar un ejemplo](/docs/contribute-a-sample) explica el proceso de envío.

> ¿Buscas la versión de Laravel 12 / Durable Workflow 1.x? Se conserva en la [rama `Laravel-12`](https://github.com/durable-workflow/sample-app/tree/Laravel-12). Los artículos y tutoriales antiguos que usan patrones de v1 (por ejemplo, `Workflow\Workflow`, `yield activity(...)`, `Workflow\Activity`) corresponden a esa rama.

## Galería de ejemplos {#sample-gallery}

Cada entrada identifica el patrón que enseña, la clase de workflow que lo
ejercita, el comando Artisan que lo ejecuta y la pantalla de Waterline que
demuestra que la ejecución se confirmó. La galería refleja «Sample Index» del
README del repositorio sample-app. Cuando se añade o mueve un ejemplo, el
README y esta galería se actualizan juntos.

| Patrón | Clase de workflow | Comando | Pantalla de Waterline |
|---------|----------------|---------|------------------|
| Workflow v2 determinista mínimo | `App\Workflows\Simple\SimpleWorkflow` | `php artisan app:workflow` | Lista de ejecuciones → detalle con dos eventos de actividad y un evento `WorkflowCompleted` |
| Medición duradera del tiempo transcurrido sin desviación al reproducir | `App\Workflows\Elapsed\ElapsedTimeWorkflow` | `php artisan app:elapsed` | Detalle con dos eventos `SideEffectRecorded` de lecturas del reloj con `sideEffect` antes y después de un evento `TimerFired` |
| Coordinación entre aplicaciones Laravel | `App\Workflows\Microservice\MicroserviceWorkflow` | `php artisan app:microservice` | Detalle con eventos de actividad enrutados mediante colas de tareas entre los workers de la aplicación y del microservicio |
| Automatización del navegador con artefactos capturados | `App\Workflows\Playwright\CheckConsoleErrorsWorkflow` | `php artisan app:playwright` | Detalle con las actividades de Playwright, FFmpeg y limpieza, en ese orden |
| Workflow iniciado por webhook con espera de señal | `App\Workflows\Webhooks\WebhookWorkflow` | `php artisan app:webhook` | Detalle con `WorkflowStarted` desde la entrada del webhook y un evento `SignalReceived` para `ready` |
| Bucle de actividad de IA con reintentos y validación duraderos | `App\Workflows\Prism\PrismWorkflow` | `php artisan app:prism` | Detalle con intentos repetidos de actividad y el `ActivityCompleted` que satisface el validador |
| Agente de IA dirigido por señales con compensación de saga | `App\Workflows\Ai\AiWorkflow` | `php artisan app:ai` | Detalle con una referencia de flujo de mensajes, historial de actualizaciones y las actividades de compensación registradas tras fallar una saga |

La columna de Waterline indica los eventos esperados en una ejecución correcta.
Si falta alguno en tu ejecución local, esa carencia ayuda a localizar un problema
del worker o del entorno.

## Enlaces a páginas de patrones {#pattern-page-cross-links}

Las páginas de patrones enlazan directamente al workflow de ejemplo que ejercita
cada funcionalidad. Usa esta tabla para pasar de una página de patrón al workflow
ejecutable correspondiente.

| Página del patrón | Workflow de ejemplo |
|--------------|-----------------|
| [Sagas](/docs/features/sagas) | `App\Workflows\Ai\AiWorkflow` (`php artisan app:ai`) |
| [Señales](/docs/features/signals) | `App\Workflows\Webhooks\WebhookWorkflow` (`php artisan app:webhook`) |
| [Flujos de mensajes](/docs/features/message-streams) | `App\Workflows\Ai\AiWorkflow` (`php artisan app:ai`) |
| [Workflows hijos](/docs/features/child-workflows) | Todavía no hay una entrada específica en la galería. Usa la guía de workflows hijos. |
| [Efectos secundarios](/docs/features/side-effects) | `App\Workflows\Elapsed\ElapsedTimeWorkflow` (`php artisan app:elapsed`) |
| [Webhooks](/docs/features/webhooks) | `App\Workflows\Webhooks\WebhookWorkflow` (`php artisan app:webhook`) |
| [Workflows MCP](/docs/mcp-workflows) | Todas las entradas de la galería, expuestas mediante `config/workflow_mcp.php` |


**Paso 1**

Crea un codespace a partir de la rama main de este repositorio.

![Creación del codespace](https://user-images.githubusercontent.com/1130888/233664377-f300ad50-5436-4bb8-b172-c52e12047264.png)

**Paso 2**

Espera a que termine la preparación del codespace. Debería tardar entre 5 y 10 minutos.

**Paso 3**

Al terminar verás el editor y el terminal en la parte inferior.

![Editor y terminal](https://user-images.githubusercontent.com/1130888/233665550-1a4f2098-2919-4108-ac9f-bef1a9f2f47c.png)

**Paso 4**

Ejecuta composer install.

```bash
composer install
```

**Paso 5**

Ejecuta el comando de inicialización para configurar la aplicación, instalar dependencias adicionales y ejecutar las migraciones.

```bash
php artisan app:init
```

La ruta `php artisan migrate` de la aplicación de ejemplo carga directamente las migraciones de los paquetes Workflow y Waterline. Todas las tablas y vistas guardadas de Waterline quedan listas tras la instalación normal.

**Paso 6**

Inicia el worker de colas para procesar workflows y actividades.

```bash
php artisan queue:work
```

Para comprobar el propio ciclo de reparación sin esperar a que un worker ocupado llegue a otro ciclo `Looping`, ejecuta una pasada explícita de recuperación desde un segundo terminal:

```bash
php artisan workflow:v2:repair-pass
```

Este comando usa la misma exploración y política de espera progresiva que el bucle del worker. Resulta útil tras corregir un problema local de cola o backend, al validar una tarea perdida en la aplicación de ejemplo o cuando un codespace con poco tráfico tardaría en realizar otra pasada. Añade `--run-id=...` para limitarla a una o más ejecuciones seleccionadas durante un experimento, o `--instance-id=...` para abarcar toda la instancia.

**Paso 7**

Crea una ventana de terminal nueva.

![Nuevo terminal](https://user-images.githubusercontent.com/1130888/233666917-029247c7-9e6c-46de-b304-27473fd34517.png)

**Paso 8**

Inicia el workflow de ejemplo en el terminal nuevo.

```bash
php artisan app:workflow
```

**Paso 9**

Puedes abrir el panel de Waterline en https://[your-codespace-name]-80.preview.app.github.dev/waterline/dashboard.

![Panel de Waterline](https://user-images.githubusercontent.com/1130888/233669600-3340ada6-5f73-4602-8d82-a81a9d43f883.png)

Waterline muestra el estado duradero. Permite ver si un workflow arrancó, qué
ejecución es la actual, qué eventos tipados se confirmaron, qué esperas están
abiertas y qué acciones de operador hay disponibles. La telemetría del worker
es independiente: la latencia de sondeo, duración de tareas, configuración de
exportadores, métricas personalizadas y errores del proceso proceden de los
registros del worker PHP o del endpoint de métricas del SDK de un worker externo.

| Interfaz | Qué permite conocer | Comprobación de ejemplo |
| --- | --- | --- |
| Waterline y exportación del historial | Estado duradero del workflow, historial, reintentos, esperas, señales, actualizaciones, fallos y acciones de operador | Abre `/waterline/dashboard` y exporta el historial de la ejecución seleccionada |
| Registros del worker | Errores del proceso del worker de colas PHP y líneas del registro de la aplicación | Sigue `storage/logs/laravel.log` mientras se ejecuta `php artisan queue:work` |
| Métricas del SDK | Recuentos de peticiones del worker/cliente externo, latencia de sondeo y duración de tareas | Recoge el endpoint Prometheus/OpenMetrics del worker del SDK |

Para un worker Python, instala el extra de Prometheus y expón las métricas
desde el propio proceso:

```bash
pip install 'durable-workflow[prometheus]'
```

```python
from prometheus_client import start_http_server

from durable_workflow import Client, PrometheusMetrics, Worker

metrics = PrometheusMetrics()
start_http_server(9102)

async with Client("http://localhost:8080", token="secret", metrics=metrics) as client:
    worker = Worker(
        client,
        task_queue="default",
        workflows=[GreeterWorkflow],
        activities=[greet],
        metrics=metrics,
    )
    await worker.run()
```

Sustituye `GreeterWorkflow` y `greet` por los manejadores de workflow y actividad
registrados en ese worker.

Recoge `:9102/metrics` para obtener las series `durable_workflow_worker_*` y
`durable_workflow_client_*`. Estas métricas explican el rendimiento del worker.
Waterline sigue siendo la referencia para el historial de workflow confirmado.

La pantalla de detalle de Waterline incluye la acción «Export History» para la ejecución seleccionada. Si muestra la ejecución actual de la instancia, usa la ruta de exportación de ejecución actual de la instancia. El detalle de una ejecución histórica sigue usando la ruta explícita `/runs/{runId}/history-export`. También puedes exportar el mismo paquete de reproducción y depuración desde el terminal:

```bash
php artisan workflow:v2:history-export {workflow-instance-id} --run-id={workflow-run-id} --output=storage/app/workflow-history/example.json --pretty
```

La exportación incluye una suma de integridad SHA-256. Configura `DW_V2_HISTORY_EXPORT_SIGNING_KEY` y `DW_V2_HISTORY_EXPORT_SIGNING_KEY_ID` en el entorno de la aplicación si otro sistema necesita verificar el paquete con una firma HMAC.

El bloque `selected_run` exportado incluye `waits_projection_source`, `timeline_projection_source`, `timers_projection_source` y `lineage_projection_source`. El bloque `links` incluye además `projection_source`. Las secciones `links.parents` / `links.children` proceden primero del historial tipado de relaciones de la ejecución seleccionada, por lo que las relaciones de workflows hijos y continue-as-new siguen visibles aunque las filas de enlaces mutables se hayan desviado en un experimento local. Cuando una relación solo sobrevive en datos antiguos de compatibilidad mutables, el paquete la marca con `history_authority = mutable_open_fallback` y `diagnostic_only = true`, en vez de rehidratar silenciosamente metadatos adicionales al exportar.

## Flujos de mensajes de workflows de IA {#ai-workflow-message-streams}

Los workflows repetidos de IA o entrada humana deben usar la fachada de flujos
de mensajes v2 como patrón de creación:

```php
$reply = $this->inbox('ai.assistant')->receiveOne();

$this->outbox('ai.assistant')->sendReference(
    targetInstanceId: $this->workflowId(),
    payloadReference: $storedReplyReference,
    correlationId: $requestId,
);
```

Mantén el almacenamiento de cargas grandes de petición/respuesta en la
aplicación y pasa la referencia almacenada por el flujo. Los ejemplos nuevos no
deben enseñar a escribir directamente `workflow_messages`, `MessageStreamCursor`
ni llamadas a `MessageService`. Consulta [Flujos de mensajes](/docs/features/message-streams)
para ver el contrato estable de inbox/outbox v2.

**Paso 10**

Ejecuta las pruebas de workflows y actividades.

```bash
vendor/bin/phpunit
```

Ya puedes crear y probar workflows.

## Servidor MCP para clientes de IA {#ai-client-mcp-server}

La aplicación también expone un servidor MCP de Laravel en `/mcp/workflows`. Es la interfaz de referencia para clientes de IA de Durable Workflow v2: ofrece a los agentes descubrimiento estructurado de workflows, inicio, estado, salida, historial tipado reciente y datos de fallos sin extraer información de las páginas de Waterline.

Para el contrato detallado del endpoint y las herramientas MCP, consulta
[Interfaz de workflows MCP](/docs/mcp-workflows). Para el contrato general de
desarrollo asistido por IA, incluidos los manifiestos LLM de v2, códigos de
salida de CLI, exportaciones de Waterline y referencias de SDK, consulta
[Desarrollo asistido por IA](/docs/ai-assisted-development).

El paquete Laravel MCP registra el servidor desde `routes/ai.php`. Las claves de workflow expuestas están en `config/workflow_mcp.php`. Cada entrada puede incluir la clase y metadatos de descubrimiento, como descripción, requisitos de credenciales y argumentos esperados.

Herramientas predeterminadas:

| Herramienta | Función |
| --- | --- |
| `list_workflows` | Enumera las claves de workflow configuradas, requisitos de credenciales, estados de v2 y, opcionalmente, ejecuciones recientes. |
| `start_workflow` | Inicia un workflow v2 configurado y devuelve `workflow_id`, `run_id`, estado, clave de negocio y resultado del comando. |
| `get_workflow_result` | Sondea la ejecución actual o seleccionada y devuelve estado, salida, metadatos de visibilidad y resumen del último fallo. |
| `get_workflow_history` | Devuelve una cola acotada de eventos tipados del historial v2 y los últimos fallos duraderos para depuración. |
| `diagnose_workflow` | Clasifica una ejecución seleccionada con datos estructurados, causa raíz, solución y siguientes acciones. |
| `repair_workflow` | Solicita el comando de reparación integrado de v2 y devuelve un resultado de mutación estructurado: aceptado, rechazado o innecesario. |

Un ciclo habitual de agente es:

```json
{"tool": "list_workflows", "arguments": {"show_recent": true, "limit": 5}}
{"tool": "start_workflow", "arguments": {"workflow": "simple", "business_key": "demo-001"}}
{"tool": "get_workflow_result", "arguments": {"workflow_id": "<workflow_id>"}}
{"tool": "get_workflow_history", "arguments": {"run_id": "<run_id>", "limit": 25}}
```

Usa `simple` o `elapsed` para comprobaciones básicas sin credenciales. El workflow `prism` se expone como ejemplo de IA, pero requiere `OPENAI_API_KEY` para que un worker pueda completarlo.
