# One Durable Workflow

Canonical shared identity for the main documentation, PHP, Python, Rust, Cloud
and status sites. Implement these values in each site's existing components;
these exports do not require a shared package or a runtime dependency.

Design authority: One Identity PDF SHA256
`5a71d08636a1e2714e8dd4b6561ce0a619453c842de4de647cc3e345f7706e50`
and identity artboard SHA256
`c992bf43b7c7492f181bc1b8045812dc2a6c85a33bbdbe0be64f714234825187`.
The viewer scripts and illustrative product data are not implementation inputs.

## Assets and roles

- [Original flowchart SVG](../img/logo.svg), 3,087 bytes, SHA256
  `24e3ef905304b6bbb255ca7855cb47d2e9712d7af82dcfbea15570851ee091f8`.
  Preserve its proportions, colors and complete viewBox. No recoloring or filter.
- [Role tokens](tokens.css): Paper, Surface, Ink, Ink2, Muted, Line, Action, Tint.
  Light is the default; dark is an explicit user choice. Persist that choice.
- Use Space Grotesk 600 headings, Inter 400/500/600 body and UI, JetBrains Mono
  code and labels. Serve fonts locally, retain their licenses, use `font-display:
  swap`, and keep system fallbacks for scripts outside the local font subset.
- H1 56–72px, H2 32–40px, H3 20px; display tracking -0.03em, scaled on mobile.
  Body 16px/1.5; lede 18–20px; UI 14px; small 13px; code 13–15px.
  Eyebrows 12px uppercase with 0.08em tracking.
- Code blocks use fixed Ink `#0F1513` and light text in both themes. Contain
  horizontal code scrolling. Cards use Surface, a 1px Line border and 8px radius,
  without shadows or accent stripes. Actions have 6px radius and a minimum
  44px target height. Keep one contextual primary action per view.
- Amber, red and blue express status, not ornamental language identities.

## Chrome and navigation

Use `Durable Workflow / <surface>` beside the original mark. The surface label
is lowercase mono and Action (Durable Green in light, Mint in dark). Main docs
use `docs`; the other labels are `python`, `rust`, `php`, `cloud`, `status`.
The logo sits on an unchanging Paper chip (`#F6F7F5`, 8px radius, 4px padding)
in dark mode. The main brand link returns to the site's landing page.

Global navigation order: **Docs / SDKs / Cloud / Pricing / Status**. SDKs opens
Python / Rust / PHP. Indicate the current surface with bold Ink and an accessible
current-page state. Include GitHub and a contextual action (Get started,
Dashboard or Subscribe). Keep keyboard focus visible. The switcher must open
with keyboard and pointer, close with Escape, and retain ordinary link behavior.
Mobile navigation must expose all destinations and close without trapping focus.

The local documentation toolbar retains version, locale and search controls;
it is separate from the shared navigation row. Keep existing API navigation,
stable and historical routes, anchors and locale routing intact.

The [public link map](links.json) uses canonical current docs URLs rather than
the historical `/docs/2.0/` alias. Each renderer may localize internal main-site
links using its existing router. External SDK and product links stay canonical.

Footer columns: **Brand / SDKs / Run / Project**. Brand has the original mark,
wordmark and product description. SDKs: Python / Rust / PHP. Run: self-hosted
Server / Cloud / Pricing / Status. Project retains GitHub, compatibility, terms,
privacy and existing community/documentation links. Keep legal destinations
bound to their owning site's real routes.

## Status and product authority

The footer status pill links to the public status site. Without accepted current
health data, display **Status unknown** in neutral colors. A linked static green
"all systems operational" is not evidence. Use the existing anonymous public snapshot at `statusApi` in the link map.
The [shared consumer](status.mjs) reads only the aggregate and sanitized public
customer impact. Require schema `durable_workflow.status_page_snapshot.v1`,
Cloud/prod identity, valid nonfuture checked/generated timestamps, a fresh state,
and a recomputed evidence age below the producer cutoff (at most 900 seconds).
`customer_visible=false` and empty component rows alone do not imply unknown.
Calendar dates must round-trip without normalization (for example, February30
and24:00 cannot establish evidence). This consumer intentionally requires a known
local offset, refusing literal `-00:00` while admitting `Z`, `+00:00` and valid
nonzero offsets. [RFC3339 section4.3](https://www.rfc-editor.org/rfc/rfc3339#section-4.3)
distinguishes an unknown local offset from an unknown UTC instant; the restriction
here is a conservative consumer policy, consistent with the producer's `+00:00`
output.

Top-level status vocabulary is `ok|warning|failed|unknown`; alert levels are
`ok|warning|critical|unknown`. A fresh `failed` or `critical` aggregate/impact
shows **Service incident**; warning shows **Service degraded** (or **Maintenance**
when maintenance is the sole public affected family). Unknown or unrecognized
values cannot show green. Only fresh `ok/ok` with no contradictory impact/reason
shows **All systems operational**.

Public reasons override presentation: `cloud_unreachable` → **Status unavailable**;
`monitor_stale|probe_unverified` → **Status unverified**; `publisher_stale` or expired
freshness → **Status stale**. Malformed/future evidence and network/HTTP/JSON failures
show **Status unknown**. Never render internal components, operator alerts, or
artifact-version rows from the snapshot.

Use anonymous GET, credentials omitted, no referrer, no cache and no redirects;
a five-second request deadline, at most one request at a time and a sixty-second
refresh after completion. Invalidate a previous result at its evidence deadline
while refreshing. Cleanup aborts the request and clears timers on navigation.
Cloud owns the existing public-GET CORS allowlist; each consumer owns its CSP
`connect-src https://status.durable-workflow.com`. This adds no status service,
account or SDK-runtime telemetry. Keep an accessible linked unknown fallback if
the feed cannot be read.

Versions, commands, support floors, prices, SLA and health values come from the
existing published package/catalog/status contracts. The design's sample values
are illustrative. Styling may ship independently of package releases; it does
not authorize promoting unreleased APIs or changing the selected stable package.

## Delivery

Check actual built pages at desktop and narrow mobile widths in both themes.
Verify navigation, SDK switching, search, version/locale selectors, focus and
copy controls. Preserve executable examples and existing publication boundaries.
Each site owns its normal protected build/deployment and actual live acceptance.
