---
sidebar_position: 15
---

# Gestion des versions {#versioning}

## Relecture avant un changement de build {#replay-before-changing-builds}

Avant de promouvoir un candidat, relisez des historiques représentatifs ouverts et récemment clôturés avec son code applicatif exact. Avant un retour arrière, relisez les historiques écrits par le nouveau build avec l’ancien artefact. Suivez le [contrôle de relecture](../testing.md#replay-before-deployment) : une cohorte de routage compatible ou une vérification d’intégrité réussie ne prouve pas à elle seule la compatibilité de relecture.

Les workflows pouvant durer des mois, voire des années, il faut souvent modifier leur définition alors que des exécutions sont encore en cours. Sans gestion des versions, une modification du code affectant le chemin d’exécution provoquerait des erreurs de non-déterminisme pendant la relecture.

La fonction `getVersion()` permet de modifier en sécurité des workflows en cours en créant des points de branchement versionnés.

## Utiliser `getVersion` {#using-getversion}

`getVersion()` est une fonction séquentielle sûre à relire. Chaque point de changement enregistre un marqueur durable de version lors de la première exécution. Les relectures réutilisent cette valeur validée au lieu de recalculer la branche d’après le code actuel. Par prudence, les exécutions antérieures à un nouveau point de branchement reçoivent `DEFAULT_VERSION`.

```php
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;
use function Workflow\V2\{activity, getVersion};

final class MyWorkflow extends Workflow
{
    public function handle(): void
    {
        $version = getVersion(
            'my-change-id',
            WorkflowStub::DEFAULT_VERSION,
            1
        );

        if ($version === WorkflowStub::DEFAULT_VERSION) {
            activity(OldActivity::class);
        } else {
            activity(NewActivity::class);
        }
    }
}
```

## Fonctionnement {#how-it-works}

La méthode `getVersion()` prend trois paramètres :

- **changeId** : identifiant unique de ce point de changement
- **minSupported** : version minimale encore prise en charge par ce code
- **maxSupported** : version maximale (courante) pour les nouvelles exécutions

Lorsqu’un workflow atteint `getVersion()` :

- Les **nouvelles exécutions** ajoutent un événement typé `VersionMarkerRecorded` avec le `change_id`, la `version` choisie et la plage prise en charge, puis renvoient `maxSupported`
- Les **exécutions en relecture** renvoient la version précédemment enregistrée dans ce marqueur
- Les **exécutions sans marqueur** se rabattent sur `WorkflowStub::DEFAULT_VERSION` lorsque le runtime détermine qu’elles précèdent la définition courante. Il vérifie d’abord le marqueur de compatibilité contre le worker courant, puis compare le `workflow_definition_fingerprint` durable à la classe de workflow actuellement chargeable. Si les empreintes correspondent, la définition est identique et un nouveau marqueur est enregistré. Sinon, l’exécution précède le changement et le repli s’applique. Les exécutions dont l’historique `WorkflowStarted` précède l’instantané d’empreinte (sans empreinte enregistrée) reçoivent prudemment `DEFAULT_VERSION`, car le runtime ne peut prouver que la définition est inchangée. Ce repli prudent est la politique 2.0 figée pour ces exécutions : le runtime ne bloque pas la prise en charge au seul motif qu’une ancienne exécution n’a pas d’empreinte enregistrée. Le repli n’ajoute pas de marqueur synthétique et ne consomme pas de nouvelle étape de workflow
- Les **méthodes de requête de lecture** relisent le même marqueur validé avant d’invoquer la méthode annotée. Elles voient donc la même branche que la tâche de workflow
- **Waterline** expose les marqueurs enregistrés dans la chronologie avec `version_change_id`, `version`, `version_min_supported` et `version_max_supported`. Les détails exposent aussi `workflow_definition_fingerprint`, `workflow_definition_current_fingerprint` et `workflow_definition_matches_current` pour identifier les exécutions longues démarrées avec une ancienne définition, même avant la validation d’un marqueur de version

Les nouveaux workflows utilisent ainsi le chemin de code le plus récent tandis que les workflows existants conservent leur chemin initial.

## Ajouter une nouvelle version {#adding-a-new-version}

Supposons qu’un workflow existant appelle `prePatchActivity` :

```php
use Workflow\V2\Workflow;
use function Workflow\V2\activity;

final class MyWorkflow extends Workflow
{
    public function handle()
    {
        $result = activity(PrePatchActivity::class);

        return $result;
    }
}
```

Pour le remplacer par `postPatchActivity` sans casser les workflows en cours :

```php
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;
use function Workflow\V2\{activity, getVersion};

final class MyWorkflow extends Workflow
{
    public function handle()
    {
        $version = getVersion(
            'activity-change',
            WorkflowStub::DEFAULT_VERSION,
            1
        );

        $result = $version === WorkflowStub::DEFAULT_VERSION
            ? activity(PrePatchActivity::class)
            : activity(PostPatchActivity::class);

        return $result;
    }
}
```

Lors d’un déploiement introduisant un nouveau branchement `getVersion()`, continuez de renouveler `DW_V2_CURRENT_COMPATIBILITY` pour cette vague. Le runtime utilise en priorité le `workflow_definition_fingerprint` du démarrage pour déterminer si un marqueur absent correspond à une nouvelle exécution ou à une ancienne devant rester sur `DEFAULT_VERSION`. Le marqueur de compatibilité reste nécessaire au routage des workers et est vérifié avant l’empreinte. Les exécutions antérieures à l’instantané d’empreinte (sans empreinte enregistrée) restent prudemment sur `DEFAULT_VERSION`, car le runtime ne peut vérifier que la définition est inchangée.

## Ajouter d’autres versions {#adding-more-versions}

Pour apporter d’autres changements, augmentez `maxSupported` :

```php
$version = getVersion(
    'activity-change',
    WorkflowStub::DEFAULT_VERSION,
    2
);

$result = match($version) {
    WorkflowStub::DEFAULT_VERSION => activity(PrePatchActivity::class),
    1 => activity(PostPatchActivity::class),
    2 => activity(AnotherPatchActivity::class),
};
```

## Abandonner les anciennes versions {#deprecating-old-versions}

Une fois tous les workflows d’une ancienne version terminés, vous pouvez cesser de la prendre en charge en augmentant `minSupported`. Vous n’avez alors plus à maintenir les anciens chemins de code.

```php
// After all DEFAULT_VERSION workflows have completed:
$version = getVersion(
    'activity-change',
    1,  // No longer supporting DEFAULT_VERSION
    2
);

$result = match($version) {
    1 => activity(PostPatchActivity::class),
    2 => activity(AnotherPatchActivity::class),
};
```

Si un workflow d’une version antérieure à `minSupported` tente une relecture, il lève `VersionNotSupportedException`. Cela inclut les exécutions d’ancienne compatibilité dont le repli sûr reste `WorkflowStub::DEFAULT_VERSION`.

Si vous réutilisez accidentellement un `changeId` pour un autre branchement, le runtime signale une erreur de déterminisme plutôt que d’accepter silencieusement l’incohérence. Conservez un `changeId` stable par changement logique de code.

## Plusieurs points de changement {#multiple-change-points}

Vous pouvez utiliser plusieurs appels à `getVersion()` dans un même workflow pour des changements indépendants :

```php
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;
use function Workflow\V2\getVersion;

final class MyWorkflow extends Workflow
{
    public function handle(): void
    {
        $version1 = getVersion('change-1', WorkflowStub::DEFAULT_VERSION, 1);
        $version2 = getVersion('change-2', WorkflowStub::DEFAULT_VERSION, 1);

        // Each change point is tracked independently
    }
}
```

**Important :** Chaque `changeId` doit être unique dans un workflow. La version choisie est enregistrée dans l’historique typé et relue de façon déterministe lors des tâches, requêtes de lecture et vues détaillées Waterline ultérieures. Si Waterline n’affiche pas d’entrée `VersionMarkerRecorded` pour un changement sur une ancienne exécution, la relecture est restée sur l’ancien chemin `DEFAULT_VERSION` sans ajouter de marqueur à l’historique existant. Les champs de détail `workflow_definition_fingerprint`, `workflow_definition_current_fingerprint` et `workflow_definition_matches_current` indiquent si cette exécution a démarré avec une autre définition que celle actuellement chargeable.

## Raccourci `patched()` {#patched-shorthand}

`patched($changeId)` est un raccourci à deux états répondant à la question « cette exécution a-t-elle franchi un changement de code ponctuel ? ». Il enregistre le même événement durable `VersionMarkerRecorded` que `getVersion()` et renvoie un booléen plutôt qu’un entier.

```php
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, patched};

final class MyWorkflow extends Workflow
{
    public function handle(): string
    {
        if (patched('use-new-payment-activity')) {
            return activity(NewPaymentActivity::class);
        }

        return activity(LegacyPaymentActivity::class);
    }
}
```

Comportement :

- Les nouvelles exécutions valident le marqueur, prennent la nouvelle branche et `patched()` renvoie `true`.
- Les exécutions démarrées avant l’ajout de ce `changeId` restent sur `DEFAULT_VERSION` avec le même repli par empreinte que `getVersion()`, et `patched()` renvoie `false`.
- Les relectures des deux types lisent le marqueur précédemment validé et renvoient la même valeur. La décision de branchement est donc durable.

`patched()` équivaut exactement à `getVersion($changeId, DEFAULT_VERSION, 1) === 1`. Utilisez-le pour deux branches si vous n’avez pas besoin de conserver indéfiniment l’ancienne. La forme booléenne est plus lisible au point d’appel qu’un `match` sur `DEFAULT_VERSION` et `1`.

Si vous avez besoin de plus de deux branches ou prévoyez une autre version du même changement logique, utilisez `getVersion()` avec un `maxSupported` explicite. Passer de `patched()` à `getVersion()` pour le même `changeId` est une erreur de déterminisme, car le marqueur existant a été enregistré avec `maxSupported = 1`.

## Supprimer l’ancienne branche avec `deprecatePatch()` {#removing-the-legacy-branch-with-deprecatepatch}

Lorsque toutes les anciennes exécutions d’un point `patched()` sont terminées, vous pouvez supprimer l’ancienne branche du workflow. Pour préserver la compatibilité, remplacez l’appel `patched()` par `deprecatePatch()` au lieu de le supprimer entièrement.

```php
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, deprecatePatch};

final class MyWorkflow extends Workflow
{
    public function handle(): string
    {
        deprecatePatch('use-new-payment-activity');

        return activity(NewPaymentActivity::class);
    }
}
```

`deprecatePatch()` conserve le point de changement dans la chronologie pour que les événements `VersionMarkerRecorded` déjà validés correspondent toujours à un appel connu, mais renvoie `null` et prend toujours le nouveau chemin. Une fois cette version livrée :

- Les nouvelles exécutions valident un marqueur `deprecate_patch`, prennent la nouvelle branche et l’appel `deprecatePatch()` renvoie `null`.
- Les exécutions ayant déjà validé un marqueur `patched` pour ce `changeId` continuent de le relire et passent par la branche dépréciée, désormais unique, sans erreur.
- Les exécutions ayant validé `false` pour `patched()` (l’ancien chemin) sont supposées terminées. Si l’une est encore en cours et relit l’historique, elle lira l’ancien marqueur mais exécutera la nouvelle branche. C’est pourquoi il faut attendre la fin des anciennes exécutions avant de déployer `deprecatePatch()`.

Cycle de vie du correctif en deux phases et règles de placement :

1. **Introduisez `patched()`** au point de changement. Conservez les deux branches dans le workflow. Les nouvelles exécutions prennent la nouvelle branche, les anciennes gardent l’ancienne.
2. **Attendez la fin de toutes les anciennes exécutions.** Utilisez la recherche Waterline ou `dw workflow:list` pour vérifier qu’aucune exécution ouverte ne peut relire l’ancienne branche.
3. **Remplacez `patched()` par `deprecatePatch()`** au même point d’appel avec le même `changeId`, puis supprimez l’ancienne branche du corps de la fonction. Conservez l’appel pour que l’historique durable corresponde toujours à un point connu.
4. **Facultatif : supprimez entièrement `deprecatePatch()`** seulement si vous êtes aussi certain qu’aucune relecture historique (requêtes de lecture, exports, audits) ne lira jamais un historique contenant ce marqueur. Cette étape est irréversible. La plupart des workflows peuvent conserver `deprecatePatch()` indéfiniment sans coût d’exécution.

Règles de placement :

- `patched()` et `deprecatePatch()` doivent être appelés depuis le corps de la fonction workflow, pas depuis les activités, gestionnaires de signaux ou méthodes de requête de lecture. Ce sont des étapes de workflow à relire de façon déterministe.
- Chaque `changeId` représente un seul changement logique. Réutiliser le même `changeId` pour une autre branche est une erreur de déterminisme.
- Un `changeId` peut apparaître sous forme `patched()` ou `deprecatePatch()` au cours de sa vie, mais jamais les deux simultanément. Le déploiement doit remplacer l’appel, pas faire coexister les formes.
- `getVersion()` et `patched()` ne peuvent coexister pour le même `changeId`. Choisissez un modèle lors de l’introduction du changement.
