---
sidebar_position: 18
---

# Memo {#memo}

Memos sind nicht indexierte Schlüssel-Wert-Metadaten, die ein Workflow jederzeit
während seiner Ausführung lesen und aktualisieren kann. Anders als
[Suchattribute](./search-attributes.md), die indexiert und filterbar sind,
eignen sie sich für reichhaltigere strukturierte Metadaten in Detailansichten
und Historienexporten. Vertragsgemäß sind sie von flottenweiter Filterung und
Sortierung ausgeschlossen.

## Memos aktualisieren oder einfügen {#upserting-memos}

`upsertMemo()` ist ein dauerhafter geradliniger Helfer. Jeder Aufruf zeichnet ein
typisiertes Historienereignis `MemoUpserted` auf und führt neue Einträge mit dem
gespeicherten Memo des Laufs zusammen.

```php
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, upsertMemo};

final class OrderWorkflow extends Workflow
{
    public function handle(string $orderId, string $customer): array
    {
        upsertMemo([
            'customer_name' => $customer,
            'order_id' => $orderId,
            'status' => 'processing',
            'line_items' => [
                ['sku' => 'WIDGET-1', 'qty' => 2],
                ['sku' => 'GADGET-3', 'qty' => 1],
            ],
        ]);

        $result = activity(ProcessOrderActivity::class, $orderId);

        upsertMemo([
            'status' => 'completed',
            'result_summary' => $result->outcome,
        ]);

        return $result->toArray();
    }
}
```

Memos können beim Start auch über `StartOptions` gesetzt werden:

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(OrderWorkflow::class, 'order-123');
$workflow->start(
    'ORD-456',
    'Taylor',
    StartOptions::rejectDuplicate()->withMemo([
        'source' => 'api',
        'priority' => 'high',
    ]),
);
```

## Funktionsweise {#how-it-works}

`upsertMemo()` akzeptiert ein assoziatives Array aus Schlüssel-Wert-Paaren:

- **Schlüssel** müssen 1–64 Zeichen aus Buchstaben, Ziffern, `.`, `_`, `-` und `:` haben und dürfen keine Ganzzahl wie `42` sein.
- **Werte** können beliebige JSON-serialisierbare Daten sein: Skalare, null, Arrays oder verschachtelte Objekte.
- Der Wert `null` entfernt den jeweiligen Schlüssel aus dem Memo.

Bei jedem Aufruf:

1. wird die Workflow-Fiber unterbrochen und ein Befehl `UpsertMemoCall` abgegeben;
2. validiert und normalisiert der Executor die Einträge, wobei Schlüssel alphabetisch sortiert werden;
3. wird ein Historienereignis `MemoUpserted` mit den aktualisierten `entries` und dem vollständigen Ergebnis `merged` angefügt;
4. wird die Spalte `memo` des Laufs mit der zusammengeführten Zuordnung aktualisiert.

Beim Replay werden aufgezeichnete Memo-Ereignisse ohne erneute Ausführung des
Upserts verwendet. Das erhält den Determinismus.

## Zusammenführungsverhalten {#merging-behavior}

Memos werden über mehrere Upserts im selben Lauf zusammengeführt. Jeder Upsert
überlagert bestehende Schlüssel mit neuen Werten:

```php
// First upsert
upsertMemo(['status' => 'processing', 'customer' => 'Taylor']);
// memo = { customer: Taylor, status: processing }

