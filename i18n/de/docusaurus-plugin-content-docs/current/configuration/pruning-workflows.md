---
sidebar_position: 6
title: Workflow-Daten bereinigen
description: Läufe archivieren, geprüfte Historie exportieren und Details unter Wahrung erforderlicher Wiederherstellungskopien bereinigen.
---

# Workflow-Daten bereinigen {#pruning-workflows}

Workflow v2 unterscheidet zwei Lebenszyklusvorgänge:

1. **Archivieren**: markiert einen terminalen Lauf als archiviert, sodass er nicht mehr in aktiven Flottenansichten erscheint. Archivierung löscht **keine** Zeilen.
2. **Bereinigen**: entfernt geeignete gespeicherte Details oder verwaiste Projektionen. Die eingebettete Bereinigungs-API verlangt einen terminalen, geschlossenen Lauf und prüft Aufbewahrungssperren. Die Host-Anwendung bestimmt die Aufbewahrungsregel; Archivierung ist keine API-Voraussetzung.

Server hat eine eigene Namespace-Aufbewahrungsregel: Die automatische Bereinigung überspringt archivierte Läufe. Archivierung schützt einen Server-Lauf deshalb vor dieser Bereinigung; sie bereitet keine automatische Löschung vor.

## Historie über die Datenbankaufbewahrung hinaus erhalten {#keeping-history-beyond-database-retention}

Legen Sie vor Aktivierung der Bereinigung fest, wo die benötigte Historie erhalten bleibt:

| Bedarf | Möglichkeit | Speicher- und Bereinigungsfolge |
| --- | --- | --- |
| Neuere Historie in Server erhalten | Begrenzte Namespace-Aufbewahrung von 1 bis 365 Tagen | Geeignete geschlossene Läufe können nach der Frist bereinigt werden. Exportieren Sie früher, wenn Sie einen längeren Nachweis benötigen. |
| Gesamte Namespace-Historie in Server erhalten | Namespace-Aufbewahrungsmodus `forever` | Historie bleibt in der primären Datenbank, bis Sie ausdrücklich zur begrenzten Aufbewahrung zurückkehren. |
| Ausgewählte geschlossene Server-Läufe erhalten | Diese Läufe archivieren | Automatische und explizite Server-Aufbewahrungsdurchläufe überspringen sie. Die veröffentlichte API bietet kein Aufheben der Archivierung; verwenden Sie Archivierung nicht als vorübergehende Exportsperre. |
| Längeren unabhängigen Nachweis erhalten | Jeden geschlossenen Lauf exportieren und externe Payload-Objekte erhalten | Ihre Anwendung übernimmt Zeitplanung, Prüfung, Zugriffsschutz und spätere Löschung der Kopie. Es gibt keinen eingebauten fortlaufenden Historienexport. |

`forever` und Archivierung erhalten Datenbankzeilen, statt sie auf günstigeren Speicher zu verschieben. Planen Sie wachsende Historien- und Payload-Daten, Indizes, Sicherungen und Wiederherstellungszeit ein. Die Bereinigung erhält Lauf- und Instanzzeilen einschließlich ihrer Wurzel-Payloads; deren Speicherbedarf sinkt nicht auf null. Ein Historienexport unterstützt Replay und Untersuchungen. Er ist weder eine vollständige Datenbanksicherung noch eine Zusage, dass sich ein Lauf allein aus dieser Datei fortsetzen lässt.

### Vor der Bereinigung exportieren {#export-before-pruning}

Verwenden Sie denselben Ablauf für die Aufbewahrungsaufgabe einer eingebetteten Anwendung und einen Server-Namespace. Auswahl und Löschberechtigung unterscheiden sich wie unten beschrieben.

