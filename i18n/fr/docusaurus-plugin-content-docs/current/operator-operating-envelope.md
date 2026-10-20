---
sidebar_position: 14
title: Périmètre d’exploitation
description: Contrat d’exploitation de Durable Workflow v2 pour santé, files, projections, exports, archives et récupération.
tags:
  - operations
  - observability
  - Waterline
keywords:
  - périmètre d’exploitation
  - santé workflow v2
  - reconstruire les projections
  - exporter l’historique
  - vérifier les archives
  - santé des files
  - haute disponibilité
---

# Périmètre d’exploitation {#operator-operating-envelope}

Ce guide définit le contrat d’exploitation de Durable Workflow v2 : diagnostics bloquant une mise à jour ou simplement indicatifs, séparation entre état des files dans Waterline et télémétrie worker, vérification des reconstructions et exports, et formes de déploiement couvertes.

Ces procédures s’appliquent à Laravel intégré et Server auto-hébergé. Cloud est un service géré distinct qui exploite persistance, placement monorégion, sauvegarde et récupération. Ses clients exploitent clients SDK et workers via l’URL du namespace. N’utilisez pas ce guide pour raccorder Server à Cloud. Voir [Runtime Cloud géré](/docs/polyglot/cloud-control-plane).

## Interfaces faisant autorité {#source-of-truth-surfaces}

Utilisez ces interfaces ensemble :

| Interface | Utilisation | Classe de contrat |
| --- | --- | --- |
| `php artisan workflow:v2:doctor --strict` | Capacités backend avant trafic v2 ou mise à jour | Bloquant |
| `GET /waterline/api/v2/health` | Disponibilité de la source moteur et contrôles v2 | Bloquant pour `status = error`, indicatif pour `status = warning` |
| `GET /waterline/api/stats` | Totaux durables, retards, réparation, dérive et compatibilité | Indication et benchmark |
| `php artisan workflow:v2:rebuild-projections ...` | Prévisualiser et réparer les projections | Maintenance |
| `php artisan workflow:v2:backfill-command-contracts ...` | Prévisualiser et compléter les anciens contrats | Maintenance |
| `php artisan workflow:v2:history-export ...` et routes Waterline d’export | Relecture, transfert d’archives et preuves d’incident | Vérification |
| Actions d’archive Waterline et `archive()` du plan de contrôle | Cycle de vie des runs fermés | Cycle de vie |
| Métriques, traces et journaux des SDK workers | Latence avant démarrage, polls, cache et télémétrie applicative | Télémétrie runtime |

Le runtime propriétaire du run fait autorité sur son état durable. Waterline projette ce contrat depuis le package intégré ou depuis Server via le SDK PHP. La télémétrie des workers reste la référence pour leur latence et leur comportement de processus.

### Interfaces selon le déploiement {#surface-mapping-by-deployment-shape}

Les routes Waterline ci-dessus existent dans les deux modes. Le mode intégré lit l’état de l’application Laravel dans le processus. Le mode service utilise l’image Waterline publiée et lit un namespace Server par le SDK PHP. API Server authentifiée et CLI `dw` restent directement disponibles avec ou sans Waterline :

| Question opérateur | Waterline intégré ou service | Interface native Server |
| --- | --- | --- |
| Disponibilité moteur et gravité de santé | `GET /waterline/api/v2/health` | `GET /api/system/health` avec admin et contrôle v2 ; `dw server:health` pour la vie du processus ; `dw server:info` pour topologie, protocole et sûreté |
| Totaux, retard, réparation, compatibilité et dérive | `GET /waterline/api/stats` | `GET /api/system/operator-metrics`, `dw system:operator-metrics` |
| Détail d’un run et export | `GET /waterline/api/instances/...`, `/waterline/api/.../history-export` | `GET /api/workflows/{workflowId}`, `/runs/{runId}`, `/runs/{runId}/history/export`. Voir [API Server](./polyglot/server-api-reference.md) |
| Annuler, terminer, réparer, archiver, signaler, mettre à jour, interroger | `POST /waterline/api/instances/.../{cancel\|terminate\|repair\|archive}` et routes signal/update/query | `POST /api/workflows/{workflowId}/{cancel\|terminate\|repair\|archive}`, `POST /api/system/repair/pass` |
| Topologie et identité de nœud | Intégré : `php artisan workflow:v2:doctor --json`, objet `topology`. Service : interface du Server connecté | `GET /api/cluster/info`, `GET /api/health`, `GET /api/ready`, `dw server:info` |

Les familles de champs et noms de contrat restent identiques quelle que soit l’interface. Un déploiement Waterline est limité à son runtime et namespace configurés ; il ne fusionne pas les runs intégrés et ceux de Server.

## État daté des preuves 2.0 {#dated-20-evidence-snapshot}

Cet état distingue les comportements mesurés sur des artefacts publiés des procédures prises en charge que chaque opérateur doit répéter dans son environnement. Une ligne réussie s’applique au scénario et à la topologie 2.0 décrits, sans garantie générale pour d’autres supports ou des déploiements plus grands.

Les preuves actuelles sont :

