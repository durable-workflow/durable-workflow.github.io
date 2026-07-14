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
Its `artifact_versions`, PHP SDK package/repository/API-documentation surfaces,
server container distribution surfaces, and Rust SDK
package/repository/API-documentation surfaces are synchronized from the public
artifact tuple source during the docs build. The manifest also records
`artifact_version_source.current_server_artifact` so consumers can verify that
the advertised server version and container image references came from the
same tuple.

## Coverage

The audit manifest is generated from the production sitemap after the docs build
and includes:

- stable default docs routes under `/docs/`;
- explicit prerelease routes under `/docs/2.0/`;
- generated category and tag pages;
- the homepage, LLM manifests, and public conformance artifacts.

Each inventory row contains only the public path, its route classification,
the corresponding build artifact, and Docusaurus version metadata when the
artifact supplies it. The build checks those facts against the sitemap,
generated files, and Docusaurus version configuration.

Editorial wording is not part of this artifact. Prose changes do not require a
source digest, a per-page verdict, or an update to the audit checker.
