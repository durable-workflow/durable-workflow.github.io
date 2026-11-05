# Bounded preparation controller source

This implements the source-only commission after
[Docs #479](https://github.com/durable-workflow/durable-workflow.github.io/pull/479#issuecomment-6649284339).
The [reviewed design](rust-preparation-proposal.md) remains authoritative.
`rust_preparation.py` contains input authentication and allocation/cleanup
rules. `rust_preparation_platform.py` contains the guarded Linux adapter.
`test_rust_preparation.py` exercises them with synthetic files/archives,
in-memory seal operations, a fake daemon and a fake service manager.

**Operational admission remains `None`.** CLI and native entrypoints refuse
before any acquisition, memory seal, service, Docker/image, Node/browser or
provider effect. There is no command-line or environment bypass. The source
does not accept a real handoff, prepare an image or qualify the host runtime.
No controller invocation or filesystem path is approved by these source files.

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

Only a separately reviewed source/invocation change can bind
`OPERATION_ADMISSION` to the canonical admitted-spec SHA-256. No such hash is
set. The external preloader supplies the two authenticated module byte buffers
as `_VERIFIED_MODULES` and installs the platform module from those buffers,
binding `VERIFIED_SOURCE_SHA256` before `cli()`. Normal source tests do not do
this with operational admission enabled.

The future unit command captures both verified module buffers in its argument
payload. Worker and independent stop command compile those captured bytes,
with isolated Python, site startup disabled and no bytecode writes. They do not
read controller code from mutable host paths after registration. Effective unit
commands, deadlines, limits and active state are read back before allocation.
No service has been registered or read back by this implementation's tests.

The controller records a pending daemon operation before issuing its request.
A killed/timed-out client leaves that record unresolved. Cleanup still removes
only independently discovered nonce-owned containers, but reports daemon
terminal state unknown and retains bounded evidence. It does not claim a
successful cleanup or allow another phase merely because a client stopped.
Unknown native work requires General's decision and independent reconciliation.

The worker's image receipt explicitly leaves cleanup pending. Independent stop
cleanup must complete before preparation acceptance. Derived images remain
local and reviewed by full content ID; no browser execution or publication
follows. All public policy flags remain false and browser outcome not-run.
