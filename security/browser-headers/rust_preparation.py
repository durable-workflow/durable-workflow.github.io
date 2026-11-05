"""One-shot preparation source; operational admission is deliberately unset.

The inert controls use the same validation/lifecycle functions with fake effects.
No package/Node module is imported, and import/CLI cannot allocate a resource.
"""

from __future__ import annotations

import base64
import datetime as dt
import gzip
import hashlib
import io
import json
import os
import re
import stat
import sys
import tarfile
import zipfile
from dataclasses import dataclass
from pathlib import PurePosixPath


OPERATION_ADMISSION = None
OWNER = "durable-workflow-github-io"
PACKET_SHA = "c6c735624906c4680d162ba989ebd55f00a8124e6d8ca72f781f8fee646ae281"
ZIP_SHA = "ea80b0d3191da525152b8f02ff2e3253a29ed93a723dfeae4c344eefb392cada"
ZIP_BYTES = 4067287
SUBJECT_EXPIRY = "2026-11-06T03:10:05+00:00"
BASE_IMAGE = "mcr.microsoft.com/playwright@sha256:bc72a8df40831ded821e3cbc79c318c21b44d6e51dff9fd89ace7a8249c5b462"
BASE_ID = "sha256:847f71bbb3f17fc1032d50d75bf6fb3fdcf188b16dff81f24667fe9ae9409e01"
SUBJECT = {
    "repository": "durable-workflow/sdk-rust",
    "run_id": 41959739724,
    "artifact_id": 13384761426,
    "tooling_revision": "46cf36514f7a39e819213771abf9efc82321c062",
    "zip_bytes": ZIP_BYTES,
    "zip_sha256": ZIP_SHA,
}
INVENTORY_NAME = "rust-inventory.json"
PACKET_MEMBERS = (
    "rust-browser.test.cjs", "rust-browser-inputs.cjs",
    "rust-browser-source.test.cjs", "rust-policy.json", INVENTORY_NAME,
    "rust-rule.candidate.json", "runtime/package.json", "runtime/package-lock.json",
)
LABEL_OWNER = "com.durable-workflow.agent"
LABEL_NONCE = "com.durable-workflow.attempt"
LABEL_ROLE = "com.durable-workflow.purpose"
ROLES = ("assemble", "verify")
MIB = 1024 * 1024
FILE_LIMIT = 10000
TREE_LIMIT = 64 * MIB
TAR_LIMIT = 128 * MIB
HEX_64 = r"[0-9a-f]{64}"
IMAGE_ID = r"sha256:[0-9a-f]{64}"
RETAINED_EVIDENCE = "retained-bounded-evidence"
EVIDENCE_LIMIT = 144 * 1024
DEPENDENCY_INTEGRITY = {
    "playwright": "sha512-kVzTnYFYEyQ9RGzBjNCd2+yEqWmVbxl3AHPynv3qQ6JTjv4a+kwRcnqQwIpuP3NnrnIrE/Q6wWAIAvMfIE2/Yg==",
    "playwright-core": "sha512-T9r+MZkTECl2+oUcZ26YgZzTrYidTsIhYYkJix+6iDOymOb1FB2RLLSOxRGnZGv5DStt+aduIVbt+E8WygXYpg==",
}


class Refusal(RuntimeError):
    """Fixed diagnostic only; input values/paths/credentials are not formatted."""


def require(condition, code):
    if not condition:
        raise Refusal(code)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def strict_json(data):
    def pairs(values):
        result = {}
        for key, value in values:
            require(key not in result, "duplicate-json-key")
            result[key] = value
        return result

    def invalid_constant(_value):
        raise Refusal("nonfinite-json")

    return json.loads(data, object_pairs_hook=pairs, parse_constant=invalid_constant)


def safe_name(name):
    require(isinstance(name, str) and 0 < len(name) <= 256, "member-name")
    require(not any(c in name for c in ("\\", "\x00", "\r", "\n")), "member-name")
    path = PurePosixPath(name)
    require(not path.is_absolute(), "absolute-member")
    require(all(p not in ("", ".", "..") for p in name.split("/")), "member-traversal")
    require(path.as_posix() == name, "noncanonical-member")
    return name


