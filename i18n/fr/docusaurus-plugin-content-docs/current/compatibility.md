---
sidebar_position: 17
title: Compatibilité des versions
description: Contrat de référence de compatibilité et d'autorité de publication des interfaces publiques de Durable Workflow.
tags:
  - compatibility
  - operations
  - protocols
  - api-stability
keywords:
  - compatibilité des versions
  - référence de compatibilité
  - autorité de publication
  - niveaux de stabilité
  - manifestes de protocole
  - version du plan de contrôle
  - version du protocole worker
  - contrat de stabilité des interfaces
---

import PublicAuthorityIdentity from '@site/src/components/PublicAuthorityIdentity';
import WorkerProtocolAuthorityRoles from '@site/src/components/WorkerProtocolAuthorityRoles';
import protocolCatalog from '@site/static/platform-protocol-specs.json';

# Compatibilité des versions {#version-compatibility}

Cette page est le **contrat de référence de compatibilité et d'autorité de
publication** de la plateforme publique Durable Workflow. Elle définit de manière unique :

- les interfaces publiques,
- le niveau de stabilité de chacune,
- les modifications autorisées dans une version corrective, mineure ou majeure,
- les champs contractuels et ceux réservés au diagnostic,
- le protocole de négociation de version utilisé par les clients pour refuser
  toute opération si le serveur annonce une interface qu'ils ne savent pas utiliser.

Les documents de stabilité de chaque paquet (par exemple `docs/api-stability.md`
dans `durable-workflow/workflow`, la référence CLI `dw` et la page API opérateur
Waterline) **dépendent** de cette page. Ils précisent ces règles pour leur paquet.
En cas de divergence, cette page fait foi et le document du paquet comporte un bogue.

Le même contrat est publié dans un format lisible par machine pour que SDK,
manifestes serveur et contrôles CI se valident contre une référence unique :

- `surface_stability_contract` dans la réponse de `GET /api/cluster/info` du
  serveur autonome Durable Workflow, schéma
  `durable-workflow.v2.surface-stability.contract`, version `5`.
- Un miroir figé de ce manifeste dans ce dépôt à
  `static/compatibility-contract.json`.
- La classe PHP `Workflow\V2\Support\SurfaceStabilityContract`, source dans le
  processus que le serveur réexporte.

Une publication qui modifie une interface ci-dessous, son niveau de stabilité,
ses champs ou ses règles d'incompatibilité doit mettre à jour cette page, le
miroir JSON, le manifeste PHP et les documents de stabilité des paquets concernés
dans la même modification. La CI documentaire valide le contrat lisible par
machine, les métadonnées Rust publiées
quand elles sont disponibles et les spécifications du protocole worker.
L'alignement éditorial de cette page avec le manifeste reste une responsabilité
explicite de la revue de publication.

## Complément : catalogue des spécifications de protocoles {#companion-platform-protocol-spec-catalog}

