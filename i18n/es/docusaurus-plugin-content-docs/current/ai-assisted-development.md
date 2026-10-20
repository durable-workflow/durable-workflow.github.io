---
sidebar_position: 9
title: Desarrollo asistido por IA
description: Usa la documentación v2 de Durable Workflow, la interfaz MCP, la salida del CLI y las exportaciones de historial como referencias estables para agentes de programación.
tags:
  - ai
  - agents
  - llms
keywords:
  - documentación de IA de Durable Workflow
  - llms.txt
  - asistentes de programación con IA
---

# Desarrollo asistido por IA {#ai-assisted-development}

Durable Workflow v2 está diseñado para que una persona aprenda el modelo de
ejecución duradera y deje a las herramientas el trabajo repetitivo de inspección
y operación. La interfaz importante del producto no es un prompt de chat, sino
el conjunto de referencias estables que un agente puede leer, invocar y citar
sin adivinar.

## Interfaces de recuperación de documentación {#retrieval-surfaces}

Usa estos artefactos para LLM para proporcionar a un asistente de IA la
documentación legible por máquina de Durable Workflow:

| Interfaz | URL | Uso |
| --- | --- | --- |
| Manifiesto canónico | `https://durable-workflow.com/llms.txt` | Índice de documentación estable de 2.0. Sigue la ruta predeterminada de documentación sin versión del sitio. |
| Paquete completo canónico | `https://durable-workflow.com/llms-full.txt` | Documentación en un solo archivo que coincide con el manifiesto canónico. |
| Manifiesto v1 | `https://durable-workflow.com/llms-1.x.txt` | Archivo de 1.x fijado a esa versión. |
| Paquete completo v1 | `https://durable-workflow.com/llms-full-1.x.txt` | Paquete estable de 1.x fijado a esa versión. |
| Manifiesto v2 | `https://durable-workflow.com/llms-2.0.txt` | Índice de 2.0 fijado a esa versión, equivalente al manifiesto canónico. |
| Paquete completo v2 | `https://durable-workflow.com/llms-full-2.0.txt` | Paquete de 2.0 fijado a esa versión. |

Los prompts predeterminados de los agentes deben obtener `/llms.txt` o
`/llms-full.txt` para trabajar con la versión estable 2.0. Fija las URL
`-1.x.txt` al mantener una aplicación 1.x.

## Interfaz MCP local {#local-mcp-surface}

La [aplicación de ejemplo](/docs/sample-app) expone un servidor MCP de Laravel
en `/mcp/workflows`. Es la integración de referencia para clientes de IA en el
desarrollo local de workflows v2. La página
[Interfaz MCP de workflows](/docs/mcp-workflows) define el endpoint, las
herramientas, los workflows seguros para pruebas de humo y la estructura del informe.

El servidor MCP ofrece operaciones estructuradas de workflow al agente, sin
extraer información de la interfaz gráfica:

| Herramienta | Referencia estable |
| --- | --- |
| `list_workflows` | Descubre claves de workflow configuradas, requisitos de credenciales, valores de estado y ejecuciones recientes. |
| `start_workflow` | Inicia un workflow v2 configurado y recibe `workflow_id`, `run_id`, estado, clave de negocio y resultado del comando. |
| `get_workflow_result` | Sondea la ejecución actual o seleccionada para obtener estado, salida, metadatos de visibilidad y resumen del último fallo. |
| `get_workflow_history` | Obtiene un tramo final acotado de eventos tipados de historial v2 y fallos duraderos recientes. |

Usa `simple` o `elapsed` como pruebas de humo sin credenciales. Usa workflows
con credenciales externas solo cuando el entorno local contenga las claves necesarias.

Cuando un agente modifique workflows repetitivos de IA o entrada humana,
dirígelo al contrato v2 de [Flujos de mensajes](/docs/features/message-streams).
El patrón estable de autoría es `Workflow::inbox()` / `Workflow::outbox()` /
`MessageStream`. Las escrituras directas mediante `MessageService`,
`WorkflowMessage` o filas de cursor son detalles internos del runtime, no
patrones para el código de ejemplo.

## Contratos de comandos y diagnósticos {#command-and-diagnostic-contracts}

Los agentes deben preferir interfaces legibles por máquina frente a capturas o prosa:

- El [Ciclo operativo de agentes](/docs/agent-operating-loop) convierte la
  documentación v2, el endpoint MCP, la salida JSON de `dw`, la exportación de
  historial de Waterline y las referencias de SDK en un proceso repetible de
  descubrir, cambiar, ejecutar y diagnosticar.
- El [Contrato de herramientas para agentes](/docs/agent-tooling-contract)
  define cómo se alinean herramientas MCP, JSON del CLI, diagnósticos de Server,
  exportaciones de Waterline y fixtures de SDK como una interfaz operable por máquinas.
- Los comandos `dw` exponen códigos de salida estables para automatización.
  Consulta la [Referencia del CLI](/docs/polyglot/cli#exit-codes).
- [Capacidades de clientes y workers](/docs/polyglot/cli-python-parity/)
  compara ciclo de vida, mensajes, programaciones, visibilidad y ejecución de
  workers entre `dw` y los tres SDK oficiales, con evidencia compartida de
  solicitudes donde existe.
- La [interfaz de ejecución externa](/docs/polyglot/external-execution)
  publica el límite de tareas con semántica de actividad, requisitos de
  transporte, resultados del puente y rutas de sobres de entrada y resultado
  mediante `/api/cluster/info`.
- Los comandos de salud, información, namespaces, workflows, programaciones,
  workers y colas de tareas de Server son las referencias adecuadas para
  comprobaciones desde el terminal.
- La exportación de historial de Waterline es la fuente para reproducir y
  diagnosticar fallos. Incluye eventos tipados de historial, metadatos de fuentes
  de proyección, comprobaciones de integridad, contexto de ejecución seleccionada,
  esperas, temporizadores, linaje y últimos fallos duraderos.
- Los tipos y firmas de métodos del SDK Python están en la
  [Referencia de la API de Python](https://python.durable-workflow.com/) generada.

Cuando un agente deba explicar un workflow atascado, recoge primero estos hechos:

1. `workflow_id` y `run_id`.
2. Estado actual de la ejecución y resumen del último fallo.
3. Eventos tipados de historial recientes.
4. Esperas abiertas, temporizadores y tareas pendientes.
5. Salud de workers y colas de tareas.
6. Versión pertinente de la documentación: `2.0` para el producto actual y
   `1.x` solo para mantenimiento heredado.

Este conjunto permite distinguir un fallo duradero del workflow de un fallo
del runtime del worker, una credencial externa ausente, una caída de la cola o
una acción de operador pendiente de aprobación.

## Estructura del prompt {#prompt-shape}

Da a los agentes de programación restricciones y referencias explícitas:

```text
Use Durable Workflow docs from https://durable-workflow.com/llms-full-2.0.txt.
Use the sample app MCP endpoint at /mcp/workflows for workflow discovery,
start, result, and history. Prefer dw JSON/exit-code contracts and Waterline
history exports over screenshots. For external handlers or bridge adapters,
read worker_protocol.external_execution_surface_contract from /api/cluster/info
and preserve the external task input/result envelopes. Use Durable Workflow
2.0 APIs unless I explicitly ask for legacy 1.x maintenance.
```

El objetivo es sencillo: las personas aprenden el principio de workflow,
actividad y reproducción, y las herramientas operan mediante contratos
documentados en lugar de deducir el comportamiento del producto.
