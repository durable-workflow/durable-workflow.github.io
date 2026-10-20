---
sidebar_position: 3
title: Interfaz de ejecución externa
description: Utiliza el contrato de ejecución externa independiente del transporte, con garantías de actividad, para tareas acotadas, puentes y manejadores operables por IA.
tags:
  - external-execution
  - bridge-adapters
  - worker-protocol
  - AI
keywords:
  - ejecución externa
  - adaptador puente
  - protocolo de workers de actividad
  - sobre de resultado de tarea
---

# Interfaz de ejecución externa {#external-execution-surface}

Durable Workflow v2 trata la ejecución externa como una interfaz de producto
definida por contrato, no como una convención de shell ni un único transporte de
workers. El servidor independiente publica el contrato general legible por
máquinas en `GET /api/cluster/info`, bajo
`worker_protocol.external_execution_surface_contract`.

El contrato se llama `activity_grade_external_execution`. Sirve para trabajo
duradero y acotado que puede ejecutarse fuera de un runtime completo de workflows:

- actividades de mantenimiento del operador
- automatización de plataforma
- traspasos de integración
- adaptadores puente que inician, señalizan, actualizan o traspasan trabajo
- manejadores mediante scripts, daemons, HTTP, colas, serverless o agentes

El uso principal es la automatización de operaciones, plataforma e integración.
Los agentes de IA y los scripts son consumidores importantes porque necesitan
referencias estables, pero no redefinen el límite del runtime.

## Límites {#boundary}

Los manejadores externos pueden:

- ejecutar una tarea arrendada de workflow o actividad
- comunicar el progreso del arrendamiento con latidos del protocolo de workers
- devolver un sobre estructurado de éxito o fallo
- utilizar un adaptador puente para iniciar, señalizar, actualizar o traspasar trabajo acotado

Los manejadores externos no deben:

- interpretar la semántica de reproducción de workflows
- gestionar el comportamiento de `ContinueAsNew`
- aplicar reglas de orden de señales, actualizaciones o consultas fuera del contrato del runtime
- modificar directamente el historial de eventos
- actuar como un runtime de workflows sin límites

Esas reglas permanecen en el servidor y los runtimes reales de SDK. Un
transportador solo debe trasladar los sobres declarados de entrada y resultado
a través de un límite de transporte.

## Puntos de integración publicados del contrato {#published-contract-seams}

Consulta `GET /api/cluster/info` antes de conectar un transportador. Estas son las rutas v2 pertinentes:

| Ruta | Finalidad |
| --- | --- |
| `worker_protocol.external_execution_surface_contract` | Límites del producto y del runtime, clases válidas de transportador y estado de los puntos de integración. |
| `worker_protocol.external_task_input_contract` | Sobre de entrada independiente del transportador para una tarea arrendada de workflow o actividad. |
| `worker_protocol.external_task_result_contract` | Sobre independiente del transportador para éxito, fallo y salida malformada. |
| `worker_protocol.server_capabilities.external_execution_surface` | Referencia compacta a la capacidad para la negociación del plano de workers. |

La interfaz también identifica puntos de integración previstos para composición
determinista de autenticación/perfil/TLS, asignaciones de manejadores definidas
por configuración, adaptadores puente acotados, almacenamiento externo de cargas
útiles y seguridad de admisión/despliegue. Son puntos del contrato, no detalles
privados de implementación.

## Requisitos del transportador {#carrier-requirements}

Un transportador válido puede ser una CLI o daemon de sondeo, una invocación de
manejador HTTP, un worker basado en colas o una invocación serverless. El
transporte puede variar, pero estos requisitos son comunes:

- emitir el esquema de entrada declarado
- aceptar el esquema de resultado declarado
- conservar `task.id`, `task.attempt` y `task.idempotency_key`
- convertir los fallos de transporte en un fallo estructurado o un resultado de salida malformada
- resolver de forma determinista las entradas de autenticación, TLS, perfil y entorno

Los códigos de salida, stderr, fallos de proceso, fallos HTTP, vencimientos de
visibilidad de cola y errores de plataformas serverless son hechos del
transporte. Solo pasan a ser hechos del workflow cuando el transportador los
convierte al sobre de resultado declarado o a `malformed_output`.

El primer transportador concreto es el [transportador HTTP invocable](./invocable-carrier.md),
publicado en `worker_protocol.invocable_carrier_contract`. Solo admite tareas
de actividad, exige HTTPS (HTTP de loopback solo para desarrollo) y resuelve la
autenticación mediante la configuración del ejecutor externo. Su `retry_policy`
de transporte es distinta de la política de reintentos duraderos de actividad,
cuya autoridad sigue en el servidor/runtime cuando se informa de un resultado.

## Adaptadores puente {#bridge-adapters}

Los adaptadores puente son interfaces acotadas de entrada o traspaso. Pueden
iniciar, señalizar, actualizar o traspasar trabajo, pero no son runtimes de
workflows y no deben ocultar la reproducción ni el comportamiento del historial.

Cada adaptador puente necesita resultados explícitos legibles por máquinas para:

- destino desconocido
- fallo de autenticación
- carga útil malformada
- inicio duplicado
- enrutamiento no compatible
- traspaso aceptado
- traspaso rechazado

Mantén la claridad operativa del resto del plano de control: códigos de estado
estables, valores `reason` con nombre y contexto suficiente para que `dw`,
Waterline, SDK y agentes expliquen lo ocurrido sin analizar texto libre.

La CLI ofrece directamente la interfaz del puente webhook:

```bash
dw bridge:webhook stripe \
  --action=start_workflow \
  --idempotency-key=stripe-event-1001 \
  --target='{"workflow_type":"orders.fulfillment","task_queue":"external-workflows","business_key":"order-1001"}' \
  --input='{"order_id":"order-1001"}' \
  --json
```

La respuesta JSON sigue el mismo contrato de resultados de adaptadores puente
publicado en `/api/cluster/info`, con `outcome`, `reason`,
`control_plane_outcome`, `idempotency_key` y el resumen censurado de `target`.

## Forma operable por agentes {#agent-operable-shape}

La interfaz de ejecución externa forma parte del desarrollo asistido por IA de
v2. Las personas aprenden el invariante de workflow/actividad/reproducción;
las herramientas operan mediante contratos estables:

1. descubrir la interfaz de ejecución externa desde `/api/cluster/info`
2. elegir un transportador que cumpla los requisitos publicados
3. emitir un sobre de entrada de tarea externa
4. conservar la identidad y la idempotencia de la tarea
5. devolver un sobre de éxito, fallo o salida malformada
6. informar de fallos de puente y transporte con resultados con nombre

Así, la generación asistida por IA y la automatización operativa son predecibles:
la herramienta puede citar el manifiesto del protocolo, el sobre de tarea, el
sobre de resultado y el resultado del puente sin inferir el comportamiento de
un único script de demostración.
