---
sidebar_position: 13
title: Migration auf 2.0
description: Eine bestehende Laravel-Workflow-v1-Anwendung auf Durable Workflow v2 aktualisieren.
tags:
  - migration
  - upgrade
  - v2
keywords:
  - Migration auf Durable Workflow v2
  - Laravel Workflow Upgrade
  - v2-Schemamigration
  - Workflow v1 zu v2
---

# Migration auf 2.0 {#migrating-to-20}

Dieser Leitfaden beschreibt die wichtigsten Änderungen beim Upgrade einer bestehenden Laravel-v1-Anwendung auf v2. Entscheiden Sie zuerst im [Leitfaden zur Laravel-Einführung und zum Laufzeitwechsel](/docs/laravel-adoption/), ob Laravel die Laufzeit weiter verwaltet oder über das PHP-SDK Cloud oder einen selbst gehosteten Server anspricht. Diese Seite beschreibt anschließend das detaillierte Verfahren für das eingebettete Paket von v1 zu v2.

## Upgrade-Verfahren {#upgrade-procedure}

### Vor dem Upgrade {#before-upgrading}

**1. Alle v1-Ausführungsspeicher erfassen**

v1-Ausführungszustand liegt nicht zwangsläufig nur in der Workflow-Datenbank. Neben Workflow-Zeilen und Historie können Laravel-Warteschlangenjobs in Redis, einer Warteschlangendatenbank, SQS oder einem anderen Backend bereit, verzögert oder reserviert sein. Erfassen Sie vor Codeänderungen:

- Workflow-Speicherverbindung und tatsächliche v1-Modell-/Tabellenzuordnungen
- alle von v1-Workflows und -Aktivitäten verwendeten Warteschlangenverbindungen und -namen, einschließlich workflow- oder aktivitätsspezifischer Überschreibungen
- Datenbank, Schlüsselpräfix, Region, Konto und andere Routingparameter des Warteschlangenbackends, die zur Wiederherstellung derselben Warteschlangen nötig sind
- Secret-Manager-Referenz und unveränderliche Version zum Abruf des genauen `APP_KEY` sowie jeden Cache-Speicher für v1-Sperren eindeutiger Jobs

Kopieren Sie weder den Wert von `APP_KEY` noch Secret-Manager-Wiederherstellungszugangsdaten, Datenbank- oder Warteschlangenprovider-Zugangsdaten in diese Bestandsaufnahme. Verschlüsselte Jobs und serialisierte Workflow-Argumente benötigen den ursprünglichen Schlüssel. Das Wiederherstellungsmanifest sollte aber ausschließlich dessen Secret-Manager-Referenz und Version enthalten. Bewahren Sie die Zugangsdaten zum Abruf dieses Schlüssels getrennt von SQL- und Warteschlangensicherungen unter eigener Zugriffskontrolle auf.

Die v1-Standardtabellen sind `workflows`, `workflow_logs`, `workflow_signals`, `workflow_timers`, `workflow_exceptions` und `workflow_relationships`. Veröffentlichte Dateien `config/workflows.php` können `stored_workflow_model`, `stored_workflow_log_model`, `stored_workflow_signal_model`, `stored_workflow_timer_model` oder `stored_workflow_exception_model` ersetzen. Ein Ersatzmodell kann auch Eloquent-`$table` überschreiben. `workflow_relationships_table` bestimmt separat die Beziehungstabelle. Sichern Sie die durch diese konfigurierten Modelle aufgelösten Tabellen und Speicherverbindungen, nicht nur die Standardnamen.

**2. Rollback-Grenze wählen und v1-Arbeit stilllegen**

Verhindern Sie während des Erfassens des Wiederherstellungsstands neue Workflow-Starts und Signale. Pausieren Sie Scheduler und stoppen Sie jeden Worker, der die erfassten Warteschlangen konsumieren kann, nachdem sein aktueller Job eine Grenze erreicht hat. Zum Beispiel:

```bash
# Horizon
php artisan horizon:pause

# Supervisor or systemd (use the names from your deployment)
sudo supervisorctl stop <your-worker-group>:*
sudo systemctl stop laravel-worker
```

`php artisan queue:restart` allein legt nicht still, wenn Supervisor, systemd, Kubernetes oder ein anderer Prozessmanager sofort einen Ersatz-Worker startet. Bestätigen Sie vor dem Erfassen, dass kein Verbraucher einen weiteren Job reservieren kann.

Wählen und dokumentieren Sie eine dieser Richtlinien:

- **v1 auslaufen lassen:** Neue v1-Arbeit blockieren, v1-Worker weiterlaufen lassen, bis `php artisan workflow:v1:list`, soweit verfügbar, oder eine gleichwertige Abfrage der konfigurierten Stored-Workflow-Tabelle keine nichtterminalen Workflows mehr meldet. Dann Worker stoppen und bestätigen, dass die betreffenden Warteschlangen keine bereiten, verzögerten oder reservierten v1-Jobs enthalten. Ein reines SQL-Rollback kann diese terminalen v1-Workflows abdecken.
- **Laufendes v1 erhalten:** Worker an Jobgrenzen stoppen und eine anwendungskonsistente Momentaufnahme von SQL und jedem dauerhaften Warteschlangenbackend erstellen. Die Warteschlangensicherung muss bereite, verzögerte und reservierte Arbeit enthalten und zum selben Wiederherstellungsstand wie SQL gehören. Warten Sie vor dem Erfassen auf den Abschluss eines reservierten Jobs, sofern das Backend keine sichere Wiederherstellung von Nachricht und Lease dokumentiert.
- **Verlust laufender Arbeit akzeptieren:** Kann das Backend keinen wiederherstellbaren Warteschlangenstand liefern, erfassen Sie betroffene Workflow-IDs und akzeptieren Sie ausdrücklich, dass warteschlangenabhängige nichtterminale Ausführungen durch dieses Rollback nicht wiederherstellbar sind. Nehmen Sie eine geeignete `pending`-Zeile erst nach dem Nachweis des unten beschriebenen Watchdog-Pfads davon aus, und einen echten reinen Signalwartezustand erst nach dem Test des erhaltenen Eingangs. Stellen Sie keine andere SQL-Zeile als wiederherstellbare Arbeit dar.

