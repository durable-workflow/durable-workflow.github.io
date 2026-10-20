---
sidebar_position: 2
title: Server
description: Despliegue y configuración de Durable Workflow Server independiente.
tags:
  - server
  - plano-de-control
  - operaciones
  - multilenguaje
keywords:
  - Durable Workflow Server
  - servidor independiente
  - API del plano de control
  - workflows multilenguaje
---

# Server {#server}

Durable Workflow Server se publica como un servicio independiente de orquestación de workflows implementado en PHP. Expone el mismo motor duradero del paquete PHP integrado mediante un plano de control HTTP+JSON y un protocolo de workers independientes del lenguaje. PHP es un detalle de implementación de este componente, no un requisito para el lenguaje de la aplicación.

## ¿Es solo para equipos PHP? {#is-this-only-for-php-teams}

No. PHP, Python y Rust tienen SDK oficiales. Un equipo que solo use Python o Rust puede desplegar Server como infraestructura, escribir workflows y actividades con su SDK nativo y comunicarse por el protocolo público. Su aplicación no integra Laravel ni se convierte en una aplicación Laravel.

Las vías de adopción son independientes:

- **Servidor independiente:** los operadores despliegan la imagen publicada de Server y sus roles de base de datos, cola/caché, planificador y API. Los equipos ejecutan workers PHP, Python o Rust contra ese endpoint. Server controla el estado de orquestación y la frontera pública del plano de control y los workers.
- **Integración en Laravel:** una aplicación Laravel instala el paquete PHP de workflows y controla el motor mediante su propia cola, base de datos, configuración y despliegue. Esta es la ventaja de la integración nativa en Laravel, no un requisito del servidor independiente.
- **Cloud gestionado:** Durable Workflow Cloud opera el runtime de orquestación, su persistencia, ubicación y recuperación. Los equipos ejecutan clientes y workers de los SDK contra un namespace de Cloud aprovisionado. No despliegan esta distribución de Server para Cloud ni conectan un Server autogestionado a él. Consulte [Runtime gestionado de Cloud](/docs/polyglot/cloud-control-plane/).

Las tres opciones usan los mismos conceptos de ejecución duradera. Los workers externos de Server y Cloud usan nombres de tipo estables de texto para workflows y actividades y la envoltura compartida del codec. Así, un workflow hijo o una actividad entre lenguajes conserva la forma de los datos sin exponer la serialización de PHP.

Si está eligiendo entre Server independiente y la integración del paquete, comience por [Modos de despliegue](/docs/polyglot/deployment-modes). Esta página trata la distribución en modo de servicio.

Use Server independiente cuando necesite:
- **Workflows multilenguaje**: workers de workflows y actividades PHP, Python y Rust que comparten un runtime duradero
- **Orquestación de microservicios**: coordinar servicios escritos en distintos lenguajes
- **Runtime centralizado**: varias aplicaciones comparten un motor de workflows
- **Entornos sin Laravel**: usar Durable Workflow fuera de Laravel

Si ya ejecuta v2 integrado en una aplicación Laravel, use la [guía de migración a Server](/docs/polyglot/embedded-to-server) para preparar claves de tipo, desplegar Server junto a la ejecución integrada, conectar workers y dirigir solo los nuevos inicios de workflow a Server. Mantenga a mano [Modos de despliegue](/docs/polyglot/deployment-modes) durante el cambio para conservar explícitos los ids, resultados de comandos, semántica de tareas y reglas de propiedad del runtime.

Consulte [Compatibilidad y enrutamiento de workers](/docs/polyglot/worker-compatibility-routing) al desplegar cohortes de compilación, drenar cohortes antiguas o mantener ejecuciones prolongadas fijadas a ejecutores compatibles durante una reversión.

Consulte [Topología de roles de Server](/docs/polyglot/server-role-topology) para conocer el vocabulario de roles, clases de proceso, límites de autoridad, dominios de fallo y vía de migración que publica `GET /api/cluster/info`.

## Inicio rápido {#quick-start}

### Imagen publicada y SQLite {#published-image--sqlite}

La forma más rápida de ejecutar Server sin código fuente es la imagen Docker publicada. Este inicio rápido usa SQLite, colas de base de datos y caché de archivos dentro del contenedor. Monte `/app/database` para que la inicialización y la API compartan el mismo archivo SQLite:

```bash
server_image=%%artifact.serverDockerHubImage%%
export DW_AUTH_TOKEN=dev-token

docker volume create durable-workflow-server-quickstart

docker run --rm \
  -v durable-workflow-server-quickstart:/app/database \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$server_image" server-bootstrap

docker rm -f durable-workflow-server durable-workflow-server-queue-worker >/dev/null 2>&1 || true
docker run -d --name durable-workflow-server \
  -p 127.0.0.1:8080:8080 \
  -v durable-workflow-server-quickstart:/app/database \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$server_image"

docker run -d --name durable-workflow-server-queue-worker \
  --health-cmd="server-process-healthcheck worker" \
  -v durable-workflow-server-quickstart:/app/database \
  -e DW_SERVER_PROCESS_CLASS=worker_node \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$server_image" php artisan queue:work database --queue=default --sleep=1 --tries=3

until curl -sf http://localhost:8080/api/ready >/dev/null; do sleep 1; done
curl http://localhost:8080/api/health
curl -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  http://localhost:8080/api/cluster/info \
  | jq '.topology | {current_shape, current_roles, execution_mode}'
```

Esto crea el namespace predeterminado e inicia la API y su worker de infraestructura. La cola de Laravel es `default`, independiente de las colas de tareas con nombre del SDK. El worker de cola hace avanzar los temporizadores duraderos mientras los workers de los SDK están detenidos. La evaluación de programaciones y el mantenimiento de producción necesitan los roles adicionales del conjunto Compose publicado más abajo.

La API se vincula a la interfaz de bucle local y `dev-token` solo sirve para este ejercicio. Para acceso remoto, use el despliegue Compose con credenciales propias, TLS y controles de red. Use ese conjunto con MySQL y Redis compartido para ensayar producción.

Elimine los contenedores y la base de datos de este ejercicio al terminar:

```bash
docker rm -f durable-workflow-server durable-workflow-server-queue-worker
docker volume rm durable-workflow-server-quickstart
```

### Imagen publicada y Compose {#published-image--compose}

Use el artefacto Compose publicado para un conjunto de varios contenedores sin código fuente respaldado por MySQL y Redis:

```bash
curl -fsSLO https://raw.githubusercontent.com/durable-workflow/server/main/docker-compose.published.yml

server_image=%%artifact.serverDockerHubImage%%
export DW_AUTH_TOKEN=dev-token

env DW_SERVER_IMAGE="$server_image" docker compose \
  -f docker-compose.published.yml up -d --wait
curl -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  http://localhost:8080/api/cluster/info \
  | jq '.topology | {current_shape, current_roles, execution_mode}'
```

### Puertos {#ports}