1. **Sicheres Zeitfenster schaffen.** Exportieren Sie deutlich vor Ende der Aufbewahrungsfrist und lassen Sie Zeit für Wiederholungen, Ausfälle und Prüfungsrückstände. Ein täglicher Export bei 30 Tagen Datenbankaufbewahrung bietet mehr Wiederherstellungszeit als ein erster Export an Tag 30. Schützen Sie vor dem ersten Export oder einer Fristverkürzung vorübergehend die Quelle: Pausieren Sie die eingebettete Bereinigung oder verwenden Sie Servers `forever`-Regel. Notieren Sie die bisherige Regel und stellen Sie sie erst nach Prüfung wieder her. Bereinigung kann sofort beginnen, sobald ein Lauf geeignet ist.
2. **Geschlossene Läufe inventarisieren.** Legen Sie eine feste obere UTC-Grenze fest und wählen Sie frühere `closed_at`-Werte. Exportieren Sie alle Läufe einschließlich fehlgeschlagener, abgebrochener, terminierter und durch Continue-as-new ersetzter Vorgänger. Eine Instanz kann mehrere Läufe haben. Speichern Sie Namespace, Instanzkennung, Laufkennung und Abschlusszeit jedes Kandidaten und folgen Sie allen Ergebnisseiten.
3. **Einen bestimmten Lauf exportieren.** Verwenden Sie den unten genannten laufbezogenen Endpunkt oder Befehl, nicht den zum Verarbeitungszeitpunkt gerade aktuellen Lauf. Halten Sie Kandidatenexporte von bereits geprüften Kopien getrennt.
4. **Gespeicherte Kopie prüfen.** Lesen Sie die Kopie am Ziel zurück. Prüfen Sie Laufidentität gegen das Namespace-Inventar, Schemaversion, erwartete letzte Historiensequenz, vollständigen Ereignisbereich, Schwärzungsregel und Prüfsumme. Prüfen Sie konfigurierte Signaturen mit einem vertrauenswürdigen Schlüssel. Bewahren Sie den genauen Anwendungsbuild und erforderliche Codecs für einen kalten Replay-Test auf. Eine Prüfsumme belegt gleiche Bytes, nicht die Vollständigkeit der Historie beim Export.
5. **Externe Bytes erhalten.** Exporte enthalten externe Referenzhüllen, keine unabhängige Kopie jedes referenzierten Objekts. Erhalten Sie diese Bytes für die Lebensdauer des Exports und testen Sie den Abruf ohne warmen Laufzeit-Cache. Beachten Sie den [Lebenszyklus externer Payloads](../features/external-payload-storage.md#replay-retention-and-cleanup).
6. **Vor Bereinigung abgleichen.** Vergleichen Sie das Inventar geschlossener Läufe mit geprüften Zielkopien. Alarmieren Sie bei fehlenden Laufkennungen, fehlgeschlagenen Prüfungen und Exportverzug nahe der Löschgrenze. Schreiben Sie den Exportprüfpunkt erst fort, wenn jeder Kandidat nachgewiesen ist. Prüfen Sie überlappende Abschlusszeitfenster erneut und deduplizieren Sie nach Namespace und Laufkennung. Überschreiben Sie kein geprüftes vollständiges Paket mit einem späteren unvollständigen Export.

:::warning Ohne Wiederherstellungskopie ist die Bereinigung unumkehrbar

Ein Export nach der Bereinigung kann gelöschte Ereignisse nicht rekonstruieren. Die veröffentlichte Exportimplementierung kann einen bereinigten terminalen Lauf dennoch als `history_complete: true` markieren und seinen früheren `dedupe_key` wiederverwenden. Siehe [Workflow #856](https://github.com/durable-workflow/workflow/issues/856). Keines dieser Felder beweist, dass noch keine Bereinigung stattgefunden hat. Eingebettete Exportaufgaben müssen Läufe mit gesetztem `details_pruned_at` ablehnen. Die Server-Liste zeigt einen Lauf nach Bereinigung seiner Zusammenfassung nicht mehr. Ein erst danach begonnenes Inventar kann somit nicht belegen, dass alle älteren Läufe erfasst wurden. Bewahren Sie das vorherige Inventar auf und untersuchen Sie Lücken anhand einer Wiederherstellungskopie.

:::

### Server-Läufe auswählen und exportieren {#selecting-and-exporting-server-runs}

Die Workflow-Liste unterstützt `CloseTime`-Vergleiche über ihren Parameter `query`. Dieses Beispiel wählt ein festes halboffenes UTC-Intervall:

```bash
curl --fail-with-body --get "$DURABLE_WORKFLOW_SERVER_URL/api/workflows" \
  -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  --data-urlencode "query=CloseTime >= '2026-10-01T00:00:00Z' AND CloseTime < '2026-10-02T00:00:00Z'" \
  --data-urlencode "page_size=200"
```

Lesen Sie für jeden Eintrag `workflow_id`, `run_id` und `closed_at` aus `workflows`. Wiederholen Sie dieselbe Anfrage mit `next_page_token`, bis die Antwort `next_page_token: null` liefert. Filtern Sie nicht nur nach `status=completed`, sonst fehlen Fehler und andere terminale Ergebnisse. Ändern Sie das Zeitfenster beim Paginieren nicht und verhindern Sie während der Erfassung das Löschen seiner Zusammenfassungen.

Exportieren und speichern Sie das Paket für jedes ausgewählte Paar:

```bash
curl --fail-with-body "$DURABLE_WORKFLOW_SERVER_URL/api/workflows/$WORKFLOW_ID/runs/$RUN_ID/history/export" \
  -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  --output "$RUN_ID.candidate.json"
```

Die [Server-Aufbewahrungsregel](../polyglot/server.md#retention) bestimmt, wann automatische Bereinigung eingreifen darf. Stellen Sie nach Prüfung aller erforderlichen Kopien die geplante begrenzte Regel wieder her. Prüfen Sie die Kapazität, bevor Sie `forever` bei längerem Exportausfall beibehalten. Archivierte Läufe bleiben unabhängig davon geschützt.

### Eingebettete Läufe auswählen und exportieren {#selecting-and-exporting-embedded-runs}

Verwenden Sie das konfigurierte Laufmodell, um unbereinigte geschlossene Läufe nach `closed_at` auszuwählen. Die folgende Abfrage erzeugt das Kandidateninventar, keinen automatischen Export:

```php
use Workflow\V2\Models\WorkflowRun;
use Workflow\V2\Support\ConfiguredV2Models;

$runs = ConfiguredV2Models::query('run_model', WorkflowRun::class)
    ->whereNull('details_pruned_at')
    ->whereNotNull('closed_at')
    ->where('closed_at', '>=', $fromUtc)
    ->where('closed_at', '<', $untilUtc)
    ->orderBy('id')
    ->lazyById(100);

foreach ($runs as $run) {
    // Persist the candidate run id and close time in your export inventory.
}
```

Exportieren Sie jeden ausgewählten Lauf mit normalem Anwendungsstart und normaler Speicherkonfiguration:

```bash
php artisan workflow:v2:history-export "$WORKFLOW_ID" --run-id="$RUN_ID" --output="$RUN_ID.candidate.json" --pretty
php artisan workflow:v2:replay-verify "$RUN_ID.candidate.json" --skip-replay --json
```

`--skip-replay` prüft Integrität und Struktur ohne Replay-Ausführung. Es belegt weder die Verfügbarkeit externer Bytes noch einen Export vor der Bereinigung. Testen Sie gesondert einen repräsentativen vollständigen Replay mit dem vorgesehenen Anwendungsbuild. Die Bereinigungsaufgabe darf `pruneRun()` erst nach Erfüllung ihrer Aufbewahrungs- und Exportvorgaben aufrufen. Ein erfolgreicher Export erlaubt nicht automatisch die Löschung.

## Terminale Läufe archivieren {#archiving-terminal-runs}

Archivieren Sie einen abgeschlossenen, fehlgeschlagenen, abgebrochenen oder terminierten Lauf über die Steuerungsebene:

```php
use Workflow\V2\Contracts\WorkflowControlPlane;

$controlPlane = app(WorkflowControlPlane::class);

$result = $controlPlane->archive('order-12345', [
    'reason' => 'Retention period expired',
]);

if ($result['accepted']) {
    // Run's archived_at is now set; it disappears from active fleet views.
}
```

Derselbe Vorgang steht über die HTTP-Steuerungsroute zur Verfügung. Nur geschlossene Läufe können archiviert werden. Bei bereits archivierten Läufen wird `accepted` mit Ergebnis `archive_not_needed` zurückgegeben.

### Archivierung automatisieren {#automating-archival}

Archivieren Sie terminale Läufe zeitgesteuert, indem Sie die dauerhafte Lauftabelle nach abgeschlossenen Läufen jenseits Ihrer Aufbewahrungsfrist abfragen und für jeden `archive()` aufrufen. Eine einfache zeitbasierte Regel in `routes/console.php` kann so aussehen:

```php
use Illuminate\Support\Facades\Schedule;
use Workflow\V2\Models\WorkflowRun;
use Workflow\V2\Contracts\WorkflowControlPlane;

Schedule::call(function (WorkflowControlPlane $controlPlane): void {
    WorkflowRun::query()
        ->whereIn('status', ['completed', 'failed', 'cancelled', 'terminated'])
        ->whereNull('archived_at')
        ->where('closed_at', '<=', now()->subMonth())
        ->with('instance:id')
        ->chunkById(100, function ($runs) use ($controlPlane): void {
            foreach ($runs as $run) {
                $controlPlane->archive($run->instance->id, [
                    'reason' => 'retention_policy',
                ]);
            }
        });
})->daily();
```

## Projektionszeilen bereinigen {#pruning-projection-rows}

Zusammenfassungs-, Warte-, Zeitleisten-, Timer- und Abstammungsprojektionen lassen sich aus dauerhafter Historie und Befehlen neu aufbauen. Mit `workflow:v2:rebuild-projections --prune-stale` löschen Sie Projektionszeilen, deren dauerhafter Lauf nicht mehr existiert:

```bash
# Preview what would be pruned
php artisan workflow:v2:rebuild-projections --prune-stale --dry-run

# Actually prune stale projection rows
php artisan workflow:v2:rebuild-projections --prune-stale
```

## Dauerhafte Daten bereinigen {#pruning-durable-rows}

Eingebettete Hosts können die mitgelieferte Bereinigungs-API verwenden, nachdem sie ihre Aufbewahrungsregel durchgesetzt und erforderliche Export- oder Wiederherstellungskopien geprüft haben:

```php
use Workflow\V2\Support\WorkflowRunRetentionCleanup;

$report = WorkflowRunRetentionCleanup::pruneRun($runId);
```

`pruneRun()` sperrt den ausgewählten Lauf und entfernt seine Detailzeilen in einer Speichertransaktion. Es verweigert nichtterminale Läufe, fehlende Abschlusszeiten oder offene abgekoppelte Aktivitäten (`detached_activity_still_open`). Der Host bleibt für die Auswahl des autorisierten Laufs und seine Aufbewahrungsfrist verantwortlich. `retentionHoldReason($runId)` kann die Sperre durch eine abgekoppelte Aktivität prüfen; der Löschvorgang prüft sie vor dem Entfernen erneut.

Erhalten Sie `workflow_runs` und `workflow_instances`. Der Lauf bleibt als terminaler Nachweis mit `details_pruned_at` bestehen; erneute Bereinigung erhält die erste Markierung. Wurzel-Ein- und Ausgabefelder bleiben in der Laufzeile, berücksichtigen Sie deren Speicher gesondert. Erzeugen Sie gelöschte Zusammenfassungen oder Historie nicht durch Projektionsneubau erneut. Ein Export nach Bereinigung kann entfernte Historie nicht wiederherstellen. Die Vollständigkeitsgrenze wird in [Workflow #856](https://github.com/durable-workflow/workflow/issues/856) behandelt.

Diese API löscht Datenbankdetails. Der Host verantwortet Aufbewahrung und Bereinigung externer Objekte einschließlich Referenzen aus erhaltenen Wurzeln, abgekoppelter Arbeit und aktiven Sicherungs- oder Wiederherstellungssperren. Beachten Sie vor Objektlöschung den [Lebenszyklus externer Payloads](../features/external-payload-storage.md). Prüfen Sie Export und benötigte externe Bytes **vor** der Bereinigung. Archivierte Läufe mit erhaltenen Details stehen weiterhin für Vorfalluntersuchungen bereit.
