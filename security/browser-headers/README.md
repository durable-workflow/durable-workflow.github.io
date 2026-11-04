# Documentation response-header design

This is the source-only design for [organization issue 268](https://github.com/durable-workflow/.github/issues/268).
General selected the existing Cloudflare response-header path. General owns a later
rollout decision, following Security review. Nothing in this directory applies a
rule or changes DNS, proxy status, Pages, certificates, custom domains or Workers.
The candidate is disabled and both approval flags remain false.

## Reviewed input and source prerequisite

`rust-policy.json` binds the accepted Rust 4.12.0 public crate and the original
[protected documentation run](https://github.com/durable-workflow/sdk-rust/actions/runs/41900241978),
artifact 13358175469. Its ZIP SHA-256 is recorded with its tooling revision.
The full input contains 484 regular files and 372 HTML pages.

The original `help.html` and `settings.html` contain `javascript:` links and
inline history-back handlers. The generator refuses them. The proposed
[SDK source correction](https://github.com/durable-workflow/sdk-rust/pull/207)
provides a safe crate-index fallback and an external history listener. It
preserves modified clicks, direct-entry fallback and ordinary history back.

The committed inventory describes a **local derivative**, not a new published
artifact. `rust-prototype-derivation.json` records the three changed files, their
before/after hashes and the unchanged `__build.json`. `source_preparation` keeps
that distinction in the inventory and candidate. After the SDK change is merged
and its ordinary protected build is accepted, replace this prototype evidence
with the actual artifact identity and regenerate before requesting rollout.

## Policy and inventory

The generator hashes every file and inventories every HTML page. It collects
executable inline script/style hashes, handlers, JavaScript URLs, inline-style
counts and declarative resource origins. It rejects symlinks, unreviewed origins,
handlers, JavaScript URLs, inline-style attributes, build/provenance drift and
headers exceeding the provider's 4 KB limit. Hashes authorize script elements;
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

`rust-browser-validation.json` records the completed prototype run: Chromium
156.0.8078.4, 54 pages covering all 49 script hashes, search, history back,
direct-entry fallback, compact navigation, rejection of an unapproved inline
script, and response framing rejection. The first attempt failed a test-harness
assumption about a new page's history length. The successful attempt explicitly
resets navigation history for the direct-entry control. It does not establish
TLS, HSTS, public telemetry delivery or public rollout acceptance.

## Rust-only staged acceptance and rollback

1. Accept the SDK source change and its ordinary protected Pages build. Bind the
   actual package, source/tooling revisions, artifact ZIP and `__build.json`.
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
