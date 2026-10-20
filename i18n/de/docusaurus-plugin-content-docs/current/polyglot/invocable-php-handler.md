---
sidebar_position: 5
title: Aufrufbarer PHP-Aktivitäts-Handler
description: Mit der PHP-Hilfe InvocableActivityHandler Aktivitäts-Handler hinter einem HTTPS-Endpunkt hosten, der externe Task-Eingabe-Envelopes empfängt und Ergebnis-Envelopes zurückgibt.
tags:
  - external-execution
  - invocable-carrier
  - worker-protocol
keywords:
  - aufrufbarer Aktivitäts-Handler
  - InvocableActivityHandler
  - externe Task-Eingabe
  - externes Task-Ergebnis
  - PHP-Aktivitätsadapter
  - Lambda-Aktivitäts-Handler
---

# Aufrufbarer PHP-Aktivitäts-Handler {#php-invocable-activity-handler}

Mit dem [aufrufbaren HTTP-Transportadapter](./invocable-carrier.md) kann der Server
einen geleasten Aktivitäts-Task per POST an einen HTTPS-Endpunkt senden, statt
auf einen Long-Poll-Worker zu warten. Die PHP-Hilfe
`Workflow\V2\Support\InvocableActivityHandler` ist die Referenzimplementierung,
mit der ein externer PHP-Prozess diese Anfrage in eine durch den Server
abgleichbare Ergebnis-Envelope umwandelt.

Verwenden Sie sie zum Einbinden eines Aktivitäts-Handlers in:

- eine über HTTPS aufgerufene AWS Lambda oder Google Cloud Function
- einen Laravel-Controller hinter einem schlanken HTTP-Dienst
- einen Container mit einem POST-Endpunkt je Aktivitätswarteschlange

Die Hilfe liest die transportneutrale externe Task-Eingabe-Envelope, sucht das
registrierte Callable, erzwingt die Lease-Frist und gibt die transportneutrale
externe Task-Ergebnis-Envelope aus, einschließlich der vom Server erwarteten
Fehlerstrukturen.

## Schnellstart {#quick-start}

Installieren Sie das Durable-Workflow-Paket im externen Prozess, registrieren
Sie je Aktivitäts-Handler-Namen ein Callable und übergeben Sie den
Anfrageinhalt an `handle()`:

```php
use Workflow\V2\Support\InvocableActivityHandler;

$handler = new InvocableActivityHandler([
    'billing.charge-card' => static function (int $amount, string $currency): array {
        // Real charge-card logic. Must be idempotent per task id.
        return [
            'approved' => true,
            'amount' => $amount,
            'currency' => $currency,
        ];
    },
]);

$envelope = json_decode(file_get_contents('php://input'), associative: true);
$result = $handler->handle($envelope);

header('Content-Type: application/vnd.durable-workflow.external-task-result+json');
echo json_encode($result, JSON_UNESCAPED_SLASHES);
```

Der Handler empfängt die Eingabe-Envelope und liefert die Ergebnis-Envelope.
Der Transportvertrag (HTTPS, POST, Authentifizierung, Timeouts, Wiederholungsbudget)
liegt beim aufrufbaren HTTP-Transportadapter. Die PHP-Hilfe verantwortet
Argumentdecodierung, Handler-Aufruf, Fristdurchsetzung, Ergebniscodierung und
Fehlerklassifikation.

## Handler registrieren {#registering-handlers}

Das erste Konstruktorargument ist eine Map mit dem vom Server gesendeten
`task.handler`-Wert als Schlüssel. Dieser Wert ist das Feld `handler` des
passenden Eintrags in der externen Executor-Konfiguration:

```php
new InvocableActivityHandler(
    handlers: [
        'billing.charge-card' => [$billingService, 'chargeCard'],
        'billing.refund' => [$billingService, 'refund'],
        'ops.rotate-key' => static fn (string $keyId): array => $keys->rotate($keyId),
    ],
    carrier: 'billing-lambda',
    resultCodec: 'avro',
);
```

Eine Eingabe mit nicht registriertem `task.handler` erzeugt ein `failed`-Ergebnis
mit `failure.kind = application`, `classification = application_error` und
`type = UnknownActivityHandler`. Die konfigurierte Aktivitäts-Wiederholungsrichtlinie
gilt weiterhin auf Serverseite.

Der optionale Name `carrier` erscheint auf jeder Ergebnis-Envelope unter
`metadata.carrier`, damit der Betrieb die antwortende externe Laufzeitumgebung
erkennt. Verwenden Sie eine stabile Kennung ohne sensible Informationen
(`billing-lambda`, `ops-cloud-run`, `laravel-admin-api`).

