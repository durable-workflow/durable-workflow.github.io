---
sidebar_position: 20
---

# Zeitpläne {#schedules}

Zeitpläne starten Workflow-Läufe regelmäßig anhand von Cron-Ausdrücken.
Jeder Zeitplan ist eine benannte dauerhafte Entität, die die Engine bei jedem
Tick auswertet, um über das Auslösen eines neuen Laufs zu entscheiden.

## Einen Zeitplan erstellen {#creating-a-schedule}

Definieren Sie mit `ScheduleManager::create()` einen benannten Zeitplan:

```php
use Workflow\V2\Enums\ScheduleOverlapPolicy;
use Workflow\V2\Support\ScheduleManager;

$schedule = ScheduleManager::create(
    scheduleId: 'daily-invoice-sync',
    workflowClass: InvoiceSyncWorkflow::class,
    cronExpression: '0 2 * * *',
    arguments: ['nightly'],
    timezone: 'America/New_York',
    overlapPolicy: ScheduleOverlapPolicy::Skip,
    labels: ['team' => 'billing'],
    memo: ['origin' => 'scheduled'],
    searchAttributes: ['tenant_id' => '42'],
    notes: 'Runs every night at 2 AM ET.',
    executionTimeoutSeconds: 120,
    runTimeoutSeconds: 60,
);
```

`scheduleId` ist eine eindeutige, vom Benutzer gewählte Zeitplankennung.
Jeder ausgelöste Lauf erhält eine deterministische Workflow-Instanz-ID aus
Zeitplan-ID und Auslösezeitstempel.

### Parameter {#parameters}

| Parameter | Typ | Standard | Beschreibung |
|---|---|---|---|
| `scheduleId` | `string` | erforderlich | Eindeutige Kennung des Zeitplans |
| `workflowClass` | `string` | erforderlich | Zu startende Workflow-Klasse |
| `cronExpression` | `string` | erforderlich | Standard-Cron-Ausdruck mit 5 Feldern |
| `arguments` | `array` | `[]` | Argumente für die Workflow-Methode `handle()` |
| `timezone` | `string` | `'UTC'` | Zeitzone zur Auswertung des Cron-Ausdrucks |
| `overlapPolicy` | `ScheduleOverlapPolicy` | `Skip` | Verhalten, wenn der vorherige Lauf noch aktiv ist |
| `labels` | `array` | `[]` | Sichtbarkeitslabels für jeden ausgelösten Lauf |
| `memo` | `array` | `[]` | Memo-Felder für jeden ausgelösten Lauf |
| `searchAttributes` | `array` | `[]` | Suchattribute für jeden ausgelösten Lauf |
| `jitterSeconds` | `int` | `0` | Maximale zufällige Verzögerung jeder Auslösezeit in Sekunden zur Vermeidung gleichzeitiger Lastspitzen |
| `maxRuns` | `int\|null` | `null` | Maximale Laufzahl vor automatischem Löschen des Zeitplans |
| `connection` | `string\|null` | `null` | Queue-Verbindung für ausgelöste Läufe; überschreibt den Standard der Workflow-Klasse |
| `queue` | `string\|null` | `null` | Queue-Name für ausgelöste Läufe; überschreibt den Standard der Workflow-Klasse |
| `notes` | `string\|null` | `null` | Freie Betreibernotizen |
| `namespace` | `string\|null` | `null` | Namespace des Zeitplans; standardmäßig das konfigurierte `workflows.v2.namespace` oder `'default'` |
| `executionTimeoutSeconds` | `int\|null` | `null` | Timeout jeder logischen Workflow-Ausführung über Wiederholungen und Continue-as-new hinweg |
| `runTimeoutSeconds` | `int\|null` | `null` | Timeout jedes einzelnen Laufs, bei Continue-as-new zurückgesetzt |

### Workflow-Timeouts {#workflow-timeouts}

