---
sidebar_position: 3.5
title: Garanties d’exécution et idempotence
description: Le contrat public v2 de relecture, nouvelles tentatives, expiration des baux, redistribution et identifiants d’idempotence.
tags:
  - constraints
  - idempotency
  - retries
  - replay
keywords:
  - garanties d’exécution
  - idempotence
  - relecture
  - redistribution
  - expiration du bail
  - au moins une fois
  - une fois par identifiant
---

# Garanties d’exécution et idempotence {#execution-guarantees-and-idempotency}

Durable Workflow v2 sépare la **relecture des workflows** de l’**exécution des activités** :

- Le code d’un workflow est relu depuis l’historique validé et doit être déterministe.
- Le code d’une activité réalise des effets de bord et s’exécute **au moins une fois**.
- L’historique durable enregistre les résultats validés des workflows et activités une seule fois par identifiant durable, même si le transport a livré le travail plusieurs fois.

Ces garanties permettent de conserver la progression à travers les redémarrages de workers, l’expiration des baux, la redistribution et les déploiements progressifs.

## Relecture et nouvelle tentative {#replay-is-not-retry}

Une tâche de workflow reconstruit l’état par relecture de l’historique validé, puis décide de la suite. La relecture rappelle le corps du workflow. Elle ne réexécute pas les activités, ne renvoie pas les signaux et ne répète pas les effets de bord déjà enregistrés.

Le code doit donc rester déterministe. Pour franchir la frontière durable, utilisez des mécanismes sûrs pour le workflow, dont [`Workflow::now()`](../defining-workflows/workflow-api.md), [`sideEffect(...)`](../features/side-effects.md), les requêtes de lecture, mises à jour, résultats d’activité, mémos et attributs de recherche.

## Les activités s’exécutent au moins une fois {#activity-execution-is-at-least-once}

Les activités effectuent les effets de bord. Leur contrat est le suivant :

- Une tentative d’activité peut être prise en charge plusieurs fois.
- L’expiration du bail peut provoquer sa redistribution à un autre worker.
- Un worker peut terminer le travail externe, perdre son bail et envoyer un rapport tardif.
- Une nouvelle tentative crée une tentative durable pour la même activité logique.

Observer plusieurs fois le même travail est un comportement prévu. L’application doit rendre le corps de l’activité ou le système distant appelé sûr à répéter.

Les [contraintes des activités](./activity-constraints.md) décrivent les règles de développement. Les [échecs et la reprise](../failures-and-recovery.md) décrivent les actions d’exploitation.

## Ce qui est garanti une seule fois {#what-is-exactly-once}

Durable Workflow ne garantit pas qu’un processus worker ne reçoit le travail à effets de bord qu’une seule fois. Il garantit que les faits durables validés font autorité et ne sont pas dupliqués pour un même identifiant durable.

Concrètement :

- Une décision de workflow validée est enregistrée une seule fois dans l’historique typé pour son identifiant de commande ou d’étape durable.
- Le résultat terminal validé d’une tentative d’activité est enregistré une seule fois pour son `activity_attempt_id`.
- La relecture reconstruit l’état du workflow depuis ces faits validés, sans réexécuter le travail externe.

Le modèle à retenir est :

- **Transport et workers : au moins une fois.**
- **Historique durable validé : une seule fois par identifiant durable.**

## Expiration du bail et redistribution {#lease-expiry-and-redelivery}

L’expiration d’un bail est un mécanisme normal de reprise dans un système distribué :

- Une tâche prise en charge possède un propriétaire de bail et une échéance.
- Si le bail expire avant le rapport de progression ou de fin, la tâche devient éligible à une redistribution.
- Un autre worker peut prendre en charge le même travail logique.

La redistribution répond à une incertitude sur le worker ou le transport. Elle n’efface pas les résultats déjà validés.

En présence de symptômes d’exécution en double, distinguez deux questions :

1. L’effet externe a-t-il eu lieu plusieurs fois ?
2. L’état durable contient-il plusieurs résultats validés pour le même identifiant durable ?

La première relève de la conception idempotente de l’activité. La seconde relève du contrat du moteur.

