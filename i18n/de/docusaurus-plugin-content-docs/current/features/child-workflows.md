---
sidebar_position: 9
---

# Untergeordnete Workflows {#child-workflows}

Die aktuelle `Workflow\V2`-Implementierung unterstützt dauerhafte untergeordnete
Workflows durch geradlinige `child()`-Aufrufe sowie durch
`all([...])`-Zusammenführungsbarrieren. Diese können nur untergeordnete
Workflows enthalten, mit Aktivitäten gemischt oder in größere
`all([...])`-Gruppen verschachtelt sein. Damit kann ein Elternworkflow einen
oder mehrere Unterworkflows dauerhaft einplanen und auf ihre Ergebnisse warten,
ohne dass sein Prozess am Leben bleiben muss.

Ein untergeordneter Lauf ist weiterhin ein normaler Workflow-Lauf mit eigener
Workflow-Instanz-ID und Lauf-ID. Zum Kind wird er durch die dauerhafte
Verknüpfung zum Elternlauf und eine stabile, vom Elternlauf vergebene
`child_call_id` für diesen Aufruf.

```php
use function Workflow\V2\child;
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle(string $name): array
    {
        $child = child(ChildWorkflow::class, $name);

        return [
            'parent_workflow_id' => $this->workflowId(),
            'parent_run_id' => $this->runId(),
            'child' => $child,
        ];
    }
}
```

## Aktuelles Verhalten {#current-behavior}

- Importieren Sie den Helfer mit `use function Workflow\V2\child;` und rufen Sie `child(ChildWorkflow::class, ...)` auf. Der Aufruf unterbricht den Elternlauf, erstellt einen dauerhaften untergeordneten Lauf und liefert dessen Ergebnis, sobald er geschlossen wird.
- Ein fehlgeschlagenes Kind löst im Elternworkflow eine Ausnahme aus; ein erfolgreiches Kind gibt seine Ausgabe zurück. Abbruch und Beendigung erscheinen als unterschiedliche Ausnahmetypen.
- `$this->child()` gibt die jüngste Kindreferenz zurück; `$this->children()` alle Kindreferenzen in Workflow-Schrittreihenfolge. Referenzen stellen `id()`, `runId()`, `callId()` und Signalhelfer wie `signal()` und `signalWithArguments()` bereit.
- Verwendet ein Kind `continueAsNew()`, folgt der Elternworkflow transparent dem neuesten Lauf. `runId()` wechselt weiter, während `id()` stabil bleibt.
- `all()` kann Closures mit `fn () => child(...)` und `fn () => activity(...)` in einer Barriere kombinieren. Der Elternworkflow wacht beim ersten Kindfehler auf, wartet bei erfolgreichen Zweigen aber auf den Abschluss aller Zweige, bevor er fortfährt.

## Parallele Kindbarriere {#parallel-child-barrier}

Importieren Sie die Helfer mit `use function Workflow\V2\all;` und
`use function Workflow\V2\child;`, wenn ein Elternschritt gemeinsam auf mehrere
untergeordnete Workflows warten soll.

```php
use function Workflow\V2\all;
use function Workflow\V2\child;
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle(): array
    {
        $children = all([
            fn () => child(FirstChildWorkflow::class),
            fn () => child(SecondChildWorkflow::class),
        ]);

        return $children;
    }
}
```

Diese reine Kindform ist nützlich, wenn jedes parallele Mitglied ein
untergeordneter Workflow ist:

- Sie wartet als ein Elternschritt auf die gesamte Kindgruppe.
- Sie erhält die ursprüngliche Array-Reihenfolge in den zurückgegebenen Ergebnissen.
- Sie wirft den ausgewählten nicht erfolgreichen Kindabschluss zurück in den Elternworkflow-Rumpf. Dabei entscheidet die früheste Abschlusszeit, bei Gleichstand der niedrigste Index.

Wenn Sie untergeordnete Workflows und Aktivitäten im selben Zusammenführungsschritt
kombinieren müssen, verwenden Sie stattdessen eine gemischte
`all([...])`-Barriere. Kind- und Aktivitätswarteoperationen teilen dieselbe
`parallel_group_id`. Waterline kennzeichnet diese gemeinsame Barriere als
`parallel_group_kind = mixed`. Liegt eine gemischte oder reine Kinduntergruppe
in einer größeren `all([...])`-Gruppe, bestimmt weiterhin die innerste Gruppe
die `parallel_group_id`. `parallel_group_path` erhält den vollständigen Pfad
von außen nach innen.

