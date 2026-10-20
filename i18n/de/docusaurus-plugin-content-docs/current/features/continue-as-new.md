---
sidebar_position: 14
tags:
  - continue-as-new
  - history
  - message-streams
  - workflows
keywords:
  - als neuer Lauf fortsetzen
  - Wachstum der Workflow-Historie
  - Laufübergabe
  - Übergabe von Nachrichtenströmen
---

# Als neuer Lauf fortsetzen {#continue-as-new}

Das Muster **Continue As New** ermöglicht einem laufenden Workflow, sich selbst
mit neuen Argumenten neu zu starten. Dies ist nützlich, um:

* unbegrenztes Wachstum der Workflow-Historie zu verhindern;
* iterative Schleifen oder rekursive Workflows zu modellieren;
* langlebige Workflows unter Erhalt der Kontinuität in kleinere, handhabbare Läufe aufzuteilen.

## `continueAsNew` verwenden {#using-continueasnew}

Rufen Sie zum Neustarten eines Workflows die Hilfsfunktion
`continueAsNew(...)` innerhalb seiner Methode `handle()` auf.
`continueAsNew()` ist ein vollwertiger Laufübergang.

```php
use function Workflow\V2\activity;
use function Workflow\V2\continueAsNew;
use Workflow\V2\Workflow;

class CounterWorkflow extends Workflow
{
    public function handle(int $count = 0, int $max = 3)
    {
        $result = activity(CountActivity::class, $count);

        if ($count >= $max) {
            return [
                'count' => $result,
                'workflow_id' => $this->workflowId(),
                'run_id' => $this->runId(),
            ];
        }

        return continueAsNew($count + 1, $max);
    }
}
```

In diesem Beispiel:

* führt der Workflow in jeder Iteration eine Aktivität aus;
* setzt er sich mit erhöhten Argumenten als neuer Lauf fort, solange die maximale Anzahl noch nicht erreicht ist;
* wird das Endergebnis erst nach Abschluss der Schleife zurückgegeben.

Wenn ein Workflow sich als neuer Lauf fortsetzt:

- bleibt die Instanz-ID über die Kette hinweg stabil; `WorkflowStub::runId()` wechselt zum neuesten Lauf;
- schließt der fortgesetzte Lauf als `completed` / `continued` und der nächste Lauf startet sofort mit einer neuen Lauf-ID;
- lösen instanzbezogene Signale, Abfragen, Updates und Betreiberbefehle den neuesten dauerhaften Lauf auf. Explizit laufbezogene Befehle bleiben an ihren ausgewählten Lauf gebunden.

Core 2.7.0 und kompatible Server erhalten empfangene instanzbezogene Signale,
deren Handler der Befehlsvertrag des Laufs deklariert und die der alte Lauf
noch nicht angewendet hat. Sie werden zusammen mit ausstehenden angenommenen
Updates in der ursprünglichen Befehlsreihenfolge übertragen. Signal- und
Befehls-IDs, Argumentbytes und Empfangszeiten bleiben unverändert. Ein bereits
angewendetes Signal wird dem Nachfolger nicht erneut zugestellt. Übergeben Sie
den vom nächsten Lauf benötigten Geschäftszustand als Argumente an
`continueAsNew()`. Beliebiger lokaler Zustand wird nicht automatisch kopiert.

