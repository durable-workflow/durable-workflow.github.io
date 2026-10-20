---
sidebar_position: 9
title: SDK PHP
description: Connectez les applications PHP indépendantes du framework et les workers distants à un Server auto-hébergé ou au runtime Cloud géré.
tags:
  - php
  - sdk
  - workers
  - polyglot
keywords:
  - sample-app-playground
  - SDK PHP Durable Workflow
  - worker PHP distant
  - client PHP serveur autonome
---

import ProductPromotion from '@site/src/components/ProductPromotion';

# SDK PHP {#php-sdk}

Utilisez `durable-workflow/sdk` lorsqu’une application PHP ou un worker distant
se connecte au Server autonome Durable Workflow ou à l’URL de runtime d’un
espace de noms Durable Workflow Cloud. Ce SDK officiel est indépendant du
framework. Il fournit le client du plan de contrôle, l’authentification, le
transport, le codec public de données utiles, le gestionnaire de relecture et
le cycle de vie du worker distant géré, sans nécessiter Laravel ni le paquet
du moteur embarqué.

## Essayer l’environnement local de l’application d’exemple {#try-the-local-sample-app-playground}

Pour le parcours de création le plus court sans Cloud, ouvrez la
[branche `main` de l’application d’exemple dans GitHub Codespaces](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main)
et exécutez :

<!-- docs-example id="sdk.php.sample-app-playground" -->
```bash
scripts/playground php
```

L’environnement local génère le code de workflow et d’activité appartenant à
l’appelant, sélectionne les artefacts stables actuels et démarre Server et
Waterline publiés. Il attend un enregistrement de worker dont l’identité,
le type de workflow, le type d’activité et la file de tâches correspondent au
contrat généré avant de démarrer le workflow. La réussite exige le résultat
terminé attendu et l’historique requis. Le terminal affiche ensuite le lien
exact vers l’exécution Waterline locale et le chemin des preuves JSON structurées.

Le démarrage rapide et la référence d’API gérés par le paquet, ci-dessous,
restent le parcours direct pour ajouter le SDK à un projet existant sans
application d’exemple.

<ProductPromotion source="docs-v2-php-sdk">
Exécutez des clients et workers PHP sur un espace de noms Cloud géré avec des
identifiants distincts limités par rôle.
</ProductPromotion>

