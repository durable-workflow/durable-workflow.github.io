---
sidebar_position: 26
title: Afinidad portable de workers
description: Compatibilidad y límites de afinidad de workers de servicio en los SDK PHP, Python y Rust.
tags:
  - workers
  - actividades
  - replay
  - multilenguaje
---

# Afinidad portable de workers {#portable-worker-affinity}

Los workers de servicio implementan las funciones indicadas mediante el protocolo de Server. Las versiones de los SDK y la configuración del worker determinan su disponibilidad.

Las actividades locales, sesiones de worker y ejecución sticky comparten una regla de portabilidad: el worker debe declarar cada función como compatible o rechazarla explícitamente. El protocolo `1.18` es el mínimo para estas declaraciones. Server rechaza una capacidad plana de enrutamiento si el manifiesto estructurado no declara la misma función como compatible.

## Compatibilidad de los SDK {#sdk-support}

| Worker del SDK | Actividades locales | Sesiones de worker | Ejecución sticky |
| --- | --- | --- | --- |
| PHP | Compatible | Compatible | Compatible |
| Python | Compatible desde 2.2.0 | Compatible desde 2.3.0 | Compatible desde 2.5.0 con `sticky_cache_capacity` mayor que cero |
| Rust | Compatible desde 3.1.0 con `Worker::local_activities(true)` | Compatible desde 3.2.0 con `Worker::worker_sessions(true)` | Compatible desde 3.4.0 con `Worker::sticky_cache(...)` |

Los workers anuncian solo capacidades implementadas y habilitadas en su perfil. Las actividades locales, sesiones y sticky de Rust y sticky de Python requieren activación explícita. Los SDK antiguos rechazan capacidades que no implementan. Los workflows normales y las actividades en cola usan replay completo del historial sin estas optimizaciones.

## Registro de actividades locales {#local-activity-recording}

Los workers PHP, Python y Rust con activación ejecutan una actividad local dentro del worker de workflow. La finalización de la tarea incluye argumentos, resultados de intentos, opciones de reintento y tiempo de espera, progreso de heartbeat y resultado o error terminal. Server registra esa secuencia de forma atómica como historial normal de actividad con `execution_mode=local`.

El replay consume el evento terminal registrado y no vuelve a invocar el manejador local. Si se pierde el worker antes de que Server confirme la finalización, el manejador puede ejecutarse de nuevo. Sus efectos externos deben ser idempotentes.

Los workers PHP normales ejecutan el manejador síncrono en línea. La cancelación y los tiempos de espera de heartbeat, por intento y total se observan antes de un intento, en `ActivityContext::heartbeat()` o después del retorno. Mantenga estos manejadores cortos y divida el trabajo bloqueante con puntos seguros de heartbeat.