Ein reiner Signalwartezustand kann berechtigterweise ohne Warteschlangenjob bestehen, wenn sein externer Signaleingang nach dem Rollback verfügbar bleibt. Aktivitätswiederholungen und Timer sind warteschlangengestützt: Eine Zeile in `workflow_timers` oder eine wartende `workflows`-Zeile erstellt keinen fehlenden verzögerten Job neu.

Das unterstützte v1.0.77 startet außerdem den standardmäßig aktivierten `Workflow\Watchdog` aus der Warteschlangen-Worker-Schleife. Der Watchdog findet einen `pending`-Workflow, dessen `updated_at` mindestens fünf Minuten alt ist und dessen serialisierte `arguments` vorhanden sind, und teilt ihn auf seiner aufgezeichneten Verbindung und Warteschlange erneut zu. Dies ist ein begrenzter Weckpfad ausschließlich für `pending`, kein Ersatz für eine Warteschlangensicherung. Sie dürfen sich nur darauf verlassen, wenn Staging-Nachweise zeigen, dass die wiederhergestellte v1-Worker-Schleife den Watchdog zuteilt, dieser eine geeignete veraltete `pending`-Zeile erneut zuteilt und der Workflow auf der erwarteten Warteschlange fortschreitet. Er erstellt weder Aktivitätswiederholungen noch Timerjobs neu und stellt keine `waiting`- oder `running`-Zeilen wieder her. Diese Zustände benötigen weiterhin ihren erhaltenen Warteschlangenjob oder einen gültigen externen Signalpfad, wenn der Workflow tatsächlich auf ein Signal wartet.

**3. Wiederherstellungssatz für das Rollback sichern**

Erstellen Sie vor dem Upgrade eine vollständige Datenbanksicherung:

```bash
# MySQL/MariaDB
mysqldump -u root -p your_database > backup-v1-$(date +%Y%m%d-%H%M%S).sql

# PostgreSQL
pg_dump -U postgres your_database > backup-v1-$(date +%Y%m%d-%H%M%S).sql

# Laravel backup package (if installed)
php artisan backup:run --only-db
```

Erhalten Sie danach den Warteschlangenzustand passend zum Backend:

- **Datenbankwarteschlange:** Warteschlangentabellen und deren Verbindung in denselben Wiederherstellungsstand aufnehmen. Sie können außerhalb der Workflow-Datenbank liegen.
- **Redis-Warteschlange:** Eine wiederherstellbare Redis-Momentaufnahme oder Sicherung verwenden, die genaue Warteschlangendatenbank/-präfix und deren bereite, verzögerte und reservierte Schlüssel enthält. Liegen in derselben Redis-Datenbank für diesen Stand benötigte Sperren eindeutiger Jobs, auch diese Schlüssel erhalten. Bevorzugen Sie eine eigene Warteschlangendatenbank oder -instanz. Die Wiederherstellung einer gemeinsam genutzten Redis-Momentaufnahme kann sachfremde Anwendungsdaten zurücksetzen.
- **SQS oder andere verwaltete Warteschlange:** Eine vom Provider unterstützte zeitpunktbezogene Nachrichtenwiederherstellung nur verwenden, wenn sie verfügbare, verzögerte und laufende Nachrichten konsistent erhält. SQS bietet für dieses Verfahren keine beliebige Warteschlangenmomentaufnahme. Lassen Sie v1 daher auslaufen oder klassifizieren Sie verbleibende warteschlangenabhängige v1-Arbeit als nicht wiederherstellbar. Die einzigen reinen SQL-Ausnahmen sind eine nachgewiesen Watchdog-geeignete `pending`-Zeile und ein getesteter reiner Signalwartezustand.

Speichern Sie SQL-Sicherung, Warteschlangensicherung, nicht geheime Bestandsaufnahme und Wiederherstellungszeitstempel gemeinsam. Dieses Manifest darf Secret-Manager-Referenz und Version des `APP_KEY` nennen, aber weder Schlüssel noch Zugangsdaten für dessen Abruf enthalten. Halten Sie Wiederherstellungszugangsdaten für Secret Manager, Datenbank, Warteschlangenprovider und Sicherungen unter separater Zugriffskontrolle. Die Kombination von SQL eines Stands mit Warteschlangenzustand eines anderen ist kein unterstütztes Rollback laufender Arbeit.

**4. Zuerst in Staging testen**

**Aktualisieren Sie Produktion nicht ohne Staging-Test.** Das Upgrade umfasst:

- Datenbankschemaänderungen: Der dauerhafte v2-Kern ergänzt Tabellen. Die genaue Anzahl ergibt sich aus `php artisan migrate`. Eine künftige zusammengefasste Migration kann funktionsbezogene Dateien bündeln.
- Namespace-Änderungen mit erforderlichen Codeanpassungen
- Neustart der Warteschlangen-Worker mit kurzer Unterbrechung
- Validierung der Backend-Fähigkeiten

**Staging-Prüfliste:**