Der Ausführungs-Timeout umfasst eine logische Ausführung über Wiederholungen
und Continue-as-new hinweg. Der Lauf-Timeout begrenzt einen einzelnen Lauf und
wird bei Continue-as-new zurückgesetzt. Ein Lauf kann das verbleibende
Ausführungsbudget nicht überschreiten. Jedes geplante Vorkommnis startet ein
neues Ausführungsbudget ab dem tatsächlichen Workflow-Start, nicht ab seiner
geplanten Auslösezeit.

Beide Optionen akzeptieren positive ganze Sekunden oder `null`. Fehlende oder
auf `null` gesetzte Optionen lassen die jeweilige Grenze ungesetzt. Manuelle
Auslösung, automatische Ticks, gepufferte Starts und Nachholvorgänge wenden die
gespeicherten Grenzen über den Standard-PHP-Starter an.

Setzen Sie die Grenzen bei `createFromSpec()` in die Aktion:

```php
$schedule = ScheduleManager::createFromSpec(
    scheduleId: 'hourly-invoice-sync',
    spec: ['intervals' => [['every' => 'PT1H']]],
    action: [
        'workflow_class' => InvoiceSyncWorkflow::class,
        'input' => ['hourly'],
        'execution_timeout_seconds' => 120,
        'run_timeout_seconds' => 60,
    ],
);
```

Erstellung und Aktionsänderungen validieren PHP-Workflow-Timeouts mit denselben
`StartOptions`-Regeln wie direkte Starts. Ein eigener Starter ist nicht nötig.

Ändern Sie Grenzen für künftige Starts durch Aktualisieren der Aktion:

```php
$schedule = ScheduleManager::update($schedule, action: [
    ...$schedule->action,
    'execution_timeout_seconds' => 240,
    'run_timeout_seconds' => 90,
]);
```

Die Aktion wird ersetzt. Erhalten Sie deshalb wie gezeigt Workflow-Klasse und
Eingabe. Bereits gestartete Läufe behalten ihre ursprünglichen Fristen.
Setzen Sie ein Timeout-Feld auf `null`, um diese Grenze für spätere Starts zu
entfernen.

## Erweiterte Zeitplanung {#advanced-scheduling}

Die folgenden Abschnitte behandeln Funktionen für Fälle, in denen ein einfacher
Cron-Zeitplan nicht genügt: feste Intervalle, gemischte Cron-/Intervallspezifikationen
und Überschneidungsrichtlinien. Überspringen Sie sie, sofern Sie diese nicht
benötigen.

### Intervallbasierte Zeitpläne {#interval-based-schedules}

Neben Cron-Ausdrücken unterstützen Zeitpläne intervallbasierte Auslösung mit
ISO-8601-Dauersyntax. Verwenden Sie `ScheduleManager::createFromSpec()` für
volle Kontrolle über die Spezifikation:

```php
use Workflow\V2\Support\ScheduleManager;

$schedule = ScheduleManager::createFromSpec(
    scheduleId: 'health-check-30m',
    spec: [
        'intervals' => [
            ['every' => 'PT30M'],
        ],
    ],
    action: [
        'workflow_type' => 'health-check',
        'workflow_class' => HealthCheckWorkflow::class,
        'input' => ['region' => 'us-east-1'],
    ],
);
```

### Felder der Intervallspezifikation {#interval-spec-fields}

| Feld | Typ | Beschreibung |
|---|---|---|
| `every` | `string` | ISO-8601-Dauer, z. B. `PT30M` für 30 Minuten, `PT1H` für 1 Stunde, `P1D` für 1 Tag |
| `offset` | `string\|null` | Phasenversatz als ISO-8601-Dauer; verschiebt den Ausrichtungspunkt des Intervalls |

Der Parameter offset steuert, an welcher Stelle des Intervallzyklus ausgelöst
wird. Ein stündliches Intervall mit 5 Minuten Versatz löst etwa bei `:05`,
`:05+1h` usw. aus:

```php
$schedule = ScheduleManager::createFromSpec(
    scheduleId: 'offset-hourly',
    spec: [
        'intervals' => [
            ['every' => 'PT1H', 'offset' => 'PT5M'],
        ],
    ],
    action: [
        'workflow_type' => 'sync-workflow',
        'workflow_class' => SyncWorkflow::class,
        'input' => [],
    ],
);
```

