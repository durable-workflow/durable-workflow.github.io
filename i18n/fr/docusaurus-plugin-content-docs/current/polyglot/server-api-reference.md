---
sidebar_position: 3
title: Référence de l'API Server
description: Référence HTTP des points de terminaison du plan de contrôle, du plan worker, des espaces de noms, du stockage, des planifications et du système de Durable Workflow Server.
tags:
  - server
  - API
  - reference
  - control-plane
keywords:
  - API Durable Workflow Server
  - en-tête de version du plan de contrôle
  - points de terminaison du protocole worker
  - API de stockage externe des charges utiles
---

# Référence de l'API Server {#server-api-reference}

Le serveur autonome expose une API HTTP+JSON versionnée. Utilisez cette page
pour construire des SDK, scripts, adaptateurs de passerelle ou procédures
d'exploitation appelant directement le serveur. Consultez le
[guide Server](/docs/polyglot/server) pour le déploiement et la configuration,
et la [référence des commandes CLI](/docs/polyglot/cli-reference) pour appeler `dw`.

## En-têtes et versionnement {#headers-and-versioning}

Toutes les requêtes authentifiées utilisent des jetons Bearer sauf si le
serveur est configuré avec un autre pilote d'authentification :

```http
Authorization: Bearer <token>
X-Namespace: default
Content-Type: application/json
Accept: application/json
```

Les routes du plan de contrôle exigent :

```http
X-Durable-Workflow-Control-Plane-Version: 2
```

Les routes du plan worker exigent :

```http
X-Durable-Workflow-Protocol-Version: 1.0
```

Le serveur publie les versions prises en charge et contrats lisibles par
machine via `GET /api/cluster/info`. Les clients devraient y découvrir les
versions avant de démarrer une automatisation de longue durée. Les versions
de plan de contrôle absentes ou incompatibles sont rejetées avec un motif
nommé comme `missing_control_plane_version` ou `unsupported_control_plane_version`.

Pour la validation, la génération de code et les contrôles de dérive, utilisez
le catalogue normatif des [spécifications des protocoles de la plateforme](/docs/platform-protocol-specs)
plutôt que cette référence en prose. Il lie le document OpenAPI du plan de
contrôle, les documents OpenAPI et AsyncAPI du protocole worker, le JSON Schema
`cluster_info` et les schémas associés MCP, d'historique, Waterline et de
réparation/actions possibles.

## Découverte et santé {#discovery-and-health}

Ces routes servent aux répartiteurs de charge, à l'initialisation des SDK et
aux contrôles de compatibilité.

| Méthode | Chemin | Authentification | Rôle |
| --- | --- | --- | --- |
| `GET` | `/api/health` | non | Sonde de présence et résumé de topologie lisible par machine du nœud répondant. |
| `GET` | `/api/ready` | non | Sonde de disponibilité, même résumé de topologie et contrôles préalables de sûreté du déploiement. |
| `GET` | `/api/cluster/info` | oui | Identité du serveur, plages de SDK prises en charge, topologie des rôles, résumé de santé de coordination, contrats du plan de contrôle et du protocole worker, codecs des charges utiles et capacités fonctionnelles. |

Exemple :

<!-- docs-example id="server.cluster-info.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/cluster/info" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" | jq '.control_plane.version, .worker_protocol.version'
```

`/api/cluster/info` n'exige volontairement pas l'en-tête de version du plan de
contrôle, car c'est lui qui annonce les versions prises en charge. La même
réponse inclut `coordination_health`, résumé de déploiement et de disponibilité
sur tous les espaces de noms reflétant les contrôles qui alimentent déjà la
disponibilité du serveur.

### Résumé public de topologie {#public-topology-summary}

`GET /api/health` et `GET /api/ready` renvoient tous deux un objet `topology`
de premier niveau issu du contrat livré de résumé de santé. Utilisez-le pour
identifier le nœud ayant répondu avant la réussite de l'authentification du
plan de contrôle, de la résolution de l'espace de noms ou de la découverte
plus large `/api/cluster/info`.

Le résumé public inclut toujours :

- `topology.schema`
- `topology.version`
- `topology.current_shape`
- `topology.current_process_class`
- `topology.current_roles`
- `topology.execution_mode`
- `topology.matching_role.queue_wake_enabled`
- `topology.matching_role.shape`
- `topology.matching_role.wake_owner`
- `topology.matching_role.task_dispatch_mode`
- `topology.matching_role.partition_primitives`
- `topology.matching_role.backpressure_model`
- `topology.matching_role.discovery_limits.poll_batch_cap`
- `topology.matching_role.discovery_limits.availability_ceiling_seconds`
- `topology.matching_role.discovery_limits.wake_signal_ttl_seconds`
- `topology.matching_role.discovery_limits.workflow_task_lease_seconds`
- `topology.matching_role.discovery_limits.activity_task_lease_seconds`

`topology.matching_role.discovery_limits` est le contrat numérique figé du
rôle d'appariement : `poll_batch_cap` est le lot maximal de lignes de tâches
prêtes renvoyé par interrogation ; `availability_ceiling_seconds` est la
tolérance entre moteurs de stockage appliquée à `available_at`, pour que les
tâches nouvellement disponibles résistent aux écarts d'horodatage inférieurs
à une seconde ; `wake_signal_ttl_seconds` est le TTL par défaut des signaux
`CacheLongPollWakeStore` ; `workflow_task_lease_seconds` et
`activity_task_lease_seconds` sont les durées de bail par défaut des tâches de
workflow et d'activité. Resserrer ces valeurs change le protocole, car workers
et outils aval les utilisent comme contrat de référence de l'appariement.
Renommer un champ est aussi une rupture de protocole.

`/api/ready` renvoie le même bloc `topology` même lorsque le `status` de
disponibilité global vaut `not_ready`. Les sondes peuvent donc distinguer les
réponses de `server_http_node`, `scheduler_node`, `matching_node` et
`execution_node` pendant les blocages d'initialisation.

Exemple :

<!-- docs-example id="server.health.topology.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/health" | jq '{
  status,
  topology: {
    schema: .topology.schema,
    version: .topology.version,
    current_shape: .topology.current_shape,
    current_process_class: .topology.current_process_class,
    current_roles: .topology.current_roles,
    execution_mode: .topology.execution_mode,
    matching_role: .topology.matching_role
  }
}'
```