@dataclass(frozen=True)
class Entry:
    path: str
    data: bytes
    mode: int = 0o444

    def __post_init__(self):
        safe_name(self.path)
        require(type(self.data) is bytes, "mutable-entry")
        require(self.mode in (0o444, 0o555), "entry-mode")


def index(entries):
    result = {}
    total = 0
    for entry in entries:
        require(entry.path not in result, "duplicate-member")
        result[entry.path] = entry
        total += len(entry.data)
    require(len(result) <= FILE_LIMIT and total <= TREE_LIMIT, "tree-limit")
    for name in result:
        require(not any(p.as_posix() in result for p in PurePosixPath(name).parents
                        if p.as_posix() != "."), "file-parent")
    return result


def normalized_mode(mode):
    return 0o555 if mode & 0o111 else 0o444


def tar_entries(data, prefix=""):
    require(type(data) is bytes and len(data) <= TAR_LIMIT, "tar-limit")
    result = []
    seen = set()
    total = 0
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:") as archive:
        for member in archive:
            name = member.name.removeprefix("./").rstrip("/")
            if name in ("", "."):
                require(member.isdir(), "tar-root")
                continue
            safe_name(name)
            require(name not in seen, "duplicate-member")
            seen.add(name)
            require(len(seen) <= 20000, "member-limit")
            require(member.isfile() or member.isdir(), "nonregular-member")
            require(not member.sparse and not member.mode & 0o7000, "special-member")
            if prefix:
                require(name == prefix or name.startswith(prefix + "/"), "archive-prefix")
            if member.isdir():
                continue
            require(name != prefix, "archive-prefix-file")
            total += member.size
            require(0 <= member.size <= TREE_LIMIT and total <= TREE_LIMIT, "tree-limit")
            raw = archive.extractfile(member).read(member.size + 1)
            require(len(raw) == member.size, "short-member")
            relative = name[len(prefix) + 1:] if prefix else name
            result.append(Entry(relative, raw, normalized_mode(member.mode)))
    index(result)
    return tuple(result)


def packet_from_entries(entries):
    files = index(entries)
    names = set(PACKET_MEMBERS) | {"rust-local-browser-packet.json"}
    require(set(files) == names, "packet-closure")
    raw = files["rust-local-browser-packet.json"].data
    require(digest(raw) == PACKET_SHA, "packet-manifest-hash")
    packet = strict_json(raw)
    require(packet["run_status"] == "not-run" and set(packet["files"]) == set(PACKET_MEMBERS), "packet-status")
    for name, expected in packet["files"].items():
        require(digest(files[name].data) == expected, "packet-member-hash")
    inventory = strict_json(files[INVENTORY_NAME].data)
    candidate = strict_json(files["rust-rule.candidate.json"].data)
    policy = strict_json(files["rust-policy.json"].data)
    for value in (packet, inventory, candidate, policy):
        require(value["input_artifact"] == SUBJECT, "subject-drift")
    require(candidate["rule"]["enabled"] is False, "enabled-rule")
    require(candidate["rollout_approved"] is False and candidate["compatibility_accepted"] is False, "approval-drift")
    require(candidate["source_preparation"] is None and inventory["source_preparation"] is None, "prepared-subject")
    require(candidate["inventory_sha256"] == digest(files[INVENTORY_NAME].data), "inventory-hash")
    return inventory, strict_json(files["runtime/package-lock.json"].data)


