---
sidebar_position: 4
title: Referencia de comandos de CLI
description: Referencia de comandos de la CLI de Durable Workflow, modos de salida estables, opciones comunes y comportamiento de fallos.
tags:
  - CLI
  - reference
  - control-plane
  - automation
keywords:
  - referencia de comandos dw
  - salida de CLI
  - puente webhook
  - comando de workflow
---

# Referencia de comandos de CLI {#cli-command-reference}

Esta página documenta los comandos v2 de `dw` como contrato para operadores y automatización. Utiliza la [guía de CLI](/docs/polyglot/cli) para instalación y perfiles; utiliza esta referencia al conectar scripts, trabajos de CI, procedimientos o agentes de IA a sintaxis exactas.

Todos los comandos respaldados por servidor utilizan la versión `2` del protocolo del plano de control del servidor independiente. La CLI valida los manifiestos publicados por el servidor antes de confiar en campos canónicos de solicitudes y respuestas.

## Opciones globales {#global-options}

Los comandos respaldados por servidor aceptan estas opciones salvo que se indique lo contrario.

| Opción | Significado |
| --- | --- |
| `--server`, `-s` | URL base del servidor. Sustituye perfiles y variables de entorno para esta invocación. |
| `--namespace` | Espacio de nombres de destino. Sustituye el del perfil. |
| `--token` | Token bearer de esta invocación. Para automatización guardada, prefiere perfiles con `--token-env`. |
| `--env` | Perfil de entorno de CLI con nombre. Los nombres desconocidos fallan, sin recurrir a otro perfil. |
| `--output=table\|json\|jsonl` | Contrato de salida. `table` es legible por personas, `json` es un documento y `jsonl` es un objeto por línea para comandos de listado. |
| `--json` | Alias local de salida JSON en los comandos que lo ofrecen. |

Los comandos que aceptan cargas del usuario comparten un contrato de entrada:

| Opción | Significado |
| --- | --- |
| `--input`, `-i` | Documento de entrada en línea. |
| `--input-file` | Leer un archivo, o `-` para stdin. Excluyente con `--input`. |
| `--input-encoding=json\|raw\|base64` | Decodificar JSON, pasar texto sin procesar como un argumento o decodificar base64 como un argumento. Predeterminado: `json`. |

La entrada JSON de inicios de workflow, señales, consultas, actualizaciones, programaciones y finalizaciones de actividad representa el array de argumentos posicionales v2. Raw y base64 se convierten en un argumento posicional para que el servidor siga recibiendo el array canónico `input`.

## Conexión y diagnóstico {#connection-and-diagnostics}

| Comando | Finalidad | Opciones importantes |
| --- | --- | --- |
| `dw --version` | Imprimir la identidad de compilación de CLI. Si `DW_ENV` o `DURABLE_WORKFLOW_SERVER_URL` selecciona un destino, también realiza una comprobación breve de compatibilidad. | `-V`, `--version` |
| `dw server:health` | Comprobar salud del servidor y acceso autenticado. | opciones globales, `--json` |
| `dw server:info` | Mostrar versión, manifiesto de topología, manifiestos de protocolo, contrato de solicitudes, protocolo de workers, datos de flota y metadatos de compatibilidad. | opciones globales, `--json` |
| `dw doctor` | Explicar perfil/servidor/token/TLS resueltos, advertencias remotas de compatibilidad y siguientes pasos. | opciones globales, `--json` |
| `dw debug workflow <workflow-id>` | Capturar diagnósticos de una ejecución atascada: estado, tareas pendientes, cola, fallos y compatibilidad. | `--run-id`, opciones globales, `--json` |
| `dw server:start-dev` | Servir la aplicación HTTP de un proyecto Laravel existente y configurado. Requiere PHP externo. | `--port`, `--host` (predeterminado `127.0.0.1`), `--db=sqlite\|mysql\|pgsql` |
| `dw watch workflow <workflow-id>` | Sondear hasta estado terminal o un límite configurado de sondeos. | `--run-id`, `--interval`, `--max-polls`, opciones globales |
| `dw upgrade` | Reemplazar el binario independiente actual de `dw` por otra publicación posterior o fijada. Rechaza modificar Composer vendor, Homebrew cellar y PHAR. | `--tag`, `--dry-run`, `--force`, `--output=table\|json` |

