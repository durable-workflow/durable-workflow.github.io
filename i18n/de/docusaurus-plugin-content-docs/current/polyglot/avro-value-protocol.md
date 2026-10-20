---
title: Avro-Value-Protokoll
sidebar_label: Avro-Value-Protokoll
---

# Avro-Value-Protokoll {#avro-value-protocol}

Durable Workflow 2.0 verwendet für jede Avro-Nutzlast ein festes rekursives
[`durable_workflow.protocol.Value`](/schemas/v2/durable_workflow.protocol.Value.v1.avsc)-Schema.
Workflow-Eingaben und -Ergebnisse, Aktivitätswerte und Fehlerdetails, Signale,
Abfragen, Updates, der Replay-Verlauf und extern gespeicherte Nutzlasten nutzen
alle dasselbe Schema. Anwendungen veröffentlichen keine eigenen Avro-Schemas,
und die Plattform benötigt keine Schema-Registry im Netzwerk.

Die Value-Union hat eigene benannte Zweige für null, boolesche Werte,
vorzeichenbehaftete 64-Bit-Ganzzahlen, endliche Double-Werte, Bytes,
UTF-8-Zeichenfolgen, Listen und Maps mit Zeichenfolgeschlüsseln. So bleiben `7`
und `7.0`, Text und Bytes sowie Listen und Maps in PHP, Python und Rust verschieden.

## Übertragungsrahmen {#wire-frame}

Das Feld `blob` enthält die Standardbytes eines einzelnen Avro-Objekts in Base64:

```text
C3 01 || 8-byte little-endian CRC-64-AVRO fingerprint || Avro datum
```

Schema v1 hat den Fingerabdruck `e2a33dff55802237`. SDKs liefern das unveränderliche
Schema für jeden unterstützten Fingerabdruck mit, wählen das Writer-Schema aus
dem Rahmen und gleichen es mit dem aktuellen Reader ab. Ein unbekannter
Fingerabdruck oder ein inkompatibler neuer Zweig schlägt mit
`unsupported_payload_schema` fehl. Decoder raten nicht und fallen nicht auf JSON zurück.

Künftige Wertarten werden als neue, eindeutig benannte Record-Zweige an die Union
angehängt. Veröffentlichte Zweige werden niemals umgeordnet oder wiederverwendet.

## Regeln für Werte {#value-policy}

- Map-Schlüssel müssen Zeichenfolgen sein. SDKs lehnen andere Schlüssel ab,
  statt sie in Zeichenfolgen umzuwandeln.
- Ganzzahlen müssen in den vorzeichenbehafteten 64-Bit-Bereich von Avro `long` passen.
- Double-Werte müssen endlich sein. NaN und Unendlichkeiten werden abgelehnt.
- Python `bytes` und Rust `AvroValue::Bytes` wählen Avro `bytes`. PHP-Aufrufer
  verwenden `AvroBinaryValue::fromBytes()`, da eine PHP-Zeichenfolge allein nicht
  festlegen kann, ob sie Text oder Binärdaten enthält.
- Dezimalzahlen, Ganzzahlen beliebiger Genauigkeit, Datum/Uhrzeit, UUIDs,
  Enums, Dataclasses, Pydantic- und Domänenobjekte benötigen explizite Adapter
  auf eine kanonische Wertart.

Avro ist der einzige Nutzlast-Codec in Durable Workflow 2.0. HTTP-Anfragen und
-Antworten verwenden weiterhin JSON als Transportformat, aber jeder dauerhafte
Wert in diesen Dokumenten nutzt dieses feste Schema und den Einzelobjektrahmen.
Ein `json`-Codec-Tag, ein unbekannter Codec oder ein roher dauerhafter Blob ohne
Tag wird mit `unsupported_payload_codec` strikt abgelehnt. Runtimes konvertieren
nicht zwischen Codecs und raten nicht.

## JSON-Projektion zur Inspektion {#json-inspection-projection}

Laufbeschreibungen behalten `input_envelope`, `output_envelope` und
Ergebnis-Envelopes als maßgebliche verlustfreie Nutzlastdarstellung bei.
JSON-basierte Inspektionsoberflächen wie CLI und Waterline stellen Werte, die
JSON nicht ausdrücken kann, durch eine typisierte Projektion dar:

```json
{"$type":"bytes","base64":"AP8="}
{"$type":"map","entries":[{"key":"0","value":"zero"}]}
```

Die Map-Projektion wird für leere Maps und numerisch aussehende
Zeichenfolgeschlüssel verwendet, die PHP-Arrays nicht ohne Typänderung erhalten
können. Gewöhnliche Skalare, Listen und eindeutige Maps mit Zeichenfolgeschlüsseln
bleiben gewöhnliche JSON-Werte. Verbraucher, die den ursprünglichen typisierten
Wert benötigen, decodieren die zugehörige Envelope statt der Anzeigeprojektion.

## Wiederholbarer Benchmark {#repeatable-benchmark}

Jedes SDK liefert denselben Benchmark mit repräsentativen Werten und erzwingt
ein Budget für seinen ausgewählten Produktionspfad:

```bash
# PHP SDK checkout
composer benchmark-avro-value

# Python SDK checkout
python benchmarks/avro_value.py --enforce

# Rust SDK checkout
cargo run --release --example avro_value_benchmark -- --enforce
```

Die JSON-Ausgabe vergleicht kompaktes JSON, den entfernten JSON-in-Avro-Wrapper
und das feste typisierte Schema. Sie nennt die Größen des Rohwerts, der
gerahmten Nutzlast und der tatsächlichen `{codec, blob}`-HTTP-Envelope sowie die
gesamte Adapter-, Codierungs- und Decodierungslatenz. `AVRO_VALUE_ENCODE_BUDGET_US`
und `AVRO_VALUE_DECODE_BUDGET_US` können die Standardgrenzen auf einem
Qualifizierungs-Runner verschärfen. Die Release-CI führt diese Befehle mit
Budgetprüfung aus. Eine Regression im Produktionspfad muss vor der
Veröffentlichung erklärt oder korrigiert werden. Die alte Wrapper-Implementierung
existiert nur im Benchmark, nicht als Kompatibilitätspfad zur Laufzeit.

## Vorabprüfung der Bereitstellung {#deployment-preflight}

Beim Bootstrap inventarisiert Server jeden gespeicherten `payload_codec` und
prüft die Einzelobjekt-Kennung und den Fingerabdruck des festen Schemas für
Inline-Rahmen, verschachtelte Verlaufs-Envelopes und externe Nutzlastreferenzen.
Die Bereitstellung stoppt vor dem Start der neuen Runtime, wenn aktive oder
Replay-relevante Nicht-Avro-Nutzlasten, Nutzlasten ohne Tag, beschädigte Referenzen
oder veraltete Rahmen vorhanden sind. Aktive Läufe können auf der aktuellen
Vorabversion auslaufen. Aufbewahrter terminaler und Replay-relevanter Zustand
muss der [Migration des Vorabversionsverlaufs](/docs/polyglot/prerelease-history-migration)
mit vorheriger Sicherung folgen. Der Export eines Laufs ändert den abgelehnten
Datenbankzustand nicht. Löschen Sie niemals Verlauf, um die Vorabprüfung zu umgehen.
