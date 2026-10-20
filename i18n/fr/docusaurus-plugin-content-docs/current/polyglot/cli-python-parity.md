---
title: Capacités des clients et des workers
description: Comparer les capacités des clients et workers de la CLI et des SDK PHP, Python et Rust.
---

# Capacités des clients et des workers {#client-and-worker-capabilities}

Choisissez une interface selon ce que le processus doit accomplir. La CLI `dw`
et les SDK officiels PHP, Python et Rust partagent les contrats v2 du plan de
contrôle et des workers, mais leurs rôles d'opérateur, de client et de worker
ne sont pas identiques.

Ce guide consacré à tous les clients conserve sa route d'origine
`/docs/polyglot/cli-python-parity/` pour préserver les liens existants.

## Comparaison des capacités {#capability-comparison}

| Capacité | CLI `dw` | SDK PHP | SDK Python | SDK Rust |
| --- | --- | --- | --- | --- |
| Cycle de vie des workflows | **Prise en charge :** commandes opérateur de démarrage, listage, inspection, attente, annulation, terminaison et archivage. [Commandes](./cli-reference.md#workflow-commands) | **Prise en charge :** démarrer, décrire, lister, attendre les résultats, annuler et terminer via `Client` et `WorkflowHandle`. [Éléments de preuve du cycle de vie](./php.md#lifecycle-updates-schedules-and-visibility) | **Prise en charge :** démarrer, lister/décrire, attendre les résultats, annuler et terminer via le client asynchrone. [Opérations sur les workflows](./python.md#workflow-operations) | **Prise en charge :** démarrer, décrire, attendre les résultats, annuler et terminer via `Client` et `WorkflowHandle`. [Opérations terminales](./rust.md#cancel-terminate-and-handle-terminal-outcomes) |
| Signaux | **Prise en charge :** envoyer par identifiant de workflow ou à une exécution sélectionnée. [Commandes](./cli-reference.md#workflow-commands) | **Prise en charge :** méthodes d'envoi du client et du handle, et historique des signaux du worker. [API PHP](./php.md#lifecycle-updates-schedules-and-visibility) | **Prise en charge :** envoi par le client asynchrone et traitement des signaux par les workers de workflow. [Messages](./python.md#signals-queries-and-updates) | **Prise en charge :** envoi par le client et le handle, et traitement des signaux par les workers. [API Rust](https://rust.durable-workflow.com/) |
| Requêtes de lecture | **Prise en charge :** exécuter une requête de lecture nommée avec une sortie structurée. [Commandes](./cli-reference.md#workflow-commands) | **Prise en charge :** requêtes du client et du handle, et gestionnaires de requêtes enregistrés sur le worker. [API PHP](./php.md#lifecycle-updates-schedules-and-visibility) | **Prise en charge :** requêtes du client asynchrone et gestionnaires de requêtes du worker exécutés par relecture. [Messages](./python.md#signals-queries-and-updates) | **Prise en charge :** requêtes du client et gestionnaires de requêtes du worker exécutés par relecture quand la découverte du runtime annonce la prise en charge des tâches de requête. [API Rust](https://rust.durable-workflow.com/) |
| Mises à jour | **Prise en charge :** soumettre et attendre l'acceptation ou la fin. [Commandes](./cli-reference.md#workflow-commands) | **Prise en charge :** `updateWorkflow` et `registerUpdate` ; le SDK PHP ne permet pas d'écrire de validateurs et n'en déclare aucun. [API PHP](./php.md#lifecycle-updates-schedules-and-visibility) | **Prise en charge :** clients, gestionnaires de workflow et validateurs synchrones déclarés lorsque la découverte annonce le contrat préalable à l'acceptation. Les workers déclarant des validateurs refusent les runtimes incompatibles. [Messages](./python.md#signals-queries-and-updates) | **Prise en charge :** interfaces de mise à jour du client, du handle, des charges utiles Avro et des gestionnaires enregistrés sur le worker ; le SDK Rust ne permet pas d'écrire de validateurs et n'en déclare aucun. [Mises à jour](./rust.md#workflow-updates) |
| Planifications | **Prise en charge :** cycle de vie complet, rattrapage et historique d'audit des planifications. [Commandes](./cli-reference.md#schedule-commands) | **Prise en charge :** cycle de vie complet et listage des planifications via `Client`. [API PHP](./php.md#lifecycle-updates-schedules-and-visibility) | **Prise en charge :** cycle de vie asynchrone complet des planifications et pagination de l'historique d'audit. [Planifications](./python.md#schedules) | **Non prise en charge :** le SDK Rust actuel ne revendique aucune API de gestion des planifications. Utilisez la CLI, PHP, Python ou l'API du serveur. |
| Visibilité | **Prise en charge :** recherche de workflows/exécutions, workers, files de tâches, historique et JSON de diagnostic. [Commandes](./cli-reference.md#workflow-commands) | **Prise en charge :** filtrage/pagination des workflows, historique, espaces de noms, workers et files de tâches. [Éléments de preuve de visibilité](./php.md#lifecycle-updates-schedules-and-visibility) | **Prise en charge :** interfaces client des workflows, planifications, espaces de noms, workers, files, historiques et attributs de recherche. [API client](./python.md#client-api-reference) | **Périmètre différent :** la description et le résultat d'une exécution sélectionnée sont pris en charge ; le listage/la recherche sur toute la flotte et l'administration des espaces de noms ne sont pas revendiqués. [Client Rust](./rust.md#package-and-source) |
| Exécution des workers | **Périmètre volontairement différent :** les commandes de bas niveau du protocole worker servent au diagnostic et à la conformité ; `dw` n'est pas un runtime de worker applicatif. [Commandes worker](./cli-reference.md#worker-protocol-commands) | **Prise en charge :** gestionnaires distants de workflows, activités, requêtes de lecture et mises à jour via `durable-workflow/sdk`. [Worker PHP](./php.md#run-a-remote-php-worker) | **Prise en charge :** workers déterministes de workflows et d'activités. [Worker Python](./python.md#worker) | **Prise en charge :** gestionnaires natifs de workflows, activités, requêtes de lecture et mises à jour. [API worker Rust](https://rust.durable-workflow.com/) |

**Prise en charge** signifie que l'interface de la version actuelle nommée
expose la capacité. **Périmètre différent** indique une frontière de rôle
intentionnelle. **Non prise en charge** est une lacune actuelle explicite,
pas une promesse cachée. La découverte du protocole du runtime reste la
référence lorsqu'une capacité dépend d'un protocole worker négocié.

## Éléments de preuve par interface produit {#evidence-by-product-surface}

### CLI {#cli}

La [présentation de la CLI](./cli.mdx) définit l'installation, les profils,
la sortie structurée et le comportement de sortie. La
[référence des commandes](./cli-reference.md) couvre toute l'interface
opérateur : cycle de vie, messages, planifications, visibilité et commandes
de bas niveau du protocole worker, qui ne constituent volontairement pas une
boucle de worker de SDK.

### SDK PHP {#php-sdk}

Le SDK PHP épinglé expose des API client et worker distant indépendantes du
framework. Son interface publique actuelle comprend le cycle de vie des
workflows et les handles de résultats, les signaux, requêtes de lecture, mises
à jour, planifications, filtrage/historique des workflows et visibilité des
espaces de noms, workers et files de tâches, ainsi que les gestionnaires
enregistrés de workflows, activités, requêtes de lecture et mises à jour.
Consultez le [guide du SDK PHP](./php.md) et la
[référence de l'API PHP](https://php.durable-workflow.com/api/) générée.

### SDK Python {#python-sdk}

Le SDK Python associe un client asynchrone du plan de contrôle à des workers
déterministes de workflows et d'activités. Son guide présente les
[opérations client](./python.md#client-api-reference), les
[gestionnaires de messages](./python.md#signals-queries-and-updates),
l'[exécution des workers](./python.md#worker) et la
[gestion des planifications](./python.md#schedules). La
[référence de l'API Python](https://python.durable-workflow.com/) générée
fournit les signatures et types de résultats exacts.

### SDK Rust {#rust-sdk}

Le SDK Rust publié expose le plan de contrôle et le cycle de vie d'une
exécution sélectionnée, les signaux, les requêtes de lecture par relecture,
les mises à jour et les workers natifs de workflows/activités. La prise en
charge des mises à jour comprend `Client::update_workflow`,
`WorkflowHandle::update`, `Worker::register_update` et leurs variantes à valeurs
Avro. La gestion des planifications et le listage/la recherche sur toute la
flotte restent des lacunes explicites. Consultez le [guide du SDK Rust](./rust.md)
et la [référence de l'API Rust](https://rust.durable-workflow.com/) générée.

## Éléments de preuve du contrat commun {#shared-contract-evidence}

Les quatre produits ciblent le même plan de contrôle HTTP+JSON versionné et
la même enveloppe publique de charge utile. Les éléments de preuve se
répartissent selon ce qu'ils démontrent :

- l'[index des capacités](/docs/capabilities/) consigne les versions minimales
  exactes des artefacts et l'étendue actuelle de la prise en charge ;
- la [suite de conformité de la plateforme](/docs/platform-conformance/)
  consigne les scénarios d'exécution entre clients et entre workers ;
- les dépôts CLI et Python conservent des jeux de requêtes communs pour les
  opérations dont les corps de requête sémantiques sont actuellement comparés
  octet pour octet ;
- les références publiques des API PHP et Rust et leurs tests de publication
  établissent les méthodes supplémentaires prises en charge ci-dessus.

La présence d'un jeu de données commun à deux dépôts ne signifie pas que les
autres SDK ne disposent pas de l'opération. Inversement, un point de terminaison
commun ne signifie pas que chaque produit expose le même rôle d'opérateur ou
de worker.

## Ajouter ou étendre une interface client {#adding-or-extending-a-client-surface}

Lors de l'ajout d'une opération à la CLI ou à un SDK :

1. Gardez les chemins, méthodes, champs sémantiques, enveloppes de charges
   utiles et résultats d'erreur indépendants du langage.
2. Ajoutez des éléments de preuve des requêtes et du runtime pour chaque
   client ou worker participant.
3. Documentez les différences délibérées de syntaxe ou de rôle.
4. Indiquez explicitement les produits non pris en charge.
5. Considérez comme des défauts du contrat public les sérialisations, chemins
   de fichiers, noms de classes ou formes d'erreurs propres à un langage.
