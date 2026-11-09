"""Refuse tracked operator-local settings without reading their contents."""

from __future__ import annotations

import os
import subprocess
import sys


FORBIDDEN = b".claude/settings.local.json"


def git_output(*arguments: str) -> bytes:
    return subprocess.run(
        ["git", *arguments],
        check=True,
        stdout=subprocess.PIPE,
    ).stdout


def main() -> int:
    repository = os.fsdecode(git_output("rev-parse", "--show-toplevel").rstrip(b"\n"))
    tracked = git_output("-C", repository, "ls-files", "-z", "--")
    refused = False
    for path in tracked.split(b"\0"):
        if path == FORBIDDEN or path.endswith(b"/" + FORBIDDEN):
            display = os.fsdecode(path)
            print(
                f"public-boundary: forbidden project-local settings path: {display!r}",
                file=sys.stderr,
            )
            refused = True
    return int(refused)


if __name__ == "__main__":
    raise SystemExit(main())