Utiliza `server:info` para validar estructuras de contrato, `doctor` para explicar por qué la CLI no se conecta y `debug workflow` si soporte necesita una captura de ejecución legible por máquinas.

### Servidor HTTP de proyecto local {#local-project-http-server}

Ejecuta `dw server:start-dev` desde el directorio de un proyecto Laravel instalado que contenga `artisan`. La CLI nativa necesita un ejecutable PHP separado en `PATH`. Configura la base de datos y ejecuta migraciones primero. El valor de `--db` se pasa como `DB_CONNECTION`; borra la caché de configuración de Laravel al cambiar de controlador. Ejecuta workers de cola y planificador por separado si es necesario. Reinicia el comando tras editar `.env`. El controlador seleccionado se mantiene en las solicitudes HTTP mediante el modo `--no-reload` de Artisan.

El comando utiliza loopback por defecto. Usa explícitamente `--host=0.0.0.0` para todas las interfaces. Los modos MySQL y PostgreSQL requieren servicios Compose del proyecto llamados `mysql` o `pgsql`, respectivamente, y `redis`. Los fallos de dependencias o procesos HTTP devuelven un código distinto de cero. Los servicios Compose permanecen activos al terminar HTTP.

Los binarios nativos POSIX reenvían SIGINT y SIGTERM al hijo activo y esperan hasta cinco segundos a que termine su grupo de procesos. Las instalaciones desde código y PHAR requieren las extensiones PHP `pcntl` y `posix` para reenviar señales. Windows utiliza su interrupción de consola.

Para Durable Workflow Server independiente con imágenes publicadas, sigue el [inicio rápido del servicio](/docs/quickstart).

### Información del servidor y topología de roles {#server-info-and-role-topology}

`dw server:info` es la interfaz CLI de `GET /api/cluster/info`. En modo tabla incluye una sección `Topology:` que resume el contrato publicado para el nodo que responde:

- `Supported Shapes` y `Current Shape` identifican las formas válidas y la que atiende este nodo.
- `Current Process Class` y `Current Roles` identifican la clase de proceso y el conjunto de roles del nodo.
- `Matching Role`, `Matching Partitions` y `Matching Backpressure` muestran la forma del rol de asignación, responsable de avisos, modo de despacho y primitivas de particionado que determinan cómo se reclama trabajo listo.
- `Matching Discovery Limits` resume el contrato numérico fijo: `poll_batch_cap`, `availability_ceiling_seconds`, `wake_signal_ttl_seconds`, `workflow_task_lease_seconds` y `activity_task_lease_seconds`, para verificar el despliegue sin buscar en el código.
- `Current Write Boundaries` enumera las superficies de escritura duradera de los roles del nodo.
- `Scaling Boundaries` y `Failure Domains` indican el factor de carga o la primera señal de fallo esperados por rol.

Utiliza `--output=json` si los scripts necesitan el manifiesto original. `topology.schema` y `topology.version` fijan la revisión para detectar cambios de estructura; `topology.execution_mode` informa del modo de despacho del nodo. Los campos estables se sitúan bajo `topology`: `supported_shapes`, `current_shape`, `current_process_class`, `current_roles`, `matching_role`, `role_catalog`, `authority_boundaries`, `authority_surfaces`, `supported_topologies`, `scaling_boundaries` y `failure_domains`. `topology.matching_role` también publica `partition_primitives` y `backpressure_model` para comprobar los ejes usados al descubrir tareas listas sin analizar texto. `topology.matching_role.discovery_limits` expone el contrato numérico fijo (`poll_batch_cap`, `availability_ceiling_seconds`, `wake_signal_ttl_seconds`, `workflow_task_lease_seconds` y `activity_task_lease_seconds`) para fijar los valores del paquete Workflow sin extraerlos de una sección para personas.

```bash
dw server:info --output=json \
  | jq '.topology | {current_shape, current_process_class, current_roles, matching_role, scaling_boundaries, failure_domains}'
```