def artifact_from_zip(raw, inventory, now):
    require(now < dt.datetime.fromisoformat(SUBJECT_EXPIRY), "expired-artifact")
    require(len(raw) == ZIP_BYTES and digest(raw) == ZIP_SHA, "artifact-zip-hash")
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        members = archive.infolist()
        require(len(members) == 1 and members[0].orig_filename == "artifact.tar", "zip-membership")
        require(members[0].file_size <= TAR_LIMIT, "zip-inflate-limit")
        payload = archive.read(members[0])
    entries = tar_entries(payload)
    actual = index(entries)
    expected = inventory["files"]
    require(len(expected) == 484 and len(actual) == 484, "artifact-count")
    require(len({row["path"] for row in expected}) == 484, "inventory-duplicates")
    require(set(actual) == {row["path"] for row in expected}, "artifact-membership")
    for row in expected:
        entry = actual[row["path"]]
        require(len(entry.data) == row["bytes"] and digest(entry.data) == row["sha256"], "artifact-file-hash")
    require(strict_json(actual["__build.json"].data) == inventory["build_identity"], "build-identity")
    return entries


def dependency_entries(raw, name, lock):
    require(name in ("playwright", "playwright-core") and len(raw) <= 16 * MIB, "dependency-input")
    record = lock["packages"]["node_modules/" + name]
    expected_url = "https://registry.npmjs.org/" + name + "/-/" + name + "-1.64.0.tgz"
    require(record["resolved"] == expected_url and record["version"] == "1.64.0", "dependency-lock")
    expected = "sha512-" + base64.b64encode(hashlib.sha512(raw).digest()).decode("ascii")
    require(expected == record["integrity"], "dependency-integrity")
    with gzip.GzipFile(fileobj=io.BytesIO(raw)) as compressed:
        unpacked = compressed.read(TAR_LIMIT + 1)
    require(len(unpacked) <= TAR_LIMIT, "dependency-inflate-limit")
    entries = tar_entries(unpacked, "package")
    package = strict_json(index(entries)["package.json"].data)
    require(package["name"] == name and package["version"] == "1.64.0", "package-identity")
    dependencies = {"playwright-core": "1.64.0"} if name == "playwright" else {}
    require(package.get("dependencies", {}) == dependencies, "package-graph")
    for key in ("optionalDependencies", "peerDependencies", "bundledDependencies", "bundleDependencies"):
        require(not package.get(key), "package-graph")
    return tuple(Entry("runtime/node_modules/" + name + "/" + e.path, e.data, e.mode) for e in entries)


def public_tar(packet, artifact, dependencies):
    entries = tuple(Entry("packet/" + e.path, e.data, e.mode) for e in packet)
    entries += tuple(Entry("site/" + e.path, e.data, e.mode) for e in artifact)
    entries += tuple(dependencies)
    files = index(entries)
    directories = {p.as_posix() for name in files for p in PurePosixPath(name).parents if str(p) != "."}
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w", format=tarfile.USTAR_FORMAT) as archive:
        for name in sorted(directories):
            info = tarfile.TarInfo(name)
            info.type = tarfile.DIRTYPE
            info.uid = info.gid = 1000
            info.mode = 0o555
            archive.addfile(info)
        for name, entry in sorted(files.items()):
            info = tarfile.TarInfo(name)
            info.uid = info.gid = 1000
            info.mode = entry.mode
            info.size = len(entry.data)
            archive.addfile(info, io.BytesIO(entry.data))
    raw = output.getvalue()
    require(len(raw) <= TAR_LIMIT, "public-tar-limit")
    return raw, tuple(files[name] for name in sorted(files))


def held_regular(path, binding):
    """Read from one no-follow descriptor; never reopen a validated pathname."""
    require(isinstance(path, str) and path.startswith("/") and path != "/", "handoff-path")
    parts = path.split("/")[1:]
    require(all(p not in ("", ".", "..") for p in parts), "handoff-path")
    descriptor = os.open("/", os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in parts[:-1]:
            following = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = following
        parent = os.fstat(descriptor)
        require(stat.S_IMODE(parent.st_mode) == binding["parent_mode"], "handoff-parent-mode")
        require((parent.st_uid, parent.st_gid) == (binding["uid"], binding["gid"]), "handoff-parent-owner")
        leaf = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=descriptor)
        try:
            observed = os.fstat(leaf)
            require(stat.S_ISREG(observed.st_mode) and observed.st_nlink == 1, "handoff-type")
            for key, value in (("uid", observed.st_uid), ("gid", observed.st_gid),
                               ("mode", stat.S_IMODE(observed.st_mode)), ("device", observed.st_dev),
                               ("inode", observed.st_ino), ("bytes", observed.st_size)):
                require(value == binding[key], "handoff-metadata")
            require(0 <= binding["bytes"] <= TAR_LIMIT, "handoff-limit")
            chunks = []
            remaining = binding["bytes"] + 1
            while remaining:
                chunk = os.read(leaf, min(remaining, MIB))
                if not chunk:
                    break
                chunks.append(chunk)
                remaining -= len(chunk)
            raw = b"".join(chunks)
            require(len(raw) == binding["bytes"] and digest(raw) == binding["sha256"], "handoff-buffer")
            return raw
        finally:
            os.close(leaf)
    finally:
        os.close(descriptor)


