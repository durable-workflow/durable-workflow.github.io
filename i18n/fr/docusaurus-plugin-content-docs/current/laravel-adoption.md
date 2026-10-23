---
sidebar_position: 4
title: Adoption Laravel et transition du runtime
description: Migrer des workflows Laravel de v1 vers Durable Workflow 2.0 embarqué ou en mode service en conservant l'intégration au framework et une responsabilité claire du runtime.
tags:
  - laravel
  - migration
  - service-mode
  - embedded
keywords:
  - migration Laravel Durable Workflow
  - mode service Laravel
  - migration v1 vers v2
  - embarqué vers mode service
---

# Adoption Laravel et transition du runtime {#laravel-adoption-and-runtime-transition}

Les applications Laravel disposent de deux destinations officielles Durable
Workflow 2.0. Le mode embarqué conserve l'exécution durable dans l'application.
Le mode service conserve Laravel comme framework applicatif et worker, tandis
que Cloud ou un Server auto-hébergé possède l'état durable.

Cette page aide à décider et à effectuer trois transitions :

1. Laravel v1 stable vers 2.0 embarqué.
2. Laravel v1 stable vers le SDK PHP 2.0 en mode service.
3. Laravel 2.0 embarqué vers le SDK PHP 2.0 en mode service.

Pour une mise à niveau v1 du paquet, gardez le
[guide de migration 2.0](/docs/migration/) détaillé à portée de main. Si vous
avez déjà choisi un runtime de service auto-hébergé, continuez avec la
[procédure embarqué-vers-Server](/docs/polyglot/embedded-to-server/) après avoir
choisi ici votre politique de transition.

## Choisir la destination {#pick-the-destination}

| Point de départ | Destination | À choisir si | Première frontière de transition |
| --- | --- | --- | --- |
| Laravel v1 stable | 2.0 embarqué | L'application Laravel doit rester propriétaire de la persistance, des files, de l'exécution et de Waterline embarqué. | Mettez à niveau le paquet maintenu `durable-workflow/workflow` vers la branche 2.0. Les exécutions v1 finissent via son parcours de compatibilité v1. Les nouveaux démarrages utilisent v2. |
| Laravel v1 stable | SDK PHP en mode service | Laravel doit conserver injection de dépendances, configuration, Artisan, journaux, événements et simulations de test, mais Cloud ou Server doit posséder l'état durable. | Installez `durable-workflow/sdk` comme frontière distincte de client/worker de service. L'historique v1 et les jobs Laravel durables restent sur le runtime v1 jusqu'à leur état terminal. |
| Laravel 2.0 embarqué | SDK PHP en mode service | L'application doit cesser de posséder le runtime d'orchestration ou nécessite un runtime partagé ou polyglotte. | Dirigez les nouveaux démarrages vers le service une fois ses workers prêts. Terminez les exécutions embarquées là où elles ont démarré, ou utilisez la procédure explicite d'import embarqué-v2 éligible pour Server auto-hébergé. |

Le pont du SDK PHP et le paquet embarqué prennent en charge Laravel 9 à 13 sur
leurs versions PHP compatibles. Une application v1 prise en charge peut donc
choisir l'une ou l'autre sans mise à niveau Laravel sans rapport avec la transition.

## Comparer les responsabilités {#compare-the-ownership-boundary}