Para el significado de estos campos, consulta [Topología de roles de Server](/docs/polyglot/server-role-topology).

### Información del servidor y salud de coordinación {#server-info-and-coordination-health}

`dw server:info` también publica el dictamen de seguridad de despliegue de todos los espacios de nombres para consultar la salud de coordinación sin otra interfaz de salud. En tabla muestra `Coordination Health:` bajo `Topology:`. Con `--output=json`, los mismos datos están bajo `coordination_health`, con campos estables:

- `coordination_health.schema` y `coordination_health.version` fijan la revisión del contrato.
- `coordination_health.namespace_scope` indica si el dictamen cubre un espacio de nombres o toda la flota.
- `coordination_health.status` y `coordination_health.http_status` informan del dictamen general y del estado HTTP aplicado a la preparación.
- `coordination_health.generated_at` registra la hora de la instantánea.
- `coordination_health.categories` resume recuentos por categoría (como `correctness`, `safety` y `routing`).
- `coordination_health.warning_checks` y `coordination_health.error_checks` enumeran las comprobaciones que causaron advertencia o error para que los scripts decidan según la interfaz afectada.
- `coordination_health.checks[]` contiene detalles por comprobación, con `name`, `status`, `category` y `message` para explicar una degradación. El inventario fijo siempre incluye `worker_compatibility`, `task_transport`, `routing_health`, `durable_resume_paths`, comprobaciones de proyección/planificador y `activity_path`. Esta última es la contraparte de actividad de `task_transport`: muestra ejecuciones cuyos plazos de programación a inicio, inicio a cierre, programación a cierre o latido vencieron sin aplicarse y el trabajo acumulado sostenido de reintentos. Renombrar `activity_path` cambia el protocolo.

```bash
dw server:info --output=json \
  | jq '.coordination_health | {status, http_status, namespace_scope, warning_checks, error_checks}'
```

Para el contrato de preparación de estos campos, consulta la [referencia de la API del servidor](/docs/polyglot/server-api-reference).

### Actualización del propio binario {#self-upgrade}

`dw upgrade` descarga el artefacto de plataforma correspondiente desde la publicación GitHub de `durable-workflow/cli`, lo verifica con `SHA256SUMS` y reemplaza el binario solo si coincide el checksum. Utiliza `--tag` para fijar una etiqueta, `--dry-run` para resolver el destino e imprimir las URL de artefacto sin descargar y `--force` para descargar y reemplazar aunque coincidan las versiones actual y de destino.

El comando rechaza modificar instalaciones gestionadas por otra herramienta. La salida JSON utiliza `status` estable para decidir sin analizar texto:

| `status` | Significado |
| --- | --- |
| `upgraded` | Binario reemplazado por `target_version`. |
| `noop` | `current_version` ya coincide con `target_version`; `--force` evita esta omisión. |
| `dry-run` | `--dry-run` resolvió `target_version`, `asset_url` y `checksum_url` sin descargar. |
| `refused` | La instalación no es un binario independiente (Composer vendor, Homebrew cellar o PHAR), o no hay artefacto publicado para la plataforma. |
| `permission-denied` | No se puede escribir en el directorio de instalación; la carga incluye `hint` con el paso recomendado. |
| `error` | Fallo al obtener el catálogo, checksum no coincidente o error del sistema de archivos. |

En rechazos, `installation.kind` identifica la herramienta gestora (`composer-vendor`, `homebrew`, `phar` o `binary`) y `reason` indica el responsable correcto. Para automatización pública sin código fuente, reinstala una publicación fijada mediante `https://durable-workflow.com/install.sh`; para Homebrew por tap, utiliza `brew upgrade durable-workflow/tap/dw`.

## Perfiles de entorno {#environment-profiles}

Los perfiles están en `~/.config/dw/config.json`, o `$XDG_CONFIG_HOME/dw/config.json` si está definido. Fija `DW_CONFIG_HOME` para aislar un directorio de perfiles de pruebas o CI.

