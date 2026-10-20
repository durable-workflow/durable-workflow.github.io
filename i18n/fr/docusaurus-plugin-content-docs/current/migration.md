---
sidebar_position: 13
title: Migrer vers 2.0
description: Mettre à niveau une application Laravel Workflow v1 existante vers Durable Workflow v2.
tags:
  - migration
  - upgrade
  - v2
keywords:
  - migrer vers Durable Workflow v2
  - mise à niveau Laravel Workflow
  - migration du schéma v2
  - workflow v1 vers v2
---

# Migrer vers 2.0 {#migrating-to-20}

Ce guide couvre les changements essentiels pour passer une application Laravel
v1 existante à v2. Choisissez d'abord si Laravel garde la responsabilité du
runtime ou se connecte à Cloud ou Server auto-hébergé via le SDK PHP dans le
[guide d'adoption Laravel et de transition du runtime](/docs/laravel-adoption/).
Cette page détaille ensuite la migration du paquet embarqué v1 vers v2.

## Procédure de mise à niveau {#upgrade-procedure}

### Avant la mise à niveau {#before-upgrading}

**1. Inventorier tous les stockages d'exécution v1**

L'état d'exécution v1 n'est pas nécessairement limité à la base des workflows.
Outre les lignes et l'historique, des jobs Laravel peuvent être prêts, différés
ou réservés dans Redis, une base de file, SQS ou un autre backend. Avant tout
changement de code, consignez :

- la connexion de stockage et les associations réelles de modèles/tables v1
- chaque connexion et nom de file utilisés par workflows et activités v1,
  y compris les surcharges propres à chaque workflow ou activité
- base, préfixe de clés, région, compte et autres paramètres de routage du
  backend nécessaires pour restaurer les mêmes files
- la référence et version immuable du gestionnaire de secrets permettant de
  récupérer l'`APP_KEY` exacte, et les stockages de cache des verrous de jobs uniques v1

Ne copiez dans cet inventaire ni la valeur de l'`APP_KEY`, ni les identifiants de
reprise du gestionnaire de secrets, de base ou du fournisseur de file. Les jobs
chiffrés et arguments sérialisés nécessitent la clé d'origine, mais le manifeste
de reprise ne doit contenir que sa référence et sa version. Gardez les
identifiants permettant de la récupérer sous un contrôle d'accès distinct des
sauvegardes SQL et de files.

Les tables v1 par défaut sont `workflows`, `workflow_logs`, `workflow_signals`,
`workflow_timers`, `workflow_exceptions` et `workflow_relationships`.
Les fichiers publiés `config/workflows.php` peuvent remplacer
`stored_workflow_model`, `stored_workflow_log_model`,
`stored_workflow_signal_model`, `stored_workflow_timer_model` ou
`stored_workflow_exception_model`. Un modèle de remplacement peut aussi
surcharger son `$table` Eloquent. `workflow_relationships_table` contrôle
séparément la table des relations. Sauvegardez les tables et la connexion
résolues par ces modèles, pas seulement les noms par défaut.

**2. Choisir la frontière de retour arrière et immobiliser le travail v1**

Empêchez les nouveaux démarrages et signaux pendant la capture du point de
reprise. Suspendez les ordonnanceurs et arrêtez chaque consommateur des files
inventoriées après son job courant. Par exemple :

```bash
# Horizon
php artisan horizon:pause

# Supervisor or systemd (use the names from your deployment)
sudo supervisorctl stop <your-worker-group>:*
sudo systemctl stop laravel-worker
```

`php artisan queue:restart` seul n'immobilise pas le système si Supervisor,
systemd, Kubernetes ou un autre gestionnaire démarre immédiatement un remplaçant.
Confirmez qu'aucun consommateur ne peut réserver un nouveau job avant la capture.

Choisissez et consignez une politique :

- **Terminer la v1 :** bloquez le nouveau travail v1 et laissez les workers
  terminer jusqu'à ce que `php artisan workflow:v1:list` (si disponible) ou
  une requête équivalente sur la table configurée n'indique plus aucun workflow
  non terminal. Arrêtez les workers et confirmez l'absence de jobs v1 prêts,
  différés ou réservés dans les files concernées. Un retour arrière SQL seul
  peut couvrir ces workflows v1 terminaux.
- **Préserver la v1 en cours :** arrêtez les workers entre deux jobs et capturez
  un instantané cohérent de SQL et de chaque backend de file durable. Il doit
  inclure le travail prêt, différé et réservé au même point de reprise que SQL.
  Attendez la fin d'un job réservé avant la capture, sauf si le backend documente
  la restauration sûre de son message et de son bail.
- **Accepter la perte des exécutions en cours :** si le backend ne fournit pas
  de capture de file restaurable, consignez les identifiants concernés et
  acceptez explicitement que les exécutions non terminales dépendant des files
  ne puissent pas être récupérées ainsi. N'excluez une ligne `pending` éligible
  qu'après avoir prouvé le parcours Watchdog ci-dessous, et une attente réelle
  de signal seul qu'après test de son entrée conservée. Ne présentez aucune
  autre ligne SQL comme travail récupérable.

Une attente de signal seul peut légitimement n'avoir aucun job en file si son
entrée externe reste accessible après restauration. Les nouvelles tentatives
d'activité et temporisateurs reposent sur les files : une ligne
`workflow_timers` ou `workflows` en attente ne recrée pas un job différé perdu.

La v1.0.77 prise en charge lance aussi `Workflow\Watchdog`, activé par défaut,
depuis la boucle worker. Il trouve les workflows `pending` dont `updated_at`
date d'au moins cinq minutes et dont les `arguments` sérialisés sont présents,
puis les redistribue sur leur connexion et file enregistrées. C'est un réveil
borné réservé à `pending`, pas un remplacement des sauvegardes de file.
N'en dépendez qu'après preuve en préproduction : la boucle worker restaurée
distribue le Watchdog, celui-ci redistribue une ligne `pending` périmée éligible,
et le workflow progresse sur la file attendue. Il ne recrée ni tentatives
d'activité ni jobs de temporisateur et ne récupère pas `waiting` ou `running`.
Ces états nécessitent encore leur job conservé ou une entrée externe valide
si le workflow attend réellement un signal.

**3. Sauvegarder l'ensemble de reprise**

Créez une sauvegarde complète de base avant la mise à niveau :

```bash
# MySQL/MariaDB
mysqldump -u root -p your_database > backup-v1-$(date +%Y%m%d-%H%M%S).sql

# PostgreSQL
pg_dump -U postgres your_database > backup-v1-$(date +%Y%m%d-%H%M%S).sql

# Laravel backup package (if installed)
php artisan backup:run --only-db
```

Puis préservez l'état des files selon le backend :

- **File en base :** incluez ses tables et leur connexion dans la même capture.
  Elles peuvent être hors de la base des workflows.
- **File Redis :** utilisez un instantané ou une sauvegarde restaurable incluant
  base/préfixe exacts et clés des jobs prêts, différés et réservés. Préservez
  aussi les verrous de jobs uniques requis présents dans cette base. Préférez
  une base ou instance dédiée : restaurer un Redis partagé peut remonter le
  temps pour des données applicatives sans rapport.
- **SQS ou autre file gérée :** utilisez une restauration ponctuelle prise en
  charge par le fournisseur uniquement si elle préserve de façon cohérente
  les messages disponibles, différés et en cours. SQS ne fournit pas
  d'instantané arbitraire pour cette procédure : terminez le travail v1 ou
  classez le travail restant dépendant des files comme irrécupérable. Les seules
  exceptions SQL seules sont une ligne `pending` éligible au Watchdog prouvée
  et une attente de signal seul testée.

Conservez ensemble sauvegardes SQL et de files, inventaire non secret et
horodatage de reprise. Le manifeste peut nommer la référence et version de
l'`APP_KEY`, mais ne doit contenir ni clé ni identifiants permettant sa
récupération. Séparez les contrôles d'accès aux identifiants du gestionnaire de
secrets, de base, du fournisseur de file et de restauration des sauvegardes.
Restaurer SQL et les files depuis des points différents n'est pas un retour
arrière pris en charge pour les exécutions en cours.

**4. Tester d'abord en préproduction**

**Ne mettez pas à niveau la production sans test en préproduction.** Cela inclut :

- Des changements de schéma (le noyau durable v2 ajoute des tables. Leur nombre
  exact est celui appliqué par `php artisan migrate`. Une future migration
  consolidée pourra regrouper les fichiers par fonctionnalité)
- Des changements d'espaces de noms nécessitant du code
- Le redémarrage des workers de file, avec une brève interruption
- La validation des capacités du backend

**Liste de contrôle en préproduction :**

- [ ] Déployer le code v2 en préproduction
- [ ] Appliquer les migrations à sa base
- [ ] Redémarrer les workers de file
- [ ] Exécuter `php artisan workflow:v2:doctor --strict`
- [ ] Démarrer un nouveau workflow v2 et vérifier son achèvement
- [ ] Vérifier que les workflows v1 éventuels se terminent toujours
- [ ] Vérifier que Waterline affiche v1 et v2
- [ ] Exécuter la suite de tests applicative
- [ ] Vérifier l'absence d'erreurs dans les journaux

Ne passez en production qu'après réussite de cette validation.

### Étapes de mise à niveau {#upgrade-steps}

**1. Mettre à jour la dépendance Composer**

```bash
composer require %%artifact.workflowComposerPackage%%
```

Le paquet Composer maintenu est `durable-workflow/workflow` en v1 comme en v2.
Cette commande change sa contrainte vers la version d'artefact publique v2
actuelle. L'ancien nom `laravel-workflow/laravel-workflow` est un simple alias
de compatibilité pour les graphes de dépendances antérieurs au renommage.
Utilisez le nom maintenu pour les nouvelles dépendances et le retour arrière.
La version publique actuelle désigne le paquet stable 2.0. Utilisez
`durable-workflow/workflow:^2.0` pour accepter automatiquement les mises à jour
2.x compatibles dans Composer.

**2. Appliquer les migrations de base**

```bash
php artisan migrate
```

La v2 ajoute les tables du noyau durable qui portent son contrat fonctionnel.
Les migrations actuelles par fonctionnalité créent :

- Noyau : `workflow_instances`, `workflow_runs`, `workflow_history_events`, `workflow_tasks`, `workflow_commands`
- Activités : `activity_executions`, `activity_attempts`
- Fonctionnalités : `workflow_updates`, `workflow_signal_records`, `workflow_run_waits`, `workflow_run_timeline_entries`, `workflow_run_lineage_entries`, `workflow_schedules`, `workflow_schedule_history_events`
- Observabilité : `workflow_run_summaries`, `workflow_failures`, `workflow_links`, `worker_compatibility_heartbeats`
- Temporisateurs : `workflow_run_timers`, `workflow_run_timer_entries`
- Recherche / mémo / message / enfant : `workflow_search_attributes`, `workflow_memos`, `workflow_messages`, `workflow_child_calls`
- Catalogue de services : `workflow_service_endpoints`, `workflow_services`, `workflow_service_operations`, `workflow_service_calls`

Une future migration consolidée pourra réduire le nombre de fichiers sans
changer le contrat durable. La méthode prise en charge pour connaître l'état
réel de la base est `php artisan migrate:status` après mise à niveau.

Les tables v1 par défaut (`workflows`, `workflow_logs`, `workflow_signals`,
`workflow_timers`, `workflow_exceptions`, `workflow_relationships`) sont
conservées pour terminer sur v1. Si les modèles v1 surchargent tables ou
connexion, ces tables configurées constituent la référence v1.

**3. Mettre à jour la configuration si nécessaire**

La configuration v2 est rétrocompatible. Un `config/workflow.php` publié en v1
continue à fonctionner. Les nouvelles options comprennent :

- `durable_types` : alias de types pour des références de workflow indépendantes du langage
- `task_repair_policy` : gestion des tâches bloquées
- `backend_capability_check` : validation stricte ou permissive
- `projection_rebuild` : stratégies de reconstruction depuis l'historique
- `history_budget` : limites d'événements pour continue-as-new

Les valeurs par défaut sont adaptées à l'usage courant. Configurez-les uniquement
pour un autre comportement. Consultez la [configuration](/docs/configuration/options/).

**Le codec par défaut devient `avro`.** La v1 utilisait
`Workflow\Serializers\Y::class`, réservé à PHP. La v2 utilise `avro`, indépendant
du langage, pour permettre le décodage par des workers Python, Go ou TypeScript
sans runtime PHP partagé. `avro` est le seul codec pris en charge pour les
nouveaux workflows v2. Ils portent `payload_codec = "avro"`.

Si votre `config/workflows.php` v1 contient
`'serializer' => Workflow\Serializers\Y::class`, la v2 lit encore cette valeur
pour la signaler dans les diagnostics de migration, mais les nouvelles charges
utiles v2 utilisent Avro. Exécutez `php artisan workflow:v2:doctor` après mise à
niveau : il signalera un ancien codec comme sujet de terminaison/import v1.

Pour accepter explicitement le défaut v2, ne définissez pas `serializer` ou fixez-le :

```php
// config/workflows.php — v2 default (language-neutral, compact binary)
'serializer' => 'avro',
```

Conservez un ancien codec (`'workflow-serializer-y'` ou
`'workflow-serializer-base64'`) uniquement pour finir des exécutions v1 qui
partagent des valeurs PHP natives entre serveur et workers PHP. Les anciens
noms de classe (`Workflow\Serializers\Y::class`, etc.) restent des alias acceptés
pour décoder la v1.

**Les sérialiseurs personnalisés v1 ne sont pas pris en charge en v2.** Le
registre public v2 résout uniquement `avro`. Les lecteurs historiques
`workflow-serializer-y` et `workflow-serializer-base64` sont réservés au
parcours interne d'import/terminaison v1, sans sélection possible pour une
nouvelle exécution v2 ou charge utile SDK. Avec un sérialiseur personnalisé,
terminez les exécutions v1 avant la mise à niveau ou réencodez les données
historiques en `avro`. La classe personnalisée n'est pas consultée.
`php artisan workflow:v2:doctor` signale toute autre valeur de
`workflows.serializer` comme dette de migration. L'omission du codec sur une
nouvelle exécution utilise `avro`.

**Les sous-classes de modèle ne sont prises en charge que si elles conservent
le contrat de colonnes et de clés du paquet.** La
[matrice de personnalisation](/docs/configuration/customization-matrix/) figée
fait foi : les modèles v2 d'instance, exécution, tâche, événement, projection,
planification, activité, échec, lien, message, mémo, attribut de recherche et
appel enfant peuvent être sous-classés en conservant noms de table, clés
primaires et étrangères du paquet. Les noms de table personnalisés avec
colonnes de clés étrangères personnalisées sont hors contrat. Waterline lit
les projections v2 via `Workflow\V2\Contracts\OperatorObservabilityRepository`.
Une sous-classe compatible avec le schéma n'exige donc pas de changement Waterline.

**Variables d'environnement :**

La v2 n'ajoute aucune variable obligatoire. `QUEUE_CONNECTION`, `CACHE_DRIVER`
et `DB_CONNECTION` continuent à fonctionner.

**4. Redémarrer les workers de file**

Ils doivent redémarrer pour charger le code v2 :

```bash
# If using Laravel queue workers
php artisan queue:restart

# If using Supervisor
sudo supervisorctl restart <your-worker-group>:*

# If using systemd
sudo systemctl restart laravel-worker

# If using Horizon
php artisan horizon:terminate
```

Les workers vont :
1. Terminer leur job courant
2. Quitter proprement
3. Redémarrer avec le code v2

**Ils doivent redémarrer avant de traiter des workflows v2.** Les workflows v1
peuvent finir avec les anciens ou nouveaux workers via la compatibilité v1.

### Après la mise à niveau {#after-upgrading}

**1. Vérifier les capacités du backend**

```bash
php artisan workflow:v2:doctor --strict
```

Sortie attendue :

```
✓ Database driver supports required features
✓ Queue driver supports required features
✓ Cache driver supports locks
✓ All backend capabilities present
```

En cas d'échec, consultez les [exigences backend](/docs/installation/#requirements)
pour les prérequis des pilotes.

**2. Vérifier le démarrage des workflows v2**

Démarrez un workflow de test via l'API v2 :

```php
use Workflow\V2\WorkflowStub;
use Workflow\V2\StartOptions;

$workflow = WorkflowStub::make(TestWorkflow::class, 'test-upgrade');
$result = $workflow->start(['test' => true], new StartOptions());
$runId = $result->runId();
```

`WorkflowStub::start()` renvoie un objet `StartResult`. Extrayez son identifiant
avec `runId()` avant comparaison avec les lignes de base : traiter la valeur
comme une chaîne scalaire compare silencieusement un objet à une colonne.

Vérifiez que :

- le workflow apparaît dans Waterline
- `workflow_instances` contient le `instance_id` correspondant (`$workflow->id()`)
- `workflow_runs` contient le `run_id` correspondant (`$result->runId()`)
- le workflow se termine ou progresse comme prévu

**3. Vérifier les workflows v1 éventuels**

S'il reste des workflows v1 en cours :

```bash
php artisan workflow:v1:list
```

Vérifiez leur progression. Ils doivent se terminer sur le moteur v1 sans erreur.

**4. Surveiller les erreurs des journaux**

Surveillez les erreurs liées aux workflows dans les journaux applicatifs :

```bash
tail -f storage/logs/laravel.log | grep -i workflow
```

Problèmes courants :

- Espaces de noms : code utilisant encore `Workflow\Workflow` au lieu de `Workflow\V2\Workflow`
- Méthodes : classes v2 de workflow ou d'activité dont l'entrée doit encore être renommée en `handle()`
- Pilote de file : `sync` en mode file n'est pas pris en charge. En mode interrogation (`workflows.v2.task_dispatch_mode=poll`), la file ne distribue pas les tâches et `sync` est acceptable

**5. Vérifier l'observabilité Waterline**

Ouvrez Waterline (`/waterline` par défaut) et vérifiez :

- les workflows v1 éventuels apparaissent avec leurs données d'origine
- les workflows v2 ont tous les détails d'exécution, historique et activité
- Waterline s'affiche sans erreur

### Procédure de retour arrière {#rollback-procedure}

Le retour arrière porte sur un ensemble de reprise. Restaurer seulement SQL ne
restaure pas les exécutions v1 en cours si leur état de file Laravel vit dans
Redis, SQS, une autre base ou un backend externe.

Si la mise à niveau échoue en production, ne revenez qu'à la politique et au
point de reprise choisis avant la mise à niveau :

**1. Immobiliser entrées applicatives, ordonnanceurs et workers**

Utilisez la même procédure d'arrêt qu'avant la capture. Confirmez qu'aucun
worker ne peut réserver de job et qu'aucune requête ne peut démarrer un workflow
ou lui envoyer un signal pendant la restauration.

**2. Valider l'ensemble de reprise**

- Une reprise SQL seule est prise en charge uniquement si le point choisi n'a
  aucune exécution v1 non terminale dépendant de jobs conservés. Une ligne
  `pending` périmée éligible peut utiliser le parcours Watchdog v1.0.77 prouvé
  ci-dessus. Une attente réelle de signal seul peut utiliser une entrée externe
  testée. N'étendez aucune exception à d'autres états.
- Un ensemble pour exécutions en cours doit contenir SQL et état restaurable
  prêt, différé et réservé du même point, pour tentatives, temporisateurs,
  activités et travail `waiting` ou `running`. Les attentes de signal seul
  doivent conserver une entrée fonctionnelle, les temporisateurs leurs jobs différés.
- Si aucune condition n'est remplie, arrêtez ici. Corrigez en avant, réconciliez
  manuellement les workflows consignés ou appliquez l'acceptation documentée
  auparavant de leur caractère irrécupérable.

**3. Restaurer la sauvegarde de base**

```bash
# MySQL/MariaDB
mysql -u root -p your_database < backup-v1-YYYYMMDD-HHMMSS.sql

# PostgreSQL
psql -U postgres -d your_database < backup-v1-YYYYMMDD-HHMMSS.sql
```

Restaurez chaque table des modèles v1 configurés et `workflow_relationships_table`,
même sur une autre connexion.

**4. Restaurer les files si nécessaire**

Gardez les consommateurs arrêtés. Suivez la procédure du fournisseur et
restaurez connexions, files, préfixes et jobs prêts, différés et réservés capturés
avec SQL. Restaurez les verrous de jobs uniques requis s'ils faisaient partie
de la capture. Une file vide portant le même nom ne réveille pas les tentatives,
temporisateurs ou travaux `waiting`/`running` restaurés. Une file vide accessible
en écriture suffit uniquement pour une ligne `pending` éligible après preuve du
démarrage du Watchdog v1.0.77 et de sa redistribution.

**5. Rétablir la dépendance Composer**

```bash
composer require durable-workflow/workflow:^1.0 --with-all-dependencies
```

`durable-workflow/workflow` est le nom maintenu en v1 prise en charge et en v2.
`laravel-workflow/laravel-workflow` est seulement un alias historique déclaré
pour les anciens graphes de dépendances. Ne l'utilisez pas pour le retour arrière.

Récupérez l'`APP_KEY` exacte via sa référence et version inventoriées, avec les
identifiants de reprise contrôlés séparément. Restaurez-la avec la connexion
de stockage, connexions et noms de file, préfixes Redis et modèles personnalisés
avant de lancer un consommateur. Jobs chiffrés et références de modèles
sérialisées dépendent d'une configuration correspondant à la capture.

**6. Redémarrer les workers et rouvrir les entrées**

```bash
# Use the start command for your worker system, for example:
sudo supervisorctl start <your-worker-group>:*
sudo systemctl start laravel-worker
php artisan horizon:continue
```

**7. Vérifier que les exécutions v1 sont atteignables**

L'affichage Waterline prouve une ligne restaurée, pas qu'un worker peut la
reprendre. Terminez cette liste avant de déclarer le retour arrière réussi :

- [ ] `composer show durable-workflow/workflow` annonce la v1 voulue et les workers ont chargé ce code.
- [ ] Les tables v1 configurées et `workflow_relationships_table` sont présentes sur les connexions attendues.
- [ ] Chaque ligne non terminale de la table configurée (`workflows` par défaut)
  est classée par prochain réveil : job prêt/différé/réservé, job de temporisateur
  conservé ou entrée de signal externe testée. Une ligne `pending` éligible peut
  citer les preuves Watchdog v1.0.77 ci-dessous.
- [ ] L'inspection du fournisseur confirme l'existence de chaque réveil de
  tentative, temporisateur, activité et workflow `waiting` ou `running` sur la
  connexion et file enregistrées. Une ligne SQL de temporisateur seule ne
  suffit pas. Le Watchdog ne remplace pas ces jobs.
- [ ] Si une ligne `pending` restaurée n'a pas son job, une boucle worker
  v1.0.77 met effectivement le Watchdog en file. Après les cinq minutes de
  péremption, celui-ci remet le workflow sur sa connexion et file et la ligne
  progresse. Sans preuve de bout en bout, considérez-la comme immobilisée même
  si Waterline l'affiche.
- [ ] Aucune ligne de tentative, temporisateur, `waiting` ou `running` ne manque
  de job exécutable requis ou d'entrée de signal utilisable pour une vraie
  attente de signal. Sinon, elle est immobilisée. La preuve Watchdog limitée
  à `pending` ne la rend pas récupérable.
- [ ] Une tentative ou un temporisateur restauré dépasse son marqueur d'avant
  capture. Une attente de signal contrôlée peut mettre en file et consommer son réveil.
- [ ] Un nouveau canari v1 se termine. Les journaux ne contiennent aucune erreur
  de job manquant, déchiffrement, table de modèle, connexion ou routage de file.

Avec les tables par défaut, cette requête est un premier inventaire. Remplacez
la table par celle du modèle configuré si elle est personnalisée :

```sql
SELECT id, class, status
FROM workflows
WHERE status NOT IN ('completed', 'failed', 'cancelled');
```

**Remarques essentielles :**

- Le retour arrière abandonne les workflows v2 démarrés après mise à niveau, présents uniquement dans les tables v2
- SQL seul restaure les lignes v1, pas les messages de files externes
- La reprise v1 en cours exige SQL et files durables d'un même point cohérent,
  ou une attente de signal seul documentée avec entrée utilisable. L'exception
  SQL seule supplémentaire est une ligne `pending` périmée éligible avec
  redistribution Watchdog v1.0.77 prouvée. Elle ne couvre ni tentatives,
  temporisateurs, ni travail `waiting`/`running`
- Rejouer une capture antérieure peut répéter des effets externes. Vérifiez
  l'idempotence applicative avant de restaurer les activités en file
- Si vous devez préserver les workflows v2 démarrés pendant la mise à niveau,
  ne restaurez pas la base. Corrigez le problème en avant

## Changements de code {#code-changes}

Les sections suivantes détaillent les modifications pour passer des API v1 aux API v2.

### Changement d'espace de noms {#namespace-change}

Toutes les classes v2 sont sous `Workflow\V2`. Mettez à jour les imports :

```php
// v1
use Workflow\Workflow;
use Workflow\Activity;
use Workflow\WorkflowStub;

// v2
use Workflow\V2\Workflow;
use Workflow\V2\Activity;
use Workflow\V2\WorkflowStub;
```

### Méthode d'entrée {#entry-method}

Les workflows et activités v2 utilisent `handle()`. Renommez les méthodes
`execute()` v1 en `handle()` lors de la migration :

```php
// v1
class MyWorkflow extends Workflow
{
    public function execute($input)
    {
        $result = yield ActivityStub::make(MyActivity::class, $input);
        return $result;
    }
}

// v2
use function Workflow\V2\activity;

class MyWorkflow extends Workflow
{
    public function handle($input)
    {
        return activity(MyActivity::class, $input);
    }
}
```

Ne laissez pas `execute()` comme entrée d'une classe v2 : le runtime la rejette.

### Appels d'activité {#activity-calls}

La v2 remplace `ActivityStub::make()` et `yield` par des fonctions directes :

```php
// v1
$result = yield ActivityStub::make(MyActivity::class, $arg1, $arg2);

// v2
use function Workflow\V2\activity;

$result = activity(MyActivity::class, $arg1, $arg2);
```

Les activités ont désormais une identité durable. Chacune planifiée reçoit une
ligne `activity_executions` avec identifiant stable. Chaque tentative concrète
reçoit une ligne `activity_attempts` et un historique typé.

### Identité du workflow {#workflow-identity}

La v2 sépare identifiant d'instance et d'exécution :

- `id()` : identifiant public d'instance, conservé à travers continue-as-new
- `runId()` : identifiant de l'exécution courante

En v1, il s'agissait du même concept.

### Signaux {#signals}

La v2 utilise des attentes de signaux nommées au lieu des mutateurs à attribut `#[SignalMethod]` :

```php
// v1
#[SignalMethod]
public function approve()
{
    $this->approved = true;
}

// v2
use function Workflow\V2\await;

$approved = await('approve');
```

Les signaux nommés prennent en charge `await('name')` pour les attentes bloquantes
dans le workflow et `signal()` / `attemptSignal()` pour l'entrée externe.
Annulation et terminaison ne sont pas des signaux, mais des commandes runtime explicites.

### Requêtes de lecture {#queries}

La v2 utilise des méthodes sûres à la relecture au lieu de lire directement les propriétés :

```php
// v1
#[QueryMethod]
public function getStatus(): string
{
    return $this->status;
}

// v2
use function Workflow\V2\query;

// Queries are defined as named, replay-safe accessors
```

### Temporisateurs et effets de bord {#timers-and-side-effects}

Les fonctions remplacent les méthodes statiques v1 :

```php
// v1
yield Timer::make(60);
$value = yield SideEffect::make(fn() => random_int(1, 100));

// v2
use function Workflow\V2\timer;
use function Workflow\V2\sideEffect;

timer(60);
$value = sideEffect(fn() => random_int(1, 100));
```

### Délais {#timeouts}

La v2 ajoute des délais de workflow via `StartOptions` :

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class, 'order-123');

