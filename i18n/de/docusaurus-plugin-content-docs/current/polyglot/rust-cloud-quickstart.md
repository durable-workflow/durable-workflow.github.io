---
sidebar_position: 4
title: Rust-Cloud-Schnellstart
description: Die gemeinsame Rust-Testumgebung der Sample App mit einem bereitgestellten Durable-Workflow-Cloud-Namespace ausführen.
tags:
  - Rust
  - Cloud
  - quickstart
  - workers
keywords:
  - Rust-Cloud-Schnellstart
  - Namespace-Laufzeit-URL
  - Rust-Worker
  - Sample-App-Testumgebung
---

# Rust-Cloud-Schnellstart {#rust-cloud-quickstart}

:::caution Kontrollierter Vorabzugang

Durable Workflow Cloud ist über einen kontrollierten Vorabzugang verfügbar.
Verwenden Sie diesen Leitfaden erst, nachdem Cloud einen Namespace und zwei
rollenspezifische Laufzeit-Zugangsdaten bereitgestellt hat. Der allgemein
verfügbare Rust-Einstieg benötigt Cloud nicht. Beginnen Sie mit dem
[Rust-SDK-Leitfaden](./rust.md) oder führen Sie `scripts/playground rust` gegen
die standardmäßige lokale Laufzeitumgebung der Testumgebung aus.

:::

