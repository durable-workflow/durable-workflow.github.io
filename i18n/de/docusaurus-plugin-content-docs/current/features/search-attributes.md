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
