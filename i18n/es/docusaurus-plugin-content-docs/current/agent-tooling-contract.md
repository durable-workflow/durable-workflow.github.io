---
sidebar_position: 9.3
title: Contrato de herramientas para agentes
description: Trata las herramientas MCP, el JSON del CLI, los diagnósticos de Server, las exportaciones de Waterline y los fixtures de los SDK como un único contrato de Durable Workflow v2 operable por máquinas.
tags:
  - ai
  - agents
  - mcp
  - operations
keywords:
  - herramientas para agentes de durable workflow
  - contrato de herramientas de IA
  - diagnóstico de workflows mediante MCP
  - operaciones de workflow legibles por máquina
---

# Contrato de herramientas para agentes {#agent-tooling-contract}

Durable Workflow v2 hace predecible el desarrollo asistido por IA al exponer
hechos del producto mediante contratos estables. Una herramienta no debe
deducir el estado del workflow a partir de HTML, usar los registros como fuente
de verdad ni adivinar qué comportamiento de un SDK equivale a un comando del
CLI. Debe leer la versión de la documentación, descubrir la interfaz local,
invocar operaciones documentadas e informar de hechos con campos identificados.

Esta página define la estructura del contrato que deben conservar las futuras
herramientas MCP, los agentes locales, los scripts y los SDK.

## Capas del contrato {#contract-layers}

| Capa | Referencia estable | Expectativa del contrato |
| --- | --- | --- |
| Recuperación de documentación | Los archivos canónicos `llms.txt` y `llms-full.txt` siguen la documentación estable de 2.0. `llms-2.0.txt` y `llms-full-2.0.txt` son alias fijados a la misma línea de versiones. | Usa las URL canónicas para trabajar con el producto 2.0. Fija `-1.x.txt` cuando una URL deba identificar la línea archivada 1.x, o `-2.0.txt` cuando un consumidor necesite una URL explícita de versión mayor. |
| Descubrimiento local | `list_workflows` en `/mcp/workflows` | La lista de permitidos de MCP, gestionada por la aplicación, identifica las claves de workflow expuestas, las credenciales necesarias, los argumentos esperados y la idoneidad para pruebas de humo. |
| Operaciones de workflow | `start_workflow`, `get_workflow_result`, `get_workflow_history`, `diagnose_workflow` y `repair_workflow` de MCP; comandos JSON de `dw`; clientes SDK | Todos los clientes comunican ID de workflow, ID de ejecución, namespace, cola de tareas, estado del comando, clasificación de causa raíz, medidas correctivas y campos de fallo identificados sin extraer datos de una interfaz gráfica. |
| Diagnósticos de Server | `/api/cluster/info`, `dw server:info --output=json`, `dw doctor --output=json`, `dw debug workflow --output=json` | Los hechos sobre compatibilidad, protocolo, colas de tareas, workers y ejecuciones atascadas son legibles por máquina y tienen un tamaño acotado. |
| Evidencia duradera | Detalles de la ejecución seleccionada y exportación de historial de Waterline | La reproducción, las esperas, los temporizadores, el linaje, la fuente de la proyección, las comprobaciones de integridad, los fallos duraderos y las acciones disponibles para el operador proceden de estado con tipos definidos. |
| Paridad entre lenguajes | Fixtures de solicitudes de CLI/Python y pruebas de los SDK | Las operaciones compartidas del plano de control mantienen alineada la estructura de las solicitudes entre lenguajes. |

Cada capa debe poder utilizarse por separado. Juntas dan a un agente suficiente
contexto para realizar un cambio pequeño, demostrar que funciona y explicar
el resultado.

## Diseño de herramientas MCP {#mcp-tool-design}

Las nuevas herramientas MCP deben exponer directamente los conceptos de Durable Workflow:

- Usa nombres del producto como workflow, ejecución, cola de tareas, programación,
  historial, fallo, worker, namespace y compatibilidad.
- Devuelve identificadores estables y campos de estado identificados en lugar
  de resúmenes que solo contengan prosa.
- Devuelve objetos `root_cause`, `remediation` y `next_actions` en las
  herramientas de diagnóstico para que los agentes puedan elegir el siguiente
  comando sin analizar lenguaje natural.
- Incluye matrices y vistas previas acotadas para historial, fallos y cargas
  útiles, de modo que un cliente pueda inspeccionarlos sin descargar una traza ilimitada.
- Separa el descubrimiento de las modificaciones. Un cliente debe poder
  preguntar qué existe y qué credenciales necesita antes de iniciar un workflow
  o enviarle comandos.
- Mantén las modificaciones explícitas y estructuradas. Para los workflows de
  ejemplo locales, `repair_workflow` es la operación de reparación principal.
  Devuelve un sobre `durable-workflow.v2.safe-mutation` incluso cuando la
  reparación se rechaza o no es necesaria.
- Marca explícitamente los workflows de prueba de humo que no necesitan
  credenciales para que los agentes puedan comprobar la conexión local sin
  acceder a servicios externos.
- Nunca incluyas valores secretos, nombres de host específicos de clientes ni
  credenciales de cuentas concretas en descripciones de herramientas o metadatos de resultados.

