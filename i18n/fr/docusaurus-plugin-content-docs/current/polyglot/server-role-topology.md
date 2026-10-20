---
title: Topologie des rôles de Server
description: Interpréter le manifeste de topologie de /api/cluster/info pour les rôles du serveur Durable Workflow, les frontières de dimensionnement, les domaines de panne et les étapes de migration.
tags:
  - server
  - topology
  - deployment
  - control-plane
  - workers
keywords:
  - topologie des rôles Durable Workflow
  - topologie cluster info
  - frontières de dimensionnement du serveur
  - séparation contrôle exécution
---

# Topologie des rôles de Server {#server-role-topology}

## Raison d'être du manifeste {#why-this-manifest-exists}

`GET /api/cluster/info` publie le manifeste `topology` du serveur sous le
schéma `durable-workflow.v2.role-topology`. Considérez ce manifeste comme le
contrat public des noms de rôles, formes de déploiement prises en charge,
autorités d'écriture durable, attentes par domaine de panne, frontières de
dimensionnement et chemin ordonné de migration depuis la distribution
autonome actuelle vers une topologie séparant contrôle et exécution.

Utilisez cette page pour raisonner sur la forme du serveur depuis des scripts,
tableaux de bord, procédures d'exploitation ou automatismes de déploiement.
Consultez la [référence de l'API Server](/docs/polyglot/server-api-reference)
pour l'interface HTTP brute et le [guide Server](/docs/polyglot/server) pour
la mise en place du déploiement.

## Lire le manifeste de topologie {#reading-the-topology-manifest}

L'objet `topology` répond aux questions contractuelles suivantes :

| Famille de champs | Question à laquelle elle répond |
| --- | --- |
| `schema`, `version` | Quelle révision du contrat de topologie lisez-vous ? |
| `supported_shapes` | Quelles formes de déploiement du produit sont valides ? |
| `role_vocabulary` | Quels noms de rôles sont valides dans ce contrat ? |
| `current_shape`, `current_process_class`, `current_roles`, `execution_mode` | Que fait le nœud répondant actuellement ? |
| `matching_role.*` | Qui gère le réveil général des tâches prêtes, quels axes de routage sont figés et quel mode de distribution/contre-pression est actif ? |
| `role_catalog`, `authority_surfaces` | Quelles interfaces et surfaces de modification durable appartiennent à chaque rôle ? |
| `shape_assignments` | Quelles classes de processus sont autorisées pour chaque forme prise en charge ? |
| `authority_boundaries`, `failure_domains`, `scaling_boundaries` | Quel rôle peut écrire quoi, comment chaque rôle échoue-t-il et selon quel axe de charge se dimensionne-t-il ? |
| `supported_topologies`, `migration_path` | Quelles familles de déploiement le produit prend-il en charge, et quel chemin ordonné mène de la forme autonome à des rôles plus isolés ? |
| `kernel_invariants` | Quelles garanties du noyau durable la séparation des rôles doit-elle préserver quelle que soit la forme en cours d'exécution ? |

`current_shape`, `current_process_class` et `current_roles` décrivent le nœud
qui a répondu à la requête HTTP, pas toute la flotte. Utilisez
`current_process_class` comme identité déclarée du nœud, puis comparez
`current_roles` aux groupes de classes de processus dans `shape_assignments`
pour vérifier cette déclaration.

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/cluster/info" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  | jq '{
    current_shape: .topology.current_shape,
    current_process_class: .topology.current_process_class,
    current_roles: .topology.current_roles,
    execution_mode: .topology.execution_mode,
    matching_role: .topology.matching_role,
    scaling_boundaries: .topology.scaling_boundaries,
    migration_path: .topology.migration_path
  }'
