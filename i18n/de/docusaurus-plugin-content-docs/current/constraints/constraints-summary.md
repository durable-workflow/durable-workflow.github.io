---
sidebar_position: 4
description: Was Workflow- und Aktivitätscode tun darf.
---

# Übersicht der Einschränkungen {#constraints-summary}

| Einschränkung | Workflow-Code | Aktivitätscode |
| --- | --- | --- |
| Ein-/Ausgabe | Nicht erlaubt | Erlaubt |
| Veränderliche globale Variablen | Nicht erlaubt | Erlaubt |
| Nichtdeterministische Funktionen | Nicht erlaubt | Erlaubt |
| `Carbon::now()` | Nicht erlaubt | Erlaubt |
| `sleep()` | Nicht erlaubt | Erlaubt |
| Externe Seiteneffekte | In Aktivitäten verlagern | Nur erlaubt, wenn sicher wiederholbar |

Workflow-Code muss deterministisch sein, weil die Engine den Workflow-Zustand
durch Replay des Verlaufs dauerhafter Schritte rekonstruiert. Sie ruft den
Workflow-Rumpf erneut auf, nicht die Aktivitäten. Trifft der Rumpf beim Replay
andere Entscheidungen, kann die Engine den Zustand nicht rekonstruieren und die
Ausführung nicht korrekt fortsetzen. Der Workflow-Rumpf muss nicht idempotent
sein. Determinismus ist die Anforderung für das Replay.

Aktivitäten müssen idempotent sein, weil ihre Ausführung mindestens einmal
erfolgt. Wiederholungen, abgelaufene Leases und erneute Zustellungen können dazu
führen, dass derselbe Versuch mehrfach beobachtet wird. Das ist vorgesehenes
Verhalten und kein Fehler. Machen Sie den Aktivitätsrumpf oder sein externes
Ziel durch einen Idempotenzschlüssel, eine deterministische Zielressource oder
eine von Natur aus idempotente Operation sicher wiederholbar. So erzeugen
doppelte Ausführungen keine doppelten Seiteneffekte.

Einen direkten Vergleich mit Beispielen, die beide Eigenschaften voneinander
trennen, finden Sie unter
[Idempotente und deterministische Workflows](/docs/constraints/idempotent-vs-deterministic/).

Den öffentlichen v2-Vertrag hinter diesen Begriffen beschreibt
[Ausführungsgarantien und Idempotenz](./execution-guarantees.md).
