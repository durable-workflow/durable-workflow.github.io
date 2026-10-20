---
sidebar_position: 18
---

# Memo {#memo}

Los memos son metadatos clave-valor no indexados que el workflow puede leer y actualizar en cualquier momento de la ejecución. A diferencia de los [atributos de búsqueda](./search-attributes.md), indexados y filtrables, sirven para metadatos estructurados más ricos que aparecen en detalles y exportaciones, pero se excluyen por contrato de filtros y ordenaciones de toda la flota.

## Insertar o actualizar memos {#upserting-memos}

`upsertMemo()` es un helper duradero secuencial. Cada llamada registra un evento tipado `MemoUpserted` y combina las nuevas entradas con el memo guardado de la ejecución.

```php
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, upsertMemo};

final class OrderWorkflow extends Workflow
{
    public function handle(string $orderId, string $customer): array
    {
        upsertMemo([
            'customer_name' => $customer,
            'order_id' => $orderId,
            'status' => 'processing',
            'line_items' => [
                ['sku' => 'WIDGET-1', 'qty' => 2],
                ['sku' => 'GADGET-3', 'qty' => 1],
            ],
        ]);

        $result = activity(ProcessOrderActivity::class, $orderId);

        upsertMemo([
            'status' => 'completed',
            'result_summary' => $result->outcome,
        ]);

        return $result->toArray();
    }
}
```

También puedes establecerlos al iniciar mediante `StartOptions`:

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(OrderWorkflow::class, 'order-123');
$workflow->start(
    'ORD-456',
    'Taylor',
    StartOptions::rejectDuplicate()->withMemo([
        'source' => 'api',
        'priority' => 'high',
    ]),
);
```

## Funcionamiento {#how-it-works}

`upsertMemo()` acepta un array asociativo de pares clave-valor:

- Las **claves** deben ser cadenas no vacías de hasta 64 caracteres.
- Los **valores** pueden ser cualquier dato serializable a JSON: escalares, null, arrays u objetos anidados.
- Un valor `null` elimina esa clave.

Cada llamada:

1. Suspende la fibra del workflow y emite un comando `UpsertMemoCall`.
2. El ejecutor valida y normaliza las entradas, ordenando las claves alfabéticamente.
3. Añade un evento `MemoUpserted` con las `entries` y el resultado completo `merged`.
4. Actualiza la columna `memo` con el mapa combinado.

Al reproducir, reutiliza los eventos registrados sin volver a aplicar la operación, conservando el determinismo.

## Combinación de valores {#merging-behavior}

Las operaciones de una misma ejecución combinan sus valores. Cada una superpone las claves nuevas a las existentes:

```php
// First upsert
upsertMemo(['status' => 'processing', 'customer' => 'Taylor']);
// memo = { customer: Taylor, status: processing }

// Second upsert
upsertMemo(['status' => 'completed', 'result' => 'success']);
// memo = { customer: Taylor, result: success, status: completed }
```

Para eliminar una clave, asígnale `null`:

```php
upsertMemo(['temporary_note' => null]);
```

## Visibilidad {#visibility}

Los memos aparecen en:

- **Detalle de ejecución**: Waterline muestra el memo combinado completo.
- **Cronología del historial**: cada `MemoUpserted` aparece como entrada tipada.
- **Exportación del historial**: las exportaciones JSON incluyen los memos.
- **Describe**: la respuesta `describe` del plano de control incluye el memo actual.

**No** se incluyen en proyecciones de resumen ni están disponibles para filtrar, ordenar o crear vistas guardadas. Usa [atributos de búsqueda](./search-attributes.md) para metadatos indexados y filtrables.

## Continuar como nueva ejecución {#continue-as-new}

El memo actual pasa automáticamente a la nueva ejecución. Esta comienza con el mapa combinado completo de la anterior y puede seguir actualizándolo.

## Estructuras anidadas {#nested-structures}

A diferencia de los atributos de búsqueda, limitados a escalares, los memos admiten JSON anidado:

```php
upsertMemo([
    'order' => [
        'id' => 'ORD-456',
        'items' => [
            ['sku' => 'WIDGET-1', 'qty' => 2],
            ['sku' => 'GADGET-3', 'qty' => 1],
        ],
    ],
    'metadata' => [
        'source' => 'api',
        'version' => 2,
    ],
]);
```

Los objetos anidados tienen las mismas restricciones de claves: cadenas no vacías de hasta 64 caracteres por clave en cada nivel.

## Restricciones {#constraints}

- Claves: cadenas no vacías de hasta 64 caracteres por nivel de anidamiento.
- Valores: cualquier tipo serializable a JSON (escalares, null, arrays u objetos anidados).
- Asignar `null` elimina la clave.
- Los memos son metadatos de consistencia eventual, no la autoridad de reproducción. No bases bifurcaciones del workflow en sus valores.

## Memo, atributos de búsqueda y etiquetas de visibilidad {#memo-vs-search-attributes-vs-visibility-labels}

| | Memo | Atributos de búsqueda | Etiquetas de visibilidad |
|---|---|---|---|
| **Cuándo se fijan** | Al iniciar o durante la ejecución | Durante la ejecución | Solo al iniciar |
| **Mutables** | Sí, con `upsertMemo()` | Sí, con `upsertSearchAttributes()` | No |
| **Tipos de valor** | Cualquier valor serializable a JSON | Solo escalares | Solo escalares |
| **Indexados** | No | Sí | Sí |
| **Filtrables** | No | Sí | Sí |
| **Uso** | Metadatos ricos, notas y contexto | Estado dinámico y seguimiento de progreso | Clasificación estática |
| **Eventos de historial** | `MemoUpserted` por operación | `SearchAttributesUpserted` por operación | Ninguno (se fijan al iniciar) |
