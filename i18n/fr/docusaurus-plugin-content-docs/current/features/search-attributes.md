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

### Filtres de liste parent/enfant {#parent-child-list-filters}

Les enfants [héritent des attributs de recherche et du memo à la création](./child-workflows.md#child-metadata-inheritance), puis peuvent modifier leurs valeurs indépendamment. Filtrer un attribut hérité n’exclut pas implicitement les enfants. Pour un attribut keyword enregistré, la requête Server `customer = 'customer-42'` peut renvoyer le parent et tous les enfants conservant cette valeur. Le memo reste une métadonnée non indexée, pas un autre filtre d’attribut de recherche.

L’API de liste qualifiée de Server 2.11.0 **n’a pas de prédicat intégré pour les seules racines ou les seuls enfants**. `ParentWorkflowId`, `RootWorkflowId` et `IsChildWorkflow` ne sont pas des champs de relation automatiques de son langage de requête ; les vérifications publiées rejettent ces noms non enregistrés. Déclarer un attribut personnalisé de ce nom ne renseigne pas l’identité parent/enfant. Un filtre de type de workflow sélectionne un type, pas toutes les racines ou tous les enfants de types différents.

Examinez la filiation de l’exécution pour connaître sa relation parent/enfant réelle. Le filtrage partagé plus large reste un [travail produit](https://github.com/durable-workflow/.github/issues/224) ; cette limitation et une convention de métadonnées définie par l’utilisateur ne livrent pas cette capacité. La [vérification](https://github.com/durable-workflow/durable-workflow.github.io/issues/368#issuecomment-6362355504) conserve le résultat contenant parent et enfant ainsi que les prédicats refusés.

## Réparer les attributs de recherche datetime {#repair-datetime-search-attributes}

La commande de réparation fondée sur l’historique exige **Workflow 2.12.0 ou ultérieur réellement installé**. Vérifiez `composer.lock` et `php artisan help workflow:v2:repair-search-datetimes` dans l’application Laravel qui l’exécutera. Un checkout des sources ou une contrainte Composer ne prouve pas que la commande est installée.

Les projections datetime stockent des instants UTC avec microsecondes : `2026-10-08T12:34:56.123456+02:00` représente `2026-10-08T10:34:56.123456Z`. Les anciens writers pouvaient enregistrer l’heure locale du décalage tout en conservant celui-ci dans l’historique typé. La mise à niveau évite de nouvelles erreurs du writer, mais n’identifie ni ne réécrit les anciennes lignes. Ne déduisez jamais le fuseau initial de l’heure stockée.

Mettez d’abord à niveau tous les writers de projections et sauvegardez la base du workflow. Utilisez l’**ID exact du run**, pas celui de l’instance de workflow. Commencez par un aperçu :

```sh
php artisan workflow:v2:repair-search-datetimes RUN_ID --namespace=production --json
php artisan workflow:v2:repair-search-datetimes RUN_ID --namespace=production --key=SubmittedAt --json
```

`--namespace=production` impose une égalité exacte ; indiquez le vrai namespace du run. Omettez-le seulement lorsque l’ID exact suffit, y compris pour les anciens namespaces null ; une valeur explicite vide est refusée. Sans `--key`, la sélection couvre les attributs datetime du run. Répétez l’option pour les clés connues, comme `--key=SubmittedAt --key=ApprovedAt`.

L’aperçu est le mode par défaut. Examinez `examined`, `would_repair` et la sélection exacte run/clés avant d’appliquer explicitement cette même sélection :

```sh
php artisan workflow:v2:repair-search-datetimes RUN_ID --namespace=production --key=SubmittedAt --apply --json
```

Relisez les attributs sélectionnés et le résumé du run, puis relancez l’aperçu. Si les preuves sont inchangées et les valeurs correctes, répéter apply indique zéro réparation. Un sous-ensemble réparé ne prouve pas que les clés non sélectionnées sont correctes.

Chaque clé nécessite le dernier upsert conservé et explicitement typé `SearchAttributesUpserted`, dont la séquence logique initiale de commande correspond à la projection. Historique purgé, preuves absentes/périmées, fuseau ambigu, mauvais namespace ou clés qui ne sont plus conservées comme datetime entraînent un refus. Une seule clé non démontrable refuse toute la sélection ; inspectez l’historique et sélectionnez uniquement les clés prouvées, sans deviner de décalage.

La commande verrouille et valide toute la sélection avant de mettre à jour les attributs dérivés et leur résumé dans une transaction de stockage. Historique faisant autorité, commandes métier, identités run/tâche et leases restent inchangés. Les échecs JSON distinguent `refused` et `unverified` : après une erreur de stockage inattendue, inspectez les lignes avant de réessayer, car un commit incertain ne garantit pas un rollback.

Cette procédure répare les attributs dérivés et leur résumé ; elle ne restaure pas l’historique purgé et ne modifie pas l’input faisant autorité. Le binding des requêtes de visibilité du Server et l’adoption dans son image exigent leur propre livraison qualifiée ; un tag Core ne prouve pas une correction HTTP. Consultez la [procédure canonique](https://github.com/durable-workflow/workflow/blob/b3bbfdb5258c68546ae38ca1fde52818e4b05d12/docs/architecture/projection-timestamp-storage.md#datetime-search-attributes).

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
