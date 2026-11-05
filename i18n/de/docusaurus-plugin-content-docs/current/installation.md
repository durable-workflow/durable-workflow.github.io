---
sidebar_position: 3
---

# Installation {#installation}

Dieser Leitfaden beschreibt die Installation des PHP-Pakets von Durable Workflow in einer Laravel-Anwendung.

Wenn Sie zwischen der Einbettung des Pakets und dem eigenständigen Server wählen, lesen Sie zuerst die [Bereitstellungsmodelle](/docs/polyglot/deployment-modes). Diese Seite beschreibt den eingebetteten Laravel-Modus.

> **Möchten Sie mit einer funktionierenden Anwendung beginnen?** Die [Beispielanwendung](/docs/sample-app) ist ein ausführbares Laravel-13-Projekt mit Durable Workflow 2.0. Sie enthält einen Workflow pro Muster, einen Codespaces-Weg und einen `docker compose`-Weg. Klonen Sie das Projekt und führen Sie `php artisan app:init` aus. Damit ist dieselbe Installation bereits eingerichtet. Kehren Sie hierher zurück, wenn Sie Durable Workflow in Ihre eigene Laravel-Anwendung einbauen möchten.

## Voraussetzungen {#requirements}

Die veröffentlichte Workflow-Reihe 2.20.x benötigt:

- PHP `^8.1`
- Laravel 10–13 mit den deklarierten Mindestversionen aus dem
  [Paketmanifest](https://github.com/durable-workflow/workflow/blob/2.20.4/composer.json)

Laravel 11 und 12 benötigen mindestens PHP 8.2, Laravel 13 mindestens PHP 8.3.
Die [Versionskompatibilität](/docs/compatibility/#embedded-php-and-laravel-support)
nennt die genauen Vorgaben und die getrennte Grenze des PHP-SDK.

### Workflow 2.21 vorbereiten {#preparing-for-workflow-2-21}

:::info Noch nicht veröffentlichte Supportänderung

Der Quellstand für Workflow 2.21 benötigt PHP `^8.2` und Laravel `^12.69.0|^13.30.0`.
Er ist noch nicht veröffentlicht oder durch Release Verification geprüft. Der
Installationsbefehl unten wählt weiterhin ein veröffentlichtes Artefakt;
ein Quellcode-Merge ändert diese Autorität nicht.

:::

Aktualisieren Sie Anwendungen mit PHP 8.1 oder Laravel 10/11 vor 2.21 auf eine
unterstützte Plattform. Laravel 13 benötigt weiterhin mindestens PHP 8.3.
Aktualisieren Sie Web-, CLI- und Worker-Prozesse und bewahren Sie während
Vorbereitung und Tests die bestehende 2.20.x-Lockdatei auf. Eine explizite
2.21-Anforderung muss eine nicht unterstützte Plattform ablehnen. Lassen Sie
Composers Plattformprüfung und Sicherheitshinweis-Sperren aktiv. Das Beibehalten
von 2.20.x verlängert nicht die vorgelagerte Sicherheitsunterstützung für PHP oder Laravel.

Diese Supportänderung führt keine Schema-, Verlaufs- oder Protokollmigration
ein. Bestehende v1-Läufe bleiben bei v1; das
[Migrationsverfahren](/docs/migration/) regelt weiterhin Drain oder Koexistenz.

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

Verwenden Sie `durable-workflow/workflow:^2.0`, damit Composer kompatible 2.x-Updates automatisch zulässt. Die [Versionskompatibilität](/docs/compatibility) beschreibt die Regeln für Laufzeitumgebung und Pakete.

Das Paket lädt seine Migrationen automatisch. Nach der Installation reicht daher ein normaler Migrationslauf:

```bash
php artisan migrate
```

## Worker ausführen {#running-workers}

Durable Workflow führt Workflows und Aktivitäten im Hintergrund über Warteschlangen aus. Starten Sie Queue-Worker mit dem [Befehl `queue:work`](https://laravel.com/docs/12.x/queues#the-queue-work-command) oder mit [Horizon](https://laravel.com/docs/12.x/horizon). Ohne Queue-Worker werden Workflows und Aktivitäten nicht verarbeitet. Für parallele Ausführung benötigen Sie mehr als einen Queue-Worker.