## Identifiants d’idempotence par défaut {#default-idempotency-surfaces}

Ces identifiants fournissent des clés stables de déduplication :

| Identifiant | Ce qu’il identifie | Utilisation habituelle |
| --- | --- | --- |
| `workflow_instance_id` | Une instance publique de workflow | Gestion des démarrages en double et identité métier |
| `workflow_run_id` | Une exécution durable particulière | Cibler une exécution pour les requêtes de lecture, exports et diagnostics |
| `workflow_command_id` | Une commande externe qui modifie l’état | Dédupliquer les nouvelles tentatives de requête du client |
| `activity_execution_id` | Une activité logique à travers les nouvelles tentatives | Clé d’idempotence distante par défaut pour les effets externes |
| `activity_attempt_id` | Une tentative particulière de cette activité | Corrélation lorsque le système distant doit distinguer les tentatives |
| `schedule_id` | Une définition de planification | Déduplication de la propriété et de l’identité des déclenchements |
| `idempotencyKey` du flux de messages | Un envoi logique de message réessayé | Éviter l’ingestion en double lorsque l’émetteur réessaie |

Par défaut, utilisez `activity_execution_id` comme clé d’idempotence d’une opération externe. Utilisez `activity_attempt_id` seulement si la cible doit réellement distinguer chaque tentative.

```php
use Workflow\V2\Activity;

final class ChargeCard extends Activity
{
    public function handle(array $payload): string
    {
        return app(PaymentGateway::class)->charge(
            $payload,
            idempotencyKey: $this->activityId(),
            attemptCorrelation: $this->attemptId(),
        );
    }
}
```

## Effets que l’application doit rendre idempotents {#what-developers-must-make-idempotent}

Le framework gère la relecture en reconstruisant l’état depuis l’historique validé.

L’application doit rendre les effets externes sûrs à répéter, notamment :

- Les appels de paiement ou de facturation.
- Les e-mails, SMS et webhooks.
- Les écritures dans une autre base ou un autre service.
- La création et l’envoi de fichiers.
- Les commandes qui créent ou modifient un état hors de l’historique du workflow.

Approches courantes :

- Fournir une clé d’idempotence à l’API distante.
- Écrire vers une ressource cible déterministe, comme une clé d’objet connue.
- Utiliser un upsert ou une transaction indexée par un identifiant durable.
- Rendre l’action naturellement répétable, de sorte que le deuxième appel ne change rien.

## Conseils d’exploitation {#operator-guidance}

Pour diagnostiquer une exécution dans Waterline, la CLI ou les logs Server :

- Une activité observée plusieurs fois après expiration du bail est attendue. Consultez le résultat durable de la tentative pour déterminer ce qui a été validé.
- Les rapports tardifs de fin ou d’échec sont des courses que le moteur résout. Ils ne prouvent pas l’absence d’effet externe.
- La relecture d’une tâche de workflow est une reprise, pas une nouvelle tentative du workflow entier.
- L’absence de workers compatibles, les baux bloqués et les réparations répétées nécessitent une investigation. Ils ne justifient pas de réexécuter les effets de bord dans le corps du workflow.

Distinguez **l’incertitude du transport** du **résultat durable**. Durable Workflow expose les deux.

## Guides associés {#related-guides}

- [Vue d’ensemble](./overview.md) présente les responsabilités des workflows et activités.
- [Contraintes des workflows](./workflow-constraints.md) décrit les règles de déterminisme.
- [Contraintes des activités](./activity-constraints.md) décrit l’idempotence et la sécurité des effets de bord.
- [Échecs et reprise](../failures-and-recovery.md) couvre les nouvelles tentatives, les délais et la réparation.
- [Modèle d’exécution des activités](../features/activity-execution-model.md) relie les activités en file, activités locales, sessions de worker et exécution sticky.
- [Activités locales](../features/local-activities.md) explique les tentatives dans le même processus, les heartbeats de tâches de workflow, les nouvelles tentatives et la relecture à froid.
- [Exécution sticky](../features/sticky-execution.md) explique les caches de relecture et pourquoi la relecture à froid reste la solution de repli pour la correction.
