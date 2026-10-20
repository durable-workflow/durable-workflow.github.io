---
sidebar_position: 23
title: Activités locales
description: Exécuter des activités courtes dans le processus du worker de workflow courant avec historique durable, nouvelles tentatives, délais d’expiration et visibilité.
tags:
  - activities
  - workers
  - execution
keywords:
  - activités locales
  - localActivity
  - executeLocalActivity
  - activité dans le même processus
  - battement de tâche de workflow
---

# Activités locales {#local-activities}

Les activités locales sont la primitive v2 pour les activités courtes devant
s’exécuter dans le processus du worker qui exécute actuellement la tâche de workflow.
Elles préservent les nouvelles tentatives, délais d’expiration, battements,
annulations, historique et visibilité opérateur des activités, mais évitent la
mise en file ordinaire des tâches d’activité.

Utilisez les activités locales pour un travail à faible latence, idempotent et
adapté au worker de workflow lui-même. Utilisez les activités ordinaires en file
lorsqu’il faut dimensionner les workers indépendamment, router par file, exécuter
longuement ou disposer d’un bail de tâche d’activité distinct.

## Résumé du contrat {#contract-summary}

- `localActivity(...)` et `Workflow::localActivity(...)` exécutent la classe
  d’activité dans le même processus que la tâche de workflow courante.
- Le runtime crée une ligne `activity_executions` et des événements d’historique
  normaux marqués `execution_mode=local` et `local_activity=true`.
- Aucune tâche ordinaire `TaskType::Activity` n’est créée. Les options de routage
  `connection`, `queue`, de session de worker et de délai programmation-démarrage sont donc rejetées.
- La tentative locale détient le bail de tâche de workflow. `heartbeat()` sur
  l’activité renouvelle ce bail et enregistre `ActivityHeartbeatRecorded`.
- Les nouvelles tentatives sont des tâches durables de workflow avec espacement,
  pas des répétitions cachées dans une boucle.
- La relecture à froid lit l’historique d’activité validé. Si une tentative locale
  démarrée n’a pas d’événement terminal après la perte d’un worker, la tentative
  suivante enregistre `retry_reason=cold_replay`.
- Les détails, exports d’historique, chronologies et métriques opérateur distinguent
  les tentatives locales des tentatives ordinaires en file.

## API de définition {#authoring-api}

Utilisez la fonction auxiliaire de l’espace de noms :

```php
use Workflow\V2\Support\LocalActivityOptions;
use function Workflow\V2\localActivity;

$receipt = localActivity(
    SendReceiptActivity::class,
    new LocalActivityOptions(
        maxAttempts: 3,
        startToCloseTimeout: 10,
        scheduleToCloseTimeout: 30,
        heartbeatTimeout: 5,
    ),
    $orderId,
);
```

Ou utilisez la façade statique de workflow :

```php
use Workflow\V2\Workflow;

$receipt = Workflow::localActivity(SendReceiptActivity::class, $orderId);
$receipt = Workflow::executeLocalActivity(SendReceiptActivity::class, $orderId);
```

`LocalActivityOptions` accepte les champs de nouvelle tentative et d’expiration :

- `maxAttempts`
- `backoff`
- `startToCloseTimeout`
- `scheduleToCloseTimeout`
- `heartbeatTimeout`
- `nonRetryableErrorTypes`

Elle rejette `connection`, `queue`, le routage de session de worker et
`scheduleToStartTimeout`, car une activité locale ne passe pas par l’appariement
normal des tâches.

## Exécution et historique {#execution-and-history}

Lorsque la relecture atteint une activité locale, la tâche de workflow courante :

1. crée l’exécution d’activité avec `activity_options.execution_mode=local` ;
2. enregistre `ActivityScheduled` et `ActivityStarted` avec le marqueur local ;
3. instancie et exécute la classe d’activité dans le processus du worker de workflow ;
4. enregistre `ActivityCompleted`, `ActivityFailed`, `ActivityTimedOut` ou
   `ActivityCancelled` ;
5. reprend le code du workflow depuis l’événement d’activité enregistré.

La relecture ne réexécute pas une activité locale terminée. La relecture des
requêtes de lecture et la relecture à froid lisent les mêmes événements
d’historique que les activités ordinaires.

## Battements d’activité {#heartbeats}

