---
title: Workflow-Streams
description: Dauerhafte, laufgebundene Ausgabestreams mit den PHP-, Python- und Rust-SDKs erzeugen und konsumieren.
tags:
  - service-mode
  - workflow-streams
  - php
  - python
  - rust
---

# Workflow-Streams {#workflow-streams}

Workflow-Streams sind benannte, laufgebundene Ausgabeprotokolle unter der
Verantwortung von Durable Workflow Server. PHP, Python und Rust bieten typisierte
Operationen zum Auflisten, Beschreiben, Abonnieren, Anhängen, Schließen und
Melden von Fehlern, sodass Anwendungen keine HTTP-Anfragen zusammenstellen
müssen. Die Runtime meldet `durable-workflow.v2.workflow-streams.contract@1`.
Die [maschinenlesbare SDK-Matrix](/workflow-stream-capabilities.json) hält die
genaue Unterstützung jedes SDKs fest.

Jeder Stream vergibt monoton steigende Offsets ab 0. `next_offset` einer Seite
ist der nächste inklusiv anzufordernde Offset. Verbraucher erhalten Elemente
mindestens einmal: Schließen Sie die idempotenten Effekte der Seite ab und
speichern Sie anschließend `next_offset` dauerhaft als Checkpoint. Ein Absturz
vor diesem Checkpoint kann zur erneuten Zustellung von Elementen führen.

## Aus Workflow-Code ausgeben {#emit-from-workflow-code}

Die drei SDKs erzeugen Ausgaben an derselben deterministischen Befehlsgrenze:
`record_side_effect.workflow_stream`. Jedes SDK leitet den Idempotenzschlüssel
eines Elements aus der dauerhaften Workflow-Befehlsidentität des Tasks, der
Ordnungsnummer des Stream-Befehls und dem Batch-Index ab. Server schreibt die
Stream-Änderung und den aufgezeichneten Seiteneffekt gemeinsam fest. Replay
verbraucht diesen Seiteneffekt und kann für dasselbe logische Anhängen kein
weiteres dauerhaftes Element erzeugen.

PHP:

```php
use DurableWorkflow\Model\WorkflowStreamAppendItem;

$context->appendWorkflowStream('progress', [
    new WorkflowStreamAppendItem(['percent' => 50]),
]);
$context->closeWorkflowStream('progress');
```

Python:

```python
from durable_workflow import WorkflowStreamAppendItem

yield ctx.append_workflow_stream("progress", [
    WorkflowStreamAppendItem(payload={"percent": 50}),
])
yield ctx.close_workflow_stream("progress")
```

Rust:

```rust
let item = WorkflowStreamAppendItem::new(serde_json::json!({"percent": 50}))?;
ctx.append_workflow_stream("progress", &[item], None)?;
ctx.close_workflow_stream("progress", None)?;
```

Die Workflow-Hilfsmethoden dienen der deterministischen Implementierung. Code
außerhalb eines Workflows kann die typisierte `append`-Operation des jeweiligen
Clients verwenden und einen eigenen stabilen Idempotenzschlüssel angeben.

## Abonnieren und fortsetzen {#subscribe-and-resume}

Ein Abonnement liest eine begrenzte Seite und wartet optional bis zu 60 Sekunden
auf neue Elemente. PHP akzeptiert einen Abbruch-Callback zwischen begrenzten
Abfragen. Python akzeptiert den normalen Task-Abbruch oder ein `asyncio.Event`,
das die laufende Abfrage abbricht. Das Verwerfen des Rust-Abonnement-Futures
bricht dessen Anfrage ab.

| SDK | Seitenoperation | Wert zum Fortsetzen | Typisierte Iteration |
| --- | --- | --- | --- |
| PHP | `subscribeWorkflowStream(...)` | `WorkflowStreamPage::$nextOffset` | `iterateWorkflowStream(...)` |
| Python | `await subscribe_workflow_stream(...)` | `WorkflowStreamPage.next_offset` | `iter_workflow_stream(...)` |
| Rust | `subscribe_workflow_stream(...).await` | `WorkflowStreamPage::next_offset` | Das begrenzte Seiten-Future wiederholen, bis `terminal` erreicht ist. |

