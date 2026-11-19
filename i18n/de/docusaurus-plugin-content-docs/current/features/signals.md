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

## Namespace-Grenze {#namespace-boundary}

Ein gewöhnliches Signal adressiert einen Workflow im Namespace des Clients. Auch ein Kind-Handle behält seinen ursprünglichen Namespace. Verwenden Sie für eine veröffentlichte Operation eines anderen Namespace eine [Service-Operation](./service-operations.md). Eine andere Workflow-ID oder Queue verleiht keine Namespace-übergreifende Berechtigung.

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

## In einer Operation starten und signalisieren {#signal-with-start}

`signalWithStart()` startet den Workflow oder verwendet seinen offenen Lauf
wieder und zeichnet das Signal in diesem Lauf auf, in einer Transaktion. Ein
separates `start()` mit folgendem `signal()` lässt eine Lücke, in der der Lauf
schließen kann und das Signal abgelehnt wird:

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

$result = WorkflowStub::make(OrderApprovalWorkflow::class, 'order-123')
    ->signalWithStart('approved-by', ['approvedBy' => 'Taylor'], StartOptions::returnExistingActive());

$result->startOutcome(); // "started_new" or "returned_existing_active"
```

Ist der aktuelle Lauf geschlossen, startet eingebettetes Signal-with-start
danach einen neuen Lauf, und der geschlossene Lauf behält sein Ergebnis.
Clients im Service-Modus verwenden das Signal-with-start des Servers. Es
benötigt den nativen Server 3.15.0 oder neuer und lehnt einen geschlossenen
Lauf ab, sofern der Aufrufer keinen neuen anfordert. Die Aufrufe der PHP-,
Python- und Rust-SDKs finden Sie unter [Signal-with-start](/docs/polyglot/workflow-signals#signal-with-start).

## Einen anderen Workflow signalisieren {#signal-another-workflow}

:::note Noch nicht veröffentlicht
Dauerhaftes Signal-external für eingebettete Workflows befindet sich in
[Workflow #1247](https://github.com/durable-workflow/workflow/pull/1247) und wurde noch nicht veröffentlicht. Seine API
ist experimentell.
:::

Workflow-Code kann mit `signalExternalWorkflow()` einen anderen Workflow in
seinem Namespace signalisieren. Die Anfrage und ihr Ergebnis werden einmal in
der Historie dieses Workflows aufgezeichnet, in derselben Transaktion, die das
Signal beim Ziel annimmt. Replay gibt das aufgezeichnete Ergebnis zurück, ohne
erneut zu senden:

```php
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;
use function Workflow\V2\signalExternalWorkflow;

#[Type('order-approver')]
final class OrderApproverWorkflow extends Workflow
{
    public function handle(string $orderId): array
    {
        $result = signalExternalWorkflow($orderId, 'approved-by', ['Taylor']);

        if (! $result->delivered()) {
            // target_not_found, target_closed or rejected, with a reason
            return ['skipped' => $result->outcome->value, 'reason' => $result->reason];
        }

        return ['delivered_to' => $result->targetRunId];
    }
}
```

- Ein fehlendes, geschlossenes oder ablehnendes Ziel ergibt ein
  zurückgegebenes `ExternalSignalResult`, keine Ausnahme. Ergebnisse und Gründe
  entsprechen denen des Servers, die im
  [Leitfaden zum Service-Modus](/docs/polyglot/workflow-signals#signal-another-workflow) aufgeführt sind.
- Übergeben Sie eine Lauf-ID als viertes Argument, um nur diesen Lauf zu
  signalisieren. Das Handle eines Kind-Workflows hat `signalDurably()`, zum
  Beispiel `$this->lastChild()->signalDurably('approved-by', 'Taylor')`. Das
  `signal()` des Handles sendet weiterhin direkt, außerhalb der Historie des
  Eltern-Workflows, und kann beim Replay des Eltern-Workflows erneut senden.
- Beim Ziel ist es ein gewöhnliches Signal, das dem sendenden Lauf zugeordnet
  ist, mit dem Schlüssel `workflow-signal:<sender run id>:<sequence>`.
  Anwendungen können dieses Anfrage-ID-Präfix nicht verwenden.
- Der Signalname folgt den Regeln des Servers (nicht leer, keine
  Steuerzeichen, höchstens 191 Zeichen und 255 Bytes). Ein abgelehnter Name
  löst im Workflow-Code `InvalidExternalSignalException` aus, bevor etwas
  aufgezeichnet wird.
- Eine Änderung von Ziel, Lauf, Signalname oder Argumenten an einem
  aufgezeichneten Schritt blockiert das Replay als Abweichung der
  Historienstruktur.

Signale bleiben innerhalb des Namespace. Verwenden Sie eine
[Service-Operation](./service-operations.md), um einen anderen Namespace zu
erreichen. Verwenden Sie eine Aktivität, wenn Sie Signal-with-start aus
Workflow-Code benötigen, und geben Sie ihr eine stabile Anfrage-ID, damit eine
wiederholte Aktivität nicht zweimal signalisiert.

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
Anwendungs-Operationsschlüssel auf. Starten Sie keinen Ersatzworkflow, nur weil
die Wiederholung abgelehnt wurde.

### Mit demselben Befehlsschlüssel wiederholen {#retry-with-the-same-command-key}

Ein Befehlsschlüssel macht die Wiederholung selbst sicher. Wählen Sie für jedes
logische Signal einen Schlüssel, etwa `approve-order-123`, und speichern Sie ihn
vor dem Senden in Ihrem Operationsdatensatz. Ab Workflow 2.18.0 hängen Sie ihn
mit `withRequestId()` an. Senden Sie nach einer verlorenen Antwort dasselbe
Signal mit demselben Schlüssel, Namen, denselben Argumenten und demselben Ziel
erneut:

```php
use Workflow\V2\WorkflowStub;

