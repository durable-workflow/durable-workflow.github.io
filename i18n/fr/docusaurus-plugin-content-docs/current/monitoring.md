---
sidebar_position: 12
tags:
  - observability
  - operations
  - Waterline
keywords:
  - Waterline
  - supervision des workflows
  - historique durable
  - télémétrie du runtime
  - actions possibles Waterline
  - preuves uniquement diagnostiques
  - état de réparation
---

# Supervision {#monitoring}

[Waterline](https://github.com/durable-workflow/waterline) est l'interface et
l'API opérateur pour l'état des workflows. Sa distribution suit la frontière du
runtime choisi : Cloud inclut Managed Waterline, tandis qu'en auto-hébergement,
l'opérateur déploie Waterline séparément s'il souhaite cette interface.

Waterline est un même produit opérateur avec trois modes d'utilisation :

- Le **mode embarqué** installe le paquet Composer dans l'application Laravel
  propriétaire des workflows et lit son état durable dans le même processus.
- Le **mode service auto-hébergé** utilise l'image publiée
  `durableworkflow/waterline` et lit l'état du
  [serveur autonome](./polyglot/server.md) via le SDK PHP et l'API publique
  serveur. La distribution Server n'inclut ni n'exploite Waterline.
- **Cloud Managed Waterline** est l'expérience opérateur limitée à un espace de
  noms incluse dans [Durable Workflow Cloud](./polyglot/cloud-control-plane.md).
  Cloud exploite Managed Waterline et le runtime de l'espace de noms associé.

Les interfaces embarquée et de service auto-hébergé exposent la même interface
principale Waterline et les mêmes familles de routes opérateur `/waterline/api/...`.
Cloud fournit ces capacités par son interface gérée, sans hôte Waterline à
déployer par le client. Aucune de ces interfaces ne fusionne les états des
runtimes : chaque vue se limite aux exécutions de son runtime et de son espace
de noms. Pour Server auto-hébergé, les interfaces opérateur natives API, CLI et
SDK restent disponibles avec ou sans Waterline. Consultez la
[référence API Server](./polyglot/server-api-reference.md) pour ces routes et la
[référence API opérateur Waterline](./waterline-operator-api.md) pour les routes
et contrats de réponse Waterline.

Durable Workflow a deux plans d'observabilité :

| Plan | Source de vérité | Questions habituelles |
| --- | --- | --- |
| État durable | Base de données et API du runtime propriétaire, projections Waterline et export d'historique | Le workflow a-t-il démarré ? Quelle exécution est courante ? Quel signal, mise à jour, temporisateur, activité, nouvelle tentative ou échec a été validé ? Quelle action opérateur est sûre maintenant ? |
| Télémétrie worker/runtime | Journaux des workers de file, enregistreurs de métriques SDK, points de terminaison Prometheus/OpenMetrics et traces applicatives | Les workers interrogent-ils les files ? Combien de temps prennent les tâches ? Un exportateur est-il configuré ? Les métriques personnalisées ont-elles quitté le processus worker ? |

Waterline ne remplace pas les métriques des workers. Si une métrique personnalisée
est enregistrée dans le code d'une activité ou d'un worker, collectez-la sur le
point de télémétrie du worker. Waterline permet de la corréler à l'historique
durable et à l'état courant de l'exécution.

La configuration des workers et clients reste distincte de l'interface opérateur.
Utilisez la [référence API du SDK PHP](https://php.durable-workflow.com/api/),
la [référence API du SDK Python](https://python.durable-workflow.com/) ou
la [référence API du SDK Rust](https://rust.durable-workflow.com/) générées en
complément des guides de langage pour connecter clients et workers au runtime
propriétaire de l'espace de noms.

Si la télémétrie montre des prises en charge répétées, des courses d'achèvement
tardif ou des baux bloqués, lisez aussi les
[garanties d'exécution et l'idempotence](./constraints/execution-guarantees.md).
Ce contrat distingue l'incertitude du transport au moins une fois des résultats
durables dupliqués, pour éviter les mauvaises conclusions face à des preuves
qui ressemblent à des doublons.

:::tip Corrélation des traces dans Laravel embarqué

Pour relier les logs de l'application à une exécution de workflow et à une
tentative d'activité, configurez l'[intégration facultative de traçage en mode embarqué (en anglais)](https://github.com/durable-workflow/workflow/blob/main/docs/embedded-tracing.md).
Elle conserve le contexte W3C entre les workers de file, les nouvelles tentatives
et la reprise, et utilise le fournisseur OpenTelemetry ainsi que les canaux de
logs Laravel de votre application. Le guide explique comment activer le traçage,
ajouter le tap de logs, exécuter les migrations du schéma et borner les exports.
Consultez le diagramme des spans et la matrice des capacités des runtimes et SDK
avant le déploiement.

:::

### Traçage en mode service {#service-mode-tracing}

Configurez le fournisseur, l'échantillonnage, les propagateurs et un export borné avant d'activer la télémétrie du SDK. Consultez le [guide PHP](https://php.durable-workflow.com/operate/tracing/), le [guide Python](https://python.durable-workflow.com/telemetry/) ou l'[API Rust](https://rust.durable-workflow.com/durable_workflow/telemetry/) (en anglais).

| Runtime | Limite de propagation |
| --- | --- |
| Laravel embarqué | L'intégration Core facultative conserve le contexte entre les workers de l'application. |
| Serveur PHP | Le [guide du serveur](https://github.com/durable-workflow/server/blob/2.10.0/docs/observability-context.md) exige une image applicative avec l'API facultative, l'option activée et le schéma nullable réel. |
| SDK PHP, Python et Rust | Spans de tâches/tentatives et corrélation des logs sur activation. La propagation durable exige la capacité exacte annoncée par le serveur. Une capacité absente ou mal formée produit des traces de tâches indépendantes. |
| Serveur Rust natif | Cette version PHP ne qualifie ni les carriers natifs ni la conversion du catalogue. |
| Cloud | Cette version ne déploie rien dans Cloud. Vérifiez le support du runtime géré. |

Les identifiants de trace, de run, d'activité, de tentative et de requête restent distincts. Le baggage utilise une liste autorisée, vide par défaut; les liens n'en contiennent pas. L'application possède les fournisseurs et exporteurs. Un arrêt brutal peut perdre la télémétrie; le replay ne garantit pas un export exactement une fois. L'historique durable fait foi pour les résultats métier.

### Vue du tableau de bord {#dashboard-view}

![Tableau de bord Waterline](https://raw.githubusercontent.com/durable-workflow/waterline/refs/heads/main/docs/screenshots/dashboard.png)

Le tableau de bord présente les totaux en cours, les compteurs d'exécutions
récentes et les métriques de l'ensemble des workers pour voir rapidement si
le travail progresse, stagne ou échoue.

Consultez le [périmètre d'exploitation opérateur](./operator-operating-envelope.md)
pour le contrat de déploiement et les procédures associés : diagnostics qui
bloquent le trafic ou restent indicatifs, répartition des faits de santé des
files entre Waterline et télémétrie worker, vérification de la reconstruction,
de l'export et de l'archivage.

### Vue du workflow {#workflow-view}

![Détail d'un workflow Waterline](https://raw.githubusercontent.com/durable-workflow/waterline/refs/heads/main/docs/screenshots/workflow-detail.png)

Le détail présente la chronologie durable d'une exécution : activités, signaux,
temporisateurs et workflows enfants dans l'ordre, avec leurs entrées, sorties
et temps d'exécution.

## Déploiement et accès à Waterline {#waterline-deployment-and-access}

### Laravel embarqué {#embedded-laravel}

Installez Waterline dans votre application Laravel avec le paquet Workflow et
exécutez ses migrations. Le guide complet d'installation et de configuration
se trouve dans [durable-workflow/waterline](https://github.com/durable-workflow/waterline).

Le mode embarqué utilise la connexion à la base, les middlewares de route, le
contrôle d'authentification et le paquet Workflow de l'application hôte.
Exploitez l'application Laravel, ses workers de file, l'ordonnanceur, les
migrations et les ressources Waterline comme une même unité de déploiement.
La [référence API opérateur Waterline](./waterline-operator-api.md#installation)
contient la commande Composer actuelle et la publication des ressources.

### Service Waterline {#waterline-service}

L'image publiée contient son propre runtime PHP et Laravel. Elle ne nécessite
ni PHP, ni Composer, ni paquet Workflow sur l'hôte du conteneur et ne se
connecte jamais à la base de données du serveur autonome.

Cet exemple lie Waterline à l'interface de boucle locale sur le port hôte `8080`,
persiste son état d'interface dans un volume nommé et le connecte à un espace
de noms serveur :

```bash
export WATERLINE_SERVER_ENDPOINT=https://workflow.example.com
export WATERLINE_SERVER_TOKEN=replace-with-a-server-token

docker run --detach \
  --name waterline \
  --restart unless-stopped \
  --publish 127.0.0.1:8080:8080 \
  --volume waterline-data:/data \
  --env WATERLINE_SERVER_ENDPOINT \
  --env WATERLINE_SERVER_TOKEN \
  --env WATERLINE_NAMESPACE=orders \
  --env WATERLINE_ACCESS_MODE=read_only \
  --env WATERLINE_ALLOW_UNAUTHENTICATED=true \
  --env APP_URL=https://waterline.example.com \
  durableworkflow/waterline:%%artifact.waterlineVersion%%
```

Ouvrez `/waterline` via l'URL représentée par `APP_URL`. L'image écoute sur le
port conteneur `8080`. Définissez `PORT` seulement pour changer délibérément ce
port interne. `WATERLINE_PATH` modifie le préfixe d'URL `waterline` par défaut.
Le dépôt publie aussi une
[définition de service Docker Compose](https://github.com/durable-workflow/waterline/blob/main/deploy/docker-compose.service.yml)
avec la même frontière de connexion.

Le mode service a deux couches d'authentification indépendantes :

1. `WATERLINE_SERVER_TOKEN` est le jeton porteur utilisé quand le SDK PHP appelle
   `WATERLINE_SERVER_ENDPOINT`. L'observation des workflows, workers, files et
   planifications nécessite un rôle opérateur serveur. La santé serveur et les
   métriques opérateur peuvent nécessiter un rôle administrateur.
2. L'accès navigateur et API Waterline constitue la frontière d'entrée du
   déploiement. L'image autonome n'a pas d'annuaire d'utilisateurs Laravel hôte.
   `WATERLINE_ALLOW_UNAUTHENTICATED=true` ne convient donc que derrière un proxy
   inverse authentifiant ou sur une interface privée, comme la boucle locale
   ci-dessus. Gardez `false` tant que cette frontière d'authentification externe
   n'est pas en place.

Définissez `WATERLINE_NAMESPACE` sur l'espace de noms à inspecter. Waterline
l'envoie à chaque requête SDK. La valeur par défaut
`WATERLINE_ACCESS_MODE=read_only` bloque les mutations dans Waterline. Utilisez
`operator` uniquement avec un jeton serveur autorisé pour les commandes requises.

Le volume `/data` contient les vues enregistrées, préférences d'affichage et
l'état Laravel appartenant à Waterline. Par défaut, il contient une base SQLite
sur fichier à `/data/waterline.sqlite`. Il ne contient jamais l'historique de
workflows du serveur. Utilisez `DATABASE_URL` ou les paramètres `DB_*` habituels
si l'état propre de Waterline doit être dans MySQL ou PostgreSQL.

#### Santé et métriques {#health-and-metrics}

Ces sondes répondent à des questions différentes :

| Interface | Ce qu'elle prouve |
| --- | --- |
| `GET /up` | Le processus HTTP Waterline a démarré et peut répondre. Le contrôle de santé Docker de l'image utilise cette route. |
| `GET /waterline/api/v2/health` | Waterline peut assembler via le SDK PHP les preuves de santé serveur, d'enregistrement des workers et des files, dans l'espace de noms. |
| `GET /waterline/api/stats` | Les totaux du tableau de bord et le résumé opérateur issus du serveur utilisés par Waterline. |
| `GET /api/system/health` et `GET /api/system/operator-metrics` sur le serveur | Les contrats natifs de santé et d'exploitation du serveur, indépendants de Waterline. |

Traitez `/waterline/api/stats` comme du JSON opérateur, pas comme un point de
collecte Prometheus. Métriques SDK, journaux, traces et télémétrie applicative
personnalisée viennent toujours des workers. Un `/up` sain avec une réponse
Waterline de santé ou statistiques indisponible indique un problème de
connexion serveur, d'autorisation, d'espace de noms ou de capacité SDK plutôt
qu'un processus Waterline défaillant.

#### Visibilité des workflows et actions opérateur {#workflow-visibility-and-operator-actions}

En mode service, listes, détail d'exécution, export d'historique, planifications,
état des workers, preuves des files, signaux, mises à jour, requêtes de lecture,
réparation, annulation, terminaison et archivage sont projetés depuis le serveur
autonome configuré via le SDK PHP. Les formes des routes restent celles de la
[référence API opérateur Waterline](./waterline-operator-api.md). Les contrats
serveur sous-jacents restent dans la
[référence API Server](./polyglot/server-api-reference.md).

Waterline n'affiche que l'espace de noms configuré et les exécutions du serveur
connecté. Les exécutions embarquées restent visibles dans leur Waterline
embarqué, et celles gérées par Server dans le service ou ses interfaces natives.
Changer le backend Waterline ne migre ni ne combine les exécutions.

#### Frontières de diagnostic {#troubleshooting-boundaries}

| Symptôme | Frontière à vérifier |
| --- | --- |
| Le conteneur quitte avant de servir `/up` | Vérifiez `WATERLINE_SERVER_ENDPOINT` obligatoire, les droits d'écriture sur `/data`, la validité de `PORT`, les paramètres de base et les journaux bornés de migration au démarrage. |
| Une vue issue du serveur renvoie `401` ou `403` | Vérifiez `WATERLINE_SERVER_TOKEN` et son rôle serveur. Un refus à l'entrée Waterline relève séparément du proxy ou de `WATERLINE_ALLOW_UNAUTHENTICATED`. |
| Une route de mutation renvoie `waterline_read_only` | Gardez la lecture seule ou définissez explicitement `WATERLINE_ACCESS_MODE=operator`. Le jeton serveur doit toujours autoriser la commande. |
| Des workflows attendus sont absents | Confirmez `WATERLINE_NAMESPACE`, l'adresse serveur et le runtime qui a accepté le démarrage. Waterline ne recherche pas dans d'autres espaces de noms ou runtimes embarqués. |
| `/up` réussit mais la santé, les statistiques ou une vue signale une capacité indisponible | Vérifiez directement le serveur avec son API ou sa CLI, puis les rôles du jeton et la méthode requise dans le tuple publié Waterline/SDK PHP. |
| Une route de catalogue de services signale `backend_capability_unavailable` | Le mode service ne reproduit pas le catalogue de services interespaces de noms embarqué de Waterline. Utilisez les routes et l'API natives du serveur connecté pour cette capacité. |
| Une métrique personnalisée manque dans Waterline | Inspectez l'exportateur du worker. Waterline expose les faits durables d'exploitation, pas les métriques arbitraires des processus. |

### Cloud Managed Waterline {#cloud-managed-waterline}

Les clients Cloud ouvrent Cloud Managed Waterline depuis l'interface opérateur
gérée de leur espace de noms. Ils ne déploient ni ne configurent Waterline,
Server, PHP ou des adresses internes et ne gèrent pas un second compte Waterline.
Les instructions précédentes sur l'image auto-hébergée, les paramètres
`WATERLINE_*`, le jeton Server, la base et l'authentification d'entrée ne
s'appliquent pas à ce parcours.

L'authentification Cloud du client établit l'identité opérateur. Les autorisations
de l'organisation, du projet, de l'environnement et de l'espace de noms Cloud
déterminent le périmètre Managed Waterline accessible. Dans ce périmètre, les
opérateurs disposent des listes et recherches, du détail et de l'historique
durable, de la santé et des actions permises à leur rôle. L'interface reste
limitée à l'espace de noms choisi, sans fusion de données d'autres environnements
ou espaces de noms.

Les mutations sont contrôlées par rôle. Cloud attribue chaque mutation opérateur
prise en charge à l'acteur Cloud authentifié dans ses données d'audit. La
transition durable qui en résulte reste visible dans l'historique du workflow.
Par exemple, un archivage réussi est attribué dans l'audit Cloud et enregistre
l'événement durable `WorkflowArchived`. Les opérateurs n'ont jamais besoin d'un
identifiant privé du runtime ni de connaître son déploiement interne pour
utiliser cette interface.

## API de liste et de détail {#list-and-detail-api}

Les listes Waterline (`/waterline/api/flows/{bucket}`) et le détail d'exécution
(`/waterline/api/flows/{id}`) renvoient des contrats JSON typés, consommables
directement par vos tableaux de bord ou scripts. La
[référence API opérateur Waterline](./waterline-operator-api.md) documente les
routes, les familles de champs de détail, l'export d'historique, les actions
possibles, les planifications, les vues enregistrées, les préférences et le
contrat des actions opérateur.

### Contrat des actions possibles {#actionability-contract}

Waterline annote les lignes de liste, les réponses de détail et les exports
d'historique avec un contrat versionné des actions possibles. Les consommateurs
doivent utiliser `actionability_contract.schema = waterline.actionability` et
`actionability_contract.version = 1` pour identifier le contrat des champs suivants.

Le bloc `actionability` d'exécution indique si l'exécution choisie peut être réparée :

| Champ | Signification |
| --- | --- |
| `repair_state` | `repairable`, `blocked`, `not_needed` ou `unknown`. |
| `repairable` | Raccourci booléen pour `repair_state = repairable`. |
| `blocked_reason` | Code de raison stable si `repair_state = blocked`. |
| `status_bucket` | Catégorie Waterline qui a déterminé la décision pour l'exécution. |
| `closed_reason` | Raison durable de fermeture si l'exécution est fermée. |
| `task_problem` | Indique si Waterline a vu un problème de tâche sur l'exécution. |
| `diagnostic_only_evidence` | Vrai si au moins une ligne de preuve enfant est informative sans être une source de reprise. |

Les preuves sous `activities`, `waits`, `timers`, `exceptions`, `logs` et les
entrées de chronologie ou d'export peuvent aussi inclure leur bloc `actionability` :

| Champ | Signification |
| --- | --- |
| `state` | `actionable` si la ligne est une source de réparation valide, sinon `diagnostic_only`. |
| `repair_source` | Vrai uniquement pour les lignes appuyées par une source de référence réparable. |
| `diagnostic_only` | Vrai si la ligne ne doit pas servir de source de reprise. |
| `history_authority` | Référence source telle que `typed_history`, `mutable_open_fallback`, `failure_row_fallback` ou `unsupported_terminal_without_history`. |
| `history_unsupported_reason` | Code de raison stable pour un historique de repli non pris en charge. |

L'automatisation doit conditionner réparation, reprise et relecture à
`actionability.repair_state`, `actionability.repairable` et
`actionability.repair_source` sur chaque ligne. Une ligne avec
`diagnostic_only = true` n'est jamais une source de reprise durable, même si
elle contient des métadonnées d'échec ou de repli utiles. Les lignes avec
`history_authority = unsupported_terminal_without_history` ne servent qu'au
diagnostic : elles expliquent le blocage sans prouver un historique typé
suffisant pour reconstruire la progression sans risque.

## Actions du plan de contrôle depuis Waterline {#control-plane-actions-from-waterline}

Les opérateurs peuvent annuler, terminer, réparer et archiver depuis le détail.
Chaque action correspond à un `POST` sur le même identifiant d'exécution et
renvoie `200` avec le nouvel état, ou `409` si l'état courant ne permet pas l'action.

En mode service, Waterline transmet les commandes prises en charge via le SDK
PHP. Les mutations nécessitent à la fois `WATERLINE_ACCESS_MODE=operator` et un
identifiant serveur autorisé pour la commande. L'API serveur et la CLI restent
utilisables directement sans Waterline.

Dans Cloud Managed Waterline, chaque mutation prise en charge est contrôlée par
le rôle Cloud et l'autorisation d'espace de noms. L'identité Cloud authentifiée
fournit son attribution d'audit. Les clients ne configurent pas d'identifiant
Waterline-vers-Server pour cette interface gérée.

## Guides associés {#related-guides}

- Les [garanties d'exécution et l'idempotence](./constraints/execution-guarantees.md)
  expliquent le contrat de relecture, de nouvelles tentatives, d'expiration des
  baux et de résultats durables qui détermine les preuves opérateur.
- Le [périmètre d'exploitation opérateur](./operator-operating-envelope.md)
  relie santé, état des files, reconstruction, export, archivage et topologie
  dans un même contrat opérateur.
- Les [échecs et la reprise](./failures-and-recovery.md) expliquent l'épuisement
  des tentatives, les échecs permanents, les délais et la réparation derrière
  les faits du tableau de bord.
- Le [développement assisté par IA](./ai-assisted-development.md) identifie les
  contrats Waterline, CLI, MCP et lisibles par les LLM à utiliser pour diagnostiquer
  l'état d'un workflow.