Das optionale `resultCodec` steuert die Serialisierung des Rückgabewerts in
`result.payload.blob`. Standard ist `avro`, passend zum bereits von PHP-Workern
für dauerhafte Nutzlasten verwendeten Codec. Der Ergebnis-Codec muss der
`CodecRegistry` des Servers bekannt sein. `protobuf` wird nicht angenommen und
scheitert sofort im Konstruktor.

## Ergebnis-Envelope {#result-envelope}

Bei Erfolg liefert `handle()` die transportneutrale Erfolgs-Envelope:

```json
{
  "schema": "durable-workflow.v2.external-task-result",
  "version": 1,
  "outcome": {
    "status": "succeeded",
    "recorded": true
  },
  "task": {
    "id": "acttask_01HV7D3G3G61TAH2YB5RK45XJS",
    "kind": "activity_task",
    "attempt": 1,
    "idempotency_key": "attempt_01HV7D3KJ1C8WQNNY8MVM8J40X"
  },
  "result": {
    "payload": {
      "codec": "avro",
      "blob": "<base64-encoded payload>"
    },
    "metadata": {
      "content_type": "application/vnd.durable-workflow.result+json"
    }
  },
  "metadata": {
    "handler": "billing.charge-card",
    "carrier": "billing-lambda",
    "duration_ms": 42
  }
}
```

`task.id`, `task.attempt` und `task.idempotency_key` werden aus der
Eingabe-Envelope kopiert, damit der Server das Ergebnis mit der ursprünglichen
Lease abgleichen kann.

Bei einem Fehler liefert `handle()` die Fehler-Envelope. Der Block `failure`
enthält Art, Klassifikation, Nachricht, ursprünglichen PHP-Typ, Stacktrace und
die Angabe, ob der Fehler wiederholbar ist. Ein Fristfehler enthält außerdem
den Namen `deadline` und den Wert `expires_at`:

```json
{
  "schema": "durable-workflow.v2.external-task-result",
  "version": 1,
  "outcome": {
    "status": "failed",
    "retryable": true,
    "recorded": true
  },
  "task": {"id": "...", "kind": "activity_task", "attempt": 1, "idempotency_key": "..."},
  "failure": {
    "kind": "timeout",
    "classification": "deadline_exceeded",
    "message": "Invocable activity task received after lease.expires_at.",
    "type": "ExternalTaskDeadlineExceeded",
    "stack_trace": null,
    "timeout_type": "deadline_exceeded",
    "cancelled": false,
    "details": {
      "deadline": "lease.expires_at",
      "expires_at": "2026-04-22T15:14:02.000000Z"
    }
  },
  "metadata": {"handler": "billing.charge-card", "carrier": "billing-lambda", "duration_ms": 3}
}
```

## Fehlerklassifikation {#failure-taxonomy}

| `failure.kind` | `classification` | Wiederholbar | Auslöser |
| --- | --- | --- | --- |
| `timeout` | `deadline_exceeded` | ja | Lease- oder Eingabefrist war beim Eintreffen der Envelope bereits abgelaufen, oder der Handler kehrte nach Ablauf einer solchen Frist während der Ausführung zurück. |
| `decode_failure` | `decode_failure` | nein | Argumente konnten nicht mit dem deklarierten Codec decodiert werden, eine Fristzeichenfolge war nicht lesbar, der Handler löste `TypeError` / `ValueError` für seine Parameter aus oder die Erfolgsnutzlast ließ sich nicht mit dem konfigurierten Ergebnis-Codec neu codieren. |
| `application` | `application_error` | abhängig von der ausgelösten Ausnahme | Der Handler löste eine Ausnahme aus. `retryable` ist `false`, wenn diese `Workflow\Exceptions\NonRetryableExceptionContract` implementiert, sonst `true`. Die Nachricht ist die Ausnahmemeldung und `type` die Ausnahmeklasse. |
| `application` | `application_error` | nein | `task.kind` ist nicht `activity_task` oder `task.handler` ist nicht in der Map registriert. |

Die Hilfe gibt niemals eine bloße Ausnahme zurück. Jeder Codepfad erzeugt eine
strukturierte Ergebnis-Envelope, damit der aufrufbare Transportadapter die
Antwort deterministisch abgleichen kann.

## Fristen und Idempotenz {#deadlines-and-idempotency}

