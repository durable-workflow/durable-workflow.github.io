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
Its `artifact_versions` and server `artifact_distribution_surfaces` fields are
synchronized from the public artifact tuple source during the docs build. The
manifest also records `artifact_version_source.current_server_artifact` so
consumers can verify that the advertised server version and container image
references came from the same tuple.

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

Each manifest entry includes the classifier id, built artifact path, content
hash evidence, observed evidence categories, and page-level checks used to
derive the verdict. Every covered surface except the audit manifest itself
carries `content_sha256_status: "verified"` with a SHA-256 hash that the build
checker recomputes from the built artifact.

The `/docs-page-release-audit.json` self-entry is the exception: it records
`content_sha256: null`, `content_sha256_status: "self_referential_manifest"`,
and a `content_sha256_exception` object because embedding the final manifest
hash would change the bytes being hashed. Non-clean entries must also include
focused finding records with the release-status category, observed evidence,
and remediation route.
