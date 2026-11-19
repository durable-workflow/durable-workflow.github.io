---
sidebar_position: 12
title: Portées de compensation
description: Conservez les obligations de compensation au-delà de l’exécution de workflow qui les a créées, et récupérez-les après la clôture de l’exécution, dans les workflows Laravel intégrés.
---

# Portées de compensation {#compensation-scopes}

Ce guide décrit la compensation conservée dans les workflows Laravel intégrés qui utilisent `Workflow\V2\Workflow`. Une [saga](sagas.md) compense à l’intérieur de l’exécution qui l’a enregistrée. Une portée de compensation consigne chaque obligation dans un registre durable, de sorte que l’obligation peut encore être compensée après que cette exécution s’est terminée, a échoué ou a été annulée.

Utilisez une portée lorsque l’annulation peut arriver tardivement, par exemple lorsqu’un workflow d’expédition s’est terminé et que sa commande est annulée plusieurs jours plus tard, ou lorsqu’une opération directe peut prendre effet sans renvoyer de résultat enregistré.

## Disponibilité et stabilité {#availability-and-stability}

| Élément | Statut |
| --- | --- |
| `DurableScope`, `RegisteredObligation`, `Obligation`, `ScopeIdentity` | Stable depuis 2.33.0 |
| `ScopedOperation`, `OperationContext`, `ForwardResult`, `Resolution`, `HandlerRegistry`, `HandlerContractViolation` | Stable depuis 2.33.0 |
| `ScopeAuthorization`, `ScopeAuthorizationRefused`, `ScopeRecovery::request()`, `ScopeRecovery::describe()`, `ScopeRetention::release()` | Stable depuis 2.33.0 |
| `DurableScope::reserveChild()` et admission racine (`RootReservationStore`) | Expérimental |
| Classes marquées `@internal` (activités, persistance, moteur de récupération) | Pas une API publique |

Les API de portée ont d’abord été livrées à titre expérimental dans 2.29.0. La récupération automatique après la clôture de l’exécution d’origine, le calendrier de nouvelles tentatives de récupération et `describe()` sont arrivés dans 2.31.0. Les résultats de gestionnaire revus (`failed()`, `rejected()` et `HandlerContractViolation`) sont arrivés dans 2.32.0. Depuis 2.33.0, les parties marquées comme stables suivent la [politique de compatibilité 2.x](../compatibility.md). Les parties expérimentales peuvent encore changer dans une version mineure. La prise en charge initiale se limite à Laravel intégré et à la compensation séquentielle.

## Fonctionnement {#how-it-works}

Une portée est identifiée par `(application, namespace, key, generation)`. Son travail direct appartient à une seule exécution d’origine ; choisissez donc une génération unique pour cette exécution. Chaque obligation est enregistrée, avec sa compensation, avant que son effet direct ne soit déclenché. Le registre consigne :

- un type et une version de gestionnaire fermés, jamais une closure PHP ;
- un identifiant d’opération stable, que le gestionnaire utilise pour se réconcilier avec le fournisseur ;
- une entrée portable (au plus 15 360 octets en JSON, 500 valeurs et une profondeur de 7) ;
- les résultats de l’opération directe et de la compensation, avec des références de preuve.

Tant que l’exécution d’origine est ouverte, son annulation lance la saga native, qui compense dans l’ordre inverse de l’enregistrement. Après la clôture de l’exécution, un workflow de récupération canonique compense les mêmes obligations à partir du registre. Il ne rouvre jamais l’exécution d’origine et ne modifie jamais son historique.

## Configurer l’hôte {#set-up-the-host}

Liez une politique d’autorisation de portée et un registre de gestionnaires fermé dans un fournisseur de services. La politique renvoie sa version de politique. Pour refuser, elle lève `ScopeAuthorizationRefused`.