| Comando | Finalidad | Opciones importantes |
| --- | --- | --- |
| `dw env:set <name>` | Crear o actualizar un perfil con nombre. | `--server`, `--namespace`, `--token-env`, `--token`, `--tls-verify=true\|false`, `--profile-output=table\|json\|jsonl`, `--make-default`, `--json` |
| `dw env:list` | Listar perfiles con tokens literales censurados por defecto. | `--show-token`, `--json`, `--output=jsonl` |
| `dw env:show [name]` | Mostrar un perfil; por defecto, el actual. | `--show-token`, `--json` |
| `dw env:use <name>` | Seleccionar el perfil predeterminado. Los nombres desconocidos fallan. | `--json` |
| `dw env:delete <name>` | Eliminar un perfil. | `--json` |

Prefiere `--token-env=NAME` en producción para mantener secretos en el entorno del runtime y no en el archivo de perfil.

## Comandos de workflow {#workflow-commands}

| Comando | Finalidad | Opciones importantes |
| --- | --- | --- |
| `dw workflow:start` | Iniciar un workflow mediante el plano de control. | `--type`, `--workflow-id`, `--business-key`, `--task-queue`, `--duplicate-policy`, `--memo`, `--search-attr key=value`, `--execution-timeout`, `--run-timeout`, `--wait`, opciones de entrada, `--json` |
| `dw workflow:list` | Listar instancias de workflow. | `--type`, `--status`, `--query`, `--limit`, opciones globales de salida |
| `dw workflow:describe <workflow-id>` | Describir la ejecución actual o seleccionada. | `--run-id`, `--follow`, `--json` |
| `dw workflow:list-runs <workflow-id>` | Listar ejecuciones de una instancia. | `--json` |
| `dw workflow:show-run <workflow-id> <run-id>` | Mostrar una ejecución. | `--follow`, `--json` |
| `dw workflow:history <workflow-id> <run-id>` | Leer eventos del historial. | `--follow`, `--page-size`, `--json` |
| `dw workflow:history-export <workflow-id> <run-id>` | Exportar la carga de historial para archivo. | `--output-file`, opciones globales |
| `dw workflow:signal <workflow-id> <signal-name>` | Enviar una señal. | `--run-id`, opciones de entrada, `--json` |
| `dw workflow:query <workflow-id> <query-name>` | Ejecutar una consulta de solo lectura. | `--run-id`, opciones de entrada, `--json` |
| `dw workflow:update <workflow-id> <update-name>` | Enviar o ejecutar una actualización. | `--wait=accepted\|completed`, `--run-id`, opciones de entrada, `--json` |
| `dw workflow:cancel [workflow-id]` | Cerrar un workflow o lote seleccionado como cancelado; no ejecuta limpieza del código. | `--reason`, `--run-id`, `--all-matching`, `--type`, `--status`, `--limit`, `--yes`, `--json` |
| `dw workflow:terminate <workflow-id>` | Terminar un workflow por la fuerza. | `--reason`, `--run-id`, `--json` |
| `dw workflow:repair <workflow-id>` | Solicitar reparación de una ejecución atascada o reintentable. | `--json` |
| `dw workflow:archive <workflow-id>` | Archivar una ejecución cerrada. | `--reason`, `--json` |

Ejemplos:

```bash
dw workflow:start \
  --type=App\\Workflows\\ProcessOrder \
  --workflow-id=order-123 \
  --task-queue=payments \
  --input='["order-123"]' \
  --json

dw workflow:update order-123 approve --wait=completed --input='["manager"]'
dw workflow:cancel --all-matching='WorkflowType = "ImportJob"' --limit=25 --yes
```

`workflow:start`, `workflow:signal`, `workflow:query` y `workflow:update` validan campos canónicos contra el contrato publicado por el servidor. Los alias heredados no canónicos se rechazan antes de enviar la solicitud.

## Inspección de llamadas a servicios {#service-call-inspection}

Utiliza `dw service-call:describe <endpoint> <service> <operation> <call-id>` para inspeccionar una llamada Nexus duradera en el espacio del endpoint. Por ejemplo, `dw service-call:describe billing invoices create call-42 --namespace=shared --json` devuelve la respuesta completa de Server.

