---
sidebar_position: 19
title: Délais d’expiration
description: Configurez les délais des workflows et activités et comprenez les échéances, les nouvelles tentatives et les limites du nettoyage.
---

# Délais d’expiration {#timeouts}

Les délais au niveau du workflow limitent sa durée autorisée. Ils ont deux portées :

- **Délai d’exécution global** : limite le temps réel cumulé de tous les runs d’une instance, y compris les transitions continue-as-new. L’échéance est calculée une seule fois au démarrage et conservée sans modification.
- **Délai d’un run** : limite un seul run. L’échéance est recalculée au début de chaque nouveau run, y compris après continue-as-new.

Les deux sont facultatifs et peuvent être combinés.

## Configuration {#configuration}

Configurez les délais avec `StartOptions` au démarrage du workflow :

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class, 'order-123');

$workflow->start(
    $orderId,
    StartOptions::rejectDuplicate()
        ->withExecutionTimeout(7200)   // 2 hours across all runs
        ->withRunTimeout(3600),        // 1 hour per run
);
```

### Délai d’exécution global {#execution-timeout}

Le délai d’exécution global couvre toute l’instance du workflow. Avec continue-as-new, son échéance reste identique pour chaque run de la chaîne.

```php
StartOptions::rejectDuplicate()->withExecutionTimeout(86400); // 24 hours
```

La durée est stockée sur le modèle `WorkflowInstance` et l’échéance calculée est enregistrée sur chaque `WorkflowRun`.

### Délai d’une exécution {#run-timeout}

Le délai d’un run ne s’applique qu’à ce run. Lors d’un continue-as-new, le nouveau run reçoit une échéance calculée en ajoutant le délai configuré à l’heure actuelle.

```php
StartOptions::rejectDuplicate()->withRunTimeout(1800); // 30 minutes per run
```

### Validation {#validation}

Les délais doivent être d’au moins une seconde. Une valeur nulle ou négative déclenche une `LogicException` :

```php
// Throws LogicException: "Workflow v2 execution timeout must be at least 1 second."
StartOptions::rejectDuplicate()->withExecutionTimeout(0);
```

### Plan de contrôle {#control-plane}

Les délais peuvent aussi être définis lors d’un démarrage via le plan de contrôle :

```php
$controlPlane->start('my-app.order-workflow', 'order-123', [
    'execution_timeout_seconds' => 7200,
    'run_timeout_seconds' => 3600,
]);
```

La réponse `describe` inclut les durées et les échéances :

```php
$description = $controlPlane->describe('order-123');

