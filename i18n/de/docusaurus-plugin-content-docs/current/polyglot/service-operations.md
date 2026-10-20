---
title: Namespace-übergreifende Service-Aufrufe
description: Eine Service-Operation veröffentlichen und dauerhaft aus einem anderen Namespace aufrufen.
---

# Namespace-übergreifende Service-Aufrufe {#cross-namespace-service-calls}

Eine Service-Operation, auch Nexus-Operation genannt, ist der unterstützte dauerhafte Aufruf zwischen Namespaces eines Durable Workflow-Clusters. Die Adresse besteht aus Ziel-Namespace und Endpunkt/Service/Operation. Ein Kind-Workflow oder gewöhnliches Signal bleibt in seinem Namespace. Weder ein Queue-Name noch eine andere Sprache ändert diese Regel.

## Eine unterstützte Schnittstelle wählen {#choose-a-supported-authoring-surface}

| Aufrufer | Veröffentlichte Schnittstelle | Ziel-Namespace |
| --- | --- | --- |
| Eingebettetes PHP | `Workflow::serviceOperation()` oder die Hilfsfunktion `serviceOperation()` | `ServiceOperationOptions(targetNamespace: 'billing')` |
| PHP SDK | `WorkflowContext::serviceOperation()` | Array-Option `namespace => 'billing'` |
| Python SDK | `yield context.call_nexus_service(...)` | Schlüsselwort `target_namespace='billing'` |
| Rust SDK | Das Verfassen von Nexus-Warteaufrufen ist nicht veröffentlicht | Verfolgt in [Rust SDK #86](https://github.com/durable-workflow/sdk-rust/issues/86). Ein zurückgehaltener Entwurf ist keine installierbare Unterstützung. |

Verwenden Sie das [eingebettete Beispiel](../features/service-operations.md) für einen Laravel-Workflow, das [PHP-SDK-Beispiel](https://php.durable-workflow.com/build/workflows-activities/) für dessen geradlinige Worker-API oder die [Python-Workflow-Referenz](https://python.durable-workflow.com/reference/workflow/) für Generatoren. Prüfen Sie vor der Bereitstellung den von der verbundenen Runtime angekündigten Vertrag für Service-Operationen. Eine Client-Verwaltungs-API allein beweist keine Unterstützung durch Workflow-Worker.

Im PHP SDK ist die Array-Option derzeit der Weg für Namespace-übergreifende Aufrufe. Eine gleichwertige typisierte Option wird in [PHP SDK #193](https://github.com/durable-workflow/sdk-php/issues/193) verfolgt.

## Die Zieloperation veröffentlichen {#publish-the-target-operation}

Der Ziel-Namespace besitzt Endpunkt, Service, Operation und Handler-Worker. Erstellen Sie zuerst den Namespace und starten Sie einen Worker, der den Ziel-Workflow-Typ auf seiner Queue registriert. Dieser Katalog verwendet Namespace `billing`, Workflow-Typ `billing.invoice` und Queue `billing`.

Katalogänderungen benötigen Administrator-Zugangsdaten. Die Runtime prüft die Berechtigung des Aufrufers separat, wenn ein Workflow mit gültigem Lease seinen Service-Befehl abgibt.

```bash
curl --fail-with-body -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/service-endpoints" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: billing" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"endpoint_name":"billing"}'

curl --fail-with-body -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/service-endpoints/billing/services" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: billing" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"service_name":"invoices"}'

curl --fail-with-body -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/service-endpoints/billing/services/invoices/operations" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: billing" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"operation_name":"create","operation_mode":"sync","handler_binding_kind":"start_workflow","handler_target_reference":"billing.invoice","handler_binding":{"workflow_type":"billing.invoice","queue":"billing"},"deadline_policy":{"timeout_seconds":30}}'
```

Katalognamen werden in Kleinbuchstaben normalisiert. Endpunkt- und Service-Einträge strukturieren die Operation, ersetzen aber keinen echten Handler. Halten Sie einen kompatiblen Worker im Ziel-Namespace verfügbar. Eine Registrierung beweist keine ausgeführte Arbeit.

## Warten und aufgezeichnete Ergebnisse {#waiting-and-recorded-results}

Das PHP SDK verwendet standardmäßig `mode_override=sync` und `wait_for=completed`. Python verwendet `mode='sync'` und `wait_for='completed'`. Beide warten dauerhaft auf einen terminalen Service-Ausgang und spielen das aufgezeichnete Ergebnis oder den typisierten Fehler an der ursprünglichen Aufrufstelle wieder. Ein ausstehender oder gestarteter Aufruf ist kein erfolgreiches Geschäftsergebnis.

Für die reine Annahme verwendet PHP `wait_for='accepted'` oder `mode_override='async'`. Python unterstützt `wait_for='accepted'`, `mode='async'` und die Hilfsfunktion `start_nexus_operation()`. Bewahren Sie die zurückgegebene Aufruf-ID zur Prüfung auf. Ein späterer Abschluss ersetzt die ursprünglich aufgezeichnete Annahme des Aufrufers nicht. Wählen Sie das Warten auf den Abschluss, wenn Workflow-Entscheidungen das Zielergebnis benötigen.

Begrenzen Sie die Service-Ausführung mit der `deadline_policy` des Katalogs wie oben. Sie akzeptiert genau einen positiven Ganzzahlwert `timeout_seconds` oder einen RFC3339-Wert `deadline_at` mit Offset. Die Runtime zeichnet ein `call_deadline_at` ab der ursprünglichen Annahme auf. Replay, Wiederholungen und spätere Katalogänderungen setzen es nicht zurück. Eine null-Richtlinie erzeugt keine neue Service-Frist.

Verwenden Sie `wait_timeout_seconds` des Aufrufers nicht als Ausführungs-Timeout. Eine Warteoption von einer Sekunde ohne Katalogfrist kann weiterhin das Ergebnis eines Ziels liefern, das nach drei Sekunden abschließt. Prüfen Sie nach einem Timeout den ursprünglichen Aufruf und das verknüpfte Ziel. Der Fristablauf beweist nicht, dass externe Auswirkungen ausgeblieben sind. Zielabbruch ist eine separate Richtlinie.

## Fehler, Wiederholungen und Idempotenz {#failures-retries-and-idempotency}

PHP übermittelt terminale Service-Fehler durch `ServiceOperationFailed`; Python löst `NexusOperationFailed` am Yield-Punkt aus. Bewahren Sie bei der Fehlerbehandlung typisierte Details und Aufruf-ID auf. Erwartete Geschäftsfehler kann der Workflow behandeln. Unerwartete Fehler können Workflow-Fehler bleiben.

Die Runtime verwaltet die aufgezeichnete Service-Wiederholungsrichtlinie. Ergänzen Sie keine zweite HTTP-Wiederholungsschleife im Workflow-Code. PHP und Python leiten stabile Schlüssel für gewöhnliche Workflow-Aufrufe ab. Bei einem anwendungsseitigen Schlüssel müssen Ziel, Anfrage und beabsichtigte Operation für Wiederholungen und Replay gleich bleiben. Ein neuer Schlüssel ist eine neue Geschäftsanfrage, keine Wiederherstellung einer verlorenen Bestätigung.

Halten Sie Ziel-Namespace, Katalogadresse, Payload und Warteoptionen für offene Historien stabil. Verwenden Sie einen Workflow-Versionszweig, wenn sich diese dauerhafte Absicht ändert.

## Die Namespace-Grenze durchsetzen {#enforce-the-namespace-boundary}

Der Namespace-übergreifende Standard ist `allow`. Authentifizierung, Rollenprüfungen, andere Grenzrichtlinien und Namespace-Autorisierung gelten weiterhin. Die Aufruferidentität stammt aus dem Workflow mit gültigem Lease. Anwendungseingaben können keinen anderen Aufrufer-Namespace vortäuschen.

Soll ein selbst betriebener PHP Server solche Aufrufe ablehnen, konfigurieren und starten Sie seine API-/Worker-Rollen einheitlich neu:

```bash
DW_SERVICE_BOUNDARY_CROSS_NAMESPACE_DEFAULT=deny
```

Die Richtlinie lehnt den Namespace-übergreifenden Aufruf vor der Handler-Zustellung ab. Aufrufe innerhalb eines Namespace und andere Grenzrichtlinien müssen weiterhin geprüft werden. Diese Variable ersetzt weder Zugangsdaten noch Mandanten-ACLs.

## Den ursprünglichen Aufruf prüfen {#inspect-the-original-call}

Verwenden Sie die [Service-Aufrufdetails und Katalog-API](./server-api-reference.md#service-catalog-admin-apis) oder die [CLI-Prüfung für Service-Aufrufe](./cli-reference.md#service-call-inspection). Bewahren Sie Workflow-/Run-IDs des Aufrufers und Ziel-Service-Aufruf-ID zusammen auf. Eine schreibgeschützte Prüfung fordert keine weitere Ausführung an. Verwenden Sie zur Prüfung einer verlorenen Antwort oder eines Worker-Austauschs die ursprüngliche ID.
