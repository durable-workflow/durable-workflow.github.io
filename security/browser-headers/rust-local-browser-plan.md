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
runtime. Its artifact tuple is the accepted SDK #209 input already recorded in
`rust-policy.json`: artifact 13375154247, ZIP SHA-256
`ff902191bdb90f7f1d047ecc5d27e9b8c5215a0239e4f11fcbf574f7ddab83d1`,
484 files / 372 HTML pages / 49 inline-script hashes. Public Rust 4.12.0, crate
source and tooling identities are preserved. `rust-rule.candidate.json` and all
policy/approval/browser-result files remain unchanged and disabled/unrun.

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
packet. The input API expires this ZIP on November 6, 2026 at 00:09:56 UTC.

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

## Proposed execution and cleanup

Documentation owns one attempt and cleanup. General names the admitted executor
and host after fresh capacity and competing-work checks. The proposal is one
native amd64 container, at most **2 CPUs / 2 GiB / 256 PIDs**, two sequential
tests and at most one active browser. Test deadlines are 150 and 90 seconds;
the external container deadline is 300 seconds with a ten-second kill grace.
There is no automatic retry, host IPC, privileged mode, extra capability or
published port. The writable tmpfs and private shared memory count within the
container's memory cap. This is a proposed budget, not a reservation.

The following is the exact proposed launch shape after admission. Assign the
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
