---
sidebar_position: 1
---

# Überblick {#overview}

Workflows und Aktivitäten liegen auf unterschiedlichen Seiten der Grenze zur dauerhaften Speicherung. Daher gelten unterschiedliche Regeln. Workflow-Code wird per **Replay** erneut durchlaufen. Aktivitäten werden bei Bedarf durch **neue Versuche** ausgeführt. Aus diesem Unterschied ergeben sich die folgenden Einschränkungen.

Der Vergleich [Idempotente und deterministische Workflows](/docs/constraints/idempotent-vs-deterministic/) zeigt mit konkreten Beispielen, warum keine der beiden Eigenschaften die andere voraussetzt.

- **Workflow-Code muss deterministisch sein.** Die Engine rekonstruiert den Zustand durch Replay der Historie, wenn ein Workflow fortgesetzt wird. Das kann auf einem anderen Worker, nach einem Neustart, nach einer Bereitstellung oder während einer langen Ausführung geschehen. Replay ruft den Workflow-Code erneut auf. Aktivitäten werden dabei nicht erneut ausgeführt. Für dieselbe Historie muss der Workflow immer dieselben Entscheidungen in derselben Reihenfolge erzeugen. Direkte Zugriffe auf die aktuelle Uhrzeit, den Cache, Zufallszahlen, das Netzwerk oder andere veränderliche Quellen sind im Workflow-Code verboten. Nutzen Sie [`Workflow::now()`](../defining-workflows/workflow-api.md), [`sideEffect(...)`](../features/side-effects.md), Aktivitäten und ähnliche Hilfsfunktionen, um diese Grenze sicher zu überschreiten.

- **Aktivitätscode muss idempotent sein.** Aktivitätsversuche werden **mindestens einmal** ausgeführt. Wiederholungsversuche, abgelaufene Leases und erneute Zustellung können dazu führen, dass dieselbe logische Arbeit mehrmals ausgeführt wird. Das gehört zum normalen Verhalten. Die dauerhafte Zustandsschicht speichert höchstens ein abschließendes Ergebnis pro Versuch. Ein Aktivitätskörper kann jedoch bereits mehrmals gestartet sein, bevor die Engine den maßgeblichen Bericht erhält. Verwenden Sie einen Idempotenzschlüssel, eine deterministische Zielressource oder eine von sich aus idempotente Operation, damit externe Nebenwirkungen nicht doppelt entstehen.

- **Event Sourcing speichert die Historie.** Jeder dauerhafte Schritt wird als typisiertes Ereignis gespeichert, etwa der Abschluss einer Aktivität, das Auslösen eines Timers, der Empfang eines Signals oder das Ergebnis eines Side Effects. Replay liest diese Historie und gibt gespeicherte Ergebnisse an den Workflow-Code zurück. Es versendet bereits gespeicherte Aktivitäten, Timer oder Signale nicht erneut. Für eine bestimmte Kennung erscheinen dauerhafte Zustandsereignisse genau einmal in der Historie, auch wenn der Transport Arbeit mehrfach zugestellt hat.

Zusammen ermöglichen Determinismus und Idempotenz die Fortsetzung über Bereitstellungen, Worker-Neustarts und verteilte Wiederholungsversuche hinweg. Der Workflow behält seine Position. Externe Nebenwirkungen, deren Wiederholung die Anwendung abgesichert hat, werden nicht doppelt erzeugt.

Die [Ausführungsgarantien und Idempotenz](./execution-guarantees.md) beschreiben den öffentlichen v2-Vertrag für Replay, erneute Zustellung, abgelaufene Leases und einmalige Historieneinträge. Die [Workflow-Einschränkungen](./workflow-constraints.md) erklären die Regeln für deterministisches Replay. Die [Aktivitäts-Einschränkungen](./activity-constraints.md) zeigen, wie mindestens einmal ausgeführte Aktivitäten sicher bleiben.
