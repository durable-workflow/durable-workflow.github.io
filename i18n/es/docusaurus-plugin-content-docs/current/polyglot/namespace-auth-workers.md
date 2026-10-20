---
sidebar_position: 4
title: Espacios de nombres, autenticación y registro de workers
description: Referencia de los contratos de resolución de espacios de nombres, autenticación por rol y registro de workers del servidor.
tags:
  - server
  - namespaces
  - authentication
  - worker-protocol
keywords:
  - autenticación de espacios de nombres de Durable Workflow
  - tokens del servidor por rol
  - contrato de registro de workers
  - X-Namespace
---

# Espacios de nombres, autenticación y registro de workers {#namespace-auth-and-worker-registration}

Utiliza esta referencia al aprovisionar un servidor independiente, emitir
credenciales de automatización o implementar un runtime de workers. El servidor
tiene tres contratos separados que deben coincidir antes de procesar trabajo:

- la solicitud indica un espacio de nombres mediante `X-Namespace`,
  `?namespace=` o el predeterminado del servidor
- la credencial tiene el rol requerido por la familia de rutas
- los workers registran el mismo espacio de nombres, cola, runtime, claves de
  tipos y capacidad utilizados en los inicios de workflow y sondeos de tareas

## Autoridad de la solicitud {#request-authority}

Durable Workflow considera el espacio de nombres, el rol de autenticación y la
versión del protocolo como autoridad de la solicitud. No los infieras de ID de
workflows, ID de tareas ni etiquetas de visualización.

| Familia de solicitudes | Rol requerido | Cabecera de versión requerida | Origen del espacio de nombres |
| --- | --- | --- | --- |
| Descubrimiento `GET /api/cluster/info` | `worker`, `operator` o `admin` | ninguna | `X-Namespace` opcional como contexto |
| Listado/descripción de espacios de nombres | `operator` o `admin` | `X-Durable-Workflow-Control-Plane-Version: 2` | destino de la ruta o contexto de la solicitud |
| Creación/actualización/política de almacenamiento de espacios de nombres | `admin` | `X-Durable-Workflow-Control-Plane-Version: 2` | destino de la ruta o cuerpo de la solicitud |
| Visibilidad de workflows, programaciones, colas, adaptadores puente y workers | `operator` o `admin` | `X-Durable-Workflow-Control-Plane-Version: 2` | `X-Namespace`, `?namespace=` y luego predeterminado |
| Salud, métricas, pasadas y pruebas de almacenamiento del sistema | `admin` | `X-Durable-Workflow-Control-Plane-Version: 2` | `X-Namespace`, `?namespace=` y luego predeterminado |
| Registro, sondeo, latidos y finalización de workers | `worker` | `X-Durable-Workflow-Protocol-Version: 1.0` | `X-Namespace`, `?namespace=` y luego predeterminado |

En endpoints protegidos por rol, el servidor comprueba el rol antes de la
existencia del espacio de nombres. Un token con rol incorrecto recibe un fallo
de autenticación sin revelar si existe el espacio. Después de validar rol y
versión, las rutas acotadas rechazan espacios desconocidos con
`reason: "namespace_not_found"`.

## Roles de autenticación {#auth-roles}

La autenticación por token es la ruta predeterminada para producción:

```bash
DW_AUTH_DRIVER=token
DW_WORKER_TOKEN=worker-secret
DW_OPERATOR_TOKEN=operator-secret
DW_ADMIN_TOKEN=admin-secret
```

Si un despliegue utiliza un `DW_AUTH_TOKEN` compartido, ese token tiene en la
práctica todos los permisos de rutas. Prefiere tokens por rol en producción
para impedir que un worker modifique espacios de nombres o ejecute pasadas de
mantenimiento del sistema.

La autenticación por firma tiene la misma separación de roles:

```bash
DW_AUTH_DRIVER=signature
DW_WORKER_SIGNATURE_KEY=worker-signature-secret
DW_OPERATOR_SIGNATURE_KEY=operator-signature-secret
DW_ADMIN_SIGNATURE_KEY=admin-signature-secret
```

`DW_AUTH_DRIVER=none` es exclusivo del desarrollo local. Elimina el límite de
autenticación de todas las rutas y nunca debe exponerse fuera de una red local de confianza.

## Autorización y atribución de señales {#signal-authorization-and-attribution}

Antes de admitir una señal, Server autentica la solicitud y exige la política
configurada de rol y espacio de nombres. Las rutas de señales requieren una
credencial `operator` o `admin`. Estos permisos no implementan la política de
aprobación de pedidos de tu aplicación. Exige esa decisión de negocio en un
gateway de confianza antes de reenviar la señal, o en tu proveedor personalizado
de autenticación compatible. Conserva las credenciales privilegiadas de Server
en ese límite de confianza si los usuarios finales no deben enviar señales directamente.