Los callbacks asíncronos de Python y Rust deben ceder el control a su runtime. Rust renueva el lease exacto del workflow independientemente de los heartbeats de la aplicación, descarta el callback por tiempo de espera, pérdida de autoridad o apagado y registra informes acotados de intentos y heartbeats. Consulte el [ejemplo de actividad local Rust](https://github.com/durable-workflow/sdk-rust/blob/3.1.0/examples/local_activities.rs) y la [referencia API](https://rust.durable-workflow.com/durable_workflow/struct.LocalActivityOptions.html).

Los workers PHP que activan la [cancelación cooperativa](/docs/polyglot/cancellation) usan el protocolo 1.20 y procesos supervisados de callback para actividades locales preparadas. La ejecución local en línea de Rust usa otro perfil ordinario y no puede combinarse con supervisión local cooperativa preparada. Los callbacks bloqueantes necesitan supervisión de procesos para garantizar una parada física.

## Ciclo de vida de las sesiones de worker {#worker-session-lifecycle}

Los SDK PHP, Python y Rust ofrecen opciones tipadas de sesión y operaciones para crear, usar, renovar y cerrar. Las opciones incluyen requisitos, cola, duración del lease, TTL total, máximo de actividades simultáneas y política de readquisición. El worker cierra sus sesiones durante un apagado ordenado.

Si desaparece el titular, caducan su lease y reserva de concurrencia. Un nuevo titular puede readquirir la sesión cuando coinciden los requisitos, pero debe reconstruir los recursos locales antes de la primera actividad. La identidad de sesión no hace duradera la memoria del proceso.

La readquisición conserva el TTL absoluto original. Renovar amplía la autoridad del titular sin ampliar ese TTL. Use Server 2.5.1 o posterior para conservarlo y registrar el enrutamiento de sesión durante replay en frío. Consulte el [ejemplo de sesión Rust](https://github.com/durable-workflow/sdk-rust/blob/3.2.0/examples/worker_sessions.rs) y [WorkerSessionOptions](https://rust.durable-workflow.com/durable_workflow/struct.WorkerSessionOptions.html).

## Ejecución sticky y replay en frío {#sticky-execution-and-cold-replay}

Las cachés PHP, Python y Rust están acotadas y usan como clave exacta el ID de workflow, de ejecución y de compilación del worker. Informan `hit`, `miss`, `eviction` y `forced_cold_replay`. Caducidad, expulsión, reemplazo, pérdida del titular o compilación incompatible descartan la optimización y reproducen el historial completo.

Use Python SDK 2.5.0 con Server 2.5.10 o posterior. La caché está desactivada por defecto. Actívela con `sticky_cache_capacity` y establezca el máximo de bytes de historial retenido y el TTL. Almacena historial duradero codificado y puede reutilizar cursores de página validados para evitar descargas repetidas. Reserve memoria adicional para decodificación y replay determinista. Consulte la [guía y el ejemplo de sticky en Python](https://python.durable-workflow.com/guides/sticky-execution/).

Rust SDK 3.4.0 admite la misma base publicada de Server. Active su caché con `Worker::sticky_cache(StickyCacheOptions::new(...))` y configure el límite de bytes de historial codificado y el TTL. Cada replay decodifica un snapshot nuevo. Los cursores reutilizados se comprueban con el lease actual y el historial antes de aceptar un acierto. La caché conserva historial, no instancias vivas ni recursos de sesión. Consulte [StickyCacheOptions](https://rust.durable-workflow.com/durable_workflow/struct.StickyCacheOptions.html) y el [ejemplo Rust ejecutable](https://github.com/durable-workflow/sdk-rust/blob/3.4.0/examples/sticky_execution.rs).

Server 2.5.10 conserva replay completo para SDK PHP anteriores a 2.2.0. Use PHP SDK 2.2.0 o posterior para consumir pistas de replay de historiales que empiezan con StartAccepted.

La afinidad sticky no reserva tareas listas para el propietario ni le da prioridad. Un worker elegible puede reclamarlas mientras la afinidad de otro worker activo esté vigente, incluso sin slots libres en el propietario. Esa reclamación se marca `forced_cold_replay`. Aumentar el TTL no hace que la selección espere al propietario.

Un replay en frío forzado indica que la optimización de caché no estaba disponible. No es un error de corrección del workflow. El código debe seguir siendo determinista con caché vacía. Consulte las [reglas de selección y diagnóstico](/docs/features/sticky-execution#routing-identity).

## Valores seguros y flotas con actualizaciones graduales {#safe-defaults-and-rolling-fleets}

Los workflows normales no necesitan configurar sesiones ni sticky. Las flotas con versiones mixtas rechazan operaciones incompatibles en el mínimo de protocolo: Server comprueba versión negociada, capacidad plana, manifiesto estructurado e identidad exacta de caché antes de aceptar datos de finalización específicos.

El [manifiesto publicado de escenarios entre SDK](/platform-conformance/portable-worker-affinity-runtime-scenarios.json) cubre veracidad del manifiesto, replay de actividades locales, pérdida y readquisición del titular de sesión, aciertos y expulsión de caché, reemplazo del worker, replay en frío forzado y workflows sin configuración.

Para implementaciones integradas en Laravel, consulte [Actividades locales](/docs/features/local-activities), [Sesiones de worker](/docs/features/worker-sessions) y [Ejecución sticky](/docs/features/sticky-execution). Esas API pertenecen al paquete Workflow. Use la API del SDK correspondiente para workers de servicio.