---
sidebar_position: 2
title: Server
description: Déployez et configurez Durable Workflow Server autonome, ses workers, sa conservation et ses vérifications de santé.
tags:
  - server
  - control-plane
  - operations
  - polyglot
keywords:
  - serveur Durable Workflow
  - serveur autonome
  - API du plan de contrôle
  - workflows polyglottes
---

# Server {#server}

Le Server Durable Workflow publié est un service autonome d’orchestration implémenté en PHP. Il expose le même moteur durable que le package PHP intégré, via un plan de contrôle HTTP+JSON et un protocole worker indépendants du langage. PHP est ici un choix d’implémentation, pas une obligation pour votre application.

## Est-ce réservé aux équipes PHP ? {#is-this-only-for-php-teams}

Non. PHP, Python et Rust disposent de SDK officiels. Une équipe dont l’application utilise uniquement Python ou Rust peut déployer Server comme infrastructure, écrire ses workflows et activités avec son SDK natif et communiquer par le protocole public. Son application n’intègre pas Laravel et ne devient pas une application Laravel.

Les parcours d’adoption sont distincts :

- **Server autonome** : les opérateurs déploient l’image publiée, sa base, sa file ou son cache, son planificateur et ses rôles API. Les équipes applicatives connectent leurs workers PHP, Python ou Rust. Server possède l’état d’orchestration et les frontières publiques de contrôle et de worker.
- **Mode intégré** : une application Laravel installe le package PHP Workflow et exploite le moteur avec sa propre file, base, configuration et procédure de déploiement. Cet avantage natif de Laravel n’est pas un prérequis du mode autonome.
- **Cloud géré** : Durable Workflow Cloud exploite le runtime, la persistance, le placement et la récupération. Les équipes exécutent clients SDK et workers contre un namespace Cloud provisionné. Elles ne déploient pas cette distribution Server pour Cloud et n’y raccordent pas un Server auto-hébergé. Voir [Runtime Cloud géré](/docs/polyglot/cloud-control-plane/).

Les trois choix partagent les mêmes concepts d’exécution durable. Les workers externes autonomes ou Cloud utilisent des noms de types workflow/activité stables et une enveloppe de codec commune. Un enfant ou une activité entre langages conserve ainsi la forme du payload sans exposer la sérialisation PHP.

Pour choisir entre Server autonome et package intégré, commencez par [Modes de déploiement](/docs/polyglot/deployment-modes). Cette page décrit la distribution en mode service.

Utilisez Server autonome pour :
- **Workflows polyglottes** : partager un runtime entre workers PHP, Python et Rust
- **Orchestration de microservices** : coordonner des services de langages différents
- **Runtime centralisé** : partager un moteur entre plusieurs applications
- **Applications hors Laravel** : utiliser Durable Workflow sans Laravel

Si vous utilisez déjà v2 intégré à Laravel, suivez le [guide de migration vers Server](/docs/polyglot/embedded-to-server) pour préparer les clés de type, déployer Server à côté de l’exécution intégrée, connecter les workers et n’acheminer que les nouveaux démarrages vers Server. Gardez les [modes de déploiement](/docs/polyglot/deployment-modes) à portée pour préserver explicitement identifiants, résultats des commandes, sémantique des tâches et responsabilités du runtime.

Consultez [Compatibilité et routage des workers](/docs/polyglot/worker-compatibility-routing) pour mettre à jour des cohortes de builds, retirer d’anciennes cohortes ou maintenir les runs longs sur des exécuteurs compatibles lors d’un retour arrière.

Consultez [Topologie des rôles Server](/docs/polyglot/server-role-topology) pour le vocabulaire des rôles, classes de processus, frontières d’autorité, domaines de panne et étapes de migration publiés par `GET /api/cluster/info`.

## Démarrage rapide {#quick-start}

### Image publiée et SQLite {#published-image--sqlite}

Le démarrage sans code source le plus rapide utilise l’image Docker publiée. Cet exemple utilise SQLite, une file en base et un cache fichier dans le conteneur. Montez `/app/database` pour que l’initialisation et l’API partagent le même fichier SQLite :

```bash
server_image=%%artifact.serverDockerHubImage%%
export DW_AUTH_TOKEN=dev-token

docker volume create durable-workflow-server-quickstart

docker run --rm \
  -v durable-workflow-server-quickstart:/app/database \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$server_image" server-bootstrap

docker rm -f durable-workflow-server durable-workflow-server-queue-worker >/dev/null 2>&1 || true
docker run -d --name durable-workflow-server \
  -p 127.0.0.1:8080:8080 \
  -v durable-workflow-server-quickstart:/app/database \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$server_image"

docker run -d --name durable-workflow-server-queue-worker \
  --health-cmd="server-process-healthcheck worker" \
  -v durable-workflow-server-quickstart:/app/database \
  -e DW_SERVER_PROCESS_CLASS=worker_node \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$server_image" php artisan queue:work database --queue=default --sleep=1 --tries=3

until curl -sf http://localhost:8080/api/ready >/dev/null; do sleep 1; done
curl http://localhost:8080/api/health
curl -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  http://localhost:8080/api/cluster/info \
  | jq '.topology | {current_shape, current_roles, execution_mode}'
```

Cela crée le namespace par défaut et lance l’API ainsi que son worker de file d’infrastructure. La file Laravel est `default`, distincte des files nommées du SDK. Ce worker fait avancer les timers durables pendant l’arrêt des workers SDK. L’évaluation des schedules et la maintenance de production nécessitent les rôles supplémentaires de la stack Compose publiée ci-dessous.

L’API est liée à l’interface locale et `dev-token` sert uniquement à cet exercice. Pour un accès distant, utilisez Compose avec vos identifiants, TLS et les contrôles réseau. Utilisez cette stack avec MySQL et Redis partagé pour répéter un déploiement de production.

Supprimez les conteneurs et la base de cet exercice lorsque vous avez terminé :

```bash
docker rm -f durable-workflow-server durable-workflow-server-queue-worker
docker volume rm durable-workflow-server-quickstart
```

### Image publiée et Compose {#published-image--compose}

Utilisez l’artefact Compose publié pour une stack multiconteneur sans source, avec MySQL et Redis :

```bash
curl -fsSLO https://raw.githubusercontent.com/durable-workflow/server/main/docker-compose.published.yml

server_image=%%artifact.serverDockerHubImage%%
export DW_AUTH_TOKEN=dev-token

env DW_SERVER_IMAGE="$server_image" docker compose \
  -f docker-compose.published.yml up -d --wait
curl -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  http://localhost:8080/api/cluster/info \
  | jq '.topology | {current_shape, current_roles, execution_mode}'
```

