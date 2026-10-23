---
sidebar_position: 4
title: Référence des commandes CLI
description: Référence des commandes de la CLI Durable Workflow, des modes de sortie stables, options communes et comportements d'échec.
tags:
  - CLI
  - reference
  - control-plane
  - automation
keywords:
  - référence des commandes dw
  - sortie CLI
  - passerelle webhook
  - commande de workflow
---

# Référence des commandes CLI {#cli-command-reference}

Cette page documente les commandes v2 de `dw` comme un contrat destiné aux
opérateurs et à l'automatisation. Utilisez le [guide CLI](/docs/polyglot/cli)
pour l'installation et les profils, et cette page pour relier scripts, tâches
CI, procédures d'exploitation ou agents IA à la forme exacte des commandes.

Toutes les commandes adossées au serveur ciblent la version `2` du protocole
du plan de contrôle du serveur autonome. La CLI valide les manifestes de
protocole publiés par le serveur avant de se fier aux champs canoniques des
requêtes et réponses.

## Options globales {#global-options}

Les commandes adossées au serveur acceptent ces options sauf indication contraire.

| Option | Signification |
| --- | --- |
| `--server`, `-s` | URL de base du serveur. Remplace les profils et variables d'environnement pour cette invocation. |
| `--namespace` | Espace de noms cible. Remplace celui du profil. |
| `--token` | Jeton Bearer pour cette invocation. Préférez les profils avec `--token-env` pour l'automatisation enregistrée. |
| `--env` | Profil d'environnement CLI nommé. Un nom inconnu provoque un échec sans repli. |
| `--output=table\|json\|jsonl` | Contrat de sortie. `table` est lisible par un humain, `json` est un document JSON unique et `jsonl` un objet JSON par ligne pour les commandes de listage. |
| `--json` | Alias local de sortie JSON pour les commandes qui l'exposent. |

Les commandes acceptant des charges utiles de l'appelant partagent un contrat d'entrée :

| Option | Signification |
| --- | --- |
| `--input`, `-i` | Document d'entrée en ligne. |
| `--input-file` | Lire l'entrée depuis un fichier, ou `-` pour stdin. Incompatible avec `--input`. |
| `--input-encoding=json\|raw\|base64` | Décoder l'entrée en JSON, transmettre du texte brut comme un argument ou décoder base64 comme un argument. `json` par défaut. |

L'entrée JSON des démarrages de workflows, signaux, requêtes de lecture, mises
à jour, planifications et finalisations d'activités représente le tableau
d'arguments positionnels v2. Les entrées raw et base64 deviennent un seul
argument positionnel pour que le serveur reçoive toujours le tableau `input` canonique.

## Connexion et diagnostics {#connection-and-diagnostics}

| Commande | Rôle | Options importantes |
| --- | --- | --- |
| `dw --version` | Afficher l'identité du build CLI. Quand `DW_ENV` ou `DURABLE_WORKFLOW_SERVER_URL` sélectionne une cible, effectuer aussi une courte sonde de compatibilité. | `-V`, `--version` |
| `dw server:health` | Vérifier la santé du serveur et l'accessibilité de l'authentification. | options globales, `--json` |
| `dw server:info` | Afficher la version du serveur, les manifestes de topologie des rôles et de protocole, le contrat de requête, le protocole worker, les informations de flotte et les métadonnées de compatibilité. | options globales, `--json` |
| `dw doctor` | Expliquer l'état résolu profil/serveur/jeton/TLS, les avertissements de compatibilité distante et les étapes suivantes. | options globales, `--json` |
| `dw debug workflow <workflow-id>` | Capturer les diagnostics d'une exécution bloquée : état, tâches en attente, informations de file, échecs et métadonnées de compatibilité. | `--run-id`, options globales, `--json` |
| `dw server:start-dev` | Servir l'application HTTP d'un projet Laravel existant et configuré. Nécessite un PHP externe. | `--port`, `--host` (`127.0.0.1` par défaut), `--db=sqlite\|mysql\|pgsql` |
| `dw watch workflow <workflow-id>` | Interroger un workflow jusqu'à un état terminal ou à la limite d'interrogations configurée. | `--run-id`, `--interval`, `--max-polls`, options globales |
| `dw upgrade` | Remplacer le binaire autonome `dw` en cours par une version plus récente ou épinglée. Refuse de réécrire les installations Composer vendor, Homebrew cellar et PHAR. | `--tag`, `--dry-run`, `--force`, `--output=table\|json` |

Utilisez `server:info` pour valider la forme du contrat, `doctor` pour
expliquer pourquoi une CLI ne peut pas joindre un serveur et `debug workflow`
quand le support nécessite une capture d'exécution lisible par machine.

