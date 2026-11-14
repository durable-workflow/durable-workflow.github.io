---
title: Visibility-Abfragesprache
description: Server-Ausführungen nach Status, Zeit, Identität und typisierten Suchattributen filtern, mit HTTP-Beispielen und Seitennavigation.
---

# Visibility-Abfragesprache

Mit `GET /api/workflows?query=...` finden Sie Ausführungen in einem Server-Namespace. Diese Referenz beschreibt den veröffentlichten nativen Server aus dem [Kompatibilitätsmanifest](../compatibility.md#last-qualified-reproducible-tuple), derzeit `%%artifact.serverVersion%%`. Die Auflistung liest gespeicherte Sichtbarkeitsdaten. Sie führt keinen benannten Abfrage-Handler eines Workflows aus.

Die Anfrage benötigt ein Bearer-Token mit Operator- oder Admin-Rolle, `X-Namespace` und `X-Durable-Workflow-Control-Plane-Version: 2`. Siehe [Namespace-Autorisierung](./namespace-auth-workers.md). Ergebnisse enthalten passende Ausführungen, auch frühere Ausführungen einer Instanz und Kinder mit passenden Attributen. Ein eingebautes Prädikat nur für Wurzeln gibt es nicht.

## Anfrage senden {#make-a-request}

Setzen Sie `DURABLE_WORKFLOW_SERVER_URL` auf die Basis-URL Ihres Servers und `DURABLE_WORKFLOW_AUTH_TOKEN` auf ein Operator- oder Admin-Token. Das Beispiel benötigt Bash, curl und jq. Ersetzen Sie das feste UTC-Intervall durch den gewünschten Zeitraum.

```bash
query='Status = failed AND CloseTime >= "2026-11-14T00:00:00Z" AND CloseTime < "2026-11-15T00:00:00Z"'
page=$(curl --fail-with-body --silent --show-error --get \
  "$DURABLE_WORKFLOW_SERVER_URL/api/workflows" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H 'X-Namespace: default' \
  -H 'X-Durable-Workflow-Control-Plane-Version: 2' \
  --data-urlencode "query=$query" \
  --data-urlencode 'page_size=50')
printf '%s\n' "$page" | jq '{workflow_count, workflows, next_page_token}'
```

`Status = failed` wählt einen Statusbereich, der auch abgebrochene und terminierte Ausführungen enthält. `Status = cancelled` und `Status = terminated` wählen diese Status exakt. `running` umfasst pending, running und waiting. `completed` wählt abgeschlossene Ausführungen. Bei Statuswerten spielt die Groß-/Kleinschreibung keine Rolle.

Verwenden Sie `--data-urlencode` für Abfrage und Seitentoken. Shell-Anführungszeichen, Escape-Sequenzen der Abfragesprache und URL-Kodierung sind getrennte Schritte. Eine erfolgreiche Antwort mit `workflows: []` bedeutet, dass keine Ausführung zu dieser Anfrage passt.

## Felder {#fields}

Feldnamen unterscheiden Groß- und Kleinschreibung. Eingebaute Namen haben Vorrang vor benutzerdefinierten Attributen.

| Feld | Wert | Operatoren |
| --- | --- | --- |
| `WorkflowType`, `WorkflowId`, `RunId`, `TaskQueue` | Ausführungstyp, Instanz-ID, Ausführungs-ID oder Task-Queue | `=`, `!=`, `IN`, negiertes `IN` |
| `Status`, `ExecutionStatus` | Status oder Statusbereich wie oben | `=`, `!=` |
| `StartTime`, `ExecutionTime` | Startzeitpunkt der Ausführung. Die Namen sind Aliasse. | Skalarvergleiche, `IN`, negiertes `IN` |
| `CloseTime` | Abschlusszeitpunkt der Ausführung | Skalarvergleiche, `IN`, negiertes `IN` |
| `BuildId`, `BuildIds` | Aliasse für den Kompatibilitätswert der Ausführung, keine Suche in der Worker-Flotte | Keyword-Operatoren, mit der unten beschriebenen nativen Ablehnung |

Skalarvergleiche sind `=`, `!=`, `<`, `<=`, `>` und `>=`. Ein fehlender Start- oder Abschlusszeitpunkt erfüllt keinen Vergleich, auch keinen negierten. Die native Auflistung verweigert eine zurückzugebende Ausführung mit einem nicht-null Kompatibilitätswert mit HTTP `409` / `unqualified_build_visibility`. Ein geparstes Build-Prädikat belegt keine qualifizierte Build-basierte Auflistung.

Andere Felder müssen registrierte Suchattribute in diesem Namespace sein. Lesen Sie Definitionen mit `GET /api/search-attributes` und registrieren Sie ein Attribut mit `POST /api/search-attributes` und einem JSON-Body wie `{"name":"OrderTotal","type":"double"}`. Die Registrierung benötigt ein Admin-Token. Ein abgeleiteter gespeicherter Typ allein macht einen unregistrierten Schlüssel nicht abfragbar. Das Löschen einer Definition erhält gespeicherte Werte, macht Abfragen dieses Schlüssels aber ungültig.

Bezeichner beginnen mit einem ASCII-Buchstaben, gefolgt von ASCII-Buchstaben, Ziffern oder `_`. Verwenden Sie den registrierten Namen exakt. Memos, Sichtbarkeitslabels, Geschäftsschlüssel und Namen für Eltern-/Wurzelbeziehungen sind keine zusätzlichen eingebauten strukturierten Felder. Die einfache Suche kann einen Geschäftsschlüssel weiterhin wie unten beschrieben finden.

## Typen und Vergleiche {#types-and-comparisons}

| Registrierter Typ | Literale und Vergleichsverhalten |
| --- | --- |
| `keyword` | Gleichheit oder Ungleichheit des gesamten Textwerts, `IN` und negiertes `IN`. Keine Ordnung. |
| `string`, `text` | Vergleich des gesamten Textwerts mit denselben Operatoren wie `keyword`. Keine Teilstring-, Volltext- oder `LIKE`-Suche. |
| `int` | Ganzzahl ohne Anführungszeichen, etwa `42` oder `-3`. Skalarvergleiche, `IN` und negiertes `IN`. Eine Zahl in Anführungszeichen oder eine Dezimalzahl ist kein Ganzzahlliteral. |
| `double` | Ganz- oder Dezimalzahl ohne Anführungszeichen, auch Exponentialschreibweise wie `1.5e3`. Skalarvergleiche, `IN` und negiertes `IN`. |
| `bool` | `true` oder `false` ohne Anführungszeichen, unabhängig von Groß-/Kleinschreibung. Skalarvergleiche, `IN` und negiertes `IN`; `false` liegt vor `true`. `1` und `"true"` sind keine booleschen Literale. |
| `datetime` | Datum/Zeit in Anführungszeichen. Skalarvergleiche, `IN` und negiertes `IN` vergleichen Zeitpunkte. Verwenden Sie explizite UTC- oder Offset-Zeitstempel, etwa `"2026-11-14T12:34:56.123456Z"`. |
| `keyword_list` | `Tags = "urgent"` prüft die Mitgliedschaft. `Tags IN ("urgent", "review")` trifft bei mindestens einem aufgeführten Element zu. Ungleichheit, Ordnung und negierte Mitgliedschaft werden abgelehnt. |

Fehlt einer Ausführung das abgefragte Attribut, erfüllt sie das Prädikat nie, auch bei `!=` und negiertem `IN`. Es gibt kein Existenz- oder `IS NULL`-Prädikat. Ein Wert mit einem früheren, anderen registrierten Typ wird nicht automatisch in den neuen Typ umgewandelt.

Keyword-, Text- und eingebaute Textvergleiche folgen den Gleichheitsregeln der Datenbank. Das veröffentlichte MySQL-/MariaDB-Schema nutzt `utf8mb4_unicode_ci` und ignoriert Groß-/Kleinschreibung, Akzente und nachgestellte Leerzeichen. SQLite und der native PostgreSQL-Vergleich sind exakt. Mitgliedschaft in Keyword-Listen ist exakt. Gehen Sie nicht von identischen Textergebnissen auf diesen Backends aus.

Datum/Zeit akzeptiert ISO-Daten und Zeitstempel mit Bruchteilen bis zu Mikrosekunden. Ein Datum allein bedeutet Mitternacht UTC; ohne Zeitzone gilt UTC. Verwenden Sie für portable Abfragen explizite Zeitstempel. Relative Angaben wie `tomorrow` und Zeitzonennamen wie `Europe/Paris` werden nicht als Datum/Zeit akzeptiert. Berechnen Sie gleitende Intervalle im Aufrufer und senden Sie feste Grenzen.

## Syntax, Rangfolge und Escape-Sequenzen {#syntax-and-escaping}

- Schreiben Sie Vergleiche als `Field operator literal`. Verbinden Sie Prädikate mit `AND` oder `OR`. Schlüsselwörter sind unabhängig von Groß-/Kleinschreibung.
- `NOT` gilt für das nächste Prädikat vor `AND`; `AND` bindet stärker als `OR`. `A = 1 OR B = 2 AND C = 3` bedeutet `A = 1 OR (B = 2 AND C = 3)`.
- Klammern begrenzen eine nichtleere, kommagetrennte `IN`-Liste. Sie gruppieren keine booleschen Ausdrücke. Wiederholen Sie nötigenfalls Prädikate in den `OR`-Zweigen.
- Negierte Mitgliedschaft lautet **`NOT Region IN ("eu", "us")`**. Die SQL-Schreibweise `Region NOT IN (...)` wird nicht unterstützt. Auch `Status IN (...)` wird nicht unterstützt; verwenden Sie `Status = running OR Status = completed`.
- Verwenden Sie einfache oder doppelte Anführungszeichen für Strings. Maskieren Sie das gewählte Anführungszeichen und einen literalen Backslash mit `\`. Beispiele: `Customer = 'O\'Brien'` und `Path = "C:\\orders"`. Der Parser dekodiert auch C-Escapes wie `\n`, `\t` und `\r`; JSONs `\uXXXX` ist hier kein Unicode-Escape. Schreiben Sie Unicode-Zeichen direkt.
- Textliterale ohne Anführungszeichen erlauben ASCII-Buchstaben, Ziffern, `_`, `.`, `:` und `-`. Bevorzugen Sie Anführungszeichen, damit nicht versehentlich boolesche Werte oder Zahlen abgeleitet werden. SQL-Klauseln `SELECT`, `ORDER BY` und `LIMIT` gibt es nicht.

In einem Ausdruck kann ein bloßer registrierter boolescher Feldname `Flag = true` bedeuten; `NOT Flag` bedeutet `Flag = false`. Ein alleinstehendes `Flag` ist dagegen einfacher Suchtext. Explizite Vergleiche vermeiden diese Mehrdeutigkeit.

Der Server erkennt einen Ausdruck an Vergleichssyntax, `IN (...)` oder einem führenden `NOT`-Prädikat. Anderer Text sucht Teilstrings in Workflow-ID und Geschäftsschlüssel. Zum Beispiel ist `query=order-1001` eine einfache Suche. Nicht unterstützter SQL-ähnlicher Text kann daher als einfache Suche behandelt werden, statt einen Syntaxfehler zu liefern. Verwenden Sie die dokumentierte Grammatik und prüfen Sie `query`-Fehler bei ungültigen erkannten Ausdrücken.

## Abfragebeispiele {#query-examples}

Übergeben Sie jeden folgenden Ausdruck als `query`-Wert der obigen curl-Anfrage. Die benutzerdefinierten Beispiele setzen voraus, dass `OrderTotal: double`, `Attempt: int`, `Region: keyword`, `Tags: keyword_list`, `Approved: bool` und `DueAt: datetime` im gewählten Namespace registriert und befüllt sind.

| Aufgabe | Abfrage |
| --- | --- |
| Bestellungen über einem numerischen Schwellenwert | `WorkflowType = "orders.fulfillment" AND OrderTotal > 1000` |
| Versuche in einem inklusiven Bereich | `Attempt >= 2 AND Attempt <= 5` |
| Eine von zwei Regionen | `Region IN ("eu", "us")` |
| Andere gespeicherte Regionen | `NOT Region IN ("eu", "us")` |
| Ein Tag aus der Liste | `Tags IN ("urgent", "review")` |
| Explizites false | `Approved = false` |
| Ein Zeitfenster | `DueAt >= "2026-11-14T00:00:00Z" AND DueAt < "2026-11-15T00:00:00Z"` |
| Zwei Queues unter demselben Typ | `WorkflowType = "orders.fulfillment" AND TaskQueue = "orders" OR WorkflowType = "orders.fulfillment" AND TaskQueue = "priority"` |

## Seitennavigation und Grenzen {#pagination-and-limits}

| Parameter | Verhalten |
| --- | --- |
| `workflow_type` | Optionaler exakter Typfilter, mit `query` und `status` durch `AND` kombiniert. |
| `status` | Optionaler Filter. Bevorzugen Sie die kanonischen Bereiche `running`, `completed` oder `failed`. Der aktuelle Listenendpunkt akzeptiert auch exakt `cancelled` und `terminated`; `pending` und `waiting` sind hier nicht erlaubt. |
| `page_size` | Ganzzahl von `1` bis `200`, Standard `50`. Verwenden Sie diesen Parameter statt `limit`. |
| `next_page_token` | Kopieren Sie das Token der vorherigen Antwort, ohne es zu dekodieren oder selbst zu erzeugen. Stoppen Sie bei null. |

`workflow_count` zählt die Elemente dieser Seite, nicht alle passenden Ausführungen. Ergebnisse sind nach absteigender Start-/Sortierzeit, dann absteigender Ausführungs-ID geordnet. Die Seitennavigation liest Live-Daten mit einem Offset. Behalten Sie Namespace, Abfrage, Filter und Seitengröße bei. Neue Einträge, Abschlüsse oder Attributänderungen können Treffer zwischen Anfragen verschieben und zu Wiederholungen oder Auslassungen führen; dies ist kein Snapshot-Export. Ein ungültiges Token startet derzeit bei der ersten Seite neu, statt einen Fehler zu liefern.

Rufen Sie die nächste Seite des ersten Beispiels ab, falls vorhanden:

```bash
next=$(printf '%s\n' "$page" | jq -r '.next_page_token // empty')
if [ -n "$next" ]; then
  curl --fail-with-body --silent --show-error --get \
    "$DURABLE_WORKFLOW_SERVER_URL/api/workflows" \
    -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
    -H 'X-Namespace: default' \
    -H 'X-Durable-Workflow-Control-Plane-Version: 2' \
    --data-urlencode "query=$query" \
    --data-urlencode 'page_size=50' \
    --data-urlencode "next_page_token=$next" | jq .
fi
```

Die Seitengröße begrenzt zurückgegebene Zeilen, nicht den Aufwand der Abfrageauswertung. Halten Sie Ausdrücke und `IN`-Listen klein und verwenden Sie selektive Typ-, Status- oder Attributprädikate. Der Workflow-Parser definiert nicht die 2048-Zeichen-Grenze der Schedule-API. HTTP-Server und Proxys können eigene URI-Grenzen setzen. [Schedule-Listen](./server-api-reference.md#schedule-list-filters) verwenden eine andere Grammatik mit Gleichheit und `AND`.

## Ungültige Abfragen {#invalid-queries}

Ein erkannter Ausdruck mit Parser-, Feld- oder Typfehler liefert HTTP `422` mit `reason: "validation_failed"`, einer `message` und Arrays in `errors.query` und `validation_errors.query`. Bei ungültiger Seitengröße oder ungültigem Status wird stattdessen der jeweilige Parameterschlüssel verwendet.

| Ungültiger Ausdruck | Korrektur |
| --- | --- |
| `Unknown = 1` | Registrieren Sie das Attribut in diesem Namespace oder korrigieren Sie den Feldnamen. |
| `OrderTotal = "1000"` | Verwenden Sie das numerische Literal `1000`. |
| `Approved = 1` | Verwenden Sie `true` oder `false`. |
| `Region > "eu"` | Keywords unterstützen Gleichheit und Mitgliedschaft, keine Ordnung. |
| `Tags != "urgent"` oder `NOT Tags IN ("urgent")` | Negative Mitgliedschaft wird für Keyword-Listen nicht unterstützt. |
| `Attempt IN ()`, `Attempt = 1 AND` | Geben Sie eine nichtleere Liste oder ein vollständiges Prädikat an. |
| `DueAt > "tomorrow"` | Senden Sie einen konkreten Zeitstempel. |

## Embedded-Modus und Waterline {#mode-support}

Diese Sprache ist über die Workflow-Listen-API des Servers verfügbar. Aktuelle Embedded-Listen und Filter gespeicherter Waterline-Ansichten implementieren nicht die vollständige Grammatik. Ihre exakten Metadatenfilter `key=value` und Teilstringfelder belegen keine Unterstützung für Bereiche, `IN`, `!=` oder boolesche Ausdrücke. Auch Waterline im Service-Modus benötigt explizite UI-/API-Unterstützung, bevor eine gespeicherte Ansicht als diese Abfragesprache gelten kann. Die gemeinsame Paritätsarbeit bleibt im [Visibility-Query-Feature](https://github.com/durable-workflow/.github/issues/224) offen.

Diese Referenz folgt dem [veröffentlichten nativen Parser mit Unit-Tests](https://github.com/durable-workflow/server/blob/b6e04ce7e679464e91f6ceae83310d3bb3204092/rust/src/runtime/visibility_query.rs), der [HTTP-Seitennavigation](https://github.com/durable-workflow/server/blob/b6e04ce7e679464e91f6ceae83310d3bb3204092/rust/src/runtime/visibility.rs) und den [Listen-API-Tests](https://github.com/durable-workflow/server/blob/b6e04ce7e679464e91f6ceae83310d3bb3204092/rust/tests/execution/visibility.rs). Sie beschreiben veröffentlichtes Server-Verhalten, keinen Abschluss der Embedded- oder Waterline-Parität.