Ein laufbezogenes Signal wird niemals auf ein anderes Ziel umgebogen. Kann es
vor dem Schließen seines Laufs nicht angewendet werden, erhält es das explizite
Ablehnungsergebnis aus [Signalannahme und Abschluss](./signals.md#acceptance-and-closure).
Fehlende Legacy-Deklarationen erlauben keine Übergabe. Diese Signale werden
auf dem Vorgänger explizit abgeschlossen.

Langlebige Schleifen können so ihre Historie abwerfen, ohne bei jedem
Laufwechsel eine neue öffentliche Workflow-ID zu erfinden.

## Historienbudget {#history-budget}

Workflow-Code kann über expliziten Laufzeitkontext seine aktuelle
Historienlänge und ein Empfehlungssignal für Continue-as-new abfragen.
Langlebige Schleifen können so bewusst übergeben, bevor sie an kostspielige
Historienbudgetgrenzen stoßen.

```php
use function Workflow\V2\activity;
use function Workflow\V2\continueAsNew;
use Workflow\V2\Workflow;

class PollingWorkflow extends Workflow
{
    public function handle(int $iteration = 0)
    {
        $result = activity(PollActivity::class);

        if ($this->shouldContinueAsNew()) {
            return continueAsNew($iteration + 1);
        }

        return ['result' => $result, 'iteration' => $iteration];
    }
}
```

### Verfügbare Methoden {#available-methods}

| Methode | Rückgabetyp | Beschreibung |
| --- | --- | --- |
| `$this->historyLength()` | `int` | Anzahl der Historienereignisse im aktuellen Lauf |
| `$this->historySize()` | `int` | Gesamtgröße der Historienereignisse in Bytes |
| `$this->shouldContinueAsNew()` | `bool` | `true`, wenn der Lauf das konfigurierte Ereignisanzahl- oder Byte-Größenbudget überschreitet |

### Konfiguration {#configuration}

Die Empfehlungsschwellen für Continue-as-new sind konfigurierbar:

```php
// config/workflows.php
'v2' => [
    'history_budget' => [
        'continue_as_new_event_threshold' => 10000,
        'continue_as_new_size_bytes_threshold' => 5242880, // 5 MB
    ],
],
```

`shouldContinueAsNew()` gibt `true` zurück, wenn eine der Schwellen
überschritten wird. Laufzusammenfassungen führen auch `history_event_count`,
`history_size_bytes` und `continue_as_new_recommended`, damit Waterline
langlebige Läufe in Flottenansichten kennzeichnen kann.

## Metadaten übernehmen {#metadata-carry-forward}

Bei Continue-as-new erbt der neue Lauf automatisch die Metadaten des vorherigen:

| Metadaten | Übernahmeverhalten |
| --- | --- |
| Suchattribute | Die vollständig zusammengeführte Zuordnung wird übernommen, einschließlich Upserts während des Laufs |
| Memo | Die vollständig zusammengeführte Zuordnung wird übernommen, einschließlich Upserts während des Laufs |
| Sichtbarkeitslabels | Unverändert übernommen, einmalig beim Start gesetzt |
| Geschäftsschlüssel | Unverändert übernommen |
| Kompatibilitätsmarker | Übernommen, damit der neue Lauf denselben Worker-Build adressiert |
| Nachrichten-Cursor-Position | Übernommen, damit der neue Lauf weiß, welche eingehenden Nachrichten über [Nachrichtenströme](./message-streams.md) bereits verbraucht wurden |

Der neue Lauf startet mit den geerbten Metadaten und kann Suchattribute und
Memo von dort weiter aktualisieren. Ein langlebiger Polling-Workflow kann so
Metadaten über Generationen hinweg ansammeln, ohne beim Abwerfen der Historie
Zustand zu verlieren.

```php
use function Workflow\V2\{activity, continueAsNew, upsertMemo, upsertSearchAttributes};
use Workflow\V2\Workflow;

class PollingWorkflow extends Workflow
{
    public function handle(int $iteration = 0)
    {
        $result = activity(PollActivity::class);

        upsertSearchAttributes(['iteration' => (string) $iteration, 'status' => 'polling']);
        upsertMemo(['last_result' => $result, 'iteration' => $iteration]);

        if ($this->shouldContinueAsNew()) {
            // The new run inherits all search attributes and memo
            return continueAsNew($iteration + 1);
        }

        return ['result' => $result, 'iteration' => $iteration];
    }
}
```

Für langlebige Schleifen mit menschlichen Eingaben oder Assistenten bevorzugen
Sie die vollwertige Fassade `$this->inbox()` / `$this->outbox()` für
[Nachrichtenströme](./message-streams.md). Ausstehende Stromnachrichten und
Cursor-Position gehen auf den fortgesetzten Lauf über. Verbrauchte Nachrichten
bleiben als Historiennachweis auf dem ursprünglichen Lauf.
