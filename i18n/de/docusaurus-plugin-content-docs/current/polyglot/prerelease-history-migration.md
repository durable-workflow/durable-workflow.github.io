---
title: Aufbewahrten Vorabversionsverlauf migrieren
sidebar_label: Migration des Vorabversionsverlaufs
---

# Aufbewahrten Vorabversionsverlauf migrieren {#migrate-retained-prerelease-history}

Verwenden Sie dieses Offline-Verfahren, wenn eine reine Avro-Bereitstellung von
Durable Workflow 2.0 für aus einer früheren öffentlichen 2.0-Vorabversion
aufbewahrten Zustand `unsupported_payload_codec` meldet. Es konvertiert die
bekannten Darstellungen mit JSON-Tag, ohne Tag und mit veraltetem Avro Value,
ohne einen alten Codec für eine laufende v2-Anwendung verfügbar zu machen.

Verwenden Sie keinen Verlaufsexport als Ersatz für dieses Verfahren. Ein Export
ist eine portable Kopie eines Laufs. Er ändert nicht die Datenbankzeilen, die
beim Start der Bereitstellung geprüft werden. Löschen Sie niemals Verlauf, um
die Vorabprüfung zu bestehen.

## Entscheiden, was konvertiert werden muss {#decide-what-must-be-converted}

Noch aktive Läufe können auf der aktuell bereitgestellten Vorabversion enden.
Lassen Sie sie vor dem Wartungsfenster auslaufen, wenn dies betrieblich sicher
ist. Terminale Läufe, für Replay aufbewahrte geschlossene Ausführungen und
Zustand, der nicht auslaufen kann, müssen konvertiert werden. Die Migration
inventarisiert beide Gruppen und löscht keine davon.

Der Probelauf umfasst die vom Protokoll verwalteten Oberflächen, die Server
beim Start prüft:

- Workflow-Eingaben und -Ausgaben, Aktivitätsnutzlasten, Befehle, Signale,
  Updates, Dienstaufrufe, Update-Validierungs-Tasks und dauerhafte Stream-Referenzen;
- Inline-Einzelobjektrahmen und die expliziten Nutzlast-Envelopes, die in
  Verlaufsereignissen verschachtelt sind; und
- extern gespeicherte Nutzlastreferenzen, einschließlich Referenzstruktur,
  Codec, Objektverfügbarkeit, Byte-Länge und SHA-256-Integrität.

Kundeneigene Maps für Memo, Suchattribute, Kontext und Diagnose sind keine
Codec-Deklarationen und bleiben unverändert. Unbekannte Codecs, unbekannte
Schema-Fingerabdrücke, beschädigte Referenzen und Werte, die das feste
Avro-Value-Schema nicht darstellen kann, werden als unsicher gemeldet. Ein
unsicherer Befund blockiert die Anwendung der Migration.

## Zuständigkeitsgrenze {#ownership-boundary}

Der Befehl gehört zum Workflow-PHP-Paket. Er muss aber in dem Prozess laufen,
der die Datenbankverbindung und die Konfiguration externer Nutzlasten verwaltet:

- **Eingebettetes Laravel:** Installieren Sie das Ziel-Workflow-Paket im
  Anwendungs-Checkout. Führen Sie dann den `php artisan`-Befehl der Anwendung
  aus, während deren Web-, Warteschlangen-, Scheduler- und Wartungsprozesse gestoppt sind.
- **Eigenständiger Server:** Verwenden Sie eine einmalige Shell oder einen Job
  aus dem Ziel-Server-Image, mit derselben Datenbank, Namespace-Konfiguration,
  denselben Zugangsdaten und externen Nutzlast-Mounts wie die Bereitstellung.
  Lassen Sie den normalen Bootstrap-Hook und alle Server-Prozesse gestoppt,
  bis die Konvertierung erfolgreich ist.

Richten Sie keinen fremden Anwendungs-Checkout auf die Datenbank. Die
Namespace-Speicherrichtlinie gehört zur Integritätsprüfung. Kann ein Prozess ein
externes Objekt nicht lesen, meldet er es als unsicher, statt zu raten.

## Reihenfolge der Bereitstellung {#deployment-order}

1. Halten Sie die alte Vorabversion lange genug bereit, um ausgewählte aktive
   Läufe auslaufen zu lassen. Stoppen Sie danach alle Datenbankschreiber:
   API-Knoten, Worker, Scheduler, Bootstrap- und Wartungsjobs.
2. Erstellen Sie die gemäß Ihrer normalen Wiederherstellungsrichtlinie nötigen
   Snapshots der Datenbank und des externen Objektspeichers. Bewahren Sie das
   alte Anwendungs- oder Server-Artefakt auf.