La respuesta conserva el llamante original y el destino vinculado, plazo, estado, resultado, registros de intentos, fallo tipado y referencias retenidas de cargas. Los resultados satisfactorios siguen siendo valores Avro sin pérdida `result_envelope`. Una llamada aceptada o iniciada sigue pendiente; no equivale a un resultado completado satisfactorio.

El comando realiza una única solicitud GET. No pide reintentos, cancelación ni descarga de objetos externos. Server puede conciliar la llamada con el resultado terminal del workflow vinculado al atender la lectura. Se aplican la autorización del espacio y todos los selectores de endpoint, servicio, operación y llamada.

## Comandos de adaptadores puente {#bridge-adapter-commands}

Los comandos puente son herramientas acotadas de entrada y traspaso de eventos de integración. Llaman a los adaptadores del servidor y devuelven la estructura `durable-workflow.v2.bridge-adapter-outcome.contract` en JSON. No ejecutan código de workflow ni gestionan sus transiciones.

| Comando | Finalidad | Opciones importantes |
| --- | --- | --- |
| `dw bridge:webhook <adapter>` | Enviar un evento webhook que inicia, señaliza o actualiza un workflow mediante el plano de control. | `--action=start_workflow\|signal_workflow\|update_workflow`, `--idempotency-key`, `--target`, opciones de entrada, `--correlation`, `--json` |

Ejemplos:

```bash
dw bridge:webhook stripe \
  --action=start_workflow \
  --idempotency-key=stripe-event-1001 \
  --target='{"workflow_type":"orders.fulfillment","task_queue":"external-workflows","business_key":"order-1001"}' \
  --input='{"order_id":"order-1001"}' \
  --json

dw bridge:webhook pagerduty \
  --action=signal_workflow \
  --idempotency-key=pd-event-3003 \
  --target='{"workflow_id":"wf-remediation-42","signal_name":"incident_escalated"}' \
  --input='{"severity":"critical"}'
```

Utiliza los campos de resultado del puente en lugar de inferir comportamiento solo del estado HTTP. `outcome`, `reason`, `control_plane_outcome`, `idempotency_key` y el resumen censurado `target` son el contrato de automatización para duplicados, fallos de enrutamiento, cargas malformadas y traspasos aceptados.

## Comandos de programaciones {#schedule-commands}

| Comando | Finalidad | Opciones importantes |
| --- | --- | --- |
| `dw schedule:create` | Crear una programación. | `--schedule-id`, `--workflow-type`, `--cron`, `--interval`, `--task-queue`, `--timezone`, `--execution-timeout`, `--run-timeout`, `--overlap-policy`, `--jitter`, `--max-runs`, `--paused`, `--note`, opciones de entrada, `--json` |
| `dw schedule:list` | Listar programaciones. | opciones globales de salida |
| `dw schedule:describe <schedule-id>` | Describir una programación. | `--json` |
| `dw schedule:update <schedule-id>` | Actualizar especificación o entrada de workflow. | opciones de creación, opciones de entrada, `--json` |
| `dw schedule:pause <schedule-id>` | Pausar una programación. | `--note`, `--json` |
| `dw schedule:resume <schedule-id>` | Reanudar una programación. | `--note`, `--json` |
| `dw schedule:trigger <schedule-id>` | Disparar inmediatamente una programación. | `--overlap-policy`, `--json` |
| `dw schedule:backfill <schedule-id>` | Ejecutar retroactivamente una ventana temporal. | `--start-time`, `--end-time`, `--overlap-policy`, `--json` |
| `dw schedule:delete <schedule-id>` | Eliminar una programación. | `--json` |

Utiliza `--cron` o `--interval` al crear programaciones basadas en intervalos. Utiliza `--paused` para registrar durante el despliegue sin iniciar trabajo todavía.

## Comandos de workers y colas {#worker-and-task-queue-commands}

