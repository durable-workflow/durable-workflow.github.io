# Bounded Rust browser and telemetry check

This is an **unrun source packet** for the next local step in
[organization issue 268](https://github.com/durable-workflow/.github/issues/268).
It follows [Docs #476's accepted main and Pages delivery](https://github.com/durable-workflow/durable-workflow.github.io/pull/476#issuecomment-6647323438).
General must separately admit the exact preparation and one browser attempt after
Security review. This file, its manifest and normal CI do not authorize that run.
No provider, credential, DNS, proxy, TLS, response-header, public telemetry or
production operation is proposed here.

## Inputs and provenance

`rust-local-browser-packet.json` binds the executable/data closure and exact
runtime. Its artifact tuple is the accepted SDK #212 input already recorded in
`rust-policy.json`: artifact 13382143373, ZIP SHA-256
`15f1e2745a0b268e1093820b3486c4910e8d1bf7b63062e562200586d3beef95`,
484 files / 372 HTML pages / 49 inline-script hashes. Public Rust 4.12.0 crate
and source identities are preserved; tooling matches the accepted SDK #212
build. The parsed rule, policy sources, approval flags and unrun status remain
unchanged. Input provenance fields now bind this artifact.

The proposed runtime is the existing Playwright 1.64.0 generation, pinned to the
official **linux/amd64** platform manifest in the packet. Registry metadata was
read without pulling or running that browser image. `runtime/package-lock.json`
records the two exact npm archives and integrity values. Only package-lock resolution, advisory metadata and inert source checks were
performed during this preparation. No
Playwright package, browser image or browser was executed for the source packet.

After separate admission, prepare a dedicated public dependency directory with
`runtime/package.json` and its lock. Use `npm ci --ignore-scripts --no-audit
--no-fund` with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`. Do not run lifecycle hooks,
`playwright install`, `npx` downloads or an image build. Verify the approved image
manifest/config, library version and lock integrity. Mount only its prepared
`node_modules` directory into the browser cell. No home directory, credentials,
Docker socket or unrelated repository is an input. An unavailable dependency,
different platform or runtime mismatch stops the attempt for review.

Before execution, independently verify the ZIP digest and safe regular-file
membership, recheck the accepted protected-run/deployment identity and compare
live `__build.json` with the exact artifact. Those are finite read-only checks.
Stop if the live input has changed, the artifact has expired, or a required input
is unavailable. Do not dispatch a replacement build or silently retarget the
packet. The input API expires this ZIP on November 6, 2026 at 02:19:51 UTC.

## What the proposed check exercises

The existing `rust-browser.test.cjs` keeps its 54-page/hash-representative,
search, history, direct-entry, compact navigation, inline-script and framing
controls. Its local routing now fulfills verified in-memory artifact buffers
under the public hostname. It never forwards or fetches a request. Service
workers are blocked, WebSockets are closed, unknown requests are refused, and
each context has a finite request budget. `--network=none` is the independent
container boundary. Using a synthetic HTTPS URL does not exercise real TLS or
HSTS. Image responses are finite fixtures and do not validate badge providers.

The current artifact has **no promotion DOM in any HTML page**. The real-page
non-webdriver control therefore requires no promotion request. A distinct,
labelled synthetic page supplies the expected promotion elements and loads the
unchanged artifact's `analytics/analytics.js`. Only that fixture exercises the
existing impression/click handlers. Separate controls retain the webdriver and
wrong-host refusals, and an unapproved connection must fail CSP.

The controlled non-webdriver getter, native-fetch option observer and prevention
of external click navigation are harness instrumentation. They do not alter any
artifact file. Promotion requests must have the exact two-key source/event body,
POST/text/plain, omitted credentials and no-referrer policy. Authorization and
cookies are refused for every intercepted request. The Cloudflare beacon module
and RUM response are **synthetic fixtures**, used only to exercise the loader and
CSP connection paths. They establish neither vendor-script compatibility nor
production delivery. No request reaches Cloud or Cloudflare.

Normal CI runs only `rust-browser-source.test.cjs` with fake routes and temporary
input files, plus the existing header-policy controls. It never imports
Playwright, launches a browser or runs the optional browser entrypoint.

## Required custody before execution

[Security's source review](https://github.com/durable-workflow/durable-workflow.github.io/pull/477#issuecomment-6647872853)
requires verification outside Node before any packet code is loaded. The
in-process check cannot authenticate code that is already executing. The exact
current packet SHA-256 is
`2060309bf48d3e179abf55c0f2e1ffbc4908fcd7227b0cc4eb11089afde71f2a`.

Before any separate preparation/run admission, General and Security must bind
an approved write-preventing mechanism and exclusive owner for all three public
staging trees. They must remain unchanged through the attempt. Host writers can
still change a read-only bind mount's source; bind flags and a prior hash alone
do not establish that custody. Ordinary mutable worktrees and downloaded caches
are not execution seals. An unavailable seal is a blocker, not authority to add
privileges, a helper, a writable mount or a new storage service.

After that separate admission, use the following literal reviewed command with
the host's trusted isolated Python interpreter. Copy it from the reviewed
record, not from an unverified packet file. Do not load any packet Python/Node
module to perform this check. Bind the interpreter identity in the execution
record. The packet and runtime staging paths must be outside home/credential
trees, absolute, regular, free of symlink components and exclusively owned.
Copy only the eight manifest members and the manifest into the packet tree.
Exclude repository metadata, extra modules/configuration and `node_modules`
from this tree so they cannot shadow the separately sealed runtime dependency.

```sh
/usr/bin/python3 -I - "$packet_directory" <<'PY'
import hashlib, json, stat, sys
from pathlib import Path, PurePosixPath

root = Path(sys.argv[1])
assert root.is_absolute() and root.resolve() == root
assert root.is_dir() and not root.is_symlink()
assert not root.is_relative_to(Path.home())
manifest_path = root / 'rust-local-browser-packet.json'
assert stat.S_ISREG(manifest_path.lstat().st_mode)
manifest_bytes = manifest_path.read_bytes()
expected = '2060309bf48d3e179abf55c0f2e1ffbc4908fcd7227b0cc4eb11089afde71f2a'
assert hashlib.sha256(manifest_bytes).hexdigest() == expected
manifest = json.loads(manifest_bytes)
assert manifest['run_status'] == 'not-run' and len(manifest['files']) == 8
expected_files = set(manifest['files']) | {'rust-local-browser-packet.json'}
actual_files = set()
for member in root.rglob('*'):
    mode = member.lstat().st_mode
    assert stat.S_ISREG(mode) or stat.S_ISDIR(mode)
    relative = member.relative_to(root).as_posix()
    if stat.S_ISDIR(mode):
        assert relative == 'runtime'
    else:
        actual_files.add(relative)
assert actual_files == expected_files
for name, expected_hash in manifest['files'].items():
    relative = PurePosixPath(name)
    assert not relative.is_absolute() and '..' not in relative.parts
    member = root
    for part in relative.parts:
        member = member / part
        assert not member.is_symlink()
    assert stat.S_ISREG(member.lstat().st_mode)
    assert hashlib.sha256(member.read_bytes()).hexdigest() == expected_hash
print('External packet and eight-member hash check passed; no packet code loaded.')
PY
```

This check is an integrity prerequisite. It does not create a seal or approve an
attempt. Record the separate write-prevention/custody proof and recheck the
mounts and cached image immediately before creating the admitted cell.

Dependency preparation is separately held. Its future admitted environment
must have a container-only empty home, distinct empty user/global npm config
files, a task-private cache, a public registry and an explicit environment
allowlist. No host home/profile, `.npmrc`, token, credential directory or secret
proxy setting may be inherited. Set `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` and
`--ignore-scripts`; use the exact lock and verify both archive integrity values
and library version. Do not import Playwright during preparation. Enumerate and
hash the resulting dependency tree, reject external links, then establish its
approved immutable/exclusive custody before any browser code resolves it.
No such environment, dependency tree or seal has been created by this source
retarget. Missing preparation/image/custody proof leaves execution held.

## Proposed execution and cleanup

Documentation owns one attempt and cleanup. General names the admitted executor
and host after fresh capacity and competing-work checks. The proposal is one
native amd64 container, at most **2 CPUs / 2 GiB / 256 PIDs**, two sequential
tests and at most one active browser. Test deadlines are 150 and 90 seconds;
the external container deadline is 300 seconds with a ten-second kill grace.
There is no automatic retry, host IPC, privileged mode, extra capability or
published port. The writable tmpfs and private shared memory count within the
container's memory cap. This is a proposed budget, not a reservation.

The following is the exact proposed launch shape after admission, the external
pre-load hash check and accepted custody proof above. Assign the
three absolute input paths from the reviewed public-input preparation; reject
commas/newlines in those paths. `packet_directory` contains only this public
packet. `runtime_modules` is the prepared public dependency tree. Do not point
either at a home or credential directory. The pinned image must already exist;
`--pull=never` prevents an implicit network preparation during the attempt.

```sh
set -eu
container_id=
cleanup() {
  if [ -n "$container_id" ]; then docker rm --force "$container_id"; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
container_id=$(docker create --pull=never --platform linux/amd64 \
  --name durable-workflow-github-io-rust-csp-telemetry \
  --init --user pwuser --cpus=2 --memory=2g --pids-limit=256 \
  --network=none --read-only --cap-drop=ALL \
  --security-opt=no-new-privileges:true --shm-size=256m \
  --tmpfs /tmp:rw,size=536870912,mode=1777 \
  --mount "type=bind,source=$public_artifact_directory,target=/site,readonly" \
  --mount "type=bind,source=$packet_directory,target=/packet,readonly" \
  --mount "type=bind,source=$runtime_modules,target=/runtime/node_modules,readonly" \
  --env NODE_PATH=/runtime/node_modules \
  mcr.microsoft.com/playwright@sha256:bc72a8df40831ded821e3cbc79c318c21b44d6e51dff9fd89ace7a8249c5b462 \
  node /packet/rust-browser.test.cjs /site \
  /packet/rust-rule.candidate.json /packet/rust-inventory.json)
timeout --signal=TERM --kill-after=10s 300s docker start --attach "$container_id"
exit_code=$(docker inspect --format '{{.State.ExitCode}}' "$container_id")
exit "$exit_code"
```

The cleanup trap removes only the ID created by this invocation; a name collision
fails rather than deleting an existing container. The admitted executor must
independently verify absence afterward. A timeout, refused request, changed
input, browser error, budget violation, missing output or cleanup failure is
nonpassing evidence. Preserve the original result and stop for review. Do not
weaken CSP, increase permissions, fetch a new runtime or retry automatically.

Record the exact source commit/tree, packet-file hashes, runtime identities,
artifact tuple, timestamps, test outputs, request audits, exit/timeout status
and independent cleanup observations on issue 268. Keep diagnostic logs bounded
and remove temporary material after review. Do not edit the accepted result
files to claim a pass before an actual admitted result and independent review.
Public telemetry, real TLS/HSTS and provider rollout acceptance stay separate.

Runtime references:
[official image contents and package separation](https://playwright.dev/docs/docker),
[request interception](https://playwright.dev/docs/network),
[browser-context routes](https://playwright.dev/docs/api/class-browsercontext#browser-context-route).
