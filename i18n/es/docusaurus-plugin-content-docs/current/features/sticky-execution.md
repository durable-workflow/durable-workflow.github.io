---
sidebar_position: 25
title: Ejecución sticky
description: Afinidad orientativa de tareas de workflow, cachés locales, selección normal y diagnósticos de replay en frío.
tags:
  - sticky-execution
  - replay
  - operaciones
keywords:
  - ejecución sticky
  - caché de replay sticky
  - recurso al replay en frío
  - enrutamiento worker_id
  - diagnósticos de caché sticky
---

# Ejecución sticky {#sticky-execution}

La ejecución sticky es una optimización de replay compatible con Durable Workflow v2. Un worker puede mantener una caché de workflow caliente y local al proceso después de completar una tarea. Si reclama una tarea posterior de la misma ejecución, puede reutilizar su caché válida. La afinidad no le reserva la tarea.

La ejecución sticky no garantiza la corrección. El avance del workflow solo se confirma mediante historial duradero y siempre es válido reproducir en frío desde ese historial. El código del workflow no debe depender de estado local al proceso para ser correcto.

## Resumen del contrato {#contract-summary}

La ejecución sticky ofrece cuatro garantías:

- Las cachés sticky pertenecen a los procesos de worker, no a Server ni a la base de datos.
- La afinidad sticky usa `worker_id` del protocolo de workers como identidad del propietario de la caché.
- La afinidad sticky es orientativa y caduca. El replay en frío es obligatorio ante fallos de caché, reinicio del worker, drenaje, actualización o expulsión.
- Los operadores disponen de controles y diagnósticos identificados para activación, TTL, capacidad, aciertos, fallos, replay en frío forzado y presión de capacidad.

Los campos duraderos de afinidad son `sticky_worker_id` y `sticky_until` en ejecuciones y tareas de workflow. Los campos de diagnóstico de tareas son `sticky_replay_mode` y `sticky_claimed_at`.

## Ciclo de vida de la caché sticky {#sticky-cache-lifecycle}

Una caché sticky es una estructura local del worker con el estado reproducido de uno o más workflows. Cuando un worker compatible completa una tarea, Server puede registrarlo como propietario sticky de la ejecución hasta `sticky_until`. Las tareas posteriores heredan esa afinidad al crearse.

El worker controla el contenido y la política de expulsión. Puede expulsar ejecuciones al alcanzar la capacidad, comenzar el drenaje, reiniciar, cambiar de compilación, detectar estado inseguro o liberar memoria. Server nunca considera duradero el contenido de la caché.

Si un worker recibe una tarea con afinidad sticky pero ya no tiene una entrada válida, debe hacer replay en frío del historial duradero. El lease de la tarea sigue siendo la única autoridad para confirmar avance del workflow.

## Identidad de enrutamiento {#routing-identity}

La identidad de enrutamiento es `worker_id` del protocolo. Los workers habilitan el enrutamiento sticky al registrarse con la caché activada y seguir enviando heartbeats como workers activos en la cola.

La afinidad sticky no añade preferencia por el propietario ni reserva exclusiva en la selección de tareas listas. El runtime PHP selecciona candidatos por prioridad, `available_at` y después ID de tarea. Server también puede redistribuir el lote entre claves de equidad dentro de una prioridad. Siguen aplicándose las comprobaciones normales de compatibilidad, tipo de workflow, cola, namespace, capacidad y lease.

Cualquier worker elegible que sondee puede reclamar la tarea antes de `sticky_until`, aunque otro worker activo tenga la afinidad. Si el propietario no tiene slots libres para workflows, otro puede reclamarla de inmediato y reproducir en frío. La tarea no espera a la caché del propietario ni a que caduque la afinidad. Subir el TTL no crea una reserva más larga.

`sticky_until` limita cuándo la afinidad almacenada está activa y cuándo una reclamación del propietario puede marcarse como `sticky_hit_expected`. No fija la disponibilidad de la tarea, amplía un lease ni garantiza que la caché local aún contenga la ejecución.

## Semántica del recurso al replay en frío {#fallback-semantics}

El replay en frío es obligatorio en estos casos:

- La ejecución sticky está desactivada.
- El worker no declaró compatibilidad con caché sticky.
- La tarea no tiene `sticky_worker_id` y `sticky_until` activos.
- El propietario sticky está obsoleto, ausente, drenando, reiniciado o actualizado.
- El propietario sticky expulsó la ejecución.
- Otro worker reclama la tarea, incluso con la afinidad del propietario aún activa.
- La afinidad caducó antes de reclamar la tarea.

Los diagnósticos de modo de replay son:

- `sticky_hit_expected`: el propietario sticky reclamó la tarea antes de la caducidad. El worker aún debe validar su caché local antes de usarla.
- `cold_replay`: no se aplicó afinidad sticky.
- `forced_cold_replay`: se registró un propietario sticky, pero otro worker reclamó la tarea o la afinidad caducó. Puede ocurrir aunque el propietario original esté sano.

`forced_cold_replay` no es un error de corrección. Significa que la ejecución sticky no aportó la mejora prevista en el coste de replay de esa tarea.