Server deriva el `principal` de un comando de la credencial autenticada. Un
argumento de señal como `approvedBy` sigue siendo dato de aplicación aunque
coincida con el identificador de un actor. Un gateway con un token de servicio
registra el principal del servicio, no necesariamente a la persona que hizo la
solicitud. Deriva los campos de aprobación humana del usuario autenticado y la
decisión de autorización del gateway en lugar de aceptarlos del cliente.

Para auditoría, las respuestas de comandos y los metadatos vinculados de
comando/historial exponen el principal registrado. El comando persistido lo
guarda en `context.principal`, separado de los argumentos de señal y del valor
devuelto por la espera de señal con nombre del workflow. La ausencia de estos
metadatos no prueba un remitente concreto. Consulta
[el ejemplo de señales integrado](/docs/features/signals#sender-identity-and-authorization)
para una comprobación de políticas Laravel y contexto de comando del host.

Utiliza [tokens de principal con nombre](/docs/polyglot/server-config-reference#authentication)
si la auditoría requiere identificadores estables de actores. Un token de rol
compartido no identifica a un usuario individual y el desarrollo sin
autenticación no proporciona identidad humana autenticada. Las cabeceras de
atribución reenviadas pueden añadir etiquetas de auditoría configuradas, pero
no aportan el principal autenticado por Server. Mantén deshabilitada la
atribución reenviada salvo que se cumplan los
[requisitos del gateway de confianza](/docs/polyglot/server-config-reference#command-attribution).

## Contrato de espacios de nombres {#namespace-contract}

El arranque crea el espacio de nombres predeterminado. Configura
`DW_DEFAULT_NAMESPACE` si omitir la cabecera debe resolver a un espacio distinto
de `default`:

```bash
DW_DEFAULT_NAMESPACE=default
```

Crea cada espacio de nombres de inquilino o entorno antes de dirigirle clientes
o workers:

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/namespaces" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "orders-prod",
    "description": "production order workflows",
    "retention_days": 90
  }'
```

Los nombres se normalizan a minúsculas y pueden contener letras, números,
punto, guion bajo y guion. Son únicos tras la normalización. Por ejemplo,
crear `Production` y después `production` causa un conflicto con
`reason: "namespace_already_exists"`.

Un inicio normal de workflow indica el espacio de nombres con `X-Namespace`:

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/workflows" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_type": "orders.fulfillment",
    "workflow_id": "order-1001",
    "task_queue": "orders",
    "input": ["order-1001"]
  }'
```

Las lecturas del plano de control, comandos de workflow, operaciones de
programación y atributos de búsqueda y visibilidad de colas y workers utilizan
el mismo contexto de espacio de nombres. Las rutas de administración de
espacios son la excepción: seleccionan el espacio en la ruta o el cuerpo y no
requieren que exista antes de ejecutar create o describe.

## Contrato de registro de workers {#worker-registration-contract}

Todo proceso de worker debe registrarse antes de sondear. El registro está
acotado por espacio de nombres, por lo que `(namespace, worker_id)` identifica
su registro. La `task_queue` registrada debe coincidir con los sondeos futuros
de ese ID de worker.

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/worker/register" \
  -H "Authorization: Bearer $DW_WORKER_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Protocol-Version: 1.0" \
  -H "Content-Type: application/json" \
  -d '{
    "worker_id": "py-orders-1",
    "task_queue": "orders",
    "runtime": "python",
    "sdk_version": "<installed-sdk-version>",
    "build_id": "orders-worker-2026-04-22",
    "supported_workflow_types": ["orders.fulfillment"],
    "workflow_definition_fingerprints": {
      "orders.fulfillment": "sha256:definition-fingerprint"
    },
    "supported_activity_types": ["payments.capture"],
    "max_concurrent_workflow_tasks": 10,
    "max_concurrent_activity_tasks": 50
  }'
```

| Campo | Obligatorio | Contrato |
| --- | --- | --- |
| `worker_id` | no | Identidad estable del proceso. El servidor la genera si se omite, pero los runtimes de larga duración deben fijarla para registros y diagnósticos de cola. |
| `task_queue` | sí | Cola sondeada por este worker. Sondear otra cola falla con `reason: "task_queue_mismatch"`. |
| `runtime` | sí | Uno de `php`, `python`, `rust`, `typescript`, `go`, `java` o `external`. Aceptar un identificador de runtime no implica que exista un SDK oficial. |
| `sdk_version` | no | Versión de SDK mostrada en la visibilidad y los diagnósticos de workers. |
| `build_id` | no | Identidad de despliegue/compilación usada en visibilidad por build id y cohortes. Debe ser estable para una familia compatible con la reproducción. |
| `supported_workflow_types` | no | Claves de tipos de workflow que el worker puede reproducir. Vacío significa sin filtro de tipos. |
| `workflow_definition_fingerprints` | no | Huellas deterministas de definición por workflow. Se rechaza volver a registrar un worker activo con una huella cambiada. |
| `supported_activity_types` | no | Claves de tipos de actividad ejecutables. Vacío significa sin filtro de tipos. |
| `max_concurrent_workflow_tasks` | no | Slots locales anunciados para tareas de workflow. Predeterminado `100`; mínimo `1`. |
| `max_concurrent_activity_tasks` | no | Slots locales anunciados para tareas de actividad. Predeterminado `100`; mínimo `1`. |

Se permite volver a registrar un worker activo con el mismo ID si no cambian
las huellas anunciadas. Si un worker cambia el código de un tipo de workflow ya
anunciado, debe reiniciarse con otro `worker_id`; de lo contrario, el registro
falla con `reason: "workflow_definition_changed"`.

`build_id` no es un metadato decorativo. Es la identidad de cohorte del operador
usada por las API de despliegue de colas. Mantén un `build_id` para workers que
puedan reproducir con seguridad el mismo trabajo en curso y cámbialo al crear
otra familia de compatibilidad. Consulta
[Compatibilidad y enrutamiento de workers](/docs/polyglot/worker-compatibility-routing)
para la vinculación y reversión, y [Despliegue de workers por build id](/docs/polyglot/worker-build-id-rollout)
para el flujo de drenaje/reanudación.

## Sondeo y visibilidad {#polling-and-visibility}

Los sondeos deben utilizar el mismo espacio de nombres, ID de worker y cola
del registro:

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/worker/workflow-tasks/poll" \
  -H "Authorization: Bearer $DW_WORKER_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Protocol-Version: 1.0" \
  -H "Content-Type: application/json" \
  -d '{
    "worker_id": "py-orders-1",
    "task_queue": "orders",
    "timeout_seconds": 30
  }'
```

Los operadores pueden inspeccionar ese estado de registro mediante la visibilidad
del plano de control:

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/task-queues/orders" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" | jq '.pollers, .admission'
```

La visibilidad de cola es el primer lugar que comprobar si los workers no
reciben tareas. Distingue workers ausentes, colas no coincidentes, filtros de
tipos no compatibles, slots saturados, límites de leases activas del servidor,
límites de despacho y contrapresión de consultas.

Las respuestas de sondeo exponen el mismo resultado legible por máquinas mediante
`poll_status` si el servidor anuncia
`worker_protocol.server_capabilities.poll_status = true` en `GET /api/cluster/info`.
Las rutas de sondeo de workflows, actividades y consultas conservan el campo
incluso con `task` igual a `null`, para que los runtimes utilicen una interfaz estable:

- `leased`: se concedió la lease de una tarea correctamente.
- `empty`: no había tareas listas antes de devolver el sondeo.
- `throttled`: los límites de admisión impidieron entregar una tarea nueva.
- `unavailable`: el servidor no pudo coordinar la cola con seguridad y devolvió
  un resultado tipado de indisponibilidad en lugar de simular una cola vacía.
- `draining`: la cohorte del worker está drenando; el sondeo falla con HTTP
  `409` y `reason: "worker_draining"` hasta su reanudación.

## Interfaz de errores {#error-surface}

La automatización debe decidir según motivos con nombre en lugar de mensajes de texto.

| Motivo | Dónde | Significado | Acción del operador |
| --- | --- | --- | --- |
| `missing_control_plane_version` | ruta del plano de control | Se omitió `X-Durable-Workflow-Control-Plane-Version: 2`. | Añade la cabecera o actualiza el perfil del cliente. |
| `missing_protocol_version` | ruta de worker | Se omitió `X-Durable-Workflow-Protocol-Version: 1.0`. | Corrige el cliente del worker o la negociación de versión del SDK. |
| `namespace_not_found` | ruta acotada por espacio de nombres | No existe el espacio indicado en `X-Namespace`, la consulta o el valor predeterminado. | Crea el espacio o corrige el del cliente. |
| `namespace_already_exists` | `POST /api/namespaces` | Ya existe el nombre normalizado. | Reutilízalo o elige otro. |
| `task_queue_mismatch` | sondeo de worker | Un ID registrado para una cola intentó sondear otra. | Reinicia con otro ID o sondea la cola registrada. |
| `worker_draining` | sondeo de worker | La cohorte está drenando: puede terminar trabajo en curso pero no reclamar tareas nuevas. | Reanuda la cohorte para revertir o detén el worker tras drenar sus leases actuales. |
| `workflow_definition_changed` | `POST /api/worker/register` | Un ID activo intentó anunciar huellas cambiadas. | Reinicia el proceso modificado con otro ID. |
| `validation_failed` | cualquier ruta JSON | Falta un campo, está malformado, es demasiado grande o está fuera de límites. | Lee `errors` o `validation_errors` y corrige la carga útil. |

## Véase también {#see-also}

- [Referencia de la API del servidor](/docs/polyglot/server-api-reference)
- [Protocolo de workers](/docs/polyglot/worker-protocol)
- [Admisión en colas de tareas](/docs/polyglot/task-queue-admission)
- [Referencia de comandos de la CLI](/docs/polyglot/cli-reference)
