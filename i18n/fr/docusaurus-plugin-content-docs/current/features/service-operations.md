---
title: Opérations de service
description: Appeler une opération d’un autre espace de noms depuis un workflow PHP embarqué.
---

# Opérations de service {#service-operations}

Utilisez une opération de service lorsqu’un workflow a besoin d’un résultat durable provenant d’un service appartenant à un autre espace de noms. L’appel désigne un endpoint, un service et une opération enregistrés. Le runtime conserve l’appel et son résultat afin qu’un worker de remplacement puisse rejouer le même résultat.

Les workflows enfants et les signaux restent dans leur espace de noms d’origine. Changer le nom du type enfant ou la file de tâches ne franchit pas cette limite. Utilisez une opération de service pour du travail publié dans un autre espace de noms du même cluster Durable Workflow.

## Appeler depuis PHP embarqué {#call-from-embedded-php}

Enregistrez le catalogue cible et son gestionnaire avant de démarrer le workflow appelant. Le [guide du mode service](../polyglot/service-operations.md) décrit le catalogue partagé, la politique de frontière et les interfaces des SDK publiés séparément.

La fonction auxiliaire embarquée utilise le catalogue de services et le plan de contrôle propres au runtime de l’application. Elle ne se connecte pas elle-même à un Server distant. Utilisez le PHP SDK lorsque l’appelant est un worker distant en mode service.

```php
use Workflow\V2\Support\ServiceOperationOptions;
use Workflow\V2\Workflow;

final class CreateInvoice extends Workflow
{
    public function handle(int $invoiceId): mixed
    {
        $call = self::serviceOperation(
            'billing',
            'invoices',
            'create',
            [$invoiceId],
            new ServiceOperationOptions(
                targetNamespace: 'billing',
                modeOverride: 'sync',
                waitFor: 'completed',
            ),
        );

        return $call->responsePayload;
    }
}
```

`serviceOperation()` renvoie un `ServiceOperationResult` contenant le `serviceCallId` durable, l’état du cycle de vie, l’issue et les données de réponse. Un échec ou une annulation terminale du service est restauré sous forme d’exception de workflow typée au point d’appel d’origine. Conservez les correspondances d’erreurs de l’application pour la relecture.

## Choisir ce que l’appelant attend {#choose-what-the-caller-waits-for}

Utilisez `modeOverride: 'sync'` et `waitFor: 'completed'` lorsque la prochaine décision du workflow dépend du résultat du service. Le workflow reste suspendu durablement tant que l’appel n’est pas terminal.

Utilisez `modeOverride: 'async'` ou `waitFor: 'accepted'` lorsque l’admission suffit. L’enregistrement renvoyé identifie l’appel d’origine. L’acceptation ne signifie pas que le travail métier est terminé. Un résultat ultérieur de la cible ne remplace pas le résultat déjà enregistré pour un appelant qui attendait uniquement l’admission. Si le workflow a besoin du résultat terminal, choisissez dès le départ l’attente de fin.

## Préserver le contrat enregistré {#preserve-the-recorded-contract}

Pour une exécution ouverte, gardez stables l’espace de noms cible, l’endpoint/service/opération, la requête et les options d’attente. Utilisez des branches de version du workflow pour les changements incompatibles. La relecture réutilise l’identité et le résultat enregistrés au lieu de demander une nouvelle exécution.

Une clé d’idempotence explicite est une identité métier durable. Réutilisez-la uniquement pour la même opération et la même requête prévues. Ne la changez pas simplement parce qu’une réponse s’est perdue ou qu’une attente a expiré. Inspectez l’appel d’origine avant de décider si une autre opération métier est sûre.

Pour borner l’exécution du service, définissez `deadline_policy` dans l’opération du catalogue. Son `timeout_seconds` est résolu une seule fois depuis l’acceptation d’origine en `call_deadline_at`; l’autre possibilité est `deadline_at` avec décalage horaire. Le remplacement du worker et la relecture ne renouvellent pas cette échéance. `waitTimeoutSeconds` n’est pas l’échéance d’exécution du service. Alignez les budgets du workflow et du service et inspectez la cible après un timeout au lieu de supposer qu’aucun effet externe n’a eu lieu.

## Guides associés {#related-guides}

- [Appels entre espaces de noms](../polyglot/service-operations.md)
- [Workflows enfants](./child-workflows.md)
- [Gestion des versions](./versioning.md)
- [Échecs et reprise](../failures-and-recovery.md)
