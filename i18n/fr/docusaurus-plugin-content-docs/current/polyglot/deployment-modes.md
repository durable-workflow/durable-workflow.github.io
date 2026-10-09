---
sidebar_position: 2
title: Modes de déploiement
description: Choisissez le mode service avec Durable Workflow Cloud ou un Server auto-hébergé, ou intégrez le runtime à Laravel.
tags:
  - deployment
  - server
  - laravel
  - polyglot
keywords:
  - modes de déploiement Durable Workflow
  - mode intégré
  - mode service
  - Durable Workflow Cloud
  - serveur autonome
  - Cloud ou auto-hébergement
---

import ProductPromotion from '@site/src/components/ProductPromotion';

# Modes de déploiement {#deployment-modes}

<ProductPromotion source="docs-v2-deployment-modes">
Choisissez le mode service géré pour vos workers PHP, Python ou Rust sans
exploiter vous-même le runtime d’orchestration.
</ProductPromotion>

Durable Workflow v2 propose deux modes de déploiement :

- **Mode service :** les applications et les workers utilisent les SDK pour se
  connecter à un runtime distant. Choisissez
  [Durable Workflow Cloud](/docs/polyglot/cloud-control-plane/) ou un
  [Server auto-hébergé](/docs/polyglot/server/).
- **Mode intégré :** une application Laravel installe
  `durable-workflow/workflow` et prend directement en charge le runtime.

Cloud et Server auto-hébergé sont deux choix de runtime en mode service, pas
des composants à déployer ensemble. Avec Cloud, Durable Workflow exploite
l’orchestration et la persistance, tandis que les clients exécutent leurs
clients SDK et leurs workers. Cloud inclut Managed Waterline. **Les clients
Cloud n’installent, ne déploient et ne raccordent pas leur propre Server ou
service Waterline.** Un Server auto-hébergé n’inclut pas Waterline.
Les opérateurs peuvent déployer Waterline séparément pour observer un espace
de noms dont Server est responsable.

Cette page vous aide à choisir le déploiement qui prendra en charge vos
workflows, à préparer une transition ou à identifier les contrats qui restent
identiques dans les deux modes.

Pour les équipes Laravel, le
[guide d’adoption et de transition du runtime](/docs/laravel-adoption/)
décrit les passages de v1 à v2 et du mode intégré au mode service, y compris
le pont Laravel du SDK PHP publié et son fake pour les tests Laravel.

## Choisir un runtime en mode service {#choose-a-service-mode-runtime}

| Choix du runtime | Responsable de l’état durable | Ce que votre équipe exécute | Point de départ |
| --- | --- | --- | --- |
| Durable Workflow Cloud | Durable Workflow exploite le runtime de l’espace de noms géré, la persistance, les mises à niveau, le point d’accès au service et Managed Waterline. | Des clients applicatifs et des workers PHP, Python ou Rust utilisant les identifiants fournis. N’exécutez pas Server ni un service Waterline séparé. | [Runtime géré Cloud](/docs/polyglot/cloud-control-plane/) |
| Server auto-hébergé | Votre équipe déploie, sécurise, dimensionne, sauvegarde et met à niveau Server et sa persistance. | Server, les clients applicatifs et les workers PHP, Python ou Rust. Si nécessaire, déployez Waterline séparément pour l’espace de noms géré par Server. | [Server auto-hébergé](/docs/polyglot/server/) |

Les deux choix utilisent le même modèle de clients et de workers.
L’exploitation du runtime et les identifiants changent, pas la manière
d’écrire les workflows.

## Un même modèle durable, des frontières différentes {#same-durable-model-different-boundary}

Le mode intégré et le mode service utilisent un seul noyau v2.
L’hébergement, l’authentification et les frontières de transport changent.
En mode service, le même noyau est exposé par les interfaces HTTP+JSON du plan
de contrôle et des workers. gRPC n’est pas obligatoire et il n’y a pas de
second moteur.

