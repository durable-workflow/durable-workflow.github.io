---
sidebar_position: 10
---

# Cómo funciona {#how-it-works}

En el modo Laravel integrado, Durable Workflow usa trabajos en cola y
persistencia basada en eventos para crear corrutinas duraderas. Los workflows
se suspenden mediante funciones basadas en Fiber y se reanudan reproduciendo
su historial.

## Entorno de ejecución {#runtime}

Un workflow es una clase cuyo método `handle()` llama directamente a funciones
como `activity()`, `await()`, `timer()`, `sideEffect()`, `child()` y `all([...])`.
Cada llamada suspende el workflow hasta que termina el paso duradero y lo
reanuda con el resultado registrado.

Cada paso produce un evento duradero. Al despertar el workflow, el motor
reproduce el historial, reconstruye el estado y ejecuta el siguiente paso
pendiente. Así puede recuperarse después de reinicios de workers, despliegues
y fallos de máquinas sin perder su posición.

`WorkflowStub::make()` reserva el ID público de la instancia. Al iniciar el
workflow se crean su primera ejecución y su primera tarea. Cada ejecución
tiene un ID propio. Operaciones como `signal()`, `cancel()` y `terminate()`
actúan sobre la ejecución actual de la instancia.

## Persistencia basada en eventos {#event-sourcing}

El estado actual se reconstruye a partir de una secuencia de eventos guardados.
Ese historial permite inspeccionar la ejecución y reanudar el workflow si el
worker falla.

## Corrutinas {#coroutines}

Las corrutinas pueden suspenderse y reanudarse. Los puntos de suspensión
duradera se expresan mediante llamadas directas basadas en Fiber, como
`activity()`, `await()`, `timer()` y `sideEffect()`.

El método `handle()` contiene el código del workflow. El motor comprueba si el
paso ya terminó de forma duradera. Si es así, recupera el resultado del
historial. Si está pendiente, programa la actividad, el temporizador o el
workflow hijo y suspende el workflow hasta que ese paso termine o falle.

## Actividades {#activities}

Un workflow coordina actividades y sus resultados. Cuando llega a una llamada
de actividad, se suspende hasta recibir su resultado y continúa desde ese punto.

Para recuperar una tarea tras un fallo, el motor reproduce los eventos
confirmados y reconstruye el estado con las mismas entradas y salidas.
Un fallo no controlado del workflow deja el run en un estado terminal.
El replay no vuelve a intentar un run fallido.

En v2, las actividades ordinarias son tareas duraderas en cola y pueden
ejecutarse en cualquier worker compatible. Las
[actividades locales](./features/local-activities.md) realizan trabajo breve
en el proceso del worker del workflow, conservando el historial y los reintentos.
Las [sesiones de workers](./features/worker-sessions.md) añaden una lease
explícita si varios pasos necesitan el mismo recurso local. Para registrar un
valor una sola vez sin poner una actividad en cola, usa
[`sideEffect(...)`](./features/side-effects.md). Consulta el contrato en
[Modelo de ejecución de actividades](./features/activity-execution-model.md).

## Garantías de ejecución {#execution-guarantees}

El código de workflow y el de actividad tienen garantías distintas:

- **El código del workflow se reproduce.** La reentrega reconstruye el estado
  desde el historial y ejecuta el código determinista. Los efectos externos
  ya registrados no se repiten.
- **Las actividades se ejecutan al menos una vez.** Los reintentos, la pérdida
  de un worker y el vencimiento de leases pueden causar entregas duplicadas.
- **La identidad de la actividad es duradera.** `activity_execution_id`
  identifica la actividad lógica. `activity_attempt_id` identifica un intento.
  Usa el primero como clave idempotente remota y el segundo cuando el destino
  necesite correlacionar cada intento por separado.

Consulta [Garantías de ejecución e idempotencia](./constraints/execution-guarantees.md),
[Modelo de ejecución de actividades](./features/activity-execution-model.md) y
[Fallos y recuperación](./failures-and-recovery.md) para el contrato completo.

## Colas {#queues}

Laravel admite colas mediante Amazon SQS, Redis o una base de datos relacional.
Los workflows y las actividades usan trabajos en cola. Un workflow se despacha
varias veces: ejecuta sus decisiones, programa trabajo y sale mientras espera.
Una actividad suele terminar en un intento, pero los reintentos, el vencimiento
de una lease o la pérdida del worker pueden provocar nuevas entregas.

## Ejemplo {#example}

```php
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, all};

class MyWorkflow extends Workflow
{
    public function handle(): array
    {
        return [
            activity(TestActivity::class),
            activity(TestOtherActivity::class),
            all([
                fn () => activity(TestParallelActivity::class),
                fn () => activity(TestParallelOtherActivity::class),
            ]),
        ];
    }
}
```

## Diagrama de secuencia {#sequence-diagram}

El diagrama muestra cómo avanza un workflow entre actividades secuenciales
y paralelas.

import ThemedImage from '@site/src/components/ThemedImage';

