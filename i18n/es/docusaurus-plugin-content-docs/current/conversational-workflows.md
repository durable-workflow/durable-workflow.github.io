---
sidebar_position: 8
tags:
  - signals
  - queries
  - continue-as-new
  - sample-app
keywords:
  - workflow conversacional
  - conversación de larga duración
  - aprobación humana
  - sustitución del worker
---

# Referencia de workflows conversacionales {#conversational-workflow-reference}

Esta es una referencia ejecutable de una conversación de larga duración en el
runtime embebido de Laravel. Combina funcionalidades que tienen sus propias guías:
[señales](./features/signals.md) para la entrada ordenada,
[actividades](./defining-workflows/activities.md) para el trabajo del modelo,
[consultas](./features/queries.md) para el estado y
[continuar como nueva ejecución](./features/continue-as-new.md) para acotar el
historial. Los workers en modo servicio usan las mismas primitivas a través de
sus [guías de SDK](./polyglot/deployment-modes.md).

El código fuente es `ConversationWorkflow` en la
[aplicación de ejemplo](./sample-app.md), en
[`app/Workflows/Conversation`](https://github.com/durable-workflow/sample-app/tree/main/app/Workflows/Conversation).
Usa un modelo falso determinista, por lo que no necesita una cuenta de un
proveedor de IA ni secretos. Es una referencia del patrón de durabilidad, no un
chatbot de producción, y no promete nada sobre latencia ni escala.

## Ejecutarlo {#run-it}

Con el worker de colas de la aplicación de ejemplo en marcha (`composer run dev`):

```bash
php artisan app:conversation \
  --message="Hello" \
  --message="Please refund my order" \
  --message="Thanks" \
  --turns-per-run=2
```

Sin `--message`, el comando pide la entrada. Un mensaje que contenga «refund»
hace que el modelo falso proponga una acción, y el comando pide aprobación.
`--decision=decline` responde con un rechazo a las aprobaciones programadas en
el guion. Abre `/waterline` para inspeccionar cada ejecución de la cadena.

## Cómo funciona un turno {#how-a-turn-works}

```php
#[Signal('message', [['name' => 'text', 'type' => 'string']])]
#[Signal('decision', [
    ['name' => 'approved', 'type' => 'bool'],
    ['name' => 'reviewer', 'type' => 'string'],
])]
class ConversationWorkflow extends Workflow
{
    public function handle(array $state = [], int $turnsPerRun = 3, int $inactivitySeconds = 3600): array
    {
        $this->state = array_replace($this->state, $state);

        while (true) {
            if ($this->turnsThisRun >= $turnsPerRun) {
                return continueAsNew(
                    array_replace($this->state, ['generation' => $this->state['generation'] + 1]),
                    $turnsPerRun,
                    $inactivitySeconds,
                );
            }

            $text = await('message', $inactivitySeconds);

            // A null text is the inactivity timeout; "/end" finishes.
            // Otherwise one turn runs:
            //   activity(FakeModelActivity::class, ...) proposes a reply
            //   await('decision', ...) holds a proposed action for a reviewer
            //   activity(RecordReplyActivity::class, ...) stores the reply
        }
    }
}
```

1. Cada señal `message` es una entrada del usuario. El workflow aplica los
   mensajes aceptados de uno en uno por turno, en el orden en que se aceptaron.
2. La llamada al modelo se ejecuta en una actividad. La reproducción reutiliza
   el resultado registrado en vez de volver a llamar al modelo.
3. Cuando el modelo propone una acción, el workflow espera una señal
   `decision`. Solo una aprobación ejecuta `ApplyApprovedActionActivity`. Un
   rechazo o un vencimiento del plazo registra la respuesta y no cambia nada.
4. `RecordReplyActivity` escribe la respuesta en la tabla
   `conversation_records` de la aplicación con una referencia formada a partir
   del ID del workflow y el número de turno. El historial solo almacena esa
   referencia.
5. La consulta `status` informa de la fase (`waiting_for_input`, `thinking`,
   `awaiting_approval`, `applying_action`, `recording_reply`,
   `continuing_as_new` o `completed`), la generación, el número de turnos,
   cualquier propuesta pendiente y la referencia de la última respuesta. Lee el
   texto de la respuesta mediante esa referencia.

## Qué sobrevive a la pérdida de un worker {#what-survives-a-lost-worker}

Las pruebas del ejemplo ejecutan el motor tarea a tarea y detienen un worker en
un punto elegido:

| Fallo | Qué ocurre |
| --- | --- |
| Un worker obtiene la lease de la tarea que aplica un mensaje y después muere | Nada avanza hasta que vence la lease. Después, la pasada de reparación entrega la misma tarea a otro worker, que aplica el mensaje una vez. |
| Un worker muere mientras se ejecuta la actividad del modelo | Cuando vence la lease, la actividad se reintenta en otro worker. La ejecución registra una sola finalización para esa actividad, y la respuesta se registra una vez. |
| El worker de la respuesta escribe la fila y muere antes de comunicarlo | El reintento vuelve a ejecutar la actividad. Como la fila tiene como clave la referencia, queda una sola respuesta. |

Las actividades se ejecutan al menos una vez: un reintento puede repetir
trabajo que ya ocurrió fuera del motor. El historial duradero registra cada
resultado una vez. Da a cada efecto secundario una clave estable, como hacen las
referencias de respuesta y de acción, y pasa la misma clave a cualquier sistema
externo. Consulta
[garantías de ejecución](./constraints/execution-guarantees.md) y
[vencimiento de leases y reentrega](./constraints/execution-guarantees.md#lease-expiry-and-redelivery).

## Acotar el historial {#bounding-history}

Tras `$turnsPerRun` turnos, la ejecución continúa como nueva ejecución. La
siguiente ejecución solo recibe el estado explícito pasado a `continueAsNew()`:
la generación, el número de turnos, un resumen acotado y la referencia de la
última respuesta. Las demás propiedades del objeto de workflow se reconstruyen
mediante la reproducción y no se copian.

Los mensajes aceptados pero aún no aplicados pasan a la siguiente ejecución en
su orden original. Esto se aplica a las señales declaradas enviadas a la
instancia del workflow. Una señal enviada a una ejecución concreta se rechaza si
esa ejecución se cierra antes. Consulta
[aceptación y cierre de señales](./features/signals.md#acceptance-and-closure)
y [continuar como nueva ejecución](./features/continue-as-new.md).

## Qué sigue siendo responsabilidad tuya {#what-stays-your-responsibility}

- **Almacenamiento de cargas.** El ejemplo guarda el texto de las respuestas en
  una tabla de la aplicación. Elige su retención, control de acceso y copias de
  seguridad, o usa el
  [almacenamiento externo de cargas](./features/external-payload-storage.md).
- **Resumen.** El modelo falso mantiene un resumen acumulado de longitud fija.
  Con un modelo real, tú decides qué contexto atraviesa la continuación como
  nueva ejecución y cuánto puede crecer.
- **Quién puede enviar entradas o aprobar.** El motor registra la señal y sus
  argumentos. Autentica y autoriza a remitentes y revisores en tu aplicación
  antes de enviar la señal; consulta
  [identidad y autorización del remitente](./features/signals.md#sender-identity-and-authorization).
- **Efectos externos.** El motor no hace que una llamada externa ocurra
  exactamente una vez. Usa claves de idempotencia, como hace la actividad de la
  acción aprobada.
- **Envíos de señales reintentados.** Si se pierde la respuesta al envío de una
  señal, consulta
  [tras una respuesta incierta](./features/signals.md#after-an-uncertain-response)
  antes de volver a enviarla.

El ejemplo almacena las respuestas mediante una actividad y no usa flujos de
mensajes desde el código del workflow. En las versiones de Workflow hasta la
2.20.0 inclusive, `outbox()->sendReference()` e `inbox()->receive()` en el
código del workflow no son seguros ante la reproducción
([workflow#1010](https://github.com/durable-workflow/workflow/issues/1010));
consulta la advertencia en [flujos de mensajes](./features/message-streams.md).

## Guías relacionadas {#related-guides}

- [Señales](./features/signals.md) y [consultas](./features/queries.md)
- [Continuar como nueva ejecución](./features/continue-as-new.md)
- [Flujos de mensajes](./features/message-streams.md)
- [Actividades](./defining-workflows/activities.md) y
  [garantías de ejecución](./constraints/execution-guarantees.md)
- [Fallos y recuperación](./failures-and-recovery.md)
- [Aplicación de ejemplo](./sample-app.md)
