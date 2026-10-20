---
sidebar_position: 17
---

# Atributos de busca {#search-attributes}

Atributos de busca são pares de chave e valor tipados e indexados que um workflow pode inserir ou atualizar a qualquer momento durante a execução. Diferentemente dos rótulos de visibilidade, definidos uma única vez no início, os atributos de busca podem ser atualizados conforme o workflow avança. Por isso, são adequados para acompanhar o status do workflow, identificadores de clientes ou outros metadados visíveis ao operador que mudam durante a vida de uma execução.

## Inserção e atualização de atributos de busca {#upserting-search-attributes}

`upsertSearchAttributes()` é um helper durável de fluxo sequencial. Cada chamada registra um evento tipado `SearchAttributesUpserted` no histórico e mescla os novos atributos nos atributos de busca persistidos da execução.

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

## Definição de atributos de busca no início {#setting-search-attributes-at-start-time}

Atributos de busca também podem ser definidos ao iniciar um workflow por meio de `StartOptions::withSearchAttributes()`. Esses atributos são registrados imediatamente na execução e aparecem nos eventos de histórico `StartAccepted` e `WorkflowStarted`. Chamadas posteriores a `upsertSearchAttributes()` mesclam novos dados sobre eles.

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

Você pode encadear `withSearchAttributes()` com outros métodos de construção de `StartOptions`:

```php
$options = StartOptions::rejectDuplicate()
    ->withBusinessKey('order-42')
    ->withLabels(['tenant' => 'acme'])
    ->withMemo(['note' => 'VIP order'])
    ->withSearchAttributes(['priority' => 'high']);

$workflow->start($orderId, $customer, $options);
```

Atributos de busca definidos no início seguem as mesmas regras de validação de `upsertSearchAttributes()`: chaves devem ter de 1 a 64 caracteres seguros para URLs, valores devem ser escalares ou null, e valores null são descartados, sem serem persistidos.

### Plano de controle {#control-plane}

O método `start()` do plano de controle também aceita atributos de busca:

```php
$controlPlane->start('orders.process-order', 'order-42', [
    'arguments' => $serializedArgs,
    'search_attributes' => ['env' => 'production', 'priority' => 'high'],
]);
```

## Como funciona {#how-it-works}

A função `upsertSearchAttributes()` aceita um array associativo de pares de chave e valor:

- **Chaves** devem ter de 1 a 64 caracteres seguros para URLs (letras, dígitos, hífens, sublinhados)
- **Valores** devem ser escalares (string, int, float, bool) ou null; strings são limitadas a 191 caracteres
- Passar `null` como valor remove a chave dos atributos de busca

Em cada chamada:

1. A fiber do workflow é suspensa e emite um comando `UpsertSearchAttributesCall`
2. O executor valida e normaliza os atributos (as chaves são ordenadas alfabeticamente)
3. Um evento `SearchAttributesUpserted` é acrescentado ao histórico com os `attributes` inseridos ou atualizados e o resultado completo `merged`
4. A coluna `search_attributes` da execução é atualizada com o mapa mesclado
5. A projeção de resumo da execução é atualizada para que o Waterline reflita a alteração imediatamente

No replay, os eventos registrados de atributos de busca são reutilizados sem executar novamente a inserção ou atualização, preservando o determinismo.

## Comportamento de mesclagem {#merging-behavior}

Os atributos de busca são mesclados entre várias chamadas de inserção ou atualização na mesma execução. Cada chamada sobrepõe as novas chaves às existentes:

```php
// First upsert
upsertSearchAttributes(['status' => 'processing', 'customer' => 'Taylor']);
// search_attributes = { customer: Taylor, status: processing }

// Second upsert
upsertSearchAttributes(['status' => 'completed', 'result' => 'success']);
// search_attributes = { customer: Taylor, result: success, status: completed }
```

Para remover uma chave, defina seu valor como `null`:

```php
upsertSearchAttributes(['temporary_flag' => null]);
```

## Visibilidade e filtragem {#visibility-and-filtering}

Atributos de busca aparecem em:

- **Tela de detalhes da execução**: o mapa mesclado de atributos de busca é exibido junto com rótulos e memo
- **Projeção de resumo da execução**: os atributos de busca são incluídos no resumo desnormalizado para leituras rápidas
- **Filtros de visibilidade**: operadores podem filtrar execuções de workflow por valores de atributos de busca nas visões salvas do Waterline
- **Linha do tempo do histórico**: cada evento `SearchAttributesUpserted` aparece como entrada tipada na linha do tempo da execução
- **Exportação de histórico**: os atributos de busca são incluídos nas exportações de histórico em JSON

## Continuar como novo {#continue-as-new}

Quando um workflow continua como novo, os atributos de busca atuais são transferidos automaticamente para a nova execução. Ela inicia com o mapa mesclado completo da execução anterior e pode continuar inserindo e atualizando atributos a partir dele.

## Privacidade e limites {#privacy-and-limits}

Atributos de busca são **metadados do operador em texto simples**. Seus valores são visíveis a qualquer pessoa com acesso ao Waterline e são armazenados sem criptografia. Nunca armazene segredos, senhas, tokens ou informações de identificação pessoal (PII) em atributos de busca.

Restrições:

- Nomes de chave: de 1 a 64 caracteres seguros para URLs (`[a-zA-Z0-9_-]`)
- Valores: apenas tipos escalares (string, int, float, bool), com strings limitadas a 191 caracteres
- Definir um valor como `null` remove a chave

## Comparação entre atributos de busca, memo e rótulos de visibilidade {#search-attributes-vs-memo-vs-visibility-labels}

| | Atributos de busca | Memo | Rótulos de visibilidade |
|---|---|---|---|
| **Quando são definidos** | No início ou a qualquer momento da execução | No início ou a qualquer momento da execução | Apenas no início |
| **Mutáveis** | Sim, via `upsertSearchAttributes()` | Sim, via `upsertMemo()` | Não |
| **Tipos de valor** | Apenas escalares | Qualquer tipo serializável em JSON | Apenas escalares |
| **Indexados** | Sim | Não | Sim |
| **Filtráveis** | Sim | Não | Sim |
| **Caso de uso** | Status dinâmico, acompanhamento do progresso | Metadados ricos, notas, contexto | Classificação estática |
| **Eventos de histórico** | `SearchAttributesUpserted` por inserção ou atualização | `MemoUpserted` por inserção ou atualização | Nenhum (definidos no início) |

Para metadados estruturados ricos que não precisam de filtragem ou ordenação, use [memo](./memo.md).