$description['execution_timeout_seconds']; // 7200
$description['run']['run_timeout_seconds']; // 3600
$description['run']['execution_deadline_at']; // ISO 8601 timestamp
$description['run']['run_deadline_at'];       // ISO 8601 timestamp
```

### Waterline {#waterline}

Lorsque des délais sont configurés, la vue détaillée du run dans Waterline affiche les durées et les échéances calculées.

### Historique {#history}

Le payload de l’événement d’historique `WorkflowStarted` contient les durées et les échéances lorsqu’elles sont configurées :

```json
{
    "execution_timeout_seconds": 7200,
    "run_timeout_seconds": 3600,
    "execution_deadline_at": "2026-04-12T14:00:00+00:00",
    "run_deadline_at": "2026-04-12T13:00:00+00:00"
}
```

### Continue-as-new {#continue-as-new}

Lorsqu’un workflow utilise continue-as-new :

- L’**échéance d’exécution globale** est reprise sans modification du run précédent.
- La **durée du run** est conservée, mais son **échéance** est recalculée à partir de l’heure actuelle.

Le délai global est donc toujours mesuré depuis le démarrage d’origine, tandis que chaque nouveau run dispose de sa propre fenêtre de durée.

## Application des délais {#enforcement}

Les délais du workflow sont appliqués à deux endroits :

1. **Au démarrage d’une tâche de workflow** : chaque tâche vérifie `deadlineExpired()` avant d’exécuter le workflow. Si l’échéance est dépassée, le run est immédiatement déclaré expiré.
2. **Par le TaskWatchdog** : le watchdog recherche les runs non terminaux dont l’échéance globale ou de run est dépassée, sans tâche de workflow ouverte. Il crée et distribue une tâche signalant l’échéance dépassée. L’exécution suivante de cette tâche applique le délai.

À l’expiration d’un délai, le moteur :

- Annule toutes les tâches ouvertes, activités, timers et workflows, sauf la tâche courante
- Annule toutes les exécutions d’activité ouvertes avec des événements `ActivityCancelled`
- Annule tous les timers en attente avec des événements `TimerCancelled`
- Enregistre un `WorkflowFailure` avec `failure_category = timeout` et une `WorkflowTimeoutException`
- Enregistre un événement terminal `WorkflowTimedOut` dont `timeout_kind` vaut `execution_timeout` ou `run_timeout`
- Applique la politique de fermeture du parent aux workflows enfants ouverts
- Avertit les workflows parents si le run était un enfant

La ligne d’échec conserve `Workflow\V2\Exceptions\WorkflowTimeoutException` comme classe d’exception, avec `timeout_kind` et l’horodatage de l’échéance pour l’inspection par programme.

### État final et nettoyage après expiration {#timeout-outcome-and-cleanup}

Une échéance de workflow ferme le run avec l’état `failed` et `closed_reason = timed_out`. `WorkflowTimedOut` est l’événement terminal. Le runtime enregistre `WorkflowTimeoutException` comme donnée d’échec. Il ne lève **pas** cette exception dans le corps du workflow et ne reprend pas son code pour le nettoyage. Les blocs `catch` et `finally`, ainsi que les compensations saga enregistrées, ne sont pas exécutés quand le moteur applique cette échéance.

Annuler l’exécution durable d’une activité n’annule pas un effet externe et ne prouve pas que son callback s’est arrêté. Utilisez des opérations idempotentes et une réconciliation gérée par l’application pour les effets qui ont peut-être déjà été validés.

Si le nettoyage doit suivre une échéance applicative, utilisez un timer durable plus court ou une attente avec délai qui permet au workflow d’exécuter la [compensation avant la fermeture](./sagas.md#deadline-driven-compensation). Réservez du temps aux nouvelles tentatives d’activité, à la planification des workers et au nettoyage avant l’échéance du run ou l’échéance globale. Le délai moteur reste le dernier recours. Un worker retardé peut atteindre cette limite avant la fin de la compensation.

Les commandes immédiates `cancel()` et `terminate()` ferment aussi le run sans fenêtre de nettoyage. L’opération coopérative distincte `requestCancellation()` peut accorder un nettoyage borné à un worker compatible tant que le run est actif. Un délai de workflow n’est pas automatiquement transformé en demande d’annulation coopérative, et un bouclier d’annulation ne prolonge aucune échéance globale ou de run. Voir [Annuler et terminer](./cancel-and-terminate.md) et [Annulation coopérative](../polyglot/cancellation.md).

## Bail d’une tâche de workflow {#workflow-task-lease}

Une tâche de workflow est un tour de traitement d’un worker qui relit l’historique validé et produit des commandes durables. Ce n’est pas le workflow entier. Attendre un temporisateur durable, une activité en file d’attente ou un signal durable ne conserve pas la même tâche pendant toute l’attente. Une tâche ultérieure reprend le run.

| Déploiement | Secondes par défaut | Réglage |
| --- | --- | --- |
| Laravel intégré | `300` | `DW_V2_WORKFLOW_TASK_LEASE_SECONDS` |
| Server | `60` | `DW_WORKFLOW_TASK_TIMEOUT` |

Le réglage intégré correspond à `workflows.v2.workflow_task_lease_seconds`. Au démarrage, Server applique son propre réglage à cette clé du package. Utilisez donc le réglage Server sur Server. Il s’agit d’une configuration du runtime, pas d’une option `StartOptions` ni d’un délai d’activité propre à un démarrage. Consultez [Publication de la configuration](../configuration/publishing-config.md#workflow-task-lease-v2) et la [référence de configuration Server](../polyglot/server-config-reference.md#worker-protocol-and-query-transport).

### Heartbeats et exécution {#workflow-task-heartbeats}

Les workers en mode service utilisent les heartbeats de tâche pour renouveler la réservation d’une tâche de workflow en cours. Server vérifie la tâche, la tentative et le propriétaire du bail. Un renouvellement confirmé utilise la durée effective du bail, sous réserve des limites applicables au nettoyage d’annulation. Il ne change ni les échéances d’origine du run et de l’exécution, ni les délais d’activité. Les heartbeats d’enregistrement maintiennent l’enregistrement à jour. Un enregistrement périmé peut invalider une réservation Server avant l’expiration du bail de tâche. Ces heartbeats ne renouvellent pas ce bail. Le heartbeat d’une activité en file d’attente indique sa progression et ne remplace pas le renouvellement d’une tâche de workflow.

Le code synchrone d’un workflow intégré ne peut pas renouveler périodiquement le bail lorsqu’il est bloqué. Gardez le code déterministe et court. Placez les longues opérations d’E/S ou de calcul dans des activités. Le bail n’est pas une limite stricte de durée du processus ou du calcul.

Les activités locales intégrées conservent la tâche de workflow qui les héberge. Leur `$this->heartbeat()` peut aussi renouveler son bail tant que la tentative d’activité d’origine et la réservation de la tâche de workflow restent valides.

### Expiration du bail {#workflow-task-lease-expiry}

Une réservation expirée et inachevée devient récupérable. Matching/watchdog ou la réparation efface cette réservation puis redistribue le travail afin qu’un worker compatible relise l’historique validé. Cela nécessite des processus de récupération actifs, une base de données disponible et un worker éligible. L’expiration ne tue pas l’ancien processus et ne garantit pas une redistribution immédiate. Sur Server, une réservation expirée ou remplacée ne peut pas envoyer de nouvelles commandes. Un renouvellement refusé doit être traité comme une perte d’autorité.

La réparation ne rouvre pas un run fermé, n’accorde pas de nouvelles tentatives métier et ne réinitialise pas les échéances d’origine. À l’inverse, `startToCloseTimeout` limite une tentative d’activité selon sa politique de nouvelle tentative enregistrée. Les délais de run et d’exécution limitent la durée de vie du workflow. Renouveler ou rejouer une tâche de workflow ne les prolonge pas.

## Délais des activités {#activity-timeouts}

Les délais d’activité limitent la durée autorisée de chaque activité. Ils ont quatre portées :

- **Schedule-to-start** : limite le temps entre la planification et la première attribution à un worker. S’applique lorsque l’activité est `Pending`.
- **Start-to-close** : limite le temps entre l’attribution à un worker et la fin attendue de l’activité. Repart à zéro pour chaque tentative.
- **Schedule-to-close** : limite le temps total entre planification et fin, toutes tentatives comprises. Son expiration est toujours terminale : une nouvelle tentative ne peut pas dépasser l’échéance globale.
- **Heartbeat** : limite l’intervalle entre heartbeats. Une activité longue qui appelle `$this->heartbeat()` doit le faire dans l’intervalle configuré, sinon elle est considérée comme ne répondant plus.

Tous sont facultatifs et peuvent être combinés. Configurez-les avec `ActivityOptions` lors de l’appel de l’activité :

```php
use function Workflow\V2\activity;
use Workflow\V2\Support\ActivityOptions;

