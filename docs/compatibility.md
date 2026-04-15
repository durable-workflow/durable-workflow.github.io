---
sidebar_position: 15
title: Version Compatibility
description: Compatibility matrix for Durable Workflow components
---

# Version Compatibility

This page documents version compatibility across Durable Workflow components. All components validate version compatibility at runtime and provide clear error messages when incompatible versions are detected.

## Component Versions

| Component | Current Version | Notes |
|-----------|----------------|-------|
| Workflow Package (PHP) | 1.0.75 (v1), 2.0.0 (v2) | Core workflow engine |
| Standalone Server | 0.1.0 - 0.1.9, 2.0.0 | Language-neutral HTTP server |
| CLI | 0.1.0 | Command-line interface |
| Python SDK | 0.1.0 | Python client and worker |
| Waterline | 1.0.16 (v1), 2.0.0 (v2) | Observability UI |

## Compatibility Matrix

### Server ↔ SDK/CLI

| Server Version | CLI 0.1.x | Python SDK 0.1.x | PHP Workflow 2.0.x |
|----------------|-----------|------------------|-------------------|
| 0.1.x (prerelease) | ✅ Compatible | ✅ Compatible | ✅ Compatible |
| 2.0.x (stable) | ✅ Compatible | ✅ Compatible | ✅ Compatible |
| 1.x | ❌ Skipped | ❌ Skipped | ❌ Skipped |
| 3.x+ (future) | ❌ Breaking | ❌ Breaking | ❌ Breaking |

**Version 1.x**: Intentionally skipped. The project moved from 0.x (prerelease) directly to 2.x (stable).

**Why 0.x and 2.x are compatible**: The 0.1.x server releases were pre-release versions of what became 2.0. The protocol and API shape remained stable across this transition, so clients written for 0.1.x work with 2.0.x without changes.

### Workflow Package ↔ Waterline

| Workflow Version | Waterline 1.x | Waterline 2.x |
|------------------|---------------|---------------|
| 1.x | ✅ Compatible | ❌ Not compatible |
| 2.x | ❌ Not compatible | ✅ Compatible |

Waterline versions must match the workflow package major version.

## Runtime Validation

### CLI

The CLI validates server version on first invocation per session:

```bash
$ dw server:health
Server version 3.0.0 is incompatible with dw CLI 0.1.x (requires server 0.x or 2.x).
Upgrade the server or use a compatible CLI version.
```

Version checks are cached per CLI invocation. Starting a new CLI command re-validates.

### Python SDK

The Python SDK validates server version when workers register:

```python
from durable_workflow import Client, Worker

client = Client("http://server:8080", token="...", namespace="default")
worker = Worker(client, task_queue="default", workflows=[...])

await worker.run()  # Validates server version before registering
```

If incompatible:

```
RuntimeError: Server version 3.0.0 is incompatible with sdk-python 0.1.x
(requires server 0.x or 2.x). Upgrade the server or use a compatible SDK version.
```

### Server

The server returns its version and supported SDK versions in `GET /api/cluster/info`:

```json
{
  "version": "2.0.0",
  "supported_sdk_versions": {
    "php": ">=1.0",
    "python": ">=0.1"
  }
}
```

Clients and workers query this endpoint to validate compatibility.

## Upgrading

### Minor Version Upgrades (0.1.8 → 0.1.9, 2.0.0 → 2.0.1)

Minor versions are backward-compatible within the same major version:

- **Server**: Upgrade without client changes
- **CLI**: Upgrade independently
- **Python SDK**: Upgrade independently

Example: Server 2.0.1 works with CLI 0.1.0 and Python SDK 0.1.0.

### Major Version Upgrades (0.x → 2.x, 2.x → 3.x)

Major version changes may introduce breaking changes:

1. **Check compatibility matrix** (above) for supported version combinations
2. **Upgrade server first**: Deploy new server version
3. **Validate with one client**: Test one CLI command or SDK worker
4. **Upgrade remaining clients**: CLI, SDK, workers

**Pre-release to stable (0.1.x → 2.0.x)**: This upgrade is backward-compatible. Clients written for 0.1.x work with 2.0.x without code changes.

**Future major versions (2.x → 3.x)**: Will require client updates. Version validation will catch incompatibilities and provide clear error messages.

## Version Negotiation Protocol

All client-server communication includes protocol version headers:

**Control plane** (workflow start, describe, signal, query, update):
```
X-Durable-Workflow-Control-Plane-Version: 2
```

**Worker protocol** (task polling, completion):
```
X-Durable-Workflow-Protocol-Version: 1.0
```

The server validates these headers and rejects requests with missing or incompatible versions.

## Troubleshooting

### "Server version X is incompatible with..."

**Cause**: Client and server major versions don't match.

**Fix**:
1. Check the compatibility matrix above
2. Upgrade server or client to compatible versions
3. If server is 0.x or 2.x and client reports incompatibility, file a bug

### "Missing X-Durable-Workflow-Protocol-Version header"

**Cause**: Old client not sending protocol version headers.

**Fix**: Upgrade CLI to 0.1.0+ or Python SDK to 0.1.0+.

### "Control plane version mismatch"

**Cause**: Server and client disagree on control-plane protocol version.

**Fix**: Ensure server is 0.1.x or 2.x and client is sending version 2 header.

## Version History

| Date | Server | CLI | Python SDK | Workflow | Waterline | Notes |
|------|--------|-----|------------|----------|-----------|-------|
| 2026-04-15 | 2.0.0 | 0.1.0 | 0.1.0 | 2.0.0 | 2.0.0 | Stable release |
| 2026-04-12 | 0.1.9 | 0.1.0 | 0.1.0 | 2.0.0-alpha.2 | 2.0.0-alpha | Pre-release |
| 2026-04-01 | 0.1.8 | 0.1.0 | 0.1.0 | 2.0.0-alpha.1 | 2.0.0-alpha | Pre-release |
| 2026-03-15 | 0.1.7 | 0.1.0 | - | 1.0.75 | 1.0.16 | Python SDK not yet released |

## See Also

- [Server Setup](/docs/2.0/server-setup) — Deploying the standalone server
- [Python SDK](/docs/2.0/sdks/python) — Python client and worker
- [CLI](/docs/2.0/cli) — Command-line interface
- [Migration Guide](/docs/2.0/migration) — Migrating from v1 to v2
