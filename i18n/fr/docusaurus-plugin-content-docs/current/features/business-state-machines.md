---
sidebar_position: 12
title: Machines à états métier
description: Protocole de transition expérimental pour des états métier partagés, des profils de politique propres à chaque intégration, des machines enfants imbriquées et une compensation conservée dans les workflows Laravel intégrés.
---

# Machines à états métier {#business-state-machines}

:::warning Expérimental

L’API `Workflow\V2\StateMachine`, ainsi que le démarrage d’enfant confirmé (`Workflow::startChild()`) et `DurableScope::reserveChild()` qu’elle utilise, sont expérimentaux. Ils sont livrés à titre expérimental depuis Workflow 2.29.0, ne sont pas couverts par les garanties de stabilité du paquet et peuvent changer dans une version mineure. Ils constituent une surface `experimental` au sens des [niveaux de stabilité](../compatibility.md#stability-levels). Le reste de l’API de portées de compensation conservées qu’elle utilise est stable depuis Workflow 2.33.0. Le catalogue de liaisons enfants, les explications de transition et `MachineInspection` ont été ajoutés dans Workflow 2.41.0.

Les exemples de cette page sont des exemples de code source du dépôt avec des fournisseurs synthétiques. Ils ne constituent pas une qualification sur paquet installé ni avec un fournisseur réel. Rien sur cette page n’implique :

- la migration d’une exécution en cours vers une nouvelle version de définition, de profil, de règle ou de gestionnaire ;
- des machines enfants récursives ou partagées ;
- des garanties pour un quelconque fournisseur réel de paiement, de transport ou d’entrepôt ;
- que la fonctionnalité de machines à états métier est complète ou dispose d’une version stable.

:::

Ce guide décrit le protocole facultatif de transition métier pour les workflows Laravel intégrés qui utilisent `Workflow\V2\Workflow`. Il s’appuie sur des primitives existantes : activités, workflows enfants, attentes durables, relecture et compensation [Saga](sagas.md). Les workflows existants et `Workflow\States\StateMachine` restent inchangés.

## Quand l’utiliser {#when-to-use-it}

Utilisez le protocole lorsque les états métier ont une signification partagée, mais que la manière de les atteindre diffère d’une intégration à l’autre :

- **Significations partagées de la machine.** Une `MachineDefinition` déclare les significations des états, les identités des transitions, un invariant obligatoire et des emplacements enfants nommés.
- **Politiques propres à chaque intégration.** Chaque `PolicyProfile` choisit ses arêtes, ses versions de gestionnaires et ses conditions nommées au sein de cette définition. Une intégration peut exiger une opération externe avant une transition ; une autre peut déjà fournir la preuve et sauter le travail.
- **Machines enfants imbriquées.** Une machine Order peut héberger une machine Shipment tant qu’elle se trouve dans un état déclaré. La liaison conserve l’identité d’origine de l’enfant à travers les nouvelles tentatives, les changements d’état et les redémarrages de worker.
- **Décisions métier protégées.** Le nouvel état métier est validé par une frontière détenue par l’application, qui vérifie l’état attendu, la révision et l’annulation acceptée.
- **Compensation conservée.** Des obligations peuvent survivre à l’exécution qui les a créées grâce aux portées de compensation conservées.

Si un seul workflow avec une saga suffit, utilisez directement les [Sagas](sagas.md) et les [workflows enfants](child-workflows.md).

## Le contrat de transition {#the-transition-contract}

Chaque gestionnaire de transition implémente les quatre mêmes méthodes, quelles que soient la machine ou l’intégration :

```php
interface TransitionStep
{
    public function canTransition(TransitionContext $context): bool;
    public function canExecute(TransitionContext $context): bool;
    public function execute(TransitionContext $context): ExecutionReceipt;
    public function compensate(TransitionContext $context, ExecutionReference $originalExecution): void;
}
```

- `canTransition()` indique si la cible est déjà atteinte. C’est une projection pure de l’évaluation de cible enregistrée.
- `canExecute()` indique si le travail est autorisé. C’est une projection pure de l’évaluation d’autorisation enregistrée.
- `execute()` orchestre des activités enregistrées ou des attentes durables et renvoie un `ExecutionReceipt`. Ce reçu accuse réception du travail ; il n’établit pas que la validation peut avoir lieu.
- `compensate()` reçoit l’`ExecutionReference` d’origine. Ne retournez qu’une fois les effets requis, ou leur absence, vérifiés. Un travail inconnu ou en attente doit attendre ou échouer explicitement, et ne jamais retourner avec succès.

Étendez `AssessedTransitionStep` pour implémenter les deux gardes directement à partir de l’instantané enregistré. L’exécuteur rejette une garde personnalisée qui contredit l’évaluation enregistrée.

## Comment l’exécuteur applique une transition {#how-the-runner-executes-a-transition}

`TransitionRunner::run()` reçoit le workflow, le profil épinglé, l’`ExecutionReference` d’origine, l’événement, un `TransitionRuntime` et un registre fermé de gestionnaires. Il procède ensuite ainsi :

1. Il sélectionne l’arête unique correspondant à l’événement et à l’état source. En l’absence de candidat, il renvoie `Unavailable` ; s’il y en a plusieurs, `Ambiguous`.
2. Il demande un instantané `before` enregistré et, lorsque le profil a une définition, vérifie son invariant partagé. Un invariant non satisfait renvoie `Blocked` ; un invariant inconnu renvoie `Unknown`.
3. Il vérifie la garde de cible. Une cible satisfaite saute le travail mais passe tout de même par la validation protégée ; sauter le travail ne revient pas à s’approprier des effets externes déjà existants. Une cible inconnue renvoie `Unknown`.
4. Il renvoie `Pending` lorsque l’arête ne déclare aucun travail. Sinon, il vérifie la garde d’exécution et enregistre l’admission en direct. Un refus renvoie `Blocked` ; une réponse inconnue renvoie `Unknown`.
5. Il enregistre la compensation de l’étape d’origine auprès de la Saga native, puis appelle `execute()`.
6. Il demande un nouvel instantané `after` et vérifie de nouveau l’invariant et la cible. Un état source ou une révision périmés renvoient `Conflict`, un résultat non satisfait `Pending` et un résultat inconnu `Unknown`. Une cible satisfaite passe à la validation protégée.
7. Il valide par l’intermédiaire du runtime, qui signale `Committed`, `Conflict` ou `CancellationRequested`.

Les valeurs de `TransitionStatus` sont des résultats de traitement, pas votre catalogue d’états métier. L’exécuteur ne relance jamais une transition entière et ne compense jamais de lui-même une transition bloquée. L’application décide d’attendre, de réessayer, de réconcilier ou de compenser. Un résultat ne vaut pas autorisation de clôturer le workflow propriétaire : gardez-le ouvert tant que du travail de progression ou des obligations de compensation subsistent.

`ActivityTransitionRuntime` implémente `TransitionRuntime` avec trois activités applicatives (instantané, admission et validation) et une `MachineDefinition` facultative. Il utilise l’historique ordinaire des activités et n’ajoute aucune commande de worker ni aucun événement d’historique. Dans l’exemple configuré Order/Shipment, chaque transition passe par le même appel à l’exécuteur :

```php
return (new TransitionRunner())->run(
    $this->workflow,
    $this->profile,
    $execution,
    Catalogue::transition($this->profile, $key)->event,
    new ActivityTransitionRuntime(
        SnapshotActivity::class,
        AdmissionActivity::class,
        CommitActivity::class,
        $this->profile->definition
    ),
    $handlers
);
```

Les trois classes d’activité sont du code applicatif, et non des classes du paquet.

## Définitions, profils et versions {#definitions-profiles-and-versions}

Une `MachineDefinition` contient ce que toutes les intégrations partagent. La définition en version deux de l’exemple déclare quatre états, les identités des transitions, une règle d’invariant et l’emplacement enfant Shipment :

```php
return new MachineDefinition(
    $machine,
    '2',
    [
        new MachineState('received', 'Business input accepted; completion has not been committed.'),
        new MachineState('working', 'Original work admitted; business completion remains pending.'),
        new MachineState('completed', 'The original execution has verified its required business outcome.'),
        new MachineState('cancelled', 'Original compensation verified and business cancellation committed.'),
    ],
    $machine === 'orders' ? ['begin', 'finish', 'cancel', 'reconcile'] : ['deliver'],
    self::fact('model_consistent'),
    $machine === 'orders' ? [
        new ChildSlot('shipment', ['received', 'working'], 'shipments', '2', 'completed'),
    ] : []
);
```

`PolicyProfile::forDefinition()` rattache à cette définition les arêtes `TransitionDefinition` et les conditions nommées d’une intégration. Un profil ne peut pas ajouter un état ou une identité de transition non déclarés, et les conditions nommées d’un profil ne peuvent pas remplacer l’invariant partagé.

La gestion des versions suit ces règles :

- **Empreintes.** L’empreinte de définition couvre les significations des états, l’invariant et les déclarations d’emplacements. L’empreinte de profil couvre les métadonnées de la définition et du profil, le graphe, les structures de conditions, les versions des gestionnaires et les éventuelles limites. Aucune des deux ne hache les implémentations PHP.
- **Exécutions épinglées.** Une `ExecutionReference` épingle la portée, le sujet métier, l’identifiant d’exécution, l’empreinte de politique, l’état source attendu et la révision. Enregistrez l’empreinte sélectionnée avant le début du travail et fournissez-la de nouveau lors de la relecture. Ne la calculez jamais à partir de la configuration la plus récente lors d’une reprise.
- **Nouvelles exécutions uniquement.** Une nouvelle version de définition ou de profil est sélectionnée pour les nouvelles exécutions. Réécrire l’affectation d’un sujet en cours change son empreinte, et l’exécution d’origine refuse alors de continuer. Il n’existe aucune API de migration des exécutions en cours.
- **Implémentations conservées.** Gardez déployées les anciennes définitions, règles, gestionnaires et versions d’autorisation tant que leurs exécutions ou leurs obligations conservées restent récupérables. Les gestionnaires proviennent d’un registre fermé de types et de versions indexé par `TransitionDefinition::handlerKey()`. Les données stockées ne peuvent pas sélectionner une classe PHP, et un gestionnaire manquant échoue avant toute E/S applicative.

Consultez [Gestion des versions](versioning.md) pour les règles générales de modification du code de workflow.

## Règles, conditions et faits enregistrés {#rules-conditions-and-recorded-facts}

La configuration sélectionne les conditions ; les implémentations de règles restent du code applicatif de confiance. Un `RuleRegistry` construit lors d’un amorçage de confiance associe un type et une version de règle à un objet `ConditionRule`. Une `RuleReference` épingle le type, la version et les paramètres, et `ConditionDefinition::rule()`, `all()`, `any()` et `not()` combinent ces feuilles. Une condition comporte au plus 64 nœuds.

Les décisions ont trois valeurs : `Verdict::Satisfied`, `Verdict::Unsatisfied` et `Verdict::Unknown`. Pour `all()`, un enfant non satisfait rend le groupe non satisfait ; sinon, un enfant inconnu le rend inconnu. Pour `any()`, un enfant satisfait rend le groupe satisfait ; sinon, un enfant inconnu le rend inconnu. La négation d’une valeur inconnue reste inconnue.

Les faits sont collectés uniquement dans l’activité d’instantané enregistrée. L’`AssessmentStore` de l’exemple enregistre les faits avec des références de preuves et évalue les conditions de cible et d’autorisation du profil :

```php
$facts = new RecordedFacts($id, $values, array_combine(array_keys($values), array_map(
    static fn (string $name): string => 'recorded-fact:' . $id . ':' . $name,
    array_keys($values)
)));
$registry = Catalogue::registry();
$target = $registry->evaluateCondition($profile->condition($transition->key . '.target'), $facts);
$permission = $registry->evaluateCondition($profile->condition($transition->key . '.permission'), $facts);
```

Lorsque le profil a une définition, la même activité évalue `MachineDefinition::assess()` et renvoie `MachineAssessment::fromEvaluation()` comme `machineAssessment` de l’instantané. Conservez l’explication complète de `ConditionEvaluation::toArray()` avec l’instantané. Une évaluation manquante, une définition modifiée ou une condition modifiée entraîne un refus avant le travail. Une évaluation enregistrée est une preuve fournie par l’hôte, pas une autorisation : la validation protégée doit tout de même vérifier l’autorité en direct, la révision et l’annulation.

## Relecture déterministe {#deterministic-replay}

Le protocole repose sur l’historique enregistré ; les [contraintes de workflow](../constraints/workflow-constraints.md) habituelles s’appliquent donc strictement :

- Les gardes et les règles n’effectuent aucune E/S. Elles ne lisent ni la base de données, ni la configuration, ni un fournisseur, ni le conteneur.
- Les lectures en direct ont lieu dans l’activité d’instantané. Lors de la relecture, les activités terminées renvoient leurs résultats enregistrés ; les règles ne sont pas réévaluées sur les données en direct.
- Un instantané `after` doit utiliser un identifiant d’instantané différent et des faits fraîchement collectés. `SnapshotPhase` sépare les preuves `before`, `after` et `compensation`, de sorte qu’une phase ne peut pas se substituer à une autre.
- `execute()` et `compensate()` appellent des activités. Encapsulez un fournisseur synchrone ou un gestionnaire applicatif dans une activité ; l’appeler directement depuis le code du workflow peut répéter ses effets lors de la relecture.
- L’admission enregistre uniquement l’autorité et l’autorisation. Elle ne doit pas produire l’effet métier de progression avant l’enregistrement auprès de la Saga.
- Utilisez `TransitionResult::toArray()` aux frontières du workflow et de l’historique. Les objets du domaine applicatif restent derrière vos adaptateurs d’étape et de runtime.

## Validations métier protégées {#protected-business-commits}

L’activité de validation est l’autorité métier de l’application. Elle doit :

1. Lier l’identifiant de décision à sa portée, à son sujet, à sa politique, à sa transition et à son contenu. Un doublon exact renvoie le résultat enregistré ; réutiliser l’identifiant pour un autre contenu entraîne un refus.
2. Revérifier l’autorité en direct, l’état source et la révision attendus, ainsi que toute annulation acceptée, sous le verrou faisant autorité de l’application.
3. Enregistrer atomiquement l’état métier, la décision et toute intention de publication lorsqu’ils partagent un même stockage.
4. Après un accusé de réception perdu, rechercher ou réessayer exactement cette décision au lieu de répéter les effets.

Elle renvoie un `CommitResult` avec `committed`, `conflict` ou `cancellation_requested`. Ce dernier statut signifie qu’une annulation acceptée a empêché cette validation. Il ne signifie pas que la compensation est terminée ni que l’entité métier est annulée. Aucune transaction distribuée n’est implicite entre le stockage de l’application et Durable Workflow.

## Machines enfants liées aux états du parent {#child-machines-bound-to-parent-states}

Un `ChildSlot` dans la définition parente nomme l’emplacement, ses états hôtes, la machine enfant et la version de sa définition, ainsi que le résultat métier requis. `MachineDefinition::assertBinding()` vérifie une liaison par rapport à cette déclaration. Elle n’effectue ni recherche, ni autorisation, ni admission.

Une `BindingIdentity` épingle l’exécution parente d’origine, l’espace de noms, l’instance et l’exécution (run) du parent, l’emplacement, la **génération**, l’état hôte, le type de workflow enfant, l’empreinte de politique de l’enfant, le résultat requis, l’empreinte d’entrée et les options de l’enfant. La génération identifie une entrée dans un état. Les demandes visant une ancienne génération ne sont jamais redirigées vers un enfant plus récent après que le parent a changé d’état ou est entré de nouveau dans un état.

Démarrer un enfant et l’attendre sont deux transitions distinctes :

- **Démarrage.** Le parent réserve et admet l’enfant, enregistre la liaison exacte, et seulement ensuite valide l’état hôte. Si la liaison est déjà enregistrée, l’étape la réutilise au lieu de démarrer à nouveau. Avec des portées conservées, `DurableScope::reserveChild()` renvoie une `ChildReservation`, et `ChildReservation::start()` utilise le démarrage natif confirmé de l’enfant. `ChildReservationStore::close()` renvoie ensuite soit la `ChildBinding` admise, soit un `NeverAdmittedChild` permanent.
- **Attente.** Une transition ultérieure observe cette même admission. Elle ne crée ni un deuxième enfant ni un deuxième propriétaire de compensation.

L’étape partagée de l’exemple montre les deux transitions :

```php
if ($key === 'begin') {
    $childScope = Ownership::childScope($execution);
    $reservation = $this->scope->reserveChild(
        $execution->executionId . '.shipment',
        $childScope,
        Ownership::binding(
            $execution,
            $this->initialization['rootRun'],
            $this->initialization['integration'],
            $this->initialization['version']
        )
    );
    $existing = Workflow::activity(BoundaryActivity::class, 'binding', [
        'reservation' => $reservation->toArray(),
    ]);
    if ($existing === null) {
        $reservation->start(
            $execution->subject,
            $this->initialization['rootRun'],
            $execution->toArray(),
            $childScope->toArray()
        );
        $existing = Workflow::activity(BoundaryActivity::class, 'record-start', [
            'reservation' => $reservation->toArray(),
        ]);
    }
    $binding = ChildBinding::fromArray($existing);
    $operations[] = 'child:' . $binding->admission->childRunId;
} elseif ($key === 'finish') {
    $value = Workflow::activity(BoundaryActivity::class, 'active-binding', []);
    $binding = ChildBinding::fromArray($value);
    $outcome = StartedChildWorkflow::fromArray($binding->admission->toArray())->await();
    Workflow::activity(BoundaryActivity::class, 'outcome', [
        'binding' => $value,
        'outcome' => $outcome,
    ]);
} elseif ($key !== 'deliver') {
    throw new LogicException('A proof-only transition must not dispatch work.');
}
```

Sans réservation, `Workflow::startChild()` renvoie un reçu `StartedChildWorkflow` qu’une étape ultérieure peut attendre avec `await()`. Le parent doit vérifier le résultat métier de l’enfant ; l’achèvement technique de l’enfant, un signal accepté ou un délai expiré ne suffisent pas. `Workflow::startChild()` est réservé au mode intégré ; l’exécution par le protocole worker le refuse.

### Catalogue de liaisons enfants {#child-binding-catalog}

À partir de Workflow 2.41.0, un `MachineCatalog` enregistre les définitions qui peuvent s’héberger mutuellement. Sa construction résout chaque emplacement vers une `machine@version` enregistrée et refuse un graphe invalide avant qu’une liaison ne l’utilise :

```php
$catalog = new MachineCatalog([$orders, $returns, $shipments], maxChildDepth: 1);

$catalog->child($orders, 'shipment');
$catalog->assertBinding($parentProfile, $binding, $childProfile);
```

- Une version de machine en double, un emplacement qui nomme un enfant non enregistré et une liaison récursive ou cyclique lèvent `InvalidMachineCatalog`. Son `reason` vaut `state_machine_definition_duplicate`, `state_machine_child_definition_unregistered` ou `state_machine_child_binding_cycle`. Une machine qui s’héberge elle-même, directement, via d’autres machines ou sous une autre version, forme un cycle.
- `InvalidMachineCatalog::$path` liste le chemin, que le message affiche ainsi : `orders@1 -> shipment:shipments@1 -> parent:orders@1`.
- Le paramètre facultatif `maxChildDepth` lève `ResourceLimitExceeded` avec la dimension `child_depth` lorsque le chemin d’emplacements le plus profond est plus long ; `observed` indique cette profondeur. La compensation conservée prend en charge un seul niveau d’enfant : utilisez donc `maxChildDepth: 1` lorsque des enfants participent à des portées conservées.
- Plusieurs parents ou états hôtes peuvent partager une même définition enfant.
- `$catalog->assertBinding()` exige aussi que les deux profils utilisent exactement les définitions enregistrées, comparées par empreinte.

Le catalogue est facultatif. Le démarrage natif d’enfant, les réservations et `MachineDefinition::assertBinding()` ne le consultent pas : appelez donc `$catalog->assertBinding()` dans l’autorisation de liaison de l’hôte, comme le fait l’exemple configuré. Un catalogue est de la configuration : chaque exécution épingle toujours ses propres empreintes, et remplacer le catalogue ne migre rien.

## Compensation et portées conservées {#compensation-and-retained-scopes}

L’exécuteur enregistre l’étape d’origine auprès de la Saga native avant que `execute()` puisse se suspendre ou échouer. Le rappel capture l’exécution et l’étape d’origine, et non le reçu. Pendant la compensation, l’exécuteur demande un nouvel instantané `compensation` et appelle `compensate()` avec l’exécution d’origine. Utilisez la compensation séquentielle par défaut.

Un rappel de Saga local à une exécution (run) prend fin avec celle-ci. Les portées de compensation conservées (`Workflow\V2\Compensation`) gardent chaque obligation dans un registre durable, de sorte qu’elle puisse être compensée après la clôture de l’exécution d’origine. Le [guide des portées de compensation](./compensation-scopes.md) décrit cette API et indique quelles parties en sont stables. Dans les exemples, chaque effet externe est enregistré comme `Obligation` via `DurableScope::execute()` avant d’être déclenché, et une portée enfant est vérifiée avant que les effets antérieurs du parent soient annulés. La compensation propre à l’étape ne vérifie ensuite que ses obligations d’origine :

```php
public function compensate(TransitionContext $context, ExecutionReference $originalExecution): void
{
    Workflow::activity(RequestScopeActivity::class, $this->identity->toArray(), $this->principal);
    // Scope callbacks registered within execute() run first. Check only this step's original subset:
    // verifying the whole scope here would block earlier steps before their callbacks can run.
    Workflow::activity(BoundaryActivity::class, 'verify-step', [
        'execution' => $originalExecution->toArray(),
        'key' => $context->transition->key,
    ]);
}
```

L’annulation métier est une décision distincte. Dans les exemples, une transition de preuve uniquement ne valide `cancelled` qu’après la vérification de la portée conservée. Une annulation technique, une demande de récupération en file d’attente ou une compensation en échec ne l’établissent pas. Le graphe conservé actuel comporte un seul niveau parent/enfant, au plus 16 enfants et 256 obligations par portée. La propriété de progression de la racine et de l’enfant n’est pas transférée aux successeurs issus de continue-as-new ou de redrive, et la libération de la rétention reste explicite.

## Budgets et résultats explicites {#budgets-and-explicit-outcomes}

Une configuration de confiance peut borner une machine :

- `DefinitionLimits` (`states`, `transitions`, `childSlots`, `ruleNodes`) est transmis à `MachineDefinition` sous la forme `limits:`. Chaque profil lié vérifie aussi ses arêtes source développées et le nombre total de nœuds de condition.
- `ExecutionLimits` (`commands`, `historyEvents`, `historyBytes`, `groupDepth`) est attaché avec `PolicyProfile::withLimits()` ou l’argument `limits:` de `PolicyProfile::forDefinition()`. Le budget de commandes couvre chaque suspension durable dans `TransitionRunner`, jusqu’à 4 096 commandes et 64 niveaux de groupe. Les valeurs d’historique sont des seuils d’admission mesurés avec `Workflow::historyBudgetAtStep()` avant chaque commande, et non des plafonds absolus.

Les deux limites entrent dans leurs empreintes. Les omettre conserve les empreintes antérieures ; ajouter ou modifier un budget exige une version explicitement sélectionnée pour les nouvelles exécutions.

Un budget atteint pendant l’exécution renvoie `TransitionStatus::Blocked` avec le motif `state_machine_<dimension>_limit_exceeded`. Une définition invalide lève `ResourceLimitExceeded` avec la dimension, le nombre observé et la limite avant l’exécution de tout gestionnaire. Aucun de ces résultats ne signifie que l’annulation a réussi ni qu’un effet externe antérieur ne s’est pas produit. `Workflow::compensate()` s’exécute en dehors des budgets de progression.

## Diagnostics {#diagnostics}

- `TransitionResult::toArray()` renvoie l’exécution, le statut, le motif, l’évaluation et la clé de transition.
- À partir de 2.41.0, `TransitionResult::explain()` nomme aussi la `TransitionStage` qui a produit le résultat ainsi que l’instantané enregistré et la phase évalués par cette vérification. `toArray()` est inchangé.
- `ConditionEvaluation::toArray()` conserve l’empreinte de structure, l’identifiant d’instantané, les versions des règles, les motifs, les références de preuves et les faits manquants.
- `MachineAssessment::toArray()` enregistre la décision d’invariant liée à la définition et à l’instantané.
- `ResourceLimitExceeded` expose `dimension`, `observed` et `limit`.
- `ScopeRecovery::describe()` indique l’état d’une portée conservée, y compris lorsqu’une nouvelle demande d’annulation autorisée est nécessaire.

L’étape distingue des résultats qui ont le même statut :

| Étape | Statuts | Signification |
| --- | --- | --- |
| `selection` | `unavailable`, `ambiguous` | Aucune arête unique pour l’événement et la source. Aucun instantané. |
| `source` | `conflict` | L’état ou la révision de l’instantané diffère de la source attendue. |
| `invariant` | `blocked`, `unknown` | L’invariant partagé a refusé, avant ou après le travail. |
| `target` | `pending`, `unknown` | La cible était inconnue, n’avait aucun travail déclaré ou restait non satisfaite après le travail. |
| `permission` | `blocked`, `unknown` | La garde d’exécution a refusé. |
| `admission` | `blocked`, `unknown` | L’admission en direct enregistrée a refusé. |
| `budget` | `blocked` | Un budget d’avancement a refusé la commande suivante. Aucun instantané. |
| `commit` | `committed`, `conflict`, `cancellation_requested` | Le commit protégé a accusé réception de la décision. |

Pour les étapes `invariant`, `target` et `permission`, l’identifiant d’instantané permet de retrouver la `ConditionEvaluation` que l’hôte a conservée pour cet instantané. Pour `admission` et `commit`, la raison provient de l’admission ou du commit enregistrés, et l’instantané identifie seulement les preuves utilisées. Un refus après le travail nomme l’instantané `after`. Les résultats construits par le code applicatif sans étape gardent `stage` et `snapshot` à null.

`MachineInspection` donne aux outils d’exploitation une vue versionnée d’un sujet métier. L’hôte la construit hors du code de workflow, à partir de valeurs qu’il a déjà autorisées :

```php
$inspection = new MachineInspection(
    $profile, $state, $revision, $execution, $result,
    [$childBinding, $childReservation, $neverAdmittedChild],
    [['scope' => $scopeIdentity, 'description' => $scopeRecovery->describe($scopeIdentity, $principal)]],
);
$view = $inspection->toArray();
```

- `machine` contient les versions épinglées de la machine, de la définition et du profil avec leurs empreintes. `business` est l’état et la révision actuels issus du stockage de l’application, distincts du statut de l’exécution du workflow. `transition` est le `explain()` du `TransitionResult` de l’exécution inspectée, ou null si aucun n’est transmis.
- `children` contient une entrée par génération de liaison ; la liste peut donc être plus courte que celle transmise. Chaque entrée comporte un `status` (`admitted`, `never_admitted` ou `reserved`), la clé de liaison, l’emplacement, la génération, l’état hôte, le type de workflow enfant, le résultat requis, l’exécution parente qui a créé la liaison, l’instance et l’exécution enfants, et un identifiant de clôture. Un enfant admis ne prouve pas son résultat métier.
- `participation` relie un enfant aux identifiants de ses portées parente et enfant conservées et à la clé d’obligation, qui se joignent au `scopeId` des entrées `compensation`. Transmettez la `ChildReservation` d’un enfant admis à côté de son `ChildBinding`. Un `participation` nul signifie que l’enfant n’a pas de participation conservée ou qu’aucune réservation n’a été transmise.
- `compensation` liste l’identité et l’identifiant de chaque portée avec les clés de `ScopeRecovery::describe()`.

La construction refuse un état non déclaré, une exécution sous un autre profil, une transition d’une autre exécution, un travail enfant d’un autre sujet ou profil, des générations contradictoires ou répétées, des portées répétées et des descriptions de portée mal formées. Elle n’effectue aucune E/S et n’autorise rien. Les clés de portée sont définies par l’application ; c’est donc l’hôte qui associe les portées racines au sujet.

## Exemples exécutables {#runnable-examples}

Les exemples se trouvent dans le dépôt workflow et s’exécutent avec ses dépendances de développement et sa base de données de test. Ils utilisent leurs propres tables applicatives jetables, et non les migrations du paquet.

| Exemple | Ce qu’il démontre |
| --- | --- |
| [Order et Shipment configurés](https://github.com/durable-workflow/workflow/blob/main/examples/configured-state-machines/README.md) | Deux profils d’intégration, `prepare` et `imported`, avec les mêmes états et une seule étape partagée. La préparation héberge Shipment dans `working` ; l’import l’héberge dans `received`. Une arête de preuve uniquement, `reconcile`, saute le travail lorsque la preuve existe. La version deux ajoute des définitions partagées pour les nouveaux sujets, tandis que la version un reste épinglée. Inclut la réservation d’enfant, la compensation conservée et la finalisation de l’annulation. |
| [Order, Payment et Shipment adossés à un fournisseur](https://github.com/durable-workflow/workflow/blob/main/examples/provider-state-machines/README.md) | Trois machines sur le même protocole, face à un journal de fournisseur synthétique. Les recettes couvrent le passage en caisse avec réservation préalable ou paiement préalable, les résultats de remboursement, l’autorisation et la capture après stock ou livraison, le financement bancaire, par paiement à la livraison (COD), par acompte et solde ou par abonnement, les baux (leases) de Cart, les montants en unités monétaires, le stock partiel, les retours, les échanges, les incidents de transporteur et la récupération après perte de worker. |
| [Décisions métier SQL](https://github.com/durable-workflow/workflow/blob/main/examples/business-state-machines/README.md) | Une validation protégée détenue par l’application, avec un fencing SQL pour l’annulation, les conflits de révision, la révocation d’autorité, l’intention de publication et les accusés de réception perdus, ainsi que la compensation native imbriquée d’Order et de Shipment. |

Exécutez les tests de l’exemple configuré depuis le dépôt workflow :

```shell
vendor/bin/phpunit tests/Feature/V2/V2ConfiguredStateMachineExampleTest.php
```

Les trois utilisent des fournisseurs synthétiques ou partageant la même base de données. Ils ne qualifient ni un transporteur, un fournisseur de paiement ou un entrepôt réels, ni une mise à niveau de paquet installé, ni une migration en cours d’exécution. Une intégration réelle doit fournir sa propre idempotence, son propre fencing et la réconciliation des résultats incertains.

La [référence des machines à états métier](https://github.com/durable-workflow/workflow/blob/main/docs/business-state-machines.md) du dépôt du moteur documente le contrat complet, y compris la forme des charges utiles des activités. L’état de la livraison est suivi dans [durable-workflow/workflow#1069](https://github.com/durable-workflow/workflow/issues/1069).
