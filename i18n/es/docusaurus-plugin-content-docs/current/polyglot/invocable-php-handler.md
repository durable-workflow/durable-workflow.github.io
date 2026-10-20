---
sidebar_position: 5
title: Manejador PHP de actividades invocables
description: Utiliza InvocableActivityHandler de PHP para alojar manejadores de actividad en un endpoint HTTPS que recibe sobres de entrada de tareas externas y devuelve sobres de resultado.
tags:
  - external-execution
  - invocable-carrier
  - worker-protocol
keywords:
  - manejador de actividad invocable
  - InvocableActivityHandler
  - entrada de tarea externa
  - resultado de tarea externa
  - adaptador PHP de actividad
  - manejador Lambda de actividad
---

# Manejador PHP de actividades invocables {#php-invocable-activity-handler}

El [transportador HTTP invocable](./invocable-carrier.md) permite al servidor
enviar por POST una tarea de actividad con lease a un endpoint HTTPS en lugar
de esperar un worker de sondeo largo. El auxiliar PHP
`Workflow\V2\Support\InvocableActivityHandler` es la implementación de
referencia que un proceso PHP externo utiliza para convertir la solicitud en
un sobre de resultado que el servidor pueda conciliar.

Utilízalo para conectar un manejador de actividad a:

- una AWS Lambda o Google Cloud Function invocada por HTTPS
- un controlador Laravel tras un servicio HTTP sencillo
- un contenedor que exponga un endpoint POST por cola de actividad

El auxiliar analiza el sobre de entrada de tarea externa independiente del
transportador, busca la función registrada, exige el plazo de la lease y emite
el sobre de resultado independiente del transportador, incluidas las estructuras
de fallo que espera el servidor.

## Inicio rápido {#quick-start}

Instala el paquete Durable Workflow en el proceso externo, registra una función
por nombre de manejador de actividad y entrega el cuerpo de la solicitud a
`handle()`:

```php
use Workflow\V2\Support\InvocableActivityHandler;

$handler = new InvocableActivityHandler([
    'billing.charge-card' => static function (int $amount, string $currency): array {
        // Real charge-card logic. Must be idempotent per task id.
        return [
            'approved' => true,
            'amount' => $amount,
            'currency' => $currency,
        ];
    },
]);

$envelope = json_decode(file_get_contents('php://input'), associative: true);
$result = $handler->handle($envelope);

header('Content-Type: application/vnd.durable-workflow.external-task-result+json');
echo json_encode($result, JSON_UNESCAPED_SLASHES);
```

El manejador recibe el sobre de entrada y devuelve el de resultado. El
transportador HTTP invocable se encarga del contrato de transporte (HTTPS, POST,
autenticación, tiempos de espera y presupuesto de reintentos). El auxiliar PHP
se encarga de decodificar argumentos, despachar el manejador, exigir plazos,
codificar resultados y clasificar fallos.

## Registrar manejadores {#registering-handlers}

El primer argumento del constructor es un mapa cuya clave es el valor
`task.handler` que envía el servidor en el sobre de entrada. Es el campo
`handler` de la entrada coincidente de la configuración del ejecutor externo:

```php
new InvocableActivityHandler(
    handlers: [
        'billing.charge-card' => [$billingService, 'chargeCard'],
        'billing.refund' => [$billingService, 'refund'],
        'ops.rotate-key' => static fn (string $keyId): array => $keys->rotate($keyId),
    ],
    carrier: 'billing-lambda',
    resultCodec: 'avro',
);
```

Una entrada con `task.handler` no registrado produce un resultado `failed`
con `failure.kind = application`, `classification = application_error` y
`type = UnknownActivityHandler`. La política de reintentos de actividad
configurada sigue aplicándose en el servidor.

El nombre opcional `carrier` se reproduce en `metadata.carrier` en cada sobre
de resultado para identificar el runtime externo que respondió. Utiliza un
identificador estable que no exponga datos sensibles (`billing-lambda`,
`ops-cloud-run`, `laravel-admin-api`).