| Sujet | Laravel v1 stable | Laravel 2.0 embarqué | SDK PHP 2.0 en mode service |
| --- | --- | --- | --- |
| Propriétaire du runtime | L'application Laravel possède orchestration et relecture. | L'application possède moteur v2, historique, mise en correspondance, temporisateurs et relecture. | Cloud exploite le runtime de l'espace de noms, ou votre équipe exploite Server. Laravel exécute clients et workers distants, pas le runtime. |
| Paquet Composer | `durable-workflow/workflow` stable 1.x. | `durable-workflow/workflow` de la référence d'artefacts 2.0. | `durable-workflow/sdk` de la référence SDK PHP publiée indépendamment. Il ne dépend pas du moteur embarqué. |
| Processus requis | Processus web/CLI Laravel et workers de file ou Horizon. | Processus web/CLI Laravel et workers de file ou Horizon. Ordonnanceur et réparation suivent la configuration embarquée. | Processus applicatifs Laravel et un ou plusieurs `php artisan durable-workflow:worker`. Cloud fournit le runtime. L'auto-hébergement nécessite aussi Server et sa persistance. |
| Files et stockage | Lignes de workflows et historique orienté PHP dans les bases Laravel configurées. Jobs de workflow, activité, tentative et temporisateur dans les backends de file Laravel. | Historique d'événements et projections dans la base de l'application. Les tâches embarquées utilisent normalement les files Laravel. | Historique et état durable des tâches dans la persistance Cloud ou Server. `DURABLE_WORKFLOW_TASK_QUEUE` identifie une file distante interrogée par le worker SDK, pas une connexion de file Laravel. |
| Identité workflow/activité | Les classes PHP sont les identités durables. | Configurez des alias stables sous `workflows.v2.types`. Les classes restent des implémentations locales. | `#[Workflow('orders.fulfill')]` et `#[Activity('orders.reserve')]` publient des clés de type stables lors de l'enregistrement. N'utilisez pas les FQCN PHP comme contrat entre runtimes. |
| Identifiants | Identifiants Laravel, base, cache et files. L'`APP_KEY` d'origine reste nécessaire à la reprise v1. | Identifiants applicatifs, de base, cache, files et authentification Waterline embarquée de l'hôte. | Les processus applicatifs Cloud reçoivent uniquement un identifiant de contrôle, les workers uniquement un identifiant worker. L'auto-hébergement peut utiliser un jeton partagé ou des identifiants limités équivalents. Ces entrées de processus sont volontairement absentes du cache de configuration Laravel. |
| Outils d'exploitation | Journaux/événements Laravel, outils de file, Horizon, Waterline v1 et `workflow:v1:list` si disponible. | Journaux/événements Laravel, outils de file, `workflow:v2:doctor`, commandes d'historique/réparation et Waterline embarqué. | Diagnostics SDK via le logger PSR Laravel et `WorkerDiagnosticEvent`. Cloud inclut Managed Waterline. Les opérateurs auto-hébergés utilisent API/CLI Server et peuvent déployer Waterline séparément pour l'espace de noms Server. |
| Responsable de transition et retour arrière | Votre équipe conserve base v1, état des files, configuration et secrets comme un même ensemble de reprise. | Votre équipe sépare les démarrages v1 et v2, conserve les réveils v1 et décide du retrait des anciennes tables/files. | Votre équipe dirige chaque commande vers le runtime de son exécution. Cloud gère le retour arrière du runtime géré. Les opérateurs auto-hébergés gèrent persistance et retour arrière Server. Le retour arrière applicatif conserve les routes des anciens et nouveaux runtimes jusqu'à la fin de leurs exécutions. |

Cloud et Server auto-hébergé sont deux alternatives du mode service. Les
utilisateurs Cloud n'installent ni Server ni service Waterline distinct. En
auto-hébergement, les opérateurs déploient, sécurisent, sauvegardent,
dimensionnent et mettent à niveau Server. Waterline est un déploiement facultatif
distinct sur l'espace de noms Server.

## Un cas Laravel dans les trois modes {#one-laravel-use-case-in-all-three-modes}

Les exemples réservent du stock pour `orders.fulfill`. Associez délibérément la
classe v1 stable aux clés de type v2, puis gardez ces clés et la file configurée
stables. La réservation de stock et le consommateur d'événements métier doivent
être idempotents : une activité peut s'exécuter plusieurs fois après une nouvelle
tentative ou une perte d'accusé d'achèvement.

L'action applicative reste identique en production et en test :

| Mode | Point d'entrée de production | Point d'entrée après activation de sa simulation |
| --- | --- | --- |
| Laravel v1 stable | `app(StartOrderFulfillment::class)->start('1001')` | `app(StartOrderFulfillment::class)->start('1001')` |
| Laravel 2.0 embarqué | `app(StartOrderFulfillment::class)->start('1001')` | `app(StartOrderFulfillment::class)->start('1001')` |
| SDK PHP en mode service | `app(StartOrderFulfillment::class)->start('1001')` | `app(StartOrderFulfillment::class)->start('1001')` |

