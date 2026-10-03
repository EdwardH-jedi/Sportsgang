"""Run one verification command and record it next to its log.

    python3 docs/run-golf-v2/fix-evidence/record.py <phase>/<name> <cwd> -- <command...>

Writes fix-evidence/<phase>/<name>.log (combined stdout/stderr) and
<name>.json with command, cwd, exit code, elapsed seconds, tested HEAD and
whether tracked/untracked source differed from HEAD at run time (the
porcelain status digest identifies the exact uncommitted state). The
environment (database URLs, secrets) is inherited from the caller and is
never written out.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def main() -> int:
    name, cwd, sep, *command = sys.argv[1:]
    assert sep == "--", "usage: record.py <phase>/<name> <cwd> -- <command...>"
    log = OUT / f"{name}.log"
    log.parent.mkdir(parents=True, exist_ok=True)
    status = git("status", "--porcelain", "--untracked-files=all", "--", "apps", "packages")
    started = time.time()
    with log.open("w") as fh:
        code = subprocess.run(command, cwd=Path(cwd).resolve(), stdout=fh, stderr=subprocess.STDOUT).returncode
    record = {
        "name": name,
        "command": command,
        "cwd": str(Path(cwd).resolve().relative_to(ROOT)) or ".",
        "exit_code": code,
        "elapsed_seconds": round(time.time() - started, 2),
        "finished_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "head": git("rev-parse", "HEAD"),
        "source_dirty": bool(status),
        "source_status_sha256": hashlib.sha256(status.encode()).hexdigest() if status else None,
        "dirty_paths": status.splitlines() if status else [],
    }
    (OUT / f"{name}.json").write_text(json.dumps(record, indent=2) + "\n")
    print(json.dumps({k: record[k] for k in ("name", "exit_code", "head", "source_dirty")}))
    return code


if __name__ == "__main__":
    sys.exit(main())
