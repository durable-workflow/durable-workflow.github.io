---
sidebar_position: 1
title: Signale
description: Senden Sie typisierte externe Befehle an laufende Workflows und verstehen Sie Signalvalidierung, Routing und Warteoperationen.
tags:
  - commands
  - signals
  - human-in-the-loop
keywords:
  - Workflow-Signale
  - Signalbefehl
  - Workflow mit menschlicher Beteiligung
---

import SignalSimulator from '@site/src/components/SignalSimulator';

# Signale {#signals}

Mit Signalen können Sie von außen Ereignisse in einem Workflow auslösen.
Das eignet sich zur Reaktion auf externe Ereignisse, für *menschliche
Eingriffe* oder zur Meldung des Abschlusses einer externen Aufgabe.
Verwenden Sie für wiederholte geordnete Eingaben mit dauerhaftem
Cursor-Fortschritt [Nachrichtenströme](./message-streams.md).

## Annahme und Abschluss {#acceptance-and-closure}

`signal_received` bestätigt die dauerhafte Annahme. Es bestätigt nicht, dass
Workflow-Code das Signal verarbeitet hat. Prüfen Sie den aufbewahrten
Signalstatus und die Historie, wenn der Geschäftsvorgang eine Bestätigung
benötigt.

Mit Core 2.7.0 oder einem kompatiblen Server erhalten zulässige Signale, die
während einer entfernten Workflow-Aufgabe angenommen werden, vor erfolgreichem
Abschluss einen Zustellungsdurchlauf. Empfangene instanzbezogene Signale, die
im Befehlsvertrag deklariert sind, werden bei
[Continue-as-new](./continue-as-new.md) mit ursprünglicher Identität,
Argumenten und Reihenfolge übernommen. Ein Signal für einen bestimmten Lauf
wechselt nie zu einem anderen Lauf.

Läufe ohne dauerhafte Signaldeklaration erhalten diese nicht durch spätere
Worker-Registrierung. Kann die Laufzeit die Zustellung nicht herstellen, wird
das angenommene Signal mit dem unten beschriebenen expliziten
Ablehnungsergebnis geschlossen.

Schließt ein Lauf ohne Anwendung eines Signals, erhält das Signal den Status
`rejected` mit `run_closed_before_signal_applied`, einen Abschlusszeitstempel
und ein Historienereignis `SignalRejected`. Dies umfasst ungenutzte gepufferte
Signale bei normalem Abschluss sowie Signale, die vor Fehler, Abbruch oder
Timeout nicht angewendet werden können. Der frühere Annahmebeleg bleibt gültig.
Verwenden Sie ein [Update](./updates.md), wenn der Aufrufer ein aufbewahrtes
Verarbeitungsergebnis statt nur einer Annahme benötigt.

Lassen Sie vor dem Upgrade eines Schreibers auf Core 2.7.0 alle eingebetteten
oder direkt auf die Datenbank zugreifenden Leser ihre Arbeit abschließen und
aktualisieren Sie sie, einschließlich Waterline bei gemeinsamer Datenbank.
Ältere Leser können `SignalRejected` nicht dekodieren. Lassen Sie sie nicht
gegen den neuen Schreiber weiterlaufen und setzen Sie einen Leser nach dem
Speichern dieses Ereignisses nicht zurück.

## Auf benannte Signale warten {#named-signal-waits}

Ein Workflow ruft direkt `await('signal-name')` auf. Der nächste angenommene
Signalbefehl mit diesem Namen setzt den Lauf fort und gibt dem unterbrochenen
Workflow einen deterministischen Wert zurück.

```php
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;
use function Workflow\V2\await;

#[Type('order-approval')]
#[Signal('approved-by', [
    ['name' => 'approvedBy', 'type' => 'string'],
])]
final class OrderApprovalWorkflow extends Workflow
{
    public function handle(): array
    {
        $approvedBy = await('approved-by');

        return [
            'approved_by' => $approvedBy,
            'workflow_id' => $this->workflowId(),
            'run_id' => $this->runId(),
        ];
    }
}
```

Lösen Sie das Signal aus PHP durch Adressieren der öffentlichen Instanz-ID aus:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$result = $workflow->attemptSignalWithArguments('approved-by', [
    'approvedBy' => 'Taylor',
]);

