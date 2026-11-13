---
sidebar_position: 3
title: Referencia de configuración de Server
description: Variables de entorno, valores predeterminados, alias antiguos y configuración de infraestructura de Durable Workflow Server.
tags:
  - server
  - config
  - referencia
  - operaciones
keywords:
  - configuración de Durable Workflow Server
  - variables de entorno DW
  - auditoría del entorno de Server
  - entorno de Workflow Server
---

# Referencia de configuración de Server {#server-config-reference}

Esta página documenta el contrato de variables de entorno `DW_*` para los operadores de la imagen de Durable Workflow Server. Úsela al crear plantillas de despliegue, revisar la configuración de producción o migrar los nombres antiguos `WORKFLOW_*` / `ACTIVITY_*` al contrato v2 de Server. El Server actual es el Server nativo 3.x; [Server nativo 3.x](#native-server-3x) indica qué ajustes respeta, ignora o rechaza. PHP Server 2.x está congelado en 2.11.8.

PHP Server 2.x también utiliza la configuración habitual de Laravel, como `DB_*`, `REDIS_*`, `QUEUE_CONNECTION` y `CACHE_STORE`. Estas variables de infraestructura se enumeran por separado porque conectan los componentes del despliegue y no controlan la API de Durable Workflow.

## Server nativo 3.x {#native-server-3x}

Las tablas de variables de esta página recogen el contrato `DW_*` publicado por PHP Server 2.11.0, y sus propósitos describen PHP 2.x. El Server nativo 3.x lee los mismos nombres, con los mismos alias antiguos, mediante una auditoría de arranque que asigna a cada ajuste del contrato una única disposición:

- **Respetado:** el Server nativo lee el ajuste y aplica el significado de PHP. Los ajustes que no aparecen a continuación se respetan.
- **Ignorado:** el Server nativo acepta el ajuste, pero no cambia nada que los clientes o los operadores puedan observar.
- **Rechazado salvo el valor predeterminado:** el Server nativo se niega a arrancar salvo que el ajuste esté sin definir o conserve el valor predeterminado de PHP. El error de arranque indica el ajuste, el valor aceptado y el motivo.

El Server nativo lee su entorno una sola vez al iniciarse el proceso y no mantiene caché de configuración. Para cambiar un ajuste, reinicie o reemplace el proceso de Server. Al igual que `env:audit` de PHP, la auditoría nativa avisa de nombres `DW_*` desconocidos y de nombres antiguos, y `DW_ENV_AUDIT_STRICT=1` convierte esas advertencias en un rechazo del arranque.

El Server nativo rechaza estos ajustes salvo que conserven el valor indicado:

| Motivo | Ajustes y valores aceptados |
| --- | --- |
| El Server nativo siempre fija las ejecuciones a su definición de workflow registrada | `DW_V2_PIN_TO_RECORDED_FINGERPRINT`: sin definir o `true` |
| El Server nativo no puede aplicar un límite de operaciones Nexus modificado | `DW_MAX_NEXUS_OPERATIONS_PER_CALLER`: sin definir o `200`<br />`DW_MAX_OPERATION_NAME_LENGTH`: sin definir o `256` |
| El Server nativo no puede aplicar un límite de series de métricas modificado | `DW_METRICS_PROMETHEUS_ACTIVITY_SERIES_LIMIT`: sin definir o `100`<br />`DW_METRICS_PROMETHEUS_TASK_QUEUE_SERIES_LIMIT`: sin definir o `100`<br />`DW_METRICS_PROMETHEUS_WORKFLOW_SERIES_LIMIT`: sin definir o `100`<br />`DW_METRICS_WORKFLOW_TASK_FAILURE_TYPE_LIMIT`: sin definir o `20` |
| El Server nativo no puede aplicar un tope modificado de tareas de consulta pendientes | `DW_QUERY_TASK_MAX_PENDING_PER_QUEUE`: sin definir o `1024` |
| El Server nativo no puede aplicar un límite estructural modificado | `DW_V2_LIMIT_COMMAND_BATCH_SIZE`: sin definir o `1000` |
| El Server nativo no puede aplicar tiempos de reparación de tareas modificados | `DW_V2_TASK_REPAIR_FAILURE_BACKOFF_MAX_SECONDS`: sin definir o `60`<br />`DW_V2_TASK_REPAIR_REDISPATCH_AFTER_SECONDS`: sin definir o `3`<br />`DW_V2_TASK_REPAIR_SCAN_LIMIT`: sin definir o `25` |
| El Server nativo no publica la procedencia del paquete | `DW_EXPOSE_PACKAGE_PROVENANCE`: sin definir o `false` |
| El Server nativo no informa de una declaración multinodo | `DW_V2_MULTI_NODE`: sin definir o `false` |
| El Server nativo no ejecuta workflows de Workflow 1 | `DW_V1_ENABLED`: sin definir o `false` |
| El Server nativo no valida la compatibilidad de la flota de workers | `DW_V2_FLEET_VALIDATION_MODE`: sin definir o distinto de `fail` |
| El Server nativo solo entrega tareas a workers que sondean | `DW_TASK_DISPATCH_MODE`: sin definir o `poll` |
| El Server nativo no tiene configuración de ejecutor externo | `DW_EXTERNAL_EXECUTOR_CONFIG_OVERLAY`: sin definir o vacío<br />`DW_EXTERNAL_EXECUTOR_CONFIG_PATH`: sin definir o vacío |
| El Server nativo no tiene modo de recuperación de migración de memo | `DW_WORKFLOW_MEMO_MIGRATION_RECOVERY`: sin definir o vacío |
| El Server nativo no tiene límites de estado duradero por namespace | `DW_NAMESPACE_DURABLE_HARD_LIMITS`: sin definir o `{}`<br />`DW_NAMESPACE_DURABLE_LIMITS`: sin definir o `{}`<br />`DW_NAMESPACE_DURABLE_OVERRIDES`: sin definir o `{}` |
| El Server nativo no tiene límites de admisión de solicitudes por namespace | `DW_NAMESPACE_ADMISSION_OVERRIDES`: sin definir o `{}`<br />`DW_NAMESPACE_HARD_MAX_CONCURRENT_REQUESTS`: sin definir o vacío<br />`DW_NAMESPACE_HARD_MAX_REQUESTS_PER_MINUTE`: sin definir o vacío<br />`DW_NAMESPACE_MAX_CONCURRENT_REQUESTS`: sin definir o vacío<br />`DW_NAMESPACE_MAX_REQUESTS_PER_MINUTE`: sin definir o vacío |
| El Server nativo no tiene política de límites de servicio | `DW_SERVICE_BOUNDARY_CROSS_NAMESPACE_DEFAULT`: sin definir o `allow`<br />`DW_SERVICE_BOUNDARY_HARD_MAX_IN_FLIGHT`: sin definir o vacío<br />`DW_SERVICE_BOUNDARY_HARD_RATE_LIMIT_PER_MINUTE`: sin definir o vacío<br />`DW_SERVICE_BOUNDARY_MAX_IN_FLIGHT`: sin definir o vacío<br />`DW_SERVICE_BOUNDARY_NAMESPACE_MAX_IN_FLIGHT`: sin definir o vacío<br />`DW_SERVICE_BOUNDARY_NAMESPACE_OVERRIDES`: sin definir o `{}`<br />`DW_SERVICE_BOUNDARY_NAMESPACE_RATE_LIMIT_PER_MINUTE`: sin definir o vacío<br />`DW_SERVICE_BOUNDARY_RATE_LIMIT_PER_MINUTE`: sin definir o vacío |
| El Server nativo no tiene archivo de admisión de almacenamiento | `DW_STORAGE_ADMISSION_FILE`: sin definir o vacío<br />`DW_STORAGE_ADMISSION_SOURCE`: sin definir o vacío |
| El Server nativo no tiene límites de admisión de tareas | `DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE`: sin definir, vacío o no es un número positivo<br />`DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE`: sin definir, vacío o no es un número positivo<br />`DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE`: sin definir, vacío o no es un número positivo<br />`DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE`: sin definir, vacío o no es un número positivo<br />`DW_TASK_QUEUE_ADMISSION_OVERRIDES`: sin definir o `{}`<br />`DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE`: sin definir, vacío o no es un número positivo<br />`DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE`: sin definir, vacío o no es un número positivo<br />`DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE`: sin definir, vacío o no es un número positivo<br />`DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE`: sin definir, vacío o no es un número positivo |
| El Server nativo implementa una sola versión del protocolo de workers | `DW_WORKER_PROTOCOL_VERSION`: sin definir o `1.20` |
| El Server nativo nunca confía en cabeceras de atribución reenviadas | `DW_TRUST_FORWARDED_ATTRIBUTION_HEADERS`: sin definir o `false` |
| El Server nativo solo fija las ejecuciones a ids de compilación de workers registrados; no tiene marcadores de compatibilidad para todo Server | `DW_V2_COMPATIBILITY_HEARTBEAT_TTL`: sin definir o `30`<br />`DW_V2_COMPATIBILITY_NAMESPACE`: sin definir o vacío<br />`DW_V2_CURRENT_COMPATIBILITY`: sin definir o vacío<br />`DW_V2_NAMESPACE`: sin definir o vacío<br />`DW_V2_SUPPORTED_COMPATIBILITIES`: sin definir o vacío |
| El Server nativo no informa de problemas del codec de cargas | `DW_SERIALIZER`: sin definir, vacío o `avro` |
| El Server nativo solo se ejecuta como proceso independiente de servidor HTTP | `DW_MODE`: sin definir o `service`<br />`DW_SERVER_PROCESS_CLASS`: sin definir o ninguno de `scheduler_node`, `worker_node`<br />`DW_SERVER_TOPOLOGY_SHAPE`: sin definir o ninguno de `embedded`, `split_control_execution` |
| El Server nativo sirve `default` a las solicitudes que no indican namespace | `DW_DEFAULT_NAMESPACE`: sin definir o `default` |
| El Server nativo solo almacena cargas externas en su disco local | `DW_EXTERNAL_PAYLOAD_S3_BUCKET`: sin definir o vacío |
| El Server nativo solo admite su autenticación por token | `DW_AUTH_BACKWARD_COMPATIBLE`: sin definir o `true`<br />`DW_AUTH_PROVIDER`: sin definir o vacío<br />`DW_PRINCIPAL_TOKENS`: sin definir o vacío |

El Server nativo acepta pero ignora: `DW_ADMIN_SIGNATURE_KEY`, `DW_AUTH_METHOD_HEADER`, `DW_AUTH_STATUS_HEADER`, `DW_BOOTSTRAP_DELAY_SECONDS`, `DW_BOOTSTRAP_RETRIES`, `DW_CALLER_LABEL_HEADER`, `DW_CALLER_TYPE_HEADER`, `DW_COMPRESSION_ENABLED`, `DW_DUE_TIMER_RECOVERY_SCAN_LIMIT`, `DW_EXPIRED_WORKFLOW_TASK_RECOVERY_TTL_SECONDS`, `DW_EXTERNAL_PAYLOAD_S3_ACCESS_KEY_ID`, `DW_EXTERNAL_PAYLOAD_S3_ENDPOINT`, `DW_EXTERNAL_PAYLOAD_S3_REGION`, `DW_EXTERNAL_PAYLOAD_S3_SECRET_ACCESS_KEY`, `DW_EXTERNAL_PAYLOAD_S3_SESSION_TOKEN`, `DW_EXTERNAL_PAYLOAD_S3_USE_PATH_STYLE_ENDPOINT`, `DW_MAX_HISTORY_EVENTS`, `DW_MAX_TASKS_PER_POLL`, `DW_OBSERVABILITY_BAGGAGE_ALLOWLIST`, `DW_OBSERVABILITY_CONTEXT_ENABLED`, `DW_OPERATOR_SIGNATURE_KEY`, `DW_PACKAGE_PROVENANCE_PATH`, `DW_POLLING_CACHE_PATH`, `DW_QUERY_TASK_POLL_MAX_CONCURRENT`, `DW_QUERY_TASK_POLL_MAX_CONCURRENT_PER_NAMESPACE`, `DW_SIGNATURE_KEY`, `DW_SQLITE_CLAIM_LOCK_TTL_SECONDS`, `DW_SQLITE_CLAIM_LOCK_WAIT_SECONDS`, `DW_STORAGE_ADMISSION_MAX_AGE_SECONDS`, `DW_V2_CACHE_VALIDATION_MODE`, `DW_V2_GUARDRAILS_BOOT`, `DW_V2_LIMIT_SEARCH_ATTRIBUTE_SIZE_BYTES`, `DW_V2_LIMIT_WARNING_THRESHOLD_PERCENT`, `DW_V2_MATCHING_ROLE_QUEUE_WAKE`, `DW_V2_TASK_DISPATCH_MODE`, `DW_V2_TASK_REPAIR_LOOP_THROTTLE_SECONDS`, `DW_V2_TENANCY_ENVIRONMENT`, `DW_V2_TENANCY_ORGANIZATION`, `DW_V2_TENANCY_PROJECT`, `DW_V2_UPDATE_WAIT_POLL_INTERVAL_MS`, `DW_V2_VALIDATE_CACHE_BACKEND`, `DW_WAKE_SIGNAL_TTL_SECONDS`, `DW_WORKER_LONG_POLL_MAX_CONCURRENT`, `DW_WORKER_LONG_POLL_MAX_CONCURRENT_PER_NAMESPACE`, `DW_WORKER_LONG_POLL_RESERVED_HTTP_WORKERS`, `DW_WORKER_POLL_INTERVAL_MS`, `DW_WORKER_POLL_SIGNAL_CHECK_INTERVAL_MS`, `DW_WORKER_SIGNATURE_KEY`.

El Server nativo no tiene límites del lado del servidor para leases ni despachos de colas de tareas, grupos de presupuesto, admisión de peticiones por namespace, cuotas de estado duradero por namespace ni límites de sondeos retenidos, y todavía no existe un equivalente nativo. Cada proceso de Server nativo abre como máximo cuatro conexiones de base de datos. Las tareas de consulta tienen un límite fijo de 16 tareas pendientes o arrendadas por namespace; por encima de él, las nuevas consultas se rechazan con HTTP `429` y `query_task_queue_full`, como en PHP. Este límite no es configurable. Para acotar la concurrencia de tareas en el Server nativo, dimensione los slots de cada worker del SDK y el número de workers. [Admisión en colas de tareas](/docs/polyglot/task-queue-admission) describe los controles de PHP 2.x.

La autenticación nativa difiere de PHP 2.x en estos aspectos:

- `DW_AUTH_TOKEN` es obligatorio. El Server nativo se niega a arrancar sin él y acepta el token compartido para todos los roles junto con cualquier token limitado por rol.
- `DW_AUTH_DRIVER` solo acepta `token`. El Server nativo rechaza `signature`, y una imagen de publicación también rechaza `none`. Los ajustes de claves de firma se ignoran.

El Server nativo también lee ajustes ajenos al contrato de PHP:

- `DW_BIND_ADDRESS`: la dirección de escucha. El binario usa `127.0.0.1:8080` por defecto; la imagen publicada establece `0.0.0.0:8080`.
- `DW_RUST_MAINTENANCE_LOOP`: `1` o `true` añade la pasada de reparación (reparación de tareas y tiempos de espera de actividades) al bucle en proceso de temporizadores y programaciones. La imagen publicada establece `1` porque no tiene un planificador separado.
- `DW_RUST_EXPERIMENTAL`: solo lo exigen, con valor `1`, las compilaciones de desarrollo sin versión de publicación. Las imágenes de publicación no lo necesitan.
- `DW_UPGRADE_BACKUP_FINGERPRINT` y `DW_RUST_UPGRADE_QUEUE_*`: entradas de la [toma de control nativa](%%artifact.serverTakeoverRunbookUrl%%), de un solo sentido, de una base de datos PHP, validada en la imagen publicada 3.0.4 dentro del alcance indicado en el runbook.
- `DW_V2_LIMIT_HISTORY_TRANSACTION_ROWS` (antiguo `WORKFLOW_V2_LIMIT_HISTORY_TRANSACTION_ROWS`): se respeta antes de su incorporación al contrato de PHP.

## Cuándo se aplican los cambios {#how-changes-take-effect}

El Server nativo 3.x solo lee su entorno al iniciarse el proceso; reinicie o reemplace el proceso de Server para aplicar un cambio. El resto de esta sección describe PHP 2.x.

La imagen publicada de PHP Server ejecuta `php artisan config:cache` en su punto de entrada. Los valores de entorno se resuelven durante ese arranque y se guardan en la caché de configuración de Laravel. Editar un archivo de entorno, cambiar las variables declaradas en el orquestador o reemplazar un archivo de configuración montado no recarga un despliegue que ya está en ejecución.

Reinicie o reemplace todos los procesos afectados con la nueva configuración: réplicas de la API HTTP, workers locales de colas de Laravel y procesos del planificador. Reinicie por separado los workers persistentes de los SDK cuando cambie su propia configuración de cliente o worker. Reiniciar correctamente la API no actualiza un worker de cola o planificador que sigue en ejecución. Mantenga la misma configuración prevista en los roles que comparten una base de datos y una caché.

Durante una actualización gradual, cada nodo aplica sus propios límites cargados. Los contadores compartidos de admisión no hacen que nodos con distinta configuración coincidan en un límite. Una solicitud puede aceptarse en una réplica de la API y rechazarse en otra. Para aplicar un cambio de límite de forma coherente:

1. Pause los nuevos envíos de los clientes y retire las réplicas afectadas de la API del tráfico de entrada. Espere a que terminen las solicitudes en curso. Detenga de forma ordenada los roles de cola y del planificador afectados, respetando sus plazos de apagado.
2. Aplique la misma configuración a cada rol afectado y reinícielo o reemplácelo. Deje que el punto de entrada de cada contenedor reconstruya su caché de configuración.
3. Compruebe los registros de arranque para detectar errores de configuración, verifique la disponibilidad y pruebe el límite modificado antes de restaurar el tráfico y los envíos. Consulte la [guía de despliegue y disponibilidad](/docs/deployment#readiness-contract).

La configuración del operador almacenada en la base de datos tiene otro ciclo de vida. Las modificaciones siguientes, cuando se realizan correctamente, están disponibles para las operaciones posteriores sin reiniciar Server:

| Opción | Cambio en vivo | Alcance y límites |
| --- | --- | --- |
| Descripción y retención del namespace | [`PUT /api/namespaces/{namespace}`](/docs/polyglot/server-api-reference#namespace-and-storage), o [`dw namespace:update`](/docs/polyglot/cli-reference#namespace-and-search-attribute-commands) | La política se aplica en las siguientes pasadas de retención. Cambiarla no restaura los datos ya podados. Consulte [Retención de Server](/docs/polyglot/server#retention). |
| Política de almacenamiento externo de cargas del namespace | [`PUT /api/namespaces/{namespace}/external-storage`](/docs/features/external-payload-storage#configuring-a-namespace) | Cambia la política almacenada del namespace. Las credenciales del proveedor, los discos configurados y otras opciones del proceso aún requieren el reinicio descrito arriba. Conserve el acceso a los objetos referenciados por ejecuciones existentes. |
| Definiciones de atributos de búsqueda del namespace | [`POST` / `DELETE /api/search-attributes`](/docs/polyglot/server-api-reference#schedules-and-search-attributes) | Actualiza el registro que usarán las siguientes solicitudes. No reescribe el historial del workflow ni reemplaza los límites de tamaño y cantidad configurados mediante el entorno. |

Los valores predeterminados y los límites `DW_*` de esta referencia siguen siendo configuración del proceso, salvo que una operación documentada del plano de control cambie explícitamente el estado almacenado. Server no sondea los archivos de configuración para detectar cambios.

## Cómo se aplica el contrato {#how-the-contract-is-enforced}

El repositorio de Server conserva el contrato canónico en `config/dw-contract.php`. El Server nativo 3.x ejecuta la auditoría equivalente al arrancar, como se describe en [Server nativo 3.x](#native-server-3x). En PHP 2.x, durante el arranque del contenedor, `php artisan env:audit` avisa si encuentra variables `DW_*` desconocidas o nombres antiguos. Establezca `DW_ENV_AUDIT_STRICT=1` para que el punto de entrada falle en vez de arrancar con advertencias.

```bash
DW_ENV_AUDIT_STRICT=1
DW_AUTH_DRIVER=token
DW_ADMIN_TOKEN="${DW_ADMIN_TOKEN}"
DW_OPERATOR_TOKEN="${DW_OPERATOR_TOKEN}"
DW_WORKER_TOKEN="${DW_WORKER_TOKEN}"
```

Los nombres antiguos solo se usan como alternativa. Prefiera el nombre `DW_*` en cada despliegue nuevo y trate las advertencias sobre nombres antiguos como una migración pendiente, aunque Server aún respete su valor.

## Identidad y modo de Server {#server-identity-and-mode}

| Variable | Valor predeterminado | Propósito | Alias antiguo |
| --- | --- | --- | --- |
| `DW_MODE` | `service` | Modo de Server: en `service` los workers externos sondean; `embedded` despacha localmente por la cola de Laravel. | `WORKFLOW_SERVER_MODE` |
| `DW_SERVER_ID` | `gethostname()` | Identificador único de la instancia de Server usado para la titularidad de leases y el registro de workers. | `WORKFLOW_SERVER_ID` |
| `DW_SERVER_TOPOLOGY_SHAPE` | `standalone_server` | Topología anunciada para el descubrimiento del clúster, como `embedded`, `standalone_server` o `split_control_execution`. | `WORKFLOW_SERVER_TOPOLOGY_SHAPE` |
| `DW_SERVER_PROCESS_CLASS` | `server_http_node` | Clase de proceso anunciada para este nodo en la topología elegida, como `server_http_node`, `worker_node` o `scheduler_node`. | `WORKFLOW_SERVER_PROCESS_CLASS` |
| `DW_SERVER_KEY` | generado al arrancar el contenedor | Clave interna opcional del runtime. Las imágenes Docker generan una automáticamente cuando no está definida. | - |
| `DW_DEFAULT_NAMESPACE` | `default` | Namespace utilizado cuando la solicitud omite la cabecera de namespace. | `WORKFLOW_SERVER_DEFAULT_NAMESPACE` |
| `DW_TASK_DISPATCH_MODE` | sin definir | Reemplaza `workflows.v2.task_dispatch_mode`; en modo de servicio Server usa `poll` salvo que se defina otro valor. | `WORKFLOW_V2_TASK_DISPATCH_MODE` |
| `DW_WORKFLOW_MEMO_MIGRATION_RECOVERY` | sin definir | Prueba de recuperación MySQL para una sola ejecución tras una reescritura de memo no registrada: `raw-json` o `envelope-prefix:<last-converted-id>`. | `WORKFLOW_SERVER_WORKFLOW_MEMO_MIGRATION_RECOVERY` |
| `DW_EXTERNAL_EXECUTOR_CONFIG_PATH` | sin definir | Ruta de un archivo JSON `durable-workflow.external-executor.config` con los manejadores del ejecutor externo. | `WORKFLOW_SERVER_EXTERNAL_EXECUTOR_CONFIG_PATH` |
| `DW_EXTERNAL_EXECUTOR_CONFIG_OVERLAY` | sin definir | Nombre de la superposición del archivo de configuración del ejecutor externo que se aplica antes de la validación y el descubrimiento de Server. | `WORKFLOW_SERVER_EXTERNAL_EXECUTOR_CONFIG_OVERLAY` |

## Autenticación {#authentication}

| Variable | Valor predeterminado | Propósito | Alias antiguo |
| --- | --- | --- | --- |
| `DW_AUTH_PROVIDER` | sin definir | PHP 2.x: clase resoluble por Laravel que implementa `App\Contracts\AuthProvider`. El Server nativo 3.x se niega a arrancar si está definida. | `WORKFLOW_SERVER_AUTH_PROVIDER` |
| `DW_AUTH_DRIVER` | `token` | Controlador de autenticación de PHP 2.x: `none`, `token` o `signature`. El Server nativo 3.x solo acepta `token`. | `WORKFLOW_SERVER_AUTH_DRIVER` |
| `DW_AUTH_TOKEN` | sin definir | PHP 2.x: token bearer compartido cuando no hay un token limitado por rol. Server nativo 3.x: obligatorio y aceptado para todos los roles. | `WORKFLOW_SERVER_AUTH_TOKEN` |
| `DW_SIGNATURE_KEY` | sin definir | PHP 2.x: clave de firma HMAC compartida cuando no hay una clave limitada por rol. El Server nativo 3.x, que no tiene autenticación por firma, la ignora. | `WORKFLOW_SERVER_SIGNATURE_KEY` |
| `DW_WORKER_TOKEN` | sin definir | Token bearer para registro, sondeo, heartbeats y finalización de tareas de workers. | `WORKFLOW_SERVER_WORKER_TOKEN` |
| `DW_OPERATOR_TOKEN` | sin definir | Token bearer para lecturas y operaciones del operador en el plano de control. | `WORKFLOW_SERVER_OPERATOR_TOKEN` |
| `DW_ADMIN_TOKEN` | sin definir | Token bearer para cambios de namespaces, retención y otras operaciones administrativas. | `WORKFLOW_SERVER_ADMIN_TOKEN` |
| `DW_PRINCIPAL_TOKENS` | sin definir | Mapa JSON de tokens para identidades con nombre. Cada entrada aporta `token`, `subject`, `roles` y, opcionalmente, `tenant`, `label` y `claims` no secretos. El Server nativo 3.x se niega a arrancar si está definido. | `WORKFLOW_SERVER_PRINCIPAL_TOKENS` |
| `DW_WORKER_SIGNATURE_KEY` | sin definir | Clave HMAC para solicitudes del rol worker al usar autenticación por firma. | `WORKFLOW_SERVER_WORKER_SIGNATURE_KEY` |
| `DW_OPERATOR_SIGNATURE_KEY` | sin definir | Clave HMAC para solicitudes del rol operador al usar autenticación por firma. | `WORKFLOW_SERVER_OPERATOR_SIGNATURE_KEY` |
| `DW_ADMIN_SIGNATURE_KEY` | sin definir | Clave HMAC para solicitudes del rol administrador al usar autenticación por firma. | `WORKFLOW_SERVER_ADMIN_SIGNATURE_KEY` |
| `DW_AUTH_BACKWARD_COMPATIBLE` | `true` | PHP 2.x: acepta `DW_AUTH_TOKEN` / `DW_SIGNATURE_KEY` compartidos como alternativa cuando falta una credencial limitada por rol. El Server nativo 3.x siempre acepta el token compartido y se niega a arrancar si es `false`. | `WORKFLOW_SERVER_AUTH_BACKWARD_COMPATIBLE` |

Use credenciales limitadas por rol en producción. En PHP 2.x, `DW_AUTH_DRIVER=none` sirve solo para pruebas locales básicas porque permite acceder a todos los endpoints sin token bearer ni firma; las imágenes de publicación nativas lo rechazan.

Use `DW_PRINCIPAL_TOKENS` cuando los registros de auditoría necesiten identidades estables de los actores en vez de etiquetas de rol. Server obtiene la identidad registrada de la entrada del token que coincide. Los clientes no pueden reemplazarla mediante datos o cabeceras de la solicitud.

## Atribución de comandos {#command-attribution}

Estas opciones permiten que una pasarela de confianza conserve los metadatos del llamador en el historial duradero de comandos. Mantenga `DW_TRUST_FORWARDED_ATTRIBUTION_HEADERS=false`, salvo que Server esté detrás de una pasarela que elimine las cabeceras no fiables enviadas por los clientes.

| Variable | Valor predeterminado | Propósito | Alias antiguo |
| --- | --- | --- | --- |
| `DW_TRUST_FORWARDED_ATTRIBUTION_HEADERS` | `false` | Registra las cabeceras reenviadas de llamador y autenticación en el historial de comandos del workflow. | `WORKFLOW_SERVER_TRUST_FORWARDED_ATTRIBUTION_HEADERS` |
| `DW_CALLER_TYPE_HEADER` | `X-Workflow-Caller-Type` | Cabecera que transporta el tipo de llamador reenviado. | `WORKFLOW_SERVER_CALLER_TYPE_HEADER` |
| `DW_CALLER_LABEL_HEADER` | `X-Workflow-Caller-Label` | Cabecera que transporta la etiqueta del llamador reenviada. | `WORKFLOW_SERVER_CALLER_LABEL_HEADER` |
| `DW_AUTH_STATUS_HEADER` | `X-Workflow-Auth-Status` | Cabecera que transporta el estado de autenticación reenviado. | `WORKFLOW_SERVER_AUTH_STATUS_HEADER` |
| `DW_AUTH_METHOD_HEADER` | `X-Workflow-Auth-Method` | Cabecera que transporta el método de autenticación reenviado. | `WORKFLOW_SERVER_AUTH_METHOD_HEADER` |

## Sondeo y admisión de los workers {#worker-polling-and-admission}

Estos valores controlan los plazos de long polling, la coordinación del despertar, los límites de admisión de Server y los presupuestos acotados de despacho de tareas.

| Variable | Valor predeterminado | Propósito | Alias antiguo |
| --- | --- | --- | --- |
| `DW_WORKER_POLL_TIMEOUT` | `30` | Espera predeterminada si el poll omite `timeout_seconds`. La espera del SDK prevalece; no es su máximo. Véanse los [presupuestos de timeout completos](../deployment.md#worker-long-poll-timeout-budgets). | `WORKFLOW_SERVER_WORKER_POLL_TIMEOUT` |
| `DW_WORKER_POLL_INTERVAL_MS` | `1000` | Milisegundos entre búsquedas internas mientras un sondeo permanece abierto. | `WORKFLOW_SERVER_WORKER_POLL_INTERVAL_MS` |
| `DW_WORKER_POLL_SIGNAL_CHECK_INTERVAL_MS` | `100` | Milisegundos entre comprobaciones de señales de despertar mientras un sondeo permanece abierto. | `WORKFLOW_SERVER_WORKER_POLL_SIGNAL_CHECK_INTERVAL_MS` |
| `DW_POLLING_CACHE_PATH` | `storage/framework/cache/server-polling/<APP_ENV>` | Directorio de coordinación del sondeo de workers cuando la caché se almacena en archivos. | `WORKFLOW_SERVER_POLLING_CACHE_PATH` |
| `DW_WAKE_SIGNAL_TTL_SECONDS` | `max(DW_WORKER_POLL_TIMEOUT + 5, 60)` | TTL de las señales de despertar por cola que interrumpen la espera de un sondeo. | `WORKFLOW_SERVER_WAKE_SIGNAL_TTL_SECONDS` |
| `DW_WORKER_LONG_POLL_MAX_CONCURRENT` | sin definir; derivado de `PHP_CLI_SERVER_WORKERS` | Límite opcional de esperas simultáneas de long polling de tareas de workflow o actividad en este nodo. Los sondeos de consultas tienen un presupuesto separado. El Server nativo 3.x lo ignora; consulte [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKER_LONG_POLL_MAX_CONCURRENT` |
| `DW_WORKER_LONG_POLL_RESERVED_HTTP_WORKERS` | `2` | Workers del servidor CLI de PHP reservados para salud y plano de control al calcular el límite de espera del long polling de workflows y actividades. El Server nativo 3.x lo ignora; consulte [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKER_LONG_POLL_RESERVED_HTTP_WORKERS` |
| `DW_MAX_TASKS_PER_POLL` | `1` | Máximo de tareas devueltas por sondeo de un worker. | `WORKFLOW_SERVER_MAX_TASKS_PER_POLL` |
| `DW_SQLITE_CLAIM_LOCK_TTL_SECONDS` | `10` | Segundos antes de que expire la exclusión de reclamación de tareas, respaldada por caché, del backend SQLite de inicio rápido. | `WORKFLOW_SERVER_SQLITE_CLAIM_LOCK_TTL_SECONDS` |
| `DW_SQLITE_CLAIM_LOCK_WAIT_SECONDS` | `5` | Segundos que una reclamación de tareas SQLite espera por la exclusión respaldada por caché antes de devolver presión de bloqueo del backend. | `WORKFLOW_SERVER_SQLITE_CLAIM_LOCK_WAIT_SECONDS` |
| `DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` | sin definir | Máximo de leases activos de tareas de workflow por namespace y cola. El Server nativo 3.x se niega a arrancar si es un número positivo; consulte [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` |
| `DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` | sin definir | Máximo de leases activos de tareas de workflow entre todas las colas de un namespace. El Server nativo 3.x se niega a arrancar si es un número positivo; consulte [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` |
| `DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE` | sin definir | Máximo de despachos de tareas de workflow por minuto, namespace y cola. El Server nativo 3.x se niega a arrancar si es un número positivo; consulte [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE` |
| `DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` | sin definir | Máximo de despachos de tareas de workflow por minuto en todo un namespace. El Server nativo 3.x se niega a arrancar si es un número positivo; consulte [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` |
| `DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` | sin definir | Máximo de leases activos de tareas de actividad por namespace y cola. El Server nativo 3.x se niega a arrancar si es un número positivo; consulte [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` |
| `DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` | sin definir | Máximo de leases activos de tareas de actividad entre todas las colas de un namespace. El Server nativo 3.x se niega a arrancar si es un número positivo; consulte [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` |
| `DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE` | sin definir | Máximo de despachos de tareas de actividad por minuto, namespace y cola. El Server nativo 3.x se niega a arrancar si es un número positivo; consulte [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE` |
| `DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` | sin definir | Máximo de despachos de tareas de actividad por minuto en todo un namespace. El Server nativo 3.x se niega a arrancar si es un número positivo; consulte [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` |
| `DW_TASK_QUEUE_ADMISSION_OVERRIDES` | `{}` | Opciones JSON específicas por `namespace:task_queue`, `namespace:*`, `task_queue` o `*` para leases activos, ritmo de despacho, límites de namespace y grupos de presupuesto de servicios posteriores. El Server nativo 3.x se niega a arrancar salvo que esté sin definir o sea `{}`; consulte [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_TASK_QUEUE_ADMISSION_OVERRIDES` |
| `DW_DUE_TIMER_RECOVERY_SCAN_LIMIT` | `5` | Máximo de tareas de temporizador vencidas en modo de servicio que se recuperan en cada pasada de sondeo de un worker. | `WORKFLOW_SERVER_DUE_TIMER_RECOVERY_SCAN_LIMIT` |
| `DW_EXPIRED_WORKFLOW_TASK_RECOVERY_SCAN_LIMIT` | `5` | Máximo de tareas de workflow caducadas que se recuperan en cada pasada. | `WORKFLOW_SERVER_EXPIRED_WORKFLOW_TASK_RECOVERY_SCAN_LIMIT` |
| `DW_EXPIRED_WORKFLOW_TASK_RECOVERY_TTL_SECONDS` | `5` | Mínimo de segundos entre pasadas de recuperación de tareas caducadas por cola. | `WORKFLOW_SERVER_EXPIRED_WORKFLOW_TASK_RECOVERY_TTL_SECONDS` |

La ejecución sticky no tiene variables de entorno independientes en la imagen de Server. Consulte [Ejecución sticky](/docs/features/sticky-execution) para conocer el ciclo de vida de la caché sticky, los campos del protocolo de workers, los modos de replay y los diagnósticos.

Ejemplo de configuración específica de admisión:

```json
{
  "production:billing": {
    "workflow_tasks": {
      "max_active_leases": 50,
      "max_dispatches_per_minute": 600
    },
    "activity_tasks": {
      "max_active_leases": 200
    }
  },
  "production:*": {
    "workflow_tasks": {
      "max_active_leases_per_namespace": 500
    }
  }
}
```

## Protocolo de workers y transporte de consultas {#worker-protocol-and-query-transport}

| Variable | Valor predeterminado | Propósito | Alias antiguo |
| --- | --- | --- | --- |
| `DW_WORKER_PROTOCOL_VERSION` | `WorkerProtocolVersion::VERSION` | Versión del protocolo de workers anunciada en las respuestas del plano de workers. | `WORKFLOW_SERVER_WORKER_PROTOCOL_VERSION` |
| `DW_HISTORY_PAGE_SIZE_DEFAULT` | `WorkerProtocolVersion::DEFAULT_HISTORY_PAGE_SIZE` | Tamaño de página predeterminado para las lecturas de historial de los workers. | `WORKFLOW_SERVER_HISTORY_PAGE_SIZE_DEFAULT` |
| `DW_HISTORY_PAGE_SIZE_MAX` | `WorkerProtocolVersion::MAX_HISTORY_PAGE_SIZE` | Máximo tamaño de página respetado en las lecturas de historial de los workers. | `WORKFLOW_SERVER_HISTORY_PAGE_SIZE_MAX` |
| `DW_UPDATE_VALIDATION_TIMEOUT` | `10` | Segundos que el plano de control espera el resultado de un validador síncrono antes de aceptar una actualización. | `WORKFLOW_SERVER_UPDATE_VALIDATION_TIMEOUT` |
| `DW_UPDATE_VALIDATION_LEASE_TIMEOUT` | `5` | Segundos durante los que un validador conserva el lease de una tarea antes de que un worker de reemplazo con capacidad de validación pueda reintentarlo. | `WORKFLOW_SERVER_UPDATE_VALIDATION_LEASE_TIMEOUT` |
| `DW_QUERY_TASK_TIMEOUT` | `DW_WORKER_POLL_TIMEOUT` | Segundos que el plano de control espera la respuesta del worker a una tarea de consulta. | `WORKFLOW_SERVER_QUERY_TASK_TIMEOUT` |
| `DW_QUERY_TASK_LEASE_TIMEOUT` | `DW_WORKFLOW_TASK_TIMEOUT` | Plazo del lease de las tareas efímeras de consulta entregadas a los workers. | `WORKFLOW_SERVER_QUERY_TASK_LEASE_TIMEOUT` |
| `DW_QUERY_TASK_TTL_SECONDS` | `180` | Tiempo durante el que Server conserva las filas de resultados de consultas antes de eliminarlas. | `WORKFLOW_SERVER_QUERY_TASK_TTL_SECONDS` |
| `DW_QUERY_TASK_MAX_PENDING_PER_QUEUE` | `1024` | Máximo de tareas de consulta pendientes respaldadas por caché por namespace y cola antes de rechazar nuevas consultas. El Server nativo 3.x rechaza cualquier valor distinto de `1024` y, en su lugar, aplica su propio límite fijo de tareas de consulta; consulte [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_QUERY_TASK_MAX_PENDING_PER_QUEUE` |
| `DW_QUERY_TASK_POLL_TIMEOUT` | `5` | Máximo de segundos que espera cada sondeo de consultas inactivo antes de volver a comprobar la presión de tareas de workflow y la disponibilidad del plano de control. | `WORKFLOW_SERVER_QUERY_TASK_POLL_TIMEOUT` |
| `DW_QUERY_TASK_POLL_MAX_CONCURRENT` | sin definir; derivado de `PHP_CLI_SERVER_WORKERS` | Límite opcional de esperas simultáneas de long polling de consultas inactivas en este nodo. Las consultas pendientes aún pueden reclamarse de inmediato antes de que el sondeo empiece a esperar. El Server nativo 3.x lo ignora; consulte [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_QUERY_TASK_POLL_MAX_CONCURRENT` |
| `DW_WORKFLOW_TASK_TIMEOUT` | `60` | Plazo predeterminado del lease de una tarea de workflow, en segundos. | `WORKFLOW_TASK_TIMEOUT` |
| `DW_ACTIVITY_TASK_TIMEOUT` | `300` | Plazo predeterminado del lease de una tarea de actividad, en segundos. | `ACTIVITY_TASK_TIMEOUT` |
| `DW_WORKER_STALE_AFTER_SECONDS` | `max(DW_WORKER_HEARTBEAT_INTERVAL_SECONDS * 3, 30)` | Segundos tras el heartbeat de un worker antes de considerar obsoleto su registro. | `WORKFLOW_SERVER_WORKER_STALE_AFTER_SECONDS` |
| `DW_WORKER_HEARTBEAT_INTERVAL_SECONDS` | `10` | Cadencia en segundos anunciada a los SDK en las confirmaciones de registro y heartbeat del worker. | `WORKFLOW_SERVER_WORKER_HEARTBEAT_INTERVAL_SECONDS` |

## Límites, retención y métricas {#limits-retention-and-metrics}

Estas opciones controlan los límites de las solicitudes y el crecimiento acotado. Si una aplicación se acerca habitualmente a estos valores, prefiera cargas más pequeñas, almacenamiento externo de cargas o continue-as-new antes que aumentar los límites de forma predeterminada.

| Variable | Valor predeterminado | Propósito | Alias antiguo |
| --- | --- | --- | --- |
| `DW_METRICS_WORKFLOW_TASK_FAILURE_TYPE_LIMIT` | `20` | Máximo de series `workflow_type` de `dw_workflow_task_consecutive_failures`; los tipos restantes se resumen. | `WORKFLOW_SERVER_METRICS_WORKFLOW_TASK_FAILURE_TYPE_LIMIT` |
| `DW_METRICS_PROMETHEUS_WORKFLOW_SERIES_LIMIT` | `100` | Máximo de series de workflows de `/api/system/prometheus-metrics` antes de resumir las series restantes. | `WORKFLOW_SERVER_METRICS_PROMETHEUS_WORKFLOW_SERIES_LIMIT` |
| `DW_METRICS_PROMETHEUS_ACTIVITY_SERIES_LIMIT` | `100` | Máximo de series de actividades de `/api/system/prometheus-metrics` antes de resumir las series restantes. | `WORKFLOW_SERVER_METRICS_PROMETHEUS_ACTIVITY_SERIES_LIMIT` |
| `DW_METRICS_PROMETHEUS_TASK_QUEUE_SERIES_LIMIT` | `100` | Máximo de series de ejecución por cola de `/api/system/prometheus-metrics` antes de resumir las series restantes. | `WORKFLOW_SERVER_METRICS_PROMETHEUS_TASK_QUEUE_SERIES_LIMIT` |
| `DW_MAX_HISTORY_EVENTS` | `50000` | No tiene ningún efecto. Ninguna versión del Server la lee y el historial por ejecución no tiene límite. Limite los historiales largos con continue-as-new. | `WORKFLOW_MAX_HISTORY_EVENTS` |
| `DW_HISTORY_RETENTION_DAYS` | `30` | Días de conservación predeterminados del historial de ejecuciones cerradas cuando el namespace no los reemplaza. | `WORKFLOW_HISTORY_RETENTION_DAYS` |
| `DW_MAX_PAYLOAD_BYTES` | `2097152` | Máximo de bytes serializados de una carga. | `WORKFLOW_MAX_PAYLOAD_BYTES` |
| `DW_EXTERNAL_PAYLOAD_MAX_BYTES` | `67108864` | Máximo tamaño codificado en bytes (64 MiB) admitido por el transporte autenticado de carga y descarga de cargas externas. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_MAX_BYTES` |
| `DW_EXTERNAL_PAYLOAD_REQUEST_TIMEOUT` | `30` | Presupuesto en segundos de las solicitudes de carga y descarga anunciado por Server a los clientes. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_REQUEST_TIMEOUT` |
| `DW_EXTERNAL_PAYLOAD_UPLOAD_EXPIRY` | `3600` | Segundos que una carga externa subida puede permanecer sin reclamar antes de que caduque su referencia opaca. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_UPLOAD_EXPIRY` |
| `DW_MAX_MEMO_BYTES` | `262144` | Máximo de bytes serializados del memo de un workflow. | `WORKFLOW_MAX_MEMO_BYTES` |
| `DW_MAX_SEARCH_ATTRIBUTES` | `100` | Máximo de atributos de búsqueda de un workflow. | `WORKFLOW_MAX_SEARCH_ATTRIBUTES` |
| `DW_MAX_SEARCH_ATTRIBUTE_KEY_LENGTH` | `128` | Máxima longitud en bytes de una clave de atributo de búsqueda. | `WORKFLOW_MAX_SEARCH_ATTRIBUTE_KEY_LENGTH` |
| `DW_MAX_SEARCH_ATTRIBUTE_VALUE_BYTES` | `2048` | Máximo tamaño en bytes del valor de texto de un atributo de búsqueda. | `WORKFLOW_MAX_SEARCH_ATTRIBUTE_VALUE_BYTES` |
| `DW_MAX_OPERATION_NAME_LENGTH` | `256` | Máxima longitud en bytes del nombre de una señal, actualización o consulta. | `WORKFLOW_MAX_OPERATION_NAME_LENGTH` |
| `DW_MAX_PENDING_ACTIVITIES` | `2000` | Máximo de actividades pendientes por ejecución antes de rechazar un lote de comandos. | `WORKFLOW_MAX_PENDING_ACTIVITIES` |
| `DW_MAX_PENDING_CHILDREN` | `2000` | Máximo de workflows hijos pendientes por ejecución antes de rechazar un lote de comandos. | `WORKFLOW_MAX_PENDING_CHILDREN` |
| `DW_MAX_NEXUS_OPERATIONS_PER_CALLER` | `200` | Máximo de operaciones Nexus devueltas por llamador en el historial antes de exigir paginación. | `WORKFLOW_MAX_NEXUS_OPERATIONS_PER_CALLER` |
| `DW_COMPRESSION_ENABLED` | `true` | Activa la compresión de respuestas JSON que superan el tamaño mínimo. | `WORKFLOW_SERVER_COMPRESSION_ENABLED` |

## Límites de Server en la recepción de solicitudes {#server-request-boundary-limits}

Al utilizar el servidor independiente, se aplica otro conjunto de máximos en el límite de entrada de solicitudes HTTP, antes de que una tarea de workflow, señal, actualización o consulta llegue al plano de control. Estos límites rechazan de inmediato con una respuesta `422 validation_failed` (o `413 payload_too_large` para comprobaciones de todo el cuerpo), de modo que los clientes conocen el motivo sin que el servidor escriba ninguna fila en la base de datos.

| Límite | Valor predeterminado | Clave de configuración | Qué limita |
|---|---|---|---|
| Tamaño del cuerpo | 2 MiB | `server.limits.max_payload_bytes` | Total de bytes del cuerpo de la solicitud HTTP, salvo una finalización de tarea de workflow en el Server nativo 3.6.0 o posterior (fila siguiente) |
| Tamaño de finalización de tarea de workflow | 32 MiB (16 × tamaño del cuerpo) | derivado de `server.limits.max_payload_bytes` | Server nativo 3.6.0 o posterior: una solicitud que finaliza una tarea de workflow con comandos. Los argumentos de cada comando siguen respetando el límite por carga útil |
| Tamaño de memo | 256 KiB | `server.limits.max_memo_bytes` | Memo serializado en `POST /workflows` y `POST /schedules` |
| Número de atributos de búsqueda | 100 | `server.limits.max_search_attributes` | Atributos de búsqueda personalizados registrados por namespace |
| Longitud de clave de atributo de búsqueda | 128 bytes | `server.limits.max_search_attribute_key_length` | Longitud de una clave de atributo de búsqueda al iniciar |
| Tamaño de valor de atributo de búsqueda | 2 KiB | `server.limits.max_search_attribute_value_bytes` | Cada valor de cadena (y cada elemento de un valor de matriz) al iniciar |
| Nombre de señal, actualización o consulta | 256 bytes | `server.limits.max_operation_name_length` | Segmento de ruta URL para los nombres de señales, actualizaciones y consultas |
| Longitud de `workflow_id` | 128 caracteres | Validador del controlador | ID del workflow en `POST /workflows` |
| `workflow_type` / `task_queue` / `business_key` | 255 caracteres | Validador del controlador | Campos de cadena en `POST /workflows` |
| `request_id` | 255 caracteres | Validador del controlador | Token de deduplicación en señales, actualizaciones, cancelación y terminación |
| `reason` | 1,000 caracteres | Validador del controlador | Texto del motivo en cancelación, terminación y archivado |

Cada límite se puede configurar por separado mediante variables de entorno `DW_*` (consulta el contrato completo en `config/dw-contract.php`). Establecer un valor de `0` desactiva la comprobación de ese límite concreto, pero mantiene las demás.

Los valores configurados actualmente se publican bajo `limits` en la respuesta de `GET /api/cluster/info`, de modo que los clientes pueden descubrirlos durante la ejecución:

```json
{
  "limits": {
    "max_payload_bytes": 2097152,
    "max_memo_bytes": 262144,
    "max_search_attributes": 100,
    "max_search_attribute_key_length": 128,
    "max_search_attribute_value_bytes": 2048,
    "max_operation_name_length": 256,
    "max_pending_activities": 2000,
    "max_pending_children": 2000
  }
}
```

Los errores de validación se devuelven en el sobre de error estándar del plano de control con `reason: "validation_failed"` y un mapa `validation_errors` cuyas claves corresponden al campo que causa el error (`signal_name`, `update_name`, `query_name`, `search_attributes`, `memo`, etc.). Los rechazos por tamaño de carga útil utilizan `reason: "payload_too_large"` y el código de estado `413`.

### Tamaño de finalización de tarea de workflow {#workflow-task-completion-size}

En el Server nativo 3.6.0 y posteriores, una solicitud que finaliza una tarea de workflow con comandos (`POST /api/worker/workflow-tasks/{id}/complete` y `POST /api/worker/activity-tasks/{id}/continuation/complete`) puede ocupar hasta 16 veces `max_payload_bytes`: 32 MiB con el valor predeterminado de 2 MiB. Sigue a `DW_MAX_PAYLOAD_BYTES` y no tiene un ajuste propio. Los argumentos de cada comando siguen respetando el límite por carga útil dentro de la finalización. El Server PHP 2.x y las versiones nativas anteriores limitan una finalización a un límite de carga útil, como cualquier otra solicitud.

Una finalización mayor se rechaza con `413 payload_too_large` y `limit_kind: workflow_task_completion_bytes` antes de registrar nada. Reproducir la tarea genera los mismos comandos, así que reenviar la finalización recibe el mismo rechazo. Cuando PHP SDK 3.17.0 o posterior recibe este rechazo tipado, no reenvía la finalización: el worker hace fallar la ejecución una sola vez con un comando `fail_workflow` cuyo mensaje empieza por `Structural limit exceeded: workflow_task_completion_bytes:` e indica ambos tamaños, y el Server registra el fallo con `failure_category = structural_limit`.

Python SDK 2.17 y Rust SDK 4.15 gestionan el rechazo tipado. En Server 3.8.0,
una finalización demasiado grande puede fallar en el transporte antes de que el
worker reciba HTTP 413. En la prueba con el SDK de Python publicado,
`httpx.ReadError` dejó el workflow pendiente en lugar de fallar por un límite
estructural. La aceptación de solicitudes sobredimensionadas en el Server
publicado sigue abierta en la [corrección de la respuesta del Server](https://github.com/durable-workflow/.github/issues/228#issuecomment-6848969678).
Reduzca las finalizaciones hasta que esa ruta esté cualificada.

Para mantener una finalización dentro del límite:

- Divida un fan-out grande en lotes más pequeños repartidos entre tareas de workflow.
- Mueva trabajo a workflows hijos, o use continue-as-new.
- Guarde los argumentos grandes en el almacenamiento externo de cargas útiles, para que la finalización lleve referencias en lugar de las cargas útiles.

#### Planificación de comandos en Rust {#rust-completion-planning}

Rust SDK 4.15.0 sigue usando el límite habitual por carga como techo agregado
de planificación de comandos (2 MiB por defecto), antes de la mayor capacidad
de finalización del Server. Sin almacenamiento externo de cargas en el
namespace, el fan-out publicado de 300 × 10 KB se rechaza con
`external_payload_unavailable`. El worker sale y la ejecución sigue pendiente.
Use lotes de comandos más pequeños mientras esté pendiente la
[corrección del planificador agregado del SDK](https://github.com/durable-workflow/sdk-rust/issues/254).
Esta ruta del SDK aún no implementa la mayor capacidad del Server.

## Inicialización de Docker y procedencia {#docker-bootstrap-and-provenance}

| Variable | Valor predeterminado | Propósito | Alias antiguo |
| --- | --- | --- | --- |
| `DW_EXPOSE_PACKAGE_PROVENANCE` | `false` | Incluye `package_provenance` en `/api/cluster/info` para solicitudes de administrador. | `WORKFLOW_SERVER_EXPOSE_PACKAGE_PROVENANCE` |
| `DW_PACKAGE_PROVENANCE_PATH` | `<base_path>/.package-provenance` | Ruta absoluta del archivo de procedencia de la compilación Docker. | `WORKFLOW_SERVER_PACKAGE_PROVENANCE_PATH` |
| `DW_SERVICE_BOUNDARY_CROSS_NAMESPACE_DEFAULT` | `allow` | Acción predeterminada del límite de llamadas de servicio entre namespaces cuando no coincide una regla más específica. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_CROSS_NAMESPACE_DEFAULT` |
| `DW_SERVICE_BOUNDARY_RATE_LIMIT_PER_MINUTE` | sin definir | Límite opcional de llamadas de servicio por minuto. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_RATE_LIMIT_PER_MINUTE` |
| `DW_SERVICE_BOUNDARY_MAX_IN_FLIGHT` | sin definir | Límite opcional de llamadas de servicio simultáneas. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_MAX_IN_FLIGHT` |

## Inicialización de Docker {#docker-bootstrap}

| Variable | Valor predeterminado | Propósito | Alias antiguo |
| --- | --- | --- | --- |
| `DW_ENV_AUDIT_STRICT` | `0` | Impide arrancar el contenedor si `env:audit` encuentra variables `DW_*` desconocidas o antiguas. | - |
| `DW_BOOTSTRAP_RETRIES` | `30` | Intentos de inicialización antes de que el punto de entrada abandone las migraciones y la creación del namespace predeterminado. | `WORKFLOW_SERVER_BOOTSTRAP_RETRIES` |
| `DW_BOOTSTRAP_DELAY_SECONDS` | `2` | Segundos entre intentos de inicialización. | `WORKFLOW_SERVER_BOOTSTRAP_DELAY_SECONDS` |

## Controles del paquete Workflow {#workflow-package-controls}

La imagen de Server incluye `durable-workflow/workflow`, por lo que también expone los controles `DW_V2_*` del paquete. Deben coincidir con los despliegues de workers que ejecuten los mismos workflows.

| Variable | Valor predeterminado | Propósito | Alias antiguo |
| --- | --- | --- | --- |
| `DW_V2_NAMESPACE` | sin definir | Limita las instancias de workflow a un namespace. | `WORKFLOW_V2_NAMESPACE` |
| `DW_V2_TENANCY_ORGANIZATION` | sin definir | Segmento opcional de organización de la jerarquía de tenancy del paquete Workflow, expuesto en disponibilidad, descubrimiento y vistas del operador. | `WORKFLOW_V2_TENANCY_ORGANIZATION` |
| `DW_V2_TENANCY_PROJECT` | sin definir | Segmento opcional de proyecto de la jerarquía de tenancy del paquete Workflow, expuesto en disponibilidad, descubrimiento y vistas del operador. | `WORKFLOW_V2_TENANCY_PROJECT` |
| `DW_V2_TENANCY_ENVIRONMENT` | sin definir | Segmento opcional de entorno de la jerarquía de tenancy del paquete Workflow, expuesto en disponibilidad, descubrimiento y vistas del operador. | `WORKFLOW_V2_TENANCY_ENVIRONMENT` |
| `DW_V2_CURRENT_COMPATIBILITY` | sin definir | Marcador de compatibilidad que anuncia este worker. | `WORKFLOW_V2_CURRENT_COMPATIBILITY` |
| `DW_V2_SUPPORTED_COMPATIBILITIES` | sin definir | Marcadores de compatibilidad separados por comas que acepta este worker, o `*`. | `WORKFLOW_V2_SUPPORTED_COMPATIBILITIES` |
| `DW_V2_COMPATIBILITY_NAMESPACE` | sin definir | Namespace de compatibilidad para bases de datos compartidas de workflows con flotas independientes. | `WORKFLOW_V2_COMPATIBILITY_NAMESPACE` |
| `DW_V2_COMPATIBILITY_HEARTBEAT_TTL` | `30` | Segundos durante los que un heartbeat de compatibilidad del worker sigue siendo válido. | `WORKFLOW_V2_COMPATIBILITY_HEARTBEAT_TTL` |
| `DW_V2_PIN_TO_RECORDED_FINGERPRINT` | `true` | Preferir la definición de workflow registrada; consulte a continuación el límite de la alternativa según el runtime. | `WORKFLOW_V2_PIN_TO_RECORDED_FINGERPRINT` |
| `DW_V2_CONTINUE_AS_NEW_EVENT_THRESHOLD` | `10000` | Número de eventos de historial a partir del que el paquete pide al autor usar continue-as-new. | `WORKFLOW_V2_CONTINUE_AS_NEW_EVENT_THRESHOLD` |
| `DW_V2_CONTINUE_AS_NEW_SIZE_BYTES_THRESHOLD` | `5242880` | Tamaño en bytes del historial serializado a partir del que el paquete pide continue-as-new. | `WORKFLOW_V2_CONTINUE_AS_NEW_SIZE_BYTES_THRESHOLD` |
| `DW_V2_HISTORY_EXPORT_SIGNING_KEY` | sin definir | Clave HMAC opcional para autenticar los archivos de exportación del historial. | `WORKFLOW_V2_HISTORY_EXPORT_SIGNING_KEY` |
| `DW_V2_HISTORY_EXPORT_SIGNING_KEY_ID` | sin definir | Identificador de clave registrado junto con las exportaciones firmadas del historial. | `WORKFLOW_V2_HISTORY_EXPORT_SIGNING_KEY_ID` |
| `DW_V2_UPDATE_WAIT_COMPLETION_TIMEOUT_SECONDS` | `10` | Segundos que Server espera para que una actualización alcance una etapa terminal. | `WORKFLOW_V2_UPDATE_WAIT_COMPLETION_TIMEOUT_SECONDS` |
| `DW_V2_UPDATE_WAIT_POLL_INTERVAL_MS` | `50` | Milisegundos entre sondeos de la etapa de una actualización. | `WORKFLOW_V2_UPDATE_WAIT_POLL_INTERVAL_MS` |
| `DW_V2_GUARDRAILS_BOOT` | `warn` | Modo de límites estructurales al arrancar: `warn`, `fail` o `silent`. | `WORKFLOW_V2_GUARDRAILS_BOOT` |
| `DW_V2_LIMIT_PENDING_ACTIVITIES` | `2000` | Máximo de actividades pendientes del paquete. | `WORKFLOW_V2_LIMIT_PENDING_ACTIVITIES` |
| `DW_V2_LIMIT_PENDING_CHILDREN` | `1000` | Máximo de workflows hijos pendientes del paquete. | `WORKFLOW_V2_LIMIT_PENDING_CHILDREN` |
| `DW_V2_LIMIT_PENDING_TIMERS` | `2000` | Máximo de temporizadores pendientes del paquete. | `WORKFLOW_V2_LIMIT_PENDING_TIMERS` |
| `DW_V2_LIMIT_PENDING_SIGNALS` | `5000` | Máximo de señales pendientes del paquete. | `WORKFLOW_V2_LIMIT_PENDING_SIGNALS` |
| `DW_V2_LIMIT_PENDING_UPDATES` | `500` | Máximo de actualizaciones pendientes del paquete. | `WORKFLOW_V2_LIMIT_PENDING_UPDATES` |
| `DW_V2_LIMIT_COMMAND_BATCH_SIZE` | `1000` | Máximo de comandos aceptados en la finalización de una tarea de workflow. | `WORKFLOW_V2_LIMIT_COMMAND_BATCH_SIZE` |
| `DW_V2_LIMIT_PAYLOAD_SIZE_BYTES` | `2097152` | Máximo de bytes por carga del paquete. | `WORKFLOW_V2_LIMIT_PAYLOAD_SIZE_BYTES` |
| `DW_V2_LIMIT_MEMO_SIZE_BYTES` | `262144` | Máximo de bytes del memo de un workflow en el paquete. | `WORKFLOW_V2_LIMIT_MEMO_SIZE_BYTES` |
| `DW_V2_LIMIT_SEARCH_ATTRIBUTE_SIZE_BYTES` | `40960` | Máximo de bytes de atributos de búsqueda del paquete. | `WORKFLOW_V2_LIMIT_SEARCH_ATTRIBUTE_SIZE_BYTES` |
| `DW_V2_LIMIT_HISTORY_TRANSACTION_SIZE` | `5000` | Máximo de eventos por transacción de historial del paquete. | `WORKFLOW_V2_LIMIT_HISTORY_TRANSACTION_SIZE` |
| `DW_V2_LIMIT_WARNING_THRESHOLD_PERCENT` | `80` | Porcentaje de un límite estructural a partir del que el paquete emite una advertencia. | `WORKFLOW_V2_LIMIT_WARNING_THRESHOLD_PERCENT` |
| `DW_V2_TASK_DISPATCH_MODE` | `queue` | Modo de despacho de tareas del paquete, normalmente reemplazado por `DW_TASK_DISPATCH_MODE` en modo Server. | - |
| `DW_V2_MATCHING_ROLE_QUEUE_WAKE` | `true` | Determina si los workers de cola despiertan el rol de asignación en cada evento Looping. Use `false` para excluir los nodos dedicados a ejecución del despertar por sondeo amplio cuando un daemon dedicado de `php artisan workflow:v2:repair-pass --loop` realiza el barrido. | `WORKFLOW_V2_MATCHING_ROLE_QUEUE_WAKE` |
| `DW_V2_TASK_REPAIR_REDISPATCH_AFTER_SECONDS` | `3` | Segundos antes de que la reparación vuelva a despachar una tarea de workflow huérfana. | `WORKFLOW_V2_TASK_REPAIR_REDISPATCH_AFTER_SECONDS` |
| `DW_V2_TASK_REPAIR_LOOP_THROTTLE_SECONDS` | `5` | Mínimo de segundos entre pasadas de reparación de tareas por cola. | `WORKFLOW_V2_TASK_REPAIR_LOOP_THROTTLE_SECONDS` |
| `DW_V2_TASK_REPAIR_SCAN_LIMIT` | `25` | Máximo de tareas consideradas por pasada de reparación. | `WORKFLOW_V2_TASK_REPAIR_SCAN_LIMIT` |
| `DW_V2_TASK_REPAIR_FAILURE_BACKOFF_MAX_SECONDS` | `60` | Máxima espera en segundos tras un fallo de reparación de tareas. | `WORKFLOW_V2_TASK_REPAIR_FAILURE_BACKOFF_MAX_SECONDS` |
| `DW_V2_MULTI_NODE` | `false` | Declara un despliegue multinodo para validar que la caché admite la coordinación entre nodos. | `WORKFLOW_V2_MULTI_NODE` |
| `DW_V2_VALIDATE_CACHE_BACKEND` | `true` | Valida al arrancar el backend de caché del long polling. | `WORKFLOW_V2_VALIDATE_CACHE_BACKEND` |
| `DW_V2_CACHE_VALIDATION_MODE` | `warn` | Modo de fallo de validación del backend de caché: `fail`, `warn` o `silent`. | `WORKFLOW_V2_CACHE_VALIDATION_MODE` |
| `DW_V2_FLEET_VALIDATION_MODE` | `warn` | Modo de validación de compatibilidad de la flota: `warn` registra avisos; `fail` bloquea el despacho y rechaza la operación si no hay un worker compatible. | `WORKFLOW_V2_FLEET_VALIDATION_MODE` |
| `DW_SERIALIZER` | `avro` | Entrada de diagnóstico del codec de cargas; la versión final v2 resuelve las cargas de nuevos runs a Avro. | `WORKFLOW_SERIALIZER` |

**Preferencia de fingerprint publicada.** Server 2.9.9 hace efectiva la preferencia de fingerprint para los workers de servicio. Con la asignación activada, una definición modificada solo puede actuar como alternativa cuando no queda un worker elegible con la definición registrada y la sustitución anuncia `workflow_entry_arguments_validation`. Al desactivarla, se elimina la preferencia de código; se conservan las asignaciones de build, el aislamiento de namespace/cola/tipo, la identidad de inscripción y el replay estricto. Las protecciones de entrada correspondientes están disponibles desde los SDK PHP 2.5.4, Python 2.6.2 y Rust 3.5.6. Son las versiones mínimas para estas funciones; instale las versiones estables actuales con correcciones de seguridad. No suponga este comportamiento en un runtime anterior solo porque contenga la misma clave de configuración. Consulte el [enrutamiento de definiciones](./worker-compatibility-routing.md#definition-fingerprint-evolution).

Use `DW_V2_GUARDRAILS_BOOT` en CI y en los manifiestos de despliegue. El nombre antiguo `WORKFLOW_V2_GUARDRAILS_BOOT` se conserva solo para que `env:audit` indique el nuevo nombre a los operadores de la etapa alfa. El paquete Workflow ya no lo lee como alternativa en tiempo de ejecución.

Consulte [Asignación y despacho de tareas](/docs/polyglot/task-matching-dispatch) al configurar `DW_V2_MATCHING_ROLE_QUEUE_WAKE` o un daemon dedicado de `workflow:v2:repair-pass --loop`. Estas opciones cambian dónde se descubren las tareas listas, no el contrato del protocolo de workers.

## Controles adicionales del PHP Server publicado {#additional-published-php-controls}

Esta referencia cubre el contrato publicado de **PHP Server 2.11.0**, incluidos los controles siguientes. Comprueba la imagen que ejecutas: la versión de instalación seleccionada por separado puede ser anterior. `unset` indica que no se proporciona un valor de entorno; su efecto depende del control. Los valores predeterminados y alias proceden del [contrato publicado](https://github.com/durable-workflow/server/blob/36d16273604755f3dd0743cab331cc7c62e51d8e/config/dw-contract.php). La compilación comprueba su snapshot versionado en todos los idiomas. Esta referencia no cambia el conjunto de versiones seleccionado.

### Admisión HTTP por namespace {#namespace-request-controls}

| Variable | Valor predeterminado | Propósito | Alias anterior |
| --- | --- | --- | --- |
| `DW_NAMESPACE_MAX_REQUESTS_PER_MINUTE` | `unset` | Límite opcional de peticiones de control por minuto y namespace; sin valor no hay límite. El Server nativo 3.x se niega a arrancar si no está vacío; consulte [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_MAX_REQUESTS_PER_MINUTE` |
| `DW_NAMESPACE_MAX_CONCURRENT_REQUESTS` | `unset` | Límite opcional de peticiones de control simultáneas por namespace; sin valor no hay límite. El Server nativo 3.x se niega a arrancar si no está vacío; consulte [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_MAX_CONCURRENT_REQUESTS` |
| `DW_NAMESPACE_HARD_MAX_REQUESTS_PER_MINUTE` | `unset` | Techo obligatorio de peticiones por minuto, incluidas las excepciones por namespace. El Server nativo 3.x se niega a arrancar si no está vacío; consulte [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_HARD_MAX_REQUESTS_PER_MINUTE` |
| `DW_NAMESPACE_HARD_MAX_CONCURRENT_REQUESTS` | `unset` | Techo obligatorio de peticiones simultáneas, incluidas las excepciones por namespace. El Server nativo 3.x se niega a arrancar si no está vacío; consulte [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_HARD_MAX_CONCURRENT_REQUESTS` |
| `DW_NAMESPACE_ADMISSION_OVERRIDES` | `{}` | Objeto JSON por namespace con excepciones de frecuencia y concurrencia de peticiones. El Server nativo 3.x se niega a arrancar salvo que esté sin definir o sea `{}`; consulte [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_ADMISSION_OVERRIDES` |

[Admisión de peticiones por namespace](./task-queue-admission.md#namespace-request-admission).

### Cuotas de estado duradero por namespace {#namespace-durable-controls}

| Variable | Valor predeterminado | Propósito | Alias anterior |
| --- | --- | --- | --- |
| `DW_NAMESPACE_DURABLE_LIMITS` | `{}` | JSON de cuotas de filas duraderas por namespace. Los totales y límites pending/open son independientes; las tareas pendientes son filas ready en cola, con leases activos limitados aparte. Un objeto vacío no limita. El Server nativo 3.x se niega a arrancar salvo que esté sin definir o sea `{}`; consulte [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_DURABLE_LIMITS` |
| `DW_NAMESPACE_DURABLE_HARD_LIMITS` | `{}` | JSON de techos obligatorios de filas duraderas, incluidas excepciones; un objeto vacío no añade techos del operador. El Server nativo 3.x se niega a arrancar salvo que esté sin definir o sea `{}`; consulte [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_DURABLE_HARD_LIMITS` |
| `DW_NAMESPACE_DURABLE_OVERRIDES` | `{}` | JSON de excepciones de cuotas duraderas por namespace; los techos obligatorios siguen vigentes. El Server nativo 3.x se niega a arrancar salvo que esté sin definir o sea `{}`; consulte [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_DURABLE_OVERRIDES` |

[Cuotas de estado duradero por namespace](./task-queue-admission.md#namespace-durable-state).

### Cuotas de payload externo y transporte S3 {#external-payload-quotas-and-s3}

| Variable | Valor predeterminado | Propósito | Alias anterior |
| --- | --- | --- | --- |
| `DW_EXTERNAL_PAYLOAD_COMPLETION_MAX_BYTES` | `unset` | Bytes distintos entre upload slots inmutables de un completion con lease; sin valor usa `DW_EXTERNAL_PAYLOAD_MAX_BYTES`. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_COMPLETION_MAX_BYTES` |
| `DW_EXTERNAL_PAYLOAD_MAX_BYTES_PER_NAMESPACE` | `unset` | Bytes acumulados de payloads externos por namespace. Cuenta objetos listos y en curso; sin valor no limita. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_MAX_BYTES_PER_NAMESPACE` |
| `DW_EXTERNAL_PAYLOAD_MAX_OBJECTS_PER_NAMESPACE` | `unset` | Cantidad de objetos de payload externo por namespace. Cuenta objetos listos y en curso; sin valor no limita. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_MAX_OBJECTS_PER_NAMESPACE` |
| `DW_EXTERNAL_PAYLOAD_HARD_MAX_BYTES_PER_NAMESPACE` | `unset` | Techo obligatorio de bytes acumulados de payload externo por namespace, incluidas excepciones. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_HARD_MAX_BYTES_PER_NAMESPACE` |
| `DW_EXTERNAL_PAYLOAD_HARD_MAX_OBJECTS_PER_NAMESPACE` | `unset` | Techo obligatorio de objetos de payload externo por namespace, incluidas excepciones. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_HARD_MAX_OBJECTS_PER_NAMESPACE` |
| `DW_EXTERNAL_PAYLOAD_NAMESPACE_OVERRIDES` | `{}` | Objeto JSON por namespace con excepciones de cuota `max_bytes` y `max_objects`. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_NAMESPACE_OVERRIDES` |
| `DW_EXTERNAL_PAYLOAD_S3_ACCESS_KEY_ID` | `unset` | Access-key ID opcional del disco S3 compatible gestionado por el runtime; puede omitirse con workload identity. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_ACCESS_KEY_ID` |
| `DW_EXTERNAL_PAYLOAD_S3_SECRET_ACCESS_KEY` | `unset` | Clave secreta opcional del disco S3 compatible gestionado; debe configurarse junto al access-key ID. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_SECRET_ACCESS_KEY` |
| `DW_EXTERNAL_PAYLOAD_S3_SESSION_TOKEN` | `unset` | Session token opcional de credenciales temporales del disco S3 compatible gestionado. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_SESSION_TOKEN` |
| `DW_EXTERNAL_PAYLOAD_S3_REGION` | `us-east-1` | Región del disco S3 compatible gestionado por el runtime. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_REGION` |
| `DW_EXTERNAL_PAYLOAD_S3_BUCKET` | `unset` | Bucket del disco S3 compatible gestionado por el runtime. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_BUCKET` |
| `DW_EXTERNAL_PAYLOAD_S3_ENDPOINT` | `unset` | Endpoint HTTPS opcional del servicio S3 compatible de payloads externos. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_ENDPOINT` |
| `DW_EXTERNAL_PAYLOAD_S3_USE_PATH_STYLE_ENDPOINT` | `false` | Usar direccionamiento de bucket path-style para el servicio S3 compatible gestionado. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_USE_PATH_STYLE_ENDPOINT` |

### Límites de servicio por namespace llamador {#service-caller-namespace-controls}

| Variable | Valor predeterminado | Propósito | Alias anterior |
| --- | --- | --- | --- |
| `DW_SERVICE_BOUNDARY_NAMESPACE_RATE_LIMIT_PER_MINUTE` | `unset` | Límite compartido opcional por minuto de llamadas de servicio, agregado por namespace llamador. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_NAMESPACE_RATE_LIMIT_PER_MINUTE` |
| `DW_SERVICE_BOUNDARY_NAMESPACE_MAX_IN_FLIGHT` | `unset` | Límite compartido opcional de llamadas de servicio en curso, agregado por namespace llamador. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_NAMESPACE_MAX_IN_FLIGHT` |
| `DW_SERVICE_BOUNDARY_HARD_RATE_LIMIT_PER_MINUTE` | `unset` | Techo obligatorio por minuto para políticas de límite de servicio y de namespace llamador. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_HARD_RATE_LIMIT_PER_MINUTE` |
| `DW_SERVICE_BOUNDARY_HARD_MAX_IN_FLIGHT` | `unset` | Techo obligatorio de llamadas en curso para políticas de límite de servicio y de namespace llamador. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_HARD_MAX_IN_FLIGHT` |
| `DW_SERVICE_BOUNDARY_NAMESPACE_OVERRIDES` | `{}` | JSON de excepciones de frecuencia y llamadas en curso por namespace llamador; siguen aplicándose los techos. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_NAMESPACE_OVERRIDES` |

### Coordinación, almacenamiento y runtime {#coordination-storage-and-runtime-controls}

| Variable | Valor predeterminado | Propósito | Alias anterior |
| --- | --- | --- | --- |
| `DW_OBSERVABILITY_CONTEXT_ENABLED` | `false` | Activar persistencia y entrega acotadas de trace context y descubrimiento cuando estén instaladas su API y su esquema opcionales. | - |
| `DW_OBSERVABILITY_BAGGAGE_ALLOWLIST` | `[]` | Lista JSON de claves baggage permitidas en los orígenes del run; vacía por defecto. Los links nunca llevan baggage. | - |
| `DW_STORAGE_ADMISSION_FILE` | `unset` | Archivo local opcional de observación de presión de almacenamiento, de solo lectura; observaciones inválidas o antiguas bloquean escrituras. | - |
| `DW_STORAGE_ADMISSION_SOURCE` | `unset` | Identidad esperada del recurso de almacenamiento en la observación de admisión. | - |
| `DW_STORAGE_ADMISSION_MAX_AGE_SECONDS` | `15` | Edad máxima de la observación de almacenamiento en segundos, entre 1 y 300. | - |
| `DW_RUNTIME_CREDENTIALS_ENABLED` | `false` | Activar credenciales bearer de runtime duraderas, ligadas al namespace y respaldadas por base de datos, mediante la API admin. | `WORKFLOW_SERVER_RUNTIME_CREDENTIALS_ENABLED` |
| `DW_WORKER_LONG_POLL_MAX_CONCURRENT_PER_NAMESPACE` | `unset` | Límite por nodo de esperas long-poll workflow/activity de un namespace; no supera el límite global de workers. Rechaza si no hay autoridad de caché compartida. El Server nativo 3.x lo ignora; consulte [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKER_LONG_POLL_MAX_CONCURRENT_PER_NAMESPACE` |
| `DW_QUERY_TASK_POLL_MAX_CONCURRENT_PER_NAMESPACE` | `unset` | Límite por nodo de esperas long-poll query-task de un namespace; no supera el límite global de queries. Rechaza si no hay autoridad de caché compartida. El Server nativo 3.x lo ignora; consulte [Server nativo 3.x](#native-server-3x). | `WORKFLOW_SERVER_QUERY_TASK_POLL_MAX_CONCURRENT_PER_NAMESPACE` |
| `DW_V1_ENABLED` | `false` | Activar migración y vaciado de cola embedded v1 solo para conservar deliberadamente su estado; Server independiente usa únicamente v2 por defecto. | `WORKFLOW_V1_ENABLED` |

## Variables de infraestructura de ejecución {#runtime-infrastructure-variables}

Las variables de infraestructura de ejecución controlan el framework y sus dependencias. La auditoría de Server las reconoce para no emitir advertencias, pero no son controles estables de la API de Durable Workflow. El Server nativo 3.x lee el grupo Base de datos, incluidos los ajustes TLS indicados más abajo. No tiene Redis, caché ni cola de Laravel, escribe sus registros en la salida de error estándar y no lee `LOG_CHANNEL` ni `LOG_LEVEL`.

| Grupo | Variables | Uso |
| --- | --- | --- |
| Aplicación | `APP_NAME`, `APP_ENV`, `APP_KEY`, `APP_DEBUG`, `APP_URL`, `APP_VERSION`, idioma, zona horaria, mantenimiento y cifrado | Identidad y comportamiento de arranque de la aplicación Laravel. |
| Registros | `LOG_CHANNEL`, `LOG_LEVEL`, `LOG_STDERR_FORMATTER`, opciones de stack, daily, Slack y Papertrail | Destinos, formato y retención de registros de Laravel. |
| Base de datos | `DB_CONNECTION`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, `DB_SOCKET`, `DB_URL`, `DB_SSLMODE` (`DB_SSL_MODE`), `DB_SSLROOTCERT` (`DB_SSL_ROOT_CERT`), `MYSQL_ATTR_SSL_CA`, juego de caracteres, cotejamiento y claves foráneas | Almacén SQL de estado para tablas de workflows, namespaces, workers y proyecciones. Consulta [TLS de base de datos](#database-tls). |
| Redis/caché/cola | `REDIS_*`, `QUEUE_CONNECTION`, `QUEUE_FAILED_DRIVER`, `CACHE_STORE`, `CACHE_PREFIX`, `SESSION_*` | Workers de cola, bloqueos de caché, señales de long polling y soporte web y de sesiones. |
| Archivos/correo/difusión | `FILESYSTEM_DISK`, `MAIL_*`, `BROADCAST_*`, `PUSHER_*`, `AWS_*` | Integraciones del framework usadas por funciones propias de cada despliegue. |
| Compilación/ejecución | `MYSQL_VERSION`, `REDIS_VERSION`, `PHP_CLI_SERVER_WORKERS`, `VITE_APP_NAME`, `BCRYPT_ROUNDS` | Imágenes de Docker Compose y comportamiento de ejecución del framework. |

## TLS de base de datos {#database-tls}

El Server nativo 3.x resuelve estos ajustes igual que PHP 2.x: las mismas entradas, alias, nombres de modo y rechazos. Tiene un único proceso de Server que configurar, además de cualquier comando `schema-upgrade` o de toma de control que se ejecute contra la misma base de datos. En PHP 2.x,
configura los mismos valores TLS en el servidor API, el worker de cola, el
trabajo de inicialización/migración y el planificador. PostgreSQL usa `prefer`
por defecto; MySQL/MariaDB conservan sus valores de conexión si no se indica
modo. Ninguno garantiza una conexión cifrada y autenticada.

| `DB_SSLMODE` | PostgreSQL | MySQL / MariaDB |
| --- | --- | --- |
| `disable` | Sin TLS. | Sin TLS; se rechazan opciones TLS contradictorias. |
| `allow`, `prefer` | TLS oportunista sin garantía de cifrado o identidad. | Rechazados. |
| `require` | Cifrado obligatorio. | Cifrado obligatorio con mysqlnd y OpenSSL. |
| `verify-ca` | Cifrado y cadena de certificados de confianza obligatorios. | Rechazado: PDO mysqlnd no puede verificar solo la cadena sin verificar el hostname. |
| `verify-full` | Cifrado, cadena de confianza y hostname coincidente obligatorios. | Cifrado, cadena de confianza y hostname coincidente obligatorios. |

`DB_SSL_MODE` es alias de `DB_SSLMODE`; `DB_SSL_ROOT_CERT`, de `DB_SSLROOTCERT`.
Para verificar certificados, monta un archivo CA legible en la ruta configurada
en **todos los roles**, incluidas las migraciones. `MYSQL_ATTR_SSL_CA` puede
aportar la CA para `verify-full` explícito en MySQL/MariaDB. Los valores
contradictorios entre nombres canónicos, alias o URL impiden el arranque. TLS
obligatorio requiere un hostname TCP explícito; se rechazan sockets Unix. Los
modos TLS explícitos de MySQL/MariaDB necesitan PDO MySQL con mysqlnd y OpenSSL.

```dotenv
DB_CONNECTION=pgsql
DB_HOST=database.example.com
DB_SSLMODE=verify-full
DB_SSLROOTCERT=/run/database-ca/ca.pem
```

Usa el nombre DNS del certificado. En Helm, configura `externalDatabase.sslMode`
y `externalDatabase.tls.existingSecret` / `caKey`. Crea el Secret antes de instalar
o actualizar; el chart monta su CA en los cuatro roles, incluido el hook de
inicialización. Reinicia los roles persistentes al cambiar el entorno:
la configuración se almacena en caché al arrancar.

## Registros de contenedores {#container-logs}

El Server nativo 3.x siempre escribe sus registros en la salida de error estándar. En PHP 2.x,
establece `LOG_CHANNEL=stderr` en los contenedores de API, workers y planificador
para que `docker logs` o `kubectl logs` recopilen los registros de la aplicación.
Configúralo explícitamente en las versiones existentes. Usa `LOG_LEVEL` para
elegir la gravedad mínima. Para JSON con un registro por línea, añade:

```dotenv
LOG_STDERR_FORMATTER="Monolog\Formatter\JsonFormatter"
```

Reinicia los procesos persistentes después de cambiar estas opciones, ya que la
configuración se almacena en caché al arrancar. Un canal de archivo elegido
explícitamente necesita almacenamiento y recopilación propios; Kubernetes no
recopila `storage/logs/laravel.log` automáticamente. `DW_LOG_FORMAT` no es una opción admitida.

## Notas de migración {#migration-notes}

Al migrar un despliegue antiguo, cambie primero al nombre público y deje sin definir el nombre antiguo. Si ambos están presentes, los operadores deben considerar el valor `DW_*` y eliminar el nombre antiguo.

```bash
# Before
WORKFLOW_SERVER_AUTH_DRIVER=token
WORKFLOW_SERVER_OPERATOR_TOKEN=operator-secret

# After
DW_AUTH_DRIVER=token
DW_OPERATOR_TOKEN=operator-secret
```

Tras la migración, ejecute la imagen de Server con `DW_ENV_AUDIT_STRICT=1` para detectar variables mal escritas, alias obsoletos y opciones copiadas de procedimientos antiguos.
