---
sidebar_position: 18
---

# Mémo {#memo}

Les mémos sont des métadonnées clé-valeur non indexées qu’un workflow peut lire et mettre à jour à tout moment. Contrairement aux [attributs de recherche](./search-attributes.md), indexés et filtrables, ils sont conçus pour des métadonnées structurées plus riches, affichées dans les détails et exports d’historique mais exclues par contrat du filtrage et du tri à l’échelle du parc.

## Insérer ou mettre à jour les mémos {#upserting-memos}

`upsertMemo()` est une fonction séquentielle durable. Chaque appel enregistre un événement typé `MemoUpserted` et fusionne les nouvelles entrées dans le mémo persisté de l’exécution.

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

Les mémos peuvent aussi être définis au démarrage via `StartOptions` :

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

## Fonctionnement {#how-it-works}

La fonction `upsertMemo()` accepte un tableau associatif de paires clé-valeur :

- Les **clés** doivent être des chaînes non vides de 64 caractères maximum
- Les **valeurs** peuvent être toutes données sérialisables en JSON : scalaires, null, tableaux ou objets imbriqués
- Passer `null` comme valeur supprime la clé du mémo

Chaque appel :

1. Suspend la fibre de workflow et émet une commande `UpsertMemoCall`
2. Fait valider et normaliser les entrées par l’exécuteur (clés triées alphabétiquement)
3. Ajoute un événement `MemoUpserted` avec les `entries` insérées ou modifiées et le résultat complet `merged`
4. Met à jour la colonne `memo` de l’exécution avec la table fusionnée

À la relecture, les événements de mémo enregistrés sont réutilisés sans réexécuter la modification, préservant le déterminisme.

## Comportement de fusion {#merging-behavior}

Les mémos fusionnent entre plusieurs modifications dans une même exécution. Chaque modification superpose les nouvelles clés aux existantes :

```php
// First upsert
upsertMemo(['status' => 'processing', 'customer' => 'Taylor']);
// memo = { customer: Taylor, status: processing }

// Second upsert
upsertMemo(['status' => 'completed', 'result' => 'success']);
// memo = { customer: Taylor, result: success, status: completed }
```

Pour supprimer une clé, définissez-la à `null` :

```php
upsertMemo(['temporary_note' => null]);
```

## Visibilité {#visibility}

Les mémos apparaissent dans :

- les **détails d’exécution** : le mémo fusionné complet figure dans la page de détail Waterline
- la **chronologie d’historique** : chaque `MemoUpserted` apparaît comme une entrée typée
- l’**export d’historique** : les mémos sont inclus dans les exports JSON
- la **description** : la réponse `describe` du plan de contrôle inclut le mémo courant

Les mémos ne sont **pas** inclus dans les projections de résumé et ne sont **pas** disponibles pour le filtrage, le tri ou les vues enregistrées. Utilisez les [attributs de recherche](./search-attributes.md) pour des métadonnées indexées et filtrables.

## Continuation dans une nouvelle exécution {#continue-as-new}

Lors d’une continuation, le mémo courant est automatiquement transmis à la nouvelle exécution. Celle-ci démarre avec le mémo fusionné complet de la précédente et peut continuer à le modifier.

## Structures imbriquées {#nested-structures}

Contrairement aux attributs de recherche, limités aux scalaires, les mémos prennent en charge les structures JSON imbriquées :

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

Les objets imbriqués ont les mêmes contraintes de clés : chaînes non vides de 64 caractères maximum par clé à chaque niveau.

## Contraintes {#constraints}

- Noms de clés : chaînes non vides de 64 caractères maximum par niveau d’imbrication
- Valeurs : tout type sérialisable en JSON (scalaires, null, tableaux, objets imbriqués)
- Définir une valeur à `null` supprime la clé
- Les mémos sont des métadonnées à cohérence éventuelle, pas une autorité de relecture. Ne branchez pas la logique du workflow selon leurs valeurs

## Comparaison des mémos, attributs de recherche et étiquettes de visibilité {#memo-vs-search-attributes-vs-visibility-labels}

| | Mémo | Attributs de recherche | Étiquettes de visibilité |
|---|---|---|---|
| **Définition** | Au démarrage ou pendant l’exécution | Pendant l’exécution | Au démarrage uniquement |
| **Modifiable** | Oui, via `upsertMemo()` | Oui, via `upsertSearchAttributes()` | Non |
| **Types de valeurs** | Tout type sérialisable en JSON | Scalaires uniquement | Scalaires uniquement |
| **Indexé** | Non | Oui | Oui |
| **Filtrable** | Non | Oui | Oui |
| **Usage** | Métadonnées riches, notes, contexte | Statut dynamique, suivi de progression | Classification statique |
| **Événements d’historique** | `MemoUpserted` par modification | `SearchAttributesUpserted` par modification | Aucun (défini au démarrage) |