- [ ] v2-Code in Staging bereitstellen
- [ ] Migrationen gegen die Staging-Datenbank ausführen
- [ ] Warteschlangen-Worker neu starten
- [ ] `php artisan workflow:v2:doctor --strict` ausführen
- [ ] Neuen v2-Workflow starten und Abschluss prüfen
- [ ] Prüfen, dass vorhandene v1-Workflows weiter abschließen
- [ ] Prüfen, dass Waterline v1- und v2-Workflows zeigt
- [ ] Testsuite der Anwendung ausführen
- [ ] Logs auf Fehler prüfen

Fahren Sie erst nach bestandener Staging-Validierung mit Produktion fort.

### Upgrade-Schritte {#upgrade-steps}

**1. Composer-Abhängigkeit aktualisieren**

```bash
composer require %%artifact.workflowComposerPackage%%
```

Das gepflegte Composer-Paket ist für v1 und v2 `durable-workflow/workflow`. Dieser Befehl ändert seine Versionsbedingung auf die aktuelle öffentliche v2-Artefaktfestlegung. Der alte Name `laravel-workflow/laravel-workflow` ist nur ein Kompatibilitätsalias für Abhängigkeitsgraphen vor der Paketumbenennung. Verwenden Sie den gepflegten Namen für neue Anforderungen und Rollback. Die aktuelle öffentliche Artefaktfestlegung benennt das stabile 2.0-Paket. Verwenden Sie `durable-workflow/workflow:^2.0`, wenn Composer kompatible 2.x-Updates automatisch akzeptieren soll.

**2. Datenbankmigrationen ausführen**

```bash
php artisan migrate
```

v2 ergänzt die Tabellen des dauerhaften Kerns für den v2-Funktionsvertrag. Die aktuellen funktionsbezogenen Migrationen erstellen:

- Kern: `workflow_instances`, `workflow_runs`, `workflow_history_events`, `workflow_tasks`, `workflow_commands`
- Aktivitäten: `activity_executions`, `activity_attempts`
- Funktionen: `workflow_updates`, `workflow_signal_records`, `workflow_run_waits`, `workflow_run_timeline_entries`, `workflow_run_lineage_entries`, `workflow_schedules`, `workflow_schedule_history_events`
- Beobachtbarkeit: `workflow_run_summaries`, `workflow_failures`, `workflow_links`, `worker_compatibility_heartbeats`
- Timer: `workflow_run_timers`, `workflow_run_timer_entries`
- Suche / Memo / Nachricht / untergeordnete Workflows: `workflow_search_attributes`, `workflow_memos`, `workflow_messages`, `workflow_child_calls`
- Dienstkatalog: `workflow_service_endpoints`, `workflow_services`, `workflow_service_operations`, `workflow_service_calls`

Eine künftige zusammengefasste Migration kann dies in weniger Dateien bündeln, ohne den dauerhaften Vertrag zu ändern. Der unterstützte Weg, den tatsächlichen Datenbankstand zu kennen, ist `php artisan migrate:status` nach dem Upgrade.

Die v1-Standardtabellen (`workflows`, `workflow_logs`, `workflow_signals`, `workflow_timers`, `workflow_exceptions` und `workflow_relationships`) bleiben für den Abschluss auf v1 erhalten. Überschreiben konfigurierte v1-Modelle ihre Tabellen oder Speicherverbindung, sind stattdessen diese konfigurierten Tabellen die maßgebliche v1-Quelle.

**3. Konfiguration bei Bedarf aktualisieren**

Die v2-Konfiguration ist rückwärtskompatibel. Eine in v1 veröffentlichte `config/workflow.php` funktioniert weiterhin. Neue v2-Optionen sind:

- `durable_types`: Typaliasse für sprachunabhängige Workflow-Referenzen
- `task_repair_policy`: Umgang mit feststeckenden Aufgaben
- `backend_capability_check`: strikte oder tolerante Validierung
- `projection_rebuild`: Strategien für den Neuaufbau aus der Historie
- `history_budget`: Ereigniszahlgrenzen für Continue-As-New

Diese Optionen haben sinnvolle Standardwerte. Konfigurieren Sie sie nur für abweichendes Verhalten. Einzelheiten stehen unter [Konfiguration](/docs/configuration/options/).

**Der Nutzdaten-Standardcodec ist jetzt `avro`.** v1 verwendete standardmäßig das PHP-exklusive `Workflow\Serializers\Y::class`. v2 verwendet den sprachneutralen Codec `avro`, damit Python-, Go- und TypeScript-Worker Nutzdaten ohne gemeinsame PHP-Laufzeit dekodieren können. `avro` ist der einzige unterstützte Codec für neue v2-Workflows. Neue v2-Workflows werden mit `payload_codec = "avro"` gekennzeichnet.

Enthält eine veröffentlichte v1-`config/workflows.php` noch `'serializer' => Workflow\Serializers\Y::class`, liest v2 den Wert für Migrationsdiagnosen weiterhin. Neue v2-Workflow-Nutzdaten werden aber in Avro aufgelöst. Führen Sie nach dem Upgrade `php artisan workflow:v2:doctor` aus. Es kennzeichnet die ältere Codec-Einstellung als Thema für v1-Auslaufen/-Import.

Lassen Sie `serializer` ungesetzt, um den v2-Standard explizit anzunehmen, oder legen Sie ihn fest:

```php
// config/workflows.php — v2 default (language-neutral, compact binary)
'serializer' => 'avro',
```

Behalten Sie einen älteren Codec (`'workflow-serializer-y'` oder `'workflow-serializer-base64'`) nur bei, wenn Sie v1-Läufe abschließen müssen, die PHP-native Werte zwischen Server und reinen PHP-Workern teilen. Ältere Klassennamen wie `Workflow\Serializers\Y::class` werden weiterhin als Aliasse zum Dekodieren von v1-Läufen akzeptiert.