| Comando | Finalidad | Opciones importantes |
| --- | --- | --- |
| `dw worker:register [worker-id]` | Registrar un worker con capacidad y compatibilidad. | `--task-queue`, `--runtime`, `--sdk-version`, `--build-id`, `--workflow-type`, `--activity-type`, `--max-workflow-tasks`, `--max-activity-tasks`, `--json` |
| `dw worker:list` | Listar workers. | `--task-queue`, `--status`, opciones globales de salida |
| `dw worker:describe <worker-id>` | Describir un worker. | `--json` |
| `dw worker:deregister <worker-id>` | Dar de baja un worker. | `--json` |
| `dw task-queue:list` | Listar colas activas y estado de admisión. | opciones globales de salida |
| `dw task-queue:describe <queue>` | Describir capacidad, leases, presupuestos de despacho y capacidad pendiente de consultas. | `--json` |
| `dw task-queue:build-ids <queue>` | Inspeccionar estado de cohortes por build id y despliegue de una cola. | `--json` |
| `dw task-queue:drain <queue>` | Marcar una cohorte como drenando para que deje de reclamar tareas nuevas. | `--build-id <value>`, `--unversioned`, `--json` |
| `dw task-queue:resume <queue>` | Borrar un drenaje anterior para volver a reclamar tareas. | `--build-id <value>`, `--unversioned`, `--json` |

Los comandos de cola son la vista operativa preferida para diagnosticar limitación, capacidad y ausencia de workers. Consulta [Admisión en colas de tareas](/docs/polyglot/task-queue-admission) para la política del servidor y [Despliegue de workers por build id](/docs/polyglot/worker-build-id-rollout) para transición de sin versión a versionado, canary, drenaje y reversión.

`dw task-queue:drain` y `dw task-queue:resume` requieren `--build-id <value>` para una cohorte concreta o `--unversioned` para workers registrados sin `build_id`. Combinarlos falla de inmediato por opción no válida. Ambos son idempotentes: repetir el drenaje no desplaza `drained_at` y reanudar una cohorte ya activa no cambia nada.

## Comandos del protocolo de workers {#worker-protocol-commands}

Son herramientas de protocolo de bajo nivel para diagnóstico, pruebas básicas y experimentos sin SDK. Los workers PHP y Python normales deben utilizar los bucles de sus SDK.

| Comando | Finalidad | Opciones importantes |
| --- | --- | --- |
| `dw workflow-task:poll <worker-id>` | Sondear una tarea de workflow. | `--task-queue`, `--build-id`, `--poll-request-id`, `--history-page-size`, `--accept-history-encoding`, `--json` |
| `dw workflow-task:history <task-id> <page-token>` | Obtener la siguiente página de historial de una tarea con lease. | `--lease-owner`, `--attempt`, `--json` |
| `dw workflow-task:complete <task-id> <attempt>` | Completar una tarea de workflow con cargas de comandos. | `--lease-owner`, `--complete-result`, `--command`, `--json` |
| `dw workflow-task:fail <task-id> <attempt>` | Informar de un fallo de ejecución de tarea para reintento o diagnóstico. Distinto de completar con `fail_workflow`. | `--lease-owner`, `--message`, `--type`, `--stack-trace`, `--json` |
| `dw query-task:poll <worker-id>` | Sondear y obtener lease de una consulta enrutada. | `--task-queue`, `--json` |
| `dw query-task:complete <query-task-id> <attempt>` | Completar una consulta con lease con resultado JSON y sobre coincidente. | `--lease-owner`, `--result`, `--json` |
| `dw query-task:fail <query-task-id> <attempt>` | Informar de fallo de consulta con lease y motivo legible por máquinas. | `--lease-owner`, `--message`, `--reason`, `--type`, `--stack-trace`, `--json` |
| `dw activity:complete <task-id> <attempt-id>` | Completar un intento de actividad con lease. | `--lease-owner`, opciones de entrada, `--json` |
| `dw activity:fail <task-id> <attempt-id>` | Fallar un intento de actividad con lease. | `--lease-owner`, `--message`, `--type`, `--non-retryable`, `--json` |

Utiliza `workflow-task:fail` para fallos del worker como divergencias de reproducción o errores de deserialización; se dirige a `POST /worker/workflow-tasks/{taskId}/fail`. Completar una tarea con un comando que falle el workflow es otra operación y utiliza `workflow-task:complete` con la carga correspondiente.

