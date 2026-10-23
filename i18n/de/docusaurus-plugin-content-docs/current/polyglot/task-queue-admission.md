---
sidebar_position: 6
title: Task-Warteschlangenzulassung
description: Worker-Slots, serverseitige Warteschlangenbudgets und Rückstaukontrolle für Abfrage-Tasks auf dem eigenständigen Server abstimmen.
tags:
  - admission
  - operations
  - task-queues
  - bounded-growth
keywords:
  - Task-Warteschlangenzulassung
  - Zuweisungsbudget
  - Warteschlangengrenzen
  - begrenzte Worker-Warteschlangen
---

# Task-Warteschlangenzulassung {#task-queue-admission}

Die Task-Warteschlangenzulassung verhindert, dass eine Warteschlange, ein Mandant oder eine nachgelagerte Abhängigkeit die gesamte Worker-Flotte verbraucht. Durable Workflow bietet Zulassung auf drei Ebenen:

- Worker-Registrierungen melden lokale Workflow- und Aktivitäts-Slots.
- Der Server kann aktive Workflow- und Aktivitäts-Leases je Namespace und Warteschlange begrenzen.
- Der Server kann Workflow- und Aktivitätszuweisungen pro Minute je Namespace und Warteschlange begrenzen.
- Der Server kann Zuweisungen pro Minute für benannte nachgelagerte Budgetgruppen begrenzen, die mehrere Warteschlangen gemeinsam nutzen.
- Abfrage-Tasks haben eine begrenzte Warteschlange für ausstehende Tasks, damit synchrone Lesezugriffe schnell fehlschlagen, statt unbegrenzt zu wachsen.

Verwenden Sie Zulassungssteuerung, wenn eine Warteschlange an eine ratenbegrenzte Abhängigkeit gebunden ist, Mandanten denselben Server teilen oder der Betrieb belegen muss, warum ein Workflow wartet.

Zulassung baut auf dem Matching-Vertrag auf. [Task-Zuordnung und -Zuweisung](/docs/polyglot/task-matching-dispatch) erklärt, wie bereite Arbeit gefunden und geleast wird, bevor diese Budgets über die Zulassung des nächsten Tasks entscheiden.

## Wie das Budget angewendet wird {#how-the-budget-is-applied}

Workflow- und Aktivitätsabfragen beginnen mit den Workern, die aktuell für einen Namespace und eine Task-Warteschlange registriert sind. Jeder Worker meldet `max_concurrent_workflow_tasks` und `max_concurrent_activity_tasks`. Der Server summiert aktive, nicht veraltete Worker, um die registrierte Slot-Kapazität der Warteschlange zu berechnen.

Serverseitige Grenzen für aktive Leases und Zuweisungsraten sind optional. Sind sie konfiguriert, prüft der Server eine kurzlebige Cache-Sperre, bevor er den nächsten Workflow- oder Aktivitäts-Task verleast. Ist die Grenze aktiver Leases erreicht, liefert diese Abfrage keinen Task, statt das Budget laufender Arbeit zu überschreiten. Ist die Zuweisungsgrenze pro Minute erreicht, liefern Abfragen keinen Task, bis das nächste Minutenfenster Kapazität hat. Nachgelagerte Budgetgruppen wenden dasselbe Minutenlimit auf jede Warteschlange im Namespace mit gleichem `dispatch_budget_group`-Namen an.

Abfrage-Tasks sind anders: Die Control Plane reiht einen kurzlebigen Abfrage-Task ein und wartet auf die Worker-Antwort. `DW_QUERY_TASK_MAX_PENDING_PER_QUEUE` begrenzt ausstehende Abfrage-Tasks je Namespace und Task-Warteschlange. Bei voller Warteschlange liefern neue Abfragen `query_task_queue_full` mit HTTP `429`. Kann der Cache die zum Ändern der Abfrage-Task-Warteschlange nötige Sperre nicht bereitstellen, liefern Abfragen `query_task_queue_unavailable` mit HTTP `503`.

## Wiederholungslast und Budgets für nachgelagerte Dienste {#retry-load-and-downstream-budgets}