@dataclass(frozen=True)
class Ownership:
    nonce: str

    def __post_init__(self):
        require(re.fullmatch(HEX_64, self.nonce) is not None, "attempt-nonce")

    def name(self, role):
        require(role in ROLES, "container-role")
        return OWNER + "-rust-custody-" + role

    def labels(self, role):
        self.name(role)
        return {LABEL_OWNER: OWNER, LABEL_NONCE: self.nonce, LABEL_ROLE: "rust-custody-" + role}


def owned_identity(record, ownership, role):
    require(re.fullmatch(HEX_64, record["Id"]) is not None, "container-id")
    require(record["Name"] == "/" + ownership.name(role), "container-name")
    labels = record["Config"]["Labels"]
    require(all(labels.get(k) == v for k, v in ownership.labels(role).items()), "container-labels")
    return record["Id"]


def inspect_allocation(record, ownership, role, image):
    cid = owned_identity(record, ownership, role)
    require(record["Image"] == image, "container-image")
    require(record["State"]["Status"] == "created" and record["State"]["Running"] is False, "container-started")
    require(record.get("WithinPreparationWindow") is True, "allocation-window")
    require(not record["Mounts"] and not record["Config"].get("Volumes"), "container-mounts")
    host = record["HostConfig"]
    require(host["NetworkMode"] == "none" and host["ReadonlyRootfs"] is (role == "verify"), "container-isolation")
    require(host["NanoCpus"] == 1000000000 and host["Memory"] == 512 * MIB and host["PidsLimit"] == 64, "container-limits")
    require(host["Init"] is True and host["Privileged"] is False and host["CapDrop"] == ["ALL"], "container-privilege")
    require(host["PidMode"] == "" and host["IpcMode"] == "private" and host["UTSMode"] == "", "container-namespace")
    require(host["PublishAllPorts"] is False and not host.get("DeviceRequests") and not host.get("Tmpfs"), "container-extra-isolation")
    require(not host.get("CapAdd") and not host.get("Devices") and not host.get("Binds") and not host.get("PortBindings"), "container-extra-access")
    require(host["SecurityOpt"] == ["no-new-privileges:true"], "container-security")
    require(record["Config"]["Cmd"] == ["/bin/false"] and not record["Config"].get("Entrypoint"), "container-command")
    return cid


def discover_owned(effects, ownership, role):
    candidates = effects.discover(ownership, role)
    require(len(candidates) <= 1, "ambiguous-allocation")
    if not candidates:
        return None
    cid = candidates[0]
    require(re.fullmatch(HEX_64, cid) is not None, "discovered-id")
    record = effects.inspect(cid)
    owned_identity(record, ownership, role)
    return record


def allocate(effects, ownership, role, image):
    effects.supervisor_ready()
    require(not effects.name_exists(ownership.name(role)), "foreign-name-collision")
    require(not effects.discover(ownership, role), "existing-attempt-allocation")
    returned = effects.create(ownership, role, image)
    record = discover_owned(effects, ownership, role)
    require(re.fullmatch(HEX_64, returned) is not None, "returned-id")
    require(record is not None and record["Id"] == returned, "returned-discovered-mismatch")
    cid = inspect_allocation(record, ownership, role, image)
    effects.complete_operation("create-" + role, {"container_id": cid})
    effects.supervisor_ready()
    return cid


