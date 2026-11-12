"""Inert controls: synthetic archives/records and fake daemon/supervisor only.

Unsafe baselines below are explicit test countermodels, not historical runs.
No seal, socket, network, service, image or container is created by this suite.
"""

import copy
import base64
import dataclasses
import datetime as dt
import gzip
import hashlib
import io
import json
import os
import shutil
from pathlib import Path
import stat
import tarfile
import tempfile
import unittest
import zipfile
import time
from types import SimpleNamespace
from unittest import mock

import rust_preparation as prep
import rust_preparation_platform as native
import rust_preparation_authority as authority


# Exact effect functions captured from aad23d45, retained only as unsafe
# predecessor controls. These run solely against disposable synthetic trees.
PREDECESSOR_CREATE = 'def create_transport(spec, nonce):\n    admitted()\n    root = Path(spec["staging_path"])\n    home = Path(pwd.getpwuid(os.getuid()).pw_dir)\n    core.require(not root.is_relative_to(home) and root.resolve() == root, "transport-location")\n    core.require((os.getuid(), os.getgid()) == (spec["uid"], spec["gid"]), "executor-owner")\n    root.mkdir(mode=0o700)\n    for name in ("home", "docker"):\n        (root / name).mkdir(mode=0o700)\n    observed = root.stat()\n    owner_record = {"nonce": nonce, "device": observed.st_dev, "inode": observed.st_ino}\n    for name, raw in (("docker/config.json", b"{}"), (OWNERSHIP_FILE, json.dumps(owner_record).encode())):\n        with os.fdopen(os.open(root / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), "wb") as file:\n            file.write(raw)\n    return owner_record\n'
PREDECESSOR_CREATE_SHA256 = '571789f1853a14dd2eafbf98cfbadc682495f41b007b79d70d1d0a3a41acfde3'
PREDECESSOR_REMOVE = 'def remove_contents(self):\n    core.require(self.namespace_matches(), "transport-namespace-changed")\n    expected = {"home", "docker", OWNERSHIP_FILE}\n    if self.exists(RESULTS_FILE):\n        expected.add(RESULTS_FILE)\n    if self.exists(CONTEXT_FILE):\n        expected.add(CONTEXT_FILE)\n    core.require(set(os.listdir(self.fd)) == expected, "transport-extra-or-pending")\n    children = {}\n    try:\n        for name in ("home", "docker"):\n            child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=self.fd)\n            children[name] = child\n            core.require(os.fstat(child).st_uid == self.identity.st_uid, "transport-child-owner")\n        core.require(os.listdir(children["home"]) == [], "transport-home-extra")\n        core.require(os.listdir(children["docker"]) == ["config.json"], "transport-config-extra")\n        os.unlink("config.json", dir_fd=children["docker"])\n        for name in (OWNERSHIP_FILE, RESULTS_FILE, CONTEXT_FILE):\n            if self.exists(name):\n                os.unlink(name, dir_fd=self.fd)\n        for name in ("home", "docker"):\n            os.rmdir(name, dir_fd=self.fd)\n        core.require(self.namespace_matches(), "transport-namespace-changed")\n        os.rmdir(self.name, dir_fd=self.parent)\n        core.require(os.fstat(self.fd).st_nlink == 0, "bound-transport-survivor")\n    finally:\n        for child in children.values():\n            os.close(child)\n'
PREDECESSOR_REMOVE_SHA256 = '6a65cb51d6f2484645465c6d1409eaeefda15b88c72970a647e050360dc1f8c9'


class HardStop(BaseException):
    pass


class FakeSeal:
    def __init__(self, raw, corrupt=False):
        self.raw = raw
        self.corrupt = corrupt
        self.closed = False

    def verified_hash(self):
        return "bad" if self.corrupt else prep.digest(self.raw)

    def close(self):
        self.closed = True


class FakeEffects:
    def __init__(self, expected=()):
        self.containers = {}
        self.images = {}
        self.expected = expected
        self.guardian = False
        self.fresh_sample = False
        self.alive = True
        self.calls = []
        self.inspected = []
        self.fault = None
        self.bad_return = None
        self.uncertain = False
        self.bad_record = None
        self.bad_image = False
        self.bad_readback = False
        self.bad_prefix = False
        self.bad_seal = False
        self.next_id = 1
        self.last_seal = None
        self.pending_operation = None
        self.bound_operations = []

    def edge(self, name):
        self.calls.append(name)
        if self.fault == name:
            self.fault = None
            raise HardStop(name)

    def register(self):
        self.edge("register-before")
        self.guardian = True
        self.fresh_sample = True
        self.edge("register-after")

    def supervisor_ready(self):
        prep.require(self.guardian and self.alive and self.fresh_sample, "supervisor-unready")
        prep.require(not self.uncertain, "daemon-terminal-unknown")

    def name_exists(self, name):
        return any(r["Name"] == "/" + name for r in self.containers.values())

    def discover(self, owner, role):
        return [cid for cid, record in self.containers.items()
                if record["Name"] == "/" + owner.name(role)
                and all(record["Config"]["Labels"].get(k) == v for k, v in owner.labels(role).items())]

    def inspect(self, cid):
        self.inspected.append(cid)
        self.edge("inspect-" + self.containers[cid]["Config"]["Labels"][prep.LABEL_ROLE])
        return copy.deepcopy(self.containers[cid])

    def create(self, owner, role, image):
        self.supervisor_ready()
        self.pending_operation = "create-" + role
        self.edge("create-" + role + "-before")
        cid = f"{self.next_id:064x}"
        self.next_id += 1
        record = allocation(cid, owner, role, image)
        if self.bad_record:
            self.bad_record(record)
        self.containers[cid] = record
        self.edge("create-" + role + "-after")
        return cid if self.bad_return is None else self.bad_return

    def remove(self, cid):
        self.edge("remove-before")
        del self.containers[cid]
        self.edge("remove-after")

    def seal(self, raw):
        self.last_seal = FakeSeal(raw, self.bad_seal)
        return self.last_seal

    def require_safe_prefixes(self, _cid):
        prep.require(not self.bad_prefix, "base-prefix-symlink")

    def copy_sealed(self, _cid, _sealed):
        self.pending_operation = "copy"
        self.edge("copy-before")
        self.edge("copy-after")

    def commit(self, _cid):
        self.pending_operation = "commit"
        self.edge("commit-before")
        image_id = "sha256:" + "c" * 64
        record = {"Id": image_id, "RootFS": {"Layers": ["base", "public"]},
                  "Config": {"Cmd": ["/bin/false"], "Entrypoint": None}}
        if self.bad_image:
            record["RootFS"]["Layers"][0] = "other"
        self.images[image_id] = record
        self.edge("commit-after")
        return image_id

    def image_inspect(self, image_id):
        self.edge("image-inspect")
        return copy.deepcopy(self.images[image_id])

    def readback(self, _cid):
        self.edge("readback-before")
        self.edge("readback-after")
        return () if self.bad_readback else self.expected

    def uncertain_daemon_operation(self):
        return self.uncertain or self.pending_operation is not None

    def complete_operation(self, operation, identity):
        prep.require(self.pending_operation == operation, "operation-binding")
        self.edge("bind-" + operation + "-before")
        self.bound_operations.append({"operation": operation, **identity})
        self.edge("bind-" + operation + "-recorded")
        self.pending_operation = None


def allocation(cid, owner, role, image=prep.BASE_ID):
    return {"Id": cid, "Name": "/" + owner.name(role), "Image": image,
            "WithinPreparationWindow": True,
            "Config": {"Labels": owner.labels(role), "Cmd": ["/bin/false"], "Entrypoint": None},
            "State": {"Status": "created", "Running": False}, "Mounts": [],
            "HostConfig": {"NetworkMode": "none", "ReadonlyRootfs": role == "verify",
                           "PidMode": "", "IpcMode": "private", "UTSMode": "", "PublishAllPorts": False,
                           "NanoCpus": 1000000000, "Memory": 512 * prep.MIB,
                           "PidsLimit": 64, "Init": True, "Privileged": False,
                           "CapDrop": ["ALL"], "SecurityOpt": ["no-new-privileges:true"]}}


