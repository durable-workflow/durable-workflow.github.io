---
title: Topología de roles de Server
description: Interpreta el manifiesto de topología de /api/cluster/info para roles, límites de escalado, dominios de fallo y pasos de migración de Durable Workflow Server.
tags:
  - server
  - topology
  - deployment
  - control-plane
  - workers
keywords:
  - topología de roles de Durable Workflow
  - topología de cluster info
  - límites de escalado del servidor
  - separación de control y ejecución
---

# Topología de roles de Server {#server-role-topology}

## Por qué existe este manifiesto {#why-this-manifest-exists}

`GET /api/cluster/info` publica el manifiesto `topology` del servidor bajo el esquema `durable-workflow.v2.role-topology`. Trátalo como el contrato público de nombres de rol, formas de despliegue admitidas, autoridad de escritura duradera, expectativas de dominios de fallo, límites de escalado y ruta ordenada de migración desde la distribución independiente actual hacia una topología con control y ejecución separados.

Utiliza esta página para razonar sobre la forma del servidor desde scripts, paneles, procedimientos operativos o automatización de despliegues. Consulta la [referencia de la API del servidor](/docs/polyglot/server-api-reference) para la interfaz HTTP y la [guía del servidor](/docs/polyglot/server) para preparar el despliegue.

## Leer el manifiesto de topología {#reading-the-topology-manifest}

El objeto `topology` responde estas preguntas del contrato:

| Familia de campos | Pregunta que responde |
| --- | --- |
| `schema`, `version` | ¿Qué revisión del contrato de topología estás leyendo? |
| `supported_shapes` | ¿Qué formas de despliegue del producto son válidas? |
| `role_vocabulary` | ¿Qué nombres de rol admite este contrato? |
| `current_shape`, `current_process_class`, `current_roles`, `execution_mode` | ¿Qué hace ahora el nodo que responde? |
| `matching_role.*` | ¿Quién gestiona los avisos generales de trabajo listo, qué ejes de enrutamiento están fijados y qué modelo de despacho/contrapresión está activo? |
| `role_catalog`, `authority_surfaces` | ¿Qué interfaces y superficies de modificación duradera pertenecen a cada rol? |
| `shape_assignments` | ¿Qué clases de proceso admite cada forma? |
| `authority_boundaries`, `failure_domains`, `scaling_boundaries` | ¿Qué puede escribir cada rol, cómo falla y según qué carga escala? |
| `supported_topologies`, `migration_path` | ¿Qué familias de despliegue admite el producto y cuál es la ruta ordenada desde la forma independiente hacia roles más aislados? |
| `kernel_invariants` | ¿Qué garantías del núcleo duradero debe preservar la separación de roles en cualquier forma? |

`current_shape`, `current_process_class` y `current_roles` describen el nodo que respondió a la solicitud HTTP, no toda la flota. Utiliza `current_process_class` como identidad declarada del nodo y compara `current_roles` con los conjuntos de clases de proceso de `shape_assignments` para verificarla.

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/cluster/info" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  | jq '{
    current_shape: .topology.current_shape,
    current_process_class: .topology.current_process_class,
    current_roles: .topology.current_roles,
    execution_mode: .topology.execution_mode,
    matching_role: .topology.matching_role,
    scaling_boundaries: .topology.scaling_boundaries,
    migration_path: .topology.migration_path
  }'