| Servicio | Puerto | Propósito |
|---------|------|---------|
| API de Server | 8080 | Endpoints del plano de control y del protocolo de workers |
| MySQL | 3306 | Base de datos, expuesta para facilitar el desarrollo |
| Redis | 6379 | Caché y cola, expuestas para facilitar el desarrollo |

## Configuración {#configuration}

Server se configura con variables de entorno. A continuación se resumen las opciones principales. El contrato completo `DW_*` para operadores se documenta en la [referencia de configuración](/docs/polyglot/server-config-reference).

### Base de datos {#database}

```bash
DB_CONNECTION=mysql
DB_HOST=mysql
DB_PORT=3306
DB_DATABASE=workflow
DB_USERNAME=workflow
DB_PASSWORD=secret
```

Compatibles: MySQL 8.0+, PostgreSQL 13+ y SQLite 3.35+.

### Caché y cola {#cache-and-queue}

```bash
CACHE_STORE=redis
QUEUE_CONNECTION=redis

REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=null
REDIS_DB=0
```

La caché debe admitir [bloqueos atómicos](https://laravel.com/docs/12.x/cache#atomic-locks). Controladores de cola: Redis, Amazon SQS, Beanstalkd y base de datos.

Los bloqueos atómicos de caché son necesarios para los [límites de admisión por cola](/docs/polyglot/task-queue-admission) y la contrapresión de consultas. Use Redis en despliegues multinodo donde la admisión de workflows, actividades o consultas deba aplicarse entre todos los procesos de Server.

### Autenticación {#authentication}

Server admite tres modos de autenticación:

**Basada en token** (predeterminada):

```bash
DW_AUTH_DRIVER=token
DW_AUTH_TOKEN=your-secret-token-here
```

Todas las solicitudes deben enviar `Authorization: Bearer your-secret-token-here`.

Para un despliegue con privilegios mínimos, configure tokens limitados por rol en vez de un token compartido:

```bash
DW_AUTH_DRIVER=token
DW_WORKER_TOKEN=worker-secret
DW_OPERATOR_TOKEN=operator-secret
DW_ADMIN_TOKEN=admin-secret
```

Los tokens de worker permiten registrar workers, sondear tareas, enviar heartbeats y finalizar trabajo. Los de operador permiten iniciar, listar, señalizar, consultar, actualizar, reparar, cancelar, terminar, archivar y observar workflows. Los de administrador permiten usar endpoints administrativos como la gestión de namespaces y retención.

**Firma HMAC**:

```bash
DW_AUTH_DRIVER=signature
DW_SIGNATURE_KEY=your-signature-secret
```

Las solicitudes deben incluir `X-Signature`, calculada como `hash_hmac('sha256', request_body, DW_SIGNATURE_KEY)`. Server también admite claves de firma limitadas por rol:

```bash
DW_AUTH_DRIVER=signature
DW_WORKER_SIGNATURE_KEY=worker-signature-secret
DW_OPERATOR_SIGNATURE_KEY=operator-signature-secret
DW_ADMIN_SIGNATURE_KEY=admin-signature-secret
```

**Sin autenticación** (solo desarrollo):

```bash
DW_AUTH_DRIVER=none
```

⚠️ **No use `none` en producción.** Todos los endpoints pasan a ser públicos.

### Paquete Workflow {#workflow-package}

La imagen Docker instala el paquete `durable-workflow/workflow`. Elija la versión:

```bash
# Build-time arg (set in docker-compose.yml or pass to docker build)
WORKFLOW_PACKAGE_REF=v2        # branch, tag, or commit
WORKFLOW_PACKAGE_SOURCE=       # custom Git remote (optional)
```

### Retención {#retention}

PHP Server usa la retención por namespace para seleccionar el historial cerrado que puede limpiarse. La duración acotada predeterminada se configura con:

```bash
DW_HISTORY_RETENTION_DAYS=30
```

Cada búsqueda usa la política **actual** del namespace. Cambiar la duración también afecta al historial cerrado antes del cambio. No da a cada ejecución un nuevo período de retención desde la fecha de actualización.

| Cambio de política | Efecto sobre ejecuciones cerradas retenidas |
| --- | --- |
| Reducir la retención acotada | Las ejecuciones anteriores pueden ser elegibles en la próxima búsqueda. |
| Ampliar la retención acotada | Las ejecuciones aún retenidas pueden dejar de ser elegibles. El historial ya borrado no se restaura. |
| Cambiar a `forever` | Las búsquedas no seleccionan ejecuciones y las pasadas explícitas las omiten. |
| Cambiar de `forever` a `bounded` | Indique `retention_days`; el historial cerrado existente se evalúa con esa duración. |

Por ejemplo, el **19 de octubre a las 12:00 UTC**, una ejecución cerrada el **1 de octubre a las 12:00 UTC** tiene 18 días. Está fuera de una ventana de 7 días y dentro de una de 90. Cambiar de 90 a 7 días la hace elegible de inmediato; la limpieza puede procesarla en una pasada posterior. Una ejecución cerrada exactamente en el límite queda fuera de esa selección, que usa una comparación estrictamente anterior.

#### Revisar un cambio de retención {#review-a-retention-change}

Antes de reducir la retención, revise las fechas de cierre y conserve el historial necesario. Exporte las ejecuciones importantes mediante la [API de exportación de historial](./server-api-reference.md#workflow-control-plane) y conserve copias recuperables de la base de datos y de las cargas externas. Una exportación de replay necesita sus objetos referenciados y no reemplaza una copia de seguridad de la base de datos y el almacenamiento.

Actualice el namespace con una credencial de administrador:

```bash
curl -sS -X PUT "$DURABLE_WORKFLOW_SERVER_URL/api/namespaces/orders-prod" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"retention_mode":"bounded","retention_days":7}'
```

Para `forever`, envíe `{"retention_mode":"forever","retention_days":null}`. Volver a la retención acotada exige una duración explícita de 1 a 365 días.

Inspeccione la política actual del namespace y la lista acotada de ejecuciones elegibles:

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/system/retention?limit=100" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

`cutoff` describe la búsqueda actual. `expired_run_count` cuenta los IDs devueltos hasta `scan_limit`, no todo el trabajo pendiente. `scan_pressure: true` significa que se alcanzó ese límite. Esta lectura no elimina historial.

La actualización no es una vista previa ni un período de gracia: los heartbeats normales de workers ya pueden activar una pequeña pasada de retención limitada en frecuencia tras cambiar la política. `history:prune` programado y las pasadas explícitas del sistema también pueden procesar ejecuciones elegibles. Haga copias y revise **antes** de reducir la política.

#### Limpieza y protecciones {#retention-cleanup-and-protections}

`POST /api/system/retention/pass` sin `run_ids` selecciona ejecuciones caducadas bajo la política actual hasta su límite. Inspeccione `pruned`, `skipped`, `failed` y los motivos por ejecución de la respuesta para distinguir la selección del borrado completado.

:::warning Los IDs explícitos omiten la búsqueda por edad

En PHP Server, proporcionar `run_ids` apunta directamente a esas ejecuciones cerradas, incluidas las más recientes que la ventana de retención acotada actual. No se cruza con la lista de ejecuciones caducadas. Revise cada objetivo como una operación destructiva. Omita `run_ids` para la limpieza normal por edad.

:::

Las pasadas de retención omiten ejecuciones archivadas y namespaces configurados como `forever`. Archivar conserva el historial en la misma base de datos, no es una copia independiente. Otros bloqueos, como una actividad separada sin terminar, también pueden impedir el borrado. Compruebe el motivo devuelto en vez de asumir que una ejecución seleccionada se eliminó.

Para conservar un registro más allá de la ventana acotada de 1 a 365 días, elija entre mantener el historial en la base de datos o conservar exportaciones verificadas independientes. El [procedimiento de historial a largo plazo](../configuration/pruning-workflows.md#keeping-history-beyond-database-retention) explica la selección `CloseTime`, paginación, bytes externos y conciliación previa al borrado. La API publicada no permite desarchivar. Una ejecución archivada no puede eliminarse después mediante las pasadas de retención de Server.

La depuración elimina el historial, los detalles relacionados y las cargas externas elegibles. Una ampliación posterior de la política no puede recuperarlos. La [guía de depuración integrada](../configuration/pruning-workflows.md) describe un proceso separado controlado por la aplicación; su API de limpieza no aplica la política de retención por namespace de Server. Para otro runtime, confirme su comportamiento antes de aplicar este procedimiento de PHP Server.

### Namespaces {#namespaces}

El comando `server-bootstrap` ejecuta migraciones y crea el namespace `default`. Use `DW_DEFAULT_NAMESPACE` para cambiar el namespace cuando una solicitud omita su cabecera:

```bash
DW_DEFAULT_NAMESPACE=default
```

Cree namespaces mediante la API:

```bash
curl -X POST http://localhost:8080/api/namespaces \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "production",
    "description": "Production workflows",
    "retention_days": 90
  }'
```

## Comprobaciones de salud {#health-checks}

### Salud de la API {#api-health}

```bash
curl http://localhost:8080/api/health
```

Devuelve `200 OK` con:

```json
{
  "status": "serving",
  "timestamp": "2026-04-15T12:00:00Z",
  "checks": {
    "database": "ok"
  },
  "topology": {
    "schema": "durable-workflow.v2.role-topology",
    "version": 4,
    "current_shape": "standalone_server",
    "current_process_class": "server_http_node",
    "current_roles": ["api_ingress", "control_plane", "matching", "history_projection"],
    "execution_mode": "remote_worker_protocol",
    "matching_role": {
      "queue_wake_enabled": true,
      "shape": "in_worker",
      "wake_owner": "worker_loop",
      "task_dispatch_mode": "poll",
      "partition_primitives": ["connection", "queue", "compatibility", "namespace"],
      "backpressure_model": "lease_ownership",
      "discovery_limits": {
        "poll_batch_cap": 100,
        "availability_ceiling_seconds": 1,
        "wake_signal_ttl_seconds": 60,
        "workflow_task_lease_seconds": 300,
        "activity_task_lease_seconds": 300
      }
    }
  }
}
```

### Resumen público de topología {#public-topology-summary}

`GET /api/health` y `GET /api/ready`, sin autenticación, publican el resumen `topology` del nodo que responde. Ese bloque público es menor que `/api/cluster/info`, pero incluye los campos necesarios para identificar nodos con roles separados antes de la autenticación del plano de control o de resolver el namespace:

- `topology.schema`
- `topology.version`
- `topology.current_shape`
- `topology.current_process_class`
- `topology.current_roles`
- `topology.execution_mode`
- `topology.matching_role.queue_wake_enabled`
- `topology.matching_role.shape`
- `topology.matching_role.wake_owner`
- `topology.matching_role.task_dispatch_mode`
- `topology.matching_role.partition_primitives`
- `topology.matching_role.backpressure_model`
- `topology.matching_role.discovery_limits.poll_batch_cap`
- `topology.matching_role.discovery_limits.availability_ceiling_seconds`
- `topology.matching_role.discovery_limits.wake_signal_ttl_seconds`
- `topology.matching_role.discovery_limits.workflow_task_lease_seconds`
- `topology.matching_role.discovery_limits.activity_task_lease_seconds`

`topology.matching_role.discovery_limits` es el contrato numérico fijado del rol de asignación que compila el paquete Workflow: `poll_batch_cap` es el máximo de filas listas devueltas por sondeo; `availability_ceiling_seconds` es la tolerancia entre backends aplicada a `available_at` para soportar diferencias subsegundo en tareas recién disponibles; `wake_signal_ttl_seconds` es el TTL predeterminado de señales de `CacheLongPollWakeStore`; y `workflow_task_lease_seconds` / `activity_task_lease_seconds` son las duraciones predeterminadas de sus leases. Reducir estos valores es un cambio de protocolo, porque workers y herramientas los leen como el contrato autoritativo de asignación.

El mismo resumen aparece en `/api/ready` incluso cuando el despliegue no está listo. Así, las comprobaciones pueden distinguir respuestas de `server_http_node`, `scheduler_node`, `matching_node` y `execution_node` mientras hay bloqueos de inicialización.

### Disponibilidad {#readiness}

```bash
curl http://localhost:8080/api/ready
```

`/api/ready` es la condición de disponibilidad para desplegar. Solo devuelve `200 OK` si los requisitos de inicialización y la seguridad del despliegue están listos o en estado de advertencia.

Interprete los campos legibles por máquina así:

- `checks.migrations.repository_exists` y `checks.migrations.pending_migrations` indican si existe el repositorio de migraciones y qué registros siguen pendientes.
- `checks.migrations.adoptable_migrations` enumera migraciones de creación de tablas que solo necesitan incorporarse al historial de migraciones. Es una `warning`, no una interrupción obligatoria, por lo que Server puede seguir listo mientras los operadores programan esa incorporación.
- `checks.migrations.blocking_migrations` enumera registros necesarios para la seguridad del despliegue que deben aplicarse antes de admitir tráfico. Si la lista no está vacía, la disponibilidad se bloquea con `checks.migrations.status = "pending"`.
- `checks.migrations.missing_tables` informa de las tablas duraderas aún ausentes, y `checks.migrations.operator_surface` indica si la interfaz del operador v2 puede explicar la seguridad del despliegue después del arranque.
- `checks.migrations.readiness_contract.version` fija la revisión del contrato de arranque y adopción de migraciones que deben interpretar los scripts.
- `checks.workflow_v2` refleja la evaluación de seguridad del despliegue en todos los namespaces. Si aún no puede evaluarse, devuelve `status: "blocked"` con `blocked_by`, `message` y `remediation` para corregir el requisito previo en vez de perseguir síntomas en las colas.

### Bloqueo de inicialización de workflows {#workflow-bootstrap-gate}

`checks.workflow_v2.status: "blocked"` también bloquea rutas, no es solo una señal de disponibilidad. Mientras la inicialización v2 está bloqueada, Server rechaza las rutas de inicio y modificación de workflows, modificación de programaciones, adaptadores puente y protocolo de workers con HTTP `503` y `reason: "workflow_v2_blocked"`. La comprobación ocurre tras validar el rol y la versión de protocolo, pero antes de resolver el namespace, por lo que las solicitudes bloqueadas nunca conocen su existencia.

La respuesta de bloqueo de inicialización siempre incluye:

- `reason: "workflow_v2_blocked"` para que los clientes decidan mediante un nombre legible por máquina y no un mensaje en prosa.
- `blocked_by`: lista ordenada de requisitos que bloquean la disponibilidad, por ejemplo `migrations`.
- `remediation`: instrucciones para que el operador resuelva los bloqueos, reflejadas desde `checks.workflow_v2.remediation` en `/api/ready`.

Familias de rutas sujetas al bloqueo de inicialización:

- **Inicio y modificación de workflows**: rutas de inicio, comandos y comandos de una ejecución concreta en `/api/workflows`.
- **Modificación de programaciones**: `POST /api/schedules`, `PUT /api/schedules/{scheduleId}`, `DELETE /api/schedules/{scheduleId}`, `POST /api/schedules/{scheduleId}/pause`, `POST /api/schedules/{scheduleId}/resume`, `POST /api/schedules/{scheduleId}/trigger` y `POST /api/schedules/{scheduleId}/backfill`.
- **Adaptadores puente**: `POST /api/bridge-adapters/webhook/{adapter}`.
- **Protocolo de workers**: todas las rutas `/api/worker` y `/api/worker/*`, incluidos registro, heartbeat y operaciones de tareas de workflow, consulta y actividad. Devuelven el bloqueo en la envoltura del protocolo de workers y conservan `X-Durable-Workflow-Protocol-Version` para que los SDK interpreten el mismo `reason: "workflow_v2_blocked"` que el plano de control.

Las **lecturas** de programaciones están excluidas a propósito para permitir inspeccionarlas durante la recuperación: `GET /api/schedules`, `GET /api/schedules/{scheduleId}` y `GET /api/schedules/{scheduleId}/history` siguen disponibles mientras el bloqueo de inicialización impide otras rutas.

### Capacidades de Server {#server-capabilities}

```bash
curl http://localhost:8080/api/cluster/info \
  -H "Authorization: Bearer $TOKEN"
```

Devuelve la versión de compilación de Server, las versiones de SDK admitidas, las capacidades del motor, la política de compatibilidad de clientes y los manifiestos del plano de control y del protocolo de workers con versiones independientes:

```json
{
  "server_id": "server-1",
  "version": "2.0.0",
  "default_namespace": "default",
  "supported_sdk_versions": {
    "php": ">=1.0",
    "python": ">=0.2,<1.0",
    "cli": ">=0.1,<1.0"
  },
  "client_compatibility": {
    "schema": "durable-workflow.v2.client-compatibility",
    "version": 1,
    "authority": "protocol_manifests",
    "top_level_version_role": "informational",
    "fail_closed": true
  },
  "capabilities": {
    "workflow_tasks": true,
    "activity_tasks": true,
    "signals": true,
    "queries": true,
    "updates": true,
    "schedules": true,
    "child_workflow_retry_policy": true,
    "child_workflow_timeouts": true,
    "payload_codecs": ["avro"],
    "response_compression": ["gzip", "deflate"]
  },
  "control_plane": {
    "version": "2",
    "header": "X-Durable-Workflow-Control-Plane-Version",
    "request_contract": { "schema": "durable-workflow.v2.control-plane-request.contract", "version": 1, "...": "..." },
    "response_contract": { "schema": "durable-workflow.v2.control-plane-response.contract", "version": 1, "...": "..." }
  },
  "worker_protocol": {
    "version": "1.0",
    "server_capabilities": {
      "long_poll_timeout": 30,
      "supported_workflow_task_commands": [
        "complete_workflow",
        "fail_workflow",
        "continue_as_new",
        "schedule_activity",
        "start_timer",
        "start_child_workflow"
      ],
      "workflow_task_poll_request_idempotency": true,
      "poll_status": true,
      "history_page_size_default": 500,
      "history_page_size_max": 1000,
      "activity_retry_policy": true,
      "activity_timeouts": true,
      "child_workflow_retry_policy": true,
      "child_workflow_timeouts": true,
      "parent_close_policy": true,
      "non_retryable_failures": true,
      "response_compression": ["gzip", "deflate"],
      "history_compression": {
        "supported_encodings": ["gzip"],
        "compression_threshold": 8192
      }
    }
  }
}
```

Use `client_compatibility.authority: "protocol_manifests"` como regla para comprobar clientes. `version` en el nivel superior identifica la compilación. Los clientes CLI y SDK deben rechazar la operación si falta o no se admite `control_plane.version`, `control_plane.request_contract` o `worker_protocol.version`.

### Topología de roles y forma del despliegue {#role-topology-and-deployment-shape}

La referencia de cada campo de este manifiesto está en [Topología de roles de Server](/docs/polyglot/server-role-topology). Esta sección conserva el ejemplo `cluster/info`; use la página específica para reunir topologías admitidas, límites de autoridad, dominios de fallo, límites de escalado y contrato de migración.

`GET /api/cluster/info` también publica un manifiesto `topology`. Es el mapa de roles legible por máquina del nodo que responde. Operadores y automatización pueden leer un único contrato sin deducir las funciones del nodo a partir de nombres de contenedores o procedimientos de despliegue.

```json
{
  "topology": {
    "schema": "durable-workflow.v2.role-topology",
    "version": 2,
    "supported_shapes": [
      "embedded",
      "standalone_server",
      "split_control_execution"
    ],
    "role_vocabulary": [
      "api_ingress",
      "control_plane",
      "matching",
      "history_projection",
      "scheduler",
      "execution_plane"
    ],
    "current_shape": "standalone_server",
    "current_process_class": "server_http_node",
    "current_roles": [
      "api_ingress",
      "control_plane",
      "matching",
      "history_projection"
    ],
    "execution_mode": "remote_worker_protocol",
    "matching_role": {
      "queue_wake_enabled": true,
      "shape": "in_worker",
      "wake_owner": "worker_loop",
      "task_dispatch_mode": "poll",
      "partition_primitives": [
        "connection",
        "queue",
        "compatibility",
        "namespace"
      ],
      "backpressure_model": "lease_ownership",
      "discovery_limits": {
        "poll_batch_cap": 100,
        "availability_ceiling_seconds": 1,
        "wake_signal_ttl_seconds": 60,
        "workflow_task_lease_seconds": 300,
        "activity_task_lease_seconds": 300
      }
    },
    "shape_assignments": {
      "embedded": {
        "process_classes": [
          {
            "name": "application_process",
            "roles": [
              "control_plane",
              "matching",
              "history_projection",
              "scheduler",
              "execution_plane"
            ]
          }
        ]
      },
      "standalone_server": {
        "process_classes": [
          {
            "name": "server_http_node",
            "roles": [
              "api_ingress",
              "control_plane",
              "matching",
              "history_projection"
            ]
          },
          {
            "name": "scheduler_node",
            "roles": ["scheduler"]
          },
          {
            "name": "worker_node",
            "roles": ["execution_plane"]
          }
        ]
      },
      "split_control_execution": {
        "process_classes": [
          {
            "name": "ingress_node",
            "roles": ["api_ingress"]
          },
          {
            "name": "control_plane_node",
            "roles": ["control_plane", "history_projection"]
          },
          {
            "name": "scheduler_node",
            "roles": ["scheduler"]
          },
          {
            "name": "matching_node",
            "roles": ["matching"]
          },
          {
            "name": "execution_node",
            "roles": ["execution_plane"]
          }
        ]
      }
    },
    "authority_boundaries": {
      "control_plane": {
        "writes": [
          "workflow_instances",
          "workflow_runs.status",
          "workflow_tasks.lifecycle"
        ]
      },
      "execution_plane": {
        "writes": [
          "workflow_tasks.outcomes",
          "activity_attempts",
          "worker_compatibility_heartbeats"
        ]
      },
      "matching": {
        "writes": [
          "workflow_tasks.leases",
          "activity_tasks.leases"
        ]
      },
      "history_projection": {
        "writes": [
          "history_events",
          "workflow_run_summaries",
          "workflow_history_exports"
        ]
      },
      "scheduler": {
        "writes": [
          "workflow_schedules.fire_state",
          "workflow_starts.scheduled"
        ]
      },
      "api_ingress": {
        "writes": ["worker_registrations"]
      }
    },
   "failure_domains": {
      "control_plane_down": {
        "effect": "workers_continue_claimed_tasks_only_until_lease_expiry",
        "operator_signal": "operator_commands_fail_fast"
      },
      "execution_plane_down": {
        "effect": "ready_tasks_accumulate_without_loss",
        "operator_signal": "operators_see_ready_depth_growth"
      },
      "matching_down": {
        "effect": "claim_falls_back_to_direct_ready_task_discovery",
        "operator_signal": "ready_depth_rises_while_claim_rate_falls"
      },
      "history_projection_down": {
        "effect": "projection_reads_may_stale_while_durable_writes_continue",
        "operator_signal": "projection_lag_seconds_may_increase"
      },
      "scheduler_down": {
        "effect": "scheduled_workflows_stop_firing_and_record_missed_runs",
        "operator_signal": "operators_see_missed_schedule_state"
      },
      "api_ingress_down": {
        "effect": "external_http_traffic_stops_at_the_edge",
        "operator_signal": "embedded_in_process_calls_may_continue"
      }
    },
    "scaling_boundaries": {
      "api_ingress": "incoming_http_request_rate",
      "control_plane": "operator_commands_and_run_lifecycle_transitions",
      "matching": "ready_task_rate_and_poller_count",
      "history_projection": "durable_event_rate",
      "scheduler": "active_schedule_count",
      "execution_plane": "workflow_and_activity_task_rate"
    },
    "migration_path": [
      {
        "step": "audit_role_boundaries",
        "result": "tooling flags cross-role writes before runtime shape changes",
        "reversible": true
      },
      {
        "step": "expose_role_bindings",
        "result": "container seams allow out-of-process adapters without patching the package",
        "reversible": true
      },
      {
        "step": "introduce_dedicated_matching_shape",
        "result": "matching can run as its own process class without changing the claim contract",
        "reversible": true
      },
      {
        "step": "split_history_projection",
        "result": "history and projections can move out of process without introducing a second writer",
        "reversible": true
      },
      {
        "step": "split_scheduler",
        "result": "schedule firing can move behind leader election while single-replica deployments stay legal",
        "reversible": true
      },
      {
        "step": "optional_execution_partitioning",
        "result": "workers can partition by namespace, connection, queue, and compatibility",
        "reversible": true
      }
    ],
    "kernel_invariants": [
      {
        "id": "single_persistence_engine",
        "summary": "one workflow database backs every topology shape; role split does not introduce a second persistence engine",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "single_worker_protocol",
        "summary": "one HTTP worker protocol carries claim, complete, fail, and heartbeat traffic across every topology; role split does not fork the worker contract",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "single_history_writer",
        "summary": "history_events has exactly one durable writer per logical event regardless of where the history/projection role runs",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "single_control_authority_per_run",
        "summary": "every mutation of a given workflow run routes through one control-plane authority; per-run row locks serialise transitions across replicas",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "embedded_topology_remains_supported",
        "summary": "the embedded shape where one process fills every role MUST stay legal; existing embedded hosts are never forced to migrate",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "role_split_is_topology_only",
        "summary": "splitting roles is a topology change, not a product fork; collapsing the roles back onto a single process is always a legal topology",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      }
    ]
  },
  "coordination_health": {
    "schema": "durable-workflow.v2.coordination-health.contract",
    "version": 2,
    "namespace_scope": "all_namespaces",
    "status": "ok",
    "http_status": 200,
    "warning_checks": [],
    "error_checks": [],
    "categories": {
      "correctness": "ok"
    },
    "checks": [
      {
        "name": "worker_compatibility",
        "status": "ok",
        "category": "correctness",
        "message": null
      },
      {
        "name": "activity_path",
        "status": "ok",
        "category": "correctness",
        "message": null
      }
    ],
    "routing_drains": {
      "queues_with_drains": 0,
      "draining_build_id_count": 0,
      "active_worker_count": 0,
      "draining_worker_count": 0,
      "stale_worker_count": 0,
      "queues": []
    }
  }
}
```

Interprete `topology.version` como la versión de esquema del manifiesto de roles, no como sinónimo de la versión de compilación de Server. La automatización debe comprobar ese campo antes de asumir campos añadidos en revisiones posteriores. El contrato público actual incluye `supported_shapes`, `role_vocabulary`, `current_shape`, `current_process_class`, `current_roles`, `execution_mode`, `matching_role`, `role_catalog`, `shape_assignments`, `authority_boundaries`, `authority_surfaces`, `failure_domains`, `supported_topologies`, `scaling_boundaries`, `migration_path` y `kernel_invariants`.

Interprete los campos así:

- `supported_shapes` enumera las topologías admitidas del producto.
- `role_vocabulary` es la lista fija de roles v2. Es el vocabulario canónico para automatización y diagnósticos.
- `current_shape`, `current_process_class` y `current_roles` describen el nodo consultado ahora. Use `current_process_class` como su identidad declarada y compare el conjunto de roles con `shape_assignments` de esa topología para validarla.
- `execution_mode` distingue la ejecución local de cola integrada (`local_queue_worker`) de la ejecución de Server independiente mediante el protocolo de workers (`remote_worker_protocol`).
- `matching_role.queue_wake_enabled`, `matching_role.shape`, `matching_role.wake_owner`, `matching_role.task_dispatch_mode`, `matching_role.partition_primitives` y `matching_role.backpressure_model` indican si el nodo conserva el despertar dentro del worker o espera que un bucle dedicado de reparación o asignación haga ese barrido, qué ejes de enrutamiento permanecen estables y qué límite duradero de admisión aplica la capa de asignación.
- `matching_role.discovery_limits` fija los valores numéricos de asignación compilados en el paquete: `poll_batch_cap`, máximo de filas listas por sondeo; `availability_ceiling_seconds`, tolerancia entre backends de `available_at` ante diferencias subsegundo; `wake_signal_ttl_seconds`, TTL predeterminado de señales de despertar del long polling; `workflow_task_lease_seconds`, lease predeterminado de tarea de workflow; y `activity_task_lease_seconds`, lease predeterminado de tarea de actividad. Permiten comprobar el contrato sin buscar en el código del paquete. Reducir un valor es un cambio de protocolo.
- `role_catalog` y `authority_surfaces` indican las interfaces y rutas de modificación duradera que controla cada rol en esta revisión del manifiesto.
- `shape_assignments` asocia cada topología admitida con las clases de proceso y conjuntos de roles que puede ejecutar.
- `supported_topologies` resume las familias de despliegue admitidas y las clases de nodo que espera cada una.
- `authority_boundaries` indica qué escrituras duraderas debe modificar cada rol, para detectar desvíos entre roles antes de dividir un despliegue.
- `failure_domains` describe la primera señal de degradación visible al operador cuando falla un rol, en vez de dejarla implícita en un procedimiento.
- `scaling_boundaries` identifica la principal dimensión de carga de cada rol al dividir la topología.
- Las rutas alojadas autenticadas rechazan la operación si el nodo no aloja esa interfaz HTTP de control. Server devuelve `503` con `reason: "topology_role_unavailable"`, `current_shape`, `current_process_class`, `current_roles`, `required_roles` y `missing_roles` para redirigir al cliente a un nodo que sí exponga la interfaz.
- `coordination_health` es el resumen de seguridad del despliegue de toda la flota publicado en la misma llamada. Usa el alcance `all_namespaces`, resume estado y respuesta HTTP, enumera nombres normalizados de comprobaciones de advertencia y error que también alimentan la disponibilidad, y añade `blocked_by`, `message` y `remediation` cuando requisitos previos impiden evaluar la seguridad.
- `coordination_health.checks[]` siempre incluye la comprobación fija `activity_path` junto a `worker_compatibility`, `task_transport`, `routing_health`, `durable_resume_paths` y las comprobaciones de proyecciones y planificador. `activity_path` es el equivalente de `task_transport` para actividades: muestra plazos de programación a inicio, inicio a cierre, programación a cierre o heartbeat vencidos sin aplicar (`timeout_overdue`, `oldest_timeout_overdue_at`, `max_timeout_overdue_age_ms`) y reintentos persistentes pendientes (`retrying`, `oldest_retrying_started_at`, `max_retrying_age_ms`). Renombrar la comprobación es un cambio de protocolo.
- `coordination_health.routing_drains` resume cohortes de compilación en drenaje entre colas y namespaces. Si `queues_with_drains` es mayor que cero, la flota está apartando tráfico intencionadamente de al menos una cohorte en drenaje.
- `migration_path` enumera los pasos ordenados desde la distribución independiente actual hacia límites de roles más aislados sin introducir otro motor. `reversible: true` en cada entrada declara que volver a una topología menos aislada sigue siendo válido.
- `kernel_invariants` enumera las garantías duraderas que debe conservar la división de roles en cualquier topología admitida: `single_persistence_engine`, `single_worker_protocol`, `single_history_writer`, `single_control_authority_per_run`, `embedded_topology_remains_supported` y `role_split_is_topology_only`. `applies_to` de cada entrada enumera las topologías cubiertas. La automatización PUEDE usarlo para comprobar que un cambio conserva el núcleo antes de aplicarlo.

Así, la división de roles es un cambio de topología, no otro motor ni otra API de plano de control. Al pasar de una flota `standalone_server` reducida a `split_control_execution`, los operadores siguen leyendo la misma interfaz de descubrimiento. `current_shape`, `current_roles`, `execution_mode`, `matching_role`, `shape_assignments`, `authority_boundaries`, `failure_domains`, `scaling_boundaries` y `migration_path` se versionan juntos en un manifiesto para que las herramientas interpreten la misma topología que publica Server.

La misma restricción se expone de forma legible por máquina en `topology.kernel_invariants`, para que la automatización compruebe antes del cambio que no introduce otro motor de persistencia, una bifurcación del protocolo de workers, otro escritor de historial o una migración irreversible.

El bloqueo de rutas alojadas solo afecta a endpoints autenticados de API y workers. `GET /api/health`, `GET /api/ready` y `GET /api/cluster/info` autenticado siguen disponibles para descubrimiento, vida e inspección de topología incluso en procesos `scheduler_node`, `matching_node` y `execution_node` que no alojan la interfaz HTTP de control.

Para manejadores externos independientes del transporte, el mismo endpoint publica `worker_protocol.external_execution_surface_contract`. Ese manifiesto define la [interfaz de ejecución externa de nivel actividad](/docs/polyglot/external-execution), enlaza los contratos de entrada y resultado de tareas externas y mantiene el replay del workflow, `ContinueAsNew`, el orden de señales, actualizaciones y consultas y la interpretación del historial dentro de runtimes reales.

Notas de campos para clientes:

- La versión de la aplicación es `version`, no `server_version`.
- Las capacidades de comandos de tareas de workflow están en `worker_protocol.server_capabilities.supported_workflow_task_commands`, no en el nivel superior de `worker_protocol`. El mismo objeto anidado aparece en cada respuesta del plano de workers mediante `server_capabilities`.
- `worker_protocol.server_capabilities.poll_status` indica que las respuestas de sondeo conservan `poll_status` incluso sin un lease. Los workers pueden distinguir `empty`, `throttled`, `unavailable` y `draining` sin interpretar mensajes de error en prosa.
- Las opciones de comandos de workers, incluidas políticas de reintento, tiempos de espera, política de cierre del padre y errores no reintentables, también se reflejan en `server_capabilities` para negociar el comportamiento sin otra consulta de información del clúster.
- El único codec de cargas v2 está en `capabilities.payload_codecs` y la lista es exactamente `['avro']`. Los serializadores PHP v1 de importación y drenaje son mecanismos internos de migración y nunca aparecen en las capacidades del runtime.

## Conectar workers {#connecting-workers}

Los workers sondean Server y ejecutan código de workflow o actividades. Consulte la referencia del [protocolo de workers](/docs/polyglot/worker-protocol) para el contrato completo. Para la matriz de roles de rutas, reglas de namespace y datos exactos de registro, consulte [Namespace, autenticación y registro de workers](/docs/polyglot/namespace-auth-workers).

### Workers PHP {#php-workers}

Las aplicaciones PHP independientes de frameworks y los workers remotos usan el SDK de Server independiente. No instalan Laravel ni el paquete Workflow integrado:

<!-- docs-example id="server.php-sdk.install" -->
```bash
composer require %%artifact.phpSdkComposerPackage%%
```

Cree un cliente y registre funciones de workflow o actividad en un worker:

```php
use DurableWorkflow\Client;
use DurableWorkflow\Worker;
use DurableWorkflow\Worker\WorkflowContext;

$client = new Client(
    'http://localhost:8080',
    token: getenv('DURABLE_WORKFLOW_AUTH_TOKEN') ?: null,
    namespace: 'default',
);

$worker = new Worker($client, taskQueue: 'polyglot-php');
$worker->registerWorkflow(
    'invoice',
    static function (WorkflowContext $context, string $invoiceId): array {
        $context->activity('charge-card', [$invoiceId]);

        return ['invoice_id' => $invoiceId, 'status' => 'paid'];
    },
);
$worker->run();
```

Consulte la [guía del SDK de PHP](/docs/polyglot/php/) para el cliente, autenticación, cargas y ciclo de vida del worker. El paquete independiente `durable-workflow/workflow` es el runtime integrado en Laravel y el motor alojado en la imagen publicada de Server. Los workflows integrados ejecutan tareas del paquete mediante el worker de la aplicación y no necesitan este Server.

### Workers Python {#python-workers}

Los workers Python usan el SDK `durable-workflow`:

```bash
pip install %%artifact.pythonPackagePin%%
```

Consulte la guía del [SDK de Python](/docs/polyglot/python) para configurar workers.

### Workers en otros lenguajes {#custom-language-workers}

Cualquier lenguaje puede implementar un worker:
1. Registrándolo con `POST /api/worker/register`
2. Sondeando mediante `POST /api/worker/workflow-tasks/poll`, `POST /api/worker/activity-tasks/poll` o `POST /api/worker/query-tasks/poll`
3. Completando tareas con `POST /api/worker/workflow-tasks/{id}/complete`, `POST /api/worker/activity-tasks/{id}/complete` o `POST /api/worker/query-tasks/{id}/complete`

Todas las solicitudes requieren:
- `Authorization: Bearer $TOKEN`
- `X-Namespace: your-namespace`
- `X-Durable-Workflow-Protocol-Version: 1.0`

Server comprueba que exista el namespace. Regístrelo mediante `POST /api/namespaces` antes de dirigirle workers o clientes. En caso contrario, devuelve `404` con `reason: "namespace_not_found"`.

Consulte el [README de Server](https://github.com/durable-workflow/server#getting-started-end-to-end-workflow) para un recorrido con curl.

Consulte [Admisión de colas](/docs/polyglot/task-queue-admission) para ajustar slots de registro, límites de leases activos de Server, presupuestos de despacho por minuto y contrapresión de consultas.

## CLI {#cli}

La [CLI de Durable Workflow](/docs/polyglot/cli) ofrece una interfaz de shell para Server:

```bash
# Install — Linux and macOS
curl -fsSL https://durable-workflow.com/install.sh | sh

# Install — macOS (Homebrew alternative)
brew install durable-workflow/tap/dw

# Install — Windows (PowerShell)
# irm https://durable-workflow.com/install.ps1 | iex

# Configure
export DURABLE_WORKFLOW_SERVER_URL=http://localhost:8080
export DURABLE_WORKFLOW_AUTH_TOKEN=your-token
export DURABLE_WORKFLOW_NAMESPACE=default

# Use
dw server:health
dw workflow:list
dw workflow:start --type=my-workflow --input='["value"]'
dw workflow:start --type=my-workflow --input-file=input.json
```

Consulte la [página de instalación de la CLI](/docs/polyglot/cli#install) para un instalador que detecta la plataforma y descargas directas de binarios.

Los comandos de colas muestran el estado de admisión de tareas de workflow, actividad y consulta. Úselos para distinguir workers ausentes, slots saturados, restricciones de Server por leases activos o ritmo de despacho y exceso de consultas pendientes.

## Despliegue {#deployment}

Use la [guía de despliegue autogestionado](/docs/deployment) para elegir una topología admitida antes de recibir tráfico de producción. Distingue desarrollo local, producción en un nodo, clústeres pequeños, manifiestos Kubernetes directos y topologías guiadas por soporte.

El contrato de clúster pequeño autogestionado es acotado: 2 o 3 nodos API sin estado detrás de un balanceador, una base MySQL o PostgreSQL externa compartida, Redis compartido, workers escalados por separado y un único planificador o proceso de mantenimiento. Elija actualizaciones con parada total o [graduales](/docs/rolling-upgrades) según la versión. Ese contrato establece los requisitos de desfase de versiones, esquema, drenaje, disponibilidad y reversión. Clústeres SQLite, despliegues multinodo sin Redis, planificadores duplicados, operación multirregión activa/activa y failover específico del proveedor quedan fuera hasta validarse por separado. La vía Helm, versionada por separado, se documenta en la [guía de despliegue](/docs/deployment#helm-chart-for-kubernetes). El material multirregión activo/pasivo de la [guía de autogestión](/docs/deployment#activepassive-multi-region) orienta evaluaciones con soporte, no prueba un contrato 2.0 autoservicio. Cada región candidata debe partir de una topología documentada de una región o clúster pequeño.

Para despliegues autogestionados, comience con imágenes publicadas en vez de compilaciones del árbol fuente:

- Docker Hub: `%%artifact.serverDockerHubImage%%`
- GitHub Container Registry: `%%artifact.serverGhcrImage%%`
- Compose de imagen publicada: [`docker-compose.published.yml`](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml)
- Manifiestos Kubernetes directos: [`k8s/`](https://github.com/durable-workflow/server/tree/main/k8s)

Los despliegues de producción deben fijar una etiqueta de versión o digest, usar credenciales por rol, ejecutar inicialización y migraciones antes del tráfico y demostrar disponibilidad con `/api/ready`, `/api/cluster/info` y registro de workers. No cambie el tráfico basándose solo en `/api/health`.

## Referencia de la API {#api-reference}

Para una referencia completa de endpoints, cabeceras obligatorias, roles, protocolo de workers, almacenamiento externo y motivos de error, consulte la [referencia de la API de Server](/docs/polyglot/server-api-reference).

Server expone tres interfaces API:

### Plano de control {#control-plane}

Inicie, describa, señalice, consulte, actualice, cancele y termine workflows. Gestione namespaces, colas, programaciones, atributos de búsqueda y workers. Cada solicitud del plano de control requiere `X-Durable-Workflow-Control-Plane-Version: 2`. Si falta, se rechaza con `missing_control_plane_version`.

Endpoints principales:
- `POST /api/workflows`: iniciar un workflow
- `GET /api/workflows/{id}`: describir un workflow
- `POST /api/workflows/{id}/signal/{name}`: enviar una señal
- `POST /api/workflows/{id}/query/{name}`: ejecutar una consulta
- `POST /api/workflows/{id}/update/{name}`: ejecutar una actualización
- `POST /api/workflows/{id}/cancel`: cerrar la ejecución inmediatamente como cancelada
- `POST /api/workflows/{id}/terminate`: terminar de inmediato
- `GET /api/workflows/{id}/runs/{runId}/history`: listar eventos de la ejecución
- `GET /api/workflows/{id}/runs/{runId}/history/export`: exportar un paquete de replay
- `GET /api/namespaces`, `POST /api/namespaces`, `GET|PUT /api/namespaces/{namespace}`: gestión de namespaces
- `GET /api/workers`, `GET|DELETE /api/workers/{id}`: gestión de la flota de workers
- `GET /api/task-queues`, `GET /api/task-queues/{taskQueue}`: tareas pendientes, sondeadores, leases y admisión de colas
- `GET|POST /api/schedules`, `GET|PUT|DELETE /api/schedules/{id}`, `POST /api/schedules/{id}/{pause|resume|trigger|backfill}`: gestión de programaciones
- `GET|POST|DELETE /api/search-attributes`: gestión de atributos de búsqueda
- `GET|POST|PUT|DELETE /api/service-endpoints...`: catálogo de servicios solo para administradores, servicios anidados, enlaces de operaciones y snapshots duraderos de llamadas
- `POST /api/system/repair/pass`, `POST /api/system/activity-timeouts/pass`, `POST /api/system/retention/pass`: pasadas del operador

Las respuestas del plano de control, incluidas las listas del historial, contienen metadatos anidados `control_plane` que identifican la operación y la versión del contrato de respuesta. La exportación de historial no usa esa envoltura: devuelve el paquete de replay sin cambios para que su suma de integridad y firma opcional cubran el artefacto exacto recibido.

Los errores de validación devuelven HTTP 422 con `reason: validation_failed`, `errors` y `validation_errors`. Las rutas de operaciones también reflejan esos datos en `control_plane.reason` y `control_plane.validation_errors`. Las rutas dirigidas a una ejecución concreta reflejan el `run_id` de la URL en la respuesta y en `control_plane.run_id`, para distinguir comandos de instancia de los dirigidos a una ejecución seleccionada.

La visibilidad de colas permite determinar si el retraso procede del crecimiento de tareas pendientes, slots no disponibles o límites de admisión. `GET /api/task-queues` devuelve un resumen por cola y `GET /api/task-queues/{taskQueue}` lo amplía con `pollers` y `current_leases`. Ambas rutas exponen `stats.approximate_backlog_count`, `stats.approximate_backlog_age_seconds` y contadores de disponibilidad y leases por tipo en `stats.workflow_tasks.*` / `stats.activity_tasks.*`. El detalle también incluye `admission` para separar presión de capacidad y restricciones de Server sobre colas o consultas. Las tasas de entrada y despacho globales están en `operator_metrics.backlog.tasks_added_last_minute` y `operator_metrics.backlog.tasks_dispatched_last_minute`. Las rutas de colas exponen `stats.tasks_added_last_minute` y `stats.tasks_dispatched_last_minute` para comparar una sola cola.

### Protocolo de workers {#worker-protocol}

Los workers se registran, sondean, envían heartbeats y completan tareas. Se requiere `X-Durable-Workflow-Protocol-Version: 1.0`.

Endpoints principales:
- `POST /api/worker/register`: registrar un worker
- `POST /api/worker/workflow-tasks/poll`: long polling de tareas de workflow
- `POST /api/worker/workflow-tasks/{id}/complete`: completar una tarea de workflow
- `POST /api/worker/query-tasks/poll`: long polling de consultas de workflow enrutadas por Server
- `POST /api/worker/query-tasks/{id}/complete`: completar una tarea de consulta de workflow
- `POST /api/worker/query-tasks/{id}/fail`: fallar o rechazar una tarea de consulta de workflow
- `POST /api/worker/activity-tasks/poll`: long polling de tareas de actividad
- `POST /api/worker/activity-tasks/{id}/complete`: completar una tarea de actividad

Consulte la referencia del [protocolo de workers](/docs/polyglot/worker-protocol) para más detalles.

### Descubrimiento sin versión {#discovery-unversioned}

Los únicos endpoints que **no** requieren `X-Durable-Workflow-Control-Plane-Version` son los de descubrimiento y las comprobaciones de salud:

- `GET /api/health`: comprobación de vida y resumen público `topology`, sin autenticación
- `GET /api/ready`: comprobación de disponibilidad y el mismo resumen `topology`, sin autenticación
- `GET /api/cluster/info`: capacidades de Server, versiones de protocolo y el único codec de cargas Avro. Los clientes deben consultarlo primero para descubrir las versiones de plano de control y protocolo de workers admitidas.

## Resolución de problemas {#troubleshooting}

### Los workers no reciben tareas {#workers-not-receiving-tasks}

**Compruebe:**
1. ¿Se registraron los workers? `curl http://localhost:8080/api/workers -H "Authorization: Bearer $TOKEN" -H "X-Durable-Workflow-Control-Plane-Version: 2" -H "X-Namespace: default"`
2. ¿Sondean la cola correcta?
3. ¿Se inició el workflow con esa cola?
4. ¿Se comparte la caché entre las instancias de Server?

### Las conexiones de long polling vencen de inmediato {#long-poll-connections-timing-out-immediately}

**Compruebe:**
1. ¿El controlador de caché permite bloqueos atómicos? Pruebe `php artisan workflow:v2:doctor --strict`
2. ¿Server puede acceder a Redis?
3. ¿El tiempo de espera del balanceador supera el de long polling, que es de 60 s por defecto?

### Errores de conexión a la base de datos {#database-connection-errors}

**Compruebe:**
1. ¿Son correctos el host y el puerto de la base de datos?
2. ¿Son válidas las credenciales?
3. ¿Existe la base de datos?
4. ¿Se ejecutaron las migraciones? `php artisan migrate:status`

### Errores de autenticación {#auth-failures}

**Compruebe:**
1. ¿`DW_AUTH_DRIVER` coincide con el método del cliente?
2. ¿Coincide el token o secreto HMAC entre Server y cliente?
3. ¿Se envían `Authorization: Bearer $TOKEN` o las cabeceras de firma HMAC?

## Más información {#learn-more}

- [Referencia del protocolo de workers](/docs/polyglot/worker-protocol): contrato completo de los workers
- [Migración de integración a Server](/docs/polyglot/embedded-to-server): adoptar Server desde una aplicación Laravel v2 integrada
- [SDK de Python](/docs/polyglot/python): crear workers Python
- [CLI](/docs/polyglot/cli): interfaz de línea de comandos
- [Repositorio de Server](https://github.com/durable-workflow/server): código, incidencias y versiones