L'injection par constructeur Laravel reste disponible à la frontière applicative
dans chaque mode. La v1 stable injecte les dépendances d'activité dans
`execute()`. La v2 embarquée et le mode service demandent au conteneur Laravel
de construire workflows et activités : leurs dépendances utilisent donc des
constructeurs ordinaires. Toute lecture d'un workflow relu doit rester
déterministe et fondée sur la configuration. Base de données, réseau, horloge
et autres effets de bord appartiennent aux activités.

### Laravel v1 stable {#stable-v1-laravel}

Conservez l'[installation v1 stable](/docs/1.x/installation/) et ses exigences
de pilote de file réel. Cet exemple injecte le lanceur applicatif par
constructeur et les services d'activité par méthode :

<!-- docs-example id="laravel.adoption.v1.handlers" -->
```php
<?php

use App\Contracts\InventoryGateway;
use App\Contracts\OrderPolicy;
use App\Events\InventoryReserved;
use Illuminate\Contracts\Events\Dispatcher;
use Psr\Log\LoggerInterface;
use Workflow\Activity;
use Workflow\Workflow;
use Workflow\WorkflowOptions;
use Workflow\WorkflowStub;
use function Workflow\activity;

final class FulfillOrderWorkflow extends Workflow
{
    public function execute(string $orderId): \Generator
    {
        return yield activity(ReserveInventoryActivity::class, $orderId);
    }
}

final class ReserveInventoryActivity extends Activity
{
    public function execute(
        OrderPolicy $orders,
        InventoryGateway $inventory,
        LoggerInterface $logger,
        Dispatcher $events,
        string $orderId,
    ): array {
        $orders->assertFulfillable($orderId);
        $reservation = $inventory->reserve($orderId);
        $logger->info('Inventory reserved', ['order_id' => $orderId]);
        $events->dispatch(new InventoryReserved($orderId));

        return $reservation;
    }
}

final class StartOrderFulfillment
{
    public function __construct(private readonly LoggerInterface $logger)
    {
    }

    public function start(string $orderId): void
    {
        $workflow = WorkflowStub::make(FulfillOrderWorkflow::class);
        $workflow->start($orderId, new WorkflowOptions('redis', 'orders'));
        $this->logger->info('Order workflow started', ['order_id' => $orderId]);
    }
}
```

`config/queue.php` et l'environnement choisissent toujours la connexion de file
Laravel réelle. Lancez un worker pour la file configurée :

<!-- docs-example id="laravel.adoption.v1.worker" -->
```bash
php artisan queue:work redis --queue=orders
```

La simulation stable exécute la même action injectée qu'en production :

<!-- docs-example id="laravel.adoption.v1.fake" -->
```php
<?php

use Workflow\WorkflowStub;

WorkflowStub::fake();
WorkflowStub::mock(ReserveInventoryActivity::class, ['status' => 'reserved']);

app(StartOrderFulfillment::class)->start('1001');

WorkflowStub::assertDispatched(
    ReserveInventoryActivity::class,
    fn (string $orderId): bool => $orderId === '1001',
);
```

Les assertions d'événements Laravel restent disponibles pour tester l'activité
réelle. Ne remplacez pas les workers v1 au seul motif que le SDK v2 a été ajouté
ailleurs dans l'application.

### Laravel 2.0 embarqué {#20-embedded-laravel}

L'installation stable utilise le même paquet Workflow que le démarrage rapide embarqué :

<!-- docs-example id="laravel.adoption.v2-embedded.install" -->
```bash
composer require %%artifact.workflowComposerPackage%%
```

Publiez ou mettez à jour `config/workflows.php`, puis attribuez des alias stables
au même contrat métier. Le fichier publié contient d'autres paramètres v1 et v2
obligatoires. Fusionnez ces valeurs avec ses tableaux existants sans remplacer
le fichier entier par cet extrait ciblé :