El parámetro opcional `resultCodec` controla la serialización del valor devuelto
en `result.payload.blob`. Su valor predeterminado es `avro`, el mismo códec que
utilizan los workers PHP para cargas duraderas. El códec debe estar reconocido
por el `CodecRegistry` del servidor; `protobuf` no se acepta y provoca un error
inmediato en el constructor.

## Sobre de resultado {#result-envelope}

En caso de éxito, `handle()` devuelve el sobre de éxito independiente del transportador:

```json
{
  "schema": "durable-workflow.v2.external-task-result",
  "version": 1,
  "outcome": {
    "status": "succeeded",
    "recorded": true
  },
  "task": {
    "id": "acttask_01HV7D3G3G61TAH2YB5RK45XJS",
    "kind": "activity_task",
    "attempt": 1,
    "idempotency_key": "attempt_01HV7D3KJ1C8WQNNY8MVM8J40X"
  },
  "result": {
    "payload": {
      "codec": "avro",
      "blob": "<base64-encoded payload>"
    },
    "metadata": {
      "content_type": "application/vnd.durable-workflow.result+json"
    }
  },
  "metadata": {
    "handler": "billing.charge-card",
    "carrier": "billing-lambda",
    "duration_ms": 42
  }
}
```

Los campos `task.id`, `task.attempt` y `task.idempotency_key` se copian del
sobre de entrada para que el servidor concilie el resultado con la lease original.

En caso de fallo, `handle()` devuelve el sobre de fallo. El bloque `failure`
contiene el tipo de fallo, la clasificación, el mensaje, el tipo PHP de origen,
la traza de pila y si se puede reintentar. Un fallo de plazo también incluye
el nombre `deadline` y el valor `expires_at`:

```json
{
  "schema": "durable-workflow.v2.external-task-result",
  "version": 1,
  "outcome": {
    "status": "failed",
    "retryable": true,
    "recorded": true
  },
  "task": {"id": "...", "kind": "activity_task", "attempt": 1, "idempotency_key": "..."},
  "failure": {
    "kind": "timeout",
    "classification": "deadline_exceeded",
    "message": "Invocable activity task received after lease.expires_at.",
    "type": "ExternalTaskDeadlineExceeded",
    "stack_trace": null,
    "timeout_type": "deadline_exceeded",
    "cancelled": false,
    "details": {
      "deadline": "lease.expires_at",
      "expires_at": "2026-04-22T15:14:02.000000Z"
    }
  },
  "metadata": {"handler": "billing.charge-card", "carrier": "billing-lambda", "duration_ms": 3}
}
```

## Clasificación de fallos {#failure-taxonomy}

| `failure.kind` | `classification` | Reintentable | Cuándo se produce |
| --- | --- | --- | --- |
| `timeout` | `deadline_exceeded` | sí | La lease o el plazo de entrada ya había vencido al llegar el sobre, o el manejador devolvió después de que venciera durante la ejecución. |
| `decode_failure` | `decode_failure` | no | No se pudieron decodificar los argumentos con el códec declarado, una cadena de plazo no se pudo analizar, el manejador lanzó `TypeError` / `ValueError` por sus parámetros o la carga de éxito no pudo recodificarse con el códec de resultado configurado. |
| `application` | `application_error` | depende de la excepción | El manejador lanzó una excepción. `retryable` es `false` si implementa `Workflow\Exceptions\NonRetryableExceptionContract`; en otro caso, `true`. El mensaje es el de la excepción y `type` es su clase. |
| `application` | `application_error` | no | `task.kind` no es `activity_task` o `task.handler` no está registrado en el mapa. |

El auxiliar nunca devuelve una excepción sin estructurar. Todas las rutas
producen un sobre estructurado para que el transportador invocable concilie la
respuesta de forma determinista.