### Gemischte Cron- und Intervallspezifikationen {#mixed-cron-and-interval-specs}

Ein Zeitplan kann Cron-Ausdrücke und Intervalle kombinieren. Die Engine wertet
alle Spezifikationen aus und verwendet die früheste kommende Auslösezeit:

```php
$schedule = ScheduleManager::createFromSpec(
    scheduleId: 'mixed-schedule',
    spec: [
        'cron_expressions' => ['0 12 * * *'],  // noon daily
        'intervals' => [['every' => 'PT6H']],  // every 6 hours
        'timezone' => 'America/Chicago',
    ],
    action: [
        'workflow_type' => 'report-workflow',
        'workflow_class' => ReportWorkflow::class,
        'input' => [],
    ],
);
```

`createFromSpec` akzeptiert dieselben Lebenszyklusparameter wie `create()`
(`overlapPolicy`, `jitterSeconds`, `maxRuns`, `connection`, `queue`,
`namespace` usw.) als separate benannte Argumente.

## Überschneidungsrichtlinien {#overlap-policies}

Löst ein Zeitplan aus, während der vorherige Lauf noch aktiv ist, steuert die
Überschneidungsrichtlinie das Verhalten:

| Richtlinie | Verhalten |
|---|---|
| `Skip` | Keinen neuen Lauf starten (Standard) |
| `BufferOne` | Eine ausstehende Auslösung puffern; weitere überspringen, bis der Puffer abgearbeitet ist. Beim nächsten `tick()` nach Abschluss des aktiven Laufs wird die gepufferte Auslösung automatisch gestartet. |
| `BufferAll` | Alle ausstehenden Auslösungen ohne Obergrenze puffern; jede wird nacheinander nach Abschluss vorheriger Läufe abgearbeitet. |
| `AllowAll` | Den neuen Lauf unabhängig vom Zustand des vorherigen starten |
| `CancelOther` | Den vorherigen Lauf abbrechen und dann den neuen starten |
| `TerminateOther` | Den vorherigen Lauf beenden und dann den neuen starten |

## Zeitpläne verwalten {#managing-schedules}

### Pausieren und fortsetzen {#pause-and-resume}

```php
ScheduleManager::pause($schedule);

// The schedule will not trigger while paused.

ScheduleManager::resume($schedule);
// next_fire_at is recalculated from now.
```

### Aktualisieren {#update}

```php
ScheduleManager::update(
    $schedule,
    cronExpression: '30 3 * * *',
    timezone: 'America/Chicago',
    overlapPolicy: ScheduleOverlapPolicy::AllowAll,
    notes: 'Moved to 3:30 AM CT.',
);
```

Das Ändern von Cron-Ausdruck oder Zeitzone berechnet `next_fire_at` neu.

### Löschen {#delete}

```php
ScheduleManager::delete($schedule);
```

Das Löschen erfolgt logisch: Die Zeile bleibt mit Status `deleted` und
Zeitstempel `deleted_at` bestehen. Ein gelöschter Zeitplan kann nicht pausiert,
fortgesetzt, aktualisiert oder ausgelöst werden.

### Beschreiben {#describe}

```php
$description = ScheduleManager::describe($schedule);

$description->scheduleId;      // 'daily-invoice-sync'
$description->namespace;       // 'default'
$description->status;          // ScheduleStatus::Active
$description->spec;            // ['cron_expressions' => ['0 2 * * *'], 'timezone' => 'America/New_York']
$description->overlapPolicy;   // ScheduleOverlapPolicy::Skip
$description->firesCount;      // 47
$description->nextFireAt;      // DateTimeInterface|null
$description->lastFiredAt;     // DateTimeInterface|null
$description->latestInstanceId; // 'schedule:daily-invoice-sync:...'
$description->jitterSeconds;   // 0
$description->note;            // 'Runs every night at 2 AM ET.'
$description->toArray();       // full array representation
```

### Anhand der Zeitplan-ID suchen {#find-by-schedule-id}

```php
$schedule = ScheduleManager::findByScheduleId('daily-invoice-sync');
```

