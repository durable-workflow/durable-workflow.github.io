---
sidebar_position: 3
title: Worker-Platzierung und Affinität
description: Wählen Sie Queue-Routing, lokale Aktivitäten oder Worker-Sitzungen, ohne einen Queue-Namen als Garantie für einen bestimmten physischen Host zu behandeln.
tags:
  - configuration
  - workers
  - affinity
keywords:
  - Worker-Affinität für Aktivitäten
  - dedizierte Aktivitätsqueue
  - Aktivität im selben Prozess
  - Worker-Sitzungen
---

# Worker-Platzierung und Affinität {#worker-placement-and-affinity}

Ein Queue-Name ist eine Routing-Grenze und garantiert keine Bindung an einen
physischen Host. Die Eigenschaft `$queue` eines Workflows oder einer Aktivität
beschränkt, welche Worker die Aufgabe übernehmen dürfen. Jeder kompatible
Worker, der diese Queue abfragt, kann sie jedoch erhalten. Geben Sie Daten
zwischen gewöhnlichen Aktivitäten nicht über das lokale Dateisystem eines
Workers weiter, sofern die Daten nicht zusätzlich an einem dauerhaften,
gemeinsam zugänglichen Ort gespeichert sind.

## Arbeit an einen dedizierten Worker-Pool leiten {#route-work-to-a-dedicated-worker-pool}

Verwenden Sie eine dedizierte Queue, wenn eine Art von Arbeit einen bestimmten
Worker-Pool benötigt, etwa Worker mit einem eingebundenen gemeinsamen Volume
oder einer GPU:

```php
use Workflow\V2\Activity;

final class RenderVideo extends Activity
{
    public ?string $queue = 'gpu-activities';
}
```

Starten Sie auf dieser Queue nur die vorgesehenen Laravel-Worker:

```bash
php artisan queue:work --queue=gpu-activities
```

Laravel Horizon kann dieselbe Queue überwachen. In beiden Fällen lautet die
Garantie „einer der dieser Queue zugewiesenen Worker“, nicht „derselbe Prozess
oder Host, der den vorherigen Schritt ausgeführt hat“. Speichern Sie
Übergabedaten in dauerhaften Workflow-Payloads, externem Payload-Speicher oder
einem anderen gemeinsamen Speicher, auf den jeder zulässige Worker zugreifen
kann.

## Den benötigten Affinitätsvertrag wählen {#choose-the-affinity-contract-you-need}

- Verwenden Sie eine [gewöhnliche Aktivität in einer Queue](/docs/defining-workflows/activities),
  wenn die Arbeit auf jedem kompatiblen Worker ihrer Queue laufen kann.
- Verwenden Sie eine [lokale Aktivität](/docs/features/local-activities), wenn
  eine kurze, wiederholbare Aktivität im Workflow-Worker-Prozess laufen muss,
  der gerade die Workflow-Aufgabe verarbeitet.
- Verwenden Sie eine [Worker-Sitzung](/docs/features/worker-sessions), wenn
  mehrere dauerhafte Aktivitätsschritte dieselbe Worker-Sitzungs-Lease für
  prozesslokalen Zustand, GPU-Speicher oder ein lokal beim Worker eingebundenes
  Dateisystem wiederverwenden müssen.

Worker-Sitzungen wenden weiterhin zuerst das Queue-Routing an. Danach ergänzen
sie einen expliziten Lease- und Fähigkeitsvertrag einschließlich Ablauf und
optionaler erneuter Übernahme. Sie machen keinen einzelnen Rechner
unsterblich. Wenn Zustand den Verlust eines Workers oder die erneute Übernahme
einer Sitzung überstehen muss, speichern Sie ihn dauerhaft in gemeinsamem
Speicher.

Den Platzierungsvergleich finden Sie unter
[Ausführungsmodell für Aktivitäten](/docs/features/activity-execution-model).
Die Queue-Konfiguration auf Klassenebene und pro Aufruf beschreibt
[Optionen](/docs/configuration/options#queue).