```

## Vocabulario de roles {#role-vocabulary}

`topology.role_vocabulary` fija los nombres públicos de rol:

| Rol | Responsabilidad |
| --- | --- |
| `api_ingress` | Aceptar tráfico HTTP externo, incluidos descubrimiento y entradas del plano de control. |
| `control_plane` | Iniciar, señalizar, actualizar, reparar, cancelar, terminar, archivar y modificar de otras formas el ciclo de vida del workflow. |
| `matching` | Descubrir trabajo listo, gestionar leases de tareas y coordinar la presión de despacho. |
| `history_projection` | Persistir historial duradero y mantener resúmenes y exportaciones derivados. |
| `scheduler` | Disparar programaciones y persistir el estado de sus ejecuciones. |
| `execution_plane` | Ejecutar tareas de workflow y actividad. |

La automatización debe utilizar estos identificadores exactos como vocabulario estable.

## Formas de despliegue admitidas {#supported-deployment-shapes}

`topology.supported_shapes` indica las formas válidas del producto:

| Forma | Clases de proceso publicadas en `shape_assignments` | Significado del contrato |
| --- | --- | --- |
| `embedded` | `application_process` | Un proceso de aplicación posee plano de control, asignación, proyección de historial, planificador y ejecución. |
| `standalone_server` | `server_http_node`, `scheduler_node`, `worker_node` | Distribución independiente actual: entrada HTTP/plano de control en el nodo de servidor, planificador en su clase de proceso y ejecución en nodos de worker. |
| `split_control_execution` | `ingress_node`, `control_plane_node`, `scheduler_node`, `matching_node`, `execution_node` | El mismo contrato separado en clases de proceso por rol para desplazar límites de escalado y fallo por subsistema. |

`split_control_execution` es una topología admitida, no otro motor ni otra API. La misma interfaz de descubrimiento describe las formas independiente y de roles separados.

## Identidad del nodo actual {#current-node-identity}

Utiliza conjuntamente `current_shape`, `current_process_class`, `current_roles` y `execution_mode`:

- `current_shape` identifica el contrato de forma del nodo que responde.
- `current_process_class` identifica su clase de proceso declarada.
- `current_roles` identifica su conjunto de roles activos.
- `execution_mode` distingue `remote_worker_protocol` de `local_queue_worker`.

En la distribución independiente, `current_shape` sigue siendo `standalone_server` aunque `DW_MODE=embedded` cambie la ejecución a workers de cola locales. En ese caso, `execution_mode` pasa a `local_queue_worker` y el nodo HTTP conserva el contrato de roles del servidor independiente.

### Restricción de rutas alojadas {#hosted-route-gating}

El contrato también indica cuándo un nodo debe rechazar por completo el tráfico alojado. Las rutas alojadas autenticadas se rechazan salvo que el nodo anuncie el conjunto de control HTTP que requieren actualmente: `api_ingress` y `control_plane`.

Las respuestas de nodo incorrecto devuelven `503` con `reason: "topology_role_unavailable"` y la evidencia de topología necesaria para reenrutar:

- `current_shape`
- `current_process_class`
- `current_roles`
- `required_roles`
- `missing_roles`

Esta restricción se ejecuta antes de resolver el espacio de nombres. Una solicitud a `scheduler_node`, `matching_node` o `execution_node` no descubre si existe el espacio antes de dirigirse a la clase correcta. `GET /api/health`, `GET /api/ready` y `GET /api/cluster/info` autenticado siguen disponibles para descubrir la forma del nodo antes de reintentar en otro.

### Restricción de arranque de workflow {#workflow-bootstrap-gate}

Una segunda restricción de rutas rechaza solicitudes cuando el nodo tiene bloqueos de arranque v2 pendientes. Mientras `checks.workflow_v2.status` sea `blocked`, las rutas autenticadas de inicio/modificación de workflows, modificación de programaciones, adaptadores puente y protocolo de workers devuelven `503` con `reason: "workflow_v2_blocked"` y:

- `blocked_by`: lista ordenada de requisitos de preparación bloqueantes, por ejemplo `migrations`.
- `remediation`: instrucciones para resolverlos, reflejadas desde `checks.workflow_v2.remediation` de `/api/ready`.

Esta restricción ocupa el mismo lugar que la de topología: después de validar rol y versión de protocolo y antes de resolver el espacio de nombres. Por tanto, una solicitud bloqueada nunca revela su existencia.

Se restringen rutas de workflow como `/api/workflows`, modificaciones de programación como `POST /api/schedules`, `PUT /api/schedules/{scheduleId}`, `DELETE /api/schedules/{scheduleId}`, `/pause`, `/resume`, `/trigger` y `/backfill`, rutas de adaptador puente como `/api/bridge-adapters/webhook/{adapter}` y rutas de protocolo de workers bajo `/api/worker`.

Las **lecturas** de programaciones (`GET /api/schedules`, `GET /api/schedules/{scheduleId}`, `GET /api/schedules/{scheduleId}/history`) están exentas deliberadamente para permitir inspección durante la recuperación. Las rutas de workers devuelven la misma carga de bloqueo dentro del sobre de su protocolo, para que los SDK decidan según el mismo `reason: "workflow_v2_blocked"` legible por máquinas del plano de control.

## Contrato del rol de asignación {#matching-role-contract}

`topology.matching_role` fija el comportamiento actual de asignación y avisos del nodo:

| Campo | Significado |
| --- | --- |
| `queue_wake_enabled` | Si están habilitados los avisos de cola de corta duración. |
| `shape` | Forma de asignación anunciada por el nodo: `in_worker` o `dedicated`. |
| `wake_owner` | Implementación que gestiona el barrido general de avisos: `worker_loop` o `dedicated_repair_pass`. |
| `task_dispatch_mode` | Si el despacho utiliza workers remotos mediante `poll` o ejecución local mediante `queue`. |
| `partition_primitives` | Ejes de enrutamiento fijados, en orden: `connection`, `queue`, `compatibility`, `namespace`. |
| `backpressure_model` | Límite de admisión duradera exigido por el rol. V2 actual informa de `lease_ownership`. |
| `discovery_limits` | Contrato numérico fijo compilado por el paquete Workflow: `poll_batch_cap`, `availability_ceiling_seconds`, `wake_signal_ttl_seconds`, `workflow_task_lease_seconds` y `activity_task_lease_seconds`. |

Esto permite distinguir entre asignación existente con avisos degradados y un nodo que utiliza deliberadamente otro modo de despacho, y proporciona el mismo vocabulario de enrutamiento y contrapresión publicado en las métricas operativas del servidor.

`discovery_limits` es el contrato numérico del rol: `poll_batch_cap` fija el máximo de filas listas por sondeo; `availability_ceiling_seconds` fija la tolerancia entre backends aplicada a `available_at` para que las tareas recién disponibles toleren desviaciones de marcas de tiempo inferiores a un segundo; `wake_signal_ttl_seconds` fija el TTL predeterminado de `CacheLongPollWakeStore`; y `workflow_task_lease_seconds` / `activity_task_lease_seconds` fijan las duraciones predeterminadas de leases. Los operadores leen estos valores para verificar el contrato sin buscar en el código del paquete. Reducirlos es un cambio de protocolo porque otros tiempos de despacho, workers y aceleración dependen de ellos; renombrar un campo también rompe el protocolo.

## Límites de autoridad {#authority-boundaries}

`topology.authority_boundaries` identifica las superficies de escritura duradera que debe modificar cada rol:

| Rol | Escrituras publicadas |
| --- | --- |
| `api_ingress` | `worker_registrations` |
| `control_plane` | `workflow_instances`, `workflow_runs.status`, `workflow_tasks.lifecycle` |
| `matching` | `workflow_tasks.leases`, `activity_tasks.leases` |
| `history_projection` | `history_events`, `workflow_run_summaries`, `workflow_history_exports` |
| `scheduler` | `workflow_schedules.fire_state`, `workflow_starts.scheduled` |
| `execution_plane` | `workflow_tasks.outcomes`, `activity_attempts`, `worker_compatibility_heartbeats` |

Utiliza este contrato para detectar desviaciones entre roles antes de separar procesos o añadir automatización específica de topología.

## Límites de fallo y escalado {#failure-and-scaling-boundaries}

### Dominios de fallo {#failure-domains}

`topology.failure_domains` indica el primer comportamiento degradado y la primera señal visible al operador ante la caída de cada rol:

| Dominio de fallo | `effect` | `operator_signal` |
| --- | --- | --- |
| `control_plane_down` | `workers_continue_claimed_tasks_only_until_lease_expiry` | `operator_commands_fail_fast` |
| `execution_plane_down` | `ready_tasks_accumulate_without_loss` | `operators_see_ready_depth_growth` |
| `matching_down` | `claim_falls_back_to_direct_ready_task_discovery` | `ready_depth_rises_while_claim_rate_falls` |
| `history_projection_down` | `projection_reads_may_stale_while_durable_writes_continue` | `projection_lag_seconds_may_increase` |
| `scheduler_down` | `scheduled_workflows_stop_firing_and_record_missed_runs` | `operators_see_missed_schedule_state` |
| `api_ingress_down` | `external_http_traffic_stops_at_the_edge` | `embedded_in_process_calls_may_continue` |

Son expectativas del producto, no detalles internos accesorios. Utilízalas para describir qué debe ocurrir cuando un rol se degrada antes de leer registros.

### Límites de escalado {#scaling-boundaries}

`topology.scaling_boundaries` indica el eje de carga principal de cada rol en el modelo separado:

| Rol | Límite de escalado |
| --- | --- |
| `api_ingress` | `incoming_http_request_rate` |
| `control_plane` | `operator_commands_and_run_lifecycle_transitions` |
| `matching` | `ready_task_rate_and_poller_count` |
| `history_projection` | `durable_event_rate` |
| `scheduler` | `active_schedule_count` |
| `execution_plane` | `workflow_and_activity_task_rate` |

Es la respuesta explícita a qué se escala independientemente en la topología de roles separados.

## Ruta de migración {#migration-path}

`topology.migration_path` tiene un orden. Cada paso conserva un único núcleo duradero y aísla mejor las responsabilidades:

1. `audit_role_boundaries`
   Resultado: las herramientas detectan escrituras entre roles antes de cambiar la forma del runtime.
2. `expose_role_bindings`
   Resultado: los puntos de integración del contenedor permiten adaptadores fuera del proceso sin modificar el paquete.
3. `introduce_dedicated_matching_shape`
   Resultado: la asignación puede tener su propia clase de proceso sin cambiar el contrato de reclamación.
4. `split_history_projection`
   Resultado: historial y proyecciones pueden salir del proceso sin introducir otro escritor.
5. `split_scheduler`
   Resultado: las programaciones pueden ejecutarse bajo elección de líder sin invalidar despliegues de una réplica.
6. `optional_execution_partitioning`
   Resultado: los workers pueden particionar por espacio de nombres, conexión, cola y compatibilidad.

Esta lista es el orden admitido de transición de topología, no una hoja de ruta de producto separada del motor actual.

Cada entrada `topology.migration_path[]` contiene `reversible: true` explícito. La ruta es bidireccional: un despliegue que haya llegado a `split_history_projection` PUEDE devolver el rol de historial al proceso del plano de control y conservar una forma válida. La reversión forma parte del contrato, no es un caso excepcional sin modelar.

## Invariantes del núcleo duradero {#durable-kernel-invariants}

`topology.kernel_invariants` enumera las garantías preservadas por la separación en cualquier forma admitida. Utiliza la lista para validar que una propuesta de topología está admitida por el producto y no constituye una bifurcación del motor:

| Invariante | Garantía |
| --- | --- |
| `single_persistence_engine` | Una base de datos de workflows respalda todas las formas; separar roles no introduce otro motor de persistencia. |
| `single_worker_protocol` | Un protocolo HTTP de workers transporta reclamaciones, finalizaciones, fallos y latidos en todas las topologías; no se bifurca el contrato. |
| `single_history_writer` | `history_events` tiene exactamente un escritor duradero por evento lógico, con independencia de dónde se ejecute el rol de historial/proyección. |
| `single_control_authority_per_run` | Cada modificación de una ejecución pasa por una autoridad del plano de control; los bloqueos de fila por ejecución serializan transiciones entre réplicas. |
| `embedded_topology_remains_supported` | La forma integrada con todos los roles en un proceso DEBE seguir siendo válida; nunca se obliga a migrar a los hosts integrados existentes. |
| `role_split_is_topology_only` | Separar roles cambia la topología, no bifurca el producto; reunirlos en un proceso siempre es una topología válida. |

El campo `applies_to` de cada entrada enumera las formas cubiertas. Todos los invariantes actuales se aplican a `embedded`, `standalone_server` y `split_control_execution`. Si una actualización añade otra forma, DEBEN revisarse los invariantes cuyo `applies_to` no la incluya antes de considerarla admitida.

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/cluster/info" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  | jq '.topology.kernel_invariants[] | {id, applies_to}'
```

