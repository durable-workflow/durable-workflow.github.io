---
sidebar_position: 2
---

import QuerySimulator from '@site/src/components/QuerySimulator';

# Abfragen {#queries}

Mit Abfragen können Sie Informationen über den aktuellen Workflow-Zustand
abrufen, ohne die Ausführung zu beeinflussen. Das hilft bei Überwachung und
Fehlersuche.

## Replay-sichere Abfragemethoden {#replay-safe-query-methods}

Abfragen spielen festgeschriebene Historie des aktuell ausgewählten Laufs
erneut ab und rufen dann die annotierte Methode am wiederhergestellten
Workflow-Objekt auf. Sie wenden angenommene, aber noch nicht angewendete Signal-
oder Update-Befehle nicht implizit an.

```php
use Workflow\QueryMethod;
use Workflow\V2\Workflow;
use function Workflow\V2\await;

final class ApprovalWorkflow extends Workflow
{
    private string $stage = 'booting';

    public function handle(): void
    {
        $this->stage = 'waiting-for-approval';

        await('approved-by');

        $this->stage = 'approved';
    }

    #[QueryMethod('current-stage')]
    public function currentStage(): string
    {
        return $this->stage;
    }

    #[QueryMethod('starts-with')]
    public function startsWith(string $prefix): bool
    {
        return str_starts_with($this->stage, $prefix);
    }
}
```

Adressieren Sie den aktuellen Lauf über die öffentliche Instanz-ID:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$workflow->currentStage(); // "waiting-for-approval"
$workflow->query('starts-with', 'waiting'); // true
$workflow->queryWithArguments('starts-with', ['prefix' => 'waiting']); // true
```

Wenn Sie einen historischen oder ausgewählten Lauf explizit festlegen möchten,
fragen Sie stattdessen über `loadRun($runId)` ab:

```php
$selectedRun = WorkflowStub::loadRun($runId);

$selectedRun->currentStage();
```

Abfrageverhalten:

- Abfragen sind Replay-sicher: Sie beobachten nur festgeschriebene Historie und verändern keinen Workflow-Zustand.
- Argumente werden an die annotierte Methode weitergereicht. Deklarieren Sie mit `#[QueryMethod('public-name')]` einen stabilen öffentlichen Namen, damit der Aufruf PHP-Methodenumbenennungen übersteht.
- `load($instanceId)` fragt den neuesten dauerhaften Lauf der Instanz ab. `loadRun($runId)` adressiert einen bestimmten Lauf, etwa für Abfragen vor Continue-as-new.
- Angenommene, aber noch nicht angewendete Signale und Updates sind in der Befehlshistorie sichtbar. Sie zählen erst zum angewendeten Zustand, wenn der Worker `SignalApplied` / `UpdateApplied` aufzeichnet.

Deklarieren Sie eine Workflow-Abfragemethode mit der Annotation `QueryMethod`.
Das optionale Zeichenfolgenargument legt einen dauerhaften öffentlichen
Abfragenamen fest, der PHP-Methodenumbenennungen übersteht:

```php
use Workflow\QueryMethod;
use Workflow\V2\Workflow;

final class MyWorkflow extends Workflow
{
    private bool $ready = false;

    #[QueryMethod('is-ready')]
    public function getReady(): bool
    {
        return $this->ready;
    }
}
```

Rufen Sie zum Abfragen die Methode an der Workflow-Instanz auf. Sie gibt die
Daten aus dem Workflow zurück.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$ready = $workflow->getReady();
$sameReady = $workflow->query('is-ready');
```

Verwenden Sie `queryWithArguments()`, wenn Ihr Aufrufer bereits eine positionale
Liste oder eine Zuordnung benannter Parameter hat:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$workflow->queryWithArguments('starts-with', [
    'prefix' => 'wait',
]);
```

Waterline verwendet die Abfragevertragsoberfläche des ausgewählten Laufs.
Das Dashboard zeigt `declared_query_targets[*]` neben Signalen und Updates,
ermöglicht die Abfrageausführung aber nur bei `can_query = true`. Die
Betreiberabfrage für den ausgewählten oder aktuellen Lauf sendet JSON-
`arguments` per POST an
`/waterline/api/instances/{instanceId}/queries/{query}` oder
`/waterline/api/instances/{instanceId}/runs/{runId}/queries/{query}`.
Die Ausführung erfordert weiterhin eine ladbare Workflow-Definition, weil der
ausgewählte Lauf vor Aufruf der Abfragemethode erneut abgespielt werden muss.
Existieren dauerhafte Abfrageziele, aber die Definition ist nicht verfügbar,
melden die Laufdetails `can_query = false` mit
`query_blocked_reason = workflow_definition_unavailable`. Abfrage-POSTs geben
HTTP `409 Conflict` mit `blocked_reason = workflow_definition_unavailable`
zurück. Hat der Lauf nur einen unvollständigen Snapshot, den der aktuelle Build
nicht mehr vervollständigen kann, melden die Details
`declared_contract_source = unavailable`. Erhaltene Abfrageziele bleiben als
Diagnosemetadaten sichtbar, benannte Abfrageargumente werden aber weiterhin mit
`422` abgelehnt, bis ein kompatibler Build den fehlenden Vertrag speichert.

Die öffentliche Webhook-Brücke stellt dieselbe Replay-sichere
Abfrageoberfläche außerhalb von Waterline bereit:

```text
POST /webhooks/instances/{instanceId}/queries/{query}
POST /webhooks/instances/{instanceId}/runs/{runId}/queries/{query}
```

Diese Webhook-Routen akzeptieren dasselbe JSON-Feld `arguments` wie Waterline,
geben bei Erfolg ein typisiertes JSON-`result` zurück und verwenden dieselbe
Fehlerform für ungültige Argumente (`422` mit `validation_errors`) und
Replay-Blockaden (`409` mit `blocked_reason`). Solange die aktuelle
Workflow-Definition ladbar ist, können Aufrufer die Abfrage entweder über ihr
dauerhaftes Ziel `#[QueryMethod('public-name')]` oder den zugrunde liegenden
PHP-Methodennamen adressieren. Erfolgreiche HTTP-Antworten normalisieren
`query_name` zurück auf das dauerhafte öffentliche Ziel, damit externe Aufrufer
sich nicht auf Details der Methodenumbenennung festlegen.

<QuerySimulator />

**Wichtig:** Anders als Signale bringt eine Abfrage die Workflow-Ausführung
nicht voran.
