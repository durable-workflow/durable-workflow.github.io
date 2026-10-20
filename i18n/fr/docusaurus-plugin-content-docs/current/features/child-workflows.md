---
sidebar_position: 9
---

# Workflows enfants {#child-workflows}

L’interface actuelle de `Workflow\V2` prend en charge les workflows enfants durables avec des appels séquentiels `child()` et des barrières de regroupement `all([...])`, composées uniquement d’enfants, mélangées à des activités ou imbriquées dans des groupes `all([...])` plus grands. Le parent peut ainsi programmer durablement un ou plusieurs sous-workflows et attendre leurs résultats sans maintenir son processus en vie.

Une exécution enfant reste une exécution de workflow normale avec ses propres identifiants d’instance et d’exécution. Son statut d’enfant provient du lien durable avec l’exécution parente et d’un `child_call_id` stable émis par le parent pour cet appel.

```php
use function Workflow\V2\child;
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle(string $name): array
    {
        $child = child(ChildWorkflow::class, $name);

        return [
            'parent_workflow_id' => $this->workflowId(),
            'parent_run_id' => $this->runId(),
            'child' => $child,
        ];
    }
}
```

## Comportement actuel {#current-behavior}

- Importez la fonction avec `use function Workflow\V2\child;` et appelez `child(ChildWorkflow::class, ...)`. L’appel suspend le parent, crée une exécution enfant durable et renvoie son résultat à sa clôture.
- Un enfant en échec lève une exception dans le parent. Un enfant réussi renvoie sa sortie. L’annulation et l’arrêt forcé sont exposés par des types d’exception distincts.
- `$this->child()` renvoie la référence enfant la plus récente. `$this->children()` renvoie toutes les références dans l’ordre des étapes. Elles exposent `id()`, `runId()`, `callId()` et des fonctions de signal comme `signal()` et `signalWithArguments()`.
- Si un enfant utilise `continueAsNew()`, le parent suit automatiquement la dernière exécution : `runId()` avance et `id()` reste stable.
- `all()` peut combiner les fermetures `fn () => child(...)` et `fn () => activity(...)` dans une barrière. Le parent se réveille au premier échec d’enfant, mais attend la clôture de toutes les branches réussies avant de reprendre.

## Barrière d’enfants parallèles {#parallel-child-barrier}

Importez les fonctions avec `use function Workflow\V2\all;` et `use function Workflow\V2\child;` pour qu’une étape parente attende plusieurs workflows enfants ensemble.

```php
use function Workflow\V2\all;
use function Workflow\V2\child;
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle(): array
    {
        $children = all([
            fn () => child(FirstChildWorkflow::class),
            fn () => child(SecondChildWorkflow::class),
        ]);

        return $children;
    }
}
```

Cette forme réservée aux enfants est utile si chaque membre parallèle est un workflow enfant :

- elle attend le groupe entier comme une seule étape parente
- elle conserve l’ordre initial du tableau dans les résultats
- elle propage la clôture d’enfant non réussie sélectionnée dans le corps du parent, en choisissant la clôture la plus ancienne puis l’indice le plus faible en cas d’égalité

Pour combiner workflows enfants et activités dans une même étape de regroupement, utilisez une barrière `all([...])` mixte. Les attentes d’enfants et d’activités partagent le même `parallel_group_id`, et Waterline indique `parallel_group_kind = mixed`. Si un sous-groupe mixte ou réservé aux enfants est imbriqué dans un `all([...])` plus grand, le groupe le plus interne détermine toujours `parallel_group_id`, tandis que `parallel_group_path` conserve le chemin complet de l’extérieur vers l’intérieur.

## Contrat d’identité {#identity-contract}

- `child()->id()` et le `target_name` de Waterline désignent l’identifiant d’instance enfant, stable dans toute sa chaîne d’exécutions.
- `child_call_id` désigne l’appel émis par le parent lui-même, stable même si l’enfant utilise ensuite `continueAsNew()`.
- `resume_source_id`, `child_workflow_run_id` et les routes d’exécution sélectionnée désignent une exécution enfant précise dans cette chaîne d’appel.

## Références aux enfants {#child-handles}

Une fois que le parent a atteint durablement une étape enfant, il peut inspecter cet appel via un `ChildWorkflowHandle`.

