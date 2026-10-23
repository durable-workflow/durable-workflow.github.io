---
sidebar_position: 15
---

# Versionierung {#versioning}

## Replay vor einem Build-Wechsel {#replay-before-changing-builds}

Prüfen Sie vor der Promotion eines Kandidaten repräsentative offene und kürzlich geschlossene Historien gegen dessen genauen Anwendungscode. Prüfen Sie vor einem Rollback die Historien des neueren Builds gegen das ältere Artefakt. Nutzen Sie die [Replay-Prüfung](../testing.md#replay-before-deployment); eine kompatible Routing-Kohorte oder erfolgreiche Integritätsprüfung allein beweist keine Replay-Kompatibilität.

Workflows können lange laufen, mitunter Monate oder Jahre. Daher müssen
Workflow-Definitionen häufig geändert werden, während Ausführungen noch laufen.
Ohne Versionierung würden Änderungen am Ausführungspfad beim Replay
Nichtdeterminismusfehler verursachen.

Mit dem Helfer `getVersion()` können Sie Änderungen durch versionierte
Verzweigungspunkte sicher in laufende Workflows einführen.

## Aufgezeichnete Eingabeargumente weiterentwickeln {#evolving-recorded-entry-arguments}

Ein Lauf behält die bei seinem Start aufgezeichneten Argumente. Eine neue Definition schreibt diese Eingabe nicht um. Beim Replay bindet die Laufzeit die gespeicherten Werte an die heutige Einstiegsmethode des Workflows, **bevor Code im Methodenrumpf ausgeführt wird**. Ein `getVersion()`- oder `patched()`-Zweig im Rumpf kann eine inkompatible Signatur nicht retten: Zuerst muss der Aufruf den Rumpf erreichen können.

Behalten Sie die Reihenfolge bestehender Positionsargumente bei und akzeptieren Sie deren aufgezeichnete Typen. Ein PHP-Standardwert ergänzt ein ausgelassenes Argument; er ersetzt keinen inkompatiblen Wert, der an dieser Position bereits aufgezeichnet wurde. Ein mit `[7]` gestarteter Lauf übergibt nach der Bereitstellung beispielsweise weiterhin die Ganzzahl `7`:

| Änderung der Einstiegsmethode | Wirkung auf die aufgezeichnete Eingabe `[7]` |
| --- | --- |
| `handle(int $amount)` → `handle(int $amount, string $currency = 'USD')` | Das alte Argument bleibt kompatibel; das neue letzte Argument kann seinen Standardwert verwenden. Auch die erneut abgespielten Befehle müssen kompatibel bleiben. |
| Ein erforderliches letztes Argument ohne Standardwert hinzufügen | Für dieses Argument hat der alte Lauf keinen Wert. |
| Führende Argumente einfügen, entfernen oder umordnen | Bestehende Werte können beim falschen Parameter landen. Gleiche Parameternamen reparieren keine positionelle Eingabe. |
| `int $amount` durch `string $amount` ersetzen | Die aufgezeichnete Ganzzahl ist keine Zeichenkette geworden. |
| `int $amount` durch `PaymentRequest $request` ersetzen | Dependency Injection ist keine Eingabemigration. Ein neu erzeugtes DTO darf den aufgezeichneten Betrag nicht durch Konstruktor-Standardwerte ersetzen. |
| Nur einen letzten Parameter entfernen | PHP kann den Aufruf akzeptieren. Prüfen Sie aber, dass der Bedeutungsverlust weder erneut abgespielte Befehle noch das Geschäftsverhalten verändert. |

Bevorzugen Sie einen zusätzlichen optionalen letzten Parameter oder einen neuen Workflow-Typ für einen anderen Eingabevertrag. Benötigen Sie intern ein neues DTO, erzeugen Sie es ausdrücklich aus kompatiblen aufgezeichneten Argumenten **im** Workflow-Rumpf und versionieren Sie dort Änderungen an dauerhaften Befehlen. Behalten Sie Code für jede unterstützte Eingabeform bei, solange entsprechende Läufe ihn benötigen. Testen Sie tatsächlich gespeicherte Eingaben mit der neuen Definition, einschließlich eines kalten Replay nach einer dauerhaften Wartephase. Tests nur mit neuen Starts decken diese Bereitstellungsgrenze nicht ab.

### Verhalten von Workflow 2.7.2 {#released-embedded-entry-behavior}

In Workflow **2.7.2** kann ein Fehler bei Argumentanzahl oder -typ am Einstieg zu einem terminalen `WorkflowFailed`-Ereignis werden. Manche Fehler bei der Auflösung von Abhängigkeiten lassen den Lauf dagegen offen, mit einer wiederholt fehlschlagenden Aufgabe. Der Wechsel von einem Skalar zu einem injizierten DTO mit Konstruktor-Standardwerten kann sogar eine Ausführung mit falschen Daten verursachen. Das sind unter [Workflow #866](https://github.com/durable-workflow/workflow/issues/866) erfasste Produktfehler, keine sichere Versionierungsstrategie.

Die Wiederherstellung kompatiblen Codes kann einen offenen, erneut zustellbaren Lauf wiederherstellen, öffnet aber keinen bereits terminalen Lauf. Weder `repair()` noch ein neuer Versionszweig verspricht, das fehlgeschlagene Original wiederzubeleben. Prüfen Sie zuerst den tatsächlichen Status und Fehler. Bewahren Sie Eingabe und Historie, während Sie die Wiederherstellung planen.

### Veröffentlichter eingebetteter Schutz {#embedded-entry-argument-safeguard}

Workflow **2.7.3** prüft aufgezeichnete Eingabeargumente vor dem Eintritt in Anwendungscode. Inkompatible Bindung führt zu einer typisierten `WorkflowEntryArgumentsMismatchException` und einer Replay-blockierten **Workflow-Aufgabe** mit `replay_blocked_reason = workflow_entry_arguments_mismatch`; der **Lauf bleibt nichtterminal**. Diagnosefelder nennen Workflow, Einstiegsmethode, Parameter sowie erwarteten und tatsächlichen Typ, ohne Argumentwerte zu kopieren. Ein neu injiziertes DTO, das aufgezeichnete Eingabe verwerfen würde, wird ebenfalls abgelehnt. Prüfen Sie das tatsächlich in der eingebetteten Anwendung installierte Workflow-Paket. Der Schutz öffnet keine terminalen Läufe aus älteren Versionen erneut.

Stellen Sie mit diesem veröffentlichten Schutz denselben noch offenen Originallauf so wieder her:

1. Prüfen Sie die Aufgabendiagnose des ausgewählten Laufs und bestätigen Sie `workflow_entry_arguments_mismatch`, statt diese Ursache bei jedem Aufgabenfehler anzunehmen.
2. Stellen Sie eine Definition wieder her, die die ursprünglich aufgezeichneten Argumente akzeptiert, oder stellen Sie einen kompatiblen Adapter im Workflow-Rumpf bereit. Bewahren Sie ursprüngliche Workflow-Identität, Eingabe, Historie und Fristen; bearbeiten Sie nicht den Speicher, um die neue Signatur passend zu machen.
3. Verwenden Sie nach Bereitstellung kompatiblen Codes die unterstützte Reparaturaktion für denselben noch offenen Lauf. Prüfen Sie anschließend, dass die ursprüngliche Arbeit fortgesetzt und ihr terminales Ergebnis genau einmal aufgezeichnet wird. Eine Reparatur verlängert die ursprüngliche Frist nicht; eine bereits abgelaufene Frist gilt weiterhin.

Der Schutz deutet Ausnahmen aus dem Workflow-Rumpf **nicht** in Bereitstellungsfehler um. Ein echter `TypeError` der Anwendung oder ein anderer unbehandelter Fehler im Rumpf folgt weiterhin dem normalen Workflow-Fehlerverhalten. Die unter [shared #220](https://github.com/durable-workflow/.github/issues/220) erfasste flottenweite Prüfung zum Ausmustern alter Zweige liefert er ebenfalls nicht.

### Separate Grenzen der Service-SDKs {#service-sdk-entry-boundaries}

Ein Fix im eingebetteten Core verändert nicht den SDK-Prozess, der Workflow-Code im Servicemodus ausführt. Die folgenden älteren veröffentlichten SDKs stammen aus der Zeit vor dem unter [shared #221](https://github.com/durable-workflow/.github/issues/221) erfassten Schutz am Workflow-Einstieg im Servicemodus:

| Veröffentlichtes SDK | Verhalten bei der Eingabebindung |
| --- | --- |
| [PHP 2.5.3](https://github.com/durable-workflow/sdk-php/tree/43d39bff50ccace0a309de41306cd350751ec575) | Ruft den registrierten Handler mit dem Kontext und danach der aufgezeichneten positionellen Eingabe auf. Ein `ArgumentCountError` oder `TypeError` am Einstieg kann dem allgemeinen Workflow-Fehlerpfad folgen. |
| [Python 2.6.1](https://github.com/durable-workflow/sdk-python/tree/150c6f6bc14e3516f75cc615b2f75f093ed84ea1) | Ruft `run(ctx, *start_input)` auf. Geänderte Argumentanzahl kann den Workflow fehlschlagen lassen; Typannotationen allein erzwingen keine Typen und konvertieren keine aufgezeichneten Werte. Fehler im Generatorrumpf sind ebenfalls Anwendungsfehler. |
| [Rust 3.5.5](https://github.com/durable-workflow/sdk-rust/tree/4d5047ba9da39785512340b0975ce28da09f0cee) | Der typisierte Adapter deserialisiert die Eingabe vor dem Aufruf seines Handlers mit fester Signatur. Ein geänderter Anfragetyp kann diese Dekodierung scheitern lassen. Das unterscheidet sich von positioneller PHP/Python-Bindung. Eine beiläufige Ablehnung wegen nicht verbrauchter Historie ist kein zugesagter wiederherstellbarer Signaturschutz. |

Halten Sie die Eingabekompatibilität im Dienstmodus und die tatsächliche SDK-Qualifikation von der eingebetteten Veröffentlichung getrennt. Fangen Sie nicht jeden `TypeError` oder jeden Rust-Handlerfehler ab, um ihn als Replay-sicher einzustufen: Das würde echte Anwendungsfehler verbergen.

### Schutz am Workflow-Einstieg im Servicemodus {#service-sdk-entry-safeguard}

**Veröffentlichte Unterstützung.** Server 2.9.9 sowie PHP SDK 2.5.4, Python SDK 2.6.2 und Rust SDK 3.5.6 haben den Einstiegsschutz und das nachfolgend beschriebene Routing-/Wiederherstellungsverhalten eingeführt. Dies sind die Mindestversionen für diese Funktionen. Installieren Sie aktuelle stabile Versionen, um Sicherheitskorrekturen zu erhalten.

Die vorbereiteten SDKs prüfen die aufgezeichnete Einstiegseingabe, bevor Anwendungscode des Workflows ausgeführt wird. Inkompatible Eingaben melden `workflow_entry_arguments_mismatch` als fehlgeschlagene, für Replay blockierte Workflow-**Aufgabe**, ohne `fail_workflow` zu senden oder den fachlichen **Lauf** zu schließen. Eingabe, Workflow-/Laufidentität, bestätigte Historie, Build-Bindung und ursprüngliche Fristen bleiben unverändert. PHP prüft erforderliche positionelle Argumente und deklarierte PHP-Typen. Python bindet die Signatur und prüft so Argumentanzahl und Standardwerte; Annotationen werden nicht zu Laufzeit-Typprüfungen. Die typisierten Rust-Adapter prüfen die Eingabedekodierung vor dem Aufruf des Handlers oder seiner Zustandsfabrik. Rohe Rust-Handler bleiben selbst für die Behandlung ihrer Anwendungseingaben verantwortlich.

Der spezifische `failure_reason` der Server-Aufgabe ist `workflow_entry_arguments_mismatch`; `replay_blocked_reason` bleibt der allgemeine Wert `worker_reported_replay_failure`. Prüfen Sie `latest_workflow_task_failure.reason` in der Debug-Antwort des ausgewählten Laufs. Verwechseln Sie diese Felder nicht mit der Diagnose des eingebetteten Core weiter oben. Erfolgreich gebundener Anwendungscode, der einen `TypeError` auslöst, einen Rust-Handlerfehler zurückgibt oder anderweitig fehlschlägt, folgt weiterhin dem normalen Verhalten für fachliche Fehler.

Stellen Sie Code wieder her, der die ursprüngliche aufgezeichnete Eingabe akzeptiert, und verwenden Sie dann das [unterstützte Verfahren zur Wiederherstellung desselben Originallaufs](../failures-and-recovery.md#service-entry-recovery). Ersetzen Sie Eingaben nicht durch DTO-Standardwerte, ändern Sie keine Historie und setzen Sie keine Frist zurück. Der Schutz öffnet keinen Originallauf erneut, den ein älterer Worker bereits terminal gemacht hat.

Sicheres Routing zu einem Ersatz benötigt außerdem die [Worker-Fähigkeit zur Einstiegsprüfung](../polyglot/worker-compatibility-routing.md#definition-fingerprint-evolution). Ein geänderter Fingerabdruck beweist weder Replay-Kompatibilität noch rechtfertigt er, den ursprünglichen Fingerabdruck eines Laufs umzuschreiben. Versionieren Sie Änderungen an dauerhaften Befehlen innerhalb einer kompatiblen Einstiegsmethode und testen Sie kaltes Replay vor der Promotion.

## Argumente und Ergebnisse von Aktivitäten weiterentwickeln {#evolving-activity-arguments-and-results}

Eine Aktivität hat zwei gespeicherte Verträge: die beim Einplanen aufgezeichneten Argumente und das beim Abschluss aufgezeichnete Ergebnis. Ein Deployment migriert keines von beiden. Das gilt für eingebettetes PHP und für Service-Worker mit den PHP-, Python- und Rust-SDKs.

Ein ausstehender Versuch oder eine Wiederholung erhält die ursprünglich eingeplanten Argumente. Welche Implementierung ausgeführt wird, bestimmen die Worker-Registrierung und die Routing-Richtlinie für Builds. Dabei kann weiterhin ein älterer Build zum Einsatz kommen. Ein neuer Build garantiert weder, dass jeder Versuch ihn verwendet, noch aktualisiert er Argumente in der Warteschlange.

Beim Replay einer abgeschlossenen Aktivität erhält der aktuelle Workflow-Code das aufgezeichnete Ergebnis, ohne die Aktivität erneut auszuführen. Ein passender Schritt und Aktivitätstyp sind keine Schemaprüfung der Argumente oder des Ergebnisses. Eine geänderte Datenstruktur kann deshalb im Anwendungscode fehlschlagen, ohne einen History-Konflikt auszulösen.

### Optionale Eingaben ergänzen und die Bedeutung alter Werte erhalten {#additive-activity-input}

Behalten Sie vorhandene Positionsargumente und ihre Bedeutung bei. In eingebettetem PHP ermöglicht ein optionaler letzter Parameter, bereits eingeplante Argumente wie `[7]` weiterhin anzunehmen:

```php
use Workflow\V2\Activity;

final class PriceActivity extends Activity
{
    public function handle(int $amount, string $currency = 'USD'): array
    {
        return ['amount' => $amount, 'currency' => $currency];
    }
}
```

Der Standardwert füllt ein fehlendes Argument. Er konvertiert weder einen inkompatiblen aufgezeichneten Wert noch korrigiert er eine andere Reihenfolge. Auch externe Auswirkungen müssen kompatibel bleiben: Eine Wiederholung kann nach dem Deployment erfolgen und muss weiterhin idempotent sein.

PHP-Handler im Service-Modus erhalten zuerst den Aktivitätskontext und danach die aufgezeichneten Positionsargumente. Python-Handler erhalten die Positionsargumente direkt. Beide benötigen Standardwerte für ausgelassene Argumente. Python-Typannotationen allein prüfen oder konvertieren keine Werte. Typisierte Rust-Aktivitäten deserialisieren einen einzelnen Anfragewert. Ergänzen Sie ein optionales Feld oder ein Feld mit einem expliziten Serde-Standardwert und behalten Sie die vorhandene Darstellung bei. Ein neues Pflichtfeld kann die Dekodierung bereits vor dem Rust-Handler scheitern lassen. Die Aktivitäts-APIs stehen in den SDK-Anleitungen für [PHP](https://php.durable-workflow.com/), [Python](https://python.durable-workflow.com/) und [Rust](https://rust.durable-workflow.com/).

### Alte Ergebnisse mit einem Ersatzwert lesen {#additive-activity-result}

Wenn ein neues Aktivitätsergebnis `currency` ergänzt, müssen Workflows weiterhin ältere abgeschlossene Ergebnisse annehmen, die nur `amount` enthalten:

```php
$result = activity(PriceActivity::class, 7);
$currency = $result['currency'] ?? 'USD';
```

Wählen Sie einen Ersatzwert, der die bisherige fachliche Bedeutung erhält. Behalten Sie ihn für jede History bei, die erneut abgespielt werden kann, einschließlich Abfragen und Wiederherstellung. Stellen Sie kompatible Leser vor dem Code bereit, der die neue Darstellung schreibt. Prüfen Sie auch die Leser eines Rollbacks mit neu aufgezeichneten Ergebnissen. Ein Standardwert für ein Aktivitätsargument ergänzt kein Feld in einem bereits aufgezeichneten Ergebnis.

### Für einen anderen Vertrag einen neuen Typ verwenden {#incompatible-activity-contract}

Wenn Sie ein Feld umbenennen, seine Darstellung oder seine fachliche Bedeutung ändern, behalten Sie den alten Aktivitätstyp bei und führen Sie einen neuen ein. Verwenden Sie einen `getVersion()`-Zweig im Workflow am Aufruf zur Einplanung, wenn alte Histories ihren bisherigen Aktivitätsschritt behalten und neue Runs den neuen Typ einplanen sollen. Ein Zweig innerhalb der Aktivität kann Argumente nicht reparieren, die schon vor Eintritt in den Funktionsrumpf fehlschlagen. Ein Versionsmarker schreibt auch keine Ergebnisse in der History um.

Prüfen Sie mit den tatsächlich installierten Paketen zwei Deployment-Grenzen in neuen Prozessen: mit altem Code einplanen und mit dem neuen Aktivitätscode ausführen; danach mit alter Aktivität abschließen und mit dem neuen Workflow-Code wiedergeben. Nehmen Sie inkompatible Eingaben und Ergebnisse als Fehlerkontrollen auf. Nehmen Sie nicht an, dass die oben beschriebenen Prüfungen am Workflow-Einstieg auch Aktivitätssignaturen oder den Ergebniszugriff der Anwendung schützen. Der bestätigte DTO-Fehler in eingebetteten Aktivitäten wird in [Workflow #910](https://github.com/durable-workflow/workflow/issues/910) verfolgt.

Prüfen Sie diese Aktivitätsverträge zusammen mit den Regeln für [aufgezeichnete Workflow-Startargumente](#evolving-recorded-entry-arguments) und der [Anleitung zum Weiterentwickeln von Signal-Nutzdaten](signals.md#evolve-a-signal-payload).

### Verifizierte Fehlergrenzen {#activity-compatibility-failures}

Die [Prüfungen veröffentlichter Pakete in #363](https://github.com/durable-workflow/durable-workflow.github.io/issues/363) nutzten neue Prozesse an jeder Deployment-Grenze. Dies sind geprüfte Ausgangsversionen, keine unterstützten Mindestversionen:

| Veröffentlichtes Paket | Inkompatible Aktivitätseingabe | Inkompatibler Ergebnisleser |
| --- | --- | --- |
| Eingebetteter Workflow 2.11.2 | Ein fehlendes Pflichtargument erzeugt `ArgumentCountError` und einen Aktivitätsfehler. | Der Zugriff auf ein fehlendes Array-Feld unter Laravels Fehlerbehandlung erzeugt `ErrorException` und einen Workflow-Fehler. |
| PHP SDK 3.2.0 mit Server 2.11.0 | Ein fehlendes Positionspflichtargument wird im Aktivitätsfehler als `ArgumentCountError` gemeldet. | Ein fehlendes Feld an einen Leser mit erforderlichem String-Argument zu übergeben erzeugt `TypeError` und einen Workflow-Fehler. |
| Python SDK 2.9.0 mit Server 2.11.0 | Ein fehlendes Positionspflichtargument erzeugt `TypeError` und einen Aktivitätsfehler. | Der Zugriff auf einen fehlenden Ergebnisschlüssel erzeugt `KeyError` und einen Workflow-Fehler. |
| Rust SDK 4.2.2 mit Server 2.11.0 | Ein neues Pflichtfeld der Anfrage lässt die typisierte Eingabedekodierung vor dem Aktivitätshandler scheitern. | Ein neues Pflichtfeld des Ergebnisses lässt die typisierte Ergebnisdekodierung im Workflow scheitern. |

Die Service-Prüfungen zeichneten `max_attempts = 1` auf. Der unbehandelte Aktivitätsfehler ließ anschließend den Workflow scheitern. Allgemein folgen Aktivitätsfehler ihrer aufgezeichneten Wiederholungs- und Timeout-Richtlinie. Ein Workflow kann einen Aktivitätsfehler nach ausgeschöpften Versuchen behandeln. Ein Fehler beim Ergebnislesen ist ein Anwendungsfehler im Workflow und keine Aufforderung, die abgeschlossene Aktivität zu wiederholen. Alle kompatiblen Erweiterungskontrollen schlossen mit dem ursprünglichen Betrag `7` und der Standardwährung `USD` ab, mit einem Aktivitätsversuch und ohne Reparaturen. Bei den Ergebniskontrollen blieb die abgeschlossene Aktivität abgeschlossen.

Eingebetteter Workflow 2.11.2 akzeptiert außerdem eine Signaturänderung, die den aufgezeichneten Skalar `7` durch ein injiziertes DTO mit Standardbetrag `0` ersetzt, und kann fälschlich mit `0` abschließen. [Workflow #910](https://github.com/durable-workflow/workflow/issues/910) verfolgt diesen Produktfehler. Verwenden Sie Dependency Injection nicht zur Migration von Aktivitätseingaben und nehmen Sie nicht an, dass die Workflow-Einstiegsprüfung diesen Fall abdeckt. Kompatiblen Code wiederherzustellen öffnet keinen bereits terminalen Run. Prüfen Sie den tatsächlichen Zustand und folgen Sie der [Wiederherstellungsanleitung](../failures-and-recovery.md), ohne aufgezeichnete Eingaben, History oder Fristen zu ändern.

## `getVersion` verwenden {#using-getversion}

`getVersion()` ist ein Replay-sicherer geradliniger Helfer. Jeder Änderungspunkt
zeichnet beim ersten Ausführen einen dauerhaften Versionsmarker für den Lauf
auf. Jedes spätere Replay verwendet diesen festgeschriebenen Wert, statt den
Zweig anhand des heutigen Codes neu zu berechnen. Alte Läufe, die vor einem neu
eingeführten Verzweigungspunkt begannen, erhalten vorsichtshalber
`DEFAULT_VERSION`.

```php
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;
use function Workflow\V2\{activity, getVersion};

final class MyWorkflow extends Workflow
{
    public function handle(): void
    {
        $version = getVersion(
            'my-change-id',
            WorkflowStub::DEFAULT_VERSION,
            1
        );

        if ($version === WorkflowStub::DEFAULT_VERSION) {
            activity(OldActivity::class);
        } else {
            activity(NewActivity::class);
        }
    }
}
```

## Funktionsweise {#how-it-works}

`getVersion()` hat drei Parameter:

- **changeId**: eine eindeutige Kennung für diesen Änderungspunkt.
- **minSupported**: die kleinste von diesem Code noch unterstützte Version.
- **maxSupported**: die höchste, aktuelle Version für neue Ausführungen.

Wenn ein Workflow `getVersion()` erreicht:

- **Neue Ausführungen** fügen ein typisiertes Historienereignis `VersionMarkerRecorded` mit `change_id`, gewählter `version` und unterstütztem Bereich an und geben `maxSupported` zurück.
- **Erneut abgespielte Ausführungen** geben die zuvor im Historienmarker aufgezeichnete Version zurück.
- **Läufe ohne Marker** fallen auf `WorkflowStub::DEFAULT_VERSION` zurück, wenn die Laufzeit feststellt, dass der Lauf vor der aktuellen Workflow-Definition begann. Sie prüft zuerst den Kompatibilitätsmarker des Laufs gegen den aktuellen Worker und vergleicht dann den dauerhaft gespeicherten `workflow_definition_fingerprint` mit der aktuell ladbaren Workflow-Klasse. Gleiche Fingerprints bedeuten dieselbe Definition; der Marker wird frisch aufgezeichnet. Bei unterschiedlichen Fingerprints stammt der Lauf von vor der Änderung und der Fallback greift. Läufe mit `WorkflowStarted`-Historie vor Einführung des Fingerprint-Snapshots erhalten vorsichtshalber `DEFAULT_VERSION`, weil die Laufzeit eine unveränderte Definition nicht beweisen kann. Dieser vorsichtige Fallback ist die festgelegte 2.0-Richtlinie für Läufe ohne Fingerprint: Die Laufzeit blockiert die Übernahme nicht allein wegen eines fehlenden aufgezeichneten Fingerprints. Der Fallback fügt keinen synthetischen Marker an und verbraucht keinen neuen Workflow-Schritt.
- **Abfragemethoden** spielen vor Aufruf der annotierten Methode denselben festgeschriebenen Versionsmarker erneut ab. Abfragen sehen daher denselben Zweig wie die Workflow-Aufgabe.
- **Waterline** zeigt aufgezeichnete Marker in der Zeitleiste des ausgewählten Laufs mit `version_change_id`, `version`, `version_min_supported` und `version_max_supported`. Die Laufdetails zeigen außerdem `workflow_definition_fingerprint`, `workflow_definition_current_fingerprint` und `workflow_definition_matches_current`. Betreiber erkennen so schon vor Festschreiben eines Versionsmarkers, wann ein langlebiger Lauf auf einer älteren Definition startete.

Neue Workflows können dadurch den neuesten Codepfad verwenden, während
bestehende Workflows ihrem ursprünglichen Pfad folgen.

## Eine neue Version hinzufügen {#adding-a-new-version}

Angenommen, ein vorhandener Workflow ruft `prePatchActivity` auf:

```php
use Workflow\V2\Workflow;
use function Workflow\V2\activity;

final class MyWorkflow extends Workflow
{
    public function handle()
    {
        $result = activity(PrePatchActivity::class);

        return $result;
    }
}
```

Ersetzen Sie dies so durch `postPatchActivity`, ohne laufende Workflows zu
brechen:

```php
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;
use function Workflow\V2\{activity, getVersion};

final class MyWorkflow extends Workflow
{
    public function handle()
    {
        $version = getVersion(
            'activity-change',
            WorkflowStub::DEFAULT_VERSION,
            1
        );

        $result = $version === WorkflowStub::DEFAULT_VERSION
            ? activity(PrePatchActivity::class)
            : activity(PostPatchActivity::class);

        return $result;
    }
}
```

Wenn eine Bereitstellung einen neuen `getVersion()`-Verzweigungspunkt einführt,
wechseln Sie für diese Build-Welle weiterhin `DW_V2_CURRENT_COMPATIBILITY`.
Die Laufzeit verwendet den beim Start gespeicherten
`workflow_definition_fingerprint` als primäre Entscheidungsgrundlage dafür,
ob ein fehlender Versionsmarker zu einer neuen Ausführung oder einem älteren
Lauf gehört, der auf `DEFAULT_VERSION` bleiben soll. Der Kompatibilitätsmarker
bleibt für kompatibilitätsbewusstes Worker-Routing relevant und wird vor dem
Fingerprint geprüft. Läufe von vor dem Fingerprint-Snapshot ohne
aufgezeichneten Fingerprint bleiben vorsichtshalber auf `DEFAULT_VERSION`, da
die Laufzeit eine unveränderte Definition nicht verifizieren kann.

## Weitere Versionen hinzufügen {#adding-more-versions}

Erhöhen Sie für zusätzliche Änderungen `maxSupported`:

```php
$version = getVersion(
    'activity-change',
    WorkflowStub::DEFAULT_VERSION,
    2
);

$result = match($version) {
    WorkflowStub::DEFAULT_VERSION => activity(PrePatchActivity::class),
    1 => activity(PostPatchActivity::class),
    2 => activity(AnotherPatchActivity::class),
};
```

## Alte Versionen ausmustern {#deprecating-old-versions}

Nachdem alle Workflows mit einer alten Version abgeschlossen sind, können Sie
die Unterstützung durch Erhöhen von `minSupported` entfernen. Alte Codepfade
müssen dann nicht weiter gepflegt werden.

```php
// After all DEFAULT_VERSION workflows have completed:
$version = getVersion(
    'activity-change',
    1,  // No longer supporting DEFAULT_VERSION
    2
);

$result = match($version) {
    1 => activity(PostPatchActivity::class),
    2 => activity(AnotherPatchActivity::class),
};
```

Versucht ein Workflow mit einer Version unter `minSupported` ein Replay,
wird `VersionNotSupportedException` ausgelöst. Das betrifft auch Läufe mit
älterer Kompatibilität, deren sicherer Fallback noch
`WorkflowStub::DEFAULT_VERSION` ist.

Verwenden Sie dieselbe `changeId` später versehentlich für einen anderen
Verzweigungspunkt, behandelt die Laufzeit dies als Determinismusfehler, statt
die Abweichung still zu akzeptieren. Behalten Sie eine stabile `changeId` pro
logischer Codeänderung bei.

## Mehrere Änderungspunkte {#multiple-change-points}

Für unabhängige Änderungen können Sie mehrere `getVersion()`-Aufrufe im selben
Workflow verwenden:

```php
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;
use function Workflow\V2\getVersion;

final class MyWorkflow extends Workflow
{
    public function handle(): void
    {
        $version1 = getVersion('change-1', WorkflowStub::DEFAULT_VERSION, 1);
        $version2 = getVersion('change-2', WorkflowStub::DEFAULT_VERSION, 1);

        // Each change point is tracked independently
    }
}
```

**Wichtig:** Jede `changeId` sollte innerhalb eines Workflows eindeutig sein.
Die gewählte Version wird als typisierte Workflow-Historie aufgezeichnet und
bei späteren Workflow-Aufgaben, Abfragen und Waterline-Detailansichten
deterministisch erneut abgespielt. Zeigt Waterline bei einem älteren Lauf für
einen Änderungspunkt keinen Eintrag `VersionMarkerRecorded`, blieb das Replay
auf dem alten Pfad `DEFAULT_VERSION`, ohne einen neuen Marker in bestehende
Historie nachzutragen. Die Detailfelder `workflow_definition_fingerprint`,
`workflow_definition_current_fingerprint` und
`workflow_definition_matches_current` zeigen, ob der Lauf mit einer anderen
Workflow-Definition startete als der heute vom aktuellen Build ladbaren.

## Kurzform `patched()` {#patched-shorthand}

`patched($changeId)` ist eine zweistufige Kurzform für die Frage „Hat dieser
Lauf eine einmalige Codeänderung durchlaufen?“. Es zeichnet dasselbe dauerhafte
Historienereignis `VersionMarkerRecorded` wie `getVersion()` auf und liefert
einen booleschen Wert statt einer Ganzzahl.

```php
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, patched};

final class MyWorkflow extends Workflow
{
    public function handle(): string
    {
        if (patched('use-new-payment-activity')) {
            return activity(NewPaymentActivity::class);
        }

        return activity(LegacyPaymentActivity::class);
    }
}
```

Verhalten:

- Neue Läufe schreiben den Marker fest, nehmen den neuen Zweig und erhalten von `patched()` `true`.
- Läufe von vor Einführung dieser `changeId` bleiben nach demselben Fingerprint-Fallback wie bei `getVersion()` auf `DEFAULT_VERSION`. `patched()` liefert `false`.
- Replays beider Arten lesen den zuvor festgeschriebenen Marker und liefern denselben Wert. Die Verzweigungsentscheidung ist dadurch dauerhaft.

`patched()` ist genau gleichwertig mit
`getVersion($changeId, DEFAULT_VERSION, 1) === 1`. Verwenden Sie es bei nur zwei
Zweigen, wenn Sie den alten Zweig nicht unbegrenzt behalten müssen. Die
boolesche Schreibweise ist am Aufruf klarer als ein `match` über
`DEFAULT_VERSION` und `1`.

Wenn Sie mehr als zwei Zweige benötigen oder später eine weitere Version
derselben logischen Änderung planen, verwenden Sie `getVersion()` mit
explizitem `maxSupported`. Der Wechsel von `patched()` zu `getVersion()` für
dieselbe `changeId` ist ein Determinismusfehler, weil der vorhandene Marker
mit `maxSupported = 1` aufgezeichnet wurde.

## Den alten Zweig mit `deprecatePatch()` entfernen {#removing-the-legacy-branch-with-deprecatepatch}

Sind alle alten Läufe eines `patched()`-Änderungspunkts beendet, können Sie den
alten Zweig aus dem Workflow-Code löschen. Kompatibel ist dies, indem Sie den
`patched()`-Aufruf durch `deprecatePatch()` ersetzen, statt ihn ganz zu entfernen.

```php
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, deprecatePatch};

final class MyWorkflow extends Workflow
{
    public function handle(): string
    {
        deprecatePatch('use-new-payment-activity');

        return activity(NewPaymentActivity::class);
    }
}
```

`deprecatePatch()` hält den Änderungspunkt auf der Workflow-Zeitleiste, damit
bereits festgeschriebene `VersionMarkerRecorded`-Ereignisse weiter einem
bekannten Aufruf entsprechen. Es gibt aber `null` zurück und nimmt immer den
neuen Pfad. Nach Veröffentlichung dieser Version:

- schreiben neue Läufe einen Marker `deprecate_patch` fest, nehmen den neuen Zweig und erhalten von `deprecatePatch()` `null`;
- spielen bestehende Läufe mit bereits festgeschriebenem `patched`-Marker für diese `changeId` ihn weiter ab und durchlaufen den nun einzigen, ausgemusterten Zweig ohne Fehler;
- sind bestehende Läufe mit `false` für `patched()` (alter Pfad) voraussetzungsgemäß nicht mehr aktiv. Läuft doch noch einer und führt Replay aus, liest er weiter den alten Marker, führt aber den neuen Zweig aus. Deshalb lautet der sichere Lebenszyklus: erst alte Läufe abschließen lassen, dann `deprecatePatch()` bereitstellen.

Zweiphasiger Patch-Lebenszyklus und Platzierungsregeln:

1. **`patched()` am Änderungspunkt einführen.** Beide Zweige bleiben im Workflow-Code. Neue Läufe nehmen den neuen, ältere weiterhin den alten Zweig.
2. **Auf Abschluss aller alten Läufe warten.** Bestätigen Sie mit Waterlines Laufsuche oder `dw workflow:list`, dass keine offenen Läufe mehr den alten Zweig erneut abspielen können.
3. **`patched()` am selben Ort durch `deprecatePatch()` ersetzen**, mit derselben `changeId`, und den alten Zweig aus dem Funktionsrumpf löschen. Behalten Sie den Aufruf bei, damit dauerhafte Historie weiter einem bekannten Änderungspunkt entspricht.
4. **Optional `deprecatePatch()` vollständig entfernen**, sobald sicher auch kein historisches Replay (Abfragen, Exporte, Audits) jemals Historie mit diesem Marker lesen wird. Dieser Schritt ist unumkehrbar. Die meisten Workflows können `deprecatePatch()` ohne Laufzeitkosten unbegrenzt behalten.

Platzierungsregeln:

- `patched()` und `deprecatePatch()` müssen aus dem Workflow-Funktionsrumpf aufgerufen werden, nicht aus Aktivitäten, Signalhandlern oder Abfragemethoden. Sie sind Workflow-Schritte und müssen deterministisch erneut abgespielt werden.
- Jede `changeId` bezeichnet einen logischen Änderungspunkt. Wiederverwendung für einen anderen Zweig ist ein Determinismusfehler.
- Eine `changeId` kann im Laufe ihrer Lebensdauer als `patched()` oder `deprecatePatch()` auftreten, niemals gleichzeitig in beiden Formen. Die Bereitstellung muss den Aufruf ersetzen, nicht beide nebeneinander enthalten.
- `getVersion()` und `patched()` dürfen für dieselbe `changeId` nicht nebeneinander existieren. Wählen Sie bei Einführung des Änderungspunkts ein Modell.
