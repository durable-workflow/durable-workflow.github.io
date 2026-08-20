---
title: Migrate retained prerelease history
sidebar_label: Prerelease history migration
---

# Migrate retained prerelease history

Use this offline procedure when an Avro-only Durable Workflow 2.0 deployment
reports `unsupported_payload_codec` for state retained from an earlier public
2.0 prerelease. It converts the known JSON-tagged, untagged, and obsolete Avro
Value representations without making any legacy codec available to a running
v2 application.

Do not use history export as a substitute for this procedure. An export is a
portable copy of a run; it does not change the database rows that deployment
startup inspects. Never delete history to make the preflight pass.

## Decide what must be converted

Runs that are still active can finish on the currently deployed prerelease.
Drain them before the maintenance window when that is operationally safe.
Terminal runs, closed executions retained for replay, and state that cannot
drain must be converted. The migration inventories both groups, and does not
delete either one.

The dry run covers the protocol-owned surfaces checked by Server startup:

- workflow inputs and outputs, activity payloads, commands, signals, updates,
  service calls, update-validation tasks, and durable-stream references;
- inline single-object frames and the explicit payload envelopes nested in
  history events; and
- externally stored payload references, including reference shape, codec,
  object availability, byte length, and SHA-256 integrity.

Customer-owned memo, search-attribute, context, and diagnostic maps are not
codec declarations and are left unchanged. Unknown codecs, unknown schema
fingerprints, corrupt references, and values that the fixed Avro Value schema
cannot represent are reported as unsafe. An unsafe finding blocks apply.

## Ownership boundary

The command belongs to the Workflow PHP package, but it must run in the
process that owns the database connection and external-payload configuration:

- **Embedded Laravel:** install the target Workflow package in the application
  checkout, then run the application's `php artisan` command while its web,
  queue, scheduler, and maintenance processes are stopped.
- **Standalone Server:** use a one-shot shell or job from the target Server
  image, with the same database, namespace configuration, credentials, and
  external-payload mounts as the deployment. Keep the normal bootstrap hook
  and all Server processes stopped until conversion succeeds.

Do not point an unrelated application checkout at the database. Namespace
storage policy is part of the integrity check; a process that cannot read an
external object reports it as unsafe instead of guessing.

## Deployment order

1. Keep the old prerelease available long enough to drain any active runs you
   choose to finish. Then stop every database writer: API nodes, workers,
   schedulers, bootstrap jobs, and maintenance jobs.
2. Take the database and external-object-store snapshots required by your
   normal recovery policy. Retain the old application or Server artifact.
3. Install or pull the target artifact that contains
   `workflow:v2:migrate-prerelease-history`, but do not start it. Run the dry
   inventory from that artifact:

   ```bash
   php artisan workflow:v2:migrate-prerelease-history --dry-run --json
   ```

   A zero exit code means every affected value is safely convertible. Review
   the paths and affected run IDs. A nonzero exit code with `unsafe_fields`
   greater than zero blocks the upgrade; correct storage access or remain on
   the old prerelease.
4. Choose a new private backup path and a new private evidence directory on
   persistent storage. Neither may already exist. Apply once:

   ```bash
   php artisan workflow:v2:migrate-prerelease-history \
     --backup=/secure/dw-prerelease-history-backup.json \
     --evidence-dir=/secure/dw-prerelease-history-evidence
   ```

   The command writes the backup before beginning updates and refuses to
   overwrite evidence. It locks and updates database rows in one transaction,
   preserves workflow and run identities, verifies external-object hashes and
   sizes, and retains every original external object. Replacement external
   objects are content-addressed Avro copies. No history is deleted.
5. Wait for the command to finish. It exports and strict-replays every affected
   retained run, rebuilds its summary, wait, timeline, timer, and lineage
   projections, checks those projections for drift, and repeats the payload
   inventory. Success requires all three checks. Keep the generated replay and
   projection reports with the backup.
6. Run the normal target bootstrap only after migration succeeds:

   ```bash
   php artisan server:bootstrap --force
   ```

   For embedded Laravel, run the application's normal migration/bootstrap
   procedure instead. The Avro-only payload preflight must be clean before any
   new worker, API node, scheduler, or maintenance process starts.
7. Start the target deployment and verify readiness and a retained-run replay
   or query through the normal operator surface. Retain the migration packet
   for the duration of the rollback window.

## Rollback

If apply, replay, projection verification, or postflight fails, the upgrade is
blocked. Leave all writers stopped and run the rollback command printed by the
migration. With the paths above it is:

```bash
php artisan workflow:v2:migrate-prerelease-history \
  --rollback-from=/secure/dw-prerelease-history-backup.json \
  --evidence-dir=/secure/dw-prerelease-history-evidence
```

Rollback verifies the backup digest and migration state, refuses to overwrite
rollback evidence, and refuses to restore a row changed after conversion. It
restores the original database values atomically and retains replacement
external objects as evidence. Then restore the previous application or Server
artifact. If rollback refuses because another writer changed state, keep the
upgrade blocked and restore the coordinated database and object-store snapshot
from step 2.

After rollback, the Avro-only deployment is expected to fail preflight again.
Resolve the reported unsafe state, create new backup and evidence paths, and
repeat the complete procedure before retrying the upgrade.