**Eigene Serializerklassen aus v1 werden in v2 nicht unterstützt.** Die öffentliche v2-Registry löst nur `avro` auf. Die älteren Leser `workflow-serializer-y` und `workflow-serializer-base64` sind auf den internen v1-Import-/Auslaufpfad begrenzt und können für neue v2-Läufe oder SDK-Nutzdaten nicht gewählt werden. Hatten Sie einen eigenen Serializer, lassen Sie v1-Läufe vor dem Upgrade abschließen oder kodieren Sie historische Nutzdaten neu in `avro`. Die eigene Klasse wird nicht aufgerufen. `php artisan workflow:v2:doctor` kennzeichnet jeden anderen Wert von `workflows.serializer` als Migrationsschuld. Ein ausgelassener Codec für neue Läufe wird als `avro` aufgelöst.

**Eigene Modellunterklassen sind nur bei Einhaltung des Spalten- und Schlüsselvertrags des Pakets unterstützt.** Die eingefrorene Unterstützungsmatrix unter [Anpassungsmatrix](/docs/configuration/customization-matrix/) ist maßgeblich: Unterklassen der v2-Modelle für Instanz, Lauf, Aufgabe, Historienereignis, Projektion, Zeitplan, Aktivität, Fehler, Verknüpfung, Nachricht, Memo, Suchattribut und untergeordneten Aufruf sind unterstützt, wenn sie Paket-Tabellennamen, Primär- und Fremdschlüssel beibehalten. Eigene Tabellen mit eigenen Fremdschlüsselspalten liegen außerhalb des Vertrags. Waterline liest v2-Projektionen über `Workflow\V2\Contracts\OperatorObservabilityRepository`. Eine schemakompatible Unterklasse benötigt daher keine Waterline-Änderung.

**Umgebungsvariablen:**

v2 führt keine neuen erforderlichen Umgebungsvariablen ein. `QUEUE_CONNECTION`, `CACHE_DRIVER` und `DB_CONNECTION` funktionieren weiter.

**4. Warteschlangen-Worker neu starten**

Worker müssen zum Laden des v2-Codes neu gestartet werden:

```bash
# If using Laravel queue workers
php artisan queue:restart

# If using Supervisor
sudo supervisorctl restart <your-worker-group>:*

# If using systemd
sudo systemctl restart laravel-worker

# If using Horizon
php artisan horizon:terminate
```

Worker werden:
1. ihren aktuellen Job abschließen
2. sich geordnet beenden
3. mit geladenem v2-Code neu starten

**Worker müssen vor der Verarbeitung von v2-Workflows neu starten.** v1-Workflows können mit alten oder neuen Workern abschließen (Finish-on-v1-Kompatibilität).

### Nach dem Upgrade {#after-upgrading}

**1. Backend-Fähigkeiten prüfen**

```bash
php artisan workflow:v2:doctor --strict
```

Erwartete Ausgabe:

```
✓ Database driver supports required features
✓ Queue driver supports required features
✓ Cache driver supports locks
✓ All backend capabilities present
```

