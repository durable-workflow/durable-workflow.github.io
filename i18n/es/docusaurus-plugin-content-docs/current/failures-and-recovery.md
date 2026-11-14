---
sidebar_position: 11
title: Fallos y recuperación
description: Diagnostica fallos de actividades, excepciones sin reintentos, vencimiento de plazos de ejecución, limpieza de cancelaciones y acciones de recuperación.
tags:
  - failures
  - recovery
  - operations
keywords:
  - fallos de workflows
  - excepción sin reintentos
  - recuperación de workflows
---

# Fallos y recuperación {#failures-and-recovery}

Antes de investigar un fallo, ten presente el contrato de ejecución:

- Las tareas de workflow se recuperan reproduciendo el historial confirmado.
- Las actividades se ejecutan al menos una vez y pueden repetirse.
- El vencimiento de una lease y la reentrega son vías normales de recuperación.
  No demuestran que el worker anterior no realizara el efecto externo.

Consulta [Garantías de ejecución e idempotencia](./constraints/execution-guarantees.md)
para conocer la semántica exacta de reintentos, reentregas y resultados duraderos.

## Manejo de excepciones {#handling-exceptions}

`Workflow\V2\Activity` usa `$tries = 1` de forma predeterminada: un intento, sin reintento automático tras una excepción. El primer fallo de la actividad se devuelve al workflow. El código puede capturarlo, como en el ejemplo; si no lo maneja, la ejecución falla y queda en un estado terminal.

Los reintentos deben configurarse explícitamente. Establece `$tries` por encima de `1` para permitir más intentos, o en `0` para intentos ilimitados, y elige una política de `backoff()`. Un fallo reintentable se entrega al código del workflow solo cuando se agota el presupuesto de intentos o de tiempo configurado. Un fallo no reintentable omite los reintentos restantes.

```php
use Exception;
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public int $tries = 1;

    public function handle(): void
    {
        throw new Exception();
    }
}
```

```php
use Exception;
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(): void
    {
        try {
            $result = activity(MyActivity::class);
        } catch (Exception) {
            // handle the exception here
        }
    }
}
```

## Excepciones que no admiten reintentos {#non-retryable-exceptions}

Algunas excepciones representan fallos permanentes. Si una actividad lanza una
excepción que no admite reintentos, el motor marca la actividad como fallida y
deja de reintentar inmediatamente.

```php
use Workflow\V2\Activity;
use Workflow\Exceptions\NonRetryableException;

class MyNonRetryableActivity extends Activity
{
    public function handle(): void
    {
        throw new NonRetryableException('This is a non-retryable error');
    }
}
```

## Proceso de recuperación {#recovery-process}

Primero consulta el estado duradero de la ejecución seleccionada y la política de reintentos de la actividad. Con el intento único predeterminado, un fallo de actividad sin manejar ya ha dejado la ejecución en un estado terminal. Desplegar una corrección o llamar a `repair()` no reabre esa ejecución fallida.