<!-- docs-example id="laravel.adoption.v2-embedded.config" -->
```php
<?php

return [
    'v2' => [
        'namespace' => env('DW_V2_NAMESPACE', 'production'),
        'types' => [
            'workflows' => [
                'orders.fulfill' => App\Workflows\FulfillOrderWorkflow::class,
            ],
            'activities' => [
                'orders.reserve' => App\Activities\ReserveInventoryActivity::class,
            ],
        ],
    ],
];
```

L'API d'écriture passe à `handle()` et n'utilise plus yield pour les résultats
d'activité. Laravel construit les deux objets. L'activité reste le bon endroit
pour les journaux et événements métier qui représentent des effets de bord :

<!-- docs-example id="laravel.adoption.v2-embedded.handlers" -->
```php
<?php

use App\Contracts\InventoryGateway;
use App\Contracts\OrderPolicy;
use App\Events\InventoryReserved;
use Illuminate\Contracts\Events\Dispatcher;
use Psr\Log\LoggerInterface;
use Workflow\V2\Activity;
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;
use function Workflow\V2\activity;

final class FulfillOrderWorkflow extends Workflow
{
    public ?string $connection = 'redis';
    public ?string $queue = 'orders';

    public function __construct(private readonly OrderPolicy $orders)
    {
    }

    public function handle(string $orderId): array
    {
        $this->orders->assertFulfillable($orderId);

        return activity(ReserveInventoryActivity::class, $orderId);
    }
}

final class ReserveInventoryActivity extends Activity
{
    public ?string $connection = 'redis';
    public ?string $queue = 'orders';

    public function __construct(
        private readonly OrderPolicy $orders,
        private readonly InventoryGateway $inventory,
        private readonly LoggerInterface $logger,
        private readonly Dispatcher $events,
    ) {
    }

    public function handle(string $orderId): array
    {
        $this->orders->assertFulfillable($orderId);
        $reservation = $this->inventory->reserve($orderId);
        $this->logger->info('Inventory reserved', ['order_id' => $orderId]);
        $this->events->dispatch(new InventoryReserved($orderId));

        return $reservation;
    }
}

final class StartOrderFulfillment
{
    public function __construct(private readonly LoggerInterface $logger)
    {
    }

    public function start(string $orderId): void
    {
        WorkflowStub::make(FulfillOrderWorkflow::class, "order-{$orderId}")
            ->start($orderId);
        $this->logger->info('Order workflow started', ['order_id' => $orderId]);
    }
}
```

Lancez le worker Laravel comme l'exige le déploiement embarqué :

<!-- docs-example id="laravel.adoption.v2-embedded.worker" -->
```bash
php artisan queue:work redis --queue=orders
```

Utilisez la simulation embarquée via la même action applicative. Elle exécute
directement les tâches prêtes et enregistre les distributions d'activité :

<!-- docs-example id="laravel.adoption.v2-embedded.fake" -->
```php
<?php

use Workflow\V2\WorkflowStub;

WorkflowStub::fake();
WorkflowStub::mock(ReserveInventoryActivity::class, ['status' => 'reserved']);

app(StartOrderFulfillment::class)->start('1001');
while (WorkflowStub::runReadyTasks() > 0) {
}

WorkflowStub::assertDispatched(
    ReserveInventoryActivity::class,
    fn (string $orderId): bool => $orderId === '1001',
);
```

Cette simulation exerce les lignes et l'historique durables embarqués. Ce n'est
pas la simulation client SDK et elle ne remplace pas un runtime de service.

### SDK PHP en mode service dans Laravel {#php-sdk-service-mode-in-laravel}

Installez le paquet SDK publié indépendamment. Cette commande est générée à
partir de la référence d'artefacts SDK PHP publiée, sans recopier une version ponctuelle :

<!-- docs-example id="laravel.adoption.service.install" -->
```bash
composer require %%artifact.publishedPhpSdkComposerPackage%%
```

