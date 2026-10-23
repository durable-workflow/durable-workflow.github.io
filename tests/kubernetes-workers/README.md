# Kubernetes SDK worker guide acceptance

This fixture checks the worker Deployment in `docs/deployment.md`. It extracts
that YAML instead of maintaining another worker manifest. The PHP, Python and
Rust images install normal published SDK packages. There is no SDK or Server
source overlay. `artifacts.json` records this fixture's exact qualification
cohort; it does not update the site's selected compatibility tuple.

The ordinary GitHub Actions workflow `kubernetes-workers.yml` builds the three
applications, verifies installed package identities, creates an isolated kind
cluster, and uses the immutable published Server image. It checks two distinct
Pod worker IDs per SDK, a completed workflow and remote activity per SDK,
idle Pod termination through SIGTERM, successful managed shutdown logs, and
removal of all six original registrations. Active-task interruption, forced
kill, recovery, provider networking, production database operations and HA
are separate controls and are not claimed by this fixture.

The Server fixture uses ephemeral SQLite and a real scheduler. Its contents
are synthetic test data. The strings named `website336-worker` and
`website336-control` are test-only role credentials. The public guide keeps
actual credentials outside manifests and images.

With Docker, kind, kubectl and Python 3.11 or newer available:

```bash
QUALIFICATION_OUTPUT=/tmp/kubernetes-worker-evidence python3 tests/kubernetes-workers/qualify.py
```

Run in an isolated test runner with enough disk for a Rust application build
and kind. The script deletes only its uniquely named cluster in its cleanup
path. GitHub-hosted build resources expire with the bounded job. Evidence is
retained for three days in Actions; retain a sanitized outcome and exact
source/artifact links in the owning issue before claiming delivery.
