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

- PHP 8.1 ou ultérieur pour le SDK indépendant du framework
- Pour le pont Laravel en mode service à partir du SDK PHP 3.10 : PHP 8.2 ou
  ultérieur et Laravel 12.69 ou ultérieur en 12.x, ou Laravel 13.30 ou ultérieur
  en 13.x avec PHP 8.3 ou ultérieur
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

## Contexte de reprise et exécution propriétaire d’une activité {#activity-retry-context}

Le SDK PHP **3.6.1 ou ultérieur** expose `$context->retryInfo`, `$context->workflowId` et `$context->runId` dans les activités en mode service. Vérifiez `$context->retryInfo->isLastConfiguredAttempt() === true` pour reconnaître la dernière tentative configurée d’une politique limitée. `attemptNumber` conserve le numéro de tentative reçu à l’origine.

L’instantané distingue trois états : `policyProvided === false` indique que la politique est absente de la tâche attribuée ; une valeur racine `null` fournie représente une ancienne politique inconnue ; un objet contenant explicitement `max_attempts: null` signifie des tentatives illimitées. Un retour `null` de `maxAttempts()` ne suffit pas à établir ce caractère illimité. Le SDK n’invente aucun budget par défaut. L’annulation, un échec non réessayable, la fermeture du workflow et l’expiration des délais peuvent arrêter l’exécution avant épuisement du budget.

Les identifiants du workflow et de l’exécution désignent l’exécution propriétaire d’origine. Une identité absente des anciennes tâches reste `null`. Les activités locales conservent les identifiants connus du parent sans hériter d’une politique de reprise distante. Pour signaler le workflow propriétaire, exigez les deux identifiants, ciblez `runId` et réutilisez un identifiant de requête stable lié à l’événement métier entre les tentatives.

Traitez les signaux de manière idempotente pour l’événement métier. Un identifiant de requête stable ne garantit pas à lui seul une admission unique du signal.

