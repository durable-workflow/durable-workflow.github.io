"""Guarded Linux adapter. Import has no effects; admission is unset in source.

All native calls are behind rust_preparation.OPERATION_ADMISSION. Inert tests
inject a command runner and never instantiate the admitted native execution.
"""

import base64
import datetime as dt
import fcntl
import hashlib
import http.client
import json
import os
from pathlib import Path
import platform
import pwd
import re
import secrets
import selectors
import socket
import stat
import subprocess
import sys
import time
import zlib

import rust_preparation as core


UNIT = core.OWNER + "-rust-preparation.service"
SERVICE = "org.freedesktop.systemd1"
INTERFACE = SERVICE + ".Service"
UNIT_INTERFACE = SERVICE + ".Unit"
PYTHON = "/usr/bin/python3"
ENV = "/usr/bin/env"
DOCKER = "/usr/bin/docker"
BUSCTL = "/usr/bin/busctl"
SYSTEMD_RUN = "/usr/bin/systemd-run"
RUNTIME_LIMIT = 600
VERIFIED_SOURCE_SHA256 = None
OWNERSHIP_FILE = "ownership.json"


def admitted():
    core.require(isinstance(core.OPERATION_ADMISSION, str)
                 and re.fullmatch(core.HEX_64, core.OPERATION_ADMISSION) is not None, "preparation-unadmitted")


def encoded(value):
    return base64.b64encode(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).decode("ascii")


def decoded(value):
    core.require(len(value) <= 65536, "argument-limit")
    return core.strict_json(base64.b64decode(value, validate=True))


def admission(spec, now):
    required = {"artifact_handoff", "packet_bindings", "staging_path", "uid", "gid",
                "docker_root", "metadata_at", "metadata_expires", "metadata_subject",
                "live_build_sha256", "python_sha256", "env_sha256"}
    core.require(set(spec) == required, "admission-fields")
    core.require(type(spec["uid"]) is int and type(spec["gid"]) is int, "admission-owner")
    core.require((spec["uid"], spec["gid"]) == (os.getuid(), os.getgid()), "executor-owner")
    core.require(spec["artifact_handoff"]["bytes"] == core.ZIP_BYTES
                 and spec["artifact_handoff"]["sha256"] == core.ZIP_SHA, "admission-subject")
    expected_metadata = {**core.SUBJECT, "deployment_id": 7564108107, "event": "push", "branch": "main",
                         "attempt": 1, "run_conclusion": "success", "deployment_state": "success"}
    core.require(spec["metadata_subject"] == expected_metadata, "metadata-subject")
    core.require(set(spec["packet_bindings"]) == set(core.PACKET_MEMBERS) | {"rust-local-browser-packet.json"}, "admission-packet")
    core.require(spec["live_build_sha256"] == "3e8d1827d1df8bf3c47ee8f0efcbd2f3692cb1bd8741f40c1271ef5c74f4a183", "live-subject")
    observed = dt.datetime.fromisoformat(spec["metadata_at"])
    expiry = dt.datetime.fromisoformat(spec["metadata_expires"])
    core.require(0 <= (now - observed).total_seconds() <= 300, "stale-metadata")
    core.require(expiry == dt.datetime.fromisoformat(core.SUBJECT_EXPIRY)
                 and now + dt.timedelta(seconds=RUNTIME_LIMIT + 15) < expiry, "artifact-window")
    for path in (spec["staging_path"], spec["docker_root"]):
        core.require(re.fullmatch(r"/[A-Za-z0-9_./-]+", path) is not None, "native-path")
        core.require(str(Path(path)) == path and ".." not in Path(path).parts, "native-path")
    home = Path(pwd.getpwuid(os.getuid()).pw_dir)
    bindings = [spec["artifact_handoff"], *spec["packet_bindings"].values()]
    for binding in bindings:
        path = Path(binding["path"])
        core.require(path.is_absolute() and not path.is_relative_to(home), "credential-tree-input")
        core.require((binding["uid"], binding["gid"]) == (spec["uid"], spec["gid"]), "input-owner")
        core.require(binding["mode"] == 0o600 and binding["parent_mode"] == 0o700, "input-mode")