| Interface | Mode intégré | Mode service | Contrat commun aux deux modes |
| --- | --- | --- | --- |
| Modèle durable des workflows | Une application Laravel héberge directement le package et écrit l’état des workflows dans son runtime. | Cloud ou un Server auto-hébergé gère l’état des workflows derrière l’API du service. | Les identifiants de workflow et d’exécution, l’historique typé, les résultats des commandes, les nouvelles tentatives, les règles de réparation et l’export de l’historique suivent le même contrat v2. |
| Plan de contrôle | Les démarrages et les commandes proviennent du code applicatif, de `WorkflowStub` ou d’outils opérateur propres à l’application. | Les démarrages et les commandes passent par l’API Server, la CLI ou les SDK sur HTTP+JSON, avec une authentification et des en-têtes de protocole explicites. Les clients PHP indépendants des frameworks utilisent `DurableWorkflow\Client` du package `durable-workflow/sdk`. | La politique des démarrages en double, le ciblage d’une exécution, les identifiants de commande et les résultats nommés restent identiques. Envoyez les commandes suivantes au runtime qui a accepté le démarrage. |
| Transport des workers | Les workers des files Laravel exécutent les tâches de workflow et d’activité dans le déploiement de l’application. | Les workers s’enregistrent, attendent les tâches par long polling, envoient des heartbeats et terminent les tâches via le protocole HTTP+JSON. Les workers PHP distants utilisent `DurableWorkflow\Worker` du package `durable-workflow/sdk`. | Les baux des tâches, les marqueurs de compatibilité, les règles de relecture et l’exécution des activités au moins une fois restent identiques. |
| Distribution des tâches par défaut | Les tâches sont normalement envoyées à la file Laravel depuis le processus applicatif. | Le runtime du service utilise une distribution par polling pour que les workers externes découvrent les tâches sur HTTP. Les opérateurs d’un Server auto-hébergé peuvent explicitement modifier ce comportement par défaut. | Le cycle prêt/attribué/réparé et le modèle durable des tâches restent identiques. |
| Clés de type des workflows et activités | Les alias PHP peuvent désigner des classes locales de l’application. | Les workers déclarent les clés de type prises en charge lors de leur enregistrement. | Les clés publiques doivent rester stables et indépendantes du langage. Ne faites pas des noms de classes PHP entièrement qualifiés, ni de leurs classes PHP de substitution, le contrat public. |
| Interface opérateur | Le package Waterline intégré ou les outils de l’application lisent l’état durable Laravel dans le même processus. | Cloud fournit Managed Waterline pour son espace de noms. Les opérateurs auto-hébergés peuvent déployer Waterline séparément pour un espace de noms géré par Server. Les API, la CLI et les SDK lisent aussi l’état géré par le runtime. | Les attributs de recherche, les memos, l’état des exécutions, les diagnostics des files et les exports d’historique sont des faits durables du runtime responsable de l’exécution. Waterline ne fusionne pas des runtimes ou des espaces de noms. |
| Authentification et isolation | L’authentification est celle que l’application Laravel expose pour ses routes et sessions. | La sélection de l’espace de noms et les jetons d’authentification ou signatures Server sont des frontières obligatoires de l’API. | Les noms des espaces de noms, les files de tâches, les marqueurs de compatibilité et le contrat fixe des données Avro doivent rester stables pendant la transition. |
| Découverte du runtime | L’application résout les services dans son processus ou via sa configuration locale. | Les clients et les workers doivent cibler explicitement une URL distante. | Ne liez pas ces modes à un `APP_URL` ou `APP_KEY` partagé, à des hypothèses sur localhost ou à une découverte dans le même conteneur. |
| Frontière de migration | Les exécutions intégrées existantes continuent là où elles ont démarré. | Les nouvelles exécutions gérées par le service démarrent dans le runtime Cloud ou auto-hébergé choisi et y restent. | Il n’y a pas de migration automatique à chaud des exécutions en cours entre les modes. L’export sert à l’audit et au diagnostic, pas à importer un état actif. |

## Quand choisir le mode intégré {#choose-embedded-mode-when}

- Votre application Laravel prend en charge l’écriture des workflows,
  l’exécution des workers et l’accès opérateur dans un seul déploiement.
- Ses files et son authentification offrent les frontières adaptées aux
  opérations sur les workflows.