def archive(members):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w") as value:
        for name, data, kind in members:
            info = tarfile.TarInfo(name)
            info.type = kind
            info.mode = 0o644
            info.size = len(data) if kind == tarfile.REGTYPE else 0
            if kind in (tarfile.SYMTYPE, tarfile.LNKTYPE):
                info.linkname = "/outside"
            value.addfile(info, io.BytesIO(data) if info.size else None)
    return output.getvalue()


def transport_fixture(parent):
    root = Path(parent) / "transport"
    root.mkdir(mode=0o700)
    (root / "home").mkdir(mode=0o700)
    (root / "docker").mkdir(mode=0o700)
    (root / "docker/config.json").write_bytes(native.ANONYMOUS_CONFIG)
    (root / "docker/config.json").chmod(0o600)
    observed = root.stat()
    nonce = "a" * 64
    (root / native.OWNERSHIP_FILE).write_text(json.dumps({"nonce": nonce, "device": observed.st_dev, "inode": observed.st_ino, "children": {name: {"device": (root / name).stat().st_dev,
                    "inode": (root / name).stat().st_ino} for name in ("home", "docker")}}))
    (root / native.OWNERSHIP_FILE).chmod(0o600)
    return ({"staging_path": str(root), "uid": os.getuid(), "gid": os.getgid(),
             "retention": {"owner": prep.OWNER, "custody_due": "2026-11-06T00:00:00+00:00", "reconciliation_ref": "synthetic"}},
            {"nonce": nonce, "deadline": time.monotonic() + 30,
             "started_at": dt.datetime.now(dt.timezone.utc).isoformat()})


class InputControls(unittest.TestCase):
    def test_current_packet_authenticates_without_loading_it(self):
        root = Path(__file__).parent
        entries = tuple(prep.Entry(n, (root / n).read_bytes())
                        for n in (*prep.PACKET_MEMBERS, "rust-local-browser-packet.json"))
        inventory, lock = prep.packet_from_entries(entries)
        self.assertEqual(len(inventory["files"]), 484)
        self.assertEqual(len(lock["packages"]), 3)
        mutated = list(entries)
        mutated[0] = dataclasses.replace(mutated[0], data=b"changed")
        changed_entries = tuple(mutated)
        with self.assertRaises(prep.Refusal):
            prep.packet_from_entries(changed_entries)
        shadow_entries = entries + (prep.Entry("node_modules/shadow", b"x"),)
        with self.assertRaises(prep.Refusal):
            prep.packet_from_entries(shadow_entries)

    def test_archive_refuses_traversal_links_devices_duplicates_and_limits(self):
        good = archive([("package/file", b"ok", tarfile.REGTYPE)])
        self.assertEqual(prep.tar_entries(good, "package")[0].data, b"ok")
        bad = [
            [("../outside", b"x", tarfile.REGTYPE)],
            [("/absolute", b"x", tarfile.REGTYPE)],
            [("package/link", b"", tarfile.SYMTYPE)],
            [("package/link", b"", tarfile.LNKTYPE)],
            [("package/device", b"", tarfile.CHRTYPE)],
            [("package/f", b"a", tarfile.REGTYPE), ("package/f", b"b", tarfile.REGTYPE)],
            [("package/f", b"a", tarfile.REGTYPE), ("package/f/child", b"b", tarfile.REGTYPE)],
        ]
        for members in bad:
            raw = archive(members)
            with self.subTest(members=members), self.assertRaises(prep.Refusal):
                prep.tar_entries(raw, "package")
        with mock.patch.object(prep, "TREE_LIMIT", 1), self.assertRaises(prep.Refusal):
            prep.tar_entries(good, "package")

    def test_json_duplicate_and_nonfinite_refusals(self):
        for raw in (b'{"a":1,"a":2}', b'{"a":NaN}'):
            with self.assertRaises(prep.Refusal):
                prep.strict_json(raw)

    def test_handoff_owner_inode_mode_bytes_and_symlink_controls(self):
        with tempfile.TemporaryDirectory(prefix="dw-source-fixture-") as directory:
            path = Path(directory) / "synthetic.zip"
            path.write_bytes(b"synthetic source fixture")
            s = path.stat()
            binding = {"uid": s.st_uid, "gid": s.st_gid, "mode": stat.S_IMODE(s.st_mode),
                       "parent_mode": stat.S_IMODE(path.parent.stat().st_mode),
                       "device": s.st_dev, "inode": s.st_ino, "bytes": s.st_size,
                       "sha256": prep.digest(path.read_bytes())}
            self.assertEqual(prep.held_regular(str(path), binding), path.read_bytes())
            for key in ("uid", "gid", "mode", "parent_mode", "device", "inode", "bytes"):
                wrong = {**binding, key: binding[key] + 1}
                with self.subTest(key=key), self.assertRaises(prep.Refusal):
                    prep.held_regular(str(path), wrong)
            path.write_bytes(b"x" * s.st_size)
            with self.assertRaises(prep.Refusal):
                prep.held_regular(str(path), binding)
            link = Path(directory) / "alias"
            link.symlink_to(path)
            with self.assertRaises(OSError):
                prep.held_regular(str(link), binding)

    def test_canonical_tar_has_only_public_roots_and_normalized_modes(self):
        raw, entries = prep.public_tar((prep.Entry("source.cjs", b"s"),),
                                       (prep.Entry("index.html", b"h"),),
                                       (prep.Entry("runtime/node_modules/p/file", b"p"),))
        decoded = prep.tar_entries(raw)
        self.assertEqual({e.path: e.data for e in decoded}, {e.path: e.data for e in entries})
        with self.assertRaises(dataclasses.FrozenInstanceError):
            entries[0].data = b"changed"

    def test_default_cli_guard_precedes_any_effect(self):
        with mock.patch("builtins.print") as output:
            self.assertEqual(prep.main(), 78)
        output.assert_called_once()
        self.assertIsNone(prep.OPERATION_ADMISSION)

    def test_dependency_archives_authenticate_the_complete_two_package_graph(self):
        name = "playwright"
        package = {"name": name, "version": "1.64.0", "dependencies": {"playwright-core": "1.64.0"}}
        def compressed(value):
            return gzip.compress(archive([("package/package.json", json.dumps(value).encode(), tarfile.REGTYPE)]))
        raw = compressed(package)
        record = {"resolved": "https://registry.npmjs.org/playwright/-/playwright-1.64.0.tgz", "version": "1.64.0",
                  "integrity": "sha512-" + base64.b64encode(hashlib.sha512(raw).digest()).decode()}
        lock = {"packages": {"node_modules/playwright": record}}
        self.assertEqual(len(prep.dependency_entries(raw, name, lock)), 1)
        with self.assertRaises(prep.Refusal):
            prep.dependency_entries(raw + b"tampered", name, lock)
        bad = compressed({**package, "optionalDependencies": {"unexpected": "1.0.0"}})
        changed = {"packages": {"node_modules/playwright": {**record,
                   "integrity": "sha512-" + base64.b64encode(hashlib.sha512(bad).digest()).decode()}}}
        with self.assertRaises(prep.Refusal):
            prep.dependency_entries(bad, name, changed)
        with mock.patch.object(prep, "TAR_LIMIT", 2), self.assertRaises(prep.Refusal):
            prep.dependency_entries(raw, name, lock)

    def test_synthetic_zip_digest_inventory_build_and_expiry(self):
        build = {"version": "synthetic"}
        members = [("__build.json", json.dumps(build).encode(), tarfile.REGTYPE)]
        members += [(f"file-{i}", b"synthetic", tarfile.REGTYPE) for i in range(483)]
        tar = archive(members)
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as value:
            value.writestr("artifact.tar", tar)
        raw = output.getvalue()
        inventory = {"build_identity": build, "files": [{"path": n, "bytes": len(b), "sha256": prep.digest(b)}
                                                       for n, b, _kind in members]}
        now = dt.datetime(2026, 11, 5, tzinfo=dt.timezone.utc)
        with mock.patch.object(prep, "ZIP_BYTES", len(raw)), mock.patch.object(prep, "ZIP_SHA", prep.digest(raw)):
            self.assertEqual(len(prep.artifact_from_zip(raw, inventory, now)), 484)
            bad = copy.deepcopy(inventory)
            bad["files"][0]["sha256"] = "f" * 64
            with self.assertRaises(prep.Refusal):
                prep.artifact_from_zip(raw, bad, now)
            expired = now + dt.timedelta(days=2)
            with self.assertRaises(prep.Refusal):
                prep.artifact_from_zip(raw, inventory, expired)
            with self.assertRaises(prep.Refusal):
                prep.artifact_from_zip(raw + b"x", inventory, now)

    def test_handoff_path_swap_cannot_change_the_captured_descriptor(self):
        with tempfile.TemporaryDirectory(prefix="dw-fd-fixture-") as directory:
            path = Path(directory) / "synthetic.zip"
            raw = b"authenticated fixture"
            path.write_bytes(raw)
            info = path.stat()
            binding = {"uid": info.st_uid, "gid": info.st_gid, "mode": stat.S_IMODE(info.st_mode),
                       "parent_mode": stat.S_IMODE(path.parent.stat().st_mode), "device": info.st_dev,
                       "inode": info.st_ino, "bytes": len(raw), "sha256": prep.digest(raw)}
            original_open = os.open
            def swapping_open(name, *args, **kwargs):
                fd = original_open(name, *args, **kwargs)
                if name == "synthetic.zip":
                    path.rename(path.with_name("old.zip"))
                    path.write_bytes(b"replacement pathname content")
                return fd
            with mock.patch("os.open", side_effect=swapping_open):
                self.assertEqual(prep.held_regular(str(path), binding), raw)
            self.assertNotEqual(path.read_bytes(), raw)

    def test_external_preloader_refuses_code_manifest_extra_and_link_before_load(self):
        source = Path(__file__).parent
        plan = (source / "rust-preparation-controller.md").read_text()
        code = plan.split("<<'PY'\n", 1)[1].split("\nPY\n", 1)[0]
        import shutil
        import sys
        with tempfile.TemporaryDirectory(prefix="dw-preloader-fixture-") as directory:
            root = Path(directory)
            names = ["rust-preparation-source.json", "rust_preparation.py", "rust_preparation_platform.py", "rust_preparation_authority.py", "test_rust_preparation.py"]
            for name in names:
                shutil.copyfile(source / name, root / name)
            def check(error=None):
                with mock.patch.dict("sys.modules"), mock.patch.object(sys, "argv", ["preloader", directory]), \
                        mock.patch("builtins.print"), mock.patch("subprocess.Popen", side_effect=AssertionError("process")), \
                        mock.patch("os.memfd_create", side_effect=AssertionError("seal")):
                    if error:
                        with self.assertRaisesRegex(RuntimeError, error):
                            exec(code, {})
                    else:
                        with self.assertRaises(SystemExit) as result:
                            exec(code, {})
                        self.assertEqual(result.exception.code, 78)
            check()
            target = root / "rust_preparation.py"
            original = target.read_bytes()
            target.write_bytes(b"raise AssertionError('unverified code loaded')\n")
            check("source-member-hash")
            target.write_bytes(original)
            target.unlink()
            target.symlink_to(source / "rust_preparation.py")
            with self.assertRaises(OSError):
                check()
            target.unlink()
            target.write_bytes(original)
            extra = root / "json.py"
            extra.write_bytes(b"raise AssertionError('shadow imported')")
            check("source-closure")
            extra.unlink()
            target = root / "rust-preparation-source.json"
            target.write_bytes(target.read_bytes() + b"\n")
            check("source-manifest-hash")


