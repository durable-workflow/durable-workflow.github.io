---
title: Externen Status abfragen
description: Begrenzte Wiederholungen, Aktivitäten mit Heartbeats oder dauerhafte Timer-Schleifen wählen und ihre Historienkosten berücksichtigen.
---

# Externen Status abfragen {#polling-external-state}

Fragen Sie externe Aufträge in einer Aktivität ab, niemals mit Netzwerkanfragen im Workflow-Code. Entscheiden Sie zuerst, wo das Warten stattfinden soll, und dann über das Intervall.

## Die Grenze des Wartens wählen {#choose-the-waiting-boundary}

| Muster | Worker-Nutzung | Dauerhafte Historie und Steuerung |
| --- | --- | --- |
| Eine Aktivität bis zur Bereitschaft wiederholen | Ein Aktivitäts-Slot je Versuch; während der Wiederholungsverzögerung freigegeben | Jeder Versuch und jede Wiederholungsplanung erweitert die Historie. Workflow-Code läuft zwischen Versuchen nicht weiter und kann dann weder das Historienbudget prüfen noch Continue-as-new ausführen. |
| Eine lange Aktivität mit Heartbeats | Belegt ihren Aktivitäts-Slot während der gesamten Wartezeit | Jeder akzeptierte Heartbeat erzeugt ein Historienereignis. Verwenden Sie endliche Aktivitätsfristen und begrenzte Zeitlimits für externe Anfragen; Heartbeats verlängern nicht die Frist der gesamten Ausführung. |
| Aktivitätsprüfung mit anschließendem dauerhaftem Timer | Gibt Aktivitäts-Slots zwischen Prüfungen frei | Jede Prüfung erzeugt Aktivitätsereignisse, jedes Intervall Timer-Ereignisse. Zwischen Prüfungen kann Workflow-Code über Stoppen, Kompensation oder Continue-as-new entscheiden. |
| Ein eigener untergeordneter Workflow zum Abfragen | Der untergeordnete Workflow nutzt die Slots seines gewählten Musters | Verlegt die Abfragehistorie in den untergeordneten Workflow; beim übergeordneten entstehen Start- und Auflösungsereignisse. Historie und Ausführung des untergeordneten Workflows verursachen weiterhin Aufwand. Wählen Sie die Richtlinie beim Schließen des übergeordneten Workflows ausdrücklich. |

Verwenden Sie kurze, sicher wiederholbare Prüfungen. Ein in einer externen Anfrage blockierter Callback wird nicht allein dadurch reaktionsfähig, dass sein Workflow einen Timer oder eine Abbruchrichtlinie besitzt.

## Wiederholungen und Historie begrenzen {#bound-retries-and-history}

Wiederholungen müssen aktiviert werden: PHP-Aktivitäten haben standardmäßig einen Versuch. Konfigurieren Sie beispielsweise `maxAttempts: 3`, `backoff: [5, 30]`, `startToCloseTimeout: 10` und `scheduleToCloseTimeout: 90` für drei entfernte Versuche mit endlichen Verzögerungen und ursprünglichem Gesamtzeitlimit. Die entsprechende Python-Richtlinie ist `ActivityRetryPolicy(max_attempts=3, backoff_seconds=[5, 30])`, mit getrennten Zeitlimitoptionen für Versuch und Gesamtaktivität. Eine erfolgreiche Rückgabe „noch nicht bereit“ ist kein Fehler und löst keinen erneuten Versuch aus. Siehe [Fehler und Wiederherstellung](../failures-and-recovery.md).

