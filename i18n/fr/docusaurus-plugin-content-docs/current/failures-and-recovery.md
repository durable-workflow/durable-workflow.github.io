---
sidebar_position: 11
title: Échecs et reprise
description: Diagnostiquer les échecs d’activité, les exceptions non réessayables, les délais d’exécution, le nettoyage d’annulation et les actions de reprise.
tags:
  - failures
  - recovery
  - operations
keywords:
  - échecs de workflow
  - exception non réessayable
  - reprise de workflow
---

# Échecs et reprise {#failures-and-recovery}

Avant d’analyser un échec, gardez à l’esprit le contrat d’exécution :

- les tâches de workflow reprennent en relisant l’historique validé
- les activités s’exécutent au moins une fois et peuvent être observées
  plusieurs fois
- l’expiration d’un bail et la redistribution sont des mécanismes normaux de
  reprise. Elles ne prouvent pas que le worker précédent n’a jamais produit
  l’effet externe

Consultez les
[garanties d’exécution et l’idempotence](./constraints/execution-guarantees.md)
pour connaître les règles précises des nouvelles tentatives, de la
redistribution et des résultats durables.

## Gérer les exceptions {#handling-exceptions}

Lorsqu’une activité lève une exception, le workflow n’en est pas immédiatement
informé. Il attend que le nombre de tentatives `$tries` soit épuisé.
Le système réessaie l’activité selon sa politique. Pour transmettre
l’exception au workflow dès le premier échec, définissez `$tries` à 1.

```php
use Exception;
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public int $tries = 1;

    public function handle(): void
    {
        throw new Exception();
    }
}
```

```php
use Exception;
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(): void
    {
        try {
            $result = activity(MyActivity::class);
        } catch (Exception) {
            // handle the exception here
        }
    }
}
```

## Exceptions non réessayables {#non-retryable-exceptions}

Certaines exceptions ne doivent pas déclencher de nouvelle tentative.
Lorsqu’une activité lève une exception non réessayable, le workflow marque
immédiatement l’activité comme ayant échoué et cesse de la réessayer.

```php
use Workflow\V2\Activity;
use Workflow\Exceptions\NonRetryableException;

class MyNonRetryableActivity extends Activity
{
    public function handle(): void
    {
        throw new NonRetryableException('This is a non-retryable error');
    }
}
```

## Procédure de reprise {#recovery-process}

Pour corriger une activité qui échoue :

1. Consultez ses logs et recherchez les erreurs ou exceptions.
2. Identifiez la cause et corrigez le code.
3. Déployez la correction sur le serveur qui exécute la file.
4. Redémarrez ou remplacez progressivement les workers concernés afin qu’ils
   chargent le nouveau code et puissent reprendre les tâches en sécurité.
5. Attendez une nouvelle tentative de l’activité ou la réparation et la
   redistribution de la tâche durable à un worker sain.
6. Vérifiez le résultat durable dans Waterline, l’export d’historique ou
   l’API Server. Une ligne de log d’un worker ne fait pas autorité.
7. Si l’activité échoue encore, répétez la procédure jusqu’à résolution.

Le workflow peut rester en cours pendant que l’activité échoue et réessaie.
Une fois l’activité corrigée, il peut se terminer avec l’état `completed`.
Un workflow dans l’état `failed` a épuisé les `$tries` de l’activité sans
que son exception ait été gérée.

## Application des délais des workflows {#workflow-timeout-enforcement}

Avec `StartOptions::withExecutionTimeout()` ou
`StartOptions::withRunTimeout()`, le moteur enregistre une échéance sur
l’exécution. Le délai d’exécution logique couvre tout le workflow, y compris
les exécutions créées par continue-as-new. Le délai d’une exécution se
réinitialise à chaque nouvelle exécution.

Si l’échéance est dépassée au démarrage d’une tâche de workflow, l’exécution
est immédiatement fermée :

- Toutes les exécutions d’activité ouvertes, les temporisateurs et les tâches
  en attente sont annulés avec des événements d’historique typés
  (`ActivityCancelled`, `TimerCancelled`).
- Une ligne `WorkflowFailure` est enregistrée avec
  `failure_category = timeout` et `propagation_kind = timeout`.
- Un événement `WorkflowTimedOut` est enregistré avec `timeout_kind`
  égal à `execution_timeout` ou `run_timeout`.
