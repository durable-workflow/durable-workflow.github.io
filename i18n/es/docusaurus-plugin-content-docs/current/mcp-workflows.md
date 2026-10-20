---
sidebar_position: 9.2
title: Interfaz MCP de workflows
description: Usa el servidor MCP de la aplicación de ejemplo como interfaz de referencia para clientes de IA para descubrimiento, inicio, diagnóstico, reparación, resultados e historial de workflows.
tags:
  - ai
  - agents
  - mcp
  - sample-app
keywords:
  - MCP de Durable Workflow
  - herramientas MCP de workflows
  - servidor MCP de la aplicación de ejemplo
  - descubrimiento de workflows para clientes de IA
---

# Interfaz MCP de workflows {#mcp-workflow-surface}

La aplicación de ejemplo expone el servidor MCP de referencia de Durable
Workflow v2 en:

```text
/mcp/workflows
```

Úsalo cuando un cliente de IA necesite inspeccionar u operar una aplicación
local de workflows sin extraer datos de Waterline ni adivinar detalles internos
de Laravel. El endpoint es una interfaz estructurada de desarrollo: identifica
los workflows que la aplicación decide exponer, describe requisitos de
credenciales, inicia ejecuciones, sondea resultados y devuelve hechos acotados del historial.

## Contrato del servidor {#server-contract}

La aplicación de ejemplo registra el servidor desde `routes/ai.php` y configura
las claves de workflow expuestas en `config/workflow_mcp.php`. Trata esta
configuración como la lista pública de permitidos para clientes de IA. Un
workflow solo es operable mediante MCP si figura allí con suficientes metadatos
para que el cliente decida si puede ejecutarlo con seguridad.

Cada workflow configurado debe describir:

- Una clave de workflow estable.
- La clase de workflow asociada a esa clave.
- Los argumentos obligatorios y opcionales.
- Los requisitos de credenciales.
- Si es seguro para pruebas de humo locales sin credenciales.
- Las expectativas de salida e historial que un agente pueda citar.

Mantén los secretos fuera de las descripciones de herramientas. Indica que un
workflow necesita una credencial, sin incluir su valor ni detalles de cuentas concretas.

## Herramientas {#tools}

El servidor de referencia expone seis herramientas de workflow:

| Herramienta | Uso |
| --- | --- |
| `list_workflows` | Descubre claves de workflow configuradas, descripciones, requisitos de credenciales, estados de v2 y ejecuciones recientes. |
| `start_workflow` | Inicia un workflow configurado y devuelve `workflow_id`, `run_id`, estado, clave de negocio y resultado del comando. |
| `get_workflow_result` | Sondea la ejecución actual o seleccionada para obtener estado, salida, metadatos de visibilidad y resumen del último fallo. |
| `get_workflow_history` | Obtiene un tramo final acotado de eventos tipados del historial v2 y fallos duraderos recientes. |
| `diagnose_workflow` | Clasifica una ejecución seleccionada con hechos estructurados, causa raíz, medidas correctivas y siguientes acciones. |
| `repair_workflow` | Solicita el comando de reparación integrado de v2 y devuelve un resultado estructurado de modificación aceptada, rechazada o innecesaria. |

Llama a `list_workflows` antes de cualquier inicio. Es la comprobación de
compatibilidad del agente: la respuesta indica qué claves de workflow existen
y si un workflow puede ejecutarse en el entorno actual.

Los sobres de descubrimiento usan el ID normativo de esquema
`durable-workflow.v2.mcp-discovery`. Los agentes pueden usarlo para reconocer la
estructura publicada de herramientas, esquemas de parámetros, indicaciones de
descubrimiento y semántica de `payload_preview_limit_bytes` antes de invocar una herramienta.

## Contrato de entradas de herramientas {#tool-input-contract}

Los esquemas MCP utilizan deliberadamente términos de Durable Workflow, en
lugar de detalles internos de Laravel. Conserva estables estos campos al
ampliar el servidor de la aplicación de ejemplo:

| Herramienta | Entradas estables |
| --- | --- |
| `list_workflows` | `show_recent`, `limit` y `status` opcional para descubrir ejecuciones recientes. |
| `start_workflow` | `workflow`, `arguments` ordenados, y los campos opcionales `instance_id`, `business_key`, `visibility_labels`, `memo`, `search_attributes` y `duplicate_start_policy`. |
| `get_workflow_result` | `workflow_id`, y los campos opcionales `run_id`, `include_recent_history` e `history_limit`. |
| `get_workflow_history` | `workflow_id` o `run_id`, `limit` e `include_payloads`. |
| `diagnose_workflow` | `workflow_id` o `run_id`, más `history_limit` opcional. |
| `repair_workflow` | `workflow_id` o `run_id`. |

Prefiere `arguments` frente a la entrada heredada `args` para agentes nuevos.
`arguments` corresponde directamente al orden de argumentos de `handle()` del
workflow, mientras que `args` existe solo para clientes antiguos que envían objetos.

Usa `instance_id` proporcionado por quien llama solo cuando el agente necesite
idempotencia. Combínalo con `duplicate_start_policy=return_existing_active`
cuando una prueba de humo repetida deba conectarse al workflow activo en vez
de fallar por duplicación.

## Contrato de resultados de herramientas {#tool-result-contract}

Los sobres de resultados usan el ID normativo de esquema
`durable-workflow.v2.mcp-tool-results`. Los agentes pueden usarlo para analizar
el estado del resultado, el truncamiento de vistas previas de cargas útiles,
campos de error, objetos de causa raíz y medidas correctivas, sobres de
modificaciones seguras y marcadores de esquema y versión.