| Preuve et date UTC | Mesure directe | Limite |
| --- | --- | --- |
| Basculement monorégion, 2026-07-28 | Fin sur un autre nœud, perte d’une API, interruption/reprise MySQL, perte Redis et repli en base, perte/reprise de bail worker, redémarrage singleton. Assertions de perte et doublon réussies à chaque phase | Deux API sous un point commun, un MySQL, un Redis d’accélération, un worker de file et un planificateur/maintenance dans une région. Interruptions de conteneurs, pas promotion de fournisseur géré |
| Matrice de redémarrage timer, 2026-07-28 | Workflows en sommeil terminés après redémarrages worker et Server, un timer planifié/déclenché par run, aucune commande rejouée en double | Timers et relecture sur topologie testée, pas état arbitraire de processus ni effets externes |
| Matrice runtime activité, 2026-07-29 | Résultat récupéré après redémarrage, reprises/délais, heartbeat/annulation, résultat durable et fin idempotente sur les interfaces requises | Moteur d’activité. L’application garde l’idempotence des effets externes |
| Matrice cycle de vie workflow, 2026-07-29 | Fin/échec, démarrages doubles et réutilisation d’identifiants, délais/reprises, historique continu, absence de doublons d’effets sur PHP, Python, Rust, CLI, API, historique et Waterline | Correction des scénarios exercés, pas disponibilité ni débit |

Consultez le [contrat de compatibilité](./compatibility.md) pour les branches prises en charge. Répétez la récupération documentée sur votre déploiement avant d’affirmer un basculement propre à sa topologie.

### Preuve mesurée et procédure prise en charge {#measured-guarantee-vs-supported-procedure}

| Panne ou résultat | Preuve directe datée | Procédure prise en charge | Non établi |
| --- | --- | --- | --- |
| Perte d’une API | Une des deux API tuée, nœud survivant atteint par le point commun, état acquitté conservé, run terminé | Retirer via `/api/ready`, réessayer les requêtes interrompues, vérifier topologie et workers avant retour | Perte totale, isolement de zone ou partitions arbitraires |
| Interruption de base | Deux API non prêtes, état conservé, bail expiré repris par remplacement, run terminé et doublon refusé | Restaurer d’abord la base inscriptible, attendre la disponibilité, exclure ancien propriétaire, vérifier un run, puis reprendre. Promotion gérée : preuves natives de fencing, RPO et durée | Promotion de base gérée, écritures acquittées en double autorité ou RPO/RTO au-delà de l’interruption locale |
| Interruption Redis | Avertissement d’accélération avec polling en base correct, même poll sans bail doublon, santé rétablie après retour | Redis reste accélération ; accepter l’avertissement, restaurer après persistance et vérifier latence de découverte | Deux primaires Redis, cache sous partition ou temps de promotion fournisseur |
| Perte/redémarrage worker | Reprise et fin d’un bail workflow ; matrice activité : récupération durable et fin idempotente | Expiration ou drainage, remplacement compatible, enregistrement et collecte, effets idempotents | État local non durable ou effet externe exactement une fois |
| Redémarrage Server/planificateur | Timers en sommeil terminés sans doublon ; progrès malgré perte d’une API et redémarrage singleton | Restaurer persistance, rôles prêts, confirmer un seul planificateur/maintenance, puis worker et résultat | Perte simultanée de tous les nœuds et stockage, multirégion ou planificateurs doublés en régime stable |
| Livraison doublon | Une fin logique et doublon HTTP `409` après récupération base/perte worker ; même bail pendant dégradation Redis ; cellule activité idempotente réussie | Identités stables de requête/tâche, refus de tentative périmée respecté, activités idempotentes | Garantie exactement une fois hors du moteur durable |
| État terminal | Scénarios inter-nœud/perte API/base/worker à l’état `completed` ; matrice cycle de vie fin/échec/annulation/terminaison/délai/reprise réussie | Vérifier run choisi et historique/export avant archivage ou fin de récupération | Charges, intégrations ou combinaisons non exercées |

### Plus grand scénario de charge actuel {#largest-current-load-cell}

Le plus grand scénario de charge configuré démarre **1 000 workflows** avec **8** démarrages simultanés et **8** workers pollant pendant 120 secondes. Il exige un taux de démarrage terminé d’au moins 98 % et vérifie disponibilité des points d’accès, libération des clés de cache, couverture des échantillons et limites de ressources.

Il s’agit d’un bref **test de correction**, pas d’une mesure soutenue de production. Il n’établit aucune garantie universelle de débit, latence, mémoire ou concurrence. Établissez ces valeurs par un dossier de benchmark et d’endurance pour votre topologie, mélange de workers, base, cache et version exacts.

### Exclusions explicites {#explicitly-out-of-scope}

Les preuves 2.0 ne couvrent pas :

- Partitions réseau
- Dérive d’horloge délibérée
- Exploitation multirégion
- Fonctionnement à doubles autorités concurrentes

Ces expériences ne sont pas des prérequis de publication 2.0. Elles sont nécessaires avant toute affirmation correspondante sur partitions, dérive d’horloge, multirégion ou doubles autorités. Le périmètre 2.0 reste la topologie publiée, son dossier de récupération et les scénarios mesurés. Les scénarios de chaos non pris en charge ne prouvent pas l’inutilisabilité des procédures monorégion documentées.

## Topologies prises en charge {#supported-topologies}

Durable Workflow v2 prend en charge les formes suivantes. Les noms de la première colonne correspondent à `topology.current_shape` dans `/api/cluster/info` et au manifeste [Topologie des rôles Server](./polyglot/server-role-topology.md), pour aligner contrat d’exploitation et découverte automatisée.

