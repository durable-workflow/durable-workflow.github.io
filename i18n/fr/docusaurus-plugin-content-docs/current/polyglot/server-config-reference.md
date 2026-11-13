---
sidebar_position: 3
title: Référence de configuration de Server
description: Variables d’environnement de Durable Workflow Server, valeurs par défaut, anciens alias et paramètres d’infrastructure.
tags:
  - server
  - config
  - reference
  - operations
keywords:
  - configuration Durable Workflow Server
  - variables d’environnement DW
  - audit de l’environnement Server
  - environnement du serveur workflow
---

# Référence de configuration de Server {#server-config-reference}

Cette page décrit le contrat des variables d’environnement `DW_*` destiné aux opérateurs de l’image Durable Workflow Server. Utilisez-la pour préparer vos modèles de déploiement, vérifier la configuration de production ou remplacer les anciens noms `WORKFLOW_*` / `ACTIVITY_*` par le contrat Server v2. Le Server actuel est le Server natif 3.x ; la section [Server natif 3.x](#native-server-3x) indique les paramètres qu’il applique, ignore ou refuse. PHP Server 2.x est figé en 2.11.8.

Le serveur PHP 2.x utilise aussi les paramètres habituels de Laravel, comme `DB_*`, `REDIS_*`, `QUEUE_CONNECTION` et `CACHE_STORE`. Ces variables d’infrastructure sont présentées séparément : elles configurent le déploiement et ne constituent pas des commandes de l’API Durable Workflow.

## Server natif 3.x {#native-server-3x}

Les tableaux de variables de cette page reprennent le contrat `DW_*` publié par PHP Server 2.11.0, et leurs descriptions correspondent à PHP 2.x. Le Server natif 3.x lit les mêmes noms, avec les mêmes anciens alias, au moyen d’un audit de démarrage qui attribue un traitement à chaque paramètre du contrat :

- **Appliqué :** le natif lit le paramètre et lui donne la signification PHP. Les paramètres absents des listes ci-dessous sont appliqués.
- **Ignoré :** le natif accepte le paramètre, mais celui-ci ne change rien d’observable pour les clients ou les opérateurs.
- **Refusé sauf valeur par défaut :** le natif refuse de démarrer sauf si le paramètre est non défini ou conserve la valeur par défaut de PHP. L’erreur de démarrage nomme le paramètre, la valeur acceptée et la raison.

Le natif lit son environnement une seule fois, au démarrage du processus, et ne conserve aucun cache de configuration. Pour modifier un paramètre, redémarrez ou remplacez le processus Server. Comme `env:audit` côté PHP, l’audit natif signale les noms `DW_*` inconnus et les anciens noms, et `DW_ENV_AUDIT_STRICT=1` transforme ces avertissements en refus de démarrer.

Le natif refuse ces paramètres sauf s’ils conservent la valeur indiquée :

| Raison | Paramètres et valeurs acceptées |
| --- | --- |
| Le natif épingle toujours les runs à leur définition de workflow enregistrée | `DW_V2_PIN_TO_RECORDED_FINGERPRINT` : non définie ou `true` |
| Le natif ne peut pas appliquer une limite modifiée d’opérations Nexus | `DW_MAX_NEXUS_OPERATIONS_PER_CALLER` : non définie ou `200`<br />`DW_MAX_OPERATION_NAME_LENGTH` : non définie ou `256` |
| Le natif ne peut pas appliquer une limite modifiée de séries de métriques | `DW_METRICS_PROMETHEUS_ACTIVITY_SERIES_LIMIT` : non définie ou `100`<br />`DW_METRICS_PROMETHEUS_TASK_QUEUE_SERIES_LIMIT` : non définie ou `100`<br />`DW_METRICS_PROMETHEUS_WORKFLOW_SERIES_LIMIT` : non définie ou `100`<br />`DW_METRICS_WORKFLOW_TASK_FAILURE_TYPE_LIMIT` : non définie ou `20` |
| Le natif ne peut pas appliquer un plafond modifié de tâches de requête de lecture en attente | `DW_QUERY_TASK_MAX_PENDING_PER_QUEUE` : non définie ou `1024` |
| Le natif ne peut pas appliquer une limite structurelle modifiée | `DW_V2_LIMIT_COMMAND_BATCH_SIZE` : non définie ou `1000` |
| Le natif ne peut pas appliquer un calendrier modifié de réparation des tâches | `DW_V2_TASK_REPAIR_FAILURE_BACKOFF_MAX_SECONDS` : non définie ou `60`<br />`DW_V2_TASK_REPAIR_REDISPATCH_AFTER_SECONDS` : non définie ou `3`<br />`DW_V2_TASK_REPAIR_SCAN_LIMIT` : non définie ou `25` |
| Le natif ne publie pas la provenance du package | `DW_EXPOSE_PACKAGE_PROVENANCE` : non définie ou `false` |
| Le natif ne déclare pas de déploiement multi-nœud | `DW_V2_MULTI_NODE` : non définie ou `false` |
| Le natif n’exécute pas les workflows Workflow 1 | `DW_V1_ENABLED` : non définie ou `false` |
| Le natif ne valide pas la compatibilité de la flotte de workers | `DW_V2_FLEET_VALIDATION_MODE` : non définie ou différente de `fail` |
| Le natif ne confie les tâches qu’aux workers qui interrogent | `DW_TASK_DISPATCH_MODE` : non définie ou `poll` |
| Le natif n’a pas de configuration d’exécuteur externe | `DW_EXTERNAL_EXECUTOR_CONFIG_OVERLAY` : non définie ou vide<br />`DW_EXTERNAL_EXECUTOR_CONFIG_PATH` : non définie ou vide |
| Le natif n’a pas de mode de récupération de migration des memos | `DW_WORKFLOW_MEMO_MIGRATION_RECOVERY` : non définie ou vide |
| Le natif n’a pas de limites d’état durable par namespace | `DW_NAMESPACE_DURABLE_HARD_LIMITS` : non définie ou `{}`<br />`DW_NAMESPACE_DURABLE_LIMITS` : non définie ou `{}`<br />`DW_NAMESPACE_DURABLE_OVERRIDES` : non définie ou `{}` |
| Le natif n’a pas de limites d’admission des requêtes par namespace | `DW_NAMESPACE_ADMISSION_OVERRIDES` : non définie ou `{}`<br />`DW_NAMESPACE_HARD_MAX_CONCURRENT_REQUESTS` : non définie ou vide<br />`DW_NAMESPACE_HARD_MAX_REQUESTS_PER_MINUTE` : non définie ou vide<br />`DW_NAMESPACE_MAX_CONCURRENT_REQUESTS` : non définie ou vide<br />`DW_NAMESPACE_MAX_REQUESTS_PER_MINUTE` : non définie ou vide |
| Le natif n’a pas de politique de frontière de service | `DW_SERVICE_BOUNDARY_CROSS_NAMESPACE_DEFAULT` : non définie ou `allow`<br />`DW_SERVICE_BOUNDARY_HARD_MAX_IN_FLIGHT` : non définie ou vide<br />`DW_SERVICE_BOUNDARY_HARD_RATE_LIMIT_PER_MINUTE` : non définie ou vide<br />`DW_SERVICE_BOUNDARY_MAX_IN_FLIGHT` : non définie ou vide<br />`DW_SERVICE_BOUNDARY_NAMESPACE_MAX_IN_FLIGHT` : non définie ou vide<br />`DW_SERVICE_BOUNDARY_NAMESPACE_OVERRIDES` : non définie ou `{}`<br />`DW_SERVICE_BOUNDARY_NAMESPACE_RATE_LIMIT_PER_MINUTE` : non définie ou vide<br />`DW_SERVICE_BOUNDARY_RATE_LIMIT_PER_MINUTE` : non définie ou vide |
| Le natif n’a pas de fichier d’admission du stockage | `DW_STORAGE_ADMISSION_FILE` : non définie ou vide<br />`DW_STORAGE_ADMISSION_SOURCE` : non définie ou vide |
| Le natif n’a pas de limites d’admission des tâches | `DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` : non définie, vide ou non strictement positive<br />`DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` : non définie, vide ou non strictement positive<br />`DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE` : non définie, vide ou non strictement positive<br />`DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` : non définie, vide ou non strictement positive<br />`DW_TASK_QUEUE_ADMISSION_OVERRIDES` : non définie ou `{}`<br />`DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` : non définie, vide ou non strictement positive<br />`DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` : non définie, vide ou non strictement positive<br />`DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE` : non définie, vide ou non strictement positive<br />`DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` : non définie, vide ou non strictement positive |
| Le natif implémente une seule version du protocole worker | `DW_WORKER_PROTOCOL_VERSION` : non définie ou `1.20` |
| Le natif ne fait jamais confiance aux en-têtes d’attribution transférés | `DW_TRUST_FORWARDED_ATTRIBUTION_HEADERS` : non définie ou `false` |
| Le natif épingle les runs uniquement aux identifiants de build de workers enregistrés ; il n’a pas de marqueurs de compatibilité globaux au Server | `DW_V2_COMPATIBILITY_HEARTBEAT_TTL` : non définie ou `30`<br />`DW_V2_COMPATIBILITY_NAMESPACE` : non définie ou vide<br />`DW_V2_CURRENT_COMPATIBILITY` : non définie ou vide<br />`DW_V2_NAMESPACE` : non définie ou vide<br />`DW_V2_SUPPORTED_COMPATIBILITIES` : non définie ou vide |
| Le natif ne signale aucun problème de codec de payload | `DW_SERIALIZER` : non définie, vide ou `avro` |
| Le natif s’exécute uniquement comme processus serveur HTTP autonome | `DW_MODE` : non définie ou `service`<br />`DW_SERVER_PROCESS_CLASS` : non définie ou autre que `scheduler_node`, `worker_node`<br />`DW_SERVER_TOPOLOGY_SHAPE` : non définie ou autre que `embedded`, `split_control_execution` |
| Le natif sert `default` aux requêtes qui ne nomment aucun namespace | `DW_DEFAULT_NAMESPACE` : non définie ou `default` |
| Le natif stocke les payloads externes uniquement sur son disque local | `DW_EXTERNAL_PAYLOAD_S3_BUCKET` : non définie ou vide |
| Le natif ne prend en charge que son authentification par jeton | `DW_AUTH_BACKWARD_COMPATIBLE` : non définie ou `true`<br />`DW_AUTH_PROVIDER` : non définie ou vide<br />`DW_PRINCIPAL_TOKENS` : non définie ou vide |

Paramètres acceptés mais ignorés par le natif : `DW_ADMIN_SIGNATURE_KEY`, `DW_AUTH_METHOD_HEADER`, `DW_AUTH_STATUS_HEADER`, `DW_BOOTSTRAP_DELAY_SECONDS`, `DW_BOOTSTRAP_RETRIES`, `DW_CALLER_LABEL_HEADER`, `DW_CALLER_TYPE_HEADER`, `DW_COMPRESSION_ENABLED`, `DW_DUE_TIMER_RECOVERY_SCAN_LIMIT`, `DW_EXPIRED_WORKFLOW_TASK_RECOVERY_TTL_SECONDS`, `DW_EXTERNAL_PAYLOAD_S3_ACCESS_KEY_ID`, `DW_EXTERNAL_PAYLOAD_S3_ENDPOINT`, `DW_EXTERNAL_PAYLOAD_S3_REGION`, `DW_EXTERNAL_PAYLOAD_S3_SECRET_ACCESS_KEY`, `DW_EXTERNAL_PAYLOAD_S3_SESSION_TOKEN`, `DW_EXTERNAL_PAYLOAD_S3_USE_PATH_STYLE_ENDPOINT`, `DW_MAX_HISTORY_EVENTS`, `DW_MAX_TASKS_PER_POLL`, `DW_OBSERVABILITY_BAGGAGE_ALLOWLIST`, `DW_OBSERVABILITY_CONTEXT_ENABLED`, `DW_OPERATOR_SIGNATURE_KEY`, `DW_PACKAGE_PROVENANCE_PATH`, `DW_POLLING_CACHE_PATH`, `DW_QUERY_TASK_POLL_MAX_CONCURRENT`, `DW_QUERY_TASK_POLL_MAX_CONCURRENT_PER_NAMESPACE`, `DW_SIGNATURE_KEY`, `DW_SQLITE_CLAIM_LOCK_TTL_SECONDS`, `DW_SQLITE_CLAIM_LOCK_WAIT_SECONDS`, `DW_STORAGE_ADMISSION_MAX_AGE_SECONDS`, `DW_V2_CACHE_VALIDATION_MODE`, `DW_V2_GUARDRAILS_BOOT`, `DW_V2_LIMIT_SEARCH_ATTRIBUTE_SIZE_BYTES`, `DW_V2_LIMIT_WARNING_THRESHOLD_PERCENT`, `DW_V2_MATCHING_ROLE_QUEUE_WAKE`, `DW_V2_TASK_DISPATCH_MODE`, `DW_V2_TASK_REPAIR_LOOP_THROTTLE_SECONDS`, `DW_V2_TENANCY_ENVIRONMENT`, `DW_V2_TENANCY_ORGANIZATION`, `DW_V2_TENANCY_PROJECT`, `DW_V2_UPDATE_WAIT_POLL_INTERVAL_MS`, `DW_V2_VALIDATE_CACHE_BACKEND`, `DW_WAKE_SIGNAL_TTL_SECONDS`, `DW_WORKER_LONG_POLL_MAX_CONCURRENT`, `DW_WORKER_LONG_POLL_MAX_CONCURRENT_PER_NAMESPACE`, `DW_WORKER_LONG_POLL_RESERVED_HTTP_WORKERS`, `DW_WORKER_POLL_INTERVAL_MS`, `DW_WORKER_POLL_SIGNAL_CHECK_INTERVAL_MS`, `DW_WORKER_SIGNATURE_KEY`.

Le natif n’a ni plafonds côté serveur de baux ou de distribution des files de tâches, ni groupes de budget, ni admission des requêtes par namespace, ni quotas d’état durable par namespace, ni plafonds des polls en attente, et il n’en existe encore aucun équivalent natif. Chaque processus Server natif ouvre au plus quatre connexions à la base de données. Les tâches de requête de lecture ont une borne fixe de 16 tâches en attente ou louées par namespace ; au-delà, les nouvelles requêtes de lecture sont refusées avec HTTP `429` et `query_task_queue_full`, comme sur PHP. Cette borne n’est pas configurable. Pour borner la concurrence des tâches sur le natif, dimensionnez les emplacements de chaque worker SDK et le nombre de workers. [Admission des files de tâches](/docs/polyglot/task-queue-admission) décrit les contrôles de PHP 2.x.

L’authentification native diffère de celle de PHP 2.x sur ces points :

- `DW_AUTH_TOKEN` est obligatoire. Le natif refuse de démarrer sans lui et accepte ce jeton partagé pour tous les rôles, en plus des éventuels jetons limités à un rôle.
- `DW_AUTH_DRIVER` n’accepte que `token`. Le natif refuse `signature`, et une image de release refuse aussi `none`. Les paramètres de clé de signature sont ignorés.

Le natif lit aussi des paramètres hors du contrat PHP :

- `DW_BIND_ADDRESS` : l’adresse d’écoute. Le binaire utilise par défaut `127.0.0.1:8080` ; l’image publiée définit `0.0.0.0:8080`.
- `DW_RUST_MAINTENANCE_LOOP` : `1` ou `true` ajoute la passe de réparation (réparation des tâches et délais d’expiration des activités) à la boucle in-process des timers et schedules. L’image publiée définit `1`, car elle n’a pas de planificateur séparé.
- `DW_RUST_EXPERIMENTAL` : requis à `1` uniquement par les builds de développement sans version de release. Les images de release n’en ont pas besoin.
- `DW_UPGRADE_BACKUP_FINGERPRINT` et `DW_RUST_UPGRADE_QUEUE_*` : entrées de la [reprise native](%%artifact.serverTakeoverRunbookUrl%%) à sens unique d’une base PHP, qualifiée sur l’image publiée 3.0.4 dans le périmètre indiqué par le runbook.
- `DW_V2_LIMIT_HISTORY_TRANSACTION_ROWS` (ancien nom `WORKFLOW_V2_LIMIT_HISTORY_TRANSACTION_ROWS`) : appliqué avant même son ajout au contrat PHP.

## Prise en compte des modifications {#how-changes-take-effect}

Le natif 3.x ne lit son environnement qu’au démarrage du processus ; redémarrez ou remplacez le processus Server pour appliquer une modification. La suite de cette section décrit PHP 2.x.

L’image PHP Server publiée exécute `php artisan config:cache` dans son point d’entrée. Les valeurs de l’environnement sont lues au démarrage et écrites dans le cache de configuration Laravel. Modifier un fichier d’environnement, la déclaration d’environnement de l’orchestrateur ou un fichier de configuration monté ne recharge pas un déploiement en cours d’exécution.

Redémarrez ou remplacez chaque processus concerné avec la nouvelle configuration : réplicas HTTP API, workers locaux de la file Laravel et processus du planificateur. Redémarrez séparément les workers SDK persistants si leur propre configuration de client ou de worker change. Le redémarrage réussi de l’API ne met pas à jour un worker de file ou un planificateur encore actif. Les rôles qui partagent une base et un cache doivent recevoir une configuration cohérente.

Pendant une mise à jour progressive, chaque nœud applique les limites qu’il a chargées. Les compteurs d’admission partagés n’uniformisent pas des configurations différentes. Un réplica API peut donc accepter une requête qu’un autre refuse. Pour appliquer une nouvelle limite de façon cohérente :

1. Suspendez les nouvelles requêtes des appelants et retirez les réplicas API concernés de l’ingress. Laissez les requêtes en cours se terminer. Arrêtez proprement les rôles de file et de planificateur concernés dans leurs budgets d’arrêt.
2. Appliquez la même configuration à chaque rôle concerné, puis redémarrez-les ou remplacez-les. Laissez le point d’entrée de chaque conteneur reconstruire son cache de configuration.
3. Recherchez les erreurs de configuration dans les journaux de démarrage, vérifiez la disponibilité et testez la limite modifiée avant de rétablir l’ingress et les requêtes des appelants. Consultez le [guide de déploiement et de disponibilité](/docs/deployment#readiness-contract).

Les paramètres opérateur stockés dans la base ont un autre cycle de vie. Les mutations réussies ci-dessous sont disponibles pour les opérations suivantes sans redémarrer Server :

| Paramètre | Modification sans redémarrage | Portée et limites |
| --- | --- | --- |
| Description et conservation du namespace | [`PUT /api/namespaces/{namespace}`](/docs/polyglot/server-api-reference#namespace-and-storage), ou [`dw namespace:update`](/docs/polyglot/cli-reference#namespace-and-search-attribute-commands) | La politique régit les passages de conservation suivants. Sa modification ne restaure pas les données déjà supprimées. Voir [Conservation Server](/docs/polyglot/server#retention). |
| Politique de stockage externe des payloads du namespace | [`PUT /api/namespaces/{namespace}/external-storage`](/docs/features/external-payload-storage#configuring-a-namespace) | Modifie la politique stockée du namespace. Les identifiants du fournisseur, les disques de système de fichiers configurés et les autres paramètres de processus nécessitent toujours le redémarrage décrit ci-dessus. Préservez l’accès aux objets référencés par les runs existants. |
| Définitions d’attributs de recherche du namespace | [`POST` / `DELETE /api/search-attributes`](/docs/polyglot/server-api-reference#schedules-and-search-attributes) | Met à jour l’enregistrement des requêtes suivantes. Ne réécrit pas l’historique et ne remplace pas les plafonds de taille ou de nombre définis par l’environnement. |

Les valeurs par défaut et plafonds `DW_*` de cette référence restent des paramètres de processus, sauf lorsqu’une opération documentée du plan de contrôle modifie explicitement l’état stocké. Server ne surveille pas les fichiers de configuration pour détecter leurs modifications.

## Vérification du contrat {#how-the-contract-is-enforced}

Le dépôt Server conserve le contrat canonique dans `config/dw-contract.php`. Le natif 3.x exécute l’audit équivalent au démarrage, comme décrit dans [Server natif 3.x](#native-server-3x). Sous PHP 2.x, au démarrage du conteneur, `php artisan env:audit` signale les variables `DW_*` inconnues et les anciens noms. Définissez `DW_ENV_AUDIT_STRICT=1` pour que le point d’entrée échoue au lieu de démarrer avec des avertissements.

```bash
DW_ENV_AUDIT_STRICT=1
DW_AUTH_DRIVER=token
DW_ADMIN_TOKEN="${DW_ADMIN_TOKEN}"
DW_OPERATOR_TOKEN="${DW_OPERATOR_TOKEN}"
DW_WORKER_TOKEN="${DW_WORKER_TOKEN}"
```

Les anciens noms servent uniquement de repli. Préférez le nom `DW_*` dans chaque nouveau déploiement. Un avertissement concernant un ancien nom indique une migration inachevée, même si Server utilise encore sa valeur.

## Identité et mode de Server {#server-identity-and-mode}

| Variable | Valeur par défaut | Rôle | Ancien alias |
| --- | --- | --- | --- |
| `DW_MODE` | `service` | Mode Server : `service` fait interroger les workers externes ; `embedded` distribue localement via la file Laravel. | `WORKFLOW_SERVER_MODE` |
| `DW_SERVER_ID` | `gethostname()` | Identifiant unique de l’instance Server, utilisé pour la propriété des baux et l’enregistrement des workers. | `WORKFLOW_SERVER_ID` |
| `DW_SERVER_TOPOLOGY_SHAPE` | `standalone_server` | Topologie annoncée à la découverte du cluster, par exemple `embedded`, `standalone_server` ou `split_control_execution`. | `WORKFLOW_SERVER_TOPOLOGY_SHAPE` |
| `DW_SERVER_PROCESS_CLASS` | `server_http_node` | Classe de processus annoncée pour ce nœud dans la topologie choisie, comme `server_http_node`, `worker_node` ou `scheduler_node`. | `WORKFLOW_SERVER_PROCESS_CLASS` |
| `DW_SERVER_KEY` | générée au démarrage du conteneur | Clé interne facultative du runtime Server. Les images Docker en génèrent une si elle n’est pas définie. | - |
| `DW_DEFAULT_NAMESPACE` | `default` | Espace de noms utilisé lorsqu’une requête omet l’en-tête de namespace. | `WORKFLOW_SERVER_DEFAULT_NAMESPACE` |
| `DW_TASK_DISPATCH_MODE` | non définie | Remplace `workflows.v2.task_dispatch_mode`. En mode service, Server utilise `poll` sauf autre valeur explicite. | `WORKFLOW_V2_TASK_DISPATCH_MODE` |
| `DW_WORKFLOW_MEMO_MIGRATION_RECOVERY` | non définie | Preuve de récupération MySQL pour une réécriture de memo non enregistrée, valable une exécution : `raw-json` ou `envelope-prefix:<last-converted-id>`. | `WORKFLOW_SERVER_WORKFLOW_MEMO_MIGRATION_RECOVERY` |
| `DW_EXTERNAL_EXECUTOR_CONFIG_PATH` | non définie | Chemin du fichier JSON `durable-workflow.external-executor.config` qui associe les gestionnaires de l’exécuteur externe. | `WORKFLOW_SERVER_EXTERNAL_EXECUTOR_CONFIG_PATH` |
| `DW_EXTERNAL_EXECUTOR_CONFIG_OVERLAY` | non définie | Nom de la surcouche du fichier de configuration de l’exécuteur externe, appliquée avant la validation et la découverte Server. | `WORKFLOW_SERVER_EXTERNAL_EXECUTOR_CONFIG_OVERLAY` |

## Authentification {#authentication}

| Variable | Valeur par défaut | Rôle | Ancien alias |
| --- | --- | --- | --- |
| `DW_AUTH_PROVIDER` | non définie | PHP 2.x : classe résolue par Laravel qui implémente `App\Contracts\AuthProvider`. Le natif 3.x refuse de démarrer si elle est définie. | `WORKFLOW_SERVER_AUTH_PROVIDER` |
| `DW_AUTH_DRIVER` | `token` | Pilote d’authentification PHP 2.x : `none`, `token` ou `signature`. Le natif 3.x n’accepte que `token`. | `WORKFLOW_SERVER_AUTH_DRIVER` |
| `DW_AUTH_TOKEN` | non définie | PHP 2.x : jeton bearer partagé lorsqu’aucun jeton limité à un rôle n’est configuré. Natif 3.x : obligatoire, et accepté pour tous les rôles. | `WORKFLOW_SERVER_AUTH_TOKEN` |
| `DW_SIGNATURE_KEY` | non définie | PHP 2.x : clé HMAC partagée lorsqu’aucune clé limitée à un rôle n’est configurée. Ignorée par le natif 3.x, qui n’a pas d’authentification par signature. | `WORKFLOW_SERVER_SIGNATURE_KEY` |
| `DW_WORKER_TOKEN` | non définie | Jeton bearer pour l’enregistrement, le polling, les heartbeats et les réponses de fin des workers. | `WORKFLOW_SERVER_WORKER_TOKEN` |
| `DW_OPERATOR_TOKEN` | non définie | Jeton bearer pour les lectures et les actions opérateur du plan de contrôle. | `WORKFLOW_SERVER_OPERATOR_TOKEN` |
| `DW_ADMIN_TOKEN` | non définie | Jeton bearer pour les mutations administratives : espaces de noms, conservation et autres paramètres. | `WORKFLOW_SERVER_ADMIN_TOKEN` |
| `DW_PRINCIPAL_TOKENS` | non définie | PHP 2.x : table JSON des jetons associés à des principaux nommés. Chaque entrée contient `token`, `subject`, `roles`, et éventuellement `tenant`, `label` et des `claims` non secrets. Le natif 3.x refuse de démarrer si elle est définie. | `WORKFLOW_SERVER_PRINCIPAL_TOKENS` |
| `DW_WORKER_SIGNATURE_KEY` | non définie | Clé HMAC des requêtes du rôle worker avec authentification par signature. | `WORKFLOW_SERVER_WORKER_SIGNATURE_KEY` |
| `DW_OPERATOR_SIGNATURE_KEY` | non définie | Clé HMAC des requêtes du rôle opérateur avec authentification par signature. | `WORKFLOW_SERVER_OPERATOR_SIGNATURE_KEY` |
| `DW_ADMIN_SIGNATURE_KEY` | non définie | Clé HMAC des requêtes du rôle administrateur avec authentification par signature. | `WORKFLOW_SERVER_ADMIN_SIGNATURE_KEY` |
| `DW_AUTH_BACKWARD_COMPATIBLE` | `true` | PHP 2.x : utilise les valeurs partagées `DW_AUTH_TOKEN` / `DW_SIGNATURE_KEY` en repli lorsqu’un identifiant limité à un rôle manque. Le natif 3.x accepte toujours le jeton partagé et refuse de démarrer si cette valeur est `false`. | `WORKFLOW_SERVER_AUTH_BACKWARD_COMPATIBLE` |

En production, utilisez des identifiants limités à leur rôle. Sous PHP 2.x, `DW_AUTH_DRIVER=none` est réservé aux vérifications locales : tous les points d’accès deviennent accessibles sans jeton bearer ni signature. Les images de release natives le refusent.

Utilisez `DW_PRINCIPAL_TOKENS` lorsque les pistes d’audit doivent identifier durablement les acteurs plutôt qu’indiquer seulement leur rôle. Server déduit le principal enregistré de l’entrée de jeton correspondante. Le client ne peut pas le remplacer dans le corps ou les en-têtes de sa requête.

## Attribution des commandes {#command-attribution}

Ces paramètres permettent à une passerelle de confiance de conserver les métadonnées de l’appelant dans l’historique durable des commandes. Gardez `DW_TRUST_FORWARDED_ATTRIBUTION_HEADERS=false`, sauf si Server se trouve derrière une passerelle qui supprime les en-têtes non fiables fournis par le client.

| Variable | Valeur par défaut | Rôle | Ancien alias |
| --- | --- | --- | --- |
| `DW_TRUST_FORWARDED_ATTRIBUTION_HEADERS` | `false` | Enregistre les en-têtes transférés d’appelant et d’authentification dans l’historique des commandes. | `WORKFLOW_SERVER_TRUST_FORWARDED_ATTRIBUTION_HEADERS` |
| `DW_CALLER_TYPE_HEADER` | `X-Workflow-Caller-Type` | En-tête du type d’appelant transféré. | `WORKFLOW_SERVER_CALLER_TYPE_HEADER` |
| `DW_CALLER_LABEL_HEADER` | `X-Workflow-Caller-Label` | En-tête du libellé d’appelant transféré. | `WORKFLOW_SERVER_CALLER_LABEL_HEADER` |
| `DW_AUTH_STATUS_HEADER` | `X-Workflow-Auth-Status` | En-tête de l’état d’authentification transféré. | `WORKFLOW_SERVER_AUTH_STATUS_HEADER` |
| `DW_AUTH_METHOD_HEADER` | `X-Workflow-Auth-Method` | En-tête de la méthode d’authentification transférée. | `WORKFLOW_SERVER_AUTH_METHOD_HEADER` |

## Polling et admission des workers {#worker-polling-and-admission}

Ces valeurs règlent les délais du long polling, la coordination des réveils, les plafonds d’admission côté serveur et les budgets bornés de distribution des tâches.

| Variable | Valeur par défaut | Rôle | Ancien alias |
| --- | --- | --- | --- |
| `DW_WORKER_POLL_TIMEOUT` | `30` | Attente par défaut si le poll omet `timeout_seconds`. Le délai envoyé par le SDK prévaut ; ce n’est pas son maximum. Voir les [budgets de bout en bout](../deployment.md#worker-long-poll-timeout-budgets). | `WORKFLOW_SERVER_WORKER_POLL_TIMEOUT` |
| `DW_WORKER_POLL_INTERVAL_MS` | `1000` | Millisecondes entre les recherches internes pendant un poll maintenu ouvert. | `WORKFLOW_SERVER_WORKER_POLL_INTERVAL_MS` |
| `DW_WORKER_POLL_SIGNAL_CHECK_INTERVAL_MS` | `100` | Millisecondes entre les vérifications des signaux de réveil pendant un poll maintenu ouvert. | `WORKFLOW_SERVER_WORKER_POLL_SIGNAL_CHECK_INTERVAL_MS` |
| `DW_POLLING_CACHE_PATH` | `storage/framework/cache/server-polling/<APP_ENV>` | Répertoire de coordination des polls lorsque le cache de polling utilise des fichiers. | `WORKFLOW_SERVER_POLLING_CACHE_PATH` |
| `DW_WAKE_SIGNAL_TTL_SECONDS` | `max(DW_WORKER_POLL_TIMEOUT + 5, 60)` | Durée de vie des signaux par file qui interrompent l’attente d’un poll. | `WORKFLOW_SERVER_WAKE_SIGNAL_TTL_SECONDS` |
| `DW_WORKER_LONG_POLL_MAX_CONCURRENT` | non définie ; calculée pour `PHP_CLI_SERVER_WORKERS` | Plafond facultatif des attentes long poll de tâches de workflow/activité sur ce nœud Server. Les polls de requêtes de lecture ont un budget distinct. Le Server natif 3.x l’ignore ; voir [Server natif 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKER_LONG_POLL_MAX_CONCURRENT` |
| `DW_WORKER_LONG_POLL_RESERVED_HTTP_WORKERS` | `2` | Workers PHP CLI réservés à la santé et au plan de contrôle pour calculer le plafond des attentes long poll de workflow/activité. Le Server natif 3.x l’ignore ; voir [Server natif 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKER_LONG_POLL_RESERVED_HTTP_WORKERS` |
| `DW_MAX_TASKS_PER_POLL` | `1` | Nombre maximal de tâches renvoyées par poll worker. | `WORKFLOW_SERVER_MAX_TASKS_PER_POLL` |
| `DW_SQLITE_CLAIM_LOCK_TTL_SECONDS` | `10` | Secondes avant expiration du verrou de cache utilisé par le backend SQLite de démarrage rapide pour l’attribution des polls worker. | `WORKFLOW_SERVER_SQLITE_CLAIM_LOCK_TTL_SECONDS` |
| `DW_SQLITE_CLAIM_LOCK_WAIT_SECONDS` | `5` | Secondes d’attente du verrou de cache lors d’une attribution SQLite avant le retour d’une pression de verrouillage du backend. | `WORKFLOW_SERVER_SQLITE_CLAIM_LOCK_WAIT_SECONDS` |
| `DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` | non définie | Plafond de baux actifs de tâches de workflow par espace de noms/file. Le Server natif 3.x refuse de démarrer si la valeur est un nombre positif ; voir [Server natif 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` |
| `DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` | non définie | Plafond de baux actifs de tâches de workflow sur toutes les files d’un espace de noms. Le Server natif 3.x refuse de démarrer si la valeur est un nombre positif ; voir [Server natif 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` |
| `DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE` | non définie | Plafond de distribution par minute des tâches de workflow par espace de noms/file. Le Server natif 3.x refuse de démarrer si la valeur est un nombre positif ; voir [Server natif 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE` |
| `DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` | non définie | Plafond de distribution par minute des tâches de workflow dans un espace de noms. Le Server natif 3.x refuse de démarrer si la valeur est un nombre positif ; voir [Server natif 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` |
| `DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` | non définie | Plafond de baux actifs de tâches d’activité par espace de noms/file. Le Server natif 3.x refuse de démarrer si la valeur est un nombre positif ; voir [Server natif 3.x](#native-server-3x). | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` |
| `DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` | non définie | Plafond de baux actifs de tâches d’activité sur toutes les files d’un espace de noms. Le Server natif 3.x refuse de démarrer si la valeur est un nombre positif ; voir [Server natif 3.x](#native-server-3x). | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` |
| `DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE` | non définie | Plafond de distribution par minute des tâches d’activité par espace de noms/file. Le Server natif 3.x refuse de démarrer si la valeur est un nombre positif ; voir [Server natif 3.x](#native-server-3x). | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE` |
| `DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` | non définie | Plafond de distribution par minute des tâches d’activité dans un espace de noms. Le Server natif 3.x refuse de démarrer si la valeur est un nombre positif ; voir [Server natif 3.x](#native-server-3x). | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` |
| `DW_TASK_QUEUE_ADMISSION_OVERRIDES` | `{}` | Surcharges JSON, indexées par `namespace:task_queue`, `namespace:*`, `task_queue` ou `*`, des baux actifs, débits, plafonds du namespace et groupes de budget aval. Le Server natif 3.x refuse de démarrer sauf si le paramètre est non défini ou vaut `{}` ; voir [Server natif 3.x](#native-server-3x). | `WORKFLOW_SERVER_TASK_QUEUE_ADMISSION_OVERRIDES` |
| `DW_DUE_TIMER_RECOVERY_SCAN_LIMIT` | `5` | Nombre maximal de tâches timer échues récupérées par passage de polling en mode service. | `WORKFLOW_SERVER_DUE_TIMER_RECOVERY_SCAN_LIMIT` |
| `DW_EXPIRED_WORKFLOW_TASK_RECOVERY_SCAN_LIMIT` | `5` | Nombre maximal de tâches de workflow expirées récupérées par passage. | `WORKFLOW_SERVER_EXPIRED_WORKFLOW_TASK_RECOVERY_SCAN_LIMIT` |
| `DW_EXPIRED_WORKFLOW_TASK_RECOVERY_TTL_SECONDS` | `5` | Délai minimal en secondes entre les passages de récupération de tâches expirées par file. | `WORKFLOW_SERVER_EXPIRED_WORKFLOW_TASK_RECOVERY_TTL_SECONDS` |

L’exécution sticky n’a pas de variables d’environnement propres à l’image Server. Consultez [Exécution sticky](/docs/features/sticky-execution) pour le cycle de vie du cache, les champs du protocole worker, les modes de relecture et les diagnostics.

Exemple de surcharge des limites d’admission :

```json
{
  "production:billing": {
    "workflow_tasks": {
      "max_active_leases": 50,
      "max_dispatches_per_minute": 600
    },
    "activity_tasks": {
      "max_active_leases": 200
    }
  },
  "production:*": {
    "workflow_tasks": {
      "max_active_leases_per_namespace": 500
    }
  }
}
```

## Protocole des workers et transport des requêtes de lecture {#worker-protocol-and-query-transport}

| Variable | Valeur par défaut | Rôle | Ancien alias |
| --- | --- | --- | --- |
| `DW_WORKER_PROTOCOL_VERSION` | `WorkerProtocolVersion::VERSION` | Version du protocole worker annoncée dans les réponses du plan worker. | `WORKFLOW_SERVER_WORKER_PROTOCOL_VERSION` |
| `DW_HISTORY_PAGE_SIZE_DEFAULT` | `WorkerProtocolVersion::DEFAULT_HISTORY_PAGE_SIZE` | Taille de page par défaut pour la lecture d’historique par les workers. | `WORKFLOW_SERVER_HISTORY_PAGE_SIZE_DEFAULT` |
| `DW_HISTORY_PAGE_SIZE_MAX` | `WorkerProtocolVersion::MAX_HISTORY_PAGE_SIZE` | Taille de page maximale acceptée pour la lecture d’historique par les workers. | `WORKFLOW_SERVER_HISTORY_PAGE_SIZE_MAX` |
| `DW_UPDATE_VALIDATION_TIMEOUT` | `10` | Secondes pendant lesquelles le plan de contrôle attend le résultat d’un validateur synchrone avant d’accepter une mise à jour. | `WORKFLOW_SERVER_UPDATE_VALIDATION_TIMEOUT` |
| `DW_UPDATE_VALIDATION_LEASE_TIMEOUT` | `5` | Durée en secondes du bail d’une tâche de validation de mise à jour avant qu’un autre worker capable de validation puisse réessayer. | `WORKFLOW_SERVER_UPDATE_VALIDATION_LEASE_TIMEOUT` |
| `DW_QUERY_TASK_TIMEOUT` | `DW_WORKER_POLL_TIMEOUT` | Secondes pendant lesquelles le plan de contrôle attend la réponse du worker à une requête de lecture. | `WORKFLOW_SERVER_QUERY_TASK_TIMEOUT` |
| `DW_QUERY_TASK_LEASE_TIMEOUT` | `DW_WORKFLOW_TASK_TIMEOUT` | Durée du bail des tâches éphémères de requête de lecture confiées aux workers. | `WORKFLOW_SERVER_QUERY_TASK_LEASE_TIMEOUT` |
| `DW_QUERY_TASK_TTL_SECONDS` | `180` | Durée de conservation des lignes de résultat des tâches de requête de lecture avant leur nettoyage. | `WORKFLOW_SERVER_QUERY_TASK_TTL_SECONDS` |
| `DW_QUERY_TASK_MAX_PENDING_PER_QUEUE` | `1024` | Nombre maximal de tâches de requête de lecture en attente dans le cache par espace de noms/file avant le refus des nouvelles requêtes. Le Server natif 3.x refuse toute valeur autre que `1024` et applique à la place sa propre borne fixe de tâches de requête de lecture ; voir [Server natif 3.x](#native-server-3x). | `WORKFLOW_SERVER_QUERY_TASK_MAX_PENDING_PER_QUEUE` |
| `DW_QUERY_TASK_POLL_TIMEOUT` | `5` | Attente maximale en secondes d’un poll worker inactif de requête de lecture avant de revérifier la pression des tâches de workflow et la disponibilité du plan de contrôle. | `WORKFLOW_SERVER_QUERY_TASK_POLL_TIMEOUT` |
| `DW_QUERY_TASK_POLL_MAX_CONCURRENT` | non définie ; calculée pour `PHP_CLI_SERVER_WORKERS` | Plafond facultatif des attentes long poll inactives de requête de lecture sur ce nœud. Les tâches en attente peuvent toujours être attribuées immédiatement avant cette attente. Le Server natif 3.x l’ignore ; voir [Server natif 3.x](#native-server-3x). | `WORKFLOW_SERVER_QUERY_TASK_POLL_MAX_CONCURRENT` |
| `DW_WORKFLOW_TASK_TIMEOUT` | `60` | Durée par défaut, en secondes, du bail d’une tâche de workflow. | `WORKFLOW_TASK_TIMEOUT` |
| `DW_ACTIVITY_TASK_TIMEOUT` | `300` | Durée par défaut, en secondes, du bail d’une tâche d’activité. | `ACTIVITY_TASK_TIMEOUT` |
| `DW_WORKER_STALE_AFTER_SECONDS` | `max(DW_WORKER_HEARTBEAT_INTERVAL_SECONDS * 3, 30)` | Secondes après le dernier heartbeat avant que l’enregistrement du worker soit considéré comme périmé. | `WORKFLOW_SERVER_WORKER_STALE_AFTER_SECONDS` |
| `DW_WORKER_HEARTBEAT_INTERVAL_SECONDS` | `10` | Cadence en secondes annoncée aux SDK dans les accusés de réception d’enregistrement et de heartbeat. | `WORKFLOW_SERVER_WORKER_HEARTBEAT_INTERVAL_SECONDS` |

## Limites, conservation et métriques {#limits-retention-and-metrics}

Ces paramètres limitent les requêtes et la croissance de l’état. Si une application les approche régulièrement, préférez des payloads plus petits, le stockage externe des payloads ou continue-as-new à une augmentation systématique des limites.

| Variable | Valeur par défaut | Rôle | Ancien alias |
| --- | --- | --- | --- |
| `DW_METRICS_WORKFLOW_TASK_FAILURE_TYPE_LIMIT` | `20` | Nombre maximal de séries `workflow_type` de `dw_workflow_task_consecutive_failures` ; les types excédentaires sont regroupés. | `WORKFLOW_SERVER_METRICS_WORKFLOW_TASK_FAILURE_TYPE_LIMIT` |
| `DW_METRICS_PROMETHEUS_WORKFLOW_SERIES_LIMIT` | `100` | Nombre maximal de séries de workflows de `/api/system/prometheus-metrics` avant regroupement des séries excédentaires. | `WORKFLOW_SERVER_METRICS_PROMETHEUS_WORKFLOW_SERIES_LIMIT` |
| `DW_METRICS_PROMETHEUS_ACTIVITY_SERIES_LIMIT` | `100` | Nombre maximal de séries d’activités de `/api/system/prometheus-metrics` avant regroupement des séries excédentaires. | `WORKFLOW_SERVER_METRICS_PROMETHEUS_ACTIVITY_SERIES_LIMIT` |
| `DW_METRICS_PROMETHEUS_TASK_QUEUE_SERIES_LIMIT` | `100` | Nombre maximal de séries de runtime par file dans `/api/system/prometheus-metrics` avant regroupement des séries excédentaires. | `WORKFLOW_SERVER_METRICS_PROMETHEUS_TASK_QUEUE_SERIES_LIMIT` |
| `DW_MAX_HISTORY_EVENTS` | `50000` | Sans effet. Aucune version du Server ne la lit et l’historique par exécution n’est pas plafonné. Limitez les historiques longs avec continue-as-new. | `WORKFLOW_MAX_HISTORY_EVENTS` |
| `DW_HISTORY_RETENTION_DAYS` | `30` | Nombre de jours de conservation par défaut de l’historique d’un run fermé, sauf surcharge du namespace. | `WORKFLOW_HISTORY_RETENTION_DAYS` |
| `DW_MAX_PAYLOAD_BYTES` | `2097152` | Nombre maximal d’octets sérialisés d’un payload. | `WORKFLOW_MAX_PAYLOAD_BYTES` |
| `DW_EXTERNAL_PAYLOAD_MAX_BYTES` | `67108864` | Taille encodée maximale, en octets (64 MiB), acceptée par le transport authentifié de dépôt et de récupération des payloads externes. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_MAX_BYTES` |
| `DW_EXTERNAL_PAYLOAD_REQUEST_TIMEOUT` | `30` | Budget de délai des requêtes client de dépôt et de récupération annoncé par Server, en secondes. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_REQUEST_TIMEOUT` |
| `DW_EXTERNAL_PAYLOAD_UPLOAD_EXPIRY` | `3600` | Secondes pendant lesquelles un payload externe déposé peut rester non réclamé avant l’expiration de sa référence opaque. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_UPLOAD_EXPIRY` |
| `DW_MAX_MEMO_BYTES` | `262144` | Nombre maximal d’octets sérialisés d’un memo de workflow. | `WORKFLOW_MAX_MEMO_BYTES` |
| `DW_MAX_SEARCH_ATTRIBUTES` | `100` | Nombre maximal d’attributs de recherche d’un workflow. | `WORKFLOW_MAX_SEARCH_ATTRIBUTES` |
| `DW_MAX_SEARCH_ATTRIBUTE_KEY_LENGTH` | `128` | Longueur maximale en octets d’une clé d’attribut de recherche. | `WORKFLOW_MAX_SEARCH_ATTRIBUTE_KEY_LENGTH` |
| `DW_MAX_SEARCH_ATTRIBUTE_VALUE_BYTES` | `2048` | Taille maximale en octets d’une valeur chaîne d’attribut de recherche. | `WORKFLOW_MAX_SEARCH_ATTRIBUTE_VALUE_BYTES` |
| `DW_MAX_OPERATION_NAME_LENGTH` | `256` | Longueur maximale en octets du nom d’un signal, d’une mise à jour ou d’une requête de lecture. | `WORKFLOW_MAX_OPERATION_NAME_LENGTH` |
| `DW_MAX_PENDING_ACTIVITIES` | `2000` | Nombre maximal d’activités en attente par run avant le refus d’un lot de commandes. | `WORKFLOW_MAX_PENDING_ACTIVITIES` |
| `DW_MAX_PENDING_CHILDREN` | `2000` | Nombre maximal de workflows enfants en attente par run avant le refus d’un lot de commandes. | `WORKFLOW_MAX_PENDING_CHILDREN` |
| `DW_MAX_NEXUS_OPERATIONS_PER_CALLER` | `200` | Nombre maximal d’opérations Nexus renvoyées par appelant dans l’historique des opérations avant la pagination obligatoire. | `WORKFLOW_MAX_NEXUS_OPERATIONS_PER_CALLER` |
| `DW_COMPRESSION_ENABLED` | `true` | Active la compression des réponses JSON au-dessus du seuil minimal. | `WORKFLOW_SERVER_COMPRESSION_ENABLED` |

## Limites à l’entrée des requêtes Server {#server-request-boundary-limits}

Avec le serveur autonome, un ensemble distinct de limites s’applique à l’entrée des requêtes HTTP, avant qu’une tâche de workflow, un signal, une mise à jour ou une requête de lecture atteigne le plan de contrôle. Ces contrôles renvoient immédiatement `422 validation_failed`, ou `413 payload_too_large` pour la taille du corps entier. Le client connaît ainsi le motif du refus sans qu’aucune ligne soit écrite en base.

| Limite | Valeur par défaut | Clé de configuration | Ce qu’elle plafonne |
|---|---|---|---|
| Taille du corps | 2 MiB | `server.limits.max_payload_bytes` | Nombre total d’octets du corps HTTP, sauf pour un achèvement de tâche de workflow sur Server natif 3.6.0 ou ultérieur (ligne suivante) |
| Taille d’un achèvement de tâche de workflow | 32 MiB (16 × taille du corps) | dérivée de `server.limits.max_payload_bytes` | Server natif 3.6.0 ou ultérieur : une requête qui achève une tâche de workflow avec des commandes. Les arguments de chaque commande respectent toujours la limite par payload |
| Taille du mémo | 256 KiB | `server.limits.max_memo_bytes` | Mémo sérialisé sur `POST /workflows` et `POST /schedules` |
| Nombre d’attributs de recherche | 100 | `server.limits.max_search_attributes` | Attributs personnalisés enregistrés par espace de noms |
| Longueur de clé d’attribut de recherche | 128 octets | `server.limits.max_search_attribute_key_length` | Longueur d’une clé d’attribut au démarrage |
| Taille de valeur d’attribut de recherche | 2 KiB | `server.limits.max_search_attribute_value_bytes` | Chaque valeur chaîne et chaque élément d’un tableau au démarrage |
| Nom de signal / mise à jour / requête de lecture | 256 octets | `server.limits.max_operation_name_length` | Segment d’URL des noms de signal, mise à jour ou requête de lecture |
| Longueur de `workflow_id` | 128 caractères | validateur du contrôleur | Identifiant du workflow sur `POST /workflows` |
| `workflow_type` / `task_queue` / `business_key` | 255 caractères | validateur du contrôleur | Champs chaîne sur `POST /workflows` |
| `request_id` | 255 caractères | validateur du contrôleur | Jeton de déduplication des signaux/mises à jour/annulations/arrêts forcés |
| `reason` | 1 000 caractères | validateur du contrôleur | Motif des annulations/arrêts forcés/archivages |

Chaque limite se configure individuellement via des variables d’environnement `DW_*`. Consultez `config/dw-contract.php` pour le contrat complet. La valeur `0` désactive le contrôle de cette limite précise, sans désactiver les autres.

Les valeurs actuellement configurées sont publiées sous `limits` dans la réponse de `GET /api/cluster/info`, pour permettre leur découverte par les clients :

```json
{
  "limits": {
    "max_payload_bytes": 2097152,
    "max_memo_bytes": 262144,
    "max_search_attributes": 100,
    "max_search_attribute_key_length": 128,
    "max_search_attribute_value_bytes": 2048,
    "max_operation_name_length": 256,
    "max_pending_activities": 2000,
    "max_pending_children": 2000
  }
}
```

Les erreurs de validation utilisent l’enveloppe d’erreur standard du plan de contrôle avec `reason: "validation_failed"` et une table `validation_errors` indexée par champ en cause (`signal_name`, `update_name`, `query_name`, `search_attributes`, `memo`, etc.). Les refus de taille utilisent `reason: "payload_too_large"` et le code `413`.

### Taille d’un achèvement de tâche de workflow {#workflow-task-completion-size}

Sur Server natif 3.6.0 et ultérieur, une requête qui achève une tâche de workflow avec des commandes (`POST /api/worker/workflow-tasks/{id}/complete` et `POST /api/worker/activity-tasks/{id}/continuation/complete`) peut atteindre 16 fois `max_payload_bytes` : 32 MiB avec la valeur par défaut de 2 MiB. Elle suit `DW_MAX_PAYLOAD_BYTES` et n’a pas de réglage propre. Les arguments de chaque commande respectent toujours la limite par payload à l’intérieur de l’achèvement. Server PHP 2.x et les versions natives antérieures limitent un achèvement à une limite de payload, comme toute autre requête.

Un achèvement plus grand est refusé avec `413 payload_too_large` et `limit_kind: workflow_task_completion_bytes` avant tout enregistrement. Rejouer la tâche produit les mêmes commandes : renvoyer l’achèvement obtient donc le même refus. Lorsque PHP SDK 3.17.0 ou ultérieur reçoit ce refus typé, il ne renvoie pas cet achèvement : le worker fait échouer l’exécution une seule fois avec une commande `fail_workflow` dont le message commence par `Structural limit exceeded: workflow_task_completion_bytes:` et indique les deux tailles, et le Server enregistre l’échec avec `failure_category = structural_limit`.

Python SDK 2.17 et Rust SDK 4.15 gèrent le refus typé. Sur Server 3.8.0, une
complétion trop volumineuse peut échouer au niveau du transport avant que le
worker reçoive HTTP 413. Dans le test avec le SDK Python publié,
`httpx.ReadError` a laissé le workflow en attente au lieu d'un échec pour limite
structurelle. La qualification des requêtes surdimensionnées sur le Server
publié reste ouverte dans la [correction de la réponse du Server](https://github.com/durable-workflow/.github/issues/228#issuecomment-6848969678).
Réduisez les complétions jusqu'à la qualification de ce chemin.

Pour garder un achèvement sous la limite :

- Découpez un fan-out important en lots plus petits répartis sur plusieurs tâches de workflow.
- Déplacez du travail dans des workflows enfants, ou utilisez continue-as-new.
- Stockez les arguments volumineux dans le stockage externe des payloads, afin que l’achèvement transporte des références au lieu des payloads.

#### Planification des commandes Rust {#rust-completion-planning}

Rust SDK 4.15.0 utilise encore la limite ordinaire par charge utile comme
plafond agrégé de planification des commandes (2 MiB par défaut), avant la
capacité de complétion supérieure du Server. Sans stockage externe des charges
utiles dans l'espace de noms, le fan-out publié de 300 × 10 KB est refusé avec
`external_payload_unavailable`. Le worker s'arrête et l'exécution reste en
attente. Utilisez des lots plus petits en attendant la
[correction du planificateur agrégé du SDK](https://github.com/durable-workflow/sdk-rust/issues/254).
Ce chemin du SDK ne fournit pas encore la capacité supérieure du Server.

## Initialisation Docker et provenance {#docker-bootstrap-and-provenance}

| Variable | Valeur par défaut | Rôle | Ancien alias |
| --- | --- | --- | --- |
| `DW_EXPOSE_PACKAGE_PROVENANCE` | `false` | Inclut `package_provenance` dans `/api/cluster/info` pour les requêtes administrateur. | `WORKFLOW_SERVER_EXPOSE_PACKAGE_PROVENANCE` |
| `DW_PACKAGE_PROVENANCE_PATH` | `<base_path>/.package-provenance` | Chemin absolu du fichier de provenance de la construction Docker. | `WORKFLOW_SERVER_PACKAGE_PROVENANCE_PATH` |
| `DW_SERVICE_BOUNDARY_CROSS_NAMESPACE_DEFAULT` | `allow` | Action par défaut pour les appels de service entre espaces de noms lorsqu’aucune règle plus précise ne correspond. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_CROSS_NAMESPACE_DEFAULT` |
| `DW_SERVICE_BOUNDARY_RATE_LIMIT_PER_MINUTE` | non définie | Limite facultative par minute des appels à la frontière de service. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_RATE_LIMIT_PER_MINUTE` |
| `DW_SERVICE_BOUNDARY_MAX_IN_FLIGHT` | non définie | Limite facultative des appels simultanés à la frontière de service. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_MAX_IN_FLIGHT` |

## Initialisation Docker {#docker-bootstrap}

| Variable | Valeur par défaut | Rôle | Ancien alias |
| --- | --- | --- | --- |
| `DW_ENV_AUDIT_STRICT` | `0` | Fait échouer le démarrage du conteneur si `env:audit` détecte des variables `DW_*` inconnues ou anciennes. | - |
| `DW_BOOTSTRAP_RETRIES` | `30` | Nombre de tentatives avant l’abandon de l’initialisation des migrations et du namespace par défaut. | `WORKFLOW_SERVER_BOOTSTRAP_RETRIES` |
| `DW_BOOTSTRAP_DELAY_SECONDS` | `2` | Secondes entre les tentatives d’initialisation. | `WORKFLOW_SERVER_BOOTSTRAP_DELAY_SECONDS` |

## Paramètres du package Workflow {#workflow-package-controls}

L’image Server embarque `durable-workflow/workflow` et expose donc aussi les paramètres `DW_V2_*` du package. Ils doivent correspondre aux déploiements de workers qui exécutent les mêmes workflows.

| Variable | Valeur par défaut | Rôle | Ancien alias |
| --- | --- | --- | --- |
| `DW_V2_NAMESPACE` | non définie | Limite les instances de workflow à un espace de noms. | `WORKFLOW_V2_NAMESPACE` |
| `DW_V2_TENANCY_ORGANIZATION` | non définie | Segment organisation facultatif de la hiérarchie de tenancy du package, exposé à la disponibilité, à la découverte et aux interfaces opérateur. | `WORKFLOW_V2_TENANCY_ORGANIZATION` |
| `DW_V2_TENANCY_PROJECT` | non définie | Segment projet facultatif de la hiérarchie de tenancy du package, exposé à la disponibilité, à la découverte et aux interfaces opérateur. | `WORKFLOW_V2_TENANCY_PROJECT` |
| `DW_V2_TENANCY_ENVIRONMENT` | non définie | Segment environnement facultatif de la hiérarchie de tenancy du package, exposé à la disponibilité, à la découverte et aux interfaces opérateur. | `WORKFLOW_V2_TENANCY_ENVIRONMENT` |
| `DW_V2_CURRENT_COMPATIBILITY` | non définie | Marqueur de compatibilité annoncé par ce worker. | `WORKFLOW_V2_CURRENT_COMPATIBILITY` |
| `DW_V2_SUPPORTED_COMPATIBILITIES` | non définie | Marqueurs de compatibilité acceptés par ce worker, séparés par des virgules, ou `*`. | `WORKFLOW_V2_SUPPORTED_COMPATIBILITIES` |
| `DW_V2_COMPATIBILITY_NAMESPACE` | non définie | Namespace de compatibilité pour les bases de workflows partagées entre flottes indépendantes. | `WORKFLOW_V2_COMPATIBILITY_NAMESPACE` |
| `DW_V2_COMPATIBILITY_HEARTBEAT_TTL` | `30` | Durée de validité en secondes d’un heartbeat de compatibilité worker. | `WORKFLOW_V2_COMPATIBILITY_HEARTBEAT_TTL` |
| `DW_V2_PIN_TO_RECORDED_FINGERPRINT` | `true` | Préfère la définition de workflow enregistrée ; voir ci-dessous les limites de repli propres au runtime. | `WORKFLOW_V2_PIN_TO_RECORDED_FINGERPRINT` |
| `DW_V2_CONTINUE_AS_NEW_EVENT_THRESHOLD` | `10000` | Nombre d’événements d’historique auquel le package recommande continue-as-new à l’auteur du workflow. | `WORKFLOW_V2_CONTINUE_AS_NEW_EVENT_THRESHOLD` |
| `DW_V2_CONTINUE_AS_NEW_SIZE_BYTES_THRESHOLD` | `5242880` | Taille en octets de l’historique sérialisé à laquelle le package recommande continue-as-new. | `WORKFLOW_V2_CONTINUE_AS_NEW_SIZE_BYTES_THRESHOLD` |
| `DW_V2_HISTORY_EXPORT_SIGNING_KEY` | non définie | Clé HMAC facultative pour authentifier les archives exportées de l’historique. | `WORKFLOW_V2_HISTORY_EXPORT_SIGNING_KEY` |
| `DW_V2_HISTORY_EXPORT_SIGNING_KEY_ID` | non définie | Identifiant de clé enregistré avec les exports d’historique signés. | `WORKFLOW_V2_HISTORY_EXPORT_SIGNING_KEY_ID` |
| `DW_V2_UPDATE_WAIT_COMPLETION_TIMEOUT_SECONDS` | `10` | Secondes d’attente d’une mise à jour jusqu’à un état terminal. | `WORKFLOW_V2_UPDATE_WAIT_COMPLETION_TIMEOUT_SECONDS` |
| `DW_V2_UPDATE_WAIT_POLL_INTERVAL_MS` | `50` | Millisecondes entre les vérifications de l’étape d’une mise à jour. | `WORKFLOW_V2_UPDATE_WAIT_POLL_INTERVAL_MS` |
| `DW_V2_GUARDRAILS_BOOT` | `warn` | Mode des garde-fous structurels au démarrage : `warn`, `fail` ou `silent`. | `WORKFLOW_V2_GUARDRAILS_BOOT` |
| `DW_V2_LIMIT_PENDING_ACTIVITIES` | `2000` | Plafond des activités en attente au niveau du package. | `WORKFLOW_V2_LIMIT_PENDING_ACTIVITIES` |
| `DW_V2_LIMIT_PENDING_CHILDREN` | `1000` | Plafond des workflows enfants en attente au niveau du package. | `WORKFLOW_V2_LIMIT_PENDING_CHILDREN` |
| `DW_V2_LIMIT_PENDING_TIMERS` | `2000` | Plafond des temporisateurs en attente au niveau du package. | `WORKFLOW_V2_LIMIT_PENDING_TIMERS` |
| `DW_V2_LIMIT_PENDING_SIGNALS` | `5000` | Plafond des signaux en attente au niveau du package. | `WORKFLOW_V2_LIMIT_PENDING_SIGNALS` |
| `DW_V2_LIMIT_PENDING_UPDATES` | `500` | Plafond des mises à jour en attente au niveau du package. | `WORKFLOW_V2_LIMIT_PENDING_UPDATES` |
| `DW_V2_LIMIT_COMMAND_BATCH_SIZE` | `1000` | Nombre maximal de commandes acceptées dans la réponse de fin d’une tâche de workflow. | `WORKFLOW_V2_LIMIT_COMMAND_BATCH_SIZE` |
| `DW_V2_LIMIT_PAYLOAD_SIZE_BYTES` | `2097152` | Plafond en octets d’un payload au niveau du package. | `WORKFLOW_V2_LIMIT_PAYLOAD_SIZE_BYTES` |
| `DW_V2_LIMIT_MEMO_SIZE_BYTES` | `262144` | Plafond en octets d’un memo de workflow au niveau du package. | `WORKFLOW_V2_LIMIT_MEMO_SIZE_BYTES` |
| `DW_V2_LIMIT_SEARCH_ATTRIBUTE_SIZE_BYTES` | `40960` | Plafond en octets des attributs de recherche au niveau du package. | `WORKFLOW_V2_LIMIT_SEARCH_ATTRIBUTE_SIZE_BYTES` |
| `DW_V2_LIMIT_HISTORY_TRANSACTION_SIZE` | `5000` | Plafond du nombre d’événements d’une transaction d’historique au niveau du package. | `WORKFLOW_V2_LIMIT_HISTORY_TRANSACTION_SIZE` |
| `DW_V2_LIMIT_WARNING_THRESHOLD_PERCENT` | `80` | Pourcentage d’une limite structurelle auquel le package émet un avertissement. | `WORKFLOW_V2_LIMIT_WARNING_THRESHOLD_PERCENT` |
| `DW_V2_TASK_DISPATCH_MODE` | `queue` | Mode de distribution du package, généralement remplacé par `DW_TASK_DISPATCH_MODE` en mode Server. | - |
| `DW_V2_MATCHING_ROLE_QUEUE_WAKE` | `true` | Détermine si les workers de file déclenchent le réveil du rôle d’attribution à chaque événement Looping. Définissez `false` pour exclure les nœuds d’exécution de ce réveil général lorsqu’un démon dédié `php artisan workflow:v2:repair-pass --loop` gère le balayage. | `WORKFLOW_V2_MATCHING_ROLE_QUEUE_WAKE` |
| `DW_V2_TASK_REPAIR_REDISPATCH_AFTER_SECONDS` | `3` | Secondes avant la redistribution d’une tâche de workflow orpheline par la réparation. | `WORKFLOW_V2_TASK_REPAIR_REDISPATCH_AFTER_SECONDS` |
| `DW_V2_TASK_REPAIR_LOOP_THROTTLE_SECONDS` | `5` | Délai minimal en secondes entre les passages de réparation de tâches par file. | `WORKFLOW_V2_TASK_REPAIR_LOOP_THROTTLE_SECONDS` |
| `DW_V2_TASK_REPAIR_SCAN_LIMIT` | `25` | Nombre maximal de tâches examinées par passage de réparation. | `WORKFLOW_V2_TASK_REPAIR_SCAN_LIMIT` |
| `DW_V2_TASK_REPAIR_FAILURE_BACKOFF_MAX_SECONDS` | `60` | Délai maximal de recul après échec d’une réparation, en secondes. | `WORKFLOW_V2_TASK_REPAIR_FAILURE_BACKOFF_MAX_SECONDS` |
| `DW_V2_MULTI_NODE` | `false` | Déclare un déploiement multinœud afin de vérifier la coordination du backend de cache entre nœuds. | `WORKFLOW_V2_MULTI_NODE` |
| `DW_V2_VALIDATE_CACHE_BACKEND` | `true` | Vérifie le backend de cache du long polling au démarrage. | `WORKFLOW_V2_VALIDATE_CACHE_BACKEND` |
| `DW_V2_CACHE_VALIDATION_MODE` | `warn` | Comportement en cas d’échec de validation du cache : `fail`, `warn` ou `silent`. | `WORKFLOW_V2_CACHE_VALIDATION_MODE` |
| `DW_V2_FLEET_VALIDATION_MODE` | `warn` | Mode de validation de compatibilité de la flotte : `warn` journalise ; `fail` bloque la distribution et refuse si aucun worker compatible n’est disponible. | `WORKFLOW_V2_FLEET_VALIDATION_MODE` |
| `DW_SERIALIZER` | `avro` | Entrée diagnostique du codec de payload. La v2 finale choisit Avro pour les payloads des nouveaux runs. | `WORKFLOW_SERIALIZER` |

**Préférence d’empreinte publiée.** Server 2.9.9 rend effective la préférence d’empreinte pour les workers en mode service. Quand la fixation est activée, le repli vers une définition modifiée n’est possible que s’il ne reste aucun worker éligible avec la définition enregistrée et si le remplacement annonce `workflow_entry_arguments_validation`. Quand elle est désactivée, la préférence de code source disparaît ; les builds fixés, l’isolation namespace/file/type, l’identité d’enregistrement et la relecture stricte demeurent. Les protections d’entrée correspondantes sont disponibles depuis les SDK PHP 2.5.4, Python 2.6.2 et Rust 3.5.6. Ce sont les versions minimales pour ces fonctions. Installez les versions stables actuelles avec les correctifs de sécurité. Ne supposez pas qu’un ancien runtime offre ce comportement simplement parce que sa configuration contient la même clé. Consultez le [routage des définitions](./worker-compatibility-routing.md#definition-fingerprint-evolution).

Utilisez `DW_V2_GUARDRAILS_BOOT` dans la CI et les manifestes de déploiement. L’ancien nom `WORKFLOW_V2_GUARDRAILS_BOOT` n’est conservé que pour permettre à `env:audit` de signaler le renommage aux opérateurs des versions alpha. Le package Workflow ne le lit plus comme valeur de repli à l’exécution.

Consultez [Attribution et distribution des tâches](/docs/polyglot/task-matching-dispatch) pour configurer `DW_V2_MATCHING_ROLE_QUEUE_WAKE` ou un démon dédié `workflow:v2:repair-pass --loop`. Ces paramètres changent l’emplacement de la détection des tâches prêtes, pas le contrat du protocole worker.

## Contrôles supplémentaires du PHP Server publié {#additional-published-php-controls}

Cette référence couvre le contrat publié de **PHP Server 2.11.0**, dont les contrôles ci-dessous. Vérifiez l’image réellement exécutée : la version d’installation choisie séparément peut être plus ancienne. `unset` signifie qu’aucune valeur d’environnement n’est fournie ; son effet dépend du contrôle. Valeurs par défaut et alias viennent du [contrat publié](https://github.com/durable-workflow/server/blob/36d16273604755f3dd0743cab331cc7c62e51d8e/config/dw-contract.php). Le build vérifie son snapshot versionné dans chaque langue. Cette référence ne modifie pas les versions d’installation sélectionnées.

### Admission HTTP par namespace {#namespace-request-controls}

| Variable | Valeur par défaut | Rôle | Ancien alias |
| --- | --- | --- | --- |
| `DW_NAMESPACE_MAX_REQUESTS_PER_MINUTE` | `unset` | Plafond facultatif des requêtes de contrôle par minute et namespace ; aucune limite si absent. Le Server natif 3.x refuse de démarrer si le paramètre n’est pas vide ; voir [Server natif 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_MAX_REQUESTS_PER_MINUTE` |
| `DW_NAMESPACE_MAX_CONCURRENT_REQUESTS` | `unset` | Plafond facultatif des requêtes de contrôle simultanées par namespace ; aucune limite si absent. Le Server natif 3.x refuse de démarrer si le paramètre n’est pas vide ; voir [Server natif 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_MAX_CONCURRENT_REQUESTS` |
| `DW_NAMESPACE_HARD_MAX_REQUESTS_PER_MINUTE` | `unset` | Plafond impératif des requêtes par minute, y compris les exceptions par namespace. Le Server natif 3.x refuse de démarrer si le paramètre n’est pas vide ; voir [Server natif 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_HARD_MAX_REQUESTS_PER_MINUTE` |
| `DW_NAMESPACE_HARD_MAX_CONCURRENT_REQUESTS` | `unset` | Plafond impératif des requêtes simultanées, y compris les exceptions par namespace. Le Server natif 3.x refuse de démarrer si le paramètre n’est pas vide ; voir [Server natif 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_HARD_MAX_CONCURRENT_REQUESTS` |
| `DW_NAMESPACE_ADMISSION_OVERRIDES` | `{}` | Objet JSON par namespace avec exceptions de fréquence et de concurrence des requêtes. Le Server natif 3.x refuse de démarrer sauf si le paramètre est non défini ou vaut `{}` ; voir [Server natif 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_ADMISSION_OVERRIDES` |

[Admission des requêtes par namespace](./task-queue-admission.md#namespace-request-admission).

### Quotas d’état durable par namespace {#namespace-durable-controls}

| Variable | Valeur par défaut | Rôle | Ancien alias |
| --- | --- | --- | --- |
| `DW_NAMESPACE_DURABLE_LIMITS` | `{}` | JSON des quotas de lignes durables par namespace. Totaux et limites pending/open sont indépendants ; les tâches en attente sont les lignes ready en file, les leases actifs étant limités séparément. Un objet vide ne limite pas. Le Server natif 3.x refuse de démarrer sauf si le paramètre est non défini ou vaut `{}` ; voir [Server natif 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_DURABLE_LIMITS` |
| `DW_NAMESPACE_DURABLE_HARD_LIMITS` | `{}` | JSON des plafonds impératifs de lignes durables, exceptions comprises ; un objet vide n’ajoute aucun plafond opérateur. Le Server natif 3.x refuse de démarrer sauf si le paramètre est non défini ou vaut `{}` ; voir [Server natif 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_DURABLE_HARD_LIMITS` |
| `DW_NAMESPACE_DURABLE_OVERRIDES` | `{}` | JSON des exceptions de quotas durables par namespace ; les plafonds impératifs restent applicables. Le Server natif 3.x refuse de démarrer sauf si le paramètre est non défini ou vaut `{}` ; voir [Server natif 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_DURABLE_OVERRIDES` |

[Quotas d’état durable par namespace](./task-queue-admission.md#namespace-durable-state).

### Quotas de payload externe et transport S3 {#external-payload-quotas-and-s3}

| Variable | Valeur par défaut | Rôle | Ancien alias |
| --- | --- | --- | --- |
| `DW_EXTERNAL_PAYLOAD_COMPLETION_MAX_BYTES` | `unset` | Octets distincts des upload slots immuables d’un completion sous lease ; si absent, utilise `DW_EXTERNAL_PAYLOAD_MAX_BYTES`. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_COMPLETION_MAX_BYTES` |
| `DW_EXTERNAL_PAYLOAD_MAX_BYTES_PER_NAMESPACE` | `unset` | Octets cumulés des payloads externes par namespace. Compte les objets prêts et en cours ; aucune limite si absent. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_MAX_BYTES_PER_NAMESPACE` |
| `DW_EXTERNAL_PAYLOAD_MAX_OBJECTS_PER_NAMESPACE` | `unset` | Nombre d’objets de payload externe par namespace. Compte les objets prêts et en cours ; aucune limite si absent. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_MAX_OBJECTS_PER_NAMESPACE` |
| `DW_EXTERNAL_PAYLOAD_HARD_MAX_BYTES_PER_NAMESPACE` | `unset` | Plafond impératif des octets cumulés de payload externe par namespace, exceptions comprises. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_HARD_MAX_BYTES_PER_NAMESPACE` |
| `DW_EXTERNAL_PAYLOAD_HARD_MAX_OBJECTS_PER_NAMESPACE` | `unset` | Plafond impératif des objets de payload externe par namespace, exceptions comprises. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_HARD_MAX_OBJECTS_PER_NAMESPACE` |
| `DW_EXTERNAL_PAYLOAD_NAMESPACE_OVERRIDES` | `{}` | Objet JSON par namespace avec exceptions de quotas `max_bytes` et `max_objects`. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_NAMESPACE_OVERRIDES` |
| `DW_EXTERNAL_PAYLOAD_S3_ACCESS_KEY_ID` | `unset` | Access-key ID facultatif du disque compatible S3 géré par le runtime ; peut être omis avec workload identity. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_ACCESS_KEY_ID` |
| `DW_EXTERNAL_PAYLOAD_S3_SECRET_ACCESS_KEY` | `unset` | Clé secrète facultative du disque compatible S3 géré ; à définir avec l’access-key ID. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_SECRET_ACCESS_KEY` |
| `DW_EXTERNAL_PAYLOAD_S3_SESSION_TOKEN` | `unset` | Session token facultatif des identifiants temporaires du disque compatible S3 géré. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_SESSION_TOKEN` |
| `DW_EXTERNAL_PAYLOAD_S3_REGION` | `us-east-1` | Région du disque compatible S3 géré par le runtime. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_REGION` |
| `DW_EXTERNAL_PAYLOAD_S3_BUCKET` | `unset` | Bucket du disque compatible S3 géré par le runtime. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_BUCKET` |
| `DW_EXTERNAL_PAYLOAD_S3_ENDPOINT` | `unset` | Endpoint HTTPS facultatif du service compatible S3 pour les payloads externes. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_ENDPOINT` |
| `DW_EXTERNAL_PAYLOAD_S3_USE_PATH_STYLE_ENDPOINT` | `false` | Utiliser l’adressage de bucket path-style pour le service compatible S3 géré. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_USE_PATH_STYLE_ENDPOINT` |

### Limites de service par namespace appelant {#service-caller-namespace-controls}

| Variable | Valeur par défaut | Rôle | Ancien alias |
| --- | --- | --- | --- |
| `DW_SERVICE_BOUNDARY_NAMESPACE_RATE_LIMIT_PER_MINUTE` | `unset` | Limite facultative partagée des appels de service par minute, agrégée par namespace appelant. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_NAMESPACE_RATE_LIMIT_PER_MINUTE` |
| `DW_SERVICE_BOUNDARY_NAMESPACE_MAX_IN_FLIGHT` | `unset` | Limite facultative partagée des appels de service en cours, agrégée par namespace appelant. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_NAMESPACE_MAX_IN_FLIGHT` |
| `DW_SERVICE_BOUNDARY_HARD_RATE_LIMIT_PER_MINUTE` | `unset` | Plafond impératif par minute des politiques de frontière de service et de namespace appelant. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_HARD_RATE_LIMIT_PER_MINUTE` |
| `DW_SERVICE_BOUNDARY_HARD_MAX_IN_FLIGHT` | `unset` | Plafond impératif des appels en cours des politiques de frontière de service et de namespace appelant. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_HARD_MAX_IN_FLIGHT` |
| `DW_SERVICE_BOUNDARY_NAMESPACE_OVERRIDES` | `{}` | JSON des exceptions de fréquence et d’appels en cours par namespace appelant ; les plafonds restent applicables. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_NAMESPACE_OVERRIDES` |

### Coordination, stockage et runtime {#coordination-storage-and-runtime-controls}

| Variable | Valeur par défaut | Rôle | Ancien alias |
| --- | --- | --- | --- |
| `DW_OBSERVABILITY_CONTEXT_ENABLED` | `false` | Activer la persistance et la transmission bornées du trace context et la découverte lorsque leur API et leur schéma optionnels sont installés. | - |
| `DW_OBSERVABILITY_BAGGAGE_ALLOWLIST` | `[]` | Liste JSON des clés baggage autorisées aux origines du run ; vide par défaut. Les links ne transportent jamais de baggage. | - |
| `DW_STORAGE_ADMISSION_FILE` | `unset` | Fichier local facultatif d’observation de pression du stockage, en lecture seule ; les observations invalides ou anciennes bloquent les écritures. | - |
| `DW_STORAGE_ADMISSION_SOURCE` | `unset` | Identité attendue de la ressource de stockage dans l’observation d’admission. | - |
| `DW_STORAGE_ADMISSION_MAX_AGE_SECONDS` | `15` | Âge maximal de l’observation de stockage en secondes, de 1 à 300. | - |
| `DW_RUNTIME_CREDENTIALS_ENABLED` | `false` | Activer des identifiants bearer de runtime durables, liés au namespace et stockés en base, via l’API admin. | `WORKFLOW_SERVER_RUNTIME_CREDENTIALS_ENABLED` |
| `DW_WORKER_LONG_POLL_MAX_CONCURRENT_PER_NAMESPACE` | `unset` | Limite par nœud des attentes long-poll workflow/activity d’un namespace ; ne dépasse pas le plafond global des workers. Refuse si l’autorité du cache partagé est indisponible. Le Server natif 3.x l’ignore ; voir [Server natif 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKER_LONG_POLL_MAX_CONCURRENT_PER_NAMESPACE` |
| `DW_QUERY_TASK_POLL_MAX_CONCURRENT_PER_NAMESPACE` | `unset` | Limite par nœud des attentes long-poll query-task d’un namespace ; ne dépasse pas le plafond global des queries. Refuse si l’autorité du cache partagé est indisponible. Le Server natif 3.x l’ignore ; voir [Server natif 3.x](#native-server-3x). | `WORKFLOW_SERVER_QUERY_TASK_POLL_MAX_CONCURRENT_PER_NAMESPACE` |
| `DW_V1_ENABLED` | `false` | Activer migration et vidage de file embedded v1 seulement pour conserver délibérément son état ; Server autonome utilise uniquement v2 par défaut. | `WORKFLOW_V1_ENABLED` |

## Variables de l’infrastructure d’exécution {#runtime-infrastructure-variables}

Les variables d’infrastructure règlent le framework et ses dépendances. L’audit Server les reconnaît et ne les signale pas, mais elles ne constituent pas une API de configuration stable de Durable Workflow. Le natif 3.x lit le groupe Base de données, y compris les réglages TLS ci-dessous. Il n’a ni Redis, ni cache, ni file Laravel, écrit ses journaux sur la sortie d’erreur standard et ne lit pas `LOG_CHANNEL` ni `LOG_LEVEL`.

| Groupe | Variables | Utilisation |
| --- | --- | --- |
| Application | `APP_NAME`, `APP_ENV`, `APP_KEY`, `APP_DEBUG`, `APP_URL`, `APP_VERSION`, langue, fuseau horaire, maintenance et chiffrement | Identité et comportement de démarrage de l’application Laravel. |
| Journaux | `LOG_CHANNEL`, `LOG_LEVEL`, `LOG_STDERR_FORMATTER`, paramètres stack, daily, Slack et Papertrail | Destinations, format et conservation des journaux Laravel. |
| Base de données | `DB_CONNECTION`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, `DB_SOCKET`, `DB_URL`, `DB_SSLMODE` (`DB_SSL_MODE`), `DB_SSLROOTCERT` (`DB_SSL_ROOT_CERT`), `MYSQL_ATTR_SSL_CA`, jeu de caractères, collation et clés étrangères | Stockage SQL des tables de workflows, namespaces, workers et projections. Voir [TLS de la base de données](#database-tls). |
| Redis/cache/file | `REDIS_*`, `QUEUE_CONNECTION`, `QUEUE_FAILED_DRIVER`, `CACHE_STORE`, `CACHE_PREFIX`, `SESSION_*` | Workers de file, verrous du cache, signaux long poll et prise en charge du web et des sessions. |
| Systèmes de fichiers/courrier/diffusion | `FILESYSTEM_DISK`, `MAIL_*`, `BROADCAST_*`, `PUSHER_*`, `AWS_*` | Intégrations du framework utilisées par les fonctions propres au déploiement. |
| Construction/exécution | `MYSQL_VERSION`, `REDIS_VERSION`, `PHP_CLI_SERVER_WORKERS`, `VITE_APP_NAME`, `BCRYPT_ROUNDS` | Images Docker Compose et comportement d’exécution du framework. |

## TLS de la base de données {#database-tls}

Le natif 3.x interprète ces réglages comme PHP 2.x : mêmes entrées, alias,
noms de modes et refus. Il n’a qu’un processus Server à configurer, plus toute
commande `schema-upgrade` ou de reprise exécutée sur la même base. Sous PHP
2.x, appliquez les mêmes réglages TLS au serveur API, au worker de file, au job
d'initialisation/migration et à l'ordonnanceur. PostgreSQL utilise `prefer` par
défaut ; MySQL/MariaDB conservent leurs réglages de connexion sans mode explicite.
Aucun de ces défauts ne garantit une connexion chiffrée et authentifiée.

| `DB_SSLMODE` | PostgreSQL | MySQL / MariaDB |
| --- | --- | --- |
| `disable` | Sans TLS. | Sans TLS ; les options TLS contradictoires sont refusées. |
| `allow`, `prefer` | TLS opportuniste sans garantie de chiffrement ni d'identité. | Refusés. |
| `require` | Chiffrement obligatoire. | Chiffrement obligatoire avec mysqlnd et OpenSSL. |
| `verify-ca` | Chiffrement et chaîne de certificats de confiance obligatoires. | Refusé : PDO mysqlnd ne peut pas vérifier la chaîne indépendamment du nom d'hôte. |
| `verify-full` | Chiffrement, chaîne de confiance et nom d'hôte correspondant obligatoires. | Chiffrement, chaîne de confiance et nom d'hôte correspondant obligatoires. |

`DB_SSL_MODE` est un alias de `DB_SSLMODE` ; `DB_SSL_ROOT_CERT`, de
`DB_SSLROOTCERT`. Pour vérifier les certificats, montez un fichier CA lisible au
chemin configuré dans **chaque rôle**, migrations comprises. `MYSQL_ATTR_SSL_CA`
peut fournir la CA pour un `verify-full` explicite sur MySQL/MariaDB. Les
contradictions entre réglages canoniques, alias ou URL empêchent le démarrage.
TLS obligatoire exige un nom d'hôte TCP explicite ; les sockets Unix sont
refusés. Les modes TLS explicites de MySQL/MariaDB nécessitent PDO MySQL avec
mysqlnd et OpenSSL.

```dotenv
DB_CONNECTION=pgsql
DB_HOST=database.example.com
DB_SSLMODE=verify-full
DB_SSLROOTCERT=/run/database-ca/ca.pem
```

Utilisez le nom DNS du certificat. Avec Helm, configurez
`externalDatabase.sslMode` et `externalDatabase.tls.existingSecret` / `caKey`.
Créez le Secret avant l'installation ou la mise à niveau ; le chart monte sa
CA dans les quatre rôles, hook d'initialisation compris. Redémarrez les rôles
persistants après modification de l'environnement : la configuration est mise
en cache au démarrage.

## Journaux des conteneurs {#container-logs}

Le natif 3.x écrit toujours ses journaux sur la sortie d’erreur standard. Sous
PHP 2.x, définissez `LOG_CHANNEL=stderr` sur les conteneurs API, workers et ordonnanceur
pour que `docker logs` ou `kubectl logs` collecte les journaux applicatifs.
Définissez-le explicitement sur les versions existantes. `LOG_LEVEL` sélectionne
la gravité minimale. Pour du JSON avec un enregistrement par ligne, ajoutez :

```dotenv
LOG_STDERR_FORMATTER="Monolog\Formatter\JsonFormatter"
```

Redémarrez les processus persistants après toute modification, car la
configuration est mise en cache au démarrage. Un canal de fichier choisi
explicitement nécessite son propre stockage et sa propre collecte ; Kubernetes
ne collecte pas automatiquement `storage/logs/laravel.log`.
`DW_LOG_FORMAT` n'est pas un paramètre pris en charge.

## Notes de migration {#migration-notes}

Lors de la migration d’un ancien déploiement, passez au nom public et laissez l’ancien nom non défini. Si les deux sont présents, les opérateurs doivent se baser sur la valeur `DW_*` et supprimer l’ancien nom.

```bash
# Before
WORKFLOW_SERVER_AUTH_DRIVER=token
WORKFLOW_SERVER_OPERATOR_TOKEN=operator-secret

# After
DW_AUTH_DRIVER=token
DW_OPERATOR_TOKEN=operator-secret
```

Après la migration, exécutez l’image Server avec `DW_ENV_AUDIT_STRICT=1` pour détecter les fautes de frappe, les anciens alias et les paramètres copiés d’anciens guides d’exploitation.
