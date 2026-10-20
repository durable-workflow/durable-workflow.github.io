---
sidebar_position: 6
---

# Esperas por condición {#condition-waits}

`await($condition, $conditionKey = null)` ofrece esperas por condición seguras para la reproducción. Úsalo cuando el predicado solo dependa de estado del workflow ya derivado de entradas duraderas, como actualizaciones o resultados de actividades o hijos. Para obtener directamente el valor de una señal externa con nombre, llama a `await('name')`. Consulta [Señales](./signals.md).

Las esperas por condición se activan mediante un método de actualización, en lugar de mutadores de señal:

```php
use Workflow\UpdateMethod;
use function Workflow\V2\await;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

#[Type('approval-workflow')]
class MyWorkflow extends Workflow
{
    private bool $ready = false;

    public function handle(): void
    {
        await(fn () => $this->ready, 'approval.ready');
    }

    #[UpdateMethod]
    public function setReady(bool $ready = true): array
    {
        $this->ready = $ready;

        return ['ready' => $this->ready];
    }
}
```

La clave opcional de condición es una etiqueta estable y segura para URL que identifica la espera al operador. La reproducción valida la clave registrada para que un despliegue posterior no reutilice accidentalmente el mismo paso con otro predicado. Consulta cómo evolucionar el workflow con seguridad entre despliegues en [Versionado](./versioning.md).

Para una espera por condición con plazo, consulta [Señal + temporizador](./signal+timer.md).

**Importante:** usa `await()` únicamente en workflows, no en actividades.