$result->accepted();    // true
$result->outcome();     // "signal_received"
$result->commandId();   // Durable signal-command id
$result->instanceId();  // "order-123"
```

Signalverhalten:

- Deklarieren Sie jeden externen Signalnamen vorab mit einem wiederholbaren Klassenattribut `#[Signal('signal-name')]`. Optional können Sie einen geordneten Parametervertrag hinzufügen.
- Signalbefehle adressieren die öffentliche Workflow-Instanz-ID, nicht eine Lauf-ID. Continue-as-new-Ketten behalten dadurch dieselbe öffentliche Signalroute.
- Mit Parametervertrag werden ungültige Payloads bei der Annahme als `rejected_invalid_arguments` mit maschinenlesbaren `validation_errors` abgelehnt.
- Ohne Vertrag gibt `await('name')` bei fehlenden Argumenten `true`, bei einem Argument dessen Wert und bei mehreren Argumenten das vollständige Argumentarray zurück.
- Unbekannte Signalnamen werden als `rejected_unknown_signal` abgelehnt. Signale an geschlossene oder nicht gestartete Instanzen werden als `rejected_not_active` beziehungsweise `rejected_not_started` abgelehnt.

## Signalnutzdaten kompatibel weiterentwickeln {#evolve-a-signal-payload}

Verwenden Sie ein einziges deklariertes Map-Argument für Anwendungsdaten, die kompatible Erweiterungen benötigen. Dieses Beispiel behält `schema_version: 1` für die optionale, rein informative `note` bei. Ein alter Sender lässt sie weg; ein neuerer Leser verwendet `null`. Ein älterer Leser kann sie ignorieren, ohne die Freigabeentscheidung zu ändern. Verwenden Sie ein ignoriertes Feld nicht für Änderungen, die Berechtigungen oder Geschäftsverhalten beeinflussen müssen.

```php
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;
use function Workflow\V2\await;

#[Type('map-approval')]
#[Signal('reviewed', [
    ['name' => 'payload', 'type' => 'array', 'allows_null' => false],
])]
final class MapApprovalWorkflow extends Workflow
{
    public function handle(): array
    {
        $payload = await('reviewed');
        if (! is_array($payload) || array_is_list($payload)
            || ($payload['schema_version'] ?? null) !== 1) {
            return ['status' => 'rejected_payload', 'reason' => 'unsupported_shape_or_version'];
        }
        if (! in_array($payload['decision'] ?? null, ['approved', 'rejected'], true)) {
            return ['status' => 'rejected_payload', 'reason' => 'invalid_decision'];
        }
        $note = $payload['note'] ?? null;
        if ($note !== null && ! is_string($note)) {
            return ['status' => 'rejected_payload', 'reason' => 'invalid_note'];
        }

        return ['status' => 'processed', 'decision' => $payload['decision'], 'note' => $note];
    }
}
```

Beide Sender verwenden denselben deklarierten Parameter `payload`:

```php
use Workflow\V2\WorkflowStub;

$oldPayload = ['schema_version' => 1, 'decision' => 'approved'];
$newPayload = [...$oldPayload, 'note' => 'review λ'];

$receipt = WorkflowStub::load('review-123')->attemptSignalWithArguments(
    'reviewed',
    ['payload' => $newPayload], // An old sender passes $oldPayload here.
);
```

Die Deklaration prüft das äußere Argument. Ein skalarer Wert statt `payload` wird bei der Annahme abgelehnt. Der Typ `array` validiert weder verschachtelte Felder noch unterscheidet er eine PHP-Liste von einer Map mit Zeichenkettenschlüsseln. Der Workflow prüft diese Anwendungsregeln vor der Geschäftsverarbeitung. Eine nicht unterstützte Version oder eine ungültige `note` kann daher dauerhaft angenommen werden und anschließend `rejected_payload` als Workflow-Ergebnis liefern. Dieses Ergebnis ist von der Empfangsbestätigung `signal_received` getrennt.