class LifecycleControls(unittest.TestCase):
    def setUp(self):
        self.owner = prep.Ownership("a" * 64)
        self.expected = (prep.Entry("site/index.html", b"ok"),)

    def supervised(self, effects):
        try:
            effects.register()
            return prep.assemble(effects, self.owner, b"synthetic tar", self.expected, ["base"])
        finally:
            # Models systemd's independent stop path, including hard worker loss.
            # It is not called by assemble's cooperative cleanup path.
            if effects.guardian:
                prep.cleanup(effects, self.owner)

    def test_positive_and_guardian_before_create_countermodel(self):
        effects = FakeEffects(self.expected)
        self.assertTrue(self.supervised(effects).startswith("sha256:"))
        self.assertEqual(effects.containers, {})
        self.assertTrue(effects.last_seal.closed)
        unsafe = FakeEffects()
        # Unsafe baseline: allocation precedes guardian registration.
        unsafe.containers["f" * 64] = allocation("f" * 64, self.owner, "assemble")
        self.assertFalse(unsafe.guardian)
        self.assertEqual(len(unsafe.containers), 1)
        safe = FakeEffects()
        with self.assertRaises(prep.Refusal):
            prep.allocate(safe, self.owner, "assemble", prep.BASE_ID)
        self.assertEqual(safe.containers, {})

    def test_hard_stop_at_every_create_copy_commit_readback_and_cleanup_edge(self):
        edges = ["register-before", "register-after", "create-assemble-before", "create-assemble-after",
                 "inspect-rust-custody-assemble", "copy-before", "copy-after", "commit-before",
                 "commit-after", "image-inspect", "remove-before", "remove-after",
                 "create-verify-before", "create-verify-after", "inspect-rust-custody-verify",
                 "readback-before", "readback-after"]
        for edge in edges:
            with self.subTest(edge=edge):
                effects = FakeEffects(self.expected)
                effects.fault = edge
                with self.assertRaises(HardStop):
                    self.supervised(effects)
                self.assertEqual(effects.containers, {})
                if effects.last_seal:
                    self.assertTrue(effects.last_seal.closed)

    def test_lost_malformed_and_mismatched_return_still_clean_owned_allocation(self):
        for returned in ("", "bad", "f" * 64):
            with self.subTest(returned=returned):
                effects = FakeEffects(self.expected)
                effects.bad_return = returned
                with self.assertRaises(prep.Refusal):
                    self.supervised(effects)
                self.assertEqual(effects.containers, {})
                self.assertNotIn("copy-before", effects.calls)

    def test_foreign_name_nonce_collision_never_inspected_or_removed(self):
        effects = FakeEffects(self.expected)
        foreign = prep.Ownership("b" * 64)
        cid = "f" * 64
        effects.containers[cid] = allocation(cid, foreign, "assemble")
        original = copy.deepcopy(effects.containers)
        with self.assertRaises(prep.Refusal):
            self.supervised(effects)
        self.assertEqual(effects.containers, original)
        self.assertNotIn(cid, effects.inspected)

    def test_seal_prefix_config_layer_and_readback_mismatch_stop_and_clean(self):
        for field in ("bad_seal", "bad_prefix", "bad_image", "bad_readback"):
            with self.subTest(field=field):
                effects = FakeEffects(self.expected)
                setattr(effects, field, True)
                with self.assertRaises(prep.Refusal):
                    self.supervised(effects)
                self.assertEqual(effects.containers, {})
        effects = FakeEffects(self.expected)
        effects.bad_record = lambda r: r["HostConfig"].update(NetworkMode="bridge")
        with self.assertRaises(prep.Refusal):
            self.supervised(effects)
        self.assertEqual(effects.containers, {})

    def test_continuing_daemon_work_is_unknown_and_never_accepted_as_cleanup(self):
        effects = FakeEffects(self.expected)
        effects.register()
        prep.allocate(effects, self.owner, "assemble", prep.BASE_ID)
        effects.uncertain = True
        self.assertEqual(prep.cleanup(effects, self.owner), ("daemon-terminal-unknown",))
        self.assertEqual(effects.containers, {})
        with self.assertRaises(prep.Refusal):
            effects.supervisor_ready()

    def test_unready_or_dead_supervisor_blocks_allocation(self):
        for attribute in ("fresh_sample", "alive"):
            effects = FakeEffects()
            effects.register()
            setattr(effects, attribute, False)
            with self.assertRaises(prep.Refusal):
                prep.allocate(effects, self.owner, "assemble", prep.BASE_ID)
            self.assertEqual(effects.containers, {})

    def test_late_owned_allocation_is_refused_for_use_but_cleanup_still_removes_it(self):
        effects = FakeEffects()
        effects.register()
        record = allocation("f" * 64, self.owner, "assemble")
        record["WithinPreparationWindow"] = False
        effects.containers[record["Id"]] = record
        with self.assertRaises(prep.Refusal):
            prep.inspect_allocation(record, self.owner, "assemble", prep.BASE_ID)
        self.assertEqual(prep.cleanup(effects, self.owner), ("allocation-window",))
        self.assertEqual(effects.containers, {})


