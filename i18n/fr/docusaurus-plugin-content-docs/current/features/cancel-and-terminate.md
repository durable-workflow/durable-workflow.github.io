---
sidebar_position: 16
---

# Annuler et arrêter de force {#cancel-and-terminate}

Ce guide couvre l’API Laravel intégrée `Workflow\V2\WorkflowStub`. Pour les
clients et workers en mode service, consultez le
[guide du SDK PHP](https://php.durable-workflow.com/), la
[référence d’annulation Python](https://python.durable-workflow.com/reference/errors/#durable_workflow.errors.ActivityCancelled) ou
l’[API de cycle de vie Rust](https://rust.durable-workflow.com/durable_workflow/struct.Client.html#method.cancel_workflow).

L’annulation et l’arrêt forcé sont des commandes durables à part entière qui clôturent un workflow en cours. Toutes deux sont enregistrées dans l’historique des commandes, apparaissent dans les événements d’historique typés et sont exposées dans Waterline.

Dans l’API intégrée actuelle, les deux commandes clôturent immédiatement
l’exécution. **Cancel** enregistre le résultat `cancelled`. **Terminate**
enregistre `terminated`. Aucune ne programme de nettoyage dans le workflow
clôturé. Le mode Laravel intégré fournit aussi `requestCancellation()` pour
un nettoyage coopératif borné. Server et les SDK PHP, Python et Rust prennent
en charge cette demande coopérative distincte avec les workers qui l’activent
explicitement. Consultez [Annulation coopérative](/docs/polyglot/cancellation)
pour le contrat de capacité, d’échéance, de nettoyage et de récupération.

## Annuler {#cancel}

L’annulation fait passer immédiatement l’exécution à `cancelled` et enregistre un historique durable.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$result = $workflow->cancel();

$result->accepted();   // true
$result->outcome();    // "cancelled"
$result->commandId();  // Durable command id
$result->reason();     // null (no reason provided)
```

### Annuler avec une raison {#cancel-with-reason}

Vous pouvez fournir une raison structurée pour distinguer les annulations demandées par un utilisateur, une politique ou un opérateur dans les pistes d’audit, l’historique des commandes et Waterline.

```php
$result = $workflow->cancel('Customer requested cancellation');

$result->reason(); // "Customer requested cancellation"
```

La raison est persistée sur l’enregistrement durable de commande et dans les événements typés `CancelRequested` et `WorkflowCancelled`. Elle survit ainsi à la relecture, à l’export et à l’analyse hors ligne.

### Effets de l’annulation {#what-cancel-does}

Lorsqu’une annulation est acceptée, le moteur clôt les exécutions d’activité ouvertes et les temporisateurs en attente, fait passer l’exécution à `cancelled` et reprend le workflow parent attendant cet enfant pour qu’il puisse observer le résultat.

### Cas de rejet d’une annulation {#cancel-is-rejected-when}

- L’instance n’a pas encore démarré : `rejection_reason = instance_not_started`
- L’exécution courante est déjà clôturée : `rejection_reason = run_not_active`
- Une annulation ciblant une exécution vise une exécution historique, non courante : `rejection_reason = selected_run_not_current`

## Arrêter de force {#terminate}

L’arrêt forcé clôt immédiatement un workflow en cours sans programmer de code supplémentaire. Comme l’annulation, il n’offre pas de fenêtre de nettoyage. Utilisez-le lorsque le résultat distinct `terminated` convient.

```php
$result = $workflow->terminate();

$result->accepted();   // true
$result->outcome();    // "terminated"
```

### Arrêter de force avec une raison {#terminate-with-reason}

```php
$result = $workflow->terminate('Operator emergency shutdown');

$result->reason(); // "Operator emergency shutdown"
```

### Effets de l’arrêt forcé {#what-terminate-does}

L’arrêt forcé suit les mêmes étapes transactionnelles que l’annulation, avec ces différences :

- Il enregistre les événements `TerminateRequested` et `WorkflowTerminated`.
- Il crée la ligne `WorkflowFailure` avec `failure_category = terminated` et `propagation_kind = terminated`.
- Il définit `closed_reason = terminated` sur l’exécution.
- Il ne programme aucune exécution supplémentaire du code du workflow.

### Cas de rejet d’un arrêt forcé {#terminate-is-rejected-when}

Les conditions de rejet sont les mêmes que pour l’annulation.

## Commandes ciblant une exécution {#run-targeted-commands}

L’annulation et l’arrêt forcé peuvent cibler une exécution précise plutôt que l’exécution courante de l’instance.

```php
$selectedRun = WorkflowStub::loadRun($runId);
$result = $selectedRun->attemptCancel('Draining old run');

$result->targetScope(); // "run"
```

Ces commandes sont rejetées avec `selected_run_not_current` lorsque la cible n’est plus l’exécution courante de l’instance. La réponse inclut `requested_run_id` (l’exécution ciblée par l’appelant) et `resolved_run_id` (l’exécution courante à utiliser ensuite).

## API sans levée d’exception {#non-throwing-api}

Utilisez `attemptCancel()` et `attemptTerminate()` pour traiter un rejet sans exception :

```php
$result = $workflow->attemptCancel('Duplicate order');

if ($result->rejected()) {
    $result->rejectionReason(); // e.g. "run_not_active"
}
```

`cancel()` et `terminate()` lèvent `LogicException` en cas de rejet.

## Webhooks {#webhooks}

L’annulation et l’arrêt forcé sont disponibles via des routes webhook :

```text
POST /webhooks/instances/{workflowId}/cancel
POST /webhooks/instances/{workflowId}/terminate
POST /webhooks/instances/{workflowId}/runs/{runId}/cancel
POST /webhooks/instances/{workflowId}/runs/{runId}/terminate
```

Transmettez la raison dans le corps de la requête :

```json
{
  "reason": "Operator: duplicate order"
}
```

La réponse inclut le résultat de commande, l’identifiant public d’instance et la raison :

```json
{
  "outcome": "cancelled",
  "workflow_id": "order-123",
  "run_id": "01J10000000000000000000021",
  "reason": "Operator: duplicate order",
  "command_id": "01J40000000000000000000021",
  "command_status": "accepted"
}
```

## L’annulation se traite explicitement {#cancellation-is-not-an-error-you-catch-by-accident}

L’annulation est un résultat explicite du cycle de vie, pas une erreur
applicative inattendue. Dans le package intégré,
`Workflow\V2\Exceptions\WorkflowCancelledException` étend `\Error`, pas
`\Exception`. Un bloc `catch (\Exception $e)` ne l’intercepte pas, contrairement
à un bloc `catch (\Throwable $t)`.

À la lecture du résultat d’un workflow annulé, interceptez l’exception par son
nom si vous devez distinguer l’annulation des autres échecs. Intercepter une
exception côté résultat ne rouvre pas l’exécution annulée et n’y programme pas
de nettoyage.

## Waterline {#waterline}

Waterline expose l’annulation et l’arrêt forcé comme actions opérateur dans les détails de l’exécution sélectionnée. Les données incluent les indicateurs `can_cancel` et `can_terminate` issus de l’état durable.

L’historique des commandes affiche chaque annulation ou arrêt forcé avec sa raison, l’identité de l’appelant et son résultat. Le champ `commands[*].reason` contient la raison fournie par l’opérateur ou l’appelant, le cas échéant.

## Correspondance des statuts {#status-mapping}

Les exécutions `cancelled` et `terminated` appartiennent à la catégorie `failed` pour le routage des listes. Les champs bruts `status` et `closed_reason` les distinguent :

| Statut | Catégorie de statut | Raison de clôture |
| --- | --- | --- |
| `cancelled` | `failed` | `cancelled` |
| `terminated` | `failed` | `terminated` |

## Historique typé {#typed-history}

Une exécution annulée produit cette séquence d’historique :

```
StartAccepted
WorkflowStarted
... (workflow progress) ...
CancelRequested       <- reason field present when supplied
TimerCancelled        <- for each open timer
ActivityCancelled     <- for each open activity
WorkflowCancelled     <- failure_id, failure_category, reason when supplied
```

Une exécution arrêtée de force produit :

```
StartAccepted
WorkflowStarted
... (workflow progress) ...
TerminateRequested    <- reason field present when supplied
TimerCancelled        <- for each open timer
ActivityCancelled     <- for each open activity
WorkflowTerminated    <- failure_id, failure_category, reason when supplied
```

## Comparaison de l’annulation et de l’arrêt forcé {#cancel-vs-terminate}

| | Annulation | Arrêt forcé |
| --- | --- | --- |
| Du code de workflow supplémentaire est programmé | Non | Non |
| Activités ouvertes annulées | Oui | Oui |
| Temporisateurs ouverts annulés | Oui | Oui |
| Métadonnées de raison | Oui | Oui |
| Historique durable des commandes | Oui | Oui |
| Le parent reçoit le résultat de l’enfant | Oui | Oui |
| Ligne d’échec enregistrée | Oui (`cancelled`) | Oui (`terminated`) |
| Catégorie de statut | `failed` | `failed` |
| Raison de clôture | `cancelled` | `terminated` |
