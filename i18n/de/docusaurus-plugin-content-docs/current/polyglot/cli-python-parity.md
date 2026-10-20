---
title: Client- und Worker-Fähigkeiten
description: Vergleich der Client- und Worker-Fähigkeiten von CLI, PHP SDK, Python SDK und Rust SDK.
---

# Client- und Worker-Fähigkeiten {#client-and-worker-capabilities}

Wählen Sie die Oberfläche danach, was der Prozess tun muss. Die `dw`-CLI und die
offiziellen PHP-, Python- und Rust-SDKs teilen die v2-Control-Plane- und
Worker-Verträge, aber ihre Rollen für Betrieb, Clients und Worker sind nicht identisch.

Dieser Leitfaden für alle Clients bleibt unter der ursprünglichen Route
`/docs/polyglot/cli-python-parity/`, damit vorhandene Links weiterhin funktionieren.

## Vergleich der Fähigkeiten {#capability-comparison}

| Fähigkeit | `dw`-CLI | PHP SDK | Python SDK | Rust SDK |
| --- | --- | --- | --- | --- |
| Workflow-Lebenszyklus | **Unterstützt:** Betriebsbefehle zum Starten, Auflisten, Untersuchen, Warten, Abbrechen, Terminieren und Archivieren. [Befehle](./cli-reference.md#workflow-commands) | **Unterstützt:** Starten, Beschreiben, Auflisten, Warten auf Ergebnisse, Abbrechen und Terminieren über `Client` und `WorkflowHandle`. [Lebenszyklusnachweise](./php.md#lifecycle-updates-schedules-and-visibility) | **Unterstützt:** Starten, Auflisten/Beschreiben, Warten auf Ergebnisse, Abbrechen und Terminieren über den asynchronen Client. [Workflow-Operationen](./python.md#workflow-operations) | **Unterstützt:** Starten, Beschreiben, Warten auf Ergebnisse, Abbrechen und Terminieren über `Client` und `WorkflowHandle`. [Terminale Operationen](./rust.md#cancel-terminate-and-handle-terminal-outcomes) |
| Signale | **Unterstützt:** Senden nach Workflow-ID oder ausgewähltem Lauf. [Befehle](./cli-reference.md#workflow-commands) | **Unterstützt:** Sendemethoden an Client und Handle sowie Signalverlauf des Workers. [PHP-API](./php.md#lifecycle-updates-schedules-and-visibility) | **Unterstützt:** Asynchroner Client sendet, Workflow-Worker verarbeiten Signale. [Nachrichten](./python.md#signals-queries-and-updates) | **Unterstützt:** Senden über Client und Handle sowie Signalverarbeitung im Worker. [Rust-API](https://rust.durable-workflow.com/) |
| Abfragen | **Unterstützt:** Ausführen einer benannten schreibgeschützten Abfrage mit strukturierter Ausgabe. [Befehle](./cli-reference.md#workflow-commands) | **Unterstützt:** Abfragen über Client und Handle sowie registrierte Abfrage-Handler im Worker. [PHP-API](./php.md#lifecycle-updates-schedules-and-visibility) | **Unterstützt:** Asynchrone Client-Abfragen sowie Abfrage-Handler mit Replay im Worker. [Nachrichten](./python.md#signals-queries-and-updates) | **Unterstützt:** Client-Abfragen und Abfrage-Handler mit Replay im Worker, wenn die Runtime-Erkennung Unterstützung für Abfrage-Tasks meldet. [Rust-API](https://rust.durable-workflow.com/) |
| Updates | **Unterstützt:** Übermitteln und Warten auf angenommene oder abgeschlossene Ergebnisse. [Befehle](./cli-reference.md#workflow-commands) | **Unterstützt:** `updateWorkflow` und `registerUpdate`; das PHP SDK bietet keine Implementierung von Validatoren und deklariert keine. [PHP-API](./php.md#lifecycle-updates-schedules-and-visibility) | **Unterstützt:** Clients, Workflow-Handler und synchrone deklarierte Validatoren, wenn die Erkennung den Vertrag vor der Annahme meldet. Worker mit Validatoren lehnen nicht unterstützte Runtimes ab. [Nachrichten](./python.md#signals-queries-and-updates) | **Unterstützt:** Client, Handle, Avro-Nutzlasten und registrierte Update-Oberflächen im Worker; das Rust SDK bietet keine Implementierung von Validatoren und deklariert keine. [Updates](./rust.md#workflow-updates) |
| Zeitpläne | **Unterstützt:** Vollständiger Zeitplan-Lebenszyklus, Nachholen und Audit-Verlauf. [Befehle](./cli-reference.md#schedule-commands) | **Unterstützt:** Vollständiger Zeitplan-Lebenszyklus und Auflisten über `Client`. [PHP-API](./php.md#lifecycle-updates-schedules-and-visibility) | **Unterstützt:** Vollständiger asynchroner Zeitplan-Lebenszyklus und seitenweises Lesen des Audit-Verlaufs. [Zeitpläne](./python.md#schedules) | **Nicht unterstützt:** Das aktuelle Rust SDK beansprucht keine API zur Zeitplanverwaltung. Verwenden Sie CLI, PHP, Python oder die Server-API. |
| Einblick | **Unterstützt:** Workflow-/Laufsuche, Worker, Task-Warteschlangen, Verlauf und Diagnose-JSON. [Befehle](./cli-reference.md#workflow-commands) | **Unterstützt:** Workflow-Filterung und -Seitennavigation, Verlauf, Namespaces, Worker und Task-Warteschlangen. [Nachweise zur Einsicht](./php.md#lifecycle-updates-schedules-and-visibility) | **Unterstützt:** Client-Oberflächen für Workflows, Zeitpläne, Namespaces, Worker, Warteschlangen, Verlauf und Suchattribute. [Client-API](./python.md#client-api-reference) | **Abweichend:** Beschreibung/Ergebnis eines ausgewählten Laufs wird unterstützt; flottenweites Auflisten/Suchen und Namespace-Verwaltung werden nicht beansprucht. [Rust-Client](./rust.md#package-and-source) |
| Worker-Ausführung | **Bewusst abweichend:** Worker-Protokollbefehle auf niedriger Ebene dienen Diagnose und Konformität; `dw` ist keine Runtime für Anwendungs-Worker. [Worker-Befehle](./cli-reference.md#worker-protocol-commands) | **Unterstützt:** Entfernte Workflow-, Aktivitäts-, Abfrage- und Update-Handler über `durable-workflow/sdk`. [PHP-Worker](./php.md#run-a-remote-php-worker) | **Unterstützt:** Deterministische Workflow- und Aktivitäts-Worker. [Python-Worker](./python.md#worker) | **Unterstützt:** Native Workflow-, Aktivitäts-, Abfrage- und Update-Handler. [Rust-Worker-API](https://rust.durable-workflow.com/) |

**Unterstützt** bedeutet, dass die benannte Oberfläche des aktuellen Releases die
Fähigkeit anbietet. **Abweichend** bezeichnet eine bewusste Umfangsgrenze.
**Nicht unterstützt** ist eine explizite aktuelle Lücke, kein verstecktes
Versprechen. Wenn eine Fähigkeit von einem ausgehandelten Worker-Protokoll
abhängt, bleibt die Runtime-Protokollerkennung maßgeblich.

## Nachweise nach Produktoberfläche {#evidence-by-product-surface}

### CLI {#cli}

Die [CLI-Übersicht](./cli.mdx) beschreibt Installation, Profile, strukturierte
Ausgabe und Exit-Verhalten. Die [Befehlsreferenz](./cli-reference.md) ist die
vollständige Betriebsoberfläche mit Lebenszyklus, Nachrichten, Zeitplänen,
Einblicken und den Worker-Protokollbefehlen auf niedriger Ebene, die bewusst
keine SDK-Worker-Schleife bilden.

### PHP SDK {#php-sdk}

Das festgelegte PHP SDK bietet frameworkunabhängige Client- und Remote-Worker-APIs.
Seine aktuelle öffentliche Oberfläche umfasst Workflow-Lebenszyklus und
Ergebnis-Handles, Signale, Abfragen, Updates, Zeitpläne, Workflow-Filterung und
-Verlauf, Einsicht in Namespaces, Worker und Task-Warteschlangen sowie registrierte
Workflow-, Aktivitäts-, Abfrage- und Update-Handler. Siehe den
[PHP-SDK-Leitfaden](./php.md) und die generierte
[PHP-API-Referenz](https://php.durable-workflow.com/api/).

### Python SDK {#python-sdk}

Das Python SDK verbindet einen asynchronen Control-Plane-Client mit
deterministischen Workflow- und Aktivitäts-Workern. Sein Leitfaden veröffentlicht
[Client-Operationen](./python.md#client-api-reference),
[Nachrichten-Handler](./python.md#signals-queries-and-updates),
[Worker-Ausführung](./python.md#worker) und
[Zeitplanverwaltung](./python.md#schedules). Die generierte
[Python-API-Referenz](https://python.durable-workflow.com/) enthält genaue
Signaturen und Ergebnistypen.

### Rust SDK {#rust-sdk}

Das veröffentlichte Rust SDK bietet Control-Plane-Operationen und den
Lebenszyklus ausgewählter Läufe, Signale, Abfragen mit Replay, Updates und native
Workflow-/Aktivitäts-Worker. Die Update-Unterstützung umfasst
`Client::update_workflow`, `WorkflowHandle::update`, `Worker::register_update`
und deren Avro-Wert-Varianten. Zeitplanverwaltung und flottenweites
Auflisten/Suchen bleiben explizite Lücken. Siehe den
[Rust-SDK-Leitfaden](./rust.md) und die generierte
[Rust-API-Referenz](https://rust.durable-workflow.com/).

## Nachweise für den gemeinsamen Vertrag {#shared-contract-evidence}

Alle vier Produkte verwenden dieselbe versionierte HTTP+JSON-Control-Plane und
öffentliche Nutzlast-Envelope. Die Nachweise sind nach ihrer Aussage getrennt:

- Der [Fähigkeitsindex](/docs/capabilities/) hält genaue Mindestversionen der
  Artefakte und den aktuellen Funktionsumfang fest.
- Die [Plattform-Konformitätssuite](/docs/platform-conformance/) erfasst
  Runtime-Szenarien über Clients und Worker hinweg.
- Die CLI- und Python-Repositories enthalten gemeinsame Anfrage-Fixtures für
  Operationen, deren semantische Anfrageinhalte heute Byte für Byte verglichen werden.
- Die öffentlichen PHP- und Rust-API-Referenzen und Release-Tests belegen die
  oben aufgeführten zusätzlich unterstützten Methoden.

Dass zwei Repositories eine gemeinsame Fixture haben, bedeutet nicht, dass
anderen SDKs die Operation fehlt. Umgekehrt bedeutet ein gemeinsamer Endpunkt
nicht, dass jedes Produkt dieselbe Betriebs- oder Worker-Rolle anbietet.

## Eine Client-Oberfläche hinzufügen oder erweitern {#adding-or-extending-a-client-surface}

Beim Hinzufügen einer neuen CLI- oder SDK-Operation:

1. Halten Sie Pfade, Methoden, semantische Felder, Nutzlast-Envelopes und
   Fehlerergebnisse sprachneutral.
2. Fügen Sie Anfrage- und Runtime-Nachweise für jeden beteiligten Client oder Worker hinzu.
3. Dokumentieren Sie bewusst unterschiedliche Syntax oder Rollengrenzen.
4. Kennzeichnen Sie nicht unterstützte Produkte explizit.
5. Behandeln Sie sprachspezifische Serialisierung, Dateipfade, Klassennamen oder
   Fehlerstrukturen als Fehler im öffentlichen Vertrag.
