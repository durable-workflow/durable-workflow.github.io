---
sidebar_position: 6
title: Appariement et distribution des tâches
description: Comprendre comment Durable Workflow affecte les tâches durables prêtes aux workers, des réveils d'interrogation longue aux déploiements dédiés au rôle d'appariement.
tags:
  - worker-protocol
  - task-queues
  - operations
  - dispatch
keywords:
  - appariement des tâches
  - distribution des tâches
  - rôle d'appariement
  - découverte des tâches prêtes
  - réveil de file
---

# Appariement et distribution des tâches {#task-matching-and-dispatch}

Utilisez ce guide pour comprendre comment Durable Workflow trouve le travail
prêt, l'affecte à des workers compatibles et fait évoluer ce chemin
d'affectation au-delà du modèle « chaque nœud interroge tout ». C'est le
contrat sous-jacent aux interrogations des tâches de workflow et d'activité,
aux réveils des files et aux déploiements dédiés au rôle d'appariement.

L'idée centrale est que Durable Workflow sépare deux responsabilités :

- l'historique durable et l'état des tâches restent dans la base de données ;
- l'appariement décide quel worker vivant reçoit la prochaine tâche admissible.

Cette séparation compte avant même d'introduire un service d'appariement
distinct. Elle permet aux opérateurs de considérer la découverte des tâches
prêtes, la propriété des files, le renouvellement des baux et la
contre-pression comme un rôle explicite, plutôt que comme des effets
accessoires de chaque processus worker.

## Responsabilités du rôle d'appariement {#what-the-matching-role-does}

Le rôle d'appariement est responsable de :

- découvrir les tâches de workflow et d'activité prêtes ;
- restreindre l'ensemble admissible par espace de noms, connexion, file et
  famille de compatibilité ;
- présenter les tâches à un seul worker à la fois ;
- convertir une prise en charge réussie en bail avec expiration ;
- conserver la même tâche si la prise en charge échoue, si le bail expire
  ou si un worker disparaît ;
- rendre visibles aux opérateurs les états de réveil et du travail en attente.

L'appariement ne remplace ni l'historique durable, ni la relecture du workflow,
ni l'exécution des tâches. Il décide qui pourra exécuter la prochaine tâche.

## Formes de déploiement {#deployment-shapes}

Durable Workflow prend actuellement en charge trois formes pratiques :

### Appariement dans le worker {#in-worker-matching}

C'est la forme par défaut. Les processus worker effectuent des interrogations
longues pour trouver du travail prêt et utilisent un contrôle d'exclusivité
lors de la prise en charge pour qu'un seul worker détienne le bail d'une tâche
à la fois.

Utilisez-la lorsque :

- vous exploitez un nœud unique ou une petite flotte ;
- la pression sur les files est modérée ;
- vous n'avez pas encore besoin d'un démon d'appariement dédié.

### Appariement HTTP dans le serveur {#in-server-http-matching}

Dans les déploiements de serveur autonome, les workers externes accèdent au
même contrat d'appariement via le protocole worker :

- `POST /api/worker/workflow-tasks/poll`
- `POST /api/worker/activity-tasks/poll`

Le serveur devient le point d'entrée réseau du même flux de découverte des
tâches prêtes, de prise en charge, de heartbeat et de finalisation.

### Déploiement dédié au rôle d'appariement {#dedicated-matching-role-deployment}

Les grandes flottes peuvent concentrer la découverte générale des tâches
prêtes dans un processus dédié au rôle d'appariement. La forme opérationnelle
documentée actuellement est :

```bash
php artisan workflow:v2:repair-pass --loop
```

Exécutez ce démon dans un processus dédié et définissez
`DW_V2_MATCHING_ROLE_QUEUE_WAKE=0` sur les nœuds d'exécution seule pour qu'ils
cessent d'effectuer le réveil général des workers de file à chaque tour de boucle.

Utilisez cette forme lorsque :

- les nœuds d'exécution doivent se concentrer sur la relecture et les activités ;
- les interrogations générales indépendantes créent une contention inutile ;
- les opérateurs souhaitent un responsable explicite de la découverte des
  tâches prêtes et de la fréquence des balayages.

Le rôle dédié change le lieu de l'appariement, pas le contrat du protocole
worker. Les sémantiques d'interrogation, de prise en charge, de bail et de
relivraison restent identiques.

## Découverte des tâches prêtes {#ready-task-discovery}

Le rôle d'appariement recherche les tâches durables réellement prêtes maintenant :

- le type de tâche correspond au demandeur (`workflow` ou `activity`) ;
- la tâche est dans l'état `ready` ;
- la date `available_at` de la tâche est atteinte ;
- les filtres d'espace de noms, de file, de connexion et de compatibilité correspondent toujours ;
- les interrogations d'activités exigent aussi un type d'activité annoncé correspondant.

Les réveils d'interrogation longue accélèrent le traitement sans en garantir
la correction. Si le signal de réveil manque ou est retardé, la tâche devient
tout de même visible par interrogation durable. Un échec de réveil doit
augmenter la latence, pas bloquer définitivement le travail.

## Prise en charge, bail et contre-pression {#claim-lease-and-backpressure}

L'appariement ne fait qu'offrir une possibilité. La propriété commence quand
un worker prend la tâche avec succès et reçoit un bail.

