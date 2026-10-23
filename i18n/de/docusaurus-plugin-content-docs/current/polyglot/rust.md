---
sidebar_position: 5
title: Rust SDK
description: Das offizielle Rust SDK installieren und Crate, Quellcode sowie generierte API-Dokumentation finden.
tags:
  - Rust
  - SDK
  - workers
  - polyglot
keywords:
  - sample-app-playground
  - Rust SDK
  - durable-workflow-Crate
  - Rust-Worker
  - crates.io
---

import ProductPromotion from '@site/src/components/ProductPromotion';

# Rust SDK {#rust-sdk}

Dieser Leitfaden beschreibt die allgemein verfügbare SDK-Oberfläche. Einzelne
Typen und Methoden erklärt die generierte API-Referenz. Ein Cloud-Konto ist
nicht erforderlich: Der primäre Weg verwendet die veröffentlichte Rust-Crate
mit selbst gehostetem Server. Bereits zum kontrollierten Vorabzugang von
Durable Workflow Cloud zugelassene Entwickler können stattdessen den klar
getrennten [Schnellstart für verwaltete Laufzeitumgebungen](./rust-cloud-quickstart.md) wählen.

Das offizielle Rust SDK dient der Workflow-Implementierung und ist mehr als
ein Protokollkompatibilitätsclient. Rust implementiert deterministische
Workflows, Aktivitäten und langlebige Worker-Dienste mit demselben dauerhaften
Ausführungsmodell wie PHP und Python. Der asynchrone Control-Plane-Client
startet, signalisiert, fragt ab, aktualisiert, bricht ab, terminiert und wartet
auf Ausführungen. Die Worker-Laufzeitumgebung gibt Workflow-Historie wieder,
führt Workflow-/Aktivitäts-/Update-Handler aus, meldet Worker- und
Aktivitäts-Heartbeats und tauscht sprachneutrale Nutzlasten mit selbst gehostetem
Server oder einer Cloud-Namespace-Laufzeitumgebung aus.

