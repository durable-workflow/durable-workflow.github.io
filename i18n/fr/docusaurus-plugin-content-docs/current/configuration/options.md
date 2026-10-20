---
sidebar_position: 2
---

# Options {#options}

Plusieurs options sont disponibles pour définir vos workflows et activités. Elles incluent le nombre de tentatives autorisées avant un échec, la connexion et la file, ainsi que la durée maximale d’exécution en secondes.

```php
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public ?string $connection = 'default';
    public ?string $queue = 'default';

    public int $tries = 3;

    public function backoff(): array
    {
        return [1, 2, 5, 10, 15, 30, 60, 120];
    }
}
```

Les propriétés `$connection` et `$queue` de `Workflow\V2\Workflow` et `Workflow\V2\Activity` sont déclarées `public ?string` et valent `null` par défaut. Les redéfinitions dans les sous-classes doivent conserver ce type nullable pour respecter l’invariance du typage des propriétés publiques PHP. Utilisez `null` pour hériter de la connexion ou de la file par défaut de l’application plutôt que de fixer une valeur.

Les délais d’expiration d’activité ne se configurent pas avec une propriété de classe. Utilisez [`ActivityOptions`](#activityoptions) par appel (par exemple `startToCloseTimeout`) ou l’instantané de la politique de nouvelle tentative pris lors de la programmation. Consultez aussi la [Politique de réparation des tâches](/docs/polyglot/server-config-reference#workflow-package-controls) pour les réglages temporels de la boucle du worker.

## StartOptions {#startoptions}

`Workflow\V2\StartOptions` contient la configuration de visibilité, de déduplication et du délai d’expiration à l’exécution lors du démarrage du workflow. Cette classe ne sélectionne pas de file. Le routage dépend des propriétés `$connection` et `$queue` des classes de workflow et d’activité, ainsi que des `ActivityOptions` par appel.

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;
use Workflow\V2\Enums\DuplicateStartPolicy;

$workflow = WorkflowStub::make(MyWorkflow::class);

$workflow->start(
    'arg1',
    new StartOptions(
        duplicateStartPolicy: DuplicateStartPolicy::ReturnExistingActive,
        businessKey: 'order-12345',
        labels: ['tenant' => 'acme'],
        executionTimeoutSeconds: 3600,
    ),
);
```

Les `StartOptions` sont consommées par le moteur et ne sont pas transmises comme arguments à la méthode `handle()` du workflow. Elles sont persistées avec le workflow et utilisées pour les envois ultérieurs de workflows et d’activités, y compris pendant la relecture et la continuation dans une nouvelle exécution.

## ActivityOptions {#activityoptions}

`Workflow\V2\Support\ActivityOptions` permet de redéfinir le routage, les nouvelles tentatives et les délais d’expiration pour chaque appel d’activité, sans modifier la classe d’activité :

```php
use function Workflow\V2\activity;
use Workflow\V2\Support\ActivityOptions;

$result = activity(
    ChargeCard::class,
    new ActivityOptions(
        connection: 'redis',
        queue: 'critical',
        maxAttempts: 5,
        startToCloseTimeout: 30,
    ),
    $orderId,
);
```

Les surcharges de routage dans `ActivityOptions` s’appliquent lors de la planification d’une nouvelle exécution d’activité. Elles ne déplacent pas une activité déjà enregistrée dans l’historique. Consultez les [files d’activité enregistrées](../polyglot/task-matching-dispatch.md#recorded-activity-queues) avant de changer de pools de workers.

## Connexion {#connection}

Le réglage `$connection` indique la connexion de file vers laquelle envoyer le workflow ou l’activité. Par défaut, `$connection` n’est pas défini et la connexion par défaut est utilisée. Redéfinissez ce comportement avec la propriété `$connection` de la classe de workflow ou d’activité.

## File {#queue}

Le réglage `$queue` indique la file à laquelle ajouter le workflow ou l’activité. Par défaut, `$queue` n’est pas défini et la file par défaut de la connexion indiquée est utilisée. Redéfinissez ce comportement avec la propriété `$queue` de la classe de workflow ou d’activité.

Une activité enregistre sa connexion et sa file résolues lors de sa planification. Ses nouvelles tentatives et tâches réparées réutilisent ce routage enregistré, même si les valeurs par défaut de la classe ou les options d’un appel changent. Les exécutions de workflow existantes conservent aussi leur file de workflow enregistrée. Gardez des workers compatibles sur les anciennes files tant que ces dépendances subsistent. Suivez la [procédure de transition de files](../polyglot/task-matching-dispatch.md#recorded-activity-queues).

## Nouvelles tentatives {#retries}

Le réglage `$tries` contrôle le nombre total de tentatives d’une activité avant qu’elle soit considérée en échec. Par défaut, `$tries` vaut `1` (une seule tentative, sans nouvelle tentative automatique). Définissez `$tries` à une valeur supérieure à `1` pour autoriser les nouvelles tentatives, ou à `0` pour réessayer indéfiniment. `ActivityOptions::$maxAttempts` permet de redéfinir cette valeur par appel.

## Délai d’expiration {#timeout}

La classe de base v2 `Activity` n’a pas de propriété de classe `$timeout`. Configurez les délais par appel via [`ActivityOptions`](#activityoptions), avec `startToCloseTimeout`, `scheduleToStartTimeout`, `scheduleToCloseTimeout` ou `heartbeatTimeout`. Le runtime enregistre un instantané de la politique de nouvelle tentative résultante sur l’exécution d’activité lors de sa programmation. Le délai reste donc stable pour une tentative déjà programmée, même si un déploiement ultérieur modifie la classe ou les options. Le rythme d’envoi au niveau de la boucle du worker est contrôlé par la [Politique de réparation des tâches](/docs/polyglot/server-config-reference#workflow-package-controls).

## Espacement des tentatives {#backoff}

La méthode `backoff` renvoie un tableau d’entiers correspondant à la tentative courante. Par défaut, la méthode `backoff` applique un espacement exponentiel jusqu’à 2 minutes. Redéfinissez-le en implémentant la méthode `backoff` dans la classe d’activité.

## Espace de noms {#namespace}

Les workflows peuvent être limités à un espace de noms pour isoler plusieurs espaces. L’espace configuré s’applique à la fois à l’API de démarrage du plan de contrôle et à `Workflow\V2\WorkflowStub::make()->start()`. Il est persisté sur la nouvelle instance, l’exécution, les tâches durables et la projection de résumé d’exécution. Les interrogations de tâches et les filtres de visibilité Waterline peuvent alors limiter les résultats à un espace de noms. Utilisez Workflow 2.4.2 ou ultérieur pour une affectation cohérente via les deux API PHP de démarrage.

Les noms d’espaces de noms doivent contenir uniquement des caractères alphanumériques minuscules, points, traits de soulignement et traits d’union (motif `[a-z0-9._-]+`, 128 caractères maximum).

Définissez l’espace de noms par défaut avec une variable d’environnement :

```env
DW_V2_NAMESPACE=production
```

Ou dans `config/workflows.php` :

```php
'v2' => [
    'namespace' => env('DW_V2_NAMESPACE'),
    // ...
],
```

Un espace de noms explicite remplace la valeur par défaut configurée. Le stub l’accepte comme troisième argument de `make()` :

```php
$workflow = \Workflow\V2\WorkflowStub::make(
    OrderProcessingWorkflow::class,
    'order-12345',
    'staging',
);
$workflow->start();
```

Le plan de contrôle l’accepte dans les options de `start()` :

```php
$controlPlane->start('order-processing', 'order-12345', [
    'namespace' => 'staging',
    // ...
]);
```

Lorsqu’aucun espace de noms n’est configuré ni transmis explicitement, les nouvelles instances conservent un espace de noms `null`. Un observateur limité à un espace de noms n’inclut pas ces exécutions. Modifier la configuration ne réaffecte pas les instances existantes. Le démarrage d’une instance existante via un autre espace de noms est rejeté.

### Portée de l’espace de noms dans Waterline {#waterline-namespace-scoping}

Lorsque Waterline utilise une base partagée avec plusieurs espaces de noms, définissez `WATERLINE_NAMESPACE` pour limiter toutes les listes à un seul espace :

```env
WATERLINE_NAMESPACE=production
```

Ce réglage injecte un filtre d’espace de noms dans chaque requête de visibilité pour que Waterline n’affiche que les workflows de l’espace configuré. Il limite aussi toutes les commandes (annulation, signal, arrêt forcé, mise à jour, réparation, archivage et requêtes de lecture) à cet espace. Une commande ciblant une instance ou une exécution d’un autre espace renvoie une erreur 404 au lieu de s’exécuter.

### Portée des commandes par espace de noms {#command-namespace-scoping}

`WorkflowStub::load()`, `loadSelection()` et `loadRun()` acceptent un paramètre facultatif `namespace` :

```php
use Workflow\V2\WorkflowStub;

// Load only if the instance belongs to the given namespace
$stub = WorkflowStub::load('order-12345', namespace: 'production');

// Load a specific run, scoped to namespace
$stub = WorkflowStub::loadRun($runId, namespace: 'production');

// Load a specific selection, scoped to namespace
$stub = WorkflowStub::loadSelection('order-12345', $runId, namespace: 'production');
```

Lorsque `namespace` vaut `null` (par défaut), le chargement porte sur tous les espaces de noms, ce qui préserve la compatibilité ascendante. Si un espace est fourni, la requête filtre par espace de noms au niveau de la base de données et lève `ModelNotFoundException` si le workflow n’existe pas dans cet espace.

Les méthodes de commande du plan de contrôle (`signal`, `cancel`, `terminate`, `update`, `repair`, `archive`) acceptent aussi `namespace` dans leur tableau d’options :

```php
$controlPlane->cancel('order-12345', [
    'namespace' => 'production',
]);
```

### Filtrage des passerelles de tâches par espace de noms {#task-bridge-namespace-filtering}

Les passerelles de tâches de workflow et d’activité acceptent toutes deux un paramètre facultatif `namespace` dans `poll()` :

```php
$tasks = $bridge->poll('redis', 'default', limit: 10, namespace: 'production');
```

Sans ce paramètre, `poll()` renvoie les tâches de tous les espaces de noms (compatible avec les installations antérieures aux espaces de noms).

## Alias de types durables {#durable-type-aliases}

Les clés de types durables des workflows et activités sont stockées lorsque vous les enregistrez sous `workflows.v2.types`. Les données d’échec peuvent utiliser le même schéma pour les classes d’exception :

```php
'v2' => [
    'types' => [
        'workflows' => [
            'billing.invoice-sync' => App\Workflows\InvoiceSyncWorkflow::class,
        ],
        'activities' => [
            'payments.capture' => App\Activities\CapturePaymentActivity::class,
        ],
        'exceptions' => [
            'billing.invoice-declined' => App\Exceptions\InvoiceDeclined::class,
        ],
        'exception_class_aliases' => [
            App\Exceptions\LegacyInvoiceDeclined::class => App\Exceptions\InvoiceDeclined::class,
        ],
    ],
],
```

Lorsqu’un échec d’activité, de mise à jour, de workflow enfant ou de workflow est enregistré avec un alias d’exception, le moteur stocke cet alias comme `exception_type` dans l’historique typé et comme `type` dans les données d’échec. La relecture résout l’alias avant de se rabattre sur la classe PHP enregistrée. Un déplacement ultérieur de classe préserve donc la sémantique des `catch` du workflow tant que l’alias pointe vers la classe d’exception actuelle.

Pour les échecs v1 importés et enregistrés avant l’existence d’un alias d’exception, `workflows.v2.types.exception_class_aliases` peut associer l’ancien nom de classe pleinement qualifié à la classe d’exception actuelle. Les alias durables `exceptions` restent prioritaires. La table d’alias de classes sert uniquement de passerelle de refactorisation pour les données déjà enregistrées sans `type` durable. Les nouveaux workflows doivent utiliser des alias de types d’exception durables afin que l’historique soit indépendant des noms de classes PHP.

La version finale v2 écrit les alias d’exception durables lors de l’enregistrement de l’échec. Configurez donc des alias stables avant d’enregistrer des échecs dont les classes d’exception pourraient être déplacées.

Si un échec relu ne peut être résolu ni par la table durable `exceptions`, ni par les alias de classes, ni par la classe enregistrée, le moteur ne le remplace pas par une exception générique dans le code du workflow. La relecture d’une requête de lecture lève `UnresolvedWorkflowFailureException`, Waterline marque l’échec avec `exception_replay_blocked = true`, et une tâche de worker rencontrant la même absence reste en échec tandis que l’exécution reste ouverte. Corrigez l’association et réparez l’exécution au lieu de compter sur des blocs généraux `catch (RuntimeException)` pour traiter les échecs historiques renommés.