`open`, `closed` und `errored` sind die Lebenszykluszustände. Die typisierte
Beschreibung enthält außerdem `last_offset`, `total_items`, `pending_items`
und `error_reason`. Das Anhängen an einen terminalen Stream wird abgelehnt.
Wenn die konfigurierte Grenze ausstehender Elemente erreicht ist, liefert
Anhängen `stream_full`. Erzeuger müssen langsamer werden oder warten, bis
Verbraucher den Stream abgearbeitet haben.

## Externe Nutzlastreferenzen {#external-payload-references}

Inline-Werte verwenden die gemeinsame Avro-Value-Envelope. Externe Referenzen
folgen dem bestehenden Speichervertrag des jeweiligen SDKs, statt einen
weiteren Transport einzuführen:

| SDK | Verhalten externer Referenzen |
| --- | --- |
| PHP | Hängt eine opake `payload_reference` an und gibt sie zurück; Hochladen und Abrufen des Speichers bleiben Aufgabe der Anwendung. |
| Python | Verwendet den konfigurierten Treiber für externen Speicher zum Hochladen, Prüfen der Integrität, Zwischenspeichern, Abrufen und Decodieren einer externen Avro-Envelope. Ohne Treiber können Aufrufer eine opake `payload_reference` anhängen oder untersuchen. |
| Rust | Hängt eine opake Referenz samt Metadaten an und gibt sie zurück. Das aktuelle Rust SDK beansprucht keinen Treiber für externen Speicher. |

## Workflow-Streams und eingebetteter MessageStream {#workflow-streams-and-embedded-messagestream}

Die Namen stimmen dort überein, wo das Verhalten übereinstimmt. Die Modelle sind
jedoch nicht austauschbar.

| Konzept | Workflow-Stream im Service-Modus | Eingebetteter Laravel MessageStream |
| --- | --- | --- |
| Adresse | Workflow-Lauf + Stream-Name | Workflow-Instanz/-Lauf + Stream-Schlüssel |
| Richtung | Nur Workflow-Ausgabe | Workflow-Posteingang und -ausgang |
| Erster Offset | 0 | 1 |
| Zustellung | Mindestens einmal; Checkpoint durch den Verbraucher verwaltet | Mindestens einmal; Nachrichten-Cursor durch die Engine verwaltet |
| Continue-as-new | Keine Übertragung des Stream-Cursors | Posteingangs-Cursor wird auf den fortgesetzten Lauf übertragen |
| Eingehende Workflow-Nachrichten | Nicht angeboten; Signale oder Updates verwenden | Über `inbox()->receive()` angeboten |

Waterline verwendet eine normalisierte Tabelle für beide Modi und zeigt Modus,
Lebenszyklus, Kopf-/Cursor-Offsets, Anzahl ausstehender Elemente, Richtung und
Fehler. Es stellt Service-Ausgabestreams nicht als eingehenden Workflow-Posteingang dar.

## Qualifizierung {#qualification}

Das öffentliche [Workflow-Stream-Szenariomanifest](/platform-conformance/workflow-stream-runtime-scenarios.json)
verlangt Läufe mit veröffentlichten Artefakten für einen PHP-Erzeuger mit Python-
und Rust-Verbrauchern, Neustart des erzeugenden Workers, Wiederverbindung des
Verbrauchers, Lebenszyklus/Rückstaukontrolle/Abbruch und externe Nutzlastreferenzen.
Ein Release-Ergebnis muss jedes erforderliche Szenario aufzeichnen. Reine
Quellcode-Unit-Tests sind kein Konformitätsnachweis.