def cleanup(effects, ownership):
    """Independent stop path rediscovers ownership; a bad returned ID is irrelevant."""
    problems = []
    for role in ROLES:
        try:
            record = discover_owned(effects, ownership, role)
            if record is not None:
                final_record = effects.inspect(record["Id"])
                cid = owned_identity(final_record, ownership, role)
                effects.remove(cid)
                if final_record.get("WithinPreparationWindow") is not True:
                    problems.append("allocation-window")
            require(not effects.discover(ownership, role), "owned-survivor")
        except Exception:
            problems.append("cleanup-identity-or-survivor")
    if effects.uncertain_daemon_operation():
        problems.append("daemon-terminal-unknown")
    return tuple(problems)


def verify_image(record, base_layers):
    require(re.fullmatch(IMAGE_ID, record["Id"]) is not None, "image-id")
    layers = record["RootFS"]["Layers"]
    require(layers[:-1] == base_layers and len(layers) == len(base_layers) + 1, "image-layer-chain")
    require(not record["Config"].get("Volumes") and not record["Config"].get("OnBuild"), "image-hooks")
    require(record["Config"]["Cmd"] == ["/bin/false"] and not record["Config"].get("Entrypoint"), "image-command")
    return record["Id"]


def assemble(effects, ownership, raw, expected, base_layers):
    """Effects are injected; the CLI never supplies live effects without admission."""
    effects.supervisor_ready()
    sealed = effects.seal(raw)
    try:
        require(sealed.verified_hash() == digest(raw), "seal-readback")
        cid = allocate(effects, ownership, "assemble", BASE_ID)
        effects.require_safe_prefixes(cid)
        effects.supervisor_ready()
        effects.copy_sealed(cid, sealed)
        require(effects.readback(cid) == expected, "copy-readback")
        effects.complete_operation("copy", {"container_id": cid, "input_tar_sha256": digest(raw)})
        effects.supervisor_ready()
        returned = effects.commit(cid)
        require(re.fullmatch(IMAGE_ID, returned) is not None, "returned-image-id")
        image = effects.image_inspect(returned)
        require(verify_image(image, base_layers) == returned, "image-id-mismatch")
        effects.complete_operation("commit", {"image_id": returned, "config_sha256": returned[7:],
                                               "rootfs_layers": image["RootFS"]["Layers"]})
        owned_identity(effects.inspect(cid), ownership, "assemble")
        effects.remove(cid)
        require(not effects.discover(ownership, "assemble"), "owned-survivor")
        verifier = allocate(effects, ownership, "verify", returned)
        require(effects.readback(verifier) == expected, "image-readback")
        return returned
    finally:
        sealed.close()


def terminal_process_binding(records, expected):
    for record in records:
        require(record["schema"] == "durable-workflow.preparation-stage/v1", "terminal-stage-schema")
        for key in ("unit", "attempt_sha256", "source_bundle_sha256", "authority_sha256"):
            require(record[key] == expected[key], "terminal-binding-drift")
        require(re.fullmatch(r"[0-9a-f]{32}", record["invocation_id"]) is not None, "terminal-invocation")
        require(type(record["pid"]) is int and record["pid"] > 1, "terminal-pid")
    worker = next(r for r in records if r["role"] == "worker")
    stop = next(r for r in records if r["role"] == "stop")
    require(worker["invocation_id"] == stop["invocation_id"], "terminal-unit-generation")
    require(worker["command_sha256"] == expected["worker_command_sha256"]
            and stop["command_sha256"] == expected["stop_command_sha256"], "terminal-command")
    require(stop["worker_pid"] == worker["pid"] and stop["pid"] != worker["pid"], "terminal-worker-stop-pid")
    statuses = [stop[k] for k in ("worker_exit_code", "worker_exit_status", "cleanup_exit_status")]
    require(all(type(v) is int for v in statuses) and statuses == [1, 0, 0], "terminal-worker-stop-status")
    require(worker["outcome"] == "prepared-cleanup-pending" and stop["outcome"] == "complete", "terminal-stage-outcome")
    return worker, stop