### Ports {#ports}

| Service | Port | Rôle |
|---------|------|---------|
| API Server | 8080 | Points d’accès de contrôle et du protocole worker |
| MySQL | 3306 | Base de données exposée pour faciliter le développement |
| Redis | 6379 | Cache et file exposés pour faciliter le développement |

## Configuration {#configuration}

Server se configure par variables d’environnement. Les principaux paramètres sont résumés ci-dessous. Le contrat opérateur complet `DW_*` est décrit dans la [référence de configuration](/docs/polyglot/server-config-reference).

### Base de données {#database}

```bash
DB_CONNECTION=mysql
DB_HOST=mysql
DB_PORT=3306
DB_DATABASE=workflow
DB_USERNAME=workflow
DB_PASSWORD=secret
```

Pris en charge : MySQL 8.0+, PostgreSQL 13+, SQLite 3.35+.

### Cache et file {#cache-and-queue}

```bash
CACHE_STORE=redis
QUEUE_CONNECTION=redis

REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=null
REDIS_DB=0
```

Le cache doit fournir des [verrous atomiques](https://laravel.com/docs/12.x/cache#atomic-locks). Pilotes de file : Redis, Amazon SQS, Beanstalkd, base de données.

Les verrous atomiques du cache sont nécessaires aux [plafonds d’admission des files](/docs/polyglot/task-queue-admission) et à la contre-pression des requêtes de lecture. Utilisez Redis en multinœud pour appliquer ces limites à tous les processus Server.

### Authentification {#authentication}

Server prend en charge trois modes d’authentification :

**Par jeton** (par défaut) :

```bash
DW_AUTH_DRIVER=token
DW_AUTH_TOKEN=your-secret-token-here
```

Chaque requête doit envoyer `Authorization: Bearer your-secret-token-here`.

Pour limiter les privilèges, configurez des jetons par rôle plutôt qu’un jeton commun :

```bash
DW_AUTH_DRIVER=token
DW_WORKER_TOKEN=worker-secret
DW_OPERATOR_TOKEN=operator-secret
DW_ADMIN_TOKEN=admin-secret
```

Les jetons worker permettent l’enregistrement, le polling, les heartbeats et la fin des tâches. Les jetons opérateur peuvent démarrer, lister, signaler, interroger, mettre à jour, réparer, annuler, terminer, archiver et observer les workflows. Les jetons administrateur accèdent notamment à la gestion des namespaces et de la rétention.

**Signature HMAC** :

```bash
DW_AUTH_DRIVER=signature
DW_SIGNATURE_KEY=your-signature-secret
```

Chaque requête inclut `X-Signature`, calculée par `hash_hmac('sha256', request_body, DW_SIGNATURE_KEY)`. Server accepte aussi des clés de signature par rôle :

```bash
DW_AUTH_DRIVER=signature
DW_WORKER_SIGNATURE_KEY=worker-signature-secret
DW_OPERATOR_SIGNATURE_KEY=operator-signature-secret
DW_ADMIN_SIGNATURE_KEY=admin-signature-secret
```

**Sans authentification** (développement uniquement) :

```bash
DW_AUTH_DRIVER=none
```

**N’utilisez pas `none` en production.** Tous les points d’accès deviennent publics.

### Package Workflow {#workflow-package}

L’image Docker installe `durable-workflow/workflow`. Pour choisir sa version :

```bash
# Build-time arg (set in docker-compose.yml or pass to docker build)
WORKFLOW_PACKAGE_REF=v2        # branch, tag, or commit
WORKFLOW_PACKAGE_SOURCE=       # custom Git remote (optional)
```

### Conservation {#retention}

PHP Server sélectionne l’historique des runs fermés à nettoyer selon la rétention du namespace. La durée bornée par défaut se configure ainsi :

```bash
DW_HISTORY_RETENTION_DAYS=30
```

Chaque passage utilise la politique **actuelle** du namespace. Une modification de durée s’applique aussi à l’historique déjà fermé avant ce changement. Elle n’accorde pas à chaque run une nouvelle période commençant à la date de modification.

| Changement de politique | Effet sur les runs fermés conservés |
| --- | --- |
| Raccourcir la rétention bornée | Des runs plus anciens peuvent être éligibles au prochain passage. |
| Allonger la rétention bornée | Des runs encore conservés peuvent ne plus être éligibles. L’historique déjà supprimé n’est pas restauré. |
| Passer à `forever` | Aucun run n’est sélectionné, même par les passages explicites. |
| Passer de `forever` à `bounded` | Fournissez `retention_days`. L’historique fermé existant est évalué selon cette durée. |

Par exemple, le **19 octobre à 12:00 UTC**, un run fermé le **1er octobre à 12:00 UTC** a 18 jours. Il est hors d’une fenêtre de 7 jours et dans une fenêtre de 90 jours. Passer de 90 à 7 jours le rend immédiatement éligible, puis un passage ultérieur peut le nettoyer. Un run fermé exactement à la borne est exclu de ce passage, qui utilise une comparaison strictement antérieure.

#### Vérifier une modification de conservation {#review-a-retention-change}

Avant de raccourcir la rétention, examinez les dates de fermeture et préservez l’historique requis. Exportez les runs importants via l’[API d’export](./server-api-reference.md#workflow-control-plane) et conservez des sauvegardes récupérables de la base et des payloads externes. Un export de relecture doit conserver ses objets référencés et ne remplace pas une sauvegarde de la base et du stockage.

Modifiez le namespace avec un identifiant administrateur :

```bash
curl -sS -X PUT "$DURABLE_WORKFLOW_SERVER_URL/api/namespaces/orders-prod" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"retention_mode":"bounded","retention_days":7}'
```

Pour `forever`, envoyez `{"retention_mode":"forever","retention_days":null}`. Le retour à une rétention bornée nécessite une durée explicite de 1 à 365 jours.

Inspectez la politique actuelle et la liste bornée des runs éligibles :

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/system/retention?limit=100" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

`cutoff` décrit le passage courant. `expired_run_count` compte les identifiants renvoyés, dans la limite de `scan_limit`, pas toute la file d’attente. `scan_pressure: true` signifie que cette limite a été atteinte. Cette lecture ne supprime aucun historique.

La modification n’est ni une prévisualisation du nettoyage ni un délai de grâce : les heartbeats ordinaires peuvent déjà déclencher un petit passage de rétention limité après le changement. Les tâches planifiées `history:prune` et passages système explicites peuvent aussi traiter les runs éligibles. Sauvegardez et vérifiez **avant** de raccourcir la politique.

#### Nettoyage et protections {#retention-cleanup-and-protections}

`POST /api/system/retention/pass` sans `run_ids` sélectionne les runs expirés selon la politique actuelle, jusqu’à sa limite. Inspectez `pruned`, `skipped`, `failed` et les motifs par run pour distinguer sélection et suppression réellement terminée.

:::warning Les identifiants de run explicites contournent la sélection par âge

Dans PHP Server, fournir `run_ids` cible directement ces runs fermés, même plus récents que la fenêtre bornée actuelle. Ce n’est pas une intersection avec la liste des runs expirés. Examinez chaque cible comme une opération destructive. Omettez `run_ids` pour le nettoyage ordinaire selon l’âge.

:::

Les passages ignorent les runs archivés et les namespaces en mode `forever`. L’archive conserve l’historique dans la même base, sans créer de sauvegarde indépendante. D’autres blocages, comme du travail d’activité détachée inachevé, peuvent aussi empêcher la suppression. Vérifiez le motif rapporté plutôt que de supposer qu’un run sélectionné a été supprimé.

Pour conserver plus longtemps que 1 à 365 jours, choisissez entre l’historique en base et des exports indépendants vérifiés. La [procédure d’historique long terme](../configuration/pruning-workflows.md#keeping-history-beyond-database-retention) couvre `CloseTime`, pagination, objets externes et réconciliation avant suppression. L’API publiée n’a pas de désarchivage. Un run archivé ne peut donc plus être supprimé par les passages de rétention Server.

Le nettoyage supprime historique, détails associés et payloads externes éligibles. Allonger la politique ensuite ne les récupère pas. Le [guide de nettoyage intégré](../configuration/pruning-workflows.md) décrit un processus distinct, géré par l’application, dont l’API n’applique pas la politique de namespace Server. Pour un autre runtime, vérifiez sa rétention avant d’appliquer cette procédure PHP.

### Espaces de noms {#namespaces}

`server-bootstrap` exécute les migrations et crée le namespace `default`. Utilisez `DW_DEFAULT_NAMESPACE` pour changer celui utilisé lorsqu’une requête omet l’en-tête de namespace :

```bash
DW_DEFAULT_NAMESPACE=default
```

Créez les espaces de noms par l’API :

```bash
curl -X POST http://localhost:8080/api/namespaces \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "production",
    "description": "Production workflows",
    "retention_days": 90
  }'
```

## Vérifications de santé {#health-checks}

### Santé de l’API {#api-health}

```bash
curl http://localhost:8080/api/health
```

Renvoie `200 OK` avec :

```json
{
  "status": "serving",
  "timestamp": "2026-04-15T12:00:00Z",
  "checks": {
    "database": "ok"
  },
  "topology": {
    "schema": "durable-workflow.v2.role-topology",
    "version": 4,
    "current_shape": "standalone_server",
    "current_process_class": "server_http_node",
    "current_roles": ["api_ingress", "control_plane", "matching", "history_projection"],
    "execution_mode": "remote_worker_protocol",
    "matching_role": {
      "queue_wake_enabled": true,
      "shape": "in_worker",
      "wake_owner": "worker_loop",
      "task_dispatch_mode": "poll",
      "partition_primitives": ["connection", "queue", "compatibility", "namespace"],
      "backpressure_model": "lease_ownership",
      "discovery_limits": {
        "poll_batch_cap": 100,
        "availability_ceiling_seconds": 1,
        "wake_signal_ttl_seconds": 60,
        "workflow_task_lease_seconds": 300,
        "activity_task_lease_seconds": 300
      }
    }
  }
}
```

### Résumé public de topologie {#public-topology-summary}

Les routes sans authentification `GET /api/health` et `GET /api/ready` publient toutes deux le résumé `topology` du nœud qui répond. Ce bloc public est volontairement plus petit que `/api/cluster/info`, mais expose les champs permettant d’identifier les rôles avant authentification ou résolution du namespace :

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

`topology.matching_role.discovery_limits` est le contrat numérique figé d’attribution, compilé dans le package : `poll_batch_cap` est le lot maximal de tâches prêtes par poll ; `availability_ceiling_seconds` est la tolérance entre backends appliquée à `available_at` pour absorber les décalages d’horodatage inférieurs à la seconde ; `wake_signal_ttl_seconds` est le TTL par défaut des signaux `CacheLongPollWakeStore` ; `workflow_task_lease_seconds` et `activity_task_lease_seconds` sont les baux par défaut. Réduire ces valeurs modifie le protocole, car workers et outils les lisent comme contrat faisant autorité.

Le même résumé apparaît sur `/api/ready` même si le déploiement n’est pas prêt. Les sondes peuvent ainsi distinguer `server_http_node`, `scheduler_node`, `matching_node` et `execution_node` pendant les blocages d’initialisation.

### Disponibilité au trafic {#readiness}

```bash
curl http://localhost:8080/api/ready
```

`/api/ready` est la barrière de déploiement. Elle ne renvoie `200 OK` que si les prérequis d’initialisation et la sûreté de mise à jour sont prêts ou présentent un simple avertissement.

Interprétez les champs lisibles par machine ainsi :

- `checks.migrations.repository_exists` et `checks.migrations.pending_migrations` indiquent l’existence du registre de migrations et les migrations encore en attente.
- `checks.migrations.adoptable_migrations` liste les créations de tables qui nécessitent seulement l’enregistrement dans l’historique de migrations. C’est un `warning`, pas une indisponibilité bloquante : Server reste prêt pendant la planification de cette adoption.
- `checks.migrations.blocking_migrations` liste les migrations de sûreté nécessaires avant admission du trafic. Si le tableau n’est pas vide, la disponibilité échoue avec `checks.migrations.status = "pending"`.
- `checks.migrations.missing_tables` signale les tables durables absentes. `checks.migrations.operator_surface` indique si l’interface opérateur v2 peut suffisamment expliquer la sûreté du démarrage.
- `checks.migrations.readiness_contract.version` fixe la révision du contrat d’initialisation et d’adoption que les scripts doivent analyser.
- `checks.workflow_v2` reflète la sûreté de mise à jour sur tous les namespaces. Si elle ne peut pas être évaluée, `status: "blocked"`, `blocked_by`, `message` et `remediation` indiquent comment corriger la dépendance amont plutôt que chercher des symptômes de file.

### Barrière d’initialisation des workflows {#workflow-bootstrap-gate}

`checks.workflow_v2.status: "blocked"` est aussi une barrière de route. Pendant ce blocage, les démarrages et mutations de workflows, mutations de schedules, adaptateurs de pont et routes worker refusent avec HTTP `503` et `reason: "workflow_v2_blocked"`. La vérification suit celle du rôle et de la version de protocole mais précède la résolution du namespace. Les requêtes bloquées n’observent donc pas son existence.

La réponse de blocage d’initialisation contient toujours :

- `reason: "workflow_v2_blocked"` pour brancher le client sur un nom stable, pas sur le message
- `blocked_by` : la liste ordonnée des dépendances de disponibilité bloquantes, par exemple `migrations`
- `remediation` : les instructions opérateur pour lever ces blocages, identiques à `/api/ready` `checks.workflow_v2.remediation`

Familles de routes soumises à cette barrière :

- **Démarrage et mutation des workflows** : routes de démarrage, commandes et commandes ciblant un run sous `/api/workflows`.
- **Mutation des schedules** : `POST /api/schedules`, `PUT /api/schedules/{scheduleId}`, `DELETE /api/schedules/{scheduleId}`, `POST /api/schedules/{scheduleId}/pause`, `POST /api/schedules/{scheduleId}/resume`, `POST /api/schedules/{scheduleId}/trigger` et `POST /api/schedules/{scheduleId}/backfill`.
- **Adaptateurs de pont** : `POST /api/bridge-adapters/webhook/{adapter}`.
- **Protocole worker** : toutes les routes `/api/worker` et `/api/worker/*`, y compris enregistrement, heartbeat et tâches workflow, requête de lecture et activité. Elles gardent l’enveloppe worker et l’en-tête `X-Durable-Workflow-Protocol-Version` pour analyser le même `reason: "workflow_v2_blocked"` que le plan de contrôle.

Les **lectures** de schedules sont exemptées pour permettre l’inspection pendant la récupération : `GET /api/schedules`, `GET /api/schedules/{scheduleId}` et `GET /api/schedules/{scheduleId}/history` restent disponibles pendant le blocage.

### Capacités de Server {#server-capabilities}

```bash
curl http://localhost:8080/api/cluster/info \
  -H "Authorization: Bearer $TOKEN"
```

Renvoie la version du build Server, les SDK pris en charge, les capacités du moteur, la politique de compatibilité client et les manifestes du plan de contrôle et du protocole worker versionnés indépendamment :

```json
{
  "server_id": "server-1",
  "version": "2.0.0",
  "default_namespace": "default",
  "supported_sdk_versions": {
    "php": ">=1.0",
    "python": ">=0.2,<1.0",
    "cli": ">=0.1,<1.0"
  },
  "client_compatibility": {
    "schema": "durable-workflow.v2.client-compatibility",
    "version": 1,
    "authority": "protocol_manifests",
    "top_level_version_role": "informational",
    "fail_closed": true
  },
  "capabilities": {
    "workflow_tasks": true,
    "activity_tasks": true,
    "signals": true,
    "queries": true,
    "updates": true,
    "schedules": true,
    "child_workflow_retry_policy": true,
    "child_workflow_timeouts": true,
    "payload_codecs": ["avro"],
    "response_compression": ["gzip", "deflate"]
  },
  "control_plane": {
    "version": "2",
    "header": "X-Durable-Workflow-Control-Plane-Version",
    "request_contract": { "schema": "durable-workflow.v2.control-plane-request.contract", "version": 1, "...": "..." },
    "response_contract": { "schema": "durable-workflow.v2.control-plane-response.contract", "version": 1, "...": "..." }
  },
  "worker_protocol": {
    "version": "1.0",
    "server_capabilities": {
      "long_poll_timeout": 30,
      "supported_workflow_task_commands": [
        "complete_workflow",
        "fail_workflow",
        "continue_as_new",
        "schedule_activity",
        "start_timer",
        "start_child_workflow"
      ],
      "workflow_task_poll_request_idempotency": true,
      "poll_status": true,
      "history_page_size_default": 500,
      "history_page_size_max": 1000,
      "activity_retry_policy": true,
      "activity_timeouts": true,
      "child_workflow_retry_policy": true,
      "child_workflow_timeouts": true,
      "parent_close_policy": true,
      "non_retryable_failures": true,
      "response_compression": ["gzip", "deflate"],
      "history_compression": {
        "supported_encodings": ["gzip"],
        "compression_threshold": 8192
      }
    }
  }
}
```

`client_compatibility.authority: "protocol_manifests"` fait autorité pour les vérifications client. Le `version` principal identifie le build. CLI et SDK doivent refuser si `control_plane.version`, `control_plane.request_contract` ou `worker_protocol.version` est absent ou non pris en charge.

### Topologie des rôles et forme de déploiement {#role-topology-and-deployment-shape}

La référence détaillée de ce manifeste se trouve dans [Topologie des rôles Server](/docs/polyglot/server-role-topology). Cette section conserve l’exemple intégré `cluster/info`. Utilisez la page dédiée pour les formes prises en charge, frontières d’autorité, domaines de panne, limites de dimensionnement et étapes de migration.

`GET /api/cluster/info` publie aussi un manifeste `topology`, la carte de rôles lisible par machine du nœud qui répond. Les opérateurs et outils disposent ainsi d’un contrat unique sans déduire les fonctions des noms de conteneurs ou des guides de déploiement.

```json
{
  "topology": {
    "schema": "durable-workflow.v2.role-topology",
    "version": 2,
    "supported_shapes": [
      "embedded",
      "standalone_server",
      "split_control_execution"
    ],
    "role_vocabulary": [
      "api_ingress",
      "control_plane",
      "matching",
      "history_projection",
      "scheduler",
      "execution_plane"
    ],
    "current_shape": "standalone_server",
    "current_process_class": "server_http_node",
    "current_roles": [
      "api_ingress",
      "control_plane",
      "matching",
      "history_projection"
    ],
    "execution_mode": "remote_worker_protocol",
    "matching_role": {
      "queue_wake_enabled": true,
      "shape": "in_worker",
      "wake_owner": "worker_loop",
      "task_dispatch_mode": "poll",
      "partition_primitives": [
        "connection",
        "queue",
        "compatibility",
        "namespace"
      ],
      "backpressure_model": "lease_ownership",
      "discovery_limits": {
        "poll_batch_cap": 100,
        "availability_ceiling_seconds": 1,
        "wake_signal_ttl_seconds": 60,
        "workflow_task_lease_seconds": 300,
        "activity_task_lease_seconds": 300
      }
    },
    "shape_assignments": {
      "embedded": {
        "process_classes": [
          {
            "name": "application_process",
            "roles": [
              "control_plane",
              "matching",
              "history_projection",
              "scheduler",
              "execution_plane"
            ]
          }
        ]
      },
      "standalone_server": {
        "process_classes": [
          {
            "name": "server_http_node",
            "roles": [
              "api_ingress",
              "control_plane",
              "matching",
              "history_projection"
            ]
          },
          {
            "name": "scheduler_node",
            "roles": ["scheduler"]
          },
          {
            "name": "worker_node",
            "roles": ["execution_plane"]
          }
        ]
      },
      "split_control_execution": {
        "process_classes": [
          {
            "name": "ingress_node",
            "roles": ["api_ingress"]
          },
          {
            "name": "control_plane_node",
            "roles": ["control_plane", "history_projection"]
          },
          {
            "name": "scheduler_node",
            "roles": ["scheduler"]
          },
          {
            "name": "matching_node",
            "roles": ["matching"]
          },
          {
            "name": "execution_node",
            "roles": ["execution_plane"]
          }
        ]
      }
    },
    "authority_boundaries": {
      "control_plane": {
        "writes": [
          "workflow_instances",
          "workflow_runs.status",
          "workflow_tasks.lifecycle"
        ]
      },
      "execution_plane": {
        "writes": [
          "workflow_tasks.outcomes",
          "activity_attempts",
          "worker_compatibility_heartbeats"
        ]
      },
      "matching": {
        "writes": [
          "workflow_tasks.leases",
          "activity_tasks.leases"
        ]
      },
      "history_projection": {
        "writes": [
          "history_events",
          "workflow_run_summaries",
          "workflow_history_exports"
        ]
      },
      "scheduler": {
        "writes": [
          "workflow_schedules.fire_state",
          "workflow_starts.scheduled"
        ]
      },
      "api_ingress": {
        "writes": ["worker_registrations"]
      }
    },
   "failure_domains": {
      "control_plane_down": {
        "effect": "workers_continue_claimed_tasks_only_until_lease_expiry",
        "operator_signal": "operator_commands_fail_fast"
      },
      "execution_plane_down": {
        "effect": "ready_tasks_accumulate_without_loss",
        "operator_signal": "operators_see_ready_depth_growth"
      },
      "matching_down": {
        "effect": "claim_falls_back_to_direct_ready_task_discovery",
        "operator_signal": "ready_depth_rises_while_claim_rate_falls"
      },
      "history_projection_down": {
        "effect": "projection_reads_may_stale_while_durable_writes_continue",
        "operator_signal": "projection_lag_seconds_may_increase"
      },
      "scheduler_down": {
        "effect": "scheduled_workflows_stop_firing_and_record_missed_runs",
        "operator_signal": "operators_see_missed_schedule_state"
      },
      "api_ingress_down": {
        "effect": "external_http_traffic_stops_at_the_edge",
        "operator_signal": "embedded_in_process_calls_may_continue"
      }
    },
    "scaling_boundaries": {
      "api_ingress": "incoming_http_request_rate",
      "control_plane": "operator_commands_and_run_lifecycle_transitions",
      "matching": "ready_task_rate_and_poller_count",
      "history_projection": "durable_event_rate",
      "scheduler": "active_schedule_count",
      "execution_plane": "workflow_and_activity_task_rate"
    },
    "migration_path": [
      {
        "step": "audit_role_boundaries",
        "result": "tooling flags cross-role writes before runtime shape changes",
        "reversible": true
      },
      {
        "step": "expose_role_bindings",
        "result": "container seams allow out-of-process adapters without patching the package",
        "reversible": true
      },
      {
        "step": "introduce_dedicated_matching_shape",
        "result": "matching can run as its own process class without changing the claim contract",
        "reversible": true
      },
      {
        "step": "split_history_projection",
        "result": "history and projections can move out of process without introducing a second writer",
        "reversible": true
      },
      {
        "step": "split_scheduler",
        "result": "schedule firing can move behind leader election while single-replica deployments stay legal",
        "reversible": true
      },
      {
        "step": "optional_execution_partitioning",
        "result": "workers can partition by namespace, connection, queue, and compatibility",
        "reversible": true
      }
    ],
    "kernel_invariants": [
      {
        "id": "single_persistence_engine",
        "summary": "one workflow database backs every topology shape; role split does not introduce a second persistence engine",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "single_worker_protocol",
        "summary": "one HTTP worker protocol carries claim, complete, fail, and heartbeat traffic across every topology; role split does not fork the worker contract",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "single_history_writer",
        "summary": "history_events has exactly one durable writer per logical event regardless of where the history/projection role runs",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "single_control_authority_per_run",
        "summary": "every mutation of a given workflow run routes through one control-plane authority; per-run row locks serialise transitions across replicas",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "embedded_topology_remains_supported",
        "summary": "the embedded shape where one process fills every role MUST stay legal; existing embedded hosts are never forced to migrate",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "role_split_is_topology_only",
        "summary": "splitting roles is a topology change, not a product fork; collapsing the roles back onto a single process is always a legal topology",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      }
    ]
  },
  "coordination_health": {
    "schema": "durable-workflow.v2.coordination-health.contract",
    "version": 2,
    "namespace_scope": "all_namespaces",
    "status": "ok",
    "http_status": 200,
    "warning_checks": [],
    "error_checks": [],
    "categories": {
      "correctness": "ok"
    },
    "checks": [
      {
        "name": "worker_compatibility",
        "status": "ok",
        "category": "correctness",
        "message": null
      },
      {
        "name": "activity_path",
        "status": "ok",
        "category": "correctness",
        "message": null
      }
    ],
    "routing_drains": {
      "queues_with_drains": 0,
      "draining_build_id_count": 0,
      "active_worker_count": 0,
      "draining_worker_count": 0,
      "stale_worker_count": 0,
      "queues": []
    }
  }
}
```

`topology.version` est la version de schéma du manifeste de rôles, distincte de la version du build Server. Vérifiez-la avant de supposer la présence de champs plus récents. Le contrat actuel comprend `supported_shapes`, `role_vocabulary`, `current_shape`, `current_process_class`, `current_roles`, `execution_mode`, `matching_role`, `role_catalog`, `shape_assignments`, `authority_boundaries`, `authority_surfaces`, `failure_domains`, `supported_topologies`, `scaling_boundaries`, `migration_path` et `kernel_invariants`.

Lisez les champs ainsi :

- `supported_shapes` nomme les topologies autorisées.
- `role_vocabulary` est la liste fixe des rôles v2, canonique pour les outils et diagnostics.
- `current_shape`, `current_process_class` et `current_roles` décrivent le nœud interrogé. Utilisez la classe comme identité déclarée, puis comparez ses rôles à `shape_assignments` pour valider cette déclaration.
- `execution_mode` distingue l’exécution intégrée sur file locale (`local_queue_worker`) de l’exécution autonome par protocole worker (`remote_worker_protocol`).
- `matching_role.queue_wake_enabled`, `matching_role.shape`, `matching_role.wake_owner`, `matching_role.task_dispatch_mode`, `matching_role.partition_primitives` et `matching_role.backpressure_model` indiquent si le réveil est interne au worker ou confié à une boucle dédiée, les axes de routage stables et la frontière d’admission durable appliquée.
- `matching_role.discovery_limits` fixe les valeurs numériques compilées : `poll_batch_cap`, lot maximal de tâches prêtes par poll ; `availability_ceiling_seconds`, tolérance de `available_at` aux décalages inférieurs à la seconde entre backends ; `wake_signal_ttl_seconds`, TTL des signaux ; `workflow_task_lease_seconds` et `activity_task_lease_seconds`, baux par défaut. Ces champs permettent de vérifier le contrat sans lire le code du package. Réduire une valeur modifie le protocole.
- `role_catalog` et `authority_surfaces` précisent les interfaces et mutations durables de chaque rôle dans cette révision.
- `shape_assignments` associe chaque forme prise en charge à ses classes de processus et ensembles de rôles autorisés.
- `supported_topologies` résume les familles de déploiement et classes attendues.
- `authority_boundaries` indique les écritures durables permises à chaque rôle pour repérer les écarts avant séparation du déploiement.
- `failure_domains` décrit le premier signe de dégradation visible lorsqu’un rôle tombe.
- `scaling_boundaries` nomme la dimension principale de charge de chaque rôle séparé.
- Les routes hébergées authentifiées refusent si le nœud n’héberge pas l’interface HTTP : `503`, `reason: "topology_role_unavailable"`, `current_shape`, `current_process_class`, `current_roles`, `required_roles` et `missing_roles` permettent de viser un nœud approprié.
- `coordination_health` résume la sûreté de déploiement de la flotte sur `all_namespaces`, avec état, posture HTTP et noms normalisés des avertissements et erreurs de disponibilité. Un blocage amont ajoute `blocked_by`, `message` et `remediation`.
- `coordination_health.checks[]` inclut toujours la vérification figée `activity_path`, à côté de `worker_compatibility`, `task_transport`, `routing_health`, `durable_resume_paths` et des vérifications de projection/planificateur. Équivalent activité de `task_transport`, `activity_path` rapporte les délais dépassés sans application (`timeout_overdue`, `oldest_timeout_overdue_at`, `max_timeout_overdue_age_ms`) et les reprises persistantes (`retrying`, `oldest_retrying_started_at`, `max_retrying_age_ms`). Renommer cette vérification modifie le protocole.
- `coordination_health.routing_drains` résume les cohortes en drainage par file et namespace. `queues_with_drains` supérieur à zéro indique un retrait volontaire du trafic d’au moins une cohorte.
- `migration_path` liste les étapes ordonnées vers une séparation accrue des rôles, sans second moteur. `reversible: true` signifie qu’un retour à une forme moins séparée reste une topologie légale.
- `kernel_invariants` énumère les garanties à préserver : `single_persistence_engine`, `single_worker_protocol`, `single_history_writer`, `single_control_authority_per_run`, `embedded_topology_remains_supported` et `role_split_is_topology_only`. `applies_to` indique les formes couvertes. Les outils de déploiement PEUVENT vérifier ces invariants avant modification.

La séparation des rôles reste une évolution de topologie, sans second moteur ni autre API de contrôle. En passant de `standalone_server` à `split_control_execution`, l’opérateur lit le même point de découverte. `current_shape`, `current_roles`, `execution_mode`, `matching_role`, `shape_assignments`, `authority_boundaries`, `failure_domains`, `scaling_boundaries` et `migration_path` sont versionnés ensemble afin que les outils interprètent la topologie réellement livrée.

`topology.kernel_invariants` expose cette contrainte aux outils pour vérifier, avant application, qu’un changement n’introduit ni second moteur de persistance, ni protocole worker divergent, ni second rédacteur d’historique, ni migration irréversible.

La barrière de rôle ne concerne que les routes API et worker authentifiées. `GET /api/health`, `GET /api/ready` et le `GET /api/cluster/info` authentifié restent disponibles pour découverte, vie du processus et topologie, même sur `scheduler_node`, `matching_node` et `execution_node` sans interface HTTP de contrôle.

Pour les gestionnaires externes indépendants du transport, ce point publie aussi `worker_protocol.external_execution_surface_contract`. Le manifeste nomme l’[interface d’exécution externe de niveau activité](/docs/polyglot/external-execution), lie les enveloppes d’entrée/résultat des tâches et conserve relecture, `ContinueAsNew`, ordre signaux/mises à jour/requêtes et interprétation de l’historique dans les véritables runtimes.

Points importants pour le code client :

- La version applicative est `version`, pas `server_version`.
- Les commandes de tâches se trouvent sous `worker_protocol.server_capabilities.supported_workflow_task_commands`, pas directement sous `worker_protocol`. Le même objet est renvoyé dans chaque réponse worker via `server_capabilities`.
- `worker_protocol.server_capabilities.poll_status` garantit un champ lisible `poll_status` même sans tâche attribuée : `empty`, `throttled`, `unavailable` et `draining` se distinguent sans analyser les messages.
- Les options de commande, dont reprises, délais, politique de fermeture parent et échecs non réessayables, sont aussi dans `server_capabilities` pour négocier sans autre appel de découverte.
- Le seul codec v2 est `capabilities.payload_codecs`, exactement `['avro']`. Les sérialiseurs PHP v1 d’import/drainage sont internes à la migration et ne sont jamais annoncés.

## Connecter les workers {#connecting-workers}

Les workers interrogent Server pour recevoir des tâches et exécutent workflows ou activités. Consultez le [protocole worker](/docs/polyglot/worker-protocol) pour le contrat complet. La matrice des rôles, la résolution du namespace et le payload exact d’enregistrement se trouvent dans [Namespace, authentification et enregistrement](/docs/polyglot/namespace-auth-workers).

### Workers PHP {#php-workers}

Les applications PHP indépendantes du framework et les workers distants utilisent le SDK Server autonome. Ils n’installent ni Laravel ni le package Workflow intégré :

<!-- docs-example id="server.php-sdk.install" -->
```bash
composer require %%artifact.phpSdkComposerPackage%%
```

Créez un client et enregistrez les fonctions de workflow ou d’activité avec un worker :

```php
use DurableWorkflow\Client;
use DurableWorkflow\Worker;
use DurableWorkflow\Worker\WorkflowContext;

$client = new Client(
    'http://localhost:8080',
    token: getenv('DURABLE_WORKFLOW_AUTH_TOKEN') ?: null,
    namespace: 'default',
);

$worker = new Worker($client, taskQueue: 'polyglot-php');
$worker->registerWorkflow(
    'invoice',
    static function (WorkflowContext $context, string $invoiceId): array {
        $context->activity('charge-card', [$invoiceId]);

        return ['invoice_id' => $invoiceId, 'status' => 'paid'];
    },
);
$worker->run();
```

Le [guide SDK PHP](/docs/polyglot/php/) décrit client, authentification, payloads et cycle de vie des workers. Le package distinct `durable-workflow/workflow` fournit le runtime Laravel intégré et le moteur de l’image Server publiée. Les workflows Laravel intégrés exécutent leurs tâches locales via le worker de file de l’application, sans nécessiter Server autonome.

### Workers Python {#python-workers}

Les workers Python utilisent le SDK `durable-workflow` :

```bash
pip install %%artifact.pythonPackagePin%%
```

Voir le [guide SDK Python](/docs/polyglot/python) pour configurer un worker.

### Workers dans un autre langage {#custom-language-workers}

Un langage quelconque peut implémenter un worker :
1. S’enregistrer avec `POST /api/worker/register`
2. Interroger les tâches avec `POST /api/worker/workflow-tasks/poll`, `POST /api/worker/activity-tasks/poll` ou `POST /api/worker/query-tasks/poll`
3. Terminer les tâches avec `POST /api/worker/workflow-tasks/{id}/complete`, `POST /api/worker/activity-tasks/{id}/complete` ou `POST /api/worker/query-tasks/{id}/complete`

Toutes les requêtes exigent :
- `Authorization: Bearer $TOKEN`
- `X-Namespace: your-namespace`
- `X-Durable-Workflow-Protocol-Version: 1.0`

Server vérifie l’existence du namespace. Créez-le avec `POST /api/namespaces` avant d’y envoyer workers ou clients, sinon la réponse est `404` avec `reason: "namespace_not_found"`.

Le [README Server](https://github.com/durable-workflow/server#getting-started-end-to-end-workflow) propose un parcours avec curl.

Consultez [Admission des files](/docs/polyglot/task-queue-admission) pour régler les emplacements des workers, baux actifs côté serveur, budgets par minute et contre-pression des requêtes.

## CLI {#cli}

La [CLI Durable Workflow](/docs/polyglot/cli) donne accès à Server depuis un shell :

```bash
# Install — Linux and macOS
curl -fsSL https://durable-workflow.com/install.sh | sh

# Install — macOS (Homebrew alternative)
brew install durable-workflow/tap/dw

# Install — Windows (PowerShell)
# irm https://durable-workflow.com/install.ps1 | iex

# Configure
export DURABLE_WORKFLOW_SERVER_URL=http://localhost:8080
export DURABLE_WORKFLOW_AUTH_TOKEN=your-token
export DURABLE_WORKFLOW_NAMESPACE=default

# Use
dw server:health
dw workflow:list
dw workflow:start --type=my-workflow --input='["value"]'
dw workflow:start --type=my-workflow --input-file=input.json
```

La [page d’installation CLI](/docs/polyglot/cli#install) propose un installateur qui détecte la plateforme et des binaires directs.

Les commandes de file incluent l’admission des tâches de workflow, activité et requête de lecture. Elles distinguent workers absents, emplacements saturés, plafonds serveur de baux ou de débit, et débordement des requêtes.

## Déploiement {#deployment}

Utilisez le [guide de déploiement auto-hébergé](/docs/deployment) pour choisir une topologie prise en charge avant de servir le trafic de production. Il distingue développement local, production mononœud, petits clusters, manifestes Kubernetes et topologies accompagnées.

Le petit cluster autonome a un périmètre précis : 2 à 3 API sans état derrière un répartiteur, une base MySQL ou PostgreSQL externe commune, Redis partagé, workers dimensionnés séparément et un seul planificateur ou processus de maintenance. Choisissez arrêt global ou [mise à jour progressive](/docs/rolling-upgrades) selon la version. Le contrat précise écart de versions, schéma, drainage, disponibilité et retour arrière. Clusters SQLite, multinœud sans Redis, planificateurs multiples, multirégion actif/actif et basculements propres aux fournisseurs restent hors contrat sans validation séparée. Le [guide de déploiement](/docs/deployment#helm-chart-for-kubernetes) décrit Helm, versionné séparément. Les indications [multirégion actif/passif](/docs/deployment#activepassive-multi-region) demandent un accompagnement, pas un contrat autonome 2.0 prouvé. Chaque région candidate doit partir d’une topologie monorégion ou petit cluster documentée.

Pour l’auto-hébergement, partez des images publiées plutôt que de builds du code source :

- Docker Hub : `%%artifact.serverDockerHubImage%%`
- GitHub Container Registry : `%%artifact.serverGhcrImage%%`
- Compose avec images publiées : [`docker-compose.published.yml`](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml)
- Manifestes Kubernetes : [`k8s/`](https://github.com/durable-workflow/server/tree/main/k8s)

En production, fixez un tag de version ou digest d’image, utilisez des identifiants par rôle, exécutez initialisation et migrations avant de servir le trafic et vérifiez `/api/ready`, `/api/cluster/info` et l’enregistrement des workers. Ne déplacez pas le trafic sur la seule base de `/api/health`.

## Référence API {#api-reference}

La [référence API Server](/docs/polyglot/server-api-reference) décrit chaque point d’accès, en-têtes et rôles requis, routes worker, stockage externe des payloads et motifs d’erreur nommés.

Server expose trois interfaces API :

### Plan de contrôle {#control-plane}

Démarrez, décrivez, signalez, interrogez, mettez à jour, annulez et terminez les workflows ; gérez namespaces, files, schedules, attributs de recherche et workers. Chaque requête de contrôle exige `X-Durable-Workflow-Control-Plane-Version: 2`. Son absence entraîne `missing_control_plane_version`.

Principaux points d’accès :
- `POST /api/workflows` : démarrer un workflow
- `GET /api/workflows/{id}` : décrire un workflow
- `POST /api/workflows/{id}/signal/{name}` : envoyer un signal
- `POST /api/workflows/{id}/query/{name}` : requête de lecture
- `POST /api/workflows/{id}/update/{name}` : mise à jour
- `POST /api/workflows/{id}/cancel` : fermer immédiatement comme annulé
- `POST /api/workflows/{id}/terminate` : terminer immédiatement
- `GET /api/workflows/{id}/runs/{runId}/history` : lister l’historique
- `GET /api/workflows/{id}/runs/{runId}/history/export` : exporter un bundle de relecture
- `GET /api/namespaces`, `POST /api/namespaces`, `GET|PUT /api/namespaces/{namespace}` : gérer les namespaces
- `GET /api/workers`, `GET|DELETE /api/workers/{id}` : gérer la flotte
- `GET /api/task-queues`, `GET /api/task-queues/{taskQueue}` : retards, pollers, baux et admission
- `GET|POST /api/schedules`, `GET|PUT|DELETE /api/schedules/{id}`, `POST /api/schedules/{id}/{pause|resume|trigger|backfill}` : gérer les schedules
- `GET|POST|DELETE /api/search-attributes` : gérer les attributs de recherche
- `GET|POST|PUT|DELETE /api/service-endpoints...` : catalogue de services administrateur, services imbriqués, liaisons d’opérations et instantanés durables des appels
- `POST /api/system/repair/pass`, `POST /api/system/activity-timeouts/pass`, `POST /api/system/retention/pass` : passages opérateur

Les réponses de contrôle, y compris les listes d’historique, incluent les métadonnées imbriquées `control_plane` d’opération et de version du contrat de réponse. L’export d’historique ne porte volontairement pas cette enveloppe. Il renvoie le bundle inchangé pour que somme de contrôle et signature facultative couvrent exactement l’artefact reçu.

Une validation échouée renvoie HTTP 422 avec `reason: validation_failed`, `errors` et `validation_errors`. Les routes workflow projettent aussi ces détails dans `control_plane.reason` et `control_plane.validation_errors`. Les commandes ciblant un run renvoient le `run_id` de l’URL dans la réponse et `control_plane.run_id`, pour distinguer commandes d’instance et commandes de run explicite.

La visibilité des files aide à distinguer un retard durable croissant, l’absence d’emplacements worker et les limites d’admission. `GET /api/task-queues` résume chaque file. `GET /api/task-queues/{taskQueue}` ajoute `pollers` et `current_leases`. Les deux exposent `stats.approximate_backlog_count`, `stats.approximate_backlog_age_seconds`, `stats.workflow_tasks.*` et `stats.activity_tasks.*`. Le détail inclut `admission` pour distinguer capacité worker et plafonds serveur ou requêtes. Les débits d’entrée et de distribution de flotte sont `operator_metrics.backlog.tasks_added_last_minute` et `operator_metrics.backlog.tasks_dispatched_last_minute`. Les files exposent le même comparatif via `stats.tasks_added_last_minute` et `stats.tasks_dispatched_last_minute`.

### Protocole worker {#worker-protocol}

Les workers s’enregistrent, interrogent les tâches, envoient des heartbeats et terminent les tâches. En-tête requis : `X-Durable-Workflow-Protocol-Version: 1.0`.

Principaux points d’accès :
- `POST /api/worker/register` : enregistrer un worker
- `POST /api/worker/workflow-tasks/poll` : long poll de tâches workflow
- `POST /api/worker/workflow-tasks/{id}/complete` : terminer une tâche workflow
- `POST /api/worker/query-tasks/poll` : long poll de requêtes de lecture routées par Server
- `POST /api/worker/query-tasks/{id}/complete` : terminer une requête
- `POST /api/worker/query-tasks/{id}/fail` : faire échouer ou refuser une requête
- `POST /api/worker/activity-tasks/poll` : long poll d’activités
- `POST /api/worker/activity-tasks/{id}/complete` : terminer une activité

Voir le [protocole worker](/docs/polyglot/worker-protocol) pour les détails.

### Découverte sans version {#discovery-unversioned}

Seuls les points de découverte et de santé n’exigent **pas** `X-Durable-Workflow-Control-Plane-Version` :

- `GET /api/health` : vie du processus et résumé public `topology`, sans authentification
- `GET /api/ready` : disponibilité et même résumé `topology`, sans authentification
- `GET /api/cluster/info` : capacités, versions des protocoles et unique codec Avro. Les clients le consultent en premier pour découvrir les versions de contrôle et de worker prises en charge.

## Dépannage {#troubleshooting}

### Les workers ne reçoivent pas de tâches {#workers-not-receiving-tasks}

**À vérifier :**
1. Les workers sont-ils enregistrés ? `curl http://localhost:8080/api/workers -H "Authorization: Bearer $TOKEN" -H "X-Durable-Workflow-Control-Plane-Version: 2" -H "X-Namespace: default"`
2. Interrogent-ils la bonne file ?
3. Le workflow a-t-il démarré sur cette file ?
4. Le cache est-il partagé entre les instances Server ?

### Les connexions long poll expirent immédiatement {#long-poll-connections-timing-out-immediately}

**À vérifier :**
1. Le cache supporte-t-il les verrous atomiques ? Testez `php artisan workflow:v2:doctor --strict`.
2. Redis est-il accessible depuis Server ?
3. Le délai du répartiteur est-il supérieur au long poll, par défaut 60 s ?

### Erreurs de connexion à la base {#database-connection-errors}

**À vérifier :**
1. Hôte et port corrects ?
2. Identifiants valides ?
3. Base existante ?
4. Migrations exécutées ? `php artisan migrate:status`

### Échecs d’authentification {#auth-failures}

**À vérifier :**
1. `DW_AUTH_DRIVER` correspond-il à la méthode du client ?
2. Le jeton ou secret HMAC est-il identique entre client et Server ?
3. Les en-têtes sont-ils présents : `Authorization: Bearer $TOKEN` ou signature HMAC ?

## Pour aller plus loin {#learn-more}

- [Référence du protocole worker](/docs/polyglot/worker-protocol) : contrat complet des workers
- [Migration intégré vers Server](/docs/polyglot/embedded-to-server) : adopter Server depuis Laravel v2 intégré
- [SDK Python](/docs/polyglot/python) : créer des workers Python
- [CLI](/docs/polyglot/cli) : interface en ligne de commande
- [Dépôt Server](https://github.com/durable-workflow/server) : code, tickets et versions