`query-task:poll`, `query-task:complete` y `query-task:fail` operan sobre consultas enrutadas en `/worker/query-tasks/…`. Los workers normales obtienen consultas mediante su manejador SDK; la CLI sirve para diagnóstico, paridad CLI/SDK y experimentos sin SDK. Los fallos usan por defecto `--reason=query_rejected`; utiliza un motivo estable como `unknown_query`, `decode_failure` o un identificador del runtime para distinguir rechazos esperados de errores de runtime.

### Páginas de historial de tareas de workflow {#workflow-task-history-pages}

`workflow-task:history` envuelve para diagnóstico el endpoint de páginas del plano de workers. Utilízalo solo tras recibir una tarea con lease y `next_history_page_token` desde `workflow-task:poll`; los workers normales deben dejar las páginas adicionales a su SDK.

<!-- docs-example id="cli.workflow-task-history.command" -->
```bash
dw workflow-task:history workflow-task-01 history-page-2 \
  --lease-owner=python-worker-1 \
  --attempt=2 \
  --json
```

La salida JSON es la respuesta del servidor sin renombrar campos:

<!-- docs-example id="cli.workflow-task-history.response" -->
```json
{
  "history_events": [
    {"event_id": 2, "event_type": "ActivityScheduled", "payload": {}}
  ],
  "total_history_events": 4,
  "next_history_page_token": "history-page-3"
}
```

La automatización debe leer `history_events`, `total_history_events` y `next_history_page_token`. El endpoint de historial de workers no utiliza los campos `events` ni `next_page_token` del historial de ejecuciones del plano de control.

## Comandos de espacios de nombres y atributos de búsqueda {#namespace-and-search-attribute-commands}

| Comando | Finalidad | Opciones importantes |
| --- | --- | --- |
| `dw namespace:list` | Listar espacios de nombres. | opciones globales de salida |
| `dw namespace:create <name>` | Crear un espacio. | `--description`, `--retention`, `--json` |
| `dw namespace:describe <name>` | Describir un espacio. | `--json` |
| `dw namespace:update <name>` | Actualizar sus metadatos. | `--description`, `--retention`, `--json` |
| `dw namespace:set-storage-driver <name> <driver>` | Configurar la política de almacenamiento externo para cargas codificadas que superen el umbral. | `--threshold-bytes`, `--uri`, `--disk`, `--bucket`, `--prefix`, `--region`, `--endpoint`, `--auth-profile`, `--disable`, `--json` |
| `dw storage:test` | Probar ida y vuelta de una carga pequeña en línea y otra grande externa mediante la política seleccionada o un controlador alternativo. | `--driver=local\|s3\|gcs\|azure`, `--small-bytes`, `--large-bytes`, opciones globales, `--json` |
| `dw search-attribute:list` | Listar atributos de búsqueda. | opciones globales de salida |
| `dw search-attribute:create <name> <type>` | Registrar un atributo de búsqueda. | `--json` |
| `dw search-attribute:delete <name>` | Eliminar un atributo de búsqueda. | `--json` |

Los tipos de atributos son valores compatibles con el servidor como `keyword`, `text`, `int`, `double`, `bool`, `datetime` y `keyword_list`.

Los comandos de almacenamiento externo llaman a la API de almacenamiento del espacio de nombres. El controlador es `local`, `s3`, `gcs` o `azure`; los de objetos utilizan la configuración del sistema de archivos del servidor, por lo que las opciones CLI describen la política y no transportan credenciales del proveedor. Utiliza `--disk` para vincular `s3`, `gcs` o `azure` a un disco con nombre del servidor que contenga las credenciales reales. Usa `--disable` para conservar la política sin permitir nuevas descargas al almacenamiento externo.

Ejemplos:

```bash
dw namespace:set-storage-driver billing s3 \
  --disk=external-payload-objects \
  --bucket=dw-payloads \
  --prefix=billing/ \
  --threshold-bytes=2097152 \
  --json

dw namespace:set-storage-driver dev local \
  --uri=file:///var/lib/durable-workflow/payloads

dw storage:test --namespace=billing --large-bytes=2097152 --json
dw storage:test --driver=s3 --small-bytes=128 --large-bytes=3145728 --json
```

