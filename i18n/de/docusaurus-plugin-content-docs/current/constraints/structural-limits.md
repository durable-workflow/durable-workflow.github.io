---
sidebar_position: 5
---

# Strukturelle Grenzen {#structural-limits}

Strukturelle Grenzen begrenzen den Ressourcenverbrauch einer einzelnen
Workflow-Ausführung. Würde eine Operation eine konfigurierte Grenze
überschreiten, zeichnet die Engine einen typisierten Fehler mit der
maschinenlesbaren Fehlerkategorie `structural_limit` und der konkreten
Grenzart auf und lässt die Ausführung fehlschlagen. Das schützt das System vor
unbegrenzter Auffächerung, übergroßen Payloads und aufgeblähten Metadaten.

## Grenzarten {#limit-kinds}

| Grenzart | Standard | Was sie begrenzt |
|---|---|---|
| `pending_activity_count` | 2.000 | Gleichzeitig offene, nicht abgeschlossene Aktivitätsausführungen |
| `pending_child_count` | 1.000 | Gleichzeitig offene, nicht abgeschlossene untergeordnete Workflows |
| `pending_timer_count` | 2.000 | Gleichzeitig offene ausstehende Timer |
| `pending_signal_count` | 5.000 | Gleichzeitig ausstehende, unverarbeitete Signale |
| `pending_update_count` | 500 | Gleichzeitig ausstehende, nicht aufgelöste Updates |
| `command_batch_size` | 1.000 | Elemente einer einzelnen parallelen Auffächerung (`all()`) |
| `payload_size_bytes` | 2 MiB | Serialisierte Größe eines einzelnen Argument-Payloads |
| `memo_size_bytes` | 64 KiB | Serialisierte Größe nicht indexierter Memo-Metadaten |
| `search_attribute_size_bytes` | 40 KiB | Serialisierte Größe indexierter Suchattribut-Metadaten |
| `history_transaction_size` | 5.000 | Von einer einzelnen Workflow-Aufgabenausführung erzeugte Verlaufsereignisse |

Alle Grenzen werden beim Einplanen, Aufzeichnen oder Annehmen von Befehlen
durchgesetzt. Der Wert `0` deaktiviert die Prüfung für die jeweilige Grenzart.

## Warnungen vor weichen Grenzen {#soft-limit-warnings}

Bevor eine harte Grenze eine Ausführung beendet oder einen Befehl ablehnt, kann
die Engine vor der Annäherung an die Obergrenze einer Ressource warnen.
Überschreitet eine zählbare Ressource (ausstehende Aktivitäten, untergeordnete
Workflows, Timer, Signale, Updates, Befehlsstapelgröße oder
Verlaufstransaktionsereignisse) einen konfigurierbaren Prozentsatz der harten
Grenze, protokolliert die Engine eine strukturierte Warnung.

Die Standardwarnschwelle beträgt **80 %**. Bei der Standardgrenze von 2.000 für
`pending_activity_count` wird beispielsweise bei 1.600 ausstehenden Aktivitäten
einer Ausführung eine Warnung protokolliert. Die Ausführung läuft normal weiter.
Die Warnung gibt Betreibern Zeit zu reagieren (Worker skalieren,
Continue-as-new auslösen, Grenze erhöhen), bevor die harte Grenze die
Ausführung fehlschlagen lässt.

Konfigurieren Sie die Schwelle über
`workflows.v2.structural_limits.warning_threshold_percent`:

```env
DW_V2_LIMIT_WARNING_THRESHOLD_PERCENT=80
```

Setzen Sie den Wert auf `0`, um Warnungen vor weichen Grenzen vollständig zu
deaktivieren.

Warnprotokolleinträge enthalten strukturierten Kontext:

```
[Durable Workflow] Run 42 approaching structural limit [pending_activity_count]: 1620 / 2000 (81% utilization, warning at 80%).
```

Der strukturierte Protokollkontext enthält `workflow_run_id`, `workflow_type`,
`limit_kind`, `current`, `limit` und `utilization_percent` zur Integration mit
Werkzeugen für Protokollaggregation und Alarmierung.

