---
sidebar_position: 6
title: Asignación y despacho de tareas
description: Entiende cómo Durable Workflow asigna tareas duraderas listas a workers, desde avisos de sondeo largo hasta despliegues con un rol de asignación dedicado.
tags:
  - worker-protocol
  - task-queues
  - operations
  - dispatch
keywords:
  - asignación de tareas
  - despacho de tareas
  - rol de asignación
  - descubrimiento de tareas listas
  - aviso de cola
---

# Asignación y despacho de tareas {#task-matching-and-dispatch}

Utiliza esta guía para entender cómo Durable Workflow encuentra trabajo listo,
lo asigna a workers compatibles y escala esa ruta de asignación más allá de
que cada nodo lo sondee todo. Es el contrato que sustenta el sondeo de tareas
de workflow y actividad, los avisos de cola y los despliegues con un rol de
asignación dedicado.

La idea central es que Durable Workflow separa dos responsabilidades:

- el historial duradero y el estado de las tareas permanecen en la base de datos
- la asignación decide qué worker activo recibe la siguiente tarea apta

Esta separación importa incluso antes de incorporar un servicio de asignación
independiente. Permite tratar el descubrimiento de tareas listas, la propiedad
de las colas, la rotación de leases y la contrapresión como un rol
explícito, en lugar de efectos incidentales de cada proceso de worker.

## Funciones del rol de asignación {#what-the-matching-role-does}

El rol de asignación se encarga de:

- descubrir tareas listas de workflow y actividad
- reducir el conjunto apto por espacio de nombres, conexión, cola y familia
  de compatibilidad
- ofrecer las tareas a un solo worker a la vez
- convertir una reclamación satisfactoria en una lease con vencimiento
- conservar la misma tarea si falla una reclamación, vence una lease
  o desaparece un worker
- mostrar a los operadores el estado de los avisos y del trabajo acumulado

La asignación no sustituye el historial duradero, la reproducción del workflow
ni la ejecución de tareas. Decide quién obtiene la siguiente oportunidad de ejecutar.

## Formas de despliegue {#deployment-shapes}

Durable Workflow admite hoy tres formas prácticas:

### Asignación dentro del worker {#in-worker-matching}

Es la forma predeterminada. Los procesos de worker realizan sondeos largos para
encontrar trabajo listo y aplican exclusión al reclamar para garantizar que un
solo worker posea la lease de una tarea a la vez.

Utilízala cuando:

- ejecutes un nodo o una flota pequeña
- la presión sobre las colas sea moderada
- aún no necesites un daemon de asignación dedicado

### Asignación HTTP en el servidor {#in-server-http-matching}

En los despliegues de servidor independiente, los workers externos acceden al
mismo contrato de asignación mediante el protocolo de workers:

- `POST /api/worker/workflow-tasks/poll`
- `POST /api/worker/activity-tasks/poll`

El servidor pasa a ser el punto de entrada de red del mismo flujo de
descubrimiento, reclamación, latidos y finalización de tareas listas.

### Despliegue con rol de asignación dedicado {#dedicated-matching-role-deployment}

Las flotas mayores pueden concentrar el descubrimiento general de tareas listas
en un proceso con rol de asignación dedicado. La forma operativa documentada hoy es:

```bash
php artisan workflow:v2:repair-pass --loop
```

Ejecuta ese daemon en un proceso dedicado y configura
`DW_V2_MATCHING_ROLE_QUEUE_WAKE=0` en los nodos de solo ejecución para que dejen
de realizar el aviso general a workers de cola en cada iteración.

Utiliza esta forma cuando:

- los nodos de ejecución deban centrarse en reproducir y ejecutar actividades
- el sondeo general independiente cree contención innecesaria
- los operadores necesiten un responsable explícito del descubrimiento de
  tareas listas y de la frecuencia de barrido

El rol dedicado cambia dónde se realiza la asignación, sin cambiar el contrato
del protocolo de workers. La semántica de sondeo, reclamación, lease y
nueva entrega permanece igual.

## Descubrimiento de tareas listas {#ready-task-discovery}

El rol de asignación busca tareas duraderas que estén realmente listas ahora:

- el tipo de tarea coincide con el sondeador (`workflow` o `activity`)
- la tarea está en estado `ready`
- ha llegado su `available_at`
- siguen coincidiendo los filtros de espacio de nombres, cola, conexión y compatibilidad
- los sondeos de actividad también requieren un tipo de actividad anunciado coincidente