### Blocages de disponibilité {#readiness-blockers}

`GET /api/ready` renvoie un `status` global et des `checks` lisibles par
machine. Deux contrôles déterminent si le serveur peut évaluer sans risque la
santé de sûreté du déploiement :

- `checks.migrations` est le contrôle d'initialisation et de migration. Il publie
  `repository_exists`, `pending_migrations`, `adoptable_migrations`,
  `blocking_migrations`, `missing_tables`, `operator_surface` et
  `readiness_contract`.
- `adoptable_migrations` indique que les tables de workflow existantes ne
  nécessitent que l'adoption de l'historique des migrations. Le serveur reste
  disponible avec `status: "warning"` pour planifier l'adoption avant la
  prochaine passe de migration.
- `blocking_migrations` indique que des enregistrements de migration de sûreté
  du déploiement sont encore requis. Le serveur refuse avec `status: "pending"`
  et une chaîne `remediation` au lieu de servir comme si la flotte était à jour.
- `operator_surface.available` et `operator_surface.required_tables` indiquent
  si l'interface opérateur v2 dispose des tables durables nécessaires pour
  expliquer la sûreté du déploiement après démarrage.
- `readiness_contract.version` fixe la révision du contrat d'installation et
  d'adoption attendue par les scripts analysant ces champs.
- `checks.workflow_v2` reflète le verdict de sûreté sur tous les espaces de
  noms. Si les prérequis de disponibilité manquent, il annonce
  `status: "blocked"` avec `blocked_by`, `message` et `remediation` au lieu de
  prétendre la flotte saine.

Exemple :

<!-- docs-example id="server.ready.blockers.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/ready" | jq '{
  status,
  migrations: {
    status: .checks.migrations.status,
    adoptable_migrations: .checks.migrations.adoptable_migrations,
    blocking_migrations: (.checks.migrations.blocking_migrations | map(.migration)),
    missing_tables: .checks.migrations.missing_tables,
    operator_surface: .checks.migrations.operator_surface,
    readiness_contract: .checks.migrations.readiness_contract
  },
  workflow_v2: {
    status: .checks.workflow_v2.status,
    blocked_by: .checks.workflow_v2.blocked_by,
    remediation: .checks.workflow_v2.remediation
  }
}'
```

### Manifeste de topologie du cluster {#cluster-topology-manifest}

`/api/cluster/info` renvoie aussi le manifeste `topology` du nœud sous le
schéma `durable-workflow.v2.role-topology`. C'est le moyen pris en charge de
découvrir si le nœud agit actuellement comme `standalone_server`, `embedded`
ou `split_control_execution`, les rôles qu'il détient et les attentes du
serveur pour `matching_role`, `shape_assignments`, `authority_boundaries`,
`failure_domains`, `scaling_boundaries` et `migration_path`. La même réponse
publie l'état actuel de sûreté du déploiement de ce nœud.

Lisez le manifeste ainsi :

- `topology.current_shape`, `topology.current_process_class`,
  `topology.current_roles` et `topology.execution_mode` indiquent la forme de
  rôles effectivement servie par le nœud. Ces champs décrivent le répondant,
  pas toute la flotte.
- `topology.role_vocabulary` est la liste fixe des noms de rôles v2 valides.
- `topology.matching_role.queue_wake_enabled`,
  `topology.matching_role.shape`, `topology.matching_role.wake_owner`,
  `topology.matching_role.task_dispatch_mode`,
  `topology.matching_role.partition_primitives` et
  `topology.matching_role.backpressure_model` indiquent si la découverte
  générale des tâches prêtes s'effectue dans le worker ou par un balayage
  dédié, le processus responsable, les axes de routage stables et la
  frontière d'admission durable appliquée actuellement par v2.
- `topology.matching_role.discovery_limits` publie les valeurs numériques
  figées du contrat d'appariement : `poll_batch_cap`,
  `availability_ceiling_seconds`, `wake_signal_ttl_seconds`,
  `workflow_task_lease_seconds` et `activity_task_lease_seconds`. Vérifiez ainsi
  le déploiement avec le contrat documenté. Le paquet émet les mêmes
  identifiants dans `dw server:info`, l'instantané operator-metrics et la
  santé limitée à un espace de noms.
- `topology.role_catalog` et `topology.authority_surfaces` associent ces rôles
  aux interfaces, surfaces d'écriture durable et chemins de lecture attendus
  par l'automatisation sur le nœud répondant.
- `topology.shape_assignments` est l'inventaire lisible par machine des classes
  de processus pour chaque forme prise en charge. Comparez-y les rôles
  actuels pour rattacher le nœud à une classe de processus documentée.
- `topology.supported_topologies` résume les familles de déploiement prises
  en charge et les classes de nœuds attendues par chacune.
- `coordination_health` résume les risques de déploiement et de compatibilité
  de la flotte dans un bloc lisible par machine. Outre `status` et
  `http_status`, il peut publier `blocked_by`, `message` et `remediation` quand
  l'évaluation est bloquée par des problèmes de disponibilité préalables,
  comme des migrations manquantes ou une base de données inaccessible.
- `coordination_health.checks[]` inclut toujours le contrôle figé `activity_path`
  à côté de `worker_compatibility`, `task_transport`, `routing_health`,
  `durable_resume_paths` et des contrôles de projection/planificateur.
  Équivalent côté activité de `task_transport`, `activity_path` expose les
  exécutions dont le délai schedule-to-start, start-to-close,
  schedule-to-close ou de heartbeat a été dépassé sans application de la limite
  (`timeout_overdue`, `oldest_timeout_overdue_at`,
  `max_timeout_overdue_age_ms`) et le retard persistant de nouvelles tentatives
  (`retrying`, `oldest_retrying_started_at`, `max_retrying_age_ms`). Renommer ce
  contrôle change le protocole.
- `coordination_health.routing_drains` résume les cohortes build-id en drainage
  entre espaces de noms et files. `queues_with_drains` et les entrées
  `build_ids` par file indiquent où le trafic est volontairement éloigné des
  workers en drainage.
- `execution_mode` distingue l'exécution embarquée `local_queue_worker` de
  l'exécution par protocole worker `remote_worker_protocol`.
- `split_control_execution` est une topologie du produit prise en charge, pas
  un second produit serveur ni une autre API.

Exemple :

<!-- docs-example id="server.cluster-info.topology.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/cluster/info" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  | jq '{
    current_shape: .topology.current_shape,
    current_roles: .topology.current_roles,
    execution_mode: .topology.execution_mode,
    matching_role: .topology.matching_role,
    coordination_health: {
      status: .coordination_health.status,
      http_status: .coordination_health.http_status,
      blocked_by: .coordination_health.blocked_by,
      queues_with_drains: .coordination_health.routing_drains.queues_with_drains
    }
  }'
```

