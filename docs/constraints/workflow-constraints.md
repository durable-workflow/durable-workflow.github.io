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

## Replay-Safety Diagnostics

Read-only replay-safety diagnostics are exposed on selected-run detail. When the stored workflow type resolves to a loadable PHP workflow definition and the selected run's snapped `workflow_definition_fingerprint` still matches the current loadable class, the package scans that workflow class, its workflow traits, and workflow parent classes for obvious replay-unsafe calls such as `DB::...`, `Cache::...`, `Auth::...`, `Http::...`, `now()`, `time()`, `random_int()`, `rand()`, and `Str::uuid()`.

Waterline shows these diagnostics under Replay Safety with `workflow_determinism_status`, `workflow_determinism_source`, and `workflow_determinism_findings` in the detail payload. A `warning` status does not block execution; treat it as an operator and authoring signal to move live database/cache/request/network reads into activities, workflow input, durable command payloads, or `sideEffect()` snapshots. When `workflow_determinism_source = definition_drift`, the selected run started on a different workflow-definition fingerprint than the current build, so Waterline suppresses live-source findings and instead reports one drift warning because today's source scan is not authoritative for that run.

The scanner is intentionally conservative and source-based. A `clean` status is not a formal proof of determinism, `definition_drift` means the selected run's snapped definition no longer matches the current build, and `unavailable` means the current build cannot load the workflow definition to inspect it.

## Boot-Time Guardrails

When workflow classes are registered under `workflows.v2.types.workflows`, the package runs the same replay-safety scanner at boot time. This catches non-deterministic patterns early — before the first workflow task ever executes.

Configure the behavior with `workflows.v2.guardrails.boot`:

| Mode | Behavior |
|------|----------|
| `warn` (default) | Logs a warning for each detected finding. Does not block application boot. |
| `silent` | Skips boot-time scanning entirely. |
| `throw` | Throws a `LogicException` on the first finding. Useful for CI pipelines that should fail when a workflow class introduces a replay-unsafe call. |

```php
// config/workflows.php
'v2' => [
    'guardrails' => [
        'boot' => env('WORKFLOW_V2_GUARDRAILS_BOOT', 'warn'),
    ],
],
```

In `throw` mode, the exception message includes the workflow class, the offending symbol, file, and line number. Set the `WORKFLOW_V2_GUARDRAILS_BOOT` environment variable to `throw` in CI and `warn` in production to catch regressions without blocking deployments.
