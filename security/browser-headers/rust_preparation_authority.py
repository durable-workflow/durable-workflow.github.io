"""Finite installed authority, requiring its own independently reviewed digest.

No host catalog is supplied or admitted here. Import performs no observation.
The outer reviewer must establish that the catalog covers the complete loader,
configuration, package/runtime and Python search closure, not a chosen subset.
"""

import hashlib
import json
import os
from pathlib import Path
import socket
import stat
import struct
import sys

import rust_preparation as core


AUTHORITY_ADMISSION = None
TOOLS = frozenset(("python", "env", "docker", "busctl", "systemd-run"))
PROCESSES = frozenset(("manager", "daemon"))
ENTRY_PATHS = {"python": "/usr/bin/python3", "env": "/usr/bin/env", "docker": "/usr/bin/docker",
               "busctl": "/usr/bin/busctl", "systemd-run": "/usr/bin/systemd-run"}
LOADER_CONFIGS = frozenset(("/etc/ld.so.cache", "/etc/ld.so.conf", "/etc/nsswitch.conf"))
MAX_AUTHORITY_BYTES = 8 * 1024 * core.MIB


def native_admitted():
    core.require(isinstance(core.OPERATION_ADMISSION, str) and isinstance(AUTHORITY_ADMISSION, str), "installed-authority-unadmitted")