Pour le contrat conceptuel de ces champs, dont le vocabulaire des rôles et le
chemin de migration, consultez la
[topologie des rôles de Server](/docs/polyglot/server-role-topology).

### Rejets de topologie sur un mauvais nœud {#wrong-node-topology-rejections}

Les routes hébergées authentifiées rejettent les requêtes si le nœud répondant
n'héberge pas l'interface de contrôle HTTP requise. Le contrôle intervient
après validation du rôle et de la version du protocole, avant résolution de
l'espace de noms, pour ne pas révéler son existence sur un mauvais nœud.

Lors d'un blocage, le serveur renvoie `503` avec
`reason: "topology_role_unavailable"` et :

- `current_shape` : forme de topologie annoncée du nœud répondant.
- `current_process_class` : classe de processus déclarée, comme
  `scheduler_node` ou `execution_node`.
- `current_roles` : rôles effectivement hébergés par ce nœud.
- `required_roles` : rôles des routes hébergées requis par le point de terminaison.
- `missing_roles` : sous-ensemble de `required_roles` absent du nœud répondant.

Les routes du plan de contrôle renvoient cette charge dans son enveloppe. Les
routes du protocole worker renvoient les mêmes champs dans l'enveloppe worker
et conservent l'en-tête normal de version du protocole worker.

Exemple de réponse à `GET /api/workflows` reçu par un nœud limité au planificateur :

```json
{
  "reason": "topology_role_unavailable",
  "message": "This node does not host the topology roles required for this endpoint.",
  "current_shape": "standalone_server",
  "current_process_class": "scheduler_node",
  "current_roles": ["scheduler"],
  "required_roles": ["api_ingress", "control_plane"],
  "missing_roles": ["api_ingress", "control_plane"]
}
```

`GET /api/health`, `GET /api/ready` et `GET /api/cluster/info` authentifié
restent disponibles pour la présence et la découverte même sur les nœuds
n'hébergeant pas l'interface actuelle de contrôle HTTP.

### Contrôle d'initialisation des workflows {#workflow-bootstrap-gate}

Les routes authentifiées qui modifient ou servent le trafic workflow v2
rejettent aussi les requêtes si `checks.workflow_v2.status` du nœud répondant
vaut `blocked`. Le contrôle intervient après validation du rôle et de la
version du protocole, avant résolution de l'espace de noms. Une requête
pendant un déploiement bloqué n'observe donc jamais son existence.

Lors d'un blocage, le serveur renvoie `503` avec `reason: "workflow_v2_blocked"` et :

- `blocked_by` : liste ordonnée des blocages préalables de disponibilité (par
  exemple `migrations`) empêchant le service sûr de workflow v2.
- `remediation` : instruction courte destinée à l'opérateur pour lever les
  blocages, reprise du champ `checks.workflow_v2.remediation` de `/api/ready`.

Les familles de routes soumises à ce contrôle sont :

- **Démarrage et modification de workflows** : toutes les routes
  `/api/workflows` des groupes démarrage, description, commande et commande
  ciblant une exécution (par exemple
  `POST /api/workflows`, `POST /api/workflows/{workflowId}/signal/{signalName}`,
  `POST /api/workflows/{workflowId}/runs/{runId}/cancel`).
- **Modification des planifications** : `POST /api/schedules`,
  `PUT /api/schedules/{scheduleId}`, `DELETE /api/schedules/{scheduleId}`,
  `POST /api/schedules/{scheduleId}/pause`,
  `POST /api/schedules/{scheduleId}/resume`,
  `POST /api/schedules/{scheduleId}/trigger` et
  `POST /api/schedules/{scheduleId}/backfill`.