## Identitätsvertrag {#identity-contract}

- `child()->id()` und Waterlines `target_name` beziehen sich auf die Workflow-Instanz-ID des Kindes, die über dessen Laufkette hinweg stabil bleibt.
- `child_call_id` bezeichnet den vom Elternworkflow erzeugten Aufruf selbst. Sie bleibt stabil, auch wenn das Kind später `continueAsNew()` verwendet.
- `resume_source_id`, `child_workflow_run_id` und Routen für ausgewählte Läufe beziehen sich auf einen konkreten Kindlauf in dieser Aufrufkette.

## Kindreferenzen {#child-handles}

Sobald der Elternworkflow einen Kindschritt dauerhaft erreicht hat, kann er
diesen Aufruf über ein `ChildWorkflowHandle` untersuchen.

```php
use Workflow\UpdateMethod;
use function Workflow\V2\child;
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle()
    {
        return child(ApprovalWorkflow::class);
    }

    #[UpdateMethod('approve-child')]
    public function approveChild(string $approvedBy): void
    {
        $this->child()?->signal('approved-by', $approvedBy);
    }
}
```

- `$this->child()` gibt die letzte sichtbare Kindreferenz oder `null` zurück.
- `$this->children()` gibt alle sichtbaren Referenzen in Workflow-Schrittreihenfolge zurück.
- In `all([fn () => child(...)])`-Barrieren erscheinen die Referenzen in derselben Schrittreihenfolge wie die Kindaufrufe der Barriere. `$this->child()` gibt die letzte sichtbare Referenz zurück.
- `runId()` einer Referenz folgt dem neuesten vom Elternworkflow aufgezeichneten `ChildRunStarted` in dieser Kindaufrufkette. Ein auf ein Kind mit `continueAsNew()` wartender Elternworkflow sieht so die neueste Kindlauf-ID, ohne die ursprüngliche `callId()` zu verlieren.

## Verfügbarkeit von Referenzen {#handle-availability}

Kindreferenzen beruhen auf Historie, nicht auf Spekulation:

- Bevor der Elternworkflow einen Kindschritt dauerhaft erreicht hat, gibt `$this->child()` `null` und `$this->children()` eine leere Liste zurück.
- Sobald der Elternworkflow für diesen Schritt die Kindplanung oder Kindstarthistorie aufgezeichnet hat, wird die Referenz für Abfragen, Updates und späteres Workflow-Replay sichtbar.
- Abfrage-Replay versendet niemals Kindsignale aus aufgezeichneten Updates. Es stellt nur den durch festgeschriebene Historie belegten Speicherzustand wieder her.

## Sichtbarkeit in Waterline {#waterline-visibility}

Wartet der Elternworkflow auf ein Kind, zeigt Waterline dies als Kindwarteoperation
und nicht als eigenen Aufgabentyp an. Das bedeutet:

- Die Zusammenfassung des Elternlaufs meldet `wait_kind = child` und `liveness_state = waiting_for_child`.
- `waits` enthält `kind = child`, die stabile `child_call_id`, die Workflow-Instanz-ID des Kindes in `target_name` und die Kindlauf-ID in `resume_source_id`.
- Bei mehreren gleichzeitig offenen Kindwarteoperationen enthält die Detailansicht auch `open_wait_count`.
- Durch eine reine Kind- oder gemischte `all([...])`-Barriere erzeugte Kindwarteoperationen teilen `parallel_group_id` und zeigen `parallel_group_kind`, `parallel_group_base_sequence`, `parallel_group_size` und `parallel_group_index`.
- Verschachtelte Kindwarteoperationen zeigen außerdem `parallel_group_path`, geordnet von der äußersten einschließenden Barriere zur innersten.
- `timeline` enthält typisierte Kindereignisse wie `ChildWorkflowScheduled`, `ChildRunStarted`, `ChildRunCompleted` und `ChildRunFailed` mit derselben stabilen `child_call_id`.
- Offene Kindwarteoperationen und Abstammungsdaten bevorzugen die typisierte `ChildWorkflowScheduled`- / `ChildRunStarted`-Historie des Elternworkflows, behalten einen logischen Kindeintrag pro stabiler `child_call_id` und folgen dem neuesten vom Elternworkflow aufgezeichneten Kindlauf. Das gilt selbst dann, wenn kopierte `workflow_links`-Zeilen verschwinden oder die veränderliche `current_run_id` der Kindinstanz nach Festschreiben der Historie abweicht.
- Sobald der Elternworkflow ein typisiertes Kindauflösungsereignis aufgezeichnet hat, hält die Detailansicht des ausgewählten Laufs diese Kindwarteoperation anhand der Elternhistorie für aufgelöst, auch wenn die veränderliche Kindlaufzeile später abweicht. Endgültige Kindhistorie oder ältere Verknüpfungsdaten können Abstammung und Diagnosen ergänzen, aber fehlende typisierte Kindschritthistorie des Elternworkflows beim Replay nicht ersetzen.
- Nach diesem typisierten Kindauflösungsereignis behalten Abstammungsansicht und Historienexport des ausgewählten Laufs auch Workflow-Typ, Klasse, Laufnummer, Statusgruppe und Abschlussgrund des Kindes aus der Elternhistorie bei, statt diese Felder aufgelöster Kinder erneut aus der veränderlichen Kindlaufzeile zu lesen.
- Existiert eine endgültige Kindzeile oder Verknüpfung, aber keine typisierte Elternhistorie `ChildWorkflowScheduled`, `ChildRunStarted`, `ChildRunCompleted`, `ChildRunFailed`, `ChildRunCancelled` oder `ChildRunTerminated` für diesen Kindschritt, blockieren Worker- und Abfrage-Replay mit `history_shape_mismatch` und aufgezeichneten Ereignissen `no typed history`. Waterline kennzeichnet die ausgewählte Kindwarteoperation mit `status = unsupported`, zeigt `history_authority = unsupported_terminal_without_history` sowie `history_unsupported_reason = terminal_child_link_without_typed_parent_history` und leitet die Kindidentität, sofern verfügbar, aus der blockierten Aufgabe oder dem Abstammungsfallback ab.
- Geht die Workflow-Aufgabenzeile zur Fortsetzung des Elternlaufs nach dem Kindauflösungsereignis verloren, bleibt die Detailansicht des ausgewählten Laufs bei `repair_needed`. Sie zeigt eine synthetische fehlende Workflow-Aufgabe mit `workflow_wait_kind = child`, `child_call_id` und `child_workflow_run_id`. Manuelles `repair()`, `workflow:v2:repair-pass` oder Reparatur in der Worker-Schleife erstellt dieselbe Kindauflösungsaufgabe aus typisierter Elternhistorie neu.
- Abstammungsarrays zeigen die dauerhafte Eltern-Kind-Beziehung neben Continue-as-new-Verknüpfungen. Einträge untergeordneter Workflows tragen dieselbe `child_call_id`.

## Richtlinie beim Schließen des Elternlaufs {#parent-close-policy}

Wenn ein Elternworkflow durch Abschluss, Fehler, Timeout, Abbruch oder Beendigung
schließt, wirkt sich dies entsprechend der **Parent-close-Richtlinie** auf
jeden offenen untergeordneten Workflow aus. Die Richtlinie wird pro Kindaufruf
gesetzt und bestimmt, was mit diesem Kind beim Ende des Elternlaufs geschieht.

| Richtlinie | Wert | Verhalten |
|---|---|---|
| Unabhängig weiterlaufen lassen | `abandon` | Das Kind läuft unabhängig weiter. Dies ist der Standard. |
| Kooperativen Abbruch anfordern | `request_cancellation` | Das Kind erhält eine kooperative Aufräumanforderung mit ursprünglicher Abbruchabstammung und Frist des Elternlaufs. |
| Abbruch anfordern | `request_cancel` | Beim Schließen des Elternlaufs wird ein Abbruchbefehl an das Kind gesendet. |
| Beenden | `terminate` | Beim Schließen des Elternlaufs wird ein Beendigungsbefehl an das Kind gesendet. |

### Standardrichtlinie {#default-policy}

Ein `child()`-Aufruf ohne `ChildWorkflowOptions` läuft immer unter
`ParentClosePolicy::Abandon`. Die quellkompatiblen Helfer
`Workflow\V2\child()`, `Workflow\V2\Workflow::child()` und
`Workflow\V2\Workflow::executeChildWorkflow()` erzeugen Standardoptionen,
wenn das erste Argument kein `ChildWorkflowOptions` ist. Diese setzen
`parentClosePolicy` auf `ParentClosePolicy::Abandon`. Derselbe Standard gilt
für jede `child()`-Closure in einer `all([...])`-Barriere ohne Optionsargument.
Überschreiben Sie ihn durch explizite `ChildWorkflowOptions` wie unten gezeigt.

