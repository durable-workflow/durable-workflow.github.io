---
sidebar_position: 13
title: Referencia de la API de operadores de Waterline
description: Contratos tipados de la API de Waterline para listas, detalle de ejecución seleccionada, exportación del historial, programaciones, vistas guardadas, preferencias y acciones de operador.
tags:
  - Waterline
  - observability
  - API
  - reference
keywords:
  - referencia de la API de Waterline
  - detalle de ejecución seleccionada
  - exportación del historial
  - contrato de acciones disponibles
  - acciones de operador de workflows
---

# Referencia de la API de operadores de Waterline {#waterline-operator-api-reference}

Waterline es la interfaz de operador del estado duradero para Laravel integrado
y servidores independientes. Su interfaz gráfica usa la misma API HTTP+JSON
documentada aquí, para que scripts, paneles y agentes lean datos duraderos de
workflows sin extraerlos del HTML.

Usa esta referencia cuando necesites evidencia tipada: detalle de ejecución
seleccionada, exportación del historial, acciones y comandos disponibles, vistas
guardadas, preferencias y visibilidad de programaciones. Consulta
[Supervisión](./monitoring.md) para distinguir el estado duradero de Waterline de
la telemetría del worker y del entorno de ejecución.

## Instalación {#installation}

Instala Waterline en la misma aplicación Laravel integrada que contiene el
paquete Workflow:

```bash
composer require \
  %%artifact.waterlineComposerPackage%% \
  %%artifact.workflowComposerPackage%%
php artisan waterline:install
```

Las versiones fijadas generadas seleccionan publicaciones estables 2.x de
Waterline y Workflow. El modo integrado lee el estado de la aplicación
directamente y no necesita un SDK de servicio. Después de actualizar Waterline,
publica los recursos actuales:

```bash
composer update durable-workflow/waterline
php artisan waterline:publish
```

Para observar el modo servicio desde un anfitrión Laravel, instala también el SDK PHP:

```bash
composer require %%artifact.phpSdkComposerPackage%%
```

