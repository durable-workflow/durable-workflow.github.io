---
sidebar_position: 12
---

# Monitoring

[Waterline](https://github.com/durable-workflow/waterline) is a separate UI
that works alongside Horizon. Think of Waterline as being to workflows what
Horizon is to queues.

Durable Workflow has two observability planes:

| Plane | Source of truth | Typical questions |
| --- | --- | --- |
| Durable state | Workflow database, Waterline projections, and history export | Did the workflow start? Which run is current? Which signal, update, timer, activity, retry, or failure was committed? Which operator action is safe now? |
| Worker/runtime telemetry | Queue worker logs, SDK metrics recorders, Prometheus/OpenMetrics endpoints, and application traces | Are workers polling? How long do tasks take? Is an exporter configured? Did custom application metrics leave the worker process? |

Waterline intentionally does not replace worker metrics. If a custom metric
was recorded in activity or worker code, scrape the worker's telemetry
endpoint. Use Waterline to correlate that runtime signal with the durable
workflow history and current run state.

### Dashboard View

![waterline_dashboard](https://github.com/user-attachments/assets/5688a234-4c02-4d5e-84d4-5f40b5fa27c5)

The dashboard shows running totals, recent-run counters, and fleet-wide
metrics so you can tell at a glance whether work is flowing, stalling, or
failing.

### Workflow View

![workflow](https://github.com/user-attachments/assets/da685466-7747-4c2f-ae10-300041381d51)

The workflow detail view shows the durable timeline for a single run: the
activities, signals, timers, and child workflows that happened in order,
each with its inputs, outputs, and timing.

## Installing Waterline

Install Waterline into your Laravel application alongside the workflow
package and run its migrations. See
[durable-workflow/waterline](https://github.com/durable-workflow/waterline)
for the full installation and configuration guide.

## List and detail API

Waterline's list views (`/waterline/api/flows/{bucket}`) and selected-run
detail endpoint (`/waterline/api/flows/{id}`) return typed JSON contracts
that you can consume directly from your own dashboards or scripts. The
full field set is documented as part of Waterline's operator contract; it
is not needed for reading workflows through the UI.

## Control-plane actions from Waterline

Operators can cancel, terminate, repair, and archive workflows directly
from the detail view. Each action maps to a `POST` on the same run id and
returns either `200` with the resulting state or `409` when the action is
not valid for the run's current state.
