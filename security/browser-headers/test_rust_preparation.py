"""Inert controls: synthetic archives/records and fake daemon/supervisor only.

Unsafe baselines below are explicit test countermodels, not historical runs.
No seal, socket, network, service, image or container is created by this suite.
"""

import copy
import dataclasses
import hashlib
import io
import json
import os
from pathlib import Path
import stat
import tarfile
import tempfile
import unittest
from unittest import mock

import rust_preparation as prep
import rust_preparation_platform as native


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
        self.edge("copy-before")
        self.edge("copy-after")

    def commit(self, _cid):
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
        return self.uncertain


def allocation(cid, owner, role, image=prep.BASE_ID):
    return {"Id": cid, "Name": "/" + owner.name(role), "Image": image,
            "Config": {"Labels": owner.labels(role), "Cmd": ["/bin/false"], "Entrypoint": None},
            "State": {"Status": "created", "Running": False}, "Mounts": [],
            "HostConfig": {"NetworkMode": "none", "ReadonlyRootfs": role == "verify",
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
        with self.assertRaises(prep.Refusal):
            prep.packet_from_entries(tuple(mutated))
        with self.assertRaises(prep.Refusal):
            prep.packet_from_entries(entries + (prep.Entry("node_modules/shadow", b"x"),))

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
            with self.subTest(members=members), self.assertRaises(prep.Refusal):
                prep.tar_entries(archive(members), "package")
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
                   for name in ("rust_preparation", "rust_preparation_platform")}
        with mock.patch.dict("sys.modules"), mock.patch("builtins.print"), \
                mock.patch("subprocess.Popen", side_effect=AssertionError("unexpected process")), \
                mock.patch("os.memfd_create", side_effect=AssertionError("unexpected seal")):
            with self.assertRaises(SystemExit) as result:
                exec(native.unit_stub(modules), {})
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
            spec = {"staging_path": directory}
            runtime = {"nonce": "a" * 64, "deadline": __import__("time").monotonic() + 30}
            pending = Path(directory) / "pending-operation.json"
            class Runner:
                def run(self, *_args, **_kwargs):
                    if not pending.is_file():
                        raise AssertionError("daemon request preceded journal")
                    raise prep.Refusal("command-timeout")
            with mock.patch.object(prep, "OPERATION_ADMISSION", "e" * 64):
                effects = native.LiveEffects(spec, runtime, {}, Runner())
                with mock.patch.object(effects, "supervisor_ready"):
                    with self.assertRaises(prep.Refusal):
                        effects.command(["create"], mutation="create-assemble")
                self.assertTrue(effects.uncertain_daemon_operation())
                self.assertEqual(json.loads(pending.read_bytes())["operation"], "create-assemble")

    def test_clean_environment_has_no_ambient_credentials_or_proxy(self):
        with mock.patch.dict(os.environ, {"GH_TOKEN": "synthetic", "HTTPS_PROXY": "synthetic",
                                         "NODE_OPTIONS": "synthetic", "SSH_AUTH_SOCK": "synthetic"}):
            environment = native.clean_environment(Path("/synthetic-public-input"))
        self.assertTrue(set(environment).isdisjoint({"GH_TOKEN", "HTTPS_PROXY", "NODE_OPTIONS", "SSH_AUTH_SOCK"}))
        self.assertEqual(environment["DOCKER_CONFIG"], "/synthetic-public-input/docker")

    def test_effective_unit_source_limits_and_readiness_are_required(self):
        runtime = {"deadline": __import__("time").monotonic() + 30}
        modules = {"rust_preparation": b"core", "rust_preparation_platform": b"platform"}
        values = {"ActiveState": "active", "RuntimeMaxUSec": 600000000,
                  "TimeoutStopUSec": 15000000, "KillMode": "control-group", "Restart": "no",
                  "MemoryMax": 1024 * prep.MIB, "TasksMax": 64, "UMask": 0o77,
                  "CPUQuotaPerSecUSec": 1000000}
        for key, mode in (("ExecStart", "worker"), ("ExecStopPost", "cleanup")):
            values[key] = [[native.PYTHON, native.unit_argv(mode, {}, runtime, modules)]]
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


if __name__ == "__main__":
    unittest.main()
