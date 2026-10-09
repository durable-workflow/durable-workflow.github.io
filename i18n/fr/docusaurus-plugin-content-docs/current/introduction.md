---
sidebar_position: 1
description: Choisissez Durable Workflow Cloud, un Server auto-hébergé ou le mode intégré à Laravel, puis terminez un premier workflow avec un SDK officiel.
tags:
  - concepts
  - getting-started
  - workflows
keywords:
  - durable workflow
  - moteur de workflows multilangage
  - moteur de workflows pour agents IA
  - orchestration durable
  - concepts des workflows v2
---

import PythonPackageReleaseLink from '@site/src/components/PythonPackageReleaseLink';

# Introduction {#introduction}

Durable Workflow 2.0 conserve l’état et l’historique des workflows en dehors des processus applicatifs de courte durée. Les workers PHP, Python et Rust peuvent ainsi reprendre leur travail après un redémarrage. Pour une première visite, commencez par le [démarrage rapide](/docs/quickstart/) : vous obtiendrez un workflow `completed` avant de consulter l’[index des fonctionnalités](/docs/capabilities/).

## Choisir un modèle de déploiement {#choose-a-deployment-model}

### Mode service {#service-mode}

Les applications utilisent un runtime durable distant à travers les SDK officiels. Choisissez qui l’exploite :

- **[Durable Workflow Cloud](/docs/polyglot/cloud-control-plane/)** est l’option gérée. Durable Workflow exploite l’orchestration, le stockage persistant et Managed Waterline. Votre équipe exécute les clients SDK et les workers dans l’espace de noms provisionné. **Les utilisateurs de Cloud n’installent pas Server et n’exécutent pas un service Waterline séparé.**
- **[Server auto-hébergé](/docs/polyglot/server/)** offre la même frontière de service. Votre équipe déploie, sécurise, dimensionne, sauvegarde et met à jour le runtime. Vous pouvez déployer Waterline séparément pour observer l’espace de noms géré par Server.

Les deux options exposent le même plan de contrôle HTTP+JSON versionné, le même protocole worker, le même modèle d’espaces de noms et une enveloppe de données indépendante du langage. Les [modes de déploiement](/docs/polyglot/deployment-modes/) précisent les responsabilités de chacun.

### Mode intégré à Laravel {#embedded-laravel}

Le mode intégré convient à une application Laravel qui souhaite garder l’état des workflows, les files, la configuration et les outils d’exploitation dans sa propre infrastructure. Elle installe `durable-workflow/workflow`, sans connexion à Cloud ni Server séparé. Le package Waterline intégré lit directement l’état géré par cette application.

Commencez par l’[installation intégrée](/docs/installation/) si vous souhaitez que votre application possède et exploite le runtime.

Les équipes Laravel qui passent de la version stable v1 à v2, ou qui réévaluent leur déploiement intégré 2.0, peuvent comparer les parcours exécutables intégré et PHP SDK dans le [guide d’adoption Laravel et de transition du runtime](/docs/laravel-adoption/) avant de modifier le trafic.

## Choisir un SDK pour le mode service {#choose-a-service-mode-sdk}

- **[SDK PHP](/docs/polyglot/php/) :** installez `durable-workflow/sdk` dans une application PHP indépendante du framework ou dans un worker distant.
- **[SDK Python](/docs/polyglot/python/) :** définissez des workflows et des activités déterministes et utilisez le client asynchrone du plan de contrôle. La <PythonPackageReleaseLink authority="qualified">version stable du SDK Python</PythonPackageReleaseLink> figure dans le même manifeste de versions stables que le démarrage rapide de Server.
- **[SDK Rust](/docs/polyglot/rust/) :** définissez des workflows et des activités déterministes et exécutez des services workers natifs.

Les trois sont des implémentations officielles de la même frontière de service publique. Le guide des [fonctionnalités des clients et workers](/docs/polyglot/cli-python-parity/) précise les fonctions prises en charge et les différences intentionnelles.

## Terminer un premier workflow {#your-first-completed-workflow}