$result = activity(
    LongRunningActivity::class,
    new ActivityOptions(
        scheduleToStartTimeout: 30,     // must be claimed within 30s
        startToCloseTimeout: 300,       // each attempt has 5 minutes
        scheduleToCloseTimeout: 600,    // total 10 minutes across all retries
        heartbeatTimeout: 15,           // heartbeat well before this 15-second window expires
        maxAttempts: 3,
    ),
    $input,
);
```

En mode service, fermer une tentative d’activité n’arrête pas de force le code applicatif du SDK. Le SDK Python 2.9.0 signale le refus au prochain heartbeat ; le code sans heartbeat peut s’exécuter jusqu’à son retour et le créneau physique du thread reste occupé jusqu’à sa sortie. Consultez les [refus de heartbeat et la sortie du callback en Python](../polyglot/python.md#heartbeat-refusals-and-callback-exit).

### Délai entre planification et démarrage {#schedule-to-start-timeout}

L’échéance est calculée à la planification de l’activité. Si aucun worker ne l’a réclamée à temps, `TaskWatchdog` applique le délai. S’il reste des tentatives, une nouvelle tâche est planifiée avec le recul enregistré et l’échéance schedule-to-start est recalculée depuis la disponibilité du nouvel essai. Chaque tentative reçoit une nouvelle fenêtre. Sans `scheduleToStartTimeout` configuré, l’échéance est effacée lors du nouvel essai. Une fois toutes les tentatives épuisées, un événement terminal `ActivityTimedOut` est enregistré et le workflow est réveillé.

### Délai entre démarrage et fin {#start-to-close-timeout}

L’échéance est calculée lorsqu’un worker réclame la tâche d’activité. Chaque tentative reçoit une nouvelle échéance start-to-close. Si l’activité ne finit pas à temps, la tentative courante est fermée. S’il reste des tentatives, l’exécution revient à `Pending` avec une échéance schedule-to-start réinitialisée, si configurée, pour que la nouvelle tâche n’expire pas immédiatement. Lorsque les tentatives sont épuisées, une expiration terminale est enregistrée.

### Délai entre planification et fin {#schedule-to-close-timeout}

L’échéance est calculée une seule fois à la planification et n’est jamais réinitialisée. À son expiration, l’activité échoue définitivement, même s’il reste des tentatives, car la durée totale autorisée est dépassée. Ce délai borne le coût global d’une activité instable qui pourrait sinon réessayer indéfiniment dans ses limites par tentative.

### Délai entre heartbeats {#heartbeat-timeout}

Pour une activité mise en file d’attente, la première échéance commence lorsque le moteur la réclame, avant la livraison de la tâche et l’exécution du code applicatif. Chaque heartbeat accepté fixe l’échéance à son horodatage enregistré par le moteur, plus le délai configuré. Il n’ajoute pas de temps à l’échéance précédente et n’ouvre pas une nouvelle fenêtre lorsque l’appelant reçoit la réponse. Prévoyez une marge pour la livraison, le travail borné, les pauses d’exécution, la latence des requêtes et les nouvelles tentatives de transport. Envoyez les heartbeats bien avant l’expiration de la fenêtre. Une tentative expirée ou remplacée ne retrouve pas son autorité en envoyant un heartbeat tardif. S’il reste des tentatives, une nouvelle est planifiée avec un délai schedule-to-start réinitialisé, s’il est configuré. Sinon, une expiration terminale est enregistrée.

```php
use Workflow\V2\Activity;

