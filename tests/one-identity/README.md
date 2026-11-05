# One Identity built-page acceptance

Build the site with the repository's supported Node 24 toolchain and normal
checks. Run `browser.cjs` against that output using an existing Playwright client
and an owned headless Chromium profile:

```sh
NODE_PATH=<existing-public-tool-modules> \
DW_BROWSER_EXECUTABLE=<existing-browser-executable> \
DW_SOURCE_REVISION=<built-source-commit> \
node tests/one-identity/browser.cjs <build-directory> <owned-output-directory>
```

Set `DW_PREVIEW_MODE=chrome` for the bounded follow-up after a global-header
styling correction: retain the four desktop/mobile theme views, check the real
nav destinations and absence of added header glyphs, and capture updated home
and docs screenshots. It does not repeat the full functional matrix.

The runner starts an ephemeral loopback HTTP server, uses one browser with at
most two renderer processes, runs checks sequentially, and closes the browser
and server. An absolute guard bounds the run. No signed-in browser profile or
production credential is needed. It does not install tools or alter the site.

Checks cover light/dark, desktop/390px/320px widths, visible action contrast,
SDK keyboard disclosure and Escape focus restoration, mobile drawer isolation,
contained code blocks, real copy-to-clipboard content, 1.x navigation, search,
light-default/dark-opt-in persistence, and representative localized routes.
Screenshots are home and docs at 1440px/390px in both themes.

**Status results in these screenshots are synthetic browser fixtures, not live
service-health evidence.** The built checks separately exercise operational,
degraded, incident, stale, unknown and unavailable-response behavior. The
consumer's producer-contract and request-lifecycle controls are in
`scripts/identity-status.test.mjs`. Actual cross-origin public-status acceptance
requires Cloud's real CORS deployment and a separate browser read from the
published site. Do not turn these fixtures into production data.

The report records the source revision, built index SHA256, browser/client
versions, checks and screenshot names. The screenshot inventory binds the
reviewed PNG bytes. Evidence-only changes do not alter the site implementation.

The retained `baseline-report.json`/`baseline-inventory.json` bind the50-check
functional matrix and its original PNGs at the recorded immutable evidence
commit. The current `report.json`/`inventory.json` bind the16-check scoped header
follow-up and current PNGs. A later equivalent arithmetic extraction has the
same14 status-control results and changes no layout or labels; its carry is
explicit in the inventory. This does not claim the older matrix was rerun.
