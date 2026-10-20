---
sidebar_position: 4
title: Espaces de noms, authentification et inscription des workers
description: Référence des contrats de résolution des espaces de noms du serveur, d'authentification par rôle et d'inscription des workers.
tags:
  - server
  - namespaces
  - authentication
  - worker-protocol
keywords:
  - authentification des espaces de noms Durable Workflow
  - jetons serveur par rôle
  - contrat d'inscription des workers
  - X-Namespace
---

# Espaces de noms, authentification et inscription des workers {#namespace-auth-and-worker-registration}

Utilisez cette référence pour provisionner un serveur autonome, émettre des
identifiants d'automatisation ou implémenter un runtime worker. Le serveur
possède trois contrats distincts qui doivent concorder avant tout traitement :

- la requête désigne un espace de noms via `X-Namespace`, `?namespace=` ou
  l'espace de noms par défaut du serveur ;
- l'identifiant possède le rôle requis par la famille de routes ;
- les workers inscrivent les mêmes espace de noms, file de tâches, runtime,
  clés de types et capacité que ceux des démarrages de workflows et
  interrogations de tâches.

## Autorité de la requête {#request-authority}

Durable Workflow considère l'espace de noms, le rôle d'authentification et la
version du protocole comme l'autorité de la requête. Ne les déduisez pas des
identifiants de workflows ou de tâches, ni des libellés d'affichage.

| Famille de requêtes | Rôle requis de l'identifiant | En-tête de version requis | Source de l'espace de noms |
| --- | --- | --- | --- |
| Découverte `GET /api/cluster/info` | `worker`, `operator` ou `admin` | aucun | `X-Namespace` facultatif pour le contexte |
| Listage/description des espaces de noms | `operator` ou `admin` | `X-Durable-Workflow-Control-Plane-Version: 2` | cible de la route ou contexte de la requête |
| Création/mise à jour/politique de stockage des espaces de noms | `admin` | `X-Durable-Workflow-Control-Plane-Version: 2` | cible de la route ou corps de la requête |
| Visibilité des workflows, planifications, files de tâches, adaptateurs de passerelle et workers | `operator` ou `admin` | `X-Durable-Workflow-Control-Plane-Version: 2` | `X-Namespace`, `?namespace=`, puis valeur par défaut |
| Santé système, métriques, passes et tests de stockage | `admin` | `X-Durable-Workflow-Control-Plane-Version: 2` | `X-Namespace`, `?namespace=`, puis valeur par défaut |
| Inscription, interrogation, heartbeats et finalisation des workers | `worker` | `X-Durable-Workflow-Protocol-Version: 1.0` | `X-Namespace`, `?namespace=`, puis valeur par défaut |

Pour les points de terminaison protégés par rôle, le serveur vérifie le rôle
de la route avant l'existence de l'espace de noms. Un jeton de mauvais rôle
reçoit un échec d'authentification, sans indication d'existence de l'espace de
noms. Une fois le rôle et la version validés, les routes limitées à un espace
de noms rejettent les espaces inconnus avec `reason: "namespace_not_found"`.

## Rôles d'authentification {#auth-roles}

L'authentification par jeton est le chemin par défaut en production :

```bash
DW_AUTH_DRIVER=token
DW_WORKER_TOKEN=worker-secret
DW_OPERATOR_TOKEN=operator-secret
DW_ADMIN_TOKEN=admin-secret
```

Si un déploiement utilise un seul `DW_AUTH_TOKEN` partagé, ce jeton possède en
pratique toutes les permissions de routes. Préférez des jetons limités par
rôle en production pour qu'un processus worker ne puisse pas modifier les
espaces de noms ni exécuter les passes de maintenance système.

La même séparation des rôles existe pour l'authentification par signature :

```bash
DW_AUTH_DRIVER=signature
DW_WORKER_SIGNATURE_KEY=worker-signature-secret
DW_OPERATOR_SIGNATURE_KEY=operator-signature-secret
DW_ADMIN_SIGNATURE_KEY=admin-signature-secret
```