## Konfiguration {#configuration}

Überschreiben Sie jede Grenze über `workflows.v2.structural_limits` in Ihrer
Konfiguration oder über Umgebungsvariablen:

```php
// config/workflows.php
'v2' => [
    'structural_limits' => [
        'pending_activity_count' => (int) env('DW_V2_LIMIT_PENDING_ACTIVITIES', 2000),
        'pending_child_count' => (int) env('DW_V2_LIMIT_PENDING_CHILDREN', 1000),
        'pending_timer_count' => (int) env('DW_V2_LIMIT_PENDING_TIMERS', 2000),
        'pending_signal_count' => (int) env('DW_V2_LIMIT_PENDING_SIGNALS', 5000),
        'pending_update_count' => (int) env('DW_V2_LIMIT_PENDING_UPDATES', 500),
        'command_batch_size' => (int) env('DW_V2_LIMIT_COMMAND_BATCH_SIZE', 1000),
        'payload_size_bytes' => (int) env('DW_V2_LIMIT_PAYLOAD_SIZE_BYTES', 2097152),
        'memo_size_bytes' => (int) env('DW_V2_LIMIT_MEMO_SIZE_BYTES', 65536),
        'search_attribute_size_bytes' => (int) env('DW_V2_LIMIT_SEARCH_ATTRIBUTE_SIZE_BYTES', 40960),
        'history_transaction_size' => (int) env('DW_V2_LIMIT_HISTORY_TRANSACTION_SIZE', 5000),
        'warning_threshold_percent' => (int) env('DW_V2_LIMIT_WARNING_THRESHOLD_PERCENT', 80),
    ],
],
```

## Durchsetzungspunkte {#enforcement-points}

### Grenzen ausstehender Elemente (Executor-Seite) {#pending-count-limits-executor-side}

Bevor der Executor eine Aktivität, einen untergeordneten Workflow oder einen
Timer einplant, zählt er die aktuell nicht abgeschlossenen Elemente dieses
Typs in der Ausführung. Liegt die Anzahl bereits auf oder über der
konfigurierten Grenze, schlägt die Ausführung sofort mit
`StructuralLimitExceededException` fehl.

Das schützt vor Mustern wie unbegrenzten parallelen Auffächerungsschleifen, die
Tausende ausstehender Operationen ansammeln:

```php
// This will fail if $items exceeds the pending_activity_count limit
$calls = [];
foreach ($items as $item) {
    $calls[] = fn () => activity(ProcessItemActivity::class, $item);
}
return all($calls); // Also checked against command_batch_size
```

Verarbeiten Sie große Stapel in begrenzten Teilmengen, um innerhalb der Grenzen
zu bleiben:

```php
foreach (array_chunk($items, 500) as $chunk) {
    $calls = [];
    foreach ($chunk as $item) {
        $calls[] = fn () => activity(ProcessItemActivity::class, $item);
    }
    all($calls);
}
```

### Grenzen ausstehender Elemente (Annahmeseite) {#pending-count-limits-intake-side}

Trifft ein Signal- oder Update-Befehl über Steuerungsebene, Webhook oder
`WorkflowStub` ein, prüft die Engine vor der Annahme die Anzahl unverarbeiteter
Signale (Status `received`) beziehungsweise nicht aufgelöster Updates (Status
`accepted`) in der Zielausführung.

Liegt die Anzahl auf oder über der konfigurierten Grenze, wird der Befehl mit
dem Grund `structural_limit_exceeded` **abgelehnt**. Die Ablehnungsantwort
enthält maschinenlesbare Metadaten (`structural_limit_kind`,
`structural_limit_value`, `structural_limit_configured`), mit denen Aufrufer
die Ursache erkennen können.

Anders als Grenzen auf Executor-Seite, die die Ausführung fehlschlagen lassen,
weisen Grenzen auf Annahmeseite den einzelnen Befehl ab, ohne den Workflow zu
beenden. Die Ausführung bleibt aktiv. Nach Verarbeitung ausstehender Elemente
kann der Aufrufer es erneut versuchen.

