---
sidebar_position: 3
---

# Installation {#installation}

Dieser Leitfaden beschreibt die Installation des PHP-Pakets von Durable Workflow in einer Laravel-Anwendung.

Wenn Sie zwischen der Einbettung des Pakets und dem eigenständigen Server wählen, lesen Sie zuerst die [Bereitstellungsmodelle](/docs/polyglot/deployment-modes). Diese Seite beschreibt den eingebetteten Laravel-Modus.

> **Möchten Sie mit einer funktionierenden Anwendung beginnen?** Die [Beispielanwendung](/docs/sample-app) ist ein ausführbares Laravel-13-Projekt mit Durable Workflow 2.0. Sie enthält einen Workflow pro Muster, einen Codespaces-Weg und einen `docker compose`-Weg. Klonen Sie das Projekt und führen Sie `php artisan app:init` aus. Damit ist dieselbe Installation bereits eingerichtet. Kehren Sie hierher zurück, wenn Sie Durable Workflow in Ihre eigene Laravel-Anwendung einbauen möchten.

## Voraussetzungen {#requirements}

- PHP 8.2 oder neuer innerhalb der 8.x-Linie
- Laravel 12.72 oder neuer in 12.x oder Laravel 13.41 oder neuer in 13.x
- PHP 8.3 oder neuer für Laravel 13

Diese Anforderungen gelten für das aktuelle eingebettete Release. Wählen Sie vor
einem Composer-Update einer älteren Anwendung die [passende veröffentlichte Linie](./compatibility.md#laravel-support).
Das reine PHP-SDK im Service-Modus hat eigene Anforderungen.

Prüfen Sie die [Datenbankkompatibilität](./polyglot/database-support.md) für eingebettete und Server-Deklarationen, genaue Testkonfigurationen und Qualifikationsgrenzen.

Durable Workflow unterstützt alle Laravel-Queue-Treiber außer `sync`, darunter:

- Amazon SQS
- Beanstalkd
- Datenbank
- Redis

Jeder Queue-Treiber hat eigene [Voraussetzungen](https://laravel.com/docs/12.x/queues#driver-prerequisites).

Außerdem benötigt Durable Workflow einen Cache-Treiber mit Unterstützung für [Sperren](https://laravel.com/docs/12.x/cache#atomic-locks).

## Durable Workflow installieren {#installing-durable-workflow}

Installieren Sie Durable Workflow mit Composer:

```bash
composer require %%artifact.workflowComposerPackage%%
```

Der obige Befehl bindet das veröffentlichte eingebettete Release. Prüfen Sie
die [Laravel-Support- und Upgrade-Grenze](./compatibility.md#laravel-support),
bevor Sie die Einschränkung erweitern oder eine ältere Anwendung aktualisieren.

Das Paket lädt seine Migrationen automatisch. Nach der Installation reicht daher ein normaler Migrationslauf:

```bash
php artisan migrate
```

## Worker ausführen {#running-workers}

Durable Workflow führt Workflows und Aktivitäten im Hintergrund über Warteschlangen aus. Starten Sie Queue-Worker mit dem [Befehl `queue:work`](https://laravel.com/docs/12.x/queues#the-queue-work-command) oder mit [Horizon](https://laravel.com/docs/12.x/horizon). Ohne Queue-Worker werden Workflows und Aktivitäten nicht verarbeitet. Für parallele Ausführung benötigen Sie mehr als einen Queue-Worker.

### Worker-Timeout {#worker-timeout}

Wenn PHP die Erweiterung `pcntl` hat, beendet ein Queue-Worker jeden Job, der länger als sein Timeout läuft: das `--timeout` des Workers, standardmäßig 60 Sekunden, sofern der Job kein eigenes festlegt. Eine so beendete Workflow-Aufgabe wird zurückgerollt. Sie wird erst nach Ablauf ihrer Lease erneut versucht (`workflows.v2.workflow_task_lease_seconds`, standardmäßig 300 Sekunden) und als verlorene Lease gezählt, und der neue Versuch wiederholt dieselbe Arbeit. Eine Workflow-Aufgabe, die immer länger als das Timeout braucht, etwa eine, die ein breites `all()` plant oder abschließt, wird nie abgeschlossen.

Drei Einstellungen müssen zusammenpassen:

- Das **Timeout der Worker, die Workflow-Aufgaben ausführen**, muss Ihre längste Workflow-Aufgabe abdecken. Eine beendete Workflow-Aufgabe wartet den Rest ihrer Lease ab, bevor sie erneut versucht wird.
- **`retry_after`** der Queue-Verbindung muss das Timeout jedes Jobs auf dieser Verbindung übersteigen, wie Laravel es verlangt. Andernfalls übergibt die Queue einen noch laufenden Job an einen zweiten Worker.
- **Aktivitäten** sollten ein begrenztes Timeout behalten, damit eine hängende Aktivität einen Worker nicht für immer blockieren kann. Verwenden Sie nicht `--timeout=0`.

Damit Aktivitäten ein kürzeres Timeout als Workflow-Aufgaben erhalten, führen Sie sie auf einer eigenen Queue mit eigenen Workern aus. Aktivitäten laufen auf der Verbindung und Queue ihres Workflows, es sei denn, die Aktivitätsklasse legt `$connection` oder `$queue` fest oder der Workflow übergibt `ActivityOptions`.

```php
// config/queue.php
'redis' => [
    'driver' => 'redis',
    'connection' => 'default',
    'queue' => 'default',
    'retry_after' => 330, // above the workflow task workers' timeout
],
```

```php
use Workflow\V2\Activity;

final class ChargeCardActivity extends Activity
{
    public ?string $queue = 'activities';
}
```

```bash
php artisan queue:work redis --queue=default --timeout=300      # workflow tasks
php artisan queue:work redis --queue=activities --timeout=60    # activities
```

In Horizon ist die Option `timeout` jedes Supervisors das Worker-Timeout.

Workflow 2.34.0 fügt `DW_V2_WORKFLOW_TASK_JOB_TIMEOUT_SECONDS` hinzu, das standardmäßig nicht gesetzt ist. Ist es gesetzt, trägt jeder Job einer Workflow-Aufgabe dieses Timeout, mindestens 10 Sekunden unter dem `retry_after` seiner Verbindung gehalten, und Worker verwenden es für diese Jobs anstelle ihres eigenen Timeouts, sodass sich Workflow-Aufgaben und Aktivitäten Worker teilen können. Ab diesem Release protokolliert ein Worker, der die Workflow-Queue bedient, beim Start eine Warnung, wenn das Timeout, unter dem seine Workflow-Aufgaben laufen, unter der Lease der Workflow-Aufgabe liegt.
