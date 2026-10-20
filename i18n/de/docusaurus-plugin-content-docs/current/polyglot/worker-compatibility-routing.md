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