Solo es posible corregir el código mientras la ejecución original espera si la actividad aún dispone de un reintento válido. Antes de programarla, configura `$tries` por encima de `1`, o en `0` para intentos ilimitados, junto con `backoff()`. Opcionalmente, define `ActivityOptions::$scheduleToCloseTimeout` para limitar la duración total de la actividad entre todos los intentos; los plazos del workflow siguen aplicándose. Consulta [Reintentos](./configuration/options.md#retries), [Espera entre intentos](./configuration/options.md#backoff) y [ActivityOptions](./configuration/options.md#activityoptions). La política se guarda al programar la actividad, por lo que un despliegue posterior no amplía su presupuesto de intentos ni de tiempo.

Para una ejecución que aún espera una actividad reintentable:

1. Consulta sus registros y localiza los errores o excepciones.
2. Identifica la causa y corrige el código.
3. Despliega la corrección donde se ejecutan los workers de la cola.
4. Reinicia o sustituye gradualmente los workers pertinentes para que carguen el código nuevo y puedan reclamar trabajo de forma segura.
5. Deja que un worker sano ejecute el siguiente intento válido. La reparación o reentrega puede recuperar el transporte de tareas perdido; no concede otro reintento de negocio después de cerrarse la actividad o la ejecución.
6. Verifica el resultado duradero en Waterline, una exportación del historial o la API de Server. Una línea del registro del worker no basta para confirmar el estado.
7. Si la actividad sigue fallando, comprueba los presupuestos restantes de intentos y de tiempo antes de repetir el proceso.

Una ejecución con un reintento de actividad válido permanece en espera y puede continuar cuando el código corregido tenga éxito, siempre que no hayan vencido sus presupuestos originales. Esto no garantiza que todo workflow fallido pueda corregirse en el mismo lugar: el fallo final de una actividad sin manejar, un fallo del código del workflow, un límite estructural o un plazo vencido pueden dejar la ejecución en un estado terminal.

Para una ejecución fallida terminal, conserva el historial y concilia los efectos externos antes de decidir si la aplicación debe iniciar otro workflow. Usa idempotencia en la aplicación para operaciones de negocio repetidas. Si un fallo de actividad no capturado, un fallo del código del workflow o un límite estructural terminó la ejecución, comprueba después de desplegar la corrección si puedes hacer un [redrive](#redrive). El redrive continúa en una ejecución nueva que reutiliza los pasos completados. Un fallo del código del workflow requiere código corregido y Workflow 2.19.0 o una versión posterior. Consulta [Redrive sobre código del workflow corregido](#redrive-corrected-definition). No hay reintento automático del workflow completo ni reapertura de ejecuciones terminales. Consulta [Reintentos a nivel de workflow](#workflow-level-retry).

## Redrive de una ejecución fallida {#redrive}

El redrive continúa una ejecución fallida en una ejecución nueva de la misma instancia de workflow. La ejecución nueva reutiliza los resultados registrados de los pasos que se completaron antes del fallo y vuelve a ejecutar el resto del workflow. Úsalo después de corregir la causa del fallo, para que el trabajo ya completado, como un pago o un correo electrónico, no se repita.

La ejecución fallida sigue cerrada y sin cambios. La ejecución nueva, llamada sucesora, recibe el siguiente número de ejecución y pasa a ser la ejecución actual de la instancia. Su `continued_from_run_id` indica la ejecución fallida. Su evento `WorkflowStarted` registra `recovery_kind: redrive` y `resume_step_sequence`, el paso en el que se reanuda la ejecución.

Esta sección describe el redrive en Workflow 2.20.1 y versiones posteriores. Las versiones anteriores de Workflow, y el redrive en el Server nativo, aceptan menos ejecuciones. Consulta [Versiones anteriores y el Server nativo](#redrive-earlier-releases).

La sucesora vuelve a reproducir el código del workflow desde el principio:

- Cada llamada de actividad que se completó en la ejecución fallida devuelve su resultado registrado. La actividad no se vuelve a ejecutar.
- Un efecto secundario o marcador de versión anterior al paso fallido se reutiliza en orden de pasos. El efecto secundario no se vuelve a ejecutar, y una comprobación de versión devuelve la versión registrada.
- Un `timer()` que se disparó antes del paso fallido se registra en la sucesora como ya disparado. La sucesora no vuelve a esperarlo.
- Un memo o atributo de búsqueda del que el código del workflow hizo upsert antes del paso fallido se reutiliza en orden de pasos, y la sucesora conserva los mismos valores.
- Una espera de señal (`await('name')`) que recibió y aplicó su señal se reutiliza con el valor de la señal. La señal no se vuelve a entregar.
- Un update que se aceptó, se aplicó y se completó antes del paso fallido se vuelve a registrar en la misma posición. El replay ejecuta el handler del update con sus argumentos registrados, así que el estado del workflow coincide. El update no se vuelve a entregar. Un update rechazado, y uno que el fallo cerró antes de ejecutarse, se omiten.
- En Workflow 2.26 y versiones posteriores, una llamada a un workflow hijo que se completó antes del paso fallido devuelve su resultado registrado. El hijo no se vuelve a iniciar. La sucesora registra los eventos `ChildWorkflowScheduled`, `ChildRunStarted` y `ChildRunCompleted` de la llamada y conserva la instancia hija, la ejecución hija, el link id y el call id originales, pero no recibe un enlace hijo propio.
- `outbox()->sendReference()` e `inbox()->receive()` en el código de workflow reutilizado devuelven el mensaje que la ejecución fallida envió o consumió. No lo vuelven a enviar ni a consumir. Un receive en replay cuya llamada original no encontró nada vuelve a leer el stream.
- En Workflow 2.20.2 y versiones posteriores, los mensajes entrantes del stream que siguen pendientes en la ejecución fallida pasan a la sucesora. Workflow 2.20.1 y versiones anteriores los dejaban en la ejecución fallida, así que la sucesora nunca los recibía ([workflow#1013](https://github.com/durable-workflow/workflow/issues/1013)).
- Si un fallo de actividad terminó la ejecución, la llamada de actividad fallida se programa como una ejecución de actividad nueva, con la política de reintentos del código del workflow. Sus intentos empiezan de nuevo.
- Si la ejecución falló en el código del workflow o por un límite estructural, la sucesora se reanuda en el paso que el código del workflow nunca alcanzó.
- Todo lo que sigue al paso fallido se ejecuta como en una ejecución nueva.
- Los memos y atributos de búsqueda definidos al iniciar la ejecución pasan a la sucesora, como en continue-as-new.
- La sucesora conserva el plazo de ejecución de la ejecución fallida. Su tiempo límite de ejecución vuelve a empezar en el redrive.
- Cada paso reutilizado lleva `reused_from_run_id` y `reused_recorded_at`. En un evento reutilizado de update o de señal, los dos siempre van en pareja.
- Un sucesor que reutilizó pasos puede volver a recibir un redrive. Un payload de señal o de update reutilizado conserva en `workflow_run_id` la ejecución que lo registró primero, `reused_from_run_id` indica la ejecución desde la que se hizo el redrive, y cada paso reutilizado conserva la hora en que se ejecutó por primera vez, así que una cadena de redrives reutiliza cada paso una sola vez.
- En modo embedded, `Workflow::now()` en la sucesora empieza en la hora de inicio de la ejecución fallida. La reproducción usa `reused_recorded_at`, así que `Workflow::now()` después de un paso reutilizado coincide con la hora de la ejecución fallida. Después de una llamada reutilizada a un workflow hijo, es la hora en que el hijo terminó por primera vez. Un paso reutilizado por un segundo redrive conserva la hora en que se ejecutó por primera vez.

### Solicitar un redrive {#request-a-redrive}

En modo embedded, resuelve el contrato `Workflow\V2\Contracts\WorkflowControlPlane` desde el contenedor de Laravel y llama a `redrive()` con el id de la instancia de workflow y el id de la ejecución fallida:

```php
use Workflow\V2\Contracts\WorkflowControlPlane;

$result = app(WorkflowControlPlane::class)->redrive($instanceId, $failedRunId, [
    'request_id' => 'incident-42',
]);

if ($result['accepted']) {
    $successorRunId = $result['workflow_run_id'];
} else {
    $reason = $result['reason'];
}
```

En modo servicio, envía `POST /api/workflows/{workflowId}/runs/{runId}/redrive` con un `request_id` opcional en el cuerpo. Los clientes envuelven la misma ruta:

| Superficie | Llamada |
| --- | --- |
| CLI | `dw workflow:redrive <workflow-id> <run-id> --request-id <id>` |
| PHP SDK | `Client::redriveWorkflow($workflowId, $failedRunId, $requestId)` |
| Python SDK | `await client.redrive_workflow(workflow_id, failed_run_id, request_id=...)` o `await handle.redrive()` |
| Rust SDK | `client.redrive_workflow_run(workflow_id, failed_run_id, request_id)` o `handle.redrive(request_id)` |

Un redrive aceptado devuelve el id de ejecución de la sucesora y `resume_step_sequence`. Un redrive rechazado devuelve un `reason` y no cambia nada. Hacer redrive de una ejecución que ya lo tuvo devuelve la sucesora existente en lugar de crear otra. Pasa un `request_id` para que reintentar la solicitud sea seguro. Un `request_id` ya usado para otro redrive de la misma instancia se rechaza con `request_id_already_used`.

Los workers de servicio informan una huella de la definición del workflow. El redrive la compara con la huella registrada al iniciar la ejecución. En el SDK de Rust, llama a `Worker::set_workflow_definition_sources()` para cada workflow que quieras poder recuperar con redrive. Un workflow registrado sin identidad de código fuente sigue ejecutándose, pero el redrive lo rechaza.

### Redrive sobre código del workflow corregido {#redrive-corrected-definition}

Cuando una ejecución falló porque el código del workflow lanzó una excepción, el mismo código volvería a lanzarla en el mismo paso, así que el redrive la rechaza con `workflow_code_failure_requires_corrected_definition`. Despliega la corrección y después solicita el redrive con `allow_definition_change`:

```php
$result = app(WorkflowControlPlane::class)->redrive($instanceId, $failedRunId, [
    'request_id' => 'incident-42',
    'allow_definition_change' => true,
]);
```

Antes de escribir nada, el redrive reproduce en memoria los pasos completados con el código nuevo. El código nuevo debe dar los mismos pasos en el mismo orden y llegar al paso en el que falló el código anterior. Si no puede, el redrive la rechaza con `definition_incompatible_with_prefix`, y `definition_mismatch` indica el primer paso que difiere (`sequence`) y un `kind` como `step_shape` o `version_range`. Si el historial completado supera el presupuesto de historial, el redrive la rechaza con `definition_check_over_budget`.

Un cambio aceptado ejecuta el código corregido y registra la huella de la definición sustituida como `definition_changed_from` en el `WorkflowStarted` de la sucesora. Un redrive posterior sobre la misma definición no registra ninguna.

`allow_definition_change` se aplica a ejecuciones en modo embedded. Para una ejecución que inició un worker de servicio, el redrive rechaza un cambio de definición con `definition_change_requires_replay_check`. Sin `allow_definition_change`, una definición cambiada se rechaza con `workflow_definition_unavailable_or_changed`.

### Cuándo se puede hacer redrive de una ejecución fallida {#redrive-eligibility}

El redrive acepta una ejecución fallida cuando se cumple todo lo siguiente:

- La ejecución es la ejecución actual de la instancia.
- La ejecución falló porque un fallo de actividad llegó al código del workflow y no se capturó, o porque el código del workflow lanzó una excepción o un límite estructural la detuvo. Se rechaza una ejecución que falló por un tiempo límite del workflow.
- Cada paso anterior al paso fallido es una actividad completada, un efecto secundario, un marcador de versión, un `timer()` que se disparó, un upsert de memo o de atributo de búsqueda, una espera de señal que recibió y aplicó su señal, un update que se aceptó, se aplicó y se completó con los mismos argumentos o, en Workflow 2.26 y versiones posteriores, una llamada a un workflow hijo que se completó. Un update rechazado, y uno que el fallo cerró antes de ejecutarse, se permiten y se omiten. Los payloads de actividades, efectos secundarios, señales, updates y resultados de hijos deben guardarse en línea. Un payload en el almacenamiento externo de payloads se rechaza.
- La definición del workflow coincide con la huella registrada al iniciar la ejecución, o pasaste `allow_definition_change` y el código corregido reproduce los pasos completados. Se rechaza un fallo del código del workflow sobre la misma definición.
- El plazo de ejecución no ha vencido.
- La ejecución no tiene workflow padre ni actividades locales, y su entrada está almacenada en línea. Antes de Workflow 2.26, tampoco tiene workflows hijos. Una ejecución que es a su vez un hijo nunca recibe un redrive, porque su padre ya registró el resultado del hijo.
- Cada llamada a un workflow hijo anterior al paso fallido se completó por sí sola, fuera de un grupo paralelo o de un ámbito de cancelación, sin reintento ni continuar como nueva ejecución.
- Si un worker de servicio inició la ejecución, los pasos anteriores al fallo son solo actividades, efectos secundarios, marcadores de versión y temporizadores disparados. Los upserts de memo y de atributo de búsqueda, las esperas de señal, los updates aplicados y las llamadas completadas a workflows hijos se rechazan en ejecuciones de servicio.

Un rechazo indica la primera regla que no se cumplió:

| Motivo | Significado |
| --- | --- |
| `run_not_failed` | La ejecución no está en el estado `failed`. |
| `source_run_not_current` | Existe una ejecución más reciente de la instancia. |
| `unrecorded_failure_boundary` | El fallo de la ejecución no tiene un paso registrado, como un fallo del código del workflow registrado por una versión anterior a 2.19.0. |
| `workflow_code_failure_requires_corrected_definition` | El código del workflow lanzó una excepción y la definición no ha cambiado, así que el mismo código volvería a lanzarla. |
| `unsupported_history` | El historial anterior al fallo contiene un paso que redrive no puede reutilizar, como un temporizador cancelado. Antes de Workflow 2.26, cualquier workflow hijo. |
| `unsupported_open_child` | Una llamada a un workflow hijo anterior al fallo nunca se cerró. Workflow 2.26 y versiones posteriores. |
| `unsupported_child_outcome` | Un workflow hijo anterior al fallo falló, se canceló o se terminó. Workflow 2.26 y versiones posteriores. |
| `unsupported_child_workflow` | Una llamada a un workflow hijo está en un grupo paralelo o en un ámbito de cancelación, se reintentó o continuó como nueva ejecución, o sus eventos no indican una única llamada hija. Workflow 2.26 y versiones posteriores. |
| `external_child_result_not_supported` | El resultado de un workflow hijo completado está en el almacenamiento externo de payloads. Workflow 2.26 y versiones posteriores. |
| `unavailable_child_result` | El resultado de un workflow hijo completado no se puede decodificar. Workflow 2.26 y versiones posteriores. |
| `unsupported_local_activity` | El historial contiene una actividad local. |
| `unsupported_timer` | El historial contiene un tiempo límite de condición o de señal, un temporizador de limpieza tras cancelación, o un temporizador dentro de un ámbito de cancelación o de un grupo paralelo. |
| `incomplete_timer_step` | A un paso de temporizador le falta el evento de programación o el de disparo. |
| `unsupported_signal_wait` | Una espera de señal tiene un tiempo límite, o está dentro de un ámbito de cancelación o de un grupo paralelo. |
| `unsupported_pending_signal` | La ejecución recibió una señal que nunca aplicó. |
| `incomplete_signal_step` | A una espera de señal le falta la recepción o la aplicación, o la aplicación no tiene un valor registrado. |
| `mismatched_signal_receipt` | Una recepción de señal indica otra ejecución, instancia, comando o espera, una misma recepción se aplica a dos esperas, o un evento de señal reutilizado tiene solo uno de `reused_from_run_id` y `reused_recorded_at`, o indica otro origen. |
| `unsupported_pending_update` | La ejecución aceptó un update que nunca aplicó ni cerró. |
| `mismatched_update_history` | Los eventos de un update no tienen ninguna de las formas aceptadas, indican otra ejecución, update, comando o handler, cambian los argumentos entre la aceptación y la aplicación, o tienen incompleta la pareja `reused_from_run_id` y `reused_recorded_at`. |
| `incomplete_update_step` | La finalización de un update aplicado registra un fallo o no tiene resultado. |
| `invalid_step_sequence` | Un paso reutilizado no tiene un número de paso válido. |
| `duplicate_step_sequence` | Dos pasos reutilizados comparten el mismo número de paso. |
| `external_activity_result_not_supported` | Un resultado de actividad completada está en el almacenamiento externo de payloads. |
| `external_side_effect_result_not_supported` | Un resultado de efecto secundario está en el almacenamiento externo de payloads. |
| `external_signal_payload_not_supported` | Los argumentos o el valor aplicado de una señal están en el almacenamiento externo de payloads. Cualquier clave `external_storage` cuenta, aunque sea nula. |
| `external_update_payload_not_supported` | Los argumentos o el resultado de un update están en el almacenamiento externo de payloads. |
| `unavailable_update_payload` | Los argumentos o el resultado en línea de un update no se pueden decodificar. |
| `missing_activity_result`, `unavailable_activity_result` | Falta un resultado de actividad completada o no se puede decodificar. |
| `unsupported_visibility_metadata` | El código del workflow escribió un memo o atributo de búsqueda en un paso que la sucesora no reutilizaría. |
| `unsupported_source_metadata` | La ejecución se inició como hija de otro workflow. |
| `unsupported_source_link_or_payload` | La ejecución está vinculada como hija de otro workflow, o su entrada está en el almacenamiento externo de payloads. |
| `execution_deadline_elapsed` | El plazo de ejecución ha vencido. |
| `workflow_definition_unavailable_or_changed` | Falta la huella de la definición, o difiere de la registrada al inicio y no se pasó `allow_definition_change`. |
| `definition_incompatible_with_prefix` | El código corregido no puede reproducir los pasos completados. `definition_mismatch` indica el primer paso que difiere. |
| `definition_check_over_budget` | El historial completado supera el presupuesto de historial que permite la comprobación de reproducción. |
| `definition_change_requires_replay_check` | Un worker de servicio inició la ejecución, así que el redrive no puede comprobar una definición cambiada. |
| `service_redrive_history_not_qualified` | Un worker de servicio inició la ejecución, y los pasos anteriores al fallo incluyen un upsert de memo, un upsert de atributo de búsqueda, una espera de señal, un update aplicado o una llamada completada a un workflow hijo. Redrive rechaza estos pasos en ejecuciones de servicio hasta que pueda comprobar, para cada runtime de SDK, si puede reproducirlos en replay. |
| `request_id_already_used` | El `request_id` ya se usó para otro redrive de la instancia. |
| `already_redriven` | Lo informan el detalle de la ejecución y `describe()` para una ejecución que ya recibió un redrive. Una solicitud de redrive para ella devuelve en su lugar el sucesor existente. |
| `invalid_request_id` | El `request_id` tiene más de 191 caracteres. |
| `run_not_found`, `instance_not_found` | La ejecución o la instancia no existe en el espacio de nombres. |

Los demás motivos indican un historial que no tiene la forma esperada: `invalid_history`, `events_after_failure`, `duplicate_start`, `missing_start`, `unexpected_start`, `missing_terminal_history`, `invalid_activity_sequence`, `activity_sequence_gap`, `missing_activity_type`, `activity_type_mismatch`, `duplicate_activity_completion`, `incomplete_activity_prefix` e `invalid_failed_step`. Exporta el historial de la ejecución e inspecciónalo antes de decidir cómo recuperarla.

Cuando el redrive rechaza una ejecución, conserva su historial, concilia los efectos externos y decide si la aplicación debe iniciar un workflow nuevo.

### Comprobar si una ejecución admite redrive {#redrive-check}

En Workflow 2.18.0 y versiones posteriores, el detalle de la ejecución informa `can_redrive` y `redrive_blocked_reason`. El detalle de ejecución seleccionada de Waterline lee estos campos. `WorkflowControlPlane::describe()` informa los mismos campos dentro de `actions`. Salen de la misma comprobación que aplica `redrive()`, así que puedes ver si una ejecución admite redrive, y por qué no, antes de solicitarlo.

Una ejecución que no ha fallado informa `run_not_failed`. Una ejecución que ya tuvo redrive informa `already_redriven`. Para una ejecución en modo servicio, el informe solo comprueba que se registró una huella. `redrive()` sigue comparándola con la huella del worker. El informe no ejecuta la comprobación de reproducción del código corregido, así que una definición cambiada muestra `workflow_definition_unavailable_or_changed` hasta que solicitas el redrive con `allow_definition_change`.

En Workflow 2.19.0 y versiones posteriores, una sucesora que ejecuta código corregido informa la huella sustituida como `workflow_definition_changed_from` en el detalle de la ejecución y como `run.definition_changed_from` en `describe()`.

En Workflow 2.20.0 y posteriores, el detalle de la ejecución y `describe()` informan el vínculo de redrive como linaje tipado. `parents` del sucesor y `continuedWorkflows` de la ejecución fallida lo muestran con `link_type: redrive` y `history_authority: typed_history`, y toman el paso y la hora del `WorkflowStarted` del sucesor. Un vínculo que el historial no confirma aparece una vez con `history_authority: mutable_open_fallback` y `diagnostic_only: true`.

### Versiones anteriores y el Server nativo {#redrive-earlier-releases}

Las versiones de Workflow anteriores a 2.26.0 rechazan cualquier workflow hijo del historial con `unsupported_history`. Ignoran `reused_recorded_at` en los eventos de workflows hijos, así que una sucesora de 2.26.0 que reutilizó una llamada hija puede reproducirse allí con una hora del workflow distinta, y plazos distintos, después de la llamada. También rechazan volver a hacerle un redrive. Una vez que exista una sucesora así, mantenga los workers en 2.26.0 o posterior, o confirme que ningún historial así puede reproducirse, antes de volver atrás.

Workflow 2.20.0 no rechaza nada que 2.20.1 acepte. En 2.20.0, `outbox()->sendReference()` en el código de workflow reutilizado vuelve a enviar, y un `inbox()->receive()` en replay puede devolver otros mensajes o ninguno, o consumir un mensaje más nuevo ([workflow#1010](https://github.com/durable-workflow/workflow/issues/1010)).

Workflow 2.19.0 rechaza un update aplicado (`unsupported_history`). También rechaza el redrive de un sucesor que reutilizó un update (`unsupported_history`) o una espera de señal (`mismatched_signal_receipt`). El detalle de la ejecución y `describe()` muestran los vínculos de redrive como respaldo de diagnóstico.

Workflow 2.18.0 reutiliza actividades completadas, efectos secundarios, marcadores de versión y temporizadores disparados. Rechaza un memo o atributo de búsqueda del que el código del workflow hizo upsert (`unsupported_history`), una espera de señal (`unsupported_history`), una ejecución que falló en el código del workflow (`unrecorded_failure_boundary`) y una definición cambiada (`workflow_definition_unavailable_or_changed`).

Las versiones de Workflow anteriores a 2.18.0 aceptan menos ejecuciones. Cada paso anterior a la actividad fallida debe ser una actividad completada. Un efecto secundario, marcador de versión o temporizador en ese historial se rechaza con `unsupported_history`, y cualquier memo o atributo de búsqueda se rechaza con `unsupported_visibility_metadata`. El detalle de la ejecución y `describe()` no informan `can_redrive` ni `redrive_blocked_reason`.

Las versiones anteriores a 2.19.0 ignoran `reused_recorded_at` en los pasos reutilizados de señal, memo y atributo de búsqueda. Después de que un sucesor de Workflow 2.19.0 o posterior reutilice esos pasos, mantenga workers de 2.19.0 o posteriores, o confirme que ningún historial así puede reproducirse, antes de volver atrás. En modo embebido, Workflow 2.19.0 reproduce, importa y reanuda un sucesor de 2.20.0 que reutilizó un update o una espera de señal encadenada igual que 2.20.0 ([comprobante de calificación](https://github.com/durable-workflow/workflow/issues/864#issuecomment-6617902412)).

Desde 3.7.0, el redrive del Server nativo transfiere al sucesor memos y atributos de búsqueda establecidos al inicio, y `describe()` informa `can_redrive` y `redrive_blocked_reason` bajo `actions`. Desde 3.8.0 también reutiliza efectos laterales y marcadores de versión previos al paso fallido, registrando payload original, `reused_from_run_id` y `reused_recorded_at`. Las versiones nativas 3.8.0–3.10.x conservan las cadenas de timestamps reutilizadas existentes, pero escriben respaldos de reloj nuevos con segundos enteros; esas escrituras no acreditan igualdad fraccionaria del reloj de replay. Rechazan upserts de memo/atributos desde el workflow (`service_redrive_history_not_qualified`), resultados de efectos laterales externos (`external_side_effect_result_not_supported`) y temporizadores disparados (`unsupported_history`). La [extensión nativa de temporizadores simples y precisión del reloj](./polyglot/server-api-reference.md#native-redrive-timers) tiene un productor inmutable validado. La adopción estable aún requiere los recibos instalados aplicables de SDK y las condiciones de Chart/release. El trabajo de precisión/referencia de Core y la paridad nativa restante siguen en [server#980](https://github.com/durable-workflow/server/issues/980).

## Rechazo de entrada y recuperación en modo servicio {#service-entry-recovery}

**Soporte publicado.** Server 2.9.9 y los SDK PHP 2.5.4, Python 2.6.2 y Rust 3.5.6 incorporaron las protecciones de entrada y el comportamiento de enrutamiento y recuperación descritos a continuación. Son las versiones mínimas para estas funciones; instale las versiones estables actuales para recibir correcciones de seguridad.

Una entrada incompatible provoca un rechazo de despliegue/replay antes de ejecutar código del workflow, no un reintento de actividad ni un fallo terminal de negocio. El worker comunica `failure_reason = workflow_entry_arguments_mismatch` y Server conserva la tarea fallida con `replay_blocked = true`, en lugar de crear otro intento automáticamente. Su `replay_blocked_reason` genérico es `worker_reported_replay_failure`. La ejecución permanece no terminal, con la entrada, el historial y los plazos registrados intactos. Una excepción lanzada por el cuerpo del workflow después de entrar correctamente sí puede hacer fallar la ejecución.

Recupere solo después de comprobar el estado durable real:

1. Inspeccione la ejecución seleccionada con `GET /api/workflows/{workflowId}/runs/{runId}/debug`. Confirme que `latest_workflow_task_failure.reason` es `workflow_entry_arguments_mismatch` y que el original sigue abierto. Este procedimiento no reabre una ejecución terminal.
2. Despliegue código que acepte los argumentos posicionales o la entrada tipada registrados. Conserve los identificadores originales de workflow y ejecución, namespace, cola, compatibilidad de build, historial y plazos. Nunca edite la entrada almacenada ni la sustituya por nuevos valores predeterminados de DTO.
3. Confirme mediante el [enrutamiento de definiciones](./polyglot/worker-compatibility-routing.md#definition-fingerprint-evolution) que hay un worker elegible. Repair no crea un worker ni demuestra compatibilidad de replay.
4. Use `POST /api/workflows/{workflowId}/runs/{runId}/repair` con las credenciales habituales de operador autorizado y el namespace. La ruta de ejecución seleccionada rechaza un destino histórico en vez de reparar silenciosamente una ejecución más reciente. PHP también ofrece `Client::repairWorkflow($workflowId, $runId)`; `repair_workflow(workflow_id)` de Python apunta a la instancia actual y Rust no tiene un método auxiliar de reparación equivalente.
5. Verifique que el mismo original continúa con su entrada y prefijo de historial registrados y confirma una sola vez el resultado esperado. Un plazo original ya vencido sigue siendo aplicable. Si la sustitución continúa siendo incompatible, inspeccione el nuevo rechazo en vez de repetir repair continuamente.

Las versiones anteriores de Server pueden almacenar el motivo específico del SDK sin clasificarlo como bloqueo de replay; informar del fallo no basta para garantizar que no habrá reintentos automáticos. Use la combinación de runtime y SDK validada. Consulte los límites por lenguaje en [Versionado](./features/versioning.md#service-sdk-entry-safeguard) y las rutas autenticadas de ejecución seleccionada en [Comandos de workflow](./polyglot/server-api-reference.md#workflow-commands).

## Aplicación de los plazos del workflow {#workflow-timeout-enforcement}

Al configurar `StartOptions::withExecutionTimeout()` o
`StartOptions::withRunTimeout()`, el motor guarda un plazo en la ejecución.
El plazo de ejecución abarca todo el workflow lógico, incluidas las ejecuciones
continue-as-new. El plazo de run se reinicia con cada nueva ejecución.

Si el plazo ha vencido al iniciar una tarea de workflow, el motor cierra la
ejecución inmediatamente:

- Cancela las actividades abiertas, los temporizadores y las tareas pendientes,
  y registra eventos tipados como `ActivityCancelled` y `TimerCancelled`.
- Registra un `WorkflowFailure` con `failure_category = timeout` y
  `propagation_kind = timeout`.
- Registra `WorkflowTimedOut` con `timeout_kind` igual a `execution_timeout`
  o `run_timeout`.
- Cambia el estado a `failed` con `closed_reason = timed_out`.
- Notifica a los workflows padres que esperan al hijo.

El supervisor de tareas busca también ejecuciones no terminales con plazos
vencidos y sin tarea de workflow abierta. Esto incluye las que esperan una
actividad o un temporizador. Crea una tarea para que el ejecutor aplique el
vencimiento en la siguiente pasada.

Waterline muestra `failure_category` en la columna de categoría de excepciones
y en los detalles de fallos de la cronología. Las exportaciones del historial
lo incluyen en `failures[*]`. V2 guarda la clasificación al registrar el fallo.
Las filas importadas de v1 que no puedan clasificarse siguen visibles como
diagnósticos sin clasificar.

## Reintentos de actividades {#activity-retries}

Para un presupuesto compartido de intentos entre workflows y colas, combine los límites de reintento con [admission del Server y un breaker de aplicación](./polyglot/task-queue-admission.md#retry-load-and-downstream-budgets). Cuentan los primeros intentos y reintentos; la ejecución local/integrada tiene otros límites.

`Workflow\V2\Activity` usa `$tries = 1` de forma predeterminada. El fallo se
entrega inmediatamente al workflow, salvo que la actividad configure reintentos.

```php
use RuntimeException;
use Workflow\V2\Activity;

class ChargeCard extends Activity
{
    public int $tries = 3;

    public function backoff(): array
    {
        return [5, 30];
    }

    public function handle(): string
    {
        throw new RuntimeException('temporary gateway failure');
    }
}
```

Desde el código del workflow, limita el tiempo total de la actividad, incluidas las esperas en cola y entre intentos:

```php
use Workflow\V2\Support\ActivityOptions;
use function Workflow\V2\activity;

$result = activity(ChargeCard::class, new ActivityOptions(
    scheduleToCloseTimeout: 120,
));
```

En conjunto, estos ajustes permiten como máximo tres intentos, con pausas de 5 y 30 segundos, dentro del plazo original de 120 segundos de schedule-to-close. Si el plazo del workflow vence antes, también se aplica. Habilita reintentos solo para operaciones que puedan repetirse de forma segura y protege los efectos externos con controles de idempotencia.

Cuando falla un intento y aún quedan reintentos, el motor cierra su fila en
`activity_attempts`, devuelve `activity_executions` a `pending`, registra
`ActivityRetryScheduled` y crea una tarea duradera cuyo `available_at` deriva
de `backoff()`. El workflow sigue esperando la misma actividad lógica y recibe
la excepción si falla el último intento.

La tarea guarda `retry_of_task_id`, `retry_after_attempt_id`,
`retry_after_attempt` y `retry_backoff_seconds` para explicar su programación.
El detalle de la ejecución reconstruye el intento fallido en
`activities[*].attempts` a partir del historial tipado, muestra
`ActivityRetryScheduled` en la cronología y expone los contadores
`operator_metrics.activities.retrying`,
`operator_metrics.activities.failed_attempts` y
`operator_metrics.backlog.retrying_activities`.

`Workflow\Exceptions\NonRetryableExceptionContract` interrumpe la política:
una excepción permanente falla la actividad y reanuda el workflow con la
excepción inmediatamente.

### Resolución del retraso entre reintentos {#retry-delay-resolution}

Los valores de `backoff()` de una actividad son segundos enteros. Los intervalos
de reintento duraderos tienen una resolución de un segundo. No use una fracción
como `0.1` para pedir un reintento en 100 ms. Las API de los SDK que generan
intervalos a partir de valores fraccionarios los redondean hacia arriba al
siguiente segundo entero. Las referencias de los SDK de Python y Rust explican
los tipos de parámetros admitidos y sus conversiones.

El siguiente intento puede comenzar al cumplirse el retraso, pero la latencia
de la cola y la carga de los workers pueden demorarlo más. Para pruebas rápidas,
use [tiempo controlado o casos acotados con retraso cero](./testing.md#keeping-delay-tests-fast).

### Identidad de la actividad e idempotencia {#activity-execution-identity-and-idempotency}

El vencimiento de una lease, la pérdida del worker, un informe de finalización
retrasado y la reentrega también pueden producir otro intento o un informe
obsoleto de la misma actividad lógica.

- `activity_execution_id` identifica la actividad lógica a través de reintentos
  y reentregas. Úsalo como clave idempotente predeterminada para efectos remotos.
- `activity_attempt_id` identifica un intento. Úsalo cuando el sistema externo
  necesite distinguir intentos.
- Un informe tardío de un intento sustituido no demuestra que el motor haya
  confirmado el mismo intento dos veces.

Al investigar una finalización tardía después de vencer una lease:

- Consulta Waterline, la exportación del historial o la API para saber qué
  intento confirmó su resultado.
- Un informe tardío rechazado no demuestra que el efecto externo no ocurriera.
- Comprueba el sistema externo por su clave idempotente antes de forzar un
  reintento o una reparación manual.

Haz el efecto remoto idempotente bajo `activity_execution_id` y consulta el
resultado duradero para saber si el motor aceptó el informe del intento.

### Marcas de fallos permanentes {#non-retryable-failure-markers}

Si la excepción implementa `Workflow\Exceptions\NonRetryableExceptionContract`,
el motor guarda `non_retryable = true` en `WorkflowFailure` y en el evento
tipado (`ActivityFailed`, `WorkflowFailed`, `UpdateCompleted`). Esta marca
duradera comunica un fallo permanente a operadores, workers externos y
herramientas: reintentar la misma operación no tendrá éxito. Se registra tanto
si la excepción procede de una actividad como de un workflow.

La marca aparece en todas las superficies de observación:

- **Filas de fallos:** columna booleana `workflow_failures.non_retryable`.
- **Eventos del historial:** campo `non_retryable` del evento tipado.
- **Instantáneas de fallos:** `non_retryable` en `FailureSnapshots::forRun()`.
- **Detalle de ejecución:** `non_retryable` en el array de excepciones.
- **Cronología:** `non_retryable` en los metadatos del fallo.
- **Exportaciones:** `non_retryable` en `failures[*]`.
- **Waterline:** una etiqueta «non-retryable» junto a la categoría del fallo en
  la tabla de excepciones y en la cronología.
- **Puente de workers externos:** `complete()` acepta `non_retryable` para
  informar del fallo sin que el proceso anfitrión resuelva la clase de excepción.

Sin ese contrato, `non_retryable` vale `false` por defecto. La versión final de
v2 registra la marca duradera en el momento del fallo. Declara el contrato antes de
registrar el fallo para que operadores y SDK puedan distinguir los fallos
permanentes de los que admiten reintentos.

```php
use Workflow\Exceptions\NonRetryableExceptionContract;

class PaymentDeclinedException extends \RuntimeException implements NonRetryableExceptionContract
{
    // This failure will be marked as non-retryable in the durable record.
}
```

## Reintentos a nivel de workflow {#workflow-level-retry}

Durable Workflow v2 no reintenta automáticamente un workflow completo. Un fallo
por excepción sin manejar, límite estructural o vencimiento cierra la
ejecución. El motor no inicia otra ejecución de esa instancia automáticamente.

El diseño usa estas herramientas:

- **Reintentos de actividades:** `$tries`, `backoff()` y excepciones permanentes
  gestionan fallos transitorios de cada operación.
- **Reproducción del workflow:** ante un error transitorio de infraestructura,
  como un fallo de base de datos o del worker, el sistema vuelve a entregar la
  tarea y reanuda desde el historial confirmado dentro de la misma ejecución.
- **Continue-as-new:** `continueAsNew()` inicia explícitamente una ejecución
  nueva para renovar el estado o limitar el historial de workflows largos.
- **Reparación:** `repair()` y la reparación automática del bucle del worker
  recuperan ejecuciones cuyo transporte de tareas duraderas se perdió.
- **El redrive es una acción explícita del operador.** El [redrive](#redrive) continúa una ejecución fallida en una ejecución nueva solo cuando lo solicitas, y reutiliza los resultados de las actividades completadas.

Si necesitas reintentos a nivel de workflow, modélalos explícitamente:

```php
use function Workflow\V2\activity;
use Throwable;
use Workflow\V2\Workflow;

class RetryableWorkflow extends Workflow
{
    public function handle(string $orderId): void
    {
        try {
            activity(ProcessOrderActivity::class, $orderId);
        } catch (Throwable $e) {
            // Record the failure, then start a new workflow
            // for retry-at-workflow-level scenarios.
            activity(NotifyFailureActivity::class, $orderId, $e->getMessage());
        }
    }
}
```

## Límites del resumen de timeline de Core {#core-timeline-summary-bounds}

Workflow **2.12.0 o posterior** limita el resumen derivado completo del timeline a 65.535 bytes UTF-8, incluidas etiquetas, puntuación, el marcador ` [truncated]` y cualquier aviso de recuperación de callback. Conserva el fallo registrado autoritativo, su tipo original y la decisión de no reintentar. Compruebe el `composer.lock` real del runtime receptor. El [recibo con paquete instalado normalmente](https://github.com/durable-workflow/workflow/issues/915#issuecomment-6372539577) verifica los límites del resumen independientemente de los límites de reporte del SDK.

El margen de 62 KiB de los SDK no corrige un escritor de resúmenes de Core antiguo. Un fallo de actividad demasiado grande se registra de extremo a extremo ([.github#225](https://github.com/durable-workflow/.github/issues/225)) con PHP SDK 3.5.0, Python SDK 2.11.0 o Rust SDK 4.10.1 contra el Server nativo 3.5.0 o el Server PHP 2.11.3 o posterior, y con Workflow 2.13.0 o posterior en modo embebido. El modo embebido no tiene límite de solicitud, así que Workflow registra el fallo completo y el workflow lo recibe con su tipo original y su mensaje completo. Un mensaje que supera la capacidad `TEXT` de MySQL, o que contiene un byte NUL, se conserva completo en la columna adicional `message_full`; `WorkflowFailure::message`, el historial retenido y las exportaciones del historial devuelven el mensaje completo, mientras que la columna heredada `workflow_failures.message` y las listas de fallos recientes guardan una vista previa acotada y etiquetada. Workflow 2.12.0 acota el resumen del timeline, 2.12.2 añade el almacenamiento del mensaje completo y la lectura en PostgreSQL de mensajes con NUL, y 2.13.0 añade lectores acotados para diagnósticos de resultados rechazados. Ejecute las migraciones del paquete después de actualizar; añaden la columna sin rellenar las filas existentes. El Server nativo 3.5.0 registra un mensaje de fallo de más de 64 KiB que las versiones anteriores rechazaban con `503 storage_unavailable` en MySQL y MariaDB: su fila de fallo conserva una vista previa etiquetada y el historial retenido lleva el fallo completo. Waterline 2.16.0 marca cada mensaje acortado en los detalles de la ejecución. La [reparación de datetime basada en historial](./features/search-attributes.md#repair-datetime-search-attributes) también exige Workflow 2.12.0 o posterior realmente instalado. Repara filas de búsqueda derivadas, no escrituras fallidas del timeline ni historial autoritativo ausente.

## Límites de los informes de error de PHP en modo servicio {#php-failure-report-limits}

El SDK de PHP **3.5.0 o posterior** limita los informes de error salientes en modo servicio a mensajes UTF-8 de 62 KiB, pilas de 128 KiB, 64 KiB de metadatos opcionales combinados y un cuerpo completo codificado de 1 MiB, incluidos los marcadores. Se aplican los límites de transporte conocidos que sean menores. La [guía de informes de PHP](./polyglot/php.md#bounded-failure-reports) explica la configuración, los diagnósticos de omisión, la semántica de reintentos conservada y la igualdad entre la primera ejecución local y la reproducción en frío. Estos límites corresponden a los informes del SDK. El registro integrado y el almacenamiento de resúmenes del Core mantienen sus propios contratos.

## Límites de los informes de error de Python en modo servicio {#python-failure-report-limits}

El SDK de Python **2.11.0 o posterior** limita los informes de error salientes en modo servicio a mensajes UTF-8 de 62 KiB, pilas de 128 KiB, 64 KiB de metadatos opcionales combinados y un cuerpo completo codificado de 1 MiB, incluidos los marcadores. Se aplican los límites de transporte conocidos que sean menores. La [guía de informes de Python](./polyglot/python.md#bounded-failure-reports) explica la configuración, los diagnósticos de omisión, la semántica de reintentos conservada y la igualdad entre la primera ejecución local y la reproducción en frío. Estos límites corresponden a los informes del SDK. El registro integrado y el almacenamiento de resúmenes del Core mantienen sus propios contratos.

## Límites de informes de fallo Rust en modo servicio {#rust-failure-report-limits}

En workers de servicio que realmente ejecutan Rust SDK **4.10.1 o posterior**, el mensaje saliente admite hasta 62 KiB UTF-8 con marcador, stack 128 KiB si existe, metadata opcional serializada combinada 64 KiB y cuerpo completo codificado 1 MiB o un límite de transporte conocido menor. Se conservan tipo, retry e identidad; un envelope obligatorio imposible se rechaza. La [guía Rust](./polyglot/rust.md#bounded-failure-reports) explica marcadores, details Avro íntegros y resultados locales. No cualifica SDK antiguos, modo embedded ni la corrección separada del almacenamiento de resúmenes Core.

## Guías relacionadas {#related-guides}

- [Garantías de ejecución e idempotencia](./constraints/execution-guarantees.md):
  contrato de reproducción, reintentos, leases y reentrega.
- [Monitorización](./monitoring.md): observación de fallos en Waterline,
  exportaciones, registros de workers y telemetría del entorno.