Consultez les [exemples complets de dernière tentative et de signal à sa propre exécution](https://php.durable-workflow.com/build/workflows-activities/) dans le guide du SDK PHP.

## Heartbeats d’activité {#activity-heartbeats}

Pour les activités distantes, appelez `ActivityContext::heartbeat($details)` pendant un travail d’activité borné, bien avant le délai de heartbeat configuré. La première fenêtre commence lorsque le moteur réclame l’activité, pas lorsque PHP reçoit la tâche. La latence des requêtes, les pauses et les nouvelles tentatives de transport consomment cette fenêtre. Suivez les [conseils de fréquence](../features/heartbeats.md#heartbeat-cadence-and-receipts).

La méthode renvoie `void`. Dans le chemin direct du gestionnaire, une réponse demandant l’arrêt lève `ActivityCancelled`. Les erreurs HTTP et de transport de `Client::heartbeatActivityTask()` apparaissent comme `ServerException`. Un worker à supervision coopérative peut arrêter ou abandonner son callback lorsqu’un heartbeat ou une vérification de possession échoue, au lieu de livrer une réponse normale au code de l’activité. Ne supposez pas que le nettoyage s’exécute toujours, ne masquez pas une perte d’autorité et ne soumettez pas de réussite après cette perte.

Le retour de l’appel ne valide pas le travail externe et ne fournit pas de point de reprise. Gardez les effets externes idempotents et ne considérez pas une nouvelle tentative de transport comme une nouvelle fenêtre de heartbeat.

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

### Durées {#durations}

À partir du SDK PHP 3.9.0, les temporisateurs et délais des workflows acceptent les
mêmes formes de durée que le paquet Laravel embarqué. `sleep()`, `deferTimer()`, le
`timeout` de `waitCondition()` et `deferCondition()`, les options de délai des
activités, les options `execution_timeout_seconds` et `run_timeout_seconds` des
workflows enfants et l’option `wait_timeout_seconds` des opérations de service
acceptent des secondes sous forme d’entier ou de flottant, une chaîne comme
`'30 minutes'`, ou un `DateInterval` ou `CarbonInterval` :

```php
use Carbon\CarbonInterval;

$verified = $ctx->waitCondition(
    static fn (): bool => $ctx->signals('verify') !== [],
    key: 'email-verified',
    timeout: '30 minutes',
);

$ctx->sleep(CarbonInterval::hours(2));

$receipt = $ctx->activity('payments.capture', [$orderId], [
    'start_to_close_timeout' => '30 seconds',
    'schedule_to_close_timeout' => '10 minutes',
]);
```

Chaque valeur est convertie une seule fois en secondes entières, arrondie à la
seconde supérieure : `'30 minutes'`, `1800` et `CarbonInterval::minutes(30)`
enregistrent donc le même historique. Les chaînes sont converties exactement comme
le font `timer()` et `await()` en mode embarqué. Le SDK refuse les chaînes
ISO 8601 comme `'PT30M'` (passez plutôt `new DateInterval('PT30M')`), les valeurs
négatives, les fractions de mois ou d’une unité calendaire plus longue, les parties
de plus de 15 chiffres entiers et le texte impossible à analyser. Une chaîne numérique comme
`'30'` conserve sa signification antérieure : les temporisateurs et les délais
d’attente conditionnelle l’arrondissent à la seconde entière supérieure, et les
options des activités et des workflows enfants la transmettent telle quelle. Une
durée nulle est valide pour les temporisateurs, les attentes conditionnelles et
`wait_timeout_seconds` ; les délais des activités et des workflows enfants exigent
au moins une seconde. Les versions antérieures du SDK acceptent uniquement des
secondes. Le SDK PHP 3.9.0 ajoute `nesbot/carbon` (`^2.72.6|^3.8.4`) comme
dépendance obligatoire, afin que les durées soient converties avec le même
analyseur que le paquet embarqué. La
[référence des durées du SDK PHP](https://php.durable-workflow.com/build/workflows-activities/#durations)
répertorie toutes les unités.

## Compatibilité à l’entrée et récupération {#entry-compatibility-and-recovery}

**Prise en charge publiée.** Le SDK PHP 2.5.4 a introduit la protection d’entrée ci-dessous, avec le routage et la récupération dans Server 2.9.9. Ce sont les versions minimales pour ces fonctions. Installez les versions stables actuelles pour bénéficier des correctifs de sécurité.

Le worker géré vérifie l’entrée positionnelle enregistrée du handler avant d’entrer dans sa Fiber. Un argument obligatoire absent ou un type PHP déclaré incompatible lève `DurableWorkflow\Exception\WorkflowEntryArgumentsMismatch` et signale le motif de tâche `workflow_entry_arguments_mismatch`. Les valeurs par défaut des arguments facultatifs ne s’appliquent qu’aux entrées omises ; elles ne remplacent jamais une valeur enregistrée incompatible. Un `TypeError` levé après une entrée réussie reste un échec applicatif.

Le worker annonce automatiquement `workflow_entry_arguments_validation`. Avec la prise en charge Server correspondante, une tâche refusée est bloquée pour la relecture et l’exécution d’origine reste non terminale. Un ancien runtime peut au contraire relancer la tâche en échec ; une mise à niveau du SDK seule n’établit donc pas le contrat complet de récupération.

Inspectez l’original avec `Client::describeWorkflow($workflowId, $runId)` et l’endpoint de débogage ciblant l’exécution. Restaurez du code compatible avant d’appeler `Client::repairWorkflow($workflowId, $runId)`, puis vérifiez que cette même exécution reprend sans modifier son entrée, son historique, son identité de routage ou ses échéances. Ne capturez pas cet échec dans le corps du workflow et ne réparez pas en boucle un code incompatible. Consultez la [procédure de récupération en mode service](../failures-and-recovery.md#service-entry-recovery) et le [routage des définitions](./worker-compatibility-routing.md#definition-fingerprint-evolution).

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

## Mettre à niveau vers le SDK PHP 3.12 à 3.14 {#upgrade-to-3-12-through-3-14}

PHP `^8.1`, les planchers du pont Laravel, le protocole de worker `1.20` et le plan de contrôle `2` sont inchangés depuis 3.11. Vérifiez ces changements de comportement avant le déploiement :

- **Mises à jour qui dépassent leur attente.** Depuis 3.13, quand une attente `waitFor: 'completed'` se termine avant la fin de la mise à jour, `Client::updateWorkflow()` et `WorkflowHandle::update()` lèvent `UpdateStillPending`. Les versions précédentes renvoyaient le reçu du Server comme s'il s'agissait du résultat de la mise à jour. Pour continuer à attendre, rappelez la mise à jour avec `$pending->requestId`. La mise à jour n'est pas appliquée deux fois.
- **Enregistrement de worker périmé.** Depuis 3.13, `Worker::run()` se réenregistre après `stale_worker_registration` au lieu de s'arrêter. Les tâches détenues par le worker isolé sont abandonnées sans être terminées, et le Server les redistribue. Chaque reprise journalise `worker.reregistered` et incrémente `durable_workflow_worker_reregistrations`. Passez `stopOnStaleRegistration: true` pour conserver l'ancien comportement.
- **Backoff des activités locales.** Depuis 3.13, une activité locale avec plus de tentatives que d'entrées `backoff_seconds` répète le dernier délai au lieu de réessayer immédiatement, comme les activités planifiées par le Server.
- **Attentes de condition dans des groupes sur le Server native.** Le Server native n'accepte pas encore d'attente de condition ou de signal dans `all()` ou `parallel()`. Depuis 3.13.1, le worker fait échouer cette tâche de workflow avec `grouped_condition_wait_unsupported` et continue de tourner au lieu de s'arrêter. Attendez la condition en dehors du groupe.

Nouveautés de ces versions :

- **Suffixes d'historique sticky (3.14).** Les workers annoncent `sticky_history_suffix`. Sur Server 3.5.0 ou ultérieur, un worker qui détient déjà l'historique d'une exécution ne reçoit que les événements postérieurs à la séquence mise en cache. Un suffixe qui ne prolonge pas exactement l'historique en cache est ignoré et l'historique complet est récupéré. Les Servers plus anciens continuent d'envoyer l'historique complet.
- **Origine du schedule (3.13).** `WorkflowContext::scheduleOrigin()` renvoie l'identifiant du schedule, l'heure d'occurrence et le numéro de déclenchement qui ont démarré l'exécution, ou `null` pour un démarrage ordinaire. La valeur est identique au rejeu. Depuis Server 3.5.0, une exécution qui continue dans une nouvelle exécution conserve son origine de schedule.
- **Continuations d'activité (3.12).** Passez `enableActivityContinuation: true` au constructeur de `Worker` pour envoyer les commandes suivantes du workflow avec un résultat d'activité réussi quand le Server annonce `activity_workflow_continuation` (Server native 3.4.0 ou ultérieur). La valeur par défaut est `false`. L'activer coûte actuellement du débit : dans notre benchmark sous charge, les workflows étaient 24 à 49 % plus lents avec l'option activée et utilisaient deux fois plus de transactions de base de données ([mesure](https://github.com/durable-workflow/server/issues/1078)). Utilisez 3.12.1 ou ultérieur si vous l'activez, et videz ou désactivez ces workers avant de rétrograder le Server ou d'ajouter des nœuds Server plus anciens.

Voir le [journal des modifications 3.14.0](https://github.com/durable-workflow/sdk-php/blob/3.14.0/CHANGELOG.md) pour la liste complète.

## Mettre à niveau vers le SDK PHP 3.10 et 3.11 {#upgrade-to-3-10-and-3-11}

Lisez le [guide de mise à niveau du SDK PHP](https://github.com/durable-workflow/sdk-php/blob/3.11.0/docs/portal/operate/upgrading.md)
avant de déployer. Mettez à niveau ensemble tous les workers pouvant recevoir du
travail d’une file de tâches, y compris les pools de secours et d’autoscaling.

- **Pont Laravel.** À partir de la 3.10, le pont Laravel en mode service suit
  Workflow 2.21 : PHP `^8.2` et Laravel corrigé `^12.69.0|^13.30.0`. Laravel
  10 et 11 ne sont plus pris en charge. Le fournisseur refuse les versions de
  framework et de PHP non prises en charge ou inconnues avant d’enregistrer quoi
  que ce soit. Le SDK de base conserve PHP `^8.1` et la prise en charge de
  Symfony 6.4/7/8.
- **Empreintes de condition.** À partir de la 3.10, les nouvelles attentes de
  condition enregistrent des empreintes de prédicat v2 (`dwphp2:sha256:`). Les
  workers plus anciens les rejettent : revenir à des workers antérieurs à la 3.10
  une fois que des attentes v2 existent peut faire échouer le replay. Arrêtez ou
  drainez les anciens workers avant le démarrage de leurs remplaçants, déployez
  les sources PHP de façon atomique et redémarrez chaque worker de longue durée,
  y compris ceux qui utilisent OPcache. Les workers qui rejouent des attentes v2
  ont besoin du tokenizer de PHP. Les attentes v1 existantes exigent toujours une
  correspondance exacte de la ligne source.
- **Identifiants statiques.** À partir de la 3.10, les identifiants statiques
  sont validés tels quels. Un UTF-8 mal formé, des espaces Unicode à l’une ou
  l’autre extrémité et des caractères de contrôle intégrés provoquent désormais
  un échec au lieu d’être supprimés ou ignorés. Vérifiez les valeurs partagées,
  de client, de worker et de transmission entre processus du framework avant la
  mise à niveau.
- **Échéances d’occurrence.** En 3.11, une nouvelle attente de condition de
  premier niveau conserve sa première échéance malgré les faux réveils lorsque
  Server annonce `condition_wait_occurrence_deadline` (Server natif 3.3.0 ou
  ultérieur). Sans cette capacité, les workers envoient les mêmes commandes
  qu’auparavant. Les attentes de condition groupées ne l’activent pas encore. Sur
  un Server plus ancien, mettez à niveau tous les workers de la file vers la 3.11
  avant de mettre à niveau Server. Sur un Server qui annonce déjà la capacité,
  drainez ou arrêtez tous les anciens workers avant qu’un worker 3.11 ne consomme
  la file. Dès qu’une attente ancrée existe, ne ramenez pas les workers de cette
  file à une version antérieure à la 3.11.

Le SDK PHP 3.10 ajoute aussi `WorkflowContext::startChildWorkflow()`, qui renvoie
un `ChildWorkflowHandle` une fois le démarrage de l’enfant validé et nécessite un
runtime annonçant `child_workflow_start_turn`. Les autres ajouts sont
`ActivityContext::activityExecutionId`, des déclarations typées optionnelles pour
`upsertSearchAttributes()`, des itérateurs paresseux de liste et d’historique des
workflows, et l’option de Worker `enableCompletionPipelining`, qui vaut `false`
par défaut. Les polls portés par la complétion ne sont utilisés que si le runtime
les annonce. Consultez le
[journal des modifications 3.11.0](https://github.com/durable-workflow/sdk-php/blob/3.11.0/CHANGELOG.md)
pour la liste complète.

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

## Pages de liste et d’historique des workflows {#workflow-list-and-history-pages}

Ces appels publiés renvoient **une page**, pas une lecture complète automatique : `Client::listWorkflows(...)` / `Client::workflowHistory(...)`. Continuez avec le token opaque retourné en conservant namespace, filtres et workflow/exécution sélectionnés ; terminez au token nul/vide et traitez explicitement les erreurs de page. Une page partielle n’est pas un bundle de replay. Utilisez l’API d’export d’historique du SDK pour le replay hors ligne. Le [client publié PHP 3.2.0](https://github.com/durable-workflow/sdk-php/blob/3.2.0/src/Client.php) définit les paramètres de page.

Le SDK PHP 3.10.0 et ultérieur fournit aussi `Client::iterateWorkflows()` et `Client::iterateWorkflowHistory()`. Ils lisent de façon paresseuse, une page à la fois, une liste complète de workflows ou l’historique d’une exécution précise, en conservant le curseur opaque, le namespace et les filtres. Les erreurs sur les pages suivantes sont propagées, et les continuations mal formées ou les cycles de tokens sont refusés au lieu de tronquer le résultat ou de boucler. Consultez le [client publié PHP 3.11.0](https://github.com/durable-workflow/sdk-php/blob/3.11.0/src/Client.php).

## Rapports d’échec bornés {#bounded-failure-reports}

Le SDK PHP **3.5.0** a introduit des rapports d’échec sortants bornés. Les limites par défaut sont de **62 KiB UTF-8 pour le message**, **128 KiB pour la pile**, **64 KiB pour l’ensemble des détails et diagnostics facultatifs sérialisés** et **1 MiB pour le corps complet encodé en JSON**. Les marqueurs, l’échappement JSON, l’identité du bail et les autres commandes du lot comptent dans cette limite du corps. Une limite de transport configurée ou déclarée par le transport plus basse est prioritaire. Le type, la classe et le code de l’échec, la politique de nouvelle tentative et l’identité du bail sont conservés.

`withFailureReportLimit()` renvoie un nouveau client avec un budget plus faible pour la requête entière, de 1 à 1 048 576 octets. Utilisez cette instance. Une limite plus basse déclarée par le transport s’applique aussi.

```php
<?php

use DurableWorkflow\Client;

$client = (new Client(
    baseUri: 'https://workflow.example.com',
    controlToken: 'operator-token',
    workerToken: 'worker-token',
))->withFailureReportLimit(512 * 1024);
```

Un marqueur de troncature visible et les tailles originales en octets identifient les champs raccourcis. Les détails Avro sont conservés intégralement ou omis en entier. Une enveloppe obligatoire impossible à représenter déclenche `DurableWorkflow\Exception\FailureReportRefused` avant l’envoi HTTP. Les échecs locaux sont normalisés avant que le code du workflow les observe. La première exécution et la relecture à froid voient donc le même message persistant. Un message local déjà observé reste immuable lors de l’ajustement final du lot.
