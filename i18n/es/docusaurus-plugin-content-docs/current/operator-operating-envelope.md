---
sidebar_position: 14
title: Ámbito operativo del operador
description: Contrato operativo v2 de salud, colas, reconstrucción, exportación, archivado y topología.
tags:
  - operaciones
  - observabilidad
  - Waterline
keywords:
  - ámbito operativo
  - salud de workflows v2
  - reconstruir proyecciones
  - exportar historial
  - verificar archivado
  - salud de colas
  - alta disponibilidad
---

# Ámbito operativo del operador {#operator-operating-envelope}

Esta guía define el contrato operativo de Durable Workflow v2. Úsela para decidir qué diagnósticos bloquean un despliegue y cuáles son orientativos, qué datos de colas corresponden a Waterline o a la telemetría de workers, cómo verificar reconstrucciones y exportaciones y qué topologías están documentadas.

Estos procedimientos de despliegue y recuperación se aplican a Laravel integrado y a Server autogestionado. Durable Workflow Cloud es un servicio gestionado independiente: Cloud controla la persistencia, ubicación en una región, copias, restauración y recuperación del runtime. Los clientes operan clientes y workers de los SDK mediante la URL de su namespace. No use esta guía para conectar un Server a Cloud. Consulte [Runtime gestionado de Cloud](/docs/polyglot/cloud-control-plane) para esa frontera del cliente.

## Interfaces de referencia autoritativa {#source-of-truth-surfaces}

Use estas interfaces juntas:

| Interfaz | Uso | Clase de contrato |
| --- | --- | --- |
| `php artisan workflow:v2:doctor --strict` | Validar capacidades del backend antes del tráfico v2 o las actualizaciones | Bloqueante |
| `GET /waterline/api/v2/health` | Disponibilidad actual del motor y comprobaciones v2 bloqueantes u orientativas | Bloqueante con `status = error`; orientativa con `status = warning` |
| `GET /waterline/api/stats` | Totales duraderos, pendientes, reparación, divergencia de proyecciones y compatibilidad de workers | Orientación y mediciones |
| `php artisan workflow:v2:rebuild-projections ...` | Previsualizar y reparar divergencia de proyecciones | Mantenimiento |
| `php artisan workflow:v2:backfill-command-contracts ...` | Previsualizar y completar snapshots antiguos de contratos de comandos | Mantenimiento |
| `php artisan workflow:v2:history-export ...` y rutas de exportación de Waterline | Replay, transferencia de archivos y artefactos de incidentes | Verificación |
| Acciones de archivo de Waterline y `archive()` del plano de control | Transiciones del ciclo de vida de ejecuciones cerradas | Ciclo de vida |
| Métricas, trazas y registros de SDK de workers | Latencia de programación a inicio, sondeos, caché sticky y telemetría de la aplicación | Telemetría de ejecución |

El contrato operativo del estado duradero reside en el runtime propietario de cada ejecución. Waterline lo presenta desde el paquete integrado o desde Server independiente mediante el SDK PHP. La telemetría del worker sigue siendo la referencia para latencia y comportamiento de los procesos dentro de sus workers.

### Interfaces según el despliegue {#surface-mapping-by-deployment-shape}

Las rutas anteriores están disponibles en ambos modos de Waterline. El modo integrado lee el estado duradero del host Laravel dentro del proceso. El modo de servicio ejecuta la imagen publicada de Waterline y lee un namespace de Server mediante el SDK PHP. La API autenticada de Server y la CLI `dw` también están disponibles directamente, con o sin Waterline:

| Pregunta del operador | Waterline integrado o de servicio | Interfaz nativa de Server independiente |
| --- | --- | --- |
| Disponibilidad del motor y salud bloqueante u orientativa | `GET /waterline/api/v2/health` | `GET /api/system/health` con autenticación admin y plano de control v2; `dw server:health` para vida y `dw server:info` para topología, protocolo y seguridad del despliegue |
| Totales duraderos, pendientes, reparación, compatibilidad y divergencia de proyecciones | `GET /waterline/api/stats` | `GET /api/system/operator-metrics` y `dw system:operator-metrics` |
| Detalle de una ejecución seleccionada y exportación | `GET /waterline/api/instances/...` y `/waterline/api/.../history-export` | `GET /api/workflows/{workflowId}`, `/runs/{runId}` y `/runs/{runId}/history/export`; consulte la [referencia API de Server](./polyglot/server-api-reference.md) |
| Comandos del operador: cancelar, terminar, reparar, archivar, señales, actualizaciones y consultas | `POST /waterline/api/instances/.../{cancel\|terminate\|repair\|archive}` y rutas de señales, actualizaciones y consultas | `POST /api/workflows/{workflowId}/{cancel\|terminate\|repair\|archive}` y `POST /api/system/repair/pass` |
| Descubrimiento de topología e identidad de nodo | Integrado: `php artisan workflow:v2:doctor --json`, objeto `topology`. Servicio: interfaz nativa del Server conectado | `GET /api/cluster/info`, `GET /api/health`, `GET /api/ready` o `dw server:info` |

Las familias de campos y los nombres de contrato siguientes no cambian según la interfaz usada. Un Waterline está limitado al runtime y namespace configurados. No combina ejecuciones integradas con ejecuciones gestionadas por Server.

## Evidencia fechada de la versión 2.0 {#dated-20-evidence-snapshot}

Este resumen distingue el comportamiento medido en artefactos publicados de los procedimientos admitidos que cada operador debe ensayar en su entorno. Una fila aprobada se aplica al escenario y topología 2.0 documentados, no a otros sustratos o despliegues mayores en general.

El inventario actual de pruebas es:

| Prueba y fecha UTC | Medición directa | Límites |
| --- | --- | --- |
| Ensayo de failover en una región, 2026-07-28 | Finalización entre nodos, pérdida de una API, interrupción y recuperación de MySQL, pérdida de Redis con sondeo de base de datos, pérdida y recuperación de lease de worker y reinicio del planificador único. Todas las fases aprobaron las aserciones de pérdidas y duplicados. | Dos API con un endpoint compartido, una instancia MySQL, Redis como aceleración, un worker de cola y un planificador/mantenimiento en una región. Las interrupciones fueron de contenedores, no promociones gestionadas del proveedor. |
| Matriz de reinicio de temporizadores, 2026-07-28 | Los workflows dormidos terminaron tras reiniciar worker y Server, con una programación y un disparo de temporizador por ejecución, sin comandos de replay duplicados. | Recuperación de temporizadores duraderos y replay en la topología publicada, no del estado arbitrario de procesos o efectos externos. |
| Matriz de actividades, 2026-07-29 | Recuperación de resultados tras reiniciar workers, reintentos y tiempos de espera, observación de heartbeat y cancelación, registro terminal duradero y finalización idempotente en las interfaces requeridas. | Comportamiento del motor a nivel de actividad. La aplicación sigue controlando la idempotencia de efectos externos. |
| Matriz de ciclo de vida, 2026-07-29 | Finalización y fallo terminales, inicio duplicado y reutilización de ids, tiempos de espera y reintentos, continuidad de historial y prevención de efectos duplicados entre PHP, Python, Rust, CLI, API, historial y Waterline. | Corrección del ciclo de vida en los escenarios probados, no una medición de disponibilidad o rendimiento. |

Consulte el [contrato de compatibilidad](./compatibility.md) para las líneas de versiones admitidas y ensaye la recuperación documentada en su despliegue antes de afirmar capacidad de failover específica para una topología.

### Garantías medidas y procedimientos admitidos {#measured-guarantee-vs-supported-procedure}

| Fallo o resultado | Prueba directa de la evidencia fechada | Procedimiento admitido | Lo que no demuestra |
| --- | --- | --- | --- |
| Pérdida de una API | Se eliminó una de dos API, se alcanzó la superviviente por el endpoint común, se conservó el estado confirmado y terminó la ejecución. | Retire nodos con `/api/ready`, reintente solicitudes interrumpidas y compruebe topología y registro antes de restaurar tráfico. | Pérdida total de flota, aislamiento de zona o particiones arbitrarias. |
| Interrupción de base de datos | Ambas API dejaron de estar listas; sobrevivió el estado duradero, un worker sustituto recuperó la tarea al caducar el lease, terminó la ejecución y se rechazó una finalización duplicada. | Restaure primero la base escribible, espere disponibilidad, invalide al propietario antiguo y verifique una ejecución antes de reanudar tráfico. La promoción gestionada necesita fencing del proveedor, RPO y tiempos medidos. | Promoción de base gestionada, escrituras confirmadas durante split-brain o RPO/RTO fuera de la interrupción local medida. |
| Interrupción de Redis | La disponibilidad indicó aceleración degradada mientras el sondeo de base conservó el estado; repetir la solicitud de sondeo no duplicó un lease y la disponibilidad volvió al restaurar Redis. | Mantenga Redis como aceleración, tolere el aviso, restáurelo después de la persistencia y confirme que la latencia de descubrimiento vuelve a la referencia. | Redis con dos primarios, caché durante particiones o tiempos de promoción del proveedor. |
| Reinicio o pérdida de worker | El ensayo recuperó y terminó un workflow con lease tras perder al worker. La matriz de actividad posterior probó recuperación duradera de resultados y finalización idempotente. | Deje caducar leases o drene workers, inicie un sustituto compatible, verifique registro y reclamación y mantenga efectos externos idempotentes. | Estado local al proceso no almacenado o efectos externos exactamente una vez. |
| Reinicio de Server o planificador | La matriz terminó workflows dormidos tras reiniciar Server sin duplicar temporizadores. El ensayo conservó avance al perder una API y reiniciar un planificador único. | Restaure persistencia, disponibilice los roles, confirme un solo planificador/mantenimiento, registro y una finalización representativa. | Pérdida simultánea de todos los nodos de Server y persistencia, failover multirregión o planificadores duplicados como topología estable. |
| Entrega duplicada | La recuperación de base y pérdida de worker registraron una finalización lógica y rechazaron la duplicada con HTTP `409`. Con Redis degradado se reutilizó el lease original. La matriz de actividad aprobó aparte la finalización idempotente. | Use identidades estables de solicitud y tarea, respete rechazos de intentos obsoletos y haga idempotentes los efectos de actividad. | Garantía universal de entrega o efectos exactamente una vez fuera del motor duradero. |
| Finalización terminal | Workflows entre nodos, pérdida de API, recuperación de base y pérdida de worker llegaron a `completed`. La matriz posterior aprobó finalización, fallo, cancelación, terminación, tiempo de espera y reintentos. | Verifique la ejecución seleccionada y su historial/exportación antes de archivar o declarar recuperada. | Cargas, integraciones o combinaciones de fallos no probadas. |

### Mayor prueba de carga actual {#largest-current-load-cell}

La mayor prueba configurada inicia **1000 workflows** con concurrencia de inicio **8** y **8** workers sondeando en paralelo durante 120 segundos. Exige al menos un 98 % de finalización de inicios y comprueba disponibilidad de endpoints, vaciado de claves de caché, cobertura de muestras y límites de recursos.

Trátelo como una **prueba breve de corrección**, no como una medición sostenida a escala de producción. No establece promesas universales de rendimiento, latencia, memoria o concurrencia máxima. Determine esos valores con pruebas de rendimiento y prolongadas para la topología, mezcla de workers, base de datos, caché y versión exactas que va a operar.

### Exclusiones explícitas {#explicitly-out-of-scope}

La evidencia de 2.0 no cubre:

- Particiones de red
- Desviación deliberada del reloj
- Operación multirregión
- Comportamiento split-brain

Esos experimentos no son requisitos de publicación de 2.0. Son requisitos para hacer las afirmaciones correspondientes sobre particiones, desviación de reloj, multirregión o split-brain. El ámbito 2.0 admitido sigue siendo la topología publicada con su paquete de recuperación y el comportamiento medido en los escenarios documentados. Los escenarios de caos no admitidos no demuestran que los procedimientos documentados de una región sean inutilizables.

## Topologías admitidas {#supported-topologies}

Durable Workflow v2 admite las topologías operativas siguientes. Los nombres de la primera columna coinciden con `topology.current_shape` publicado en `/api/cluster/info` y en [Topología de roles de Server](./polyglot/server-role-topology.md). Así, el contrato operativo coincide con el descubrimiento que lee su automatización.

