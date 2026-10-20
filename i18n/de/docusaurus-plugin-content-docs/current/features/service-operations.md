---
title: Service-Operationen
description: Eine Operation in einem anderen Namespace aus einem eingebetteten PHP-Workflow aufrufen.
---

# Service-Operationen {#service-operations}

Verwenden Sie eine Service-Operation, wenn ein Workflow ein dauerhaftes Ergebnis eines Services in einem anderen Namespace benötigt. Der Aufrufer adressiert einen registrierten Endpunkt, Service und eine Operation. Die Runtime zeichnet Aufruf und Ergebnis auf, damit ein Ersatz-Worker dasselbe Ergebnis wiedergeben kann.

Kind-Workflows und Signale bleiben in ihrem ursprünglichen Namespace. Ein anderer Typname oder eine andere Task Queue überschreitet diese Grenze nicht. Für veröffentlichte Arbeit in einem anderen Namespace desselben Durable Workflow-Clusters verwenden Sie eine Service-Operation.

## Aus eingebettetem PHP aufrufen {#call-from-embedded-php}

Registrieren Sie den Zielkatalog und dessen Handler, bevor Sie den aufrufenden Workflow starten. Der [Leitfaden zum Service-Modus](../polyglot/service-operations.md) erläutert den gemeinsamen Katalog, die Grenzrichtlinie und die unabhängig veröffentlichten SDK-Schnittstellen.

Die eingebettete Hilfsfunktion verwendet den eigenen Service-Katalog und die Steuerungsebene der Anwendungs-Runtime. Sie verbindet sich nicht selbst mit einem entfernten Server. Verwenden Sie das PHP SDK für einen aufrufenden Remote-Worker im Service-Modus.

```php
use Workflow\V2\Support\ServiceOperationOptions;
use Workflow\V2\Workflow;

final class CreateInvoice extends Workflow
{
    public function handle(int $invoiceId): mixed
    {
        $call = self::serviceOperation(
            'billing',
            'invoices',
            'create',
            [$invoiceId],
            new ServiceOperationOptions(
                targetNamespace: 'billing',
                modeOverride: 'sync',
                waitFor: 'completed',
            ),
        );

        return $call->responsePayload;
    }
}
```

`serviceOperation()` liefert ein `ServiceOperationResult` mit dauerhafter `serviceCallId`, Lebenszyklusstatus, Ausgang und Antwortdaten. Ein terminaler Service-Fehler oder Abbruch wird an der ursprünglichen Aufrufstelle als typisierte Workflow-Ausnahme wiederhergestellt. Halten Sie die Fehlerzuordnungen der Anwendung für das Replay verfügbar.

## Festlegen, worauf der Aufrufer wartet {#choose-what-the-caller-waits-for}

Verwenden Sie `modeOverride: 'sync'` und `waitFor: 'completed'`, wenn die nächste Workflow-Entscheidung das Service-Ergebnis benötigt. Der Workflow wartet dauerhaft, solange der Aufruf nicht terminal ist.

Verwenden Sie `modeOverride: 'async'` oder `waitFor: 'accepted'`, wenn die Annahme genügt. Der zurückgegebene Datensatz identifiziert den ursprünglichen Aufruf. Annahme bedeutet keine abgeschlossene Geschäftsarbeit. Ein späteres Zielergebnis überschreibt das bereits aufgezeichnete Ergebnis eines nur auf Annahme wartenden Aufrufers nicht. Wählen Sie von Anfang an die Abschlusswartezeit, wenn der Workflow das terminale Ergebnis benötigt.

## Den aufgezeichneten Vertrag bewahren {#preserve-the-recorded-contract}

Halten Sie Ziel-Namespace, Endpunkt/Service/Operation, Anfrage und Warteoptionen für einen offenen Run stabil. Verwenden Sie Workflow-Versionszweige für inkompatible Änderungen. Das Replay nutzt die aufgezeichnete Aufrufidentität und das Ergebnis, anstatt eine weitere Ausführung anzufordern.

Ein expliziter Idempotenzschlüssel ist eine dauerhafte Geschäftsidentität. Verwenden Sie ihn nur für dieselbe beabsichtigte Operation und Anfrage erneut. Ändern Sie ihn nicht allein wegen einer verlorenen Antwort oder einer abgelaufenen Wartezeit. Prüfen Sie den ursprünglichen Aufruf, bevor Sie eine weitere Geschäftsoperation als sicher einstufen.

Begrenzen Sie die Service-Ausführung mit der `deadline_policy` der Katalogoperation. Deren `timeout_seconds` wird einmal ab der ursprünglichen Annahme in `call_deadline_at` aufgelöst. Alternativ dient `deadline_at` mit Zeitzonenoffset. Worker-Austausch und Replay erneuern diese Frist nicht. `waitTimeoutSeconds` ist nicht die Ausführungsfrist des Services. Stimmen Sie Workflow- und Service-Budgets ab und prüfen Sie das Ziel nach einem Timeout, statt anzunehmen, dass externe Auswirkungen ausgeblieben sind.

## Verwandte Leitfäden {#related-guides}

- [Namespace-übergreifende Service-Aufrufe](../polyglot/service-operations.md)
- [Kind-Workflows](./child-workflows.md)
- [Versionierung](./versioning.md)
- [Fehler und Wiederherstellung](../failures-and-recovery.md)