class CommandRunner:
    """Finite pipes; raw stderr is never included in a refusal or receipt."""

    def __init__(self, environment):
        self.environment = dict(environment)

    def run(self, args, timeout=15, limit=core.MIB, stdin=None):
        admitted()
        process = subprocess.Popen(args, stdin=stdin if stdin is not None else subprocess.DEVNULL,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=self.environment)
        output = bytearray()
        errors = 0
        deadline = time.monotonic() + timeout
        try:
            with selectors.DefaultSelector() as selector:
                selector.register(process.stdout, selectors.EVENT_READ, "stdout")
                selector.register(process.stderr, selectors.EVENT_READ, "stderr")
                while selector.get_map():
                    remaining = deadline - time.monotonic()
                    core.require(remaining > 0, "command-timeout")
                    for key, _event in selector.select(min(remaining, 0.25)):
                        chunk = os.read(key.fileobj.fileno(), 65536)
                        if not chunk:
                            selector.unregister(key.fileobj)
                        elif key.data == "stdout":
                            output.extend(chunk)
                            core.require(len(output) <= limit, "command-output-limit")
                        else:
                            errors += len(chunk)
                            core.require(errors <= 65536, "command-error-limit")
                code = process.wait(timeout=max(0.01, deadline - time.monotonic()))
                core.require(code == 0, "command-failed")
            return bytes(output)
        finally:
            if process.poll() is None:
                process.kill()
            process.wait()
            process.stdout.close()
            process.stderr.close()


class SealKernel:
    def create(self):
        admitted()
        return os.memfd_create("public-browser-input", os.MFD_CLOEXEC | os.MFD_ALLOW_SEALING)

    def write(self, fd, raw):
        with os.fdopen(os.dup(fd), "wb") as stream:
            stream.write(raw)

    def add_seals(self, fd, flags):
        fcntl.fcntl(fd, fcntl.F_ADD_SEALS, flags)

    def seals(self, fd):
        return fcntl.fcntl(fd, fcntl.F_GET_SEALS)

    def rewind(self, fd):
        os.lseek(fd, 0, os.SEEK_SET)

    def read(self, fd):
        return os.read(fd, core.MIB)

    def close(self, fd):
        os.close(fd)


class Seal:
    def __init__(self, raw, kernel=None):
        admitted()
        core.require(type(raw) is bytes and len(raw) <= core.TAR_LIMIT, "seal-input-limit")
        self.kernel = kernel or SealKernel()
        self.fd = self.kernel.create()
        try:
            self.kernel.write(self.fd, raw)
            self.flags = fcntl.F_SEAL_WRITE | fcntl.F_SEAL_GROW | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_SEAL
            self.kernel.add_seals(self.fd, self.flags)
            self.expected = core.digest(raw)
        except BaseException:
            self.kernel.close(self.fd)
            raise

    def verified_hash(self):
        core.require(self.kernel.seals(self.fd) == self.flags, "missing-seals")
        self.kernel.rewind(self.fd)
        observed = hashlib.sha256()
        while True:
            chunk = self.kernel.read(self.fd)
            if not chunk:
                break
            observed.update(chunk)
        self.kernel.rewind(self.fd)
        core.require(observed.hexdigest() == self.expected, "sealed-buffer-drift")
        return observed.hexdigest()

    def close(self):
        self.kernel.close(self.fd)