| Topología operativa (`topology.current_shape`) | Contrato operativo admitido | Principales dominios de fallo | Expectativa de recuperación y failover |
| --- | --- | --- | --- |
| `embedded`, un nodo | Waterline, plano de control, salud, reconstrucción, exportación y archivo en un proceso de aplicación con una base duradera y una caché. | Proceso Laravel, base duradera y caché en un host. | La pérdida del host o base interrumpe el servicio. Restaure primero estado duradero, un nodo listo y el registro de workers antes de reanudar tráfico. |
| `embedded`, clúster pequeño en una región | Una base compartida, caché compartida para despertar, compatibilidad y configuración iguales y nodos activos en un mismo centro o región para acotar latencia de colas y temporizadores. | Base y caché compartidas, coordinación de despertar, balanceador y planificador o mantenimiento único. | Perder un nodo reduce capacidad, no corrección. Perder base bloquea tráfico; perder solo Redis degrada aceleración y avisa mientras el sondeo duradero preserva corrección. Failover del planificador y actualizaciones son procedimientos explícitos, no promesas de HA automática. |
| Distribución `standalone_server` | Consulte [Despliegues autogestionados](./deployment.md) y aplique las mismas distinciones de salud, estadísticas, exportación, archivo y colas mediante `/api/system/...`, `/api/workflows/...` o un Waterline de servicio separado. | Base y Redis compartidos, contenedores API, workers escalados aparte, observador Waterline opcional y planificador/mantenimiento único. | API y Waterline son reemplazables; la base, Redis y planificador definen el orden de recuperación. Restaure persistencia y verifique `/api/ready`, `/api/cluster/info` y registro antes de devolver tráfico. |
| `split_control_execution` | Mismo contrato que `standalone_server` con roles en sus clases propias: `ingress_node`, `control_plane_node`, `scheduler_node`, `matching_node`, `execution_node`. Mismas métricas, salud y comandos por nodo. Envíe lecturas administrativas al nodo propietario del rol. | La lista de [Topología de roles de Server](./polyglot/server-role-topology.md) indica qué subsistema falla primero. Base, Redis y elección del planificador único siguen siendo riesgos globales. | Mismo orden que `standalone_server`; verifique `topology.current_shape`, `topology.current_process_class` y `topology.current_roles` por nodo. Una ruta en una clase incorrecta devuelve `503 topology_role_unavailable`. |

`split_control_execution` no es otro motor ni producto. Tiene el mismo contrato que `standalone_server` con las clases por rol de `topology.shape_assignments`. El resto de la guía se aplica a ambos modos salvo que una sección nombre un rol específico. [Topología de roles de Server](./polyglot/server-role-topology.md) contiene el vocabulario, límites de autoridad y vía de migración.

Waterline en modo de servicio es un observador, no otra topología de Server. Añadirlo o eliminarlo no cambia `topology.current_shape`, la disponibilidad de API o CLI nativas ni el runtime propietario de una ejecución.

Publique en el procedimiento de su topología el orden de restauración, frecuencia de copias, retraso esperado de failover y comportamiento ligado a una región. El contrato del producto indica qué medir. El de su despliegue registra tiempos de recuperación, pasos manuales y dominios de fallo que acepta.

### Dominios de fallo por topología admitida {#failure-domain-checklist-by-supported-shape}

Use la tabla anterior como resumen y escriba el procedimiento con estos modelos de pérdida más explícitos:

- **Laravel integrado, un nodo**: un proceso controla juntos plano de control, asignación, proyección, planificador y ejecución. Perderlo interrumpe comandos duraderos, avance, disparo de programaciones y lecturas del operador hasta que la misma aplicación vuelva a estar lista con almacenamiento duradero intacto.
- **Laravel integrado, clúster pequeño en una región**: perder un nodo normal solo debería retirar una parte de la capacidad HTTP y de workers. Los demás siguen reclamando trabajo del almacén compartido. La base de datos compartida, el despertar por caché compartida y el nodo propietario del planificador o mantenimiento único son los principales límites de corrección de la flota.
- **Server independiente (`standalone_server`)**: perder un `server_http_node` debería detener la entrada y comandos solo en ese nodo. Workers sanos pueden terminar sus leases y otras API atender tráfico. Perder un `worker_node` debería aumentar pendientes, edad de cola o avisos de compatibilidad solo en `(connection, queue, compatibility)` afectados. Perder `scheduler_node` pausa nuevas programaciones y barridos sin invalidar workflows activos. Perder la base de datos interrumpe toda la flota. Perder solo Redis conserva el sondeo duradero, degrada `long_poll_wake_acceleration` y aumenta la latencia de descubrimiento hasta su reconexión.
- **Server con roles separados (`split_control_execution`)**: cada rol tiene su clase de proceso: `ingress_node`, `control_plane_node`, `scheduler_node`, `matching_node` y `execution_node`. Perder una clase degrada solo su rol: entrada detiene HTTP externo; plano de control rechaza comandos rápido mientras continúan los leases; asignación usa descubrimiento directo; planificador pausa programaciones y registra omitidas; ejecución acumula tareas listas sin perder estado. La base de datos sigue siendo una interrupción global. Perder solo Redis degrada la aceleración con el mismo sondeo de base de datos y advertencia de disponibilidad que `standalone_server`.

Si su despliegue depende de otros supuestos, trate esa topología como un procedimiento independiente con contrato validado propio, en vez de asumir que la guía autoservicio se aplica sin cambios.

### Paquete de recuperación por topología {#published-recovery-packet-by-topology}

Las topologías admitidas solo están listas para producción cuando el procedimiento de despliegue publica su paquete de recuperación correspondiente:

| Topología | Datos que debe publicar el operador |
| --- | --- |
| `embedded`, un nodo | Calendario de copias de base, expectativas de conservación de caché, revisión exacta y snapshot de entorno/configuración para restaurar, retraso máximo aceptado y evidencia del último ensayo correcto. |
| `embedded`, clúster pequeño en una región | Todo el paquete de un nodo, más el propietario actual del planificador o mantenimiento, impacto previsto de perder un nodo frente a base o caché compartidas y pasos para restaurar la coordinación de despertar. |
| Distribución `standalone_server` | Frecuencia de copias de base y Redis, imagen/digest fijado, ubicación de credenciales, failover previsto de `server_http_node`, `worker_node`, `scheduler_node`, última verificación de restauración con `/api/ready` y `/api/cluster/info` y última prueba de nuevo registro de workers. |
| Distribución `split_control_execution` | Todo el paquete `standalone_server`, más escalado y fallos esperados por clase `ingress_node`, `control_plane_node`, `scheduler_node`, `matching_node`, `execution_node` y reglas para redirigir al recibir `503 topology_role_unavailable` desde un nodo incorrecto. |

Si falta ese paquete, está obsoleto o no se ha probado, considere la topología apta solo para desarrollo, independientemente del número de nodos activos.