## Zeitpläne auslösen {#triggering-schedules}

### Manuelle Auslösung {#manual-trigger}

```php
$instanceId = ScheduleManager::trigger($schedule);
```

Dies wertet die Überschneidungsrichtlinie sofort aus und startet, sofern
zulässig, einen neuen Workflow-Lauf. Zurückgegeben wird die Instanz-ID des
gestarteten Workflows oder `null`, wenn die Auslösung übersprungen wurde.

### Tick (alle fälligen Zeitpläne auswerten) {#tick-evaluate-all-due-schedules}

```php
$results = ScheduleManager::tick();

// Returns rows with schedule_id, instance_id, outcome, occurrence_time,
// last_fired_at, and next_fire_at when those fields apply.
```

`tick()` findet alle aktiven Zeitpläne mit vergangenem `next_fire_at` und löst
sie der Reihe nach aus. Das Feld `occurrence_time` ist die vom Scheduler
beobachtete fällige Auslösezeit. Nach jeder Auslösung wird `next_fire_at` anhand
der aktuellen Uhrzeit auf das nächste Cron- oder Intervallvorkommnis gesetzt.

### Richtlinie für verpasste Auslösungen {#missed-fire-policy}

Die laufende Zeitplanauswertung verwendet die Semantik **einmal auslösen, dann
normal fortsetzen**. Ist der Scheduler über eine oder mehrere reguläre
Auslösezeiten hinweg ausgefallen, startet der erste Tick nach Wiederherstellung
einen Workflow für das überfällige `next_fire_at`. Er zeichnet diese fällige
Zeit als `occurrence_time` auf und setzt `next_fire_at` anhand der aktuellen
Uhrzeit weiter. Weitere reguläre Vorkommnisse während des Ausfalls werden von
der laufenden Auswertung übersprungen.

Verwenden Sie `backfill()`, wenn jedes verpasste Vorkommnis laufen muss.
Nachholen zählt das angeforderte Zeitfenster explizit auf und zeichnet jedes
Vorkommnis separat auf.

### Artisan-Befehl {#artisan-command}

Führen Sie einen einzelnen Tick von der Befehlszeile aus:

```bash
php artisan workflow:v2:schedule-tick
php artisan workflow:v2:schedule-tick --json
```

Der eigenständige Server bietet denselben Auswertungsdurchlauf mit einem
eigenen Befehl an:

```bash
php artisan schedule:evaluate --limit=100
```

Rufen Sie diesen Befehl über Laravels Aufgabenplanung auf, um Zeitpläne
kontinuierlich auszuwerten:

```php
// app/Console/Kernel.php
$schedule->command('workflow:v2:schedule-tick')->everyMinute();
```

## Maximale Laufzahl {#max-runs}

Ist `maxRuns` gesetzt, führt der Zeitplan `remaining_actions` mit. Nach der
letzten erlaubten Auslösung wird er automatisch logisch gelöscht.

```php
$schedule = ScheduleManager::create(
    scheduleId: 'one-shot-retry',
    workflowClass: RetryWorkflow::class,
    cronExpression: '*/5 * * * *',
    maxRuns: 3,
);

// After 3 triggers, the schedule status becomes 'deleted'.
```

## Nachholen {#backfill}

Nachholen startet Workflows für verpasste vergangene Cron-Vorkommnisse, etwa
nach einer Pause, einem Bereitstellungsausfall oder verspäteter Erstellung:

```php
$results = ScheduleManager::backfill(
    $schedule,
    from: new DateTimeImmutable('2026-04-10 00:00:00'),
    to: new DateTimeImmutable('2026-04-14 00:00:00'),
);

// Returns: [['schedule_id' => '...', 'instance_id' => '...|null', 'cron_time' => '...'], ...]
```

Jedes verpasste Cron-Vorkommnis wird der Reihe nach ausgelöst. Die
Überschneidungsrichtlinie gilt für jedes Vorkommnis mit einer Ausnahme:
**Pufferrichtlinien (`BufferOne`, `BufferAll`) werden beim Nachholen als
`AllowAll` behandelt**. Puffern steuert den Echtzeitfluss und ist für
Nachholvorgänge bedeutungslos. Nachholen soll jedes verpasste Vorkommnis
starten, statt es in einen nie geleerten Puffer zu stellen. Sie können die
Richtlinie auch explizit überschreiben:

```php
$results = ScheduleManager::backfill(
    $schedule,
    from: new DateTimeImmutable('2026-04-10 00:00:00'),
    to: new DateTimeImmutable('2026-04-14 00:00:00'),
    overlapPolicyOverride: ScheduleOverlapPolicy::AllowAll,
);
```

Nachholen berücksichtigt `maxRuns`. Sind die verbleibenden Aktionen während
des Vorgangs ausgeschöpft, stoppt er und der Zeitplan wird automatisch gelöscht.

Nachhol-Instanz-IDs sind deterministisch:
`schedule:{scheduleId}:backfill:{timestamp}`.

## Queue-Routing {#queue-routing}

Ist `connection` oder `queue` am Zeitplan gesetzt, werden ausgelöste Workflows
an diese Verbindung und Queue statt an den Standard der Workflow-Klasse
gesendet:

```php
$schedule = ScheduleManager::create(
    scheduleId: 'priority-sync',
    workflowClass: InvoiceSyncWorkflow::class,
    cronExpression: '0 * * * *',
    connection: 'redis',
    queue: 'high-priority',
);

// Every triggered run dispatches to redis/high-priority,
// regardless of InvoiceSyncWorkflow's default routing.
```

Die Routing-Priorität lautet: Zeitplanfelder → Workflow-Klassenstandards →
globale Queue-Konfiguration.

## Zufällige Zeitstreuung {#jitter}

Haben mehrere Zeitpläne denselben Cron-Ausdruck, lösen sie alle zum exakt
gleichen Zeitpunkt aus und erzeugen eine Lastspitze. `jitterSeconds` verteilt
Auslösungen über ein zufälliges Zeitfenster und glättet so die Last.

```php
$schedule = ScheduleManager::create(
    scheduleId: 'hourly-report',
    workflowClass: ReportWorkflow::class,
    cronExpression: '0 * * * *',
    jitterSeconds: 300, // fire within 0–300 seconds after the top of the hour
);
```

Ist `jitterSeconds` gesetzt, wird jedes berechnete `next_fire_at` um einen
Zufallswert zwischen 0 und einschließlich `jitterSeconds` verschoben. Bei jeder
Berechnung der nächsten Auslösezeit wird neu gewürfelt: nach Auslösung,
Fortsetzung oder Aktualisierung.

Die Zeitstreuung gilt nur für die in der Datenbank gespeicherte Auslösezeit der
Tick-Auswertung. Die Nachholaufzählung verwendet immer kanonische Cron-Zeiten
ohne Streuung, damit nachgeholte Vorkommnisse exakt auf Cron-Grenzen liegen.

`jitterSeconds = 0` (Standard) deaktiviert die Streuung vollständig.
Auslösezeiten entsprechen dann exakt dem Cron-Ausdruck.

## Historienereignistypen {#history-event-types}

Zeitplan-Lebenszyklusereignisse werden in zwei getrennten Ereignisströmen
aufgezeichnet:

- **Workflow-Laufabstammung.** Löst ein Zeitplan einen Workflow aus, wird dessen Historie (`workflow_history_events`) ein Ereignis `ScheduleTriggered` angefügt. So erhält der Lauf eine überprüfbare Verknüpfung zu seinem auslösenden Zeitplan.
- **Zeitplan-Auditstrom.** Jeder Lebenszyklusübergang wird im Auditprotokoll des jeweiligen Zeitplans (`workflow_schedule_history_events`) unter monoton steigendem `sequence` aufgezeichnet. Der Auditstrom ist maßgeblich dafür, was mit dem Zeitplan geschah. Die Laufhistorie ist maßgeblich dafür, warum dieser Lauf gestartet wurde.

Beide Ströme verwenden dasselbe Enum `HistoryEventType` und dieselbe
Payload-Schlüsselregistrierung `HistoryEventPayloadContract`. Ereignisnamen
und Payload-Formen bleiben dadurch stromübergreifend synchron.