Los avisos de sondeo largo aceleran el proceso, pero no garantizan su corrección.
Si el aviso se retrasa o falta, el sondeo duradero sigue haciendo visible la
tarea. Un fallo de aviso debe aumentar la latencia, no dejar trabajo bloqueado.

## Reclamación, lease y contrapresión {#claim-lease-and-backpressure}

La asignación solo ofrece una oportunidad. La propiedad comienza cuando un
worker reclama la tarea correctamente y recibe una lease.

Esa lease proporciona la contrapresión de Durable Workflow:

- un worker posee la tarea hasta que la lease se renueva, completa,
  libera o vence
- un worker fallido u obsoleto no retiene la tarea permanentemente
- la nueva entrega es normal y debe contemplarse en la ejecución al menos una vez
- los workers incompatibles no roban la lease; reciben un rechazo explícito

Como el trabajo se basa en leases, la presión de cola aparece como
trabajo acumulado, leases obsoletas o entregas repetidas, en lugar de
pérdidas ocultas en memoria.

## Particionado de colas {#queue-partitioning}

Las principales primitivas de particionado son:

- **espacio de nombres** para límites de inquilino o entorno
- **conexión** y **cola** para límites de enrutamiento del trabajo
- **familia de compatibilidad** para la seguridad del enrutamiento por marcadores
- **filtros de tipo de actividad** para workers que solo ejecutan actividades seleccionadas

Utiliza colas separadas si necesitas más aislamiento, grupos de workers
independientes o presupuestos distintos para dependencias posteriores. Utiliza
familias de compatibilidad si una cola debe seguir activa durante un despliegue
o reversión sin que el trabajo en curso pase a ejecutores incompatibles.

## Colas de actividad registradas {#recorded-activity-queues}

La conexión y la cola resueltas de una actividad se guardan al programarla. Un cambio en su clase, `ActivityOptions`, las opciones de actividad del SDK PHP o Python `schedule_activity(..., queue=...)` afecta a las actividades que se programen después. Las ejecuciones existentes conservan su cola registrada en los reintentos y reparaciones. Registrar un worker en una cola nueva no traslada el trabajo antiguo. Las ejecuciones de workflow existentes también conservan su propia cola de workflow.

### Cambiar el enrutamiento con un período de solapamiento {#change-recorded-routing}

