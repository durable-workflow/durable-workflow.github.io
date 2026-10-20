---
title: Cancelación cooperativa
description: Solicita una limpieza con límite de tiempo en un workflow, sus hijos y sus actividades.
---

# Cancelación cooperativa {#cooperative-cancellation}

Server 2.5.0 incorpora la cancelación cooperativa mediante el protocolo 1.20.
Requiere workers que habiliten la cooperación explícitamente. Comprueba el
descubrimiento del runtime y las capacidades del SDK antes de utilizarla.

## Solicitar la limpieza {#request-cleanup}

Utiliza `requestCancellation()` en el SDK de PHP, `request_cancellation()` en
Python o Rust, o la ruta `request-cancellation` de Server. La ejecución permanece
activa mientras el código del workflow atiende la solicitud y realiza la
limpieza. Una limpieza satisfactoria termina la ejecución como `Cancelled`.

```http
POST /api/workflows/{workflowId}/runs/{runId}/request-cancellation
X-Durable-Workflow-Control-Plane-Version: 2
Authorization: Bearer <operator-token>
X-Namespace: <namespace>
Content-Type: application/json

{"reason":"Order withdrawn","cleanup_timeout_seconds":30}
```

La ejecución seleccionada debe seguir siendo la actual. La primera solicitud
aceptada devuelve HTTP 202. Un duplicado devuelve HTTP 200 con la identidad y
el plazo de la solicitud original. Cambiar el tiempo de espera en un duplicado
no amplía el presupuesto de limpieza.

El contexto inmutable de cancelación expone los ID de la solicitud y de la raíz,
el motivo, el solicitante, el origen, la hora original, el plazo y el linaje
ordenado. El código del workflow lo recibe en el límite de entrega registrado.
Las llamadas completadas anteriormente se reproducen de la forma habitual.
Los métodos deterministas `deadline()` y `remaining()` permiten que la limpieza
tome las mismas decisiones después de un reinicio.

El método existente `cancel()` cierra la ejecución inmediatamente y no reanuda
la limpieza del workflow. `terminate()` también la cierra inmediatamente, con
el resultado `Terminated`.

## Elegir las políticas de las operaciones {#choose-operation-policies}

| Política | Workflow hijo | Actividad remota | Actividad local |
| --- | --- | --- | --- |
| TryCancel | Solicitar la limpieza del hijo y continuar la del padre | Solicitar la detención del callback y continuar la limpieza del workflow | Detener el callback supervisado y continuar la limpieza |
| WaitCancellationCompleted | Esperar al resultado terminal registrado del hijo | Esperar al recibo duradero de detención del callback original | Esperar la confirmación duradera de detención del callback original |
| Abandon | Dejar al hijo independiente | Dejar la actividad independiente con su tiempo de espera total finito original | Se rechaza antes de la admisión |

El cierre del padre tiene una política independiente. `RequestCancellation`
envía una solicitud cooperativa con el linaje original de cancelación y un plazo
limitado. `RequestCancel` conserva su comportamiento heredado de cancelación inmediata.

Cada hijo cooperativo hereda la identidad de la solicitud raíz y el presupuesto
de limpieza. Puede recibir un plazo más corto, pero no ampliar ese presupuesto.
Una operación abandonada tiene un ciclo de vida independiente y queda fuera de
la espera conjunta de limpieza.

## Supervisión y recuperación {#supervision-and-recovery}

Los workers cooperativos observan la cancelación de forma independiente de los
latidos de las actividades de la aplicación. PHP utiliza procesos de callback
supervisados. Python supervisa callbacks asíncronos y síncronos. Rust supervisa
los futuros de callbacks asíncronos. El trabajo desacoplado y los servicios
posteriores necesitan sus propios mecanismos de cancelación e idempotencia.

La limpieza puede utilizar una protección contra cancelación para realizar
actividades duraderas, temporizadores y llamadas a hijos. La protección conserva
el plazo original. Si un worker muere, su sustituto reproduce el mismo límite
de entrega y las llamadas de limpieza completadas antes de continuar. El
vencimiento o la terminación revocan la autoridad de ejecución restante.

Un intento antiguo de actividad no puede publicar un resultado después de que
se revoque su autoridad. Los efectos externos ya aceptados siguen necesitando
idempotencia o reconciliación en la aplicación.

## Inspeccionar la cascada {#inspect-the-cascade}

Los diagnósticos de ejecución exponen `cancellation_cascade`, con la solicitud
raíz, las ejecuciones participantes, los intentos de actividad, las políticas,
los recibos de detención, los plazos y los resultados de limpieza. La CLI y
Waterline presentan la misma vista.

El ciclo de vida distingue `requested`, `delivered`, `cleaning_up`, `cancelled`,
`deadline_expired` y `terminated`. Una vista incompleta indica qué no se puede
verificar, sin considerar un recibo ausente como prueba de éxito.

Una solicitud dirigida a una asignación activa incompatible de un worker
devuelve un rechazo explícito de capacidad sin registrar una cancelación parcial.
Actualizar un registro no actualiza una asignación ya emitida.

## Alcance de la versión {#release-boundary}

La versión admite solicitudes para ejecuciones completas, políticas de hijos y
actividades, limpieza protegida con plazo limitado, recuperación e inspección
de cascadas. Los ámbitos de operación cancelables de forma independiente siguen
siendo una vista previa deshabilitada en el código y figuran como experimentales
en la referencia del protocolo.

Consulta la [especificación del protocolo de workers](/platform-protocol-specs/worker-protocol-api.openapi.yaml)
para conocer las estructuras exactas de solicitudes, recibos y capacidades. Las
guías de autoría por lenguaje están en los sitios de los SDK de
[PHP](https://php.durable-workflow.com/), [Python](https://python.durable-workflow.com/)
y [Rust](https://rust.durable-workflow.com/).
