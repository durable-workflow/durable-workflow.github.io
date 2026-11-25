---
sidebar_position: 1
---

# Konfiguration veröffentlichen {#publishing-config}

Dieser Befehl erstellt eine Konfigurationsdatei `workflows.php` im Ordner
`config`.

```bash
php artisan vendor:publish --provider="Workflow\Providers\WorkflowServiceProvider" --tag="config"
```

## Lease eines Workflow-Tasks (v2) {#workflow-task-lease-v2}

Konfigurieren Sie die eingebettete Workflow-Task-Lease mit einer positiven ganzen Anzahl von Sekunden:

```env
DW_V2_WORKFLOW_TASK_LEASE_SECONDS=300
```

Dies entspricht `workflows.v2.workflow_task_lease_seconds` in `config/workflows.php`; der Standardwert ist `300`. Ansprüche und Task-Erneuerungen lesen die wirksame Konfiguration. Null deaktiviert die Lease nicht. Aktualisieren Sie nach Änderungen an der Bereitstellungskonfiguration den Konfigurationscache und starten Sie langlebige Worker neu.

Server verwendet stattdessen `DW_WORKFLOW_TASK_TIMEOUT` und überträgt diesen Wert auf die Paketeinstellung. Diese Wiederherstellungs-Lease ist von Aktivitäts- und Workflow-Fristen getrennt. Siehe [Workflow-Task-Lease](../features/timeouts.md#workflow-task-lease).

## Workflow-Ordner ändern {#changing-workflows-folder}

Standardmäßig schreiben die `make`-Befehle in den Ordner `app/Workflows`.

```php
php artisan make:workflow MyWorkflow
php artisan make:activity MyActivity
```

Sie können dies über die Einstellung `workflows_folder` ändern.

```php
'workflows_folder' => 'Workflows',
```

## Eigene Modelle verwenden (Legacy v1) {#using-custom-models-legacy-v1}

:::note Altbestand

Diese `stored_workflow_*`-Schlüssel konfigurieren die v1-Klassen
`Workflow\Models\StoredWorkflow*`. Workflow v2 verwendet die folgenden
Überschreibungen dauerhafter Modelle: `instance_model`, `run_model`,
`task_model` usw. Behalten Sie die v1-Schlüssel nur bei, wenn während der
Migration noch v1-Workflows laufen.

:::

In der veröffentlichten Konfigurationsdatei `workflows.php` können Sie die
v1-Modellklassen auf Ihre eigenen Unterklassen ändern.

```php
'stored_workflow_model' => App\Models\StoredWorkflow::class,

'stored_workflow_exception_model' => App\Models\StoredWorkflowException::class,

'stored_workflow_log_model' => App\Models\StoredWorkflowLog::class,

'stored_workflow_signal_model' => App\Models\StoredWorkflowSignal::class,

'stored_workflow_timer_model' => App\Models\StoredWorkflowTimer::class,
```

## Modellüberschreibungen verwenden (v2) {#using-model-overrides-v2}

Die Laufzeit stellt außerdem Modellüberschreibungen für die dauerhaften
Instanz-, Ausführungs-, Aufgaben-, Verlaufs- und Projektionstabellen bereit:

```php
'v2' => [
    'instance_model' => App\Models\WorkflowInstance::class,
    'run_model' => App\Models\WorkflowRun::class,
    'task_model' => App\Models\WorkflowTask::class,
    'history_event_model' => App\Models\WorkflowHistoryEvent::class,
    'run_summary_model' => App\Models\WorkflowRunSummary::class,
    'run_wait_model' => App\Models\WorkflowRunWait::class,
    'run_timeline_entry_model' => App\Models\WorkflowTimelineEntry::class,
    'run_timer_entry_model' => App\Models\WorkflowRunTimerEntry::class,
    'run_lineage_entry_model' => App\Models\WorkflowRunLineageEntry::class,
],
```

Diese Überschreibungen sind nicht auf Lesezugriffe oder den Neuaufbau von
Projektionen beschränkt. `WorkflowStub::make()`, `load()`, `loadSelection()`,
Instanzreservierung, Ausführungsauswahl und Workflow-Aufgabenausführung
verwenden die konfigurierten Werte für `instance_model`, `run_model` und
`task_model`. Auch Waterline-Details und Verlaufsexport lesen über dieselben
konfigurierten Klassen. Eine Überschreibung auf Anwendungsebene steuert damit
sowohl den Kernlaufzeitpfad als auch die Lesezugriffe für Betreiber.

Halten Sie eigene Unterklassen mit den eingebauten Modellen schemakompatibel.
Wenn eine Unterklasse auch Tabellennamen oder andere Eloquent-Konventionen
ändert, die die Paketmodelle normalerweise ableiten, überschreiben Sie dort
auch die betroffenen Beziehungen. So bleiben `currentRun()`, `runs()` und
ähnliche Zugriffe mit Ihrem eigenen Schema abgestimmt.

Die [Anpassungsmatrix](./customization-matrix.md) beschreibt den festgelegten
v2-Unterstützungsvertrag: welche Überschreibungen als geerbte Unterklassen sicher
sind, welche explizite Beziehungsüberschreibungen benötigen und wie Serializer,
Repository, Zustandsprüfungen, Import, Migration und Schreibzugriffe
zusammenpassen.

## Payload-Codec {#payload-codec}

v2 verwendet `avro` für neue Workflow-Payloads:

```php
'serializer' => 'avro',
```

- **`avro`** (Standard, für neue v2-Workflows erforderlich): binäre Apache-Avro-Kodierung. Sie ist bei Übertragung und Speicherung kompakt und kodiert/dekodiert große Payloads schneller als der ältere PHP-Serializer.

Wenn eine veröffentlichte v1-Konfiguration noch `serializer` setzt, liest die
finale v2 den Wert weiterhin für die Diagnose `workflow:v2:doctor`. Neue
v2-Payloads verwenden trotzdem Avro.

### Legacy-Codecs (nur für die v1-Migration) {#legacy-codecs-v1-migration-only}

Zum Lesen von v1-Verläufen während der Migration sind noch zwei reine
PHP-Codecs verfügbar:

- `workflow-serializer-y`: PHP `SerializableClosure` mit Byte-Escape-Kodierung (v1-Standard).
- `workflow-serializer-base64`: PHP `SerializableClosure` mit Base64-Kodierung.

Wenn `serializer` auf einen Legacy-Codec gesetzt ist, meldet
`php artisan workflow:v2:doctor` dies. Neue v2-Workflows verwenden weiterhin
Avro. Behalten Sie einen Legacy-Codec nur bei, während Sie v1-Ausführungen
abschließen oder importieren, die PHP-native Payload-Dekodierung benötigen.

Der interne v1-Import-/Abschlussleser erkennt ältere vollqualifizierte
Klassennamen, etwa `Workflow\Serializers\Y::class`. Diese sind keine
öffentlichen v2-Codec-Aliase und können von neuen v2-Ausführungen oder SDKs
nicht ausgewählt werden.

## Kompatibilitätsmarker {#compatibility-markers}

Die Laufzeit kann jede neue Ausführung mit einem Kompatibilitätsmarker versehen.
Worker können angeben, welche Marker sie sicher ausführen können. Diese
Laufzeitgrenze hält langlebige Ausführungen bei geplanten Worker-Build-Rollouts
auf kompatiblen Builds.

Setzen Sie den Marker für neue Ausführungen auf dem aktuellen Build:

```env
DW_V2_CURRENT_COMPATIBILITY=build-2026-04
```

Optional kann ein Worker während eines Rollouts mehrere Marker akzeptieren:

```env
DW_V2_SUPPORTED_COMPATIBILITIES=build-2026-04,build-2026-03
```

Stellen Sie ein, wie lange ein Worker-Heartbeat-Snapshot in der
datenbankgestützten Flottenansicht sichtbar bleibt:

```env
DW_V2_COMPATIBILITY_HEARTBEAT_TTL=30
```

Beschränken Sie diese Flottenansicht bei Bedarf auf einen Anwendungs- oder
Bereitstellungs-Namespace, wenn mehrere Anwendungen dieselbe
Workflow-Datenbank verwenden:

```env
DW_V2_COMPATIBILITY_NAMESPACE=sample-app
```

Die veröffentlichte Konfiguration `workflows.php` ordnet diese Werte hier zu:

```php
'v2' => [
    'compatibility' => [
        'current' => env('DW_V2_CURRENT_COMPATIBILITY'),
        'supported' => env('DW_V2_SUPPORTED_COMPATIBILITIES'),
        'namespace' => env('DW_V2_COMPATIBILITY_NAMESPACE'),
        'heartbeat_ttl_seconds' => (int) env('DW_V2_COMPATIBILITY_HEARTBEAT_TTL', 30),
    ],
],
```

Fehlt `supported`, akzeptieren Worker standardmäßig nur den Marker `current`.
Ältere Aufgaben- und Ausführungszusammenfassungszeilen, die vor Einführung von
Kompatibilitätsmarkern auf Aufgabenebene entstanden sind, erhalten den Marker
ihrer Ausführung bei der Migration und bei Bedarf erneut beim Übernehmen oder
Wiederherstellen zur Laufzeit. Aufgaben und Ausführungen, die tatsächlich
nirgends einen Marker haben, können weiterhin von jedem Worker übernommen
werden.

Der Fallback von `getVersion()` bevorzugt den beim Start gespeicherten
`workflow_definition_fingerprint` der Ausführung, wenn ein Replay einen neu
eingeführten Verzweigungspunkt erreicht, für den noch kein typisiertes Ereignis
`VersionMarkerRecorded` existiert. So kann eine Ausführung mit gleicher
Kompatibilität den Zweig `DEFAULT_VERSION` beibehalten, wenn sie eindeutig mit
einer älteren Workflow-Definition gestartet wurde. Ältere Ausführungen, deren
`WorkflowStarted`-Verlauf vor dem Fingerprint-Snapshot liegt, greifen weiter auf
den Start-Kompatibilitätsmarker und Prüfungen belegter Sequenzen zurück.
Wechseln Sie daher `DW_V2_CURRENT_COMPATIBILITY` weiter für
Bereitstellungswellen mit neuem versioniertem Workflow-Code und listen Sie
vorübergehend den alten und neuen Marker in `DW_V2_SUPPORTED_COMPATIBILITIES`,
während die ältere Worker-Kohorte ihre Arbeit abschließt.

Jeder Queue-Worker zeichnet außerdem während `Looping` und der
Aufgabenverarbeitung einen datenbankgestützten Kompatibilitäts-Heartbeat-Snapshot
auf. Waterline und die Detailhelfer zeigen sowohl die Sicht des lokalen Builds
(`compatibility_supported`, `compatibility_reason`) als auch die Flottensicht
(`compatibility_namespace`, `compatibility_supported_in_fleet`,
`compatibility_fleet_reason`, `compatibility_fleet`). Ist
`DW_V2_COMPATIBILITY_NAMESPACE` gesetzt, müssen datenbankgestützte
Heartbeat-Zeilen diesem Namespace entsprechen. Jeder Datenbank-Snapshot meldet
seinen eigenen `namespace` zusammen mit `worker_id`, Queue-Bereich,
unterstützten Markern und `source = database`. Bei einem rollierenden Upgrade
liest diese Flottenansicht auch das ältere Cache-Heartbeat-Format von Workern,
die noch nicht mit der neuen Snapshot-Tabelle neu gestartet wurden. Diese
älteren Cache-Zeilen bleiben auch bei konfiguriertem Namespace als
Rollout-Fallback sichtbar, melden aber `namespace = null`, bis die älteren
Worker auf dem neuen Snapshot-Pfad mit Namespace neu starten. Strikte
Namespace-Isolation ist also erst vollständig, nachdem jeder Worker auf dem
datenbankgestützten Heartbeat-Pfad neu gestartet wurde. Wiederherstellung auf
Transportebene, etwa erneute Zustellung einer überfälligen oder Neuerstellung
einer fehlenden Aufgabe, hängt nicht mehr davon ab, ob der prüfende Worker die
Aufgabe ausführen kann. Erst die spätere Übernahme unterliegt weiter der
Kompatibilitätsgrenze.

Wenn bereits eine offene Aufgabe existiert, aber weder der aktuelle Build noch
ein aktiver Worker-Heartbeat-Snapshot ihren Marker anbietet, bleibt die
Ausführung als auf einen kompatiblen Worker wartend sichtbar. Sie zeigt auf
diesem Build keinen falschen Zustand `repair_needed`.

## Verlaufsbudgets {#history-budgets}

Waterline meldet über die Ausführungszusammenfassungsprojektion, wie groß der
typisierte Verlauf einer ausgewählten Ausführung geworden ist. Diese
Schwellenwerte steuern, wann die Projektion `continue_as_new_recommended` setzt:

```env
DW_V2_CONTINUE_AS_NEW_EVENT_THRESHOLD=10000
DW_V2_CONTINUE_AS_NEW_SIZE_BYTES_THRESHOLD=5242880
```

Die veröffentlichte Konfiguration `workflows.php` ordnet diese Werte hier zu:

```php
'v2' => [
    'history_budget' => [
        'continue_as_new_event_threshold' => (int) env('DW_V2_CONTINUE_AS_NEW_EVENT_THRESHOLD', 10000),
        'continue_as_new_size_bytes_threshold' => (int) env('DW_V2_CONTINUE_AS_NEW_SIZE_BYTES_THRESHOLD', 5242880),
    ],
],
```

Setzen Sie einen Schwellenwert auf `0`, um diese Seite der Empfehlung zu
deaktivieren. Das Kennzeichen ist ein Hinweis. Planen Sie damit
`continueAsNew()`-Grenzen vor einem Anstieg der Replay-Kosten, ohne das
Laufzeitverhalten der ausgewählten Ausführung zu ändern.

## Wartepolitik für Updates {#update-wait-policy}

Auf Abschluss wartende Update-APIs wie `attemptUpdate()`, die
Webhook-Update-Routen und Waterlines Update-Steuerelemente warten nur bis zu
einem begrenzten Budget. Danach geben sie den weiterhin akzeptierten
Update-Lebenszyklus zurück. Konfigurieren Sie dieses Standardbudget hier:

```env
DW_V2_UPDATE_WAIT_COMPLETION_TIMEOUT_SECONDS=10
DW_V2_UPDATE_WAIT_POLL_INTERVAL_MS=50
```

Die veröffentlichte Konfiguration `workflows.php` ordnet diese Werte hier zu:

```php
'v2' => [
    'update_wait' => [
        'completion_timeout_seconds' => (int) env('DW_V2_UPDATE_WAIT_COMPLETION_TIMEOUT_SECONDS', 10),
        'poll_interval_milliseconds' => (int) env('DW_V2_UPDATE_WAIT_POLL_INTERVAL_MS', 50),
    ],
],
```

`completion_timeout_seconds` steuert, wie lange `attemptUpdate*` und
HTTP-Abschlusswarteoperationen versuchen, ein vom Worker angewendetes Ergebnis
zu erhalten, bevor sie einen akzeptierten Lebenszyklus zurückgeben, statt
unbegrenzt zu blockieren. `poll_interval_milliseconds` bestimmt nur, wie häufig
der Aufrufer während des Wartens diese dauerhafte Update-Zeile prüft. Es ändert
weder die Ausführungsreihenfolge im Worker noch das Replay-Verhalten.
Waterlines Betriebsmetriken zeigen die aktiven `update_wait`-Werte neben der
Reparaturrichtlinie an, damit Betreiber die wirksamen Standardwerte ohne Öffnen
von Konfigurationsdateien sehen.

## Schwärzung beim Verlaufsexport {#history-export-redaction}

Verlaufsexporte enthalten absichtlich gespeicherte Workflow-, Befehls-,
Aktivitäts-, Update-, Aufgaben- und Fehlerdaten, weil Replay-Diagnose und
Archivübergabe dauerhafte Fakten benötigen. Wenn diese Artefakte eine geschützte
Umgebung verlassen können, konfigurieren Sie eine Schwärzungsfunktion, bevor
Sie den Export-Endpunkt oder die CLI-Ausgabe breit zugänglich machen.

Erstellen Sie eine Schwärzungsfunktion, die
`Workflow\V2\Contracts\HistoryExportRedactor` implementiert:

```php
namespace App\Support;

use Workflow\V2\Contracts\HistoryExportRedactor;

final class WorkflowHistoryExportRedactor implements HistoryExportRedactor
{
    public function redact(mixed $value, array $context): mixed
    {
        return [
            'redacted' => true,
            'path' => $context['path'],
        ];
    }
}
```

Registrieren Sie sie anschließend in `config/workflows.php`:

```php
'v2' => [
    'history_export' => [
        'redactor' => App\Support\WorkflowHistoryExportRedactor::class,
        'signing_key' => env('DW_V2_HISTORY_EXPORT_SIGNING_KEY'),
        'signing_key_id' => env('DW_V2_HISTORY_EXPORT_SIGNING_KEY_ID'),
    ],
],
```

Die Schwärzungsfunktion erhält den aktuellen Wert sowie Kontext wie `path`,
`category`, `workflow_instance_id`, `workflow_run_id` und `workflow_type`.
Der Export ruft sie für Workflow-Argument-/Ausgabe-Payloads,
Verlaufsereignis-Payloads, Befehls-Payload/-Kontext, Update-Payloads,
Aufgaben-Payloads, Aktivitäts-Payloads und Fehlerdiagnosen zu Meldung, Datei und
Stacktrace auf. Das resultierende Paket enthält `redaction.applied`,
`redaction.policy` und `redaction.paths`, damit nachgelagerte Werkzeuge erkennen,
welche Richtlinie das Artefakt geprägt hat.

Jeder Export enthält außerdem einen nach der Schwärzung berechneten
`integrity`-Block. Die Prüfsumme verwendet
`canonicalization = json-recursive-ksort-v1` und `checksum_algorithm = sha256`.
Wenn `signing_key` konfiguriert ist, wird derselbe kanonische Payload mit
`signature_algorithm = hmac-sha256` signiert und die optionale `signing_key_id`
als `key_id` ausgegeben. Halten Sie den Signaturschlüssel außerhalb des
exportierten Artefakts und wechseln Sie die Schlüssel-ID, wenn nachgelagerte
Prüfer Schlüssel unterscheiden müssen.

## Worker-Interceptors {#worker-interceptors}

Worker-Interceptors sind ab dem nächsten Release des Workflow-Pakets verfügbar.
Das eingebettete Durable Workflow führt geordnete Worker-Interceptors um die
Workflow-Tasks, Aktivitäten und Abfragen aus, die es in den Prozessen Ihrer
Anwendung ausführt. Verwenden Sie sie für Audit-Logging, Metrik-Tags,
Mandantenkontext oder Tracing, das Sie einmal schreiben möchten statt in jedem
Workflow und jeder Aktivität. Die Form der Hooks entspricht den Interceptors des
[Python](../polyglot/python.md#worker-interceptors)-,
[PHP](../polyglot/php.md#worker-interceptors)- und
[Rust](../polyglot/rust.md#worker-interceptors)-SDK.

Listen Sie Interceptor-Klassen unter `workflows.v2.interceptors` in
`config/workflows.php` auf. Sie werden aus dem Laravel-Container aufgelöst, daher
funktioniert Konstruktorinjektion, und sie laufen in der aufgeführten
Reihenfolge; der erste ist der äußerste Wrapper.

```php
'v2' => [
    // ...
    'interceptors' => [
        App\Workflows\AuditInterceptor::class,
    ],
],
```

Jeder Interceptor implementiert `Workflow\V2\Interceptors\WorkerInterceptor`.
Erweitern Sie `Workflow\V2\Interceptors\PassthroughWorkerInterceptor`, um nur die
benötigten Hooks zu implementieren, und rufen Sie `$next($context)` auf, um die
Kette fortzusetzen. Dieser Audit-Interceptor protokolliert jeden
festgeschriebenen Workflow-Task und jeden Aktivitätsversuch:

```php
namespace App\Workflows;

use Illuminate\Support\Facades\DB;
use Psr\Log\LoggerInterface;
use Workflow\V2\Interceptors\ActivityInterceptorContext;
use Workflow\V2\Interceptors\PassthroughWorkerInterceptor;
use Workflow\V2\Interceptors\WorkflowTaskInterceptorContext;
use Workflow\V2\Interceptors\WorkflowTaskOutcome;

final class AuditInterceptor extends PassthroughWorkerInterceptor
{
    public function __construct(private readonly LoggerInterface $audit)
    {
    }

    public function executeWorkflowTask(WorkflowTaskInterceptorContext $context, callable $next): WorkflowTaskOutcome
    {
        $outcome = $next($context);
        // The task commits after the chain returns; log only once it has.
        DB::afterCommit(fn () => $this->audit->info('workflow task', [
            'workflow_id' => $context->workflowId,
            'run_id' => $context->runId,
            'attempt' => $context->workflowTaskAttempt,
            'recorded' => $outcome->historyEventTypes,
        ]));

        return $outcome;
    }

    public function executeActivity(ActivityInterceptorContext $context, callable $next): mixed
    {
        $this->audit->info('activity started', [
            'activity_type' => $context->activityType,
            'attempt' => $context->attemptNumber,
            'workflow_id' => $context->workflowId,
        ]);
        try {
            return $next($context);
        } finally {
            $this->audit->info('activity finished', ['activity_type' => $context->activityType]);
        }
    }
}
```

Der Container erstellt die konfigurierten Interceptors für jeden Task. Binden Sie
einen als Singleton, wenn er zwischen Tasks Zustand behalten muss.

| Hook | Kontext | Rückgabe von `$next` |
| --- | --- | --- |
| `executeWorkflowTask($context, $next)` | `workerId`, `connection`, `taskQueue`, `namespace`, `task`, `taskId`, `workflowType`, `workflowId`, `runId`, `workflowTaskAttempt`, `historyLength`, `replaying` | `WorkflowTaskOutcome` mit `historyEventTypes`, `runStatus`, `nextTaskId` |
| `executeActivity($context, $next)` | `workerId`, `connection`, `taskQueue`, `namespace`, `task`, `activityType`, `activityClass`, `arguments`, `attemptNumber`, `taskId`, `activityExecutionId`, `activityAttemptId`, `workflowId`, `runId`, `local`, `activity` | das Aktivitätsergebnis |
| `executeQueryTask($context, $next)` | `workerId` (immer null), `connection`, `taskQueue`, `namespace`, `task`, `queryName`, `workflowType`, `workflowId`, `runId`, `arguments` | das Abfrageergebnis |

`task` ist ein Array-Snapshot der beanspruchten Task-Zeile, niemals das Modell
selbst. `workerId` identifiziert den Queue-Worker-Prozess anhand von Host und
Prozess-ID. Abfragen laufen im aufrufenden Prozess, daher ist ihre `workerId`
null.

Interceptors für Workflow-Tasks können nicht ändern, was ein Workflow aufzeichnet:

- `executeWorkflowTask` umschließt den Workflow-Task innerhalb seiner
  Datenbanktransaktion, einmal pro Task-Versuch. `replaying` ist `true`, wenn
  frühere Workflow-Tasks bereits Befehle für den Lauf aufgezeichnet haben. Es ist
  kein Deduplizierungsschlüssel: `historyEventTypes` listet nur die Ereignisse
  auf, die dieser Task angehängt hat.
- Seiteneffekte von Hooks laufen, bevor der Task festgeschrieben wird, und können
  sich wiederholen, wenn ein Versuch wiederholt wird; verschieben Sie sie daher
  mit `DB::afterCommit()` oder verknüpfen Sie sie mit `taskId` und
  `workflowTaskAttempt` als Schlüssel.
- Die Engine schreibt die Historie fest, die der Workflow-Code erzeugt hat. Das
  Ergebnis ist eine schreibgeschützte Sicht; die Rückgabe eines anderen
  Ergebnisses oder die Übergabe eines anderen Kontexts an `$next` ändert nichts.
- Ein Fehler aus dem Workflow-Code erreicht die Engine unverändert, selbst wenn
  ein Interceptor ihn abfängt und normal zurückkehrt.
- Wenn ein Interceptor eine Ausnahme aus der Kette heraus auslöst, `$next`
  überspringt oder mehr als einmal aufruft, wird die Transaktion des Tasks
  zurückgerollt, sodass nichts aufgezeichnet wird. Der Task wird mit
  `WorkflowTaskInterceptorFailed` als letztem Fehler freigegeben und nach dem
  üblichen Reparatur-Backoff wiederholt. Ein äußerer Interceptor kann eine
  Ausnahme, die ein innerer Interceptor nach `$next` ausgelöst hat, dennoch
  abfangen und den Task festschreiben lassen; ein übersprungenes oder
  wiederholtes `$next` lässt den Task immer fehlschlagen.
- Hooks laufen, während die Lauf- und Task-Zeilen gesperrt sind, halten Sie sie
  daher kurz. Sie dürfen die umgebende Transaktion weder festschreiben noch
  zurückrollen und keine Befehle wie Signale an den Lauf senden, den sie
  umschließen; eine Änderung am aufgezeichneten Zustand des Laufs lässt den Task
  bei jedem Versuch fehlschlagen.
- Lokale Aktivitäten laufen innerhalb des Workflow-Tasks, daher führt ein Hook,
  der nach `$next` wiederholt fehlschlägt, diese lokalen Aktivitäten bei jeder
  Wiederholung erneut aus.

Aktivitäts- und Abfrage-Interceptors dürfen Argumente mit
`$context->withArguments(...)` ändern und den Rückgabewert verändern, weil ein
Aktivitätsergebnis einmal aufgezeichnet wird und eine Abfrage nichts aufzeichnet.
Umgeschriebene Abfrageargumente werden erneut gegen den Abfragevertrag validiert.
Aktivitätsausnahmen durchlaufen jeden Interceptor, sofern keiner sie behandelt,
und unterliegen dann der normalen Wiederholungsrichtlinie der Aktivität.
Aktivitäts-Interceptors umschließen Aktivitäten aus der Queue und lokale
Aktivitäten; `local` unterscheidet sie. Gemockte Aktivitäten in
`WorkflowStub::fake()` führen keine Interceptors aus.

Wenn [eingebettetes Tracing](../monitoring.md#embedded-tracing) aktiviert ist,
bleiben die eingebauten Workflow- und Aktivitäts-Spans am weitesten außen, sodass
Interceptors innerhalb des aktiven Spans laufen und Attribute oder Kind-Spans
hinzufügen können.

Interceptors umschließen die Queue-Jobs, lokalen Aktivitäten und Abfragen, die
dieses Paket ausführt. Tasks, die über die Worker-Task-Bridges an externe
SDK-Worker übergeben werden, laufen unter den eigenen Interceptors dieses SDK. Die
`execute`-Route der Worker-Bridge, die einen beanspruchten Workflow-Task für einen
Bridge-Aufrufer im Prozess ausführt, führt keine Workflow-Task-Interceptors aus.
Ein Eintrag in `workflows.v2.interceptors`, der nicht aufgelöst werden kann, lässt
jeden Pfad auf eigene Weise fehlschlagen: Ein Workflow-Task aus der Queue wird
freigegeben und wiederholt, ein Aktivitätsversuch schlägt gemäß seiner
Wiederholungsrichtlinie fehl, und eine Abfrage löst eine Ausnahme bei ihrem
Aufrufer aus. Prüfen Sie die Liste beim Deployment. Der
[Leitfaden zu eingebetteten Interceptors](https://github.com/durable-workflow/workflow/blob/main/docs/worker-interceptors.md)
enthält den vollständigen Vertrag.