- **Adaptateurs de passerelle** : `POST /api/bridge-adapters/webhook/{adapter}`.
- **Protocole worker** : toutes les routes `/api/worker` et `/api/worker/*`,
  dont l'inscription, le heartbeat et les opérations d'interrogation,
  finalisation, échec et heartbeat des tâches de workflow, de requête et d'activité.

Les **lectures** des planifications sont volontairement exemptées pour
inspecter leur état pendant une reprise : `GET /api/schedules`,
`GET /api/schedules/{scheduleId}` et `GET /api/schedules/{scheduleId}/history`
restent accessibles tandis que le contrôle bloque les autres routes.

Les routes du plan de contrôle renvoient la charge de blocage dans leur
enveloppe, avec l'en-tête `X-Durable-Workflow-Control-Plane-Version`. Les
routes worker renvoient les mêmes champs `reason`, `blocked_by` et
`remediation` dans leur enveloppe et conservent
`X-Durable-Workflow-Protocol-Version`, pour réagir au motif machine au lieu de
déduire l'état de la file d'un simple `503`.

Exemple de réponse de blocage de `POST /api/workflows` lorsqu'une migration de
sûreté du déploiement manque :

```json
{
  "reason": "workflow_v2_blocked",
  "message": "This node is not ready to serve workflow v2 traffic until bootstrap blockers are cleared.",
  "blocked_by": ["migrations"],
  "remediation": "Restore database connectivity and migrate the workflow tables before relying on workflow v2 rollout-safety health."
}
```

La même charge est renvoyée dans l'enveloppe worker pour `/api/worker/*`.
Les SDK peuvent continuer à se baser sur `reason` et réessayer après levée du
blocage préalable.

### Santé système par espace de noms {#namespace-scoped-system-health}

`GET /api/system/health` est l'interface authentifiée de santé de sûreté du
déploiement et de coordination d'un espace de noms. Elle exige
l'authentification admin et `X-Durable-Workflow-Control-Plane-Version: 2`,
résout l'espace de noms selon les règles normales du plan de contrôle et
renvoie l'espace exact évalué avec l'instantané `health` actuel :

<!-- docs-example id="server.system-health.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/system/health" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  | jq '{namespace, status: .health.status, healthy: .health.healthy}'
```

Interprétez la charge ainsi :

- `namespace` : espace dont l'état de déploiement/coordination a été évalué.
- `health.status` et `health.healthy` : verdict global de santé lisible par
  machine pour cet espace de noms.
- `health.checks` et `health.categories` : faits par interface de disponibilité,
  compatibilité, projection et coordination.
- `health.operator_metrics` : métriques actuelles des files, workers et
  réparations de cet espace incluses dans le même instantané.
- `health.structural_limits` : limites structurelles effectives et diagnostics
  associés appliqués par le serveur à cet espace de noms.

## Plan de contrôle des workflows {#workflow-control-plane}

Les routes de workflow relèvent de l'opérateur/du plan de contrôle. Elles
exigent un rôle operator ou admin et `X-Durable-Workflow-Control-Plane-Version: 2`.

| Méthode | Chemin | Rôle |
| --- | --- | --- |
| `GET` | `/api/workflows` | Lister les instances de workflow. Accepte les filtres d'état, de type, de texte de requête et de limite. |
| `POST` | `/api/workflows` | Démarrer une instance de workflow. |
| `GET` | `/api/workflows/{workflowId}` | Décrire l'exécution actuelle d'un identifiant de workflow. |
| `GET` | `/api/workflows/{workflowId}/debug` | Renvoyer des diagnostics bornés pour examiner une exécution bloquée. |
| `GET` | `/api/workflows/{workflowId}/runs` | Lister les exécutions d'un identifiant de workflow. |
| `GET` | `/api/workflows/{workflowId}/runs/{runId}` | Décrire une exécution précise. |
| `GET` | `/api/workflows/{workflowId}/runs/{runId}/debug` | Renvoyer des diagnostics bornés pour une exécution sélectionnée. |
| `GET` | `/api/workflows/{workflowId}/runs/{runId}/history` | Parcourir par pages les événements d'historique d'une exécution. |
| `GET` | `/api/workflows/{workflowId}/runs/{runId}/history/export` | Exporter l'ensemble de relecture archivable d'une exécution. |

Les requêtes de démarrage suivent la forme du plan de contrôle indépendante du langage :

<!-- docs-example id="server.workflow-start.curl" -->
```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/workflows" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_type": "orders.fulfillment",
    "workflow_id": "order-1001",
    "task_queue": "orders",
    "input": ["order-1001"],
    "memo": {"source": "api-reference"},
    "search_attributes": {"CustomerId": "cust-42"},
    "duplicate_policy": "reject"
  }'
