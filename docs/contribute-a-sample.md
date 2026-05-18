---
sidebar_position: 9
tags:
  - sample-app
  - contributing
  - patterns
keywords:
  - contribute a sample
  - durable workflow sample contribution
  - sample-request flow
  - external sample workflow
---

# Contribute a Sample

The [Sample App](/docs/sample-app) is the canonical place to show
what a Durable Workflow pattern looks like in a real Laravel project.
If you have a pattern that would help other engineers — a saga shape we
do not yet show, a different way of using message streams, an
integration with a tool the existing samples do not exercise — this
guide is the path that gets it merged.

The contract here is short on purpose. A sample that follows it lands
on a predictable cadence. A sample that skips parts of it sits in
review until the gaps are filled.

## Before you write code

1. **Open a `sample-request` issue first.** The
   [`sample-request` template](https://github.com/durable-workflow/sample-app/issues/new/choose)
   names the pattern surface, the public docs page that defines it,
   and the minimum Durable Workflow package version it needs. The
   issue is the place where maintainers and the contributor agree the
   sample is worth merging *before* the contributor invests in a PR.
2. **Pick a pattern surface that does not already exist in the sample
   index.** The
   [README sample index](https://github.com/durable-workflow/sample-app#sample-index)
   names every covered pattern. If your idea collapses to "a different
   spelling of the simple workflow," that is not a new sample — that
   is a documentation tweak on `App\Workflows\Simple\SimpleWorkflow`.
3. **Find the closest existing workflow class.** A new sample should
   read like the one next to it: same directory layout under
   `app/Workflows/<Pattern>/`, same shape of artisan command, same
   testing posture. New samples that invent novel scaffolding are
   rejected even if the pattern they show is good.

## What a merged sample looks like

A merged sample is *runnable*, *teachable*, *covered*, and *visible*.
That maps to four concrete artifacts in the sample-app repository:

1. **A workflow class** under `app/Workflows/<Pattern>/` that
   demonstrates the pattern end to end. Workflow code stays
   deterministic — clock reads behind `sideEffect()`, external work
   inside activities, waits behind signals, updates, timers, or
   message streams. The workflow class compiles without `OPENAI_API_KEY`
   or other external credentials unless the pattern explicitly
   requires them.
2. **An artisan command** that starts the workflow with realistic input
   so a reader can run one command and watch the run land in
   Waterline. The command lives next to the matching artisan commands
   in `routes/console.php` (or the equivalent registration entry) and
   uses the same naming convention (`app:<short-pattern>`).
3. **A `config/workflow_mcp.php` entry** that names the workflow class,
   pattern, command, required credentials, and arguments. This entry
   is what makes the sample discoverable through the MCP server, and
   the upstream-coverage lint refuses to mark a coverage row `covered`
   until the entry is present.
4. **A test under `tests/`** that exercises the workflow against the
   in-memory v2 worker. The test does not have to assert on every
   typed history event, but it must prove that the workflow completes
   for the input the artisan command passes.

If the sample is meant to demonstrate a *bug fix* rather than a
feature, it lands under `app/Workflows/Bug/<short-id>/` instead, with
the same four artifacts.

## What goes in the docs

Three docs surfaces move when a sample lands:

- **README "Sample Index"** in the sample-app repository — one row
  per sample, with the goal, the workflow class, the artisan command,
  and the MCP key. This is the source of truth.
- **Sample gallery on the docs site
  ([`docs/sample-app.md`](/docs/sample-app))** — a mirrored row
  with the Waterline screen the reader should expect to see. The
  gallery exists so a reader can decide whether the sample is the one
  they want before cloning the repo.
- **Pattern-page cross-link** on the docs-site pattern page that
  defines the surface (sagas, signals, message streams,
  child-workflows, …). The cross-link table at the bottom of the
  sample-app docs page is the canonical list; an entry that names a
  surface but does not link to a sample is treated as a gap.

These three changes ship in the same PR as the sample workflow itself.
A sample that lands without a docs-site mirror is in `gap` state for
the upstream-coverage tracker until the docs PR catches up, so
contributors are encouraged to ship them together.

## Naming, layout, and style

- **Class layout.** `app/Workflows/<Pattern>/<Pattern>Workflow.php`,
  with the activity classes alongside it under
  `app/Workflows/<Pattern>/Activities/`. Bug reproducers go under
  `app/Workflows/Bug/<short-id>/` with the same shape.
- **Artisan command.** `app:<short-pattern>` (lower-case, hyphen-free).
  Long-form names (`app:run-<pattern>`) are not used.
- **MCP key.** Match the artisan command's short pattern so the MCP
  client sees the same name a human types in the terminal.
- **Comments.** Comment the *why*, not the *what*. Replay-safety
  invariants (why a value is wrapped in `sideEffect()`, why a wait
  uses a timer instead of `usleep()`) are worth a comment; the same
  comment on every activity invocation is not.
- **Waterline screenshots.** The docs-site sample-app gallery names
  the Waterline screen the sample is expected to produce; add or
  refresh that screen as part of the sample's PR.

## What gets a sample rejected

A sample is sent back when:

- the workflow code uses `now()`, `random_*()`, or other
  non-deterministic calls outside `sideEffect()` or an activity;
- the activities do durable bookkeeping the engine already owns —
  writing `workflow_messages` rows directly, manually advancing stream
  cursors, or persisting Waterline state from inside workflow code;
- the artisan command requires external credentials without saying so
  in the MCP entry's `requires` field;
- the README sample-index, docs-site gallery row, and pattern-page
  cross-link do not all land in the same change;
- the sample reproduces an existing pattern surface without showing
  something new (a different shape, a different failure mode, a
  different integration). "Same pattern, different prose" is a docs
  change, not a sample.

These are the same things the upstream-coverage lint and the
sample-app review checklist look for, so catching them yourself before
opening the PR is the fastest path to merge.

## Quick checklist

Use this list when you open the PR:

- [ ] `sample-request` issue exists and links to the public pattern
      docs page.
- [ ] Workflow class under `app/Workflows/<Pattern>/`.
- [ ] Artisan command registered with the `app:<short-pattern>` name.
- [ ] `config/workflow_mcp.php` entry with class, pattern, command,
      requires, and arguments.
- [ ] Test that exercises the workflow end to end.
- [ ] README "Sample Index" row.
- [ ] Docs-site gallery row in
      [`docs/sample-app.md`](/docs/sample-app).
- [ ] Cross-link from the matching pattern page on the docs site.
- [ ] Public-boundary scan clean (`scripts/check-public-boundary.sh`).

Maintainers run the same list during review, so a PR that ticks every
box should land within one release cycle.
