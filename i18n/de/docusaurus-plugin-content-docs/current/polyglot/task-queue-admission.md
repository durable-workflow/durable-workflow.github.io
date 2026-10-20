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

Serverseitige Grenzen für aktive Leases und Zuweisungsraten sind optional. Sind sie konfiguriert, prüft der Server eine kurzlebige Cache-Sperre, bevor er den nächsten Workflow- oder Aktivitäts-Task verleast. Ist die Grenze aktiver Leases erreicht, liefert diese Abfrage keinen Task, statt das Budget laufender Arbeit zu überschreiten. Ist die Zuweisungsgrenze pro Minute erreicht, liefert Abfragen keinen Task, bis das nächste Minutenfenster Kapazität hat. Nachgelagerte Budgetgruppen wenden dasselbe Minutenlimit auf jede Warteschlange im Namespace mit gleichem `dispatch_budget_group`-Namen an.

Abfrage-Tasks sind anders: Die Control Plane reiht einen kurzlebigen Abfrage-Task ein und wartet auf die Worker-Antwort. `DW_QUERY_TASK_MAX_PENDING_PER_QUEUE` begrenzt ausstehende Abfrage-Tasks je Namespace und Task-Warteschlange. Bei voller Warteschlange liefern neue Abfragen `query_task_queue_full` mit HTTP `429`. Kann der Cache die zum Ändern der Abfrage-Task-Warteschlange nötige Sperre nicht bereitstellen, liefern Abfragen `query_task_queue_unavailable` mit HTTP `503`.

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
