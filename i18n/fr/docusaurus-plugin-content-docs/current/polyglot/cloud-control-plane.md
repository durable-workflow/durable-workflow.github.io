---
sidebar_position: 3
title: Runtime géré Cloud
description: Comparer les offres Cloud, la capacité mesurée des workflows, la facturation et la disponibilité, puis connecter des workers PHP, Python ou Rust à un espace de noms géré.
tags:
  - cloud
  - managed-runtime
  - polyglot
  - operations
keywords:
  - Durable Workflow Cloud
  - URL du runtime d'espace de noms
  - identifiants du runtime
  - workers exécutés par le client
  - réseau privé
  - runtime géré monorégion
  - runtime géré multirégion
---

# Runtime géré Cloud {#cloud-managed-runtime}

Durable Workflow Cloud est un service d'orchestration géré. Cloud exploite le
plan de contrôle hébergé et le runtime d'orchestration, dont l'état des
workflows, l'historique, les planifications, files de tâches, baux et la
visibilité durable. Les clients exécutent leurs clients SDK et workers sur
un espace de noms Cloud provisionné.

C'est une option distincte de l'auto-hébergement. Un Durable Workflow Server
auto-hébergé fonctionne indépendamment et n'est jamais rattaché à Cloud.

## Offres et tarifs {#plans-and-pricing}