### Serveur HTTP du projet local {#local-project-http-server}

Exécutez `dw server:start-dev` depuis le répertoire d'un projet Laravel
installé contenant `artisan`. Pour cette commande, la CLI native nécessite
un exécutable PHP distinct dans `PATH`. Configurez d'abord la base et lancez
les migrations. La valeur `--db` sélectionnée est transmise comme
`DB_CONNECTION` ; videz donc le cache de configuration Laravel en changeant
de pilote. Exécutez séparément workers de file et planificateur si nécessaire.
Redémarrez la commande après modification de `.env`. Le pilote sélectionné
reste appliqué aux requêtes HTTP grâce au mode Artisan `--no-reload`.

La commande utilise la boucle locale par défaut. Indiquez explicitement
`--host=0.0.0.0` pour écouter sur toutes les interfaces. Les modes MySQL et
PostgreSQL nécessitent des services Compose du projet nommés respectivement
`mysql` ou `pgsql`, ainsi que `redis`. L'échec d'un processus de dépendance ou
HTTP renvoie un code non nul. Les services Compose restent actifs à la fin du
processus HTTP.

Les binaires natifs POSIX transmettent SIGINT et SIGTERM à l'enfant actif et
attendent jusqu'à cinq secondes l'arrêt de son groupe de processus. Les
installations source et PHAR nécessitent les extensions PHP `pcntl` et `posix`
pour cette transmission. Windows utilise son comportement d'interruption de console.

Pour un Durable Workflow Server autonome utilisant les images publiées,
suivez le [démarrage rapide du mode service](/docs/quickstart).

### Informations serveur et topologie des rôles {#server-info-and-role-topology}

`dw server:info` est l'interface CLI de `GET /api/cluster/info`. En mode table,
elle comporte une section `Topology:` résumant le contrat de topologie des
rôles publié par le serveur pour le nœud répondant :

- `Supported Shapes` et `Current Shape` identifient les formes de déploiement
  valides et celle actuellement servie par ce nœud.
- `Current Process Class` et `Current Roles` nomment sa classe de processus
  et son groupe de rôles.
- `Matching Role`, `Matching Partitions` et `Matching Backpressure` exposent
  la forme du rôle d'appariement, la responsabilité du réveil, le mode de
  distribution et les primitives de partition déterminant la prise en charge
  du travail prêt.
- `Matching Discovery Limits` résume le contrat numérique figé du rôle
  d'appariement : `poll_batch_cap`, `availability_ceiling_seconds`,
  `wake_signal_ttl_seconds`, `workflow_task_lease_seconds` et
  `activity_task_lease_seconds`. Les opérateurs peuvent ainsi vérifier le
  déploiement sans rechercher dans les sources du paquet.
- `Current Write Boundaries` énumère les surfaces d'écriture durable
  actuellement détenues par les rôles de ce nœud.
- `Scaling Boundaries` et `Failure Domains` indiquent le facteur de charge ou
  le premier signal de panne attendu pour chaque rôle.

Utilisez `--output=json` si les scripts nécessitent le manifeste brut.
`topology.schema` et `topology.version` fixent sa révision contractuelle pour
détecter les dérives de forme ; `topology.execution_mode` indique le mode de
distribution du nœud répondant. Les champs machine stables résident sous
`topology`, dont `supported_shapes`, `current_shape`, `current_process_class`,
`current_roles`, `matching_role`, `role_catalog`, `authority_boundaries`,
`authority_surfaces`, `supported_topologies`, `scaling_boundaries` et
`failure_domains`. Le bloc `topology.matching_role` publie aussi
`partition_primitives` et `backpressure_model` pour vérifier sans analyser de
prose les axes de routage utilisés par le nœud pour découvrir les tâches
prêtes. `topology.matching_role.discovery_limits` expose le contrat numérique
figé : `poll_batch_cap`, `availability_ceiling_seconds`,
`wake_signal_ttl_seconds`, `workflow_task_lease_seconds` et
`activity_task_lease_seconds`. Les scripts peuvent ainsi fixer les valeurs du
rôle d'appariement du paquet workflow sans extraire une section destinée aux humains.

```bash
dw server:info --output=json \
  | jq '.topology | {current_shape, current_process_class, current_roles, matching_role, scaling_boundaries, failure_domains}'
```

Consultez la [topologie des rôles de Server](/docs/polyglot/server-role-topology)
pour la signification de ces champs.

### Informations serveur et santé de la coordination {#server-info-and-coordination-health}

`dw server:info` publie aussi le verdict de sûreté du déploiement sur tous les
espaces de noms, sans nécessiter d'interface de santé distincte. En mode table,
la CLI affiche une section `Coordination Health:` sous `Topology:`. Avec
`--output=json`, les mêmes données résident sous `coordination_health`, avec
ces champs machine stables :

