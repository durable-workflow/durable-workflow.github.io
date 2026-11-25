# Documentation response-header design

## Current path: one ruleset for all five hostnames

[`zone-rules.json`](zone-rules.json) is the response-header ruleset for
durable-workflow.com, www, python, rust and php. It is the body for the
Cloudflare zone's `http_response_headers_transform` phase entrypoint. It
replaces the Rust-only candidate below, which must not be applied with it,
because both set `Content-Security-Policy`.

GitHub Pages cannot set response headers, and an HTML meta tag cannot carry
HSTS, `frame-ancestors` or a Report-Only policy. The headers therefore need the
Cloudflare proxy in front of Pages. As of November 25, 2026 all five DNS
records are DNS-only and resolve to GitHub Pages, so nothing in this file is
live yet.

The first rule sets these headers on all five hostnames:

| Header | Value |
| --- | --- |
| `Strict-Transport-Security` | `max-age=300`, no `includeSubDomains`, no preload |
| `Content-Security-Policy` | `frame-ancestors 'none'` (enforced) |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | disables accelerometer, camera, geolocation, gyroscope, magnetometer, microphone, payment and USB |

The other four rules each set one site's resource policy as
`Content-Security-Policy-Report-Only`. Each policy starts from
`default-src 'self'` and allows only what that site's build output and scripts
load:

- **All sites:** the Cloudflare Web Analytics beacon, plus requests to
  cloudflareinsights.com, the cloud.durable-workflow.com promotion endpoint
  and the status.durable-workflow.com status widget.
- **durable-workflow.com:** `'unsafe-inline'` scripts and styles. The build has
  about 1,700 client-redirect pages, each with its own inline script, and
  roughly 227,000 inline style attributes, so hashes cannot cover it. Images
  from GitHub, mermaid.ink and miro.medium.com.
- **python:** five inline-script hashes from mkdocs-material, and api.github.com
  for the repository widget.
- **rust:** four inline-script hashes, and README badge images.
- **php:** one inline-script hash, and the phpDocumentor Prism, Fuse and
  css-vars-ponyfill files on cdn.jsdelivr.net, scoped to their paths.

### Rollout

1. Turn on the proxy for the five records with SSL mode Full. Confirm that the
   Pages custom domains, the www redirect and the certificates still work.
2. Read the zone's current `http_response_headers_transform` entrypoint. A PUT
   replaces every rule in that phase, so merge any existing rules first. Then
   apply `zone-rules.json`.
3. Record evidence from all five hostnames:
   `node scripts/docs-security-headers.js check-live --json`. The command
   exits non-zero until every header matches.
4. Browse navigation, versioned pages, search, code samples and fonts on each
   site with the browser console open. Report-Only violations appear there.
   Once a site is clean, change its rule's header to
   `content-security-policy` with the same value. That value already includes
   `frame-ancestors 'none'`, so it replaces the first rule's frame-only policy
   for that host.
5. Raise the HSTS max-age in steps, for example a day, then a week, then a
   year. Add `includeSubDomains` only after every subdomain and rollback path
   has been verified.

`node scripts/docs-security-headers.js validate` and the unit tests in
`scripts/docs-security-headers.test.js` keep these invariants. After a site's
generator or theme changes, rerun
`node scripts/docs-security-headers.js inventory --root <built site> --origin https://<host>`
and update that site's hashes and origins.

The policies were checked on November 25, 2026 against the current Pages
builds (docs and php artifacts, python and rust mirrors). Headless Chromium
158 loaded 83 sample pages under each host's real origin with the Report-Only
header, including home, versioned, localized, search, help, settings, API and
mermaid pages, and recorded no violations.

## Earlier Rust-only design