def fetch_dependency(name, runner):
    admitted()
    core.require(name in ("playwright", "playwright-core"), "dependency-name")
    url = "https://registry.npmjs.org/" + name + "/-/" + name + "-1.64.0.tgz"
    # The child has an absolute host deadline and finite pipes. A per-read
    # socket timeout alone would allow a slow response to renew its deadline.
    code = ("import sys,urllib.request\n"
            "class Stop(urllib.request.HTTPRedirectHandler):\n"
            " def redirect_request(self,*a,**k): raise RuntimeError('redirect')\n"
            "o=urllib.request.build_opener(urllib.request.ProxyHandler({}),Stop())\n"
            "u=" + repr(url) + "\n"
            "with o.open(urllib.request.Request(u,headers={'Accept-Encoding':'identity'}),timeout=30) as r:\n"
            " if r.status!=200 or r.url!=u: raise RuntimeError('response')\n"
            " b=r.read(16777217)\n"
            " if len(b)>16777216: raise RuntimeError('size')\n"
            " sys.stdout.buffer.write(b)\n")
    return runner.run([PYTHON, "-I", "-S", "-B", "-c", code], timeout=30, limit=16 * core.MIB)


def clean_environment(root):
    return {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8", "HOME": str(root / "home"),
            "DOCKER_CONFIG": str(root / "docker"), "DOCKER_HOST": "unix:///var/run/docker.sock",
            "XDG_RUNTIME_DIR": "/run/user/" + str(os.getuid()),
            "DBUS_SESSION_BUS_ADDRESS": "unix:path=/run/user/" + str(os.getuid()) + "/bus"}


def unit_stub(modules):
    packed = base64.b64encode(zlib.compress(json.dumps({k: base64.b64encode(v).decode("ascii")
                                                     for k, v in modules.items()}, sort_keys=True).encode())).decode("ascii")
    return ("import base64,json,sys,types,zlib; "
            "s={k:base64.b64decode(v) for k,v in json.loads(zlib.decompress(base64.b64decode('" + packed + "'))).items()}; "
            "c=types.ModuleType('rust_preparation');sys.modules[c.__name__]=c;exec(compile(s[c.__name__],'<reviewed-controller>','exec'),c.__dict__); "
            "p=types.ModuleType('rust_preparation_platform');sys.modules[p.__name__]=p;exec(compile(s[p.__name__],'<reviewed-platform>','exec'),p.__dict__); "
            "c._VERIFIED_MODULES=s;p.VERIFIED_SOURCE_SHA256=c.digest(s[p.__name__]);sys.exit(c.main())")


def unit_argv(mode, spec, runtime, modules):
    core.require(mode in ("worker", "cleanup"), "unit-mode")
    environment = clean_environment(Path(spec.get("staging_path", "/unbound-source-fixture")))
    assignments = [name + "=" + value for name, value in sorted(environment.items())]
    return [ENV, "-i", *assignments, PYTHON, "-I", "-S", "-B", "-c", unit_stub(modules), mode, encoded(spec), encoded(runtime)]


def stop_property(argv):
    # ':' disables systemd environment substitution; %% protects specifiers.
    quoted = ['"' + a.replace("\\", "\\\\").replace('"', '\\"').replace("%", "%%") + '"' for a in argv]
    return "ExecStopPost=:" + " ".join(quoted)


def bus_value(runner, path, interface, property_name):
    raw = runner.run([BUSCTL, "--user", "--json=short", "get-property", SERVICE, path, interface, property_name])
    value = core.strict_json(raw)
    core.require(set(value) == {"type", "data"}, "bus-property-shape")
    return value["data"]


def service_path(runner):
    raw = runner.run([BUSCTL, "--user", "--json=short", "call", SERVICE, "/org/freedesktop/systemd1",
                      SERVICE + ".Manager", "GetUnit", "s", UNIT])
    value = core.strict_json(raw)
    core.require(value["type"] == "o" and len(value["data"]) == 1, "unit-identity")
    return value["data"][0]


