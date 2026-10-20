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