1. Inicia workers para la cola nueva en el namespace correcto. Verifica sus tipos de actividad, slots de actividad positivos y compatibilidad de build. Mantén disponibles los grupos antiguos de workflows y actividades.
2. Despliega el nuevo enrutamiento para el trabajo nuevo. Conserva código compatible con las ejecuciones existentes y respeta sus builds fijadas. Una cola nueva no migra las ejecuciones registradas.
3. Inspecciona las ejecuciones afectadas y ambas colas. Ten en cuenta las actividades pendientes o con lease, la disponibilidad futura de reintentos, las ejecuciones abiertas pasivas, los hijos y las cadenas de continuación que aún necesitan workers antiguos. Un contador de tareas listas a cero no cubre esas dependencias.
4. Retira los workers antiguos solo después de considerar esas dependencias e impedir que el trabajo nuevo las cree. Las instantáneas actuales no son una protección atómica para la retirada. Si no puedes establecerlo, mantén disponible el grupo antiguo. [Server #519](https://github.com/durable-workflow/server/issues/519) cubre el inventario y la retirada protegidos.

### Inspeccionar y recuperar trabajo bloqueado {#recorded-queue-diagnostics}

Usa una credencial de operador y el mismo namespace que la ejecución afectada. Establece explícitamente el origen, el namespace, la cola antigua y los IDs del workflow y la ejecución seleccionados:

```bash
curl -fsS "$DW_SERVER_URL/api/task-queues/$OLD_QUEUE" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "X-Namespace: $DW_NAMESPACE"
curl -fsS "$DW_SERVER_URL/api/workflows/$WORKFLOW_ID/runs/$RUN_ID/debug" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "X-Namespace: $DW_NAMESPACE"
```

La visibilidad de colas informa `admission.activity_tasks.status: no_active_workers` cuando no hay un worker activo y no obsoleto registrado en esa cola. La respuesta de depuración de la ejecución incluye `pending_activities[].queue`, `activity_task_queues` y hallazgos como `pending_activity_queue_without_active_pollers`. Si hay workers pero no anuncian el tipo de actividad necesario, busca `pending_activity_type_unsupported`. Registrarse no demuestra por sí solo que el worker progrese.

La respuesta de depuración es una instantánea acotada de una ejecución, no un inventario completo de la cola. Incluye como máximo 25 actividades pendientes. Los contadores de cola y las instantáneas vacías no demuestran que el trabajo concurrente o futuro ya no dependa del grupo antiguo.

Restaura un worker compatible en la cola **registrada**, con el tipo de actividad necesario y slots disponibles, antes de que venzan sus plazos. Reparar o reiniciar un worker no cambia esa cola ni amplía el plazo total original. Si ya no se desea ese trabajo, cancela deliberadamente la ejecución afectada y concilia sus efectos externos. No edites los campos de cola almacenados como procedimiento de migración.

Un timeout finito de schedule-to-start puede vencer mientras una actividad espera un worker. Schedule-to-close limita toda la ejecución de la actividad, incluidos los retrasos de reintento. Esos límites solo se aplican si están configurados. Aplicar el plazo no traslada la actividad a una cola activa, y restaurar workers no revive un timeout ya terminal. Consulta los [timeouts de actividades y workflows](../features/timeouts.md).

## Avisos y barridos dedicados {#wake-signals-and-dedicated-sweeps}

Los avisos reducen el tiempo entre que una tarea está lista y un sondeador la
detecta. No son la fuente de verdad duradera.

En la forma predeterminada, los workers de cola pueden emitir avisos en su bucle
normal. Con un rol de asignación dedicado, los nodos de solo ejecución
deshabilitan esa ruta general de avisos y el daemon de asignación se encarga
de la frecuencia de barrido.

Estos son los controles de ajuste:

- `DW_V2_MATCHING_ROLE_QUEUE_WAKE` controla si los nodos de ejecución realizan
  el aviso dentro del worker
- `DW_WAKE_SIGNAL_TTL_SECONDS` controla cuánto siguen visibles los marcadores de aviso
- los tiempos de espera de sondeo largo controlan cuánto permanecen los sondeadores
  esperando trabajo

## Qué deben observar los operadores {#what-operators-should-watch}

Utiliza estas interfaces en conjunto:

- `GET /api/cluster/info` para la topología de roles por nodo:
  `current_shape`, `current_process_class`, roles actuales y el contrato completo
  `matching_role`: `queue_wake_enabled`, `shape` del despliegue,
  `wake_owner`, `task_dispatch_mode`, `partition_primitives` fijadas y el
  `backpressure_model` actual
- visibilidad de colas para profundidad de trabajo listo, slots activos y limitación
- visibilidad de flota para sondeadores activos u obsoletos en cada cola
- `dw system:operator-metrics --json` o `/api/system/operator-metrics` para el
  mismo contrato `matching_role` local al nodo junto a contadores actuales de
  trabajo acumulado, reparación, workers y salud del proceso que responde
- diagnósticos de salud y Waterline para tareas defectuosas, leases
  obsoletas y falta de workers compatibles
- comprobaciones de actualización progresiva si hay una ventana de coexistencia
  y la asignación debe bloquear reclamaciones inseguras

Si aumenta la antigüedad de la tarea lista más antigua y hay workers compatibles,
la ruta de asignación no progresa con suficiente rapidez. Si las tareas listas
se conservan pero ningún worker compatible puede reclamarlas, el problema es de
compatibilidad, no de pérdida en la asignación.

## Cuándo incorporar un rol de asignación dedicado {#when-to-introduce-a-dedicated-matching-role}

Cambia de la asignación predeterminada en workers a un rol dedicado cuando:

- el sondeo general cree contención visible en base de datos o caché
- los nodos de ejecución deban dejar de asumir el coste de barrer tareas listas
- la equidad entre colas y la responsabilidad del despacho deban tratarse como
  un subsistema explícito
- los operadores necesiten un proceso distinto para escalar, supervisar y
  depurar el descubrimiento de tareas listas

Mantén la forma predeterminada si la flota actual es pequeña y la principal
necesidad es aclarar el despliegue y la compatibilidad en lugar de adoptar otra topología.

## Referencias relacionadas {#related-references}

- [Protocolo de workers](/docs/polyglot/worker-protocol) para las operaciones de
  sondeo, latido, finalización y fallo
- [Admisión en colas de tareas](/docs/polyglot/task-queue-admission) para los
  presupuestos de slots, leases y despacho sobre la asignación
- [Actualizaciones progresivas](/docs/rolling-upgrades) para el procedimiento de
  despliegue cuando intervienen asignación y compatibilidad
- [Referencia de configuración del servidor](/docs/polyglot/server-config-reference)
  para `DW_V2_MATCHING_ROLE_QUEUE_WAKE`, tiempos de sondeo y ajustes de avisos
