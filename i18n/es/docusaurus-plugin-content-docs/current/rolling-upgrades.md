---
sidebar_position: 15
title: Actualizaciones graduales
description: Actualiza de forma gradual y autónoma los nodos API, workers y programador de Durable Workflow sin detener el tráfico.
tags:
  - operations
  - upgrades
  - rollouts
  - rollback
keywords:
  - actualización gradual
  - seguridad del despliegue
  - drenaje de workers
  - protección del esquema
  - contrato de disponibilidad
  - reversión de workflows
---

# Actualizaciones graduales {#rolling-upgrades}

## Replay antes de cambiar builds {#replay-before-changing-builds}

Antes de promover un candidato, reproduzca historiales representativos abiertos y cerrados recientemente con su código exacto. Antes de revertir, reproduzca los historiales escritos por el build nuevo con el artefacto antiguo. Siga la [comprobación de replay](./testing.md#replay-before-deployment); una cohorte de enrutamiento compatible o una comprobación de integridad satisfactoria no demuestra, por sí sola, compatibilidad de replay.

Usa una actualización gradual para sustituir nodos API, workers o el programador
sin desconectar el despliegue. Este contrato cubre el clúster pequeño de la guía
de [despliegues autogestionados](/docs/deployment): dos o tres nodos API detrás de
un balanceador, MySQL o PostgreSQL externo compartido, Redis compartido, workers
escalados de forma independiente y exactamente un programador o proceso de mantenimiento.

La actualización gradual se admite si se cumplen todas las garantías de esta
página. Fuera de ese ámbito, usa el procedimiento con parada total de la guía de despliegue.

El vocabulario de roles y el manifiesto de topología de este contrato están en
[Topología de roles de Server](/docs/polyglot/server-role-topology). Esta guía
explica cómo se sustituyen las clases de procesos actuales de `standalone_server`.

## Qué significa aquí una actualización gradual {#what-rolling-upgrade-means-here}

Una **actualización gradual** sustituye los procesos uno a uno, drenándolos antes
de detenerlos mientras el resto de la flota sigue atendiendo tráfico. El despliegue
en conjunto no deja de estar disponible y existe un intervalo acotado de
solapamiento entre procesos antiguos y nuevos.

El contrato distingue cuatro clases de procesos en la topología actual
`standalone_server`, cada una con su estrategia de sustitución:

- **Nodos HTTP/API**: procesos sin estado que atienden tráfico HTTP y alojan
  actualmente los roles `api_ingress`, `control_plane`, `matching` y `history_projection`.
- **Workers**: procesos SDK que sondean el plano de workers y ejecutan tareas
  de actividad y workflow como `execution_plane`.
- **Programador / proceso de mantenimiento**: proceso único que activa
  programaciones y gestiona vencimientos de actividades y retención de historial
  como rol `scheduler`.
- **Inicialización**: proceso de una sola ejecución que aplica migraciones y
  crea los datos iniciales del namespace predeterminado.

Los nodos API y workers se actualizan de forma independiente. El programador es
único: se detiene el antiguo antes de iniciar el nuevo, mientras el resto del
despliegue sigue atendiendo tráfico.

## Reglas de coexistencia de versiones compatibles {#compatible-version-skew-rules}

El intervalo de solapamiento es el período durante el que hay más de una imagen
de servidor, versión del paquete Workflow o versión de SDK de worker activa.
Debe cumplir todas las reglas de esta sección.

### Imagen de servidor y paquete Workflow {#server-image-and-workflow-package}

- **Solo versiones adyacentes.** Cada nodo API y proceso Server debe usar una
  imagen cuya versión del paquete Workflow tenga la misma versión mayor que el
  paquete anterior del clúster y difiera como máximo en una versión menor de
  cualquier otro proceso activo. Saltar una versión mayor exige una parada total.
- **Migraciones aditivas hacia delante.** Cada cambio de esquema v2 es aditivo
  dentro de una versión mayor. Los nodos nuevos no deben requerir columnas o
  tablas aún no migradas. Los antiguos no deben fallar por columnas nuevas que
  no leen. Las [reglas de orden de migración](#schemabootstrap-ordering) lo garantizan.
- **Versiones adyacentes de protocolos de control y workers.** Cada nodo publica
  sus intervalos `control_plane.version` y `worker_protocol.version` admitidos en
  `GET /api/cluster/info`. El intervalo de la imagen nueva debe solaparse con el
  de todos los nodos antiguos activos. Descúbrelo antes del despliegue y aborta
  si no se solapan.

### SDK de worker e identidad de compilación {#worker-sdk-and-build-identity}

- **Identifica cada compilación.** Todo worker que participe debe registrarse
  mediante `POST /api/worker/register` con un `build_id` estable. La cohorte sin
  versión (`build_id: null`) es la predeterminada antes del despliegue. La
  [guía de despliegue por build-id](/docs/polyglot/worker-build-id-rollout)
  explica la primera transición.
- **Conserve el enrutamiento original y valide las definiciones modificadas.** La ejecución conserva su asignación de build y el fingerprint registrado en `WorkflowStarted`. Con `DW_V2_PIN_TO_RECORDED_FINGERPRINT=true` (por defecto), el cambio preparado para Server 2.9.9 prefiere workers elegibles con la definición registrada. Si no queda ninguno, una sustitución con `workflow_entry_arguments_validation` puede reclamar bajo las protecciones originales de namespace, cola, tipo, build y replay. El SDK aún debe validar la entrada original y reproducir los comandos confirmados.
- **Admisión de compilaciones solapadas.** Elige
  [`DW_V2_FLEET_VALIDATION_MODE`](/docs/polyglot/server-config-reference) antes de
  comenzar. `warn` permite seguir aunque ningún worker activo anuncie el marcador
  requerido. `fail` bloquea el despacho y rechaza la disponibilidad durante ese
  intervalo. Los despliegues de producción que requieren una transición limpia
  deben usar `fail`.

**Preparación de versiones sin publicar.** Esta ruta de sustitución requiere la validación pendiente de Server 2.9.9 y los SDK PHP 2.5.4, Python 2.6.2 o Rust 3.5.6. Los runtimes anteriores pueden seguir rechazando un fingerprint modificado aunque el código de aplicación añada una rama de versión válida. Desactivar la asignación de fingerprint no es el procedimiento predeterminado de actualización segura. Siga el [enrutamiento de definiciones](./polyglot/worker-compatibility-routing.md#definition-fingerprint-evolution), inspeccione la capacidad real del worker y conserve los artefactos de rollback hasta validar la nueva ruta. Una rama de versión no puede corregir argumentos de entrada incompatibles antes de entrar en el cuerpo del workflow; consulte [compatibilidad de entrada](./features/versioning.md#service-sdk-entry-safeguard).

## Orden de esquema e inicialización {#schemabootstrap-ordering}

Los cambios de esquema se aplican en una pasada de inicialización. El orden importa.

1. **Inicializa primero, exactamente una vez.** Ejecuta `php artisan
   server:bootstrap --force` (o el equivalente de la imagen publicada) desde un
   contenedor antes de iniciar nodos API, workers o programadores nuevos. Aplica
   `migrate` y los datos iniciales del namespace, y adopta las migraciones del
   paquete Workflow cuyas tablas ya existen en la conexión.
2. **El esquema nuevo debe ser compatible con el código antiguo.** Las
   migraciones v2 de esta ruta son aditivas (tablas, columnas e índices nuevos).
   Los nodos API y workers antiguos siguen usando el esquema nuevo.
3. **No inicies código nuevo antes de terminar la inicialización.** Sustituye
   la imagen solo después de que termine correctamente. Los procesos nuevos
   pueden depender de tablas recién migradas. Iniciarlos antes es la causa más
   habitual de un aumento de errores 5xx durante la transición.
4. **La inicialización es idempotente.** Se puede repetir con seguridad. Si
   falla a medias, corrige el error y repítela. El registro de migraciones
   continúa donde quedó y la creación del namespace no hace nada si ya existe.

Una migración aplicada antes en un servidor que en otro NO DEBE corromper la
interfaz de disponibilidad. Si detectas un cambio no aditivo al planificar,
reserva una parada total para esa publicación y vuelve al modo gradual en la siguiente.

## Drenaje y admisión durante el solapamiento {#drain-and-admission-during-the-overlap-window}

Tres mecanismos de admisión garantizan automáticamente la seguridad durante el solapamiento:

- **Admisión al arrancar.** Cada proceso carga `BackendCapabilities`,
  `LongPollCacheValidator`, `WorkflowModeGuard` y el contrato de disponibilidad.
  Si el backend o la caché no cumplen v2, se niega a declararse disponible.
- **Compatibilidad de workers.** Con `DW_V2_FLEET_VALIDATION_MODE=fail`, si ningún
  worker activo anuncia el marcador requerido para la conexión y cola de una
  tarea, el rol de asignación bloquea el despacho y la comprobación
  `worker_compatibility` pasa de `warning` a `error`. Las tareas siguen listas y
  visibles, sin descartarse. El nodo devuelve 503 en disponibilidad para que el
  balanceador lo retire de la rotación.
- **Seguridad del enrutamiento.** Una tarea lista sin worker compatible se
  conserva y cuenta en `compatibility_blocked_runs`. La seguridad de enrutamiento
  nunca provoca una pérdida silenciosa. La garantía de ejecución al menos una
  vez sigue vigente tras el drenaje del enrutamiento.

Para acortar el solapamiento, drena las cohortes antiguas a medida que entran
workers nuevos. Usa el procedimiento de
[despliegue por build-id](/docs/polyglot/worker-build-id-rollout):

```bash
dw task-queue:drain orders-critical --build-id orders-worker-2026-04-21-z9
```

El `drain_intent` de la cohorte pasa a `draining`. Sus workers terminan el trabajo
en curso pero dejan de reclamar tareas nuevas. Espera a que `active_worker_count`
y `draining_worker_count` sean cero antes de detener los procesos antiguos.

El programador no ejecuta una cola de tareas de larga duración y no necesita
drenaje de worker. Detén su contenedor antiguo, inicializa si aún no se ha hecho
y arranca el nuevo. El intervalo dura lo que tarda en arrancar el contenedor.
La activación de programaciones se reanuda desde el estado persistido en el
siguiente ciclo.

Si introduces un rol de asignación dedicado, declara explícitamente el cambio
de topología en vez de asumir que cada nodo de ejecución seguirá explorando
ampliamente las tareas listas. Consulta
[Asignación y despacho de tareas](/docs/polyglot/task-matching-dispatch) para la
topología `workflow:v2:repair-pass --loop` con
`DW_V2_MATCHING_ROLE_QUEUE_WAKE=0`. Verifica en `GET /api/cluster/info` que
`topology.current_shape` coincide con el despliegue, `topology.current_roles`
con los roles documentados del nodo, y `topology.matching_role.queue_wake_enabled`,
`topology.matching_role.shape` y `topology.matching_role.wake_owner` con el
responsable esperado de explorar tareas listas. La topología predeterminada
indica `queue_wake_enabled: true`, `shape: "in_worker"` y
`wake_owner: "worker_loop"`. El modo dedicado cambia los nodos de ejecución a
`queue_wake_enabled: false`, `shape: "dedicated"` y
`wake_owner: "dedicated_repair_pass"`.

## Disponibilidad y transición {#readiness-and-cutover}

Usa el contrato de disponibilidad, además de la sonda de vida, para decidir
cuándo enviar tráfico a un nodo.

- `GET /api/health` demuestra que el proceso sirve HTTP.
- `GET /api/ready` demuestra que puede usar sus dependencias configuradas,
  incluidas migraciones, namespace predeterminado y, con
  `DW_V2_FLEET_VALIDATION_MODE=fail`, admisión de compatibilidad de workers.
- `GET /api/cluster/info` demuestra que un cliente autenticado descubre la
  identidad de compilación, protocolos de control y workers, códecs y capacidades.
- `POST /api/worker/register` demuestra que los workers pueden autenticarse en
  el namespace y la cola esperados.

Secuencia de transición para un nodo API:

1. Retira el nodo de la rotación del balanceador. La opción más sencilla es hacer
   fallar su sonda de disponibilidad deteniendo el hook previo al arranque de la
   nueva imagen antes de iniciar el contenedor.
2. Drena las peticiones HTTP en curso. La mayoría de clientes reintentan tras
   un reinicio de conexión. Los sondeos largos de workers se reconectan al resto
   de la flota.
3. Detén el contenedor antiguo e inicia el nuevo.
4. Espera a que `GET /api/ready` devuelva 200 y `GET /api/cluster/info` anuncie la
   nueva identidad. Si cambia la topología de asignación, confirma que
   `topology.matching_role.task_dispatch_mode`,
   `topology.matching_role.queue_wake_enabled`, `topology.matching_role.shape`,
   `topology.matching_role.wake_owner`, `topology.matching_role.partition_primitives`
   y `topology.matching_role.backpressure_model` coinciden con el despliegue
   previsto antes de devolver tráfico. Usa `/api/system/operator-metrics` para
   ver el mismo contrato local junto con contadores actuales de trabajo
   pendiente, reparaciones y workers del proceso que responde.
5. Devuelve el nodo a la rotación.

Repite con un nodo cada vez. No actualices el siguiente hasta que el anterior
vuelva a la rotación y atienda tráfico correctamente.

Para workers, la transición se realiza por cohorte:

1. Inicia la nueva cohorte con un `build_id` nuevo.
2. Confirma que ambas indican `rollout_status: "active"` y `active_worker_count`
   mayor que cero en `dw task-queue:build-ids <queue> --json`.
3. Drena la antigua con `dw task-queue:drain`.
4. Espera a que `active_worker_count` y `draining_worker_count` de la antigua sean cero.
5. Detén los procesos de workers antiguos.

## Reversión {#rollback}

Cada paso es reversible. Planifica la reversión antes de comenzar.

- **Revertir la inicialización.** Las migraciones v2 se revierten mediante el
  `down()` estándar de Laravel. Antes de revertir una migración requerida por
  la imagen nueva hay que detener todos los nodos nuevos. De lo contrario falta
  una columna y esos nodos devuelven 503 en disponibilidad. La mayoría de
  reversiones no necesitan deshacer migraciones, pues los cambios son aditivos.
- **Revertir nodos API.** Detén el contenedor nuevo y reinicia el antiguo en el
  mismo nodo. Retíralo de la rotación mientras arranca y devuélvelo cuando
  `GET /api/ready` sea correcto. Repite para los demás nodos actualizados. El
  código antiguo sigue leyendo el esquema nuevo porque el cambio fue aditivo.
- **Revertir workers.** Reanuda la cohorte drenada, drena la defectuosa y vuelve
  a escalar la compilación que funcionaba:

  ```bash
  dw task-queue:resume orders-critical --build-id orders-worker-2026-04-21-z9
  dw task-queue:drain  orders-critical --build-id orders-worker-2026-04-22
  ```

  La reanudación borra `drain_intent` y `drained_at`. Todo worker que envíe
  latidos con el `build_id` reanudado vuelve a `active` en el siguiente sondeo.
  Ambas llamadas son idempotentes.

Si aparece un problema de esquema no aditivo, reserva una parada total para
revertir, aplicar las migraciones correctoras y volver a planificar.

## Verificación del operador {#operator-verification}

Verifica cada fase mediante las interfaces de operador, no mediante registros.

| Pregunta | Interfaz |
| --- | --- |
| ¿Terminó la inicialización? | `php artisan server:bootstrap --force` termina con código 0 y `migrate:status` muestra todas las migraciones aplicadas. |
| ¿Está disponible el nodo nuevo? | `GET /api/ready` devuelve 200 y `GET /api/cluster/info` informa de la compilación nueva. |
| ¿Está sana la admisión por compatibilidad? | En `GET /api/system/operator-metrics`, `workers.fleet`, `workers.active_workers` y `workers.active_workers_supporting_required` concuerdan en un número de workers mayor que cero para cada marcador requerido. |
| ¿Avanza el drenaje? | `dw task-queue:build-ids <queue> --json` muestra descender `active_worker_count` y `draining_worker_count` de la cohorte drenada. |
| ¿Es seguro el enrutamiento? | En `GET /api/system/operator-metrics`, `backlog.compatibility_blocked_runs` y `backlog.max_compatibility_blocked_age_ms` siguen cerca de cero; `worker_compatibility` no está en `error`. |
| ¿Está al día el programador? | En `GET /api/system/operator-metrics`, `schedules.missed` es cero y `schedules.oldest_overdue_at` es null. |
| ¿Se acumulan ejecuciones atascadas? | En `GET /api/system/operator-metrics`, `runs.repair_needed` y `runs.max_repair_needed_age_ms` siguen cerca de su referencia previa. |

`dw system:operator-metrics --json` expone la misma instantánea en consola para
la flota de servidores independientes. Elige la interfaz adecuada para tu
trabajo. Un Waterline separado lee el mismo estado del servidor mediante el SDK
PHP en `/waterline/api/v2/health` y `/waterline/api/stats`. Mantén su endpoint,
namespace y token alineados con la flota que actualizas. En Laravel integrado,
esas rutas se exponen desde el paquete del propio proceso. La API y CLI del
servidor siguen disponibles en ambos casos, como documenta el
[ámbito operativo del operador](/docs/operator-operating-envelope).

## Modos de fallo y medidas {#failure-modes-and-what-to-do}

| Síntoma | Causa probable | Acción |
| --- | --- | --- |
| El nodo nuevo falla `GET /api/ready` al arrancar | Inicialización incompleta, o `DW_V2_FLEET_VALIDATION_MODE=fail` sin worker compatible activo | Repite la inicialización e inicia una cohorte compatible antes de devolver el nodo a la rotación. |
| `worker_compatibility` pasa a `error` durante la actualización | Ningún worker activo admite el marcador requerido | Inicia más workers con un `build_id` compatible. Reanuda una cohorte drenada si corresponde revertir. |
| Suben `backlog.compatibility_blocked_runs` y `max_compatibility_blocked_age_ms` | Hay tareas para un marcador sin worker activo compatible | Igual que arriba. Se conservan las tareas y se despachan automáticamente cuando un worker compatible envía un latido. |
| `dw task-queue:drain` termina correctamente pero siguen reclamándose tareas | El proceso no envió un latido tras el drenaje | Espera un ciclo de latido. Si la cohorte sigue activa, reinicia el proceso para que recoja la intención de drenaje. |
| Dejan de activarse programaciones tras reiniciar el programador | Tanto el antiguo como el nuevo están detenidos | Inicia el contenedor nuevo y verifica que `schedules.missed` vuelve a cero en la siguiente recogida de métricas de operador. |

Si un síntoma no figura aquí, considera fallido el despliegue: deja de añadir
procesos, drena las cohortes nuevas y restaura la compilación anterior antes de
seguir depurando.

## Referencias relacionadas {#related-references}

- [Despliegues autogestionados](/docs/deployment): topologías que presupone este contrato.
- [Despliegue por build-id de worker](/docs/polyglot/worker-build-id-rollout):
  llamadas de drenaje y reanudación por cohorte.
- [Ámbito operativo del operador](/docs/operator-operating-envelope): contrato de
  diagnósticos, colas y reconstrucción que acompaña las señales del despliegue.
- [Referencia de configuración de Server](/docs/polyglot/server-config-reference):
  variables de entorno de seguridad (`DW_V2_FLEET_VALIDATION_MODE`,
  `DW_V2_PIN_TO_RECORDED_FINGERPRINT`, `DW_V2_GUARDRAILS_BOOT`,
  `DW_V2_CACHE_VALIDATION_MODE`, `DW_V2_MULTI_NODE`,
  `DW_V2_VALIDATE_CACHE_BACKEND`, `DW_V2_TASK_REPAIR_*`).
- [Referencia de la API de Server](/docs/polyglot/server-api-reference): endpoints
  de disponibilidad, información del clúster y métricas de operador para verificar cada fase.
