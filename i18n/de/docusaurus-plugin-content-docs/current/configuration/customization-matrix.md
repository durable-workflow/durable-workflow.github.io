---
sidebar_position: 4.5
title: Anpassungsmatrix
description: Festgelegte Unterstützungsmatrix für Modellüberschreibungen, Serializer-Einstellungen, den Austausch des Observability-Repositorys, Zustandsprüfungen, Importe, Migrationen und Schreibzugriffe in Durable Workflow v2.
---

# Anpassungsmatrix {#customization-matrix}

Diese Seite legt den unterstützten Anpassungsvertrag für Durable Workflow v2 fest.
Verwenden Sie sie, wenn Sie die dauerhaften v2-Modelle auf eine andere Verbindung
verlegen, Modellunterklassen austauschen, das PHP-Repository für die
Betreiberbeobachtbarkeit ersetzen oder prüfen möchten, ob eine ältere
Serializer-Einstellung während einer Migration noch gültig ist.

## Matrix der unterstützten Überschreibungen {#supported-override-matrix}

| Bereich | Unterstützter Vertrag | Hinweise |
| --- | --- | --- |
| `workflows.v2.instance_model` mit einer schemakompatiblen Unterklasse, die den Basisnamen `WorkflowInstance` beibehält | Unterstützt | Verwenden Sie diese Form, wenn Sie nur eine andere Verbindung, Casts oder einen Anwendungs-Namespace benötigen. Die geerbten Beziehungen behalten den Fremdschlüsselvertrag `workflow_instance_id` des Pakets bei. |
| `workflows.v2.instance_model` mit einer Unterklasse, die die Tabelle oder den Basisnamen ändert | Mit expliziten Beziehungsüberschreibungen unterstützt | Überschreiben Sie `runs()`, `commands()` und `updates()` so, dass sie `workflow_instance_id` beibehalten. Das Paket prüft dies beim Start und lehnt geerbte Beziehungsableitungen ab, die diese Schlüssel ändern würden. `currentRun()` legt `current_run_id` bereits explizit fest und benötigt keine Überschreibung. |
| Andere `workflows.v2.*_model`-Überschreibungen (`run_model`, `task_model`, `history_event_model`, Projektionen, Zeitpläne, Aktivitätszeilen, Fehler, Nachrichten, Memos, Suchattribute, untergeordnete Aufrufe) | Für schemakompatible Unterklassen unterstützt | Behalten Sie die Spaltennamen, Primärschlüssel und Fremdschlüssel des Pakets bei. Diese Beziehungen legen ihre Schlüssel bereits fest. Unterklassen mit anderen Tabellen können deshalb die geerbten Beziehungsmethoden verwenden, solange das Schema kompatibel bleibt. |
| Eigene Tabellennamen zusammen mit eigenen Fremdschlüssel-Spaltennamen | Nicht unterstützt | Die v2-Laufzeit und die Betreiberoberflächen setzen die Spalten- und Schlüsselnamen des Pakets voraus. Änderungen daran liegen außerhalb des unterstützten Vertrags. |
| Ersatz für `OperatorObservabilityRepository` | Über Container-Bindung unterstützt | Binden Sie Ihre Implementierung an `Workflow\V2\Contracts\OperatorObservabilityRepository`. Dies ist ein PHP-Laufzeit-Integrationsvertrag für Waterline und `WorkflowStub::historyExport()`, keine stabile sprachübergreifende API. Das Repository erhält Modellobjekte des Pakets. |
| `serializer` | Nur für `avro` und Legacy-Codecs zum Abschließen/Importieren unterstützt | Neue v2-Ausführungen verwenden immer Avro-Semantik. `workflow-serializer-y` und `workflow-serializer-base64` sind nur zum Abschließen oder Importieren von v1-Verläufen gültig, die noch PHP-native Dekodierung benötigen. Eigene Serializer-Klassen aus v1 werden in v2 nicht unterstützt. |
| Zustands- und Doctor-Diagnosen | Unterstützt | `php artisan workflow:v2:doctor` und die Zustands-/Statistikansichten von Waterline v2 berücksichtigen die konfigurierten Modellklassen und kennzeichnen veraltete Serializer-Einstellungen als Migrationsaltlasten. |
| Paketmigrationen auf einer anderen als der Standardverbindung | Mit veröffentlichten Migrationen unterstützt | Automatisch geladene Paketmigrationen laufen auf der Laravel-Standardverbindung. Wenn Ihre dauerhaften Modelle eine andere Verbindung verwenden, veröffentlichen Sie die Migrationen und setzen Sie deren `$connection` explizit. |
| Schreibpfad der Kernlaufzeit (`WorkflowStub::make()`, `load()`, Aufgabenerstellung, Auflösung der aktuellen Ausführung) | Über die konfigurierten dauerhaften Modelle unterstützt | Die Laufzeit berücksichtigt die konfigurierten Werte für `instance_model`, `run_model` und `task_model`. Halten Sie die Tabellen des Schreibpfads mit den Spalten und Schlüsseln des Pakets schemakompatibel. |

## Genaue v2-Modellschlüssel {#exact-v2-model-keys}

Die veröffentlichte Konfiguration `workflows.php` stellt unter `workflows.v2`
diese Schlüssel für dauerhafte Modelle bereit:

