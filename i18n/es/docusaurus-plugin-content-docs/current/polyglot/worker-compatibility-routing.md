---
sidebar_position: 5
title: Compatibilidad y enrutamiento de workers
description: Conserva las fijaciones originales al promover nuevos inicios e investigar workers compatibles ausentes.
tags: [worker-protocol, compatibility, operations, rollouts]
keywords: [compatibilidad de workers, despliegue, marcadores, enrutamiento, reversión]
---

# Compatibilidad y enrutamiento de workers

La compatibilidad es un contrato de enrutamiento. Mantén workers capaces de reproducir historiales existentes mientras cambias la compilación de los nuevos inicios. Drenar no transfiere sus ejecuciones a otra compilación.

## Dos identidades relacionadas {#two-related-identities}

- El **identificador de compilación** es el `build_id` registrado de una cohorte del Server independiente, dentro de un namespace y cola. Promoción, drenaje y reanudación actúan sobre esa cohorte.
- El **marcador de compatibilidad** se conserva en el trabajo duradero. PHP embebido usa `DW_V2_CURRENT_COMPATIBILITY` y `DW_V2_SUPPORTED_COMPATIBILITIES`; las compilaciones de workers independientes ofrecen la identidad equivalente de enrutamiento.

Trata las identidades como cadenas opacas. Un nombre aparentemente nuevo no acredita compatibilidad de replay ni autoriza cambiar una fijación existente.

## Qué queda fijado {#what-gets-pinned}

El Server independiente selecciona la fijación de nuevos inicios mediante promoción explícita y después sus alternativas de cohorte activa única. Los inicios ambiguos pueden quedar sin fijar. Consulta el [orden de selección](/docs/polyglot/worker-build-id-rollout#canary-a-new-build).

Las tareas y actividades heredan la compatibilidad de la ejecución. Los reintentos de tareas, vencimientos de concesión y redistribuciones la conservan. Las ejecuciones de reintento, hijos y continue-as-new también heredan la fijación original. Promover afecta a nuevas instancias posteriores, no cambia una cadena que continúa.

## Cómo funciona el enrutamiento {#how-routing-works}

### Filtrado durante el poll {#poll-time-narrowing}

Los workers solicitan namespace, cola y cohorte compatible. La selección evita ofrecer trabajo incompatible, pero no es la autoridad final.

### Comprobación al reclamar {#claim-time-enforcement}

La reclamación verifica la compatibilidad original y la identidad del worker. Un worker incompatible no obtiene una concesión porque falte otra compilación. El vencimiento de una concesión tampoco amplía la compatibilidad.

## Qué deben configurar los operadores {#what-operators-should-configure}

En PHP embebido configura la familia actual y las admitidas explícitamente:

```bash
DW_V2_CURRENT_COMPATIBILITY=orders-2026-04-28
DW_V2_SUPPORTED_COMPATIBILITIES=orders-2026-04-28,orders-2026-04-21
```

El primer valor fija nuevas ejecuciones embebidas; el segundo permite reclamar esas familias. Usa `*` solo con una política de compatibilidad comprobada deliberadamente. Los workers independientes deben registrar un `build_id` estable y usar promoción y controles de ciclo de vida del Server. Mantén la familia en reconstrucciones compatibles con replay; cambiar una etiqueta no vuelve compatible el código.

## Patrón de despliegue seguro {#safe-rollout-pattern}

1. Despliega e inspecciona namespace, cola, tipos admitidos y registros recientes de la nueva cohorte. Mantén la antigua disponible.
2. Promueve explícitamente la compilación de los nuevos inicios. El número de workers no define porcentajes de tráfico.
3. Conserva capacidad compatible para ejecuciones fijadas, incluidas las que esperan pasivamente temporizador, señal, actividad o hijo.
4. Drena solo para detener deliberadamente las nuevas reclamaciones de la cohorte. Si se bloquea trabajo por un drenaje temprano, reanuda y restaura la compilación original compatible.
5. Para revertir nuevos inicios, restaura/reanuda y promueve la cohorte correcta; después revierte el despliegue defectuoso. Las fijaciones existentes no cambian.

Cero tareas pendientes no demuestra retirada segura. Conserva artefacto y recuperación mientras una ejecución fijada o una cadena heredada pueda necesitarlos. [Server #519](https://github.com/durable-workflow/server/issues/519) sigue esa función protegida separada; esta lista no la entrega.

## Estado explícito de worker ausente {#explicit-missing-worker-state}

Inspecciona conjuntamente las [tareas pendientes por cohorte](/docs/polyglot/worker-build-id-rollout#pending-workflow-tasks-by-cohort), los registros recientes/drenados/obsoletos y la fijación original. `no_compatible_worker` indica trabajo de workflow pendiente para una compilación no nula sin worker activo compatible. No cuenta colas de actividades ni todas las ejecuciones pasivas fijadas. Un campo ausente, petición fallida o heartbeat obsoleto no significa flota vacía ni cero tareas. Restaura la compilación adecuada o comprueba cola, namespace y tipos antes de añadir workers ajenos.

## Relación con despliegues por compilación {#how-this-relates-to-build-id-rollouts}

El estado del despliegue describe capacidad registrada e intenciones de nuevos inicios/ciclo de vida; la compatibilidad determina si se puede reclamar una tarea original concreta. Usa ambos. Ni drenaje ni reversión reescriben compatibilidad duradera ni demuestran que se pueda eliminar una compilación.

## Referencias relacionadas {#related-references}

- [Namespace, autenticación y registro de workers](/docs/polyglot/namespace-auth-workers)
- [Despliegue de identificadores de compilación](/docs/polyglot/worker-build-id-rollout)
- [Referencia de configuración Server](/docs/polyglot/server-config-reference)
- [Marco operativo](/docs/operator-operating-envelope)
