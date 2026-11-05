# Bounded preparation controller source

This implements the source-only commission after
[Docs #479](https://github.com/durable-workflow/durable-workflow.github.io/pull/479#issuecomment-6649284339).
The [reviewed design](rust-preparation-proposal.md) remains authoritative.
`rust_preparation.py` contains input authentication and allocation/cleanup
rules. `rust_preparation_platform.py` contains the guarded Linux adapter.
`rust_preparation_authority.py` verifies a separately reviewed installed-tool,
runtime, manager and daemon catalog; no real catalog is supplied or admitted.
`test_rust_preparation.py` exercises them with synthetic files/archives,
in-memory seal operations, a fake daemon and a fake service manager.

**Operational and installed-authority admissions remain `None`.** CLI and native entrypoints refuse
before any acquisition, memory seal, service, Docker/image, Node/browser or
provider effect. There is no command-line or environment bypass. The source
does not accept a real handoff, prepare an image or qualify the host runtime.
No controller invocation or filesystem path is approved by these source files.
The current suite has 39 test methods, including the per-edge fault subcases.
Security's source/executable HOLD remains in force pending review of these
corrections: durable mutation binding, descriptor cleanup, installed authority
and the joined terminal collector.

Run the source controls with Python 3.11 or later on Linux:

```sh
python3 -I -S -B -m unittest discover -s security/browser-headers -p test_rust_preparation.py -v
```

The controls load only the Python controller and standard library. They read
the existing browser packet as data, never import a Node module, and never call
the real process, network, kernel-seal or Docker/service adapters. Their unsafe
baselines are explicitly labelled test countermodels, not historical browser
or preparation runs. Fake lifecycle success is not native lifecycle acceptance.

## Before any later operation

Security must review the exact source and fault controls. General separately
binds the host/principal, complete trusted interpreter/runtime and existing
user-manager capabilities; exact authenticated predownloaded ZIP metadata;
fresh protected-run/deployment/live receipt; nine packet-file bindings; staging
and Docker-filesystem locations; competing work and capacity; and one invocation.
Those private fields are deliberately absent here. Missing/expired/unbound
fields stop the attempt. The current artifact still expires November 6 at
03:10:05 UTC and may require a fresh source retarget before any decision.

`rust-preparation-source.json` records the exact source closure. A trusted
external isolated Python preloader must first authenticate that manifest against
the SHA-256 copied from the reviewed GitHub record, then authenticate every
member before compiling any controller/platform code. Capture and execute the
same verified byte buffers. Do not import a worktree module for verification,
reopen a verified code path, or add modules to the execution closure.

The following literal preloader is source-only and is **not an operation
invocation**. Copy it from the reviewed GitHub record, never an unverified task
file. Its directory argument must contain only the manifest and its four
members. It authenticates all members before compiling the three controller modules
and refuses an operational admission value. No such staging directory is
created here. The current trusted manifest SHA is pinned in the code below.

```sh
/usr/bin/python3 -I -S -B - "$controller_source_directory" <<'PY'
import hashlib, json, os, pwd, stat, sys, types
from pathlib import Path

root = Path(sys.argv[1])
if not (root.is_absolute() and root.resolve() == root and root.is_dir()):
    raise RuntimeError('source-root')
if root.is_relative_to(Path(pwd.getpwuid(os.getuid()).pw_dir)):
    raise RuntimeError('source-home')
names = {'rust_preparation.py', 'rust_preparation_platform.py', 'rust_preparation_authority.py', 'test_rust_preparation.py'}
root_fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
try:
    for part in root.parts[1:]:
        next_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=root_fd)
        os.close(root_fd)
        root_fd = next_fd
    if set(os.listdir(root_fd)) != names | {'rust-preparation-source.json'}:
        raise RuntimeError('source-closure')
except BaseException:
    os.close(root_fd)
    raise
def capture(name, limit):
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=root_fd)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size > limit:
            raise RuntimeError('source-member')
        with os.fdopen(os.dup(fd), 'rb') as stream:
            raw = stream.read(limit + 1)
        if len(raw) > limit:
            raise RuntimeError('source-limit')
        return raw
    finally:
        os.close(fd)
try:
    raw = capture('rust-preparation-source.json', 16384)
    expected_manifest = 'e93ca5757420fd47ce7d6b0cad35b86fab6dbec0943991e4f5d6871ecd0d2c29'
    if hashlib.sha256(raw).hexdigest() != expected_manifest:
        raise RuntimeError('source-manifest-hash')
    manifest = json.loads(raw)
    if manifest['status'] != 'source-only' or manifest['operation_admission'] is not None or manifest['installed_authority_admission'] is not None or set(manifest['files']) != names:
        raise RuntimeError('source-status')
    captured = {name: capture(name, 262144) for name in names}
    if any(hashlib.sha256(captured[n]).hexdigest() != manifest['files'][n] for n in names):
        raise RuntimeError('source-member-hash')
finally:
    os.close(root_fd)
modules = {}
for name in ('rust_preparation', 'rust_preparation_authority', 'rust_preparation_platform'):
    module = types.ModuleType(name)
    sys.modules[name] = module
    exec(compile(captured[name + '.py'], '<verified-preparation-source>', 'exec'), module.__dict__)
    modules[name] = module
controller = modules['rust_preparation']
controller._VERIFIED_MODULES = {n: captured[n + '.py'] for n in modules}
modules['rust_preparation_authority'].VERIFIED_SOURCE_SHA256 = hashlib.sha256(captured['rust_preparation_authority.py']).hexdigest()
modules['rust_preparation_platform'].VERIFIED_SOURCE_SHA256 = hashlib.sha256(captured['rust_preparation_platform.py']).hexdigest()
if controller.OPERATION_ADMISSION is not None or modules['rust_preparation_authority'].AUTHORITY_ADMISSION is not None:
    raise RuntimeError('operation-remains-held')
sys.argv = ['<verified-controller>']
raise SystemExit(controller.cli())
PY
```

Only a separately reviewed source/invocation change can bind
`OPERATION_ADMISSION` to the canonical admitted-spec SHA-256. No such hash is
set. Installed authority requires its own independently reviewed manifest hash
in `AUTHORITY_ADMISSION`; no such manifest or hash is supplied. The external
preloader supplies the three authenticated module byte buffers
as `_VERIFIED_MODULES` and installs the authority/platform modules from those buffers,
binding `VERIFIED_SOURCE_SHA256` before `cli()`. Normal source tests do not do
this with operational admission enabled.

The future unit command captures all three verified module buffers in its argument
payload. Worker and independent stop command compile those captured bytes,
with isolated Python, site startup disabled and no bytecode writes. They do not
read controller code from mutable host paths after registration. Effective unit
commands, deadlines, limits and active state are read back before allocation.
An explicit `env -i` boundary prevents the manager's inherited credentials,
proxy or startup settings from reaching the worker and stop interpreter.
The independent stop command is registered before transport directories are
created. A partial private transport without its completed ownership record
is unresolved evidence, not permission to delete an unverified directory.
Worker readiness binds the effective main PID and running interpreter; stop
cleanup binds the effective control PID and exact captured stop command.
Creation-window drift prevents use but cannot prevent nonce-owned cleanup.
No service has been registered or read back by this implementation's tests.

The controller records a pending daemon operation before issuing its request.
A killed/timed-out client leaves that record unresolved. Cleanup still removes
only independently discovered nonce-owned containers, but reports daemon
terminal state unknown and retains bounded evidence. It does not claim a
successful cleanup or allow another phase merely because a client stopped.
Unknown native work requires General's decision and independent reconciliation.
CLI exit zero does not clear a mutation journal. Typed returned identity and
independent readback must be durably appended and synced before pending state
can clear. Copy readback is verified before commit as well as after the image
snapshot. Malformed output or loss between exit and persistence stays unresolved.

Transport cleanup opens and binds one directory descriptor, including its
ownership record, and uses held descriptors for enumeration and deletion.
A namespace swap preserves the replacement tree and returns unresolved evidence.
The original directory's device/inode remains the bound identity throughout.

The installed-authority manifest must come from an independent complete-loader
and package review. It binds a boot generation, exact entry aliases and resolved
ELF bytes for Python, env, Docker, busctl and systemd-run; full catalog membership
and bytes for their reviewed library/runtime roots; loader configuration and
package receipts; and the complete effective isolated Python search path.
Every tool must use the whole pinned catalog. Additional members, changed bytes,
an unbound search root or an incomplete outer receipt refuse use. Root-owned
non-writable files and ancestors are required. Repeated reads cache hashes only
under unchanged kernel metadata, while reopening files and checking membership.
The initial isolated interpreter and this observer still require the outer
trusted runtime review before they may consume that manifest.

Both worker and stop repeat this installed identity check. Manager/daemon PIDs,
start ticks, user IDs, executable and loaded-file paths bind the processes;
the manager's actual D-Bus owner PID and the Docker socket's kernel peer PID
must match. Command execution uses a checked open ELF descriptor. Socket,
catalog or process replacement refuses further native requests. This is an
implementation for later exact host review, not acceptance of any installed
host/runtime, package catalog, service-manager or daemon instance.

The worker's image receipt explicitly leaves cleanup pending. The independent
launcher waits for the unit and captures both worker and stop output through
finite pipes, then joins exactly two terminal records. It binds invocation,
attempt/source/authority/command hashes and distinct main/control PIDs; actual
worker exit and cleanup status; exact base/dependency identities; seal proof,
image/config/layer identities and readback; durably bound operations; no pending
work or owned survivors; foreign-container preservation; and transport removal.
Lost/duplicate/spliced output, nonzero wait, malformed identities or unresolved
cleanup cannot yield a preparation receipt. Collector loss leaves no acceptance;
independent stop cleanup remains the service manager's responsibility.

Only that combined receipt can report prepared inputs. Derived images remain
local and bound by full content ID. No browser execution or publication follows.
All public policy flags remain false and browser outcome not-run.