## Plazos e idempotencia {#deadlines-and-idempotency}

El sobre de entrada contiene el `lease.expires_at` activo y los plazos de
actividad declarados (`schedule_to_start`, `start_to_close`,
`schedule_to_close`, `heartbeat`). El auxiliar comprueba todos:

- Antes de despachar el manejador, cualquier plazo vencido produce directamente
  un fallo `timeout` con `details.deadline` que identifica el campo vencido.
  No se invoca la función registrada.
- Cuando el manejador devuelve, el auxiliar vuelve a comprobar los plazos. Si
  se ejecutó más tiempo que su lease, produce el mismo fallo `timeout` y se
  descarta el valor devuelto del sobre.

Como el transportador reintenta entregas y el runtime vuelve a entregar leases
no notificadas, el mismo `task.id` y `task.idempotency_key` puede llegar más de
una vez. El código del manejador debe ser idempotente. La clave de idempotencia
del sobre es estable entre reintentos del mismo intento de actividad.

## Códecs de cargas útiles y almacenamiento externo {#payload-codecs-and-external-storage}

Las cargas útiles de argumentos llegan en `payloads.arguments` con un campo
`codec`. El auxiliar las decodifica con el `CodecRegistry` del servidor. El
único códec público v2 es `avro`; se rechazan `json`, los códecs desconocidos
y los blobs malformados o sin etiqueta. JSON sigue siendo el documento HTTP
del transportador, no un códec de cargas duraderas.

Cuando las entradas superan el umbral configurado de
[almacenamiento externo de cargas útiles](../features/external-payload-storage.md),
el servidor almacena los bytes mediante el controlador configurado y envía un
sobre de referencia en lugar de un blob en línea. Pasa un
`ExternalPayloadStorageDriver` al constructor para que el auxiliar resuelva
las referencias antes de llamar al manejador:

```php
use Workflow\V2\Contracts\ExternalPayloadStorageDriver;
use Workflow\V2\Support\InvocableActivityHandler;

$handler = new InvocableActivityHandler(
    handlers: $handlers,
    carrier: 'billing-lambda',
    resultCodec: 'avro',
    externalStorage: $driver,
);
```

El controlador debe cumplir el mismo contrato que utiliza el servidor para
escribir la carga, para que coincidan referencia, hash y códec. Una referencia
que el proceso externo no pueda resolver produce `decode_failure` en lugar de
una carga vacía silenciosa.

## Conexión en producción {#production-wiring}

Un controlador Laravel que aloja el manejador tras una única ruta POST tiene
este aspecto:

```php
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Workflow\V2\Support\InvocableActivityHandler;

final class BillingActivityController
{
    public function __construct(private readonly InvocableActivityHandler $handler) {}

    public function __invoke(Request $request): JsonResponse
    {
        $result = $this->handler->handle($request->all());

        return new JsonResponse(
            data: $result,
            headers: ['Content-Type' => 'application/vnd.durable-workflow.external-task-result+json'],
        );
    }
}
```

Apunta la configuración del ejecutor externo a la URL HTTPS de este controlador
y declara un `auth_ref` para autenticar la ruta. La excepción HTTP de loopback
solo se aplica al desarrollo local.

## Interfaces relacionadas {#related-surfaces}

- [Transportador HTTP invocable](./invocable-carrier.md): el contrato del
  transportador del servidor que entrega sobres de entrada y concilia los de resultado.
- [Interfaz de ejecución externa](./external-execution.md): el límite de producto
  independiente del transportador, incluidos los esquemas de entrada y resultado
  que implementa el auxiliar.
- [Almacenamiento externo de cargas útiles](../features/external-payload-storage.md):
  cómo se descargan argumentos o resultados grandes a un controlador configurado
  y se representan mediante un sobre de referencia verificable.
- [Protocolo de workers](./worker-protocol.md): el contrato general del plano
  de workers que publica el contrato del transportador junto a los manejadores
  basados en sondeo.