La imagen autónoma del servicio Waterline ya incluye ese SDK. Sus parámetros de
conexión, autenticación y persistencia se describen en
[Supervisión](./monitoring.md#waterline-service).

### Idioma de la interfaz {#interface-language}

Waterline admite inglés, portugués brasileño, chino simplificado, francés,
alemán, japonés, español y ucraniano en los modos integrado y servicio. Configura
el idioma en el entorno de la aplicación Laravel o del contenedor de servicio:

```dotenv
WATERLINE_LOCALE=es
```

| Idioma | Valor |
| --- | --- |
| Inglés | `en` |
| Portugués brasileño | `pt-BR` |
| Chino simplificado | `zh-Hans` |
| Francés | `fr` |
| Alemán | `de` |
| Japonés | `ja` |
| Español | `es` |
| Ucraniano | `uk` |

Los alias regionales `es-ES`, `es-MX` y `es-419` seleccionan la interfaz española
compartida. `pt`, `pt_br` y las variantes de mayúsculas seleccionan portugués
brasileño (`pt-BR`). Otras regiones portuguesas usan inglés. Recuentos, etiquetas
de gráficos y duraciones relativas siguen el idioma seleccionado.
Usa `zh-Hans` para chino simplificado. `zh`, `zh-CN`, `zh-SG` y etiquetas
explícitas de escritura simplificada como `zh-Hans-CN` seleccionan la misma
interfaz. Se aceptan guiones bajos y variantes de mayúsculas. Las etiquetas de
chino tradicional como `zh-Hant`, `zh-TW` y `zh-HK` usan inglés.
Usa `ja` para japonés. Los alias regionales como `ja-JP`, guiones bajos y
variantes de mayúsculas seleccionan la misma interfaz japonesa.
Usa `fr` para francés. Alias como `fr-FR` y `fr-CA`, guiones bajos y variantes
de mayúsculas seleccionan la interfaz francesa compartida.
Usa `de` para alemán. Alias como `de-DE`, `de-AT` y `de-CH`, guiones bajos y
variantes de mayúsculas seleccionan la interfaz alemana compartida.

El inglés es el idioma predeterminado y de reserva. Las aplicaciones integradas
también pueden establecer `waterline.locale` en su configuración resuelta.
Regenera la configuración en caché de Laravel tras cambiarlo. Waterline conserva
el idioma de la aplicación anfitriona, los nombres de workflows, identificadores,
cargas y texto original de excepciones. Los nombres de campos JSON y estados
para máquinas mantienen sus valores existentes.

## Límite del despliegue {#deployment-boundary}

Waterline tiene dos adaptadores de backend:

- El modo integrado se ejecuta dentro del anfitrión Laravel y lee el estado
  duradero del paquete Workflow dentro del proceso.
- El modo servicio ejecuta la imagen publicada y lee un namespace del servidor
  independiente mediante `durable-workflow/sdk` y la API pública del servidor.

Ambos exponen las rutas documentadas aquí. El modo servicio las traduce a los
contratos correspondientes del servidor:

| Familia de rutas de Waterline | Contrato del servidor independiente usado en modo servicio |
| --- | --- |
| `GET /waterline/api/v2/health` | Salud del servidor, registro de workers y visibilidad de colas. |
| `GET /waterline/api/stats` | Panel de operador e instantánea de métricas del namespace. |
| Listas, detalle de ejecución seleccionada y exportación del historial | Lista, detalle, ejecuciones, historial y diagnósticos de la [referencia de la API de Server](./polyglot/server-api-reference.md). |
| Acciones de señal, actualización, consulta, cancelación, terminación, reparación y archivado | Contratos correspondientes de comandos y reparación de workflows del servidor. |
| Rutas bajo `/waterline/api/v2/schedules` | Contratos de lista, detalle, historial y mutación de programaciones del servidor. |

La API, CLI y SDK del servidor siguen disponibles directamente al desplegar
Waterline. No presupongas visibilidad entre modos o namespaces: las ejecuciones
se leen y operan desde su entorno y namespace propietarios.
[Modos de despliegue](./polyglot/deployment-modes.md) define este límite compartido.

## Ruta base y ámbito {#base-path-and-scope}

Waterline se monta bajo la ruta base configurada en Laravel. Los ejemplos usan
`/waterline`. Si tu aplicación usa otro prefijo, conserva los sufijos `/api/...`.

Con `WATERLINE_NAMESPACE`, todas las rutas de listas, detalle, programaciones y
acciones están limitadas al namespace. Las lecturas y comandos entre namespaces
responden como recurso no encontrado para no revelar estado de otro namespace.

```bash
curl -sS "$APP_URL/waterline/api/instances/order-1001" \
  -H "Accept: application/json" | jq '.status, .run_id, .actionability'
```

## Autenticación {#authentication}

Todos los controladores de interfaz y API JSON pasan por el control de acceso de
Waterline. En modo integrado, el anfitrión Laravel lo define y decide qué guards,
middleware, gates, políticas, sesiones SSO/OIDC/SAML, grupos de directorio,
tokens de servicio y límites de frecuencia se aplican.

El grupo actual de API JSON excluye el middleware CSRF de Laravel para que el
anfitrión aplique de forma uniforme un límite de sesión o token a lecturas y
comandos. El anfitrión sigue siendo responsable de autenticar esas peticiones y
documentar las protecciones CSRF de sesiones de navegador que añada a la API.

La imagen autónoma no tiene usuarios de una aplicación anfitriona. Colócala tras
un proxy inverso que autentique o en una interfaz privada antes de establecer
`WATERLINE_ALLOW_UNAUTHENTICATED=true`, que delega el control de entrada al
despliegue circundante. Por separado, `WATERLINE_SERVER_TOKEN` autentica las
llamadas del SDK PHP al servidor. Nunca expongas esa credencial al navegador.

`WATERLINE_ACCESS_MODE=read_only` bloquea localmente las rutas de mutación.
`operator` las habilita, pero el servidor aplica igualmente el rol del token y
la autorización de namespace. Consulta [Supervisión](./monitoring.md#waterline-service)
para el ejemplo y los dos límites de autenticación.

## Panel y salud {#dashboard-and-health}

| Método | Ruta | Función |
| --- | --- | --- |
| `GET` | `/waterline/api/stats` | Totales del panel, contadores de trabajo pendiente, política de reparación, métricas de operador y tendencias de flota. |
| `GET` | `/waterline/api/v2/health` | Salud del paquete/entorno de Waterline y disponibilidad del origen de datos v2. |

`/waterline/api/stats` resume el panel. Trata `operator_metrics` como diagnósticos
JSON de Waterline, no como una interfaz de recogida Prometheus. Para latencia de
ejecución y telemetría personalizada, usa métricas de los SDK de workers.

El [ámbito operativo del operador](./operator-operating-envelope.md) define cómo
interpretar estos diagnósticos en despliegues e incidentes. En concreto:

| Familia de campos | Significado |
| --- | --- |
| `operator_metrics.backlog.*` | Recuentos duraderos de trabajo ejecutable, diferido, con lease, no saludable, pendiente de reparación, con reclamación fallida y bloqueado por compatibilidad, más los flujos de cola de flota `tasks_added_last_minute` y `tasks_dispatched_last_minute`. |
| `operator_metrics.matching_role.*` | Contrato local del nodo de asignación/despacho que responde: `queue_wake_enabled`, `shape` del despliegue, `task_dispatch_mode`, `partition_primitives` congeladas y `backpressure_model` actual. |
| `operator_metrics.repair.*` | Alcance de las pasadas del bucle de reparación, incluidos candidatos seleccionados, antigüedad y presión de exploración. |
| `operator_metrics.projections.*` | Recuentos de desviaciones de proyecciones de resúmenes, esperas, cronologías, temporizadores y relaciones. |
| `operator_metrics.command_contracts.*` | Instantáneas antiguas del contrato WorkflowStarted aún pendientes de rellenado. |
| `operator_metrics.history.*` | Presión de tamaño de historial y número de eventos, y recomendaciones continue-as-new. |
| `queue_visibility.available`, `queue_visibility.reason` | Si hay visibilidad de colas del namespace en la aplicación anfitriona, y el motivo si no la hay. |
| `queue_visibility.task_queues[].stats.*` | Trabajo pendiente y antigüedad de la cola, número de sondeadores, tareas de workflow/actividad listas frente a tareas con lease, y flujos `tasks_added_last_minute` / `tasks_dispatched_last_minute` por cola. |
| `queue_visibility.task_queues[].repair.*` | Presión de reparación por cola: candidatos, fallos de despacho, leases vencidos, despachos atrasados y antigüedad máxima de cada condición. |
| `coordination_alerts[]` | Advertencias y errores agregados de salud y riesgos de colas: trabajo pendiente sin sondeadores, sondeadores obsoletos o candidatos de reparación antiguos. |
| `checks[]`, `categories.*` | Comprobaciones v2 bloqueantes e informativas, con `category = correctness \| acceleration` por comprobación y los agregados por categoría que usa Waterline para workers. |
| `engine_source`, `readiness_contract` | Si Waterline usa activamente el puente de operador v2 y qué contrato de disponibilidad rige ese estado. |

Los campos de flujo responden a si la entrada duradera llega más rápido de lo
que se despacha. `tasks_added_last_minute` cuenta filas distintas de tareas
duraderas creadas en los últimos 60 segundos. `tasks_dispatched_last_minute`
cuenta filas distintas cuyo último despacho correcto ocurrió en ese intervalo.

Usa los totales junto con las rutas de visibilidad de colas del servidor.
Waterline indica si la entrada supera el despacho, mientras `/api/task-queues`
y `/api/task-queues/{taskQueue}` indican si la cola está `saturated`, limitada
deliberadamente como `throttled`, en `no_active_workers` o si faltan sondeadores
sanos o plazas disponibles por otra causa.

`GET /waterline/api/v2/health` expone esa evidencia por cola desde Waterline.
Scripts y paneles que necesiten el estado actual de un namespace deben leer
`queue_visibility.task_queues[]` para estadísticas por cola y
`coordination_alerts[]` para el resumen de condiciones que requieren atención.

Los campos `matching_role` indican qué topología de asignación sirve este nodo.
`shape` distingue `in_worker` de `dedicated`; `partition_primitives` fija los ejes
`connection`/`queue`/`compatibility`/`namespace`, y `backpressure_model` indica
actualmente `lease_ownership`. Este bloque es local al proceso. En despliegues de
topología mixta, compáralo entre nodos antes de atribuir diferencias de trabajo
pendiente o sondeo a problemas de workers.

`GET /waterline/api/v2/health` usa la misma distinción: `error` bloquea, `warning`
informa y `ok` indica que el puente de operador v2 actual está disponible.

## Vistas de lista {#list-views}

Las listas se agrupan por estado duradero:

| Método | Ruta | Grupo |
| --- | --- | --- |
| `GET` | `/waterline/api/flows/running` | Ejecuciones abiertas o bloqueadas activamente. |
| `GET` | `/waterline/api/flows/completed` | Ejecuciones cerradas correctamente, incluidas las continuadas con `closed_reason = continued`. |
| `GET` | `/waterline/api/flows/failed` | Ejecuciones fallidas. |
| `GET` | `/waterline/api/flows/cancelled` | Ejecuciones canceladas. |
| `GET` | `/waterline/api/flows/terminated` | Ejecuciones terminadas forzosamente. |

Las filas son resúmenes compactos. Los campos estables incluyen identidad
(`id`, `instance_id`, `run_id`, `workflow_type`), estado (`status`, `closed_reason`,
`archived_at`), tiempos, `history_event_count`, `history_size_bytes`,
`continue_as_new_recommended` e indicadores de reparación como `repair_blocked`.

## Detalle de ejecución seleccionada {#selected-run-detail}

Waterline tiene dos modos de direccionamiento:

| Método | Ruta | Función |
| --- | --- | --- |
| `GET` | `/waterline/api/instances/{instanceId}` | Ejecución actual seleccionada de una instancia. |
| `GET` | `/waterline/api/instances/{instanceId}/runs/{runId}` | Ejecución seleccionada explícitamente. |
| `GET` | `/waterline/api/flows/{id}` | Consulta heredada/de detalle por fila de Waterline o identificador de ejecución. |

El detalle seleccionado es el contrato JSON de referencia para las pantallas de
operador. Contiene estado duradero y diagnósticos derivados para:

| Familia de campos | Significado |
| --- | --- |
| `activities`, `timers`, `waits`, `children` | Estado actual e histórico de esperas, reconstruido prioritariamente desde historial tipado. |
| `signals`, `updates`, `declared_signals`, `declared_updates`, `declared_queries` | Filas del ciclo de vida de comandos y objetivos cargables del contrato de workflow. |
| `timeline` | Eventos duraderos y entradas diagnósticas ordenados. |
| `exceptions`, `logs` | Datos de fallos y contexto de reproducción/depuración. |
| `can_signal`, `can_update`, `can_query`, `can_cancel`, `can_terminate`, `can_archive` | Acciones disponibles para interfaz y automatización en la ejecución seleccionada. |
| `actionability` | Contrato versionado de reparación y evidencia descrito abajo. |

La automatización debe preferir el detalle a las capturas. Una captura muestra
lo que vio el operador. El detalle explica por qué un workflow admite o no
reparación, consulta, cancelación, archivado o reproducción.

## Exportación del historial {#history-export}

Las exportaciones son paquetes de reproducción/depuración. Incluyen
deliberadamente las cargas almacenadas de workflow, comandos, actividades,
actualizaciones, tareas, fallos e historial para reproducir o archivar la ejecución.

| Método | Ruta | Función |
| --- | --- | --- |
| `GET` | `/waterline/api/instances/{instanceId}/history-export` | Exporta la ejecución actual seleccionada de una instancia. |
| `GET` | `/waterline/api/instances/{instanceId}/runs/{runId}/history-export` | Exporta una ejecución explícita. |
| `GET` | `/waterline/api/flows/{id}/history-export` | Exportación heredada/de detalle por fila de Waterline o identificador de ejecución. |

Si una exportación puede salir de un entorno protegido, configura primero el
filtro de datos sensibles de la exportación del historial. Las herramientas
posteriores deben preservar `redaction` para identificar la política aplicada.

## Contrato de acciones disponibles {#actionability-contract}

Waterline anota filas de listas, detalle seleccionado, cronología y exportaciones
con el contrato versionado de acciones disponibles:

```json
{
  "actionability_contract": {
    "schema": "waterline.actionability",
    "version": 1
  }
}
```

El identificador es `actionability_contract.schema = waterline.actionability`
con `actionability_contract.version = 1`.

`actionability` de la ejecución indica si la ejecución seleccionada es reparable:

| Campo | Significado |
| --- | --- |
| `repair_state` | Uno de `repairable`, `blocked`, `not_needed` o `unknown`. |
| `repairable` | Abreviatura booleana de `repair_state = repairable`. |
| `blocked_reason` | Código estable de motivo cuando `repair_state = blocked`. |
| `status_bucket` | Grupo de Waterline que determinó la decisión. |
| `closed_reason` | Motivo duradero de cierre si está cerrada. |
| `task_problem` | Si Waterline detectó un problema de tarea en la ejecución. |
| `diagnostic_only_evidence` | Verdadero si alguna fila informa pero no es fuente de reanudación. |

Las filas bajo `activities`, `waits`, `timers`, `exceptions`, `logs` y las entradas
de cronología/exportación pueden incluir su propio bloque `actionability`:

| Campo | Significado |
| --- | --- |
| `state` | `actionable` si la fila es una fuente válida de reparación; si no, `diagnostic_only`. |
| `repair_source` | Verdadero solo para filas respaldadas por una fuente autorizada reparable. |
| `diagnostic_only` | Verdadero si la fila no debe usarse para reanudar. |
| `history_authority` | Autoridad de origen, como `typed_history`, `mutable_open_fallback`, `failure_row_fallback` o `unsupported_terminal_without_history`. |
| `history_unsupported_reason` | Código estable de motivo para historial alternativo no admitido. |

Agentes y scripts deben decidir sobre reparación/reanudación según
`actionability.repair_state`, `actionability.repairable` y el
`actionability.repair_source` de cada fila. Una fila con `diagnostic_only = true`
aporta evidencia, no permiso para reproducir ni reanudar.

## Acciones de operador {#operator-actions}

Las acciones son comandos duraderos emitidos mediante el contrato de ejecución
seleccionada. Las rutas de instancia apuntan a la ejecución actual. Las rutas
de ejecución rechazan explícitamente objetivos obsoletos o incorrectos.

| Método | Ruta | Función |
| --- | --- | --- |
| `POST` | `/waterline/api/instances/{instanceId}/queries/{query}` | Ejecuta una consulta declarada sobre la ejecución actual. |
| `POST` | `/waterline/api/instances/{instanceId}/signals/{signal}` | Envía una señal a la ejecución actual. |
| `POST` | `/waterline/api/instances/{instanceId}/updates/{update}` | Envía una actualización a la ejecución actual. |
| `POST` | `/waterline/api/instances/{instanceId}/repair` | Despacha una pasada de reparación para la ejecución actual si lo permite el contrato de acciones. |
| `POST` | `/waterline/api/instances/{instanceId}/cancel` | Solicita cancelar la ejecución actual. |
| `POST` | `/waterline/api/instances/{instanceId}/terminate` | Termina la ejecución actual. |
| `POST` | `/waterline/api/instances/{instanceId}/archive` | Archiva la ejecución cerrada seleccionada. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/queries/{query}` | Ejecuta una consulta sobre una ejecución seleccionada explícitamente. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/signals/{signal}` | Envía una señal solo si la ejecución seleccionada es la actual. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/updates/{update}` | Envía una actualización solo si la ejecución seleccionada es la actual. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/repair` | Repara una ejecución seleccionada explícitamente. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/cancel` | Cancela solo si la ejecución seleccionada es la actual. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/terminate` | Termina solo si la ejecución seleccionada es la actual. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/archive` | Archiva la ejecución cerrada seleccionada. |

Señales, actualizaciones y consultas aceptan `arguments` JSON. Los argumentos
inválidos devuelven errores por campo. Los bloqueos de reproducción devuelven
`409 Conflict` con un motivo estable, como `workflow_definition_unavailable`,
sin intentar ejecutar con garantías reducidas.

## Inspección de actualizaciones {#update-inspection}

| Método | Ruta | Función |
| --- | --- | --- |
| `GET` | `/waterline/api/instances/{instanceId}/updates/{updateId}` | Inspecciona una fila del ciclo de vida de actualización de la ejecución actual. |
| `GET` | `/waterline/api/instances/{instanceId}/runs/{runId}/updates/{updateId}` | Inspecciona esa fila para una ejecución explícita. |
| `GET` | `/waterline/api/flows/{id}/updates/{updateId}` | Consulta heredada/de detalle de actualización. |

Usa la inspección para explicar si una actualización fue aceptada, aplicada,
completada, rechazada, agotó su espera o está bloqueada por compatibilidad de reproducción.

## Programaciones {#schedules}

Las rutas de programaciones ofrecen visibilidad y acciones de operador v2:

| Método | Ruta | Función |
| --- | --- | --- |
| `GET` | `/waterline/api/v2/schedules` | Enumera programaciones visibles en el ámbito actual. |
| `GET` | `/waterline/api/v2/schedules/{scheduleId}` | Describe una programación. |
| `GET` | `/waterline/api/v2/schedules/{scheduleId}/history` | Lee los eventos de auditoría del ciclo de vida de la programación. |
| `POST` | `/waterline/api/v2/schedules/{scheduleId}/pause` | Pausa futuras activaciones. |
| `POST` | `/waterline/api/v2/schedules/{scheduleId}/resume` | Reanuda una programación pausada. |
| `POST` | `/waterline/api/v2/schedules/{scheduleId}/trigger` | Provoca una activación inmediata. |
| `POST` | `/waterline/api/v2/schedules/{scheduleId}/backfill` | Recupera activaciones de un intervalo. |
| `DELETE` | `/waterline/api/v2/schedules/{scheduleId}` | Elimina una programación. |

Una programación se identifica por su namespace y su `schedule_id`. El mismo
`schedule_id` puede existir en más de un namespace. Cada ruta de una
programación concreta acepta `namespace` opcional como parámetro de consulta o
en el cuerpo de la petición:

- Un Waterline limitado a un namespace solo actúa sobre su propio namespace.
  Esto incluye Waterline integrado con `WATERLINE_NAMESPACE` configurado y todo
  despliegue en modo servicio. Una petición para otro namespace devuelve `404`.
- Un Waterline integrado para todo el clúster actúa sobre el namespace
  solicitado. Sin `namespace`, un `schedule_id` que existe en más de un
  namespace devuelve `409` con el motivo `schedule_namespace_required`. No se
  modifica nada.

```bash
curl -sS -X POST \
  "$APP_URL/waterline/api/v2/schedules/nightly-invoice-sync/pause?namespace=billing" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"note": "Supplier maintenance"}' | jq '.status, .note'
```

### Filas de programaciones {#schedule-rows}

La respuesta de la lista está paginada con `data`, `current_page`, `last_page`,
`per_page`, `total` y `operator_scope`. Cada fila de `data` tiene los mismos
campos en los modos integrado y servicio:

| Campo | Significado |
| --- | --- |
| `schedule_id` | ID de la programación. Envíalo con `namespace` a cada ruta de una programación concreta. |
| `id` | El mismo valor que `schedule_id`, conservado para clientes antiguos. |
| `namespace` | Namespace de la programación. |
| `workflow_type`, `workflow_class` | El workflow que inicia la programación. Cualquiera de los dos puede ser `null`. |
| `status`, `paused` | `active`, `paused` o `deleted`, y si la programación está pausada. |
| `note` | La nota del operador, o `null`. |
| `spec` | La cadencia: `cron_expressions` (cadenas cron), `intervals` (objetos con duraciones ISO 8601 `every` y `offset` opcional) y `timezone`. |
| `overlap_policy` | `skip`, `buffer_one`, `buffer_all`, `cancel_other`, `terminate_other` o `allow_all`. |
| `next_fire_at`, `last_fired_at` | Marcas de tiempo ISO 8601, o `null`. |
| `last_outcome` | El resultado de la activación registrada más reciente, o `null` si no se registró ninguno. Contiene `outcome` (por ejemplo `scheduled`, `drained`, `backfilled`, `skipped` o `failed`), `at`, `reason`, `workflow_id` y `run_id`. |
| `fires_count`, `failures_count`, `skipped_trigger_count`, `remaining_actions` | Contadores, o `null` si el backend no informa ese contador. |
| `search_attributes` | Los atributos de búsqueda de la programación, o `null`. |
| `created_at`, `updated_at` | Marcas de tiempo ISO 8601. |

Una fila con `last_fired_at` y sin `last_outcome` indica que el backend informó
la hora de activación sin su resultado.

Las filas de la lista y las respuestas de detalle, `pause` y `resume` también
incluyen `action`, `max_runs`, `jitter_seconds`, `paused_at`,
`last_skip_reason`, `last_skipped_at`, `latest_workflow_instance_id`,
`buffered_actions`, `memo` y `recent_actions`. Cada acción reciente tiene
`outcome`, `fired_at`, `reason`, `workflow_id`, `run_id` y `occurrence_time`.
`latest_instance_id` repite `latest_workflow_instance_id` para clientes
antiguos. Un `spec` conserva, después de sus campos de cadencia, cualquier otra
clave que el backend haya guardado.

### Resultados de activación y recuperación {#trigger-and-backfill-results}

`trigger` acepta un `overlap_policy` opcional. Devuelve `schedule_id`,
`namespace`, `outcome` (`triggered`, `buffered`, `buffer_full` o `skipped`),
`triggered`, `workflow_id`, `run_id` y `reason`. `triggered` es `true` solo
cuando se inició un workflow. `instance_id` repite `workflow_id` para clientes
antiguos.

`backfill` requiere las marcas de tiempo ISO 8601 `from` y `to` y acepta un
`overlap_policy` opcional. Devuelve `schedule_id`, `namespace`,
`fires_attempted`, `started_count`, `skipped_count`, `failed_count` y `results`.
Cada resultado tiene `fire_time`, `workflow_id`, `outcome` (`started`, `skipped`
o `failed`) y `reason`. Para clientes antiguos, cada resultado también repite
`schedule_id`, y `cron_time`, `instance_id` y `error` repiten `fire_time`,
`workflow_id` y el `reason` de un resultado fallido. `backfill` rechaza con
`422` y el motivo `invalid_time_range` un intervalo cuyo fin no es posterior a
su inicio.

Ambas rutas rechazan un `overlap_policy` desconocido con `422` y el motivo
`invalid_overlap_policy`.

## Vistas guardadas y preferencias {#saved-views-and-preferences}

Las vistas y preferencias son configuración de interfaz del operador, no historial
de workflow. Ayudan a mantener procedimientos repetibles compartiendo los filtros
y la disposición de tabla exactos usados en un incidente.

| Método | Ruta | Función |
| --- | --- | --- |
| `GET` | `/waterline/api/saved-views` | Enumera vistas guardadas de operador. |
| `POST` | `/waterline/api/saved-views` | Crea una vista guardada. |
| `GET` | `/waterline/api/saved-views/{view}` | Lee una vista guardada. |
| `PUT` | `/waterline/api/saved-views/{view}` | Actualiza una vista guardada. |
| `DELETE` | `/waterline/api/saved-views/{view}` | Elimina una vista guardada. |
| `GET` | `/waterline/api/preferences/{surface}` | Lee preferencias de una interfaz. |
| `PUT` | `/waterline/api/preferences/{surface}` | Actualiza preferencias de una interfaz. |

No trates nombres de vistas ni cargas de preferencias como datos duraderos de
workflow. Para aportar evidencia, cita el detalle seleccionado o la exportación.

## Contrato de errores {#error-contract}

Waterline usa códigos HTTP habituales y detalles de error JSON:

| Estado | Significado |
| --- | --- |
| `400` | Petición malformada o carga de acción no admitida. |
| `404` | No se encontró la instancia, ejecución, actualización, programación, vista o interfaz de preferencias en el namespace actual. |
| `409` | La ejecución seleccionada no puede realizar la acción, a menudo por ser histórica, estar cerrada, bloqueada para reproducción o sin definición disponible. Una petición de programación para todo el clúster también devuelve `409` cuando su `schedule_id` necesita un `namespace`. |
| `422` | Falló la validación; la respuesta incluye errores por campo. |
| `500` | Fallo inesperado de la aplicación. |

La automatización debe decidir según estado y campos estables como `blocked_reason`,
`query_blocked_reason`, `outcome`, `reason` y valores de `actionability`. No uses
el texto de notificaciones ni las etiquetas de botones como contrato.

## Véase también {#see-also}

- [Supervisión](./monitoring.md)
- [Fallos y recuperación](./failures-and-recovery.md)
- [Consultas](./features/queries.md)
- [Cancelar y terminar](./features/cancel-and-terminate.md)
- [Contrato de herramientas para agentes](./agent-tooling-contract.md)
