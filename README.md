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

## Ukrainian translations

English is the default locale. Current documentation and site pages are also
available in Ukrainian under `/uk/`. Preview that locale with:

```bash
npm run start -- --locale uk
```

Translate current docs in `i18n/uk/docusaurus-plugin-content-docs/current/`
and standalone pages in `i18n/uk/docusaurus-plugin-content-pages/`. Keep the
English source file paths, examples, commands, API names and explicit heading
anchors intact. Keep workflow, activity, worker, signal, timer, query, update
and saga as English technical terms.

Use Docusaurus translation markers for component text. Run
`npm run write-translations -- --locale uk` to extract new messages, then
translate them in `i18n/uk/code.json` and the plugin message files. Build both
locales with `npm run build` before submitting a change. Blog articles and the
versioned 1.x docs use the English fallback.

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
