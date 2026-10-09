---
sidebar_position: 3.5
title: Ausführungsgarantien und Idempotenz
description: Der öffentliche v2-Vertrag für Replay, Wiederholungsversuche, abgelaufene Leases, erneute Zustellung und Idempotenzkennungen.
tags:
  - constraints
  - idempotency
  - retries
  - replay
keywords:
  - Ausführungsgarantien
  - Idempotenz
  - Replay
  - erneute Zustellung
  - abgelaufene Lease
  - mindestens einmal
  - genau einmal
---

# Ausführungsgarantien und Idempotenz {#execution-guarantees-and-idempotency}

Durable Workflow v2 trennt **Workflow-Replay** und **Aktivitätsausführung**:

- Workflow-Code wird anhand der festgeschriebenen Historie erneut durchlaufen und muss deterministisch sein.
- Aktivitätscode führt Nebenwirkungen aus und wird **mindestens einmal** ausgeführt.
- Die dauerhafte Historie speichert festgeschriebene Workflow- und Aktivitätsergebnisse für dieselbe dauerhafte Kennung genau einmal, auch wenn der Transport Arbeit mehrfach zugestellt hat.

Diese Garantien erlauben die Fortsetzung nach Worker-Neustarts, abgelaufenen Leases, erneuter Queue-Zustellung und schrittweisen Bereitstellungen.

## Replay und Wiederholungsversuche {#replay-is-not-retry}

Workflow-Aufgaben rekonstruieren den Zustand aus der festgeschriebenen Historie und entscheiden anschließend über den nächsten Schritt. Replay durchläuft den Workflow-Code erneut. Es führt aber keine bereits gespeicherten Aktivitäten, Signale oder Nebenwirkungen erneut aus.

Darum muss Workflow-Code deterministisch bleiben. Verwenden Sie geeignete Hilfsfunktionen wie [`Workflow::now()`](../defining-workflows/workflow-api.md), [`sideEffect(...)`](../features/side-effects.md), Abfragen, Updates, Aktivitätsergebnisse, Memos und Suchattribute, wenn Sie die Grenze zur dauerhaften Speicherung überschreiten müssen.

## Aktivitäten werden mindestens einmal ausgeführt {#activity-execution-is-at-least-once}

Aktivitäten führen externe Nebenwirkungen aus. Für sie gilt:

- Ein Aktivitätsversuch kann mehrfach beansprucht werden.
- Nach Ablauf einer Lease kann die Aufgabe an einen anderen Worker zugestellt werden.
- Ein Worker kann die externe Arbeit abschließen, seine Lease verlieren und das Ergebnis verspätet melden.
- Ein Wiederholungsversuch plant einen neuen dauerhaften Versuch derselben logischen Aktivitätsausführung.

Mehrfache Ausführung gehört damit zum normalen Verhalten. Der Anwendungsautor muss den Aktivitätskörper oder das angesprochene externe System so gestalten, dass Wiederholungen sicher sind.

Die [Aktivitäts-Einschränkungen](./activity-constraints.md) zeigen geeignete Entwurfsmuster. [Fehler und Wiederherstellung](../failures-and-recovery.md) beschreibt das Verhalten aus Sicht des Betriebs.

## Was genau einmal gespeichert wird {#what-is-exactly-once}

Durable Workflow verspricht nicht, dass ein Worker-Prozess Arbeit mit Nebenwirkungen nur einmal erhält. Festgeschriebene dauerhafte Fakten sind jedoch maßgeblich und werden für dieselbe dauerhafte Kennung nicht doppelt gespeichert.

In der Praxis bedeutet das:

- Eine festgeschriebene Workflow-Entscheidung wird für ihre dauerhafte Befehls- oder Schrittkennung einmal in der typisierten Historie gespeichert.
- Das festgeschriebene abschließende Ergebnis eines Aktivitätsversuchs wird für seine `activity_attempt_id` einmal gespeichert.
- Replay liest diese Fakten und rekonstruiert daraus den Workflow-Zustand, ohne externe Arbeit erneut auszuführen.

Das zentrale Modell lautet:

- **Transport und Worker arbeiten mindestens einmal.**
- **Die festgeschriebene dauerhafte Historie enthält jeden Fakt pro dauerhafter Kennung genau einmal.**

## Abgelaufene Leases und erneute Zustellung {#lease-expiry-and-redelivery}

Der Ablauf einer Lease gehört zur normalen Wiederherstellung in verteilten Systemen:

- Eine beanspruchte Aufgabe hat einen Lease-Eigentümer und einen Ablaufzeitpunkt.
- Läuft die Lease ab, bevor der Worker Fortschritt oder Abschluss meldet, kann die Aufgabe erneut zugestellt werden.
- Ein anderer Worker kann dieselbe logische Arbeit beanspruchen.

Erneute Zustellung bedeutet, dass die Engine mit Unsicherheit im Worker oder Transport umgeht. Bereits festgeschriebene Ergebnisse bleiben erhalten.

Bei Anzeichen doppelter Ausführung prüfen Sie zwei Fragen getrennt:

1. Wurde die externe Nebenwirkung mehrfach ausgeführt?
2. Wurde mehr als ein Ergebnis für dieselbe dauerhafte Kennung festgeschrieben?

