---
sidebar_position: 13
---

# Monitoring

[Waterline](https://github.com/durable-workflow/waterline) is a separate UI
that works alongside Horizon. Think of Waterline as being to workflows what
Horizon is to queues.

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
