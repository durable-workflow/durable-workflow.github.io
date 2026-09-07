# Repository Agent Guide

Follow the [Durable Workflow organization-wide agent guide](https://github.com/durable-workflow/.github/blob/main/AGENTS.md).

Repository-specific build and test commands live in this repository's README
and contributing guide. The organization guide is authoritative for shared
product, issue, security, conformance, and release rules.

Keep `docs/features/` and the Embedded sidebar focused on the Laravel workflow
package. Put language-specific service-mode examples on the corresponding SDK
site; link to them instead of mixing SDK code into embedded guides. Shared
Server capability and routing references belong under Service Mode. A worker
that explicitly refuses a capability does not implement that feature.