Los agentes deben tratar los siguientes campos de resultado como referencias
duraderas para correlacionar distintas herramientas:

| Herramienta | Campos de resultado estables |
| --- | --- |
| `list_workflows` | `available_workflows`, `allow_fqcn`, `workflow_id_kind`, `run_id_kind`, `status_values` y `recent_workflows` opcional. |
| `start_workflow` | `workflow_id`, `run_id`, `workflow`, `workflow_class`, `workflow_type`, `status`, `running`, `business_key`, `duplicate_start_policy` y `command`. |
| `get_workflow_result` | `found`, `workflow_id`, `run_id`, `current_run_id`, `current_run_is_selected`, `status`, `running`, `output`, `error`, metadatos de visibilidad y marcas de tiempo. |
| `get_workflow_history` | `found`, `workflow_id`, `run_id`, `current_run_id`, `status`, `history_event_count`, `returned_event_count`, `events_are_most_recent`, `payloads_included`, `events` y `failures`. |
| `diagnose_workflow` | `found`, `workflow_id`, `run_id`, `diagnosis`, `facts`, `latest_failure`, `recent_history`, `root_cause`, `remediation` y `next_actions`. |
| `repair_workflow` | `found`, `workflow_id`, `run_id`, `accepted`, `status`, `mutation`, `command`, `remediation` y `next_actions`. |

Las vistas previas de cargas útiles del historial son deliberadamente acotadas.
Cuando `include_payloads` es verdadero, la vista previa de cada evento informa
de `payload_preview_limit_bytes`, `size_bytes`, `preview_bytes` y `truncated`
para que el agente pueda indicar si vio la carga completa o solo una vista previa.

## Clasificación de fallos y medidas correctivas {#failure-and-remediation-taxonomy}

`diagnose_workflow` es la interfaz de causa raíz legible por máquina. Su objeto
`root_cause` usa el ID de esquema `durable-workflow.v2.agent-root-cause` e incluye:

- `category`, como `activity_failure`, `workflow_failure`,
  `task_repair_attention`, `waiting_for_signal`, `history_growth_attention`,
  `in_progress` o `none`.
- `source.kind` y `source.id` para la familia de workflow, actividad, espera,
  cola de tareas o historial que produjo la clasificación.
- `retryable`, `severity` y `actionable`.
- Detalles de fallo como `failure_category`, `exception_class` y `handled`
  cuando existe una fila duradera de fallo.

El objeto complementario `remediation` usa el ID de esquema
`durable-workflow.v2.agent-remediation`. Incluye `classification`, un `summary`
breve, `automatic_repair.tool` y `automatic_repair.allowed`, más entradas de
`next_actions` para los siguientes comandos admitidos. Los agentes solo deben
llamar a `repair_workflow` si `automatic_repair.allowed` es verdadero. Otras
clasificaciones indican al agente que espere, envíe la entrada esperada por
la interfaz documentada de comandos de workflow, inspeccione el historial,
cambie el código de workflow o actividad, o planifique Continue-As-New.

`repair_workflow` devuelve un sobre `durable-workflow.v2.safe-mutation`.
`mutation.applied` indica si se aceptó un comando de reparación, mientras que
`command.outcome` distingue `repair_dispatched`, `repair_not_needed` y rechazos
estructurados, como una ejecución terminal o que ya no es la actual.

## Ciclo seguro de agentes {#safe-agent-loop}

Usa primero workflows sin credenciales:

```json
{"tool": "list_workflows", "arguments": {"show_recent": true, "limit": 5}}
{"tool": "start_workflow", "arguments": {"workflow": "simple", "business_key": "demo-001"}}
{"tool": "diagnose_workflow", "arguments": {"workflow_id": "<workflow_id>"}}
{"tool": "repair_workflow", "arguments": {"workflow_id": "<workflow_id>"}}
{"tool": "get_workflow_result", "arguments": {"workflow_id": "<workflow_id>"}}
{"tool": "get_workflow_history", "arguments": {"run_id": "<run_id>", "limit": 25}}
```

Las claves `simple` y `elapsed` son las preferidas para pruebas de humo. Usa
ejemplos con credenciales solo después de que `list_workflows` informe del
requisito y el entorno local contenga las claves necesarias.

## Estructura del informe {#report-shape}

Un cliente de IA debe informar de los resultados MCP con hechos estables:

- Versión de la documentación utilizada, normalmente `2.0`.
- Endpoint MCP y nombre de herramienta.
- Clave de workflow, `workflow_id` y `run_id`.
- Estado y resumen del último fallo.
- `root_cause.category` y `remediation.classification`.
- Si `remediation.automatic_repair.allowed` era verdadero antes de intentar
  una modificación de reparación.
- Nombres y marcas de tiempo de eventos de historial acotados.
- Si se usó un workflow de prueba de humo sin credenciales o un ejemplo con credenciales.

Estos hechos se corresponden con las interfaces del CLI, el SDK Python y la
exportación de historial de Waterline, de modo que una persona puede reproducir
la misma ejecución desde otro cliente.

## Páginas relacionadas {#related-pages}

- [Desarrollo asistido por IA](./ai-assisted-development.md)
- [Ciclo operativo de agentes](./agent-operating-loop.md)
- [Contrato de herramientas para agentes](./agent-tooling-contract.md)
- [Aplicación de ejemplo](./sample-app.md)
- [Capacidades de clientes y workers](./polyglot/cli-python-parity.md)
- [Flujos de mensajes](./features/message-streams.md)
