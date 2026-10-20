---
title: Llamadas de servicio entre espacios de nombres
description: Publica una operación de servicio y llámala de forma duradera desde otro espacio de nombres.
---

# Llamadas de servicio entre espacios de nombres {#cross-namespace-service-calls}

Una operación de servicio, también llamada operación Nexus, es la llamada duradera admitida entre espacios de nombres de un mismo clúster de Durable Workflow. Se identifica mediante el espacio de nombres de destino y la terna endpoint/servicio/operación. Un workflow hijo o una señal ordinaria permanece en su espacio de nombres. Ni el nombre de la cola ni otro lenguaje cambian esta regla.

## Elegir una interfaz admitida {#choose-a-supported-authoring-surface}

| Llamante | Interfaz publicada | Espacio de nombres de destino |
| --- | --- | --- |
| PHP integrado | `Workflow::serviceOperation()` o la función auxiliar `serviceOperation()` | `ServiceOperationOptions(targetNamespace: 'billing')` |
| PHP SDK | `WorkflowContext::serviceOperation()` | Opción de array `namespace => 'billing'` |
| Python SDK | `yield context.call_nexus_service(...)` | Argumento `target_namespace='billing'` |
| Rust SDK | La autoría de esperas Nexus no está publicada | Se sigue en [Rust SDK #86](https://github.com/durable-workflow/sdk-rust/issues/86). Un borrador retenido no es soporte instalable. |

Usa el [ejemplo integrado](../features/service-operations.md) para un workflow Laravel, el [ejemplo del PHP SDK](https://php.durable-workflow.com/build/workflows-activities/) para su API secuencial de worker o la [referencia de workflows de Python](https://python.durable-workflow.com/reference/workflow/) para generadores. Antes de desplegar un llamante, consulta el contrato de operaciones de servicio anunciado por el runtime conectado. Una API de administración del cliente no demuestra por sí sola soporte en el worker de workflows.

En el PHP SDK, la opción de array es actualmente la vía para seleccionar otro espacio de nombres. La opción tipada equivalente se sigue en [PHP SDK #193](https://github.com/durable-workflow/sdk-php/issues/193).

## Publicar la operación de destino {#publish-the-target-operation}

El espacio de nombres de destino posee el endpoint, servicio, operación y worker del manejador. Primero crea el espacio de nombres y ejecuta un worker que registre el tipo de workflow de destino en la cola elegida. Este catálogo usa el espacio `billing`, el tipo `billing.invoice` y la cola `billing`.

Las modificaciones del catálogo requieren credenciales de administrador. El runtime comprueba por separado la autoridad del llamante cuando un workflow con arrendamiento emite su comando de servicio.

```bash
curl --fail-with-body -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/service-endpoints" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: billing" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"endpoint_name":"billing"}'

curl --fail-with-body -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/service-endpoints/billing/services" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: billing" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"service_name":"invoices"}'

curl --fail-with-body -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/service-endpoints/billing/services/invoices/operations" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: billing" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"operation_name":"create","operation_mode":"sync","handler_binding_kind":"start_workflow","handler_target_reference":"billing.invoice","handler_binding":{"workflow_type":"billing.invoice","queue":"billing"},"deadline_policy":{"timeout_seconds":30}}'
```

Los nombres del catálogo se normalizan a minúsculas. Los registros de endpoint y servicio organizan la operación, pero no sustituyen a su manejador real. Mantén disponible un worker compatible en el espacio de nombres de destino. El registro no demuestra que se haya ejecutado trabajo.

## Esperas y resultados registrados {#waiting-and-recorded-results}

El PHP SDK usa por defecto `mode_override=sync` y `wait_for=completed`. Python usa `mode='sync'` y `wait_for='completed'`. Ambos suspenden hasta que el servicio alcanza un desenlace terminal duradero y reproducen el resultado registrado o el fallo tipado en la llamada original. Una llamada pendiente o iniciada no es un resultado de negocio satisfactorio.

Para esperar solo la admisión, PHP usa `wait_for='accepted'` o `mode_override='async'`; Python admite `wait_for='accepted'`, `mode='async'` y la función auxiliar `start_nexus_operation()`. Conserva el id devuelto para inspeccionarlo. Una finalización posterior no sustituye la admisión original registrada del llamante. Espera a la finalización cuando las decisiones del workflow necesiten el resultado del destino.

Limita la ejecución del servicio mediante `deadline_policy` del catálogo, como arriba. Admite exactamente un entero positivo `timeout_seconds` o un `deadline_at` RFC3339 con desplazamiento horario. El runtime registra un único `call_deadline_at` desde la aceptación original. La reproducción, los reintentos y los cambios posteriores del catálogo no lo reinician. Una política null no crea un nuevo plazo de servicio.

No uses `wait_timeout_seconds` del llamante como timeout de ejecución. Una opción de espera de un segundo sin plazo en el catálogo aún puede entregar el resultado de un destino que finaliza después de tres segundos. Tras un timeout, inspecciona la llamada original y el destino vinculado. El vencimiento no demuestra que no se produjeran efectos externos; la cancelación del destino es una política separada.

## Fallos, reintentos e idempotencia {#failures-retries-and-idempotency}

PHP expone los desenlaces terminales fallidos mediante `ServiceOperationFailed`; Python lanza `NexusOperationFailed` en el punto de yield. Conserva los detalles tipados y el id de llamada al gestionar un error. El código del workflow puede gestionar fallos de negocio esperados; los inesperados pueden seguir siendo fallos del workflow.

El runtime controla la política registrada de reintentos del servicio. No añadas un segundo bucle de reintentos HTTP dentro del código del workflow. PHP y Python derivan claves estables para las llamadas habituales. Si la aplicación proporciona una clave, conserva el mismo destino, petición y operación prevista durante reintentos y reproducción. Una clave nueva representa otra petición de negocio, no la recuperación de una confirmación perdida.

Mantén estables el espacio de destino, la terna del catálogo, el payload y las opciones de espera en historiales abiertos. Usa una rama de versión del workflow cuando cambie esa intención duradera.

## Aplicar el límite del espacio de nombres {#enforce-the-namespace-boundary}

El valor predeterminado entre espacios de nombres es `allow`. Siguen aplicándose la autenticación, las comprobaciones de roles, las demás políticas de límites y la autorización del espacio de nombres. La identidad del llamante procede del workflow con arrendamiento; la entrada de la aplicación no puede suplantar otro espacio de nombres llamante.

Para que un PHP Server autogestionado rechace estas llamadas, configura y reinicia sus roles API/worker de forma coherente:

```bash
DW_SERVICE_BOUNDARY_CROSS_NAMESPACE_DEFAULT=deny
```

La política rechaza la llamada entre espacios de nombres antes de despachar el manejador. También debes revisar las llamadas del mismo espacio y las otras políticas de límites. Esta variable no sustituye a las credenciales ni a las ACL de los inquilinos.

## Inspeccionar la llamada original {#inspect-the-original-call}

Usa la [API de detalle de llamadas y catálogo](./server-api-reference.md#service-catalog-admin-apis) o la [inspección de llamadas de servicio del CLI](./cli-reference.md#service-call-inspection). Conserva juntos los ids de workflow/ejecución del llamante y de la llamada de servicio del destino. La inspección de solo lectura no solicita otra ejecución. Reutiliza el id original al comprobar una respuesta perdida o el reemplazo de un worker.