Ce bail donne à Durable Workflow son comportement de contre-pression :

- un worker détient la tâche jusqu'au renouvellement, à la finalisation, à la
  libération ou à l'expiration du bail ;
- un worker défaillant ou périmé ne retient pas définitivement la tâche ;
- la relivraison est normale et doit être gérée comme partie de l'exécution au moins une fois ;
- les workers incompatibles ne volent pas le bail ; ils reçoivent un rejet explicite.

Le travail reposant sur des baux, la pression sur les files apparaît sous
forme de retard, de baux périmés ou de relivraisons répétées, plutôt que de
pertes invisibles en mémoire.

## Partitionnement des files {#queue-partitioning}

Les principales primitives de partitionnement sont :

- l'**espace de noms** pour les frontières entre locataires ou environnements ;
- la **connexion** et la **file** pour les frontières de routage du travail ;
- la **famille de compatibilité** pour la sûreté du routage par marqueur de compatibilité ;
- les **filtres de types d'activités** pour les workers n'exécutant que certaines activités.

Utilisez des files distinctes pour renforcer l'isolation, disposer de pools de
workers indépendants ou définir des budgets aval différents. Utilisez les
familles de compatibilité lorsqu'une même file doit rester active pendant un
déploiement ou un retour arrière sans que le travail en cours ne dérive vers
des exécuteurs incompatibles.

## Signaux de réveil et balayages dédiés {#wake-signals-and-dedicated-sweeps}

Les signaux de réveil réduisent le délai entre « la tâche est devenue prête »
et « un demandeur l'a remarquée ». Ils ne sont pas la référence durable.

Dans la forme par défaut, les workers de file peuvent émettre des réveils dans
leur boucle normale. Dans un déploiement dédié au rôle d'appariement, les
nœuds d'exécution seule désactivent ce chemin général de réveil et le démon
d'appariement prend en charge la fréquence des balayages.

Ces paramètres servent au réglage :

- `DW_V2_MATCHING_ROLE_QUEUE_WAKE` contrôle si les nœuds d'exécution effectuent
  le réveil dans le worker ;
- `DW_WAKE_SIGNAL_TTL_SECONDS` contrôle la durée de visibilité des marqueurs de réveil ;
- les délais d'interrogation longue contrôlent la durée d'attente des
  demandeurs à la recherche de travail.

## Points à surveiller par les opérateurs {#what-operators-should-watch}

Utilisez ces interfaces ensemble :

- `GET /api/cluster/info` pour la topologie des rôles par nœud :
  `current_shape`, `current_process_class`, les rôles actuels et le contrat
  `matching_role` complet : `queue_wake_enabled`, `shape` du déploiement,
  `wake_owner`, `task_dispatch_mode`, les `partition_primitives` figées et le
  `backpressure_model` actuel ;
- la visibilité des files de tâches pour la profondeur prête, les
  emplacements actifs et la limitation ;
- la visibilité de la flotte de workers pour les demandeurs actifs ou périmés sur chaque file ;
- `dw system:operator-metrics --json` ou `/api/system/operator-metrics` pour
  le même contrat `matching_role` local au nœud, avec les compteurs actuels de
  retard, de réparation, de workers et de santé du processus répondant ;
- les diagnostics de santé et Waterline pour les tâches défaillantes, les
  baux périmés et les manques de workers compatibles ;
- les contrôles de mise à niveau progressive pendant une fenêtre de
  chevauchement où l'appariement doit bloquer les prises en charge dangereuses.

Si l'âge de la plus ancienne tâche prête augmente alors que des workers
compatibles sont disponibles, le chemin d'appariement ne progresse pas assez
vite. Si les tâches prêtes sont conservées mais qu'aucun worker compatible ne
peut les prendre, il s'agit d'un problème de compatibilité, pas d'une perte
par l'appariement.

## Quand introduire un rôle d'appariement dédié {#when-to-introduce-a-dedicated-matching-role}

Passez de l'appariement par défaut dans les workers à une forme dédiée lorsque :

- les interrogations générales créent une contention visible de la base ou du cache ;
- les nœuds d'exécution ne doivent plus supporter le coût des balayages des tâches prêtes ;
- l'équité des files et la responsabilité de la distribution doivent être
  considérées comme un sous-système explicite ;
- les opérateurs souhaitent un processus distinct à dimensionner, superviser
  et déboguer pour découvrir les tâches prêtes.

Conservez la forme par défaut lorsque la flotte actuelle est petite et que le
besoin principal est un comportement clair de déploiement et de compatibilité,
plutôt qu'une nouvelle topologie.

## Références associées {#related-references}

- [Protocole worker](/docs/polyglot/worker-protocol) pour les opérations
  d'interrogation, de heartbeat, de finalisation et d'échec.
- [Admission des files de tâches](/docs/polyglot/task-queue-admission) pour
  les budgets d'emplacements, de baux et de distribution au-dessus de l'appariement.
- [Mises à niveau progressives](/docs/rolling-upgrades) pour la procédure de
  déploiement combinant appariement et compatibilité.
- [Référence de configuration de Server](/docs/polyglot/server-config-reference)
  pour `DW_V2_MATCHING_ROLE_QUEUE_WAKE`, les délais d'interrogation et les réglages des réveils.
