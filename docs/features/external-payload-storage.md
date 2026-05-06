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

External payload storage offloads large workflow payloads to a pluggable
object store (S3, GCS, Azure Blob, or a local filesystem) and replaces the
inline bytes in workflow history with a small, verifiable reference envelope.
Use it when activity or child-workflow arguments, results, signals, or update
payloads are too large to live inline in the database row that backs workflow
history.

The runtime still carries inline payloads as long as the encoded size stays
under the namespace threshold. Only payloads that cross the threshold are
written to the configured driver and recorded in history as a
`durable-workflow.v2.external-payload-reference.v1` envelope. Replay and
history export fail closed when a reference is missing, mutated, or outside
the configured prefix — the system never silently substitutes an empty value
for a missing blob.

## When To Use It

Prefer external payload storage whenever the application legitimately needs
to pass bytes larger than a few hundred kilobytes through a workflow:

- Document and media processing pipelines that hand PDFs, images, or audio
  blobs from one activity to the next.
- Reports, exports, or archives whose final output is a large serialized
  artifact.
- Message stream payloads produced by external systems that do not expose a
  stable object URL the workflow can reference directly.
- Any payload that would otherwise trip the
  [`payload_size_bytes` structural limit](../constraints/structural-limits.md#payload-size).

Small payloads — control-plane fields, ids, status flags, typical JSON —
stay inline and pay nothing extra. The policy is threshold-gated, so enabling
external storage on a namespace does not move small payloads.

## How Offload Works

Each namespace carries an independent external payload storage policy. When
the runtime encodes a payload for durable storage, it checks the encoded byte
length against the configured `threshold_bytes`:

- Encoded size is under the threshold. The payload is stored inline, as
  today. Nothing in history changes.
- Encoded size is at or over the threshold. The runtime hands the encoded
  bytes to the configured driver, receives back a driver-owned URI, and
  records an external payload reference in history. The reference carries the
  URI, a SHA-256 hash, the exact byte length, the payload codec, and an
  optional `expires_at` hint.

On replay, workers fetch the referenced bytes through the same driver,
verify that the returned object has the expected size and SHA-256, and only
then hand the payload to the decoder. A size or hash mismatch raises
`ExternalPayloadIntegrityException` (PHP) or `ExternalPayloadIntegrityError`
(Python) and surfaces as a replay failure — never as a silent empty payload.

The reference envelope is a stable wire format. It is identical whether the
producer is a PHP workflow, a Python SDK worker, or a direct HTTP API caller.
For the full field contract see
[External Payload Reference Envelope](../polyglot/server-api-reference.md#external-payload-reference-envelope).

## Decode Trust Boundary

Payload storage and payload decode are separate trust boundaries. An object
store can hold encoded bytes or references, while a codec server, custom
decoder, worker process, or history-export tool that decodes those bytes can
see plaintext application payloads.

Treat any codec server as a customer-managed trust boundary: decide where it
runs, which network can reach it, which keys it can access, what audit logs it
emits, and how decoded previews are redacted before they reach operator
surfaces. Durable Workflow records codec names, reference URIs, hashes, sizes,
schema fingerprints, and bounded previews, but those facts are not equivalent
to end-to-end encryption.

## Driver Choices

| Driver | URI scheme | Typical use |
| --- | --- | --- |
| `local` | `file://` | Local development, CI, and single-node deployments where the server and workers share a filesystem. Not suitable when workers run on different hosts than the server. |
| `s3` | `s3://` | Amazon S3 and S3-compatible object stores (MinIO, Cloudflare R2, etc.) through a server-side filesystem disk. |
| `gcs` | `gs://` | Google Cloud Storage through a server-side filesystem disk. |
| `azure` | `azure://` | Azure Blob Storage through a server-side filesystem disk. |

Object-store drivers configure the actual bucket/container credentials
through a named server-side filesystem disk, so secrets live in the server's
configuration rather than in the namespace policy record.

## Configuring A Namespace

Configure the policy with the [CLI](../polyglot/cli-reference.md#namespace-and-search-attribute-commands)
or the [server HTTP API](../polyglot/server-api-reference.md#namespace-and-storage).
Both write the same `external_payload_storage` envelope on the namespace
record.

### With The CLI

```bash
# Production namespace using Amazon S3 through the 'external-payload-objects' disk.
dw namespace:set-storage-driver billing s3 \
  --disk=external-payload-objects \
  --bucket=dw-payloads \
  --prefix=billing/ \
  --threshold-bytes=2097152

# Development namespace using the local filesystem.
dw namespace:set-storage-driver dev local \
  --uri=file:///var/lib/durable-workflow/payloads

# Disable offload while keeping the policy record (all payloads stay inline).
dw namespace:set-storage-driver billing s3 \
  --disk=external-payload-objects \
  --bucket=dw-payloads \
  --disable
```

### With The Server API

```bash
curl -sS -X PUT "$DURABLE_WORKFLOW_SERVER_URL/api/namespaces/billing/external-storage" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "driver": "s3",
    "threshold_bytes": 2097152,
    "config": {
      "disk": "external-payload-objects",
      "bucket": "dw-payloads",
      "prefix": "billing/"
    }
  }'
```

The namespace description returned by `GET /api/namespaces/{name}` or
`dw namespace:describe` carries the resolved `external_payload_storage`
envelope so operators and automation can verify the active policy without
re-issuing a write.

## Verifying The Policy

Use the round-trip diagnostic to prove a configured policy can actually
write and read bytes under the namespace's credentials before opening it to
workflow traffic:

```bash
dw storage:test --namespace=billing --large-bytes=2097152 --json
```

The diagnostic writes a small inline payload plus one payload that crosses
the threshold, fetches both back, verifies size and SHA-256, and returns
machine-readable `small_payload` and `large_payload` result objects.
A passing large-payload result proves the driver can produce a valid
`durable-workflow.v2.external-payload-reference.v1` envelope end to end. A
failing diagnostic should be treated as a storage-policy problem — do not
enable workflow traffic through a namespace whose policy cannot pass the
round trip.

## Picking A Threshold

The default behavior is to leave inline payloads alone unless they cross
`threshold_bytes`. Good starting points:

- Match the threshold to the point at which inline payloads start creating
  operational pressure — usually somewhere between 256 KiB and 2 MiB of
  encoded bytes.
- Leave comfortable headroom under the namespace
  [`payload_size_bytes`](../constraints/structural-limits.md#payload-size)
  structural limit so that the reference envelope is the cap, not the bytes
  themselves.
- Set a single threshold per namespace. Choose it from the payload-producing
  activity or workflow that drives the highest bytes-per-run, rather than
  tuning it for the median payload.

There is no benefit to setting a very low threshold: small payloads round
trip through the database faster than they round trip through external
storage, and the reference envelope itself consumes a (small) amount of
history space.

## Replay, Retention, And Cleanup

- **Replay integrity.** Every fetch verifies the stored object against the
  reference's `size_bytes` and `sha256`. A mutated or missing blob raises an
  integrity exception rather than silently substituting a different value.
- **Verified-fetch cache.** Workers cache verified bytes by
  `(uri, sha256, size, codec)` with a bounded entry count and byte ceiling.
  Repeated history reads on the same run avoid refetching the same object
  without weakening the integrity check on first load.
- **Retention.** When the server's retention pass removes a workflow run,
  it also deletes the external payload objects referenced by that run's
  history. Orphan objects do not accumulate as long as retention is running.
- **History export.** Exported history preserves the reference envelope.
  Downstream consumers that need the referenced bytes should fetch through
  the same driver and verify against the envelope before decode — the export
  format does not inline external bytes.

## Using It From Code

Most applications never call the storage API directly: the runtime offloads
transparently based on the namespace policy, and the SDK decodes references
on replay. Applications that need to build or consume envelopes outside the
runtime — for example, a language-neutral bridge handler or a test that
synthesizes a large payload — use the SDK helpers.

- **PHP (workflow package).** The
  `Workflow\V2\Support\ExternalPayloadStorage` helper stores and fetches
  bytes through any driver implementing
  `Workflow\V2\Contracts\ExternalPayloadStorageDriver`.
  `LocalFilesystemExternalPayloadStorage` handles `file://` URIs, and the
  standalone server ships a filesystem-disk driver that backs the `s3`,
  `gcs`, and `azure` policy drivers through a named Laravel disk.
- **Python SDK.** See
  [External Payload Storage](../polyglot/python.md#external-payload-storage)
  for `ExternalPayloadReference`, `ExternalPayloadCache`,
  `store_external_payload()`, `fetch_external_payload()`, and the
  `LocalFilesystemExternalStorage`, `S3ExternalStorage`,
  `GCSExternalStorage`, and `AzureBlobExternalStorage` adapters. Cloud SDK
  clients remain application-owned; the SDK does not add boto3,
  google-cloud-storage, or azure-storage-blob as runtime dependencies.
- **Direct HTTP.** HTTP callers that encode payloads manually can store
  bytes through the driver, then submit the reference envelope as the
  payload field on the request. The worker-protocol payload envelope
  (`{codec, blob}`) still carries references for activity arguments,
  results, signal payloads, and update payloads.

## See Also

- [Passing Data](../defining-workflows/passing-data.md) for the default
  inline payload contract.
- [Structural Limits: Payload Size](../constraints/structural-limits.md#payload-size)
  for the engine-enforced ceiling that external storage lets you work under.
- [Server API Reference: Namespace And Storage](../polyglot/server-api-reference.md#namespace-and-storage)
  for the full HTTP contract, including the reference envelope fields.
- [CLI Reference: Namespace And Search Attribute Commands](../polyglot/cli-reference.md#namespace-and-search-attribute-commands)
  for `dw namespace:set-storage-driver` and `dw storage:test` usage.
- [Python SDK: External Payload Storage](../polyglot/python.md#external-payload-storage)
  for Python-side drivers, helpers, and replay-cache guidance.