Halten Sie Pflichtfelder und ihre Bedeutung stabil. Legen Sie fest, ob ein fehlender Wert und explizites `null` dasselbe bedeuten; für `note` gilt das hier. Bewahren Sie Decoder für gespeicherte ältere Werte auf. Eine inkompatible Struktur oder Bedeutung erfordert eine neue Anwendungsversion und einen ausdrücklichen Kompatibilitätsplan, nicht nur ein weiteres optionales Feld.

Ein Lauf behält die beim Start gespeicherten Signaldeklarationen und Standardwerte. Eine Änderung der aktuellen Handler-Signatur oder eines Standardwerts schreibt diesen Vertrag nicht um. Ein weiteres Signalargument auf oberster Ebene ist etwas anderes als ein neuer Schlüssel in der bestehenden Map. Gehen Sie nicht davon aus, dass ein alter Lauf es annimmt oder den neuen Standardwert übernimmt. Neue Läufe können eine neue Deklaration speichern, während alte Läufe ihre bisherige behalten.

Dieses Anwendungsformat ist vom festen [Avro-Value-Wire-Schema](/docs/polyglot/avro-value-protocol) getrennt. PHP-, Python- und Rust-Clients im Service-Modus kodieren unterstützte Map-, Listen- und Skalarwerte über ihre SDKs. Eine Python-Dataclass, ein PHP-Domänenobjekt oder ein Rust-Struct benötigt den jeweiligen expliziten Werteadapter. Ein Anwendungsversion-Feld ist keine Schema-Registry. Die APIs für den Service-Modus finden Sie in den [SDK-Referenzen](/docs/sdk-neutrality).

