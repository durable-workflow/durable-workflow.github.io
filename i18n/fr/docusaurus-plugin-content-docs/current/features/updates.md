---
sidebar_position: 3
---

# Mises à jour {#updates}

Les mises à jour permettent de consulter l’état courant d’un workflow et de le modifier en même temps. Elles combinent ainsi une requête de lecture et un signal.

## Commandes explicites de mise à jour {#explicit-update-commands}

Chaque mise à jour acceptée :

- Est un appel requête/réponse sur un workflow en cours. `attemptUpdate*()` attend la fin du gestionnaire. `submitUpdate*()` revient dès l’acceptation durable et expose `inspectUpdate($updateId)` pour une interrogation ultérieure.
- Utilise le nom durable déclaré dans l’historique des commandes et le routage webhook. `#[UpdateMethod('mark-approved')]` conserve un nom public stable malgré les renommages de méthodes PHP.
- Est rejetée pour une exécution historique ou déjà clôturée au lieu de modifier silencieusement l’exécution courante.
- Rejette les noms de méthodes non déclarés avec `rejected_unknown_update` et les arguments non conformes au contrat avec `rejected_invalid_arguments` (et des `validation_errors` lisibles par machine) avant d’exécuter le gestionnaire.

Comme les requêtes de lecture, les mises à jour relisent d’abord l’historique validé. Elles peuvent toutefois modifier un état de workflow sûr à relire et renvoyer une valeur.

Pour définir une méthode de mise à jour, utilisez l’annotation `UpdateMethod`. Son argument chaîne facultatif permet de fixer un nom public durable qui survit aux renommages de méthodes PHP :

```php
use Workflow\UpdateMethod;
use Workflow\V2\Workflow;

final class MyWorkflow extends Workflow
{
    private bool $ready = false;

    #[UpdateMethod('mark-ready')]
    public function updateReady(bool $ready): bool
    {
        $this->ready = $ready;

        return $this->ready;
    }
}
```

Appelez directement la méthode pour obtenir la valeur brute renvoyée :

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$ready = $workflow->updateReady(true);
```

Cet appel PHP direct utilise toujours le nom de méthode. La cible durable de commande reste `mark-ready`.

Utilisez `attemptUpdate()` pour obtenir aussi le résultat durable de commande. Transmettez-y le nom durable de la mise à jour :

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$result = $workflow->attemptUpdate('mark-ready', true);

$result->accepted();        // true
$result->completed();       // true when the update body ran successfully
$result->updateStatus();    // "accepted", "completed", "failed", or "rejected"
$result->updateId();        // Durable update lifecycle id
$result->result();          // Raw update return value when completed
$result->failureMessage();  // Failure message when the update body threw
```

`attemptUpdate()` enregistre d’abord la mise à jour acceptée, puis attend que le worker l’applique et clôture son cycle de vie avant de revenir. L’attente est bornée par `workflows.v2.update_wait.completion_timeout_seconds`. Si le worker ne l’a pas clôturée à l’expiration du budget, `attemptUpdate()` renvoie le cycle accepté avec `waitTimedOut() === true` et `updateStatus() === 'accepted'`.

Utilisez `withUpdateWaitTimeout()` pour un appel nécessitant un autre budget d’attente :

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123')
    ->withUpdateWaitTimeout(5);

$result = $workflow->attemptUpdate('mark-ready', true);
```

Utilisez `attemptUpdateWithArguments()` si l’appelant dispose déjà d’une liste positionnelle ou d’une table de paramètres nommés :

```php
$result = $workflow->attemptUpdateWithArguments('mark-ready', [
    'ready' => true,
]);
```

Les tables nommées sont validées contre l’instantané durable du contrat de mise à jour et normalisées dans l’ordre de déclaration avant acceptation.

Utilisez `submitUpdate()` ou `submitUpdateWithArguments()` si l’appelant a seulement besoin de l’acceptation durable et accepte une application ultérieure par le worker :

```php
$accepted = $workflow->submitUpdate('mark-ready', true);

$accepted->accepted();     // true
$accepted->completed();    // false
$accepted->updateStatus(); // "accepted"
$accepted->result();       // null until the worker records UpdateCompleted
```

Utilisez `inspectUpdate()` si vous avez déjà un `update_id` et souhaitez lire ultérieurement le cycle stocké sans attendre à nouveau :

```php
$latest = $workflow->inspectUpdate($accepted->updateId());

$latest->updateStatus(); // "accepted"
$latest->closedAt();     // null until the lifecycle closes
```

`inspectUpdate()` n’attend pas l’exécution du workflow. Il recharge le cycle de vie durable stocké et renvoie le `UpdateResult` courant.

## Récupérer après une réponse incertaine {#recover-after-an-uncertain-response}

L’admission durable, la fin du gestionnaire et un effet métier externe sont
des faits distincts. Une expiration côté appelant peut laisser une mise à jour
acceptée encore active, et une réponse perdue peut cacher un résultat déjà
validé. Le refus ultérieur d’une nouvelle mise à jour ne résout pas le résultat initial.

Si votre application a enregistré un identifiant de mise à jour, inspectez ce
cycle conservé au lieu de soumettre une autre mise à jour. Gardez son identifiant
d’exécution initial pour qu’une continuation ne redirige pas l’enquête :

```php
use Workflow\V2\WorkflowStub;

$latest = WorkflowStub::loadRun($savedRunId, $savedNamespace)->inspectUpdate($savedUpdateId);