```php
use Workflow\UpdateMethod;
use function Workflow\V2\child;
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle()
    {
        return child(ApprovalWorkflow::class);
    }

    #[UpdateMethod('approve-child')]
    public function approveChild(string $approvedBy): void
    {
        $this->child()?->signal('approved-by', $approvedBy);
    }
}
```

- `$this->child()` renvoie la dernière référence enfant visible ou `null`.
- `$this->children()` renvoie toutes les références visibles dans l’ordre des étapes.
- Dans une barrière `all([fn () => child(...)])`, les références apparaissent dans l’ordre des appels enfants de la barrière et `$this->child()` renvoie la dernière visible.
- Le `runId()` d’une référence suit le dernier `ChildRunStarted` enregistré par le parent dans cette chaîne. Un parent attendant un enfant ayant utilisé `continueAsNew()` voit donc le dernier identifiant d’exécution enfant sans perdre le `callId()` initial.

## Disponibilité des références {#handle-availability}

Les références enfants reposent sur l’historique, sans spéculation :

- Avant que le parent atteigne durablement l’étape enfant, `$this->child()` renvoie `null` et `$this->children()` une liste vide.
- Dès que le parent enregistre la programmation ou le démarrage de l’enfant pour cette étape, la référence devient visible aux requêtes de lecture, mises à jour et relectures ultérieures.
- La relecture d’une requête de lecture n’envoie jamais de signaux enfants depuis les mises à jour enregistrées. Elle restaure uniquement l’état en mémoire découlant de l’historique validé.

## Visibilité dans Waterline {#waterline-visibility}

Lorsque le parent est bloqué sur un enfant, Waterline affiche une attente d’enfant plutôt qu’un type de tâche distinct. Ainsi :

- le résumé parent indique `wait_kind = child` et `liveness_state = waiting_for_child`
- `waits` inclut `kind = child`, le `child_call_id` stable, l’identifiant d’instance enfant dans `target_name` et son identifiant d’exécution dans `resume_source_id`
- si plusieurs attentes enfants sont ouvertes, les détails exposent aussi `open_wait_count`
- les attentes créées par une barrière `all([...])` mixte ou réservée aux enfants partagent `parallel_group_id` et exposent `parallel_group_kind`, `parallel_group_base_sequence`, `parallel_group_size` et `parallel_group_index`
- les attentes imbriquées exposent aussi `parallel_group_path`, de la barrière englobante la plus externe à la plus interne
- `timeline` inclut les événements enfants typés comme `ChildWorkflowScheduled`, `ChildRunStarted`, `ChildRunCompleted` et `ChildRunFailed`, avec le même `child_call_id` stable
- les attentes ouvertes et la filiation privilégient désormais l’historique parent typé `ChildWorkflowScheduled` / `ChildRunStarted`, conservent une entrée logique par `child_call_id` stable et suivent la dernière exécution enfant enregistrée par le parent, même si les lignes copiées `workflow_links` disparaissent ou si le `current_run_id` modifiable de l’instance enfant dérive après validation de l’historique
- après l’enregistrement d’un événement typé de résolution d’enfant par le parent, les détails maintiennent l’attente résolue depuis l’historique parent même si la ligne d’exécution enfant dérive ensuite. L’historique terminal enfant ou les anciens liens peuvent enrichir la filiation et les diagnostics, mais ne remplacent pas un historique parent typé d’étape enfant manquant pour la relecture
- une fois cet événement présent, la filiation et l’export conservent aussi le type, la classe, le numéro d’exécution, la catégorie de statut et la raison de clôture de l’enfant depuis l’historique parent, au lieu de relire la ligne modifiable pour ces champs d’enfant résolu
- si une ligne terminale ou un lien enfant existe sans historique parent typé `ChildWorkflowScheduled`, `ChildRunStarted`, `ChildRunCompleted`, `ChildRunFailed`, `ChildRunCancelled` ou `ChildRunTerminated` pour cette étape, les relectures des workers et requêtes de lecture sont bloquées avec `history_shape_mismatch` et les événements enregistrés `no typed history`. Waterline marque l’attente `status = unsupported`, expose `history_authority = unsupported_terminal_without_history` et `history_unsupported_reason = terminal_child_link_without_typed_parent_history`, et montre l’identité enfant issue de la tâche bloquée ou du repli de filiation si disponible
- si la ligne de tâche de reprise du parent est perdue après la résolution d’enfant, les détails restent à `repair_needed` et exposent une tâche manquante synthétique avec `workflow_wait_kind = child`, `child_call_id` et `child_workflow_run_id`. `repair()` manuel, `workflow:v2:repair-pass` ou la réparation de boucle worker recrée cette même tâche de résolution depuis l’historique parent typé
- les tableaux de filiation exposent la relation parent/enfant durable à côté des liens de continuation. Les entrées de workflow enfant portent désormais le même `child_call_id`

