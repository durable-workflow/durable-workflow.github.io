---
sidebar_position: 14
tags:
  - continue-as-new
  - history
  - message-streams
  - workflows
keywords:
  - continuation dans une nouvelle exécution
  - croissance de l’historique de workflow
  - passage de relais entre exécutions
  - transfert de flux de messages
---

# Continuer dans une nouvelle exécution {#continue-as-new}

Le modèle **Continue As New** permet à un workflow en cours de se redémarrer
avec de nouveaux arguments. Il sert à :

* Éviter une croissance illimitée de l’historique.
* Modéliser des boucles itératives ou des workflows récursifs.
* Diviser les workflows longs en exécutions plus petites et gérables, tout en préservant la continuité.

## Utiliser `continueAsNew` {#using-continueasnew}

Pour redémarrer un workflow dans une nouvelle exécution, appelez `continueAsNew(...)` dans sa méthode `handle()`. `continueAsNew()` est une transition d’exécution à part entière.

```php
use function Workflow\V2\activity;
use function Workflow\V2\continueAsNew;
use Workflow\V2\Workflow;

class CounterWorkflow extends Workflow
{
    public function handle(int $count = 0, int $max = 3)
    {
        $result = activity(CountActivity::class, $count);

        if ($count >= $max) {
            return [
                'count' => $result,
                'workflow_id' => $this->workflowId(),
                'run_id' => $this->runId(),
            ];
        }

        return continueAsNew($count + 1, $max);
    }
}
```

Dans cet exemple :

* Le workflow exécute une activité à chaque itération.
* Si le compteur maximal n’est pas atteint, il continue dans une nouvelle exécution avec les arguments incrémentés.
* Le résultat final n’est renvoyé qu’à la fin de la boucle.

Lorsqu’un workflow continue dans une nouvelle exécution :

- L’identifiant d’instance reste stable dans la chaîne. `WorkflowStub::runId()` avance vers la dernière exécution.
- L’exécution précédente se clôt avec `completed` / `continued` et la suivante démarre immédiatement avec un nouvel identifiant.
- Les signaux, requêtes de lecture, mises à jour et commandes opérateur visant l’instance résolvent la dernière exécution durable. Les commandes ciblant explicitement une exécution restent liées à celle-ci.

Core 2.7.0 et les Servers compatibles préservent les signaux reçus visant
l’instance dont le gestionnaire est déclaré par le contrat de commandes et que
l’ancienne exécution n’a pas appliqués. Ils sont transférés avec les mises à jour
acceptées en attente dans leur ordre de commande d’origine. Les identifiants de
signal et de commande, les octets des arguments et les heures de réception ne
changent pas. Un signal déjà appliqué n’est pas livré à nouveau au successeur.
Placez l’état métier nécessaire à la suite dans les arguments de `continueAsNew()`.
L’état local arbitraire n’est pas copié automatiquement.

