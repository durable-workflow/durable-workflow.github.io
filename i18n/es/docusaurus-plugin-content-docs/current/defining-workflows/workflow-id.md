---
sidebar_position: 6
---

# ID de workflow {#workflow-id}

## IDs de instancia y de ejecución {#instance-ids-and-run-ids}

Un workflow durable tiene dos identificadores con ciclos de vida distintos:

- El **id de instancia** (`id()`, `workflowId()`) es la referencia pública estable del workflow. Se genera al iniciarlo por primera vez, o lo proporciona quien llama, y nunca cambia durante su vida, incluidas las cadenas de continuación como nueva ejecución.
- El **id de ejecución** (`runId()`) identifica una generación concreta de ejecución de ese workflow. Se asigna uno nuevo en cada ejecución, tanto al inicio como al continuar como nueva ejecución.

Usa el id de instancia como referencia pública para realizar llamadas. Usa el id de ejecución para apuntar a una generación concreta al inspeccionar, depurar o auditar; quienes llaman al plano de control a largo plazo no deben seguirlo.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class);

$id = $workflow->id();

$workflow->start();

$runId = $workflow->runId();
```

Usa el id de instancia para la referencia pública estable del workflow y el id de ejecución para inspeccionar una ejecución concreta.

## Ciclo de vida del id de ejecución {#run-id-lifecycle}

Un id de ejecución identifica una generación. Cada generación de workflow v2 tiene su propio id, y un id de instancia puede abarcar muchas generaciones:

- Un `start()` nuevo crea la primera ejecución y su id.
- `continueAsNew(...)` cierra la ejecución actual como `completed` / `continued` e inicia otra con un nuevo id bajo la misma instancia. Consulta [Continuar como nueva ejecución](/docs/features/continue-as-new).

Como el id de ejecución pertenece a una generación, las llamadas que necesiten comportamiento durable entre transiciones deben resolver por id de instancia:

- Las señales, consultas, actualizaciones y comandos del operador siempre resuelven la ejecución durable más reciente de la instancia. Quien llama no necesita seguir los ids al continuar como nueva ejecución.
- Las herramientas que fijan una generación, como el detalle de ejecución de Waterline, una exportación de historial o un depurador de reproducción, aceptan un id explícito para inspeccionar esa ejecución de forma aislada.

El id de ejecución aparece como `runId()` dentro de workflows y actividades, y como `workflow_run_id` / `run_id` en el historial, las proyecciones y las exportaciones. Siempre pertenece a la generación propietaria del evento o fila. No esperes que el id de eventos antiguos coincida con el id actual de la misma instancia.

## IDs de instancia definidos por el usuario {#user-defined-instance-ids}

Al iniciar un workflow puedes especificar su id. Debe ser una cadena segura para URL de hasta 191 caracteres que solo contenga letras, números, `.`, `_`, `-` y `:`.

```php
$workflow = WorkflowStub::make(MyWorkflow::class, 'order-123');
```

Después puedes cargar el workflow con ese id personalizado.

```php
$workflow = WorkflowStub::load('order-123');
```

### Elegir un ID proporcionado por quien llama {#choosing-a-caller-supplied-id}

Elige un ID que identifique de forma coherente una operación de negocio. Los
reintentos del mismo inicio deben reutilizarlo; genera otro para una operación
distinta. Incluye un prefijo del tipo de workflow y, si hace falta, una referencia
opaca al cliente para evitar colisiones entre aplicaciones que comparten almacén.
Por ejemplo, `order:tenant-7f2:01J9Z6K6Z2EPV5G0C3R8F4M9AN` combina los prefijos
con un identificador resistente a colisiones. El prefijo de cliente es una
convención de nombres, no un límite de autorización. Configura por separado el
aislamiento por espacios de nombres.

El ID no sustituye la [política de inicios duplicados](../configuration/options.md).
Por defecto se rechazan. `ReturnExistingActive` puede devolver el workflow activo
existente sin iniciar otra ejecución ni reemplazar sus argumentos originales.
El ID de una instancia completada sigue reservado; cambiar el tipo de workflow
no vuelve a liberarlo.

### Los IDs son metadatos visibles {#ids-are-visible-metadata}

Los IDs de instancia aparecen en texto plano en Waterline, URL, salida de la CLI,
registros, exportaciones y base de datos. Los códecs de cargas útiles, incluido
el cifrado, no cubren estos identificadores. Usa referencias opacas en lugar de
correos, nombres, tokens u otros datos personales o secretos. Conserva los datos
sensibles de negocio en campos de carga útil protegidos por la política de datos
de tu aplicación. Un ID difícil de adivinar no sustituye la autorización.

## Acceder a los IDs desde actividades y workflows {#accessing-ids-inside-activities-and-workflows}

Dentro de una actividad:

```php
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public function handle(): void
    {
        $id = $this->workflowId();
        $runId = $this->runId();
    }
}
```

Dentro de un workflow, `$this->workflowId()` devuelve el id de instancia y `$this->runId()` devuelve el id de la ejecución seleccionada que se está ejecutando.
