---
sidebar_position: 5
title: Worker-Kompatibilität und Routing
description: Worker-Build-Rollouts durch Bindung laufender Arbeit an kompatible Executors absichern und Rollout-Lücken sichtbar machen.
tags:
  - worker-protocol
  - compatibility
  - operations
  - rollouts
keywords:
  - Worker-Kompatibilität
  - Worker-Build-Rollouts
  - Kompatibilitätsmarker
  - Build-ID-Routing
  - Worker-Rollback
---

# Worker-Kompatibilität und Routing {#worker-compatibility-and-routing}

Verwenden Sie diesen Leitfaden, um einen neuen Worker-Build bereitzustellen,
eine Task-Warteschlange als Canary zu testen, einen fehlerhaften Build
zurückzunehmen oder lang laufende Workflows über einen Worker-Build-Rollout
hinweg am Leben zu halten. Durable Workflow v2 behandelt Worker-Kompatibilität
als Routing-Vertrag, nicht als informelle Bereitstellungskonvention.

Die Kernregel ist einfach: Ein unter einer Kompatibilitätsfamilie gestarteter
Lauf muss weiterhin bei Workern landen, die ihn sicher wiedergeben und
ausführen können. Das System muss „kein kompatibler Worker verfügbar“ als
expliziten Betriebszustand zeigen, statt den Task still einem anderen Build
zu übergeben.

## Zwei verwandte Identitäten {#two-related-identities}

Durable Workflow bietet zwei verwandte, aber unterschiedliche Rollout-Oberflächen:

- **Build-ID** ist die betriebsseitige Kohortenidentität auf dem eigenständigen
  Server. Sie ist der Wert, den ein Worker als `build_id` registriert und
  dessen Kohorte die Rollout-APIs für Task-Warteschlangen leeren oder fortsetzen.
- **Kompatibilitätsmarker** ist die Routing-Identität für laufende Arbeit.
  Bei eingebetteten und servergehosteten PHP-Workern stammt er aus
  `DW_V2_CURRENT_COMPATIBILITY` und `DW_V2_SUPPORTED_COMPATIBILITIES`.
  Auf dem eigenständigen Server sind Build-ID-Kohorten die betriebsseitige
  Möglichkeit, diese kompatiblen Worker-Gruppen zu untersuchen und zu steuern.

Behandeln Sie beide Werte als opake Zeichenfolgen wie `orders-2026-04-28` oder
`api-v3`. Durable Workflow interpretiert keine semantischen Versionen,
vergleicht keine Daten und rät nicht, welche Zeichenfolge neuer ist.

## Was gebunden wird {#what-gets-pinned}

Kompatibilität ist an dauerhafte Workflow-Arbeit gebunden, nicht nur an
lebende Worker-Prozesse.

- **Workflow-Start** zeichnet die aktuelle Kompatibilitätsfamilie im neuen Lauf auf.
- **Workflow-Tasks** erben diese Familie und behalten sie bei Wiederholungen,
  Lease-Ablauf und erneuter Zuweisung.
- **Aktivitäts-Tasks** erben dieselbe Kompatibilitätsfamilie wie ihr Elternlauf.
- **Wiederholungsläufe** behalten die Familie des Quelllaufs.
- **Continue-as-new** behält die Familie des aktuellen Laufs.
- **Kind-Workflows** erben die Familie des Elternlaufs.

Ein lang laufender Workflow wechselt also nicht allein aufgrund einer geänderten
Bereitstellung in eine andere Executor-Familie. Neue Builds betreffen neue
Starts, sofern Sie nicht bewusst alte Kohorten leeren und Verkehr umleiten.

## Wie Routing funktioniert {#how-routing-works}

Die Durchsetzung der Kompatibilität erfolgt auf mehreren Ebenen.

### Eingrenzung beim Abfragen {#poll-time-narrowing}

Worker grenzen ihre Anfragen nach Task-Warteschlange und Kompatibilitäts-/Build-Kohorte
ein, damit Server oder eingebettete Engine offensichtlich inkompatible Tasks
gar nicht erst anbieten.

Dies ist ein Effizienzhinweis, nicht die endgültige Sicherheitsgrenze.

### Durchsetzung bei der Übernahme {#claim-time-enforcement}

Die Prüfung bei der Übernahme ist die Korrektheitsgrenze. Kann ein Worker einen
Task nicht sicher ausführen, lehnt Durable Workflow den Claim mit einem
expliziten Kompatibilitätsgrund ab, statt die Zuständigkeit still neu zuzuweisen.

Auf diesen Vertrag können Sie sich bei kompatibilitätsrelevanten
Bereitstellungen verlassen:

- Tasks werden niemals still auf einen inkompatiblen Worker erweitert.
- Lease-Ablauf und erneute Zustellung erhalten die ursprüngliche Kompatibilitätsfamilie.
- Ein fehlender kompatibler Worker ist ein beobachtbarer Zustand, kein undefiniertes Verhalten.