Bei einem Server-Update mit `request_id` wird die Ablehnung unter diesem Schlüssel
aufbewahrt. Derselbe Schlüssel liefert auch nach geänderter Kapazität oder
Konfiguration die ursprüngliche Ablehnung. Verwenden Sie nach bestätigter
Ablehnung und wiederhergestellter Kapazität einen neuen Schlüssel für einen
neuen Annahmeversuch. Bei unklarer Antwort müssen Sie zuerst den ursprünglichen
Beleg wiederfinden, bevor Sie eine weitere Annahme als sicher betrachten.

```php
// If 5,000 signals are already pending, this will be rejected:
$result = $workflow->attemptSignal('process-item', $data);
if ($result->rejected()) {
    // $result->rejectionReason() === 'structural_limit_exceeded'
    // back off and retry later
}
```

### Befehlsstapelgröße {#command-batch-size}

Die Funktion `all()` prüft die Gesamtzahl der Blattoperationen einer einzelnen
Auffächerungsgruppe gegen `command_batch_size`. Die Prüfung erfolgt vor dem
Einplanen einzelner Aktivitäten oder untergeordneter Workflows. Die Ausführung
schlägt daher sauber fehl, statt einen Stapel nur teilweise einzuplanen.

### Payload-Größe {#payload-size}

Beim Einplanen einer Aktivität oder eines untergeordneten Workflows serialisiert
der Executor den Argument-Payload und prüft die Byte-Länge gegen
`payload_size_bytes`. Überschreitet der serialisierte Payload die Grenze,
schlägt die Ausführung fehl, bevor Datenbankzeilen für die Operation entstehen.

Dies gilt für:

- **Aktivitätsargumente**: Prüfung beim Serialisieren der `ActivityCall`-Argumente durch `scheduleActivity`.
- **Argumente untergeordneter Workflows**: Prüfung beim Serialisieren der Startargumente durch `scheduleChildWorkflow`, bevor Instanz- oder Ausführungszeilen des untergeordneten Workflows entstehen.

```php
// A 3 MiB payload will fail with the default 2 MiB limit
activity(ProcessDocumentActivity::class, $threeMegabyteBlob);
```

Um innerhalb der Grenze zu bleiben, aktivieren Sie entweder
[externen Payload-Speicher](../features/external-payload-storage.md) im
Namespace. Die Laufzeit lagert Payloads oberhalb des Schwellenwerts dann
transparent in einen konfigurierten Objektspeicher aus. Oder speichern Sie die
Bytes selbst und übergeben eine Referenz auf Anwendungsebene:

```php
$ref = Storage::put('docs/incoming.pdf', $blob);
activity(ProcessDocumentActivity::class, $ref);
```

Externer Payload-Speicher erhält die Replay-Integrität durch Aufzeichnen eines
gehashten Umschlags vom Typ
`durable-workflow.v2.external-payload-reference.v1` im Verlauf. Die Grenze sieht
daher den Referenzumschlag als Payload und nicht die ausgelagerten Bytes.

### Memo-Größe {#memo-size}

Memos haben feste Obergrenzen: jeder Wert kodiert bis 10.240 Bytes (`memo_value_bytes`), höchstens 100 Schlüssel (`memo_keys`) und insgesamt 65.536 Bytes (`memo_total_bytes`). `memo_size_bytes` prüft die kodierte Größe der zusammengeführten Memo-Zuordnung und kann die Gesamtgrenze verschärfen, aber nicht anheben: Ein größerer Wert wirkt wie 65.536. Der Wert `0` schaltet diese Prüfung ab; die festen Obergrenzen bleiben.