- Vous voulez un runtime autonome minimal et n’avez pas besoin d’un protocole
  de workers indépendant du langage.
- Vos opérateurs peuvent utiliser Waterline ou les outils de l’application
  comme interface principale.

Commencez par l’[installation intégrée](/docs/installation/) et la
[documentation du mode intégré](/docs/category/embedded/), notamment son
groupe Configuration.

## Quand choisir le mode service {#choose-service-mode-when}

- Plusieurs applications ou équipes doivent partager un runtime de workflows.
- Les workers, les clients du plan de contrôle ou les opérateurs n’utilisent
  pas tous Laravel/PHP.
- Vous avez besoin de frontières explicites d’authentification distante et
  d’espace de noms entre les clients et le moteur.
- Vous voulez dimensionner séparément les entrées API, l’affectation et la
  distribution des tâches, et les workers dans la
  [topologie de rôles Server prise en charge](/docs/polyglot/server-role-topology).
- Avec Server auto-hébergé, vous voulez déployer Waterline comme observateur
  d’un espace de noms géré par Server. Cloud inclut Managed Waterline.

Pour un runtime géré, commencez par
[Durable Workflow Cloud](/docs/polyglot/cloud-control-plane/).
Pour l’auto-hébergement, commencez par [Server](/docs/polyglot/server/) et les
[déploiements auto-hébergés](/docs/deployment/), puis choisissez le
[SDK PHP](/docs/polyglot/php/), le
[SDK Python](/docs/polyglot/python/) ou le
[SDK Rust](/docs/polyglot/rust/).
Les utilisateurs Cloud disposent de Managed Waterline.
Les opérateurs auto-hébergés peuvent consulter la
[référence de l’API Server](/docs/polyglot/server-api-reference/) et la
[supervision](/docs/monitoring#waterline-service) pour déployer un service
Waterline séparé.

## Outils de migration vers un service auto-hébergé {#migration-tooling-to-self-hosted-service-mode}

Le passage du mode intégré au mode service se fait par adoption progressive,
sans transfert à chaud de l’état en cours :

- Suivez la [migration du mode intégré vers Server](/docs/polyglot/embedded-to-server)
  pour préparer la transition étape par étape.
- Utilisez `GET /api/cluster/info` pour vérifier la version, la topologie et
  les capacités du Server cible avant de rediriger le trafic.
- Utilisez `POST /api/worker/register` et le protocole des workers pour
  vérifier que les workers externes servent les clés de type stables choisies.
- Utilisez `GET /api/system/operator-metrics`, `dw worker:list` ou les vues
  opérateur Waterline pour vérifier l’enregistrement et la compatibilité du
  parc de workers avant de déplacer le trafic de production.
- Consultez les [capacités des clients et workers](/docs/polyglot/cli-python-parity/)
  pour remplacer les appels locaux au plan de contrôle par une automatisation
  reposant sur Server.
- Utilisez Managed Waterline dans Cloud, le Waterline associé à un runtime
  auto-hébergé ou l’export d’historique natif de Server pour l’audit et le
  diagnostic. Les exports ne permettent pas d’importer des exécutions actives
  gérées par Server.

Trois règles de migration sont impératives :

1. Les exécutions existantes restent sur le runtime où elles ont démarré.
2. Dès la première transition, les nouvelles exécutions gérées par Server
   utilisent des clés de type, des noms d’espaces de noms et des files de tâches
   stables, ainsi que le contrat fixe des données Avro.
3. Les signaux, requêtes de lecture, mises à jour, réparations, annulations,
   terminaisons et archivages doivent cibler le runtime responsable de
   l’exécution concernée.

## Références associées {#related-references}

- [Installation](/docs/installation)
- [Server](/docs/polyglot/server)
- [SDK PHP](/docs/polyglot/php)
- [Runtime géré Cloud](/docs/polyglot/cloud-control-plane)
- [Migration du mode intégré vers Server](/docs/polyglot/embedded-to-server)
- [Topologie de rôles Server](/docs/polyglot/server-role-topology)
- [Référence de configuration Server](/docs/polyglot/server-config-reference)
