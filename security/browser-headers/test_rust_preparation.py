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
from pathlib import Path
import stat
import tarfile
import tempfile
import unittest
import zipfile
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
            with self.assertRaises(prep.Refusal):
                prep.artifact_from_zip(raw, inventory, now + dt.timedelta(days=2))
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
            names = ["rust-preparation-source.json", "rust_preparation.py", "rust_preparation_platform.py", "test_rust_preparation.py"]
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
        modules = {"rust_preparation": b"source", "rust_preparation_platform": b"platform"}
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
            with self.assertRaises(prep.Refusal):
                native.validate_readback_metadata(changed.getvalue())

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
        modules = {"rust_preparation": b"source", "rust_preparation_platform": b"platform"}
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
                "python_sha256": "f" * 64, "env_sha256": "e" * 64}
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