def check_supervisor(runner, spec, runtime, modules):
    path = service_path(runner)
    core.require(bus_value(runner, path, UNIT_INTERFACE, "ActiveState") == "active", "unit-inactive")
    expected = {"RuntimeMaxUSec": 600000000, "TimeoutStopUSec": 15000000,
                "KillMode": "control-group", "Restart": "no", "MemoryMax": 1024 * core.MIB,
                "TasksMax": 64, "UMask": 0o77, "CPUQuotaPerSecUSec": 1000000, "MainPID": os.getpid()}
    for name, value in expected.items():
        core.require(bus_value(runner, path, INTERFACE, name) == value, "unit-limit-drift")
    for property_name, mode in (("ExecStart", "worker"), ("ExecStopPost", "cleanup")):
        observed = bus_value(runner, path, INTERFACE, property_name)
        core.require(len(observed) == 1 and observed[0][0] == ENV
                     and observed[0][1] == unit_argv(mode, spec, runtime, modules), "unit-source-drift")
    core.require(time.monotonic() < runtime["deadline"], "whole-attempt-timeout")


def check_stop_authority(runner, spec, runtime, modules):
    path = service_path(runner)
    core.require(bus_value(runner, path, INTERFACE, "ControlPID") == os.getpid(), "cleanup-control-pid")
    core.require(bus_value(runner, path, UNIT_INTERFACE, "ActiveState") == "deactivating", "cleanup-unit-state")
    observed = bus_value(runner, path, INTERFACE, "ExecStopPost")
    core.require(len(observed) == 1 and observed[0][0] == ENV
                 and observed[0][1] == unit_argv("cleanup", spec, runtime, modules), "cleanup-source-authority")


def capacity(spec):
    core.require(platform.machine() == "x86_64" and platform.system() == "Linux", "host-platform")
    with open("/proc/meminfo", encoding="ascii") as source:
        available = next(int(line.split()[1]) * 1024 for line in source if line.startswith("MemAvailable:"))
    fs = os.statvfs(spec["docker_root"])
    core.require(available >= 4 * 1024 * core.MIB, "host-memory")
    core.require(fs.f_bavail * fs.f_frsize >= 20 * 1024 * core.MIB, "host-disk")
    core.require(os.getloadavg()[0] <= (os.cpu_count() or 1), "host-load")


class DockerConnection(http.client.HTTPConnection):
    def connect(self):
        admitted()
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect("/var/run/docker.sock")


