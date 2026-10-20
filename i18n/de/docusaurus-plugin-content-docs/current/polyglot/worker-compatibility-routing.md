---
sidebar_position: 5
title: Worker-Kompatibilität und Routing
description: Ursprüngliche Lauf-Pins erhalten, neue Starts promoten und fehlende kompatible Worker prüfen.
tags: [worker-protocol, compatibility, operations, rollouts]
keywords: [Worker-Kompatibilität, Worker-Rollout, Kompatibilitätsmarker, Build-ID-Routing, Worker-Rollback]
---

# Worker-Kompatibilität und Routing

Kompatibilität ist ein Routing-Vertrag. Halten Sie Worker für das Replay bestehender Historien bereit, während Sie den Build für neue Starts ändern. Drain überträgt Läufe nicht auf einen anderen Build.

## Zwei verwandte Identitäten {#two-related-identities}

- **Build-ID** ist die registrierte `build_id` einer eigenständigen Server-Kohorte, abgegrenzt nach Namespace und Queue. Promotion, Drain und Resume gelten dieser Kohorte.
- **Kompatibilitätsmarker** werden an dauerhafter Arbeit gespeichert. Embedded-PHP verwendet `DW_V2_CURRENT_COMPATIBILITY` und `DW_V2_SUPPORTED_COMPATIBILITIES`; Standalone-Worker-Build-IDs liefern die entsprechende Routing-Identität.

Identitäten sind undurchsichtige Zeichenfolgen. Ein neuer wirkender Name beweist keine Replay-Kompatibilität und erlaubt keine Änderung bestehender Pins.

## Was gepinnt wird {#what-gets-pinned}

