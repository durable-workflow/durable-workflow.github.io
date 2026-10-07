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
onboarding and core guides are available under `/es/`. Untranslated reference
pages show the English text with a language notice and a link to the English
route. Blog articles and versioned 1.x documentation remain in English.

Preview one locale with:

```bash
npm run start -- --locale uk
npm run start -- --locale es
```

Translate current docs in `i18n/<locale>/docusaurus-plugin-content-docs/current/`
and standalone pages in `i18n/<locale>/docusaurus-plugin-content-pages/`. Keep the
English source file paths, examples, commands, API names and explicit heading
anchors intact. Ukrainian keeps workflow, activity, worker, signal, timer,
query, update and saga as English technical terms. Spanish uses workflow and
worker, with actividad, señal, temporizador, consulta and actualización in
prose. Never translate identifiers in code, protocol fields or type names.

Use Docusaurus translation markers for component text. Run
`npm run write-translations -- --locale uk` to extract new messages, then
translate them in `i18n/<locale>/code.json` and the plugin message files. Build
all locales with `npm run build` before submitting a change.

When changing an English guide that already has a translation, review and
update that translation in the same pull request. Review the prose for fluent
language and the technical contract for accuracy. Keep executable code blocks
identical to the English source. The build checks this for Spanish. If a
translation cannot be brought current, remove the stale translated file so
readers see the current English source and the fallback notice. Artifact
version placeholders stay shared with English and update automatically.

The documentation maintainers own translation upkeep. The existing build also
checks reviewed English source hashes for Spanish, so a source edit requires a
translation review before the pull request can pass. After reviewing and
updating the translation, run `node scripts/check-doc-translations.js --record-review`
and commit `i18n/es/source-hashes.json` with it. This command still checks the
code blocks. Recording hashes alone does not review the prose.

The pinned Docusaurus 3.10.2 utility patch resolves relative Markdown links
between translated and English fallback files. It uses Docusaurus's document
map and preserves strict missing-link checks and version boundaries. The
build exercises both directions. Recheck and remove the patch when upgrading
Docusaurus if the upstream resolver handles these cases.

For a new locale, qualify installation, a completed first workflow, core
concepts, safe recovery, navigation, search, language switching and fallback
before publication. Check representative pages in a browser, including mobile,
and verify canonical and alternate-language links. Spanish is the first
expansion in [#169](https://github.com/durable-workflow/durable-workflow.github.io/issues/169).
Portuguese (Brazil), Simplified Chinese and Japanese remain subsequent stages,
subject to audience evidence and language review. Country totals alone do not
establish a reader's preferred language.

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
