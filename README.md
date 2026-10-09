# Durable Workflow Documentation

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

## Translations

English is the default locale. Ukrainian is available under `/uk/`. Spanish
onboarding and core guides are available under `/es/`, Brazilian Portuguese
under `/pt-BR/`, Simplified Chinese under `/zh-Hans/`, Japanese under `/ja/`,
and French under `/fr/`.
Untranslated reference
pages show the English text with a language notice and a link to the English
route. Blog articles and versioned 1.x documentation remain in English.

Preview one locale with:

```bash
npm run start -- --locale uk
npm run start -- --locale es
npm run start -- --locale pt-BR
npm run start -- --locale zh-Hans
npm run start -- --locale ja
npm run start -- --locale fr
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
déterminisme and idempotence in prose. Never translate identifiers in code,
protocol fields or type names.

Use Docusaurus translation markers for component text. Run
`npm run write-translations -- --locale uk` to extract new messages, then
translate them in `i18n/<locale>/code.json` and the plugin message files. Build
all locales with `npm run build` before submitting a change.

When changing an English guide that already has a translation, review and
update that translation in the same pull request. Review the prose for fluent
language and the technical contract for accuracy. Keep executable code blocks
identical to the English source. The build checks this for Spanish, Brazilian
Portuguese, Simplified Chinese, Japanese and French. If a translation cannot be brought
current, remove the stale translated file so
readers see the current English source and the fallback notice. Artifact
version placeholders stay shared with English and update automatically.

The documentation maintainers own translation upkeep. The existing build also
compares reviewed English source hashes for Spanish, Brazilian Portuguese,
Simplified Chinese, Japanese and French and reports the guides needing review. Prose
edits produce a notice, while changed executable examples must still match.
After reviewing and
updating the translation, run `node scripts/check-doc-translations.js --record-review`
and commit the affected `i18n/<locale>/source-hashes.json` files with it.
This command still checks the code blocks. Recording hashes alone does not
review the prose.

The pinned Docusaurus 3.10.2 utility patch resolves relative Markdown links
between translated and English fallback files. It uses Docusaurus's document
map and preserves strict missing-link checks and version boundaries. The
build exercises both directions. Recheck and remove the patch when upgrading
Docusaurus if the upstream resolver handles these cases.

`plugins/local-search.js` selects the existing search plugin's Chinese word
segmentation for `zh-Hans` and Japanese segmentation for `ja`, combined with
English stemming for API terms and fallback pages. French combines the existing
French and English stemmers, including accented words. Other locales retain the
default tokenizer. Japanese uses the plugin's existing TinySegmenter.
The pinned search plugin patch resets its index-builder language cache between
locales, because Docusaurus builds all locales in one process. The build checks
English → Chinese → English indexing and serialized-index reloads, including
Chinese words, Ukrainian text and English API terms. The patch also selects
the Japanese query tokenizer when Japanese and English are combined. A focused
test uses the actual browser tokenizer to check unspaced Japanese phrases,
English stemming, index reloads and a switch back to English. The French check
also uses the browser tokenizer and serialized indexes to verify accented
inflections, English API terms and a switch back to English. Recheck this patch
when upgrading the search plugin and remove it when upstream handles these cases.

For a new locale, qualify installation, a completed first workflow, core
concepts, safe recovery, navigation, search, language switching and fallback
before publication. Check representative pages in a browser, including mobile,
and verify canonical and alternate-language links. Spanish, Brazilian Portuguese,
Simplified Chinese, Japanese and French are delivered increments in
[#169](https://github.com/durable-workflow/durable-workflow.github.io/issues/169).
German is the next agreed increment. Country totals alone do not
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