**Erstversuche und Wiederholungen zählen gleichermaßen** gegen Dispatch-Obergrenzen von Queue, Namespace und Budgetgruppe. Das Budget zählt erfolgreich bezogene Aktivitätstask-Versuche über Workflows hinweg, nicht nur Wiederholungen. Bei voller Grenze wartet die Arbeit; die Grenze allein lässt die Aktivität nicht scheitern. Schedule-to-start-, Schedule-to-close- und Workflow-Fristen laufen weiter, sodass Warten ein konfiguriertes Zeitlimit aufbrauchen kann.

Die Grenze misst Versuche pro Minute, weder Erfolgsquote noch Dienstzustand. Sie öffnet keinen Circuit Breaker. Ein Claim kann durch interne Wiederholungen der Aktivität oder des HTTP-Clients mehrere HTTP-Aufrufe erzeugen; begrenzen Sie diese separat. Auch ein sofort abgelehnter Versuch ohne Dienstaufruf verbraucht einen Claim.

Beispielsweise teilen sich im Namespace `production` die gewöhnlichen Aktivitätsqueues `payments` und `refunds` ein `payment-api`-Budget von 20 Claims pro Minute. Konfigurieren Sie dieselbe Gruppengrenze für jede beteiligte Queue; andere Queues gehören nicht dazu. Dies ist eine Minutenbucket-Grenze, keine geglättete Rate oder reservierte Quote:

```bash
DW_TASK_QUEUE_ADMISSION_OVERRIDES='{
  "production:payments": {
    "activity_tasks": {
      "dispatch_budget_group": "payment-api",
      "max_dispatches_per_minute_per_budget_group": 20
    }
  },
  "production:refunds": {
    "activity_tasks": {
      "dispatch_budget_group": "payment-api",
      "max_dispatches_per_minute_per_budget_group": 20
    }
  }
}'
```

Kombinieren Sie die Server-Grenze mit begrenzten Aktivitätsversuchen und Backoff. Dieses Python-SDK-2.9.0-Beispiel setzt einen asynchronen gemeinsamen Breaker und Zahlungsclient Ihrer Anwendung aus `myapp.payments` voraus. Begrenzen Sie dort I/O und verwenden stabile Idempotenz. Registrieren Sie `charge` auf dem `payments`-Worker in `production` und `PaymentWorkflow` auf dessen Workflow-Worker:

```python
from durable_workflow import NonRetryableError, activity, workflow
from myapp.payments import breaker, payment_api

@activity.defn(name="payments.charge")
async def charge(order):
    if await breaker.is_open("payment-api"):
        raise NonRetryableError("payment-api breaker is open")
    return await payment_api.charge(order, idempotency_key=order["id"])

@workflow.defn(name="payments.order")
class PaymentWorkflow:
    def run(self, ctx, order):
        return (yield ctx.schedule_activity(
            "payments.charge", [order], queue="payments",
            retry_policy={"max_attempts": 3, "backoff_seconds": [2, 5]},
            start_to_close_timeout=10,
            schedule_to_start_timeout=30,
            schedule_to_close_timeout=90,
        ))
```

Ein offener Anwendungs-Breaker löst vor der Zahlung `NonRetryableError` aus. Gewöhnliche wiederholbare Zahlungsfehler dürfen höchstens drei Versuche mit festgelegtem Backoff verwenden. Die ursprünglichen Zeitlimits können vorher ablaufen. Bei Bedarf fängt der Workflow den endgültigen Aktivitätsfehler ab; ein unbehandelter endgültiger Fehler kann ihn schließen. Wählen Sie die gesamte Workflow-Frist separat.

Geschützte Dienstaufrufe gehören in **gewöhnliche eingereihte Aktivitäten**. Inline-lokale Aktivitäten erzeugen keinen gewöhnlichen Aktivitätstask; Queue-/Namespace-/Gruppen-Obergrenzen messen sie nicht. Ein vorbereiteter lokaler Claim prüft Ausführungsbefugnis, nicht dieses Budget. Eingebettetes Laravel hat keine Admission des eigenständigen Servers; verwenden Sie eigene Deployment-Kontrollen. Siehe [lokale Aktivitäten](../features/local-activities.md).

## Anfragezulassung pro Namespace {#namespace-request-admission}