- `coordination_health.schema` et `coordination_health.version` fixent la
  révision contractuelle du manifeste.
- `coordination_health.namespace_scope` indique si le verdict couvre un espace
  de noms ou toute la flotte.
- `coordination_health.status` et `coordination_health.http_status` indiquent
  le verdict global et le contrôle HTTP appliqué à la disponibilité.
- `coordination_health.generated_at` enregistre l'instant de l'instantané.
- `coordination_health.categories` résume les nombres par catégorie (comme
  `correctness`, `safety`, `routing`).
- `coordination_health.warning_checks` et `coordination_health.error_checks`
  énumèrent les contrôles ayant fait passer le verdict à avertissement ou
  erreur, pour adapter les scripts aux interfaces défaillantes.
- `coordination_health.checks[]` est le tableau des détails par contrôle.
  Chaque entrée fixe `name`, `status`, `category` et `message`, utilisables
  pour expliquer un verdict dégradé. L'inventaire figé inclut toujours
  `worker_compatibility`, `task_transport`, `routing_health`,
  `durable_resume_paths`, les contrôles de projection/planificateur et
  `activity_path`. Ce dernier est l'équivalent côté activité de
  `task_transport` : il expose les exécutions d'activités dont le délai
  schedule-to-start, start-to-close, schedule-to-close ou de heartbeat a été
  dépassé sans application de la limite, ainsi que le retard persistant de
  nouvelles tentatives d'activité. Renommer `activity_path` change le protocole.

```bash
dw server:info --output=json \
  | jq '.coordination_health | {status, http_status, namespace_scope, warning_checks, error_checks}'
```

