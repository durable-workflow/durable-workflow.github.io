---
sidebar_position: 13
---

# Webhooks {#webhooks}

Das Framework stellt Webhooks bereit, mit denen externe Systeme Workflows
dynamisch starten und Signale senden können. So lassen sich externe Dienste,
APIs und Automatisierungswerkzeuge integrieren.

## Webhooks aktivieren {#enabling-webhooks}
Registrieren Sie zum Aktivieren die Webhook-Routen in der Routendatei Ihrer
Anwendung (`routes/web.php` oder `routes/api.php`):

```php
use Workflow\V2\Webhooks;

Webhooks::routes([
    App\Workflows\OrderWorkflow::class,
    'manual-invoice' => App\Workflows\InvoiceWorkflow::class,
]);
```

Übergeben Sie die explizite Zuordnung der Workflow-Klassen, die Sie zugänglich
machen möchten. Jeder Alias wird zum öffentlichen Routensegment. Jede
Workflow-Klasse muss über `#[Type(...)]` oder einen registrierten Eintrag unter
`workflows.v2.types.workflows` einen stabilen dauerhaften Typschlüssel tragen.
Die vollständige Routenmatrix finden Sie unter
[Explizite Befehls- und Abfrage-Webhooks](#explicit-command-and-query-webhooks).

## Sichtbarkeitsmetadaten {#visibility-metadata}
Bei Registrierung über `Workflow\V2\Webhooks::routes(...)` akzeptiert die
Startroute auch ein reserviertes Objekt `visibility`. Diese Felder werden als
Workflow-Sichtbarkeitsmetadaten gespeichert und nicht an die Workflow-Methode
`handle()` übergeben.

```bash
curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -d '{
           "workflow_id": "order-123",
           "orderId": 123,
           "visibility": {
             "business_key": "order-123",
             "labels": {
               "tenant": "acme",
               "region": "us-east"
             },
             "memo": {
               "customer": {
                 "id": 42,
                 "name": "Taylor"
               },
               "source": "checkout"
             }
           }
         }'
```

`business_key` und `visibility.labels` werden in Instanz, Lauf,
Laufzusammenfassung, typisierte Starthistorie, Details des ausgewählten Laufs
und Historienexport kopiert. Waterline kann Listenansichten mit exakt
übereinstimmenden Abfrageparametern nach diesen Feldern filtern.

`visibility.memo` wird in Instanz, Lauf, typisierte Starthistorie,
Laufdetails und Historienexport kopiert. Spätere `continueAsNew()`-Läufe erben
standardmäßig dasselbe Memo. Es muss auf oberster Ebene ein JSON-Objekt sein,
mit verschachtelten Skalaren, `null`, Arrays oder Objekten. `memo` ist nur
zurückgegebenes Metadatum, kein Listenfilter oder Suchfeld der
Laufzusammenfassung.

## Webhook-Authentifizierung {#webhook-authentication}
Standardmäßig verlangen Webhooks keine Authentifizierung. Sie können in
`config/workflows.php` jedoch eine von mehreren Strategien konfigurieren.

**Wichtig:** Aktivieren Sie Authentifizierung per Token oder HMAC-Signatur,
wenn Webhook-URLs mit externen Parteien geteilt oder öffentlich zugänglich
gemacht werden, um unbefugten Zugriff zu verhindern.

### Authentifizierungsmethoden {#authentication-methods}
Unterstützt werden:
1. Keine Authentifizierung (none)
2. Tokenbasierte Authentifizierung (token)
3. HMAC-Signaturprüfung (signature)
4. Eigene Authentifizierung (custom)

### Token-Authentifizierung {#token-authentication}
Bei Token-Authentifizierung benötigen Webhooks ein gültiges API-Token in den
Anfrageheadern. Der Standardheader ist `Authorization`, lässt sich aber in der
Konfiguration ändern.

#### Beispielanfrage {#example-request}
```bash
curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -H "Authorization: your-api-token" \
     -d '{"orderId": 123}'
```

### HMAC-Signaturauthentifizierung {#hmac-signature-authentication}
Bei HMAC-Authentifizierung werden Anfragen mit einem geheimen Schlüssel
geprüft. Der Standardheader ist `X-Signature` und kann ebenfalls geändert
werden.

#### Beispielanfrage {#example-request-1}
```bash
BODY='{"orderId": 123}'
SIGNATURE=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "your-secret-key" | awk '{print $2}')

curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -H "X-Signature: $SIGNATURE" \
     -d "$BODY"
```

### Eigene Authentifizierung {#custom-authentication}
Erstellen Sie für einen eigenen Authentifikator eine Klasse, die das Interface
`WebhookAuthenticator` implementiert:

```php
use Illuminate\Http\Request;
use Workflow\Auth\WebhookAuthenticator;

class CustomAuthenticator implements WebhookAuthenticator
{
    public function validate(Request $request): Request
    {
        $allow = true;

        if ($allow) {
            return $request;
        } else {
            abort(401, 'Unauthorized');
        }
    }
}
```

Konfigurieren Sie sie anschließend in `config/workflows.php`:

```php
'webhook_auth' => [
    'method' => 'custom',
    'custom' => [
        'class' => App\Your\CustomAuthenticator::class,
    ],
],
```

Die Methode `validate()` sollte bei Gültigkeit das `Request` zurückgeben und
bei fehlender Berechtigung `abort(401)` aufrufen.

## Webhook-Routen konfigurieren {#configuring-webhook-routes}
Standardmäßig sind Webhooks unter `/webhooks` erreichbar. Sie können den
Routenpfad in `config/workflows.php` anpassen:

```php
'webhooks_route' => 'workflows',
```

Nach dieser Änderung sind Webhooks hier erreichbar:
```
POST /workflows/start/order-workflow
POST /workflows/signal/order-workflow/{workflowId}/mark-as-shipped
POST /workflows/instances/{workflowId}/queries/{query}
POST /workflows/instances/{workflowId}/runs/{runId}/queries/{query}
POST /workflows/instances/{workflowId}/signals/{signal}
POST /workflows/instances/{workflowId}/runs/{runId}/signals/{signal}
POST /workflows/instances/{workflowId}/repair
POST /workflows/instances/{workflowId}/cancel
POST /workflows/instances/{workflowId}/terminate
GET  /workflows/instances/{workflowId}/describe
POST /workflows/instances/{workflowId}/runs/{runId}/repair
POST /workflows/instances/{workflowId}/runs/{runId}/cancel
POST /workflows/instances/{workflowId}/runs/{runId}/terminate
GET  /workflows/instances/{workflowId}/runs/{runId}/describe
GET  /workflows/workflow-tasks/poll
GET  /workflows/activity-tasks/poll
POST /workflows/control-plane/start
```

## Explizite Befehls- und Abfrage-Webhooks {#explicit-command-and-query-webhooks}

Dauerhafte Start-, Signal-, Update-, Reparatur-, Abbruch- und Beendigungsbefehle
werden über HTTP bereitgestellt. Hinzu kommen Replay-sichere Abfragerouten
zum Lesen aktueller und ausgewählter Läufe.

Sie registrieren eine explizite Aliaszuordnung und leiten nur die Workflows
weiter, die Sie zugänglich machen möchten.

```php
use Workflow\V2\Webhooks;

Webhooks::routes([
    App\Workflows\OrderWorkflow::class,
    'manual-invoice' => App\Workflows\InvoiceWorkflow::class,
]);
```

Eine direkt registrierte Workflow-Klasse muss mit `#[Type(...)]` einen
stabilen Typschlüssel definieren oder unter `workflows.v2.types.workflows`
registriert sein:

```php
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

#[Type('order-workflow')]
class OrderWorkflow extends Workflow
{
    public function handle(int $orderId)
    {
        // ...
    }
}
```

Gleichwertige Registrierung über die Konfiguration:

```php
// config/workflows.php
'v2' => [
    'types' => [
        'workflows' => [
            'order-workflow' => App\Workflows\OrderWorkflow::class,
        ],
    ],
],
```

Die entstehende Startroute lautet:

```
POST /webhooks/start/order-workflow
```

Beispielanfrage:

```bash
curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -d '{"workflow_id":"order-123","orderId":123}'
```

`workflow_id` ist die undurchsichtige öffentliche Workflow-Instanz-ID.
Sie ist keine Lauf-ID und sollte als undurchsichtige Zeichenfolge behandelt
werden.

Vom Aufrufer vorgegebene `workflow_id`-Werte müssen nicht leere URL-sichere
Zeichenfolgen mit bis zu 191 Zeichen sein und dürfen nur Buchstaben, Ziffern,
`.`, `_`, `-` und `:` enthalten. Leere, zu lange oder IDs mit nicht
unterstützten Zeichen werden bei der Webhook-Validierung mit HTTP `422`
abgelehnt.

Dieselbe dauerhafte Typzuordnung ist auch der aktuelle Worker-Fallback, wenn
ein gespeicherter Workflow-Klassenname nach Refactoring abweicht. Bleibt
`order-workflow` stabil und zeigt die Konfigurationsregistrierung auf die neue
Klasse, kann eingeplante v2-Arbeit den dauerhaften Typschlüssel weiterhin
auflösen, selbst wenn der ursprünglich gespeicherte PHP-Klassenname nicht
mehr ladbar ist.

Sie können auch ein explizites Verhalten bei doppeltem Start anfordern:

```bash
curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -d '{"workflow_id":"order-123","orderId":123,"on_duplicate":"return_existing_active"}'
```

Unterstützte Werte für `on_duplicate` sind:

- `reject_duplicate`
- `return_existing_active`

Alle Befehls-Webhooks geben denselben JSON-Umschlag zurück:

```json
{
  "outcome": "started_new",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "rejection_reason": null
}
```

Annahmeantwort bei Erstellung eines neuen Laufs:

```json
{
  "outcome": "started_new",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "rejection_reason": null
}
```

Annahmeantwort bei angeforderter Wiederverwendung des vorhandenen aktiven Laufs:

```json
{
  "outcome": "returned_existing_active",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "rejection_reason": null
}
```

Antwort bei abgelehntem doppeltem Start:

```json
{
  "outcome": "rejected_duplicate",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": null,
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "command_source": "webhook",
  "rejection_reason": "instance_already_started"
}
```

Antwortfelder:

- `workflow_id` ist die öffentliche Workflow-Instanz-ID.
- `run_id` ist der erste vom angenommenen Startbefehl erstellte aktive Lauf.
- `requested_run_id` ist nur gesetzt, wenn der Aufrufer explizit einen ausgewählten Lauf adressiert hat.
- `resolved_run_id` ist der von der Engine tatsächlich für diesen Befehl aufgelöste Lauf. Bei instanzbezogenen Starts entspricht er `run_id`.
- `command_id` ist die dauerhafte Startbefehls-ID.
- `command_source` ist für Webhook-Routen `webhook`.
- Instanzbezogene Signal-, Update-, Reparatur-, Abbruch- und Beendigungsrouten lösen den neuesten dauerhaften Lauf der Instanz auf, statt nur dem veränderlichen Zeiger auf den aktuellen Lauf zu vertrauen. Continue-as-new-Ketten bleiben deshalb über dieselbe öffentliche ID adressierbar, selbst wenn diese Spalte abweicht.
- Laufbezogene Befehlsrouten legen einen ausgewählten Lauf unter derselben öffentlichen Instanz-ID fest. Ist er nicht mehr aktuell, lehnen sie mit `target_scope = run`, `outcome = rejected_not_current` und `rejection_reason = selected_run_not_current` ab. Dann bleiben `run_id` und `requested_run_id` bei der historischen Auswahl, während `resolved_run_id` auf den als Nächstes zu adressierenden aktuellen Lauf zeigt.
- Payload-Schlüssel werden in Deklarationsreihenfolge mit den Parameternamen von `handle()` abgeglichen.
- Workflows definieren ihre Startargumente an `handle()`.
- Workflow-Klassen ohne deklariertes `handle()` werden vor Lauferstellung mit HTTP-`422`-Validierungsfehlern abgelehnt.
- Fehlende erforderliche Payload-Schlüssel werden mit HTTP-`422`-Validierungsfehlern abgelehnt, statt still verworfen zu werden.
- Leere, zu lange oder nicht routensichere `workflow_id`-Werte werden mit HTTP-`422`-Validierungsfehlern abgelehnt, statt in die Behandlung doppelter Starts zu gelangen.
- Ungültige Werte für `on_duplicate` werden mit HTTP-`422`-Validierungsfehlern abgelehnt.
- `on_duplicate = return_existing_active` gibt HTTP `200` zurück, wenn der aktuelle aktive Lauf wiederverwendet wird.
- Nicht wiederverwendete doppelte Starts geben HTTP `409` mit `outcome = rejected_duplicate`, `command_status = rejected` und `rejection_reason = instance_already_started` zurück.
- Die dauerhafte Zeile `workflow_commands` speichert den Webhook-Eingangskontext getrennt von Geschäftsargumenten. Dazu zählen Aufruferbezeichnung, Authentifizierungsmethode oder -ergebnis, Anfrageroutenname, Anfragepfad und ein Fingerprint aus normalisiertem Payload sowie ausgewählten Headern wie `X-Request-Id` und `X-Correlation-Id`.

Aktuelle HTTP-Antwortmatrix des Start-Webhooks:

- `202` mit `outcome = started_new` bei Erstellung eines neuen Laufs.
- `200` mit `outcome = returned_existing_active` bei Wiederverwendung des vorhandenen aktiven Laufs.
- `409` mit `outcome = rejected_duplicate` bei Ablehnung eines doppelten Starts.
- `401` bei Webhook-Authentifizierungsfehler.
- `404` bei unbekanntem Alias.
- `422` bei Payload-Validierungsfehler.

### Signalbefehls-Webhooks {#signal-command-webhooks}

Sowohl instanz- als auch laufbezogene Signalbefehle stehen bereit:

```text
POST /webhooks/instances/{workflowId}/signals/{signal}
POST /webhooks/instances/{workflowId}/runs/{runId}/signals/{signal}
```

`workflowId` ist die öffentliche Workflow-Instanz-ID. Die instanzbezogene
Route löst zum Anwendungszeitpunkt den aktuellen aktiven Lauf auf. Die
laufbezogene Route nimmt zusätzlich eine ausgewählte `runId` und lehnt ab,
wenn dieser Lauf historisch ist. Der Signalname stammt aus dem Routenparameter.
Der Anfragetext akzeptiert derzeit ein optionales Feld auf oberster Ebene:

```json
{
  "arguments": ["Taylor"]
}
```

`arguments` muss ein Array sein. Fehlt das Feld, wird ein bei
`await('signal-name')` wartender Workflow mit `true` fortgesetzt.
Die adressierte Workflow-Klasse muss den Signalnamen außerdem mit
`#[Workflow\V2\Attributes\Signal('...')]` deklarieren. Nicht deklarierte
Namen werden dauerhaft abgelehnt, statt blind gepuffert zu werden.

Signalbeispiel:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/signals/approved-by" \
     -H "Content-Type: application/json" \
     -d '{"arguments":["Taylor"]}'
```

Antwort bei angenommenem Signal:

```json
{
  "outcome": "signal_received",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": null,
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "rejection_reason": null
}
```

Angenommene und abgelehnte Signalbefehle erhalten außerdem eine eigene
dauerhafte Lebenszykluszeile `workflow_signal_records`, die mit dem
ursprünglichen Befehl verknüpft ist. Signalbefehlsantworten liefern weiterhin
die Befehls-ID als HTTP-Korrelations-ID. Waterlines Laufdetails und
Historienexporte zeigen die Lebenszykluszeile als `signals[*].id` zusammen mit
Signalname, `signal_wait_id`, Befehlssequenz, Workflow-Sequenz nach Anwendung,
Status, Ergebnis, Validierungsfehlern und gespeicherten Argumenten.

Ablehnungsantwort, wenn die Instanz existiert, aber noch keinen Lauf gestartet
hat:

```json
{
  "outcome": "rejected_not_started",
  "workflow_id": "order-123",
  "run_id": null,
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "instance_not_started"
}
```

Ablehnungsantwort bei bereits geschlossenem aktuellem Lauf:

```json
{
  "outcome": "rejected_not_active",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "run_not_active"
}
```

Ablehnungsantwort bei nicht deklariertem Signalnamen im Routenziel:

```json
{
  "outcome": "rejected_unknown_signal",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "unknown_signal"
}
```

Ablehnungsantwort, wenn eine laufbezogene Signalroute einen historischen Lauf
adressiert:

```json
{
  "outcome": "rejected_not_current",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": "01J...",
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "run",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "selected_run_not_current"
}
```

Aktuelle HTTP-Antwortmatrix des Signal-Webhooks:

- `202` mit `outcome = signal_received` bei Annahme des Signalbefehls.
- `401` bei Webhook-Authentifizierungsfehler.
- `404` bei unbekannter Workflow-Instanz-ID.
- `404` mit `outcome = rejected_unknown_signal`, wenn der Workflow diesen Signalnamen nicht deklariert. Trägt der Lauf bereits einen typisierten `WorkflowStarted`-Vertragssnapshot oder kann ein älteres `WorkflowStarted` beim ersten kompatiblen Eingang vervollständigt werden, hängt diese Ablehnung nicht mehr von einer vorherigen Reflection der aktiven Workflow-Klasse ab.
- `409` mit `outcome = rejected_not_started`, wenn die Instanz noch keinen aktuellen Lauf hat.
- `409` mit `outcome = rejected_not_active`, wenn der adressierte aktuelle Lauf bereits geschlossen ist.
- `409` mit `outcome = rejected_not_current`, wenn die laufbezogene Route einen historischen ausgewählten Lauf adressiert.
- `422`, wenn `arguments` vorhanden, aber kein Array ist.

### Signal-with-start-Webhooks {#signal-with-start-webhooks}

Eine instanzbezogene verknüpfte Annahmeroute startet einen neuen Lauf oder
verwendet den aktuellen aktiven Lauf wieder, bevor sie ein Signal aufzeichnet:

```text
POST /webhooks/start/{alias}/signals/{signal}
```

`alias` ist der in `Workflow\V2\Webhooks::routes([...])` registrierte
Webhook-Workflow-Alias. `signal` ist der mit `#[Signal(...)]` deklarierte
dauerhafte Signalname.

Der Anfragetext kombiniert normale Startfelder mit dem reservierten Feld
`signal_arguments` für den angehängten Signal-Payload:

```json
{
  "workflow_id": "order-123",
  "signal_arguments": ["Taylor"],
  "visibility": {
    "business_key": "order-123"
  }
}
```

`signal_arguments` muss ein Array sein. Die Route setzt `on_duplicate`
standardmäßig auf `return_existing_active` und lehnt jeden anderen Wert der
Duplikatrichtlinie für diese verknüpfte Annahmeroute ab.

Annahmeantwort bei Start eines neuen Laufs:

```json
{
  "outcome": "signal_received",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": null,
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "start_command_id": "01J...",
  "start_command_sequence": 1,
  "start_outcome": "started_new",
  "start_command_status": "accepted",
  "intake_group_id": "01J...",
  "rejection_reason": null
}
```

Hat die Workflow-Instanz bereits einen aktiven aktuellen Lauf, liefert dieselbe
Route `start_outcome = returned_existing_active` und behält den Signalbefehl
als oberstes Antwortobjekt `command_*`. Verknüpfter Start- und Signalbefehl
teilen `intake_group_id`, Anfrageroutenmetadaten und Korrelationsheader.
Die Laufzeit zeichnet beide Befehle in einer Transaktion auf, bevor der Worker
den ersten Benutzer-Workflow-Schritt ausführen kann.

Laufdetails und Historienexport frieren dieselbe zusammengesetzte Annahme
unter `linked_intakes[*]` ein. Maßgeblich sind die gemeinsame
`workflow_commands.context.intake.group_id` und der auf jeder angenommenen
Befehlszeile aufgezeichnete `mode`. Für `signal_with_start` zeigt die
Gruppenzeile `start_command_*`, das primäre Nicht-Start-Kommando
`primary_command_*`, `complete`, `missing_expected_command_types` und die
geordneten verschachtelten Snapshots `commands[*]`.

Ist der Signalname unbekannt oder verletzt der Signal-Payload die dauerhafte
Vertragsvalidierung, lehnt die Laufzeit den Signalbefehl vor Erstellung eines
neuen Laufs ab. Die Antwort lässt dann `run_id`, `start_command_id` und
`start_outcome` auf `null`.

Aktuelle HTTP-Antwortmatrix des Signal-with-start-Webhooks:

- `202` mit `outcome = signal_received` und `start_outcome = started_new`, wenn die Anfrage einen Lauf erstellt und das Signal aufzeichnet.
- `202` mit `outcome = signal_received` und `start_outcome = returned_existing_active`, wenn die Anfrage den aktuellen aktiven Lauf wiederverwendet und das Signal aufzeichnet.
- `401` bei Webhook-Authentifizierungsfehler.
- `404` bei unbekanntem Webhook-Workflow-Alias.
- `404` mit `outcome = rejected_unknown_signal`, wenn der Workflow diesen Signalnamen nicht deklariert.
- `422` mit `outcome = rejected_invalid_arguments`, wenn `signal_arguments` ein Array ist, aber den dauerhaften Signalvertrag nicht erfüllt.
- `422`, wenn `signal_arguments` vorhanden, aber kein Array ist oder `on_duplicate` einen anderen Wert als `return_existing_active` hat.

### Abfrage-Webhooks {#query-webhooks}

Instanz- und laufbezogene Abfragerouten stehen bereit:

```text
POST /webhooks/instances/{workflowId}/queries/{query}
POST /webhooks/instances/{workflowId}/runs/{runId}/queries/{query}
```

`workflowId` ist die öffentliche Workflow-Instanz-ID. Die instanzbezogene Route
löst nach Aktualisierung den neuesten dauerhaften Lauf auf. Die laufbezogene
Route legt eine ausgewählte `runId` fest, auch historische oder bereits
geschlossene Läufe, da Abfragen reine lesende Replay-Operationen sind.

`query` ist das mit `#[QueryMethod]` deklarierte öffentliche Abfrageziel.
Solange die Workflow-Definition ladbar ist, akzeptiert die Route auch den
zugrunde liegenden PHP-Methodennamen. Erfolgreiche Antworten normalisieren
`query_name` aber zurück auf das dauerhafte öffentliche Ziel.

Der Anfragetext akzeptiert eine positionale Liste `arguments` oder eine
benannte Zuordnung `arguments` mit den deklarierten Abfrageparametern als
Schlüsseln:

```json
{
  "arguments": ["start"]
}
```

```json
{
  "arguments": {
    "prefix": "start"
  }
}
```

Anders als verändernde Webhook-Routen fügen Abfrage-Webhooks keine dauerhafte
Befehlszeile an. Sie spielen den ausgewählten Lauf erneut ab und geben sofort
ein serialisiertes Ergebnis zurück.

Abfragebeispiel:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/queries/events-starting-with" \
     -H "Content-Type: application/json" \
     -d '{"arguments":{"prefix":"start"}}'
```

Antwort bei angenommener Abfrage:

```json
{
  "query_name": "events-starting-with",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "target_scope": "instance",
  "result": "i:1;"
}
```

Ablehnungsantwort bei Argumenten außerhalb des deklarierten Abfragevertrags:

```json
{
  "query_name": "events-starting-with",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "target_scope": "instance",
  "message": "Workflow query [events-starting-with] received invalid arguments.",
  "validation_errors": {
    "prefix": [
      "The prefix argument is required."
    ]
  }
}
```

Ablehnungsantwort, wenn die Workflow-Definition des ausgewählten Laufs nicht
mehr erneut abgespielt werden kann:

```json
{
  "query_name": "events-starting-with",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "target_scope": "instance",
  "blocked_reason": "workflow_definition_unavailable",
  "message": "Workflow 01J... [order-123] cannot execute query [events-starting-with] because the workflow definition is unavailable for durable type [order-workflow]."
}
```

Aktuelle HTTP-Antwortmatrix des Abfrage-Webhooks:

- `200` mit serialisiertem `result` bei erfolgreichem Abfrage-Replay.
- `401` bei Webhook-Authentifizierungsfehler.
- `404` bei unbekannter Workflow-Instanz-ID oder ausgewählter Lauf-ID.
- `409`, wenn die ausgewählte Instanz noch nicht gestartet ist, die angeforderte Abfrage an diesem ausgewählten Lauf nicht deklariert ist oder Replay mit `blocked_reason = workflow_definition_unavailable` blockiert ist.
- `422`, wenn der deklarierte Abfragevertrag die übergebenen `arguments` ablehnt.

### Update-Befehls-Webhooks {#update-command-webhooks}

Instanz- und laufbezogene Update-POST-Routen sowie Routen zum Lesen des
dauerhaften Lebenszyklus stehen bereit:

```text
POST /webhooks/instances/{workflowId}/updates/{update}
POST /webhooks/instances/{workflowId}/runs/{runId}/updates/{update}
GET /webhooks/instances/{workflowId}/updates/{updateId}
GET /webhooks/instances/{workflowId}/runs/{runId}/updates/{updateId}
```

`workflowId` ist die öffentliche Workflow-Instanz-ID. `update` ist der mit
`#[UpdateMethod]` deklarierte dauerhafte Updatename. `updateId` ist die von
Update-Antworten zurückgegebene dauerhafte Lebenszyklus-ID. Die instanzbezogene
POST-Route löst zum Anwendungszeitpunkt den aktuellen aktiven Lauf auf.
Die laufbezogene POST-Route nimmt zusätzlich eine ausgewählte `runId` und
lehnt ab, wenn dieser Lauf historisch ist. Die instanzbezogene GET-Route liest
den gespeicherten Lebenszyklus dieser Workflow-Instanz. Die laufbezogene
GET-Route beschränkt die Suche auf den ausgewählten Lauf.

Bei `#[UpdateMethod('mark-approved')]` lautet das öffentliche Webhook-Ziel
`mark-approved`, selbst wenn die zugrunde liegende PHP-Methode anders heißt.

Der Anfragetext akzeptiert eine positionale Liste `arguments` oder eine
benannte Zuordnung `arguments` mit den deklarierten Update-Parametern als
Schlüsseln:

```json
{
  "arguments": [true, "api"]
}
```

```json
{
  "arguments": {
    "approved": true
  }
}
```

Setzen Sie `wait_for` auf `accepted`, wenn der Aufrufer nur die dauerhafte
Annahme des Update-Befehls benötigt und die spätere Anwendung durch den
Workflow-Worker wünscht:

```json
{
  "arguments": {
    "approved": true
  },
  "wait_for": "accepted"
}
```

Fehlt `wait_for` oder ist es `completed`, zeichnet der Webhook zuerst das
angenommene Update auf und wartet dann bis zum konfigurierten Abschlussbudget
auf dessen Anwendung durch den Worker. Überschreiben Sie dieses Budget pro
Anfrage mit `wait_timeout_seconds`:

```json
{
  "arguments": {
    "approved": true
  },
  "wait_timeout_seconds": 5
}
```

Schließt der Worker innerhalb dieses Budgets ab, gibt der Webhook die normale
Antwort für ein abgeschlossenes oder fehlgeschlagenes Update zurück. Läuft
das Wartebudget zuerst ab, gibt er HTTP `202` mit dem weiterhin offenen
angenommenen Lebenszyklus zurück, statt unbegrenzt zu blockieren. Bei
`wait_for = accepted` zeichnet der Webhook die Befehlszeile, die eigene
Update-Lebenszykluszeile und typisierte Historie `UpdateAccepted` auf. Dann
plant er eine Workflow-Aufgabe ein oder stellt sie erneut zu und gibt ohne
Warten auf Anwendung HTTP `202` zurück.

Jede Update-POST- und GET-Antwort enthält normale Befehlsfelder sowie
`update_id`, `update_name`, `update_status`, `workflow_sequence`, `accepted_at`,
`applied_at`, `rejected_at` und `closed_at`. Angenommene, aber offene
Lebenszyklen liefern `workflow_sequence = null`, `result = null`,
`applied_at = null`, `rejected_at = null` und `closed_at = null`, bis der Worker
sie schließt.

Wird eine benannte Zuordnung angenommen, normalisiert die Engine sie in die
deklarierte Parameterreihenfolge, bevor sie typisierte Historie
`UpdateAccepted` oder `UpdateApplied` anfügt. Optionale Parameter werden dabei
auch aus ihren PHP-Standardwerten ergänzt.

Jedes angenommene oder abgelehnte Update beruht auf einer dauerhaften Zeile
`workflow_updates` mit Schlüssel `update_id`. Aufrufer können deshalb einmal
POST senden und den gespeicherten Lebenszyklus später per GET lesen, ohne
Zustand aus allgemeinen Befehlszeilen abzuleiten.

Update-Beispiel:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/updates/mark-ready" \
     -H "Content-Type: application/json" \
     -d '{"arguments":{"approved":true}}'
```

Antwort bei abgeschlossenem Update:

```json
{
  "outcome": "update_completed",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "update_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "update_name": "mark-ready",
  "update_status": "completed",
  "workflow_sequence": 1,
  "accepted_at": "2026-04-10T12:00:00.000000Z",
  "applied_at": "2026-04-10T12:00:01.000000Z",
  "rejected_at": null,
  "closed_at": "2026-04-10T12:00:01.000000Z",
  "wait_for": "completed",
  "wait_timed_out": false,
  "wait_timeout_seconds": 10,
  "rejection_reason": null,
  "validation_errors": [],
  "result": {
    "approved": true
  },
  "failure_id": null,
  "failure_message": null
}
```

Antwort bei lediglich angenommenem Update:

```json
{
  "outcome": null,
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "update_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "update_name": "mark-ready",
  "update_status": "accepted",
  "workflow_sequence": null,
  "accepted_at": "2026-04-10T12:00:00.000000Z",
  "applied_at": null,
  "rejected_at": null,
  "closed_at": null,
  "wait_for": "accepted",
  "wait_timed_out": false,
  "wait_timeout_seconds": null,
  "rejection_reason": null,
  "validation_errors": [],
  "result": null,
  "failure_id": null,
  "failure_message": null
}
```

Beispiel zur Lebenszyklussuche:

```bash
curl "https://example.com/webhooks/instances/order-123/updates/01J..." \
     -H "Content-Type: application/json"
```

Suchantwort bei noch offenem Update:

```json
{
  "outcome": null,
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "update_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "update_name": "mark-ready",
  "update_status": "accepted",
  "workflow_sequence": null,
  "accepted_at": "2026-04-10T12:00:00.000000Z",
  "applied_at": null,
  "rejected_at": null,
  "closed_at": null,
  "wait_for": "status",
  "wait_timed_out": false,
  "wait_timeout_seconds": null,
  "rejection_reason": null,
  "validation_errors": [],
  "result": null,
  "failure_id": null,
  "failure_message": null
}
```

Suchantwort nach Schließen des Lebenszyklus:

```json
{
  "outcome": "update_completed",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "update_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "update_name": "mark-ready",
  "update_status": "completed",
  "workflow_sequence": 1,
  "accepted_at": "2026-04-10T12:00:00.000000Z",
  "applied_at": "2026-04-10T12:00:01.000000Z",
  "rejected_at": null,
  "closed_at": "2026-04-10T12:00:01.000000Z",
  "wait_for": "status",
  "wait_timed_out": false,
  "wait_timeout_seconds": null,
  "rejection_reason": null,
  "validation_errors": [],
  "result": {
    "approved": true
  },
  "failure_id": null,
  "failure_message": null
}
```

Suchrouten warten nicht auf Ausführung. Sie lesen nur den gespeicherten
dauerhaften Lebenszyklus und geben daher immer `wait_for = status`,
`wait_timed_out = false` und `wait_timeout_seconds = null` zurück.

Hat der ausgewählte Lauf bereits ein früher angenommenes Signal zur Anwendung
anstehen, wird ein späterer POST als `rejected_pending_signal` abgelehnt,
statt diese Workflow-Aufgabe direkt im Aufruferpfad auszuführen. Ungültige
benannte oder positionale Payloads werden als `rejected_invalid_arguments`
mit `validation_errors` abgelehnt. POST-Routen für historische Läufe werden
als `rejected_not_current` abgelehnt.

Aktuelle HTTP-Antwortmatrix der Update-POST-Routen:

- `200` mit `outcome = update_completed`, wenn der Update-Befehl angenommen und abgeschlossen wurde.
- `202` mit `update_status = accepted`, wenn `wait_for = accepted` den Update-Befehl dauerhaft annimmt und die Anwendung dem Workflow-Worker überlässt.
- `202` mit `update_status = accepted`, `wait_for = completed` und `wait_timed_out = true`, wenn der Webhook bis `wait_timeout_seconds` oder zum konfigurierten Standard gewartet hat und der Worker den Lebenszyklus noch nicht geschlossen hat.
- `401` bei Webhook-Authentifizierungsfehler.
- `404` bei unbekannter Workflow-Instanz-ID.
- `404` mit `outcome = rejected_unknown_update` bei unbekanntem dauerhaftem Updatenamen. Trägt der Lauf bereits einen typisierten `WorkflowStarted`-Vertragssnapshot oder kann ein älteres `WorkflowStarted` beim ersten kompatiblen Eingang vervollständigt werden, kann diese Ablehnung aus dauerhaften Laufmetadaten vor jedem Fallback auf die aktive Definition stammen.
- `409` mit `outcome = rejected_not_started`, wenn die Instanz noch keinen aktuellen Lauf hat.
- `409` mit `outcome = rejected_not_active`, wenn der aktuelle Lauf bereits geschlossen ist.
- `409` mit `outcome = rejected_not_current`, wenn die laufbezogene Route einen historischen ausgewählten Lauf adressiert.
- `409` mit `outcome = rejected_pending_signal`, wenn ein früher angenommenes Signal noch vor dem Update angewendet werden muss.
- `422` mit `outcome = rejected_invalid_arguments`, wenn der Update-Payload ein Array ist, aber den deklarierten Vertrag verletzt, etwa durch fehlende oder unbekannte Argumente, Typabweichungen oder Verstöße gegen die Zulässigkeit von null.
- `422` mit `outcome = update_failed`, wenn der Update-Rumpf eine Ausnahme auslöst.
- `422`, wenn `arguments` vorhanden, aber kein Array ist. Dieser Anfrageformfehler wird vor Erstellung einer dauerhaften Befehlszeile abgelehnt.

Aktuelle HTTP-Antwortmatrix der Update-GET-Suchrouten:

- `200`, sobald der Lebenszyklus geschlossen und `update_status` gleich `completed`, `failed` oder `rejected` ist.
- `202`, solange `update_status = accepted` gilt.
- `401` bei Webhook-Authentifizierungsfehler.
- `404` bei unbekannter Workflow-Instanz-ID, ausgewählter Lauf-ID oder `update_id` im angeforderten Bereich.

### Webhooks für Reparatur und endgültige Befehle {#repair-and-terminal-command-webhooks}

Instanz- und laufbezogene Routen für Reparatur und endgültige Befehle stehen
bereit:

```text
POST /webhooks/instances/{workflowId}/repair
POST /webhooks/instances/{workflowId}/cancel
POST /webhooks/instances/{workflowId}/terminate
POST /webhooks/instances/{workflowId}/runs/{runId}/repair
POST /webhooks/instances/{workflowId}/runs/{runId}/cancel
POST /webhooks/instances/{workflowId}/runs/{runId}/terminate
```

`workflowId` ist hier die öffentliche Workflow-Instanz-ID. Instanzrouten lösen
immer den aktuellen aktiven Lauf auf. Laufrouten nehmen zusätzlich eine
ausgewählte `runId` und lehnen historische Auswahlen mit dem dauerhaften
Ergebnis `rejected_not_current` ab. Die Konfiguration `workflows.webhook_auth`
der Startroute gilt auch für diese endgültigen Befehlsrouten.

Reparaturbeispiel:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/repair" \
     -H "Content-Type: application/json"
```

Abbruchbeispiel:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/cancel" \
     -H "Content-Type: application/json"
```

Beendigungsbeispiel:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/terminate" \
     -H "Content-Type: application/json"
```

Annahmeantwort bei Wiederherstellung dauerhaften Fortschritts für den aktuellen
Lauf:

```json
{
  "outcome": "repair_dispatched",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "rejection_reason": null
}
```

Annahmeantwort, wenn der aktuelle Lauf bereits einen intakten dauerhaften
Fortsetzungspfad hat:

```json
{
  "outcome": "repair_not_needed",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "rejection_reason": null
}
```

Antwort bei angenommenem Abbruch:

```json
{
  "outcome": "cancelled",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "rejection_reason": null
}
```

Antwort bei angenommener Beendigung:

```json
{
  "outcome": "terminated",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "rejection_reason": null
}
```

Ablehnungsantwort, wenn die Instanz existiert, aber noch keinen Lauf gestartet
hat:

```json
{
  "outcome": "rejected_not_started",
  "workflow_id": "order-123",
  "run_id": null,
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "instance_not_started"
}
```

Ablehnungsantwort bei bereits geschlossenem aktuellem Lauf:

```json
{
  "outcome": "rejected_not_active",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "run_not_active"
}
```

Ablehnungsantwort, wenn eine laufbezogene Reparatur-, Abbruch- oder
Beendigungsroute einen historischen Lauf adressiert:

```json
{
  "outcome": "rejected_not_current",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": "01J...",
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "run",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "selected_run_not_current"
}
```

Aktuelle HTTP-Antwortmatrix der Reparatur-, Abbruch- und Beendigungs-Webhooks:

- `200` mit `outcome = repair_dispatched`, wenn Reparatur eine überfällige bereite Aufgabe erneut zustellt, eine abgelaufene Lease zurückholt oder eine fehlende noch nicht gestartete dauerhafte Aufgabe neu erstellt. Dies umfasst Workflow-Anwendungsaufgaben für angenommene Updates und Signale, deren Zeilen vor Anwendung des Befehls verloren gingen.
- `200` mit `outcome = repair_not_needed`, wenn der Lauf bereits einen intakten dauerhaften Fortsetzungspfad hat oder der ausgewählte Lauf bereits in einer laufenden Aktivität ohne Aufgabenzeile ist.
- `200` mit `outcome = cancelled` oder `outcome = terminated`, wenn der aktuelle Lauf erfolgreich geschlossen wurde.
- `401` bei Webhook-Authentifizierungsfehler.
- `404` bei unbekannter Workflow-Instanz-ID.
- `409` mit `outcome = rejected_not_started`, wenn die Instanz noch keinen aktuellen Lauf hat.
- `409` mit `outcome = rejected_not_active`, wenn der aktuelle Lauf bereits geschlossen ist.
- `409` mit `outcome = rejected_not_current`, wenn die laufbezogene Route einen historischen ausgewählten Lauf adressiert.

### Describe-Webhooks {#describe-webhooks}

Zum Untersuchen des Workflow-Zustands über HTTP stehen instanz- und
laufbezogene Describe-Routen bereit:

```text
GET /webhooks/instances/{workflowId}/describe
GET /webhooks/instances/{workflowId}/runs/{runId}/describe
```

`workflowId` ist die öffentliche Workflow-Instanz-ID. Die instanzbezogene
Route liefert den Zustand des aktuellen Laufs. Die laufbezogene Route
beschreibt einen bestimmten Lauf anhand seiner ID, auch historische oder
bereits geschlossene Läufe.

Describe ist eine reine Leseuntersuchung. Es erstellt keine dauerhafte
Befehlszeile und spielt den Workflow nicht erneut ab. Es liefert
Instanzmetadaten, aktuellen oder ausgewählten Laufzustand,
Zusammenfassungsfelder und Aktionsverfügbarkeit aus festgeschriebenen
Projektionsdaten.

Describe-Beispiel:

```bash
curl "https://example.com/webhooks/instances/order-123/describe"
```

Antwort für einen aktiven Workflow:

```json
{
  "found": true,
  "workflow_instance_id": "order-123",
  "workflow_type": "order-workflow",
  "workflow_class": "App\\Workflows\\OrderWorkflow",
  "business_key": "order-123",
  "run": {
    "workflow_run_id": "01J...",
    "run_number": 1,
    "is_current_run": true,
    "status": "waiting",
    "status_bucket": "running",
    "closed_reason": null,
    "compatibility": "build-a",
    "connection": "redis",
    "queue": "default",
    "started_at": "2026-04-12T12:00:00+00:00",
    "closed_at": null,
    "last_progress_at": "2026-04-12T12:00:01+00:00",
    "wait_kind": "signal",
    "wait_reason": "Waiting for signal [approved-by]"
  },
  "run_count": 1,
  "actions": {
    "can_signal": true,
    "can_query": true,
    "can_update": true,
    "can_cancel": true,
    "can_terminate": true
  },
  "reason": null
}
```

Antwort für einen beendeten Workflow:

```json
{
  "found": true,
  "workflow_instance_id": "order-123",
  "workflow_type": "order-workflow",
  "workflow_class": "App\\Workflows\\OrderWorkflow",
  "business_key": "order-123",
  "run": {
    "workflow_run_id": "01J...",
    "run_number": 1,
    "is_current_run": true,
    "status": "terminated",
    "status_bucket": "failed",
    "closed_reason": "terminated",
    "compatibility": "build-a",
    "connection": "redis",
    "queue": "default",
    "started_at": "2026-04-12T12:00:00+00:00",
    "closed_at": "2026-04-12T12:01:00+00:00",
    "last_progress_at": "2026-04-12T12:01:00+00:00",
    "wait_kind": null,
    "wait_reason": null
  },
  "run_count": 1,
  "actions": {
    "can_signal": false,
    "can_query": false,
    "can_update": false,
    "can_cancel": false,
    "can_terminate": false
  },
  "reason": null
}
```

Die Aktionsverfügbarkeit zeigt, ob die Operation gerade erfolgreich sein kann:
Geschlossene Läufe nehmen keine Befehle an, ausschließlich entfernte Workflows
können lokal keine Abfragen oder Updates bedienen und nicht aktuelle Läufe
können keine Signale, Updates, Abbrüche oder Beendigungen erhalten.

Beispiel für laufbezogenes Describe:

```bash
curl "https://example.com/webhooks/instances/order-123/runs/01J.../describe"
```

Die laufbezogene Antwort enthält denselben Payload. Bei historischem
ausgewähltem Lauf ist `is_current_run` aber `false` und alle verändernden
Aktionen zeigen `false`.

Antwort bei nicht gefundener Instanz:

```json
{
  "found": false,
  "workflow_instance_id": "order-123",
  "workflow_type": null,
  "workflow_class": null,
  "business_key": null,
  "run": null,
  "run_count": 0,
  "actions": {
    "can_signal": false,
    "can_query": false,
    "can_update": false,
    "can_cancel": false,
    "can_terminate": false
  },
  "reason": "instance_not_found"
}
```

Antwort, wenn die Instanz existiert, aber der ausgewählte Lauf nicht gefunden
wird:

```json
{
  "found": true,
  "workflow_instance_id": "order-123",
  "workflow_type": "order-workflow",
  "workflow_class": "App\\Workflows\\OrderWorkflow",
  "business_key": "order-123",
  "run": null,
  "run_count": 1,
  "actions": {
    "can_signal": false,
    "can_query": false,
    "can_update": false,
    "can_cancel": false,
    "can_terminate": false
  },
  "reason": "run_not_found"
}
```

Aktuelle HTTP-Antwortmatrix der Describe-Webhooks:

- `200`, wenn die Instanz gefunden wird, unabhängig davon, ob der Lauf aktiv, geschlossen oder historisch ist.
- `200`, wenn die Instanz gefunden wird, aber der ausgewählte Lauf nicht existiert (`reason = run_not_found`).
- `401` bei Webhook-Authentifizierungsfehler.
- `404`, wenn die Workflow-Instanz-ID nicht existiert (`reason = instance_not_found`).

### Start-Webhook der Steuerungsebene {#control-plane-start-webhook}

Eine Startroute der Steuerungsebene akzeptiert direkt einen dauerhaften
Workflow-Typschlüssel, ohne eine lokal auflösbare Workflow-Klasse zu verlangen.
Dies ist der bevorzugte Startpfad für externe Verbraucher, die Workflows über
Typschlüssel statt PHP-Klassenaliase steuern.

```text
POST /webhooks/control-plane/start
```

Der Anfragetext akzeptiert:

| Feld | Typ | Erforderlich | Beschreibung |
| --- | --- | --- | --- |
| `workflow_type` | string | ja | Dauerhafter Workflow-Typschlüssel |
| `instance_id` | string | nein | Vom Aufrufer vorgegebene öffentliche Workflow-Instanz-ID |
| `arguments` | string | nein | Mit Codec gekennzeichnete serialisierte Argumente |
| `connection` | string | nein | Überschreibung der Queue-Verbindung |
| `queue` | string | nein | Überschreibung des Queue-Namens |
| `business_key` | string | nein | Vom Aufrufer vorgegebener Geschäftsschlüssel |
| `labels` | object | nein | Sichtbarkeitslabels |
| `memo` | object | nein | Nicht indexierte Metadaten |
| `duplicate_start_policy` | string | nein | `reject_duplicate` oder `return_existing_active` |

Beispielanfrage:

```bash
curl -X POST "https://example.com/webhooks/control-plane/start" \
     -H "Content-Type: application/json" \
     -d '{
           "workflow_type": "order-workflow",
           "instance_id": "order-123",
           "arguments": "{\"orderId\":123}",
           "connection": "redis",
           "queue": "default",
           "business_key": "order-123",
           "labels": {"tenant": "acme"}
         }'
```

Antwort für einen neu gestarteten Workflow:

```json
{
  "started": true,
  "workflow_instance_id": "order-123",
  "workflow_run_id": "01J...",
  "workflow_type": "order-workflow",
  "outcome": "started_new",
  "task_id": "01J...",
  "reason": null
}
```

Fehlt `instance_id`, erzeugt die Engine automatisch eine ULID-basierte
Instanz-ID.

Lässt sich der Workflow-Typschlüssel über die Konfiguration
`workflows.v2.types.workflows` oder ein Attribut `#[Type(...)]` auf eine lokal
auflösbare Klasse abbilden, werden beim Start der vollständige
Befehlsvertragssnapshot und das Routing angewendet. Ist die Klasse lokal nicht
verfügbar, wird die Instanz mit Typschlüssel und explizitem Routing aus den
Optionen erstellt. Befehlsvertragssnapshot und Definitions-Fingerprint werden
auf den Worker verschoben, der die erste Aufgabe übernimmt. Ein externer
Verbraucher kann daher Workflows für Typschlüssel starten, die nur die
Worker-Flotte auflösen kann.

Aktuelle HTTP-Antwortmatrix des Start-Webhooks der Steuerungsebene:

- `202` mit `outcome = started_new` bei Erstellung eines neuen Laufs.
- `200` mit `outcome = returned_existing_active` bei Wiederverwendung des vorhandenen aktiven Laufs.
- `409` mit `outcome = rejected_duplicate` bei Ablehnung eines doppelten Starts.
- `401` bei Webhook-Authentifizierungsfehler.
- `422`, wenn `workflow_type` fehlt oder `instance_id` ungültig ist.

Der Vertrag `WorkflowControlPlane` steht für programmgesteuerte Verwendung
auch als über den Container auflösbarer Singleton bereit. Lösen Sie
`Workflow\V2\Contracts\WorkflowControlPlane` aus dem Laravel-Container auf,
um `start()`, `signal()`, `query()`, `update()`, `cancel()`, `terminate()` und
`describe()` direkt aus PHP-Code, Tests oder Artisan-Befehlen aufzurufen.

Das Webhook-System umfasst explizite aliasbasierte Startannahme,
instanz- und laufbezogene Signal-, Update-, Abfrage-, Describe-, Reparatur-,
Abbruch- und Beendigungs-Webhooks, Aufgabenabfragerouten für Workflow- und
Aktivitätsaufgaben sowie eine Startroute der Steuerungsebene für
typschlüsselbasierte Workflow-Erstellung.