Start, `upsertMemo()` und Memo-Upserts von Service-Workern prüfen das Memo, das der Schreibvorgang am Lauf hinterlassen würde, bevor etwas geschrieben wird. Das Überschreiten einer Grenze löst `StructuralLimitExceededException` mit `limitName` aus. Ein Upsert aus Workflow-Code lässt den Lauf fehlschlagen, und sein `WorkflowFailed`-Ereignis zeichnet `structural_limit_name` auf.

Diese Regeln gelten ab Workflow 2.25.0. Frühere Versionen setzten `memo_size_bytes` standardmäßig auf 256 KiB, was die feste Gesamtgrenze unerreichbar machte, und lösten bei den festen Obergrenzen `InvalidArgumentException` aus.

### Größe der Verlaufstransaktion {#history-transaction-size}

Jede Workflow-Aufgabenausführung (ein einzelner Durchlauf aus Replay und
Fortschritt) kann neue Verlaufsereignisse erzeugen: Aktivitätsplanung,
Timer-Erstellung, Seiteneffektaufzeichnung, Suchattribut-Upserts usw.
`history_transaction_size` begrenzt die Gesamtzahl neuer Ereignisse pro Aufgabe.

Dies erkennt ausufernde Schleifen, die in einer Aufgabe unbegrenzt Ereignisse
erzeugen, ohne die Kontrolle abzugeben:

```php
// If a workflow schedules thousands of operations in one task,
// the history transaction limit prevents the task from growing
// without bound. Process large batches in bounded chunks instead.
foreach (array_chunk($items, 500) as $chunk) {
    $calls = [];
    foreach ($chunk as $item) {
        $calls[] = fn () => activity(ProcessItemActivity::class, $item);
    }
    all($calls);  // Each chunk is a separate task execution
}
```

Die Prüfung läuft am Anfang jeder Iteration der Executor-Hauptschleife.
Ereignisse während des Replays, bei dem vorhandener Verlauf gelesen wird,
zählen nicht zur Grenze. Es zählen nur neue Ereignisse, die während der
aktuellen Aufgabe geschrieben werden.

### Suchattributgröße {#search-attribute-size}

Suchattribute haben feste Obergrenzen: Zeichenfolgen bis 2.048 Zeichen (`search_attribute_string_characters`), Keywords und Keyword-Listeneinträge bis 255 Zeichen (`search_attribute_keyword_characters`), höchstens 100 Attribute (`search_attribute_count`) und insgesamt 65.536 Bytes (`search_attribute_total_bytes`). `search_attribute_size_bytes` prüft die JSON-Größe der zusammengeführten Attributzuordnung und kann die Gesamtgrenze verschärfen, aber nicht anheben. Der Wert `0` schaltet diese Prüfung ab; die festen Obergrenzen bleiben.

Start, `upsertSearchAttributes()` und Upserts von Service-Workern wenden dieselben Grenzen an, bevor etwas geschrieben wird, und schlagen wie bei Memo-Grenzen fehl.

## Fehlertaxonomie {#failure-taxonomy}

Beim Überschreiten einer strukturellen Grenze zeichnet die Engine Folgendes auf:

- Eine `WorkflowFailure`-Zeile mit `failure_category = structural_limit`.
- Ein Verlaufsereignis `WorkflowFailed` mit:
  - `failure_category = structural_limit`
  - `structural_limit_kind`: die konkret überschrittene Grenze (z. B. `pending_activity_count`, `command_batch_size`)
  - `structural_limit_value`: die aktuelle Anzahl oder Größe, die die Grenze ausgelöst hat
  - `structural_limit_configured`: die konfigurierte Obergrenze

Diese Metadaten sind maschinenlesbar. Betreiber, Waterline und externe
Werkzeuge können die Ursache damit ohne Auswertung freier Textmeldungen
erkennen.

## Zustandsprüfung {#health-check}

Die aktuelle Konfiguration struktureller Grenzen ist im Snapshot der
v2-Zustandsprüfung unter `structural_limits` enthalten. Dadurch sehen Betreiber
die aktiven Obergrenzen:

```json
{
  "structural_limits": {
    "pending_activity_count": 2000,
    "pending_child_count": 1000,
    "pending_timer_count": 2000,
    "pending_signal_count": 5000,
    "pending_update_count": 500,
    "command_batch_size": 1000,
    "payload_size_bytes": 2097152,
    "memo_size_bytes": 65536,
    "search_attribute_size_bytes": 40960,
    "history_transaction_size": 5000,
    "warning_threshold_percent": 80
  }
}
```

## Backend-abhängige Grenzen {#backend-dependent-limits}

Der Backend-Fähigkeitssnapshot veröffentlicht den vollständigen, an die aktuelle
Infrastruktur angepassten Vertrag struktureller Grenzen. Die meisten Grenzen
sind Backend-unabhängige Konfigurationswerte. Bestimmte Backends erzwingen
jedoch zusätzliche Einschränkungen:

- **SQS-Queue**: [Standard-SQS-Nachrichtenverzögerungen](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-message-timers.html) sind auf 900 Sekunden begrenzt. Längere Verzögerungen für Timer, Aktivitätswiederholungen und Workflow-Aufgaben werden von der Transportschicht aufgeteilt. Der Fähigkeitssnapshot behält `max_single_timer_delay_seconds: 900` aus Kompatibilitätsgründen bei.
- **SQLite-Datenbank**: SQLite serialisiert Schreibzugriffe. Der Snapshot vermerkt daher `concurrent_write_safety: limited`. Hohe Grenzen für ausstehende Elemente können bei gleichzeitiger Worker-Last zu Sperrkonflikten führen.

Eine frühe SQS-Zustellung plant eine weitere begrenzte Nachricht ein, ohne die
dauerhafte Aufgabe zu leasen, einen Ausführungsversuch zu verbrauchen,
Ausführungsverlauf zu schreiben oder Benutzercode auszuführen. Das ursprüngliche
`available_at` bleibt unverändert. Sobald die Aufgabe fällig ist, gelten die
normale Ausführung und Absicherung gegen doppelte Zustellung. Die
Gesamtfristen für Workflow und Aktivität laufen während des Wartens weiter.
Wählen Sie daher Wartezeiten zwischen Versuchen, die in diese Budgets passen.
Queue-Treiber ohne Verzögerungsgrenze behalten die genau angeforderte
Verzögerung bei.

Der vollständige Vertrag ist im Abschnitt `structural_limits` der Antwort zu
Backend-Fähigkeiten verfügbar:

```json
{
  "structural_limits": {
    "configured": { "pending_activity_count": 2000, "..." : "..." },
    "backend_adjustments": { "max_single_timer_delay_seconds": 900 },
    "effective": { "pending_activity_count": 2000, "max_single_timer_delay_seconds": 900, "..." : "..." },
    "issues": [
      {
        "component": "structural_limits",
        "severity": "info",
        "code": "queue_max_delay_constraint",
        "message": "The [sqs] queue driver limits delayed dispatch to 900 seconds; longer task delays are chunked by the transport layer."
      }
    ]
  }
}
```

## Waterline {#waterline}

Waterline zeigt Fehler struktureller Grenzen in der Ausnahmentabelle mit der
Fehlerkategorie `structural_limit`. Die Fehlerdetails der Zeitleiste enthalten
Grenzart, aktuellen Wert und konfigurierte Obergrenze.

## Grenzen im Service Mode {#server-request-boundary-limits}

Die HTTP-Anfragegrenzen von Server und Cloud gelten getrennt von diesen eingebetteten Laravel-Grenzen. Siehe die [Server-Anfragereferenz](../polyglot/server-config-reference.md#server-request-boundary-limits).

Die Grenzen für Namen und IDs nativer Worker-Befehle stehen in den [Feldgrenzen](../polyglot/server-config-reference.md#native-worker-command-name-limits).

### Größe eines Workflow-Task-Abschlusses {#workflow-task-completion-size}

Completion-Grenzen und die Behandlung von SDK-Ablehnungen im Service Mode stehen in der [Server-Referenz](../polyglot/server-config-reference.md#workflow-task-completion-size).
