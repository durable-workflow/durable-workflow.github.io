---
title: Externen Status abfragen
description: Begrenztes Polling oder Rückrufsignale wählen, dauerhaft im Workflow warten und die Kosten im Verlauf berücksichtigen.
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
| Auftrag übermitteln und zurückkehren, dann ein Rückrufsignal empfangen | Gibt den Aktivitätsslot nach der Übermittlung frei; der Workflow wartet dauerhaft | Übermittlung, Signalannahme/-anwendung und Warten mit Frist ergänzen den Verlauf. Erfordert authentifizierte Zuordnung und Duplikatbehandlung in der Anwendung. |

Verwenden Sie kurze, sicher wiederholbare Prüfungen. Ein in einer externen Anfrage blockierter Callback wird nicht allein dadurch reaktionsfähig, dass sein Workflow einen Timer oder eine Abbruchrichtlinie besitzt.

## Abschluss per Rückruf und Signal {#callback-and-signal-completion}

Kann das externe System Sie benachrichtigen, übermitteln Sie den Auftrag in einer kurzen Aktivität und geben die Bestätigung zurück. Der **Workflow** wartet mit endlicher Frist auf ein deklariertes Signal oder eine bei der Wiedergabe rekonstruierte Bedingung. Halten Sie bis zum Abschluss weder eine Aktivität noch eine HTTP-Antwort oder SSE-Verbindung offen.

Wählen Sie vor dem Start die Instanz-ID und speichern Sie die Zuordnung zwischen authentifiziertem externem Vorgang, Namensraum, **öffentlicher Workflow-Instanz-ID** und deklariertem Signalnamen. Sobald der Start festgeschrieben ist, kann die Aktivität den Auftrag übermitteln. Eine Lauf-ID bezeichnet nur einen Lauf und ist über continue-as-new hinweg keine stabile Rückrufadresse. Authentifizieren Sie den Rückruf und prüfen Sie vor der Weiterleitung die gespeicherte Zuordnung; übernehmen Sie keine Routing- oder Identitätsfelder aus beliebigen Anfragen.

### Eingebetteter PHP-Rückruf {#embedded-php-callback}

Konfigurieren Sie `services.jobs.url` für den Anbieter und `services.jobs.callback_url` für den authentifizierten Adapter Ihrer Anwendung. Passen Sie die gezeigte `/jobs`-Anfrage an die Anbieter-API an: Sie muss die Übermittlung schnell bestätigen und `job_id` zurückgeben. Implementieren Sie die anbieterspezifische Authentifizierung und begrenzen Sie die Anfragedauer. Der Vorgangsschlüssel dient nur dann zur Deduplizierung, wenn der Anbieter ihn tatsächlich berücksichtigt.

```php
use Illuminate\Support\Facades\Http;
use Workflow\V2\Activity;
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Support\ActivityOptions;
use Workflow\V2\Workflow;
use function Workflow\V2\activity;
use function Workflow\V2\await;

#[Type('external.submit')]
final class SubmitExternalJob extends Activity
{
    public function handle(string $workflowId, string $operationId): array
    {
        return Http::connectTimeout(2)->timeout(5)
            ->withHeaders(['Idempotency-Key' => $operationId])
            ->post(config('services.jobs.url').'/jobs', [
                'workflow_id' => $workflowId,
                'operation_id' => $operationId,
                'signal' => 'job-completed',
                'callback_url' => config('services.jobs.callback_url'),
            ])->throw()->json();
    }
}

#[Type('external-completion')]
#[Signal('job-completed', [
    ['name' => 'operationId', 'type' => 'string'],
    ['name' => 'result', 'type' => 'array'],
])]
final class ExternalCompletion extends Workflow
{
    public function handle(string $operationId): array
    {
        $job = activity(SubmitExternalJob::class, new ActivityOptions(
            maxAttempts: 1, startToCloseTimeout: 10, scheduleToCloseTimeout: 15,
        ), $this->workflowId(), $operationId);

        $received = await('job-completed', timeout: 10);
        if ($received === null) {
            return ['status' => 'timed_out', 'job_id' => $job['job_id']];
        }
        if ($received[0] !== $operationId) {
            return ['status' => 'unexpected_operation'];
        }
        return ['status' => 'completed', 'result' => $received[1]];
    }
}
```

Starten Sie mit einer vom Aufrufer gewählten Instanz-ID und endlichen Lauf- und Ausführungszeitlimits. Registrieren Sie `ExternalCompletion` für [authentifizierte Webhooks](../features/webhooks.md); der Rückrufadapter kann geprüfte Eingaben an die instanzbezogene Signalroute weiterleiten:

```bash
curl -fsS -X POST "$APP_URL/webhooks/instances/external-job-42/signals/job-completed" \
  -H "Authorization: $WEBHOOK_TOKEN" -H 'Content-Type: application/json' \
  -d '{"arguments":["op-42",{"value":42}]}'
```

Dies ist das `arguments`-Format des eingebetteten Webhooks, nicht der Payload-Umschlag des Servers. Der Anbieter soll den authentifizierten Anwendungsadapter aufrufen und keine Serverzugangsdaten für Betreiber oder Worker erhalten.

### Python-Rückruf und Bedingung {#python-callback-and-condition}

Die folgende Aktivität führt nur die zeitlich begrenzte Übermittlung aus. Konfigurieren Sie `JOB_API_URL`, `JOB_CALLBACK_URL` und die Anbieterauthentifizierung in ihrer Umgebung. Registrieren Sie beide Definitionen im [Python-Worker](./python.md). Übergeben Sie die dem Aufrufer bekannte Workflow-Instanz-ID ausdrücklich; das Beispiel setzt keinen erfundenen ID-Zugriff über den Workflow-Kontext voraus.

```python
import os
import httpx
from durable_workflow import activity, workflow
from durable_workflow.workflow import ActivityRetryPolicy

@activity.defn(name="external.submit")
async def submit_external_job(workflow_id, operation_id):
    async with httpx.AsyncClient(timeout=5.0) as provider:
        response = await provider.post(
            os.environ["JOB_API_URL"] + "/jobs",
            headers={"Idempotency-Key": operation_id},
            json={"workflow_id": workflow_id, "operation_id": operation_id,
                  "signal": "job-completed",
                  "callback_url": os.environ["JOB_CALLBACK_URL"]},
        )
        response.raise_for_status()
        return response.json()

@workflow.defn(name="external-completion")
class ExternalCompletion:
    def __init__(self):
        self.results = {}

    @workflow.signal("job-completed")
    def completed(self, operation_id: str, result: dict):
        self.results.setdefault(operation_id, result)

    def run(self, ctx, workflow_id, operation_id):
        job = yield ctx.schedule_activity(
            "external.submit", [workflow_id, operation_id],
            retry_policy=ActivityRetryPolicy(max_attempts=1, backoff_seconds=[1]),
            start_to_close_timeout=10, schedule_to_close_timeout=15,
        )
        ready = yield ctx.wait_condition(
            lambda: operation_id in self.results,
            key="external.completed", timeout=10,
        )
        if not ready:
            return {"status": "timed_out", "job_id": job["job_id"]}
        return {"status": "completed", "result": self.results[operation_id]}
```

Wählen Sie die Instanz-ID und speichern Sie die Zuordnung von Vorgang zu Namensraum, Instanz und Signal **vor dem Startaufruf**. Die Aktivität kann unmittelbar nach dessen Festschreibung beginnen. Anschließend startet die Anwendung diese Instanz mit endlichen Zeitbudgets:

```python
handle = await client.start_workflow(
    workflow_type="external-completion", task_queue="external-jobs",
    workflow_id="external-job-42", input=["external-job-42", "op-42"],
    execution_timeout_seconds=60, run_timeout_seconds=30,
)
```

Nach der Authentifizierung des Anbieters und dem Auflösen der gespeicherten Vorgangszuordnung verwendet der Rückrufadapter einen Client im **gleichen Namensraum**:

```python
await client.signal_workflow(
    "external-job-42", "job-completed", args=["op-42", {"value": 42}],
)
```

Der Aufruf verwendet `POST /api/workflows/{workflowId}/signal/{signalName}` des Servers und den normalen Avro-Umschlag des SDKs. Ein erfolgreicher Signalaufruf bestätigt die Annahme, nicht die Verarbeitung durch den Workflow. Wenn eine Bestätigung wichtig ist, prüfen Sie das Workflow-Ergebnis oder den gespeicherten Signalstatus.

### Frühe Rückrufe, Fortsetzungen und verspätete Rückrufe {#early-continued-and-late-callbacks}

