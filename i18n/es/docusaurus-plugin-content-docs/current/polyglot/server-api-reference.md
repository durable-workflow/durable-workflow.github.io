---
sidebar_position: 3
title: Referencia de la API del servidor
description: Referencia HTTP de endpoints de plano de control, workers, espacios de nombres, almacenamiento, programaciones y sistema de Durable Workflow Server.
tags:
  - server
  - API
  - reference
  - control-plane
keywords:
  - API de Durable Workflow Server
  - cabecera de versión del plano de control
  - endpoints de protocolo de workers
  - API de almacenamiento externo de cargas útiles
---

# Referencia de la API del servidor {#server-api-reference}

El servidor independiente ofrece una API HTTP+JSON versionada. Utiliza esta página al crear SDK, scripts, adaptadores puente o procedimientos operativos que lo llamen directamente. Consulta la [guía del servidor](/docs/polyglot/server) para despliegue y configuración y la [referencia de comandos de CLI](/docs/polyglot/cli-reference) al invocar `dw` desde shell.

## Cabeceras y versionado {#headers-and-versioning}

Todas las solicitudes autenticadas utilizan tokens bearer salvo que el servidor tenga otro controlador de autenticación:

```http
Authorization: Bearer <token>
X-Namespace: default
Content-Type: application/json
Accept: application/json
```

Las rutas del plano de control requieren:

```http
X-Durable-Workflow-Control-Plane-Version: 2
```

Las rutas del plano de workers requieren:

```http
X-Durable-Workflow-Protocol-Version: 1.0
```

El servidor publica versiones admitidas y contratos legibles por máquinas en `GET /api/cluster/info`. Los clientes deben descubrir allí las versiones antes de iniciar automatizaciones de larga duración. Las versiones ausentes o no admitidas del plano de control se rechazan con un motivo como `missing_control_plane_version` o `unsupported_control_plane_version`.

Para validación, generación de código y detección de desviaciones, utiliza el catálogo normativo de [especificaciones del protocolo de plataforma](/docs/platform-protocol-specs) en lugar de esta referencia en prosa. Enlaza OpenAPI del plano de control, OpenAPI y AsyncAPI de workers, JSON Schema de `cluster_info` y esquemas relacionados de MCP, historial, Waterline y reparación/acciones disponibles.

## Descubrimiento y salud {#discovery-and-health}

Los balanceadores, arranques de SDK y comprobaciones de compatibilidad utilizan estas rutas.

| Método | Ruta | Autenticación | Finalidad |
| --- | --- | --- | --- |
| `GET` | `/api/health` | no | Sonda de actividad y resumen de topología legible por máquinas del nodo que responde. |
| `GET` | `/api/ready` | no | Sonda de preparación con el mismo resumen y comprobaciones de arranque para despliegue seguro. |
| `GET` | `/api/cluster/info` | sí | Identidad, intervalos de SDK admitidos, topología de roles, salud de coordinación, contratos del plano de control y workers, códecs y capacidades. |

Ejemplo:

<!-- docs-example id="server.cluster-info.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/cluster/info" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" | jq '.control_plane.version, .worker_protocol.version'
```

`/api/cluster/info` no exige la cabecera de versión del plano de control porque es el endpoint que anuncia las versiones. También incluye `coordination_health`, resumen de despliegue y preparación de todos los espacios que refleja las comprobaciones que ya determinan la preparación del servidor.

### Resumen público de topología {#public-topology-summary}

`GET /api/health` y `GET /api/ready` devuelven un objeto superior `topology` del contrato implementado de resumen de salud. Utilízalo para identificar qué nodo respondió antes de lograr autenticación del plano de control, resolución de espacios o descubrimiento completo con `/api/cluster/info`.

El resumen público siempre incluye:

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

`topology.matching_role.discovery_limits` es el contrato numérico fijo del rol de asignación: `poll_batch_cap` es el máximo de filas listas por sondeo; `availability_ceiling_seconds` es la tolerancia entre backends aplicada a `available_at` para evitar excluir tareas recién disponibles por desviaciones temporales inferiores a un segundo; `wake_signal_ttl_seconds` es el TTL predeterminado de `CacheLongPollWakeStore`; y `workflow_task_lease_seconds` / `activity_task_lease_seconds` son las duraciones predeterminadas de leases de workflow y actividad. Reducir estos valores cambia el protocolo porque workers y herramientas posteriores los leen como autoridad del contrato; renombrar un campo también rompe el protocolo.

`/api/ready` devuelve el mismo bloque `topology` incluso con `status` superior `not_ready`, para distinguir respuestas de `server_http_node`, `scheduler_node`, `matching_node` y `execution_node` mientras existan bloqueos de arranque.

Ejemplo:

<!-- docs-example id="server.health.topology.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/health" | jq '{
  status,
  topology: {
    schema: .topology.schema,
    version: .topology.version,
    current_shape: .topology.current_shape,
    current_process_class: .topology.current_process_class,
    current_roles: .topology.current_roles,
    execution_mode: .topology.execution_mode,
    matching_role: .topology.matching_role
  }
}'
```

### Bloqueos de preparación {#readiness-blockers}

`GET /api/ready` devuelve `status` superior y `checks` legibles por máquinas. Dos comprobaciones determinan si el servidor puede evaluar con seguridad la salud del despliegue:

- `checks.migrations` es la restricción de arranque y migraciones. Publica `repository_exists`, `pending_migrations`, `adoptable_migrations`, `blocking_migrations`, `missing_tables`, `operator_surface` y `readiness_contract`.
- `adoptable_migrations` significa que las tablas existentes solo necesitan adoptar el historial de migraciones. El servidor sigue listo e informa de `status: "warning"` para programar la adopción antes de la siguiente pasada de migración.
- `blocking_migrations` significa que aún se necesitan registros de migración para seguridad del despliegue. El servidor rechaza atender con `status: "pending"` y `remediation` en lugar de aparentar una flota actualizada.
- `operator_surface.available` y `operator_surface.required_tables` indican si la interfaz operativa v2 tiene las tablas duraderas necesarias tras arrancar.
- `readiness_contract.version` fija la revisión del contrato de instalación y adopción que deben esperar los scripts.
- `checks.workflow_v2` refleja el dictamen de seguridad de todos los espacios. Si faltan requisitos, informa de `status: "blocked"` y añade `blocked_by`, `message` y `remediation` sin simular salud.

Ejemplo:

<!-- docs-example id="server.ready.blockers.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/ready" | jq '{
  status,
  migrations: {
    status: .checks.migrations.status,
    adoptable_migrations: .checks.migrations.adoptable_migrations,
    blocking_migrations: (.checks.migrations.blocking_migrations | map(.migration)),
    missing_tables: .checks.migrations.missing_tables,
    operator_surface: .checks.migrations.operator_surface,
    readiness_contract: .checks.migrations.readiness_contract
  },
  workflow_v2: {
    status: .checks.workflow_v2.status,
    blocked_by: .checks.workflow_v2.blocked_by,
    remediation: .checks.workflow_v2.remediation
  }
}'
```

### Manifiesto de topología del clúster {#cluster-topology-manifest}

`/api/cluster/info` devuelve además el manifiesto `topology` del nodo bajo `durable-workflow.v2.role-topology`. Es la forma admitida de descubrir si actúa como `standalone_server`, `embedded` o `split_control_execution`, sus roles y las expectativas de `matching_role`, `shape_assignments`, `authority_boundaries`, `failure_domains`, `scaling_boundaries` y `migration_path`. La misma respuesta publica el estado actual de seguridad del despliegue del nodo.

Interpreta el manifiesto así:

- `topology.current_shape`, `topology.current_process_class`, `topology.current_roles` y `topology.execution_mode` indican la forma real atendida. Describen el nodo que responde, no toda la flota.
- `topology.role_vocabulary` es la lista fija de nombres válidos de roles v2.
- `topology.matching_role.queue_wake_enabled`, `topology.matching_role.shape`, `topology.matching_role.wake_owner`, `topology.matching_role.task_dispatch_mode`, `topology.matching_role.partition_primitives` y `topology.matching_role.backpressure_model` indican si el descubrimiento general ocurre en el worker o en un barrido dedicado, quién lo gestiona, qué ejes siguen estables y qué límite de admisión duradera aplica v2.
- `topology.matching_role.discovery_limits` publica `poll_batch_cap`, `availability_ceiling_seconds`, `wake_signal_ttl_seconds`, `workflow_task_lease_seconds` y `activity_task_lease_seconds`. Verifica con ellos el despliegue; el paquete emite los mismos identificadores en `dw server:info`, métricas operativas y salud por espacio de nombres.
- `topology.role_catalog` y `topology.authority_surfaces` asocian los roles con interfaces, escrituras duraderas y rutas de lectura que debe esperar la automatización.
- `topology.shape_assignments` inventaría las clases de proceso de cada forma. Compara el conjunto actual de roles con esta tabla para identificar la clase documentada del nodo.
- `topology.supported_topologies` resume las familias de despliegue admitidas y sus clases esperadas de nodo.
- `coordination_health` resume riesgos de despliegue y compatibilidad de toda la flota. Además de `status` y `http_status`, publica `blocked_by`, `message` y `remediation` cuando faltan requisitos como migraciones o acceso a base de datos.
- `coordination_health.checks[]` siempre incluye `activity_path` junto a `worker_compatibility`, `task_transport`, `routing_health`, `durable_resume_paths` y comprobaciones de proyección/planificador. `activity_path` es la contraparte de actividad de `task_transport`: muestra plazos de programación a inicio, inicio a cierre, programación a cierre o latido vencidos sin aplicar (`timeout_overdue`, `oldest_timeout_overdue_at`, `max_timeout_overdue_age_ms`) y reintentos de actividad acumulados sostenidos (`retrying`, `oldest_retrying_started_at`, `max_retrying_age_ms`). Renombrarla cambia el protocolo.
- `coordination_health.routing_drains` resume cohortes por build id drenando entre espacios y colas. Utiliza `queues_with_drains` y las entradas `build_ids` por cola para ver dónde se evita intencionadamente enviar tráfico a workers en drenaje.
- `execution_mode` distingue ejecución integrada `local_queue_worker` de ejecución por protocolo `remote_worker_protocol`.
- `split_control_execution` es una topología admitida, no otro producto servidor ni otra API.

Ejemplo:

<!-- docs-example id="server.cluster-info.topology.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/cluster/info" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  | jq '{
    current_shape: .topology.current_shape,
    current_roles: .topology.current_roles,
    execution_mode: .topology.execution_mode,
    matching_role: .topology.matching_role,
    coordination_health: {
      status: .coordination_health.status,
      http_status: .coordination_health.http_status,
      blocked_by: .coordination_health.blocked_by,
      queues_with_drains: .coordination_health.routing_drains.queues_with_drains
    }
  }'
```

Para el contrato conceptual, incluidos vocabulario y ruta de migración, consulta [Topología de roles de Server](/docs/polyglot/server-role-topology).

### Rechazos por topología de nodo incorrecto {#wrong-node-topology-rejections}

Las rutas alojadas autenticadas rechazan solicitudes si el nodo no aloja la interfaz de control HTTP necesaria. La restricción se aplica después de validar rol y versión y antes de resolver el espacio de nombres, sin filtrar su existencia.