Cette page indique *quelles* interfaces sont publiques et *comment* elles peuvent
évoluer. Le catalogue [Spécifications des protocoles de la plateforme](/docs/platform-protocol-specs)
indique *où* se trouve la spécification normative lisible par machine de chacune,
son *format* (OpenAPI pour les API HTTP, JSON Schema pour les familles d'objets,
AsyncAPI pour les flux d'événements), le *dépôt* responsable, les familles
d'objets couvertes et l'URL publique de l'artefact. Auteurs de SDK, agents et
opérateurs doivent valider leurs usages contre ce catalogue, sans relire toute
la prose ni dépendre de détails d'implémentation propres à un dépôt.

Le catalogue est annoncé sous `platform_protocol_specs` dans `GET /api/cluster/info`.

<PublicAuthorityIdentity
  manifest={protocolCatalog}
  manifestUrl="https://durable-workflow.github.io/platform-protocol-specs.json"
/>

Le champ `surface_family` de chaque entrée doit exister dans le contrat ci-dessus.
La CI du site valide le catalogue, résout les URL publiques des spécifications
et rejette les champs de référence propres à un dépôt.

<WorkerProtocolAuthorityRoles />

Chaque entrée obligatoire du catalogue des protocoles porte l'état `published`.
L'entrée du transport invocable reste `in_progress`. Chaque entrée disponible
renvoie directement à un document public OpenAPI, AsyncAPI ou JSON Schema. Le
schéma [`cluster_info_envelope`](/docs/platform-protocol-specs#cluster-info-envelope-notes)
fixe l'interface de découverte depuis laquelle toutes les autres entrées sont accessibles.

## Compatibilité Laravel publiée {#laravel-support}

Choisissez la version du paquet avant de comparer PHP et Laravel. Le paquet
embarqué et le SDK en mode service ont des contrats distincts.

| Branche du paquet | PHP | Laravel |
| --- | --- | --- |
| Workflow embarqué %%artifact.workflowVersion%% actuel | PHP 8.2+ en 8.x ; PHP 8.3+ pour Laravel 13 | `^12.72.0` ou `^13.41.0` |
| Workflow embarqué 2.20.5 | PHP `^8.1`, sous réserve du minimum du framework | `^10.50.4`, `^11.56.1`, `^12.69.0` ou `^13.30.0` |
| SDK PHP 3.14 publié | SDK de base PHP `^8.1` ; le pont Laravel exige PHP `^8.2`, et PHP 8.3+ pour Laravel 13 | `^12.69.0` ou `^13.30.0` |
| SDK PHP 3.9.5 | SDK de base PHP `^8.1` ; le pont Laravel suit aussi le minimum du framework | `^10.50.4`, `^11.56.1`, `^12.69.0` ou `^13.30.0` |

Les anciennes lignes indiquent les exigences des versions qu’elles nomment.

Le [contrat embarqué publié](https://github.com/durable-workflow/workflow/blob/2.28.1/resources/laravel-embedded-upgrade-contract.json)
et le `composer.json` de chaque version font autorité. La version embarquée
actuelle a été vérifiée sur Laravel 12/PHP 8.2–8.4 et Laravel 13/PHP 8.3–8.4.
Elle retire PHP 8.1 et Laravel 10/11. Le [guide historique v1 stable](/docs/1.x/installation/)
et les [exigences propres au SDK PHP](https://php.durable-workflow.com/) restent distincts.

Workflow 2.28.1 est un correctif de sécurité uniquement, qui relève les
versions minimales de Laravel indiquées ci-dessus. Les fichiers du runtime
et du schéma sont identiques à ceux de 2.28.0. Une mise à niveau depuis
2.28.0 n’ajoute donc aucune migration de base de données. La [vérification du paquet publié et cinq parcours de mise à niveau/retour arrière](https://github.com/durable-workflow/workflow/pull/1141#issuecomment-6871390667)
confirment la validation de ce paquet.

Mettez d'abord PHP et Laravel à niveau vers une combinaison compatible. Si cette
migration n'est pas prête, `~2.20.5` maintient Composer sur les correctifs 2.20,
sans promettre une maintenance indéfinie. `^2.0` peut sélectionner une version
mineure ultérieure si la plateforme le permet. Conservez le runtime d'origine
pour les exécutions v1 ouvertes et suivez le [guide d'adoption](/docs/laravel-adoption)
pour la vidange ou la coexistence. Modifier une contrainte Composer ne migre
pas l'historique durable.

Le SDK PHP 3.10 a aligné le pont Laravel en mode service sur les mêmes minimums
PHP et Laravel que Workflow 2.21 et a retiré la prise en charge de Laravel 10/11 ;
les versions 3.11 à 3.14 les conservent. Son fournisseur refuse les versions de framework et de PHP
non prises en charge ou inconnues avant d'enregistrer la configuration, les
clients ou les workers. Les applications existantes en SDK 3.9.x conservent leur
propre contrat pendant la mise à niveau de la plateforme. Consultez les
[notes de mise à niveau du SDK PHP](./polyglot/php.md#upgrade-to-3-10-and-3-11).

Workflow 2.22 n'ajoute aucune migration de base de données et conserve les
minimums de compatibilité de 2.21. Son protocole worker embarqué annonce `1.22`
et accepte toujours les requêtes `1.20`. `1.22` ajoute une échéance d'occurrence
optionnelle que des appelants externes peuvent demander pour les attentes de
condition ; l'exécuteur embarqué conserve son comportement d'attente existant.
Dès qu'un workflow a utilisé cette politique, ne revenez à une version antérieure
de Workflow qu'en restaurant une sauvegarde effectuée avant la mise à niveau. Les
versions antérieures peuvent ignorer la politique et mélanger la chaîne
d'attente, et une nouvelle mise à niveau ne répare pas cet historique. Consultez
le [journal des modifications 2.22.0](https://github.com/durable-workflow/workflow/blob/2.22.0/CHANGELOG.md).

Workflow 2.23 et 2.24 conservent les planchers de support de 2.21 et le protocole de worker embarqué `1.22`. 2.23 n'ajoute aucune migration de base de données. 2.24 en ajoute une : exécutez `php artisan migrate` lors de la mise à niveau. Elle ajoute à `activity_attempts` les colonnes nullables `last_heartbeat_progress`, `last_heartbeat_progress_at` et `last_heartbeat_recorded_at`, sans remplissage rétroactif. Changements de comportement à vérifier avant la mise à niveau :

- Depuis 2.24, un heartbeat n'écrit un événement `ActivityHeartbeatRecorded` que si sa progression a changé, au plus une fois par max(délai de heartbeat, 60 secondes). Voir [Heartbeats](./features/heartbeats.md).
- Depuis 2.24, créer un schedule avec un identifiant déjà pris, y compris celui d'un schedule supprimé ou épuisé, lève `ScheduleAlreadyExistsException`, et réappliquer un schedule inchangé n'enregistre rien.
- Depuis 2.23.1, une nouvelle activité avec `maxAttempts` inférieur à 1 fait échouer l'exécution au lieu de s'exécuter une fois. Pour des tentatives illimitées, omettez `maxAttempts` et mettez `$tries` de la classe d'activité à 0. Les historiques enregistrés auparavant continuent d'être rejoués.
- Depuis 2.23.1, la compensation de saga embarquée s'exécute sous un bouclier d'annulation, et une mise à jour acceptée pendant la clôture de l'exécution obtient quand même son résultat.

Voir les notes de version de [2.23.0](https://github.com/durable-workflow/workflow/releases/tag/2.23.0), [2.23.1](https://github.com/durable-workflow/workflow/releases/tag/2.23.1), [2.23.2](https://github.com/durable-workflow/workflow/releases/tag/2.23.2) et [2.24.0](https://github.com/durable-workflow/workflow/releases/tag/2.24.0).

Workflow 2.25 et 2.26 conservent les planchers de support de 2.21 et le protocole de worker embarqué `1.22`. 2.25 n'ajoute aucune migration de base de données. 2.26 en ajoute une : exécutez donc `php artisan migrate` lors de la mise à niveau. Elle crée la table `workflow_child_supervisions`. Changements à vérifier avant la mise à niveau :

- Depuis 2.26, un parent qui continue dans une nouvelle exécution alors que des enfants qu'il a démarrés sont encore ouverts les transmet à l'exécution suivante. La dernière exécution de la chaîne leur applique leur politique de clôture du parent, et un enfant qui échoue est toujours relancé selon la politique de nouvelles tentatives enregistrée. Voir [Continuation et enfants ouverts](./features/child-workflows.md#continue-as-new-and-open-children).
- Depuis 2.26, les migrations des versions antérieures qui remplissent les lignes existantes (`2026_07_13`, `2026_09_24`, `2026_09_29` et `2026_10_11`) ne verrouillent plus la table pendant tout le remplissage. Elles ajoutent d'abord la colonne, remplissent les lignes par petits lots, puis construisent leurs index sans bloquer les écritures. Si l'une d'elles est interrompue, exécutez de nouveau `php artisan migrate`. Les installations qui les ont déjà exécutées ne sont pas concernées.
- Depuis 2.26, le redrive réutilise un workflow enfant terminé avant l'échec. Les versions antérieures à 2.26 rejouent un tel successeur avec un temps de workflow différent après l'enfant réutilisé : gardez donc les workers en 2.26 ou plus dès qu'un tel successeur existe. Voir [Relancer une exécution échouée par redrive](./failures-and-recovery.md#redrive).
- Depuis 2.26, `historyBudgetAtStep()` et `shouldContinueAsNewAtStep()` lisent le budget d'historique de la même façon à chaque relecture. Utilisez-les dans les boucles. Voir [Budget d'historique](./features/continue-as-new.md#history-budget).
- Depuis 2.25, dépasser une limite fixe de mémo ou d'attributs de recherche lève `StructuralLimitExceededException` au lieu de `InvalidArgumentException`, et la valeur par défaut de `memo_size_bytes` est 65 536. Voir [Limites structurelles](./constraints/structural-limits.md).

Voir les notes de version de [2.25.0](https://github.com/durable-workflow/workflow/releases/tag/2.25.0) et [2.26.0](https://github.com/durable-workflow/workflow/releases/tag/2.26.0).

Workflow 2.27 conserve les planchers de support de 2.21 et le protocole de worker embarqué `1.22`, et n'ajoute aucune migration de base de données. Changements à vérifier avant la mise à niveau :

- Depuis 2.27, une application embarquée ne répare et n'exécute le travail que dans ses propres espaces de noms. Si l'application démarre, planifie ou signale des workflows dans d'autres espaces de noms que `DW_V2_NAMESPACE`, listez-les tous dans `DW_V2_NAMESPACES`. Un processus qui sert tous les espaces de noms définit `DW_V2_ALL_NAMESPACES=true`. Voir [Espaces de noms exécutés par une application](./configuration/options.md#namespace-allowlist).
- Depuis 2.27, la clôture d'un enfant coûte au parent le même travail, quel que soit le nombre de ses frères et sœurs. Voir [Coût d’un large éventail d’enfants](./features/child-workflows.md#fan-out-cost).

Voir les [notes de version de 2.27.0](https://github.com/durable-workflow/workflow/releases/tag/2.27.0).

Workflow 2.28.0 conserve les planchers de support de 2.21 et le protocole de worker embarqué `1.22`, et n'ajoute aucune migration de base de données. Changement de comportement à vérifier avant la mise à niveau :

- Depuis 2.28, une exécution qui se termine, échoue ou continue dans une nouvelle exécution annule dans la même transaction les activités et minuteurs qu'elle n'a jamais attendus, comme les perdants de `select()`, au lieu de les laisser s'exécuter. Un résultat tardif d'une telle activité est refusé avec `run_closed`. Si un workflow a besoin de l'effet d'un perdant, attendez-le avant de retourner. Voir [Perdants à la clôture de l’exécution](./features/concurrency.md#selection-losers-at-close).

Voir les [notes de version de 2.28.0](https://github.com/durable-workflow/workflow/releases/tag/2.28.0).

## Niveaux de stabilité {#stability-levels}

Chaque interface publique Durable Workflow porte exactement un de ces niveaux.
Les niveaux sont explicites. Une interface non classée n'est pas publique.

| Niveau | Signification | Modifications incompatibles autorisées |
|-------|---------|-----------------------------------|
| `frozen` | Format d'échange ou forme persistée qui doit se décoder de la même manière pendant toute la vie du workflow. Renommer, supprimer ou réaffecter un champ casse le protocole et n'est jamais une modification mineure. | Uniquement en introduisant une **primitive parallèle** avec un nouveau nom de type. La forme d'origine reste décodable indéfiniment. |
| `stable` | Interface publique couverte par la garantie semver de la plateforme. Les ajouts sont publiés dans des versions mineures. | Version majeure uniquement. |
| `prerelease` | Interface publique fonctionnellement complète, mais encore modifiable avant la publication correspondante `1.0.0` / `2.0.0`. | Dans des préversions clairement identifiées et signalées dans les notes de publication. |
| `experimental` | Interface publique instable. Peut changer à chaque publication, y compris corrective. Les appelants doivent l'activer en lisant son indicateur expérimental. | Toute publication, avec mention dans les notes. |

## Familles d'interfaces publiques {#public-surface-families}

Voici la liste complète des familles publiques. Ajouter, supprimer ou reclasser
une famille exige une modification du contrat : incrément de version de
`SurfaceStabilityContract`, cette page et miroir JSON dans le même commit.

| Famille | Stabilité | Manifeste de référence dans `/api/cluster/info` | Périmètre |
|--------|-----------|-------------------------------------------|----------------|
| `server_api` | `stable` | `control_plane` | API HTTP du serveur autonome : routes du plan de contrôle, des espaces de noms, des planifications et du système, ainsi que `/api/health`, `/api/ready`, `/api/cluster/info`. La version par route est régie par `control_plane.request_contract` et `control_plane.response.contract`. Le `version` racine du serveur identifie le build et ne fait pas autorité pour la compatibilité client. |
| `worker_protocol` | `stable` | `worker_protocol` | API HTTP du plan worker utilisée par les workers SDK externes pour s'enregistrer, interroger les files, envoyer des battements de cœur, gérer les baux de session, terminer et faire échouer les tâches de workflow, d'activité et de requête de lecture. Inclut les contrats runtime `worker_sessions` et `local_activities`, `external_execution_surface_contract`, `external_executor_config_contract`, `invocable_carrier_contract`, `external_task_input_contract` et `external_task_result_contract`. |
| `cli_json` | `stable` | sans objet (voir référence CLI) | Formes `--output=json` et `--output=jsonl` émises par `dw`. Les codes de sortie JSON et noms de champs sont l'interface durable. La forme lisible `--output=table` relève de la documentation, pas du contrat. |
| `waterline_api` | `stable` | sans objet (voir API opérateur Waterline) | API HTTP d'observabilité Waterline à `/waterline/api/v2/*`, contrat de source du moteur et formes JSON du tableau de bord. Waterline doit correspondre à la version majeure du paquet Workflow. |
| `mcp_discovery_results` | `stable` | sans objet (voir page workflows MCP) | Interfaces Model Context Protocol `/mcp/*` et fichiers de découverte `llms.txt` / `llms-2.0.txt`. Noms d'outils MCP, schémas de paramètres et sémantique de `payload_preview_limit_bytes` sont contractuels. Descriptions d'outils et indices de découverte sont diagnostiques. |
| `official_sdks` | `stable` | `client_compatibility` | SDK officiels : PHP `durable-workflow/sdk`, Python `durable_workflow` et Rust `durable-workflow`. La CLI `dw` est le client de commandes officiel. L'interface publique de chaque SDK dépend de son document de stabilité, qui doit se conformer à cette page. |
| `history_event_wire_formats` | `frozen` | sans objet (formes figées, voir `docs/api-stability.md` de Workflow) | Forme persistée de chaque ligne de `workflow_history_events` et `workflow_schedule_history_events`. Dès qu'un workflow écrit un événement, tous les futurs SDK qui le relisent doivent décoder le même ensemble de champs. |
| `cluster_info_manifests` | `stable` | `surface_stability_contract`, `client_compatibility`, `control_plane`, `worker_protocol`, `auth_composition_contract`, `coordination_health` | Manifestes de protocole publiés par `GET /api/cluster/info`. Chaque manifeste imbriqué porte son propre `schema` et `version` et évolue selon ses règles contractuelles. Les clés de l'enveloppe sont stables. |

### Documents de stabilité par paquet {#per-package-stability-documents}

Ces documents précisent les règles de cette page pour chaque paquet :

- `durable-workflow/workflow` (PHP) : [`docs/api-stability.md`](https://github.com/durable-workflow/workflow/blob/main/docs/api-stability.md). Référence pour l'API PHP d'écriture, les classes `Support\*` destinées au serveur et les tables de formats figés d'événements d'historique.
- `durable-workflow/sdk` (PHP) : [`README.md`](https://github.com/durable-workflow/sdk-php/blob/main/README.md). Référence pour l'API distante de client et worker indépendante du framework, distribuée sur Packagist.
- `durable-workflow/server` : [`README.md`](https://github.com/durable-workflow/server/blob/main/README.md) et `docs/contracts/*`. Référence pour les contrats de requêtes et réponses du serveur autonome.
- CLI `dw` : [`/docs/polyglot/cli-reference`](/docs/polyglot/cli-reference). Référence pour les formes JSON de sortie et codes de sortie.
- SDK Python : `README.md` dans `durable-workflow/sdk-python`. Référence pour l'API publique du paquet `durable_workflow`.
- SDK Rust : `README.md` et `[package.metadata.durable-workflow]` dans
  `durable-workflow/sdk-rust`. Référence pour l'API publique de la crate
  `durable-workflow` et sa déclaration de compatibilité.

## Règles de publication {#release-rules}

Ces règles s'appliquent à toutes les familles publiques ci-dessus. Elles sont
reproduites sous `release_rules` dans le miroir JSON.

### Versions correctives {#patch-releases}

Autorisé :
- corriger des bogues en préservant le contrat documenté
- corriger la documentation
- mettre à jour les dépendances sans modifier l'interface publique
- modifier des interfaces marquées `experimental`

Interdit :
- supprimer ou renommer un champ, une route, une commande ou une classe `stable` ou `frozen`
- restreindre les entrées acceptées par une route ou commande `stable`
- changer le sens d'un champ `stable` existant

### Versions mineures {#minor-releases}

Autorisé :
- ajouter des champs, routes, commandes ou classes à une interface `stable`
- ajouter des paramètres facultatifs avec des valeurs par défaut sûres
- ajouter des indicateurs de capacité aux réponses de découverte
- promouvoir une interface `prerelease` ou `experimental` à `stable`

Interdit :
- supprimer ou renommer un champ, une route, une commande ou une classe `stable` ou `frozen`
- changer le sens d'un champ `stable` ou `frozen` existant

### Versions majeures {#major-releases}

Autorisé :
- supprimer, renommer ou restreindre une interface `stable`
- augmenter le `control_plane.version` ou `worker_protocol.version` requis
- retirer une plage de versions SDK ou CLI précédemment prise en charge

Obligatoire :
- annoncer la modification dans les notes au moins une version mineure avant
  la publication majeure
- si possible, fournir l'ancienne et la nouvelle interface ensemble dans une
  version mineure antérieure pour permettre la migration avant la majeure
- documenter la migration dans le [guide de migration](/docs/migration)
  avant la publication

## Champs de diagnostic et champs garantis {#diagnostic-only-versus-guaranteed-fields}

Chaque champ d'une interface `stable` ou `frozen` est **garanti** ou
**uniquement diagnostique**. Leurs règles d'évolution diffèrent :

- Les **champs garantis** font partie du contrat documenté. Les producteurs
  doivent continuer à les émettre sous la forme documentée. Les consommateurs
  peuvent compter sur leur présence et leur sens. Supprimer ou renommer un
  champ garanti d'une interface `stable` est une modification majeure.
- Les **champs uniquement diagnostiques** servent au triage humain, au débogage
  et à l'observabilité. Ils peuvent être ajoutés, renommés ou supprimés dans
  toute version mineure. Ils doivent porter `diagnostic_only: true` (ou son
  équivalent documentaire) là où ils sont documentés. **Les consommateurs ne
  doivent ni analyser, ni persister, ni utiliser ces champs pour leurs décisions
  de production.**

Les anciens consommateurs doivent ignorer les champs supplémentaires inconnus
d'une forme `stable` ou `frozen` pour assurer la compatibilité ascendante. Les
champs obligatoires inconnus doivent provoquer un refus. SDK et CLI publient
leur propre comportement de compatibilité dans leurs documents de stabilité.

## Matrice de compatibilité {#compatibility-matrix}

Cette matrice d'exploitation indique les versions de clients validées contre
les manifestes de protocole serveur. Les composants la valident à l'exécution
via `GET /api/cluster/info` et refusent de fonctionner si les manifestes divergent.

### Dernier tuple reproductible qualifié {#last-qualified-reproducible-tuple}

Ce tableau présente la combinaison stable revue et choisie pour cette
documentation dans [`stable-releases.json`](/stable-releases.json). Chaque
composant est versionné indépendamment. Une combinaison compatible peut donc
contenir des versions de paquets différentes. Les rapports de publication et de
qualification conservent les versions et empreintes d'images exactes utilisées
pour chaque vérification terminée.

| Composant | Version prise en charge | Identité d'installation |
|-----------|-------------------|------------------|
| Server | `%%artifact.serverVersion%%` | `%%artifact.serverDockerHubImage%%` |
| Chart Helm | `%%artifact.helmChartVersion%%` | `%%artifact.helmChartInstallIdentity%%` |
| CLI | `%%artifact.cliVersion%%` | `%%artifact.cliInstallerEnv%%` |
| Moteur Workflow | `%%artifact.workflowVersion%%` | `%%artifact.workflowComposerPackage%%` |
| Opérateur Waterline | `%%artifact.waterlineVersion%%` | `%%artifact.waterlineComposerPackage%%` |
| SDK PHP | `%%artifact.phpSdkVersion%%` | `%%artifact.phpSdkComposerPackage%%` |
| SDK Python | `%%artifact.pythonSdkVersion%%` | `%%artifact.pythonPackagePin%%` |
| SDK Rust | `%%artifact.rustSdkVersion%%` | `%%artifact.rustCargoRequirement%%` |

Le Server sélectionné est le Server natif 3.x. PHP Server 2.x est figé à la version 2.11.8 et ne recevra plus de nouvelles versions ; les installations PHP existantes peuvent passer au natif avec `upgrade-takeover` en suivant le [runbook de reprise native](%%artifact.serverTakeoverRunbookUrl%%). La reprise est qualifiée sur l’image publiée 3.0.4 dans le périmètre indiqué par le runbook ; elle est à sens unique et exige une sauvegarde préalable.

PHP Server 2.11.8 reste non corrigé pour les avis Laravel de novembre. Les déploiements épinglés existants doivent suivre les [conditions d’exposition et actions de retrait](./polyglot/server.md#retired-php-server-security) ; les preuves historiques de takeover gardent leurs limites initiales.

L’`appVersion` enregistré du chart Helm est `%%artifact.helmChartAppVersion%%`, correspondant au Server sélectionné, et le chart exécute le Server natif par défaut. Son [reçu de publication](%%artifact.helmChartQualificationUrl%%) consigne l’exécution de publication du chart, les digests OCI/du paquet, l’identité source et une installation kind lors de cette exécution ; ce n’est pas une qualification sur un cluster de production. Consultez le [choix et la mise à niveau du chart](./deployment.md#helm-chart-selection) avant d’installer ou de remplacer l’image.


PyPI affiche la version de distribution Python sous
`%%artifact.pythonRegistryVersion%%`. La forme d'installation PEP 440 documentée
`%%artifact.pythonSdkVersion%%` désigne cette même publication. Cette
normalisation ne crée pas une seconde version prise en charge.

La combinaison choisie évolue après qualification des consommateurs concernés.
Les registres Server publiés et les démarrages rapides générés utilisent ces
artefacts. Les paquets peuvent être publiés indépendamment, avec compatibilité
vérifiée via leurs manifestes de protocole, capacités et contrôles consommateurs.

Les anciens artefacts alpha et bêta sont historiques. Ils ne sont pas des choix
alternatifs pour démarrer. L'historique des publications reste intact.

Chaque composant stable suit le versionnage sémantique. Les capacités ajoutées
peuvent être publiées dans des versions compatibles. Les changements publics
incompatibles exigent une version majeure. Vérifiez par découverte les capacités
du Server et des workers installés avant d'activer une fonctionnalité.

### Compatibilité des protocoles à l'exécution {#runtime-protocol-compatibility}

Les versions de paquets sélectionnent la ligne de produit prise en charge. Les
manifestes de protocole ajoutent un second contrôle avec refus par défaut :

| Client | Ligne de produit | Plan de contrôle | Protocole d’enregistrement worker par défaut |
|--------|---------------|---------------|---------------------------------------------|
| CLI | `%%artifact.cliVersion%%` | `2` | sans objet |
| SDK PHP | `%%artifact.phpSdkVersion%%` | `2` | `1.20` |
| SDK Python | `%%artifact.pythonSdkVersion%%` | `2` | `1.20` |
| SDK Rust | `%%artifact.rustSdkVersion%%` | `2` | `1.20` |

Les SDK permettent aussi de sélectionner explicitement le protocole worker
`1.19` pour un ancien Server compatible. L’annulation coopérative exige
`1.20`. Sélectionner `1.19` ne fournit pas cette capacité. Chaque opération
peut utiliser sa version minimale documentée. La valeur par défaut de
l’enregistrement ne signifie donc pas que toutes les requêtes worker
envoient `1.20`.

Le Server publié actuel annonce la version worker indiquée dans le tableau des
rôles de référence ci-dessus. Il accepte des en-têtes de la même majeure avec
une mineure inférieure ou égale à celle annoncée, puis renvoie sa version
annoncée. Les en-têtes absents ou mal formés, les majeures différentes et les
mineures worker en avance sur le serveur sont refusés. La CLI valide
`control_plane.version: "2"`.

Le `version` racine du serveur identifie son build. Les clients doivent utiliser
les manifestes `control_plane`, `worker_protocol`, `client_compatibility` et
`surface_stability_contract` renvoyés par `GET /api/cluster/info` pour négocier
le protocole.

Workflow et Waterline doivent utiliser des versions 2.x compatibles. La
découverte du runtime et les contraintes des paquets définissent la frontière
de compatibilité après la publication stable.

### Exemples de validation à l'exécution {#runtime-validation-examples}

Les SDK valident la découverte avant d'enregistrer un worker. Un serveur
incompatible produit une erreur de compatibilité explicite au lieu de tenter
un ancien parcours de préversion. Toutes les requêtes worker envoient
`X-Durable-Workflow-Protocol-Version`. Les requêtes du plan de contrôle envoient
`X-Durable-Workflow-Control-Plane-Version: 2`.

Avant promotion d'une ligne de produit, la qualification doit partir d'une
machine propre, n'installer que les artefacts publiés ci-dessus et réussir les
parcours de conformité PHP, Python et Rust. Les sources locales et substitutions
non publiées ne constituent pas des preuves sur les artefacts publics.

Les métadonnées stables des paquets et la découverte du runtime définissent
désormais la compatibilité 2.x prise en charge. La qualification installe
toujours les artefacts publics ensemble avant publication. Les versions
correctives et mineures suivent les règles sémantiques ci-dessous.

### Progression des publications {#release-progression}

Les versions correctives préservent les contrats stables documentés. Les
mineures peuvent ajouter des champs, routes, commandes, classes ou paramètres
facultatifs avec des valeurs par défaut sûres. Les modifications stables
incompatibles exigent une majeure et une migration documentée. Les formes figées
des événements d'historique restent décodables indéfiniment. Une nouvelle forme
utilise une primitive parallèle sans modifier un événement existant.

Chaque publication doit synchroniser les métadonnées des paquets, les notes,
les commandes d'installation et les exemples interlangages.

### Liste de contrôle de publication {#release-review-checklist}

- Confirmer que le contrat de compatibilité lisible par machine correspond au
  manifeste de stabilité de Workflow.
- Confirmer que chaque version SDK choisie fonctionne avec le Server choisi.
- Confirmer que les exemples d'installation utilisent le canal stable.
- Confirmer que les métadonnées identifient la version SDK exacte et les
  versions de protocole. Consigner les qualifications Server ultérieures dans
  les preuves de compatibilité.
- Confirmer la réussite de la conformité sur machine propre avec les artefacts
  publiés PHP, Python et Rust.
- Confirmer que les notes décrivent les ajouts postérieurs à la référence et
  ne présentent pas d'anciennes préversions comme choix pris en charge.

## Voir aussi {#see-also}

- [Installation de Server](/docs/polyglot/server) : déployer le serveur autonome
- [Référence API Server](/docs/polyglot/server-api-reference) : `GET /api/cluster/info` et manifestes de protocole
- [SDK PHP](/docs/polyglot/php) : client et worker PHP
- [SDK Python](/docs/polyglot/python) : client et worker Python
- [SDK Rust](/docs/polyglot/rust) : client et worker Rust
- [CLI](/docs/polyglot/cli) : interface en ligne de commande
- [Guide de migration](/docs/migration) : migrer de v1 à v2
- [`docs/api-stability.md` de Workflow PHP](https://github.com/durable-workflow/workflow/blob/main/docs/api-stability.md) : stabilité propre au paquet Workflow PHP