- Deklarieren Sie das Signal vor dem Laufstart. Ein vor seiner Warteoperation eintreffender Rückruf bleibt gespeichert und wird in dauerhafter Reihenfolge verarbeitet; Python rekonstruiert den Handlerzustand bei der Wiedergabe. Eine spätere Registrierung kann die Deklarationen eines alten Laufs nicht umschreiben.
- Instanzbezogene Rückrufe folgen continue-as-new; ausdrücklich laufbezogene Aufrufe bleiben an diesen Lauf gebunden. Auf kompatiblen Core-Laufzeiten ab 2.7.0 behalten geeignete empfangene Instanzsignale ihre ursprüngliche Identität und Reihenfolge beim Übergang. Den Zustand **bereits angewandter** Rückrufe müssen Sie bei weiterem Bedarf in die Fortsetzungsargumente übernehmen.
- Nach endgültigem Abschluss wird ein Rückruf ausdrücklich abgewiesen. Beim veröffentlichten Server liefert Python `SignalFailed.reason == "run_not_active"` mit Status409. Ein angenommenes, aber noch nicht angewandtes Signal kann stattdessen einen gespeicherten Ablehnungsstatus beim Abschluss erhalten; die frühere Annahmebestätigung bleibt bestehen. Siehe [Signalannahme und Abschluss](../features/signals.md#acceptance-and-closure).
- Die Wartefrist bricht den externen Auftrag nicht ab. Klären Sie sein Ergebnis oder fordern Sie die Stornierung über eine Aktivität an. Ein verspätetes Ergebnis kann eine Wiederherstellungsentscheidung der Anwendung erfordern; starten Sie nicht stillschweigend Ersatzarbeit.

### Doppelte Zustellung und Grenzen von Streaming {#duplicate-delivery-and-streaming-limits}

Anbieter wiederholen Rückrufe; auch nach der Signalannahme kann ein Netzwerkfehler auftreten. Speichern Sie den Vorgangs-/Ereignisschlüssel und die genaue beabsichtigte Aktion, deduplizieren Sie am Rückrufeingang und bei der fachlichen Verarbeitung und bewahren Sie ungeklärte Zustellungen zur Abstimmung auf. Der Python-Handler behält das erste Ergebnis je Vorgang in diesem Lauf; das garantiert weder laufübergreifende Deduplizierung noch einmalige Annahme. Markieren Sie eine ungewisse Weiterleitung nicht allein deshalb als verarbeitet, weil die Anfrage gesendet wurde. [Gemeinsames Issue #216](https://github.com/durable-workflow/.github/issues/216) behandelt weiterhin sichere Signalwiederholungen und dauerhafte Annahmeidentität. Ein Idempotenz-Header oder eine einzelne Aktivitätsausführung garantiert für sich keine einmaligen externen Effekte.

Starten Sie den Workflow, bevor dieses Muster Arbeit übermittelt. Im Service-Modus sind `start(use-existing)` und ein folgendes `signal` **zwei Operationen** mit einem möglichen Abschluss dazwischen; atomare Annahme bleibt Gegenstand von [Issue #222](https://github.com/durable-workflow/.github/issues/222). Eingebettetes `signalWithStart` ist eine separate atomare API. Die Debounce-Anfrage [Website #280](https://github.com/durable-workflow/durable-workflow.github.io/issues/280) wurde durch diese Produktanforderung ersetzt und nicht durch dieses Rückrufmuster erledigt.

Eine in einer Aktivität gehaltene HTTP-/SSE-Verbindung ist nicht dauerhaft: Worker- oder Prozessverlust beendet sie, sie belegt einen Aktivitätsslot, und erneutes Verbinden kann externe Ereignisse wiederholen oder verpassen. Übermittlung und Rückrufe ergänzen weiterhin Aktivitäts-, Signal- und Wartehistorie; das ist keine kostenlose oder unbegrenzte Ausführung. Nutzen Sie für dauerhafte **Workflow-Ausgaben** [Workflow Streams](./workflow-streams.md) mit ihrem gespeicherten Sequenz-/Cursor-Vertrag, statt eine Transportverbindung als Speicher zu behandeln.

Der PHP- und Python-Code wurde mit veröffentlichtem **Server 2.9.7 / Core 2.7.2** und normal installiertem **Python SDK 2.6.1** ausgeführt. Separate PostgreSQL-17.11-Kontrollen deckten frühe und bereits wartende Rückrufe, verspätete Ablehnung sowie continue-as-new mit Rückruf während der Abwesenheit des Python-Workers und anschließendem kaltem Leser ab. Eingebettete Kontrollen verwendeten die echte Webhook-Route. Das belegt dieses Muster, nicht alle Datenbanken, Anbieterauthentifizierung, geordnetes Herunterfahren oder die native Laufzeit. Der [Qualifikationsnachweis](https://github.com/durable-workflow/durable-workflow.github.io/issues/321#issuecomment-6292485315) hält erfolglose Originalversuche getrennt fest.

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