def terminal_input_binding(worker, expected):
    require(worker["subject"] == SUBJECT and worker["node_packet_sha256"] == PACKET_SHA, "terminal-subject")
    require(worker["base_image_id"] == BASE_ID, "terminal-base")
    require(re.fullmatch(HEX_64, worker["input_tar_sha256"]) is not None, "terminal-input-tar")
    require(worker["seal"]["sha256"] == worker["input_tar_sha256"]
            and worker["seal"]["flags"] == expected["seal_flags"], "terminal-seal")
    require(re.fullmatch(IMAGE_ID, worker["image"]["id"]) is not None
            and worker["image"]["config_sha256"] == worker["image"]["id"][7:], "terminal-image")
    require(worker["image"]["layers"][:-1] == worker["base_layers"]
            and len(worker["image"]["layers"]) == len(worker["base_layers"]) + 1, "terminal-image-layers")
    require(worker["base_layers"] and all(re.fullmatch(IMAGE_ID, layer) is not None
            for layer in worker["image"]["layers"]), "terminal-layer-identities")
    require(worker["readback_verified"] is True and re.fullmatch(HEX_64, worker["readback_sha256"]) is not None, "terminal-readback")
    require(set(worker["dependencies"]) == {"playwright", "playwright-core"}, "terminal-dependencies")
    for name, dependency in worker["dependencies"].items():
        require(dependency["version"] == "1.64.0" and dependency["integrity"] == DEPENDENCY_INTEGRITY[name]
                and re.fullmatch(HEX_64, dependency["sha256"]) is not None, "terminal-dependency-identity")


def terminal_cleanup_binding(worker, stop, expected):
    require(stop["pending"] is False and stop["owned_survivors"] == [] and stop["problems"] == [], "terminal-unresolved-work")
    require(stop["foreign_preserved"] is True, "terminal-foreign-preservation")
    terminal_retained_evidence(stop["transport"], expected)
    require(worker["foreign_before_sha256"] == stop["foreign_before_sha256"], "terminal-foreign-baseline")
    require(re.fullmatch(HEX_64, worker["foreign_before_sha256"]) is not None, "terminal-foreign-baseline-hash")
    operations = stop["operation_results"]
    require([r["operation"] for r in operations] == ["pull", "create-assemble", "copy", "commit", "create-verify"], "terminal-operation-closure")
    require(all(r["attempt_sha256"] == expected["attempt_sha256"] for r in operations), "terminal-operation-attempt")
    commit = operations[3]["identity"]
    require(commit == {"image_id": worker["image"]["id"], "config_sha256": worker["image"]["config_sha256"],
                       "rootfs_layers": worker["image"]["layers"]}, "terminal-commit-binding")
    require(operations[0]["identity"] == {"base_image_id": BASE_ID, "rootfs_layers": worker["base_layers"]}, "terminal-pull-binding")
    require(operations[2]["identity"]["input_tar_sha256"] == worker["input_tar_sha256"], "terminal-copy-binding")
    assembler, verifier = (operations[i]["identity"]["container_id"] for i in (1, 4))
    require(re.fullmatch(HEX_64, assembler) is not None and re.fullmatch(HEX_64, verifier) is not None
            and assembler != verifier and operations[2]["identity"]["container_id"] == assembler, "terminal-container-binding")