- L’état devient `failed` avec `closed_reason = timed_out`.
- Les workflows parents qui attendent cet enfant sont informés.

Le watchdog des tâches recherche aussi les exécutions non terminales dont
l’échéance est dépassée et qui n’ont aucune tâche de workflow ouverte.
C’est notamment le cas d’une exécution qui attend une activité ou un
temporisateur. Il crée alors une tâche de workflow pour que l’exécuteur
détecte et applique le délai au passage suivant.

Waterline affiche `failure_category` dans une colonne **Catégorie** du
tableau des exceptions et dans les détails des échecs de la chronologie.
L’export d’historique inclut ce champ dans `failures[*]`.
La version v2 finale écrit cette classification au moment de l’échec.
Les lignes v1 importées qui ne peuvent pas être classées restent visibles
comme diagnostics non classés.

## Nouvelles tentatives d’activité {#activity-retries}

`Workflow\V2\Activity` utilise `$tries = 1` par défaut.
Un échec est donc transmis immédiatement au workflow, sauf si l’activité
autorise davantage de tentatives.

```php
use RuntimeException;
use Workflow\V2\Activity;

class ChargeCard extends Activity
{
    public int $tries = 3;

    public function backoff(): array
    {
        return [5, 30];
    }

    public function handle(): string
    {
        throw new RuntimeException('temporary gateway failure');
    }
}
```

Lorsqu’une activité réessayable lève une exception avant d’avoir épuisé
`$tries`, le moteur ferme la ligne `activity_attempts` courante dans
l’état du runtime, remet la ligne `activity_executions` à `pending`,
enregistre un événement typé `ActivityRetryScheduled` pour la tentative
échouée et crée une nouvelle tâche durable. Son `available_at` est défini
par la politique `backoff()`. Le workflow continue d’attendre la même
exécution d’activité. Il ne reçoit l’exception qu’après l’échec de la
dernière tentative réessayable.

La tâche de nouvelle tentative contient `retry_of_task_id`,
`retry_after_attempt_id`, `retry_after_attempt` et
`retry_backoff_seconds` pour que Waterline explique sa planification.
Les détails de l’exécution sélectionnée reconstruisent d’abord les tentatives
échouées dans `activities[*].attempts` depuis l’historique typé des
activités. Ils affichent `ActivityRetryScheduled` dans la chronologie.
Les métriques exposent les activités en cours de nouvelle tentative via
`operator_metrics.activities.retrying`,
`operator_metrics.activities.failed_attempts` et
`operator_metrics.backlog.retrying_activities`.

`Workflow\Exceptions\NonRetryableExceptionContract` court-circuite
toujours cette politique : une exception non réessayable fait immédiatement
échouer l’exécution d’activité et reprend le workflow avec l’exception.

### Identité de l’exécution d’activité et idempotence {#activity-execution-identity-and-idempotency}

Les nouvelles tentatives ne sont pas la seule raison d’observer plusieurs
fois la même activité logique. L’expiration du bail, la perte d’un worker,
un compte rendu tardif et la redistribution peuvent produire une autre
tentative ou un compte rendu périmé pour la même exécution durable.

- `activity_execution_id` identifie l’activité logique à travers les
  nouvelles tentatives et les redistributions. Utilisez-le comme clé
  d’idempotence par défaut pour les effets externes distants.
- `activity_attempt_id` identifie une tentative précise. Utilisez-le
  uniquement si un système externe doit distinguer les tentatives.
- Un compte rendu tardif de réussite ou d’échec provenant d’une tentative
  remplacée est un comportement normal de tentative périmée. Il ne prouve
  pas que le moteur a validé deux fois cette tentative.

Lors de l’analyse d’une terminaison tardive après expiration du bail :

- consultez Waterline, l’export d’historique ou l’API Server pour savoir quelle
  tentative a remporté la validation durable
- ne supposez pas qu’un compte rendu tardif rejeté signifie que l’effet
  externe n’a pas eu lieu
- vérifiez le système externe par sa clé d’idempotence avant de forcer une
  nouvelle tentative ou une réparation manuelle

Le choix le plus sûr consiste à rendre l’effet externe idempotent avec
`activity_execution_id`, puis à consulter le résultat durable pour savoir
si le moteur a accepté le compte rendu de cette tentative précise.

### Marqueurs d’échec non réessayable {#non-retryable-failure-markers}

