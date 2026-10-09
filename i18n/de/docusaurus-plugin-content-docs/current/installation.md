---
sidebar_position: 3
---

# Installation {#installation}

Dieser Leitfaden beschreibt die Installation des PHP-Pakets von Durable Workflow in einer Laravel-Anwendung.

Wenn Sie zwischen der Einbettung des Pakets und dem eigenständigen Server wählen, lesen Sie zuerst die [Bereitstellungsmodelle](/docs/polyglot/deployment-modes). Diese Seite beschreibt den eingebetteten Laravel-Modus.

> **Möchten Sie mit einer funktionierenden Anwendung beginnen?** Die [Beispielanwendung](/docs/sample-app) ist ein ausführbares Laravel-13-Projekt mit Durable Workflow 2.0. Sie enthält einen Workflow pro Muster, einen Codespaces-Weg und einen `docker compose`-Weg. Klonen Sie das Projekt und führen Sie `php artisan app:init` aus. Damit ist dieselbe Installation bereits eingerichtet. Kehren Sie hierher zurück, wenn Sie Durable Workflow in Ihre eigene Laravel-Anwendung einbauen möchten.

## Voraussetzungen {#requirements}

- PHP 8.1 oder neuer
- Laravel 9 oder neuer

Durable Workflow unterstützt alle Laravel-Queue-Treiber außer `sync`, darunter:

- Amazon SQS
- Beanstalkd
- Database
- Redis

Jeder Queue-Treiber hat eigene [Voraussetzungen](https://laravel.com/docs/12.x/queues#driver-prerequisites).

Außerdem benötigt Durable Workflow einen Cache-Treiber mit Unterstützung für [Sperren](https://laravel.com/docs/12.x/cache#atomic-locks).

## Durable Workflow installieren {#installing-durable-workflow}

Installieren Sie Durable Workflow mit Composer:

```bash
composer require %%artifact.workflowComposerPackage%%
```

Verwenden Sie `durable-workflow/workflow:^2.0`, damit Composer kompatible 2.x-Updates automatisch zulässt. Die [Versionskompatibilität](/docs/compatibility) beschreibt die Regeln für Laufzeitumgebung und Pakete.

Das Paket lädt seine Migrationen automatisch. Nach der Installation reicht daher ein normaler Migrationslauf:

```bash
php artisan migrate
```

## Worker ausführen {#running-workers}

Durable Workflow führt Workflows und Aktivitäten im Hintergrund über Warteschlangen aus. Starten Sie Queue-Worker mit dem [Befehl `queue:work`](https://laravel.com/docs/12.x/queues#the-queue-work-command) oder mit [Horizon](https://laravel.com/docs/12.x/horizon). Ohne Queue-Worker werden Workflows und Aktivitäten nicht verarbeitet. Für parallele Ausführung benötigen Sie mehr als einen Queue-Worker.
