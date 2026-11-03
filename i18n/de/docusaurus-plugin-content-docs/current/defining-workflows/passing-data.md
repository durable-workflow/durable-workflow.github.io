---
sidebar_position: 4
---

# Daten übergeben {#passing-data}

Sie können Daten über die Methode `start()` an einen Workflow übergeben.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class);
$workflow->start('world');
```

Die Argumente werden an die Methode `handle()` des Workflows übergeben.

Ebenso können Sie Daten über die Hilfsfunktion `activity()` an eine Aktivität
übergeben.

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle($name)
    {
        return activity(MyActivity::class, $name);
    }
}
```

Die Argumente werden an die Methode `handle()` der Aktivität übergeben.

```php
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public function handle($name)
    {
        return "Hello, {$name}!";
    }
}
```

import PassingDataSimulator from '@site/src/components/PassingDataSimulator';

<PassingDataSimulator />

Übergeben Sie auf diese Weise grundsätzlich nur kleine Datenmengen. Schreiben
Sie größere Datenmengen stattdessen in die Datenbank, den Cache oder das
Dateisystem. Übergeben Sie dann den Schlüssel oder Dateipfad an den Workflow und
die Aktivitäten. Die Aktivitäten können damit die Daten lesen.

Wenn die Anwendung tatsächlich große Byte-Mengen durch die Historie
transportieren muss, etwa Dokumente, Medienblobs oder serialisierte Exporte,
aktivieren Sie [externen Payload-Speicher](../features/external-payload-storage.md)
im Namespace. Die Laufzeit lagert Payloads oberhalb des Schwellenwerts in einen
konfigurierten Objektspeicher aus und zeichnet einen überprüfbaren
Referenzumschlag in der Historie auf. So bleibt die Replay-Integrität erhalten,
während die [strukturelle Grenze `payload_size_bytes`](../constraints/structural-limits.md#payload-size)
eingehalten wird.

## Ausgabe {#output}

Nach Abschluss des Workflows können Sie die Ausgabe mit der Methode `output()`
abrufen.

```php
$workflow->output();
=> 'Hello, world!'
```

## Modelle {#models}

V2-Payloads verwenden ein portables Werteformat. Ein Eloquent-Modell kann daher kein Argument oder Ergebnis eines Workflows oder einer Aktivität sein. Übergeben Sie den Schlüssel des Modells und laden Sie das Modell in der Aktivität, die es verwendet.

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(int $userId)
    {
        return activity(MyActivity::class, $userId);
    }
}
```

```php
use App\Models\User;
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public function handle(int $userId)
    {
        $user = User::findOrFail($userId);

        return "Hello, {$user->name}!";
    }
}
```

Laden Sie Modelle in Aktivitäten, nicht im Workflow-Code. Workflow-Code wird beim Replay erneut ausgeführt, und eine Datenbankabfrage kann bei einem späteren Replay andere Zeilen liefern.

Wenn Sie ein Modell an `start()` übergeben, wird eine `InvalidArgumentException` ausgelöst. Wenn Sie ein Modell an `activity()` übergeben, schlägt der Workflow-Lauf fehl. Beide Fehlermeldungen beginnen mit `unsupported_value_type`.

Dieselbe Regel gilt für Eloquent-Collections. Übergeben Sie stattdessen ein Array von Schlüsseln. Wenn die Aktivität nur wenige Attribute benötigt, übergeben Sie nur diese Werte als Array. Die Workflow-Historie speichert sie, daher dürfen sie niemals Zugangsdaten oder andere Geheimnisse enthalten.

In v1 erhielten Workflows und Aktivitäten Modelle über `SerializesModels`. Dabei wurde ein Modellbezeichner gespeichert und das Modell bei der Ausführung des Jobs neu geladen. V2 macht das nicht.

## Dependency Injection {#dependency-injection}

Zusätzlich zur Datenübergabe können Sie Abhängigkeiten über Typdeklarationen an
den `handle()`-Methoden von Workflow oder Aktivität anfordern. Der
Laravel-Service-Container injiziert diese Abhängigkeiten automatisch.

```php
use Illuminate\Contracts\Foundation\Application;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(Application $app)
    {
        if ($app->runningInConsole()) {
            // ...
        }
    }
}
```

Dependency Injection lockert den Workflow-Determinismus nicht. Ein Workflow
kann stabile Dienste wie den Laravel-Anwendungscontainer oder
Konfigurationsleser über Typdeklarationen anfordern. Injizierte Abhängigkeiten,
die Arbeit ausführen, benötigen aber weiterhin die passende dauerhafte Grenze.
Platzieren Sie externe Ein-/Ausgabe, Datenbankzugriffe, Dienstaufrufe oder
andere Arbeit, die fehlschlagen oder wiederholt werden kann, in
`activity(...)` oder `localActivity(...)`. Verwenden Sie `sideEffect()` nur für
einen einmaligen Replay-sicheren Wertesnapshot, der in der Historie eingefroren
werden soll, etwa die aktuelle Uhrzeit, erzeugten Zufall oder einen zum
Entscheidungszeitpunkt erfassten Konfigurationswert.