| Forme (`topology.current_shape`) | Contrat pris en charge | Domaines de panne | Récupération attendue |
| --- | --- | --- | --- |
| `embedded`, un nœud | Waterline, contrôle, santé, reconstruction, export et archivage dans une application avec une base et un cache | Processus Laravel, base et cache d’un hôte | Perte hôte/base : interruption totale. Restaurer données, une application prête, puis workers avant trafic |
| `embedded`, petit cluster monorégion | Base/cache de réveil communs, configuration/compatibilité identiques, même centre ou région pour borner réveils de tâches/timers | Base et cache partagés, répartiteur, singleton planificateur/maintenance | Perte application réduit capacité ; base bloque le durable ; Redis seul avertit et ralentit mais polling reste correct. Basculement du planificateur et mises à jour sont explicites, pas une promesse HA automatique |
| Distribution `standalone_server` | Matrice du [déploiement auto-hébergé](./deployment.md), mêmes distinctions via `/api/system/...`, `/api/workflows/...` ou Waterline séparé | Base, Redis, API, workers, observateur Waterline facultatif, singleton | API et Waterline remplaçables ; ordre dicté par persistance, Redis et singleton. Restaurer puis vérifier `/api/ready`, `/api/cluster/info`, workers avant trafic |
| `split_control_execution` | Même contrat, rôles isolés : `ingress_node`, `control_plane_node`, `scheduler_node`, `matching_node`, `execution_node`. Diriger les lectures vers le bon rôle | [Topologie des rôles](./polyglot/server-role-topology.md), base/Redis et élection singleton communs | Même ordre, vérifier `topology.current_shape`, `topology.current_process_class`, `topology.current_roles` par nœud ; mauvaise classe : `503 topology_role_unavailable` |

`split_control_execution` conserve le même produit et moteur que `standalone_server`, avec les classes de processus de `topology.shape_assignments`. Sauf indication d’un rôle précis, le reste du guide s’applique aux deux formes. [Topologie des rôles Server](./polyglot/server-role-topology.md) décrit vocabulaire, autorité et migration.

Waterline en mode service est un observateur. L’ajouter ou le retirer ne change ni `topology.current_shape`, ni l’API/CLI native, ni le runtime propriétaire d’un run.

Publiez l’ordre de restauration, la cadence de sauvegarde, le délai de basculement attendu et les contraintes régionales dans votre guide d’exploitation. Le contrat produit indique quoi mesurer ; votre contrat de déploiement précise délais, étapes manuelles et domaines de panne acceptés.

### Domaines de panne par topologie {#failure-domain-checklist-by-supported-shape}

Utilisez le tableau comme résumé, puis rédigez votre guide à partir de ces modèles de perte plus précis :

- **Laravel intégré mononœud** : un seul processus possède contrôle, attribution, projections, planificateur et exécution. Sa perte interrompt commandes, progrès, schedules et lectures opérateur jusqu’au retour de la même application prête sur un stockage intact.
- **Laravel intégré en petit cluster monorégion** : la perte d’un nœud retire une partie de la capacité HTTP/worker, tandis que les autres continuent de réclamer le travail durable partagé. Les frontières principales sont base partagée, cache de réveil commun et détenteur courant du planificateur ou de la maintenance singleton.
- **Server autonome (`standalone_server`)** : la perte d’un `server_http_node` arrête ingress et commandes seulement sur ce nœud. Les workers peuvent terminer leurs baux et d’autres API servir. La perte d’un `worker_node` augmente retards ou avertissements seulement dans les périmètres `(connection, queue, compatibility)` touchés. La perte du `scheduler_node` suspend nouveaux schedules et maintenance sans invalider les workflows actifs. Perdre la base affecte toute la flotte. Perdre Redis dégrade `long_poll_wake_acceleration` et augmente la découverte, mais conserve le polling durable en base.
- **Server à rôles séparés (`split_control_execution`)** : `ingress_node`, `control_plane_node`, `scheduler_node`, `matching_node`, `execution_node` portent chacun un rôle. La perte d’ingress arrête le trafic externe ; le contrôle refuse rapidement les commandes tandis que les baux continuent ; l’attribution revient à la découverte directe ; le planificateur suspend les déclenchements et note les manqués ; l’exécution laisse s’accumuler les tâches prêtes sans perte durable. La base reste une panne globale. Redis n’est qu’une accélération, avec le même repli en base et avertissement de disponibilité.

Si votre déploiement repose sur d’autres hypothèses, documentez et validez son propre contrat plutôt que de supposer que ce guide s’applique sans changement.

### Dossier de récupération par topologie {#published-recovery-packet-by-topology}

Ces topologies ne sont prêtes pour la production que si le guide de déploiement fournit leur dossier de récupération :

| Topologie | À publier par l’opérateur |
| --- | --- |
| `embedded`, mononœud | Planning de sauvegarde, préservation du cache, révision exacte et configuration de restauration, retard maximal accepté, dernière preuve de restauration |
| `embedded`, petit cluster monorégion | Dossier mononœud, détenteur du planificateur/maintenance, impact perte nœud vs base/cache partagés, étapes de rétablissement des réveils |
| `standalone_server` | Sauvegardes base/Redis, image/digest fixé, emplacement d’authentification, comportement de `server_http_node`, `worker_node`, `scheduler_node`, dernières preuves `/api/ready`, `/api/cluster/info` et réenregistrement worker |
| `split_control_execution` | Dossier Server plus dimensionnement/échec par `ingress_node`, `control_plane_node`, `scheduler_node`, `matching_node`, `execution_node` et reroutage après `503 topology_role_unavailable` |

Sans dossier actuel et testé, considérez la topologie comme un environnement de développement, quel que soit le nombre de nœuds.

### Vérifier la topologie réelle avant la référence {#verify-live-topology-identity-before-trusting-the-baseline}

Pour Server autonome et à rôles séparés, vérifiez l’identité rapportée par le produit avant d’interpréter file, planificateur ou panne de rôle. `GET /api/cluster/info` fait autorité :

