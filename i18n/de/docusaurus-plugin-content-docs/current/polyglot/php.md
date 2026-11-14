---
sidebar_position: 9
title: PHP SDK
description: Frameworkunabhängige PHP-Anwendungen und entfernte Worker mit einem selbst gehosteten Server oder einer verwalteten Cloud-Laufzeitumgebung verbinden.
tags:
  - php
  - sdk
  - workers
  - polyglot
keywords:
  - sample-app-playground
  - Durable Workflow PHP SDK
  - entfernter PHP-Worker
  - PHP-Client für eigenständigen Server
---

import ProductPromotion from '@site/src/components/ProductPromotion';

# PHP SDK {#php-sdk}

Verwenden Sie `durable-workflow/sdk`, wenn eine PHP-Anwendung oder ein entfernter
Worker eine Verbindung zum eigenständigen Durable Workflow Server oder zu einer
Namespace-Laufzeit-URL von Durable Workflow Cloud herstellt. Dieses offizielle
SDK ist frameworkunabhängig: Es bietet Control-Plane-Client, Authentifizierung,
Transport, öffentlichen Nutzlast-Codec, Replay-Handler und verwalteten
Remote-Worker-Lebenszyklus, ohne Laravel oder das eingebettete Engine-Paket vorauszusetzen.

## Die lokale Testumgebung der Sample App ausprobieren {#try-the-local-sample-app-playground}

Für den kürzesten Einstieg in die Implementierung ohne Cloud öffnen Sie den
aktuellen [`main`-Branch der Sample App in GitHub Codespaces](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main)
und führen Sie aus:

<!-- docs-example id="sdk.php.sample-app-playground" -->
```bash
scripts/playground php
```

Die lokale Testumgebung erzeugt Workflow- und Aktivitätsquellcode unter der
Verantwortung des Aufrufers, wählt aktuelle stabile Artefakte und startet die
veröffentlichten Server- und Waterline-Versionen. Vor dem Workflow-Start wartet
sie auf eine Worker-Registrierung, deren Identität, Workflow-Typ, Aktivitätstyp
und Task-Warteschlange zum erzeugten Vertrag passen. Erfolg erfordert das
erwartete abgeschlossene Ergebnis und die Historie. Anschließend gibt das
Terminal den genauen lokalen Waterline-Lauflink und den Pfad zum strukturierten
JSON-Nachweis aus.

Der paketeigene Schnellstart und die API-Referenz unten bleiben der direkte Weg,
um das SDK ohne Sample App zu einem bestehenden Projekt hinzuzufügen.

<ProductPromotion source="docs-v2-php-sdk">
Führen Sie PHP-Clients und -Worker mit getrennten rollenspezifischen Zugangsdaten
gegen einen Cloud-verwalteten Namespace aus.
</ProductPromotion>