### Verificar la identidad de topología antes de confiar en la referencia {#verify-live-topology-identity-before-trusting-the-baseline}

En despliegues independientes o con roles separados, confirme primero la identidad que publica el propio nodo antes de interpretar fallos de cola, planificador o roles. `GET /api/cluster/info` es su referencia autoritativa:

| Campo | Uso |
| --- | --- |
| `topology.current_shape` | Confirma si el nodo anuncia `embedded`, `standalone_server` o `split_control_execution`. |
| `topology.current_roles` | Confirma los roles lógicos que aloja realmente el nodo. |
| `topology.supported_shapes` | Confirma qué topologías admite públicamente la compilación actual. |
| `topology.shape_assignments` | Asocia cada topología admitida a conjuntos de roles por clase de proceso para compararlos con el nodo actual. |

Use esos campos como primera comprobación de divergencia de topología durante los despliegues:

- En Server independiente autoservicio, los nodos API deben seguir anunciando `api_ingress`, `control_plane`, `matching` y `history_projection`; los nodos de planificador, `scheduler`; y los workers, `execution_plane`.
- En roles separados, compruebe que `current_roles` de cada nodo coincida con un conjunto documentado de `shape_assignments` antes de atribuir retrasos de cola o planificador a un worker.
- Si `current_roles` no coincide con el plan, considere dudosas las referencias de cola y failover hasta corregir la identidad del nodo.

Las instalaciones integradas no publican `/api/cluster/info`. Para ver la topología local, ejecute `php artisan workflow:v2:doctor --json` e inspeccione `topology`. Publica el mismo esquema y contiene `current_shape`, `current_process_class`, `current_roles`, `execution_mode` y el resumen anidado `matching_role` de la aplicación.

## Diagnósticos bloqueantes y orientativos {#blocking-and-advisory-diagnostics}

Durable Workflow v2 distingue diagnósticos bloqueantes y orientativos.

| Gravedad | Significado | Acción habitual |
| --- | --- | --- |
| Bloqueante | La configuración o disponibilidad actual no es segura para el tráfico v2 | Detenga el despliegue, corrija el requisito y verifique de nuevo |
| Orientativa | La interfaz sigue siendo legible, pero algunos datos derivados necesitan reconstrucción, rellenado o revisión antes de confiar en ellos | Mantenga tráfico cuando corresponda y repare la interfaz indicada |
| Sana | No se detectó un problema actual en la interfaz | Continúe la operación normal |

Aplique esa regla a las interfaces publicadas:

- `workflow:v2:doctor --strict` bloquea si los problemas de capacidad del backend tienen gravedad `error`, como un controlador de cola no admitido en modo de cola o caché sin bloqueos. Los diagnósticos informativos de cola en modo de sondeo siguen siendo orientativos.
- `GET /waterline/api/v2/health` devuelve:
  - `status = ok` si la interfaz operativa v2 está lista y las comprobaciones actuales concuerdan.
  - `status = warning` si sigue siendo legible pero hay datos que deben reconstruirse, completarse o repararse antes de confiar plenamente en ellos.
  - `status = error` con HTTP `503` si el puente al motor no está listo o un problema bloqueante de capacidad impide la interfaz v2.
- `GET /waterline/api/stats` publica datos operativos duraderos. Use sus campos JSON como diagnósticos para paneles y scripts, no como un endpoint de recolección de métricas.

## Comprobaciones de corrección y aceleración {#correctness-vs-acceleration-checks}

Cada comprobación v2 tiene `category` igual a `correctness` o `acceleration`. El snapshot publica un resumen por categoría para responder a ambas preguntas sin volver a agregar la lista.

- **Comprobaciones de corrección**: indican si funcionan el descubrimiento de tareas duraderas listas, las proyecciones actualizadas, el rellenado de contratos de comandos, retención, compatibilidad de workers y capacidades del backend. `status = error` significa riesgo para la reclamación segura o el estado de confianza del operador. Detenga despliegues hasta resolverlo.
- **Comprobaciones de aceleración**: indican si la propagación opcional de señales de despertar mantiene el ritmo. El sondeo duradero garantiza la corrección. Por eso `status = warning` en aceleración puede aumentar la latencia entre nodos sin dejar tareas abandonadas.

Cada entrada de `checks` incluye `category`, y el snapshot añade `categories` para resumir ambas cuestiones de un vistazo:

```json
{
  "status": "warning",
  "categories": {
    "correctness": {"status": "ok", "check_count": 8},
    "acceleration": {"status": "warning", "check_count": 1}
  }
}
```

Una degradación de `acceleration` afecta solo a la aceleración: investigue la caché o el backend de despertar sin bloquear tráfico que solo depende del descubrimiento duradero. La degradación de `correctness` es la señal bloqueante. `long_poll_wake_acceleration` es la entrada canónica de aceleración y nunca supera `warning`. Todas las demás son de corrección.

## Semántica de salud de las colas {#queue-health-semantics}

La salud de colas se divide entre estado duradero y telemetría del worker/runtime.

### Datos duraderos de las colas {#durable-queue-facts}

Use las estadísticas y vistas de cola de Waterline para el estado duradero de tareas:

