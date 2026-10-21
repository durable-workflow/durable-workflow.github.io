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

- PHP 8.1 oder neuer
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