```

## Vocabulaire des rôles {#role-vocabulary}

Les noms publics des rôles sont fixés par `topology.role_vocabulary` :

| Rôle | Responsabilité |
| --- | --- |
| `api_ingress` | Accepter le trafic HTTP externe, y compris les points d'entrée de découverte et du plan de contrôle. |
| `control_plane` | Démarrer, signaler, mettre à jour, réparer, annuler, terminer, archiver et modifier autrement l'état du cycle de vie des workflows. |
| `matching` | Découvrir le travail prêt, détenir les baux de tâches et coordonner la pression de distribution. |
| `history_projection` | Persister l'historique durable et maintenir les résumés et exports d'exécution dérivés. |
| `scheduler` | Déclencher les planifications et persister l'état de leurs exécutions. |
| `execution_plane` | Exécuter les tâches de workflow et d'activité. |

L'automatisation devrait considérer ces identifiants exacts comme le vocabulaire stable.

## Formes de déploiement prises en charge {#supported-deployment-shapes}

`topology.supported_shapes` nomme les formes de déploiement valides du produit :

| Forme | Classes de processus publiées dans `shape_assignments` | Signification contractuelle |
| --- | --- | --- |
| `embedded` | `application_process` | Un processus applicatif unique gère plan de contrôle, appariement, projection d'historique, planificateur et exécution. |
| `standalone_server` | `server_http_node`, `scheduler_node`, `worker_node` | Distribution actuelle du serveur autonome : entrée HTTP/plan de contrôle sur le nœud serveur, planificateur isolé dans sa propre classe de processus et exécution sur les nœuds worker. |
| `split_control_execution` | `ingress_node`, `control_plane_node`, `scheduler_node`, `matching_node`, `execution_node` | Même contrat produit réparti en classes de processus plus ciblées par rôle pour déplacer les frontières de dimensionnement et de panne par sous-système. |

`split_control_execution` est une topologie prise en charge, pas un second
moteur ni une autre API. La même interface de découverte décrit les formes
autonome et à rôles séparés.

## Identité du nœud actuel {#current-node-identity}

Utilisez ensemble `current_shape`, `current_process_class`, `current_roles`
et `execution_mode` :

- `current_shape` identifie le contrat de forme du nœud répondant.
- `current_process_class` identifie sa classe de processus déclarée.
- `current_roles` identifie le groupe de rôles actif sur ce nœud.
- `execution_mode` distingue `remote_worker_protocol` de
  `local_queue_worker`.

Pour la distribution du serveur autonome, `current_shape` reste
`standalone_server` même lorsque `DW_MODE=embedded` bascule l'exécution vers
des workers de file locaux. Dans ce cas, `execution_mode` devient
`local_queue_worker`, tandis que le nœud HTTP conserve le contrat de rôles du
serveur autonome.

### Contrôle d'accès aux routes hébergées {#hosted-route-gating}

Le même contrat de topologie indique aussi aux appelants quand un nœud doit
rejeter entièrement le trafic hébergé. Les routes hébergées authentifiées
refusent les requêtes sauf si le nœud répondant annonce le groupe de contrôle
HTTP actuellement requis : `api_ingress` et `control_plane`.

Les réponses d'un mauvais nœud renvoient `503` avec
`reason: "topology_role_unavailable"` et les éléments de topologie nécessaires
au reroutage :

- `current_shape`
- `current_process_class`
- `current_roles`
- `required_roles`
- `missing_roles`

Ce contrôle s'exécute avant la résolution de l'espace de noms sur les routes
hébergées. Une requête envoyée à un `scheduler_node`, `matching_node` ou
`execution_node` ne découvre donc pas l'existence de l'espace nommé avant son
reroutage vers la bonne classe de nœud. `GET /api/health`, `GET /api/ready`
et `GET /api/cluster/info` authentifié restent disponibles pour découvrir la
forme du nœud avant de réessayer ailleurs.

### Contrôle de l'initialisation des workflows {#workflow-bootstrap-gate}

Un second contrôle au niveau des routes refuse les requêtes si le nœud
répondant a des blocages non résolus d'initialisation workflow v2. Tant que
`checks.workflow_v2.status` vaut `blocked`, les routes authentifiées de
démarrage/modification de workflows, de modification de planifications,
d'adaptateurs de passerelle et du protocole worker renvoient `503` avec
`reason: "workflow_v2_blocked"` et :

- `blocked_by` : liste ordonnée des blocages préalables à la disponibilité, par exemple
  `migrations`.
- `remediation` : instruction destinée à l'opérateur pour lever ces blocages,
  reprise de `checks.workflow_v2.remediation` dans `/api/ready`.

Le contrôle d'initialisation se situe au même endroit que celui de la
topologie des routes hébergées : après validation du rôle et de la version du
protocole, avant résolution de l'espace de noms. Une requête bloquée n'observe
donc jamais son existence.

Les familles contrôlées sont les routes de workflow comme `/api/workflows`,
les modifications de planifications comme `POST /api/schedules`,
`PUT /api/schedules/{scheduleId}`, `DELETE /api/schedules/{scheduleId}`,
`/pause`, `/resume`, `/trigger` et `/backfill`, les routes d'adaptateurs de
passerelle comme `/api/bridge-adapters/webhook/{adapter}` et les routes du
protocole worker sous `/api/worker`.

Les **lectures** des planifications (`GET /api/schedules`,
`GET /api/schedules/{scheduleId}`, `GET /api/schedules/{scheduleId}/history`)
sont délibérément exemptées pour inspecter leur état pendant une reprise.
Les routes du protocole worker renvoient la même charge de contrôle
d'initialisation dans l'enveloppe worker, pour que les SDK se basent sur le
même `reason: "workflow_v2_blocked"` lisible par machine que le plan de contrôle.

## Contrat du rôle d'appariement {#matching-role-contract}

`topology.matching_role` fige le mode actif d'appariement et de réveil du nœud répondant :

| Champ | Signification |
| --- | --- |
| `queue_wake_enabled` | Indique si les signaux de réveil de file de courte durée sont actuellement activés. |
| `shape` | Forme de déploiement d'appariement annoncée par ce nœud : `in_worker` ou `dedicated`. |
| `wake_owner` | Implémentation actuellement responsable du balayage général de réveil : `worker_loop` ou `dedicated_repair_pass`. |
| `task_dispatch_mode` | Distribution par workers distants pilotés par `poll` ou exécution locale pilotée par `queue`. |
| `partition_primitives` | Axes de routage figés du rôle d'appariement, dans l'ordre : `connection`, `queue`, `compatibility`, `namespace`. |
| `backpressure_model` | Frontière d'admission durable appliquée par l'appariement. La v2 actuelle annonce `lease_ownership`. |
| `discovery_limits` | Contrat numérique figé du rôle d'appariement compilé dans le paquet workflow : `poll_batch_cap`, `availability_ceiling_seconds`, `wake_signal_ttl_seconds`, `workflow_task_lease_seconds` et `activity_task_lease_seconds`. |

Les opérateurs et automatismes peuvent ainsi distinguer « l'appariement existe
mais le réveil est dégradé » de « ce nœud utilise volontairement un autre mode
de distribution ». Ils disposent du même vocabulaire de routage et de
contre-pression que celui publié par le serveur dans les métriques opérationnelles.

`discovery_limits` est le contrat numérique du rôle d'appariement :
`poll_batch_cap` fige le lot maximal de lignes de tâches prêtes renvoyé par
interrogation ; `availability_ceiling_seconds` fige la tolérance entre moteurs
de stockage appliquée à `available_at`, pour que les tâches nouvellement
disponibles résistent aux écarts d'horodatage inférieurs à une seconde ;
`wake_signal_ttl_seconds` fige le TTL par défaut des signaux de
`CacheLongPollWakeStore` ; `workflow_task_lease_seconds` et
`activity_task_lease_seconds` figent les durées de bail par défaut des tâches
de workflow et d'activité. Les opérateurs lisent ces valeurs pour vérifier la
conformité du déploiement au contrat documenté sans rechercher dans les
sources du paquet. Resserrer l'une de ces valeurs est un changement de
protocole, car les temporisations de distribution, des workers et
d'accélération ailleurs dans le contrat en dépendent. Renommer un champ est
aussi une rupture de protocole.

## Frontières d'autorité {#authority-boundaries}

`topology.authority_boundaries` nomme les surfaces d'écriture durable que
chaque rôle est censé modifier :

| Rôle | Écritures publiées |
| --- | --- |
| `api_ingress` | `worker_registrations` |
| `control_plane` | `workflow_instances`, `workflow_runs.status`, `workflow_tasks.lifecycle` |
| `matching` | `workflow_tasks.leases`, `activity_tasks.leases` |
| `history_projection` | `history_events`, `workflow_run_summaries`, `workflow_history_exports` |
| `scheduler` | `workflow_schedules.fire_state`, `workflow_starts.scheduled` |
| `execution_plane` | `workflow_tasks.outcomes`, `activity_attempts`, `worker_compatibility_heartbeats` |

Utilisez ce contrat pour détecter les dérives entre rôles avant de séparer les
processus ou d'ajouter des automatismes propres à une topologie.

## Frontières de panne et de dimensionnement {#failure-and-scaling-boundaries}

### Domaines de panne {#failure-domains}

`topology.failure_domains` nomme le premier comportement dégradé et le premier
signal visible par l'opérateur pour chaque panne de rôle :

| Domaine de panne | `effect` | `operator_signal` |
| --- | --- | --- |
| `control_plane_down` | `workers_continue_claimed_tasks_only_until_lease_expiry` | `operator_commands_fail_fast` |
| `execution_plane_down` | `ready_tasks_accumulate_without_loss` | `operators_see_ready_depth_growth` |
| `matching_down` | `claim_falls_back_to_direct_ready_task_discovery` | `ready_depth_rises_while_claim_rate_falls` |
| `history_projection_down` | `projection_reads_may_stale_while_durable_writes_continue` | `projection_lag_seconds_may_increase` |
| `scheduler_down` | `scheduled_workflows_stop_firing_and_record_missed_runs` | `operators_see_missed_schedule_state` |
| `api_ingress_down` | `external_http_traffic_stops_at_the_edge` | `embedded_in_process_calls_may_continue` |

Il s'agit d'attentes du produit, pas de détails internes accessoires.
Utilisez-les pour décrire le comportement attendu d'un rôle dégradé avant de lire les journaux.

### Frontières de dimensionnement {#scaling-boundaries}

`topology.scaling_boundaries` indique l'axe de charge principal de
dimensionnement de chaque rôle dans le modèle à rôles séparés :

| Rôle | Frontière de dimensionnement |
| --- | --- |
| `api_ingress` | `incoming_http_request_rate` |
| `control_plane` | `operator_commands_and_run_lifecycle_transitions` |
| `matching` | `ready_task_rate_and_poller_count` |
| `history_projection` | `durable_event_rate` |
| `scheduler` | `active_schedule_count` |
| `execution_plane` | `workflow_and_activity_task_rate` |

C'est la réponse explicite à « que dimensionner indépendamment ? » dans la
topologie à rôles séparés.

## Chemin de migration {#migration-path}

`topology.migration_path` est ordonné. Chaque étape préserve un noyau durable
unique tout en isolant plus clairement les responsabilités :

1. `audit_role_boundaries`
   Résultat : les outils signalent les écritures entre rôles avant tout changement de forme du runtime.
2. `expose_role_bindings`
   Résultat : les points d'articulation du conteneur permettent des adaptateurs hors processus sans modifier le paquet.
3. `introduce_dedicated_matching_shape`
   Résultat : l'appariement peut s'exécuter dans sa propre classe de processus sans changer le contrat de prise en charge.
4. `split_history_projection`
   Résultat : l'historique et les projections peuvent sortir du processus sans introduire de second rédacteur.
5. `split_scheduler`
   Résultat : le déclenchement des planifications peut passer derrière une élection de leader tout en conservant la validité des déploiements à une réplique.
6. `optional_execution_partitioning`
   Résultat : les workers peuvent se partitionner par espace de noms, connexion, file et compatibilité.

Lisez cette liste comme l'ordre des transitions de topologie prises en charge,
pas comme une feuille de route produit distincte du moteur actuel.

Chaque entrée `topology.migration_path[]` porte un indicateur explicite
`reversible: true`. Le chemin est bidirectionnel : un déploiement ayant atteint
`split_history_projection` PEUT réintégrer le rôle d'historique dans le
processus du plan de contrôle et conserver une topologie valide. Le retour
arrière fait partie du contrat, pas d'un cas limite non modélisé.

## Invariants du noyau durable {#durable-kernel-invariants}

`topology.kernel_invariants` énumère les garanties préservées par la séparation
des rôles quelle que soit la forme prise en charge en cours d'exécution.
Utilisez cette liste pour vérifier qu'un changement de topologie envisagé est
pris en charge par le produit plutôt qu'une bifurcation du moteur :

| Invariant | Garantie |
| --- | --- |
| `single_persistence_engine` | Une base de données workflow unique sert toutes les topologies ; la séparation des rôles n'introduit pas de second moteur de persistance. |
| `single_worker_protocol` | Un seul protocole worker HTTP transporte les prises en charge, finalisations, échecs et heartbeats sur toutes les topologies ; la séparation des rôles ne crée pas de variante du contrat worker. |
| `single_history_writer` | `history_events` possède exactement un rédacteur durable par événement logique, quel que soit le lieu d'exécution du rôle d'historique/projection. |
| `single_control_authority_per_run` | Toute modification d'une exécution de workflow passe par une seule autorité de plan de contrôle ; des verrous de lignes par exécution sérialisent les transitions entre répliques. |
| `embedded_topology_remains_supported` | La forme embarquée où un processus remplit tous les rôles DOIT rester valide ; les hôtes embarqués existants ne sont jamais forcés à migrer. |
| `role_split_is_topology_only` | Séparer les rôles change la topologie, sans bifurquer le produit ; les regrouper dans un processus unique reste toujours une topologie valide. |

Le champ `applies_to` de chaque entrée énumère les formes couvertes par
l'invariant. Dans la famille de topologies prise en charge, chaque invariant
s'applique actuellement à `embedded`, `standalone_server` et
`split_control_execution`. Si une mise à niveau ajoute une forme, les
invariants dont `applies_to` ne l'inclut pas DOIVENT être revus avant que cette
forme soit considérée comme prise en charge par le produit.

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/cluster/info" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  | jq '.topology.kernel_invariants[] | {id, applies_to}'
```