Pour l’intégration pas à pas, les parcours des frameworks, les tests, le
déploiement et le dépannage, consultez le
[portail de développement PHP](https://php.durable-workflow.com/).
Pour les signatures exactes de constructeurs, types de retour et classes
d’exception, utilisez sa [référence d’API générée](https://php.durable-workflow.com/api/)
distincte. Le [contrat lisible par machine](https://php.durable-workflow.com/quickstart-contract.json)
du portail identifie le paquet, les formes de runtime, les rôles des identifiants,
les fichiers source livrés, le résultat attendu et le test sur artefacts
publiés comme un seul parcours testé.

Les clients Cloud utilisent l’URL de runtime et l’espace de noms retournés au
provisionnement, avec des identifiants client et worker distincts.
Le [runtime Cloud géré](/docs/polyglot/cloud-control-plane) décrit cette
frontière de connexion. Les exemples ci-dessous utilisent le même SDK avec
des valeurs locales auto-hébergées.

Utilisez `durable-workflow/workflow` pour le parcours Laravel embarqué distinct,
dans lequel l’application possède l’état des workflows dans sa base existante
et exécute le travail via ses files Laravel. Les
[modes de déploiement](/docs/polyglot/deployment-modes/) comparent toutes les responsabilités.

## Prérequis {#requirements}

- PHP 8.1 ou ultérieur
- Un [Server auto-hébergé](/docs/polyglot/server/) accessible ou un
  [runtime d’espace de noms Cloud](/docs/polyglot/cloud-control-plane) provisionné

## Installation {#install}

Installez le SDK PHP actuellement publié. La dépendance exacte ci-dessous est
générée à partir de la référence des artefacts publiés actualisée depuis le
registre. Composer enregistre le paquet résolu dans `composer.lock` :

<!-- docs-example id="php.sdk.install" -->
```bash
composer require %%artifact.publishedPhpSdkComposerPackage%%
```

Le SDK utilise le paquet Composer officiel `apache/avro` pour l’enveloppe
publique de données utiles. Ses dépendances de production excluent Laravel,
Illuminate, `durable-workflow/workflow` et `durable-workflow/server`.

## Démarrer et inspecter un workflow {#start-and-inspect-a-workflow}

Le démarrage rapide du SDK crée un projet Composer vierge, définit un workflow
et une activité avec des attributs, démarre le worker, lance un workflow unique
et attend son résultat. Les mêmes fichiers `bootstrap.php`, `worker.php`
et `client.php` livrés sont installés depuis le paquet et exécutés par le
test protégé sur artefacts publiés. Cette page n’entretient donc pas un
deuxième exemplaire du code.

Choisissez uniquement la valeur de connexion au runtime :

| Runtime | Valeur transmise à `Client` | Comportement du chemin des requêtes SDK |
| --- | --- | --- |
| Server auto-hébergé | Origine seule, comme `http://localhost:8080` | Ajoute un segment `/api`. L’appelant ne doit pas ajouter `/api`. |
| Durable Workflow Cloud | URI provisionnée complète, comme `https://cloud.example/api/runtime/v1/namespaces/<runtime-id>` | Conserve le chemin du runtime d’espace de noms et y ajoute le segment de point de terminaison `/api`. |

Ouvrez le [parcours PHP testé](https://php.durable-workflow.com/) pour les
commandes exactes et le code visible. Les opérations client lisent
`DURABLE_WORKFLOW_CLIENT_TOKEN`. L’interrogation du worker lit
`DURABLE_WORKFLOW_WORKER_TOKEN`. Le guide garde ces identifiants dans des
processus séparés sans afficher ni committer leur valeur.

`Worker::register()` découvre les gestionnaires `#[Workflow]` et
`#[Activity]` dans le même fichier source. Le guide décrit aussi
l’alternative `registerWorkflow()`/`registerActivity()` pour le code
fondé directement sur des callables. L’amorçage évite à l’utilisateur de
sélectionner le chemin de l’autoloader lorsque les fichiers livrés s’exécutent
dans un projet autonome, un checkout SDK, un paquet installé ou un environnement
de test/conteneur qui les place à côté de son répertoire Composer `vendor/`.

`WorkflowHandle` suit l’exécution courante après une continuation avec une
nouvelle exécution. Utilisez ses méthodes ciblant une exécution sélectionnée
si une opération doit rester protégée par l’identité d’une seule exécution.

## Cycle de vie, mises à jour, planifications et visibilité {#lifecycle-updates-schedules-and-visibility}

Le client public actuel dépasse la seule gestion du résultat d’une exécution :

- `WorkflowHandle` expose `describe`, `result`, `signal`, `query`,
  `cancel` et `terminate`, avec des variantes ciblant une exécution
  sélectionnée pour les opérations qui doivent être limitées à celle-ci.
- `Client` expose `listWorkflows` avec filtrage et pagination Server,
  `workflowHistory`, `updateWorkflow`, `cancelWorkflow` et `terminateWorkflow`.
- `requestCancellation()` demande un nettoyage borné aux workers coopératifs.
  Les méthodes existantes `cancel()` et `cancelWorkflow()` ferment
  immédiatement l’exécution. L’[annulation coopérative](/docs/polyglot/cancellation)
  définit le contrat d’écriture et de reprise.
- Les méthodes de planification couvrent la création, description, liste,
  modification, pause, reprise, déclenchement, rattrapage et suppression.
- La visibilité d’exploitation inclut `listNamespaces`, `listWorkers` et
  `listTaskQueues`, avec les méthodes de description correspondantes.

Les workers distants enregistrent les gestionnaires de workflows, activités,
requêtes de lecture et mises à jour via `registerWorkflow`,
`registerActivity`, `registerQuery` et `registerUpdate`.
La [référence d’API générée du SDK PHP](https://php.durable-workflow.com/api/)
donne tous les paramètres et types de retour.

## Exécuter un worker PHP distant {#run-a-remote-php-worker}

Les gestionnaires de workflow sont des callables ordinaires exécutant du code
linéaire dans une Fiber gérée. Appelez directement les opérations comme
`WorkflowContext::activity()`. Le SDK suspend la Fiber aux décisions
durables et retourne les résultats enregistrés pendant la relecture sans
répéter l’activité externe. Ne déclarez pas le workflow comme Generator et
n’utilisez pas yield pour les commandes `WorkflowContext` : les résultats
Generator sont refusés. Le worker géré enregistre ses noms de types de workflow
et d’activité, interroge le protocole worker public, émet des battements de cœur,
termine ou fait échouer les tâches et gère l’arrêt propre si `pcntl` est disponible.

### Sélection de la première fin {#first-completion-selection}

Utilisez `WorkflowContext::select()` pour démarrer des activités différées,
workflows enfants, temporisateurs, attentes conditionnelles ou barrières
ordinaires imbriquées indépendantes, puis reprendre au premier gagnant validé
durablement. Le `SelectionResult` retourné contient des clés et identités
stables ainsi qu’un handle par membre :

```php
$selected = $ctx->select([
    'resolver' => fn () => $ctx->activity('resolve-request', [$requestId]),
    'input' => fn () => $ctx->waitCondition(
        fn (): bool => $this->resolution !== null,
        key: 'resolution-ready',
    ),
    'deadline' => fn () => $ctx->sleep(2),
]);

if ($selected->key === 'deadline') {
    $selected->handles['resolver']->cancel();
}
```

La sélection n’annule pas les autres membres. Appelez `await()` sur un
handle pour consommer son résultat ultérieur, ou `cancel()` pour enregistrer
une annulation explicite. Un worker à froid ou une relecture d’historique terminé
consomme le gagnant enregistré même si des entrées en double ou ultérieures et
des événements terminaux arrivent dans un autre ordre.
`cancel()` ne retourne aucune valeur et ne rapporte pas son résultat terminal.
Seul l’historique `SelectionOperationCancelled` prouve que l’annulation a
gagné. La relecture dépasse une demande d’annulation sans marqueur et, si
l’opération s’est terminée avant, `await()` retourne toujours ce résultat.

## Mode service avec framework et Laravel embarqué {#framework-service-mode-and-embedded-laravel}

Le même paquet fournit les ponts officiels
[Laravel en mode service](https://github.com/durable-workflow/sdk-php#laravel-service-mode)
et [Symfony en mode service](https://github.com/durable-workflow/sdk-php#symfony-service-mode).
Ils conservent l’injection de dépendances, la configuration, la journalisation,
les workers en console et les fakes de test du framework en se connectant à Cloud ou Server.

Ces ponts sont distincts des [workflows Laravel embarqués](/docs/installation/),
où `durable-workflow/workflow` fait de l’application Laravel la propriétaire
de l’état durable et exécute via les files Laravel.
Le [guide d’adoption Laravel et de transition du runtime](/docs/laravel-adoption/)
montre le même cas d’usage Laravel en v1, en v2 embarquée et avec ce pont
mode service livré, y compris le drainage et le retour arrière.
Les [modes de déploiement](/docs/polyglot/deployment-modes/) comparent plus
largement les frontières du runtime.

## Frontière de protocole et de version {#protocol-and-release-boundary}

Le SDK déclare dans ses métadonnées Composer la plage Server prise en charge,
la version du protocole worker, celle du plan de contrôle et les codecs de
données utiles. Server publie aussi les protocoles et codecs acceptés depuis
`GET /api/cluster/info`. Vérifiez la découverte du runtime pendant le déploiement
plutôt que de déduire la compatibilité d’une version corrective de Server.

Le SDK PHP est versionné indépendamment du paquet Laravel. Conservez la
version publiée exacte dans les exemples exécutables et consultez les notes
de version lors d’une mise à niveau du SDK. La compatibilité suit son contrat
déclaré, sans dépendre de l’égalité des numéros de version des paquets.

## Références associées {#related-references}

- [Serveur autonome](/docs/polyglot/server/)
- [Modes de déploiement](/docs/polyglot/deployment-modes/)
- [Protocole worker](/docs/polyglot/worker-protocol/)
- [Index des capacités](/docs/capabilities/)
- [Portail de développement PHP](https://php.durable-workflow.com/)
- [Référence d’API PHP](https://php.durable-workflow.com/api/)
- [Contrat de démarrage rapide PHP exécutable](https://php.durable-workflow.com/quickstart-contract.json)
- [Code source du SDK PHP](https://github.com/durable-workflow/sdk-php)