### Richtlinie setzen {#setting-the-policy}

Übergeben Sie `ChildWorkflowOptions` als erstes Argument an `child()`:

```php
use function Workflow\V2\child;
use Workflow\V2\Enums\ParentClosePolicy;
use Workflow\V2\Support\ChildWorkflowOptions;
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle(): array
    {
        $options = new ChildWorkflowOptions(
            parentClosePolicy: ParentClosePolicy::RequestCancel,
        );

        return child(ChildWorkflow::class, $options, 'argument1');
    }
}
```

Dasselbe Muster funktioniert mit Closures innerhalb von `all()` für parallele
Barrieren:

```php
use function Workflow\V2\all;
use function Workflow\V2\child;
use Workflow\V2\Enums\ParentClosePolicy;
use Workflow\V2\Support\ChildWorkflowOptions;

$cancelOptions = new ChildWorkflowOptions(
    parentClosePolicy: ParentClosePolicy::RequestCancel,
);

$results = all([
    fn () => child(FirstChild::class, $cancelOptions),
    fn () => child(SecondChild::class, $cancelOptions, 'arg'),
]);
```

### Funktionsweise {#how-it-works}

- Die Richtlinie wird in der `workflow_links`-Zeile (`parent_close_policy`) und im Payload des Historienereignisses `ChildWorkflowScheduled` aufgezeichnet.
- Schließt der Elternlauf aus irgendeinem Grund, sucht die Engine offene Kindverknüpfungen mit einer anderen Richtlinie als Abandon und sendet jedem offenen Kind den passenden Befehl (kooperativen Abbruch anfordern, abbrechen oder beenden).
- Ist das Kind bei der Durchsetzung bereits geschlossen, geschieht nichts. Der Befehl wird still übersprungen.
- Die Durchsetzung erfolgt nach bestem Bemühen: Wird ein Kindbefehl abgelehnt, etwa weil das Kind bereits endgültig geschlossen ist, beeinflusst dies den Abschluss des Elternlaufs nicht. Bei erfolgreicher Durchsetzung wird dort `ParentClosePolicyApplied` aufgezeichnet. Bei fehlgeschlagener Durchsetzung entsteht stattdessen `ParentClosePolicyFailed`, damit Betreiber Erfolg von stillen Fehlern unterscheiden können.
- Continue-as-new löst die Parent-close-Richtlinie **nicht** aus, da die Workflow-Instanz unter einem neuen Lauf aktiv bleibt.

### Matrix der Elternlauf-Ergebnisse {#parent-disposition-matrix}

Die Parent-close-Richtlinie wird bei jedem endgültigen Elternlauf-Ergebnis
ausgelöst. Für noch aktive oder an einen fortgesetzten Lauf übergebene Läufe
bleibt sie inaktiv. Die Engine verhält sich bei jedem endgültigen
Elternergebnis gleich: Die Richtlinie wird auf jede noch offene
Kindverknüpfung angewendet, die nicht Abandon verwendet.

| Elternergebnis | Richtlinie durchgesetzt? | Hinweise |
|---|---|---|
| Abgeschlossen | Ja | Nach Aufzeichnen von `WorkflowCompleted`. Ein geradliniger `child()`-Aufruf wartet immer auf das Kind, daher gibt es bei natürlichem Abschluss gewöhnlich keine offenen Kinder. Die Durchsetzung wird trotzdem als Sicherheitsprüfung aufgerufen. |
| Fehlgeschlagen | Ja | Nach Aufzeichnen von `WorkflowFailed` für jeden endgültigen Workflow-Aufgabenfehler. |
| Timeout | Ja | Nach Aufzeichnen von `WorkflowTimedOut` für Abschlüsse durch Lauf- oder Ausführungs-Timeout. |
| Abgebrochen | Ja | Nachdem der angenommene Befehl `CancelRequested` den Elternlauf schließt. |
| Beendet | Ja | Nachdem der angenommene Befehl `TerminateRequested` den Elternlauf schließt. |
| Continue-as-new | Nein | Die Workflow-Instanz bleibt unter dem neuen Lauf aktiv. Bestehende Kindverknüpfungen werden deshalb unter Erhalt ihrer ursprünglichen Richtlinie auf den fortgesetzten Lauf umgestellt. |
| Zurücksetzen | Derzeit nicht anwendbar | Die v2-Laufzeit bietet keinen eigenständigen Reset-Befehl oder endgültigen Reset-Zustand. Eine künftige Reset- oder Reparaturoperation, die einen Elternlauf schließt oder ersetzt, muss definieren, ob die Kindverantwortung übergeht. Wird der alte Lauf endgültig geschlossen, muss er die Parent-close-Richtlinie anwenden, bevor er die Verantwortung für offene Kinder abgibt. |