Für neue Starts wählt der eigenständige Server zunächst eine explizite Promotion, danach die Rückfälle auf eine einzige aktive Kohorte. Mehrdeutige Starts können ungepinnt bleiben. Siehe [Auswahlreihenfolge](/docs/polyglot/worker-build-id-rollout#canary-a-new-build).

Workflow-Tasks und Aktivitäten erben die Kompatibilität des Laufs. Task-Wiederholungen, Lease-Ablauf und erneute Zustellung erhalten sie. Wiederholungsläufe, Kinder und Continue-as-new erben ebenfalls den ursprünglichen Pin. Promotion betrifft spätere neue Instanzen; sie verschiebt keine fortgesetzte Kette auf den neuen Build.

## Funktionsweise des Routings {#how-routing-works}

### Eingrenzung beim Polling {#poll-time-narrowing}

Worker fragen einen Namespace, eine Queue und eine kompatible Build-Kohorte an. Die Poll-Auswahl vermeidet inkompatible Angebote, ist aber nicht die endgültige Autorität.

### Prüfung beim Claim {#claim-time-enforcement}

Beim Claim werden ursprüngliche Task-Kompatibilität und Worker-Identität geprüft. Ein inkompatibler Worker erhält keine Lease, nur weil ein anderer Build fehlt. Auch ein Lease-Ablauf erweitert die Kompatibilität nicht.

## Weiterentwicklung des Definitionsfingerabdrucks {#definition-fingerprint-evolution}

**Vorbereitung einer noch nicht veröffentlichten Version.** Das folgende Routingverhalten ist für Server 2.9.9 und die SDKs PHP 2.5.4, Python 2.6.2 und Rust 3.5.6 im Quellcode zusammengeführt. Veröffentlichung und Prüfung der installierten Artefakte stehen noch aus.

Die ursprüngliche Build-Bindung und der Definitionsfingerabdruck beantworten unterschiedliche Fragen. Ein Replay-kompatibler neuer Build kann zur selben Build-Familie gehören und trotzdem einen anderen Quellcode-Fingerabdruck haben. Standardmäßig bevorzugt der Server einen geeigneten Worker mit dem bei `WorkflowStarted` aufgezeichneten Fingerabdruck. Ist keiner mehr vorhanden, kann eine geänderte Definition das Original nur übernehmen, wenn ihr Worker `workflow_entry_arguments_validation` ankündigt. Diese Fähigkeit verspricht eine Ablehnung vor dem Einstieg, ohne den fachlichen Lauf fehlschlagen zu lassen. Sie wird weder aus der Laufzeitsprache noch aus der Protokollversion abgeleitet. Das manuelle Ergänzen dieser Zeichenfolge macht eine unsichere Worker-Implementierung nicht sicher.

Auch beim Ausweichen auf eine andere Definition gelten der ursprüngliche Namespace, die Aufgabenwarteschlange, der Workflow-Typ, der Build und die Replay-Fähigkeiten. Der Lauf behält seinen aufgezeichneten Fingerabdruck und seine Zulassungssnapshots. Das SDK muss die ursprüngliche Einstiegseingabe prüfen und bestätigte Befehle wiedergeben; eine Quellcodeänderung, ein Versionsmarker oder eine erfolgreiche Registrierung beweist nicht, dass dieses Replay gelingt. Starten Sie geänderten Code mit einer neuen Worker-ID, weil eine aktive Registrierung ihren angekündigten Fingerabdruck nicht ändern kann.

Laufdetails, Debug-Antworten für ausgewählte Läufe, Reparaturantworten und Details der Aufgabenwarteschlange zeigen `definition_routing`:

| Status | Bedeutung und Maßnahme |
| --- | --- |
| `matching_definition_available` / `matching_definition_preferred` | Geeignete Kapazität mit aufgezeichneter Definition ist verfügbar oder wird dem geänderten Worker vorgezogen. |
| `replay_required` | Eine geänderte Definition mit der erforderlichen Fähigkeit darf übernehmen. Einstiegsprüfung und striktes Replay müssen weiterhin gelingen. Das ist kein Blockierungsurteil. |
| `entry_validation_unavailable` | Dem Ersatz fehlt die Fähigkeit zur Einstiegsprüfung. Aktualisieren Sie das SDK oder stellen Sie die aufgezeichnete Definition wieder her. |
| `no_eligible_worker` / `worker_definition_missing` / `recorded_definition_missing` | Prüfen Sie fehlende Kapazität oder Fingerabdruckinformationen, ohne ursprüngliche Routing-Schutzbedingungen zu verändern. |
| `pinning_disabled` | Die Bevorzugung übereinstimmenden Quellcodes ist deaktiviert; andere Claim- und Replay-Schutzbedingungen gelten weiterhin. |

`blocked = true` beschreibt eine fällige, bereite Workflow-Aufgabe ohne geeigneten Definitionspfad. Die Warteschlangendetails nehmen höchstens zehn Läufe auf und melden, ob weitere bereite Läufe existieren. Das ist keine vollständige Zählung aller passiven oder blockierten Läufe. Eine Reparatur kann keinen passenden Worker erzeugen und keine Historie umschreiben. Folgen Sie nach einer tatsächlichen Einstiegsablehnung dem [Verfahren zur Wiederherstellung desselben Originallaufs](../failures-and-recovery.md#service-entry-recovery).

`DW_V2_PIN_TO_RECORDED_FINGERPRINT=false` hebt die Bevorzugung übereinstimmenden Quellcodes auf. Build-Bindungen, Namespace-/Warteschlangen-/Typgrenzen, Registrierungsidentität, Lease-Fencing und strikte Replay-Prüfungen bleiben bestehen. Die Einstellung ersetzt weder das sichere SDK noch ein Upgrade über den sicheren Standardpfad. Ältere Laufzeiten können eine geänderte Definition stillschweigend ohne ausführenden Worker lassen oder eine nicht klassifizierte Einstiegsablehnung wiederholen. Verwenden Sie die exakt qualifizierte Kombination aus Laufzeit und SDK.

## Was Betreiber konfigurieren sollten {#what-operators-should-configure}

Konfigurieren Sie für Embedded-PHP die aktuelle und ausdrücklich unterstützten Familien:

```bash
DW_V2_CURRENT_COMPATIBILITY=orders-2026-04-28
DW_V2_SUPPORTED_COMPATIBILITIES=orders-2026-04-28,orders-2026-04-21
```

Der erste Wert pinnt neue Embedded-Läufe; der zweite erlaubt Claims für diese Familien. Verwenden Sie `*` nur mit bewusst geprüfter Kompatibilitätspolitik. Registrieren Sie bei Standalone-Workern eine stabile `build_id` und nutzen Sie Promotion und Lebenszyklussteuerung des Servers. Erhalten Sie die Familie bei replaykompatiblen Neubauten; ein anderes Label macht inkompatiblen Workflow-Code nicht replaysicher.

## Sicheres Rollout-Muster {#safe-rollout-pattern}

1. Deployen und prüfen Sie Namespace, Queue, unterstützte Workflow-Typen und frische Registrierungen der neuen Kohorte. Halten Sie die alte verfügbar.
2. Promoten Sie den gewünschten Build explizit für neue Starts. Worker-Zahlen definieren keine prozentuale Traffic-Aufteilung.
3. Erhalten Sie kompatible Kapazität für bestehende Pins, auch für passive Läufe, die auf Timer, Signal, Aktivität oder Kind warten.
4. Drainen Sie nur, wenn neue Claims dieser Kohorte absichtlich gestoppt werden sollen. Bei blockierter Arbeit nach frühem Drain setzen Sie fort und stellen den ursprünglichen kompatiblen Build wieder her.
5. Für einen Rollback neuer Starts stellen Sie die bekannte funktionierende Kohorte wieder her, setzen sie fort und promoten sie; rollen Sie dann das schlechte Deployment zurück. Bestehende Pins bleiben erhalten.

Null ausstehende Workflow-Tasks beweisen keine sichere Stilllegung. Erhalten Sie Artefakt und Wiederherstellungsweg, solange ein gepinnter Lauf oder eine geerbte Kette sie benötigen kann. [Server #519](https://github.com/durable-workflow/server/issues/519) verfolgt die separate abgesicherte Stilllegung; diese Checkliste liefert sie nicht.

## Sichtbarer Zustand bei fehlenden Workern {#explicit-missing-worker-state}

Prüfen Sie [Workflow-Tasks pro Kohorte](/docs/polyglot/worker-build-id-rollout#pending-workflow-tasks-by-cohort), frische/drainende/veraltete Registrierungen und ursprüngliche Pins gemeinsam. `no_compatible_worker` bezeichnet ausstehende Workflow-Arbeit eines Nicht-null-Builds ohne aktiven kompatiblen Worker. Es zählt weder Aktivitätsqueues noch alle passiven gepinnten Läufe. Fehlende Felder, fehlgeschlagene Anfragen oder veraltete Heartbeats sind keine leere Flotte oder kein Rückstand. Stellen Sie den passenden Build wieder her oder untersuchen Sie Queue, Namespace und Typdeklarationen, bevor Sie unpassende Worker hinzufügen.

## Zusammenhang mit Build-ID-Rollouts {#how-this-relates-to-build-id-rollouts}

Der Rollout-Zustand beschreibt registrierte Kapazität sowie neue Start- und Lebenszyklusabsichten; Kompatibilität bestimmt den Claim eines konkreten ursprünglichen Tasks. Nutzen Sie beides. Weder Drain noch Rollback schreibt dauerhafte Kompatibilität um oder beweist, dass ein Build entfernt werden darf.

## Weitere Referenzen {#related-references}

- [Namespace, Authentifizierung und Worker-Registrierung](/docs/polyglot/namespace-auth-workers)
- [Rollout von Worker-Build-IDs](/docs/polyglot/worker-build-id-rollout)
- [Server-Konfigurationsreferenz](/docs/polyglot/server-config-reference)
- [Betriebsrahmen](/docs/operator-operating-envelope)
