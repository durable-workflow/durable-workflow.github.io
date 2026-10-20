---
sidebar_position: 15
title: Mises à niveau progressives
description: Mettre à niveau progressivement les nœuds API Server, workers et ordonnanceur de Durable Workflow en autonomie sans interrompre le trafic.
tags:
  - operations
  - upgrades
  - rollouts
  - rollback
keywords:
  - mise à niveau progressive
  - sécurité du déploiement
  - drainage des workers
  - protection du schéma
  - contrat de disponibilité
  - retour arrière
---

# Mises à niveau progressives {#rolling-upgrades}

## Relecture avant un changement de build {#replay-before-changing-builds}

Avant de promouvoir un candidat, relisez des historiques représentatifs ouverts et récemment clôturés avec son code applicatif exact. Avant un retour arrière, relisez les historiques écrits par le nouveau build avec l’ancien artefact. Suivez le [contrôle de relecture](./testing.md#replay-before-deployment) : une cohorte de routage compatible ou une vérification d’intégrité réussie ne prouve pas à elle seule la compatibilité de relecture.

Une mise à niveau progressive remplace les nœuds API, les workers ou
l'ordonnanceur sans mettre le déploiement hors ligne. Ce contrat couvre le
petit cluster du guide des [déploiements auto-hébergés](/docs/deployment) : deux
ou trois nœuds API derrière un répartiteur de charge, MySQL ou PostgreSQL
externe partagé, Redis partagé, workers dimensionnés indépendamment et exactement
un ordonnanceur ou processus de maintenance.

La mise à niveau progressive est prise en charge si toutes les garanties de
cette page sont respectées. Hors de ce périmètre, utilisez la procédure avec
arrêt complet documentée dans le guide de déploiement.

Le vocabulaire des rôles et le manifeste de topologie sont décrits dans la
[topologie des rôles Server](/docs/polyglot/server-role-topology). Ce guide
explique le remplacement sur place des classes de processus actuelles de
`standalone_server`.

## Sens d'une mise à niveau progressive ici {#what-rolling-upgrade-means-here}

Une **mise à niveau progressive** remplace les processus un par un en les
drainant avant de les arrêter, pendant que les autres continuent à servir le
trafic. Le déploiement reste disponible dans son ensemble, avec une fenêtre
bornée de coexistence entre anciens et nouveaux processus.

Le contrat distingue quatre classes dans la topologie `standalone_server`
actuelle, chacune avec sa stratégie de déploiement :

- **Nœuds HTTP/API** : processus serveur sans état qui servent le trafic HTTP
  et hébergent actuellement `api_ingress`, `control_plane`, `matching` et
  `history_projection`.
- **Workers** : processus SDK qui interrogent le plan worker et exécutent les
  tâches d'activité et de workflow comme `execution_plane`.
- **Ordonnanceur / processus de maintenance** : processus unique qui déclenche
  les planifications et gère les délais d'activité et la rétention d'historique
  dans le rôle `scheduler`.
- **Initialisation** : processus ponctuel qui applique les migrations de base
  et crée l'espace de noms par défaut.

Les nœuds API et les workers sont remplacés indépendamment. L'ordonnanceur est
unique : arrêtez l'ancien avant de démarrer le nouveau. Le reste du déploiement
continue à servir le trafic pendant cet intervalle.

## Règles de coexistence des versions {#compatible-version-skew-rules}

La fenêtre de coexistence est la période où plusieurs images Server, versions
du paquet Workflow ou versions SDK worker sont actives. Elle doit respecter
toutes les règles de cette section.

### Image Server et paquet Workflow {#server-image-and-workflow-package}

- **Versions adjacentes uniquement.** Pendant la mise à niveau, chaque nœud API
  et autre processus Server doit utiliser une image dont le paquet Workflow
  garde la même majeure que le paquet précédent du cluster et reste à une
  version mineure au plus de tout autre processus actif. Changer de majeure
  exige un arrêt complet.
- **Migrations additives vers l'avant.** Chaque changement de schéma Durable
  Workflow v2 est additif dans une même majeure. Les nouveaux nœuds ne doivent
  pas nécessiter une colonne ou table non migrée. Les anciens ne doivent pas
  échouer à cause d'une nouvelle colonne qu'ils ne lisent pas. Les
  [règles d'ordre des migrations](#schemabootstrap-ordering) ci-dessous l'imposent.
- **Versions adjacentes des protocoles.** Chaque nœud publie les plages prises
  en charge de `control_plane.version` et `worker_protocol.version` dans
  `GET /api/cluster/info`. La plage de la nouvelle image doit recouper celle de
  chaque ancien nœud actif. Découvrez les plages avant le déploiement et
  abandonnez s'il n'y a pas de recoupement.

### SDK worker et identité de build {#worker-sdk-and-build-identity}

- **Chaque build worker est identifié.** Chaque worker participant doit
  s'enregistrer via `POST /api/worker/register` avec un `build_id` stable.
  La cohorte sans version (`build_id: null`) est la valeur par défaut avant
  déploiement. Le [guide de déploiement par build-id](/docs/polyglot/worker-build-id-rollout)
  explique la première transition.
- **Préservez le routage d’origine et qualifiez les définitions modifiées.** Une exécution conserve son build fixé et l’empreinte enregistrée à `WorkflowStarted`. Avec `DW_V2_PIN_TO_RECORDED_FINGERPRINT=true` (par défaut), le changement de routage préparé pour Server 2.9.9 préfère les workers éligibles correspondant à la définition enregistrée. S’il n’en reste aucun, un remplacement disposant de `workflow_entry_arguments_validation` peut prendre la tâche sous les contrôles d’origine de namespace, de file, de type, de build et de relecture. Le SDK doit toujours valider l’entrée d’origine et relire les commandes validées.
- **Choix d'admission pendant la coexistence.** Choisissez
  [`DW_V2_FLEET_VALIDATION_MODE`](/docs/polyglot/server-config-reference) avant de
  commencer. `warn` autorise le déploiement même si le marqueur requis n'a
  aucun worker actif. `fail` bloque la distribution et ferme l'admission de
  disponibilité pendant cet intervalle. Les déploiements de production qui
  exigent une transition nette doivent utiliser `fail`.

**Préparation d’une version non publiée.** Ce chemin de remplacement exige la qualification encore en attente de Server 2.9.9 et du SDK PHP 2.5.4, Python 2.6.2 ou Rust 3.5.6. Les anciens runtimes peuvent continuer à refuser une empreinte différente même si le code applicatif ajoute une branche de version valide. Désactiver la fixation de l’empreinte n’est pas la procédure sûre de mise à niveau par défaut. Suivez le [routage des définitions](./polyglot/worker-compatibility-routing.md#definition-fingerprint-evolution), inspectez la capacité réelle du worker et conservez les artefacts de retour arrière jusqu’à la qualification du nouveau chemin. Une branche de version ne peut pas corriger des arguments d’entrée incompatibles avant l’exécution du corps du workflow ; consultez la [compatibilité à l’entrée](./features/versioning.md#service-sdk-entry-safeguard).

## Ordre du schéma et de l'initialisation {#schemabootstrap-ordering}

Les changements de schéma passent par une initialisation unique. L'ordre compte.

1. **Initialisez d'abord, exactement une fois.** Exécutez
   `php artisan server:bootstrap --force` (ou son équivalent dans l'image
   publiée) depuis un conteneur avant tout nouveau nœud API, worker ou
   ordonnanceur. Cette commande lance `migrate` et crée l'espace de noms par
   défaut. Elle adopte les migrations du paquet Workflow dont les tables
   existent déjà sur la connexion.
2. **Le nouveau schéma doit accepter l'ancien code.** Chaque migration v2 de ce
   parcours est additive : tables, colonnes ou index nouveaux. Les anciens
   nœuds API et workers continuent à fonctionner avec le nouveau schéma.
3. **Ne démarrez pas le nouveau code avant la fin de l'initialisation.**
   Déployez la nouvelle image uniquement après sa réussite. Les nouveaux
   processus peuvent dépendre des tables migrées. Les démarrer trop tôt est
   la cause la plus fréquente d'une hausse de 5xx pendant la transition.
4. **L'initialisation est idempotente.** La relancer est sûr. En cas d'échec
   partiel, corrigez la cause puis relancez. Le registre des migrations reprend
   là où il s'est arrêté et la création d'espace de noms ne fait rien si la
   ligne existe déjà.

Une migration appliquée à un serveur avant un autre NE DOIT PAS corrompre
l'interface de disponibilité. Si vous découvrez un changement non additif en
préparation, prévoyez un arrêt complet pour cette publication, puis reprenez
les mises à niveau progressives à la suivante.

## Drainage et admission pendant la coexistence {#drain-and-admission-during-the-overlap-window}

Trois interfaces d'admission assurent automatiquement la sécurité :

- **Admission au démarrage.** Chaque processus charge `BackendCapabilities`,
  `LongPollCacheValidator`, `WorkflowModeGuard` et le contrat de disponibilité.
  Si son backend ou son cache ne peut respecter le contrat v2, il refuse de
  se déclarer prêt.
- **Compatibilité des workers.** Avec `DW_V2_FLEET_VALIDATION_MODE=fail`, si aucun
  worker actif n'annonce le marqueur requis pour la connexion et la file de la
  tâche, le rôle de mise en correspondance bloque la distribution et le contrôle
  `worker_compatibility` passe de `warning` à `error`. Les tâches restent prêtes
  et visibles, sans perte. Le contrat de disponibilité renvoie 503 sur ce nœud
  pour que le répartiteur le retire du trafic.
- **Sécurité du routage.** Une tâche prête sans worker compatible reste conservée
  et comptée dans `compatibility_blocked_runs`. Le routage ne transforme jamais
  silencieusement ce cas en perte de tâche. La garantie d'exécution au moins une
  fois demeure après le drainage du routage.

Pour réduire la coexistence, drainez les anciennes cohortes à mesure que les
nouvelles arrivent. Utilisez le parcours de
[déploiement par build-id](/docs/polyglot/worker-build-id-rollout) :

```bash
dw task-queue:drain orders-critical --build-id orders-worker-2026-04-21-z9
```

Le `drain_intent` de la cohorte devient `draining`. Ses workers terminent le
travail en cours sans prendre de nouvelles tâches. Attendez que ses
`active_worker_count` et `draining_worker_count` atteignent zéro avant d'arrêter
les anciens processus.

L'ordonnanceur n'exécute pas de file de tâches longue durée et ne nécessite pas
de drainage worker. Arrêtez son ancien conteneur, initialisez si ce n'est pas
déjà fait, puis démarrez le nouveau. L'intervalle est borné par le temps de
démarrage du conteneur. Les déclenchements reprennent depuis l'état persisté
au passage suivant.

Si le déploiement introduit aussi un rôle de mise en correspondance dédié,
rendez ce changement explicite au lieu de supposer que chaque nœud d'exécution
continuera les balayages globaux des tâches prêtes. Consultez
[Mise en correspondance et distribution des tâches](/docs/polyglot/task-matching-dispatch)
pour la topologie `workflow:v2:repair-pass --loop` avec
`DW_V2_MATCHING_ROLE_QUEUE_WAKE=0`. Vérifiez le contrat de chaque nœud via
`GET /api/cluster/info` : `topology.current_shape` doit correspondre au
déploiement visé, `topology.current_roles` au groupe de rôles documenté du nœud,
et `topology.matching_role.queue_wake_enabled`, `topology.matching_role.shape`
et `topology.matching_role.wake_owner` au responsable attendu des tâches prêtes.
Par défaut : `queue_wake_enabled: true`, `shape: "in_worker"`,
`wake_owner: "worker_loop"`. En mode dédié, les nœuds d'exécution annoncent
`queue_wake_enabled: false`, `shape: "dedicated"` et
`wake_owner: "dedicated_repair_pass"`.

## Disponibilité et transition {#readiness-and-cutover}

Utilisez le contrat de disponibilité, au-delà de la sonde de vie, pour décider
quand envoyer du trafic à un nœud.

- `GET /api/health` prouve que le processus sert HTTP.
- `GET /api/ready` prouve qu'il utilise ses dépendances configurées : migrations,
  espace de noms par défaut et, avec `DW_V2_FLEET_VALIDATION_MODE=fail`, contrôle
  d'admission de compatibilité worker.
- `GET /api/cluster/info` prouve qu'un client authentifié peut découvrir
  identité du build, protocoles du plan de contrôle et worker, codecs et capacités.
- `POST /api/worker/register` prouve que les workers peuvent s'authentifier dans
  l'espace de noms et la file attendus.

Transition d'un nœud API :

1. Retirez-le de la rotation du répartiteur. Le plus simple est de faire échouer
   la sonde de disponibilité en arrêtant le hook de prédémarrage de la nouvelle
   image avant de lancer le nouveau conteneur.
2. Drainez les requêtes HTTP en cours. La plupart des clients réessaient après
   réinitialisation de connexion. Les connexions longues, dont les interrogations
   longues des workers, se reconnectent aux autres nœuds.
3. Arrêtez l'ancien conteneur et démarrez le nouveau.
4. Attendez `200` sur `GET /api/ready` et la nouvelle identité sur
   `GET /api/cluster/info`. Si la topologie de mise en correspondance change,
   confirmez aussi `topology.matching_role.task_dispatch_mode`,
   `topology.matching_role.queue_wake_enabled`, `topology.matching_role.shape`,
   `topology.matching_role.wake_owner`, `topology.matching_role.partition_primitives`
   et `topology.matching_role.backpressure_model` avant de rétablir le trafic.
   `/api/system/operator-metrics` fournit le même contrat local au nœud avec
   les compteurs courants de retard, réparation et workers du processus répondant.
5. Réintégrez le nœud à la rotation.

Répétez un nœud à la fois. Ne passez au suivant qu'après le retour du précédent
dans la rotation et une desserte correcte du trafic.

Pour les workers, la transition se fait par cohorte :

1. Démarrez la nouvelle cohorte avec un nouveau `build_id`.
2. Confirmez que les deux annoncent `rollout_status: "active"` et un
   `active_worker_count` non nul via `dw task-queue:build-ids <queue> --json`.
3. Drainez l'ancienne avec `dw task-queue:drain`.
4. Attendez que ses `active_worker_count` et `draining_worker_count` soient nuls.
5. Arrêtez les anciens processus workers.

## Retour arrière {#rollback}

Chaque étape est réversible. Préparez le retour arrière avant de commencer.

- **Initialisation.** Les migrations v2 sont réversibles par le `down()` Laravel
  standard. Pour annuler une migration requise par la nouvelle image, arrêtez
  d'abord tous les nouveaux nœuds. Sinon, le nouveau code trouve une colonne
  absente et ces nœuds renvoient 503. La plupart des retours arrière ne
  nécessitent pas d'annuler les migrations, car elles sont additives.
- **Nœud API.** Arrêtez le nouveau conteneur et redémarrez l'ancien sur le même
  nœud. Retirez-le du trafic pendant le démarrage, puis réintégrez-le quand
  `GET /api/ready` est sain. Répétez pour les autres nœuds mis à niveau.
  L'ancien code continue à lire le schéma additif correctement.
- **Worker.** Réactivez la cohorte drainée, drainez celle qui pose problème et
  redimensionnez le build connu comme sain :

  ```bash
  dw task-queue:resume orders-critical --build-id orders-worker-2026-04-21-z9
  dw task-queue:drain  orders-critical --build-id orders-worker-2026-04-22
  ```

  La reprise efface `drain_intent` et `drained_at`. Tout worker qui envoie un
  battement de cœur sous ce `build_id` redevient `active` à l'interrogation
  suivante. Les deux appels sont idempotents.

Si un défaut de schéma non additif apparaît, prévoyez un arrêt complet pour
revenir en arrière, appliquer les migrations correctives et revoir le plan.

## Vérification opérateur {#operator-verification}

Vérifiez chaque phase via les interfaces opérateur plutôt que les journaux.

| Question | Interface |
| --- | --- |
| L'initialisation est-elle terminée ? | Code de sortie 0 de `php artisan server:bootstrap --force`. `migrate:status` indique toutes les migrations appliquées. |
| Le nouveau nœud est-il prêt ? | `GET /api/ready` renvoie 200. `GET /api/cluster/info` annonce le nouveau build. |
| L'admission de compatibilité est-elle saine ? | Dans `GET /api/system/operator-metrics`, `workers.fleet`, `workers.active_workers` et `workers.active_workers_supporting_required` concordent sur un nombre non nul de workers compatibles avec chaque marqueur requis. |
| Le drainage avance-t-il ? | `dw task-queue:build-ids <queue> --json` montre la baisse de `active_worker_count` et `draining_worker_count` pour la cohorte drainée. |
| Le routage est-il sûr ? | `backlog.compatibility_blocked_runs` et `backlog.max_compatibility_blocked_age_ms` de `GET /api/system/operator-metrics` restent proches de zéro. `worker_compatibility` n'est pas en `error`. |
| L'ordonnanceur a-t-il rattrapé le retard ? | `schedules.missed` de `GET /api/system/operator-metrics` vaut zéro et `schedules.oldest_overdue_at` est nul. |
| Les exécutions bloquées s'accumulent-elles ? | `runs.repair_needed` et `runs.max_repair_needed_age_ms` de `GET /api/system/operator-metrics` restent proches de leur niveau avant déploiement. |

`dw system:operator-metrics --json` expose le même instantané en console pour
l'ensemble des serveurs autonomes. Choisissez l'interface adaptée à votre
procédure. Un service Waterline déployé séparément peut lire le même état Server
via le SDK PHP sous `/waterline/api/v2/health` et `/waterline/api/stats`. Alignez
son adresse, son espace de noms et son jeton avec les serveurs remplacés.
Laravel embarqué expose ces routes via son paquet dans le processus.
L'API serveur et la CLI restent disponibles dans les deux cas, comme décrit
dans le [périmètre d'exploitation opérateur](/docs/operator-operating-envelope).

## Échecs possibles et actions {#failure-modes-and-what-to-do}

| Symptôme | Cause probable | Action |
| --- | --- | --- |
| Le nouveau nœud échoue sur `GET /api/ready` après démarrage | Initialisation inachevée, ou `DW_V2_FLEET_VALIDATION_MODE=fail` sans worker compatible actif | Relancez l'initialisation. Démarrez une cohorte compatible avant de réintégrer le nœud au trafic. |
| `worker_compatibility` passe en `error` pendant le déploiement | Aucun worker actif ne prend en charge le marqueur requis | Démarrez davantage de workers sous un `build_id` compatible. Réactivez une cohorte drainée si le retour arrière convient. |
| `backlog.compatibility_blocked_runs` et `max_compatibility_blocked_age_ms` augmentent | Les tâches attendent un marqueur sans worker actif compatible | Même action. Les tâches sont conservées et redistribuées automatiquement dès le battement de cœur d'un worker compatible. |
| `dw task-queue:drain` réussit mais les workers prennent encore des tâches | Aucun battement de cœur du worker depuis le drainage | Attendez un cycle. Si la cohorte reste active, redémarrez le processus pour qu'il prenne en compte le drainage. |
| Les déclenchements cessent après redémarrage de l'ordonnanceur | Ancien et nouvel ordonnanceurs arrêtés | Démarrez le nouveau conteneur. Vérifiez le retour de `schedules.missed` à zéro à la prochaine collecte des métriques. |

Si le symptôme n'est pas dans cette liste, considérez le déploiement comme
échoué : cessez d'ajouter des processus, drainez les nouvelles cohortes lancées
et rétablissez le build précédent avant de poursuivre le diagnostic.

## Références associées {#related-references}

- [Déploiements auto-hébergés](/docs/deployment) pour les topologies supposées
  par ce contrat.
- [Déploiement par build-id](/docs/polyglot/worker-build-id-rollout) pour les
  appels de drainage et reprise par cohorte.
- [Périmètre d'exploitation opérateur](/docs/operator-operating-envelope) pour
  le contrat de diagnostic, de files et de reconstruction à lire avec les signaux du déploiement.
- [Référence de configuration Server](/docs/polyglot/server-config-reference)
  pour les variables de sécurité (`DW_V2_FLEET_VALIDATION_MODE`,
  `DW_V2_PIN_TO_RECORDED_FINGERPRINT`, `DW_V2_GUARDRAILS_BOOT`,
  `DW_V2_CACHE_VALIDATION_MODE`, `DW_V2_MULTI_NODE`,
  `DW_V2_VALIDATE_CACHE_BACKEND`, `DW_V2_TASK_REPAIR_*`).
- [Référence API Server](/docs/polyglot/server-api-reference) pour les routes
  de disponibilité, découverte et métriques utilisées à chaque phase.