class MemoryKernel:
    def __init__(self):
        self.raw = b""
        self.position = 0
        self.flags = 0
        self.closed = False

    def create(self):
        return 42

    def write(self, _fd, raw):
        prep.require(not self.flags, "sealed-write")
        self.raw = raw

    def add_seals(self, _fd, flags):
        self.flags = flags

    def seals(self, _fd):
        return self.flags

    def rewind(self, _fd):
        self.position = 0

    def read(self, _fd):
        result = self.raw[self.position:]
        self.position = len(self.raw)
        return result

    def close(self, _fd):
        self.closed = True


class TerminalControls(unittest.TestCase):
    def pair(self):
        expected = {"unit": "synthetic.service", "attempt_sha256": "a" * 64,
                    "source_bundle_sha256": "b" * 64, "authority_sha256": "c" * 64,
                    "worker_command_sha256": "d" * 64, "stop_command_sha256": "e" * 64, "seal_flags": 15,
                    "custody_due": "2026-11-06T12:00:00+00:00", "reconciliation_ref": "synthetic",
                    "transport_uid": 1000, "transport_gid": 1000}
        common = {"schema": "durable-workflow.preparation-stage/v1", "invocation_id": "f" * 32,
                  **{k: expected[k] for k in ("unit", "attempt_sha256", "source_bundle_sha256", "authority_sha256")}}
        image = {"id": "sha256:" + "1" * 64, "config_sha256": "1" * 64,
                 "layers": ["sha256:" + "2" * 64, "sha256:" + "3" * 64]}
        worker = {**common, "role": "worker", "pid": 100, "command_sha256": expected["worker_command_sha256"],
                  "outcome": "prepared-cleanup-pending", "subject": prep.SUBJECT, "node_packet_sha256": prep.PACKET_SHA,
                  "base_image_id": prep.BASE_ID, "base_layers": image["layers"][:1], "image": image,
                  "seal": {"sha256": "4" * 64, "flags": 15}, "input_tar_sha256": "4" * 64,
                  "readback_verified": True, "readback_sha256": "5" * 64, "foreign_before_sha256": "6" * 64,
                  "dependencies": {n: {"version": "1.64.0", "integrity": value, "sha256": "7" * 64}
                                   for n, value in prep.DEPENDENCY_INTEGRITY.items()}}
        operations = [
            ("pull", {"base_image_id": prep.BASE_ID, "rootfs_layers": worker["base_layers"]}),
            ("create-assemble", {"container_id": "8" * 64}),
            ("copy", {"container_id": "8" * 64, "input_tar_sha256": worker["input_tar_sha256"]}),
            ("commit", {"image_id": image["id"], "config_sha256": image["config_sha256"], "rootfs_layers": image["layers"]}),
            ("create-verify", {"container_id": "9" * 64}),
        ]
        rows = [{"path": n, "bytes": 1, "sha256": "a" * 64} for n in
                (native.OWNERSHIP_FILE, native.RESULTS_FILE, native.CONTEXT_FILE, native.PENDING_FILE, "docker/config.json")]
        transport = {"state": prep.RETAINED_EVIDENCE, "owner": prep.OWNER, "attempt_sha256": expected["attempt_sha256"],
                     "device": 1, "inode": 2, "uid": 1000, "gid": 1000, "mode": 0o700, "files": rows,
                     "bytes": 5, "sha256": prep.digest(authority.canonical_bytes(rows)), "custody_due": expected["custody_due"], "reconciliation_ref": expected["reconciliation_ref"]}
        stop = {**common, "role": "stop", "pid": 101, "worker_pid": worker["pid"],
                "command_sha256": expected["stop_command_sha256"], "outcome": "complete", "worker_exit_code": 1,
                "worker_exit_status": 0, "cleanup_exit_status": 0, "pending": False, "owned_survivors": [],
                "problems": [], "transport": transport, "foreign_preserved": True,
                "foreign_before_sha256": worker["foreign_before_sha256"],
                "operation_results": [{"operation": name, "identity": identity, "attempt_sha256": expected["attempt_sha256"]}
                                      for name, identity in operations]}
        return expected, worker, stop

    def capture(self, records):
        return b"\n".join(json.dumps(r).encode() for r in records)

    def test_acceptance_joins_both_terminal_stages_and_successful_unit_wait(self):
        expected, worker, stop = self.pair()
        raw = self.capture([worker, stop])
        result = prep.collect_terminal(raw, expected, 0)
        self.assertEqual(result["outcome"], "prepared-inputs-only")
        self.assertEqual((result["worker_pid"], result["stop_pid"]), (100, 101))
        self.assertFalse(result["compatibility_accepted"])
        self.assertFalse(result["rollout_approved"])
        self.assertEqual(result["browser"], "not-run")
        for code in (1, -9, None, False):
            with self.subTest(code=code), self.assertRaises(prep.Refusal):
                prep.collect_terminal(raw, expected, code)

    def test_worker_only_stop_only_duplicate_or_lost_output_cannot_pass(self):
        expected, worker, stop = self.pair()
        for records in ([], [worker], [stop], [worker, worker], [worker, stop, stop], [None, stop]):
            raw = self.capture(records)
            with self.subTest(records=len(records)), self.assertRaises(prep.Refusal):
                prep.collect_terminal(raw, expected, 0)

    def test_cross_attempt_pid_command_source_and_authority_splices_refuse(self):
        expected, worker, stop = self.pair()
        for field, wrong in (("unit", "other.service"), ("attempt_sha256", "0" * 64),
                             ("source_bundle_sha256", "0" * 64), ("authority_sha256", "0" * 64),
                             ("invocation_id", "0" * 32), ("worker_pid", 999), ("pid", worker["pid"]),
                             ("command_sha256", "0" * 64), ("worker_exit_status", 1), ("cleanup_exit_status", 1)):
            changed = copy.deepcopy(stop)
            changed[field] = wrong
            raw = self.capture([worker, changed])
            with self.subTest(field=field), self.assertRaises(prep.Refusal):
                prep.collect_terminal(raw, expected, 0)

    def test_pending_survivor_foreign_transport_or_operation_drift_cannot_pass(self):
        expected, worker, stop = self.pair()
        for field, wrong in (("pending", True), ("owned_survivors", ["8" * 64]), ("problems", ["unresolved"]),
                             ("foreign_preserved", False), ("transport", None), ("foreign_before_sha256", "0" * 64)):
            changed = copy.deepcopy(stop)
            changed[field] = wrong
            raw = self.capture([worker, changed])
            with self.subTest(field=field), self.assertRaises(prep.Refusal):
                prep.collect_terminal(raw, expected, 0)
        mutations = ((0, "base_image_id", "sha256:" + "0" * 64), (1, "container_id", "malformed"),
                     (2, "container_id", "0" * 64), (3, "image_id", "sha256:" + "0" * 64),
                     (4, "container_id", "8" * 64))
        for index, field, wrong in mutations:
            changed = copy.deepcopy(stop)
            changed["operation_results"][index]["identity"][field] = wrong
            raw = self.capture([worker, changed])
            with self.subTest(index=index), self.assertRaises(prep.Refusal):
                prep.collect_terminal(raw, expected, 0)

    def test_wrong_dependency_seal_layer_or_readback_refuses_despite_cleanup_success(self):
        expected, worker, stop = self.pair()
        for field, wrong in (("readback_verified", False), ("node_packet_sha256", "0" * 64),
                             ("seal", {"sha256": "0" * 64, "flags": 15}), ("base_layers", ["sha256:" + "0" * 64])):
            changed = copy.deepcopy(worker)
            changed[field] = wrong
            raw = self.capture([changed, stop])
            with self.subTest(field=field), self.assertRaises(prep.Refusal):
                prep.collect_terminal(raw, expected, 0)
        changed = copy.deepcopy(worker)
        changed["dependencies"]["playwright"]["integrity"] = "sha512-unreviewed"
        raw = self.capture([changed, stop])
        with self.assertRaises(prep.Refusal):
            prep.collect_terminal(raw, expected, 0)

    def test_retained_evidence_requires_closed_bounded_custody_and_attempt(self):
        expected, worker, stop = self.pair()
        for field, wrong in (("owner", "foreign"), ("inode", 0), ("mode", 0o777),
                             ("attempt_sha256", "0" * 64), ("custody_due", "other"),
                             ("bytes", prep.EVIDENCE_LIMIT + 1), ("sha256", "0" * 64), ("files", [])):
            changed = copy.deepcopy(stop)
            changed["transport"][field] = wrong
            raw = self.capture([worker, changed])
            with self.subTest(field=field), self.assertRaises(prep.Refusal):
                prep.collect_terminal(raw, expected, 0)


