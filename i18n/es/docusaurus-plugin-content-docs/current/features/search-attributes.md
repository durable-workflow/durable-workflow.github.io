---
sidebar_position: 17
---

# Atributos de búsqueda {#search-attributes}

Los atributos de búsqueda son pares clave-valor tipados e indexados que un workflow puede insertar o actualizar durante su ejecución. A diferencia de las etiquetas de visibilidad, fijadas una vez al iniciar, pueden cambiar a medida que avanza el workflow. Sirven para seguir estado, identificadores de clientes u otros metadatos visibles para operadores que cambien durante una ejecución.

## Insertar o actualizar atributos de búsqueda {#upserting-search-attributes}

`upsertSearchAttributes()` es un helper duradero secuencial. Cada llamada registra `SearchAttributesUpserted` y combina los nuevos atributos con los guardados.

```php
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, upsertSearchAttributes};

final class OrderWorkflow extends Workflow
{
    public function handle(string $orderId, string $customer): array
    {
        upsertSearchAttributes([
            'status' => 'processing',
            'customer' => $customer,
            'order_id' => $orderId,
        ]);

        $result = activity(ProcessOrderActivity::class, $orderId);

        upsertSearchAttributes([
            'status' => 'completed',
            'result' => $result->outcome,
        ]);

        return $result->toArray();
    }
}
```

## Establecer atributos al iniciar {#setting-search-attributes-at-start-time}

También puedes fijarlos mediante `StartOptions::withSearchAttributes()`. Se registran de inmediato en la ejecución y aparecen en `StartAccepted` y `WorkflowStarted`. Las llamadas posteriores a `upsertSearchAttributes()` se combinan con ellos.

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(OrderWorkflow::class, 'order-42');
$workflow->start(
    $orderId,
    $customer,
    StartOptions::rejectDuplicate()->withSearchAttributes([
        'env' => 'production',
        'region' => 'us-east',
        'priority' => 'high',
    ]),
);
```

Puedes encadenar `withSearchAttributes()` con otros constructores de `StartOptions`:

```php
$options = StartOptions::rejectDuplicate()
    ->withBusinessKey('order-42')
    ->withLabels(['tenant' => 'acme'])
    ->withMemo(['note' => 'VIP order'])
    ->withSearchAttributes(['priority' => 'high']);

$workflow->start($orderId, $customer, $options);
```

Se aplican las mismas reglas de validación: claves de 1 a 64 caracteres seguros para URL, valores escalares o null, y descarte de valores null sin guardarlos.

### Plano de control {#control-plane}

El método `start()` del plano de control también acepta atributos:

```php
$controlPlane->start('orders.process-order', 'order-42', [
    'arguments' => $serializedArgs,
    'search_attributes' => ['env' => 'production', 'priority' => 'high'],
]);
```

## Funcionamiento {#how-it-works}

`upsertSearchAttributes()` acepta un array asociativo de pares clave-valor:

- Las **claves** deben tener de 1 a 64 caracteres seguros para URL: letras, dígitos, guiones o guiones bajos.
- Los **valores** deben ser escalares (string, int, float, bool) o null; las cadenas tienen un máximo de 191 caracteres.
- Pasar `null` elimina esa clave.

Cada llamada:

1. Suspende la fibra y emite `UpsertSearchAttributesCall`.
2. El ejecutor valida y normaliza los atributos, ordenando claves alfabéticamente.
3. Añade `SearchAttributesUpserted` con los `attributes` modificados y el resultado completo `merged`.
4. Actualiza `search_attributes` con el mapa combinado.
5. Actualiza la proyección de resumen para reflejar el cambio inmediatamente en Waterline.

La reproducción reutiliza los eventos registrados sin volver a aplicar la operación, conservando el determinismo.

## Combinación de valores {#merging-behavior}

Varias operaciones de una misma ejecución combinan sus atributos. Cada una superpone las claves nuevas a las existentes:

```php
// First upsert
upsertSearchAttributes(['status' => 'processing', 'customer' => 'Taylor']);
// search_attributes = { customer: Taylor, status: processing }

