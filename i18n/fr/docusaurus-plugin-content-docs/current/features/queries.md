---
sidebar_position: 2
---

import QuerySimulator from '@site/src/components/QuerySimulator';

# Requêtes de lecture {#queries}

Les requêtes de lecture permettent d’obtenir des informations sur l’état courant d’un workflow sans affecter son exécution. Elles servent à la supervision et au débogage.

## Méthodes de requête de lecture sûres à relire {#replay-safe-query-methods}

Les requêtes de lecture relisent l’historique validé de l’exécution sélectionnée, puis invoquent la méthode annotée sur l’objet workflow réhydraté. Elles n’appliquent pas implicitement les commandes de signal ou de mise à jour acceptées mais pas encore appliquées.

```php
use Workflow\QueryMethod;
use Workflow\V2\Workflow;
use function Workflow\V2\await;

final class ApprovalWorkflow extends Workflow
{
    private string $stage = 'booting';

    public function handle(): void
    {
        $this->stage = 'waiting-for-approval';

        await('approved-by');

        $this->stage = 'approved';
    }

    #[QueryMethod('current-stage')]
    public function currentStage(): string
    {
        return $this->stage;
    }

    #[QueryMethod('starts-with')]
    public function startsWith(string $prefix): bool
    {
        return str_starts_with($this->stage, $prefix);
    }
}
```

Ciblez l’exécution courante via l’identifiant public d’instance :

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$workflow->currentStage(); // "waiting-for-approval"
$workflow->query('starts-with', 'waiting'); // true
$workflow->queryWithArguments('starts-with', ['prefix' => 'waiting']); // true
```

Pour cibler explicitement une exécution historique ou sélectionnée, interrogez-la plutôt via `loadRun($runId)` :

```php
$selectedRun = WorkflowStub::loadRun($runId);

$selectedRun->currentStage();
```

Comportement des requêtes de lecture :

- Elles sont sûres à relire : elles observent uniquement l’historique validé et ne modifient pas l’état du workflow.
- Les arguments sont transmis à la méthode annotée. Déclarez un nom public stable avec `#[QueryMethod('public-name')]` pour que l’appel reste valide après un renommage de méthode PHP.
- `load($instanceId)` interroge la dernière exécution durable de l’instance. `loadRun($runId)` cible une exécution précise, utile avant une continuation dans une nouvelle exécution.
- Les signaux et mises à jour acceptés mais non encore appliqués sont visibles dans l’historique des commandes. Ils ne font partie de l’état appliqué qu’après l’enregistrement de `SignalApplied` / `UpdateApplied` par le worker.

Pour définir une méthode de requête de lecture sur un workflow, utilisez l’annotation `QueryMethod`. L’argument chaîne facultatif permet de fixer un nom public durable qui survit aux renommages de méthodes PHP :

```php
use Workflow\QueryMethod;
use Workflow\V2\Workflow;

final class MyWorkflow extends Workflow
{
    private bool $ready = false;

    #[QueryMethod('is-ready')]
    public function getReady(): bool
    {
        return $this->ready;
    }
}
```

Pour interroger un workflow, appelez la méthode sur son instance. La méthode de requête de lecture renvoie les données du workflow.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$ready = $workflow->getReady();
$sameReady = $workflow->query('is-ready');
```

Utilisez `queryWithArguments()` si l’appelant dispose déjà d’une liste positionnelle ou d’une table de paramètres nommés :

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$workflow->queryWithArguments('starts-with', [
    'prefix' => 'wait',
]);
```

Waterline utilise le contrat des requêtes de lecture de l’exécution sélectionnée. Le tableau de bord expose `declared_query_targets[*]` à côté des signaux et mises à jour, mais n’affiche l’exécution des requêtes que si `can_query = true`. La commande de requête sur l’exécution sélectionnée ou courante envoie les `arguments` JSON à `/waterline/api/instances/{instanceId}/queries/{query}` ou `/waterline/api/instances/{instanceId}/runs/{runId}/queries/{query}`. La définition du workflow doit toujours être chargeable, car l’exécution sélectionnée doit être relue avant l’appel de la méthode. Si des cibles durables existent mais que la définition est indisponible, les détails indiquent `can_query = false` avec `query_blocked_reason = workflow_definition_unavailable`, et les POST de requête renvoient HTTP `409 Conflict` avec `blocked_reason = workflow_definition_unavailable`. Si l’exécution ne dispose que d’un instantané incomplet que la version courante ne peut plus compléter, les détails indiquent `declared_contract_source = unavailable`. Les cibles restantes restent visibles comme métadonnées de diagnostic, mais les arguments nommés sont rejetés avec `422` jusqu’à ce qu’une version compatible persiste le contrat manquant.

La passerelle webhook publique expose ces mêmes requêtes de lecture sûres à relire hors de Waterline :

```text
POST /webhooks/instances/{instanceId}/queries/{query}
POST /webhooks/instances/{instanceId}/runs/{runId}/queries/{query}
```

Ces routes acceptent le même champ JSON `arguments` que Waterline, renvoient un `result` JSON typé en cas de succès et utilisent le même format d’erreur pour les arguments invalides (`422` avec `validation_errors`) et les blocages de relecture (`409` avec `blocked_reason`). Lorsque la définition courante du workflow reste chargeable, les appelants peuvent cibler la requête par sa cible durable `#[QueryMethod('public-name')]` ou par le nom de méthode PHP sous-jacent. Les réponses HTTP réussies normalisent `query_name` vers la cible publique durable pour éviter que les appelants externes dépendent des détails de renommage des méthodes.

<QuerySimulator />

**Important :** Une requête de lecture ne fait pas avancer l’exécution du workflow, contrairement aux signaux.