$result = WorkflowStub::load('order-123')
    ->withRequestId('approve-order-123')
    ->attemptSignalWithArguments('approved-by', ['approvedBy' => 'Taylor']);

if ($result->requestIdConflict()) {
    // The key already names a different signal. Nothing was recorded.
    $retainedCommandId = $result->conflict()['retained_command_id'];
} elseif ($result->retained() && ! $result->intentVerified()) {
    // A legacy receipt: the original admission, not proof that this retry matches it.
} else {
    $result->commandId(); // The same signal command on every matching retry.
}
```

- Eine Wiederholung mit demselben Schlüssel, Signalnamen, denselben typisierten
  Argumenten und demselben expliziten Laufziel gibt den ursprünglichen Beleg
  zurück und zeichnet nichts auf. `retained()` ist true. Das
  funktioniert auch, nachdem der Lauf geschlossen oder als neuer Lauf
  fortgesetzt wurde, solange der ursprüngliche Befehl aufbewahrt wird.
- Derselbe Schlüssel mit anderem Namen, anderen Argumenten oder anderem Laufziel
  wird abgelehnt: `requestIdConflict()` ist true und `outcome()` ist
  `rejected_request_id_conflict`. `conflict()` nennt den aufbewahrten Befehl und
  die abweichenden Teile. Nichts wird aufgezeichnet, und der Schlüssel behält
  seinen ursprünglichen Beleg. Senden Sie die ursprüngliche Eingabe, um diesen
  Beleg zu lesen, oder verwenden Sie für neue Eingaben einen neuen Schlüssel.
- Ein Beleg, der angenommen wurde, bevor Workflow die Befehlsabsicht
  aufzeichnete, wird mit `retained()` true und
  `intentVerified()` false zurückgelesen. Das ist die ursprüngliche Annahme,
  kein Nachweis, dass die Argumente dieser Wiederholung mit ihr übereinstimmen.
  Prüfen Sie ihre Identitäten, bevor Sie sie als Ihr Signal behandeln.
- Schlüssel umfassen 1 bis 255 Unicode-Zeichen und werden exakt verglichen,
  ohne Groß-/Kleinschreibungsangleichung oder Normalisierung. Ein leerer, zu
  langer oder ungültiger UTF-8-Schlüssel löst vor der Annahme
  `InvalidCommandRequestIdException` aus. Ein ohne Schlüssel gesendetes Signal
  ist immer ein neues Signal.

Wenden Sie vor dem Upgrade die `intent_digest`-Migration von Workflow an, lassen
Sie dann alle schreibenden Prozesse der eingebetteten Datenbank auslaufen und
aktualisieren Sie sie gemeinsam. Ältere Releases vergleichen die Absicht nicht: Ein wiederholter
Signalschlüssel zeichnet dort ein zweites Signal auf.

Clients im Service-Modus senden den Schlüssel als `request_id` im Body. Native
Server 3.9.2 und neuer wenden dieselben Regeln an und ergänzen für einige
Legacy-Schlüssel eine Ablehnung `request_id_ambiguous`. Den HTTP-Vertrag und die
Aufrufe für PHP, Python, Rust und die CLI beschreibt
[Befehlsschlüssel für Signale und Updates](/docs/polyglot/server-api-reference#command-keys).

Ein Befehlsschlüssel nimmt das Signal einmal an. Er sorgt nicht dafür, dass die
vom Signal ausgelösten Aktivitäten genau einmal ausgeführt werden. Die
Untersuchung aufbewahrter Updates und anwendungseigenen Abgleich beschreibt
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