### Laufabstammungsereignis (am gestarteten Workflow-Lauf) {#run-lineage-event-on-the-started-workflow-run}

`ScheduleTriggered` wird der Historie des ausgelösten Workflow-Laufs mit
folgenden Payload-Schlüsseln angefügt:

- `schedule_id`: die für Benutzer sichtbare Zeitplankennung.
- `schedule_ulid`: der interne ULID-Primärschlüssel des Zeitplans.
- `cron_expression`, `timezone`, `overlap_policy`: primärer Cron-Ausdruck, IANA-Zeitzone und aktive Überschneidungsrichtlinie zum Auslösezeitpunkt.
- `trigger_number`: Nummer dieser Auslösung, beginnend bei 1.
- `occurrence_time`: die vom Scheduler ausgewertete Auslösezeit. Tick-Auslösungen zeichnen das fällige `next_fire_at` auf; Nachholauslösungen das aufgezählte Nachholvorkommnis. Bei aktivierter Streuung enthält der Tick-Wert die im Zeitplan gespeicherte gestreute Auslösezeit.

### Zeitplan-Auditstrom (am Zeitplan selbst) {#schedule-audit-stream-on-the-schedule-itself}

Jeder Lebenszyklusübergang wird im eigenen Auditstrom des Zeitplans
aufgezeichnet. Sequenzen beginnen bei `1` für `ScheduleCreated` und steigen
pro Zeitplan monoton.

| Ereignis | Aufzeichnungszeitpunkt | Payload-Schlüssel |
| --- | --- | --- |
| `ScheduleCreated` | Zeitplan wurde erstellt | `spec`, `action`, `overlap_policy`, `next_fire_at`, `command_context` |
| `SchedulePaused` | Zeitplan wurde pausiert | `reason`, `paused_at`, `command_context` |
| `ScheduleResumed` | Zeitplan wurde fortgesetzt | `next_fire_at`, `command_context` |
| `ScheduleUpdated` | Cron, Zeitzone, Spezifikation, Aktion oder Richtlinie wurde geändert | `changed_fields`, `spec`, `action`, `overlap_policy`, `next_fire_at`, `command_context` |
| `ScheduleTriggered` | Ein Workflow-Lauf wurde aus dem Zeitplan gestartet | `workflow_instance_id`, `workflow_run_id`, `outcome`, `effective_overlap_policy`, `trigger_number`, `occurrence_time`, `command_context` |
| `ScheduleTriggerSkipped` | Auslösung wurde wegen Überschneidungsrichtlinie, nicht auslösbarem Status oder ausgeschöpfter Aktionen übersprungen | `reason`, `skipped_trigger_count`, `last_skipped_at`, `command_context` |
| `ScheduleDeleted` | Zeitplan wurde durch explizites Löschen oder Ausschöpfen von `max_runs` logisch gelöscht (`reason: max_runs_exhausted`) | `reason`, `deleted_at`, `command_context` |

`command_context` enthält die von `ScheduleManager` aufgezeichneten Attribute
für Principal, Anfrage-ID, Quelle und Begründung, wenn der Aufrufer einen
`CommandContext` übergibt. Er ist optional. Ereignisse ohne Kontext lassen den
Schlüssel weg, statt einen leeren Wert zu schreiben.

### Stabilität des Payload-Vertrags {#payload-contract-stability}

Die Payload-Schlüssel beider obigen Tabellen sind in
`Workflow\V2\Support\HistoryEventPayloadContract` deklariert, werden bei jedem
Schreibzugriff geprüft und durch Tests im Workflow-Paket festgelegt. Ein neuer
Schlüssel in einem Zeitplanereignis ändert das Übertragungsformat und folgt den
Regeln für Historienereignisänderungen im
[Versionskompatibilitätsvertrag](../compatibility.md).

### Aufbewahrung {#retention}