En JSON, `namespace:set-storage-driver` devuelve la carga del espacio con su política `external_payload_storage`. `storage:test` devuelve estado diagnóstico y objetos `small_payload` y `large_payload`; la automatización debe decidir según esos campos, no según la tabla.

Este diagnóstico es también la comprobación más rápida del contrato de sobres de referencia. Un resultado satisfactorio de carga grande demuestra que la política puede escribir bytes codificados, devolver una referencia `durable-workflow.v2.external-payload-reference.v1`, leer el objeto y verificar `size_bytes` y `sha256`. Trata un fallo como problema de política de almacenamiento antes de permitir que los workflows externalicen cargas en ese espacio.

## Comandos del sistema {#system-commands}

Exponen pasadas de mantenimiento como operaciones explícitas automatizables.

| Comando | Finalidad | Opciones importantes |
| --- | --- | --- |
| `dw system:repair-status` | Mostrar estado/trabajo pendiente de reparación. | `--json` |
| `dw system:repair-pass` | Ejecutar una pasada de reparación. | `--run-id`, `--limit`, `--json` |
| `dw system:activity-timeout-status` | Mostrar estado/trabajo pendiente de vencimientos de actividad. | `--json` |
| `dw system:activity-timeout-pass` | Ejecutar una pasada de vencimientos de actividad. | `--task-id`, `--limit`, `--json` |
| `dw system:retention-status` | Mostrar estado/trabajo pendiente de retención. | `--json` |
| `dw system:retention-pass` | Ejecutar una pasada de limpieza por retención. | `--run-id`, `--limit`, `--json` |

En procedimientos, consulta el estado antes de ejecutar pasadas para ver el alcance pendiente antes de modificar el servidor.

## Comandos de esquemas {#schema-commands}

| Comando | Finalidad | Opciones importantes |
| --- | --- | --- |
| `dw schema:list` | Listar esquemas publicados legibles por máquinas. | sin conexión al servidor |
| `dw schema:show <command-name>` | Mostrar el JSON Schema incluido para la salida de un comando. | `--output=json\|jsonl`; sin conexión al servidor |
| `dw schema:manifest` | Mostrar el manifiesto de esquemas. | sin conexión al servidor |

Son útiles si un cliente IA o trabajo CI necesita el contrato actual del plano de control, respuesta o salida sin extraer texto de documentación. El [manifiesto v4 actual](https://durable-workflow.github.io/cli-json-envelopes/v4/manifest.json) vincula todos los sobres JSON y esquemas JSONL por registro mediante resolutor público y resumen criptográfico. Los campos de cargas de inicio/ejecución y consulta/actualización solo aceptan `avro`. Los [manifiestos v3](https://durable-workflow.github.io/cli-json-envelopes/v3/manifest.json) y [v2](https://durable-workflow.github.io/cli-json-envelopes/v2/manifest.json) conservan sus bytes originales para consumidores fijados a esas revisiones.

## Contrato de salida y códigos de salida {#output-and-exit-contract}

Utiliza `--output=json` para un objeto y `--output=jsonl` si un listado alimenta un procesador de flujos. Las tablas para personas pueden mejorar con el tiempo; los nombres de campos JSON son el contrato de automatización.

Todos los comandos utilizan la política estable documentada en la [guía de CLI](/docs/polyglot/cli#exit-codes):

| Código | Significado |
| --- | --- |
| `0` | Éxito. |
| `1` | El comando se ejecutó pero falló genéricamente. |
| `2` | Uso local o validación no válidos. |
| `3` | Fallo de red o transporte. |
| `4` | Fallo de autenticación o autorización. |
| `5` | Recurso no encontrado. |
| `6` | Fallo `5xx` del servidor. |
| `7` | Tiempo de espera agotado. |

Para paquetes de soporte, recopila `dw doctor --output=json`, `dw server:info --output=json` y `dw debug workflow <workflow-id> --output=json`.

## Guías relacionadas {#related-guides}

- [CLI](./cli.mdx) cubre instalación, perfiles y códigos de salida.
- [Servidor](./server.md) documenta el plano de control HTTP que llaman los comandos.
- [Capacidades de clientes y workers](./cli-python-parity.md) compara las interfaces de cliente y worker de CLI, PHP, Python y Rust.