Al bloquear, devuelve `503` con `reason: "topology_role_unavailable"` y:

- `current_shape`: forma anunciada por el nodo.
- `current_process_class`: clase declarada, como `scheduler_node` o `execution_node`.
- `current_roles`: roles realmente alojados.
- `required_roles`: roles alojados necesarios para el endpoint.
- `missing_roles`: subconjunto de `required_roles` ausente.

El plano de control devuelve la carga en su sobre. Las rutas de workers devuelven los mismos campos en el suyo y conservan la cabecera de versión normal.

Ejemplo de respuesta de `GET /api/workflows` al llegar a un nodo exclusivo de planificación:

```json
{
  "reason": "topology_role_unavailable",
  "message": "This node does not host the topology roles required for this endpoint.",
  "current_shape": "standalone_server",
  "current_process_class": "scheduler_node",
  "current_roles": ["scheduler"],
  "required_roles": ["api_ingress", "control_plane"],
  "missing_roles": ["api_ingress", "control_plane"]
}
```

`GET /api/health`, `GET /api/ready` y `GET /api/cluster/info` autenticado siguen disponibles para actividad y descubrimiento incluso en nodos sin la interfaz de control HTTP actual.

### Restricción de arranque de workflow {#workflow-bootstrap-gate}

Las rutas autenticadas que modifican o atienden tráfico v2 también rechazan solicitudes si `checks.workflow_v2.status` es `blocked`. La restricción se aplica tras validar rol y versión y antes de resolver el espacio, por lo que una solicitud durante un despliegue bloqueado nunca observa su existencia.

Al activarse, devuelve `503` con `reason: "workflow_v2_blocked"` y:

- `blocked_by`: lista ordenada de bloqueos de preparación previos (como `migrations`) que impiden atender v2 con seguridad.
- `remediation`: instrucción breve para eliminarlos, reflejada desde `checks.workflow_v2.remediation` de `/api/ready`.

Las familias restringidas son:

- **Inicio y modificación de workflows**: todas las rutas `/api/workflows` de los grupos de inicio, descripción, comandos y comandos dirigidos a ejecución (por ejemplo, `POST /api/workflows`, `POST /api/workflows/{workflowId}/signal/{signalName}`, `POST /api/workflows/{workflowId}/runs/{runId}/cancel`).
- **Modificación de programaciones**: `POST /api/schedules`, `PUT /api/schedules/{scheduleId}`, `DELETE /api/schedules/{scheduleId}`, `POST /api/schedules/{scheduleId}/pause`, `POST /api/schedules/{scheduleId}/resume`, `POST /api/schedules/{scheduleId}/trigger` y `POST /api/schedules/{scheduleId}/backfill`.
- **Adaptadores puente**: `POST /api/bridge-adapters/webhook/{adapter}`.
- **Protocolo de workers**: todas las rutas `/api/worker` y `/api/worker/*`, incluidos registro, latidos y sondeo/finalización/fallo/latidos de tareas de workflow, consulta y actividad.

Las **lecturas** de programación están exentas para inspeccionar durante la recuperación: `GET /api/schedules`, `GET /api/schedules/{scheduleId}` y `GET /api/schedules/{scheduleId}/history` siguen atendiendo mientras se bloquean otras rutas.

Las rutas del plano de control devuelven la carga de bloqueo en su sobre con `X-Durable-Workflow-Control-Plane-Version`. Las de workers devuelven los mismos `reason`, `blocked_by` y `remediation` en su sobre con `X-Durable-Workflow-Protocol-Version`, para decidir según el motivo legible por máquinas sin inferir estado de cola de un `503` aislado.

Ejemplo de respuesta de `POST /api/workflows` si falta una migración de seguridad del despliegue:

```json
{
  "reason": "workflow_v2_blocked",
  "message": "This node is not ready to serve workflow v2 traffic until bootstrap blockers are cleared.",
  "blocked_by": ["migrations"],
  "remediation": "Restore database connectivity and migrate the workflow tables before relying on workflow v2 rollout-safety health."
}
```

La misma carga se devuelve en el sobre de workers para `/api/worker/*`, de modo que los SDK sigan usando `reason` y reintenten cuando se resuelva el bloqueo.

### Salud del sistema por espacio de nombres {#namespace-scoped-system-health}

`GET /api/system/health` es la interfaz autenticada de seguridad de despliegue y coordinación de un espacio. Requiere admin y `X-Durable-Workflow-Control-Plane-Version: 2`, resuelve el espacio según las reglas normales y devuelve el espacio exacto evaluado y la instantánea actual `health`:

<!-- docs-example id="server.system-health.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/system/health" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  | jq '{namespace, status: .health.status, healthy: .health.healthy}'
```

Interpreta la carga así:

- `namespace`: espacio cuyo estado de despliegue/coordinación se evaluó.
- `health.status` y `health.healthy`: dictamen superior legible por máquinas.
- `health.checks` y `health.categories`: datos de preparación, compatibilidad, proyección y coordinación por interfaz.
- `health.operator_metrics`: métricas actuales de colas, workers y reparación del espacio en la misma instantánea.
- `health.structural_limits`: límites estructurales efectivos y diagnósticos relacionados que se aplican al espacio.

## Plano de control de workflows {#workflow-control-plane}

Las rutas de workflow son de operador/plano de control. Requieren rol operator o admin y `X-Durable-Workflow-Control-Plane-Version: 2`.

| Método | Ruta | Finalidad |
| --- | --- | --- |
| `GET` | `/api/workflows` | Listar instancias. Admite filtros por estado, tipo, texto de consulta y límite. |
| `POST` | `/api/workflows` | Iniciar una instancia. |
| `GET` | `/api/workflows/{workflowId}` | Describir la ejecución actual de un ID de workflow. |
| `GET` | `/api/workflows/{workflowId}/debug` | Devolver diagnósticos acotados de una ejecución atascada. |
| `GET` | `/api/workflows/{workflowId}/runs` | Listar ejecuciones de un ID. |
| `GET` | `/api/workflows/{workflowId}/runs/{runId}` | Describir una ejecución concreta. |
| `GET` | `/api/workflows/{workflowId}/runs/{runId}/debug` | Devolver diagnósticos acotados de una ejecución seleccionada. |
| `GET` | `/api/workflows/{workflowId}/runs/{runId}/history` | Paginar eventos de historial. |
| `GET` | `/api/workflows/{workflowId}/runs/{runId}/history/export` | Exportar el paquete de reproducción para archivo. |

Las solicitudes de inicio utilizan la estructura independiente del lenguaje:

<!-- docs-example id="server.workflow-start.curl" -->
```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/workflows" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_type": "orders.fulfillment",
    "workflow_id": "order-1001",
    "task_queue": "orders",
    "input": ["order-1001"],
    "memo": {"source": "api-reference"},
    "search_attributes": {"CustomerId": "cust-42"},
    "duplicate_policy": "reject"
  }'
```

### Comandos de workflow {#workflow-commands}

El servidor también ofrece rutas cooperativas `request-cancellation`. Consulta [Cancelación cooperativa](/docs/polyglot/cancellation/) para el contrato de limpieza acotada y los requisitos de worker.

Los comandos dirigidos a instancia operan sobre la ejecución actual del ID:

| Método | Ruta | Finalidad |
| --- | --- | --- |
| `POST` | `/api/workflows/{workflowId}/signal/{signalName}` | Enviar una señal. |
| `POST` | `/api/workflows/{workflowId}/query/{queryName}` | Ejecutar una consulta de solo lectura. |
| `POST` | `/api/workflows/{workflowId}/update/{updateName}` | Enviar o ejecutar una actualización. |
| `POST` | `/api/workflows/{workflowId}/cancel` | Cerrar inmediatamente como cancelada; no reanuda la limpieza del workflow. |
| `POST` | `/api/workflows/{workflowId}/terminate` | Forzar la terminación. |
| `POST` | `/api/workflows/{workflowId}/repair` | Solicitar reparación de estado atascado reintentable. |
| `POST` | `/api/workflows/{workflowId}/archive` | Archivar una ejecución cerrada. |

Los comandos dirigidos a ejecución rechazan explícitamente destinos históricos o incorrectos:

| Método | Ruta | Finalidad |
| --- | --- | --- |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/signal/{signalName}` | Enviar una señal solo si la ejecución es actual. |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/query/{queryName}` | Consultar la ejecución seleccionada. |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/update/{updateName}` | Actualizar solo si la ejecución es actual. |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/cancel` | Cancelar solo si la ejecución es actual. |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/terminate` | Terminar solo si la ejecución es actual. |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/repair` | Reparar solo si la ejecución es actual. |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/archive` | Archivar solo si la ejecución es actual y está cerrada. |

Los comandos llevan valores de negocio en sobres Avro. Los SDK oficiales los codifican automáticamente. Un cliente HTTP directo debe usar el sobre `{codec, blob}` del codificador Avro oficial o la referencia del runtime descrita abajo. El documento HTTP exterior es JSON; el JSON de negocio sin codificar no es un códec alternativo.

## Espacios de nombres y almacenamiento {#namespace-and-storage}

Estas rutas requieren operator o admin. Las que modifican espacios o almacenamiento externo requieren admin.

| Método | Ruta | Finalidad |
| --- | --- | --- |
| `GET` | `/api/namespaces` | Listar espacios de nombres. |
| `POST` | `/api/namespaces` | Crear un espacio. |
| `GET` | `/api/namespaces/{namespace}` | Describir retención, metadatos y política de almacenamiento. |
| `PUT` | `/api/namespaces/{namespace}` | Actualizar metadatos o retención. |
| `PUT` | `/api/namespaces/{namespace}/external-storage` | Configurar almacenamiento externo de cargas. |
| `POST` | `/api/storage/test` | Probar ida y vuelta de cargas pequeña y grande mediante el controlador configurado. |

Las políticas permiten que sobres grandes contengan referencias estables en lugar de bytes. Las locales resuelven mediante la ruta de archivos configurada. Las de objetos, como `s3`, `gcs` y `azure`, utilizan un disco explícito y ajustes de bucket/prefijo del servidor.

### Sobre de referencia a carga útil externa {#external-payload-reference-envelope}

Server acepta referencias del **runtime**, distintas de las referencias con URI de proveedor de los helpers embebidos. Una solicitud con `external_storage` se rechaza con HTTP `422` y `external_payload_unsupported`. No copies referencias `file://`, `s3://`, `gs://` o `azure://` en solicitudes a Server.

El sobre del runtime contiene exactamente `codec` y `external_payload`:

```json
{
  "codec": "avro",
  "external_payload": {
    "schema": "durable-workflow.v2.runtime-external-payload-reference.v1",
    "reference_id": "ep_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "codec": "avro",
    "size_bytes": 1048576,
    "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  }
}
```

El identificador y el hash anteriores son ilustrativos. Utiliza sin cambios la referencia devuelta por una subida real. La referencia anidada contiene exactamente cinco campos:

| Campo | Obligatorio | Significado |
| --- | --- | --- |
| `schema` | sí | `durable-workflow.v2.runtime-external-payload-reference.v1`. |
| `reference_id` | sí | ID opaco de Server: `ep_` seguido de 26 caracteres ULID en mayúsculas. No es un URI del proveedor. |
| `codec` | sí | `avro`, igual que en el sobre exterior. |
| `size_bytes` | sí | Tamaño entero no negativo de los bytes codificados subidos. |
| `sha256` | sí | SHA-256 de esos mismos bytes, devuelto como hexadecimal en minúsculas. |

