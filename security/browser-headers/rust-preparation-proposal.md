# Public dependency and immutable image preparation proposal

Status: **proposal only; acquisition, preparation, sealing and execution are not
admitted or performed**. General owns the next preparation decision after
Security review. Documentation owns the proposed preparation and cleanup.
The later browser attempt, provider operations and production telemetry each
retain their separate gates under [issue 268](https://github.com/durable-workflow/.github/issues/268).

This proposes a specific replacement for the mutable host input mounts in the
earlier browser plan. It packages the public artifact, exact source packet and
two locked dependencies in a derived Docker image, then identifies that image
by its full local content ID. No prepared image exists. The existing browser,
helper, tests, dependency lock, official base and disabled response rule remain
unchanged. Preparation would execute no Node, npm, package lifecycle, Playwright
or browser code. A source merge does not admit these operations.

## Subject and execution requirements

The [actual SDK #211 owner receipt](https://github.com/durable-workflow/sdk-rust/pull/211#issuecomment-6648721461)
binds main `46cf36514f7a39e819213771abf9efc82321c062`, protected push run
41959739724, deployment 7564108107, artifact 13384761426, 4,067,287 bytes,
ZIP SHA-256 `ea80b0d3191da525152b8f02ff2e3253a29ed93a723dfeae4c344eefb392cada`.
Its 484 files / 372 HTML pages retain the published 4.12.0 package/source tuple.
Against #212, exactly `__build.json`, `help.html` and `settings.html` change.
The utility-page delta only substitutes `worker_latency` for `workflow_testing`
in `data-current-crate`. Script hashes, origins and the parsed rule stay equal.
The earlier #212-bound packet is historical; no browser result carries.
This artifact expires November 6, 2026 at 03:10:05 UTC. Drift or expiry stops
preparation for a fresh subject review; there is no replacement dispatch.

The admitted native-amd64 Linux host needs an existing local Docker daemon,
trusted isolated Python with `memfd_create`, `MFD_ALLOW_SEALING` and the four
seal constants below, and its existing user systemd manager. Verify those
capabilities and fresh machine/daemon capacity before admission/use. Record
machine-specific placement facts in the existing operational channel rather
than this public source. No image was pulled, descriptor sealed or unit created.
Changing host requires fresh evidence. No vault or Cloud credential is needed.

## Admission boundary and independent lifetime

The proposed next decision covers only one acquisition/preparation sequence,
with at most one owned stopped container at a time. It does not admit the later
browser cell. Before acquisition, a separately reviewed controller and cleanup
implementation must have an exact source SHA and data-only fault controls.
They must not import packet modules. This document is not that implementation.

Use the existing user systemd manager for a transient service named
`durable-workflow-github-io-rust-preparation`, with `RuntimeMaxSec=600`,
`TimeoutStopSec=15`, `KillMode=control-group`, `Restart=no`, one CPU,
`MemoryMax=1G`, `TasksMax=64`, and `UMask=0077`. Its host-side controller owns
all subprocesses and a fixed allowlist of container names and recorded IDs.
Register independently supervised cleanup before the first pull/create. The
service's stop cleanup must remove owned containers even if the controller or
agent dies between create and ID recording. It must verify exact name, creation
window and ownership label before removal; a pre-existing name is a refusal.
Do not rely on the agent's shell trap or a guardian started after creation.

Read back the actual service limits, cleanup registration and first fresh
CPU/RAM/disk sample before declaring ready. Its cleanup remains active across
the whole sequence. A lost supervisor, timeout, unexpected object, missing
observation or cleanup failure stops and records nonpassing evidence. No retry,
new helper, sudo, daemon configuration or system service is included. If the
existing user-manager mechanism cannot be qualified, return the exact gap to
General before doing acquisition. Later browser lifetime/cleanup needs its own
reviewed controller and separate admission.

## Credential-isolated public acquisition

Create task-private transport state outside home and credential directories
only after admission. Every host subprocess gets an explicit environment:
fixed system `PATH`, task-only empty home, locale, task-only empty Docker config
and the fixed Docker endpoint. Do not inherit proxy variables, `.docker`,
credential helpers, `.npmrc`, netrc, SSH agent, tokens, profiles or repository
metadata. Do not print complete environments or authentication configuration.
There is no npm process or configuration lookup in this proposal.

Acquire the exact public official linux/amd64 base, without running it:

```text
docker image pull --platform linux/amd64
  mcr.microsoft.com/playwright@sha256:bc72a8df40831ded821e3cbc79c318c21b44d6e51dff9fd89ace7a8249c5b462
```

The controller supplies the empty Docker config and clean environment above.
Use no login, custom registry, daemon proxy change, tag selection, image build,
push or automatic retry. Independently compare the downloaded platform manifest
and config to the reviewed digest and config
`847f71bbb3f17fc1032d50d75bf6fb3fdcf188b16dff81f24667fe9ae9409e01`.
Record the base image ID, architecture, OS, layer list and size. Reject unexpected
volumes, on-build actions, platform, configuration or symlinked input prefixes.
Separately verify that the daemon's existing transport uses no credential-bearing
proxy for this public path. Clean client environment/configuration does not
establish that fact. An unknown or credential-dependent daemon path stops for
General's decision; do not inspect or print credential values or reconfigure it.

The official image acquisition is a daemon operation: the service CPU/memory
limits do not cap the Docker daemon. Before pulling, record the public manifest's
compressed layer sizes separately from the eventual unpacked image size, confirm
at least 20 GiB free disk and sample daemon/host use during acquisition. Stop
qualification if the resulting unpacked base exceeds eight GiB; this is an
acceptance budget, not an enforced daemon storage quota. Bound this phase
to 240 seconds. A client timeout is not proof that daemon transfer stopped;
independently reconcile the pull, partial cache and disk afterward. If that
completion cannot be established, hold later steps and name the retained cache
and owner. Do not prune shared layers or change daemon settings to recover.

Using only the trusted host Python standard library, fetch these two fixed
public URLs with TLS verification, no ambient proxy/authentication, no netrc,
no redirects, 30-second request deadlines and a 16-MiB compressed limit each:

- `https://registry.npmjs.org/playwright/-/playwright-1.64.0.tgz`
- `https://registry.npmjs.org/playwright-core/-/playwright-core-1.64.0.tgz`

Authenticate both complete byte buffers against the exact SHA-512 integrity
values in the externally authenticated `runtime/package-lock.json`. Do not
resolve versions, alter the lock, query a private registry or use a host npm
cache. HTTP failure, redirect, integrity/graph drift or unavailable archive
stops the sequence. An online package install is not a fallback.

## Construct dependencies without loading their code

In trusted isolated Python, inspect each authenticated archive as data. Accept
only unique regular files and directories under its single `package/` prefix.
Reject absolute/traversal/backslash/NUL paths, links, devices, sparse entries
or special permission bits. Ignore archive ownership and normalize it below.
Limit the combined dependency
closure to 10,000 files / 64 MiB unpacked. Parse package JSON as data and require
exact names/versions, the sole Playwright-to-core 1.64.0 dependency, no other
required/optional graph, and the reviewed lock graph of exactly two packages.
Do not execute package scripts or import either library.

Map those exact files to `/runtime/node_modules/playwright/` and
`/runtime/node_modules/playwright-core/`. Generate no npm `.bin` links or shim
scripts; the harness resolves the library through `NODE_PATH`, and requires no
package CLI. Record every relative path, size, content hash and normalized
mode. This deliberately replaces the earlier suggested npm-ci preparation.
It makes no npm-install-equivalence claim and requires its own source review.

Authenticate the nine-file packet closure with the externally reviewed manifest
hash before using its code/data, and match all 484 artifact files to the accepted
inventory. Combine only `/packet`, `/site` and `/runtime/node_modules` in one
canonical public tar, at most 128 MiB. Reset owners to UID/GID 1000, directories
to 0555 and files to 0444 plus only already-reviewed executable bits; preserve
file bytes. Refuse links, extra roots, duplicate names and shadow modules.
No host home, config, cache, credentials, logs or controller source enters it.

The controller writes that complete verified tar to a Linux anonymous memory
file, adds `F_SEAL_WRITE | F_SEAL_GROW | F_SEAL_SHRINK | F_SEAL_SEAL`, and reads
back all four seals plus the full tar hash before any Docker copy. The same
sealed descriptor, rewound, supplies Docker's standard input. A mutable path
is never re-opened for this transfer. Seals close the validation-to-copy race;
they are not a claim that a mutable worktree has become immutable. No such
descriptor, tar or dependency tree has been made by this proposal.

## Content-addressed custody and independent readback

Create `durable-workflow-github-io-rust-custody-assemble` from the exact cached
base using `--pull=never`, network none, no ports/mounts/volumes, one CPU,
512 MiB, 64 PIDs, `--init`, no added capabilities, no-new-privileges and command
`/bin/false`. Inspect its exact base ID, no mounts/volumes and `State=created`
before copying. **Never start it.** Stream the sealed tar to `docker cp -
<recorded-ID>:/`, without symlink following. Check the copy result and bounded
writable-layer size; commit this never-started container to a new local image.
Do not publish it or identify it by a mutable tag.

Docker commit does not include mounted volumes, which is why this assembler
must have none. Record the returned full `sha256:` image ID, config digest and
rootfs diff IDs; the original base chain must be an exact prefix with only the
new public-input layer added. Keep the image's default command `/bin/false`,
with no executable preparation hook. Remove the assembler normally by its
recorded ID and verify absence before creating the readback container.

Create `durable-workflow-github-io-rust-custody-verify` from that full derived
image ID with `--pull=never --read-only`, the same restrictions and no input
mounts. Inspect its actual image/config and never-started state. Stream each
of the three input trees out via `docker cp <ID>:<path> -`. Parse those tar
streams with trusted Python; never extract container-controlled paths onto the
host. Independently require exact path/mode/content equality to the sealed
public-input inventory, the external nine-file packet check and all artifact
and dependency hashes. Reject extra modules, symlinks, mounts or shadowing.
Remove the readback container and verify absence.

The resulting receipt names the base manifest/config, derived image ID/layer
chain, sealed tar hash, three tree inventories, external-verifier identity,
resource observations, acquisition/cleanup results and actual SDK subject.
The immutable image ID binds the snapshot; a later browser cell must select
that exact ID with a read-only root filesystem and **zero host input mounts**.
The base's existing browser binaries remain unchanged. Mutable staging trees
can then be removed, since execution would not read them.

Docker copy/commit are also daemon operations outside the controller's cgroup.
Their finite input budget and the independent whole-sequence deadline are
required alongside fresh host/daemon and disk samples. An unfinished operation
does not qualify merely because its client exited. Reconcile it before cleanup
or acceptance, and return an unresolved daemon operation to General.

This relies on the existing trusted host kernel and Docker daemon. It provides
custody against ordinary host-tree edits and unprivileged subject writes; it
does not protect against a malicious root/Docker administrator. Documentation
owns the new objects, coordinates exclusive use and records any other writer
as a stop condition. No new privilege or cross-agent branch ownership follows.

## Decision and completion record

Security first reviews this source design, exact current packet and proposed
custody boundary. General then decides whether to commission the exact
controller/fault controls and admit one named preparation attempt. Preparation
acceptance requires the complete independent readback and cleanup receipt; it
cannot be inferred from a successful pull, package hash or image commit.

Retain at most the reviewed base and one derived image under Documentation's
named cache ownership pending that decision. Record exact IDs and sizes;
remove owned transient containers, public transport state and sealed descriptors
at terminal cleanup. Never prune or remove another owner's/shared image.
Preparation failure preserves a bounded diagnostic receipt and stops; no retry
or browser follows. No registry publication, secret or paid resource is needed.

After accepted preparation, a separate source packet must bind the actual
derived image ID and update the browser launch shape from three host mounts
to these immutable in-image paths. Keep the existing two-test, one-browser,
network-none, two-CPU / two-GiB / 256-PID and 300-second limits. Qualify independent
cleanup and obtain separate browser admission before loading any packet Node
module. Candidate/compatibility/rollout flags remain false and current browser
status remains not-run throughout this preparation proposal.

Technical references:
[Docker's content-addressed image store](https://docs.docker.com/reference/cli/docker/image/pull/),
[tar streaming and stopped-container copy](https://docs.docker.com/reference/cli/docker/container/cp/),
[commit and excluded mounted volumes](https://docs.docker.com/reference/cli/docker/container/commit/),
[Python anonymous memory files](https://docs.python.org/3/library/os.html#os.memfd_create),
[systemd service deadlines and cleanup](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html).