def canonical_bytes(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def catalog_schema(record):
    required = {"schema", "tools", "processes", "catalogs", "python_search", "socket", "closure_receipt",
                "loader_configs", "package_receipts", "boot_id"}
    core.require(set(record) == required and record["schema"] == "durable-workflow.installed-authority/v1", "authority-schema")
    core.require(set(record["tools"]) == TOOLS and set(record["processes"]) == PROCESSES, "authority-role-closure")
    core.require(record["catalogs"] and record["python_search"], "authority-runtime-closure")
    core.require(set(record["loader_configs"]) == LOADER_CONFIGS and record["package_receipts"], "authority-loader-packages")
    for path in record["package_receipts"]:
        core.require(any(path.startswith(root + "/") for root in ("/var/lib/dpkg", "/var/lib/rpm", "/usr/lib/sysimage/rpm")), "authority-package-path")
    core.require(set(record["closure_receipt"]) == {"independent_review", "package_catalog_sha256", "complete_loader_closure"}, "authority-outer-receipt")
    core.require(record["closure_receipt"]["complete_loader_closure"] is True
                 and record["closure_receipt"]["independent_review"], "authority-outer-review")
    core.require(core.digest(canonical_bytes(record["package_receipts"]))
                 == record["closure_receipt"]["package_catalog_sha256"], "authority-package-receipt")
    catalog_roots = set(record["catalogs"])
    for role, tool in record["tools"].items():
        core.require(tool["entry_path"] == ENTRY_PATHS[role], "authority-entry-role")
        # Completeness comes from the separately pinned outer receipt. A tool
        # cannot narrow that reviewed runtime footprint at invocation time.
        core.require(set(tool["runtime_roots"]) == catalog_roots, "authority-tool-runtime-subset")
        core.require(tool["binding"]["uid"] == 0 and not tool["binding"]["mode"] & 0o22, "authority-tool-writable")
    for path in record["python_search"]:
        core.require(any(path == root or path.startswith(root + "/") for root in catalog_roots), "authority-python-root-subset")


class HostAuthority:
    def __init__(self, raw, observer, expected_digest=None):
        expected = AUTHORITY_ADMISSION if expected_digest is None else expected_digest
        core.require(isinstance(expected, str) and core.digest(raw) == expected, "installed-authority-unadmitted")
        self.record = core.strict_json(raw)
        catalog_schema(self.record)
        self.digest = expected
        self.observer = observer
        self.verify()

    def verify(self):
        expected = self.record
        core.require(self.observer.boot_id() == expected["boot_id"], "authority-boot-drift")
        core.require(tuple(self.observer.python_search()) == tuple(expected["python_search"]), "effective-python-search-drift")
        for root, catalog in expected["catalogs"].items():
            core.require(self.observer.catalog(root) == catalog, "installed-runtime-catalog-drift")
        for role, tool in expected["tools"].items():
            core.require(self.observer.file(tool["binding"]["path"]) == tool["binding"], "installed-tool-drift")
            core.require(self.observer.resolve(tool["entry_path"]) == tool["binding"]["path"], "selected-tool-drift")
        for group in ("loader_configs", "package_receipts"):
            for path, binding in expected[group].items():
                core.require(self.observer.resolve(path) == binding["path"]
                             and self.observer.file(binding["path"]) == binding, "installed-configuration-drift")
        for role, process in expected["processes"].items():
            core.require(self.observer.process(process["pid"]) == process, "effective-process-drift")
            for path in process["mapped_files"]:
                core.require(any(path == root or path.startswith(root + "/") for root in expected["catalogs"])
                             or path in {t["binding"]["path"] for t in expected["tools"].values()}
                             or path in {p["exe"]["path"] for p in expected["processes"].values()}, "unbound-process-library")
        core.require(self.observer.socket_identity(expected["socket"]["path"]) == expected["socket"], "daemon-socket-drift")
        core.require(expected["socket"]["peer_pid"] == expected["processes"]["daemon"]["pid"], "socket-daemon-causality")

    def open_command(self, entry_path):
        self.verify()
        matches = [t for t in self.record["tools"].values() if t["entry_path"] == entry_path
                   or t["binding"]["path"] == entry_path]
        core.require(len(matches) == 1, "unbound-command")
        return self.observer.open_verified(matches[0]["binding"])

    def command_path(self, role):
        core.require(role in TOOLS, "unbound-command-role")
        return self.record["tools"][role]["binding"]["path"]


class NativeObserver:
    """Read-only outer evidence consumption; no commands or vault fallback."""

    def __init__(self):
        self.bytes_hashed = 0
        self.hash_cache = {}

    def boot_id(self):
        native_admitted()
        value = Path("/proc/sys/kernel/random/boot_id").read_text().strip()
        core.require(len(value) == 36, "authority-boot-id")
        return value

    def resolve(self, path):
        resolved = Path(path).resolve(strict=True)
        core.require(resolved.is_absolute(), "authority-canonical-path")
        return str(resolved)

    def _open(self, path):
        native_admitted()
        target = Path(path)
        core.require(target.is_absolute() and str(target) == self.resolve(path), "authority-file-path")
        descriptor = os.open("/", os.O_RDONLY | os.O_DIRECTORY)
        try:
            for part in target.parts[1:-1]:
                following = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=descriptor)
                os.close(descriptor)
                descriptor = following
                parent = os.fstat(descriptor)
                core.require(parent.st_uid == 0 and not parent.st_mode & 0o22, "authority-parent-writable")
            return os.open(target.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=descriptor)
        finally:
            os.close(descriptor)

    def _metadata(self, path, descriptor):
        info = os.fstat(descriptor)
        core.require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o22, "authority-file-writable")
        core.require(info.st_size <= 256 * core.MIB, "authority-file-limit")
        # Reviewed files and every ancestor are root-owned/non-writable by the
        # executor. Cache only bytes for an unchanged kernel stat identity;
        # still re-open and recheck membership/metadata on every observation.
        key = (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns,
               info.st_mode, info.st_uid, info.st_gid, info.st_nlink)
        sha256 = self.hash_cache.get(key)
        if sha256 is None:
            sha256 = self._hash(descriptor)
            core.require(os.fstat(descriptor) == info, "authority-file-changed-during-read")
            self.hash_cache[key] = sha256
        return {"path": path, "uid": info.st_uid, "gid": info.st_gid, "mode": stat.S_IMODE(info.st_mode),
                "device": info.st_dev, "inode": info.st_ino, "bytes": info.st_size, "sha256": sha256}

    def _hash(self, descriptor):
        observed = hashlib.sha256()
        os.lseek(descriptor, 0, os.SEEK_SET)
        while True:
            chunk = os.read(descriptor, core.MIB)
            if not chunk:
                break
            self.bytes_hashed += len(chunk)
            core.require(self.bytes_hashed <= MAX_AUTHORITY_BYTES, "authority-read-budget")
            observed.update(chunk)
        os.lseek(descriptor, 0, os.SEEK_SET)
        return observed.hexdigest()

    def file(self, path):
        descriptor = self._open(path)
        try:
            return self._metadata(path, descriptor)
        finally:
            os.close(descriptor)

    def open_verified(self, binding):
        descriptor = self._open(binding["path"])
        try:
            core.require(self._metadata(binding["path"], descriptor) == binding, "consumed-tool-drift")
            core.require(os.read(descriptor, 4) == b"\x7fELF", "authority-non-elf-tool")
            os.lseek(descriptor, 0, os.SEEK_SET)
            return descriptor
        except BaseException:
            os.close(descriptor)
            raise

    def python_search(self):
        return tuple(sys.path)

    def catalog(self, root):
        native_admitted()
        # Private/home/config/credential trees are never catalog inputs.
        path = Path(root)
        allowed = (Path("/usr/lib"), Path("/usr/local/lib"), Path("/etc/ld.so.conf.d"))
        core.require(path.is_absolute() and any(path == p or path.is_relative_to(p) for p in allowed), "authority-runtime-root")
        if not path.exists():
            core.require(not path.is_symlink(), "authority-missing-root-link")
            return {"kind": "absent"}
        if path.is_file():
            return {"kind": "file", "binding": self.file(root)}
        core.require(str(path.resolve()) == root and not path.is_symlink(), "authority-root-link")
        rows = {}
        for directory, dirs, files in os.walk(root, followlinks=False):
            info = os.lstat(directory)
            core.require(info.st_uid == 0 and not info.st_mode & 0o22, "authority-directory-writable")
            for name in sorted(dirs + files):
                member = Path(directory) / name
                relative = member.relative_to(path).as_posix()
                current = member.lstat()
                core.require(current.st_uid == 0, "authority-member-owner")
                if member.is_symlink():
                    target = member.resolve(strict=True)
                    core.require(target.is_relative_to(path), "authority-library-link-escape")
                    rows[relative] = {"kind": "link", "target": os.readlink(member)}
                elif member.is_file():
                    rows[relative] = {"kind": "file", "binding": self.file(str(member))}
                else:
                    core.require(member.is_dir(), "authority-special-file")
                    core.require(not current.st_mode & 0o22, "authority-member-writable")
                    rows[relative] = {"kind": "directory", "mode": stat.S_IMODE(current.st_mode)}
                core.require(len(rows) <= 100000, "authority-catalog-limit")
        return {"kind": "directory", "members": rows}

    def process(self, pid):
        native_admitted()
        core.require(type(pid) is int and pid > 1, "authority-process-pid")
        root = Path("/proc") / str(pid)
        text = (root / "stat").read_text()
        start = text[text.rfind(")") + 2:].split()[19]
        status = (root / "status").read_text().splitlines()
        uids = next([int(v) for v in line.split()[1:]] for line in status if line.startswith("Uid:"))
        exe = str((root / "exe").resolve(strict=True))
        mapped = set()
        for line in (root / "maps").read_text().splitlines():
            fields = line.split(maxsplit=5)
            if len(fields) == 6 and fields[5].startswith("/"):
                core.require(not fields[5].endswith(" (deleted)"), "authority-deleted-mapping")
                mapped.add(fields[5])
        return {"pid": pid, "start_ticks": start, "uids": uids, "exe": self.file(exe), "mapped_files": sorted(mapped)}

    def socket_identity(self, path):
        native_admitted()
        core.require(path == "/run/docker.sock" and str(Path(path).resolve()) == path, "authority-socket-path")
        info = os.lstat(path)
        core.require(stat.S_ISSOCK(info.st_mode), "authority-socket-type")
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
            connection.settimeout(5)
            connection.connect(path)
            pid, uid, gid = struct.unpack("3i", connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
        return {"path": path, "device": info.st_dev, "inode": info.st_ino, "uid": info.st_uid,
                "gid": info.st_gid, "mode": stat.S_IMODE(info.st_mode), "peer_pid": pid, "peer_uid": uid, "peer_gid": gid}