Die erste Frage erfordert idempotenten Aktivitätscode. Die zweite betrifft den Vertrag der Engine.

## Standardkennungen für Idempotenz {#default-idempotency-surfaces}

Diese stabilen Kennungen eignen sich zur Duplikaterkennung:

| Kennung | Bedeutung | Typische Verwendung |
| --- | --- | --- |
| `workflow_instance_id` | Eine öffentliche Workflow-Instanz | Doppelte Starts erkennen und fachliche Instanz identifizieren |
| `workflow_run_id` | Ein bestimmter dauerhafter Lauf | Einen Lauf für Abfragen, Export oder Diagnosen auswählen |
| `workflow_command_id` | Ein externer zustandsändernder Befehl | Wiederholte Client-Anfragen deduplizieren |
| `activity_execution_id` | Eine logische Aktivitätsausführung über Versuche hinweg | Standard-Idempotenzschlüssel für externe Nebenwirkungen |
| `activity_attempt_id` | Ein konkreter Aktivitätsversuch | Einzelne Versuche mit einem entfernten System korrelieren |
| `schedule_id` | Eine Zeitplandefinition | Zuständigkeit und Auslöser eines Zeitplans deduplizieren |
| Nachrichtenstrom-`idempotencyKey` | Eine wiederholt gesendete logische Nachricht | Doppelte Nachrichtenaufnahme bei Sender-Wiederholungen verhindern |

Verwenden Sie für externe Operationen standardmäßig `activity_execution_id`. Nutzen Sie `activity_attempt_id` nur, wenn das Ziel jeden Wiederholungsversuch unterscheiden muss.

```php
use Workflow\V2\Activity;

final class ChargeCard extends Activity
{
    public function handle(array $payload): string
    {
        return app(PaymentGateway::class)->charge(
            $payload,
            idempotencyKey: $this->activityId(),
            attemptCorrelation: $this->attemptId(),
        );
    }
}
```

## Was die Anwendung idempotent machen muss {#what-developers-must-make-idempotent}

Workflow-Replay selbst müssen Sie nicht idempotent machen. Das Framework rekonstruiert den Zustand aus der festgeschriebenen Historie.

Externe Nebenwirkungen müssen dagegen sicher wiederholbar sein, darunter:

- Zahlungs- und Abrechnungsaufrufe
- E-Mails, Textnachrichten und Webhooks
- Schreibzugriffe auf andere Datenbanken oder Dienste
- Dateierstellung und Uploads
- jeder Befehl, der Zustand außerhalb der Workflow-Historie erzeugt oder verändert

Häufige Ansätze:

- Übergeben Sie der entfernten API einen Idempotenzschlüssel.
- Schreiben Sie in eine deterministische Zielressource, etwa einen bekannten Objektschlüssel.
- Verwenden Sie einen Upsert oder eine Transaktion mit einer dauerhaften Kennung als Schlüssel.
- Gestalten Sie die Operation so, dass ein zweiter Aufruf nichts mehr verändert.

## Hinweise für den Betrieb {#operator-guidance}

Bei der Diagnose eines Laufs in Waterline, der CLI oder Server-Protokollen:

- Erwarten Sie nach dem Ablauf einer Lease eine mögliche mehrfache Aktivitätsausführung, bis das dauerhafte Ergebnis des Versuchs etwas anderes zeigt.
- Behandeln Sie verspätete Abschluss- oder Fehlerberichte als Rennen, das die Engine entscheidet. Daraus folgt nicht, dass die externe Nebenwirkung ausgeblieben ist.
- Behandeln Sie Workflow-Replay als Wiederherstellung.
- Untersuchen Sie fehlende kompatible Worker, festhängende Leases und wiederholte Reparaturen. Solche Hinweise sind kein Grund, Nebenwirkungen in den Workflow-Code zu verschieben.

Unterscheiden Sie **Unsicherheit im Transport** und **dauerhaftes Ergebnis**. Durable Workflow macht beides sichtbar, damit Sie den tatsächlichen Zustand beurteilen können.

## Weitere Leitfäden {#related-guides}

- Der [Überblick](./overview.md) erklärt die Trennung zwischen Workflows und Aktivitäten.
- [Workflow-Einschränkungen](./workflow-constraints.md) beschreibt deterministischen Workflow-Code.
- [Aktivitäts-Einschränkungen](./activity-constraints.md) zeigt sichere Nebenwirkungen und Idempotenzmuster.
- [Fehler und Wiederherstellung](../failures-and-recovery.md) behandelt Wiederholungsversuche, Zeitlimits und Reparatur.
- Das [Aktivitäts-Ausführungsmodell](../features/activity-execution-model.md) erklärt Queue-Aktivitäten, lokale Aktivitäten, Worker-Sitzungen und Sticky Execution.
- [Lokale Aktivitäten](../features/local-activities.md) beschreibt Versuche im selben Prozess, Workflow-Aufgaben-Heartbeats, Wiederholungen und kaltes Replay.
- [Sticky Execution](../features/sticky-execution.md) erklärt Replay-Caches und kaltes Replay als Grundlage korrekter Ausführung.
