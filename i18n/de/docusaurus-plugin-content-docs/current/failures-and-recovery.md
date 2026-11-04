---
sidebar_position: 11
title: Fehler und Wiederherstellung
description: Diagnostizieren Sie Aktivitätsfehler, nicht wiederholbare Exceptions, Laufzeitlimits, Bereinigung beim Abbruch und sichere Wiederherstellungsmaßnahmen.
tags:
  - failures
  - recovery
  - operations
keywords:
  - Workflow-Fehler
  - nicht wiederholbare Exception
  - Workflow-Wiederherstellung
---

# Fehler und Wiederherstellung {#failures-and-recovery}

Beachten Sie bei der Fehlerdiagnose den grundlegenden Ausführungsvertrag:

- Workflow-Aufgaben werden durch Replay der festgeschriebenen Historie wiederhergestellt.
- Aktivitäten werden mindestens einmal ausgeführt und können mehrfach auftreten.
- Abgelaufene Leases und erneute Zustellung sind normale Wiederherstellungspfade. Sie beweisen nicht, dass der vorige Worker die Nebenwirkung nie ausgeführt hat.

Die [Ausführungsgarantien und Idempotenz](./constraints/execution-guarantees.md) erklären die genaue Bedeutung von Wiederholungsversuchen, erneuter Zustellung und dauerhaften Ergebnissen.

## Exceptions behandeln {#handling-exceptions}

`Workflow\V2\Activity` verwendet standardmäßig `$tries = 1`: einen Versuch, ohne automatische Wiederholung nach einer Exception. Der erste Aktivitätsfehler wird an den Workflow zurückgegeben. Der Workflow-Code kann ihn wie unten abfangen; bleibt die Exception unbehandelt, schlägt der Lauf fehl und wird terminal.

Wiederholungen müssen ausdrücklich konfiguriert werden. Setzen Sie `$tries` für weitere Versuche auf einen Wert über `1` oder für unbegrenzt viele Versuche auf `0`, und wählen Sie eine `backoff()`-Richtlinie. Ein wiederholbarer Fehler wird erst nach Ausschöpfung des konfigurierten Versuchs- oder Zeitbudgets an den Workflow-Code weitergegeben. Ein nicht wiederholbarer Fehler überspringt die verbleibenden Versuche.

```php
use Exception;
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public int $tries = 1;

    public function handle(): void
    {
        throw new Exception();
    }
}
```

```php
use Exception;
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(): void
    {
        try {
            $result = activity(MyActivity::class);
        } catch (Exception) {
            // handle the exception here
        }
    }
}
```

## Nicht wiederholbare Exceptions {#non-retryable-exceptions}

Manche Fehler sollen keinen weiteren Versuch auslösen. Wirft eine Aktivität eine nicht wiederholbare Exception, wird sie sofort als fehlgeschlagen markiert. Weitere Versuche entfallen.

```php
use Workflow\V2\Activity;
use Workflow\Exceptions\NonRetryableException;

class MyNonRetryableActivity extends Activity
{
    public function handle(): void
    {
        throw new NonRetryableException('This is a non-retryable error');
    }
}
```

## Wiederherstellungsverfahren {#recovery-process}

Prüfen Sie zuerst den dauerhaften Status des ausgewählten Laufs und die Wiederholungsrichtlinie der Aktivität. Mit dem standardmäßigen Einzelversuch hat ein unbehandelter Aktivitätsfehler den Lauf bereits terminal gemacht. Eine Fehlerkorrektur bereitzustellen oder `repair()` aufzurufen öffnet diesen fehlgeschlagenen Lauf nicht erneut.