### Transporte de cargas externas del runtime {#runtime-external-payload-transport}

Descubre `namespace.external_payload_storage.transport` mediante `GET /api/cluster/info`. Su esquema es `durable-workflow.v2.runtime-external-payload-transport.v1`, versión `1`. Usa sus rutas y límites solo cuando el almacenamiento del espacio de nombres esté `available`. Server conserva las credenciales del proveedor y no devuelve ubicaciones del proveedor.

| Método | Ruta | Resultado |
| --- | --- | --- |
| `POST` | `/api/external-payloads/v1` | Sube bytes codificados con límites. `201` devuelve el esquema `durable-workflow.v2.runtime-external-payload-upload.v1`, `transport_version: 1` y `reference`. |
| `GET` | `/api/external-payloads/v1/{referenceId}` | Recupera y verifica los bytes codificados referenciados. `200` devuelve `application/octet-stream`. |

Ambas rutas usan una credencial normal del runtime con rol `worker`, `operator` o `admin` y `X-Namespace`. Ambas requieren `X-Durable-Workflow-Payload-Codec`, `X-Durable-Workflow-Payload-Size` y `X-Durable-Workflow-Payload-SHA256`. La subida también requiere `Content-Type: application/octet-stream`. Una búsqueda entre espacios de nombres devuelve no encontrado sin revelar objetos ajenos. Poseer un ID no concede acceso ni autoridad para completar workflows.

Los bytes subidos son los **bytes UTF-8 de la cadena base64 `blob` del sobre Avro oficial**, sin añadir un salto de línea. No son Avro binario decodificado ni JSON de negocio. Calcula longitud y SHA-256 exactamente sobre esos bytes. Por ejemplo, después de instalar el SDK Python:

```bash
python - <<'PY'
from pathlib import Path
from durable_workflow.serializer import encode

Path("payload.avro.txt").write_bytes(
    encode([{"message": "large value", "optional": None}]).encode("utf-8")
)
PY

PAYLOAD_SIZE=$(wc -c < payload.avro.txt | tr -d ' ')
PAYLOAD_SHA256=$(sha256sum payload.avro.txt | cut -d ' ' -f 1)

curl --fail-with-body -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/external-payloads/v1" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: billing" \
  -H "Content-Type: application/octet-stream" \
  -H "X-Durable-Workflow-Payload-Codec: avro" \
  -H "X-Durable-Workflow-Payload-Size: $PAYLOAD_SIZE" \
  -H "X-Durable-Workflow-Payload-SHA256: $PAYLOAD_SHA256" \
  --data-binary @payload.avro.txt > upload.json

REFERENCE_ID=$(jq -r '.reference.reference_id' upload.json)
curl --fail-with-body -sS "$DURABLE_WORKFLOW_SERVER_URL/api/external-payloads/v1/$REFERENCE_ID" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: billing" \
  -H "X-Durable-Workflow-Payload-Codec: avro" \
  -H "X-Durable-Workflow-Payload-Size: $PAYLOAD_SIZE" \
  -H "X-Durable-Workflow-Payload-SHA256: $PAYLOAD_SHA256" \
  -o fetched.avro.txt
cmp payload.avro.txt fetched.avro.txt
```

La subida verifica la integridad de los bytes antes de guardar una referencia. No ejecuta un workflow ni demuestra que los bytes sean una carga de negocio válida. La primera solicitud verificada que incorpora estado reclama la referencia; siguen vigentes la validación de cargas y los controles normales de solicitud, espacio de nombres, intento de tarea y lease. Para subidas de finalización de workers usa el SDK oficial y su contexto descubierto, sin inventar permisos de lease en un cliente directo.

Lee `limits.max_payload_bytes`, `request_timeout_seconds` y `abandoned_upload_expiry_seconds` en el manifiesto. También se aplican las cuotas de bytes y objetos, los límites normales de solicitud y los de subidas de finalización. Por umbral, un valor igual al límite permanece en línea. Los SDK externalizan valores mayores y pueden externalizar otros para que quepa la solicitud agregada.

| Resultado | Estado HTTP | Acción |
| --- | --- | --- |
| Referencia ausente o caducada | `404` / `410` | Restaura el objeto necesario o corrige la referencia. No decodifiques una ausencia como `null`. |
| Sin autorización | `401` / `403` | Corrige credencial, rol o autorización del espacio de nombres. |
| Sobre no admitido o integridad incorrecta | `415` / `422` | Corrige códec, campos, tamaño, hash o bytes codificados. |
| Carga demasiado grande | `413` | Reduce el valor codificado o usa una política mayor permitida. |
| Cuota o permiso de subida agotados | `429` | Revisa la capacidad y reintenta solo dentro del presupuesto original. |
| Almacenamiento no disponible | `503` | Restablece su disponibilidad antes de reintentar dentro del mismo presupuesto. |
| Finalización obsoleta o en conflicto | `409` | No reintentes inventando una identidad de tarea o un lease nuevo. |

Server controla la retención. No hay ruta de borrado para el cliente. Desalojar una caché no debe borrar el objeto. Las subidas sin reclamar pueden caducar; los propietarios retenidos, objetos compartidos, fallos de almacenamiento y retenciones de copias afectan a la limpieza. Un historial exportado con referencias no es una copia autosuficiente de sus bytes.

### Soporte de cargas externas por modo {#external-payload-support-by-mode}