```

### Commandes de workflow {#workflow-commands}

Le serveur fournit aussi les routes coopératives `request-cancellation`.
Consultez l'[annulation coopérative](/docs/polyglot/cancellation/) pour le
contrat de nettoyage borné et les exigences des workers.

Les commandes ciblant une instance opèrent sur l'exécution actuelle de
l'identifiant de workflow :

| Méthode | Chemin | Rôle |
| --- | --- | --- |
| `POST` | `/api/workflows/{workflowId}/signal/{signalName}` | Envoyer un signal. |
| `POST` | `/api/workflows/{workflowId}/query/{queryName}` | Exécuter une requête de lecture. |
| `POST` | `/api/workflows/{workflowId}/update/{updateName}` | Soumettre ou exécuter une mise à jour. |
| `POST` | `/api/workflows/{workflowId}/cancel` | Fermer immédiatement l'exécution comme annulée ; ne reprend pas le nettoyage du workflow. |
| `POST` | `/api/workflows/{workflowId}/terminate` | Forcer la terminaison. |
| `POST` | `/api/workflows/{workflowId}/repair` | Demander au serveur de réparer un état bloqué réessayable. |
| `POST` | `/api/workflows/{workflowId}/archive` | Archiver une exécution de workflow fermée. |

Les commandes ciblant une exécution rejettent explicitement les cibles
historiques ou les mauvaises exécutions :

| Méthode | Chemin | Rôle |
| --- | --- | --- |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/signal/{signalName}` | Envoyer un signal uniquement si l'exécution sélectionnée est actuelle. |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/query/{queryName}` | Exécuter une requête sur l'exécution sélectionnée. |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/update/{updateName}` | Soumettre ou exécuter une mise à jour uniquement sur l'exécution actuelle. |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/cancel` | Annuler uniquement l'exécution actuelle sélectionnée. |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/terminate` | Terminer uniquement l'exécution actuelle sélectionnée. |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/repair` | Réparer uniquement l'exécution actuelle sélectionnée. |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/archive` | Archiver uniquement l'exécution sélectionnée actuelle et fermée. |

Les commandes portant une charge utile de l'appelant utilisent un tableau
`input`. Les SDK Python et PHP encodent les enveloppes indépendantes du
langage ; les appelants HTTP directs doivent envoyer des valeurs JSON que le
workflow ou l'activité cible sait décoder.

## Espaces de noms et stockage {#namespace-and-storage}

Les routes des espaces de noms exigent les rôles operator ou admin. Leurs
routes de modification et celles de stockage externe exigent le rôle admin.

| Méthode | Chemin | Rôle |
| --- | --- | --- |
| `GET` | `/api/namespaces` | Lister les espaces de noms. |
| `POST` | `/api/namespaces` | Créer un espace de noms. |
| `GET` | `/api/namespaces/{namespace}` | Décrire la rétention, les métadonnées et la politique de stockage d'un espace de noms. |
| `PUT` | `/api/namespaces/{namespace}` | Mettre à jour ses métadonnées ou sa rétention. |
| `PUT` | `/api/namespaces/{namespace}/external-storage` | Configurer sa politique de stockage externe des charges utiles. |
| `POST` | `/api/storage/test` | Effectuer un aller-retour de petite et grande charge utile via le pilote de stockage externe configuré. |

Les politiques de stockage externe permettent aux grandes enveloppes de
porter des références stables plutôt que des octets bruts. Les politiques
locales utilisent le chemin de système de fichiers configuré. Celles de
stockage objet telles que `s3`, `gcs` et `azure` utilisent un disque
explicitement configuré et les paramètres de bucket/préfixe sur le serveur.

### Enveloppe de référence de charge utile externe {#external-payload-reference-envelope}

La référence de charge externe est une enveloppe de transport stable. Les SDK
peuvent la décoder en types natifs utilitaires, mais les clients HTTP
devraient considérer ces noms de champs comme le contrat :

| Champ | Obligatoire | Signification |
| --- | --- | --- |
| `schema` | oui | Doit être `durable-workflow.v2.external-payload-reference.v1`. Les schémas inconnus sont rejetés. |
| `uri` | oui | Emplacement d'objet géré par le pilote, comme `file:///...`, `s3://bucket/prefix/object`, `gs://bucket/prefix/object` ou `azure://container/prefix/object`. |
| `sha256` | oui | SHA-256 hexadécimal en minuscules des octets encodés stockés. Les SDK et le serveur le vérifient avant décodage. |
| `size_bytes` | oui | Longueur en octets de la charge encodée stockée. Toute différence est un échec d'intégrité. |
| `codec` | oui | Toujours `avro` : schéma Value typé fixe avec trame Avro single-object. Le document HTTP englobant reste en JSON. |
| `expires_at` | non | Indication d'expiration ISO-8601 pour la rétention/le ramasse-miettes. Son absence confie le nettoyage à la politique de rétention de l'espace de noms. |

L'externalisation est conditionnée par le seuil de la politique de stockage
de l'espace de noms. Les charges en ligne conservent l'enveloppe normale
jusqu'à ce que les octets encodés dépassent `threshold_bytes`. Le pilote
écrit alors les octets et l'historique stocke l'enveloppe de référence.
Relecture et export d'historique doivent échouer explicitement si un blob
référencé est absent, modifié, hors du préfixe configuré ou chez un fournisseur
indisponible. Ils ne doivent pas remplacer silencieusement un objet manquant
par `null`, `{}` ou une chaîne d'octets vide.

Pour le contrat complet d'autorité des requêtes, incluant résolution des
espaces de noms, identifiants par rôle et champs d'inscription des workers,
consultez [Espaces de noms, authentification et inscription des workers](/docs/polyglot/namespace-auth-workers).

## API d'administration du catalogue de services {#service-catalog-admin-apis}

Les routes du catalogue de services sont des routes authentifiées admin du
plan de contrôle. Elles utilisent les mêmes résolution d'espace de noms,
contrôle des rôles de topologie et exigence
`X-Durable-Workflow-Control-Plane-Version: 2` que le reste du plan hébergé.

Cette famille de routes inscrit les métadonnées de points de terminaison,
services et opérations propres à un espace de noms pour le catalogue
inter-espaces de noms. Les noms sont insensibles à la casse en entrée et
normalisés en minuscules dans les réponses et recherches.