## Santé de la coordination {#coordination-health}

`/api/cluster/info` publie aussi `coordination_health` à côté de `topology`.
Conservez cette distinction :

- `topology` indique ce que le nœud peut faire et comment la forme du produit
  est censée se comporter.
- `coordination_health` indique si les contrôles de sûreté du déploiement et
  de coordination sont actuellement sains entre les espaces de noms.
- `coordination_health.blocked_by`, `coordination_health.message` et
  `coordination_health.remediation` apparaissent lorsque le serveur ne peut
  évaluer la sûreté du déploiement faute de prérequis de disponibilité tels
  que les migrations ou la connectivité à la base de données.
- `coordination_health.routing_drains` résume les cohortes build-id en drainage
  entre files et espaces de noms. `queues_with_drains` indique si
  l'automatisation du déploiement éloigne volontairement le trafic d'une
  cohorte actuellement.
- `coordination_health.warning_checks`, `coordination_health.error_checks` et
  `coordination_health.checks` restent l'inventaire normalisé des contrôles une
  fois l'évaluation de sûreté du déploiement en cours.
- `coordination_health.checks[]` inclut toujours le contrôle figé `activity_path`
  à côté de `worker_compatibility`, `task_transport`, `routing_health`,
  `durable_resume_paths` et des contrôles de projection/planificateur.
  `activity_path` est l'équivalent côté activité de `task_transport` : il
  expose les exécutions d'activités dont le délai schedule-to-start,
  start-to-close, schedule-to-close ou de heartbeat est dépassé sans
  application de la limite, ainsi que le retard persistant de nouvelles
  tentatives d'activité. Renommer ce contrôle est un changement de protocole.

Utilisez les deux interfaces ensemble pour décider si un changement de
topologie est à la fois pris en charge et actuellement sûr.

## Références associées {#related-references}

- [Référence de l'API Server](/docs/polyglot/server-api-reference) pour le
  contrat HTTP authentifié de `/api/cluster/info`.
- [Guide Server](/docs/polyglot/server) pour le déploiement et le modèle
  général d'exploitation du serveur autonome.
- [Modes de déploiement](/docs/polyglot/deployment-modes) pour choisir entre
  l'embarqué, le serveur autonome ou des topologies plus larges accompagnées par le support.
