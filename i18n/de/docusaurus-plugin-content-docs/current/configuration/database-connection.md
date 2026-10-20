---
sidebar_position: 4
---

# Datenbankverbindung {#database-connection}

Hier finden Sie die Schritte zum Anpassen der Datenbankverbindung für die
dauerhaften Workflow-v2-Modelle. Dies ist *nur* erforderlich, wenn Sie eine
andere Verbindung als die Standardverbindung Ihrer Laravel-Anwendung verwenden
möchten.

Den vollständigen v2-Überschreibungsvertrag einschließlich Unterklassen mit
anderen Tabellen, Serializer-Regeln, Repository-Austausch, Zustandsdiagnosen
und Migrationserwartungen beschreibt die [Anpassungsmatrix](./customization-matrix.md).

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

Jede Unterklasse sollte `protected $connection = 'mysql';` deklarieren, mit
dem in `config/database.php` definierten Verbindungsnamen.

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

Workflow-Migrationen werden automatisch aus dem Paket geladen
(`WorkflowServiceProvider::loadMigrationsFrom`) und auf der
Standard-Datenbankverbindung ausgeführt. Wenn Sie die v2-Tabellen auf eine
andere Verbindung legen, veröffentlichen Sie die Migrationen mit
`php artisan vendor:publish --tag=migrations` und setzen Sie
`protected $connection = 'mysql';` in jeder veröffentlichten Migrationsklasse,
damit `php artisan migrate` sie auf der richtigen Datenbank ausführt.