Une activité locale ne détient pas de bail de tâche d’activité. Elle détient le
bail de la tâche qui exécute actuellement le workflow. Au début de la tentative,
le runtime renouvelle ce bail. Lorsque le code d’activité appelle `$this->heartbeat()`,
le runtime enregistre la progression, met à jour la tentative d’activité et
renouvelle le bail de tâche de workflow.

Les activités locales longues doivent émettre des battements assez souvent
pour respecter à la fois leur délai de battement et le bail de la tâche de workflow :

```php
use Workflow\V2\Activity;

final class PollShortJobActivity extends Activity
{
    public function handle(string $jobId): array
    {
        $state = $this->fetch($jobId);

        $this->heartbeat([
            'message' => 'Polling remote job',
            'job_id' => $jobId,
            'state' => $state['status'],
        ]);

        return $state;
    }
}
```

## Délais d’expiration et nouvelles tentatives {#timeouts-and-retries}

`startToCloseTimeout` limite une tentative. `scheduleToCloseTimeout` limite
l’exécution locale entière, nouvelles tentatives incluses. `heartbeatTimeout`
limite l’intervalle entre les battements locaux enregistrés.

Lorsqu’un échec réessayable ou une expiration survient, le runtime enregistre
`ActivityRetryScheduled` et crée une tâche de workflow disponible après le délai
d’espacement. Cette tâche relit l’historique du workflow, atteint la même séquence
d’activité locale et démarre la tentative locale suivante.

Chaque tentative locale crée une ligne `activity_attempts`. Une nouvelle tentative
enregistre `retry_reason` avec la valeur `failure`, `timeout` ou `cold_replay`.

## Annulation et perte de worker {#cancellation-and-worker-loss}

L’annulation est coopérative. Une activité locale la constate lors d’un battement,
de l’application d’un délai d’expiration ou de la fin d’une tentative. Une
tentative locale annulée enregistre `ActivityCancelled` avec le marqueur local.

Si un worker quitte avant de valider un événement terminal d’activité locale,
le bail de tâche de workflow expire et la réparation normale récupère la tâche.
La relecture à froid lit alors l’historique validé. S’il contient une tentative
locale démarrée sans événement terminal, le runtime programme une nouvelle
tentative avec `retry_reason=cold_replay`.

## Visibilité {#visibility}

Les opérateurs peuvent distinguer les activités locales partout où leur état
est exposé :

- les données d’historique incluent `execution_mode=local` et `local_activity=true` ;
- `activity_executions.activity_options.execution_mode` vaut `local` ;
- les détails d’exécution et exports d’historique incluent `execution_mode` et `local_activity` ;
- les métriques opérateur exposent `activities.local`, `activities.local_open`,
  `activities.local_attempts` et les compteurs d’activités en file et locales.

Le manifeste du runtime est publié sous
`worker_protocol.server_capabilities.local_activities` dans
`GET /api/cluster/info`. Le contrat lisible par machine est
[`local-activity-runtime.schema.json`](/platform-protocol-specs/local-activity-runtime.schema.json)
et figure dans le catalogue des
[Spécifications du protocole de plateforme](/docs/platform-protocol-specs#local-activity-runtime-notes).

Les noms restent ceux des événements d’activité normaux pour préserver l’ordre
dans les chronologies et outils de relecture sans famille d’événements parallèle.

## Choisir la bonne primitive {#choosing-the-right-primitive}

Utilisez une activité locale pour des effets de bord courts, réessayables et
idempotents, mieux exécutés par le worker de workflow et sans besoin de routage par file.

Utilisez une [activité](/docs/defining-workflows/activities) ordinaire pour les
appels distants, E/S lentes, calculs intensifs, parcs de workers dédiés, régulation
de charge ou travaux devant continuer via une tâche d’activité sous bail distinct
après la perte du worker de workflow.

Utilisez les [sessions de worker](/docs/features/worker-sessions) si plusieurs
étapes d’activité ordinaires doivent réutiliser des ressources locales au worker,
comme la mémoire GPU ou un système de fichiers monté.

Utilisez [`sideEffect(...)`](/docs/features/side-effects) uniquement pour des
instantanés sûrs à relire qui n’ont pas besoin des nouvelles tentatives, délais,
battements ou annulations des activités.
