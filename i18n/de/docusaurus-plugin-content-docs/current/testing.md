---
sidebar_position: 9
---

# Testen {#testing}

## Replay vor Bereitstellung oder Rollback {#replay-before-deployment}

Bewahren Sie Exporte ausgewählter Runs aus repräsentativen offenen und kürzlich geschlossenen Workflows auf. Decken Sie die Aktivitäts-, Wiederholungs-, Signal-, Update-, Kind-Workflow-, Timer- und Versionsmarker-Pfade ab, auf die der Kandidat treffen kann. Behalten Sie jede benötigte Continue-as-new-Generation. Verwenden Sie ungekürzte Historien mit verfügbaren ursprünglichen Payload-Bytes und Codecs. Ein Exportkennzeichen allein beweist keine Vollständigkeit. Siehe die [Aufbewahrungsgrenzen](./configuration/pruning-workflows.md).

### Eingebettetes PHP {#embedded-php-replay}

Verwenden Sie Workflow **2.11.4 oder neuer** für `workflow:v2:history-export`, um ganzzahlige und verschachtelte Gleitkommawerte sowie das Vorzeichen von Null, etwa `1.0` und `-0.0`, in neuen JSON-Bundles zu erhalten. Prüfen Sie `composer.lock` im Artefakt, das `artisan` tatsächlich ausführt; die separat gewählte Installation kann eine ältere Version festlegen. Die [Abnahme des normal installierten Writers](https://github.com/durable-workflow/workflow/issues/912#issuecomment-6364964505) umfasst kompakte/formatierte Ausgaben wartender/abgeschlossener Läufe mit unveränderter ursprünglicher Prüfsumme. Das qualifiziert Writer und Integritätsprüfung, nicht Ihren Workflow-Kandidaten.

Älteres verlustbehaftetes JSON bleibt ungültig: 2.11.4 interpretiert oder repariert es nicht neu. Wenn maßgeblicher Speicher und ursprüngliche Payload-Bytes verfügbar sind, exportieren Sie mit dem korrigierten Producer erneut. Lassen Sie das erzeugte Bundle unverändert; erzwingen Sie keine Annahme durch Zahlenkonvertierung oder Änderungen an Prüfsumme/Version. Führen Sie weiterhin Kandidaten-Replay und die nachstehende Freigabeprüfung aus.

Exportieren Sie aus dem Datenspeicher der Anwendung. Setzen Sie `WORKFLOW_ID` und `RUN_ID` auf die genau ausgewählte Instanz und den Run:

```bash
php artisan workflow:v2:history-export "$WORKFLOW_ID" \
  --run-id="$RUN_ID" --output=replay-bundles/run.json
```

Führen Sie die Prüfung im Anwendungsartefakt des Kandidaten aus, mit geladenen Workflow-Klassen und dessen Konfiguration. Legen Sie Berichte außerhalb des Bundle-Verzeichnisses ab. Verwenden Sie eine isolierte CI-Umgebung ohne Zugangsdaten für produktive Seiteneffekte:

```bash
php artisan workflow:v2:replay-verify replay-bundles/run.json \
  --json --output=replay-one.json
php artisan workflow:v2:replay-simulate replay-bundles \
  --json --output=replay-report.json
```

Ein Rückgabecode ungleich null blockiert die Promotion. Auch bei null kann eine Prüfung nötig sein. Speichern Sie diese Prüfung des Sammelberichts als `gate-replay.php` und führen Sie `php gate-replay.php replay-report.json` in CI aus:

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

`--skip-replay` prüft nur die Integrität. Selbst ein einwandfreies Ergebnis erlaubt keine Aussage über Replay-sichere Promotion. Ein Erfolg deckt nur aufgezeichnete Pfade und den sichtbaren Präfix eines offenen Runs ab, keine künftigen Zweige, fachliche Korrektheit oder Netzwerkfunktionen. Prüfen Sie vor einem Rollback das ältere Artefakt gegen Historien, die neuere Worker bereits geschrieben haben und die es erhalten könnte. Behalten Sie zusätzlich Unit-Tests und Tests mit einer echten Laufzeitumgebung bei.

### Service-SDKs {#service-sdk-replay}

Server-Images, deren enthaltene CLI und HTTP-Exporte von `dw`/SDK hängen vom tatsächlichen Server-Producer ab. Der Core-Release 2.11.4 allein aktualisiert oder qualifiziert diese Artefakte nicht. Beachten Sie die separate [Paket-Pin-, Image- und installierte Transportqualifikation in Server #692](https://github.com/durable-workflow/server/issues/692); leiten Sie keine HTTP-Korrektur aus dem Core-Tag ab. Ungültige Bundles bleiben abzulehnen.

**PHP:** verwenden Sie `DurableWorkflow\Worker\Replayer::replay()` mit dem Codec der Anwendung, der aufrufbaren Funktion, Ereignisliste, ursprünglichen Eingabe, Queue und aufgezeichneten Task-Identität. Lassen Sie `NonDeterministicWorkflow` den Test fehlschlagen und prüfen Sie erwartete Befehle und Ergebnisse. Siehe [PHP-Replay-Tests](https://php.durable-workflow.com/build/testing/).

**Python:** verwenden Sie `Replayer.replay()` oder `verify_replay()` mit registrierten Kandidaten-Workflows und prüfen Sie das erwartete Ergebnis. Ein zurückgegebenes Objekt allein ist kein erfolgreicher Test. Übergeben Sie die ursprüngliche dekodierte `start_input`, wenn Ereignisse sie nicht enthalten: Core-Exporte speichern sie unter `payloads.arguments`. Behalten Sie aufgezeichneten Typ, IDs und Codec bei. Siehe [Python-Replay-APIs](https://python.durable-workflow.com/sdk-reference/#replay-captured-histories). `--simulate-bundles` prüft Integrität und keinen Kandidatencode. Die aktuelle Kompatibilität mit Schema 2 wird in [Python #173](https://github.com/durable-workflow/sdk-python/issues/173) verfolgt. Schreiben Sie weder Version noch Prüfsumme um, um eine Ablehnung zu umgehen.

**Rust:** SDK **4.5.0 oder neuer** bietet `testing::WorkflowEnvironment` und `WorkflowHistory` für Activity-/Workflow-Tests ohne Server sowie Replay vollständiger Exporte. Übernehmen Sie Kandidatenregistrierungen, bewahren Sie ursprüngliche Eingabe/alle Historienseiten und prüfen Sie Abschluss oder den erwarteten wartenden Präfix. Abweichungen liefern typisiertes `Error::NonDeterministicReplay` mit dauerhafter Sequenz und erwarteten/tatsächlichen Befehlen. Neue Select-Rennen und andere nicht unterstützte Ausführungspfade brauchen Integrationstests. Siehe [Rust-Tests, Determinismusregeln und Replay-Beispiele](./polyglot/rust.md#offline-testing-and-replay).

## Tests mit Verzögerungen schnell halten {#keeping-delay-tests-fast}

Timer-Verzögerungen und dauerhafter Retry-Backoff verwenden ganze Sekunden. Akzeptiert
eine SDK-API Sekundenbruchteile und rundet sie auf, wird aus 100 ms eine Sekunde.
Solche Werte beschleunigen Tests mit vielen Wiederholungen daher nicht.

Verwenden Sie für eingebettete Tests `WorkflowStub::fake()`, simulieren Sie die
Ergebnisse von Aktivitäten und stellen Sie Laravels Testuhr um die konfigurierte
Verzögerung vor. Rufen Sie anschließend `WorkflowStub::runReadyTasks()` auf, um
fällige Arbeit auszuführen. Begrenzen Sie die Anzahl der Versuche. Ein Backoff von
null Sekunden nur im Test prüft begrenzte Wiederholungen ohne reale Wartezeit.
Behalten Sie einen separaten Test des tatsächlichen Backoff-Zeitplans bei.
Eine lokale Testuhr stellt die Uhr eines entfernten Servers nicht vor.

## `Workflow\V2` {#workflowv2}

`Workflow\V2\WorkflowStub::fake()` bietet einen deterministischen Inline-Testpfad für den unterstützten Funktionsumfang des `V2`-Fakes.

- Bereite Workflow- und Aktivitätsaufgaben werden direkt ausgeführt, statt auf einen Warteschlangen-Worker zu warten.
- Verschachtelte untergeordnete Workflows laufen als echte verschachtelte `V2`-Läufe im selben Fake-Modus.
- Aktivitäts-Mocks schreiben weiterhin dauerhafte Zeilen in `activity_executions`, Aufgaben und Historie.
- Backend-Fähigkeitsprüfungen werden für den Fake-Pfad umgangen, sodass `sync` in Tests nutzbar bleibt.
- `WorkflowStub::assertDispatched()`, `assertDispatchedTimes()`, `assertNotDispatched()` und `assertNothingDispatched()` prüfen `V2`-Aktivitätszuteilungen.
- `WorkflowStub::assertSignalSent()`, `assertSignalSentTimes()` und `assertSignalNotSent()` prüfen `V2`-Signale, die über `WorkflowStub::signal()` oder `signalWithStart()` gesendet wurden.
- `WorkflowStub::assertUpdateSent()`, `assertUpdateSentTimes()` und `assertUpdateNotSent()` prüfen `V2`-Updates, die über `WorkflowStub::update()`, `attemptUpdate()` oder `submitUpdate()` gesendet wurden.
- Verzögerte Timeraufgaben bleiben bis zur Fälligkeit dauerhaft eingereihte Arbeit. Nach dem Vorstellen der Zeit arbeitet `WorkflowStub::runReadyTasks()` bereits fällige Aufgaben direkt ab.

### Testumfang der ersten Veröffentlichung {#first-release-testing-scope}

Folgendes gehört **nicht** zum `V2`-Fake-Umfang der ersten Veröffentlichung und kann künftig als additiver Vertrag ergänzt werden:

- Es gibt keine `V2`-Entsprechung der älteren `resume()`-Bridge.
- Es gibt keinen eigenen Mock oder Zuteilungsprüfhelfer für untergeordnete Workflows. Diese laufen im Fake-Modus als echte verschachtelte `V2`-Läufe. Testen Sie deshalb ihre beobachtbare Ausgabe.
- Es gibt keinen Hook für verzögerte Callbacks, um innerhalb einer Fake-Ausführung Signale oder Updates zu virtuellen Zeitversätzen einzufügen. Stellen Sie stattdessen zwischen expliziten Signal-/Update-Aufrufen die Zeit vor und rufen Sie `WorkflowStub::runReadyTasks()` auf.

`WorkflowStub::mock()` setzt diese Grenze zur Laufzeit durch: Die Übergabe einer `Workflow`-Unterklasse löst eine `LogicException` mit einem klaren Hinweis aus, untergeordnete Workflows über ihre beobachtbare Ausgabe zu testen. Nur `Activity`-Klassen und nicht aufgelöste String-Schlüssel werden als Mock-Ziele akzeptiert.

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

Verwenden Sie `WorkflowStub::assertDispatched()`, `assertDispatchedTimes()`, `assertNotDispatched()` und `assertNothingDispatched()`, um die aufgezeichneten `V2`-Aktivitätszuteilungen zu prüfen.

Stellen Sie bei timerbasierten Workflows die Zeit mit Laravels Zeitreisehelfern vor und arbeiten Sie danach die fällige Aufgabenwarteschlange explizit ab:

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

`WorkflowStub::runReadyTasks()` arbeitet nur bereits fällige Aufgaben ab. Es stellt die reale Uhrzeit nicht vor und löst künftig verzögerte Timer nicht vorzeitig aus.

### Signale im Fake-Modus senden {#sending-signals-in-fake-mode}

Workflows, die auf Signale warten, können diese im Fake-Modus empfangen. Beim Aufruf von `$workflow->signal(...)` zeichnet die Engine den dauerhaften Signalbefehl auf und erstellt eine Workflow-Aufgabe. Im Fake-Modus wird diese direkt ausgeführt, sodass der Workflow synchron fortsetzt:

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

Mit `WorkflowStub::assertSignalSent()`, `assertSignalSentTimes()` und `assertSignalNotSent()` prüfen Sie, welche Signale im Test gesendet wurden. Die Callback-Form erhält Instanz-ID und Signalargumente:

```php
WorkflowStub::assertSignalSent(
    'name-provided',
    fn (string $instanceId, string $name): bool =>
        $instanceId === 'approval-1' && $name === 'Taylor'
);
```

### Updates im Fake-Modus senden {#sending-updates-in-fake-mode}

Updates werden im Fake-Modus ebenfalls direkt angewendet. Bei `$workflow->attemptUpdate(...)` oder `$workflow->update(...)` zeichnet die Engine den dauerhaften Update-Befehl auf, erstellt eine Workflow-Aufgabe zum Anwenden des Updates und führt sie direkt aus:

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

Mit `WorkflowStub::assertUpdateSent()`, `assertUpdateSentTimes()` und `assertUpdateNotSent()` prüfen Sie, welche Updates im Test gesendet wurden. Die Callback-Form erhält Instanz-ID und Update-Argumente:

```php
WorkflowStub::assertUpdateSent(
    'toggle',
    fn (string $instanceId, bool $enabled): bool =>
        $instanceId === 'settings-1' && $enabled === true
);
```

### Startergebnisse und Richtlinie für doppelte Starts testen {#testing-start-outcomes-and-duplicate-start-policy}

Verwenden Sie `attemptStart()`, um das Verhalten bei doppelten Starts ohne ausgelöste Ausnahmen zu prüfen. `StartResult` bietet typisierte Ergebnishelfer:

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

Übergeben Sie `StartOptions::returnExistingActive()`, um die Richtlinie zur Rückgabe eines bestehenden aktiven Workflows zu testen:

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

Beide Richtlinien zeichnen dauerhafte Befehls- und Historienereignisse auf. Für tiefere Prüfungen können Sie daher auch Zeilen von `WorkflowCommand` und `WorkflowHistoryEvent` prüfen.

### Historienbudget testen {#testing-history-budget}

Die Felder von `HistoryBudget` (`history_event_count`, `history_size_bytes`, `continue_as_new_recommended`) erscheinen in der Zusammenfassungsprojektion des Laufes und sind über `RunDetailView` verfügbar. Im Workflow-Code stellt die Basisklasse `Workflow` sie als `$this->historyLength()`, `$this->historySize()` und `$this->shouldContinueAsNew()` bereit:

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

Setzen Sie zum Testen der Historienbudgetschwellen niedrige Werte und prüfen Sie die Empfehlung:

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

## Älteres `Workflow\WorkflowStub` {#legacy-workflowworkflowstub}

:::warning Ältere Version v1

Die Beispiele dieses Abschnitts verwenden die v1-Laufzeit (`Workflow\Workflow`, `use function Workflow\activity`, generatorbasiertes `execute()` mit `yield`, `Workflow\Models\StoredWorkflow`). Behalten Sie diese Muster für Tests bei, die während der Migration weiterhin v1-Workflows prüfen. Neue Tests sollten wie oben `Workflow\V2\WorkflowStub::fake()` mit `Workflow\V2\Workflow` und geradlinigen `handle()`-Methoden verwenden.

:::

### Workflows {#workflows}

Sie können Workflows in Ihrer Testumgebung synchron ausführen und Aktivitäten sowie untergeordnete Workflows mocken, um erwartetes Verhalten und Ausgaben ohne Ausführung der tatsächlichen Implementierung festzulegen.

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

Den obigen Workflow testen Sie, indem Sie zuerst `WorkflowStub::fake()` aufrufen und dann die Aktivität mocken.

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

Sie können ` WorkflowStub::mock()` statt eines Ergebniswerts auch einen Callback übergeben.

Der Workflow-`$context` sowie alle Argumente der aktuellen Aktivität werden ebenfalls an den Callback übergeben.

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

Mit `assertDispatched`, `assertNotDispatched` und `assertNothingDispatched` können Sie prüfen, welche Aktivitäten oder untergeordneten Workflows zugeteilt wurden:

```
WorkflowStub::assertDispatched(MyActivity::class);

// Assert the activity was dispatched twice...
WorkflowStub::assertDispatched(MyActivity::class, 2);

WorkflowStub::assertNotDispatched(MyActivity::class);

WorkflowStub::assertNothingDispatched();
```

Sie können `assertDispatched` oder `assertNotDispatched` eine Closure übergeben, um zu prüfen, ob eine zugeteilte Aktivität oder ein untergeordneter Workflow eine bestimmte Wahrheitsbedingung erfüllt. Die Argumente der Aktivität oder des untergeordneten Workflows werden an den Callback übergeben.

```
WorkflowStub::assertDispatched(TestOtherActivity::class, function ($string) {
    return $string === 'other';
});
```

### Zeit überspringen {#skipping-time}

Durch Verändern der Systemzeit mit `$this->travel()` oder `$this->travelTo()` simulieren Sie zeitabhängige Workflows. So testen Sie Timeouts, Verzögerungen und andere zeitabhängige Logik Ihrer Workflows.

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

Der obige Workflow wartet vor der Aktivität 60 Sekunden. Mit `$this->travel()` und `$workflow->resume()` lässt sich diese Wartezeit in der älteren Laufzeit überspringen.

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

Die Helfermethoden `$this->travel()` und `$this->travelTo()` verwenden intern `Carbon::setTestNow()`.

### Aktivitäten {#activities}

Aktivitäten testen Sie ähnlich wie Laravel-Jobs: Erstellen Sie die Aktivität manuell und rufen Sie dann `handle()` auf.

```
$workflow = WorkflowStub::make(MyWorkflow::class);

$activity = new MyActivity(0, now()->toDateTimeString(), StoredWorkflow::findOrFail($workflow->id()));

$result = $activity->handle();
```

Beachten Sie, dass ältere Aktivitäten weiterhin über die Laufzeit-Jobmethode `handle()` ausgeführt werden. In `Workflow\V2` steht benutzerdefinierter Workflow- und Aktivitätscode ebenfalls in `handle()`.
