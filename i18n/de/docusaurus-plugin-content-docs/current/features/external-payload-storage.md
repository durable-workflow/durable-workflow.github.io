---
sidebar_position: 21
tags:
  - payloads
  - storage
  - history
keywords:
  - externer Payload-Speicher
  - große Payloads
  - Payload-Auslagerung
  - S3-Speicher
  - GCS-Speicher
  - Azure-Blob-Speicher
---

# Externer Payload-Speicher {#external-payload-storage}

Externer Payload-Speicher lagert große Workflow-Payloads in einen austauschbaren
Objektspeicher (S3, GCS, Azure Blob oder ein lokales Dateisystem) aus. Er ersetzt
die direkt in der Workflow-Historie gespeicherten Bytes durch einen kleinen,
überprüfbaren Referenzumschlag. Verwenden Sie ihn, wenn Argumente oder
Ergebnisse von Aktivitäten oder untergeordneten Workflows, Signale oder
Update-Payloads zu groß für die Datenbankzeile der Workflow-Historie sind.

Die Laufzeit speichert Payloads weiterhin direkt, solange die kodierte Größe
unter dem Namespace-Schwellenwert bleibt. Nur Payloads ab diesem Schwellenwert
werden an den konfigurierten Treiber geschrieben und als Umschlag
`durable-workflow.v2.external-payload-reference.v1` in der Historie
aufgezeichnet. Replay und Historienexport brechen sicher mit einem Fehler ab,
wenn eine Referenz fehlt, verändert wurde oder außerhalb des konfigurierten
Präfixes liegt. Das System ersetzt einen fehlenden Blob niemals still durch
einen leeren Wert.

## Wann Sie ihn verwenden sollten {#when-to-use-it}

Bevorzugen Sie externen Payload-Speicher, wenn die Anwendung berechtigterweise
mehr als wenige hundert Kilobyte durch einen Workflow transportieren muss:

- Dokument- und Medienverarbeitung, die PDFs, Bilder oder Audioblobs zwischen Aktivitäten weitergibt.
- Berichte, Exporte oder Archive mit einem großen serialisierten Endartefakt.
- Nachrichtenstrom-Payloads externer Systeme ohne stabile Objekt-URL, auf die der Workflow direkt verweisen kann.
- Jeder Payload, der sonst die [strukturelle Grenze `payload_size_bytes`](../constraints/structural-limits.md#payload-size) auslösen würde.

Kleine Payloads wie Steuerungsebenenfelder, IDs, Statuskennzeichen und übliche
JSON-Daten bleiben direkt gespeichert und verursachen keinen zusätzlichen
Aufwand. Da die Richtlinie vom Schwellenwert abhängt, verschiebt das Aktivieren
externen Speichers für einen Namespace keine kleinen Payloads.

## Wie die Auslagerung funktioniert {#how-offload-works}

Jeder Namespace hat eine unabhängige Richtlinie für externen Payload-Speicher.
Wenn die Laufzeit einen Payload für die dauerhafte Speicherung kodiert,
vergleicht sie die kodierte Byte-Länge mit `threshold_bytes`:

- Die kodierte Größe liegt unter der Schwelle. Der Payload bleibt wie bisher direkt gespeichert. In der Historie ändert sich nichts.
- Die kodierte Größe erreicht oder überschreitet die Schwelle. Die Laufzeit übergibt die kodierten Bytes an den konfigurierten Treiber, erhält eine treibereigene URI und zeichnet eine externe Payload-Referenz in der Historie auf. Die Referenz enthält URI, SHA-256-Hash, genaue Byte-Länge, Payload-Codec und optional einen Hinweis `expires_at`.

Beim Replay laden Worker die referenzierten Bytes über denselben Treiber,
prüfen die erwartete Größe und den SHA-256-Hash und übergeben den Payload erst
danach an den Decoder. Eine abweichende Größe oder ein abweichender Hash löst
`ExternalPayloadIntegrityException` (PHP) oder `ExternalPayloadIntegrityError`
(Python) aus und erscheint als Replay-Fehler, niemals als stiller leerer Payload.

Der Referenzumschlag ist ein stabiles Übertragungsformat. Es ist identisch,
unabhängig davon, ob ein PHP-Workflow, Python-SDK-Worker oder direkter
HTTP-API-Aufrufer der Erzeuger ist. Den vollständigen Feldvertrag beschreibt
[Umschlag für externe Payload-Referenzen](../polyglot/server-api-reference.md#external-payload-reference-envelope).

## Vertrauensgrenze beim Dekodieren {#decode-trust-boundary}

Payload-Speicherung und Payload-Dekodierung sind getrennte Vertrauensgrenzen.
Ein Objektspeicher kann kodierte Bytes oder Referenzen enthalten. Ein
Codec-Server, eigener Decoder, Worker-Prozess oder Historienexport-Werkzeug,
der diese Bytes dekodiert, kann dagegen Anwendungs-Payloads im Klartext sehen.

Behandeln Sie jeden Codec-Server als kundenseitig verwaltete Vertrauensgrenze:
Legen Sie seinen Ausführungsort, erreichbare Netzwerke, zugängliche Schlüssel,
Auditprotokolle und die Schwärzung dekodierter Vorschauen vor der Anzeige in
Betreiberoberflächen fest. Durable Workflow zeichnet Codec-Namen,
Referenz-URIs, Hashes, Größen, Schema-Fingerprints und begrenzte Vorschauen auf.
Diese Fakten sind jedoch keine Ende-zu-Ende-Verschlüsselung.

## Treiberauswahl {#driver-choices}

| Treiber | URI-Schema | Typischer Einsatz |
| --- | --- | --- |
| `local` | `file://` | Lokale Entwicklung, CI und Einzelknotenbereitstellungen mit gemeinsamem Dateisystem für Server und Worker. Nicht geeignet, wenn Worker auf anderen Hosts als der Server laufen. |
| `s3` | `s3://` | Amazon S3 und S3-kompatible Objektspeicher wie MinIO oder Cloudflare R2 über einen serverseitigen Dateisystem-Datenträger. |
| `gcs` | `gs://` | Google Cloud Storage über einen serverseitigen Dateisystem-Datenträger. |
| `azure` | `azure://` | Azure Blob Storage über einen serverseitigen Dateisystem-Datenträger. |

Objektspeichertreiber konfigurieren die tatsächlichen Bucket-/Container-Zugangsdaten
über einen benannten serverseitigen Dateisystem-Datenträger. Geheimnisse liegen
dadurch in der Serverkonfiguration statt im Namespace-Richtliniendatensatz.

## Einen Namespace konfigurieren {#configuring-a-namespace}

Konfigurieren Sie die Richtlinie mit der
[CLI](../polyglot/cli-reference.md#namespace-and-search-attribute-commands)
oder der [Server-HTTP-API](../polyglot/server-api-reference.md#namespace-and-storage).
Beide schreiben denselben Umschlag `external_payload_storage` in den
Namespace-Datensatz.

### Mit der CLI {#with-the-cli}

```bash
# Production namespace using Amazon S3 through the 'external-payload-objects' disk.
dw namespace:set-storage-driver billing s3 \
  --disk=external-payload-objects \
  --bucket=dw-payloads \
  --prefix=billing/ \
  --threshold-bytes=2097152

# Development namespace using the local filesystem.
dw namespace:set-storage-driver dev local \
  --uri=file:///var/lib/durable-workflow/payloads

# Disable offload while keeping the policy record (all payloads stay inline).
dw namespace:set-storage-driver billing s3 \
  --disk=external-payload-objects \
  --bucket=dw-payloads \
  --disable
```

### Mit der Server-API {#with-the-server-api}

```bash
curl -sS -X PUT "$DURABLE_WORKFLOW_SERVER_URL/api/namespaces/billing/external-storage" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "driver": "s3",
    "threshold_bytes": 2097152,
    "config": {
      "disk": "external-payload-objects",
      "bucket": "dw-payloads",
      "prefix": "billing/"
    }
  }'
```

Die Namespace-Beschreibung aus `GET /api/namespaces/{name}` oder
`dw namespace:describe` enthält den aufgelösten Umschlag
`external_payload_storage`. Betreiber und Automatisierung können die aktive
Richtlinie dadurch ohne erneuten Schreibzugriff prüfen.

## Die Richtlinie überprüfen {#verifying-the-policy}

Beweisen Sie mit der Hin-und-zurück-Diagnose vor Freigabe für Workflow-Verkehr,
dass die konfigurierte Richtlinie mit den Namespace-Zugangsdaten tatsächlich
Bytes schreiben und lesen kann:

```bash
dw storage:test --namespace=billing --large-bytes=2097152 --json
```

Die Diagnose schreibt einen kleinen direkt gespeicherten Payload und einen
Payload über der Schwelle, lädt beide zurück, prüft Größe und SHA-256 und
liefert maschinenlesbare Ergebnisobjekte `small_payload` und `large_payload`.
Ein erfolgreiches Groß-Payload-Ergebnis beweist, dass der Treiber durchgängig
einen gültigen Umschlag `durable-workflow.v2.external-payload-reference.v1`
erzeugen kann. Behandeln Sie eine fehlgeschlagene Diagnose als Problem der
Speicherrichtlinie. Geben Sie keinen Workflow-Verkehr durch einen Namespace
frei, dessen Richtlinie diese Prüfung nicht besteht.

## Einen Schwellenwert wählen {#picking-a-threshold}

Standardmäßig bleiben direkt gespeicherte Payloads unverändert, solange sie
`threshold_bytes` nicht erreichen. Sinnvolle Ausgangspunkte:

- Richten Sie die Schwelle daran aus, wann direkt gespeicherte Payloads den Betrieb belasten, üblicherweise zwischen 256 KiB und 2 MiB kodierter Bytes.
- Lassen Sie ausreichend Spielraum unter der strukturellen Namespace-Grenze [`payload_size_bytes`](../constraints/structural-limits.md#payload-size), damit der Referenzumschlag geprüft wird und nicht die Bytes selbst.
- Setzen Sie einen einzigen Schwellenwert pro Namespace. Wählen Sie ihn anhand der Aktivität oder des Workflows mit dem höchsten Byte-Aufkommen pro Lauf, statt ihn auf den mittleren Payload abzustimmen.

Eine sehr niedrige Schwelle bringt keinen Vorteil: Kleine Payloads lassen sich
über die Datenbank schneller schreiben und zurücklesen als über externen
Speicher. Auch der Referenzumschlag selbst verbraucht etwas Historienplatz.

## Replay, Aufbewahrung und Bereinigung {#replay-retention-and-cleanup}

- **Replay-Integrität.** Jeder Abruf prüft das gespeicherte Objekt gegen `size_bytes` und `sha256` der Referenz. Ein veränderter oder fehlender Blob löst eine Integritätsausnahme aus, statt still einen anderen Wert einzusetzen.
- **Cache für geprüfte Abrufe.** Worker cachen geprüfte Bytes anhand von `(uri, sha256, size, codec)` mit begrenzter Eintragszahl und Byte-Obergrenze. Wiederholtes Lesen derselben Laufhistorie vermeidet erneutes Laden desselben Objekts, ohne die Integritätsprüfung beim ersten Laden abzuschwächen.
- **Aufbewahrung.** Entfernt der Aufbewahrungslauf des Servers einen Workflow-Lauf, löscht er auch die von dessen Historie referenzierten externen Payload-Objekte. Solange die Aufbewahrungsbereinigung läuft, sammeln sich keine verwaisten Objekte an.
- **Historienexport.** Exportierte Historie erhält den Referenzumschlag. Nachgelagerte Verbraucher, die die Bytes benötigen, sollten sie über denselben Treiber laden und vor dem Dekodieren gegen den Umschlag prüfen. Das Exportformat bettet externe Bytes nicht direkt ein.

## Aus Code verwenden {#using-it-from-code}

Die meisten Anwendungen rufen die Speicher-API nie direkt auf: Die Laufzeit
lagert anhand der Namespace-Richtlinie transparent aus, und das SDK dekodiert
Referenzen beim Replay. Anwendungen, die Umschläge außerhalb der Laufzeit
erzeugen oder verarbeiten müssen, etwa ein sprachneutraler Brückenhandler
oder ein Test mit künstlichem Groß-Payload, verwenden die SDK-Helfer.

- **PHP (Workflow-Paket).** Der Helfer `Workflow\V2\Support\ExternalPayloadStorage` speichert und lädt Bytes über jeden Treiber, der `Workflow\V2\Contracts\ExternalPayloadStorageDriver` implementiert. `LocalFilesystemExternalPayloadStorage` verarbeitet `file://`-URIs. Der eigenständige Server enthält einen Dateisystem-Datenträgertreiber, der die Richtlinientreiber `s3`, `gcs` und `azure` über einen benannten Laravel-Datenträger umsetzt.
- **Python-SDK.** Siehe [Externer Payload-Speicher](../polyglot/python.md#external-payload-storage) für `ExternalPayloadReference`, `ExternalPayloadCache`, `store_external_payload()`, `fetch_external_payload()` sowie die Adapter `LocalFilesystemExternalStorage`, `S3ExternalStorage`, `GCSExternalStorage` und `AzureBlobExternalStorage`. Cloud-SDK-Clients bleiben Verantwortung der Anwendung. Das SDK fügt boto3, google-cloud-storage oder azure-storage-blob nicht als Laufzeitabhängigkeiten hinzu.
- **Direktes HTTP.** HTTP-Aufrufer, die Payloads manuell kodieren, können Bytes über den Treiber speichern und dann den Referenzumschlag als Payload-Feld der Anfrage übergeben. Der Worker-Protokoll-Payload-Umschlag (`{codec, blob}`) enthält weiterhin Referenzen für Aktivitätsargumente, Ergebnisse, Signal-Payloads und Update-Payloads.

## Siehe auch {#see-also}

- [Daten übergeben](../defining-workflows/passing-data.md) für den Standardvertrag direkt gespeicherter Payloads.
- [Strukturelle Grenzen: Payload-Größe](../constraints/structural-limits.md#payload-size) für die von der Engine durchgesetzte Obergrenze, unter der Sie mit externem Speicher arbeiten können.
- [Server-API-Referenz: Namespace und Speicher](../polyglot/server-api-reference.md#namespace-and-storage) für den vollständigen HTTP-Vertrag einschließlich der Felder des Referenzumschlags.
- [CLI-Referenz: Namespace- und Suchattributbefehle](../polyglot/cli-reference.md#namespace-and-search-attribute-commands) zur Verwendung von `dw namespace:set-storage-driver` und `dw storage:test`.
- [Python-SDK: Externer Payload-Speicher](../polyglot/python.md#external-payload-storage) für Python-Treiber, Helfer und Hinweise zum Replay-Cache.