class LongRunningActivity extends Activity
{
    public function handle($input)
    {
        foreach ($items as $item) {
            $this->heartbeat(['processed' => $count]);
            // ... process item ...
        }
    }
}
```

### Application des délais {#enforcement-1}

Le `TaskWatchdog` applique les délais d’activité à chaque passage de la boucle worker. Il recherche les exécutions dont les colonnes d’échéance sont dépassées et délègue à `ActivityTimeoutEnforcer`. Chaque application enregistre :

- Un événement terminal `ActivityTimedOut` dont `timeout_kind` vaut `schedule_to_start`, `start_to_close`, `schedule_to_close` ou `heartbeat`
- Une ligne `WorkflowFailure` avec `failure_category = timeout` et `propagation_kind = timeout`
- Une tâche de reprise du workflow qui réveille le parent pour qu’il puisse observer l’échec

Waterline affiche la politique de nouvelles tentatives et tous les délais configurés dans la vue détaillée de l’activité. La chronologie indique le type de délai dans le message de l’événement d’expiration.

### Fonctions non encore prises en charge {#what-is-not-yet-covered}

Les fonctions suivantes sont prévues mais non encore implémentées :

- Politiques de nouvelles tentatives au niveau du workflow

### Limites structurelles {#structural-limits}

Le moteur applique des échecs typés pour les plafonds structurels de taille de payload, de nombre d’opérations en attente et de taille des métadonnées. Voir [Limites structurelles](../constraints/structural-limits.md) pour le contrat complet, la configuration et les catégories d’échec.