Wiederholungen eignen sich, wenn fehlende Bereitschaft ein ausdrücklich wiederholbares Ergebnis ist und Workflow-Code zwischen Prüfungen nicht laufen muss. Verwenden Sie unbegrenzte Wiederholungen nicht als unsichtbare Abfrageschleife. Die Übereinstimmung der Verzögerungen lokaler Aktivitäten wird im [Issue zum Wiederholungsvertrag](https://github.com/durable-workflow/.github/issues/219) verfolgt; diese Beispiele verwenden entfernte Aktivitäten.

## Bewusst in einen neuen Lauf wechseln {#roll-over-deliberately}

Dieses ausführbare Beispiel prüft einmal pro Lauf, wartet und übergibt einen endlichen Zähler verbleibender Prüfungen an den nächsten Lauf. Ersetzen Sie nur die synthetische Statusabfrage der Aktivität durch eine echte, zeitlich begrenzte Anfrage. Das Beispiel gibt den letzten Status auch bei erreichtem Prüflimit zurück; Aufrufer müssen `ready` prüfen.

### Eingebettetes PHP {#embedded-php}

```php
use Workflow\V2\Activity;
use Workflow\V2\Support\ActivityOptions;
use Workflow\V2\Workflow;
use function Workflow\V2\activity;
use function Workflow\V2\timer;
use function Workflow\V2\continueAsNew;

final class CheckDemoStatus extends Activity
{
    public function handle(int $remaining): array
    {
        return ['ready' => $remaining <= 1];
    }
}

final class PollDemo extends Workflow
{
    public function handle(int $remaining = 2, int $intervalSeconds = 30): array
    {
        $status = activity(CheckDemoStatus::class, new ActivityOptions(
            maxAttempts: 1, startToCloseTimeout: 10, scheduleToCloseTimeout: 15,
        ), $remaining);
        if ($status['ready'] || $remaining <= 1) {
            return $status;
        }
        timer($intervalSeconds);
        return continueAsNew($remaining - 1, $intervalSeconds);
    }
}
```

Starten Sie es über die übliche [Einrichtung eingebetteter Workflows](../installation.md), mit endlichen Zeitlimits für den einzelnen Lauf und die gesamte logische Ausführung.

### Python-Worker im Dienstmodus {#python-service-worker}

```python
from durable_workflow import activity, workflow
from durable_workflow.workflow import ActivityRetryPolicy

@activity.defn(name="poll-demo.status")
async def check_status(remaining):
    return {"ready": remaining <= 1}

@workflow.defn(name="poll-demo")
class PollDemo:
    def run(self, ctx, remaining=2, interval_seconds=30):
        result = yield ctx.schedule_activity(
            "poll-demo.status", [remaining],
            retry_policy=ActivityRetryPolicy(max_attempts=1, backoff_seconds=[1]),
            start_to_close_timeout=10, schedule_to_close_timeout=15,
        )
        if result["ready"] or remaining <= 1:
            return result
        yield ctx.sleep(interval_seconds)
        return ctx.continue_as_new(remaining - 1, interval_seconds)
```

Registrieren Sie `PollDemo` und `check_status` im selben [Python-Worker](./python.md), und starten Sie dann mit `[2, 30]` sowie endlichen Zeitlimits für Gesamtausführung und Lauf. Beobachten Sie die aktuelle Workflow-Instanz, um ihrem Nachfolger zu folgen; ein laufbezogenes Handle wählt weiterhin den ursprünglichen Lauf.

Beide Beispiele wurden mit den veröffentlichten Versionen Server **2.9.7 / Core 2.7.2**, regulär installiertem Python **2.6.1** und der Testeingabe `[2, 1]` ausgeführt. Beide führten zwei echte Prüfungen in zwei Läufen aus. Continue-as-new beginnt eine neue Laufhistorie, erzeugt zusätzlichen Lauf- und Verknüpfungsaufwand und behält die ursprüngliche Ausführungsfrist bei. Es ermöglicht keine unbegrenzte Lebensdauer.

Verwenden Sie hier relative dauerhafte Wartezeiten. Eine fortschreitende Python-Uhr und bei der Wiedergabe stabile Abfragen des Historienbudgets bleiben getrennte Arbeiten an [Uhr](https://github.com/durable-workflow/.github/issues/215) und [Budget](https://github.com/durable-workflow/workflow/issues/859). Dieses Rezept verzweigt nicht anhand von `ctx.now()` oder einer neu berechneten Historienlänge. Betrachten Sie `DW_MAX_HISTORY_EVENTS` nicht als erzwungenen automatischen Laufwechsel: [Server #504](https://github.com/durable-workflow/server/issues/504) verfolgt diese Lücke.

## Unterbrechen und Auswirkungen abgleichen {#interrupt-and-reconcile}

Für einen signalgesteuerten Stopp [wählen Sie zwischen Signal und ausstehender Warteoperation](../features/concurrency.md) und brechen die unterlegene Operation gemäß ihrer unterstützten Abbruchrichtlinie ausdrücklich ab. Die Auswahl allein bricht die übrigen Operationen nicht ab. Eine Stoppanforderung beweist nicht, dass eine externe Nebenwirkung niemals eingetreten ist: Verwenden Sie Idempotenzschlüssel und gleichen Sie den Zustand vor Kompensation oder Neustart ab. Sofortiger Abbruch, Terminierung und hartes Workflow-Zeitlimit führen keinen Workflow-Kompensationscode aus; verwenden Sie den unterstützten [kooperativen Abbruch](./cancellation.md), wenn Aufräumcode laufen muss.

## Die tatsächliche Historie prüfen {#inspect-the-actual-history}

Die obigen Messungen im Python-Dienstmodus zeichneten Folgendes auf:

| Abgeschlossener Fall | Ereignisse der kanonischen Historie |
| --- | --- |
| Eine entfernte Aktivität gelingt im dritten Versuch | Insgesamt 10: 1 Planung, 3 Starts, 2 Wiederholungsplanungen, 1 Abschluss und 3 Lebenszyklusereignisse des Laufs |
| Eine Aktivität mit zwei akzeptierten Heartbeats | Insgesamt 8: 3 Aktivitätsereignisse, 2 Heartbeat-Ereignisse und 3 Lebenszyklusereignisse |
| Zwei erfolgreiche Prüfungen mit einem Timer dazwischen | Insgesamt 11: 6 Aktivitätsereignisse, 2 Timer-Ereignisse und 3 Lebenszyklusereignisse |

Das Laufwechselbeispiel zeichnete **8 + 5** Ereignisse über seine Python-Läufe und **8 + 6** über die PHP-Läufe auf; PHP zeichnet auch beim Nachfolger `StartAccepted` auf. Dies sind gemessene Operations- und Laufkosten, keine universellen Ereignissummen, Abrechnungseinheiten oder Leistungsergebnisse. Weitere Befehle, Fehler, Abbrüche und laufzeitspezifische Annahmemetadaten können Ereignisse hinzufügen. Prüfen Sie die Historie jedes Laufs, die gespeicherte Versuchsrichtlinie und die ursprünglichen Fristen, statt das Wachstum allein aus Schleifendurchläufen abzuleiten. Genaue Beobachtungen und fehlgeschlagene Testaufzeichnungen stehen im [Qualifikationsnachweis](https://github.com/durable-workflow/durable-workflow.github.io/issues/283#issuecomment-6288504564).
