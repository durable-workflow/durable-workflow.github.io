---
sidebar_position: 9
title: Docs Page Release Audit
description: Page-level release-status verdicts for stable 1.x docs, explicit 2.0 prerelease docs, and public edge surfaces.
tags:
  - conformance
  - docs
  - release-status
keywords:
  - docs release audit
  - page verdicts
  - v2 prerelease docs
---

# Docs Page Release Audit

Stable 1.x remains the default public documentation line. Explicit 2.0 pages
are prerelease guidance until the release status changes. The page-level audit
records a verdict for every stable default docs URL, every explicit 2.0 docs
URL, and the public edge surfaces that can otherwise create release-status
confusion.

The machine-readable audit is published at
[`/docs-page-release-audit.json`](pathname:///docs-page-release-audit.json).

## Verdict Vocabulary

| Verdict | Meaning |
| --- | --- |
| `CLEAN` | The page matches its intended release status. Stable default pages teach released 1.x behavior; explicit 2.0 pages are framed as prerelease guidance. |
| `LEAK` | The page presents stale behavior, broken current-release guidance, or a release-status claim that conflicts with the intended line. |
| `MIXED` | The page intentionally compares release lines, but part of the current-product framing still points at the wrong line. |

## Coverage

The audit manifest is generated from the production sitemap after the docs build
and includes:

- stable default docs routes under `/docs/`;
- explicit prerelease routes under `/docs/2.0/`;
- generated category and tag pages;
- the homepage, primary docs navigation, version switcher, LLM manifests, and
  public conformance manifest routes.

The build fails when any covered route lacks a `CLEAN`, `LEAK`, or `MIXED`
verdict, when canonical LLM manifests drift away from stable 1.x, or when the
2.0 route set is not clearly marked as prerelease.
