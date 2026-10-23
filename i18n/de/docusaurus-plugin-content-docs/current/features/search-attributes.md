---
sidebar_position: 17
---

# Suchattribute {#search-attributes}

Suchattribute sind typisierte, indexierte Schlüssel-Wert-Paare, die ein Workflow
jederzeit während seiner Ausführung einfügen oder aktualisieren kann. Anders
als einmalig beim Start gesetzte Sichtbarkeitslabels können sie mit dem
Workflow-Fortschritt aktualisiert werden. Sie eignen sich für Workflow-Status,
Kundenkennungen oder andere für Betreiber sichtbare Metadaten, die sich während
eines Laufs ändern.

## Suchattribute aktualisieren oder einfügen {#upserting-search-attributes}

`upsertSearchAttributes()` ist ein dauerhafter geradliniger Helfer. Jeder Aufruf
zeichnet ein typisiertes Historienereignis `SearchAttributesUpserted` auf und
führt die neuen Attribute mit den gespeicherten Suchattributen des Laufs
zusammen.

```php
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, upsertSearchAttributes};

final class OrderWorkflow extends Workflow
{
    public function handle(string $orderId, string $customer): array
    {
        upsertSearchAttributes([
            'status' => 'processing',
            'customer' => $customer,
            'order_id' => $orderId,
        ]);

        $result = activity(ProcessOrderActivity::class, $orderId);

        upsertSearchAttributes([
            'status' => 'completed',
            'result' => $result->outcome,
        ]);

        return $result->toArray();
    }
}
```

## Suchattribute beim Start setzen {#setting-search-attributes-at-start-time}

Suchattribute können beim Workflow-Start auch über
`StartOptions::withSearchAttributes()` gesetzt werden. Startattribute werden
sofort am Lauf aufgezeichnet und erscheinen in den Historienereignissen
`StartAccepted` und `WorkflowStarted`. Spätere Aufrufe von
`upsertSearchAttributes()` ergänzen oder überschreiben sie.

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(OrderWorkflow::class, 'order-42');
$workflow->start(
    $orderId,
    $customer,
    StartOptions::rejectDuplicate()->withSearchAttributes([
        'env' => 'production',
        'region' => 'us-east',
        'priority' => 'high',
    ]),
);
```

Sie können `withSearchAttributes()` mit anderen `StartOptions`-Buildern
verketten:

```php
$options = StartOptions::rejectDuplicate()
    ->withBusinessKey('order-42')
    ->withLabels(['tenant' => 'acme'])
    ->withMemo(['note' => 'VIP order'])
    ->withSearchAttributes(['priority' => 'high']);

$workflow->start($orderId, $customer, $options);
```

Suchattribute beim Start folgen denselben Validierungsregeln wie
`upsertSearchAttributes()`: Schlüssel müssen 1–64 URL-sichere Zeichen haben,
Werte müssen skalar oder null sein. Nullwerte werden verworfen und nicht
gespeichert.

### Steuerungsebene {#control-plane}

Die Methode `start()` der Steuerungsebene akzeptiert ebenfalls Suchattribute:

```php
$controlPlane->start('orders.process-order', 'order-42', [
    'arguments' => $serializedArgs,
    'search_attributes' => ['env' => 'production', 'priority' => 'high'],
]);
```

## Funktionsweise {#how-it-works}

`upsertSearchAttributes()` akzeptiert ein assoziatives Array aus
Schlüssel-Wert-Paaren:

- **Schlüssel** müssen 1–64 URL-sichere Zeichen enthalten (Buchstaben, Ziffern, Bindestriche, Unterstriche).
- **Werte** müssen skalar (string, int, float, bool) oder null sein. Zeichenfolgen sind auf 191 Zeichen begrenzt.
- Der Wert `null` entfernt den jeweiligen Schlüssel aus den Suchattributen.

Bei jedem Aufruf:

1. wird die Workflow-Fiber unterbrochen und ein Befehl `UpsertSearchAttributesCall` abgegeben;
2. validiert und normalisiert der Executor die Attribute, wobei Schlüssel alphabetisch sortiert werden;
3. wird ein Historienereignis `SearchAttributesUpserted` mit den aktualisierten `attributes` und dem vollständigen Ergebnis `merged` angefügt;
4. wird die Spalte `search_attributes` des Laufs mit der zusammengeführten Zuordnung aktualisiert;
5. wird die Laufzusammenfassungsprojektion aktualisiert, sodass Waterline die Änderung sofort anzeigt.

Replay verwendet aufgezeichnete Suchattributereignisse ohne erneute Ausführung
des Upserts. Dadurch bleibt der Determinismus erhalten.

## Zusammenführungsverhalten {#merging-behavior}

Suchattribute werden über mehrere Upserts im selben Lauf zusammengeführt.
Jeder Upsert überlagert bestehende Schlüssel mit neuen Werten:

```php
// First upsert
upsertSearchAttributes(['status' => 'processing', 'customer' => 'Taylor']);
// search_attributes = { customer: Taylor, status: processing }