| Champ | Utilité |
| --- | --- |
| `topology.current_shape` | Forme annoncée : `embedded`, `standalone_server` ou `split_control_execution` |
| `topology.current_roles` | Rôles réellement hébergés |
| `topology.supported_shapes` | Formes publiquement prises en charge par ce build |
| `topology.shape_assignments` | Classes et ensembles de rôles autorisés pour comparer au nœud actuel |

Commencez par ces champs pour détecter une dérive lors d’une mise à jour :

- En Server autonome, l’API doit annoncer `api_ingress`, `control_plane`, `matching`, `history_projection` ; le planificateur `scheduler` ; les workers `execution_plane`.
- Avec les rôles séparés, vérifiez `current_roles` contre les ensembles autorisés de `shape_assignments` avant d’attribuer un retard au worker.
- Si les rôles diffèrent du plan, ne faites pas confiance aux références de file et basculement avant correction de l’identité.

Les installations intégrées ne publient pas `/api/cluster/info`. Exécutez `php artisan workflow:v2:doctor --json` et inspectez `topology`. Le schéma est le même et inclut `current_shape`, `current_process_class`, `current_roles`, `execution_mode` et le résumé `matching_role` de l’application.

## Diagnostics bloquants et indicatifs {#blocking-and-advisory-diagnostics}

Durable Workflow v2 distingue les diagnostics bloquants des indications.

| Gravité | Sens | Action habituelle |
| --- | --- | --- |
| Bloquant | Configuration ou disponibilité non sûre pour trafic v2 | Arrêter la mise à jour, corriger puis vérifier |
| Indicatif | Interface lisible mais faits dérivés à reconstruire, compléter ou examiner | Servir si approprié, puis réparer l’interface nommée |
| Sain | Aucun problème actuel détecté | Poursuivre normalement |

Appliquez cette règle aux interfaces livrées :

- `workflow:v2:doctor --strict` bloque sur une incapacité backend de niveau `error`, par exemple pilote de file non pris en charge en mode queue ou cache sans verrous. Les diagnostics informatifs de file en mode poll restent indicatifs.
- `GET /waterline/api/v2/health` renvoie `status = ok` si l’interface et les contrôles sont prêts ; `status = warning` si elle reste lisible mais nécessite reconstruction, rattrapage ou réparation ; `status = error` et HTTP `503` si le pont moteur n’est pas prêt ou qu’une incapacité bloquante rend l’interface indisponible.
- `GET /waterline/api/stats` publie des faits durables pour tableaux de bord et scripts, pas un point de collecte de métriques.

## Correction et accélération {#correctness-vs-acceleration-checks}

Chaque contrôle v2 porte `category` égal à `correctness` ou `acceleration`. L’instantané agrège chaque catégorie pour répondre séparément sans recalculer la liste.

- **Correction** : vérifie découverte durable, fraîcheur des projections, contrats rattrapés, rétention, compatibilité worker et capacités backend. Un `status = error` menace attribution sûre ou état fiable ; arrêtez la mise à jour jusqu’à résolution.
- **Accélération** : vérifie les signaux facultatifs de réveil. Les pollers durables restent le chemin de correction. `status = warning` peut augmenter la latence inter-nœuds sans bloquer les tâches.

Chaque entrée de `checks` porte sa `category` et `categories` fournit le résumé pour les tableaux de bord :

```json
{
  "status": "warning",
  "categories": {
    "correctness": {"status": "ok", "check_count": 8},
    "acceleration": {"status": "warning", "check_count": 1}
  }
}
```

Une dégradation `acceleration` concerne seulement l’accélération : examinez cache et réveils sans bloquer le trafic qui dépend de la découverte durable. La dégradation de `correctness` est le signal bloquant. `long_poll_wake_acceleration` est le contrôle d’accélération canonique, jamais supérieur à `warning`. Tous les autres contrôles sont de correction.

## Signification de la santé des files {#queue-health-semantics}

La santé des files sépare état durable et télémétrie des workers/runtimes.

### État durable des files {#durable-queue-facts}

Utilisez statistiques et vues de file Waterline pour l’état durable :

| Fait | Sens |
| --- | --- |
| `operator_metrics.backlog.runnable_tasks` | Tâches durables prêtes à être réclamées |
| `operator_metrics.backlog.delayed_tasks` | Tâches existantes attendant encore `available_at` |
| `operator_metrics.backlog.leased_tasks` | Tâches actuellement réclamées |
| `operator_metrics.backlog.tasks_added_last_minute` | Lignes distinctes créées pendant les 60 dernières secondes : entrée durable, pas tentatives de transport |
| `operator_metrics.backlog.tasks_dispatched_last_minute` | Lignes distinctes dont le dernier `last_dispatched_at` réussi date des 60 dernières secondes. Comparer à `tasks_added_last_minute` |
| `operator_metrics.starts.pending_runs`, `operator_metrics.starts.pending_commands`, `operator_metrics.starts.ready_tasks`, `operator_metrics.starts.oldest_pending_start_at`, `operator_metrics.starts.max_pending_ms` | Retard de démarrage accepté avant travail workflow actif, distinct du retard worker |
| `operator_metrics.tasks.oldest_ready_due_at`, `operator_metrics.tasks.max_ready_due_age_ms` | Plus ancienne tâche actionnable et son âge de disponibilité |
| `operator_metrics.tasks.dispatch_overdue`, `operator_metrics.tasks.oldest_dispatch_overdue_since`, `operator_metrics.tasks.max_dispatch_overdue_age_ms` | Tâches prêtes sans réveil de distribution réussi et âge maximal ; distingue accélération dégradée et croissance normale |
| `operator_metrics.backlog.unhealthy_tasks` | Échecs de distribution/attribution, retard de distribution ou bail expiré |
| `operator_metrics.backlog.repair_needed_runs` | Runs ouverts sans chemin durable fiable de reprise |
| `operator_metrics.tasks.oldest_lease_expired_at`, `operator_metrics.tasks.max_lease_expired_age_ms` | Bail expiré le plus ancien et âge, indicateur de blocage et risque de doublon |
| `operator_metrics.backlog.oldest_compatibility_blocked_started_at`, `operator_metrics.backlog.max_compatibility_blocked_age_ms` | Blocage de compatibilité le plus ancien et âge : travail conservé sans worker éligible |
| Pollers actifs ou périmés | Workers encore vivants par heartbeat sur une file |
| Baux actuels | Tâches workflow/activité réclamées et état d’expiration |

