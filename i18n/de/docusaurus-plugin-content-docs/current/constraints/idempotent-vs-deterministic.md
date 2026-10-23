---
sidebar_position: 2
title: "Idempotenz und Determinismus"
sidebar_label: Idempotent und deterministisch
description: In Durable Workflow 2.0 hält Determinismus die Orchestrierung Replay-sicher, während Idempotenz die Effekte wiederholter Aktivitäten absichert.
slug: /constraints/idempotent-vs-deterministic
canonical_path: /de/docs/constraints/idempotent-vs-deterministic/
image: /img/idempotent-vs-deterministic.png
tags:
  - constraints
  - determinism
  - idempotency
  - replay
keywords:
  - idempotent und deterministisch
  - Idempotenz und Determinismus
  - deterministisch und idempotent
  - deterministischer Workflow
  - idempotente Aktivität
---

# Idempotente und deterministische Workflows: Was ist der Unterschied? {#idempotent-vs-deterministic-workflows-whats-the-difference}

**Deterministisches Verhalten trifft bei gleichen Eingaben und gleichem Verlauf
dieselben Entscheidungen. Idempotentes Verhalten hat denselben beabsichtigten
Effekt, unabhängig davon, ob eine Operation einmal oder mehrmals läuft.**
Determinismus macht eine Ausführung vorhersehbar. Idempotenz macht wiederholte
Ausführungen sicher. Keine Eigenschaft folgt aus der anderen.

| Frage | Deterministisch | Idempotent |
| --- | --- | --- |
| Was bleibt gleich? | Die Entscheidungen aus denselben Eingaben und demselben Verlauf | Der beabsichtigte externe Effekt nach einem oder vielen Aufrufen |
| Warum benötigt Durable Workflow dies? | Replay muss denselben Workflow-Pfad rekonstruieren | Wiederholungen und erneute Zustellung dürfen Seiteneffekte nicht duplizieren |
| Wohin gehört es? | Workflow- und Orchestrierungscode | Aktivitäten und die von ihnen aufgerufenen Systeme |
| Verbietet es Ein-/Ausgabe oder Zufall? | Ja, innerhalb erneut abgespielten Workflow-Codes, sofern das Ergebnis nicht aufgezeichnet wird | Nein. Eine Aktivität kann Ein-/Ausgabe, Zeit oder Zufall verwenden und ihren Effekt trotzdem sicher wiederholbar machen |

## Die Eigenschaften sind unabhängig {#the-properties-are-independent}

### Deterministisch, aber nicht idempotent {#deterministic-but-not-idempotent}

Betrachten Sie eine Operation, die einen Zähler erhöht:

```text
increment(counter):
    counter.value = counter.value + 1
```

Bei gleichem Ausgangswert des Zählers führt diese Operation immer dieselbe
Berechnung aus und ist daher deterministisch. Sie ist nicht idempotent: Zwei
Aufrufe erhöhen den Zähler zweimal, ein Aufruf erhöht ihn einmal.

### Idempotent, aber nicht deterministisch {#idempotent-but-not-deterministic}

Betrachten Sie nun eine Aktivität, die eine Bestellung in einen bekannten
Zustand versetzt, beim Kontakt mit dem Dienst aber zufällige Wartezeiten
zwischen Versuchen verwendet:

```text
archive(order_id):
    wait(random_backoff())
    PUT /orders/{order_id}/status {"status": "archived"}
```

Zeitverhalten und Anzahl interner Versuche können variieren. Diese
Implementierung ist daher nicht deterministisch. Die Operation kann trotzdem
idempotent sein: Nach einem oder mehreren erfolgreichen Aufrufen ist die
Bestellung archiviert. Antwort, Latenz und interner Ablauf müssen nicht
identisch sein, wohl aber der beabsichtigte externe Effekt.

## Warum Workflow-Code deterministisch sein muss {#why-workflow-code-must-be-deterministic}

