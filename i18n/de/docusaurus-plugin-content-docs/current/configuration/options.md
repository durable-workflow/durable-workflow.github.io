---
sidebar_position: 2
---

# Optionen {#options}

Beim Definieren von Workflows und Aktivitäten stehen verschiedene Optionen zur
Verfügung. Dazu zählen die Zahl der Versuche vor einem Fehlschlag, Verbindung
und Queue sowie die maximal zulässige Laufzeit in Sekunden.

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

Die Eigenschaften `$connection` und `$queue` von `Workflow\V2\Workflow` und
`Workflow\V2\Activity` sind als `public ?string` deklariert und haben den
Standardwert `null`. Überschreibungen in Unterklassen müssen den nullable Typ
beibehalten, damit PHPs invariante Typregeln für öffentliche Eigenschaften die
erneute Deklaration akzeptieren. Verwenden Sie `null`, um die Standardverbindung
oder Standardqueue der Anwendung zu übernehmen, statt einen Wert fest
einzutragen.

Aktivitäts-Timeouts werden nicht über eine Klasseneigenschaft konfiguriert.
Verwenden Sie [`ActivityOptions`](#activityoptions) pro Aufruf, etwa
`startToCloseTimeout`, oder den beim Einplanen erstellten Snapshot der
Wiederholungsrichtlinie. Einstellungen für die Zeitsteuerung der Worker-Schleife
beschreibt auch die [Aufgabenreparaturrichtlinie](/docs/polyglot/server-config-reference#workflow-package-controls).

## StartOptions {#startoptions}

`Workflow\V2\StartOptions` enthält die Konfiguration für Sichtbarkeit,
Deduplizierung und Ausführungs-Timeout beim Workflow-Start. Es wählt keine Queue.
Das Queue-Routing wird durch die Klasseneigenschaften `$connection` und `$queue`
von Workflow und Aktivität sowie durch `ActivityOptions` pro Aufruf bestimmt.

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

`StartOptions` werden von der Workflow-Engine verarbeitet und nicht als
Argumente an die Methode `handle()` Ihres Workflows übergeben. Sie werden mit
dem Workflow gespeichert und für spätere Workflow-/Aktivitätszustellungen
verwendet, einschließlich Replay und Continue-as-new.

## ActivityOptions {#activityoptions}

`Workflow\V2\Support\ActivityOptions` ermöglicht das Überschreiben von Routing,
Wiederholungen und Timeouts pro Aktivitätsaufruf, ohne die Aktivitätsklasse
selbst ändern zu müssen:

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

## Verbindung {#connection}

Die Einstellung `$connection` legt fest, an welche Queue-Verbindung der Workflow
oder die Aktivität gesendet wird. Standardmäßig ist `$connection` nicht gesetzt;
dadurch wird die Standardverbindung verwendet. Sie können dies über die
Eigenschaft `$connection` der Workflow- oder Aktivitätsklasse überschreiben.

## Queue {#queue}

Die Einstellung `$queue` legt fest, welcher Queue der Workflow oder die
Aktivität hinzugefügt wird. Standardmäßig ist `$queue` nicht gesetzt; dadurch
wird die Standardqueue der angegebenen Verbindung verwendet. Sie können dies
über die Eigenschaft `$queue` der Workflow- oder Aktivitätsklasse überschreiben.

## Wiederholungen {#retries}

Die Einstellung `$tries` steuert die Gesamtzahl der Versuche einer Aktivität,
bevor sie als fehlgeschlagen gilt. Standardmäßig ist `$tries` gleich `1`
(ein einzelner Versuch ohne automatische Wiederholung). Setzen Sie `$tries`
auf einen Wert größer als `1`, um Wiederholungen zu erlauben, oder auf `0`, um
unbegrenzt zu wiederholen. Pro Aufruf lässt sich dies über
`ActivityOptions::$maxAttempts` überschreiben.

## Timeout {#timeout}

Die v2-Basisklasse `Activity` hat keine Klasseneigenschaft `$timeout`.
Konfigurieren Sie Aktivitäts-Timeouts pro Aufruf über
[`ActivityOptions`](#activityoptions) mit `startToCloseTimeout`,
`scheduleToStartTimeout`, `scheduleToCloseTimeout` oder `heartbeatTimeout`.
Die Laufzeit speichert beim Einplanen einen Snapshot der resultierenden
Wiederholungsrichtlinie in der Aktivitätsausführung. Dadurch bleibt der Timeout
für einen bereits eingeplanten Versuch stabil, selbst wenn eine spätere
Bereitstellung die Aktivitätsklasse oder Optionen ändert. Die Zeitsteuerung der
Zustellung auf Ebene der Worker-Schleife wird über die
[Aufgabenreparaturrichtlinie](/docs/polyglot/server-config-reference#workflow-package-controls)
gesteuert.

## Wartezeiten zwischen Versuchen {#backoff}

Die Methode `backoff` gibt ein Array von Ganzzahlen für den jeweiligen Versuch
zurück. Die Standardmethode `backoff` verwendet exponentiell anwachsende
Wartezeiten bis zu 2 Minuten. Sie können dies durch Implementieren der Methode
`backoff` in der Aktivitätsklasse überschreiben.

## Namespace {#namespace}

Workflows können zur Isolation mehrerer Namespaces einem Namespace zugeordnet
werden. Der konfigurierte Namespace gilt sowohl für die Start-API der
Steuerungsebene als auch für `Workflow\V2\WorkflowStub::make()->start()`.
Er wird in der neuen Instanz, Ausführung, den dauerhaften Aufgaben und der
Zusammenfassungsprojektion der Ausführung gespeichert. Aufgabenabfragen und
Waterline-Sichtbarkeitsfilter können Ergebnisse dann auf einen Namespace
beschränken. Verwenden Sie Workflow 2.4.2 oder neuer für eine konsistente
Namespace-Zuweisung über beide PHP-Start-APIs.

Namespace-Namen dürfen nur alphanumerische Kleinbuchstaben, Punkte, Unterstriche
und Bindestriche enthalten (entsprechend `[a-z0-9._-]+`, maximal 128 Zeichen).

Setzen Sie den Standard-Namespace über eine Umgebungsvariable:

```env
DW_V2_NAMESPACE=production
```

Oder in `config/workflows.php`:

```php
'v2' => [
    'namespace' => env('DW_V2_NAMESPACE'),
    // ...
],
```

Ein expliziter Namespace überschreibt den konfigurierten Standardwert. Der Stub
akzeptiert ihn als drittes Argument von `make()`:

```php
$workflow = \Workflow\V2\WorkflowStub::make(
    OrderProcessingWorkflow::class,
    'order-12345',
    'staging',
);
$workflow->start();
```

Die Steuerungsebene akzeptiert ihn in den Optionen von `start()`:

```php
$controlPlane->start('order-processing', 'order-12345', [
    'namespace' => 'staging',
    // ...
]);
```

Wenn kein Namespace konfiguriert oder explizit übergeben wird, behalten neue
Instanzen einen Namespace von `null`. Ein auf einen Namespace beschränkter
Beobachter schließt diese Ausführungen nicht ein. Konfigurationsänderungen
weisen vorhandene Instanzen nicht neu zu. Der Start einer vorhandenen Instanz
über einen anderen Namespace wird abgelehnt.

### Namespace-Beschränkung in Waterline {#waterline-namespace-scoping}

Wenn Waterline auf einer gemeinsamen Datenbank mit mehreren Namespaces
bereitgestellt wird, setzen Sie `WATERLINE_NAMESPACE`, um alle Listenansichten
auf einen Namespace zu beschränken:

```env
WATERLINE_NAMESPACE=production
```

Dadurch wird jeder Sichtbarkeitsabfrage ein Namespace-Filter hinzugefügt, sodass
Waterline nur Workflows des konfigurierten Namespace anzeigt. Wenn dieser Wert
gesetzt ist, beschränkt Waterline auch alle Befehlsoperationen (Abbrechen,
Signal, Beenden, Update, Reparieren, Archivieren und Abfragen) auf diesen
Namespace. Ein Befehl an eine Instanz oder Ausführung eines anderen Namespace
gibt 404 zurück, statt ausgeführt zu werden.

### Namespace-Beschränkung für Befehle {#command-namespace-scoping}

`WorkflowStub::load()`, `loadSelection()` und `loadRun()` akzeptieren einen
optionalen Parameter `namespace`:

```php
use Workflow\V2\WorkflowStub;

// Load only if the instance belongs to the given namespace
$stub = WorkflowStub::load('order-12345', namespace: 'production');

// Load a specific run, scoped to namespace
$stub = WorkflowStub::loadRun($runId, namespace: 'production');

// Load a specific selection, scoped to namespace
$stub = WorkflowStub::loadSelection('order-12345', $runId, namespace: 'production');
```

Wenn `namespace` den Standardwert `null` hat, erfolgt das Laden ohne
Beschränkung über alle Namespaces. Dies erhält die Rückwärtskompatibilität.
Wird ein Namespace angegeben, filtert die Abfrage auf Datenbankebene nach diesem
Namespace und wirft `ModelNotFoundException`, wenn der Workflow dort nicht
existiert.

Die Befehlsmethoden der Steuerungsebene (`signal`, `cancel`, `terminate`,
`update`, `repair`, `archive`) akzeptieren ebenfalls `namespace` in ihrem
Optionsarray:

```php
$controlPlane->cancel('order-12345', [
    'namespace' => 'production',
]);
```

### Namespace-Filterung in der Aufgabenbrücke {#task-bridge-namespace-filtering}

Sowohl die Workflow- als auch die Aktivitätsaufgabenbrücke akzeptieren bei
`poll()` einen optionalen Parameter `namespace`:

```php
$tasks = $bridge->poll('redis', 'default', limit: 10, namespace: 'production');
```

Ohne diesen Parameter liefert `poll()` Aufgaben aus allen Namespaces zurück
(rückwärtskompatibel mit Installationen vor Einführung von Namespaces).

## Dauerhafte Typaliase {#durable-type-aliases}

Dauerhafte Typschlüssel für Workflows und Aktivitäten werden bei der
Registrierung unter `workflows.v2.types` gespeichert. Fehler-Payloads können
dasselbe Muster für Ausnahmeklassen verwenden:

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

Wird ein Aktivitäts-, Update-, untergeordneter oder Workflow-Fehler mit einem
Ausnahmealias aufgezeichnet, speichert die Engine diesen Alias im typisierten
Verlauf als `exception_type` und im Fehler-Payload als `type`. Beim Replay wird
der Alias aufgelöst, bevor auf die aufgezeichnete PHP-Klasse zurückgegriffen
wird. So kann ein späterer Klassenumzug die `catch`-Semantik des Workflows
beibehalten, solange der Alias weiter auf die aktuelle Throwable-Klasse zeigt.

Bei importierten v1-Fehlern, die vor Einführung eines Ausnahmealias aufgezeichnet
wurden, kann `workflows.v2.types.exception_class_aliases` den aufgezeichneten
vollqualifizierten Legacy-Ausnahmenamen auf die aktuelle Throwable-Klasse
abbilden. Dauerhafte `exceptions`-Typaliase haben weiterhin Vorrang. Die
Klassenalias-Zuordnung ist nur eine Refactoring-Brücke für bereits
aufgezeichnete Payloads ohne dauerhaften `type`. Neue Workflows sollten
dauerhafte Ausnahmetypaliase verwenden, damit der Verlauf unabhängig von
PHP-Klassennamen bleibt.

Die finale v2 schreibt dauerhafte Ausnahmealiase beim Aufzeichnen des Fehlers.
Konfigurieren Sie daher stabile Aliase, bevor Sie Fehler aufzeichnen, deren
Throwable-Klassen später verschoben werden könnten.

Kann ein wiedergegebener Fehler weder über die dauerhafte `exceptions`-Zuordnung
noch über Klassenaliase oder die aufgezeichnete Klasse aufgelöst werden, fällt
die Engine im Workflow-Code nicht auf eine allgemeine Laufzeitausnahme zurück.
Beim Replay einer Abfrage wird `UnresolvedWorkflowFailureException` ausgelöst.
Waterline kennzeichnet den Fehler mit `exception_replay_blocked = true`.
Eine Worker-Aufgabe mit derselben Lücke bleibt fehlgeschlagen, während die
Ausführung offen bleibt. Korrigieren Sie die Zuordnung und reparieren Sie die
Ausführung, statt umbenannte historische Fehler über breite
`catch (RuntimeException)`-Blöcke behandeln zu wollen.