Ces faits ne décrivent que les tâches durables de workflow et d’activité.

Pour le détail par file, les routes Server fournissent âge du retard, pollers, baux, admission, `stats.tasks_added_last_minute` et `stats.tasks_dispatched_last_minute`. Comparez entrée et distribution pour trouver la file accumulée ou sans capacité. La paire `operator_metrics.backlog.*` sert au total de flotte.

`GET /waterline/api/v2/health` expose ce détail sous `queue_visibility.*` pour le namespace configuré. Ces familles sont le contrat typé de santé des files :

| Famille de champs | Sens |
| --- | --- |
| `queue_visibility.available`, `queue_visibility.reason` | Visibilité par file disponible pour ce namespace ou motif d’absence |
| `queue_visibility.task_queues[].stats.approximate_backlog_count`, `queue_visibility.task_queues[].stats.approximate_backlog_age` | Nombre de tâches en retard et âge durable maximal par file |
| `queue_visibility.task_queues[].stats.tasks_added_last_minute`, `queue_visibility.task_queues[].stats.tasks_dispatched_last_minute` | Entrée et distribution sur 60 secondes, même si le total flotte masque une file chaude |
| `queue_visibility.task_queues[].stats.pollers.active_count`, `queue_visibility.task_queues[].stats.pollers.stale_count`, `queue_visibility.task_queues[].stats.pollers.stale_after_seconds` | Pollers sains/périmés et seuil de heartbeat utilisé |
| `queue_visibility.task_queues[].stats.workflow_tasks.*`, `queue_visibility.task_queues[].stats.activity_tasks.*` | Tâches prêtes, réclamées et baux expirés par famille |
| `queue_visibility.task_queues[].repair.candidates`, `dispatch_failed`, `expired_leases`, `dispatch_overdue` | Tâches à réparer, distribution échouée, baux expirés et redistribution en retard |
| `queue_visibility.task_queues[].repair.oldest_dispatch_failed_at`, `max_dispatch_failed_age_ms`, `oldest_lease_expired_at`, `max_lease_expired_age_ms`, `oldest_dispatch_overdue_since`, `max_dispatch_overdue_age_ms` | Horodatages et âges maximaux des échecs, expirations et retards de cette file |

`coordination_alerts[]` dans la même réponse résume ces faits par file et les contrôles. Utilisez-le pour les avertissements et erreurs à afficher, puis examinez `queue_visibility` ou `checks` pour les preuves.

L’admission par file fait autorité sur emplacements et pollers. `saturated` signifie workers actifs mais tous les emplacements occupés ; `throttled`, plafond volontaire de baux ou débit ; `no_slots`, workers enregistrés mais aucune capacité annoncée pour ce type ; `no_active_workers`, aucun poller sain ; `unavailable`, verrou d’admission configuré incapable de prouver la sûreté.

Utilisez `operator_metrics.starts.*` pour les démarrages bloqués malgré un retard normal en régime établi. Ces faits séparent admission et création de première tâche de la prise en charge ultérieure par les workers.

### Pression des pollers et budgets d’admission {#poller-pressure-and-admission-budgets}

Utilisez les détails de file ou `dw task-queue:describe` pour distinguer capacité insuffisante, limitation volontaire de Server et absence de poller actif :

| État | Sens | Traitement |
| --- | --- | --- |
| `accepting` | Emplacements disponibles, aucun plafond serveur plein | Référence saine |
| `saturated` | Tous les emplacements enregistrés sont réclamés | Pression de capacité worker |
| `throttled` | Plafond volontaire de baux actifs ou distribution | Indicatif, sauf plafond inattendu ou retard dépassant durablement la référence |
| `no_slots` | Workers actifs sans emplacements pour ce type | Bloquant pour cette file |
| `no_active_workers` | Aucun poller sain | Bloquant pour cette file |
| `unavailable` | Verrou requis par l’admission impossible à obtenir | Bloquant jusqu’au retour de la dépendance |

Combinez ces états avec les débits :

- `tasks_added_last_minute > tasks_dispatched_last_minute` avec `saturated` : l’entrée durable dépasse la capacité worker.
- Le même déséquilibre avec `throttled` : un plafond serveur retient volontairement la file ; comparez au contrat prévu, pas au débit sans limites.
- L’âge croissant de la tâche prête la plus ancienne avec `no_active_workers` ou des pollers périmés indique une panne de routage dans ce périmètre.

### Déploiement du rôle d’attribution {#matching-role-deployment-shape}

`operator_metrics.matching_role.*` confirme le contrat d’attribution réellement servi par ce nœud :