$workflow->start(
    $orderId,
    StartOptions::rejectDuplicate()
        ->withExecutionTimeout(7200)   // 2 hours across all runs
        ->withRunTimeout(3600),        // 1 hour per run
);
```

- Le **délai d'exécution logique** couvre l'instance entière, y compris les transitions continue-as-new.
- Le **délai d'une exécution** s'applique à une exécution et se réinitialise à continue-as-new.

### Migrations de base {#database-migrations}

La v2 ajoute tables et colonnes. Le paquet charge automatiquement ses migrations.
Après mise à jour :

```bash
composer update durable-workflow/workflow
php artisan migrate
```

La version 2.0.0 inclut des migrations propres des tables de base. Le parcours
normal laisse Laravel charger celles du paquet et lance `php artisan migrate`.

Si vous aviez publié des migrations Durable Workflow dans l'application,
choisissez une seule source et maintenez-la à jour :

- **Migrations chargées du paquet** : retirez les anciennes migrations publiées
  de `database/migrations` et lancez `php artisan migrate`.
- **Migrations publiées** : publiez l'ensemble courant avant de migrer :

  ```bash
  php artisan vendor:publish \
    --provider="Workflow\Providers\WorkflowServiceProvider" \
    --tag=migrations \
    --force

  php artisan migrate
  ```

Ne conservez pas des fichiers publiés périmés tout en comptant sur les nouveaux
fichiers chargés du paquet : il pourrait manquer des tables v2 ou migrations
de réparation.

Si vous personnalisez les migrations, comparez vos copies à `src/migrations`
du paquet à chaque mise à niveau. Gardez noms de table, colonnes, index et
contrats de nullabilité/valeurs par défaut compatibles avec ses modèles.
Une installation sur une connexion non standard doit publier les migrations,
définir leur `$connection`, puis reporter chaque nouvelle migration du paquet
dans l'ordre des horodatages.

Pour les utilisateurs des préversions v2, `workflow_run_summaries.memo` est
réparé de manière idempotente si une ancienne migration publiée avait créé
la table sans cette colonne. Les installations neuves la créent déjà dans la
migration de base.

### Contrôle des capacités du backend {#backend-capability-check}

La v2 valide les exigences de file, base et cache. Lancez le diagnostic après mise à niveau :

```bash
php artisan workflow:v2:doctor --strict
```

### Configuration {#configuration}

La v2 introduit plusieurs options. La [configuration](/docs/configuration/options/)
détaille :

- Les alias de types durables
- La politique de réparation des tâches
- Les contrôles de capacités backend
- La reconstruction des projections
- Les budgets d'historique et la suppression des données sensibles à l'export

### Waterline {#waterline}

Waterline, l'interface de supervision, a été adapté à v2 avec :

- Détails d'exécution affichant durées et échéances des délais
- Suivi des tentatives d'activité par identifiants durables
- Affichage actualisé des états de workflow

### Continue-as-new {#continue-as-new}

La v2 ajoute des budgets d'historique pouvant déclencher automatiquement
continue-as-new au-delà d'un seuil d'événements. Les métadonnées (mémo,
attributs de recherche, délais) sont conservées entre transitions.

## Workflows existants {#existing-workflows}

### Stratégie de terminaison sur v1 {#finish-on-v1-strategy}

**Les workflows démarrés en v1 continuent via les parcours de compatibilité v1.**
Les nouveaux démarrages après mise à niveau utilisent la sémantique v2. Il
n'est pas nécessaire de migrer les instances en cours.

Lors du passage à 2.0 :

1. **Les données v1 sont préservées.** Les tables par défaut `workflows`,
   `workflow_logs`, `workflow_signals`, `workflow_timers`, `workflow_exceptions`
   et `workflow_relationships` restent intactes. Les modèles/tables v1
   configurés restent la référence.
2. **Les workflows v1 finissent sur leur moteur.** Les exécutions en cours
   utilisent la relecture v1 jusqu'à leur état terminal.
3. **Les workflows v2 utilisent leur moteur.** Tous ceux démarrés après mise à
   niveau utilisent le schéma v2 (`workflow_instances`, `workflow_runs`,
   `workflow_history_events`, etc.).
4. **Waterline affiche les deux.** L'interface présente v1 et v2 côte à côte.

La terminaison v1 dépend aussi des files Laravel. Gardez chaque connexion et
file v1 jusqu'à la fin de ses workflows. Les lignes de base préservent historique
et état, sans reconstruire les jobs prêts, différés ou réservés perdus sur un
backend externe. Le Watchdog v1.0.77 peut redistribuer un workflow `pending`
périmé éligible depuis SQL, mais ce parcours borné ne recrée ni tentatives,
temporisateurs, ni travail `waiting`/`running`.

### Suivre la terminaison des workflows v1 {#tracking-v1-workflow-completion}

Pour voir ceux qui restent actifs :

```bash
php artisan workflow:v1:list
```

Cette commande liste ceux sans état terminal (terminé, échoué, annulé). Utilisez-la
pour suivre leur achèvement dans le temps.

Exemple de sortie :

```
+--------------------------------------+---------------------+-----------+------------+
| ID                                   | Class               | Status    | Created    |
+--------------------------------------+---------------------+-----------+------------+
| 01J1234567890ABCDEFGHIJK             | App\OrderWorkflow   | running   | 2 days ago |
| 01J9876543210ZYXWVUTSRQP             | App\InvoiceWorkflow | pending   | 1 day ago  |
+--------------------------------------+---------------------+-----------+------------+
```

#### Visibilité Waterline {#waterline-visibility}

Après passage à 2.0, Waterline affiche automatiquement les deux moteurs :

- Les **workflows v1** conservent leurs données `StoredWorkflow` (classe, état, journaux, signaux, exceptions)
- Les **workflows v2** exposent le détail complet (exécutions, événements, temporisateurs, activités, attributs de recherche)

Aucune configuration n'est nécessaire. Waterline lit les deux ensembles de
tables et offre une vue unifiée.

### Quand supprimer les tables v1 {#when-to-clean-up-v1-tables}

Quand tous les workflows v1 sont terminés, confirmé par zéro actif dans
`workflow:v1:list`, vous pouvez facultativement supprimer leurs tables :

```sql
DROP TABLE IF EXISTS workflow_relationships;
DROP TABLE IF EXISTS workflow_exceptions;
DROP TABLE IF EXISTS workflow_timers;
DROP TABLE IF EXISTS workflow_signals;
DROP TABLE IF EXISTS workflow_logs;
DROP TABLE IF EXISTS workflows;
```

**Attention :** ne les supprimez pas tant qu'un workflow v1 reste actif. Sa
relecture échouerait et il resterait bloqué.

### Pourquoi terminer sur v1 {#why-finish-on-v1}

Cette stratégie évite d'imposer une migration de données pendant la mise à
niveau. Les modèles de stockage sont fondamentalement différents :

- La **v1** stocke l'état dans une ligne `workflows` dénormalisée avec journaux,
  signaux et temporisateurs associés
- La **v2** stocke un historique événementiel avec projections
  (`workflow_instances`, `workflow_runs`, `workflow_history_events`)

Convertir la v1 en cours en historique v2 exigerait de reconstruire les séquences
depuis les journaux v1, avec risque de perte de données et d'incohérence à la
relecture. La terminaison sur v1 laisse les anciens workflows finir sur leur
moteur d'origine pendant que le nouveau travail passe immédiatement à v2.
