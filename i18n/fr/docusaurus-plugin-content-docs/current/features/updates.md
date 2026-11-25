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
- Rejette comme `update_validator_rejected`, avant de l’accepter, une demande que votre [validateur de mise à jour](#validate-updates-before-acceptance) refuse.

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

## Valider les mises à jour avant leur acceptation {#validate-updates-before-acceptance}

Sans validateur, une mise à jour qui enfreint une règle métier est acceptée puis échoue. Elle est enregistrée comme mise à jour en échec, et l’appelant ne peut pas distinguer une demande incorrecte d’une opération qui a échoué. Déclarez un validateur pour refuser la demande avant qu’elle soit acceptée. Les validateurs nécessitent Workflow 2.42.0 ou une version ultérieure.

```php
use RuntimeException;
use Workflow\UpdateMethod;
use Workflow\UpdateValidator;
use Workflow\V2\Workflow;

final class CartWorkflow extends Workflow
{
    private array $items = [];

    #[UpdateMethod('add-item')]
    public function addItem(string $item): array
    {
        $this->items[] = $item;

        return $this->items;
    }

    #[UpdateValidator('add-item')]
    public function validateAddItem(string $item): void
    {
        if (count($this->items) >= 10) {
            throw new RuntimeException('The cart is full.');
        }
    }
}
```

`#[UpdateValidator]` désigne la mise à jour par son nom durable, ou par le nom de sa méthode lorsque la mise à jour n’a pas d’alias. Le validateur reçoit les mêmes arguments que la mise à jour. Avant que la mise à jour soit acceptée, le moteur reconstruit l’état de l’exécution à partir de son historique et n’appelle que le validateur :

- S’il retourne normalement, la mise à jour est acceptée et appliquée comme d’habitude.
- S’il lève une exception ou retourne `false`, la mise à jour est rejetée avec la raison `update_validator_rejected` et le résultat `rejected_invalid_arguments`. `rejectedByValidator()` est vrai, `rejectionMessage()` retourne le message de l’exception et `validationErrors()` retourne les erreurs d’une `ValidationException` Laravel. `update()` lève une `LogicException` qui contient les deux.
- Une mise à jour rejetée n’est jamais acceptée, son handler ne s’exécute jamais et le workflow n’est pas réveillé. Comme tout autre rejet, elle n’est enregistrée que sous la forme d’un événement d’audit `UpdateRejected`, que la relecture ignore.

Les validateurs sont en lecture seule. Ils peuvent lire l’état reconstruit du workflow, mais tout appel durable (une activité, un temporisateur, un workflow enfant, un signal, un side effect, `await`, continue-as-new ou un upsert de mémo ou d’attributs de recherche) lève `UpdateValidatorCommandException` et rejette la mise à jour. Les modifications qu’un validateur apporte à l’état reconstruit sont abandonnées. Un validateur générateur est rejeté, car son corps ne s’exécute jamais.

Les validateurs ne sont pas enregistrés dans l’historique et ne s’exécutent jamais pendant la relecture ; ils n’affectent donc pas le déterminisme. Ils voient l’état issu de l’historique validé : une mise à jour acceptée mais pas encore appliquée ne leur est pas visible. La relecture et le validateur s’exécutent pendant que l’admission de la mise à jour détient les verrous de l’exécution ; gardez donc les validateurs rapides.

Si l’état ne peut pas être reconstruit, ou si le validateur rencontre une erreur de base de données, `UpdateValidationFailedException` est levée et rien n’est enregistré. Les routes webhook de mise à jour y répondent par un `503` réessayable et `update_validation_failed`. Réessayez avec le même identifiant de requête.

Une nouvelle tentative avec clé d’une mise à jour rejetée retourne le rejet conservé sans réexécuter le validateur.

Les validateurs de mise à jour ne passent pas par les intercepteurs du worker.

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

Les webhooks de mise à jour Laravel intégrés lisent la clé de l’appelant dans
`X-Request-Id`. Préservez cet en-tête lors du passage par un proxy. Pour les
mises à jour HTTP du Server autonome, seule la propriété `request_id` du corps
JSON fournit la clé ; l’en-tête `X-Request-Id` sert à la corrélation. Sans clé
dans le corps, la mise à jour n’a pas de clé de déduplication, même si plusieurs
requêtes partagent cet en-tête.

Une clé de commande identifie une mise à jour sur une instance de workflow, pour
l’ensemble de ses exécutions. Avec Workflow 2.18.0 ou une version ultérieure,
associez-la au moyen de `withRequestId()`. Après une perte de réponse, envoyez de
nouveau la même mise à jour avec la même clé :

```php
use Workflow\V2\WorkflowStub;

$result = WorkflowStub::load('order-123')
    ->withRequestId('mark-ready-order-123')
    ->attemptUpdate('mark-ready', true);

$result->retained();          // True when this call returned an earlier admission
$result->intentVerified();    // False only for a legacy receipt
$result->requestIdConflict(); // True when the key already names a different update
$result->updateId();          // The original update on every matching retry
```

- Une nouvelle tentative avec la même clé, le même nom de mise à jour, les mêmes
  arguments typés et la même exécution cible explicite renvoie le reçu initial,
  y compris son identifiant de mise à jour, et n’enregistre rien. Après une
  clôture ou une continuation dans une nouvelle exécution, la nouvelle tentative
  renvoie toujours la mise à jour initiale. Elle n’admet pas de nouvelle mise à
  jour dans une exécution successeur.
- La même clé avec un autre nom de mise à jour, d’autres arguments ou une autre
  exécution cible est refusée avec `rejected_request_id_conflict`. `conflict()`
  indique la commande conservée et les éléments qui diffèrent. Rien n’est
  enregistré et la clé conserve son reçu initial.
- Un reçu admis avant que Workflow n’enregistre l’intention des commandes est
  relu avec `retained()` à true et `intentVerified()` à false. Il s’agit de
  l’admission initiale, et non de la preuve que les arguments de cette nouvelle
  tentative lui correspondent.
- Les clés comportent de 1 à 255 caractères Unicode et sont comparées
  exactement. Une clé invalide lève `InvalidCommandRequestIdException` avant
  l’admission.

Utilisez une clé par opération logique et ne modifiez jamais ses arguments.
Utilisez une nouvelle clé pour une nouvelle opération, y compris après avoir
confirmé qu’une mise à jour associée à une clé a été rejetée. Les versions
antérieures à Workflow 2.18.0 et à Server natif 3.9.0 ne comparent pas
l’intention : une clé réutilisée avec d’autres arguments ou un autre nom de mise
à jour y renvoie le reçu de la première mise à jour.

Les clients en mode service envoient la clé dans la propriété `request_id` du
corps. Server natif 3.9.2 et les versions ultérieures appliquent les mêmes règles
et ajoutent un refus `request_id_ambiguous` pour certaines anciennes clés.
Consultez les [clés de commande des signaux et des mises à jour](/docs/polyglot/server-api-reference#command-keys)
pour le contrat HTTP et les appels PHP, Python, Rust et CLI.

La récupération des reçus dépend de la conservation des commandes, mises à jour
et historiques. Lorsque la rétention purge les détails d’une exécution, ses clés
disparaissent avec eux, et une requête ultérieure portant cette clé est admise
comme une nouvelle commande. Aucune durée de déduplication indépendante de
l’application n’est promise ici. Consultez la [rétention de l’historique](../configuration/pruning-workflows.md)
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
- Une mise à jour acceptée pendant l’exécution de la tâche de workflow qui termine l’exécution obtient un tour de livraison avant la clôture, comme un signal. Son gestionnaire s’exécute et l’appelant reçoit son résultat. Les mises à jour encore en attente lorsqu’une exécution échoue, est annulée ou est terminée de force sont clôturées avec un échec explicite.
- L’échec du corps d’une mise à jour ne clôture pas le workflow. Il est enregistré comme échec propre à la mise à jour et laisse l’exécution ouverte pour la prochaine tâche de relecture.
- Les requêtes de lecture relisent les mises à jour terminées. Les mises à jour rejetées ou en échec restent uniquement des faits de commandes et d’historique non relisibles.