| Fait | Sens |
| --- | --- |
| `operator_metrics.matching_role.queue_wake_enabled` | Ce nœud exécute-t-il le réveil général dans la boucle worker ? |
| `operator_metrics.matching_role.shape` | `in_worker` pour réveil local, `dedicated` pour `workflow:v2:repair-pass --loop` séparé |
| `operator_metrics.matching_role.task_dispatch_mode` | Mode actif des tâches prêtes : `queue` ou `poll` |
| `operator_metrics.matching_role.partition_primitives` | Axes figés et ordonnés : `connection`, `queue`, `compatibility`, `namespace` |
| `operator_metrics.matching_role.backpressure_model` | Frontière durable d’admission, actuellement `lease_ownership` |

Ces champs sont locaux au nœud. Lors d’une transition de formes, interrogez chaque nœud ou pod pour vérifier que le rôle d’attribution a bien été déplacé avant d’attribuer les changements de file aux workers.

### Télémétrie worker et SDK {#worker-and-sdk-telemetry}

Utilisez métriques, traces et journaux worker pour :

- Latence `schedule_to_start` des workflows et activités
- Succès des polls et distribution synchrone ou immédiate
- Taille et évictions du cache sticky
- Pression CPU, mémoire, threads et boucle d’événements
- Métriques applicatives émises par activités ou workers

Étiquetez séparément requêtes synchrones, débogage en direct et autres commandes non durables. Elles ne comptent pas dans le retard durable et ne changent pas les compteurs de réparation Waterline.

## Compatibilité des workers et état des mises à jour {#worker-compatibility-and-rollout-health}

`operator_metrics.workers` publie la compatibilité permettant à la flotte active de traiter le contrat requis en sécurité :

| Fait | Sens |
| --- | --- |
| `operator_metrics.workers.required_compatibility` | Marqueurs requis dans le namespace |
| `operator_metrics.workers.active_workers` | Workers distincts actifs par heartbeat de compatibilité |
| `operator_metrics.workers.active_worker_scopes` | Périmètres `(connection, queue)` couverts |
| `operator_metrics.workers.active_workers_supporting_required` | Workers dont la compatibilité couvre les marqueurs requis |
| `operator_metrics.workers.fleet` | Liste par périmètre : `worker_id`, `connection`, `queue`, marqueurs `supported`, `supports_required`, `source` du heartbeat (`database` ou `cache`) et `recorded_at` |

Les totaux détectent les phases de mise à jour où certains workers ne peuvent pas réclamer le travail. Le détail `fleet` identifie le périmètre `(connection, queue)` non couvert. Waterline affiche la même liste dans le panneau de compatibilité, sans requête manuelle.

Si `active_workers_supporting_required` tombe à zéro, Waterline signale `no_compatible_worker_for_task` sur les runs touchés. Le contrôle `worker_compatibility` émet aussi `warning` en catégorie `correctness`, dont l’agrégat passe à `warning` pour rendre le manque visible.

Voir [Déployer les builds worker avec Build IDs](./polyglot/worker-build-id-rollout.md) pour drainage et reprise, et [Compatibilité et routage](./polyglot/worker-compatibility-routing.md) pour les règles d’épinglage.

## Signification des alertes {#alert-semantics}

Les seuils d’alerte dépendent du déploiement. Publiez vos valeurs d’âge de file, retard de réparation, couverture worker et restauration. Alertez lorsque le contrat reste enfreint plus d’une fenêtre normale de réparation ou watchdog.

| Alerte | Source | Gravité | Escalade | Réponse |
| --- | --- | --- | --- | --- |
| Disponibilité bloquée | `workflow:v2:doctor --strict`, `GET /waterline/api/v2/health` | Bloquant | Erreur de `doctor --strict`, `status = error` ou HTTP `503` | Arrêter mise à jour/bascule, corriger, vérifier disponibilité et compatibilité |
| Couverture compatible | `operator_metrics.workers.*`, `worker_compatibility`, `no_compatible_worker_for_task` | Bloquant | `active_workers_supporting_required = 0` pour namespace ou `(connection, queue)` requis | Retirer incompatibles, enregistrer compatibles, vérifier l’agrégat `correctness` |
| Retard durable | Files Waterline, `operator_metrics.backlog.*`, `schedule_to_start` worker | Bloquant si soutenu, indicatif si bref | Âge prêt ou latence au-dessus de la référence malgré workers compatibles | Ajouter capacité, inspecter admission et progrès du planificateur/attribution |
| Pollers et saturation | Détail file, `dw task-queue:describe`, `status`, pollers périmés, entrée/distribution | Bloquant pour `no_active_workers`, `no_slots`, `unavailable` ; indicatif pour `throttled` volontaire | `saturated` avec âge et écart de débit croissants, ou états bloquants hors maintenance | Ajouter emplacements, restaurer cohorte, vérifier plafond/verrou avant de dimensionner |
| Retard de démarrage | `operator_metrics.starts.*`, télémétrie contrôle et première tâche | Bloquant si soutenu | `pending_commands`, `ready_tasks`, `max_pending_ms` trop élevés malgré capacité | Vérifier commande vers tâche, création rapide, attribution ; séparer dette de démarrage et retard worker |
| Dérive/réparation | `run_summary_projection`, `selected_run_projections`, `operator_metrics.repair.*` | Indicatif | Avertissement après une fenêtre de reconstruction ou âge croissant | Prévisualiser, réparer puis confirmer retour à la référence |
| Tempête d’échecs/reprises | `operator_metrics.backlog.unhealthy_tasks`, diagnostics durables, erreurs worker | Indicatif, bloquant si progrès empêché | Échecs de distribution/attribution, baux expirés ou tentatives épuisées durablement élevés | Identifier famille, croiser télémétrie et état durable, retirer trafic ou isoler file |
| Accélération de réveil | `long_poll_wake_acceleration`, agrégat `acceleration` | Indicatif | Avertissement persistant hors maintenance cache/notificateur | Examiner cache/réveils ; pas une panne de correction sans dégradation `correctness` |

