---
sidebar_position: 2
---

# Workflow Constraints

The determinism constraints for workflow classes dictate that a workflow class must not depend on external state or services that may change over time. This means that a workflow class should not perform any operations that rely on the current date and time, the current user, external network resources, or any other source of potentially changing state.

Here are some examples of things you shouldn't do inside of a workflow class:

- Don't use the `Carbon::now()` method to get the current date and time, as this will produce different results each time it is called. Instead, use the `Workflow\now()` method, which returns a fixed date and time.
- Don't use the `Auth::user()` method to get the current user, as this will produce different results depending on who is currently logged in. Instead, pass the user as an input to the workflow when it is started.
- Don't make network requests to external resources, as these may be slow or unavailable at different times. Instead, pass the necessary data as inputs to the workflow when it is started or use an activity to retrieve the data.
- Don't use random number generators (unless using a side effect) or other sources of randomness, as these will produce different results each time they are called. Instead, pass any necessary randomness as an input to the workflow when it is started.

## Boot-Time Guardrails

When workflow classes are registered under `workflows.v2.types.workflows`, the package scans them at boot time for obvious replay-unsafe calls (`Carbon::now()`, `Auth::user()`, `DB::`, `Http::`, `random_int()`, and similar) and surfaces findings according to `workflows.v2.guardrails.boot`:

| Mode | Behavior |
|------|----------|
| `warn` (default) | Logs a warning for each detected finding. Does not block application boot. |
| `silent` | Skips boot-time scanning entirely. |
| `throw` | Throws a `LogicException` on the first finding. Useful for CI pipelines. |

```php
// config/workflows.php
'v2' => [
    'guardrails' => [
        'boot' => env('DW_V2_GUARDRAILS_BOOT', 'warn'),
    ],
],
```

Set `DW_V2_GUARDRAILS_BOOT=throw` in CI to fail builds that introduce new replay-unsafe calls; keep `warn` in production so rollouts are not blocked by a latent finding.