def terminal_retained_evidence(evidence, expected):
    require(type(evidence) is dict and evidence["state"] == RETAINED_EVIDENCE and evidence["owner"] == OWNER,
            "terminal-transport-custody")
    require(evidence["attempt_sha256"] == expected["attempt_sha256"]
            and evidence["custody_due"] == expected["custody_due"]
            and evidence["reconciliation_ref"] == expected["reconciliation_ref"], "terminal-transport-attempt")
    require(all(type(evidence[k]) is int and evidence[k] >= 0 for k in ("device", "inode", "uid", "gid"))
            and evidence["inode"] > 0 and evidence["mode"] == 0o700, "terminal-transport-identity")
    require((evidence["uid"], evidence["gid"]) == (expected["transport_uid"], expected["transport_gid"]), "terminal-transport-owner")
    rows = evidence["files"]
    require(len(rows) == 5 and {r["path"] for r in rows}
            == {"ownership.json", "operation-results.jsonl", "worker-context.json", "pending-operation.json", "docker/config.json"},
            "terminal-transport-members")
    require(all(type(r["bytes"]) is int and r["bytes"] >= 0 and re.fullmatch(HEX_64, r["sha256"]) is not None
            for r in rows), "terminal-transport-member-identity")
    require(evidence["bytes"] == sum(r["bytes"] for r in rows) <= EVIDENCE_LIMIT, "terminal-transport-size")
    require(evidence["sha256"] == digest(json.dumps(rows, sort_keys=True, separators=(",", ":")).encode()),
            "terminal-transport-manifest")


def collect_terminal(raw, expected, wait_exit_code):
    """Independent join; neither a worker line nor launch success is acceptance."""
    require(type(wait_exit_code) is int and wait_exit_code == 0, "unit-wait-failed")
    require(type(raw) is bytes and len(raw) <= MIB, "terminal-receipt-limit")
    records = [strict_json(line) for line in raw.splitlines() if line.strip()]
    require(len(records) == 2 and all(type(r) is dict for r in records)
            and {r.get("role") for r in records} == {"worker", "stop"}, "terminal-record-pair")
    worker, stop = terminal_process_binding(records, expected)
    terminal_input_binding(worker, expected)
    terminal_cleanup_binding(worker, stop, expected)
    return {"schema": "durable-workflow.preparation-terminal/v1", "outcome": "prepared-inputs-only",
            "unit": expected["unit"], "invocation_id": worker["invocation_id"], "attempt_sha256": expected["attempt_sha256"],
            "source_bundle_sha256": expected["source_bundle_sha256"], "authority_sha256": expected["authority_sha256"],
            "worker_pid": worker["pid"], "stop_pid": stop["pid"], "unit_wait_exit": 0,
            "subject": SUBJECT, "base_image_id": BASE_ID, "dependencies": worker["dependencies"],
            "seal": worker["seal"], "image": worker["image"], "readback_sha256": worker["readback_sha256"],
            "pending": False, "owned_survivors": [], "foreign_preserved": True, "transport": stop["transport"],
            "browser": "not-run", "provider": "not-run", "compatibility_accepted": False, "rollout_approved": False}


def main():
    # Enabling this requires a separately reviewed exact source/invocation change.
    # There is deliberately no command-line/environment override for admission.
    if OPERATION_ADMISSION is None:
        print("Preparation admission is unset; source controls only.")
        return 78
    modules = globals().get("_VERIFIED_MODULES")
    require(type(modules) is dict and set(modules) == {"rust_preparation", "rust_preparation_authority", "rust_preparation_platform"}, "external-source-verification-required")
    # The external preloader installs the authenticated platform module from its
    # captured bytes, before calling main. Never resolve it from a worktree.
    platform = sys.modules.get("rust_preparation_platform")
    require(platform is not None and getattr(platform, "VERIFIED_SOURCE_SHA256", None)
            == digest(modules["rust_preparation_platform"]), "platform-source-binding")
    authority = sys.modules.get("rust_preparation_authority")
    require(authority is not None and getattr(authority, "VERIFIED_SOURCE_SHA256", None)
            == digest(modules["rust_preparation_authority"]), "authority-source-binding")
    return platform.entrypoint(sys.argv[1:], modules, OPERATION_ADMISSION)


def cli():
    try:
        return main()
    except Exception as error:
        reason = error.args[0] if isinstance(error, Refusal) and error.args else "controller-refused"
        if not isinstance(reason, str) or re.fullmatch(r"[a-z-]{1,80}", reason) is None:
            reason = "controller-refused"
        print(json.dumps({"outcome": "refused", "reason": reason, "browser": "not-run"}))
        return 1


if __name__ == "__main__":
    raise SystemExit(cli())
