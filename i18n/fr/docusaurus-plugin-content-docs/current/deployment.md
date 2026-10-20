---
sidebar_position: 13
title: Déploiements auto-hébergés
description: Choisir un parcours d'auto-hébergement Durable Workflow v2 pris en charge et son artefact de départ.
---

# Déploiements auto-hébergés {#self-hosting-deployments}

Durable Workflow v2 prend en charge plusieurs topologies auto-hébergées.
Choisissez la plus petite adaptée à votre environnement, puis explicitez les
contrats d'image, de base, de cache, d'authentification, de disponibilité et de
mise à niveau.

Ce guide couvre la distribution du serveur autonome. Pour le paquet Laravel
embarqué dans votre application, utilisez les pages d'installation et de
configuration du paquet. Durable Workflow Cloud est un service géré distinct
où Cloud exploite runtime, persistance, placement et reprise. Un Server
auto-hébergé n'est jamais raccordé à Cloud. Consultez le
[runtime Cloud géré](/docs/polyglot/cloud-control-plane). Le contrat Cloud actuel
définit un runtime et une reprise gérés dans une seule région. Il ne promet
ni réplication multirégion, ni basculement régional automatique, ni retour à la région initiale.

La distribution Server n'inclut ni n'exploite Waterline. Déployez-le séparément
si vous souhaitez son interface opérateur et connectez-le à un espace de noms
Server selon le [guide de déploiement et supervision Waterline](/docs/monitoring/#waterline-service).
Cloud inclut quant à lui Managed Waterline pour son espace de noms géré.

## Matrice de prise en charge des déploiements {#deployment-support-matrix}

| Parcours | Point de départ | Pris en charge pour | Hors des promesses de ce parcours | Début de l'assistance commerciale |
| --- | --- | --- | --- | --- |
| Développement local et environnements internes hors production | [`docker-compose.published.yml`](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml) avec `%%artifact.serverTagEnv%%` ou `%%artifact.serverImageEnv%%` | Poste développeur, démonstrations sur réseau local, préproduction partagée, tests d'intégration SDK et workers | Production exposée à Internet, garanties de sauvegarde durable, rotation stricte des secrets, basculement multinœud | Vous souhaitez transformer une pile de développement fonctionnelle en procédure de production |
| Production sur un nœud | [`docker-compose.published.yml`](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml) avec fichier d'environnement de production, volumes MySQL et Redis, jetons par rôle, sauvegardes, TLS via proxy inverse et versions ou empreintes d'images fixes | Une VM, un VPS ou un hôte Docker interne avec état durable et exploitation simple | Haute disponibilité de l'hôte, basculement automatique de base, reprise multirégion, changements majeurs de topologie sans interruption | Le déploiement sert la production et vous souhaitez une revue des procédures de sauvegarde, restauration, authentification, TLS, mise à niveau ou retour arrière |
| Petit cluster | Images publiées `durableworkflow/server` ou `ghcr.io/durable-workflow/server` utilisant la [recette Compose](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml) comme modèle de conteneurs/processus, avec 2 à 3 nœuds API, MySQL/PostgreSQL externe partagé, Redis partagé, workers dimensionnés indépendamment et exactement un ordonnanceur/processus de maintenance | Capacité horizontale API et worker lorsqu'un nœud ne suffit plus. Mises à niveau progressives si toutes les garanties du [contrat correspondant](/docs/rolling-upgrades) sont respectées | Cluster SQLite, multinœud sans Redis, ordonnanceurs en double en régime établi, bases multirédacteurs actif/actif, basculement régional sans intervention en auto-hébergement, promesses SLA générales « cinq neuf » ou « sans interruption », et basculement HA monorégion autonome avant réussite de sa [condition de preuves de publication](#release-evidence-status) | Vous avez besoin de dimensionnement, domaines de panne, déploiement ou reprise sur plusieurs hôtes, ou souhaitez revendiquer le comportement HA monorégion soumis à validation |
| Chart Helm pour Kubernetes | [Chart du dépôt Server](https://github.com/durable-workflow/server/tree/main/k8s/helm/durable-workflow) à `oci://ghcr.io/durable-workflow/charts/durable-workflow`, avec votre base externe, Redis, ingress et gestion des secrets | Installation et mise à niveau de production reproductibles des ressources serveur, worker, ordonnanceur unique, initialisation, service, sondes et politiques du chart | Persistance incluse, infrastructure gérée par fournisseur, multirégion actif/actif, opérateurs personnalisés, et HA monorégion autonome avant réussite de sa [condition de preuves](#release-evidence-status) | Vous avez besoin d'architecture, capacité, reprise propres au fournisseur ou de changements hors du contrat des valeurs publiées |
| Manifestes Kubernetes bruts | Manifestes [`k8s/`](https://github.com/durable-workflow/server/tree/main/k8s) du serveur, avec images publiées, base, Redis, ingress et secrets existants | Équipes exploitant déjà Kubernetes et voulant des manifestes inspectables pour API, worker, ordonnanceur, initialisation, service, sondes, configuration et secrets | Cycle de vie Helm distinct, validation d'un fournisseur Kubernetes géré, multirégion actif/actif, opérateurs personnalisés, décisions de stockage/réseau/sécurité propres à l'environnement, et HA monorégion autonome avant réussite de sa [condition de preuves](#release-evidence-status) | Vous avez besoin de surcouches, validation de cluster géré, préparation de production propre au fournisseur ou souhaitez revendiquer le comportement HA soumis à validation |
| Évaluation multirégion actif/passif | Déploiement validé sur un nœud ou petit cluster par région, réplication asynchrone de la base active vers le secours et procédures revues de basculement/retour | Évaluation d'architecture accompagnée et répétition propre à l'environnement pour la reprise après sinistre régional | Contrat 2.0 autonome éprouvé, multirégion actif/actif, basculement régional automatique ou sans intervention, réplication synchrone interrégion (RPO=0), visibilité active interrégion ou recherche fédérée, files fixées à une région imposée par le moteur | Avant de dépendre en production de réplication interrégion, basculement, retour, RPO ou RTO |
| Topologies accompagnées | Conception revue pour votre environnement | Multirégion actif/passif ou actif/actif auto-hébergé, basculement sans intervention, réplication entre rédacteurs RPO=0, ordonnanceurs en double en régime établi, sécurité/réseau sur mesure, SLO privés, surcouches et planification de migration | Exploitation autonome par simple copier-coller | La topologie elle-même participe au risque produit |

La distribution publique est volontairement optimisée pour le développement
local, la production sur un nœud et les petits clusters. Les manifestes
Kubernetes s'adressent aux équipes qui exploitent déjà Kubernetes. Le contenu
multirégion actif/passif est un guide d'évaluation accompagné (voir
[Multirégion actif/passif](#activepassive-multi-region)), pas un contrat 2.0
autonome éprouvé.
Le basculement HA monorégion, couvrant base gérée, Redis géré, perte de nœud
API, perte de worker et redémarrage de l'ordonnanceur dans une région, reste
accompagné tant que la condition de preuves de publication exacte est fermée
(voir [Haute disponibilité et basculement monorégion](#single-region-high-availability-and-failover)).
En auto-hébergement, multirégion actif/actif, basculement régional automatique,
ordonnanceurs en double en régime établi et validation Kubernetes géré propre
au fournisseur restent accompagnés : ils dépendent de vos choix de base, cache,
réseau, sécurité, processus et mises à niveau. Le chart Helm publié est un
parcours de packaging autonome dans ces mêmes frontières de responsabilité.
Cloud offre actuellement exploitation et reprise gérées dans une région, sans
réplication ni basculement multirégion. Consultez le
[runtime Cloud géré](/docs/polyglot/cloud-control-plane) et le
[périmètre d'assistance](/docs/support) pour le modèle commercial.

## Livrables de reprise en production {#production-recovery-deliverables}

Déclarer une topologie « prête pour la production » implique d'en publier le
dossier de reprise, au-delà du démarrage des conteneurs. Gardez les dernières
preuves dans la même procédure que les commandes de déploiement :

| Parcours | Dossier minimal de reprise publié |
| --- | --- |
| Production sur un nœud | Calendrier de sauvegarde, image ou empreinte fixe, emplacement de l'instantané d'environnement/configuration, retard maximal de restauration accepté, date de dernière répétition réussie et preuves de vérification. |
| Petit cluster | Dossier mononœud, impact attendu de la perte d'un nœud API, worker, ordonnanceur/maintenance, Redis ou base partagée, réenregistrement des workers après restauration et choix documenté de mise à niveau progressive ou avec arrêt pour la publication actuelle. |
| Chart Helm Kubernetes | Dossier cluster, version du chart, révision des valeurs, empreinte d'image, responsables d'ingress et secrets du cluster, dernière répétition de mise à niveau/retour arrière du chart. |
| Manifestes Kubernetes bruts | Dossier cluster et responsables du stockage, secrets, ingress et déploiement propres au cluster à restaurer ou réappliquer avant de déclarer le trafic sain. |
| Évaluation HA monorégion, accompagnée tant que la condition de preuves est fermée | Dossier cluster ou manifestes bruts, preuves de répétition des basculements de base et Redis gérés, perte de nœud API, perte de worker et redémarrage d'ordonnanceur. Chaque cas respecte la cible du [contrat HA monorégion](#single-region-high-availability-and-failover) sans perte d'écriture acquittée. |
| Évaluation multirégion actif/passif accompagnée | Dossier par région, conception de réplication et d'isolement des anciens primaires, retard mesuré, RPO/RTO de l'opérateur, procédures de promotion et retour, preuves de répétition propres à l'environnement. |

Si vous ne pouvez produire ce dossier à la demande, traitez l'environnement
comme une préproduction tant que le contrat n'est pas écrit et répété. Le
[périmètre d'exploitation opérateur](/docs/operator-operating-envelope) définit
l'ordre de restauration, la vérification et la cadence de répétition à suivre.

## Sécurité, données et audit {#security-data-and-audit-posture}

Les déploiements auto-hébergés héritent de l'essentiel des contrôles de sécurité
de votre environnement. Publiez ces faits dans le même dossier de publication
ou d'exploitation que la version d'image, les migrations et les preuves de reprise :

| Domaine | Déclaration de publication exacte |
| --- | --- |
| Traitement des données | Arguments, résultats, historique, mémos, attributs de recherche, libellés de visibilité, contexte de commande, lignes d'audit, messages d'exception et notes opérateur peuvent contenir des données applicatives client. Les [identifiants de workflow](./defining-workflows/workflow-id.md#ids-are-visible-metadata), attributs de recherche et libellés sont des métadonnées visibles par l'opérateur, pas du stockage secret. Les identifiants restent en clair, hors des codecs de charge utile. |
| Chiffrement | Utilisez TLS pour toutes les interfaces HTTP de production. Le chiffrement au repos dépend de votre base, stockage objet, système de fichiers, files, cache et gestionnaire de secrets. Le paquet et le serveur ne chiffrent pas automatiquement chaque champ de charge utile. |
| Conformité | Paquet open source et serveur auto-hébergé offrent contrôles et preuves d'audit, sans constituer une certification. SOC 2, HIPAA, PCI, ISO ou FedRAMP relèvent de votre programme, sauf documentation explicite d'une offre hébergée. |
| Journaux d'audit | Commandes, événements d'audit des planifications, métadonnées d'export et appels de service fournissent des preuves durables d'exploitation. Ce ne sont ni un SIEM complet, ni un système DLP, registre externe immuable ou dispositif de conservation légale sans ces composants supplémentaires. |
| Assistance | Identifiants par rôle, terminaison TLS, sauvegardes, répétitions et topologies autonomes limitées sont documentés ici. Identité avancée, déploiement mTLS, réseau privé, moteurs de politiques, conformité fournisseur et topologies sur mesure restent accompagnés sauf indication publique contraire. |

La configuration réseau doit être explicite :

- **Entrée webhook :** documentez adresse publique, authentification, stratégie
  de relecture ou d'idempotence, délai, limite de charge utile, en-têtes de
  proxy de confiance et rotation des secrets.
- **Trafic worker vers backend :** vérifiez TLS, utilisez identifiants workers
  limités par rôle, en-têtes d'espace de noms, réseau privé ou mTLS sur un
  réseau non fiable et rotation sans donner de capacités opérateur aux jetons workers.
- **Interfaces opérateur :** placez Waterline, API opérateur serveur, points
  d'automatisation CLI et panneaux administratifs derrière sessions authentifiées
  ou identifiants de service par rôle, avec protection CSRF des sessions
  navigateur et frontières proxy/TLS documentées.

## Images publiées {#published-images}

Utilisez les images publiées pour les serveurs auto-hébergés :

- Docker Hub : `%%artifact.serverDockerHubImage%%`
- GitHub Container Registry : `%%artifact.serverGhcrImage%%`
- Empreintes fixes : `durableworkflow/server@sha256:...` ou
  `ghcr.io/durable-workflow/server@sha256:...`

Réservez les tags variables aux expériences locales. En production, fixez une
version ou empreinte pour rendre mise à niveau et retour arrière auditables.

## Développement local et environnements internes hors production {#local-development-and-internal-non-production}

La recette Compose d'images publiées fournit une pile sans sources avec MySQL et Redis :

```bash
curl -fsSLO https://raw.githubusercontent.com/durable-workflow/server/main/docker-compose.published.yml

export %%artifact.serverTagEnv%%
export DW_AUTH_TOKEN=dev-token

docker compose -f docker-compose.published.yml up -d --wait
```

Vérifiez API, disponibilité, découverte et enregistrement worker :

```bash
curl http://localhost:8080/api/health
curl http://localhost:8080/api/ready
curl -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  http://localhost:8080/api/cluster/info

curl -X POST http://localhost:8080/api/worker/register \
  -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Namespace: default" \
  -H "X-Durable-Workflow-Protocol-Version: 1.0" \
  -d '{"worker_id":"compose-worker","task_queue":"compose","runtime":"python"}'
```

Ce parcours convient au développement et à la préproduction interne. Ce n'est
pas une frontière de sécurité de production : l'exemple utilise un jeton unique
de compatibilité, mots de passe par défaut, volumes locaux nommés et aucun TLS.

## Production sur un nœud {#single-node-production}

Utilisez le même artefact Compose avec une configuration de production hors
du contrôle de versions :

```env
%%artifact.serverImageEnv%%
SERVER_PORT=8080
APP_ENV=production
APP_DEBUG=false

DB_DATABASE=durable_workflow
DB_USERNAME=workflow
DB_PASSWORD=replace-with-random-password
DB_ROOT_PASSWORD=replace-with-random-root-password

DW_AUTH_DRIVER=token
DW_AUTH_BACKWARD_COMPATIBLE=false
DW_WORKER_TOKEN=replace-with-worker-token
DW_OPERATOR_TOKEN=replace-with-operator-token
DW_ADMIN_TOKEN=replace-with-admin-token
```

Démarrez avec ce fichier :

```bash
docker compose --env-file durable-workflow.prod.env \
  -f docker-compose.published.yml up -d --wait
```

Exploitez l'hôte comme un service de production :

- Placez TLS, routage public, journalisation des requêtes et listes d'IP autorisées
  dans un proxy inverse devant le conteneur API.
- N'exposez ni MySQL ni Redis publiquement.
- Utilisez `DW_WORKER_TOKEN` pour les workers, `DW_OPERATOR_TOKEN` pour le trafic
  applicatif et opérateur, `DW_ADMIN_TOKEN` pour l'administration et les espaces de noms.
- Sauvegardez le volume MySQL avant chaque mise à niveau et régulièrement.
  Préservez Redis pour les redémarrages propres, mais MySQL reste la source
  de vérité de l'historique durable.
- Gardez ensemble fichier d'environnement exact, version ou empreinte d'image
  et sauvegarde de base pour les restaurations.

Ordre de mise à niveau :

1. Sauvegardez MySQL et consignez l'image actuelle.
2. Changez uniquement `DW_SERVER_IMAGE` ou `DW_SERVER_TAG`.
3. Téléchargez la nouvelle image.
4. Lancez `docker compose --env-file durable-workflow.prod.env -f docker-compose.published.yml up -d --wait`.
5. Confirmez `/api/ready`, `/api/cluster/info` et l'enregistrement worker avant
   de transférer le trafic externe.

Le README serveur conserve les exemples Compose actuels dans
[Official Image + Compose](https://github.com/durable-workflow/server#official-image--compose).

## Petits clusters {#small-clustered-deployments}

Un petit cluster étend modestement le modèle mononœud. Son contrat autonome
validé reste volontairement limité :

- Exécutez 2 à 3 conteneurs API sans état derrière un répartiteur. Santé,
  disponibilité, découverte, enregistrement, interrogation et achèvement des
  tâches doivent fonctionner sans sessions persistantes.
- Utilisez une base externe partagée MySQL ou PostgreSQL pour l'historique.
  SQLite est limité à un nœud et n'est pas un backend de cluster.
- Utilisez Redis partagé pour cache, réveils d'interrogation longue, verrous de
  file de requêtes de lecture, verrous d'admission et état des files. Le
  multinœud sans Redis n'est pas un contrat de cluster pris en charge.
- Contrôlez `GET /api/cluster/info` sur chaque nœud lors du déploiement.
  `topology.current_shape` reste `standalone_server`, `topology.current_roles`
  inclut `api_ingress`, `control_plane`, `matching`, `history_projection`, et
  `topology.execution_mode` reste `remote_worker_protocol`. Confirmez le chemin
  réellement déployé avec `topology.matching_role` : par défaut,
  `queue_wake_enabled: true`, `shape: "in_worker"`, `wake_owner: "worker_loop"`.
  Le mode dédié avec `DW_V2_MATCHING_ROLE_QUEUE_WAKE=0` annonce
  `queue_wake_enabled: false`, `shape: "dedicated"`,
  `wake_owner: "dedicated_repair_pass"`. Le bloc doit conserver le
  `task_dispatch_mode` voulu, les axes figés `partition_primitives` et le
  `backpressure_model` courant. Consultez la
  [topologie des rôles Server](/docs/polyglot/server-role-topology) pour chaque champ.
- Dimensionnez les workers SDK externes indépendamment des nœuds API. Ils
  peuvent être sur des hôtes ou processus séparés, mais doivent utiliser
  l'adresse API répartie, sans dépendance à un nœud fixe.
- Configurez l'[admission des files](/docs/polyglot/task-queue-admission) pour
  protéger locataire, API externe, pool de base ou autre dépendance partagée.
- Exécutez exactement un ordonnanceur ou processus de maintenance pour les
  planifications, délais d'activité et purge d'historique.
- Appliquez initialisation et migrations une fois par déploiement avant
  l'admission du trafic par les nouveaux conteneurs API et workers.
- Choisissez pour cette publication un arrêt complet (drainer les workers,
  arrêter ordonnanceur/maintenance, remplacer les nœuds API, initialiser/migrer,
  puis redémarrer workers et ordonnanceur), ou les
  [mises à niveau progressives](/docs/rolling-upgrades) si toutes leurs garanties tiennent.
- Considérez base et Redis comme les domaines de panne principaux. Les
  conteneurs serveur sont remplaçables, les couches de persistance et coordination non.

Les recettes autonomes démarrent en `standalone_server`, même si la découverte
nomme aussi `split_control_execution` comme topologie produit prise en charge.
Il s'agit d'un contrat avec des rôles répartis différemment, pas d'un second
produit serveur. Pour un futur essai de séparation explicite, lisez toujours
`topology.current_shape`, `topology.current_roles` et `topology.matching_role`
dans `/api/cluster/info` sans déduire les responsabilités des noms d'hôtes ou
de conteneurs. La [topologie des rôles Server](/docs/polyglot/server-role-topology)
regroupe ces affectations et le parcours de migration.

Tous les nœuds API doivent partager jetons ou clés de signature, version
applicative et Workflow, configuration de codec, connexions de base et Redis.
Donnez à chacun un `DW_SERVER_ID` unique pour la découverte et les journaux.

Les limites sont explicites : cluster SQLite, multinœud sans Redis,
ordonnanceurs en double en régime établi, bases multirédacteurs actif/actif,
basculement régional sans intervention et promesses SLA générales « cinq neuf »
ou « sans interruption » nécessitent une validation séparée ou une conception
accompagnée avant utilisation. Le multirégion actif/passif est aussi une
évaluation accompagnée : voir [Multirégion actif/passif](#activepassive-multi-region).
Le basculement HA monorégion, base gérée, Redis géré, perte API/worker et
redémarrage d'ordonnanceur, reste un contrat d'évaluation accompagné jusqu'à
réussite de la condition de preuves. La section
[Haute disponibilité et basculement monorégion](#single-region-high-availability-and-failover)
décrit cibles de reprise, règles de disponibilité et preuves nécessaires.

Ce parcours est autonome si votre équipe possède déjà un modèle clair de VM,
réseau, base, cache, sauvegardes et répartiteur. Il devient accompagné si elle
a besoin d'aide sur ces frontières, la capacité, l'ordre de déploiement ou la reprise.

## Budgets de connexions SQL {#sql-connection-budgets}

Établissez un budget de sessions avant d'ajouter des réplicas API ou de faire
coexister anciens et nouveaux processus pendant une
[mise à niveau progressive](/docs/rolling-upgrades). La base peut atteindre sa
limite de connexions alors que du CPU reste disponible. Cette limite est
distincte de la latence d'écriture/commit, de la capacité HTTP et de la
croissance des données conservées.

### Compter chaque processus utilisant SQL {#count-every-sql-owning-process}

Le déploiement PHP Compose publié comporte ces clients SQL possibles :

| Rôle | Éléments à compter |
| --- | --- |
| API | Chaque processus PHP traitant simultanément une requête susceptible d'utiliser SQL, y compris les contrôles de disponibilité, les requêtes opérateur et les polls en attente. La configuration Apache prefork publiée autorise 24 processus de requête par conteneur API. C'est un plafond de processus HTTP, pas un pool SQL ni une mesure de 24 sessions ouvertes. |
| Workers de queue Laravel | Chaque processus `php artisan queue:work`. La recette Compose publiée en lance un ; chaque conteneur worker supplémentaire ajoute des processus. Ils sont distincts des workers SDK externes. |
| Ordonnanceur/maintenance | Les commandes PHP simultanées, pas uniquement le conteneur ordonnanceur. L'ordonnanceur Compose exécute successivement évaluation des planifications, réparation, expiration des activités et purge. Sa boucle normale n'a donc qu'une commande active à la fois. Conservez la règle d'un ordonnanceur unique. |
| Initialisation et outils d'exploitation | Commandes de migration/initialisation, reconstruction des projections, rétention, sauvegarde, supervision et clients SQL interactifs pouvant coexister avec le déploiement. Comptez séparément les commandes volontairement simultanées. |
| Clients et workers SDK | Normalement aucune session directe vers la base du Server : les SDK PHP, Python et Rust en mode service utilisent HTTP. Ajoutez des connexions uniquement si vos activités ou un autre code applicatif accèdent réellement à cette base. |

Comptez **les connexions SQL distinctes utilisées par chaque processus**, pas
seulement les conteneurs ou noms d'hôtes. La connexion Laravel par défaut et
`workflows.storage.connection` peuvent utiliser le même nom de connexion
configuré. Un autre nom pour le stockage, une connexion SQL de queue/cache/session
ou une connexion de lecture/écriture/directe distincte peut ouvrir une session
supplémentaire, même vers le même point d'accès. Les connexions Redis ne sont
pas des sessions SQL. Inspectez la configuration effective mise en cache et
les noms réellement utilisés par chaque rôle.

Pour un déploiement FPM personnalisé, comptez les processus d'exécution
PHP-FPM, pas les threads nginx ou Apache event. Pour Octane, inventoriez
workers de requêtes, workers de tâches et clients réels de la base. Ne
réutilisez pas le nombre de 24 processus Apache comme taille de pool pour ces
frontaux. Un long poll synchrone occupe un processus PHP pendant l'attente et
peut conserver une session SQL. Ne comptez donc pas automatiquement un poll
HTTP inactif comme une consommation SQL nulle.

### Exemple prudent de mise à niveau progressive {#a-conservative-rolling-upgrade-example}

Ceci est un exemple de planification, **pas une capacité mesurée**. Supposons
une limite de 120 sessions clientes, dix sessions pour d'autres applications
et quinze réservées à la reprise et à l'administration. Il reste 95 sessions
pour ce déploiement. Supposons queue/cache sur Redis et au plus une connexion
SQL par processus PHP.

| Coexistence maximale | Calcul | Sessions prévues |
| --- | --- | ---: |
| Réplicas API, dont un réplica supplémentaire pendant le déploiement | `(2 + 1) × 24 × 1` | 72 |
| Workers de queue Laravel | `2 × 1` | 2 |
| Commande unique d'ordonnancement/maintenance | `1 × 1` | 1 |
| Initialisation/migration | `1 × 1` | 1 |
| Sauvegarde, supervision et autres outils autorisés | Allocation explicite | 4 |
| **Sous-total du déploiement** | | **80** |
| Marge du déploiement non allouée | `95 − 80` | 15 |

Avec ces hypothèses, un quatrième réplica API porterait le sous-total à 104,
au-delà des 95 sessions allouées. Deux connexions SQL par processus API
exigeraient déjà 144 sessions pour les trois réplicas API seuls. Recalculez le
budget lorsque vous modifiez connexions de stockage, nombre de workers ou
réplicas supplémentaires pendant le déploiement. Réduisez les plafonds ou
remplacez les groupes par étapes au lieu de supposer que la base absorbera la
coexistence. Augmenter `max_connections` exige aussi une revue de la mémoire
de la base et de la charge.

### Observer et faire respecter le budget {#observe-and-enforce-the-budget}

1. Consignez la limite effective de connexions, les autres clients et l'accès
   réservé à la reprise. Fixez les maxima de réplicas/processus API et le
   nombre de réplicas supplémentaires pendant le déploiement. Incluez les
   générations de workers de queue et les outils qui se chevauchent.
2. Dans une copie isolée utilisant votre image publiée et votre configuration
   exactes, échantillonnez les sessions au repos, pendant les polls en attente,
   pendant du travail réel et lors d'une coexistence ancienne/nouvelle bornée.
   Comptez les sessions inactives et le moniteur lui-même. PostgreSQL expose
   `pg_stat_activity`, MySQL `information_schema.PROCESSLIST`. Utilisez un rôle
   de supervision suffisamment restreint et n'exportez ni SQL ni charges utiles.
3. Comparez les sessions observées par utilisateur applicatif/base à
   l'allocation par processus. Un court échantillon vérifie les hypothèses de
   ce montage, pas une limite de saturation ni une garantie pour toute charge.
4. Suivez la marge de sessions avec les refus de connexion, latences de
   transaction/commit, attentes de verrou, requêtes HTTP en attente et
   croissance du stockage. La disponibilité seule ne prouve pas une capacité
   libre pour le déploiement.
5. Près de la limite, réduisez la coexistence ou videz et arrêtez un ancien
   groupe API/worker avant son remplacement. Préservez l'accès de reprise et
   lancez l'initialisation uniquement dans la fenêtre de migration prévue.
   Si une coexistence sûre ne tient pas dans le budget, utilisez la procédure
   documentée avec arrêt complet.

L'[admission des queues de tâches](/docs/polyglot/task-queue-admission) borne
certaines opérations de dispatch et de lease.
`DW_WORKER_LONG_POLL_MAX_CONCURRENT` et `DW_QUERY_TASK_POLL_MAX_CONCURRENT`
bornent les polls en attente par nœud. Aucun ne plafonne globalement sessions
SQL, octets de la base ou latence de commit. Gardez aussi de la capacité pour
les complétions, heartbeats, requêtes opérateur et contrôles de santé.

Prenez comme référence un point d’accès direct à la base en écriture. Un proxy doit être qualifié avec la version exacte du Server, son mode de pool et ses réglages de requêtes préparées, frontières transactionnelles, état de session et verrous. **Le pool transactionnel PgBouncer exige le Server corrigé, version 2.9.8 ou ultérieure.** L’[acceptation de la version publiée 2.9.8](https://github.com/durable-workflow/server/issues/524#issuecomment-6293185092) qualifie PostgreSQL 16.15 avec PgBouncer 1.26.1 : PostgreSQL direct, pool de sessions et pool transactionnel avec `max_prepared_statements=0` ou `max_prepared_statements=200`. C’est une version minimale compatible et une configuration précise testée, pas un choix automatique de la dernière version ni une garantie de capacité ; qualifiez séparément les autres combinaisons. Exécutez l’initialisation habituelle `server-bootstrap` sur le point d’accès choisi avant d’admettre du trafic.

`GET /api/ready` exécute une lecture de base avec paramètres liés (`bound_read_query`) et les contrôles de disponibilité configurés ; la capacité d’écriture reste explicitement non vérifiée. Une connexion TCP, une migration ou une réponse de disponibilité réussie ne prouve ni toutes les opérations SQL des workflows ni la capacité de commit. Les réplicas de lecture ne doivent pas remplacer le primaire faisant autorité pour les claims et transitions durables.

## Chart Helm pour Kubernetes {#helm-chart-for-kubernetes}

Le dépôt Server possède les
[sources du chart et consignes de publication](https://github.com/durable-workflow/server/tree/main/k8s/helm/durable-workflow).
Installez le chart publié depuis le registre OCI :

```bash
helm install durable-workflow \
  oci://ghcr.io/durable-workflow/charts/durable-workflow \
  --namespace durable-workflow --create-namespace \
  -f my-values.yaml
```

Votre fichier de valeurs doit désigner MySQL/PostgreSQL et Redis externes,
fournir les identifiants de production via des Secrets Kubernetes existants
et configurer ingress/TLS pour votre environnement. Le chart ne crée ni
persistance ni infrastructure gérée par fournisseur. Pour la reproductibilité,
ajoutez `--version <validated-chart-version>` et fixez l'image Server par
empreinte. Le dépôt Server publie les versions du chart et documente ses mises
à niveau avec ses sources.

## Manifestes Kubernetes {#kubernetes-manifests}

Le dépôt serveur inclut des manifestes bruts sous
[`k8s/`](https://github.com/durable-workflow/server/tree/main/k8s) pour les
équipes qui exploitent déjà Kubernetes :

- Espace de noms et libellés partagés
- Séparation ConfigMap et Secret
- Job d'initialisation/migration
- Deployment API et Service
- Deployment worker
- CronJob ordonnanceur
- PodDisruptionBudget
- Sondes de vie `/api/health` et disponibilité `/api/ready`
- Demandes et limites de ressources prudentes

Avant application, fixez une version ou empreinte d'image publiée, fournissez
les vrais identifiants de base et Redis, puis reliez les valeurs ConfigMap aux
services existants du cluster. Ces manifestes sont volontairement bruts et
inspectables. Ce n'est pas un chart Helm et ils ne promettent pas un comportement
générique de Kubernetes géré.

Pour un déploiement de production, prouvez au minimum :

```bash
kubectl -n durable-workflow wait --for=condition=complete job/durable-workflow-migrate --timeout=180s
kubectl -n durable-workflow rollout status deploy/durable-workflow-server
kubectl -n durable-workflow rollout status deploy/durable-workflow-worker
kubectl -n durable-workflow port-forward svc/durable-workflow-server 8080:8080
curl http://localhost:8080/api/ready
curl -H "Authorization: Bearer $DW_ADMIN_TOKEN" http://localhost:8080/api/cluster/info
```

Le basculement HA monorégion, base et Redis gérés, perte API/worker et redémarrage
d'ordonnanceur, reste accompagné avec les manifestes bruts comme avec le petit
cluster tant que la condition de preuves est fermée. Le contrat visé exige les
règles de disponibilité, ordonnanceur unique et socle partagé de
[Haute disponibilité et basculement monorégion](#single-region-high-availability-and-failover).
Répartiteurs fournisseur, classes de stockage, politiques réseau, multirégion
actif/actif et basculement régional sans intervention restent accompagnés ou
suivis séparément. Utilisez le parcours Helm versionné séparément pour une
installation et des mises à niveau gérées par Helm.

## Haute disponibilité et basculement monorégion {#single-region-high-availability-and-failover}

Ce basculement est actuellement un candidat de contrat **non vérifié et
accompagné**, ajouté aux petits clusters et manifestes Kubernetes bruts. Il
cible les pannes auxquelles le moteur est conçu pour survivre **dans une région** :
basculement de base gérée (RDS Multi-AZ, Aurora, Cloud SQL HA, promotion Patroni,
etc.), Redis géré (Sentinel, groupe de réplication Elasticache, Memorystore HA,
etc.), perte de nœud API, perte de worker et redémarrage ordonnanceur/maintenance.
La reprise actif/passif entre régions est une autre évaluation accompagnée :
voir [Multirégion actif/passif](#activepassive-multi-region).

Le contrat visé, comportement moteur, disponibilité, cibles par événement,
prévention du double primaire et test d'acceptation, se trouve dans la bibliothèque
Workflow à [`docs/deployment/ha-failover.md`](https://github.com/durable-workflow/workflow/blob/main/docs/deployment/ha-failover.md)
et le serveur autonome à
[`docs/ha-failover-validation.md`](https://github.com/durable-workflow/server/blob/main/docs/ha-failover-validation.md).
Cette section en est l'interface publique.

### État des preuves de publication {#release-evidence-status}

Aucun résultat réussi pour la version exacte du serveur public documenté n'est
lié. La tentative sur image publiée s'est arrêtée pendant `topology_start`, en
attendant la disponibilité API, avant toute preuve de matrice de pannes ou de
borne de reprise. La présence du lanceur, son manifeste de scénarios ou une
répétition propre à un déploiement ne prouvent pas que l'image publiée a réussi
toute la matrice. La HA monorégion reste donc accompagnée.

La qualification autonome n'est autorisée qu'après une exécution sans sources
produit locales utilisant la version Server documentée exacte pour l'image,
le lanceur et Compose, et publiant `single-region-failover-result.json` avec
`outcome: "pass"`, `runner_blocked: false`, chaque entrée `phase_outcomes` à
`status: "pass"`, toutes les bornes de reprise validées et des preuves pour
chaque scénario du [manifeste public de basculement monorégion](/platform-conformance/single-region-failover-scenarios.json).
Ce résultat public réussi doit être lié ici et nommer la même image que
`%%artifact.serverDockerHubImage%%`. Jusque-là, les bornes suivantes sont des
cibles d'évaluation, pas des déclarations de validation de l'image publiée.

### Topologie candidate {#candidate-topology}

Le contrat visé s'applique au petit cluster ou aux manifestes bruts si l'opérateur
préserve trois règles :

- **Toujours un seul point de base de workflows accessible en écriture.** Le
  basculement géré (RDS Multi-AZ, Aurora, Cloud SQL HA, Patroni, etc.) est permis
  si l'ancien primaire est isolé avant rattachement : révoquer l'utilisateur
  d'écriture, rétrograder avec `read_only=on`, couper la réplication ou restaurer
  un instantané sain. Un proxy doit préserver la sémantique de base utilisée
  par le Server et être qualifié pour sa version exacte, son mode et ses
  réglages. Voir les [budgets de connexions SQL](#sql-connection-budgets) pour
  les versions requises et les modes testés du pool transactionnel PgBouncer.
- **Un point Redis à la fois et une promotion documentée.** Le basculement
  Redis géré (Sentinel, Elasticache, Memorystore HA, etc.) est permis. Redis
  accélère l'exécution sans porter l'exactitude : son basculement affecte la
  latence, jamais l'exactitude.
- **Toujours un seul ordonnanceur/processus de maintenance.** L'orchestrateur,
  service Compose avec `deploy.replicas: 1`, unité systemd protégée par bail
  hôte, ou `Deployment` Kubernetes avec `replicas: 1` et
  `RollingUpdate.maxSurge: 0`, préserve cette unicité pendant le redémarrage.
  Des ordonnanceurs en double en régime établi sont hors contrat.

### Comportements et cibles de reprise par événement {#per-event-behavior-and-recovery-targets}

Le contrat moteur visé définit une reprise bornée par classe d'événement. Ce
ne sont pas des garanties d'image publiée tant que la condition de preuves
reste fermée. Le temps réel observé est la cible moteur plus la latence de
promotion du service géré.

| Événement | Comportement moteur candidat | Cible après retour du socle ou du processus |
| --- | --- | --- |
| Basculement de base gérée | Écritures en erreur, sans tampon silencieux. Lectures en erreur. `/api/ready` échoue sur tous les nœuds API et l'ordonnanceur. Aucun travail acquitté perdu. | Reconnexion du pool, plus un cycle `task_repair` (3 s par défaut), plus un délai d'interrogation longue (30 s par défaut, 60 s maximum) pour les pollers en cours. |
| Basculement Redis géré | Réveils perdus → découverte au délai d'interrogation longue. Contrôles d'accélération en **warning**, pas en erreur. `/api/ready` reste généralement sain. | Intervalle de reconnexion du client Redis. |
| Perte d'un nœud API parmi N | Le répartiteur le retire dans son intervalle de disponibilité. Ses requêtes en cours échouent au répartiteur et le client réessaie. | Intervalle de disponibilité contrôlé par l'opérateur, généralement 5 à 10 s. |
| Perte d'un worker | Ses tâches attendent l'expiration du bail. Les autres workers continuent leurs tâches. | Expiration du bail (5 min pour les activités), plus un cycle `task_repair`. |
| Redémarrage ordonnanceur/maintenance | Déclenchements, application des délais d'activité et purge d'historique s'interrompent et reprennent au premier passage après redémarrage. Pas de doublon de déclenchement grâce à l'unicité. | Latence de redémarrage de l'orchestrateur, plus un passage d'ordonnanceur. |

### Répartiteur, disponibilité et transfert du trafic {#load-balancer-readiness-and-traffic-shift-rules}

Le répartiteur devant les nœuds API est le point de décision unique d'admission
pendant un basculement :

- Utilisez **`GET /api/ready`**, au-delà de `/api/health`. Ce dernier prouve
  seulement HTTP. `/api/ready` indique la connectivité et les contrôles de
  disponibilité configurés, dont l'accélération Redis saine ou dégradée.
  Il ne teste pas toutes les opérations SQL des workflows ni la capacité
  d'écriture. Pendant une panne de base, il échoue
  correctement partout. Le répartiteur DOIT accepter cet état sans retomber
  sur une ancienne liste de nœuds supposés sains.
- Utilisez un intervalle de 5 à 10 secondes et un seuil de retrait de 2 à 3
  échecs consécutifs.
- N'imposez pas de sessions persistantes : le test rapide de petit cluster
  prouve qu'un worker peut interroger `server-a` et terminer sur `server-b`.
- Pendant une panne Redis seule, les nœuds restent prêts si les parcours durables
  en base sont disponibles. La dégradation apparaît sous
  `checks.cache.status=warning` avec
  `checks.cache.degraded_capability=long_poll_wake_acceleration`. Ne retirez
  pas les nœuds du trafic pour cet avertissement.

Après reprise du socle, attendez `200` sur `/api/ready` d'au moins un nœud,
interrogez `/api/cluster/info` via le répartiteur avec un jeton admin pour
confirmer la topologie, enregistrez un worker de sonde par
`POST /api/worker/register` via l'adresse répartie, confirmez exactement un
ordonnanceur vivant dans l'orchestrateur, puis reprenez le trafic externe.

### Répéter avec les artefacts exacts {#run-the-exact-artifact-rehearsal}

La publication serveur inclut une répétition de référence réutilisable pour
la matrice complète sans compiler le produit depuis un checkout. Lanceur et
Compose doivent venir du même tag que l'image. N'associez pas une branche
par défaut mouvante à une image arbitraire. Sur un hôte propre avec Docker
Engine, Docker Compose v2, Python 3.11 ou ultérieur et accès aux registres publics :

<!-- docs-example id="single-region-failover-exact-release" -->
```bash
export DW_SERVER_RELEASE=%%artifact.serverVersion%%
git clone --depth 1 --single-branch --branch "$DW_SERVER_RELEASE" \
  https://github.com/durable-workflow/server.git "server-$DW_SERVER_RELEASE"
cd "server-$DW_SERVER_RELEASE"
export DW_SERVER_IMAGE="durableworkflow/server:$DW_SERVER_RELEASE"
scripts/conformance/single-region-failover-published-artifacts.sh \
  --result-dir ./failover-result
```

Ce parcours dérive volontairement checkout et `DW_SERVER_IMAGE` d'une seule
variable de publication. Ne surchargez pas l'image séparément. Changez
`DW_SERVER_RELEASE` avant clonage pour choisir une autre version. Le lanceur
exige un tag ou une empreinte Server publics concrets, télécharge toutes les
images de soutien, résout leurs empreintes de dépôt et rejette sections Compose
de compilation, montages de sources produit et références locales ou mouvantes.
Il lance exactement deux nœuds API derrière nginx, une base MySQL, Redis et
un seul ordonnanceur/maintenance.

Le fichier `single-region-failover-result.json` utilise le schéma
`durable-workflow.v2.single-region-failover.result`. Il consigne versions exactes
d'artefacts et d'outils, topologie normalisée, transitions de disponibilité,
temps mesurés et verdicts de bornes, identités workflow/exécution/tâche/planification,
et assertions de doublon/perte pour achèvement entre nœuds, perte API,
interruption de base, interruption Redis, perte de bail worker et redémarrage
d'ordonnanceur unique. Les lanceurs externes découvrent invocation et manifeste
public via `GET /api/cluster/info` à `single_region_failover_contract`.

Un résultat ne valide interruption et reprise visibles du moteur sur l'image
publiée qu'après réussite de la condition de preuves. Un échec, résultat partiel
ou blocage du lanceur est diagnostique. Même une référence réussie ne transforme
pas le redémarrage d'un conteneur local MySQL ou Redis en preuve du mécanisme
de promotion d'un fournisseur Cloud. Gardez les preuves natives de promotion,
d'isolement, de RPO et de durée avec ce résultat avant de revendiquer la HA gérée.

### Compléments au dossier de reprise {#recovery-packet-additions}

Un petit cluster ou déploiement à manifestes bruts revendiquant ce contrat DOIT
étendre son dossier selon le
[périmètre d'exploitation opérateur](/docs/operator-operating-envelope), avec
preuves de répétition pour chaque classe :

- basculement de base gérée sans perte d'écriture acquittée et dans la borne ci-dessus
- basculement Redis sans oscillation de rotation du répartiteur, sans perte de
  travail acquitté, signalant `checks.cache.status=warning` et la capacité
  dégradée `long_poll_wake_acceleration`
- perte API absorbée dans l'intervalle configuré, sans perte d'écriture acquittée
- perte worker préservant l'exécution jusqu'à expiration du bail, la reprenant
  dans la borne de réparation et la terminant exactement une fois
- redémarrage d'ordonnanceur sur un autre hôte sans déclenchement en double ni
  planification non évaluée au-delà de `next_fire_at` plus un passage

Tant que la condition de preuves reste fermée, chaque déploiement reste
accompagné même si sa répétition réussit. Après un résultat public réussi à
toutes les phases, un déploiement ne devient autonome qu'après consignation
de ses propres preuves dans le dossier de reprise et leur renouvellement à la
cadence du périmètre d'exploitation opérateur.

### Limite des revendications HA {#boundary-against-unsupported-ha-claims}

Le contrat monorégion est volontairement limité. Ces éléments restent **hors
contrat** et nécessitent une conception accompagnée, car la topologie fait
partie du risque produit :

- bases multirédacteurs actif/actif
- multirégion actif/passif et basculement régional automatique ou sans
  intervention en auto-hébergement (évaluation dans la
  [section suivante](#activepassive-multi-region))
- réplication synchrone interrégion (RPO=0)
- ordonnanceurs/maintenance en double en régime établi
- files fixées par le moteur à une région comme axe de routage
- validation Kubernetes géré propre au fournisseur au-delà du packaging du chart
- promesses SLA générales « cinq neuf » ou « sans interruption » au-delà des
  bornes de reprise ci-dessus

Le contrat porte sur une *reprise bornée lors d'événements nommés*. Une promesse
de disponibilité dépend de la base, du réseau et de l'orchestrateur de
l'opérateur. Le marketing ou les SLA auto-hébergés NE DOIVENT PAS franchir cette
limite sans validation dédiée.

## Multirégion actif/passif {#activepassive-multi-region}

Le multirégion actif/passif est un **guide d'évaluation accompagné**, pas un
contrat autonome éprouvé du périmètre 2.0 pris en charge. Utilisez-le pour
examiner une architecture candidate et préparer une répétition avec l'assistance
avant d'en dépendre en production. Chaque région part d'un parcours documenté
mononœud, petit cluster ou Kubernetes brut. Ces contrats monorégion n'établissent
pas réplication interrégion, basculement, retour, RPO, RTO ni prévention du
double primaire. La conception détaillée (autorité des données, réplication,
espaces de noms/files/workers, basculement et retour, isolement et compromis
cohérence/latence) se trouve dans la bibliothèque à
[`docs/deployment/multi-region.md`](https://github.com/durable-workflow/workflow/blob/main/docs/deployment/multi-region.md)
et le serveur à
[`docs/multi-region-validation.md`](https://github.com/durable-workflow/server/blob/main/docs/multi-region-validation.md).

Topologie candidate à évaluer :

- Une **région active** avec le contrat mononœud ou petit cluster validé : API
  derrière répartiteur, MySQL ou PostgreSQL externe partagé accessible en
  écriture, Redis partagé, exactement un ordonnanceur/maintenance et workers externes.
- Une **région de secours** avec réplique asynchrone de la base, Redis de secours
  facultatif, aucun ordonnanceur/maintenance et éventuellement des conteneurs
  API/workers préprovisionnés mais inactifs jusqu'à la promotion.
- Un **basculement régional** explicitement opéré : arrêter les écritures dans
  la région défaillante, confirmer la réplication contre le RPO publié,
  promouvoir la base de secours, appliquer les migrations exigées sur le nouveau
  primaire, lancer l'ordonnanceur unique dans la nouvelle région active,
  changer les adresses workers et le trafic externe et reconstruire les
  projections dérivées. Aucun basculement interrégion automatique.
- Un **retour à la région initiale** suivant la séquence inverse quand elle
  revient, avec ancien primaire isolé avant rattachement en secours : révocation
  d'écriture, `read_only=on`, coupure de réplication ou restauration d'un instantané sain.

Autorité des données et hypothèses de réplication :

- La base de workflows est l'unique source durable, liée à une région. Une seule
  région y écrit à un instant donné. Le secours est une réplique en lecture
  jusqu'à promotion. Le RPO correspond au retard de réplication asynchrone,
  le RTO au temps d'exécution de la procédure opérateur.
- Redis est une accélération locale à la région. Réveils, verrous de requêtes
  de lecture et d'admission ne traversent pas les régions. Chaque région a son
  Redis. Son cache de secours peut être froid ou chaud selon l'opérateur.
  L'exactitude ne dépend pas de sa préservation au basculement.
- La visibilité vient de la base de la région active. Promouvez avant de lire.

Espaces de noms, files et enregistrement des workers :

- Espaces et files sont en base et survivent tels qu'au dernier commit répliqué.
  Le moteur ne les partitionne pas régionalement.
- Les workers de la nouvelle région s'enregistrent sur son API après promotion.
  Les anciens enregistrements restent en base et expirent normalement.
- Déploiements par build-id et états de cycle de vie survivent car ils sont en base.

Compromis de cohérence et latence en régime établi :

- Démarrages, signaux et mises à jour valident dans la base active avec sa
  latence de commit et sont refusés pendant le retrait d'autorité au basculement.
- Distribution des tâches workflow et activité selon l'accélération monorégion :
  moins d'une seconde avec Redis sain, sinon cadence d'interrogation durable.
- Les planifications viennent de l'ordonnanceur unique actif et s'interrompent
  sans lui. Elles reprennent depuis les lignes durables après promotion.
- La lecture après écriture n'est garantie que dans la région active. Le moteur
  ne fournit pas de lecture de ses propres écritures interrégion ni RPO=0.

La limite de reprise après sinistre est explicite : cette conception ne remplace
ni sauvegardes ni preuves. Le dossier du
[périmètre d'exploitation opérateur](/docs/operator-operating-envelope) reste
obligatoire, avec en plus SLO de retard de réplication, durée de promotion,
date de dernière répétition réussie et procédure d'isolement du primaire récupéré.

En auto-hébergement, multirégion actif/passif ou actif/actif, basculement régional
automatique, réplication synchrone interrégion (RPO=0), visibilité active
interrégion et files régionales imposées par le moteur restent
[accompagnés](/docs/support), car la topologie participe au risque produit. Le
[contrat Cloud actuel](/docs/polyglot/cloud-control-plane) est monorégion et ne
fournit pas ces garanties multirégion.

## Contrat de disponibilité {#readiness-contract}

Utilisez santé et disponibilité ensemble :

- `GET /api/health` prouve que le processus sert HTTP.
- `GET /api/ready` rapporte les contrôles de dépendances configurés, dont la
  connectivité, les migrations et la disponibilité de l'espace de noms par
  défaut. Il ne prouve ni chaque opération SQL de workflow ni la capacité
  d'écriture disponible.
- `GET /api/cluster/info` prouve qu'un client authentifié découvre identité du
  build, protocoles du plan de contrôle et worker, codecs et capacités serveur.
- `POST /api/worker/register` prouve l'authentification worker dans l'espace de
  noms et la file attendus.

Ne transférez pas le trafic sur la seule base de `/api/health`.
