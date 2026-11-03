---
title: "Workloads zwischen Laufzeiten verschieben"
description: "Bestehende Läufe beenden lassen und neue Starts zwischen selbst gehosteten Servern und Cloud verlagern."
tags:
  - migration
  - operations
  - polyglot
---

# Workloads zwischen Laufzeiten verschieben

Leiten Sie neue Starts zum Ziel, während bestehende Läufe auf ihrer Quelle enden. Dieses Verfahren gilt für unabhängige Laufzeiten im Service-Modus. Ein Verlaufsexport erhält Nachweise, überträgt aber keinen laufenden Server-Lauf. Der unterstützte [Embedded-v2-Import](./embedded-to-server.md#phase-e-import-eligible-embedded-v2-runs) akzeptiert nur geeignete Embedded-Quellen.

## Ziel auswählen {#paths}

| Wechsel | Zielvorbereitung |
| --- | --- |
| Selbst gehosteter Server zu anderem selbst gehosteten Server | Stellen Sie das Ziel mit eigener maßgeblicher Datenbank, Payload-Speicher und Zugangsdaten bereit. Folgen Sie der [Bereitstellungsanleitung](../deployment.md). |
| Selbst gehosteter Server zu Cloud | Stellen Sie den Ziel-Namespace bereit und prüfen Sie zurückgegebene Laufzeit-URL, Zugangsdaten und Fähigkeiten. Folgen Sie der [Cloud-Einrichtung](./cloud-control-plane.md). |
| Cloud zu selbst gehostetem Server | Bereiten Sie Ziel und SDK-Worker vor, bevor Sie den Anwendungsverkehr ändern. Lassen Sie die Cloud-Quelle bereitgestellt, während ihre Läufe enden. |

## Beide Laufzeiten vorbereiten {#prepare}

Erfassen Sie Quell-Endpunkt, Namespace, Workflow-Instanz- und Lauf-ID, Task Queue, Workflow-/Activity-Typen und Payload-Speicherabhängigkeiten. Erhalten Sie einen getesteten Wiederherstellungsweg für selbst gehosteten Speicher. Ein Cloud-Wechsel gewährt keinen Zugriff auf ein Datenbankbackup und kopiert keine Cloud-Zugangsdaten zum Ziel. Prüfen Sie tatsächliche Zielversion und Fähigkeiten, Rollen-Zugangsdaten, Worker-Registrierungen und gemeldete Typen.

## Neue Starts in kleinen Gruppen umstellen {#cutover}

1. Betreiben Sie Ziel und Worker neben der Quelle. Schließen Sie einen eindeutig identifizierten Canary-Lauf mit repräsentativen Activities und Ergebnissen ab. Trennen Sie seine Auswirkungen von echten Geschäftsvorgängen.
2. Erfassen Sie alle Startquellen: Anwendungsaufrufe, Zeitpläne, Webhook-/Bridge-Adapter und Service-Aufrufe. Wählen Sie einen Umschaltpunkt für eine Workflow-Familie. Stimmen Sie Zeitplanpausen und Zielregistrierung so ab, dass beide Laufzeiten nicht denselben Termin starten.
3. Leiten Sie neue Starts dieser Familie zum Ziel. Halten Sie in der Anwendung fest, welcher Endpunkt und Namespace jeden Workflow angenommen hat. Ein erneut verwendeter Geschäftsschlüssel auf einer anderen Laufzeit bietet keine laufzeitübergreifende Deduplizierung.
4. Leiten Sie Signale, Freigaben, Updates, Abfragen, Abbrüche sowie Ergebnis- und Verlaufsabrufe weiter zur zuständigen Laufzeit. Erhalten Sie Quell-Worker, Queues, Timer, Zugangsdaten und Payload-Zugriff. Eine geänderte Client-URL verschiebt weder angenommene Arbeit noch deren Activity-Leases.
5. Prüfen Sie Ergebnisse und Fehler vor der nächsten Familie. Bei ungewissem Startergebnis durch Transportfehler klären Sie es zuerst auf der ursprünglichen Laufzeit, bevor Sie anderswo starten. Ein langlebiger Lauf ohne Endzustand ist noch nicht abgeschlossen.

## Nachweise vor der Stilllegung sichern {#preserve-evidence}

Exportieren Sie den aufzubewahrenden Verlauf einschließlich aller erforderlichen Fortsetzungsläufe, ursprünglichen Payload-Bytes und Codecs. Prüfen Sie Vollständigkeit und Integrität mit einem kompatiblen Verbraucher und bewahren Sie die genaue Erzeugeridentität auf. Die [Anleitung zu Verlaufsexport und Replay](../testing.md#service-sdk-replay) erklärt die getrennten Prüfungen. Audit-Exporte erlauben keinen Import laufenden Server-Zustands.

Prüfen Sie den Erzeuger, der den Export tatsächlich liefert. Core 2.11.4 allein qualifiziert keine Server-, mitgelieferten CLI-, SDK-HTTP- oder Cloud-Exporte. Beachten Sie die separate [Qualifikation des Server-HTTP-Erzeugers und Images](https://github.com/durable-workflow/server/issues/692). Alte verlustbehaftete Bundles bleiben ungültig. Ändern Sie weder Zahlen noch Prüfsummen, um die Annahme zu erzwingen, und zerstören Sie die maßgebliche Quelle nicht, solange erforderliche Nachweise fehlen oder nicht prüfbar sind.

## Quelle zuletzt stilllegen {#retire-source}

Bestätigen Sie für alle relevanten Namespaces und alle Listenseiten, dass keine nicht terminalen Quell-Läufe verbleiben. Berücksichtigen Sie wartende Eltern/Kinder und Läufe verbleibender Startquellen. Ein gesunder Endpunkt, eine leere erste Seite oder fehlende Metriken beweisen keine leere Arbeitsmenge. Prüfen Sie, dass keine Aufrufer, Callbacks oder Worker mehr von der Quelle abhängen und erforderliche Archive lesbar sind.

Entfernen Sie erst dann selbst gehostete Ressourcen oder deprovisionieren Sie die Cloud-Laufzeit. Cloud-Kapazitätskosten laufen weiter, solange sie bereitgestellt ist, auch im Leerlauf oder beim Auslaufen. Die Deprovisionierung entfernt aktive Laufzeitdaten und Zugangsdaten und ist keine Pause mit Fortsetzung. Es gelten die zurückgegebenen Bedingungen des bestehenden Plans; dieses Verfahren schafft weder automatische Erstattung noch Abrechnungsausnahme.

## Routing zurücknehmen, ohne Läufe zu verschieben {#rollback}

Leiten Sie künftige Starts nur zu einer gesunden, kompatiblen Quelle zurück. Vom Ziel bereits angenommene Läufe bleiben dort und benötigen dessen Worker und Befehlsrouting bis zum Endzustand. Erhalten Sie beide Zuständigkeitsverzeichnisse und verhindern Sie doppelte Starts. Stellen Sie keinen alten Quellspeicher über neuerem angenommenem Zustand wieder her und starten Sie keine zweite aktive Kopie eines Laufs.
