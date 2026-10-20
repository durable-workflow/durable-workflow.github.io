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

# Externer Nutzlastspeicher {#external-payload-storage}

Im eingebetteten Laravel ersetzt externer Speicher große codierte Werte im Workflow-Verlauf durch geprüfte Referenzen auf den anwendungseigenen Speicher. Diese Seite beschreibt diese Speichergrenze. Clients und Worker im Dienstmodus verwenden den [Runtime-Transport des Servers](../polyglot/server-api-reference.md#runtime-external-payload-transport): Der Server verwahrt die Zugangsdaten des Anbieters, und SDKs tauschen opake Referenz-IDs über authentifiziertes HTTP aus. Eine Anbieter-URI ist kein gültiger Nutzlast-Envelope für Server.

## Einsatzfälle {#when-to-use-it}

Verwenden Sie externen Speicher für große Dokumente, Medien, Berichte sowie Aktivitätsargumente oder -ergebnisse, die tatsächlich durch die dauerhafte Ausführung laufen müssen. Kleine Werte bleiben inline und benötigen keinen Objektspeicher-Schreibzugriff. Die Auslagerung hebt weder Nutzlast- oder Verlaufslimits auf noch die Notwendigkeit, die Anzahl der von einem Lauf aufbewahrten Objekte zu begrenzen.

## Ablauf der Auslagerung {#how-offload-works}

Die Namespace-Richtlinie der Anwendung stellt einen Speichertreiber und einen positiven `threshold_bytes` bereit. Codierte Nutzlasten, deren Größe **über** dem Schwellenwert liegt, werden über den Treiber gespeichert. Werte am oder unter dem Schwellenwert bleiben inline. Auch eine deaktivierte Richtlinie oder ein fehlender Treiber belässt Werte inline.

Die eingebettete Anbieterreferenz verwendet das Schema `durable-workflow.v2.external-payload-reference.v1` mit `uri`, `sha256`, `size_bytes`, `codec` und optionalem `expires_at`. Der Codec ist `avro`. `Workflow\V2\Support\ExternalPayloads` speichert den codierten Envelope mit dem Präfix `dw-external-payload:v1:`. Benötigt die Runtime den Wert, lädt sie die codierten Bytes und prüft Größe und SHA-256 vor dem Decodieren. Fehlende oder veränderte Bytes führen zum Fehler, niemals zu einem ersatzweisen `null`.

Diese Anbieterreferenz unterscheidet sich vom Server-Schema `durable-workflow.v2.runtime-external-payload-reference.v1`. Prüfen Sie die [Unterstützung nach Betriebsmodus](../polyglot/server-api-reference.md#external-payload-support-by-mode), bevor Sie einen Treiberhelfer oder gespeicherten Envelope zwischen Bereitstellungsmodi übernehmen.

## Vertrauensgrenze beim Decodieren {#decode-trust-boundary}

Speicherung und Decodierung haben getrennte Vertrauensgrenzen. Ein Anbieter kann codierte Bytes halten, während ein Worker, Codec-Server oder Exportwerkzeug beim Decodieren Anwendungswerte sieht. Legen Sie Ausführungsort, zugängliche Schlüssel sowie die Schwärzung von Vorschauen und Logs fest. Hashes, Größen und Codec-Namen sind Integritätsmetadaten, keine Zusicherung einer Ende-zu-Ende-Verschlüsselung. Auch Anbieter-URIs können vertrauliche Objektnamen enthalten.

## Treiberauswahl {#driver-choices}

| Treiber | URI-Schema | Voraussetzung im eingebetteten Modus |
| --- | --- | --- |
| Lokales Dateisystem | `file://` | Alle eingebetteten Prozesse, die Referenzen auflösen, müssen dieselbe Speicherwurzel erreichen. |
| S3-kompatibler Speicher | `s3://` | Anwendungseigener Treiber oder Dateisystem-Disk mit passendem Bucket, Präfix und Zugangsdaten. |
| Google Cloud Storage | `gs://` | Anwendungseigener Treiber oder Dateisystem-Disk und Anbieter-Client. |
| Azure Blob Storage | `azure://` | Anwendungseigener Treiber oder Dateisystem-Disk und Anbieter-Client. |

Ein Server kann selbst lokalen Speicher verwenden, während entfernte SDK-Worker die Bytes über HTTP abrufen. Diese Worker benötigen weder ein gemeinsames Dateisystem noch Anbieter-Zugangsdaten.

## Namespace konfigurieren {#configuring-a-namespace}

Eingebettete Anwendungen konfigurieren Namespace-Speicherrichtlinie und `ExternalPayloadStorageDriver` in ihrer Laravel-Runtime. Halten Sie Zugangsdaten in der Anwendungskonfiguration, nicht in Workflow-Argumenten, Verlauf oder Referenz-URIs. Verwenden Sie dieselbe Richtlinie in den Prozessen, die einen Lauf ausführen und wiedergeben.

Bei selbst betriebenem Server konfigurieren die administrative [Namespace-Speicher-API](../polyglot/server-api-reference.md#namespace-and-storage) und die [CLI-Speicherbefehle](../polyglot/cli-reference.md#namespace-and-search-attribute-commands) die Server-Richtlinie. Sie gewähren SDK-Workern keinen direkten Anbieterzugriff.

### Mit der CLI {#with-the-cli}

`dw namespace:set-storage-driver` konfiguriert einen Server-Namespace, nicht den Laravel-Container einer unabhängigen eingebetteten Anwendung. Die erforderlichen Disk-, Bucket- und Präfixoptionen stehen in der CLI-Referenz.

### Mit der Server-API {#with-the-server-api}

`PUT /api/namespaces/{namespace}/external-storage` ist eine administrative Richtlinienoperation. Normale SDK-Clients entdecken den resultierenden Runtime-Transport über `GET /api/cluster/info`; sie kopieren dessen Anbieter-Konfiguration nicht in Worker.

## Richtlinie prüfen {#verifying-the-policy}

Prüfen Sie einen Wert oberhalb des Schwellenwerts über den tatsächlich konfigurierten Treiber und die späteren Replay-Prozesse. Vergleichen Sie nach dem Abruf die genaue codierte Byteanzahl und SHA-256. Für Server prüft `dw storage:test --namespace=billing --json` den konfigurierten Speicherpfad. Eine Speicherdiagnose belegt weder Workflow-Ausführung in jedem SDK noch Backup-Wiederherstellung oder alle Anbieteradapter.

## Schwellenwert wählen {#picking-a-threshold}

Lassen Sie Abstand zu normalen Anfrage- und Nutzlastlimits. Der Schwellenwert gilt für **codierte Bytes**, nicht für die ursprüngliche Dateigröße oder das Geschäfts-JSON. Sehr niedrige Werte erzeugen Speicheranfragen und aufbewahrte Referenzen für kleine Werte. Der Runtime-Transport kann weitere Werte auslagern, damit eine gesamte HTTP-Anfrage ihr Limit einhält. Verwenden Sie im Dienstmodus die ermittelten Server-Limits, statt den eingebetteten Schwellenwert als Protokolllimit zu behandeln.

## Replay, Aufbewahrung und Bereinigung {#replay-retention-and-cleanup}

- **Replay-Integrität.** Ein Wert wird erst nach Abruf und Prüfung seiner Bytes decodiert. Bewahren Sie Objekte für jeden aufbewahrten Lauf auf, der sie noch benötigt.
- **Cache geprüfter Abrufe.** `ExternalPayloadStorage` begrenzt seinen Cache geprüfter Bytes. Das Leeren löscht weder das Objekt noch ändert es dessen Eigentümerschaft.
- **Aufbewahrung.** Die Runtime-Bereinigung berücksichtigt aufbewahrte Eigentümer und gemeinsam verwendete Objekte. Speicherfehler, Backup-Sperren oder verbleibende Referenzen können die Löschung verzögern. Eine laufende Aufbewahrungsbereinigung garantiert keine Abwesenheit verwaister Objekte.
- **Verlaufsexport.** Ein Export kann Referenzmetadaten ohne Objektabruf aufbewahren. Seine Prüfsumme oder `history_complete` beweisen weder die Existenz externer Bytes noch die Wiedergebbarkeit des Archivs. Beachten Sie die [Backup- und Wiederherstellungsgrenze](../configuration/pruning-workflows.md#export-before-pruning), und prüfen Sie Objekte gesondert. Eigenständige Archive werden weiter in [Server #520](https://github.com/durable-workflow/server/issues/520) verfolgt.

## Verwendung im Code {#using-it-from-code}

Eingebettetes PHP verwendet `Workflow\V2\Support\ExternalPayloadStorage` mit einem `ExternalPayloadStorageDriver`. `LocalFilesystemExternalPayloadStorage` verarbeitet lokale Speicherwurzeln. Anbieteradapter verwalten ihre Zugriffskonfiguration und URI-Regeln. Anwendungen lassen üblicherweise die Runtime ihre Namespace-Richtlinie anwenden, statt gespeicherte Envelopes selbst zu konstruieren.

Im Dienstmodus laden PHP-, Python- und Rust-SDK-Clients und -Worker Runtime-Nutzlasten automatisch hoch und herunter, wenn der Server einen verfügbaren Transport meldet. Senden Sie keinen Anbieter-Envelope `external_storage` an Server, und löschen Sie keine Server-verwalteten Objekte über direkte Anbieterhelfer. Siehe den [Upload-/Abrufvertrag](../polyglot/server-api-reference.md#runtime-external-payload-transport) und die [Grenze der Python-Helfer](../polyglot/python.md#external-payload-storage).

## Weiterführende Informationen {#see-also}

- [Daten übergeben](../defining-workflows/passing-data.md)
- [Strukturelle Limits: Nutzlastgröße](../constraints/structural-limits.md#payload-size)
- [Server-API: externer Runtime-Nutzlasttransport](../polyglot/server-api-reference.md#runtime-external-payload-transport)
- [Python-SDK: externer Nutzlastspeicher](../polyglot/python.md#external-payload-storage)