Die Eingabe-Envelope enthält die aktive `lease.expires_at` und die deklarierten
Aktivitätsfristen (`schedule_to_start`, `start_to_close`, `schedule_to_close`,
`heartbeat`). Die Hilfe prüft sie alle:

- Vor dem Handler-Aufruf führt jede abgelaufene Frist unmittelbar zu einem
  `timeout`-Fehler. `details.deadline` benennt das abgelaufene Feld. Das
  registrierte Callable wird nicht aufgerufen.
- Nach der Rückkehr prüft die Hilfe die Fristen erneut. Ein Handler, der länger
  als seine Lease lief, erzeugt denselben `timeout`-Fehler. Sein Rückgabewert
  wird aus der Envelope verworfen.

Da der Transportadapter die Zustellung wiederholt und die Laufzeitumgebung
nicht gemeldete Leases erneut zustellt, können dieselbe `task.id` und
`task.idempotency_key` mehrfach eintreffen. Handler-Code muss idempotent sein.
Der Idempotenzschlüssel jeder Envelope bleibt bei Wiederholungen desselben
Versuchs stabil.

## Nutzlast-Codecs und externer Speicher {#payload-codecs-and-external-storage}

Argumentnutzlasten treffen unter `payloads.arguments` mit einem `codec`-Feld ein.
Die Hilfe decodiert sie über die `CodecRegistry` des Servers. Der einzige
öffentliche v2-Codec ist `avro`. `json`, unbekannte Codecs sowie ungültige oder
nicht getaggte Blobs werden strikt abgelehnt. JSON bleibt das HTTP-Transportdokument,
kein dauerhafter Nutzlast-Codec.

Übersteigen Workflow-Eingaben die konfigurierte Schwelle für
[externen Nutzlastspeicher](../features/external-payload-storage.md), speichert
der Server die Bytes im konfigurierten Treiber und sendet eine Referenz-Envelope
statt eines Inline-Blobs. Übergeben Sie einen `ExternalPayloadStorageDriver`
an den Konstruktor, damit die Hilfe Referenzen vor dem Handler-Aufruf auflösen kann:

```php
use Workflow\V2\Contracts\ExternalPayloadStorageDriver;
use Workflow\V2\Support\InvocableActivityHandler;

$handler = new InvocableActivityHandler(
    handlers: $handlers,
    carrier: 'billing-lambda',
    resultCodec: 'avro',
    externalStorage: $driver,
);
```

Der Treiber muss denselben Vertrag wie der schreibende Server erfüllen, damit
Referenz, Hash und Codec zusammenpassen. Eine für den externen Prozess nicht
auflösbare Referenz erzeugt `decode_failure` statt einer stillen leeren Nutzlast.

## Einbindung in der Produktion {#production-wiring}

Ein Laravel-Controller, der den Handler hinter einer einzigen POST-Route hostet,
sieht so aus:

```php
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Workflow\V2\Support\InvocableActivityHandler;

final class BillingActivityController
{
    public function __construct(private readonly InvocableActivityHandler $handler) {}

    public function __invoke(Request $request): JsonResponse
    {
        $result = $this->handler->handle($request->all());

        return new JsonResponse(
            data: $result,
            headers: ['Content-Type' => 'application/vnd.durable-workflow.external-task-result+json'],
        );
    }
}
```

Richten Sie die externe Executor-Konfiguration auf die HTTPS-URL vor diesem
Controller und deklarieren Sie eine `auth_ref`, damit die Route authentifiziert
ist. Die Ausnahme für Loopback-HTTP gilt nur für lokale Entwicklungsschritte.

## Verwandte Oberflächen {#related-surfaces}

- [Aufrufbarer HTTP-Transportadapter](./invocable-carrier.md): der serverseitige
  Transportvertrag für Zustellung der Eingabe- und Abgleich der Ergebnis-Envelopes.
- [Oberfläche für externe Ausführung](./external-execution.md): die transportneutrale
  Produktgrenze mit den von der Hilfe implementierten Eingabe- und Ergebnisschemas.
- [Externer Nutzlastspeicher](../features/external-payload-storage.md): wie zu
  große Argumente oder Ergebnisse an einen konfigurierten Treiber ausgelagert
  und als prüfbare Referenz-Envelope dargestellt werden.
- [Worker-Protokoll](./worker-protocol.md): der umfassendere Worker-Plane-Vertrag,
  der den aufrufbaren Transportvertrag neben abfragebasierten Handler-Formen veröffentlicht.
