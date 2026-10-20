---
sidebar_position: 12
---

# Événements {#events}

Les événements de cycle de vie sont émis aux étapes clés des workflows et activités pour informer votre application de la progression, de l’achèvement ou des échecs. Ce sont des événements Laravel standards. Enregistrez des écouteurs dans votre `EventServiceProvider` ou avec `Event::listen()`.

Tous les événements de cycle de vie v2 sont émis **après validation de l’état durable** en base. Les écouteurs n’observent donc que des événements fondés sur des faits validés. Si une transaction est annulée, aucun événement n’est émis.

## Identité des événements {#event-identity}

Chaque événement v2 porte des champs d’identité durable :

| Champ | Description |
|---|---|
| `instanceId` | Identifiant d’instance de workflow, stable après continuation. |
| `runId` | Identifiant de l’exécution précise. |
| `workflowType` | Clé de type durable enregistrée via `#[Type('...')]`. |
| `workflowClass` | Nom de la classe PHP du workflow. |
| `committedAt` | Horodatage ISO 8601 de validation de l’enregistrement durable, selon l’horloge réelle. |

Les événements d’activité incluent aussi :

| Champ | Description |
|---|---|
| `activityExecutionId` | Identifiant durable d’exécution d’activité. |
| `activityType` | Clé de type durable de l’activité. |
| `activityClass` | Nom de la classe PHP de l’activité. |
| `sequence` | Position de l’activité dans l’exécution du workflow. |
| `attemptNumber` | Numéro de tentative, à partir de 1. |

## Événements de workflow {#workflow-events}

### WorkflowStarted {#workflowstarted}

Émis lorsque le démarrage est durablement validé : la première exécution a été créée et l’événement d’historique `WorkflowStarted` enregistré.

```php
use Workflow\V2\Events\WorkflowStarted;

Event::listen(WorkflowStarted::class, function (WorkflowStarted $event) {
    Log::info('Workflow started', [
        'instance_id' => $event->instanceId,
        'run_id' => $event->runId,
        'type' => $event->workflowType,
    ]);
});
```

Cet événement est aussi émis au démarrage d’une nouvelle exécution par continuation.

### WorkflowCompleted {#workflowcompleted}

Émis lorsqu’une exécution de workflow se termine avec succès.

```php
use Workflow\V2\Events\WorkflowCompleted;

Event::listen(WorkflowCompleted::class, function (WorkflowCompleted $event) {
    Log::info('Workflow completed', [
        'instance_id' => $event->instanceId,
        'run_id' => $event->runId,
    ]);
});
```

### WorkflowFailed {#workflowfailed}

Émis lorsqu’une exécution de workflow échoue de façon terminale.

Champs supplémentaires :
- `exceptionClass` : nom de la classe d’exception PHP.
- `message` : message de l’exception.

```php
use Workflow\V2\Events\WorkflowFailed;

Event::listen(WorkflowFailed::class, function (WorkflowFailed $event) {
    Log::error('Workflow failed', [
        'instance_id' => $event->instanceId,
        'exception' => $event->exceptionClass,
        'message' => $event->message,
    ]);
});
```

## Événements d’activité {#activity-events}

### ActivityStarted {#activitystarted}

Émis lorsqu’une tâche d’activité est prise en charge et que son exécution commence.

```php
use Workflow\V2\Events\ActivityStarted;

Event::listen(ActivityStarted::class, function (ActivityStarted $event) {
    Log::info('Activity started', [
        'activity' => $event->activityType,
        'sequence' => $event->sequence,
        'attempt' => $event->attemptNumber,
    ]);
});
```

### ActivityCompleted {#activitycompleted}

Émis lorsqu’une activité se termine avec succès.

```php
use Workflow\V2\Events\ActivityCompleted;

Event::listen(ActivityCompleted::class, function (ActivityCompleted $event) {
    Log::info('Activity completed', [
        'activity' => $event->activityType,
        'execution_id' => $event->activityExecutionId,
    ]);
});
```

### ActivityFailed {#activityfailed}

Émis lorsqu’une activité échoue de façon terminale, après épuisement des tentatives ou exception non réessayable. Les échecs réessayables qui feront l’objet d’une nouvelle tentative ne déclenchent **pas** cet événement.

Champs supplémentaires :
- `exceptionClass` : nom de la classe d’exception PHP.
- `message` : message de l’exception.

```php
use Workflow\V2\Events\ActivityFailed;

Event::listen(ActivityFailed::class, function (ActivityFailed $event) {
    Log::error('Activity failed', [
        'activity' => $event->activityType,
        'exception' => $event->exceptionClass,
        'message' => $event->message,
    ]);
});
```

## Événements d’échec {#failure-events}

### FailureRecorded {#failurerecorded}

Émis à chaque validation d’un enregistrement durable d’échec, pour les échecs terminaux de workflows comme d’activités. C’est le point d’intégration unique pour des outils de remontée d’erreurs comme Sentry ou Bugsnag.

| Champ | Description |
|---|---|
| `failureId` | Identifiant de l’enregistrement durable d’échec. |
| `sourceKind` | `"workflow_run"` ou `"activity_execution"`. |
| `sourceId` | Identifiant de la source, exécution de workflow ou d’activité. |
| `exceptionClass` | Nom de la classe d’exception PHP. |
| `message` | Message de l’exception. |

```php
use Workflow\V2\Events\FailureRecorded;

Event::listen(FailureRecorded::class, function (FailureRecorded $event) {
    // Report to Sentry, Bugsnag, etc.
    report(new \RuntimeException(
        "[{$event->sourceKind}] {$event->exceptionClass}: {$event->message}"
    ));
});
```

## Sémantique des horodatages {#timestamp-semantics}

Le champ `committedAt` de chaque événement représente **l’heure de validation**, soit l’heure réelle à laquelle l’enregistrement durable (événement d’historique ou échec) a été écrit en base. Elle est distincte de :

- **L’heure virtuelle du workflow** : temps logique de son exécution, utilisé par les temporisateurs.
- **L’heure de tentative** : début ou fin d’une tentative d’activité précise.
- **La latence de reprise** : délai entre l’échéance d’un temporisateur et la reprise réelle du workflow.

L’heure de validation est la plus utile aux intégrations externes, car elle indique quand l’état est devenu durable et observable.

## Cycle de vie {#lifecycle}

Cycle de vie typique d’un workflow réussi :

```
Workflow\V2\Events\WorkflowStarted
Workflow\V2\Events\ActivityStarted
Workflow\V2\Events\ActivityCompleted
Workflow\V2\Events\WorkflowCompleted
```

Cycle de vie avec un échec terminal d’activité :

```
Workflow\V2\Events\WorkflowStarted
Workflow\V2\Events\ActivityStarted
Workflow\V2\Events\ActivityFailed
Workflow\V2\Events\FailureRecorded    (source: activity_execution)
Workflow\V2\Events\WorkflowFailed
Workflow\V2\Events\FailureRecorded    (source: workflow_run)
```

## Espace de noms des événements {#event-namespace}

Les événements v2 résident dans l’espace de noms `Workflow\V2\Events`. Pour mettre à niveau une application existante, consultez [Migration](../migration.md) pour la correspondance des événements de compatibilité v1.