| Dato | Significado |
| --- | --- |
| `operator_metrics.backlog.runnable_tasks` | Tareas duraderas listas para reclamarse ahora. |
| `operator_metrics.backlog.delayed_tasks` | Tareas duraderas existentes que aún esperan a `available_at`. |
| `operator_metrics.backlog.leased_tasks` | Tareas duraderas reclamadas actualmente por un worker. |
| `operator_metrics.backlog.tasks_added_last_minute` | Filas duraderas de tarea distintas creadas en los últimos 60 segundos. Mide la entrada duradera, no intentos del transporte. |
| `operator_metrics.backlog.tasks_dispatched_last_minute` | Filas distintas cuyo último `last_dispatched_at` correcto cae en los últimos 60 segundos. Compare con `tasks_added_last_minute` para detectar entrada mayor que despacho. |
| `operator_metrics.starts.pending_runs`, `operator_metrics.starts.pending_commands`, `operator_metrics.starts.ready_tasks`, `operator_metrics.starts.oldest_pending_start_at`, `operator_metrics.starts.max_pending_ms` | Pendientes duraderos de inicio. Distinguen inicios aceptados que aún no producen tareas de workflow activas del retraso normal del worker. |
| `operator_metrics.tasks.oldest_ready_due_at`, `operator_metrics.tasks.max_ready_due_age_ms` | Tarea actualmente ejecutable más antigua y edad de espera de despacho. Son el par legible por máquina detrás de la tarea lista más antigua. |
| `operator_metrics.tasks.dispatch_overdue`, `operator_metrics.tasks.oldest_dispatch_overdue_since`, `operator_metrics.tasks.max_dispatch_overdue_age_ms` | Tareas duraderas listas sin despertar de despacho correcto y edad de la más antigua. Detectan aceleración del notificador degradada sin confundirla con crecimiento normal de cola. |
| `operator_metrics.backlog.unhealthy_tasks` | Tareas duraderas con fallo de despacho, reclamación, despacho vencido o lease caducado. |
| `operator_metrics.backlog.repair_needed_runs` | Ejecuciones abiertas sin una ruta duradera de reanudación fiable actualmente. |
| `operator_metrics.tasks.oldest_lease_expired_at`, `operator_metrics.tasks.max_lease_expired_age_ms` | Lease caducado más antiguo y su edad. Indicador principal de leases atascados y riesgo de duplicación. |
| `operator_metrics.backlog.oldest_compatibility_blocked_started_at`, `operator_metrics.backlog.max_compatibility_blocked_age_ms` | Bloqueo de enrutamiento por compatibilidad más antiguo y su edad. Úselo cuando el trabajo se conserva pero no hay worker compatible elegible. |
| Sondeadores activos y obsoletos | Indica si los workers registrados aún envían heartbeats para una cola. |
| Leases actuales | Qué tareas de workflow o actividad tienen lease y si ha caducado. |

Estos datos solo describen tráfico duradero de tareas de workflow y actividad.

Para profundizar en una cola en vez de toda la flota, use las rutas de visibilidad de colas de Server para edad del trabajo pendiente, sondeadores, leases actuales, presupuestos de admisión, `stats.tasks_added_last_minute` y `stats.tasks_dispatched_last_minute`. Compare entrada y despacho locales para identificar la cola que acumula trabajo o carece de capacidad. Use los campos globales `operator_metrics.backlog.*` anteriores para la comparación agregada.

`GET /waterline/api/v2/health` de Waterline publica el mismo detalle por cola en `queue_visibility.*` para el namespace configurado. Estas familias forman el contrato tipado de salud de colas:

| Familia de campos | Significado |
| --- | --- |
| `queue_visibility.available`, `queue_visibility.reason` | Si Waterline puede producir visibilidad por cola para el namespace configurado y el motivo cuando no puede. |
| `queue_visibility.task_queues[].stats.approximate_backlog_count`, `queue_visibility.task_queues[].stats.approximate_backlog_age` | Recuento de pendientes local de la cola y edad de los pendientes duraderos más antiguos. |
| `queue_visibility.task_queues[].stats.tasks_added_last_minute`, `queue_visibility.task_queues[].stats.tasks_dispatched_last_minute` | Entrada duradera y despacho por cola en los últimos 60 segundos. Muestra una cola caliente oculta por totales globales sanos. |
| `queue_visibility.task_queues[].stats.pollers.active_count`, `queue_visibility.task_queues[].stats.pollers.stale_count`, `queue_visibility.task_queues[].stats.pollers.stale_after_seconds` | Sondeadores sanos y obsoletos de esa cola y umbral de heartbeat que usó el snapshot. |
| `queue_visibility.task_queues[].stats.workflow_tasks.*`, `queue_visibility.task_queues[].stats.activity_tasks.*` | Recuentos de tareas listas, con lease y lease caducado separados entre workflows y actividades. |
| `queue_visibility.task_queues[].repair.candidates`, `dispatch_failed`, `expired_leases`, `dispatch_overdue` | Presión de reparación: tareas que ya necesitan reparación, fallaron al despachar, tienen leases caducados o requieren un nuevo despacho vencido. |
| `queue_visibility.task_queues[].repair.oldest_dispatch_failed_at`, `max_dispatch_failed_age_ms`, `oldest_lease_expired_at`, `max_lease_expired_age_ms`, `oldest_dispatch_overdue_since`, `max_dispatch_overdue_age_ms` | Edades locales de los fallos de despacho, leases caducados y tareas con despacho vencido más antiguos. |

`coordination_alerts[]` en el mismo `GET /waterline/api/v2/health` resume para el operador esos datos por cola y la lista de comprobaciones. Úselo como resumen de avisos y errores listo para mostrar y profundice en las entradas correspondientes de `queue_visibility` o `checks`.

El estado de admisión por cola es la señal principal de slots y sondeadores. `saturated` significa que hay workers activos pero todos los slots registrados tienen lease. `throttled` significa que un límite de leases o despacho retiene trabajo a propósito. `no_slots` indica workers registrados sin capacidad para ese tipo de tarea. `no_active_workers` indica ausencia de sondeadores sanos. `unavailable` indica que una protección de admisión con bloqueo no puede demostrar seguridad actualmente.

Use `operator_metrics.starts.*` si los inicios parecen atascados aunque el retraso estable de las colas parezca normal. Distinguen la admisión del inicio y la creación de la primera tarea de su posterior reclamación por un worker.

### Presión de sondeo y presupuestos de admisión {#poller-pressure-and-admission-budgets}

Use el detalle de colas o `dw task-queue:describe` si empeora el flujo y necesita distinguir capacidad insuficiente, limitación intencional de Server y ausencia total de sondeadores:

| Estado de cola | Significado | Interpretación |
| --- | --- | --- |
| `accepting` | Quedan slots libres y no se alcanzó ningún límite de Server. | Referencia sana. |
| `saturated` | Todos los slots registrados tienen lease. | Presión de capacidad de workers. |
| `throttled` | Un límite de leases activos o ritmo de despacho de Server retiene la cola a propósito. | Orientativo salvo límite inesperado o pendientes que superen la referencia publicada. |
| `no_slots` | Hay workers activos registrados pero ninguno anuncia slots para ese tipo de tarea. | Bloqueante para la cola. |
| `no_active_workers` | Ningún sondeador sano atiende actualmente la cola. | Bloqueante para la cola. |
| `unavailable` | La cola no puede adquirir el bloqueo requerido por su ruta de admisión. | Bloqueante hasta recuperar esa dependencia. |

Use estos estados junto con los datos del flujo:

- `tasks_added_last_minute > tasks_dispatched_last_minute` junto con `saturated` significa que la entrada duradera supera la capacidad de los workers.
- El mismo desequilibrio junto con `throttled` significa que un límite explícito de Server retiene la cola. Evalúelo según el contrato previsto de ese límite, no como rendimiento sin restricciones.
- Si aumenta la edad de la tarea lista más antigua junto con `no_active_workers` o sondeadores obsoletos, la cola perdió reclamantes sanos. Trátelo como una interrupción de enrutamiento de ese ámbito.

### Despliegue del rol de asignación {#matching-role-deployment-shape}

Use `operator_metrics.matching_role.*` para confirmar qué contrato de asignación y despacho sirve realmente el nodo actual:

| Dato | Significado |
| --- | --- |
| `operator_metrics.matching_role.queue_wake_enabled` | Si el nodo aún ejecuta el despertar por sondeo amplio dentro del bucle del worker de cola. |
| `operator_metrics.matching_role.shape` | `in_worker` si el nodo conserva ese despertar; `dedicated` si espera un proceso separado de `workflow:v2:repair-pass --loop` para el barrido. |
| `operator_metrics.matching_role.task_dispatch_mode` | Modo usado para tareas listas: `queue` o `poll`. |
| `operator_metrics.matching_role.partition_primitives` | Ejes fijados de enrutamiento, en orden: `connection`, `queue`, `compatibility`, `namespace`. |
| `operator_metrics.matching_role.backpressure_model` | Límite duradero de admisión que aplica el motor. V2 informa `lease_ownership`. |

Estos campos son locales al nodo, no globales. En un despliegue con formas mixtas, lea el snapshot de cada nodo o pod al que cambia tráfico para confirmar dónde quedó el rol de asignación antes de interpretar cambios de pendientes o sondeadores como salud del worker.

### Telemetría de workers y SDK {#worker-and-sdk-telemetry}

Use métricas, trazas y registros de workers para:

- Latencia `schedule_to_start` de workflows y actividades
- Tasa de sondeos correctos y despacho síncrono o anticipado
- Tamaño y expulsiones de caché sticky
- Presión de CPU, memoria, hilos y bucle de eventos del worker
- Métricas propias emitidas por actividades o código del worker

Las consultas síncronas, herramientas de depuración en vivo y otras llamadas no duraderas del plano de control deben etiquetarse por separado. No cuentan como tareas duraderas pendientes ni cambian los contadores de reparación de Waterline.

## Compatibilidad de workers y salud del despliegue {#worker-compatibility-and-rollout-health}

`operator_metrics.workers` publica los datos de compatibilidad que determinan si la flota activa puede ejecutar de forma segura el contrato de workflow requerido:

| Dato | Significado |
| --- | --- |
| `operator_metrics.workers.required_compatibility` | Marcadores que un worker debe anunciar para ser elegible en el namespace. |
| `operator_metrics.workers.active_workers` | Workers activos distintos vistos mediante heartbeat de compatibilidad. |
| `operator_metrics.workers.active_worker_scopes` | Cantidad de ámbitos `(connection, queue)` cubiertos. |
| `operator_metrics.workers.active_workers_supporting_required` | Workers cuya compatibilidad anunciada incluye los marcadores requeridos. |
| `operator_metrics.workers.fleet` | Lista por ámbito de cada worker activo con `worker_id`, `connection`, `queue`, marcadores `supported`, indicador `supports_required`, `source` del heartbeat (`database` o `cache`) y `recorded_at`. |

Use los recuentos para detectar workers que no pueden reclamar el trabajo con seguridad y profundice en `fleet` para localizar el ámbito `(connection, queue)` sin cobertura. Waterline muestra la misma lista en su panel de compatibilidad, sin consultar manualmente la interfaz de métricas.

Cuando `active_workers_supporting_required` llega a cero para un namespace, Waterline muestra `no_compatible_worker_for_task` en las ejecuciones afectadas, tanto en detalle como en métricas. La comprobación `worker_compatibility` pasa a `warning` en `correctness`, y su resumen también pasa a `warning` para que el hueco de cobertura sea visible de inmediato.

Consulte [Desplegar builds de workers con build IDs](./polyglot/worker-build-id-rollout.md) para el flujo de drenaje y reanudación que coordina esos datos, y [Compatibilidad y enrutamiento de workers](./polyglot/worker-compatibility-routing.md) para el contrato de fijación de ejecuciones que sustenta los diagnósticos.

## Semántica de las alertas {#alert-semantics}

Los umbrales dependen del despliegue. Publique referencias numéricas propias para edad de cola, retraso de reparación, cobertura de workers y tiempos de restauración. Alerte cuando el contrato siguiente siga incumpliéndose más de una ventana normal de reparación o watchdog de su topología.

| Familia de alerta | Origen | Interpretación | Escalar cuando | Respuesta |
| --- | --- | --- | --- | --- |
| Disponibilidad bloqueante | `workflow:v2:doctor --strict`, `GET /waterline/api/v2/health` | Bloqueante | `doctor --strict` devuelve error o salud devuelve `status = error` / HTTP `503` | Detenga el despliegue o cambio de tráfico, corrija el requisito y repita disponibilidad y compatibilidad. |
| Cobertura de workers compatibles | `operator_metrics.workers.*`, salud `worker_compatibility`, diagnóstico `no_compatible_worker_for_task` | Bloqueante | `active_workers_supporting_required = 0` para un namespace o ámbito `(connection, queue)` requerido | Drene los incompatibles, registre compatibles y confirme que se resuelve el resumen `correctness` antes de confiar en nuevas reclamaciones. |
| Retraso duradero de cola | Vistas de cola de Waterline, `operator_metrics.backlog.*`, telemetría `schedule_to_start` | Bloqueante si persiste; orientativo si es breve | La edad de tarea lista o latencia supera la referencia publicada aunque haya workers compatibles | Añada capacidad, inspeccione admisión y confirme avance del planificador y asignación. |
| Presión de sondeo y saturación de admisión | Detalle de colas, `dw task-queue:describe`, `status`, sondeadores obsoletos y tasas de entrada/despacho | Bloqueante en `no_active_workers`, `no_slots`, `unavailable`; orientativo en `throttled` intencional | La cola permanece `saturated` mientras aumentan la edad y la brecha de entrada/despacho, o aparece `no_active_workers`, `no_slots`, `unavailable` fuera de mantenimiento | Añada slots, restaure la cohorte ausente o confirme límites y dependencia de bloqueo antes de escalar a ciegas. |
| Inicios de workflow pendientes | `operator_metrics.starts.*`, telemetría de inicio del plano de control y `schedule_to_start` de primeras tareas | Bloqueante si persiste; orientativo si es breve | `pending_commands`, `ready_tasks` o `max_pending_ms` superan la referencia aunque haya workers compatibles y capacidad | Inspeccione de extremo a extremo: transformación de comandos en tareas, primera tarea pronta por asignación/despacho y separación del retraso de inicio frente al general. |
| Divergencia de proyecciones y deuda de reparación | Salud `run_summary_projection` / `selected_run_projections`, `operator_metrics.repair.*` | Orientativa | La divergencia dura más de la ventana prevista de reconstrucción o sigue subiendo la edad máxima | Previsualice reconstrucción/reparación, ejecútela y confirme que avisos y edades vuelven a la referencia. |
| Tormenta de reintentos o errores | `operator_metrics.backlog.unhealthy_tasks`, diagnósticos duraderos de ejecución y telemetría de errores | Orientativa, bloqueante si impide el avance duradero | Fallos de despacho, reclamación, leases caducados o intentos agotados superan la referencia de forma sostenida | Inspeccione la familia de tareas, compare telemetría y errores duraderos y decida si drenar tráfico o aislar la cola. |
| Aceleración de despertar degradada | Salud `long_poll_wake_acceleration` y resumen `acceleration` | Orientativa | El aviso persiste tras las ventanas de mantenimiento de caché o notificador | Investigue caché y propagación. No lo trate como fallo de corrección salvo que también se degrade `correctness`. |