Vous payez la capacité provisionnée, pas la sémantique des workflows. Chaque
espace de noms reçoit un runtime géré isolé ; vos workers PHP, Python et Rust
s'exécutent dans votre environnement. Consultez les
[tarifs Cloud](https://cloud.durable-workflow.com/pricing) et le tableau de
bord pour la disponibilité actuelle du provisionnement.

Cloud Dev est disponible maintenant. Les quatre offres HA sont en
qualification et ne peuvent pas encore être achetées ni provisionnées. Les
tarifs, capacités, disponibilités et SLA ci-dessous sont prévus et ne
constituent pas des offres d'achat actuelles.

| Offre | Capacité du runtime | Stockage durable inclus | Disponibilité | Prix (USD) |
| --- | --- | --- | --- | --- |
| Cloud Dev | 1 vCPU, 1 Go RAM | 5 Go | Hôte unique, sans SLA | 0,075 $/heure, minimum de 2 $ par mois actif, plafond de 50 $/mois |
| Cloud Standard | 2 vCPU, 4 Go RAM | 25 Go | HA monorégion prévue, SLA de 99,99 % | 0,45 $/heure, minimum de 10 $ par mois actif, plafond de 300 $/mois |
| Cloud Multi-Region | 2 vCPU, 4 Go RAM | 25 Go | HA multirégion prévue, SLA de 99,99 % | 0,60 $/heure, minimum de 15 $ par mois actif, plafond de 400 $/mois |
| Cloud Business | 4 vCPU, 8 Go RAM | 100 Go | HA monorégion prévue, SLA de 99,99 % | 2,25 $/heure, minimum de 50 $ par mois actif, plafond de 1 500 $/mois |
| Cloud Business Multi-Region | 4 vCPU, 8 Go RAM | 100 Go | HA multirégion prévue, SLA de 99,99 % | 3,00 $/heure, minimum de 75 $ par mois actif, plafond de 2 000 $/mois |

La capacité couvre les composants du runtime géré, pas le calcul des workers
clients. Pour les offres HA prévues, réplication et capacité de secours sont
incluses dans le prix ; la table n'additionne pas les répliques en capacité
supplémentaire d'exécution des workflows. Chaque offre inclut Managed
Waterline, des sauvegardes chiffrées de base, les mises à niveau et une URL de
runtime stable.

Les runtimes provisionnés sont facturés selon leur durée, mesurée à la minute
de l'activation au déprovisionnement. Minimums et plafonds s'appliquent par
achat de runtime et mois civil UTC. Le temps provisionné inactif est
facturable ; un mois sans temps provisionné ne produit aucun frais de runtime.
Un nouvel achat a son propre minimum et plafond ; une réparation ou reprise
gérée par le service ne les réinitialise pas. Stripe facture mensuellement
l'usage accumulé. Les prix excluent les taxes applicables.

Le stockage est fixé à l'allocation incluse. Il n'y a ni extension de stockage
achetée séparément, ni augmentation automatique, ni frais de dépassement.
Pour plus d'espace, [demandez une offre de runtime supérieure](https://cloud.durable-workflow.com/contact)
avant d'atteindre la limite. Passer seulement de monorégion à multirégion
n'augmente pas le stockage. Une augmentation de capacité nécessite un véritable
changement de runtime, pas seulement de facturation ; elle s'organise
actuellement avec le support. L'usage réseau est mesuré, pas facturé
actuellement, et n'est pas illimité.

Consultez les [tarifs Cloud](https://cloud.durable-workflow.com/pricing) pour
choisir une offre. Pour plus de capacité, une autre connectivité, le SSO, le
support entreprise ou une disponibilité personnalisée,
[contactez-nous](https://cloud.durable-workflow.com/contact).

## Frontière du service géré {#managed-service-boundary}

La frontière visible du client est un espace de noms Cloud :

```text
Cloud organization
  project
    environment
      namespace
        stable runtime URL
        client runtime credential  ---> workflow starts and commands
        worker runtime credential  ---> registration, polling, and completion

Cloud-operated runtime
  workflow state and history
  schedules and task queues
  leases, matching, and visibility
  Managed Waterline
```

Cloud gère le provisionnement des espaces de noms, l'exploitation du runtime,
la persistance, le placement, la santé, la reprise et l'interface Managed
Waterline de l'espace. Les clients gèrent leur code applicatif, les
implémentations de workflows et d'activités et les processus de leurs workers.
Ils ne déploient pas de service Waterline distinct.

Le point de terminaison HTTPS de l'espace se connecte directement au runtime
géré. Le trafic SDK ne passe pas par l'application du site/plan de contrôle
Cloud. Utilisez l'URL retournée sans modification ni ajout de `/api` ; le SDK
et la CLI construisent leurs chemins d'API. Les appels administratifs utilisent
toujours `https://cloud.durable-workflow.com/api/v1`.

L'administration Cloud et le trafic runtime utilisent des identifiants différents :

- Une clé API Cloud (`dwc_...`) gère projets, environnements, espaces de noms,
  facturation et cycle de vie des identifiants runtime.
- Un identifiant runtime client (`dwr_...`) démarre et contrôle les workflows
  d'un espace de noms géré.
- Un identifiant runtime worker (`dwr_...`) inscrit les workers, interroge
  longuement les tâches, envoie les heartbeats et règle le travail dans cet espace.

Une clé API Cloud n'est pas acceptée par l'URL de runtime de l'espace. Les
identifiants runtime sont limités à un espace et un rôle, retournés seulement
à leur création et omis des réponses ultérieures de listage et d'audit.

Si l'intégration Cloud utilise la CLI, installez-la depuis le
[guide CLI](./cli.mdx) et mettez explicitement à jour une installation autonome
existante avec `dw upgrade`. La CLI ne se met jamais à jour en arrière-plan.
Après installation ou mise à niveau, exécutez `command -v dw` et
`dw --version`. Corrigez les problèmes de `PATH` indiqués par l'installateur
avant d'utiliser les identifiants Cloud, pour que le binaire actif soit celui
de la version sélectionnée.

## Provisionner et connecter un espace de noms {#provision-and-connect-a-namespace}

### 1. Créer et provisionner l'espace de noms {#1-create-and-provision-the-namespace}

Dans le [tableau de bord Cloud](https://cloud.durable-workflow.com/), créez une
organisation, un projet, un environnement et un espace de noms, puis
sélectionnez son offre de capacité. Créer un compte ou une définition d'espace
de noms ne provisionne aucune capacité payante. Configurez le paiement avec
Stripe, puis sélectionnez **Provision** sur la page de l'espace de noms.
Ajouter une carte ne démarre pas seul le provisionnement.

Le provisionnement est asynchrone. La page de l'espace met à jour la
progression pendant la préparation du runtime par Cloud. Attendez son
activation avant de lancer le travail SDK. La page permet aussi de créer les
identifiants runtime et d'accéder à Managed Waterline pour inspecter les
workflows et leur historique.

Pour une configuration par API, terminez d'abord la configuration du paiement.
L'exemple utilise l'offre par défaut de l'organisation ;
`capacity_plan_version` permet d'en sélectionner une autre disponible. Ne
fournissez pas votre propre URL Server, identifiant de déploiement ni
enregistrement de placement :

```bash
curl -X POST \
  https://cloud.durable-workflow.com/api/v1/projects/PROJECT/environments/ENVIRONMENT/namespaces \
  -H "Authorization: Bearer dwc_..." \
  -H "Content-Type: application/json" \
  -d '{"name":"orders","retention_days":30}'

curl -X POST \
  https://cloud.durable-workflow.com/api/v1/projects/PROJECT/environments/ENVIRONMENT/namespaces/orders/provision \
  -H "Authorization: Bearer dwc_..."
```

Après provisionnement, la réponse de l'espace fournit sa `runtime_url` stable,
son `runtime_namespace`, son état géré et les informations régionales visibles
par le client. L'URL et l'espace retournés sont une configuration appartenant
à Cloud ; ne déduisez pas de point de terminaison et ne les remplacez pas par
une adresse Server auto-hébergée.

### 2. Émettre des identifiants client et worker séparés {#2-issue-separate-client-and-worker-credentials}

Émettez les deux rôles runtime indépendamment :

```bash
curl -X POST \
  https://cloud.durable-workflow.com/api/v1/projects/PROJECT/environments/ENVIRONMENT/namespaces/orders/runtime-credentials \
  -H "Authorization: Bearer dwc_..." \
  -H "Content-Type: application/json" \
  -d '{"name":"orders-client","role":"client"}'

curl -X POST \
  https://cloud.durable-workflow.com/api/v1/projects/PROJECT/environments/ENVIRONMENT/namespaces/orders/runtime-credentials \
  -H "Authorization: Bearer dwc_..." \
  -H "Content-Type: application/json" \
  -d '{"name":"orders-worker","role":"worker"}'
```

Chaque jeton n'est affiché qu'une fois, dans sa réponse de création.
Conservez-le dans le gestionnaire de secrets utilisé uniquement par le rôle
correspondant. Un processus réunissant volontairement client et worker reçoit
les deux valeurs comme secrets distincts. Faites tourner et révoquez les rôles
indépendamment ; ne substituez jamais de clé API Cloud à un identifiant runtime.

### 3. Terminer un premier workflow Cloud {#cloud-first-workflow}

Le terrain d'essai partagé de runtime externe de Sample App exécute le même
parcours de workflow et d'activité en PHP, Python ou Rust. Ouvrez un
[Codespace Sample App](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main),
exportez les valeurs de l'espace provisionné et les deux identifiants runtime,
puis choisissez une file de tâches applicative :

```bash
export DURABLE_WORKFLOW_RUNTIME_URL='<provisioned-runtime-url>'
export DURABLE_WORKFLOW_NAMESPACE='<provisioned-runtime-namespace>'
export DURABLE_WORKFLOW_CLIENT_TOKEN='<client-runtime-credential>'
export DURABLE_WORKFLOW_WORKER_TOKEN='<worker-runtime-credential>'
export DURABLE_WORKFLOW_TASK_QUEUE='<language-task-queue>'
```

Choisissez ensuite un SDK officiel et exécutez le même contrat de runtime géré :

```bash
language=php # Choose php, python, or rust.
scripts/playground "$language" --runtime managed \
  --runtime-url "$DURABLE_WORKFLOW_RUNTIME_URL" \
  --namespace "$DURABLE_WORKFLOW_NAMESPACE" \
  --task-queue "$DURABLE_WORKFLOW_TASK_QUEUE"
```

Le runner résout les versions stables actuelles des artefacts, ne transmet
chaque identifiant qu'au processus enfant correspondant, attend jusqu'à
60 secondes une inscription worker annonçant la file exacte et les types
générés de workflow et d'activité, puis lance une requête client. Il ne réussit
qu'après retour du résultat attendu par le SDK, annonce de `completed` par
`dw` et présence de l'historique requis du workflow et de l'activité. La
commande n'exécute ni Server ni Waterline local en mode géré.

Pour chaque langage, réexécutez la commande gérée complète ci-dessus en ne
changeant que `language`. Poursuivez avec son guide pour l'écriture propre au SDK :

- [SDK PHP](/docs/polyglot/php/) : définissez `language=php`.
- [SDK Python](/docs/polyglot/python/) : définissez `language=python`.
- [Démarrage rapide Rust avec runtime géré](/docs/polyglot/rust-cloud-quickstart/) :
  définissez `language=rust` et utilisez ses diagnostics de disponibilité du
  worker, de résultat terminé et de discordance.

Un parcours réunissant client et worker détient les deux identifiants runtime
comme secrets distincts. Une clé d'administration Cloud n'est pas un
identifiant runtime et ne doit être exportée dans aucune des deux variables de jeton runtime.

### 4. Poursuivre l'exploitation gérée {#4-continue-with-managed-operation}

Le client SDK démarre les workflows et envoie les commandes ultérieures via
l'URL runtime de l'espace. Les workers clients s'inscrivent et interrogent
longuement la même URL avec le rôle worker. Cloud authentifie et limite chaque
requête, exécute le protocole d'orchestration dans le runtime géré et persiste
l'état et l'historique du workflow.

L'application cliente ne sélectionne pas de déploiement de runtime pour une
opération. Identifiants de workflows et d'exécutions, files de tâches,
marqueurs de compatibilité et encodage Avro restent des contrats applicatifs
durables dans l'espace Cloud.

## Connectivité des workers exécutés par le client {#customer-run-worker-connectivity}

Les workers peuvent s'exécuter dans votre réseau, flotte de VM, plateforme de
conteneurs ou environnement applicatif. Ils nécessitent un accès HTTPS
sortant à l'URL runtime de l'espace et doivent autoriser les longues requêtes
d'interrogation du protocole worker.

- Aucune connexion entrante de Cloud vers un worker n'est nécessaire.
- Les proxys et passerelles de sortie ne doivent pas raccourcir les
  interrogations longues en une boucle de nouvelles tentatives intensive.
- Les workers devraient réessayer les échecs transitoires de connexion et les
  réponses d'indisponibilité avec une attente bornée.
- Déplacer un processus worker ne déplace pas l'état des workflows ; Cloud
  conserve l'état durable et l'historique de l'espace.
- La rotation d'identifiants ne nécessite de changer ni URL runtime, ni
  espace de noms, ni file de tâches.

## Placement régional et frontière de reprise {#region-placement-and-recovery-boundary}

Cloud Dev est disponible avec la frontière de reprise ci-dessous. Les
frontières HA décrivent les offres prévues, encore indisponibles en attente de qualification :

- **Cloud Dev :** un hôte isolé avec état persistant et sauvegardes. Maintenance
  et reprise peuvent interrompre le service. Aucun SLA de disponibilité ni
  basculement régional automatique.
- **HA monorégion prévue :** trois hôtes répliqués dans une région, avec
  basculement automatique du primaire. Un hôte peut tomber sans perte du
  quorum restant. Une panne régionale entière sort du SLA de cette offre.
- **HA multirégion prévue :** trois hôtes répliqués dans trois régions, avec
  basculement automatique du primaire. Le SLA inclut la perte ou l'isolement
  d'une région configurée, si les membres restants peuvent former un quorum.

Pour les profils HA prévus, l'URL runtime stable est destinée à suivre le
primaire élu ; la configuration SDK ne change pas pendant un basculement pris
en charge. Un ancien primaire isolé ne peut plus servir de travail faisant
autorité. Si aucun primaire sûr ne peut être établi, le runtime cesse de
servir plutôt que d'accepter des écritures conflictuelles. HA ne promet pas
des requêtes ininterrompues : clients et workers nécessitent toujours des
nouvelles tentatives bornées pour les échecs transitoires.

La page de l'espace expose topologie, régions et état du service. Les
sauvegardes aident à la reprise mais ne remplacent pas la réplication active.
Les courts tests de basculement démontrent les cas de panne exercés, pas une
garantie universelle de délai de reprise ni la disponibilité atteinte sur un mois.

### Mesure du SLA et crédits {#sla-measurement-and-credits}

Les quatre offres SLA prévues spécifient une disponibilité de 99,99 % sur un
mois civil UTC, mesurée au point de terminaison runtime client par fenêtres
d'une minute. Les mesures absentes comptent comme indisponibles et la
maintenance planifiée n'est pas exclue. La disponibilité des workers hébergés
par le client est distincte de celle du runtime géré.

| Disponibilité mensuelle | Crédit automatique sur le compte |
| --- | ---: |
| Au moins 99,99 % | Aucun |
| Au moins 99,9 %, moins de 99,99 % | 10 % |
| Au moins 99,0 %, moins de 99,9 % | 25 % |
| Moins de 99,0 % | 100 % |

Les offres avec SLA reçoivent automatiquement des crédits de service sur le
compte. Ces crédits ne dépassent jamais les frais du mois pour le runtime
concerné ; les interruptions ne donnent lieu à aucun remboursement en numéraire.
Cloud Dev n’a pas de crédits SLA. Consultez les
[conditions Cloud](https://cloud.durable-workflow.com/terms) et les
[tarifs Cloud](https://cloud.durable-workflow.com/pricing) pour le périmètre de
disponibilité et les conditions de facturation de l’offre.

## Connectivité privée et frontière du support {#private-connectivity-and-support-boundary}

Le contrat Cloud 2.0 en libre-service suppose un accès sortant des clients et
workers à l'URL runtime publique de l'espace. L'entrée exclusivement privée,
les VPN ou interconnexions sur mesure et les routages privés propres aux
fournisseurs sont conçus avec le support, pas des valeurs par défaut cachées.
Les clients ne reçoivent jamais d'adresses internes du runtime et ne sont pas
invités à contourner l'URL de l'espace.

## Cloud ou Server auto-hébergé {#cloud-or-self-hosted-server}

Choisissez Cloud si Durable Workflow doit gérer le runtime d'orchestration,
la persistance, la disponibilité de l'offre choisie, la reprise et Managed
Waterline, tandis que votre équipe gère les clients SDK et workers.

Choisissez [Server auto-hébergé](/docs/polyglot/server) si votre équipe doit
gérer indépendamment l'image Server, la base, le cache, le réseau,
l'authentification, les sauvegardes et le basculement. Un Server auto-hébergé
ne peut pas être enregistré dans Cloud, rattaché à Cloud ni servir de runtime
à un espace Cloud. Laravel embarqué, Server auto-hébergé et Cloud sont des
choix de déploiement distincts.

## Benchmarks de workflow standard {#standard-workflow-benchmarks}

[DW Standard Workflow v1](https://github.com/durable-workflow/server/tree/main/benchmarks/capacity)
définit une petite charge reproductible : un démarrage de workflow, une
activité externe et une finalisation, avec des entrées et résultats Avro
définis de 1 Kio. Le worker client s'exécute hors de l'allocation du runtime géré.

Cloud Dev a été mesuré le 21 septembre 2026 avec la même offre que celle
provisionnée par les clients. Les quatre autres références sont historiques :
elles incluent leur topologie HA répliquée mais précèdent la version actuelle
du runtime. Elles ne sont pas extrapolées de Dev et ne qualifient pas la
capacité des offres SLA actuelles.

| Offre | Workflows standard/seconde | Actions de workflow sur 30 jours | Mesure |
| --- | ---: | ---: | --- |
| Cloud Dev | 0,25 | 1 296 000 | 21 septembre 2026 ; détails ci-dessous |
| Cloud Standard | 0,25 | 1 296 000 | Historique ; nouvelle mesure en attente |
| Cloud Multi-Region | 0,10 | 518 400 | Historique ; nouvelle mesure en attente |
| Cloud Business | 0,50 | 2 592 000 | Historique ; nouvelle mesure en attente |
| Cloud Business Multi-Region | 0,20 | 1 036 800 | Historique ; nouvelle mesure en attente |

L'estimation sur 30 jours est `workflows/second x 2,592,000 seconds x 2 workflow actions` :
un démarrage et une activité pour cette comparaison. Elle suppose ce débit
constant pendant 30 jours. Ce n'est ni un quota d'actions incluses, ni une
unité de facturation, ni une correspondance exacte aux définitions d'actions
d'un autre moteur.

Ce sont des références mesurées de charge, pas un débit maximal ou une
capacité garantie pour toute application. Charges utiles plus grandes,
activités supplémentaires, temporisateurs, signaux, requêtes de lecture,
historiques lourds en relecture, communications interrégions et latence des
workers clients changent le résultat. La table ne revendique pas de benchmarks
distincts de temporisateurs, signaux, relecture ou saturation. Planifiez selon
votre véritable mélange de workflows plutôt qu'en multipliant ces nombres
par une taille arbitraire de workflow.

### Mesure de Cloud Dev {#cloud-dev-capacity}

Cloud Dev est un runtime géré isolé sur hôte unique pour le développement et
l'évaluation. Cette mesure utilisait un runtime Dev provisionné normalement,
sans changer ses paramètres CPU, mémoire, stockage, entrée ou sauvegarde :

| Ressource | Cloud Dev |
| --- | --- |
| Calcul du runtime | 1 vCPU partagé, 1 Go RAM |
| Stockage durable inclus | 5 Go |
| Services du runtime | Server, worker de file, planificateur, MySQL et Redis |
| Managed Waterline | Inclus via l'application Cloud authentifiée ; aucun processus sur l'hôte Dev |
| Chemin réseau | Entrée HTTPS directe propre à l'espace |
| Workers clients | Exécutés dans l'environnement du client |
| Disponibilité | Sans SLA ; interruptions de maintenance autorisées |
| Tarif actuel du runtime | Voir [Offres et tarifs](#plans-and-pricing) |
| Plus de stockage | Demander une offre de runtime supérieure ; aucune extension de stockage |

L'exécution utilisait la [définition PHP publique de DW Standard Workflow v1](https://github.com/durable-workflow/server/blob/68168f34b637a19c054211f4db2df9c616799a86/benchmarks/capacity/v1/bindings/php/capacity_adapter.php) :
un démarrage de workflow, une activité externe d'écho et une finalisation,
avec une chaîne de 1 024 octets en Avro à chaque frontière d'entrée et de
résultat workflow/activité. Server 2.3.12 contenait Workflow 2.0.14 ; le worker
externe et les clients utilisaient le SDK PHP 2.0.11 sur PHP 8.4.25. Le runtime
utilisait PHP 8.3.33 et MySQL 8.0.46.

Un worker PHP utilisait un délai d'interrogation d'une seconde. Deux
emplacements clients indépendants proposaient un workflow toutes les quatre
secondes après un préchauffage distinct de 30 secondes. La fenêtre fixe était
**18:50:30-18:55:30 UTC le 21 septembre 2026**. Seules les finalisations
observées dans ces cinq minutes comptent dans le débit ; le drainage ultérieur
ne peut augmenter le débit déclaré. Chaque résultat, état terminé et
historique ordonné workflow/activité a été vérifié.

| Résultat mesuré | Valeur |
| --- | ---: |
| Débit proposé et terminé | 0,25 workflow standard/seconde |
| Workflows terminés | 75 sur 75 |
| Erreurs / créneaux de démarrage manqués | 0 / 0 |
| Latence du démarrage au résultat, p50 | 2,76 secondes |
| Latence du démarrage au résultat, p95 | 4,18 secondes |
| Latence du démarrage au résultat, p99 | 4,33 secondes |
| Workflows non terminés dans la cohorte mesurée | 0 |
| Actions de workflow sur 30 jours | 1 296 000 |

La latence inclut le réseau du client et l'interrogation des résultats toutes
les 100 ms. Ce n'est pas la latence interne de planification des tâches ; ne
la comparez pas à une métrique interne de planification d'un moteur.

Le CPU hôte était occupé à **63,5 % en moyenne**, avec un maximum de **89 %**
sur les échantillons de cinq secondes. Il n'y a eu **aucun arrêt OOM ni
redémarrage de conteneur**. Les pics mémoire observés étaient de 95,21 Mio
pour Server, 197,1 Mio pour MySQL, 45,84 Mio pour le worker de file, 43,75 Mio
pour le planificateur, 9,49 Mio pour Redis et 34,59 Mio pour le connecteur
d'entrée. Ces pics individuels ne représentent pas une RSS totale simultanée
de l'hôte ; l'OS et les autres processus consomment aussi de la mémoire.
L'hôte conservait sa configuration normale de swap de 1 Gio, dont environ
90 Mio au maximum étaient occupés pendant la mesure. Une sauvegarde chiffrée
initiale avait été vérifiée avant la fenêtre ; aucune capture de sauvegarde
ne la chevauchait.

C'est une référence de développement mesurée, pas une conversion universelle
pour tout workflow, un test de débit maximal, un test prolongé ni un SLA.
Charges plus grandes, activités supplémentaires, temporisateurs, signaux,
requêtes, historiques riches en relecture et latence des workers clients
changent la capacité. La facturation Cloud dépend du temps de runtime
provisionné avec stockage inclus fixe, pas des opérations de workflow.

## API d'usage de facturation {#billing-usage-api}

Cloud Dev utilise une cellule de runtime isolée sur hôte unique par espace
Dev provisionné. Ses conditions de facturation sont :

| Condition de facturation | Cloud Dev |
| --- | ---: |
| Runtime provisionné | 0,075 $ par heure, mesuré à la minute |
| Maximum par mois civil | 50 $ par achat de runtime |
| Minimum par mois actif | 2 $ par achat de runtime dans un mois UTC actif |
| Capacité gérée | 1 vCPU, 1 Go de mémoire, 5 Go de stockage durable |
| Stockage durable supplémentaire | Non vendu séparément ; demander une offre de runtime supérieure |
| Sauvegardes chiffrées de base | Incluses |
| Disponibilité | Hôte unique, sans SLA |

L'allocation couvre Server, MySQL, Redis, la planification, l'accès Waterline,
les sauvegardes, mises à niveau et l'infrastructure exploités par Cloud. Les
workers clients PHP, Python et Rust s'exécutent hors de cette allocation.
Démarrages de workflows, tentatives d'activités, nouvelles tentatives,
temporisateurs, signaux, requêtes, mises à jour et workflows enfants sont une
télémétrie opérationnelle, pas des unités de facturation distinctes. Les prix
excluent les taxes applicables. Le stockage inclus ne crée aucun frais distinct.

Cloud expose l'usage de facturation par organisation pour la finance,
l'exploitation et la refacturation automatisée. Le point est authentifié par
une clé API Cloud et n'accepte aucun identifiant de client ou d'organisation
dans la requête ; l'organisation de l'appelant est déterminée à partir du
jeton Bearer `dwc_` afin qu'un client ne puisse interroger l'usage d'un autre.

```http
GET /api/v1/billing/usage?period_start=2026-05-01&period_end=2026-05-31
Authorization: Bearer dwc_...
Accept: application/json
```

`period_start` et `period_end` sont des dates ISO-8601 facultatives. Sans elles,
Cloud renvoie le mois civil courant. Les lectures et exports d'usage restent
disponibles même si des restrictions de facturation suspendent le
provisionnement ou les opérations workflow, pour permettre aux équipes
financières de régulariser le compte.

Le schéma de réponse est `durable_workflow.cloud.namespace_capacity_usage.v1`.
Il sépare le temps de capacité allouée des compteurs d'événements sémantiques.
Les champs de stockage restent dans le schéma pour la facturation historique ;
ils n'autorisent pas l'achat d'une extension. La réponse Cloud Dev abrégée
ci-dessous indique les conditions de l'offre actuelle.

```json
{
  "schema": "durable_workflow.cloud.namespace_capacity_usage.v1",
  "access_control": {
    "scope": "organization_billing_usage",
    "read_allowed": true,
    "export_allowed": true
  },
  "current_period": {
    "starts_at": "2026-05-01T00:00:00+00:00",
    "ends_at": "2026-05-31T23:59:59+00:00"
  },
  "metering_policy": {
    "invoice_drivers": [
      "namespace_plan_capacity",
      "additional_durable_storage_gb_month"
    ],
    "semantic_events_are_invoice_units": false,
    "network": "measured_not_billable",
    "basic_backups": "included",
    "customer_worker_compute": "excluded"
  },
  "by_namespace": [
    {
      "namespace": "development",
      "project": "sample-app",
      "environment": "development",
      "plan": {
        "version": "cloud-dev.single-host-v2",
        "name": "Cloud Dev",
        "availability_class": "development_single_host",
        "sla_status": "none",
        "billing_terms": {
          "currency": "usd",
          "unit": "provisioned_runtime_hour",
          "hourly_rate_cents": "7.5",
          "monthly_cap_cents": 5000,
          "active_month_minimum_cents": 200,
          "scope": "runtime_purchase",
          "billing_period": "calendar_month_utc",
          "metering_resolution_seconds": 60,
          "additional_storage_unit": "gb_month",
          "additional_storage_rate_cents": 0,
          "additional_storage_available": false,
          "additional_storage_metering_unit": "gb_hour",
          "additional_storage_in_monthly_cap": false
        }
      },
      "allocation": {
        "managed_cpu_vcpu": 1,
        "managed_memory_gb": 1,
        "included_durable_storage_gb": 5
      },
      "operational_telemetry": {
        "billing_status": "not_billable",
        "counters": {
          "workflow_execution_count": 20,
          "activity_execution_count": 40,
          "timer_fire_count": 5,
          "signal_delivery_count": 3,
          "update_delivery_count": 0,
          "query_task_count": 2
        }
      }
    }
  ]
}
```

Le compteur de temps Cloud Dev démarre à l'activation du runtime isolé et
s'arrête à son déprovisionnement. Le plafond et le minimum mensuels
s'appliquent par achat de runtime et mois civil UTC. Le stockage ne croît pas
et ne devient pas facturable automatiquement. Cloud préserve une réserve
d'exploitation et de reprise sur le disque du runtime ; demandez une offre
supérieure avant d'atteindre l'allocation incluse.

Les runtimes inactifs engendrent toujours des frais de capacité. Le
déprovisionnement arrête la facturation et supprime les données actives et
identifiants du runtime ; ce n'est pas une pause réversible. Les SLA prévus
suivent le même modèle de temps provisionné avec leurs propres tarifs,
minimums et plafonds. Interprétez l'usage avec les `billing_terms` retournés
par l'offre ; les factures historiques conservent leurs conditions acceptées.

Avant de déprovisionner, suivez [déplacer les charges entre runtimes](/docs/polyglot/runtime-migration/#preserve-evidence) : conservez des preuves vérifiées d’historique et de payloads et confirmez que toutes les exécutions de la source sont terminales. La facturation de capacité continue tant que la source reste provisionnée.

Exportez ces mêmes éléments en CSV ou rapport JSON si un système financier
aval nécessite un fichier :

```bash
curl -OJ "https://cloud.durable-workflow.com/api/v1/billing/usage/export?period_start=2026-05-01&period_end=2026-05-31" \
  -H "Authorization: Bearer dwc_..."

curl -OJ "https://cloud.durable-workflow.com/api/v1/billing/usage/report?period_start=2026-05-01&period_end=2026-05-31" \
  -H "Authorization: Bearer dwc_..."
```

Pour un panneau de tableau de bord fondé sur JSON, interrogez la même API avec
sa plage temporelle :

```text
GET https://cloud.durable-workflow.com/api/v1/billing/usage?period_start=${__from:date:YYYY-MM-DD}&period_end=${__to:date:YYYY-MM-DD}
Authorization: Bearer dwc_...
```

Puis aplatissez les lignes de capacité des espaces de noms avec :

```jq
.by_namespace[]
| {
    project,
    environment,
    namespace,
    plan: .plan.name,
    cpu_vcpu: .allocation.managed_cpu_vcpu,
    memory_gb: .allocation.managed_memory_gb,
    included_storage_gb: .allocation.included_durable_storage_gb,
    capacity_status
  }
```

Utilisez `invoice_units` pour rapprocher la capacité et le stockage. Utilisez
`operational_telemetry` pour comprendre la forme de la charge et le
comportement des benchmarks ; ne convertissez pas ces compteurs d'événements en frais.

## Références associées {#related-references}

- [Modes de déploiement](/docs/polyglot/deployment-modes)
- [SDK PHP](/docs/polyglot/php)
- [SDK Python](/docs/polyglot/python)
- [SDK Rust](/docs/polyglot/rust)
- [Server](/docs/polyglot/server)
- [Déploiements auto-hébergés](/docs/deployment)
- [Assistance](/docs/support)