Laravel 9 à 13 découvrent automatiquement le fournisseur. Publiez la
configuration et listez les classes de gestionnaire munies d'attributs :

<!-- docs-example id="laravel.adoption.service.config" -->
```php
<?php

return [
    'runtime_url' => env('DURABLE_WORKFLOW_RUNTIME_URL', 'http://localhost:8080'),
    'namespace' => env('DURABLE_WORKFLOW_NAMESPACE', 'production'),
    'task_queue' => env('DURABLE_WORKFLOW_TASK_QUEUE', 'orders'),
    'handlers' => [
        App\Workflows\FulfillOrderWorkflow::class,
        App\Activities\ReserveInventoryActivity::class,
    ],
    'poll_timeout_seconds' => 5,
];
```

Le workflow de service utilise les mêmes chaînes publiques que la v2 embarquée.
Laravel construit les deux classes de service munies d'attributs via son conteneur :

<!-- docs-example id="laravel.adoption.service.handlers" -->
```php
<?php

use App\Contracts\InventoryGateway;
use App\Contracts\OrderPolicy;
use App\Events\InventoryReserved;
use DurableWorkflow\Attribute\Activity;
use DurableWorkflow\Attribute\Workflow;
use DurableWorkflow\Worker\ActivityContext;
use DurableWorkflow\Worker\WorkflowContext;
use Illuminate\Contracts\Events\Dispatcher;
use Psr\Log\LoggerInterface;

final class FulfillOrderWorkflow
{
    public function __construct(private readonly OrderPolicy $orders)
    {
    }

    #[Workflow('orders.fulfill')]
    public function run(WorkflowContext $context, string $orderId): array
    {
        $this->orders->assertFulfillable($orderId);

        return $context->activity('orders.reserve', [$orderId]);
    }
}

final class ReserveInventoryActivity
{
    public function __construct(
        private readonly OrderPolicy $orders,
        private readonly InventoryGateway $inventory,
        private readonly LoggerInterface $logger,
        private readonly Dispatcher $events,
    ) {
    }

    #[Activity('orders.reserve')]
    public function run(ActivityContext $context, string $orderId): array
    {
        $this->orders->assertFulfillable($orderId);
        $reservation = $this->inventory->reserve($orderId);
        $this->logger->info('Inventory reserved', ['order_id' => $orderId]);
        $this->events->dispatch(new InventoryReserved($orderId));

        return $reservation;
    }
}
```

Le code applicatif injecte l'interface SDK native Laravel au lieu de passer par
une façade ou d'assembler un client de transport. La classe munie d'attributs
fournit le type de workflow et la configuration publiée fournit la file par défaut :

<!-- docs-example id="laravel.adoption.service.client" -->
```php
<?php

use DurableWorkflow\Bridge\Laravel\LaravelWorkflowClientInterface;
use DurableWorkflow\WorkflowHandleInterface;

final class StartOrderFulfillment
{
    public function __construct(
        private readonly LaravelWorkflowClientInterface $workflows,
    ) {
    }

    public function start(string $orderId): WorkflowHandleInterface
    {
        return $this->workflows->start(
            FulfillOrderWorkflow::class,
            [$orderId],
            workflowId: "order-{$orderId}",
        );
    }

    public function handle(string $orderId): WorkflowHandleInterface
    {
        return $this->workflows->handle(
            FulfillOrderWorkflow::class,
            "order-{$orderId}",
        );
    }
}
```

Après publication de la configuration, ne mettez en cache que les paramètres
non secrets. Définissez `RUNTIME_URL` sur l'URI complète du runtime de l'espace
de noms Cloud provisionné ou sur l'origine Server auto-hébergée. N'ajoutez pas `/api`.

Démarrez le worker avec seulement son identifiant de rôle worker :