## Despliegue, drenaje y actualizaciones {#deployment-drain-and-rollout}

La ejecución sticky sigue el ciclo de vida del worker. Durante el drenaje, el worker debe dejar de reclamar tareas nuevas de workflow mientras completa, mantiene con heartbeat, falla o deja caducar leases existentes según el contrato normal. Otros workers compatibles pueden reclamar tareas listas y reproducirlas en frío sin esperar a que caduque la afinidad.

Los workers de reemplazo no heredan cachés locales. Por eso una actualización puede aumentar `forced_cold_replay` hasta que los nuevos workers calienten sus cachés. Use valores `worker_id` únicos por proceso o reinicio para distinguir al antiguo propietario de un proceso nuevo en los diagnósticos.

La compatibilidad por build-id y las huellas de definición del workflow siguen decidiendo si un worker puede ejecutar una tarea. Sticky nunca permite dirigir código incompatible a una ejecución.

## Controles del operador {#operator-controls}

La ejecución sticky se controla mediante configuración del workflow/runtime y capacidades del worker, no con variables independientes de la imagen de Server. La configuración del paquete expone la activación y el TTL de afinidad:

```php
'workflows' => [
    'v2' => [
        'sticky_execution' => [
            'enabled' => true,
            'ttl_seconds' => 300,
        ],
    ],
],
```

Cada worker anuncia la capacidad de caché al registrarse y en sus heartbeats. Puede desactivar el enrutamiento sticky en la configuración o ejecutar workers sin soporte de caché sticky sin cambiar la semántica del workflow. Las ejecuciones existentes continúan mediante replay en frío normal.

## Campos del protocolo de workers {#worker-protocol-fields}

Los workers compatibles anuncian el soporte al registrarse:

```json
{
  "worker_id": "orders-worker-01",
  "task_queue": "orders",
  "runtime": "python",
  "sticky_cache_enabled": true,
  "sticky_cache_capacity": 100
}
```

Los workers informan diagnósticos de caché en sus heartbeats:

```json
{
  "worker_id": "orders-worker-01",
  "sticky_cache": {
    "enabled": true,
    "capacity": 100,
    "size": 72,
    "hit_count": 940,
    "miss_count": 31,
    "forced_cold_replay_count": 8,
    "eviction_count": 15
  }
}
```

Las respuestas de sondeo de workflow incluyen `task.sticky_execution` con `sticky_worker_id`, `sticky_until`, `replay_mode` y `cache_directive`. Interprete `resume_if_present` como permiso para usar una caché caliente válida y haga replay en frío si la entrada falta o no es válida.

## Métricas y diagnósticos {#metrics-and-diagnostics}

Las métricas del operador incluyen:

- `sticky_execution.active_sticky_runs`
- `sticky_execution.ready_sticky_tasks`
- `sticky_execution.leased_sticky_tasks`
- `sticky_execution.hit_expected_last_minute`
- `sticky_execution.miss_last_minute`
- `sticky_execution.forced_cold_replay_last_minute`
- `sticky_execution.cold_replay_last_minute`
- `sticky_execution.hit_rate_last_minute`
- `sticky_execution.miss_rate_last_minute`
- `sticky_execution.capacity_pressure_tasks`

Server independiente también informa capacidad y tamaño de caché, aciertos, fallos, replay en frío forzado, expulsiones y cantidad de workers bajo presión de capacidad en `sticky_execution_workers`.

Use los diagnósticos así:

- `ready_sticky_tasks` cuenta tareas de workflow listas cuya afinidad registrada no ha caducado. No significa que estén reservadas para sus propietarios. `capacity_pressure_tasks` del runtime PHP informa actualmente el mismo recuento.
- Una tasa baja de aciertos esperados puede deberse a otros workers que reclaman tareas, caducidad del TTL, reemplazos o expulsiones de caché. Compare los IDs reclamantes y las métricas que informan los workers antes de cambiar TTL o capacidad.
- Muchos fallos de caché o replays en frío forzados indican que la corrección se conserva, pero sticky no reduce el coste de replay.
- La presión de caché informa de workers cerca o por encima de la capacidad anunciada. Es distinta de los slots libres de ejecución y de la cantidad de tareas listas.

## Código seguro para replay {#replay-safe-code}

El código debe comportarse igual con sticky y replay en frío. Las decisiones deben usar historial duradero: entradas, resultados de actividad, temporizadores, señales, actualizaciones, efectos registrados y marcadores de versión. Las proyecciones de memo y atributos de búsqueda son metadatos del operador. No base decisiones en sus valores mutables.

No dependa de globales mutables, archivos locales, sockets abiertos, identidad de objetos, valores aleatorios, reloj real u otro estado local al proceso para la corrección. Sticky puede conservarlos por accidente en una tarea y perderlos ante un fallo de caché, reinicio, actualización o expulsión.

Use [`sideEffect(...)`](/docs/features/side-effects) para valores no deterministas que deban registrarse una vez y actividades normales para efectos externos. Consulte [Garantías de ejecución e idempotencia](/docs/constraints/execution-guarantees) para el contrato de replay e historial duradero.