Schlägt eine Prüfung fehl, lesen Sie die Treibervoraussetzungen unter [Backend-Anforderungen](/docs/installation/#requirements).

**2. Erfolgreichen Start von v2-Workflows prüfen**

Starten Sie einen Test-Workflow über die v2-API:

```php
use Workflow\V2\WorkflowStub;
use Workflow\V2\StartOptions;

$workflow = WorkflowStub::make(TestWorkflow::class, 'test-upgrade');
$result = $workflow->start(['test' => true], new StartOptions());
$runId = $result->runId();
```

`WorkflowStub::start()` liefert ein `StartResult`-Objekt. Entnehmen Sie mit `runId()` die Lauf-ID, bevor Sie mit Datenbankzeilen vergleichen. Ein als skalare Zeichenkette behandelter Rückgabewert vergleicht sonst stillschweigend ein Objekt mit einer Spalte.

Prüfen Sie:

- Workflow erscheint in Waterline
- `workflow_instances` enthält eine Zeile mit passendem `instance_id` (`$workflow->id()`)
- `workflow_runs` enthält eine Zeile mit passendem `run_id` (`$result->runId()`)
- Workflow schließt ab oder schreitet wie erwartet fort

**3. Vorhandene v1-Workflows prüfen**

Bei noch laufenden v1-Workflows:

```bash
php artisan workflow:v1:list
```

Prüfen Sie, dass sie weiter fortschreiten. v1-Workflows sollten auf der v1-Engine fehlerfrei abschließen.

**4. Logs auf Fehler überwachen**

Beobachten Sie Anwendungslogs auf Workflow-bezogene Fehler:

```bash
tail -f storage/logs/laravel.log | grep -i workflow
```

Häufige Probleme:

- Namespace-Fehler: Code verwendet noch `Workflow\Workflow` statt `Workflow\V2\Workflow`
- Methodenfehler: v2-Workflow- oder Aktivitätsklassen müssen ihre Einstiegsmethode noch in `handle()` umbenennen
- Warteschlangentreiberfehler: `sync` im Warteschlangenmodus ist nicht unterstützt. Im Pollingmodus (`workflows.v2.task_dispatch_mode=poll`) wird die Warteschlange für die Aufgabenzustellung nicht verwendet, und `sync` ist zulässig.

**5. Waterline-Beobachtbarkeit prüfen**

Öffnen Sie Waterline (Standard: `/waterline`) und prüfen Sie:

- Vorhandene v1-Workflows erscheinen mit ihren ursprünglichen Daten
- v2-Workflows erscheinen mit vollständigen Lauf-/Historien-/Aktivitätsdetails
- Waterline rendert fehlerfrei

### Rollback-Verfahren {#rollback-procedure}

Rollback ist eine Operation auf einem Wiederherstellungssatz. Die alleinige Wiederherstellung der Workflow-SQL-Datenbank stellt laufendes v1 nicht wieder her, wenn sein Laravel-Warteschlangenzustand in Redis, SQS, einer anderen Datenbank oder einem externen Backend liegt.

Scheitert das Upgrade in Produktion, rollen Sie nur auf die vor dem Upgrade gewählte Richtlinie und den gewählten Wiederherstellungsstand zurück:

**1. Anwendungseingänge, Scheduler und Warteschlangen-Worker stilllegen**

Verwenden Sie dasselbe Stopverfahren wie vor dem Upgrade. Bestätigen Sie, dass während der Wiederherstellung kein Worker einen Job reservieren und keine Anfrage einen Workflow starten oder signalisieren kann.

**2. Wiederherstellungssatz validieren**

- Ein reiner SQL-Wiederherstellungssatz ist nur unterstützt, wenn der gewählte Stand keine nichtterminale v1-Ausführung enthält, die erhaltene Warteschlangenarbeit benötigt. Eine geeignete veraltete `pending`-Zeile kann stattdessen den oben beschriebenen nachgewiesenen v1.0.77-Watchdog-Pfad verwenden; ein echter reiner Signalwartezustand einen getesteten externen Signaleingang. Dehnen Sie keine Ausnahme auf andere Zustände aus.
- Ein Wiederherstellungssatz für laufende Arbeit muss SQL und wiederherstellbaren bereiten, verzögerten und reservierten Warteschlangenzustand desselben Stands für Wiederholungen, Timer, Aktivitäten und Arbeit in `waiting` oder `running` enthalten. Reine Signalwartezustände brauchen einen funktionierenden Signaleingang, Timerwartezustände ihre verzögerten Warteschlangenjobs.
- Trifft keine Bedingung zu, stoppen Sie hier. Korrigieren Sie vorwärts, gleichen Sie dokumentierte Workflows manuell ab oder fahren Sie unter der zuvor dokumentierten Akzeptanz fort, dass die betroffenen Ausführungen nicht wiederherstellbar sind.

**3. Datenbanksicherung wiederherstellen**

```bash
# MySQL/MariaDB
mysql -u root -p your_database < backup-v1-YYYYMMDD-HHMMSS.sql

# PostgreSQL
psql -U postgres -d your_database < backup-v1-YYYYMMDD-HHMMSS.sql
```

Stellen Sie jede konfigurierte eigene v1-Modelltabelle und `workflow_relationships_table` wieder her, auch auf einer anderen Verbindung.

**4. Bei Bedarf den Warteschlangen-Wiederherstellungsstand wiederherstellen**

Lassen Sie Verbraucher gestoppt. Befolgen Sie das Wiederherstellungsverfahren des Warteschlangenproviders und stellen Sie exakt die mit SQL erfassten Verbindungen, Warteschlangen, Präfixe, bereiten, verzögerten und reservierten Jobs wieder her. Stellen Sie erforderliche Sperren eindeutiger Jobs wieder her, wenn sie Teil des Wiederherstellungsstands waren. Eine leere Warteschlange gleichen Namens ersetzt diesen Zustand nicht: Sie kann wiederhergestellte Wiederholungen, Timer oder Arbeit in `waiting`/`running` nicht wecken. Eine leere, aber beschreibbare Warteschlange genügt nur für eine geeignete `pending`-Zeile nach dem Nachweis, dass der v1.0.77-Watchdog startet und sie erneut zuteilt.

**5. Composer-Abhängigkeit zurücksetzen**

```bash
composer require durable-workflow/workflow:^1.0 --with-all-dependencies
```

`durable-workflow/workflow` ist der gepflegte Paketname für unterstützte v1-Veröffentlichungen und v2. `laravel-workflow/laravel-workflow` ist nur ein vom gepflegten Paket deklarierter älterer Kompatibilitätsalias für alte Abhängigkeitsgraphen. Verwenden Sie ihn nicht für Rollback-Anforderungen.

Rufen Sie den genauen `APP_KEY` über die erfasste Secret-Manager-Referenz und Version mit den separat kontrollierten Wiederherstellungszugangsdaten ab. Stellen Sie ihn zusammen mit Workflow-Speicherverbindung, Warteschlangenverbindungen, Warteschlangennamen, Redis-Präfixen und eigener Modellkonfiguration wieder her, bevor Sie einen Verbraucher starten. Verschlüsselte Jobs und serialisierte Modellreferenzen setzen eine zum Wiederherstellungsstand passende Konfiguration voraus.

**6. Warteschlangen-Worker neu starten und Eingänge öffnen**

```bash
# Use the start command for your worker system, for example:
sudo supervisorctl start <your-worker-group>:*
sudo systemctl start laravel-worker
php artisan horizon:continue
```

**7. Erreichbarkeit der v1-Ausführung prüfen**

Sichtbarkeit in Waterline belegt die Wiederherstellung einer Zeile, nicht deren Wiederaufnehmbarkeit durch einen Worker. Schließen Sie diese Prüfliste ab, bevor Sie das Rollback als erfolgreich bezeichnen:

- [ ] `composer show durable-workflow/workflow` meldet die beabsichtigte v1-Veröffentlichung, und Worker haben diesen Code geladen.
- [ ] Tatsächlich konfigurierte v1-Tabellen und `workflow_relationships_table` sind auf den erwarteten Speicherverbindungen vorhanden.
- [ ] Jede nichtterminale Zeile der konfigurierten Stored-Workflow-Tabelle, standardmäßig `workflows`, ist nach ihrem nächsten Weckpfad klassifiziert: bereiter/verzögerter/reservierter Warteschlangenjob, erhaltener Timerjob oder getesteter externer Signaleingang. Eine geeignete `pending`-Zeile darf stattdessen den unten beschriebenen nachgewiesenen v1.0.77-Watchdog-Neuzuteilungsnachweis anführen.
- [ ] Prüfung beim Warteschlangenprovider bestätigt jeden oben erfassten warteschlangengestützten Weckpfad für Wiederholung, Timer, Aktivität und `waiting`-/`running`-Workflow auf der aufgezeichneten Verbindung und Warteschlange. Eine SQL-Timerzeile allein genügt nicht. Der Watchdog ersetzt diese Jobs nicht.
- [ ] Hat eine wiederhergestellte `pending`-Zeile keinen erhaltenen Workflow-Job, wurde beobachtet, wie eine v1.0.77-Worker-Schleife den Watchdog einreiht. Nach der Fünfminuten-Veraltungsgrenze reiht der Watchdog den Workflow auf seiner aufgezeichneten Verbindung und Warteschlange ein, und die Zeile schreitet fort. Ohne diesen vollständigen Nachweis gilt sie als gestrandet, selbst wenn Waterline sie zeigt.
- [ ] Keine wiederhergestellte Wiederholungs-, Timer-, `waiting`- oder `running`-Zeile vermisst ihren erforderlichen ausführbaren Warteschlangenjob oder bei echtem Signalwartezustand einen nutzbaren externen Signalpfad. Solche Zeilen gelten als gestrandet. Der ausschließlich für `pending` geltende Watchdog-Nachweis macht sie nicht wiederherstellbar.
- [ ] Eine wiederhergestellte Wiederholung oder ein Timer schreitet über den Marker vor dem Wiederherstellungsstand hinaus fort. Ein kontrollierter Signalwartezustand kann seine Signalweckung einreihen und konsumieren.
- [ ] Ein neuer v1-Canary-Workflow schließt ab. Logs enthalten keine Fehler zu fehlenden Jobs, Entschlüsselung, Modelltabellen, Verbindungen oder Warteschlangenrouting.

Mit Standardtabellen ist diese Abfrage eine erste Bestandsaufnahme. Ersetzen Sie bei Anpassungen die Tabelle durch die vom konfigurierten Stored-Workflow-Modell aufgelöste:

```sql
SELECT id, class, status
FROM workflows
WHERE status NOT IN ('completed', 'failed', 'cancelled');
```

**Wichtige Rollback-Hinweise:**

- Rollback verwirft alle nach dem Upgrade gestarteten v2-Workflows. Sie existieren nur in v2-Tabellen.
- Reines SQL-Rollback stellt v1-Workflow-Datensätze wieder her, keine externen Warteschlangennachrichten.
- Laufendes v1 ist nur unterstützt, wenn SQL und dauerhafter Warteschlangenzustand aus einem anwendungskonsistenten Wiederherstellungsstand stammen oder ein dokumentierter reiner Signalwartezustand einen nutzbaren Eingang behält. Die zusätzliche reine SQL-Ausnahme ist eine geeignete veraltete `pending`-Zeile mit nachgewiesener v1.0.77-Watchdog-Neuzuteilung. Sie gilt nicht für Wiederholungen, Timer oder Arbeit in `waiting`/`running`.
- Erneute Ausführung eines Wiederherstellungsstands vor dem Upgrade kann externe Seiteneffekte wiederholen. Prüfen Sie vor dem Wiederherstellen eingereihter Aktivitätsarbeit die Anwendungsidempotenz.
- Müssen während des Upgradefensters gestartete v2-Workflows erhalten bleiben, stellen Sie die Datenbank nicht zurück. Beheben Sie das Upgradeproblem stattdessen vorwärts.

## Codeänderungen {#code-changes}

Die folgenden Abschnitte beschreiben die für die Migration von v1- zu v2-APIs erforderlichen Codeänderungen.

### Namespace-Änderung {#namespace-change}

Alle v2-Klassen liegen unter `Workflow\V2`. Aktualisieren Sie Ihre Imports:

```php
// v1
use Workflow\Workflow;
use Workflow\Activity;
use Workflow\WorkflowStub;

// v2
use Workflow\V2\Workflow;
use Workflow\V2\Activity;
use Workflow\V2\WorkflowStub;
```

### Einstiegsmethode {#entry-method}

v2-Workflows und -Aktivitäten verwenden `handle()` als Einstiegsmethode. Benennen Sie bei der v2-Codemigration die v1-Methoden `execute()` in `handle()` um:

```php
// v1
class MyWorkflow extends Workflow
{
    public function execute($input)
    {
        $result = yield ActivityStub::make(MyActivity::class, $input);
        return $result;
    }
}

// v2
use function Workflow\V2\activity;

class MyWorkflow extends Workflow
{
    public function handle($input)
    {
        return activity(MyActivity::class, $input);
    }
}
```

Belassen Sie `execute()` nicht als Einstiegsmethode eines v2-Workflows oder einer v2-Aktivität. Die Laufzeit lehnt sie ab.

### Aktivitätsaufrufe {#activity-calls}

v2 ersetzt `ActivityStub::make()` und `yield` durch direkte Funktionshelfer:

```php
// v1
$result = yield ActivityStub::make(MyActivity::class, $arg1, $arg2);

// v2
use function Workflow\V2\activity;

$result = activity(MyActivity::class, $arg1, $arg2);
```

Aktivitäten haben nun eine dauerhafte Identität. Jede geplante Aktivität erhält eine `activity_executions`-Zeile mit stabiler Ausführungs-ID. Jeder konkrete Versuch erhält eine `activity_attempts`-Zeile mit typisierter Historie.

### Workflow-Identität {#workflow-identity}

v2 trennt die Identität in Instanz-ID und Lauf-ID:

- `id()`: die öffentliche Workflow-Instanz-ID, unverändert über Continue-As-New hinweg
- `runId()`: die ID des aktuellen Laufes

In v1 waren beide dasselbe Konzept.

### Signale {#signals}

v2 verwendet benannte Signalwartezustände statt attributbasierter Mutatoren mit `#[SignalMethod]`:

```php
// v1
#[SignalMethod]
public function approve()
{
    $this->approved = true;
}

// v2
use function Workflow\V2\await;

$approved = await('approve');
```

Benannte Signale unterstützen `await('name')` für blockierendes Warten im Workflow-Code sowie `signal()` / `attemptSignal()` für externe Eingaben. Abbruch und Terminierung sind keine Signale, sondern bleiben explizite Laufzeitbefehle.

### Abfragen {#queries}

v2 verwendet Replay-sichere Abfragemethoden statt direktem Lesen von Workflow-Eigenschaften:

```php
// v1
#[QueryMethod]
public function getStatus(): string
{
    return $this->status;
}

// v2
use function Workflow\V2\query;

// Queries are defined as named, replay-safe accessors
```

### Timer und Seiteneffekte {#timers-and-side-effects}

Funktionsbasierte Helfer ersetzen die statischen v1-Methoden:

```php
// v1
yield Timer::make(60);
$value = yield SideEffect::make(fn() => random_int(1, 100));

// v2
use function Workflow\V2\timer;
use function Workflow\V2\sideEffect;

timer(60);
$value = sideEffect(fn() => random_int(1, 100));
```

### Timeouts {#timeouts}

v2 ergänzt Workflow-Timeouts über `StartOptions`:

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class, 'order-123');