<!-- docs-example id="laravel.adoption.service.worker" -->
```bash
php artisan vendor:publish --tag=durable-workflow-config
env -u DURABLE_WORKFLOW_TOKEN \
  -u DURABLE_WORKFLOW_CLIENT_TOKEN \
  -u DURABLE_WORKFLOW_WORKER_TOKEN \
  DURABLE_WORKFLOW_RUNTIME_URL="$RUNTIME_URL" \
  DURABLE_WORKFLOW_NAMESPACE=production \
  DURABLE_WORKFLOW_TASK_QUEUE=orders \
  php artisan config:cache
env -u DURABLE_WORKFLOW_CLIENT_TOKEN \
  DURABLE_WORKFLOW_WORKER_TOKEN="$WORKER_SECRET" \
  php artisan durable-workflow:worker
```

Sans option `--queue`, le worker Artisan interroge la file `orders` configurée.
Son diagnostic d'enregistrement et d'interrogation indique runtime, espace de
noms, file, types munis d'attributs et rôle de l'identifiant worker avant le
début de l'interrogation normale.

Les processus applicatifs/web/de file reçoivent au contraire
`DURABLE_WORKFLOW_CLIENT_TOKEN` sans jeton worker. En auto-hébergement, les
opérateurs peuvent utiliser `DURABLE_WORKFLOW_TOKEN` si un même identifiant est
volontairement autorisé pour les deux rôles.

Le worker SDK écrit les diagnostics de cycle de vie, tentative, échec de
gestionnaire et arrêt via le logger PSR Laravel et émet
`DurableWorkflow\Bridge\Event\WorkerDiagnosticEvent` via les événements Laravel.
Les activités métier peuvent conserver le logger et le diffuseur d'événements
injectés, comme ci-dessus.

La simulation de façade fournie remplace la même interface injectée que le
code applicatif :

<!-- docs-example id="laravel.adoption.service.fake" -->
```php
<?php

use DurableWorkflow\Bridge\Laravel\Facades\DurableWorkflow;

$workflows = DurableWorkflow::fake()
    ->setWorkflowResult('order-1001', ['status' => 'fulfilled']);

app(StartOrderFulfillment::class)->start('1001');
$result = app(StartOrderFulfillment::class)->handle('1001')->result();

$this->assertSame(['status' => 'fulfilled'], $result);
$workflows->assertWorkflowStarted(
    FulfillOrderWorkflow::class,
    ['1001'],
    workflowId: 'order-1001',
);
$workflows->assertResultRequested('order-1001');
```

Elle vérifie l'interaction Laravel sans Cloud ni Server. Utilisez le banc de
test worker du SDK pour les commandes des gestionnaires de workflow/activité.
La simulation client n'exécute pas le code du worker distant.

## Drainer, basculer et revenir en arrière {#drain-cut-over-and-roll-back}

Modifier une dépendance Composer ne déplace ni workflow en cours, ni historique,
temporisateur différé, nouvelle tentative d'activité ou job prêt/réservé.
Traitez les anciens et nouveaux runtimes comme des systèmes durables séparés
pendant toute la transition.

### 1. Établir le point de reprise cohérent {#1-establish-the-recovery-cut}

Avant de changer le trafic :

- Inventoriez connexion de base v1/embarquée, toutes les files de workflow et
  d'activité, compte/région/préfixe du backend de file, verrous de cache et
  référence dans le gestionnaire de secrets de l'`APP_KEY` d'origine.
- Bloquez les nouveaux démarrages et entrées de messages assez longtemps pour
  immobiliser la source. Arrêtez chaque worker après son job courant.
  `queue:restart` seul ne suffit pas si un superviseur le remplace immédiatement.
- Terminez toutes les exécutions source ou capturez un point de reprise cohérent
  comprenant SQL et tous les jobs prêts, différés et réservés. Une sauvegarde
  de base seule ne recrée pas les temporisateurs, tentatives ou activités des files.
- Consignez le runtime propriétaire de chaque identifiant non terminal. Signaux,
  requêtes de lecture, mises à jour, annulation, terminaison, réparation et
  lecture de résultat doivent continuer à suivre cette attribution.

### 2. Appliquer la règle du parcours choisi {#2-apply-the-path-specific-rule}