`DW_AUTH_DRIVER=none` est réservé au développement local. Il supprime la
frontière d'authentification de toutes les routes et ne doit jamais être
exposé hors d'un réseau local de confiance.

## Autorisation et attribution des signaux {#signal-authorization-and-attribution}

Avant d'admettre un signal, Server authentifie la requête et applique la
politique configurée de rôle et d'espace de noms. Les routes de signaux de
workflow exigent un identifiant `operator` ou `admin`. Ces permissions de
routes n'implémentent pas la politique d'approbation des commandes de votre
application. Appliquez cette décision métier dans une passerelle applicative
de confiance avant de transmettre le signal, ou dans votre fournisseur
d'authentification personnalisé pris en charge. Gardez les identifiants
privilégiés de Server dans cette frontière de confiance si les utilisateurs
finaux ne doivent pas envoyer directement de signaux.

Server déduit le `principal` d'une commande de l'identifiant authentifié.
Un argument de signal comme `approvedBy` reste une donnée applicative même
s'il porte le même nom qu'un sujet d'acteur. Une passerelle utilisant un jeton
de service unique enregistre le principal de ce service, pas nécessairement
l'humain à l'origine de sa requête. Déduisez les champs d'approbation humaine
de l'utilisateur authentifié et de la décision d'autorisation de la passerelle
plutôt que d'accepter leur valeur du client.

Pour l'audit, les réponses de commandes et les métadonnées liées des commandes
et de l'historique exposent le principal enregistré. La commande persistée le
stocke dans `context.principal`, distinct des arguments du signal et de la
valeur renvoyée par l'attente d'un signal nommé dans le workflow. L'absence de
métadonnées de principal ne prouve pas l'identité d'un expéditeur. Consultez
l'[exemple de signal embarqué](/docs/features/signals#sender-identity-and-authorization)
pour un contrôle de politique Laravel et le contexte de commande côté hôte.

Utilisez des [jetons de principal nommé](/docs/polyglot/server-config-reference#authentication)
si les pistes d'audit nécessitent des sujets d'acteur stables. Un jeton de rôle
partagé n'identifie pas un utilisateur applicatif individuel, et le mode de
développement sans authentification ne fournit aucune identité humaine
authentifiée. Les en-têtes transmis d'attribution de l'appelant/authentification
peuvent ajouter des étiquettes d'audit configurées ; ils ne fournissent pas le
principal authentifié par Server. Gardez l'attribution transmise désactivée
tant que les [exigences de passerelle de confiance](/docs/polyglot/server-config-reference#command-attribution)
ne sont pas satisfaites.

## Contrat des espaces de noms {#namespace-contract}

Le processus d'initialisation crée l'espace de noms par défaut. Définissez
`DW_DEFAULT_NAMESPACE` si l'absence d'en-tête d'espace de noms doit conduire
ailleurs que vers `default` :

```bash
DW_DEFAULT_NAMESPACE=default
```

Créez chaque espace de noms de locataire ou d'environnement avant d'y diriger
des clients ou des workers :

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/namespaces" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "orders-prod",
    "description": "production order workflows",
    "retention_days": 90
  }'
```

Les noms d'espaces de noms sont normalisés en minuscules et peuvent contenir
des lettres, chiffres, points, tirets bas et tirets. Ils sont uniques après
normalisation. Créer `Production` puis `production` provoque par exemple un
conflit avec `reason: "namespace_already_exists"`.

Un démarrage normal de workflow désigne l'espace de noms par `X-Namespace` :

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/workflows" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_type": "orders.fulfillment",
    "workflow_id": "order-1001",
    "task_queue": "orders",
    "input": ["order-1001"]
  }'
```

Les lectures du plan de contrôle, commandes de workflow, opérations de
planification et d'attributs de recherche, ainsi que la visibilité des files
et workers utilisent le même contexte d'espace de noms. Les routes
d'administration des espaces de noms font exception : elles ciblent l'espace
dans la route ou le corps de la requête et n'exigent pas son existence
préalable pour exécuter une création ou une description.

## Contrat d'inscription des workers {#worker-registration-contract}

Chaque processus worker doit s'inscrire avant toute interrogation.
L'inscription est propre à l'espace de noms, donc le tuple
`(namespace, worker_id)` identifie l'enregistrement du worker. La `task_queue`
inscrite doit correspondre aux futures interrogations de cet identifiant worker.

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/worker/register" \
  -H "Authorization: Bearer $DW_WORKER_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Protocol-Version: 1.0" \
  -H "Content-Type: application/json" \
  -d '{
    "worker_id": "py-orders-1",
    "task_queue": "orders",
    "runtime": "python",
    "sdk_version": "<installed-sdk-version>",
    "build_id": "orders-worker-2026-04-22",
    "supported_workflow_types": ["orders.fulfillment"],
    "workflow_definition_fingerprints": {
      "orders.fulfillment": "sha256:definition-fingerprint"
    },
    "supported_activity_types": ["payments.capture"],
    "max_concurrent_workflow_tasks": 10,
    "max_concurrent_activity_tasks": 50
  }'