$latest->updateStatus();
$latest->result(); // Available when that retained update completed.
```

Les identifiants enregistrés proviennent de l’opération initiale. L’inspection
lit l’enregistrement conservé et peut fonctionner après la clôture ou le passage
à l’historique de l’exécution. Des preuves absentes ou purgées laissent le résultat
indéterminé et n’autorisent pas à répéter un effet métier. Conservez un registre
d’opérations applicatif pour le rapprochement si la réponse initiale et
l’identifiant de mise à jour généré sont perdus.

### Identifiants de requête et reçus conservés {#request-ids-and-retained-receipts}

Enregistrez l’espace de noms, l’identifiant d’instance, l’identifiant d’exécution
initial, l’identifiant de mise à jour, le nom d’opération et son intention dans
votre registre applicatif. Un reçu accepté prouve l’admission durable. Un cycle
terminé fournit le résultat enregistré du gestionnaire. Aucun ne prouve qu’un
paiement, e-mail ou écriture en base distinct a eu lieu exactement une fois.

`request_id` n’est pas un contrat portable d’identifiant de mise à jour limité
à une exécution. Les chemins PHP vérifiés peuvent renvoyer la première mise à
jour conservée si la même clé est soumise avec d’autres arguments. La recherche
intégrée couvre aussi les différents noms de mises à jour de l’instance.
Réutiliser une clé après continuation peut renvoyer le résultat d’un prédécesseur
sans admettre de mise à jour dans le successeur. Un reçu conservé associé à une
clé peut aussi être renvoyé après clôture alors qu’une nouvelle mise à jour est refusée.

Les webhooks de mise à jour Laravel intégrés lisent la clé de l’appelant dans
`X-Request-Id`. Préservez cet en-tête lors du passage par un proxy. Pour les
mises à jour HTTP du Server autonome, seule la propriété `request_id` du corps
JSON fournit la clé ; l’en-tête `X-Request-Id` sert à la corrélation. Sans clé
dans le corps, la mise à jour n’a pas de clé de déduplication, même si plusieurs
requêtes partagent cet en-tête.

Les chemins PHP qualifiés peuvent retrouver le même reçu conservé pour différents
noms de mises à jour de l’instance. Utilisez une clé par opération logique et
conservez son intention initiale. Ne changez pas les arguments, ne réutilisez pas
la clé pour un autre nom et ne supposez pas qu’elle démarre une opération dans
l’exécution suivante. La [qualification des artefacts PHP publiés](https://github.com/durable-workflow/server/issues/505#issuecomment-6287102328)
vérifie l’indépendance des clés vis-à-vis des en-têtes du proxy et les reçus conservés
après clôture. Ce comportement ne garantit pas une détection portable des conflits
entre une même clé et une intention différente. Ce contrat plus large est suivi
dans [l’issue 216](https://github.com/durable-workflow/.github/issues/216).
Server natif et les autres SDK nécessitent leur propre qualification.

La récupération des reçus dépend de la conservation des commandes, mises à jour
et historiques. Aucune durée de déduplication indépendante de l’application
n’est promise ici. Consultez la [rétention de l’historique](../configuration/pruning-workflows.md)
et gardez votre registre métier pendant la durée requise par votre application.
Des preuves manquantes laissent un résultat inconnu.

### Protéger l’effet métier {#protect-the-business-effect}

Pour une opération comme le paiement d’une facture :

1. Persistez une clé d’opération applicative, telle que `tenant-1:charge:invoice-123`,
   et son intention immuable avant d’envoyer la commande. Réutilisez cette clé
   pendant la récupération.
2. Dans l’activité appliquant l’effet, utilisez une contrainte unique en base
   sur le locataire et la clé. Vérifiez atomiquement l’intention stockée,
   appliquez l’effet local en base et stockez son résultat dans une transaction.
   Renvoyez le résultat stocké pour un doublon de même intention. Refusez une intention différente.
3. Pour un fournisseur externe, utilisez son contrat d’idempotence ou une boîte
   d’envoi avec rapprochement. Une transaction dans votre base ne rend pas
   atomique un appel distinct au fournisseur.
4. Après une réponse incertaine, rapprochez ce registre, le cycle initial de
   mise à jour et les preuves du fournisseur. Enregistrez si l’effet est en attente,
   validé, en échec ou encore inconnu avant de décider d’une autre action.

Une requête de lecture suivie d’une commande laisse une course possible.
Un signal dupliqué peut déclencher une autre activité même si l’original a été
admis. La protection applicative doit tolérer les livraisons répétées. L’exemple
qualifié exécute deux activités pour la même clé mais ne valide qu’un effet local
en base. Il ne prouve pas une exécution exactement une fois pour tout système externe.

Règles des mises à jour :

- `load($instanceId)` met à jour la dernière exécution durable de l’instance, y compris après continuation.
- Les nouvelles mises à jour via `loadRun($runId)` sont rejetées avec `rejected_not_current` dès que l’exécution devient historique. L’inspection des reçus conservés est distincte.
- Les nouvelles mises à jour sur une exécution clôturée sont rejetées avec `rejected_not_active`. La relecture d’un reçu conservé associé à une clé est distincte.
- L’échec du corps d’une mise à jour ne clôture pas le workflow. Il est enregistré comme échec propre à la mise à jour et laisse l’exécution ouverte pour la prochaine tâche de relecture.
- Les requêtes de lecture relisent les mises à jour terminées. Les mises à jour rejetées ou en échec restent uniquement des faits de commandes et d’historique non relisibles.