Durable Workflow rekonstruiert den Orchestrierungszustand durch Replay des
festgeschriebenen Verlaufs. Bei gleicher Workflow-Eingabe und gleichem Verlauf
muss Workflow-Code dieselben Aktivitäten, Timer und Warteoperationen in
derselben Reihenfolge einplanen. Eine Echtzeituhr-Abfrage, ein Zufallswert, eine
Live-Datenbankabfrage oder eine Netzwerkantwort im Workflow-Rumpf kann beim
Replay einen anderen Zweig wählen und Entscheidungen erzeugen, die dem Verlauf
widersprechen.

Verlagern Sie diese Operationen in Aktivitäten oder verwenden Sie einen
Workflow-Helfer, der den Wert im Verlauf aufzeichnet. Replay gibt dann das
aufgezeichnete Aktivitäts- oder Seiteneffektergebnis zurück, statt die externe
Operation erneut auszuführen. Determinismus verlangt nicht, dass jeder
Aktivitätsaufruf eine allgemeingültige, zeitlose Antwort liefert. Er verlangt,
dass erneut abgespielte Orchestrierung Entscheidungen trifft, die mit ihrem
aufgezeichneten Verlauf übereinstimmen.

Die Regeln zum Schreiben von Workflows finden Sie unter
[Workflow-Einschränkungen](./workflow-constraints.md), das Replay-Modell unter
[Funktionsweise](../how-it-works.md).

Rust-Regeln für `HashMap`, Uhr, Zufall und Future-Reihenfolge stehen bei den [dauerhaften Ersatzmustern](../polyglot/rust.md#rust-determinism-rules). Rust SDK 4.5.0 ergänzt [Activity-/Workflow-Tests ohne Server und Replay aufgezeichneter Historien](../polyglot/rust.md#offline-testing-and-replay). Behalten Sie Integrationstests für die dokumentierten Ausführungsgrenzen bei.

## Warum Aktivitäten und Seiteneffekte idempotent sein müssen {#why-activities-and-side-effects-must-be-idempotent}

Aktivitäten überschreiten die dauerhafte Grenze zu Datenbanken, Zahlungs-APIs,
E-Mail-Anbietern, Objektspeichern und anderen Systemen. Nach einem Timeout,
einer Wiederholung, einem Worker-Ausfall oder einer abgelaufenen Lease können
sie erneut zugestellt werden. Ein Worker kann sogar die externe Änderung
abschließen und dann ausfallen, bevor Durable Workflow seine Meldung erhält.

Gestalten Sie den beabsichtigten Effekt der Aktivität so, dass ein weiterer
Versuch sicher ist:

- Senden Sie einen stabilen Idempotenzschlüssel an die entfernte API.
- Verwenden Sie Upserts anhand einer dauerhaften Geschäfts- oder Ausführungskennung.
- Schreiben Sie auf einen deterministischen Objekt- oder Ressourcennamen.
- Verwenden Sie eine von Natur aus idempotente Operation, etwa das Setzen eines Werts oder Löschen einer bekannten Ressource.

Ein Idempotenzschlüssel macht Aktivitätscode nicht deterministisch und verhindert
nicht den Start eines weiteren Versuchs. Er ermöglicht dem externen System zu
erkennen, dass wiederholte Versuche dieselbe logische Operation darstellen.

Die Verträge für Wiederholungen, erneute Zustellung und dauerhaften Verlauf
beschreiben [Aktivitätseinschränkungen](./activity-constraints.md),
[Ausführungsmodell für Aktivitäten](../features/activity-execution-model.md)
und [Ausführungsgarantien und Idempotenz](./execution-guarantees.md).

## Eine Grenze über alle SDKs hinweg {#one-boundary-across-every-sdk}

Dasselbe Design gilt für Worker in PHP, Python und Rust:

1. Halten Sie die Orchestrierung Replay-sicher: Geben Sie bei gleicher Eingabe und gleichem Verlauf dieselben dauerhaften Befehle aus.
2. Platzieren Sie Netzwerkaufrufe, Uhren, Zufall und veränderlichen externen Zustand hinter einer Aktivitätsgrenze.
3. Geben Sie jeder Aktivität mit Seiteneffekten eine stabile Identität, die das Zielsystem deduplizieren kann.

Die Sprachsyntax ändert sich. Die Grenze zwischen Determinismus und Idempotenz
bleibt gleich.