Les alertes doivent viser les risques durables du contrat. Les variations brèves ne doivent devenir bloquantes que si elles menacent le contrat de votre topologie.

## Reconstruction, réparation et restauration {#rebuild-repair-and-restore-expectations}

Si l’interface signale une dérive, procédez dans cet ordre :

1. Vérifiez `GET /waterline/api/v2/health`.
   - `run_summary_projection` et `selected_run_projections` indiquent des faits de liste ou détail à reconstruire, avec Waterline toujours disponible.
   - `command_contract_snapshots` indique des contrats WorkflowStarted anciens à compléter avant de faire confiance aux formulaires déclarés de signal, mise à jour et requête.
   - `durable_resume_paths` demande une réparation des runs ouverts avant de faire confiance à leur prochaine source de reprise projetée.
2. Prévisualisez les projections :

   ```bash
   php artisan workflow:v2:rebuild-projections --needs-rebuild --dry-run
   ```

3. Reconstruisez les projections concernées :

   ```bash
   php artisan workflow:v2:rebuild-projections --needs-rebuild
   ```

4. Prévisualisez le rattrapage des contrats de commande :

   ```bash
   php artisan workflow:v2:backfill-command-contracts --dry-run
   ```

5. Complétez les contrats lorsque la classe actuelle du workflow est encore disponible :

   ```bash
   php artisan workflow:v2:backfill-command-contracts
   ```

6. Utilisez `--prune-stale` uniquement après une suppression durable intentionnelle par votre politique de rétention, afin de retirer les projections dont le run ou la ligne d’historique n’existe plus.

`operator_metrics.repair.*` mesure les passages de réparation. Utilisez nombres de candidats et sélectionnés, âge maximal et pression de limite pour décider si le coût reste dans votre référence ou nécessite une analyse de capacité.

### Conservation et dérive des projections {#retention-and-projection-drift}

Depuis Workflow 2.6.3, un run conservé marqué `details_pruned_at` n’est pas compté comme résumé manquant, dette de reconstruction ou âge de résumé absent. Il reste inclus dans le total `runs`. Tous les modes de reconstruction l’ignorent, même la sélection explicite du run ou de l’instance. Une réparation ne recrée donc pas sa ligne de liste et ne le rend pas de nouveau sélectionnable par la rétention.

Un run non marqué sans résumé signale toujours une dérive. Un historique vide ne prouve pas un ancien nettoyage. Confirmez la suppression par un enregistrement de rétention faisant autorité avant de choisir la correction. La reconstruction ne récupère pas l’historique supprimé ; utilisez une sauvegarde appropriée.

Les anciennes versions peuvent signaler à tort ces runs comme résumés manquants. Mettez le runtime à jour avant de reconstruire pour cet avertissement. Après nettoyage, vérifiez `run_summary_projection = ok`, que `projections.run_summaries.needs_rebuild` vaut zéro et l’absence de nouvelle sélection des mêmes runs. Une véritable perte de projection nécessite toujours réparation.

## Vérifier exports et archives {#export-and-archive-verification}

Export et archivage ont des buts différents :

- **Exporter l’historique** crée un artefact de relecture, débogage ou archivage.
- **Archiver** marque un run fermé pour le retirer des vues actives.
- **Nettoyer** supprime projections ou lignes durables après expiration certaine de la rétention.

Utilisez cette séquence de vérification :

1. Exportez le run choisi :

   ```bash
   php artisan workflow:v2:history-export <workflow-instance-id> --run-id=<workflow-run-id> --output=storage/app/workflow-history/run.json --pretty
   ```

