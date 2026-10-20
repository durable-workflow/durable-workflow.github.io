---
sidebar_position: 6
---

# Workflow-ID {#workflow-id}

## Instanz-IDs und Lauf-IDs {#instance-ids-and-run-ids}

Ein dauerhafter Workflow hat zwei Kennungen mit unterschiedlichen Lebenszyklen:

- Die **Instanz-ID** (`id()`, `workflowId()`) ist die stabile öffentliche Referenz des Workflows. Sie wird beim ersten Start erzeugt oder vom Aufrufer vorgegeben und ändert sich während der gesamten Lebensdauer des Workflows nie, auch nicht über Continue-as-new-Ketten hinweg.
- Die **Lauf-ID** (`runId()`) identifiziert eine konkrete Ausführungsgeneration dieses Workflows. Sie wird bei jedem neuen Lauf neu vergeben, also beim ersten Start und bei jeder Fortsetzung als neuer Lauf.

Verwenden Sie die Instanz-ID als öffentliche, aufrufbare Referenz. Verwenden Sie
die Lauf-ID als Verweis auf eine bestimmte Generation für Untersuchung,
Fehlersuche oder Audit. Langlebige Aufrufer der Steuerungsebene sollten sie
nicht nachverfolgen müssen.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class);

$id = $workflow->id();

$workflow->start();

$runId = $workflow->runId();
```

Verwenden Sie die ID für die stabile öffentliche Referenz des Workflows.
Verwenden Sie die Lauf-ID, um eine konkrete Ausführung zu untersuchen.

## Lebenszyklus der Lauf-ID {#run-id-lifecycle}

Eine Lauf-ID identifiziert eine Ausführungsgeneration. Jede v2-Workflow-Generation
hat ihre eigene Lauf-ID. Eine einzelne Instanz-ID kann im Laufe der Zeit viele
Generationen umfassen:

- Ein neues `start()` erstellt den ersten Lauf und seine erste Lauf-ID.
- `continueAsNew(...)` schließt den aktuellen Lauf als `completed` / `continued` und startet unter derselben Instanz-ID einen neuen Lauf mit neuer Lauf-ID. Siehe [Als neuer Lauf fortsetzen](/docs/features/continue-as-new).

Da eine Lauf-ID zu einer Generation gehört, sollten Aufrufer für dauerhaftes
Verhalten über diese Übergänge hinweg über die Instanz-ID auflösen:

- Signale, Abfragen, Updates und Betreiberbefehle lösen immer den neuesten dauerhaften Lauf einer Instanz auf. Aufrufer müssen Lauf-IDs über Continue-as-new-Grenzen hinweg nicht nachverfolgen.
- Werkzeuge für Detailuntersuchungen, die eine bestimmte Generation festlegen, etwa Waterlines Laufdetailansicht, ein Historienexport oder ein Replay-Debugger, akzeptieren eine explizite Lauf-ID, um eine Ausführung isoliert zu untersuchen.

Die Lauf-ID steht innerhalb von Workflow-Code und Aktivitäten als `runId()`
bereit und in Historie, Projektionen und Exporten als Feld
`workflow_run_id` / `run_id`. Sie ist immer die Lauf-ID der Generation, zu der
das Ereignis oder die Zeile gehört. Erwarten Sie nicht, dass eine Lauf-ID aus
älteren Historienereignissen der aktuellen Lauf-ID derselben Instanz entspricht.

## Benutzerdefinierte Instanz-IDs {#user-defined-instance-ids}

Beim Starten eines Workflows können Sie optional die ID vorgeben.
Benutzerdefinierte IDs müssen URL-sichere Zeichenfolgen mit bis zu 191 Zeichen
sein und dürfen nur Buchstaben, Ziffern, `.`, `_`, `-` und `:` enthalten.

```php
$workflow = WorkflowStub::make(MyWorkflow::class, 'order-123');
```

Wenn Sie später auf den Workflow zugreifen möchten, können Sie ihn mit Ihrer
eigenen ID laden.

```php
$workflow = WorkflowStub::load('order-123');
```

### Eine vom Aufrufer vorgegebene ID wählen {#choosing-a-caller-supplied-id}

Wählen Sie eine ID, die einen Geschäftsvorgang konsistent identifiziert.
Wiederholungen desselben Starts sollten dieselbe ID verwenden. Erzeugen Sie für
einen anderen Vorgang eine neue ID. Fügen Sie ein Workflow-Typpräfix und bei
Bedarf eine undurchsichtige Mandantenreferenz hinzu, um Kollisionen zwischen
Anwendungen mit gemeinsamem Speicher zu vermeiden. Beispielsweise kombiniert
`order:tenant-7f2:01J9Z6K6Z2EPV5G0C3R8F4M9AN` diese Präfixe mit einer
kollisionsresistenten Kennung. Ein Mandantenpräfix ist eine Namenskonvention,
keine Autorisierungsgrenze. Konfigurieren Sie Namespace-Isolation separat.

Die ID überschreibt nicht die [Richtlinie für doppelte Starts](../configuration/options.md).
Standardmäßig wird ein doppelter Start abgelehnt. `ReturnExistingActive` kann
den vorhandenen aktiven Workflow zurückgeben, ohne einen weiteren Lauf zu
starten oder die ursprünglichen Argumente zu ersetzen. Die ID einer
abgeschlossenen Instanz bleibt reserviert. Ein anderer Workflow-Typ gibt diese
ID nicht wieder frei.

### IDs sind sichtbare Metadaten {#ids-are-visible-metadata}

Instanz-IDs erscheinen im Klartext in Waterline, URLs, CLI-Ausgaben, Protokollen,
Historienexporten und der Datenbank. Payload-Codecs einschließlich
Payload-Verschlüsselung schützen diese Kennungen nicht. Verwenden Sie
undurchsichtige Referenzen statt E-Mail-Adressen, Namen, Zugriffstoken oder
anderer personenbezogener oder geheimer Daten. Halten Sie sensible
Geschäftsdetails in Payload-Feldern, die durch die Datenverarbeitungsrichtlinie
Ihrer Anwendung geschützt sind. Eine nicht erratbare ID ersetzt keine
Autorisierung.

## IDs in Aktivitäten und Workflows abrufen {#accessing-ids-inside-activities-and-workflows}

Innerhalb einer Aktivität:

```php
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public function handle(): void
    {
        $id = $this->workflowId();
        $runId = $this->runId();
    }
}
```

Innerhalb eines Workflows liefert `$this->workflowId()` die Instanz-ID und
`$this->runId()` die ausgewählte Lauf-ID des gerade ausgeführten Laufs.
