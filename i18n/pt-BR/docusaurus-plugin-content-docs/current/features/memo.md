---
sidebar_position: 18
---

# Memo {#memo}

Memos são metadados de chave e valor não indexados que um workflow pode ler e atualizar a qualquer momento durante a execução. Diferentemente dos [atributos de busca](./search-attributes.md), que são indexados e permitem filtragem, memos foram projetados para metadados estruturados mais ricos que aparecem nas telas de detalhes e exportações de histórico, mas são excluídos por contrato da filtragem e ordenação de toda a frota.

## Inserção e atualização de memos {#upserting-memos}

`upsertMemo()` é um helper durável de fluxo sequencial. Cada chamada registra um evento tipado `MemoUpserted` no histórico e mescla as novas entradas no memo persistido da execução.

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

Memos também podem ser definidos no início por meio de `StartOptions`:

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

## Como funciona {#how-it-works}

A função `upsertMemo()` aceita um array associativo de pares de chave e valor:

- **Chaves** devem ser strings não vazias de até 64 caracteres
- **Valores** podem ser quaisquer dados serializáveis em JSON: escalares, null, arrays ou objetos aninhados
- Passar `null` como valor remove a chave do memo

Em cada chamada:

1. A fiber do workflow é suspensa e emite um comando `UpsertMemoCall`
2. O executor valida e normaliza as entradas (as chaves são ordenadas alfabeticamente)
3. Um evento `MemoUpserted` é acrescentado ao histórico com as `entries` inseridas ou atualizadas e o resultado completo `merged`
4. A coluna `memo` da execução é atualizada com o mapa mesclado

No replay, os eventos de memo registrados são reutilizados sem executar novamente a inserção ou atualização, preservando o determinismo.

## Comportamento de mesclagem {#merging-behavior}

Os memos são mesclados entre várias chamadas de inserção ou atualização na mesma execução. Cada chamada sobrepõe as novas chaves às existentes:

```php
// First upsert
upsertMemo(['status' => 'processing', 'customer' => 'Taylor']);
// memo = { customer: Taylor, status: processing }

// Second upsert
upsertMemo(['status' => 'completed', 'result' => 'success']);
// memo = { customer: Taylor, result: success, status: completed }
```

Para remover uma chave, defina seu valor como `null`:

```php
upsertMemo(['temporary_note' => null]);
```

## Visibilidade {#visibility}

Memos aparecem em:

- **Tela de detalhes da execução**: o memo mesclado completo é exibido na página de detalhes do workflow no Waterline
- **Linha do tempo do histórico**: cada evento `MemoUpserted` aparece como entrada tipada na linha do tempo da execução
- **Exportação de histórico**: memos são incluídos nas exportações de histórico em JSON
- **Describe**: a resposta `describe` do plano de controle inclui o memo atual

Memos **não** são incluídos nas projeções de resumo das execuções e **não** estão disponíveis para filtragem, ordenação ou visões salvas. Use [atributos de busca](./search-attributes.md) para metadados indexados e filtráveis.

## Continuar como novo {#continue-as-new}

Quando um workflow continua como novo, o memo atual é transferido automaticamente para a nova execução. Ela inicia com o memo mesclado completo da execução anterior e pode continuar inserindo e atualizando entradas a partir dele.

## Estruturas aninhadas {#nested-structures}

Diferentemente dos atributos de busca, limitados a valores escalares, memos aceitam estruturas JSON aninhadas:

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

Objetos aninhados têm as mesmas restrições de chave: strings não vazias de até 64 caracteres por chave em cada nível.

## Restrições {#constraints}

- Nomes de chave: strings não vazias de até 64 caracteres por nível de aninhamento
- Valores: qualquer tipo serializável em JSON (escalares, null, arrays, objetos aninhados)
- Definir um valor como `null` remove a chave
- Memos são metadados com consistência eventual e não são fonte de verdade para replay. Não tome decisões de fluxo na lógica do workflow com base em seus valores

## Comparação entre memo, atributos de busca e rótulos de visibilidade {#memo-vs-search-attributes-vs-visibility-labels}

| | Memo | Atributos de busca | Rótulos de visibilidade |
|---|---|---|---|
| **Quando são definidos** | No início ou a qualquer momento da execução | A qualquer momento da execução | Apenas no início |
| **Mutáveis** | Sim, via `upsertMemo()` | Sim, via `upsertSearchAttributes()` | Não |
| **Tipos de valor** | Qualquer tipo serializável em JSON | Apenas escalares | Apenas escalares |
| **Indexados** | Não | Sim | Sim |
| **Filtráveis** | Não | Sim | Sim |
| **Caso de uso** | Metadados ricos, notas, contexto | Status dinâmico, acompanhamento do progresso | Classificação estática |
| **Eventos de histórico** | `MemoUpserted` por inserção ou atualização | `SearchAttributesUpserted` por inserção ou atualização | Nenhum (definidos no início) |