Für schrittweisen Einstieg, Framework-Wege, Tests, Bereitstellung und
Fehlerbehebung nutzen Sie das redaktionelle
[PHP-Entwicklerportal](https://php.durable-workflow.com/). Genaue
Konstruktorsignaturen, Rückgabetypen und Ausnahmeklassen stehen in dessen
separater [generierter API-Referenz](https://php.durable-workflow.com/api/).
Der [maschinenlesbare Vertrag](https://php.durable-workflow.com/quickstart-contract.json)
des Portals beschreibt Paket, Laufzeitformen, Rollen-Zugangsdaten, mitgelieferte
Quelldateien, erwartetes Ergebnis und Smoke-Test veröffentlichter Artefakte als
einen getesteten Weg.

Cloud-Kunden verwenden die bei der Bereitstellung zurückgegebene Laufzeit-URL
und den Namespace mit getrennten Client- und Worker-Zugangsdaten. Die
Verbindungsgrenze beschreibt [Verwaltete Cloud-Laufzeitumgebung](/docs/polyglot/cloud-control-plane).
Die Beispiele unten verwenden dasselbe SDK mit lokalen selbst gehosteten Werten.

Verwenden Sie `durable-workflow/workflow` für den separaten eingebetteten
Laravel-Weg. Dort hält die Anwendung den Workflow-Zustand in ihrer bestehenden
Datenbank und führt Arbeit über ihre Laravel-Warteschlangen aus. Den
vollständigen Zuständigkeitsvergleich finden Sie unter
[Bereitstellungsmodi](/docs/polyglot/deployment-modes/).

## Voraussetzungen {#requirements}

- PHP 8.1 oder neuer für das Framework-neutrale SDK
- Für die Laravel-Service-Modus-Brücke ab PHP SDK 3.10: PHP 8.2 oder neuer und
  Laravel 12.69 oder neuer in 12.x oder Laravel 13.30 oder neuer in 13.x mit
  PHP 8.3 oder neuer
- Ein erreichbarer [selbst gehosteter Server](/docs/polyglot/server/) oder eine
  bereitgestellte [Cloud-Namespace-Laufzeitumgebung](/docs/polyglot/cloud-control-plane)

## Installation {#install}

Installieren Sie das aktuell veröffentlichte PHP SDK. Die genaue Anforderung
unten wird aus der über Registries aktualisierten maßgeblichen Quelle für
veröffentlichte Artefakte erzeugt. Composer hält das aufgelöste Paket in
`composer.lock` fest:

<!-- docs-example id="php.sdk.install" -->
```bash
composer require %%artifact.publishedPhpSdkComposerPackage%%
```

Das SDK verwendet das offizielle Composer-Paket `apache/avro` für die öffentliche
Nutzlast-Envelope. Sein Produktionsabhängigkeitsgraph enthält weder Laravel
noch Illuminate, `durable-workflow/workflow` oder `durable-workflow/server`.

## Einen Workflow starten und untersuchen {#start-and-inspect-a-workflow}

Der SDK-eigene Schnellstart erstellt ein sauberes Composer-Projekt, definiert
einen Workflow und eine Aktivität mit Attributen, startet den Worker und einen
eindeutigen Workflow und wartet auf das Ergebnis. Dieselben mitgelieferten
Dateien `bootstrap.php`, `worker.php` und `client.php` werden aus dem Paket
installiert und durch den geschützten Smoke-Test veröffentlichter Artefakte
ausgeführt. Diese Seite pflegt deshalb keine zweite Codeauflistung.

Wählen Sie nur den Verbindungswert zur Laufzeitumgebung:

| Laufzeitumgebung | An `Client` übergebener Wert | Verhalten des SDK-Anfragepfads |
| --- | --- | --- |
| Selbst gehosteter Server | Bloßer Ursprung wie `http://localhost:8080` | Fügt ein `/api`-Segment hinzu; Aufrufer hängen `/api` nicht an. |
| Durable Workflow Cloud | Vollständige bereitgestellte URI wie `https://cloud.example/api/runtime/v1/namespaces/<runtime-id>` | Erhält den Namespace-Laufzeitpfad und hängt dahinter das Endpunkt-`/api` an. |

Öffnen Sie den [getesteten PHP-Weg](https://php.durable-workflow.com/) für genaue
Befehle und sichtbaren Quellcode. Client-Operationen lesen
`DURABLE_WORKFLOW_CLIENT_TOKEN`, Worker-Abfragen lesen
`DURABLE_WORKFLOW_WORKER_TOKEN`. Der Leitfaden hält diese Zugangsdaten in
getrennten Prozessen, ohne einen Wert auszugeben oder zu committen.

`Worker::register()` erkennt `#[Workflow]`- und `#[Activity]`-Handler in derselben
Quelldatei. Der Leitfaden dokumentiert auch die direkte Alternative
`registerWorkflow()`/`registerActivity()` für Code mit Callables. Der Bootstrap
erspart Nutzern die Auswahl des Autoloader-Pfads, wenn die mitgelieferten
Dateien in einem eigenständigen Projekt, SDK-Checkout, installierten Paket oder
einer Testumgebung/einem Container neben dem Composer-Verzeichnis `vendor/` laufen.

`WorkflowHandle` folgt dem aktuellen Lauf nach einem Continue-as-new-Übergang.
Verwenden Sie seine Methoden für ausgewählte Läufe, wenn eine Operation auf
einen bestimmten Lauf abgesichert bleiben muss.

## Lebenszyklus, Updates, Zeitpläne und Einblick {#lifecycle-updates-schedules-and-visibility}

Der aktuelle öffentliche Client bietet mehr als Ergebnisse ausgewählter Läufe:

- `WorkflowHandle` bietet `describe`, `result`, `signal`, `query`, `cancel` und
  `terminate` mit Varianten für ausgewählte Läufe zur laufspezifischen Absicherung.
- `Client` bietet `listWorkflows` mit Server-Filterung und Seitennavigation,
  `workflowHistory`, `updateWorkflow`, `cancelWorkflow` und `terminateWorkflow`.
- `requestCancellation()` fordert begrenzte Bereinigung durch kooperierende
  Worker an. Das bestehende `cancel()` und `cancelWorkflow()` schließen den
  Lauf sofort. Den Implementierungs- und Wiederherstellungsvertrag beschreibt
  [Kooperativer Abbruch](/docs/polyglot/cancellation).
- Zeitplanmethoden decken Erstellen, Beschreiben, Auflisten, Aktualisieren,
  Pausieren, Fortsetzen, Auslösen, Nachholen und Löschen ab.
- Betriebliche Einsicht umfasst `listNamespaces`, `listWorkers` und
  `listTaskQueues` mit passenden Beschreibungsmethoden.

Entfernte Worker registrieren Workflow-, Aktivitäts-, Abfrage- und Update-Handler
über `registerWorkflow`, `registerActivity`, `registerQuery` und `registerUpdate`.
Vollständige Parameter und Rückgabetypen stehen in der generierten
[PHP-SDK-API-Referenz](https://php.durable-workflow.com/api/).

## Wiederholungskontext und zugehöriger Lauf einer Aktivität {#activity-retry-context}

Das PHP SDK **ab 3.6.1** stellt `$context->retryInfo`, `$context->workflowId` und `$context->runId` in Aktivitäten im Service-Modus bereit. Mit `$context->retryInfo->isLastConfiguredAttempt() === true` erkennen Sie den letzten konfigurierten Versuch einer begrenzten Richtlinie. `attemptNumber` bewahrt die ursprünglich empfangene Versuchsnummer.

Der Snapshot unterscheidet drei Zustände: `policyProvided === false` bedeutet, dass die Richtlinie im Claim fehlt. Ein übergebener Wurzelwert `null` bezeichnet eine unbekannte ältere Richtlinie. Ein Objekt mit explizitem `max_attempts: null` bedeutet unbegrenzte Versuche. Ein Rückgabewert `null` von `maxAttempts()` allein belegt keine unbegrenzten Wiederholungen. Das SDK erfindet kein Standardbudget. Abbruch, nicht wiederholbare Fehler, das Ende des Workflows und abgelaufene Fristen können die Ausführung vor Ausschöpfung des Budgets beenden.

Workflow- und Lauf-ID bezeichnen den ursprünglichen zugehörigen Lauf. Fehlende ältere Identitäten bleiben `null`. Lokale Aktivitäten behalten bekannte Eltern-IDs, ohne eine Richtlinie für entfernte Aktivitäten zu erben. Prüfen Sie vor einem Signal an den zugehörigen Workflow beide IDs, binden Sie das Signal an `runId` und verwenden Sie über Wiederholungen hinweg dieselbe stabile Request-ID des Geschäftsereignisses.

Verarbeiten Sie Signale für das Geschäftsereignis idempotent. Eine stabile Request-ID allein garantiert keine einmalige Signalannahme.

Die [vollständigen Beispiele zum letzten Versuch und zum Signal an den eigenen Lauf](https://php.durable-workflow.com/build/workflows-activities/) stehen im PHP-SDK-Leitfaden.

## Logische Activity-Ausführungsidentität {#activity-identity}

PHP SDK **3.10.0 oder neuer** stellt die schreibgeschützte nullable Eigenschaft `ActivityContext::activityExecutionId` aus dem Activity-Claim bereit. Sie identifiziert die logische Activity über Wiederholungen hinweg. `workflowId` und `runId` bezeichnen die besitzende Workflow-Instanz und ihren Lauf; `activityAttemptId` bezeichnet einen Versuch. Ersetzen Sie eine fehlende logische Ausführungs-ID nicht durch eine Task-, Versuchs- oder Session-ID.

Das SDK erhält die empfangene nichtleere Zeichenfolge exakt. Fehlende, null, leere oder nicht als String empfangene Identitätswerte ergeben `null`. Verwenden Sie dann einen anwendungseigenen Geschäftsschlüssel. Das [Service-Key-Beispiel des SDKs](https://php.durable-workflow.com/build/workflows-activities/#inspect-retry-budget-and-the-owning-workflow) zeigt diesen Fallback; die [Eigenschaftsreferenz](https://php.durable-workflow.com/api/classes/DurableWorkflow-Worker-ActivityContext.html#property_activityExecutionId) definiert die öffentliche API. Begrenzen Sie Schlüssel auf Anwendung und Effekt, verwenden Sie verschiedene Schlüssel für verschiedene Effekte und gleichen Sie ungewisse Ergebnisse mit dem Ziel ab. Identität ist öffentliche Metadateninformation, keine Claim-Autorität oder Garantie genau einmal ausgeführter externer Effekte.

Gewöhnliche und kooperativ überwachte Remote-Callbacks lesen das tatsächliche Claim-Feld. Session-Callbacks liefern es nur, wenn ihr Claim es enthält. Inline-lokale und Server-freie Callbacks ohne Server-Zulassung haben `null` als Ausführungsidentität, auch bei bekannten Eltern-Workflow-/Run-IDs. Historischer Prepared-local-Quellcode reicht seine validierte Zulassungs-ID weiter; dieses Quellverhalten belegt keine native Prepared-local-Unterstützung. Dies sind Quell-/Datenflussgrenzen, keine installierten Retry-Beobachtungen für jeden Ausführungsmodus.

## Aktivitäts-Heartbeats {#activity-heartbeats}

Rufen Sie bei entfernten Aktivitäten `ActivityContext::heartbeat($details)` während begrenzter Aktivitätsarbeit deutlich vor dem konfigurierten Heartbeat-Zeitlimit auf. Das erste Zeitfenster beginnt mit der Beanspruchung durch die Laufzeit, nicht beim Empfang der Aufgabe in PHP. Anfragelatenz, Pausen und Transportwiederholungen verbrauchen dieses Zeitfenster. Beachten Sie die [Taktempfehlungen](../features/heartbeats.md#heartbeat-cadence-and-receipts).

Die Methode gibt `void` zurück. Im direkten Handler-Pfad löst eine Stoppantwort `ActivityCancelled` aus. HTTP- und Transportfehler von `Client::heartbeatActivityTask()` erscheinen als `ServerException`. Ein kooperativ überwachter Worker kann seinen Callback bei einem fehlgeschlagenen Heartbeat oder einer Besitzprüfung stoppen oder aufgeben, statt dem Aktivitätscode eine normale Antwort zuzustellen. Verlassen Sie sich nicht darauf, dass Bereinigungscode immer läuft. Unterdrücken Sie keinen Fehler wegen verlorener Befugnis und melden Sie danach keinen Erfolg.

Eine Rückkehr aus dem Aufruf schreibt externe Arbeit nicht fest und liefert keinen fortsetzbaren Prüfpunkt. Halten Sie externe Effekte idempotent und behandeln Sie eine Transportwiederholung nicht als neues Heartbeat-Zeitfenster.

## Einen entfernten PHP-Worker ausführen {#run-a-remote-php-worker}

Workflow-Handler sind gewöhnliche Callables, die als geradliniger Code in einer
verwalteten Fiber laufen. Rufen Sie Operationen wie `WorkflowContext::activity()`
direkt auf. Das SDK pausiert die Fiber bei dauerhaften Entscheidungen und gibt
beim Replay aufgezeichnete Ergebnisse zurück, ohne externe Aktivitäten zu
wiederholen. Deklarieren Sie einen Workflow nicht als Generator und geben Sie
keine `WorkflowContext`-Befehle mit yield aus: Generator-Ergebnisse werden
abgelehnt. Der verwaltete Worker registriert Workflow- und Aktivitätstypnamen,
fragt das öffentliche Worker-Protokoll ab, sendet Heartbeats, schließt Tasks ab
oder meldet Fehler und fährt bei verfügbarem `pcntl` geordnet herunter.

### Auswahl des ersten Abschlusses {#first-completion-selection}

Mit `WorkflowContext::select()` starten Sie unabhängige verzögerte Aktivitäten,
Kind-Workflows, Timer, Bedingungswarteoperationen oder verschachtelte gewöhnliche
Barrieren und setzen beim ersten dauerhaft festgeschriebenen Gewinner fort.
Das zurückgegebene `SelectionResult` enthält stabile Mitgliedsschlüssel und
-identitäten sowie ein Handle je Mitglied:

```php
$selected = $ctx->select([
    'resolver' => fn () => $ctx->activity('resolve-request', [$requestId]),
    'input' => fn () => $ctx->waitCondition(
        fn (): bool => $this->resolution !== null,
        key: 'resolution-ready',
    ),
    'deadline' => fn () => $ctx->sleep(2),
]);

if ($selected->key === 'deadline') {
    $selected->handles['resolver']->cancel();
}
```

Die Auswahl bricht Nichtgewinner nicht ab. Rufen Sie `await()` auf einem Handle
auf, um dessen späteres Ergebnis zu erhalten, oder `cancel()`, um expliziten
Abbruch aufzuzeichnen. Ein kalter Worker oder ein Replay abgeschlossener Historie
verwendet den aufgezeichneten Gewinner, selbst wenn doppelte oder spätere
Eingabe- und Terminalereignisse in anderer Reihenfolge zugestellt werden.
`cancel()` liefert void und meldet sein terminales Ergebnis nicht. Nur die
Historie `SelectionOperationCancelled` belegt, dass Abbruch gewonnen hat.
Replay geht über eine unmarkierte Abbruchanfrage hinweg. Wurde die Operation
zuerst abgeschlossen, liefert `await()` weiterhin dieses Ergebnis.

### Dauerangaben {#durations}

Ab PHP SDK 3.9.0 akzeptieren Workflow-Timer und -Zeitlimits dieselben Dauerformen
wie das eingebettete Laravel-Paket. `sleep()`, `deferTimer()`, der `timeout` von
`waitCondition()` und `deferCondition()`, die Optionen für Aktivitätszeitlimits,
die Kind-Workflow-Optionen `execution_timeout_seconds` und `run_timeout_seconds`
sowie die Service-Operation-Option `wait_timeout_seconds` akzeptieren Sekunden
als int oder float, einen String wie `'30 minutes'` oder ein `DateInterval` bzw.
`CarbonInterval`:

```php
use Carbon\CarbonInterval;

$verified = $ctx->waitCondition(
    static fn (): bool => $ctx->signals('verify') !== [],
    key: 'email-verified',
    timeout: '30 minutes',
);

$ctx->sleep(CarbonInterval::hours(2));

$receipt = $ctx->activity('payments.capture', [$orderId], [
    'start_to_close_timeout' => '30 seconds',
    'schedule_to_close_timeout' => '10 minutes',
]);
```

Jeder Wert wird einmalig in ganze Sekunden umgerechnet und dabei aufgerundet.
Daher zeichnen `'30 minutes'`, `1800` und `CarbonInterval::minutes(30)`
dieselbe Historie auf. Strings werden genau wie beim eingebetteten `timer()` und
`await()` umgerechnet. Das SDK lehnt ISO-8601-Strings wie `'PT30M'` (übergeben
Sie stattdessen `new DateInterval('PT30M')`), negative Werte, Bruchteile eines
Monats oder einer längeren Kalendereinheit, Angaben mit mehr als 15 ganzzahligen Ziffern und
nicht parsebaren Text ab. Ein numerischer String wie `'30'` behält seine
bisherige Bedeutung: Timer und Bedingungszeitlimits runden ihn auf ganze
Sekunden auf, und Aktivitäts- und Kind-Workflow-Optionen geben ihn unverändert
weiter. Eine Dauer von null ist für Timer, Bedingungswarteoperationen und
`wait_timeout_seconds` gültig; Zeitlimits von Aktivitäten und Kind-Workflows
benötigen mindestens eine Sekunde. Frühere SDK-Releases akzeptieren nur
Sekunden. PHP SDK 3.9.0 fügt `nesbot/carbon` (`^2.72.6|^3.8.4`) als
erforderliche Abhängigkeit hinzu, sodass Dauerangaben mit demselben Parser wie
im eingebetteten Paket umgerechnet werden. Die
[Dauerreferenz des PHP SDK](https://php.durable-workflow.com/build/workflows-activities/#durations)
listet alle Einheiten auf.

## Kompatibilität am Einstieg und Wiederherstellung {#entry-compatibility-and-recovery}

**Veröffentlichte Unterstützung.** PHP SDK 2.5.4 hat den nachfolgenden Einstiegsschutz eingeführt, ergänzt durch Routing und Wiederherstellung in Server 2.9.9. Dies sind die Mindestversionen für diese Funktionen. Installieren Sie aktuelle stabile Versionen, um Sicherheitskorrekturen zu erhalten.

Der verwaltete Worker prüft die aufgezeichnete positionelle Eingabe des Handlers vor dem Eintritt in dessen Fiber. Fehlende erforderliche Argumente oder inkompatible deklarierte PHP-Typen lösen `DurableWorkflow\Exception\WorkflowEntryArgumentsMismatch` aus und melden den Aufgabengrund `workflow_entry_arguments_mismatch`. Optionale Standardwerte gelten nur für ausgelassene Eingaben; sie ersetzen niemals einen inkompatiblen aufgezeichneten Wert. Ein `TypeError` nach erfolgreichem Einstieg bleibt ein Anwendungsfehler.

Der Worker kündigt `workflow_entry_arguments_validation` automatisch an. Mit der passenden Serverunterstützung wird eine abgelehnte Aufgabe für Replay blockiert, während der ursprüngliche Lauf nichtterminal bleibt. Eine ältere Laufzeit kann die fehlgeschlagene Aufgabe stattdessen wiederholen; ein SDK-Upgrade allein belegt daher nicht den vollständigen Wiederherstellungsvertrag.

Prüfen Sie das Original mit `Client::describeWorkflow($workflowId, $runId)` und dem Debug-Endpunkt für den ausgewählten Lauf. Stellen Sie kompatiblen Code wieder her, bevor Sie `Client::repairWorkflow($workflowId, $runId)` aufrufen. Prüfen Sie anschließend, dass derselbe Lauf fortgesetzt wird, ohne Eingabe, Historie, Routing-Identität oder Fristen zu ändern. Fangen Sie diesen Fehler nicht im Workflow-Rumpf ab und reparieren Sie inkompatiblen Code nicht immer wieder. Siehe [Wiederherstellung im Servicemodus](../failures-and-recovery.md#service-entry-recovery) und [Routing nach Definition](./worker-compatibility-routing.md#definition-fingerprint-evolution).

## Framework-Service-Modus und eingebettetes Laravel {#framework-service-mode-and-embedded-laravel}

Dasselbe Paket liefert offizielle Brücken für den
[Laravel-Service-Modus](https://github.com/durable-workflow/sdk-php#laravel-service-mode)
und den [Symfony-Service-Modus](https://github.com/durable-workflow/sdk-php#symfony-service-mode).
Sie erhalten Dependency Injection, Konfiguration, Logging, Konsolen-Worker und
Test-Fakes der Frameworks bei der Verbindung zu Cloud oder Server.

Diese Brücken unterscheiden sich von
[eingebetteten Laravel-Workflows](/docs/installation/), bei denen
`durable-workflow/workflow` die Laravel-Anwendung selbst dauerhaften Zustand
halten und über Laravel-Warteschlangen ausführen lässt.
[Laravel-Einstieg und Laufzeitwechsel](/docs/laravel-adoption/) zeigt denselben
repräsentativen Laravel-Anwendungsfall in v1, eingebettetem v2 und dieser
ausgelieferten Service-Modus-Brücke, einschließlich Auslaufen und Rollback.
[Bereitstellungsmodi](/docs/polyglot/deployment-modes/) vergleicht die
Laufzeitgrenzen umfassender.

## Query-Ergebnisse mit Binärwerten {#query-binary-results}

PHP SDK 3.18.2 korrigiert Query-Completions für gültige Avro-Ergebnisse mit verschachtelten `AvroBinaryValue`-Bytes. `result_envelope` bleibt maßgeblich. Das SDK lässt nur die optionale einfache `result`-Projektion weg, wenn sie nicht JSON-kodiert werden kann; gewöhnliche JSON-kompatible Ergebnisse behalten diese Projektion.

[Kontrollen mit veröffentlichtem, installiertem PHP 3.18.2 / nativem Server 3.9.1](https://github.com/durable-workflow/sdk-php/pull/415#issuecomment-6858062312) (PHP 8.3.36, linux/amd64, SQLite) prüfen einen tatsächlichen Worker-Roundtrip für verschachtelte Binärbytes, gewöhnliches JSON, vorzeichenbehaftete Null und `null` sowie Workflow-Abschluss und geordnete Worker-Abmeldung. Dies ist eine kompatible Query-Korrektur; sie fügt keine Capability hinzu und belegt weder vollständige Request-Key- noch Timeout-Cleanup-Unterstützung. Siehe den [PHP-Query-Leitfaden](https://php.durable-workflow.com/build/messages/#register-a-read-only-query).

## Ein akzeptiertes Update später lesen {#read-an-update-outcome}

Das ausgewählte PHP SDK %%artifact.publishedPhpSdkVersion%% liest ein aufbewahrtes Update anhand seiner stabilen ID, ohne es erneut anzunehmen. `Client::updateOutcome($workflowId, $updateId)` verwendet standardmäßig `waitFor: 'completed'`: Ausstehende Arbeit löst `UpdateStillPending` aus; ein abgeschlossenes Ergebnis darf `null` sein. `updateOutcomeReceipt()` verwendet standardmäßig `waitFor: 'accepted'` und liefert den Server-Beleg, sodass `update_status` und `wait_timed_out` getrennt vom abgeschlossenen Ergebnis geprüft werden können.

Diese GET-Lesezugriffe benötigen die Capability `update_outcome_reads` (nativer Server ab 3.6.0). Ohne sie wirft das SDK `LogicException` und sendet das Update nicht erneut. Eine ausstehende erste `updateWorkflow()`-Annahme behält die Request-ID des Aufrufers. Ein ausstehender GET-Lesezugriff behält `updateId`, aber der ursprüngliche Request-Key kann fehlen: `$pending->requestId` ist dann `''`, also unbekannt. Lesen Sie mit dieser Update-ID weiter; senden Sie niemals einen leeren, abgeleiteten oder internen gehashten Schlüssel als ursprüngliche Request-ID.

Der [veröffentlichte PHP-Leitfaden](https://php.durable-workflow.com/build/messages/#apply-a-tracked-update) zeigt Handler und Client-Ablauf. [Kontrollen mit installiertem PHP 3.18.1 / nativem Server 3.9.1](https://github.com/durable-workflow/sdk-php/pull/411#issuecomment-6855609359) prüfen den Übergang von ausstehend zu abgeschlossenem null ohne zweite Update-Annahme sowie die [Behandlung der Completion-Größe](./server-config-reference.md#workflow-task-completion-size). Diese Nachweise belegen weder die vollständige Request-Key-Akzeptanz unter dem gemeinsamen #216 noch native Timeout-Cleanup-Unterstützung.

## Upgrade auf PHP-SDK 3.12 bis 3.14 {#upgrade-to-3-12-through-3-14}

PHP `^8.1`, die Mindestanforderungen der Laravel-Bridge, Worker-Protokoll `1.20` und Steuerungsebene `2` sind gegenüber 3.11 unverändert. Prüfen Sie vor dem Deployment diese Verhaltensänderungen:

- **Updates, die länger als ihr Warten dauern.** Ab 3.13 werfen `Client::updateWorkflow()` und `WorkflowHandle::update()` `UpdateStillPending`, wenn ein Warten mit `waitFor: 'completed'` endet, bevor das Update fertig ist. Frühere Versionen gaben die Server-Quittung zurück, als wäre sie das Ergebnis des Updates. Um weiter zu warten, rufen Sie das Update erneut mit `$pending->requestId` auf. Das wendet das Update nicht zweimal an.
- **Veraltete Worker-Registrierung.** Ab 3.13 registriert sich `Worker::run()` nach `stale_worker_registration` erneut, statt anzuhalten. Aufgaben des abgegrenzten Workers werden ohne Abschluss verworfen, und der Server stellt sie erneut zu. Jede Wiederherstellung protokolliert `worker.reregistered` und erhöht `durable_workflow_worker_reregistrations`. Übergeben Sie `stopOnStaleRegistration: true`, um das alte Verhalten beizubehalten.
- **Backoff lokaler Aktivitäten.** Ab 3.13 wiederholt eine lokale Aktivität mit mehr Wiederholungen als Einträgen in `backoff_seconds` die letzte Verzögerung, statt sofort erneut zu versuchen, wie vom Server geplante Aktivitäten.
- **Bedingungswartevorgänge in Gruppen auf dem nativen Server.** Der native Server akzeptiert noch keine Bedingungs- oder Signalwartevorgänge innerhalb von `all()` oder `parallel()`. Ab 3.13.1 lässt der Worker diese Workflow-Aufgabe mit `grouped_condition_wait_unsupported` fehlschlagen und läuft weiter, statt sich zu beenden. Warten Sie auf die Bedingung außerhalb der Gruppe.

Neu in diesen Versionen:

- **Sticky-History-Suffixe (3.14).** Worker melden `sticky_history_suffix`. Auf Server 3.5.0 oder neuer erhält ein Worker, der die Historie einer Ausführung bereits hält, nur die Ereignisse nach der zwischengespeicherten Sequenz. Ein Suffix, das die zwischengespeicherte Historie nicht exakt fortsetzt, wird verworfen und die vollständige Historie abgerufen. Ältere Server senden weiterhin die vollständige Historie.
- **Zeitplanursprung (3.13).** `WorkflowContext::scheduleOrigin()` liefert die Zeitplan-ID, den Auslösezeitpunkt und die Auslösenummer des Zeitplanlaufs, der die Ausführung gestartet hat, oder `null` bei einem gewöhnlichen Start. Der Wert ist beim Replay derselbe. Ab Server 3.5.0 behält eine mit Continue-as-new fortgesetzte Ausführung ihren Zeitplanursprung.
- **Aktivitätsfortsetzungen (3.12).** Übergeben Sie dem `Worker`-Konstruktor `enableActivityContinuation: true`, um die nächsten Workflow-Befehle zusammen mit einem erfolgreichen Aktivitätsergebnis zu senden, wenn der Server `activity_workflow_continuation` meldet (nativer Server 3.4.0 oder neuer). Standard ist `false`. Das Aktivieren kostet derzeit Durchsatz: In unserem Benchmark unter Last liefen Workflows damit 24–49 % langsamer und benötigten doppelt so viele Datenbanktransaktionen ([Messung](https://github.com/durable-workflow/server/issues/1078)). Verwenden Sie 3.12.1 oder neuer, wenn Sie es aktivieren, und leeren oder deaktivieren Sie solche Worker, bevor Sie den Server zurückstufen oder ältere Server-Knoten hinzufügen.

Die vollständige Liste steht im [Changelog zu 3.14.0](https://github.com/durable-workflow/sdk-php/blob/3.14.0/CHANGELOG.md).

## Upgrade auf PHP SDK 3.10 und 3.11 {#upgrade-to-3-10-and-3-11}

Lesen Sie vor der Bereitstellung den [Upgrade-Leitfaden des PHP SDK](https://github.com/durable-workflow/sdk-php/blob/3.11.0/docs/portal/operate/upgrading.md).
Aktualisieren Sie alle Worker, die Arbeit aus einer Task-Warteschlange erhalten
können, gemeinsam, einschließlich Standby- und Autoscaling-Pools.

- **Laravel-Brücke.** Ab 3.10 folgt die Laravel-Service-Modus-Brücke
  Workflow 2.21: PHP `^8.2` und gepatchtes Laravel `^12.69.0|^13.30.0`. Laravel
  10 und 11 werden nicht mehr unterstützt. Der Provider verweigert nicht
  unterstützte oder unbekannte Framework- und PHP-Versionen, bevor er
  irgendetwas registriert. Das reine SDK behält die Unterstützung für PHP
  `^8.1` und Symfony 6.4/7/8 bei.
- **Bedingungs-Fingerprints.** Ab 3.10 zeichnen neue Bedingungswarteoperationen
  v2-Prädikat-Fingerprints (`dwphp2:sha256:`) auf. Ältere Worker lehnen sie ab;
  ein Zurückrollen der Worker unter 3.10, nachdem v2-Warteoperationen
  existieren, kann daher das Replay fehlschlagen lassen. Stoppen Sie ältere
  Worker oder lassen Sie sie auslaufen, bevor Ersatz-Worker starten, stellen Sie
  PHP-Quellen atomar bereit und starten Sie jeden langlebigen Worker neu,
  einschließlich Workern mit OPcache. Worker, die v2-Warteoperationen erneut
  abspielen, benötigen den Tokenizer von PHP. Bestehende
  v1-Warteoperationen erfordern weiterhin eine exakte Übereinstimmung der
  Quellzeile.
- **Statische Anmeldedaten.** Ab 3.10 werden statische Anmeldedaten so
  validiert, wie sie übergeben werden. Fehlerhaftes UTF-8, Unicode-Leerraum an
  einem der Ränder und eingebettete Steuerzeichen führen jetzt zu einem Fehler,
  statt entfernt oder ignoriert zu werden. Prüfen Sie vor dem Upgrade gemeinsame
  Werte sowie Client-, Worker- und Framework-Werte für die Übergabe zwischen
  Prozessen.
- **Fristen pro Vorkommen.** In 3.11 behält eine neue Bedingungswarteoperation
  auf oberster Ebene ihre erste Frist über falsche Aufweckvorgänge hinweg bei,
  wenn der Server `condition_wait_occurrence_deadline` ankündigt (nativer
  Server 3.3.0 oder neuer). Ohne diese Fähigkeit senden Worker dieselben Befehle
  wie bisher. Gruppierte Bedingungswarteoperationen nehmen noch nicht daran
  teil. Aktualisieren Sie bei einem älteren Server zuerst jeden Worker der
  Warteschlange auf 3.11, bevor Sie den Server aktualisieren. Bei einem Server,
  der die Fähigkeit bereits ankündigt, lassen Sie jeden älteren Worker auslaufen
  oder stoppen ihn, bevor irgendein 3.11-Worker die Warteschlange verarbeitet.
  Sobald eine verankerte Warteoperation existiert, rollen Sie die Worker dieser
  Warteschlange nicht unter 3.11 zurück.

PHP SDK 3.10 ergänzt außerdem `WorkflowContext::startChildWorkflow()`. Die
Methode gibt ein `ChildWorkflowHandle` zurück, sobald der Start des
Kind-Workflows festgeschrieben ist, und benötigt eine Laufzeit, die
`child_workflow_start_turn` ankündigt. Weitere Ergänzungen sind
`ActivityContext::activityExecutionId`, optionale typisierte Deklarationen für
`upsertSearchAttributes()`, verzögert ladende Iteratoren für Workflow-Listen und
Verlauf sowie die Worker-Option `enableCompletionPipelining`, deren Standardwert
`false` ist. Mit Abschlüssen übertragene Polls werden nur verwendet, wenn die
Laufzeit sie ankündigt. Die vollständige Liste finden Sie im
[Changelog zu 3.11.0](https://github.com/durable-workflow/sdk-php/blob/3.11.0/CHANGELOG.md).

## Protokoll- und Release-Grenze {#protocol-and-release-boundary}

Das SDK deklariert seinen unterstützten Server-Bereich, die Worker-Protokollversion,
Control-Plane-Version und Nutzlast-Codecs in Composer-Metadaten. Der Server
veröffentlicht seine akzeptierten Protokolle und Codecs zusätzlich über
`GET /api/cluster/info`. Prüfen Sie die Laufzeiterkennung bei der Bereitstellung,
statt Kompatibilität aus einer Server-Patchversion abzuleiten.

Das PHP SDK wird unabhängig vom Laravel-Paket versioniert. Behalten Sie die
genaue veröffentlichte Versionsbindung in ausführbaren Beispielen bei und
prüfen Sie bei SDK-Upgrades die Release Notes. Kompatibilität folgt dem
deklarierten SDK-Vertrag, nicht übereinstimmenden Paketversionsnummern.

## Verwandte Referenzen {#related-references}

- [Eigenständiger Server](/docs/polyglot/server/)
- [Bereitstellungsmodi](/docs/polyglot/deployment-modes/)
- [Worker-Protokoll](/docs/polyglot/worker-protocol/)
- [Fähigkeitsindex](/docs/capabilities/)
- [PHP-Entwicklerportal](https://php.durable-workflow.com/)
- [PHP-API-Referenz](https://php.durable-workflow.com/api/)
- [Ausführbarer PHP-Schnellstartvertrag](https://php.durable-workflow.com/quickstart-contract.json)
- [PHP-SDK-Quellcode](https://github.com/durable-workflow/sdk-php)

## Seiten für Workflow-Listen und Verlauf {#workflow-list-and-history-pages}

Diese veröffentlichten Aufrufe liefern **eine Seite**, keinen automatischen vollständigen Abruf: `Client::listWorkflows(...)` / `Client::workflowHistory(...)`. Setzen Sie mit dem zurückgegebenen undurchsichtigen Token fort und behalten Sie Namespace, Filter und Workflow/Lauf bei. Enden Sie beim letzten null/leeren Token und behandeln Sie Seitenfehler ausdrücklich. Eine Teilseite ist kein Replay-Bundle. Nutzen Sie für Offline-Replay die Verlaufsexport-API des SDK. Der [veröffentlichte Client PHP 3.2.0](https://github.com/durable-workflow/sdk-php/blob/3.2.0/src/Client.php) definiert die Seitenparameter.

PHP SDK 3.10.0 und neuer bieten zusätzlich `Client::iterateWorkflows()` und `Client::iterateWorkflowHistory()`. Sie lesen eine vollständige Workflow-Liste oder den Verlauf eines exakten Laufs verzögert, Seite für Seite, und behalten dabei den undurchsichtigen Cursor, Namespace und Filter bei. Fehler auf späteren Seiten werden weitergegeben; fehlerhafte Fortsetzungen oder Token-Zyklen werden abgelehnt, statt die Ausgabe abzuschneiden oder in eine Schleife zu geraten. Siehe den [veröffentlichten Client PHP 3.11.0](https://github.com/durable-workflow/sdk-php/blob/3.11.0/src/Client.php).

## Begrenzte Fehlerberichte {#bounded-failure-reports}

Das PHP SDK **3.5.0** führte begrenzte ausgehende Fehlerberichte ein. Standardmäßig gelten **62 KiB UTF-8 für die Meldung**, **128 KiB für den Stack**, **64 KiB für gemeinsam serialisierte optionale Details und Diagnosen** und **1 MiB für den vollständigen JSON-codierten Body**. Markierungen, JSON-Escaping, die Claim-Identität und weitere Befehle im Batch zählen zum Body-Limit. Ein niedrigeres konfiguriertes oder vom Transport gemeldetes Limit hat Vorrang. Fehlertyp, Klasse, Code, Retry-Regeln und Claim-Identität bleiben erhalten.

`withFailureReportLimit()` gibt einen neuen Client mit einem kleineren Budget für die gesamte Anfrage zurück, von 1 bis 1.048.576 Bytes. Verwenden Sie die zurückgegebene Instanz. Ein vom Transport gemeldetes niedrigeres Limit gilt ebenfalls.

```php
<?php

use DurableWorkflow\Client;

$client = (new Client(
    baseUri: 'https://workflow.example.com',
    controlToken: 'operator-token',
    workerToken: 'worker-token',
))->withFailureReportLimit(512 * 1024);
```

Eine sichtbare Kürzungsmarkierung und die ursprünglichen Byte-Anzahlen kennzeichnen gekürzte Felder. Avro-Details bleiben vollständig erhalten oder werden als Ganzes weggelassen. Ein nicht darstellbarer erforderlicher Umschlag löst vor der HTTP-Übertragung `DurableWorkflow\Exception\FailureReportRefused` aus. Lokale Fehler werden normalisiert, bevor der Workflow-Code sie beobachtet. Dadurch sehen die erste Ausführung und ein kalter Replay dieselbe gespeicherte Meldung. Eine bereits beobachtete lokale Meldung bleibt bei der abschließenden Größenanpassung des Batches unveränderlich.