```

| Champ | Obligatoire | Contrat |
| --- | --- | --- |
| `worker_id` | non | Identité stable du processus. Le serveur en génère une si elle est omise, mais les runtimes de longue durée devraient la définir pour les journaux et diagnostics des files. |
| `task_queue` | oui | File interrogée par ce worker. Les interrogations d'une autre file échouent avec `reason: "task_queue_mismatch"`. |
| `runtime` | oui | Parmi `php`, `python`, `rust`, `typescript`, `go`, `java` ou `external`. L'acceptation d'un identifiant de runtime n'implique pas la disponibilité d'un SDK officiel. |
| `sdk_version` | non | Version du SDK du runtime affichée dans la visibilité des workers et les diagnostics. |
| `build_id` | non | Identité de déploiement/build utilisée par la visibilité build-id des files et les cohortes de déploiement. Elle doit rester stable pour une famille de workers compatible avec la relecture. |
| `supported_workflow_types` | non | Clés de types de workflows que ce worker sait relire. Vide signifie aucun filtre de types de workflows. |
| `workflow_definition_fingerprints` | non | Empreintes déterministes des définitions par workflow. Une réinscription active avec une empreinte différente est rejetée. |
| `supported_activity_types` | non | Clés de types d'activités que ce worker sait exécuter. Vide signifie aucun filtre de types d'activités. |
| `max_concurrent_workflow_tasks` | non | Emplacements locaux de tâches de workflow annoncés. Valeur par défaut `100` ; minimum `1`. |
| `max_concurrent_activity_tasks` | non | Emplacements locaux de tâches d'activité annoncés. Valeur par défaut `100` ; minimum `1`. |

Une réinscription active avec le même identifiant worker est autorisée si les
empreintes de définitions annoncées sont inchangées. Si un worker en marche
modifie le code d'un workflow pour un type déjà annoncé, il doit redémarrer
avec un nouveau `worker_id` ; sinon, l'inscription échoue avec
`reason: "workflow_definition_changed"`.

`build_id` n'est pas une simple métadonnée décorative. C'est l'identité de
cohorte présentée à l'opérateur par les API de déploiement des files. Conservez
le même `build_id` pour les workers capables de relire sans risque le même
travail en cours, et changez-le lorsqu'un déploiement crée une nouvelle
famille de compatibilité. Consultez [Compatibilité et routage des workers](/docs/polyglot/worker-compatibility-routing)
pour le contrat d'affectation et de retour arrière, et
[Déploiement des build-id de workers](/docs/polyglot/worker-build-id-rollout)
pour le déroulement du drainage et de la réactivation.

## Interrogation et visibilité {#polling-and-visibility}

Les interrogations des workers doivent utiliser les mêmes espace de noms,
identifiant worker et file de tâches qu'à l'inscription :

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/worker/workflow-tasks/poll" \
  -H "Authorization: Bearer $DW_WORKER_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Protocol-Version: 1.0" \
  -H "Content-Type: application/json" \
  -d '{
    "worker_id": "py-orders-1",
    "task_queue": "orders",
    "timeout_seconds": 30
  }'
```