## Politique à la clôture du parent {#parent-close-policy}

Lorsqu’un parent se clôture par réussite, échec, expiration, annulation ou arrêt forcé, chaque enfant ouvert est affecté selon sa **politique à la clôture du parent**. Définie par appel enfant, elle détermine le sort de l’enfant à la sortie de l’exécution parente.

| Politique | Valeur | Comportement |
|---|---|---|
| Abandonner | `abandon` | L’enfant continue indépendamment. Valeur par défaut. |
| Demander une annulation coopérative | `request_cancellation` | L’enfant reçoit une demande de nettoyage coopératif avec la filiation et l’échéance d’annulation initiales du parent. |
| Demander l’annulation terminale | `request_cancel` | Une commande d’annulation est envoyée à l’enfant à la clôture du parent. |
| Arrêter de force | `terminate` | Une commande d’arrêt forcé est envoyée à l’enfant à la clôture du parent. |

### Politique par défaut {#default-policy}

Un appel `child()` sans `ChildWorkflowOptions` utilise toujours `ParentClosePolicy::Abandon`. Les fonctions compatibles au niveau source `Workflow\V2\child()`, `Workflow\V2\Workflow::child()` et `Workflow\V2\Workflow::executeChildWorkflow()` construisent toutes les options par défaut si le premier argument n’est pas un `ChildWorkflowOptions`, fixant `parentClosePolicy` à `ParentClosePolicy::Abandon`. Il en va de même pour chaque fermeture `child()` d’une barrière `all([...])` sans argument d’options. Remplacez ce comportement avec un `ChildWorkflowOptions` explicite, comme ci-dessous.

### Définir la politique {#setting-the-policy}

Passez un `ChildWorkflowOptions` comme premier argument de `child()` :

```php
use function Workflow\V2\child;
use Workflow\V2\Enums\ParentClosePolicy;
use Workflow\V2\Support\ChildWorkflowOptions;
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle(): array
    {
        $options = new ChildWorkflowOptions(
            parentClosePolicy: ParentClosePolicy::RequestCancel,
        );

        return child(ChildWorkflow::class, $options, 'argument1');
    }
}
```

Le même modèle fonctionne avec les fermetures dans `all()` pour les barrières parallèles :

```php
use function Workflow\V2\all;
use function Workflow\V2\child;
use Workflow\V2\Enums\ParentClosePolicy;
use Workflow\V2\Support\ChildWorkflowOptions;

$cancelOptions = new ChildWorkflowOptions(
    parentClosePolicy: ParentClosePolicy::RequestCancel,
);

$results = all([
    fn () => child(FirstChild::class, $cancelOptions),
    fn () => child(SecondChild::class, $cancelOptions, 'arg'),
]);
```

### Fonctionnement {#how-it-works}

- La politique est enregistrée sur la ligne `workflow_links` (`parent_close_policy`) et dans les données de l’événement `ChildWorkflowScheduled`.
- À toute clôture du parent, le moteur recherche les liens enfants ouverts avec une politique autre qu’abandon et envoie à chacun la commande adaptée : demande coopérative, annulation ou arrêt forcé.
- Si l’enfant est déjà clôturé lors de l’application, aucune action n’est exécutée et la commande est ignorée silencieusement.
- L’application est faite au mieux : le rejet d’une commande enfant (par exemple déjà terminal) n’affecte pas la clôture du parent. Un succès enregistre `ParentClosePolicyApplied` sur le parent. Un échec enregistre `ParentClosePolicyFailed` pour distinguer les applications réussies des échecs silencieux.
- La continuation dans une nouvelle exécution ne déclenche **pas** cette politique, car l’instance reste active.

### Matrice des résultats du parent {#parent-disposition-matrix}

La politique s’applique à chaque résultat terminal du parent et reste inactive pour les exécutions vivantes ou transférées à une nouvelle exécution. Le moteur applique le même comportement pour tout résultat terminal : la politique concerne chaque lien enfant encore ouvert dont la politique n’est pas l’abandon.