class LiveEffects:
    def __init__(self, spec, runtime, modules, runner=None):
        admitted()
        self.spec, self.runtime, self.modules = spec, runtime, modules
        self.root = Path(spec["staging_path"])
        self.runner = runner or CommandRunner(clean_environment(self.root))
        self.pending = self.root / "pending-operation.json"
        self.ownership = core.Ownership(runtime["nonce"])

    def supervisor_ready(self):
        check_supervisor(self.runner, self.spec, self.runtime, self.modules)
        capacity(self.spec)
        core.require(not self.uncertain_daemon_operation(), "daemon-terminal-unknown")

    def command(self, args, timeout=15, limit=core.MIB, stdin=None, mutation=None):
        admitted()
        if mutation is not None:
            self.supervisor_ready()
            flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW
            with os.fdopen(os.open(self.pending, flags, 0o600), "wb") as journal:
                journal.write(json.dumps({"operation": mutation, "nonce": self.ownership.nonce}).encode())
                journal.flush()
                os.fsync(journal.fileno())
        remaining = max(0.01, self.runtime["deadline"] - time.monotonic())
        result = self.runner.run([DOCKER, *args], min(timeout, remaining), limit, stdin)
        if mutation is not None:
            self.pending.unlink()
        return result

    def discover(self, owner, role):
        args = ["container", "ls", "--all", "--no-trunc", "--filter", "name=^/" + owner.name(role) + "$"]
        for name, value in owner.labels(role).items():
            args += ["--filter", "label=" + name + "=" + value]
        return self.command([*args, "--format", "{{.ID}}"]).decode("ascii").split()

    def name_exists(self, name):
        raw = self.command(["container", "ls", "--all", "--filter", "name=^/" + name + "$", "--format", "{{.Names}}"])
        return bool(raw.strip())

    def inspect(self, cid):
        core.require(re.fullmatch(core.HEX_64, cid) is not None, "inspect-id")
        record = core.strict_json(self.command(["container", "inspect", cid]))[0]
        try:
            created = dt.datetime.fromisoformat(record["Created"].replace("Z", "+00:00"))
            start = dt.datetime.fromisoformat(self.runtime["started_at"])
            within = created.tzinfo is not None and 0 <= (created - start).total_seconds() <= RUNTIME_LIMIT
        except (ValueError, TypeError, KeyError):
            within = False
        record["WithinPreparationWindow"] = within
        return record

    def create(self, owner, role, image):
        args = ["create", "--pull=never", "--platform=linux/amd64", "--name", owner.name(role),
                "--network=none", "--cpus=1", "--memory=512m", "--pids-limit=64", "--init",
                "--cap-drop=ALL", "--security-opt=no-new-privileges:true", "--entrypoint", ""]
        if role == "verify":
            args += ["--read-only"]
        for name, value in owner.labels(role).items():
            args += ["--label", name + "=" + value]
        raw = self.command([*args, image, "/bin/false"], mutation="create-" + role)
        return raw.decode("ascii").strip()

    def remove(self, cid):
        # Independent cleanup has its own deadline; an unresolved journal does
        # not prevent removal of an independently verified owned container.
        core.require(re.fullmatch(core.HEX_64, cid) is not None, "remove-id")
        self.runner.run([DOCKER, "rm", "--force", cid], timeout=5)

    def uncertain_daemon_operation(self):
        return self.pending.exists() or self.pending.is_symlink()

    def seal(self, raw):
        return Seal(raw)

    def require_safe_prefixes(self, cid):
        for path in ("/packet", "/site", "/runtime"):
            connection = DockerConnection("localhost", timeout=5)
            try:
                connection.request("HEAD", "/containers/" + cid + "/archive?path=" + path)
                response = connection.getresponse()
                core.require(response.status == 404, "base-prefix-present-or-unknown")
                # A disappeared container must not turn an unknown prefix into
                # a successful ENOENT assumption.
                core.inspect_allocation(self.inspect(cid), self.ownership, "assemble", core.BASE_ID)
            finally:
                connection.close()

    def copy_sealed(self, cid, sealed):
        sealed.verified_hash()
        self.command(["cp", "-a", "-", cid + ":/"], timeout=60, stdin=sealed.fd, mutation="copy")

    def commit(self, cid):
        raw = self.command(["commit", "--pause=false", cid], timeout=60, mutation="commit")
        return raw.decode("ascii").strip()

    def image_inspect(self, image):
        core.require(re.fullmatch(core.IMAGE_ID, image) is not None, "inspect-image-id")
        return core.strict_json(self.command(["image", "inspect", image]))[0]

    def readback(self, cid):
        result = []
        for root in ("packet", "site", "runtime/node_modules"):
            raw = self.command(["cp", cid + ":/" + root, "-"], timeout=60, limit=core.TAR_LIMIT)
            validate_readback_metadata(raw)
            entries = core.tar_entries(raw)
            for entry in entries:
                name = "runtime/" + entry.path if root.startswith("runtime/") else entry.path
                result.append(core.Entry(name, entry.data, entry.mode))
        return tuple(sorted(result, key=lambda entry: entry.path))

    def acquire_base(self):
        info = core.strict_json(self.command(["info", "--format", "{{json .}}"]))
        core.require(not any(info.get(k) for k in ("HTTPProxy", "HTTPSProxy", "NoProxy")), "daemon-proxy")
        core.require(info["DockerRootDir"] == self.spec["docker_root"], "daemon-filesystem")
        self.command(["pull", "--platform=linux/amd64", core.BASE_IMAGE], timeout=240,
                     limit=4 * core.MIB, mutation="pull")
        record = self.image_inspect(core.BASE_ID)
        core.require(core.BASE_IMAGE in record["RepoDigests"] and record["Architecture"] == "amd64"
                     and record["Os"] == "linux" and record["Size"] <= 8 * 1024 * core.MIB, "base-image")
        core.require(not record["Config"].get("Volumes") and not record["Config"].get("OnBuild"), "base-hooks")
        return record["RootFS"]["Layers"]