| Méthode | Chemin | Rôle |
| --- | --- | --- |
| `GET` | `/api/service-endpoints` | Lister les points de terminaison de services de l'espace de noms actuel. |
| `POST` | `/api/service-endpoints` | Créer un point de terminaison de service. |
| `GET` | `/api/service-endpoints/{endpointName}` | Décrire un point de terminaison. |
| `PUT` | `/api/service-endpoints/{endpointName}` | Mettre à jour sa description ou ses métadonnées. |
| `DELETE` | `/api/service-endpoints/{endpointName}` | Supprimer un point de terminaison inutilisé. |
| `GET` | `/api/service-endpoints/{endpointName}/services` | Lister les services inscrits sous un point de terminaison. |
| `POST` | `/api/service-endpoints/{endpointName}/services` | Créer un service sous un point de terminaison. |
| `GET` | `/api/service-endpoints/{endpointName}/services/{serviceName}` | Décrire un service. |
| `PUT` | `/api/service-endpoints/{endpointName}/services/{serviceName}` | Mettre à jour sa description ou ses métadonnées. |
| `DELETE` | `/api/service-endpoints/{endpointName}/services/{serviceName}` | Supprimer un service inutilisé. |
| `GET` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations` | Lister les opérations inscrites sous un service. |
| `POST` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations` | Créer une liaison d'opération. |
| `GET` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations/{operationName}` | Décrire une opération. |
| `GET` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations/{operationName}/service-calls/{serviceCallId}` | Décrire un instantané durable d'appel de service. |
| `PUT` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations/{operationName}` | Mettre à jour une liaison d'opération. |
| `DELETE` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations/{operationName}` | Supprimer une opération inutilisée. |

Les collections de réponse utilisent les tableaux `service_endpoints`,
`services` ou `operations`. Chaque ressource inclut un nom stable en
minuscules, des métadonnées et des horodatages :

- Les points de terminaison renvoient `id`, `namespace`, `endpoint_name`,
  `description`, `metadata`, `created_at` et `updated_at`.
- Les services ajoutent `endpoint_id` et `service_name`.
- Les opérations ajoutent `service_id`, `operation_name`, `operation_mode`,
  `handler_binding_kind`, `handler_target_reference`, `handler_binding`,
  `deadline_policy`, `idempotency_policy`, `cancellation_policy`,
  `retry_policy`, `boundary_policy` et `metadata`.
- Les instantanés d'appels ajoutent `caller_namespace`, les identifiants de
  workflow appelant et lié, `status`, `resolved_binding_kind`,
  `resolved_target_reference`, les références de charges utiles, instantanés
  de politiques et horodatages du cycle de vie comme `accepted_at`,
  `started_at`, `completed_at`, `failed_at` et
  `cancelled_at`.

Les requêtes de création/mise à jour d'opération utilisent les mêmes noms de
champs JSON que la réponse. `operation_mode` vaut `sync` ou `async`.
`handler_binding_kind` vaut
`start_workflow`, `signal_workflow`, `update_workflow`, `query_workflow`,
`activity_execution` ou `invocable_http`. Une nouvelle opération doit fournir
`handler_target_reference` ou une charge `handler_binding` non vide.

Le détail imbriqué de l'appel expose aussi `service_call_attempts`,
`retry_attempt_count`, le `call_deadline_at` d'origine, les métadonnées typées
d'échec et le `result_envelope` Avro conservé. Les appels acceptés ou démarrés
ne sont pas terminaux. L'appelant workflow attendant la fin reçoit le résultat
réel ou l'échec/annulation terminal du workflow lié, en conservant l'identité
et l'échéance de l'appel d'origine.

Utilisez l'[inspection CLI des appels de service](./cli-reference.md#service-call-inspection)
ou le catalogue Waterline pour inspecter cet appel d'origine. L'inspection ne
demande pas une autre exécution du service.

Les suppressions sont refusées avec HTTP `409` et un motif nommé tant que des
dépendants existent, comme `endpoint_has_services`, `service_has_operations`
ou `operation_has_service_calls`.

## Adaptateurs de passerelle {#bridge-adapters}

Les adaptateurs de passerelle sont des points d'entrée bornés. Ils n'exécutent
pas de code workflow ; ils transmettent les événements au plan de contrôle et
renvoient un résultat nommé.

| Méthode | Chemin | Rôle |
| --- | --- | --- |
| `POST` | `/api/bridge-adapters/webhook/{adapter}` | Démarrer, signaler ou mettre à jour un workflow depuis un événement de type webhook. |

Exemple :

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/bridge-adapters/webhook/stripe" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "start_workflow",
    "idempotency_key": "evt_1001",
    "target": {
      "workflow_type": "orders.fulfillment",
      "task_queue": "orders",
      "business_key": "order-1001"
    },
    "input": {"order_id": "order-1001"}
  }'