Dieser Vertrag gilt für den veröffentlichten **PHP Server 2.11.0**. Prüfen Sie Ihr Image und die [versionierte Konfigurationsreferenz](./server-config-reference.md#additional-published-php-controls). HTTP-Budgets sind von Worker-Slots, Task-Dispatch, gehaltenen Polls und dauerhaften Kontingenten getrennt. Das Budget gehört zum durch `Durable-Workflow-Namespace` oder `DW_DEFAULT_NAMESPACE` aufgelösten Namespace, auch wenn ein Verwaltungspfad einen anderen Namespace nennt.

Authentifizierte Anfragen, die die Zulassung erreichen, zählen in diesen Control- und Verwaltungsroutenfamilien einschließlich Unterpfaden: `/api/namespaces`, `/api/storage`, `/api/workflows`, `/api/activities`, `/api/bridge-adapters`, `/api/workers`, `/api/worker-sessions`, `/api/task-queues`, `/api/deployments`, `/api/schedules`, `/api/search-attributes`, `/api/service-endpoints`, `/api/service-catalog`. Verwaltungsrouten im Plural `/api/workers` zählen.

Die singulären `/api/worker/*`-Routen für Registrierung, Polling und Ergebnisse verwenden dieses HTTP-Budget nicht. Health/Readiness, `/api/cluster/info`, Admin-Routen `/api/system/*`, Runtime-Zugangsdaten und externer Payload-Transport bleiben ebenfalls außerhalb; ihre eigenen Zugriffs-, Kapazitäts- und Speicherprüfungen gelten weiterhin. Frühere Ablehnungen durch Authentifizierung, Protokoll oder Namespace-Auflösung erreichen den Zähler nicht.

Die Rate verwendet feste Minuten-Buckets der Serveruhr, keine geglättete oder gleitende Rate. Ein Budget N kann N Anfragen kurz vor der Grenze und weitere N danach zulassen. Später fehlschlagende Anfragen zählen weiter; die Ratenprüfung erfolgt vor der Gleichzeitigkeit, sodass eine Parallelitätsablehnung Minutenbudget verbrauchen kann. Der Parallelitätsslot bleibt bis zum Ende und zur Bereinigung der Anfrage belegt; er zählt keine laufenden Workflows.

API-Replikate benötigen denselben gemeinsamen Redis-Speicher/Schlüsselpräfix, synchronisierte Uhren und konsistent geladene Konfiguration. Weitere Replikate multiplizieren das gemeinsame Budget nicht. Ein lokaler Dateicache koordiniert nur Prozesse mit kompatiblem Schreibzugriff; er ist nicht die Mehrknoten-Baseline. Knotenspezifische Grenzen gehaltener Worker-/Query-Polls gelten separat. [Starten Sie betroffene Rollen nach Umgebungsänderungen neu](./server-config-reference.md#how-changes-take-effect).

```dotenv
DW_NAMESPACE_MAX_REQUESTS_PER_MINUTE=100
DW_NAMESPACE_MAX_CONCURRENT_REQUESTS=8
DW_NAMESPACE_HARD_MAX_REQUESTS_PER_MINUTE=150
DW_NAMESPACE_HARD_MAX_CONCURRENT_REQUESTS=10
DW_NAMESPACE_ADMISSION_OVERRIDES='{"payments":{"max_requests_per_minute":200,"max_concurrent_requests":12},"reports":{"max_requests_per_minute":40,"max_concurrent_requests":3}}'
```

Für vorhandene Namespaces ergibt das Beispiel bei `payments` 150 Anfragen/Minute und 10 gleichzeitige, bei `reports` 40/3, sonst 100/8. Overrides dürfen Vorgaben erhöhen oder senken, aber die harten Grenzen 150/10 bleiben bestehen. Die Konfiguration erzeugt keine Namespaces und reserviert keinen Durchsatz.

Bei diesen HTTP-Kontrollen setzt ein fehlender Wert keine entsprechende Grenze; eine harte Obergrenze allein kann dennoch begrenzen. Ein `null`-Override fällt auf die Vorgabe zurück. Werte müssen positive ganze Zahlen sein: `0` ist ungültig. PHP-Obergrenzen sind 10000000 Anfragen/Minute und 1024 gleichzeitige Anfragen, unabhängig von der realen HTTP-Pool-Kapazität. Veröffentlichtes PHP 2.11.0 behandelt fehlerhaftes `DW_NAMESPACE_ADMISSION_OVERRIDES`-JSON stillschweigend als leere Overrides und nutzt globale Vorgaben. Validieren Sie JSON vor dem Deployment; ohne globale Vorgaben/harten Grenzen geht die beabsichtigte Namespace-Grenze verloren. Diese [bestätigte Produktlücke](https://github.com/durable-workflow/durable-workflow.github.io/issues/335#issuecomment-6369150521) wird durch Dokumentation nicht behoben.

| Grund | HTTP | Wiederholhinweis in Sekunden |
| --- | --- | --- |
| `namespace_request_rate_exhausted` | `429` | Bis zur nächsten Minute, 1–60 |
| `namespace_request_concurrency_exhausted` | `429` | 1 |
| `namespace_request_admission_unavailable` | `503` | 1 |

JSON `retry_after_seconds` und Header `Retry-After` stimmen überein. Nicht verfügbare konfigurierte Koordination oder ungültige numerische Grenzen führen zu 503. Namespace-bezogene Admin-Metriken bleiben auch bei erschöpften normalen Anfragen verfügbar; `dw_namespace_request_admission_rejections` meldet die begrenzten Gründe. Nutzen Sie begrenzte Caller-Retry-/Backoff-Richtlinien und Idempotenz; ein unsicherer Transportausgang erlaubt kein automatisches Wiederholen von Schreibvorgängen. Siehe [Timeout-Budgets](../deployment.md#worker-long-poll-timeout-budgets).

## Kontingente für dauerhaften Namespace-Zustand {#namespace-durable-state}

`DW_NAMESPACE_DURABLE_LIMITS` setzt Vorgaben für erhaltene Zeilen, `DW_NAMESPACE_DURABLE_OVERRIDES` ändert sie pro Namespace und `DW_NAMESPACE_DURABLE_HARD_LIMITS` ergänzt unübergehbare Obergrenzen. Leere Objekte fügen keine Grenzen hinzu. Overrides dürfen Vorgaben erhöhen oder senken; null fällt auf die Vorgabe zurück. Anders als bei HTTP ist ein dauerhaftes Kontingent 0 gültig und verhindert neue Belegungen. Hier kann vorhandenes `payments` 250 offene Runs halten, andere Namespaces 100, bei harter Grenze 500.

```dotenv
DW_NAMESPACE_DURABLE_LIMITS='{"max_open_workflow_runs":100,"max_open_workflow_run_waits":200,"max_pending_workflow_timers":200}'
DW_NAMESPACE_DURABLE_HARD_LIMITS='{"max_open_workflow_runs":500}'
DW_NAMESPACE_DURABLE_OVERRIDES='{"payments":{"max_open_workflow_runs":250}}'
```

Verwenden Sie `max_<resource>` für folgende Ressourcen. Zeilen zählen im eigenen Namespace oder dem des verknüpften Workflows/Runs. Erhaltene Gesamtzahlen und offene/ausstehende Teilmengen werden unabhängig begrenzt. Maßgeblich sind Datenbankzählungen; Mutationen werden über die Namespace-Zeile serialisiert.

| Ressource | Gezählte Zeilen |
| --- | --- |
| `workflow_instances`, `workflow_runs` | Alle erhaltenen Workflow-Instanz-/Run-Zeilen einschließlich terminaler Runs. |
| `open_workflow_runs` | Runs mit Status `pending`, `running` oder `waiting`. |
| `workflow_history_events`, `workflow_commands`, `workflow_tasks` | Erhaltene Historien-, Befehls- und Workflow-Task-Zeilen. |
| `pending_workflow_tasks` | Workflow-Task-Zeilen in der Queue mit Status `ready`; aktive Leases haben eigene Zulassungskontrollen. |
| `workflow_timers`, `pending_workflow_timers` | Alle erhaltenen Timer beziehungsweise die Teilmenge `pending`. |
| `workflow_run_waits`, `open_workflow_run_waits` | Alle erhaltenen Run-Wartezeilen beziehungsweise die Teilmenge `open`. |
| `schedules`, `schedule_history_events`, `worker_registrations` | Erhaltene Schedules, Schedule-Historie und Worker-Registrierungen; veraltete Registrierungen zählen bis zur Löschung. |
| `workflow_streams`, `workflow_stream_items` | Zeilen dauerhafter und eingehender Streams sowie ihrer Elemente. |

Ein auf Kind oder Service-Aufruf wartender Elternworkflow belegt weiter einen offenen Run im eigenen Namespace. Das Kind ergänzt seinen Run; im selben Namespace müssen beide offenen Runs und ihre Wartezeiten/Timer eingeplant werden. Eine Service-Operation, die einen Workflow erzeugt, verbraucht Zeilen in dessen Namespace; Signal/Update auf einem bestehenden Run erzeugt nicht automatisch einen zweiten Run. Service-Aufruf- und externe Payload-Kontingente gelten separat.

Erschöpfung liefert 429 `namespace_<resource>_exhausted`. Prüfen Sie `retryable`: Manche Kontingente sind nicht wiederholbar und liefern keinen Wartehinweis; wiederholbare dauerhafte Ablehnungen nennen 60 Sekunden, ohne spätere Kapazität zu garantieren. Eine nicht auswertbare konfigurierte Quote liefert 503 `namespace_durable_state_quota_unavailable` mit einer Sekunde Wartehinweis. Erhaltene Zeilen können Retention oder eine Kapazitäts-/Konfigurationsänderung erfordern, keine enge Retry-Schleife.

Wählen Sie beim Abruf von Admin-Metriken den Namespace per Header. `dw_namespace_durable_state_usage` und JSON-Felder `limits`, `usage`, `remaining`, `configuration_status`, `measurement_status` zeigen diesen Bereich; Namespace ist Anfragekontext statt unbegrenztes Metriklabel. Nicht verfügbare Messwerte bedeuten weder Nullnutzung noch unbegrenzte Kapazität. Siehe die [vollständige Referenz](./server-config-reference.md#namespace-durable-controls).

## Server-Konfiguration {#server-configuration}

Setzen Sie globale Grenzen, wenn alle Warteschlangen dieselbe Obergrenze haben sollen:

```bash
DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE=25
DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE=100
DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE=500
DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE=2000
DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE=600
DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE=1200
DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE=12000
DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE=24000
DW_QUERY_TASK_MAX_PENDING_PER_QUEUE=1024
```

Warteschlangengrenzen schützen eine Task-Warteschlange. Namespace-Grenzen schützen die mandantenweite Summe über alle Task-Warteschlangen im Namespace. Dies hilft, wenn ein Mandant Arbeit auf viele Warteschlangen verteilen kann, aber ein gemeinsames nachgelagertes Kontingent besitzt. Budgetgruppengrenzen schützen eine benannte nachgelagerte Abhängigkeit über ausgewählte Warteschlangen hinweg, ohne alle Warteschlangen im Namespace zu drosseln.

Verwenden Sie `DW_TASK_QUEUE_ADMISSION_OVERRIDES`, wenn einzelne Warteschlangen oder Namespaces andere Budgets benötigen. Schlüssel werden in dieser Reihenfolge geprüft: `namespace:task_queue`, `namespace:*`, `task_queue`, dann `*`.

```bash
DW_TASK_QUEUE_ADMISSION_OVERRIDES='{
  "production:payments": {
    "workflow_tasks": {
      "max_active_leases_per_queue": 8,
      "max_dispatches_per_minute": 120,
      "dispatch_budget_group": "downstream-openai",
      "max_dispatches_per_minute_per_budget_group": 600
    },
    "activity_tasks": {
      "max_active_leases_per_queue": 12,
      "max_dispatches_per_minute": 240
    }
  },
  "production:*": {
    "workflow_tasks": {
      "max_active_leases_per_namespace": 300,
      "max_dispatches_per_minute_per_namespace": 6000
    },
    "activity_tasks": {
      "max_active_leases_per_namespace": 1200,
      "max_dispatches_per_minute_per_namespace": 12000
    }
  },
  "email": {
    "activity_tasks": {
      "max_active_leases_per_queue": 4,
      "max_dispatches_per_minute": 60,
      "dispatch_budget_group": "downstream-sendgrid",
      "max_dispatches_per_minute_per_budget_group": 300
    }
  },
  "*": {
    "workflow_tasks": { "max_active_leases_per_queue": 50 }
  }
}'
```

Der Override-Wert akzeptiert auch `max_active_leases` als Alias für `max_active_leases_per_queue` und `budget_group` als Alias für `dispatch_budget_group`.

Der Cache muss atomare Sperren für serverseitige Grenzen aktiver Leases, Zuweisungsraten und Abfrage-Task-Zulassung unterstützen. Zuweisungsratenzähler sind kurzlebige Minutenfenster, die nur für begrenzte Warteschlangen erstellt werden, die tatsächlich Tasks verleasen. Redis ist der empfohlene Cache für Bereitstellungen mit mehreren Knoten.

## Worker-Slots registrieren {#worker-slot-registration}

Um Python-Workflow- und Aktivitäts-Handlern unabhängige Prozessressourcen zu geben,
verwenden Sie das [Beispiel mit getrennten Worker-Prozessen](https://python.durable-workflow.com/guides/separate-workers/).
Wählen Sie die registrierten Handler-Listen zur Rollentrennung. Halten Sie beide
Nebenläufigkeitswerte positiv und verwenden Sie Server-Grenzen, wenn die Summe
über Prozesse hinweg begrenzt sein muss.

Python-Worker stellen lokale Semaphore über `Worker(...)` bereit und senden dieselben Werte bei der Registrierung:

```python
worker = Worker(
    client,
    task_queue="payments",
    workflows=[PaymentWorkflow],
    activities=[charge_card, send_receipt],
    max_concurrent_workflow_tasks=8,
    max_concurrent_activity_tasks=12,
)
```

Senden Sie für eigene HTTP-Worker die Slot-Felder an `POST /api/worker/register`:

```json
{
  "worker_id": "payments-python-1",
  "task_queue": "payments",
  "runtime": "python",
  "supported_workflow_types": ["payments.PaymentWorkflow"],
  "supported_activity_types": ["payments.charge_card", "payments.send_receipt"],
  "max_concurrent_workflow_tasks": 8,
  "max_concurrent_activity_tasks": 12
}
```

Worker-Slots allein sind kein hartes Mandantenbudget. Sie beschreiben, was aktive Worker aktuell verarbeiten können. Ergänzen Sie Server-Grenzen, wenn eine warteschlangenweite Obergrenze auch bei zusätzlichen Workern gelten muss.

## Zulassung untersuchen {#inspect-admission}

Verwenden Sie die CLI zur Diagnose:

```bash
dw task-queue:list
dw task-queue:describe payments
dw task-queue:describe payments --json | jq '.admission'
```

Der Server bietet dieselben Daten über:

- `GET /api/task-queues`
- `GET /api/task-queues/{name}`

Eine Zulassungsnutzlast hat drei Abschnitte:

```json
{
  "workflow_tasks": {
    "status": "throttled",
    "active_worker_count": 3,
    "configured_slot_count": 24,
    "leased_count": 8,
    "ready_count": 5,
    "available_slot_count": 16,
    "server_max_active_leases_per_queue": 8,
    "server_active_lease_count": 8,
    "server_remaining_active_lease_capacity": 0,
    "server_max_active_leases_per_namespace": 300,
    "server_namespace_active_lease_count": 149,
    "server_remaining_namespace_active_lease_capacity": 151,
    "server_max_dispatches_per_minute": 120,
    "server_dispatch_count_this_minute": 120,
    "server_remaining_dispatch_capacity": 0,
    "server_max_dispatches_per_minute_per_namespace": 6000,
    "server_namespace_dispatch_count_this_minute": 3520,
    "server_remaining_namespace_dispatch_capacity": 2480,
    "server_dispatch_budget_group": "downstream-openai",
    "server_max_dispatches_per_minute_per_budget_group": 600,
    "server_budget_group_dispatch_count_this_minute": 600,
    "server_remaining_budget_group_dispatch_capacity": 0,
    "server_lock_required": true,
    "server_lock_supported": true,
    "budget_source": "worker_registration.max_concurrent_workflow_tasks",
    "server_budget_source": "server.admission.queue_overrides"
  },
  "activity_tasks": {
    "status": "accepting",
    "configured_slot_count": 36,
    "server_max_active_leases_per_queue": 12,
    "server_remaining_active_lease_capacity": 4,
    "server_max_dispatches_per_minute": 240,
    "server_remaining_dispatch_capacity": 197
  },
  "query_tasks": {
    "status": "accepting",
    "max_pending_per_queue": 1024,
    "approximate_pending_count": 7,
    "remaining_pending_capacity": 1017,
    "lock_supported": true,
    "budget_source": "server.query_tasks.max_pending_per_queue"
  }
}
```

## Statusreferenz {#status-reference}

| Abschnitt | Status | Bedeutung |
|---------|--------|---------|
| Workflow/Aktivität | `accepting` | Aktive Worker haben freie Slots, und keine Server-Grenze ist erreicht. |
| Workflow/Aktivität | `throttled` | Die optionale serverseitige Grenze aktiver Leases oder Zuweisungen pro Minute ist erreicht. |
| Workflow/Aktivität | `saturated` | Alle registrierten Worker-Slots sind verleast, selbst wenn keine Server-Grenze konfiguriert ist. |
| Workflow/Aktivität | `no_slots` | Aktive Worker haben null Slots für diese Task-Art registriert. |
| Workflow/Aktivität | `no_active_workers` | Kein aktiver, nicht veralteter Worker fragt diese Warteschlange ab. |
| Workflow/Aktivität | `unavailable` | Eine konfigurierte Server-Grenze benötigt eine Cache-Sperre, die nicht verfügbar ist. |
| Abfrage | `accepting` | Die Warteschlange ausstehender Abfrage-Tasks hat noch Kapazität. |
| Abfrage | `full` | Ausstehende Abfrage-Tasks haben `DW_QUERY_TASK_MAX_PENDING_PER_QUEUE` erreicht; neue Abfragen liefern HTTP `429`. |
| Abfrage | `unavailable` | Die Abfrage-Task-Warteschlange kann ihre Cache-Sperre nicht erwerben; neue Abfragen liefern HTTP `503`. |

## Vorgehen zur Abstimmung {#tuning-pattern}

1. Bemessen Sie Worker-Slots zunächst nach dem Prozess: CPU-lastige Workflow-Tasks haben gewöhnlich geringere Werte als E/A-lastige Aktivitäts-Tasks.
2. Ergänzen Sie Grenzen aktiver Leases für Warteschlangen, die eine Obergrenze laufender Arbeit über alle Worker hinweg benötigen.
3. Ergänzen Sie Namespace-weite Grenzen aktiver Leases, wenn ein Mandant viele Warteschlangen erzeugen kann, aber eine Gesamtobergrenze braucht.
4. Ergänzen Sie Zuweisungsgrenzen pro Minute für Warteschlangen, die eine ratenbegrenzte externe API, einen Datenbankpool, Mandanten oder Altdienst auch bei freien Worker-Slots vor Lastspitzen schützen.
5. Ergänzen Sie Zuweisungsgrenzen für Budgetgruppen, wenn mehrere Warteschlangen eine nachgelagerte Abhängigkeit teilen, andere Warteschlangen im Namespace aber weiterlaufen sollen.
6. Ergänzen Sie Namespace-weite Zuweisungsgrenzen, wenn das nachgelagerte Kontingent mandantenweit statt warteschlangenspezifisch gilt.
7. Untersuchen Sie unter Last `dw task-queue:describe <queue>`. `saturated` bedeutet: Worker-Kapazität erhöhen oder Workflow-Auffächerung senken. `throttled` bedeutet, dass eine Grenze aktiver Leases oder der Zuweisungsrate wirkt. `no_active_workers` bedeutet, dass die Warteschlange keinen gesunden Abfrager hat.
8. Bemessen Sie die Abfrage-Task-Kapazität groß genug für normale betriebliche Lesezugriffe, aber klein genug für schnelles Scheitern bei Störungen. Überlauf von Abfrage-Tasks ist Rückstaukontrolle, kein Datenverlust.

## Verwandte Leitfäden {#related-guides}

- [Server](/docs/polyglot/server)
- [CLI](/docs/polyglot/cli)
- [Python SDK](/docs/polyglot/python)
- [Worker-Protokoll](/docs/polyglot/worker-protocol)