// Second upsert
upsertMemo(['status' => 'completed', 'result' => 'success']);
// memo = { customer: Taylor, result: success, status: completed }
```

Setzen Sie einen Schlüssel zum Entfernen auf `null`:

```php
upsertMemo(['temporary_note' => null]);
```

## Sichtbarkeit {#visibility}

Memos erscheinen in:

- **Laufdetailansicht**: Das vollständig zusammengeführte Memo wird auf Waterlines Workflow-Detailseite angezeigt.
- **Historienzeitleiste**: Jedes `MemoUpserted`-Ereignis erscheint als typisierter Eintrag in der Laufzeitleiste.
- **Historienexport**: Memos sind in JSON-Historienexporten enthalten.
- **Describe**: Die Antwort `describe` der Steuerungsebene enthält das aktuelle Memo.

Memos sind **nicht** in Laufzusammenfassungsprojektionen enthalten und stehen
**nicht** für Filterung, Sortierung oder gespeicherte Ansichten bereit.
Verwenden Sie [Suchattribute](./search-attributes.md) für indexierte,
filterbare Metadaten.

## Continue-as-new {#continue-as-new}

Bei Continue-as-new wird das aktuelle Memo automatisch in den neuen Lauf
übernommen. Dieser startet mit dem vollständig zusammengeführten Memo des
vorherigen Laufs und kann es von dort weiter aktualisieren.

## Verschachtelte Strukturen {#nested-structures}

Anders als die auf skalare Werte beschränkten Suchattribute unterstützen Memos
verschachtelte JSON-Strukturen:

```php
upsertMemo([
    'order' => [
        'id' => 'ORD-456',
        'items' => [
            ['sku' => 'WIDGET-1', 'qty' => 2],
            ['sku' => 'GADGET-3', 'qty' => 1],
        ],
    ],
    'metadata' => [
        'source' => 'api',
        'version' => 2,
    ],
]);
```

Die Schlüsselregel gilt für Memo-Schlüssel der obersten Ebene. Verschachtelte Werte zählen zur Größengrenze des Memo-Werts.

## Einschränkungen {#constraints}

- Schlüsselnamen: 1–64 Zeichen aus Buchstaben, Ziffern, `.`, `_`, `-` und `:`, keine Ganzzahl wie `42`. Die Regel gilt für Schlüssel der obersten Ebene.
- Größe: jeder Wert kodiert bis 10.240 Bytes, höchstens 100 Schlüssel und insgesamt 65.536 Bytes pro Lauf. Die Grenze [`memo_size_bytes`](../constraints/structural-limits.md#memo-size) (Standard 64 KiB) kann die Gesamtgrenze verschärfen, aber nicht anheben.
- Das Überschreiten einer Grenze löst `StructuralLimitExceededException` aus; `limitName` nennt die Grenze. Ein Start wird ohne Schreibvorgang abgelehnt, und ein Upsert aus Workflow-Code lässt den Lauf mit einem `structural_limit`-Fehler fehlschlagen.
- Jeder Upsert hängt ein `MemoUpserted`-Verlaufsereignis an, daher vergrößern Upserts in einer Schleife den Verlauf.
- Werte: jeder JSON-serialisierbare Typ (Skalare, null, Arrays, verschachtelte Objekte).
- Der Wert `null` entfernt den jeweiligen Schlüssel.
- Memos sind letztlich konsistente Metadaten, keine Replay-Autorität. Verzweigen Sie Workflow-Logik nicht anhand von Memo-Werten.

## Memo, Suchattribute und Sichtbarkeitslabels im Vergleich {#memo-vs-search-attributes-vs-visibility-labels}

| | Memo | Suchattribute | Sichtbarkeitslabels |
|---|---|---|---|
| **Setzzeitpunkt** | Beim Start oder jederzeit während der Ausführung | Jederzeit während der Ausführung | Nur beim Start |
| **Veränderlich** | Ja, über `upsertMemo()` | Ja, über `upsertSearchAttributes()` | Nein |
| **Werttypen** | Jeder JSON-serialisierbare Typ | Skalare und Listen von Zeichenfolgen | Nur Skalare |
| **Indexiert** | Nein | Ja | Ja |
| **Filterbar** | Nein | Ja | Ja |
| **Anwendungsfall** | Reichhaltige Metadaten, Notizen, Kontext | Dynamischer Status, Fortschrittsverfolgung | Statische Klassifizierung |
| **Historienereignisse** | `MemoUpserted` pro Upsert | `SearchAttributesUpserted` pro Upsert | Keine, beim Start gesetzt |