Die [Rust-Dokumentationsstartseite](https://rust.durable-workflow.com/) bietet
SDK-Index und allgemeine Einstiegspunkte. Crate-Module, Structs, Traits und
Methoden stehen in der generierten [Rust-SDK-API-Referenz](https://rust.durable-workflow.com/durable_workflow/).

Das stabile Rust SDK unterstützt dauerhafte Timer, Kind-Workflows,
Aktivitätswiederholungen und -Timeouts, lokale Aktivitäten, Worker-Sitzungen,
Sticky-Ausführung, Signale, Abfrage-Handler mit Replay, Abbruch und Terminierung,
serverseitig erzwungene Workflow-Fristen, typisierte Seiteneffekte,
Versionsmarker, Updates und typisierte Terminal-/Replay-Fehler. Es beansprucht
noch keine Zeitplanverwaltung. Verwenden Sie den
[2.0-Fähigkeitsindex](/docs/capabilities/), statt identischen Funktionsumfang
aller SDKs anzunehmen.

## Die lokale Testumgebung der Sample App ausprobieren {#try-the-local-sample-app-playground}

Für den kürzesten Implementierungsweg ohne Cloud öffnen Sie den aktuellen
[`main`-Branch der Sample App in GitHub Codespaces](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main)
und führen Sie aus:

<!-- docs-example id="sdk.rust.sample-app-playground" -->
```bash
scripts/playground rust
```

Die lokale Testumgebung erzeugt Workflow- und Aktivitätsquellcode unter der
Verantwortung des Aufrufers, wählt aktuelle stabile Artefakte und startet die
veröffentlichten Server- und Waterline-Versionen. Vor dem Workflow-Start wartet
sie auf eine Worker-Registrierung, deren Identität, Workflow-Typ, Aktivitätstyp
und Task-Warteschlange zum erzeugten Vertrag passen. Erfolg erfordert das
erwartete abgeschlossene Ergebnis und die Historie. Danach gibt das Terminal
den genauen lokalen Waterline-Lauflink und den Pfad zum strukturierten
JSON-Nachweis aus.

Dieses bewusst kleine, auf Transport ausgerichtete Gerüst verwendet
`serde_json::Value`. Es ist nicht der einzige empfohlene Rust-Anwendungsvertrag.
Fahren Sie mit dem vorhandenen [Beispiel für typisierte Ein-/Ausgaben](https://github.com/durable-workflow/sdk-rust/blob/main/examples/hello_world.rs),
dem [Aktivitätsrichtlinienbeispiel für Wiederholung, Timeout, Heartbeat und terminale Fehler](https://github.com/durable-workflow/sdk-rust/blob/main/examples/activity_options.rs)
und dem [Beispiel lokaler Aktivitäten](https://github.com/durable-workflow/sdk-rust/blob/3.1.0/examples/local_activities.rs)
fort. Paket, Repository-Beispiel und generierte API-Referenz unten bleiben die
direkten Wege ohne Sample App.

## Paket und Quellcode {#package-and-source}

- [Crate auf crates.io](https://crates.io/crates/durable-workflow)
- [Quellcode-Repository](https://github.com/durable-workflow/sdk-rust)

Installieren Sie das Rust SDK aus dem letzten erfolgreich qualifizierten Tupel.
Die genaue Anforderung wird aus derselben maschinenlesbaren Autorität wie der
Server-Schnellstart erzeugt:

<!-- docs-example id="rust.sdk.install" -->
```bash
%%artifact.rustCargoAddCommand%%
```

Oder deklarieren Sie dieselbe qualifizierte Anforderung direkt in `Cargo.toml`:

```toml
[dependencies]
%%artifact.rustCargoRequirement%%
```

Die Crate benötigt Rust 1.86 oder neuer. Ihre Paketmetadaten halten die zur
Qualifizierung verwendete Server-Version, Standard- und Mindestversion des
Worker-Protokolls sowie Control Plane 2 fest. Kompatibilität mit einem neueren
Server wird separat geprüft. Verwenden Sie bei der Bereitstellung die unter
`GET /api/cluster/info` gemeldeten Protokollmanifeste und Fähigkeiten.

Server handelt Worker-Protokoll-Header innerhalb von Hauptversion `1` aus:
Ein Server mit `1.N` akzeptiert den Worker-Header `1.M` nur bei `M <= N`.
Rust SDK 3.5.0 verwendet standardmäßig
`X-Durable-Workflow-Protocol-Version: 1.20` und benötigt einen Server mit
`1.20` oder neuer. Wählen Sie für einen älteren kompatiblen Server
`WorkerProtocolVersion::V119` über `worker_protocol_version` am Client-Builder.
SDK 3.4.x verwendet standardmäßig `1.19`. Das opt-in-Profil für kooperativen
Abbruch benötigt `1.20` und lehnt explizite Auswahl von `1.19` ab.

Die Aushandlung lehnt Unsicherheit strikt ab. Fehlende oder ungültige Header,
eine andere Hauptversion oder eine höhere Worker-Nebenversion als die vom
Server gemeldete werden abgelehnt. SDK- und Server-Release-Versionen werden
unabhängig geführt. Ihre Laufzeit-Protokollmanifeste bestimmen die Kompatibilität.

## Workflow-Listen und vollständiger Laufverlauf {#workflow-lists-and-history}

Diese APIs benötigen Rust SDK **4.6.0 oder neuer**. Prüfen Sie `Cargo.lock`, da die separate Installationskombination oben ein älteres Crate wählen kann. Die [Abnahme des normal installierten Pakets](https://github.com/durable-workflow/sdk-rust/issues/122#issuecomment-6363352910) bestätigt drei Listenseiten, sechs Verlaufsseiten, 128 KiB Payload, Export/Replay und das Nur-Lese-Beispiel mit veröffentlichtem Server 2.11.0. Offline-Testhelfer benötigen 4.5.0; diese Listen-/Verlaufsmethoden und Iteratoren benötigen 4.6.0. Die ausgewählte Server/SDK-Kombination bleibt unverändert.

`Client::list_workflows(WorkflowListOptions)` und `Client::get_workflow_history(workflow_id, run_id, WorkflowHistoryOptions)` liefern jeweils **eine Seite**. Setzen Sie manuell mit dem undurchsichtigen `next_page_token` fort oder lesen Sie vollständig mit verzögerten Iteratoren. Server-Validierung, Filter und Namespace bleiben erhalten; neue Abfragefelder oder Grammatik kommen nicht hinzu. Finden Sie beispielsweise einen offenen Lauf über ein registriertes Keyword-Attribut:

```rust
use durable_workflow::WorkflowListOptions;
async fn find(client: durable_workflow::Client) -> durable_workflow::Result<()> {
let mut matches = client.iter_workflows(
    WorkflowListOptions::new()
        .workflow_type("payments")
        .status("running")
        .query("OrderRef = 'order-42'")
        .page_size(2),
);
match (matches.next().await?, matches.next().await?) {
    (Some(run), None) => println!("open run: {} / {}", run.workflow_id, run.run_id),
    (None, _) => println!("no open run"),
    _ => println!("multiple open runs; refine the query"),
}
Ok(())
}
```

Der Server-Filter `status=running` wählt den aktiven **Statusbereich**, einschließlich der Rohstatus `pending` und `waiting`. `WorkflowSummary` erhält `status`, `status_bucket`, `is_terminal`, Suchattribute und unbekannte Metadaten in `raw`. Suchattribute sind nicht eindeutig: Ein Filter kann den Elternlauf und Kinder mit geerbtem Wert finden. Behandeln Sie null, einen und mehrere Treffer wie oben. Erstellen Sie den Client im gewünschten Namespace vor dem Iterator; Namespace und Filter bleiben über alle Token gleich.

Lesen Sie den gesamten ausgewählten Lauf, ohne alle Seiten gleichzeitig zu laden:

```rust
use durable_workflow::WorkflowHistoryOptions;
async fn audit(client: durable_workflow::Client) -> durable_workflow::Result<()> {
let mut events = client.iter_workflow_history(
    "payment-42", "selected-run-id", WorkflowHistoryOptions::new().page_size(100),
);
while let Some(event) = events.next().await? {
    println!("{}", event.event_type);
}
Ok(())
}
```

`iter_workflows(options)` liefert jede `WorkflowSummary` über `next().await`. Beide Iteratoren bieten `into_stream()` für `futures_util::TryStreamExt`; pinnen Sie den Stream vor dem Polling. Die Konstruktion führt kein I/O aus; erst nach Verbrauch der aktuellen Seite folgt die nächste Anfrage. Null/leeres Token beendet; eine leere Seite mit Token wird weiterverfolgt. Wiederholte oder zyklische Token liefern `Error::Pagination` mit begrenztem Token-Zustand. Ein Seitenfehler erhält den ursprünglichen typisierten Fehler, danach endet der Iterator. Behandeln Sie den Fehler: Ein Teilergebnis ist kein vollständiges Ergebnis. Das Sammeln eines Streams speichert sämtliche gesammelten Elemente.

Die Verlaufsiteration behält die ursprüngliche Workflow/Lauf-Identität und zählt verfügbare Ereignisse auf. Sie folgt weder continue-as-new noch abonniert sie unbegrenzt. Ereignismetadaten und Payload-Wire-Umschläge bleiben erhalten. Für Offline-Replay verwenden Sie `Client::export_workflow_history` mit `testing::WorkflowHistory::from_export` statt einer unvollständigen Seite. Siehe [Offline-Replay](#rust-replay-export).

Der veröffentlichte Server 2.11 verwendet standardmäßig 50 Listenzeilen (höchstens 200) und 100 Verlaufsereignisse (höchstens 1.000) je Seite. Seitengrößen gehen unverändert zur Server-Validierung. Stoppen Sie bei ausreichenden Ergebnissen, wählen Sie eine geeignete Seitengröße und setzen Sie ein Anwendungszeitlimit. Pagination ergänzt keine Snapshot-Isolation bei gleichzeitigen Änderungen. Siehe das [veröffentlichte Nur-Lese-Beispiel](https://github.com/durable-workflow/sdk-rust/blob/4.6.0/examples/workflow_pagination.rs), die [Client-API](https://rust.durable-workflow.com/durable_workflow/struct.Client.html) und [Pagination-Typen](https://rust.durable-workflow.com/durable_workflow/pagination/index.html).

## Metriken und Prometheus-Export {#rust-sdk-metrics}

Diese APIs benötigen Rust SDK **4.7.0 oder neuer**. Prüfen Sie `Cargo.lock`, da die separate Installationskombination ein älteres Crate wählen kann. Die [Abnahme der normalen Installation](https://github.com/durable-workflow/sdk-rust/pull/131#issuecomment-6364178456) bestätigt vier HTTP-Kontrollen, alle sechs Metriken eines echten Workers mit veröffentlichtem Server 2.11.0 sowie das Exportbeispiel. Die ausgewählte Kombination ändert sich dadurch nicht.

Der Standard-Recorder ist **no-op**. Übergeben Sie einen `Arc<dyn metrics::MetricsRecorder>` mit `increment(name, count, tags)` und `record(name, seconds, tags)`. Client, Klone und neu erzeugte Worker erben ihn. `Worker::metrics_recorder` überschreibt die Poll-/Task-Beobachtungen des Workers; Clientanfragen behalten den Client-Recorder. Callbacks müssen schnell sein und Exporterfehler lokal behandeln. Recorder-Panics mit Unwinding werden von SDK-Ergebnissen isoliert; blockierende Exporter oder Prozessabbrüche kann der Hook nicht reparieren.

Jede beobachtete Clientanfrage, Worker-Abfrage oder Verarbeitung eines bezogenen Tasks erhöht einen Zähler um eins und erfasst eine nichtnegative monotone Dauer in Sekunden. Die sechs stabilen Namen sind:

| Zähler | Dauerhistogramm |
| --- | --- |
| `durable_workflow_client_requests` | `durable_workflow_client_request_duration_seconds` |
| `durable_workflow_worker_polls` | `durable_workflow_worker_poll_duration_seconds` |
| `durable_workflow_worker_tasks` | `durable_workflow_worker_task_duration_seconds` |

Die Client-Tag-Schlüssel sind genau `method`, `route`, `plane`, `status_code`, `outcome`; beim Worker `task_kind`, `task_queue`, `outcome`. Geprüfte Routenplatzhalter enthalten keine IDs, Abfragezeichenfolgen, Payloads oder Zugangsdaten; unbekannte Pfade nutzen `unknown`. Queuenamen kontrolliert die Anwendung: begrenzte Mengen statt einer Queue pro Lauf.

Client-Ergebnisse umfassen `ok`, `http_error`, `bridge_rejected`, `TransportError`, `TimeoutError`, `SdkError` und `pending` für ein abgebrochenes Future. `status_code` erhält einen beobachteten dezimalen HTTP-Status, sonst `none`. Rust-Ausnahmenamen müssen nicht mit anderen SDKs übereinstimmen.

Eine Clientbeobachtung umfasst interne Transport-/Storage-Admission-Wiederholungen und Antwort-/Payload-Verarbeitung; getrennte Anwendungs-/Worker-Aufrufe bleiben getrennt. Ein verzögerter Iterator beobachtet jede angefragte Seite. Worker-Polls enthalten verwaltete Wiederholungen/Backoff und unterscheiden `task`, `empty`, `backpressure`, `error`. Task-Ergebnisse `completed`, `failed`, `expired` beschreiben die Verarbeitung, nicht den Workflow-Endzustand. Dies sind Prozessbeobachtungen, keine dauerhaften Zählungen, Abrechnungseinheiten oder Schedule-to-start-Latenzen; abrupter Prozessverlust kann die letzte Probe auslassen.

Für den offiziellen Prometheus-Adapter aktivieren Sie das optionale Cargo-Feature `metrics-prometheus`. Das Beispiel nutzt die veröffentlichten Abhängigkeiten:

```toml
[dependencies]
durable-workflow = { version = "=4.7.0", features = ["metrics-prometheus"] }
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

Speichern Sie das [veröffentlichte Beispiel](https://github.com/durable-workflow/sdk-rust/blob/4.7.0/examples/metrics_prometheus.rs) als `examples/metrics_prometheus.rs`. Genau diese Quellbytes wurden mit normal installierten Paketen kompiliert und ausgeführt; das Beispiel druckt Metriken einer Gesundheitsanfrage:

```rust
//! Preview application-owned Prometheus export; serve `encode()` from your HTTP metrics route.
use durable_workflow::{metrics::PrometheusMetrics, Client};
use std::sync::Arc;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let recorder = Arc::new(PrometheusMetrics::new()?);
    let client = Client::builder(std::env::var("DURABLE_WORKFLOW_SERVER_URL")?)
        .token(std::env::var("DURABLE_WORKFLOW_AUTH_TOKEN").ok())
        .metrics_recorder(recorder.clone())
        .build()?;
    client.health().await?;
    // Workers inherit this client recorder; Worker::metrics_recorder overrides
    // only worker poll/task observations. Applications own the scrape endpoint.
    print!("{}", String::from_utf8(recorder.encode()?)?);
    Ok(())
}
```

Führen Sie es gegen Ihren selbst gehosteten Server aus:

```bash
DURABLE_WORKFLOW_SERVER_URL=http://localhost:8080 \
DURABLE_WORKFLOW_AUTH_TOKEN=your-token \
cargo run --features metrics-prometheus --example metrics_prometheus
```

`PrometheusMetrics::new()` besitzt eine eigene Registry auf Basis des offiziellen Prometheus-Rust-Clients 0.14. Stellen Sie `encode()`-Bytes auf Ihrer Metrikroute mit `Content-Type: text/plain; version=0.0.4` bereit. Der Adapter erzeugt keinen Listener oder globale Registry. Die Anwendung verwaltet Scrape-Zugriff/Authentifizierung, Netzwerkfreigabe, Ressourcen und Herunterfahren. Zähler ergänzen `_total`, Histogramme die üblichen bucket/sum/count-Reihen. `registry()` erlaubt eigene Erfassung und weitere Metriken.

Für OpenTelemetry-Metriken implementieren Sie den Recorder mit Ihrem vorhandenen Meter: Zähler mit Einheit `1`, Histogramme mit Sekunden `s`, genau den Namen/Tags oben. Provider, Aggregation, Ressourcenlabels und Exporter-Lebenszyklus bleiben bei der Anwendung. Dies ist von Ausführungstracing getrennt. Siehe [Recorder-API](https://rust.durable-workflow.com/durable_workflow/metrics/trait.MetricsRecorder.html), [Prometheus-API](https://rust.durable-workflow.com/durable_workflow/metrics/struct.PrometheusMetrics.html) und [veröffentlichten Vertrag](https://github.com/durable-workflow/sdk-rust/blob/4.7.0/README.md#client-and-worker-metrics).

## Parallelität der Worker-Tasks {#worker-task-concurrency}

Die folgenden begrenzten Ausführungsspuren benötigen Rust SDK **4.3.1 oder neuer**. Prüfen Sie die Version in `Cargo.lock`: Die oben fixierte Installation gehört zu einem anderen qualifizierten Artefaktsatz und kann ein älteres SDK auswählen. Die [Akzeptanz des veröffentlichten Pakets](https://github.com/durable-workflow/sdk-rust/issues/107#issuecomment-6360719863) prüft drei konfigurierte Slots, einen vierten Callback erst nach Slot-Freigabe und sieben abgeschlossene Workflows einschließlich eines behandelten Aktivitätsfehlers. Die oben beschriebenen Server-Protokollanforderungen gelten weiterhin.

`Worker::max_concurrent_workflow_tasks(...)` und `Worker::max_concurrent_activity_tasks(...)` haben jeweils den Standardwert **10**. `run()` und `run_until()` nutzen unabhängige begrenzte Spuren für Workflow und entfernte Aktivität. Wählen Sie **1** für sequenzielle Ausführung innerhalb einer Task-Familie. Konfigurieren Sie zum Beispiel einen vorhandenen Client vor der Handler-Registrierung:

```rust
use durable_workflow::Worker;

let mut worker = Worker::new(client.clone(), "payments")
    .max_concurrent_workflow_tasks(1)
    .max_concurrent_activity_tasks(1);
```

Registrieren Sie die Handler und starten Sie dann `run()` oder `run_until()` wie gewohnt. Zwei Grenzen von eins erlauben weiterhin einen Workflow-Task und einen entfernten Aktivitätstask gleichzeitig. Abfragen behalten ihre eigene Polling-Spur. Worker-Klone teilen die konfigurierte Kapazität, auch bei gleichzeitigen `run_once()`-Aufrufen. Klonen schafft kein weiteres unabhängiges Kontingent.

Die Heartbeat-Verfügbarkeit folgt tatsächlich beanspruchten Tasks einschließlich Eingabe-/History-Laden, Callback-Ausführung und Abschlussbestätigung. Ein leerer Long-Poll lässt Kapazität verfügbar. Erfolg, Fehler, Ablehnung und Abbruch geben den lokalen Slot frei. Inline ausgeführte lokale Aktivitäten belegen ihren **Workflow-Task**-Slot und umgehen den entfernten Aktivitätspool. Das Aktivitätslimit begrenzt deshalb Inline-Ausführung über mehrere Workflows nicht separat.

Handler sind async Futures auf Tokio und müssen Ausführungszeit abgeben. Verwenden Sie für blockierende Arbeit `tokio::task::spawn_blocking` oder einen separaten Prozess mit ausdrücklicher Abbruch- und Shutdown-Grenze. Mehr Parallelität isoliert keine CPU und macht einen abgetrennten Thread nicht abbrechbar. Siehe die [Worker-API](https://rust.durable-workflow.com/durable_workflow/struct.Worker.html) des installierten SDKs.

## Empfangene Wiederholungsbudgets für Aktivitäten {#activity-retry-info}

Rust SDK **4.8.0 oder neuer** stellt `ActivityContext::retry_info()` in Aktivitätshandlern im Service-Modus bereit. Prüfen Sie das installierte Crate in `Cargo.lock`: Die oben separat gewählte Installationsversion kann älter sein. Der zurückgegebene `ActivityRetryInfo` bewahrt die ursprüngliche `attempt_number()` und das empfangene `policy()`-JSON einschließlich unbekannter Felder. Dieser unveränderliche Snapshot des Aufrufs ist von veränderbaren Kompatibilitätsfeldern des Kontexts unabhängig.

Verwenden Sie `attempt_limit()` und `is_last_configured_attempt()`, um das empfangene Budget auszuwerten:

| Empfangene Wiederholungsrichtlinie | `ActivityAttemptLimit` | Letzter konfigurierter Versuch |
| --- | --- | --- |
| Objekt mit positiver Ganzzahl `max_attempts: n` | `Bounded(n)` einschließlich des ersten Versuchs | `Some(true)`, sobald der ursprüngliche Versuch `n` erreicht oder überschreitet, andernfalls `Some(false)` |
| Objekt mit `max_attempts: null` | `Unlimited` | `Some(false)` |
| Fehlende Richtlinie, null auf oberster Ebene, fehlendes Feld oder ungültige Grenze | `Unknown` | `None` |

Der Helper gibt auch bei einer ungültigen Versuchsnummer null `None` zurück. Ein Planungsstandard des Runtimes belegt keine empfangenen Metadaten: Der veröffentlichte Server-2.11.0-Kontrollfall ohne ausdrücklich verfasste Richtlinie lässt den Snapshot aus und meldet daher `Unknown` statt eines abgeleiteten `Bounded(1)`. `policy()` unterscheidet eine fehlende Richtlinie von empfangenem JSON null, ohne eines davon als unbegrenzt zu behandeln. Die [Abnahme mit normal installiertem Paket](https://github.com/durable-workflow/sdk-rust/issues/135#issuecomment-6366200791) umfasst diesen Kontrollfall und das folgende Beispiel.

Registrieren Sie für einen Fallback oder Anwendungsalarm beim letzten konfigurierten Versuch einen Handler an Ihrem vorhandenen Worker:

```rust
use durable_workflow::{json, Worker};

pub fn register_charge(worker: &mut Worker) {
    worker.register_activity("charge", |ctx, _| async move {
        let retry = ctx.retry_info();
        if retry.is_last_configured_attempt() == Some(true) {
            // Select a final-attempt fallback or record an application alert.
        }
        Ok(json!({"attempt": retry.attempt_number()}))
    });
}
```

`Some(false)` verspricht keine weitere Ausführung. Ein nicht wiederholbarer Fehler, Abbruch, Workflow-Abschluss oder abgelaufene Fristen können die Arbeit beenden, bevor das konfigurierte Budget ausgeschöpft ist. Der Helper ändert weder die Zulassung von Wiederholungen noch gewährt er zusätzliche Zeit.

Lokale Aktivitäten und direkte Aufrufe von `testing::WorkflowEnvironment::run_activity` haben keinen empfangenen Server-Snapshot und melden eine unbekannte Richtlinie. Neue `run_workflow`-Tests zeigen den modellierten Snapshot aus ihrer erzeugten Historie. Diese Testsemantik belegt nicht, dass ein bereitgestellter Server eine Richtlinie sendet. Siehe [ActivityRetryInfo](https://rust.durable-workflow.com/durable_workflow/struct.ActivityRetryInfo.html) und [ActivityAttemptLimit](https://rust.durable-workflow.com/durable_workflow/enum.ActivityAttemptLimit.html).

## Stabile Aktivitätsidentität und Idempotenz externer Effekte {#activity-identity}

Rust SDK **4.9.0 oder neuer** stellt die ursprünglich empfangene Identität über `ActivityContext` bereit. Prüfen Sie den installierten Crate in `Cargo.lock`: Die oben unabhängig gewählte Installationsversion kann älter sein. Die Methoden liefern unveränderliche `Option<&str>`-Werte aus dem ursprünglichen Claim, auch bei Aktivitäten in Worker-Sessions.

| Methode | Identität und Verwendung |
| --- | --- |
| `activity_execution_id()` | Eine logische Aktivitätsausführung über Wiederholungsversuche hinweg; zur Deduplizierung einer externen Operation. |
| `workflow_id()` | ID der zugehörigen Workflow-**Instanz**; zur fachlichen Zuordnung. |
| `run_id()` | ID des zugehörigen Workflow-**Runs**; zur Zuordnung dieses konkreten Laufs. |

Leiten Sie einen Schlüssel für eine bestimmte Operation ab und übergeben Sie ihn an eine idempotente externe API oder ein dauerhaftes Effektregister. Dieser Handler erzeugt nur den Schlüssel: Er belastet keine Zahlung und implementiert keine externe Deduplizierung. Fehlt die Aktivitätsidentität, lehnt er vor jedem Effekt ab; alternativ kann die Anwendung einen eigenen ausdrücklich stabilen fachlichen Schlüssel liefern.

```rust
use durable_workflow::{json, ActivityError, Worker};

pub fn register_charge(worker: &mut Worker) {
    worker.register_activity("charge", |ctx, _| async move {
        let execution_id = ctx.activity_execution_id().ok_or_else(|| {
            ActivityError::new("MissingActivityIdentity", "Server activity identity is required")
                .non_retryable(true)
        })?;
        // Pass this key to an idempotent downstream API or durable effect ledger.
        let key = format!("payments:charge:{execution_id}");
        Ok(json!({
            "idempotency_key": key,
            "workflow_id": ctx.workflow_id(),
            "run_id": ctx.run_id(),
        }))
    });
}
```

Lässt ein älterer Server diese Felder aus, bleiben sie `None`. Ersetzen Sie eine fehlende logische Aktivitäts-ID niemals durch eine Task-ID, Versuch-ID oder Versuchsnummer: Der Schlüssel würde sich beim Retry ändern. Inline Local Activities können die tatsächlichen Workflow-/Run-IDs des Eltern-Tasks erhalten, haben aber keine serverseitige Aktivitätsausführungs-ID, bevor der Server ihren Befehl speichert. Serverfreie Aktivitätstests besitzen keine empfangene Claim-Identität.

Ein stabiler Schlüssel ermöglicht die Vermeidung doppelter Effekte nur, wenn das externe System ihn beachtet. Die Zustellung bleibt mindestens einmal; diese API macht externe Effekte nicht genau einmal, stellt keinen Heartbeat-Fortschritt wieder her und implementiert keine fortsetzbaren Aktivitäts-Checkpoints.

Siehe die [Identitätsmethoden von ActivityContext](https://rust.durable-workflow.com/durable_workflow/struct.ActivityContext.html#method.activity_execution_id) und die [Prüfung der normalen Installation 4.9.0](https://github.com/durable-workflow/sdk-rust/issues/139#issuecomment-6367230500) mit Ordinary-/Cooperative-, Local- und Worker-Session-Kontrollen. Der gemeinsame Vertrag steht unter [Ausführungsgarantien](../constraints/execution-guarantees.md#service-activity-identity).

## Begrenzte Fehlerberichte {#bounded-failure-reports}

Diese Grenzen benötigen **tatsächlich installiertes Rust SDK 4.10.1 oder neuer**. Prüfen Sie die `Cargo.lock` des Workers: Ein neuer Client oder Quellcheckout aktualisiert keinen älteren Worker. Die Grenzen gelten für ausgehende Fehlerberichte, nicht für eingehende Historie oder andere fachliche Payloads.

| Feld oder Hülle | Maximum |
| --- | --- |
| UTF-8-Nachricht einschließlich Markierung | 62 KiB |
| Stack, sofern unterstützt | 128 KiB |
| Gemeinsam serialisierte optionale Details, Diagnostics und Metadaten | 64 KiB |
| Vollständiger kodierter Fehleranfrage-Body | 1 MiB |

Die effektive Nachrichtengrenze reserviert 2 KiB unter dem ursprünglichen 64-KiB-Budget für Timeline-Präfixe veröffentlichter Server. JSON-Escaping, Markierungen, Claim-Identität und alle weiteren Felder zählen zum kodierten Body. Eine bekannte niedrigere Transportgrenze kann die Maxima weiter senken. Kleine Berichte behalten den ursprünglichen Inhalt.

Zu großer Text trägt eine sichtbare Markierung. Das vorhandene `diagnostics.sdk_failure_truncation` hält, sofern vom Schema unterstützt, ursprüngliche Bytezahlen und ausgelassene Felder fest. Workflow-/Query-Task-Schemas ohne Diagnostics und einfache Befehlsnachrichten tragen die Statistik in der Nachrichtenmarkierung. Avro-Details bleiben vollständige gültige Hüllen/Runtime-Referenzen oder werden ganz ausgelassen und markiert; Base 64 wird nie zu einem beschädigten Wert abgeschnitten.

Ursprünglicher Ausnahmetyp, Retry-Entscheidung und erforderliche Claim-Identität bleiben erhalten. Low-Level-Consumer können `Client::fail_activity_task_with_failure` und `Client::fail_workflow_task_with_failure` mit dem veröffentlichten Fehlerschema nutzen. `Error::FailureReporting` lehnt einen Bericht ausdrücklich ab, wenn Pflichtdaten nicht hineinpassen; er entscheidet keinen fachlichen Retry und erfindet keine kürzere Identität.

Lokale Fehler werden vor der Beobachtung durch Workflow-Code begrenzt, einschließlich der Leerzeichen-/NUL-Normalisierung des veröffentlichten Servers. Die Endprüfung schreibt weder bereits beobachtete lokale Nachrichten noch andere fachliche Payloads um; passen feste Eingaben nicht hinein, wird abgelehnt.

Diese SDK-Grenzen belegen keine Core-Korrektur abgeleiteter Zusammenfassungen, Lieferung anderer SDKs, Embedded-Verhalten oder Server-Image-Übernahme. Ältere Worker können übergroße Fehler weiterhin nicht melden. Siehe die [Richtlinie im veröffentlichten Source](https://github.com/durable-workflow/sdk-rust/blob/dd58dd146f1337c3be24ad18fe65e3bb31d78b58/README.md#failure-report-limits) und den [gemeinsamen Leitfaden](../failures-and-recovery.md#rust-failure-report-limits).

## Lokale Aktivitäten {#local-activities}

Rust SDK 3.1.0 ergänzt lokale Inline-Ausführung auf Workern mit
`Worker::local_activities(true)`. Registrieren Sie Callbacks über die normalen
Aktivitätsregistrierungsmethoden und verwenden Sie anschließend die lokalen
Aktivitätsmethoden des Workflow-Kontexts. Wiederholungs- und
Timeout-Konfiguration zeigen das [ausführbare Beispiel](https://github.com/durable-workflow/sdk-rust/blob/3.1.0/examples/local_activities.rs)
und die [LocalActivityOptions-Referenz](https://rust.durable-workflow.com/durable_workflow/struct.LocalActivityOptions.html).

Server zeichnet das terminale Ergebnis für kaltes Replay auf. Nicht
festgeschriebene lokale Effekte können nach Worker-Verlust erneut laufen und
müssen idempotent sein. Asynchrone Callbacks müssen an Tokio abgeben.
Blockierende Arbeit benötigt separate Prozessüberwachung. Lokale Inline-Ausführung
und vorbereitete kooperative lokale Überwachung verwenden getrennte Worker-Profile.

## Worker-Sitzungen {#worker-sessions}

Aktivieren Sie `Worker::worker_sessions(true)` und deklarieren Sie mit
`capabilities(...)` die erfüllten Anforderungen. Routen Sie entfernte Aktivitäten
mit `in_worker_session(WorkerSessionOptions::new(session_id))`. Der
Aktivitätskontext stellt das gemeinsame Handle über `worker_session()` bereit.
Explizite Handles unterstützen nach der Worker-Registrierung `create()`,
`renew()` und `close(reason)`.

Begrenzen Sie die Sitzungsanzahl mit `max_concurrent_worker_sessions(...)` und
Aktivitätsnebenläufigkeit je Sitzung mit `max_concurrent_activities(...)`.
Erneuern Sie ruhende Handles explizit. Aktivitäts-Heartbeats erneuern auch die
Halter-Lease und erhalten dabei die ursprüngliche absolute TTL. Ein asynchroner
Callback, der an Tokio abgibt, wird beim lokal beobachteten Ablauf von Lease
oder TTL verworfen, ohne Anwendungs-Heartbeats zu benötigen.

Sitzungsressourcen liegen im Halterprozess. Ein Ersatz muss sie neu aufbauen.
Unterbrochene externe Effekte benötigen Idempotenz und Versuchssperren.
Festgeschriebene Ergebnisse werden ohne erneuten Callback wiedergegeben.
Geordnetes Herunterfahren schließt gehaltene Sitzungen vor der Deregistrierung.
Lokale Aktivitäten können kein Sitzungsrouting nutzen.

Sitzungsunterstützung beginnt mit Rust SDK 3.2.0. Verwenden Sie Server 2.5.1
oder neuer. Das [ausführbare Beispiel](https://github.com/durable-workflow/sdk-rust/blob/3.2.0/examples/worker_sessions.rs)
verwendet einen prozesslokalen Cache über zwei typisierte Aktivitäten hinweg
und gibt dessen Generation aus. Konfiguration und Lebenszyklusmethoden stehen
unter [WorkerSessionOptions](https://rust.durable-workflow.com/durable_workflow/struct.WorkerSessionOptions.html)
und [WorkerSession](https://rust.durable-workflow.com/durable_workflow/struct.WorkerSession.html).

## Begrenzte Sticky-Ausführung {#bounded-sticky-execution}

Aktivieren Sie `Worker::sticky_cache(StickyCacheOptions::new(capacity))`, um
unveränderliche codierte Historie für nachfolgende Replays zu behalten. Der
Cache ist standardmäßig deaktiviert. Begrenzen Sie Historienumfang und
Lebensdauer mit `max_history_bytes(...)` und `ttl(...)`. Planen Sie zusätzlichen
Arbeitsspeicher für Decodierung und Replay ein.

Der Cache verwendet Workflow-, Lauf- und Build-Identität. Worker-Ersatz, Ablauf,
Verdrängung oder ein ungültiger Historien-Cursor führen zum Rückfall auf die
vollständige dauerhafte Historie. Terminale Workflows und gestoppte Worker
verwerfen ihre Einträge. Workflow-Code muss auch mit leerem Cache korrekt
wiedergegeben werden.

Unterstützung beginnt mit Rust SDK 3.4.0 und dem qualifizierten Server-Basisstand.
Siehe [Konfigurationsreferenz](https://rust.durable-workflow.com/durable_workflow/struct.StickyCacheOptions.html),
[ausführbares Beispiel](https://github.com/durable-workflow/sdk-rust/blob/3.4.0/examples/sticky_execution.rs)
und [Leitfaden für portable Worker-Affinität](./portable-worker-affinity.md).

## Das veröffentlichte Repository-Beispiel vorbereiten {#prepare-the-released-repository-example}

Das [`hello_world`-Beispiel](https://github.com/durable-workflow/sdk-rust/blob/main/examples/hello_world.rs)
registriert einen Rust-Worker, startet einen Workflow, sendet ein Signal,
führt eine Aktivität aus, meldet einen Aktivitäts-Heartbeat und wartet auf das
abgeschlossene Ergebnis. Da Anwendungsclient und Worker in einem Prozess laufen,
verbindet der kontofreie Weg unten mit selbst gehostetem Server. Ein
bereitgestellter Cloud-Namespace ist eine optionale zweite Laufzeitumgebung
mit getrennten rollenspezifischen Zugangsdaten.

Für eine reproduzierbare Quellcodeübung holen Sie genau den im qualifizierten
Tupel vermerkten Crate-Quellcode. Der Wert unten wird aus dieser maschinenlesbaren
Autorität erzeugt. Das Beispielverzeichnis ist absolut, damit beide
Verbindungswege direkt dorthin wechseln können:

<!-- docs-example id="rust.sdk.repository-source" -->
```bash
export DURABLE_WORKFLOW_RUST_VERSION=%%artifact.rustSdkVersion%%
export DURABLE_WORKFLOW_RUST_EXAMPLE_DIR="$PWD/durable-workflow-rust-${DURABLE_WORKFLOW_RUST_VERSION}"
git clone --depth 1 --single-branch --branch "$DURABLE_WORKFLOW_RUST_VERSION" \
  https://github.com/durable-workflow/sdk-rust.git "$DURABLE_WORKFLOW_RUST_EXAMPLE_DIR"
```

## Das kombinierte Beispiel mit selbst gehostetem Server ausführen {#run-the-combined-example-with-self-hosted-server}

Das unveränderte `hello_world`-Beispiel akzeptiert ein Token für einen selbst
gehosteten Durable Workflow Server, dessen Authentifizierungsrichtlinie denselben
Zugangsdaten Workflow-Befehle und Task-Abfragen erlaubt:

<!-- docs-example id="rust.sdk.self-hosted" -->
```bash
cd "$DURABLE_WORKFLOW_RUST_EXAMPLE_DIR"
DURABLE_WORKFLOW_SERVER_URL=http://localhost:8080 \
DURABLE_WORKFLOW_TOKEN=dev-token \
cargo run --example hello_world
```

Das Beispiel verwendet den durch den lokalen Server-Schnellstart angelegten
Namespace `default`. Mit `TASK_QUEUE` überschreiben Sie die Standardwarteschlange
`rust-workers`. Dieser Weg benötigt weder Cloud-Anmeldung noch Cloud-Zugangsdaten.

## Optionaler zweiter Weg: Verbindung zu Durable Workflow Cloud {#optional-secondary-path-connect-to-durable-workflow-cloud}

Für den kürzesten Nachweis mit verwalteter Laufzeitumgebung verwenden Sie den
[Rust-Cloud-Schnellstart](./rust-cloud-quickstart.md). Er führt dieselbe
symmetrische Sample-App-Testumgebung wie PHP und Python aus, wählt aktuelle
stabile Artefakte dynamisch, prüft genaue Worker-Bereitschaft und wartet auf
ein abgeschlossenes Ergebnis.

<ProductPromotion source="docs-v2-rust-sdk">
Bereits bei Cloud angemeldet? Führen Sie die gemeinsame Rust-Testumgebung gegen
Ihren bereitgestellten Namespace mit getrennten rollenspezifischen Laufzeit-Zugangsdaten aus.
</ProductPromotion>

Das kombinierte SDK-Beispiel auf niedrigerer Ebene hilft beim Anpassen eines
bestehenden Rust-Prozesses. Exportieren Sie die von Cloud bei
Namespace-Bereitstellung und Erstellung beider Laufzeit-Zugangsdaten
zurückgegebenen Werte:

Die verwaltete Verbindungsgrenze beschreibt
[Verwaltete Cloud-Laufzeitumgebung](/docs/polyglot/cloud-control-plane).

<!-- docs-example id="rust.sdk.cloud.environment" -->
```bash
export DURABLE_WORKFLOW_RUNTIME_URL='https://your-runtime-url'
export DURABLE_WORKFLOW_RUNTIME_NAMESPACE='orders'
export DURABLE_WORKFLOW_CLIENT_TOKEN='dwr_client_credential'
export DURABLE_WORKFLOW_WORKER_TOKEN='dwr_worker_credential'
```

Ersetzen Sie in `$DURABLE_WORKFLOW_RUST_EXAMPLE_DIR/examples/hello_world.rs`
die bestehende Einrichtung von `server_url`, `token` und `Client::builder(...)`
durch diese Builder-Konfiguration mit getrennten Tokens:

<!-- docs-example id="rust.sdk.cloud.client" -->
```rust
let runtime_url = std::env::var("DURABLE_WORKFLOW_RUNTIME_URL")
    .expect("DURABLE_WORKFLOW_RUNTIME_URL must be set");
let runtime_namespace = std::env::var("DURABLE_WORKFLOW_RUNTIME_NAMESPACE")
    .expect("DURABLE_WORKFLOW_RUNTIME_NAMESPACE must be set");
let client_token = std::env::var("DURABLE_WORKFLOW_CLIENT_TOKEN")
    .expect("DURABLE_WORKFLOW_CLIENT_TOKEN must be set");
let worker_token = std::env::var("DURABLE_WORKFLOW_WORKER_TOKEN")
    .expect("DURABLE_WORKFLOW_WORKER_TOKEN must be set");

let client = Client::builder(runtime_url)
    .namespace(runtime_namespace)
    .control_token(Some(client_token))
    .worker_token(Some(worker_token))
    .build()?;
```

Führen Sie das Beispiel dann normal aus:

<!-- docs-example id="rust.sdk.cloud.run" -->
```bash
cd "$DURABLE_WORKFLOW_RUST_EXAMPLE_DIR"
cargo run --example hello_world
```

Workflow-Start-, Signal-, Beschreibungs- und Ergebnisaufrufe verwenden
`control_token`. `Worker`-Registrierung, Abfragen, Heartbeats und Abschlüsse
verwenden `worker_token`. Beide Rollen nutzen dieselbe von Cloud gelieferte
Laufzeit-URL, denselben Laufzeit-Namespace und dieselbe Task-Warteschlange,
aber keine gemeinsamen Zugangsdaten. Ersetzen Sie keines der Cloud-Tokens durch
`.token(...)`. Diese Methode ist der allgemeine Ein-Token-Rückfall der obigen
selbst gehosteten Konfiguration.

## Mit serverseitig erzwungenen Workflow-Timeouts starten {#start-with-server-enforced-workflow-timeouts}

Das Rust SDK bietet `WorkflowStartOptions` und
`Client::start_workflow_with_options` für Workflow-Fristen, die der Server auch
nach Ende des startenden Prozesses erzwingt. Der Ausführungs-Timeout deckt die
ganze Workflow-Instanz einschließlich Continue-as-new-Läufen ab. Der
Lauf-Timeout gilt für einen Lauf und wird beim nächsten Lauf neu berechnet.

<!-- docs-example id="rust.workflow-start-timeouts" -->
```rust
use durable_workflow::{json, Client, Result, WorkflowStartOptions};

async fn start(client: &Client) -> Result<()> {
    let handle = client.start_workflow_with_options(
        "orders.await-payment",
        "orders",
        "order-42",
        WorkflowStartOptions::new()
            .execution_timeout_seconds(300)
            .run_timeout_seconds(30),
        json!([{"order_id": "order-42"}]),
    ).await?;

    println!("workflow={} run={:?}", handle.workflow_id, handle.run_id);
    Ok(())
}
```

Beide Werte sind Sekunden und müssen positiv sein. Der Lauf-Timeout darf den
Ausführungs-Timeout nicht überschreiten. Die bestehende Komfortmethode
`Client::start_workflow` verwendet `WorkflowStartOptions::default()`:
3600 Sekunden Ausführungs-Timeout und 600 Sekunden Lauf-Timeout. Die
Server-Fristen und Continue-as-new-Semantik beschreibt
[Timeouts](/docs/features/timeouts).

Dies sind Workflow-Richtlinien, keine HTTP- oder Ergebnisabfrage-Timeouts.
Insbesondere beendet `WorkflowResultOptions::timeout` nur das lokale Warten
in `result()`. Es schließt oder bricht den Workflow-Lauf nicht ab und ändert ihn
auch sonst nicht. Der Aufrufer kann die zurückgegebene Identität untersuchen
und erneut warten. Mit `WorkflowStartOptions` konfigurierte Ausführungs- oder
Lauffristen sind dauerhafter Server-Zustand. Bei Ablauf schließt der Server
den Lauf mit dem terminalen Ergebnis `timed_out`.

## Deterministische parallele Gruppen {#deterministic-parallel-groups}

`WorkflowContext::parallel` und der Alias `join` kombinieren Aktivitäten,
Kind-Workflows, Timer, gemischte und verschachtelte Gruppen ohne neuen
Server-Befehl. Konstruktoren von `ParallelOperation` verzögern jedes Blatt,
bis der ganze Baum bekannt ist:

```rust
use durable_workflow::{json, ChildWorkflowOptions, ParallelOperation};
use std::time::Duration;

let results = ctx.parallel(vec![
    ParallelOperation::activity("load-profile", json!(["customer-42"])),
    ParallelOperation::group(vec![
        ParallelOperation::child_workflow(
            "quote-shipping",
            ChildWorkflowOptions::new("shipping-workers"),
            json!(["customer-42"]),
        ),
        ParallelOperation::timer(Duration::from_secs(1)),
    ]),
]).await?;
```

Jedes Blatt trägt die gemeinsame stabile Gruppenidentität und seinen
vollständigen Pfad von außen nach innen. Erfolgreiche Ergebnisse erhalten
verschachtelte Eingabeform und Reihenfolge. `Error::ParallelFailed` erhält
typisierte Blattursache, deterministischen Mitgliedspfad, Gruppenpfad und
abgeschlossene Geschwister. Ausstehende und abgeschlossene Historien werden
ohne erneute Planung wiedergegeben. Exakte Duplikate und späte Abschlüsse
ändern das gewählte positionelle Ergebnis nicht.

## Dauerhafte Auswahl des ersten Abschlusses {#durable-first-completion-selection}

`WorkflowContext::select` und `select_keyed` starten Aktivitäten, Kind-Workflows,
Timer, Signale, Bedingungswarteoperationen und verschachtelte gewöhnliche
Gruppen gemeinsam und setzen beim durch die Laufzeitumgebung aufgezeichneten
Gewinner fort:

```rust
use durable_workflow::{json, ParallelOperation, SelectionKey};
use std::time::Duration;

let selected = ctx.select_keyed(vec![
    ("resolver", ParallelOperation::activity("resolve-request", json!([request_id]))),
    ("input", ParallelOperation::signal("resolution.received")),
    ("deadline", ParallelOperation::timer(Duration::from_secs(2))),
]).await?;

if selected.key == SelectionKey::Name("deadline".to_string()) {
    if let Some(resolver) = selected.handle(&SelectionKey::Name("resolver".to_string())) {
        resolver.cancel().await?;
    }
}
```

`SelectionResult` erhält stabilen Schlüssel/Index, Operationsart und -identität,
typisierten Wert oder Fehler und ein `DurableOperationHandle` je Mitglied.
Ein Verlierer läuft weiter, sofern Workflow-Code nicht später auf
`handle.await_result()` oder `handle.cancel()` wartet. Das Abbruch-Future
liefert den Unit-Typ. Nur festgeschriebene Historie
`SelectionOperationCancelled` belegt den gewonnenen Abbruch. Replay geht über
eine unmarkierte Anfrage hinweg. `await_result()` liefert weiterhin einen
zuerst festgeschriebenen Abschluss. Neustart und Replay verwenden den
gespeicherten Gewinner. Spätere oder doppelte Terminalereignisse ändern ihn nicht.

## Saga-Kompensation {#saga-compensation}

Registrieren Sie Kompensation erst nach Abschluss der zugehörigen
Vorwärtsaktivität und übergeben Sie dann das Vorwärtsergebnis an `Saga::finish`:

```rust
let mut saga = ctx.saga();
let outcome = async {
    let flight = ctx.activity("trip.reserve-flight", json!([])).await?;
    saga.add_compensation("trip.cancel-flight", json!([flight]))?;

    let hotel = ctx.activity("trip.reserve-hotel", json!([])).await?;
    saga.add_compensation("trip.cancel-hotel", json!([hotel]))?;

    ctx.activity("trip.charge", json!([])).await?;
    Ok(json!({"status": "booked"}))
}.await;

saga.finish(outcome).await
```

Ein behandelter Fehler führt den bestehenden Aktivitätsbefehl in umgekehrter
Registrierungsreihenfolge aus, jeweils eine Kompensation. Kompensation stoppt
beim ersten Fehler. `Error::SagaCompensationFailed` erhält beide typisierten
Fehler, den Kompensationsaktivitätstyp und seine Registrierungsreihenfolge über
Neustart und Replay. Terminales `cancel_workflow` setzt Workflow-Code nicht zum
Ausführen von Kompensationen fort.

## Deterministische Seiteneffekte und Versionsmarker {#deterministic-side-effects-and-version-markers}

Das Rust SDK zeichnet kleine nicht deterministische Werte mit
`WorkflowContext::side_effect` auf und leitet deterministische UUIDv4-Werte mit
`WorkflowContext::uuid_v4` ab. Kaltes Replay decodiert den aufgezeichneten Wert,
statt den Callback erneut aufzurufen. Umgeordnete, fehlende, doppelte oder
Codec-inkompatible Marker liefern ein typisiertes `Error::NonDeterministicReplay`.

Verwenden Sie `WorkflowContext::get_version(change_id, min_supported, max_supported)`,
um alte und neue Workflow-Zweige im Rollout Replay-kompatibel zu halten.
Neue Läufe zeichnen `max_supported` auf, bestehende verwenden den dauerhaften
Marker erneut. `patched(change_id)` bietet die boolesche Rollout-Form.
`deprecate_patch(change_id)` erhält den Marker nach Auslaufen des alten Zweigs.
Die gemeinsame dauerhafte Semantik beschreiben [Seiteneffekte](/docs/features/side-effects/)
und [Versionierung](/docs/features/versioning/).

## Rust-Regeln für Determinismus {#rust-determinism-rules}

Ein Replay muss für aufgezeichnete Eingabe und Historie dieselben dauerhaften Befehle in derselben Reihenfolge erzeugen. Gewöhnliche Rust-Sammlungen, Uhren und Nebenläufigkeitsprimitive erhalten diesen Vertrag nicht automatisch:

| Muster im Workflow-Code | Dauerhafter Ersatz |
| --- | --- |
| Beim Durchlaufen einer `HashMap` planen | Schlüssel vorher sortieren oder eine `BTreeMap` verwenden. |
| Systemzeit, `thread_rng` oder neue UUID lesen | Snapshot mit `ctx.side_effect(...)` aufzeichnen oder eine Activity verwenden. |
| `tokio::time::sleep` oder `std::thread::sleep` | `ctx.sleep(...)` oder `ctx.start_timer(...)`. |
| `tokio::select!` oder gewöhnliche Futures gegeneinander starten | `ctx.select(...)` oder `ctx.select_keyed(...)`. |
| Nicht verfolgte parallele dauerhafte Aufrufe | `ctx.parallel(...)` mit stabiler Eingabereihenfolge. |
| Netzwerk, Dateisystem oder veränderliche externe E/A | Eine registrierte Activity. |
| Bestehende Befehlsreihenfolge beim Deployment ändern | Stabilen `ctx.get_version(...)`-Zweig anhand aufgezeichneter Historie testen. |

Externe Activity-Effekte müssen weiterhin idempotent sein. Determinismus macht eine wiederholte Zahlung oder Dateiänderung nicht sicher. Siehe [Idempotenz und Determinismus](../constraints/idempotent-vs-deterministic.md).

## Offline-Tests und Replay {#offline-testing-and-replay}

Diese APIs benötigen Rust SDK **4.5.0 oder neuer**. Prüfen Sie `Cargo.lock`: Die gesonderte Installationskombination oben kann eine ältere Crate ohne diese APIs wählen. Der [Prüfbericht zur normalen Installation von 4.5.0](https://github.com/durable-workflow/sdk-rust/issues/105#issuecomment-6362112580) bestätigt zwölf Kontrollen ohne Server, dieses kompilierte Beispiel und Export/Replay eines echten Server 2.11.0. Er wählt keine neue Server-/SDK-Kombination aus.

### Unit-Tests für Activities und Workflows {#rust-activity-workflow-tests}

`testing::WorkflowEnvironment` führt registrierte Workflows und Activities im aktuellen Prozess aus. Nutzen Sie `from_worker(worker)` für Anwendungsregistrierungen oder registrieren Sie Callbacks direkt. `worker_mut()` stellt die normalen typisierten Registrierungs-APIs bereit. Mocks sind explizit: Reale Activity-Callbacks führen ihren eigenen Code aus; ersetzen Sie externe Effekte daher bewusst.

Verwenden Sie für das geprüfte Rezept `durable-workflow = "=4.5.0"`, Tokio mit `macros`, `rt-multi-thread` und `time` sowie `serde_json = "1"` für den Export-Helfer unten. Speichern Sie das veröffentlichte Beispiel als `examples/workflow_testing.rs` und starten Sie `cargo run --example workflow_testing`:

```rust
//! Run with `cargo run --example workflow_testing`; no Server is required.
use durable_workflow::{
    json,
    testing::{WorkflowEnvironment, WorkflowHistory},
    Result,
};

#[tokio::main]
async fn main() -> Result<()> {
    let mut env = WorkflowEnvironment::new()?;
    env.register_activity("greet", |_, args| async move {
        Ok(json!(format!(
            "Hello, {}!",
            args[0].as_str().unwrap_or("friend")
        )))
    });
    env.register_workflow("hello", |ctx, args| async move {
        ctx.activity("greet", args).await
    });

    // An activity unit test executes the real callback and argument adapters.
    assert_eq!(
        env.run_activity("greet", "Ada").await?,
        json!("Hello, Ada!")
    );
    // A workflow unit test may replace activity callbacks explicitly.
    env.mock_activity("greet", |_, args| async move {
        Ok(json!({"greeting_for":args[0]}))
    });
    assert_eq!(
        env.run_workflow("hello", "Ada").await?,
        json!({"greeting_for":"Ada"})
    );

    // Replay executes the same registered workflow without running activities.
    // In a deployment test, read the JSON produced by dw workflow:history-export
    // or Client::export_workflow_history instead of this captured test history.
    let history = WorkflowHistory::from_export(env.last_history().unwrap().export())?;
    assert!(env.replay(&history)?.completed);
    println!("activity, workflow and offline replay passed");
    Ok(())
}
```

Direktes `run_activity` führt einen Versuch aus. In `run_workflow` gilt die aufgezeichnete Retry-Richtlinie, bevor ein endgültiger Fehler den Workflow erreicht. Reale oder simulierte Fehler entfernter/lokaler Activities werden zu typisiertem `Error::ActivityFailed` mit Ausnahmetyp, Versuchsnummer und Nicht-wiederholbar-Markierung. Ein nicht abgefangener Workflow-Fehler behält seine ursprüngliche Rust-Variante. Heartbeats werden lokal erfasst. Nutzen Sie `*_avro_value`-Varianten, wenn JSON den ursprünglichen Avro-Wert nicht bewahrt.

### Einen exportierten Lauf wiedergeben {#rust-replay-export}

Registrieren Sie den Kandidaten-Workflow und laden Sie ein vollständiges JSON-Bundle aus `dw workflow:history-export` oder `Client::export_workflow_history(workflow_id, run_id).await?`. Ergänzen Sie das obige Beispiel um diesen Helfer; er verwendet dessen Imports und erwartet einen abgeschlossenen Testlauf:

```rust
fn replay(env: WorkflowEnvironment) -> std::result::Result<(), Box<dyn std::error::Error>> {
let export = serde_json::from_slice(&std::fs::read("workflow-history.json")?)?;
let history = WorkflowHistory::from_export(export)?;
let report = env.replay(&history)?;
assert!(report.completed); // A running snapshot can remain durably pending.
Ok(())
}
```

Für rohe Historie kombinieren Sie **alle Seiten** und verwenden `WorkflowHistory::from_history("hello", original_input, response)`. Geben Sie die ursprüngliche Task-Queue an, falls sie fehlt. Bewahren Sie Eingabe und aufgezeichnete Ergebnisse: beschnittene/geschwärzte Payloads, ungelöste externe Referenzen und verbleibende Seitentoken werden abgewiesen. Der SDK-Export-Helfer löst Payload-Referenzen beim Herunterladen auf. Replay selbst kontaktiert keinen Server und führt keine Activity-Callbacks aus.

Replay nutzt die Worker-Pfade für Dekodierung, Side Effects, Versionsmarker und aufgezeichnete Select-Auflösungen. Geänderte oder umgeordnete Befehle liefern `Error::NonDeterministicReplay(ReplayFailure)` mit `sequence`, `expected` und `actual`; die installierte Kontrolle mit echtem Export findet eine geänderte Activity bei Sequenz 3. Neue Befehle jenseits des Snapshots schlagen ebenfalls fehl. Ein offener Snapshot kann statt Abschluss einen dauerhaft wartenden Präfix melden. Prüfen Sie das erwartete Ergebnis und testen Sie neue Zweige mit frischer Ausführung im Prozess sowie Integrationstests. Siehe die [veröffentlichten Replay-Kontrollen](https://github.com/durable-workflow/sdk-rust/blob/4.5.0/tests/workflow_testing.rs).

### Ausführungsgrenzen {#rust-test-execution-limits}

Timer- und Retry-Wartezeiten werden übersprungen. Parallele Callbacks laufen in Befehlsreihenfolge; diese Umgebung prüft keine Scheduling-Rennen oder Leistung. Sie simuliert keine Queues, Leases oder Deployments. Callbacks müssen Kontrolle abgeben. `max_steps(n)` begrenzt dauerhafte Schritte, Befehle und Versuche (Standard 10.000); `tokio::time::timeout` kann asynchrone Callback-Zeit begrenzen.

Activity-Timeout-Simulation, **neue Select-Rennen**, Signale, Kinder, Services, Sessions, Continue-as-new und Abbruch brauchen Integrationstests. Nicht unterstützte Befehle liefern `Error::Testing`. Ein aufgezeichneter Select-Gewinner kann wiedergegeben werden, obwohl kein neues Rennen simuliert wird. Behalten Sie Tests mit echtem Runtime-Betrieb für diese Grenzen bei. Siehe die [Test-API](https://rust.durable-workflow.com/durable_workflow/testing/index.html) und den [veröffentlichten Ausführungsvertrag](https://github.com/durable-workflow/sdk-rust/blob/4.5.0/README.md#testing-without-a-server).

## Kompatibilität am Einstieg und Wiederherstellung {#entry-compatibility-and-recovery}

**Veröffentlichte Unterstützung.** Rust SDK 3.5.6 hat den nachfolgenden Einstiegsschutz eingeführt, ergänzt durch Routing und Wiederherstellung in Server 2.9.9. Dies sind die Mindestversionen für diese Funktionen. Installieren Sie aktuelle stabile Versionen, um Sicherheitskorrekturen zu erhalten.

`Worker::register_typed_workflow` und die typisierten zustandsbehafteten Adapter deserialisieren aufgezeichnete Eingaben vor dem Aufruf des Anwendungshandlers oder seiner Zustandsfabrik. Eine inkompatible Eingabestruktur meldet den Aufgabenfehlertyp `WorkflowEntryArgumentsMismatch` und den Grund `workflow_entry_arguments_mismatch`, ohne `fail_workflow` zu senden. Der lokale SDK-Fehler für Workflow-Eingaben lautet `Error::HandlerType`; er enthält den Workflow und den erwarteten Rust-Typ statt des aufgezeichneten Werts. Rohe Workflow-Handler erhalten keine neuen Rust-Signaturprüfungen. Ein Fehler aus einem erfolgreich betretenen Anwendungshandler bleibt ein gewöhnlicher Workflow-Fehler, auch wenn sein Text der Einstiegsdiagnose ähnelt.

Der verwaltete Worker kündigt `workflow_entry_arguments_validation` automatisch an. Ein qualifizierter Server behält die fehlgeschlagene Aufgabe als für Replay blockiert bei und lässt den ursprünglichen Lauf nichtterminal. Ältere Laufzeiten können die Aufgabe stattdessen wiederholen; das SDK allein belegt daher nicht den vollständigen Wiederherstellungsvertrag.

Prüfen Sie das Original mit `Client::describe_workflow_run(workflow_id, run_id)` und den Aufgabengrund über den Debug-Endpunkt des ausgewählten Laufs. Stellen Sie kompatible Eingabedekodierung und kompatiblen Code wieder her, bevor Sie die laufbezogene HTTP-Reparaturroute aus dem [Wiederherstellungsverfahren](../failures-and-recovery.md#service-entry-recovery) verwenden. Dieses Crate hat keine Komfortmethode `repair_workflow`. Bewahren Sie ursprüngliche Eingabe, Historie, Namespace, Warteschlange, Build und Fristen. Versionieren Sie dauerhafte Befehlsänderungen innerhalb eines kompatiblen Handlers und qualifizieren Sie kaltes Replay. Siehe [Routing nach Definition](./worker-compatibility-routing.md#definition-fingerprint-evolution).

## Abbrechen, terminieren und terminale Ergebnisse behandeln {#cancel-terminate-and-handle-terminal-outcomes}

Im Service-Modus schließen `cancel_workflow` und `terminate_workflow` den Lauf
sofort. Sie zeichnen unterschiedliche terminale Ergebnisse auf, fordern
Workflow-Code aber nicht zur Bereinigung auf. Für begrenzte Workflow-Bereinigung
verwenden Sie `request_cancellation()` mit kooperierenden Workern.
[Kooperativer Abbruch](/docs/polyglot/cancellation) erklärt Operationsrichtlinien,
Überwachung und Wiederherstellung.

```rust
use durable_workflow::{Client, WorkflowCommandOptions};

# async fn cancel(client: &Client) -> durable_workflow::Result<()> {
client.cancel_workflow(
    "order-42",
    WorkflowCommandOptions::new()
        .reason("customer withdrew the order")
        .request_id("cancel-order-42"),
).await?;
# Ok(())
# }
```

Instanzbezogene Aufrufe von `cancel_workflow` und `terminate_workflow` lösen
den aktuellen Lauf auf Server auf. Zur Absicherung eines ausgewählten Laufs
verwenden Sie `cancel_workflow_run` oder `terminate_workflow_run` oder die
Handle-Methoden `cancel_selected_run` und `terminate_selected_run`. Ist der
gewählte Lauf veraltet, zeigt `Error::WorkflowCommandRejected` den stabilen
Grund `historical_run_command_rejected` mit Workflow-ID, Lauf-ID, Zielumfang,
HTTP-Status und Antwortinhalt.

Erfolgreiches `WorkflowHandle::result` liefert weiter den decodierten JSON-Wert.
Behandeln Sie für alle anderen Ergebnisse die typisierten Terminalvarianten.
Verzweigen Sie anhand stabiler Grund- und Kategoriefelder statt Anzeigetext:

<!-- docs-example id="rust.typed-workflow-timeouts" -->
```rust
use durable_workflow::{Error, WorkflowHandle, WorkflowResultOptions};

# async fn wait(handle: WorkflowHandle) -> durable_workflow::Result<()> {
match handle.result(WorkflowResultOptions::default()).await {
    Ok(value) => println!("completed: {value}"),
    Err(Error::WorkflowCancelled(outcome)) => {
        println!("cancelled {:?}: {}", outcome.run_id, outcome.reason);
    }
    Err(Error::WorkflowTerminated(outcome)) => {
        println!("terminated: {}", outcome.reason);
    }
    Err(Error::WorkflowFailed(outcome)) => {
        println!("failure {:?}: {:?}", outcome.failure_id, outcome.exception_class);
    }
    Err(Error::WorkflowTimedOut(outcome)) => match (
        outcome.reason.as_str(),
        outcome.failure_category.as_deref(),
    ) {
        ("result_wait_timeout", Some("client_timeout")) => {
            println!(
                "caller deadline for {} / {:?}; the run may still be open",
                outcome.workflow_id, outcome.run_id,
            );
        }
        ("execution_timeout" | "run_timeout", category) => {
            println!(
                "server timeout for {} / {:?}: reason={} category={:?}",
                outcome.workflow_id, outcome.run_id, outcome.reason, category,
            );
        }
        (reason, category) => {
            println!("other typed timeout: reason={reason} category={category:?}");
        }
    }
    Err(error) => return Err(error),
}
# Ok(())
# }
```

Jedes terminale Ergebnis enthält Workflow- und Laufidentität. Es erhält auch
öffentlichen Grund, Fehlerkategorie und -identität, Ausnahmetyp und -klasse,
Nichtwiederholbarkeitszustand, Nachricht und Ausnahmenutzlast, sofern der Server
sie liefert. Eine lokale Wartefrist hat `result_wait_timeout` und Kategorie
`client_timeout`. Ein Server-Timeout ist ein terminaler Lauf `timed_out` mit
dem stabilen Grund `execution_timeout` oder `run_timeout`.

Handles beider Startmethoden behalten die gewählte `run_id`.
`WorkflowHandle::result` beschreibt diese laufspezifische Route. Die
Wiederverwendung derselben Workflow-ID für einen neueren Lauf kann das Warten
also nicht still auf dessen Ergebnis umstellen. Erhalten Sie
`outcome.workflow_id` und `outcome.run_id` in Logs, Metriken und
Wiederholungseinträgen. Verwenden Sie instanzbezogene Abfragen nur, wenn
Sie bewusst dem aktuellen Lauf folgen.

## Workflow-Updates {#workflow-updates}

Rust unterstützt dauerhafte Updates in den Rollen Anwendungsclient,
ausgewähltes Handle und Worker-Implementierung. Verwenden Sie
`Client::update_workflow` oder `WorkflowHandle::update` für JSON-kompatible
Werte und die passenden Methoden `update_workflow_avro_value` oder
`update_avro_value` für explizit typisierte Avro-Werte.

Worker registrieren benannte Handler mit `Worker::register_update`.
`register_update_avro_value` dient Handlern, die direkt Avro-Werte empfangen und
liefern. Ein Update ist eine dauerhafte Workflow-Änderung mit Ergebnis,
getrennt von Fire-and-forget-Signalen und schreibgeschützten Abfragen mit Replay.

## Nutzlast-Envelope {#payload-envelope}

Workflow-Eingaben, Signale, Aktivitäten, Abfragen und Ergebnisse verwenden den
veröffentlichten `PayloadEnvelope`-Vertrag: `codec` plus codierter `blob`.
Der Standardpfad `avro` verwendet die deklarierte Abhängigkeit `apache-avro`
und das feste versionierte Value-Schema der Plattform. Implementieren Sie den
Blob nicht selbst und ersetzen Sie die Envelope nicht durch einen
implementierungsspezifischen Datensatz.

<!-- docs-example id="rust.avro-payload-envelope" -->
```rust
use durable_workflow::{decode_payload, json, PayloadEnvelope, Result, Value};

fn round_trip() -> Result<()> {
    let envelope = PayloadEnvelope::avro(&json!({"order_id": "order-42"}))?;
    assert_eq!(envelope.codec, "avro");

    let decoded: Value = decode_payload(&envelope)?;
    assert_eq!(decoded["order_id"], "order-42");
    Ok(())
}
```

`start_workflow` und `start_workflow_with_options` wenden die Envelope automatisch
auf ihre serialisierbare Eingabe an. Verwenden Sie die öffentlichen Hilfsmethoden
nur, wenn ein Programm direkt eine Envelope austauschen muss.

## Aktivitäts-Heartbeats {#activity-heartbeats}

Für entfernte Aktivitäten gibt `ActivityContext::heartbeat(...).await` einen `Result<ActivityHeartbeatResponse>` zurück. Geben Sie Fehler weiter und prüfen Sie bei einer erfolgreichen Antwort `should_stop()`. Fehler direkter Anfragen umfassen `Error::Transport` und typisierte HTTP-Ablehnungen als `Error::ActivityTaskRejected`. Eine kooperativ überwachte Beanspruchung kann stattdessen bei fehlgeschlagenen Heartbeat- oder Besitzprüfungen `Error::ActivityExecutionAbandoned` zurückgeben. Stoppen Sie externe Arbeit nach Verlust der Befugnis. Verlassen Sie sich nicht darauf, dass ein Callback immer den Bereinigungscode der Anwendung erreicht.

Das erste Heartbeat-Zeitfenster beginnt bei Beanspruchung durch die Laufzeit, vor der Aufgabenauslieferung. Ein aufgezeichneter Heartbeat verwendet seinen Laufzeitzeitpunkt, nicht den Empfangszeitpunkt beim Aufrufer. Wählen Sie einen Takt deutlich innerhalb des konfigurierten Zeitlimits, begrenzen Sie jeden Arbeits- oder E/A-Schritt und lassen Sie Spielraum für Ausführungspausen, Anfragelatenz und mögliche Transportwiederholungen. Beachten Sie die [Taktempfehlungen](../features/heartbeats.md#heartbeat-cadence-and-receipts). Ein automatischer Fortschritts-Heartbeat-Takt oder Bündelungstakt wird nicht zugesagt.

Geben Sie bei Abbruch prozesslokale Ressourcen frei, soweit die Ausführung dies noch zulässt, und kehren Sie zeitnah zurück. Dauerhafter Zustand lehnt späten Abschluss ab und verhindert, dass ein abgebrochener oder terminierter Lauf erfolgreich wird. Verwaltete Worker fragen nach dieser endgültigen Ablehnung und nach Neustart weiter ab. Ein erfolgreicher Heartbeat ist weder ein Commit externer Effekte noch ein fortsetzbarer Prüfpunkt für einen Ersatzversuch.

Server-Images, Authentifizierung und Produktionstopologie beschreibt der
[Server-Einrichtungsleitfaden](/docs/polyglot/server).
