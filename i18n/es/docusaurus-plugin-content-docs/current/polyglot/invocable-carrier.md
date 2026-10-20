---
sidebar_position: 4
title: Transportador HTTP invocable
description: Configura el transportador invocable_http exclusivo de actividades para que el servidor envíe por POST una tarea con lease a un manejador HTTPS y concilie el resultado estructurado.
tags:
  - external-execution
  - invocable-carrier
  - worker-protocol
keywords:
  - transportador invocable
  - invocable_http
  - configuración de ejecutor externo
  - manejador HTTP de actividad
  - sobre de entrada de tarea externa
  - sobre de resultado de tarea externa
---

# Transportador HTTP invocable {#invocable-http-carrier}

El transportador HTTP invocable es el primer transportador concreto definido en
la [interfaz de ejecución externa](./external-execution.md). Se publica mediante
`GET /api/cluster/info` en `worker_protocol.invocable_carrier_contract`, con
`schema: durable-workflow.v2.invocable-carrier.contract`, `version: 1` y
`carrier_type: invocable_http`.

Cuando una asignación de manejador configurada se resuelve a un transportador
`invocable_http`, el servidor invoca el endpoint configurado con el
[sobre de entrada de tarea externa](./external-execution.md#published-contract-seams)
independiente del transportador y concilia la respuesta con el
[sobre de resultado de tarea externa](./external-execution.md#published-contract-seams).
Las tareas de workflow, el orden de señales/actualizaciones, la reproducción y
la modificación del historial permanecen en el servidor. El transportador solo
traslada los sobres declarados de entrada y resultado a través de HTTPS.

## Qué es {#what-it-is}

El transportador sirve para trabajo con garantías de actividad que el equipo
operador prefiera alojar como manejador HTTPS en lugar de worker de sondeo largo:

- actividades de mantenimiento y automatización de plataforma alojadas en un
  servicio HTTP interno
- traspasos de integración acotados que ya terminan en un endpoint HTTPS
- manejadores de actividad serverless o en contenedores con una ruta POST por tipo de actividad

La ejecución de la actividad se delega al endpoint configurado. El servidor
conserva la responsabilidad del estado duradero del workflow, el historial y el
contrato de finalización de actividades.

## Alcance exclusivo de actividades {#activity-only-scope}

El manifiesto publicado fija el alcance en `task_kinds: [activity_task]` y
declara exclusiones explícitas para que la configuración no desplace el límite:

- `workflow_task_execution`: las tareas de workflow permanecen en runtimes reales de workflows
- `workflow_replay`: el transportador nunca reproduce el historial del workflow
- `history_mutation`: los manejadores no pueden editar directamente el historial de eventos
- `generic_webhook_ingress`: la entrada genérica pasa por un adaptador puente,
  no por este transportador

Una asignación con un `kind` que no sea actividad, o un transportador con una
capacidad distinta de `activity_task`, falla la validación de configuración con
`invalid_invocable_carrier_scope` antes de aparecer en la respuesta de sondeo.

## Destino y método HTTPS {#https-target-and-method}

El servidor valida los `target_fields` del transportador antes de exponer una asignación:

| Campo | Obligatorio | Valores permitidos | Notas |
| --- | --- | --- | --- |
| `url` | sí | URL HTTPS absoluta, o HTTP de loopback para desarrollo (`localhost`, `127.0.0.0/8`, `::1`) | Se prohíben las credenciales en la URL (`scheme://user:pass@host`). |
| `method` | no | `POST` | Valor predeterminado: `POST`. No se acepta otro método HTTP. |
| `timeout_seconds` | no | entero 1–900 | Plazo de transporte para un intento de manejador. El servidor/runtime exige por separado el plazo de la tarea. |
| `retry_policy` | no | objeto (véase abajo) | Presupuesto de reintentos de transporte a cargo del transportador. |

Los destinos no válidos se rechazan con `invalid_carrier_target` y nunca
aparecen en la salida de descubrimiento.

## Modelo de autenticación {#auth-model}

Las asignaciones `invocable_http` fuera de loopback deben resolver un `auth_ref`
desde la configuración del ejecutor externo. Solo se permite HTTP invocable
sin autenticación hacia destinos HTTP de loopback para desarrollo local.

- Los `auth_refs` se declaran una vez al inicio de la configuración y se
  referencian desde los valores predeterminados o cada asignación. Los tipos
  admitidos incluyen `profile`, `env`, `token_file`, `mtls` y `signed_headers`.
- Una asignación a un destino fuera de loopback sin `auth_ref` efectivo falla
  la validación con `missing_invocable_auth_ref`.
- Los tokens, secretos, firmas y cabeceras de autorización nunca se reproducen
  en diagnósticos del clúster, la salida de `dw server:info` ni respuestas de
  sondeo. Los diagnósticos indican qué `auth_ref` se resolvió y su resumen
  censurado, nunca el valor de la credencial.

Así el operador puede leer los diagnósticos censurados del runtime y confirmar
qué secreto de autenticación se usará sin que el servidor exponga su valor.

## Reintentos de transporte y de actividad duradera {#transport-retry-versus-durable-activity-retry}

La `retry_policy` opcional del transportador invocable es **solo de transporte**.
Rige la entrega HTTP antes de que el manejador informe de un resultado:

| Campo de `retry_policy` | Valores permitidos | Predeterminado | Significado |
| --- | --- | --- | --- |
| `max_attempts` | entero 1–5 | `1` | Máximo de intentos de entrega HTTP por lease de tarea. |
| `backoff_seconds` | array de enteros de 0–300, hasta 5 entradas | `[]` | Espera por intento antes del siguiente intento HTTP. |
| `retryable_status_codes` | subconjunto de `[408, 425, 429, "5xx"]` | `[408, 429, "5xx"]` | Códigos de respuesta reintentables en el transporte. |

Los reintentos de transporte nunca se convierten en eventos del historial. El
servidor solo conoce el intento final: el sobre estructurado de éxito/fallo
devuelto por el manejador, un vencimiento de transporte convertido en
`failure.kind=timeout, classification=deadline_exceeded` o una de las rutas
de salida malformada.

Cuando el manejador informa de un resultado, la **política de reintentos
duraderos de actividad sigue bajo la autoridad del servidor/runtime**. Los
reintentos, la planificación y las esperas de tarea siguen la política de
actividad declarada por el workflow. La `retry_policy` del transportador no
la amplía, reemplaza ni sustituye.

## Sobres de solicitud y respuesta {#request-and-response-envelope}

El servidor envía el sobre de entrada independiente del transportador y espera
recibir el sobre de resultado independiente del transportador:

| Sentido | Tipo de contenido | Esquema |
| --- | --- | --- |
| Solicitud | `application/vnd.durable-workflow.external-task-input+json` | `external_task_input_contract` |
| Respuesta | `application/vnd.durable-workflow.external-task-result+json` | `external_task_result_contract` |

El manejador debe conservar `task.id`, `task.attempt` y `task.idempotency_key`
del sobre de entrada y responder con el sobre declarado de éxito o fallo
(o rechazar la salida mediante una conversión a salida malformada).

El transportador convierte de forma determinista los hechos de transporte en resultados:

- vencimiento de transporte → `failure.kind=timeout`,
  `classification=deadline_exceeded`
- respuesta no 2xx sin sobre de resultado válido → `malformed_output`
- JSON no válido o esquema de respuesta no coincidente → `malformed_output`
- sobre de resultado que contiene una referencia de carga útil no admitida →
  `unsupported_payload`

Los manejadores deben ser idempotentes. El mismo `task.id` y
`task.idempotency_key` puede llegar más de una vez si el transportador reintenta
la entrega o el runtime vuelve a entregar una lease sin finalizar.

## Ejemplo de configuración {#configuration-example}

El servidor lee las asignaciones de manejadores de
`DW_EXTERNAL_EXECUTOR_CONFIG_PATH` y puede seleccionar una configuración
superpuesta con `DW_EXTERNAL_EXECUTOR_CONFIG_OVERLAY`. Consulta la
[referencia de configuración del servidor](./server-config-reference.md) para
ver todas las variables de entorno.

Este documento mínimo `durable-workflow.external-executor.config` registra un
transportador `invocable_http` y una asignación de actividad:

```json
{
  "schema": "durable-workflow.external-executor.config",
  "version": 1,
  "defaults": {
    "profile": "prod",
    "namespace": "operations",
    "task_queue": "operator-tasks",
    "auth_ref": "handler-token"
  },
  "auth_refs": {
    "handler-token": {
      "type": "env",
      "env": "DURABLE_WORKFLOW_HANDLER_TOKEN"
    }
  },
  "carriers": {
    "ops-invocable": {
      "type": "invocable_http",
      "url": "https://handlers.example.com/durable/activity",
      "method": "POST",
      "timeout_seconds": 60,
      "capabilities": ["activity_task"],
      "retry_policy": {
        "max_attempts": 3,
        "backoff_seconds": [2, 5],
        "retryable_status_codes": [408, 429, "5xx"]
      }
    }
  },
  "mappings": [
    {
      "name": "billing.reconcile-ledger",
      "kind": "activity",
      "task_queue": "operator-tasks",
      "activity_type": "billing.reconcile-ledger",
      "carrier": "ops-invocable",
      "handler": "billing.reconcile-ledger",
      "timeout_seconds": 60
    }
  ]
}
```

Una variante local de desarrollo utiliza `"url": "http://127.0.0.1:8080/durable/activity"`
y puede omitir `auth_ref` porque HTTP de loopback es la única ruta sin
autenticación permitida.

## Inspección y diagnóstico {#inspection-and-diagnostics}

Dos comandos de CLI muestran el contrato publicado del transportador invocable
de un servidor en ejecución:

- `dw server:info` muestra el nombre del esquema, la versión del contrato, el
  tipo de transportador y tareas, los tipos de contenido permitidos de solicitud
  y respuesta y los diagnósticos censurados de asignaciones del ejecutor externo.
  Úsalo para confirmar que el servidor cargó las asignaciones esperadas.
- `dw doctor` ejecuta el diagnóstico cluster-info, imprime el bloque
  `invocable_carrier_contract` y muestra los errores
  `invalid_carrier_target`, `missing_invocable_auth_ref`,
  `invalid_invocable_carrier_scope`, `unknown_carrier`, `unknown_auth_ref`,
  o `unknown_handler` que impidieron anunciar una asignación.

La respuesta de sondeo de actividad informa de la asignación resuelta, el
destino del transportador (con autenticación censurada) y la `retry_policy`
efectiva. Los workers y las herramientas operativas utilizan estos campos como
fuente de verdad en lugar de guardar su propia copia del archivo de configuración.

## Coexistencia y despliegue {#coexistence-and-rollout}

El mismo manifiesto publica los límites del despliegue del transportador:

- Un transportador de sondeo y uno `invocable_http` solo pueden compartir cola
  si las asignaciones son específicas del tipo de actividad. Dos asignaciones
  no pueden reclamar el mismo par `(task_queue, activity_type)`.
- Los operadores deben eliminar las asignaciones invocables o deshabilitarlas
  mediante superposición antes de borrar sus credenciales. Retirarlas antes de
  drenar la asignación hace que cada intento nuevo produzca `failure.kind=auth`,
  no un éxito silencioso.
- La `retry_policy` del transportador solo rige el transporte. La política
  duradera de actividad es la única autoridad sobre cuántos intentos observa
  el workflow.

## Interfaces relacionadas {#related-surfaces}

- [Interfaz de ejecución externa](./external-execution.md): el límite de producto
  independiente del transportador que implementa este componente.
- [Manejador PHP de actividades invocables](./invocable-php-handler.md): el
  método auxiliar PHP que un proceso externo utiliza para analizar sobres de
  entrada, despachar funciones de actividad y emitir los sobres de resultado esperados.
- [Referencia de configuración del servidor](./server-config-reference.md):
  variables `DW_EXTERNAL_EXECUTOR_CONFIG_PATH` y `DW_EXTERNAL_EXECUTOR_CONFIG_OVERLAY`.
- [Almacenamiento externo de cargas útiles](../features/external-payload-storage.md):
  cómo se trasladan cargas grandes de solicitud o resultado a un controlador
  configurado y se representan mediante referencias verificables dentro de los
  mismos esquemas de entrada y resultado del transportador.
- [Protocolo de workers](./worker-protocol.md): el contrato general del plano de
  workers que publica este transportador junto a manejadores basados en sondeo.