Un signal ciblant une exécution n’est jamais redirigé. S’il ne peut être appliqué
avant la clôture, il reçoit le rejet explicite décrit dans
[Acceptation et clôture des signaux](./signals.md#acceptance-and-closure).
L’absence d’anciennes déclarations n’autorise pas le transfert : ces signaux
se clôturent explicitement sur le prédécesseur.

Les boucles longues peuvent réduire leur historique sans inventer un nouvel identifiant public de workflow à chaque passage à l’exécution suivante.

Depuis Workflow 2.28, les activités et minuteurs que l’exécution qui se clôt n’a jamais attendus sont annulés lorsqu’elle continue dans une nouvelle exécution ; les enfants sont en revanche transmis à l’exécution suivante. Voir [Perdants à la clôture de l’exécution](./concurrency.md#selection-losers-at-close).

## Budget d’historique {#history-budget}

Le code du workflow peut consulter la longueur courante de l’historique et un indicateur de recommandation de continuation via un contexte explicite du runtime. Les boucles longues peuvent ainsi passer le relais volontairement avant d’atteindre des limites de budget d’historique.

Dans Workflow 2.26 et les versions ultérieures, utilisez `shouldContinueAsNewAtStep()` et `historyBudgetAtStep()`. Elles ne comptent que l’historique enregistré avant l’étape courante du workflow, si bien que la même ligne renvoie la même réponse à chaque relecture. Une boucle qui vérifie le budget à chaque itération continue dans une nouvelle exécution une seule fois, à la première itération qui dépasse le seuil.

Les anciennes méthodes lisent tout l’historique courant. Dans une boucle, une itération antérieure peut voir un total ultérieur lors de la relecture et prendre une autre branche que la première fois. Elles sont inchangées, si bien que les exécutions qui ont déjà décidé avec elles continuent d’être rejouées.

```php
use function Workflow\V2\activity;
use function Workflow\V2\continueAsNew;
use Workflow\V2\Workflow;

class PollingWorkflow extends Workflow
{
    public function handle(int $iteration = 0)
    {
        $result = activity(PollActivity::class);

        if ($this->shouldContinueAsNew()) {
            return continueAsNew($iteration + 1);
        }

        return ['result' => $result, 'iteration' => $iteration];
    }
}
```

### Méthodes disponibles {#available-methods}

| Méthode | Type renvoyé | Description |
| --- | --- | --- |
| `$this->historyLength()` | `int` | Nombre d’événements d’historique de l’exécution courante |
| `$this->historySize()` | `int` | Taille totale des événements d’historique en octets |
| `$this->shouldContinueAsNew()` | `bool` | `true` lorsque l’exécution dépasse le budget configuré d’événements ou d’octets |
| `$this->historyBudgetAtStep()` | `array` | Le budget à l’étape courante : `history_event_count`, `history_size_bytes`, `history_fan_out`, `continue_as_new_recommended`, `pressure`, `pressure_dimensions` et `observation` (`step_prefix.v1`). Workflow 2.26 et versions ultérieures. |
| `$this->shouldContinueAsNewAtStep()` | `bool` | `continue_as_new_recommended` issu de `historyBudgetAtStep()`. Utilisez-la dans les boucles. Workflow 2.26 et versions ultérieures. |

### Configuration {#configuration}

Les seuils de recommandation de continuation sont configurables :

```php
// config/workflows.php
'v2' => [
    'history_budget' => [
        'continue_as_new_event_threshold' => 10000,
        'continue_as_new_size_bytes_threshold' => 5242880, // 5 MB
    ],
],
```

`shouldContinueAsNew()` et `shouldContinueAsNewAtStep()` renvoient `true` dès que l’un des seuils est dépassé. Les résumés suivent aussi `history_event_count`, `history_size_bytes` et `continue_as_new_recommended` pour que Waterline signale les exécutions longues dans les vues du parc.

## Transmission des métadonnées {#metadata-carry-forward}

Lors d’une continuation, la nouvelle exécution hérite automatiquement des métadonnées de la précédente :

| Métadonnées | Comportement de transmission |
| --- | --- |
| Attributs de recherche | Table fusionnée complète transmise, y compris les insertions ou mises à jour pendant l’exécution |
| Mémo | Table fusionnée complète transmise, y compris les insertions ou mises à jour pendant l’exécution |
| Étiquettes de visibilité | Transmises telles quelles (définies une seule fois au démarrage) |
| Clé métier | Transmise telle quelle |
| Marqueur de compatibilité | Transmis pour que la nouvelle exécution cible la même version de worker |
| Position du curseur de messages | Transmise pour connaître les messages entrants déjà consommés via les [Flux de messages](./message-streams.md) |

La nouvelle exécution démarre avec les métadonnées héritées et peut continuer à insérer ou mettre à jour les attributs de recherche et le mémo. Un workflow d’interrogation longue durée peut ainsi accumuler des métadonnées entre générations sans perdre son état lorsqu’il réduit son historique.

```php
use function Workflow\V2\{activity, continueAsNew, upsertMemo, upsertSearchAttributes};
use Workflow\V2\Workflow;

class PollingWorkflow extends Workflow
{
    public function handle(int $iteration = 0)
    {
        $result = activity(PollActivity::class);

        upsertSearchAttributes(['iteration' => (string) $iteration, 'status' => 'polling']);
        upsertMemo(['last_result' => $result, 'iteration' => $iteration]);

        if ($this->shouldContinueAsNew()) {
            // The new run inherits all search attributes and memo
            return continueAsNew($iteration + 1);
        }

        return ['result' => $result, 'iteration' => $iteration];
    }
}
```

Un parent qui continue dans une nouvelle exécution alors que des workflows enfants qu’il a démarrés sont encore ouverts les transmet à l’exécution suivante. Voir [Continuation et enfants ouverts](./child-workflows.md#continue-as-new-and-open-children).

Pour les boucles longues d’entrées humaines ou d’assistant, préférez la façade
native `$this->inbox()` / `$this->outbox()` des [Flux de messages](./message-streams.md).
Les messages de flux en attente et la position du curseur passent à la nouvelle
exécution, tandis que les messages consommés restent sur l’exécution d’origine
comme preuves historiques. Workflow 2.20.1 et les versions antérieures laissaient
les messages de flux en attente sur l’exécution fermée
([workflow#1018](https://github.com/durable-workflow/workflow/issues/1018),
corrigé dans 2.20.2) ; voir [Flux de messages](./message-streams.md#continue-as-new).