<ThemedImage
  lightSrc="https://mermaid.ink/img/pako:eNqdkkFrg0AQhf_KMmcTdGOi7iFg2muph4JQvCw6SaTrrl3XtGnIf--qmFakhXZPO2_e9waGuUCuCgQGDb62KHO8L_lB8yqTxL6aa1PmZc2lISnhDUmVftkL9TZvx137CRsT56Y8leY8t-xGy6M5ov7Zl3ijMeGaC4HiFy-dhM6BAUkX223MSGMsOijxwkopI7mqaoEGv5yDrrEW_EzwhNI032N2k5jdf2MSb5LTS_QmDWLizdJ7mf5tKDhw0GUBzOgWHahQV7wr4dJhGdjFVZgBs98C97wVJoNMXi1mV_ysVDWSWrWHI7A9F42t2rrgZryXmwVlgfpOtdIAo14fAewC78BWkbek_ioMgsgLvE0Yrh04dyYrRxENos3GX0V-GFwd-Oinuks_9N1wTV1KLeJS1yJYlEbph-Fq--O9fgJv_eFJ?type=png"
  darkSrc="https://mermaid.ink/img/pako:eNqdkkFrg0AQhf-KzNmE7Gp0dw8B015LPRSE4mXRSSJR165r2jTkv3ejmDZICu2edr557w0Mc4JM5QgCWnzrsM7wsZBbLau0duxrpDZFVjSyNk7iyNZJlN5vSvU-bUeX9gu2JspMcSjMcSpZj5Jns0N9XxeTURhLLcsSy1-09CZ0ahgsyWy1ioTTGmsdSDSzKBFOpqqmRIPfyoFrbEp5dPCAtWl_xqxvYtb_jYnJTU6P6BUNMCaT9B7Tvw0FF7a6yEEY3aELFepKXko4XWwp2MVVmIKw31zqfQppfbYeu99XparRplW33YHYyLK1Vdfk0ozHcqUa6xz1g-pqAyLwWB8C4gQfIDxO5tT3WBhyEpKAsaULRxCUWMw5DXkQ-B73WXh24bOfu5j7zF-wJSWLgFPuUxa4gHlhlH4ajra_3fMXT1fgqg?type=png"
  lightLink="https://mermaid.live/edit#pako:eNqdkkFrg0AQhf_KMmcTdGOi7iFg2muph4JQvCw6SaTrrl3XtGnIf--qmFakhXZPO2_e9waGuUCuCgQGDb62KHO8L_lB8yqTxL6aa1PmZc2lISnhDUmVftkL9TZvx137CRsT56Y8leY8t-xGy6M5ov7Zl3ijMeGaC4HiFy-dhM6BAUkX223MSGMsOijxwkopI7mqaoEGv5yDrrEW_EzwhNI032N2k5jdf2MSb5LTS_QmDWLizdJ7mf5tKDhw0GUBzOgWHahQV7wr4dJhGdjFVZgBs98C97wVJoNMXi1mV_ysVDWSWrWHI7A9F42t2rrgZryXmwVlgfpOtdIAo14fAewC78BWkbek_ioMgsgLvE0Yrh04dyYrRxENos3GX0V-GFwd-Oinuks_9N1wTV1KLeJS1yJYlEbph-Fq--O9fgJv_eFJ"
  darkLink="https://mermaid.live/edit#pako:eNqdkkFrg0AQhf-KzNmE7Gp0dw8B015LPRSE4mXRSSJR165r2jTkv3ejmDZICu2edr557w0Mc4JM5QgCWnzrsM7wsZBbLau0duxrpDZFVjSyNk7iyNZJlN5vSvU-bUeX9gu2JspMcSjMcSpZj5Jns0N9XxeTURhLLcsSy1-09CZ0ahgsyWy1ioTTGmsdSDSzKBFOpqqmRIPfyoFrbEp5dPCAtWl_xqxvYtb_jYnJTU6P6BUNMCaT9B7Tvw0FF7a6yEEY3aELFepKXko4XWwp2MVVmIKw31zqfQppfbYeu99XparRplW33YHYyLK1Vdfk0ozHcqUa6xz1g-pqAyLwWB8C4gQfIDxO5tT3WBhyEpKAsaULRxCUWMw5DXkQ-B73WXh24bOfu5j7zF-wJSWLgFPuUxa4gHlhlH4ajra_3fMXT1fgqg"
  alt="Diagrama de secuencia de un workflow"
/>

1. El workflow se despacha como trabajo en cola.
2. Programa `TestActivity` y sale. Al terminar, la actividad guarda su resultado
   y vuelve a despachar el workflow.
3. El workflow reproduce el historial de la base de datos para reconstruir su
   estado. No necesita mantener un proceso activo mientras espera actividades.
4. Continúa con `TestOtherActivity`. Al terminar, esta guarda su resultado y
   vuelve a despachar el workflow.
5. El workflow reconstruye otra vez el estado a partir del historial.
6. Programa dos actividades paralelas. Ambas guardan sus resultados al terminar
   y devuelven el control al workflow.
7. El workflow reproduce el historial una última vez y completa su ejecución.

## Determinismo {#determinism}

Con el mismo historial, el código del workflow debe producir los mismos
comandos. Consulta [Restricciones](./constraints/overview.md) para conocer las
reglas y las funciones seguras, como `Workflow\now()`, `sideEffect()` y
`getVersion()`, que evitan decisiones no deterministas.
