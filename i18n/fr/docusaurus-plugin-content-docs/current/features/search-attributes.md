---
sidebar_position: 17
---

# Attributs de recherche {#search-attributes}

Les attributs de recherche sont des paires clé-valeur typées et indexées qu’un workflow peut insérer ou modifier à tout moment. Contrairement aux étiquettes de visibilité, définies une seule fois au démarrage, ils évoluent avec le workflow. Ils conviennent au suivi du statut, des identifiants clients ou de toute métadonnée visible par les opérateurs qui change pendant une exécution.

## Insérer ou modifier les attributs de recherche {#upserting-search-attributes}

`upsertSearchAttributes()` est une fonction séquentielle durable. Chaque appel enregistre un événement typé `SearchAttributesUpserted` et fusionne les nouveaux attributs dans ceux persistés de l’exécution.

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

## Définir les attributs au démarrage {#setting-search-attributes-at-start-time}

Les attributs peuvent aussi être définis au démarrage via `StartOptions::withSearchAttributes()`. Ils sont immédiatement enregistrés sur l’exécution et apparaissent dans les événements `StartAccepted` et `WorkflowStarted`. Les appels `upsertSearchAttributes()` suivants fusionnent leurs valeurs avec eux.

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

Vous pouvez chaîner `withSearchAttributes()` avec les autres méthodes de construction de `StartOptions` :

```php
$options = StartOptions::rejectDuplicate()
    ->withBusinessKey('order-42')
    ->withLabels(['tenant' => 'acme'])
    ->withMemo(['note' => 'VIP order'])
    ->withSearchAttributes(['priority' => 'high']);

$workflow->start($orderId, $customer, $options);
```

Les attributs de démarrage suivent les mêmes règles de validation que `upsertSearchAttributes()` : clés de 1 à 64 caractères utilisables dans une URL, valeurs scalaires ou null, et valeurs null abandonnées, sans persistance.

### Plan de contrôle {#control-plane}

La méthode `start()` du plan de contrôle accepte aussi des attributs de recherche :

```php
$controlPlane->start('orders.process-order', 'order-42', [
    'arguments' => $serializedArgs,
    'search_attributes' => ['env' => 'production', 'priority' => 'high'],
]);
```

## Fonctionnement {#how-it-works}

La fonction `upsertSearchAttributes()` accepte un tableau associatif de paires clé-valeur :

- Les **clés** doivent contenir 1 à 64 caractères utilisables dans une URL (lettres, chiffres, traits d’union et de soulignement)
- Les **valeurs** doivent être scalaires (string, int, float, bool) ou null ; les chaînes sont limitées à 191 caractères
- Passer `null` comme valeur supprime la clé des attributs de recherche

Chaque appel :

1. Suspend la fibre de workflow et émet une commande `UpsertSearchAttributesCall`
2. Fait valider et normaliser les attributs par l’exécuteur (clés triées alphabétiquement)
3. Ajoute un événement `SearchAttributesUpserted` avec les `attributes` insérés ou modifiés et le résultat complet `merged`
4. Met à jour la colonne `search_attributes` avec la table fusionnée
5. Actualise la projection de résumé pour que Waterline reflète immédiatement le changement

À la relecture, les événements enregistrés sont réutilisés sans réexécuter la modification, préservant le déterminisme.

## Comportement de fusion {#merging-behavior}

Les attributs fusionnent entre plusieurs modifications dans une même exécution. Chaque modification superpose les nouvelles clés aux existantes :

```php
// First upsert
upsertSearchAttributes(['status' => 'processing', 'customer' => 'Taylor']);
// search_attributes = { customer: Taylor, status: processing }

// Second upsert
upsertSearchAttributes(['status' => 'completed', 'result' => 'success']);
// search_attributes = { customer: Taylor, result: success, status: completed }
```

Pour supprimer une clé, définissez-la à `null` :

```php
upsertSearchAttributes(['temporary_flag' => null]);
```

## Visibilité et filtrage {#visibility-and-filtering}

Les attributs apparaissent dans :

- les **détails d’exécution** : la table fusionnée figure à côté des étiquettes et du mémo
- la **projection de résumé** : les attributs sont inclus dans le résumé dénormalisé pour des lectures rapides
- les **filtres de visibilité** : les opérateurs peuvent filtrer les exécutions selon leurs valeurs dans les vues enregistrées Waterline
- la **chronologie d’historique** : chaque `SearchAttributesUpserted` apparaît comme une entrée typée
- l’**export d’historique** : les attributs sont inclus dans les exports JSON

## Continuation dans une nouvelle exécution {#continue-as-new}

Lors d’une continuation, les attributs courants sont automatiquement transmis à la nouvelle exécution. Celle-ci démarre avec la table fusionnée complète de la précédente et peut continuer à la modifier.

## Confidentialité et limites {#privacy-and-limits}

Les attributs de recherche sont des **métadonnées opérateur en texte clair**. Leurs valeurs sont visibles par toute personne ayant accès à Waterline et sont stockées sans chiffrement. N’y stockez jamais de secrets, mots de passe, jetons ou données personnelles identifiantes (PII).

Contraintes :

- Noms de clés : 1 à 64 caractères utilisables dans une URL (`[a-zA-Z0-9_-]`)
- Valeurs : types scalaires uniquement (string, int, float, bool), chaînes limitées à 191 caractères
- Définir une valeur à `null` supprime la clé

## Comparaison des attributs de recherche, mémos et étiquettes de visibilité {#search-attributes-vs-memo-vs-visibility-labels}

| | Attributs de recherche | Mémo | Étiquettes de visibilité |
|---|---|---|---|
| **Définition** | Au démarrage ou pendant l’exécution | Au démarrage ou pendant l’exécution | Au démarrage uniquement |
| **Modifiable** | Oui, via `upsertSearchAttributes()` | Oui, via `upsertMemo()` | Non |
| **Types de valeurs** | Scalaires uniquement | Tout type sérialisable en JSON | Scalaires uniquement |
| **Indexé** | Oui | Non | Oui |
| **Filtrable** | Oui | Non | Oui |
| **Usage** | Statut dynamique, suivi de progression | Métadonnées riches, notes, contexte | Classification statique |
| **Événements d’historique** | `SearchAttributesUpserted` par modification | `MemoUpserted` par modification | Aucun (défini au démarrage) |

Pour des métadonnées structurées riches sans besoin de filtrage ni de tri, utilisez plutôt un [mémo](./memo.md).