## Salud de coordinación {#coordination-health}

`/api/cluster/info` también publica `coordination_health` junto a `topology`. Mantén clara la distinción:

- `topology` indica qué puede hacer el nodo y cómo debe comportarse la forma del producto.
- `coordination_health` indica si las comprobaciones de coordinación y seguridad de despliegue están sanas entre espacios de nombres.
- `coordination_health.blocked_by`, `coordination_health.message` y `coordination_health.remediation` aparecen si faltan requisitos como migraciones o conectividad de base de datos y no se puede evaluar la seguridad del despliegue.
- `coordination_health.routing_drains` resume las cohortes por build id en drenaje entre colas y espacios. `queues_with_drains` indica si la automatización está desviando intencionadamente tráfico de alguna cohorte.
- `coordination_health.warning_checks`, `coordination_health.error_checks` y `coordination_health.checks` son el inventario normalizado cuando se ejecuta la evaluación.
- `coordination_health.checks[]` siempre incluye la comprobación fija `activity_path` junto a `worker_compatibility`, `task_transport`, `routing_health`, `durable_resume_paths` y las de proyección/planificador. `activity_path` es la contraparte de actividad de `task_transport`: muestra ejecuciones cuyos plazos de programación a inicio, inicio a cierre, programación a cierre o latido vencieron sin aplicarse, además del trabajo acumulado sostenido de reintentos de actividad. Renombrarla cambia el protocolo.

Utiliza ambas interfaces al decidir si un cambio de topología está admitido y es seguro actualmente.

## Referencias relacionadas {#related-references}

- [Referencia de la API del servidor](/docs/polyglot/server-api-reference) para el contrato HTTP autenticado de `/api/cluster/info`.
- [Guía del servidor](/docs/polyglot/server) para preparar el despliegue y el modelo operativo independiente completo.
- [Modos de despliegue](/docs/polyglot/deployment-modes) para elegir integrado, servidor independiente o topologías más amplias guiadas por soporte.