| Transition | Exécutions non terminales existantes | Nouvelles exécutions après transition | Frontière de retour arrière |
| --- | --- | --- | --- |
| v1 vers 2.0 embarqué | Terminent via la compatibilité v1. Conservez tables v1, exigences de décodage PHP, consommateurs Laravel et état des files jusqu'à la fin. | Démarrent via `Workflow\V2\WorkflowStub` uniquement après réussite du canari v2. | Restaurez le point cohérent SQL/files v1 et la configuration exacte, ou corrigez en avant. Ne restaurez pas SQL sur un état de file plus récent. |
| v1 vers Cloud ou mode service auto-hébergé | Restent sur v1. L'historique v1 ne peut être importé dans le service ni relu par des workers distants. | Démarrent avec `LaravelWorkflowClientInterface` après qu'un worker SDK enregistré annonce les clés attendues. | Redirigez les nouveaux démarrages vers v1 seulement si son runtime reste sain. Les exécutions déjà acceptées par le service y restent. |
| v2 embarqué vers Cloud | Terminent sur place. L'adoption Cloud ne transforme pas un changement de paquet en import d'historique. | Démarrent dans l'espace Cloud provisionné après contrôle des identifiants client/worker et des files. | Redirigez les nouveaux démarrages vers l'embarqué si nécessaire. Gardez les commandes des exécutions acceptées par Cloud dirigées vers Cloud. |
| v2 embarqué vers Server auto-hébergé | Terminent sur place, ou suivent séparément l'export, la simulation et l'import atomique d'une exécution v2 éligible immobilisée. Ne déduisez jamais l'éligibilité d'une installation de paquet. | Démarrent via le SDK après vérification de découverte Server, espace de noms, enregistrement worker et file. | Un import échoué n'écrit aucune exécution partielle. Après validation de l'import, Server possède l'exécution. Ne reprenez pas sa copie embarquée. |

Pour l'option d'import auto-hébergé, suivez la
[procédure complète de migration embarqué-vers-Server](/docs/polyglot/embedded-to-server/#phase-e-import-eligible-embedded-v2-runs).
Elle rejette v1, historique expurgé, tâches sous bail, tentatives d'activité en
cours et autres instantanés dangereux. Un export seul est une donnée d'audit ou
de diagnostic. Seule cette opération explicite et validée crée l'état Server.

### 3. Vérifier la destination avant de changer le trafic {#3-prove-the-destination-before-switching-traffic}

1. Configurez un espace de noms, une file et un ensemble stable de types workflow/activité.
2. Démarrez le runtime de destination et ses workers SDK à côté de l'ancien.
3. Vérifiez découverte Server ou provisionnement Cloud, identifiants de rôle,
   enregistrement worker, clés annoncées, visibilité de la file et diagnostics Laravel.
4. Envoyez une commande fantôme ou canari avec identité unique et attendez un
   résultat terminal dans l'interface opérateur de destination.
5. Basculez les nouveaux démarrages une famille de workflows à la fois. Empêchez
   une même clé métier de démarrer dans les deux runtimes.
6. Conservez workers source, état des files, identifiants, journaux/événements
   et ancienne interface opérateur jusqu'à la fin de chaque exécution source
   ou la réussite de son import auto-hébergé pris en charge.

Le retrait d'un ancien paquet, file, table, secret ou déploiement Waterline est
la dernière étape, jamais le mécanisme de transition.

Pour changer de runtime en mode service, consultez [déplacer les charges entre runtimes](/docs/polyglot/runtime-migration/). Un export d’historique Server n’est pas un import d’état actif.

## Continuer le parcours choisi {#continue-with-the-chosen-path}

- [Installation v1 stable](/docs/1.x/installation/)
- [Préparation de migration v1 stable](/docs/migration/)
- [Installation 2.0 embarquée](/docs/installation/)
- [Migration détaillée du paquet v1 vers v2](/docs/migration/)
- [SDK PHP en mode service](/docs/polyglot/php/)
- [Runtime Cloud géré](/docs/polyglot/cloud-control-plane/)
- [Server auto-hébergé](/docs/polyglot/server/)
- [v2 embarqué vers Server auto-hébergé](/docs/polyglot/embedded-to-server/)
