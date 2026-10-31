---
sidebar_position: 4
---

# Datenbankverbindung {#database-connection}

Workflow verwendet standardmäßig die Laravel-Datenbankverbindung Ihrer Anwendung, sofern Sie keine andere Verbindung für den dauerhaften Speicher auswählen.

Um den Workflow-Speicher auf eine in `config/database.php` definierte Verbindung zu legen, setzen Sie deren Namen in der Umgebung:

```dotenv
DW_STORAGE_CONNECTION=workflows
```

Workflow-Modelle, Transaktionen, Zeilensperren und Aktionen nach dem Commit verwenden diese Verbindung. Alle dauerhaften Workflow-Tabellen müssen dieselbe Laravel-Verbindung verwenden. Konfigurieren Sie den Queue-Transport getrennt in Laravels Queue-Konfiguration.

Sie können die Verbindung auch über eigene Modellklassen wie unten beschrieben auswählen. Das konfigurierte V2-`run_model` liefert die Speicherverbindung für V2-Metadaten ohne explizite Modellverbindung. Explizite Modellverbindungen müssen damit übereinstimmen. `DW_STORAGE_CONNECTION` hat Vorrang vor den Verbindungseigenschaften der Modelle.

Den vollständigen v2-Überschreibungsvertrag einschließlich Unterklassen mit
anderen Tabellen, Serializer-Regeln, Repository-Austausch, Zustandsdiagnosen
und Migrationserwartungen beschreibt die [Anpassungsmatrix](./customization-matrix.md).

## Eigene Modellverbindungen {#custom-model-connections}

1. Erstellen Sie im Modellverzeichnis Ihrer Anwendung Klassen, die die v2-Basismodellklassen erweitern.
2. Setzen Sie in jeder Klasse die gewünschte Option `$connection`.
3. Veröffentlichen Sie die Workflow-Konfigurationsdatei.
4. Ändern Sie die Modellbindungen unter `workflows.v2` auf Ihre eigenen Klassen.

## v2-Workflow-Modelle erweitern {#extending-v2-workflow-models}

Fügen Sie Folgendes in `app\Models\V2\WorkflowInstance.php` ein.

```php
namespace App\Models\V2;

use Workflow\V2\Models\WorkflowInstance as BaseWorkflowInstance;

class WorkflowInstance extends BaseWorkflowInstance
{
    protected $connection = 'mysql';
}
```

Wiederholen Sie dieses Muster für jedes dauerhafte v2-Modell, das Sie auf eine
andere Verbindung verlegen müssen, mindestens für:

- `Workflow\V2\Models\WorkflowRun`
- `Workflow\V2\Models\WorkflowHistoryEvent`
- `Workflow\V2\Models\WorkflowTask`
- `Workflow\V2\Models\WorkflowCommand`
- `Workflow\V2\Models\WorkflowLink`
- `Workflow\V2\Models\ActivityExecution`
- `Workflow\V2\Models\ActivityAttempt`
- `Workflow\V2\Models\WorkflowTimer`
- `Workflow\V2\Models\WorkflowFailure`
- `Workflow\V2\Models\WorkflowRunSummary`
- `Workflow\V2\Models\WorkflowSchedule`
- `Workflow\V2\Models\WorkflowScheduleHistoryEvent`

Jede Unterklasse sollte `protected $connection = 'mysql';` deklarieren.
Ersetzen Sie `mysql` bei Bedarf durch den gewünschten Verbindungsnamen aus
`config/database.php`.

## Eigene Modelle registrieren {#registering-custom-models}

Veröffentlichen Sie die Workflow-Konfigurationsdatei und ändern Sie die
Bindungen `workflows.v2.*_model` auf Ihre eigenen Klassen:

```php
// config/workflows.php

'v2' => [
    'instance_model' => App\Models\V2\WorkflowInstance::class,
    'run_model' => App\Models\V2\WorkflowRun::class,
    'history_event_model' => App\Models\V2\WorkflowHistoryEvent::class,
    'task_model' => App\Models\V2\WorkflowTask::class,
    'command_model' => App\Models\V2\WorkflowCommand::class,
    // ...
],
```

Das Paket löst Modelle über `Workflow\V2\Support\ConfiguredV2Models` auf.
Jede Beziehung oder Abfrage, die ein v2-Modell verwendet, übernimmt dadurch
automatisch die konfigurierte Verbindung.

Wenn Sie über schemakompatible Unterklassen hinausgehen und den abgeleiteten
Fremdschlüssel Ihres eigenen `instance_model` ändern, prüft das Paket beim
Start, ob die Beziehungen `runs()`, `commands()` und `updates()` explizit
überschrieben wurden.

## Migrationen {#migrations}

Workflow-Migrationen werden automatisch aus dem Paket geladen und berücksichtigen `DW_STORAGE_CONNECTION`. Anwendungsmigrationen behalten ihre eigenen konfigurierten Verbindungen.

Wenn Sie eigene Modellverbindungen ohne `DW_STORAGE_CONNECTION` verwenden, weisen Sie den zugehörigen veröffentlichten Workflow-Migrationen dieselbe `$connection` zu. Mit Laravels Option `--database` können Sie das Ziel auch beim Ausführen ausschließlich dieser Workflow-Migrationen auswählen. Anwendungsmigrationen bleiben auf der Anwendungsverbindung.

## Transaktionsgrenzen {#transaction-boundaries}

Wenn Anwendungsdaten und Workflow-Speicher dieselbe Laravel-Verbindung verwenden, nimmt ein innerhalb einer Transaktion gestarteter Workflow an dieser Transaktion teil. Ein Rollback entfernt die darin geschriebenen Workflow-Daten. Der Kern veröffentlicht Workflow-Aufgaben in der Queue und sendet Lebenszyklusereignisse erst nach dem Commit der äußersten Speichertransaktion. Ein Rollback verwirft diese Aktionen.

Zum Beispiel mit `DW_STORAGE_CONNECTION=workflows`:

```php
use App\Workflows\OrderWorkflow;
use Illuminate\Support\Facades\DB;
use Workflow\V2\WorkflowStub;

DB::connection('workflows')->transaction(function () {
    WorkflowStub::make(OrderWorkflow::class, 'order-123')->start('order-123');
});
```

Anwendungsmodelle, deren Änderungen atomar mit diesem Start festgeschrieben werden müssen, müssen ebenfalls die Verbindung `workflows` verwenden.

Transaktionen auf verschiedenen Laravel-Verbindungen werden unabhängig voneinander festgeschrieben, selbst wenn die Verbindungsnamen auf dieselbe physische Datenbank zeigen. Ein Rollback auf der Standardverbindung der Anwendung kann einen Workflow, der bereits auf einer anderen Speicherverbindung festgeschrieben wurde, nicht zurückrollen. Legen Sie Änderungen, die atomar sein müssen, auf dieselbe Verbindung und schließen Sie sie in deren Transaktion ein.

Die Veröffentlichung nach dem Commit schützt die Grenze des Workflow-Speichers. Eine separate Queue-Datenbank oder ein Message-Broker hat eigene Transaktions- und Zustellungsregeln.
