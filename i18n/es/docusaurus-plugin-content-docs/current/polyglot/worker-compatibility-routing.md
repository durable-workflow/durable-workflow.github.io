---
sidebar_position: 5
title: Compatibilidad y enrutamiento de workers
description: Despliega versiones de workers de forma segura vinculando el trabajo en curso a ejecutores compatibles y mostrando las carencias del despliegue.
tags:
  - worker-protocol
  - compatibility
  - operations
  - rollouts
keywords:
  - compatibilidad de workers
  - despliegue de versiones de workers
  - marcadores de compatibilidad
  - enrutamiento por build id
  - reversión de workers
---

# Compatibilidad y enrutamiento de workers {#worker-compatibility-and-routing}

Utiliza esta guía para desplegar una nueva versión de worker, probarla con una
cola canary, revertir una versión defectuosa o mantener workflows de larga
duración durante el despliegue. Durable Workflow v2 trata la compatibilidad de
workers como un contrato de enrutamiento, no como una convención informal.

La regla principal es sencilla: una ejecución iniciada con una familia de
compatibilidad debe seguir llegando a workers que puedan reproducirla y
ejecutarla de forma segura. El sistema debe mostrar la ausencia de workers
compatibles como un estado operativo explícito en lugar de entregar la tarea
silenciosamente a otra versión.

## Dos identidades relacionadas {#two-related-identities}

Durable Workflow ofrece dos interfaces de despliegue relacionadas pero distintas:

- **Build id** es la identidad de cohorte visible al operador en el servidor
  independiente. Es el valor que el worker registra como `build_id` y sobre el
  que las API de despliegue de colas inician el drenaje o reanudan la actividad.
- **Marcador de compatibilidad** es la identidad de enrutamiento del trabajo en
  curso. En workers PHP integrados o alojados en el servidor procede de
  `DW_V2_CURRENT_COMPATIBILITY` y `DW_V2_SUPPORTED_COMPATIBILITIES`.
  En el servidor independiente, las cohortes por build id permiten a los
  operadores inspeccionar y controlar esos grupos de workers compatibles.

Trata ambos valores como cadenas opacas, por ejemplo `orders-2026-04-28` o
`api-v3`. Durable Workflow no interpreta semver, compara fechas ni supone que
una cadena sea más reciente que otra.

## Qué queda vinculado {#what-gets-pinned}

La compatibilidad se asocia al trabajo duradero del workflow, no solo a los
procesos de worker activos.

- **El inicio del workflow** registra la familia de compatibilidad actual en la nueva ejecución.
- **Las tareas de workflow** heredan esa familia y la conservan durante
  reintentos, vencimientos de leases y nuevos despachos.
- **Las tareas de actividad** heredan la familia de su ejecución padre.
- **Las ejecuciones de reintento** conservan la familia de la ejecución de origen.
- **Continuar como nuevo** conserva la familia de la ejecución actual.
- **Los workflows hijos** heredan la familia de la ejecución padre.

Así, un workflow de larga duración no pasa a otra familia de ejecutores solo
porque cambie un despliegue. Las nuevas versiones afectan a los nuevos inicios,
salvo que drenes deliberadamente las cohortes antiguas y traslades el tráfico.

## Cómo funciona el enrutamiento {#how-routing-works}

La compatibilidad se exige en más de una capa.

### Filtrado al sondear {#poll-time-narrowing}

Los workers restringen sus solicitudes por cola y cohorte de compatibilidad o
versión, para que el servidor o el motor integrado evite ofrecer primero tareas
claramente incompatibles.

Es una indicación de eficiencia, no el límite definitivo de seguridad.

### Validación al reclamar {#claim-time-enforcement}

La validación al reclamar garantiza la corrección. Si un worker no puede
ejecutar una tarea de forma segura, Durable Workflow rechaza la reclamación con
un motivo explícito de compatibilidad en lugar de reasignar la propiedad silenciosamente.

Este es el contrato para los despliegues que afectan a la compatibilidad:

