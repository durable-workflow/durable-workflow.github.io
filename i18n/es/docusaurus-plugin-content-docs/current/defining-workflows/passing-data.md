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

Las cargas útiles de V2 usan un formato de valores portable, así que un modelo Eloquent no puede ser argumento ni resultado de un workflow o una actividad. Pasa la clave del modelo y carga el modelo dentro de la actividad que lo usa.

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(int $userId)
    {
        return activity(MyActivity::class, $userId);
    }
}
```

```php
use App\Models\User;
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public function handle(int $userId)
    {
        $user = User::findOrFail($userId);

        return "Hello, {$user->name}!";
    }
}
```

Carga los modelos en actividades, no en el código del workflow. El código del workflow se vuelve a ejecutar durante el replay, y una consulta a la base de datos puede devolver filas distintas en un replay posterior.

Pasar un modelo a `start()` lanza una `InvalidArgumentException`. Pasar un modelo a `activity()` hace fallar la ejecución del workflow. Ambos errores nombran la clase del modelo:

```
unsupported_value_type: Eloquent model App\Models\User cannot cross a V2 payload boundary. Pass its key and load the model inside the activity.
```

La misma regla se aplica a las colecciones de Eloquent. Pasa un array de claves en su lugar. Si la actividad solo necesita algunos atributos, pásalos como array.

En v1, los workflows y las actividades recibían modelos mediante `SerializesModels`, que guardaba un identificador del modelo y lo volvía a cargar al ejecutar el job. V2 no hace esto.

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