2. Vérifiez identifiant de run, version du schéma et éventuelles métadonnées d’occultation dans le bundle.
3. Vérifiez les objets externes et conservez-les pendant la durée requise. Suivez l’[export avant suppression](./configuration/pruning-workflows.md#export-before-pruning) pour inventorier tous les runs fermés et détecter les copies manquantes.
4. Archivez seulement pour garder le run en base. Server ignore les archives et n’a pas d’API de désarchivage. Le nettoyage intégré appartient à l’application et n’exige pas d’archivage préalable.
5. Supprimez les détails éligibles par le processus de rétention propriétaire. Gardez les traces de run et d’instance. Une reconstruction ne restaure pas l’historique, et les runs marqués nettoyés sont exclus.

Les routes correspondantes figurent dans la [référence API opérateur Waterline](./waterline-operator-api.md).

Les contrôles de somme et de structure ne prouvent pas qu’un export contient tous les événements d’origine ou des octets externes indépendants. Refusez les sources déjà nettoyées : le faux indicateur d’export complet reste un défaut ouvert dans [Workflow #856](https://github.com/durable-workflow/workflow/issues/856). Cette procédure manuelle ne fournit pas non plus l’opération d’archive autonome vérifiée demandée dans [Server #520](https://github.com/durable-workflow/server/issues/520). Distinguez ces lacunes du produit des contrôles de récupération réellement réussis par votre déploiement.

## Contrat de sauvegarde et de récupération {#backup-restore-and-disaster-recovery-contract}

Sauvegarde, restauration et récupération après sinistre font partie du contrat d’exploitation. Publiez et répétez pour chaque topologie :

1. L’ensemble durable : sauvegarde de base, référence d’image Server ou application, environnement/configuration, emplacement des secrets et notes exactes de topologie/raccordement des workers.
2. Les objectifs : retard maximal de restauration accepté, délai de basculement et personne autorisée à déclarer le trafic sûr.
3. L’ordre : persistance durable, cache, initialisation/migrations, rôle singleton de planificateur/maintenance, disponibilité API, enregistrement worker.
4. Les vérifications : `/api/ready` ou `/waterline/api/v2/health`, `/api/cluster/info` si applicable, un enregistrement worker et un export représentatifs de l’état restauré.
5. La réparation : projections, contrats si nécessaire, puis retour des métriques de file, compatibilité et réparation à la référence avant de déclarer la santé.

Multirégion et doubles autorités restent hors du contrat 2.0. Le [guide auto-hébergé](/docs/deployment#activepassive-multi-region) conserve l’architecture actif/passif pour évaluation accompagnée, sans garantir réplication, basculement, retour, RPO ou RTO autonomes. Le [contrat Cloud](/docs/polyglot/cloud-control-plane) exploite également chaque namespace dans une seule région et ne promet pas de réplication ou basculement interrégional.

La cadence des exercices de restauration fait aussi partie du contrat public. Répétez au minimum la procédure :

- Avant le premier déploiement de production d’une topologie
- Après changement des sauvegardes, schéma/initialisation, authentification ou topologie
- À une cadence récurrente publiée avec le planning de sauvegarde

Sans date du dernier exercice réussi, durée de restauration et preuves de vérification, sauvegarde et récupération restent des affirmations non prouvées pour cette topologie.

## Périmètre des mesures de performance {#benchmark-envelope}

Durable Workflow v2 publie les dimensions à mesurer dans votre environnement. Enregistrez ces références en préproduction ou canary avant d’y faire dépendre le trafic :

| Dimension | Référence à mesurer | Source |
| --- | --- | --- |
| Projections | `needs_rebuild = 0`, durée après dérive intentionnelle, nettoyage des orphelins | `/waterline/api/v2/health`, `/waterline/api/stats`, `workflow:v2:rebuild-projections` |
| Pression des files | Âges retard/prêt, tâches actionnables/différées, entrée/distribution, retard de distribution, pollers périmés, `accepting`/`saturated`/`throttled`/`no_slots`/`no_active_workers` | Vues Waterline, `operator_metrics.backlog.*`, `operator_metrics.tasks.*` |
| Démarrages | Commandes acceptées sans première tâche, âge et prise en charge initiale | `operator_metrics.starts.*`, `schedule_to_start` |
| Avant démarrage | Attente workflow et activité entre mise en file et démarrage | Métriques SDK worker |
| Rafale de timers | Propagation des réveils, écart heure prévue/visibilité de tâche prête | Télémétrie worker et coordination monorégion |
| Réparation | Candidats, sélectionnés, âge maximal candidat/run manquant, pression de scan | `operator_metrics.repair.*` |
| Historique | Nombre, taille et seuils continue-as-new | `operator_metrics.history.*` |

Il s’agit de dimensions de mesure, pas de garanties universelles de latence. Publiez les plages acceptables de votre topologie.

## Preuves d’endurance {#long-soak-evidence}

Un instantané de performance ne suffit pas. Avant de considérer une topologie fiable sous trafic soutenu, conservez un dossier d’endurance montrant qu’elle reste dans son périmètre déclaré au fil du temps.

Incluez au minimum :

- Charge : topologie, image/révision, builds workers, files, cache, base, mélange représentatif de démarrages, timers, activités, requêtes et exports
- Durée : début et fin couvrant au moins une fenêtre normale de réparation, un passage de rétention/archive si applicable et une variation représentative du cycle métier
- Stabilité des files : âges du retard, tâches prêtes et démarrages, entrées/distribution et pollers périmés dans les références publiées
- Correction : pas de `status = error` durable de `GET /waterline/api/v2/health`, ni croissance inexpliquée de `operator_metrics.repair.*`, ni trous persistants dans `operator_metrics.workers.*`
- Processus/cache : mémoire, CPU, pression threads/boucle et croissance de cardinalité bornées sous charge stable
- Récupération : dernière sauvegarde réussie, dernier exercice, durée et commandes attestant la disponibilité restaurée

Stockez ce dossier avec le guide accessible aux mêmes opérateurs. Sans dossier d’endurance correspondant, chiffres de benchmark, seuils d’alerte et temps de récupération restent provisoires.

## Liste de vérification de bout en bout {#end-to-end-operator-checklist}

Après une mise à jour ou avant de faire confiance à un nouvel environnement :

1. Exécutez `php artisan workflow:v2:doctor --strict`.
2. Vérifiez `GET /waterline/api/v2/health` et son état `ok`, `warning` ou `error`.
3. Lisez `GET /waterline/api/stats` : retard, réparation, historique, contrats, compatibilité et dérive.
4. Prévisualisez reconstruction et contrats si la santé signale une dérive.
5. Exportez un run représentatif et vérifiez le chemin de son artefact de relecture/archive.
6. Vérifiez que les runs archivés quittent les vues actives tout en gardant leurs données jusqu’au nettoyage.
7. Répétez restauration ou basculement du guide et comparez le délai mesuré à l’attente publiée pour cette topologie.

## Guides associés {#related-guides}

- [Surveillance](./monitoring.md)
- [API opérateur Waterline](./waterline-operator-api.md)
- [Nettoyer les workflows](./configuration/pruning-workflows.md)
- [Déploiements auto-hébergés](./deployment.md)