| Résultat du parent | Politique appliquée ? | Remarques |
|---|---|---|
| Terminé | Oui | Après l’enregistrement de `WorkflowCompleted`. Un appel séquentiel `child()` attend toujours l’enfant : une fin naturelle n’a normalement pas d’enfant ouvert. L’application est néanmoins appelée par sécurité. |
| Échec | Oui | Après l’enregistrement de `WorkflowFailed` pour tout échec terminal de tâche de workflow. |
| Expiré | Oui | Après l’enregistrement de `WorkflowTimedOut` pour les expirations d’exécution individuelle ou globale. |
| Annulé | Oui | Après la clôture du parent par la commande acceptée `CancelRequested`. |
| Arrêté de force | Oui | Après la clôture du parent par la commande acceptée `TerminateRequested`. |
| Continuation | Non | L’instance reste active dans la nouvelle exécution. Les liens enfants existants sont redirigés vers celle-ci avec leur politique initiale. |
| Réinitialisation | Non applicable actuellement | Le runtime v2 n’expose ni commande autonome de réinitialisation ni résultat terminal correspondant. Toute future réinitialisation ou réparation clôturant ou remplaçant un parent devra définir le transfert de propriété des enfants. Si l’ancienne exécution devient terminale, elle doit appliquer la politique avant de cesser de posséder ses enfants ouverts. |

### Quand utiliser chaque politique {#when-to-use-each-policy}

**Abandonner** (par défaut) convient aux enfants représentant un travail indépendant devant aboutir quel que soit le sort du parent, par exemple un workflow de notification ou une tâche de nettoyage à terminer.

**Demander une annulation coopérative** utilise `ParentClosePolicy::RequestCancellation` pour le nettoyage coopératif. Cette politique préserve l’identité racine et l’échéance immuable d’une demande parent existante. Si le parent se clôt sans demande, elle enregistre un budget partagé de nettoyage de 600 secondes à partir de l’heure de clôture enregistrée. Une application répétée n’accorde pas de temps supplémentaire. Consultez [Annulation coopérative](/docs/polyglot/cancellation) pour la capacité des workers en mode service et le contrat de nettoyage.

**Demander l’annulation terminale** applique la commande terminale `cancel()` de l’enfant à la clôture du parent. Malgré son nom, elle ne livre pas la demande coopérative distincte `requestCancellation()`. L’enfant ne peut exécuter de nettoyage ou compensation dans son code après la clôture. Terminez les compensations nécessaires avant de clôturer le parent, ou utilisez **Abandonner** pour un nettoyage indépendant.

**Arrêter de force** convient aux enfants devant s’arrêter immédiatement. Utilisez cette politique pour les enfants purement auxiliaires, sans valeur indépendante après la clôture du parent.

### Visibilité dans Waterline {#waterline-visibility-1}

Waterline affiche `parent_close_policy` dans :

- l’entrée de lien enfant de la vue de filiation du parent
- les données de l’entrée de chronologie `ChildWorkflowScheduled`
- l’événement enfant `CancelRequested` ou `TerminateRequested` lors de l’application de la politique, avec une raison nommant la clôture du parent

## Limites actuelles {#current-limitations}

L’interface actuelle n’inclut pas :

- de fonctions intégrées de concurrence bornée au-delà des barrières actuelles `all([fn () => child(...)])`, `all([fn () => activity(...)])` et mixtes `all([fn () => child(...), fn () => activity(...)])`

Les références enfants durables sont donc prises en charge pour les étapes déjà atteintes, mais il n’existe pas encore d’API de lancement avec référence ou de concurrence bornée de plus haut niveau au-delà de `child(...)` et `all([...])`.

## Exécuter ce modèle {#run-this-pattern}

Le workflow de coordination de microservices de la [Sample App](/docs/sample-app)
est la référence exécutable pour l’orchestration parent-enfant entre applications :

```bash
php artisan app:microservice
```

`App\Workflows\Microservice\MicroserviceWorkflow` exécute le parent dans
l’application Laravel principale et envoie le travail enfant au worker de
microservice inclus. Ouvrez Waterline pendant l’exécution pour voir les liens
enfants sous le parent et la politique de clôture dans la vue de filiation,
comme décrit sur cette page.
