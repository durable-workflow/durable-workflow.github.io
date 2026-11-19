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

Wenn PHP die Erweiterung `pcntl` hat, beendet ein Queue-Worker jeden Job, der länger als sein Timeout läuft: das `--timeout` des Workers, standardmäßig 60 Sekunden, sofern der Job kein eigenes festlegt. Eine so beendete Workflow-Aufgabe verliert ihre Lease und wird zurückgerollt. Sie wird erst nach Ablauf der Lease erneut versucht (`workflows.v2.workflow_task_lease_seconds`, standardmäßig 300 Sekunden), und der neue Versuch wiederholt dieselbe Arbeit. Eine Workflow-Aufgabe, die immer länger als das Timeout braucht, etwa eine, die ein breites `all()` plant oder abschließt, wird nie abgeschlossen.

Drei Einstellungen müssen zusammenpassen:

- Das **Timeout der Workflow-Aufgabe** muss unter der **Lease der Workflow-Aufgabe** liegen. Arbeit, die über die Lease hinaus läuft, kann nicht abgeschlossen werden.
- **`retry_after`** der Queue-Verbindung muss das Timeout jedes Jobs auf dieser Verbindung übersteigen, wie Laravel es verlangt. Andernfalls übergibt die Queue einen noch laufenden Job an einen zweiten Worker.
- **Aktivitäten** sollten ein begrenztes Timeout behalten, damit eine hängende Aktivität einen Worker nicht für immer blockieren kann. Verwenden Sie nicht `--timeout=0`.

Führen Sie Workflow-Aufgaben auf einer eigenen Queue-Verbindung aus, deren `retry_after` die Lease übersteigt, mit Workern, deren `--timeout` unter der Lease liegt. Führen Sie Aktivitäten auf einer anderen Queue mit einem für sie passenden Timeout aus. Aktivitäten verwenden die Queue ihres Workflows, sofern die Aktivitätsklasse nicht eigene `$connection`- oder `$queue`-Werte festlegt.

```php
// config/queue.php: a connection for workflow tasks
'workflows' => [
    'driver' => 'redis',
    'connection' => 'default',
    'queue' => 'workflows',
    'retry_after' => 330, // above the 300-second workflow task lease
],
```

```bash
# DW_V2_CONNECTION=workflows DW_V2_QUEUE=workflows
php artisan queue:work workflows --queue=workflows --timeout=270
php artisan queue:work --queue=default --timeout=60
```

In Horizon ist die Option `timeout` jedes Supervisors das Worker-Timeout. Neuere Workflow-Releases geben jedem Job einer Workflow-Aufgabe dieses Timeout (die Lease abzüglich 30 Sekunden, mindestens 10 Sekunden unter `retry_after` gehalten), sodass ein kurzes Worker-Timeout Workflow-Aufgaben nicht mehr beendet. Ein Worker auf der Workflow-Queue protokolliert beim Start eine Warnung, wenn `retry_after` Workflow-Aufgaben begrenzt.