Der Auditstrom wird für die Lebensdauer der Zeitplanzeile aufbewahrt.
Zeitplanlöschung ist eine logische Löschung mit abschließendem Ereignis
`ScheduleDeleted`. Auditzeilen werden beim Entfernen einer Zeitplanzeile nicht
kaskadierend gelöscht. Betreiber, die historische Zeitpläne endgültig entfernen,
müssen eine explizite Aufbewahrungsstrategie für ihre Bereitstellung wählen.
Das Paket enthält keine eingebaute TTL für Auditereignisse.

### Sichtbarkeit {#visibility}

Der Auditstrom ist über jede Betreiberoberfläche zugänglich:

- **Im Prozess (Eloquent).** `WorkflowSchedule::historyEvents()` (aufgelöst über `ConfiguredV2Models::query(
  'schedule_history_event_model', ...)`) liefert den Strom eines Zeitplans innerhalb der Hostanwendung.
- **Waterline-HTTP.** `GET /waterline/api/v2/schedules/{scheduleId}/history` liefert den Strom mit `limit` (1–500, Standard 100) und Cursor-Paginierung über `after_sequence`. Die Antwort ist auf Waterlines Namespace beschränkt. Mehrmandantenbereitstellungen sehen dadurch nur Auditzeilen ihres Mandanten.
- **Waterline-Oberfläche.** Die Aktion **Historie** in jeder Zeile des Zeitplanregisters öffnet ein Dialogfenster mit dem Strom dieses Zeitplans. Ereignisse zeigen Sequenz, aufgezeichneten Zeitstempel, Ereignistyp, verknüpfte Workflow-Instanz- und Lauf-IDs sowie formatierten Payload. **Mehr laden** rückt den Cursor in Stapeln zu 100 weiter.
- **HTTP des eigenständigen Servers.** `GET /api/schedules/{scheduleId}/history` liefert denselben Strom mit demselben Paginierungsvertrag und denselben `X-Namespace`-Regeln. Die Historie bleibt nach logischem Löschen eines Zeitplans verfügbar, da Betreiber die Auditspur zur Rekonstruktion entfernter Zeitpläne benötigen.
- **CLI.** `dw schedule:history <schedule-id>` gibt den Strom als Tabelle (`Seq`, `Event`, `Recorded At`, `Workflow Refs`) mit dem Hinweis **More events available** aus, wenn `has_more` wahr ist. `--limit` und `--after-sequence` werden an den Server-Endpunkt weitergereicht. `--all` durchläuft alle verbleibenden Ereignisse. `--output=json` / `--output=jsonl` erzeugen strukturierte Ausgabe. `jsonl` lässt den Cursor-Umschlag weg, sodass jede Zeile ein eigenständiges Ereignis ist.
- **Python-SDK.** `Client.get_schedule_history(schedule_id, *, limit=None,
  after_sequence=None)` liefert eine einzelne `ScheduleHistoryPage`. `Client.iter_schedule_history(schedule_id, *, limit=None, after_sequence=None)` ist ein `AsyncIterator[ScheduleHistoryEvent]`, der mit denselben Schlüsselwortargumenten durch den gesamten Strom blättert. `ScheduleHandle` bietet passende Komfortmethoden `.history(...)` und `.iter_history(...)`. `limit` wird serverseitig auf 1 bis 500 begrenzt (Standard 100). `after_sequence` ist ein nicht negativer Cursor aus `next_cursor` der vorherigen Seite.