3. Installieren oder laden Sie das Zielartefakt mit
   `workflow:v2:migrate-prerelease-history`, starten Sie es aber nicht. Führen
   Sie die Probeinventur aus diesem Artefakt aus:

   ```bash
   php artisan workflow:v2:migrate-prerelease-history --dry-run --json
   ```

   Exit-Code null bedeutet, dass jeder betroffene Wert sicher konvertierbar ist.
   Prüfen Sie die Pfade und betroffenen Lauf-IDs. Ein von null verschiedener
   Exit-Code mit `unsafe_fields` größer als null blockiert das Upgrade. Korrigieren
   Sie den Speicherzugriff oder bleiben Sie auf der alten Vorabversion.
4. Wählen Sie einen neuen privaten Sicherungspfad und ein neues privates
   Nachweisverzeichnis auf dauerhaftem Speicher. Beide dürfen noch nicht
   existieren. Wenden Sie die Migration einmal an:

   ```bash
   php artisan workflow:v2:migrate-prerelease-history \
     --backup=/secure/dw-prerelease-history-backup.json \
     --evidence-dir=/secure/dw-prerelease-history-evidence
   ```

   Der Befehl schreibt die Sicherung vor Beginn der Updates und verweigert das
   Überschreiben von Nachweisen. Er sperrt und aktualisiert Datenbankzeilen in
   einer Transaktion, erhält Workflow- und Laufidentitäten, prüft Hashes und
   Größen externer Objekte und behält jedes ursprüngliche externe Objekt bei.
   Externe Ersatzobjekte sind inhaltsadressierte Avro-Kopien. Kein Verlauf wird gelöscht.
5. Warten Sie auf das Ende des Befehls. Er exportiert jeden betroffenen
   aufbewahrten Lauf und führt einen strikten Replay aus, baut dessen
   Zusammenfassungs-, Warte-, Zeitachsen-, Timer- und Abstammungsprojektionen
   neu auf, prüft diese auf Abweichungen und wiederholt die Nutzlastinventur.
   Erfolg setzt alle drei Prüfungen voraus. Bewahren Sie die erzeugten Replay-
   und Projektionsberichte mit der Sicherung auf.
6. Führen Sie den normalen Ziel-Bootstrap erst nach erfolgreicher Migration aus:

   ```bash
   php artisan server:bootstrap --force
   ```

   Führen Sie bei eingebettetem Laravel stattdessen das normale Migrations-/Bootstrap-Verfahren
   der Anwendung aus. Die Vorabprüfung auf ausschließlich Avro-Nutzlasten muss
   fehlerfrei sein, bevor ein neuer Worker, API-Knoten, Scheduler oder Wartungsprozess startet.
7. Starten Sie die Zielbereitstellung und prüfen Sie Bereitschaft und einen
   Replay oder eine Abfrage eines aufbewahrten Laufs über die normale
   Betriebsoberfläche. Bewahren Sie das Migrationspaket für die Dauer des Rollback-Fensters auf.

## Rollback {#rollback}

Schlagen Anwendung, Replay, Projektionsprüfung oder Nachprüfung fehl, ist das
Upgrade blockiert. Lassen Sie alle Schreiber gestoppt und führen Sie den von
der Migration ausgegebenen Rollback-Befehl aus. Mit den obigen Pfaden lautet er:

```bash
php artisan workflow:v2:migrate-prerelease-history \
  --rollback-from=/secure/dw-prerelease-history-backup.json \
  --evidence-dir=/secure/dw-prerelease-history-evidence
```

Rollback prüft den Sicherungs-Hash und den Migrationszustand, verweigert das
Überschreiben von Rollback-Nachweisen und stellt keine Zeile wieder her, die
nach der Konvertierung geändert wurde. Es stellt die ursprünglichen
Datenbankwerte atomar wieder her und behält externe Ersatzobjekte als Nachweis.
Stellen Sie anschließend das vorherige Anwendungs- oder Server-Artefakt wieder
her. Verweigert Rollback die Ausführung, weil ein anderer Schreiber Zustand
geändert hat, lassen Sie das Upgrade blockiert und stellen Sie den koordinierten
Datenbank- und Objektspeicher-Snapshot aus Schritt 2 wieder her.

Nach dem Rollback wird die reine Avro-Bereitstellung erwartungsgemäß erneut an
der Vorabprüfung scheitern. Beheben Sie den gemeldeten unsicheren Zustand,
erstellen Sie neue Sicherungs- und Nachweispfade und wiederholen Sie das
vollständige Verfahren, bevor Sie das Upgrade erneut versuchen.
