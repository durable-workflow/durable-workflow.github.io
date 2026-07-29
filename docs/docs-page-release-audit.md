---
sidebar_position: 9
title: Docs Page Release Audit
description: Build-derived route inventory for stable 1.x docs, explicit 2.0 prerelease docs, and public artifacts.
tags:
  - conformance
  - docs
  - release-status
keywords:
  - docs release audit
  - route inventory
  - v2 prerelease docs
---

# Docs Page Release Audit

Stable 1.x remains the default public documentation line. Explicit 2.0 pages
remain on versioned prerelease routes. The audit records the routes and public
artifacts produced by the documentation build so deployment automation can
verify that boundary directly.

The machine-readable audit is published at
[`/docs-page-release-audit.json`](pathname:///docs-page-release-audit.json).
Its `artifact_versions` report the newest independently published component
artifacts. The matching PHP SDK, server, Waterline, and Rust SDK distribution
surfaces are synchronized from that source during the docs build. This is
separate from `artifact_compatibility_evidence.qualified_artifact_versions`,
which remains the aggregate installation recommendation until an exact
cross-component qualification promotes a successor tuple.

The manifest records immutable source URLs and current Server and Waterline
artifact references so consumers can resolve both authorities. A newer
component release can therefore be visible without silently changing the
qualified quickstart pins.

## Coverage

The audit manifest is generated from the production sitemap after the docs build
and includes:

- stable default docs routes under `/docs/`;
- explicit prerelease routes under `/docs/2.0/`;
- generated category and tag pages;
- the homepage, LLM manifests, and public conformance artifacts.

Each inventory row contains only the public path, its route classification,
the corresponding public artifact route, and Docusaurus version metadata when
the artifact supplies it. Repository source files and build-output paths remain
internal validation inputs. The build resolves the public routes back to those
inputs and checks them against the sitemap, generated files, and Docusaurus
version configuration before publishing the manifest.

Editorial wording is not part of this artifact. Prose changes do not require a
source digest, a per-page verdict, or an update to the audit checker.