- `instance_model`
- `run_model`
- `history_event_model`
- `task_model`
- `command_model`
- `link_model`
- `activity_execution_model`
- `activity_attempt_model`
- `timer_model`
- `failure_model`
- `run_summary_model`
- `run_wait_model`
- `run_timeline_entry_model`
- `run_timer_entry_model`
- `run_lineage_entry_model`
- `schedule_model`
- `schedule_history_event_model`

Verwenden Sie für diese Schlüssel Unterklassen der Paketmodelle. Behalten Sie
die Spaltennamen und Fremdschlüssel des Pakets bei, sofern keine Seite dieser
Dokumentation etwas anderes angibt.

## Regel für Überschreibungen des Instanzmodells {#instance-model-override-rule}

Die einzige aktuelle v2-Überschreibung, die zusätzliche Arbeit an Beziehungen
erfordert, ist `workflows.v2.instance_model`, wenn Ihre Unterklasse den
abgeleiteten Fremdschlüssel von `workflow_instance_id` weg ändert.

Ein typisches sicheres Beispiel:

```php
namespace App\Models\V2;

use Workflow\V2\Models\WorkflowInstance as BaseWorkflowInstance;

final class WorkflowInstance extends BaseWorkflowInstance
{
    protected $connection = 'workflow';
}
```

Da der Basisname der Unterklasse weiterhin `WorkflowInstance` ist, behält
Eloquent denselben abgeleiteten Fremdschlüssel bei und die geerbten Beziehungen
bleiben aufeinander abgestimmt.

Wenn Sie einen anderen Basisnamen oder ein Speichermodell mit einer anderen
Tabelle verwenden, überschreiben Sie die betroffenen Beziehungen explizit:

```php
namespace App\Workflow\Storage;

use Illuminate\Database\Eloquent\Relations\HasMany;
use Workflow\V2\Models\WorkflowCommand;
use Workflow\V2\Models\WorkflowInstance as BaseWorkflowInstance;
use Workflow\V2\Models\WorkflowRun;
use Workflow\V2\Models\WorkflowUpdate;
use Workflow\V2\Support\ConfiguredV2Models;

final class TenantWorkflowInstance extends BaseWorkflowInstance
{
    protected $table = 'tenant_workflow_instances';

    public function runs(): HasMany
    {
        return $this->hasMany(
            ConfiguredV2Models::resolve('run_model', WorkflowRun::class),
            'workflow_instance_id',
        );
    }

    public function commands(): HasMany
    {
        return $this->hasMany(
            ConfiguredV2Models::resolve('command_model', WorkflowCommand::class),
            'workflow_instance_id',
        )->oldest('created_at');
    }

    public function updates(): HasMany
    {
        return $this->hasMany(
            ConfiguredV2Models::resolve('update_model', WorkflowUpdate::class),
            'workflow_instance_id',
        )
            ->orderBy('command_sequence')
            ->oldest('accepted_at')
            ->oldest('created_at')
            ->oldest('id');
    }
}
```

Fehlen diese Überschreibungen, schlägt der Paketstart sofort fehl, statt der
Anwendung abgeleitete Schlüssel wie `tenant_workflow_instance_id` oder
`custom_workflow_instance_id` zu erlauben.

## Regeln für Serializer, Import und Zustandsprüfungen {#serializer-import-and-health-rules}

- Behalten Sie für neue v2-Arbeit `serializer = 'avro'` bei.
- Verwenden Sie Legacy-Codecs nur beim Abschließen oder Importieren von
  v1-Verläufen, die noch PHP-native Payload-Dekodierung benötigen.
- Verweisen Sie in v2 nicht auf entfernte eigene Serializer-Klassen aus v1.
- Führen Sie nach Upgrades und Konfigurationsänderungen
  `php artisan workflow:v2:doctor` aus. Diese Diagnose kennzeichnet ältere
  Serializer-Einstellungen und andere Probleme der Startbereitschaft.
- Betrachten Sie die Zustands- und Statistikansichten von Waterline v2 als
  Betreiberansicht derselben Konfiguration dauerhafter Modelle.

## Regeln für Migrationen und Schreibzugriffe {#migration-and-write-side-rules}

- Der normale Weg sind automatisch geladene Paketmigrationen auf der
  Standardverbindung.
- Wenn Ihre dauerhaften Modelle eine andere Verbindung verwenden,
  veröffentlichen Sie die Migrationen und setzen Sie deren `$connection`, damit
  `php artisan migrate` dieselbe Datenbank wie Ihre konfigurierten
  Modellunterklassen verwendet.
- Behalten Sie bei jedem Modell im Laufzeit-Schreibpfad die Tabellennamen,
  Primärschlüssel und Fremdschlüssel des Pakets bei.
- Der Schreibpfad ist keine reine Leseanpassung: Starten, Laden, Auflösen der
  aktuellen Ausführung und Aufgabenausführung verwenden die konfigurierten
  dauerhaften Modelle.

## Weiterführende Anleitungen {#related-guides}

- [Konfiguration veröffentlichen](./publishing-config.md)
- [Datenbankverbindung](./database-connection.md)
- [Migrationsanleitung](../migration.md)
- [Monitoring](../monitoring.md)
