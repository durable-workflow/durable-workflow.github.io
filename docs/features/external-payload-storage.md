---
sidebar_position: 21
tags:
  - payloads
  - storage
  - history
keywords:
  - external payload storage
  - large payloads
  - payload offload
  - S3 storage
  - GCS storage
  - Azure Blob storage
---

# External Payload Storage

In embedded Laravel, external payload storage replaces large encoded values in
workflow history with verified references to application-managed storage. This
page covers that embedded storage boundary. Service-mode clients and workers
use the [Server runtime transport](../polyglot/server-api-reference.md#runtime-external-payload-transport)
instead: the Server holds provider credentials and SDKs exchange opaque reference
ids over authenticated HTTP. A provider URI is not a valid Server payload envelope.

## When To Use It

Use external storage for large documents, media, reports, activity arguments or
results that genuinely need to pass through durable execution. Small values stay
inline and require no object-store write. Offload does not remove payload limits,
history-event limits or the need to bound the number of objects a run retains.

## How Offload Works

The application's namespace policy supplies a storage driver and a positive
`threshold_bytes`. Encoded payloads whose size is **greater than** the threshold
are stored through the driver. Values equal to or below it remain inline.
A disabled policy or absent driver leaves values inline.

The embedded provider reference uses schema
`durable-workflow.v2.external-payload-reference.v1` with `uri`, `sha256`,
`size_bytes`, `codec` and optional `expires_at`. The codec is `avro`.
`Workflow\V2\Support\ExternalPayloads` stores the encoded envelope with the
`dw-external-payload:v1:` prefix. When the runtime needs the value, it fetches the
encoded bytes and verifies size and SHA-256 before decoding. Missing or changed
bytes are failures, never a substitute `null` value.

This provider reference differs from the Server's
`durable-workflow.v2.runtime-external-payload-reference.v1` schema. See the
[mode support table](../polyglot/server-api-reference.md#external-payload-support-by-mode)
before moving a driver helper or stored envelope between deployment modes.

## Decode Trust Boundary

Storage and decoding are separate trust boundaries. A provider can hold encoded
bytes while a worker, codec server or export tool that decodes them can see
application values. Choose where decoders run, which keys they can access and
how previews and logs are redacted. Hashes, sizes and codec names are integrity
metadata, not an end-to-end encryption guarantee. Provider URIs may also contain
sensitive object names.

## Driver Choices

| Driver | URI scheme | Embedded requirement |
| --- | --- | --- |
| Local filesystem | `file://` | Every embedded process that resolves a reference must reach the same storage root. |
| S3-compatible storage | `s3://` | Application-managed driver or filesystem disk with the appropriate bucket, prefix and credentials. |
| Google Cloud Storage | `gs://` | Application-managed driver or filesystem disk and provider client. |
| Azure Blob Storage | `azure://` | Application-managed driver or filesystem disk and provider client. |

A Server can itself use local storage while remote SDK workers fetch through
HTTP. Those workers do not need a shared filesystem or provider credentials.

## Configuring A Namespace

Embedded applications configure their namespace storage policy and
`ExternalPayloadStorageDriver` in their Laravel runtime. Keep credentials in
application configuration, not workflow arguments, history or reference URIs.
Use one policy consistently across the processes that execute and replay a run.

For self-hosted Server, the admin
[namespace storage API](../polyglot/server-api-reference.md#namespace-and-storage)
and [CLI storage commands](../polyglot/cli-reference.md#namespace-and-search-attribute-commands)
configure Server-owned policy. They do not give SDK workers direct provider access.

### With The CLI

Use `dw namespace:set-storage-driver` to configure a Server namespace, not to
configure an unrelated embedded application's Laravel container. See the CLI
reference for the driver's required disk, bucket and prefix options.

### With The Server API

`PUT /api/namespaces/{namespace}/external-storage` is an admin policy operation.
Normal SDK clients discover the resulting runtime transport through
`GET /api/cluster/info`; they do not copy its provider configuration into workers.

## Verifying The Policy

Exercise a value above the threshold through the actual configured driver and
the processes that will replay it. Verify the exact encoded byte length and
SHA-256 after fetch. For Server policy, `dw storage:test --namespace=billing --json`
checks the configured storage path. A storage diagnostic is not proof of every
SDK's workflow execution, backup restoration or all provider adapters.

## Picking A Threshold

Choose a threshold with headroom under the ordinary request and payload limits.
It applies to **encoded bytes**, not the original file size or business JSON
length. Very low thresholds add storage requests and retained references for
small values. The runtime transport may also externalize values to fit an
aggregate HTTP request within its limit. Use the discovered Server limits for
service-mode clients rather than treating an embedded threshold as a wire limit.

## Replay, Retention, And Cleanup

- **Replay integrity.** A value is decoded only after fetching and verifying its
  referenced bytes. Preserve objects for every retained run that still needs them.
- **Verified-fetch cache.** `ExternalPayloadStorage` bounds its verified-byte
  cache. Clearing a cache does not delete the backing object or change ownership.
- **Retention.** Runtime cleanup accounts for retained owners and shared objects.
  Storage failures, backup holds or remaining references can delay deletion.
  Running retention is not a guarantee that no orphan objects remain.
- **History export.** An export can preserve reference metadata without fetching
  the object. Its checksum or `history_complete` flag does not prove that external
  bytes exist or that the archive can be replayed. Follow the
  [backup and restore boundary](../configuration/pruning-workflows.md#export-before-pruning)
  and verify objects independently. Self-contained archives remain tracked in
  [Server #520](https://github.com/durable-workflow/server/issues/520).

## Using It From Code

Embedded PHP uses `Workflow\V2\Support\ExternalPayloadStorage` with an
`ExternalPayloadStorageDriver`. `LocalFilesystemExternalPayloadStorage` handles
local roots. Provider adapters own their own access configuration and URI rules.
Applications normally let the runtime apply their namespace policy rather than
constructing stored envelopes themselves.

In service mode, PHP, Python and Rust SDK clients and workers automatically
upload and fetch runtime payloads when the Server advertises an available
transport. Do not submit a provider `external_storage` envelope to Server or
delete Server-managed objects through a direct provider helper. See the
[runtime upload and fetch contract](../polyglot/server-api-reference.md#runtime-external-payload-transport)
and the [Python helper boundary](../polyglot/python.md#external-payload-storage).

## See Also

- [Passing Data](../defining-workflows/passing-data.md)
- [Structural Limits: Payload Size](../constraints/structural-limits.md#payload-size)
- [Server API: Runtime External Payload Transport](../polyglot/server-api-reference.md#runtime-external-payload-transport)
- [Python SDK: External Payload Storage](../polyglot/python.md#external-payload-storage)