def validate_readback_metadata(raw):
    import tarfile
    import io
    core.require(len(raw) <= core.TAR_LIMIT, "readback-limit")
    with tarfile.open(fileobj=io.BytesIO(raw), mode="r:") as archive:
        for member in archive:
            core.require(member.uid == 1000 and member.gid == 1000, "readback-owner")
            modes = (0o555,) if member.isdir() else (0o444, 0o555)
            core.require(member.mode in modes, "readback-mode")


def packet_capture(spec):
    entries = []
    for name, binding in spec["packet_bindings"].items():
        core.safe_name(name)
        raw = core.held_regular(binding["path"], binding)
        entries.append(core.Entry(name, raw))
    return tuple(entries)


def runtime_identity(spec):
    core.require((os.getuid(), os.getgid()) == (spec["uid"], spec["gid"]), "effective-executor")
    core.require(core.digest(Path("/proc/self/exe").read_bytes()) == spec["python_sha256"], "effective-interpreter")


def run_worker(spec, runtime, modules):
    runtime_identity(spec)
    effects = LiveEffects(spec, runtime, modules)
    effects.supervisor_ready()
    create_transport(spec, runtime["nonce"])
    packet = packet_capture(spec)
    inventory, lock = core.packet_from_entries(packet)
    binding = spec["artifact_handoff"]
    artifact = core.artifact_from_zip(core.held_regular(binding["path"], binding), inventory,
                                      dt.datetime.now(dt.timezone.utc))
    core.require(set(lock["packages"]) == {"", "node_modules/playwright", "node_modules/playwright-core"}, "lock-closure")
    dependencies = ()
    for name in ("playwright", "playwright-core"):
        effects.supervisor_ready()
        dependencies += core.dependency_entries(fetch_dependency(name, effects.runner), name, lock)
    raw, expected = core.public_tar(packet, artifact, dependencies)
    layers = effects.acquire_base()
    image = core.assemble(effects, effects.ownership, raw, expected, layers)
    print(json.dumps({"scope": "prepared-public-input-image-only", "image_id": image,
                      "input_tar_sha256": core.digest(raw), "files": len(expected),
                      "cleanup": "pending-independent-stop-path", "browser": "not-run"}))
    return 0


def create_transport(spec, nonce):
    admitted()
    root = Path(spec["staging_path"])
    home = Path(pwd.getpwuid(os.getuid()).pw_dir)
    core.require(not root.is_relative_to(home) and root.resolve() == root, "transport-location")
    core.require((os.getuid(), os.getgid()) == (spec["uid"], spec["gid"]), "executor-owner")
    root.mkdir(mode=0o700)
    for name in ("home", "docker"):
        (root / name).mkdir(mode=0o700)
    observed = root.stat()
    owner_record = {"nonce": nonce, "device": observed.st_dev, "inode": observed.st_ino}
    for name, raw in (("docker/config.json", b"{}"), (OWNERSHIP_FILE, json.dumps(owner_record).encode())):
        with os.fdopen(os.open(root / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), "wb") as file:
            file.write(raw)
    return owner_record