El objetivo es avisar ante riesgos del contrato duradero, no ante cada señal transitoria. Las alertas de colas y workers solo deben bloquear cuando amenacen el contrato operativo de la topología real.

## Expectativas de reconstrucción, reparación y restauración {#rebuild-repair-and-restore-expectations}

Siga estas comprobaciones en orden cuando la interfaz operativa informe de divergencia:

1. Compruebe `GET /waterline/api/v2/health`.
   - `run_summary_projection` y `selected_run_projections` indican que Waterline responde, pero algunos datos de listas o detalle necesitan reconstrucción.
   - `command_contract_snapshots` indica ejecuciones antiguas que aún necesitan completar el contrato WorkflowStarted antes de confiar en formularios de señales, actualizaciones o consultas.
   - `durable_resume_paths` indica ejecuciones abiertas que necesitan reparación antes de confiar en su próxima fuente de reanudación proyectada.
2. Previsualice la reconstrucción con:

   ```bash
   php artisan workflow:v2:rebuild-projections --needs-rebuild --dry-run
   ```

3. Reconstruya las proyecciones afectadas:

   ```bash
   php artisan workflow:v2:rebuild-projections --needs-rebuild
   ```

4. Previsualice el rellenado de contratos de comandos:

   ```bash
   php artisan workflow:v2:backfill-command-contracts --dry-run
   ```

5. Complete los contratos cuando la clase actual de workflow siga disponible:

   ```bash
   php artisan workflow:v2:backfill-command-contracts
   ```

6. Use `--prune-stale` solo después de que la retención haya eliminado filas duraderas intencionalmente y quiera borrar proyecciones cuya ejecución o fila de historial duradera ya no exista.

`operator_metrics.repair.*` publica el alcance del bucle de reparación. Use recuentos de candidatos y seleccionados, edad máxima y presión del límite de búsqueda para decidir si la reparación está dentro de su referencia o requiere investigar capacidad.

### Retención y divergencia de proyecciones {#retention-and-projection-drift}

Con Workflow 2.6.3 o posterior, una ejecución retenida con `details_pruned_at` no cuenta como resumen ausente, deuda de reconstrucción ni edad de resumen ausente. Aún cuenta en el total `runs` del informe. Todos los modos de reconstrucción la omiten, incluso la selección explícita de ejecución o instancia, para no restaurar la fila eliminada ni devolverla a la selección de retención.

Una ejecución sin marca y sin resumen sigue indicando divergencia. Un historial vacío por sí solo no demuestra que un trabajo antiguo lo depurara. Confirme la limpieza intencional mediante un registro autoritativo antes de corregir. Reconstruir proyecciones no recupera historial eliminado. Use una copia de seguridad adecuada si lo necesita.

Los runtimes anteriores pueden indicar falsamente que ejecuciones marcadas y depuradas carecen de resumen. Actualice el runtime antes de reconstruir para atender ese aviso. Tras una pasada de retención, compruebe que `run_summary_projection` esté en `ok`, `projections.run_summaries.needs_rebuild` sea cero y que las pasadas posteriores no seleccionen las mismas ejecuciones. La pérdida real de proyecciones aún necesita reparación.

## Verificación de exportación y archivado {#export-and-archive-verification}

Exportar y archivar sirven para fines distintos:

- **Exportar historial** crea un artefacto de replay, depuración o archivo.
- **Archivar** marca una ejecución cerrada para retirarla de las vistas activas de la flota.
- **Depurar** elimina filas de proyección o duraderas después de vencer la retención.

Use esta secuencia de verificación:

1. Exporte la ejecución seleccionada:

   ```bash
   php artisan workflow:v2:history-export <workflow-instance-id> --run-id=<workflow-run-id> --output=storage/app/workflow-history/run.json --pretty
   ```