```php
use App\Compensation\OrderScopeAuthorization;
use App\Compensation\StockReservation;
use Workflow\V2\Compensation\Execution\HandlerRegistry;
use Workflow\V2\Compensation\Security\ScopeAuthorization;

$this->app->singleton(ScopeAuthorization::class, OrderScopeAuthorization::class);
$this->app->singleton(HandlerRegistry::class, static fn (): HandlerRegistry => new HandlerRegistry([
    'stock.reserve' => ['1' => new StockReservation()],
]));
```

`ScopeAuthorization::assertAllowed($scope, $principal, $operation)` est appelée avec `register`, `forward`, `compensate`, `participate`, `request`, `release` ou `inspect`. Refusez tout autre nom d’opération. Seule `ScopeAuthorizationRefused` constitue un refus permanent. Toute autre exception est traitée comme transitoire : elle fait l’objet de nouvelles tentatives, et la récupération automatique réessaie plus tard. Dérivez le principal d’une politique applicative de confiance, jamais d’une charge utile de requête. Exécutez les migrations du paquet ; elles créent les tables du registre sur la connexion de stockage du workflow.

Les identifiants (application, clé, génération, clé d’opération et version du gestionnaire) comptent de 1 à 128 caractères parmi `A-Z a-z 0-9 . _ : / -` et commencent par une lettre ou un chiffre. Les types de gestionnaire utilisent `a-z 0-9 . _ -`, commencent par une lettre minuscule et ne doivent pas commencer par `dw.`, qui est réservé au moteur.

## Enregistrer des obligations dans un workflow {#register-obligations-in-a-workflow}

```php
use Workflow\V2\Attributes\Type;
use Workflow\V2\Compensation\Definition\Obligation;
use Workflow\V2\Compensation\Definition\ScopeIdentity;
use Workflow\V2\Compensation\DurableScope;
use Workflow\V2\Exceptions\WorkflowCancellationRequestedException;
use Workflow\V2\Workflow;

#[Type('order')]
final class OrderWorkflow extends Workflow
{
    public function handle(array $identity, array $shipment): array
    {
        $scope = new DurableScope($this, ScopeIdentity::fromArray($identity), 'order-service');
        try {
            $scope->execute(new Obligation('reserve-stock', 'stock.reserve', '1', ['sku' => 'sku-1']));
            $scope->participate('shipment', ScopeIdentity::fromArray($shipment));
            // ... start the shipment workflow, wait for business events ...

            return ['status' => 'completed'];
        } catch (WorkflowCancellationRequestedException $cancelled) {
            self::cancellationShield(fn () => $this->compensate());

            return self::cancellationShield(static fn () => $scope->verifyCompensation());
        }
    }
}
```

- `execute()` enregistre l’obligation puis exécute son opération directe.
- `register()` se contente d’enregistrer et renvoie une `RegisteredObligation`. Appelez son `execute()` plus tard dans le même workflow lorsque l’ordre de compensation doit différer de l’ordre de déclenchement.
- `participate()` enregistre une portée enfant. La compensation séquentielle attend le registre vérifié de cet enfant avant de compenser les obligations antérieures du parent. Un enfant manquant ou non vérifié arrête le travail antérieur du parent.

## Écrire un gestionnaire {#write-a-handler}

```php
use InvalidArgumentException;
use Workflow\V2\Compensation\Execution\ForwardResult;
use Workflow\V2\Compensation\Execution\OperationContext;
use Workflow\V2\Compensation\Execution\Resolution;
use Workflow\V2\Compensation\Execution\ScopedOperation;

final class StockReservation implements ScopedOperation
{
    public function assertInput(array $input): void
    {
        if (! is_string($input['sku'] ?? null)) {
            throw new InvalidArgumentException('A SKU is required.');
        }
    }

    public function execute(OperationContext $context): ForwardResult
    {
        // Idempotent by operation ID: a retry or a lost acknowledgement finds the same reservation.
        $reservation = Stock::reserve($context->operationId, $context->obligation->input['sku']);

        return ForwardResult::observed(['reservation' => $reservation->id], ['stock:' . $reservation->id]);
    }

    public function compensate(OperationContext $context): Resolution
    {
        if (! Stock::release($context->operationId)) {
            return Resolution::unknown('stock-release-pending');
        }

        return Resolution::verified(['stock-release:' . $context->operationId]);
    }
}
```