Consultez la [référence de l'API Server](/docs/polyglot/server-api-reference)
pour le contrat de disponibilité sous-jacent.

### Mise à jour de la CLI {#self-upgrade}

`dw upgrade` télécharge l'artefact de la plateforme depuis la version GitHub
`durable-workflow/cli`, le vérifie avec son `SHA256SUMS` et remplace le binaire
en cours uniquement si la somme correspond. Utilisez `--tag` pour épingler une
étiquette précise, `--dry-run` pour résoudre la version cible et afficher les
URL des artefacts sans téléchargement, et `--force` pour retélécharger et
remplacer même si les versions actuelle et cible correspondent.

La commande refuse de réécrire les installations gérées par un autre outil.
La sortie JSON fournit un champ `status` stable pour automatiser sans analyser
de prose :

| `status` | Signification |
| --- | --- |
| `upgraded` | Binaire remplacé par `target_version`. |
| `noop` | `current_version` correspond déjà à `target_version` ; `--force` contourne ce cas. |
| `dry-run` | `--dry-run` a résolu `target_version`, `asset_url` et `checksum_url` sans téléchargement. |
| `refused` | L'installation n'est pas un binaire de version autonome (Composer vendor, Homebrew cellar ou PHAR), ou la plateforme n'a pas d'artefact publié. |
| `permission-denied` | Le répertoire d'installation n'est pas accessible en écriture ; la charge utile inclut un `hint` proposant la prochaine étape. |
| `error` | Échec de récupération du catalogue des versions, somme de contrôle différente ou erreur du système de fichiers. |

En cas de refus, `installation.kind` identifie l'outil responsable
(`composer-vendor`, `homebrew`, `phar` ou `binary`) et `reason` nomme celui à
utiliser. Pour une automatisation publique sans sources, réinstallez une
version épinglée via `https://durable-workflow.com/install.sh` ; pour Homebrew
géré par le tap, utilisez `brew upgrade durable-workflow/tap/dw`.

## Profils d'environnement {#environment-profiles}

Les profils résident dans `~/.config/dw/config.json`, ou dans
`$XDG_CONFIG_HOME/dw/config.json` si cette variable est définie. Définissez
`DW_CONFIG_HOME` pour isoler un répertoire de profils de test ou de CI.

| Commande | Rôle | Options importantes |
| --- | --- | --- |
| `dw env:set <name>` | Créer ou mettre à jour un profil nommé. | `--server`, `--namespace`, `--token-env`, `--token`, `--tls-verify=true\|false`, `--profile-output=table\|json\|jsonl`, `--make-default`, `--json` |
| `dw env:list` | Lister les profils avec les jetons littéraux expurgés par défaut. | `--show-token`, `--json`, `--output=jsonl` |
| `dw env:show [name]` | Afficher un profil, le profil actuel par défaut. | `--show-token`, `--json` |
| `dw env:use <name>` | Définir le profil par défaut. Un nom inconnu provoque un échec. | `--json` |
| `dw env:delete <name>` | Supprimer un profil. | `--json` |

Préférez `--token-env=NAME` en production pour conserver les secrets dans
l'environnement du runtime plutôt que dans le fichier de profil.

## Commandes de workflow {#workflow-commands}

| Commande | Rôle | Options importantes |
| --- | --- | --- |
| `dw workflow:start` | Démarrer un workflow via le plan de contrôle. | `--type`, `--workflow-id`, `--business-key`, `--task-queue`, `--duplicate-policy`, `--memo`, `--search-attr key=value`, `--execution-timeout`, `--run-timeout`, `--wait`, options d'entrée, `--json` |
| `dw workflow:list` | Lister les instances de workflow. | `--type`, `--status`, `--query`, `--limit`, options globales de sortie |
| `dw workflow:describe <workflow-id>` | Décrire l'exécution actuelle ou sélectionnée. | `--run-id`, `--follow`, `--json` |
| `dw workflow:list-runs <workflow-id>` | Lister les exécutions d'une instance de workflow. | `--json` |
| `dw workflow:show-run <workflow-id> <run-id>` | Afficher une exécution. | `--follow`, `--json` |
| `dw workflow:history <workflow-id> <run-id>` | Lire les événements de l'historique d'une exécution. | `--follow`, `--page-size`, `--json` |
| `dw workflow:history-export <workflow-id> <run-id>` | Exporter la charge utile d'archivage de l'historique d'exécution. | `--output-file`, options globales |
| `dw workflow:signal <workflow-id> <signal-name>` | Envoyer un signal. | `--run-id`, options d'entrée, `--json` |
| `dw workflow:query <workflow-id> <query-name>` | Exécuter une requête de lecture de workflow. | `--run-id`, options d'entrée, `--json` |
| `dw workflow:update <workflow-id> <update-name>` | Soumettre ou exécuter une mise à jour de workflow. | `--wait=accepted\|completed`, `--run-id`, options d'entrée, `--json` |
| `dw workflow:cancel [workflow-id]` | Fermer un workflow ou un lot sélectionné comme annulé ; aucun nettoyage du code de workflow n'est exécuté. | `--reason`, `--run-id`, `--all-matching`, `--type`, `--status`, `--limit`, `--yes`, `--json` |
| `dw workflow:terminate <workflow-id>` | Forcer la terminaison d'un workflow. | `--reason`, `--run-id`, `--json` |
| `dw workflow:repair <workflow-id>` | Demander au serveur de réparer une exécution bloquée ou réessayable. | `--json` |
| `dw workflow:archive <workflow-id>` | Archiver une exécution fermée. | `--reason`, `--json` |

Exemples :

```bash
dw workflow:start \
  --type=App\\Workflows\\ProcessOrder \
  --workflow-id=order-123 \
  --task-queue=payments \
  --input='["order-123"]' \
  --json

dw workflow:update order-123 approve --wait=completed --input='["manager"]'
dw workflow:cancel --all-matching='WorkflowType = "ImportJob"' --limit=25 --yes
```

`workflow:start`, `workflow:signal`, `workflow:query` et `workflow:update`
valident les champs canoniques avec le contrat de requête publié par le
serveur. Les anciens alias non canoniques sont rejetés avant l'envoi.

## Inspection des appels de service {#service-call-inspection}

Utilisez `dw service-call:describe <endpoint> <service> <operation> <call-id>`
pour inspecter un appel Nexus durable dans l'espace de noms du point de
terminaison. Par exemple,
`dw service-call:describe billing invoices create call-42 --namespace=shared --json`
renvoie la réponse complète de Server.

La réponse préserve l'appelant d'origine et la cible liée, l'échéance de
l'appel, l'état, le résultat, les enregistrements de tentatives, l'échec typé
et les références conservées aux charges utiles. Les résultats réussis restent
des valeurs Avro sans perte `result_envelope`. Un appel accepté ou démarré
reste en attente et ne constitue pas un résultat terminé avec succès.

La commande effectue un seul GET. Elle ne demande ni nouvelle tentative,
annulation ni téléchargement d'objet externe. Server peut rapprocher un appel
du résultat terminal du workflow lié pendant la lecture. L'autorisation de
l'espace de noms et tous les sélecteurs de point de terminaison, service,
opération et appel s'appliquent.

## Commandes d'adaptateurs de passerelle {#bridge-adapter-commands}

Les commandes de passerelle sont des outils bornés d'entrée et de transmission
des événements d'intégration. Elles appellent l'interface d'adaptateur de
passerelle du serveur et renvoient la forme
`durable-workflow.v2.bridge-adapter-outcome.contract` en mode JSON. Elles
n'exécutent pas de code workflow et ne gèrent pas les transitions de son état.

| Commande | Rôle | Options importantes |
| --- | --- | --- |
| `dw bridge:webhook <adapter>` | Envoyer un événement de passerelle webhook qui démarre, signale ou met à jour un workflow via le plan de contrôle. | `--action=start_workflow\|signal_workflow\|update_workflow`, `--idempotency-key`, `--target`, options d'entrée, `--correlation`, `--json` |

Exemples :

```bash
dw bridge:webhook stripe \
  --action=start_workflow \
  --idempotency-key=stripe-event-1001 \
  --target='{"workflow_type":"orders.fulfillment","task_queue":"external-workflows","business_key":"order-1001"}' \
  --input='{"order_id":"order-1001"}' \
  --json

dw bridge:webhook pagerduty \
  --action=signal_workflow \
  --idempotency-key=pd-event-3003 \
  --target='{"workflow_id":"wf-remediation-42","signal_name":"incident_escalated"}' \
  --input='{"severity":"critical"}'
```

Utilisez les champs de résultat de passerelle au lieu de déduire le
comportement du seul état HTTP. `outcome`, `reason`, `control_plane_outcome`,
`idempotency_key` et le résumé `target` expurgé constituent le contrat
d'automatisation pour les doublons, absences de routage, charges utiles mal
formées et transmissions acceptées.

## Commandes de planification {#schedule-commands}

| Commande | Rôle | Options importantes |
| --- | --- | --- |
| `dw schedule:create` | Créer une planification. | `--schedule-id`, `--workflow-type`, `--cron`, `--interval`, `--task-queue`, `--timezone`, `--execution-timeout`, `--run-timeout`, `--overlap-policy`, `--jitter`, `--max-runs`, `--paused`, `--note`, options d'entrée, `--json` |
| `dw schedule:list` | Lister les planifications. | `--status`, `--type`, `--query`, `--limit`, `--next-page-token`, `--json` |
| `dw schedule:describe <schedule-id>` | Décrire une planification. | `--json` |
| `dw schedule:update <schedule-id>` | Mettre à jour la spécification de planification ou l'entrée du workflow. | options de création de planification, options d'entrée, `--json` |
| `dw schedule:pause <schedule-id>` | Suspendre une planification. | `--note`, `--json` |
| `dw schedule:resume <schedule-id>` | Reprendre une planification. | `--note`, `--json` |
| `dw schedule:trigger <schedule-id>` | Déclencher immédiatement une planification. | `--overlap-policy`, `--json` |
| `dw schedule:backfill <schedule-id>` | Rattraper une fenêtre temporelle. | `--start-time`, `--end-time`, `--overlap-policy`, `--json` |
| `dw schedule:delete <schedule-id>` | Supprimer une planification. | `--json` |

Utilisez `--cron` ou `--interval` pour créer des planifications par intervalle.
Utilisez `--paused` pour les inscrire au déploiement sans démarrer le travail.

### Filtrer et paginer les planifications {#schedule-list-filters}

`dw schedule:list` renvoie une page filtrée dans l’espace de noms résolu. Sans `--namespace`, seul l’espace par défaut résolu est sélectionné, pas tous les espaces. Le statut, le type de workflow et les prédicats de visibilité se combinent avec `AND`. La [qualification des artefacts CLI et PHP Server publiés normalement](https://github.com/durable-workflow/durable-workflow.github.io/issues/402#issuecomment-6370122227) vérifie ces options.

| Option CLI | Paramètre de requête Server | Signification |
| --- | --- | --- |
| `--status` | `status` | `active` ou `paused`. |
| `--type` | `workflow_type` | Type exact de workflow. |
| `--query` | `query` | Expression de visibilité des planifications. |
| `--limit` | `page_size` | Taille de page de 1 à 200, 50 par défaut. |
| `--next-page-token` | `next_page_token` | Jeton opaque de continuation de la réponse précédente. |

Dans un espace `production` existant où l’attribut keyword `Region` est enregistré, listez les planifications suspendues de `orders.rollup` dans la région `eu` et la file de tâches `orders` :

```bash
dw schedule:list --namespace=production --status=paused --type=orders.rollup \
  --query='Region = "eu" AND TaskQueue = "orders"' --limit=25 --json
```

Lisez `next_page_token` dans la réponse JSON et affectez cette valeur à `NEXT_PAGE_TOKEN`. Reprenez le même espace de noms et les mêmes filtres pour la page suivante :

```bash
dw schedule:list --namespace=production --status=paused --type=orders.rollup \
  --query='Region = "eu" AND TaskQueue = "orders"' --limit=25 --json \
  --next-page-token="$NEXT_PAGE_TOKEN"
```

Les jetons appartiennent à l’espace de noms et à la sélection de filtres. Recommencez sans jeton après un changement de filtres ou un refus pour curseur périmé. Chaque appel lit une page actuelle, pas un instantané fixe. Consultez les [contraintes et motifs de refus de l’API de liste des planifications](/docs/polyglot/server-api-reference#schedule-list-filters) pour la grammaire acceptée et les champs de réponse.

## Commandes des workers et files de tâches {#worker-and-task-queue-commands}

| Commande | Rôle | Options importantes |
| --- | --- | --- |
| `dw worker:register [worker-id]` | Inscrire un worker avec ses métadonnées de capacité et compatibilité. | `--task-queue`, `--runtime`, `--sdk-version`, `--build-id`, `--workflow-type`, `--activity-type`, `--max-workflow-tasks`, `--max-activity-tasks`, `--json` |
| `dw worker:list` | Lister les workers. | `--task-queue`, `--status`, options globales de sortie |
| `dw worker:describe <worker-id>` | Décrire un worker. | `--json` |
| `dw worker:deregister <worker-id>` | Désinscrire un worker. | `--json` |
| `dw task-queue:list` | Lister les files de tâches actives et leur état d'admission. | options globales de sortie |
| `dw task-queue:describe <queue>` | Décrire la capacité des workers, les baux, budgets de distribution et la capacité des tâches de requête en attente. | `--json` |
| `dw task-queue:build-ids <queue>` | Inspecter l'état des cohortes par build-id et du déploiement d'une file. | `--json` |
| `dw task-queue:drain <queue>` | Marquer une cohorte build-id en drainage pour arrêter les nouvelles prises de tâches. | `--build-id <value>`, `--unversioned`, `--json` |
| `dw task-queue:resume <queue>` | Effacer un drainage antérieur pour reprendre les nouvelles prises de tâches. | `--build-id <value>`, `--unversioned`, `--json` |

Les commandes de file de tâches sont la vue opérateur privilégiée pour
diagnostiquer limitation, capacité et absence de workers. Consultez
l'[admission des files de tâches](/docs/polyglot/task-queue-admission) pour la
politique côté serveur et le [déploiement des build-id de workers](/docs/polyglot/worker-build-id-rollout)
pour le cycle complet de migration du non versionné au versionné, de canari,
de drainage et de retour arrière.

`dw task-queue:drain` et `dw task-queue:resume` exigent soit
`--build-id <value>` pour une cohorte précise, soit `--unversioned` pour les
workers inscrits sans `build_id`. Les combiner échoue immédiatement avec une
erreur d'option invalide. Les deux commandes sont idempotentes : les drainages
répétés ne décalent pas `drained_at`, et réactiver une cohorte déjà active ne fait rien.

## Commandes du protocole worker {#worker-protocol-commands}

Ces outils de protocole de bas niveau servent aux diagnostics, tests rapides
et expériences de workers sans SDK. Les workers PHP et Python ordinaires
devraient utiliser les boucles worker de leur SDK.

| Commande | Rôle | Options importantes |
| --- | --- | --- |
| `dw workflow-task:poll <worker-id>` | Interroger pour une tâche de workflow. | `--task-queue`, `--build-id`, `--poll-request-id`, `--history-page-size`, `--accept-history-encoding`, `--json` |
| `dw workflow-task:history <task-id> <page-token>` | Récupérer la page d'historique suivante d'une tâche de workflow sous bail. | `--lease-owner`, `--attempt`, `--json` |
| `dw workflow-task:complete <task-id> <attempt>` | Terminer une tâche de workflow avec des charges utiles de commandes. | `--lease-owner`, `--complete-result`, `--command`, `--json` |
| `dw workflow-task:fail <task-id> <attempt>` | Signaler un échec d'exécution de tâche de workflow pour nouvelle tentative ou diagnostic. Distinct d'une finalisation avec la commande `fail_workflow`. | `--lease-owner`, `--message`, `--type`, `--stack-trace`, `--json` |
| `dw query-task:poll <worker-id>` | Interroger et louer une tâche de requête de workflow routée. | `--task-queue`, `--json` |
| `dw query-task:complete <query-task-id> <attempt>` | Terminer une tâche de requête sous bail avec un résultat JSON et son enveloppe correspondante. | `--lease-owner`, `--result`, `--json` |
| `dw query-task:fail <query-task-id> <attempt>` | Signaler l'échec d'une tâche de requête sous bail avec un motif lisible par machine. | `--lease-owner`, `--message`, `--reason`, `--type`, `--stack-trace`, `--json` |
| `dw activity:complete <task-id> <attempt-id>` | Terminer une tentative d'activité sous bail. | `--lease-owner`, options d'entrée, `--json` |
| `dw activity:fail <task-id> <attempt-id>` | Faire échouer une tentative d'activité sous bail. | `--lease-owner`, `--message`, `--type`, `--non-retryable`, `--json` |

Utilisez `workflow-task:fail` pour les échecs d'exécution côté worker tels
qu'une divergence de relecture ou une erreur de désérialisation. Il cible
`POST /worker/workflow-tasks/{taskId}/fail`. Terminer une tâche par une
commande faisant échouer le workflow est distinct et passe par
`workflow-task:complete` avec la charge utile de commande appropriée.

`query-task:poll`, `query-task:complete` et `query-task:fail` pilotent
l'interface worker de requêtes routées sous `/worker/query-tasks/…`. Les
workers ordinaires récupèrent ces tâches via leur gestionnaire de requêtes de
SDK. La CLI sert aux diagnostics, contrôles de parité CLI/SDK et expériences
sans SDK. Les échecs utilisent par défaut `--reason=query_rejected`. Utilisez
un motif stable comme `unknown_query`, `decode_failure` ou un identifiant
propre au runtime pour distinguer les rejets attendus des erreurs de runtime.

### Pages d'historique des tâches de workflow {#workflow-task-history-pages}

`workflow-task:history` est l'outil CLI de diagnostic du point de terminaison
de pages d'historique du plan worker. Utilisez-le uniquement après qu'un
`workflow-task:poll` a renvoyé une tâche sous bail avec
`next_history_page_token`. Les workers ordinaires devraient laisser leur SDK
récupérer les pages supplémentaires.

<!-- docs-example id="cli.workflow-task-history.command" -->
```bash
dw workflow-task:history workflow-task-01 history-page-2 \
  --lease-owner=python-worker-1 \
  --attempt=2 \
  --json
```

La sortie JSON est la réponse serveur sans renommage des champs :

<!-- docs-example id="cli.workflow-task-history.response" -->
```json
{
  "history_events": [
    {"event_id": 2, "event_type": "ActivityScheduled", "payload": {}}
  ],
  "total_history_events": 4,
  "next_history_page_token": "history-page-3"
}
```

L'automatisation devrait lire `history_events`, `total_history_events` et
`next_history_page_token`. Le point d'historique worker n'utilise pas les
champs d'historique du plan de contrôle `events` ou `next_page_token`.

## Commandes des espaces de noms et attributs de recherche {#namespace-and-search-attribute-commands}

| Commande | Rôle | Options importantes |
| --- | --- | --- |
| `dw namespace:list` | Lister les espaces de noms. | options globales de sortie |
| `dw namespace:create <name>` | Créer un espace de noms. | `--description`, `--retention`, `--json` |
| `dw namespace:describe <name>` | Décrire un espace de noms. | `--json` |
| `dw namespace:update <name>` | Mettre à jour les métadonnées d'un espace de noms. | `--description`, `--retention`, `--json` |
| `dw namespace:set-storage-driver <name> <driver>` | Configurer la politique de stockage externe d'un espace de noms, utilisée quand les charges encodées dépassent le seuil de délestage. | `--threshold-bytes`, `--uri`, `--disk`, `--bucket`, `--prefix`, `--region`, `--endpoint`, `--auth-profile`, `--disable`, `--json` |
| `dw storage:test` | Effectuer un aller-retour d'une petite charge en ligne et d'une grande charge externalisée via la politique de stockage sélectionnée ou le pilote substitué. | `--driver=local\|s3\|gcs\|azure`, `--small-bytes`, `--large-bytes`, options globales, `--json` |
| `dw search-attribute:list` | Lister les attributs de recherche. | options globales de sortie |
| `dw search-attribute:create <name> <type>` | Enregistrer un attribut de recherche. | `--json` |
| `dw search-attribute:delete <name>` | Supprimer un attribut de recherche. | `--json` |

Les types d'attributs de recherche sont des valeurs compatibles avec le
serveur comme `keyword`, `text`, `int`, `double`, `bool`, `datetime` et `keyword_list`.

Les commandes de stockage externe appellent l'API serveur de stockage des
espaces de noms. Le pilote est `local`, `s3`, `gcs` ou `azure`. Les pilotes de
stockage objet utilisent la configuration de système de fichiers côté
serveur : les options CLI décrivent donc la politique de l'espace plutôt que
de transporter les identifiants du fournisseur. `--disk` associe le pilote
`s3`, `gcs` ou `azure` à un disque nommé côté serveur contenant les véritables
identifiants. `--disable` conserve l'enregistrement de politique tout en
empêchant de nouvelles externalisations.

Exemples :

```bash
dw namespace:set-storage-driver billing s3 \
  --disk=external-payload-objects \
  --bucket=dw-payloads \
  --prefix=billing/ \
  --threshold-bytes=2097152 \
  --json

dw namespace:set-storage-driver dev local \
  --uri=file:///var/lib/durable-workflow/payloads

dw storage:test --namespace=billing --large-bytes=2097152 --json
dw storage:test --driver=s3 --small-bytes=128 --large-bytes=3145728 --json
```

En mode JSON, `namespace:set-storage-driver` renvoie la charge utile de
l'espace de noms avec sa politique `external_payload_storage`. `storage:test`
renvoie l'état du diagnostic et les objets de résultat `small_payload` et
`large_payload`. L'automatisation devrait s'appuyer sur ces champs plutôt que
d'analyser la table destinée aux humains.

Le diagnostic est aussi le contrôle opérateur le plus rapide du contrat
d'enveloppe de référence. Une réussite pour une grande charge prouve que la
politique sélectionnée sait écrire les octets encodés, renvoyer une référence
`durable-workflow.v2.external-payload-reference.v1`, relire l'objet et vérifier
`size_bytes` et `sha256`. Traitez un échec comme un problème de politique de
stockage avant d'autoriser l'externalisation par les workflows de cet espace.

## Commandes système {#system-commands}

Les commandes système exposent les passes de maintenance du serveur comme
des opérations explicites et scriptables.

| Commande | Rôle | Options importantes |
| --- | --- | --- |
| `dw system:repair-status` | Afficher le retard/l'état de réparation des workflows. | `--json` |
| `dw system:repair-pass` | Exécuter une passe de réparation. | `--run-id`, `--limit`, `--json` |
| `dw system:activity-timeout-status` | Afficher le retard/l'état des délais dépassés d'activités. | `--json` |
| `dw system:activity-timeout-pass` | Exécuter une passe de traitement des délais d'activité. | `--task-id`, `--limit`, `--json` |
| `dw system:retention-status` | Afficher le retard/l'état de rétention. | `--json` |
| `dw system:retention-pass` | Exécuter une passe de nettoyage de rétention. | `--run-id`, `--limit`, `--json` |

Dans les procédures, préférez les commandes d'état avant les passes pour voir
le périmètre en attente avant de modifier l'état du serveur.

## Commandes de schéma {#schema-commands}

| Commande | Rôle | Options importantes |
| --- | --- | --- |
| `dw schema:list` | Lister les schémas publiés lisibles par machine. | aucune connexion serveur requise |
| `dw schema:show <command-name>` | Afficher le JSON Schema embarqué pour la sortie d'une commande. | `--output=json\|jsonl` ; aucune connexion serveur requise |
| `dw schema:manifest` | Afficher le manifeste des schémas. | aucune connexion serveur requise |

Ces commandes sont utiles à un client IA ou une tâche CI nécessitant le
contrat actuel du plan de contrôle, de réponse ou de sortie sans extraire la
documentation en prose. Le [manifeste v4 actuel](https://durable-workflow.github.io/cli-json-envelopes/v4/manifest.json)
lie chaque enveloppe JSON et schéma JSONL d'enregistrement par résolveur
public et empreinte. Ses champs de charges utiles de démarrage/exécution de
workflow et de requête/mise à jour acceptent seulement le codec `avro`. Les
[manifestes v3](https://durable-workflow.github.io/cli-json-envelopes/v3/manifest.json)
et [v2](https://durable-workflow.github.io/cli-json-envelopes/v2/manifest.json)
restent disponibles avec leurs octets d'origine pour les consommateurs épinglés
à une révision.

## Contrat de sortie et de terminaison {#output-and-exit-contract}

Utilisez `--output=json` pour une commande renvoyant un objet et
`--output=jsonl` lorsqu'un listage alimente un processeur de flux. Les tables
humaines peuvent évoluer ; les noms de champs JSON constituent le contrat
d'automatisation.

Toutes les commandes utilisent la politique stable de codes de sortie du
[guide CLI](/docs/polyglot/cli#exit-codes) :

| Code | Signification |
| --- | --- |
| `0` | Réussite. |
| `1` | Commande exécutée mais échec générique. |
| `2` | Usage local invalide ou erreur de validation. |
| `3` | Échec réseau ou de transport. |
| `4` | Échec d'authentification ou d'autorisation. |
| `5` | Ressource introuvable. |
| `6` | Échec `5xx` côté serveur. |
| `7` | Délai dépassé. |

Pour les dossiers de support, collectez `dw doctor --output=json`,
`dw server:info --output=json` et `dw debug workflow <workflow-id> --output=json`.

## Guides associés {#related-guides}

- [CLI](./cli.mdx) couvre installation, profils et codes de sortie.
- [Server](./server.md) documente le plan de contrôle HTTP appelé par les
  commandes adossées au serveur.
- [Capacités des clients et des workers](./cli-python-parity.md) compare les
  interfaces client et worker de la CLI, PHP, Python et Rust.
