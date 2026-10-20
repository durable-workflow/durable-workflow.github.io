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

## Kompatibilität am Einstieg und Wiederherstellung {#entry-compatibility-and-recovery}

**Vorbereitung einer noch nicht veröffentlichten Version.** Der Einstiegsschutz im Rust SDK 3.5.6 und die Routing-/Wiederherstellungsunterstützung in Server 2.9.9 sind im Quellcode zusammengeführt. Veröffentlichung und Prüfung der installierten Artefakte stehen noch aus.

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
