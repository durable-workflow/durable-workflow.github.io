---
sidebar_position: 9.1
title: Ciclo operativo de agentes
description: Proporciona a los agentes de IA un proceso v2 estable para descubrir, cambiar, ejecutar, diagnosticar y reparar aplicaciones Durable Workflow.
tags:
  - ai
  - agents
  - mcp
  - operations
keywords:
  - ciclo de agentes de Durable Workflow
  - depuración de workflows de IA
  - workflows MCP
  - exportación de historial de Waterline
  - salida JSON de dw
---

# Ciclo operativo de agentes {#agent-operating-loop}

Los agentes utilizan Durable Workflow v2 más fácilmente cuando cada paso tiene
una referencia estable. El ciclo siguiente comienza con el mismo principio que
aprende una persona y después utiliza contratos legibles por máquina para el
descubrimiento, la ejecución, el diagnóstico y la reparación.

## 1. Usa la línea de documentación correcta {#1-use-the-right-docs-line}

Para trabajar con la versión estable 2.0, usa el paquete canónico. Sigue la
misma ruta predeterminada de documentación sin versión a la que llegan las
personas desde el sitio público:

```text
https://durable-workflow.com/llms-full.txt
```

Usa el paquete específico de 2.0 cuando la propia URL deba nombrar la línea
mayor actual:

```text
https://durable-workflow.com/llms-full-2.0.txt
```

Usa la referencia explícita a 1.x cuando la propia URL deba nombrar esa línea
mayor estable:

```text
https://durable-workflow.com/llms-full-1.x.txt
```

## 2. Descubre la interfaz local de workflows {#2-discover-the-local-workflow-surface}

Empieza en el endpoint MCP de la aplicación de ejemplo cuando esté disponible:

```text
/mcp/workflows
```

Consulta [Interfaz MCP de workflows](./mcp-workflows.md) para conocer el contrato
de referencia de herramientas, las claves de workflows seguros para pruebas
de humo y la estructura del informe del agente.

Llama primero a `list_workflows`. La respuesta indica qué workflows están
expuestos, qué credenciales necesitan, qué argumentos aceptan y qué ejecuciones
recientes existen. Usa `simple` o `elapsed` para pruebas de humo sin credenciales
antes de utilizar ejemplos que requieran claves de API externas.

Si MCP no está disponible, usa los contratos del CLI y de Server:

```bash
dw server:info --output=json
dw workflow:list --output=json
dw task-queue:list --output=json
```

Estos comandos proporcionan versiones de protocolo, contexto de namespace,
visibilidad de workflows y salud de colas de tareas sin extraer datos de la
interfaz gráfica.

## 3. Realiza el cambio más pequeño {#3-make-the-smallest-change}

Al editar código de workflow, conserva el límite duradero:

- Mantén las decisiones de orquestación en los métodos del workflow.
- Coloca entrada/salida, aleatoriedad, llamadas de red y credenciales externas en actividades.
- Usa señales, actualizaciones, consultas, temporizadores y flujos de mensajes
  en lugar de tablas o trabajos de cola improvisados.
- Mantén la entrada humana o de IA repetitiva dentro del contrato de
  [Flujos de mensajes](./features/message-streams.md).

Ese límite importa más que la interfaz del lenguaje. Las clases PHP de
workflow, `dw`, el SDK Python y los workers externos deben describir las mismas
operaciones del plano de control.

Cuando no haga falta editar código, el paso de cambio puede ser una decisión
operativa explícita: elegir la clave de workflow expuesta, proporcionar una
`business_key` estable, elegir `duplicate_start_policy=return_existing_active`
para pruebas de humo idempotentes o enviar la señal o actualización documentada
que recomiende `diagnose_workflow`.

## 4. Ejecuta mediante referencias estructuradas {#4-run-through-structured-handles}

Usa la referencia más específica disponible para la tarea:

| Tarea | Referencia preferida |
| --- | --- |
| Iniciar un workflow de ejemplo local | `start_workflow` mediante `/mcp/workflows` |
| Reparar un workflow de ejemplo local | `diagnose_workflow` y después `repair_workflow`, solo cuando las medidas correctivas lo permitan |
| Iniciar un workflow de Server o enviarle comandos | `dw workflow:start`, `dw workflow:signal`, `dw workflow:update` o equivalentes del SDK |
| Comprobar compatibilidad | `dw server:info --output=json` y `/api/cluster/info` |
| Inspeccionar la salud de una cola | `dw task-queue:describe <queue> --output=json` |
| Comparar interfaces de cliente y worker | [Capacidades de clientes y workers](./polyglot/cli-python-parity.md) |
| Implementar un worker que no sea PHP | [Protocolo de workers](./polyglot/worker-protocol.md) |
| Implementar un manejador externo | [Interfaz de ejecución externa](./polyglot/external-execution.md) |

Prefiere salidas JSON o JSONL para los ciclos de agentes. Las tablas del
terminal son para personas.

## 5. Diagnostica antes de reparar {#5-diagnose-before-repairing}

Recoge hechos antes de cambiar código o repetir comandos:

```bash
dw doctor --output=json
dw server:info --output=json
dw debug workflow <workflow-id> --output=json
dw workflow:history <workflow-id> <run-id> --output=json
```

Para la interfaz MCP de la aplicación de ejemplo, llama a:

```json
{"tool": "diagnose_workflow", "arguments": {"workflow_id": "<workflow_id>"}}
```

Lee `root_cause.category`, `remediation.classification` y
`remediation.automatic_repair.allowed`. Llama a `repair_workflow` solo cuando
el último campo sea verdadero:

```json
{"tool": "repair_workflow", "arguments": {"workflow_id": "<workflow_id>"}}
```

Si Waterline está disponible, exporta el historial de la ejecución seleccionada.
La exportación incluye eventos tipados de historial, contexto de ejecución
seleccionada, esperas, temporizadores, linaje, metadatos de fuentes de proyección,
comprobaciones de integridad y fallos duraderos. Estos hechos permiten distinguir
un error de workflow de un worker no disponible, una credencial ausente, una
caída de la cola de tareas, un cliente incompatible o una acción de operador pendiente.

## 6. Informa mediante contratos {#6-report-with-contracts}

Los informes de agentes deben citar hechos estables en lugar de capturas:

- Versión de la documentación y paquete para LLM utilizado.
- ID de workflow, ID de ejecución, namespace y cola de tareas.
- Comando o herramienta MCP invocados.
- Estado JSON, código de salida o motivo de fallo identificado.
- `root_cause.category`, `remediation.classification` y si la reparación estaba
  permitida o fue rechazada.
- Eventos tipados de historial recientes y último fallo duradero.
- Versión de compatibilidad o protocolo de `server:info` o `/api/cluster/info`.

Esta estructura de informe sirve para aplicaciones de ejemplo locales,
despliegues de Server independiente, workers Python y futuros SDK de cliente.

## 7. Evidencia con artefactos publicados {#7-published-proof}

El banco de conformidad de la aplicación de ejemplo demuestra el ciclo de
agentes con artefactos publicados. Su partición MCP realiza:

1. Descubrir: `tools/list` de JSON-RPC y `list_workflows`.
2. Cambiar: elegir el workflow `simple`, sin credenciales, con una `business_key` explícita.
3. Ejecutar: `start_workflow`.
4. Diagnosticar: `diagnose_workflow` con objetos de causa raíz y medidas correctivas.
5. Reparar: `repair_workflow` como modificación segura y estructurada o como rechazo.
6. Verificar: `get_workflow_result`, `diagnose_workflow` y `get_workflow_history`.

La evidencia registra los códigos de estado de las herramientas, el ID de
workflow, el estado de finalización, los ID de esquema de causa raíz, medidas
correctivas y modificación segura, y evidencia acotada del historial en los
metadatos de conformidad.

## Páginas relacionadas {#related-pages}

- [Desarrollo asistido por IA](./ai-assisted-development.md)
- [Contrato de herramientas para agentes](./agent-tooling-contract.md)
- [Interfaz MCP de workflows](./mcp-workflows.md)
- [Aplicación de ejemplo](./sample-app.md)
- [Referencia de comandos del CLI](./polyglot/cli-reference.md)
- [Protocolo de workers](./polyglot/worker-protocol.md)
- [Interfaz de ejecución externa](./polyglot/external-execution.md)