Lorsqu’une activité ou un workflow lève une exception qui implémente
`Workflow\Exceptions\NonRetryableExceptionContract`, le moteur écrit
`non_retryable = true` dans la ligne `WorkflowFailure` et dans les
données de l’événement typé
(`ActivityFailed`, `WorkflowFailed`, `UpdateCompleted`).
Ce marqueur durable indique aux opérateurs, workers externes et outils que
l’échec est permanent. Réessayer la même opération ne permettra pas de réussir.

Le marqueur est présent dans toutes les interfaces de visibilité :

- **Lignes d’échec :** colonne booléenne
  `workflow_failures.non_retryable`.
- **Événements d’historique :** champ `non_retryable` dans les données
  de l’événement typé.
- **Instantanés des échecs :** `non_retryable` dans
  `FailureSnapshots::forRun()`.
- **Détails d’exécution :** `non_retryable` dans le tableau des exceptions.
- **Chronologie :** `non_retryable` dans les métadonnées des échecs.
- **Exports d’historique :** `non_retryable` dans `failures[*]`.
- **Waterline :** badge « non réessayable » à côté de la catégorie dans le
  tableau des exceptions et la chronologie.
- **Pont des workers externes :** les données de la commande `complete()`
  acceptent `non_retryable`. Les workers de workflow externes peuvent
  signaler ces échecs sans que le processus hôte ait à résoudre la classe
  de l’exception.

Pour les exceptions qui n’implémentent pas ce contrat, `non_retryable`
vaut `false` par défaut. La version v2 finale écrit le marqueur au moment
de l’échec. Déclarez donc le contrat avant l’écriture de l’échec lorsque les
opérateurs ou les SDK doivent distinguer les échecs permanents de ceux qui
peuvent être réessayés.

```php
use Workflow\Exceptions\NonRetryableExceptionContract;

class PaymentDeclinedException extends \RuntimeException implements NonRetryableExceptionContract
{
    // This failure will be marked as non-retryable in the durable record.
}
```

## Nouvelles tentatives au niveau du workflow {#workflow-level-retry}

Durable Workflow v2 ne prend **pas** en charge les nouvelles tentatives
automatiques au niveau du workflow. Lorsqu’une exécution échoue à cause d’une
exception non gérée, d’une limite structurelle ou d’un délai dépassé, elle est
terminale. Le moteur ne démarre pas automatiquement une nouvelle exécution
de la même instance de workflow.

Ce choix est délibéré :

- **Les activités ont déjà leurs politiques de nouvelles tentatives.**
  `$tries`, `backoff()` et les exceptions non réessayables traitent les
  échecs transitoires à la bonne granularité.
- **La relecture est le mécanisme de reprise du workflow.** Une erreur
  d’infrastructure transitoire, comme une erreur de base de données ou un
  crash de worker, entraîne la redistribution de la tâche durable.
  La relecture reprend depuis l’historique validé sans nouvelle exécution.
- **Continue-as-new convient aux workflows de longue durée.** Ceux qui ont
  besoin d’un état neuf ou d’une réduction de l’historique utilisent
  explicitement `continueAsNew()`.
- **La réparation reprend les exécutions bloquées.** La commande `repair()`
  et la réparation automatique dans la boucle des workers reprennent les
  exécutions dont le transport des tâches durables a été perdu.

Si votre application a besoin de nouvelles tentatives au niveau du workflow,
modélisez-les explicitement :

```php
use function Workflow\V2\activity;
use Throwable;
use Workflow\V2\Workflow;

class RetryableWorkflow extends Workflow
{
    public function handle(string $orderId): void
    {
        try {
            activity(ProcessOrderActivity::class, $orderId);
        } catch (Throwable $e) {
            // Record the failure, then start a new workflow
            // for retry-at-workflow-level scenarios.
            activity(NotifyFailureActivity::class, $orderId, $e->getMessage());
        }
    }
}
```

## Guides associés {#related-guides}

- Les [garanties d’exécution et l’idempotence](./constraints/execution-guarantees.md)
  décrivent le contrat de relecture, de nouvelles tentatives, d’expiration
  des baux et de redistribution qui régit chaque procédure de reprise.
- La [supervision](./monitoring.md) explique où Waterline, l’export d’historique,
  les logs des workers et la télémétrie du runtime exposent les faits
  nécessaires au diagnostic.
