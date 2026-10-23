---
sidebar_position: 9
---

# Tests {#testing}

## Relecture avant déploiement ou retour arrière {#replay-before-deployment}

Conservez les exports d’exécutions sélectionnées parmi des workflows ouverts et récemment clôturés représentatifs. Couvrez les chemins d’activités, de reprises, de signaux, de mises à jour, de workflows enfants, de temporisateurs et de marqueurs de version que le candidat peut rencontrer. Gardez chaque génération de continue-as-new nécessaire. Utilisez des historiques non élagués avec les octets d’origine des charges utiles et leurs codecs disponibles. Un indicateur d’export ne prouve pas à lui seul l’exhaustivité. Consultez les [limites de rétention](./configuration/pruning-workflows.md).

### PHP embarqué {#embedded-php-replay}

Utilisez Workflow **2.11.4 ou ultérieur** pour `workflow:v2:history-export` afin de préserver les types flottants de valeur entière, les flottants imbriqués et le signe du zéro, comme `1.0` et `-0.0`, dans les nouveaux bundles JSON. Vérifiez `composer.lock` dans l’artefact exécutant réellement `artisan` ; la combinaison sélectionnée séparément peut fixer une ancienne version. L’[acceptation du writer installé normalement](https://github.com/durable-workflow/workflow/issues/912#issuecomment-6364964505) couvre les sorties compact/pretty d’exécutions en attente/terminées sans remplacer la checksum originale. Cela qualifie le writer et l’intégrité, pas votre code de workflow candidat.

Un ancien JSON ayant perdu de l’information reste invalide : 2.11.4 ne le réinterprète ni ne le répare. Si le stockage faisant autorité et les octets de payload originaux sont disponibles, réexportez avec le producteur corrigé. Conservez le bundle généré intact ; ne convertissez pas les nombres et ne modifiez pas checksum/version pour forcer l’acceptation. Exécutez toujours le replay candidat et le contrôle de promotion ci-dessous.

Exportez depuis le stockage dont l’application est propriétaire. Définissez `WORKFLOW_ID` et `RUN_ID` pour l’instance et l’exécution précisément sélectionnées :

```bash
php artisan workflow:v2:history-export "$WORKFLOW_ID" \
  --run-id="$RUN_ID" --output=replay-bundles/run.json
```

Exécutez la vérification dans l’artefact de l’application candidate, avec ses classes de workflow et sa configuration chargées. Placez les rapports hors du répertoire des bundles. Utilisez un environnement CI isolé sans identifiants permettant des effets externes en production :

```bash
php artisan workflow:v2:replay-verify replay-bundles/run.json \
  --json --output=replay-one.json
php artisan workflow:v2:replay-simulate replay-bundles \
  --json --output=replay-report.json
```

Un code de sortie non nul bloque la promotion. Un code nul peut encore exiger une revue. Enregistrez ce contrôle du rapport de lot dans `gate-replay.php`, puis exécutez `php gate-replay.php replay-report.json` dans la CI :

```php
<?php
$report = json_decode(file_get_contents($argv[1]), true, 512, JSON_THROW_ON_ERROR);
$evidence = $report['evidence'] ?? [];
$count = $evidence['bundle_count'] ?? 0;
$allowed = ($report['promotion_decision'] ?? null) === 'safe_to_promote'
    && $count > 0
    && ($evidence['missing_bundle_count'] ?? 1) === 0
    && ($evidence['replay_checked_count'] ?? 0) === $count;
exit($allowed ? 0 : 1);
```

`--skip-replay` vérifie seulement l’intégrité. Même un résultat sans anomalie n’autorise pas une promotion sûre pour la relecture. Un succès couvre uniquement les chemins enregistrés et le préfixe visible d’une exécution ouverte, pas les branches futures, la justesse métier ni le comportement réseau. Avant un retour arrière, testez l’ancien artefact sur les historiques déjà écrits par de nouveaux workers qu’il pourrait recevoir. Conservez aussi les tests unitaires et ceux utilisant un véritable moteur d’exécution.

### SDK en mode service {#service-sdk-replay}

Les images Server, leur CLI intégré et les exports HTTP de `dw`/SDK dépendent du producteur Server réel. La publication Core 2.11.4 seule ne met pas à jour ni ne qualifie ces artefacts. Suivez la [qualification distincte du pin de paquet, de l’image et des transports installés de Server #692](https://github.com/durable-workflow/server/issues/692) ; ne déduisez pas une correction HTTP du tag Core. Continuez à refuser les bundles invalides.

**PHP :** utilisez `DurableWorkflow\Worker\Replayer::replay()` avec le codec de l’application, le callable, la liste d’événements, l’entrée d’origine, la file et l’identité enregistrée de la tâche. Laissez `NonDeterministicWorkflow` faire échouer le test et vérifiez les commandes et résultats attendus. Voir les [tests de relecture PHP](https://php.durable-workflow.com/build/testing/).

**Python :** utilisez `Replayer.replay()` ou `verify_replay()` avec les workflows candidats enregistrés et vérifiez le résultat attendu. Le simple retour d’un objet ne constitue pas une assertion réussie. Fournissez le `start_input` d’origine décodé si les événements l’omettent : Core le stocke dans `payloads.arguments`. Préservez le type, les identifiants et le codec enregistrés. Voir les [API de relecture Python](https://python.durable-workflow.com/sdk-reference/#replay-captured-histories). `--simulate-bundles` vérifie l’intégrité, pas le code candidat. La compatibilité actuelle avec le schéma 2 est suivie dans [Python #173](https://github.com/durable-workflow/sdk-python/issues/173). Ne réécrivez ni version ni somme de contrôle pour contourner un refus.

**Rust :** le SDK **4.5.0 ou ultérieur** fournit `testing::WorkflowEnvironment` et `WorkflowHistory` pour les tests d’activités/workflows sans Server et la relecture d’exports autonomes. Réutilisez les enregistrements candidats, préservez l’entrée initiale/toutes les pages, puis affirmez la fin ou le préfixe en attente attendu. Une divergence renvoie `Error::NonDeterministicReplay` typé avec la séquence durable et les commandes attendues/réelles. Les nouvelles courses select et les autres chemins non pris en charge nécessitent l’intégration. Consultez les [tests Rust, règles de déterminisme et exemples de relecture](./polyglot/rust.md#offline-testing-and-replay).

## Garder les tests avec délais rapides {#keeping-delay-tests-fast}

Les délais des temporisateurs et le backoff des nouvelles tentatives durables
utilisent des secondes entières. Si une API de SDK accepte les fractions et les
arrondit vers le haut, 100 ms deviennent une seconde. Ces valeurs n’accélèrent
donc pas les tests comportant de nombreuses tentatives.

Pour les tests intégrés, utilisez `WorkflowStub::fake()`, simulez les résultats des
activités et avancez l’horloge de test Laravel du délai configuré. Appelez ensuite
`WorkflowStub::runReadyTasks()` pour traiter les tâches arrivées à échéance. Gardez
un nombre fini de tentatives. Un backoff de zéro seconde propre au test permet
de vérifier des tentatives bornées sans attendre réellement. Conservez un test
distinct du calendrier réel de backoff. Modifier l’horloge locale de test n’avance
pas celle d’un Server distant.

## `Workflow\V2` {#workflowv2}

`Workflow\V2\WorkflowStub::fake()` fournit un parcours de test déterministe dans
le processus pour les fonctionnalités simulées `V2` prises en charge.

- les tâches de workflow et d'activité prêtes s'exécutent directement sans attendre un worker de file
- les workflows enfants imbriqués s'exécutent comme de vraies exécutions `V2` imbriquées dans ce même mode simulé
- les activités simulées écrivent toujours des lignes durables `activity_executions`, de tâches et d'historique
- les contrôles de capacité du backend sont contournés dans ce parcours, donc `sync` reste utilisable en test
- `WorkflowStub::assertDispatched()`, `assertDispatchedTimes()`, `assertNotDispatched()` et `assertNothingDispatched()` couvrent les distributions d'activités `V2`
- `WorkflowStub::assertSignalSent()`, `assertSignalSentTimes()` et `assertSignalNotSent()` couvrent les signaux `V2` envoyés par `WorkflowStub::signal()` ou `signalWithStart()`
- `WorkflowStub::assertUpdateSent()`, `assertUpdateSentTimes()` et `assertUpdateNotSent()` couvrent les mises à jour `V2` envoyées par `WorkflowStub::update()`, `attemptUpdate()` ou `submitUpdate()`
- les tâches de temporisateur différées restent durablement en file jusqu'à leur échéance. Après avoir avancé le temps, `WorkflowStub::runReadyTasks()` exécute directement les tâches déjà échues

### Périmètre des tests de la première publication {#first-release-testing-scope}

Les fonctions suivantes ne font **pas** partie du mode simulé `V2` de la première
publication et pourront être ajoutées ultérieurement par des contrats additifs :

- il n'existe pas d'équivalent `V2` de l'ancien pont `resume()`
- il n'existe pas d'assistant dédié pour simuler un workflow enfant ou vérifier sa distribution. Les enfants s'exécutent comme de vraies exécutions `V2` imbriquées en mode simulé. Testez leurs sorties observables plutôt que de les simuler
- aucun rappel différé ne permet d'injecter des signaux ou mises à jour à des instants virtuels pendant une même exécution simulée. Avancez le temps et appelez `WorkflowStub::runReadyTasks()` entre des appels explicites de signal ou de mise à jour

`WorkflowStub::mock()` impose ce périmètre à l'exécution : passer une sous-classe
de `Workflow` lève une `LogicException` indiquant clairement de tester les
sorties observables des workflows enfants. Seules les classes `Activity` et les
clés de chaîne non résolues sont acceptées comme cibles de simulation.

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

final class MyWorkflow extends Workflow
{
    public function handle(): array
    {
        return [
            'result' => activity(MyActivity::class, 'Taylor'),
            'workflow_id' => $this->workflowId(),
            'run_id' => $this->runId(),
        ];
    }
}
```

```php
use Workflow\V2\Testing\ActivityFakeContext;
use Workflow\V2\WorkflowStub;

public function testWorkflow(): void
{
    WorkflowStub::fake();

    WorkflowStub::mock(MyActivity::class, function (ActivityFakeContext $context, string $name): string {
        $this->assertSame('Taylor', $name);
        $this->assertSame('my-workflow-id', $context->workflowId());

        return "Hello, {$name}!";
    });

    $workflow = WorkflowStub::make(MyWorkflow::class, 'my-workflow-id');
    $workflow->start();

    $this->assertTrue($workflow->refresh()->completed());
    $this->assertSame('Hello, Taylor!', $workflow->output()['result']);

    WorkflowStub::assertDispatched(MyActivity::class, function (string $name): bool {
        return $name === 'Taylor';
    });
}
```

Utilisez `WorkflowStub::assertDispatched()`, `assertDispatchedTimes()`,
`assertNotDispatched()` et `assertNothingDispatched()` pour vérifier les
distributions d'activités `V2` enregistrées.

Pour les workflows avec temporisateur, avancez le temps avec les assistants
Laravel puis videz explicitement la file des tâches échues :

```php
use function Workflow\V2\timer;
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;

final class MyTimerWorkflow extends Workflow
{
    public function handle(): array
    {
        timer(60);

        return ['done' => true];
    }
}

public function testTimerWorkflow(): void
{
    WorkflowStub::fake();

    $workflow = WorkflowStub::make(MyTimerWorkflow::class, 'timer-workflow');
    $workflow->start();

    $this->travel(60)->seconds();

    WorkflowStub::runReadyTasks();

    $this->assertTrue($workflow->refresh()->completed());
    $this->assertSame(['done' => true], $workflow->output());
}
```

`WorkflowStub::runReadyTasks()` ne traite que les tâches déjà échues. Il
n'avance pas l'horloge réelle et ne déclenche pas prématurément les temporisateurs futurs.

### Envoyer des signaux en mode simulé {#sending-signals-in-fake-mode}

Les workflows en attente de signal peuvent en recevoir en mode simulé. À l'appel
de `$workflow->signal(...)`, le moteur enregistre la commande durable et crée
une tâche de workflow. En mode simulé, elle s'exécute directement : le workflow
reprend donc de manière synchrone.

```php
use function Workflow\V2\activity;
use Workflow\V2\Attributes\Signal;
use function Workflow\V2\await;
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;

#[Signal('name-provided')]
final class ApprovalWorkflow extends Workflow
{
    public function handle(): array
    {
        $name = await('name-provided');
        $greeting = activity(GreetingActivity::class, $name);

        return ['name' => $name, 'greeting' => $greeting];
    }
}

public function testSignalWorkflow(): void
{
    WorkflowStub::fake();
    WorkflowStub::mock(GreetingActivity::class, 'Hello, Taylor!');

    $workflow = WorkflowStub::make(ApprovalWorkflow::class, 'approval-1');
    $workflow->start();

    // Workflow suspends at await('name-provided')
    $this->assertSame('waiting', $workflow->refresh()->status());

    // Send the signal — resumes the workflow inline
    $workflow->signal('name-provided', 'Taylor');

    $this->assertTrue($workflow->refresh()->completed());
    $this->assertSame('Taylor', $workflow->output()['name']);

    WorkflowStub::assertSignalSent('name-provided');
    WorkflowStub::assertSignalSentTimes('name-provided', 1);
    WorkflowStub::assertSignalNotSent('other-signal');
}
```

Utilisez `WorkflowStub::assertSignalSent()`, `assertSignalSentTimes()` et
`assertSignalNotSent()` pour vérifier les signaux envoyés pendant le test. La
forme avec rappel reçoit l'identifiant d'instance et les arguments du signal :

```php
WorkflowStub::assertSignalSent(
    'name-provided',
    fn (string $instanceId, string $name): bool =>
        $instanceId === 'approval-1' && $name === 'Taylor'
);
```

### Envoyer des mises à jour en mode simulé {#sending-updates-in-fake-mode}

Les mises à jour s'appliquent aussi directement en mode simulé. À l'appel de
`$workflow->attemptUpdate(...)` ou `$workflow->update(...)`, le moteur enregistre
la commande durable, crée une tâche qui applique la mise à jour et l'exécute directement :

```php
use Workflow\UpdateMethod;
use Workflow\V2\Attributes\Signal;
use function Workflow\V2\await;
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;

#[Signal('done')]
final class SettingsWorkflow extends Workflow
{
    private bool $enabled = false;

    public function handle(): array
    {
        await('done');

        return ['enabled' => $this->enabled];
    }

    #[UpdateMethod]
    public function toggle(bool $enabled): array
    {
        $this->enabled = $enabled;

        return ['enabled' => $this->enabled];
    }
}

public function testUpdateWorkflow(): void
{
    WorkflowStub::fake();

    $workflow = WorkflowStub::make(SettingsWorkflow::class, 'settings-1');
    $workflow->start();

    $this->assertSame('waiting', $workflow->refresh()->status());

    $result = $workflow->attemptUpdate('toggle', true);

    $this->assertTrue($result->accepted());

    WorkflowStub::assertUpdateSent('toggle');
    WorkflowStub::assertUpdateSentTimes('toggle', 1);
    WorkflowStub::assertUpdateNotSent('other-update');

    // Complete the workflow
    $workflow->signal('done');
    $this->assertTrue($workflow->refresh()->completed());
    $this->assertTrue($workflow->output()['enabled']);
}
```

Utilisez `WorkflowStub::assertUpdateSent()`, `assertUpdateSentTimes()` et
`assertUpdateNotSent()` pour vérifier les mises à jour envoyées pendant le test.
La forme avec rappel reçoit l'identifiant d'instance et les arguments de mise à jour :

```php
WorkflowStub::assertUpdateSent(
    'toggle',
    fn (string $instanceId, bool $enabled): bool =>
        $instanceId === 'settings-1' && $enabled === true
);
```

### Tester les résultats de démarrage et la politique de doublons {#testing-start-outcomes-and-duplicate-start-policy}

Utilisez `attemptStart()` pour vérifier les démarrages en double sans lever
d'exception. `StartResult` expose des assistants de résultat typés :

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

public function testRejectDuplicateStart(): void
{
    WorkflowStub::fake();
    WorkflowStub::mock(MyActivity::class, 'result');

    $workflow = WorkflowStub::make(MyWorkflow::class, 'order-123');

    $first = $workflow->start('Taylor');
    $this->assertTrue($first->startedNew());

    $second = WorkflowStub::load('order-123');
    $duplicate = $second->attemptStart('Taylor');

    $this->assertTrue($duplicate->rejected());
    $this->assertTrue($duplicate->rejectedDuplicate());
    $this->assertSame('instance_already_started', $duplicate->rejectionReason());
}
```

Pour tester la politique qui renvoie l'exécution active existante, passez
`StartOptions::returnExistingActive()` :

```php
public function testReturnExistingActiveStart(): void
{
    WorkflowStub::fake();

    $workflow = WorkflowStub::make(MySignalWorkflow::class, 'order-123');
    $workflow->start();

    $this->assertSame('waiting', $workflow->refresh()->status());

    $second = WorkflowStub::load('order-123');
    $result = $second->attemptStart(StartOptions::returnExistingActive());

    $this->assertTrue($result->accepted());
    $this->assertTrue($result->returnedExistingActive());
    $this->assertSame($workflow->runId(), $result->runId());
}
```

Les deux politiques enregistrent des événements durables de commande et
d'historique. Vous pouvez donc vérifier aussi les lignes `WorkflowCommand` et
`WorkflowHistoryEvent` pour un contrôle plus approfondi.

### Tester le budget d'historique {#testing-history-budget}

Les champs `HistoryBudget` (`history_event_count`, `history_size_bytes`,
`continue_as_new_recommended`) sont exposés dans la projection de résumé et via
`RunDetailView`. Dans votre code, la classe de base `Workflow` les expose par
`$this->historyLength()`, `$this->historySize()` et `$this->shouldContinueAsNew()` :

```php
use Workflow\V2\Workflow;

final class LongRunningWorkflow extends Workflow
{
    public function handle(): void
    {
        while (true) {
            // ... process work ...

            if ($this->shouldContinueAsNew()) {
                Workflow::continueAsNew($this->carryForwardState());
            }
        }
    }
}
```

Pour tester les seuils du budget, configurez des valeurs basses et vérifiez la recommandation :

```php
public function testHistoryBudgetRecommendsContinueAsNew(): void
{
    config()->set('workflows.v2.history_budget.continue_as_new_event_threshold', 5);

    WorkflowStub::fake();

    // Run a workflow that produces enough history events to trip the threshold
    $workflow = WorkflowStub::make(ManyActivitiesWorkflow::class, 'budget-test');
    $workflow->start();

    $summary = $workflow->summary();
    $this->assertTrue($summary->continue_as_new_recommended);
}
```

## Ancien `Workflow\WorkflowStub` {#legacy-workflowworkflowstub}

:::warning Ancienne version v1

Les exemples de cette section utilisent le runtime v1 (`Workflow\Workflow`,
`use function Workflow\activity`, `execute()` de type générateur avec `yield`,
`Workflow\Models\StoredWorkflow`). Gardez ces modèles pour les tests qui
exercent encore des workflows v1 pendant la migration. Les nouveaux tests
doivent utiliser `Workflow\V2\WorkflowStub::fake()` avec `Workflow\V2\Workflow`
et des méthodes `handle()` séquentielles, comme ci-dessus.

:::

### Workflows {#workflows}

Vous pouvez exécuter les workflows synchroniquement dans l'environnement de test
et simuler activités et enfants pour définir comportements et sorties attendus
sans exécuter leurs implémentations réelles.

```
use function Workflow\activity;
use Workflow\Workflow;

class MyWorkflow extends Workflow
{
    public function execute()
    {
        $result = yield activity(MyActivity::class);

        return $result;
    }
}
```

Pour tester ce workflow, appelez d'abord `WorkflowStub::fake()` puis simulez l'activité.

```
public function testWorkflow()
{
    WorkflowStub::fake();

    WorkflowStub::mock(MyActivity::class, 'result');

    $workflow = WorkflowStub::make(MyWorkflow::class);
    $workflow->start();

    $this->assertSame($workflow->output(), 'result');
}
```

Vous pouvez aussi fournir un rappel au lieu d'une valeur de résultat à
` WorkflowStub::mock()`.

Le `$context` du workflow et les arguments de l'activité courante sont aussi
transmis au rappel.

```
public function testWorkflow()
{
    WorkflowStub::fake();

    WorkflowStub::mock(MyActivity::class, function ($context) {
        return 'result';
    });

    $workflow = WorkflowStub::make(MyWorkflow::class);
    $workflow->start();

    $this->assertSame($workflow->output(), 'result');
}
```

Les méthodes `assertDispatched`, `assertNotDispatched` et `assertNothingDispatched`
permettent de vérifier les activités ou enfants distribués :

```
WorkflowStub::assertDispatched(MyActivity::class);

// Assert the activity was dispatched twice...
WorkflowStub::assertDispatched(MyActivity::class, 2);

WorkflowStub::assertNotDispatched(MyActivity::class);

WorkflowStub::assertNothingDispatched();
```

Vous pouvez passer une fermeture à `assertDispatched` ou `assertNotDispatched`
pour vérifier qu'une activité ou un enfant distribué satisfait un prédicat
donné. Les arguments de l'activité ou de l'enfant sont transmis au rappel.

```
WorkflowStub::assertDispatched(TestOtherActivity::class, function ($string) {
    return $string === 'other';
});
```

### Avancer le temps {#skipping-time}

En manipulant l'heure système avec `$this->travel()` ou `$this->travelTo()`, vous
pouvez simuler des workflows dépendant du temps et tester leurs délais,
attentes et autres logiques temporelles.

```
use function Workflow\{activity, timer};
use Workflow\Workflow;

class MyTimerWorkflow extends Workflow
{
    public function execute()
    {
        yield timer(60);

        $result = yield activity(MyActivity::class);

        return $result;
    }
}
```

Ce workflow attend 60 secondes avant d'exécuter l'activité. `$this->travel()`
et `$workflow->resume()` permettent de sauter cette attente dans l'ancien runtime.

```
public function testTimeTravelWorkflow()
{
    WorkflowStub::fake();

    WorkflowStub::mock(MyActivity::class, 'result');

    $workflow = WorkflowStub::make(MyTimerWorkflow::class);
    $workflow->start();

    $this->travel(120)->seconds();

    $workflow->resume();

    $this->assertSame($workflow->output(), 'result');
}
```

Les méthodes `$this->travel()` et `$this->travelTo()` utilisent
`Carbon::setTestNow()` en interne.

### Activités {#activities}

Tester une activité ressemble au test d'un job Laravel : créez-la manuellement
puis appelez sa méthode `handle()`.

```
$workflow = WorkflowStub::make(MyWorkflow::class);

$activity = new MyActivity(0, now()->toDateTimeString(), StoredWorkflow::findOrFail($workflow->id()));

$result = $activity->handle();
```

Les anciennes activités s'exécutent toujours via la méthode de job `handle()`
du runtime. Dans `Workflow\V2`, le code utilisateur des workflows et activités
se trouve aussi dans `handle()`.
