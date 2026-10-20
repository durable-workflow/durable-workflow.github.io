---
title: Kooperativer Abbruch
description: Zeitlich begrenzte Bereinigung eines Workflows, seiner Kinder und seiner Aktivitäten anfordern.
---

# Kooperativer Abbruch {#cooperative-cancellation}

Server 2.5.0 führt mit Protokoll 1.20 den kooperativen Abbruch ein. Er setzt
Worker voraus, die Kooperation explizit aktivieren. Prüfen Sie vor der Nutzung
die Runtime-Erkennung und die vom SDK unterstützten Fähigkeiten.

## Bereinigung anfordern {#request-cleanup}

Verwenden Sie `requestCancellation()` im PHP SDK, `request_cancellation()` in
Python oder Rust oder die Server-Route `request-cancellation`. Der Lauf bleibt
aktiv, während der Workflow-Code die Anfrage verarbeitet und die Bereinigung
durchführt. Nach erfolgreicher Bereinigung endet der Lauf als `Cancelled`.

```http
POST /api/workflows/{workflowId}/runs/{runId}/request-cancellation
X-Durable-Workflow-Control-Plane-Version: 2
Authorization: Bearer <operator-token>
X-Namespace: <namespace>
Content-Type: application/json

{"reason":"Order withdrawn","cleanup_timeout_seconds":30}
```

Der ausgewählte Lauf muss weiterhin aktuell sein. Die erste angenommene Anfrage
liefert HTTP 202. Ein Duplikat liefert HTTP 200 mit der ursprünglichen
Anfrageidentität und Frist. Eine Änderung des Timeouts bei einem Duplikat
verlängert das Bereinigungsbudget nicht.

Der unveränderliche Abbruchkontext stellt Anfrage- und Root-IDs, Grund,
Anfragenden, Quelle, ursprünglichen Anfragezeitpunkt, Frist und geordnete
Abstammung bereit. Workflow-Code erhält ihn an der aufgezeichneten
Zustellungsgrenze. Zuvor abgeschlossene Aufrufe werden normal wiedergegeben.
Mit den deterministischen Hilfsmethoden `deadline()` und `remaining()` kann
die Bereinigung nach einem Neustart dieselben Entscheidungen treffen.

Das bestehende `cancel()` schließt einen Lauf sofort und setzt die
Workflow-Bereinigung nicht fort. Auch `terminate()` schließt ihn sofort, mit
dem Ergebnis `Terminated`.

## Richtlinien für Operationen wählen {#choose-operation-policies}

| Richtlinie | Kind-Workflow | Entfernte Aktivität | Lokale Aktivität |
| --- | --- | --- | --- |
| TryCancel | Bereinigung des Kindes anfordern und Bereinigung des Elternteils fortsetzen | Stopp des Callbacks anfordern und Workflow-Bereinigung fortsetzen | Überwachten Callback stoppen und Bereinigung fortsetzen |
| WaitCancellationCompleted | Auf das aufgezeichnete terminale Ergebnis des Kindes warten | Auf den dauerhaften Stoppbeleg des ursprünglichen Callbacks warten | Den dauerhaften Stoppbeleg des ursprünglichen Callbacks abwarten |
| Abandon | Kind unabhängig weiterlaufen lassen | Aktivität mit ihrem ursprünglichen endlichen Gesamt-Timeout unabhängig weiterlaufen lassen | Vor der Zulassung abgelehnt |

Für das Schließen des Elternteils gilt eine eigene Richtlinie.
`RequestCancellation` sendet eine kooperative Anfrage mit der ursprünglichen
Abbruchabstammung und einer begrenzten Frist. `RequestCancel` behält sein
bisheriges Verhalten des sofortigen Abbruchs bei.

Jedes kooperierende Kind erbt die Identität der Root-Anfrage und das
Bereinigungsbudget. Ein Kind kann eine engere Frist erhalten, dieses Budget aber
nicht vergrößern. Eine aufgegebene Operation hat eine unabhängige Lebensdauer
und wird beim Warten auf diese Bereinigung nicht berücksichtigt.

## Überwachung und Wiederherstellung {#supervision-and-recovery}

Kooperative Worker beobachten Abbrüche unabhängig von Aktivitäts-Heartbeats der
Anwendung. PHP verwendet überwachte Callback-Prozesse. Python überwacht asynchrone
und synchrone Callbacks. Rust überwacht asynchrone Callback-Futures. Abgekoppelte
Arbeit und nachgelagerte Dienste benötigen ein eigenes Abbruch- und
Idempotenzverhalten.

Die Bereinigung kann einen Abbruchschutz verwenden, um dauerhafte Aktivitäten,
Timer und Kindaufrufe auszuführen. Der Schutz erhält die ursprüngliche Frist.
Stirbt ein Worker, gibt ein Ersatz denselben Zustellungspunkt und die bereits
abgeschlossenen Bereinigungsaufrufe wieder, bevor er fortfährt. Fristablauf oder
Terminierung entziehen die verbleibende Ausführungsberechtigung.

Ein alter Aktivitätsversuch kann nach seiner Sperrung kein Ergebnis mehr
veröffentlichen. Bereits angenommene externe Seiteneffekte erfordern weiterhin
Idempotenz oder einen Abgleich durch die Anwendung.

## Die Kaskade untersuchen {#inspect-the-cascade}

Die Laufdiagnose stellt `cancellation_cascade` bereit, mit Root-Anfrage,
beteiligten Läufen, Aktivitätsversuchen, Richtlinien, Stoppbelegen, Fristen und
Bereinigungsergebnissen. CLI und Waterline zeigen dieselbe Ansicht.

Der Lebenszyklus unterscheidet `requested`, `delivered`, `cleaning_up`,
`cancelled`, `deadline_expired` und `terminated`. Eine unvollständige Ansicht
benennt, was nicht verifiziert werden kann, statt einen fehlenden Beleg als
Erfolgsnachweis zu werten.

Eine Anfrage gegen einen inkompatiblen aktiven Worker-Claim liefert eine
explizite Ablehnung wegen fehlender Fähigkeiten, ohne einen teilweisen Abbruch
aufzuzeichnen. Die Aktualisierung einer Registrierung aktualisiert keinen
bereits vergebenen Claim.

## Grenze des unterstützten Releases {#release-boundary}

Anfragen für ganze Läufe, Kind- und Aktivitätsrichtlinien, zeitlich begrenzte
geschützte Bereinigung, Wiederherstellung und Kaskadeninspektion bilden den
unterstützten Release-Umfang. Unabhängig abbrechbare Operationsbereiche bleiben
eine deaktivierte Quellcode-Vorschau und sind in der Protokollreferenz als
experimentell gekennzeichnet.

Die genauen Anfrage-, Beleg- und Fähigkeitsstrukturen finden Sie in der
[Worker-Protokollspezifikation](/platform-protocol-specs/worker-protocol-api.openapi.yaml).
Sprachspezifische Anleitungen zur Implementierung stehen auf den SDK-Websites
für [PHP](https://php.durable-workflow.com/),
[Python](https://python.durable-workflow.com/) und
[Rust](https://rust.durable-workflow.com/).