class AuthorityControls(unittest.TestCase):
    def test_runtime_hash_allows_read_atime_but_rejects_content_metadata_race(self):
        before = SimpleNamespace(st_mode=stat.S_IFREG | 0o644, st_uid=0, st_gid=0, st_dev=1,
                                 st_ino=1, st_size=4, st_mtime_ns=1, st_ctime_ns=1, st_nlink=1, st_atime_ns=1)
        after = copy.copy(before)
        after.st_atime_ns = 2
        observer = authority.NativeObserver()
        with mock.patch("os.fstat", side_effect=[before, after]), mock.patch("os.read", side_effect=[b"ELF!", b""]), \
                mock.patch("os.lseek"):
            observed = observer._metadata("/synthetic/root-owned-runtime", 999)
        self.assertEqual(observed["sha256"], prep.digest(b"ELF!"))
        after.st_mtime_ns = 2
        observer = authority.NativeObserver()
        with mock.patch("os.fstat", side_effect=[before, after]), mock.patch("os.read", side_effect=[b"ELF!", b""]), \
                mock.patch("os.lseek"):
            with self.assertRaises(prep.Refusal):
                observer._metadata("/synthetic/root-owned-runtime", 999)

    def record(self):
        def binding(path):
            return {"path": path, "uid": 0, "gid": 0, "mode": 0o755, "device": 1,
                    "inode": 2, "bytes": 4, "sha256": "f" * 64}
        roots = {"/usr/lib/fixture": {"kind": "directory", "members": {"lib.so": {"kind": "file"}}}}
        tools = {name: {"entry_path": path, "binding": binding(path), "runtime_roots": list(roots)}
                 for name, path in authority.ENTRY_PATHS.items()}
        processes = {name: {"pid": n + 10, "start_ticks": "1", "uids": [0, 0, 0, 0],
                            "exe": binding("/usr/bin/" + name), "mapped_files": ["/usr/lib/fixture/lib.so"]}
                     for n, name in enumerate(sorted(authority.PROCESSES))}
        packages = {"/var/lib/dpkg/status": binding("/var/lib/dpkg/status")}
        return {"schema": "durable-workflow.installed-authority/v1", "boot_id": "synthetic-boot", "tools": tools, "processes": processes,
                "catalogs": roots, "python_search": ["/usr/lib/fixture"],
                "loader_configs": {p: binding(p) for p in authority.LOADER_CONFIGS}, "package_receipts": packages,
                "socket": {"path": "/run/docker.sock", "peer_pid": processes["daemon"]["pid"]},
                "closure_receipt": {"independent_review": "synthetic-source-control",
                                    "package_catalog_sha256": prep.digest(authority.canonical_bytes(packages)),
                                    "complete_loader_closure": True}}

    def observer(self, actual):
        class Observer:
            def boot_id(self):
                return actual["boot_id"]
            def python_search(self):
                return actual["python_search"]
            def catalog(self, root):
                return actual["catalogs"][root]
            def file(self, path):
                values = [t["binding"] for t in actual["tools"].values()]
                values += list(actual["loader_configs"].values()) + list(actual["package_receipts"].values())
                return next(v for v in values if v["path"] == path)
            def resolve(self, path):
                return path
            def process(self, pid):
                return next(p for p in actual["processes"].values() if p["pid"] == pid)
            def socket_identity(self, _path):
                return actual["socket"]
        return Observer()

    def test_unbound_installed_authority_refuses_before_observation(self):
        raw = authority.canonical_bytes(self.record())
        with self.assertRaises(prep.Refusal):
            authority.HostAuthority(raw, None)
        observer = authority.NativeObserver()
        with self.assertRaises(prep.Refusal):
            observer.socket_identity("/run/docker.sock")

    def test_complete_catalog_rejects_extra_library_tool_process_and_socket_drift(self):
        record = self.record()
        raw = authority.canonical_bytes(record)
        expected = prep.digest(raw)
        authority.HostAuthority(raw, self.observer(copy.deepcopy(record)), expected)
        cases = []
        for field, key, wrong in (("catalogs", "/usr/lib/fixture", {"kind": "directory", "members": {"extra.so": {}}}),
                                  ("python_search", None, ["/unbound"]), ("boot_id", None, "other-boot")):
            changed = copy.deepcopy(record)
            if key is None:
                changed[field] = wrong
            else:
                changed[field][key] = wrong
            cases.append(changed)
        for tool in authority.TOOLS:
            changed = copy.deepcopy(record)
            changed["tools"][tool]["binding"]["sha256"] = "a" * 64
            cases.append(changed)
        for process in authority.PROCESSES:
            changed = copy.deepcopy(record)
            changed["processes"][process]["start_ticks"] = "2"
            cases.append(changed)
        changed = copy.deepcopy(record)
        changed["socket"]["peer_pid"] = 999
        cases.append(changed)
        for actual in cases:
            observer = self.observer(actual)
            with self.assertRaises(prep.Refusal):
                authority.HostAuthority(raw, observer, expected)

    def test_invocation_cannot_narrow_the_pinned_tool_and_library_closure(self):
        for field in ("tools", "catalogs"):
            record = self.record()
            record[field].pop(next(iter(record[field])))
            raw = authority.canonical_bytes(record)
            observer = self.observer(record)
            expected = prep.digest(raw)
            with self.assertRaises(prep.Refusal):
                authority.HostAuthority(raw, observer, expected)