Die Sample App bietet eine symmetrische Testumgebung für PHP, Python und Rust.
Diese Seite wählt Rust und ändert nur das Laufzeitziel. Die entsprechenden
SDK-Wege für [PHP](./php.md) und [Python](./python.md) verwenden denselben Befehl
mit `php` oder `python`. Der [Testumgebungsvertrag der Sample App](https://github.com/durable-workflow/sample-app/blob/main/README.md#symmetric-sdk-playground)
dokumentiert alle drei Möglichkeiten.

Die Testumgebung ermittelt die aktuellen stabilen Artefaktversionen aus den
maschinenverwalteten Metadaten der Sample App. Verwenden Sie diese erzeugten
Versionen, statt Versionsnummern in diese Befehle zu kopieren oder einen
separaten SDK-Installationsschritt hinzuzufügen.

## 1. Die vorbereitete Sample App öffnen {#1-open-the-prepared-sample-app}

[Erstellen Sie einen Codespace aus dem `main`-Branch der Sample App](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main),
warten Sie auf das Ende der Einrichtung und öffnen Sie ein Terminal im
Repository-Stamm. Das vorbereitete Image enthält die SDK-Werkzeugketten und
`dw`, die die gemeinsame Testumgebung benötigt.

Cloud liefert Laufzeit-URL, Laufzeit-Namespace und zwei Rollen-Zugangsdaten.
Wählen Sie eine Task-Warteschlange für die Anwendung. Exportieren Sie diese
Platzhalter erst, nachdem Sie sie durch die entsprechenden Werte ersetzt haben:

```bash
export DURABLE_WORKFLOW_RUNTIME_URL='<provisioned-runtime-url>'
export DURABLE_WORKFLOW_RUNTIME_NAMESPACE='<provisioned-runtime-namespace>'
export DURABLE_WORKFLOW_CLIENT_TOKEN='<client-runtime-credential>'
export DURABLE_WORKFLOW_WORKER_TOKEN='<worker-runtime-credential>'
export DURABLE_WORKFLOW_TASK_QUEUE='<rust-task-queue>'
```

Die Laufzeit-URL ist die von Cloud zurückgegebene Namespace-Laufzeitwurzel.
Sie muss eine absolute HTTPS-URL ohne Abfrage, Fragment oder abschließendes
`/api` sein. SDK und CLI hängen ihre eigenen API-Routen an. Der
Laufzeit-Namespace ist der separat mit dieser URL zurückgegebene Wert, kein aus
ihrem Pfad abgeleiteter Name.

Die Client-Zugangsdaten starten, beschreiben und lesen Workflows. Die
Worker-Zugangsdaten registrieren, fragen Tasks ab, senden Heartbeats und
schließen Tasks ab. Es müssen unterschiedliche rollenspezifische Geheimnisse
sein, obwohl dieser eine Befehl beide Kindprozesse startet. Ein
Cloud-Verwaltungsschlüssel verwaltet Namespaces und Zugangsdaten. Exportieren
oder übergeben Sie ihn nicht als Laufzeit-Zugangsdaten einer der Rollen.

## 2. Den Rust-Ablauf ausführen {#2-run-the-rust-journey}

Führen Sie den gemeinsamen Vertrag für eine externe Laufzeitumgebung aus:

```bash
scripts/playground rust --runtime managed \
  --runtime-url "$DURABLE_WORKFLOW_RUNTIME_URL" \
  --namespace "$DURABLE_WORKFLOW_RUNTIME_NAMESPACE" \
  --task-queue "$DURABLE_WORKFLOW_TASK_QUEUE"
```

Der Befehl erzeugt fehlende Dateien unter `.playground/rust`, ohne Quellcode des
Aufrufers zu ersetzen. Er gibt den effektiven Workflow-Typ, Aktivitätstyp, die
Warteschlange, Worker- und Client-Befehle, Eingabe und erwartetes Ergebnis aus,
bevor er etwas startet. Der Worker erhält nur die Worker-Zugangsdaten. Erst
nachdem seine genaue Registrierung sichtbar wird, erhält der Client nur die
Client-Zugangsdaten.

Das Warten auf die Registrierung ist auf 60 Sekunden begrenzt. Werten Sie den
bloßen Prozessstart nicht als Bereitschaft. Fahren Sie erst fort, nachdem der
Befehl einen Checkpoint dieser Form ausgibt (Identitäten sind Beispiele):

```text
Worker ready: target=managed runtime_url=<provisioned-runtime-url> namespace=<provisioned-runtime-namespace> id=<worker-id> queue=<rust-task-queue> workflow_type=sample-app.playground.rust.authored-workflow activity_type=sample-app.playground.rust.authored-activity
```

Derselbe Befehl startet einen Workflow, wartet bis zu 120 Sekunden auf das
SDK-Client-Ergebnis, bestätigt `status=completed` mit `dw` und prüft die nötige
Workflow- und Aktivitätshistorie. Ein erfolgreiches Ergebnis sieht so aus:

```text
Completed rust workflow <workflow-id>: {"greeting":"Hello, Durable Workflow, from the Sample App Rust playground","input":{"name":"Durable Workflow"},"activity_runtime":"rust","workflow_runtime":"rust"}
```

Die abschließende Zeile `Playground success` wiederholt Laufzeitziel, Namespace,
Warteschlange, registrierte Typen und erwartete Ergebnisstruktur ohne geheime
Zugangsdaten. Der Befehl schreibt außerdem
`storage/app/playground-rust-evidence.json` mit den ausgewählten Artefaktversionen,
der genauen Registrierung, Workflow-/Laufidentität, dem Status `completed`,
Ergebnis und Historien-Ereignistypen. Managed Waterline bleibt die
Betriebsoberfläche für den bereitgestellten Namespace. Der verwaltete Ablauf
startet keinen lokalen Server und kein lokales Waterline.

## Begrenzte Diagnose {#bounded-diagnosis}

Erscheint der Checkpoint `Worker ready` nicht innerhalb von 60 Sekunden,
beginnen Sie mit dem effektiven Vertrag, der über dem Fehler ausgegeben wird:

- **Abweichende Warteschlange:** Der Runner fragt den genauen an `--task-queue`
  übergebenen Wert ab. Bestätigen Sie, dass Cloud diese Warteschlange zulässt
  und die ausgegebene Registrierung denselben Wert verwendet. Führen Sie dann
  denselben Befehl erneut aus.
- **Abweichender Typ:** Der Fehler nennt die Workflow- und Aktivitätstypen,
  die der Worker melden muss. Vergleichen Sie sie mit dem effektiven Vertrag.
  Enthalten eigene Dateien ältere fest codierte Registrierungen, aktualisieren
  Sie sie oder prüfen Sie das aktuelle Gerüst in einem neuen Verzeichnis mit
  `--source "$HOME/durable-rust-worker"`.
- **Abweichende Zugangsdatenrolle:** Autorisierungsfehler vor der Registrierung
  deuten auf die Worker-Zugangsdaten, Fehler beim Beschreiben oder Starten des
  Laufs auf die Client-Zugangsdaten. Vertauschen Sie die Werte nicht und
  ersetzen Sie keinen davon durch einen Cloud-Verwaltungsschlüssel.
- **Abweichende Laufzeitumgebung:** Beide Rollen müssen die genaue
  bereitgestellte Laufzeit-URL und den Laufzeit-Namespace nutzen. Entfernen
  Sie ein abschließendes `/api`. Setzen Sie weder die Cloud-Verwaltungs-URL
  noch die URL eines selbst gehosteten Servers ein.

Ist die Registrierung erfolgreich, aber der Abschluss schlägt fehl, bewahren
Sie die ausgegebene Workflow-/Laufidentität auf. Untersuchen Sie diesen
gewählten Lauf in Managed Waterline und vergleichen Sie seinen ausstehenden
Workflow- oder Aktivitätstyp und seine Task-Warteschlange mit dem effektiven
Vertrag. Beheben Sie die Abweichung, bevor Sie einen weiteren Lauf starten.
Der aufbewahrte Nachweispfad und die begrenzte Worker-Ausgabe zeigen, ob
Client-Ergebnis, dauerhafter Status, erwartetes Ergebnis oder erforderliche
Historienprüfung fehlgeschlagen sind.

Kehren Sie zum umfassenderen [Rust-SDK-Leitfaden](./rust.md) zurück oder nutzen
Sie die generierte [Rust-API-Referenz](https://rust.durable-workflow.com/durable_workflow/)
für einzelne Typen und Methoden.