## Was der Betrieb konfigurieren sollte {#what-operators-should-configure}

Verwenden Sie stabile, menschenlesbare Kompatibilitätsfamilien für Builds, die
dieselben laufenden Workflows sicher wiedergeben können.

Setzen Sie für eingebettete oder servergehostete PHP-Worker:

```bash
DW_V2_CURRENT_COMPATIBILITY=orders-2026-04-28
DW_V2_SUPPORTED_COMPATIBILITIES=orders-2026-04-28,orders-2026-04-21
```

`DW_V2_CURRENT_COMPATIBILITY` benennt die Familie, an die neue Läufe gebunden
werden. `DW_V2_SUPPORTED_COMPATIBILITIES` nennt die Familien, die dieser Worker
während eines Rollouts oder Rollbacks noch übernehmen darf. Verwenden Sie `*`
nur für Flotten mit einem Build oder eng begrenzte Testumgebungen, nicht um eine
unklare Rollout-Richtlinie zu verbergen.

Registrieren Sie bei Workern für den eigenständigen Server eine stabile
`build_id` und verwenden Sie die Build-ID-Rollout-APIs, um Kohorten gezielt zu
leeren oder fortzusetzen.

## Sicheres Rollout-Muster {#safe-rollout-pattern}

Verwenden Sie diese Reihenfolge bei kompatibilitätsrelevanten Worker-Änderungen:

1. Starten Sie die neue Worker-Kohorte mit neuer Build-ID oder neuem Kompatibilitätsmarker.
2. Lassen Sie die alte Kohorte laufen, bis feststeht, dass die neue Arbeit übernehmen kann.
3. Leeren Sie die alte Kohorte, sodass sie keine neuen Tasks annimmt, bereits
   geleaste Arbeit aber abschließen oder freigeben kann.
4. Beobachten Sie Kompatibilitäts- und Task-Warteschlangenansichten, bis die
   alte Kohorte nicht mehr benötigt wird.
5. Setzen Sie die alte Kohorte nur fort, wenn ein Rollback nötig ist.

Halten Sie die Kompatibilitätsfamilie bei Replay-kompatiblen Neubauten stabil.
Ändern Sie sie nur, wenn neue Worker keine Tasks mehr übernehmen dürfen, die
unter der älteren Familie erstellt wurden.

## Expliziter Zustand bei fehlendem Worker {#explicit-missing-worker-state}

Kann kein Worker die erforderliche Kompatibilitätsfamilie erfüllen, muss
Durable Workflow dies klar zeigen:

- Zusammenfassungen der Worker-Flotte zeigen, dass die erforderliche Kompatibilität nicht abgedeckt ist.
- Task-Warteschlangen- und Rollout-Ansichten zeigen aktive, auslaufende, veraltete
  oder verschwundene Build-Kohorten.
- Workflow-Diagnosen zeigen, dass der Lauf auf einen kompatiblen Worker wartet.
- Betriebszustand und Metriken weisen kompatibilitätsblockierte Arbeit als benannten Zustand aus.

Dies ist das erwartete Signal bei einem teilweisen Rollout oder unvollständigen
Rollback. Behandeln Sie es als echten zu behebenden Betriebszustand, nicht als
zufällige vorübergehende Störung.

## Beziehung zu Build-ID-Rollouts {#how-this-relates-to-build-id-rollouts}

Build-ID-Rollout-Zustand und Kompatibilitätsrouting lösen unterschiedliche Probleme:

- **Build-ID-Rollout** zeigt dem Betrieb lebende Worker-Kohorten und erlaubt,
  diese gezielt zu leeren oder fortzusetzen.
- **Kompatibilitätsrouting** entscheidet, ob ein bestimmter laufender Task
  auf einem bestimmten Worker ausgeführt werden darf.

Gewöhnlich nutzen Sie beides zusammen. Build-ID-Kohorten zeigen verfügbare
Executors, während Kompatibilitätsrouting sicherstellt, dass lang laufende
Arbeit nur bei einer kompatiblen Kohorte landet.

## Verwandte Referenzen {#related-references}

- [Namespace, Authentifizierung und Worker-Registrierung](/docs/polyglot/namespace-auth-workers)
  für die Registrierungsnutzlast einschließlich `build_id`
- [Worker-Build-ID-Rollout](/docs/polyglot/worker-build-id-rollout) für den
  Lebenszyklus von Leeren/Fortsetzen einer Task-Warteschlange
- [Server-Konfigurationsreferenz](/docs/polyglot/server-config-reference) für
  `DW_V2_CURRENT_COMPATIBILITY`, `DW_V2_SUPPORTED_COMPATIBILITIES` und verwandte Einstellungen
- [Betriebsrahmen für Betreiber](/docs/operator-operating-envelope) für
  Zustandsanzeigen, Metriken und Laufdiagnosen, die Kompatibilitätslücken sichtbar machen
