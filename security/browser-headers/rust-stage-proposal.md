# Rust response-header staging proposal

This is the disabled source proposal for
[organization issue 268](https://github.com/durable-workflow/.github/issues/268),
following [Docs #472's source delivery](https://github.com/durable-workflow/durable-workflow.github.io/pull/472#issuecomment-6646666461).
General owns the rollout decision and provider execution. Documentation owns
the artifact inventory, candidate and compatibility evidence. Security reviews
the exact proposal and independent acceptance. The Rust SDK owner supplies the
accepted public artifact and reports later artifact changes.

The only completed work here is artifact/source review and read-only HTTPS
identity comparison. Browser compatibility, provider preflight, staging and
rollout are **not run or approved**. All approval flags remain false. No provider
credentials or API were used. A source merge does not clear those gates.

## Exact input

The [Rust owner receipt](https://github.com/durable-workflow/sdk-rust/pull/211#issuecomment-6648721461)
binds the following accepted automatic protected build:

| Input | Value |
| --- | --- |
| Package | Published `durable-workflow` 4.12.0 |
| Public source | `4b2440a5618ccc1c98960ea2e1e62127042c3590` |
| Crate SHA-256 | `620a8287af73c363dac61f0a91f20971a39f3b8cdc9513fbea85cdbd95a74ba4` |
| Tooling | `46cf36514f7a39e819213771abf9efc82321c062` |
| Protected run | [41959739724](https://github.com/durable-workflow/sdk-rust/actions/runs/41959739724), push, attempt 1 |
| Successful deployment | `7564108107` |
| Pages artifact | `13384761426`, 4,067,287-byte ZIP |
| ZIP SHA-256 | `ea80b0d3191da525152b8f02ff2e3253a29ed93a723dfeae4c344eefb392cada` |
| Extracted inventory | 484 regular files, 372 HTML pages, 49 executable inline-script hashes |
| Inventory file SHA-256 | `ad4b2134cf4bdb42b7dfabd58ba145567c8b4facd9d9652f9af5c61604beb60a` |
| Policy file SHA-256 | `49eeb47bcb9e437f9830a2f93c89ced80cb2dfe84306ebfcc122fdf3975d0231` |
| Candidate file SHA-256 | `a20518e8341d94445cad433acb99e7e6e9ca42c837092248b83e10cf07540e08` |

The downloaded ZIP matched its GitHub API digest. Membership inspection rejected
absolute paths, parent traversal and non-regular members. Compared with the
accepted SDK #212 / Docs #478 subject, exactly `__build.json`, `help.html` and
`settings.html` differ. The two utility pages only replace
`data-current-crate="workflow_testing"` with `data-current-crate="worker_latency"`.
All other files and every inventoried script/style/handler/origin record are
identical. Public package/source identity is preserved. The old #212 tuple and
its accepted source reviews remain historical in #478. The historical browser
pass remains in `history/rust-sdk207-browser-validation.json`; it does not qualify
this artifact.

On November 5, 2026, these actual HTTPS responses returned 200 and
matched the artifact byte for byte. All six proposed security headers were
absent. This is a finite identity sample, not a live site-wide compatibility run.

| Path at `https://rust.durable-workflow.com/` | SHA-256 |
| --- | --- |
| `__build.json` | `3e8d1827d1df8bf3c47ee8f0efcbd2f3692cb1bd8741f40c1271ef5c74f4a183` |
| `index.html` | `b2e918903002c3d863aab6eb77c44a01af5ece95d26bb433120d396cae055fae` |
| `durable_workflow/index.html` | `8747b578d0749a534ae67416aeb79bca02b7e50c9c8194f85aae883cc99f0e20` |
| `durable_workflow/struct.Client.html` | `1c4a15c7383e28a3af199e55ee217a157165f45e131dd6e708ef5788661606b1` |
| `durable_workflow/struct.WorkflowHandle.html` | `4eceaae93e24c0b31a83d7cb95737ddc9e51fae025e271a025fd5185e49ac31c` |
| `navigation.js` | `718db7a749882b290853d988ba0681b44f97fe651e4ebff078b186ff021a3a37` |
| `help.html` | `6169059db0e7b8c17267d47d59780af8ba387556a49ddc19d4841a0b296177de` |
| `settings.html` | `977ba0a22dbb3352c07d82c18569203bd5b4636c2f2aa20fc55d5e7bc302cfb0` |

## Exact candidate

`rust-policy.json`, `rust-inventory.json` and `rust-rule.candidate.json` bind this
artifact. The candidate's `rule` object is identical as parsed JSON to
the reviewed SDK #207 rule. Its changed envelope records the new provenance and
inventory. All six header names, operations and values are unchanged.

The phase is `http_response_headers_transform`. The expression is exactly
`(http.host eq "rust.durable-workflow.com" and http.request.scheme eq "https")`.
The disabled rule uses six `set` operations, including the enforcing CSP with
`frame-ancestors 'none'`, X-Frame-Options DENY and `max-age=300` HSTS. The CSP
SHA-256 is `b002ffc9f95abc8145319d8a045aef9f0184d323d81ff9aec5a9de54d2f2d710`.
Its complete header line is 3,135 ASCII bytes, below the documented 4 KB limit.
There is no script `unsafe-inline`, `unsafe-eval`, wildcard or new origin.

This envelope is not an API request. Do not PUT it as an entire ruleset. Before
any later approved write, General must attach the exact single-rule API diff,
the existing rule order and the rollback diff to issue 268 for review. Preserve
all unrelated rules. A change in expression, headers, flags, inputs or order
requires a new review.

## Proposed admission and acceptance

1. **Current-artifact compatibility, Documentation.** Obtain separate admission
   for one bounded network-disabled run of the existing browser harness against
   these exact inputs. Check all 49 inline-hash representatives, search, fonts,
   code samples, help/settings, ordinary links, keyboard/compact navigation,
   history back, direct-entry fallback, inline-script refusal and framing
   refusal. Record violations and network requests. Recheck the live build
   identity before using the result. No old browser pass substitutes for this.
2. **Provider preflight, General.** Before a staging decision, identify the
   actual zone/ruleset/DNS record, existing proxy state, plan capacity and
   zone-scoped credential delegation through the approved private operational
   record. Record sanitized baseline fingerprints and a precise diff on issue
   268. These facts are currently unverified; no credential provisioning or
   paid plan is assumed. A missing delegation returns to General as a concrete
   provisioning decision. Do not fetch a vault or widen token scopes per command.
3. **Routing and TLS, General.** Preserve Pages deployments, CNAME/custom domain,
   valid Pages origin certificate, HTTPS enforcement and certificate renewal.
   Verify the edge certificate and strict authenticated HTTPS to the Pages
   origin. A zone-wide SSL/TLS, cache, HSTS, redirect or feature change is outside
   this proposal. Capture the existing DNS-only rollback target and TTL before
   admitting a Rust-only proxy change. Stop if GitHub's custom-domain or renewal
   path cannot be preserved. No Worker, origin move or certificate replacement
   is proposed.
4. **Exact rollout decision, General and Security.** Review the current artifact,
   browser result, provider baseline, exact diff and tested rollback procedure.
   Name the execution window and independent observer in issue 268. Authorize
   only the Rust hostname. First verify the proxy traffic path with the header
   rule disabled, then admit the separately reviewed enabling diff. Keep other
   hostnames and all unrelated rules/settings unchanged. Stop on drift or an
   intervening public artifact deployment. A new artifact requires regeneration
   and current review even if the crate version stays the same.
5. **Public checks, Documentation and independent Security observer.** After an
   admitted apply, compare origin/artifact/live bytes and MIME types for the
   identity sample, HTML, JS, CSS, fonts, search shards, redirects and a missing
   route. Check cold and warm cache responses, actual TLS and HTTP-to-HTTPS
   redirects, all six exact response headers and the browser controls above.
   Check default provider error/challenge behavior: Transform Rules also affect
   provider error pages, so no blanket error-page compatibility is assumed.
   Check that proxy features do not rewrite executable content or inject new
   scripts. Record unexpected CSP violations as failures. Compare apex, www,
   Python and PHP baseline responses for unintended changes.
6. **Telemetry, Documentation with General.** The exact artifact's
   `analytics/analytics.js` loads the Cloudflare beacon and sends promotion
   impression/click events to `/early-access/promotion-events` with credentials
   omitted. It returns early for `navigator.webdriver` and requires the Rust
   hostname for promotion events. The existing loopback browser harness does
   not exercise those paths. Before claiming telemetry compatibility, review
   and separately admit a local control using the public hostname with all
   traffic routed locally, an explicit controlled non-webdriver branch, and
   intercepted beacon/promotion requests. Assert origins, paths and event shape
   without sending production events. Label any harness instrumentation and
   keep the artifact bytes unchanged. A later live stage must separately admit
   ordinary page-view telemetry and
   verify actual delivery to the existing endpoints. No synthetic promotion
   POST, new reporting collector, analytics setting or paid service is admitted
   here. An intercepted request or a missing signal is not proof of delivery.
7. **Observation and disposition, General.** The proposed window is five minutes
   for immediate checks followed by fifteen minutes of bounded observation.
   Any failed content, TLS, redirect, cache, search, navigation, telemetry or CSP
   check triggers the reviewed rollback. Missing evidence also prevents stage
   acceptance. Record actual timestamps, rule/version identity, observations and
   independent post-apply/rollback results on issue 268. This window is proposed,
   not reserved or started.

## Rollback and HSTS

General owns rollback; Security independently checks the result. Capture the
predecessor rule/version/order and DNS/proxy settings before any admitted write.
For a header-only failure, disable/remove only this new rule or restore its
exact predecessor. Verify prior response headers and content. If the proxy path
itself fails, restore only the captured Rust DNS-only state after confirming
that the original Pages HTTPS certificate and routing remain valid. Do not
change nameservers, unrelated records or TLS settings to improvise recovery.
Retain failed evidence and allow for DNS/cache propagation.

HSTS is scoped to this hostname with `max-age=300`, without `includeSubDomains`
or preload. Use this response rule rather than the zone-wide HSTS switch. No
increase is proposed. Keep valid HTTPS throughout apply and rollback. Removing
the header does not clear previously cached HSTS; clients may retain it for up
to 300 seconds after their last qualifying response. If the reviewed recovery
needs `max-age=0`, serve it over valid HTTPS at the same hostname and independently
verify that response. Do not assume every client received it. Proxy rollback is
acceptable only while the direct Pages HTTPS path still works. Final staged
acceptance needs rollback observations and a separately recorded disposition;
source or static review alone cannot supply them.

The apex, www, Python and PHP remain outside this Rust proposal. Issue 268 stays
open until each site's complete artifact inventory, browser acceptance and live
response-header evidence is delivered under its own reviewed rollout.

Provider references, checked November 5, 2026:
[proxy status](https://developers.cloudflare.com/dns/proxy-status/),
[response-header rule API](https://developers.cloudflare.com/rules/transform/response-header-modification/create-api/),
[single-rule updates](https://developers.cloudflare.com/ruleset-engine/rulesets-api/update-rule/),
[header format and limit](https://developers.cloudflare.com/rules/transform/response-header-modification/reference/header-format/),
[response and error-page behavior](https://developers.cloudflare.com/rules/transform/response-header-modification/),
[HSTS requirements and per-host alternatives](https://developers.cloudflare.com/ssl/edge-certificates/additional-options/http-strict-transport-security/).