- las tareas nunca pasan silenciosamente a un worker incompatible
- el vencimiento dla lease y la nueva entrega conservan la familia original
- la ausencia de un worker compatible es un estado observable, no un comportamiento indefinido

## Qué deben configurar los operadores {#what-operators-should-configure}

Utiliza familias de compatibilidad estables y legibles para versiones que puedan
reproducir de forma segura los mismos workflows en curso.

Para workers PHP integrados o alojados en el servidor, configura:

```bash
DW_V2_CURRENT_COMPATIBILITY=orders-2026-04-28
DW_V2_SUPPORTED_COMPATIBILITIES=orders-2026-04-28,orders-2026-04-21
```

`DW_V2_CURRENT_COMPATIBILITY` indica la familia a la que se vinculan las nuevas
ejecuciones. `DW_V2_SUPPORTED_COMPATIBILITIES` indica las familias que este worker
puede reclamar durante un despliegue o reversión. Utiliza `*` solo en flotas con
una única versión o en entornos de prueba acotados; no lo utilices para ocultar
una política de despliegue incierta.

Para workers del servidor independiente, registra un `build_id` estable y utiliza
las API de despliegue por build id para drenar o reanudar cohortes de forma deliberada.

## Patrón de despliegue seguro {#safe-rollout-pattern}

Sigue esta secuencia para cambios de workers que afecten a la compatibilidad:

1. Inicia la nueva cohorte de workers con un nuevo build id o marcador de compatibilidad.
2. Mantén activa la cohorte antigua hasta confirmar que la nueva puede reclamar trabajo.
3. Drena la cohorte antigua para que deje de tomar tareas nuevas pero pueda
   terminar o liberar las que ya tenía asignadas mediante leases.
4. Observa las interfaces de compatibilidad y colas hasta que deje de ser
   necesaria la cohorte antigua.
5. Reanuda la cohorte antigua solo si necesitas revertir el despliegue.

Mantén la familia estable en recompilaciones compatibles con la reproducción.
Cámbiala solo cuando los nuevos workers ya no deban reclamar tareas creadas por
la familia antigua.

## Estado explícito de ausencia de worker {#explicit-missing-worker-state}

Cuando ningún worker puede atender la familia requerida, Durable Workflow debe
mostrarlo claramente:

- los resúmenes de flota muestran que no se cubre la compatibilidad requerida
- las interfaces de cola y despliegue muestran qué cohortes siguen activas,
  drenando, obsoletas o ausentes
- los diagnósticos muestran que la ejecución espera un worker compatible
- la salud y las métricas operativas identifican el trabajo bloqueado por compatibilidad

Es la señal esperada durante un despliegue parcial o una reversión incompleta.
Trátala como una condición operativa real que debes corregir, no como un fallo
transitorio aleatorio.

## Relación con los despliegues por build id {#how-this-relates-to-build-id-rollouts}

El estado del despliegue por build id y el enrutamiento por compatibilidad
resuelven problemas distintos:

- **El despliegue por build id** indica qué cohortes están activas y permite
  drenarlas o reanudarlas de forma deliberada.
- **El enrutamiento por compatibilidad** decide si una tarea concreta en curso
  puede ejecutarse en un worker determinado.

Normalmente se utilizan juntos. Las cohortes indican qué ejecutores están
disponibles; el enrutamiento garantiza que el trabajo de larga duración solo
llegue a una cohorte compatible.

## Referencias relacionadas {#related-references}

- [Espacios de nombres, autenticación y registro de workers](/docs/polyglot/namespace-auth-workers)
  para la carga útil de registro, incluido `build_id`
- [Despliegue de workers por build id](/docs/polyglot/worker-build-id-rollout)
  para el ciclo de drenaje y reanudación en una cola
- [Referencia de configuración del servidor](/docs/polyglot/server-config-reference)
  para `DW_V2_CURRENT_COMPATIBILITY`, `DW_V2_SUPPORTED_COMPATIBILITIES` y ajustes relacionados
- [Límites operativos del operador](/docs/operator-operating-envelope) para
  la salud, las métricas y los diagnósticos que muestran carencias de compatibilidad