Alle diese Oberflächen lesen dieselbe Tabelle
`workflow_schedule_history_events`. Der Vertrag unter
[Stabilität des Payload-Vertrags](#payload-contract-stability) gilt unabhängig
von der gewählten Oberfläche.

### Migrationsverhalten für ältere Zeitpläne {#migration-behavior-for-pre-audit-schedules}

Der Zeitplan-Auditstrom wurde zusammen mit der Tabelle
`workflow_schedule_history_events` eingeführt. Zuvor erstellte Zeitpläne
erhalten kein rückwirkendes `ScheduleCreated`. `ScheduleManager` zeichnet
Auditereignisse nur bei tatsächlichen Lebenszyklusübergängen auf. Die Migration
erzeugt kein nachgetragenes Ereignis für bestehende Zeitpläne.

Für Betreiber bedeutet das:

- Der Strom eines bestehenden Zeitplans bleibt bis zum nächsten Lebenszyklusübergang leer. Pausieren, Fortsetzen, Aktualisieren, Auslösen, Überspringen einer Auslösung oder Löschen fügt ab dann normal Ereignisse an.
- Sequenznummern beginnen weiterhin bei `1` und steigen pro Zeitplan monoton. Ist das erste aufgezeichnete Ereignis eines bestehenden Zeitplans `SchedulePaused`, hat diese Zeile `sequence = 1`. Das Fehlen eines vorherigen `ScheduleCreated` ist erwartet.
- `ScheduleTriggered` und `ScheduleTriggerSkipped` werden bei jeder Tick-Auswertung des Zeitplans geschrieben. Jeder nach der Migration im Cron-Takt auslösende Zeitplan sammelt deshalb ohne Betreibereingriff Auditzeilen.
- Zur Aufnahme eines Zeitplans in den Auditstrom ist keine Aktion nötig. Er ist immer aktiv und hat nur bis zum ersten Ereignis nach der Migration keine Zeilen.

## Übersprungene Auslösungen nachverfolgen {#skip-tracking}

Wird eine Auslösung wegen Überschneidungsrichtlinie, nicht auslösbarem Status
oder ausgeschöpfter Aktionen übersprungen, führt der Zeitplan dies mit:

- `last_skip_reason`: Grund der letzten übersprungenen Auslösung, etwa `overlap_policy_skip`, `status_not_triggerable`, `remaining_actions_exhausted`.
- `last_skipped_at`: Zeitpunkt des Überspringens.
- `skipped_trigger_count`: Gesamtzahl übersprungener Auslösungen.

Diese Felder sind in `ScheduleManager::describe()` und der
Waterline-Zeitplandetail-API enthalten.

## Namespace-Beschränkung {#namespace-scoping}

Zeitpläne gehören zu einem Namespace. Wird `namespace` an `create()` oder
`createFromSpec()` übergeben, ist der Zeitplan auf diesen Namespace beschränkt.
Andernfalls erbt er das konfigurierte `workflows.v2.namespace`, standardmäßig
`'default'`.

Zeitplan-IDs sind innerhalb eines Namespace eindeutig. Dieselbe `scheduleId`
kann in verschiedenen Namespaces konfliktfrei existieren.

Der Standard-PHP-Zeitplanstarter übergibt den gespeicherten Namespace an
Workflow-Instanz, Lauf und dauerhafte Aufgaben. Eine spätere Änderung des
Anwendungs-Standard-Namespace verschiebt die Ausführungen eines vorhandenen
Zeitplans nicht. Verwenden Sie Workflow 2.4.2 oder neuer für diese
Namespace-Weitergabe.

```php
$schedule = ScheduleManager::create(
    scheduleId: 'daily-sync',
    workflowClass: SyncWorkflow::class,
    cronExpression: '0 2 * * *',
    namespace: 'billing',
);

// Find by schedule ID within a namespace:
$found = ScheduleManager::findByScheduleId('daily-sync', namespace: 'billing');
```

Ist Waterline mit einem Namespace (`waterline.namespace`) konfiguriert,
beschränken sich Zeitplanlisten- und Detailendpunkte automatisch darauf.
Mehrmandantenbereitstellungen zeigen dadurch nur Zeitpläne des Betreiber-Namespace.

## Datenbank {#database}

Die Zeitplantabelle (`workflow_schedules`) wird durch Migration
`2026_04_14_000157` erstellt. Die Modellklasse ist über
`workflows.v2.schedule_model` konfigurierbar.

Wenn Ihre Bereitstellung Paket- und Anwendungsmigrationen zusammen ausführt,
erkennt Migration 157 eine bereits vorhandene Tabelle `workflow_schedules`
und behandelt sie entsprechend: Entspricht sie bereits dem Paketschema,
bleibt sie unverändert. Wurde sie von einer früheren Übergangsmigration mit
anderem Schema erstellt, wird sie ersetzt.