Nutzdatenkompatibilität berechtigt eine geänderte Workflow-Definition außerdem nicht dazu, einen bestehenden Lauf zu übernehmen. Halten Sie den erforderlichen kompatiblen Worker beziehungsweise Build verfügbar. Die Einschränkung für Quellcode-Fingerprints in Server 2.9.7 wird separat in [Server #518](https://github.com/durable-workflow/server/issues/518) verfolgt. Dieses Rezept umgeht sie nicht und verspricht nicht, dass ein aktueller Handler den Code des alten Laufs ersetzt. Verwenden Sie [Workflow-Versionierung](./versioning.md) für replay-sichere Codeänderungen innerhalb des unterstützten Routing-Vertrags der Laufzeit.

Dieselbe Grenze für gespeicherte Werte gilt für Aktivitätsargumente und -ergebnisse: Wiederholungen und Replay können auf ältere Strukturen treffen. Halten Sie deren Adapter mit diesen Werten kompatibel, statt die Historie umzuschreiben oder sich auf aktuelle Modellstandardwerte zu verlassen.

## Nach einer ungewissen Antwort {#after-an-uncertain-response}

Ein Timeout oder Antwortverlust kann nach dauerhafter Annahme eines Signals
auftreten. Eine spätere Antwort „Lauf geschlossen“ oder „nicht gefunden“
beschreibt diese spätere Anfrage. Sie belegt nicht, ob das ursprüngliche Signal
angewendet wurde. Auch eine Statusprüfung vor dem Senden lässt eine Lücke, in
der der Workflow schließen oder sich als neuer Lauf fortsetzen kann.

Bewahren Sie bei der Untersuchung ungewisser Zustellung ursprünglichen
Namespace, Workflow-Identität, Signalnamen, Argumente und
Anwendungs-Operationsschlüssel auf. Das Wiederholen eines Signals muss dem
tatsächlichen Duplikatvertrag des Ziels folgen. Starten Sie keinen
Ersatzworkflow, nur weil die Wiederholung abgelehnt wurde.

Die Untersuchung aufbewahrter Updates und anwendungseigenen Abgleich beschreibt
[Wiederherstellung nach ungewissen Befehlen](./updates.md#recover-after-an-uncertain-response).

## Absenderidentität und Autorisierung {#sender-identity-and-authorization}

`approvedBy` sind Anwendungsdaten. Die Zeichenfolge `Taylor` im Beispiel
beweist keinen authentifizierten Absender. Ein `#[Signal]`-Vertrag validiert
Signalname und Argumente. Ihre Laravel-Anwendung muss den Aufrufer vor
Signalannahme authentifizieren und die Operation autorisieren.

Ein Genehmigungsendpunkt kann etwa den authentifizierten Benutzer und eine
Bestellrichtlinie verwenden. Diese Anwendung definiert ein `Order`-Modell mit
gespeicherten Feldern `workflow_instance_id` und `workflow_namespace` und
registriert eine `approve`-Richtlinie, die den Zugriff des Benutzers auf diese
Bestellung prüft. Der Endpunkt übernimmt weder Akteur noch
Workflow-Routingwerte aus dem Anfragetext:

```php
use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Route;
use Workflow\V2\CommandContext;
use Workflow\V2\WorkflowStub;

Route::post('/orders/{order}/approve', function (Request $request, Order $order) {
    $user = $request->user();
    Gate::forUser($user)->authorize('approve', $order);

    $actorId = (string) $user->getAuthIdentifier();
    $context = CommandContext::phpApi()->withPrincipal('user', $actorId);

    $result = WorkflowStub::load(
        $order->workflow_instance_id,
        $order->workflow_namespace,
    )->withCommandContext($context)->attemptSignalWithArguments('approved-by', [
        'approvedBy' => $actorId,
    ]);

    return response()->json([
        'accepted' => $result->accepted(),
        'outcome' => $result->outcome(),
        'command_id' => $result->commandId(),
    ], $result->accepted() ? 202 : 409);
})->middleware('auth');
```

Die Richtlinienprüfung erfolgt vor Laden oder Signalisieren des Workflows.
Jeder Genehmigungseinstiegspunkt muss dieselbe Anwendungsrichtlinie durchsetzen,
einschließlich Webhook- oder Verwaltungsendpunkten, die dieses Signal senden
können. Im Workflow empfängt `await('approved-by')` das aufgezeichnete Argument.
Es gibt kein authentifiziertes Absenderobjekt zurück und prüft Berechtigungen
nicht erneut.

Die Auditidentität des Befehls ist von diesem Argument getrennt.
`withCommandContext()` zeichnet den Kontext am durch `commandId()`
identifizierten `WorkflowCommand` auf. Sein `context.principal` sowie die
Zugriffsmethoden `principalType()`, `principalId()` und `principalLabel()`
unterstützen hostseitige Audituntersuchungen. Verknüpfte Historie und
Betreiberansichten können die aufgezeichnete Befehlszuordnung anzeigen.
Fehlende Zuordnung belegt keine Absenderidentität.

`CommandContext::withPrincipal()` zeichnet auf, was vertrauenswürdiger Hostcode
liefert. Es authentifiziert keinen Benutzer und autorisiert kein Signal.
Halten Sie diesen Kontext außerhalb aufrufergesteuerter Eingaben. Verwenden
Sie keine Live-HTTP-Sitzung oder Datenbankabfrage aktueller Berechtigungen im
deterministischen Workflow-Replay.

SDK-Aufrufe im Service-Modus verwenden statt dieser eingebetteten Route die
HTTP-Autorisierungsgrenze des Servers. Zugangsdaten, vertrauenswürdige Gateways
und Auditidentität beschreibt
[Signalautorisierung und Zuordnung](/docs/polyglot/namespace-auth-workers#signal-authorization-and-attribution).

<SignalSimulator />

**Wichtig:** Die Funktion `await()` sollte nur in einem Workflow verwendet
werden, nicht in einer Aktivität.

Warten auf ein Prädikat über dauerhaftem Zustand beschreibt
[Auf Bedingungen warten](./condition-waits.md). `await` mit Timeout beschreibt
[Signal + Timer](./signal+timer.md). Wiederholte Inbox-/Outbox-Abläufe
beschreibt [Nachrichtenströme](./message-streams.md).

## Dieses Muster ausführen {#run-this-pattern}

Der per Webhook gestartete Workflow in der [Beispielanwendung](/docs/sample-app)
ist die ausführbare Referenz für das hier beschriebene Warten auf benannte
Signale:

```bash
php artisan app:webhook
```

`App\Workflows\Webhooks\WebhookWorkflow` startet über einen HTTP-Webhook-Eingang
und wartet bei `await('ready')`, bis das passende Signal eintrifft. Öffnen Sie
Waterline während dieser Wartezeit. Das Ereignis `SignalReceived`
erscheint in dem Moment, in dem das Signal angenommen wird.
