---
sidebar_position: 9
tags:
  - sample-app
  - contributing
  - patterns
keywords:
  - Beispiel beitragen
  - Durable Workflow Beispielbeitrag
  - sample-request Ablauf
  - externer Beispiel-Workflow
---

# Ein Beispiel beitragen {#contribute-a-sample}

Die [Beispielanwendung](/docs/sample-app) ist der maßgebliche Ort, um zu zeigen, wie ein Durable-Workflow-Muster in einem echten Laravel-Projekt aussieht. Wenn Sie ein Muster haben, das anderen Entwicklern hilft, führt dieser Leitfaden bis zur Aufnahme: etwa eine bisher nicht gezeigte Saga-Form, eine andere Nutzung von Nachrichtenströmen oder eine Integration mit einem Werkzeug, das die bestehenden Beispiele nicht abdecken.

Der Vertrag ist bewusst kurz. Ein Beispiel, das ihn einhält, wird in einem vorhersehbaren Rhythmus aufgenommen. Fehlen Teile, bleibt es in der Prüfung, bis die Lücken geschlossen sind.

## Bevor Sie Code schreiben {#before-you-write-code}

1. **Öffnen Sie zuerst ein `sample-request`-Issue.** Die [Vorlage `sample-request`](https://github.com/durable-workflow/sample-app/issues/new/choose) nennt den Musterbereich, die öffentliche Dokumentationsseite mit seiner Definition und die mindestens benötigte Durable-Workflow-Paketversion. Im Issue einigen sich Maintainer und Beitragender darauf, dass sich die Aufnahme lohnt, *bevor* der Beitragende in einen PR investiert.
2. **Wählen Sie ein Muster, das im Beispielindex noch nicht vorhanden ist.** Der [Beispielindex in der README](https://github.com/durable-workflow/sample-app#sample-index) nennt alle abgedeckten Muster. Ist Ihre Idee nur „eine andere Schreibweise des einfachen Workflows“, ist sie eine Dokumentationsanpassung an `App\Workflows\Simple\SimpleWorkflow` und kein neues Beispiel.
3. **Suchen Sie die ähnlichste vorhandene Workflow-Klasse.** Ein neues Beispiel sollte sich wie sein Nachbar lesen: gleiche Verzeichnisstruktur unter `app/Workflows/<Pattern>/`, gleiche Form des Artisan-Befehls und gleicher Testansatz. Beispiele mit neuartigem Grundgerüst werden auch dann abgelehnt, wenn das gezeigte Muster gut ist.

## Merkmale eines aufgenommenen Beispiels {#what-a-merged-sample-looks-like}

Ein aufgenommenes Beispiel ist *ausführbar*, *lehrreich*, *getestet* und *sichtbar*. Daraus ergeben sich vier konkrete Artefakte im Sample-App-Repository:

1. **Eine Workflow-Klasse** unter `app/Workflows/<Pattern>/`, die das Muster vollständig zeigt. Workflow-Code bleibt deterministisch: Uhrzeitabfragen hinter `sideEffect()`, externe Arbeit in Aktivitäten, Wartezustände über Signale, Updates, Timer oder Nachrichtenströme. Die Workflow-Klasse kompiliert ohne `OPENAI_API_KEY` oder andere externe Zugangsdaten, sofern das Muster diese nicht ausdrücklich benötigt.
2. **Ein Artisan-Befehl**, der den Workflow mit realistischen Eingaben startet, sodass Leser einen Befehl ausführen und die Ausführung in Waterline beobachten können. Der Befehl steht neben den entsprechenden Artisan-Befehlen in `routes/console.php` oder dem entsprechenden Registrierungseintrag und folgt derselben Namenskonvention (`app:<short-pattern>`).
3. **Ein Eintrag in `config/workflow_mcp.php`**, der Workflow-Klasse, Muster, Befehl, erforderliche Zugangsdaten und Argumente nennt. Dieser Eintrag macht das Beispiel über den MCP-Server auffindbar. Die Upstream-Abdeckungsprüfung markiert eine Abdeckungszeile erst dann als `covered`, wenn der Eintrag vorhanden ist.
4. **Ein Test unter `tests/`**, der den Workflow gegen den v2-In-Memory-Worker ausführt. Der Test muss nicht jedes typisierte Historienereignis prüfen, aber nachweisen, dass der Workflow mit den vom Artisan-Befehl übergebenen Eingaben abschließt.

Demonstriert das Beispiel eine *Fehlerkorrektur* statt einer Funktion, kommt es unter `app/Workflows/Bug/<short-id>/`, mit denselben vier Artefakten.

## Was in die Dokumentation gehört {#what-goes-in-the-docs}

Mit der Aufnahme eines Beispiels ändern sich drei Dokumentationsbereiche:

- **„Sample Index“ der README** im Sample-App-Repository: eine Zeile pro Beispiel mit Ziel, Workflow-Klasse, Artisan-Befehl und MCP-Schlüssel. Dies ist die maßgebliche Quelle.
- **Beispielgalerie auf der Dokumentationswebsite ([`docs/sample-app.md`](/docs/sample-app))**: eine gespiegelte Zeile mit der erwarteten Waterline-Ansicht. Leser können so vor dem Klonen entscheiden, ob das Beispiel zu ihrem Bedarf passt.
- **Querverweis auf der Musterseite** der Dokumentationswebsite, die den Bereich definiert (Sagas, Signale, Nachrichtenströme, untergeordnete Workflows usw.). Die Querverweistabelle am Ende der Sample-App-Dokumentationsseite ist die maßgebliche Liste. Ein Eintrag, der einen Bereich nennt, aber kein Beispiel verlinkt, gilt als Lücke.

Reichen Sie Beispiel und README-Änderungen im Sample-App-PR sowie Galerie- und Musterseitenänderungen in einem verknüpften Dokumentations-PR ein. Maintainer nehmen die verknüpften Änderungen gemeinsam auf. Ein Beispiel ohne Spiegel auf der Dokumentationswebsite bleibt im Upstream-Abdeckungstracker im Zustand `gap`, bis der Dokumentations-PR nachzieht. Beitragende sollten beides gemeinsam liefern.

## Benennung, Struktur und Stil {#naming-layout-and-style}

- **Klassenstruktur.** `app/Workflows/<Pattern>/<Pattern>Workflow.php`, mit zugehörigen Aktivitätsklassen unter `app/Workflows/<Pattern>/Activities/`. Fehlerreproduktionen kommen mit derselben Struktur unter `app/Workflows/Bug/<short-id>/`.
- **Artisan-Befehl.** `app:<short-pattern>` in Kleinbuchstaben und ohne Bindestriche. Langformen wie `app:run-<pattern>` werden nicht verwendet.
- **MCP-Schlüssel.** Entspricht dem kurzen Muster des Artisan-Befehls, damit der MCP-Client denselben Namen sieht, den ein Mensch im Terminal eingibt.
- **Kommentare.** Erklären Sie das *Warum*. Replay-Sicherheitsinvarianten verdienen einen Kommentar: warum ein Wert in `sideEffect()` steht oder ein Wartezustand einen Timer statt `usleep()` nutzt. Derselbe Kommentar bei jedem Aktivitätsaufruf hilft nicht.
- **Waterline-Screenshots.** Die Galerie auf der Dokumentationswebsite nennt die Waterline-Ansicht, die das Beispiel erzeugen soll. Ergänzen oder erneuern Sie diese Ansicht im Beispiel-PR.

## Gründe für die Ablehnung eines Beispiels {#what-gets-a-sample-rejected}

Ein Beispiel wird zur Überarbeitung zurückgegeben, wenn:

- Workflow-Code `now()`, `random_*()` oder andere nichtdeterministische Aufrufe außerhalb von `sideEffect()` oder einer Aktivität verwendet;
- Aktivitäten dauerhafte Verwaltungsarbeit übernehmen, die bereits der Engine gehört: direkte Schreibzugriffe auf `workflow_messages`, manuelles Fortschreiben von Stream-Cursorn oder Speichern von Waterline-Zustand aus Workflow-Code;
- der Artisan-Befehl externe Zugangsdaten benötigt, ohne dies im Feld `requires` des MCP-Eintrags anzugeben;
- README-Beispielindex, Galeriezeile auf der Dokumentationswebsite und Musterseiten-Querverweis nicht gemeinsam aufgenommen werden;
- das Beispiel ein vorhandenes Muster reproduziert, ohne etwas Neues zu zeigen: eine andere Form, einen anderen Fehlermodus oder eine andere Integration. „Gleiches Muster, andere Prosa“ ist eine Dokumentationsänderung.

Darauf achten auch Upstream-Abdeckungsprüfung und Sample-App-Prüfliste. Diese Punkte vor dem Öffnen des PRs selbst zu prüfen, ist der schnellste Weg zur Aufnahme.

## Kurze Prüfliste {#quick-checklist}

Verwenden Sie beim Öffnen des PRs diese Liste:

- [ ] Ein `sample-request`-Issue existiert und verlinkt die öffentliche Dokumentationsseite des Musters.
- [ ] Workflow-Klasse unter `app/Workflows/<Pattern>/`.
- [ ] Artisan-Befehl mit dem Namen `app:<short-pattern>` registriert.
- [ ] Eintrag in `config/workflow_mcp.php` mit Klasse, Muster, Befehl, requires und Argumenten.
- [ ] Test, der den Workflow vollständig ausführt.
- [ ] Zeile im „Sample Index“ der README.
- [ ] Galeriezeile auf der Dokumentationswebsite in [`docs/sample-app.md`](/docs/sample-app).
- [ ] Querverweis von der entsprechenden Musterseite auf der Dokumentationswebsite.
- [ ] Prüfung der öffentlichen Grenze erfolgreich (`scripts/check-public-boundary.sh`).

Maintainer verwenden dieselbe Liste bei der Prüfung. Ein PR, der alle Punkte erfüllt, sollte daher innerhalb eines Veröffentlichungszyklus aufgenommen werden.
