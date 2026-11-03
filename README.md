# Durable Workflow Documentation

[![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=durable-workflow_durable-workflow.github.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=durable-workflow_durable-workflow.github.io)
[![Documentation Qualification](https://github.com/durable-workflow/durable-workflow.github.io/actions/workflows/qualification.yml/badge.svg?branch=main)](https://github.com/durable-workflow/durable-workflow.github.io/actions/workflows/qualification.yml)
[![Deploy to GitHub Pages](https://github.com/durable-workflow/durable-workflow.github.io/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/durable-workflow/durable-workflow.github.io/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

This repository contains the source for
[durable-workflow.com](https://durable-workflow.com/), including the current
Durable Workflow 2.0 documentation, the versioned 1.x documentation, the blog,
and public protocol references.

## Local development

Use Node.js 24 and npm:

```bash
npm ci
npm run start
```

Build the same static site and validate the same links as CI:

```bash
npm run build
```

## Dependency security

`npm run check:dependency-security` checks the recorded dependency version
floors, blocked build-asset formats and stale HTTP-cache wildcard handling.
Run `npm audit` separately for current advisories. Passing this preflight does
not mean every dependency is free of reported vulnerabilities.

The [unpatched braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
affects build/development glob processing. This repository supplies those
patterns from reviewed source and configuration; it has no public pattern
evaluation endpoint, and the published site is static. Maintainers accept
that limited build-tool exposure while no patched release is available and
keep the audit warning visible. Review the decision when an upstream fix is
released, or before accepting external patterns or changing development-server
exposure and build-source permissions. The dependency paths and review are
recorded in [#261](https://github.com/durable-workflow/durable-workflow.github.io/issues/261).

The unpatched [deepmerge advisory](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)
remains in the installed SVG build graph through `@svgr/plugin-svgo`'s dependency
declaration. Its reviewed published entrypoint does not import or call
`deepmerge`; it selects SVGO configuration and calls `svgo.optimize`.
Maintainers accept retaining that unused dependency while no fixed release is
available. SVG assets and configuration come from reviewed repository source,
and the published site is static. The preflight requires the reviewed version,
sole declaring package and installed entrypoint hash. Re-review when a fix is
released, the graph or entrypoint changes, untrusted SVGO configuration is
admitted, or the site adds request-time Node processing. The audit remains
affected. See [#413](https://github.com/durable-workflow/durable-workflow.github.io/issues/413).

## Translations

English is the default locale. The offered documentation languages are Ukrainian
(`/uk/`), Spanish (`/es/`), Brazilian Portuguese (`/pt-BR/`), Simplified Chinese
(`/zh-Hans/`), Japanese (`/ja/`), French (`/fr/`) and German (`/de/`).
Current 2.0 guides must have reviewed translations in every offered language.
Completing the existing gaps is tracked in [#169](https://github.com/durable-workflow/durable-workflow.github.io/issues/169).
The visible English fallback remains a temporary indication of missing work,
not completed language support. Blog articles and versioned 1.x documentation
have separate English-only scope.

Preview one locale with:

```bash
npm run start -- --locale uk
npm run start -- --locale es
npm run start -- --locale pt-BR
npm run start -- --locale zh-Hans
npm run start -- --locale ja
npm run start -- --locale fr
npm run start -- --locale de
```

Translate current docs in `i18n/<locale>/docusaurus-plugin-content-docs/current/`
and standalone pages in `i18n/<locale>/docusaurus-plugin-content-pages/`. Keep the
English source file paths, examples, commands, API names and explicit heading
anchors intact. Ukrainian keeps workflow, activity, worker, signal, timer,
query, update and saga as English technical terms. Spanish uses workflow and
worker, with actividad, señal, temporizador, consulta and actualización in
prose. Brazilian Portuguese keeps workflow, worker, namespace and replay, with
atividade, sinal, temporizador, consulta and atualização in prose. Simplified
Chinese uses 工作流, 活动, 信号, 定时器, 查询, 更新, 命名空间 and 重放, while keeping
Worker and product names. Japanese uses ワークフロー, アクティビティ, シグナル,
タイマー, クエリ, 更新, 名前空間, リプレイ, 決定性 and 冪等性, while keeping
Worker and product names. French keeps workflow and worker, with activité,
signal, temporisateur, requête de lecture, mise à jour, espace de noms, relecture,
déterminisme and idempotence in prose. German keeps Workflow, Worker, Namespace,
Replay and product names, with Aktivität, Signal, Timer, Abfrage, Update,
Determinismus and Idempotenz in prose. Never translate identifiers in code,
protocol fields or type names.

Use Docusaurus translation markers for component text. Run
`npm run write-translations -- --locale uk` to extract new messages, then
translate them in `i18n/<locale>/code.json` and the plugin message files. Build
all locales with `npm run build` before submitting a change.

When changing or adding an English guide, review and update all seven
translations in the same delivery. Review the prose for fluent
language and the technical contract for accuracy. Keep executable code blocks
identical to the English source. The build checks this for Spanish, Brazilian
Portuguese, Simplified Chinese, Japanese, French and German. A missing translation
or English fallback does not satisfy a changed guide's acceptance. Artifact
version placeholders stay shared with English and update automatically.

The documentation maintainers own translation upkeep. Pull-request and main
builds compare changed English guides with all seven translated files and their
reviewed source hashes. Missing files, unchanged English copies and stale or
missing review hashes fail qualification. Existing executable-example checks
remain in place. During completion of #169, unchanged older gaps are still
reported separately and are not claimed as translated.

After reviewing a guide, record its English file's SHA-256 in the corresponding
`i18n/<locale>/source-hashes.json`. Use `--record-review` only after reviewing
every page it records. Recording hashes alone does not review the prose.
For a local changed-guide check, set `DOCS_TRANSLATION_BASE` to the full Git
commit SHA of the comparison base before running the normal build.

The pinned Docusaurus 3.10.2 utility patch resolves relative Markdown links
between translated and English fallback files. It uses Docusaurus's document
map and preserves strict missing-link checks and version boundaries. The
build exercises both directions. Recheck and remove the patch when upgrading
Docusaurus if the upstream resolver handles these cases.

The browser-launcher patch uses `open`'s named app aliases to preserve custom
browsers and browser shortcuts with the fixed v11 dependency. Remove it when
Docusaurus supports that API directly; dependency checks exercise the installed
launcher with captured child processes.

`plugins/local-search.js` selects the existing search plugin's Chinese word
segmentation for `zh-Hans` and Japanese segmentation for `ja`, combined with
English stemming for API terms and fallback pages. French combines the existing
French and English stemmers, including accented words. German combines German
and English stemming, including umlauts and inflected words. Other locales retain the
default tokenizer. Japanese uses the plugin's existing TinySegmenter.
The pinned search plugin patch resets its index-builder language cache between
locales, because Docusaurus builds all locales in one process. The build checks
English → Chinese → English indexing and serialized-index reloads, including
Chinese words, Ukrainian text and English API terms. The patch also selects
the Japanese query tokenizer when Japanese and English are combined. A focused
test uses the actual browser tokenizer to check unspaced Japanese phrases,
English stemming, index reloads and a switch back to English. The French check
also uses the browser tokenizer and serialized indexes to verify accented
inflections, English API terms and a switch back to English. The German check
covers umlauts, singular/plural forms and the same index reload and language
switch. Recheck this patch
when upgrading the search plugin and remove it when upstream handles these cases.

For a new locale, qualify installation, a completed first workflow, core
concepts, safe recovery, navigation, search, language switching and fallback
before publication. Check representative pages in a browser, including mobile,
and verify canonical and alternate-language links. Spanish, Brazilian Portuguese,
Simplified Chinese, Japanese, French and German are delivered increments in
[#169](https://github.com/durable-workflow/durable-workflow.github.io/issues/169).
Country totals alone do not
establish a reader's preferred language. Waterline's additional interface
languages are tracked separately in
[#157](https://github.com/durable-workflow/waterline/issues/157).

## Repository layout

| Path | Purpose |
| --- | --- |
| `docs/` | Current 2.0 documentation |
| `versioned_docs/` | Maintained 1.x documentation snapshot |
| `blog/` | Durable Workflow articles |
| `src/` | Docusaurus pages, components, theme overrides, and styling |
| `static/` | Public images, installers, and machine-readable protocol artifacts |

Pushes to `main` deploy through GitHub Pages after the documentation build
passes. Protocol contracts have a separate focused validation workflow.

See the [organization contribution guide](https://github.com/durable-workflow/.github/blob/main/CONTRIBUTING.md)
before opening a pull request.