| Cliente o worker | Ruta de almacenamiento | Credenciales del proveedor |
| --- | --- | --- |
| Paquete workflow de Laravel embebido | Política de la aplicación y referencias con URI del proveedor. | Aplicación embebida. |
| SDK PHP | Subida y descarga automáticas descubiertas con referencias opacas. | Server. |
| SDK Python | Subida y descarga automáticas descubiertas con referencias opacas. | Server. |
| SDK Rust | Subida y descarga automáticas descubiertas con referencias opacas. | Server. |
| HTTP directo | Subida y descarga explícitas del runtime y referencia devuelta en un campo de carga admitido. | Server. |

Todos los SDK requieren un transporte del runtime compatible y disponible. Los helpers de proveedores sirven para integraciones embebidas o directas con almacenamiento de la aplicación. Su disponibilidad no convierte los sobres de proveedor en un formato de entrada admitido por Server o Cloud.

El contrato completo de autoridad de solicitudes, resolución de espacios de nombres, credenciales por rol y registro de workers está en [Espacios de nombres, autenticación y registro de workers](/docs/polyglot/namespace-auth-workers).

## API administrativas del catálogo de servicios {#service-catalog-admin-apis}

Las rutas del catálogo son del plano de control autenticadas como admin. Comparten resolución de espacios, restricción de topología y requisito `X-Durable-Workflow-Control-Plane-Version: 2` con el resto del plano alojado.

Utilízalas para registrar metadatos de endpoint, servicio y operación acotados a un espacio para el catálogo entre espacios. Los nombres no distinguen mayúsculas en entrada y se normalizan a minúsculas en respuestas y búsquedas.

| Método | Ruta | Finalidad |
| --- | --- | --- |
| `GET` | `/api/service-endpoints` | Listar endpoints del espacio actual. |
| `POST` | `/api/service-endpoints` | Crear un endpoint de servicio. |
| `GET` | `/api/service-endpoints/{endpointName}` | Describir un endpoint. |
| `PUT` | `/api/service-endpoints/{endpointName}` | Actualizar descripción o metadatos. |
| `DELETE` | `/api/service-endpoints/{endpointName}` | Eliminar un endpoint sin uso. |
| `GET` | `/api/service-endpoints/{endpointName}/services` | Listar servicios del endpoint. |
| `POST` | `/api/service-endpoints/{endpointName}/services` | Crear un servicio del endpoint. |
| `GET` | `/api/service-endpoints/{endpointName}/services/{serviceName}` | Describir un servicio. |
| `PUT` | `/api/service-endpoints/{endpointName}/services/{serviceName}` | Actualizar descripción o metadatos del servicio. |
| `DELETE` | `/api/service-endpoints/{endpointName}/services/{serviceName}` | Eliminar un servicio sin uso. |
| `GET` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations` | Listar operaciones de un servicio. |
| `POST` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations` | Crear un enlace de operación. |
| `GET` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations/{operationName}` | Describir una operación. |
| `GET` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations/{operationName}/service-calls/{serviceCallId}` | Describir una instantánea duradera de llamada. |
| `PUT` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations/{operationName}` | Actualizar un enlace de operación. |
| `DELETE` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations/{operationName}` | Eliminar una operación sin uso. |

Las colecciones utilizan arrays `service_endpoints`, `services` u `operations`. Los recursos incluyen nombres estables en minúsculas, metadatos y marcas temporales:

- Los endpoints devuelven `id`, `namespace`, `endpoint_name`, `description`, `metadata`, `created_at` y `updated_at`.
- Los servicios añaden `endpoint_id` y `service_name`.
- Las operaciones añaden `service_id`, `operation_name`, `operation_mode`, `handler_binding_kind`, `handler_target_reference`, `handler_binding`, `deadline_policy`, `idempotency_policy`, `cancellation_policy`, `retry_policy`, `boundary_policy` y `metadata`.
- Las instantáneas de llamada añaden `caller_namespace`, ID de workflow llamante y vinculado, `status`, `resolved_binding_kind`, `resolved_target_reference`, referencias de cargas, instantáneas de políticas y marcas de ciclo de vida como `accepted_at`, `started_at`, `completed_at`, `failed_at` y `cancelled_at`.

Crear y actualizar operaciones utiliza los mismos campos JSON que la respuesta. `operation_mode` es `sync` o `async`. `handler_binding_kind` es `start_workflow`, `signal_workflow`, `update_workflow`, `query_workflow`, `activity_execution` o `invocable_http`. Las operaciones nuevas deben aportar `handler_target_reference` o una carga no vacía `handler_binding`.

El detalle anidado de llamada también expone `service_call_attempts`, `retry_attempt_count`, el `call_deadline_at` original, fallo tipado y `result_envelope` Avro retenido. Las llamadas aceptadas o iniciadas no son terminales. Un workflow llamante que espera finalización recibe el resultado real o fallo/cancelación terminal del workflow vinculado, conservando identidad y plazo originales.

Utiliza la [inspección de llamadas de CLI](./cli-reference.md#service-call-inspection) o el catálogo de Waterline para inspeccionar la llamada original. Inspeccionar no pide otra ejecución del servicio.

Las eliminaciones se rechazan con HTTP `409` y motivo con nombre si quedan dependientes: por ejemplo, `endpoint_has_services`, `service_has_operations` u `operation_has_service_calls`.

## Adaptadores puente {#bridge-adapters}

Son endpoints de entrada acotada. No ejecutan código de workflow; entregan eventos al plano de control y devuelven un resultado con nombre.

| Método | Ruta | Finalidad |
| --- | --- | --- |
| `POST` | `/api/bridge-adapters/webhook/{adapter}` | Iniciar, señalizar o actualizar un workflow desde un evento de tipo webhook. |

Ejemplo:

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/bridge-adapters/webhook/stripe" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "start_workflow",
    "idempotency_key": "evt_1001",
    "target": {
      "workflow_type": "orders.fulfillment",
      "task_queue": "orders",
      "business_key": "order-1001"
    },
    "input": {"order_id": "order-1001"}
  }'