Eine Korrektur während des Wartens ist nur möglich, solange die Aktivität noch einen zulässigen Wiederholungsversuch hat. Konfigurieren Sie `$tries` vor dem Einplanen der Aktivität auf einen Wert über `1` oder für unbegrenzt viele Versuche auf `0`, zusammen mit `backoff()`. Optional begrenzt `ActivityOptions::$scheduleToCloseTimeout` die Gesamtdauer über alle Aktivitätsversuche; Workflow-Fristen gelten weiterhin. Siehe [Wiederholungen](./configuration/options.md#retries), [Wartezeiten](./configuration/options.md#backoff) und [ActivityOptions](./configuration/options.md#activityoptions). Die Richtlinie wird beim Einplanen gespeichert. Eine spätere Bereitstellung erweitert weder das Versuchs- noch das Zeitbudget einer bestehenden Aktivität.

Für einen Lauf, der noch auf eine wiederholbare Aktivität wartet:

1. Prüfen Sie die Aktivitätsprotokolle auf Fehler und Exceptions.
2. Ermitteln und beheben Sie die Ursache im Code.
3. Stellen Sie die Korrektur dort bereit, wo die Queue-Worker laufen.
4. Starten oder ersetzen Sie die betroffenen Worker, damit sie den neuen Code laden und Arbeit sicher übernehmen können.
5. Lassen Sie einen gesunden Worker den nächsten zulässigen Versuch ausführen. Reparatur und erneute Zustellung können verlorenen Aufgabentransport wiederherstellen; sie gewähren nach Abschluss der Aktivität oder des Laufs keinen weiteren fachlichen Wiederholungsversuch.
6. Prüfen Sie das dauerhafte Ergebnis in Waterline, im Historienexport oder über die Server-API. Eine einzelne Worker-Protokollzeile ist nicht maßgeblich.
7. Schlägt die Aktivität weiterhin fehl, prüfen Sie die verbleibenden Versuchs- und Zeitbudgets, bevor Sie das Verfahren wiederholen.

Ein Lauf mit einem zulässigen Aktivitätsversuch bleibt wartend und kann nach erfolgreicher Ausführung des korrigierten Codes fortfahren, sofern seine ursprünglichen Budgets nicht abgelaufen sind. Das garantiert keine Korrektur jedes Workflows im bestehenden Lauf: Ein unbehandelter letzter Aktivitätsfehler, ein Fehler im Workflow-Code, eine strukturelle Grenze oder ein Workflow-Timeout können ihn terminal machen.

Bewahren Sie bei einem terminal fehlgeschlagenen Lauf die Historie auf und gleichen Sie externe Seiteneffekte ab, bevor die Anwendung über einen neuen Workflow entscheidet. Sichern Sie wiederholte fachliche Operationen durch anwendungsseitige Idempotenz ab. Wenn ein nicht abgefangener Aktivitätsfehler, ein Fehler im Workflow-Code oder ein strukturelles Limit den Lauf beendet hat, prüfen Sie nach dem Bereitstellen der Korrektur, ob Sie ihn per [Redrive](#redrive) fortsetzen können. Redrive setzt die Arbeit in einem neuen Lauf fort, der die abgeschlossenen Schritte wiederverwendet. Ein Fehler im Workflow-Code erfordert korrigierten Code und Workflow 2.19.0 oder später. Siehe [Redrive mit korrigiertem Workflow-Code](#redrive-corrected-definition). Es gibt weder automatische Workflow-Wiederholungen noch eine Wiederöffnung terminaler Läufe; siehe [Wiederholungen auf Workflow-Ebene](#workflow-level-retry).

## Fehlgeschlagenen Lauf per Redrive fortsetzen {#redrive}

Redrive setzt einen fehlgeschlagenen Lauf in einem neuen Lauf derselben Workflow-Instanz fort. Der neue Lauf verwendet die aufgezeichneten Ergebnisse der Schritte wieder, die vor dem Fehler abgeschlossen wurden, und führt den Rest des Workflows erneut aus. Nutzen Sie Redrive, nachdem Sie die Ursache des Fehlers behoben haben, damit abgeschlossene Arbeit wie eine Zahlung oder eine E-Mail nicht wiederholt wird.

Der fehlgeschlagene Lauf bleibt geschlossen und unverändert. Der neue Lauf, der Nachfolger, erhält die nächste Laufnummer und wird zum aktuellen Lauf der Instanz. Sein `continued_from_run_id` nennt den fehlgeschlagenen Lauf. Sein `WorkflowStarted`-Ereignis zeichnet `recovery_kind: redrive` und `resume_step_sequence` auf, also den Schritt, an dem die Ausführung fortgesetzt wird.

Dieser Abschnitt beschreibt Redrive in Workflow 2.20.1 und später. Frühere Workflow-Releases und Redrive im nativen Server nehmen weniger Läufe an. Siehe [Frühere Releases und der native Server](#redrive-earlier-releases).

Der Nachfolger spielt den Workflow-Code von Anfang an erneut ab:

- Jeder Aktivitätsaufruf, der im fehlgeschlagenen Lauf abgeschlossen wurde, liefert sein aufgezeichnetes Ergebnis. Die Aktivität läuft nicht erneut.
- Ein Seiteneffekt oder Versionsmarker vor dem fehlgeschlagenen Schritt wird in Schrittreihenfolge wiederverwendet. Der Seiteneffekt läuft nicht erneut, und eine Versionsprüfung liefert die aufgezeichnete Version.
- Ein `timer()`, der vor dem fehlgeschlagenen Schritt ausgelöst wurde, wird im Nachfolger als bereits ausgelöst aufgezeichnet. Der Nachfolger wartet nicht erneut darauf.
- Ein Memo oder Suchattribut, das der Workflow-Code vor dem fehlgeschlagenen Schritt per Upsert gesetzt hat, wird in Schrittreihenfolge wiederverwendet, und der Nachfolger behält dieselben Werte.
- Eine Signalwarteoperation (`await('name')`), die ihr Signal empfangen und angewendet hat, wird mit dem Wert des Signals wiederverwendet. Das Signal wird nicht erneut zugestellt.
- Ein Update, das vor dem fehlgeschlagenen Schritt angenommen, angewendet und abgeschlossen wurde, wird an derselben Stelle erneut aufgezeichnet. Das Replay führt den Update-Handler mit den aufgezeichneten Argumenten aus, sodass der Zustand des Workflows übereinstimmt. Das Update wird nicht erneut zugestellt. Ein abgelehntes Update und eines, das der Fehler vor seiner Ausführung geschlossen hat, werden ausgelassen.
- `outbox()->sendReference()` und `inbox()->receive()` in wiederverwendetem Workflow-Code geben die Nachricht zurück, die der fehlgeschlagene Lauf gesendet oder konsumiert hat. Sie senden oder konsumieren sie nicht erneut.
- Wenn ein Aktivitätsfehler den Lauf beendet hat, wird der fehlgeschlagene Aktivitätsaufruf als neue Aktivitätsausführung mit der Wiederholungsrichtlinie aus dem Workflow-Code eingeplant. Seine Versuche beginnen von vorn.
- Wenn der Lauf im Workflow-Code oder an einem strukturellen Limit fehlgeschlagen ist, setzt der Nachfolger an dem Schritt fort, den der Workflow-Code nie erreicht hat.
- Alles nach dem fehlgeschlagenen Schritt läuft wie in einem neuen Lauf.
- Memos und Suchattribute, die beim Start des Laufs gesetzt wurden, gehen wie bei Continue-as-new auf den Nachfolger über.
- Der Nachfolger übernimmt die Ausführungsfrist des fehlgeschlagenen Laufs. Sein Lauf-Zeitlimit beginnt beim Redrive neu.
- Jeder wiederverwendete Schritt trägt `reused_from_run_id` und `reused_recorded_at`. Bei einem wiederverwendeten Update- oder Signalereignis treten die beiden immer als Paar auf.
- Ein Nachfolger, der Schritte wiederverwendet hat, kann erneut per Redrive fortgesetzt werden. Jeder wiederverwendete Schritt behält den Lauf, der ihn zuerst aufgezeichnet hat, und `reused_from_run_id` nennt den Lauf, aus dem er per Redrive hervorging. So verwendet eine Kette von Redrives jeden Schritt nur einmal wieder.
- Im Embedded-Modus beginnt `Workflow::now()` im Nachfolger bei der Startzeit des fehlgeschlagenen Laufs. Das Replay verwendet `reused_recorded_at`. Deshalb entspricht `Workflow::now()` nach einem wiederverwendeten Schritt der Zeit im fehlgeschlagenen Lauf. Ein Schritt, den ein zweiter Redrive wiederverwendet, behält den Zeitpunkt seiner ersten Ausführung.

### Redrive anfordern {#request-a-redrive}

Lösen Sie im Embedded-Modus den Vertrag `Workflow\V2\Contracts\WorkflowControlPlane` aus dem Laravel-Container auf und rufen Sie `redrive()` mit der ID der Workflow-Instanz und der ID des fehlgeschlagenen Laufs auf:

```php
use Workflow\V2\Contracts\WorkflowControlPlane;

$result = app(WorkflowControlPlane::class)->redrive($instanceId, $failedRunId, [
    'request_id' => 'incident-42',
]);

if ($result['accepted']) {
    $successorRunId = $result['workflow_run_id'];
} else {
    $reason = $result['reason'];
}
```

Senden Sie im Servicemodus `POST /api/workflows/{workflowId}/runs/{runId}/redrive` mit einer optionalen `request_id` im Body. Die Clients kapseln dieselbe Route:

| Oberfläche | Aufruf |
| --- | --- |
| CLI | `dw workflow:redrive <workflow-id> <run-id> --request-id <id>` |
| PHP SDK | `Client::redriveWorkflow($workflowId, $failedRunId, $requestId)` |
| Python SDK | `await client.redrive_workflow(workflow_id, failed_run_id, request_id=...)` oder `await handle.redrive()` |
| Rust SDK | `client.redrive_workflow_run(workflow_id, failed_run_id, request_id)` oder `handle.redrive(request_id)` |

Ein angenommener Redrive liefert die Lauf-ID des Nachfolgers und `resume_step_sequence`. Ein abgelehnter Redrive liefert einen `reason` und ändert nichts. Ein Redrive für einen bereits fortgesetzten Lauf liefert den vorhandenen Nachfolger, statt einen weiteren anzulegen. Übergeben Sie eine `request_id`, damit eine wiederholte Anfrage sicher ist. Eine `request_id`, die bereits für einen anderen Redrive derselben Instanz verwendet wurde, wird mit `request_id_already_used` abgelehnt.

Service-Worker melden einen Fingerprint der Workflow-Definition. Redrive vergleicht ihn mit dem Fingerprint, der beim Start des Laufs aufgezeichnet wurde. Rufen Sie im Rust SDK `Worker::set_workflow_definition_sources()` für jeden Workflow auf, den Sie per Redrive fortsetzen wollen. Ein ohne Quellidentität registrierter Workflow läuft weiterhin, aber Redrive lehnt ihn ab.

### Redrive mit korrigiertem Workflow-Code {#redrive-corrected-definition}

Wenn ein Lauf fehlgeschlagen ist, weil der Workflow-Code eine Exception ausgelöst hat, würde derselbe Code am selben Schritt erneut eine Exception auslösen. Deshalb lehnt Redrive den Lauf mit `workflow_code_failure_requires_corrected_definition` ab. Stellen Sie die Korrektur bereit und fordern Sie den Redrive dann mit `allow_definition_change` an:

```php
$result = app(WorkflowControlPlane::class)->redrive($instanceId, $failedRunId, [
    'request_id' => 'incident-42',
    'allow_definition_change' => true,
]);
```

Bevor Redrive etwas schreibt, spielt es die abgeschlossenen Schritte mit dem neuen Code im Speicher erneut ab. Der neue Code muss dieselben Schritte in derselben Reihenfolge ausführen und den Schritt erreichen, an dem der alte Code fehlgeschlagen ist. Gelingt das nicht, lehnt Redrive mit `definition_incompatible_with_prefix` ab, und `definition_mismatch` nennt den ersten abweichenden Schritt (`sequence`) sowie einen `kind`-Wert wie `step_shape` oder `version_range`. Ist die abgeschlossene Historie größer als das Historienbudget, lehnt Redrive mit `definition_check_over_budget` ab.

Eine angenommene Änderung führt den korrigierten Code aus und zeichnet den Fingerprint der ersetzten Definition als `definition_changed_from` im `WorkflowStarted`-Ereignis des Nachfolgers auf. Ein späterer Redrive mit derselben Definition zeichnet keinen solchen Wert auf.

`allow_definition_change` gilt für Läufe im Embedded-Modus. Für einen Lauf, den ein Service-Worker gestartet hat, lehnt Redrive eine Definitionsänderung mit `definition_change_requires_replay_check` ab. Ohne `allow_definition_change` wird eine geänderte Definition mit `workflow_definition_unavailable_or_changed` abgelehnt.

### Wann ein fehlgeschlagener Lauf fortgesetzt werden kann {#redrive-eligibility}

Redrive nimmt einen fehlgeschlagenen Lauf an, wenn alle folgenden Bedingungen erfüllt sind:

- Der Lauf ist der aktuelle Lauf der Instanz.
- Der Lauf ist fehlgeschlagen, weil ein Aktivitätsfehler den Workflow-Code erreicht hat und nicht abgefangen wurde, oder weil der Workflow-Code eine Exception ausgelöst hat oder ein strukturelles Limit ihn gestoppt hat. Ein Lauf, der an einem Workflow-Zeitlimit fehlgeschlagen ist, wird abgelehnt.
- Jeder Schritt vor dem fehlgeschlagenen Schritt ist eine abgeschlossene Aktivität, ein Seiteneffekt, ein Versionsmarker, ein ausgelöster `timer()`, ein Upsert eines Memos oder Suchattributs, eine Signalwarteoperation, die ihr Signal empfangen und angewendet hat, oder ein Update, das mit denselben Argumenten angenommen, angewendet und abgeschlossen wurde. Ein abgelehntes Update und eines, das der Fehler vor seiner Ausführung geschlossen hat, sind erlaubt und werden ausgelassen. Payloads von Aktivitäten, Seiteneffekten, Signalen und Updates müssen inline gespeichert sein. Ein Payload im externen Payload-Speicher wird abgelehnt.
- Die Workflow-Definition entspricht dem Fingerprint, der beim Start des Laufs aufgezeichnet wurde, oder Sie haben `allow_definition_change` übergeben und der korrigierte Code spielt die abgeschlossenen Schritte erneut ab. Ein Fehler im Workflow-Code bei unveränderter Definition wird abgelehnt.
- Die Ausführungsfrist ist nicht abgelaufen.
- Der Lauf hat keinen übergeordneten Workflow, keine Child-Workflows und keine lokalen Aktivitäten, und seine Eingabe ist inline gespeichert.
- Wenn ein Service-Worker den Lauf gestartet hat, bestehen die Schritte vor dem Fehler nur aus Aktivitäten, Seiteneffekten, Versionsmarkern und ausgelösten Timern. Memo- und Suchattribut-Upserts, Signalwarteoperationen und angewendete Updates werden für Läufe im Servicemodus abgelehnt.

Eine Ablehnung nennt die erste Regel, die nicht erfüllt ist:

| Grund | Bedeutung |
| --- | --- |
| `run_not_failed` | Der Lauf ist nicht im Status `failed`. |
| `source_run_not_current` | Es gibt einen neueren Lauf der Instanz. |
| `unrecorded_failure_boundary` | Für den Fehler des Laufs ist kein Schritt aufgezeichnet, etwa bei einem Fehler im Workflow-Code, den ein Release vor 2.19.0 aufgezeichnet hat. |
| `workflow_code_failure_requires_corrected_definition` | Der Workflow-Code hat eine Exception ausgelöst, und die Definition hat sich nicht geändert. Derselbe Code würde also erneut eine Exception auslösen. |
| `unsupported_history` | Die Historie vor dem Fehler enthält einen Schritt, den Redrive nicht wiederverwenden kann, etwa einen Child-Workflow oder einen abgebrochenen Timer. |
| `unsupported_local_activity` | Die Historie enthält eine lokale Aktivität. |
| `unsupported_timer` | Die Historie enthält einen Bedingungs- oder Signal-Timeout, einen Timer für die Abbruch-Bereinigung oder einen Timer in einem Cancellation Scope oder einer parallelen Gruppe. |
| `incomplete_timer_step` | Einem Timer-Schritt fehlt das Ereignis für das Einplanen oder für das Auslösen. |
| `unsupported_signal_wait` | Eine Signalwarteoperation hat ein Timeout oder liegt in einem Cancellation Scope oder einer parallelen Gruppe. |
| `unsupported_pending_signal` | Der Lauf hat ein Signal empfangen, das er nie angewendet hat. |
| `incomplete_signal_step` | Einer Signalwarteoperation fehlt der Empfang oder die Anwendung, oder für die Anwendung ist kein Wert aufgezeichnet. |
| `mismatched_signal_receipt` | Ein Signalempfang nennt einen anderen Lauf, eine andere Instanz, einen anderen Befehl oder eine andere Warteoperation, ein Empfang wird auf zwei Warteoperationen angewendet, oder ein wiederverwendetes Signalereignis hat nur eines von `reused_from_run_id` und `reused_recorded_at` oder nennt eine andere Quelle. |
| `unsupported_pending_update` | Der Lauf hat ein Update angenommen, das er weder angewendet noch geschlossen hat. |
| `mismatched_update_history` | Die Ereignisse eines Updates entsprechen keiner der zulässigen Formen, nennen einen anderen Lauf, ein anderes Update, einen anderen Befehl oder Handler, ändern die Argumente zwischen Annahme und Anwendung oder haben ein unvollständiges Paar aus `reused_from_run_id` und `reused_recorded_at`. |
| `incomplete_update_step` | Ein angewendetes Update hat keinen erfolgreichen Abschluss mit Ergebnis. |
| `invalid_step_sequence` | Ein wiederverwendeter Schritt hat keine gültige Schrittnummer. |
| `duplicate_step_sequence` | Zwei wiederverwendete Schritte haben dieselbe Schrittnummer. |
| `external_activity_result_not_supported` | Ein abgeschlossenes Aktivitätsergebnis liegt im externen Payload-Speicher. |
| `external_side_effect_result_not_supported` | Ein Seiteneffekt-Ergebnis liegt im externen Payload-Speicher. |
| `external_signal_payload_not_supported` | Die Argumente oder der angewendete Wert eines Signals liegen im externen Payload-Speicher. Jeder `external_storage`-Schlüssel zählt, auch ein leerer (null). |
| `external_update_payload_not_supported` | Die Argumente oder das Ergebnis eines Updates liegen im externen Payload-Speicher. |
| `unavailable_update_payload` | Die inline gespeicherten Argumente oder das Ergebnis eines Updates lassen sich nicht decodieren. |
| `missing_activity_result`, `unavailable_activity_result` | Ein abgeschlossenes Aktivitätsergebnis fehlt oder lässt sich nicht dekodieren. |
| `unsupported_visibility_metadata` | Der Workflow-Code hat ein Memo oder Suchattribut an einem Schritt geschrieben, den der Nachfolger nicht wiederverwenden würde. |
| `unsupported_source_metadata` | Der Lauf wurde als Child eines anderen Workflows gestartet. |
| `unsupported_source_link_or_payload` | Der Lauf ist als Child eines anderen Workflows verknüpft, oder seine Eingabe liegt im externen Payload-Speicher. |
| `execution_deadline_elapsed` | Die Ausführungsfrist ist abgelaufen. |
| `workflow_definition_unavailable_or_changed` | Der Definitions-Fingerprint fehlt oder weicht von dem beim Start aufgezeichneten ab, und `allow_definition_change` wurde nicht übergeben. |
| `definition_incompatible_with_prefix` | Der korrigierte Code kann die abgeschlossenen Schritte nicht erneut abspielen. `definition_mismatch` nennt den ersten abweichenden Schritt. |
| `definition_check_over_budget` | Die abgeschlossene Historie ist größer als das Historienbudget, das die Replay-Prüfung zulässt. |
| `definition_change_requires_replay_check` | Ein Service-Worker hat den Lauf gestartet. Daher kann Redrive eine geänderte Definition nicht prüfen. |
| `service_redrive_history_not_qualified` | Ein Service-Worker hat den Lauf gestartet, und die Schritte vor dem Fehler enthalten einen Memo-Upsert, einen Suchattribut-Upsert, eine Signalwarteoperation oder ein angewendetes Update. Redrive lehnt diese Schritte für Läufe im Servicemodus ab, bis es für jede SDK-Laufzeit prüfen kann, ob sie diese Schritte per Replay verarbeiten kann. |
| `request_id_already_used` | Die `request_id` wurde bereits für einen anderen Redrive der Instanz verwendet. |
| `already_redriven` | Wird von den Laufdetails und `describe()` für einen Lauf gemeldet, der bereits per Redrive fortgesetzt wurde. Eine Redrive-Anfrage dafür gibt stattdessen den vorhandenen Nachfolger zurück. |
| `invalid_request_id` | Die `request_id` ist länger als 191 Zeichen. |
| `run_not_found`, `instance_not_found` | Der Lauf oder die Instanz existiert im Namespace nicht. |

Die übrigen Gründe melden eine Historie, die nicht die erwartete Form hat: `invalid_history`, `events_after_failure`, `duplicate_start`, `missing_start`, `unexpected_start`, `missing_terminal_history`, `invalid_activity_sequence`, `activity_sequence_gap`, `missing_activity_type`, `activity_type_mismatch`, `duplicate_activity_completion`, `incomplete_activity_prefix` und `invalid_failed_step`. Exportieren Sie die Historie des Laufs und prüfen Sie sie, bevor Sie über die Wiederherstellung entscheiden.

Wenn Redrive einen Lauf ablehnt, bewahren Sie seine Historie auf, gleichen Sie externe Seiteneffekte ab und entscheiden Sie, ob die Anwendung einen neuen Workflow starten soll.

### Prüfen, ob ein Lauf fortgesetzt werden kann {#redrive-check}

In Workflow 2.18.0 und später melden die Laufdetails `can_redrive` und `redrive_blocked_reason`. Waterlines Detailansicht des ausgewählten Laufs liest diese Felder. `WorkflowControlPlane::describe()` meldet dieselben Felder unter `actions`. Sie stammen aus derselben Prüfung, die `redrive()` anwendet. So sehen Sie vor der Anfrage, ob ein Lauf fortgesetzt werden kann und warum nicht.

Ein nicht fehlgeschlagener Lauf meldet `run_not_failed`. Ein bereits fortgesetzter Lauf meldet `already_redriven`. Bei einem Lauf im Servicemodus prüft der Bericht nur, ob ein Fingerprint aufgezeichnet wurde. `redrive()` vergleicht ihn weiterhin mit dem Fingerprint des Workers. Der Bericht führt die Replay-Prüfung für korrigierten Code nicht aus. Eine geänderte Definition zeigt daher `workflow_definition_unavailable_or_changed`, bis Sie den Redrive mit `allow_definition_change` anfordern.

In Workflow 2.19.0 und später meldet ein Nachfolger, der korrigierten Code ausführt, den ersetzten Fingerprint als `workflow_definition_changed_from` in den Laufdetails und als `run.definition_changed_from` in `describe()`.

In Workflow 2.20.0 und später melden die Laufdetails und `describe()` die Redrive-Verknüpfung als typisierte Herkunft. `parents` des Nachfolgers und `continuedWorkflows` des fehlgeschlagenen Laufs führen sie mit `link_type: redrive` und `history_authority: typed_history` und übernehmen Schritt und Zeitpunkt aus dem `WorkflowStarted` des Nachfolgers. Eine Verknüpfung, die die Historie nicht bestätigt, erscheint einmal mit `history_authority: mutable_open_fallback` und `diagnostic_only: true`.

### Frühere Releases und der native Server {#redrive-earlier-releases}

Workflow 2.20.0 lehnt nichts ab, was 2.20.1 annimmt. In 2.20.0 senden oder konsumieren `outbox()->sendReference()` und `inbox()->receive()` in wiederverwendetem Workflow-Code erneut ([workflow#1010](https://github.com/durable-workflow/workflow/issues/1010)).

Workflow 2.19.0 lehnt ein angewendetes Update ab (`unsupported_history`). Es lehnt außerdem den Redrive eines Nachfolgers ab, der ein Update (`unsupported_history`) oder eine Signalwarteoperation (`mismatched_signal_receipt`) wiederverwendet hat. Laufdetails und `describe()` zeigen Redrive-Verknüpfungen als diagnostischen Fallback.

Workflow 2.18.0 verwendet abgeschlossene Aktivitäten, Seiteneffekte, Versionsmarker und ausgelöste Timer wieder. Es lehnt ein Memo oder Suchattribut ab, das der Workflow-Code per Upsert gesetzt hat (`unsupported_history`), ebenso eine Signalwarteoperation (`unsupported_history`), einen im Workflow-Code fehlgeschlagenen Lauf (`unrecorded_failure_boundary`) und eine geänderte Definition (`workflow_definition_unavailable_or_changed`).

Workflow-Releases vor 2.18.0 nehmen weniger Läufe an. Jeder Schritt vor der fehlgeschlagenen Aktivität muss eine abgeschlossene Aktivität sein. Ein Seiteneffekt, Versionsmarker oder Timer in dieser Historie wird mit `unsupported_history` abgelehnt, und jedes Memo oder Suchattribut wird mit `unsupported_visibility_metadata` abgelehnt. Laufdetails und `describe()` melden weder `can_redrive` noch `redrive_blocked_reason`.

Releases vor 2.19.0 ignorieren `reused_recorded_at` bei wiederverwendeten Signal-, Memo- und Suchattribut-Schritten. Nachdem ein Nachfolger aus Workflow 2.19.0 oder später diese Schritte wiederverwendet hat, behalten Sie Worker ab 2.19.0 bei oder stellen Sie vor einem Rollback sicher, dass keine solche Historie per Replay verarbeitet werden kann. Im Embedded-Modus verarbeitet Workflow 2.19.0 einen 2.20.0-Nachfolger, der ein Update oder eine verkettete Signalwarteoperation wiederverwendet hat, beim Replay, Import und Fortsetzen genauso wie 2.20.0 ([Qualifizierungsnachweis](https://github.com/durable-workflow/workflow/issues/864#issuecomment-6617902412)).

Redrive im nativen Server wendet weiterhin die Regeln von vor 2.18.0 an. Die Unterstützung der aktuellen Regeln im nativen Server wird in [server#980](https://github.com/durable-workflow/server/issues/980) verfolgt.

## Ablehnung am Einstieg im Servicemodus und Wiederherstellung {#service-entry-recovery}

**Veröffentlichte Unterstützung.** Server 2.9.9 sowie PHP SDK 2.5.4, Python SDK 2.6.2 und Rust SDK 3.5.6 haben den Einstiegsschutz und das nachfolgend beschriebene Routing-/Wiederherstellungsverhalten eingeführt. Dies sind die Mindestversionen für diese Funktionen. Installieren Sie aktuelle stabile Versionen, um Sicherheitskorrekturen zu erhalten.

Eine Unvereinbarkeit am Einstieg ist eine Bereitstellungs- oder Replay-Ablehnung, bevor Anwendungscode des Workflows ausgeführt wird. Sie ist weder eine Aktivitätswiederholung noch ein terminaler fachlicher Fehler. Der Worker meldet `failure_reason = workflow_entry_arguments_mismatch`, und der Server behält die fehlgeschlagene Workflow-Aufgabe mit `replay_blocked = true`, statt automatisch einen weiteren Versuch anzulegen. Der allgemeine `replay_blocked_reason` lautet `worker_reported_replay_failure`. Der Lauf bleibt nichtterminal; aufgezeichnete Eingabe, Historie und Fristen bleiben erhalten. Das unterscheidet sich von einer Ausnahme im erfolgreich betretenen Workflow-Rumpf, die den Lauf weiterhin fehlschlagen lassen kann.

Stellen Sie den Lauf erst nach Prüfung des tatsächlichen dauerhaften Zustands wieder her:

1. Prüfen Sie den ausgewählten Lauf mit `GET /api/workflows/{workflowId}/runs/{runId}/debug`. Bestätigen Sie, dass `latest_workflow_task_failure.reason` den Wert `workflow_entry_arguments_mismatch` hat und der ursprüngliche Lauf noch offen ist. Dieses Verfahren öffnet keinen terminalen Lauf erneut.
2. Stellen Sie Code bereit, der die aufgezeichneten positionellen Argumente oder die typisierte Eingabe akzeptiert. Bewahren Sie ursprüngliche Workflow-/Lauf-ID, Namespace, Warteschlange, Build-Kompatibilität, Historie und Fristen. Bearbeiten Sie niemals gespeicherte Eingaben und ersetzen Sie diese nicht durch DTO-Standardwerte.
3. Prüfen Sie über das [Routing nach Definition](./polyglot/worker-compatibility-routing.md#definition-fingerprint-evolution), dass ein geeigneter Worker verfügbar ist. Eine Reparatur erzeugt keinen Worker und beweist keine Replay-Kompatibilität.
4. Verwenden Sie `POST /api/workflows/{workflowId}/runs/{runId}/repair` mit den üblichen autorisierten Operator-Zugangsdaten und dem Namespace. Die Route für den ausgewählten Lauf lehnt ein historisches Ziel ab, statt stillschweigend einen neueren Lauf zu reparieren. PHP bietet außerdem `Client::repairWorkflow($workflowId, $runId)`; Pythons `repair_workflow(workflow_id)` zielt auf die aktuelle Instanz, und Rust hat keine entsprechende komfortable Reparaturmethode.
5. Prüfen Sie, dass derselbe ursprüngliche Lauf mit seiner aufgezeichneten Eingabe und seinem Historienpräfix fortgesetzt wird und sein erwartetes Ergebnis einmal aufzeichnet. Eine bereits abgelaufene ursprüngliche Frist gilt weiterhin. Bleibt der Ersatz inkompatibel, untersuchen Sie die neue Ablehnung, statt die Reparatur wiederholt auszulösen.

Ältere Serverversionen können den spezifischen SDK-Grund speichern, ohne ihn als Replay-Blockade einzustufen. Die Fehlermeldung allein belegt daher noch nicht den Vertrag ohne automatische Wiederholung. Verwenden Sie die qualifizierte Kombination aus Laufzeit und SDK. [Versionierung](./features/versioning.md#service-sdk-entry-safeguard) erläutert die Sprachgrenzen; [Workflow-Befehle](./polyglot/server-api-reference.md#workflow-commands) beschreibt die authentifizierten Routen für ausgewählte Läufe.

## Workflow-Zeitlimits durchsetzen {#workflow-timeout-enforcement}

Mit `StartOptions::withExecutionTimeout()` oder `StartOptions::withRunTimeout()` speichert die Engine eine Frist im Workflow-Lauf. Die Ausführungsfrist gilt für den gesamten logischen Workflow einschließlich Continue-as-new-Läufen. Die Lauffrist beginnt mit jedem neuen Lauf erneut.

Ist die Frist beim Start einer Workflow-Aufgabe abgelaufen, wird der Lauf sofort geschlossen:

- Offene Aktivitätsausführungen, Timer und Aufgaben werden mit typisierten Ereignissen wie `ActivityCancelled` und `TimerCancelled` abgebrochen.
- Ein `WorkflowFailure`-Eintrag erhält `failure_category = timeout` und `propagation_kind = timeout`.
- Ein `WorkflowTimedOut`-Ereignis erhält `timeout_kind = execution_timeout` oder `run_timeout`.
- Der Laufstatus wird `failed` mit `closed_reason = timed_out`.
- Übergeordnete Workflows, die auf den untergeordneten Lauf warten, werden benachrichtigt.

Der Aufgaben-Watchdog sucht außerdem nach noch offenen Läufen mit abgelaufener Frist und ohne offene Workflow-Aufgabe. Das betrifft etwa Läufe, die beim Fristablauf auf eine Aktivität oder einen Timer warten. Er erzeugt eine Workflow-Aufgabe, damit der Executor das Zeitlimit beim nächsten Durchlauf erkennt und durchsetzt.

Waterline zeigt `failure_category` in einer eigenen Kategoriespalte der Exception-Tabelle und in den Fehlerdetails der Zeitleiste. Historienexporte enthalten das Feld im Array `failures[*]`. Die finale v2-Version speichert die Klassifizierung beim Auftreten des Fehlers. Nicht klassifizierbare importierte v1-Einträge bleiben als unklassifizierte Diagnosen sichtbar.

## Aktivitäts-Wiederholungsversuche {#activity-retries}

Für ein gemeinsames Versuchslimit über Workflows und Queues kombinieren Sie festgelegte Wiederholungen mit [Server-Admission und Anwendungs-Breaker](./polyglot/task-queue-admission.md#retry-load-and-downstream-budgets). Erstversuche und Wiederholungen zählen; lokale/eingebettete Ausführung hat andere Grenzen.

`Workflow\V2\Activity` verwendet standardmäßig `$tries = 1`. Ein Fehler wird deshalb sofort an den Workflow weitergegeben, sofern die Aktivität keine weiteren Versuche konfiguriert.

```php
use RuntimeException;
use Workflow\V2\Activity;

class ChargeCard extends Activity
{
    public int $tries = 3;

    public function backoff(): array
    {
        return [5, 30];
    }

    public function handle(): string
    {
        throw new RuntimeException('temporary gateway failure');
    }
}
```

Begrenzen Sie im Workflow-Code die Gesamtdauer der Aktivität einschließlich der Wartezeiten in der Queue und zwischen den Versuchen:

```php
use Workflow\V2\Support\ActivityOptions;
use function Workflow\V2\activity;

$result = activity(ChargeCard::class, new ActivityOptions(
    scheduleToCloseTimeout: 120,
));
```

Diese Einstellungen erlauben zusammen höchstens drei Versuche mit Pausen von 5 und 30 Sekunden innerhalb der ursprünglichen Schedule-to-close-Frist von 120 Sekunden. Eine frühere Workflow-Frist gilt weiterhin. Aktivieren Sie Wiederholungen nur für Vorgänge, die sicher wiederholt werden können, und schützen Sie externe Nebenwirkungen durch Idempotenzprüfungen.

Wirft eine wiederholbare Aktivität eine Exception, bevor `$tries` ausgeschöpft ist, schließt die Engine den aktuellen `activity_attempts`-Eintrag. Sie setzt `activity_executions` auf `pending`, speichert ein typisiertes `ActivityRetryScheduled`-Ereignis und erzeugt eine neue dauerhafte Aufgabe. Deren `available_at` folgt der `backoff()`-Richtlinie. Der Workflow wartet weiter auf dieselbe logische Aktivitätsausführung. Er erhält die Exception erst, wenn auch der letzte wiederholbare Versuch fehlschlägt.

Der Payload der Wiederholungsaufgabe enthält `retry_of_task_id`, `retry_after_attempt_id`, `retry_after_attempt` und `retry_backoff_seconds`. Damit kann Waterline erklären, warum die Aufgabe geplant wurde. Die Laufdetails rekonstruieren den fehlgeschlagenen Versuch in `activities[*].attempts` zuerst aus der typisierten Historie und zeigen `ActivityRetryScheduled` in der Zeitleiste. Wiederholungszahlen erscheinen unter `operator_metrics.activities.retrying`, `operator_metrics.activities.failed_attempts` und `operator_metrics.backlog.retrying_activities`.

`Workflow\Exceptions\NonRetryableExceptionContract` beendet die Wiederholungsrichtlinie sofort. Eine solche Exception lässt die Aktivitätsausführung unmittelbar fehlschlagen und setzt den Workflow mit der Exception fort.

### Auflösung der Wiederholungsverzögerung {#retry-delay-resolution}

Die Werte von `backoff()` einer Aktivität sind ganze Sekunden. Dauerhafte
Wiederholungsintervalle haben eine Auflösung von einer Sekunde. Verwenden Sie keinen
Bruchteil wie `0.1`, um eine Wiederholung nach 100 ms anzufordern. SDK-APIs, die
Intervalle aus Sekundenbruchteilen erzeugen, runden auf die nächste volle Sekunde
auf. Die Python- und Rust-SDK-Referenzen beschreiben die zulässigen Parametertypen
und Umrechnungen.

Nach Ablauf der Verzögerung darf der nächste Versuch starten. Queue-Latenz und
Worker-Auslastung können ihn weiter verzögern. Für schnelle Tests eignen sich
[kontrollierte Zeit oder begrenzte Testfälle ohne Verzögerung](./testing.md#keeping-delay-tests-fast).

### Aktivitätskennung und Idempotenz {#activity-execution-identity-and-idempotency}

Wiederholungsversuche sind nicht die einzige Ursache mehrfacher Aktivitätsausführung. Abgelaufene Leases, Worker-Verlust, verspätete Berichte und erneute Zustellung können einen weiteren Versuch oder einen veralteten Abschlussbericht erzeugen.

- `activity_execution_id` kennzeichnet die logische Aktivität über Versuche und Zustellungen hinweg. Nutzen Sie sie als Standard-Idempotenzschlüssel für externe Nebenwirkungen.
- `activity_attempt_id` kennzeichnet einen einzelnen Versuch. Nutzen Sie sie nur, wenn das Zielsystem einzelne Versuche unterscheiden muss.
- Ein verspäteter Abschluss- oder Fehlerbericht eines abgelösten Versuchs ist normales Verhalten veralteter Versuche. Er beweist keinen doppelt festgeschriebenen Versuch.

Bei einem verspäteten Abschluss nach Lease-Ablauf:

- Prüfen Sie in Waterline, im Historienexport oder in der Server-API, welcher Versuch das dauerhafte Ergebnis festgeschrieben hat.
- Nehmen Sie bei einem abgelehnten Bericht nicht an, dass die externe Nebenwirkung ausgeblieben ist.
- Prüfen Sie das externe System anhand seines Idempotenzschlüssels, bevor Sie eine manuelle Wiederholung oder Reparatur erzwingen.

Die sichere Voreinstellung ist eine unter `activity_execution_id` idempotente externe Operation. Das dauerhafte Ergebnis zeigt dann, ob die Engine den Bericht dieses Versuchs angenommen hat.

### Kennzeichnung nicht wiederholbarer Fehler {#non-retryable-failure-markers}

Wirft eine Aktivität oder ein Workflow eine Exception mit `Workflow\Exceptions\NonRetryableExceptionContract`, speichert die Engine `non_retryable = true` im `WorkflowFailure`-Eintrag und im Payload des typisierten Ereignisses (`ActivityFailed`, `WorkflowFailed`, `UpdateCompleted`). Dieses dauerhafte Merkmal kennzeichnet einen permanenten Fehler, für den dieselbe Operation nicht wiederholt werden soll.

Das Merkmal wird durch die gesamte Sichtbarkeitsschicht weitergegeben:

- **Fehlereinträge:** boolesche Spalte `workflow_failures.non_retryable`.
- **Historienereignisse:** Feld `non_retryable` im typisierten Payload.
- **Fehler-Snapshots:** `non_retryable` in `FailureSnapshots::forRun()`.
- **Laufdetails:** `non_retryable` im Exception-Array.
- **Zeitleiste:** `non_retryable` in den Fehlerdetails.
- **Historienexport:** `non_retryable` im Array `failures[*]`.
- **Waterline:** eine Kennzeichnung „non-retryable“ neben der Fehlerkategorie in Exception-Tabelle und Zeitleiste.
- **Externe Worker-Brücke:** der `complete()`-Payload akzeptiert `non_retryable`. Externe Worker können permanente Fehler melden, ohne dass der Host-Prozess die Exception-Klasse auflösen muss.

Ohne diesen Vertrag ist `non_retryable` standardmäßig `false`. Die finale v2-Version speichert das Merkmal beim Auftreten des Fehlers. Deklarieren Sie den Vertrag vorher, wenn Betreiber oder SDKs permanente und wiederholbare Fehler unterscheiden müssen.

```php
use Workflow\Exceptions\NonRetryableExceptionContract;

class PaymentDeclinedException extends \RuntimeException implements NonRetryableExceptionContract
{
    // This failure will be marked as non-retryable in the durable record.
}
```

## Wiederholung auf Workflow-Ebene {#workflow-level-retry}

Durable Workflow v2 unterstützt keine automatische Wiederholung eines fehlgeschlagenen Workflow-Laufs. Unbehandelte Exceptions, strukturelle Grenzen und Zeitlimits können einen Lauf endgültig beenden. Die Engine startet dann nicht automatisch einen neuen Lauf derselben Instanz.

Diese Entscheidung folgt dem Ausführungsmodell:

- **Aktivitäten besitzen Wiederholungsrichtlinien.** `$tries`, `backoff()` und nicht wiederholbare Exceptions behandeln vorübergehende Fehler auf der passenden Ebene.
- **Workflow-Replay stellt Arbeit wieder her.** Bei vorübergehenden Infrastrukturfehlern wie Datenbankfehlern oder Worker-Abstürzen wird die dauerhafte Aufgabe erneut zugestellt. Replay setzt anhand der festgeschriebenen Historie fort, ohne einen neuen Lauf zu starten.
- **Continue-as-new unterstützt lang laufende Workflows.** `continueAsNew()` beginnt explizit mit frischem Zustand oder einer frischen Historie.
- **Reparatur stellt festhängende Arbeit wieder her.** `repair()` und automatische Worker-Loop-Reparatur beheben verlorenen Transport dauerhafter Aufgaben.
- **Redrive ist eine ausdrückliche Operator-Aktion.** [Redrive](#redrive) setzt einen fehlgeschlagenen Lauf nur auf Ihre Anforderung in einem neuen Lauf fort und verwendet abgeschlossene Aktivitätsergebnisse wieder.

Benötigt Ihre Anwendung Wiederholungen auf Workflow-Ebene, modellieren Sie sie explizit:

```php
use function Workflow\V2\activity;
use Throwable;
use Workflow\V2\Workflow;

class RetryableWorkflow extends Workflow
{
    public function handle(string $orderId): void
    {
        try {
            activity(ProcessOrderActivity::class, $orderId);
        } catch (Throwable $e) {
            // Record the failure, then start a new workflow
            // for retry-at-workflow-level scenarios.
            activity(NotifyFailureActivity::class, $orderId, $e->getMessage());
        }
    }
}
```

## Limits für PHP-Fehlerberichte im Service-Modus {#php-failure-report-limits}

Das PHP SDK **ab 3.5.0** begrenzt ausgehende Fehlerberichte im Service-Modus auf 62 KiB UTF-8 für Meldungen, 128 KiB für Stacks, 64 KiB für optionale Metadaten zusammen und 1 MiB für den vollständigen codierten Body einschließlich Markierungen. Niedrigere bekannte Transportlimits gelten weiterhin. Der [PHP-Leitfaden für Fehlerberichte](./polyglot/php.md#bounded-failure-reports) erläutert Konfiguration, Auslassungsdiagnosen, unveränderte Retry-Semantik und identische Beobachtungen bei erster Ausführung und kaltem Replay. Diese Grenzen gelten für SDK-Berichte. Eingebettete Fehleraufzeichnung und Core-Summary-Speicherung haben eigene Verträge.

## Limits für Python-Fehlerberichte im Service-Modus {#python-failure-report-limits}

Das Python SDK **ab 2.11.0** begrenzt ausgehende Fehlerberichte im Service-Modus auf 62 KiB UTF-8 für Meldungen, 128 KiB für Stacks, 64 KiB für optionale Metadaten zusammen und 1 MiB für den vollständigen codierten Body einschließlich Markierungen. Niedrigere bekannte Transportlimits gelten weiterhin. Der [Python-Leitfaden für Fehlerberichte](./polyglot/python.md#bounded-failure-reports) erläutert Konfiguration, Auslassungsdiagnosen, unveränderte Retry-Semantik und identische Beobachtungen bei erster Ausführung und kaltem Replay. Diese Grenzen gelten für SDK-Berichte. Eingebettete Fehleraufzeichnung und Core-Summary-Speicherung haben eigene Verträge.

## Grenzen für Rust-Fehlerberichte im Service-Modus {#rust-failure-report-limits}

Bei Service-Workern mit tatsächlich laufendem Rust SDK **4.10.1 oder neuer** hat die ausgehende UTF-8-Nachricht höchstens 62 KiB einschließlich Markierung, ein unterstützter Stack 128 KiB, gemeinsam serialisierte optionale Metadaten 64 KiB und der vollständige kodierte Body 1 MiB oder eine bekannte niedrigere Transportgrenze. Typ, Retry-Entscheidung und Identität bleiben erhalten; unmögliche Pflichthüllen werden ausdrücklich abgelehnt. Der [Rust-Leitfaden](./polyglot/rust.md#bounded-failure-reports) erklärt Markierungen, vollständige Avro-Details und lokale Ergebnisse. Ältere SDKs, Embedded-Modus und die separate Core-Speicherkorrektur sind damit nicht qualifiziert.

## Weitere Leitfäden {#related-guides}

- [Ausführungsgarantien und Idempotenz](./constraints/execution-guarantees.md) erklärt Replay, Wiederholungsversuche, Lease-Ablauf und erneute Zustellung.
- [Monitoring](./monitoring.md) zeigt die Fehlerdaten in Waterline, Historienexporten, Worker-Protokollen und Laufzeittelemetrie.
