---
title: Avro Value protocol
sidebar_label: Avro Value protocol
---

# Avro Value protocol

Durable Workflow 2.0 uses one fixed recursive
[`durable_workflow.protocol.Value`](/schemas/v2/durable_workflow.protocol.Value.v1.avsc)
schema for every Avro payload. Workflow inputs and results, activity values and
failure details, signals, queries, updates, replay history, and externally
stored payloads all use the same schema. Applications do not publish their own
Avro schemas, and the platform does not require a network schema registry.

The value union has distinct named branches for null, boolean, signed 64-bit
integer, finite double, bytes, UTF-8 string, list, and string-keyed map. That
keeps `7` distinct from `7.0`, text distinct from bytes, and lists distinct from
maps in PHP, Python, and Rust.

## Wire frame

The `blob` field is base64 around standard Avro single-object bytes:

```text
C3 01 || 8-byte little-endian CRC-64-AVRO fingerprint || Avro datum
```

Schema v1 has fingerprint `e2a33dff55802237`. SDKs bundle the immutable schema
for each supported fingerprint, select the writer schema from the frame, and
resolve it against the current reader. An unknown fingerprint or incompatible
new branch fails as `unsupported_payload_schema`; decoders do not guess or
fall back to JSON.

Future value kinds are new uniquely named record branches appended to the
union. Released branches are never reordered or reused.

## Value policy

- Map keys must be strings. SDKs reject other keys instead of stringifying
  them.
- Integers must fit the signed 64-bit Avro `long` range.
- Doubles must be finite; NaN and infinities are rejected.
- Python `bytes` and Rust `AvroValue::Bytes` select Avro `bytes`. PHP callers
  use `AvroBinaryValue::fromBytes()` because a PHP string alone cannot declare
  whether it is text or binary.
- Decimal, arbitrary-precision integer, date/time, UUID, enum, dataclass,
  Pydantic, and domain objects require explicit adapters to a canonical value
  kind.

Avro is the only Durable Workflow 2.0 payload codec. HTTP request and response
documents remain JSON transport, but every durable value inside those
documents uses this fixed schema and single-object frame. A `json` codec tag,
an unknown codec, or an untagged raw durable blob fails closed with
`unsupported_payload_codec`; runtimes never transcode or guess.

## JSON inspection projection

Run descriptions retain `input_envelope`, `output_envelope`, and result
envelopes as the lossless payload authority. JSON-facing inspection surfaces
such as the CLI and Waterline render values that JSON cannot represent with a
typed projection:

```json
{"$type":"bytes","base64":"AP8="}
{"$type":"map","entries":[{"key":"0","value":"zero"}]}
```

The map projection is used for empty maps and numeric-looking string keys that
PHP arrays cannot retain without changing their type. Ordinary scalars, lists,
and unambiguous string-keyed maps remain ordinary JSON values. Consumers that
need the original typed value decode the accompanying envelope rather than the
display projection.

## Repeatable benchmark

Each SDK ships the same representative-value benchmark and enforces a budget
for its selected production path:

```bash
# PHP SDK checkout
composer benchmark-avro-value

# Python SDK checkout
python benchmarks/avro_value.py --enforce

# Rust SDK checkout
cargo run --release --example avro_value_benchmark -- --enforce
```

The JSON output compares compact JSON, the removed JSON-in-Avro wrapper, and
the fixed typed schema. It reports raw datum, framed payload, and actual
`{codec, blob}` HTTP-envelope sizes together with end-to-end adapter,
encode, and decode latency. `AVRO_VALUE_ENCODE_BUDGET_US` and
`AVRO_VALUE_DECODE_BUDGET_US` can tighten the defaults on a qualification
runner. Release CI executes these commands with budget enforcement; a
production-path regression must be explained or corrected before release.
The old wrapper implementation exists only inside the benchmark, not as a
runtime compatibility path.

## Deployment preflight

Server bootstrap inventories every persisted `payload_codec` and verifies the
single-object magic and fixed-schema fingerprint of inline frames,
nested-history envelopes, and external payload references. Deployment stops
before the new runtime starts if any active or replay-relevant non-Avro payload,
untagged payload, corrupt reference, or obsolete frame exists. Active runs may
drain on the current prerelease; retained terminal and replay-relevant state
must follow the backup-first
[prerelease history migration](/docs/polyglot/prerelease-history-migration).
Exporting a run does not alter the rejected database state. Never delete
history to bypass the preflight.