// Second upsert
upsertSearchAttributes(['status' => 'completed', 'result' => 'success']);
// search_attributes = { customer: Taylor, result: success, status: completed }
```

Para eliminar una clave, asígnale `null`:

```php
upsertSearchAttributes(['temporary_flag' => null]);
```

## Visibilidad y filtrado {#visibility-and-filtering}

Los atributos aparecen en:

- **Detalle de ejecución**: mapa combinado junto a etiquetas y memo.
- **Proyección de resumen**: resumen desnormalizado para lecturas rápidas.
- **Filtros de visibilidad**: las vistas guardadas de Waterline filtran por sus valores.
- **Cronología de historial**: cada `SearchAttributesUpserted` aparece como entrada tipada.
- **Exportación del historial**: se incluyen en las exportaciones JSON.

### Filtros de lista de padres e hijos {#parent-child-list-filters}

Los hijos [heredan atributos de búsqueda y memo al crearse](./child-workflows.md#child-metadata-inheritance) y luego pueden actualizar sus valores de forma independiente. Filtrar un atributo heredado no excluye implícitamente a los hijos. Para un atributo keyword registrado, la consulta del Server `customer = 'customer-42'` puede devolver al padre y a cada hijo que aún conserve ese valor. El memo sigue siendo metadatos sin índice; no es otro filtro de atributos de búsqueda.

La API de listado del Server 2.11.0 verificada **no tiene un predicado integrado para solo raíces o solo hijos**. `ParentWorkflowId`, `RootWorkflowId` e `IsChildWorkflow` no son campos automáticos de relación en su lenguaje de consultas; las comprobaciones publicadas rechazan esos nombres sin registrar. Registrar un atributo personalizado con uno de esos nombres no rellena la identidad padre/hijo. Un filtro por tipo de workflow selecciona un tipo, no todas las raíces o hijos de distintos tipos.

Inspeccione el linaje de la ejecución cuando necesite la relación real padre/hijo. La filtración compartida más amplia sigue siendo [trabajo de producto](https://github.com/durable-workflow/.github/issues/224); esta limitación y una convención de metadatos del usuario no entregan esa capacidad. La [verificación](https://github.com/durable-workflow/durable-workflow.github.io/issues/368#issuecomment-6362355504) conserva el resultado con padre e hijo y los predicados rechazados.

## Continuar como nueva ejecución {#continue-as-new}

Los atributos actuales pasan automáticamente a la nueva ejecución. Esta comienza con el mapa combinado completo de la anterior y puede seguir actualizándolo.

## Privacidad y límites {#privacy-and-limits}

Son **metadatos de operador en texto plano**: cualquier persona con acceso a Waterline puede verlos y se almacenan sin cifrar. Nunca guardes secretos, contraseñas, tokens ni información de identificación personal (PII) en ellos.

Restricciones:

- Claves: de 1 a 64 caracteres seguros para URL (`[a-zA-Z0-9_-]`).
- Valores: solo escalares (string, int, float, bool); cadenas de hasta 191 caracteres.
- Asignar `null` elimina la clave.

## Atributos de búsqueda, memo y etiquetas de visibilidad {#search-attributes-vs-memo-vs-visibility-labels}

| | Atributos de búsqueda | Memo | Etiquetas de visibilidad |
|---|---|---|---|
| **Cuándo se fijan** | Al iniciar o durante la ejecución | Al iniciar o durante la ejecución | Solo al iniciar |
| **Mutables** | Sí, con `upsertSearchAttributes()` | Sí, con `upsertMemo()` | No |
| **Tipos de valor** | Solo escalares | Cualquier valor serializable a JSON | Solo escalares |
| **Indexados** | Sí | No | Sí |
| **Filtrables** | Sí | No | Sí |
| **Uso** | Estado dinámico y seguimiento de progreso | Metadatos ricos, notas y contexto | Clasificación estática |
| **Eventos de historial** | `SearchAttributesUpserted` por operación | `MemoUpserted` por operación | Ninguno (se fijan al iniciar) |

Para metadatos ricos y estructurados que no necesiten filtros ni ordenación, usa [memo](./memo.md).