Les gestionnaires peuvent s’exécuter plusieurs fois pour la même opération ; rendez donc les deux méthodes idempotentes par `operationId`.

- `execute()` renvoie `ForwardResult::observed()` avec des preuves, `unknown()` lorsque le résultat chez le fournisseur est incertain, ou `rejected()` lorsque le fournisseur n’a assurément produit aucun effet. Une opération directe rejetée fait échouer l’appel du workflow avec `scope_forward_rejected`, et sa compensation ne nécessite aucun appel au fournisseur. Lorsque `$context->reconcileBeforeForward` vaut true, une tentative antérieure a pu prendre effet ; vérifiez l’état de l’opération avant de l’émettre à nouveau.
- `compensate()` renvoie `Resolution::verified()` uniquement avec la preuve que l’effet est annulé et qu’aucun effet direct tardif n’est possible. Une valeur de retour de callback, un délai d’expiration ou une exécution clôturée ne constitue pas une telle preuve. Renvoyez `unknown()` pour laisser l’obligation non résolue et permettre aux nouvelles tentatives natives de s’exécuter, ou `failed()` lorsque la compensation ne peut assurément pas aboutir. Lorsque `$context->forwardOutcomeUnconfirmed` vaut true, l’effet direct n’a jamais été confirmé et peut encore survenir tardivement.
- Un résultat non valide, comme `verified()` sans preuve, un motif non valide ou une valeur de résultat direct dépassant la limite, lève `HandlerContractViolation`. Le moteur enregistre le résultat comme inconnu, de sorte que la compensation réconcilie quand même l’opération, et fait échouer l’activité avec l’erreur non réessayable `scope_handler_contract_violation` suivie du message de la violation. Elle ne fait pas l’objet de nouvelles tentatives comme un résultat inconnu chez le fournisseur.
- Les gestionnaires écrits pour 2.31.0 ou une version antérieure peuvent passer un second argument à `verified()`. `verified($evidence, true)` vérifie toujours et émet un avis `E_USER_DEPRECATED` ; `verified($evidence, false)` renvoie `unknown('late-forward-possible')`. Supprimez le second argument.

## Annuler et récupérer {#cancel-and-recover}

Demandez la compensation avec une clé de requête stable :

```php
use Workflow\V2\Compensation\Recovery\ScopeRecovery;

$result = app(ScopeRecovery::class)->request($scope, 'cancel-order-42', 'order-service', 'customer-cancelled');
```

- Si l’exécution d’origine est encore ouverte, la requête lui demande de s’annuler, et sa saga compense.
- Si cette exécution se clôture alors que la portée n’est toujours pas vérifiée, le watchdog des tâches achemine la même requête vers la récupération canonique lors de son prochain passage. Il s’exécute dans les boucles des workers de file d’attente et dans `workflow:v2:repair-pass`, et réautorise d’abord le principal d’origine. Des passages simultanés ou une requête manuelle concurrente démarrent une seule exécution de récupération.
- Si l’exécution est déjà clôturée, la requête démarre directement la récupération canonique.

Les exécutions de récupération effectuent jusqu’à six tentatives par compensation. Entre les tentatives, elles attendent 1, 2, 5 et 10 secondes, puis un bail d’activité plus un passage de réparation des tâches, de sorte que la tentative d’un worker tombé en panne est récupérée avant la dernière tentative. La vérification d’un enfant, ou une nouvelle requête autorisée, réveille immédiatement une nouvelle tentative en attente. Un échec persistant fait tout de même échouer l’exécution de récupération, l’obligation restant non résolue.