```

Utiliza `outcome`, `reason`, `idempotency_key` y `control_plane_outcome` en lugar de inferir comportamiento solo del estado HTTP.

## Protocolo de workers {#worker-protocol}

Requiere rol worker y `X-Durable-Workflow-Protocol-Version: 1.0`. Los SDK usan estos endpoints internamente; workers de otros lenguajes pueden implementar el mismo protocolo.

| Método | Ruta | Finalidad |
| --- | --- | --- |
| `POST` | `/api/worker/register` | Registrar identidad, colas, tipos de workflow/actividad, capacidad, runtime y metadatos de versión. |
| `POST` | `/api/worker/heartbeat` | Actualizar visibilidad de flota y compatibilidad. |
| `POST` | `/api/worker/workflow-tasks/poll` | Sondear tareas de workflow con espera larga. |
| `POST` | `/api/worker/workflow-tasks/{taskId}/history` | Obtener historial paginado de una tarea con lease. |
| `POST` | `/api/worker/workflow-tasks/{taskId}/heartbeat` | Enviar latido de una tarea de workflow con lease. |
| `POST` | `/api/worker/workflow-tasks/{taskId}/complete` | Completar una tarea de workflow con comandos. |
| `POST` | `/api/worker/workflow-tasks/{taskId}/fail` | Fallar una tarea de workflow. |
| `POST` | `/api/worker/query-tasks/poll` | Sondear consultas enrutadas con espera larga. |
| `POST` | `/api/worker/query-tasks/{queryTaskId}/complete` | Completar una consulta. |
| `POST` | `/api/worker/query-tasks/{queryTaskId}/fail` | Fallar o rechazar una consulta. |
| `POST` | `/api/worker/activity-tasks/poll` | Sondear actividades con espera larga. |
| `POST` | `/api/worker/activity-tasks/{taskId}/heartbeat` | Enviar latido de actividad con lease. |
| `POST` | `/api/worker/activity-tasks/{taskId}/complete` | Completar una actividad. |
| `POST` | `/api/worker/activity-tasks/{taskId}/fail` | Fallar una actividad. |

Los workers deben tratar ID de leases, intentos, ID de tareas y endpoints de latido como valores opacos emitidos por el servidor. Una lease obsoleta o un ID incorrecto devuelve un error de protocolo con nombre sin completar trabajo silenciosamente.

Si `worker_protocol.server_capabilities.poll_status` es `true`, toda respuesta de sondeo de workflow, actividad y consulta incluye `poll_status` legible por máquinas. Utilízalo como primera decisión antes de inspeccionar campos específicos:

| `poll_status` | Estado HTTP habitual | Significado |
| --- | --- | --- |
| `leased` | `200` | El servidor concedió una lease y `task` contiene la tarea. |
| `empty` | `200` | No había tareas coincidentes listas antes de devolver el sondeo. |
| `throttled` | `200` | La cola es visible, pero los límites de leases o despacho impidieron una tarea nueva. |
| `unavailable` | `503` o `200` | No pudo coordinarse con seguridad el sondeo y se devuelve indisponibilidad tipada, sin simular una cola vacía. |
| `draining` | `409` | La cohorte registrada está drenando; el servidor rechaza trabajo nuevo y devuelve `reason: "worker_draining"`. |

## Visibilidad de flota y colas de tareas {#fleet-and-task-queue-visibility}

Estas rutas del plano de control exponen diagnósticos de flotas y admisión:

| Método | Ruta | Finalidad |
| --- | --- | --- |
| `GET` | `/api/workers` | Listar workers registrados. |
| `GET` | `/api/workers/{workerId}` | Describir un worker. |
| `DELETE` | `/api/workers/{workerId}` | Dar de baja un worker. |
| `GET` | `/api/task-queues` | Listar colas y admisión. |
| `GET` | `/api/task-queues/{taskQueue}` | Describir capacidad de workflow/actividad/consulta de una cola. |
| `GET` | `/api/task-queues/{taskQueue}/build-ids` | Listar build ids observados en una cola. |
| `POST` | `/api/task-queues/{taskQueue}/build-ids/drain` | Marcar una cohorte como drenando para que no reclame nuevas tareas. |
| `POST` | `/api/task-queues/{taskQueue}/build-ids/resume` | Borrar un drenaje para volver a reclamar tareas. |

Utiliza las respuestas para distinguir ausencia de workers de slots saturados, límites de leases activas, presupuestos de despacho y contrapresión de consultas. Drenaje y reanudación reciben `{"build_id": "..."}` (o `{"build_id": null}` para la cohorte sin versión), son idempotentes y conservan la intención del operador aunque se retiren workers. Cuando un latido observa `drain_intent: "draining"`, los sondeos devuelven HTTP `409`, `poll_status: "draining"` y `reason: "worker_draining"` en lugar de conceder leases nuevas. Consulta [Despliegue de workers por build id](/docs/polyglot/worker-build-id-rollout) para transición, canary, drenaje y reversión completos.

## Programaciones y atributos de búsqueda {#schedules-and-search-attributes}

Las programaciones son rutas del plano de control.

| Método | Ruta | Finalidad |
| --- | --- | --- |
| `GET` | `/api/schedules` | Listar programaciones. |
| `POST` | `/api/schedules` | Crear una programación. |
| `GET` | `/api/schedules/{scheduleId}` | Describir una programación. |
| `PUT` | `/api/schedules/{scheduleId}` | Actualizar especificación, acción, nota, memo o atributos de búsqueda. |
| `DELETE` | `/api/schedules/{scheduleId}` | Eliminar una programación. |
| `POST` | `/api/schedules/{scheduleId}/pause` | Pausar futuros disparos. |
| `POST` | `/api/schedules/{scheduleId}/resume` | Reanudar una programación pausada. |
| `POST` | `/api/schedules/{scheduleId}/trigger` | Disparar inmediatamente. |
| `POST` | `/api/schedules/{scheduleId}/backfill` | Ejecutar retroactivamente una ventana temporal. |
| `GET` | `/api/search-attributes` | Listar atributos registrados. |
| `POST` | `/api/search-attributes` | Registrar un atributo. |
| `DELETE` | `/api/search-attributes/{name}` | Eliminar un atributo. |

Los nombres y tipos de atributos forman parte del contrato de búsqueda del espacio. Evita atributos de alta cardinalidad en paneles operativos o etiquetas de métricas.

## Operaciones del sistema {#system-operations}

Requieren admin. Son pasadas explícitas del operador; en automatización consulta el estado antes de ejecutar una pasada.

| Método | Ruta | Finalidad |
| --- | --- | --- |
| `GET` | `/api/system/health` | Devolver salud de coordinación y seguridad de despliegue por espacio, anidada en `health`. |
| `GET` | `/api/system/metrics` | Devolver métricas JSON acotadas. |
| `GET` | `/api/system/operator-metrics` | Devolver métricas del espacio de ejecuciones, tareas, trabajo pendiente, reparación, workers y límites estructurales. |
| `GET` | `/api/system/repair` | Inspeccionar reparación pendiente. |
| `POST` | `/api/system/repair/pass` | Ejecutar una pasada de reparación. |
| `GET` | `/api/system/activity-timeouts` | Inspeccionar vencimientos de actividad pendientes. |
| `POST` | `/api/system/activity-timeouts/pass` | Ejecutar una pasada de aplicación de vencimientos. |
| `GET` | `/api/system/retention` | Inspeccionar limpieza pendiente por retención. |
| `POST` | `/api/system/retention/pass` | Ejecutar una pasada de limpieza por retención. |

Para retención de PHP Server, la ruta de estado lee la política actual y devuelve una lista acotada de ejecuciones aptas. Cambiar la política también afecta al historial cerrado existente. Una pasada sin filtros selecciona ejecuciones vencidas; `run_ids` explícitos apuntan directamente a ejecuciones cerradas sin el filtro de edad acotado. Se siguen aplicando las protecciones de retención permanente y archivo. Revisa el [procedimiento de retención y copias](./server.md#retention) antes de cambiar la política o limpiar.

`/api/system/health` responde rápidamente si un espacio está suficientemente sano para seguir recibiendo tráfico. Devuelve `{namespace, health}`, donde `health` contiene comprobaciones categorizadas de seguridad de despliegue, `health.operator_metrics` y el resumen de límites estructurales.

`/api/system/operator-metrics` complementa a `/api/cluster/info` por espacio cuando necesitas recuentos de trabajo pendiente, antigüedad de bloqueos por compatibilidad, detalle de flota u otras métricas subyacentes al resumen de salud.

`/api/system/metrics` es una interfaz operativa JSON, no un endpoint de extracción Prometheus. Los nombres y dimensiones de métricas se acotan mediante la política de crecimiento limitado del servidor.

## Contrato de errores {#error-contract}

Las respuestas utilizan estados HTTP y motivos con nombre legibles por máquinas. Los clientes deben decidir según `reason` o los campos anidados de motivo del plano de control/workers, no mensajes de texto.

Estados habituales:

| Estado | Significado |
| --- | --- |
| `400` | Cabecera de protocolo/versión ausente o incompatible, consulta malformada o método no admitido. |
| `401` | Autenticación ausente o no válida. |
| `403` | El token autenticado no tiene el rol requerido. |
| `404` | Espacio de nombres, workflow, ejecución, programación, worker o atributo no encontrado. |
| `409` | Duplicado o conflicto, como workflow ya iniciado o destino de ejecución no válido. |
| `422` | Validación fallida con detalles por campo. |
| `429` | Admisión o capacidad de cola completa. |
| `503` | El nodo no aloja los roles requeridos. Las rutas alojadas devuelven `reason: "topology_role_unavailable"` con `current_shape`, `current_process_class`, `current_roles`, `required_roles` y `missing_roles`. El mismo estado con `reason: "workflow_v2_blocked"`, `blocked_by` y `remediation` cubre inicio/modificación de workflows, modificación de programaciones, adaptadores puente y protocolo de workers si el arranque v2 está bloqueado; las lecturas (`GET /api/schedules`, `GET /api/schedules/{scheduleId}`, `GET /api/schedules/{scheduleId}/history`) siguen disponibles durante la recuperación. |
| `500` | Fallo del servidor. Reintenta solo si la operación es idempotente o tiene clave de idempotencia. |

Las validaciones devuelven `reason: "validation_failed"` y `errors` o `validation_errors`. Las respuestas de comandos de workflow también proyectan detalles de validación y operación en el objeto anidado `control_plane`.

## Véase también {#see-also}

- [Guía del servidor](/docs/polyglot/server)
- [Espacios de nombres, autenticación y registro de workers](/docs/polyglot/namespace-auth-workers)
- [Protocolo de workers](/docs/polyglot/worker-protocol)
- [Admisión en colas de tareas](/docs/polyglot/task-queue-admission)
- [Ejecución externa](/docs/polyglot/external-execution)
- [Referencia de comandos de CLI](/docs/polyglot/cli-reference)