```

Utilisez les champs de réponse comme `outcome`, `reason`, `idempotency_key` et
`control_plane_outcome` au lieu de déduire le comportement du seul état HTTP.

## Protocole worker {#worker-protocol}

Les routes worker exigent le rôle worker et
`X-Durable-Workflow-Protocol-Version: 1.0`. Les SDK les utilisent en interne ;
les workers de langages personnalisés peuvent implémenter le même protocole.

| Méthode | Chemin | Rôle |
| --- | --- | --- |
| `POST` | `/api/worker/register` | Inscrire l'identité du worker, les files, types workflow/activité pris en charge, capacité, runtime et métadonnées du build. |
| `POST` | `/api/worker/heartbeat` | Rafraîchir la visibilité de la flotte et les informations de compatibilité. |
| `POST` | `/api/worker/workflow-tasks/poll` | Interroger en attente longue les tâches de workflow. |
| `POST` | `/api/worker/workflow-tasks/{taskId}/history` | Récupérer l'historique paginé d'une tâche de workflow sous bail. |
| `POST` | `/api/worker/workflow-tasks/{taskId}/heartbeat` | Envoyer un heartbeat d'une tâche de workflow sous bail. |
| `POST` | `/api/worker/workflow-tasks/{taskId}/complete` | Terminer une tâche de workflow avec des commandes. |
| `POST` | `/api/worker/workflow-tasks/{taskId}/fail` | Faire échouer une tâche de workflow. |
| `POST` | `/api/worker/query-tasks/poll` | Interroger en attente longue les tâches de requête routées par le serveur. |
| `POST` | `/api/worker/query-tasks/{queryTaskId}/complete` | Terminer une tâche de requête. |
| `POST` | `/api/worker/query-tasks/{queryTaskId}/fail` | Faire échouer ou rejeter une tâche de requête. |
| `POST` | `/api/worker/activity-tasks/poll` | Interroger en attente longue les tâches d'activité. |
| `POST` | `/api/worker/activity-tasks/{taskId}/heartbeat` | Envoyer un heartbeat d'une tâche d'activité sous bail. |
| `POST` | `/api/worker/activity-tasks/{taskId}/complete` | Terminer une tâche d'activité. |
| `POST` | `/api/worker/activity-tasks/{taskId}/fail` | Faire échouer une tâche d'activité. |

Les workers devraient traiter les identifiants de bail, tentatives,
identifiants de tâches et points de heartbeat comme des valeurs opaques émises
par le serveur. Un bail périmé ou un mauvais identifiant de tâche renvoie une
erreur nommée du protocole au lieu de terminer silencieusement le travail.

Quand `worker_protocol.server_capabilities.poll_status` vaut `true`, chaque
réponse d'interrogation de tâche de workflow, d'activité et de requête porte
un champ `poll_status` lisible par machine. Examinez-le avant les champs de
charge utile propres à la route :

| `poll_status` | État HTTP habituel | Signification |
| --- | --- | --- |
| `leased` | `200` | Le serveur a loué une tâche et `task` contient sa charge utile. |
| `empty` | `200` | Aucune tâche correspondante n'était prête avant le retour. |
| `throttled` | `200` | La file est visible, mais les limites d'admission des baux ou de distribution ont retenu une nouvelle tâche. |
| `unavailable` | `503` ou `200` | Le serveur n'a pas pu coordonner sans risque un chemin d'interrogation et a renvoyé une indisponibilité typée plutôt qu'un résultat vide silencieux. |
| `draining` | `409` | La cohorte inscrite du worker est en drainage ; le serveur refuse un nouveau bail et renvoie `reason: "worker_draining"`. |

## Visibilité de la flotte et des files de tâches {#fleet-and-task-queue-visibility}

Ces routes exposent les diagnostics opérationnels des flottes de workers et
de l'admission des files. Elles appartiennent au plan de contrôle.

| Méthode | Chemin | Rôle |
| --- | --- | --- |
| `GET` | `/api/workers` | Lister les workers inscrits. |
| `GET` | `/api/workers/{workerId}` | Décrire un worker. |
| `DELETE` | `/api/workers/{workerId}` | Désinscrire un worker. |
| `GET` | `/api/task-queues` | Lister les files de tâches et leur état d'admission. |
| `GET` | `/api/task-queues/{taskQueue}` | Décrire les capacités workflow/activité/requête d'une file. |
| `GET` | `/api/task-queues/{taskQueue}/build-ids` | Lister les build ids observés sur une file. |
| `POST` | `/api/task-queues/{taskQueue}/build-ids/drain` | Marquer une cohorte build-id en drainage pour arrêter les nouvelles prises de tâches. |
| `POST` | `/api/task-queues/{taskQueue}/build-ids/resume` | Effacer un drainage antérieur pour permettre de nouvelles prises de tâches. |

Les réponses des files distinguent l'absence de workers des emplacements
saturés, plafonds de baux actifs, budgets de distribution et contre-pression
des tâches de requête. Le drainage et la réactivation prennent un corps JSON
`{"build_id": "..."}` (ou `{"build_id": null}` pour la cohorte non versionnée),
sont idempotents et persistent l'intention de l'opérateur pour conserver un
état fidèle même après retrait des workers. Lorsqu'un heartbeat observe
`drain_intent: "draining"`, les interrogations worker renvoient HTTP `409`
avec `poll_status: "draining"` et `reason: "worker_draining"` au lieu de louer
de nouvelles tâches. Consultez le [déploiement des build-id de workers](/docs/polyglot/worker-build-id-rollout)
pour le cycle complet de migration, de canari, de drainage et de retour arrière.

## Planifications et attributs de recherche {#schedules-and-search-attributes}

Les routes de planification appartiennent au plan de contrôle.

| Méthode | Chemin | Rôle |
| --- | --- | --- |
| `GET` | `/api/schedules` | Lister les planifications. |
| `POST` | `/api/schedules` | Créer une planification. |
| `GET` | `/api/schedules/{scheduleId}` | Décrire une planification. |
| `PUT` | `/api/schedules/{scheduleId}` | Mettre à jour sa spécification, action, note, mémo ou ses attributs de recherche. |
| `DELETE` | `/api/schedules/{scheduleId}` | Supprimer une planification. |
| `POST` | `/api/schedules/{scheduleId}/pause` | Suspendre les futurs déclenchements. |
| `POST` | `/api/schedules/{scheduleId}/resume` | Reprendre une planification suspendue. |
| `POST` | `/api/schedules/{scheduleId}/trigger` | Déclencher immédiatement une planification. |
| `POST` | `/api/schedules/{scheduleId}/backfill` | Rattraper une fenêtre temporelle. |
| `GET` | `/api/search-attributes` | Lister les attributs de recherche inscrits. |
| `POST` | `/api/search-attributes` | Inscrire un attribut de recherche. |
| `DELETE` | `/api/search-attributes/{name}` | Supprimer un attribut de recherche. |

Les noms et types d'attributs font partie du contrat de recherche de l'espace
de noms. Évitez les attributs à forte cardinalité dans les tableaux de bord
opérateurs et les étiquettes de métriques.

## Opérations système {#system-operations}

Les routes système exigent le rôle admin. Ce sont des passes opérateur
explicites : privilégiez les routes d'état avant les passes en automatisation.

| Méthode | Chemin | Rôle |
| --- | --- | --- |
| `GET` | `/api/system/health` | Renvoyer l'instantané de santé de sûreté du déploiement et de coordination de l'espace de noms, sous `health`. |
| `GET` | `/api/system/metrics` | Renvoyer des métriques JSON bornées. |
| `GET` | `/api/system/operator-metrics` | Renvoyer l'instantané de métriques opérateur de l'espace de noms : exécutions, tâches, retard, réparation, workers et limites structurelles. |
| `GET` | `/api/system/repair` | Inspecter le retard de réparation des workflows. |
| `POST` | `/api/system/repair/pass` | Exécuter une passe de réparation de workflows. |
| `GET` | `/api/system/activity-timeouts` | Inspecter le retard des délais d'activité dépassés. |
| `POST` | `/api/system/activity-timeouts/pass` | Exécuter une passe d'application des délais d'activité. |
| `GET` | `/api/system/retention` | Inspecter le retard de nettoyage de rétention. |
| `POST` | `/api/system/retention/pass` | Exécuter une passe de nettoyage de rétention. |

Pour la rétention de PHP Server, la route d'état lit la politique actuelle de
l'espace de noms et renvoie une liste bornée d'exécutions admissibles. Modifier
la politique affecte aussi l'historique fermé existant. Une passe sans filtre
sélectionne les exécutions expirées ; des `run_ids` explicites ciblent
directement les exécutions fermées sans filtre d'âge borné. La rétention
illimitée et les protections des archives restent applicables. Revoyez la
[procédure de rétention et les étapes de sauvegarde](./server.md#retention)
avant de modifier la politique ou de nettoyer.

`/api/system/health` répond rapidement à la question de la santé suffisante
d'un espace pour continuer à recevoir du trafic. Il renvoie
`{namespace, health}`, où `health` contient les contrôles de sûreté du
déploiement catégorisés, l'instantané imbriqué `health.operator_metrics` et le
résumé des limites structurelles utilisé par l'interface de santé.

`/api/system/operator-metrics` complète `/api/cluster/info` à l'échelle d'un
espace de noms pour obtenir les nombres bruts de tâches en retard, l'âge du
blocage par compatibilité, le détail de la flotte et les autres métriques
derrière le résumé de santé.

`/api/system/metrics` est une interface JSON opérateur, pas un point de
collecte Prometheus. Les noms et dimensions des métriques sont bornés par la
politique de croissance bornée du serveur.

## Contrat d'erreur {#error-contract}

Les réponses d'erreur utilisent des codes d'état HTTP et des motifs nommés
lisibles par machine. Les clients devraient examiner `reason` ou les motifs
imbriqués du plan de contrôle/protocole worker, pas les messages rédigés.

États courants :

| État | Signification |
| --- | --- |
| `400` | En-tête de protocole/version absent ou incompatible, requête mal formée ou méthode de route non prise en charge. |
| `401` | Authentification absente ou invalide. |
| `403` | Le jeton authentifié n'a pas le rôle requis. |
| `404` | Espace de noms, workflow, exécution, planification, worker ou attribut de recherche introuvable. |
| `409` | Doublon ou conflit, comme un workflow déjà démarré ou une cible d'exécution invalide. |
| `422` | Échec de validation ; la réponse contient les détails par champ. |
| `429` | Capacité d'admission ou de file de tâches pleine. |
| `503` | La requête a atteint un nœud sans les rôles de topologie requis. Les routes hébergées renvoient `reason: "topology_role_unavailable"` avec `current_shape`, `current_process_class`, `current_roles`, `required_roles` et `missing_roles`. Le même état avec `reason: "workflow_v2_blocked"`, `blocked_by` et `remediation` couvre les routes de démarrage/modification de workflow, modification de planification, adaptateur de passerelle et protocole worker pendant un blocage d'initialisation v2. Les lectures de planification (`GET /api/schedules`, `GET /api/schedules/{scheduleId}`, `GET /api/schedules/{scheduleId}/history`) restent disponibles pour inspecter l'état pendant la reprise. |
| `500` | Échec serveur. Ne le considérez comme réessayable que si l'opération est idempotente ou possède une clé d'idempotence. |

Les réponses de validation incluent `reason: "validation_failed"` avec
`errors` ou `validation_errors`. Les réponses des commandes workflow projettent
aussi les détails de validation et d'opération dans l'objet `control_plane` imbriqué.

## Voir aussi {#see-also}

- [Guide Server](/docs/polyglot/server)
- [Espaces de noms, authentification et inscription des workers](/docs/polyglot/namespace-auth-workers)
- [Protocole worker](/docs/polyglot/worker-protocol)
- [Admission des files de tâches](/docs/polyglot/task-queue-admission)
- [Exécution externe](/docs/polyglot/external-execution)
- [Référence des commandes CLI](/docs/polyglot/cli-reference)