def cleanup_transport(spec, runtime):
    admitted()
    root = Path(spec["staging_path"])
    observed = root.lstat()
    core.require(stat.S_ISDIR(observed.st_mode) and not root.is_symlink(), "transport-identity")
    core.require(stat.S_IMODE(observed.st_mode) == 0o700 and observed.st_uid == spec["uid"], "transport-owner")
    descriptor = os.open(root / OWNERSHIP_FILE, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        record_stat = os.fstat(descriptor)
        core.require(stat.S_ISREG(record_stat.st_mode) and record_stat.st_nlink == 1
                     and stat.S_IMODE(record_stat.st_mode) == 0o600 and record_stat.st_uid == spec["uid"], "transport-record")
        owner_record = core.strict_json(os.read(descriptor, 4096))
    finally:
        os.close(descriptor)
    core.require(owner_record == {"nonce": runtime["nonce"], "device": observed.st_dev,
                                  "inode": observed.st_ino}, "transport-record-binding")
    expected = {"home", "docker", OWNERSHIP_FILE}
    core.require({p.name for p in root.iterdir()} == expected, "transport-extra-or-pending")
    for directory in (root / "home", root / "docker"):
        core.require(directory.is_dir() and not directory.is_symlink(), "transport-link")
    (root / "docker/config.json").unlink()
    (root / OWNERSHIP_FILE).unlink()
    (root / "docker").rmdir()
    (root / "home").rmdir()
    root.rmdir()


def launch(spec, modules):
    admitted()
    nonce = secrets.token_hex(32)
    runtime = {"nonce": nonce, "deadline": time.monotonic() + RUNTIME_LIMIT,
               "started_at": dt.datetime.now(dt.timezone.utc).isoformat()}
    runner = CommandRunner(clean_environment(Path(spec["staging_path"])))
    source = Path(PYTHON).read_bytes()
    core.require(core.digest(source) == spec["python_sha256"], "interpreter-identity")
    core.require(core.digest(Path(ENV).read_bytes()) == spec["env_sha256"], "environment-launcher-identity")
    core.require(not Path(spec["staging_path"]).exists() and not Path(spec["staging_path"]).is_symlink(), "transport-preexisting")
    worker = unit_argv("worker", spec, runtime, modules)
    stop = unit_argv("cleanup", spec, runtime, modules)
    args = [SYSTEMD_RUN, "--user", "--unit=" + UNIT, "--expand-environment=no", "--description=bounded-public-input-preparation",
            "--property=Type=exec", "--property=RuntimeMaxSec=600", "--property=TimeoutStopSec=15",
            "--property=KillMode=control-group", "--property=Restart=no", "--property=CPUQuota=100%",
            "--property=MemoryMax=1G", "--property=TasksMax=64", "--property=UMask=0077",
            "--property=" + stop_property(stop), *worker]
    # No pull/create occurs in this launcher. The worker reads back the installed
    # independent stop command and effective bounds before its first operation.
    runner.run(args, timeout=15)
    return 0


def entrypoint(argv, modules, admitted_hash):
    core.require(argv and argv[0] in ("launch", "worker", "cleanup"), "controller-mode")
    core.require(len(argv) == (2 if argv[0] == "launch" else 3), "controller-arguments")
    spec = decoded(argv[1])
    core.require(core.digest(json.dumps(spec, sort_keys=True, separators=(",", ":")).encode()) == admitted_hash, "unadmitted-invocation")
    if argv[0] != "cleanup":
        admission(spec, dt.datetime.now(dt.timezone.utc))
    if argv[0] == "launch":
        return launch(spec, modules)
    runtime = decoded(argv[2])
    core.Ownership(runtime["nonce"])
    if argv[0] == "worker":
        return run_worker(spec, runtime, modules)
    runner = CommandRunner(clean_environment(Path(spec["staging_path"])))
    check_stop_authority(runner, spec, runtime, modules)
    runtime = {**runtime, "deadline": time.monotonic() + 12}
    effects = LiveEffects(spec, runtime, modules)
    problems = core.cleanup(effects, effects.ownership)
    if not problems:
        cleanup_transport(spec, runtime)
    print(json.dumps({"cleanup": "complete" if not problems else "unresolved", "problems": problems,
                      "images": "retained-for-review-only", "browser": "not-run"}))
    return 0 if not problems else 1