Les opérateurs peuvent inspecter le même état d'inscription par la visibilité
du plan de contrôle :

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/task-queues/orders" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" | jq '.pollers, .admission'
```

La visibilité des files est le premier endroit à examiner lorsque les workers
ne reçoivent aucune tâche. Elle distingue l'absence de workers des mauvaises
files, filtres de types workflow/activité non pris en charge, emplacements
saturés, plafonds serveur de baux actifs, plafonds de débit de distribution et
contre-pression des tâches de requête de lecture.

Les réponses d'interrogation exposent elles-mêmes ce résultat lisible par
machine via `poll_status` lorsque le serveur annonce
`worker_protocol.server_capabilities.poll_status = true` dans
`GET /api/cluster/info`. Les routes d'interrogation des tâches de workflow,
d'activité et de requête conservent ce champ même si `task` vaut `null`, pour
que les runtimes worker puissent s'appuyer sur une interface stable :

- `leased` : une tâche a été louée avec succès.
- `empty` : aucune tâche n'était prête avant le retour de l'interrogation.
- `throttled` : les limites d'admission de la file ont retenu une nouvelle tâche pour cette interrogation.
- `unavailable` : le serveur n'a pas pu coordonner la file en toute sécurité
  et a renvoyé un résultat typé d'indisponibilité plutôt que de prétendre la file vide.
- `draining` : la cohorte build-id du worker est en drainage ; l'interrogation
  échoue donc avec HTTP `409` et `reason: "worker_draining"` jusqu'à sa réactivation.

## Interface d'erreur {#error-surface}

L'automatisation devrait se baser sur les motifs nommés plutôt que sur les messages rédigés.

| Motif | Emplacement | Signification | Action de l'opérateur |
| --- | --- | --- | --- |
| `missing_control_plane_version` | route du plan de contrôle | La requête omet `X-Durable-Workflow-Control-Plane-Version: 2`. | Ajouter l'en-tête de version ou mettre à niveau le profil client. |
| `missing_protocol_version` | route worker | La requête omet `X-Durable-Workflow-Protocol-Version: 1.0`. | Corriger le client worker ou la négociation de version du SDK. |
| `namespace_not_found` | route d'un espace de noms | L'espace de noms issu de `X-Namespace`, de la chaîne de requête ou de la valeur serveur par défaut n'existe pas. | Créer l'espace de noms ou corriger celui du client. |
| `namespace_already_exists` | `POST /api/namespaces` | Un nom normalisé d'espace de noms existe déjà. | Le réutiliser ou choisir un nom distinct. |
| `task_queue_mismatch` | route d'interrogation worker | Un identifiant worker inscrit pour une file a tenté d'en interroger une autre. | Redémarrer avec un nouvel identifiant worker ou interroger la file inscrite. |
| `worker_draining` | route d'interrogation worker | La cohorte build-id du worker est marquée en drainage ; il peut terminer le travail en cours mais pas prendre de nouvelles tâches. | Réactiver la cohorte pour un retour arrière ou arrêter le worker une fois ses baux actuels drainés. |
| `workflow_definition_changed` | `POST /api/worker/register` | Un identifiant worker actif a tenté d'annoncer des empreintes de workflow modifiées. | Redémarrer le processus modifié avec un nouvel identifiant worker. |
| `validation_failed` | toute route JSON | Un champ manque, est mal formé, trop grand ou hors des limites permises. | Lire `errors` ou `validation_errors` et corriger la charge utile. |

## Voir aussi {#see-also}

- [Référence de l'API Server](/docs/polyglot/server-api-reference)
- [Protocole worker](/docs/polyglot/worker-protocol)
- [Admission des files de tâches](/docs/polyglot/task-queue-admission)
- [Référence des commandes CLI](/docs/polyglot/cli-reference)
