---
sidebar_position: 10
title: Planning a 2.0 Migration
description: Choose an embedded or service-mode Durable Workflow 2.0 destination before changing a stable Laravel application.
---

# Planning a 2.0 Migration

Durable Workflow 2.0 gives a stable Laravel application two destinations. The
embedded package keeps history, queues, workers, and operational ownership in
the Laravel deployment. The PHP SDK keeps Laravel dependency injection,
configuration, Artisan, logging, events, and testing while Cloud or a
self-hosted Server owns durable state.

Use the [Laravel adoption and runtime transition guide](/docs/laravel-adoption/)
to compare both destinations with the same application action and to choose the
drain, coexistence, cutover, and rollback boundary. Switching Composer packages
does not migrate in-flight history, timers, retries, or durable Laravel queue
state.

Keep the [stable installation guide](/docs/installation/) for the running 1.x
fleet until every run it owns is terminal. After choosing embedded 2.0, follow
the [detailed package migration procedure](/docs/migration/). After choosing
service mode, follow the [PHP SDK guide](/docs/polyglot/php/).