Le [démarrage rapide](/docs/quickstart/) indique dès le début l’objectif, le choix du runtime, les prérequis, la durée et le résultat attendu. PHP, Python et Rust disposent chacun d’un parcours exécutable. Un seul langage est affiché à la fois.

Le parcours local auto-hébergé utilise des packages et des images publiés, sans récupérer le code source du produit. Le parcours Cloud utilise les informations de connexion d’un espace de noms géré, sans exécuter Server.

## Les éléments du mode service {#how-service-mode-fits-together}

Un déploiement en mode service comporte trois éléments :

- **Le runtime** gère l’état durable, l’enregistrement des commandes et de l’historique, l’appariement des tâches, les temporisateurs, les planifications, les espaces de noms et les protocoles authentifiés. Cloud l’exploite pour les espaces de noms gérés. Votre équipe l’exploite en auto-hébergement.
- **Les workers applicatifs** exécutent le code des workflows et des activités avec les SDK PHP, Python ou Rust. Ils peuvent être déployés avec l’application ou comme services indépendants, et dimensionnés séparément du runtime.
- **Les clients et outils d’exploitation** démarrent, inspectent et commandent le même état géré par le runtime, avec les clients SDK, la CLI `dw`, les API HTTP, les schémas lisibles par machine, Waterline et les interfaces pour agents.

## Un contrat public d’exécution durable {#one-public-durable-execution-contract}

Les SDK officiels partagent des noms de types de workflows et d’activités enregistrés sous forme de chaînes, ainsi qu’une enveloppe publique pour les données. Cette enveloppe identifie son codec et transporte des valeurs utilisables entre langages, sans dépendre de la sérialisation PHP, du pickle Python ou des types internes de Rust.

Les workers de workflows reconstruisent leurs décisions à partir des commandes durables et de l’historique. Les entrées et résultats des activités et des workflows enfants peuvent passer d’un langage à l’autre lorsque les workers annoncent le même codec public et enregistrent les mêmes noms de types. Consultez l’[index des fonctionnalités](/docs/capabilities/) et les informations de découverte du runtime avant de dépendre d’une fonction particulière d’un SDK.

## Utiliser les exemples adaptés {#learn-from-the-matching-examples}

- **Mode service et plusieurs langages :** utilisez le [démarrage rapide](/docs/quickstart/) et le guide du SDK PHP, Python ou Rust.
- **Mode intégré à Laravel :** explorez les modèles de workflows Laravel et les observations Waterline dans la [Sample App](/docs/sample-app/).

La galerie intégrée est destinée aux applications Laravel. Pour Cloud ou Server en mode service, commencez par les guides du mode service.

## Un contrat utilisable par les agents {#agent-operable-by-contract}

Les opérateurs humains et les agents autonomes utilisent le même contrat lisible par machine. Le parcours testable est **Découvrir → Modifier → Exécuter → Diagnostiquer → Réparer** : manifestes de versions et de fonctionnalités, commandes explicites, résultats structurés, historique typé, diagnostics des workers et des files, modifications sûres et vérification après modification. Consultez la [boucle d’exploitation pour agents](/docs/agent-operating-loop/) et le [guide d’évaluation pour agents IA](/docs/ai-agent-workflow-engine/).

## Avez-vous besoin d’un workflow ? {#do-you-need-a-workflow}

Un workflow est probablement adapté si :

- Le processus dure des minutes, des heures ou des jours.
- Vous attendez une approbation humaine.
- Vous attendez un webhook ou un événement externe.
- Vous devez suspendre le travail et le reprendre plus tard sans garder un processus actif.
- Vous devez reprendre après un arrêt brutal sans provoquer d’erreurs ni dupliquer le travail.

Pour « exécuter cinq jobs en file dans l’ordre et s’arrêter au premier échec », une chaîne de jobs convient généralement mieux. Durable Workflow convient lorsque l’étape suivante dépend d’un événement externe, d’une attente ou d’une décision impossible à connaître à l’avance.
