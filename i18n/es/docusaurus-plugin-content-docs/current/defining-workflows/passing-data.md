---
sidebar_position: 4
---

# Pasar datos {#passing-data}

Puedes pasar datos a un workflow mediante el método `start()`.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class);
$workflow->start('world');
```

Los argumentos se pasan al método `handle()` del workflow.

Del mismo modo, puedes pasar datos a una actividad mediante la función auxiliar `activity()`.

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle($name)
    {
        return activity(MyActivity::class, $name);
    }
}
```

Los argumentos se pasan al método `handle()` de la actividad.

```php
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public function handle($name)
    {
        return "Hello, {$name}!";
    }
}
```

import PassingDataSimulator from '@site/src/components/PassingDataSimulator';

<PassingDataSimulator />

En general, pasa solo pequeñas cantidades de datos de esta forma. Para datos grandes, escríbelos en la base de datos, caché o sistema de archivos. Después pasa la clave o ruta al workflow y las actividades, que podrán usarlas para leer los datos.

Cuando la aplicación necesite transportar grandes volúmenes de bytes por el historial, como documentos, blobs multimedia o exportaciones serializadas, habilita [Almacenamiento externo de cargas útiles](../features/external-payload-storage.md) en el espacio de nombres. El runtime traslada las cargas que superen el umbral a un almacén de objetos configurado y registra un sobre de referencia verificable en el historial. Así conserva la integridad de la reproducción respetando el [límite estructural `payload_size_bytes`](../constraints/structural-limits.md#payload-size).

## Resultado {#output}

Una vez completado el workflow, puedes recuperar el resultado mediante `output()`.

```php
$workflow->output();
=> 'Hello, world!'
```

## Modelos {#models}

Pasar modelos funciona de forma similar a `SerializesModels`.

```php
use App\Models\User;
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(User $user)
    {
        return activity(MyActivity::class, $user->name);
    }
}
```

Cuando pasas un modelo Eloquent a un workflow o actividad, solo se serializa su `ModelIdentifier`. Esto reduce el tamaño de la carga útil y mantiene la eficiencia de los workflows.

```
object(ModelIdentifier) {
    id: 42,
    class: "App\Models\User",
    relations: [],
    connection: "mysql"
}
```

Al ejecutarse, el workflow o actividad recupera de la base de datos la instancia completa del modelo, incluidas las relaciones cargadas. Para evitar consultas adicionales durante la ejecución, considera convertir el modelo en un array antes de pasarlo.

## Inyección de dependencias {#dependency-injection}

Además de pasar datos, puedes declarar tipos de dependencias en los métodos `handle()` del workflow o actividad. El contenedor de servicios de Laravel las inyectará automáticamente.

```php
use Illuminate\Contracts\Foundation\Application;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(Application $app)
    {
        if ($app->runningInConsole()) {
            // ...
        }
    }
}
```

La inyección de dependencias no relaja el determinismo del workflow. Puede
declarar servicios estables, como el contenedor de Laravel o lectores de
configuración, pero las dependencias que realizan trabajo siguen necesitando
el límite duradero adecuado. Coloca la E/S externa, el acceso a bases de datos,
las llamadas a servicios y cualquier trabajo que pueda fallar o deba reintentarse
en `activity(...)` o `localActivity(...)`. Usa `sideEffect()` solo para una
instantánea única y segura para la reproducción que deba quedar fijada en el
historial, como una lectura del reloj, aleatoriedad generada o un valor de
configuración capturado al decidir.
