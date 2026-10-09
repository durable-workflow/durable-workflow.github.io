---
sidebar_position: 2
---

# Workflow-Einschränkungen {#workflow-constraints}

Eine Workflow-Klasse darf nicht von externen Zuständen oder Diensten abhängen, die sich ändern können. Das betrifft die aktuelle Uhrzeit, den angemeldeten Nutzer, externe Netzwerkressourcen und jede andere veränderliche Zustandsquelle.

Beispiele für Operationen, die nicht in den Workflow-Code gehören:

- Verwenden Sie nicht `Carbon::now()` für die aktuelle Uhrzeit. Jeder Aufruf kann ein anderes Ergebnis liefern. Nutzen Sie `Workflow\V2\Workflow::now()` oder die Hilfsfunktion `Workflow\V2\now()`. Beide liefern eine für Replay geeignete Workflow-Zeit.
- Verwenden Sie nicht `Auth::user()`. Das Ergebnis hängt vom gerade angemeldeten Nutzer ab. Übergeben Sie den Nutzer beim Start als Workflow-Eingabe.
- Führen Sie keine Netzwerkaufrufe zu externen Ressourcen aus. Verfügbarkeit und Laufzeit können schwanken. Übergeben Sie benötigte Daten beim Start oder lesen Sie sie in einer Aktivität.
- Verwenden Sie keine Zufallszahlengeneratoren oder andere Zufallsquellen außerhalb eines Side Effects. Jeder Aufruf kann ein anderes Ergebnis liefern. Übergeben Sie benötigte Zufallswerte als Eingabe.

## Prüfungen beim Anwendungsstart {#boot-time-guardrails}

Für unter `workflows.v2.types.workflows` registrierte Workflow-Klassen prüft das Paket beim Start offensichtliche Replay-unsichere Aufrufe wie `Carbon::now()`, `Auth::user()`, `DB::`, `Http::` und `random_int()`. Die Einstellung `workflows.v2.guardrails.boot` bestimmt die Behandlung:

| Modus | Verhalten |
| --- | --- |
| `warn` (Standard) | Pro Fund wird eine Warnung protokolliert. Der Anwendungsstart wird nicht blockiert. |
| `silent` | Die Startprüfung wird vollständig übersprungen. |
| `throw` | Beim ersten Fund wird eine `LogicException` ausgelöst. Geeignet für CI. |

```php
// config/workflows.php
'v2' => [
    'guardrails' => [
        'boot' => env('DW_V2_GUARDRAILS_BOOT', 'warn'),
    ],
],
```

Setzen Sie in CI `DW_V2_GUARDRAILS_BOOT=throw`, um Builds mit neuen Replay-unsicheren Aufrufen abzulehnen. In Produktion verhindert `warn`, dass eine bislang unentdeckte Stelle eine Bereitstellung blockiert.

Im Umfang der ersten Veröffentlichung ist die Startprüfung die einzige blockierende Schutzprüfung für den Workflow-Modus. Beim Beanspruchen einer Workflow-Aufgabe führt die Laufzeitumgebung keine zusätzliche Determinismusdiagnose aus. Diese Entscheidung für 2.0 erlaubt es, lokal registrierte PHP-Workflows vor der Bereitstellung zu prüfen. Waterline zeigt abweichende Definitionsfingerprints bei lang laufenden Workflows, ohne zusätzliche Bereitstellungsfehler durch Aufgaben verschiedener Builds zu erzeugen.

Auch Läufe ohne Fingerprint folgen einer vorsichtigen Regel. Erreicht ein Lauf einen neuen `getVersion()`-Zweig und stammt seine `WorkflowStarted`-Historie aus der Zeit vor dem Fingerprint-Snapshot, bleibt der Lauf auf `WorkflowStub::DEFAULT_VERSION`. Die aktuelle Definition wird nicht automatisch als sicher angenommen. Siehe [Versionierung](../features/versioning.md).