Inspectez le résultat avec `describe()`. Cet appel est en lecture seule et nécessite l’autorisation `inspect`. Il renvoie toujours les mêmes clés. Les statuts proviennent des enums `ScopeStatus`, `NextAction`, `AutomaticRecovery` et `ObligationStatus`, et un refus se compose d’un `code` stable et du `message` de l’hôte, qui n’est pas stable pour un traitement automatisé. Ces enums peuvent recevoir de nouveaux cas dans une version mineure ; traitez donc les valeurs que vous ne reconnaissez pas avec une branche par défaut :

```php
$view = app(ScopeRecovery::class)->describe($scope, 'order-service');
// scopeStatus, originStatus, recoveryRunId, recoveryStatus, automaticRecovery, refusal, nextAction, unresolved
```

`nextAction` vaut `submit_fresh_authorized_request` lorsque la récupération automatique a été refusée (`automaticRecovery: recovery_authorization_failed`) ou qu’une exécution de récupération a échoué. Soumettez dans ce cas une nouvelle clé de requête. Répéter une clé de requête renvoie son accusé de réception d’origine et ne démarre jamais une autre exécution.

Le registre de la portée règle la compensation. Une décision métier, comme marquer la commande `cancelled`, reste une étape de votre application une fois que `scopeStatus` vaut `verified`. Le modèle recommandé est un listener qui finalise l’annulation métier lorsqu’une exécution de récupération se termine, comme le fait l’exemple de fournisseur du dépôt du moteur.

## Conservation, mise à niveau et retour arrière {#retention-upgrade-and-rollback}

- `ScopeRetention::release($scope, $principal)` supprime les entrées et les résultats directs conservés après vérification. Il conserve une pierre tombale, de sorte qu’une ancienne génération ou clé de requête ne puisse plus jamais être acceptée. Rien n’expire automatiquement, et l’élagage de l’historique des exécutions ne supprime jamais le registre.
- Un retour arrière du schéma est refusé avant qu’une migration n’exécute `down()` tant que le registre contient une portée, y compris une pierre tombale libérée. Pour revenir en arrière, restaurez une sauvegarde de la base de données réalisée avant la mise à niveau.
- Rétrograder uniquement le paquet conserve le registre. La récupération reprend après une nouvelle mise à niveau. Ne rétrogradez pas tant qu’une exécution de récupération est ouverte.

## Garanties et limites {#guarantees-and-limits}

Depuis 2.33.0, les API stables ne changent pas de manière incompatible au sein de 2.x. Les historiques de compensation enregistrés sont rejoués sur chaque version 2.x ultérieure, et tout nouveau comportement n’arrive que derrière un marqueur de version enregistré. Les migrations du registre ne font qu’ajouter.

Ces limites sont des minimums qui peuvent augmenter mais ne diminueront pas :

- entrée d’une obligation : 15 360 octets en JSON, 500 valeurs et une profondeur de 7 ; valeur du résultat direct : 11 264 octets, 400 valeurs et une profondeur de 7 (les portées enregistrées avant 2.32.0 conservent pour les deux la limite d’enveloppe antérieure, plus élevée) ;
- 256 obligations par portée, dont jusqu’à 16 participants enfants, et un seul niveau d’imbrication ;
- 128 requêtes par portée, partagées avec les requêtes enfants du moteur ;
- 32 références de preuve d’au plus 128 octets par résultat.

Ne sont pas garantis : le moment d’intervention du watchdog, les intervalles exacts entre les tentatives (seulement que la récupération dure plus longtemps qu’une réparation de bail), la disposition des lignes du registre et tout ce qui est marqué `@internal`. Des effets externes exactement une fois ne sont jamais promis ; la réconciliation avec le fournisseur par identifiant d’opération relève de la responsabilité de votre gestionnaire.

Le [guide des portées de compensation](https://github.com/durable-workflow/workflow/blob/main/docs/compensation-scopes.md) du dépôt du moteur documente le contrat complet, y compris les API expérimentales de réservation d’enfant et d’admission racine.
