---
sidebar_position: 15
---

# Gestion des versions {#versioning}

## Relecture avant un changement de build {#replay-before-changing-builds}

Avant de promouvoir un candidat, relisez des historiques représentatifs ouverts et récemment clôturés avec son code applicatif exact. Avant un retour arrière, relisez les historiques écrits par le nouveau build avec l’ancien artefact. Suivez le [contrôle de relecture](../testing.md#replay-before-deployment) : une cohorte de routage compatible ou une vérification d’intégrité réussie ne prouve pas à elle seule la compatibilité de relecture.

Les workflows pouvant durer des mois, voire des années, il faut souvent modifier leur définition alors que des exécutions sont encore en cours. Sans gestion des versions, une modification du code affectant le chemin d’exécution provoquerait des erreurs de non-déterminisme pendant la relecture.

La fonction `getVersion()` permet de modifier en sécurité des workflows en cours en créant des points de branchement versionnés.

## Faire évoluer les arguments d’entrée enregistrés {#evolving-recorded-entry-arguments}

Une exécution conserve les arguments enregistrés à son démarrage. Déployer une nouvelle définition ne réécrit pas cette entrée. Pendant la relecture, le runtime lie ces valeurs à la méthode d’entrée actuelle du workflow **avant d’exécuter le moindre code dans son corps**. Une branche `getVersion()` ou `patched()` dans le corps ne peut pas sauver une signature incompatible : il faut d’abord pouvoir entrer dans la méthode.

Conservez l’ordre des arguments positionnels existants et acceptez leurs types enregistrés. Une valeur par défaut PHP complète un argument omis ; elle ne remplace pas une valeur incompatible déjà enregistrée à cette position. Par exemple, une exécution démarrée avec `[7]` fournit toujours l’entier `7` après le déploiement :

| Modification de l’entrée | Effet sur l’entrée enregistrée `[7]` |
| --- | --- |
| `handle(int $amount)` → `handle(int $amount, string $currency = 'USD')` | L’ancien argument reste compatible ; le nouvel argument final peut utiliser sa valeur par défaut. Préservez aussi la compatibilité des commandes relues. |
| Ajouter un argument final obligatoire sans valeur par défaut | L’ancienne exécution ne dispose d’aucune valeur pour lui. |
| Insérer, retirer ou réordonner les premiers arguments | Les valeurs existantes peuvent se retrouver dans le mauvais paramètre. Des noms de paramètres identiques ne corrigent pas une entrée positionnelle. |
| Remplacer `int $amount` par `string $amount` | L’entier enregistré n’est pas devenu une chaîne. |
| Remplacer `int $amount` par `PaymentRequest $request` | L’injection de dépendances n’est pas une migration des entrées. Un nouveau DTO ne doit pas remplacer le montant enregistré par les valeurs par défaut de son constructeur. |
| Retirer uniquement un paramètre final | PHP peut accepter l’appel, mais vérifiez que supprimer sa signification ne modifie ni les commandes relues ni le comportement métier. |

Préférez l’ajout d’un paramètre final facultatif ou un nouveau type de workflow pour un contrat d’entrée différent. Si vous avez besoin d’un nouveau DTO en interne, construisez-le explicitement à partir d’arguments enregistrés compatibles **dans** le corps du workflow et gérez à cet endroit les versions de toute modification des commandes durables. Conservez du code capable de relire chaque forme d’entrée prise en charge tant que ces exécutions en ont besoin. Testez les entrées réellement stockées avec la nouvelle définition, y compris une relecture à froid après une attente durable ; tester uniquement de nouveaux démarrages ne couvre pas cette limite du déploiement.

### Comportement de Workflow 2.7.2 {#released-embedded-entry-behavior}

Dans Workflow **2.7.2**, une erreur d’arité ou de type à l’entrée peut devenir un événement terminal `WorkflowFailed`. Certaines erreurs de résolution des dépendances laissent au contraire l’exécution ouverte avec une tâche qui échoue à répétition. Remplacer un scalaire par un DTO injecté dont le constructeur possède des valeurs par défaut peut même exécuter le workflow avec des données erronées. Ce sont des défauts du produit suivis dans [Workflow #866](https://github.com/durable-workflow/workflow/issues/866), pas une stratégie de versionnement sûre.

Restaurer du code compatible peut récupérer une exécution ouverte pouvant être livrée à nouveau, mais ne rouvre pas une exécution déjà terminale. Ni `repair()` ni une nouvelle branche de version ne promettent de ressusciter cet original échoué. Inspectez d’abord son état et son échec réels ; préservez son entrée et son historique pendant le choix de la récupération.

### Protection embarquée publiée {#embedded-entry-argument-safeguard}

Workflow **2.7.3** valide les arguments enregistrés avant d’entrer dans le code applicatif. Une liaison incompatible produit une `WorkflowEntryArgumentsMismatchException` typée et une **tâche de workflow** bloquée en relecture, avec `replay_blocked_reason = workflow_entry_arguments_mismatch` ; **l’exécution reste non terminale**. Les champs de diagnostic identifient workflow, méthode d’entrée, paramètre et types attendu et réel sans copier les valeurs des arguments. Un nouveau DTO injecté qui écarterait l’entrée enregistrée est également refusé. Vérifiez le paquet Workflow réellement installé dans l’application embarquée. Cette protection ne rouvre pas les exécutions terminales créées par une version antérieure.

Avec cette protection publiée, récupérez le même original encore ouvert comme suit :

1. Inspectez le diagnostic de tâche de l’exécution sélectionnée et confirmez `workflow_entry_arguments_mismatch`, sans supposer que tout échec de tâche a cette cause.
2. Restaurez une définition acceptant les arguments d’origine enregistrés, ou déployez un adaptateur compatible dans le corps du workflow. Préservez l’identité, l’entrée, l’historique et les échéances d’origine ; ne modifiez pas le stockage pour l’adapter à la nouvelle signature.
3. Utilisez l’action de réparation prise en charge pour cette même exécution encore ouverte une fois le code compatible disponible. Vérifiez ensuite que le travail d’origine reprend et que son résultat terminal est enregistré une seule fois. La réparation ne prolonge pas l’échéance d’origine ; une échéance déjà dépassée s’applique toujours.

La protection **ne** requalifie **pas** les exceptions levées dans le corps du workflow en incompatibilités de déploiement. Un véritable `TypeError` applicatif ou un autre échec non traité du corps suit toujours le comportement normal d’échec du workflow. Elle ne fournit pas non plus le contrôle à l’échelle de la flotte pour retirer les anciennes branches, suivi dans [shared #220](https://github.com/durable-workflow/.github/issues/220).

### Les SDK en mode service ont leurs propres limites {#service-sdk-entry-boundaries}

Une correction du Core embarqué ne change pas le processus SDK qui exécute le code du workflow en mode service. Les anciennes versions publiées ci-dessous précèdent la protection d’entrée en mode service suivie dans [shared #221](https://github.com/durable-workflow/.github/issues/221) :

| SDK publié | Comportement de liaison de l’entrée |
| --- | --- |
| [PHP 2.5.3](https://github.com/durable-workflow/sdk-php/tree/43d39bff50ccace0a309de41306cd350751ec575) | Appelle le gestionnaire enregistré avec le contexte suivi de l’entrée positionnelle enregistrée. Un `ArgumentCountError` ou `TypeError` à l’entrée peut suivre le chemin générique d’échec du workflow. |
| [Python 2.6.1](https://github.com/durable-workflow/sdk-python/tree/150c6f6bc14e3516f75cc615b2f75f093ed84ea1) | Appelle `run(ctx, *start_input)`. Une arité modifiée peut faire échouer le workflow ; les annotations de type seules n’imposent pas les types et ne convertissent pas les valeurs enregistrées. Les erreurs du corps du générateur sont aussi des échecs applicatifs. |
| [Rust 3.5.5](https://github.com/durable-workflow/sdk-rust/tree/4d5047ba9da39785512340b0975ce28da09f0cee) | L’adaptateur typé désérialise l’entrée avant d’appeler son gestionnaire à signature fixe. Une modification du type de requête peut faire échouer ce décodage. Cela diffère de la liaison positionnelle PHP/Python ; un refus incident dû à un historique non consommé ne garantit pas une protection récupérable des signatures. |

Séparez la compatibilité des entrées en mode service et la qualification réelle des SDK de la version embarquée publiée. Ne capturez pas tous les `TypeError` ou toutes les erreurs des handlers Rust pour les déclarer sûrs pour la relecture : cela masquerait de véritables échecs applicatifs.

### Protection d’entrée en mode service {#service-sdk-entry-safeguard}

**Prise en charge publiée.** Server 2.9.9 et les SDK PHP 2.5.4, Python 2.6.2 et Rust 3.5.6 ont introduit les protections d’entrée et le comportement de routage et de récupération décrits ci-dessous. Ce sont les versions minimales pour ces fonctions. Installez les versions stables actuelles pour bénéficier des correctifs de sécurité.

Les SDK préparés valident l’entrée enregistrée avant l’exécution du code applicatif du workflow. Une entrée incompatible signale `workflow_entry_arguments_mismatch` sur une **tâche** de workflow en échec et bloquée pour la relecture, sans envoyer `fail_workflow` ni fermer l’**exécution** métier. L’entrée, les identités de workflow et d’exécution, l’historique validé, le build fixé et les échéances d’origine restent inchangés. PHP valide les arguments positionnels obligatoires et les types PHP déclarés. Python lie les arguments à la signature pour vérifier l’arité et appliquer les valeurs par défaut ; les annotations ne deviennent pas des contrôles de type à l’exécution. Les adaptateurs typés Rust valident le décodage de l’entrée avant d’appeler le handler ou sa fabrique d’état. Les handlers Rust bruts restent responsables du traitement de leurs propres entrées applicatives.

Le `failure_reason` spécifique de la tâche côté Server est `workflow_entry_arguments_mismatch` ; `replay_blocked_reason` conserve la valeur générique `worker_reported_replay_failure`. Inspectez `latest_workflow_task_failure.reason` dans la réponse de débogage de l’exécution sélectionnée. Ne confondez pas ces champs avec le diagnostic du Core embarqué ci-dessus. Le code applicatif entré avec succès qui lève un `TypeError`, renvoie une erreur de handler Rust ou échoue autrement conserve le comportement ordinaire d’échec métier.

Restaurez un code acceptant l’entrée d’origine enregistrée, puis suivez la [procédure prise en charge pour récupérer cette même exécution](../failures-and-recovery.md#service-entry-recovery). Ne remplacez pas l’entrée par des valeurs par défaut de DTO, ne modifiez pas l’historique et ne réinitialisez pas une échéance. Cette protection ne rouvre pas une exécution qu’un ancien worker a déjà rendue terminale.

Le routage sûr vers un remplacement exige aussi la [capacité worker de validation de l’entrée](../polyglot/worker-compatibility-routing.md#definition-fingerprint-evolution). Une empreinte différente ne prouve pas la compatibilité de relecture et ne justifie pas de réécrire l’empreinte d’origine d’une exécution. Versionnez les changements de commandes durables dans une méthode d’entrée compatible et testez une relecture à froid avant la promotion.

## Faire évoluer les arguments et les résultats des activités {#evolving-activity-arguments-and-results}

Une activité possède deux contrats enregistrés : ses arguments lors de sa planification et son résultat lors de son achèvement. Un déploiement ne migre ni les uns ni l’autre. Cela vaut pour PHP embarqué et les workers en mode service utilisant les SDK PHP, Python et Rust.

Une tentative en attente ou relancée reçoit les arguments initialement enregistrés. Elle exécute l’implémentation sélectionnée par l’enregistrement du worker et la politique de routage des builds, qui peut encore être une ancienne build. Déployer une nouvelle implémentation ne garantit pas que toutes les tentatives l’utilisent et ne modifie pas les arguments en file.

Lors de la relecture d’une activité terminée, le code actuel du workflow reçoit le résultat enregistré sans réexécuter l’activité. La correspondance de l’étape et du type d’activité ne valide pas le schéma des arguments ou du résultat. Une modification de structure peut donc faire échouer le code applicatif sans provoquer de divergence d’historique.

### Ajouter une entrée facultative sans réinterpréter les anciennes valeurs {#additive-activity-input}

Conservez les arguments positionnels existants et leur sens. En PHP embarqué, un paramètre facultatif ajouté à la fin permet de toujours accepter des arguments déjà planifiés tels que `[7]` :

```php
use Workflow\V2\Activity;

final class PriceActivity extends Activity
{
    public function handle(int $amount, string $currency = 'USD'): array
    {
        return ['amount' => $amount, 'currency' => $currency];
    }
}
```

La valeur par défaut remplit un argument absent. Elle ne convertit pas une valeur enregistrée incompatible et ne corrige pas un changement d’ordre. Préservez aussi la compatibilité des effets externes : une nouvelle tentative peut survenir après le déploiement et doit rester idempotente.

Les handlers PHP en mode service reçoivent le contexte d’activité, puis les arguments positionnels enregistrés. Les handlers Python reçoivent directement ces arguments positionnels. Tous deux ont besoin de valeurs par défaut pour les arguments omis. Les annotations Python ne valident ni ne convertissent les valeurs à elles seules. Les activités typées Rust désérialisent une valeur de requête unique. Ajoutez un champ facultatif ou un champ avec une valeur par défaut Serde explicite, en préservant la représentation existante. Un nouveau champ obligatoire peut faire échouer le décodage avant l’exécution du handler Rust. Les API d’activité figurent dans les guides des SDK [PHP](https://php.durable-workflow.com/), [Python](https://python.durable-workflow.com/) et [Rust](https://rust.durable-workflow.com/).

### Lire les anciens résultats avec une valeur de repli {#additive-activity-result}

Lorsqu’un nouveau résultat d’activité ajoute `currency`, les workflows doivent toujours accepter les résultats déjà terminés qui ne contiennent que `amount` :

```php
$result = activity(PriceActivity::class, 7);
$currency = $result['currency'] ?? 'USD';
```

Choisissez une valeur de repli qui conserve le sens métier précédent. Gardez-la pour tous les historiques susceptibles d’être relus, y compris pour les requêtes de lecture et la récupération. Déployez les lecteurs compatibles avant le code qui écrit la nouvelle représentation. Vérifiez aussi les lecteurs de retour arrière avec les nouveaux résultats enregistrés. Une valeur par défaut en entrée de l’activité n’ajoute aucun champ à un résultat déjà enregistré.

### Utiliser un nouveau type pour un contrat différent {#incompatible-activity-contract}

Pour renommer un champ, changer sa représentation ou son sens métier, gardez l’ancien type d’activité disponible et introduisez-en un nouveau. Placez une branche `getVersion()` du workflow à l’appel de planification si les anciens historiques doivent conserver leur étape d’activité et les nouveaux runs doivent planifier le nouveau type. Une branche dans l’activité ne corrige pas des arguments qui échouent avant l’entrée dans son corps. Un marqueur de version ne réécrit pas non plus les résultats de l’historique.

Vérifiez deux frontières de déploiement dans de nouveaux processus avec les paquets réellement installés : planifier avec l’ancien code et exécuter avec l’activité candidate ; puis terminer avec l’ancienne activité et relire avec le workflow candidat. Incluez des entrées et des résultats incompatibles comme témoins d’échec. Ne supposez pas que les protections d’entrée du workflow décrites plus haut protègent aussi les signatures d’activité ou la lecture des résultats par l’application. Le défaut confirmé d’injection de DTO dans les activités embarquées est suivi dans [Workflow #910](https://github.com/durable-workflow/workflow/issues/910).

Examinez ces contrats avec les règles des [arguments de démarrage enregistrés du workflow](#evolving-recorded-entry-arguments) et la [recette d’évolution des données d’un signal](signals.md#evolve-a-signal-payload).

### Frontières d’échec vérifiées {#activity-compatibility-failures}

Les [vérifications des paquets publiés de #363](https://github.com/durable-workflow/durable-workflow.github.io/issues/363) ont utilisé de nouveaux processus à chaque frontière de déploiement. Ce sont des versions vérifiées, pas des versions minimales prises en charge :

| Paquet publié | Entrée d’activité incompatible | Lecture de résultat incompatible |
| --- | --- | --- |
| Workflow embarqué 2.11.2 | Un argument obligatoire absent produit `ArgumentCountError` et un échec d’activité. | Lire un champ de tableau absent avec la gestion d’erreurs Laravel produit `ErrorException` et un échec du workflow. |
| PHP SDK 3.2.0 avec Server 2.11.0 | Un argument positionnel obligatoire absent est signalé comme `ArgumentCountError` dans l’échec d’activité. | Passer un champ absent à un lecteur exigeant une chaîne produit `TypeError` et un échec du workflow. |
| Python SDK 2.9.0 avec Server 2.11.0 | Un argument positionnel obligatoire absent produit `TypeError` et un échec d’activité. | Accéder à une clé de résultat absente produit `KeyError` et un échec du workflow. |
| Rust SDK 4.2.2 avec Server 2.11.0 | Un nouveau champ de requête obligatoire fait échouer le décodage d’entrée typée avant le handler d’activité. | Un nouveau champ de résultat obligatoire fait échouer le décodage du résultat typé dans le workflow. |

Les vérifications en mode service ont enregistré `max_attempts = 1` ; l’échec d’activité non intercepté a ensuite fait échouer le workflow. En général, les échecs d’activité suivent leur politique enregistrée de tentatives et de délais. Un workflow peut traiter l’échec d’une activité dont les tentatives sont épuisées. Une erreur de lecture de résultat est un échec applicatif du workflow, pas une demande de réexécuter l’activité terminée. Tous les témoins additifs ont terminé avec le montant original `7` et la devise par défaut `USD`, avec une seule tentative d’activité et aucune réparation. Dans les témoins de résultat, l’activité terminée est restée terminée.

Workflow embarqué 2.11.2 accepte aussi une modification de signature qui remplace le scalaire enregistré `7` par un DTO injecté dont le montant par défaut est `0`, et peut terminer à tort avec `0`. [Workflow #910](https://github.com/durable-workflow/workflow/issues/910) suit ce défaut du produit. N’utilisez pas l’injection de dépendances comme migration d’entrée d’activité et ne supposez pas que la protection d’entrée du workflow couvre ce cas. Restaurer un code compatible ne rouvre pas un run déjà terminal. Inspectez son état réel et suivez le [guide de récupération](../failures-and-recovery.md) sans modifier les entrées enregistrées, l’historique ou les échéances.

### Protection publiée pour les activités embarquées {#embedded-activity-argument-safeguard}

Workflow **2.11.3 est la version minimale corrigée** de la protection PHP embarquée contre une liaison d’activité qui remplace des arguments enregistrés. Dans les chemins d’activité en file et locale, remplacer le scalaire enregistré `7` par un DTO injecté dont la valeur par défaut est `0` est refusé avant l’exécution du corps, avec `ActivityEntryArgumentsMismatchException`. La [vérification du paquet publié et installé dans de nouveaux processus](https://github.com/durable-workflow/workflow/issues/910#issuecomment-6362080363) confirme le refus et la récupération avec l’entrée initiale. L’ancienne version 2.11.2 décrite ci-dessus reste affectée. Cette protection n’ajoute pas de champs aux anciens résultats ; les lecteurs compatibles ont toujours besoin d’une valeur de repli.

Le refus suit la **politique enregistrée de tentatives, de temporisation et de timeouts** de l’activité. Si une seule tentative est autorisée, elle est épuisée et un échec non traité fait échouer le workflow. S’il reste des tentatives définies par l’auteur et que le code compatible revient avant la tentative permise et les échéances, la même exécution/activité initiale peut se terminer avec son entrée enregistrée. La vérification couvre deux tentatives définies par l’auteur, sans temporisation, et le résultat `7` ; elle ne promet ni attente indéfinie d’un futur déploiement ni tentatives supplémentaires.

Restaurer le code ou installer le paquet ne rouvre pas les exécutions initiales terminales, ne réinitialise pas les échéances et ne restitue pas les tentatives consommées. Examinez l’échec réel et conservez l’entrée et l’historique enregistrés. Vérifiez le paquet Workflow installé dans l’application embarquée : cette version de bibliothèque ne met pas à jour les images Server existantes et n’établit pas l’acceptation des workers de service ou natifs.

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