### Wann welche Richtlinie geeignet ist {#when-to-use-each-policy}

**Abandon** (Standard) eignet sich für unabhängige Arbeit, die ungeachtet des
Schicksals des Elternlaufs fertig werden soll, etwa einen Benachrichtigungsworkflow
oder eine zwingend abzuschließende Aufräumaufgabe.

**Request Cancellation** verwendet `ParentClosePolicy::RequestCancellation`
für kooperatives Aufräumen. Es erhält die Wurzelidentität und unveränderliche
Frist einer vorhandenen Eltern-Abbruchanforderung. Schließt der Elternlauf ohne
eine solche Anforderung, zeichnet die Richtlinie ein gemeinsames Aufräumbudget
von 600 Sekunden ab der aufgezeichneten Abschlusszeit auf. Wiederholte
Durchsetzung gewährt keine zusätzliche Zeit. Fähigkeiten der Service-Worker
und den Aufräumvertrag beschreibt [Kooperativer Abbruch](/docs/polyglot/cancellation).

**Request Cancel** wendet beim Schließen des Elternlaufs den endgültigen
`cancel()`-Befehl des Kindes an. Trotz des Richtliniennamens wird keine separate
kooperative `requestCancellation()`-Anforderung zugestellt. Das Kind kann nach
dem Schließen seines Laufs durch diese Richtlinie keinen Workflow-Code für
Aufräumen oder Kompensation ausführen. Schließen Sie notwendige Kompensation
vor dem Elternlauf ab oder verwenden Sie **Abandon** für unabhängige
Aufräumarbeiten.

**Terminate** eignet sich, wenn Kinder sofort stoppen müssen. Verwenden Sie
dies für reine Hilfsarbeit des Elternlaufs ohne unabhängigen Wert nach dessen
Abschluss.

### Sichtbarkeit in Waterline {#waterline-visibility-1}

Waterline zeigt `parent_close_policy` an folgenden Stellen:

- im Kindverknüpfungseintrag der Abstammungsansicht des Elternlaufs;
- im Payload des Zeitleisteneintrags `ChildWorkflowScheduled`;
- im Historienereignis `CancelRequested` oder `TerminateRequested` des Kindes bei Durchsetzung, mit einer Begründung, die den Abschluss des Elternlaufs nennt.

## Aktuelle Einschränkungen {#current-limitations}

Die aktuelle Oberfläche enthält nicht:

- eingebaute Helfer für begrenzte Nebenläufigkeit über die bestehenden Barrieren `all([fn () => child(...)])`, `all([fn () => activity(...)])` und gemischte `all([fn () => child(...), fn () => activity(...)])` hinaus.

Dauerhafte Kindreferenzen sind also für bereits erreichte Kindschritte
unterstützt. Höhere APIs für Startreferenzen oder begrenzte Nebenläufigkeit über
die heutige Oberfläche `child(...)` und `all([...])` hinaus fehlen noch.

## Dieses Muster ausführen {#run-this-pattern}

Der Workflow zur Microservice-Koordination in der [Beispielanwendung](/docs/sample-app)
ist die ausführbare Referenz für Eltern-Kind-Orchestrierung über
Anwendungsgrenzen hinweg:

```bash
php artisan app:microservice
```

`App\Workflows\Microservice\MicroserviceWorkflow` führt den Elternworkflow in
der Laravel-Hauptanwendung aus und leitet Kindarbeit an den enthaltenen
Microservice-Worker weiter. Öffnen Sie Waterline während des Laufs, um die
Kindverknüpfungen unter dem Elternlauf und die Abschlussrichtlinie in der
Abstammungsansicht wie hier beschrieben zu sehen.
