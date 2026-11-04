---
title: Database Compatibility
---

# Database compatibility and qualification

Use this table for embedded Laravel and self-hosted Server database choices.
Cloud owns its runtime persistence. Cloud customers configure SDK clients and
workers rather than a runtime database.

A declared compatibility baseline is not proof that every later version is
qualified. Source tests and installed, published artifacts are different
evidence. This snapshot binds Workflow 2.20.3 source and Server 3.0.5 release
receipts. It does not change runtime compatibility or establish a lowest/newest
tested range.

| Engine | Declared compatibility | Observed source qualification | Published-artifact qualification |
| --- | --- | --- | --- |
| MySQL | Embedded: 8.0 baseline. Server: 8.0 baseline. | Core: 26.10.0 in the original floating-image feature jobs. Server profiles: 8.0.46 and 8.4.5. | Core observation is release-source-bound. Server 3.0.5 Compose uses floating `mysql:8.0` for schema/health smoke, not a full execution/capacity/TLS qualification. |
| PostgreSQL | Embedded: 13 baseline. Server: 13 baseline. | Core: 18.6. Server profiles: 16.15 and 17.11. | Core observation is release-source-bound. No Server 3.0.5-index-bound PostgreSQL endpoint receipt was found in the inspected release inventory. |
| MariaDB | Embedded: 10.5 baseline. Server accepts `mariadb`; no version baseline is established here. | Core: 10.5.29. Server profile: 10.11.19. | Core observation is release-source-bound. No Server 3.0.5-index-bound MariaDB endpoint receipt was found in the inspected release inventory. |
| SQLite | Embedded capability/tests include SQLite. Server declares a 3.35 baseline. | The original Core source jobs did not emit the SQLite library version. | Installed Core 2.20.3 acceptance exercised SQLite, without establishing a library-version range. Server's frozen 3.1.0 candidate corpus is separate from stable 3.0.5. |
| SQL Server | Published embedded Core advertises `sqlsrv`, but it remains unqualified. Server qualification is not established here. | No SQL Server job was recovered from the published Core matrix. The proposed backend guard is separate source work. | No corresponding release qualification was recovered. Do not infer support from the embedded capability advertisement. |

## Reading the evidence {#reading-the-evidence}

The [Core inventory](https://github.com/durable-workflow/durable-workflow.github.io/issues/347#issuecomment-6642279325)
binds original image digests and four MySQL, four PostgreSQL and one MariaDB
feature jobs at the released source. Its twelve published upgrade cells cover
Laravel/PHP combinations, not twelve database endpoints. The separate
[normally installed Core receipt](https://github.com/durable-workflow/workflow/pull/1025#issuecomment-6632522927)
covers 67 SQLite-backed stream/replay/fake cases. Neither a PHP version nor a
floating image selector supplies an unreported database version.

The [Server inventory](https://github.com/durable-workflow/server/issues/563#issuecomment-6642659277)
separates native and legacy PHP source-job scopes. The
[stable 3.0.5 receipt](https://github.com/durable-workflow/server/issues/563#issuecomment-6643169603)
has four architecture/profile Compose smoke cells. Both `local` and `production`
use MySQL. The inspected logs do not recover an exact companion version/digest,
write-capacity qualification or verified TLS. Source profiles and a frozen
candidate do not qualify a different published image.

## Vendor lifecycle and distributed engines {#vendor-lifecycle-and-distributed-engines}

For new deployments, prefer maintained vendor lines after the exact runtime and
database pair is qualified. [PostgreSQL's policy](https://www.postgresql.org/support/versioning/)
marks 13 unsupported and ends 14 on November 12, 2026.
[Oracle's notice](https://www.mysql.com/support/eol-notice.html) places MySQL 8.0
in Sustaining Support from April 21, 2026. Vendor lifecycle does not establish or
remove our artifact qualification.

TiDB, Vitess, PlanetScale and other distributed MySQL-compatible deployments are
untested here. Protocol compatibility does not prove transaction isolation,
row-lock behavior, commit/after-commit visibility or retry behavior. Validate
those semantics with the exact runtime before adoption. This table does not
extend the [single-region operating envelope](../operator-operating-envelope.md)
to multi-region operation.