El endpoint `/mcp/workflows` de la aplicación de ejemplo es la referencia para
la interfaz local de workflows. Los futuros servidores MCP específicos de cada
proyecto deben seguir el mismo criterio: la configuración gestiona la lista de
permitidos, las herramientas operan solo sobre los workflows incluidos y los
resultados citan hechos duraderos de workflows que una persona pueda reproducir
mediante `dw`, Waterline o un SDK.

## Paridad entre comandos y SDK {#command-and-sdk-parity}

La automatización debe poder pasar de un cliente a otro sin cambios de significado:

| Familia de operaciones | Señal de paridad requerida |
| --- | --- |
| start, signal, update, query, repair, cancel, terminate, archive | Los cuerpos de las solicitudes del CLI y los SDK coinciden con la estructura documentada del plano de control. |
| history, describe, list, result | Las respuestas conservan identificadores estables, nombres de estados, marcas de tiempo y campos de fallo. |
| Colas de tareas y workers | La capacidad, las leases, los slots, la compatibilidad y los ID de workers siguen siendo hechos estructurados. |
| Ejecución externa | Los sobres de entrada y resultado se mantienen independientes del lenguaje y contienen resultados identificados del puente. |

Al añadir un comando al CLI, un método a un SDK o una herramienta MCP para una
acción del plano de control, prefiere un fixture compartido o un ejemplo JSON
documentado con el que otro cliente pueda comprobar su comportamiento. Puede
haber tablas para lectura humana, pero JSON o JSONL es el contrato de automatización.

## Estructura del informe de diagnóstico {#diagnosis-report-shape}

Cuando una herramienta explica una ejecución fallida o atascada, el informe debe incluir:

- Versión de la documentación y página fuente utilizada.
- Comando, método del SDK o herramienta MCP invocados.
- ID de workflow, ID de ejecución, namespace y cola de tareas.
- Estado actual y resumen del último fallo duradero.
- Nombres de los eventos recientes de historial con tipos definidos.
- Esperas, temporizadores, tareas o leases de actividades externas pendientes.
- Hechos sobre compatibilidad de workers y colas de tareas cuando estén disponibles.
- Código de salida identificado, estado HTTP, error de validación o motivo de bloqueo.
- `root_cause.category` y `remediation.classification` legibles por máquina.
- Si una reparación segura estaba permitida, se aplicó, se rechazó o no era necesaria.

Esta estructura permite usar los informes en aplicaciones Laravel locales,
despliegues de Server independiente, workers Python y futuros SDK.

## Causa raíz y medidas correctivas {#root-cause-and-remediation}

El ID de esquema de causa raíz admitido es
`durable-workflow.v2.agent-root-cause`. Las herramientas de diagnóstico deben incluir:

- `category`, como `activity_failure`, `workflow_failure`,
  `task_repair_attention`, `waiting_for_signal`, `history_growth_attention`,
  `in_progress` o `none`.
- `source.kind` y `source.id`.
- `retryable`, `severity` y `actionable`.

El ID de esquema de medidas correctivas admitido es
`durable-workflow.v2.agent-remediation`. Incluye
`classification`, `summary`, `automatic_repair.tool`,
`automatic_repair.allowed` y `next_actions`. `repair_workflow` es la interfaz
MCP local de reparación admitida. Cuando MCP no está disponible, la alternativa
es el contrato JSON documentado del CLI `dw` junto con las rutas HTTP del plano
de control de Server:

```bash
dw debug workflow <workflow-id> --output=json
dw workflow:history <workflow-id> <run-id> --output=json
dw workflow:repair <workflow-id> --output=json
dw system:repair-status --output=json
dw system:repair-pass --output=json
```

Estos comandos son el contrato admitido sin MCP para inspección, modificaciones
seguras, diagnósticos y automatización de reparaciones.

## Reglas para agentes {#guardrails-for-agents}

Permite a los agentes automatizar los trámites, sin eludir el modelo duradero:

- Mantén determinista la orquestación del workflow.
- Coloca la entrada/salida, la aleatoriedad, las llamadas a API externas y las
  credenciales en actividades o manejadores externos.
- Usa señales, actualizaciones, consultas, programaciones, temporizadores y
  flujos de mensajes en lugar de tablas de estado improvisadas para controlar workflows.
- Trata la exportación del historial de Waterline como evidencia, no como una API de modificación.
- Trata las listas de rutas, los detalles internos de la base de datos y las
  filas de modelos específicas del framework como detalles de implementación,
  salvo que la documentación pública las nombre explícitamente.

El principio sigue siendo comprensible para una persona: los workflows
registran decisiones duraderas, las actividades realizan trabajo que puede
fallar y la reproducción debe permitir explicar lo sucedido. El contrato de
herramientas proporciona a los agentes referencias estables para el resto.

## Páginas relacionadas {#related-pages}

- [Desarrollo asistido por IA](./ai-assisted-development.md)
- [Ciclo operativo de agentes](./agent-operating-loop.md)
- [Interfaz MCP de workflows](./mcp-workflows.md)
- [Capacidades de clientes y workers](./polyglot/cli-python-parity.md)
- [Referencia de la API HTTP de Server](./polyglot/server-api-reference.md)
- [Monitorización](./monitoring.md)