2. Verifique el id de ejecución esperado, versión del esquema y metadatos de ocultación configurados del paquete.
3. Verifique los bytes externos referenciados y consérvelos durante toda la vida requerida del artefacto. Siga el [procedimiento de exportación previo al borrado](./configuration/pruning-workflows.md#export-before-pruning) para inventariar cada ejecución cerrada y detectar copias ausentes.
4. Archive solo si quiere conservar la ejecución en la base de datos. Server omite las archivadas y no tiene API para desarchivar. La limpieza integrada es de la aplicación y no requiere archivar primero.
5. Depure los detalles elegibles mediante el proceso de retención propietario. Conserve los registros terminales de ejecución e instancia. Reconstruir proyecciones no restaura historial eliminado y omite las ejecuciones marcadas como depuradas.

Las rutas correspondientes de exportación y archivo para Waterline figuran en la [referencia de su API de operador](./waterline-operator-api.md).

## Contrato de copia, restauración y recuperación ante desastres {#backup-restore-and-disaster-recovery-contract}

Copias, restauración y recuperación ante desastres forman parte del contrato operativo, no de un procedimiento privado opcional. Publique y ensaye estos datos para cada topología admitida:

1. Conjunto de copia duradera: base de datos, referencia de imagen de Server o aplicación, archivo de entorno o configuración, ubicación de credenciales y topología o notas exactas para reconectar workers.
2. Objetivos de recuperación: retraso máximo de restauración aceptado, retraso de failover esperado y quién puede declarar seguro el tráfico.
3. Orden: persistencia duradera, caché, inicialización o migraciones, planificador o mantenimiento único, disponibilidad de API y registro de workers.
4. Verificación: `/api/ready` o `/waterline/api/v2/health`, `/api/cluster/info` cuando corresponda, un registro representativo de worker y una exportación representativa del estado restaurado.
5. Reparación posterior: reconstruya proyecciones, complete contratos si hace falta y confirme que métricas de cola, compatibilidad y reparación vuelvan a la referencia antes de declarar sano el entorno.

La operación multirregión y split-brain siguen fuera del ámbito 2.0 admitido. La [guía de autogestión](/docs/deployment#activepassive-multi-region) conserva arquitectura y procedimientos activo/pasivo solo para evaluación con soporte. No garantiza replicación, failover, retorno, RPO o RTO autoservicio. El [contrato actual de Cloud](/docs/polyglot/cloud-control-plane) opera cada namespace en una región gestionada y tampoco promete replicación multirregión, failover regional o retorno.

La frecuencia de ensayos también forma parte del contrato público. Como mínimo, ensaye la secuencia documentada:

- Antes del primer despliegue de producción para una topología
- Tras cambios en copias, esquema o arranque, autenticación o topología
- Con una frecuencia periódica publicada junto con el calendario de copias

Si no puede mostrar la fecha del último ensayo correcto, el tiempo transcurrido de restauración y su verificación, las copias y recuperación siguen sin estar demostradas para esa topología.

## Ámbito de las pruebas de rendimiento {#benchmark-envelope}

Durable Workflow v2 publica qué dimensiones debe medir en su entorno. Registre estas referencias en pruebas o canary antes de que el tráfico de producción dependa de ellas:

| Dimensión | Referencia que medir | Origen |
| --- | --- | --- |
| Salud de proyecciones | `needs_rebuild = 0` estable, duración tras divergencia intencional y tiempo de limpieza de huérfanas/obsoletas | `/waterline/api/v2/health`, `/waterline/api/stats`, `workflow:v2:rebuild-projections` |
| Presión de colas | Edad de pendientes y tareas listas, recuentos listos/retrasados, tasa de entrada/despacho, edad de despacho vencido, sondeadores obsoletos y admisión (`accepting`, `saturated`, `throttled`, `no_slots`, `no_active_workers`) | Estadísticas y colas Waterline, `operator_metrics.backlog.*` / `operator_metrics.tasks.*` |
| Latencia de inicio de workflow | Inicios aceptados esperando la primera tarea, edad del inicio pendiente más antiguo y primera reclamación tras admisión | `operator_metrics.starts.*` y telemetría `schedule_to_start` del worker |
| Latencia de programación a inicio | Espera de workflows y actividades desde su entrada en cola hasta el inicio | Métricas de SDK de workers |
| Despertar de temporizadores masivos | Propagación de señales y retraso entre disparo programado y visibilidad de tareas listas durante ráfagas | Telemetría de workers y comprobaciones de coordinación en la misma región |
| Coste del barrido de reparación | Candidatos, seleccionados, edad máxima de candidato y ejecución ausente y presión de búsqueda | `operator_metrics.repair.*` |
| Presión del historial | Cantidad de eventos, tamaño de historial y umbrales de recomendación de continue-as-new | `operator_metrics.history.*` |

Son dimensiones de medición, no promesas universales de latencia. Publique intervalos aceptables propios para su topología.

## Evidencia de pruebas prolongadas {#long-soak-evidence}

Las mediciones puntuales no bastan. Antes de confiar tráfico sostenido a una topología, mantenga un paquete de pruebas prolongadas que muestre que el sistema respetó sus límites declarados a lo largo del tiempo.

Incluya como mínimo:

- Carga: topología, imagen de Server o revisión de aplicación, build ids de workers, colas, caché, base de datos y mezcla representativa de inicios, temporizadores, actividades, consultas y exportaciones
- Ventana: inicio y fin, con duración suficiente para una ventana normal de reparación, una pasada de retención o archivo si corresponde y una variación representativa del tráfico del ciclo de negocio
- Estabilidad de colas: edad de pendientes, tareas listas e inicios pendientes, tasas de entrada y despacho y sondeadores obsoletos dentro de la referencia publicada
- Estabilidad de corrección: sin `status = error` sostenido en `GET /waterline/api/v2/health`, crecimiento inexplicado de `operator_metrics.repair.*` o huecos persistentes en `operator_metrics.workers.*`
- Estabilidad de procesos y caché: memoria, CPU, presión del bucle de eventos o hilos y crecimiento de caché o cardinalidad acotados, sin aumento continuo bajo carga estable
- Recuperación: fecha de la última copia correcta, último ensayo de restauración, tiempo de restauración y comandos que demostraron la disponibilidad del entorno recuperado

Guarde el paquete donde los operadores puedan consultar el procedimiento. Si una topología publica cifras, alertas o tiempos de recuperación sin un paquete prolongado correspondiente, trátelos como provisionales y no como evidencia operativa fiable.

## Lista de comprobación integral del operador {#end-to-end-operator-checklist}

Use esta lista tras actualizaciones y antes de confiar en un entorno nuevo:

1. Ejecute `php artisan workflow:v2:doctor --strict`.
2. Compruebe `GET /waterline/api/v2/health` y si devuelve `ok`, `warning` o `error`.
3. Lea `GET /waterline/api/stats` para los datos de pendientes, reparación, historial, contratos de comandos, compatibilidad y divergencia de proyecciones.
4. Previsualice la reconstrucción o rellenado de contratos cuando la salud informe divergencia.
5. Exporte una ejecución representativa y verifique el artefacto de archivo/replay.
6. Confirme que las ejecuciones archivadas desaparecen de las vistas activas y que las filas duraderas permanecen hasta la limpieza de retención.
7. Ensaye la restauración o failover del procedimiento y compruebe que el retraso medido coincide con el esperado para su topología.

## Guías relacionadas {#related-guides}

- [Monitorización](./monitoring.md)
- [Referencia de la API de operador de Waterline](./waterline-operator-api.md)
- [Depuración de workflows](./configuration/pruning-workflows.md)
- [Despliegues autogestionados](./deployment.md)
