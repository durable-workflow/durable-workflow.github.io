---
sidebar_position: 22
title: Modèle d’exécution des activités
description: Articulation des activités ordinaires en file, activités locales, sessions de worker et exécution avec affinité de cache dans Durable Workflow v2.
tags:
  - activities
  - workers
  - execution
keywords:
  - modèle d’exécution des activités
  - activités locales
  - sessions de worker
  - exécution avec affinité de cache
  - envoi de tâches durables
  - activités en file
---

# Modèle d’exécution des activités {#activity-execution-model}

Pour la prise en charge des workers de service et la négociation des capacités
avec refus par défaut entre PHP, Python et Rust, consultez la matrice
[Affinité portable des workers](/docs/polyglot/portable-worker-affinity) du mode service.

Durable Workflow v2 dispose désormais de primitives explicites pour les
principaux choix de placement des activités :

- les activités ordinaires en file pour du travail durable sous bail indépendant ;
- les [activités locales](/docs/features/local-activities) pour du travail court
  dans le même processus, tout en enregistrant l’historique d’activité ;
- les [sessions de worker](/docs/features/worker-sessions) pour une affinité durable
  entre plusieurs étapes d’activité en file ;
- l’[exécution avec affinité de cache](/docs/features/sticky-execution) pour le cache
  de relecture des workflows, avec la relecture ordinaire comme garantie de correction.

## Activités ordinaires en file {#ordinary-queued-activities}

`activity(...)` et `Workflow::activity(...)` sont des activités ordinaires en file.
Elles restent la primitive d’activité par défaut.

1. Le code du workflow appelle `activity(MyActivity::class, ...)`.
2. La tâche de workflow enregistre `ActivityScheduled` et crée une tâche d’activité
   durable sur la connexion et la file configurées.
3. Un worker compatible prend la tâche d’activité sous bail.
4. Le worker exécute la classe d’activité et signale sa fin, son échec,
   son annulation, ses battements ou son expiration.
5. Le moteur enregistre le résultat dans l’historique du workflow et reprend
   le workflow depuis l’état durable.

Les tentatives ordinaires d’activité peuvent s’exécuter sur tout worker compatible.
Une nouvelle tentative peut arriver sur un autre processus, hôte ou version.
Le code d’activité doit être idempotent face aux livraisons en double, aux nouvelles
tentatives après expiration de bail et aux courses de fin tardive. Utilisez
`activity_execution_id` comme clé d’idempotence distante par défaut, et
`activity_attempt_id` uniquement si un système aval nécessite une corrélation par tentative.

```php
use function Workflow\V2\activity;

$quote = activity(FetchQuoteActivity::class, $customerId);
$invoice = activity(CreateInvoiceActivity::class, $quote['id']);
```

## Activités locales {#local-activities}

`localActivity(...)`, `Workflow::localActivity(...)` et
`Workflow::executeLocalActivity(...)` exécutent une classe d’activité dans le
processus du worker qui exécute actuellement la tâche de workflow. Elles ne
créent pas de tâche d’activité ordinaire.

Les activités locales enregistrent toujours l’historique normal d’activité :

- `ActivityScheduled`
- `ActivityStarted`
- `ActivityHeartbeatRecorded`
- `ActivityRetryScheduled`
- `ActivityCompleted`
- `ActivityFailed`
- `ActivityCancelled`
- `ActivityTimedOut`

Chaque événement local porte `execution_mode=local` et `local_activity=true`,
et l’instantané de l’exécution d’activité stocke
`activity_options.execution_mode=local`. Les battements d’activité renouvellent
le bail de la tâche de workflow propriétaire pendant la tentative locale.

Utilisez les activités locales pour des effets de bord courts et idempotents
nécessitant les nouvelles tentatives, délais d’expiration, battements, annulation
et visibilité d’une activité, sans routage par file ni parc de workers d’activité
indépendant. Consultez [Activités locales](/docs/features/local-activities)
pour le contrat des API, délais, nouvelles tentatives, arrêts, relecture à froid,
routage et métriques.

```php
use Workflow\V2\Support\LocalActivityOptions;
use function Workflow\V2\localActivity;

$receipt = localActivity(
    SendReceiptActivity::class,
    new LocalActivityOptions(maxAttempts: 3, startToCloseTimeout: 10),
    $orderId,
);
```

## Sessions de worker {#worker-sessions}

Les sessions de worker attachent une séquence de tentatives ordinaires en file
à un même bail de session. Utilisez-les lorsque plusieurs étapes durables doivent
réutiliser des ressources locales au worker, comme la mémoire GPU, un système
de fichiers monté ou un modèle chargé.

Les sessions de worker ne rendent pas une activité locale. Chaque activité de
session reste une tâche durable avec son propre bail, ses battements, délais,
nouvelles tentatives et historique terminal. La session ajoute des règles
explicites d’affinité et d’admission au routage normal par file.

Consultez [Sessions de worker](/docs/features/worker-sessions) pour les API,
le cycle de vie des baux, le routage, la gestion des échecs, les arrêts et
les diagnostics opérateur.

## Exécution avec affinité de cache {#sticky-execution}

L’exécution avec affinité de cache optimise la relecture des tâches de workflow.
Un worker peut conserver un cache de relecture chaud local au processus après
la fin d’une tâche. L’appariement peut privilégier ce worker pour la prochaine
tâche de la même exécution.

La progression du workflow ne devient pas locale au processus. La correction
repose toujours sur la relecture ordinaire à froid depuis l’historique durable
après un défaut de cache, un redémarrage de worker, un vidage, un déploiement ou
une éviction. Le code du workflow ne doit pas dépendre d’un état en mémoire
absent de l’historique.

Consultez [Exécution avec affinité de cache](/docs/features/sticky-execution) pour
le cycle de vie du cache, l’identité de routage, les règles de repli, les commandes
de déploiement et les métriques.

## Choisir la bonne primitive {#choosing-the-right-primitive}

Utilisez directement le code du workflow pour les branchements et calculs déterministes.

Utilisez [`sideEffect(...)`](/docs/features/side-effects) pour un instantané d’une
valeur non déterministe sûr à relire, sans les nouvelles tentatives, délais,
battements ou annulations des activités.

Utilisez les [activités locales](/docs/features/local-activities) pour des effets
de bord courts, réessayables et dans le même processus, visibles comme tentatives
d’activité sans passer par l’appariement normal des tâches.

Utilisez les [activités](/docs/defining-workflows/activities) ordinaires pour les
appels distants, E/S lentes, calculs intensifs, régulation par file, parcs de workers
dédiés ou travaux devant continuer via une tâche d’activité sous bail distinct.

Utilisez les [sessions de worker](/docs/features/worker-sessions) lorsque plusieurs
étapes d’activité ordinaires nécessitent une affinité explicite locale au worker.
