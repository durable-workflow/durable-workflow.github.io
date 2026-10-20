---
title: Flujos de salida de workflows
description: Produce y consume flujos de salida duraderos por ejecución con los SDK de PHP, Python y Rust.
tags:
  - service-mode
  - workflow-streams
  - php
  - python
  - rust
---

# Flujos de salida de workflows {#workflow-streams}

Los Workflow Streams son registros de salida con nombre, asociados a una
ejecución y administrados por Durable Workflow Server. PHP, Python y Rust ofrecen
operaciones tipadas para listar, describir, suscribirse, añadir, cerrar y marcar
un error, de modo que las aplicaciones no tienen que construir solicitudes HTTP.
El runtime anuncia `durable-workflow.v2.workflow-streams.contract@1`; la
[matriz de SDK legible por máquinas](/workflow-stream-capabilities.json) registra
la compatibilidad exacta de cada SDK.

Cada flujo asigna posiciones crecientes de forma monótona a partir de 0. El
`next_offset` de una página es la siguiente posición inclusiva que se debe
solicitar. La entrega a consumidores es al menos una vez: completa los efectos
idempotentes de la página y después guarda `next_offset` de forma duradera.
Un fallo antes de guardarlo puede provocar una nueva entrega de elementos.

## Emitir desde el código del workflow {#emit-from-workflow-code}

Los tres SDK emiten mediante el mismo límite de comando determinista:
`record_side_effect.workflow_stream`. Cada SDK deriva la clave de idempotencia
del elemento de la identidad duradera del comando de workflow de la tarea, el
ordinal del comando de flujo y el índice del lote. Server confirma conjuntamente
la modificación del flujo y el efecto registrado. La reproducción consume ese
efecto y no puede crear otro elemento duradero para la misma adición lógica.

PHP:

```php
use DurableWorkflow\Model\WorkflowStreamAppendItem;

$context->appendWorkflowStream('progress', [
    new WorkflowStreamAppendItem(['percent' => 50]),
]);
$context->closeWorkflowStream('progress');
```

Python:

```python
from durable_workflow import WorkflowStreamAppendItem

yield ctx.append_workflow_stream("progress", [
    WorkflowStreamAppendItem(payload={"percent": 50}),
])
yield ctx.close_workflow_stream("progress")
```

Rust:

```rust
let item = WorkflowStreamAppendItem::new(serde_json::json!({"percent": 50}))?;
ctx.append_workflow_stream("progress", &[item], None)?;
ctx.close_workflow_stream("progress", None)?;
```

Los métodos auxiliares de workflow sirven para la autoría determinista. El código
externo a un workflow puede utilizar la operación tipada `append` de cada cliente
y proporcionar su propia clave de idempotencia estable.

## Suscribirse y reanudar {#subscribe-and-resume}

La suscripción lee una página acotada y, opcionalmente, espera nuevos elementos
hasta 60 segundos. PHP acepta un callback de cancelación entre sondeos acotados.
Python acepta la cancelación normal de tareas o un `asyncio.Event` que cancela
el sondeo en curso. Descartar el futuro de suscripción de Rust cancela su solicitud.

| SDK | Operación de página | Valor de reanudación | Iteración tipada |
| --- | --- | --- | --- |
| PHP | `subscribeWorkflowStream(...)` | `WorkflowStreamPage::$nextOffset` | `iterateWorkflowStream(...)` |
| Python | `await subscribe_workflow_stream(...)` | `WorkflowStreamPage.next_offset` | `iter_workflow_stream(...)` |
| Rust | `subscribe_workflow_stream(...).await` | `WorkflowStreamPage::next_offset` | Repetir el futuro de página acotada hasta `terminal`. |

Los estados del ciclo de vida son `open`, `closed` y `errored`. La descripción
tipada también expone `last_offset`, `total_items`, `pending_items` y
`error_reason`. Se rechazan las adiciones a un flujo terminal. Al alcanzar el
límite configurado de elementos pendientes, la adición devuelve `stream_full`;
los productores deben reducir el ritmo o esperar a que los consumidores vacíen el flujo.

## Referencias a cargas útiles externas {#external-payload-references}

Los valores en línea utilizan el sobre compartido Avro Value. Las referencias
externas siguen el contrato de almacenamiento existente de cada SDK, sin
inventar otro transporte:

| SDK | Comportamiento de las referencias externas |
| --- | --- |
| PHP | Añade y devuelve un `payload_reference` opaco; la aplicación sigue encargándose de subir y recuperar los datos del almacenamiento. |
| Python | Utiliza el controlador de almacenamiento externo configurado para subir, verificar la integridad, almacenar en caché, recuperar y decodificar un sobre Avro externo. Sin controlador, se puede añadir o inspeccionar un `payload_reference` opaco. |
| Rust | Añade y devuelve una referencia opaca y sus metadatos. El SDK actual de Rust no ofrece un controlador de almacenamiento externo. |

## Workflow Streams y MessageStream integrado {#workflow-streams-and-embedded-messagestream}

Los nombres coinciden cuando el comportamiento coincide, pero los modelos no son intercambiables.

| Concepto | Workflow Stream en modo servicio | MessageStream integrado en Laravel |
| --- | --- | --- |
| Dirección de destino | Ejecución del workflow + nombre del flujo | Instancia/ejecución del workflow + clave del flujo |
| Sentido | Solo salida del workflow | Bandejas de entrada y salida del workflow |
| Primera posición | 0 | 1 |
| Entrega | Al menos una vez; punto de control a cargo del consumidor | Al menos una vez; cursor de mensajes a cargo del motor |
| Continuar como nuevo | Sin transferencia del cursor del flujo | El cursor de entrada pasa a la ejecución continuada |
| Mensajería entrante del workflow | No disponible; utiliza señales o actualizaciones | Disponible mediante `inbox()->receive()` |

Waterline utiliza una tabla normalizada para ambos modos y muestra el modo, el
ciclo de vida, las posiciones de cabecera/cursor, el número de pendientes, el
sentido y el error. Los flujos de salida del servicio no se presentan como una
bandeja de entrada del workflow.

## Cualificación {#qualification}

El [manifiesto público de escenarios de Workflow Stream](/platform-conformance/workflow-stream-runtime-scenarios.json)
exige ejecuciones con artefactos publicados para un productor PHP y consumidores
Python y Rust, reinicio del worker productor, reconexión del consumidor,
ciclo de vida/contrapresión/cancelación y referencias a cargas útiles externas.
El resultado de publicación debe registrar todos los escenarios exigidos; las
pruebas unitarias del código por sí solas no acreditan la conformidad.