This is the source-only design for [organization issue 268](https://github.com/durable-workflow/.github/issues/268).
General selected the existing Cloudflare response-header path. General owns a later
rollout decision, following Security review. Nothing in this directory applies a
rule or changes DNS, proxy status, Pages, certificates, custom domains or Workers.
The candidate is disabled and both approval flags remain false.

## Reviewed input and source prerequisite

`rust-policy.json` binds the accepted Rust 4.12.0 public crate and the
[protected documentation run](https://github.com/durable-workflow/sdk-rust/actions/runs/41959739724),
artifact 13384761426. Its ZIP SHA-256 is recorded with its tooling revision.
The full input contains 484 regular files and 372 HTML pages.

The earlier artifact's `help.html` and `settings.html` contained executable
links and inline history-back handlers. The generator refuses them. The merged
[SDK source correction](https://github.com/durable-workflow/sdk-rust/pull/207)
provides a safe crate-index fallback and an external history listener. The sole
automatic protected build and deployment for the current proposal are successful
at tooling revision `46cf36514f7a39e819213771abf9efc82321c062`. Public package/source
identities remain unchanged. Eight live identity, navigation, help/settings and
API files matched this artifact on November 5, 2026. The
[current staging proposal](rust-stage-proposal.md) records their hashes and the
separate acceptance that remains pending.

The current inventory describes that accepted published artifact.
`source_preparation` is null. `history/` retains the earlier local derivative and
the accepted SDK #207 artifact's browser result as historical evidence only.
The derivative was not a public artifact. Compared with accepted SDK #212,
SDK #211 changes exactly `__build.json`, `help.html` and `settings.html`. The two
utility pages only replace `workflow_testing` with `worker_latency` in generated
`data-current-crate` metadata. All 372 page-resource records, executable script
hashes and the parsed rule are unchanged. That static comparison does not carry
forward the earlier browser pass. Current compatibility is unrun and the rule
remains disabled.

## Policy and inventory

The generator hashes every file and inventories every HTML page. It collects
executable inline script/style hashes, handlers, JavaScript URLs, inline-style
counts and declarative resource origins. It rejects symlinks, unreviewed origins,
handlers, JavaScript URLs, inline-style attributes, build/provenance drift and
headers exceeding the provider's 4 KB limit. URL validation uses allowed schemes
and refuses normalized active schemes, including VBScript and embedded controls.
Rustdoc's unresolved `crate::`, `super::` and `TryFuture::` reference targets are
allowed only as restricted Rust path syntax in anchor links. They remain
unresolved references, not script or asset origins. Hashes authorize script elements;
they do not authorize event-handler attributes.

The Rust prototype has 49 distinct executable inline-script hashes. Its policy
uses exact hashes, self-hosted assets, and these explicitly reviewed external
origins:

| Use | Origins | Reason |
| --- | --- | --- |
| Script | `static.cloudflareinsights.com` | Existing analytics loader |
| Connect | `cloudflareinsights.com`, `cloud.durable-workflow.com` | Existing analytics and promotion requests |
| Image | `github.com`, `img.shields.io`, `sonarcloud.io` | Existing README badges |

Images also allow `data:`. Other resources use their recorded self-hosted policy.
The HTML inventory cannot discover every URL constructed by JavaScript or CSS.
The allowlist also requires asset-source review and browser checks. Observing an
origin never adds it to the policy automatically. External scripts retain the
trust already granted to those providers and may change independently.

The response rule targets only HTTPS requests to `rust.durable-workflow.com` in
`http_response_headers_transform`. It sets:

- CSP with `default-src 'none'`, explicit resources/hashes, no inline attributes,
  no eval, no objects, no child frames and `frame-ancestors 'none'`.
- `Strict-Transport-Security: max-age=300`, without `includeSubDomains` or preload.
- `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`.
- A permissions policy disabling camera, microphone, geolocation, payment and USB.
- `X-Frame-Options: DENY` as a response-header compatibility fallback.

Frame protection must be delivered in the HTTP response. An HTML meta tag cannot
substitute for `frame-ancestors` or X-Frame-Options.

## Reproduce the source checks

Use the repository's Node 24 toolchain and installed locked dependencies:

```sh
npm run test:browser-security-headers
node scripts/browser-security-headers.js --root "$public_site_directory"
```

The second command reads public build output and the fixed policy, then writes
only `rust-inventory.json` and `rust-rule.candidate.json` in this directory. It
makes no network or provider request. Supply only the verified public artifact
or its explicitly documented local derivative. Compare regenerated files before
committing. Do not hash a private workspace or credential directory.

`rust-browser.test.cjs` is an optional local compatibility test. With Playwright
1.64.0 available, its arguments are the public site directory, candidate JSON and
inventory JSON. Run it in a bounded, disposable, network-disabled container using
the matching official Playwright image. Copy only these public inputs and the
test dependencies into the container, set an absolute deadline, and remove the
container afterward. It serves on container loopback and intercepts external
requests locally. It does not need credentials, published ports or a Docker socket.

`history/rust-sdk207-browser-validation.json` records the earlier accepted-artifact check: Chromium
156.0.8078.4, 54 pages covering all 49 script hashes, search, history back,
direct-entry fallback, compact navigation, rejection of an unapproved inline
script, and response framing rejection. The earlier prototype's first attempt failed a test-harness
assumption about a new page's history length. The successful attempt explicitly
resets navigation history for the direct-entry control. It does not establish
TLS, HSTS, public telemetry delivery or public rollout acceptance.

`rust-browser-validation.json` records that the current artifact has not received
a browser compatibility check. No current-artifact browser run or provider stage
is authorized by this source proposal. Follow `rust-stage-proposal.md` for the
exact input bindings, ownership, proposed checks and rollback decision.

`rust-local-browser-plan.md` and `rust-local-browser-packet.json` define the
separately reviewable, unrun local browser/telemetry packet. Normal CI exercises
only its inert source controls. The optional browser entrypoint requires its
own exact run admission; it makes no provider or production request.
`rust-preparation-proposal.md` supplies the next separately reviewed acquisition
and immutable-image custody design. No acquisition, seal or prepared image exists.
The separately gated [controller source](rust-preparation-controller.md) has
inert fault controls; its operational admission remains unset.

## Rust-only staged acceptance and rollback

1. Bind the accepted package, source/tooling revisions, protected artifact ZIP
   and `__build.json` (as recorded above for the current Rust build).
   Regenerate the complete inventory and candidate and repeat compatibility
   controls against those exact inputs. No manual build dispatch is implied.
2. Security reviews the exact candidate, asset origins, browser evidence and
   provider limits. General decides whether to admit the separate rollout.
3. The admitted executor first reads the existing zone, DNS/proxy state, active
   rules and their order. Cloudflare must actually serve the response for a
   Transform Rule to affect it. A DNS-only Pages origin does not qualify. Any
   required proxy change needs a separately reviewed decision preserving Pages
   origin routing, certificate validation and custom domains. Stop on drift.
4. Save the previous rule set and precise rollback diff. Preserve every unrelated
   rule and its order. Do not replace a full ruleset with this single candidate.
   Apply only the admitted Rust rule. A report-only CSP stage may precede
   enforcement if the reviewed rollout specifies it; the committed candidate
   describes the eventual enforcing policy, not an authorized API payload.
5. Check actual HTTPS responses at the Rust hostname: exact headers, redirects,
   MIME types, asset loading, search, keyboard/compact navigation, both Back
   behaviors, analytics requests and an independent framing/inline-script
   negative control. Confirm apex, Python, PHP and www behavior is unchanged.
   Record deployed rule identity and exact artifact/live evidence on issue 268.
6. On a broken asset, navigation failure, unexpected CSP violation, origin or
   certificate regression, disable/remove only the new rule or restore its saved
   predecessor. Verify the old headers and normal page behavior. Keep the failed
   evidence. HSTS persists in clients for up to 300 seconds; removing the header
   does not immediately clear their cached policy. A reviewed rollback may send
   `max-age=0` over valid HTTPS. Never use DNS or certificate changes as an
   improvised header rollback.

Future documentation releases must regenerate hashes before changing public
assets. A reviewed transition may temporarily admit the union of old and new
hashes, verify the exact new artifact live, then remove obsolete hashes. A new
domain, resource origin, handler or a policy exceeding the header limit requires
new source review. Do not silently add unsafe-inline, unsafe-eval or wildcards.

The apex, www redirect, Python and PHP sites require separate complete artifact
inventories and browser acceptance after Rust succeeds. Homepage sampling found
additional Docusaurus/Sphinx inline content and is insufficient for a CSP. No
policy for those hosts is generated or admitted by this packet.

References: [Cloudflare proxy status](https://developers.cloudflare.com/dns/proxy-status/),
[response-header API](https://developers.cloudflare.com/rules/transform/response-header-modification/create-api/),
[header limits](https://developers.cloudflare.com/rules/transform/response-header-modification/reference/header-format/),
[CSP specification](https://www.w3.org/TR/CSP3/).