// Second upsert
upsertSearchAttributes(['status' => 'completed', 'result' => 'success']);
// search_attributes = { customer: Taylor, result: success, status: completed }
```

Setzen Sie einen Schlüssel zum Entfernen auf `null`:

```php
upsertSearchAttributes(['temporary_flag' => null]);
```

## Sichtbarkeit und Filterung {#visibility-and-filtering}

Suchattribute erscheinen in:

- **Laufdetailansicht**: Die zusammengeführte Suchattributzuordnung wird neben Labels und Memo angezeigt.
- **Laufzusammenfassungsprojektion**: Suchattribute sind für schnelle Lesezugriffe in der denormalisierten Zusammenfassung enthalten.
- **Sichtbarkeitsfilter**: Betreiber können Workflow-Läufe in gespeicherten Waterline-Ansichten nach Suchattributwerten filtern.
- **Historienzeitleiste**: Jedes `SearchAttributesUpserted`-Ereignis erscheint als typisierter Eintrag in der Laufzeitleiste.
- **Historienexport**: Suchattribute sind in JSON-Historienexporten enthalten.

### Listenfilter für Eltern und Kinder {#parent-child-list-filters}

Kinder [erben Suchattribute und Memo bei der Erstellung](./child-workflows.md#child-metadata-inheritance) und können ihre Werte danach unabhängig ändern. Das Filtern eines geerbten Attributs schließt Kinder nicht automatisch aus. Bei einem registrierten Keyword-Attribut kann die Server-Abfrage `customer = 'customer-42'` den Elternlauf und jedes Kind mit diesem Wert zurückgeben. Memo bleibt nicht indizierte Metadaten und ist kein weiterer Suchattributfilter.

Die qualifizierte Listen-API von Server 2.11.0 hat **kein eingebautes Prädikat nur für Wurzelläufe oder nur für Kinder**. `ParentWorkflowId`, `RootWorkflowId` und `IsChildWorkflow` sind keine automatischen Beziehungsfelder ihrer Abfragesprache; die Prüfungen der veröffentlichten Version weisen diese unregistrierten Namen zurück. Das Registrieren eines gleichnamigen eigenen Attributs trägt keine Eltern-/Kindidentität ein. Ein Workflow-Typfilter wählt einen Typ, nicht alle Wurzeln oder Kinder über mehrere Typen hinweg.

Prüfen Sie die Abstammung des Laufs, wenn Sie seine tatsächliche Eltern-/Kindbeziehung benötigen. Umfassendere gemeinsame Sichtbarkeitsfilter bleiben [Produktarbeit](https://github.com/durable-workflow/.github/issues/224). Diese Einschränkung und eine vom Nutzer definierte Metadatenkonvention liefern diese Fähigkeit nicht. Der [Prüfbericht](https://github.com/durable-workflow/durable-workflow.github.io/issues/368#issuecomment-6362355504) bewahrt das Ergebnis mit Elternlauf und Kind sowie die abgewiesenen Prädikate.

## Datetime-Suchattribute reparieren {#repair-datetime-search-attributes}

Der historiengestützte Reparaturbefehl benötigt **tatsächlich installiertes Workflow 2.12.0 oder neuer**. Prüfen Sie `composer.lock` und `php artisan help workflow:v2:repair-search-datetimes` in der ausführenden Laravel-Anwendung. Ein Quellcheckout oder eine Composer-Vorgabe allein belegt keinen installierten Befehl.

Datetime-Projektionen speichern UTC-Zeitpunkte mit Mikrosekunden: `2026-10-08T12:34:56.123456+02:00` entspricht `2026-10-08T10:34:56.123456Z`. Frühere Writer konnten die lokale Uhrzeit des Offsets speichern, obwohl der Offset in typisierter Historie erhalten blieb. Ein Upgrade verhindert neue Writer-Fehler, identifiziert oder korrigiert alte Zeilen aber nicht. Leiten Sie die ursprüngliche Zeitzone niemals aus der gespeicherten Uhrzeit ab.

Aktualisieren Sie zuerst sämtliche Projektions-Writer und sichern Sie die Workflow-Datenbank. Verwenden Sie die **exakte Run-ID**, keine Workflow-Instanz-ID. Beginnen Sie mit einer Vorschau:

```sh
php artisan workflow:v2:repair-search-datetimes RUN_ID --namespace=production --json
php artisan workflow:v2:repair-search-datetimes RUN_ID --namespace=production --key=SubmittedAt --json
```

`--namespace=production` prüft exakte Gleichheit; verwenden Sie den tatsächlichen Namespace des Runs. Lassen Sie die Option nur weg, wenn die genaue Run-ID genügt, auch bei alten Null-Namespaces; ein ausdrücklich leerer Namespace wird abgelehnt. Ohne `--key` werden die Datetime-Attribute dieses Runs ausgewählt. Wiederholen Sie die Option für bekannte Schlüssel, etwa `--key=SubmittedAt --key=ApprovedAt`.

Standardmäßig erfolgt eine Vorschau. Prüfen Sie `examined`, `would_repair` und die genaue Run-/Schlüsselauswahl, bevor Sie dieselbe Auswahl ausdrücklich anwenden:

```sh
php artisan workflow:v2:repair-search-datetimes RUN_ID --namespace=production --key=SubmittedAt --apply --json
```

Lesen Sie ausgewählte Attribute und Run-Zusammenfassung erneut und wiederholen Sie die Vorschau. Bei unveränderten Nachweisen und korrekten Werten meldet ein wiederholtes Apply null Reparaturen. Ein reparierter Teil belegt nicht die Korrektheit ungewählter Schlüssel.

Jeder Schlüssel benötigt das letzte erhaltene, ausdrücklich typisierte `SearchAttributesUpserted` mit einer ursprünglichen logischen Befehlssequenz, die zur Projektion passt. Bereinigte Historie, fehlende/veraltete Nachweise, uneindeutige Zeitzonen, falscher Namespace und nicht mehr als Datetime erhaltene Schlüssel führen zur Ablehnung. Ein unbelegbarer Schlüssel lehnt die gesamte Auswahl ab; prüfen Sie die Historie und wählen Sie nur belegte Schlüssel, ohne Offsets zu erraten.

Der Befehl sperrt und validiert die gesamte Auswahl, bevor er abgeleitete Attribute und ihre Zusammenfassung in einer Speichertransaktion aktualisiert. Maßgebliche Historie, Geschäftsbefehle, Run-/Task-Identitäten und Leases bleiben unverändert. JSON-Fehler unterscheiden `refused` und `unverified`: Nach einem unerwarteten Speicherfehler prüfen Sie die Zeilen vor dem Wiederholen, denn ein unsicherer Commit garantiert keinen Rollback.

Repariert werden abgeleitete Suchattribute und ihre Zusammenfassung; bereinigte Historie wird nicht wiederhergestellt und maßgebliche Eingaben bleiben unverändert. Der separate Sichtbarkeitsabfrage-Bindungspfad des Servers und die Image-Übernahme benötigen eine eigene qualifizierte Lieferung; ein Core-Tag belegt keine HTTP-Korrektur. Siehe das [kanonische Wiederherstellungsverfahren](https://github.com/durable-workflow/workflow/blob/b3bbfdb5258c68546ae38ca1fde52818e4b05d12/docs/architecture/projection-timestamp-storage.md#datetime-search-attributes).

## Continue-as-new {#continue-as-new}

Bei Continue-as-new werden die aktuellen Suchattribute automatisch in den
neuen Lauf übernommen. Dieser startet mit der vollständig zusammengeführten
Attributzuordnung des vorherigen Laufs und kann sie weiter aktualisieren.

## Datenschutz und Grenzen {#privacy-and-limits}

Suchattribute sind **Betreibermetadaten im Klartext**. Ihre Werte sind für jeden
mit Waterline-Zugriff sichtbar und werden unverschlüsselt gespeichert.
Speichern Sie niemals Geheimnisse, Passwörter, Token oder personenbezogene
Daten (PII) in Suchattributen.

Einschränkungen:

- Schlüsselnamen: 1–64 URL-sichere Zeichen (`[a-zA-Z0-9_-]`).
- Werte: nur skalare Typen (string, int, float, bool), Zeichenfolgen auf 191 Zeichen begrenzt.
- Der Wert `null` entfernt den jeweiligen Schlüssel.

## Suchattribute, Memo und Sichtbarkeitslabels im Vergleich {#search-attributes-vs-memo-vs-visibility-labels}

| | Suchattribute | Memo | Sichtbarkeitslabels |
|---|---|---|---|
| **Setzzeitpunkt** | Beim Start oder jederzeit während der Ausführung | Beim Start oder jederzeit während der Ausführung | Nur beim Start |
| **Veränderlich** | Ja, über `upsertSearchAttributes()` | Ja, über `upsertMemo()` | Nein |
| **Werttypen** | Nur Skalare | Jeder JSON-serialisierbare Typ | Nur Skalare |
| **Indexiert** | Ja | Nein | Ja |
| **Filterbar** | Ja | Nein | Ja |
| **Anwendungsfall** | Dynamischer Status, Fortschrittsverfolgung | Reichhaltige Metadaten, Notizen, Kontext | Statische Klassifizierung |
| **Historienereignisse** | `SearchAttributesUpserted` pro Upsert | `MemoUpserted` pro Upsert | Keine, beim Start gesetzt |

Verwenden Sie für reichhaltige strukturierte Metadaten ohne Filter- oder
Sortierbedarf stattdessen [Memo](./memo.md).