$workflow->start(
    $orderId,
    StartOptions::rejectDuplicate()
        ->withExecutionTimeout(7200)   // 2 hours across all runs
        ->withRunTimeout(3600),        // 1 hour per run
);
```

- **Ausführungstimeout** umfasst die gesamte Instanz einschließlich Continue-As-New-Übergängen.
- **Lauftimeout** gilt für einen einzelnen Lauf und wird bei Continue-As-New zurückgesetzt.

### Datenbankmigrationen {#database-migrations}

v2 ergänzt Tabellen und Spalten. Das Paket lädt seine Migrationen automatisch. Führen Sie nach der Aktualisierung daher Folgendes aus:

```bash
composer update durable-workflow/workflow
php artisan migrate
```

Version 2.0.0 enthält saubere Basistabellenmigrationen. Normalerweise lassen Sie Laravel die Paketmigrationen automatisch laden und führen `php artisan migrate` aus.

Haben Sie Durable-Workflow-Migrationen zuvor in Ihre Anwendung veröffentlicht, wählen Sie eine Migrationsquelle und halten sie aktuell:

- **Automatisch geladene Paketmigrationen**: Alte veröffentlichte Durable-Workflow-Migrationsdateien aus `database/migrations` entfernen und `php artisan migrate` ausführen.
- **Veröffentlichte Migrationen**: Vor dem Migrieren den aktuellen Satz veröffentlichen:

  ```bash
  php artisan vendor:publish \
    --provider="Workflow\Providers\WorkflowServiceProvider" \
    --tag=migrations \
    --force

  php artisan migrate
  ```

Behalten Sie keine veralteten veröffentlichten Dateien bei, während Sie zugleich auf neu automatisch geladene Paketdateien bauen. Sonst können neuere v2-Tabellen oder Reparaturmigrationen fehlen.

Haben Sie Migrationsdateien angepasst, vergleichen Sie Ihre Kopien bei jedem Upgrade mit dem Paketverzeichnis `src/migrations`. Halten Sie Tabellennamen, Spalten, Indizes sowie Nullable-/Standardwertverträge schemakompatibel zu den Paketmodellen. Eine angepasste Installation, die Workflow-Tabellen auf eine andere als die Standardverbindung legt, sollte Migrationen veröffentlichen, deren `$connection` setzen und anschließend jede neue Paketmigration in Zeitstempelreihenfolge übernehmen.

Für Nutzer von v2-Vorabversionen wird `workflow_run_summaries.memo` idempotent repariert, falls eine ältere veröffentlichte Zusammenfassungstabellenmigration `workflow_run_summaries` ohne diese Spalte erstellt hat. Neuinstallationen erstellen sie bereits in der Basismigration.

### Prüfung der Backend-Fähigkeiten {#backend-capability-check}

v2 validiert die Anforderungen an Warteschlangen-, Datenbank- und Cache-Treiber. Führen Sie nach dem Upgrade den Doctor-Befehl aus:

```bash
php artisan workflow:v2:doctor --strict
```

### Konfiguration {#configuration}

v2 führt mehrere Konfigurationsoptionen ein. Der Abschnitt [Konfiguration](/docs/configuration/options/) beschreibt:

- dauerhafte Typaliasse
- Aufgabenreparaturrichtlinie
- Backend-Fähigkeitsprüfungen
- Projektionsneuaufbau
- Historienbudgets und Schwärzung von Exporten

### Waterline {#waterline}

Waterline, die Überwachungsoberfläche, wurde für v2 aktualisiert und bietet:

- Laufdetailansichten mit Timeoutdauern und Fristen
- Verfolgung von Aktivitätsversuchen mit dauerhaften IDs
- aktualisierte Workflow-Statusanzeigen

### Continue-As-New {#continue-as-new}

v2 ergänzt Historienbudgets, die Continue-As-New automatisch auslösen können, wenn die Ereigniszahl eine Schwelle überschreitet. Metadaten wie Memo, Suchattribute und Timeouts werden über Übergänge hinweg weitergegeben.

## Bestehende Workflows {#existing-workflows}

### Strategie „auf v1 abschließen“ {#finish-on-v1-strategy}

**Unter v1 gestartete Workflows werden über v1-Kompatibilitätspfade weiter ausgeführt.** Neue Workflows nach dem Upgrade verwenden v2-Semantik. Sie müssen laufende Workflow-Instanzen nicht migrieren.

Beim Upgrade auf 2.0:

1. **v1-Daten bleiben erhalten.** Die Standardtabellen `workflows`, `workflow_logs`, `workflow_signals`, `workflow_timers`, `workflow_exceptions` und `workflow_relationships` bleiben unversehrt. Konfigurierte v1-Modell-/Tabellenüberschreibungen bleiben maßgeblich.
2. **v1-Workflows schließen auf der v1-Engine ab.** Laufende v1-Workflows verwenden bis zum terminalen Zustand weiterhin die v1-Replay-Engine.
3. **v2-Workflows verwenden die v2-Engine.** Alle nach dem Upgrade gestarteten Workflows verwenden das v2-Schema (`workflow_instances`, `workflow_runs`, `workflow_history_events` usw.).
4. **Waterline zeigt beide.** Die Überwachungsoberfläche stellt v1- und v2-Workflows nebeneinander dar.

Der Abschluss auf v1 hängt ebenfalls vom Laravel-Warteschlangenbackend ab. Erhalten Sie jede v1-Warteschlangenverbindung und -warteschlange, bis ihre Workflows terminal sind. Datenbankzeilen bewahren Historie und Status, rekonstruieren aber keine verlorenen bereiten, verzögerten oder reservierten Jobs aus einem externen Backend. Der v1.0.77-Watchdog kann einen geeigneten veralteten `pending`-Workflow aus SQL erneut zuteilen. Dieser begrenzte Wiederherstellungspfad erstellt weder Wiederholungen noch Timer oder Arbeit in `waiting`/`running` neu.

### Abschluss von v1-Workflows verfolgen {#tracking-v1-workflow-completion}

So sehen Sie nach dem Upgrade noch aktive v1-Workflows:

```bash
php artisan workflow:v1:list
```

Dieser Befehl listet alle v1-Workflows ohne terminalen Zustand (abgeschlossen, fehlgeschlagen, abgebrochen) auf. Verfolgen Sie damit ihren Abschluss im Zeitverlauf.

Beispielausgabe:

```
+--------------------------------------+---------------------+-----------+------------+
| ID                                   | Class               | Status    | Created    |
+--------------------------------------+---------------------+-----------+------------+
| 01J1234567890ABCDEFGHIJK             | App\OrderWorkflow   | running   | 2 days ago |
| 01J9876543210ZYXWVUTSRQP             | App\InvoiceWorkflow | pending   | 1 day ago  |
+--------------------------------------+---------------------+-----------+------------+
```

#### Sichtbarkeit in Waterline {#waterline-visibility}

Nach dem Upgrade auf 2.0 zeigt Waterline automatisch Workflows beider Engines:

- **v1-Workflows** mit ihren ursprünglichen `StoredWorkflow`-Daten: Klasse, Status, Logs, Signale und Ausnahmen
- **v2-Workflows** mit vollständigen v2-Details: Läufe, Historienereignisse, Timer, Aktivitäten und Suchattribute

Keine Konfiguration ist nötig. Waterline liest beide Tabellensätze und bietet eine gemeinsame Ansicht.

### Wann v1-Tabellen bereinigt werden können {#when-to-clean-up-v1-tables}

Sind alle v1-Workflows abgeschlossen und zeigt `workflow:v1:list` keine aktiven mehr, können Sie die v1-Tabellen optional löschen:

```sql
DROP TABLE IF EXISTS workflow_relationships;
DROP TABLE IF EXISTS workflow_exceptions;
DROP TABLE IF EXISTS workflow_timers;
DROP TABLE IF EXISTS workflow_signals;
DROP TABLE IF EXISTS workflow_logs;
DROP TABLE IF EXISTS workflows;
```

**Wichtig:** Löschen Sie diese Tabellen nicht, solange v1-Workflows aktiv sind. Dies lässt v1-Replay fehlschlagen und Workflows feststecken.

### Warum auf v1 abschließen? {#why-finish-on-v1}

Die Strategie vermeidet eine erzwungene Datenmigration zum Upgradezeitpunkt. v1 und v2 verwenden grundlegend unterschiedliche Speichermodelle:

- **v1** speichert Workflow-Zustand als denormalisierte `workflows`-Zeile mit zugehörigen Logs, Signalen und Timern.
- **v2** speichert Workflow-Zustand als ereignisbasierte Historie mit Projektionen (`workflow_instances`, `workflow_runs`, `workflow_history_events`).

Die Umwandlung laufender v1-Workflows in v2-Historie würde die Rekonstruktion von Ereignisfolgen aus v1-Logs erfordern und Datenverlust sowie Replay-Inkonsistenzen riskieren. Der Abschluss auf v1 lässt bestehende Workflows sicher auf ihrer ursprünglichen Engine abschließen, während neue Arbeit sofort zu v2 wechselt.