class PlatformControls(unittest.TestCase):
    def test_unbound_native_entrypoints_refuse_before_any_effect(self):
        with mock.patch("subprocess.Popen", side_effect=AssertionError("unexpected process")), \
                mock.patch("os.memfd_create", side_effect=AssertionError("unexpected memfd")):
            calls = [lambda: native.CommandRunner({}).run(["unused"]),
                     lambda: native.Seal(b"synthetic"),
                     lambda: native.fetch_dependency("playwright", None),
                     lambda: native.create_transport({}, "a" * 64),
                     lambda: native.launch({}, {}),
                     lambda: native.DockerConnection("localhost").connect()]
            for call in calls:
                with self.subTest(call=call), self.assertRaises(prep.Refusal):
                    call()

    def test_captured_source_unit_refuses_without_resolving_worktree_modules(self):
        directory = Path(__file__).parent
        modules = {name: (directory / (name + ".py")).read_bytes()
                   for name in ("rust_preparation", "rust_preparation_authority", "rust_preparation_platform")}
        stub = native.unit_stub(modules)
        with mock.patch.dict("sys.modules"), mock.patch("builtins.print"), \
                mock.patch("subprocess.Popen", side_effect=AssertionError("unexpected process")), \
                mock.patch("os.memfd_create", side_effect=AssertionError("unexpected seal")):
            with self.assertRaises(SystemExit) as result:
                exec(stub, {})
            self.assertEqual(result.exception.code, 78)

    def test_real_seal_logic_uses_fake_kernel_and_refuses_mutation_missing_flags(self):
        kernel = MemoryKernel()
        with mock.patch.object(prep, "OPERATION_ADMISSION", "e" * 64):
            seal = native.Seal(b"synthetic public bytes", kernel)
            self.assertEqual(seal.verified_hash(), prep.digest(kernel.raw))
            with self.assertRaises(prep.Refusal):
                kernel.write(42, b"changed")
            flags = kernel.flags
            kernel.flags = 0
            with self.assertRaises(prep.Refusal):
                seal.verified_hash()
            kernel.flags = flags
            kernel.raw = b"changed despite simulated seals"
            with self.assertRaises(prep.Refusal):
                seal.verified_hash()
            seal.close()
        self.assertTrue(kernel.closed)

    def test_daemon_operation_journal_precedes_request_and_survives_timeout(self):
        with tempfile.TemporaryDirectory(prefix="dw-journal-fixture-") as directory:
            spec, runtime = transport_fixture(directory)
            pending = Path(spec["staging_path"]) / native.PENDING_FILE
            class Runner:
                def run(self, *_args, **_kwargs):
                    if not pending.is_file():
                        raise AssertionError("daemon request preceded journal")
                    raise prep.Refusal("command-timeout")
            with mock.patch.object(prep, "OPERATION_ADMISSION", "e" * 64):
                effects = native.LiveEffects(spec, runtime, {}, Runner())
                try:
                    with mock.patch.object(effects, "supervisor_ready"):
                        with self.assertRaises(prep.Refusal):
                            effects.command(["create"], mutation="create-assemble")
                    self.assertTrue(effects.uncertain_daemon_operation())
                    self.assertEqual(json.loads(pending.read_bytes())["operation"], "create-assemble")
                finally:
                    effects.transport.close()

    def test_successful_malformed_commit_and_post_exit_loss_remain_unresolved(self):
        for response in (b"not-an-image-id\n", b"sha256:" + b"c" * 64 + b"\n"):
            with self.subTest(response=response), tempfile.TemporaryDirectory(prefix="dw-commit-fixture-") as directory:
                spec, runtime = transport_fixture(directory)
                class Runner:
                    def run(self, *_args, **_kwargs):
                        return response
                with mock.patch.object(prep, "OPERATION_ADMISSION", "e" * 64):
                    effects = native.LiveEffects(spec, runtime, {}, Runner())
                    try:
                        with mock.patch.object(effects, "supervisor_ready"):
                            returned = effects.commit("f" * 64)
                        self.assertTrue(effects.uncertain_daemon_operation())
                        self.assertEqual(effects.require_transport().results(), [])
                        if response.startswith(b"not-"):
                            self.assertIsNone(__import__("re").fullmatch(prep.IMAGE_ID, returned))
                        else:
                            # Process exit has happened; loss before binding must
                            # leave the same unresolved journal and no acceptance.
                            with self.assertRaises(HardStop):
                                raise HardStop("after-exit-before-binding")
                            self.assertTrue(effects.uncertain_daemon_operation())
                    finally:
                        effects.transport.close()

    def retained_fixture(self, directory):
        spec, runtime = transport_fixture(directory)
        root = Path(spec["staging_path"])
        nonce = runtime["nonce"]
        rows = [{"operation": "pull", "nonce": nonce, "state": state} for state in ("pending", "bound")]
        for name, raw in ((native.PENDING_FILE, b"\n".join(json.dumps(r).encode() for r in rows)),
                          (native.RESULTS_FILE, b'{"operation":"pull"}\n'), (native.CONTEXT_FILE, b"{}")):
            (root / name).write_bytes(raw)
            (root / name).chmod(0o600)
        return spec, runtime

    def test_retention_never_deletes_empty_or_nonempty_replacement_at_any_edge(self):
        edges = ("root-open", "list-root", "child-open", "child-read", "final-namespace")
        for empty in (True, False):
            for edge in edges:
                with self.subTest(empty=empty, edge=edge), tempfile.TemporaryDirectory(prefix="dw-transport-swap-fixture-") as directory:
                    spec, runtime = self.retained_fixture(directory)
                    root = Path(spec["staging_path"])
                    original_stat = root.stat()
                    real_open, real_list = os.open, os.listdir
                    real_namespace = native.TransportDirectory.namespace_matches
                    state = {"root_fd": None, "swapped": False, "namespace_checks": 0}
                    def swap():
                        if not state["swapped"]:
                            root.rename(root.with_name("bound-original"))
                            root.mkdir(mode=0o700)
                            if not empty:
                                (root / "foreign").write_bytes(b"replacement bytes")
                            state["swapped"] = True
                    def opened(name, *args, **kwargs):
                        fd = real_open(name, *args, **kwargs)
                        if name == root.name:
                            state["root_fd"] = fd
                            if edge == "root-open":
                                swap()
                        if name == "home" and edge == "child-open":
                            swap()
                        if name == "config.json" and edge == "child-read":
                            swap()
                        return fd
                    def listed(value):
                        answer = real_list(value)
                        if value == state["root_fd"] and edge == "list-root":
                            swap()
                        return answer
                    def namespace(instance):
                        state["namespace_checks"] += 1
                        if edge == "final-namespace" and state["namespace_checks"] == 2:
                            swap()
                        return real_namespace(instance)
                    with mock.patch.object(prep, "OPERATION_ADMISSION", "e" * 64), \
                            mock.patch("os.open", side_effect=opened), mock.patch("os.listdir", side_effect=listed), \
                            mock.patch.object(native.TransportDirectory, "namespace_matches", namespace), \
                            mock.patch("os.unlink", side_effect=AssertionError("unexpected transport deletion")), \
                            mock.patch("os.rmdir", side_effect=AssertionError("unexpected transport deletion")):
                        with self.assertRaises(prep.Refusal):
                            native.retain_transport(spec, runtime)
                    self.assertTrue(state["swapped"])
                    self.assertTrue(root.is_dir())
                    self.assertEqual(list(root.iterdir()), [] if empty else [root / "foreign"])
                    if not empty:
                        self.assertEqual((root / "foreign").read_bytes(), b"replacement bytes")
                    moved = root.with_name("bound-original").stat()
                    self.assertEqual((moved.st_dev, moved.st_ino), (original_stat.st_dev, original_stat.st_ino))

    def test_exact_predecessor_adopts_first_stat_swap_and_deletes_final_empty_swap(self):
        self.assertEqual(prep.digest(PREDECESSOR_CREATE.encode()), PREDECESSOR_CREATE_SHA256)
        self.assertEqual(prep.digest(PREDECESSOR_REMOVE.encode()), PREDECESSOR_REMOVE_SHA256)
        namespace = dict(native.__dict__)
        exec(PREDECESSOR_CREATE, namespace)
        exec(PREDECESSOR_REMOVE, namespace)
        with tempfile.TemporaryDirectory(prefix="dw-old-create-fixture-") as directory:
            root = Path(directory) / "transport"
            spec = {"staging_path": str(root), "uid": os.getuid(), "gid": os.getgid()}
            real_stat = Path.stat
            state = {"swapped": False}
            def observed(path, *args, **kwargs):
                if path == root and not state["swapped"]:
                    state["swapped"] = True
                    root.rename(root.with_name("bound-original"))
                    root.mkdir(mode=0o700)
                    (root / "home").mkdir(mode=0o700)
                    (root / "docker").mkdir(mode=0o700)
                    (root / "foreign").write_bytes(b"foreign creation marker")
                return real_stat(path, *args, **kwargs)
            # Avoid a recursive Path.exists() inside the intercepted stat.
            def intercepted(path, *args, **kwargs):
                if path == root and os.path.isdir(root) and not state["swapped"]:
                    return observed(path, *args, **kwargs)
                return real_stat(path, *args, **kwargs)
            with mock.patch.object(prep, "OPERATION_ADMISSION", "e" * 64), mock.patch.object(Path, "stat", intercepted):
                namespace["create_transport"](spec, "a" * 64)
            self.assertTrue((root / native.OWNERSHIP_FILE).is_file())
            self.assertTrue((root / "docker/config.json").is_file())
            self.assertEqual((root / "foreign").read_bytes(), b"foreign creation marker")
        with tempfile.TemporaryDirectory(prefix="dw-old-remove-fixture-") as directory:
            spec, runtime = transport_fixture(directory)
            root = Path(spec["staging_path"])
            transport = native.TransportDirectory(spec, runtime)
            real_rmdir = os.rmdir
            def removed(name, *args, **kwargs):
                if name == root.name:
                    root.rename(root.with_name("bound-original"))
                    root.mkdir(mode=0o700)
                return real_rmdir(name, *args, **kwargs)
            try:
                with mock.patch("os.rmdir", side_effect=removed):
                    with self.assertRaises(prep.Refusal):
                        namespace["remove_contents"](transport)
                self.assertFalse(root.exists())
                self.assertTrue(root.with_name("bound-original").is_dir())
            finally:
                transport.close()

    def test_creation_binds_descriptor_before_first_identity_capture_and_preserves_swap(self):
        for child_swap in (False, True):
            with self.subTest(child_swap=child_swap), tempfile.TemporaryDirectory(prefix="dw-create-swap-fixture-") as directory:
                root = Path(directory) / "transport"
                spec = {"staging_path": str(root), "uid": os.getuid(), "gid": os.getgid()}
                real_open, real_fstat = os.open, os.fstat
                state = {"target_fd": None, "swapped": False, "bound": None}
                def opened(name, *args, **kwargs):
                    fd = real_open(name, *args, **kwargs)
                    if name == ("docker" if child_swap else root.name):
                        state["target_fd"] = fd
                    return fd
                def observed(fd):
                    answer = real_fstat(fd)
                    if fd == state["target_fd"] and not state["swapped"]:
                        target = root / "docker" if child_swap else root
                        state["bound"] = (answer.st_dev, answer.st_ino)
                        target.rename(target.with_name("bound-original"))
                        target.mkdir(mode=0o700)
                        (target / "foreign").write_bytes(b"foreign creation marker")
                        state["swapped"] = True
                    return answer
                with mock.patch.object(prep, "OPERATION_ADMISSION", "e" * 64), \
                        mock.patch("os.open", side_effect=opened), mock.patch("os.fstat", side_effect=observed):
                    with self.assertRaises(prep.Refusal):
                        native.create_transport(spec, "a" * 64)
                target = root / "docker" if child_swap else root
                self.assertEqual(list(target.iterdir()), [target / "foreign"])
                self.assertEqual((target / "foreign").read_bytes(), b"foreign creation marker")
                moved = target.with_name("bound-original").stat()
                actual_identity = (moved.st_dev, moved.st_ino)
                expected_identity = state["bound"]
                self.assertEqual(actual_identity, expected_identity)

    def test_descriptor_creation_binds_both_children_and_empty_credential_transport(self):
        with tempfile.TemporaryDirectory(prefix="dw-created-transport-fixture-") as directory:
            root = Path(directory) / "transport"
            spec = {"staging_path": str(root), "uid": os.getuid(), "gid": os.getgid()}
            runtime = {"nonce": "a" * 64}
            with mock.patch.object(prep, "OPERATION_ADMISSION", "e" * 64):
                record = native.create_transport(spec, runtime["nonce"])
            self.assertEqual(set(record["children"]), {"home", "docker"})
            transport = native.TransportDirectory(spec, runtime)
            try:
                runner = native.CommandRunner(native.clean_environment(root))
                self.assertEqual(runner.environment["DOCKER_CONFIG"], "/proc/self/fd/-1")
                runner.bind_transport(transport)
                self.assertEqual(runner.environment["DOCKER_CONFIG"], "/proc/self/fd/" + str(transport.children["docker"]))
                expected_fds = {transport.fd, *transport.children.values()}
                self.assertEqual(set(runner.pass_fds), expected_fds)
            finally:
                transport.close()

    def test_child_directory_swap_preserves_both_trees_and_refuses_custody(self):
        for empty in (True, False):
            with self.subTest(empty=empty), tempfile.TemporaryDirectory(prefix="dw-child-swap-fixture-") as directory:
                spec, runtime = self.retained_fixture(directory)
                root = Path(spec["staging_path"])
                real_open = os.open
                def opened(name, *args, **kwargs):
                    fd = real_open(name, *args, **kwargs)
                    if name == "docker":
                        (root / "docker").rename(root / "original-docker")
                        (root / "docker").mkdir(mode=0o700)
                        if not empty:
                            (root / "docker/foreign").write_bytes(b"foreign child")
                    return fd
                with mock.patch.object(prep, "OPERATION_ADMISSION", "e" * 64), mock.patch("os.open", side_effect=opened), \
                        mock.patch("os.unlink", side_effect=AssertionError("unexpected deletion")), \
                        mock.patch("os.rmdir", side_effect=AssertionError("unexpected deletion")):
                    with self.assertRaises(prep.Refusal):
                        native.retain_transport(spec, runtime)
                self.assertEqual((root / "original-docker/config.json").read_bytes(), native.ANONYMOUS_CONFIG)
                self.assertTrue((root / "docker").is_dir())
                if not empty:
                    self.assertEqual((root / "docker/foreign").read_bytes(), b"foreign child")

    def test_retained_transport_has_finite_closed_manifest_and_no_deletion(self):
        with tempfile.TemporaryDirectory(prefix="dw-retention-fixture-") as directory:
            spec, runtime = self.retained_fixture(directory)
            with mock.patch.object(prep, "OPERATION_ADMISSION", "e" * 64), \
                    mock.patch("os.unlink", side_effect=AssertionError("unexpected deletion")), \
                    mock.patch("os.rmdir", side_effect=AssertionError("unexpected deletion")):
                receipt = native.retain_transport(spec, runtime)
            self.assertEqual(receipt["state"], prep.RETAINED_EVIDENCE)
            self.assertEqual(receipt["owner"], prep.OWNER)
            self.assertLessEqual(receipt["bytes"], 144 * 1024)
            self.assertEqual(len(receipt["files"]), 5)
            prep.terminal_retained_evidence(receipt, {"attempt_sha256": receipt["attempt_sha256"], "custody_due": receipt["custody_due"],
                    "reconciliation_ref": receipt["reconciliation_ref"], "transport_uid": os.getuid(), "transport_gid": os.getgid()})

    def test_bound_mutations_append_terminal_journal_without_unlink(self):
        with tempfile.TemporaryDirectory(prefix="dw-append-journal-fixture-") as directory:
            spec, runtime = transport_fixture(directory)
            with mock.patch("os.unlink", side_effect=AssertionError("unexpected journal deletion")):
                transport = native.TransportDirectory(spec, runtime)
                try:
                    for name in ("pull", "create-assemble"):
                        transport.write_pending({"operation": name, "nonce": runtime["nonce"]})
                        self.assertIsNotNone(transport.pending_operation())
                        transport.bind_operation(name, {"synthetic": True}, runtime["nonce"])
                        self.assertIsNone(transport.pending_operation())
                    self.assertEqual([r["operation"] for r in transport.results()], ["pull", "create-assemble"])
                finally:
                    transport.close()

    def test_clean_environment_has_no_ambient_credentials_or_proxy(self):
        with mock.patch.dict(os.environ, {"GH_TOKEN": "synthetic", "HTTPS_PROXY": "synthetic",
                                         "NODE_OPTIONS": "synthetic", "SSH_AUTH_SOCK": "synthetic"}):
            environment = native.clean_environment(Path("/synthetic-public-input"))
        self.assertTrue(set(environment).isdisjoint({"GH_TOKEN", "HTTPS_PROXY", "NODE_OPTIONS", "SSH_AUTH_SOCK"}))
        self.assertEqual(environment["DOCKER_CONFIG"], "/synthetic-public-input/docker")

    def test_effective_unit_source_limits_and_readiness_are_required(self):
        runtime = {"deadline": __import__("time").monotonic() + 30}
        modules = {"rust_preparation": b"core", "rust_preparation_platform": b"platform", "rust_preparation_authority": b"authority"}
        values = {"ActiveState": "active", "RuntimeMaxUSec": 600000000,
                  "TimeoutStopUSec": 15000000, "KillMode": "control-group", "Restart": "no",
                  "MemoryMax": 1024 * prep.MIB, "TasksMax": 64, "UMask": 0o77,
                  "CPUQuotaPerSecUSec": 1000000, "MainPID": os.getpid()}
        for key, mode in (("ExecStart", "worker"), ("ExecStopPost", "cleanup")):
            values[key] = [[native.ENV, native.unit_argv(mode, {}, runtime, modules)]]
        def value(_runner, _path, _interface, name):
            return values[name]
        with mock.patch.object(native, "service_path", return_value="/synthetic-unit"), \
                mock.patch.object(native, "bus_value", side_effect=value):
            native.check_supervisor(None, {}, runtime, modules)
            for name, bad in (("ExecStopPost", []), ("RuntimeMaxUSec", 0),
                              ("ActiveState", "dead"), ("TasksMax", 0)):
                original = values[name]
                values[name] = bad
                with self.subTest(name=name), self.assertRaises(prep.Refusal):
                    native.check_supervisor(None, {}, runtime, modules)
                values[name] = original

    def test_unit_environment_is_cleared_before_both_interpreters(self):
        runtime = {"nonce": "a" * 64, "deadline": 1}
        modules = {"rust_preparation": b"source", "rust_preparation_platform": b"platform", "rust_preparation_authority": b"authority"}
        for mode in ("worker", "cleanup"):
            argv = native.unit_argv(mode, {"staging_path": "/synthetic"}, runtime, modules)
            self.assertEqual(argv[:2], [native.ENV, "-i"])
            self.assertLess(argv.index("-i"), argv.index(native.PYTHON))
            self.assertIn("HOME=/synthetic/home", argv)
            self.assertIn("-S", argv)

    def test_readback_refuses_owner_and_permission_drift_not_just_file_bytes(self):
        output = io.BytesIO()
        with tarfile.open(fileobj=output, mode="w") as value:
            info = tarfile.TarInfo("packet/file")
            info.uid = info.gid = 1000
            info.mode = 0o444
            info.size = 1
            value.addfile(info, io.BytesIO(b"x"))
        raw = output.getvalue()
        native.validate_readback_metadata(raw)
        for owner, mode in ((0, 0o444), (1000, 0o644)):
            changed = io.BytesIO()
            with tarfile.open(fileobj=changed, mode="w") as value:
                info.uid = owner
                info.mode = mode
                value.addfile(info, io.BytesIO(b"x"))
            changed_raw = changed.getvalue()
            with self.assertRaises(prep.Refusal):
                native.validate_readback_metadata(changed_raw)

    def test_capture_and_transport_happen_only_after_supervisor_readback(self):
        events = []
        class Effects:
            def __init__(self, *_args):
                pass
            def supervisor_ready(self):
                events.append("supervised")
        def transport(*_args):
            events.append("transport")
            raise prep.Refusal("fixture-stop")
        with mock.patch.object(native, "runtime_identity"), mock.patch.object(native, "LiveEffects", Effects), \
                mock.patch.object(native, "create_transport", side_effect=transport):
            with self.assertRaises(prep.Refusal):
                native.run_worker({}, {"nonce": "a" * 64}, {})
        self.assertEqual(events, ["supervised", "transport"])

    def test_cleanup_entrypoint_requires_actual_stop_pid_and_exact_captured_command(self):
        runtime = {"nonce": "a" * 64, "deadline": 1}
        modules = {"rust_preparation": b"source", "rust_preparation_platform": b"platform", "rust_preparation_authority": b"authority"}
        values = {"ControlPID": os.getpid(), "ActiveState": "deactivating",
                  "ExecStopPost": [[native.ENV, native.unit_argv("cleanup", {}, runtime, modules)]]}
        def value(_runner, _path, _interface, name):
            return values[name]
        with mock.patch.object(native, "service_path", return_value="/synthetic-unit"), \
                mock.patch.object(native, "bus_value", side_effect=value):
            native.check_stop_authority(None, {}, runtime, modules)
            for field, wrong in (("ControlPID", -1), ("ActiveState", "active"), ("ExecStopPost", [])):
                original = values[field]
                values[field] = wrong
                with self.subTest(field=field), self.assertRaises(prep.Refusal):
                    native.check_stop_authority(None, {}, runtime, modules)
                values[field] = original

    def test_admission_binds_fresh_metadata_modes_subject_and_executor(self):
        now = dt.datetime(2026, 11, 5, tzinfo=dt.timezone.utc)
        binding = {"path": "/synthetic/zip", "uid": os.getuid(), "gid": os.getgid(), "mode": 0o600,
                   "parent_mode": 0o700, "bytes": prep.ZIP_BYTES, "sha256": prep.ZIP_SHA}
        metadata = {**prep.SUBJECT, "deployment_id": 7564108107, "event": "push", "branch": "main",
                    "attempt": 1, "run_conclusion": "success", "deployment_state": "success"}
        spec = {"artifact_handoff": binding, "packet_bindings": {name: dict(binding) for name in
                (*prep.PACKET_MEMBERS, "rust-local-browser-packet.json")}, "staging_path": "/synthetic/staging",
                "uid": os.getuid(), "gid": os.getgid(), "docker_root": "/synthetic/docker",
                "metadata_at": now.isoformat(), "metadata_expires": prep.SUBJECT_EXPIRY, "metadata_subject": metadata,
                "live_build_sha256": "3e8d1827d1df8bf3c47ee8f0efcbd2f3692cb1bd8741f40c1271ef5c74f4a183",
                "python_sha256": "f" * 64, "env_sha256": "e" * 64, "authority_binding": dict(binding),
                "retention": {"owner": prep.OWNER, "custody_due": (now + dt.timedelta(hours=23)).isoformat(),
                              "reconciliation_ref": "https://github.com/durable-workflow/durable-workflow.github.io/pull/480#issuecomment-1"}}
        native.admission(spec, now)
        invalid = []
        bad = copy.deepcopy(spec)
        bad["metadata_at"] = (now - dt.timedelta(minutes=10)).isoformat()
        invalid.append(bad)
        bad = copy.deepcopy(spec)
        bad["metadata_subject"]["artifact_id"] = 1
        invalid.append(bad)
        bad = copy.deepcopy(spec)
        bad["artifact_handoff"]["mode"] = 0o666
        invalid.append(bad)
        bad = copy.deepcopy(spec)
        bad["uid"] += 1
        invalid.append(bad)
        for candidate in invalid:
            with self.assertRaises(prep.Refusal):
                native.admission(candidate, now)


if __name__ == "__main__":
    unittest.main()
